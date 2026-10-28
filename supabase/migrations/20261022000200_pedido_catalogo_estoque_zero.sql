-- No Comercial, zero precisa ser exibido. O catálogo externo mantém suas regras.
create function public.pedido_catalogo_estoque(p_data date, p_empresa_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_est boolean; v_disp boolean;
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa_id) or not (
    funcionario_pode(p_empresa_id,auth.uid(),'comercial.pedidos.visualizar') or
    funcionario_pode(p_empresa_id,auth.uid(),'comercial.pedidos.criar')) then
    raise exception 'Sem permissão para consultar estoque do pedido' using errcode='42501';
  end if;
  v_est := catalogo_parametro_permite(p_empresa_id,'estoque','equipe',null);
  v_disp := catalogo_parametro_permite(p_empresa_id,'disponivel','equipe',null);
  if not v_est and not v_disp then return '{}'::jsonb; end if;
  return coalesce((select jsonb_object_agg(d.item_id::text,jsonb_build_array(
    case when v_est then d.total end,case when v_disp then d.livre end))
    from operacao_disponibilidade_calc(p_empresa_id,p_data) d),'{}'::jsonb);
end $$;
revoke all on function public.pedido_catalogo_estoque(date,uuid) from public,anon;
grant execute on function public.pedido_catalogo_estoque(date,uuid) to authenticated;
