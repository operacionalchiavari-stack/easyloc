> Atualização após a limpeza autorizada: os backups antigos de teste no GitHub foram apagados e as automações anteriores desativadas. As cópias locais continuam pendentes por bloqueio da revisão automática. Consulte [o relatório atual](limpeza-dados-supabase.md). As evidências históricas abaixo não significam que essas cópias continuam disponíveis.

# Preparação e piloto de operação

## Alterações de 24/10/2026

- O acervo e o cronograma não geram mais ocorrências ou eventos simulados automaticamente. O cronograma consulta O.S. nativas; o histórico anterior continua disponível para consulta.
- Problemas no inventário exigem quantidade afetada e destino. A conferência e o bloqueio são atômicos: uma falha não salva metade da operação.
- A Gestão do acervo abre, encaminha e conclui O.S. nativas com setor, prazo, responsável, versão e histórico. Concluir a O.S. não libera as peças; a inspeção do acervo faz essa liberação.
- `npm test` executa a verificação de produção e os testes essenciais. O workflow de publicação preparado no workspace depende dessa verificação. A publicação das telas é uma etapa distinta da aplicação das migrações do banco.
- Diagnósticos de erros inesperados são registrados por empresa, com deduplicação e limite de volume. A consulta fica em Parâmetros → Segurança, junto do estado dos backups. O diagnóstico não grava formulários, arquivos ou credenciais.
- Backup em repositório privado independente: https://github.com/operacionalchiavari-stack/easyloc-backups . Cópia diária às 03:17 de Brasília, monitoramento horário e retenção dos artefatos cifrados por 30 dias. A confirmação da primeira execução e recuperação fica registrada nas evidências de validação abaixo.

## Instalação e verificação

O lockfile atual contém dependências antigas de visualização 3D com requisitos de peer divergentes. Para reproduzir a instalação existente sem atualizar esses componentes, os workflows usam `npm ci --legacy-peer-deps`. Em seguida, executar `npm test`. A automação de backup usa seu próprio pacote mínimo, sem as dependências de 3D e sem esse ajuste.

Os testes de navegador usam Microsoft Edge. O workflow preparado usa o runner Windows com Edge instalado. Os testes e suas fixtures não devem ser executados contra o banco operacional.

## Pedido piloto acompanhado pela equipe

O pedido **2240**, reservado e sem confirmações operacionais na consulta, foi escolhido para o piloto. O [roteiro com a agenda cadastrada](piloto-pedido-2240.md) está preparado. Após publicar as telas e conferir o acesso de cada usuário, acompanhar a operação real com a equipe. Não criar vendas, recebimentos ou ocorrências fictícias no banco operacional para demonstrar o fluxo.

| Etapa | Quem confere | Resultado esperado |
|---|---|---|
| Orçamento e pré-reserva | Comercial | Orçamento só no Comercial; pré-reserva aparece somente para consulta quando o parâmetro permite. |
| Reserva e Triagem | Comercial / estoque | Pedido entra na fila correta; componentes dos kits e indisponibilidades são respeitados. |
| Carregamento | Expedição | Quantidades conferidas; pedido sai da fila e entra em Entrega. |
| Entrega | Equipe no evento | Entregues, não entregues e retornos antecipados correspondem às peças físicas. |
| Coleta | Equipe no evento | Itens já no depósito não viram falta; avarias e desaparecimentos ficam registrados. |
| Retorno ao depósito | Expedição / Triagem | Conferências seguem o modo simultâneo ou sequencial configurado. |
| Tratamento | Manutenção / estoque | Peças em tratamento não ficam disponíveis; O.S. concluída exige inspeção antes da liberação. |
| Posição final | Financeiro | Crédito usa locação; cobrança usa reposição; dispensas exigem motivo. |
| Finalização | Responsável da operação | Situação física e financeira correspondem aos registros reais. |

Repetir o acesso com um usuário de consulta, um operador e um administrador. Verificar também duas pessoas tentando salvar a mesma conferência: a segunda alteração desatualizada deve ser recusada.

## Recuperação e falhas

As cópias de dados, arquivos e relacionamentos são verificadas em ambiente isolado. O ensaio de reconstrução completa de um projeto Supabase, incluindo usuários, políticas, extensões e integrações externas, continua sendo uma atividade separada antes de uma troca de ambiente. Uma cópia verificada não deve ser apresentada como prova de uma troca completa de produção.

Falhas do backup e do monitor aparecem no GitHub Actions. O painel informa cópias antigas ou com pendências. Não foram configurados envios de mensagens a terceiros. A empresa deve definir quem acompanha os avisos da conta e conservar uma cópia externa da chave de recuperação.

## Evidências de validação

- Testes automatizados: `npm test` aprovado com 27 testes, incluindo os dois modos de retorno com pagamento e finalização. Ver [resultado do teste completo](resultado-teste-total-pedido.md). A otimização da restauração também passou nos 4 testes específicos de continuidade.
- Capturas das interfaces: `.tmp/acervo-qualidade-conferencia.png`, `.tmp/acervo-inventario-validado.png`, `.tmp/os-concluidas-tabela.png`.
- Execução de backup e monitor: [40150829787](https://github.com/operacionalchiavari-stack/easyloc-backups/actions/runs/40150829787) aprovada, com 228 tabelas, 33.450 registros e 337 arquivos, sem pendências.
- A [auditoria ampliada dos módulos](auditoria-final-modulos.md), atualizada em 25/10, terminou com 127 arquivos ativos aprovados após investigar as pendências anteriores. Os testes usam dados simulados e bancos isolados; integrações externas reais e o piloto com a equipe continuam sendo verificações distintas.
- O piloto com funcionários e um pedido verdadeiro não é substituído pelos testes automatizados.
