alter table if exists public.almoxarifado_compras
  add column if not exists centro_custo text,
  add column if not exists prioridade text default 'normal',
  add column if not exists descricao text,
  add column if not exists motivo_compra text,
  add column if not exists forma_pagamento text,
  add column if not exists condicao_pagamento text,
  add column if not exists parcelas integer default 1,
  add column if not exists primeiro_vencimento date,
  add column if not exists valor_frete numeric(14, 2) default 0,
  add column if not exists valor_desconto numeric(14, 2) default 0,
  add column if not exists observacao_financeira text;

create index if not exists almoxarifado_compras_previsao_status_idx
  on public.almoxarifado_compras(empresa_id, status, data_prevista);
