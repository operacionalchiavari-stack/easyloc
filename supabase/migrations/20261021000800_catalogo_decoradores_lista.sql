-- Parâmetros > Catálogo: lista dos decoradores com acesso ao catálogo (para escolher quem vê preço/estoque/disponível).
-- catalogo_acessos não é legível pela tela (só regras restritivas); esta função devolve só id e nome, para a equipe.
create or replace function public.catalogo_decoradores_lista(p_empresa_id uuid)
returns table(id uuid, nome text, ativo boolean) language sql stable security definer set search_path=public as $$
  select c.id, c.nome_razao, bool_or(a.ativo)
    from public.catalogo_acessos a join public.clientes_empresas c on c.id = a.cliente_id and c.empresa_id = a.empresa_id
   where a.empresa_id = p_empresa_id and public.eh_membro_empresa(p_empresa_id)
   group by c.id, c.nome_razao
   order by c.nome_razao
$$;
revoke all on function public.catalogo_decoradores_lista(uuid) from public, anon;
grant execute on function public.catalogo_decoradores_lista(uuid) to authenticated;
