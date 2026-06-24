create table if not exists public.configuracoes_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  logo_url text,
  cor_sidebar text not null default '#0F2A44',
  cor_destaque text not null default '#FF6A00',
  cor_fundo text not null default '#FFFAF6',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id),
  constraint configuracoes_empresa_cor_sidebar_hex check (cor_sidebar ~ '^#[0-9A-Fa-f]{6}$'),
  constraint configuracoes_empresa_cor_destaque_hex check (cor_destaque ~ '^#[0-9A-Fa-f]{6}$'),
  constraint configuracoes_empresa_cor_fundo_hex check (cor_fundo ~ '^#[0-9A-Fa-f]{6}$')
);

create index if not exists configuracoes_empresa_empresa_idx
  on public.configuracoes_empresa (empresa_id);

alter table public.configuracoes_empresa enable row level security;

drop policy if exists configuracoes_empresa_select_empresa on public.configuracoes_empresa;
create policy configuracoes_empresa_select_empresa
on public.configuracoes_empresa
for select
to authenticated
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = configuracoes_empresa.empresa_id
  )
);

drop policy if exists configuracoes_empresa_write_empresa on public.configuracoes_empresa;
create policy configuracoes_empresa_write_empresa
on public.configuracoes_empresa
for all
to authenticated
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = configuracoes_empresa.empresa_id
  )
)
with check (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = configuracoes_empresa.empresa_id
  )
);

insert into storage.buckets (id, name, public)
values ('empresas-logos', 'empresas-logos', true)
on conflict (id) do update set public = true;

drop policy if exists empresas_logos_select_empresa on storage.objects;
create policy empresas_logos_select_empresa
on storage.objects
for select
to authenticated
using (
  bucket_id = 'empresas-logos'
);

drop policy if exists empresas_logos_insert_empresa on storage.objects;
create policy empresas_logos_insert_empresa
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'empresas-logos'
  and exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists empresas_logos_update_empresa on storage.objects;
create policy empresas_logos_update_empresa
on storage.objects
for update
to authenticated
using (
  bucket_id = 'empresas-logos'
  and exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'empresas-logos'
  and exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists empresas_logos_delete_empresa on storage.objects;
create policy empresas_logos_delete_empresa
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'empresas-logos'
  and exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id::text = (storage.foldername(name))[1]
  )
);
