-- Apaga os dados de teste de Comercial > Terceirizações (criados por Scripts/teste-terceirizacoes.sql).
-- As fotos fictícias ficam no bucket itens em <empresa>/fornecedores/<id>-ficticio.png; apagar também com:
--   npx supabase storage rm ss:///itens/<empresa>/fornecedores/<id>-ficticio.png --linked --experimental
-- Itens terceirizados que já foram postos num pedido continuam no pedido (o pedido guarda nome e valor).
delete from terceirizacao_itens where observacoes = 'TESTE-TERCEIRIZACOES';
delete from terceirizacao_itens t using fornecedores f where t.fornecedor_id = f.id and f.observacoes = 'TESTE-TERCEIRIZACOES';
delete from fornecedores where observacoes = 'TESTE-TERCEIRIZACOES';
select 'removido' as resultado;
