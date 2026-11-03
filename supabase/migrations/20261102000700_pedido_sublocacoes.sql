begin;
create table public.pedido_sublocacoes(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),
 pedido_id uuid not null references separacoes_pedidos(id),item_id uuid not null references itens(id),
 fornecedor_id uuid not null references fornecedores(id),quantidade integer not null check(quantidade>0),
 custo_unitario numeric(14,2) not null check(custo_unitario>=0),retirada date not null,devolucao date not null check(devolucao>=retirada),
 status text not null default 'cotacao' check(status in ('cotacao','confirmada','recebida','devolvida','cancelada')),
 observacao text not null default '',revisao bigint not null default 0,
 criado_por uuid not null,criado_em timestamptz not null default now(),atualizado_em timestamptz not null default now()
);
create index pedido_sublocacoes_pedido on public.pedido_sublocacoes(pedido_id,item_id);
alter table public.pedido_sublocacoes enable row level security;
create policy pedido_sublocacoes_ler on public.pedido_sublocacoes for select to authenticated using(eh_membro_empresa(empresa_id) and funcionario_tabela_permitida(empresa_id,'separacoes_pedidos','select'));
grant select on public.pedido_sublocacoes to authenticated;
revoke insert,update,delete on public.pedido_sublocacoes from anon,authenticated;
create table public.pedido_sublocacoes_historico(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references empresas(id),sublocacao_id uuid not null references pedido_sublocacoes(id),
 usuario_id uuid not null,antes jsonb,depois jsonb not null,criado_em timestamptz not null default now()
);
alter table public.pedido_sublocacoes_historico enable row level security;
create policy pedido_sublocacoes_historico_ler on public.pedido_sublocacoes_historico for select to authenticated using(eh_membro_empresa(empresa_id) and funcionario_tabela_permitida(empresa_id,'separacoes_pedidos','select'));
grant select on public.pedido_sublocacoes_historico to authenticated;
revoke insert,update,delete on public.pedido_sublocacoes_historico from anon,authenticated;

create function public.pedido_sublocado_qtd(p_pedido uuid,p_item uuid) returns numeric
language sql stable security definer set search_path=public as $$
 select coalesce(sum(quantidade),0)::numeric from pedido_sublocacoes where pedido_id=p_pedido and item_id=p_item and status in ('confirmada','recebida','devolvida');
$$;
revoke all on function public.pedido_sublocado_qtd(uuid,uuid) from public,anon,authenticated;

create function public.pedido_sublocacao_itens(p_pedido uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 with p as(select * from separacoes_pedidos where id=p_pedido),lista as(
  select s.item_id,sum(s.quantidade_solicitada)::numeric quantidade from separacoes_itens s join p on p.id=s.separacao_pedido_id
   where p.status_comercial in ('pre_reserva','aprovado','enviado','finalizado') group by s.item_id
  union all
  select (x->>'item_id')::uuid,sum((x->>'quantidade_solicitada')::numeric) from p,
   jsonb_array_elements(case when jsonb_typeof(p.observacoes->'itens_comerciais')='array' then p.observacoes->'itens_comerciais' else '[]'::jsonb end) x
   where p.status_comercial not in ('pre_reserva','aprovado','enviado','finalizado') group by 1
 )select coalesce(jsonb_agg(jsonb_build_object('item_id',i.id,'nome',coalesce(i.descricao_total,i.produto),'foto_url',i.foto_url,
  'quantidade',l.quantidade,'sublocada',pedido_sublocado_qtd(p_pedido,i.id)) order by i.produto),'[]')
 from lista l join itens i on i.id=l.item_id join p on p.empresa_id=i.empresa_id;
$$;
revoke all on function public.pedido_sublocacao_itens(uuid) from public,anon,authenticated;

create function public.pedido_sublocacao_validar(p_pedido uuid) returns void
language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos;x record;lista jsonb;prevista numeric;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido;
 if p.status_comercial='cancelado' or not exists(select 1 from pedido_sublocacoes where pedido_id=p.id and status in ('confirmada','recebida','devolvida')) then return;end if;
 lista:=pedido_sublocacao_itens(p.id);
 for x in select item_id,sum(quantidade) quantidade,min(retirada) retirada,max(devolucao) devolucao
  from pedido_sublocacoes where pedido_id=p.id and status in ('confirmada','recebida','devolvida') group by item_id loop
  select (t->>'quantidade')::numeric into prevista from jsonb_array_elements(lista) t where t->>'item_id'=x.item_id::text;
  if x.quantidade>coalesce(prevista,0) then raise exception 'A quantidade sublocada ultrapassa a quantidade do item no pedido. Revise as sublocações antes de alterar a lista.';end if;
 end loop;
 if exists(select 1 from pedido_sublocacoes where pedido_id=p.id and status in ('confirmada','recebida','devolvida')
  and (retirada>coalesce(p.data_entrega,p.data_evento) or devolucao<coalesce(p.data_coleta,p.data_evento_fim,p.data_evento))) then
  raise exception 'O período da sublocação precisa cobrir a entrega e a coleta do pedido. Ajuste com o fornecedor antes de mudar as datas.';
 end if;
end $$;
revoke all on function public.pedido_sublocacao_validar(uuid) from public,anon,authenticated;

create function public.pedido_sublocacoes_listar(p_empresa uuid,p_pedido uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare resultado jsonb;
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'separacoes_pedidos','select') then raise exception 'Sem acesso às sublocações';end if;
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('numero_pedido',p.numero_pedido,'cliente',p.cliente_nome,
  'item_nome',coalesce(i.descricao_total,i.produto),'fornecedor_nome',coalesce(nullif(f.nome_fantasia,''),f.nome_razao_social)) order by s.retirada,p.numero_pedido),'[]') into resultado
 from pedido_sublocacoes s join separacoes_pedidos p on p.id=s.pedido_id join itens i on i.id=s.item_id join fornecedores f on f.id=s.fornecedor_id
 where s.empresa_id=p_empresa and (p_pedido is null or s.pedido_id=p_pedido);
 return resultado;
end $$;

create function public.pedido_sublocacao_base(p_pedido uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare p separacoes_pedidos;forns jsonb;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','select') then raise exception 'Sem acesso ao pedido';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'nome',coalesce(nullif(f.nome_fantasia,''),f.nome_razao_social)) order by f.nome_razao_social),'[]') into forns
 from fornecedores f where empresa_id=p.empresa_id and lower(coalesce(f.status,'')) not in ('inativo','inativa');
 return jsonb_build_object('pedido',jsonb_build_object('id',p.id,'numero',p.numero_pedido,'cliente',p.cliente_nome,'entrega',p.data_entrega,'coleta',p.data_coleta),
  'itens',pedido_sublocacao_itens(p.id),'fornecedores',forns,'sublocacoes',pedido_sublocacoes_listar(p.empresa_id,p.id));
end $$;

create function public.pedido_sublocacao_pedidos_buscar(p_empresa uuid,p_busca text default '') returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) or not funcionario_tabela_permitida(p_empresa,'separacoes_pedidos','select') then raise exception 'Sem acesso';end if;
 return (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from(
  select id,numero_pedido,cliente_nome from separacoes_pedidos where empresa_id=p_empresa and status_comercial<>'cancelado'
  and (coalesce(p_busca,'')='' or numero_pedido::text ilike '%'||left(p_busca,150)||'%' or cliente_nome ilike '%'||left(p_busca,150)||'%')
  order by atualizado_em desc,id limit 30
 )t);
end $$;

create function public.pedido_sublocacao_salvar(p_pedido uuid,p_dados jsonb,p_id uuid default null,p_revisao bigint default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p separacoes_pedidos;ant pedido_sublocacoes;n pedido_sublocacoes;it jsonb;q numeric;lista jsonb;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not funcionario_pode(p.empresa_id,auth.uid(),'comercial.pedidos.editar') then raise exception 'Sem permissão para gerir sublocações';end if;
 select * into strict p from separacoes_pedidos where id=p_pedido for update;
 perform pg_advisory_xact_lock(hashtextextended(p.empresa_id::text,0));
 if p_id is not null then
  select * into strict ant from pedido_sublocacoes where id=p_id and pedido_id=p.id for update;
  if p_revisao is distinct from ant.revisao then raise exception 'Sublocação alterada em outra tela. Atualize antes de salvar';end if;
 end if;
 n:=jsonb_populate_record(null::pedido_sublocacoes,p_dados-ARRAY['id','empresa_id','pedido_id','criado_por','criado_em','atualizado_em','revisao']);
 if not exists(select 1 from itens where id=n.item_id and empresa_id=p.empresa_id) or not exists(select 1 from fornecedores where id=n.fornecedor_id and empresa_id=p.empresa_id) then raise exception 'Item ou fornecedor não pertence à empresa';end if;
 if n.fornecedor_id is distinct from ant.fornecedor_id and exists(select 1 from fornecedores where id=n.fornecedor_id and lower(coalesce(status,'')) in ('inativo','inativa')) then raise exception 'Selecione um fornecedor ativo';end if;
 if n.quantidade is null or n.quantidade<=0 or n.custo_unitario is null or n.custo_unitario<0 or n.custo_unitario::text in ('NaN','Infinity','-Infinity') then raise exception 'Revise quantidade e custo';end if;
 if n.retirada is null or n.devolucao is null or n.devolucao<n.retirada or n.status not in ('cotacao','confirmada','recebida','devolvida','cancelada') or n.status is null then raise exception 'Revise período e situação';end if;
 if ant.status='devolvida' then raise exception 'Sublocação já devolvida. O histórico está encerrado';end if;
 if (p_id is null and n.status not in ('cotacao','confirmada')) or (ant.status='cotacao' and n.status not in ('cotacao','confirmada','cancelada'))
  or (ant.status='confirmada' and n.status not in ('confirmada','recebida','cancelada')) or (ant.status='recebida' and n.status not in ('recebida','devolvida'))
  or ant.status='cancelada' then raise exception 'Mudança de situação inválida. Confirme, receba e devolva nesta ordem';end if;
 if ant.status='recebida' and row(n.item_id,n.fornecedor_id,n.quantidade) is distinct from row(ant.item_id,ant.fornecedor_id,ant.quantidade) then raise exception 'Não altere item, fornecedor ou quantidade depois do recebimento';end if;
 if (p.operacao->'carregamento'->>'iniciado_em' is not null or coalesce(p.status_operacional,'')<>'')
  and (p_id is null or row(n.item_id,n.fornecedor_id,n.quantidade) is distinct from row(ant.item_id,ant.fornecedor_id,ant.quantidade)
   or (n.status='cancelada' and ant.status<>'cancelada')) then raise exception 'Carregamento iniciado: preserve a origem das peças e registre ajustes com o responsável operacional';end if;
 if n.status in ('confirmada','recebida') and (p.status_comercial='cancelado' or p.encerrado_operacional_em is not null) and n.status is distinct from ant.status then raise exception 'Pedido encerrado: apenas devolva as peças já recebidas';end if;
 n.id:=coalesce(p_id,gen_random_uuid());n.empresa_id:=p.empresa_id;n.pedido_id:=p.id;n.criado_por:=coalesce(ant.criado_por,auth.uid());
 n.criado_em:=coalesce(ant.criado_em,now());n.atualizado_em:=now();n.revisao:=coalesce(ant.revisao,-1)+1;n.observacao:=btrim(coalesce(n.observacao,''));
 if length(n.observacao)>2000 then raise exception 'Observação muito longa';end if;
 select t into it from jsonb_array_elements(pedido_sublocacao_itens(p.id)) t where t->>'item_id'=n.item_id::text;
 if n.status not in ('cancelada','devolvida') and (it is null or n.quantidade>(it->>'quantidade')::numeric) then raise exception 'Selecione um item do pedido e respeite sua quantidade';end if;
 insert into pedido_sublocacoes select n.* on conflict(id) do update set item_id=excluded.item_id,fornecedor_id=excluded.fornecedor_id,
  quantidade=excluded.quantidade,custo_unitario=excluded.custo_unitario,retirada=excluded.retirada,devolucao=excluded.devolucao,
  status=excluded.status,observacao=excluded.observacao,revisao=excluded.revisao,atualizado_em=excluded.atualizado_em;
 perform pedido_sublocacao_validar(p.id);
 if p.status_comercial in ('pre_reserva','aprovado','enviado') and p.encerrado_operacional_em is null then
  select coalesce(jsonb_agg(jsonb_build_object('item_id',s.item_id,'quantidade_solicitada',s.quantidade_solicitada)),'[]') into lista from separacoes_itens s where s.separacao_pedido_id=p.id;
  perform operacao_validar_reserva(p.empresa_id,p.id,lista,coalesce(p.data_entrega,p.data_evento),coalesce(p.data_coleta,p.data_evento_fim,p.data_evento));
 end if;
 insert into pedido_sublocacoes_historico(empresa_id,sublocacao_id,usuario_id,antes,depois) values(p.empresa_id,n.id,auth.uid(),case when ant.id is null then null else to_jsonb(ant) end,to_jsonb(n));
 return pedido_sublocacao_base(p.id);
end $$;

create function public.pedido_item_outros_pedidos(p_pedido uuid,p_item uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare p separacoes_pedidos;r jsonb;
begin
 select * into strict p from separacoes_pedidos where id=p_pedido;
 if auth.uid() is null or not eh_membro_empresa(p.empresa_id) or not funcionario_tabela_permitida(p.empresa_id,'separacoes_pedidos','select') then raise exception 'Sem acesso';end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.evento,t.numero),'[]') into r from(
  select sp.id,sp.numero_pedido numero,sp.cliente_nome cliente,sp.contato_cliente contato,sp.data_evento evento,sp.local_nome local,
   greatest(sum(s.quantidade_solicitada)-pedido_sublocado_qtd(sp.id,p_item),0) quantidade,
   sp.status_comercial status,sp.status_operacional etapa
  from separacoes_pedidos sp join separacoes_itens s on s.separacao_pedido_id=sp.id,
   lateral reserva_periodo(sp.empresa_id,coalesce(sp.data_entrega,sp.data_evento),coalesce(sp.data_coleta,sp.data_evento_fim,sp.data_evento)) janela,
   lateral reserva_periodo(p.empresa_id,coalesce(p.data_entrega,p.data_evento),coalesce(p.data_coleta,p.data_evento_fim,p.data_evento)) alvo
  where sp.empresa_id=p.empresa_id and sp.id<>p.id and s.item_id=p_item and sp.status_comercial in ('pre_reserva','aprovado','enviado')
   and sp.encerrado_operacional_em is null and coalesce(sp.status,'')<>'cancelado' and janela.inicio<=alvo.fim and janela.fim>=alvo.inicio
  group by sp.id having sum(s.quantidade_solicitada)>pedido_sublocado_qtd(sp.id,p_item)
 )t;
 return r;
end $$;
revoke all on function public.pedido_sublocacoes_listar(uuid,uuid),public.pedido_sublocacao_base(uuid),public.pedido_sublocacao_salvar(uuid,jsonb,uuid,bigint),public.pedido_item_outros_pedidos(uuid,uuid),public.pedido_sublocacao_pedidos_buscar(uuid,text) from public,anon;
grant execute on function public.pedido_sublocacoes_listar(uuid,uuid),public.pedido_sublocacao_base(uuid),public.pedido_sublocacao_salvar(uuid,jsonb,uuid,bigint),public.pedido_item_outros_pedidos(uuid,uuid),public.pedido_sublocacao_pedidos_buscar(uuid,text) to authenticated;

-- Only owned demand consumes the owned inventory. Apply before expanding kits.
do $$ declare nome text;d text;novo text;assinatura text;
begin
 foreach assinatura in array array['public.operacao_validar_reserva(uuid,uuid,jsonb,date,date)','public.pedido_disponibilidade_comercial(uuid,uuid,jsonb,date,date)'] loop
  select pg_get_functiondef(assinatura::regprocedure) into d;
  novo:=replace(d,'sum((x->>''quantidade_solicitada'')::numeric) qtd','greatest(sum((x->>''quantidade_solicitada'')::numeric)-public.pedido_sublocado_qtd(p_pedido,(x->>''item_id'')::uuid),0) qtd');
  if novo=d then raise exception 'Validação de reserva inesperada: %',assinatura;end if;execute novo;
 end loop;
 select pg_get_functiondef('public.operacao_livre_calc(uuid,date,date,uuid)'::regprocedure) into d;
 novo:=replace(d,'s.quantidade_solicitada q,','greatest(s.quantidade_solicitada-greatest(public.pedido_sublocado_qtd(s.separacao_pedido_id,s.item_id)-coalesce(sum(s.quantidade_solicitada) over(partition by s.separacao_pedido_id,s.item_id order by s.id rows between unbounded preceding and 1 preceding),0),0),0) q,');
 if novo=d then raise exception 'Cálculo de disponibilidade inesperado';end if;execute novo;
 select pg_get_functiondef('public.pedido_estoque_detalhes(uuid,uuid,date,uuid,date,date)'::regprocedure) into d;
 novo:=replace(d,'s.quantidade_solicitada qtd,','greatest(s.quantidade_solicitada-greatest(public.pedido_sublocado_qtd(s.separacao_pedido_id,s.item_id)-coalesce(sum(s.quantidade_solicitada) over(partition by s.separacao_pedido_id,s.item_id order by s.id rows between unbounded preceding and 1 preceding),0),0),0) qtd,');
 if novo=d then raise exception 'Detalhamento de estoque inesperado';end if;execute novo;
end $$;

alter function public.pedido_salvar_integrado(uuid,jsonb,jsonb,bigint) rename to pedido_salvar_integrado_sem_sublocacao;
revoke all on function public.pedido_salvar_integrado_sem_sublocacao(uuid,jsonb,jsonb,bigint) from public,anon,authenticated;
create function public.pedido_salvar_integrado(p_id uuid,p_pedido jsonb,p_itens jsonb,p_revisao bigint default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r jsonb;
begin
 r:=pedido_salvar_integrado_sem_sublocacao(p_id,p_pedido,p_itens,p_revisao);
 perform pedido_sublocacao_validar((r->>'id')::uuid);
 return r;
end $$;
revoke all on function public.pedido_salvar_integrado(uuid,jsonb,jsonb,bigint) from public,anon;
grant execute on function public.pedido_salvar_integrado(uuid,jsonb,jsonb,bigint) to authenticated;

-- The separation cannot finish with outsourced pieces still waiting for receipt.
create function public.pedido_sublocacao_exigir_recebimento() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.status is distinct from old.status and new.status in ('separado','separado_com_divergencia')
  and exists(select 1 from pedido_sublocacoes where pedido_id=new.id and status='confirmada') then
  raise exception 'Há peças sublocadas aguardando recebimento. Confira a chegada e registre Recebida na sublocação antes de finalizar a Triagem.';
 end if;
 return new;
end $$;
revoke all on function public.pedido_sublocacao_exigir_recebimento() from public,anon,authenticated;
create trigger pedido_sublocacao_recebimento before update of status on public.separacoes_pedidos for each row execute function public.pedido_sublocacao_exigir_recebimento();
notify pgrst,'reload schema';
commit;
