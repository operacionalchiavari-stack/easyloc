**Revisão do fluxograma pela perspectiva de quem está começando**

**Atualização de implementação:** os 18 pontos abaixo foram tratados após a revisão. O diagnóstico original foi preservado como registro. A versão atual explica os caminhos de exceção, inclui orientação por card e busca por etapa, e o controle de sublocações registra recebimento/devolução parciais e transferência do saldo a outro fornecedor. Regras comerciais não definidas não foram inventadas: o fluxo identifica o responsável por registrar a decisão, preservando as travas existentes.

Data: 02/11/2026. Revisão de compreensão e cobertura do processo, sem alterações no sistema ou em pedidos.

A análise simula a leitura de uma pessoa que conhece as palavras comuns de um evento, mas não conhece os módulos, as regras nem os atalhos da empresa. Não houve entrevista com um funcionário iniciante real. Foram consultados os textos e destinos finais das etapas, os detalhes exibidos ao usuário, uma captura renderizada e os campos do controle de sublocações.

O fluxo atual contém 136 etapas, 58 decisões e 192 conexões. A validação estrutural encontra destinos conectados e possibilidade de conclusão. Essa validação não verifica se uma resposta é verdadeira no caso concreto, se o usuário tem os dados para responder ou se sabe executar a ação seguinte.

Os pontos abaixo distinguem falhas observáveis do caminho, lacunas de casos e decisões de negócio que precisam de uma explicação. Não significam que todas as funções correspondentes do sistema estejam defeituosas.

| Ordem | Prioridade | Ponto encontrado | Pergunta de quem está começando |
| --- | --- | --- | --- |
| 1 | Alta | Entrega com divergência registrada pode ficar num ciclo sem resposta verdadeira | “Registrei que faltou uma peça. Agora tenho que dizer que não houve divergência?” |
| 2 | Alta | Presença da equipe própria não passa pela mesma verificação da equipe Free | “Não tem Free, mas faltou um funcionário nosso. Por onde sigo?” |
| 3 | Alta | Falta um caminho explícito para pedido sem montagem e para Uber não contratado | “É só entrega. Mesmo assim preciso fazer todo o roteiro de montagem?” |
| 4 | Alta | Origem da peça não é separada antes de orientar perda ou baixa | “A peça quebrada é da outra locadora. Devo baixar o nosso patrimônio?” |
| 5 | Alta | Recebimento e devolução parcial de sublocação não estão explicados | “Contratei oito e chegaram seis. Qual situação marco?” |
| 6 | Alta | Falta de estoque na proposta não apresenta o caminho de sublocação/remanejamento | “Ainda estou no orçamento. Posso procurar outra empresa sem trocar o item do cliente?” |
| 7 | Alta | Confirmação da reserva e conferência do contrato não têm critérios suficientemente objetivos | “O aceite por mensagem basta? Precisa pagar ou assinar antes de reservar?” |
| 8 | Alta | Mudanças solicitadas depois da reserva e pedidos extras não têm caminho próprio | “O cliente pediu mais duas peças depois do carregamento. Edito o pedido ou faço outro?” |
| 9 | Alta | Desistência expressa do cliente depois da reserva não tem tratamento específico | “Ele já pagou e agora desistiu. Como trato as etapas já executadas?” |
| 10 | Alta | Falta revalidar o transporte perto da saída | “O caminhão estava confirmado, mas o motorista desistiu hoje. Onde volto?” |
| 11 | Alta | Erros de QR, acesso, câmera, localização e conexão não têm contingência detalhada | “O QR não funciona e a equipe está no local. Quem resolve e como registro?” |
| 12 | Alta | Há caracteres quebrados em textos de 39 etapas | “Esse ponto de interrogação faz parte da pergunta ou é erro?” |
| 13 | Média | Liberação financeira pode parecer aprovação manual em vez de conferência de recebimento | “O supervisor disse que libera. Existe um botão para isso?” |
| 14 | Média | Ciclos de busca e cobrança não especificam o que fazer quando o prazo operacional vence | “Já tentei todas as opções e o evento é daqui a uma hora. Quem assume a decisão?” |
| 15 | Média | Falta explicitar a espera entre montagem, evento e coleta | “Terminei de montar. A próxima seta já manda desmontar?” |
| 16 | Média | Encerramento com fornecedor não distingue todas as pendências da sublocação | “Já devolvi as peças, mas há uma discussão sobre dano ou custo. Posso fechar?” |
| 17 | Média | Algumas ações dependem de vocabulário e de caminhos de tela não ensinados | “O que é posição final? Onde exatamente registro esse aceite?” |
| 18 | Média | Navegar pelo mapa inteiro pode dificultar encontrar uma tarefa específica | “Sou do carregamento. Como encontro minha etapa sem percorrer o fluxo todo?” |

1. **Entrega com divergência: diferença registrada não é diferença inexistente.** O caminho é `entrega_ok` → Não → `divergencia_entrega` → `entrega_ok`. A pergunta continua sendo “Entrega conferida sem divergência?”. Se faltou uma peça e a solução foi documentar uma reposição futura ou um acordo, a pessoa não deve declarar que tudo foi entregue. O fluxo precisa separar “existe divergência?”, “foi tratada ou tem encaminhamento aprovado?” e “o serviço pode prosseguir?”. Uma correção efetiva da lista também precisa aparecer explicitamente quando for o caso.

2. **Equipe própria deve ter verificação de presença.** `equipe_free` → Não leva a `uber_free`; somente o Sim passa por `qr_free` e `equipe_completa`. A pergunta sobre presença precisa abranger qualquer equipe. Depois, o método de comprovação pode variar conforme o vínculo. Não se trata de exigir QR de funcionário próprio sem regra: é não pular a conferência da equipe inteira.

3. **Serviços opcionais precisam de caminhos “não se aplica”.** `entrega_ok` → Sim segue sempre para `montar` e para os registros de montagem. Não existe a decisão “Há montagem contratada?”. A programação também pergunta por “Equipes e Uber confirmados?” sem esclarecer no próprio caminho o caso de Uber dispensado/não contratado. O usuário precisa conseguir concluir uma entrega simples sem inventar uma montagem ou uma corrida.

4. **Distinguir peça própria de sublocada antes de baixa ou reparo.** `classificar_avaria` → `recuperavel` → Não → `baixar_peca` orienta atualizar patrimônio. A devolução da sublocação aparece depois. Embora o detalhe peça para registrar a origem, não há divisão de caminhos para impedir a interpretação errada. Para uma peça de terceiro, é preciso comunicar o fornecedor, preservar evidências e encaminhar a decisão de reparo/reposição/custo; não presumir que é uma baixa do acervo próprio. Este achado é sobre a orientação do gráfico, não uma demonstração de baixa incorreta no banco.

5. **Recebimento parcial de terceiro exige uma orientação específica.** O controle de sublocação oferece quantidade contratada e situações como Confirmada, Recebida e Devolvida. Não apresenta campos separados de quantidade recebida e devolvida. O fluxo faz uma pergunta binária sobre recebimento. Para oito contratadas e seis recebidas, o iniciante não sabe se registra seis, espera as oito, abre outro registro ou marca o lote inteiro recebido. É necessário definir o procedimento e como ficam o saldo, a conferência e a devolução parcial. O mesmo vale para modelo incorreto ou avaria na chegada.

6. **As alternativas precisam aparecer já no orçamento.** `estoque_ok` → Não → `ajustar_proposta` → `orcamento` menciona mudança de peça, quantidade ou período, sem apresentar a consulta a outros pedidos e a sublocação. Esses caminhos só ficam explícitos na separação. Um novo funcionário pode entender que tem de mudar o que o cliente pediu antes de consultar fornecedores. Também falta explicar que, para registrar sublocação no sistema, primeiro é necessário salvar o orçamento.

7. **Definir o significado operacional de confirmar uma reserva.** `confirmou_reserva` remete à “confirmação comercial”; `contrato` pede conferir campos e anexar o documento quando utilizado. Os textos não definem qual evidência de aceite é suficiente, quem altera o status nem quando a assinatura é necessária pela regra da empresa. A pessoa precisa de um critério verificável, sem pressupor que assinatura, aceite e pagamento são a mesma coisa. A política deve ser explicitada pela empresa, não inventada no fluxograma.

8. **Incluir alterações posteriores e pedido extra.** O gráfico menciona extras na conferência da volta e na posição final, mas não ensina quando nem como criá-los. Falta distinguir alteração antes de a operação assumir, alteração que exige liberação da Triagem e complemento com entrega própria. Sem isso, o iniciante pode tentar editar uma lista já conferida ou criar uma cobrança duplicada.

9. **Desistência expressa tardia é diferente de induzir cancelamento.** O único encaminhamento para `cancelar` vem de `encerrar_negociacao`, na venda. É correto não mandar cancelar por falta de caminhão ou por recusa de uma troca. Porém, se o próprio cliente desistir depois de reservar/pagar, ainda precisa existir um caminho que reúna contrato, parcelas, estoque, produção, escala e compromissos com fornecedores. O fluxo não deve decidir automaticamente o resultado financeiro dessa análise.

10. **Revalidar caminhão, motorista e escala perto da execução.** `caminhao_ok` está no planejamento e encaminha à personalização. Mais adiante, depois da separação, o caminho segue para pagamento do carregamento e carga. O gráfico não mostra o que fazer se uma confirmação antiga deixar de valer. É necessária uma conferência atualizada e um retorno à busca logística, preservando o que já foi produzido e separado.

11. **Dar destino aos erros dos recursos de campo.** `qr_free` e `qr_uber` são ações que seguem adiante, sem uma decisão sobre leitura/validação bem-sucedida. Dizer para comunicar à Logística não explica como continuar ou o que permanece bloqueado. Precisam ser definidos os casos de QR vencido, pessoa/corrida errada, falta de acesso, câmera/localização negada e operação sem conexão. Qualquer alternativa deve dizer quem autoriza e como a evidência será registrada, sem simular presença ou envio.

12. **Corrigir os textos quebrados antes de usar o material em treinamento.** Há caracteres `?` no meio de palavras nos dados finais de 39 etapas, incluindo “Produ??o”, “Saldo m?nimo” e “confer?ncia”. A contagem considera título ou detalhe afetado, não a pontuação normal das perguntas. Trata-se de um defeito real no texto usado para renderização, confirmado na exportação dos nós, e não apenas da codificação de uma leitura do terminal. Não foi corrigido nesta revisão.

13. **Esclarecer o que significa “liberação” pelo Financeiro.** “Reconhecer entrada ou liberação” e “Conferir saldo ou liberação” podem ser lidos como uma autorização manual do supervisor. Outros detalhes exigem recebimento confirmado e cumprimento de percentual. O fluxograma deve distinguir a conferência automática da regra, a baixa do pagamento e qualquer exceção que a empresa realmente permita. Se não existir exceção, não deve sugeri-la.

14. **Uma espera precisa ter dono e próxima ação verificáveis.** `buscar_alternativa_responsavel` → `nova_alternativa` → Não → `acompanhar_alternativa` retorna à busca. Os detalhes pedem responsável e prazo, mas não definem o que fazer quando esse prazo acaba, quem assume nem qual registro comprova o encaminhamento. A orientação pode continuar sendo buscar solução, respeitando o pedido de não induzir cancelamento, mas precisa explicar a escalada e o tratamento do compromisso com o cliente.

15. **Explicitar os momentos de executar montagem e coleta.** `concluir_montagem` segue diretamente para `coletar`, cujo título é “Desmontar e conferir coleta”. Falta representar que o evento acontece entre essas ações e que a coleta deve seguir o horário programado/autorizado. Da mesma forma, planejar uma tarefa não significa que ela será executada imediatamente. Uma etapa de espera e conferência do agendamento evita depender desse conhecimento prévio.

16. **Separar devolução física e encerramento com fornecedor.** `devolver_sublocacao` pede tratar eventual custo de dano e segue à posição final, mas não mostra uma decisão sobre devolução integral, aceite da empresa locadora ou pendência de custo. O controle informa que não gera pagamento automático. O usuário precisa saber onde registrar o compromisso com o fornecedor e se uma pendência pode continuar aberta separadamente do encerramento do atendimento ao cliente.

17. **Transformar detalhes em instruções de trabalho.** Termos como Triagem, acervo, posição final, baixa, liberação e pré-reserva precisam de uma explicação curta no próprio contexto. Em ações como “formalizar”, “apurar”, “registrar aceite” e “acionar responsável”, faltam orientações concretas para o iniciante localizar a tela, saber o que preencher e reconhecer que terminou. Um formato útil por card é: quem executa; onde entra; o que confere/preenche; como comprova a conclusão; para quem encaminha.

18. **Ajudar a localizar uma etapa sem voltar à divisão por setores.** O mapa único preserva a preferência de manter o processo unificado, mas 136 etapas dificultam a consulta pontual. Uma busca por nome de etapa, com centralização do resultado, pode ajudar sem restaurar a coluna lateral ou os cabeçalhos removidos. Também convém distinguir visualmente uma seta de avanço de uma volta para correção. É uma sugestão de navegação, não uma proposta de desfazer a organização solicitada.

**Ordem sugerida para a próxima correção:** caminhos que induzem resposta falsa ou omitem conferência (1–5); alternativas na proposta e mudanças posteriores (6–11); texto e instruções de execução (12–17); navegação (18). A definição das políticas de aceite, exceção financeira e encerramento com fornecedor precisa ser explícita antes de virar uma regra obrigatória.

**Referências conferidas:** `Modulos/Gestao/Fluxograma/fluxograma-detalhado.js` (dados finais dos nós e destinos após os ajustes), `Modulos/Gestao/Fluxograma/fluxograma-rotas.js`, captura `.tmp/fluxograma-tela-livre.png` e campos/situações em `js/ui/sublocacoes.js`. Não foram realizadas alterações de código ou de dados comerciais nesta revisão.

**Correções aplicadas após o diagnóstico**

| Achados | Tratamento implementado |
| --- | --- |
| 1 | Divergência registrada segue para verificação do encaminhamento aprovado; não exige afirmar que a divergência deixou de existir. |
| 2–3 | Toda equipe passa pela presença; montagem contratada tem decisão própria; deslocamento sem Uber é explicado como aplicável/não aplicável. |
| 4 | Origem de terceiro é verificada antes do tratamento de avarias do patrimônio próprio. |
| 5 | Quantidades recebidas/devolvidas acumuladas, situações parciais, bloqueio de Triagem pelo saldo e transferência atômica da quantidade ainda não recebida. |
| 6 | Consulta de outras reservas e fornecedores já na proposta, com salvamento prévio do orçamento explicado. |
| 7 | Evidência de aceite e assinatura aplicável separadas da verificação financeira; responsável Comercial indicado quando a regra não foi informada. |
| 8–9 | Caminhos de alteração, complemento/extra e cancelamento expressamente solicitado depois da reserva, preservando histórico e apuração pelos responsáveis. |
| 10–11 | Revalidação de caminhão/motorista na saída e contingências de QR, corrida, acesso e envio da foto/localização. |
| 12–13 | Textos quebrados corrigidos; liberação financeira explicada pela regra e recebimento real, sem sugerir autorização verbal de exceção. |
| 14–16 | Prazo de acompanhamento e escalada de urgência; espera pelo evento/agendamento; devolução física separada das pendências financeiras com fornecedor, com acesso a Contas a pagar. |
| 17–18 | Cards com quem faz, onde fazer, como conferir e impedimentos; explicação de termos; busca por etapa com centralização e zoom legível. |

Validação: testes de caminhos e textos, geometria das conexões, sublocações em banco de teste, interface em navegador e regressões das travas operacionais. A revisão continua sendo uma avaliação simulada de primeiro uso; um acompanhamento futuro com funcionário iniciante pode revelar melhorias adicionais de compreensão.
