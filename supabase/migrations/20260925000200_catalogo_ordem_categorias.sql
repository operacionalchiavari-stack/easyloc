-- Ordem das CATEGORIAS na tela "Categorias" do catálogo, definida pela equipe interna arrastando os cards (pedido do
-- usuário: "quero que a mesma função seja aplicada dentro de categorias, essa função de poder arrastar"). Categoria é
-- texto livre em itens.categoria (sem tabela própria), então a ordem mora numa tabela à parte, por empresa + nome.

create table if not exists public.catalogo_categorias_ordem (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  categoria text not null,
  ordem integer not null,
  primary key (empresa_id, categoria)
);
alter table public.catalogo_categorias_ordem enable row level security;
drop policy if exists catalogo_categorias_ordem_select on public.catalogo_categorias_ordem;
create policy catalogo_categorias_ordem_select on public.catalogo_categorias_ordem for select to authenticated
  using (exists (select 1 from public.usuarios_empresas ue where ue.empresa_id = catalogo_categorias_ordem.empresa_id and ue.user_id = auth.uid()));

-- catalogo_acervo (leitura única do decorador e da equipe): ordena primeiro pela ordem das categorias — a tela
-- "Categorias" monta a lista na ordem em que as categorias aparecem nos itens (getCategories) — e devolve a posição.
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
  'categoria_ordem',co.ordem,
  'personalizable',exists(select 1 from public.personalizacoes p
    where p.empresa_id=p_empresa_id and p.vinculo_id::text=i.id::text and p.alvo='ITEM' and p.status='ATIVO'),
  'itens_modelos_3d',coalesce((select jsonb_agg(jsonb_build_object('url',m.url,'status',m.status) order by m.id)
    from public.itens_modelos_3d m where m.item_id=i.id and m.empresa_id=p_empresa_id and m.status is distinct from 'removido'),'[]'::jsonb),
  'itens_fotos',coalesce((select jsonb_agg(jsonb_build_object('slot',f.slot,'tipo',f.tipo,'titulo',f.titulo,'url',f.url,'path',f.path,'ordem',f.ordem,'cliente_id',f.cliente_id) order by f.ordem,f.id)
    from public.itens_fotos f where f.item_id=i.id and f.empresa_id=p_empresa_id and f.cliente_id is null),'[]'::jsonb)
 ) order by co.ordem nulls last,i.categoria,i.ordem_exposicao_site nulls last,i.produto,i.id),'[]'::jsonb)
 from public.itens i
 left join public.catalogo_categorias_ordem co on co.empresa_id=i.empresa_id and co.categoria=i.categoria
 where i.empresa_id=p_empresa_id and i.ativo=true and i.exibir_no_site=true and i.tipo in ('Item','Kit');
$function$;

create or replace function public.catalogo_categorias_reordenar(p_empresa_id uuid, p_categorias text[])
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not exists(
    select 1 from public.usuarios_empresas ue where ue.empresa_id = p_empresa_id and ue.user_id = auth.uid()
  ) then
    raise exception 'Sem permissão para ordenar o catálogo';
  end if;
  delete from public.catalogo_categorias_ordem where empresa_id = p_empresa_id;
  insert into public.catalogo_categorias_ordem (empresa_id, categoria, ordem)
  select p_empresa_id, c, (n * 10)::integer
    from unnest(p_categorias) with ordinality as t(c, n)
   where coalesce(trim(c), '') <> ''
  on conflict (empresa_id, categoria) do nothing;
  return coalesce(array_length(p_categorias, 1), 0);
end;
$function$;

revoke all on function public.catalogo_categorias_reordenar(uuid, text[]) from public, anon;
grant execute on function public.catalogo_categorias_reordenar(uuid, text[]) to authenticated;
