-- Apaga os dados de teste do Compras criados por Scripts/teste-compras.sql (marca TESTE-COMPRAS-20261116),
-- inclusive cotações, pedidos e contas a pagar que tenham nascido deles durante os testes.
do $$
declare e uuid := 'bb1260f0-99cd-4d17-ab9b-23c299b4c50b'; marca text := 'TESTE-COMPRAS-20261116';
  necs uuid[]; mats text[]; peds uuid[];
begin
  select array_agg(id) into necs from compras_registros where empresa_id = e and tipo = 'necessidade' and dados->>'teste' = marca;
  select array_agg(id::text) into mats from warehouse_materials where empresa_id = e and observacoes = marca;
  -- pedidos de teste + pedidos gerados a partir das necessidades de teste
  select array_agg(id) into peds from compras_registros where empresa_id = e and tipo = 'pedido'
    and (dados->>'teste' = marca or exists (select 1 from jsonb_array_elements(coalesce(dados->'items','[]')) it where it->>'material_id' = any(coalesce(mats,'{}'))));
  delete from compras_creditos where empresa_id = e and (descricao like '%' || marca || '%' or pedido_id = any(coalesce(peds,'{}')));
  delete from fin_baixas where pagar_id in (select id from fin_pagar where empresa_id = e and (observacoes like '%' || marca || '%' or origem_id = any(coalesce(peds,'{}'))));
  delete from fin_pagar where empresa_id = e and (observacoes like '%' || marca || '%' or origem_id = any(coalesce(peds,'{}')));
  -- cotações que usaram as necessidades de teste
  delete from compras_registros where empresa_id = e and tipo in ('cotacao','resposta','proposta')
    and dados::text ~ any(select id::text from unnest(coalesce(necs,'{}')) id);
  delete from compras_registros where empresa_id = e and tipo = 'rnc' and (dados->>'order_id')::uuid = any(coalesce(peds,'{}'));
  delete from compras_registros where id = any(coalesce(peds,'{}'));
  delete from compras_registros where id = any(coalesce(necs,'{}'));
  delete from warehouse_movements where empresa_id = e and material_id::text = any(coalesce(mats,'{}'));
  delete from almox_solicitacoes_compra where empresa_id = e and produto_id = any(coalesce(mats,'{}'));
  delete from warehouse_materials where empresa_id = e and observacoes = marca;
end $$;
