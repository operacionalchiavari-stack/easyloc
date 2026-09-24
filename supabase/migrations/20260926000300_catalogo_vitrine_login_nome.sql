-- Vitrine do login: cada foto passa a vir com o NOME do item (pedido do usuário: ao passar o mouse numa peça, mostrar só o
-- nome — sem medida, sem código). Mesmo nome que o catálogo mostra (produto_base + produto, ver mapRow em catalogo.mjs).
create or replace function public.catalogo_vitrine_login(p_empresa_id uuid default null)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_empresa uuid := p_empresa_id;
  v_resultado jsonb;
begin
  if v_empresa is null then
    select case when count(distinct empresa_id) = 1 then min(empresa_id::text)::uuid end
      into v_empresa
      from public.catalogo_acessos
     where ativo;
  end if;
  if v_empresa is null then return null; end if;

  select jsonb_build_object(
    'empresa', jsonb_build_object('nome', coalesce(e.nome, ''), 'logo_url', e.logo_url),
    'fotos', coalesce((
      select jsonb_agg(jsonb_build_object('url', f.foto_url, 'categoria', f.categoria, 'nome', f.nome))
        from (
          select foto_url, categoria, nome
            from (
              select i.foto_url, i.categoria,
                     nullif(btrim(concat_ws(' ', nullif(btrim(i.produto_base), ''), nullif(btrim(i.produto), ''))), '') as nome,
                     row_number() over (partition by i.categoria order by random()) as n
                from public.itens i
               where i.empresa_id = v_empresa and i.ativo and i.exibir_no_site
                 and i.tipo in ('Item', 'Kit') and coalesce(i.foto_url, '') <> ''
            ) por_categoria
           where n <= 3
           order by random()
           limit 24
        ) f
    ), '[]'::jsonb)
  )
    into v_resultado
    from public.empresas e
   where e.id = v_empresa;

  return v_resultado;
end;
$$;

revoke all on function public.catalogo_vitrine_login(uuid) from public;
grant execute on function public.catalogo_vitrine_login(uuid) to anon, authenticated;
