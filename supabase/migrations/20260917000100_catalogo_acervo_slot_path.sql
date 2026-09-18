begin;
-- Fotos editáveis direto do catálogo (pedido explícito do usuário: "eu
-- quero que de dentro do sistema da chiavari o catalogo fique com todas
-- as fotos editaveis"). Pra trocar/remover uma foto de Detalhe ou
-- Ambientada específica, o cliente precisa saber qual SLOT ela ocupa
-- (detalhe_01/02, galeria_01/02/03) e o PATH no Storage (pra apagar o
-- arquivo antigo ao substituir) — nenhum dos dois vinha na resposta do
-- catálogo até agora, só o suficiente pra exibir. `catalogo_acervo()`
-- passa a devolver os dois; bucket "itens" já é público (mesmo raciocínio
-- já usado pra `path` em biblioteca_fotos_acervo/catalogo_capas_acervo —
-- não expõe nada que a própria URL pública já não expusesse).
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
  'itens_fotos',coalesce((select jsonb_agg(jsonb_build_object('slot',f.slot,'tipo',f.tipo,'titulo',f.titulo,'url',f.url,'path',f.path,'ordem',f.ordem,'cliente_id',f.cliente_id) order by f.ordem,f.id)
    from public.itens_fotos f where f.item_id=i.id and f.empresa_id=p_empresa_id and f.cliente_id is null),'[]'::jsonb)
 ) order by i.categoria,i.produto,i.id),'[]'::jsonb)
 from public.itens i
 where i.empresa_id=p_empresa_id and i.ativo=true and i.exibir_no_site=true and i.tipo in ('Item','Kit');
$$;
revoke all on function public.catalogo_acervo(uuid) from public,anon,authenticated;
grant execute on function public.catalogo_acervo(uuid) to service_role;
commit;
