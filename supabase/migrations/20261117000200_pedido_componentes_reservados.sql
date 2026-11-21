-- Acrescenta reservas reais ao mapa já consultado pelo catálogo, sem contar manutenção como reserva.
create or replace function public.pedido_catalogo_estoque(p_data date,p_empresa_id uuid,p_pedido uuid default null,p_inicio date default null,p_fim date default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_est boolean; v_disp boolean; v_ini date; v_fim date;
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa_id) or not (
    funcionario_pode(p_empresa_id,auth.uid(),'comercial.pedidos.visualizar') or
    funcionario_pode(p_empresa_id,auth.uid(),'comercial.pedidos.criar')) then
    raise exception 'Sem permissão para consultar estoque do pedido' using errcode='42501';
  end if;
  v_est:=catalogo_parametro_permite(p_empresa_id,'estoque','equipe',null);
  v_disp:=catalogo_parametro_permite(p_empresa_id,'disponivel','equipe',null);
  if not v_est and not v_disp then return '{}'::jsonb; end if;
  v_ini:=coalesce(p_inicio,p_data);v_fim:=coalesce(p_fim,v_ini);
  if v_ini is null then raise exception 'Informe a data'; end if;
  if v_fim<v_ini or v_fim-v_ini>60 then v_fim:=v_ini; end if;
  return coalesce((select jsonb_object_agg(d.item_id::text,jsonb_build_array(
    case when v_est then d.total end,
    case when v_disp then d.livre end,
    case when v_disp and d.item_id in (select public.acervo_itens_bloqueados(p_empresa_id)) then 1 end,
    case when v_disp then d.reservado end
  )) from operacao_livre_calc(p_empresa_id,v_ini,v_fim,p_pedido) d),'{}'::jsonb);
end $$;
revoke all on function public.pedido_catalogo_estoque(date,uuid,uuid,date,date) from public,anon;
grant execute on function public.pedido_catalogo_estoque(date,uuid,uuid,date,date) to authenticated,service_role;
