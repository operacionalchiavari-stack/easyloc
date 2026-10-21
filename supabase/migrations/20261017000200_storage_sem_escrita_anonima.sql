-- Storage: fim da escrita anônima e da listagem pública (achados do Sentinela, 2026-10-17).
--
-- 1) "projetos" e "lounge-formatos": as políticas liberavam INSERT/UPDATE/DELETE para `anon` conferindo só se a
--    pasta <empresa>/<projeto|formato> existia — o Storage não confere o token do catálogo. Somado ao SELECT
--    público (listagem), qualquer visitante descobria as pastas e podia apagar/trocar arquivos dos projetos dos
--    clientes. O decorador agora passa pela função catalogo-arquivos (confere o token e o dono); aqui o `anon`
--    perde a escrita e a equipe fica com políticas `authenticated` restritas à empresa dela.
--    ⚠ Publique a função catalogo-arquivos e o front (catalogo-arquivos.mjs) ANTES de aplicar esta migration,
--      senão o decorador fica sem conseguir subir imagens.
--
-- 2) Listagem pública: biblioteca, itens, catalogo-clientes, catalogo-assistente, projetos e lounge-formatos
--    deixavam qualquer visitante listar (e, com isso, baixar) os arquivos de todas as empresas. Todos são
--    buckets PÚBLICOS lidos por getPublicUrl — o link público não passa pelo RLS, então as imagens continuam
--    abrindo. Só a listagem/leitura pela API passa a exigir login de alguém da empresa dona da pasta.

begin;

-- ---------- 1) projetos ----------
drop policy if exists projetos_bucket_leitura on storage.objects;
drop policy if exists projetos_bucket_upload on storage.objects;
drop policy if exists projetos_bucket_remover on storage.objects;
-- (projetos_bucket_upload_equipe e projetos_bucket_remover_equipe, de 20261009000200, continuam valendo)

-- ---------- 1) lounge-formatos ----------
drop policy if exists lounge_formatos_bucket_leitura on storage.objects;
drop policy if exists lounge_formatos_bucket_upload on storage.objects;
drop policy if exists lounge_formatos_bucket_atualizar on storage.objects;
drop policy if exists lounge_formatos_bucket_remover on storage.objects;

drop policy if exists lounge_formatos_bucket_upload_equipe on storage.objects;
create policy lounge_formatos_bucket_upload_equipe on storage.objects for insert to authenticated
  with check (bucket_id = 'lounge-formatos' and public.projetos_pasta_da_equipe((storage.foldername(name))[1]));
drop policy if exists lounge_formatos_bucket_atualizar_equipe on storage.objects;
create policy lounge_formatos_bucket_atualizar_equipe on storage.objects for update to authenticated
  using (bucket_id = 'lounge-formatos' and public.projetos_pasta_da_equipe((storage.foldername(name))[1]))
  with check (bucket_id = 'lounge-formatos' and public.projetos_pasta_da_equipe((storage.foldername(name))[1]));
drop policy if exists lounge_formatos_bucket_remover_equipe on storage.objects;
create policy lounge_formatos_bucket_remover_equipe on storage.objects for delete to authenticated
  using (bucket_id = 'lounge-formatos' and public.projetos_pasta_da_equipe((storage.foldername(name))[1]));

-- ---------- 2) catalogo-assistente (só a função, com a chave de serviço, lê pela API) ----------
drop policy if exists catalogo_assistente_le on storage.objects;

-- ---------- 2) leitura pública criada pelo painel (nome desconhecido) ----------
-- Remove políticas de SELECT que valem para anon/public e não checam quem é o usuário (só o bucket).
do $$
declare p record;
begin
  for p in
    select policyname, qual from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
      and (roles && array['public', 'anon']::name[])
      and qual ~ '''(biblioteca|itens|catalogo-clientes|catalogo-assistente|projetos|lounge-formatos)'''
      and qual !~* '(auth\.|usuarios_empresas|eh_membro|pasta_da_equipe|funcionario_pode|current_empresa)'
  loop
    raise notice 'removendo leitura pública: % (%)', p.policyname, p.qual;
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
  -- políticas FOR ALL públicas não são removidas automaticamente (podem ser a escrita da equipe): só avisa
  for p in
    select policyname, qual from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and cmd = 'ALL'
      and (roles && array['public', 'anon']::name[])
      and qual ~ '''(biblioteca|itens|catalogo-clientes|catalogo-assistente|projetos|lounge-formatos)'''
      and qual !~* '(auth\.|usuarios_empresas|eh_membro|pasta_da_equipe|funcionario_pode|current_empresa)'
  loop
    raise warning 'política FOR ALL pública, revise à mão: % (%)', p.policyname, p.qual;
  end loop;
end $$;

-- ---------- leitura pela API só para a equipe da empresa dona da pasta ----------
-- (necessária para a equipe remover/sobrescrever arquivos e listar pastas pelo app)
drop policy if exists storage_leitura_equipe_empresa on storage.objects;
create policy storage_leitura_equipe_empresa on storage.objects for select to authenticated
  using (
    bucket_id in ('biblioteca', 'itens', 'catalogo-clientes', 'projetos', 'lounge-formatos')
    and public.projetos_pasta_da_equipe((storage.foldername(name))[1])
  );

-- ---------- as imagens abrem por getPublicUrl: os buckets precisam continuar públicos ----------
do $$
declare b text;
begin
  foreach b in array array['biblioteca', 'itens', 'catalogo-clientes', 'catalogo-assistente', 'projetos', 'lounge-formatos'] loop
    if exists (select 1 from storage.buckets where id = b and not public) then
      raise warning 'bucket % não é público: os links de getPublicUrl dele não abririam. Confira antes de seguir.', b;
    end if;
  end loop;
end $$;

commit;
