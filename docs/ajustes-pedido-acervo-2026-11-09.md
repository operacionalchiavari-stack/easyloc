# Ajustes solicitados — 09/11/2026

Também foi concluído o fluxo anterior: novos clientes e locais abrem as telas completas de cadastro, sem desmontar o pedido. Salvar retorna ao pedido com o cadastro selecionado; Voltar sem salvar preserva o preenchimento anterior.

| Pedido | Implementação |
| --- | --- |
| 1. Etiquetas do cliente | Removidos os marcadores coloridos dos dados do cliente no pedido; tratamento uniforme como nas condições do local. Grupos no cadastro mantêm a paleta correspondente do cadastro de locais. |
| 2. Observações | Separação já exibia a observação correta. Entrega e Coleta passaram a mostrar suas respectivas observações, identificando o pedido quando há extras. |
| 3. Ambiente Evento | Pedido novo sem itens inicia sem ambiente automático vazio. Ambientes e itens já existentes são preservados. |
| 4. Sublocados | O campo de reposição já existia no cadastro. Seu valor agora acompanha o item e aparece na coluna comercial; linhas antigas sem esse valor o consultam no cadastro. |
| 5. Plantas | Padrão novo em A4 paisagem, zoom de imagem 100%, enquadramento sem corte e área inicial próxima da largura da folha. Fotos têm ajustes individuais e mantêm o ajuste conjunto. Os controles não entram na impressão. Ajustes já salvos continuam preservados. |
| 6. Ações do pedido | Seleção visual de layout com miniaturas; ações separadas abaixo. Link, Imprimir, Gerar PDF e Renderizar com IA mantêm suas condições de disponibilidade. Link usa a cor global de destaque. |
| 7. Serviços | Data e horário do serviço operacional ficam juntos na mesma linha. |
| 8. Triagem → Comercial | Liberação permanece em Aguardando até abrir o pedido para edição no Comercial. A Triagem pode cancelar antes disso; o banco impede cancelamento por uma tela desatualizada após o Comercial assumir. |
| 9. Parcelas | Mudanças no total redistribuem o saldo das parcelas programadas, preservando entrada e recebimentos registrados. Uma redução abaixo dos valores já vinculados a recebimentos mantém a proteção financeira existente. |
| 10. Card de Triagem | Indicador de problema ao lado do número do pedido. |
| 11. Montagem de equipe | Cards identificam Com montagem extra ou Sem montagem extra, lendo os serviços do pedido. |
| 12. Entrega/Coleta | Faixa de dias oculta nessas duas áreas, preservada em Montagem de equipe. |

## Verificação

Passaram os testes direcionados dos cadastros e retorno ao pedido, pedido novo sem ambiente vazio, sublocados e serviços, plantas e impressão, lista de conferência e observações, painel logístico, parcelas e preservação de recebimentos. Também passaram os testes numéricos de redistribuição e os testes de banco da transição, permissões e chamadas concorrentes.

A suíte antiga `painel-logistico-browser.cjs` contém expectativas anteriores ao painel atual (posição do indicador e intervalo inicial de datas). Ela não foi tratada como validação aprovada; a verificação desta alteração usa `painel-logistico-ajustes-browser.cjs`.

A migração `20261109000100_comercial_transicao_triagem.sql` foi aplicada ao banco. O frontend não foi publicado.
