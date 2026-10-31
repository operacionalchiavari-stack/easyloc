# Produtividade comercial e acompanhamento de orçamentos

Data: 31/10/2026. Status: primeira versão implementada; migração aplicada no banco conectado.

## Uso da primeira versão

1. Em Parâmetros > Comercial > Produtividade e acompanhamentos do Comercial, selecionar os participantes. A coleta das operações depende dessa seleção; não há reconstrução retroativa.
2. Cadastrar situações e motivos, uma opção por linha, e marcar na matriz quem consulta cada pessoa e quem pode consultar apenas o total da equipe. Salvar a configuração.
3. Na Central de Pedidos, usar Orçamentos ou Pré-reserva. A tabela apresenta contatos, responsáveis, prazos e filtros; o botão Acompanhar registra contatos ou permite reagendar sem contabilizar um novo contato. O mesmo acesso está disponível dentro do pedido salvo.
4. Em Comercial > Produtividade, consultar período, pessoas autorizadas ou total da equipe, atividade diária e detalhes. Os totais abrangem todos os registros; a lista detalha as últimas 500 ações. Um período pode ter no máximo 366 dias.

A entrada foi definida nesta implementação como a primeira parcela da locação integralmente recebida (`origem=pedido`, `componente=locacao`, `parcela=1`). Pagamento parcial não encerra a negociação. Estorno ou alteração posterior sinaliza necessidade de revisão sem recriar automaticamente uma agenda.

Reagendamentos preservam o prazo original e o histórico. A pontualidade considera o prazo original; atrasados atuais consideram a agenda atual. Os registros de contato usam a data/hora do servidor, sem lançamento retroativo ou edição de contatos nesta versão. Projetos independentes do catálogo ainda sem pedido vinculado não entram nos indicadores de pedidos; alterações do projeto armazenado no pedido entram como detalhes desse pedido.

As operações gravadas em transações de banco são agrupadas por pedido e autor. O salvamento principal da tela também transmite um identificador para reunir dados, itens e contrato gravados em requisições relacionadas. Criações, alterações de pedido/itens/contrato/recebíveis e contatos têm autoria; ações automáticas sem usuário não recebem crédito humano.

Validação: `npm run test:produtividade`, testes existentes de situações da Central e cancelamento, auditoria de sintaxe/referências e compilação da migração no banco conectado antes da aplicação. As verificações de navegador usam dados simulados; não foram criados pedidos de teste no banco conectado.

O restante deste documento preserva a proposta funcional original; diferenças e limites da primeira versão estão descritos acima.

## Objetivo e decisões confirmadas

Medir a contribuição individual na operação compartilhada dos pedidos. Todas as pessoas fazem as mesmas funções e atendem o que aparece. Não existe carteira individual, nem atribuição exclusiva de venda. O foco é volume de trabalho, participação, acompanhamento e agilidade observável no sistema.

- Área: Comercial. Sem novas abas para separar retornos de hoje, atrasados e futuros.
- Orçamentos e Pré-reserva mantêm seus acessos existentes, com tabelas adaptadas ao acompanhamento.
- Pré-reserva pode ocorrer sem pagamento, por confiança no cliente; mudança manual entre as situações.
- Entrada paga representa fechamento e encerra acompanhamentos de negociação pendentes.
- Cliente que não vai fechar: cancelar pelo fluxo existente e apresentar no relatório de cancelados, preservando histórico.
- Próxima data obrigatória em acompanhamentos que exigem retorno.
- Responsável previsto e pessoa que efetivamente realizou o contato são registros diferentes.
- Situações, motivos e quem pode ver o desempenho de quem são configurados em Parâmetros.
- Medição completa a partir da implantação, sem reconstrução obrigatória do passado.
- Mostrar operações e seus detalhes. Sem nota única, cálculo de bônus ou avaliação de erros nesta versão.

## O que existe no repositório

Inspeção de arquivos locais; não comprova quais migrações estão aplicadas ou a qualidade dos dados no banco em produção.

| Base | Evidência | Aproveitamento e limite |
|---|---|---|
| Central de Pedidos | `Modulos/Comercial/Pedidos/CentralPedidos.html` e `CentralPedidos.js` | Situações existentes filtram a tabela. Adaptar apresentação conforme Orçamento/Pré-reserva, mantendo pedidos únicos no banco. |
| Histórico Comercial | `Modulos/Comercial/Historico/historico.js` e migrações `20261021001100`, `20261021001200`, `20261021001300` | Há autoria, datas, pedido, categorias e detalhes de mudanças. Mudanças semelhantes são agrupadas em até dez minutos e podem desaparecer ao voltar ao valor inicial. Não equivale a contagem de operações. |
| Histórico do catálogo | `supabase/migrations/20261021001000_projetos_historico.sql` | Há histórico de projetos; validar vínculo e cobertura antes de incluir atividades do catálogo nos indicadores. |
| Cancelamentos | `Modulos/Comercial/Cancelamentos/cancelamentos.js` | Relatório usa situação cancelada e dados de cancelamento do pedido. Reutilizar fluxo, sem exclusão do orçamento. |
| Motivos em Parâmetros | `Modulos/Configuracoes/Parametros/parametros-motivos-cancelamento.js` | Já existe padrão de listas ordenadas e desativação de opções usadas. Reaproveitar abordagem para novos cadastros. |
| Financeiro | `fin_receber`, `fin_baixas` e migrações de pagamento | Há recebimentos, valores parciais e estornos. Identificação exata da entrada deve ser validada; não assumir que qualquer recebimento é a entrada. |
| Permissões | `js/core/permissions.js` e RPC `comercial_historico` | Há permissões por módulo. A consulta atual do histórico exige visualização de pedidos; ainda é necessário implementar autorização específica por pessoa para o novo painel. |

## Telas propostas

### Orçamentos e Pré-reserva

Manter os seletores atuais. Ao selecionar essas situações, apresentar uma tabela voltada ao acompanhamento, com pedido, cliente, evento, valor, situação do acompanhamento, motivo, último contato, autor do último contato, próximo contato e responsável previsto. Pré-reserva mantém também sua validade existente, separada da data do próximo contato.

Filtros na própria tabela: responsável, situação, motivo e prazo (atrasados, hoje, próximos, sem agendamento). Ordenação inicial proposta: atrasados primeiro, depois próximos vencimentos. Pedido antigo sem agendamento aparece como tal; não inventar contato ou atribuir atraso retroativo.

Ações: abrir pedido, registrar acompanhamento e consultar histórico. Registro por janela ou painel lateral, sem nova aba. Exibir somente as colunas necessárias de forma inicial e permitir consultar observação e detalhes sem tornar a tabela excessivamente larga.

### Registrar acompanhamento

Campos propostos: tipo de ação, situação, motivo quando aplicável, observação, canal (WhatsApp, e-mail, telefone ou outro), próxima data e responsável previsto. Autor e horário do registro são automáticos. Data/hora efetiva do contato pode ser informada para contatos registrados depois, mantendo também o horário original do registro.

Exemplo: Ana registra orçamento enviado; cliente fará reunião para decidir; próximo contato em 04/11; responsável prevista Ana. Beatriz realiza o contato: o acompanhamento é creditado a Beatriz, e a agenda mantém que Ana era a responsável prevista.

Tipos iniciais propostos: orçamento enviado, tentativa de contato sem resposta, resposta do cliente, negociação e retorno realizado. A ação deve ser distinguida da situação: uma resposta pode manter o cliente em “aguardando decisão”.

Situações iniciais sugeridas para cadastro: aguardando resposta, aguardando decisão, reunião agendada e em negociação. Motivos podem incluir reunião para decidir, aguardando aprovação e solicitação de ajustes. São sugestões editáveis, não opções já aprovadas individualmente.

“Não vai fechar” encaminha ao cancelamento existente, exigindo as informações desse fluxo. Só encerrar o acompanhamento como cancelado quando o cancelamento for concluído. Entrada efetivamente confirmada encerra automaticamente a agenda de fechamento, com autoria de sistema.

### Produtividade dentro de Comercial

Página com período, pessoa (conforme acesso) e tipo de atividade. Visão geral da equipe, tabela comparativa das pessoas autorizadas, evolução por dia e lista de ações que explica cada número. Ao selecionar um indicador, mostrar os registros e pedidos correspondentes.

## Definição dos indicadores

| Indicador | Regra proposta |
|---|---|
| Pedidos criados | Pedidos efetivamente persistidos cuja criação tem autoria humana identificada no período. Separar origem automática ou cliente. |
| Pedidos trabalhados | Pedidos distintos com ao menos uma ação válida da pessoa no período, incluindo criação, alteração ou acompanhamento. Consultar ou abrir sem atuar não conta. |
| Operações de alteração | Uma operação de negócio concluída com mudança real, independentemente do número de campos ou gravações internas. |
| Detalhes alterados | Campos e itens com mudanças efetivas, agrupados sob a operação. Efeitos derivados, como recálculo automático do total, não são outra operação humana. |
| Acompanhamentos | Contatos ou tentativas registrados, separados por tipo e creditados ao executor real. Corrigir o mesmo registro não gera novo contato. |
| Retornos no prazo | Compromissos concluídos até a data prevista. Mostrar quantidade concluída e quantos foram no prazo. Proposta de percentual: no prazo / compromissos concluídos no período, excluindo encerramentos automáticos. |
| Retornos atrasados | Pendências abertas cujo prazo já passou, por responsável previsto. Mostrar separadamente retornos concluídos com atraso. |
| Atividade diária | Operações válidas por dia e dias com atividade. Não representa tempo online ou horas trabalhadas. |
| Evolução | Comparação com período anterior de mesma duração, com totais e média por dia com atividade claramente identificada. |

Um pedido trabalhado por três pessoas conta uma vez para cada uma e uma vez no total de pedidos distintos da equipe. Por isso o total da equipe não é a soma das participações individuais. Quantidades de operações e acompanhamentos, por outro lado, podem ser somadas quando cada evento tem um único executor.

Criação com dez itens é uma criação; não deve produzir dez operações de edição. Uma alteração de três campos é uma operação e três detalhes. Novo clique sem mudança, tentativa com erro, recarregamento, envio duplicado e atualização automática não contam como nova produtividade.

Não incluir inicialmente: tempo de montagem, velocidade calculada pelo intervalo entre salvamentos, classificação de erros, ranking geral, bonificação e identificação de presença pelo sistema aberto. Acompanhamentos externos são declarados pela equipe; seu registro não comprova automaticamente o envio no WhatsApp ou e-mail.

## Agenda e regras de conclusão

Proposta inicial: um próximo retorno aberto por pedido, mantendo vários contatos no histórico. Registrar novo contato conclui o retorno anterior quando ele foi efetivamente realizado e agenda o próximo, se ainda necessário. Um simples reagendamento não conta como contato realizado.

Guardar prazo original, reagendamentos, mudanças de responsável e executor. Reagendar não transforma retroativamente um retorno atrasado em pontual. Mudança de responsável não reatribui ações passadas. Indicadores de compromissos devem informar a responsabilidade prevista; indicadores de contatos usam autoria real.

Prazo por data, com vencimento ao fim do dia em America/Sao_Paulo. Horário agendado pode ser uma evolução posterior. Pagamento e cancelamento encerram pendências com motivo automático e não contam como retorno realizado por uma funcionária. Estorno não recria contatos já encerrados silenciosamente: sinalizar necessidade de revisar a negociação.

## Parâmetros e acesso

Cadastros: situações e motivos com nome, ordem, ativo e indicação de exigir retorno. Desativar opções utilizadas preserva seu significado no histórico. Separar motivos de acompanhamento dos motivos de cancelamento existentes.

Configuração de produtividade: participantes monitorados, marco inicial da medição e matriz de visualização (quem consulta x de quem pode consultar), além da permissão de visualizar o total da equipe. Proposta: sem regra concedida, não visualizar números individuais de outras pessoas.

Aplicar autorização no servidor, inclusive em agregações, detalhes e eventual exportação. A matriz limita os indicadores de produtividade; acesso operacional aos pedidos continua seguindo permissões próprias. Não apresentar totais de um grupo parcialmente autorizado como se fossem o total completo da equipe.

## Dados novos e integração proposta

- Operações de produtividade: identificador único da operação, empresa, pedido, executor por ID estável, origem, ação, horário e detalhes. Eventos preservados individualmente, sem agrupamento destrutivo de dez minutos.
- Acompanhamentos: pedido, executor, contato efetivo, registro, canal, tipo, situação, motivo e observação; correções preservam autoria e revisão.
- Compromissos de retorno: prazo, responsável previsto, vínculo ao contato de origem, conclusão, executor e motivo de encerramento; histórico de reagendamento e atribuição.
- Cadastros de situações/motivos, participantes e concessões de visualização.

Vincular os eventos às operações reais de salvar, alterar itens, contratos e demais caminhos relevantes, incluindo catálogo. Identificar a operação no início e manter o mesmo identificador nas gravações relacionadas. Persistência e evento precisam ser consistentes; repetição da mesma requisição não deve duplicar crédito. O ID do executor vem da autenticação, não de um nome enviado pela tela.

Usar agregações no banco com autorização, sem calcular os totais a partir de uma lista truncada do histórico. A tela atual limita registros a 2.000/5.000, o que a torna inadequada como fonte direta de totais completos. Separar atividades automáticas e de outros setores das contribuições humanas do comercial.

## Sequência de implementação proposta

1. Validar no banco o estado das migrações, autoria, cobertura das mudanças e identificação da entrada; mapear caminhos de gravação e definir operações e detalhes sem duplicidade.
2. Implementar cadastros, matriz de acesso e registro confiável das operações com marco inicial explícito.
3. Implementar acompanhamentos e agenda dentro dos pedidos; adaptar as tabelas de Orçamento e Pré-reserva.
4. Integrar cancelamento e confirmação de entrada, incluindo pagamentos parciais, repetidos e estornados conforme regra financeira validada.
5. Implementar painel e detalhamento; conferir totais com os eventos de origem e acompanhar um período piloto antes de usar para reconhecimento ou bônus.

## Critérios de aceite

- Duas pessoas alteram o mesmo pedido: cada uma recebe suas operações; o pedido é contado uma vez no total distinto da equipe.
- Um salvamento altera três campos: uma operação, três detalhes; salvar novamente sem mudança não aumenta os números.
- Gravações derivadas e repetição de requisição não duplicam produtividade.
- Retorno pendente exige data e responsável; outra pessoa consegue realizar e recebe crédito pelo contato.
- Reagendamento conserva prazo anterior e não elimina evidência de atraso.
- Entrada confirmada e cancelamento encerram agenda sem criar contatos humanos fictícios.
- Cancelado permanece no relatório existente e preserva histórico.
- Configurações de visualização são respeitadas também por chamadas diretas ao servidor.
- Números completos não dependem dos limites de listagem e respeitam o marco inicial e o fuso de São Paulo.

## Pontos ainda sujeitos à validação

Identificação financeira exata da entrada, cobertura de tecidos/tintas/personalizações no histórico atual e fronteiras das operações de gravação dependem de inspeção adicional antes da implementação. A estrutura de um retorno aberto por pedido, as opções iniciais de cadastro e as fórmulas de pontualidade são propostas desta especificação, ainda não decisões explícitas do usuário.
