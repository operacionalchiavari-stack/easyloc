begin;
-- Ajuste rápido em cima de 20260916000200_biblioteca_fotos.sql (mesma
-- sessão): biblioteca_fotos_acervo() precisa devolver `path` também, não
-- só `url` — a exclusão de uma foto (equipe) precisa do path de storage
-- pra apagar o arquivo, não só a linha da tabela. Bucket já é público
-- (mesma política de "itens"), então expor o path não vaza nada que a URL
-- pública já não exponha.
create or replace function public.biblioteca_fotos_acervo(p_empresa_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id, 'categoria', f.categoria, 'titulo', f.titulo, 'url', f.url, 'path', f.path, 'ordem', f.ordem
  ) order by f.categoria, f.ordem nulls last, f.criado_em), '[]'::jsonb)
  from public.biblioteca_fotos f
  where f.empresa_id = p_empresa_id;
$$;
revoke all on function public.biblioteca_fotos_acervo(uuid) from public,anon,authenticated;
grant execute on function public.biblioteca_fotos_acervo(uuid) to service_role;
commit;
