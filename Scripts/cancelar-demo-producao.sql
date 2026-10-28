-- Cancela exclusivamente os pedidos de demonstração, preservando o histórico.
update public.separacoes_pedidos set status_comercial='cancelado',status='cancelado'
where empresa_id='bb1260f0-99cd-4d17-ab9b-23c299b4c50b'
 and numero_pedido like 'TESTE-PROD-%' and observacoes->>'demo_producao'='20261022'
returning id,numero_pedido,status_comercial;
