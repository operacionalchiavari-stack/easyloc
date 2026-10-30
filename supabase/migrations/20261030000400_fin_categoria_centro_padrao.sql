-- Plano de contas com centro de custo: cada categoria pode ter um centro de custo padrão.
-- Na DRE (e no extrato), título sem centro de custo usa o centro padrão da categoria.
alter table public.fin_categorias add column if not exists centro_custo_id uuid references public.fin_centros_custo(id) on delete set null;

create or replace function public.fin_dre_centros(p_empresa uuid, p_ini date, p_fim date)
returns table(centro_id uuid, centro text, tipo text, categoria_id uuid, codigo text, categoria text, previsto numeric, realizado numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return query
  with t as (
    select r.centro_custo_id cc, r.categoria_id cat, 'entrada'::text tp, r.valor prev, r.recebido real from fin_receber r where r.empresa_id = p_empresa and r.status <> 'cancelado' and coalesce(r.competencia, r.vencimento) between p_ini and p_fim
    union all
    select g.centro_custo_id, g.categoria_id, 'saida', g.valor, g.pago from fin_pagar g where g.empresa_id = p_empresa and g.status <> 'cancelado' and coalesce(g.competencia, g.vencimento) between p_ini and p_fim),
  u as (select coalesce(t.cc, c.centro_custo_id) cc2, t.* from t left join fin_categorias c on c.id = t.cat)
  select u.cc2, coalesce(cc.nome, 'Sem centro de custo'), u.tp, u.cat, c.codigo, coalesce(c.nome, 'Sem categoria'), sum(u.prev)::numeric, sum(u.real)::numeric
    from u left join fin_centros_custo cc on cc.id = u.cc2 left join fin_categorias c on c.id = u.cat
   group by u.cc2, cc.nome, u.tp, u.cat, c.codigo, c.nome
   order by cc.nome nulls last, u.tp, c.codigo nulls last;
end $$;

create or replace function public.fin_extrato_dre(p_extrato uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(distinct jsonb_build_object(
           'codigo', c.codigo, 'categoria', c.nome, 'centro', cc.nome,
           'competencia', coalesce(t.competencia, t.vencimento))), '[]'::jsonb)
    from fin_baixas b
    cross join lateral (
      select r.categoria_id, r.centro_custo_id, r.competencia, r.vencimento from fin_receber r where r.id = b.receber_id
      union all
      select g.categoria_id, g.centro_custo_id, g.competencia, g.vencimento from fin_pagar g where g.id = b.pagar_id) t
    left join fin_categorias c on c.id = t.categoria_id
    left join fin_centros_custo cc on cc.id = coalesce(t.centro_custo_id, c.centro_custo_id)
   where b.extrato_id = p_extrato and b.estornado_em is null
$$;
revoke all on function public.fin_extrato_dre(uuid) from public, anon, authenticated;
