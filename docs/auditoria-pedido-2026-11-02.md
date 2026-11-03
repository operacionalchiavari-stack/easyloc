# Auditoria do fluxo de pedidos — 02/11/2026

O fluxo funcionou nos cenários executados após as correções abaixo. A auditoria utilizou navegadores reais com respostas de serviços simuladas, bancos PostgreSQL isolados (PGlite) e uma leitura da estrutura do banco remoto. Nenhum pedido de cliente foi criado, cancelado ou alterado no banco real nesta auditoria; nenhum pagamento real foi executado.

## Bugs corrigidos

1. **Cliente anterior permanecia vinculado após editar o nome.** O campo oculto `cliente_id` e o telefone anterior eram mantidos. Agora a edição invalida o vínculo, telefone e responsável; uma nova seleção preenche os dados corretos. Respostas atrasadas da busca são descartadas.
2. **Contrato podia usar documento/endereço antigos.** O cache de cliente/local era reutilizado mesmo depois de remover o cadastro selecionado. Agora o cache é invalidado e consultas antigas não substituem os dados da seleção atual.
3. **Troca do local mantinha endereço/distância anteriores.** Agora a edição limpa o vínculo, a referência visual e a distância manual; o frete é recalculado. Uma resposta de cálculo do local anterior não altera a distância do local atual.
4. **Coordenadas vazias eram interpretadas como `0,0`.** Coordenadas nulas, vazias, incompletas ou fora dos limites geográficos são descartadas; o cálculo utiliza o endereço. Coordenadas numéricas realmente informadas continuam aceitas.
5. **Recálculo atrasado podia sobrescrever edição manual do contrato.** A abertura/salvamento do editor invalida os recálculos anteriores.

Regressões cobertas em `tests/pedido-identidade-troca-browser.cjs`: troca de cliente, telefone, documento, local, endereço, distância, coordenadas nulas, respostas fora de ordem e preservação do texto editado manualmente.

## Cenários exercitados

| Etapa | Variações verificadas |
| --- | --- |
| Cadastro e evento | Troca de cliente/local, dados obrigatórios, datas e horários inválidos, evento em vários dias |
| Itens e estoque | Itens e kits, componentes insuficientes, quantidades por ambiente, próprio pedido fora da concorrência, margens de reserva |
| Frete e montagem | Cubagem, combinação de caminhões, absorção, distância pendente, zero itens e limpeza dos totais |
| Comercial | Orçamento, pré-reserva, aprovação, cancelamento com motivo, bloqueios por setor e pedido extra |
| Financeiro | Parcelamento, parcelas já pagas, entrada parcial, saldo, recebimento, crédito, compensação e estorno |
| Contrato | Modelo, edição manual, assinatura da empresa, anexação, fotos dos itens, visualização e geração do documento de impressão |
| Projeto/3D | Edição da cena, troca de móveis, recuperação da imagem e persistência após falha de gravação |
| Triagem | Quantidades, etiquetas, kits, bloqueio financeiro e restrições após início da Expedição |
| Carregamento | Conferência, leitura, ausência de caminhão programado, seleção do caminhão e saldo financeiro pendente |
| Entrega | Entrega completa, parcial e retorno antecipado; tentativa de executar fora da etapa |
| Coleta e retorno | Coleta completa, falta, avaria, retorno simultâneo e sequencial |
| Acervo | Peças bloqueadas, reparo, custo, inspeção, liberação, divergência de inventário e concorrência |
| Posição final | Crédito, cobrança, falta, avaria, fonte alterada e tentativa de confirmação duplicada |
| Pós-venda | Contato gerado após posição final, perguntas obrigatórias, conclusão e recusa de reenvio |
| Offline | Cache cifrado, recarga sem internet, perda da resposta após gravação e sincronização sem duplicidade |
| Isolamento | Permissões, empresa diferente, revisões concorrentes e reenvio idempotente |

## Verificação com as funções atuais do banco

Foi obtida, somente para leitura, a estrutura de **277 tabelas e 671 funções**, com a migração mais recente `20261102000300`. Não foram copiadas linhas de clientes ou pedidos. Foram instaladas **647 funções públicas atuais** em uma fixture isolada, complementada com as tabelas, colunas e chaves necessárias.

Nesse ambiente foi executada a sequência:

1. Criar orçamento e verificar que não entra na Triagem.
2. Converter em pré-reserva e depois reserva.
3. Configurar entrada mínima de 50% e verificar bloqueio sem pagamento.
4. Verificar que baixa direta é recusada; registrar recebimento pelo caixa financeiro.
5. Receber 50% e liberar Triagem.
6. Exigir 100% no carregamento e verificar bloqueio com saldo aberto.
7. Receber o saldo e verificar o bloqueio sem caminhão programado.
8. Programar/selecionar caminhão e concluir carregamento.
9. Confirmar entrega, coleta, retorno e descarregamento.
10. Confirmar posição final; verificar que o pedido ainda aguarda pós-venda.
11. Gerar contato, verificar respostas obrigatórias, concluir pós-venda e confirmar `finalizado=true` e `financeiro_pendente=false`.
12. Reenviar a conclusão do pós-venda e verificar recusa de duplicidade.

Esse teste usa funções atuais, mas não constitui uma réplica integral de todas as políticas, gatilhos e configurações do banco de produção. As fixtures independentes também exercitam permissões, gatilhos operacionais e isolamento.

## Resultados e limites

- **23 arquivos de testes de navegador aprovados**, considerando a execução inicial e os retestes após as correções.
- A bateria principal executou **55 casos**. Houve um timeout no cenário offline durante a execução inicial concorrente; ele passou isoladamente e em **três reexecuções consecutivas**, sem alterar sua regra de autorização.
- As falhas de expectativas antigas dos testes foram atualizadas: coluna de etapa operacional, organização atual do cabeçalho, pedido já salvo para renderizar, montagem por planta desativada e DOM/cache do teste de frete. Essas atualizações não foram contabilizadas como bugs do produto.
- Os resultados por arquivo e os retestes estão nos diretórios `.tmp/auditoria-pedido-completo`, `.tmp/auditoria-pedido-reteste` e `.tmp/auditoria-pedido-validacao-final`.
- O ciclo com as funções atuais está registrado em `.tmp/auditoria-ciclo-atual.log`; os testes offline repetidos, em `.tmp/auditoria-offline-repeticoes.log`.
- PIX/banco externo, Google Maps, resposta da IA e leitura por dispositivo físico não foram executados contra serviços reais. Os testes verificam a integração e os efeitos esperados com respostas controladas.
- A cobertura inclui as variações listadas, sem afirmar que todas as combinações possíveis de dados e infraestrutura estão esgotadas.
