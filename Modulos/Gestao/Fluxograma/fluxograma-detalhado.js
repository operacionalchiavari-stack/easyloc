(function(){
 'use strict';
 const setores={cliente:['Cliente','#0f887f'],comercial:['Comercial','#123f86'],financeiro:['Financeiro','#227a49'],logistica:['Planejamento','#c2670f'],estoque:['Estoque e qualidade','#0f7a83'],campo:['Equipe de campo','#7253ad'],sistema:['Sistema','#63635b']};
 const fases=[['venda','Contato e proposta'],['reserva','Reserva e financeiro'],['planejamento','Planejamento e produção'],['ida','Separação, carregamento e entrega'],['volta','Coleta e conferência da volta'],['qualidade','Qualidade e recuperação do acervo'],['fechamento','Fechamento financeiro'],['posvenda','Pós-venda e conclusão']];
 const nos=[];
 function passo(fase,id,setor,col,titulo,detalhe,proximo,tela){nos.push({fase,id,setor,col,titulo,detalhe,tela,tipo:'passo',saidas:[{rotulo:'Segue',destino:proximo}]});}
 function decisao(fase,id,setor,col,titulo,detalhe,sim,nao,tela){nos.push({fase,id,setor,col,titulo,detalhe,tela,tipo:'decisao',saidas:[{rotulo:'Sim',destino:sim},{rotulo:'Não',destino:nao}]});}
 function fim(fase,id,setor,col,titulo,detalhe){nos.push({fase,id,setor,col,titulo,detalhe,tipo:'fim',saidas:[]});}
 const central='Modulos/Comercial/Pedidos/CentralPedidos.html',parametros='Modulos/Configuracoes/Parametros/parametros.html',painel='Modulos/Logistica/PainelLogistico/painel-logistico.html',triagem='Modulos/Estoque/SeparacaoMateriais/separacao-materiais.html',expedicao='Modulos/Logistica/Expedicao/expedicao.html',campo='Modulos/Logistica/PainelLogistico/painel-logistico.html',acervo='Modulos/Estoque/Acervo/acervo.html',bancos='Modulos/Financeiro/financeiro.html?aba=bancos',posicao='Modulos/Financeiro/financeiro.html?aba=posicao',posvenda='Modulos/Chiavari/Feedback/feedback.html';
 passo('venda','inicio','cliente',0,'Primeiro contato','O cliente procura a empresa ou envia um projeto do catálogo. O Comercial identifica o solicitante e registra o atendimento.','dados_ok',central);
 decisao('venda','dados_ok','comercial',1,'Dados do evento completos?','Conferir cliente, contato, tipo de evento, local, endereço, datas e horários de entrega/coleta. Não reutilizar cadastro ou endereço de uma seleção anterior.','orcamento','coletar_dados',central);
 passo('venda','coletar_dados','comercial',0,'Completar dados','Preencher os dados obrigatórios e selecionar os cadastros corretos. Depois conferir novamente antes de montar a proposta.','dados_ok',central);
 passo('venda','orcamento','comercial',2,'Montar ambientes e proposta','Incluir itens, kits, quantidades, serviços, frete e montagem. O orçamento fica no Comercial e ainda não reserva estoque.','estoque_ok',central);
 decisao('venda','estoque_ok','estoque',3,'Estoque suficiente no período?','Consultar entrega até coleta, com as margens configuradas em Parâmetros. Somar o uso da mesma peça em todos os ambientes, incluindo componentes dos kits e bloqueios do acervo.','aprovacao','ajustar_proposta',central);
 passo('venda','ajustar_proposta','comercial',3,'Ajustar peças ou quantidades','Resolver falta de estoque com alternativas, mudança de quantidade ou de período. Atualizar valores e consultar a disponibilidade novamente.','orcamento',central);
 decisao('venda','aprovacao','cliente',4,'Cliente aceita a proposta?','A aceitação permite formalizar a pré-reserva ou reserva. Não confundir visualizar o PDF com aprovação do cliente.','regras_ok','encerrar_negociacao',central);
 decisao('venda','encerrar_negociacao','comercial',5,'Negociação foi encerrada?','Registrar a decisão do cliente. Uma proposta sem resposta continua em acompanhamento; não deve ser cancelada automaticamente por falta de resposta.','cancelar','acompanhar_proposta',central);
 passo('venda','acompanhar_proposta','comercial',6,'Acompanhar e revisar proposta','Retomar o contato e revisar o que o cliente solicitou. A proposta só avança quando o cliente aceitar; se encerrar, registrar o motivo.','aprovacao',central);
 passo('venda','cancelar','comercial',6,'Registrar cancelamento e motivo','Confirmar o cancelamento no Comercial, registrar o motivo e conferir a liberação de reservas e os efeitos financeiros aplicáveis.','cancelado',central);
 fim('venda','cancelado','sistema',7,'Pedido cancelado','Fim deste caminho. Motivo registrado; estoque e pendências financeiras devem refletir o cancelamento. Um novo atendimento inicia outro ciclo.');

 decisao('reserva','regras_ok','comercial',0,'Dados e parcelas conferidos?','Conferir dados do evento, total distribuído entre parcelas, descontos, frete, montagem, condição escolhida e disponibilidade. Sem isso, corrigir antes de salvar.','contrato','corrigir_regras',central);
 passo('reserva','corrigir_regras','comercial',1,'Corrigir pedido e financeiro','Corrigir campos, valores ou distribuição das parcelas. Parcelas já pagas precisam ser preservadas; não duplicar cobranças.','regras_ok',central);
 passo('reserva','contrato','comercial',1,'Conferir contrato e documento','Verificar dados preenchidos, itens/fotos, valores e campos de assinatura. Anexar o contrato ao pedido quando utilizado e conferir a versão do PDF.','pre_reserva',central);
 decisao('reserva','pre_reserva','comercial',2,'É uma pré-reserva?','A pré-reserva tem validade e bloqueia estoque enquanto válida, mas não autoriza execução operacional. A reserva confirmada segue para a operação.','validade','reservar',central);
 decisao('reserva','validade','sistema',3,'Pré-reserva ainda válida?','Usar a data de validade registrada. Quando o prazo acaba, a disponibilidade precisa deixar de considerar essa pré-reserva.','confirmou_reserva','liberar_pre',central);
 decisao('reserva','confirmou_reserva','cliente',4,'Reserva foi confirmada?','Só a confirmação comercial transforma a pré-reserva em pedido operacional. Enquanto não houver confirmação, aguardar dentro da validade.','reservar','aguardar_pre',central);
 passo('reserva','aguardar_pre','comercial',5,'Acompanhar confirmação','Manter a pré-reserva em consulta, sem separar ou carregar peças. Conferir o prazo novamente; não manter bloqueio sem validade.','validade',central);
 passo('reserva','liberar_pre','sistema',4,'Encerrar o bloqueio vencido','A pré-reserva vencida não segura estoque. O Comercial retoma a negociação e precisa consultar novamente a disponibilidade antes de renovar ou reservar.','acompanhar_proposta',central);
 passo('reserva','reservar','sistema',6,'Salvar pedido reservado','Persistir itens e valores, reservar o estoque, sincronizar parcelas/contas, cronograma e demandas de produção. Conferir os resultados e evitar duplicação em reenvios.','planejar',central);

 passo('planejamento','planejar','logistica',0,'Programar equipes e transporte','Conferir etapas, horários, responsáveis, equipe e caminhões. Ajustar conflitos de agenda; frete terceirizado, Uber e equipe extra seguem seus módulos.','escala_ok',painel);
 decisao('planejamento','escala_ok','logistica',1,'Escala e transporte prontos?','Confirmar cobertura das etapas, caminhões e pessoas. Resolver sobreposições e ausências antes da execução.','personalizacao','corrigir_escala',painel);
 passo('planejamento','corrigir_escala','logistica',2,'Resolver pendências da escala','Reprogramar horário, equipe ou veículo; contratar apoio quando necessário. Retornar à conferência da programação.','planejar',painel);
 decisao('planejamento','personalizacao','estoque',2,'Há itens personalizados?','Identificar pintura, tecido, acabamento ou outro serviço contratado. Sem personalização, seguir para a separação normal.','produzir','triagem_pagamento','Modulos/Producao/ordens.html');
 passo('planejamento','produzir','estoque',3,'Separar material e produzir','Conferir materiais reservados, executar as etapas da ordem e registrar responsáveis e evidências. Material em falta precisa de reposição antes da conclusão.','producao_ok','Modulos/Producao/ordens.html');
 decisao('planejamento','producao_ok','estoque',4,'Produção foi conferida?','Verificar acabamento, quantidade e conclusão das etapas exigidas. Uma peça sem conferência não deve ser tratada como produção pronta.','triagem_pagamento','corrigir_producao','Modulos/Producao/ordens.html');
 passo('planejamento','corrigir_producao','estoque',5,'Corrigir produção ou material','Registrar o problema e executar o retrabalho ou reposição necessária. Repassar a produção pela conferência.','produzir','Modulos/Producao/ordens.html');

 decisao('ida','triagem_pagamento','financeiro',0,'Triagem liberada pelo Financeiro?','Aplicar a regra configurada para esta etapa. Se a trava financeira estiver no carregamento ou desativada, a Triagem pode avançar conforme a configuração.','separar','receber_entrada',bancos);
 passo('ida','receber_entrada','financeiro',1,'Reconhecer entrada ou liberação','Conferir o recebimento pelo banco/PIX ou caixa físico, ou a liberação permitida ao responsável. A simples promessa de pagamento não baixa uma parcela.','triagem_pagamento',bancos);
 passo('ida','separar','estoque',1,'Separar e conferir peças','Selecionar o modo de separação, conferir itens e componentes, quantidades e etiquetas/patrimônios. Respeitar as restrições de edição após o setor assumir o pedido.','separacao_ok',triagem);
 decisao('ida','separacao_ok','estoque',2,'Separação está completa?','Conferir todas as peças, kits e personalizações. Falta, avaria ou divergência deve ser registrada e resolvida antes de declarar a separação concluída.','caminhao_ok','corrigir_separacao',triagem);
 passo('ida','corrigir_separacao','estoque',3,'Resolver falta ou divergência','Recontar, tratar a peça ou solicitar ajuste autorizado ao Comercial. Não alterar silenciosamente a lista já assumida pela operação.','separar',triagem);
 decisao('ida','caminhao_ok','logistica',3,'Caminhão programado ou dispensa válida?','O carregamento exige caminhão programado, exceto quando Parâmetros permite carregar sem programação. A equipe também registra em qual caminhão carregou.','carregamento_pago','programar_caminhao',painel);
 passo('ida','programar_caminhao','logistica',4,'Programar e selecionar caminhão','Vincular o veículo à etapa no Painel Logístico e conferir a seleção na Expedição. Depois validar novamente a condição de carregamento.','caminhao_ok',painel);
 decisao('ida','carregamento_pago','financeiro',4,'Carregamento liberado pelo Financeiro?','Conferir a porcentagem exigida e o saldo reconhecido, conforme Parâmetros. Se o pagamento ainda não satisfaz a regra, não iniciar/concluir o carregamento.','carregar','receber_saldo',bancos);
 passo('ida','receber_saldo','financeiro',5,'Conferir saldo ou liberação','Reconhecer os pagamentos faltantes ou a autorização prevista. Retornar à verificação do carregamento após a atualização financeira.','carregamento_pago',bancos);
 passo('ida','carregar','estoque',5,'Conferir carregamento e saída','Registrar caminhão, conferir quantidades e leituras, registrar exceções autorizadas e concluir a saída. O pedido passa para Entrega.','entrega_ok',expedicao);
 decisao('ida','entrega_ok','campo',6,'Entrega conferida sem divergência?','Conferir entregue, retorno antecipado e itens retirados da lista, com responsável e evidências. Não marcar quantidades faltantes como entregues.','montar','divergencia_entrega',campo);
 passo('ida','divergencia_entrega','campo',7,'Registrar divergência e solução','Registrar falta, retorno antecipado, substituição ou ajuste autorizado. Revalidar o que efetivamente ficou no evento e comunicar Comercial/Financeiro.','entrega_ok',campo);
 passo('ida','montar','campo',7,'Montar e executar o evento','Montar o contratado, registrar conclusão e ocorrências. Pedido extra só pode ser criado no prazo permitido e tem entrega própria; na volta acompanha o principal.','coletar','Modulos/Chiavari/Cronograma/montador.html');

 passo('volta','coletar','campo',0,'Desmontar e conferir coleta','Contar o que será recolhido, incluindo avarias, faltas e itens já devolvidos. Registrar responsável, fotos e motivos das diferenças.','coleta_ok',campo);
 decisao('volta','coleta_ok','campo',1,'Coleta sem falta ou avaria?','Comparar previsto e coletado. Uma ocorrência não pode desaparecer do processo: deve acompanhar retorno, acervo e fechamento financeiro.','retorno_sim','registrar_coleta',campo);
 passo('volta','registrar_coleta','campo',2,'Registrar falta e avaria','Registrar as quantidades e motivos de forma rastreável. A volta pode prosseguir com a divergência documentada, que será tratada no acervo e na posição final.','retorno_sim',campo);
 decisao('volta','retorno_sim','logistica',2,'Retorno é simultâneo?','Aplicar Parâmetros > Fluxo dos pedidos. No modo simultâneo, Expedição e Triagem trabalham em paralelo; no sequencial, descarregamento vem primeiro.','conferir_sim','descarregar',parametros);
 passo('volta','conferir_sim','estoque',3,'Conferir as duas etapas da volta','Expedição confere o descarregamento e Triagem confere o retorno. Principal e extras são conferidos em conjunto conforme o vínculo do pedido.','duas_ok',expedicao);
 decisao('volta','duas_ok','estoque',4,'As duas conferências terminaram?','A conclusão de somente uma etapa não encerra a volta nem libera a posição final. Verificar os registros das duas equipes.','ha_avaria','corrigir_retorno',expedicao);
 passo('volta','corrigir_retorno','estoque',5,'Completar conferência pendente','Identificar qual etapa ou quantidade falta conferir. Recontar e registrar a correção; repetir a validação conjunta.','conferir_sim',expedicao);
 passo('volta','descarregar','estoque',3,'Conferir descarregamento','No retorno sequencial, primeiro conferir o que saiu do caminhão. Somente depois a Triagem recebe a etapa de retorno.','triagem_volta',expedicao);
 passo('volta','triagem_volta','estoque',4,'Conferir Triagem da volta','Conferir as quantidades e diferenças depois do descarregamento. Manter evidências e encaminhar peças que precisam de tratamento.','ha_avaria',triagem);

 decisao('qualidade','ha_avaria','estoque',0,'Há peças com pendência no acervo?','Verificar limpeza, avaria, reparo, inspeção e peças não encontradas. Conferir divergências mesmo quando a coleta parece completa.','classificar_avaria','posicao_final',acervo);
 passo('qualidade','classificar_avaria','estoque',1,'Classificar e bloquear a peça','Registrar origem, quantidade, condição, responsável e tratamento. A peça permanece indisponível até a liberação ou baixa correspondente.','recuperavel',acervo);
 decisao('qualidade','recuperavel','estoque',2,'A peça pode ser recuperada?','Qualidade define se a peça segue para limpeza/reparo ou baixa/investigação. Registrar a decisão e manter a divergência rastreável.','reparar','baixar_peca',acervo);
 passo('qualidade','reparar','estoque',3,'Limpar ou reparar a peça','Executar a O.S., registrar materiais, custos, fotos e responsável. Encaminhar para inspeção antes de voltar ao estoque disponível.','inspecao_ok',acervo);
 decisao('qualidade','inspecao_ok','estoque',4,'Inspeção final aprovada?','Conferir qualidade e quantidade física. Apenas a inspeção aprovada permite liberar a peça; reprovação exige novo tratamento.','liberar_peca','reparar',acervo);
 passo('qualidade','liberar_peca','estoque',5,'Liberar a peça no acervo','Registrar a liberação física e atualizar a disponibilidade. Conferir o efeito nos próximos pedidos e manter o histórico do evento.','posicao_final',acervo);
 passo('qualidade','baixar_peca','estoque',3,'Registrar perda ou baixa autorizada','Concluir a apuração antes de confirmar a perda/baixa. Atualizar o patrimônio e encaminhar a decisão financeira; a peça não volta ao saldo disponível.','posicao_final',acervo);

 passo('fechamento','posicao_final','financeiro',0,'Apurar posição final do evento','Reunir principal e extras, entregue/coletado, faltas, avarias, retornos, créditos e custos. Não duplicar os efeitos já registrados.','fontes_ok',posicao);
 decisao('fechamento','fontes_ok','financeiro',1,'Fontes e valores conferidos?','Conferir as últimas versões das conferências, valores de reposição e decisões autorizadas. Uma fonte alterada exige revisar a apuração.','ha_saldo','corrigir_fontes',posicao);
 passo('fechamento','corrigir_fontes','financeiro',2,'Revisar divergências do fechamento','Corrigir preços, conferências ou decisões pendentes com os setores responsáveis. Reabrir a apuração a partir das fontes atualizadas.','posicao_final',posicao);
 decisao('fechamento','ha_saldo','financeiro',3,'Há saldo ou decisão financeira pendente?','Conferir cobrança, crédito, compensação, estorno e recebimentos reais. Enquanto existir pendência, o pedido não cumpre a condição de finalização completa.','resolver_saldo','confirmar_posicao',bancos);
 passo('fechamento','resolver_saldo','financeiro',4,'Resolver cobrança, crédito ou saldo','Registrar a decisão e o movimento pelo caminho correto: PIX, conciliação bancária ou caixa. Compensação não cria dinheiro fictício.','ha_saldo',bancos);
 passo('fechamento','confirmar_posicao','financeiro',5,'Confirmar posição final','Confirmar a apuração sem duplicar lançamentos. O sistema gera o acompanhamento de pós-venda; a posição final sozinha ainda não significa pedido finalizado.','posvenda',posicao);

 passo('posvenda','posvenda','comercial',0,'Realizar contato de pós-venda','Respeitar prazo, agrupamento e intervalo configurados. Registrar cada tentativa e as respostas do cliente.','contato_ok',posvenda);
 decisao('posvenda','contato_ok','cliente',1,'Contato foi concluído?','Para concluir a ligação, responder às perguntas obrigatórias. Se o cliente não atender, usar o limite e o prazo de novas tentativas.','resposta_ruim','limite_tentativas',posvenda);
 decisao('posvenda','limite_tentativas','comercial',2,'Limite de tentativas atingido?','Aplicar a quantidade de tentativas de Parâmetros. Dispensa de contato, quando usada, deve ter motivo registrado.','sem_contato','reagendar',posvenda);
 passo('posvenda','reagendar','comercial',3,'Registrar tentativa e reagendar','Registrar que não atendeu e agendar a próxima tentativa dentro do intervalo configurado. A pendência permanece visível.','posvenda',posvenda);
 passo('posvenda','sem_contato','comercial',3,'Registrar encerramento sem contato','Encerrar como sem contato ao atingir o limite; ou registrar dispensa autorizada com motivo. Não inventar respostas em nome do cliente.','final_ok',posvenda);
 decisao('posvenda','resposta_ruim','comercial',2,'Há reclamação ou resposta negativa?','Respostas negativas recebem atenção e precisam de acompanhamento com os setores envolvidos. Manter o relato do cliente no histórico.','tratar_reclamacao','final_ok',posvenda);
 passo('posvenda','tratar_reclamacao','comercial',3,'Tratar reclamação com os setores','Registrar causa, responsável e ação corretiva. Retornar ao cliente quando necessário e registrar o resultado.','reclamacao_ok',posvenda);
 decisao('posvenda','reclamacao_ok','cliente',4,'Tratamento foi concluído?','Conferir se a ação corretiva foi executada e o retorno registrado. Se ainda falta solução, manter o acompanhamento com o responsável.','final_ok','acompanhar_reclamacao',posvenda);
 passo('posvenda','acompanhar_reclamacao','comercial',5,'Acompanhar a solução pendente','Acionar o responsável ou supervisor e registrar prazo/andamento. Não deixar a resposta negativa sem encaminhamento.','tratar_reclamacao',posvenda);
 decisao('posvenda','final_ok','sistema',6,'Condições de finalização atendidas?','Pedido finalizado: posição final confirmada, pós-venda concluído/encerrado e financeiro sem pendência. Reclamações mantêm seu histórico de acompanhamento.','finalizado','revisar_pendencias',central);
 passo('posvenda','revisar_pendencias','financeiro',7,'Localizar a pendência restante','Identificar se falta apuração, saldo ou registro do pós-venda. Voltar ao fechamento para conferir as fontes e encaminhar o que ainda precisa de conclusão.','posicao_final',posicao);
 fim('posvenda','finalizado','sistema',8,'Pedido finalizado','Fim do ciclo. Conferências, decisões, pagamentos e pós-venda permanecem disponíveis no histórico.');


 // Operational exceptions are explicit decisions with both destinations defined.
 for(const n of nos)if(['planejamento','ida'].includes(n.fase))n.col*=4;
 const ligar=(id,destino)=>{nos.find(n=>n.id===id).saidas[0].destino=destino;};
 const explicar=(id,texto)=>{nos.find(n=>n.id===id).detalhe=texto;};
 const novoPasso=(fase,id,setor,col,titulo,detalhe,destino,tela=central)=>passo(fase,id,setor,col,titulo,detalhe,destino,tela);
 const novaDecisao=(fase,id,setor,col,titulo,detalhe,sim,nao,tela=central)=>decisao(fase,id,setor,col,titulo,detalhe,sim,nao,tela);
 nos.find(n=>n.id==='personalizacao').saidas[0].destino='producao_paga';
 novaDecisao('planejamento','producao_paga','financeiro',9,'Produção liberada pelo Financeiro?','Aplicar o percentual independente em Parâmetros > Financeiro > Produção. Somente recebimentos confirmados liberam o início ou a retomada; promessa de pagamento não libera.','produzir','cobrar_producao',parametros);
 novoPasso('planejamento','cobrar_producao','financeiro',10,'Cobrar pagamento da produção','Informar ao Comercial o valor pendente e cobrar o cliente. Manter a ordem bloqueada at? o pagamento confirmado.','producao_recebida',bancos);
 novaDecisao('planejamento','producao_recebida','financeiro',11,'Pagamento foi confirmado?','Conferir a baixa real em Contas a receber. Se não pagar, o Comercial decide com o cliente se ainda existe prazo para renegociar.','producao_paga','prazo_producao',bancos);
 novaDecisao('planejamento','prazo_producao','comercial',12,'Há prazo e acordo para aguardar?','Definir responsável e prazo de cobran?a. Se não houver acordo viável, formalizar o cancelamento; não iniciar a produção para tentar recuperar o atraso.','cobrar_producao','cancelar');
 ligar('receber_entrada','entrada_confirmada');
 novaDecisao('ida','entrada_confirmada','financeiro',1,'Pagamento da Triagem confirmado?','Consultar o recebimento real. Sem pagamento, a separação permanece bloqueada e o Comercial assume a negociação.','triagem_pagamento','negociar_entrada',bancos);
 novoPasso('ida','negociar_entrada','comercial',2,'Contatar cliente e definir prazo','Cobrar o pagamento, registrar contato e prazo compatível com entrega e produção. Não tratar promessa ou comprovante não conciliado como quitação.','aguardar_entrada');
 novaDecisao('ida','aguardar_entrada','comercial',3,'Cliente mantém o pedido dentro do prazo?','Se houver acordo viável, acompanhar at? reconhecer o pagamento; se recusar ou não houver prazo, cancelar formalmente e apurar os efeitos financeiros.','receber_entrada','cancelar');
 ligar('receber_saldo','saldo_confirmado');
 novaDecisao('ida','saldo_confirmado','financeiro',17,'Saldo mínimo foi confirmado?','Não despachar por promessa de pagamento. Sem confirmação, cobrar e revisar o prazo com Comercial e Logística.','carregamento_pago','negociar_saldo',bancos);
 novoPasso('ida','negociar_saldo','comercial',18,'Cobrar saldo e revisar prazo de saída','Avisar o cliente e a Logística. Manter o caminhão sem saída at? a regra ser satisfeita.','prazo_saldo');
 novaDecisao('ida','prazo_saldo','comercial',19,'Ainda É possível cumprir o combinado?','Com prazo viável, acompanhar cobran?a e revalidar. Sem prazo ou acordo, encaminhar cancelamento formal e libera??o da escala.','receber_saldo','cancelar');
 ligar('corrigir_separacao','recuperar_separacao');
 novaDecisao('ida','recuperar_separacao','estoque',9,'Há reparo ou peça igual disponível a tempo?','Isolar a peça danificada, registrar foto e bloquear no acervo. Conferir estoque real e tempo de reparo antes de prometer reposição.','repor_separacao','oferecer_troca',triagem);
 novoPasso('ida','repor_separacao','estoque',10,'Reparar ou separar reposição conferida','Conferir qualidade, quantidade, capa e componentes. A peça avariada não conta como separada.','separar',triagem);
 novoPasso('ida','oferecer_troca','comercial',11,'Contatar cliente com alternativas de troca','Enviar fotos, dimensões, disponibilidade e eventual diferença de valor. Registrar a escolha do cliente; não substituir silenciosamente.','troca_aceita');
 novaDecisao('ida','troca_aceita','cliente',12,'Cliente aprovou a substituição?','A aprovação precisa identificar a peça e as condições. Revisar reserva, itens operacionais, contrato e financeiro antes de separar a alternativa.','aplicar_troca','retirada_aceita');
 novoPasso('ida','aplicar_troca','comercial',13,'Registrar troca e atualizar pedido e reserva','Preservar histórico do item original e aprovação. Ajustar valores/créditos e comunicar Triagem e Expedição antes da nova conferência.','separar');
 novaDecisao('ida','retirada_aceita','cliente',14,'Cliente aceita retirar o item do pedido?','Apresentar impacto no evento e o ajuste de preço. Sem aceite de troca ou retirada, escalar ao responsável para cancelamento formal.','retirar_item','cancelar');
 novoPasso('ida','retirar_item','comercial',15,'Formalizar retirada e ajuste financeiro','Registrar autorização, retirar da lista operacional por procedimento autorizado e apurar crédito ou estorno. Conferir a nova lista antes de prosseguir.','separar');
 ligar('programar_caminhao','transportador_disponivel');
 novaDecisao('ida','transportador_disponivel','logistica',13,'Há veículo e motorista disponíveis?','Conferir capacidade, horário, rota e cadastro. A programação não está resolvida s? por tentar selecionar um caminhão.','caminhao_ok','buscar_freteiro',painel);
 novoPasso('ida','buscar_freteiro','logistica',14,'Divulgar link do app do freteiro e abrir oferta','Compartilhar o link público de cadastro e a demanda de frete. Conferir documentos, capacidade e aceite antes de vincular o novo veículo.','frete_aceito','Modulos/Chiavari/Fretes/fretes.html');
 novaDecisao('ida','frete_aceito','logistica',15,'Freteiro apto aceitou o serviço?','Validar cadastro, preço, rota e horário, depois cadastrar/vincular veículo e motorista à etapa. Se ninguém aceitar, rever condições e prazo.','programar_caminhao','reprogramar_frete',painel);
 novaDecisao('ida','reprogramar_frete','comercial',16,'Cliente aceita reprogramar a entrega?','Confirmar novo horário viável com cliente e Logística. Sem possibilidade de entrega, formalizar cancelamento e ajustar cobran?as.','planejar','cancelar');
 ligar('carregar','carga_completa');
 explicar('carregar','Selecionar o caminhão ativo e registrar a carga por veículo. Salvar a parte do primeiro caminhão mantém o carregamento aberto; o saldo vai para o próximo. Conferir peças, capas e componentes.');
 novaDecisao('ida','carga_completa','estoque',21,'Todas as peças e capas estão carregadas?','Somar os registros de todos os caminhões. Carga parcial de veículo não encerra a etapa do pedido. Conferir faltas e componentes antes de concluir.','encerrar_carga','outro_caminhao',expedicao);
 novaDecisao('ida','outro_caminhao','logistica',22,'O saldo vai em outro caminhão?','Se a peça está disponível, selecionar o próximo veículo e continuar. Se falta peça ou capa, resolver a divergência antes da saída.','selecionar_proximo','falta_carga',expedicao);
 novoPasso('ida','selecionar_proximo','estoque',23,'Salvar carga do veículo e selecionar o próximo','Identificar exatamente o que foi em cada caminhão. Preservar a conferência anterior e registrar apenas o saldo no próximo veículo.','carregar',expedicao);
 novoPasso('ida','falta_carga','estoque',24,'Localizar peça ou capa e registrar ocorrência','Recontar, procurar no depósito e conferir com a Triagem. Se houve dano sem reparo, acionar o Comercial para troca aprovada ou retirada formal. Não encerrar uma carga parcial como completa.','recuperar_separacao',triagem);
 novoPasso('ida','encerrar_carga','estoque',25,'Conferir veículos e autorizar saída completa','Confirmar todos os caminhões vinculados, motorista, peças e capas. Só encerrar após validar o total do pedido; pendências reais exigem tratamento próprio e rastreável.','entrega_ok',expedicao);
 ligar('montar','equipe_free');
 explicar('montar','Abrir o evento no app ou na aba Entregas. Seguir o mesmo roteiro de equipe, transporte, chegada, fotos, conferência por ambiente e ocorrências, preservando autor, horário e origem do registro.');
 novaDecisao('ida','equipe_free','campo',29,'Há equipe Free no evento?','Conferir as pessoas confirmadas e a escala. Quando houver Free, validar presença e QR de check-in; quando não houver, seguir com a equipe própria.','qr_free','uber_free',campo);
 novoPasso('ida','qr_free','campo',30,'Conferir equipe Free e QR de presença','Validar o QR no evento e conferir quem chegou. Pessoa ausente exige contato e reposição; não registrar presença fictícia.','equipe_completa',campo);
 novaDecisao('ida','equipe_completa','campo',31,'Equipe necessária está presente?','Comparar presentes e escala. Com falta, a Logística precisa providenciar substituto e revisar o prazo antes de liberar o serviço.','uber_free','repor_equipe',campo);
 novoPasso('ida','repor_equipe','logistica',32,'Acionar equipe substituta e atualizar escala','Contatar Free disponível ou remanejar equipe; registrar o novo responsável e avisar cliente se houver impacto no horário.','qr_free',painel);
 novaDecisao('ida','uber_free','campo',33,'Há Uber Free contratado?','Se houver transporte contratado, validar a corrida, motorista e QR conforme o app. Não confirmar corrida inexistente para prosseguir.','qr_uber','foto_equipe',campo);
 novoPasso('ida','qr_uber','campo',34,'Validar QR e realização do Uber Free','Conferir motorista, embarque/desembarque e registro de transporte. Divergência deve ser comunicada ? Logística para regularização.','foto_equipe',campo);
 novoPasso('ida','foto_equipe','campo',35,'Registrar chegada e foto da equipe','Enviar foto real da equipe, conferir localização, horário e responsável. Preservar a origem Mobile ou Sistema e os registros de presença.','montagem_conferencia',campo);
 novoPasso('ida','montagem_conferencia','campo',36,'Conferir entrega e montar por ambiente','Contar peças por ambiente, conferir condições e executar a montagem. Registrar sacolas/capas, fotos e lista assinada conforme o roteiro do app.','quebra_evento',campo);
 novaDecisao('ida','quebra_evento','campo',37,'Há quebra, falta ou avaria no evento?','Registrar item, quantidade, foto, descrição e responsável. Isolar peça insegura e avisar Comercial/Logística antes de prometer reposição.','ocorrencia_evento','registros_evento',campo);
 novoPasso('ida','ocorrencia_evento','campo',38,'Registrar dano e solicitar solução ao responsável','Documentar dano no app ou no sistema; encaminhar reposição/troca, cliente e acervo. A ocorrência acompanha coleta e fechamento financeiro.','repor_evento',campo);
 novaDecisao('ida','repor_evento','logistica',39,'É possível repor a tempo com aceite do cliente?','Conferir estoque e transporte. Havendo troca, registrar aceite antes de enviar. Sem reposição viável, formalizar a solução acordada e o ajuste financeiro.','enviar_reposicao','acordar_evento',painel);
 novoPasso('ida','enviar_reposicao','logistica',40,'Programar reposição e conferir o que chegou','Registrar saída/entrega da reposição vinculada ao pedido, sem duplicar quantidades. A peça avariada mantém seu registro e destino.','montagem_conferencia',painel);
 novoPasso('ida','acordar_evento','comercial',41,'Registrar acordo com cliente e ajuste financeiro','Formalizar retirada, abatimento/crédito ou outra solução aprovada. Manter fotos e responsável pelo dano para apuração posterior.','registros_evento');
 novaDecisao('ida','registros_evento','campo',42,'Todos os registros da montagem foram enviados?','Conferir foto da equipe, presença/QR aplicáveis, sacolas, conferência e lista assinada. O que foi feito no Mobile deve aparecer na aba Entregas com autor e data.','concluir_montagem','completar_evento',campo);
 novoPasso('ida','completar_evento','campo',43,'Completar registros pendentes','Abrir o registro que falta no app ou no sistema e enviar a evidência real. Sem conexão, acompanhar a sincronização antes de considerar enviado.','registros_evento',campo);
 novoPasso('ida','concluir_montagem','campo',44,'Concluir montagem e conferir sincronização','Confirmar o encerramento e os registros na aba Entregas. Manter as ocorrências disponíveis para desmontagem, acervo e posição final.','coletar',campo);

 // A falta de uma solução operacional exige nova alternativa, nunca cancelamento sugerido.
 const ajustar=(id,titulo,detalhe)=>Object.assign(nos.find(n=>n.id===id),{titulo,detalhe});
 const resposta=(id,rotulo,destino)=>{nos.find(n=>n.id===id).saidas.find(s=>s.rotulo===rotulo).destino=destino;};
 const sublocacoes=central+'?sublocacoes=1';
 ajustar('encerrar_negociacao','Cliente solicitou encerrar a negociação?','Somente uma decisão expressa do cliente de encerrar a negociação encaminha para cancelamento formal. Falta de veículo, estoque ou alternativa não representa pedido de cancelamento.');
 ajustar('planejar','Programar equipes e Uber','Programar a equipe e o Uber necessário para deslocamento. Neste mesmo planejamento, conferir o caminhão e o motorista para o frete dos móveis, antes da produção e da separação.');
 ajustar('escala_ok','Equipes e Uber confirmados?','Conferir as pessoas, os horários e o Uber contratado. Resolver ausências e conflitos antes de conferir a programação do caminhão.');
 resposta('escala_ok','Sim','caminhao_ok');
 resposta('caminhao_ok','Sim','personalizacao');
 resposta('separacao_ok','Sim','carregamento_pago');
 const colunasTransporte={caminhao_ok:2,programar_caminhao:2,transportador_disponivel:3,buscar_freteiro:4,frete_aceito:5,reprogramar_frete:6};
 for(const [id,col] of Object.entries(colunasTransporte)){const n=nos.find(n=>n.id===id);n.fase='planejamento';n.col=col;}
 nos.find(n=>n.id==='escala_ok').col=1;nos.find(n=>n.id==='corrigir_escala').col=1;
 ajustar('reprogramar_frete','Cliente aceita reprogramar a entrega?','Propor um horário viável. Se o cliente não aceitar, ampliar a busca de freteiros, veículos, rotas e viagens, com o responsável da Logística. Não encaminhar automaticamente para cancelamento.');
 resposta('reprogramar_frete','Não','ampliar_busca_frete');
 novoPasso('planejamento','ampliar_busca_frete','logistica',7,'Ampliar busca de caminhão e motorista','Revisar a oferta de frete, divulgar o cadastro, consultar parceiros e avaliar veículos menores, múltiplas viagens ou reforço aprovado. Manter o cliente informado e o frete pendente até confirmar uma opção.','transportador_disponivel',painel);
 ajustar('prazo_producao','Há prazo e acordo para aguardar?','Confirmar um plano de cobrança e produção viável. Se não houver, o responsável Comercial e Financeiro precisa renegociar prazos e condições com o cliente; a produção continua bloqueada até o recebimento exigido.');
 resposta('prazo_producao','Não','supervisao_producao');
 novoPasso('planejamento','supervisao_producao','financeiro',13,'Escalar negociação financeira da produção','Acionar os responsáveis, propor nova programação e registrar o acordo. Não simular pagamento, iniciar sem liberação nem sugerir cancelamento por falta de alternativa imediata.','cobrar_producao',bancos);
 ajustar('aguardar_entrada','Há acordo de pagamento dentro do prazo?','Se houver acordo viável, acompanhar o recebimento. Caso contrário, escalar a negociação, rever a programação e preservar o bloqueio financeiro da Triagem.');
 resposta('aguardar_entrada','Não','supervisao_entrada');
 novoPasso('ida','supervisao_entrada','comercial',2,'Buscar acordo com Comercial e Financeiro','Registrar o contato, envolver o responsável e combinar condições e prazo compatíveis com a operação. A Triagem permanece bloqueada enquanto a regra financeira não for satisfeita.','receber_entrada');
 ajustar('prazo_saldo','Ainda é possível cumprir o combinado?','Se o prazo não for viável, envolver Comercial, Financeiro e Logística para propor outra solução. Manter a saída bloqueada até satisfazer a regra financeira.');
 resposta('prazo_saldo','Não','supervisao_saldo');
 novoPasso('ida','supervisao_saldo','comercial',19,'Renegociar pagamento e programação de saída','Acionar os responsáveis e o cliente para encontrar condições e programação viáveis. Nenhuma promessa substitui o recebimento confirmado. A dificuldade não induz ao cancelamento.','receber_saldo');
 ajustar('retirada_aceita','Cliente aceita retirar o item do pedido?','Apresentar o impacto e o ajuste de valor. Se o cliente não aceitar a retirada, consultar as reservas do mesmo item em outros pedidos e negociar alternativas com os respectivos clientes.');
 resposta('retirada_aceita','Não','item_outros_pedidos');
 novaDecisao('ida','item_outros_pedidos','comercial',16,'O mesmo item está em outros pedidos?','Consultar os pedidos do mesmo período, com cliente, quantidade e etapa. Exemplo: quatro unidades em um pedido e quatro em outro precisam de negociações independentes; nenhuma peça é transferida sem autorização.','contatar_outro_cliente','possivel_sublocar',sublocacoes);
 novoPasso('ida','contatar_outro_cliente','comercial',17,'Contatar o cliente do outro pedido','Oferecer uma troca ou retirada aprovada ao cliente da reserva consultada. Registrar a resposta e a quantidade que ele aceita liberar, preservando o combinado com os dois clientes.','outro_cliente_aceita');
 novaDecisao('ida','outro_cliente_aceita','cliente',18,'Esse cliente aceita liberar a quantidade?','Cada cliente decide sobre seu próprio pedido. Uma recusa leva à consulta da próxima reserva, sem retirar móveis silenciosamente.','formalizar_remanejamento','ha_mais_reservas');
 novoPasso('ida','formalizar_remanejamento','comercial',19,'Atualizar a reserva de origem com o aceite','Formalizar a troca ou retirada no outro pedido, ajustar valores e confirmar que o estoque foi liberado. Só então reservar a quantidade para o pedido que precisa dela.','saldo_remanejamento');
 novaDecisao('ida','saldo_remanejamento','estoque',20,'O saldo liberado atende toda a falta?','Somar apenas quantidades efetivamente liberadas, sem contar promessas ou o mesmo item duas vezes. Se ainda faltar, negociar com outros pedidos ou complementar com sublocação.','separar','ha_mais_reservas',triagem);
 novaDecisao('ida','ha_mais_reservas','comercial',21,'Ainda há outro pedido para consultar?','Percorrer os demais pedidos do período, registrando quem já foi consultado. Quando todos recusarem ou o saldo continuar insuficiente, verificar sublocação.','contatar_outro_cliente','possivel_sublocar',sublocacoes);
 novaDecisao('ida','possivel_sublocar','comercial',22,'É possível sublocar o item com outra empresa?','Consultar fornecedores, modelo, quantidade, condição, preço e período completo. A sublocação pode complementar só a quantidade que falta, sem aumentar o estoque próprio.','cotar_sublocacao','buscar_alternativa_responsavel',sublocacoes);
 novoPasso('ida','cotar_sublocacao','comercial',23,'Cotar sublocação com fornecedores','Registrar o fornecedor e a quantidade necessária no pedido, conferir retirada e devolução e negociar custo e logística. Uma cotação ainda não cobre a reserva.','fornecedor_confirmou',sublocacoes);
 novaDecisao('ida','fornecedor_confirmou','comercial',24,'Fornecedor confirmou as peças e o período?','Confirmar as condições com a empresa locadora antes de contar com a quantidade. Se recusar ou não tiver disponibilidade, ampliar a busca.','registrar_sublocacao','buscar_alternativa_responsavel',sublocacoes);
 novoPasso('ida','registrar_sublocacao','comercial',25,'Confirmar sublocação no pedido','Vincular item, fornecedor, quantidade, custo e datas. O pedido mantém a quantidade integral para o cliente; só a parte atendida pelo acervo consome estoque próprio.','sublocacao_recebida',sublocacoes);
 novaDecisao('ida','sublocacao_recebida','estoque',26,'As peças sublocadas foram recebidas e conferidas?','Conferir quantidade, modelo, estado e componentes. Registrar Recebida no controle; a Triagem não pode terminar com a sublocação confirmada ainda aguardando chegada.','separar','acompanhar_sublocacao',sublocacoes);
 novoPasso('ida','acompanhar_sublocacao','logistica',27,'Cobrar chegada ou buscar outro fornecedor','Confirmar o prazo de retirada e transporte. Se o fornecedor não cumprir, envolver o Comercial e buscar reposição; manter a pendência visível, sem dar a peça como recebida.','fornecedor_confirmou',sublocacoes);
 novoPasso('ida','buscar_alternativa_responsavel','comercial',28,'Escalar a busca de alternativas ao responsável','Ampliar fornecedores e regiões, revisar modelos e logística e retomar as negociações com os clientes. Registrar responsável e prazo; dificuldade de atendimento não é autorização de cancelamento.','nova_alternativa');
 novaDecisao('ida','nova_alternativa','comercial',29,'Há nova alternativa para apresentar?','Avaliar remanejamento autorizado, fornecedor adicional ou combinação de quantidades. Sem solução imediata, manter a pendência acompanhada e o cliente informado.','item_outros_pedidos','acompanhar_alternativa');
 novoPasso('ida','acompanhar_alternativa','comercial',30,'Acompanhar pendência e manter cliente informado','Registrar tentativas, responsável e próxima ação. Acionar novamente o responsável até obter uma alternativa viável; não retirar o item nem cancelar o pedido por decisão automática.','buscar_alternativa_responsavel');
 novoPasso('qualidade','devolver_sublocacao','estoque',6,'Conferir devolução das peças sublocadas','Separar as peças da empresa fornecedora, conferir quantidade e estado, registrar a devolução e tratar eventual custo de dano com os responsáveis. Não incorporar peças alugadas ao patrimônio próprio.','posicao_final',sublocacoes);
 for(const id of ['liberar_peca','baixar_peca'])ligar(id,'devolver_sublocacao');
 resposta('ha_avaria','Não','devolver_sublocacao');

 const primeiroUso=typeof module!=='undefined'?require('./fluxograma-primeiro-uso.js'):window.AcervoFluxoPrimeiroUso;
 primeiroUso.revisar(nos);
 function validarFluxo(lista=nos){
  const ids=new Map(lista.map(n=>[n.id,n]));if(ids.size!==lista.length)throw Error('IDs repetidos no fluxo.');
  for(const n of lista){
   if(!n.detalhe)throw Error('Etapa sem detalhe: '+n.id);
   if(n.tipo==='decisao'&&(n.saidas.length!==2||!n.saidas.some(s=>s.rotulo==='Sim')||!n.saidas.some(s=>s.rotulo==='Não')))throw Error('Decisão sem Sim/Não: '+n.id);
   if(n.tipo!=='fim'&&!n.saidas.length)throw Error('Etapa sem saída: '+n.id);
   for(const s of n.saidas)if(!ids.has(s.destino))throw Error('Destino inexistente: '+n.id+' → '+s.destino);
  }
  const vistos=new Set(),visitar=id=>{if(vistos.has(id))return;vistos.add(id);ids.get(id).saidas.forEach(s=>visitar(s.destino));};visitar('inicio');
  if(vistos.size!==lista.length)throw Error('Existem etapas isoladas.');
  const concluem=new Set(lista.filter(n=>n.tipo==='fim').map(n=>n.id));let mudou=true;
  while(mudou){mudou=false;for(const n of lista)if(!concluem.has(n.id)&&n.saidas.some(s=>concluem.has(s.destino))){concluem.add(n.id);mudou=true;}}
  if(concluem.size!==lista.length)throw Error('Existe caminho sem possibilidade de conclusão.');
  return {etapas:lista.length,decisoes:lista.filter(n=>n.tipo==='decisao').length,conexoes:lista.reduce((v,n)=>v+n.saidas.length,0)};
 }
 const roteador=typeof module!=='undefined'?require('./fluxograma-rotas.js'):window.AcervoFluxoRotas;
 const visaoSetores=typeof module!=='undefined'?require('./fluxograma-setores.js'):window.AcervoFluxoSetores;
 const api={nos,fases,setores,validarFluxo,ordemSetores:visaoSetores.ordem,resumirSetor:id=>visaoSetores.resumir(id,nos),planejarSetor:(id,largura)=>visaoSetores.planejar(id,nos,largura),planejarFase:id=>roteador.planejarFase(id,nos),planejarCompleto:()=>roteador.planejarCompleto(nos)};
 if(typeof module!=='undefined')module.exports=api;
 if(typeof document==='undefined')return;
 window.AcervoFluxoDetalhado=api;
 const guiaAreas=window.AcervoFluxoGuia;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const porId=new Map(nos.map(n=>[n.id,n]));
 for(const setor of api.ordemSetores)for(const n of api.resumirSetor(setor))porId.set(n.id,n);
 function desenharFase([id,titulo]){
  const plano=id==='unificado'?api.planejarCompleto():api.planejarFase(id),{largura,altura}=plano;
  const marcadores=['normal','sim','nao'].map(tipo=>'<marker id="fxg-seta-'+id+'-'+tipo+'" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 Z" fill="'+({normal:'#778694',sim:'#28825a',nao:'#b66a43'}[tipo])+'"/></marker>').join('');
  const conexoes=plano.rotas.map(r=>{
    const tipo=r.rotulo==='Sim'?'sim':r.rotulo==='Segue'?'normal':'nao';
    return '<g data-fxg-origem="'+r.origem+'" data-fxg-destino="'+r.destino+'"><path d="'+r.d+'" class="fxg-edge is-'+tipo+'" marker-end="url(#fxg-seta-'+id+'-'+tipo+')"/></g>';
  }).join('');
  const rotulos=plano.rotas.filter(r=>r.label).map(r=>'<g class="fxg-rotulo is-'+(r.rotulo==='Sim'?'sim':'nao')+'"><rect x="'+(r.label.x-5)+'" y="'+(r.label.y-17)+'" width="42" height="24" rx="5"/><text x="'+r.label.x+'" y="'+r.label.y+'" class="fxg-edge-label">'+esc(r.rotulo)+'</text></g>').join('');
  const caixas=plano.nos.map(n=>'<button type="button" class="fxg-node is-'+(n.portal?'portal':n.tipo)+'" data-fxg-id="'+n.id+'" '+(n.portal?'data-fxg-go="'+n.fase+'"':'')+' aria-label="'+esc(n.titulo)+'" style="left:'+n._fx.x+'px;top:'+n._fx.y+'px;--cor:'+setores[n.setor][1]+'">'+(n.tipo==='decisao'&&!n.portal?'<svg viewBox="0 0 200 100" aria-hidden="true"><polygon points="100,2 198,50 100,98 2,50"/></svg>':'')+'<span>'+(n.portal?'&#8599; ':'')+esc(n.titulo)+'</span>'+(n.portal?'<small>'+esc(fases.find(f=>f[0]===n.fase)[1])+'</small>':'')+'</button>').join('');
  return '<section class="fxg-fase" id="detalhe-'+id+'" aria-label="'+esc(titulo)+'"><div class="fxg-scroll"><div class="fxg-canvas" style="width:'+largura+'px;height:'+altura+'px"><svg class="fxg-linhas" width="'+largura+'" height="'+altura+'" aria-hidden="true"><defs>'+marcadores+'</defs>'+conexoes+rotulos+'</svg>'+caixas+'</div></div></section>';
 }
 function iniciar(){
  const host=document.getElementById('fxDetalhado');if(!host)return;
  const resumo=validarFluxo();
  host.innerHTML='<div class="fxg-controles" aria-label="Navegação e zoom do fluxograma"><div class="fxg-busca"><input type="search" data-fxg-busca aria-label="Buscar etapa do fluxograma" aria-controls="fxgResultados" placeholder="Buscar etapa…" autocomplete="off"><div id="fxgResultados" class="fxg-resultados" hidden></div></div><button type="button" data-fxg-menos aria-label="Diminuir zoom">&minus;</button><input type="range" min="25" max="150" step="5" value="100" data-fxg-zoom aria-label="Zoom"><output data-fxg-zoom-valor>100%</output><button type="button" data-fxg-mais aria-label="Aumentar zoom">+</button><button type="button" data-fxg-reset aria-label="Voltar ao inicio">&#8634;</button></div><div class="fxg-viewport" tabindex="0" aria-label="Arraste para explorar o fluxograma"><div class="fxg-mundo">'+desenharFase(['unificado','Fluxograma completo'])+'</div></div>';
  const viewport=host.querySelector('.fxg-viewport'),mundo=host.querySelector('.fxg-mundo'),controleZoom=host.querySelector('[data-fxg-zoom]');let escala=1;
  const htmlCompleto=mundo.innerHTML;let modoResumo=false,indiceSetor=0,indiceCapitulo=0,posicaoCompleta={x:0,y:0,zoom:100};
  const chaveEstudo='fluxograma:estudo:v1:'+(window.__CONTEXT?.empresa_id||'local')+':'+(window.__CONTEXT?.usuario_id||window.__CONTEXT?.user_id||'local');
  let estudados=new Set();try{const salvos=JSON.parse(localStorage.getItem(chaveEstudo)||'[]');if(Array.isArray(salvos))estudados=new Set(salvos.filter(x=>typeof x==='string'));}catch(_){}
  host.querySelector('.fxg-busca').insertAdjacentHTML('afterend','<button type="button" data-fxg-visao aria-label="Ver resumo por setor" title="Ver resumo por setor" aria-pressed="false"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg></button><div class="fxg-setor-nav" data-fxg-setores hidden><button type="button" data-fxg-anterior aria-label="Setor anterior">‹</button><output data-fxg-setor aria-live="polite"></output><button type="button" data-fxg-proximo aria-label="Próximo setor">›</button></div>');
  const alternar=host.querySelector('[data-fxg-visao]');alternar.setAttribute('aria-label','Estudar minha área');alternar.title='Estudar minha área';alternar.insertAdjacentHTML('beforeend','<span class="fxg-visao-legenda">Fluxograma completo</span>');
  function zoom(valor,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2){
    const anterior=escala;escala=Math.max(.25,Math.min(1.5,Number(valor)/100));
    const x=(viewport.scrollLeft+cx)/anterior,y=(viewport.scrollTop+cy)/anterior;
    mundo.style.zoom=escala;viewport.scrollLeft=x*escala-cx;viewport.scrollTop=y*escala-cy;
    controleZoom.value=Math.round(escala*100);host.querySelector('[data-fxg-zoom-valor]').textContent=Math.round(escala*100)+'%';
  }
  controleZoom.addEventListener('input',event=>zoom(event.target.value));
  host.querySelector('[data-fxg-menos]').onclick=()=>zoom(escala*100-10);
  host.querySelector('[data-fxg-mais]').onclick=()=>zoom(escala*100+10);
  host.querySelector('[data-fxg-reset]').onclick=()=>{zoom(100);viewport.scrollTo({left:0,top:0,behavior:'smooth'});};
  viewport.addEventListener('wheel',event=>{if(modoResumo||!event.ctrlKey)return;event.preventDefault();zoom(escala*100+(event.deltaY<0?5:-5),event.clientX,event.clientY);},{passive:false});
  const tooltip=document.createElement('aside');tooltip.id='fxgDetalhe';tooltip.className='fxg-tooltip';tooltip.hidden=true;tooltip.setAttribute('role','tooltip');document.body.append(tooltip);
  let fixo=false,atual=null,noAtual=null;
  function fechar(){fixo=false;tooltip.classList.remove('is-fixado');atual?.removeAttribute('aria-describedby');atual=null;noAtual=null;tooltip.hidden=true;}
  function fixar(){fixo=true;tooltip.classList.add('is-fixado');}
  function mostrar(botao,etapa){
   if(fixo&&atual!==botao)return;
   atual?.removeAttribute('aria-describedby');atual=botao;const n=etapa||porId.get(botao.dataset.fxgId);noAtual=n;botao.setAttribute('aria-describedby',tooltip.id);
   const permitido=!n.tela||!window.EasyLocPermissions?.canNavigate||window.EasyLocPermissions.canNavigate(new URL('../../../'+n.tela,location.href).href);
   const normalizar=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   const termos=Object.entries(primeiroUso.termos).filter(([termo])=>normalizar(n.titulo+' '+n.detalhe).includes(normalizar(termo))).slice(0,3);
   tooltip.innerHTML=`<button type="button" class="fxg-fechar" aria-label="Fechar detalhes">×</button><small>${esc(setores[n.setor][0])}</small><h3>${esc(n.titulo)}</h3><p>${esc(n.detalhe)}</p><dl class="fxg-instrucoes">${[['Quem faz',n.guia.quem],['Onde fazer',n.guia.onde],['Como conferir',n.guia.concluir],['Se não conseguir',n.guia.impedimento]].map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')}</dl>${termos.length?'<details class="fxg-glossario"><summary>Entenda os termos</summary>'+termos.map(([k,v])=>'<p><b>'+esc(k)+':</b> '+esc(v)+'</p>').join('')+'</details>':''}${n.saidas.map(s=>`<div class="fxg-destino"><b>${esc(s.rotulo)}</b><span>→ ${esc(porId.get(s.destino).titulo)}</span></div>`).join('')}${n.tela?`<button type="button" class="fxg-abrir" ${permitido?'':'disabled title="Você não tem acesso a esta tela"'}>Abrir tela desta etapa →</button>`:''}`;
   if(n.membros){
    tooltip.querySelector('h3').insertAdjacentHTML('afterend','<p class="fxg-resumo-quantidade">'+n.membros.length+' etapas · '+n.decisoes+' decisões'+(n.encaminhamentos.length?' · Encaminha para '+esc(n.encaminhamentos.map(s=>setores[s][0]).join(', ')):'')+'</p><div class="fxg-resumo-etapas">'+n.membros.map(id=>'<button type="button" data-fxg-membro="'+id+'">'+esc(porId.get(id).titulo)+'</button>').join('')+'</div>');
   }else if(botao.classList.contains('is-resumo'))tooltip.querySelector('h3').insertAdjacentHTML('beforebegin','<button type="button" class="fxg-voltar-resumo" data-fxg-voltar-resumo>← Voltar ao resumo do grupo</button>');
   tooltip.hidden=false;const r=botao.getBoundingClientRect();tooltip.style.left=Math.max(8,Math.min(innerWidth-tooltip.offsetWidth-12,r.left))+'px';tooltip.style.top=(r.bottom+tooltip.offsetHeight+8<=innerHeight?r.bottom+8:Math.max(8,r.top-tooltip.offsetHeight-8))+'px';
  }
  host.addEventListener('pointerover',e=>{const b=e.target.closest('[data-fxg-id]');if(b)mostrar(b);});
  document.addEventListener('pointerover',e=>{if(!fixo&&!e.target.closest('[data-fxg-id]')&&!tooltip.contains(e.target))fechar();});
  host.addEventListener('focusin',e=>{const b=e.target.closest('[data-fxg-id]');if(b)mostrar(b);});
  host.addEventListener('click',e=>{const b=e.target.closest('[data-fxg-id]');if(!b)return;if(b.dataset.fxgGo){fechar();document.querySelector('#detalhe-'+b.dataset.fxgGo+' [data-fxg-id="'+b.dataset.fxgId+'"]')?.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});return;}fixo=false;mostrar(b);fixar();});
  tooltip.addEventListener('click',e=>{
   const membro=e.target.closest('[data-fxg-membro]');
   if(membro&&atual){mostrar(atual,porId.get(membro.dataset.fxgMembro));fixar();return;}
   if(e.target.closest('[data-fxg-voltar-resumo]')&&atual){mostrar(atual);fixar();return;}
   if(e.target.closest('.fxg-fechar'))fechar();
   if(e.target.closest('.fxg-abrir')&&noAtual?.tela){const n=noAtual;if(window.EasyLocPermissions?.canNavigate&&!window.EasyLocPermissions.canNavigate(n.tela))return;const url=new URL('../../../'+n.tela,location.href);window.location.assign(url.href);}
  });
  const busca=host.querySelector('[data-fxg-busca]'),resultados=host.querySelector('#fxgResultados');
  const botaoVisao=host.querySelector('[data-fxg-visao]'),navegacaoSetor=host.querySelector('[data-fxg-setores]');
  function renderResumo(){
   fechar();resultados.hidden=true;busca.value='';busca.placeholder='Buscar na minha área…';
   const setor=api.ordemSetores[indiceSetor],grupos=api.resumirSetor(setor);indiceCapitulo=Math.max(0,Math.min(indiceCapitulo,grupos.length-1));
   mundo.innerHTML=guiaAreas.renderizar({setor,capitulo:indiceCapitulo,grupos,nos,setores,ordem:api.ordemSetores,estudados:[...estudados],termos:primeiroUso.termos,podeAbrir:n=>!n.tela||!window.EasyLocPermissions?.canNavigate||window.EasyLocPermissions.canNavigate(new URL('../../../'+n.tela,location.href).href)});
   mundo.classList.add('is-guia');host.classList.add('is-guia');viewport.setAttribute('aria-label','Guia de estudo da área');zoom(100);viewport.scrollTo({left:0,top:0});
   host.querySelector('[data-fxg-setor]').textContent=setores[setor][0]+' · '+(indiceSetor+1)+'/'+api.ordemSetores.length;
   host.querySelector('[data-fxg-anterior]').disabled=indiceSetor===0;host.querySelector('[data-fxg-proximo]').disabled=indiceSetor===api.ordemSetores.length-1;
  }
  botaoVisao.onclick=()=>{
   fechar();resultados.hidden=true;busca.value='';
   if(!modoResumo){posicaoCompleta={x:viewport.scrollLeft,y:viewport.scrollTop,zoom:escala*100};modoResumo=true;renderResumo();}
   else{modoResumo=false;mundo.classList.remove('is-guia');host.classList.remove('is-guia');mundo.innerHTML=htmlCompleto;zoom(posicaoCompleta.zoom);viewport.scrollTo({left:posicaoCompleta.x,top:posicaoCompleta.y});busca.placeholder='Buscar etapa…';viewport.setAttribute('aria-label','Arraste para explorar o fluxograma');}
   navegacaoSetor.hidden=true;botaoVisao.setAttribute('aria-pressed',String(modoResumo));
   const rotulo=modoResumo?'Ver fluxograma completo':'Estudar minha área';botaoVisao.setAttribute('aria-label',rotulo);botaoVisao.title=rotulo;
  };
  host.querySelector('[data-fxg-anterior]').onclick=()=>{if(indiceSetor>0){indiceSetor--;renderResumo();}};
  host.querySelector('[data-fxg-proximo]').onclick=()=>{if(indiceSetor+1<api.ordemSetores.length){indiceSetor++;renderResumo();}};
  function irParaEtapa(id){
   const n=porId.get(id);if(!n)return;const setor=api.ordemSetores.indexOf(n.setor);if(setor<0)return;
   indiceSetor=setor;indiceCapitulo=api.resumirSetor(n.setor).findIndex(g=>g.membros.includes(id));renderResumo();
   const artigo=document.getElementById('estudo-'+id);artigo?.focus({preventScroll:true});artigo?.scrollIntoView({block:'start',behavior:'smooth'});
  }
  host.addEventListener('change',e=>{if(!modoResumo||!e.target.matches('[data-fxg-guia-area]'))return;const i=api.ordemSetores.indexOf(e.target.value);if(i<0)return;indiceSetor=i;indiceCapitulo=0;renderResumo();host.querySelector('[data-fxg-guia-area]')?.focus({preventScroll:true});});
  host.addEventListener('click',e=>{
   if(!modoResumo)return;const cap=e.target.closest('[data-fxg-guia-capitulo]'),ir=e.target.closest('[data-fxg-guia-ir]'),abrir=e.target.closest('[data-fxg-guia-abrir]'),lido=e.target.closest('[data-fxg-guia-estudado]');
   if(cap){indiceCapitulo=Number(cap.dataset.fxgGuiaCapitulo);renderResumo();}
   if(e.target.closest('[data-fxg-guia-anterior]')&&indiceCapitulo>0){indiceCapitulo--;renderResumo();}
   if(e.target.closest('[data-fxg-guia-proximo]')&&indiceCapitulo+1<api.resumirSetor(api.ordemSetores[indiceSetor]).length){indiceCapitulo++;renderResumo();}
   if(e.target.closest('[data-fxg-guia-proxima-area]')){indiceSetor=(indiceSetor+1)%api.ordemSetores.length;indiceCapitulo=0;renderResumo();}
   if(ir)irParaEtapa(ir.dataset.fxgGuiaIr);
   if(abrir){const n=porId.get(abrir.dataset.fxgGuiaAbrir);if(n?.tela&&(!window.EasyLocPermissions?.canNavigate||window.EasyLocPermissions.canNavigate(new URL('../../../'+n.tela,location.href).href)))window.location.assign(new URL('../../../'+n.tela,location.href).href);}
   if(lido){const id=lido.dataset.fxgGuiaEstudado,y=viewport.scrollTop;if(estudados.has(id))estudados.delete(id);else estudados.add(id);try{localStorage.setItem(chaveEstudo,JSON.stringify([...estudados]));}catch(_){}renderResumo();viewport.scrollTop=y;}
  });
  const normalizarBusca=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  busca.addEventListener('input',()=>{
   const termo=normalizarBusca(busca.value);resultados.hidden=!termo;if(!termo){resultados.replaceChildren();return;}
   const encontrados=nos.filter(n=>(!modoResumo||n.setor===api.ordemSetores[indiceSetor])&&normalizarBusca(n.titulo+' '+n.guia.onde).includes(termo));
   resultados.innerHTML=encontrados.length?encontrados.slice(0,8).map(n=>'<button type="button" data-fxg-localizar="'+n.id+'">'+esc(n.titulo)+'</button>').join(''):'<p role="status">Nenhuma etapa encontrada.</p>';
  });
  resultados.addEventListener('click',e=>{
   const id=e.target.closest('[data-fxg-localizar]')?.dataset.fxgLocalizar;if(!id)return;
   if(modoResumo){irParaEtapa(id);return;}
   const grupo=modoResumo?api.resumirSetor(api.ordemSetores[indiceSetor]).find(n=>n.membros.includes(id)):null;
   const b=host.querySelector('[data-fxg-id="'+(grupo?.id||id)+'"]');if(!b)return;
   fechar();resultados.hidden=true;zoom(100);viewport.scrollTo({left:Math.max(0,b.offsetLeft+48-viewport.clientWidth/2+b.offsetWidth/2),top:Math.max(0,b.offsetTop+80-viewport.clientHeight/2+b.offsetHeight/2)});
   b.focus({preventScroll:true});mostrar(b,grupo?porId.get(id):null);fixar();
  });
  busca.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();resultados.querySelector('button')?.focus();}});
  resultados.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();e.target.nextElementSibling?.focus();}if(e.key==='ArrowUp'){e.preventDefault();(e.target.previousElementSibling||busca).focus();}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){resultados.hidden=true;fechar();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();busca.focus();busca.select();}});
  window.addEventListener('resize',fechar);document.addEventListener('scroll',()=>{if(!fixo)requestAnimationFrame(()=>{if(fixo)return;const b=host.querySelector('[data-fxg-id]:hover')||host.querySelector('[data-fxg-id]:focus');if(b)mostrar(b);else fechar();});},true);
  let arraste=null,bloquearClique=false;
  viewport.addEventListener('pointerdown',event=>{if(modoResumo||event.button!==0)return;event.preventDefault();viewport.setPointerCapture(event.pointerId);arraste={id:event.pointerId,x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,moveu:false,botao:event.target.closest('[data-fxg-id]')};});
  viewport.addEventListener('pointermove',event=>{
    if(!arraste||arraste.id!==event.pointerId)return;
    const dx=event.clientX-arraste.x,dy=event.clientY-arraste.y;
    if(!arraste.moveu&&Math.hypot(dx,dy)<5)return;
    arraste.moveu=true;viewport.setPointerCapture(event.pointerId);viewport.classList.add('is-arrastando');fechar();
    viewport.scrollLeft=arraste.left-dx;viewport.scrollTop=arraste.top-dy;event.preventDefault();
  });
  function soltar(event){if(!arraste||arraste.id!==event.pointerId)return;const clique=!arraste.moveu&&event.type==='pointerup'?arraste.botao:null;bloquearClique=arraste.moveu;arraste=null;viewport.classList.remove('is-arrastando');if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);if(clique)clique.click();}
  viewport.addEventListener('pointerup',soltar);viewport.addEventListener('pointercancel',soltar);
  viewport.addEventListener('click',event=>{if(bloquearClique){bloquearClique=false;event.preventDefault();event.stopImmediatePropagation();}},true);

 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();
