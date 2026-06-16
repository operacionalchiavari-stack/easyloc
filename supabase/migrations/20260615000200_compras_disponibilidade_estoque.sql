alter table if exists public.almoxarifado_compras
  add column if not exists data_prevista date,
  add column if not exists responsavel text,
  add column if not exists observacao text,
  add column if not exists recebido_por text,
  add column if not exists recebido_em timestamptz;

alter table if exists public.itens
  add column if not exists estoque_total numeric(12, 2) default 0,
  add column if not exists estoque_manutencao numeric(12, 2) default 0,
  add column if not exists estoque_indisponivel numeric(12, 2) default 0;

create index if not exists almoxarifado_compras_recebimento_idx
  on public.almoxarifado_compras(empresa_id, status, data_prevista);

create index if not exists itens_empresa_estoque_idx
  on public.itens(empresa_id, categoria);
