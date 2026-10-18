-- Conferência do carregamento por bipagem (out/2026, etapa 4). O pedido ganha o andamento da operação:
-- status_operacional (separado → carregado → ... nas próximas etapas) e operacao (registro de cada conferência:
-- quando, quem, quantas etiquetas lidas, quais faltaram).
alter table public.separacoes_pedidos
  add column if not exists status_operacional text,
  add column if not exists operacao jsonb not null default '{}'::jsonb;
