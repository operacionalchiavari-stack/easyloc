-- Central de Pedidos: "% pago" a partir das contas a receber do Financeiro, para quem vê pedidos (sem precisar ver o Financeiro).
create or replace function public.pedidos_recebimentos(p_empresa uuid, p_pedidos uuid[])
returns table(pedido_id uuid, devido numeric, recebido numeric, proximo date, titulos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_membro_empresa(p_empresa) or not (public.operacao_pode(p_empresa, 'comercial.pedidos.visualizar') or public.operacao_pode(p_empresa, 'financeiro.fluxo.visualizar')) then
    raise exception 'Sem permissão';
  end if;
  return query
    select r.pedido_id, sum(r.valor)::numeric, sum(greatest(r.valor - coalesce(r.aberto, 0), 0))::numeric,
           min(r.vencimento) filter (where coalesce(r.aberto, 0) > 0.004)::date, count(*)::int
      from fin_receber r
     where r.empresa_id = p_empresa and r.pedido_id = any(p_pedidos) and coalesce(r.status, '') <> 'cancelado'
     group by r.pedido_id;
end $$;
revoke all on function public.pedidos_recebimentos(uuid, uuid[]) from public, anon;
grant execute on function public.pedidos_recebimentos(uuid, uuid[]) to authenticated;
