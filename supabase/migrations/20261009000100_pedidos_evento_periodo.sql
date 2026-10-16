-- Evento de mais de um dia (out/2026, pedido do usuário: "no card de evento tem que ter a opção de colocar uma
-- data só ou um período... às vezes acontece do evento ser em mais de um dia").
-- data_evento continua sendo o 1º dia (tudo que já lê essa coluna segue igual); data_evento_fim é o último dia,
-- vazio quando o evento é de um dia só.
alter table public.separacoes_pedidos add column if not exists data_evento_fim date;

alter table public.separacoes_pedidos drop constraint if exists separacoes_pedidos_evento_periodo_chk;
alter table public.separacoes_pedidos add constraint separacoes_pedidos_evento_periodo_chk
  check (data_evento_fim is null or (data_evento is not null and data_evento_fim > data_evento));
