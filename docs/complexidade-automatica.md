# Complexidade automática dos pedidos

O painel conserva as cinco visões (Estofados, Pintura, Montagem, Triagem e Carregamento). As 26 respostas passam a vir do pedido, dos cadastros e do planejamento, com origem e explicação. A atualização ocorre a cada consulta; o painel aberto atualiza a cada minuto, sem escrever na antiga Matriz.

## Fontes e regras

- Cliente: reclamação operacional informada no cadastro. Recorrência e primeiro pedido consideram os pedidos aprovados, enviados ou finalizados anteriores, vinculados pelo ID do cliente. Exclusividade fica registrada separadamente e não é confundida com recorrência.
- Local: baldeação, escada no trajeto e distância de transporte manual. Etiquetas positivas anteriores continuam sendo aproveitadas. Uma ausência de etiqueta não equivale a Não. Um valor explícito no cadastro prevalece sobre etiquetas.
- Itens e componentes: contagem física sem duplicar kit e componentes; fragilidade, manuseio volumoso e fabricação sob medida. Materiais vidro, espelho ou laca sugerem fragilidade; uma classificação explícita prevalece. Grupo/família/categoria identifica a família da peça, sem inferir pintura pela cor.
- Personalizações: peças e quantidades dos ambientes. Usa os setores das etapas de produção vinculadas ao pedido, quando disponíveis; senão, as etapas configuradas na personalização. Serviços sem setor definido permanecem pendentes. Uma revisão de produção ainda não autorizada também fica pendente.
- Cronograma: data e horário de carregamento, montagem e caminhões distintos da entrega. Viagens são um planejamento próprio e não são deduzidas do número de caminhões.
- Antecedência: horário registrado do primeiro pagamento não estornado ou confirmação autorizada da pré-reserva, comparado ao início previsto da montagem. A criação do pedido não é tratada como confirmação.

Os limites, expediente, tipos especiais de evento, grupos volumosos e pesos ficam em Parâmetros > Comercial. Os defaults mantêm os pesos anteriores; a pontuação é dividida pelo máximo possível do setor para garantir 0 a 100%. A pergunta de proximidade do caminhão foi substituída por transporte manual acima da distância de referência (inicialmente 50 metros).

## Pendências, exceções e fechamento

O setor pode estar completo, pendente ou não se aplicar. Estofados/Pintura sem serviço solicitado não se aplicam. Condições desconhecidas não recebem Não por omissão. Quando há uma avaliação manual anterior positiva, ela permanece identificada como "anterior" até as fontes estarem completas. Setores pendentes sem avaliação anterior e setores sem serviço ficam fora das médias e não geram bônus automático. Os registros manuais legados conservam o comportamento anterior de score padrão na Central.

No pedido, podem ser informadas viagens, confirmação autorizada e necessidade de montagem. Exceções por pergunta exigem motivo, permissão e 2FA; ficam auditadas com autor e data. Escolher "Usar automático" remove a exceção. Esses ajustes não alteram o cadastro do cliente/local/item.

Ao encerrar operacionalmente ou marcar o pedido como finalizado, o banco congela o contexto completo: dados, respostas de exceção e parâmetros. Cadastros e pesos alterados depois não afetam o contexto congelado. Uma reabertura não apaga esse histórico automaticamente.

## Compatibilidade e segurança

A antiga Matriz não é sobrescrita. Para pedidos em aberto com vínculo único pelo número, o cálculo atual substitui a linha na leitura e o painel permite consultar a avaliação manual anterior. Históricos antigos já encerrados continuam vindo da Matriz. Números repetidos são sinalizados e os novos vínculos ambíguos não entram na projeção financeira.

O motor e o painel compartilham o mesmo cálculo. A Central de Metas recebe a mesma projeção de respostas e scores. As consultas de contexto são exclusivas do servidor e isoladas por empresa; não retornam CPF, telefone ou email. Exceções, parâmetros e cadastros passam por validação no banco.

## Verificação

`npm run test:complexidade` cobre cálculo, fontes ausentes, condições explícitas, setores, quantidade por ambiente/kit, normalização, compatibilidade, permissões, 2FA, auditoria, congelamento e interface em celular/desktop.
