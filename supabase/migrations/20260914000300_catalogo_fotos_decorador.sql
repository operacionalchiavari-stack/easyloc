begin;
-- Aplica somente a galeria do cliente autenticado, sem alterar os itens do acervo.
create or replace function public.catalogo_fotos_decorador(p_acervo jsonb,p_empresa uuid,p_cliente uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(
 case when fotos.galeria is not null then jsonb_set(item,'{itens_fotos}',
  coalesce((select jsonb_agg(f) from jsonb_array_elements(item->'itens_fotos') f where f->>'tipo'<>'galeria'),'[]'::jsonb) || fotos.galeria)
 else item end order by pos),'[]'::jsonb)
 from jsonb_array_elements(p_acervo) with ordinality as acervo(item,pos)
 left join lateral (
  select jsonb_agg(jsonb_build_object('tipo',f.tipo,'titulo',f.titulo,'url',f.url,'ordem',f.ordem,'cliente_id',f.cliente_id) order by f.ordem,f.id) as galeria
  from public.itens_fotos f where f.item_id=(item->>'id')::uuid and f.empresa_id=p_empresa and f.cliente_id=p_cliente and f.tipo='galeria' and nullif(f.url,'') is not null
 ) fotos on true;
$$;
revoke all on function public.catalogo_fotos_decorador(jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.catalogo_fotos_decorador(jsonb,uuid,uuid) to service_role;
create or replace function public.catalogo_carregar(p_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_cliente uuid; v_empresa uuid;
begin
 select a.cliente_id,a.empresa_id into v_cliente,v_empresa
 from public.catalogo_sessoes s join public.catalogo_acessos a on a.id=s.acesso_id
 join public.clientes_empresas c on c.id=a.cliente_id and c.empresa_id=a.empresa_id
 where s.token_hash=encode(digest(p_token,'sha256'),'hex') and s.expires_at>now() and a.ativo;
 if v_cliente is null then raise exception 'Sessão do catálogo expirada'; end if;
 return jsonb_build_object(
  'empresa',(select jsonb_build_object('nome',e.nome,'logo_url',e.logo_url) from public.empresas e where e.id=v_empresa),
  'decorador',(select jsonb_build_object('id',c.id,'nome',c.nome_razao,'logo_url',c.catalogo_logo_url,'cor_primaria',c.catalogo_cor_primaria,'cor_secundaria',c.catalogo_cor_secundaria) from public.clientes_empresas c where c.id=v_cliente),
  'itens',public.catalogo_fotos_decorador(public.catalogo_acervo(v_empresa),v_empresa,v_cliente));
end; $$;
revoke all on function public.catalogo_carregar(text) from public;
grant execute on function public.catalogo_carregar(text) to anon,authenticated,service_role;


commit;
