-- Referência escolhida para o catálogo: TABELA 2026 Padrão.
-- Não altera a tabela ativa nem os preços usados nos outros módulos.
begin;
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
  'valor_locacao',preco.valor_locacao,
  'estilo',i.estilo,'referencia',i.referencia,'marca_modelo',i.marca_modelo,
  'descricao_total',i.descricao_total,'descricao_complementar',i.descricao_complementar,
  'largura',i.largura,'altura',i.altura,'profundidade',i.profundidade,
  'foto_url',i.foto_url,'destaque_site',i.destaque_site,'capa_categoria',i.capa_categoria,
  'capa_modulo3d_estudio',i.capa_modulo3d_estudio,
  'capa_modulo3d_lounge',i.capa_modulo3d_lounge,
  'capa_modulo3d_ar',i.capa_modulo3d_ar,
  'ordem_exposicao_site',i.ordem_exposicao_site,
  'categoria_ordem',co.ordem,
  'personalizable',exists(select 1 from public.personalizacoes p
    where p.empresa_id=p_empresa_id and p.vinculo_id::text=i.id::text and p.alvo='ITEM' and p.status='ATIVO'),
  'itens_modelos_3d',coalesce((select jsonb_agg(jsonb_build_object('url',m.url,'status',m.status) order by m.id)
    from public.itens_modelos_3d m where m.item_id=i.id and m.empresa_id=p_empresa_id and m.status is distinct from 'removido'),'[]'::jsonb),
  'itens_fotos',coalesce((select jsonb_agg(jsonb_build_object('slot',f.slot,'tipo',f.tipo,'titulo',f.titulo,'url',f.url,'path',f.path,'ordem',f.ordem,'cliente_id',f.cliente_id) order by f.ordem,f.id)
    from public.itens_fotos f where f.item_id=i.id and f.empresa_id=p_empresa_id and f.cliente_id is null),'[]'::jsonb)
 ) order by co.ordem nulls last,i.categoria,i.ordem_exposicao_site nulls last,i.produto,i.id),'[]'::jsonb)
 from public.itens i
 left join lateral (
   select ip.valor_locacao
   from public.itens_precos ip
   join public.tabelas_preco tp on tp.id=ip.tabela_preco_id
   where ip.item_id=i.id and tp.empresa_id=i.empresa_id
     and tp.nome='TABELA 2026 Padrão'
   order by tp.id
   limit 1
 ) preco on true
 left join public.catalogo_categorias_ordem co on co.empresa_id=i.empresa_id and co.categoria=i.categoria
 where i.empresa_id=p_empresa_id and i.ativo=true and i.exibir_no_site=true and i.tipo in ('Item','Kit');
$function$;

commit;
