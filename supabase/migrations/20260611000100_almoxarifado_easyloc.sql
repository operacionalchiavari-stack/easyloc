create extension if not exists pgcrypto;

create table if not exists public.almoxarifado_materiais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  codigo text,
  nome text not null,
  categoria text,
  subcategoria text,
  tipo_item text not null check (tipo_item in ('consumivel', 'retornavel', 'epi')),
  unidade text default 'UN',
  estoque_atual numeric(14, 3) default 0,
  estoque_minimo numeric(14, 3) default 0,
  estoque_maximo numeric(14, 3) default 0,
  valor_medio numeric(14, 2) default 0,
  setor_principal text,
  localizacao text,
  corredor text,
  prateleira text,
  nivel text,
  posicao text,
  foto_url text,
  qr_code text not null default gen_random_uuid()::text,
  codigo_barras text,
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.almoxarifado_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  material_id uuid references public.almoxarifado_materiais(id) on delete set null,
  material_nome text,
  tipo text not null check (tipo in ('entrada', 'saida', 'ajuste', 'devolucao')),
  quantidade numeric(14, 3) not null default 0,
  valor_unitario numeric(14, 2) default 0,
  valor_total numeric(14, 2) default 0,
  fornecedor text,
  numero_nf text,
  setor text,
  solicitante text,
  responsavel text,
  pedido_evento text,
  observacao text,
  autorizado_por text,
  autorizado_em timestamptz,
  data_movimentacao timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.almoxarifado_ferramentas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  material_id uuid references public.almoxarifado_materiais(id) on delete set null,
  material_nome text,
  responsavel text,
  setor text,
  data_retirada date default current_date,
  data_prevista date,
  data_devolucao date,
  observacao text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.almoxarifado_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  titulo text,
  setor text,
  solicitante text,
  responsavel text,
  status text default 'solicitado' check (status in ('solicitado', 'separando', 'pronto', 'entregue', 'cancelado')),
  itens jsonb default '[]'::jsonb,
  observacao text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.almoxarifado_compras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  fornecedor text,
  cnpj text,
  numero_nf text,
  documento text,
  chave_nfe text,
  status text default 'pendente',
  itens jsonb default '[]'::jsonb,
  valor_total numeric(14, 2) default 0,
  origem_importacao text,
  data_compra date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.almoxarifado_conferencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  responsavel text,
  status text default 'rascunho',
  itens jsonb default '[]'::jsonb,
  divergencias jsonb default '[]'::jsonb,
  finalizada_em timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.almoxarifado_configuracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  chave text not null,
  valor jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, chave)
);

create table if not exists public.almoxarifado_auditoria (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  usuario_id uuid,
  usuario_nome text,
  acao text not null,
  tipo_movimentacao text,
  ip text,
  dispositivo text,
  detalhes jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create unique index if not exists almoxarifado_materiais_qr_uidx
  on public.almoxarifado_materiais(qr_code)
  where qr_code is not null;

create index if not exists almoxarifado_materiais_empresa_idx on public.almoxarifado_materiais(empresa_id);
create index if not exists almoxarifado_materiais_tipo_idx on public.almoxarifado_materiais(tipo_item);
create index if not exists almoxarifado_movimentacoes_empresa_idx on public.almoxarifado_movimentacoes(empresa_id, created_at desc);
create index if not exists almoxarifado_ferramentas_empresa_idx on public.almoxarifado_ferramentas(empresa_id, data_prevista);
create index if not exists almoxarifado_solicitacoes_empresa_idx on public.almoxarifado_solicitacoes(empresa_id, status);
create index if not exists almoxarifado_auditoria_empresa_idx on public.almoxarifado_auditoria(empresa_id, created_at desc);

alter table public.almoxarifado_materiais enable row level security;
alter table public.almoxarifado_movimentacoes enable row level security;
alter table public.almoxarifado_ferramentas enable row level security;
alter table public.almoxarifado_solicitacoes enable row level security;
alter table public.almoxarifado_compras enable row level security;
alter table public.almoxarifado_conferencias enable row level security;
alter table public.almoxarifado_configuracoes enable row level security;
alter table public.almoxarifado_auditoria enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'almoxarifado_materiais',
    'almoxarifado_movimentacoes',
    'almoxarifado_ferramentas',
    'almoxarifado_solicitacoes',
    'almoxarifado_compras',
    'almoxarifado_conferencias',
    'almoxarifado_configuracoes',
    'almoxarifado_auditoria'
  ]
  loop
    execute format('drop policy if exists "%s_empresa_select" on public.%I', t, t);
    execute format('drop policy if exists "%s_empresa_insert" on public.%I', t, t);
    execute format('drop policy if exists "%s_empresa_update" on public.%I', t, t);
    execute format('drop policy if exists "%s_empresa_delete" on public.%I', t, t);

    execute format(
      'create policy "%s_empresa_select" on public.%I for select using (empresa_id::text = coalesce(auth.jwt() ->> ''empresa_id'', empresa_id::text))',
      t,
      t
    );
    execute format(
      'create policy "%s_empresa_insert" on public.%I for insert with check (empresa_id::text = coalesce(auth.jwt() ->> ''empresa_id'', empresa_id::text))',
      t,
      t
    );
    execute format(
      'create policy "%s_empresa_update" on public.%I for update using (empresa_id::text = coalesce(auth.jwt() ->> ''empresa_id'', empresa_id::text)) with check (empresa_id::text = coalesce(auth.jwt() ->> ''empresa_id'', empresa_id::text))',
      t,
      t
    );
    execute format(
      'create policy "%s_empresa_delete" on public.%I for delete using (empresa_id::text = coalesce(auth.jwt() ->> ''empresa_id'', empresa_id::text))',
      t,
      t
    );
  end loop;
end $$;

create or replace view public.v_almoxarifado_dashboard as
select
  empresa_id,
  count(*) as itens_cadastrados,
  coalesce(sum(estoque_atual * valor_medio), 0) as valor_total_estoque,
  count(*) filter (where estoque_atual <= estoque_minimo) as itens_abaixo_minimo,
  count(*) filter (where ativo = false) as itens_inativos
from public.almoxarifado_materiais
group by empresa_id;
