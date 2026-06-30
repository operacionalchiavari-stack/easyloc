alter table public.rh_colaboradores
add column if not exists foto_url text;

insert into storage.buckets (id, name, public)
values ('rh-fotos', 'rh-fotos', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists rh_fotos_storage_select_public on storage.objects;
create policy rh_fotos_storage_select_public
on storage.objects
for select
using (bucket_id = 'rh-fotos');

drop policy if exists rh_fotos_storage_insert_empresa on storage.objects;
create policy rh_fotos_storage_insert_empresa
on storage.objects
for insert
with check (
  bucket_id = 'rh-fotos'
  and exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists rh_fotos_storage_update_empresa on storage.objects;
create policy rh_fotos_storage_update_empresa
on storage.objects
for update
using (
  bucket_id = 'rh-fotos'
  and exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'rh-fotos'
  and exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists rh_fotos_storage_delete_empresa on storage.objects;
create policy rh_fotos_storage_delete_empresa
on storage.objects
for delete
using (
  bucket_id = 'rh-fotos'
  and exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id::text = (storage.foldername(name))[1]
  )
);
