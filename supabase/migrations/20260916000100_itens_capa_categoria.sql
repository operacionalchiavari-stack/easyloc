begin;
-- Home do catálogo (menu de categorias, pedido explícito do usuário): cada
-- categoria mostra a foto de UM item marcado como sua "capa" — mesmo padrão
-- de destaque_site (booleano solto no item, categoria continua texto livre,
-- sem tabela de lookup). Sem item marcado como capa numa categoria, a Home
-- cai pro primeiro item dela (ver categoryCoverPhoto() em catalogo.mjs).
alter table public.itens add column if not exists capa_categoria boolean not null default false;
comment on column public.itens.capa_categoria is 'Se a foto deste item é a capa da sua categoria na Home do catálogo.';

-- catalogo_acervo() é a única fonte de itens do catálogo — tanto
-- catalogo_carregar (decorador externo) quanto catalogo_carregar_interno
-- (equipe) só chamam essa função, então adicionar a coluna aqui basta pros
-- dois caminhos (ver 20260914000200_catalogo_acervo_unificado.sql).
create or replace function public.catalogo_acervo(p_empresa_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',i.id,'tipo',i.tipo,'produto',i.produto,'produto_base',i.produto_base,
  'material',i.material,'cor',i.cor,'categoria',i.categoria,'familia',i.familia,
  'estilo',i.estilo,'referencia',i.referencia,'marca_modelo',i.marca_modelo,
  'descricao_total',i.descricao_total,'descricao_complementar',i.descricao_complementar,
  'largura',i.largura,'altura',i.altura,'profundidade',i.profundidade,
  'foto_url',i.foto_url,'destaque_site',i.destaque_site,'capa_categoria',i.capa_categoria,
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
commit;
