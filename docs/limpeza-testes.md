# Organização dos testes — 25/10/2026

Os testes essenciais foram preservados. Nenhum pedido, pagamento, dano ou movimento de estoque real foi apagado nesta limpeza.

## Como executar

- `npm test`: verificações de preparação e ciclo central de operação, estoque, manutenção, qualidade, financeiro e permissões.
- `npm run test:completo`: integridade de código e recursos, seguida de todos os testes locais ativos. Usa dados simulados e bancos isolados; não habilita testes de produção.
- `npm run test:catalogo`: motor e interfaces atuais do catálogo e editor.
- `npm run test:operacao`: integração e telas de operação.

A revisão completa registra um log por arquivo e o resultado em `.tmp/auditoria-final/resultado.json`. Para preservar uma execução anterior, definir `AUDITORIA_DIR` com outro nome antes de executar. Uma falha mantém a saída do comando com erro; não há exclusão automática de testes que falharam.

## Testes antigos retirados

| Arquivo | Motivo e cobertura atual |
|---|---|
| `catalogo-mosaico-browser.cjs` | Seletor de mosaico removido da aplicação. A navegação atual é verificada em `catalogo-nav-history-browser.cjs`. |
| `menu-monograma-browser.cjs` | Menu lateral antigo substituído pelo cabeçalho horizontal. Cobertura atual em `portal-layout-browser.cjs`. |
| `design-system-browser.cjs` | Exigia o arquivo removido `navigation-v2`. Navegação atual e tema possuem testes próprios. |
| `catalogo-layout-browser.cjs` | Extraía um modelo de página que foi removido. Layout e retorno atuais têm testes de interface. |
| `catalogo-voltar-browser.cjs` | Diagnóstico de visualizações removidas. Retorno atual coberto por `catalogo-nav-history-browser.cjs`. |
| `central-ver-pedido-browser.cjs` | Botão “Visualizar pedido” removido por solicitação. Lista e abertura atuais cobertas por `central-projetos-catalogo-browser.cjs`. |
| `studio-browser.cjs` | Verificava a interface removida de projetos locais do Studio. Editor, formatos, projetos e salvamento possuem testes atuais separados. |

Foi acrescentado `portal-layout-browser.cjs`. Assim, os 133 arquivos anteriores passaram a 127 arquivos ativos: sete retirados e um novo. Remoções não são contabilizadas como aprovações.

## Atualizações e correções

Os testes foram adaptados às filas atuais, aos uploads assinados, às abas atuais, às datas controladas e ao fluxo de projetos. Foram preservadas as verificações de quantidades, componentes de kits, permissões, salvamento, retorno, impressão e falhas de upload.

Defeitos corrigidos na aplicação durante a revisão: geração de variação de tecido recebia o evento do clique como argumento; busca podia sobrepor os filtros do catálogo; um texto de preço estava pequeno; páginas que carregavam apenas `moduleTheme.js` não recebiam todas as atualizações do tema da empresa.

Os testes de interface usam respostas simuladas para serviços externos, inclusive IA. Eles não comprovam disponibilidade, saldo ou funcionamento de provedores externos reais. Esta limpeza não publica alterações nem substitui o acompanhamento inicial da equipe em produção.
