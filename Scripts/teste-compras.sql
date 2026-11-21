-- Dados de teste do Compras (16/11/2026, pedido do usuário: "coloque dados em necessidades operacionais e em créditos
-- pra eu ver como funciona"). Tudo marcado com TESTE-COMPRAS-20261116. Apagar: Scripts/remover-teste-compras.sql
do $$
declare
  e uuid := 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b';
  marca text := 'TESTE-COMPRAS-20261116';
  m1 uuid; m2 uuid; m3 uuid; prox bigint; pc uuid; pcn bigint; tit uuid;
  tintas uuid := 'e2e7c916-12c6-4f6d-afab-0d5318c160ab';
  ferragens uuid := 'e3489de2-1ec7-4493-acf2-21804c94e745';
  joao uuid := '5827123e-ffef-4083-85a9-4cce6fe68285';
  larissa uuid := 'fc0ca782-a43f-4691-85ce-ea28d863a7c7';
begin
  if exists (select 1 from compras_registros where empresa_id = e and dados->>'teste' = marca) then
    raise notice 'Já existe: rode o script de remoção antes.'; return; end if;

  -- materiais (o Almoxarifado novo começou vazio)
  insert into warehouse_materials(empresa_id, codigo, nome, unidade, categoria, observacoes)
  values (e, '', 'Tecido linho off white', 'M', 'Matéria-prima', marca) returning id into m1;
  insert into warehouse_materials(empresa_id, codigo, nome, unidade, categoria, observacoes)
  values (e, '', 'Espuma D33 5cm', 'UN', 'Matéria-prima', marca) returning id into m2;
  insert into warehouse_materials(empresa_id, codigo, nome, unidade, categoria, observacoes)
  values (e, '', 'Verniz marítimo 3,6L', 'UN', 'Pintura', marca) returning id into m3;

  -- necessidades operacionais (faltando material para pedidos reservados)
  select coalesce(max(numero), 0) into prox from compras_registros where empresa_id = e and tipo = 'necessidade';
  insert into compras_registros(empresa_id, tipo, numero, status, dados, criado_por) values
  (e, 'necessidade', prox + 1, 'pendente', jsonb_build_object('teste', marca, 'origem', 'op_faltando', 'material_id', m1,
     'material_nome', 'Tecido linho off white', 'unidade', 'M', 'quantidade', 42, 'quantidade_faltante', 42, 'quantidade_comprada', 0,
     'order_number', '3021', 'etapa_nome', 'Forração', 'data_necessidade', current_date + 1, 'pcp_status', 'published',
     'solicitante_nome', 'João Pedro'), joao),
  (e, 'necessidade', prox + 2, 'pendente', jsonb_build_object('teste', marca, 'origem', 'op_faltando', 'material_id', m2,
     'material_nome', 'Espuma D33 5cm', 'unidade', 'UN', 'quantidade', 16, 'quantidade_faltante', 16, 'quantidade_comprada', 0,
     'order_number', '3022', 'etapa_nome', 'Forração', 'data_necessidade', current_date + 2, 'pcp_status', 'published',
     'solicitante_nome', 'João Pedro'), joao),
  (e, 'necessidade', prox + 3, 'pendente', jsonb_build_object('teste', marca, 'origem', 'op_faltando', 'material_id', m3,
     'material_nome', 'Verniz marítimo 3,6L', 'unidade', 'UN', 'quantidade', 3, 'quantidade_faltante', 3, 'quantidade_comprada', 0,
     'order_number', '3023', 'etapa_nome', 'Pintura', 'data_necessidade', current_date + 3, 'pcp_status', 'published',
     'solicitante_nome', 'Larissa Marques'), larissa),
  (e, 'necessidade', prox + 4, 'pendente', jsonb_build_object('teste', marca, 'origem', 'op_faltando', 'material_id', m1,
     'material_nome', 'Tecido linho off white', 'unidade', 'M', 'quantidade', 18, 'quantidade_faltante', 18, 'quantidade_comprada', 0,
     'order_number', '3024', 'etapa_nome', 'Forração', 'data_necessidade', current_date + 4, 'pcp_status', 'suggested',
     'solicitante_nome', 'Larissa Marques'), larissa);

  -- um pedido de compra já recebido, com conta a pagar em aberto (para abater o crédito)
  select coalesce(max(numero), 0) + 1 into pcn from compras_registros where empresa_id = e and tipo = 'pedido';
  insert into compras_registros(empresa_id, tipo, numero, status, dados) values (e, 'pedido', pcn, 'recebido', jsonb_build_object(
    'teste', marca, 'fornecedor_id', tintas, 'fornecedor_nome', 'Tintas Horizonte', 'fornecedor', jsonb_build_object('id', tintas, 'nome', 'Tintas Horizonte'),
    'valor_total', 1260, 'items', jsonb_build_array(jsonb_build_object('id', 'i1', 'material_id', m3, 'nome', 'Verniz marítimo 3,6L',
      'unidade', 'UN', 'quantidade', 6, 'quantidade_recebida', 6, 'valor_unitario', 210, 'valor_total', 1260)))) returning id into pc;
  insert into fin_pagar(empresa_id, origem, origem_id, fornecedor_id, fornecedor_nome, descricao, documento, vencimento, valor, status, observacoes)
  values (e, 'compra', pc, tintas, 'Tintas Horizonte', 'PC-' || lpad(pcn::text, 6, '0') || ' · Verniz marítimo (TESTE)', 'PC-' || lpad(pcn::text, 6, '0'),
    current_date + 20, 1260, 'pendente', marca) returning id into tit;

  -- créditos com fornecedores (como se viessem de divergências no recebimento)
  insert into compras_creditos(empresa_id, fornecedor_id, fornecedor_nome, descricao, numero_nfe, pedido_id, pedido_numero, valor, saldo, criado_por_nome)
  values
  (e, tintas, 'Tintas Horizonte', 'Abatimento combinado na divergência DR-0001 · Verniz marítimo 3,6L (2 latas amassadas) · ' || marca,
   '48211', pc, pcn, 140, 140, 'Compras'),
  (e, ferragens, 'Ferragens Base Sul', 'Material devolvido (divergência DR-0002) · Dobradiça 35mm · ' || marca,
   '9932', null, null, 86.40, 86.40, 'Compras');
end $$;

-- item a personalizar (item real do próprio pedido, com foto) e o pedido de cada necessidade
update compras_registros n set dados = n.dados || jsonb_build_object('item_id', x.item_id, 'pedido_id', x.pedido_id,
    'personalizacao_nome', case when n.dados->>'etapa_nome' = 'Pintura' then 'Pintura laca fosca' else 'Forração em linho' end)
from (
  select p.numero_pedido, p.id pedido_id,
    (select si.item_id from separacoes_itens si join itens i on i.id = si.item_id
      where si.separacao_pedido_id = p.id and i.foto_url is not null order by si.quantidade_solicitada desc limit 1) item_id
  from separacoes_pedidos p where p.empresa_id = 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b' and p.numero_pedido in ('3021','3022','3023','3024')
) x
where n.empresa_id = 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b' and n.tipo = 'necessidade' and n.dados->>'teste' = 'TESTE-COMPRAS-20261116'
  and n.dados->>'order_number' = x.numero_pedido;
