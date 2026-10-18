-- Parâmetros do sistema (out/2026): a partir de qual status o pedido entra no cronograma e quem fica
-- como responsável/equipe padrão das triagens geradas pelo pedido. Os dias de cada etapa já existiam.
alter table public.empresa_logistica_regras
  add column if not exists status_cronograma text[] not null default array['pre_reserva','aprovado'],
  add column if not exists triagem_responsavel text,
  add column if not exists triagem_equipe text;

alter table public.empresa_logistica_regras
  drop constraint if exists empresa_logistica_regras_status_cronograma_check;
alter table public.empresa_logistica_regras
  add constraint empresa_logistica_regras_status_cronograma_check
  check (status_cronograma <@ array['orcamento','pre_reserva','aprovado','finalizado','enviado']::text[]);
