-- O cadastro usa a sessao autenticada da empresa, nao app_sessoes.
alter policy caminhoes_fotos_inserir on storage.objects
with check (
  bucket_id = 'caminhoes-fotos'
  and exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id::text = (storage.foldername(name))[1]
  )
);
