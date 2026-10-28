alter table public.empresa_fluxo_pedidos add column acervo_antecedencia_horas numeric not null default 24 check(acervo_antecedencia_horas between 0 and 8760);
create function public.pedido_fluxo_configurar(p_empresa uuid,p_pre_reservas boolean,p_retorno_simultaneo boolean,p_acervo_antecedencia numeric) returns void language plpgsql security definer set search_path=public as $$
begin
 if p_acervo_antecedencia is null or p_acervo_antecedencia<0 or p_acervo_antecedencia>8760 then raise exception 'Antecedencia invalida';end if;
 perform pedido_fluxo_configurar(p_empresa,p_pre_reservas,p_retorno_simultaneo);
 update empresa_fluxo_pedidos set acervo_antecedencia_horas=p_acervo_antecedencia where empresa_id=p_empresa;
end $$;
revoke all on function public.pedido_fluxo_configurar(uuid,boolean,boolean,numeric) from public,anon;
grant execute on function public.pedido_fluxo_configurar(uuid,boolean,boolean,numeric) to authenticated;
alter function public.acervo_painel(uuid) rename to acervo_painel_antes_prazos;
revoke all on function public.acervo_painel_antes_prazos(uuid) from public,anon,authenticated;
create function public.acervo_painel(p_empresa uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare b jsonb;ev jsonb;horas numeric;begin
 b:=acervo_painel_antes_prazos(p_empresa);
 select acervo_antecedencia_horas into horas from empresa_fluxo_pedidos where empresa_id=p_empresa;
 select coalesce(jsonb_agg(e||jsonb_build_object('carregamento_em',(select (o.data+o.hora) at time zone 'America/Sao_Paulo' from operacao_etapas o where o.empresa_id=p_empresa and o.pedido_id=(e->>'id')::uuid and o.tipo='carregamento' and o.hora is not null order by o.data,o.hora limit 1))),'[]') into ev from jsonb_array_elements(b->'eventos') e;
 return b||jsonb_build_object('eventos',ev,'acervo_antecedencia_horas',coalesce(horas,24));
end $$;
revoke all on function public.acervo_painel(uuid) from public,anon;
grant execute on function public.acervo_painel(uuid) to authenticated;
