begin;
-- Uma única projeção pública do acervo. Não inclui custos, saldos ou fotos particulares de clientes.
create or replace function public.catalogo_acervo(p_empresa_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',i.id,'tipo',i.tipo,'produto',i.produto,'produto_base',i.produto_base,
  'material',i.material,'cor',i.cor,'categoria',i.categoria,'familia',i.familia,
  'estilo',i.estilo,'referencia',i.referencia,'marca_modelo',i.marca_modelo,
  'descricao_total',i.descricao_total,'descricao_complementar',i.descricao_complementar,
  'largura',i.largura,'altura',i.altura,'profundidade',i.profundidade,
  'foto_url',i.foto_url,'destaque_site',i.destaque_site,
  'personalizable',exists(select 1 from public.personalizacoes p
    where p.empresa_id=p_empresa_id and p.vinculo_id::text=i.id::text and p.alvo='ITEM' and p.status='ATIVO'),
  'itens_modelos_3d',coalesce((select jsonb_agg(jsonb_build_object('url',m.url,'status',m.status) order by m.id)
    from public.itens_modelos_3d m where m.item_id=i.id and m.empresa_id=p_empresa_id and m.status is distinct from 'removido'),'[]'::jsonb),
  'itens_fotos',coalesce((select jsonb_agg(jsonb_build_object('tipo',f.tipo,'titulo',f.titulo,'url',f.url,'ordem',f.ordem,'cliente_id',f.cliente_id) order by f.ordem,f.id)
    from public.itens_fotos f where f.item_id=i.id and f.empresa_id=p_empresa_id and f.cliente_id is null),'[]'::jsonb)
 ) order by i.categoria,i.produto,i.id),'[]'::jsonb)
 from public.itens i
 where i.empresa_id=p_empresa_id and i.ativo=true and i.exibir_no_site=true and i.tipo in ('Item','Kit');
$$;
revoke all on function public.catalogo_acervo(uuid) from public,anon,authenticated;
grant execute on function public.catalogo_acervo(uuid) to service_role;

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
  'itens',public.catalogo_acervo(v_empresa));
end; $$;
revoke all on function public.catalogo_carregar(text) from public;
grant execute on function public.catalogo_carregar(text) to anon,authenticated,service_role;

create or replace function public.catalogo_carregar_interno(p_empresa_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.funcionario_pode(p_empresa_id,auth.uid(),'comercial.catalogo.visualizar') then
  raise exception 'Sem permissão para acessar o catálogo';
 end if;
 return jsonb_build_object(
  'empresa',(select jsonb_build_object('nome',e.nome,'logo_url',e.logo_url) from public.empresas e where e.id=p_empresa_id),
  'decorador',null,'itens',public.catalogo_acervo(p_empresa_id));
end; $$;
revoke all on function public.catalogo_carregar_interno(uuid) from public,anon;
grant execute on function public.catalogo_carregar_interno(uuid) to authenticated,service_role;
commit;
