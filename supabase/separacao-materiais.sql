-- EasyLoc - Separacao de Materiais
-- Execute este arquivo no SQL Editor do Supabase depois de revisar os nomes das tabelas existentes.
-- O modulo reutiliza: empresas, usuarios_empresas e itens.

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
  finalizado_em timestamptz,
  constraint separacoes_pedidos_status_chk check (
    status in (
      'pendente',
      'em_separacao',
      'separado',
      'separado_com_divergencia',
      'pausado'
    )
  )
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
  atualizado_em timestamptz not null default now(),
  constraint separacoes_itens_tipo_controle_chk check (
    tipo_controle in ('quantidade', 'patrimonio')
  ),
  constraint separacoes_itens_status_chk check (
    status in ('pendente', 'em_andamento', 'concluido', 'divergente')
  ),
  constraint separacoes_itens_quantidade_chk check (
    quantidade_solicitada >= 0 and quantidade_separada >= 0
  )
);

create table if not exists public.separacoes_leituras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  separacao_pedido_id uuid references public.separacoes_pedidos(id) on delete set null,
  separacao_item_id uuid references public.separacoes_itens(id) on delete set null,
  item_id uuid references public.itens(id),
  item_nome text,
  codigo_lido text not null,
  tipo_controle text not null default 'quantidade',
  usuario_id uuid not null,
  usuario_nome text,
  status_leitura text not null,
  observacao text,
  created_at timestamptz not null default now(),
  constraint separacoes_leituras_tipo_controle_chk check (
    tipo_controle in ('quantidade', 'patrimonio')
  ),
  constraint separacoes_leituras_status_chk check (
    status_leitura in ('sucesso', 'erro', 'bloqueado', 'aviso')
  )
);

create table if not exists public.itens_patrimonios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  item_id uuid not null references public.itens(id) on delete cascade,
  codigo_patrimonio text not null,
  status text not null default 'disponivel',
  observacao text,
  created_at timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint itens_patrimonios_status_chk check (
    status in ('disponivel', 'separado', 'manutencao', 'inativo')
  ),
  constraint itens_patrimonios_empresa_codigo_uk unique (empresa_id, codigo_patrimonio)
);

create table if not exists public.configuracoes_separacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  item_id uuid references public.itens(id) on delete cascade,
  tipo_controle_padrao text not null default 'quantidade',
  permitir_finalizar_com_divergencia boolean not null default true,
  leitura_exige_foco boolean not null default false,
  created_at timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint configuracoes_separacao_tipo_chk check (
    tipo_controle_padrao in ('quantidade', 'patrimonio')
  )
);

create unique index if not exists configuracoes_separacao_empresa_padrao_uk
  on public.configuracoes_separacao (empresa_id)
  where item_id is null;

create unique index if not exists configuracoes_separacao_empresa_item_uk
  on public.configuracoes_separacao (empresa_id, item_id)
  where item_id is not null;

create index if not exists separacoes_pedidos_empresa_status_idx
  on public.separacoes_pedidos (empresa_id, status, data_hora);

create index if not exists separacoes_itens_pedido_idx
  on public.separacoes_itens (empresa_id, separacao_pedido_id);

create index if not exists separacoes_itens_item_idx
  on public.separacoes_itens (empresa_id, item_id);

create index if not exists separacoes_leituras_pedido_idx
  on public.separacoes_leituras (empresa_id, separacao_pedido_id, created_at desc);

create index if not exists itens_patrimonios_item_idx
  on public.itens_patrimonios (empresa_id, item_id);

create or replace function public.easyloc_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.atualizado_em = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_separacoes_pedidos_touch on public.separacoes_pedidos;
create trigger trg_separacoes_pedidos_touch
before update on public.separacoes_pedidos
for each row execute function public.easyloc_touch_updated_at();

drop trigger if exists trg_separacoes_itens_touch on public.separacoes_itens;
create trigger trg_separacoes_itens_touch
before update on public.separacoes_itens
for each row execute function public.easyloc_touch_updated_at();

drop trigger if exists trg_itens_patrimonios_touch on public.itens_patrimonios;
create trigger trg_itens_patrimonios_touch
before update on public.itens_patrimonios
for each row execute function public.easyloc_touch_updated_at();

drop trigger if exists trg_configuracoes_separacao_touch on public.configuracoes_separacao;
create trigger trg_configuracoes_separacao_touch
before update on public.configuracoes_separacao
for each row execute function public.easyloc_touch_updated_at();

alter table public.separacoes_pedidos enable row level security;
alter table public.separacoes_itens enable row level security;
alter table public.separacoes_leituras enable row level security;
alter table public.itens_patrimonios enable row level security;
alter table public.configuracoes_separacao enable row level security;

drop policy if exists separacoes_pedidos_empresa_select on public.separacoes_pedidos;
create policy separacoes_pedidos_empresa_select
on public.separacoes_pedidos
for select
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = separacoes_pedidos.empresa_id
  )
);

drop policy if exists separacoes_pedidos_empresa_write on public.separacoes_pedidos;
create policy separacoes_pedidos_empresa_write
on public.separacoes_pedidos
for all
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = separacoes_pedidos.empresa_id
  )
)
with check (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = separacoes_pedidos.empresa_id
  )
);

drop policy if exists separacoes_itens_empresa_select on public.separacoes_itens;
create policy separacoes_itens_empresa_select
on public.separacoes_itens
for select
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = separacoes_itens.empresa_id
  )
);

drop policy if exists separacoes_itens_empresa_write on public.separacoes_itens;
create policy separacoes_itens_empresa_write
on public.separacoes_itens
for all
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = separacoes_itens.empresa_id
  )
)
with check (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = separacoes_itens.empresa_id
  )
);

drop policy if exists separacoes_leituras_empresa_select on public.separacoes_leituras;
create policy separacoes_leituras_empresa_select
on public.separacoes_leituras
for select
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = separacoes_leituras.empresa_id
  )
);

drop policy if exists separacoes_leituras_empresa_write on public.separacoes_leituras;
create policy separacoes_leituras_empresa_write
on public.separacoes_leituras
for all
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = separacoes_leituras.empresa_id
  )
)
with check (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = separacoes_leituras.empresa_id
  )
);

drop policy if exists itens_patrimonios_empresa_select on public.itens_patrimonios;
create policy itens_patrimonios_empresa_select
on public.itens_patrimonios
for select
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens_patrimonios.empresa_id
  )
);

drop policy if exists itens_patrimonios_empresa_write on public.itens_patrimonios;
create policy itens_patrimonios_empresa_write
on public.itens_patrimonios
for all
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens_patrimonios.empresa_id
  )
)
with check (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = itens_patrimonios.empresa_id
  )
);

drop policy if exists configuracoes_separacao_empresa_select on public.configuracoes_separacao;
create policy configuracoes_separacao_empresa_select
on public.configuracoes_separacao
for select
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = configuracoes_separacao.empresa_id
  )
);

drop policy if exists configuracoes_separacao_empresa_write on public.configuracoes_separacao;
create policy configuracoes_separacao_empresa_write
on public.configuracoes_separacao
for all
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = configuracoes_separacao.empresa_id
  )
)
with check (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = configuracoes_separacao.empresa_id
  )
);
