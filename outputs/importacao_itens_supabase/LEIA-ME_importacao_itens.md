# Importação de itens no Supabase

O arquivo `modelo_importacao_itens_supabase.csv` contém os cabeçalhos compatíveis com a tabela `public.itens` usada pelo sistema.

## Antes de preencher

- Não altere os nomes dos cabeçalhos.
- Insira um item por linha.
- Repita o mesmo `empresa_id` em todos os itens da empresa.
- Use ponto como separador decimal: `1.50`, e não `1,50`.
- Salve o arquivo como CSV UTF-8.
- Não crie linhas totalmente vazias no meio dos dados.

## Campos obrigatórios no cadastro atual

- `empresa_id`: UUID da empresa no Supabase.
- `produto`: nome principal do item.
- `material`: material do item.
- `cor`: cor do item.
- `largura`, `altura` e `profundidade`: medidas em metros.
- `categoria`: classificação do item.
- `setor_estoque`: setor onde o item fica armazenado.
- `valor_locacao`: preço de locação.
- `valor_reposicao`: preço de reposição.

## Valores aceitos e padrões recomendados

- `tipo`: use `Item` ou `Componente`.
- `ativo`: use `true` ou `false`.
- `exibir_no_site`: use `true` ou `false`.
- `setor_estoque`: opções existentes no sistema: `Almoxarifado`, `Estoque Geral`, `Decoração`, `Louças`, `Iluminação` ou `Móveis`.
- `estoque_total`, `estoque_manutencao` e `estoque_indisponivel`: use números; quando não houver quantidade, use `0`.
- `foto_url`: URL pública da foto; pode ficar vazia.
- `area_operacional_largura` e `area_operacional_profundidade`: medidas operacionais em metros; podem ficar vazias.

## Campos calculados

- `descricao_total`: monte no padrão usado pelo sistema: `Produto Material Cor Complemento (L) 1.00 m (A) 1.00 m (P) 1.00 m`.
- `volume_cubico`: calcule `largura × altura × profundidade`.

## Campos automáticos omitidos

O modelo não inclui `id` nem `qr_code`. Eles devem ser gerados pelo banco ou por uma rotina de importação. Antes da carga definitiva, teste com um único item. Se a tabela exigir explicitamente esses campos, gere UUIDs únicos para cada linha e acrescente as colunas ao CSV.

## Importação

No Supabase, abra o Table Editor, selecione a tabela `itens` e use a opção de importar dados por CSV. Faça primeiro uma importação de teste com apenas uma linha e confirme o resultado no sistema antes de enviar o arquivo completo.
