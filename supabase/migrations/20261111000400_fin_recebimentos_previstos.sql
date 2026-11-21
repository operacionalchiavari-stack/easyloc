-- Recebimentos previstos (nov/2026, igual à Tecnoweld): parcelas dos pedidos que ainda não viraram contas a receber,
-- isto é, em PRÉ-RESERVA e em ORÇAMENTO (só o "Reservado" gera contas a receber). Alimenta o fluxo de caixa "Previsto"
-- (em amarelo) e a aba "Recebimentos previstos". Pedido sem parcelas programadas entra com o valor total na data do
-- evento (sem_parcelas=true). Não gera cobrança nem baixa.
create or replace function public.fin_recebimentos_previstos(p_empresa uuid)
returns table(pedido_id uuid, pedido_numero text, cliente_nome text, situacao text, pre_reserva_ate date, data_evento date,
              dia date, valor numeric, componente text, parcela int, parcelas int, forma text, sem_parcelas boolean, valor_pedido numeric)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not eh_membro_empresa(p_empresa) or not fin_pode(p_empresa, 'financeiro.fluxo.visualizar') then
    raise exception 'Sem acesso ao financeiro' using errcode = '42501';
  end if;
  return query
  with ped as (
    select p.* from separacoes_pedidos p
     where p.empresa_id = p_empresa and p.status_comercial in ('pre_reserva', 'orcamento')
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
