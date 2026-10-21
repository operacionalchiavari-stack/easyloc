-- Pré-reserva nunca sem data (out/2026, pedido do usuário: "não tem como colocar pré-reserva sem data, nunca").
-- Regra na própria tabela, valendo para qualquer caminho que grave o pedido. As pré-reservas que existiam sem data
-- (só pedidos de teste do cronograma) ganharam a véspera da entrega como validade.
begin;
update public.separacoes_pedidos
   set pre_reserva_ate = coalesce(data_entrega, data_evento, current_date) - 1
 where status_comercial = 'pre_reserva' and pre_reserva_ate is null;
alter table public.separacoes_pedidos drop constraint if exists separacoes_pedidos_pre_reserva_com_data;
alter table public.separacoes_pedidos add constraint separacoes_pedidos_pre_reserva_com_data
  check (status_comercial is distinct from 'pre_reserva' or pre_reserva_ate is not null);
commit;
