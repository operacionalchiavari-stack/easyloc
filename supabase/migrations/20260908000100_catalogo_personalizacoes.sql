create or replace function public.catalogo_carregar(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_cliente uuid; v_empresa uuid; v_result jsonb;
begin
  select a.cliente_id,a.empresa_id into v_cliente,v_empresa
  from public.catalogo_sessoes s join public.catalogo_acessos a on a.id=s.acesso_id
  where s.token_hash=encode(digest(p_token,'sha256'),'hex') and s.expires_at>now() and a.ativo;
  if v_cliente is null then raise exception 'Sessão do catálogo expirada'; end if;
  select jsonb_build_object(
    'empresa',(select jsonb_build_object('nome',e.nome,'logo_url',e.logo_url) from public.empresas e where e.id=v_empresa),
    'decorador',(select jsonb_build_object('id',c.id,'nome',c.nome_razao,'logo_url',c.catalogo_logo_url,'cor_primaria',c.catalogo_cor_primaria,'cor_secundaria',c.catalogo_cor_secundaria) from public.clientes_empresas c where c.id=v_cliente),
    'itens',coalesce(jsonb_agg(jsonb_build_object(
      'personalizable',exists(select 1 from public.personalizacoes p where p.empresa_id=v_empresa and p.vinculo_id::text=i.id::text and p.alvo='ITEM' and p.status='ATIVO'),
      'id',i.id,'produto',i.produto,'material',i.material,'cor',i.cor,'categoria',i.categoria,
      'descricao_total',i.descricao_total,'descricao_complementar',i.descricao_complementar,
      'largura',i.largura,'altura',i.altura,'profundidade',i.profundidade,'foto_url',i.foto_url,
      'itens_modelos_3d',coalesce((select jsonb_agg(jsonb_build_object('url',m.url,'status',m.status)) from public.itens_modelos_3d m where m.item_id=i.id),'[]'::jsonb),
      'itens_fotos',coalesce((select jsonb_agg(jsonb_build_object('tipo',f.tipo,'titulo',f.titulo,'url',f.url,'ordem',f.ordem,'cliente_id',f.cliente_id) order by f.ordem) from public.itens_fotos f where f.item_id=i.id and (f.tipo<>'galeria' or f.cliente_id=v_cliente)),'[]'::jsonb)
    ) order by i.categoria,i.produto),'[]'::jsonb)
  ) into v_result from public.itens i where i.empresa_id=v_empresa and i.exibir_no_site=true and i.ativo=true;
  return v_result;
end;
$$;

grant execute on function public.catalogo_carregar(text) to anon, authenticated;
