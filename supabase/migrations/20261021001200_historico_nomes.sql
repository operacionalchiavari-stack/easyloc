-- Histórico (comercial e projetos): o nome de quem fez vem do Cadastro de Funcionários e, se a pessoa não tiver
-- cadastro (ex.: o administrador dono da conta), da tabela usuarios; só então o e-mail. Quantidades sem ".00".
create or replace function public.comercial_hist_autor(p_empresa uuid, out autor text, out autor_id uuid, out autor_tipo text)
language plpgsql stable security definer set search_path=public as $$
begin
  autor_id := auth.uid();
  if autor_id is not null then
    autor_tipo := 'equipe';
    select f.nome into autor from public.funcionarios_acesso f where f.id = autor_id and f.empresa_id = p_empresa;
    if autor is null then select nullif(btrim(u.nome), '') into autor from public.usuarios u where u.id = autor_id; end if;
    autor := coalesce(autor, auth.jwt()->>'email', 'Equipe');
  else
    autor_tipo := 'sistema'; autor := 'Sistema';
  end if;
end $$;
revoke all on function public.comercial_hist_autor(uuid) from public, anon, authenticated;

create or replace function public.comercial_hist_texto(p_tipo text, d jsonb, p_padrao text)
returns text language plpgsql immutable as $$
declare de numeric; para numeric;
begin
  if p_tipo = 'itens' and d ? 'item' then
    de := trim_scale(coalesce((d->>'de')::numeric, 0)); para := trim_scale(coalesce((d->>'para')::numeric, 0));
    if de = 0 then return 'Adicionou ' || para || '× ' || (d->>'item'); end if;
    if para = 0 then return 'Tirou ' || (d->>'item') || ' (eram ' || de || ')'; end if;
    return 'Mudou a quantidade de ' || (d->>'item') || ': ' || de || ' → ' || para;
  end if;
  if d ? 'campo' then
    return 'Alterou ' || (d->>'campo') || ': ' || coalesce(nullif(d->>'de',''), '(vazio)') || ' → ' || coalesce(nullif(d->>'para',''), '(vazio)');
  end if;
  return p_padrao;
end $$;
revoke all on function public.comercial_hist_texto(text,jsonb,text) from public, anon, authenticated;
