create table if not exists public.itens_modelos_3d (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  item_id uuid not null references public.itens(id) on delete cascade,
  nome_arquivo text not null,
  path text not null,
  url text not null,
  mime_type text not null default 'model/gltf-binary',
  tamanho_bytes bigint,
  status text not null default 'ativo',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint itens_modelos_3d_status_check check (status in ('ativo', 'removido')),
  constraint itens_modelos_3d_item_unique unique (item_id)
);

create index if not exists itens_modelos_3d_empresa_item_idx
on public.itens_modelos_3d (empresa_id, item_id);

create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists set_itens_modelos_3d_atualizado_em on public.itens_modelos_3d;
create trigger set_itens_modelos_3d_atualizado_em
before update on public.itens_modelos_3d
for each row execute function public.set_atualizado_em();

alter table public.itens_modelos_3d enable row level security;

drop policy if exists itens_modelos_3d_empresa_select on public.itens_modelos_3d;
create policy itens_modelos_3d_empresa_select
on public.itens_modelos_3d
for select
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens_modelos_3d.empresa_id
  )
);

drop policy if exists itens_modelos_3d_empresa_insert on public.itens_modelos_3d;
create policy itens_modelos_3d_empresa_insert
on public.itens_modelos_3d
for insert
with check (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens_modelos_3d.empresa_id
  )
  and exists (
    select 1
    from public.itens i
    where i.id = itens_modelos_3d.item_id
      and i.empresa_id = itens_modelos_3d.empresa_id
  )
);

drop policy if exists itens_modelos_3d_empresa_update on public.itens_modelos_3d;
create policy itens_modelos_3d_empresa_update
on public.itens_modelos_3d
for update
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens_modelos_3d.empresa_id
  )
)
with check (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens_modelos_3d.empresa_id
  )
  and exists (
    select 1
    from public.itens i
    where i.id = itens_modelos_3d.item_id
      and i.empresa_id = itens_modelos_3d.empresa_id
  )
);

drop policy if exists itens_modelos_3d_empresa_delete on public.itens_modelos_3d;
create policy itens_modelos_3d_empresa_delete
on public.itens_modelos_3d
for delete
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens_modelos_3d.empresa_id
  )
);
