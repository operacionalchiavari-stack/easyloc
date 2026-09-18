-- Pedido explícito do usuário: em vez de UM modelo 3D em destaque pra
-- tela inteira do mini-menu Módulo 3D, cada card (Estúdio de Ambientes,
-- Módulo Lounge, Realidade aumentada) passa a ter o seu PRÓPRIO modelo
-- em destaque, marcado independentemente no cadastro do item — mesma
-- ideia de itens.capa_modulo3d, só que agora uma flag por módulo em vez
-- de uma só global.
--
-- A coluna antiga (itens.capa_modulo3d) é renomeada pra
-- itens.capa_modulo3d_estudio, mantendo o dado já marcado por quem já
-- usava o recurso — as duas novas (lounge/ar) nascem em false.
alter table public.itens rename column capa_modulo3d to capa_modulo3d_estudio;
alter table public.itens add column if not exists capa_modulo3d_lounge boolean not null default false;
alter table public.itens add column if not exists capa_modulo3d_ar boolean not null default false;

-- catalogo_acervo() é a função única de onde tanto catalogo_carregar
-- (decorador externo) quanto catalogo_carregar_interno (equipe) leem os
-- itens — um único ponto de alteração já vale pros dois acessos, mesmo
-- padrão já usado nas adições de campo anteriores desta sessão.
create or replace function public.catalogo_acervo(p_empresa_id uuid)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',i.id,'tipo',i.tipo,'produto',i.produto,'produto_base',i.produto_base,
  'material',i.material,'cor',i.cor,'categoria',i.categoria,'familia',i.familia,
  'subcategoria',i.subcategoria,
  'estilo',i.estilo,'referencia',i.referencia,'marca_modelo',i.marca_modelo,
  'descricao_total',i.descricao_total,'descricao_complementar',i.descricao_complementar,
  'largura',i.largura,'altura',i.altura,'profundidade',i.profundidade,
  'foto_url',i.foto_url,'destaque_site',i.destaque_site,'capa_categoria',i.capa_categoria,
  'capa_modulo3d_estudio',i.capa_modulo3d_estudio,
  'capa_modulo3d_lounge',i.capa_modulo3d_lounge,
  'capa_modulo3d_ar',i.capa_modulo3d_ar,
  'personalizable',exists(select 1 from public.personalizacoes p
    where p.empresa_id=p_empresa_id and p.vinculo_id::text=i.id::text and p.alvo='ITEM' and p.status='ATIVO'),
  'itens_modelos_3d',coalesce((select jsonb_agg(jsonb_build_object('url',m.url,'status',m.status) order by m.id)
    from public.itens_modelos_3d m where m.item_id=i.id and m.empresa_id=p_empresa_id and m.status is distinct from 'removido'),'[]'::jsonb),
  'itens_fotos',coalesce((select jsonb_agg(jsonb_build_object('slot',f.slot,'tipo',f.tipo,'titulo',f.titulo,'url',f.url,'path',f.path,'ordem',f.ordem,'cliente_id',f.cliente_id) order by f.ordem,f.id)
    from public.itens_fotos f where f.item_id=i.id and f.empresa_id=p_empresa_id and f.cliente_id is null),'[]'::jsonb)
 ) order by i.categoria,i.produto,i.id),'[]'::jsonb)
 from public.itens i
 where i.empresa_id=p_empresa_id and i.ativo=true and i.exibir_no_site=true and i.tipo in ('Item','Kit');
$function$;
