# Recuperação somente do cadastro de itens

Após a limpeza, o proprietário solicitou recuperar apenas o cadastro de itens, fotos e modelos 3D. A recuperação foi executada diretamente no Supabase a partir da cópia local disponível.

| Dados recuperados | Quantidade |
|---|---:|
| Itens da empresa preservada | 1.173 |
| Fotos complementares do cadastro | 24 |
| Modelos 3D vinculados aos itens | 24 |
| Relações de composição dos kits | 1.220 |
| Valores dos itens nas tabelas de preço | 4.507 |
| Tabelas de preço necessárias a esses valores | 5 |
| Arquivos únicos de fotos e 3D | 120 |

Os 120 arquivos incluem fotos principais, fotos complementares e modelos 3D. Cada arquivo foi recuperado no Storage do Supabase, baixado e comparado com a cópia por SHA-256. Depois da recuperação, os 120 endereços públicos também responderam com sucesso.

Foram preservadas medidas, descrições, códigos, valores, estoque total cadastrado e composição dos kits. Bloqueios antigos de manutenção e indisponibilidade não foram recuperados, pois suas ocorrências foram apagadas. Referências a fornecedores excluídos foram removidas sem recriar os fornecedores.

As 12 fotos exclusivas de clientes não foram recuperadas como fotos públicas: os clientes e seus controles de acesso continuam apagados. O item da outra empresa também não foi recuperado.

Clientes, fornecedores, projetos, pedidos em separação, contas a receber e pagar, manutenção, retornos, expedições, confirmações e funcionários foram conferidos e continuam vazios. As estruturas legadas continuam somente com cabeçalhos, sem linhas operacionais. Nenhuma restauração integral do banco foi realizada.

Evidências locais: `.tmp/resultado-recuperacao-itens.json` e `.tmp/recuperacao-itens-verificada.json`.
