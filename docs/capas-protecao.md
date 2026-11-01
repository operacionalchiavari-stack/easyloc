# Material de proteção: capas e caixas

No cadastro do item, selecione Não utiliza, Capa ou Caixa. O nome é gerado automaticamente como "Capa " ou "Caixa " seguido do nome do item e não permite edição livre. O tipo padrão dos registros anteriores é Capa; saldos, IDs e históricos permanecem preservados. Os nomes internos de tabelas e funções capas_* foram mantidos por compatibilidade.

O módulo tem as abas Materiais, Fabricações e Conferências. Nas duas últimas, a coluna esquerda pesquisa e seleciona itens com sua foto principal (ou foto da galeria sem cliente); a direita apresenta os registros. Se o item não tiver foto, mostra Sem foto.

# Capas de proteção: contagem e estoque

Cada linha da Triagem da ida e da Conferência de carregamento, descarregamento e Triagem da volta tem uma contagem de capas independente da quantidade de móveis. A digitação é manual; não utiliza o QR dos móveis para contar capas. As capas nas sacolas do montador também fazem parte do total devolvido, sem contar a própria sacola como capa.

## Configuração

Em Estoque > Capas de proteção, **Configurar item** informa se o modelo físico utiliza capa, quantas unidades do item cabem em cada capa e o nome do modelo de capa. O Cadastro de Itens também oferece acesso a essa configuração. Kits utilizam a configuração dos seus componentes físicos, evitando contar o kit e seus componentes duas vezes.

O previsto na ida é `arredondar para cima(quantidade física total do modelo no pedido / unidades por capa)`. Linhas repetidas do mesmo modelo, inclusive componentes de kits, compartilham uma contagem por modelo e pedido. Por exemplo: cinco cadeiras e duas unidades por capa exigem três capas. Pedidos extras têm sua própria saída; na volta, aparecem no pedido principal e conservam o vínculo com o extra.

**Não cadastrada** indica ausência de configuração; **Sem capa** é uma decisão explícita no cadastro. Dados antigos não são presumidos. A ausência de uma configuração não cria estoque ou uma fabricação fictícia, nem torna pedidos antigos impossíveis de concluir. Para um modelo configurado com capa, a equipe precisa registrar uma contagem, inclusive zero quando não houver.

## Conferência e rastreabilidade

- A quantidade de peças e a de capas são independentes. A leitura do QR de um móvel não marca sua capa.
- As capas danificadas são uma parte do total contado, nunca uma quantidade adicional. Uma observação pode acompanhar a contagem.
- Contagens são salvas por modelo e etapa, com usuário, horário e versões anteriores no histórico. Mudanças simultâneas na mesma contagem são rejeitadas para não sobrescrever a conferência de outra pessoa.
- Falta, sobra ou dano de capa não impedem concluir uma etapa após informar a contagem. As exigências existentes para os móveis permanecem no fluxo original.
- Na volta, o esperado é a quantidade de capas **efetivamente enviada no carregamento**, e não o previsto do cadastro. A tela distingue o que já saiu incompleto do que deixou de voltar. Uma saída anterior sem registro permanece identificada dessa forma; não é tratada como envio de zero capas.
- Conferências às cegas ocultam o esperado e a contagem de saída até concluir, também para capas.
- O modelo e a capacidade usados na saída ficam preservados para o retorno, mesmo quando a configuração do cadastro muda.
- Conclusão e reabertura da etapa atualizam as contagens na mesma transação do pedido. Conferências salvas como rascunho não movimentam o saldo.

## Saldo e fabricação

O estoque é separado dos móveis. Uma fabricação registra quantidade, data efetiva e descrição. A data de **Última fabricação** vem somente desses registros. Uma contagem inicial informa as capas boas disponíveis agora no galpão e registra um ajuste auditado, sem inventar a data de produção das capas existentes.

O carregamento concluído retira as capas do disponível. O descarregamento registra uma conferência independente e não duplica a entrada. A Triagem da volta concluída devolve as capas boas ao disponível e encaminha as danificadas à manutenção. O painel exibe as capas disponíveis, em pedidos, em manutenção e os modelos cujo estoque inicial ainda precisa ser conferido. Saldo negativo é sinalizado para conferência; não existe entrada automática para encobrir diferenças.

O controle permite enviar capas à manutenção, registrar retorno de reparo, perda no galpão e perda na manutenção. Uma falta após a devolução pode ser confirmada como perda pelo histórico do pedido; essa confirmação reduz as capas ainda atribuídas ao pedido e **não desconta novamente o disponível**, pois a saída já ocorreu no carregamento.

Movimentações têm chave de idempotência para impedir duplicação em reenvios. Todas as consultas são isoladas por empresa; configuração e movimentação exigem edição de itens ou administração. Contagens seguem a permissão da etapa e, na Triagem, a restrição dos setores do separador. As tabelas não permitem gravação direta pelo navegador. As regras existentes de acesso e 2FA são verificadas no servidor.

## Validação

`node --test tests/capas-protecao-db.test.cjs` executa a migração em PostgreSQL local e cobre capacidade, componentes reais de kits, extras, quatro etapas, saldo, danos, fabricação, perdas, idempotência, histórico e permissões. `node tests/capas-protecao-browser.cjs` verifica a digitação, comparação após a volta, condição, configuração e inventário em celular e computador. Os testes de bipagem e de separação de componentes verificam a continuidade do fluxo de móveis.
