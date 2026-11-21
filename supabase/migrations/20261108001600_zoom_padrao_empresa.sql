alter table public.configuracoes_empresa
  add column if not exists sistema_zoom integer not null default 100
  constraint configuracoes_empresa_sistema_zoom_check check (sistema_zoom between 75 and 125);
