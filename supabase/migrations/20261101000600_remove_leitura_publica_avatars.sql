-- Bucket "avatars" (em inglês) é antigo, está vazio e nenhuma tela usa: tira a leitura pública.
-- As fotos de usuário ficam no bucket "avatares", com leitura só para a equipe da empresa.
drop policy if exists "Public read avatars" on storage.objects;
