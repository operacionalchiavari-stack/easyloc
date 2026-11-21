-- Parâmetros > Financeiro (nov/2026, pedido do usuário): o que entra em "Recebimentos previstos" e no fluxo Previsto.
-- Cada empresa escolhe considerar pedidos em pré-reserva e/ou em orçamento (os dois ligados por padrão).
alter table public.empresa_financeiro
  add column if not exists previsto_pre_reserva boolean not null default true,
  add column if not exists previsto_orcamento boolean not null default true;

create or replace function public.fin_recebimentos_previstos(p_empresa uuid)
returns table(pedido_id uuid, pedido_numero text, cliente_nome text, situacao text, pre_reserva_ate date, data_evento date,
              dia date, valor numeric, componente text, parcela int, parcelas int, forma text, sem_parcelas boolean, valor_pedido numeric)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_sit text[];
begin
  if not eh_membro_empresa(p_empresa) or not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then
    raise exception 'Sem acesso ao financeiro' using errcode = '42501';
  end if;
  select array_remove(array[case when coalesce(f.previsto_pre_reserva, true) then 'pre_reserva' end,
                            case when coalesce(f.previsto_orcamento, true) then 'orcamento' end], null)
    into v_sit from (select 1) x left join empresa_financeiro f on f.empresa_id = p_empresa;
  return query
  with ped as (
    select p.* from separacoes_pedidos p
     where p.empresa_id = p_empresa and p.status_comercial = any(v_sit)
       and coalesce(p.status, '') <> 'cancelado'
       and coalesce(p.observacoes->>'teste_cronograma', '') <> 'true' and coalesce(p.observacoes->>'teste_ia', '') <> 'true'
  ), parc as (
    select p.id, x, row_number() over (partition by p.id, coalesce(x->>'componente', 'locacao') order by nullif(x->>'vencimento', ''), o) n,
           count(*) over (partition by p.id, coalesce(x->>'componente', 'locacao')) t
      from ped p, jsonb_array_elements(case when jsonb_typeof(p.observacoes->'parcelas_financeiras') = 'array' then p.observacoes->'parcelas_financeiras' else '[]'::jsonb end) with ordinality as e(x, o)
     where coalesce(nullif(x->>'valor', '')::numeric, 0) > 0
  )
  select p.id, p.numero_pedido::text, p.cliente_nome::text, p.status_comercial::text, p.pre_reserva_ate, p.data_evento,
         nullif(left(pa.x->>'vencimento', 10), '')::date, nullif(pa.x->>'valor', '')::numeric,
         coalesce(pa.x->>'componente', 'locacao'), pa.n::int, pa.t::int, pa.x->>'metodo', false, p.valor_total
    from parc pa join ped p on p.id = pa.id
  union all
  select p.id, p.numero_pedido::text, p.cliente_nome::text, p.status_comercial::text, p.pre_reserva_ate, p.data_evento,
         p.data_evento, p.valor_total, 'locacao', 1, 1, null, true, p.valor_total
    from ped p
   where coalesce(p.valor_total, 0) > 0 and not exists (select 1 from parc pa where pa.id = p.id);
end $$;
revoke all on function public.fin_recebimentos_previstos(uuid) from public, anon;
grant execute on function public.fin_recebimentos_previstos(uuid) to authenticated;
