-- Demonstração solicitada: duas pré-reservas reais, identificadas como TESTE.
-- Não altera estoque cadastrado nem aprova pedidos. Validade de dois dias.
begin;
do $$
declare empresa constant uuid := 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b';
  pedido uuid; numero text; cliente text;
begin
  if exists(select 1 from separacoes_pedidos where empresa_id=empresa
    and numero_pedido in ('TESTE-1107-A','TESTE-1107-B')) then
    raise exception 'Os pedidos de demonstração já existem. Nenhuma reserva foi duplicada.';
  end if;
  perform operacao_validar_reserva(empresa,null,
    '[{"item_id":"2b7747eb-bdd5-4794-94ac-303dd2758437","quantidade_solicitada":2},
      {"item_id":"777497f7-8582-4ff5-a285-ecc5d23b6b90","quantidade_solicitada":2}]'::jsonb,
    '2026-07-10','2026-07-12');
  for numero,cliente in select * from (values
    ('TESTE-1107-A','TESTE · Evento Jardim'),('TESTE-1107-B','TESTE · Evento Salão')) v(numero,cliente)
  loop
    insert into separacoes_pedidos(empresa_id,numero_pedido,cliente_nome,tipo_evento,
      data_evento,data_entrega,data_coleta,local_nome,status_comercial,pre_reserva_ate,valor_total,observacoes)
    values(empresa,numero,cliente,'Demonstração','2026-07-11','2026-07-10','2026-07-12',
      'DEMONSTRAÇÃO · Não executar entrega','pre_reserva',current_date+2,0,
      '{"demonstracao_reservas":"2026-07-11","observacoes":"TESTE solicitado para visualizar as reservas no Comercial. Não cobrar, separar ou entregar."}'::jsonb)
    returning id into pedido;
    insert into separacoes_itens(empresa_id,separacao_pedido_id,item_id,quantidade_solicitada)
    values(empresa,pedido,'2b7747eb-bdd5-4794-94ac-303dd2758437',1),
      (empresa,pedido,'777497f7-8582-4ff5-a285-ecc5d23b6b90',1);
  end loop;
end $$;
commit;
select p.numero_pedido,p.cliente_nome,p.pre_reserva_ate,i.codigo,i.produto,s.quantidade_solicitada
from separacoes_pedidos p join separacoes_itens s on s.separacao_pedido_id=p.id join itens i on i.id=s.item_id
where p.empresa_id='bb1260f0-99cd-4d17-ab9b-23c299b4c50b'
  and p.observacoes->>'demonstracao_reservas'='2026-07-11'
order by p.numero_pedido,i.codigo;
