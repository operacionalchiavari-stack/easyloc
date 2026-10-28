# Teste completo do pedido — 24/10/2026

Execução em banco PostgreSQL isolado, com as migrações operacionais até `20261024002300`. Nenhuma confirmação foi criada em pedido real.

**Resultado:** `npm test` aprovado com **27 testes, nenhuma falha**, em aproximadamente 4 minutos. Os 3 cenários integrados do pedido também passaram em execução separada.

## Ciclos completos

O teste `tests/pedido-ciclo-excecoes.test.cjs` executa o mesmo pedido por todas as etapas, verificando as filas a cada mudança:

1. Criação da reserva no Comercial, com 10 peças e locação de R$ 1.000.
2. Separação e saída da fila de Triagem.
3. Conferência do carregamento e entrada em Entrega.
4. Confirmação da entrega e entrada em Coleta.
5. Confirmação da coleta e retorno ao depósito.
6. Descarregamento e Triagem de retorno, nos modos simultâneo e sequencial.
7. Registro de pagamento de R$ 1.000, com saldo do título zerado.
8. Confirmação da Posição final e identificação como finalizado no Comercial.
9. Verificação de ausência nas filas operacionais e recusa de uma segunda confirmação financeira.

A posição confirmada permanece disponível no Financeiro para consulta. No modo sequencial, tentar fazer a Triagem de retorno antes do descarregamento é recusado. Confirmar entrega antes da separação também é recusado.

## Ciclo com diferenças

No cenário de 10 peças previstas, 8 entregues e 2 dessas retornando antecipadamente:

- Coleta espera 6 peças e informa 4 já no depósito.
- Equipe encontra 5 peças, das quais 2 avariadas; 1 permanece desaparecida.
- Crédito por não entrega: R$ 200, usando a locação de R$ 100 por peça.
- Cobrança de reposição: R$ 1.500, sendo R$ 1.000 de avarias e R$ 500 de desaparecimento.
- Reenviar a confirmação não duplica crédito, cobrança ou ocorrência.

## Abrangência e limite

O comando `npm test` reúne também orçamento oculto, pré-reserva somente para consulta, permissões, isolamento entre empresas, concorrência, controle de qualidade, manutenção, sincronização offline e restauração de backup. Há testes de interface para partes do sistema, além dos testes integrados das funções do banco.

Este resultado comprova os cenários automatizados; não equivale a uma pessoa operar todas as telas de produção nem à movimentação física de peças. O acompanhamento real está preparado no [pedido piloto 2240](piloto-pedido-2240.md).
