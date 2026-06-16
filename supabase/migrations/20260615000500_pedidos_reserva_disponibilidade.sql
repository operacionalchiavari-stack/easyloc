create extension if not exists "pgcrypto";

create table if not exists public.separacoes_pedidos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  pedido_origem_id uuid,
  numero_pedido text not null,
  cliente_id uuid,
  cliente_nome text not null,
  tipo_evento text,
  data_hora timestamptz,
  status text not null default 'pendente',
  motivo_divergencia text,
  criado_por uuid,
  atualizado_por uuid,
  finalizado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  finalizado_em timestamptz
);

create table if not exists public.separacoes_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  separacao_pedido_id uuid not null references public.separacoes_pedidos(id) on delete cascade,
  pedido_item_origem_id uuid,
  item_id uuid not null references public.itens(id),
  item_nome text,
  codigo_item text,
  foto_url text,
  localizacao text,
  tipo_controle text not null default 'quantidade',
  quantidade_solicitada numeric(12,2) not null default 0,
  quantidade_separada numeric(12,2) not null default 0,
  patrimonios_lidos text[] not null default '{}',
  status text not null default 'pendente',
  criado_por uuid,
  atualizado_por uuid,
  created_at timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table if exists public.separacoes_pedidos
  add column if not exists local_id uuid,
  add column if not exists local_nome text,
  add column if not exists contato_cliente text,
  add column if not exists data_evento date,
  add column if not exists data_entrega date,
  add column if not exists data_coleta date,
  add column if not exists valor_total numeric(14, 2) default 0,
  add column if not exists status_comercial text default 'orcamento',
  add column if not exists observacoes jsonb default '{}'::jsonb;

create index if not exists separacoes_pedidos_empresa_status_idx
  on public.separacoes_pedidos (empresa_id, status, data_hora);

create index if not exists separacoes_pedidos_comercial_idx
  on public.separacoes_pedidos (empresa_id, status_comercial, data_evento);

create index if not exists separacoes_itens_pedido_idx
  on public.separacoes_itens (empresa_id, separacao_pedido_id);

create index if not exists separacoes_itens_item_idx
  on public.separacoes_itens (empresa_id, item_id);

alter table public.separacoes_pedidos enable row level security;
alter table public.separacoes_itens enable row level security;

drop policy if exists separacoes_pedidos_empresa_select on public.separacoes_pedidos;
create policy separacoes_pedidos_empresa_select
on public.separacoes_pedidos
for select
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = separacoes_pedidos.empresa_id
  )
);

drop policy if exists separacoes_pedidos_empresa_write on public.separacoes_pedidos;
create policy separacoes_pedidos_empresa_write
on public.separacoes_pedidos
for all
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = separacoes_pedidos.empresa_id
  )
)
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = separacoes_pedidos.empresa_id
  )
);

drop policy if exists separacoes_itens_empresa_select on public.separacoes_itens;
create policy separacoes_itens_empresa_select
on public.separacoes_itens
for select
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = separacoes_itens.empresa_id
  )
);

drop policy if exists separacoes_itens_empresa_write on public.separacoes_itens;
create policy separacoes_itens_empresa_write
on public.separacoes_itens
for all
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = separacoes_itens.empresa_id
  )
)
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = separacoes_itens.empresa_id
  )
);
