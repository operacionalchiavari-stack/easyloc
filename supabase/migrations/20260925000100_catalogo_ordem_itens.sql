-- Ordem dos itens dentro de cada categoria do catálogo, definida pela equipe interna arrastando os cards
-- (pedido do usuário: "a pessoa da Chiavari pode arrastar a sequência dos itens dentro do catálogo... e aquela
-- posição passa a ser a padrão que todos os decoradores vão ver").
-- Reaproveita a coluna que já existia, itens.ordem_exposicao_site (NULL = sem ordem definida).

-- 1) catalogo_acervo passa a devolver a ordem e a ordenar por ela dentro da categoria (sem ordem vai pro fim,
--    na ordem alfabética de sempre). Única função de onde leem tanto o decorador quanto a equipe.
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
  'ordem_exposicao_site',i.ordem_exposicao_site,
  'personalizable',exists(select 1 from public.personalizacoes p
    where p.empresa_id=p_empresa_id and p.vinculo_id::text=i.id::text and p.alvo='ITEM' and p.status='ATIVO'),
  'itens_modelos_3d',coalesce((select jsonb_agg(jsonb_build_object('url',m.url,'status',m.status) order by m.id)
    from public.itens_modelos_3d m where m.item_id=i.id and m.empresa_id=p_empresa_id and m.status is distinct from 'removido'),'[]'::jsonb),
  'itens_fotos',coalesce((select jsonb_agg(jsonb_build_object('slot',f.slot,'tipo',f.tipo,'titulo',f.titulo,'url',f.url,'path',f.path,'ordem',f.ordem,'cliente_id',f.cliente_id) order by f.ordem,f.id)
    from public.itens_fotos f where f.item_id=i.id and f.empresa_id=p_empresa_id and f.cliente_id is null),'[]'::jsonb)
 ) order by i.categoria,i.ordem_exposicao_site nulls last,i.produto,i.id),'[]'::jsonb)
 from public.itens i
 where i.empresa_id=p_empresa_id and i.ativo=true and i.exibir_no_site=true and i.tipo in ('Item','Kit');
$function$;

-- 2) Gravar a nova ordem de uma vez: p_itens = [{"id": uuid, "ordem": int}, ...]. Só a equipe interna (usuário logado
--    vinculado à empresa — a mesma regra das outras edições do catálogo, que passam pela RLS de itens). O decorador
--    não tem auth.uid(), então nunca passa daqui.
create or replace function public.catalogo_reordenar(p_empresa_id uuid, p_itens jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total integer;
begin
  if auth.uid() is null or not exists(
    select 1 from public.usuarios_empresas ue where ue.empresa_id = p_empresa_id and ue.user_id = auth.uid()
  ) then
    raise exception 'Sem permissão para ordenar o catálogo';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' then
    raise exception 'Lista de itens inválida';
  end if;
  update public.itens i
     set ordem_exposicao_site = (x->>'ordem')::integer
    from jsonb_array_elements(p_itens) x
   where i.id = (x->>'id')::uuid and i.empresa_id = p_empresa_id;
  get diagnostics v_total = row_count;
  return v_total;
end;
$function$;

revoke all on function public.catalogo_reordenar(uuid, jsonb) from public, anon;
grant execute on function public.catalogo_reordenar(uuid, jsonb) to authenticated;
