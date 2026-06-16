alter table if exists public.almoxarifado_compras
  add column if not exists tipo_compra text default 'insumos';

create index if not exists almoxarifado_compras_tipo_compra_idx
  on public.almoxarifado_compras(empresa_id, tipo_compra, status);
