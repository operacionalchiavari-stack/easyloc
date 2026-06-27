create extension if not exists "pgcrypto";

create table if not exists public.contratos_modelos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome_modelo text not null,
  conteudo text not null,
  padrao boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.contratos_pedidos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  pedido_id uuid not null references public.separacoes_pedidos(id) on delete cascade,
  modelo_id uuid references public.contratos_modelos(id) on delete set null,
  conteudo_final text not null,
  conteudo_editado boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists contratos_modelos_empresa_idx
  on public.contratos_modelos (empresa_id, ativo, padrao);

create unique index if not exists contratos_modelos_padrao_ativo_uidx
  on public.contratos_modelos (empresa_id)
  where padrao is true and ativo is true;

create unique index if not exists contratos_pedidos_empresa_pedido_uidx
  on public.contratos_pedidos (empresa_id, pedido_id);

create index if not exists contratos_pedidos_modelo_idx
  on public.contratos_pedidos (empresa_id, modelo_id);

create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists set_contratos_modelos_atualizado_em on public.contratos_modelos;
create trigger set_contratos_modelos_atualizado_em
before update on public.contratos_modelos
for each row execute function public.set_atualizado_em();

drop trigger if exists set_contratos_pedidos_atualizado_em on public.contratos_pedidos;
create trigger set_contratos_pedidos_atualizado_em
before update on public.contratos_pedidos
for each row execute function public.set_atualizado_em();

create or replace function public.garantir_unico_contrato_modelo_padrao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.padrao is true and new.ativo is true then
    update public.contratos_modelos
       set padrao = false,
           atualizado_em = now()
     where empresa_id = new.empresa_id
       and id is distinct from new.id
       and padrao is true;
  end if;

  return new;
end;
$$;

drop trigger if exists contratos_modelos_unico_padrao on public.contratos_modelos;
create trigger contratos_modelos_unico_padrao
before insert or update of padrao, ativo, empresa_id on public.contratos_modelos
for each row execute function public.garantir_unico_contrato_modelo_padrao();

alter table public.contratos_modelos enable row level security;
alter table public.contratos_pedidos enable row level security;

drop policy if exists contratos_modelos_empresa_select on public.contratos_modelos;
create policy contratos_modelos_empresa_select
on public.contratos_modelos
for select
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = contratos_modelos.empresa_id
  )
);

drop policy if exists contratos_modelos_empresa_write on public.contratos_modelos;
create policy contratos_modelos_empresa_write
on public.contratos_modelos
for all
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = contratos_modelos.empresa_id
  )
)
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = contratos_modelos.empresa_id
  )
);

drop policy if exists contratos_pedidos_empresa_select on public.contratos_pedidos;
create policy contratos_pedidos_empresa_select
on public.contratos_pedidos
for select
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = contratos_pedidos.empresa_id
  )
);

drop policy if exists contratos_pedidos_empresa_write on public.contratos_pedidos;
create policy contratos_pedidos_empresa_write
on public.contratos_pedidos
for all
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = contratos_pedidos.empresa_id
  )
)
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = contratos_pedidos.empresa_id
  )
);

insert into public.permissoes_catalogo (chave, modulo, submodulo, acao, descricao, sensivel, ordem)
values
  ('comercial.contratos.visualizar', 'Comercial', 'Contratos', 'visualizar', 'Visualizar modelos de contrato', false, 36),
  ('comercial.contratos.criar', 'Comercial', 'Contratos', 'criar', 'Criar modelos de contrato', false, 37),
  ('comercial.contratos.editar', 'Comercial', 'Contratos', 'editar', 'Editar modelos de contrato', false, 38),
  ('comercial.contratos.excluir', 'Comercial', 'Contratos', 'excluir', 'Excluir modelos de contrato', true, 39)
on conflict (chave) do nothing;
