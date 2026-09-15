-- Campo "Produto" pedido pelo usuário depois de revisar a importação real:
-- é um conceito distinto de "Especificação" (que já ocupa a coluna
-- `produto`, existente desde antes desta funcionalidade — nome específico
-- do item, ex. "Bistrol"). "Produto" é a linha/tipo genérico (ex. "Bar"),
-- que passa a prefixar o nome gerado automaticamente (descricao_total):
-- "<produto_base> <produto> <material> <cor> ...".
--
-- Nome da coluna não pode ser `produto` (já ocupada) nem confundir com
-- ela — `produto_base` deixa explícito que é o nível "mais genérico" da
-- dupla Produto/Especificação.

alter table public.itens add column if not exists produto_base text;

comment on column public.itens.produto_base is
  'Produto (linha/tipo genérico, ex.: "Bar") — distinto de `produto` (nome específico do item/Especificação, ex.: "Bistrol"). Prefixa o nome gerado automaticamente (descricao_total).';
