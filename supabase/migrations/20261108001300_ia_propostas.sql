begin;
insert into public.ia_agentes(chave,nome,descricao,comportamento,coletar,indispensavel) values
('compras_proposta','Leitura de propostas','Extrai dados das propostas dos fornecedores para Compras.','Leia o documento com precisão, indicando incertezas para revisão.','Preços dos itens cotados, frete, pagamento, validade e previsão de entrega.','Utilizar somente IDs fornecidos; não inventar valores ou datas. Correspondência incerta deve ficar marcada para revisão humana.');
notify pgrst,'reload schema';
commit;
