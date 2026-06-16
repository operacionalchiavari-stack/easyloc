create table if not exists public.empresa_logistica_regras (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  carregamento_dias_antes_entrega integer not null default 1,
  triagem_dias_antes_carregamento integer not null default 2,
  montagem_dias_apos_entrega integer not null default 0,
  desmontagem_dias_apos_coleta integer not null default 0,
  triagem_retorno_dias_apos_coleta integer not null default 1,
  hora_padrao time without time zone not null default '08:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cronograma_logistico (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  pedido_id uuid not null references public.separacoes_pedidos(id) on delete cascade,
  numero_pedido text,
  cliente_nome text,
  local_nome text,
  tipo_evento text,
  data_evento date,
  etapa text not null,
  data_etapa date not null,
  horario time without time zone not null default '08:00',
  responsavel text,
  caminhao text,
  equipe text,
  observacao text,
  origem text not null default 'pedido',
  regras_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'programado',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pedido_id, etapa)
);

create index if not exists cronograma_logistico_empresa_data_idx
  on public.cronograma_logistico (empresa_id, data_etapa);

create index if not exists cronograma_logistico_empresa_pedido_idx
  on public.cronograma_logistico (empresa_id, pedido_id);

alter table public.empresa_logistica_regras enable row level security;
alter table public.cronograma_logistico enable row level security;

drop policy if exists empresa_logistica_regras_empresa_select on public.empresa_logistica_regras;
create policy empresa_logistica_regras_empresa_select
on public.empresa_logistica_regras
for select
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = empresa_logistica_regras.empresa_id
  )
);

drop policy if exists empresa_logistica_regras_empresa_write on public.empresa_logistica_regras;
create policy empresa_logistica_regras_empresa_write
on public.empresa_logistica_regras
for all
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = empresa_logistica_regras.empresa_id
  )
)
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = empresa_logistica_regras.empresa_id
  )
);

drop policy if exists cronograma_logistico_empresa_select on public.cronograma_logistico;
create policy cronograma_logistico_empresa_select
on public.cronograma_logistico
for select
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = cronograma_logistico.empresa_id
  )
);

drop policy if exists cronograma_logistico_empresa_write on public.cronograma_logistico;
create policy cronograma_logistico_empresa_write
on public.cronograma_logistico
for all
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = cronograma_logistico.empresa_id
  )
)
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = cronograma_logistico.empresa_id
  )
);
