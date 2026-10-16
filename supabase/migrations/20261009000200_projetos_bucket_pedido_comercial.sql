-- Módulo 3D dentro do pedido comercial (out/2026, pedido do usuário: "dentro da criação do pedido no comercial
-- tivesse um lugar que clicasse e fosse pro módulo 3D, e quando criasse algo... fosse abastecido no pedido da cliente").
-- No pedido, o "projeto" do catálogo é o próprio pedido (não existe linha em public.projetos), então as políticas do
-- bucket "projetos" (projeto_existe) recusavam a imagem/cena da composição. Estas políticas extras liberam a pasta
-- da empresa para quem é da equipe dela (usuário logado com vínculo em usuarios_empresas). O decorador do catálogo
-- (sem login, por token) continua só com as políticas antigas.

create or replace function public.projetos_pasta_da_equipe(p_empresa text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid() and ue.empresa_id::text = p_empresa)
$$;

revoke all on function public.projetos_pasta_da_equipe(text) from public, anon;
grant execute on function public.projetos_pasta_da_equipe(text) to authenticated;

drop policy if exists projetos_bucket_upload_equipe on storage.objects;
create policy projetos_bucket_upload_equipe on storage.objects
  for insert to authenticated
  with check (bucket_id = 'projetos' and public.projetos_pasta_da_equipe((storage.foldername(name))[1]));

drop policy if exists projetos_bucket_remover_equipe on storage.objects;
create policy projetos_bucket_remover_equipe on storage.objects
  for delete to authenticated
  using (bucket_id = 'projetos' and public.projetos_pasta_da_equipe((storage.foldername(name))[1]));
