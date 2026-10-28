create function public.comercial_fluxo_pedidos(p_empresa uuid,p_pedidos uuid[]) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare resultado jsonb;
begin
 if auth.uid() is null or not eh_membro_empresa(p_empresa) or not funcionario_pode(p_empresa,auth.uid(),'comercial.pedidos.visualizar') then
  raise exception 'Sem permissão para consultar o fluxo dos pedidos' using errcode='42501'; end if;
 if coalesce(cardinality(p_pedidos),0)>500 then raise exception 'Consulte até 500 pedidos por vez'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'etapa',pedido_fluxo_etapa(p),
  'finalizado',exists(select 1 from fin_posicoes_finais f where f.pedido_id=p.id and f.empresa_id=p_empresa and f.status='confirmado'))),'[]')
 into resultado from separacoes_pedidos p where p.empresa_id=p_empresa and p.id=any(p_pedidos);
 return resultado;
end $$;
revoke all on function public.comercial_fluxo_pedidos(uuid,uuid[]) from public,anon;
grant execute on function public.comercial_fluxo_pedidos(uuid,uuid[]) to authenticated;
notify pgrst,'reload schema';
