begin;
-- Tela nova "Módulo 3D" (pedido explícito do usuário: mini-menu com 3
-- funcionalidades, um móvel 3D grande centralizado no topo). O modelo
-- mostrado é escolhido pela equipe "da mesma forma que eu escolho a foto
-- da capa da categoria" — mesmo padrão de itens.capa_categoria, só que
-- GLOBAL (uma empresa só pode ter UM item marcado como modelo em
-- destaque, não um por categoria). Só faz sentido em itens que já têm um
-- modelo .glb cadastrado (itens_modelos_3d) — a UI (catalogo.mjs) só
-- mostra o botão de marcar pra esses itens, mas a coluna em si não tem
-- essa restrição no banco (mesma folga que capa_categoria já tem).
alter table public.itens add column if not exists capa_modulo3d boolean not null default false;

create or replace function public.catalogo_acervo(p_empresa_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',i.id,'tipo',i.tipo,'produto',i.produto,'produto_base',i.produto_base,
  'material',i.material,'cor',i.cor,'categoria',i.categoria,'familia',i.familia,
  'subcategoria',i.subcategoria,
  'estilo',i.estilo,'referencia',i.referencia,'marca_modelo',i.marca_modelo,
  'descricao_total',i.descricao_total,'descricao_complementar',i.descricao_complementar,
  'largura',i.largura,'altura',i.altura,'profundidade',i.profundidade,
  'foto_url',i.foto_url,'destaque_site',i.destaque_site,'capa_categoria',i.capa_categoria,
  'capa_modulo3d',i.capa_modulo3d,
  'personalizable',exists(select 1 from public.personalizacoes p
    where p.empresa_id=p_empresa_id and p.vinculo_id::text=i.id::text and p.alvo='ITEM' and p.status='ATIVO'),
  'itens_modelos_3d',coalesce((select jsonb_agg(jsonb_build_object('url',m.url,'status',m.status) order by m.id)
    from public.itens_modelos_3d m where m.item_id=i.id and m.empresa_id=p_empresa_id and m.status is distinct from 'removido'),'[]'::jsonb),
  'itens_fotos',coalesce((select jsonb_agg(jsonb_build_object('slot',f.slot,'tipo',f.tipo,'titulo',f.titulo,'url',f.url,'path',f.path,'ordem',f.ordem,'cliente_id',f.cliente_id) order by f.ordem,f.id)
    from public.itens_fotos f where f.item_id=i.id and f.empresa_id=p_empresa_id and f.cliente_id is null),'[]'::jsonb)
 ) order by i.categoria,i.produto,i.id),'[]'::jsonb)
 from public.itens i
 where i.empresa_id=p_empresa_id and i.ativo=true and i.exibir_no_site=true and i.tipo in ('Item','Kit');
$$;
commit;
