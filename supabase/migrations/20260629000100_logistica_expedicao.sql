-- EasyLoc - Logistica / Expedicao
-- Distribuicao de itens por caminhao e conferencia de carregamento.

create table if not exists public.logistica_expedicoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  route_id text not null,
  status text not null default 'aguardando_distribuicao',
  route_snapshot jsonb not null default '{}'::jsonb,
  team_snapshot jsonb not null default '{}'::jsonb,
  distribuicao jsonb not null default '{}'::jsonb,
  carregamentos jsonb not null default '{}'::jsonb,
  criado_por uuid,
  atualizado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint logistica_expedicoes_status_chk check (
    status in (
      'aguardando_distribuicao',
      'distribuicao_em_andamento',
      'pronto_carregamento',
      'carregamento_em_andamento',
      'carregamento_concluido',
      'pausado',
      'cancelado'
    )
  ),
  unique (empresa_id, route_id)
);

create index if not exists logistica_expedicoes_empresa_status_idx
  on public.logistica_expedicoes (empresa_id, status, updated_at desc);

create index if not exists logistica_expedicoes_empresa_route_idx
  on public.logistica_expedicoes (empresa_id, route_id);

create or replace function public.set_logistica_expedicoes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_logistica_expedicoes_updated_at on public.logistica_expedicoes;
create trigger trg_logistica_expedicoes_updated_at
before update on public.logistica_expedicoes
for each row execute function public.set_logistica_expedicoes_updated_at();

alter table public.logistica_expedicoes enable row level security;

drop policy if exists logistica_expedicoes_empresa_select on public.logistica_expedicoes;
create policy logistica_expedicoes_empresa_select
on public.logistica_expedicoes
for select
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = logistica_expedicoes.empresa_id
  )
);

drop policy if exists logistica_expedicoes_empresa_insert on public.logistica_expedicoes;
create policy logistica_expedicoes_empresa_insert
on public.logistica_expedicoes
for insert
with check (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = logistica_expedicoes.empresa_id
  )
);

drop policy if exists logistica_expedicoes_empresa_update on public.logistica_expedicoes;
create policy logistica_expedicoes_empresa_update
on public.logistica_expedicoes
for update
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = logistica_expedicoes.empresa_id
  )
)
with check (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = logistica_expedicoes.empresa_id
  )
);

insert into public.permissoes_catalogo (chave, modulo, submodulo, acao, descricao, sensivel, ordem) values
('logistica.expedicao.visualizar','Logistica','Expedicao','visualizar','Visualizar expedicao',false,212),
('logistica.expedicao.distribuir','Logistica','Expedicao','editar','Distribuir itens nos caminhoes',false,213),
('logistica.expedicao.carregamento','Logistica','Expedicao','aprovar','Executar conferencia de carregamento',true,214)
on conflict (chave) do nothing;
