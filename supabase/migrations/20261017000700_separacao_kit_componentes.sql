-- Kit nunca é separado como uma peça (out/2026): na separação, cada linha de Kit do pedido aparece aberta nos
-- seus componentes (kit_itens × quantidade). O progresso de cada componente fica na própria linha do Kit:
-- componentes = { "<item_id do componente>": { "separado": n, "patrimonios": [...] } }.
alter table public.separacoes_itens
  add column if not exists componentes jsonb not null default '{}'::jsonb;

-- Etiquetas de envio: um Kit gera etiquetas de vários componentes na mesma linha do pedido,
-- então a numeração passa a ser por linha + componente.
alter table public.separacoes_etiquetas drop constraint if exists separacoes_etiquetas_separacao_item_id_sequencia_key;
alter table public.separacoes_etiquetas
  add constraint separacoes_etiquetas_linha_item_sequencia_key unique (separacao_item_id, item_id, sequencia);
