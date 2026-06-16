alter table if exists public.separacoes_pedidos
  add column if not exists status_planejamento text;

create table if not exists public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  funcao text,
  telefone text,
  foto_url text,
  status text not null default 'disponivel',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planejamentos_logisticos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  pedido_id uuid not null references public.separacoes_pedidos(id) on delete cascade,
  status text not null default 'aguardando',
  data_planejamento timestamptz,
  observacoes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, pedido_id)
);

create table if not exists public.planejamento_caminhoes (
  id uuid primary key default gen_random_uuid(),
  planejamento_id uuid not null references public.planejamentos_logisticos(id) on delete cascade,
  caminhao_id uuid not null references public.caminhoes(id) on delete restrict,
  tipo_operacao text,
  data_inicio timestamptz not null,
  data_fim timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.planejamento_equipe (
  id uuid primary key default gen_random_uuid(),
  planejamento_id uuid not null references public.planejamentos_logisticos(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id) on delete restrict,
  funcao_na_operacao text,
  data_inicio timestamptz not null,
  data_fim timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists colaboradores_empresa_status_idx
  on public.colaboradores (empresa_id, status);

create index if not exists planejamentos_logisticos_empresa_status_idx
  on public.planejamentos_logisticos (empresa_id, status);

create index if not exists planejamentos_logisticos_pedido_idx
  on public.planejamentos_logisticos (pedido_id);

create index if not exists planejamento_caminhoes_recurso_periodo_idx
  on public.planejamento_caminhoes (caminhao_id, data_inicio, data_fim);

create index if not exists planejamento_equipe_recurso_periodo_idx
  on public.planejamento_equipe (colaborador_id, data_inicio, data_fim);

alter table public.colaboradores enable row level security;
alter table public.planejamentos_logisticos enable row level security;
alter table public.planejamento_caminhoes enable row level security;
alter table public.planejamento_equipe enable row level security;

drop policy if exists colaboradores_empresa_select on public.colaboradores;
create policy colaboradores_empresa_select
on public.colaboradores
for select
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = colaboradores.empresa_id
  )
);

drop policy if exists colaboradores_empresa_write on public.colaboradores;
create policy colaboradores_empresa_write
on public.colaboradores
for all
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = colaboradores.empresa_id
  )
)
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = colaboradores.empresa_id
  )
);

drop policy if exists planejamentos_logisticos_empresa_select on public.planejamentos_logisticos;
create policy planejamentos_logisticos_empresa_select
on public.planejamentos_logisticos
for select
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = planejamentos_logisticos.empresa_id
  )
);

drop policy if exists planejamentos_logisticos_empresa_write on public.planejamentos_logisticos;
create policy planejamentos_logisticos_empresa_write
on public.planejamentos_logisticos
for all
to authenticated
using (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = planejamentos_logisticos.empresa_id
  )
)
with check (
  exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = planejamentos_logisticos.empresa_id
  )
);

drop policy if exists planejamento_caminhoes_empresa_select on public.planejamento_caminhoes;
create policy planejamento_caminhoes_empresa_select
on public.planejamento_caminhoes
for select
to authenticated
using (
  exists (
    select 1
    from public.planejamentos_logisticos pl
    join public.usuarios_empresas ue on ue.empresa_id = pl.empresa_id
    where pl.id = planejamento_caminhoes.planejamento_id
      and ue.user_id = auth.uid()
  )
);

drop policy if exists planejamento_caminhoes_empresa_write on public.planejamento_caminhoes;
create policy planejamento_caminhoes_empresa_write
on public.planejamento_caminhoes
for all
to authenticated
using (
  exists (
    select 1
    from public.planejamentos_logisticos pl
    join public.usuarios_empresas ue on ue.empresa_id = pl.empresa_id
    where pl.id = planejamento_caminhoes.planejamento_id
      and ue.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.planejamentos_logisticos pl
    join public.usuarios_empresas ue on ue.empresa_id = pl.empresa_id
    where pl.id = planejamento_caminhoes.planejamento_id
      and ue.user_id = auth.uid()
  )
);

drop policy if exists planejamento_equipe_empresa_select on public.planejamento_equipe;
create policy planejamento_equipe_empresa_select
on public.planejamento_equipe
for select
to authenticated
using (
  exists (
    select 1
    from public.planejamentos_logisticos pl
    join public.usuarios_empresas ue on ue.empresa_id = pl.empresa_id
    where pl.id = planejamento_equipe.planejamento_id
      and ue.user_id = auth.uid()
  )
);

drop policy if exists planejamento_equipe_empresa_write on public.planejamento_equipe;
create policy planejamento_equipe_empresa_write
on public.planejamento_equipe
for all
to authenticated
using (
  exists (
    select 1
    from public.planejamentos_logisticos pl
    join public.usuarios_empresas ue on ue.empresa_id = pl.empresa_id
    where pl.id = planejamento_equipe.planejamento_id
      and ue.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.planejamentos_logisticos pl
    join public.usuarios_empresas ue on ue.empresa_id = pl.empresa_id
    where pl.id = planejamento_equipe.planejamento_id
      and ue.user_id = auth.uid()
  )
);
