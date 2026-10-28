-- Fechamento financeiro auditável; fontes e preços são resolvidos no servidor.
create table public.fin_posicoes_finais (
 pedido_id uuid primary key references public.separacoes_pedidos(id),
 empresa_id uuid not null references public.empresas(id),
 versao integer not null default 1,
 status text not null check(status in ('rascunho','confirmado')),
 fonte text not null,
 itens jsonb not null,
 credito numeric(15,2) not null check(credito>=0),
 cobranca numeric(15,2) not null check(cobranca>=0),
 credito_id uuid references public.fin_pagar(id),
 receber_id uuid references public.fin_receber(id),
 atualizado_em timestamptz not null default now(),
 atualizado_por uuid not null,
 confirmado_em timestamptz
);
alter table public.fin_posicoes_finais enable row level security;
create policy fin_posicao_ler on public.fin_posicoes_finais for select to authenticated
 using(eh_membro_empresa(empresa_id) and fin_pode(empresa_id,'financeiro.fluxo.visualizar'));
revoke all on public.fin_posicoes_finais from anon,authenticated;
grant select on public.fin_posicoes_finais to authenticated;

create function public.fin_posicao_final_base(p_empresa uuid,p_pedido uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos%rowtype; e logistica_confirmacoes%rowtype; c logistica_confirmacoes%rowtype;
 f fin_posicoes_finais%rowtype; linhas jsonb; titulos jsonb; pagamentos jsonb; credito jsonb;
 bruto numeric; fator numeric:=1;
begin
 if not eh_membro_empresa(p_empresa) or not fin_pode(p_empresa,'financeiro.fluxo.visualizar') then
  raise exception 'Sem permissão para consultar a posição final' using errcode='42501'; end if;
 select * into p from separacoes_pedidos where id=p_pedido and empresa_id=p_empresa;
 if not found then raise exception 'Pedido não encontrado nesta empresa'; end if;
 select * into e from logistica_confirmacoes where pedido_id=p.id and empresa_id=p_empresa and etapa='entrega' order by versao desc limit 1;
 select * into c from logistica_confirmacoes where pedido_id=p.id and empresa_id=p_empresa and etapa='coleta' order by versao desc limit 1;
 select * into f from fin_posicoes_finais where pedido_id=p.id and empresa_id=p_empresa;
 select sum((x->>'valor_locacao')::numeric*(x->>'quantidade_solicitada')::numeric) into bruto
  from jsonb_array_elements(coalesce(p.observacoes->'itens_comerciais','[]')) x;
 if bruto>0 then
  fator:=least(1,greatest(0,coalesce((p.observacoes->'valores'->>'locacao_bv')::numeric,bruto)
   -greatest(fin_moeda(p.observacoes->'pagamento_config'->>'descontoComercial'),0))/bruto);
 end if;
 -- Não distribuir o preço de um kit entre componentes: preço ausente fica pendente.
 with comercial as (
  select x from jsonb_array_elements(coalesce(p.observacoes->'itens_comerciais','[]')) x
 ), ocorrencias as (
  select x, 'credito'::text tipo, greatest(0,(x->>'previsto')::numeric-coalesce((x->>'entregue')::numeric,0)) quantidade
   from jsonb_array_elements(coalesce(e.itens,'[]')) x
  union all select x,'avaria',coalesce((x->>'danificado')::numeric,0) from jsonb_array_elements(coalesce(c.itens,'[]')) x
  union all select x,'desaparecido',coalesce((x->>'nao_coletado')::numeric,0) from jsonb_array_elements(coalesce(c.itens,'[]')) x
 ), precos as (
  select o.*, v.locacao*fator locacao,coalesce(v.reposicao,i.valor_reposicao) reposicao,coalesce(v.foto,i.foto_url) foto from ocorrencias o
  left join lateral (
   select case when count(distinct x->>'valor_locacao')=1 then min((x->>'valor_locacao')::numeric) end locacao,
    case when count(distinct x->>'valor_reposicao')=1 then min((x->>'valor_reposicao')::numeric) end reposicao,
    min(x->>'foto_url') foto from comercial where x->>'item_id'=o.x->>'item_id'
  ) v on true left join itens i on i.id::text=o.x->>'item_id' and i.empresa_id=p_empresa where o.quantidade>0
 ) select coalesce(jsonb_agg(jsonb_build_object(
  'chave',tipo||':'||(x->>'chave'),'item_id',x->>'item_id','nome',x->>'nome','foto_url',foto,
  'tipo',tipo,'quantidade',quantidade,'unitario',case when tipo='credito' then locacao else reposicao end,
  'valor',round(quantidade*case when tipo='credito' then locacao else reposicao end,2),
  'motivo',x->>'observacao') order by tipo,x->>'nome'),'[]') into linhas from precos;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.vencimento),'[]') into titulos from fin_receber t
  where t.empresa_id=p_empresa and t.pedido_id=p.id;
 select coalesce(jsonb_agg(to_jsonb(b) order by b.data,b.created_at),'[]') into pagamentos from fin_baixas b
  join fin_receber t on t.id=b.receber_id and t.empresa_id=b.empresa_id where t.empresa_id=p_empresa and t.pedido_id=p.id;
 select to_jsonb(t) into credito from fin_pagar t where t.id=f.credito_id and t.empresa_id=p_empresa;
 return jsonb_build_object('pedido',jsonb_build_object('id',p.id,'numero_pedido',p.numero_pedido,'cliente_nome',p.cliente_nome,
  'local_nome',p.local_nome,'valor_total',p.valor_total,'data_evento',p.data_evento),
  'itens',linhas,'salvo',case when f.pedido_id is null then null else to_jsonb(f) end,
  'fonte',md5(coalesce(e.id::text,'')||coalesce(c.id::text,'')||coalesce(linhas::text,'')),
  'entrega_confirmada',e.id is not null,'coleta_confirmada',c.id is not null,
  'titulos',titulos,'pagamentos',pagamentos,'credito_titulo',credito);
end $$;

create function public.fin_posicao_final_salvar(p_empresa uuid,p_pedido uuid,p_fonte text,p_versao integer,p_decisoes jsonb,p_confirmar boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos%rowtype; f fin_posicoes_finais%rowtype; b jsonb; x jsonb; d jsonb;
 itens jsonb:='[]'; cre numeric:=0; cob numeric:=0; decisao text; motivo text; credito_id uuid; receber_id uuid;
begin
 if not eh_membro_empresa(p_empresa) or not fin_pode(p_empresa,'financeiro.contas_receber.editar')
  or not fin_pode(p_empresa,'financeiro.contas_pagar.editar') then
  raise exception 'Sem permissão para salvar a posição final' using errcode='42501'; end if;
 select * into p from separacoes_pedidos where id=p_pedido and empresa_id=p_empresa for update;
 if not found then raise exception 'Pedido não encontrado nesta empresa'; end if;
 select * into f from fin_posicoes_finais where pedido_id=p.id for update;
 if f.status='confirmado' then raise exception 'Esta posição final já foi confirmada'; end if;
 if coalesce(f.versao,0) is distinct from p_versao then raise exception 'A posição final mudou. Abra o pedido novamente'; end if;
 b:=fin_posicao_final_base(p_empresa,p.id);
 if p_fonte is distinct from b->>'fonte' then raise exception 'Entrega, coleta ou preços mudaram. Abra o pedido novamente'; end if;
 if jsonb_typeof(p_decisoes) is distinct from 'array' then raise exception 'Decisões inválidas'; end if;
 if exists(select 1 from jsonb_array_elements(p_decisoes) v group by v->>'chave' having count(*)>1)
  or exists(select 1 from jsonb_array_elements(p_decisoes) v where not exists(select 1 from jsonb_array_elements(b->'itens') i where i->>'chave'=v->>'chave')) then
  raise exception 'Ocorrências inválidas'; end if;
 for x in select * from jsonb_array_elements(b->'itens') loop
  select v into d from jsonb_array_elements(p_decisoes) v where v->>'chave'=x->>'chave';
  decisao:=case when x->>'tipo'='credito' then 'credito' else coalesce(d->>'decisao','pendente') end;
  motivo:=btrim(coalesce(d->>'justificativa',''));
  if decisao not in ('credito','pendente','cobrar','dispensar') or (x->>'tipo'<>'credito' and decisao='credito') then raise exception 'Decisão inválida'; end if;
  if p_confirmar and decisao='pendente' then raise exception 'Decida se cada ocorrência será cobrada'; end if;
  if decisao='dispensar' and motivo='' then raise exception 'Informe o motivo para não cobrar'; end if;
  if p_confirmar and decisao in ('credito','cobrar') and ((x->>'unitario') is null or (x->>'unitario')::numeric<0 or x->>'unitario' in ('NaN','Infinity','-Infinity')) then
   raise exception 'Há item sem preço válido no pedido. Confira os valores de locação e reposição'; end if;
  if decisao='credito' then cre:=cre+coalesce((x->>'valor')::numeric,0); end if;
  if decisao='cobrar' then cob:=cob+coalesce((x->>'valor')::numeric,0); end if;
  itens:=itens||jsonb_build_array(x||jsonb_build_object('decisao',decisao,'justificativa',motivo));
 end loop;
 if p_confirmar then
  if not (b->>'entrega_confirmada')::boolean or not (b->>'coleta_confirmada')::boolean then raise exception 'Confirme a entrega e a coleta antes de finalizar'; end if;
  if coalesce(p.status_comercial,'') not in ('aprovado','enviado','finalizado') or p.status='cancelado' then raise exception 'O pedido precisa estar aprovado'; end if;
  if cre>0 then
   credito_id:=fin_cliente_registrar_credito(p_empresa,p.cliente_id,'ajuste',cre,(now() at time zone 'America/Sao_Paulo')::date,
    'Posição final do pedido #'||p.numero_pedido||': locação dos itens não entregues.');
  end if;
  if cob>0 then
   insert into fin_receber(empresa_id,origem,pedido_id,pedido_numero,cliente_id,cliente_nome,componente,descricao,vencimento,competencia,valor,observacoes,criado_por)
    values(p_empresa,'manual',p.id,p.numero_pedido,p.cliente_id,p.cliente_nome,'outro','Avarias e desaparecimentos — pedido #'||p.numero_pedido,
     (now() at time zone 'America/Sao_Paulo')::date,(now() at time zone 'America/Sao_Paulo')::date,cob,'Posição final: ocorrências confirmadas no evento.',auth.uid()) returning id into receber_id;
  end if;
 end if;
 insert into fin_posicoes_finais(pedido_id,empresa_id,versao,status,fonte,itens,credito,cobranca,credito_id,receber_id,atualizado_por,confirmado_em)
 values(p.id,p_empresa,coalesce(f.versao,0)+1,case when p_confirmar then 'confirmado' else 'rascunho' end,p_fonte,itens,cre,cob,credito_id,receber_id,auth.uid(),case when p_confirmar then now() end)
 on conflict(pedido_id) do update set versao=excluded.versao,status=excluded.status,fonte=excluded.fonte,itens=excluded.itens,credito=excluded.credito,cobranca=excluded.cobranca,
  credito_id=excluded.credito_id,receber_id=excluded.receber_id,atualizado_em=now(),atualizado_por=auth.uid(),confirmado_em=excluded.confirmado_em;
 perform fin_auditar(p_empresa,'fin_posicoes_finais',p.id,case when p_confirmar then 'confirmar' else 'rascunho' end,to_jsonb(f),
  jsonb_build_object('itens',itens,'credito',cre,'cobranca',cob,'credito_id',credito_id,'receber_id',receber_id),'Posição final do pedido');
 return fin_posicao_final_base(p_empresa,p.id);
end $$;
revoke all on function public.fin_posicao_final_base(uuid,uuid),public.fin_posicao_final_salvar(uuid,uuid,text,integer,jsonb,boolean) from public,anon;
grant execute on function public.fin_posicao_final_base(uuid,uuid),public.fin_posicao_final_salvar(uuid,uuid,text,integer,jsonb,boolean) to authenticated;
