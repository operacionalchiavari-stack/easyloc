-- Executar somente quando encerrar a demonstração. Preserva o histórico.
update public.separacoes_pedidos set status_comercial='cancelado',status='cancelado'
where empresa_id='bb1260f0-99cd-4d17-ab9b-23c299b4c50b'
  and numero_pedido in ('TESTE-1107-A','TESTE-1107-B')
  and observacoes->>'demonstracao_reservas'='2026-07-11'
returning id,numero_pedido,status_comercial;
