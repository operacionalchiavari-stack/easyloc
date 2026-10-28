-- O Comercial recebe somente o saldo disponível, sem acesso ao extrato financeiro completo.
create function public.pedido_saldo_conta_cliente(p_empresa uuid,p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare bv numeric; credito numeric;
begin
  if not eh_membro_empresa(p_empresa) or not (
    (funcionario_pode(p_empresa,auth.uid(),'comercial.pedidos.visualizar') and funcionario_pode(p_empresa,auth.uid(),'comercial.pedidos.valores'))
    or fin_pode(p_empresa,'financeiro.fluxo.visualizar')) then
    raise exception 'Sem permissão para consultar o saldo do cliente' using errcode='42501'; end if;
  if not exists(select 1 from clientes_empresas where id=p_cliente and empresa_id=p_empresa) then
    raise exception 'Cliente não encontrado nesta empresa'; end if;
  select coalesce(sum(aberto) filter(where origem='bv' and exists(
    select 1 from fin_bv_comissoes b where b.pagar_id=t.id and b.empresa_id=p_empresa and b.cliente_id=p_cliente and b.ativo)),0),
    coalesce(sum(aberto) filter(where origem='credito_cliente'),0)
    into bv,credito from fin_pagar t where empresa_id=p_empresa and fornecedor_id=p_cliente
      and origem in ('bv','credito_cliente') and status<>'cancelado';
  return jsonb_build_object('bv',bv,'credito',credito,'total',bv+credito);
end $$;
revoke all on function public.pedido_saldo_conta_cliente(uuid,uuid) from public,anon;
grant execute on function public.pedido_saldo_conta_cliente(uuid,uuid) to authenticated;
