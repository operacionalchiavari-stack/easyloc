alter table public.payment_gateway_payments
  add column if not exists parcela_index integer,
  add column if not exists parcela_numero text,
  add column if not exists parcela_label text,
  add column if not exists due_date date,
  add column if not exists generated_by uuid,
  add column if not exists generated_by_name text,
  add column if not exists sent_by uuid,
  add column if not exists sent_by_name text,
  add column if not exists sent_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists cancelled_by_name text;

create index if not exists payment_gateway_payments_active_parcela_idx
  on public.payment_gateway_payments(empresa_id, pedido_id, parcela_index, status, created_at desc);

create table if not exists public.payment_gateway_history (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  payment_id uuid references public.payment_gateway_payments(id) on delete set null,
  gateway_connection_id uuid references public.payment_gateway_connections(id) on delete set null,
  gateway text not null,
  pedido_id uuid references public.separacoes_pedidos(id) on delete set null,
  parcela_index integer,
  event_type text not null,
  usuario_id uuid,
  usuario_nome text,
  external_id text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_gateway_history_empresa_created_idx
  on public.payment_gateway_history(empresa_id, created_at desc);

create index if not exists payment_gateway_history_payment_idx
  on public.payment_gateway_history(payment_id, created_at desc);

create index if not exists payment_gateway_history_pedido_idx
  on public.payment_gateway_history(empresa_id, pedido_id, parcela_index, created_at desc);

alter table public.payment_gateway_history enable row level security;

drop policy if exists payment_gateway_history_empresa_select on public.payment_gateway_history;
create policy payment_gateway_history_empresa_select on public.payment_gateway_history
for select to authenticated
using (exists (
  select 1 from public.usuarios_empresas ue
  where ue.empresa_id = payment_gateway_history.empresa_id
    and ue.user_id = auth.uid()
));
