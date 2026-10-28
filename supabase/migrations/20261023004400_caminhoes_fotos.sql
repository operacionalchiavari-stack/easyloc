alter table public.caminhoes add column if not exists foto_url text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('caminhoes-fotos','caminhoes-fotos',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy caminhoes_fotos_ler on storage.objects for select to anon,authenticated
using(bucket_id='caminhoes-fotos');
create policy caminhoes_fotos_inserir on storage.objects for insert to authenticated
with check(bucket_id='caminhoes-fotos' and public.app_pasta_valida((storage.foldername(name))[1]));
