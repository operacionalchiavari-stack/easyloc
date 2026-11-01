-- Painel independente: nunca grava divergências de embalagens no estoque dos móveis.
create table public.operacao_casos_automaticos(
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references empresas(id),
 chave text not null, dados jsonb not null, primeira_deteccao timestamptz not null default now(),
 atualizado_em timestamptz not null default now(), unique(empresa_id,chave)
);
-- Inclusões passam a nascer apenas das rotinas de operação (security definer).
revoke insert on public.operacao_ocorrencias from authenticated;
alter table public.operacao_casos_automaticos enable row level security;
revoke all on public.operacao_casos_automaticos from public,anon,authenticated;

create function public.ocorrencias_painel_pode(p_empresa uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and eh_membro_empresa(p_empresa) and seguranca_2fa_ok()
 and funcionario_tabela_permitida(p_empresa,'separacoes_pedidos','select');
$$;
revoke all on function public.ocorrencias_painel_pode(uuid) from public,anon;
grant execute on function public.ocorrencias_painel_pode(uuid) to authenticated;
create policy casos_automaticos_ler on public.operacao_casos_automaticos for select to authenticated
 using(public.ocorrencias_painel_pode(empresa_id));
grant select on public.operacao_casos_automaticos to authenticated;
create table public.operacao_casos_eventos(
 id bigint generated always as identity primary key,caso_id uuid not null references operacao_casos_automaticos(id),
 empresa_id uuid not null references empresas(id),dados jsonb not null,criado_em timestamptz not null default now()
);
alter table public.operacao_casos_eventos enable row level security;
revoke all on public.operacao_casos_eventos from public,anon,authenticated;
create policy casos_eventos_ler on public.operacao_casos_eventos for select to authenticated using(public.ocorrencias_painel_pode(empresa_id));
grant select on public.operacao_casos_eventos to authenticated;
create function public.ocorrencias_caso_historico() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into operacao_casos_eventos(caso_id,empresa_id,dados) values(new.id,new.empresa_id,new.dados);
 return new;
end $$;
revoke all on function public.ocorrencias_caso_historico() from public,anon,authenticated;
create trigger ocorrencias_caso_historico after insert or update of dados on public.operacao_casos_automaticos for each row execute function public.ocorrencias_caso_historico();

-- A evidência é capturada na própria conferência; não há formulário de ocorrência.
alter table public.capas_contagens add column protecao_aplicada boolean;
alter table public.capas_movimentos add column contagem_origem_id uuid references public.capas_contagens(id);
create function public.material_movimentar(p_empresa uuid,p_modelo uuid,p_tipo text,p_quantidade integer,p_data date,p_observacao text,p_chave uuid,p_pedido uuid default null,p_contagem uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c capas_contagens;tratadas integer;
begin
 if not capas_pode(p_empresa,true) then raise exception 'Sem permissão para movimentar materiais';end if;
 perform 1 from capas_modelos where id=p_modelo and empresa_id=p_empresa for update;
 if not found then raise exception 'Material não encontrado nesta empresa';end if;
 if exists(select 1 from capas_movimentos where empresa_id=p_empresa and chave=p_chave) then return capas_saldo(p_modelo);end if;
 if p_contagem is not null then
  select * into strict c from capas_contagens where id=p_contagem and empresa_id=p_empresa and modelo_id=p_modelo and etapa='retorno' and concluida_em is not null for update;
  if p_tipo not in ('reparo','perda_manutencao') then raise exception 'Lote de manutenção inválido para este movimento';end if;
  select coalesce(sum(quantidade),0) into tratadas from capas_movimentos where contagem_origem_id=c.id;
  if p_quantidade>c.danificadas-tratadas then raise exception 'Quantidade maior que o saldo do lote em manutenção';end if;
 end if;
 perform capas_movimentar(p_empresa,p_modelo,p_tipo,p_quantidade,p_data,p_observacao,p_chave,p_pedido);
 update capas_movimentos set contagem_origem_id=p_contagem where empresa_id=p_empresa and chave=p_chave;
 return capas_saldo(p_modelo);
end $$;
revoke all on function public.material_movimentar(uuid,uuid,text,integer,date,text,uuid,uuid,uuid) from public,anon;
grant execute on function public.material_movimentar(uuid,uuid,text,integer,date,text,uuid,uuid,uuid) to authenticated;
alter function public.capas_pedido_base(uuid,text) rename to capas_pedido_base_antes_auto;
create function public.capas_pedido_base(p_pedido uuid,p_etapa text) returns jsonb
language sql security definer set search_path=public as $$
 select coalesce(jsonb_agg(r||jsonb_build_object('protecao_aplicada',c.protecao_aplicada)),'[]')
 from jsonb_array_elements(public.capas_pedido_base_antes_auto(p_pedido,p_etapa)) r
 left join public.capas_contagens c on c.pedido_id=(r->>'pedido_id')::uuid
 and c.item_id=(r->>'item_id')::uuid and c.etapa=p_etapa;
$$;
revoke all on function public.capas_pedido_base(uuid,text) from public,anon,authenticated;
alter function public.capas_contagem_salvar(uuid,text,jsonb) rename to capas_contagem_salvar_antes_auto;
revoke all on function public.capas_contagem_salvar_antes_auto(uuid,text,jsonb) from public,anon,authenticated;
create function public.capas_contagem_salvar(p_pedido uuid,p_etapa text,p_contagens jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare x jsonb;tratadas integer;
begin
 if auth.uid() is null or not eh_membro_empresa((select empresa_id from separacoes_pedidos where id=p_pedido)) or not seguranca_2fa_ok() then raise exception 'Sem acesso à conferência';end if;
 for x in select * from jsonb_array_elements(p_contagens) loop
  select coalesce(sum(m.quantidade),0) into tratadas from capas_movimentos m join capas_contagens c on c.id=m.contagem_origem_id
   where c.pedido_id=split_part(x->>'chave','|',1)::uuid and c.item_id=split_part(x->>'chave','|',2)::uuid and c.etapa=p_etapa;
  if tratadas>coalesce((x->>'danificadas')::integer,0) then raise exception 'Existem materiais já tratados neste lote; confira os movimentos antes de reduzir os danos';end if;
 end loop;
 perform public.capas_contagem_salvar_antes_auto(p_pedido,p_etapa,p_contagens);
 for x in select * from jsonb_array_elements(p_contagens) loop
  if x ? 'protecao_aplicada' then
   if jsonb_typeof(x->'protecao_aplicada') not in ('boolean','null') then raise exception 'Confira a aplicação da proteção';end if;
   update public.capas_contagens set protecao_aplicada=(x->>'protecao_aplicada')::boolean
   where pedido_id=split_part(x->>'chave','|',1)::uuid and item_id=split_part(x->>'chave','|',2)::uuid and etapa=p_etapa;
  end if;
 end loop;
 return public.capas_pedido_base(p_pedido,p_etapa);
end $$;
revoke all on function public.capas_contagem_salvar(uuid,text,jsonb) from public,anon;
grant execute on function public.capas_contagem_salvar(uuid,text,jsonb) to authenticated;

-- Projeta fatos nas fontes oficiais, com chaves estáveis entre recontagens.
create function public.ocorrencias_fontes(p_empresa uuid) returns setof jsonb
language plpgsql security definer set search_path=public as $$
declare c record;saida capas_contagens;volta capas_contagens;aplicacao capas_contagens;
 perdas integer;tratadas integer;diferenca integer;v jsonb;obj text;nome text;
begin
 for c in select distinct cc.pedido_id,cc.item_id,m.id modelo_id,m.nome,m.tipo_material,
   p.numero_pedido,p.cliente_nome,p.status_comercial
  from capas_contagens cc join capas_modelos m on m.id=cc.modelo_id and m.empresa_id=cc.empresa_id
  join separacoes_pedidos p on p.id=cc.pedido_id and p.empresa_id=cc.empresa_id
  where cc.empresa_id=p_empresa and coalesce(p.status_comercial,'')<>'cancelado'
 loop
  select * into saida from capas_contagens where pedido_id=c.pedido_id and item_id=c.item_id and etapa='carregamento' and concluida_em is not null;
  select * into volta from capas_contagens where pedido_id=c.pedido_id and item_id=c.item_id and etapa in ('descarregamento','retorno')
    order by case etapa when 'retorno' then 0 else 1 end limit 1;
  if volta.concluida_em is null then volta:=null;end if;
  select * into aplicacao from capas_contagens where pedido_id=c.pedido_id and item_id=c.item_id and etapa in ('triagem','carregamento') and concluida_em is not null
    order by case etapa when 'carregamento' then 0 else 1 end limit 1;
  v:=jsonb_build_object('origem','materiais','objeto',c.tipo_material,'pedido_id',c.pedido_id,'pedido',c.numero_pedido,'cliente',c.cliente_nome,
   'item_id',c.item_id,'item',c.nome,'modelo_id',c.modelo_id);
  if saida.id is not null and saida.esperado is not null and saida.quantidade-saida.danificadas<saida.esperado then
   return next v||jsonb_build_object('chave','material:'||c.pedido_id||':'||c.item_id||':saida','tipo','protecao_insuficiente','etapa','carregamento',
    'quantidade',saida.esperado-saida.quantidade+saida.danificadas,'esperado',saida.esperado,'conferido',saida.quantidade-saida.danificadas,'status','registrada','data',saida.concluida_em,
    'descricao','Carregamento concluído com material de proteção insuficiente.','evidencias',to_jsonb(saida));
  end if;
  if aplicacao.id is not null and aplicacao.danificadas>0 then
   return next v||jsonb_build_object('chave','material:'||c.pedido_id||':'||c.item_id||':avaria_saida','tipo','avaria','etapa',aplicacao.etapa,
    'quantidade',aplicacao.danificadas,'status','registrada','data',aplicacao.concluida_em,'descricao','Material de proteção danificado identificado na ida.','evidencias',to_jsonb(aplicacao));
  end if;
  if aplicacao.protecao_aplicada=false then
   return next v||jsonb_build_object('chave','material:'||c.pedido_id||':'||c.item_id||':aplicacao','tipo','sem_protecao','etapa',aplicacao.etapa,
    'quantidade',1,'status',case when aplicacao.etapa='carregamento' then 'registrada' else 'aberta' end,'data',aplicacao.concluida_em,
    'descricao','Proteção não aplicada, conforme confirmação na etapa.','evidencias',to_jsonb(aplicacao));
  end if;
  if saida.id is not null and volta.id is not null then
   select coalesce(sum(quantidade),0)::integer into perdas from capas_movimentos where modelo_id=c.modelo_id and pedido_id=c.pedido_id and tipo='perda_pedido';
   diferenca:=saida.quantidade-volta.quantidade;
   if diferenca<>0 then
    return next v||jsonb_build_object('chave','material:'||c.pedido_id||':'||c.item_id||':retorno','tipo',case when diferenca>0 then 'falta' else 'sobra' end,
     'etapa',volta.etapa,'quantidade',abs(diferenca),'pendente',greatest(0,diferenca-perdas),'esperado',saida.quantidade,'conferido',volta.quantidade,
     'status',case when diferenca>0 and perdas>=diferenca then 'perda_confirmada' else 'aberta' end,'data',volta.concluida_em,
     'descricao',case when diferenca>0 then 'Material de proteção não devolvido.' else 'Retorno com material de proteção a mais.' end,
     'evidencias',jsonb_build_object('saida',to_jsonb(saida),'retorno',to_jsonb(volta),'perdas_confirmadas',perdas));
   end if;
  end if;
  if saida.id is null and volta.id is not null then
   return next v||jsonb_build_object('chave','material:'||c.pedido_id||':'||c.item_id||':sem_saida','tipo','saida_sem_registro','etapa',volta.etapa,
    'quantidade',1,'status','registrada','data',volta.concluida_em,'descricao','Retorno conferido sem contagem de saída; não é possível determinar falta ou sobra.','evidencias',to_jsonb(volta));
  end if;
  if volta.id is not null and volta.danificadas>0 then
   select coalesce(sum(quantidade),0) into tratadas from capas_movimentos where contagem_origem_id=volta.id;
   return next v||jsonb_build_object('chave','material:'||c.pedido_id||':'||c.item_id||':avaria','tipo','avaria','etapa',volta.etapa,
    'quantidade',volta.danificadas,'pendente',greatest(0,volta.danificadas-tratadas),'status',case when tratadas>=volta.danificadas then 'resolvida' when volta.etapa='retorno' then 'encaminhada' else 'aberta' end,'data',volta.concluida_em,
    'descricao',case when volta.etapa='retorno' then 'Material danificado encaminhado à manutenção na triagem.' else 'Material danificado identificado no descarregamento.' end,
    'evidencias',jsonb_build_object('contagem',to_jsonb(volta),'tratamentos',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from capas_movimentos m where m.contagem_origem_id=volta.id)));
  end if;
  if exists(select 1 from capas_contagens d join capas_contagens r on r.pedido_id=d.pedido_id and r.item_id=d.item_id
    where d.pedido_id=c.pedido_id and d.item_id=c.item_id and d.etapa='descarregamento' and r.etapa='retorno'
    and d.concluida_em is not null and r.concluida_em is not null and d.quantidade<>r.quantidade) then
   return next v||jsonb_build_object('chave','material:'||c.pedido_id||':'||c.item_id||':recontagem','tipo','divergencia_contagens','etapa','retorno',
    'quantidade',1,'status','registrada','data',volta.concluida_em,'descricao','Descarregamento e triagem registraram quantidades diferentes.',
    'evidencias',(select jsonb_agg(to_jsonb(q)) from capas_contagens q where q.pedido_id=c.pedido_id and q.item_id=c.item_id and q.etapa in ('descarregamento','retorno')));
  end if;
 end loop;

 -- Faltas/sobras de móveis: um caso por pedido/item/tipo, com as duas etapas como evidência.
 for c in
  with candidatos as (
   select o.*,p.numero_pedido,p.cliente_nome,coalesce(i.descricao_total,i.produto,'Ocorrência geral') item_nome,
    dense_rank() over(partition by o.pedido_id,coalesce(o.item_id::text,o.codigo,o.id::text),o.tipo order by case when o.etapa='retorno' then 0 else 1 end) prioridade
   from operacao_ocorrencias o join separacoes_pedidos p on p.id=o.pedido_id and p.empresa_id=o.empresa_id left join itens i on i.id=o.item_id and i.empresa_id=o.empresa_id
   where o.empresa_id=p_empresa and coalesce(p.status_comercial,'')<>'cancelado'
   and (o.etapa is null or o.etapa not in ('retorno','descarregamento') or p.operacao->o.etapa->>'concluido_em' is not null)
   and not (coalesce(o.etapa,'')='descarregamento' and p.operacao->'retorno'->>'concluido_em' is not null)
  ) select (array_agg(id))[1] id,pedido_id,item_id,min(codigo) codigo,tipo,min(etapa) etapa,
   sum(quantidade) quantidade,sum(esperado) esperado,sum(conferido) conferido,
   case when bool_and(resolvida_em is not null) then max(resolvida_em) end resolvida_em,
   min(criado_em) criado_em,string_agg(distinct descricao,'; ') descricao,min(numero_pedido) numero_pedido,min(cliente_nome) cliente_nome,min(item_nome) item_nome
  from candidatos where prioridade=1 group by pedido_id,item_id,tipo,case when item_id is null then coalesce(codigo,id::text) end
 loop
  -- Uma evidência do acervo cobre a mesma avaria: não conta duas vezes.
  if c.tipo='avaria' and exists(select 1 from acervo_retornos a where a.pedido_id=c.pedido_id and a.item_id=c.item_id and a.tipo='avaria') then continue;end if;
  return next jsonb_build_object('chave','peca:'||c.pedido_id||':'||coalesce(c.item_id::text,c.codigo,c.id::text)||':'||c.tipo,
   'origem','conferencia','objeto','item','tipo',c.tipo,'etapa',c.etapa,'pedido_id',c.pedido_id,'pedido',c.numero_pedido,'cliente',c.cliente_nome,
   'item_id',c.item_id,'item',c.item_nome,'quantidade',c.quantidade,'esperado',c.esperado,'conferido',c.conferido,
   'status',case when c.resolvida_em is not null then 'resolvida' else 'aberta' end,'data',c.criado_em,'descricao',c.descricao,
   'evidencias',(select jsonb_agg(to_jsonb(e)) from operacao_ocorrencias e where e.pedido_id=c.pedido_id and e.item_id is not distinct from c.item_id and e.tipo=c.tipo));
 end loop;
 for c in select a.*,p.numero_pedido,p.cliente_nome,coalesce(i.descricao_total,i.produto) item_nome
  from acervo_retornos a join separacoes_pedidos p on p.id=a.pedido_id and p.empresa_id=a.empresa_id join itens i on i.id=a.item_id and i.empresa_id=a.empresa_id
  where a.empresa_id=p_empresa and a.tipo in ('avaria','falta') and coalesce(p.status_comercial,'')<>'cancelado'
 loop
  if c.tipo='falta' and exists(select 1 from operacao_ocorrencias o where o.pedido_id=c.pedido_id and o.item_id=c.item_id and o.tipo='falta') then continue;end if;
  return next jsonb_build_object('chave','acervo:'||c.id,'origem','acervo','objeto','item','tipo',c.tipo,'etapa','coleta',
   'pedido_id',c.pedido_id,'pedido',c.numero_pedido,'cliente',c.cliente_nome,'item_id',c.item_id,'item',c.item_nome,'quantidade',c.quantidade,
   'status',case when c.estado='baixado' then 'perda_confirmada' when c.estado='liberado' then 'resolvida' when c.estado in ('reparo','limpeza','inspecao') then 'encaminhada' else 'aberta' end,
   'data',c.criado_em,'descricao',case when c.tipo='falta' then 'Item não recolhido; localização e causa ainda não confirmadas.' else 'Avaria registrada na coleta.' end,
   'evidencias',to_jsonb(c));
 end loop;
 -- Qualidade: último resultado determina o estado, mantendo cada reprovação no histórico.
 for c in select q.*,coalesce(i.descricao_total,i.produto) item_nome from qualidade_inspecoes q join itens i on i.id=q.item_id and i.empresa_id=q.empresa_id
  where q.empresa_id=p_empresa and q.dados->>'status'='Reprovado'
 loop
  if c.dados->>'retorno_id' is not null then continue;end if;
  return next jsonb_build_object('chave','qualidade:'||c.id,'origem','qualidade','objeto','item','tipo','reprovacao','etapa','inspecao',
   'item_id',c.item_id,'item',c.item_nome,'quantidade',1,'status',case when exists(select 1 from qualidade_inspecoes n where n.item_id=c.item_id and n.empresa_id=p_empresa and n.criado_em>c.criado_em and n.dados->>'status' in ('Aprovado','Aprovado com observação')) then 'resolvida' else 'aberta' end,
   'data',c.criado_em,'descricao','Item reprovado na inspeção de qualidade.','evidencias',c.dados);
 end loop;
 -- Só considera itens efetivamente carregados, por etiqueta lida ou quantidade confirmada.
 for c in
  with carregados as (
   select p.id pedido_id,p.numero_pedido,p.cliente_nome,(p.operacao->'carregamento'->>'concluido_em')::timestamptz enviado_em,
    (x->>'item_id')::uuid item_id,sum((x->>'conferido')::numeric) quantidade
   from separacoes_pedidos p cross join lateral jsonb_array_elements(coalesce(p.operacao->'carregamento'->'itens','[]')) x
   where p.empresa_id=p_empresa and coalesce(p.status_comercial,'')<>'cancelado' and p.operacao->'carregamento'->>'concluido_em' is not null
    and nullif(x->>'item_id','') is not null and (x->>'conferido')::numeric>0
   group by p.id,(x->>'item_id')::uuid
   union all
   select p.id,p.numero_pedido,p.cliente_nome,(p.operacao->'carregamento'->>'concluido_em')::timestamptz,t.item_id,count(*)
   from separacoes_pedidos p join separacoes_etiquetas t on t.separacao_pedido_id=p.id
   where p.empresa_id=p_empresa and coalesce(p.status_comercial,'')<>'cancelado' and p.operacao->'carregamento'->>'concluido_em' is not null
    and t.lida_carregamento_em is not null and not coalesce((p.operacao->'carregamento'->>'sem_etiquetas')::boolean,false)
    and jsonb_array_length(coalesce(p.operacao->'carregamento'->'itens','[]'))=0
   group by p.id,t.item_id
  ) select ca.*,coalesce(i.descricao_total,i.produto) item_nome from carregados ca join itens i on i.id=ca.item_id and i.empresa_id=p_empresa
   where not exists(select 1 from qualidade_inspecoes q where q.item_id=ca.item_id and q.empresa_id=p_empresa and q.criado_em<=ca.enviado_em
    and q.dados->>'status' in ('Aprovado','Aprovado com observação')
    and not exists(select 1 from qualidade_inspecoes n where n.item_id=q.item_id and n.empresa_id=p_empresa and n.criado_em>q.criado_em and n.criado_em<=ca.enviado_em and n.dados->>'status'='Reprovado'))
 loop
  return next jsonb_build_object('chave','revisao:'||c.pedido_id||':'||c.item_id,'origem','qualidade','objeto','item','tipo','revisao_sem_registro','etapa','carregamento',
   'pedido_id',c.pedido_id,'pedido',c.numero_pedido,'cliente',c.cliente_nome,'item_id',c.item_id,'item',c.item_nome,'quantidade',c.quantidade,
   'status','registrada','data',c.enviado_em,'descricao','Carregamento sem inspeção aprovada registrada antes do envio; ausência de registro não comprova ausência de revisão física.',
   'evidencias',jsonb_build_object('enviado_em',c.enviado_em,'quantidade',c.quantidade));
 end loop;
 -- Perdas de material sem pedido são fatos, não faltas de móveis.
 for c in select mov.*,m.nome,m.tipo_material,m.item_id from capas_movimentos mov join capas_modelos m on m.id=mov.modelo_id and m.empresa_id=mov.empresa_id
  where mov.empresa_id=p_empresa and mov.tipo in ('perda','perda_manutencao')
 loop
  return next jsonb_build_object('chave','movimento:'||c.id,'origem','materiais','objeto',c.tipo_material,'tipo','perda','etapa','estoque',
   'item_id',c.item_id,'item',c.nome,'quantidade',c.quantidade,'status','perda_confirmada','data',c.criado_em,'descricao',c.observacao,'evidencias',to_jsonb(c));
 end loop;
 -- Prazo da etapa = início programado. Não interpreta esse horário como prazo de término.
 for c in select e.*,p.numero_pedido,p.cliente_nome,
  (e.data+e.hora) at time zone 'America/Sao_Paulo' previsto,
  case e.tipo when 'triagem_ida' then p.finalizado_em
    when 'carregamento' then nullif(p.operacao->'carregamento'->>'concluido_em','')::timestamptz
    when 'descarregamento' then nullif(p.operacao->'descarregamento'->>'concluido_em','')::timestamptz
    when 'triagem_volta' then nullif(p.operacao->'retorno'->>'concluido_em','')::timestamptz
    else (select min(a.inicio) from operacao_apontamentos a where a.etapa_id=e.id) end realizado
  from operacao_etapas e join separacoes_pedidos p on p.id=e.pedido_id and p.empresa_id=e.empresa_id
  where e.empresa_id=p_empresa and e.hora is not null and e.tipo in ('montagem','desmontagem')
   and coalesce(p.status_comercial,'')<>'cancelado' and e.origem='pedido'
   and (p.encerrado_operacional_em is null or exists(select 1 from operacao_apontamentos a where a.etapa_id=e.id))
 loop
  if coalesce(c.realizado,now())>c.previsto+interval '15 minutes' then
   return next jsonb_build_object('chave','prazo:'||c.id,'origem','cronograma','objeto','etapa','tipo','atraso_inicio','etapa',c.tipo,
    'pedido_id',c.pedido_id,'pedido',c.numero_pedido,'cliente',c.cliente_nome,'item',c.nome,'quantidade',1,
    'status',case when c.realizado is null then 'aberta' else 'registrada' end,'data',c.previsto,
    'descricao',case when c.realizado is null then 'Início da etapa sem apontamento após o horário programado (tolerância de 15 minutos).' else 'Início apontado após o horário programado (tolerância de 15 minutos).' end,
    'evidencias',jsonb_build_object('previsto',c.previsto,'realizado',c.realizado,'tolerancia_minutos',15));
  end if;
 end loop;
end $$;
revoke all on function public.ocorrencias_fontes(uuid) from public,anon,authenticated;

create function public.ocorrencias_sincronizar(p_empresa uuid) returns void
language plpgsql security definer set search_path=public as $$
declare eventos jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('ocorrencias:'||p_empresa::text,0));
 select coalesce(jsonb_agg(x),'[]') into eventos from public.ocorrencias_fontes(p_empresa) x;
 insert into public.operacao_casos_automaticos(empresa_id,chave,dados)
 select p_empresa,x->>'chave',x from jsonb_array_elements(eventos) x
 on conflict(empresa_id,chave) do update set dados=excluded.dados,atualizado_em=now()
 where operacao_casos_automaticos.dados is distinct from excluded.dados;
 with estados as (
  select c.id,
   case when exists(select 1 from separacoes_pedidos p where p.id=(c.dados->>'pedido_id')::uuid and p.status_comercial='cancelado') then 'cancelada'
    when c.dados->>'origem'='materiais' and exists(select 1 from capas_contagens t where t.pedido_id=(c.dados->>'pedido_id')::uuid and t.item_id=(c.dados->>'item_id')::uuid and t.etapa=c.dados->>'etapa' and t.concluida_em is null) then 'em_revisao'
    when c.dados->>'origem'='conferencia' and exists(select 1 from separacoes_pedidos p where p.id=(c.dados->>'pedido_id')::uuid and p.operacao->(c.dados->>'etapa')->>'concluido_em' is null) then 'em_revisao'
    else 'resolvida' end estado
  from public.operacao_casos_automaticos c where c.empresa_id=p_empresa
   and not exists(select 1 from jsonb_array_elements(eventos) x where x->>'chave'=c.chave)
 )
 update public.operacao_casos_automaticos c set dados=c.dados||jsonb_build_object('status',e.estado,'resolucao','Situacao recalculada na origem: conferencia, tratamento, reabertura, cancelamento ou programacao atual.'),atualizado_em=now()
 from estados e where c.id=e.id and c.dados->>'status' is distinct from e.estado;

end $$;
revoke all on function public.ocorrencias_sincronizar(uuid) from public,anon,authenticated;

create function public.ocorrencias_painel(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if not public.ocorrencias_painel_pode(p_empresa) then raise exception 'Sem acesso ao painel de ocorrências';end if;
 perform public.ocorrencias_sincronizar(p_empresa);
 return (select coalesce(jsonb_agg(c.dados||jsonb_build_object('id',c.id,'detectada_em',c.primeira_deteccao,'atualizado_em',c.atualizado_em) order by c.primeira_deteccao desc),'[]') from operacao_casos_automaticos c where c.empresa_id=p_empresa);
end $$;
revoke all on function public.ocorrencias_painel(uuid) from public,anon;
grant execute on function public.ocorrencias_painel(uuid) to authenticated;
create function public.ocorrencias_evidencias(p_empresa uuid,p_caso uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if not ocorrencias_painel_pode(p_empresa) then raise exception 'Sem acesso às evidências';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('data',criado_em,'registro',dados) order by id),'[]') from operacao_casos_eventos where caso_id=p_caso and empresa_id=p_empresa);
end $$;
revoke all on function public.ocorrencias_evidencias(uuid,uuid) from public,anon;
grant execute on function public.ocorrencias_evidencias(uuid,uuid) to authenticated;

-- Não muda o destino ou a resolução de ocorrências existentes; só atualiza a projeção.
create function public.ocorrencias_fonte_mudou() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 perform public.ocorrencias_sincronizar(case when tg_op='DELETE' then old.empresa_id else new.empresa_id end);
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.ocorrencias_fonte_mudou() from public,anon,authenticated;
do $triggers$
declare t text;
begin
 foreach t in array array['capas_contagens','capas_movimentos','operacao_ocorrencias','acervo_retornos','qualidade_inspecoes','operacao_etapas','operacao_apontamentos','separacoes_pedidos'] loop
  execute format('create trigger ocorrencias_automaticas after insert or update or delete on public.%I for each row execute function public.ocorrencias_fonte_mudou()',t);
 end loop;
end $triggers$;
-- O painel recalcula também ao abrir; o agendamento mantém os casos atualizados sem navegador.
do $schedule$
begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('ocorrencias-operacionais-automaticas','* * * * *',
   'select public.ocorrencias_sincronizar(empresa_id) from (select distinct empresa_id from public.separacoes_pedidos union select distinct empresa_id from public.qualidade_inspecoes union select distinct empresa_id from public.capas_movimentos) empresas');
 end if;
end $schedule$;
notify pgrst,'reload schema';
