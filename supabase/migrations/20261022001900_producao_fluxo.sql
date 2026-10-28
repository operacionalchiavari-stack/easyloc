create function producao_parametros_salvar(p_empresa uuid,p_config jsonb) returns void language plpgsql security definer set search_path=public as $$
declare d jsonb;s text;u text;c jsonb;
begin
 if not eh_membro_empresa(p_empresa) or not operacao_pode(p_empresa,'configuracoes.empresa.editar') then raise exception 'Sem permissão' using errcode='42501';end if;
 c:=producao_config(p_empresa)||p_config;
 if jsonb_typeof(p_config) is distinct from 'object' or jsonb_typeof(c->'material_incompleto')<>'boolean' or jsonb_typeof(c->'exige_conferencia')<>'boolean' then raise exception 'Parâmetros inválidos';end if;
 if jsonb_typeof(c->'dias')<>'array' or jsonb_array_length(c->'dias')=0 then raise exception 'Selecione os dias de funcionamento';end if;
 for d in select * from jsonb_array_elements(c->'dias') loop if (d#>>'{}')::int not between 0 and 6 then raise exception 'Dia inválido';end if;end loop;
 if (c->>'inicio')::time >= (c->>'fim')::time then raise exception 'Horário de abertura deve ser anterior ao fechamento';end if;
 if nullif(c->>'pausa_inicio','') is not null or nullif(c->>'pausa_fim','') is not null then
  if not coalesce(((c->>'inicio')::time<(c->>'pausa_inicio')::time and (c->>'pausa_inicio')::time<(c->>'pausa_fim')::time and (c->>'pausa_fim')::time<(c->>'fim')::time),false) then raise exception 'Intervalo deve ficar dentro do funcionamento';end if;
 end if;
 if (c->>'antecedencia_horas')::numeric not between 0 and 10000 then raise exception 'Antecedência inválida';end if;
 perform (x#>>'{}')::date from jsonb_array_elements(c->'feriados') x;
 foreach s in array array['pintura','forracao','personalizacao'] loop
  for u in select jsonb_array_elements_text(c->'responsaveis'->s) loop
   if not exists(select 1 from usuarios_empresas where empresa_id=p_empresa and user_id=u::uuid) then raise exception 'Responsável não pertence à empresa';end if;
  end loop;
 end loop;
 insert into producao_parametros(empresa_id,config) values(p_empresa,c) on conflict(empresa_id) do update set config=c,updated_at=now();
end $$;

create function producao_quadro(p_empresa uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r jsonb;
begin
 if not eh_membro_empresa(p_empresa) or not (operacao_pode(p_empresa,'producao.ordens.visualizar') or operacao_pode(p_empresa,'estoque.almoxarifado.visualizar') or operacao_pode(p_empresa,'configuracoes.empresa.editar')) then raise exception 'Sem permissão para consultar produção' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('pedido',jsonb_build_object('numero',p.numero_pedido,'cliente',p.cliente_nome,'evento',p.data_evento,'entrega',p.data_entrega,'local',p.local_nome,'status',p.status_comercial),
  'foto',i.foto_url,
  'etapas',(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('materiais',(select coalesce(jsonb_agg(to_jsonb(m) order by m.nome),'[]') from producao_materiais m where m.etapa_id=e.id),
    'pacotes',(select coalesce(jsonb_agg(to_jsonb(pa) order by pa.created_at desc),'[]') from producao_pacotes pa where pa.etapa_id=e.id)) order by e.grupo,e.ordem),'[]') from producao_etapas e where e.producao_item_id=t.id and e.estado<>'cancelada'))
  order by t.urgente desc,t.inicio_previsto,t.id),'[]') into r
 from producao_itens t join separacoes_pedidos p on p.id=t.pedido_id
 left join itens i on i.id::text=t.origem->>'item_id' and i.empresa_id=p_empresa where t.empresa_id=p_empresa;
 return jsonb_build_object('itens',r,'config',producao_config(p_empresa),'executar',producao_permite(p_empresa,'executar'),
 'almox',operacao_pode(p_empresa,'estoque.almoxarifado.movimentar'),
 'responsavel',jsonb_build_object('pintura',producao_permite(p_empresa,'autorizar','pintura'),'forracao',producao_permite(p_empresa,'autorizar','forracao'),'personalizacao',producao_permite(p_empresa,'autorizar','personalizacao')));
end $$;

create function producao_acao(p_empresa uuid,p_etapa uuid,p_acao text,p_motivo text default '') returns void
language plpgsql security definer set search_path=public as $$
declare e producao_etapas;t producao_itens;p separacoes_pedidos;c jsonb;lider boolean;antes text;
begin
 select i.* into t from producao_itens i join producao_etapas x on x.producao_item_id=i.id where x.id=p_etapa and i.empresa_id=p_empresa for update of i;
 if not found then raise exception 'Etapa não encontrada';end if;
 select * into e from producao_etapas where id=p_etapa for update;
 select * into p from separacoes_pedidos where id=t.pedido_id;
 if not eh_membro_empresa(p_empresa) then raise exception 'Sem acesso' using errcode='42501';end if;
 c:=producao_config(p_empresa);lider:=producao_permite(p_empresa,'autorizar',e.setor);antes:=e.estado;
 if p_acao in ('autorizar_prazo','conferir','urgencia','revisar','cancelar_revisao') then
  if not lider then raise exception 'Ação exige responsável autorizado da área' using errcode='42501';end if;
 else if not producao_permite(p_empresa,'executar') then raise exception 'Sem permissão para executar produção' using errcode='42501';end if;end if;
 if p_acao in ('urgencia','autorizar_prazo','pausar','revisar','cancelar_revisao') and length(trim(p_motivo))<5 then raise exception 'Informe a justificativa';end if;
 if p_acao='urgencia' then update producao_itens set urgente=not urgente,urgencia_motivo=p_motivo where id=t.id;
 elsif p_acao='autorizar_prazo' then update producao_etapas set prazo_autorizado=true where id=e.id;
 elsif p_acao in ('revisar','cancelar_revisao') then
  if not t.revisao then raise exception 'Não há revisão pendente';end if;
  if p_acao='cancelar_revisao' or coalesce((t.pendente->>'removido')::boolean,false) then
   update producao_itens set cancelado=true,revisao=false where id=t.id;
   update producao_etapas set estado='cancelada' where producao_item_id=t.id and estado<>'concluida';
   update producao_pacotes set estado='cancelado' where etapa_id in(select id from producao_etapas where producao_item_id=t.id) and estado='separado';
  else
   if (t.origem-'observacao')=(t.pendente-'observacao')
    and t.snapshot->>'entrega'=p.data_entrega::text
    and (t.snapshot->>'hora') is not distinct from (p.observacoes->>'horario_entrega')
    and t.snapshot->'personalizacao'=(select producao_cadastro_snapshot(pr) from personalizacoes pr where pr.id=(t.origem->>'personalizacao_id')::uuid)
    and t.snapshot->'materiais'=(select coalesce(jsonb_agg(to_jsonb(pi) order by pi.id),'[]') from personalizacoes_insumos pi where pi.personalizacao_id=(t.origem->>'personalizacao_id')::uuid)
    and ((t.snapshot->'config')-array['material_incompleto','exige_conferencia','responsaveis'])=(producao_config(p_empresa)-array['material_incompleto','exige_conferencia','responsaveis']) then
    update producao_itens set origem=t.pendente,snapshot=jsonb_set(snapshot,'{origem}',t.pendente),revisao=false,pendente=null where id=t.id;
   else
   -- Reconstruir após execução exige devolver os materiais recebidos; nada é sobrescrito silenciosamente.
   if exists(select 1 from producao_materiais m join producao_etapas x on x.id=m.etapa_id where x.producao_item_id=t.id and m.recebido>m.devolvido) then
    raise exception 'Devolva ou reconcilie os materiais recebidos antes de substituir a ordem';end if;
   if exists(select 1 from producao_etapas where producao_item_id=t.id and estado='concluida') then
    raise exception 'Há trabalho concluído. Preserve esta ordem e peça ao Comercial uma nova linha para o complemento';end if;
   update producao_pacotes set estado='cancelado' where etapa_id in(select id from producao_etapas where producao_item_id=t.id) and estado='separado';
   delete from producao_materiais where etapa_id in(select id from producao_etapas where producao_item_id=t.id);
   update producao_etapas set estado='cancelada' where producao_item_id=t.id;
   update producao_itens set origem=t.pendente where id=t.id;
   perform producao_montar(t.id);
   end if;
  end if;
 else
  if t.cancelado or t.revisao then raise exception 'Ordem bloqueada para revisão';end if;
  if p.status_comercial not in ('aprovado','enviado','finalizado') then raise exception 'Pré-reserva: aguarde a confirmação do Comercial';end if;
  if p_acao in ('iniciar','retomar') then
   if e.estado not in ('pendente','pausada') then raise exception 'Esta etapa não pode ser iniciada';end if;
   if e.horas<=0 then raise exception 'Cadastre o tempo de execução por peça';end if;
   if e.inicio_previsto<now() and not e.prazo_autorizado then raise exception 'Prazo insuficiente: solicite autorização do responsável da área';end if;
   if exists(select 1 from producao_etapas where producao_item_id=t.id and grupo<e.grupo and estado not in ('concluida','cancelada')) then raise exception 'Aguarde a conclusão da etapa anterior';end if;
   if not (c->>'material_incompleto')::boolean and exists(select 1 from producao_materiais m join producao_etapas x on x.id=m.etapa_id where x.producao_item_id=t.id and m.recebido-m.devolvido<m.necessario) then raise exception 'Aguardando recebimento de todos os materiais';end if;
   update producao_etapas set estado='execucao',responsavel=auth.uid(),iniciada_em=coalesce(iniciada_em,now()) where id=e.id;
  elsif p_acao='pausar' then
   if e.estado<>'execucao' then raise exception 'Etapa não está em execução';end if;
   update producao_etapas set estado='pausada',motivo=p_motivo where id=e.id;
  elsif p_acao='concluir' then
   if e.estado<>'execucao' then raise exception 'Etapa não está em execução';end if;
   update producao_etapas set estado=case when (c->>'exige_conferencia')::boolean then 'conferencia' else 'concluida' end,
    concluida_em=case when not (c->>'exige_conferencia')::boolean then now() end where id=e.id;
  elsif p_acao='conferir' then
   if e.estado<>'conferencia' then raise exception 'Etapa não aguarda conferência';end if;
   update producao_etapas set estado='concluida',concluida_em=now() where id=e.id;
  else raise exception 'Ação inválida';end if;
 end if;
 insert into producao_historico(empresa_id,pedido_id,etapa_id,acao,usuario_id,detalhes)
 values(p_empresa,p.id,e.id,p_acao,auth.uid(),jsonb_build_object('anterior',antes,'motivo',p_motivo));
end $$;

create function producao_separar(p_empresa uuid,p_etapa uuid,p_materiais jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare t producao_itens;p separacoes_pedidos;m producao_materiais;x jsonb;q numeric;ja numeric;disp numeric;pid uuid;
begin
 if not eh_membro_empresa(p_empresa) or not operacao_pode(p_empresa,'estoque.almoxarifado.movimentar') then raise exception 'Sem permissão do Almoxarifado' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('prod_stock:'||p_empresa,0));
 select i.* into t from producao_itens i join producao_etapas e on e.producao_item_id=i.id where e.id=p_etapa and i.empresa_id=p_empresa for update of i;
 if not found or t.cancelado or t.revisao then raise exception 'Ordem indisponível';end if;
 select * into p from separacoes_pedidos where id=t.pedido_id;
 if p.status_comercial not in ('aprovado','enviado','finalizado') then raise exception 'Pré-reserva: aguarde confirmação';end if;
 if jsonb_typeof(p_materiais)<>'array' or jsonb_array_length(p_materiais)=0 then raise exception 'Selecione os materiais do pacote';end if;
 if (select count(*) from jsonb_array_elements(p_materiais))<>(select count(distinct v->>'id') from jsonb_array_elements(p_materiais) v) then raise exception 'Material duplicado';end if;
 for x in select * from jsonb_array_elements(p_materiais) loop
  select * into m from producao_materiais where id=(x->>'id')::uuid and etapa_id=p_etapa and empresa_id=p_empresa for update;
  if not found or m.produto_id is null then raise exception 'Material sem vínculo no Almoxarifado';end if;
  q:=(x->>'quantidade')::numeric;if q is null or q<=0 then raise exception 'Quantidade inválida';end if;
  select coalesce(sum((v->>'quantidade')::numeric),0) into ja from producao_pacotes pa cross join lateral jsonb_array_elements(pa.materiais) v where pa.etapa_id=p_etapa and pa.estado='separado' and v->>'id'=m.id::text;
  if q>m.necessario-m.recebido+m.devolvido-ja then raise exception 'Quantidade acima da necessidade de %',m.nome;end if;
  select estoque_atual into disp from almox_produtos(p_empresa) where id=m.produto_id;
  select coalesce(sum((v->>'quantidade')::numeric),0) into ja from producao_pacotes pa cross join lateral jsonb_array_elements(pa.materiais) v
   join producao_materiais pm on pm.id::text=v->>'id' where pa.empresa_id=p_empresa and pa.estado='separado' and pm.produto_id=m.produto_id;
  if disp is null or (select sum((v->>'quantidade')::numeric) from jsonb_array_elements(p_materiais) v join producao_materiais pm on pm.id::text=v->>'id' where pm.produto_id=m.produto_id)>disp-ja then raise exception 'Estoque insuficiente para separar %',m.nome;end if;
 end loop;
 insert into producao_pacotes(empresa_id,etapa_id,materiais,separado_por) values(p_empresa,p_etapa,p_materiais,auth.uid()) returning id into pid;
 insert into producao_historico(empresa_id,pedido_id,etapa_id,acao,usuario_id,detalhes) values(p_empresa,p.id,p_etapa,'separar',auth.uid(),jsonb_build_object('pacote',pid,'materiais',p_materiais));
 return pid;
end $$;

create function producao_receber(p_empresa uuid,p_qr text,p_etapa uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare pa producao_pacotes;t producao_itens;p separacoes_pedidos;x jsonb;m producao_materiais;q numeric;eid uuid;
begin
 if not producao_permite(p_empresa,'executar') then raise exception 'Sem permissão para receber' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('prod_stock:'||p_empresa,0));
 select etapa_id into eid from producao_pacotes where empresa_id=p_empresa and qr=trim(p_qr);
 if eid is null or eid<>p_etapa then raise exception 'QR não pertence a esta etapa';end if;
 select i.* into t from producao_itens i join producao_etapas e on e.producao_item_id=i.id where e.id=eid for update of i;
 select * into pa from producao_pacotes where empresa_id=p_empresa and qr=trim(p_qr) for update;
 if pa.estado='recebido' then return jsonb_build_object('repetido',true,'mensagem','Pacote já recebido; nenhuma nova baixa realizada');end if;
 select * into p from separacoes_pedidos where id=t.pedido_id;
 if pa.estado<>'separado' or t.cancelado or t.revisao or p.status_comercial not in ('aprovado','enviado','finalizado') then raise exception 'Recebimento bloqueado: confira a confirmação e as alterações do pedido';end if;
 for x in select * from jsonb_array_elements(pa.materiais) loop
  select * into m from producao_materiais where id=(x->>'id')::uuid and empresa_id=p_empresa and etapa_id=eid for update;
  if not found then raise exception 'Material do pacote não encontrado';end if;
  q:=(x->>'quantidade')::numeric;
  perform almox_estoque_mover(p_empresa,m.produto_id,q,'saida',0,'PRODUCAO',auth.uid()::text,'','',
   'Pedido '||p.numero_pedido||' · etapa '||eid||' · pacote '||pa.id);
  update producao_materiais set recebido=recebido+q where id=m.id;
 end loop;
 update producao_pacotes set estado='recebido',recebido_em=now(),recebido_por=auth.uid() where id=pa.id;
 insert into producao_historico(empresa_id,pedido_id,etapa_id,acao,usuario_id,detalhes) values(p_empresa,p.id,eid,'receber',auth.uid(),jsonb_build_object('pacote',pa.id));
 return jsonb_build_object('repetido',false,'mensagem','Recebimento confirmado e baixa registrada');
end $$;

create function producao_devolver(p_empresa uuid,p_material uuid,p_quantidade numeric,p_motivo text) returns void
language plpgsql security definer set search_path=public as $$
declare m producao_materiais;t producao_itens;e producao_etapas;p separacoes_pedidos;
begin
 if not eh_membro_empresa(p_empresa) or not operacao_pode(p_empresa,'estoque.almoxarifado.movimentar') then raise exception 'Devolução exige conferência do Almoxarifado' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('prod_stock:'||p_empresa,0));
 select * into m from producao_materiais where id=p_material and empresa_id=p_empresa;
 if not found then raise exception 'Material não encontrado';end if;
 select * into e from producao_etapas where id=m.etapa_id;
 select * into t from producao_itens where id=e.producao_item_id for update;
 select * into m from producao_materiais where id=p_material for update;
 select * into p from separacoes_pedidos where id=t.pedido_id;
 if p_quantidade is null or p_quantidade<=0 or p_quantidade>m.recebido-m.devolvido or length(trim(p_motivo))<5 then raise exception 'Quantidade ou motivo da devolução inválido';end if;
 perform almox_estoque_mover(p_empresa,m.produto_id,p_quantidade,'entrada',0,'PRODUCAO_DEVOLUCAO',auth.uid()::text,'','',p_motivo||' · pedido '||p.numero_pedido);
 update producao_materiais set devolvido=devolvido+p_quantidade where id=m.id;
 insert into producao_historico(empresa_id,pedido_id,etapa_id,acao,usuario_id,detalhes) values(p_empresa,p.id,e.id,'devolver',auth.uid(),jsonb_build_object('material',m.id,'quantidade',p_quantidade,'motivo',p_motivo));
end $$;
revoke all on function producao_parametros_salvar(uuid,jsonb),producao_quadro(uuid),producao_acao(uuid,uuid,text,text),producao_separar(uuid,uuid,jsonb),producao_receber(uuid,text,uuid),producao_devolver(uuid,uuid,numeric,text) from public,anon;
grant execute on function producao_parametros_salvar(uuid,jsonb),producao_quadro(uuid),producao_acao(uuid,uuid,text,text),producao_separar(uuid,uuid,jsonb),producao_receber(uuid,text,uuid),producao_devolver(uuid,uuid,numeric,text) to authenticated;
