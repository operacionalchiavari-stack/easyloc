create extension if not exists pgcrypto;

alter table if exists public.almoxarifado_materiais
  add column if not exists insumo_id uuid,
  add column if not exists origem_cadastro text default 'almoxarifado';

alter table if exists public.almoxarifado_movimentacoes
  add column if not exists nota_id uuid,
  add column if not exists chave_nfe text,
  add column if not exists origem_documento text,
  add column if not exists qr_code_lido text,
  add column if not exists codigo_barras_lido text;

alter table if exists public.insumos
  add column if not exists qr_code text,
  add column if not exists estoque_atual numeric(14, 3) default 0,
  add column if not exists valor_medio numeric(14, 2) default 0,
  add column if not exists ultimo_valor_unitario numeric(14, 2) default 0,
  add column if not exists codigo_barras text,
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if to_regclass('public.insumos') is not null then
    update public.insumos
    set qr_code = gen_random_uuid()::text
    where qr_code is null;
  end if;
end $$;

create table if not exists public.almoxarifado_notas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  fornecedor text,
  cnpj text,
  numero_nf text,
  documento text,
  chave_nfe text,
  origem_importacao text,
  status text default 'pendente',
  itens jsonb default '[]'::jsonb,
  valor_total numeric(14, 2) default 0,
  observacao text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists almoxarifado_notas_empresa_idx
  on public.almoxarifado_notas(empresa_id, created_at desc);

create index if not exists almoxarifado_materiais_insumo_idx
  on public.almoxarifado_materiais(insumo_id);

alter table public.almoxarifado_notas enable row level security;

drop policy if exists "almoxarifado_notas_empresa_select" on public.almoxarifado_notas;
drop policy if exists "almoxarifado_notas_empresa_insert" on public.almoxarifado_notas;
drop policy if exists "almoxarifado_notas_empresa_update" on public.almoxarifado_notas;
drop policy if exists "almoxarifado_notas_empresa_delete" on public.almoxarifado_notas;

create policy "almoxarifado_notas_empresa_select"
  on public.almoxarifado_notas
  for select
  using (empresa_id::text = coalesce(auth.jwt() ->> 'empresa_id', empresa_id::text));

create policy "almoxarifado_notas_empresa_insert"
  on public.almoxarifado_notas
  for insert
  with check (empresa_id::text = coalesce(auth.jwt() ->> 'empresa_id', empresa_id::text));

create policy "almoxarifado_notas_empresa_update"
  on public.almoxarifado_notas
  for update
  using (empresa_id::text = coalesce(auth.jwt() ->> 'empresa_id', empresa_id::text))
  with check (empresa_id::text = coalesce(auth.jwt() ->> 'empresa_id', empresa_id::text));

create policy "almoxarifado_notas_empresa_delete"
  on public.almoxarifado_notas
  for delete
  using (empresa_id::text = coalesce(auth.jwt() ->> 'empresa_id', empresa_id::text));
