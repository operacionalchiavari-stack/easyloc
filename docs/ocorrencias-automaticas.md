# Ocorrências operacionais automáticas

O módulo de Registro de Ocorrências passou a ser um painel de consulta. O endereço antigo, o índice do módulo e o Painel de Qualidade apontam para a mesma visão. Não há inclusão, edição ou resolução manual no painel. O arquivo anterior continua consultável, separado dos indicadores automáticos. As funções de inclusão e alteração do antigo motor foram bloqueadas.

## Fontes

| Fonte | Casos |
|---|---|
| Material de proteção | Proteção insuficiente no carregamento, confirmação de proteção não aplicada, falta/sobra no retorno, avaria, contagens diferentes e saída sem registro |
| Movimentos de materiais | Perda confirmada; tratamentos por lote atualizam a avaria correspondente |
| Conferência de móveis | Divergências já criadas pelas rotinas oficiais |
| Acervo | Avarias, itens não recolhidos, encaminhamento, liberação e baixa |
| Qualidade | Reprovação e aprovação posterior; item efetivamente enviado sem aprovação registrada antes do carregamento |
| Cronograma | Montagem/desmontagem sem apontamento de início após o horário programado, ou início apontado com atraso, com tolerância inicial de 15 minutos |
| Entregas e coletas | Carregamento incompleto, quantidades não entregues/não recolhidas, confirmação ausente ou registrada após o horário programado, retorno pendente |
| Escala | Equipe sem escala registrada, vagas com inscrições confirmadas insuficientes e caminhão não programado próximo da execução |
| Presença | Check-in ausente, check-in fora do horário e check-out ausente após encerramento conhecido da etapa |
| Campo | Checklist incompleto ao encerrar, fotos/identificação obrigatórias ausentes, posicionamento incorreto explicitamente confirmado, avaliação de uniforme negativa e chegada registrada fora da área |
| Conferências de campo | Entrega visual incompleta, avaria na entrega, diferença entre entrega formal e visual, diferença entre desmontagem e retorno |
| Transporte e trocas | Alertas já enviados pelo motorista e solicitações de troca, com acompanhamento automático do estado na origem |
| Inventários | Diferença em inventário aprovado e em contagem geral concluída; não gera ocorrência durante rascunho |
| Proteção / qualidade | Saldo negativo de proteção, operação sem contagem inicial e envio de item cuja última inspeção anterior à saída foi reprovada |
| Pós-venda | Respostas operacionais explicitamente negativas sobre entrega, móveis ou coleta; exclui avaliação comercial e não interpreta texto livre |

Não se infere culpa, localização de peças, revisão física nem aplicação de proteção somente pela contagem. Sem contagem de saída, o retorno gera alerta de falta de informação, sem inventar falta ou sobra. Dados anteriores sem inspeção geram a categoria explícita de ausência de registro, não uma afirmação de falta de revisão física.

A confirmação de entrega/coleta possui horário de registro, não necessariamente o horário da execução física. O alerta usa essa distinção no nome e na descrição. Horários inválidos ou ausentes não são substituídos por horários inventados. Sem prazo explícito de conclusão, não se gera uma acusação de término atrasado.

A tabela `operacao_ocorrencias_regras` permite à administração definir tolerância (padrão 15 minutos), antecedência da escala (120 minutos) e janela de retorno após coleta (24 horas). As regras usam `America/Sao_Paulo`. A dispensa de programação de caminhão já existente na logística é respeitada. No posicionamento, somente o novo campo booleano explícito gera ocorrência; fotos antigas não são interpretadas como confirmação de erro.

A última versão da confirmação oficial prevalece. O vínculo por chave física evita somar a mesma diferença duas vezes em itens repetidos. Correções de coleta atualizam as evidências do acervo, preservando perdas já confirmadas. Chaves repetidas das fontes são consolidadas antes da atualização, evitando duplicidade e falha da transação.

## Ciclo

- Rascunhos de materiais não geram casos; a etapa deve estar concluída.
- Um caso de retorno de material usa a triagem final, se existente. Descarregamento e triagem não duplicam a mesma falta.
- Quantidades enviadas são a referência da volta. Danificadas fazem parte do total.
- Na saída, proteção suficiente considera o total em boas condições (total menos danificadas).
- Recontagens atualizam a mesma chave. Reabertura marca revisão; correção resolve; cancelamento muda para cancelada.
- Falta não é perda. A perda depende do movimento oficial na origem.
- Avarias retornadas são encaminhadas à manutenção. Em reparo ou perda na manutenção, o usuário seleciona o lote do pedido na movimentação. O saldo tratado do lote atualiza a pendência automaticamente. Movimentos sem vínculo não resolvem uma avaria de pedido por suposição.
- Novas reprovações são preservadas, mesmo depois de aprovação posterior.
- Insuficiência de saída e atraso consumado permanecem como fatos registrados.
- Toda mudança no caso gera uma versão em `operacao_casos_eventos`; consultar novamente sem alteração não gera outra versão.

## Execução e isolamento

`operacao_casos_automaticos` é uma projeção das fontes. Não altera estoque, reservas, responsabilidade ou regras de encerramento. Materiais nunca são inseridos em `operacao_ocorrencias`, que continua sendo utilizada pelas regras de disponibilidade dos móveis.

As fontes atualizam a projeção por gatilhos. O trabalho `ocorrencias-operacionais-automaticas` do pg_cron recalcula a cada minuto (inclusive passagem do tempo). O painel também recalcula ao abrir, ao atualizar e a cada 30 segundos enquanto visível. A tarefa é instalada quando pg_cron está habilitado; sem ele, gatilhos e atualização do painel continuam funcionando.

O acesso exige sessão, vínculo com a empresa, 2FA e leitura de pedidos. Funções internas não têm execução concedida ao cliente. O navegador não pode escrever casos nem eventos de auditoria. A inclusão direta em `operacao_ocorrencias` foi revogada; as rotinas oficiais de conferência continuam gravando como security definer.

## Validação

`node --test tests/capas-protecao-db.test.cjs`

`node tests/ocorrencias-automaticas-browser.cjs`

Os testes cobrem rascunho/conclusão, duplicidade entre etapas, reabertura/correção, histórico sem duplicatas, separação de estoques, tratamento por lote, qualidade, reprogramação, cancelamento, permissões, filtros, evidências, falha de rede e apresentação em computador/celular.
