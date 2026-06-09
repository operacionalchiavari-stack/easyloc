-- =====================================================
-- EasyLoc Studio IA
-- Tabelas independentes do modulo de renderizacao visual
-- =====================================================

create extension if not exists pgcrypto;

create table if not exists public.studio_projetos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  nome text not null,
  descricao text,
  canvas_json jsonb not null default '{}'::jsonb,
  imagem_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_renderizacoes (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.studio_projetos(id) on delete cascade,
  imagem_url text,
  prompt text,
  modelo text,
  created_at timestamptz not null default now()
);

create index if not exists idx_studio_projetos_empresa_updated
  on public.studio_projetos (empresa_id, updated_at desc);

create index if not exists idx_studio_renderizacoes_projeto_created
  on public.studio_renderizacoes (projeto_id, created_at desc);

alter table public.studio_projetos enable row level security;
alter table public.studio_renderizacoes enable row level security;

drop policy if exists "studio_projetos_select_empresa" on public.studio_projetos;
drop policy if exists "studio_projetos_insert_empresa" on public.studio_projetos;
drop policy if exists "studio_projetos_update_empresa" on public.studio_projetos;
drop policy if exists "studio_projetos_delete_empresa" on public.studio_projetos;

create policy "studio_projetos_select_empresa"
on public.studio_projetos
for select
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = studio_projetos.empresa_id
  )
);

create policy "studio_projetos_insert_empresa"
on public.studio_projetos
for insert
with check (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = studio_projetos.empresa_id
  )
);

create policy "studio_projetos_update_empresa"
on public.studio_projetos
for update
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = studio_projetos.empresa_id
  )
)
with check (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = studio_projetos.empresa_id
  )
);

create policy "studio_projetos_delete_empresa"
on public.studio_projetos
for delete
using (
  exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = studio_projetos.empresa_id
  )
);

drop policy if exists "studio_renderizacoes_select_empresa" on public.studio_renderizacoes;
drop policy if exists "studio_renderizacoes_insert_empresa" on public.studio_renderizacoes;
drop policy if exists "studio_renderizacoes_delete_empresa" on public.studio_renderizacoes;

create policy "studio_renderizacoes_select_empresa"
on public.studio_renderizacoes
for select
using (
  exists (
    select 1
    from public.studio_projetos p
    join public.usuarios_empresas ue on ue.empresa_id = p.empresa_id
    where p.id = studio_renderizacoes.projeto_id
      and ue.user_id = auth.uid()
  )
);

create policy "studio_renderizacoes_insert_empresa"
on public.studio_renderizacoes
for insert
with check (
  exists (
    select 1
    from public.studio_projetos p
    join public.usuarios_empresas ue on ue.empresa_id = p.empresa_id
    where p.id = studio_renderizacoes.projeto_id
      and ue.user_id = auth.uid()
  )
);

create policy "studio_renderizacoes_delete_empresa"
on public.studio_renderizacoes
for delete
using (
  exists (
    select 1
    from public.studio_projetos p
    join public.usuarios_empresas ue on ue.empresa_id = p.empresa_id
    where p.id = studio_renderizacoes.projeto_id
      and ue.user_id = auth.uid()
  )
);
