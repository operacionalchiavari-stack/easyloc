-- Foto (logo) do fornecedor (nov/2026). Obrigatória na categoria "Locação de móveis" (conferido na tela do cadastro e
-- em Comercial > Terceirizações). A lista de empresas de terceirização passa a devolver a foto e a categoria.
alter table public.fornecedores add column if not exists foto_url text;
alter table public.fornecedores add column if not exists foto_path text;

create or replace function public.terceirizacao_empresas(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not operacao_pode(p_empresa, 'comercial.pedidos.visualizar') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', coalesce(nullif(btrim(f.nome_fantasia), ''), f.nome_razao_social),
      'razao', f.nome_razao_social, 'terceirizacao', f.terceirizacao, 'categoria', f.categoria, 'foto_url', f.foto_url, 'foto_path', f.foto_path,
      'itens', (select count(*) from terceirizacao_itens t where t.fornecedor_id = f.id and t.ativo)) order by coalesce(nullif(btrim(f.nome_fantasia), ''), f.nome_razao_social))
    from fornecedores f where f.empresa_id = p_empresa), '[]'::jsonb);
end $$;

-- Trocar a foto do fornecedor pela tela de Terceirizações (quem edita pedidos, sem precisar da permissão do cadastro).
create or replace function public.terceirizacao_empresa_foto(p_empresa uuid, p_fornecedor uuid, p_url text, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not eh_membro_empresa(p_empresa) or not seguranca_2fa_ok() or not operacao_pode(p_empresa, 'comercial.pedidos.editar') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  if p_path is not null and split_part(p_path, '/', 1) <> p_empresa::text then raise exception 'Arquivo fora da pasta da empresa'; end if;
  update fornecedores set foto_url = nullif(btrim(p_url), ''), foto_path = nullif(btrim(p_path), '') where id = p_fornecedor and empresa_id = p_empresa;
  if not found then raise exception 'Fornecedor não encontrado'; end if;
end $$;
revoke all on function public.terceirizacao_empresa_foto(uuid, uuid, text, text) from public, anon;
grant execute on function public.terceirizacao_empresa_foto(uuid, uuid, text, text) to authenticated;
notify pgrst, 'reload schema';
