# Foto da equipe e indicadores de Montagem

O responsável pela etapa envia a foto pelo `Cronograma/montador.html`. O envio exige sessão do responsável (ou supervisor), foto e GPS atual com precisão de até 100 metros. A chegada usa o instante em que o servidor recebe a chamada, antes do upload da foto, e o horário da etapa em São Paulo. O primeiro envio permanece registrado; repetição não substitui a chegada.

A tabela `EquipeTerceirizada` mantém as colunas antigas e acrescenta: P horário previsto preservado, Q minutos de atraso, R situação da localização, S avaliador RH, T data da avaliação, U versão do registro e V responsável pelo envio. O uniforme continua em O, inicialmente pendente. A função de avaliação exige permissão de edição do RH e registra o avaliador. A conferência fica no resumo da montagem no Cronograma, junto à foto e ao link do GPS.

Até 300 metros das coordenadas do evento, o envio fica “No local”. Fora desse raio, ou se o evento não tiver coordenadas, o registro fica sinalizado para conferência; a localização enviada não equivale a uma prova absoluta de presença. Negar GPS impede o envio. A localização só é solicitada no envio, sem rastreamento contínuo.

Na Central, “Sem uniforme” conta uma etapa explicitamente marcada pelo RH como não uniformizada. “Atraso” conta uma etapa cujo envio ocorreu após o horário previsto: 08:00 previsto e 08:20 recebido representam um atraso, de 20 minutos. Montagem e desmontagem entram pelo mês da etapa. Esses dois indicadores ignoram Ocorrências Operacionais; os demais continuam com suas fontes anteriores. Os limites existentes das duas posições são preservados.

Fotos sem avaliação e etapas vencidas sem foto ficam pendentes, sem inventar uma falta de uniforme ou um atraso. Conferências pendentes impedem aprovar a meta da equipe. Envios anteriores à mudança não recebem GPS ou horário previsto retroativamente: aparecem como pendentes de verificação de horário. O indicador de danos e seus descontos seguem o fluxo de ciência individual já existente.

Validação: `node --test tests/montagem-chegada.test.cjs tests/rh-cadastro-ciencia.test.cjs` e `node tests/montador-chegada-browser.cjs`.

## Apontamento do evento

O app volta ao cronograma pessoal, com Próximas e Anteriores, sem a busca e os filtros adicionais. Ao abrir uma etapa de montagem/desmontagem, o responsável toca em “Iniciar evento”. O servidor grava início e evento na aba `Montador_Apontamentos`; um responsável só pode manter um apontamento ativo. Repetir o início da mesma etapa devolve o registro existente e não reinicia o tempo.

Foto da equipe, Avarias e Checklist são páginas completas da navegação inferior. Elas usam o evento ativo, sem uma nova escolha de evento. Sem apontamento, mostram a orientação para iniciar pelo cronograma. O contexto é restaurado do servidor ao reabrir o app; o cronômetro é calculado a partir do início persistido. Trocar de aba, inclusive voltar ao cronograma, preserva o formulário enquanto a página permanecer aberta.

Os envios de foto e avaria validam no servidor o apontamento ativo e seu ID, rejeitando um formulário de evento encerrado ou diferente. A foto mantém esse vínculo na coluna W de `EquipeTerceirizada`; a solicitação de avaria/troca, na coluna U de `Montagem_Trocas`. “Encerrar apontamento” salva o fim no servidor; a conclusão operacional da desmontagem mantém seu checklist próprio. O atraso da Central continua usando o horário de envio da foto, separado do início do apontamento.

Validação adicional: `node --test tests/montador-apontamento.test.cjs`.

## Pedido, equipe e mapa

A tela do pedido destaca dia e horário, traz atalhos de mapa e equipe e mostra os freelancers confirmados com a miniatura do cadastro (`Free_Fotos`, por ID do free). A foto pode ser ampliada no app. Quando não há foto cadastrada, o cartão mostra a inicial e informa a ausência da foto. A equipe aparece tanto nos dados do pedido quanto na aba de foto da equipe.

`montador-mapa.js` usa a integração Google Maps do sistema para mostrar o destino, traçar a rota a partir do GPS e apresentar tempo, distância e instruções, sem exigir abrir outro aplicativo. A posição é acompanhada somente enquanto o mapa está aberto; fechar a janela encerra o acompanhamento. GPS negado mantém o mapa de consulta. Falha no carregamento do SDK usa o mapa incorporado como consulta e informa que a rota está indisponível nesse modo.

Validação: `tests/montador-equipe-fotos.test.cjs` e teste de navegador com foto ampliada, rota, GPS negado e encerramento do acompanhamento. A integração real do Google também foi verificada com destino e posição de teste em São Paulo.
