create extension if not exists pgcrypto;

create table if not exists public.payment_gateway_connections (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  gateway text not null,
  ambiente text not null default 'sandbox'
    check (ambiente in ('sandbox','producao')),
  status text not null default 'desconectado'
    check (status in ('desconectado','conectado','erro','em_teste')),
  credential_preview jsonb not null default '{}'::jsonb,
  capabilities jsonb not null default '[]'::jsonb,
  connected_at timestamptz,
  ultimo_teste_at timestamptz,
  ultimo_teste_ms integer,
  ultimo_teste_status text,
  ultima_sincronizacao timestamptz,
  ultimo_erro text,
  provider_account jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, gateway)
);

create table if not exists public.payment_gateway_credentials (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  connection_id uuid not null references public.payment_gateway_connections(id) on delete cascade,
  credentials_ciphertext text not null,
  credentials_iv text not null,
  credentials_algorithm text not null default 'AES-GCM',
  key_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id),
  unique (empresa_id, connection_id)
);

create table if not exists public.payment_gateway_payments (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  gateway_connection_id uuid not null references public.payment_gateway_connections(id) on delete cascade,
  gateway text not null,
  pedido_id uuid references public.separacoes_pedidos(id) on delete set null,
  external_id text,
  external_reference text,
  status text not null default 'pendente',
  amount numeric(14,2) not null default 0,
  currency text not null default 'BRL',
  payment_method text not null default 'pix',
  payer_email text,
  qr_code text,
  qr_code_base64 text,
  ticket_url text,
  payload jsonb not null default '{}'::jsonb,
  response jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_gateway_events (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete cascade,
  gateway_connection_id uuid references public.payment_gateway_connections(id) on delete set null,
  gateway text not null,
  event_type text not null,
  provider_event_id text,
  external_payment_id text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists payment_gateway_connections_empresa_idx
  on public.payment_gateway_connections(empresa_id, gateway);

create index if not exists payment_gateway_credentials_empresa_idx
  on public.payment_gateway_credentials(empresa_id, connection_id);

create index if not exists payment_gateway_payments_empresa_created_idx
  on public.payment_gateway_payments(empresa_id, created_at desc);

create index if not exists payment_gateway_payments_pedido_idx
  on public.payment_gateway_payments(empresa_id, pedido_id, created_at desc);

create unique index if not exists payment_gateway_payments_external_unique_idx
  on public.payment_gateway_payments(gateway, external_id)
  where external_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_gateway_payments_gateway_external_key'
  ) then
    alter table public.payment_gateway_payments
      add constraint payment_gateway_payments_gateway_external_key
      unique (gateway, external_id);
  end if;
end;
$$;

create index if not exists payment_gateway_events_empresa_created_idx
  on public.payment_gateway_events(empresa_id, created_at desc);

create index if not exists payment_gateway_events_external_idx
  on public.payment_gateway_events(gateway, external_payment_id, created_at desc);

alter table public.payment_gateway_connections enable row level security;
alter table public.payment_gateway_credentials enable row level security;
alter table public.payment_gateway_payments enable row level security;
alter table public.payment_gateway_events enable row level security;

drop policy if exists payment_gateway_connections_empresa_select on public.payment_gateway_connections;
create policy payment_gateway_connections_empresa_select on public.payment_gateway_connections
for select to authenticated
using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = payment_gateway_connections.empresa_id
    and ue.user_id = auth.uid()
));

drop policy if exists payment_gateway_payments_empresa_select on public.payment_gateway_payments;
create policy payment_gateway_payments_empresa_select on public.payment_gateway_payments
for select to authenticated
using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = payment_gateway_payments.empresa_id
    and ue.user_id = auth.uid()
));

drop policy if exists payment_gateway_events_empresa_select on public.payment_gateway_events;
create policy payment_gateway_events_empresa_select on public.payment_gateway_events
for select to authenticated
using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = payment_gateway_events.empresa_id
    and ue.user_id = auth.uid()
));

create or replace function public.payment_gateway_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_payment_gateway_connections_updated_at on public.payment_gateway_connections;
create trigger trg_payment_gateway_connections_updated_at
before update on public.payment_gateway_connections
for each row execute function public.payment_gateway_touch_updated_at();

drop trigger if exists trg_payment_gateway_credentials_updated_at on public.payment_gateway_credentials;
create trigger trg_payment_gateway_credentials_updated_at
before update on public.payment_gateway_credentials
for each row execute function public.payment_gateway_touch_updated_at();

drop trigger if exists trg_payment_gateway_payments_updated_at on public.payment_gateway_payments;
create trigger trg_payment_gateway_payments_updated_at
before update on public.payment_gateway_payments
for each row execute function public.payment_gateway_touch_updated_at();

insert into public.permissoes_catalogo (chave, modulo, submodulo, acao, descricao, sensivel, ordem) values
('configuracoes.integracoes.gateways_pagamento.visualizar','Configuracoes','Gateways de Pagamento','visualizar','Visualizar integracoes de pagamento',true,930),
('configuracoes.integracoes.gateways_pagamento.editar','Configuracoes','Gateways de Pagamento','editar','Configurar credenciais de gateways de pagamento',true,931),
('configuracoes.integracoes.gateways_pagamento.testar','Configuracoes','Gateways de Pagamento','executar','Testar conexao de gateways de pagamento',true,932)
on conflict (chave) do update set
  modulo = excluded.modulo,
  submodulo = excluded.submodulo,
  acao = excluded.acao,
  descricao = excluded.descricao,
  sensivel = excluded.sensivel,
  ordem = excluded.ordem;
