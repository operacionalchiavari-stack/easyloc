alter table if exists public.configuracoes_empresa
  add column if not exists logo_zoom numeric not null default 1;
