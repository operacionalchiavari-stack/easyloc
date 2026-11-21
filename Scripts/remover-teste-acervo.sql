-- Apaga os dados de teste da Gestão do acervo criados por Scripts/teste-acervo.sql (lote TESTE-ACERVO-20261116):
-- os problemas da Separação e a 1ª contagem lançada no inventário geral (esses itens voltam a "não contados").
do $$
declare m jsonb;
begin
  select manifesto into m from sistema_demo_lotes where id = 'TESTE-ACERVO-20261116';
  if m is null then raise notice 'Nada a apagar.'; return; end if;
  delete from separacao_ocorrencias
   where id in (select (jsonb_array_elements_text(m->'separacao_ocorrencias'))::uuid);
  update acervo_inventario_itens set primeira_contagens = '{}'::jsonb, primeira_contado_por = null,
         primeira_contado_em = null, versao = coalesce(versao, 1) + 1
   where inventario_id = (m->>'inventario')::uuid
     and item_id in (select (jsonb_array_elements_text(m->'inventario_itens'))::uuid)
     and segunda_contagens = '{}'::jsonb;
  delete from sistema_demo_lotes where id = 'TESTE-ACERVO-20261116';
end $$;
