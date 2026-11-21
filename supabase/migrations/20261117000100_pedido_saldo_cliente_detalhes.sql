-- Mesmas permissões e mesmos títulos que compõem os indicadores do pedido.
create function public.pedido_saldo_conta_cliente_detalhes(p_empresa uuid,p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare saldo jsonb; lancamentos jsonb;
begin
  saldo := public.pedido_saldo_conta_cliente(p_empresa,p_cliente);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'origem',t.origem,'descricao',t.descricao,'emissao',t.emissao,
    'observacoes',t.observacoes,'numero_pedido',p.numero_pedido,
    'valor',t.valor,'pago',t.pago,'aberto',t.aberto
  ) order by t.emissao desc,t.created_at desc),'[]'::jsonb)
  into lancamentos
  from public.fin_pagar t
  left join public.separacoes_pedidos p on p.empresa_id=t.empresa_id and p.id=(
    select pt.pedido_id from public.fin_bv_partes pt
    where pt.pagar_id=t.id and pt.empresa_id=p_empresa and pt.cliente_id=p_cliente and pt.ativo
    limit 1)
  where t.empresa_id=p_empresa and t.fornecedor_id=p_cliente
    and t.status<>'cancelado' and t.aberto>0
    and (t.origem='credito_cliente' or (t.origem='bv' and exists (
      select 1 from public.fin_bv_partes pt where pt.pagar_id=t.id
        and pt.empresa_id=p_empresa and pt.cliente_id=p_cliente and pt.ativo)));
  return saldo || jsonb_build_object('lancamentos',lancamentos);
end $$;
revoke all on function public.pedido_saldo_conta_cliente_detalhes(uuid,uuid) from public,anon;
grant execute on function public.pedido_saldo_conta_cliente_detalhes(uuid,uuid) to authenticated;
