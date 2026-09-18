begin;
-- Bug real reportado pelo usuário: "o botão trocar foto não está
-- funcionando" (Portal do catálogo, trocarCapaGateway() em catalogo.mjs)
-- — a foto da PRIMEIRA vez sobe normal (usa a policy de INSERT), mas
-- trocar de novo uma foto que já existe no mesmo caminho
-- (`${empresa_id}/_capas/portal.ext`, sempre o MESMO caminho por chave,
-- de propósito — ver 20260916000300_catalogo_capas_portal.sql) falha
-- silenciosamente: `.storage.upload(path, file, {upsert:true})`, quando
-- o objeto já existe naquele caminho, precisa da permissão de UPDATE em
-- storage.objects, não só INSERT.
--
-- Causa raiz: 20260916000200_biblioteca_fotos.sql criou policies de
-- SELECT/INSERT/DELETE pro bucket "biblioteca" (copiando o padrão do
-- bucket "itens"), mas esqueceu a de UPDATE — no bucket "itens" ela
-- existe (itens_storage_update_empresa); nos outros buckets do
-- projeto que também fazem upsert (empresas-logos, rh-fotos,
-- catalogo-clientes) também existe. Só "biblioteca" ficou sem. Não dava
-- problema nas fotos da PRÓPRIA Biblioteca (cada upload usa um caminho
-- novo/único, nunca reaproveita um existente) — só apareceu quando o
-- Portal passou a reaproveitar um caminho FIXO por chave (trocar a
-- mesma foto de novo, não só subir uma vez).
drop policy if exists biblioteca_storage_update_empresa on storage.objects;
create policy biblioteca_storage_update_empresa
on storage.objects
for update
using (
  bucket_id = 'biblioteca'
  and exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid() and ue.empresa_id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'biblioteca'
  and exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid() and ue.empresa_id::text = (storage.foldername(name))[1]
  )
);
commit;
