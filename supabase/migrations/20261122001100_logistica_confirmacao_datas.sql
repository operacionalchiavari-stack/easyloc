-- O painel logístico consulta as datas confirmadas pelo Comercial, sem editar a confirmação.
create or replace function public.logistica_confirmacoes_datas(p_empresa uuid, p_pedidos uuid[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not coalesce(eh_membro_empresa(p_empresa), false) or not coalesce(seguranca_2fa_ok(), false)
     or not coalesce((operacao_pode(p_empresa, 'logistica.planejamento.visualizar')
             or operacao_pode(p_empresa, 'logistica.cronograma.visualizar')), false) then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'pedido_id', pedido_id, 'data_entrega', data_entrega, 'data_evento', data_evento,
    'data_coleta', data_coleta, 'por', confirmado_por_nome, 'em', confirmado_em))
    from comercial_confirmacoes_datas
    where empresa_id = p_empresa and pedido_id = any(p_pedidos)), '[]'::jsonb);
end $$;

revoke all on function public.logistica_confirmacoes_datas(uuid, uuid[]) from public, anon;
grant execute on function public.logistica_confirmacoes_datas(uuid, uuid[]) to authenticated;
notify pgrst, 'reload schema';
