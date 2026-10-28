# Sequência do painel logístico

A pré-reserva entra em **Montagem de equipe**, somente para consulta, quando a empresa permite a visualização de pré-reservas. Não aparece nas abas Entrega ou Coleta.

| Situação do pedido | Aba do painel | Comportamento |
|---|---|---|
| Pré-reserva válida, parâmetro habilitado | Montagem de equipe | Consulta, sem alocação de pessoas ou caminhões |
| Reservado, em Triagem ou Expedição | Montagem de equipe | Planejamento editável conforme permissões e data |
| Carregamento concluído | Entrega | Sai do planejamento e aguarda confirmação da entrega |
| Entrega confirmada | Coleta | Sai de Entrega e aguarda confirmação da coleta |
| Coleta confirmada | Retorno ao depósito | Segue as filas de Expedição/Triagem do modo configurado |

Orçamentos, pré-reservas vencidas, cancelados e pré-reservas com o parâmetro desligado ficam fora do planejamento operacional. A consulta de pré-reserva na Expedição foi preservada.

A consulta do planejamento usa `pedido_fluxo_fila(...,'montagem_equipe')`. A tela nativa não exclui mais todas as pré-reservas indiscriminadamente; consulta a fila autorizada e marca as etapas como `somente_consulta`. Quando necessário, a prévia de montagem/desmontagem é gerada em memória, sem criar etapas ou alocar recursos. Pessoas e caminhões que já estão em operações de entrega continuam considerados ocupados.

Atribuição manual e preenchimento automático são bloqueados no banco para pré-reservas e pedidos que saíram do planejamento. As funções internas também recebem a guarda, incluindo chamadas preparadas anteriormente. As abas Entrega/Coleta filtram somente sua etapa efetiva e não tratam consulta como entrega.

Migrações aplicadas no Supabase: `20261027000100`, `20261027000200` e `20261027000300`. A consulta após a aplicação encontrou uma pré-reserva em Montagem de equipe, nenhuma em Entrega/Coleta e a mesma pré-reserva disponível para consulta na Expedição. Não foram criados pedidos de teste nem alterados os dados desse pedido.

Validações: testes isolados de fila e sequência completa nos dois modos de retorno; bloqueio de atribuição e preenchimento automático; proteção das funções internas; geração da prévia sem gravação; interface sem controles editáveis para consulta; disponibilidade de recursos e visualização no celular. Evidências locais em `.tmp/auditoria-painel-sequencia*` e `.tmp/resultado-painel-sequencia.json`.
