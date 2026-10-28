-- Out/2026 — Personalização passa a usar os materiais do Almoxarifado (planilha 1IIW…, aba Produtos), e o pedido
-- que leva um item personalizado reserva esses materiais (Reservado / Pré-reserva), mostrados no Estoque atual do
-- Almoxarifado. Pedido do usuário: "o próprio sistema sabe quando vai faltar material".

alter table public.personalizacoes_insumos
  alter column insumo_id drop not null,
  add column if not exists almox_produto_id text,
  add column if not exists material_nome text,
  add column if not exists unidade text;

-- As 7 personalizações de teste usavam os 20 materiais de exemplo (tabela insumos); o usuário aceitou apagá-las.
delete from public.personalizacoes p
 where exists (select 1 from public.personalizacoes_insumos pi where pi.personalizacao_id = p.id and pi.insumo_id is not null);

alter table public.personalizacoes_insumos drop constraint if exists personalizacoes_insumos_material_chk;
alter table public.personalizacoes_insumos add constraint personalizacoes_insumos_material_chk
  check (almox_produto_id is not null or insumo_id is not null);
create index if not exists personalizacoes_insumos_almox_idx on public.personalizacoes_insumos (empresa_id, almox_produto_id);

create or replace function public.almox_num(v text)
returns numeric language sql immutable as $$
  select case when trim(coalesce(v,'')) ~ '^-?[0-9.]*,?[0-9]*$' and trim(coalesce(v,'')) ~ '[0-9]'
              then case when position(',' in v) > 0 then replace(replace(trim(v),'.',''),',','.')::numeric else trim(v)::numeric end
              else 0 end
$$;

-- Materiais do Almoxarifado (só a empresa dona da planilha, só quem é da empresa).
create or replace function public.almox_produtos(p_empresa_id uuid)
returns table(id text, codigo text, produto text, categoria text, unidade text,
              estoque_atual numeric, estoque_minimo numeric, valor_custo numeric, status text)
language plpgsql stable security definer set search_path = public as $$
declare
  planilha constant text := '1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI';
  cab jsonb;
  i_id int; i_cod int; i_prod int; i_cat int; i_un int; i_atual int; i_min int; i_custo int; i_status int;
begin
  if p_empresa_id is distinct from public.gs_empresa_dona() or not public.eh_membro_empresa(p_empresa_id) then return; end if;
  select l.valores into cab from gs_linhas l where l.planilha_id = planilha and l.aba = 'Produtos' and l.linha = 1;
  if cab is null then return; end if;
  select (o-1) into i_id     from jsonb_array_elements_text(cab) with ordinality e(v,o) where v = 'ID';
  select (o-1) into i_cod    from jsonb_array_elements_text(cab) with ordinality e(v,o) where v = 'Codigo';
  select (o-1) into i_prod   from jsonb_array_elements_text(cab) with ordinality e(v,o) where v = 'Produto';
  select (o-1) into i_cat    from jsonb_array_elements_text(cab) with ordinality e(v,o) where v = 'Categoria';
  select (o-1) into i_un     from jsonb_array_elements_text(cab) with ordinality e(v,o) where v = 'Unidade';
  select (o-1) into i_atual  from jsonb_array_elements_text(cab) with ordinality e(v,o) where v = 'EstoqueAtual';
  select (o-1) into i_min    from jsonb_array_elements_text(cab) with ordinality e(v,o) where v = 'EstoqueMinimo';
  select (o-1) into i_custo  from jsonb_array_elements_text(cab) with ordinality e(v,o) where v = 'ValorCusto';
  select (o-1) into i_status from jsonb_array_elements_text(cab) with ordinality e(v,o) where v = 'Status';
  return query
    select l.valores->>i_id, l.valores->>i_cod, l.valores->>i_prod, l.valores->>i_cat, l.valores->>i_un,
           public.almox_num(l.valores->>i_atual), public.almox_num(l.valores->>i_min), public.almox_num(l.valores->>i_custo),
           coalesce(l.valores->>i_status, '')
      from gs_linhas l
     where l.planilha_id = planilha and l.aba = 'Produtos' and l.linha > 1 and coalesce(l.valores->>i_id, '') <> ''
     order by l.valores->>i_prod;
end $$;

-- Material reservado por pedido com item personalizado (evento ainda não passou, pedido não encerrado):
-- pré-reserva -> "Pré-reserva"; reservado (aprovado/finalizado/enviado) -> "Reservado". Orçamento e cancelado não contam.
-- A personalização vem da linha do projeto do pedido (observacoes.projeto_comercial, campo personalizacao_id);
-- a quantidade de material é por unidade do item.
create or replace function public.almox_reservas_personalizacao(p_empresa_id uuid)
returns table(produto_id text, reservado numeric, pre_reserva numeric, pedidos jsonb)
language sql stable security definer set search_path = public as $$
  with ped as (
    select p.id, p.numero_pedido, p.cliente_nome, p.data_evento,
           case when p.status_comercial = 'pre_reserva' then 'pre' else 'res' end as tipo,
           p.observacoes->'projeto_comercial'->'dados'->'ambientes' as ambs
      from separacoes_pedidos p
     where p.empresa_id = p_empresa_id
       and public.eh_membro_empresa(p_empresa_id)
       and p.status_comercial in ('pre_reserva','aprovado','finalizado','enviado')
       and coalesce(p.data_evento_fim, p.data_evento, current_date) >= current_date
       and p.encerrado_operacional_em is null
  ), linhas as (
    select ped.id, ped.numero_pedido, ped.cliente_nome, ped.data_evento, ped.tipo,
           (it->>'personalizacao_id')::uuid as pers,
           greatest(coalesce(public.almox_num(it->>'quantidade'), 0), 0) as qtd
      from ped
      cross join lateral jsonb_array_elements(case when jsonb_typeof(ped.ambs) = 'array' then ped.ambs else '[]'::jsonb end) a
      cross join lateral jsonb_array_elements(case when jsonb_typeof(a->'itens') = 'array' then a->'itens' else '[]'::jsonb end) it
     where coalesce(it->>'personalizacao_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ), por_pedido as (
    select pi.almox_produto_id as prod, l.id, l.numero_pedido, l.cliente_nome, l.data_evento, l.tipo,
           sum(l.qtd * pi.quantidade) as q
      from linhas l
      join personalizacoes_insumos pi on pi.personalizacao_id = l.pers and pi.empresa_id = p_empresa_id
     where pi.almox_produto_id is not null
     group by 1,2,3,4,5,6
  )
  select prod,
         coalesce(sum(q) filter (where tipo = 'res'), 0),
         coalesce(sum(q) filter (where tipo = 'pre'), 0),
         jsonb_agg(jsonb_build_object('pedido_id', id, 'numero', numero_pedido, 'cliente', cliente_nome,
                                      'data_evento', data_evento, 'tipo', tipo, 'quantidade', q) order by data_evento)
    from por_pedido group by prod
$$;

revoke all on function public.almox_produtos(uuid) from public, anon;
revoke all on function public.almox_reservas_personalizacao(uuid) from public, anon;
grant execute on function public.almox_produtos(uuid) to authenticated;
grant execute on function public.almox_reservas_personalizacao(uuid) to authenticated;
