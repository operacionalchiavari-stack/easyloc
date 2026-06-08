# EasyLoc UI Globals

Esta pasta guarda a base visual compartilhada do sistema. A migracao deve ser gradual: primeiro os modulos continuam com seus CSS atuais, depois cada tela passa a usar estes padroes e so entao os estilos duplicados sao removidos.

## Arquivos

- `global.css`: ponto unico para carregar todos os estilos globais.
- `tokens.css`: cores, fontes, raios, sombras e espacamentos.
- `base.css`: reset leve e regras base.
- `buttons.css`: botoes padrao (`.btn`, `.btn.primary`, `.btn.secondary`, `.btn-icon`).
- `forms.css`: campos, labels e grids de formulario (`.el-field`, `.el-input`, `.el-form-grid`).
- `modals.css`: modal base e alerta global.
- `layout.css`: helpers de pagina, cards e acoes.
- `tables.css`: tabela padrao global, cabecalho azul, hover e espacamento.
- `cards.css`: cards e cards de resumo padronizados.
- `module-overrides.css`: reforco carregado apos o CSS do modulo para manter o padrao visual durante a migracao.

## Padroes principais

- Cores oficiais: use `--el-color-primary` para azul e `--el-color-accent` para laranja.
- Botoes: use `.btn primary` para salvar/confirmar, `.btn secondary` para cancelar/voltar e `.btn danger` para excluir/sair. Tambem existem aliases como `.btn salvar`, `.btn cancelar`, `.btn sair`, `.btn-save`, `.btn-cancel` e `.btn-sair`.
- Campos: use `.el-input`, `.el-select`, `.el-textarea` ou deixe o campo dentro de `.el-page`; o foco laranja sera aplicado.
- Tabelas: use `.el-table-wrap` em volta da tabela quando possivel. Tabelas dentro do `#main-content` tambem recebem o padrao global.
- Cards: use `.el-card` para cards novos. Cards antigos como `.card-resumo` tambem sao normalizados.
- Modais: use `.el-modal` no fundo e `.el-modal__box` na caixa. O escurecimento e blur do fundo vem de `--el-modal-backdrop` e `--el-modal-backdrop-blur`.

## Regra de migracao

1. Nao apagar CSS antigo antes de testar a tela.
2. Trocar classes duplicadas por classes globais aos poucos.
3. Validar botoes, modais, alerta, salvar/cancelar e responsivo.
4. Remover do CSS do modulo apenas o que ja estiver coberto pelos globais.
