create or replace function producao_sincronizar(p_pedido uuid) returns void language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos;a jsonb;i jsonb;k text;v jsonb;actual producao_itens;pers personalizacoes;
 vistos text[]:='{}';pid uuid;mudou boolean;iniciou boolean;
begin
 select * into p from separacoes_pedidos where id=p_pedido for update;
 if not found then return;end if;
 if p.status_comercial not in ('pre_reserva','aprovado','enviado','finalizado') or p.encerrado_operacional_em is not null then
  for actual in select * from producao_itens where pedido_id=p.id and not cancelado loop
   update producao_itens set revisao=true,pendente='{"removido":true}' where id=actual.id;
   if not exists(select 1 from producao_etapas where producao_item_id=actual.id and iniciada_em is not null)
     and not exists(select 1 from producao_materiais m join producao_etapas e on e.id=m.etapa_id where e.producao_item_id=actual.id and m.recebido>0) then
    update producao_itens set cancelado=true,revisao=false where id=actual.id;
    update producao_etapas set estado='cancelada' where producao_item_id=actual.id;
    update producao_pacotes set estado='cancelado' where etapa_id in(select id from producao_etapas where producao_item_id=actual.id) and estado='separado';
   end if;
  end loop;return;
 end if;
 if p.data_entrega is null then return;end if;
 for a in select x from jsonb_array_elements(coalesce(p.observacoes->'projeto_comercial'->'dados'->'ambientes','[]')) x loop
  for i in select x from jsonb_array_elements(coalesce(a->'itens','[]')) x where nullif(x->>'personalizacao_id','') is not null loop
   select * into pers from personalizacoes where id=(i->>'personalizacao_id')::uuid and empresa_id=p.empresa_id;
   if not found then raise exception 'Personalização inválida no pedido';end if;
   k:=coalesce(a->>'id',a->>'nome')||':'||coalesce(i->>'id',i->>'item_id')||':'||pers.id::text;vistos:=array_append(vistos,k);
   v:=i||jsonb_build_object('ambiente',a->>'nome','ambiente_id',a->>'id');
   select * into actual from producao_itens where pedido_id=p.id and chave=k for update;
   if not found then
    insert into producao_itens(empresa_id,pedido_id,chave,origem,snapshot) values(p.empresa_id,p.id,k,v,'{}') returning id into pid;
    perform producao_montar(pid);
   else
    mudou:=actual.origem is distinct from v or actual.snapshot->'personalizacao' is distinct from producao_cadastro_snapshot(pers)
     or actual.snapshot->>'entrega' is distinct from p.data_entrega::text
     or actual.snapshot->>'hora' is distinct from p.observacoes->>'horario_entrega' or actual.cancelado;
    mudou:=mudou or ((actual.snapshot->'config')-array['material_incompleto','exige_conferencia','responsaveis']) is distinct from (producao_config(p.empresa_id)-array['material_incompleto','exige_conferencia','responsaveis'])
      or actual.snapshot->'materiais' is distinct from (select coalesce(jsonb_agg(to_jsonb(pi) order by pi.id),'[]') from personalizacoes_insumos pi where pi.personalizacao_id=pers.id);
    if mudou then
     select exists(select 1 from producao_etapas where producao_item_id=actual.id and iniciada_em is not null)
      or exists(select 1 from producao_materiais m join producao_etapas e on e.id=m.etapa_id where e.producao_item_id=actual.id and m.recebido>0) into iniciou;
     if iniciou then update producao_itens set revisao=true,pendente=v where id=actual.id;
     else
      update producao_pacotes set estado='cancelado' where etapa_id in(select id from producao_etapas where producao_item_id=actual.id) and estado='separado';
      delete from producao_materiais where etapa_id in(select id from producao_etapas where producao_item_id=actual.id);
      -- Etapas antigas são preservadas se já possuem etiquetas emitidas.
      update producao_etapas set estado='cancelada' where producao_item_id=actual.id;
      update producao_itens set origem=v,cancelado=false where id=actual.id;
      perform producao_montar(actual.id);
     end if;
     insert into producao_historico(empresa_id,pedido_id,acao,usuario_id,detalhes) values(p.empresa_id,p.id,'alteracao_comercial',auth.uid(),jsonb_build_object('item',actual.id,'revisao',iniciou));
    end if;
   end if;
  end loop;
 end loop;
 for actual in select * from producao_itens where pedido_id=p.id and not(chave=any(vistos)) and not cancelado loop
  update producao_itens set revisao=true,pendente='{"removido":true}' where id=actual.id;
 end loop;
end $$;


create or replace function producao_acao(p_empresa uuid,p_etapa uuid,p_acao text,p_motivo text default '') returns void
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

