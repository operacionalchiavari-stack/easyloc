insert into storage.buckets (id, name, public)
values ('itens', 'itens', true)
on conflict (id) do update
set public = excluded.public;

create table if not exists public.itens_fotos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  item_id uuid not null references public.itens(id) on delete cascade,
  slot text not null,
  tipo text not null,
  titulo text not null,
  path text not null,
  url text not null,
  mime_type text,
  tamanho_bytes bigint,
  ordem smallint not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint itens_fotos_slot_check check (
    slot in ('detalhe_01', 'detalhe_02', 'galeria_01', 'galeria_02', 'galeria_03')
  ),
  constraint itens_fotos_tipo_check check (tipo in ('detalhe', 'galeria')),
  constraint itens_fotos_ordem_check check (ordem between 1 and 3),
  constraint itens_fotos_item_slot_unique unique (item_id, slot)
);

create index if not exists itens_fotos_empresa_item_idx
on public.itens_fotos (empresa_id, item_id, ordem);

create index if not exists itens_fotos_tipo_idx
on public.itens_fotos (empresa_id, item_id, tipo, ordem);

create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists set_itens_fotos_atualizado_em on public.itens_fotos;
create trigger set_itens_fotos_atualizado_em
before update on public.itens_fotos
for each row execute function public.set_atualizado_em();

alter table public.itens_fotos enable row level security;

drop policy if exists itens_fotos_empresa_select on public.itens_fotos;
create policy itens_fotos_empresa_select
on public.itens_fotos
for select
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens_fotos.empresa_id
  )
);

drop policy if exists itens_fotos_empresa_insert on public.itens_fotos;
create policy itens_fotos_empresa_insert
on public.itens_fotos
for insert
with check (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens_fotos.empresa_id
  )
  and exists (
    select 1
    from public.itens i
    where i.id = itens_fotos.item_id
      and i.empresa_id = itens_fotos.empresa_id
  )
);

drop policy if exists itens_fotos_empresa_update on public.itens_fotos;
create policy itens_fotos_empresa_update
on public.itens_fotos
for update
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens_fotos.empresa_id
  )
)
with check (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens_fotos.empresa_id
  )
  and exists (
    select 1
    from public.itens i
    where i.id = itens_fotos.item_id
      and i.empresa_id = itens_fotos.empresa_id
  )
);

drop policy if exists itens_fotos_empresa_delete on public.itens_fotos;
create policy itens_fotos_empresa_delete
on public.itens_fotos
for delete
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens_fotos.empresa_id
  )
);

drop policy if exists itens_storage_select_public on storage.objects;
create policy itens_storage_select_public
on storage.objects
for select
using (bucket_id = 'itens');

drop policy if exists itens_storage_insert_empresa on storage.objects;
create policy itens_storage_insert_empresa
on storage.objects
for insert
with check (
  bucket_id = 'itens'
  and exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists itens_storage_update_empresa on storage.objects;
create policy itens_storage_update_empresa
on storage.objects
for update
using (
  bucket_id = 'itens'
  and exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'itens'
  and exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists itens_storage_delete_empresa on storage.objects;
create policy itens_storage_delete_empresa
on storage.objects
for delete
using (
  bucket_id = 'itens'
  and exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id::text = (storage.foldername(name))[1]
  )
);
