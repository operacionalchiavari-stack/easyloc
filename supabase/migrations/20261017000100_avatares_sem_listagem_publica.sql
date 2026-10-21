-- avatares: fim da listagem pública (achado do Sentinela, 2026-10-17).
--
-- O bucket e a política de leitura foram criados pelo painel (não estão nas
-- migrations). Hoje qualquer visitante sem login lista e baixa as fotos de
-- todas as empresas pela API (pastas <empresa>/<usuario>.jpg).
--
-- As telas usam getPublicUrl, que funciona pelo link público do bucket sem
-- passar pelo RLS — então tirar o SELECT do visitante não quebra as fotos.
-- Quem é da empresa continua podendo ler a própria pasta (necessário para
-- upload com upsert pelo app).

-- 1) remove toda política de SELECT do bucket avatares que valha para anon/public
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and cmd in ('SELECT', 'ALL')
      and coalesce(qual, '') ilike '%avatares%'
      and (roles && array['public', 'anon']::name[])
  loop
    raise notice 'removendo política de leitura pública: %', p.policyname;
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

-- 2) leitura só para membros da empresa dona da pasta
drop policy if exists avatares_select_empresa on storage.objects;
create policy avatares_select_empresa on storage.objects for select to authenticated
using (
  bucket_id = 'avatares' and
  case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       then public.eh_membro_empresa(((storage.foldername(name))[1])::uuid)
       else false end
);

-- 3) as fotos abrem por getPublicUrl: o bucket precisa continuar público
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'avatares' and public) then
    raise warning 'bucket avatares não é público: as fotos via getPublicUrl não abririam. Confira antes de seguir.';
  end if;
end $$;
