-- Vitrine do login (e catálogo do visitante) sem nenhum acesso de decorador cadastrado: a empresa era descoberta só
-- por catalogo_acessos (a única com acesso ativo). Com a tabela vazia (limpeza de dados), a vitrine sumia. Agora,
-- sem acesso ativo, vale a única empresa que tem móveis visíveis no site.
create or replace function public.catalogo_empresa_publica(p_empresa_id uuid default null)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select e.id from public.empresas e where e.id = p_empresa_id
       and (exists (select 1 from public.catalogo_acessos a where a.empresa_id = e.id and a.ativo)
            or exists (select 1 from public.itens i where i.empresa_id = e.id and i.ativo and i.exibir_no_site))),
    case when p_empresa_id is null then coalesce(
      (select case when count(distinct empresa_id) = 1 then min(empresa_id::text)::uuid end from public.catalogo_acessos where ativo),
      (select case when count(distinct empresa_id) = 1 then min(empresa_id::text)::uuid end from public.itens where ativo and exibir_no_site))
    end);
$$;

create or replace function public.catalogo_vitrine_login(p_empresa_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_empresa uuid := public.catalogo_empresa_publica(p_empresa_id); v_resultado jsonb;
begin
  if v_empresa is null then return null; end if;
  select jsonb_build_object(
    'empresa', jsonb_build_object('nome', coalesce(e.nome, ''), 'logo_url', e.logo_url),
    'fotos', coalesce((
      select jsonb_agg(jsonb_build_object('url', f.foto_url, 'categoria', f.categoria, 'nome', f.nome))
        from (
          select foto_url, categoria, nome from (
            select i.foto_url, i.categoria,
                   nullif(btrim(concat_ws(' ', nullif(btrim(i.produto_base), ''), nullif(btrim(i.produto), ''))), '') as nome,
                   row_number() over (partition by i.categoria order by random()) as n
              from public.itens i
             where i.empresa_id = v_empresa and i.ativo and i.exibir_no_site
               and i.tipo in ('Item', 'Kit') and coalesce(i.foto_url, '') <> ''
          ) por_categoria where n <= 3 order by random() limit 24
        ) f), '[]'::jsonb))
    into v_resultado from public.empresas e where e.id = v_empresa;
  return v_resultado;
end $$;
