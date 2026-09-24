# Acervo — Contexto do projeto

Sistema de gestão para a Chiavari (móveis para eventos): cadastros, locação,
logística, financeiro e catálogo do cliente. Stack: HTML, CSS, JS puro (sem
build tool, sem framework), Supabase (Postgres + PostgREST), hospedado no
GitHub Pages (repo `operacionalchiavari-stack/easyloc`, branch `main`, **sem
CNAME** — a URL de produção fica num subcaminho, então todo link/import novo
precisa ser relativo, nunca começar com `/`).

## Arquitetura (migração em andamento)

O sistema está no meio de uma reforma: de SPA único para shell+iframe
(inspirado no projeto Tecnoweld). As duas formas convivem hoje — ver o
relatório completo publicado em
https://claude.ai/code/artifact/89c9611e-ebb4-418c-9bee-3f22f0de38b9
("Anatomia do Acervo") para o detalhamento com trechos de código.

Resumo:

- `login.html` → confere e-mail/senha, vínculo com empresa e assinatura
  ativa no Supabase, grava `sessionStorage.login_ok`/`empresa_id`/
  `usuario_nome`, manda para `dashboard.html`.
- `dashboard.html` é o shell fixo (menu, logo, cabeçalho) — nunca recarrega
  enquanto o usuário navega. Hoje tem ~340 linhas (era ~2.600): o CSS que
  ficava inline num bloco `<style>` de ~1.800 linhas foi extraído para
  `styles/shell.css`, e o menu (que era ~325 linhas de HTML escrito à mão)
  agora é gerado por `js/ui/sidebarMenu.js` a partir de uma lista de dados
  (`window.ACERVO_MENU`) — ver "Menu lateral" abaixo.
- **Menu lateral é dado, não HTML.** `js/ui/sidebarMenu.js` define
  `ACERVO_MENU.categorias` (cada categoria com `itens`, que podem ter
  `href` — tela nova, `legado:{html,js,css}` — tela antiga, ou `grupo` —
  submenu aninhado) e `ACERVO_MENU.favoritos`, e desenha tudo dentro de
  `<nav id="appMenu">`/`<div id="appFavoritos">` em `dashboard.html`. Para
  **adicionar, remover ou mudar um item de menu, editar só esse arquivo** —
  nunca mexer em HTML de menu direto no `dashboard.html` (não existe mais).
  Um item com `oculto: true` continua na lista (nada se perde) mas não é
  desenhado — era assim que os módulos "escondidos a pedido" funcionavam
  antes (dentro de comentário HTML `<!-- -->`), só que agora é um campo,
  não um comentário.
- **Dois motores de navegação existem, mas só um está em uso.** Não são
  intercambiáveis, cada tela usa só um; hoje **nenhum item visível do menu
  usa mais o motor antigo** — todo item com `oculto:false` no
  `ACERVO_MENU` tem `href` (motor novo). `js/core/moduleLoader.js`
  continua carregado (é o que faria os itens `legado` funcionarem se algum
  dia um deles virar `oculto:false` sem ainda ter sido convertido para o
  modelo novo), mas não é chamado por nada visível hoje — antes de
  considerar removê-lo, confirmar de novo que nenhum item deixou de estar
  oculto.
  - **Antigo** — `js/core/moduleLoader.js`, função `carregarNaMain()`. Busca
    um *fragmento* de HTML (sem `<html>/<head>` próprios) e cola dentro de
    `<div id="main-content">` com `innerHTML`. Roda no mesmo documento do
    shell — CSS/JS de módulos diferentes podem colidir entre si.
  - **Novo** — `js/core/appShell.js`, função `shellNavigate()`. Cada tela é
    um `.html` completo e independente, carregado dentro de
    `<iframe id="appModuleFrame">`. Sem risco de vazamento de CSS/JS entre
    telas (documento novo a cada troca).
  - `window.__activarMainContentLegado()` garante que só um dos dois
    apareça por vez.
- `js/core/context.js` monta `window.__CONTEXT` (empresa_id, usuario_id,
  usuario_nome, empresa_nome) de forma assíncrona e dispara o evento
  `easyloc:context-ready`. **Como cada tela nova é um documento próprio, o
  script dela pode rodar antes do contexto estar pronto** — por isso existe
  `window.aguardarContexto()`, que qualquer código que precise de
  `empresa_id` deve usar (`await window.aguardarContexto()`) em vez de ler
  `window.__CONTEXT` direto. Bug real já causado por ignorar isso: Clientes,
  Fornecedores e Caminhões carregavam lista vazia de forma intermitente.
- `styles/global.css` importa, nesta ordem: `tokens → base → buttons →
  forms → modals → layout → tables → cards → paymentPix → design-system`.
  Toda tela nova carrega esse bundle + o CSS próprio dela.
- `styles/design-system.css` guarda componentes compartilhados entre
  módulos (ex.: sistema `.el-detail-*` das telas de cadastro em
  formato "tela cheia", grade de 12 colunas). **Risco conhecido**: uma
  classe usada só por um módulo pode ter o mesmo nome de uma regra "geral"
  aqui dentro — a regra geral, com `!important`, vence silenciosamente. Já
  aconteceu com `.os-modal-box` e `.almox-modal-card`. Ao investigar "eu
  mudei o CSS e não fez efeito", sempre considerar que a regra que
  realmente vale pode estar em outro arquivo (aconteceu com o espaçamento
  do menu: parecia estar em `dashboard.html`, mas quem mandava de verdade
  era `styles/navigation-v2.css`, com `!important` e `@media(min-width:1201px)`)
  — **confirmar com o navegador renderizado (Playwright/DevTools,
  `getComputedStyle`), não só lendo o código-fonte**, antes de concluir que
  uma correção não teve efeito.

## Catálogo — dois jeitos de entrar

O Catálogo (`Modulos/Comercial/Catalogo/catalogo.html`, `catalogo.mjs`) tem
**dois modos de acesso completamente diferentes**, controlados por
`acessoInternoDoSistema()` (checa `sessionStorage.login_ok`):

- **Cliente externo** (link enviado a um decorador, sem `login_ok`): mostra
  a tela de login do catálogo (`requireCatalogLogin()`, RPC
  `catalogo_login` com e-mail/senha do cliente) e carrega os itens via RPC
  `catalogo_carregar` com o token daquele cliente — catálogo personalizado
  por decorador (`state.decorator`, fotos de galeria filtradas por
  `cliente_id`).
- **Equipe interna** (aberto pelo menu do próprio sistema, já logada em
  `login.html`, `login_ok` presente): pula o login inteiro, resolve
  `empresa_id` via `getEmpresaAtualId()` (mesma sessão Supabase da equipe)
  e mostra o catálogo padrão da empresa — todos os itens ativos
  (`exibir_no_site=true`), sem personalização de nenhum decorador
  específico (`state.decorator` fica `null`, o selo "CATÁLOGO DE..." não
  aparece). Esse caminho já existia parcialmente no código antes
  (`carregarItens()` sempre teve um branch "sem token" usando
  `getEmpresaAtualId()`) — só faltava um jeito de chegar nele sem passar
  pelo login.

**Não misturar os dois**: nunca usar o login do cliente pra deduzir
`empresa_id` da equipe, nem pular o login do cliente externo (ele não tem
`login_ok`, então a checagem já é segura por natureza — mas não trocar
essa checagem por algo mais frouxo). Item de menu fica em categoria
própria "Catálogo" no `sidebarMenu.js`, separada de "Cadastros" (pedido
explícito do usuário — não colocar de volta dentro de Cadastros).

**Visual também muda entre os dois modos** (`catalogo.css`): quando
`acessoInternoDoSistema()` é verdadeiro, `catalogo.mjs` adiciona a classe
`catalog-modo-sistema` no `<body>`. Essa classe esconde `.catalog-brand`
(logo/nome — o dashboard já tem o dele) e `.catalog-user` (selo "CATÁLOGO
DE...", nem apareceria mesmo, mas por clareza), e o cabeçalho vira uma
faixa clara e simples só com as categorias como abas — pedido explícito do
usuário pra não parecer "menu dentro de menu" quando aberto pelo sistema.
O fundo (`--bg`) do catálogo é branco (`#ffffff`) nos dois modos — antes
era bege (`#f7f3ec`).

**Item de menu "Catálogo" é link direto, não dropdown**: como só existe um
destino (a página do catálogo em si), a categoria no `sidebarMenu.js` usa
`href` direto em vez de `itens:[...]` — `renderCategoria()` detecta isso e
desenha um `.menu-item` simples (sem `.has-sub`, sem submenu, sem seta ▾).
Se um dia precisar de mais de um destino ali dentro, aí sim volta a virar
`itens:[...]` normal.

**Toda cor de fundo bege do catálogo virou branco** (pedido explícito:
"tudo que for fundo bege precisa ser branco"), em `catalogo.css` e
`catalogo-studio3d.css` (o Painel 3D) — incluindo a tela de login do
cliente (`.catalog-login`/`.catalog-login-card`), cards, dialogs, badges e
estados hover/active de botão. **O que NÃO mudou de propósito**: (1) cores
semânticas de status (ex.: `#fff0ee`/vermelho para uma ferramenta "ativa"
de medição, `#fff7e9`/amarelo para "recorte ativo" — viram cor branca e
perderiam o significado); (2) as cores das peças no diagrama de planta
baixa (sofá, cadeira, mesa — `#e5d6c4`, `#d9c7b2` etc., precisam ficar
diferentes do chão branco pra serem visíveis); (3) **o chão do ambiente 3D
dentro do Painel 3D continua com um tom bege** — isso não é CSS, é a
textura/material da cena Three.js renderizada em `<canvas>`, um código
bem diferente (`catalogo-studio3d.mjs`, não o `.css`). Se pedirem pra
mudar isso também, é uma tarefa separada.

**Bug real: item sumido/atrás da foto de evento** (reportado como "a foto
do item foi pra trás da foto do evento/ambientado" — persistiu mesmo
depois de uma primeira correção, usuário confirmou "ainda está com o
mesmo problema"). Investigação em 3 rodadas, cada hipótese anterior
descartada só depois de reproduzir de verdade com Playwright (nunca só
lendo o código):
1. Interferência do iframe do dashboard — descartada: reproduzido
   também abrindo `catalogo.html` direto, sem o dashboard.
2. Conflito de CSS entre arquivos — descartada: recriando a mesma seção
   isolada com o CSS atual e as fotos reais do item, renderizava certo.
3. **Causa raiz de verdade**: cada `.catalog-product-section` só vira
   "revelada" (`.is-visible`, controlando a opacidade da foto principal
   E o `clip-path` do painel de evento) quando o `IntersectionObserver`
   a vê passar pela viewport DURANTE O SCROLL (`setupObservers()`). A
   caixa de busca só mostra/esconde seções via `classList.toggle
   ("hidden", ...)`, sem nunca adicionar `.is-visible` — a primeira
   correção (fazer a busca adicionar `.is-visible` nos resultados) ainda
   deixava aberto qualquer OUTRO caminho de acesso que não passasse por
   scroll real nem pela busca (e o usuário continuou vendo o problema).

**Correção definitiva**: em vez de caçar cada caminho que precisa
lembrar de adicionar `.is-visible`, a foto principal e o painel de
evento **pararam de depender dessa classe por completo** — ficam
sempre visíveis desde o primeiro render (`.product-main-media.
product-reveal{opacity:1;transform:none}` e `.product-event-panel`
com `opacity:1;clip-path:inset(0 0 0 0)` já no estado base, sem
selector `.is-visible` nenhum controlando essas duas coisas). Só o
texto (`.product-copy`) manteve o efeito de entrada com fade —
cosmético, nunca esconde informação essencial, então é seguro deixar
dependente de scroll/observer. Verificado com Playwright simulando o
PIOR caso possível (seção sem NENHUMA classe de revelação, como se
JS nenhum tivesse rodado ainda) — as duas fotos aparecem corretas
mesmo assim.

**Anti-flash do login e do cabeçalho ao acessar de dentro do sistema**: o
`#catalogLogin` vem visível por padrão no HTML (é o caso comum — cliente
externo sem `login_ok`) e o `<header class="catalog-header">` vem no
visual normal (marca "Acervo", busca, fundo escuro). Antes, os dois só
mudavam dentro de `catalogo.mjs`, depois de `getEmpresaAtualId()` e
`carregarEmpresa()` resolverem (chamadas assíncronas ao Supabase) — nesse
intervalo o login OU o cabeçalho escuro com "Acervo" genérico pintavam na
tela e sumiam, um "pisca" visível (reportado como "dá sensação de sistema
lento", depois "agora aparece o menu de lá verde"). Corrigido com um
`<script>` síncrono e comum (não `type=module`) logo depois da
`<div id="catalogLogin">` e antes do `<header>` no `catalogo.html`, que
checa `sessionStorage.login_ok` uma vez e já (1) esconde o `#catalogLogin`
e (2) adiciona `catalog-modo-sistema` no `<body>` — os dois ali mesmo,
antes do `<header>` ser desenhado. Mesma ideia do `themePrepaint.js`
(anti-flash de tema) e do anti-flash da logo do dashboard (abaixo)
aplicada aqui. `catalogo.mjs` continua fazendo as duas coisas de novo
dentro de `acessoInternoDoSistema()`, redundante mas inofensivo (proteção
extra). Se algum dia esse script inline for removido/movido, os dois
piscas voltam. Verificado com Playwright usando uma resposta de rede
propositalmente atrasada (400ms) pro módulo `catalogo.mjs` — um mock que
resolve instantâneo não expõe esse tipo de bug de timing.

## Placeholder de "sem foto"

Todo lugar que mostra uma foto de item sem foto cadastrada usava a mesma
imagem remota, hospedada no Storage do Supabase
(`.../storage/v1/object/public/logos/placeholders/sem-foto.png`) — um PNG
com a marca "EasyLoc" e um ícone de pin desenhados dentro da própria
imagem. Pedido explícito do usuário pra tirar essa marca de todo lugar
("não quero que essa foto apareça em mais lugar nenhum"). Trocado nos
arquivos que referenciavam essa URL (`Modulos/Estoque/CadastroItens/
item-detalhes.html`, `cadastro-itens.html`, `itens.foto.mjs`,
`kits.modal.mjs`, `Modulos/Comercial/Catalogo/catalogo.mjs`, e depois
também `itens.tabela.mjs` — coluna "Foto" da lista de Itens Cadastrados,
que antes mostrava um emoji 📦 numa caixinha própria, trocado a pedido do
usuário pelo mesmo visual do resto do sistema) por um SVG neutro embutido
como `data:image/svg+xml;base64,...` (ícone de imagem genérico + texto
"Sem foto", sem logo, sem rede) — mesma string em todos esses lugares
(6 até agora), sem dependência externa. Numa miniatura pequena (ex.: 44px
na tabela de Itens) o texto "Sem foto" fica ilegível — só o ícone genérico
aparece; isso é esperado, o SVG foi desenhado pra um contexto maior
(item-detalhes, catálogo). Se precisar trocar esse visual de novo, gerar
um novo data URI (não vale a pena um arquivo local só pra isso, já que
precisa funcionar tanto em atributo HTML quanto em string JS) e substituir
a mesma string em todos os arquivos que a usam.

Também aproveitado pra reduzir o tamanho do título "Item sem nome"/nome do
item em `item-detalhes.html` (`#itemDetailTitle`), que estava grande
demais ao lado do botão "Voltar" — herdava `font-size:clamp(21px,2vw,27px)
!important` da regra genérica de título de página em `design-system.css`
(`:is(#main-content,.el-page) :is(h1,...)`, ver "Risco conhecido" da
seção do `design-system.css` acima). Corrigido com um seletor mais
específico, `#itemDetailTitle.item-detail-heading` (ID já vence a regra
genérica, mesmo com `!important` dos dois lados), fixando `font-size:18px`
(17px no breakpoint mobile).

## Painel técnico na página do item (Catálogo)

Pedido explícito do usuário: abaixo do nome/medida de cada item, mostrar
"algumas informações relevantes que vêm do cadastro do item" — e, depois
de uma primeira versão com linha dividindo cada par (visual de tabela),
pediu explicitamente **sem linha nenhuma, "premium e minimalista"**.

`mapRow()` monta `item.specs` (array de `{label, value}`, campo vazio já
sai filtrado — `Categoria, Família, Material, Cor, Estilo, Marca/Modelo,
Código`; **Subcategoria foi removida da lista a pedido do usuário** (não
aparecia mais nesse painel nem em `select()`/na resposta da RPC — **até
uma sessão posterior reintroduzir a coluna pro filtro premium por
subcategoria dentro da categoria, ver seção "Filtro premium de
subcategoria" mais abaixo — a coluna voltou a ser lida, mas continua
FORA desse painel técnico**, o pedido de remover daqui nunca foi
desfeito), `specsPanel(item)` desenha isso como uma lista de definição
(`<dl>`), e `productTemplate()` insere logo abaixo da descrição
complementar. Visual final: rótulo pequeno em versalete cinza acima do
valor (mesma linguagem do resto da página, não uma tabela), **uma coluna
só** (pedido explícito — a primeira versão tinha 2 colunas, o usuário
pediu pra trocar pra 1), **espaço faz a separação entre os pares, não
borda nem linha nenhuma** (`.product-specs{display:flex;flex-direction:
column;gap:16px}`, sem `border` em lugar nenhum). "Categoria" entrou na
lista porque o breadcrumb "← CATEGORIA" que existia antes foi removido
numa edição anterior desta mesma tela — sem ele, não sobrava nenhum
outro lugar mostrando a categoria por item.

**Compactado depois** ("to achando muito espaçado, o botão de
experimentar tecido também tá sendo impactado"): a primeira versão
empilhava rótulo e valor em 2 linhas por spec, com bastante espaço entre
pares — isso empurrava o card "SOB MEDIDA" e a seção "DETALHES" pra
baixo, feio e apertado. Trocado pra **rótulo e valor na MESMA linha**
(`.product-specs-row{display:flex;align-items:baseline}`, rótulo com
largura fixa de 92px), gap entre linhas reduzido pra 7px — cada spec
agora é uma linha só, bem mais compacto, sem perder o visual "sem linha
divisória" pedido antes.

Colunas novas na consulta (`subcategoria, familia, estilo, referencia,
marca_modelo`) — só no acesso interno da equipe; a RPC do decorador
externo (`catalogo_carregar`) não devolve essas colunas, então pra um
link de decorador o painel técnico simplesmente não aparece (specs vazio
= função já não desenha nada), mesma limitação já documentada pra
Destaques.

## Catálogo mostra só Item e Kit, nunca Componente

Pedido explícito do usuário: "Componente" (peça que só existe pra compor
um Kit, nunca alugada sozinha) não pode aparecer no catálogo. Filtrado
em **duas camadas**, cobrindo os dois jeitos de carregar itens em
`carregarItens()`: (1) a consulta direta (acesso interno da equipe) já
filtra no próprio banco com `.in("tipo", ["Item", "Kit"])`; (2) uma
função `catalogItemAllowed(row)` (`['item','kit'].includes(String(row?.
tipo || '').trim().toLowerCase())`) é aplicada tanto nessa consulta
direta quanto na resposta da RPC `catalogo_carregar` (fluxo do decorador
externo, que não tem como receber um filtro de coluna do jeito acima).
Verificado com Playwright (mock de 3 itens, um de cada tipo) navegando
por todas as categorias e por Destaques — "Componente" nunca aparece em
nenhuma. **Achado ao verificar**: a suíte de regressão do catálogo
(`tests/catalogo-browser.cjs`) tinha um item de teste sem o campo `tipo`
— com o filtro novo, isso zerava a lista de itens carregados e a página
ficava sem nenhuma seção (teste some com timeout esperando
`.catalog-product-section` aparecer). Corrigido adicionando `tipo:'Item'`
no fixture do teste — não é sinal de bug no filtro, só um dado de teste
desatualizado.

## Catálogo: tela de Destaques + filtro real por categoria

Pedido explícito do usuário, depois de reclamar que "hoje entro no
catálogo e ele fica gigante, carrega uma tela enorme porque carrega todos
os itens": (1) uma aba "DESTAQUES" que é a tela de entrada do catálogo,
mostrando só os itens marcados como destaque no cadastro; (2) categorias
que filtram de verdade (clicar em "Sofás" mostra só sofás), não só rolam
a tela até lá.

**Antes**: `renderProducts()` sempre desenhava TODOS os itens de uma vez
(`state.items.map(productTemplate)`) — cada item é uma seção de tela
cheia, com foto, galeria, bloco de modelo 3D etc., todas empilhadas no
DOM ao mesmo tempo. Clicar numa categoria no cabeçalho (ou no rodapé de
um produto) só fazia `scrollIntoView` até a primeira seção daquela
categoria — o resto continuava tudo carregado, só fora da tela.

**Agora**: `renderProducts(items)` recebe explicitamente a LISTA JÁ
FILTRADA a desenhar — só essa lista vira DOM. `applyView(view)` é o novo
ponto central de troca de tela: atualiza `state.activeView`, marca a aba
certa como ativa (`setHeaderCategory`) e chama `renderProducts` só com os
itens daquela visão (`itemsForView`: `view==="__destaques__"` filtra por
`item.destaque`, qualquer outro valor filtra por `item.cat`). Todo lugar
que antes fazia `scrollIntoView` pra mudar de categoria (clique na aba do
cabeçalho, clique numa categoria do rodapé de um produto, o botão "←
CATEGORIA" de voltar) agora chama `applyView(...)` — nenhum deles ainda
usa scroll pra trocar de categoria, porque agora só existe UMA categoria
(ou só os Destaques) no DOM de cada vez.

**Campo `destaque_site`** já existia no banco e no cadastro manual
(`item-detalhes.html`, seção "Exibição no site" → "Destaque no site",
salvo por `itens.api.mjs`) desde a importação em massa do catálogo real —
só faltava o Catálogo em si consumir esse campo. `mapRow()` agora lê
`row.destaque_site` (adicionado no `select()` de `carregarItens()`) como
`item.destaque`. **Só funciona pelo acesso interno da equipe** (consulta
direta a `itens`) — o fluxo do decorador externo (RPC `catalogo_carregar`)
ainda não devolve esse campo, então pra um link de decorador a aba
Destaques fica sempre vazia; se pedirem isso pro decorador também, a RPC
no banco precisa ser alterada, não só este arquivo.

**Se não houver nenhum item marcado como destaque ainda**, o catálogo cai
pra mostrar a primeira categoria (nunca "todos os itens de uma vez" — voltar
a isso seria reintroduzir o problema original de carregamento pesado).

**Efeitos colaterais tratados**: como `renderProducts` agora troca todo o
conteúdo de `#catalogGrid`, os `IntersectionObserver`s antigos (usados pra
revelar a seção com efeito fade e pra pré-carregar o modelo 3D) ficavam
observando elementos que não existem mais — `setupObservers()` agora
desconecta os observers antigos antes de criar os novos, e passou a ser
chamado de dentro do próprio `renderProducts()` (não mais só uma vez no
`init()`). O observer de seção também **parou de sincronizar a aba ativa
do cabeçalho** (`setHeaderCategory` era chamado com a categoria de CADA
item que passava pela tela) — motivo: a visão "Destaques" mistura itens
de categorias diferentes, e isso trocava a aba ativa pra categoria do
item errado assim que ele entrava na tela. Quem decide a aba ativa agora
é só `applyView`, nunca mais o scroll. Verificado ponta a ponta com
Playwright (mock de `supabaseClient`): carregamento inicial mostra só os
destaques, clicar numa categoria mostra só ela, voltar pra Destaques
funciona.

**Bug real: foto do item sobreposta à foto de evento, na área de
Detalhes/Modelo 3D** (reportado com print de verdade: foto do produto e
foto de evento aparecendo empilhadas verticalmente na coluna errada,
sobre a área de "Detalhes"/"Visualização 3D"). Causa: `.product-main-
image` sempre foi desenhada em **118% do tamanho do próprio container**
(`.product-main-media`, com `overflow:visible`) de propósito — um
"sangramento" decorativo. Isso só fica com aparência correta enquanto a
linha do grid (`.catalog-detail-top`, dentro de `.catalog-detail-panel`)
nunca fica menor que os `min(52vh,520px)` declarados — o que depende da
altura total da seção (`100svh` menos cabeçalho) e do quanto as linhas de
baixo (Detalhes + Modelo 3D + navegação inferior, todas `auto`) ocupam.
Com dados reais (fotos de proporção diferente da testada, ou a seção
rodando numa janela/iframe mais baixa), essa linha podia ficar menor que
o esperado, e a imagem, tentando continuar do tamanho cheio, vazava por
cima de áreas vizinhas — inclusive por cima do painel de evento (que é
uma coluna à parte, não deveria ter nada sobreposto). Testado e
reproduzido forçando uma altura de janela menor. **Corrigido de raiz**:
`.product-main-image` agora é `width:100%;height:100%` (nunca maior que
o próprio container) e `.product-main-media` virou `overflow:hidden` —
a foto NUNCA MAIS pode vazar pra fora da própria caixa, custe o tamanho
que for o restante do layout. Efeito colateral aceito conscientemente:
o "sangramento" artístico de 18% desapareceu (a foto fica levemente
menor, sempre inteira dentro do quadro) — troca deliberada de estética
por estabilidade, depois de esse mesmo tipo de efeito (dependência de
condições de layout "ideais") já ter causado mais de um bug real nesta
sessão (ver também a correção do `.is-visible` logo acima).

**Pegadinha do `scroll-behavior:smooth` global**: `applyView()` reseta o
scroll pro topo ao trocar de categoria (`window.scrollTo({top:0,...})`) —
usar `behavior:"auto"` aí NÃO significa "instantâneo": `html{scroll-
behavior:smooth}` já está definido em `catalogo.css` (pros outros scrolls
do catálogo), e `"auto"` respeita esse CSS, então a troca de categoria
ficava com a tela toda "subindo" animada quando o usuário tinha rolado
pra baixo antes — pedido explícito do usuário pra tirar esse efeito,
"trocar de categoria tem que ser como trocar de tela". Trocado pra
`behavior:"instant"`, que ignora o `scroll-behavior` do CSS de propósito
(verificado: com `"auto"` o `scrollY` só chega a 0 depois da animação;
com `"instant"` já é 0 no frame seguinte à chamada).

**Superado pela seção seguinte** ("Home do catálogo"): a aba "Destaques"
descrita acima foi removida — a Home (menu de categorias) virou a tela de
entrada. `DESTAQUES_VIEW`/`item.destaque` não existem mais no código;
histórico mantido aqui só pelo raciocínio de performance (uma
categoria/visão por vez no DOM), que continua valendo.

## Visualização em grade do catálogo (alternativa à imersiva)

Pedido explícito do usuário: um ícone no cabeçalho (`#catalogViewToggle`,
ao lado de "Painel 3D") alterna entre a visualização imersiva de sempre
(`state.viewMode==="immersive"`, padrão) e uma **visualização em grade**
compacta (`"grid"`) — cards pequenos com só foto do produto + nome +
dimensões, **sem fotos ambientadas/de evento**, agrupados sob o nome da
categoria ativa. Mesmas cores/fontes do resto do catálogo, só o layout
muda (pedido explícito: "as cores mantenha tudo igual ao catálogo que já
temos"). Sem campo de quantidade nem botão de carrinho — confirmado com o
usuário que não monta pedido por essa tela, pelo menos por enquanto.

`renderProducts(items, heading)` decide entre as duas: no modo grade,
desenha `renderGridMarkup()` dentro de `#catalogGrid` (com a classe
`.catalog-products-grid-mode`) e desconecta os observers/animação de
scroll da visualização imersiva (`setupObservers`/`setupScrollMotion`),
que não fazem sentido num grid estático. Clicar num card
(`data-grid-item`) chama `openImmersiveFromGrid(item)`, que troca de volta
pro modo imersivo e rola até a seção daquele produto — a grade nunca é um
beco sem saída. `state.currentItems`/`state.currentHeading` guardam o
último conjunto de itens renderizado (categoria, ou resultado de busca)
pra que trocar de modo (grade↔imersivo) ou clicar num card sempre
reaproveite os MESMOS itens, nunca refaça o filtro do zero.

## Home do catálogo (menu de categorias) + capa por categoria

Pedido explícito do usuário, depois da visualização em grade acima: a
Home virou **o menu do catálogo**, no mesmo formato visual da grade de
produtos — só que cada card é uma **categoria** (foto de capa + nome),
não um produto. Substituiu de vez a tela de Destaques **e** o menu de
categorias em dropdown que existia no cabeçalho (`#catalogHeaderCategories`,
grupos "Assentos"/"Mesas"/etc. — toda essa navegação foi removida do
HTML/CSS/JS do cabeçalho). Confirmado com o usuário: (1) clicar na logo
leva pra Home de qualquer lugar do catálogo (não pula direto pros
produtos); (2) Destaques não virou um card na Home, só sumiu mesmo; (3)
categoria sem nenhuma capa definida cai pra foto do primeiro item dela —
nunca aparece sem foto.

**`HOME_VIEW` (`"__home__"`)** é mais um valor possível de
`state.activeView`, ao lado de um slug de categoria — `renderCurrentView()`
é o único ponto de decisão entre desenhar `renderHome()` (grade de
categorias) ou `renderProducts(itemsForView(...))` (produtos da
categoria). `applyView(view)` centraliza a limpeza que antes só rolava no
clique de uma categoria do cabeçalho (fechar Painel 3D se aberto, limpar
busca, mostrar `#catalogGrid`) — agora roda em QUALQUER navegação (Home ou
categoria), inclusive a partir do clique na logo
(`.catalog-brand`, `event.preventDefault()` + `applyView(HOME_VIEW)`, o
`href="#catalogGrid"` do link continua só como fallback sem JS).

O ícone de imersivo/grade (`#catalogViewToggle`) **some na Home**
(`updateViewToggleVisibility()`) — não existe "grade vs. imersivo" pra uma
tela que já É uma grade de categorias por natureza; volta a aparecer assim
que uma categoria é aberta.

**Nome ABAIXO da foto, só nos cards da Home** (pedido explícito do
usuário, depois de ver a Home com poucas categorias por linha: "isso fará
com que possamos colocar mais categorias na mesma linha") — cards de
produto (dentro de uma categoria) continuam foto+texto lado a lado, sem
mudança. `renderHomeMarkup()` soma a classe `catalog-home-card` (além de
`catalog-grid-card`, que os dois tipos de card compartilham) e o grid pai
ganha `catalog-home-grid`; `catalog-home-grid` troca as 3 colunas fixas do
grid de produto por `repeat(auto-fill,minmax(130px,1fr))` — cresce o
número de colunas sozinho conforme a largura da tela, sem precisar de
`@media` por breakpoint (verificado com 15 categorias reais: 7 colunas em
1600px, 2 em 390px). `catalog-home-card` empilha foto+nome em coluna
centralizada e a foto vira `width:100%;aspect-ratio:1/1` (antes tinha
largura fixa em `clamp()`, pensada pro card horizontal de produto).

**Campo novo `itens.capa_categoria`** (migration
`20260916000100_itens_capa_categoria.sql`, aplicada com `npx supabase db
push --linked`): booleano solto no item, mesmo padrão de `destaque_site`
— categoria continua texto livre, sem tabela de lookup, então "capa da
categoria" não referencia nenhum id, só marca QUE item é a capa da SUA
PRÓPRIA categoria (`itens.categoria`). UI em `item-detalhes.html`
(`#itensCapaCategoria`, select Sim/Não, mesma linha de "Destaque no site"
na seção "Exibição no site"), lido/gravado em `itens.api.mjs`
(`itens_salvar`) e `item-detalhes.mjs` exatamente como `destaque_site`.
`categoryCoverPhoto(cat)` (catalogo.mjs) escolhe, entre os itens daquela
categoria, o primeiro com `capaCategoria===true`, senão o primeiro item
encontrado (fallback confirmado com o usuário). **Não impede** duas
categorias diferentes — ou dois itens da mesma categoria — de ficarem
marcados como capa ao mesmo tempo; nesse caso o primeiro encontrado (ordem
de `state.items`, que segue a ordem devolvida pela RPC) só ganha
silenciosamente. Não implementado por não ter sido pedido: desmarcar
automaticamente uma capa anterior da mesma categoria ao marcar uma nova.

`catalogo_acervo()` (função única de onde tanto `catalogo_carregar`/acesso
externo quanto `catalogo_carregar_interno`/equipe leem os itens — ver
`20260914000200_catalogo_acervo_unificado.sql`) precisou de
`create or replace function` só pra incluir `'capa_categoria',i.capa_categoria`
no `jsonb_build_object` — como as duas RPCs só chamam essa função
compartilhada, um único ponto de alteração já basta pros dois acessos.

**CSS morto descoberto nessa remoção, não limpo** (fora do escopo pedido —
mesma cautela documentada pro `styles/shell.css` na seção "Riscos
conhecidos"): `catalogo.css` tem duas gerações de layout de cabeçalho no
mesmo arquivo — um bloco antigo de "duas linhas" (grid-template-areas
`"brand search user" "categories categories categories"`, por volta do
topo do arquivo) já vinha sendo **sobrescrito** por um bloco posterior de
"uma única faixa" (`grid-template-areas:"brand categories search user"`,
mais adiante no arquivo, comentado como "Cabeçalho em uma única faixa,
limitada à altura da marca") antes mesmo desta sessão — ou seja, parte do
CSS do cabeçalho já era código morto independente do menu de categorias.
As regras específicas do dropdown removido (`.catalog-header-categories`,
`.catalog-nav-toggle`, `.catalog-category-group`, `.catalog-category-panel`,
`.catalog-group-trigger`, `.catalog-category-heading`, espalhadas pelos
dois blocos e por vários `@media`) viraram morte adicional em cima dessa
já existente. Não removido nesta sessão pra não misturar uma limpeza de
CSS legado não pedida com a mudança pedida — mas é a próxima coisa a
investigar se algum ajuste futuro no cabeçalho "não fizer efeito".

Teste de regressão: `tests/catalogo-menu-browser.cjs` foi reescrito nesta
sessão — testava o dropdown de categorias removido, agora testa a Home
(card por categoria, capa explícita vs. fallback pro primeiro item,
logo↔categoria, ausência do menu antigo, mobile sem overflow).
`tests/catalogo-public-live.cjs` ainda assume o menu antigo, mas testa o
site **já publicado** (produção) — como nada deste recurso foi
implantado ainda (pedido explícito do usuário: "não faça o deploy no
github e vercel"), esse teste continua válido pro que está no ar; precisa
do mesmo tipo de atualização quando essas mudanças forem publicadas de
verdade.

## Biblioteca (módulo dentro do catálogo, não uma tela separada)

Pedido explícito do usuário, com uma correção de rumo no meio: a primeira
ideia era "módulo separado", mas o usuário voltou atrás e confirmou "a
biblioteca vai ser um módulo dentro do catálogo... igual tem do painel" —
ou seja, mesmo padrão do Painel 3D: um botão no cabeçalho
(`#catalogBiblioteca`/`[data-biblioteca-toggle]`) que alterna uma seção
inteira dentro da MESMA página `catalogo.html`, sem tela nem login
próprios. Decisões confirmadas com o usuário antes de implementar: (1)
pastas são automáticas, uma por categoria já existente no catálogo — não
dá pra criar/nomear pasta à mão; (2) fotos são upload manual da equipe,
independentes de qualquer item específico (galeria de referência, tipo
"todas as fotos de bares"), não uma agregação automática das fotos dos
itens cadastrados.

**Banco** (`supabase/migrations/20260916000200_biblioteca_fotos.sql` +
`20260916000201_biblioteca_fotos_path.sql`, essa segunda só porque a
primeira já tinha sido empurrada com `db push --linked` quando percebi que
faltava o campo `path` — a CLI marca migration aplicada pelo NOME do
arquivo, então editar uma já aplicada não re-executa nada, precisa de
arquivo novo mesmo dentro da mesma sessão de trabalho): bucket de Storage
novo `biblioteca` (público, mesmo padrão do bucket `itens` — ver
`20260628000100_itens_fotos_galeria.sql`, replicado política por
política) e tabela `public.biblioteca_fotos` (`empresa_id, categoria,
titulo, path, url, mime_type, tamanho_bytes, ordem, criado_por,
criado_em`) — RLS padrão via `usuarios_empresas`, sem tabela de "pastas"
nenhuma (pastas continuam virtuais, calculadas no cliente a partir de
`getCategories()`, mesma lógica da Home).

**Leitura, mesmo desenho de dois pontos de entrada do catálogo**: uma
função única `biblioteca_fotos_acervo(p_empresa_id)` (retorna
`id/categoria/titulo/url/path/ordem`), envolvida por
`biblioteca_carregar(p_token)` — decorador externo, valida o token
chamando `catalogo_validar_sessao(p_token)` (reaproveitada tal qual, sem
duplicar a lógica de sessão) — e `biblioteca_carregar_interno(p_empresa_id)`
— equipe, checa a MESMA permissão que já protege o catálogo inteiro
(`comercial.catalogo.visualizar`, via `funcionario_pode()`), sem criar
chave de permissão nova (evita mexer no sistema de permissões — registrar
uma chave nova exige inserir em `permissoes_catalogo`, não é só usar a
string). Upload e exclusão de foto são direto de `biblioteca_fotos`/do
bucket `biblioteca` (RLS cobre, sem RPC) — só a LEITURA do decorador
precisa de RPC com `security definer`, porque ele não tem `auth.uid()`.

**Frontend**: `catalogo-biblioteca.mjs`/`.css` novos, mesmo padrão de
`catalogo-studio3d.mjs` (self-contido, recebe um snapshot de contexto —
`{supabase, empresaId, token, acessoInterno, categories}` — em
`initCatalogBiblioteca()`, chamado de `catalogo.mjs` depois de
`carregarItens()`; não importa nada de `catalogo.mjs` nem o contrário).
Fotos só carregam na PRIMEIRA vez que a aba é aberta (`openCatalogBiblioteca()`
memoizado via `state.loaded`), não no carregamento inicial do catálogo.
Pastas reaproveitam as mesmas classes CSS dos cards de categoria da Home
(`.catalog-grid-wrap/.catalog-grid.catalog-home-grid/.catalog-home-card`)
— cada pasta mostra a primeira foto da categoria como capa (ou o mesmo
placeholder "Sem foto" de sempre, se ainda vazia) + contagem
("N fotos"/"0 fotos", pasta nunca some mesmo vazia). Abrir uma pasta troca
pra grade de fotos quadradas; upload (botão "+ Adicionar fotos") e botão
de remover em cada foto só aparecem se `acessoInterno===true` — decorador
externo só navega, sem nenhum controle de edição.

**Uma só tela por vez**: `setActiveOverlay(mode)` centraliza a
exclusividade entre produtos/Home (`#catalogGrid`), Painel 3D
(`#catalogStudio`) e Biblioteca (`#catalogBiblioteca`) — abrir um dos três
fecha os outros dois automaticamente (era ad-hoc só pro Painel 3D antes;
virou uma função só quando a Biblioteca precisou do mesmo comportamento).
`applyView()` (navegar pra Home/categoria) também passa por
`setActiveOverlay(null)`, então clicar na logo ou numa categoria sempre
fecha Painel 3D/Biblioteca se algum estiver aberto.

**Nomeação corrigida durante a implementação**: o botão "Biblioteca" tinha
sido copiado do botão "Painel 3D" e ficou com a classe CSS
`catalog-studio-tab` (óbvio errado — Biblioteca não é "studio"). Renomeada
pra `catalog-header-tab` nos dois botões e nos seletores CSS
correspondentes antes de terminar a sessão.

Teste de regressão: `tests/catalogo-biblioteca-browser.cjs` (2 cenários —
decorador externo só visualiza, sem botão de upload/remover; equipe
interna sobe e remove foto de verdade, incluindo checar que o caminho do
arquivo no Storage começa com `empresa/categoria` e que a linha salva usa
o RÓTULO da categoria, não o slug) — cobre pastas por categoria, contagem
de fotos, exclusividade com Painel 3D, logo fechando overlay, mobile sem
overflow.

## Portal de entrada (3 fotos — Catálogo/Biblioteca/Módulo 3D)

**As 3 fotos por bloco descritas nesta seção viraram UMA foto só depois**
— ver seção "Portal virou uma foto só..." mais abaixo. A navegação (3
destinos, `GATEWAY_TILES`/`activateGatewayTile`) e a hierarquia de 3
níveis continuam exatamente como aqui descrito; só a APRESENTAÇÃO (3
fotos independentes com "Trocar foto" cada) mudou. Histórico mantido
por completo abaixo pelo raciocínio de arquitetura (hierarquia de
navegação, bucket/path reaproveitados, `catalogo_capas`), que continua
valendo.

Pedido explícito do usuário, com uma foto de referência (site de outra
empresa, "só pra mostrar o formato" — mesmo padrão já visto antes nesta
sessão): uma NOVA tela, ainda mais na frente da Home de categorias, com 3
fotos grandes lado a lado — "Catálogo", "Biblioteca", "Módulo 3D" — cada
uma levando pro destino correspondente. Confirmado com o usuário: (1) é a
primeira tela tanto do decorador quanto da EQUIPE INTERNA (não só do
decorador — pergunta inicial assumia que seria só externo, usuário
corrigiu: "a equipe interna também vê, aliás é por lá que a pessoa troca
a foto que ela quiser"); (2) a equipe troca a foto de cada bloco
diretamente nessa tela, sem precisar de outra página.

**Hierarquia de navegação ficou em 3 níveis** (antes eram 2: Home de
categorias era o topo): Portal (`GATEWAY_VIEW`, `"__gateway__"`, valor
inicial de `state.activeView`) → bloco "Catálogo" leva pra Home de
categorias (`HOME_VIEW`, a mesma de antes) → categoria → produtos; blocos
"Biblioteca" e "Módulo 3D" abrem os overlays já existentes direto
(`openBibliotecaOverlay()`/`openStudioOverlay()`, mesmas funções que os
botões do cabeçalho já usavam — extraídas pra função nomeada justamente
pra servir os dois pontos de entrada sem duplicar lógica). **Clicar na
logo agora volta pro Portal, não mais direto pra Home** — mesmo raciocínio
de "clicar na logo = voltar ao início" da sessão anterior, só que o
início subiu mais um nível.

**Banco** (`supabase/migrations/20260916000300_catalogo_capas_portal.sql`):
tabela nova `public.catalogo_capas` (`empresa_id, chave, path, url,
atualizado_em`, `chave` com `check` fixo em `catalogo`/`biblioteca`/
`modulo3d` — só 3 linhas possíveis por empresa, `unique(empresa_id,chave)`
pra permitir upsert). **Reaproveita o bucket `biblioteca`** já criado pra
Biblioteca — path `${empresa_id}/_capas/${chave}.ext` cai dentro da MESMA
política de storage por prefixo de empresa, sem precisar de bucket nem
política nova. Leitura no mesmo desenho de sempre:
`catalogo_capas_acervo(p_empresa_id)` (devolve `{chave: url}`, não um
array — só 3 chaves fixas, `jsonb_object_agg` em vez de `jsonb_agg`),
envolvida por `catalogo_capas_carregar(p_token)` (decorador) e
`catalogo_capas_carregar_interno(p_empresa_id)` (equipe, mesma permissão
`comercial.catalogo.visualizar` de sempre). Upload/troca de foto é direto
(`upsert` em `catalogo_capas` com `onConflict:"empresa_id,chave"` +
upload no Storage com `upsert:true` no MESMO caminho — path fixo por
chave, não um uuid novo a cada troca, então trocar a foto de um bloco
sobrescreve a anterior em vez de acumular arquivo órfão).

**Frontend** (tudo em `catalogo.mjs`, sem módulo `.mjs` separado dessa
vez — ao contrário de Biblioteca/Painel 3D, o Portal é o próprio estado
inicial de navegação da página, não um "overlay" independente, então faz
mais sentido morar junto de `applyView`/`renderCurrentView` do que ser
importado como um módulo à parte): `renderGateway()` desenha os 3 blocos
dentro de `#catalogGrid` (mesmo elemento que a Home/grade de produtos já
usam — `renderCurrentView()` decide entre Portal, Home ou produtos).
Fotos carregam ANTES do primeiro render (`carregarCapasGateway()` chamado
em `init()`, não sob demanda como a Biblioteca) — faz sentido, já que é a
primeira coisa que qualquer um vê ao abrir o catálogo.

**Cada bloco é uma `<div>`, não um `<button>`** — decisão deliberada: pra
equipe interna, cada bloco precisa aninhar um `<label>`/`<input
type=file>` (o controle "Trocar foto"), e um `<button>` não pode conter
outro elemento interativo (HTML inválido). O clique pra NAVEGAR é
delegado em `#catalogGrid` (`data-gateway-tile`) e ignora cliques que
caem dentro de `data-gateway-edit` (deixa o `<label>` abrir o seletor de
arquivo normalmente, sem também disparar a navegação) — `role="button"
tabindex="0"` + um handler de `keydown` (Enter/Espaço) cobrem o mínimo de
acessibilidade por teclado que um `<div>` clicável não tem de graça.

Teste de regressão: `tests/catalogo-portal-browser.cjs` (2 cenários —
decorador navega pelos 3 blocos sem ver "Trocar foto"; equipe troca a
foto de um bloco e confirma o caminho fixo por chave, o `onConflict`
correto e que a imagem atualiza na tela sem recarregar) — cobre título
dos 3 blocos, capa vinda da RPC, ícone imersivo/grade escondido no
Portal, logo voltando pro Portal, mobile sem overflow. Os testes mais
antigos que assumiam a Home de categorias como primeira tela
(`catalogo-browser.cjs`, `catalogo-menu-browser.cjs`,
`catalogo-biblioteca-browser.cjs`) foram ajustados pra entrar pelo bloco
"Catálogo" (ou clicar direto em "Biblioteca"/"Painel 3D", que já
funcionam a partir do Portal sem precisar passar pela Home primeiro).

**Ajustes finos pedidos depois, todos só CSS**: (1) as 3 fotos ficavam
coladas umas nas outras e no cabeçalho — `.catalog-gateway` ganhou `gap`
e `margin` (topo + laterais) pra dar respiro, todos em `clamp()` pra
escalar com a largura da tela; (2) cantos arredondados que eu tinha
adicionado por conta própria foram pedidos de volta ao quadrado (usuário:
"não quero que as fotos das bordas fiquem arredondas"); tiles também
ganharam margem lateral pra ficar mais centralizados sem diminuir muito o
tamanho da foto; (3) escurecer no hover, igual à foto ambientada do item
— pedido, implementado, e **não funcionava**: o overlay (`::before`)
tinha a opacidade mudando de verdade (confirmado via `getComputedStyle`),
mas não aparecia na tela porque ele é gerado ANTES da `<img>` na árvore, e
como as duas são `position:absolute` sem `z-index`, a imagem pintava por
cima escondendo o escurecimento por completo — só percebido comparando
pixel a pixel (`elementFromPoint` não adianta aqui, porque
`pointer-events:none` faz o hit-test ignorar o pseudo-elemento
independente do que está pintado por cima). Corrigido dando `z-index`
explícito pro `::before` (acima da `<img>`, abaixo do título e do botão
"Trocar foto") — mesma lição da foto ambientada do item, que só funciona
porque `::before` já tinha `z-index:3` lá.

## Ícone de pasta na Biblioteca (não mostra mais "Sem foto")

Pedido explícito do usuário: os cards de categoria da Biblioteca (ver
seção "Biblioteca" acima) mostravam o placeholder genérico "Sem foto"
quando a categoria ainda não tinha nenhuma foto subida — errado
conceitualmente, porque ali "não terá fotos, terá uma pasta". Trocado por
um ícone de pasta desenhado na hora (`FOLDER_ICON_SVG` em
`catalogo-biblioteca.mjs`, três `<rect>` simples formando aba+corpo+frente
— não um emoji nem um ícone de sistema operacional genérico) **inline no
HTML, não como `data:` URI** — de propósito, pra poder colorir via
`var(--accent)`/`var(--line)` no CSS normal (uma `<img src="data:...">`
não herda variáveis CSS do documento). Pasta com pelo menos 1 foto fica
na cor cheia (`var(--accent)`, o tom terroso já usado no resto do
catálogo); pasta vazia (`.is-empty`) fica no contorno claro
(`var(--line)`) — comunica "tem conteúdo" vs. "vazia" sem precisar de
foto nenhuma. Reaproveita o mesmo card/grid da Home
(`.catalog-grid-card-photo`/`.catalog-home-card`) — só o CONTEÚDO daquele
quadrado muda (SVG de pasta em vez de `<img>`); a Home de categorias
(fora da Biblioteca) continua mostrando foto de verdade, sem mudança —
esse pedido era só "na biblioteca".

## Editor de fotos do item, direto no catálogo (equipe interna)

Pedido explícito do usuário: de dentro do sistema, a equipe consegue
editar TODAS as fotos que aparecem no catálogo (foto principal, as 2 de
Detalhes, as até 3 Ambientadas) e marcar o item como capa da categoria —
tudo sem sair da visualização imersiva. Confirmado antes de implementar:
(1) escopo é "todas as fotos que aparecem", não só a principal; (2)
Ambientadas dá acesso aos até 3 slots de galeria (`galeria_01/02/03`),
não só a que está sendo exibida no momento; (3) capa da categoria =
marcar o item atual como capa (mesmo campo `itens.capa_categoria` do
Cadastro de Itens), desmarcando automaticamente quem era capa antes.
**O mais importante, repetido pelo próprio usuário**: "quando trocar no
catálogo troca no cadastro do item junto" — ou seja, isso NÃO é um dado
paralelo tipo Biblioteca/capas do Portal; é o MESMO `itens.foto_url`,
`itens_fotos` e `itens.capa_categoria` que `item-detalhes.html` já usa.

**Não reaproveita `itens.foto.mjs`** (o motor de foto do Cadastro de
Itens) **por decisão consciente, não por falta de tentativa**: aquele
arquivo é todo acoplado ao DOM específico de `item-detalhes.html`
(`#itensFotoPreview`, `.foto-guia-container` pro crop/zoom, campos
`[data-item-photo-input="slot"]`) e usa um modelo de "rascunho até
salvar o formulário inteiro" (`fotosSlotState`, só grava em
`itens_salvarFotosAdicionais` no submit) — não dá pra chamar de dentro do
catálogo sem ou reescrever aquele arquivo pra funcionar sem esse DOM, ou
duplicar a lógica de qualquer forma. Reimplementado em `catalogo.mjs`
(não um módulo `.mjs` separado — mesma decisão já tomada pro Portal, é
comportamento central da navegação/visualização do item, não um
subsistema independente como Biblioteca/Painel 3D) com o MESMO
bucket/convenção de caminho (`itens/${empresa}/${item}/principal.ext` pra
principal, `itens/${empresa}/${item}/geral/${slot}.ext` pros outros 5
slots — sempre `cliente_id:null`, o "geral"/catálogo padrão, nunca a
galeria exclusiva de um decorador específico) e nas MESMAS tabelas
(`itens.foto_url`, `itens_fotos`), só que **upload instantâneo por
foto**, sem crop/zoom nem estado de rascunho — mesmo padrão de
salvamento imediato já usado pra Biblioteca/Portal nesta sessão.

**Migration nova** (`20260917000100_catalogo_acervo_slot_path.sql`):
`catalogo_acervo()` não devolvia `slot` nem `path` de cada foto — dava
pra EXIBIR (`url`/`titulo`/`tipo`) mas não pra saber qual slot substituir
nem qual arquivo antigo apagar do Storage ao trocar. Os dois campos
passaram a vir na resposta (bucket "itens" já é público, então expor o
path não vaza nada que a própria URL pública já não expusesse) — flui
por `mapRow()` até `item.details`/`item.events` (cada entrada agora
carrega `{img, label, slot, path}`, antes só `{img, label}`).

**UI, versão em modal REJEITADA pelo usuário depois de pronta e testada**:
a primeira versão implementada abria um `#catalogPhotoEditorDialog` (um
diálogo com 3 seções, 6 quadros — mesmo estilo do "Experimente outro
tecido"). Funcionava, tinha teste passando, e foi descartada mesmo assim:
*"sobre a edição das fotos eu não quero que abra um modal, quero que a
pessoa adicione no próprio html, assim ele pode ajustar, aproximar,
chegar pro lado, ajustar a melhor forma de ficar no html, a intenção é
essa entendeu?"* — a pessoa precisa ver EXATAMENTE como a foto vai ficar
publicada enquanto ajusta (posição, zoom, enquadramento), não um preview
solto dentro de uma caixa genérica. Isso mudou a arquitetura da UI por
completo (detalhada abaixo); mantido aqui como registro pra não propor
"colocar num modal" de novo se pedirem outro ajuste nesta tela.

**UI de verdade, direto no layout real (sem modal, sem popup)**: cada
foto editável do catálogo ganha um gatilho no próprio lugar onde ela já é
exibida — um "✎" sobre a foto principal (`.catalog-inline-edit-badge`,
dentro de `.product-main-media`), um "✎" em cada quadro de Detalhe já
preenchido ou um quadro "+ Adicionar" nos vazios
(`detailGallery()`/`.detail-thumb.is-empty-editable`), e 3 pontinhos
sobre o painel de evento pras 3 Ambientadas
(`.catalog-event-slot-picker`/`.catalog-event-slot-dot`, preenchido ou
vazio — cada pontinho JÁ é o gatilho de editar aquele slot específico,
sem precisar escolher qual antes). Clicar em qualquer gatilho
(`data-inline-edit="slot"`) chama `startInlineEdit(section, item, slot)`,
que **esconde o conteúdo original daquele contêiner** (`.catalog-inline-
crop-hide`, `visibility:hidden` — nunca remove do DOM, só esconde) e
sobrepõe uma `<div class="catalog-inline-crop-overlay">` com a foto atual
(carregada via `fetch()` da própria URL pública + `createImageBitmap()`)
pronta pra arrastar (Pointer Events, `pointerdown/move/up`) e dar zoom
(roda do mouse ou botões +/−) — sempre dentro da moldura REAL daquele
elemento (`frame.getBoundingClientRect()`), nunca uma caixa de preview à
parte. Cancelar (`✕`) remove a sobreposição e reexibe o original, sem
gravar nada; Aplicar (`✓`) gera o blob final na hora
(`cropSessionBlob()` — mesmo cálculo de "contain × zoom" de
`itens_gerarImagemFinal()` em `itens.foto.mjs`, só que parametrizado pela
moldura real da página em vez de uma caixa fixa de 240×240) e chama
`trocarFotoPrincipal`/`trocarFotoSlot`. Slot vazio abre direto no
seletor de arquivo (sem nada pra arrastar ainda); slot com foto mostra
um botão de trocar (📷, dentro do próprio overlay) e, pra Detalhe/
Ambientada com foto existente, um "🗑 Remover"
(`removeCropSlot()`/`removerFotoSlot`). **Sem botão "Salvar" separado**
— Aplicar já grava na hora (upload + update/insert/delete dentro do
próprio handler), mesmo padrão instantâneo da Biblioteca/Portal. O botão
de capa da categoria (`.catalog-capa-toggle`, ★/☆) continua fora desse
fluxo de crop — clique único, grava na hora, sem overlay nenhum.

**Só uma sessão de crop por vez**: uma variável de módulo `cropSession`
(não faz parte de `state`) guarda a edição ativa; abrir um gatilho
diferente cancela a sessão anterior primeiro (`if(cropSession)
cancelInlineEdit()`), então nunca sobra mais de um overlay aberto ao
mesmo tempo.

**Bug real encontrado testando esta versão (não existia na versão em
modal)**: pra um slot de Detalhe AINDA VAZIO, o elemento com
`data-inline-edit="slot"` é o PRÓPRIO `<button class="detail-thumb
is-empty-editable">` (não tem um filho separado pra servir de gatilho,
diferente do slot já preenchido, onde o "✎" é um `<span>` à parte dentro
do `<button>`). Como o overlay de crop é anexado DENTRO desse mesmo
elemento, e o clique delegado em `bindInteractions()` checa
`[data-inline-edit]` ANTES de `[data-crop-*]` (pela mesma razão já
documentada — o "✎" de outros slots fica aninhado dentro de botões que
respondem a outro atributo), clicar em "Aplicar"/"Cancelar"/qualquer
botão da barra de ferramentas era capturado de novo pelo gatilho externo
e reabria a sessão do zero em vez de agir — sintoma: clicar em "Aplicar"
num slot vazio simplesmente voltava pro estado "+ Escolher foto", sem
gravar nada. Corrigido em `startInlineEdit()`: quando o frame tem seu
próprio `data-inline-edit`, o atributo é removido temporariamente
(guardado em `cropSession.frameInlineEditSlot`) assim que a sessão abre,
e restaurado em `cancelInlineEdit()` (no caminho de Aplicar não precisa
restaurar — `refreshOpenSection()` já re-renderiza a seção inteira do
zero). Achado rodando o teste de verdade com Playwright simulando o
clique em Aplicar num slot vazio — não seria óbvio só lendo o código.

**Atualização em tela sem reload**: depois de qualquer edição, se o item
editado for o que está aberto na visualização imersiva,
`refreshOpenSection(item)` reaplica esse mesmo item na seção via
`applyVariant(section, item)` — a MESMA função que já existia pra trocar
de variante de cor, reaproveitada aqui mesmo sem estar trocando de
variante nenhuma: ela só mexe no que realmente mudou (compara
`dataset.originalSrc` antes de animar a foto principal), então chamar de
novo com o item igual é seguro e já pega as mutações que as funções de
troca de foto fizeram direto nos objetos `item.photo`/`item.details`/
`item.events`/`item.capaCategoria` em `state.items`. `applyVariant()`
também recebeu dois trechos novos pra manter o painel de evento
(`eventPanelMarkup()`, função extraída pra ser compartilhada entre o
primeiro render e o refresh) e o botão de capa em sincronia ao trocar de
variante de cor.

**Gatilhos não travam no item errado ao trocar de variante de cor**:
nenhum gatilho (`data-inline-edit`, `data-capa-toggle`) carrega o id do
item — o clique resolve o item pelo `data-product-id` da seção no
momento do clique (`applyVariant()` já mantém esse atributo atualizado a
cada troca de variante), então editar fotos/capa sempre atua na variante
realmente visível na tela, não na que estava selecionada quando a seção
foi renderizada pela primeira vez.

Teste de regressão: `tests/catalogo-editor-fotos-browser.cjs` (2
cenários — decorador nunca vê nenhum gatilho/pontinho/botão de capa,
detalhe vazio continua mostrando só o aviso "SEM FOTOS DE DETALHE" de
sempre; equipe vê badge na principal + 2 slots de Detalhe + 3 pontinhos
de Ambientada + botão de capa, arrasta a foto principal e confere que o
`transform:translate()` do preview reflete o deslocamento do mouse, dá
zoom pelos botões e confere a escala, aplica e confere upload+update,
adiciona foto num slot de Detalhe vazio direto pelo seletor de arquivo,
cancela uma edição de Ambientada sem gravar nada, remove uma foto de
Ambientada já existente checando que some do Storage e do banco, e
define capa da categoria) — cobre também mobile sem overflow. **Fixtures
de imagem do teste precisam ser PNG de verdade, não SVG sintético**:
`createImageBitmap()` (usado por este editor pra decodificar a foto atual
antes de desenhar no crop) lança `InvalidStateError: The source image
could not be decoded` pra um SVG fulfilled via `page.route()` neste Edge
headless — os outros testes de catálogo usam SVG como fixture sem
problema porque nunca passam por `createImageBitmap()`, só exibem a URL
numa `<img>`; este teste é o único que precisa de um PNG 1×1 real
(`PNG_1X1`, constante no topo do arquivo) sempre que a imagem for
carregada por esse caminho.

**Bug real reportado pelo usuário depois de testar de verdade (print em
mãos): "essa borda colorida está tampando o botão de concluir"** — ao
ajustar a foto PRINCIPAL, o botão "✓ Aplicar" (dentro da barra de
ferramentas do crop) ficava coberto por um retângulo bege sólido, sem
reagir a clique nenhum. Causa raiz, confirmada com
`document.elementFromPoint()` no ponto exato do botão (retornava
`.catalog-detail-lower`, a seção de "Detalhes"/"Visualização 3D" logo
abaixo da foto, não o `<button>`): a barra de ferramentas era posicionada
**fora** da própria moldura da foto (`top:100%;margin-top:6px`, ou seja,
"comece onde a foto termina e desça mais 6px") — e como
`.catalog-inline-crop-overlay` (que contém a barra) tem `overflow:hidden`
(precisa disso pra conter o arrastar/zoom da imagem dentro da moldura), a
parte da barra que sobrava pra fora da moldura ficava PARCIALMENTE
CORTADA por esse `overflow:hidden`, e o pedaço que ainda aparecia ficava
visualmente ATRÁS de `.catalog-detail-lower` — que vem depois no HTML e,
sem nenhum dos dois ter `z-index`, pinta por cima simplesmente por ordem
de documento. Só dar `z-index` pro frame da foto (`.catalog-editable.
is-cropping{overflow:visible!important;z-index:30}`, a tentativa
original) não resolvia: `.catalog-detail-lower` é uma seção IRMÃ DO PAI
do frame (`.catalog-detail-top`), não irmã do frame — elevar o z-index de
um elemento só muda sua ordem de pintura FRENTE AOS PRÓPRIOS IRMÃOS
(dentro do mesmo contexto de empilhamento), nunca frente a elementos de
fora desse contexto. O mesmo problema ia se repetir, de forma um pouco
diferente, nos outros 2 contextos de edição: um quadro de Detalhe (dentro
de `.catalog-detail-lower`, que por sua vez está dentro de
`.catalog-detail-panel{overflow:hidden}`) e o painel de Ambientada
(`.product-event-panel`, dentro de `<section overflow:hidden>`) — nesses
dois a barra ficaria simplesmente CORTADA (invisível), sem espaço nenhum
sobrando abaixo da moldura antes de bater no `overflow:hidden` do
ancestral.

**Corrigido na raiz, não com mais um z-index**: a barra de ferramentas
passou a ficar **dentro da própria moldura** (`.catalog-inline-crop-
toolbar{position:absolute;left:50%;bottom:8px;...}`, flutuando por cima
do canto inferior da foto, em vez de abaixo dela) — resolve os 3
contextos de uma vez só, sem precisar calcular/ajustar z-index pra cada
ancestral diferente que cada um tem. A regra `.catalog-editable.
is-cropping{overflow:visible!important;z-index:30}` (a tentativa que não
funcionou) foi removida por completo — não sobra mais nada que precise
"vazar" pra fora da caixa. **Achado importante sobre o teste que já existia**: o teste de regressão
(`tests/catalogo-editor-fotos-browser.cjs`) já clicava em "Aplicar" na
foto principal ANTES dessa correção, usando `.click()` comum do
Playwright (que tem checagem de "actionability", incluindo se o alvo
realmente recebe o evento) — e mesmo assim **passava**, sem acusar nada.
O bug só apareceu de verdade no navegador do usuário, com o item real
(outras medidas de foto, outra altura de seção). Ou seja, `.click()`
comum não é garantia contra esse tipo de sobreposição — o resultado
depende da geometria exata (altura da foto, quantos itens têm nas
galerias etc.), que pode variar o suficiente entre o fixture do teste e
um item real pro centro do botão cair numa área ainda não coberta no
teste, mesmo com o mesmo bug de CSS presente. Corrigido adicionando uma
checagem EXPLÍCITA com `document.elementFromPoint()` no centro do botão
"Aplicar" antes de clicar — confere que o alvo é de fato o `<button>`,
não confiando só no `.click()` ter "funcionado" sem erro. **Lição pra
qualquer teste envolvendo overlay/crop/z-index**: preferir
`elementFromPoint` explícito a um `.click()` silencioso quando o layout
pode variar por item.

**Seletor de arquivo abre direto no primeiro clique, num slot vazio**
(pedido explícito do usuário, com print do Explorador do Windows aberto:
"quando eu clicar em adicionar foto eu já quero que apareça esse modal
do Windows de selecionar qual será a foto, hoje eu estou tendo que
colocar duas vezes") — clicar em "+ Adicionar" (Detalhe vazio) ou no
pontinho de uma Ambientada vazia só trocava pro estado "+ Escolher foto"
(um `<label>` envolvendo um `<input type=file>` escondido), exigindo um
SEGUNDO clique nesse rótulo pra abrir o seletor de verdade. Corrigido em
`startInlineEdit()`: assim que o HTML desse estado é montado, um
`placeholder.querySelector("[data-crop-swap]")?.click()` já dispara o
seletor do sistema na mesma hora. **Só funciona porque esse trecho roda
inteiro SÍNCRONO** (sem nenhum `await` antes dele nesse branch) — ainda
dentro do mesmo clique/tecla do usuário que abriu a sessão de ajuste;
navegadores exigem um gesto do usuário pra abrir esse seletor, então um
`.click()` disparado depois de qualquer `await` (fora dessa cadeia) seria
ignorado silenciosamente, sem erro nenhum — se algum dia esse branch
ganhar um `await` antes do `.innerHTML`, essa chamada para de funcionar
sem avisar. Teste de regressão (`tests/catalogo-editor-fotos-browser.cjs`)
usa `page.waitForEvent('filechooser')` pra confirmar que o seletor abre
sozinho — não dava pra confiar só em `setInputFiles()` ter funcionado,
porque isso funciona mesmo sem o clique automático (só define o arquivo
direto no input, não prova que o seletor teria aberto sozinho pro
usuário de verdade).

**Overlay "+ Escolher foto" explodindo de tamanho num slot de Detalhe
vazio** (reportado com print: o overlay ocupava a largura inteira da
página, bem maior que o quadradinho pequeno que deveria substituir).
Causa: o `<button class="detail-thumb is-empty-editable">` (Detalhe
ainda sem foto, `detailGallery()`) nunca tinha `.catalog-editable` — só
o `<button class="detail-thumb catalog-editable">` do slot JÁ preenchido
tinha essa classe, que é quem dá `position:relative` ao quadradinho (ver
regra `.catalog-editable{position:relative}`). Sem `position:relative`
no próprio botão, o `.catalog-inline-crop-overlay` que é anexado dentro
dele (`position:absolute;inset:0`) não tinha um ancestral posicionado
por perto pra se ancorar — subia a árvore até achar um
(`.catalog-detail-panel{position:relative}`, bem mais acima), e
`inset:0` relativo a ESSE elemento cobria uma área muito maior que o
quadradinho de Detalhe. Corrigido adicionando `.catalog-editable`
também ao botão vazio (`class="detail-thumb is-empty-editable
catalog-editable"`) — agora os dois estados (preenchido e vazio) têm
`position:relative` por igual. **Achado ao corrigir**: o teste de
regressão (`tests/catalogo-editor-fotos-browser.cjs`) contava
`.detail-thumb.catalog-editable` esperando 1 (só o preenchido) — depois
dessa mudança essa contagem virou 2 (os dois têm a classe agora), então
o teste precisou trocar pra `.detail-thumb.catalog-editable:
not(.is-empty-editable)` pra continuar distinguindo preenchido de vazio;
ganhou também uma comparação de `boundingBox()` do quadradinho ANTES do
clique contra o overlay DEPOIS (tolerância de 5px) — só contar a classe
certa não prova que o TAMANHO ficou correto, é um bug de layout, não de
presença de classe.

## Esmaecer a borda das fotos contra o branco — tentado e revertido

O usuário pediu, com print mostrando a foto de um sofá, pra disfarçar
com uma máscara CSS a "costura" visível onde o fundo de estúdio da foto
(raramente um branco puro idêntico ao `#fff` da página) encontra o
branco ao redor, e a sombra do produto cortada de forma abrupta pelo
`overflow:hidden` do contêiner. Chegou a ser implementado (duas máscaras
lineares por eixo, uma faixa mais larga na foto principal/Ambientada,
calibrada visualmente com Playwright) e depois de restringir o escopo só
pra principal+Ambientada (não Detalhes, não os cards da Home), o usuário
**voltou atrás e pediu pra remover por completo**: "esquece, pode
remover essa função de esmaecer ao redor da foto, pode voltar como era
antes, não quero que esmareça foto nenhuma mais". Revertido — nenhuma
foto do catálogo tem `mask-image`/`mask-composite` hoje. Registrado aqui
só pra não propor essa mesma ideia de novo se um problema parecido
("borda/costura visível na foto") for reportado no futuro — já foi
tentada e explicitamente rejeitada.

## Resíduos de bege encontrados depois de checar "o fundo do catálogo está branco?"

Pedido do usuário pra confirmar: "o fundo do catálogo está branco porque
se não tiver quero que seja totalmente branco" — varredura por
`background:#f...` e pelos hex bege já conhecidos desta sessão
(`#f7f3ec`/`#faf8f4`/`#f4f1ea`, ver "Toda cor de fundo bege do catálogo
virou branco" mais acima) encontrou 3 resíduos que tinham escapado
daquela limpeza por terem sido escritos DEPOIS dela, na mesma sessão:

1. `.detail-thumb.is-empty-editable{background:#faf8f4}` (quadro "+
   Adicionar" de um slot de Detalhe vazio) → `#fff`.
2. `.catalog-inline-crop-overlay{background:#f4f1ea}` (fundo do overlay
   de ajuste de foto, atrás do "Carregando…"/seletor de arquivo) → `#fff`.
3. **O mais sério, não é só CSS**: `flattenImageOnCatalogBackground()`
   (usada ao exibir o resultado de "Experimente outro tecido") desenhava
   num `<canvas>` com `context.fillStyle="#f7f3ec"` antes de compor a
   imagem da IA por cima — qualquer transparência da IA virava bege de
   verdade, nos PIXELS da imagem final, não só um problema de CSS.
   Corrigido pra `#ffffff`. **Causa raiz de verdade**: o PRÓPRIO PROMPT
   enviado pra IA (`generateFabricVariation()`) instruía "O fundo deve
   ser liso, uniforme e totalmente opaco na cor creme exata do catálogo
   #F7F3EC... sem... branco puro..." — ou seja, a IA gerava a imagem
   JÁ com fundo bege opaco (sem transparência nenhuma pra
   `flattenImageOnCatalogBackground` sequer ter o que corrigir),
   seguindo uma instrução escrita quando o catálogo ainda era bege, nunca
   atualizada quando o fundo virou branco. Corrigido o texto do prompt
   pra pedir "branco puro exato do catálogo #FFFFFF" e removida a
   proibição de "branco puro" da lista do que evitar (agora é
   exatamente o oposto do que se quer). **Se o resultado de "Experimente
   outro tecido" ainda vier com fundo levemente fora do branco depois
   dessa correção**, é a IA não seguindo a instrução à risca (comportamento
   do modelo, não do código) — não confundir com o bug antigo do prompt
   errado, que sempre pedia bege de propósito.

## Trilha de navegação abaixo do cabeçalho (Catálogo / Categoria / Item)

**Apagada depois a pedido do usuário** — ver "Trilha "Catálogo / Categoria / Item" apagada + logo do cabeçalho maior" mais abaixo. Nada desta seção existe mais no código (`renderBreadcrumb()` virou `syncNavigation()`, sem desenhar trilha); mantida só pelo histórico do raciocínio.

Pedido explícito do usuário: "por baixo do menu, ali embaixo da logo eu
quero um caminho da pessoa, por exemplo, catálogo, sofás e o nome do
sofá... pra pessoa saber o caminho que ela percorreu". Um breadcrumb
(`#catalogBreadcrumb`) com 2 segmentos clicáveis ("Catálogo" volta pra
Home, a categoria volta pro topo dela) e um último segmento só-texto
("você está aqui").

**Escopo confirmado com o usuário, em duas rodadas**: primeiro pediu
"quero que todas as telas tenham isso" (soando como o sistema inteiro),
depois esclareceu que era só dentro do próprio módulo Catálogo — mas
TODAS as telas de dentro dele, não só a navegação de produtos: "é só
dentro de catálogo que precisa ter isso, mas por exemplo no catálogo tem
mas na biblioteca não tem". Ou seja: **só o Portal fica sem trilha**
(ponto de partida, nenhum caminho percorrido ainda); Home, categoria/
item, Biblioteca e Painel 3D têm todos, com o texto do último segmento
mudando conforme a tela:
- Home: só "Catálogo" (1 segmento, indica que já entrou no catálogo mas
  ainda não escolheu categoria).
- Categoria/item: "Catálogo / Categoria / Nome do item em foco".
- Biblioteca: "Catálogo / Biblioteca".
- Painel 3D: "Catálogo / Painel 3D".

**Biblioteca e Painel 3D são overlays abertos por `setActiveOverlay(mode)`**
(`catalogo.mjs`) — `renderBreadcrumb()` é chamada de lá também, então
funciona não importa se o overlay foi aberto pelo botão do cabeçalho OU
direto de um bloco do Portal (`activateGatewayTile`), sem passar pela
Home. **Achado real ao testar**: `state.overlay` precisa ser checado
ANTES de `state.activeView===GATEWAY_VIEW` dentro de `renderBreadcrumb()`
— abrir a Biblioteca direto do Portal deixa `state.activeView` ainda em
`GATEWAY_VIEW` (só `activateGatewayTile` muda, sem passar por
`applyView`), então checar `GATEWAY_VIEW` primeiro escondia a trilha da
Biblioteca indevidamente; corrigido invertendo a ordem dos `if`s.

**Reaproveita o mesmo `IntersectionObserver` que já revela cada seção
durante o scroll** (`state.activeSection`, atualizado em
`setupObservers()`) — `renderBreadcrumb()` é chamada de dentro desse
mesmo callback, então o 3º segmento troca de nome sozinho conforme a
pessoa rola de um produto pro próximo dentro da mesma categoria, sem
precisar de nenhum observer novo. Também chamada por `applyView()`
(trocar de categoria/Home), pela busca (query vazia volta pro estado
anterior) e uma vez em `init()` — sempre recalculada do zero a partir de
`state.activeView`/`state.activeSection`, nunca guardada à parte
(mesmo padrão de `currentViewLabel()`, que o breadcrumb reaproveita pro
nome da categoria). No modo GRADE (sem "item em foco" nenhum, é uma
grade estática) só os 2 primeiros segmentos aparecem.

**HTML tem um wrapper, `.catalog-top-chrome`, envolvendo
`<header class="catalog-header">` + `<nav id="catalogBreadcrumb">`** —
mas não pra reservar espaço extra: é só o ponto de ancoragem
(`position:sticky;top:0`) pra `.catalog-breadcrumb` (dentro dele) se
posicionar `position:absolute;top:100%`, colada embaixo do cabeçalho,
acompanhando o scroll junto com ele.

**Primeira versão empurrava o conteúdo pra baixo (revertida)**: a
trilha entrava no fluxo normal, e `--header-h` (usado em vários `calc()`
pela altura de cada seção de produto em tela cheia) foi ajustado pra
contar cabeçalho+trilha juntos, encostando o topo de cada seção logo
abaixo dela. Funcionava sem cortar nada, mas o usuário reportou com
print: "a foto está indo só até a linha [da trilha], eu quero que ela
vá até o menu" — a foto Ambientada (`.product-event-panel`, cheia até a
borda de propósito, pensada pra tocar o cabeçalho) parava na trilha em
vez de continuar até lá. **Corrigido trocando a trilha pra overlay**:
`position:absolute` (não reserva espaço, flutua por CIMA do que vier
depois), fundo `rgba(255,255,255,.85)` + `backdrop-filter:blur(8px)`
(mesmo truque dos outros controles flutuantes sobre foto do catálogo,
ex. `.product-main-back`) pra continuar legível tanto sobre fundo branco
quanto sobre foto cheia de detalhe. `--header-h` voltou a refletir só a
altura do PRÓPRIO cabeçalho (`watchHeaderHeight` observa `.catalog-
header` de novo, não mais o wrapper) — a trilha não entra mais nessa
conta, de propósito, exatamente pra poder sobrepor o topo do conteúdo em
vez de empurrá-lo. **Por que o título do item não fica coberto**: o
padding-top de `.catalog-detail-panel` (38px) é maior que a altura da
trilha (~28px) — ela flutua exatamente dentro desse respiro que já
existia, nunca sobre o texto. Verificado com Playwright comparando
`boundingBox()` do cabeçalho, da trilha, do painel de evento e do
título — não dava pra confiar só em inspeção visual rápida pra saber se
algo ficava coberto ou cortado.

Teste de regressão: `tests/catalogo-breadcrumb-browser.cjs` (some no
Portal/Home, mostra Catálogo/Categoria/Item numa categoria, atualiza o
3º segmento ao rolar pra outro produto, cabeçalho+trilha não cobrem o
topo da seção, clique nos 2 primeiros segmentos navega de verdade,
mobile sem overflow).

## Login direto da equipe pela própria tela do catálogo (sem passar pelo sistema)

Pedido explícito do usuário, depois de já existir a edição inline de
fotos pra quem acessa "de dentro do sistema": *"ao invés de eu editar
pelo sistema eu quero editar pelo catálogo mesmo, só que ao invés de eu
entrar com o login do cliente, vou entrar com o meu login, e o catálogo
vai reconhecer que o meu login pode fazer edições"* — ou seja, abrir o
link público/normal do catálogo (não pelo menu do dashboard) e, na MESMA
tela de login que um decorador usaria, entrar com a própria conta da
equipe (a mesma de `login.html`) em vez do e-mail/senha de um cliente.

**Não precisou mexer no banco.** Investigação antes de implementar:
`catalogo_carregar_interno(p_empresa_id)` (RPC já usada pelo acesso
interno via dashboard) já é protegida no PRÓPRIO banco por
`auth.uid()`+`funcionario_pode(p_empresa_id,auth.uid(),'comercial.
catalogo.visualizar')` — independente de COMO essa sessão do Supabase
Auth foi criada (login em `login.html` ou um login direto nesta tela, o
token é o mesmo tipo de coisa). As escritas (trocar foto, capa da
categoria, Biblioteca, Portal) também não passam por RPC própria — são
`supabase.from(...).update/insert/delete()` diretos, protegidos por RLS
via `usuarios_empresas`, que também não liga pra como a sessão nasceu.
Ou seja, a autorização de verdade sempre existiu no nível certo; só
faltava o FRONTEND reconhecer esse caminho e mostrar a UI de edição.

**`acessoInternoDoSistema()` (checa só `sessionStorage.login_ok`)
continua existindo, mas mudou de papel**: agora só decide a classe
visual `.catalog-modo-sistema` (esconder marca/busca do catálogo porque
o dashboard já tem as suas) — só faz sentido quando REALMENTE veio do
dashboard. A permissão de EDITAR (`state.acessoInterno`) passou a vir de
uma função nova, `resolveAcessoInterno()`: confere se existe uma sessão
de verdade do Supabase Auth (`supabase.auth.getUser()`) e, se houver,
repete a MESMA checagem de permissão que `catalogo_carregar_interno` já
faz no banco (`funcionario_contexto` + `get_permissoes_usuario_
resolvidas`/`comercial.catalogo.visualizar`) — client-side, só pra
decidir se mostra a UI, nunca a barreira real. Retorna o `empresa_id` se
autorizado, `null` em qualquer outro caso (sem sessão, sem permissão,
erro de rede) — nunca lança exceção, porque um decorador SEM sessão
nenhuma do Supabase Auth é o caso mais comum, não uma falha.

**`init()` ficou com 2 caminhos pra reconhecer a equipe**, não 1:
1. `acessoInternoDoSistema()` true (veio do dashboard) → continua igual
   a antes (checagem estrita, lança erro claro — "Acesso indisponível"/
   "Você não possui permissão" — se algo não bater; isso é DELIBERADO,
   ver próximo parágrafo).
2. `acessoInternoDoSistema()` false → tenta `resolveAcessoInterno()`
   SILENCIOSAMENTE antes até de mostrar o formulário (cobre o caso de
   recarregar a página já autenticado — ver abaixo); se retornar `null`,
   mostra o formulário de login (`requireCatalogLogin()`).

**Por que os dois caminhos não foram unificados num só**: se um membro
da equipe abre pelo DASHBOARD e por algum motivo não tem permissão de
catálogo, o usuário quer um erro claro e específico ("você não tem
permissão"), não ser jogado silenciosamente pra tela de login de
decorador (ele não tem senha de decorador nenhuma, ficaria preso sem
entender por quê). Já pra quem abre o link direto sem vir de lugar
nenhum, não dá pra saber de antemão se é decorador ou equipe — aí faz
sentido tentar silenciosamente e cair no formulário genérico se não
bater.

**`requireCatalogLogin()` ganhou um segundo passo dentro do mesmo
formulário**, sem nenhum campo/toggle novo no HTML — o mesmo par
e-mail/senha serve pros dois tipos de conta: (1) tenta `catalogo_login`
(decorador, fluxo de sempre); se não bater (retorna `null`, não é
exceção — nem toda tentativa errada é erro de rede) e não for falha de
rede, (2) tenta `supabase.auth.signInWithPassword` com a MESMA conta de
`login.html`; se autenticar, chama `resolveAcessoInterno()` de novo pra
confirmar que essa conta tem permissão de ver o catálogo — se tiver,
libera; se NÃO tiver (login válido mas sem a permissão), chama
`supabase.auth.signOut()` na hora (não deixa uma sessão autenticada
pendurada nesta aba pra alguém que não devia ter acesso a nada aqui) e
cai na MESMA mensagem genérica "E-mail ou senha inválidos." dos outros
casos — de propósito, pra não vazar "essa conta existe mas não tem
permissão" pra quem está só tentando adivinhar credenciais.

**Sem `catalog-modo-sistema` no login direto**: diferente do acesso pelo
dashboard, aqui não tem menu nenhum por cima — o cabeçalho normal do
catálogo (marca, busca, categorias) continua aparecendo, igual um
decorador veria, só que com os controles de edição também visíveis. Essa
foi uma decisão tomada sem confirmar com o usuário (ele não descreveu
nenhuma mudança de visual, só de PERMISSÃO) — se a intenção era outra,
é só pedir.

**Anti-flash, mesmo padrão já usado nesta sessão**: como o Supabase Auth
persiste a sessão sozinho (sobrevive a recarregar a página), reabrir o
catálogo depois de um login direto não deveria pedir login de novo — mas
o script `<head>` que evita o "pisca" da tela de login (ver seção
"Anti-flash do login..." acima) só conhecia `sessionStorage.login_ok`.
Ganhou um segundo hint, `catalogo_acesso_interno_direto` (gravado só
depois de um login direto bem-sucedido, tanto no formulário quanto ao
recuperar uma sessão já existente em `init()`) — o script anti-flash
esconde `#catalogLogin` se QUALQUER um dos dois estiver presente, mas só
adiciona `catalog-modo-sistema` pro caso `login_ok` (mesma razão do
parágrafo anterior). **Achado ao testar**: se esse hint ficar
"desatualizado" (sessão expirou/permissão foi revogada, mas o hint
antigo ainda está na sessionStorage), o script anti-flash escondia o
login achando que ainda era válido — e como `requireCatalogLogin()` só
ADICIONAVA a classe `.hidden`, nunca REMOVIA, a tela ficava presa em
branco (nem catálogo, sem sessão real, nem formulário, escondido à toa).
Corrigido: `requireCatalogLogin()` agora começa removendo tanto o hint
quanto a classe `.hidden` do login, garantindo que o formulário SEMPRE
apareça de verdade quando é realmente necessário.

Teste de regressão: `tests/catalogo-login-equipe-browser.cjs` (5
cenários — credenciais que não batem com nada mostram a mensagem
genérica; login direto da equipe libera os mesmos controles de edição
sem a classe `catalog-modo-sistema` e grava o hint; recarregar a página
depois de logado não pede login de novo; conta da equipe válida mas SEM
permissão é deslogada na hora com a mesma mensagem genérica de sempre;
decorador continua funcionando pelo mesmo formulário sem "vazar" pra
tentativa de login da equipe). **Achado ao escrever o teste**: um mock
de `signedInId` guardado numa variável comum (closure) parecia
funcionar, mas o cenário de "recarregar a página" sempre falhava — causa
real: `page.addInitScript()` reinjeta o script em TODA navegação,
inclusive `page.reload()`, o que resetava a variável e escondia
justamente o comportamento de persistência que o teste precisava provar.
Corrigido guardando o estado no `sessionStorage` da própria página mock
(sobrevive a reload, mas começa vazio numa aba nova — isolamento certo
entre cenários). Lição válida pra qualquer teste que simule "sessão
persistida entre recarregamentos": estado de mock em variável de JS não
sobrevive a navegação nenhuma, nem reload.

## Fotos maiores + hover premium nos cards da Home (categorias)

**A coluna mínima de 190px descrita aqui foi reduzida depois pra 160px**
— ver seção "Fotos da Home diminuídas 'um pouco'" mais abaixo. O efeito
de hover (zoom) e o resto desta seção continuam valendo, só o número
190 mudou.

Pedido explícito do usuário, com print da grade de categorias: "quero
que aumente essas fotos e quero que tenha um efeito quando eu passar o
mouse por cima delas também, um efeito bonito e premium que seja
sofisticado igual o que estamos criando" — reaproveitando a mesma
linguagem visual já usada na foto Ambientada do item (escurecer gradual
+ zoom lento com easing suave, `.product-event-panel:hover` mais abaixo
em `catalogo.css`).

**Fotos maiores**: `.catalog-grid.catalog-home-grid` tinha coluna mínima
de 130px (`grid-template-columns:repeat(auto-fill,minmax(130px,1fr))`)
— subiu pra 190px, o que sozinho já reduz quantas categorias cabem por
linha e deixa cada uma bem maior, sem precisar de breakpoint manual
novo (o `auto-fill` recalcula quantas colunas cabem sozinho, do mobile a
telas grandes — mesma lógica documentada na seção "Home do catálogo"
mais acima). Gap entre cards e tamanho do nome também aumentaram
proporcionalmente.

**Efeito no hover, simplificado depois em 2 rodadas de ajuste fino**:
primeira versão tinha zoom + véu escuro leve + sombra "levantando" a
foto + sublinhado crescendo no nome. Usuário pediu pra tirar tudo menos
o zoom: "não quero que tenha essa mudança de cor deixando mais escuro,
essa sombra. quero apenas que deixe o zoom" — removidos o `::before`
escuro, o `box-shadow`, o `translateY` e o sublinhado do nome; só sobrou
`.catalog-home-card .catalog-grid-card-photo img{transition:transform
1400ms cubic-bezier(.22,1,.36,1)}` + `scale()` no hover. Em seguida
"esse zoom pode ser mais intenso do que você colocou, quase não está
dando pra ver ele" — `scale(1.07)` (quase igual ao 1.045 usado na foto
Ambientada/gateway) subiu pra `scale(1.18)`, bem mais perceptível.
Verificado visualmente com Playwright (screenshot normal vs. hover lado
a lado) antes de considerar calibrado — a diferença de 7% pra 18% não é
óbvia só lendo o número, precisa ver renderizado.

**Bug real, achado rodando a suíte de testes (não só nesta sessão — quebrou
5 testes já existentes de uma vez)**: a primeira versão aplicava o
"levantar" (`transform:translateY(-6px)`) no PRÓPRIO `<button
class="catalog-home-card">` — o elemento clicável. Isso fez o
Playwright travar com "element is not stable" em TODO clique num card da
Home: o botão ficava continuamente se movendo durante os 500ms da
transição de hover, e a checagem de "elemento parado antes de clicar"
do Playwright nunca convergia. **Isso não é só um problema de teste** —
o mesmo motivo faria um clique real de um usuário (principalmente um
clique rápido, ou em touchpad/mouse menos preciso) "errar" o alvo, já
que ele desliza sob o cursor bem na hora do clique. Corrigido movendo o
`translateY` pra um elemento FILHO (`.catalog-grid-card-photo`, a foto
em si) em vez do `<button>` que a envolve — `transform` num filho não
muda o `getBoundingClientRect()` do pai (o botão continua com a mesma
caixa o tempo todo), então o alvo do clique fica perfeitamente parado
mesmo com a foto "flutuando" visualmente por cima dele. Mesmo efeito
visual, sem o efeito colateral. **A lição continua valendo mesmo depois
do `translateY` ter sido removido de vez** (ver "simplificado depois"
acima, o usuário tirou o "levantar" por completo) — qualquer efeito de
hover FUTURO que volte a mexer em `transform`/posição precisa continuar
mirando um elemento filho do `<button>`, nunca o próprio botão.

Teste de regressão: `tests/catalogo-menu-browser.cjs` ganhou 2 checagens
novas — tamanho mínimo da foto (≥190px) e que a foto realmente recebe
`transform:scale()` no hover — mas a prova de verdade é indireta: o
PRÓXIMO clique do teste (que já existia, pra entrar na categoria)
continua rodando logo depois de passar o mouse sobre o card; se o bug do
`translateY` no botão voltasse, é esse clique que travaria (30s de
timeout), não uma asserção de estilo isolada.

## Categoria sempre abre em modo grade (não mais direto na imersiva)

Pedido explícito do usuário, com print mostrando a visualização em
grade aberta dentro de uma categoria: "quando eu clicar em categoria, eu
quero que apareça assim, sempre". Antes, clicar num card da Home levava
direto pra visualização imersiva (tela cheia, uma seção de produto por
vez, `state.viewMode` começava em `"immersive"` e só mudava se a pessoa
clicasse no ícone de alternância `#catalogViewToggle`). Agora
`applyView(view)` força `state.viewMode = "grid"` toda vez que `view` é
uma categoria de verdade — clicar num card da Home, ou voltar pra uma
categoria pela trilha (`[data-breadcrumb="category"]`), sempre cai na
grade primeiro. Clicar num item da grade continua abrindo ele na
imersiva normalmente (`openImmersiveFromGrid`, sem mudança) — só o PONTO
DE ENTRADA da categoria mudou; o toggle `#catalogViewToggle` continua
funcionando pra quem quiser trocar de volta pra imersiva depois de já
estar dentro.

**Por que o reset fica DENTRO de `applyView()`, escopado só pra
categoria (`view !== GATEWAY_VIEW && view !== HOME_VIEW`), em vez de
mudar o valor INICIAL de `state.viewMode`**: a primeira tentativa mudou
o default do `state` de `"immersive"` pra `"grid"` diretamente — quebrou
`tests/catalogo-browser.cjs`, que pesquisa um item a partir da Home
(sem nunca clicar numa categoria) e esperava ver o resultado na
imersiva. A busca (`#catalogSearch`) não passa por `applyView()`, só
chama `renderProducts()` direto — ela herda o que `state.viewMode`
estiver valendo NAQUELE momento, então mudar o valor inicial global
também mudava o comportamento da busca, que o usuário não pediu pra
mudar. Corrigido revertendo o default global e movendo o "força grade"
pra dentro de `applyView()`, condicionado a `view` ser uma categoria de
verdade — Home e Portal não usam `viewMode` mesmo, então não precisam
desse reset, e a busca (que não passa por `applyView`) continua com
qualquer que seja o último `viewMode` válido, preservando o
comportamento de sempre.

Teste de regressão: como isso muda o PONTO DE ENTRADA de qualquer
categoria, quebrou (de propósito, revelando exatamente onde precisava de
ajuste) 4 testes que já existiam e clicavam num card da Home esperando
cair direto na imersiva (`catalogo-menu-browser.cjs`,
`catalogo-editor-fotos-browser.cjs`, `catalogo-login-equipe-browser.cjs`,
`catalogo-breadcrumb-browser.cjs`) — todos ajustados pra clicar também
num `[data-grid-item]` depois de entrar na categoria, replicando o fluxo
real (categoria → grade → clique no item → imersiva).
`catalogo-menu-browser.cjs` e `catalogo-breadcrumb-browser.cjs` também
ganharam asserções novas confirmando o modo grade explicitamente (nenhum
`.catalog-product-section` visível, `#catalogViewToggle.is-grid`
marcado, trilha mostrando só Catálogo/Categoria sem nome de item
enquanto não há nenhum "em foco").

## Botões "Biblioteca"/"Painel 3D" removidos do cabeçalho → rótulo da página atual

Pedido explícito do usuário: "ali onde está biblioteca e painel 3d no
menu eu quero remover, e ali sempre vai entrar o nome da página que
estamos, por exemplo essa do print que te mandei deve ser home, a outra
deve ser categoria". Os dois botões que ficavam soltos no cabeçalho
(`[data-biblioteca-toggle]`/`[data-studio-toggle]`, HTML removido de
`.catalog-navigation`) viraram um único `<span id="catalogPageLabel">`
texto, não clicável, que sempre mostra onde a pessoa está:

- Portal → **"Home"** (nome do usuário pro que o código chama de
  `GATEWAY_VIEW` — não confundir com `HOME_VIEW`, que no código é a
  grade de categorias).
- Grade de categorias (`HOME_VIEW`) → **"Categoria"**.
- Dentro de uma categoria (grade ou imersiva) → o nome da própria
  categoria (`currentViewLabel()`, já existia, reaproveitado).
- Biblioteca → **"Biblioteca"**; Painel 3D → **"Painel 3D"**.

`updatePageLabel()` (`catalogo.mjs`) fica coladinha a `renderBreadcrumb()`
— chamada de dentro dela, roda nos MESMOS gatilhos que a trilha já
cobria (`applyView`, `setActiveOverlay`, observer de seção, busca,
`init()`) sem precisar de nenhum ponto de chamada novo. Diferente da
trilha (que some no Portal), o rótulo **sempre mostra algo**, inclusive
no Portal.

**Fonte do rótulo é IDÊNTICA à do título "CATEGORIAS" da própria página**
(`.catalog-grid-heading`) — segundo pedido do usuário, comparando os
dois num print: "o que deve aparecer no menu deve ser exatamente aquela
escrita ali na parte de baixo categorias, mesma fonte, mesmo tamanho,
mesma coisa". `.catalog-page-label` usa o mesmo `font-family:"Cormorant
Garamond",serif;font-size:clamp(1.9rem,3vw,2.7rem);font-weight:500;
letter-spacing:.16em;text-transform:uppercase` — só a cor muda (branco,
herdado do cabeçalho escuro; `.catalog-grid-heading` é escura, pensada
pro fundo branco da página). **Achado testando com Playwright, não pedido
mas necessário pra não quebrar o layout**: nesse tamanho de fonte (até
2.7rem), uma categoria de nome comprido ("Banquetas e Bistrôs Altos")
estourava a largura da tela no mobile (390px) — reproduzido só depois de
testar com um nome de categoria longo, não aparecia com nomes curtos.
Corrigido com `overflow:hidden;text-overflow:ellipsis;min-width:0`
(trocando `flex-shrink:0` por `flex-shrink:1`) — trunca com "…" só no
caso extremo (tela estreita + nome comprido), sem precisar diminuir a
fonte no caso comum, preservando o "mesmo tamanho" pedido.

**Efeito colateral aceito conscientemente, não escondido**: os dois
overlays só eram alcançáveis de DOIS jeitos antes — pelos botões do
cabeçalho (rápido, de qualquer lugar) ou pelos blocos do Portal (voltando
primeiro pela logo). Com os botões removidos, só sobra o caminho via
Portal — de dentro de uma categoria, chegar na Biblioteca agora exige
clicar na logo (volta pro Portal, fechando a categoria) e só depois no
bloco certo. Não foi pedido pra compensar isso com um atalho novo; se
fizer falta na prática, é um ajuste separado.

Teste de regressão: `tests/catalogo-menu-browser.cjs` ganhou uma
comparação de `getComputedStyle()` entre `#catalogPageLabel` e
`.catalog-grid-heading` (família/tamanho/peso/espaçamento/caixa
idênticos) — não dava pra confiar só em ler o CSS fonte, precisa
confirmar o que o navegador calculou de verdade pros dois. Os 4 testes
que clicavam direto nos botões removidos
(`catalogo-browser.cjs`/`catalogo-biblioteca-browser.cjs`/
`catalogo-portal-browser.cjs`/`catalogo-breadcrumb-browser.cjs`) foram
ajustados pra usar o caminho novo (logo → Portal → bloco); onde a
asserção verificava a classe `.active` do botão removido, trocada por
conferir o texto de `#catalogPageLabel`.

## Título duplicado removido (nome já aparece no rótulo do cabeçalho)

Pedido explícito do usuário, logo depois do rótulo `#catalogPageLabel`
acima existir: "como o nome está no menu, o que está embaixo pode
remover pra não ficar duplicado" — seguido de um print mostrando
"BIBLIOTECA" escrito duas vezes (uma no cabeçalho, outra como título
grande da página). O `<h2 class="catalog-grid-heading">` que cada tela
desenhava no topo do próprio conteúdo (Home: "Categorias"; dentro de uma
categoria: o nome dela; Biblioteca: "Biblioteca") virou redundante assim
que o cabeçalho passou a mostrar a mesma informação — removido nos 3
lugares:
- `renderHomeMarkup()` (`catalogo.mjs`) — não desenha mais o `<h2>`
  "Categorias".
- `renderFolders()` (`catalogo-biblioteca.mjs`) — não desenha mais o
  `<h2>` "Biblioteca".
- `renderGridMarkup()` (`catalogo.mjs`, produtos de uma categoria) —
  **não removido incondicionalmente**: essa mesma função também é usada
  pelos resultados de BUSCA (`renderProducts(matches, "Resultados da
  busca")`), e o cabeçalho não reflete o texto da busca em lugar nenhum
  — remover ali apagaria uma informação que não duplica nada. Resolvido
  comparando o `heading` recebido contra `currentViewLabel()`
  (nome da categoria ativa): só desenha o `<h2>` quando os dois são
  DIFERENTES (`heading !== currentViewLabel()`) — verdadeiro só na
  busca, falso ao simplesmente entrar numa categoria (aí o nome já bate
  com o do rótulo do cabeçalho, então some).

**A classe CSS `.catalog-grid-heading` continua existindo** (mesma
regra de fonte usada pro rótulo do cabeçalho, ver seção acima) — só
parou de ser DESENHADA nos casos que duplicavam. Isso importa pros
testes: o único lugar onde ainda existe um `<h2 class="catalog-grid-
heading">` de verdade no DOM é o resultado de busca — qualquer teste
futuro que precise comparar a fonte do rótulo do cabeçalho contra essa
classe precisa disparar uma busca primeiro pra ter um elemento
renderizado, não pode mais confiar em pegar isso direto da Home ou de
uma categoria.

Teste de regressão: os 3 testes que esperavam `.catalog-grid-heading`
visível na Home/categoria (`catalogo-browser.cjs`, `catalogo-menu-
browser.cjs`, `catalogo-portal-browser.cjs`) foram ajustados pra esperar
`.catalog-home-grid`/`#catalogPageLabel` em vez disso; a comparação de
fonte (rótulo do cabeçalho vs. `.catalog-grid-heading`) que já existia
em `catalogo-menu-browser.cjs` foi movida pra dentro de uma categoria
(onde o modo grade já está ativo) e passou a disparar uma busca ali
pra ter um `.catalog-grid-heading` de verdade renderizado, exatamente
pela razão acima.

## Ícone de pasta da Biblioteca recalibrado (pouco visível na prática)

Pedido explícito do usuário, com print da tela de pastas: "as pastas não
estão muito visíveis, quero mudar elas pra ficar melhores visualmente,
mas quero manter a sofisticação" — continuação da seção "Ícone de pasta
na Biblioteca" mais acima (que trocou o placeholder "Sem foto" por um
SVG de pasta). Causa raiz: na prática, quase toda pasta está vazia até a
equipe subir fotos — e o estado `.is-empty` daquela primeira versão
(pensado pra ser "só um contorno discreto") usava `var(--line)`
(`#ddd6cc`) tanto pro traço quanto um fundo quase branco (`#fbfaf7`),
tudo isso sobre um card que já era branco (`.catalog-grid-card-photo{
background:#fff}`, herdado da Home) — contraste praticamente zero contra
a página. Não aparecia no card ISOLADO de teste (fundo cinza de
placeholder), só ficou óbvio com a tela de verdade, onde é comum TODAS
as pastas estarem vazias ao mesmo tempo.

**Três ajustes, sem abandonar a hierarquia "vazia é mais discreta que
cheia" nem recorrer a cor saturada/genérica** (`catalogo-biblioteca.css`):
1. `.catalog-grid-card-photo.catalog-biblioteca-folder` ganhou fundo
   próprio (`#f7f5f1`, um bege bem sutil) + borda fina (`1px solid
   var(--line)`, ficando `var(--accent)` no hover) — agora toda pasta
   tem uma "moldura" visível por si só, mesmo se o SVG dentro fosse
   invisível.
2. Pasta vazia trocou `var(--line)` por `var(--muted)` (`#77716a`, cinza-
   -marrom médio já usado no catálogo pra texto secundário) — bem mais
   escuro que `--line`, mas ainda claramente "menos" que a cor cheia
   (`var(--accent)`) da pasta com conteúdo.
3. O ícone cresceu de 46% pra 56% do quadrado (mais presença, mesma
   composição).

Verificado com Playwright comparando uma pasta vazia e uma com 1 foto
lado a lado (screenshot, não só lendo os valores de cor) — a diferença
de contraste entre a versão antiga e a nova só fica óbvia olhando o
resultado renderizado. Suíte de regressão inteira do catálogo (8
arquivos) rodada de novo — nenhuma mudança de comportamento, só CSS.

### 2ª rodada, sessão bem mais tarde — a "moldura" virou a própria reclamação

Pedido explícito do usuário, com print da tela de Biblioteca já com
várias categorias reais (a maioria vazia, "0 fotos"): *"quero deixar
essas pastas sem essas caixas em volta, quero que elas fiquem mais
bonitas só a pasta mesmo sabe? só que elas precisam ser visíveis, as
cores que elas estão hoje está muito claro"*. Ou seja: a "moldura"
(fundo bege + borda) adicionada na rodada anterior — pra COMPENSAR um
ícone quase invisível — virou ela mesma o problema (visual "engessado",
cada pasta numa caixinha) sem nunca resolver de fato a causa raiz: o
ícone `.is-empty` continuava usando fills bem pálidos (`front` a
`color-mix(muted 16%, #fff)` — quase branco puro).

**Corrigido removendo a moldura por completo** (`.catalog-home-card
.catalog-grid-card-photo.catalog-biblioteca-folder{background:#f7f5f1;
border:1px solid var(--line)}` e o hover de borda correspondente —
apagados, não só desativados) — o quadrado volta a ser só `background:
#fff` puro, herdado de `.catalog-grid-card-photo` (o mesmo branco de
qualquer card da Home, nenhuma regra própria da Biblioteca sobrando.
**Dessa vez a correção é no PRÓPRIO ícone**, não mais escondida atrás de
uma caixa: `front` da pasta cheia subiu de `accent 32%` pra `accent 55%`
(hover `46%→70%`); `front` da pasta vazia subiu de `muted 16%` pra
`muted 40%` (hover `26%→55%`) — mais que o dobro de opacidade de cor em
ambos os casos, agora com contraste real contra o branco puro da página,
sem precisar de nenhuma caixa por trás.

Teste de regressão (`tests/catalogo-biblioteca-browser.cjs`): confirma
`background-color` computado do quadrado = `rgb(255,255,255)` e
`border-width` = `0px` (sem moldura de verdade, não só nos valores
fonte); e mede a distância de cor real entre o `fill` computado do
`front` (pasta vazia E pasta com fotos) contra branco puro
(`255 - canalVermelho`), exigindo mais de 30 — prova que a cor é
genuinamente visível, não um tom que alguém possa relatar de novo como
"muito claro". Cache-busting bumpado
(`catalogo-biblioteca.css?v=20260919-pasta-sem-caixa`). Suíte completa
(15 arquivos) + `tests/creditos-browser.cjs` + `tests/studio-
browser.cjs` rodadas de novo, todas passando.

### 3ª rodada — ícone flutuando longe do nome, sem a caixa pra "ancorar"

Pedido explícito do usuário, vendo a tela sem a moldura: *"o nome da
pasta está muito longe dela"*.

**Causa raiz**: `.catalog-grid-card-photo` centraliza o conteúdo
(`display:flex;align-items:center;justify-content:center` —
pensado pra uma FOTO cheia, que toca as 4 bordas do quadrado). O ícone
de pasta só ocupa 56% do quadrado E tem proporção mais larga que alta
(`viewBox="0 0 100 80"`) — ao escalar mantendo proporção, sobra bastante
respiro vertical embaixo do desenho, além dos 16px de gap já normais
até o nome (`.catalog-home-card{gap:16px}`). Enquanto a caixa existia,
essa borda inferior "ancorava" visualmente o conjunto; sem ela, o vão
vazio ficou óbvio.

**1ª tentativa, corrigida na rodada seguinte**: `align-items:flex-end`
só pra pasta — o ícone encostava exatamente na base do quadrado, vão
até o nome sumia. Parecia resolvido, mas só tinha REALOCADO o mesmo
vão: como o quadrado inteiro não muda de tamanho, todo aquele espaço
vazio que antes ficava embaixo do ícone passou pra CIMA dele.

### 4ª rodada — o vão só tinha mudado de lado, agora empurrando as pastas pra baixo do menu

Pedido explícito do usuário, vendo a tela com a correção acima já
aplicada: *"elas também estão aparecendo muito embaixo do menu, elas
precisam subir mais, olha o espaço que está entre o menu e a primeira
linha"*.

**Causa raiz de verdade** (medida com `getBoundingClientRect()`, não só
lida no CSS): o vão entre a trilha e o topo do quadrado da pasta era só
~28px, igual a qualquer outro card — o vão de verdade estava DENTRO do
próprio quadrado, entre o topo dele e o ícone (que só ocupava 56% da
altura, ainda mais reduzido depois de escalar mantendo a proporção
100×80 do viewBox). Ancorar o ícone na base (rodada anterior) resolveu
o vão ATÉ O NOME só transferindo esse mesmo espaço vazio pra ANTES do
ícone — nunca reduziu a quantidade total de vão, só trocou de lado.
Mover o `align-items` sozinho nunca resolveria as duas queixas ao mesmo
tempo, porque as duas queixas são o MESMO vão, só reclamado de lados
opostos.

**Corrigido de vez**: removido o `align-items:flex-end`, ícone voltou a
ficar centralizado (sem ancorar em nenhuma borda), e o tamanho subiu de
56% pra 86% do quadrado — reduz o vão dos DOIS lados ao mesmo tempo (em
vez de só realocar o mesmo vão de um lado pro outro), com uma margem
pequena e BALANCEADA sobrando em cima e embaixo do ícone.

Teste de regressão (`tests/catalogo-biblioteca-browser.cjs`): a
asserção da rodada anterior (`icon.bottom===box.bottom`, provando o
ancoramento) foi substituída por 4 novas — o ícone ocupa mais de 80% da
altura do quadrado; a margem acima dele é pequena (<24px, sem vão até o
topo); a margem acima e a margem abaixo do ícone são praticamente
IGUAIS (diferença <2px — prova que nenhum lado concentra o vão
sozinho, a causa raiz de verdade das duas rodadas anteriores); e a
distância até o nome continua pequena. Cache-busting bumpado
(`catalogo-biblioteca.css?v=20260919-pasta-icone-grande`). Suíte
completa (15 arquivos) + `tests/creditos-browser.cjs` + `tests/studio-
browser.cjs` rodadas de novo, todas passando.

### 5ª rodada — foto "saindo" da pasta (pedido novo, não um bug)

Pedido explícito do usuário, com print da tela já com o ícone maior:
*"quero que as pastas tenham um efeito de parecer que a foto tá saindo
dela, sabe?"*.

**Só faz sentido pra pasta com pelo menos 1 foto** — uma pasta vazia
não tem nenhuma foto pra "sair" dela, então continua só com o ícone
puro, sem nenhum elemento novo no DOM (não é escondido via CSS, o HTML
gerado nem inclui o grupo da foto quando `photos.length===0`).

**Implementação, dentro do MESMO `<svg>` do ícone da pasta** — não como
um `<img>` HTML separado por cima: `folderIconSvg(photoUrl, uid)`
(`catalogo-biblioteca.mjs`, antes um template fixo `FOLDER_ICON_SVG`,
agora uma função) insere um `<image>` (SVG, não HTML) ENTRE os rects
`back` e `front` do ícone, no MESMO sistema de coordenadas do viewBox
(`0 0 100 80`) — evita ter que calcular posição/escala em CSS por fora,
o SVG inteiro já escala/centraliza sozinho dentro do quadrado (ver
`.catalog-biblioteca-folder-icon`). A ordem dentro do SVG É o efeito:
como `front` é desenhado DEPOIS (pinta por cima), ele cobre a parte de
baixo da foto — só a parte de CIMA, que ultrapassa onde `front` começa
(y=32) e principalmente onde `back` nem chega (y<22), fica visível de
verdade "saindo" pra fora do contorno da pasta. Foto usa a PRIMEIRA
(`photos[0].url`) da categoria — mesmo critério de "capa" já usado em
outros lugares do catálogo (`categoryCoverPhoto`, etc.) — recortada num
retângulo com cantos arredondados (`<clipPath>`, `preserveAspectRatio=
"xMidYMid slice"`, evita distorcer fotos de qualquer proporção) e uma
moldura branca com sombra (`.catalog-biblioteca-folder-peek-frame`,
`stroke:#fff`+`filter:drop-shadow`) pra separar visualmente da pasta,
como uma foto/polaroid de verdade.

**`uid` = o próprio slug da categoria** (já único por pasta) vira o id
do `<clipPath>` — evita colisão de id quando várias pastas com foto
aparecem na mesma página (todas usariam `#peek` se fosse um id fixo).

**Reforço no hover**: a foto gira um pouco menos (`rotate(-7deg)→
rotate(-3deg)`) e sobe alguns pixels (`translateY(-4px)`) — reforça a
sensação de estar sendo puxada pra fora, sem exagerar (transição suave,
`cubic-bezier(.22,1,.36,1)`, mesma curva já usada em outros hovers
"premium" desta sessão). `transform-box:fill-box` é o que faz a rotação
girar em torno do CENTRO da própria foto, não do canto (0,0) do viewBox
inteiro — sem isso a foto sairia de posição ao rotacionar.

Teste de regressão: confirma que a pasta com foto (Sofás, 2 fotos)
ganha `.catalog-biblioteca-folder-peek` com a `<image href>` apontando
pra PRIMEIRA foto da categoria; confirma que a pasta vazia (Bares, 0
fotos) tem ZERO desse elemento — ausente do DOM, não só invisível.
Cache-busting bumpado (`catalogo-biblioteca.css?v=20260919-foto-saindo`,
e o import de `catalogo-biblioteca.mjs` dentro de `catalogo.mjs` + a
própria tag `<script>` de `catalogo.mjs`, todos pra
`?v=20260919-foto-saindo`). Suíte completa (15 arquivos) + `tests/
creditos-browser.cjs` + `tests/studio-browser.cjs` rodadas de novo,
todas passando.

### 6ª rodada — fotos dentro da pasta aberta viram mosaico, não quadrados iguais

Pedido explícito do usuário, depois de abrir uma pasta com fotos de
verdade: *"não quero que as fotos apareçam todas do mesmo tamanho, quero
igual instagram, site de fotógrafo profissional"*. Causa: a grade de
fotos dentro de uma pasta aberta (`.catalog-biblioteca-photos`) forçava
cada foto num quadrado idêntico (`grid-template-columns:repeat(auto-fill,
minmax(170px,1fr))` + `aspect-ratio:1/1` + `object-fit:cover` na
`<img>`) — qualquer foto que não fosse quadrada era cortada pra caber,
perdendo a proporção original.

**Reaproveitada a MESMA técnica já usada no modo "mosaico" dos produtos
do catálogo** (`.catalog-mosaic` em `catalogo.css`, ver seção "3º modo de
visualização: mosaico" mais abaixo — já validada nesta sessão pra
exatamente esse efeito "bagunçado"/moodboard): `column-count` monta as
colunas sozinho, cada foto entra com a ALTURA NATURAL dela (`.catalog-
biblioteca-photo img{width:100%;height:auto}`, sem `object-fit` nem
`aspect-ratio` nenhum) e `break-inside:avoid` evita que uma foto seja
cortada ao meio entre duas colunas — o próprio `columns` distribui
blocos de altura desigual pelas colunas, dando o efeito Pinterest/
portfólio de fotógrafo sem precisar calcular posição de cada foto em
JS. `column-count` cai de 4 (desktop) pra 3/2/1 nos mesmos breakpoints
que a grade antiga já usava.

**Achado verificando com um script Playwright ad-hoc, erro meu, não do
produto**: a 1ª tentativa de fixture (uma foto "alta" registrada com
`page.route('https://fixture/biblioteca/sofa-2.png', ...)` ANTES do
catch-all `page.route('https://fixture/**', ...)`) não mostrava nenhuma
diferença de altura entre as fotos — o Playwright dá prioridade ao
route MAIS RECENTEMENTE registrado quando dois batem na mesma URL, então
o catch-all (registrado depois) sempre vencia, silenciosamente
sobrescrevendo a foto "alta" de volta pro tamanho padrão 300×300. Dava a
falsa impressão de que o CSS do mosaico não estava funcionando. Corrigido
invertendo a ordem (catch-all primeiro, override específico depois) —
mesma lição já aplicada na suíte permanente de testes.

Teste de regressão (`tests/catalogo-biblioteca-browser.cjs`) ganhou um
override de tamanho pra uma das fotos do cenário (`sofa-2.png` a
300×600, bem mais alta que as outras a 300×300) e uma asserção nova
comparando a altura renderizada das duas fotos
(`photoHeights[0]!==photoHeights[1]`) — prova que proporções diferentes
realmente renderizam em alturas diferentes, sem cortar pra um tamanho
comum. Cache-busting bumpado (`catalogo-biblioteca.css?v=
20260919-mosaico` em `catalogo.html`) — `catalogo-biblioteca.mjs` não
mudou nesta rodada (só CSS), então o `?v=` do import em `catalogo.mjs`
ficou em `20260919-foto-saindo`, sem necessidade de bump. Verificado
visualmente com Playwright (screenshot com fotos de proporções bem
variadas — 450/180/300/600/187/380/192/300/500/195px — confirmando um
layout tipo Pinterest de verdade, sem nenhuma foto cortada num quadrado).
Suíte completa de regressão do catálogo (15 arquivos) + `tests/
creditos-browser.cjs` + `tests/studio-browser.cjs` rodadas de novo,
todas passando.

## Bug real: "Experimente seu tecido" — selecionar foto não fazia nada

Pedido do usuário (reportando um bug, com print do diálogo "SOB MEDIDA" /
"Experimente seu tecido"): *"dentro de experimente seu tecido o tecido
não está adicionando, eu seleciono a foto na minha galeria e nada
acontece"*.

**Investigação**: o fluxo de upload em si (`bindCustomization()`, evento
`change` de `#catalogFabricInput` em `catalogo.mjs`) está correto e
incondicional — sempre mostra a prévia do tecido e habilita o botão
"Aplicar tecido com IA", **exceto** para um DECORADOR EXTERNO (tem
`sessionStorage.catalogo_token`, sem `login_ok`), caso em que
`window.CatalogCredits.syncFabric()` (`catalogo-creditos.js`) pode
SOBRESCREVER esse `disabled=false` de volta pra `true`, condicionado a um
"orçamento" de créditos (`fabricQuote`) carregado por
`prepareFabric()` (chamada só quando o diálogo abre, via RPC
`catalogo_creditos_saldo`). **Confirmado que não afeta a equipe interna**
(via dashboard OU via login direto — ver seção "Login direto da equipe"
acima): as duas sessões da equipe não têm `catalogo_token`, então
`external()` (`catalogo-creditos.js`) é falso e todo esse código de
créditos nem roda — testado com Playwright reproduzindo os dois acessos
internos ponta a ponta, upload sempre libera o botão normalmente.

**Causa raiz de verdade, isolada reproduzindo como DECORADOR EXTERNO com
a consulta de créditos FALHANDO** (mock de RPC retornando erro, no lugar
de assumir cache — ver preferência do usuário no fim deste arquivo):
`prepareFabric()` tinha só UMA tentativa; se `catalogo_creditos_saldo`
falhasse (rede, RPC, qualquer motivo transitório), o `catch` escrevia uma
mensagem de erro no painel (`#catalogFabricCredits`) mas **nada mais
disparava esse painel de novo** — e como `syncFabric()` roda de novo a
cada arquivo escolhido (`bindCustomization()`'s handler chama ela sempre),
essa chamada SOBRESCREVIA a mensagem de erro de volta pra
"Consultando seus créditos…" (`if(!fabricQuote){...return}`, sem
distinguir "ainda carregando" de "já tentou e falhou") **e mantinha o
botão desabilitado pra sempre**. Do ponto de vista do usuário: a foto do
tecido aparece normalmente (isso não depende de créditos, é só
`bindCustomization()`), dando a impressão de que "adicionou" — mas
"Aplicar tecido com IA" fica clicável na aparência e inerte de verdade,
sem NENHUM aviso visível (a única saída documentada era uma frase
pequena, "Feche e abra esta janela para tentar novamente", fácil de nunca
ser lida). **Batia exatamente com "seleciono a foto e nada acontece"**:
não é a seleção do arquivo que falha, é a trava de créditos que nunca se
recupera de uma falha isolada.

**Corrigido em `catalogo-creditos.js`** (`prepareFabric()`/`syncFabric()`):
(1) uma variável nova, `fabricQuoteError`, distingue "ainda carregando"
de "já tentou e falhou" — antes só existia `fabricQuote===null` pros dois
casos, indistinguíveis; (2) `prepareFabric()` agora tenta a consulta DUAS
vezes automaticamente antes de admitir falha (cobre a maioria dos
problemas passageiros de rede sem precisar de nenhuma ação do usuário);
(3) se as duas tentativas falharem, o painel mostra uma mensagem clara
**com um botão "Tentar novamente" de verdade** (`[data-fabric-retry]`,
delegado no próprio painel porque o `innerHTML` é reescrito a cada
chamada — um `addEventListener` direto no botão morreria a cada
re-render) em vez de só texto estático sem nenhuma ação — clicar chama
`prepareFabric()` de novo (que por sua vez tenta 2x de novo). CSS do
botão em `catalogo-creditos.css`. Bumpado `?v=` de
`catalogo-creditos.js`/`.css` em `catalogo.html`.

**Verificado com Playwright** simulando 3 cenários com a MESMA consulta
de créditos controlada por uma flag (`window.__creditosShouldSucceed`, no
mock — contar chamadas cruas não funciona porque o polling em segundo
plano de `catalogo-creditos.js`, `setInterval(start,30000)`, também
chama a mesma RPC e entraria em corrida com qualquer contador): (1)
consulta falhando persistentemente → painel mostra erro + botão de retry,
"Aplicar tecido" nunca destrava sozinho (correto, créditos genuinamente
desconhecidos); (2) clique manual em "Tentar novamente" enquanto ainda
falha → continua mostrando o mesmo painel de erro, sem travar nem gerar
loop; (3) clique manual depois da RPC passar a responder com sucesso →
destrava o botão imediatamente com o saldo real. Suíte completa de
regressão do catálogo (8 arquivos) + `tests/catalogo-browser.cjs` (que já
cobria o caminho feliz — créditos suficientes, RPC respondendo de
primeira) + `tests/creditos-browser.cjs` rodadas de novo, todas passando
sem nenhuma mudança de comportamento no caminho que já funcionava.

## "Experimente seu tecido": diálogo fecha sozinho + notificação mostra a foto pronta

Dois pedidos do usuário, com print do diálogo em plena geração ("Criando
sua versão…" / "Personalizando para você"): *"quando eu colocar essa
imagem quero que o modal feche automaticamente, outra coisa, quando a
foto ficar pronta eu quero que apareça na notificação com a foto"* —
seguido de uma segunda mensagem esclarecendo o segundo pedido: *"sabe
aquela notificação que fica do lado direito? ele fica igual está hoje, a
diferença que quando a foto ficar pronta ela aparece ali de forma
bonita"* — ou seja, a notificação (`#catalogNotifications`, canto
inferior direito) continua exatamente como já era, só ganha a FOTO do
resultado dentro dela quando a geração termina.

**Diálogo fecha sozinho ao mandar aplicar**: antes, clicar em "Aplicar
tecido com IA" mantinha `#catalogCustomizeDialog` aberto durante toda a
geração (até ~2 minutos), mostrando o indicador interno
`#catalogAiLoading` ("Personalizando para você") — a pessoa precisava
fechar manualmente pra continuar navegando (o texto de status já dizia
isso: "Você pode fechar esta janela e continuar navegando", mas exigia
uma ação). `generateFabricVariation()` agora chama
`$("catalogCustomizeDialog").close()` logo no início, assim que a
geração é confirmada (depois das validações, antes do `await` de rede) —
quem avisa do andamento a partir daí é só a notificação
("Personalização em andamento", já existia). Reabrir "SOB MEDIDA"
enquanto ainda gera continua funcionando igual antes
(`openCustomizeDialog()` já tinha esse caminho: se
`state.fabricGenerating` for `true`, só reexibe o diálogo sem resetar
nada).

**Notificação de sucesso ganha a foto**: `notify()` (`catalogo.mjs`)
ganhou um parâmetro novo, `image` — quando presente, o toast recebe a
classe `has-photo` e uma `<img class="catalog-notification-photo">` no
topo, ANTES do ícone/texto/ação de sempre (`catalogo.css`:
`.catalog-notification-photo{grid-column:1/-1;width:100%;height:150px;
object-fit:cover;border-radius:10px}` — como o grid do toast é
`34px 1fr auto` e a foto ocupa as 3 colunas numa linha própria, o resto
do toast continua exatamente com o mesmo layout de sempre, só ganha uma
linha nova em cima). `generateFabricVariation()` passa `image: src` (a
MESMA imagem já usada pra atualizar a foto principal do produto) na
chamada de sucesso — nenhuma imagem nova é gerada só pra notificação.
**O que o botão "Ver resultado" faz ao clicar foi trocado logo em
seguida** — ver seção "Prévia minimalista..." abaixo; na versão descrita
aqui ele ainda reabria `openCustomizeDialog(item)`, o diálogo inteiro de
upload.

**Achado ajustando o teste de regressão**: `tests/catalogo-browser.cjs`
verificava `#catalogCustomizeStatus` (texto "Tecido aplicado...") logo
após a geração terminar — como o diálogo agora fecha sozinho, esse
elemento fica sem render (dentro de um `<dialog>` fechado) e
`.innerText()` do Playwright (que respeita o que está de fato
renderizado) volta vazio, quebrando o teste. **Não é regressão**:
reabrir o diálogo (clicando em "Ver resultado", como um usuário real
faria pra conferir o resultado) sempre passa por `openCustomizeDialog()`
no caminho "sessão nova" (`state.fabricGenerating` já é `false` nesse
ponto), que **sempre limpa** `#catalogCustomizeStatus` de propósito (é o
mesmo código que reseta o formulário pra uma nova personalização do
zero) — ou seja, o texto de status de uma geração anterior nunca deveria
mesmo sobreviver a fechar-e-reabrir; só a FOTO (`item.customizedPhoto`)
persiste, porque fica guardada no objeto do item, não em texto solto do
DOM. Teste ajustado: assert do texto de status removido, e uma
asserção nova confere que a notificação de sucesso tem
`.catalog-notification-photo` com `src` começando em `data:image/png`
— e que reabrir via "Ver resultado" mostra a MESMA foto na seção do
produto (`#catalogCustomizeProduct` = `.product-main-image`). **Essa
última checagem foi ajustada de novo na seção seguinte**, porque "Ver
resultado" parou de reabrir `#catalogCustomizeDialog`.

## "Ver resultado" abre uma prévia minimalista, não o diálogo de upload

Pedido explícito do usuário, com o MESMO print do diálogo "Experimente
seu tecido" em geração usado no pedido anterior: *"quando eu clicar em
ver foto, não deve abrir o modal, deve abrir um preview da foto com o
botão de salvar minimalista"* — ou seja, o botão "Ver resultado" da
notificação (ver seção acima) **não devia continuar reabrindo o diálogo
inteiro de upload** (`openCustomizeDialog(item)`, com dropzone "Adicionar
tecido", botão "Aplicar tecido com IA" etc.) só pra deixar a pessoa OLHAR
uma imagem que já foi gerada — esses controles não fazem sentido nesse
momento, a única ação que sobra é ver e opcionalmente baixar a foto.

**Reaproveitado o mesmo padrão já existente pro resultado do Painel 3D**
(`#studioResultDialog`/`.studio-result-dialog` em
`catalogo-studio3d.css`: foto grande + rodapé com rótulo/título + link
"Baixar imagem", sem nada mais) — replicado com classes PRÓPRIAS
(`.catalog-fabric-result-dialog` etc., novo `<dialog id=
"catalogFabricResultDialog">` em `catalogo.html`, CSS em `catalogo.css`
perto de `.catalog-customize-dialog`) em vez de reutilizar as classes do
Painel 3D — são dois recursos sem relação nenhuma (Studio 3D vs.
personalização de tecido), dar o mesmo nome de classe pra coisas
diferentes só confundiria uma leitura futura do código.

`openFabricResultPreview(item, src)` (`catalogo.mjs`) é a função nova:
recebe o MESMO `src` já usado pra atualizar a foto principal do produto
(nenhuma imagem nova gerada), preenche título (`item.name`) e a
`<img>`, monta o link de download (`download.href = src;
download.download = "${slugify(item.name)}-tecido-personalizado.png"` —
reaproveita `slugify()`, já existente no arquivo pra outra coisa) e
mostra o diálogo. `notify()` na geração de sucesso passou a chamar
`onAction: () => openFabricResultPreview(item, src)` em vez de
`openCustomizeDialog(item)`.

**Achado ajustando o teste**: a checagem anterior (`tests/
catalogo-browser.cjs`) clicava em "Ver resultado" esperando
`#catalogCustomizeDialog[open]` — precisou trocar pra esperar
`#catalogFabricResultDialog[open]`, mais uma asserção explícita de que
`#catalogCustomizeDialog` CONTINUA fechado (prova que não é mais ele que
abre) e checagens do conteúdo da prévia nova: título bate com o nome do
item, `<img>` mostra a MESMA foto que já está na seção do produto
(`.product-main-image`), e o link de download tem `href` começando em
`data:image/png` e `download` terminando em
`tecido-personalizado.png`. Suíte completa de regressão do catálogo (8
arquivos) + `tests/creditos-browser.cjs` rodadas de novo, todas
passando.

## Percentual real no lugar do círculo girando (notificações "em andamento")

Pedido explícito do usuário, com o MESMO print de "Personalização em
andamento" usado nos dois pedidos anteriores: *"no lugar do círculo
girando quero que coloque porcentagem, bem discreto bonito mas ao mesmo
tempo visível, no momento que bater 100% a imagem deve aparecer, ele deve
ser fiel ao tempo que de fato demora"*. Isso é uma troca no `notify()`
COMPARTILHADO (`catalogo.mjs`, `window.catalogNotify`) — usado por toda
notificação `status:"working"` do catálogo, não só a do tecido (também
renderização/leitura de planta do Painel 3D, `catalogo-studio3d.mjs`) —
então a troca do ícone vale pra qualquer uma delas, mas a parte de "a
imagem aparece exatamente quando bate 100%" só foi implementada de fato
pro fluxo do tecido (ver abaixo).

**Não existe progresso de verdade pra reportar** — a chamada à IA
(`studio-ai-engine`) é um único request/response, sem streaming nem
callback de andamento do servidor. "Fiel ao tempo que de fato demora"
(pedido explícito, provavelmente reagindo à mentira clássica de barra de
progresso que "termina" e ainda fica esperando) foi interpretado como:
o percentual **nunca pode alegar 100% antes da resposta de verdade
chegar**, mas também não pode ficar parado - precisa refletir o RELÓGIO
real decorrido, não uma animação de duração fixa e desligada da
realidade. Implementado como curva assintótica sobre o tempo decorrido
(`currentPercent()`: `96 * (1 - e^(-t/50))`, `t` em segundos desde a
criação do toast) — sobe rápido no início, desacelera depois, nunca
passa de 96% sozinha; `tau=50` foi calibrado pelos "~2 minutos" que o
texto de status do tecido já promete (aos 120s mostra ~87%, então uma
geração real de até uns 3 minutos ainda parece "progredindo", não
travada). Atualizado a cada 400ms via `setInterval` enquanto
`status==="working"`.

**Visual**: `.catalog-notification-icon.is-progress` (`catalogo.css`)
substitui o antigo spinner (`border-top-color` girando via
`catalog-ai-spin`, removido SÓ desse lugar — a mesma animação continua
existindo e sendo usada pelo spinner de `#catalogAiLoading`, que é outro
elemento) por um anel de progresso via `conic-gradient()` mascarado em
forma de rosca (`mask:radial-gradient(farthest-side,transparent
calc(100% - 3px),#000 calc(100% - 3px))`) preenchendo conforme a
variável CSS `--pct`, com o número (`.catalog-notification-percent`,
`.5rem`, `tabular-nums`) centralizado por cima — discreto (mesmo círculo
pequeno de sempre, mesma paleta terrosa) mas visível (preenche de
verdade, não é só um número solto).

**"No momento que bater 100% a imagem deve aparecer" — reaproveita o
MESMO elemento do toast, não fecha-e-cria-outro**: antes,
`generateFabricVariation()` fazia `workingToast.close()` seguido de um
`notify({...sucesso...})` novo — dois elementos DOM diferentes, um
sumindo enquanto o outro aparecia do zero (mesmo com replace visual
"suave", nunca dava pra garantir que o número bateria 100% exatamente no
instante em que a foto aparecesse, porque são coisas independentes).
`notify()` ganhou um `update(next)` que reescreve o MESMO elemento em vez
de criar um novo — `workingToast.update({status:"done", image:src,
...})` agora faz exatamente isso. Especificamente na transição
`working`→`done` (sucesso de verdade, não erro), `update()` primeiro
força o número pra "100%" e SÓ DEPOIS de ~450ms (tempo de a pessoa
realmente perceber o número chegando no fim) troca o conteúdo pra
foto+título+"Ver resultado" — daí "no momento que bater 100%" ser levado
ao pé da letra: a pessoa vê o percentual terminar antes da foto
aparecer, não os dois ao mesmo tempo escondendo um atrás do outro. Erro
(`status:"error"`) não passa por esse "flash de 100%" — não faz sentido
comemorar 100% de uma geração que falhou; `update()` só ativa esse
comportamento quando o novo status é especificamente `"done"`.

**Não mudado NESTA rodada**: o fluxo de renderização do Painel 3D
(`catalogo-studio3d.mjs`) continuou fazendo `workingToast?.close()` +
`notify({...})` novo pro resultado — não foi pedido pra mudar esse
fluxo, e ele não mostrava a foto DENTRO da notificação (abria
`#studioResultDialog` por fora, via "Ver resultado") — só herdava de
graça a troca de ícone (percentual em vez de spinner) por usar o mesmo
`notify()` compartilhado, sem precisar de nenhuma alteração naquele
arquivo. **Isso mudou numa sessão posterior** — ver "Notificação de
sucesso com foto em todos os módulos de IA (não só tecido)" mais abaixo,
que passou a mandar `image:src` também pro Painel 3D e pro Módulo
Lounge.

Teste de regressão (`tests/catalogo-browser.cjs`): marca o toast
"working" com um atributo próprio (`dataset.mesmoToast`) assim que ele
aparece, lê o percentual, espera ~900ms e confere que SUBIU (prova que
segue o relógio real, não é estático) e que continua abaixo de 100%
(prova que não "termina" sozinho); depois que a foto fica pronta, confere
que é o MESMO elemento marcado (`data-mesmo-toast="1"`) que agora tem
`.has-photo` — prova de verdade de que é um morph, não um toast novo.
Suíte completa de regressão do catálogo (8 arquivos) + `tests/
creditos-browser.cjs` + `tests/studio-browser.cjs` (fluxo de
renderização do Painel 3D, que também passa pelo `notify()`
compartilhado) rodadas de novo, todas passando.

## Portal virou UMA foto só, cobrindo a tela toda (não mais 3 fotos lado a lado)

Pedido explícito do usuário, com print do Portal já publicado (3 fotos
lado a lado, com margem ao redor e um gap branco entre elas): *"na home
ao invés de ser 3 fotos quero que seja uma foto só, e sem nenhuma borda
branca dessa, a foto será da tela toda, o funcionamento dos módulos
continuam normal"*. Antes de implementar, perguntei ao usuário como
ficaria o botão "Trocar foto" da equipe (já que antes eram 3, um por
bloco) — confirmou: **um botão só**, não 3.

**O que NÃO mudou** (pedido explícito: "o funcionamento dos módulos
continuam normal"): os 3 destinos continuam existindo e navegando
exatamente igual — `GATEWAY_TILES` (`catalogo`/`biblioteca`/`modulo3d`),
`activateGatewayTile(key)`, o clique delegado via `[data-gateway-tile]`
em `bindInteractions()`, a hierarquia de 3 níveis (Portal → Home →
categoria) — nada disso foi tocado. **O que mudou foi só a
APRESENTAÇÃO**: antes cada bloco era um elemento clicável com sua
PRÓPRIA `<img>` de capa; agora existe UMA `<img class="catalog-gateway-
photo">` só, plena, atrás de tudo (`state.gatewayCapas.portal`, chave
nova — ver `GATEWAY_PHOTO_KEY` em `catalogo.mjs`), e os 3 destinos viram
`<div class="catalog-gateway-zone" data-gateway-tile="...">` **sem foto
própria nenhuma** — só uma faixa clicável transparente sobreposta à foto
compartilhada, com o rótulo por cima. `trocarCapaGateway(chave, file)`
já era parametrizada por `chave` desde antes (usada 3x, uma por bloco) —
não precisou de nenhuma mudança nela, só passou a ser chamada uma vez só,
com `chave="portal"`.

**Banco**: a tabela `catalogo_capas` (RPCs `catalogo_capas_carregar`/
`catalogo_capas_carregar_interno`, bucket "biblioteca", path
`${empresa_id}/_capas/${chave}.ext`) continua idêntica — só a CHECK de
`chave` precisava aceitar a chave nova `"portal"` além das 3 antigas
(migration `20260918000100_catalogo_capas_portal_chave_unica.sql`:
`alter table ... drop constraint ...; add constraint ... check (chave in
(..., 'portal'))`). **As 3 linhas antigas (`catalogo`/`biblioteca`/
`modulo3d`), se alguma empresa já tinha cadastrado, ficam órfãs no
banco** — não lidas mais pelo frontend a partir desta versão, mas não
apagadas de propósito (mesma cautela já documentada nesta sessão pra CSS
morto/RPCs legadas: não misturar uma limpeza não pedida com a mudança
pedida). Aplicada com `npx supabase db push --linked` e confirmada
direto no banco (`pg_get_constraintdef`) antes de mexer no frontend.

**CSS, "sem nenhuma borda branca" levado ao pé da letra**: a versão
anterior tinha `margin:clamp(12px,1.5vw,24px) clamp(20px,3vw,56px) 0`
(gutter ao redor) e `gap:clamp(12px,1.5vw,24px)` entre os 3 blocos —
ambos removidos (`.catalog-gateway{margin:0}`, sem `gap` nenhum, já que
as 3 zonas agora são só faixas transparentes sobre a MESMA imagem, não
precisam de espaçamento entre si). Altura continua
`calc(100dvh - var(--header-h))` — cobre toda a tela abaixo do
cabeçalho, sem subtrair mais o gutter extra que existia antes
(`- clamp(12px,1.5vw,24px)`). Verificado com Playwright comparando
`boundingBox()` do cabeçalho e da foto: a foto encosta exatamente na
borda inferior do cabeçalho e na borda esquerda da tela (x=0), sem
gutter nenhum — não dava pra confiar só em olhar o CSS fonte pra provar
isso.

**Efeito de hover adaptado, não copiado 1:1**: a versão anterior dava
zoom na `<img>` de cada bloco no hover (`transform:scale(1.045)`), além
de escurecer. Como agora as 3 zonas são transparentes sobre uma imagem
ÚNICA compartilhada, dar zoom só na zona sob o mouse não é possível sem
also mexer nas outras 2/na imagem inteira (o que pareceria estranho —
zoom "quicando" a foto inteira ao passar de uma zona pra outra). Mantido
só o escurecer (`.catalog-gateway-zone::before`, mesmo mecanismo/tempo
de antes), que já comunica "isso aqui é clicável" sem precisar reescalar
a foto de baixo — decisão de design não pedida explicitamente, mas
necessária pela mudança de arquitetura (não fazia sentido manter um
efeito pensado pra 3 imagens independentes).

Teste de regressão: `tests/catalogo-portal-browser.cjs` reescrito —
confirma UMA SÓ `.catalog-gateway-photo` (não mais uma por bloco), ZERO
`<img>` dentro das zonas de clique, as 3 zonas continuando a navegar
normal pros 3 destinos, decorador sem nenhum botão de trocar foto,
equipe interna vendo **um só** "Trocar foto" (`.catalog-gateway-edit`
count 1, não mais 3), upload gravando na chave `"portal"` (path
`.../_capas/portal.ext`, `chave:"portal"` no upsert), a imagem atualizando
na tela sem reload, e a checagem de bounding box "sem gutter" acima. Os
5 outros testes que já clicavam em `[data-gateway-tile="..."]` pra
navegar (`catalogo-browser.cjs`, `catalogo-menu-browser.cjs`,
`catalogo-breadcrumb-browser.cjs`, `catalogo-biblioteca-browser.cjs`,
`catalogo-login-equipe-browser.cjs`, `catalogo-editor-fotos-browser.cjs`)
não precisaram de nenhum ajuste — o atributo/valor de `data-gateway-tile`
não mudou, só deixou de existir uma `<img>` aninhada dentro dele (nenhum
desses testes lia essa `<img>`). Suíte completa de regressão do catálogo
(8 arquivos) + `tests/creditos-browser.cjs` rodadas de novo, todas
passando.

## Bug real: "Trocar foto" do Portal não funcionava (bucket "biblioteca" sem policy de UPDATE)

Pedido do usuário, reportando um bug logo depois do Portal virar uma foto
só: *"o botão trocar foto não está funcionando"*.

**Investigação, sem supor cache** (preferência já registrada do usuário
no fim deste arquivo): reproduzido com Playwright simulando clique real
no `<label>` "Trocar foto" (não só `setInputFiles()` direto no input,
que — lição já documentada nesta sessão pro editor de fotos do item —
funciona mesmo sem o seletor abrir de verdade) e conferindo
`document.elementFromPoint()` no centro do botão: o seletor de arquivo
abria normal, o elemento no ponto certo era mesmo o `<label>` (não uma
zona de clique por cima escondendo ele), e o upload MOCKADO completava
sem erro — ou seja, o problema não estava no clique nem na estrutura do
HTML/CSS novo do Portal.

**Causa raiz de verdade, achada consultando as policies REAIS do banco**
(`npx supabase db query --linked` em `pg_policies`, não assumida):
`storage.objects` pro bucket `"biblioteca"` tinha policies de
SELECT/INSERT/DELETE (criadas em `20260916000200_biblioteca_fotos.sql`,
pro recurso original da Biblioteca — cada foto ali usa um caminho NOVO/
único por upload, nunca precisa reescrever um caminho já existente) mas
**nunca ganhou uma policy de UPDATE** — diferente de TODOS os outros
buckets do projeto que fazem upsert (`itens`, `empresas-logos`,
`rh-fotos`, `catalogo-clientes`, todos com a policy de UPDATE
correspondente). `trocarCapaGateway()` (Portal, e antes dele os 3
blocos antigos) sempre fez `.storage.upload(path, file, {upsert:true})`
num caminho FIXO por chave (`_capas/${chave}.ext`, de propósito, pra
trocar a foto sobrescrever a anterior em vez de acumular arquivo órfão)
— a PRIMEIRA foto sempre subia bem (cai na policy de INSERT, caminho
ainda não existia), mas TROCAR uma foto que já existia no mesmo caminho
precisa de UPDATE em `storage.objects`, que não existia. **Bug latente
desde que o Portal ganhou capas** (sessão anterior, antes mesmo da
mudança pra "uma foto só") — só não tinha sido notado porque
aparentemente ninguém tinha tentado TROCAR uma capa já definida antes de
hoje. Corrigido com uma policy de UPDATE nova, mesmo padrão exato das
outras (`20260918000200_biblioteca_storage_update_policy.sql`,
`bucket_id='biblioteca'` + prefixo do caminho = `empresa_id` via
`usuarios_empresas`) — aplicada com `npx supabase db push --linked` e
confirmada direto no banco (a policy antes não existia, agora aparece
junto das outras 3).

**Além da causa raiz, um problema de UX que escondia o bug**:
`trocarCapaGateway()` nunca avisava a pessoa quando o upload ou o
upsert falhavam — só `console.error`, invisível sem o DevTools aberto,
dando exatamente a sensação de "não está funcionando" mesmo depois da
causa raiz corrigida (qualquer falha FUTURA — rede, outra policy,
etc. — voltaria a parecer que "nada acontece"). Corrigido adicionando
`notify({status:"error",...})` nos 3 pontos de falha possíveis (tipo/
tamanho de arquivo inválido, falha no upload, falha no upsert) — mesmo
padrão já usado em `catalogo-biblioteca.mjs` pra erros de carregar/
remover foto. **Não mudado**: o upload de fotos da PRÓPRIA Biblioteca
(`catalogo-biblioteca.mjs`, função separada) continua sem esse aviso —
fora do escopo do que foi reportado, mas seria o próximo lugar a olhar
se algo parecido for relatado ali.

Teste de regressão: `tests/catalogo-portal-browser.cjs` ganhou um 3º
cenário — simula o upload falhando (mesma assinatura de erro de uma RLS
rejeitando) e confere que aparece uma notificação de erro de verdade em
vez de nada acontecer. Suíte completa de regressão do catálogo (8
arquivos) + `tests/creditos-browser.cjs` rodadas de novo, todas
passando.

## Portal: "Ajustar foto" (arrastar/zoom) — mesmo editor das fotos do item

Pedido explícito do usuário, na mesma mensagem do bug do "Trocar foto"
acima: *"o icone de mover, ajustar a foto não está aparecendo também"*.
Perguntei antes de implementar (pra não confundir com um bug em outro
lugar do catálogo) — confirmado: era pra reposicionar a foto ÚNICA do
Portal, o mesmo recurso que já existe nas fotos do item (arrastar +
zoom, ver seção "Editor de fotos do item, direto no catálogo" acima),
que nunca tinha existido pro Portal — só "Trocar foto" (substituição
instantânea, sem ajuste) existia ali.

**Reaproveitado o sistema de crop existente quase por inteiro**, em vez
de construir um novo do zero — a maior parte dele (`cropZoom`,
`cropPointerDown/Move/Up`, `cropWheel`, `positionCropImage`,
`renderCropWorkspace`, `setCropSource`, `cancelInlineEdit`,
`cropSessionBlob`) já era genérica, sem nada específico de item — só
lia `cropSession.frame`/`.blob`/`.scale`/`.x`/`.y`. Só 3 coisas
precisaram saber diferenciar "editando foto de item" de "editando foto
do Portal":
1. **De onde vem a foto atual e qual é a moldura** — antes só existia
   `startInlineEdit(section, item, slot)`; ganhou uma função irmã,
   `startInlineEditForGateway(chave)`, que usa `.catalog-gateway`
   inteiro como moldura (mesma caixa que a foto real ocupa,
   `object-fit:cover` — ajustar aqui mostra exatamente o que vai
   publicar) e `state.gatewayCapas[chave]` como foto atual. O trecho
   "carrega a foto existente OU mostra + Escolher foto e já abre o
   seletor" era idêntico nas duas funções — extraído pra
   `loadCropSourceOrEmptyPicker()`, compartilhada.
2. **O que "Aplicar" faz com o blob final** — `applyInlineEdit()` ganhou
   um branch: se `cropSession.gatewayKey` existir, chama
   `trocarCapaGateway(gatewayKey, file)` em vez de
   `trocarFotoPrincipal`/`trocarFotoSlot`. **Achado ao implementar**:
   `trocarCapaGateway()` antes não avisava sucesso NEM retornava se deu
   certo — só `applyInlineEdit()`, que precisa saber se fechou a sessão
   de crop ou deixa aberta pra tentar de novo, isso importava. Mudado
   pra retornar `true`/`false` (já usado pelo fix do bug anterior nesta
   mesma seção) e emitir `notify({title:"Foto atualizada"})` no
   sucesso — que passou a beneficiar TAMBÉM a troca instantânea (clique
   direto em "Trocar foto"), que antes atualizava a foto em silêncio,
   sem nenhuma confirmação visível.
3. **Uma pegadinha real, achada implementando**: `trocarCapaGateway()`
   no sucesso já chama `renderGateway()` (substitui `#catalogGrid`
   inteiro por HTML novo) — se `applyInlineEdit()` chamasse
   `cancelInlineEdit()` DEPOIS disso, estaria manipulando nós já
   DESCONECTADOS do documento (a árvore antiga, incluindo o overlay de
   crop, já não existe mais). Não dá erro (manipular um elemento
   desconectado é inofensivo em JS), mas é trabalho morto e confuso de
   ler. Corrigido: no caminho do Portal, `applyInlineEdit()` só zera
   `cropSession = null` direto (sem chamar `cancelInlineEdit()`) —
   `renderGateway()` já constrói uma tela nova sem overlay nenhum, não
   sobra nada pra "cancelar".

**Sem botão de remover**: `podeRemover` (mostra o 🗑 na barra de
ferramentas) ganhou mais uma condição (`!cropSession.gatewayKey`) — a
foto do Portal, assim como a principal do item, não pode ficar vazia
(sempre tem alguma, nem que seja o placeholder), então remover nunca
fez sentido aqui.

**Gatilho novo, `.catalog-gateway-adjust`** ("✎", ao lado de "Trocar
foto", os dois agrupados num `.catalog-gateway-controls` só pra não
precisar calcular a posição de cada um separadamente) — `<button>` de
verdade (não uma `<div role="button">` como as zonas de clique), então
não precisou de handler de teclado próprio: Enter/Espaço num `<button>`
já disparam `click` nativamente. Delegado em `bindInteractions()`
(`[data-gateway-adjust]`, checado ANTES de `[data-gateway-tile]` — igual
`[data-gateway-edit]` já fazia, senão clicar no ícone também navegaria
pro destino da zona por baixo).

Teste de regressão: `tests/catalogo-portal-browser.cjs` ganhou um 4º
cenário (mesmo padrão de `tests/catalogo-editor-fotos-browser.cjs`, PNG
1×1 de verdade — `createImageBitmap()` não decodifica SVG neste Edge
headless) — decorador nunca vê o ícone; equipe vê, abre com a foto
EXISTENTE carregada, sem botão de remover; arrastar reflete no
`transform:translate()`, zoom no `scale()`; Aplicar confere
`elementFromPoint()` no botão antes de clicar (mesma lição do bug real
"borda colorida tampando botão" — não confiar só no `.click()`), sobe
pro MESMO caminho fixo (`_capas/portal.ext`) que a troca instantânea
usa, e mostra "Foto atualizada"; Cancelar não sobe nada. Suíte completa
de regressão do catálogo (8 arquivos) + `tests/creditos-browser.cjs`
rodadas de novo, todas passando.

## Títulos do Portal ganham o mesmo efeito de "abrir" do INSPIRE-SE

Pedido explícito do usuário: *"quero que os módulos na home tenham um
efeito na palavra igual tem no efeito dentro do item na foto do item
ambientado na palavra inspire-se"* — reaproveitar o efeito de
`.product-event-panel::after` (o texto "INSPIRE-SE" que aparece sobre a
foto ambientada do item) nos 3 títulos do Portal ("Catálogo",
"Biblioteca", "Módulo 3D").

**O efeito de verdade é o `letter-spacing`/`text-indent` "abrindo" no
hover** — não é zoom nem escurecer (isso os blocos do Portal já tinham
antes, de outras sessões). Valores/tempo/curva copiados exatamente do
INSPIRE-SE: parte de `.14em`, abre pra `.32em` no hover, `1200ms
cubic-bezier(.22,1,.36,1)`. `.catalog-gateway-title` antes já usava
`.32em` FIXO (sem hover nenhum) — virou o valor de DESTINO do hover, e
o resto (`.14em`) virou o repouso, criando o mesmo "abrir" que o
INSPIRE-SE tem.

**Diferença deliberada, não um erro**: no item, "INSPIRE-SE" começa
com `opacity:0` (só aparece no hover, a foto ambientada fica "limpa" o
resto do tempo) — os títulos do Portal continuam SEMPRE visíveis
(`opacity` nunca muda), porque mostrar o nome de cada bloco o tempo
todo já era uma decisão confirmada de sessões anteriores (a pessoa
precisa saber o que é cada bloco sem precisar passar o mouse). Só a
letra "respirando" foi copiada, não o fade-in.

**Mesmas proteções de acessibilidade do INSPIRE-SE, copiadas junto**:
o hover fica dentro de `@media(hover:hover) and (pointer:fine)` (não
dispara em touch, onde não existe hover de verdade) e
`@media(prefers-reduced-motion:reduce)` trava tanto o repouso quanto o
hover no valor `.14em` sem transição — quem pediu menos movimento no
sistema operacional não vê a letra se mexendo, mesmo passando o mouse.

Verificado com Playwright usando `getComputedStyle()` antes/depois do
hover (não só lendo o CSS fonte): `letterSpacing` sobe de `5.376px`
(`.14em`) pra `12.288px` (`.32em`) depois de esperar a transição de
1.2s completar — e conferido visualmente com screenshot comparando o
bloco em hover (letra visivelmente mais espaçada) contra os outros
dois (repouso). Teste de regressão: `tests/catalogo-portal-browser.cjs`
ganhou essa checagem no cenário do decorador. Suíte completa de
regressão do catálogo (8 arquivos) + `tests/creditos-browser.cjs`
rodadas de novo, todas passando.

## Apresentação do projeto: efeitos de rolagem ("site premium")

Pedido do usuário: *"quero que a landing page do projeto faça efeitos quando estiver descendo, como se fosse um site premium mesmo"*. A apresentação pública (`projeto.html`/`projeto.mjs`, ver seção "Projetos" mais acima) ganhou três efeitos, todos em cima do que já existia (nenhuma mudança na estrutura HTML, só classes/atributos a mais):

- **Revelação em cascata** (`.pj-reveal`/`.is-visible` em `projeto.css`): cada bloco de conteúdo — intro, cabeçalho de cada ambiente, observações, cada foto renderizada, cada móvel, o rodapé — nasce com `opacity:0;transform:translateY(28px)` e ganha um fade + leve subida (`.9s cubic-bezier(.22,1,.36,1)`) ao entrar na tela, via `IntersectionObserver` (`configurarRevelacao()`). Fotos e móveis têm um `--i` (índice dentro do próprio ambiente) que vira `transition-delay:calc(var(--i,0)*70ms)` — dá o efeito "em cascata" sem escrever um delay à mão pra cada elemento. **Revela uma vez só e não esconde de novo ao rolar pra cima** — evita o efeito "piscando" ao ir e voltar.
- **Parallax sutil na foto da capa** (`configurarEfeitosDeRolagem()`): a foto (`.pj-cover-photo`, e a lateral em `.pj-cover-media img`) já nasce com `scale(1.12)` e se desloca com `translateY(var(--pj-parallax,0px))` conforme rola — um listener de `scroll` (throttled por `requestAnimationFrame`) calcula `min(scrollY*0.22, alturaDaCapa*0.1)`. **O teto de 10% da altura é proposital**: o `scale(1.12)` só dá 12% de folga antes de aparecer a borda da foto; deixar o deslocamento chegar perto disso (sem clamp) mostraria a borda exatamente quando a capa está saindo de vista. Parado assim que `scrollY` passa da altura da capa (a foto já nem está mais na tela).
- **Barra de ambientes "solidifica"**: `.pj-nav` ganha `.is-scrolled` (sombra, `box-shadow`) depois de ~40px de rolagem — mesmo listener do parallax, sem listener duplicado.

**Por que isso quase saiu errado (achado ao testar, não no produto final)**: ler `getComputedStyle` **na mesma tick síncrona** logo depois de mudar de mídia (`page.emulateMedia('print')` no teste, ou — em tese — um clique real em "Baixar PDF" bem na hora que a `transition` de `.pj-reveal` ainda está rodando) pega o valor **ainda em trânsito**, não o final — mesma classe de corrida já documentada nesta sessão pro campo de busca (seção acima). Isso importa de verdade aqui porque **o PDF pode ser gerado sem a pessoa nunca ter rolado a página** (o botão "Baixar PDF" já fica visível lá no topo) — sem um cuidado a mais, seções nunca vistas sairiam com `opacity:0` e o PDF sairia com trechos em branco. Corrigido com um `@media print{.pj-reveal{opacity:1!important;transform:none!important;transition:none!important}}` — o `transition:none` é o que garante que não sobra NENHUMA janela de "em trânsito", nem por 1 frame.

**Modos que não são a apresentação de verdade, tratados à parte**:
- **`prefers-reduced-motion:reduce`**: `.pj-reveal` já nasce em `opacity:1;transform:none;transition:none` via CSS (nem precisa de JS pra isso — a mesma regra cobre não importar quando/como a classe `.is-visible` é adicionada); o parallax é JS puro (não dá pra neutralizar só com CSS, já que o valor vem de `style.setProperty` a cada frame), então `configurarEfeitosDeRolagem()` checa `matchMedia` e nunca escreve `--pj-parallax` nesse caso — a barra de navegação continua ganhando sombra (não é bem "movimento"), só sem a transição animada.
- **`?modo=editor`** (prévia ao vivo dentro do editor de layouts, iframe sem barra de rolagem própria — ver seção "Layouts de apresentação"): `renderizar()` roda a cada opção mexida, reconstruindo o `#app` inteiro — sem tratamento especial, isso replicaria o fade de .9s a CADA tecla, atrapalhando a edição em vez de ajudar. `configurarRevelacao()` detecta `modo==="editor"` e marca tudo `.is-visible` na hora, sem observer nenhum.
- **`?modo=previa`** (aba separada, decorador testando o link/PDF antes de compartilhar): funciona igual à apresentação real — é uma janela normal, com rolagem de verdade.

Teste novo: `tests/projeto-efeitos-rolagem-browser.cjs` — nada abaixo da capa (tela cheia) começa visível; rolar move o parallax (nunca além de ~10% da altura da capa) e liga a sombra da barra; rolar até o fim revela tudo; **o mais importante**: `@media print` sem ter rolado nada continua com todas as seções em `opacity:1` e o parallax `transform:none`, confirmado com um `page.pdf()` de verdade contando 4 páginas (capa + 2 ambientes + rodapé — nenhuma em branco); `prefers-reduced-motion` mostra tudo de cara e não escreve `--pj-parallax`; `?modo=editor` (com um iframe de verdade — a checagem de origem do postMessage em `iniciarPrevia()` rejeita mensagem de uma página com origem diferente, então o host do teste precisa ser servido pelo MESMO servidor, não um `page.setContent()` comum de origem opaca) revela tudo sem esperar rolagem. Suíte de `catalogo-layouts-browser.cjs`/`catalogo-projetos-browser.cjs` (que geram PDF/abrem a apresentação de outros jeitos) rodada de novo, sem quebra. Cache-busting `?v=20260921-efeitos-rolagem`.

## Campo de busca do cabeçalho, mais visível

Pedido do usuário: *"no canto superior direito da tela existe um campo de pesquisa, quero deixar ele mais visível, do jeito que está hoje a pessoa quase não vê"*. Era só uma linha fininha translúcida embaixo do texto (`border-bottom:1px solid rgba(255,255,255,.34)`), sem fundo nenhum — ícone e placeholder quase da mesma cor do cabeçalho cinza (`#5a5a55`). Virou uma pílula com fundo e contorno **sempre visíveis** (não só no foco): `background:rgba(255,255,255,.16)` + `border:1px solid rgba(255,255,255,.4)` + `border-radius:999px`, ícone/placeholder bem mais opacos (`.72/.55` → `.92/.78`); no foco fica ainda mais forte. No modo interno (`body.catalog-modo-sistema`, aberto de dentro do sistema, cabeçalho claro) a mesma pílula usa um fundo bege-claro (`#f3f1ec`) contra o branco da faixa, ficando branco puro + contorno `var(--accent)` no foco.

**Achado real construindo**: dar padding de verdade à pílula (de `0 4px` pra `0 9px`) cortava o "Pesquisar" na coluna mais estreita do cabeçalho (110px, entre 768 e 1450px de largura) — sobrava menos espaço pro texto. A causa não era só o padding novo: `input[type="search"]` reserva um espaço pro "×" nativo de limpar mesmo vazio (o Chromium/Edge deixa essa folga interna independente de ter valor ou não), e isso nunca tinha incomodado enquanto a pílula não tinha padding nenhum sobrando. Corrigido com `appearance:none` no input + `::-webkit-search-cancel-button{display:none}` — tira a decoração nativa (o próprio `<svg>` da lupa já faz esse papel), sem mudar o tipo do campo nem o comportamento de busca.

Não mexido: o campo continua **escondido no celular** (`.catalog-search{display:none}` em `@media(max-width:767px)`, decisão de espaço já existente — sem espaço sobrando no cabeçalho de 72px ao lado de marca+categorias+usuário) e a largura da coluna do cabeçalho não mudou (não foi pedido "maior", só "mais visível").

Teste (`tests/catalogo-busca-visivel-browser.cjs`): contraste real da pílula contra o cabeçalho escuro (externo) e contra o branco (interno); ícone bem mais opaco que antes; "Pesquisar" cabendo inteiro (medido com um clone invisível no mesmo fonte, não só a largura do input) nas 4 larguras da coluna estreita (768/900/1300/1450px); `appearance:none` de fato aplicado; contorno muda no foco; continua escondido no celular. **Achado no próprio teste**: ler `getComputedStyle` na MESMA tick síncrona logo depois de trocar a classe pro modo interno pegava o valor ainda "em trânsito" da `transition:background-color .2s` (praticamente o valor antigo) — não é bug de CSS, só uma corrida do teste; corrigido esperando a transição terminar antes de comparar (mesma lição já registrada noutros testes desta sessão sobre timing). Cache-busting `?v=20260921-busca-visivel`.

## Fotos da Home diminuídas "um pouco" (190px → 160px)

Pedido explícito do usuário, com print da Home já cheia de categorias
reais (10 categorias, várias sem foto ainda — "Sem foto"): *"quero que
diminua um pouco o tamanho das fotos"*. Continuação da seção "Fotos
maiores + hover premium nos cards da Home" mais acima, que tinha
aumentado a coluna mínima de 130px pra 190px — agora baixou pra 160px,
**não voltou pros 130px originais**, exatamente o meio-termo que "um
pouco" pede. Mesma regra (`.catalog-grid.catalog-home-grid{grid-
template-columns:repeat(auto-fill,minmax(160px,1fr))}`), continua
`auto-fill` (recalcula quantas colunas cabem sozinho, sem breakpoint
manual) — só o número mudou. `tests/catalogo-menu-browser.cjs` (que já
conferia "pelo menos 190px") ajustado pra "pelo menos 160px". Suíte
completa de regressão do catálogo (8 arquivos) + `tests/
creditos-browser.cjs` rodadas de novo, todas passando.

## Filtro premium de subcategoria, dentro de uma categoria

Pedido explícito do usuário, com print da categoria "Estofados" cheia de
produtos reais: *"agora em baixo de estofados quero que apareça as
subcategorias que tem dentro do cadastro itens, por exemplo, Clássicos,
e quando eu selecionar ali só vai aparecer os móveis daquela
subcategoria, ou seja, é um filtro premium"*.

**`itens.subcategoria` volta a sair da RPC, só que agora pra alimentar o
filtro** — o campo já tinha sido lido pelo catálogo antes (painel
técnico do item, seção "Painel técnico na página do item" acima), mas
foi removido a pedido do próprio usuário por não ter mais nenhum uso
("Subcategoria foi removida da lista", tirada também do `select()`/da
resposta da RPC). Como `catalogo_acervo()` (a função ÚNICA de onde tanto
`catalogo_carregar` — decorador — quanto `catalogo_carregar_interno` —
equipe — leem os itens) não devolvia mais essa coluna, precisou de uma
migration nova
(`20260918000300_catalogo_acervo_subcategoria.sql`, `create or replace
function` só adicionando `'subcategoria',i.subcategoria` no
`jsonb_build_object` — um único ponto de alteração já vale pros dois
acessos, mesmo padrão já usado pra `capa_categoria`/slot/path em
migrations anteriores). Aplicada com `npx supabase db push --linked` e
confirmada direto no banco antes de mexer no frontend. Dado real
conferido antes de implementar (`select categoria, subcategoria,
count(*) from itens where categoria='Estofados' group by 1,2`): a
categoria já tem várias subcategorias reais cadastradas (Capas de
Sofás, Almofadas de Sofás Modulares, Assentos de Puffes, Capas de
Poltronas, Namoradeiras, Recamiers...) — o recurso tem dado de verdade
pra filtrar, não é hipotético.

**`mapRow()` (`catalogo.mjs`) ganhou `item.subcat`/`item.subcatLabel`**
— mesmo padrão já usado pra categoria (`cat`/`catLabel`): `subcat` é o
slug (`slugify(row.subcategoria)`, usado como chave do filtro/atributo
`data-subcat-filter`) e `subcatLabel` o texto de exibição. Item SEM
subcategoria cadastrada vira `subcat:""` — nunca ganha chip próprio
("Sem subcategoria" clicável não ajudaria em nada), mas continua
aparecendo normalmente na visão "Todos".

**Onde o filtro mora**: `state.activeSubcat` (slug selecionado, `""` =
"Todos") e `state.currentCategoryItems` (TODOS os itens da categoria
ativa, sem o filtro aplicado — precisa deles inteiros pra sempre listar
TODAS as subcategorias possíveis nos chips, senão escolher uma faria as
outras "sumirem" do próprio filtro). `renderCurrentView()` calcula os
dois (`categoryItems` = `itemsForView(view)`; `items` = filtrado por
`subcat` se houver um selecionado) e repassa pra `renderProducts(items,
undefined, categoryItems)` — o 3º parâmetro novo é como
`renderGridMarkup()` sabe se deve desenhar a barra de chips.

**Convenção do 3º parâmetro pra não vazar estado entre categoria/busca/
alternância de modo**: `undefined` = "não mexe" (usado por
`toggleViewMode()`/`openImmersiveFromGrid()`, que só trocam de modo
visual sem recalcular a categoria — preserva a barra e o filtro ativo
ao ir pra imersiva e voltar); um array de verdade = navegação normal por
categoria; `null` explícito = busca, que precisa **apagar** a barra de
uma categoria anterior (resultado de busca mistura categorias
diferentes, filtrar por subcategoria de uma catego­ria só não faria
sentido ali). Sem essa distinção de 3 estados, a barra ficaria "presa"
mostrando a categoria errada depois de uma busca, ou sumiria ao
alternar pra imersiva e voltar.

**Barra só aparece com 2+ subcategorias distintas** — com 0 ou 1, um
filtro não ajudaria em nada (mostraria um chip só, sem alternativa
nenhuma pra escolher); Mesas (só "Mesas de Jantar") e Aparadores (nenhum
item com subcategoria) do teste de regressão cobrem os dois casos de
"sem filtro".

**Reset automático**: `applyView()` já zerava `state.viewMode` (força
grade) toda vez que entra numa categoria — ganhou mais uma linha,
`state.activeSubcat = ""`, mesmo raciocínio: entrar numa categoria
(mesmo que seja a mesma de novo, via clique na trilha) sempre volta pro
estado "limpo", sem filtro nenhum selecionado.

**Grid vazio depois do filtro não confunde com categoria vazia**:
`renderGridMarkup()` agora só retorna string vazia (caindo no
`#catalogEmpty` genérico, "Nenhum item disponível...") quando NÃO há
nem itens nem barra de chips pra mostrar — se o filtro ativo zerar os
itens visíveis mas a categoria tiver produtos em OUTRAS subcategorias,
a barra continua ali (pra escolher outra) e uma mensagem própria
("Nenhum item nessa subcategoria.") aparece no lugar da grade, sem
acionar o `#catalogEmpty` genérico (que soaria como "a categoria inteira
está vazia", errado). `renderProducts()` passou a checar o HTML de
verdade (`grid.innerHTML.trim() !== ""`) em vez de só `items.length`
pra decidir isso.

**Visual**: `.catalog-subcat-filter`/`.catalog-subcat-chip`
(`catalogo.css`) — pílulas centralizadas, mesma paleta terrosa
(`var(--accent)`) já usada no resto do catálogo (capa da categoria,
etc.), ativa preenchida/branco, inativa com contorno claro. Fica logo
abaixo da trilha, acima da grade de produtos — mesmo lugar do print que
o usuário mandou.

Teste de regressão novo: `tests/catalogo-subcategoria-browser.cjs` —
filtro aparece só com 2+ subcategorias reais; chips ordenados
alfabeticamente com "Todos" primeiro e ativo por padrão; selecionar um
chip filtra a grade de verdade (item sem subcategoria e das outras
subcategorias somem); o mesmo filtro vale pro modo imersivo; alternar
imersivo↔grade preserva o chip ativo; sair da categoria (clique na logo)
e reentrar reseta pra "Todos"; categorias com 0/1 subcategoria não
mostram filtro nenhum; busca não mostra a barra; mobile sem overflow.
Suíte completa de regressão do catálogo (9 arquivos, agora incluindo
este) + `tests/creditos-browser.cjs` rodadas de novo, todas passando.

## Ícone de imersivo/grade virou 2 ícones, no canto direito abaixo do menu

Pedido explícito do usuário, com print da categoria "Estofados" (já com
o filtro de subcategoria implementado) mostrando o ícone único de
alternância espremido ao lado do nome da categoria no cabeçalho: *"ta
vendo esse icone do lado de estofados no menu, eu quero retirar ele
dali, quero colocar no canto direito da tela, logo abaixo do menu. ai eu
quero que tenha um icone pra cada tipo de visualização, ou seja, no caso
de hoje precisa ter 2 icones ali"*.

**Dois pedidos numa tacada só**: (1) tirar do cabeçalho, botar no canto
direito logo abaixo do menu — mesma "prateleira" onde a trilha
Catálogo/Categoria já flutua; (2) trocar de UM botão que ALTERNAVA
(`#catalogViewToggle`, ícone mudava de aparência conforme o modo) por
DOIS botões fixos, um por modo — clicar no que já está ativo não faz
nada, clicar no outro troca direto pra ele.

**HTML**: `#catalogViewToggle` (dentro de `.catalog-navigation`, ao lado
de `#catalogPageLabel`) removido; no lugar, `#catalogViewSwitcher` — uma
`<div role="group">` com 2 `<button data-view-mode="grid|immersive">` —
virou filho de `.catalog-top-chrome`, irmão de `#catalogBreadcrumb`, não
mais do cabeçalho.

**JS**: `toggleViewMode()` (alternava `state.viewMode` entre os dois
valores) virou `setViewMode(mode)` (define direto, sem-op se já for o
modo ativo). `updateViewToggleButton()` continua com o mesmo nome (só
por trás passou a marcar `.is-active` em QUAL dos 2 botões bate com
`state.viewMode`, em vez de alternar uma classe `.is-grid` só num botão
que trocava de ícone). `updateViewToggleVisibility()` também manteve o
nome, só passou a mirar `#catalogViewSwitcher` inteiro. O clique é um
listener direto em `#catalogViewSwitcher` (delegado pros 2 botões via
`[data-view-mode]`) — igual o antigo, não passa pelo delegado geral de
`#catalogGrid` (o switcher nunca esteve dentro dele).

**CSS, mesmo mecanismo já usado na trilha**: `.catalog-view-switcher`
(`position:absolute;top:100%;right:0`, ancorado em `.catalog-top-chrome`
que é `position:sticky`) flutua no canto direito, logo abaixo do
cabeçalho, sem reservar espaço nem empurrar conteúdo — mesma ideia da
trilha (ver seção "Trilha de navegação" mais acima: a trilha em si
tomou esse formato depois de um pedido parecido, "a foto está indo só
até a linha da trilha"). Cada botão usa o mesmo truque de fundo
translúcido com blur da trilha (`rgba(255,255,255,.9)` + `backdrop-
filter`) pra continuar legível tanto sobre a grade branca quanto sobre
uma foto cheia no modo imersivo; ativo fica preenchido na cor terrosa
(`var(--accent)`), igual o padrão já usado pro chip ativo do filtro de
subcategoria e pro botão de capa da categoria. `z-index` maior que a
trilha (6 > 5) — nos raros casos de um nome de categoria/item comprido o
bastante pra alcançar o canto direito, o switcher fica por cima, nunca
escondido atrás da trilha.

**Removido, não só escondido**: as regras antigas de `.catalog-view-
toggle` (incluindo os ajustes de `body.catalog-modo-sistema` e o
breakpoint mobile) foram apagadas do CSS por completo, não deixadas como
código morto — o elemento que elas miravam não existe mais no HTML.

Teste de regressão: `tests/catalogo-menu-browser.cjs`,
`tests/catalogo-portal-browser.cjs` e
`tests/catalogo-subcategoria-browser.cjs` (que já verificavam o ícone
antigo — visibilidade escondida/reaparecendo, estado ativo, clique pra
trocar de modo) ajustados pro elemento novo: `#catalogViewToggle` →
`#catalogViewSwitcher` (visibilidade) e
`.catalog-view-switch-btn[data-view-mode="grid|immersive"].is-active`
(estado ativo, no lugar de `#catalogViewToggle.is-grid`). Verificado
visualmente com screenshot nos dois modos — grade com o ícone de grade
preenchido, imersivo com o de imersivo preenchido, os dois sempre no
canto superior direito, abaixo do cabeçalho, sem colidir com a trilha
nem com o filtro de subcategoria. Suíte completa de regressão do
catálogo (9 arquivos) + `tests/creditos-browser.cjs` rodadas de novo,
todas passando.

## 3º modo de visualização: "mosaico" (moodboard, sem nome até passar o mouse)

Pedido explícito do usuário, com print de referência de um moodboard
externo (fotos de móveis de tamanhos variados, coladas juntas, sem
legenda visível): *"eu quero que tenha mais um estilo de visualização
que é assim tudo junto, meio que bagunçado mesmo, sem o nome do item, o
nome e as informações só aparecem quando a gente passa o mouse por cima
dele"*.

**Um 3º valor pra `state.viewMode`** (`"mosaic"`, ao lado de `"grid"`/
`"immersive"` já existentes) e um 3º botão em `#catalogViewSwitcher`
(ver seção anterior — o switcher já tinha sido desenhado pra caber
`N` ícones, não só 2, então virou só adicionar um `<button data-view-
mode="mosaic">` a mais; `setViewMode()`/`updateViewToggleButton()` já
eram genéricos o bastante pra não precisar de NENHUMA mudança). Ícone
novo: 4 retângulos de tamanhos assimétricos (em vez dos quadrados
uniformes do ícone de grade), sugerindo colagem/moodboard.

**`columns` do CSS em vez de posicionamento calculado à mão** — decisão
técnica central, não pedida explicitamente mas o que faz o "bagunçado"
acontecer sozinho: `.catalog-mosaic{column-count:4}` + cada foto com
`width:100%;height:auto` (SEM `object-fit`, sem recortar/espremer em
quadrado nenhum, ao contrário dos cards de grade que usam `object-fit:
contain` numa caixa fixa). Como os produtos reais têm proporções bem
diferentes entre si (um banco baixo e largo, uma mesa alta e estreita),
cada foto entra na coluna com sua altura NATURAL — o próprio `columns`
distribui os blocos de altura desigual pelas colunas sozinho, criando o
efeito moodboard sem precisar calcular posição/tamanho aleatório de
cada item (que exigiria JS bem mais complexo pra um resultado
parecido). Verificado com fixtures de proporções bem diferentes (banco
500×180, mesa 420×720, sofá 600×260 etc.) comparando visualmente o
resultado renderizado — só com fixtures QUADRADAS (todas iguais) o
efeito não aparece, mas isso é esperado, é assim que masonry funciona;
com fotos reais do catálogo (proporções sempre variadas) o efeito
aparece sozinho.

**Nome/dimensões escondidos até o hover**: `.catalog-mosaic-info`
(rótulo por cima da foto, com um degradê escuro embaixo pra continuar
legível em qualquer foto) começa em `opacity:0` e só revela em
`:hover`/`:focus-visible` — mesmo mecanismo de fade já usado em outros
lugares do catálogo (ex. o escurecer da foto ambientada do item),
reaproveitado aqui. Clicar num bloco abre o item na visualização
imersiva, exatamente como um card da grade (mesmo `data-grid-item`,
mesmo delegado de clique em `bindInteractions()` — nenhum código de
clique novo precisou ser escrito).

**Reaproveitado sem mudança nenhuma**: a barra de filtro por
subcategoria (`renderSubcatFilterBar()`) funciona igual nos 3 modos —
`renderMosaicMarkup()` recebe `categoryItems` do mesmo jeito que
`renderGridMarkup()` e desenha a mesma barra de chips no topo. `.catalog-
products-grid-mode` (a classe que desliga o `scroll-snap-type` da
visualização imersiva) foi renomeada pra `.catalog-products-static-mode`
e passou a ser alternada por `state.viewMode !== "immersive"` em vez de
`=== "grid"` — cobre grade E mosaico com a mesma classe, já que as duas
são "visualizações paradas" (sem scroll de tela cheia, sem observers de
seção).

**Categoria continua sempre abrindo em grade**, nunca em mosaico — a
regra de `applyView()` que força `state.viewMode = "grid"` ao entrar
numa categoria não foi tocada; mosaico só é alcançável clicando no
ícone, igual imersivo.

Teste de regressão novo: `tests/catalogo-mosaico-browser.cjs` — 3º
ícone existe e ativa o modo; grade some quando o mosaico está ativo;
nome/dimensões com `opacity:0` fora do hover e `opacity:1` durante;
proporção renderizada da foto bate com a proporção natural da imagem
(sem cortar/esticar); clicar num bloco abre a imersiva; voltar pro
mosaico depois da imersiva preserva os mesmos itens; reentrar na
categoria sempre volta pra grade; mobile sem overflow em 2 larguras.
Verificado visualmente com fixtures de proporções variadas (screenshot
comparando o resultado "bagunçado" de verdade, não só com fixtures
quadradas artificiais) e o hover revelando o nome sobre um degradê
escuro. Suíte completa de regressão do catálogo (10 arquivos, agora
incluindo este) + `tests/creditos-browser.cjs` rodadas de novo, todas
passando.

## Detalhes + Modelo 3D do item viraram slides do próprio carrossel da foto principal

Pedido explícito do usuário, com print da tela de item mostrando o bloco
"DETALHES" (2 miniaturas) e "Visualização 3D" logo abaixo da foto/specs
principais: *"quero apagar aquele campo onde tem o 3d e as duas fotos de
detalhe, quero que a pessoa veja os detalhes no mesmo lugar da foto
principal, quero que tenha uma seta esmaecida premium onde a pessoa
troque a foto no próprio local da foto principal."*

**Pergunta de esclarecimento antes de implementar** (via AskUserQuestion):
o bloco "Visualização 3D" mostra o MODELO 3D ESPECÍFICO daquele item
(quando cadastrado) — diferente do Módulo 3D/Painel 3D do Portal, que é
um estúdio geral. Perguntado se, ao apagar o campo, esse preview devia
virar mais um slide do carrossel ou sumir de vez; usuário respondeu
**"Remove de vez dessa tela"** — o preview de modelo 3D por item foi
removido por completo (não virou slide), o Módulo 3D do Portal continua
existindo normalmente, sem nenhuma mudança.

**Achado crítico ANTES de apagar qualquer coisa** (investigação
proativa, não pedida — checar dependência compartilhada antes de deletar
é prática já estabelecida nesta sessão): `window.catalogLoadModelAsset`
(definida em `catalogo.mjs` como `loadModelAsset`, junto com
`modelAssetCache`/`MAX_MODEL_ASSETS_IN_MEMORY`/`notifyAssetProgress`/
`trimModelAssetCache`) é chamada por `catalogo-studio3d.mjs` como
fallback de carregamento/cache de `.glb` (`typeof
window.catalogLoadModelAsset === "function" ? await
window.catalogLoadModelAsset(key, onProgress) : ...`) — ou seja, é
infraestrutura COMPARTILHADA com o Painel 3D do Portal, não exclusiva do
preview por item que estava sendo removido. Mantida intacta em
`catalogo.mjs`, com um comentário novo explicando por quê. Removido de
verdade, todo específico do preview por item: `modelViewerPromise`,
`isEconomyDevice()`, `warmModelExperience(item)`, o `supportsWebGL()`
PRÓPRIO de `catalogo.mjs` (`catalogo-studio3d.mjs` tem o seu, independente,
não usa `<model-viewer>`, desenha com Three.js puro), `ensureModelViewer()`,
`showModelInMain(section, item)`, `restoreMainPhoto(section)`, o
`IntersectionObserver` de pré-carregamento (`state.modelObserver`) e
todas as chamadas `.disconnect()` associadas.

**Arquitetura nova**: as 2 fotos de Detalhe (`detalhe_01`/`detalhe_02`)
viraram mais dois slides do MESMO carrossel da foto principal, em vez de
miniaturas numa seção separada abaixo — `mainSlides(item)` monta a lista
(`principal` sempre primeiro; `detalhe_01`/`detalhe_02` só entram se
tiverem foto cadastrada OU se `state.acessoInterno` for `true`, aí entra
como slide vazio/placeholder pra equipe poder adicionar). `renderMainSlide
(section, item, slot)` pinta o slide ativo (crossfade rápido, mesma
lógica de troca de variante de cor) e "retargeta" o pontinho ativo +
o badge de edição pro slot em foco. `stepMainSlide(section, item,
direction)` avança/retrocede (`data-main-nav="prev"/"next"`).
`mainCarouselMarkup(item)` só desenha as setas/pontinhos quando há 2+
slides (item sem nenhuma foto de Detalhe e sem acesso interno = só a
principal, sem carrossel nenhum). Setas "esmaecidas premium", pedido
literal do usuário: `.product-main-nav{opacity:.55}` em repouso,
`opacity:1` no hover/focus — mesmo padrão visual (círculo translúcido +
blur) já usado nos outros controles flutuantes sobre foto do catálogo.

**Edição inline continua funcionando, sem nenhuma UI nova**: o badge
"✎" da foto principal (`.catalog-inline-edit-badge`) agora **segue o
slide em foco** — `renderMainSlide()` atualiza
`badge.dataset.inlineEdit` pro slot ativo a cada troca (clicando a seta
ou reabrindo a seção), então clicar no lápis sempre edita a foto que
está sendo exibida no momento, seja ela a principal ou um Detalhe.
`cropFrameForSlot(section, slot)` passou a rotear TANTO "principal"
QUANTO "detalhe_*" pra `.product-main-media` (a mesma moldura) — só
"galeria_*" (Ambientada) continua indo pro `.product-event-panel`, que
não mudou (as 3 Ambientadas continuam com seus próprios pontinhos
`.catalog-event-slot-picker`, fora do carrossel da principal). Slot de
Detalhe vazio mostra "+" no badge e abre o seletor de arquivo do sistema
na hora (mesmo comportamento de sempre); slot preenchido mostra "✎".
Nenhuma linha de `startInlineEdit`/`applyInlineEdit`/`removeCropSlot`
precisou mudar — só o ROTEAMENTO de qual frame usar.

**CSS**: toda a seção `.catalog-detail-lower`/`.detail-gallery`/
`.detail-thumb`/`.model-block`/`.model-card`/`.model-stage`/
`.model-fallback` foi removida (inclusive dos `@media` de mobile,
viewport baixo e do parallax de scroll lateral — cada bloco tinha regras
MISTURADAS com seletores que continuam válidos, removido seletor a
seletor, não o bloco inteiro). `.catalog-detail-panel` não reserva mais
uma segunda linha (`grid-template-rows` de `minmax(0,1fr) auto` virou só
`minmax(0,1fr)`) — a foto principal + specs ocupam a altura toda da
seção agora. Removida também a variável de parallax `--catalog-details-x`
(não existe mais elemento nenhum pra aplicá-la) do loop de scroll em
`setupScrollMotion()` (`catalogo.mjs`).

**Teste de regressão** (`tests/catalogo-editor-fotos-browser.cjs`,
reescrito): decorador sem nenhuma foto de Detalhe cadastrada não vê
nenhuma seta/pontinho (carrossel de 1 slide só = sem carrossel visível);
equipe interna vê 3 posições no carrossel (principal + Detalhe 1
preenchido + Detalhe 2 vazio), navega com as setas e confirma que o
badge de edição retargeta sozinho (lápis em Detalhe 1 preenchido, "+" em
Detalhe 2 vazio, com o `aria-label` certo), adiciona foto no Detalhe 2
vazio pelo mesmo fluxo de sempre (seletor abre no primeiro clique) e
confirma que o carrossel continua com 3 posições depois (só deixou de
ser placeholder). Suíte completa de regressão do catálogo (11 arquivos)
+ `tests/creditos-browser.cjs` rodadas de novo, todas passando.

**Achado à parte, fora do escopo desta mudança**: `tests/
catalogo-layout-browser.cjs` (um teste antigo, fora da suíte de
regressão rastreada nesta sessão — não está em `test:catalogo` do
`package.json` nem era chamado manualmente nas últimas features) já
estava quebrado ANTES desta mudança, por um motivo não relacionado:
monta `productTemplate()` isolado via `vm` com um contexto que só
simula `escapeAttr`/`escapeHtml`/`normalizeSearch`/`detailGallery`/
`modelBlock`, mas o template já chamava `specsPanel`/
`variantSwatchesBlock`/`capaToggleMarkup`/`state.acessoInterno` desde a
feature de "Painel técnico"/"capa da categoria" (sessões anteriores),
nunca atualizado pra simular essas dependências — falha com
`ReferenceError: specsPanel is not defined` mesmo sem nenhuma mudança
desta sessão. Não corrigido (fora do escopo pedido, e já estava quebrado
antes) — registrado aqui pra não confundir com uma regressão desta
mudança se for notado depois.

## Itens relacionados (mesma subcategoria), no lugar onde ficavam os Detalhes

Pedido explícito do usuário, logo depois do carrossel acima substituir o
bloco "Detalhes"/"Visualização 3D": *"agora onde estava a foto desses
detalhes quero que apareça alguns itens relacionados, esses itens você
coloca itens que são da mesma subcategoria lá dentro de cadastro, eles
ficarão passando ali pra pessoa conseguir ver sugestões de combinações...
mas quero a foto desses itens pequena mesmo"*.

**Pergunta de esclarecimento antes de implementar** (via AskUserQuestion):
"ficarão passando ali" podia significar uma faixa que anda sozinha
(marquee) ou uma faixa parada que a pessoa rola/arrasta manualmente (com
setas, igual ao carrossel da foto principal). Usuário escolheu **passar
sozinha automaticamente** — confirma a leitura literal da frase.

**Critério de "relacionado"**: mesma categoria **E** mesma subcategoria
do item aberto (`relatedItems()`, `catalogo.mjs`) — nunca só subcategoria
isolada, porque duas categorias diferentes podem coincidir no nome da
subcategoria por acaso (ex.: "Sofás" existe tanto em Estofados quanto,
hipoteticamente, em Mesas de apoio de sofá — testado de propósito no
teste de regressão). Item sem subcategoria cadastrada nunca tem
relacionados (nada pra comparar — mesma regra já valia pro filtro
premium de subcategoria, ver seção correspondente mais acima). Nunca
inclui o próprio item nem as variantes de cor dele (`item.variantGroup`)
— sugerir a mesma poltrona noutra cor não é uma "combinação". Lê sempre
de `state.items` (lista principal pós-`agruparVariantes`, uma entrada
por grupo de variante), então cada relacionado resolve direto pra uma
seção já renderizada — item relacionado é sempre da MESMA categoria do
item aberto, e a imersiva já renderiza a categoria inteira de uma vez
(ver "Catálogo: tela de Destaques + filtro real por categoria" mais
acima), então a seção de destino sempre já existe no DOM.

**Precisa de 2+ pra aparecer** (não só "algum" candidato): com só 1
relacionado, a faixa "passando" ficaria mostrando a mesma foto se
repetindo sem nenhum efeito de verdade (ver próximo parágrafo, a lista é
dobrada pro loop) — sem sentido pedir pra "passar" uma coisa só.

**Faixa passando sozinha, loop perfeito em CSS puro**: `.catalog-related-
track` recebe a lista de relacionados DOBRADA (`[...related,
...related]`) e uma animação `translateX(0) → translateX(-50%)` em loop
infinito (`@keyframes catalog-related-scroll`) — como a track é `width:
max-content` com a lista 2x, andar exatamente metade da própria largura
faz a "cópia" cair visualmente onde o original começou, sem nenhum salto
visível. Duração proporcional à quantidade REAL de itens (`Math.max(18,
related.length * 4)` segundos) — poucos itens não podem passar rápido
demais pra dar tempo de ver. Pausa em `:hover`/`:focus-within` do
contêiner (não da faixa em si) — dá tempo de mirar e clicar sem a foto
fugir de baixo do cursor. Só a 1ª cópia (a "real") é alcançável por
`Tab` (`tabindex="-1" aria-hidden="true"` na 2ª) — a cópia existe só pro
efeito visual do loop, dar Tab nela repetiria os mesmos itens de novo
sem motivo.

**"Mas quero a foto desses itens pequena mesmo"**: fotos de 72px (60px
em telas curtas/mobile), sem nome nem dimensão visíveis por padrão — só
a foto. Nome aparece num degradê escuro por cima, só no hover/foco
(`.catalog-related-name`, mesmo padrão de revelação já usado no modo
mosaico — ver "3º modo de visualização: mosaico" mais acima). Clicar
num relacionado rola até a seção dele (`scrollIntoView`, mesmo padrão
de `scrollToIndex()`), sem precisar recarregar nada — a seção já está
ali.

**Onde mora no layout**: `.catalog-detail-panel` ganhou uma 2ª linha de
grid (`grid-template-rows:minmax(0,1fr) auto`, era só uma linha depois
da remoção do bloco de Detalhes/3D) — `.catalog-detail-top` (foto+specs)
continua ocupando a linha `1fr` (cresce pra preencher o espaço todo
quando NÃO há relacionados, já que a linha `auto` fica com altura 0 sem
conteúdo nenhum dentro dela), e `.catalog-related-items` (quando existe)
vira a 2ª linha, `auto`, logo abaixo. Como a maioria das telas menores
(`@media(max-width:767px)`) já reorganiza `.catalog-detail-panel` como
flex column com `order` por elemento, `.catalog-related-items` ganhou
`order:3` nesse breakpoint (depois da foto principal, antes do painel
de Ambientada) — sem isso ficaria fora de ordem (um filho novo sem
`order` explícito cai em `order:0`, antes até do título).

**Achado escrevendo o teste, mesma classe de bug já documentada no
CLAUDE.md pro hover da Home**: `.hover()` do Playwright espera o alvo
ficar "estável" (parado) por dois frames seguidos antes de disparar o
evento — como `.catalog-related-item` está DENTRO da faixa que anima
continuamente, ele nunca fica parado tempo suficiente, e `.hover()`
trava em timeout. Corrigido no teste passando o mouse primeiro pelo
CONTÊINER estático (`.catalog-related-items`, que não anima — só o
filho `.catalog-related-track` tem a animação), o que já pausa a
animação via `:hover`; só DEPOIS disso o item individual fica
realmente parado e pode ser hovered/clicado com segurança pelo
Playwright. **Achado semelhante testando "tirar o mouse retoma o
movimento"**: depois de CLICAR num relacionado, o botão clicado fica
focado (foco nativo de `<button>` no Chromium), e como a pausa também
vale pra `:focus-within`, a animação continua pausada mesmo depois do
mouse sair — comportamento CORRETO (favorece quem navega por teclado),
não um bug; o teste passou a verificar "retoma ao tirar o mouse" ANTES
de qualquer clique, pra não confundir esse efeito do foco com uma falha
de verdade no hover.

Teste de regressão novo: `tests/catalogo-relacionados-browser.cjs` —
2+ itens da mesma categoria+subcategoria aparecem dobrados na faixa (pro
loop), nunca o próprio item; mesma subcategoria em OUTRA categoria não
conta (prova que o critério é cat+subcat, não só subcat); só a 1ª cópia
é alcançável por Tab; nome escondido fora do hover e revelado durante;
foto pequena de verdade (≤90px); animação rodando fora do hover, pausada
durante; clicar rola até a seção do item clicado (`scrollIntoView`
espionado via `Element.prototype.scrollIntoView` sobrescrito no
`addInitScript`, mais fácil de provar QUAL elemento foi alvo do que
medir posição de scroll pixel a pixel); subcategoria com só 1 item ou
item sem subcategoria não mostram a faixa; sem overflow mobile. Suíte
completa de regressão do catálogo (12 arquivos, agora incluindo este) +
`tests/creditos-browser.cjs` rodadas de novo, todas passando.

**Ajuste pedido logo depois, com print de dado real** (a lista real de
itens do cliente, mostrando o nome sobreposto numa foto vazia — "Sem
foto"): *"as informações do item quero que apareça quando eu passar o
mouse por cima dele, as informações não podem aparecer dentro da
foto"*. A 1ª versão desenhava `.catalog-related-name` como overlay
(`position:absolute`, degradê escuro) POR CIMA da própria `<img>` — o
pedido é pra manter o "só aparece no hover" mas tirar o nome de cima da
foto. Corrigido trocando `.catalog-related-item` de um botão simples
pra `display:flex;flex-direction:column` (foto em cima, nome embaixo,
os dois filhos DIRETOS do mesmo `<button>` de sempre, sem mudar HTML
nenhum — só a foto ganhou tamanho fixo próprio, `.catalog-related-photo`,
já que o botão deixou de ter altura fixa) — o nome virou um bloco
NORMAL no fluxo, sem `position:absolute`/degradê nenhum, só com
`opacity:0→1` no hover/foco, sempre no mesmo lugar, abaixo da foto,
nunca tocando ela. Como o nome passou a ocupar espaço reservado sempre
(mesmo invisível), a altura de cada item cresceu um pouco (foto 72px +
uma linha de texto), mas a FOTO em si continua do mesmo tamanho pequeno
de antes — o pedido anterior ("quero a foto pequena mesmo") continua
valendo, só o texto que estava embutido nela que se mudou pra fora.
Teste de regressão ajustado: a checagem de "foto pequena" passou a
medir `.catalog-related-photo` (não mais o `<button>` inteiro, que
ficou mais alto por causa do texto) e ganhou uma nova asserção
comparando a posição Y do nome contra o fim da foto, provando que o
nome nunca sobrepõe a imagem. Suíte completa de regressão do catálogo
(12 arquivos) + `tests/creditos-browser.cjs` rodadas de novo, todas
passando.

## Nome do item + círculos de cor no mesmo bloco (bleed sobre a foto de propósito)

**Superado**: os círculos foram para EMBAIXO do nome e as medidas viraram uma linha das specs — ver "Tela do item: círculos de cor EMBAIXO do nome + medidas dentro das specs" mais abaixo. Mantida só pelo histórico.

Pedido explícito do usuário, com print da tela do item: *"agora eu quero
diminuir um pouco o nome do item e quero colocar ao lado na mesma linha
os círculos das cores disponíveis"* — os círculos de variante (ver
"Card de variantes... estilo marketplace" mais acima) moravam numa
seção própria, "Cores disponíveis", bem mais abaixo (depois do painel
técnico e do card "Experimente outro tecido"). Pedido: subir os
círculos pra ficarem ao lado do nome, e diminuir um pouco a fonte do
nome.

**Achado testando com o nome real do print ("Poltrona Águines Campo")**:
mesmo com a fonte reduzida, a coluna de texto (`.catalog-detail-top`
reserva só 30% da largura pra texto, 70% pra foto) é estreita demais
(~232px num desktop de 1440px) pra caber nome+círculos numa linha só —
o `<h1>` sozinho, com `white-space:nowrap` (nunca quebra o nome em
várias linhas, decisão antiga do design), já precisa de ~383px, mais
que a coluna inteira. **Perguntado ao usuário como preferia resolver**
(3 opções: aumentar a coluna de texto/encolher a foto; diminuir o nome
bem mais; deixar nome+círculos vazarem por cima da foto) — resposta
explícita, digitada como "Other": **"os círculos e o nome passam por
cima da foto, sobrepõe"**. Ou seja, decisão consciente e confirmada:
overlap é o comportamento CERTO aqui, não um bug a evitar.

**Implementação**: `variantSwatchesBlock()` (`catalogo.mjs`) parou de
desenhar sua própria seção (`<div class="product-variants">` +
`<span class="section-kicker">Cores disponíveis</span>`) — agora
devolve só a fileira de círculos (`.product-variants-row`), inserida
DENTRO de um `<div class="product-title-row">` novo, junto com o
`<h1 class="product-title">`, logo no topo de `.product-copy`. O
rótulo "Cores disponíveis" (que ficava numa linha própria acima dos
círculos) foi removido — ao lado do nome já fica óbvio o que é; a
informação não se perde pra quem usa leitor de tela (`role="group"
aria-label="Cores disponíveis"` no wrapper, `title`/`aria-label` em
cada círculo, herdados de antes). O nome de cada cor embaixo do círculo
("estilo marketplace", pedido de uma sessão anterior) foi mantido — só
o CABEÇALHO do grupo que sumiu, não a legenda de cada variante.

**CSS, `.product-title-row{display:flex;align-items:flex-end;
flex-wrap:nowrap}`** — nowrap de propósito (nunca quebra pra uma 2ª
linha, mesmo sem espaço): quando o nome é comprido, a linha inteira
(nome+círculos) vaza visualmente pra dentro da área da foto, por cima
dela — `.product-title-row` tem `z-index:2`, maior que o
`.product-main-media{z-index:1}` da foto, então o texto/círculos pintam
POR CIMA da foto na região de overlap, nunca escondidos atrás dela.
Nada corta esse vazamento — não existe `overflow:hidden` entre
`.product-copy` e `.catalog-detail-panel` (que só corta na própria
borda do painel, bem mais longe do que o texto normalmente alcança).

**Achado real implementando — `flex-shrink` default quebrava tudo**:
a 1ª tentativa só com `flex-wrap:nowrap` não bastava — mesmo sem
quebrar linha, um flex item ainda pode ENCOLHER por padrão
(`flex-shrink:1` implícito). Como a coluna (232px) é bem menor que
nome+círculos somados (~563px), o navegador espremia a fileira de
círculos (`.product-variants-row`) até ficar mais ESTREITA que um
círculo só (46px) — o que disparava o `flex-wrap:wrap` INTERNO dela
(ela ainda tem flex-wrap:wrap, pra continuar quebrando linha ENTRE os
círculos numa coluna realmente pequena) e empilhava os 3 círculos na
VERTICAL, um em cima do outro, longe do nome — resultado visual
completamente quebrado (visto rodando o teste com screenshot real,
não só lendo o código). Corrigido com `flex-shrink:0` tanto em
`.product-title` quanto em `.product-variants-row` — nenhum dos dois
encolhe mais, os dois mantêm o tamanho natural e SÓ a linha inteira
vaza pra direita, como pretendido.

**Mobile é uma exceção deliberada, volta a quebrar linha**: o "vaza por
cima da foto" só faz sentido no layout de 2 colunas do desktop (foto ao
lado, atrás do texto). No mobile (`@media(max-width:767px)`), a foto vem
numa linha ABAIXO do texto (fluxo empilhado, `.catalog-detail-top{display:
contents}` com `order` por elemento) — não tem nada ali pra "sobrepor",
então sem essa exceção o nome comprido vazaria pra FORA da tela (overflow
horizontal de verdade, quebrando o "sem overflow mobile" que toda tela do
catálogo respeita). `.product-title-row{flex-wrap:wrap}` só nesse
breakpoint — os círculos caem pra uma 2ª linha, abaixo do nome, igual a
1ª tentativa (rejeitada pro desktop) que motivou a pergunta ao usuário.

**Efeito colateral corrigido em `applyVariant()`**: a lógica que decide
onde inserir as specs atualizadas ao trocar de variante usava
`section.querySelector(".product-variants")` como âncora de fallback
(quando não há card "Experimente outro tecido") — essa classe não
existe mais (os círculos moraram pra dentro de `.product-title-row`).
Trocado pra `[data-capa-toggle]` (o próximo irmão fixo depois das
specs na ordem nova) e, se nem esse existir (decorador externo, sem
botão de capa, sem bespoke card — a combinação que ficaria SEM NENHUMA
âncora), cai pra inserir logo depois de `.product-rule`, que SEMPRE
existe. Sem essa correção, um decorador externo com item não-
personalizável trocando de variante de cor ficaria com o painel técnico
sumindo silenciosamente após o 1º clique num círculo — achado só por
inspeção do código ao mexer na função, não reportado pelo usuário.

Teste de regressão novo: `tests/catalogo-titulo-cores-browser.cjs` —
círculos vivem dentro de `.product-title-row`, junto do `<h1>` (não
existe mais `.product-variants` separado); título e círculos ficam
próximos verticalmente (mesmo bloco); clicar num círculo troca de
variante e as specs continuam atualizando de verdade mesmo no cenário
sem bespoke/capa (prova a correção da âncora); item com 1 cor só não
mostra nenhum círculo; sem overflow horizontal em 390px/768px. Suíte
completa de regressão do catálogo (13 arquivos, agora incluindo este) +
`tests/creditos-browser.cjs` rodadas de novo, todas passando.

## Mini-menu "Módulo 3D" (3 funcionalidades, a 1ª sendo o estúdio de sempre)

**Removido numa sessão bem mais tarde** — ver "Mini-menu 'Módulo 3D' e
Módulo Lounge (Composições) — removidos" mais abaixo (pedido explícito do
usuário: "dentro do modulo de 3d deixe apenas o 3d livre... pode remover
os outros"). Clicar em "Módulo 3D" no Portal volta a abrir o Estúdio de
Ambientes ("3D Livre") direto, sem nenhuma tela intermediária. Todo o
histórico desta seção e das rodadas seguintes (10 rodadas de refinamento
visual) mantido abaixo só pelo raciocínio de design, sem nenhum código
correspondente sobrevivendo.

Pedido explícito do usuário: *"vamos criar uma tela nova quando a pessoa
clicar em módulo 3D, eu quero que quando a pessoa clicar, eu quero que
apareça como se fosse outro mini menu, dentro do módulo 3D nós teremos 3
funcionalidades diferentes, então eu quero que no topo do html
centralizado e grande apareça um móvel em 3d e embaixo deixe 3 campos
clicáveis pra acessar esses 3 módulos que vamos desenvolver"*.

**Perguntas de esclarecimento antes de implementar** (via AskUserQuestion,
2 rodadas): (1) o bloco "Módulo 3D" do Portal abria direto o estúdio já
existente (planta baixa/render/câmera) — confirmado que esse estúdio
**vira o 1º dos 3 cards** do mini-menu novo, não um caminho paralelo; (2)
os outros 2 cards ainda não têm funcionalidade nenhuma construída
("vamos desenvolver") — confirmado que devem mostrar uma tela "Em breve"
ao clicar, não ficar desabilitados; (3) nomes dos cards — usuário optou
por nomes genéricos por enquanto ("Estúdio de Ambientes" pro 1º, "Em
breve" pros outros 2, decide os nomes de verdade quando as funções
existirem); (4) de onde vem o modelo 3D grande do topo — resposta
explícita: **"da mesma forma que eu escolho a foto da capa da
categoria, vou escolher o 3D que aparece... um dos que temos cadastrados
no sistema"** — mesmo mecanismo de `itens.capa_categoria`, só que pra
escolher um modelo `.glb` em vez de uma foto.

**Navegação**: bloco "Módulo 3D" do Portal parou de chamar
`openStudioOverlay()` direto — agora chama `applyView(MODULO3D_MENU_VIEW)`,
um valor novo de `state.activeView` (mesma família de `HOME_VIEW`/
`GATEWAY_VIEW`, desenhado dentro do mesmo `#catalogGrid` reaproveitado por
Portal/Home/categoria — nunca um `#catalogStudio`/overlay próprio).
`MODULO3D_CARDS` (`catalogo.mjs`) é a fonte única dos 3 cards — cada um
com `key`/`label`/`action` (`"studio"` chama `openStudioOverlay()`
inalterado; `"soon"` navega pra outro valor novo, `MODULO3D_SOON_VIEW`,
uma tela "Em breve" genérica reaproveitada pelos 2 cards ainda não
construídos). Trilha ganhou um 3º nível: **Catálogo / Módulo 3D /
Painel 3D** (o "Módulo 3D" do meio volta pro mini-menu, não mais reabre
o estúdio direto — o `#catalogPageLabel`/breadcrumb do estúdio, que
antes era só 2 níveis, precisou ser ajustado pra refletir essa nova
camada).

**Modelo 3D em destaque, mesmo padrão de `capa_categoria` só que
GLOBAL**: campo novo `itens.capa_modulo3d` (migration
`20260919000100_itens_capa_modulo3d.sql`, aplicada com `npx supabase db
push --linked`, e `catalogo_acervo()` recebeu `create or replace
function` só pra incluir `'capa_modulo3d',i.capa_modulo3d` no
`jsonb_build_object` — mesmo ponto único de alteração já usado pras
adições anteriores de campo). **Diferente de `capa_categoria` (um por
categoria)**, aqui só UM item na empresa inteira pode estar marcado por
vez, já que só existe UMA tela "Módulo 3D" (não uma por categoria) —
`alternarCapaModulo3d(item)` desmarca qualquer outro item que já
estivesse marcado antes de marcar o atual (mesmo padrão de
`alternarCapaCategoria()`, sem o filtro por categoria). Botão de marcar
(`.catalog-capa-modulo3d-toggle`, reaproveita o visual de
`.catalog-capa-toggle`) fica na página de detalhe do item, ao lado do
botão de capa da categoria — só aparece pra equipe interna E só em
itens que **já têm um modelo `.glb` cadastrado** (`item.glb`, campo que
já existia via `itens_modelos_3d`); marcar um item sem modelo não teria
o que mostrar.

**Achado real testando a mutualexclusividade**: a 1ª versão de
`handleCapaModulo3dToggleClick()` só atualizava o BOTÃO do item
CLICADO — se o item que acabou de ser desmarcado automaticamente
(`alternarCapaModulo3d` desmarcando um "irmão") também estivesse
renderizado na tela (mesma categoria, os dois numa mesma lista
imersiva), o botão DELE continuava mostrando ★ (marcado) mesmo depois
de já ter sido desmarcado no banco e em `state.items` — só ficava
correto depois de um reload. Diferente de `alternarCapaCategoria()`
(que só precisa desmarcar dentro da MESMA categoria já sendo exibida),
aqui um "irmão" desmarcado pode estar em QUALQUER categoria, então a
correção precisou de mais que só reler `section` do item clicado:
`alternarCapaModulo3d()` agora **devolve a lista de itens desmarcados**,
e `handleCapaModulo3dToggleClick()` procura o botão de cada um deles em
QUALQUER seção que esteja na tela no momento (`document.querySelector`
por `data-product-id`) e atualiza também, não só o botão que foi
clicado.

**Modelo escolhido, com fallback em 2 níveis**: `modulo3dFeaturedItem()`
procura primeiro um item com `capaModulo3d===true`; sem nenhum marcado,
cai pro primeiro item que tiver QUALQUER modelo `.glb` cadastrado
(nunca fica sem mostrar nada existindo pelo menos 1 modelo no sistema);
sem nenhum modelo em lugar nenhum, mostra um estado vazio ("Nenhum
modelo 3D em destaque ainda", com uma dica extra só pra equipe: "marque
um item com modelo 3D cadastrado..."). Busca em `allItemsFlat()` (TODOS
os itens, incluindo variantes que não são a "principal" de cada grupo
pós-`agruparVariantes()`, já que `capaModulo3d` pode estar marcado em
qualquer variante específica — mesmo raciocínio de `findItemById()`).

**`<model-viewer>` volta a ser usado, mas só aqui, não mais por item**:
o componente vendorizado (`js/vendor/model-viewer/model-viewer.min.js`)
tinha ficado órfão nesta mesma sessão, depois da prévia 3D por item ser
removida (ver "Detalhes + Modelo 3D do item viraram slides..." mais
acima) — `ensureModelViewer()`/`supportsWebGL3D()`/`isEconomyDevice3D()`
são praticamente uma ressurreição fiel das funções removidas
(`ensureModelViewer`/`supportsWebGL`/`isEconomyDevice`, olhadas no
histórico do git antes de reescrever, pra não perder o tratamento de
erro/dispositivo fraco já testado), só que chamadas UMA vez, pro modelo
em destaque do mini-menu, não mais uma vez por item. O cache/loader de
`.glb` em si (`loadModelAsset`/`window.catalogLoadModelAsset`) nunca
tinha saído — já era compartilhado com `catalogo-studio3d.mjs` (ver
mesma seção acima) — só ganhou mais um consumidor.

**Achado no teste, arriscado se não corrigido**: `<model-viewer>` faz
parsing BINÁRIO de verdade do arquivo `.glb` assim que o `src` é
atribuído — um fixture de bytes aleatórios arriscava lançar um erro não
tratado durante esse parse (quebrando a asserção de "zero erros de
página" que todo teste desta suíte faz no fim). Corrigido construindo um
`.glb` mínimo mas ESTRUTURALMENTE válido no teste (cabeçalho + 1 chunk
JSON `{"asset":{"version":"2.0"}}`, sem cena/malha nenhuma) em vez de um
buffer de texto qualquer — suficiente pra não estourar erro nenhum,
mesmo sem ter uma cena de verdade pra desenhar.

**Achado escrevendo o teste, sobre navegação em modo `login_ok`**: a
1ª versão do teste simulava acesso da equipe via `sessionStorage.
login_ok` (mesmo padrão "veio do dashboard" de outros testes) — mas
esse modo adiciona `catalog-modo-sistema` no `<body>`, que esconde
`.catalog-brand` com `display:none!important` (ver seção "Catálogo —
dois jeitos de entrar" mais acima). Como este teste precisa ir e voltar
do Portal várias vezes (mini-menu → estúdio → mini-menu → categoria →
mini-menu de novo pra conferir a troca do modelo em destaque) e a ÚNICA
forma de voltar ao Portal é clicando a logo, `login_ok` tornava a volta
impossível de simular. Trocado pro caminho de "login direto da equipe"
(mesma sessão do Supabase Auth simulada desde o carregamento da página,
sem passar pelo formulário — ver "Login direto da equipe..." mais
acima), que mantém o cabeçalho normal (logo clicável) com os mesmos
privilégios de equipe.

Teste de regressão novo: `tests/catalogo-modulo3d-menu-browser.cjs` (3
cenários) — clicar em "Módulo 3D" mostra o mini-menu, não abre o
estúdio direto; 3 cards corretos (1 sem selo, 2 com "Em breve"); modelo
em destaque é o item marcado, com fallback pro 1º item com modelo, e
estado vazio sem nenhum; card 1 abre o estúdio de verdade, trilha de 3
níveis; card "Em breve" mostra a tela própria com um botão de voltar;
botão de marcar modelo só em itens com `.glb`, mutuamente exclusivo
(marcar um desmarca o outro, inclusive o BOTÃO na tela, não só o
banco); decorador externo nunca vê o botão de marcar. Suíte completa de
regressão do catálogo (14 arquivos, agora incluindo este) + `tests/
creditos-browser.cjs` rodadas de novo, todas passando.

## Redesenho premium do mini-menu "Módulo 3D"

Pedido grande e detalhado (spec de ~13 seções, escrita já como prompt de
implementação), resumido: deixar o mini-menu do Módulo 3D (ver seção
anterior) "mais premium, elegante, organizado e funcional" — visualizador
3D como destaque real (não estático/ilustrativo), controles de câmera de
verdade (aproximar/afastar/redefinir/tela cheia), selo "Visualização
360°", dica de uso, e a seção "Explore os recursos" com o Estúdio de
Ambientes em destaque + 2 recursos futuros com nome próprio. O usuário
pediu investigação completa antes de mexer e proibiu perguntas
respondíveis pela própria análise do projeto — as únicas 2 interações
depois do pedido inicial foram correções pontuais dele mesmo, olhando a
tela renderizada (ver "Achados corrigidos direto do print" abaixo).

**Investigação feita antes de tocar em qualquer código** (todos os itens
do checklist pedido): os arquivos responsáveis já eram só 3 —
`catalogo.mjs` (`renderModulo3dMenu()`/`renderModulo3dModel()`/
`MODULO3D_CARDS`, ver seção anterior), `catalogo.css`
(`.catalog-modulo3d-*`) e `catalogo.html` (cache-busting). O modelo 3D
carrega via `<model-viewer>` (`@google/model-viewer@3.5.0`, vendorizado
em `js/vendor/model-viewer/model-viewer.min.js`, carregado por `import()`
dinâmico) — **biblioteca DIFERENTE** da usada pelo Estúdio de Ambientes
(`catalogo-studio3d.mjs`, Three.js puro via CDN esm.sh) — as duas
convivem sem conflito, cada uma no seu escopo. Confirmado por grep no
bundle vendorizado (não assumido) que a versão suporta
`cameraOrbit`/`getCameraOrbit`/`jumpCameraToGoal`/`minCameraOrbit`/
`maxCameraOrbit`/`disable-pan`/`shadow-intensity`/`shadow-softness`/
`bounds`(`"tight"`) — nenhuma controle de rotação/zoom/câmera existia
antes deste pedido (a versão anterior só mostrava o `<model-viewer>` com
`camera-controls` nativo, sem nenhuma UI própria de controles). O botão
"Estúdio de Ambientes" já chamava `openStudioOverlay()`
(`setActiveOverlay("studio")` + evento `catalog-studio-open`) — mantido
100% intacto, mesma rota, sem duplicação. Os "Em breve" eram 2 cards
genéricos que levavam a uma tela própria ao clicar (`MODULO3D_SOON_VIEW`)
— comportamento trocado por cards inertes (ver abaixo), conforme a nova
spec pede explicitamente ("sem comportamento de clique").

### Visualizador — controles reais, não decorativos

Pedido explícito: "não faça uma tela estática ou meramente ilustrativa.
Todos os controles apresentados devem estar ligados ao visualizador 3D
real." Os 4 botões da barra vertical (`.catalog-modulo3d-controls`)
mexem direto na API do `<model-viewer>`, nunca CSS/animação chutada:
- **Aproximar/Afastar** (`modulo3dZoom(direction)`): lê
  `viewer.getCameraOrbit()` (devolve `{theta,phi,radius}` em
  radianos/metros — não a string do atributo) e reescreve só o `radius`
  (×0.82 ou ÷0.82), via `viewer.cameraOrbit = "...rad ...rad ...m"` +
  `jumpCameraToGoal()`. Ângulo de rotação atual fica intacto.
- **Redefinir**: guarda a órbita já RESOLVIDA (`getCameraOrbit()`) no
  evento `load` do modelo — não um valor chutado — e restaura essa
  mesma órbita exata.
- **Tela cheia**: Fullscreen API no `.catalog-modulo3d-viewer` inteiro
  (badge+modelo+dica+controles), nunca na página — pedido explícito:
  "tela cheia deve expandir SOMENTE o visualizador 3D". `Esc` sai
  sozinho (comportamento NATIVO da Fullscreen API, nenhum keydown
  manual foi escrito pra isso); um listener de `fullscreenchange` só
  sincroniza o ÍCONE do botão (expandir↔comprimir) pros casos de saída
  que não passam pelo próprio clique (Esc, F11).

**Limites de zoom** vêm de `minCameraOrbit`/`maxCameraOrbit`, setados
dinamicamente (0.45× a 2.4× do raio inicial resolvido) no `load` — o
próprio `<model-viewer>` recusa ir além, tanto nos botões quanto no
scroll/pinça do usuário, sem precisar clampar nada manualmente em JS.

**Tamanho e enquadramento automáticos** (pedido: "aumentar
consideravelmente o tamanho do móvel... ajustar automaticamente a
câmera de acordo com o tamanho do objeto... não cortar nenhuma parte"):
`bounds="tight"` (enquadra pela geometria REAL do modelo, não uma
esfera genérica) + `camera-orbit="auto auto 80%"` (80% do raio de
auto-enquadramento padrão = objeto visivelmente maior) — os dois
continuam CALCULADOS pelo `<model-viewer>` a partir de cada modelo,
nunca um valor fixo por item.

**Sombra oval + piso virtual** (pedido: "criar uma sombra oval suave...
se tecnicamente adequado, utilizar um plano de chão virtual muito
claro... não adicionar paredes ou ambientes"): recurso NATIVO do
`<model-viewer>` (`shadow-intensity`/`shadow-softness`), sem desenhar
nenhum chão/ambiente à parte — a própria pergunta do usuário ("se
tecnicamente adequado") já apontava pra essa solução em vez de montar
uma cena Three.js paralela só pra isso.

**Selo "Visualização 360°"** (`.catalog-modulo3d-badge`, canto superior
esquerdo) e **dica de uso** ("Arraste para girar • Role para
aproximar", `.catalog-modulo3d-hint`, dentro do visualizador) — ícones
lineares inline (SVG, mesmo padrão já usado nas setas do carrossel
principal — `MODULO3D_ICONS`, sem instalar biblioteca de ícones nova,
já que o projeto não carrega Lucide/FontAwesome/etc. neste módulo). A
dica esmaece (`opacity:.35`, não desaparece de vez) depois da 1ª
interação REAL de câmera — detectada pelo evento `camera-change` do
`<model-viewer>` filtrando `detail.source==="user-interaction"` (esse
`source` já distingue interação humana de mudança programática — os
próprios botões de zoom/reset disparam o mesmo evento, mas com outro
`source`, então não reacendem a dica à toa).

**Carregamento discreto**: reaproveita o MESMO anel de progresso
(`conic-gradient` + `--pct`) já usado nas notificações "em andamento"
do catálogo, em vez de inventar um spinner novo — texto fixo "Carregando
visualização 3D" (pedido literal), sem "skeleton exagerado". Erro tem
mensagem clara + botão "Tentar novamente" de verdade (chama
`renderModulo3dModel()` de novo, não só cosmético).

### Limpeza de memória/WebGL ao sair da tela

Pedido explícito: "evitar vazamentos de memória... remover listeners,
animações e recursos gráficos quando a tela for fechada." Como
`#catalogGrid` só fica ESCONDIDO (nunca destruído) ao abrir um overlay
por cima (Estúdio/Biblioteca) — diferente de navegar pra outra `view`,
que reescreve o `innerHTML` e mataria o `<model-viewer>` sozinho — sem
tratamento explícito o visualizador do mini-menu continuaria
RENDERIZANDO (2º contexto WebGL ativo) atrás do Painel 3D aberto.
`modulo3dTeardownViewer()` (chamada em `setActiveOverlay(mode)` quando
`mode` é truthy, E no topo de `renderCurrentView()` pra cobrir a volta
pro Portal/Home/categoria) remove o `<model-viewer>` do DOM
explicitamente e desliga o listener de `fullscreenchange` (o único
listener em `document`/`window` que este recurso adiciona — sem isso
vazaria entre navegações). Verificado no teste: abrir o Estúdio a
partir do mini-menu confirma `document.querySelectorAll('model-viewer')
.length===0` (não sobra nenhum vivo rodando escondido).

### "Explore os recursos" — Estúdio em destaque + 2 recursos futuros inertes

Título editorial com linhas finas dos 2 lados
(`.catalog-modulo3d-explore-title`, `<h2>` entre 2 `<span>` de 1px).
`MODULO3D_CARDS` é a fonte única dos 3 cards, com `available:true/false`
decidindo tanto o visual quanto o roteamento (`activateModulo3dCard()`
nunca navega pra um card `!available`).

**Estúdio de Ambientes** (`.catalog-modulo3d-feature-primary`): card
horizontal compacto — ícone (sofá, `MODULO3D_ICONS.sofa`) + nome/
descrição + botão, uma linha só, **mesma altura dos 2 cards "Em breve"
ao lado**. **A versão original tinha uma IMAGEM real** (`../../../
slide1.jpg`, único material de "ambiente decorado" já existente no
repositório — `slide1/2/3.jpg`, já usadas no carrossel de fundo de
`login.html`) **à esquerda do card, ~40% da largura — removida na
correção "cards muito altos" abaixo**, ver essa seção pro motivo e a
citação exata do usuário. Botão "Acessar estúdio" em cinza escuro
(`#5a5a55`, a MESMA cor do cabeçalho — pedido explícito: "não utilizar
dourado sólido como fundo do botão") — não mudou com a remoção da foto.

**Realidade aumentada / Planejador de eventos**
(`.catalog-modulo3d-feature-soon`): pedido explícito, com uma correção de
rumo importante — a versão ANTERIOR (sessão passada) levava a uma tela
"Em breve" genérica ao clicar; a nova spec pede exatamente o oposto,
"sem comportamento de clique", cards "intencionalmente indisponíveis".
Trocado: **nenhum elemento clicável existe dentro desses cards** (nem
`<button>`, nem `<a>` — um `<article aria-disabled="true">` puro,
`cursor:not-allowed` via CSS), nome PRÓPRIO de cada recurso (não o texto
genérico "Em breve" como título — isso virou só o badge pequeno no
rodapé do card), ícone linear cinza, fundo cinza bem claro. A tela "Em
breve"/`MODULO3D_SOON_VIEW` que existia antes foi REMOVIDA por completo
(rota morta, nada mais navega pra lá) — não confundir com "remover
recurso atual" (proibido pela spec): era um comportamento desta MESMA
sessão, substituído por uma versão posterior e mais detalhada do próprio
usuário, não um recurso estabelecido sendo descartado.

### Achados corrigidos direto do print, depois da 1ª versão publicada nesta tarefa

Duas correções pontuais, as DUAS pegas pelo próprio usuário olhando a
tela renderizada (não hipóteses minhas):

1. **"ele precisa pegar a largura toda da tela"**: a 1ª versão limitava
   `.catalog-modulo3d-menu` a `max-width:1180px` (interpretação inicial
   de "container central com largura máxima consistente" da spec) — em
   monitores largos sobrava muito espaço vazio dos 2 lados. Corrigido
   removendo o `max-width` por completo, mesmo padrão de
   `.catalog-detail-panel` (a página de item, que também é tela cheia,
   sem cap nenhum) — só o `padding` lateral em `clamp()` evita conteúdo
   colado na borda em telas muito largas.
2. **"não pode ter barra vertical, ele tem que se adaptar a tela"**: a
   1ª versão usava `min-height:calc(100dvh - header)`, deixando o
   conteúdo (visualizador + seção "Explore os recursos") livre pra
   ULTRAPASSAR a altura da tela e criar rolagem vertical. Corrigido pra
   `height` FIXO (não `min-height`) + `display:flex;flex-direction:
   column`, com `.catalog-modulo3d-viewer{flex:1 1 auto}` (cede/ganha
   altura pra sempre caber) e `.catalog-modulo3d-explore{flex:none}`
   (fica do tamanho que precisa, nunca cresce) — testado sem nenhuma
   barra de rolagem em 4 resoluções desktop comuns (1366×768, 1440×900,
   1536×864, 1920×1080). **Restrito a telas ≥1200px** — no tablet/
   celular (onde o Estúdio vira 1 linha inteira e os 2 recursos futuros
   descem pra baixo dela, ou tudo empilha verticalmente) forçar caber
   numa tela só deixaria texto/foto pequenos demais; esses breakpoints
   voltam a `min-height` + rolagem normal da página, consistente com o
   pedido explícito de "empilhar os recursos verticalmente" no celular.
3. **Terceira rodada, com um print novo da tela já publicada nesta
   tarefa**: *"ainda esta com barra vertical sendo que pedi pra nao ter,
   outra coisa, o card dos recursos esta muito alto, ele precisa ser bem
   mais compacto, a atracao nessa tela e o 3d no centro, acho que o que
   esta fazendo isso e a foto, ignora ela, depois vou colocar um icone em
   cada um dos recursos e nao uma foto"*. A correção 2 (`height` fixo +
   flex) já estava certa em teoria, mas o card "Estúdio de Ambientes"
   ainda carregava a imagem `slide1.jpg` (~168px de altura mínima,
   puxada pelo `object-fit`/proporção da foto) — alto o bastante pra
   empurrar `.catalog-modulo3d-explore` além do espaço que
   `flex:none` reservava, estourando a altura fixa de
   `.catalog-modulo3d-menu` e acionando o `overflow-y:auto` dela como
   rede de segurança — que o usuário via como "ainda tem barra
   vertical". **Corrigido removendo a foto do card por completo**
   (usuário confirmou que vai trocar por ícones depois — "ignora ela"):
   `modulo3dCardMarkup()` não desenha mais `<img src="slide1.jpg">`
   nenhuma; o card "Estúdio de Ambientes" virou o MESMO formato compacto
   ícone+texto (sofá, `MODULO3D_ICONS.sofa`, cor `var(--accent)`) +
   botão dos outros 2 cards "Em breve" — os 3 ficam com a mesma altura
   agora (~66–72px, contra os 168px+ de antes). CSS reescrito junto
   (`.catalog-modulo3d-feature-primary`/`-soon` com o mesmo `padding:14px
   18px`, mesmos tamanhos de fonte reduzidos, sem `min-height` nenhum) —
   as regras de `.catalog-modulo3d-feature-media`/`img` (que dimensionavam
   a foto a `flex:0 0 42%`) foram DELETADAS, não só desativadas.
   **Verificado de forma mais rigorosa que a correção 2** (que já tinha
   "passado" mesmo com o bug ainda presente, porque o teste automatizado
   não usa a foto real de 168px): script Playwright ad-hoc medindo
   `document.documentElement.scrollHeight` vs `clientHeight` em 5
   resoluções (1366×768, 1440×900, 1536×864, 1920×1080, 1280×720) com o
   card já compacto — `hasVerticalScroll:false` nas 5, e a altura de
   `.catalog-modulo3d-feature-primary`/`-soon` medida em ~66–72px (contra
   os 168px+ do card com foto). Screenshot confirmou visualmente: 3D
   centralizado ocupando a maior parte da tela, os 3 cards no rodapé numa
   única faixa fina — "a atração nessa tela é o 3D no centro" atendido.

### Acessibilidade

`aria-label` em cada botão da barra de controles + `role="group"` no
conjunto; `title` nativo do navegador cobre o tooltip (sem JS extra);
`:focus-visible` com contorno visível (mesmo padrão `outline:1px solid
var(--accent)` já usado no resto do catálogo); `Esc` sai da tela cheia
(nativo); `auto-rotate` desligado quando `prefers-reduced-motion:
reduce` está ativo (`isEconomyDevice3D()`, reaproveitada tal qual do
código removido antes — ver histórico do git, consultado antes de
reescrever pra não perder tratamento já testado); transições de
CSS (dica, botão) desligadas no mesmo caso. Cards "Em breve" com
`aria-disabled="true"`, nunca focáveis (sem elemento interativo dentro).

Teste de regressão reescrito por completo:
`tests/catalogo-modulo3d-menu-browser.cjs` (3 cenários) — visualizador
ocupa a largura útil da tela (não um container estreito); selo 360°+
dica presentes; controles de câmera alteram `getCameraOrbit().radius`
de verdade (aproximar reduz, afastar aumenta, redefinir volta ao valor
inicial exato); tela cheia chama a Fullscreen API de verdade (espionada
via `Element.prototype.requestFullscreen`/`document.exitFullscreen`
sobrescritos no teste, em vez de depender do suporte real do Chrome
headless a fullscreen — historicamente frágil em automação); dica
esmaece após interação real de câmera; Estúdio abre a rota de sempre e
DESLIGA o `<model-viewer>` do mini-menu ao abrir (prova da limpeza de
WebGL); os 2 recursos futuros têm nome próprio, `aria-disabled`, e
ZERO elemento clicável; modelo em destaque com fallback (1º item com
`.glb`) e estado vazio (nenhum modelo no sistema); botão de marcar
modelo mutuamente exclusivo; decorador nunca vê esse botão; sem overflow
horizontal em 390/768/1024px. **Achado corrigindo o próprio teste**: o
fixture original (GLB só com cabeçalho, sem nenhuma malha) disparava
`error` em vez de `load` assim que `bounds="tight"` foi adicionado (não
dá pra calcular enquadramento "tight" sem geometria nenhuma) — trocado
por um GLB mínimo mas com um TRIÂNGULO de verdade (posições + índices
binários montados à mão no teste), necessário pros testes de zoom/reset
(`getCameraOrbit()` só faz sentido depois de um `load` bem-sucedido).
Suíte completa de regressão do catálogo (14 arquivos) + `tests/
creditos-browser.cjs` rodadas de novo, todas passando. **Cache-busting**
de `catalogo.css`/`catalogo.mjs` bumpado em `catalogo.html`
(`?v=20260919-modulo3dcompact`) na 3ª rodada de correção (remoção da
foto/cards compactos) — o teste em si não precisou de nenhum ajuste
(não verifica a foto nem o ícone novo, só texto/estrutura dos cards, que
não mudou), mas a suíte inteira foi rodada de novo mesmo assim por ter
mexido em CSS/JS compartilhado.

### Limitação real, não verificada

**Safari/WebKit não foi testado** — o ambiente Playwright deste projeto
só tem o Chromium (`channel:"msedge"`) instalado; o binário WebKit não
está presente (`npx playwright install` baixaria ~100MB+, não executado
sem pedir primeiro). Edge e Chrome, sendo os dois Chromium, têm
comportamento praticamente idêntico entre si — a lacuna real de
cobertura é só Safari/WebKit especificamente.

## Módulo Lounge (tela dedicada pra montar composições de sofá + poltronas)

**Removido numa sessão bem mais tarde** — ver "Mini-menu 'Módulo 3D' e
Módulo Lounge (Composições) — removidos" mais abaixo (pedido explícito do
usuário: "dentro do modulo de 3d deixe apenas o 3d livre... pode remover
os outros"). `catalogo-lounge.mjs`/`.css` não existem mais; a única parte
desta seção que sobreviveu foi `studioFormats`/`studioFormatPlacements`
(a feature de "formatos reutilizáveis"), que migrou pra
`catalogo-formatos.mjs` — o 3D Livre dependia dessas duas funções sem
isso ter sido percebido até a tentativa de apagar este arquivo. Histórico
completo mantido abaixo pelo raciocínio de arquitetura (mesmo raciocínio
de outras seções "superadas" deste arquivo).

Pedido explícito do usuário: *"agora eu quero criar um modulo exclusivo
pra montagens de lounges, formatoações com sofa, poltrona, imagine que o
modulo estudio de ambiente que temos hoje e algo mais profissioal pra
pessoa que sabe utilizar, e o modulo lounge é um mais simples pro
decorador testar os formatos"* — uma tela nova, separada do Estúdio de
Ambientes (que continua existindo, sem nenhuma mudança), especificamente
pra montar/testar composições de lounge. Layout descrito: visualizador 3D
"na parte de cima e centralizado" (parecido com o do mini-menu Módulo
3D), e uma coluna à esquerda com "formatos" (composições pré-definidas,
"igual tem uma lá dentro de lounge compacto que é padrão" — referência ao
preset já existente no Estúdio) em cima, e "itens" embaixo, perto de uma
"barra horizontal" (divisória).

**3 perguntas de esclarecimento antes de implementar** (via
AskUserQuestion, depois de investigar o que já existia — ver abaixo):
(1) onde o módulo entra na navegação — usuário escolheu **"vira o card
'Planejador de eventos'"** (um dos 2 "Em breve" do mini-menu Módulo 3D
vira este módulo, disponível); (2) o preset "Lounge compacto" que já
existe dentro do Estúdio de Ambientes deve sair de lá? — **"continua nos
dois lugares"**, o Estúdio não foi tocado; (3) só "Lounge compacto" entra
como formato, ou "Mesa de convidados" (o outro preset do Estúdio,
mesa+cadeiras) também? — resposta do usuário: **"será um lugar específico
pra montagens de lounges, então só terá lounge mesmo, e não precisa ter o
botão lounge compacto... porque o próprio card já é essa função"** — só
lounge entra, e não precisa reproduzir o padrão "botão que abre um
diálogo" do Estúdio; o formato já é a própria tela.

### Investigação feita antes de escrever qualquer código

Antes de decidir "construir do zero" vs. "reaproveitar", uma investigação
dedicada (Explore) mapeou o motor de posicionamento automático que já
existe dentro do Estúdio de Ambientes (`catalogo-studio3d.mjs`): clicar
em "Lounge compacto" (botão "Montagem automática" na barra lateral) abre
`#studioPresetDialog`, onde a pessoa escolhe sofá/poltrona/mesas/aparador
(`PRESETS.lounge`, papéis com regex — `/sof[aá]/i`, `/poltrona/i` etc.) e
um diagrama 2D arrastável (`loungeDiagram()`/`bindDiagramDragging()`)
decide as posições relativas; ao confirmar, `buildPreset()` traduz isso
em objetos 3D de verdade via `addItem()` (clona o GLB, escala pelas
dimensões comerciais do item, posiciona na cena).

**Achado que decidiu a arquitetura**: `catalogo-studio3d.mjs` (2572
linhas) só exporta `initCatalogStudio3D` — `createScene`/`addItem`/
`loadModelTemplate`/`PRESETS`/`buildPreset` são tudo função top-level
privada, fechando sobre um ÚNICO objeto `studio` module-level (sem
parâmetro de host/instância) e ids de DOM fixos (`#studioCanvasHost`,
`#catalogStudio`). Não dá pra rodar um 2º visualizador independente
reaproveitando essas funções sem ou (a) editar o arquivo pra
parametrizar tudo isso — risco desnecessário num arquivo grande e já
funcionando, pra uma tela que o usuário decidiu que **não** precisa
compartilhar motor com o Estúdio — ou (b) os dois visualizadores
brigarem pelo mesmo `studio`/canvas. **Decisão**: o Módulo Lounge monta a
PRÓPRIA cena Three.js, pequena e independente — reaproveita só a IDEIA
(papéis sofá/poltrona/mesa de centro/mesa lateral/aparador, os mesmos
regex) e o cálculo de escala por dimensões comerciais (mesmo raciocínio
de `addItem()`, copiado — não importado, já que nada daquele arquivo é
exportável sem editá-lo). Também achado na investigação: o Estúdio de
Ambientes **nunca desliga** o próprio render loop (só pausa `self`-
-throttling enquanto `#catalogStudio` está escondido) — decisão
deliberada de NÃO copiar esse padrão pro módulo novo (ver seção de
limpeza abaixo).

### Arquitetura

**`catalogo-lounge.mjs`/`.css` novos**, mesmo padrão self-contido de
`catalogo-biblioteca.mjs` (`initCatalogLounge({items})` uma vez no
`init()` do catálogo, `openCatalogLounge()`/`teardownCatalogLounge()`
exportados pro ciclo de vida do overlay) — sem importar nada de
`catalogo-studio3d.mjs` nem o contrário. Não precisa de `supabase`/
`empresaId`: diferente de Biblioteca/Portal, este módulo não GRAVA nada
no banco — é uma ferramenta de teste/visualização (usuário não pediu pra
salvar composições), então `initCatalogLounge` só recebe a lista de
itens já carregada (`state.items`).

**`MODULO3D_CARDS`**: a entrada `"planejador-eventos"` virou
`{key:"lounge", label:"Módulo Lounge", description:"Monte composições de
lounge com sofás e poltronas", action:"lounge", available:true}` —
`activateModulo3dCard()` ganhou o branch `action==="lounge"` chamando
`openLoungeOverlay()` (mesmo padrão de `openStudioOverlay()`/
`openBibliotecaOverlay()`). `modulo3dCardMarkup()` passou a tratar
QUALQUER card `available` com o mesmo formato "primário" (ícone+texto+
botão) — antes só "estudio" tinha esse tratamento hardcoded por chave;
agora Estúdio de Ambientes usa o ícone `layout` (mais genérico — compõe
qualquer ambiente) e Módulo Lounge usa o ícone `sofa` (mais específico).
Só "Realidade aumentada" ficou como "Em breve". Proporções da fileira de
cards ajustadas (`.catalog-modulo3d-feature-primary` 38%→34%,
`-soon` 26%→30% em `catalogo.css`) pra 2 cards disponíveis + 1 futuro, e
o breakpoint de tablet trocou de "1 primário cheio + 2 soon lado a lado"
pra "2 primários lado a lado + 1 soon cheio" (`catalogo.css`, dentro de
`@media(max-width:1199px)`).

**`setActiveOverlay(mode)`** ganhou `"lounge"` como 4º valor possível
(`$("catalogLounge")` alternado igual Estúdio/Biblioteca) — e, diferente
dos outros dois, uma chamada explícita a `teardownCatalogLounge()`
sempre que `state.overlay` estava em `"lounge"` e o novo `mode` não é
(troca de overlay OU volta pro grid) — necessário porque este módulo
**não** segue o padrão "pausa escondido" do Estúdio (ver Achado acima);
sem isso o contexto WebGL/render loop ficaria rodando pra sempre atrás de
qualquer outra tela. Trilha/rótulo do cabeçalho ganharam o mesmo 3º nível
que o Painel 3D já tinha: `Catálogo / Módulo 3D / Módulo Lounge`.

### Formatos + itens (a coluna esquerda)

**`FORMATS`** (`catalogo-lounge.mjs`) é a fonte única — hoje só
`"lounge-compacto"`, com os mesmos 5 papéis do preset original (sofá e
poltrona obrigatórios; mesa de centro, mesa lateral/canto e aparador
opcionais) e uma função `layout(sofaSize)` que devolve posições/rotações
RELATIVAS fixas (poltronas nas pontas do sofá, viradas pro centro; mesa
de centro na frente; mesas laterais nas laterais; aparador atrás) —
escaladas pela largura/profundidade REAL do sofá escolhido. **Sem
diagrama arrastável** (o que o Estúdio tem) — pedido explícito "mais
simples pro decorador testar os formatos": a pessoa escolhe o formato e
os itens, a composição já nasce montada, sem precisar ajustar posição
manualmente. Adicionar um novo formato no futuro = um novo objeto neste
array.

**Seleção automática pros papéis obrigatórios**: ao abrir o módulo (ou
trocar de formato), sofá e poltrona já vêm com o 1º item compatível
pré-selecionado (`ensureDefaultSelection()`) — a composição aparece
pronta sem exigir nenhuma escolha manual primeiro, papéis opcionais
começam vazios ("Nenhuma"). Trocar qualquer item (clique num card de
foto+nome na coluna "Itens") remonta só aquele papel na cena (não recria
a cena inteira) e NÃO reseta a câmera — só trocar de FORMATO reseta a
câmera pra vista inicial (evita a câmera "pulando" toda vez que a pessoa
testa um sofá diferente dentro do mesmo formato).

### Visualizador — mesma linguagem visual do mini-menu Módulo 3D

Badge "Visualização 360°", dica "Arraste para girar • Role para
aproximar" (esmaece na 1ª interação real — aqui via `pointerdown`/`wheel`
direto no canvas, já que não existe o filtro `source==="user-interaction"`
do `<model-viewer>` numa cena raw Three.js), barra de controles vertical
(aproximar/afastar/redefinir/tela cheia) — ícones e CSS (badge/hint/
controles/anel de carregamento) duplicados de `MODULO3D_ICONS`/
`.catalog-modulo3d-*` de propósito: os dois arquivos não podem se
importar um ao outro (`catalogo.mjs` já importa DESTE módulo; um import
de volta criaria ciclo), e são poucas linhas de SVG/CSS, mais barato
duplicar que criar um 3º módulo só pra ícones compartilhados.

**Câmera aproximar/afastar/redefinir são reais** (mesmo padrão de rigor
do mini-menu Módulo 3D), só que implementados direto em cima do
`OrbitControls` (sem uma API pronta tipo `getCameraOrbit()` do
`<model-viewer>`): aproximar/afastar escalam a distância entre câmera e
alvo (`orbit.target`) por um fator fixo, clampada por `orbit.minDistance/
maxDistance`; redefinir restaura a posição/alvo iniciais exatos
(guardados na criação da cena). **`host.dataset.cameraDistance`** é um
atributo de depuração (não lido por nenhum CSS/JS da própria tela) criado
só pra dar um jeito de VERIFICAR de fora que os controles mexem na
câmera de verdade — mesmo espírito de `dataset.mesmoToast` já usado no
teste das notificações do catálogo; sem uma API pública equivalente ao
`getCameraOrbit()`, não dava pra provar isso de outro jeito sem esse
atributo.

### Limpeza de memória/WebGL — ciclo de vida DIFERENTE do Estúdio, de propósito

Pedido explícito (mesma disciplina já aplicada ao redesenho do mini-menu
Módulo 3D): "evitar vazamentos de memória... remover listeners, animações
e recursos gráficos quando a tela for fechada." Como o Estúdio de
Ambientes NUNCA desliga o próprio render loop (achado na investigação —
só pausa via `self`-throttling enquanto escondido), copiar esse padrão
pro módulo novo teria deixado uma 2ª cena WebGL rodando pra sempre depois
da primeira visita. `teardownCatalogLounge()` faz o oposto: cancela o
`requestAnimationFrame`, desconecta o `ResizeObserver`, descarta
`OrbitControls`, percorre a cena liberando geometria/material/textura de
cada peça carregada, chama `renderer.dispose()` e remove o `<canvas>` do
DOM — nada fica "pausado escondido". Reabrir o módulo reconstrói a cena
inteira do zero (`ensureScene()` recria tudo, `lounge` volta a `null`
depois do teardown) — mais simples e mais seguro que tentar preservar
estado entre visitas pra um recurso que nem precisa disso (nenhuma
composição é salva, ver decisão de escopo abaixo).

### Fora do escopo desta primeira versão (não pedido)

Não implementado por não ter sido pedido, documentado aqui caso surja
depois: (1) salvar/persistir uma composição montada (o usuário descreveu
"testar os formatos", não "salvar" — se pedirem, precisa de tabela nova,
mesmo padrão de `studio_projetos` já usado pelo Estúdio); (2) diagrama
arrastável pra ajustar manualmente a posição de cada peça dentro do
formato (decisão consciente, não uma limitação técnica — "mais simples"
foi interpretado como formato fixo, sem esse ajuste); (3) mais de um
formato (só "Lounge compacto" existe — a estrutura de dados (`FORMATS`)
já comporta adicionar mais sem mudar a UI ao redor).

### Piso + fundo por foto (pedido logo depois, com a 1ª versão já renderizada)

Pedido explícito do usuário, olhando a tela real (print do sofá+poltronas
já montados): *"quero que a pessoa possa escolher o piso, o fundo ela
também pode escolher através de foto"*. Dois controles novos, na mesma
coluna esquerda, numa 3ª seção fixa "Ambiente" abaixo de Itens (sempre
visível, não rola junto com a lista de itens).

**Piso** (`FLOORS`, 5 opções: Piso neutro/Madeira/Grama/Areia/Piso
escuro): cada um é uma textura procedural desenhada na hora num
`<canvas>` 2D (mesma TÉCNICA do seletor de piso do Estúdio de Ambientes
— `createFloorFinishCanvas`/`floorFinish` em `catalogo-studio3d.mjs` —
copiada de forma bem mais simples, sem a elaboração completa daquele
arquivo: grão sutil + linhas de tábua só pra "Madeira", nada de sombra de
nós de madeira/veios como lá). O piso, que antes era só um
`ShadowMaterial` invisível (só a sombra aparecia, pensado pra não
"adicionar ambiente" — mesma filosofia minimalista do visualizador do
Módulo 3D), virou um `MeshStandardMaterial` de verdade com a textura
escolhida, sempre visível. Tamanho do piso reduzido (24×24m → 9×9m) pra
combinar com a parede de fundo descrita abaixo (largura igual, formando
um "set" coerente — chão + parede — em vez de um piso "infinito" sem
limite visível).

**Fundo por foto — corrigido depois de uma 1ª tentativa errada**: a
PRIMEIRA versão usava só `host.style.backgroundImage` (CSS atrás do
canvas transparente), pensando em manter "mais simples" — o usuário
corrigiu na hora, olhando o resultado real: *"você não entendeu, a foto
de fundo ela deve ser igual a parede que nós temos no outro módulo 3d"*.
Ou seja: precisa ser uma peça de verdade DENTRO da cena 3D (visível de
qualquer ângulo razoável de câmera, como um cenário de estúdio
fotográfico real), não um truque de CSS que só aparecia nos vãos sem
geometria (na prática, quase invisível, já que o piso cobre a maior
parte do quadro na maioria dos ângulos). **Reescrito pra usar a MESMA
técnica do Estúdio de Ambientes** (`studio.walls`/`configureWallTexture`
em `catalogo-studio3d.mjs`): um plano vertical (`PlaneGeometry`,
9×4.6m) criado sob demanda na primeira foto escolhida, posicionado atrás
da composição (`z=-4.4`, mesmo lado "de fundo" que o Estúdio usa),
textura desenhada num `<canvas>` 2D em modo "cover" (preenche a parede
inteira sem distorcer, cortando o excesso) a partir da foto escolhida, e
`MeshBasicMaterial` (sem luz — a foto aparece como está, não "escurecida"
pela iluminação da cena, igual no Estúdio). Upload local (`URL.
createObjectURL`, nunca sobe pro Storage — pedido foi só "escolher uma
foto", sem indicação de precisar persistir/compartilhar). "Remover"
apenas ESCONDE a parede (`mesh.visible=false`) em vez de destruí-la —
trocar de foto de novo reaproveita a mesma malha/textura, só repinta o
canvas.

**Reset garantido ao trocar/fechar sessão**: como o módulo inteiro é
recriado do zero a cada abertura (`teardownCatalogLounge()` sempre
desliga tudo, ver seção acima), piso e foto de fundo voltam ao padrão
("Piso neutro", sem foto) toda vez que a pessoa reabre — mesmo raciocínio
de "ferramenta de teste, não precisa lembrar estado entre sessões" já
usado pro formato/seleção de itens. **Achado ao implementar**: materiais
de piso trocados durante uma sessão (ex.: testou "Madeira" e "Grama")
ficavam em cache (`lounge.floorMaterials`, pra não recriar a textura toda
vez que a pessoa volta pra uma opção já vista) mesmo depois de deixarem
de estar aplicados no chão — `disposeSceneObjects()` só libera o que
ainda está NA CENA no momento do teardown, então os materiais/texturas
não-aplicados no momento ficariam vazando sem uso; corrigido percorrendo
`lounge.floorMaterials` inteiro à parte no teardown, além da cena.

**Achado ajustando o teste pra parede**: fixture de imagem precisou virar
um PNG 1×1 de verdade (`PNG_1X1`, mesma constante já usada em
`tests/catalogo-editor-fotos-browser.cjs`) — a versão CSS antiga aceitava
qualquer buffer (só vira `background-image`, sem precisar decodificar);
a versão em parede usa `new Image(); image.onload=...`, que exige o
navegador decodificar a imagem de verdade — um buffer inválido nunca
dispara `onload` (só `onerror`), travaria o teste esperando por uma
parede que nunca seria criada. Verificação de fora também mudou: sem
`getAttribute("style")` pra ler (a parede não é CSS), o mesmo padrão de
atributo de depuração já usado pra câmera/piso ganhou um 3º,
`host.dataset.backgroundWall` (`"none"`/`"visible"`/`"hidden"`).

Teste de regressão: `tests/catalogo-lounge-browser.cjs` ganhou 5 opções
de piso conferidas (padrão "neutral" ativo, trocar aplica de verdade —
via `host.dataset.floorKey`, mesmo espírito de `dataset.cameraDistance`
já usado pros controles de câmera), upload de foto de fundo criando a
parede de verdade na cena (`dataset.backgroundWall==="visible"`,
confirmando também que continua só 1 `<canvas>` — a parede é malha 3D
dentro da MESMA cena, não um elemento novo), botão "Remover" escondendo
a parede sem recriar (`dataset.backgroundWall==="hidden"`), e
confirmação de que reabrir o módulo volta piso E parede pro padrão
(não herdam "Madeira"/a foto de uma visita anterior).

### Vão vazio entre a composição e a parede — corrigido

Pedido explícito do usuário, com print real (sofá+poltrona renderizados
de verdade, câmera baixa) mostrando um trecho grande de piso vazio entre
os móveis e a parede lá no fundo: *"esse espaço do 3d até o fundo não
pode ter, o primeiro 3D tem que ficar pertinho da parede"*. Causa: a
parede nascia numa posição FIXA (`z=-4.4`, a borda do piso 9×9), sem
nenhuma relação com onde a composição realmente termina — como a
composição do "Lounge compacto" fica centrada perto de `z=0`, sobrava
~4m de piso vazio entre ela e a parede.

**Corrigido calculando a posição da parede a partir da caixa
delimitadora REAL da composição** (`positionBackgroundWall()`,
`THREE.Box3().expandByObject()` sobre todas as peças já colocadas em
`lounge.pieces`) — encosta a parede logo atrás da peça mais ao fundo
(`box.min.z`), com uma margem pequena e fixa (`BACKGROUND_WALL_MARGIN =
0.3`m, nunca colada, mas "pertinho"). Usa a geometria DE VERDADE (já
escalada pelas dimensões comerciais do item escolhido, já rotacionada
pelo `layout()` do formato) em vez de tentar adivinhar a partir das
posições nominais do `layout()` — funciona pra qualquer combinação de
sofá/poltrona/formato sem precisar de matemática manual por peça.
Recalculada em dois pontos: ao criar a parede pela 1ª vez
(`applyBackgroundPhoto`) e no FIM de `applySelection()` (toda troca de
item ou formato) — trocar de sofá por um mais fundo, por exemplo, empurra
a parede automaticamente, ela nunca fica "presa" numa distância antiga.

Teste de regressão: `tests/catalogo-lounge-browser.cjs` ganhou
`host.dataset.backgroundWallZ` (mesmo espírito de `dataset.
cameraDistance`/`dataset.floorKey`) confirmando que a parede fica numa
faixa "perto" (entre -2 e -0.2, bem longe do antigo -4.4 fixo) depois de
aplicada, não só que "existe".

### Ajustar a foto de fundo ARRASTANDO, em vez de botões

Pedido explícito do usuário: *"agora quero que a pessoa possa ajustar a
imagem de fundo, se puder ser arrastar seria ótimo ao invés de
botões"*. O padrão mais próximo já usado no projeto pra isso é o do
Estúdio de Ambientes (`adjustSelectedWall(action)`) — botões de seta
(`left`/`right`/`up`/`down`) + zoom-in/out, sem arrastar — o usuário
pediu explicitamente o oposto disso aqui.

**Problema técnico a resolver primeiro**: arrastar no visualizador já
tem um significado (girar a câmera, via `OrbitControls`) — não dá pra
simplesmente "arrastar move a foto" sem entrar em conflito com esse
gesto já existente. Resolvido com um **modo de ajuste explícito**
(botão novo "Ajustar imagem (arrastar)", ao lado de "Trocar foto de
fundo"/"Remover foto de fundo", só aparece com uma foto já aplicada):
enquanto ativo, `lounge.orbit.enabled = false` — a MESMA flag que o
`OrbitControls` já expõe pra isso, sem precisar remover/recriar os
listeners internos dele — e um conjunto de listeners próprios
(`wallAdjustPointerDown/Move/Up`, `wallAdjustWheel`) passa a interpretar
o MESMO gesto (arrastar/rolar no canvas) como mover/dar zoom na foto da
parede em vez de orbitar a câmera. Sair do modo ("Concluir ajuste")
remove esses listeners e reabilita `orbit.enabled`, devolvendo o
comportamento normal.

**Reaproveita a mesma representação de posição/zoom do Estúdio**
(`wall.x`/`wall.y`, 0-100% cada, `wall.zoom`) — `paintBackgroundWall()`
(que antes recebia a imagem como parâmetro solto) passou a ler esses 3
campos do próprio objeto `wall` e redesenhar o `<canvas>` da textura do
zero a cada ajuste (mesma técnica de "rebake" já usada em
`configureWallTexture()` no Estúdio, não manipulação de `texture.offset/
repeat`). Sensibilidade do arrasto é RELATIVA ao tamanho do canvas
(`dx/rect.width*100`), não um valor fixo em pixels — sente proporcional
em qualquer tamanho de tela/janela.

**Dica de uso muda de texto durante o ajuste**: reaproveita o MESMO
elemento `.catalog-lounge-hint` (não cria um 2º) — troca temporariamente
pra "Arraste para posicionar a foto de fundo" e volta ao texto original
("Arraste para girar • Role para aproximar") ao sair do modo; cursor do
canvas também muda (`grab`/`grabbing` via CSS, `.is-adjusting-wall`/
`.is-dragging-wall` no host).

**Sai do modo automaticamente** ao trocar de formato, trocar de item
selecionado, remover a foto de fundo, ou fechar o módulo
(`teardownCatalogLounge()`) — evita ficar com `orbit.enabled=false`
"preso" se a pessoa navegar pra outro lugar sem clicar em "Concluir
ajuste" primeiro.

### Zoom da foto de fundo virou botão +/-, não mais a roda do mouse

Correção pedida na mesma mensagem que trouxe o botão de renderizar (ver
seção seguinte): *"o zoom não pode ser com o mouse, tem que ser com
botão + e - mesmo"*. A 1ª versão do modo de ajuste (seção acima) dava
zoom na foto rolando o mouse (`wallAdjustWheel`, clampado 1×-3×) — essa
função e o listener de `wheel` foram REMOVIDOS por completo do modo de
ajuste. No lugar: dois botões redondos "−"/"+" (`.catalog-lounge-bg-
zoom`, ícone de texto simples) chamando `zoomBackgroundWall(direction)`
— mesmo `wall.zoom` de antes, mesmo clamp 1×-3×, só que incrementado em
passos fixos (0.15) por clique em vez de contínuo por rolagem.

**Zoom por botão NÃO precisa do modo de ajuste ativo** — diferente de
arrastar (que só faz sentido dentro do modo, pra não brigar com o gesto
de girar a câmera), um CLIQUE não é um gesto contínuo, não conflita com
nada — os botões +/- ficam sempre visíveis e funcionais assim que existe
uma foto de fundo, independente de "Ajustar imagem" estar ativo ou não.
Isso simplificou o modo de ajuste: ele agora só liga/desliga o
comportamento de ARRASTAR (posição), nunca precisou saber de zoom.

Teste de regressão: `tests/catalogo-lounge-browser.cjs` ganhou
`host.dataset.wallOffset` (`"x,y,zoom"`, mesmo espírito de
`dataset.cameraDistance`/`floorKey`/`backgroundWallZ`) e prova, nessa
ordem: (1) arrastar no canvas ANTES de entrar no modo de ajuste NÃO move
a foto (`wallOffset` continua `"50.0,50.0,1.00"` — o gesto ainda gira a
câmera); (2) ativar o modo muda o botão/hint/cursor; (3) arrastar DENTRO
do modo muda `x`/`y` de verdade; (4) rolar o mouse NÃO altera mais o
zoom (nem dentro nem fora do modo — prova de que a correção pegou os
dois casos); (5) os botões +/- alteram o `zoom` de verdade,
inclusive FORA do modo de ajuste; (6) sair do modo restaura o
comportamento antigo de arrastar (gira a câmera de novo). Simulado com
`page.mouse.down/move/up` de verdade (não só disparar um evento
sintético solto), pra provar o fluxo de captura de ponteiro completo.

## Botão "Renderizar com IA" no Módulo Lounge

Pedido explícito do usuário: *"preciso que tenha aqui o botão renderizar
com IA também"* — a mesma capacidade que já existe no Estúdio de
Ambientes (`renderWithAI()`/botão `.studio-render-button` em
`catalogo-studio3d.mjs`), chamando a fotografia arquitetônica gerada por
IA a partir da composição 3D.

**Reaproveita a MESMA Edge Function e o MESMO sistema de créditos**
(`window.CatalogCredits.invoke("studio-ai-engine", {...})`,
`window.CatalogCredits` já carregado globalmente por `catalogo-creditos.js`
— nenhum import novo necessário) — só o CONTEÚDO da cena capturada/
enviada muda (composição de lounge: sofá/poltronas/piso escolhido/parede
de fundo, não a sala inteira do Estúdio com paredes custom). Prompt
próprio, adaptado pro contexto de lounge, mas com a MESMA regra central
de preservação rígida dos móveis (`referencePolicy:
"furniture_strict_architecture_adaptive"`) e o piso/parede tratados como
referência arquitetônica flexível (a IA pode reinterpretar/completar,
nunca mover ou alterar os móveis). **Sem o diálogo de "atmosfera"**
(dia/entardecer/noite, convidados) que o Estúdio tem — pedido foi só "o
botão"; usa os mesmos padrões que o Estúdio usa quando chamado sem
opções (dia, luz suave, sem convidados) — se pedirem os controles de
atmosfera depois, dá pra adicionar sem mudar o resto.

**Captura da cena mais simples que a do Estúdio**: `loungeCleanPreview()`
é uma versão enxuta de `capturePreview()`/`captureCleanPreview()` (só o
`<canvas>` do renderer, centralizado num quadro 1536×1024) — não precisa
esconder helpers antes de capturar (grid, régua, gizmo de seleção) porque
esta cena não tem NENHUM desses elementos desenhados nela (sem
`TransformControls`, sem `GridHelper` — ver arquitetura da cena, seção
"Módulo Lounge" mais acima), nem compor uma imagem de "ambiente" à parte
(o Estúdio tinha isso de um sistema de fundo mais antigo,
`studio.backgroundImage` — este módulo não tem equivalente, a foto de
fundo já É geometria 3D real na cena, capturada de graça junto com o
resto).

**Botão flutuante no canto superior direito do visualizador**
(`.catalog-lounge-render-btn`, mesma cor/posição de destaque do
`.studio-render-button` equivalente — classe própria, nenhuma relação de
CSS entre os dois). Desabilitado + texto "Preparando…"/"Renderizando…"
durante a chamada, reabilitado no fim (sucesso ou erro) — mesmo padrão
do Estúdio. Resultado mostrado no MESMO padrão de "prévia minimalista"
já usado nesta sessão pra resultados de IA (`#loungeResultDialog`, classe
própria `.catalog-lounge-result-dialog` — nenhuma relação com
`#studioResultDialog`/`#catalogFabricResultDialog`, "dois recursos sem
relação nenhuma, dar o mesmo nome de classe só confundiria" — mesmo
raciocínio já registrado neste arquivo): foto grande + rótulo + link
"Baixar imagem", sem nada mais; aberto a partir da notificação de
sucesso ("Ver resultado"), nunca reabre automaticamente.

**Empresa/crédito**: `initCatalogLounge({items, empresaId})` ganhou
`empresaId` (antes só recebia `items`) — precisa disso pro corpo da
chamada à Edge Function (`empresa_id: ctx.empresaId`), mesmo campo que o
Estúdio já envia. Pro fluxo de créditos (`catalogo-creditos.js`), a
lógica de quem paga é TOTALMENTE alheia a este módulo — `invoke()`
decide sozinho, olhando se `options.body.catalog_token` existe
(decorador externo) ou não (equipe interna, pula a confirmação de
créditos e chama a função direto) — não precisou de nenhum código novo
aqui pra isso funcionar corretamente nos dois acessos.

Teste de regressão: `tests/catalogo-lounge-browser.cjs` ganhou um mock de
`window.supabaseClient.functions.invoke` (a peça que faltava — os mocks
anteriores já cobriam `auth`/`from`/`rpc`/`storage`, mas nunca
`functions`, que é por onde `CatalogCredits.invoke` de fato passa) e
confirma, testando como equipe interna (sem `catalogo_token`, pula a
confirmação de créditos): clicar no botão chama `studio-ai-engine` de
verdade (via o mock), a notificação de sucesso com "Ver resultado" abre
`#loungeResultDialog` mostrando a imagem devolvida pela IA, o link de
download aponta pra ela com o nome `lounge-acervo.png`, e o botão volta
ao texto/estado original depois.

## Composições: 3 texturas de piso novas (pedra/lajota, carpete claro, carpete verde)

Pedido do usuário, bem depois da seção "Piso + fundo por foto" acima: *"quero que coloque texturas nos módulos 3D, textura de pedra, aquelas lajota... de grama, de madeira, carpete bege clarinho quase branco, carpete verde escuro também... pensa que é pra um decorador de eventos, não é pra um designer de interiores, são coisas diferentes... coloca de areia também... quero que tenha essas opções assim simples mas que fazem toda diferença"*. Grama, madeira e areia já existiam (ver seção "Piso + fundo por foto") — o pedido de verdade era **pedra/lajota** e os **2 carpetes**; os 5 antigos continuam, agora são 8 no total.

**Só em Composições** (o módulo "pro decorador testar os formatos", não no "3D Livre"/Estúdio de Ambientes — que tem o SEU PRÓPRIO seletor de piso independente, `floorFinish` em `catalogo-studio3d.mjs`, mais elaborado e pensado pra quem já manja de 3D, nunca compartilhou motor com Composições desde que o módulo existe). Não pedido pro 3D Livre também — se fizer falta lá, é um ajuste separado.

**Duas texturas novas em `createFloorCanvas()`** (mesma técnica procedural em `<canvas>` 2D já usada pros pisos antigos — sem depender de nenhuma imagem externa, "simples" no sentido literal do pedido):
- **`tiles` (Pedra)**: a placa 256×256 vira um grid de 4×4 lajotas (64px cada); cada uma ganha um tom levemente clareado/escurecido da cor base (`sombrear()`, ±13 por canal, aleatório) — nenhuma pedra de verdade é uma cor chapada só, mesmo numa textura simples — e por cima entra a linha de rejunte (cinza escuro, 2px, no grid inteiro). O grão fino de sempre (speckle) ainda entra por cima das lajotas, pra não ficar "digital" demais.
- **`fiber` (Carpete, os 2 novos)**: o MESMO grão de sempre, só que bem mais denso e fino (2400 pontos de 1px, em vez de 900 de 1,2px) — dá o efeito "macio"/tecido em vez do grão mais solto do piso liso, sem precisar de nenhuma técnica nova.
- **`rough` por piso** (novo campo, opcional): a pedra brilha um pouco mais que o padrão (`.55`), o carpete é bem mais fosco (`.98`) — os pisos antigos que não declaram `rough` continuam no valor de sempre (`.94`, agora um fallback via `floorDef.rough ?? .94` em `floorMaterial()`).

**A lista final** (`FLOORS` em `catalogo-lounge.mjs`): Piso neutro, Madeira, **Pedra**, Grama, Areia, **Carpete claro** (`#efe6d8`, bege bem próximo do branco — literal ao "quase branco" pedido), **Carpete verde** (`#1f4633`, verde escuro), Piso escuro. Cores escolhidas pra não repetir nenhum tom já usado (o teste confere as 8 amostras com cor computada diferente entre si). Mecanismo de escolher/aplicar (`applyFloor()`, os botões em `#loungeFloorRow`) não mudou — só a lista cresceu.

**Achado verificando**: numa captura de tela de longe, o "Carpete claro" parece quase indistinguível do fundo branco da própria UI ao redor do visualizador — isso é o **resultado esperado do pedido** ("quase branco"), não um bug: o botão de escolher (`.catalog-lounge-floor-swatch`) sempre tem um contorno fino (`box-shadow:inset 0 0 0 1px var(--line)`) que já garante ele ser clicável/visível na barra lateral branca, e dentro da cena 3D de verdade (com móveis, sombra e — se o decorador escolher — uma parede de fundo) o chão continua lido como chão, mesmo bem claro. Confirmado que a MESMA técnica (`fiber`) renderiza com uma cor bem mais escura (verde) sem nenhum problema, então o "quase invisível" do claro é só a proximidade de cor com o fundo da tela de teste, não uma falha de render.

Teste (`tests/catalogo-lounge-browser.cjs`, cenário 1): 8 amostras de piso (era 5), cada uma troca o chão de verdade (`dataset.floorKey`) incluindo as 3 novas (`stone`/`carpet-light`/`carpet-green`), e as 8 cores computadas das amostras são todas diferentes entre si. Suíte completa do catálogo (26 arquivos) rodada de novo, tudo passando. Cache-busting `catalogo-lounge.mjs?v=20260921-texturas-piso` (e o import dele + a tag `<script>` de `catalogo.mjs`, já que o próprio `catalogo.mjs` também mudou de bytes — a linha do import).

## Bug real: não dava pra arrastar a foto de fundo do Lounge "mais pra baixo"

Pedido do usuário, reportando um bug: *"estou tendo uma limitação, quero
arrastar a foto de fundo mais pra baixo e eu não consigo, verifique isso
por favor"*.

**Causa raiz, achada por análise matemática da função de desenho antes de
tocar em qualquer coisa** (`paintBackgroundWall()`): o ajuste "cover" (que
preenche a parede 9×4,6 ≈ 1,9565:1 sem distorcer, cortando o excesso)
usa `baseScale = Math.max(canvas.width/imagem.largura,
canvas.height/imagem.altura)` — o eixo que precisa da escala MAIOR pra
cobrir a parede fica, matematicamente, com folga ZERO nesse ajuste
(`drawHeight === canvas.height` exatamente, ou o mesmo pra largura) —
nesse eixo, `drawY`/`drawX` fica sempre no mesmo valor não importa o que
`wall.x`/`wall.y` seja, porque não existe conteúdo "sobrando" da imagem
pra revelar arrastando. Como a parede é BEM larga (quase 2:1), qualquer
foto de fundo AINDA MAIS larga que isso (foto panorâmica de ambiente,
comum como fundo de composição) zera especificamente a folga VERTICAL —
batendo exatamente com "quero arrastar mais pra baixo e não consigo".
Com uma foto quase quadrada (como o fixture de teste `PNG_1X1`, 1×1,
usado em todos os testes anteriores desta seção), o eixo apertado é
sempre o horizontal, sobrando folga vertical de sobra — por isso o bug
nunca tinha aparecido nos testes automatizados, só no uso real com uma
foto de proporção diferente.

**Corrigido garantindo uma folga mínima nos DOIS eixos, sempre** —
`MIN_WALL_OVERSCAN = 1.25` multiplica o `baseScale` antes de aplicar o
zoom do usuário (`catalogo-lounge.mjs`): mesmo no zoom mínimo (1×), a
imagem é desenhada 25% maior que o "cover" puro, garantindo folga real
pra arrastar em qualquer direção, não importa a proporção da foto
escolhida — sem exigir que a pessoa descubra que precisa dar zoom manual
primeiro pra "destravar" o arrasto num eixo.

**Verificado reproduzindo de verdade, não só pela matemática**: fixture
de imagem novo no teste, `PNG_WIDE_PANORAMIC` (PNG real gerado à mão via
`zlib.deflateSync`/CRC32 — não SVG nem o `PNG_1X1` antigo — 1200×220,
5,45:1, bem mais largo que a parede), pra reproduzir exatamente a
condição de zero-folga-vertical que o `PNG_1X1` quadrado nunca expunha.
Ganhou também um atributo de depuração novo, `host.dataset.
wallDrawOffset` (`drawX,drawY` em PIXELS do canvas da parede — mesmo
espírito de `dataset.wallOffset`, mas medindo o RESULTADO do desenho, não
só o `x`/`y` armazenado em porcentagem): `wallOffset` sozinho não bastava
pra provar o bug, porque `wall.y` mudava normalmente mesmo com o bug
presente — só o desenho final (`drawY`) ficava sempre igual. Teste novo
confirma que arrastar pra cima E pra baixo com a foto panorâmica muda
`drawY` de verdade (diferença >5px), o que teria falhado antes da
correção.

## Bug real: renderização IA do Lounge "mudava completamente o mobiliário"

Pedido do usuário, reportando um bug com print do resultado renderizado:
*"a renderizacao mudou completamente o mobiliario, tem que funcionar
igual a renderizacao que acontece dentro do nosso painel 3d que ja
existe"*.

**Investigação, sem supor comportamento aleatório do modelo de IA como
resposta padrão**: comparado ponto a ponto o payload/prompt enviados por
`renderLoungeWithAI()` (Lounge) contra `renderWithAI()` (Estúdio de
Ambientes, `catalogo-studio3d.mjs`) e a função de borda compartilhada
(`supabase/functions/studio-ai-engine/index.ts`, `normalizarPrompt()`/
`generateWithOpenAI()`) — os dois módulos chamam a MESMA function, com o
MESMO `referencePolicy:"furniture_strict_architecture_adaptive"`, o
MESMO reforço rígido de preservação injetado no servidor
(`normalizarPrompt()`, idêntico pros dois), e enviam exatamente 1 imagem
de referência (a captura da cena) do mesmo jeito — nenhuma diferença de
prompt/parâmetros explicaria um comportamento pior no Lounge.

**Causa raiz de verdade, achada relendo `placeRole()`/`applySelection()`**:
trocar de item (sofá/poltrona/mesa/aparador) ou de formato dispara
`applySelection()`, que roda `placeRole()` pra cada papel — e `placeRole()`
é ASSÍNCRONA: `clearRole()` remove a peça ANTIGA da cena na hora
(síncrono), mas o `.glb` NOVO só entra depois de um
`await loadModel(item)` (fetch + parse do modelo, podendo levar algumas
centenas de ms num modelo real, mesmo com cache depois da 1ª vez). O
botão "Renderizar com IA" nunca checava esse estado — só olhava o próprio
`button.disabled` (setado só durante o PRÓPRIO render). Clicar em
"Renderizar com IA" bem depois de trocar um item, mas ainda dentro dessa
janela assíncrona, capturava (`loungeCleanPreview()`) uma composição
DESINCRONIZADA da que a pessoa via nos chips de seleção — um papel sem
nenhuma peça ainda, ou com a peça antiga que já tinha sido removida da
cena. A IA recebeu exatamente essa foto incompleta/inconsistente como
referência e "completou" a cena com mobiliário genérico pra preencher o
vazio — batendo exatamente com "mudou completamente o mobiliário". A IA
nunca teve culpa: o pipeline de preservação é idêntico ao do Estúdio, só
que o Estúdio nunca tinha esse mesmo tipo de troca assíncrona de peça
clicável enquanto o botão de renderizar continuava liberado (o fluxo dele
é bem mais lento/deliberado, com diálogo de preset).

**Corrigido desabilitando "Renderizar com IA" durante TODA a montagem da
composição** (`setLoading()`, chamada por `applySelection()`): o botão
fica `disabled` exatamente na mesma janela que já mostra "Montando
composição" no visualizador — nunca clicável enquanto algum papel ainda
pode estar sem peça. Um atributo `dataset.loungeRendering` no próprio
botão impede `setLoading()` de reabilitar o botão por engano caso, por
algum motivo futuro, uma renderização de IA e uma troca de composição
acabem se sobrepondo no tempo.

**Verificado reproduzindo de verdade a janela assíncrona**, não com um
`waitForTimeout` arbitrário: o teste atrasa de propósito a resposta do
`.glb` de um papel opcional ainda não carregado (Mesa de centro — sofá e
poltrona já estão em cache de `loadModel()` a essa altura, reselecioná-
-los não dispara rede nenhuma) usando um `Promise` controlado
manualmente pelo teste, clica no chip, confirma que o botão fica
desabilitado enquanto a resposta não chega, tenta clicar mesmo assim
(direto via `document.getElementById(...).click()`, bypassando a
checagem de "actionability" do Playwright, pra provar que é o PRÓPRIO
handler que recusa) e confirma que `window.__renderCalls` não cresce —
só depois de liberar a resposta do `.glb` o botão volta a ficar
clicável.

### 2ª rodada — a correção acima não bastou, causa raiz DIFERENTE

O usuário reportou o MESMO sintoma de novo depois dessa correção, com
2 prints lado a lado (a foto que a IA devolveu — 3 poufs redondos
iguais — sem nenhuma relação com a composição real, sofá + 2 poltronas
de vime): *"olha o lounge que a ia me entregou e olha o lounge que era
pra renderizar, nada a ver, é só pegar como a IA renderiza dentro do
painel 3D Estúdios e Ambientes e replicar"*.

**Causa raiz de verdade, achada comparando `loungeCleanPreview()` linha a
linha contra `captureCleanPreview()` do Estúdio (não assumindo que os
dois já eram idênticos, mesmo depois de já ter comparado o prompt/payload
na 1ª rodada)**: `captureCleanPreview()` (`catalogo-studio3d.mjs`) sempre
fez um `studio.renderer.render(studio.scene, studio.camera)` SÍNCRONO
bem antes de capturar o canvas — `loungeCleanPreview()` nunca fazia isso,
só lia `renderer.domElement` "como estivesse", contando com o loop de
`requestAnimationFrame` ter desenhado alguma coisa recente o bastante. O
`WebGLRenderer` dos dois módulos é criado sem `preserveDrawingBuffer:
true` (economiza memória de propósito) — sem essa flag, o navegador pode
limpar o buffer de desenho a qualquer momento depois de um frame ser
apresentado na tela, e nada garante que o conteúdo ainda é válido no
instante exato (assíncrono, fora do loop de RAF) em que a pessoa clica
"Renderizar com IA". Na prática funcionava na maior parte das vezes (a
coincidência de timing entre o RAF e o clique costuma dar certo), mas
podia — sem nenhum aviso — capturar um frame velho, parcial ou
efetivamente em branco, e é exatamente isso que explica a IA "inventando"
mobiliário do zero: ela não tinha nenhuma referência de verdade pra
preservar.

**Corrigido replicando o MESMO passo do Estúdio**: `loungeCleanPreview()`
agora chama `lounge.renderer.render(lounge.scene, lounge.camera)` como
primeira linha, garantindo um frame fresco no buffer no exato momento da
captura, não importa o que o loop de RAF tenha feito por último.

**Verificado sem depender de decodificar pixels de PNG** (o resto da
suíte nunca precisou disso, não valia a pena adicionar uma dependência
nova só pra este teste): o teste espiona `WebGLRenderingContext.prototype
.clear`/`WebGL2RenderingContext.prototype.clear` (nível de API do
navegador, via `page.addInitScript` — funciona independente de quando o
módulo "three" é importado) contando quantas vezes um render de verdade
acontece. Congela o loop de RAF de propósito (`window.requestAnimationFrame
=()=>0`, depois de deixar qualquer frame já agendado terminar), mexe na
câmera só no grafo de cena (zoom, sem nenhum jeito de repintar
automaticamente com o RAF parado) e confirma que clicar em "Renderizar
com IA" ainda assim dispara uma passada de desenho WebGL nova — só pode
vir do `render()` forçado dentro de `loungeCleanPreview()`, já que
nenhum outro caminho de repintura está ativo. **Confirmado que o teste
pega a regressão de verdade**: removendo manualmente a linha do
`render()` forçado, esse teste específico falha; com a linha de volta,
passa — não é uma asserção que "passaria de qualquer jeito".

### 3ª rodada — pedido de precisão: enquadramento LITERAL, nunca reinterpretado

Depois das duas correções acima, o usuário refinou o que "preservar
tudo" realmente significa, com um exemplo concreto: *"eu quero que
respeite exatamente o ângulo, a distância e principalmente o preview,
então por exemplo no meu preview não mostra o teto, então na IA também
não deve aparecer, entendeu? é como se tirasse um print do que eu estou
vendo no 3D e desse só o realismo, mantendo e preservando tudo, sem
inventar nada"*.

**Achado relendo o prompt reforçado no servidor (`normalizarPrompt()`,
`supabase/functions/studio-ai-engine/index.ts`), compartilhado pelos dois
módulos**: a regra "REGRA FLEXIVEL PARA A ARQUITETURA" instruía
explicitamente a IA a "estender, completar, recortar e reinterpretar...
**inclusive inferir o teto e completar trechos ausentes quando
necessário**" — escrita pensando no Estúdio de Ambientes, onde a
composição é uma sala de verdade (paredes com fotos, possivelmente
cortadas de forma estranha pela geometria 3D) e "completar" faz sentido
pra parecer uma única fotografia coesa. O Módulo Lounge não tem
NENHUMA geometria de teto — é só piso + eventualmente uma parede de
fundo, com o "céu"/vazio aberto acima de propósito (ver "Piso + fundo
por foto" mais acima) — mas herdava a MESMA instrução "pode inventar
teto", o que explica a IA "fechando" a cena com paredes/teto que nunca
existiram na composição real.

**Corrigido com uma política de prompt SEPARADA, só pro Lounge, sem
tocar no Estúdio**: `referencePolicy` ganhou um 3º valor possível,
`"furniture_strict_literal_scene"` (ao lado de
`"furniture_strict_architecture_adaptive"`, que o Estúdio continua
usando sem NENHUMA mudança, e `"fabric_customization"`). Dentro de
`normalizarPrompt()`, esse valor novo troca a "REGRA FLEXÍVEL PARA A
ARQUITETURA" por uma "REGRA RÍGIDA PARA A CENA E A ARQUITETURA":
preserva literalmente o que já está visível na captura (piso, parede de
fundo se houver, e o espaço aberto/vazio ao redor), proíbe
explicitamente adicionar teto/paredes/portas/janelas que não estejam na
captura original, e deixa claro que "se a captura mostra o ambiente
aberto, sem teto, o resultado também deve ficar aberto, sem teto". O
prompt PRÓPRIO do Lounge (`renderLoungeWithAI()`) foi reescrito no mesmo
espírito — trocou "trate a parede de fundo como referência flexível...
harmonize... complete o ambiente" por "aplique um acabamento
fotorrealista sobre a EXATA cena capturada... sem recompor nem estender
nada... como se fosse a própria foto revelada com materiais e luz
reais".

**Por que uma política nova, em vez de reescrever a regra existente pros
dois módulos**: o usuário nunca pediu pra mudar o comportamento do
Estúdio (que ele já usa como referência do que "funciona certo") — trocar
a regra COMPARTILHADA arriscaria quebrar a harmonização de paredes
cortadas que o Estúdio depende hoje, uma mudança não pedida num recurso
já validado. Uma política nova e isolada resolve o Lounge sem nenhum
risco pro Estúdio — confirmado com `catalogo-studio3d.mjs` continuando a
enviar `referencePolicy:"furniture_strict_architecture_adaptive"` sem
nenhuma alteração.

**Requer publicar a Edge Function pra valer de verdade**: diferente das
migrations desta sessão (aplicadas direto com `npx supabase db push
--linked`, sem pedir confirmação — mudança de schema, sempre aditiva),
uma mudança em `supabase/functions/studio-ai-engine/index.ts` só afeta o
comportamento ao vivo depois de um `npx supabase functions deploy
studio-ai-engine --project-ref ...` — deploy de código executável, uma
categoria de ação mais sensível que uma migration (mesmo sendo só a
Supabase, não GitHub Pages/Vercel). Por isso o código ficou pronto no
repositório, mas o deploy da função em si não foi feito sem confirmar
com o usuário antes — testar de novo sem publicar continuaria batendo na
versão antiga da função.

**Verificado com Playwright** (mock de `functions.invoke` passou a
capturar o `options` inteiro, não só o nome da função, algo que os
testes anteriores nunca precisaram): confirma que o corpo enviado tem
`scene.referencePolicy === "furniture_strict_literal_scene"` (nunca a
política flexível do Estúdio) e que o texto do prompt menciona
explicitamente "sem teto" — não é só uma checagem de que ALGUMA
renderização aconteceu, é a prova de que a POLÍTICA CERTA foi enviada.

### 4ª rodada — afinando especificamente a fidelidade da câmera

Depois de aprovar o resultado geral da 3ª rodada, o usuário pediu mais
precisão num ponto específico: *"ficou bom, eu só queria respeitar mais
o posicionamento da câmera, queria que seguisse exatamente o
posicionamento que eu ajustei, queria que fosse extremamente fiel a
isso"*.

**Investigado primeiro se existia algum parâmetro de API pra isso, antes
de só reforçar texto de prompt** (via `WebSearch`/`WebFetch`, checando a
documentação real da OpenAI, não assumindo): existe um parâmetro
`input_fidelity` no endpoint `/v1/images/edits`, mas confirmado (lendo a
própria comunidade de desenvolvedores da OpenAI) que **pro modelo
configurado neste projeto (`gpt-image-2` — confirmado com `npx supabase
secrets list --project-ref ...` que `STUDIO_OPENAI_IMAGE_MODEL` não está
setado como segredo, então o fallback do código é o que roda de
verdade), esse parâmetro nem é aceito: o modelo já processa toda imagem
de entrada em alta fidelidade automaticamente**. Ou seja, não existe
nenhum botão de API sobrando pra apertar aqui — o único alavanca real e
segura é o texto do prompt.

**Reforço aplicado nos dois prompts (cliente + servidor), técnica de
"primazia e recência"**: como o restante das regras já é uma lista longa
(móveis, arquitetura, convidados, etc.), a instrução de câmera ficava
"enterrada" no meio — sem garantia de peso extra. Adicionada uma frase de
alta prioridade logo NO INÍCIO da lista de regras (`"PRIORIDADE MAXIMA,
ACIMA DE QUALQUER OUTRO AJUSTE: o angulo de camera, a distancia... sao
IMUTAVEIS..."`) e repetida como a ÚLTIMA instrução do prompt
(`"Confirme antes de finalizar: o angulo de camera e o enquadramento da
imagem final devem ser identicos..."`) — só na política
`furniture_strict_literal_scene` (Lounge), sem tocar na política do
Estúdio. O prompt PRÓPRIO do Lounge (`renderLoungeWithAI()`, que vem
ANTES do reforço do servidor no texto final) também foi reescrito pra
liderar com a mesma prioridade de câmera, em vez de mencionar isso só de
passagem.

Teste de regressão: `tests/catalogo-lounge-browser.cjs` ganhou uma
asserção checando que o prompt enviado contém "prioridade máxima" — prova
que o reforço está presente no texto de verdade, não só documentado aqui.
Suíte completa (14 arquivos) rodada de novo, todas passando. **Mesma
observação sobre deploy da seção anterior continua valendo**: essa
mudança também é só no repositório até a Edge Function ser publicada de
verdade (`npx supabase functions deploy studio-ai-engine`).

Teste de regressão completo (recontando após esta seção):
`tests/catalogo-lounge-browser.cjs` (2 cenários) — card "Módulo Lounge"
aparece disponível no mini-menu (só "Realidade aumentada" continua "Em
breve", `tests/catalogo-modulo3d-menu-browser.cjs` ajustado pra 2 cards
disponíveis + 1 futuro); trilha/rótulo de 3 níveis; formato "Lounge
compacto" único e ativo por padrão; papéis obrigatórios com seleção
automática, opcionais com "Nenhuma"/aviso quando não há item cadastrado
naquele papel; trocar item remonta a peça certa na cena; controles de
câmera alteram a distância de verdade (via `dataset.cameraDistance`);
botão "Renderizar com IA" chama a MESMA função de borda do Estúdio de
Ambientes de verdade e abre o diálogo de resultado com a imagem
devolvida; dica de uso esmaece numa interação real (`wheel` no canvas);
tela cheia usa a Fullscreen API de verdade (mesmo espião de
`requestFullscreen`/`exitFullscreen` já usado no teste do mini-menu
Módulo 3D); piso com 5 opções aplicado de verdade no chão da cena; foto
de fundo vira uma PAREDE de verdade na cena 3D (mesma técnica do Estúdio
de Ambientes, não CSS), encostada perto da composição de verdade (sem
vão vazio), aplicada/escondida corretamente e ajustável ARRASTANDO
(posição de verdade, modo dedicado que não conflita com girar a câmera)
com zoom por BOTÃO +/- (nunca pela roda do mouse); sair do módulo remove
o `<canvas>` por completo (zero vazamento) e reabrir reconstrói do zero
(piso volta ao padrão); decorador externo alcança o mesmo módulo
funcional pelo mesmo caminho; sem overflow em 390/768/1024px. Suíte
completa de regressão do catálogo (15 arquivos, agora incluindo este) +
`tests/creditos-browser.cjs` + `tests/studio-browser.cjs` (confirma que
o Estúdio de Ambientes continua funcionando 100% intacto — nenhuma linha
de `catalogo-studio3d.mjs`/`.css` foi tocada) rodadas de novo, todas
passando.

## Mini-menu "Módulo 3D": um modelo 3D por card + hover "luz de teatro"

Pedido explícito do usuário, com print da tela já publicada nesta sessão
(visualizador grande centralizado no topo + 3 cards compactos embaixo):
*"agora quero alterar essa tela aqui, ao invés de ser um 3D só, eu quero
um 3D diferente pra cada módulo, ou seja se são 3 módulos precisa
aparecer 3D, e quero uma funcionalidade quando eu passar o mouse por
cima de algum item eu quero que ele dê esse efeito escurecido igual a
home mas que fique um luz de cima pra baixo no 3d igual luz de teatro,
sabe?"*.

**3 perguntas de esclarecimento antes de implementar** (via
AskUserQuestion — mudança grande, com implicações de schema): (1) como
escolher qual item vira o modelo em destaque de CADA módulo, já que só
existia 1 flag global (`itens.capa_modulo3d`) pra tela inteira —
confirmado: **marcar um item por módulo**, não escolha automática; (2)
"Realidade aumentada" (ainda "Em breve", sem funcionalidade) também
precisa mostrar um 3D, pra ficar visualmente parelha às outras 2 —
confirmado: **sim**; (3) o visualizador grande do topo — confirmado:
**some por completo**, o 3D entra dentro de cada card.

### Banco: 1 flag por módulo, não mais 1 flag global

Migration `20260919000200_itens_capa_modulo3d_por_modulo.sql`: a coluna
antiga `itens.capa_modulo3d` foi **renomeada** (não recriada do zero,
preserva o dado de quem já tinha marcado algo) pra
`itens.capa_modulo3d_estudio`, e 2 colunas novas nasceram do lado dela —
`capa_modulo3d_lounge`, `capa_modulo3d_ar` — as 3 booleanas
independentes (um item pode ser capa do Estúdio E do Lounge ao mesmo
tempo, cada flag é isolada). `catalogo_acervo()` (função única de onde
tanto o decorador externo quanto a equipe interna leem os itens) recebeu
`create or replace function` trocando `'capa_modulo3d'` pelos 3 campos
novos no `jsonb_build_object` — mesmo padrão de ponto único de alteração
já usado nas adições anteriores desta sessão. Aplicada com `npx supabase
db push --linked` e confirmada direto no banco
(`information_schema.columns`) antes de mexer no frontend.

### Frontend: `MODULO3D_CAPA_FIELD`/`MODULO3D_CAPA_COLUMN` traduzem card↔coluna

`catalogo.mjs`: duas tabelas de tradução (`{estudio:"capaModulo3dEstudio",
lounge:"capaModulo3dLounge","realidade-aumentada":"capaModulo3dAr"}` e o
equivalente com nome de coluna do banco) — qualquer card novo no futuro
só precisa de 1 entrada nova aqui + a coluna correspondente no banco.
`modulo3dFeaturedItem(moduleKey)` (antes sem parâmetro nenhum, 1 modelo
só) passou a receber qual módulo, procurando o item marcado PRA AQUELE
módulo especificamente, com o mesmo fallback de antes (1º item com
qualquer `.glb`, nunca fica sem mostrar nada existindo pelo menos 1
modelo no sistema).

**Botão de marcar virou um GRUPO de 3 (`capaModulo3dToggleMarkup()`)**:
onde antes existia 1 botão ★/☆ "Definir como modelo do Módulo 3D" na
página do item (equipe interna, só em itens com `.glb`), agora existe
`.catalog-capa-modulo3d-group` com 1 botão por card de `MODULO3D_CARDS`
— cada um marca/desmarca só a SUA própria flag. `alternarCapaModulo3d()`
ganhou um parâmetro `moduleKey`: a exclusividade mútua ("só 1 capa por
vez") continua existindo, mas agora é **por módulo** — marcar um item
como capa do Estúdio desmarca outro item que já fosse capa do Estúdio,
sem tocar em nenhuma marcação de Lounge/Realidade aumentada. Testado
explicitamente (`tests/catalogo-modulo3d-menu-browser.cjs`): marcar um
item pro Estúdio confere que a escrita no banco NUNCA toca a coluna
`capa_modulo3d_lounge`.

### Visualizador grande sumiu — 3 `<model-viewer>` pequenos, 1 por card

`renderModulo3dModel()` (antes montava 1 `<model-viewer>` grande dentro
de `#modulo3dModelStage`, com badge "Visualização 360°", dica de uso,
controles de zoom/redefinir/tela cheia) foi reescrita pra montar um
preview PEQUENO E DECORATIVO dentro do stage de CADA card
(`.catalog-modulo3d-card-stage`, `data-modulo3d-stage="<key>"`) —
chamada 3x em `renderModulo3dMenu()`, uma por `MODULO3D_CARDS`.

**Decorativo de propósito, não mais interativo**: sem
`camera-controls`/`disable-pan`/`interaction-prompt` (não faz sentido
arrastar manualmente um preview pequeno dentro de um card que também
precisa continuar clicável pra navegar) e `viewer.style.pointerEvents =
"none"` no próprio elemento — garante que o `<model-viewer>` NUNCA
"rouba" o clique/hover do card por baixo, mesmo que a lib tenha algum
comportamento interno de captura de ponteiro. `auto-rotate-delay="0"`
(gira desde o primeiro frame — sem "esperar a pessoa girar manualmente
primeiro", que fazia sentido no visualizador grande antigo mas não aqui).
Removidas por completo (não só desligadas) todas as funções que só
existiam pra sustentar os controles do visualizador único —
`modulo3dCurrentOrbit`/`modulo3dApplyOrbit`/`modulo3dZoom`/
`modulo3dResetView`/`modulo3dSyncFullscreenUI`/`modulo3dToggleFullscreen`/
`modulo3dHandleCameraChange`/`modulo3dViewerControlsMarkup`, os ícones
`cube`/`mouse`/`zoomIn`/`zoomOut`/`reset`/`expand`/`compress`, e toda a
CSS de `.catalog-modulo3d-viewer`/`-badge`/`-hint`/`-controls`/`-model*`
— nada disso tem mais elemento nenhum na tela pra estilizar/controlar.

**Fallback continua sendo o ícone estático** (não um texto "Nenhum
modelo 3D em destaque ainda", que fazia sentido pro visualizador grande
mas não pro quadradinho pequeno de um card) — `modulo3dCardIcon(card)`
devolve o mesmo SVG de antes (sofá pro Lounge, planta pro Estúdio, AR
pro recurso futuro), usado tanto na 1ª pintura (antes do JS montar
qualquer `<model-viewer>`) quanto se o carregamento falhar ou não
suportar WebGL.

### Efeito de hover: card escurece "igual a Home", 3D ganha "luz de teatro"

Dois mecanismos DIFERENTES, cada um no seu elemento, ambos disparados
pelo mesmo `:hover`/`:focus-within` do card:

1. **O card inteiro escurece** (`.catalog-modulo3d-feature::before`,
   `rgba(15,13,10,.55)`, opacidade 0→1) — mesmo mecanismo já usado no
   escurecer das fotos do Portal (`.catalog-gateway-zone::before`), só
   que aplicado aqui no texto/botão/selo do card.
2. **O stage do 3D tem seu PRÓPRIO efeito**, não é coberto pelo
   escurecer genérico — `.catalog-modulo3d-card-stage{z-index:2}` fica
   ACIMA do `::before` do card (`z-index:1`), então o 3D nunca escurece
   igual ao resto. No lugar disso, `.catalog-modulo3d-card-spotlight`
   (um `<span>` próprio dentro do stage) aplica um ÚNICO gradiente
   radial que já faz o efeito inteiro: brilho quente perto do topo
   (`rgba(255,241,214,.55)`, de onde a "luz" viria) escurecendo
   gradualmente pras bordas/base (`rgba(8,6,5,.68)`) — um feixe vindo de
   cima com sombra ao redor, não uma cor plana igual ao resto do card.
   Verificado visualmente com Playwright (screenshot fora/dentro do
   hover, comparando lado a lado) — o card hover fica visivelmente mais
   escuro com o 3D "iluminado por cima", os outros 2 continuam normais.

**Achado real ajustando o teste, não um bug de produto**: um primeiro
script de verificação visual ad-hoc mostrou o card "Módulo Lounge" já
"aceso" mesmo sem nenhum hover disparado — investigado antes de assumir
bug: era só a posição RESIDUAL do cursor do mouse depois do clique
anterior no bloco do Portal (`page.click()` move o cursor de verdade pra
aquele ponto da tela, e como a tela nova é mais compacta que a antiga,
esse ponto passou a cair dentro do card do Lounge) — sem relação
nenhuma com o CSS/JS do efeito. Corrigido no script de verificação
(`page.mouse.move(5,5)` antes de screenshotar o estado "normal"), não no
produto.

**Achado real no teste automatizado (esse sim, ajuste necessário)**: a
checagem "recurso futuro não tem nenhum elemento clicável" (`button, a`
dentro do card) começou a falhar depois de embutir um `<model-viewer>`
decorativo ali dentro — o seletor do Playwright atravessa a shadow DOM
por padrão, e o `<model-viewer>` tem seus PRÓPRIOS botões internos (ex.
AR), que não têm nada a ver com "o card tem um elemento clicável
próprio". Corrigido com o pseudo-seletor `:light()` do Playwright
(restringe a busca ao DOM "claro" do próprio card, sem atravessar shadow
roots) nos dois testes que faziam essa checagem
(`catalogo-modulo3d-menu-browser.cjs` e `catalogo-lounge-browser.cjs`,
que também navega até este mini-menu).

Teste de regressão reescrito por completo:
`tests/catalogo-modulo3d-menu-browser.cjs` (3 cenários) — 3
`<model-viewer>` simultâneos, cada um no stage certo, mostrando o item
marcado PRA AQUELE módulo especificamente (fixture com A=capa do
Estúdio, B=capa do Lounge, provando que as flags são independentes de
verdade); preview sem `camera-controls`, `pointer-events:none`; hover
escurece o card inteiro E ilumina o 3D (checagem de opacidade via
`getComputedStyle`, incluindo o pseudo-elemento `::before`); marcar um
item novo como capa do Estúdio desmarca o antigo SÓ nessa coluna
(confere que nenhuma escrita toca `capa_modulo3d_lounge`); Estúdio abre
a rota de sempre e desliga os 3 viewers do mini-menu ao sair (zero
`model-viewer` sobrando); decorador nunca vê os botões de marcar; sem
nenhum modelo no sistema, os 3 cards caem pro ícone; sem overflow em
390/768/1024px. Suíte completa de regressão do catálogo (15 arquivos) +
`tests/creditos-browser.cjs` + `tests/studio-browser.cjs` (Estúdio de
Ambientes continua 100% intacto — nenhuma linha de
`catalogo-studio3d.mjs`/`.css` foi tocada) rodadas de novo, todas
passando.

### 2ª rodada — layout errado: tinha que ser IGUAL à Home, não um card compacto

Pedido de correção imediata do usuário, olhando a 1ª versão já publicada
nesta mesma tarefa (3D pequeno embutido dentro de um card compacto
ícone+texto+botão, numa linha horizontal): *"não quero que fique dentro
dos cards, eu quero que fique igual a home, literalmente um 3d do lado
do outro, com o nome do módulo por baixo do 3d, esse 3d tem que ser
grande"*.

**Redesenho completo do layout, reaproveitando o padrão visual dos cards
de categoria da Home do catálogo** (`.catalog-home-card`/
`.catalog-home-grid`: foto quadrada GRANDE + nome ABAIXO dela, sem
descrição nem botão separado — o quadrado inteiro é o próprio alvo do
clique) — sem reaproveitar as CLASSES da Home 1:1 (DOM/hover distintos:
aqui tem um `<model-viewer>` vivo + o efeito de "spotlight" que a Home
nunca teve), mas com tamanho/proporção/tipografia calibrados pra ficarem
visualmente equivalentes.

`modulo3dCardMarkup()` reescrita: os cards viraram **tiles** —
`<button class="catalog-modulo3d-tile" data-modulo3d-card="...">` pro
Estúdio/Lounge (o `<button>` INTEIRO é clicável, sem CTA separado —
`data-modulo3d-card` que antes vivia num botão pequeno dentro do card
agora vive no elemento raiz), `<article class="catalog-modulo3d-tile
catalog-modulo3d-tile-soon" aria-disabled>` pra Realidade aumentada. A
**descrição de cada módulo parou de ser desenhada** (`card.description`
não é mais usado no HTML) — igual a Home, que também nunca mostra
descrição embaixo do nome da categoria, só o nome.

`.catalog-modulo3d-cards` virou uma grade CSS de **3 colunas fixas**
(`grid-template-columns:repeat(3,minmax(0,1fr))`, não `auto-fill`
elástico tipo a Home — ali faz sentido pra dezenas de categorias, aqui
são sempre exatamente 3 módulos, "literalmente um 3d do lado do outro").
`.catalog-modulo3d-tile-stage` (renomeado de `.catalog-modulo3d-card-
stage`) virou `width:100%;aspect-ratio:1/1` — ocupa a largura toda do
tile, crescendo junto com a coluna da grade ("esse 3d tem que ser
grande" levado ao pé da letra: numa tela de 1600px, cada quadrado passa
de ~92px pra várias centenas de pixels). O mecanismo de hover
(escurecer o quadro inteiro + "spotlight" só no 3D, ver seção anterior)
não mudou de LÓGICA, só de seletor — `:hover`/`:focus-visible` no
`.catalog-modulo3d-tile` (antes `:hover`/`:focus-within` nas variantes
`-primary`/`-soon`, que não existem mais).

**Achado ao ajustar os testes**: o clique nos cards pra abrir Estúdio/
Lounge estava espalhado em **4 outros arquivos** de teste que só
passavam DE PASSAGEM pelo mini-menu (`catalogo-browser.cjs`,
`catalogo-biblioteca-browser.cjs`, `catalogo-breadcrumb-browser.cjs`,
`catalogo-portal-browser.cjs`) — todos clicavam no seletor antigo
`.catalog-modulo3d-feature-cta[data-modulo3d-card="estudio"]`, que não
existe mais (a suíte de regressão completa só entrega esse tipo de
achado rodando TODOS os arquivos, não só os dois que tratam diretamente
do mini-menu). Corrigido nos 4, trocando pro seletor novo
(`[data-modulo3d-card="estudio"]`, que agora aponta pro `<button>` raiz
do tile).

Teste de regressão atualizado (`tests/catalogo-modulo3d-menu-browser.cjs`
e `tests/catalogo-lounge-browser.cjs`): checagens de nome/badge/clique
migradas pras novas classes (`.catalog-modulo3d-tile`/`-soon`/`-name`/
`-badge`), removida a asserção que checava o texto da descrição (não
existe mais). Suíte completa (15 arquivos) + `tests/creditos-browser.cjs`
+ `tests/studio-browser.cjs` rodadas de novo, todas passando —
confirmado também que os 4 arquivos "de passagem" (que só clicavam no
card pra sair do mini-menu, sem testar o layout dele) voltaram a passar
depois da correção dos seletores.

### 3ª rodada — a luz precisa ter a FORMA de um funil, não só um brilho

Pedido de refinamento, aprovando o layout novo: *"isso mesmo, só que a
luz deve ser de cima pra baixo igual um funil"*. O `.catalog-modulo3d-
card-spotlight` até então era UM gradiente radial só (uma elipse de luz
perto do topo, esmaecendo em todas as direções) — ficava um brilho
arredondado, sem direção clara, não uma "luz vindo de cima" de verdade.

**Reescrito com 2 pseudo-elementos, cada um com um papel bem definido**
(CSS puro não tem uma forma de gradiente "cone/funil" pronta — a única
forma de desenhar isso é recortando a forma manualmente):
- `::before` — a vinheta escura de fundo (`radial-gradient` escurecendo
  as bordas do quadrado, mais forte que o escurecido do resto do quadro),
  dá o contraste que o feixe precisa pra se destacar.
- `::after` — o FEIXE em si, com a forma literal de um funil via
  `clip-path:polygon(46% 0%,54% 0%,94% 100%,6% 100%)` — um trapézio
  estreito no topo (de onde a luz "sai") alargando pra baixo até quase
  as bordas do quadrado (onde "bate" no 3D). `filter:blur(7px)` amacia
  as arestas do polígono (sem isso ficaria um triângulo gráfico de
  aresta dura, não um feixe de luz realista) e `mix-blend-mode:screen`
  garante que o feixe só CLAREIA o que está por baixo — nunca pinta uma
  cor chapada por cima do modelo 3D.

Verificado com Playwright, recortando a screenshot só na área do
tile em hover (não a tela inteira) pra inspecionar a forma de perto —
confirmado visualmente um funil de verdade: ponta estreita no topo,
alargando em linha reta até a base do quadrado, iluminando o objeto por
baixo dele. Nenhuma asserção de teste precisou mudar (a suíte só checa a
opacidade 0→1 do `<span>` externo no hover, que continua exatamente
igual — só o CONTEÚDO visual interno mudou de forma). Suíte completa (15
arquivos) + `tests/creditos-browser.cjs` + `tests/studio-browser.cjs`
rodadas de novo, todas passando.

### 4ª rodada — o efeito inteiro foi descartado, virou o zoom da Home

Depois de ver o funil renderizado de verdade, o usuário decidiu que o
caminho inteiro (escurecer + qualquer variação de luz) não estava
funcionando: *"esquece esse efeito, não ficou bonito, só coloca algum
efeito quando eu passar o mouse por favor, algo que combine"*.

**Trocado pelo MESMO hover já aprovado pelos cards de categoria da
Home** (`.catalog-home-card .catalog-grid-card-photo img` — ver seção
"Fotos maiores + hover premium nos cards da Home" mais acima, onde o
usuário já tinha pedido exatamente esse resultado antes: "não quero que
tenha essa mudança de cor deixando mais escuro, essa sombra. quero
apenas que deixe o zoom") — mesma curva/duração
(`cubic-bezier(.22,1,.36,1)`, `1400ms`), mesmo `scale(1.12)` aproximado
(a Home usa `1.18` na foto; aqui ficou um pouco mais discreto por ser um
quadrado maior). Removido por completo, não só desativado: `.catalog-
modulo3d-tile::before` (o escurecer), `.catalog-modulo3d-card-spotlight`
inteiro (as duas variações, radial e funil) — nenhum vestígio dos 2
efeitos rejeitados ficou no CSS nem no HTML (`modulo3dCardStageMarkup()`
não insere mais a `<span>` de spotlight).

**Onde o zoom é aplicado, mesma lição já documentada nesta sessão pro
hover da Home**: no CONTEÚDO do stage (`model-viewer`/ícone de
fallback), nunca no `<button>` que envolve o tile inteiro — transformar
o próprio elemento clicável faz o alvo "fugir" debaixo do cursor durante
a transição, quebrando cliques reais (e o `.click()` do Playwright, que
tem checagem de estabilidade do alvo). O nome do módulo continua trocando
pra `var(--accent)` no hover (não fazia parte do efeito rejeitado,
manteve-se igual desde a 1ª versão desta tela).

**Achado corrigindo o teste**: a 1ª tentativa lia o `transform`
computado logo depois de um `page.waitForFunction()` esperando a
condição "escala > 1.05" — intermitentemente falhava mesmo com o efeito
funcionando de verdade (confirmado isolando o cenário num script à
parte, que via `matrix(1.12,...)` estável). Causa: ler o valor de novo
numa chamada `page.evaluate()` SEPARADA logo depois do
`waitForFunction` resolver introduz uma pequena corrida entre as duas
idas-e-voltas ao navegador. Corrigido trocando por um
`waitForTimeout(1600)` fixo (a transição dura 1400ms, a margem cobre
qualquer variação) antes de ler o valor uma única vez — mais simples e
sem essa corrida.

Teste de regressão atualizado (`tests/catalogo-modulo3d-menu-browser.cjs`):
checagens de opacidade do escurecer/spotlight substituídas por leitura
do `transform` do `model-viewer` (via `DOMMatrix`, comparando a escala)
antes/depois do hover e depois de tirar o mouse. Suíte completa (15
arquivos) + `tests/creditos-browser.cjs` + `tests/studio-browser.cjs`
rodadas de novo, todas passando.

**Registro daquela rodada, corrigido pela seguinte**: as duas variações
de "escurecer + luz vinda de cima" (radial simples e funil recortado com
`clip-path`) continuam rejeitadas — mas o ESCURECER simples (sem luz
nenhuma) acabou voltando na rodada seguinte, então "nunca mais escurecer
esta tela" não é a lição certa; a lição real é a da seção seguinte.

### 5ª rodada — nome pra DENTRO do quadro, branco, com o escurecer real do Portal

Pedido em 2 mensagens seguidas, depois de ver o zoom-só funcionando:
primeiro *"o nome do módulo em baixo está muito escondido, quero que ele
fique mais visível, acho que podíamos fazer igual a home, escrito dentro
e quando passar o mouse dá aquele efeito"*, depois, vendo o resultado
(nome dentro, mas ainda com texto escuro sobre fundo claro) *"a escrita
deve ser branca e quando eu passo o mouse deve fazer a mesma coisa que
na home, deve ficar escuro o card inteiro"*.

**"Home" aqui nunca foi a grade de categorias — é o Portal** (rótulo
"Home" no cabeçalho da própria tela, ver seção "Botões Biblioteca/Painel
3D removidos..." mais acima) — mais especificamente `.catalog-gateway-
title`/`.catalog-gateway-zone::before`, o efeito que os 3 blocos do
Portal já usam: nome centralizado por cima da foto, letter-spacing
abrindo no hover, e um escurecer que começa em `opacity:.22` (nunca
zero — é o que mantém o texto branco legível mesmo em repouso) e sobe
pra `.5` no hover.

**Implementação, replicando os valores exatos do Portal** (não uma
aproximação nova): `.catalog-modulo3d-tile-stage::before` — mesmo
`background:#000`, mesmas opacidades `.22`→`.5`, mesma duração/curva
`1000ms cubic-bezier(.22,1,.36,1)` de `.catalog-gateway-zone::before`.
`.catalog-modulo3d-tile-name` — `color:#fff` fixo (nunca mais `var(--
accent)` no hover, só o letter-spacing abre, igual ao Portal: lá a cor
também não muda, só o espaçamento), `text-shadow:0 3px 22px rgba(0,0,0,
.4)` idêntico ao `.catalog-gateway-title`. `model-viewer`/`.catalog-
modulo3d-card-icon` perderam o `position:absolute` (viraram `position:
relative;z-index:0`) — precisavam ficar numa camada de empilhamento
abaixo do novo `::before` (`z-index:1`) pra o escurecer cobrir o 3D de
verdade, e o nome continua `z-index:2`, sempre por cima de tudo. O zoom
no hover (rodada anterior) continua intacto, sem conflito — são
transições em elementos/propriedades diferentes.

Card "Realidade aumentada" ganhou uma variação: nome em
`rgba(255,255,255,.7)` (branco, só que mais apagado) em vez do cinza
escuro usado antes — combina melhor com o fundo agora escurecido, e
ainda comunica "menos importante" que os 2 módulos disponíveis.

Teste de regressão (`tests/catalogo-modulo3d-menu-browser.cjs`): 3
asserções novas — `getComputedStyle` do nome confirma `rgb(255,255,255)`;
`getComputedStyle(..., '::before').opacity` do stage confirma `0.22` em
repouso e `0.5` no hover (voltando a `0.22` ao tirar o mouse); o zoom do
3D (já testado na rodada anterior) continua funcionando junto, sem
interferência entre os dois efeitos. Verificado visualmente com
Playwright (screenshot fora/dentro do hover) — texto branco perfeitamente
legível mesmo sem hover, card escurecendo visivelmente mais forte no
hover, igual ao efeito real do Portal. Suíte completa (15 arquivos) +
`tests/creditos-browser.cjs` + `tests/studio-browser.cjs` rodadas de
novo, todas passando.

### 6ª rodada — fundo em repouso ficou mais claro, hover compensa

Pedido explícito do usuário, vendo a tela com o mecanismo do Portal já
aplicado (rodada anterior): *"o fundo do 3d está muito escuro de todos,
quero deixar eles mais claros, eu sei que a fonte esconde um pouco mas
quando passar o mouse ela vai aparecer"* — aceitando conscientemente que
o texto fique menos evidente em repouso, porque o hover garante que ele
"apareça" de verdade.

**Só o `::before` do `.catalog-modulo3d-tile-stage` mudou** — mesmas
duração/curva (`1000ms cubic-bezier(.22,1,.36,1)`), mesmo `background:
#000`, só as opacidades: repouso `.22`→`.08` (quadro bem mais claro),
hover `.5`→`.6` (compensa a claridade nova, o nome branco continua
"aparecendo" com força no hover). Nada mais no mecanismo (letter-spacing,
zoom do 3D, `z-index`) foi tocado.

Verificado com screenshot comparando antes/depois (`modulo3d-lighter-
normal.png`/`modulo3d-lighter-hover.png`) — quadro visivelmente mais
claro em repouso, texto ainda legível, e escurecendo com força total no
hover. Teste de regressão (`tests/catalogo-modulo3d-menu-browser.cjs`)
atualizado: as 3 asserções de `darkenOpacity()` que verificavam
`0.22`/`0.5` passaram a verificar `0.08`/`0.6`. Cache-busting de
`catalogo.css` bumpado em `catalogo.html` (`?v=20260919-modulo3dlighter`)
— `catalogo.mjs` não mudou nesta rodada, manteve o `?v=` da rodada
anterior. Suíte completa (15 arquivos) + `tests/creditos-browser.cjs` +
`tests/studio-browser.cjs` rodadas de novo, todas passando.

### 7ª rodada — nome vira TÍTULO no topo + resumo do módulo, só no hover

Pedido explícito do usuário, em 2 mensagens seguidas: primeiro *"agora
eu quero subir o nome dos card mais pra cima do card pra ficar tipo um
titulo mesmo, e quando eu passar o mouse quero que apareca um resumo
sobre pra que serve aquele modulo, por exemplo, modulo lounge poderia
ser assim, teste formatacoes e combinacoes com o nosso acervo de forma
rapida e pratica, algo nesse sentido. essa frase so aparece quando a
gente passa o mouse, ela nao deve ficar amostra sempre"*; ao ver o
resultado (resumo aparecendo centralizado no meio do quadro), correção
imediata: *"a frase ela deve aparecer nao no meio, mais logo abaixo do
titulo e precisa ter a mesma fonte tambem pra nao parecer algo aleatorio
e sem nexo, so pra lembrar"*.

**Nome subiu pro topo**: `.catalog-modulo3d-tile-name` deixou de ficar
centralizado verticalmente (`top:50%;transform:translate(-50%,-50%)`) —
agora mora dentro de um wrapper novo, `.catalog-modulo3d-tile-caption`
(`position:absolute;top:9%;left:50%;transform:translateX(-50%);display:
flex;flex-direction:column;align-items:center;gap:8px`), que ancora
nome+resumo juntos perto do topo do quadro. `top` em **porcentagem**
(não px fixo) escala com o tamanho real do quadro (`aspect-ratio:1/1`),
continua correto em qualquer breakpoint.

**Resumo reaproveita `card.description`** (já existia em
`MODULO3D_CARDS` desde o redesenho anterior, mas tinha parado de ser
desenhado — "a Home também nunca mostra descrição embaixo do nome da
categoria" era a razão de então; agora volta, só que revelado SÓ no
hover, não sempre visível como uma legenda comum) — texto do Lounge
reescrito pro exemplo literal do usuário: *"Teste formatações e
combinações com o nosso acervo de forma rápida e prática"*. Estúdio e
Realidade aumentada mantiveram as descrições que já tinham.

**Correção da posição, pedido explícito ("logo abaixo do título, não no
meio")**: `modulo3dCardOverlayMarkup(card)` — antes devolvia
`nameMarkup+descMarkup` soltos, cada um com seu próprio `position:
absolute` independente (nome no topo, resumo centralizado no meio) —
virou um `<div class="catalog-modulo3d-tile-caption">` ENVOLVENDO os
dois, com `display:flex;flex-direction:column` — o resumo passou a
morar no FLUXO NORMAL logo abaixo do nome (não mais um segundo
`position:absolute` independente), garantindo que ele sempre grude
embaixo do título, não importa o tamanho da fonte/quantas linhas o
resumo ocupa.

**Mesma fonte, pedido explícito ("precisa ter a mesma fonte também")**:
`.catalog-modulo3d-tile-desc` trocou `font-family:"Manrope",sans-serif`
(a 1ª tentativa, antes da correção) por `"Cormorant Garamond",serif` —
IDÊNTICA à do título. Só NÃO copiou o resto do tratamento do título
(caixa alta, `letter-spacing:.14em`) — uma frase inteira nessas
condições ficaria ilegível; manteve peso/tamanho menores, texto normal,
`line-height:1.4`, `text-align:center`, mesmo `text-shadow` pra
legibilidade sobre qualquer fundo do 3D.

Teste de regressão (`tests/catalogo-modulo3d-menu-browser.cjs`): 3
asserções novas — nome fica perto do topo do quadro (distância do topo
< 25% da altura do quadro); resumo fica logo ABAIXO do nome (gap < 24px
entre o fim do nome e o início do resumo, nunca solto no meio);
`fontFamily` computado do nome e do resumo são IDÊNTICOS. Verificado
visualmente com Playwright (screenshot hover) — título no topo, resumo
logo abaixo, mesma fonte serif nos dois. Suíte completa (15 arquivos) +
`tests/creditos-browser.cjs` + `tests/studio-browser.cjs` rodadas de
novo, todas passando.

### 8ª rodada — ícone de fallback removido (era só ruído)

Pedido explícito do usuário, vendo a tela real: *"quando eu entro no
modulo 3d aparece 3 icones um em cada card, pode remover eles, sao
inuteis"*. O ícone (`.catalog-modulo3d-card-icon`, sofá/planta/AR)
existia como FALLBACK — 1ª pintura antes do `<model-viewer>` montar, e
também o que aparecia se o card não tivesse nenhum modelo `.glb`
marcado/disponível. Removido por completo (não só escondido):
`modulo3dCardIcon()`, `MODULO3D_ICONS` (o objeto inteiro com os 3 SVGs)
e toda a CSS de `.catalog-modulo3d-card-icon` (incluindo as entradas nas
regras de transição/hover/`prefers-reduced-motion` que citavam essa
classe) saíram do código. Sem ícone nenhum, um card sem modelo agora
mostra só o fundo do quadro + título/resumo — mais limpo, nada "solto"
tentando preencher o espaço.

Teste de regressão: o cenário de "nenhum item do sistema tem modelo 3D
nenhum" (antes conferia `.catalog-modulo3d-card-icon` count===3) passou
a conferir `.catalog-modulo3d-tile-stage svg` count===0 (nenhum ícone
sobrou) e `.catalog-modulo3d-tile-name` count===3 (título continua
aparecendo mesmo sem nenhum modelo). Suíte completa (15 arquivos) +
`tests/creditos-browser.cjs` + `tests/studio-browser.cjs` rodadas de
novo, todas passando.

### 9ª rodada — carregamento único com percentual real, sem "piscar"

Dois pedidos do usuário, o 2º reforçando/precisando o 1º depois de ver
a implementação inicial: *"depois de eu clicr no modulo 3d na home
quero que tenha um carregamento ali antes de liberar a pagina, pra nao
acontecer de aparecer um 3d ai depois o outro e depois o outro, isso da
a sensacao de lentidao"*, seguido por *"so um lembrete, no momento que o
carregando chegar a 100 os modulso 3d ja precisam aparecer juntos e
carregados ja ao mesmo tempo, nao pode piscar"*.

**Causa do "um aparece, depois o outro"**: os 3 `renderModulo3dModel()`
sempre rodaram em paralelo (`MODULO3D_CARDS.forEach(...)`), cada um
substituindo o conteúdo do PRÓPRIO stage assim que O SEU carregamento
terminava — como o tamanho/latência de cada `.glb` varia por item, eles
raramente terminam ao mesmo tempo, e cada card "estourava" na tela
individualmente.

**Correção, 1ª parte — esconder os 3 até todos resolverem**:
`renderModulo3dMenu()` agora monta o HTML com a classe
`.catalog-modulo3d-menu.is-loading` (esconde `.catalog-modulo3d-explore`
— título+3 cards — via `opacity:0`, atrás de um indicador cobrindo toda
a tela, `.catalog-modulo3d-loading`, `background:#fff`) e só remove essa
classe depois que `Promise.all()` dos 3 `renderModulo3dModel()`
resolver — a função nunca rejeita (já trata sucesso/erro/sem modelo
internamente), então isso sempre acontece, nunca trava.

**Correção, 2ª parte — "não pode piscar" (o pedido mais rigoroso)**:
a 1ª versão removia `.is-loading` assim que os 3 `renderModulo3dModel()`
retornavam — mas essas funções só esperavam o `<model-viewer>` ser
CRIADO e anexado ao DOM, não o modelo terminar de fato de carregar/
desenhar dentro dele (`viewer.src=...` dispara um processo assíncrono
PRÓPRIO do componente — fetch do blob + parse do GLTF + upload pra GPU
— que continua depois que nosso código já retornou). Isso reabria a
mesma sensação de pop-in, só que atrás do véu branco: o spinner podia
sumir com um ou mais cards ainda com o canvas vazio por baixo.
Corrigido fazendo `renderModulo3dModel()` esperar o evento `load` REAL
do `<model-viewer>` (`viewer.addEventListener("load", ...)` — o sinal
oficial de "modelo parseado e pronto pra desenhar", não só o download
do `.glb`) antes de considerar aquele card pronto, **mais 2 frames de
`requestAnimationFrame` de folga** (garante que o navegador já pintou
o 1º quadro de verdade antes de revelar) — só depois disso a
`Promise.all()` externa resolve e a classe `is-loading` sai.

**Percentual REAL, não um spinner genérico** — mesmo princípio já
validado nesta sessão pras notificações "em andamento" do catálogo
("no lugar do círculo girando quero que coloque porcentagem... deve
ser fiel ao tempo que de fato demora"), reaplicado aqui pelo próprio
usuário. Diferença: ali era uma curva assintótica chutada (não existe
NENHUM sinal de progresso real dentro de uma única chamada de IA); aqui
existem 3 conclusões DISCRETAS e genuinamente reais (um card = um
degrau), então o percentual sobe em **33/67/100%** — nunca antes do
card correspondente ter realmente terminado. Visual reaproveita a MESMA
técnica de `.catalog-notification-icon.is-progress` (conic-gradient
mascarado em rosca via variável CSS `--pct`), classe própria
(`.catalog-modulo3d-loading-ring`/`-pct`) sem acoplamento com a das
notificações.

**3 achados reais testando, todos corrigidos no PRÓPRIO teste, não no
produto**: (1) com 2 dos 3 cards caindo no MESMO item por fallback (ex.:
"Realidade aumentada" sem nada marcado cai pro mesmo item que já é capa
do Estúdio), os 2 `<model-viewer>` correspondentes terminam de carregar
tão perto um do outro (mesmo modelo, ambos triviais) que o degrau
intermediário de 33% nunca fica "visível" por tempo suficiente pra um
teste automatizado observar via polling — o JS passa por 33% e chega em
67% dentro do mesmo lote de microtasks, antes de qualquer leitura
externa conseguir capturar o valor intermediário; o teste passou a
esperar o degrau seguinte (67%) em vez do primeiro. (2) mesmo o degrau
de 67% inicialmente usava um delay FIXO por tempo (`setTimeout`) pro 3º
modelo (Lounge) — intermitente (~1 em 5 execuções falhava, mais ainda
rodando dentro da suíte completa sob carga): o `page.waitForFunction`
confirmava "67%" no navegador, mas entre esse round-trip terminar e a
LEITURA seguinte do estado (`isLoading`) já ter ido buscar o snapshot,
o delay do 3º modelo às vezes também já tinha vencido — uma corrida
clássica entre "confirmar uma condição" e "agir em cima dela depois",
mesma classe de bug já documentada nesta sessão noutro teste. Corrigido
trocando o `setTimeout` por um **portão controlado pelo próprio teste**
(`loungeGate`, uma `Promise` que só resolve quando o teste chama
`releaseLounge()`, DEPOIS de já ter confirmado com segurança o estado
intermediário) — o 3º `.glb` fica literalmente parado até o teste
mandar, eliminando a corrida por completo (6/6 execuções seguidas
passando depois da correção, contra falha ~1 em 5 antes).

(3) **Achado numa sessão posterior, rodando a suíte completa sob carga
(não isolado)**: mesmo sem NENHUM delay fixo, os OUTROS 2 modelos
(Estúdio+AR, mesmo item, respondiam instantâneo) ainda causavam uma
corrida — sob carga do sistema (vários navegadores Playwright em
sequência), o tempo entre "clicar" e "1ª leitura do percentual" às
vezes era maior que o tempo real pra os 2 já resolverem por completo
(fetch instantâneo + `ensureModelViewer()` + evento `load` real + 2
frames de RAF), fazendo a asserção `pct==='0%'` falhar com `'67%'` —
mesma classe de corrida do item (2), só que sem nenhum `setTimeout`
envolvido dessa vez, prova de que qualquer resposta NÃO controlada
explicitamente pelo teste é uma corrida em potencial, rápida ou não.
Corrigido replicando o MESMO padrão de portão pro modelo do Estúdio/AR
(`estudioGate`/`releaseEstudioEAr()`) — agora os 3 modelos ficam
retidos até o teste liberar cada um explicitamente, na ordem certa
(Estúdio+AR primeiro, confirmando "67%", só depois Lounge, confirmando
"100%") — nenhuma resposta de rede reage sozinha, sempre sob comando
direto do teste.

Teste de regressão (`tests/catalogo-modulo3d-menu-browser.cjs`): Estúdio
e Realidade aumentada (mesmo item por fallback) e Lounge ficam retidos
nos 2 portões até o teste liberar cada um explicitamente; confirma que
logo ao entrar os 3 cards ficam escondidos (opacity 0) com o percentual
em 0% — SÓ ENTÃO libera Estúdio/AR; confirma o degrau intermediário
(67%, 2 dos 3 prontos) ainda com os cards escondidos — SÓ ENTÃO libera
Lounge; confirma que só depois dos 3 resolverem o percentual chega em
100% E os cards ficam visíveis juntos E os 3 `<model-viewer>.
loaded===true` de verdade (não só presentes no DOM) — a prova concreta
de "não pode piscar". Suíte
completa (15 arquivos) + `tests/creditos-browser.cjs` + `tests/studio-
browser.cjs` rodadas de novo, todas passando.

### 10ª rodada — Lounge com os mesmos 3D "mais escuros" que o normal

Bug real reportado pelo usuário, com print da composição (sofá +
poltronas visivelmente acinzentados/sem saturação): *"dentro do modulo
de lounge eu notei que os 3d estao aparecendo so que mais escuros, nao
sei o que pode ter neles pra deixar assim, mas quero que eles abram nas
cores normais"*.

**Causa raiz, achada comparando a iluminação do Módulo Lounge
(`catalogo-lounge.mjs`) contra a do Estúdio de Ambientes
(`catalogo-studio3d.mjs`, a referência de "cor normal" já validada pelo
usuário em toda esta sessão)**: as DUAS cenas usam o mesmo tipo de luz
(`HemisphereLight` + `DirectionalLight`), mas o Lounge sempre teve
intensidade quase METADE da do Estúdio —
`HemisphereLight(...,1.15)`/`DirectionalLight(...,1.5)` no Lounge contra
`HemisphereLight(...,2.2)`/`DirectionalLight(...,3.2)` no Estúdio. Os
MESMOS materiais/texturas dos itens (mesmos `.glb`, carregados pelo
mesmo `GLTFLoader`) renderizavam mais escuros/acinzentados no Lounge só
porque a cena recebia bem menos luz — nunca foi um problema no próprio
modelo 3D nem nos materiais.

**Corrigido igualando as intensidades às do Estúdio** (`scene.add(new
THREE.HemisphereLight(0xffffff, 0xe7e1d6, 2.2))` /
`new THREE.DirectionalLight(0xffffff, 3.2)`) — só o NÚMERO mudou, cor/
posição das luzes e o resto da cena (piso, parede de fundo, câmera)
ficaram intactos. Cache-busting do import de `catalogo-lounge.mjs`
bumpado dentro de `catalogo.mjs` (`?v=20260919-loungelight`) — é um
import de módulo ES, não uma tag `<script>` em `catalogo.html`, então o
cache-busting mora na própria linha de `import`.

Teste de regressão: `tests/catalogo-lounge-browser.cjs` (não testa cor
de pixel — o fixture usa um GLB triangular sem material/textura, não
daria pra validar brilho de forma significativa) rodado de novo só pra
confirmar que a cena continua montando/funcionando normalmente com a
luz mais forte (nenhuma mudança de comportamento, só de brilho). Suíte
completa (15 arquivos) + `tests/creditos-browser.cjs` + `tests/studio-
browser.cjs` rodadas de novo, todas passando — `catalogo-studio3d.mjs`/
`.css` confirmados intocados (o Estúdio continua sendo só a REFERÊNCIA
de valores, nunca importado/alterado por este módulo).

## Notificação de sucesso com foto em todos os módulos de IA (não só tecido)

Pedido explícito do usuário: *"agora eu quero que a notificacao de todos
os modulos apareca a imagem, iguall é em troca de tecido"*, esclarecido
logo em seguida, quando perguntado o escopo: *"modulos que tem ia que eu
digo"* — ou seja, os 3 recursos que geram uma imagem nova via IA:
"Experimente outro tecido" (já mostrava a foto na notificação, ver seção
"diálogo fecha sozinho + notificação mostra a foto pronta" mais acima),
Painel 3D/Estúdio de Ambientes e Módulo Lounge (os dois SEM a foto até
agora — a notificação de sucesso só tinha texto + botão "Ver resultado",
a foto só aparecia depois de clicar).

**Mudança mínima, reaproveitando o que já existia**: `notify()`
(`catalogo.mjs`, exposta como `window.catalogNotify`) já aceitava um
parâmetro `image` desde a implementação do tecido — só faltava os OUTROS
2 fluxos passarem esse parâmetro. `renderWithAI()`
(`catalogo-studio3d.mjs`) e `renderLoungeWithAI()`
(`catalogo-lounge.mjs`) ganharam `image: src` na chamada de sucesso —
`src` é a MESMA imagem que a IA devolveu, já usada pra preencher o
diálogo de resultado (`#studioResultDialog`/`#loungeResultDialog`);
nenhuma imagem nova é gerada nem buscada só pra notificação, mesmo
padrão já usado pro tecido.

**Esta é a PRIMEIRA vez nesta sessão que `catalogo-studio3d.mjs` foi
alterado de propósito** — até aqui, toda seção do Módulo Lounge/Módulo
3D confirmava explicitamente esse arquivo como referência intocada (ver
"Não mudado" nas seções anteriores). Mudança pontual e de baixo risco:
uma linha adicionada (`image: src`) dentro do objeto já passado pra
`window.catalogNotify?.(...)`, sem tocar em nenhuma outra linha do
arquivo — nem a cena 3D, nem os controles, nem o resto do fluxo de
renderização.

**Não mudado de propósito**: o MECANISMO de exibição continua "fechar o
toast 'em andamento' + abrir um toast novo" nos dois módulos (diferente
do tecido, que morphs o MESMO elemento com `update()` pra garantir que
o percentual bata 100% exatamente no instante em que a foto aparece,
ver "Percentual real..." mais acima) — o pedido foi especificamente "a
notificação aparece a imagem", não "replicar o morph do tecido também";
trocar o mecanismo de toast novo por reaproveitar o mesmo elemento não
foi pedido, e mudaria mais código do que o necessário pra atender o que
foi pedido.

Teste de regressão: `tests/catalogo-browser.cjs` (fluxo de renderização
do Estúdio) e `tests/catalogo-lounge-browser.cjs` (fluxo do Lounge)
ganharam uma asserção cada, logo depois do toast de sucesso aparecer e
ANTES de clicar em "Ver resultado": `.catalog-notification-photo` já
existe com o `src` correto (a mesma imagem devolvida pela IA) — prova
que a foto aparece na notificação em si, não só depois de abrir o
diálogo. Cache-busting bumpado nos 2 imports de módulo ES afetados
dentro de `catalogo.mjs` (`catalogo-studio3d.mjs?v=20260919-notifyimage`,
`catalogo-lounge.mjs?v=20260919-notifyimage`) e na própria tag
`<script>` de `catalogo.mjs` em `catalogo.html`. Suíte completa (15
arquivos) + `tests/creditos-browser.cjs` + `tests/studio-browser.cjs`
rodadas de novo, todas passando.

## Módulo Lounge: coluna esquerda virou abas (Formatos/Itens/Ambiente)

Pedido explícito do usuário: *"dentro do modulo lounge, no lado esquerdo
eu queo que tenha abas, uma aba so pra formatos, uma aba pra itens e uma
aba pra ambiente"*. Antes, as 3 seções (Formatos, Itens, Ambiente — piso/
fundo) ficavam todas empilhadas e sempre visíveis ao mesmo tempo na
coluna esquerda, com "Itens" rolando internamente e "Ambiente" fixo
embaixo (ver seção "Piso + fundo por foto" mais acima). Agora só UMA
seção fica visível por vez, escolhida por uma aba no topo da coluna.

**HTML** (`catalogo.html`): `.catalog-lounge-sidebar` ganhou
`.catalog-lounge-tabs` (3 `<button data-lounge-tab="formats|items|
environment">`, `role="tablist"`/`role="tab"`) logo no topo, e as 3
seções viraram `.catalog-lounge-tab-panel` (`data-lounge-panel="..."`,
`role="tabpanel"`) dentro de um wrapper `.catalog-lounge-tab-panels`. Os
`<h3>` de título por seção (`.catalog-lounge-heading`: "Formatos"/
"Itens"/"Ambiente") foram removidos — o nome da aba já identifica a
seção, mantê-los duplicaria a informação (mesmo raciocínio já aplicado
antes ao rótulo do cabeçalho do catálogo, ver "Título duplicado
removido..." mais acima). Nenhum id interno mudou (`#loungeFormatList`,
`#loungeItemRoles`, `#loungeFloorRow`, `#loungeBgInput` etc. continuam
os mesmos, só a estrutura ENVOLVENDO eles mudou) — o JS de renderização
de cada seção não precisou de nenhuma alteração.

**CSS** (`catalogo-lounge.css`): `.catalog-lounge-tab-panel{display:
none}`/`.is-active{display:flex;flex-direction:column}` decide qual
seção aparece. `.catalog-lounge-tab-panels` (não mais só `.catalog-
lounge-item-roles`) é quem rola agora (`flex:1 1 auto;min-height:0;
overflow-y:auto`) — funciona igual pras 3 abas, mesmo as que antes nunca
precisavam rolar (Formatos e Ambiente eram curtas o bastante pra nunca
estourar a altura disponível). As regras que separavam visualmente as 3
seções empilhadas (`margin-top`/`padding-top`/`border-top` em `.catalog-
lounge-items`/`.catalog-lounge-environment`) foram removidas — sem
seções vizinhas visíveis ao mesmo tempo, não tinha mais nada pra separar.

**JS** (`catalogo-lounge.mjs`): `ui.activeTab` (novo campo no estado,
`"formats"` por padrão — era a 1ª seção no layout antigo) guarda a aba
ativa. `syncLoungeTabs()` (nova função) aplica `.is-active`/
`aria-selected` no botão certo e `.is-active` no painel certo — chamada
de dentro de `renderSidebar()` (então qualquer re-render já mantém a
aba certa sincronizada) e no clique de uma aba (`bindInteractions()`
ganhou o branch `[data-lounge-tab]`, checado ANTES dos outros branches
de clique da barra lateral). Trocar de aba SÓ muda `ui.activeTab` —
não mexe em `ui.formatKey`/`ui.selection`/`ui.floorKey`, então trocar de
aba e voltar nunca perde o que já estava selecionado. `openCatalogLounge()`
reseta `activeTab` pra `"formats"` toda vez que o módulo é reaberto
(mesmo raciocínio de sempre: sessão nova, sem lixo da visita anterior).

**Achado ajustando o teste**: `tests/catalogo-lounge-browser.cjs` já
tinha `.click()` em chips de item (aba "Itens") e no seletor de piso/
botões de foto de fundo (aba "Ambiente") — com as abas, esses elementos
ficam `display:none` até a aba certa ser aberta, e `.click()` do
Playwright exige que o alvo esteja VISÍVEL (diferente de `.count()`/
`.textContent()`/`.allTextContents()`, que continuam funcionando em
elementos escondidos — por isso as asserções de contagem/texto que já
existiam não precisaram de nenhum ajuste). Corrigido adicionando 2
cliques de aba no teste, um pra "Itens" antes da 1ª interação com chip,
outro pra "Ambiente" antes da 1ª interação com piso/fundo — cobrindo
todas as ações de clique subsequentes até o fim do cenário, já que
trocar de aba não é uma ação repetida a cada interação. Ganhou também
3 asserções novas confirmando a mecânica da aba em si (padrão "Formatos"
ativa ao abrir, "Itens" ativa depois do clique, só uma por vez).
Cache-busting bumpado (`catalogo-lounge.css?v=20260919-loungetabs`, e o
import de `catalogo-lounge.mjs` dentro de `catalogo.mjs` +  a própria
tag `<script>` de `catalogo.mjs`, todos pra `?v=20260919-loungetabs`).
Suíte completa (15 arquivos) + `tests/creditos-browser.cjs` + `tests/
studio-browser.cjs` rodadas de novo, todas passando.

### Ajuste imediato: abas coladas na trilha de navegação

Pedido do usuário, com print real: *"ficou muito grudado as abas,
precisa dar um respiro melhor"*.

**Causa raiz, medida no navegador (não só lida no CSS)**: a trilha
(`#catalogBreadcrumb`) flutua por CIMA do conteúdo, `position:absolute`,
sem reservar nenhum espaço no layout (ver seção "Trilha de navegação
abaixo do cabeçalho" mais acima) — ela mede ~27,6px de altura real
renderizada. `.catalog-lounge-sidebar` tinha `padding-top:26px`, MENOR
que isso — medido com `getBoundingClientRect()`: a barra de abas
começava 1,6px ANTES da trilha terminar (sobreposição de verdade, não
só "parecendo" grudado — por pouco não dava pra notar a olho nu, mas o
efeito visual batia exatamente com "grudado").

**Corrigido** aumentando só o `padding-top` de `.catalog-lounge-sidebar`
(26px→44px no desktop, mantendo os outros lados/o padding-bottom
iguais) — dá ~16px de respiro real medido abaixo da trilha. O mesmo
ajuste, proporcional, foi replicado no breakpoint `@media(max-width:
620px)` (`padding-top` de 20px→38px) — sem isso o problema reapareceria
só em telas estreitas, onde a versão anterior desse breakpoint reduzia o
padding de volta a um valor menor que a trilha.

Teste de regressão (`tests/catalogo-lounge-browser.cjs`): nova asserção
logo depois de abrir o módulo, medindo a distância REAL entre
`#catalogBreadcrumb` e `.catalog-lounge-tabs` via `getBoundingClientRect()`
(`tabs.top - breadcrumb.bottom > 10`) — prova o respiro de verdade, não
confia em inspeção visual nem no CSS fonte. Cache-busting bumpado
(`catalogo-lounge.css?v=20260919-loungetabsgap`). Suíte completa (15
arquivos) + `tests/creditos-browser.cjs` + `tests/studio-browser.cjs`
rodadas de novo, todas passando.

## Catálogo lento pra carregar fotos — otimização estratégica de imagens

Pedido explícito do usuário: *"busque formas do catálogo abrir com mais
agilidade, hoje estou notando que demora pra carregar as fotos... quando
eu entro em categorias cada foto carrega em um tempo, isso dá a sensação
de sistema lento... eu quero que as fotos tenha uma qualidade boa, mas eu
preciso que o sistema seja funcional também"*.

**Investigação (sem supor nada, direto no banco/Storage de produção)**:
duas causas reais, corrigidas juntas.

1. **O catálogo sempre serviu o arquivo ORIGINAL, nunca uma versão
   redimensionada** — mesmo um card de 160px na Home baixava a foto
   inteira. Testado direto (`curl`) se o Storage do Supabase deste
   projeto tem a transformação de imagem habilitada (recurso do plano
   Pro): **tem** —
   `/storage/v1/render/image/public/<bucket>/<path>?width=W&quality=Q`
   responde 200, redimensiona/recomprime na hora e fica cacheado no CDN
   da própria Supabase (`CF-Cache-Status: HIT`, `Cache-Control: public,
   max-age=3600`). **Achado extra, importante**: o navegador manda
   `Accept: image/webp` nas próprias requisições de `<img>` (padrão de
   qualquer Chromium/Firefox/Safari moderno) — o transformador da
   Supabase faz *content negotiation* de verdade e devolve WebP nesse
   caso, mesmo pra um arquivo fonte em PNG. Verificado numa das fotos de
   16MB encontradas (item abaixo): original 16,8MB → 380px width **128KB**
   (com o header `Accept` de navegador real) → mais de **130x menor**.
   Sem esse header (ex.: testando com `curl` puro), a mesma transformação
   preserva o formato original (PNG fica PNG) e o ganho é bem menor — não
   confundir um teste de terminal sem esse header com o que vai acontecer
   de verdade no navegador.

2. **Bug real, mais grave: fotos de 8 a 16MB CADA, encontradas direto no
   banco** (`select` nos paths reais de `itens.foto_url`, depois `curl`
   pra medir o tamanho de verdade — não assumido). Causa: tanto o editor
   de recorte do Cadastro de Itens (`itens_gerarImagemFinal()` em
   `Modulos/Estoque/CadastroItens/itens.foto.mjs`) quanto o editor inline
   de fotos direto no catálogo (`cropSessionBlob()` em `catalogo.mjs`,
   ver "Editor de fotos do item, direto no catálogo" mais acima)
   desenhavam o resultado final num `<canvas>` do tamanho quase nativo da
   foto original (`outputScale` calculado a partir do `bitmap.width/
   height` real) e gravavam com `canvas.toBlob(...,"image/png")` — PNG é
   **sem compressão com perdas nenhuma**, então uma foto de celular downscaled pra "quase o
   tamanho original" e ainda assim salva pixel-a-pixel sem compressão
   virava um arquivo gigante. Isso só acontecia ao ARRASTAR/DAR ZOOM na
   foto (o caminho "sem ajuste nenhum" de `itens_gerarImagemFinal()`
   preserva o arquivo original byte a byte, sem passar pelo canvas —
   ficou como estava, decisão documentada de propósito, "Preserve
   resolução, transparência e compressão originais").

**Corrigido nos dois arquivos**: canvas passou a ter um teto de
resolução (`MAX_OUTPUT_DIMENSION`/`MAX_INLINE_CROP_DIMENSION = 2400px`
no lado maior — mais que suficiente pra tela cheia em qualquer monitor
comum, e o transformador do Storage ainda serve uma versão menor em cima
dessa pro catálogo) e o formato de saída virou `image/jpeg` (quality
0.9) em vez de PNG puro — mesma foto, mesma resolução útil, arquivo
ordens de grandeza menor (fotografia de produto não precisa de
compressão sem perdas). Como reduzir width/height sem reduzir
`outputScale` na mesma proporção quebraria o enquadramento do
arrastar/zoom (esse valor também controla o deslocamento `drawX`/`drawY`
do pan), os dois foram escalados pelo MESMO fator. Fundo branco
(`ctx.fillStyle="#ffffff"` antes de desenhar) porque JPEG não tem canal
alpha — sem isso, qualquer sobra transparente no canvas viraria preta em
vez de branca.

**Bug independente encontrado ao trocar o formato**: `applyInlineEdit()`
(`catalogo.mjs`) empacotava o blob resultante do crop sempre como
`new File([blob], "foto.png", { type: "image/png" })` — **fixo**,
ignorando o `.type` de verdade do blob. Antes da correção isso não dava
problema porque o blob SEMPRE era PNG mesmo (mentira inofensiva); ao
trocar `cropSessionBlob()` pra gerar JPEG, esse hardcode continuaria
dizendo "image/png" pro resto do pipeline
(`trocarFotoPrincipal`/`trocarFotoSlot` decidem extensão/content-type a
partir desse `.type`) — geraria um arquivo `.png` com bytes de JPEG
dentro, content-type errado. Corrigido lendo `blob.type`/
`extensaoItemFoto(blob.type)` de verdade. **Só achado por ler o código
que consome o blob, não seria visível testando só o tamanho do arquivo.**

**Correção de leitura, sem mexer em upload nenhum**: `otimizarFoto(url,
width, quality=74)`, uma função nova em `catalogo.mjs` (duplicada em
`catalogo-biblioteca.mjs`/`catalogo-lounge.mjs`/`catalogo-studio3d.mjs`
— cada um self-contido de propósito, mesmo padrão de ícones/helpers já
duplicados entre esses arquivos nesta sessão) que reescreve uma URL
pública do Storage (`/storage/v1/object/public/...`) pra pedir a versão
transformada (`/storage/v1/render/image/public/...?width=...&quality=
74`) em vez do arquivo cru. Passa direto, sem mexer em nada, qualquer
URL que não seja do Storage (`data:`, `blob:`, o SVG do placeholder "Sem
foto") — não precisa de nenhum caso especial pra esses. Resolve fotos
JÁ CADASTRADAS (mesmo as de 16MB do bug acima) sem precisar reprocessar
nem uma linha do banco — o Storage transforma e cacheia na hora.

Larguras escolhidas por contexto (`IMG_WIDTH` em `catalogo.mjs`): `hero:
1600` (foto principal/ambientada em tela cheia — o `<img>` que o usuário
realmente olha de perto), `gateway: 1920` (foto do Portal, full-bleed),
`card: 380` (cards da Home/grade), `mosaic: 640` (colunas do mosaico),
`thumb: 160` (itens relacionados), `swatch: 110` (círculos de cor),
`toast: 340` (foto da notificação); os pickers pequenos de item em
Lounge/Estúdio 3D usam 120-160 direto, sem constante própria (números
soltos, únicos naquele contexto).

**Cuidado central pra não quebrar nada**: `otimizarFoto()` NUNCA é
aplicado em cima do valor guardado no objeto do item
(`item.photo`/`detail.img`/`event.img`) — só no exato ponto de montar o
atributo `src` visível. Dois consumidores dependem da URL CRUA: (1) o
editor de recorte inline (`startInlineEdit`) faz `fetch()` direto em
`item.photo` pra carregar a foto atual e deixar a pessoa ajustar — se
fosse a versão pequena, a pessoa editaria em cima de uma imagem já
degradada; (2) `generateFabricVariation()` (Experimente outro tecido)
manda `scene.preview: item.photo` como referência pra IA — mandar uma
miniatura de 380px pra IA usar como referência do móvel seria um
downgrade de qualidade sério, sem ninguém pedir. `mainSlides()` resolve
isso com dois campos por slide: `src` (transformado, só exibição) e
`rawSrc` (a URL crua, vai pro `data-original-src` — não lido em lugar
nenhum hoje, mas mantido fiel ao próprio nome pra não confundir leitura
futura).

**Extra, baixo risco**: `<link rel="preconnect">`/`dns-prefetch` pro
domínio do Supabase Storage no `<head>` de `catalogo.html` — adianta
DNS+TLS antes mesmo da primeira `<img>` ser descoberta pelo parser.

**Não mexido, fora do escopo desta rodada**: o caminho "sem ajuste" de
upload (`gerarBlobImagemSlot()` em `itens.foto.mjs`, e o upload direto de
fotos da Biblioteca em `catalogo-biblioteca.mjs`) continua preservando o
arquivo como a pessoa mandou, sem compressão — decisão documentada antes
desta sessão, e a leitura via `otimizarFoto()` já resolve a velocidade de
EXIBIÇÃO independente do tamanho do arquivo salvo. Se o custo de
armazenamento no Storage virar um problema à parte, é uma tarefa
diferente (comprimir no upload), não decidida aqui.

Testes ajustados pela troca PNG→JPEG do editor de recorte (extensão do
arquivo de saída mudou de `.png` pra `.jpg`):
`tests/catalogo-editor-fotos-browser.cjs` (upload da foto principal) e
`tests/catalogo-portal-browser.cjs` (cenário "Ajustar foto" da capa do
Portal, que usa o MESMO `cropSessionBlob()`). Suíte completa de
regressão do catálogo (15 arquivos) + `tests/creditos-browser.cjs` +
`tests/studio-browser.cjs` rodadas de novo, todas passando. Cache-busting
bumpado em `catalogo.mjs` (import interno dos 3 módulos +
`catalogo.html`) e nos dois pontos que importam `itens.foto.mjs`
(`cadastro-itens.mjs`, `item-detalhes.mjs`), todos pra
`?v=20260919-imgotimizada`.

### Bug real, achado pelo usuário logo depois de publicado: fotos cortadas/esticadas

Usuário reportou com print (grade de categorias da Home, várias fotos
mostrando só uma fatia vertical estreita do móvel em vez da foto
inteira): *"depois dessa atualização que você fez as fotos ficaram
cortadas"*. Bug real introduzido pela própria otimização acima, não
impressão — investigado direto contra o Storage de produção antes de
mexer em qualquer código (`curl` comparando dimensões reais via `file`,
não só tamanho em bytes, que é o que tinha sido conferido antes de
publicar e por isso não pegou o problema).

**Causa raiz**: `otimizarFoto()` pedia só `width` ao transformador do
Supabase, sem `resize`. Sem esse parâmetro, o resizing_type default
(`fill`) **mantém a ALTURA ORIGINAL inteira** e só encolhe a largura —
uma foto de 5215×4032px virava 1600×4032 (achatada/cortada), não
1600×1237 (proporcional). Confirmado testando várias combinações de
parâmetros direto contra o endpoint: `width` sozinho falha,
`width+resize=contain` funciona (calcula a altura sozinho a partir da
proporção real do arquivo, sem precisar informar height), e
`width+height` também funciona mas exigiria calcular a proporção no
cliente pra cada foto — `resize=contain` é a solução mais simples.

**Corrigido** adicionando `&resize=contain` fixo em `otimizarFoto()` —
a MESMA função, duplicada nos 4 arquivos (`catalogo.mjs`,
`catalogo-biblioteca.mjs`, `catalogo-lounge.mjs`,
`catalogo-studio3d.mjs`), então uma correção só precisou ser replicada
nos mesmos 4 lugares. Verificado batendo de novo no Storage real: a
mesma foto do bug (16,8MB original) virou 1600×1237 (proporção correta,
igual ao original) em vez de 1600×4032. Suíte completa de regressão do
catálogo (16 arquivos) + `tests/creditos-browser.cjs` + `tests/
studio-browser.cjs` rodadas de novo, todas passando (nenhum teste
automatizado pegou esse bug sozinho, porque os fixtures dos testes usam
domínios que não batem com o padrão `/storage/v1/object/public/`, então
`otimizarFoto()` nunca transformava nada neles — só o teste contra o
Storage real revelou o problema; ver seção seguinte sobre o novo teste
de zoom, que passou a usar URLs de fixture no formato certo justamente
por causa disso).

**Lição pra qualquer otimização de imagem futura nesta sessão/projeto**:
não basta conferir que o TAMANHO em bytes caiu — precisa confirmar as
DIMENSÕES reais do arquivo resultante (`file`/`identify`/abrir a imagem
de verdade), porque um arquivo bem menor ainda pode estar
CORTADO/DISTORCIDO, o que é um problema pior que "não otimizou".

## Visualizador de zoom da foto (clique abre em resolução bem maior)

Pedido explícito do usuário, na mesma conversa da otimização de
carregamento: depois de entender que a foto exibida normalmente virou
uma versão reduzida (pro catálogo carregar rápido), perguntou *"eu vou
ver ela em baixa qualidade no html?"* e, na sequência, *"eu quero que a
pessoa possa dar zoom e de fato ver os detalhes"*. Perguntado (via
AskUserQuestion) se bastava um zoom nativo mais nítido (só aumentar a
resolução/qualidade servida) ou se queria um visualizador dedicado tipo
loja grande — resposta: **lupa/visualizador dedicado**.

**Como funciona**: clicar na foto principal (qualquer slide do
carrossel — principal ou Detalhe) ou na foto Ambientada, dentro da
visualização imersiva, abre `#catalogPhotoZoomDialog` — um `<dialog>`
em tela cheia, fundo preto (diferente do branco do resto do catálogo,
de propósito — padrão universal de visualizador de foto, deixa a foto
ser o centro das atenções), mostrando a MESMA foto numa resolução bem
maior (`IMG_WIDTH.zoom = 3200`, `IMG_QUALITY_ZOOM = 90` — perto do
arquivo original, mas ainda passando pelo transformador do Storage, não
o arquivo cru de verdade, que nos casos do bug de PNG gigante ainda
chegaria a vários MB). **Carregada só nesse clique, nunca pré-
carregada** — não pesa a navegação normal, que é exatamente o que a
otimização de leitura documentada acima resolveu.

**De onde vem a URL**: sempre de `data-original-src` do elemento
clicado — o atributo que já existia (`.product-main-image`) ou que
ganhou nesta mudança (`.product-event-image`) guardando a URL CRUA
(nunca a já otimizada que está no `src` em tela, ver "Cuidado central"
na seção anterior). Slot vazio (placeholder "+" de Detalhe, equipe
interna) e o placeholder genérico "Sem foto" nunca abrem o zoom — nada
pra ampliar.

**Interação — arrastar/roda/botões, sem depender do zoom nativo do
navegador**: `transform:translate()+scale()` no próprio `<img>`, dirigido
por Pointer Events (arrastar) e `wheel` (zoom contínuo) + botões +/-/
redefinir (mesma linguagem visual — ícones, cores translúcidas — já
usada nos controles do Módulo Lounge/mini-menu Módulo 3D). Zoom nativo
do navegador (pinça no celular, Ctrl+scroll no desktop) continua
funcionando por cima disso, sem nenhum bloqueio — o `<meta viewport>` do
catálogo nunca desativou isso.

**Fecha e reseta**: botão próprio, clique fora (`::backdrop`) ou Esc
(comportamento nativo de `<dialog aria-modal>` aberto via
`showModal()`) — o evento `close` do próprio `<dialog>` (dispara em
qualquer um dos 3 casos) é quem rereseta `scale`/`x`/`y`, então reabrir
depois nunca começa "herdando" o zoom/posição de uma sessão anterior.

**Não conflita com a edição (equipe interna)**: o lápis de editar
(`.catalog-inline-edit-badge`) e as setas do carrossel
(`.product-main-nav`) são elementos IRMÃOS da `<img>`, nunca filhos —
clicar neles nunca alcança o `closest(".product-main-image")` que abre
o zoom, então continuam disparando só o comportamento de sempre
(editar/navegar), sem precisar de nenhuma exclusão explícita no código.

Teste de regressão novo: `tests/catalogo-zoom-foto-browser.cjs` — clique
abre com `width=3200&resize=contain` (nunca igual à URL pequena que já
estava na tela); arrastar reflete no `translate()`; roda e os botões +/-
mudam o `scale()` de verdade; redefinir volta ao estado inicial exato;
fechar (botão ou Esc) reseta o zoom pra próxima abertura; foto
Ambientada abre com a URL certa (não confunde com a principal); lápis de
edição continua abrindo o editor, não o zoom; slot vazio não abre nada;
sem overflow mobile. **Achado ajustando o próprio teste, não bug de
produto**: a 1ª versão esperava só `dataset.activeSlot` mudar antes de
checar a classe `is-empty-slide` do slide seguinte — só o `dataset`
muda na hora (síncrono), a troca de `src`/classe do `<img>` acontece
depois do crossfade de 120ms (`commit()` em `renderMainSlide()`) — uma
corrida real que só aparecia por causa do timing certo, corrigida
esperando a própria classe mudar em vez do dataset. **Fixtures deste
teste usam URLs no formato `https://fixture/storage/v1/object/public/
...`** (não só `https://fixture/...`) de propósito — só assim
`otimizarFoto()` de verdade transforma a URL; um domínio de fixture sem
esse trecho no caminho faria a função devolver a URL sem nenhuma
transformação, e o teste não provaria nada sobre o comportamento real
(mesma lição do bug de corte acima, que nenhum teste antigo pegou por
esse motivo). Suíte completa de regressão do catálogo (17 arquivos,
agora incluindo este) + `tests/creditos-browser.cjs` + `tests/
studio-browser.cjs` rodadas de novo, todas passando.

## Setas de voltar/avançar no cabeçalho (histórico de navegação)

**Superado pela seção "Linha do tempo das telas visitadas" mais abaixo** —
os botões de seta (`#catalogNavBack`/`#catalogNavForward`, `.catalog-nav-
history-*`, `navigateHistory()`, `updateNavHistoryButtons()`) não existem
mais; o MODELO de histórico descrito aqui (pilhas voltar/avançar, navegação
nova descarta as "seguintes", `navSuppress`, hook em `renderBreadcrumb()`)
continua valendo e virou a base da linha do tempo. Mantido por completo
abaixo pelo raciocínio.

Pedido explícito do usuário: *"ali na parte de cima onde tem estofados,
home no menu, quero que tenha uma seta uma pra cada lado de avançar e
voltar... pra pessoa saber onde ela está, aí embaixo disso escrito
voltar acho que pode ter o nome da tela anterior e no avançar a mesma
coisa"*. Perguntado (via AskUserQuestion, com preview visual dos dois
formatos) se preferia compacto/mesma linha ou seta-em-cima-nome-embaixo
(2 linhas, na faixa abaixo do cabeçalho) — respondeu **compacto, na
mesma linha**, já que o cabeçalho tem altura FIXA (ver [[project-acervo-
navbar-limits]] na memória de longo prazo — nunca crescer o cabeçalho) e
um bloco de 2 linhas não caberia nela. Ajuste rápido em seguida: *"na
home não precisa ter esses botões, só nos outros"* — "Home" aqui é o
rótulo do PORTAL no cabeçalho (`GATEWAY_VIEW`), não a grade de
categorias (que no rótulo chama "Categoria").

**Histórico, não hierarquia**: modelo igual voltar/avançar de navegador
— diferente da trilha `#catalogBreadcrumb` (que segue Catálogo/
Categoria/Item, a HIERARQUIA), aqui é a ORDEM REAL em que a pessoa
navegou, então "voltar" pode levar de uma categoria de volta pra Home,
da Home pro Portal, do Portal pra Biblioteca se foi por ali antes, etc.
`state.navBack`/`state.navForward` guardam `{activeView, overlay}` (o
suficiente pra restaurar via `applyView()`/`openBibliotecaOverlay()`/
`openStudioOverlay()`/`openLoungeOverlay()` — não tenta preservar
scroll/item em foco/filtro de subcategoria, só o nível de "tela"
descrito pelo usuário).

**Um hook só, sem tocar em cada navegação**: `trackNavHistory()` é
chamado de dentro de `renderBreadcrumb()` — o MESMO ponto central já
usado por toda navegação do catálogo (`applyView`, `setActiveOverlay`,
scroll entre seções, busca), então não precisou adicionar chamada em
cada lugar que muda de tela. Compara a tela atual contra
`state.navCurrent`: se mudou, empilha a ANTERIOR em `navBack` e limpa
`navForward` (igual navegador: uma navegação nova descarta o "avançar"
antigo). **Achado útil, não um bug**: `applyView()` chama
`renderBreadcrumb()` DUAS vezes por navegação (uma vez dentro de
`setActiveOverlay(null)`, outra no final) — o guard de "é a mesma tela?"
já existia pra proteger contra o scroll disparando renderBreadcrumb()
repetidamente, e também cobre essa chamada duplicada de graça (a 2ª
chamada vê a tela já igual à que acabou de registrar, vira no-op).

**Clicar em voltar/avançar não deve empilhar de novo**: `state.
navSuppress` fica `true` só durante `navigateHistory()` — evita que
restaurar uma tela (que também passa por `renderBreadcrumb()`) seja
tratado como "navegação nova" e crie um loop (voltar empilhando de volta
a mesma tela que acabou de sair).

**Legenda de cada seta** (`screenLabelFor(screen)`, extraído de
`updatePageLabel()` pra virar reaproveitável com qualquer `{activeView,
overlay}`, não só o atual) mostra o nome da tela PRA ONDE aquela seta
levaria — "voltar" = topo de `navBack`, "avançar" = topo de
`navForward`. Cada botão fica desabilitado (não escondido) quando a
pilha correspondente está vazia — só as DUAS setas juntas somem no
Portal.

**Formato compacto escolhido**: seta + nome pequeno do lado, na MESMA
linha do rótulo grande (`#catalogPageLabel`), sem aumentar a altura do
cabeçalho — `color:inherit`/`currentColor`, igual o resto do cabeçalho,
funciona tanto no tema escuro padrão quanto no claro de
`body.catalog-modo-sistema` sem regra própria pros dois casos. Nome da
tela some em telas ≤1200px (mesmo breakpoint onde o resto do cabeçalho
já fica apertado) — sobra só o ícone, testado que não estoura o
cabeçalho nem no mobile.

Teste de regressão novo: `tests/catalogo-nav-history-browser.cjs` —
somem no Portal; aparecem com o nome certo ao sair dele (voltar =
"Home"); entrar numa categoria muda a legenda de voltar pra "Categoria";
clicar voltar retorna de verdade E preenche avançar com o nome de onde
saiu; clicar avançar retorna àquela tela; navegar pra uma categoria
DIFERENTE depois de ter usado voltar descarta o avançar antigo (prova
que não é só um "toggle" entre 2 telas, é uma pilha de verdade);
overlays (Biblioteca) entram no histórico igual qualquer outra tela;
ícone-only (`display:none` na legenda, não só menor) em 1100px; sem
overflow mobile. Suíte completa de regressão do catálogo (18 arquivos,
agora incluindo este) + `tests/creditos-browser.cjs` + `tests/
studio-browser.cjs` rodadas de novo, todas passando. Cache-busting
bumpado (`catalogo.css`/`catalogo.mjs` em `catalogo.html`, pra
`?v=20260919-navhistoria` — os 3 módulos self-contidos importados por
`catalogo.mjs` não mudaram nesta rodada, mantiveram a versão anterior).

### Rótulo da tela sempre no centro EXATO da tela (não da coluna do cabeçalho)

Pedido explícito do usuário, com print de "CADEIRAS" ~60px à direita do
centro: *"o nome da página que eu estou no menu ela sempre deve ficar
centralizada, sempre"*. Junto, outro ajuste pequeno: o rótulo da grade de
categorias (`HOME_VIEW`) passou de "Categoria" pra **"Categorias"**
(plural — `screenLabelFor()`; o singular continua só no campo "Categoria"
do painel técnico do item e no texto reserva de categoria sem nome).

**Causa raiz**: `.catalog-navigation` era um item do grid do cabeçalho
(`grid-area:categories`), na coluna entre a marca (esquerda) e a busca +
usuário (direita) — o rótulo ficava centralizado só DENTRO dessa coluna,
que nunca é simétrica na tela (à direita ocupa ~219px sem o bloco do
usuário/~329px com ele; à esquerda ~198-224px), e ainda por cima a seta
"voltar" com legenda (mais larga que a "avançar" vazia) empurrava o texto
mais um pouco. Medido com Playwright, não só lido no CSS.

**Corrigido** tirando `.catalog-navigation` do fluxo do grid: `position:
absolute;left:50%;transform:translateX(-50%)` dentro de `.catalog-header`
(que ganhou `position:relative`), com largura `100% - 2×--nav-gutter`
(`350px` acima de 1450px, `224px` até 1450px — calibrados com a largura
REAL ocupada pela marca e pela busca+usuário em cada faixa, não chutados)
e, por dentro, um grid `minmax(--nav-side,1fr) auto minmax(--nav-side,1fr)`
(colunas laterais IGUAIS → o texto fica no meio mesmo com uma seta mais
larga que a outra ou escondida). **Cada item tem `grid-column` explícito**
(1/2/3) — sem isso, esconder as setas (`display:none` no Portal) faria o
rótulo cair na 1ª coluna. `--nav-side` é `140px` com a legenda das setas
visível (≥1201px, reserva o espaço da legenda pra ela nunca sobrepor a
marca num nome longo) e `28px` sem legenda.

**Efeito colateral corrigido**: em `body.catalog-modo-sistema` (aberto de
dentro do dashboard, cabeçalho `display:flex`, marca e usuário escondidos)
quem empurrava a busca pra direita era o `flex:1` da navegação — com ela
fora do fluxo, a busca ia parar no canto ESQUERDO. Corrigido com
`margin-left:auto` na busca nesse modo.

**Exceção real, não escondida: celular (≤767px)** volta ao fluxo normal do
grid (`position:static`) — marca (~110px) + bloco do usuário (~60px) já
ocupam ~metade dos 390px e são assimétricos, então centralizar de verdade
na tela deixaria só ~125px pro nome ("CADE…"). No celular o nome continua
centralizado ENTRE as duas setas, mas pode ficar até ~40px fora do centro
da tela. Se pedirem centralização exata também no celular, precisa
decidir antes o que sacrificar (tamanho da fonte do nome, ou esconder as
setas).

Verificado medindo `getBoundingClientRect()` em 13 larguras (390–1920px) ×
3 cenários (decorador com bloco de usuário e nome curto, sem bloco de
usuário e nome longo "Banquetas e Bistrôs Altos", modo dentro do
sistema): desvio do centro = 0px em TODAS as larguras ≥768px, sem
sobreposição com a marca nem com a busca/usuário. Testes:
`tests/catalogo-nav-history-browser.cjs` (Portal sem setas, grade de
categorias e categoria com só um lado com legenda, a 1600px e 1280px —
desvio ≤1px) e `tests/catalogo-editor-fotos-browser.cjs` (modo dentro do
sistema: centralizado e busca continua à direita); `tests/catalogo-
portal-browser.cjs`/`catalogo-menu-browser.cjs`/`catalogo-nav-history-
browser.cjs` ajustados pro texto "Categorias". Cache-busting
`?v=20260919-centrorotulo`.

## Linha do tempo das telas visitadas (substitui as setas de voltar/avançar)

Pedido explícito do usuário: *"no menu eu quero algo conceitual, eu quero
que forme tipo uma linha do tempo com todas as páginas que eu acessei,
então por exemplo, a primeira seria home, a segunda seria categorias, a
terceira seria bares, entendeu? mas algo que é muito importante, a minha
tela que eu estou agora ela deve ser sempre centralizada e do jeito que
está hoje. uma coisa legal também seria se quando eu mudasse de página
rolasse um efeito no menu trocando de uma tela pra outra, tipo uma
rolagem"*.

**Decisões tomadas sem perguntar (interpretação mais natural do pedido —
se estiverem erradas, cada uma é pequena de desfazer)**: (1) as setas
antigas SAÍRAM — clicar numa entrada vizinha da linha do tempo já é
voltar/avançar, e clicar numa mais distante pula várias telas de uma vez;
(2) a linha do tempo mostra as telas ANTERIORES à esquerda E as
SEGUINTES (as que ficaram "à frente" depois de voltar) à direita, igual
um navegador — não só o que já foi visitado; (3) **no Portal ("Home")
as laterais somem** (só o nome, centralizado) — mesmo pedido que já
valia pras setas ("na home não precisa ter esses botões, só nos outros");
é só a regra `.catalog-navigation.is-portal .catalog-timeline-side{
visibility:hidden}` se quiserem mostrar as entradas ali também.

**Estrutura** (`catalogo.html`): `.catalog-navigation` agora tem 3
filhos — `#catalogTimelinePast` (anteriores), `#catalogPageLabel` (a
tela ATUAL, o mesmo elemento de sempre, com `data-entry-id`) e
`#catalogTimelineFuture` (seguintes). São as 3 colunas do MESMO grid
`minmax(--nav-side,1fr) auto minmax(--nav-side,1fr)` da centralização
(ver "Rótulo da tela sempre no centro EXATO" acima) — por isso a tela
atual continua no centro exato, mesmo tamanho, mesma fonte, sem nenhuma
regra nova pra ela; medido: desvio 0px em todas as larguras ≥768px.
As laterais só mostram o que couber: as entradas transbordam pra FORA
(anteriores alinhadas à direita, seguintes à esquerda), e o próprio
`.catalog-navigation` recorta o excesso (`overflow:hidden`) e esmaece as
pontas com `mask-image` (`--nav-fade`, 56px, 28px em ≤1200px). Sem
`overflow:hidden` nas laterais em si — a animação faz o nome atual
ENCOLHER e deslizar pra dentro de uma lateral, e um recorte ali
esconderia esse trajeto. Cada entrada fica mais apagada quanto mais longe
da atual (`--d` → `opacity:max(.14,calc(.7 - (var(--d) - 1) * .2))`); o
separador "›" é um pseudo-elemento (`::after` nas anteriores, `::before`
nas seguintes) pra acompanhar a entrada durante a animação.

**Modelo de dados** (`catalogo.mjs`): cada entrada é `{id, activeView,
overlay}` (o `id` vem de `navEntrySeq`, é o que deixa a animação
reconhecer a MESMA entrada entre uma renderização e a seguinte).
`state.navBack`/`navCurrent`/`navForward` guardam entradas (antes eram
telas sem id). `trackNavHistory()` (chamado de `renderBreadcrumb()`, agora
ANTES de `updatePageLabel()` — a animação precisa medir o rótulo com o
texto antigo ainda no lugar) cria a entrada nova quando a tela muda;
`jumpToHistoryEntry(id)` (substitui `navigateHistory()`) recompõe
`[...voltar, atual, ...avançar]` em torno do alvo, com `navSuppress` ligado
durante a restauração. A lista tem teto (`TIMELINE_MAX_HISTORY=60` no total,
`TIMELINE_MAX_SIDE=14` desenhadas por lado). É o histórico REAL, com
repetição — Home › Categorias › Mesas › Home › Categorias aparece assim,
cada visita é uma entrada.

**Animação de "rolagem"** (`renderTimeline()`/`animateTimeline()`, técnica
FLIP com Web Animations API, sem biblioteca): antes de mexer no DOM,
`timelineSnapshot()` mede posição/largura/opacidade de cada entrada
visível e do rótulo, por `id`; depois de redesenhar, mede de novo e anima
cada elemento do lugar antigo pro novo (`translate` + `scale` pela razão
de larguras, `640ms cubic-bezier(.22,1,.36,1)`) — o nome que era o atual
ENCOLHE e desliza virando uma entrada, e a entrada que foi clicada CRESCE
e assenta no centro; uma tela nova (sem `id` anterior) entra deslizando
90px vinda da direita. Só redesenha/anima quando a assinatura (ids +
rótulos) muda — `renderBreadcrumb()` roda várias vezes por navegação
(`applyView` chama 2×, e o scroll entre itens também) e nada disso pode
reiniciar a animação. `prefers-reduced-motion:reduce` desliga tudo (troca
seca). Medido quadro a quadro: o nome novo vai de cx=890 pra 800 (centro
exato da tela de 1600px) e o nome antigo de 800 pra 649, virando entrada.

**Celular (≤767px)**: mesma exceção já documentada pro centro exato — o
nome fica no fluxo do grid, e cada lado vira só uma seta (‹ ›) da entrada
VIZINHA (`.is-near`), clicável, pra continuar dando pra voltar/avançar;
laterais vazias ou no Portal somem (`display:none`). Só o nome novo anima
(entra de fora); as entradas não fazem FLIP.

**Bug real achado pela suíte, corrigido**: no celular o nome novo entra
com `translateX` — `transform` conta pro overflow de rolagem, então sem
recorte a página GANHAVA rolagem horizontal por ~0,6s a cada troca de tela
(`tests/catalogo-portal-browser.cjs`, "Portal sem overflow horizontal no
mobile", falhou). Corrigido com `overflow:hidden` em
`.catalog-navigation` também no celular; o teste novo mede o
`scrollWidth` DOIS QUADROS depois de trocar de tela (com a animação ainda
no começo — conferindo que ela está mesmo rodando) e foi verificado que
falha se o recorte for desligado.

Testes: `tests/catalogo-nav-history-browser.cjs` reescrito por completo
(Portal com laterais escondidas e nome centralizado; entradas na ordem
real; clicar volta/avança/pula 2 telas de verdade; navegação nova descarta
as "seguintes"; repetição de telas; Biblioteca como entrada e fechando ao
voltar; animação rodando no 1º quadro com o nome ainda fora do centro e
assentando em ≤1px; centro exato em 1600/1280/1100px; celular com só a
seta vizinha e sem overflow — inclusive no meio da animação;
`reducedMotion:"reduce"` sem nenhuma animação) e `tests/catalogo-editor-
fotos-browser.cjs` (centro no modo dentro do sistema) passou a esperar o
fim da animação do rótulo — só a DO RÓTULO, não `document.getAnimations()`,
porque outras animações da tela (faixa de itens relacionados) são
infinitas. Cache-busting `?v=20260919-linhadotempo3`.

## Módulo 3D: cards renomeados e sem frases de descrição

Pedido explícito do usuário, olhando o mini-menu (em 2 mensagens seguidas,
a 2ª cancelando parte da 1ª): *"agora eu quero mudar o nome dos recursos
3d, o primeiro eu quero que se chame 3D Livre, algo nesse sentido, e na
descrição você coloca que é indicado pra fazer montagens de espaços
inteiros; o do meio você coloca que composições, e na descrição coloca
que esse módulo é indicado pra testar composições novas, não só testar
composições que nós indicamos, mas pra criar composições também, sair do
óbvio; e o último você tira o nome e coloca em desenvolvimento e sem
descrição em baixo"* — e, ainda no meio do trabalho: *"faz o seguinte,
retire as frases, deixe somente os títulos"*.

**Resultado final**: os 3 cards mostram SÓ o título — "3D Livre" (antigo
Estúdio de Ambientes), "Composições" (antigo Módulo Lounge) e "Em
desenvolvimento" (antiga Realidade aumentada, que perdeu o próprio nome).
**Nenhuma frase de descrição em nenhum card**, e o selo "Em breve" que
ficava embaixo do card indisponível também saiu (o título já diz isso).

**As frases da "7ª rodada" do mini-menu foram REMOVIDAS por completo, não
só escondidas** (ver "Mini-menu Módulo 3D: um modelo 3D por card" acima —
o resumo revelado no hover, `card.description`): campo `description` de
`MODULO3D_CARDS`, `modulo3dCardDescMarkup()`, as regras
`.catalog-modulo3d-tile-desc` (repouso invisível + revelado no hover) e as
asserções do teste que mediam fonte/posição/opacidade do resumo. Se um dia
pedirem frases de novo, é reescrever esse mecanismo (o histórico do git
tem a versão).

**Nome do módulo vs. título exibido** (`MODULO3D_CARDS`, `catalogo.mjs`):
`label` é o NOME do módulo; `title` (só o 3º card) é o que aparece escrito
no quadro quando é diferente do nome. Assim "Em desenvolvimento" sai do
card sem tirar o nome da Realidade aumentada dos botões de marcar o
modelo em destaque (`capaModulo3dToggleMarkup()`, só equipe interna) — a
equipe continua sabendo qual slot é qual.

**O nome novo vale em TODA parte que mostra o módulo**, não só nos
cards — `modulo3dLabel(key)` (novo helper, lê `MODULO3D_CARDS`) alimenta
o rótulo grande do cabeçalho, a trilha "Catálogo / Módulo 3D / 3D Livre" e
a linha do tempo (antes eram textos soltos "Painel 3D"/"Módulo Lounge"
repetidos em `screenLabelFor()` e em 2 pontos de `renderBreadcrumb()`),
mais os `aria-label` de `#catalogStudio` ("3D Livre") e `#catalogLounge`
("Composições") em `catalogo.html`. Decisão tomada sem perguntar: clicar
em "3D Livre" e ver o cabeçalho dizer "Painel 3D" seria incoerente. Os
comentários internos dos arquivos ainda dizem "Painel 3D"/"Estúdio de
Ambientes"/"Módulo Lounge" (nome de trabalho no código e neste arquivo) —
os nomes de arquivo (`catalogo-studio3d.mjs`, `catalogo-lounge.mjs`) e as
chaves (`estudio`, `lounge`, colunas `capa_modulo3d_*`) NÃO mudaram.

Testes ajustados pros nomes novos: `tests/catalogo-modulo3d-menu-browser.
cjs` (títulos exatos dos 3 cards, `Em desenvolvimento` sem selo e sem
nenhum outro texto dentro do card, zero `.catalog-modulo3d-tile-desc` na
tela; assertivas do resumo no hover removidas), `tests/catalogo-lounge-
browser.cjs`, `tests/catalogo-breadcrumb-browser.cjs` e `tests/catalogo-
portal-browser.cjs` (rótulo/trilha "3D Livre" e "Composições").
Cache-busting `?v=20260919-nomes3d`.

## Fontes do catálogo inteiro aumentadas (piso de 12px)

Pedido explícito do usuário, depois de uma reunião com o cliente (com prints
da linha do tempo do cabeçalho, da trilha, dos rótulos CATEGORIA/MATERIAL/
COR/CÓDIGO, das dimensões "380 × 110 × 55 cm" e do botão "DEFINIR COMO CAPA
DE ..."): *"a fonte do catálogo inteiro precisa aumentar pra ficar
confortável a leitura — encontre essas fontes que estão pequenas e ajuste
elas pra ficar algo confortável"*.

**Como foi achado o que estava pequeno (não por leitura de CSS)**: um script
Playwright percorreu Portal, Categorias, grade, mosaico, item imersivo
(decorador e equipe), "Experimente seu tecido", Biblioteca, Módulo 3D, 3D
Livre, Composições e o login do cliente, e listou todo texto VISÍVEL com
`getComputedStyle().fontSize` abaixo de 15px. Resultado: 64 grupos de 7,4px a
14,7px — o pior eram os nomes de cor sob os círculos (7,4px), "SOB MEDIDA"
(7,7px), rótulos das especificações (8,6px), "Trocar foto" (9,3px), a trilha
(9,6px), a linha do tempo (9,9px) e as dimensões do item (10,9px).

**Uma escala só, monotônica, aplicada a todo `font-size` < 16px** dos 5 CSS do
catálogo (`catalogo.css`, `catalogo-biblioteca.css`, `catalogo-lounge.css`,
`catalogo-studio3d.css`, `catalogo-creditos.css`; 172 declarações — `font-size:`
e o tamanho dentro de `font:`): interpolação linear onde **7px vira 12px e
16px continua 16px**, arredondada em passos de 0,5px (na prática: 7–8px →
12–12,5px; 9,6px → 13px; 10,9px → 13,5px; 12,5px → 14,5px; 14px → 15px).
Monotônica de propósito: a hierarquia entre tamanhos continua a mesma (o que
era menor continua menor), só o piso subiu. `clamp()` e tudo que já era ≥ 16px
(títulos, nome da página no cabeçalho) ficaram intocados. Se o cliente ainda
achar pequeno, a mudança é subir o piso e reaplicar a escala inteira, não
mexer regra por regra — mas atenção: a escala foi aplicada UMA vez sobre os
valores originais; rodar de novo em cima do resultado empilha o aumento.

**Ajustes que a fonte maior forçou (layout que quebrava)**:
- *Nomes das cores* (`.product-variant-swatch-label`): o rótulo tinha
  `max-width:48px` numa linha só, então "Castanho Claro" virava "Casta…".
  Agora o botão tem 60px (56px em ≤600px), o rótulo quebra em até 2 linhas
  (`-webkit-line-clamp:2`).
- *Rótulos das especificações* (`.product-specs-row dt`): coluna de 92px →
  112px (senão "MARCA/MODELO" empurrava o valor), espaçamento de letras
  `.1em` → `.06em`, e cor `#a89e92` → `#8f8578` (12,5px em cinza claro sobre
  branco ficava com pouco contraste — legibilidade também é contraste).
- *Nome do item relacionado* (`.catalog-related-name`, só no hover): `width:
  100%` (72px, cortava com "…") → `max-content` até 170px; vaza pra baixo da
  foto vizinha, onde só existe o nome escondido dela, nunca a foto.
- *Pesquisa do cabeçalho*: `input{font-size:14.5px}` cortava "Pesquisar" na
  coluna de 110px (largura ≤1450px) → 13,5px.
- *Celular (≤767px)*: a trilha passava por baixo dos 3 ícones de visualização
  no canto direito (`.catalog-breadcrumb{right:142px}` resolve); o selo
  "Visualização 360°" do Composições batia no botão "Renderizar com IA"
  (`.catalog-lounge-badge{top:54px}` desce o selo pra baixo da linha do
  botão); a barra de ferramentas do 3D Livre estourava a largura
  (`.studio-tool-menu-trigger` 12,5px em ≤620px).
- *A trilha ficou ~4px mais alta* (fonte maior), e ela flutua por cima do
  conteúdo — então o respiro reservado abaixo dela subiu junto: Composições
  `padding-top` da coluna esquerda 44→52px (46px no celular) e do mini-menu
  Módulo 3D 20–40px → 44–60px (44px no celular; antes o título "Explore os
  recursos" ficava meio escondido atrás dela no celular).
- `.studio-project-panel small` (texto "Salvamento automático...") herdava o
  `small` padrão do navegador (`smaller` = 11,7px, invisível pra qualquer
  regex que só olhe `font-size:`); ganhou 12,5px explícito. **Lição**: uma
  auditoria por texto do CSS não acha tamanho herdado/padrão do navegador —
  só o `getComputedStyle` no navegador renderizado acha.

**O cabeçalho continua com altura FIXA** (72px celular / 76px desktop) — nada
aqui o fez crescer; o item de menu do cliente continua numa linha só.

**Achado à parte, fora do escopo, NÃO corrigido** (**resolvido depois**: a trilha foi apagada, ver "Trilha ... apagada + logo do cabeçalho maior"; os respiros aumentados por causa dela nesta seção também voltaram ao original): no 3D Livre, a trilha
(`position:absolute`, fundo `rgba(255,255,255,.85)`) cobre os ~30px de cima da
barra de ferramentas do estúdio ("Espaço / Paredes / Planta / Visualização"
e o botão "Renderizar com IA" aparecem cortados na metade). Já era assim antes
desta mudança (confirmado renderizando o `catalogo-studio3d.css` do `HEAD`
lado a lado) — a fonte maior só deixou a trilha ~4px mais alta. O Composições
tem o `padding-top` que resolve isso; o 3D Livre nunca teve. O mesmo vale pro
layout do 3D Livre em celular, que já sobrepunha a barra de ferramentas ao
painel de projetos antes.

Teste de regressão novo: `tests/catalogo-fontes-browser.cjs` — percorre as
mesmas telas (decorador + equipe + login + celular) e falha se qualquer texto
visível ficar abaixo de 12px (`getComputedStyle`, ignora o que está oculto),
se o cabeçalho passar de 76px de altura, se a tela do item ganhar rolagem
horizontal em 390px ou se a trilha passar por baixo dos ícones de
visualização no celular. Confirmado que ele pega de verdade: subindo o piso
pra 13px ele lista exatamente os rótulos de especificação, nomes de cor e
"SOB MEDIDA". Suíte completa (20 arquivos) rodada de novo, tudo passando
exceto `tests/catalogo-layout-browser.cjs`, que já estava quebrado antes
(mesma `ReferenceError` de função de template não simulada — agora
`variantSwatchesBlock`, antes `specsPanel`).
Cache-busting `?v=20260919-fontes` nos 5 CSS em `catalogo.html`.

## Trilha "Catálogo / Categoria / Item" apagada + logo do cabeçalho maior

Pedido explícito do usuário, com print da tela de um item ("Catálogo / Bares /
Bar Bistrol G" aparecendo logo abaixo da logo): *"apague isso que fica por baixo
da logo. e aumente a logo um pouco pro limite da altura do menu"*.

**A trilha `#catalogBreadcrumb` não existe mais** (HTML, CSS e o listener de
clique apagados; as seções "Trilha de navegação abaixo do cabeçalho" e as que a
citam ficam só como histórico). O caminho percorrido já estava na linha do tempo
do cabeçalho (ver "Linha do tempo das telas visitadas"), que também é clicável —
por isso não foi criado substituto. **`renderBreadcrumb()` virou
`syncNavigation()`**: a função nunca foi só a trilha — era o ponto único que
chamava `trackNavHistory()` (histórico/linha do tempo) e `updatePageLabel()` (nome
da tela no centro do cabeçalho) em toda navegação, então o que saiu foi só o
desenho da trilha; apagar a função inteira teria matado a linha do tempo. Se um
dia precisar de algo que rode "a cada mudança de tela", é ela.

**O que a trilha apagada resolve de brinde**: no 3D Livre ela cobria ~30px do topo
da barra de ferramentas do estúdio (o "achado à parte, não corrigido" da seção
"Fontes do catálogo") — sumiu junto. E os respiros que foram aumentados só pra
fugir dela voltaram ao valor original: Composições `padding-top` da coluna
esquerda 26px (20px no celular) e mini-menu Módulo 3D `clamp(20px,3vh,40px)`
(16px no celular); a regra do celular `.catalog-breadcrumb{right:142px}` também
saiu. O `padding-top:38px` de `.catalog-detail-panel` (item) NÃO foi mexido — não
era só da trilha, é o respiro do título.

**Logo maior — como funciona (é um hack calibrado pra ESTA logo)**: o arquivo da
logo da Chiavari é um PNG QUADRADO 1254×1254 com margem transparente enorme; a arte
ocupa x 39–1198, y 448–777 (≈3,5× mais larga que alta, ~26% da altura do arquivo).
O `<img class="catalog-brand-logo">` é uma caixa de 49px de altura (`max-height:49px`,
`object-fit:contain` → quadrado de 49px) escalada por `transform:scale(N)` a partir
da esquerda, e `.catalog-brand{overflow:hidden}` recorta na caixa da marca. Altura
da arte = 12,86 × N px: com N=3,6 eram ~46px num cabeçalho de 76px. Agora, por
faixa de largura (cada faixa tem a coluna da marca que sobra antes da linha do
tempo, que começa em `--nav-gutter` da borda esquerda — 350px acima de 1450px,
224px até 1450px):

| largura da tela | coluna da marca | `scale` | arte (alt × larg) | folga no cabeçalho de 76px |
|---|---|---|---|---|
| > 1450px | 250px (era 200) | 5,1 | 66 × 231px | 5px em cima e embaixo |
| 1201–1450px | 200px (era 180) | 4,2 | 54 × 190px | 11px |
| ≤ 1200px | 180px | 3,6 (igual a antes) | 46 × 163px | 15px |
| ≤ 767px (celular) | fluida | 2,8 (igual a antes) | 32 × 111px | — |

O "limite da altura do menu" só é alcançável no desktop largo: a arte é 3,5× mais
larga que alta, então 66px de altura já pedem 231px de largura, e abaixo de 1450px
a coluna da marca não passa de ~200px sem invadir a linha do tempo. **Não crescer
mais que isso sem mexer no `--nav-gutter`** (o rótulo centralizado e as entradas da
linha do tempo saem da mesma conta). Celular deliberadamente intocado (mesmo motivo:
já divide os 390px com a seta, o rótulo e o bloco do decorador).

Cada regra de `.catalog-brand-logo{transform:…}` leva também um `translateY` (3px /
2px / 2px): a arte fica ~3px ACIMA do meio do arquivo, e sem isso, a 5,1×, ela
encostava no topo do cabeçalho (2px de folga em cima, 8px embaixo — a swash do "Ch"
quase cortada). **A ordem das media queries importa**: `.catalog-brand-logo` é
redeclarada em 5 lugares (base, >1450, ≤1450, ≤1200, ≤767) e o CSS de largura menor
vem DEPOIS no arquivo — como media query não soma especificidade, a última regra
que casa vence, então o bloco do celular precisou repetir o `scale(2.8)` (o de 615
ficaria por baixo do ≤1450/≤1200). Outra empresa com logo de outra proporção
(ou um PNG já recortado) vai precisar de outros números — `logo_zoom` continua sem
efeito aqui, como antes.

Descoberta da proporção da arte: baixei a logo real (`empresas.logo_url`, via
`npx supabase db query --linked`) e medi o bounding box dos pixels não
transparentes num canvas — nada de chute no `scale`.

Teste de regressão novo, `tests/catalogo-cabecalho-browser.cjs` (substitui
`tests/catalogo-breadcrumb-browser.cjs`, apagado): (1) a trilha não existe em
nenhuma tela (Portal, Categorias, grade, item, Biblioteca, Módulo 3D, 3D Livre),
a foto ambientada encosta no cabeçalho, a barra de ferramentas do 3D Livre não fica
mais coberta, e o caminho segue na linha do tempo (clicar numa entrada volta de
verdade); (2) o fixture da logo é um PNG 627×627 transparente com um retângulo
magenta opaco nas mesmas proporções da arte real, e a altura/posição da arte é
medida em PIXELS do que o navegador desenha (screenshot do cabeçalho → bounding box
do magenta) em 1920/1600/1440/1280/1100px: altura mínima (62/50/44px), centrada
(±2px), com folga em cima e embaixo, sem ser cortada pela caixa da marca, sem
invadir a linha do tempo, cabeçalho continua com 76px; celular com 72px e sem
rolagem horizontal. Confirmado que pega: voltando o `scale` antigo, falha em
"logo ao menos 62px de altura — achou 47px". Os outros testes que usavam a trilha
para voltar ao mini-menu do Módulo 3D (`catalogo-lounge-browser.cjs`,
`catalogo-modulo3d-menu-browser.cjs`) agora clicam na entrada "Módulo 3D" da linha
do tempo. Suíte completa (20 arquivos) rodada de novo, tudo passando exceto
`tests/catalogo-layout-browser.cjs` (já quebrado antes, mesma `ReferenceError`).
Cache-busting `?v=20260919-logo-sem-trilha` em `catalogo.css`, `catalogo-lounge.css`
e `catalogo.mjs`.

## Biblioteca: clicar na foto abre em tela toda

Pedido explícito do usuário, com print da pasta aberta (4 fotos de eventos em grade): *"agora
eu quero clicar na foto dentro da biblioteca e quero que ela fique em tela toda"*.

**Reaproveita o visualizador que já existia**, não cria um novo: `#catalogPhotoZoomDialog`
(`openPhotoZoom()` em `catalogo.mjs`, ver "Visualizador de zoom da foto") — `<dialog>` de
100vw×100vh, fundo preto, foto na resolução grande (`IMG_WIDTH.zoom`, carregada só no clique),
arrastar/roda/botões +/− de zoom, fecha no ×, no Esc ou clicando fora. A grade da Biblioteca
mostra as fotos recortadas em 4:5 (`object-fit:cover`, 700px); o visualizador mostra a foto
INTEIRA, na proporção original.

**Ponte, não import**: `catalogo-biblioteca.mjs` é self-contido e não importa `catalogo.mjs`
(nem o contrário — ver "Biblioteca"), então `catalogo.mjs` expõe `window.catalogOpenPhotoZoom =
openPhotoZoom`, mesmo padrão de `window.catalogNotify`/`window.catalogLoadModelAsset`. A
Biblioteca acha a foto pelo `data-photo-id` em `photosForCategory()` e passa a URL CRUA
(`photo.url`) — `openPhotoZoom` é quem pede a versão grande ao Storage.

**Quem dispara**: a própria `<img>` (`data-open-photo`, `role="button" tabindex="0"`,
`aria-label="Ver foto em tela cheia"`, cursor `zoom-in`), com Enter/Espaço também. Não é a
`<figure>` inteira de propósito: o "×" de remover (só equipe interna, `<button>`) é IRMÃO da
imagem — um botão dentro de outro `role="button"` é HTML/ARIA inválido (mesma razão dos blocos do
Portal serem `<div>`). O "×" é checado antes no handler, então nunca abre a foto. Vale igual pra
decorador externo (só olha) e equipe interna.

**(Implementado depois — ver "Visualizador de fotos: passar de uma foto pra outra sem fechar".)** Antes: setas pra passar pra foto anterior/seguinte da
pasta dentro do visualizador (hoje precisa fechar e clicar noutra). O visualizador é compartilhado
com o zoom das fotos do item, então isso mexeria nos dois.

Teste: `tests/catalogo-biblioteca-browser.cjs` — o visualizador ocupa o viewport inteiro (mesmas
dimensões da janela), mostra a foto clicada (1ª e 2ª, por teclado), fecha com Esc e com o ×;
equipe abre a foto e o × de remover não abre nada. Cache-busting `?v=20260919-biblioteca-tela-toda`.

## Bug real: o visualizador de zoom abria com a foto da vez anterior e depois "piscava"

Reportado pelo usuário (depois de a Biblioteca passar a usar o visualizador): *"quando eu clico
pra ampliar uma foto ele abre a última foto que ampliei, aí depois pisca e abre a foto que
realmente é pra aparecer"*. Vale pro visualizador em geral (fotos do item também), não só pra
Biblioteca — a Biblioteca só deixou óbvio porque o usuário abre várias fotos em sequência.

**Causa raiz**: `#catalogPhotoZoomImage` é UM `<img>` só, reaproveitado. `openPhotoZoom()` trocava o
`src` e chamava `showModal()` na hora; enquanto a versão nova (`IMG_WIDTH.zoom` = 3200px) não
terminava de carregar, o navegador continuava DESENHANDO a imagem anterior — o diálogo abria
mostrando a foto da última abertura e só depois trocava (o "piscar"). O CLAUDE.md dizia que a
foto grande era "carregada só nesse clique" — verdade, mas ninguém tratou o intervalo entre o
clique e a chegada dela.

**Correção** (`openPhotoZoom(src, alt, previewSrc)`, `catalogo.mjs`), a cada abertura:
1. o `<img>` é esvaziado (`removeAttribute("src")`) e escondido (`opacity:0` até `.is-ready`) —
   nunca sobra a foto anterior; o `close` do diálogo também esvazia (`clearPhotoZoomImage()`);
2. **a versão pequena que JÁ está na tela e em cache aparece na hora** (`previewSrc`: o
   `currentSrc` da `<img>` clicada — a foto principal/ambientada do item, ou a miniatura da
   Biblioteca), então o clique responde de imediato em vez de abrir preto esperando 3200px;
3. a grande carrega por trás (`new Image().decode()`) e só então entra no lugar da pequena — se
   falhar, fica a pequena. `photoZoomOpenId` invalida respostas atrasadas de uma abertura
   anterior (clique rápido em duas fotos).

**CSS**: `.catalog-photo-zoom-image` deixou de ser `max-width/max-height:92%` (que só encolhe:
a pequena ficava no tamanho natural de 700px e a troca pra grande "pulava" de tamanho) e virou
`width:92%;height:92%;object-fit:contain` — preview e grande ocupam exatamente a mesma caixa.
Zoom/arrasto (`transform`) continuam iguais; `.is-dragging` só mantém a transição de opacidade.

**Efeito colateral no teste**: como a pequena entra primeiro, a URL `width=3200` não está mais
no `src` no instante em que o diálogo abre — os testes que liam `src` logo após abrir agora
esperam a troca (`waitForFunction`).

Teste (`tests/catalogo-zoom-foto-browser.cjs`): abre a principal, fecha (o `<img>` fica sem
`src`), SEGURA a resposta da versão grande da ambientada (rede lenta) e um gravador anota a
cada quadro `{src, is-ready, opacity}`: nenhum quadro mostra a foto anterior, a primeira coisa
visível já é a foto certa (a pequena) antes de a grande chegar, e depois da troca a foto nunca
volta a ficar invisível. **Armadilha do próprio teste**: o navegador guarda em cache a versão
grande de qualquer foto já ampliada, e uma "grande retida" que já está em cache responde na
hora e não testa nada — o bloco precisa rodar ANTES de a ambientada ser ampliada pela 1ª vez.
Confirmado que pega: com o esvaziamento e o preview desligados falha em "Fechar esvazia o
<img>". Cache-busting `?v=20260919-zoom-sem-piscar`.

## Visualizador de fotos: passar de uma foto pra outra sem fechar (galeria)

Pedido do usuário, logo depois do visualizador em tela cheia da Biblioteca: *"quero poder trocar
as fotos pelo preview"*. Interpretado como **navegar** entre as fotos dentro do próprio
visualizador (era a opção que ficou registrada como "não implementado" em "Biblioteca: clicar
na foto abre em tela toda"). **Não** foi interpretado como trocar/substituir o arquivo da foto —
se era isso, é outro pedido (edição de foto a partir do visualizador).

**Como funciona**: `openPhotoZoom(src, alt, previewSrc, gallery)` ganhou um 4º parâmetro,
`gallery = { items: [{ src, alt, preview }], index }` (`src` sempre a URL crua). Com 2+ itens
aparecem as setas `‹ ›` (`#catalogPhotoZoomPrev/Next`, nas laterais, no meio) e o contador
`2 / 8` (`#catalogPhotoZoomCounter`, topo, centralizado); com 1 foto ou sem `gallery`, o
visualizador é idêntico ao de antes (setas `hidden`). Passar de foto: as setas, **← →** do
teclado, e **arrastar pro lado** (≥90px, predominantemente horizontal) — o gesto do celular. O
arrasto só troca de foto **sem zoom** (`scale===1`); com zoom, arrastar continua sendo mover a
foto. Depois da última volta pra primeira (e vice-versa). A foto nova sempre abre centralizada
(reset do transform) e reaproveita todo o fluxo de `showPhotoZoomPhoto()` — esvazia o `<img>`,
mostra o preview, troca pela grande decodificada — então o bug do "abre a foto anterior e pisca"
(seção acima) não volta ao navegar. As duas vizinhas têm o preview pré-carregado
(`preloadPhotoZoomNeighbors()`, só a versão pequena — não baixa 3200px de fotos que talvez
ninguém abra). `close` do diálogo zera a galeria.

**Quem passa galeria**:
- **Biblioteca** (`catalogo-biblioteca.mjs`, `openPhoto`): todas as fotos da pasta, na ordem da
  grade, cada uma com a miniatura já carregada na grade como preview.
- **Foto principal do item** (`zoomGalleryForMainImage()`): os slides do carrossel com foto de
  verdade — principal + Detalhe 1/2 (`mainSlides(item)`); o slot VAZIO que a equipe vê como "+"
  nunca entra (contador de 2, não 3). Começa no slot ativo (`data-active-slot`).
- **Ambientada do item** (`zoomGalleryForEventImage()`): as ambientadas cadastradas, começando
  na que está na tela (`data-event-index`).
Em ambos os casos a foto CLICADA entra com a URL/alt/preview que estão de fato na tela (pode ser
a foto personalizada com tecido, que não é `item.photo`), e a lista do resto vem do item.
Decorador com item de uma foto só (sem Detalhes, 1 ambientada) não vê seta nenhuma.

**Layout**: com galeria o diálogo ganha `.has-gallery`, que desce o bloco de zoom (+/−/redefinir)
do meio da direita pro canto inferior direito (no celular sobe um pouco, `bottom:64px`, pra não
bater no texto de dica) — o meio da direita é da seta "próxima". Sem galeria o bloco fica onde
sempre esteve. Contador em `top:8px` (a 24px encostava na borda de cima da foto no desktop).

Testes: `tests/catalogo-biblioteca-browser.cjs` (pasta com 2 fotos: setas visíveis, contador 1/2 →
2/2, a próxima da última volta pra primeira, ← → do teclado, arrastar pra esquerda troca sem zoom
e NÃO troca com zoom, foto nova abre centralizada, fechado esconde as setas; pasta com 1 foto: sem
setas/contador) e `tests/catalogo-zoom-foto-browser.cjs` (item da equipe com principal + Detalhe 1
+ Detalhe 2 vazio: contador 1/2, próxima mostra o Detalhe 1, ← volta; decorador com foto única:
sem setas). Cache-busting `?v=20260919-zoom-galeria`.

## Tela do item: círculos de cor EMBAIXO do nome + medidas dentro das specs

Pedido do usuário, com print de uma poltrona com 4 cores ("Poltrona Águines Campo"): *"coloque os
ícones das cores em baixo do nome do item, coloque as medidas junto com categoria, material..."*.
**Supera** "Nome do item + círculos de cor no mesmo bloco (bleed sobre a foto de propósito)" — o
`flex-wrap:nowrap` / nome+círculos vazando lado a lado por cima da foto, o `flex-shrink:0` e a
exceção do celular descritos lá não existem mais.

**Círculos**: `.product-title-row` virou coluna (`flex-direction:column;align-items:flex-start;
row-gap:16px`) — nome em cima (continua `white-space:nowrap`, ainda pode vazar por cima da foto se for
comprido), círculos logo abaixo, alinhados à esquerda com o nome. O HTML não mudou (os círculos já
moravam dentro de `.product-title-row`). A fileira (`.product-variants-row`) quebra dentro da coluna
no celular (`max-width:100%`); no desktop (≥768px) tem `width:max-content;max-width:440px` — a
coluna de texto tem só 30% da largura e com 4 cores quebrava em 3 + 1 órfão; agora até 6 círculos
cabem numa linha, passando um pouco por cima da margem da foto (o `max-width` sozinho não bastava:
num flex em coluna o item nunca passa da largura disponível, foi preciso `width:max-content`).

**Medidas**: a linha solta `<p class="product-dimensions">` (letras bem espaçadas, abaixo do nome) foi
apagada — HTML e CSS. `mapRow()` ganhou `{ label: "Medidas", value: formatDims(...) }` em `item.specs`,
entre "Marca/Modelo" e "Código" (ordem: Categoria, Família, Material, Cor, Estilo, Marca/Modelo,
Medidas, Código; campo vazio some, como os outros — item sem nenhuma dimensão não mostra a linha).
`item.dims` continua existindo e sendo usado pela grade e pelo mosaico (cards mostram as medidas).
Como `applyVariant()` refaz o painel a partir de `item.specs`, a linha acompanha a troca de cor.

**Grade em vez de flex nas specs**: com a linha "Medidas" o valor "67 × 95 × 57 cm" quebrava em duas
linhas na coluna estreita, porque o rótulo tinha 112px FIXOS (folga pra "MARCA/MODELO", o maior).
`.product-specs` virou `display:grid; grid-template-columns:max-content minmax(0,1fr)` com
`.product-specs-row{display:contents}`: a coluna de rótulos tem a largura do MAIOR rótulo presente
naquele item — sem "Marca/Modelo" ganha ~30px pros valores. Não sobrou nenhum `flex` em dt/dd.

Teste (`tests/catalogo-titulo-cores-browser.cjs`): círculos abaixo do nome (folga 0–40px), alinhados à
esquerda e numa linha só; nenhum `.product-dimensions` na tela; rótulos das specs começam por
Categoria, Material, Cor, Medidas; valor `67 × 95 × 57 cm` e altura do `<dd>` < 24px (uma linha).
Cache-busting `?v=20260919-cores-embaixo`.

## Filtros na tela "Categorias" (Material, Estilo, Personalizáveis) — resultados agrupados por categoria

Pedido do usuário: *"quero colocar alguns filtros dentro do módulo de categorias, exemplos de
filtro... Material, Estilo e customizáveis, quando fizermos isso aparece todos os itens com esse
filtro e separados por categoria, então imagina que aparece aparadores, aí em baixo os móveis, aí
depois armários e por aí vai"*. "Módulo de categorias" = a tela "Categorias" (`HOME_VIEW`, a grade
de cards de categoria) — não os filtros de subcategoria de DENTRO de uma categoria (esses continuam
como estavam). "Customizáveis" = `item.personalizable` (o "Sob medida"/"Experimente outro tecido").

**Sem filtro** a tela é a grade de categorias de sempre. **Com algum filtro ativo** os cards de
categoria dão lugar aos ITENS que passam por todos os filtros, agrupados por categoria: um título
serifado por categoria (`.catalog-filter-group-title`, com a contagem) e os cards do item embaixo
(os mesmos da grade de uma categoria — `gridCardMarkup(item)`, extraído de `renderGridMarkup()`).
Ordem das categorias = a de `getCategories()` (a do banco, alfabética). Categoria sem item filtrado não
aparece.

**Regras**: dentro de UM filtro os valores marcados se somam (Madeira OU Ferro); entre filtros
diferentes todos precisam bater (Madeira E personalizável). A contagem ao lado de cada opção respeita
os OUTROS filtros já ativos ("quanto resultaria se eu marcasse esta") e uma opção que zeraria o resultado
fica apagada/desabilitada (por isso não dá pra chegar em "nenhum item" marcando uma opção apagada —
só combinando de outra ordem, ex.: Vidro primeiro e Personalizáveis depois; aí aparece "Nenhum item com
esses filtros" + atalho "Limpar filtros"). Valores são comparados por `filterKey()` (sem acento/caixa/espaço
duplo): "MADEIRA" e "Madeira" contam juntos; o rótulo mostrado é a grafia mais frequente. Item que é um
GRUPO de variantes (a mesma poltrona em 5 cores, ver `agruparVariantes()`) conta UMA vez e casa se
qualquer variante casar (material é igual no grupo — faz parte da chave —, estilo pode variar).

**Quais filtros aparecem** (`HOME_FILTER_FIELDS` + o liga/desliga de Personalizáveis): um filtro sem
nenhuma opção nos itens carregados NÃO vira botão. **Hoje nenhum item do banco tem Estilo cadastrado**
(594 vazios + 5 nulos — conferido direto no banco), então só Material e Personalizáveis aparecem; Estilo
entra sozinho quando houver dado (mesma coisa vale pra Personalizáveis se nenhum item for
personalizável). Material tem ~27 valores reais, alguns com erro de digitação que são valores DIFERENTES
pro filtro ("Estofado Tecido", "Estofada Tecido", "Estodado Tecido", "EstofadoTecido") — o filtro não
adivinha typo; limpar isso é no cadastro/na importação. `item.estilo` passou a existir em `mapRow()`
(antes só estava dentro de `specs`); o banco já devolvia `material`, `estilo` e `personalizable` nas
duas RPCs (`catalogo_acervo()` é única) — nenhuma migration.

**UI** (`catalogo.css`, logo abaixo das pílulas de subcategoria — mesma linguagem: contorno claro, ativo
preenchido na cor terrosa): Material/Estilo são botões que abrem um painel com caixinhas (têm dezenas
de valores, não cabem como pílulas); Personalizáveis é um liga/desliga direto (`aria-pressed`) com a
contagem. O botão mostra quantos valores estão marcados; "Limpar filtros" e um resumo ("5 itens em 4
categorias", `aria-live`) aparecem só com filtro ativo. **`refreshHomeFilters()` redesenha só o que
depende dos filtros** (resultados, contagens, caixinhas marcadas) sem recriar a barra — o painel
continua aberto e o foco fica na caixinha, então dá pra marcar vários valores seguidos. Fecha com Esc
(o foco volta pro botão) e clicando fora (dois listeners em `document`, registrados uma vez em
`bindInteractions()`). No celular o painel ocupa a largura da barra (`.catalog-filter{position:static}`),
senão o da 2ª pílula estourava a tela.

**Abrir um item dos resultados = tela nova `FILTER_VIEW`** ("Resultados" no cabeçalho/linha do tempo):
`applyView(FILTER_VIEW, { focusItemId })` mostra a visualização imersiva SÓ dos itens filtrados (rolar
pro próximo continua nos filtrados, na ordem das categorias) e já cai no item clicado. A primeira ideia
era `openImmersiveFromGrid()` (imersiva com `activeView` ainda em `HOME_VIEW`), descartada: sem
navegação nova o cabeçalho continuava dizendo "Categorias" e não sobrava um jeito de voltar. Com
`FILTER_VIEW` a linha do tempo fica Home › Categorias › Resultados e clicar em "Categorias" volta pra
grade filtrada. `FILTER_VIEW` esconde o seletor de visualização (grade/imersiva/mosaico não fazem
sentido ali); se for restaurada pela linha do tempo depois de os filtros terem sido limpos, cai de
volta em `HOME_VIEW`. `applyView()` ganhou o 2º parâmetro `options` (`focusItemId`).

**Estado**: `state.homeFilters = { material: Set, estilo: Set, personalizable }` (Sets de `filterKey`),
`state.homeFilterOpen`. Persiste enquanto a pessoa navega entre as telas de dentro do catálogo (abrir
um item e voltar mantém o filtro) e **zera ao voltar pro Portal** (`applyView(GATEWAY_VIEW)`). A busca
do cabeçalho continua varrendo tudo e ignora os filtros.

**Desempenho** (610 itens sintéticos, 407 filtrados): marcar um valor redesenha em ~250ms; abrir um
item na imersiva de 407 seções, ~420ms (as fotos são `loading="lazy"`). Se o catálogo crescer muito e
isso pesar, o ponto a limitar é `FILTER_VIEW` (renderizar só uma janela de seções), não o filtro.

Teste: `tests/catalogo-filtros-browser.cjs` — barra com Material e Personalizáveis e SEM Estilo quando
nenhum item tem estilo; opções em ordem alfabética com contagem (grafias juntas); grupos por categoria
com título e contagem; painel continua aberto entre marcações; OU dentro do filtro, E entre filtros;
contagem contextual e opção apagada; Esc e clique fora fecham; abrir um item mostra só os filtrados
("Resultados", item clicado no topo) e voltar mantém os filtros; sem resultado tem mensagem + limpar; o
Portal zera; com estilo cadastrado o filtro aparece e variantes contam como um item; celular sem
overflow e com o painel dentro da tela. Cache-busting `?v=20260919-filtros`.

## Bug real: sombra retangular em volta da foto principal do item

Reportado pelo usuário, com print da tela de um item (a poltrona/sofá de listras verdes): *"verifique
se tem sombras por trás da foto do item principal que causa dessa marcação em volta"*.

**Tinha.** `.product-main-image` levava `filter:drop-shadow(0 16px 12px rgba(50,38,28,.07))`. O
`drop-shadow` desenha a sombra do FORMATO da imagem: numa PNG recortada (sem fundo) isso vira uma
sombra de chão bonita, mas as fotos do catálogo são **opacas** (fundo de estúdio) — o formato é um
retângulo, então saía uma sombra retangular: uma faixa mais escura logo abaixo da foto e um halo
de ~12px nas laterais/em cima quando a foto é mais estreita que o quadro (o `overflow:hidden` de
`.product-main-media` só corta na borda da CAIXA, não da foto). Medido em pixels do que o navegador
desenha (foto com fundo `#fbfbfb`): 4px abaixo da foto `rgb(243,242,242)`, 12px `rgb(246,246,245)`,
24px `rgb(252,252,251)`, contra `rgb(255,255,255)` da página. Era a "reflexão"/degradê que aparecia
embaixo da foto em vários prints de teste desta sessão.

**Corrigido**: o `filter` foi removido da regra (`catalogo.css`). Sem `filter`, o entorno da foto é o
branco puro da página (mesmas medidas, agora `rgb(255,255,255)` nos 4 pontos). É o único
`drop-shadow` do catálogo em foto de item (o do `.catalog-biblioteca-folder-peek-frame`, do ícone de
pasta da Biblioteca, é intencional e é de um `<image>` SVG, não de foto). Não existe pseudo-elemento
(`::before/::after`) nem `box-shadow` atrás da foto.

**O que NÃO é sombra e continua**: o retângulo levemente cinza da PRÓPRIA foto — as fotos de estúdio
têm fundo `#fbfbfb`/`#fafafa`, não branco puro (medido: `rgb(251,251,251)` dentro da foto contra
`rgb(255,255,255)` na página), então o contorno da foto ainda é perceptível em monitor bom. É o pixel
do arquivo. Opções, se incomodar (nenhuma aplicada — a máscara de esmaecer a borda já foi tentada e
recusada, ver "Esmaecer a borda das fotos contra o branco"): re-exportar as fotos com fundo branco
puro (a solução de verdade), ou um `filter:brightness(1.02)` na foto que empurra o quase-branco pra
branco (altera levemente a cor do móvel).

Teste: `tests/catalogo-foto-sem-sombra-browser.cjs` — `filter` computado da foto principal é `none`
e, em screenshot, 4 distâncias (2/6/12/20px) em volta da foto (embaixo, em cima, esquerda, direita)
são branco puro, com foto larga (sobra espaço em cima/embaixo) e com foto alta e estreita (sobra
nas laterais). Confirmado que pega: com o `drop-shadow` de volta, falha. Cache-busting
`?v=20260919-foto-sem-sombra`.

## Foto ambientada: setas (anterior/próxima) + pausar a troca automática

Pedido do usuário, com print de um sofá ("Sofá Berlim") ao lado da foto ambientada: *"na foto do
item ambientado eu quero que tenha uma seta de avançar ou voltar e um pause também, bem discreto,
pra parar de alterar"*.

**O que já existia**: a foto ambientada (`.product-event-panel`, coluna da direita) troca sozinha a
cada 10s entre as ambientadas do item (`startEventRotation()` → `rotateActiveEvent()`, só a seção que
está na tela, fundido de 900ms). Não havia jeito de passar na mão nem de parar.

**Agora** (só com 2+ ambientadas — com uma só não há o que trocar; vale pra decorador e equipe):
- **Setas** `‹ ›` nas laterais, no meio do painel (`.catalog-event-nav`), 32px.
- **Pausar/retomar** no canto inferior direito (`.catalog-event-pause`, 26px): pausa a troca
  automática; o ícone vira "tocar" e o `aria-label` "Retomar a troca automática das fotos".
- **Discretos de propósito**: círculos de vidro escuro (`rgba(20,17,14,.34)` + blur) com ícone
  branco fino, opacidade .5 em repouso, .75 com o mouse no painel, 1 no próprio botão. `z-index:6`
  (acima do escurecer/"INSPIRE-SE" do hover do painel e dos pontinhos de edição da equipe, que são
  5 — os pontinhos ficam embaixo no centro, o pausar embaixo à direita: não se sobrepõem).

**`rotateActiveEvent()` foi quebrada em duas**: `stepEvent(section, direction, {manual})` faz a troca
(mesmo fundido de sempre; `direction` ±1, com volta ao redor: anterior do 1º = último) e
`rotateActiveEvent()` só decide SE troca (não pausado, aba visível, há seção ativa) e chama
`stepEvent(section, 1)`. Um clique manual durante uma troca em andamento (900ms) não se perde:
guarda o último em `panel._pendingEventStep` e roda quando a troca termina — clicar "próxima" duas
vezes seguidas avança duas fotos. A foto atual é achada por
`.product-event-image:not(.product-event-image-next)` (a "próxima" fica no DOM durante a troca).

**Pausar vale pra TODOS os itens** enquanto a página está aberta (`state.eventPaused`, só em
memória — recarregar volta ao automático): o relógio de 10s é global e só rotaciona a seção da
tela, então uma pausa por item não faria sentido (rolar pro item seguinte voltaria a trocar).
`syncEventPauseButtons()` atualiza todos os botões que estão no DOM; painéis re-renderizados
(`eventPanelMarkup()`, ex.: trocar de cor) já nascem com o estado certo. As setas continuam
funcionando pausado (e passar na mão NÃO retoma). Clicar numa seta reinicia o relógio de 10s
(`startEventRotation()`), pra troca automática não disparar logo em seguida; retomar também reinicia.
Não mexe em `prefers-reduced-motion` (a troca automática continua ligada por padrão — se quiserem
que ela já comece pausada pra quem pediu menos movimento, é `state.eventPaused` inicial).

Os botões são irmãos da foto (`eventPanelMarkup()` devolve foto + controles + pontinhos), então
clicar neles nunca alcança o zoom (`closest(".product-event-image")`) nem a edição inline.

Teste: `tests/catalogo-ambientada-controles-browser.cjs` — o teste captura o
`setInterval(…, 10000)` da página (`window.__ticks`) pra "dar o tick" sem esperar 10s de verdade:
setas e pausar existem, pequenos (≤36px / ≤30px) e apagados (opacidade ≤.6); próxima/anterior e volta
ao redor; dois cliques rápidos avançam duas fotos; clicar numa seta recria o relógio; o tick troca
quando rodando, NÃO troca pausado, passar na mão pausado não retoma, o outro item já nasce pausado;
retomar volta ao normal; item com uma ambientada não tem controles; equipe: convive com os 3
pontinhos sem sobreposição e clicar na seta não abre a edição; celular sem overflow. Cache-busting
`?v=20260919-ambientada-setas`.

## Setas do carrossel da foto principal: sempre aparentes (não só no hover)

**Superado** pela seção "Setas do carrossel principal: só no hover, em preto como o escurecer da Home" (mais abaixo): o círculo branco sempre visível foi trocado por preto a 50% que só aparece no hover. O trecho sobre o teste intermitente do zoom continua valendo.

Pedido do usuário: *"no item principal tem duas setas, eu quero que essas setas fiquem mais
aparentes... ali dentro da foto do item fica nessa cor mais escura direto, pra pessoa saber que tem
mais fotos"* — as setas `‹ ›` do carrossel principal (principal + Detalhes, `.product-main-nav`,
ver "Detalhes + Modelo 3D do item viraram slides") só ficavam nítidas com o mouse em cima.

**Antes**: em repouso `opacity:.55`, cinza claro (`var(--muted)`) num círculo branco 55% — sobre o
fundo quase branco da foto praticamente sumia ("seta esmaecida premium", o pedido original da
seção do carrossel). No hover virava opaca, fundo branco e cor terrosa. **Agora o estado de repouso
já é o firme**: `opacity:1`, círculo branco 92% com contorno fino (`rgba(61,54,48,.2)`) e sombra suave
(o contorno/sombra é o que destaca o círculo do fundo branco da foto), seta escura `#3d3630`, traço
mais grosso (`stroke-width:2`, 18px). O hover só troca a cor pra terrosa (`var(--accent)`, contorno
também) e reforça a sombra — continua dando retorno ao mouse. Os pontinhos de posição
(`.product-main-dot`) também ficaram um pouco mais firmes (7px, `rgba(61,54,48,.28)` em vez de
`var(--line)`, que quase não aparecia) pelo mesmo motivo. Só aparecem com 2+ fotos, como antes.

Ao contrário das setas da foto ambientada (essas são "bem discretas", pedido oposto — ver
"Foto ambientada: setas...").

Teste (`tests/catalogo-editor-fotos-browser.cjs`, junto da checagem de que as setas existem): a seta
em repouso tem opacidade 1, cor escura (canais < 110) e contorno de 1px.

**Teste que ficava intermitente (1 em ~5 execuções), corrigido de passagem**:
`tests/catalogo-zoom-foto-browser.cjs` conferia que fechar o visualizador esvazia o `<img>` logo
depois de `open` virar `false`, mas o evento `close` do `<dialog>` que faz o esvaziamento dispara
numa tarefa DEPOIS — corrida do teste, não do produto (o intervalo é invisível). Agora espera o
`src` sumir antes de afirmar. Cache-busting `?v=20260919-setas-visiveis`.

## Setas do carrossel principal: só no hover, em preto como o escurecer da Home

Pedido do usuário, olhando um print do Portal com o bloco "Biblioteca" escurecido no hover: *"só quero
que apareça as setas quando eu passar o mouse por cima, outra coisa, não quero ela branca, quero com esse
efeito igual da home"*. **Supera** "Setas do carrossel da foto principal: sempre aparentes" (a versão de
uma mensagem antes: círculo branco sempre visível) — vale a versão desta seção.

**Comportamento** (`.product-main-nav`, `catalogo.css`): escondidas em repouso (`opacity:0`); aparecem
quando o mouse está em cima da FOTO (`.product-main-media:hover`) ou com o foco do teclado dentro dela
(`:focus-within`, e a própria seta com `:focus-visible`) — sem isso não dá pra trocar de foto só com o
teclado. **"O efeito da home"** = o escurecer dos blocos do Portal (`.catalog-gateway-zone::before`:
`#000` a `.22` → `.5` no hover, transição de 1s em `cubic-bezier(.22,1,.36,1)`): o círculo da seta é o
mesmo preto a 50% (`rgba(0,0,0,.5)`) com a seta branca (1.8 de traço), e entra/sai com a mesma curva
(`opacity .5s`); com o mouse EM CIMA da seta o círculo escurece (`.72`), o mesmo tipo de reforço do
hover da Home. Não é branco em nenhum estado. **Os pontinhos de posição continuam sempre visíveis**
(ficaram um pouco mais firmes na versão anterior): sem mouse, são eles que avisam que há mais fotos.

**Tela de toque**: `@media(hover:none){.product-main-nav{opacity:1}}` — sem "passar o mouse" as
setas ficariam invisíveis pra sempre e não haveria como trocar de foto (só deslizar não existe nesse
carrossel). Verificado que o Edge com `isMobile:true,hasTouch:true` casa `(hover:none)`.
`prefers-reduced-motion` desliga a transição.

**As setas da foto AMBIENTADA (painel da direita) NÃO mudaram** — continuam discretas e sempre
presentes (`opacity:.5`, `.75` com o mouse no painel), pedido de outra mensagem ("bem discreto"). Se o
usuário quiser o mesmo comportamento delas (só no hover), é o mesmo ajuste em
`.catalog-event-nav`/`.catalog-event-pause`.

Testes: `tests/catalogo-carrossel-setas-browser.cjs` (novo — desktop: escondidas com o mouse fora,
aparecem com o mouse na foto em `rgba(0,0,0,.5)` com seta branca, `.72` com o mouse na seta, clicar
troca de foto, foco do teclado mostra a seta, pontinhos sempre visíveis; toque: sempre visíveis) e o
bloco equivalente em `tests/catalogo-editor-fotos-browser.cjs` (acesso da equipe). Cache-busting
`?v=20260919-setas-hover`.

## Portal (Home): foto natural em repouso — o véu preto de .22 saiu

Pedido/pergunta do usuário: *"a foto da home eu acho que ela não está natural, tem algum efeito nela"*.

**Tinha um efeito, e só um**: `.catalog-gateway-zone::before` (o escurecer dos 3 blocos, "igual ao da home" que o
usuário pediu pra reaproveitar em outras telas) ficava em `opacity:.22` de preto **o tempo todo** — desde o
Portal de 3 fotos, mantido "pro texto branco não sumir" — e subia pra `.5` no hover. Medido em pixels do que o
navegador desenha, com a foto real do Portal (`empresas/…/_capas/portal.jpg`, JPEG do Lightroom 1600×1067,
baixada do Storage): **luminância média 151 → 118 (−22%)** e realces (percentil 95) **225 → 176**, ou seja,
a foto ficava fosca/acinzentada. Nada mais mexe nela: `.catalog-gateway-photo` não tem `filter`,
`mix-blend-mode` nem `opacity` (conferido por `getComputedStyle`); o Storage serve a foto em WebP q82 na
largura da própria foto (1600px, sem ampliar — 716KB → 140KB, perda invisível). Só `object-fit:cover`
recorta pra preencher a tela (o enquadramento pode ser ajustado pelo botão "Ajustar foto").

**Corrigido**: o véu de repouso é `opacity:0`; o hover continua `0 → .5` com a mesma transição de 1s (o efeito
que o usuário gosta e pediu em outras telas continua). Em repouso a foto renderizada é idêntica ao arquivo
(luminância 150,8 nas duas medições). Como o véu era o que garantia a leitura do texto branco, o
`text-shadow` de `.catalog-gateway-title` ficou mais forte
(`0 1px 3px .55, 0 2px 18px .6, 0 0 44px .45` em vez de `0 3px 22px .4`) — escurece só em volta das letras, não a
foto inteira. Sobre paredes brancas/céu claro o título fica legível, mas com menos folga que antes; se algum
dia a foto do Portal for muito clara e o texto sumir, o caminho é reforçar o sombreado do título (ou
um degradê pequeno atrás dele), **não** voltar o véu global.

Não mexido: o mini-menu do Módulo 3D tem um véu parecido (`.catalog-modulo3d-tile-stage::before`, `.08`
em repouso, calibrado numa rodada própria) — outra tela, sem reclamação.

Teste (`tests/catalogo-portal-browser.cjs`): véu computado `0` nos 3 blocos com o mouse fora; a foto sem
`filter`/blend/opacidade (`none|normal|1`); no hover o bloco vai a `.5` e os outros ficam em `0`.
Cache-busting `?v=20260919-portal-natural`.

## Projetos: montar o projeto de um evento dentro do catálogo (4º destino do Portal)

Pedido do usuário: *"a ideia é que a pessoa possa montar um pedido de dentro do catálogo, pra que no final ela tenha um
projeto pra apresentar pro cliente, com os itens que ela selecionou e com as renderizações em 3D... quero que seja fácil
de usar, prático, porque a maior dor do cliente é o tempo... o projeto venha dividido por ambiente, esses ambientes o
decorador vai escolher (cerimônia, mesa de convidados, bar, lounge, bistrôs...), com o nome que ela quiser... no final
quero um projeto em arquivo e landing page bonito e apresentável pro cliente; na criação são obrigatórios data do
evento, nome dos noivos e local"*. Decisões confirmadas com o usuário (AskUserQuestion): **valores sempre escondidos**
(nada de preço na apresentação — o catálogo também nunca teve preço), **enviar pedido já na 1ª versão**, **link +
senha/PIN** pra apresentação.

**O que existe (v1)**
- **Portal**: 4º bloco "Projetos" (`GATEWAY_TILES` em `catalogo.mjs`; as zonas são `flex:1`, então virou 4 colunas sem CSS
  novo). Abre o overlay `#catalogProjetos` (`setActiveOverlay("projetos")`, rótulo/linha do tempo "Projetos",
  `restoreNavScreen` cobre o overlay).
- **Lista de projetos** (`catalogo-projetos.mjs`): card por evento com data grande, noivos, local, contagens,
  contagem regressiva ("Faltam 233 dias"), status e "Link ativo". Eventos já realizados vão pra uma seção abaixo. Equipe vê
  os projetos de TODOS os decoradores (com "Decorador: X"/"Criado pela equipe") e um filtro "Pedidos recebidos".
- **Criar projeto**: noivos, data e local obrigatórios (validados no diálogo E no servidor). Ambientes: chips de sugestão
  (Cerimônia, Mesa de convidados, Bar, Lounge, Bistrôs, Recepção, Pista de dança) **nenhum pré-marcado** de propósito (o
  decorador escolhe; a estrutura não nasce sozinha) + campo "Outro ambiente…" com nome livre.
- **Espaço de trabalho**: abas de ambiente (criar/renomear/excluir), móveis com quantidade (−/+/digitar/remover),
  renderizações do ambiente, observações do ambiente (entram na apresentação). Autosave (debounce 800ms) — ver
  "Autosave" abaixo. Editar dados do evento.
- **Adicionar móveis em 1 toque**: "＋" no canto da foto de cada card da grade e do mosaico (`.cpj-add-chip`, aparece no
  hover/foco; sempre visível em toque e quando o item já está no projeto, com a quantidade) e botão "Adicionar ao
  projeto" na página imersiva do item (`.cpj-add-page`, no fim de `.product-copy` — **de propósito depois do card de
  personalização e dos toggles de capa**: `applyVariant()` insere as specs "antes" desses dois, colocar o botão entre
  eles inverteria a ordem ao trocar de cor). O clique é capturado no `document` (fase de captura) e faz
  `stopPropagation`, então NÃO abre o item da grade. Toast "Adicionado ao projeto" com "Desfazer".
- **Dock** (`#catalogProjetoDock`, pílula fixa embaixo à ESQUERDA — as notificações moram embaixo à direita): mostra
  "Projeto · Ana & Bruno" (abre o projeto) e "Ambiente · Bar ▾ [total]" (popover pra trocar de ambiente, criar outro ou
  trocar de projeto). Só aparece na navegação do catálogo (categorias/itens/Módulo 3D), nunca no Portal nem dentro de um
  overlay. O projeto/ambiente ativo é lembrado por navegador (`localStorage catalogo_projeto_ativo:<empresa>:<cliente>`).
  Sem projeto ativo, o "＋" pergunta (escolher projeto+ambiente ou criar).
- **Renderizações**: botão "Salvar no projeto" nos 3 diálogos de resultado de IA (`#loungeResultDialog` Composições,
  `#studioResultDialog` 3D Livre, `#catalogFabricResultDialog` tecido) — `data-projeto-save-render data-img data-origem`,
  tratados por delegação em `catalogo-projetos.mjs` (os módulos Lounge/Studio3D não foram tocados). Sempre mostra o
  diálogo de destino (o ambiente importa: render de Lounge vai pro "Lounge"). A imagem vira JPEG (máx. 2400px, q .88),
  sobe pro bucket `projetos` em `<empresa>/<projeto>/renders/<uuid>.jpg` e entra em `ambiente.renders`.
- **Compartilhar**: link `projeto.html?p=<slug>` (relativo à pasta do catálogo — funciona no subcaminho do GitHub Pages)
  + senha de 6 números gerada no cliente (editável). **O PIN só existe em texto na hora de criar** (o banco guarda bcrypt):
  fica na memória da página (`S.pins`) enquanto a aba existir; depois só dá pra "gerar nova senha". "Copiar mensagem pro
  cliente" monta o texto pro WhatsApp; "Abrir apresentação" abre com `#pin=` no fragmento (nunca vai pro servidor e é
  apagado do endereço na hora).
- **Enviar pedido à Chiavari**: resumo por ambiente + observação → `projeto_enviar_pedido` guarda uma FOTOGRAFIA
  (`pedido_snapshot`: ambiente → item/quantidade/nome/referência), marca `pedido_enviado` e mostra um banner. Editar depois
  mostra "O projeto foi alterado depois do envio" (compara a assinatura do projeto atual com a do snapshot — não usa
  `updated_at`, que muda também quando a equipe muda o status) e o botão vira "Reenviar pedido". Equipe vê o snapshot ("Ver
  o que foi enviado") e troca o status (Pedido enviado → Em análise → Convertido em pedido).
  **Isto NÃO cria pedido no ERP** (`separacoes_pedidos`/`separacoes_itens`): elas reservam estoque, e uma solicitação de fora
  ainda não foi analisada. "Convertido" é só o status; virar pedido de verdade é um passo manual/futuro.

**Apresentação pública** (`projeto.html` + `projeto.css` + `projeto.mjs`, sem dependência do `catalogo.mjs`): tela de
senha (6 dígitos, envia sozinha ao completar) → capa (foto = 1ª renderização, senão fundo creme; noivos grandes, data por
extenso, local; logo do decorador ou da empresa) → barra fixa com os ambientes + "Baixar PDF" → um bloco por ambiente
(número, nome, observações, renderizações em grade/destaque com visualizador, móveis com foto, medidas em cm, material/cor e
`× quantidade`) → rodapé com contato do decorador. Ambientes sem itens/renders/notas não aparecem. Cores do decorador
(`cor_primaria/secundaria`, só se forem hex válidos) entram por `--pj-ink/--pj-accent`. **Nunca mostra preço** (o teste
varre o texto por "R$/valor/preço/locação"). `noindex`.
**PDF = impressão do navegador** com um `@media print` próprio (capa numa página, cada ambiente em página nova, peças e
fotos sem corte, navegação escondida) — não há biblioteca de PDF no projeto. "Baixar PDF" antes carrega todas as imagens
lazy, senão sairiam em branco. Verificado: `page.pdf()` gera 5 páginas pro caso de teste.

**Banco** (`supabase/migrations/20260920000100_projetos.sql`, aplicada com `db push --linked`): tabela `projetos`
(noivos/data/local `NOT NULL` com checagem de vazio; `dados jsonb` = `{ambientes:[{id,nome,itens:[{item_id,quantidade}],
renders:[{id,url,path,origem,criado_em}],notas}]}`; status `rascunho|pedido_enviado|em_analise|convertido`; `slug` único,
`pin_hash`, `pin_tentativas`, `pin_bloqueado_ate`, `compartilhar`, `pedido_snapshot`). RLS só pra equipe da empresa; o
**decorador não tem `auth.uid()`**, então TODO acesso passa por RPCs `security definer` (`projeto_listar/obter/criar/
salvar/excluir/compartilhar/enviar_pedido`, `projeto_atualizar_status` só equipe, `projeto_publico` anônima) que resolvem o
chamador em `projeto_ctx(p_token, p_empresa_id)`: token do catálogo (via `catalogo_validar_sessao`) → só os PRÓPRIOS projetos
(`cliente_id`); sem token → exige login da equipe (`funcionario_pode ... comercial.catalogo.visualizar`), vê a empresa
toda. `projeto_publico`: 5 senhas erradas bloqueiam o link por 15 minutos; devolve nome/foto/medidas/material/cor dos itens,
o decorador e a empresa — **nenhuma coluna de preço**. Bucket `projetos` (público pra leitura, 10MB, jpeg/png/webp):
upload/remoção só em `<empresa>/<projeto>/…` de um projeto que existe (`projeto_existe`).
**Verificado contra o banco/Storage reais, tudo desfeito depois**: bloco SQL numa transação que termina em `raise
exception` (só assim dá pra ler o resultado com `db query -f` e ainda fazer rollback) cobrindo campos obrigatórios, PIN
inválido, bloqueio por 5 erros, link desligado, "anon não executa as funções internas"; e um teste com **dois
decoradores** (2º criado temporariamente): o segundo não lista/lê/salva/exclui/compartilha o projeto do primeiro, token
inválido e "sem token e sem login" falham, projeto criado pela equipe não aparece pro decorador, decorador não muda o
status. Storage com a chave anônima de verdade: upload no caminho certo 200; projeto inexistente, empresa errada e
`image/svg+xml` recusados; leitura pública 200; remoção 200. (**A URL pública pode continuar respondendo por um tempo
depois de remover o arquivo — cache do CDN**, não é falha da política.)

**Autosave**: `marcarSujo()` agenda `salvarAgora()` (800ms); salvamentos nunca se sobrepõem e uma edição feita DURANTE um
salvamento deixa o projeto "sujo" de novo (`S.rev`) em vez de ser dada como salva. Salva ao voltar pra lista, ao trocar de
projeto, ao sair do overlay (`closeCatalogProjetos`), antes de compartilhar/enviar e quando a aba fica oculta
(`visibilitychange`). **Duas abas editando o mesmo projeto: vence a última que salvar** (não há controle de conflito —
sem pedido, não implementado).

**Pegadinhas achadas construindo (todas viraram teste)**
- Popover do dock fechava na hora: o clique no dock re-desenha o HTML dele, e o listener global de "clique fora" via o
  `event.target` já fora do documento (`closest("#catalogProjetoDock")` → `null`). Corrigido com `event.composedPath()`.
- O aviso "alterado depois do envio" não aparecia: o banner só era repintado no envio. `pintarNavegacao()` (chamada em toda
  edição de dados) agora repinta o banner também.
- O mock do teste reconhecia o decorador como "equipe com login direto" porque `auth.getUser` devolvia um usuário sempre —
  só quando NÃO existe sessão Supabase Auth o catálogo cai no login do decorador. Mocks de `auth` precisam depender do
  cenário.
- Chip "＋" no canto do card inteiro cobria o texto do card horizontal; ficou dentro de `.catalog-grid-card-photo`
  (`position:relative`).
- Mock em variável de JS não sobrevive a `page.reload()` — o banco de mentira mora em `sessionStorage`, semeado ANTES do
  `installMock`.

Testes: `tests/catalogo-projetos-browser.cjs` (3 cenários: decorador ponta a ponta — criar com validações, ambientes,
"＋" sem abrir o item, dock, troca de ambiente, autosave agrupado, quantidades, notas, render salva no ambiente escolhido
com o caminho que a política do Storage exige, compartilhar/PIN/desativar, enviar pedido, aviso de alteração, projeto
ativo lembrado após recarregar, mobile sem overflow, excluir; equipe — vê todos, filtro de pedidos, snapshot, muda o
status com `p_empresa_id` e sem token; apresentação pública — senha errada/certa, `#pin=`, bloqueado, link inexistente, cor
do decorador, sem preço, lightbox, PDF, mobile). Também varre o texto do módulo: nada abaixo de 12px. `catalogo-portal-` e
`catalogo-menu-browser.cjs` ajustados pra 4 zonas no Portal. Cache-busting `?v=20260920-projetos5`. **Botão "Adicionar ao projeto" da página do item ficou discreto** (pedido: "muito chamativo, precisa ser mais clean"): antes era uma pílula cheia e escura de largura ~300px, mais forte que o próprio móvel; agora é um contorno fino sem preenchimento do tamanho do texto (`align-self:flex-start`, 36px de altura, "＋" na cor terrosa, hover/adicionado só trocam a cor do contorno). O chip "＋" dos cards já era discreto (só aparece no hover).

**Foto dos noivos + tela inteira (pedido logo depois, com print do espaço de trabalho real)**: *"quero que ocupe o espaço da tela inteira, está com muitas bordas nas laterais, outra coisa, quero que seja possível colocar a foto dos noivos"*.
- **Tela inteira**: `.cpj-wrap` perdeu o `max-width:1280px` e a margem automática — o respiro lateral é o mesmo do cabeçalho do catálogo (`clamp(20px,2.2vw,40px)`), então o conteúdo alinha com a logo. Como o conteúdo agora cresce, as grades encheram por `auto-fill` em vez de largura fixa: lista de projetos em colunas (`minmax(min(520px,100%),1fr)`), móveis `minmax(min(380px,100%),1fr)`, renderizações `minmax(min(280px,100%),1fr)`; navegação de ambientes 260px. Vale para lista e espaço de trabalho. A apresentação pública NÃO mudou (`.pj-content` continua 1240px, é um documento de leitura, não uma tela de trabalho). Teste mede as folgas do cabeçalho do projeto em 1500 e 1900px (≤41px de cada lado).
- **Foto dos noivos** (opcional): mora em `projetos.dados.foto_casal = {url, path}` — dentro do mesmo jsonb dos ambientes, então nenhuma coluna nova; `normalizar()` preserva chaves que não conhece, e `projeto_salvar` grava `dados` inteiro, então ela acompanha todo salvamento. Migration `20260920000200_projetos_foto_casal.sql` só reescreve as duas funções que DEVOLVEM dados: `projeto_resumo` (novo campo `foto_casal_url`, pro cartão da lista) e `projeto_publico` (`projeto.foto_casal`, só a URL — o `path` não sai na apresentação pública). Verificado no banco real numa transação desfeita (sem foto → `null`; com foto → URL no resumo e na apresentação; nenhum campo de preço).
  - Entradas: campo "Foto dos noivos (opcional)" no diálogo de criar projeto (com prévia e "Remover") — **a foto só sobe DEPOIS de o projeto existir** (a política de upload do bucket `projetos` exige `projeto_existe`), então o arquivo escolhido fica na memória do diálogo e `fluxoCriarProjeto()` chama `definirFotoCasal()` logo após criar; e o círculo ao lado do nome no cabeçalho do projeto (clicar = escolher/trocar, `×` = remover, aparece no hover/foco e sempre em toque).
  - `definirFotoCasal()`: só JPG/PNG/WebP até 20MB; reaproveita `paraJpeg()` (mantém a proporção, máx. 1600px, JPEG .88 — o enquadramento em círculo é do CSS, `object-fit:cover` com `object-position:center 30%` porque rosto costuma ficar na parte de cima; **não há editor de recorte**, se pedirem arrastar/zoom é o mesmo padrão do editor de fotos do item); sobe em `<empresa>/<projeto>/casal/<uuid>.jpg`, e a foto anterior é apagada do Storage (melhor esforço). Excluir o projeto agora apaga as pastas `renders` E `casal`.
  - Onde aparece: cabeçalho do projeto (círculo de 100px, 76px no celular), cartão da lista (50px ao lado do nome) e **capa da apresentação** (círculo de 132–188px branco com sombra, acima de "Projeto do evento"; no PDF sem sombra, 46mm). Sem foto, tudo continua como antes.
  - Testes: criar com foto (prévia, desistir, escolher de novo) → sobe em `company/proj-1/casal/…jpg`, entra em `dados.foto_casal` e no cabeçalho; trocar pelo cabeçalho (nova sobe, a antiga é removida do Storage); remover (`foto_casal` some do `dados` e do Storage); adicionar de novo; a foto acompanha os salvamentos seguintes; cartão da lista com avatar; apresentação com o círculo (proporção 1:1, `border-radius:50%`) e sem ele quando não há foto.

**Renderização leva os móveis da composição junto (pedido logo depois, com print de um "Lounge" com 0 itens e a renderização dele salva)**: *"quando eu criar uma composição dentro do 3D, renderizar e adicionar ao projeto, eu quero que os móveis venham junto, os mesmos móveis utilizados na composição"*.
- **Como**: quando a IA devolve a imagem, Composições (`catalogo-lounge.mjs`) e 3D Livre (`catalogo-studio3d.mjs`) chamam `window.catalogRegisterRenderItems(src, objetos)` (uma linha em cada, mesma ponte de `catalogNotify`); `catalogo-projetos.mjs` conta os móveis por `itemId` (uma entrada por peça na cena, então 2 poltronas iguais = quantidade 2) e guarda a lista **atrelada à IMAGEM** (`composicoes`, as últimas 8, comparadas pela URL/data URL). Assim dá pra mexer na composição — ou gerar outra — e ainda salvar a renderização antiga com os móveis certos. A lista é tirada no CLIQUE de renderizar, não quando a imagem chega (a IA leva ~2 min; mexer no 3D nesse tempo não pode mudar os móveis daquela imagem).
- **No diálogo "Salvar renderização"** aparece "Levar também os móveis desta composição — 1× Sofá Um, 3× Sofá Dois", **já marcado**; desmarcar salva só a imagem. Imagem sem composição por trás (tecido personalizado) não mostra a pergunta.
- **Regra de quantidade**: cada móvel entra no ambiente escolhido com a quantidade da composição, mas **nunca soma com o que já estava lá** — vale o maior (`levarMoveisParaAmbiente()`). Salvar 2 ângulos da mesma composição não dobra os móveis, e 24 cadeiras já no ambiente não viram 2. O aviso diz quantos vieram ("1 móvel · Cerimônia · Ana e Bruno").
- **Achado no Composições, não corrigido de propósito**: as peças da cena do Lounge nunca guardaram o item em `userData.item`, então o `objects` que já é ENVIADO À IA (`loungeComposedObjects()`) sai com `itemId`/`itemName` `undefined` (o 3D Livre manda os dois). Não mexi nisso: o prompt/payload do Lounge foi calibrado em várias rodadas de fidelidade com o usuário (ver "Bug real: renderização IA do Lounge...") e mudar o que a IA recebe é decisão dele. Pros móveis do projeto foi criado `loungeCompositionItems()`, que lê o item escolhido em cada papel (`ui.selection`) × as peças de cada papel, sem tocar no payload. Se quiser dar nome/id à IA, é `root.userData.item = item` em `placeRole()` — mas teste a fidelidade antes.
- Testes: `tests/catalogo-projetos-browser.cjs` (caixa marcada e com a lista certa; Sofá Um ×1 numa Cerimônia que já tinha ×2 não soma, Sofá Dois ×3 entra; desmarcada = só a imagem; a imagem mais recente vale quando a mesma URL foi registrada de novo; tecido sem caixa; pedido soma os móveis que vieram), `tests/catalogo-lounge-browser.cjs` e `tests/catalogo-browser.cjs` (o módulo realmente registra os móveis da cena quando a IA devolve — sofá + 2 poltronas iguais no Lounge, 1 móvel no 3D Livre). Cache-busting `?v=20260920-projetos4` / `20260920-moveis`.

**Mapa de posições das renderizações no ambiente (pedido: *"no projeto que a pessoa está editando eu quero que mostre onde vai ficar as futuras fotos renderizadas, pra pessoa saber onde ficará posicionado"*)**: o bloco "Renderizações" do espaço de trabalho (`pintarPainel()`) deixou de ser só uma lista de miniaturas + um texto de "nenhuma ainda". Agora é um **mapa com a MESMA disposição da apresentação** (`rendersMapaHtml()`, `catalogo-projetos.mjs`): as imagens já salvas ocupam as posições reais, numeradas (`.cpj-slot-num`), e as próximas viram **espaços tracejados** ("Renderização 2 — aparece aqui na apresentação", ícone de câmera). Em **destaque** (padrão) a posição 1 ocupa a largura toda (16:9, com a nota "Destaque · tamanho grande") e as demais ficam em 2 colunas 4:3; em **grade** são todas 4:3, duas por linha; no celular tudo empilha em 1 coluna, como a apresentação. Mostra sempre 3 posições (4 em grade) e, quando já há mais que isso, mais UM espaço pra próxima. A **1ª renderização do PROJETO** (a do primeiro ambiente que tiver alguma — mesma regra de `primeiraRender` em `projeto.mjs`) leva a nota "Também é a foto da capa" quando o estilo de capa do layout usa foto (`foto`/`lateral`); ambiente sem imagem mostra o espaço 1 como destaque, mas sem a nota de capa se outro ambiente já a fornece. Um texto curto embaixo explica ("a primeira em destaque e as demais lado a lado… com poucas imagens a apresentação se ajusta ao espaço").
  - **Segue o layout do projeto**: `carregarLayoutDoProjeto()` chama `layout_listar(p_projeto_id)` ao abrir o espaço de trabalho, escolhe o layout do projeto → o padrão do dono → o visual original, e guarda só o que o mapa precisa em `S.mapaRender` (`modo` destaque/grade e `capa`). Trocar o layout no diálogo "Link e PDF" refaz a leitura e o mapa muda por trás; voltar da tela de Layouts (`pintarTela`) também. Só `[data-cpj-renders]` é redesenhado (`atualizarMapaRenders()`), **não** o painel inteiro — repintar tudo perderia o foco/o que a pessoa estiver digitando nas observações. Sem resposta do banco o mapa usa o visual original (destaque); nada quebra.
  - **Honestidade sobre a aproximação**: com 1 ou 2 imagens a apresentação NÃO usa a disposição de 3 (1 = larga, 2 = lado a lado, ver `.pj-renders-1/-2` em `projeto.css`); o mapa sempre mostra a disposição "completa" e o texto avisa disso. Não tenta prever a contagem final.
  - Teste: `tests/catalogo-projetos-browser.cjs` (1 salva + 2 espaços; numeração 1/2/3; nota de destaque e de capa na legenda; geometria real — posição 1 ocupa a largura toda, 2 e 3 lado a lado abaixo; ambiente vazio com 3 espaços sem nota de capa) e `tests/catalogo-layouts-browser.cjs` (projeto sem escolha usa o padrão "grade" = 4 posições; trocar pro Editorial no diálogo muda o mapa pra "destaque" = 3). Cache-busting `?v=20260921-mapa-renders`.

**Não implementado (não pedido) — possíveis próximos passos**: converter o pedido recebido em `separacoes_pedidos` de
verdade; PDF gerado no servidor (hoje é a impressão do navegador); pré-visualização da apresentação sem precisar ativar o
link; reordenar ambientes; duplicar projeto; comentários do casal.

## Cores disponíveis no card da grade de itens

Pedido do usuário, com print da grade de "Estofados" e da fileira de círculos da página do item: *"nessa tela aqui dos itens quero que apareça as cores que temos disponíveis quando tiver mais de uma cor do mesmo item, igual"*.

- **Só com 2+ cores do MESMO item** (o grupo de variantes de `agruparVariantes()`: mesma categoria/nome/material/medidas, cor diferente — a grade já mostrava um card por grupo). Item de uma cor só não muda nada. Só na GRADE (e nos resultados dos filtros de "Categorias", que usam o mesmo `gridCardMarkup()`); o mosaico e a imersiva ficaram como estavam (a imersiva já tinha os círculos).
- **Bolinhas DISCRETAS** (a 1ª versão usava os mesmos círculos da página do item — 44px com o nome da cor embaixo — e o usuário achou "muito grande, precisa ser um pouco mais discreto"): agora são bolinhas sem texto embaixo — a 2ª versão de 24px ficou "muito pequena" e a atual, de **32px** (34px em tela de toque), é o meio-termo pedido com a foto da cor e SEM texto embaixo (o nome fica em `title`/`aria-label`; `variantLabel()` é função única pros dois lugares), contorno de 1px e 2px terroso na ativa, sem sombra nem "pulo" no hover, logo abaixo das medidas, dentro do card. Cada `<span>` tem `padding:3px`, então a área de clique (~38px) é maior que o desenho. As regras são escopadas em `.catalog-grid-swatches`, então os círculos da página do item não mudaram. Como o card inteiro já é um `<button>` e um botão não pode conter outro, cada círculo é `<span role="button" tabindex="0" data-grid-variant>` (Enter/Espaço tratados no `keydown` delegado; o clique é checado ANTES do `data-grid-item` em `bindInteractions()`, senão abriria o item). Mesmo padrão do "＋" do Projetos.
- **Clicar numa cor troca o PRÓPRIO card, sem abrir o item** (`selectGridVariant()`): foto, nome, medidas, círculo ativo (`aria-pressed`) e o `data-grid-item` do card, que passa a representar aquela cor. O "＋ adicionar ao projeto" do card também passa a adicionar a cor que está na tela (`data-projeto-add`).
- **Abrir o card abre a COR escolhida**: a seção imersiva de um grupo é desenhada com o id do item "principal" (`produto-<id>`), então `showItemSection()` acha a seção pelo principal e chama `applyVariant()` nela — **de forma síncrona logo depois de desenhar as seções**, antes do primeiro quadro pintado, pra não aparecer um pisca da cor principal antes de trocar (a foto principal ainda troca num fundido curto, `renderMainSlide`, ~120ms). Vale também pra abrir um item dos resultados filtrados (`applyView(FILTER_VIEW, {focusItemId})`). Antes, `openImmersiveFromGrid()` sempre rolava pro `produto-<id do card>`, o que para uma cor não-principal simplesmente não existia.
- Teste: `tests/catalogo-cores-grade-browser.cjs` — 3 cores viram 1 card com 3 círculos e nomes (item de uma cor não tem); bolinha de ~32px (30–36px) abaixo das medidas e dentro do card; clicar troca foto/nome/ativo sem abrir o item; o ＋ acompanha a cor; Enter troca; abrir o card cai na cor escolhida (`data-product-id`, círculo ativo e foto principal); card de uma cor abre normal; celular sem overflow e sem círculo fora do card. Cache-busting `?v=20260920-cores-grade3`.

## Layouts de apresentação (cada decorador cria o seu e escolhe qual usar no link e no PDF)

Pedido do usuário: *"cada decorador possa criar o layout dele de projeto, assim cada decorador pode imprimir de uma forma diferente um do outro, quero que ele possa criar mais uma versão também, aí depois ele decide em qual layout [gerar]"* — corrigido no meio: *"imprimir não, desculpa, gerar o link e o PDF"*. Ou seja: um **layout** é o jeito de a apresentação do projeto (a página `projeto.html`) ser desenhada; o decorador pode ter vários e escolhe um por projeto, e essa escolha vale pro **link do casal E pro PDF**.

**Modelo de dados** (`supabase/migrations/20260921000100_projeto_layouts.sql`, aplicada com `db push --linked`): tabela `projeto_layouts` (`empresa_id`, `cliente_id` = dono decorador ou NULL = equipe, `nome` ≤60, `config jsonb`, `padrao`, até 20 por dono) e `projetos.layout_id` (FK `on delete set null` — apagar o layout não apaga projeto nenhum, ele só volta ao padrão). **Um padrão por dono** (índice único parcial em `(empresa_id, coalesce(cliente_id, 0…))`). **Resolução do layout de um projeto**: `projetos.layout_id` → senão o layout marcado `padrao` do dono → senão o visual original embutido (`LAYOUT_PADRAO`, igual ao que já existia antes desta feature). Mesma separação de acesso do resto do Projetos: o decorador não tem `auth.uid()`, então tudo passa por RPCs `security definer` que resolvem o chamador em `projeto_ctx(p_token, p_empresa_id)` (token → só os PRÓPRIOS layouts; sem token → equipe, com os layouts da equipe, separados dos de qualquer decorador). RPCs: `layout_listar` (por dono, ou pelo dono de um projeto), `layout_salvar` (cria/atualiza; `p_padrao=true` desmarca os outros), `layout_excluir`, `projeto_definir_layout`, `projeto_previa` (só o dono; devolve o projeto + os layouts dele) e `projeto_apresentacao(r)` — payload único compartilhado por `projeto_publico` (link) e `projeto_previa`, então o link e o PDF nunca divergem. O servidor só confere "é objeto e tem <20000 caracteres"; **quem valida o conteúdo é o cliente** (abaixo). Verificado contra o banco real com transações revertidas (2 decoradores: um não vê/edita/apaga/escolhe layout do outro; token inválido e "sem token e sem login" falham; apagar o layout solta os projetos; um padrão por dono).

**Formato do layout** (versão ORIGINAL, com ~30 opções — a lista completa de hoje, com ~82, está em "Mais opções no layout" logo abaixo; o mecanismo descrito aqui não mudou) (`projeto-layout.mjs`, compartilhado pelo editor e pela página): `capa{estilo foto|limpa|lateral, alinhamento centro|esquerda, fundo creme|branco|escuro, textoAbertura, mostrarFotoCasal/Logo/Data/Local}`, `cores{usarDoDecorador, principal, destaque}`, `fonte` (classica/moderna/elegante — família do Google Fonts carregada só se preciso), `resumo`, `ambientes{numeracao, notas, renders destaque|grade, umaPorPagina}`, `moveis{estilo cartao|limpo, colunas 2-5, medidas, materialCor, quantidade}`, `rodape{mostrar, mensagem, contato}`, `pdf{orientacao retrato|paisagem}`. **`normalizarLayout()` é a única porta de entrada**: enums fechados, cor só `#rgb/#rrggbb` (nada de CSS solto), inteiros com limite, texto com tamanho máximo e sem caracteres de controle, chaves desconhecidas descartadas, idempotente. Nada do jsonb do banco vira CSS/HTML sem passar por ela (o teste tem um layout adulterado com `<img onerror>`/`url(//evil)`). Layouts prontos pra começar (`MODELOS`): Clássico (= o visual original), Moderno, Editorial (paisagem), Minimalista.

**Telas** (`catalogo-layouts.mjs/.css`, dentro do overlay Projetos): botão **Layouts** na lista de projetos → lista de cards (miniatura de capa desenhada em CSS a partir das opções, selo "Padrão", Editar / Duplicar / "Usar como padrão" / Excluir; vazio mostra os 4 modelos). **Criar**: nome + "Começar de" (modelo pronto ou cópia de um layout seu) — o registro nasce no banco na hora e o 1º layout do decorador vira o padrão. **Editor**: formulário em 8 grupos à esquerda (Capa, Cores, Fonte, Página, Ambientes, Móveis, Rodapé, PDF — eram 7 até "Mais opções no layout") e, à direita, um `<iframe src="projeto.html?modo=editor">` com a apresentação REAL atualizando a cada clique. Se há um projeto ativo a prévia usa os dados dele; senão monta um exemplo com itens do próprio catálogo (2 ambientes). **Autosave** (800ms, mesma disciplina do projeto: contador de revisão, nunca dois salvamentos sobrepostos, salva ao sair/`closeCatalogProjetos`). Editar um layout muda na hora todo projeto que o usa (o editor avisa disso).

**Sem barra de rolagem própria no editor** (pedido logo depois: *"não quero que o projeto fique com barra vertical, quero que ele vá descendo junto com o html e a coluna de edição"*): a coluna de edição (`.lay-form`, antes `max-height`+`overflow-y:auto`) e a prévia (`<iframe>` de altura fixa, com a barra da própria apresentação dentro) rolavam cada uma por dentro. Agora **a página inteira rola e as duas colunas descem juntas**: `.lay-form` mostra tudo, `.lay-previa` deixou de ser `sticky`, e o iframe tem a **altura do conteúdo da apresentação**. Como: em `?modo=editor` a `projeto.html` mede o `#app` com `ResizeObserver` e avisa o catálogo com `pj-altura` (`acompanharAltura()` em `projeto.mjs`); `ajustarAlturaPrevia()` em `catalogo-layouts.mjs` estica o iframe (`style.height`, teto 60000px). **Mede o `#app`, não o documento** — o `scrollHeight` do documento nunca fica menor que o iframe, então a prévia jamais encolheria. **Crescer é na hora; encolher só depois de 500ms estável**: a cada redesenho as imagens colapsam por um instante, e encolher-e-crescer faria a página (que rola por fora) dar um pulo enquanto a pessoa mexe nas opções. **Nada pode depender da altura da janela dentro do iframe** (`svh/vh`): a capa é `min-height:100svh`, e num iframe que cresce com o conteúdo isso realimentaria sem parar — por isso `html[data-modo="editor"]` dá à capa/mensagem/foto lateral alturas que só dependem da LARGURA (`clamp(520px,62vw,760px)` etc.), tira o `sticky` da barra de ambientes, esconde o `overflow` do `html` e desliga o visualizador de foto (um `position:fixed` num iframe de milhares de pixels ficaria fora da vista). O iframe leva `scrolling="no"`. O modo `?modo=previa` (aba nova) e o link público NÃO mudaram — lá a página rola normalmente. Teste (`tests/catalogo-layouts-browser.cjs`): sem `overflow` na coluna, iframe maior que a janela e igual ao conteúdo, prévia não-`sticky`, rolar a página leva a prévia junto (e o iframe não rola por dentro), ligar/desligar o rodapé cresce/encolhe o quadro, altura estável depois de parar. Cache-busting `?v=20260921-previa-inteira`.

**Mais opções no layout (pedido: *"quero mais coisas pra editar, e eu gosto dessa forma que você pensou, que a pessoa seleciona os estilos diferentes e as opções de como fica no layout, achei intuitivo e prático... mantenha isso, só coloque mais opções, alterar a cor do fundo por exemplo... bem mais, porque a ideia é que um projeto de um cliente fique bem diferente de outro"*)**: de ~30 para **~82 opções**, no MESMO formato de sempre (opções em botões, liga/desliga, seletor de cor, texto curto) — nenhum controle novo foi inventado; só ganharam **títulos de seção** (`.lay-sub`: Capa → Estilo / Textos / Fotos e logo; Cores → Fundos; Página → Navegação / Fotos…) pra a lista longa não virar um paredão.
  - **Capa** (+15): altura (tela toda/alta/média/compacta), fundo "Outra cor" com seletor (`capa.corFundo`; o texto vira claro/escuro sozinho), quanto a foto escurece (não/suave/forte), moldura fina, tamanho do nome (discreto→enorme), nome em MAIÚSCULAS, frase abaixo do local, linha fina, "Ver o projeto", formato (redonda/cantos suaves/quadrada) e tamanho da foto dos noivos, posição (junto do texto/esq./centro/dir.) e tamanho da logo.
  - **Cores** (+3 seletores): **fundo da página**, **tom suave** (faixas, capa e rodapé "creme") e **fundo dos cartões**. **Fonte** (+2 grupos de opção e +7 famílias): Editorial, Romana (Cinzel), Manuscrita (Great Vibes), Livro, Geométrica, Leve, além das 3 de antes; tamanho do texto (15–19px, escala tudo porque `html{font-size:var(--pj-base)}`) e peso dos títulos (400/500/600 — todas as famílias já trazem esses pesos no link do Google Fonts).
  - **Página** (grupo NOVO): largura do conteúdo (980/1240/1520/tela toda), espaço entre seções, cantos (retos→bem redondos), linha entre ambientes (fina/na cor de destaque/nenhuma), barra de ambientes (fixa/rola com a página/escondida — escondida só tira a LISTA; o botão "Baixar PDF" continua se estiver ligado), estilo dos botões da barra (pílulas/sublinhado), botão "Baixar PDF", efeito nas fotos, ampliar a foto ao clicar.
  - **Ambientes** (+10): tamanho, alinhamento e MAIÚSCULAS no título, contagem de peças, renderizações em 1/2/3 colunas, formato (16:9, 4:3, quadrado, em pé), espaço entre elas (coladas→amplo), **o que vem primeiro (renderizações ou móveis)** e o título da lista de móveis (vazio = some). **Móveis** (+9): espaço entre cartões, levantar ao passar o mouse, formato/ajuste/fundo da foto, nome em MAIÚSCULAS, alinhamento do texto, onde aparece a quantidade (selo no canto / junto do nome) e estilo do selo. **Rodapé** (+7): fundo, tamanho e itálico da mensagem, assinatura, logo, nome da marca e crédito "Mobiliário: …" ligáveis. **PDF** (+4): tamanho do papel (A4/Carta/A3), margem, capa ocupando ou não a página inteira, numerar as páginas.
  - **Contraste automático** (`temaDaPagina()`, `textoSobre()` em `projeto-layout.mjs`): quem escolhe uma página escura (ou cartões escuros/claros) NÃO precisa lembrar de trocar a cor do texto — o texto da página, dos cartões, do rodapé e da capa é a cor principal quando dá contraste ≥4,5 (WCAG) contra o fundo e, senão, claro/escuro conforme o fundo; o cinza suave e as linhas de uma página escura são calculados do texto claro. Os botões usam a cor principal quando ela se destaca do fundo. Numa página clara o cinza suave (#77716a) e a linha (#e7e0d6) continuam os de sempre — o layout padrão renderiza IGUAL ao de antes (o teste confere as variáveis).
  - **Arquitetura — uma tabela só**: `VALORES` (listas fechadas por caminho `grupo.campo`), `LIMITES`/`LIMITES_TEXTO`/`CAMPOS_COR` e as tabelas de "o que cada opção vale" (`LARGURA`, `CANTOS`, `PROPORCAO_RENDER`…) ficam em `projeto-layout.mjs`; `normalizarGrupo()` normaliza cada grupo A PARTIR DO PADRÃO (só existem as chaves que o padrão conhece; o tipo do valor padrão diz como validar), então **acrescentar uma opção = 1 linha no `LAYOUT_PADRAO` + 1 no `VALORES`/tabela + 1 no `GRUPOS` do editor + o CSS**. `variaveisCss()` devolve TODAS as variáveis `--pj-*` que a página usa e `projeto.mjs` só as aplica; `regraPagina()`/`paginaPdf()` geram o `@page` (papel, orientação, margem, número de página — margin box `@bottom-center` só funciona em navegadores recentes, os antigos ignoram) e a altura da capa impressa (270mm em A4 em pé, 178mm deitado, como sempre; fora da página inteira = fração da altura de capa escolhida). Nada do layout vira CSS por texto solto: o layout guarda só a CHAVE da opção, e o valor CSS vem das tabelas. `.pj-root` ganhou uns 25 `data-*` (`data-nav`, `data-rcols`, `data-ordem`, `data-selo`…) e o CSS de `projeto.css` foi reescrito em cima de variáveis (cor do rodapé, do cartão e da capa deixaram de ser regras por `data-fundo`). **Compatibilidade**: layout salvo antes só tem as chaves antigas → o resto cai no padrão, e a logo do rodapé (que antes seguia a da capa) herda `capa.mostrarLogo` quando `rodape.mostrarLogo` não existe. Nenhuma migration: o servidor continua só conferindo "é objeto <20000 caracteres" (um layout completo tem ~3KB).
  - **Modelos**: 6 (Clássico, Moderno, Editorial, Minimalista + **Romântico** — rosa suave, manuscrita, moldura, cantos bem redondos — e **Noturno** — página escura com dourado, nome em maiúsculas sobre foto escurecida, letras romanas). Os 4 antigos não mudaram.
  - **A prévia do editor sem projeto aberto agora tem renderizações e foto dos noivos de exemplo** (as fotos do catálogo fazem o papel; `amostra()` em `catalogo-layouts.mjs`) — antes o exemplo não tinha nenhuma, e as opções de fotos (colunas, formato, espaço, ordem, escurecer, foto dos noivos) não tinham o que mostrar.
  - **Pendência conhecida**: o formulário ficou longo (~6000px) e a prévia (altura do conteúdo, sem barra própria — pedido anterior) é mais curta: editando os grupos lá de baixo (Rodapé, PDF) a parte correspondente da prévia já passou pra cima. Possíveis saídas, se incomodar: grupos recolhíveis/em abas, ou uma barra fixa com atalhos pros grupos. Não feito por não ter sido pedido e por mudar o que aparece de cara.
  - **Testes**: `tests/projeto-layout-opcoes.test.mjs` (toda opção do layout tem controle no editor e vice-versa — mesma lista de caminhos; os valores do editor = os do normalizador; CADA valor de CADA opção vira variável válida e regra `@page` válida; layout antigo continua igual e o padrão reproduz as variáveis de sempre; valores hostis caem no padrão; contraste de todos os modelos ≥4,5; PDF A4/Carta/A3, margem e capa fora da página inteira) e `tests/catalogo-layouts-browser.cjs` (editor: ≥8 seções internas, ≥80 controles, cada opção nova mexe na página ao vivo — altura da capa, largura, cantos, tamanho do texto, fonte Romana, formato das fotos, contagem, quantidade, fundo da capa em "Outra cor", página escura com texto que se ajusta; página pública com ~35 opções juntas: contraste real medido no navegador, ordem móveis/renderizações, barra escondida com botão PDF, título de móveis vazio, sem ampliar foto, quantidade junto do nome, assinatura, PDF em **Carta** = 612×792pt; celular com texto muito grande sem overflow). Cache-busting `?v=20260921-mais-opcoes`.

**Escolher e gerar** — o botão de cima do projeto virou **"Link e PDF"** (era "Compartilhar"; `✓` quando o link está ativo). O diálogo tem um bloco novo, **Layout da apresentação**: `<select>` com os layouts do dono ("Usar o meu layout padrão"/"Visual original do sistema" + cada um, o padrão marcado), que grava `projeto_definir_layout` ao mudar, mais **Pré-visualizar**, **Gerar PDF** e **Gerenciar layouts**; abaixo continuam o link e a senha de sempre. O link público usa o mesmo layout (o `projeto_publico` devolve `layout`).

**Página `projeto.html` — 3 modos** (`projeto.mjs`, reescrita orientada a dados: `aplicarTema()` põe as variáveis `--pj-*`, a fonte e o `@page`; `renderizar()` monta o HTML a partir do layout normalizado): (1) **link público** (senha de 6 números, igual antes); (2) **`?modo=previa`** — aberta pelo dono com `window.open` (que TEM que rodar dentro do clique, antes de qualquer `await`, senão o navegador bloqueia o pop-up); os dados NÃO vão na URL: a aba avisa `pj-pronto`, quem abriu responde `pj-dados` com o resultado de `projeto_previa` — só aceita mensagem da MESMA origem e da janela que a abriu (`event.source`). Tem barra própria com um `<select>` pra trocar de layout (só na tela, sem gravar) e **Gerar PDF**; `&pdf=1` já imprime sozinha quando as imagens carregam; (3) **`?modo=editor`** — dentro do iframe do editor: recebe `pj-dados` uma vez e depois `pj-layout` a cada alteração, sem barra.

**PDF = impressão do navegador ("Salvar como PDF")**, como já era: não há biblioteca de PDF no projeto e nada é gerado no servidor. O layout entra por um `<style id="pjPagina">@page{size:A4 retrato|paisagem;margin:12mm}` injetado + regras `@media print` (capa numa página, cada ambiente em página nova se `umaPorPagina`, peças e fotos sem corte). Verificado com `page.pdf({preferCSSPageSize:true})` lendo o `/MediaBox`: retrato = 595×842, paisagem = 842×595. **Limite honesto**: a pessoa precisa escolher "Salvar como PDF" no diálogo de impressão; o cabeçalho/rodapé do navegador ("Cabeçalhos e rodapés") é opção do próprio diálogo e o sistema não controla.

**Cores do decorador** (`coresEfetivas`): com `usarDoDecorador` ligado valem as cores do catálogo dele (`cor_primaria/secundaria`, `#rgb` ou `#rrggbb` válidos); senão as do layout. A equipe não tem "cores do meu catálogo" (não é decorador) — só as do layout.

**Pegadinhas achadas construindo (todas viraram teste)**
- O campo de nome do editor não salvava sozinho: o delegado ouvia `input[type="text"]` e o `<input class="lay-nome">` não tinha `type`. Todo campo do editor precisa de `type` explícito.
- Depois de "Usar como padrão" no editor, o card não subia pro topo da lista: `pintarLista()` ordena (padrão primeiro) no começo; o select do diálogo segue a mesma ordem (`['Usar o meu layout padrão','Moderno (padrão)','Editorial']`).
- A prévia de exemplo com 3 itens do catálogo caía toda num ambiente só (parecia que "ambiente" não funcionava) → o exemplo divide os itens em 2 ambientes (`Math.ceil(n/2)`).
- Teste com `window.open`: usar `browser.newContext()` (o popup herda rotas e `addInitScript`), stub de `window.print` via `context.addInitScript`, e o mock compartilhado em `tests/mock-projetos.cjs` (o banco de mentira mora em `sessionStorage`, porque variável de JS não sobrevive a `reload`).
- Cache-busting: `catalogo-layouts.mjs`, `catalogo-projetos.mjs`, `projeto*.{css,mjs}` e `catalogo.mjs` usam todos `?v=20260921-layouts` (havia um `layouts2` solto).

**Testes**: `tests/projeto-layout.test.mjs` (11 casos do normalizador: enums, cor sem CSS solto, colunas, texto, booleanos, chaves desconhecidas, idempotência, modelos, mesclar, cores efetivas) e `tests/catalogo-layouts-browser.cjs` (5 cenários: decorador cria/edita ao vivo/autosave/duplica/define padrão/apaga; diálogo "Link e PDF" escolhe layout + pop-up de prévia + pop-up de PDF com auto-print + editor com projeto real; página pública obedece ao layout, incluindo PDF paisagem e configuração adulterada; equipe; editor no celular) — também varre texto abaixo de 12px. `tests/catalogo-projetos-browser.cjs` passou a usar o mock compartilhado e espera "Link e PDF ✓". Suíte completa rodada de novo, tudo passando (`tests/catalogo-layout-browser.cjs`, antigo, continua quebrado como já registrado).

**Não implementado (não pedido) — possíveis próximos passos**: PDF gerado no servidor (arquivo pronto sem diálogo de impressão); reordenar/ocultar seções da apresentação; a equipe compartilhar layouts com os decoradores; escolher um layout diferente só pra um link específico (hoje é por projeto); miniatura da capa com a foto real do projeto.

## "Renderizar com IA" em Projetos > Plantas — tentado e revertido

Chegou a ser implementado por completo (botão na barra da planta, máscara + recomposição em canvas restringindo a
edição só aos móveis marcados, fotos dos ambientes como referência — pedido explícito do usuário, "renderize com as
imagens que colocamos... apenas nos móveis") e até publicado (`supabase functions deploy studio-ai-engine`,
autorizado pelo usuário). Mesmo com a garantia por pixel (verificada em teste automatizado), o usuário testou de
verdade e reportou que não estava funcionando; pediu explicitamente pra remover: *"REMOVA A IA DA PLANTA, NAO ESTA
FUNCIONANDO VAMOS DEIXAR APENAS NO 3D MESMO"*. Revertido por completo — botão, diálogos de confirmação/resultado,
todas as funções de preparo/composição no cliente (`catalogo-projetos.mjs`/`.css`), a política de prompt
`referencePolicy:"floor_plan_literal"` no servidor (`supabase/functions/studio-ai-engine/index.ts`, hoje
byte-idêntico ao commit anterior a essa tentativa) e o teste de regressão — nada disso existe mais no código, e a
Edge Function já foi republicada sem essa política. **Renderização por IA continua existindo normalmente nos
módulos 3D** (Composições/Módulo Lounge e 3D Livre/Estúdio de Ambientes, ver seções própria mais acima) — só a
tentativa de levar isso pra dentro da tela 2D de Plantas foi descartada. Registrado aqui só pra não propor essa
mesma ideia de novo se pedirem "IA na planta" no futuro — já foi tentada, publicada, testada de verdade pelo
usuário e rejeitada.

## Anti-flash da logo no menu principal (dashboard.html)

Mesma classe de bug do catálogo, só que na logo do menu superior do
próprio sistema: `<img id="sidebarLogo">` vem com a logo genérica
"Acervo" (`logo nova branca - sem fundo.png`) no `src` por padrão no
HTML, e antes só era trocada pela logo real da empresa (Chiavari) dentro
de `context.js`, depois de várias chamadas assíncronas ao Supabase
(`getSession`, `getUser`, busca da empresa) — nesse intervalo a logo
genérica pintava e sumia (reportado: "antes da logo da chiavari aparecer
pisca acervo tambem"). `companyTheme.js` já tinha um cache da logo em
`localStorage` (`easyloc_theme_<empresa_id>`) e já lia esse cache de
forma síncrona dentro de `applyForEmpresa()` — o problema não era a
ausência de cache, era o **momento** em que essa função era chamada (só
depois do `context.js` terminar sua cadeia de `await`s).

Corrigido com um `<script>` síncrono logo depois da `<img id="sidebarLogo">`
em `dashboard.html`, que lê `sessionStorage.empresa_id` +
`localStorage.easyloc_theme_<id>` diretamente e, se houver uma
`logo_url` em cache, já aplica o `src` e a classe `company-logo-active`
no `<body>` ali mesmo — antes do resto da página ser desenhado. A lógica
de cache-busting replica `EasyLocTheme.withCacheBust`
(`js/core/companyTheme.js`) byte a byte (mesma URL final) para que a
chamada redundante feita depois por `applyForEmpresa()` encontre o `src`
já igual e não reatribua nada. Sem cache (primeiro acesso em um
dispositivo novo, ou empresa sem logo configurada), o comportamento é o
mesmo de antes: fica a logo genérica até `context.js` resolver. Verificado
com Playwright, com e sem cache prévio, e com atraso artificial na
chamada de auth que precede `applyForEmpresa()`.

## "Montar Kit" virou tela (nao mais modal flutuante)

`Modulos/Estoque/CadastroItens/cadastro-itens.html` tem o botão "🧩 Montar
Kit" (`kits_openAdd()`) e o clique numa linha de tipo "Kit" na tabela
(`kits_openEdit(id)`, em `itens.tabela.mjs`). Os dois abriam
`#kitsModal`, um `.modal.el-modal` — caixa flutuante de altura fixa
(`max-height:90vh`) com scroll interno (`.item-layout{overflow-y:auto}`)
— pedido explícito do usuário pra virar **tela** (mesmo padrão de
Fornecedores/Clientes: `.el-page` que substitui a lista, sem altura fixa
nem scroll forçado), "compacto na parte de cima, bem distribuído, sem
barra vertical".

`#kitsModal` agora é `.el-page.kit-detail-view` (mostra/esconde com
`.hidden`, igual `mostrarDetalhesFornecedor()`/`mostrarListaFornecedores()`
em `fornecedores.js` — aqui as funções equivalentes são
`kits_mostrarTela()`/`kits_mostrarLista()` dentro de `kits.modal.mjs`).
Cabeçalho compacto (seta voltar + título + campo de descrição gerada numa
linha só), campos do kit numa grade de 12 colunas bem distribuída (4-5
campos por linha, mesmo padrão da correção de Fornecedores), foto menor
(140px em vez de 240px) ao lado dos campos em vez de empilhada acima.
"Componentes do Kit" continua como tabela, mas agora só ELA rola
internamente quando tem muitos componentes (`.kit-componentes-scroll{max-
height:46vh;overflow-y:auto}`) — a tela inteira não fica mais presa numa
caixa de altura fixa.

**Armadilha ao converter modal→tela nesse arquivo especificamente**:
`.container` (a lista de itens) nunca tinha um `</div>` de fechamento
explícito — o navegador só fechava sozinho no fim do `<body>`, então
`#itensModal` e `#kitsModal` ficavam **aninhados dentro** de `.container`,
não irmãos dela. Isso nunca deu problema enquanto o Kit era
`position:fixed` (um modal flutuante escapa do fluxo normal mesmo
aninhado), mas quebrou assim que virou uma `.el-page` de fluxo normal:
esconder `.container` (`display:none`) escondia o Kit junto, mesmo com a
classe `.hidden` removida dele — porque ele estava dentro do ancestral
escondido. Sintoma: tela em branco, elementos com `getBoundingClientRect()`
zerado mas `display` correto. Corrigido com um `</div>` explícito logo
após a `</section>` da tabela de itens, antes do `<!-- MODAL ITENS -->`.
**Se algum outro módulo antigo (fragmento, ainda não convertido) tiver o
mesmo padrão de contêiner sem fechamento explícito, checar isso ANTES de
converter qualquer modal dele em tela** — o sintoma (tela em branco, sem
erro de JS relacionado) não aponta óbvio pra causa.

**Bug pré-existente corrigido de brinde** (não pedido, mas travava
`kits_salvar()` para qualquer kit com ao menos um componente, então era
impossível testar a tela nova sem corrigir): a variável `kitId` era usada
no bloco de upload de foto e no insert de `kit_itens`, mas nunca era
declarada em lugar nenhum do arquivo — só existia `kitIdExistente` (lido
do input) e `kit`/`kit.id` (retorno do insert/update). Qualquer salvamento
com componente lançava `ReferenceError: kitId is not defined` antes de
chegar em `kits_closeModal()`. Corrigido com `const kitId = kit.id;` logo
após o insert/update, com uma checagem de erro antes (`if(error || !kit)`)
que também não existia. **Não corrigido** (fora do escopo pedido, mas
identificado durante essa mudança): editar um kit existente e salvar de
novo **duplica** as linhas de `kit_itens` — o salvamento sempre insere as
linhas visíveis sem apagar as antigas primeiro. Se alguém reportar
"componentes duplicados" num kit editado várias vezes, é essa a causa.

## Botão Salvar sempre no cabeçalho, nunca no rodapé

Pedido explícito do usuário: "Os botoes de salvar editar sempre devem
ficar no canto superior direito e nao no final da pagina igual eram nos
modais". As telas convertidas de modal→página (Fornecedores, Clientes,
Caminhões, Kit) ainda carregavam um resquício visual do modal antigo: o
cabeçalho (seta voltar + título) tinha virado tela cheia, mas o botão
Salvar continuava void num `.modal-footer`/`.modal-actions` grudado no
final do formulário — obrigando rolar a página inteira pra salvar.
Corrigido nos 4 lugares: o botão Salvar (e o lápis "Editar", quando o
módulo tem modo visualização/edição) agora mora dentro do próprio
`.modal-header`, como mais um filho depois do título — o título tem
`flex:1` (ou, no caso do Kit, o botão ganha `margin-left:auto` porque o
campo ao lado do título tem `max-width`), então qualquer botão colocado
depois dele cai automaticamente na borda direita do cabeçalho, sem precisar
de `position:absolute`. O rodapé (`.modal-footer`/`.modal-actions`) foi
removido de cada uma dessas telas — o botão "Voltar"/"Fechar" que ficava
lá também sumiu, já que a seta no cabeçalho já cobre a mesma ação.

Em Fornecedores, o botão Salvar ganhou um id estável
(`#btnSalvarFornecedor`) porque `fornecedores.js` o localizava antes por
`document.querySelector("#modalFornecedor .modal-footer .btn.primary")`
— esse seletor quebraria ao mover o botão pra fora do `.modal-footer`.
Em Clientes e Caminhões o botão já era localizado por classe
(`.btn-save`) ou id (`#btnSalvarCaminhao`), então só a posição no HTML
mudou, nenhum JS precisou ser tocado. **Esse é o padrão a seguir daqui
pra frente**: qualquer tela nova (ou modal ainda não convertido) que
ganhar um botão de ação principal deve colocá-lo no cabeçalho, nunca no
rodapé — e se o elemento for localizado por seletor composto
(`"#algo .classe-do-rodape .btn"`), trocar por um id estável antes de
mover, pra não quebrar o JS.

## Importar Itens em massa (planilha)

Pedido do usuário: importar uma leva grande de itens que já existiam numa
planilha, sem digitar um por um em Cadastro de Itens. Módulo novo em
`Modulos/Importacao/ImportarItens/` (`importar-itens.html/.css/.mjs`),
item de menu próprio "Importar Itens" (`js/ui/sidebarMenu.js`, categoria
`importacao`, direto ao ponto como o Catálogo — sem dropdown).

**Como funciona**: baixa um modelo `.xlsx` (gerado na hora, no navegador,
via biblioteca `xlsx` — SheetJS — carregada por CDN
`https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js`, versão
fixada), arrasta o arquivo preenchido (ou `.xls`/`.csv`, mesma lib lê os
três), o sistema mostra uma prévia com cada linha marcada OK ou com erro
específico (`"Categoria" é obrigatório`, `"Setor de Estoque" inválido:
"xyz" (use: Almoxarifado, ...)`, etc.) antes de gravar qualquer coisa no
banco. O usuário pode confirmar mesmo com algumas linhas com erro — só as
válidas são importadas, as com erro ficam de fora (contagem clara de
quantas de cada).

**Reconhecimento de coluna é por NOME do cabeçalho, não por posição**
(normalizado: sem acento, minúsculo, espaço colapsado) — o usuário pode
reordenar as colunas sem quebrar nada, mas a ORDEM do modelo baixável
continua sendo a "orientação oficial" mostrada na tela (pedido explícito:
"orientação em relação à sequência de colunas necessária"). Se uma coluna
obrigatória não for encontrada no cabeçalho (nome mudado, coluna
apagada), o import é bloqueado antes mesmo de olhar as linhas, com uma
mensagem dizendo exatamente qual coluna falta.

**Colunas = exatamente os campos que `itens.api.mjs` (`itens_salvar`,
usado pelo cadastro manual em `item-detalhes.html`) valida como
obrigatórios ao criar um item manualmente** (Produto, Material, Cor,
Categoria, Setor de Estoque, Largura/Altura/Profundidade, Valor de
Locação, Valor de Reposição) **+ os opcionais que ele aceita** (Família,
Descrição complementar, Custo, Tipo, Ativo, Exibir no site) — levantado
lendo o código de salvamento manual, não adivinhado, pra garantir que um
item importado fique idêntico em estrutura a um criado a mão. `codigo`,
`qr_code`, `id`, `descricao_total` e `volume_cubico` são sempre
calculados pelo importador (mesma lógica do salvamento manual), nunca
lidos da planilha — `codigo` usa `timestamp-índice da linha` (em vez do
`Date.now()` puro do fluxo manual) porque um insert em lote geraria
código duplicado pra várias linhas no mesmo milissegundo.

`categoria`/`familia` são texto livre (confirmado: não existe tabela
`categorias` nem FK — ver `itens.api.mjs`), então a planilha aceita
qualquer valor nessas colunas. `setor_estoque` é a única coluna com lista
fechada (mesmas 6 opções do `<select>` do cadastro manual), validada e
normalizada (casing corrigido automaticamente) linha a linha.

Números aceitam tanto `1.200,50` (formato BR, vírgula decimal) quanto
`1200.5` (ponto decimal) — o `.` só é tratado como separador de milhar
quando a `,` também aparece na mesma célula (formato BR inequívoco);
sozinho, `.` é sempre decimal, evitando interpretar "1.2" (metros) como
"1200".

Insert em lotes de 200 linhas por chamada (`supabase.from("itens").insert(array)`),
sequencial — se um lote falhar os outros continuam, e o resultado final
mostra quantos itens realmente entraram. `getEmpresaAtualId()` é
reaproveitado de `itens.api.mjs` (mesmo helper que o Catálogo já
reaproveita), em vez de duplicar a lógica de resolver a empresa do
usuário logado.

**Fora do escopo desta primeira versão** (não pedido, mas documentado
caso surja depois): não importa foto do item (a planilha não carrega
imagem), não importa Kits (só `tipo="Item"`/`"Componente"`), e não checa
duplicidade contra itens já cadastrados (roda de novo com o mesmo
arquivo = itens duplicados, sem aviso).

## Importação do catálogo real do cliente (planilha com kits e 3 tabelas de preço)

Pedido grande, executado ponta a ponta (banco + import + telas + testes) —
o usuário forneceu prints da planilha real dele e pediu pra não fazer mais
perguntas no meio da execução, resolvendo ambiguidade pela opção
"tecnicamente mais segura" e documentando a decisão. Esta seção é esse
registro.

**Investigação antes de mexer**: nada nessa seção foi assumido — o schema
real de `itens`/`fornecedores`, as RLS existentes, e os pontos que leem
`valor_locacao` foram lidos DIRETO do banco de produção via
`npx supabase db query --linked` (a service role key no `.env` está
desatualizada/inválida — o projeto migrou pro formato novo de chaves
`sb_publishable_...`/`sb_secret_...` e só o `SUPABASE_ANON_KEY` foi
atualizado; a CLI do Supabase, porém, já estava autenticada e logada nesse
projeto, então virou o canal usado pra introspecção somente-leitura — sem
Docker, `db query --linked` funciona via Management API; `db dump`/`db pull`
não funcionam sem Docker local). Ver `git log` das migrations abaixo pro
detalhe técnico completo de cada decisão.

### Achado crítico, fora do pedido original: RLS quebrada

Durante a investigação (não durante uma tentativa de mexer em RLS —
apareceu ao consultar `pg_policies` pra entender o padrão de isolamento
antes de criar tabela nova): `itens` e `kit_itens` tinham políticas
"corretas" (via `usuarios_empresas`) convivendo com políticas SOLTAS
adicionadas depois (`itens_select` com `using(true)` pro role `public` —
deixava QUALQUER usuário, autenticado ou não, ler os itens de QUALQUER
empresa; `kit_itens` tinha o mesmo problema com policies "permitir_*" e
ainda comparações erradas `empresa_id = auth.uid()`, que nunca bateriam
de verdade). E `fornecedores` estava com **RLS totalmente desligada**
(`relrowsecurity = false`) — sem isolamento nenhum. Corrigido em
`20260913100300_corrigir_rls_itens_fornecedores.sql`, migration separada
das outras (fácil de auditar/reverter isoladamente). Verificado
diretamente no banco depois de aplicar: `pg_policies` só mostra mais as
políticas corretas, `fornecedores.relrowsecurity = true`.

### Novos campos em `itens` (`20260913100100_...sql`)

`referencia` (código do cliente — chave de idempotência da importação,
único por empresa), `subcategoria`, `grupo_separacao`, `estilo`
(classificações novas, texto livre — ver justificativa abaixo),
`fornecedor_id` (FK opcional pra `fornecedores`) + `fornecedor_nome_origem`
(texto bruto preservado quando não dá pra vincular com segurança),
`marca_modelo`, `ordem_exposicao_site` (inteiro, NULL = sem ordem, não é
0), `destaque_site`, `locar_somente_kit`, `exclusivo` (booleanos). Também
`setor_estoque` deixou de ser `NOT NULL` no banco — a planilha do cliente
não tem coluna equivalente (a parecida, "SETOR SEPARAÇÃO", é na verdade
`grupo_separacao`, um conceito operacional diferente); o cadastro manual
(`itens.api.mjs`) continua bloqueando salvar sem esse campo, então
relaxar no banco não abre brecha nenhuma pro fluxo manual.

**Decisão: sem tabelas de lookup novas pra classificação.** Categoria e
família já eram texto livre (inputs simples, sem tabela de apoio, usados
como string em vários lugares — catálogo, filtros). Criar tabelas
normalizadas pra Subcategoria/Grupo de separação/Estilo quebraria esse
padrão sem necessidade — a normalização pedida (sem variação de
espaço/acento/maiúscula) é feita na CAMADA DE IMPORTAÇÃO
(`criarCanonicalizador` em `importar-itens-core.mjs`): a primeira grafia
vista pra um valor normalizado vira a "oficial", reaproveitada nas linhas
seguintes — sem forçar Title Case nem inventar um padrão que não é o do
cliente. Dados reais already tinham esse problema (`Sofá`/`Sofás`,
`Contemporânea`/`Conteporanea`/`Conteporânea` — visto direto no banco).

### Tabelas de preço versionadas (`20260913100200_...sql`)

`public.tabelas_preco` (nome, ano_referencia, vigencia_inicio/fim, ativa,
observacoes) + `public.itens_precos` (tabela_preco_id + item_id +
valor_locacao, único por par — impede item duplicado na mesma tabela).
RLS no padrão do projeto (join em `usuarios_empresas`). Permite MAIS DE
UMA tabela ativa ao mesmo tempo de propósito — a planilha do cliente tem
3 colunas "Val Unitário Locação" simultâneas (3 tabelas coexistindo), uma
constraint de "só uma ativa" teria sido errada aqui.

**`itens.valor_locacao` foi MANTIDO** (não removido, não descontinuado) —
investigação (grep + leitura de `js/pedido/pedido.mjs`,
`CentralPedidos.js`, `Cronograma.js`) confirmou que pedidos/kits/etc. leem
esse campo AO VIVO, direto de `itens`, toda vez que abrem — não existe
NENHUM snapshot de preço por linha em nenhum outro lugar do banco hoje
(o único "congelamento" de preço que existe é o texto já renderizado do
contrato em `contratos_pedidos.conteudo_final`, e só depois que o pedido
vira status final). Ou seja: manter compatibilidade aqui é simples,
porque não existe nada pra quebrar além do próprio `itens.valor_locacao`.
Dois triggers (`sync_itens_valor_locacao` e
`sync_itens_valor_locacao_on_activate`) mantêm esse campo espelhando
automaticamente o preço da tabela marcada `ativa=true` pra cada item —
todo código existente continua funcionando sem alteração nenhuma.

Nova tela `Modulos/Estoque/TabelasPreco/tabelas-preco.html` (menu:
Estoque → Cadastros → "Tabelas de Preço") pra gerenciar isso: listar,
criar (com opção de copiar preços de uma tabela existente como base),
ativar/inativar, editar preço item a item, aplicar reajuste percentual
geral. Reaproveita o padrão "tela, não modal" já estabelecido nesta
sessão (Fornecedores/Clientes/Caminhões/Kit).

### Mapeamento planilha → sistema

Regra explícita do usuário, não inverter: **ESPECIFICAÇÃO → nome do item
(`produto`)**. A coluna **PRODUTO existe e é distinta de CATEGORIA e de
ESPECIFICAÇÃO** — histórico: foi removida numa rodada anterior por parecer
duplicar CATEGORIA, e depois **reintroduzida a pedido do usuário** como um
conceito genuinamente diferente (ex.: "Bar" é o PRODUTO, "Bistrol" é a
ESPECIFICAÇÃO daquele item). Mapeia pra uma coluna nova no banco,
`itens.produto_base` (não confundir com `itens.produto`, que continua
sendo a ESPECIFICAÇÃO). Campo opcional — célula/campo vazio não bloqueia
a linha nem o cadastro manual. Quando preenchido, **sempre prefixa o nome
gerado automaticamente** (`descricao_total`): `[PRODUTO] [ESPECIFICAÇÃO]
[material] [cor] [descrição complementar] (L)... (A)... (P)...` — ver
`montarDescricaoTotal()` em `importar-itens-core.mjs` e o bloco de
`nomeGerado` em `Modulos/Estoque/CadastroItens/itens.api.mjs`
(`itens_salvar`), que replicam exatamente a mesma ordem pra que
importação em massa e cadastro manual gerem nomes com a mesma estrutura.
`descricao_complementar` vem apenas da coluna "DESCRIÇÃO COMPLEMENTAR".
Ver `CAMPOS_ITEM` em `Modulos/Importacao/ImportarItens/importar-itens-core.mjs`
pro mapeamento coluna-a-coluna completo e `COLUNAS_IGNORADAS` pras
colunas sem campo correspondente (Qt, Valor Total, LINHA (CATEGORIA)
NOVA, GRUPO (CHAR 30) FAMÍLIAS SITE, GALPÃO CONTROLE INTERNO) com o
motivo de cada uma.

**Kits**: a coluna "KIT" tem `ITEM`/`COMPONENTE`/ou `KIT` seguido de
linhas `quantidade|referencia` (formato que o próprio cliente já usa, ex.
real confirmado: célula com `KIT` na primeira linha, depois `1|COC001-PE`
e `1|COC001-TAMPO`). Import em 2 passes: primeiro grava todo Item/
Componente (constrói um mapa referência→id), depois resolve os Kits
(grava o kit como item `tipo="Kit"`, resolve cada componente pela
referência nesse mapa, substitui os `kit_itens` do zero — idempotente,
reimportar não duplica componente). **A montagem é automática**: não
precisa de nenhuma ação manual além de cada linha de componente ter, na
sua própria coluna "Código", a mesma referência citada na célula KIT do
item pai — se uma referência citada não existir entre as linhas
importadas, vira erro bloqueante nomeando exatamente qual referência não
foi encontrada (`parseKitCell`/passe 2 em `importar-itens.mjs`), nunca
falha silenciosa.

**3 tabelas de preço**: a planilha tem cabeçalho de 2 linhas — uma linha
de grupo (nome da tabela, ex. "TABELA 2026 Padrão") por cima da linha de
colunas de verdade. `detectarColunasDePreco()` lê o nome/ano de cada
coluna "Val Unitário Locação" a partir dessa linha de grupo. **Nunca
inventa nome ou ano** — se o cabeçalho vier cortado/sem ano reconhecível,
fica `null` e vira pendência mostrada na prévia, em vez de adivinhar
(pedido explícito do usuário). Cada coluna de preço vira sua própria
`tabelas_preco` (criada automaticamente na primeira importação que a
referencia, reaproveitada nas seguintes).

**Fornecedor**: casado por nome normalizado (razão social OU fantasia)
contra `fornecedores` já cadastrados. Só vincula quando há exatamente UMA
correspondência seg — nunca cria fornecedor novo automaticamente (mais
seguro deixar pra revisão humana do que arriscar duplicata ou vínculo
errado); quando não vincula, preserva o nome original em
`fornecedor_nome_origem` e conta como pendência "fornecedores não
identificados" na prévia.

**Idempotência**: chave = `referencia` (único por empresa). Reimportar o
mesmo arquivo faz UPDATE nos itens já existentes (não duplica), reusa as
mesmas `tabelas_preco` (mesmo nome+ano não duplica), faz `upsert` nos
preços (`onConflict: tabela_preco_id,item_id`) e substitui a lista de
componentes de cada kit do zero. Linha sem código na planilha é rejeitada
antes de gravar (sem `referencia` não dá pra saber depois se é a "mesma"
linha — reimportar duplicaria).

**KIT vazio**: encontrado testando com a planilha real do cliente — nem
toda linha vem com a coluna "KIT" preenchida (célula vazia é diferente de
um valor inválido). Célula vazia agora vira `tipo="Item"` + pendência
visível na prévia ("KIT estava vazio — importado como Item"), em vez de
bloquear a linha inteira — bloquear seria pior do que assumir o caso mais
comum (item simples) e avisar pra revisão.

**KIT com valor não reconhecido mostra o texto bruto da célula na mensagem
de erro** (`"KIT" com valor não reconhecido: "<texto lido>" (use...)`) —
antes a mensagem só dizia que o valor era inválido, sem mostrar QUAL
valor, obrigando o usuário a ir até a planilha, copiar a célula (o que
nem sempre é trivial — copiar do Excel geralmente cola como imagem, não
texto) e mandar pra investigação manual. Agora o problema aparece direto
na prévia, sem essa ida e volta.

**"ITEM E COMPONENTE" (e variações: "ITEM/COMPONENTE", "COMPONENTE E
ITEM", "item, componente")** — caso real encontrado assim que a mensagem
acima passou a mostrar o valor bruto: o cliente usa essa combinação pra
marcar um produto que é alugado avulso (Item) E TAMBÉM usado como peça
de algum kit (Componente) ao mesmo tempo. Vira `tipo="Item"` + pendência
visível ("KIT veio como Item e Componente — importado como Item...") —
decisão tecnicamente mais segura porque (1) `tipo="Item"` garante que o
produto continue aparecendo na busca de item avulso pra pedido
(`js/pedido/pedido.itens.mjs` filtra `.eq("tipo", tipoFiltro)`), e (2)
isso não impede o produto de ser referenciado como componente de um kit
— a montagem de kit (passe 2 da importação) casa por **referência**, não
por `tipo`: qualquer linha importada (`Item` ou `Componente`) já entra no
mapa referência→id usado pra resolver componentes de qualquer kit.
Detecção em `ehCombinacaoItemComponente()`, exige espaço ao redor do "e"
(evita confundir com o "e" dentro da própria palavra "compon-e-nte").

**Achado real e sério, depois de tudo isso já estar em produção**: o
usuário reportou que a família "Sofá Becca" tinha os componentes (Corpo +
almofadas, 4 cores) gravados, mas **nenhum Kit "Sofá Becca"** — enquanto
"Poltrona Becca" e "Banqueta Alta Becca" (mesma coleção, mesmo arquivo)
importaram como Kit normalmente. Investigando o tamanho do problema
(`select count(*) filter (where not exists (select 1 from kit_itens ki
where ki.item_id = i.id)) from itens where tipo='Componente'`): **365 dos
568 Componentes do banco (64%) não estão vinculados a NENHUM kit** —
espalhados por 40+ produtos diferentes (Iza, Original, Becca, Ilha,
Scarlet, Reto, Évora...), não um caso isolado. Causa raiz exata de cada
linha ainda não identificada (provavelmente múltiplas causas diferentes
somadas ao longo de várias importações) — mas o padrão claro é: **um Kit
pode falhar (erro de validação que passou despercebido, já que o sistema
permite confirmar mesmo com linhas com erro) enquanto os Componentes dele
importam normalmente**, sobrando peça solta sem nenhum conjunto.

**Proteção adicionada** (pedido explícito do usuário: "precisamos
realmente se proteger disso"): toda vez que uma importação termina —
com erro ou sem erro — `encontrarComponentesOrfaos()` (`importar-
itens.mjs`) verifica TODOS os Componentes da empresa (não só os desta
importação) contra `kit_itens` e mostra um aviso amarelo na tela de
resultado com quantos e quais produtos têm componente sem kit. Isso pega
tanto problema desta importação quanto resíduo de importações antigas
(os 365 atuais vão aparecer já na próxima vez que alguém importar
qualquer coisa). Não corrige sozinho (não há como saber automaticamente
"quais componentes formam qual kit" sem reimportar a linha certa da
planilha) — só torna o problema **impossível de passar despercebido**,
que era o pedido.

**Booleanos**: aceita Sim/Não, S/N, 1/0, Verdadeiro/Falso, True/False, X,
vazio (usa o default do campo). Valor não reconhecido NUNCA é convertido
silenciosamente — vira pendência visível na prévia, mostrando o valor
bruto que veio da planilha, sem travar a linha inteira.

**Célula com "#" significa em branco de propósito** — convenção da
planilha real do cliente, pedido explícito do usuário: uma célula cujo
conteúdo é exatamente `#` (não um texto que contém `#`, a célula inteira)
vale como se estivesse vazia, em QUALQUER coluna (texto, número,
booleano, preço, KIT) — nunca vira o valor literal `"#"` gravado no
banco. Normalizado num único ponto (`ehMarcadorDeVazio`/`celulaBruta` em
`importar-itens-core.mjs`, aplicado dentro de `valorDe()` e na leitura
das colunas de preço), pra valer em toda coluna automaticamente sem
precisar de tratamento coluna a coluna.

**Dimensões aceitam zero**: `LARGURA ou DIÂMETRO`/`ALTURA`/
`PROFUNDIDADE` continuam obrigatórias pra Item/Componente (célula vazia
ainda bloqueia a linha), mas o valor `0` agora é válido — pedido explícito
do usuário, caso real de item sem uma das três medidas fazer sentido. Só
bloqueia número negativo ou não numérico. (Cadastro manual em
`itens.api.mjs` já aceitava `0` desde sempre — só a importação em massa
tinha essa trava a mais.)

**Investigação real de "0 kits depois de importar" (ainda em aberto,
tentativa errada já descartada)**: usuário reportou que, depois de rodar
a importação de verdade, a tela de Itens filtrando por "Kit" mostrava "0
cadastros". Confirmado direto no banco via `npx supabase db query
--linked`: `select tipo, count(*) from itens group by tipo` retornou só
`Item`/`Componente`, zero `Kit`; `kit_itens` também zerada; e quase
nenhum código-prefixo de componente tinha um "pai" sem sufixo cadastrado
(ex.: existiam `EST009-PRATELEIRA`/`EST009-SUSTENTAÇÃO PRATELEIRA` mas
nenhum `EST009`) — ou seja, **100% das linhas de Kit da importação real
falharam**, não foi um caso isolado. **Primeira hipótese tentada e
DESCARTADA pelo usuário**: supor que dimensão (LARGURA/ALTURA/
PROFUNDIDADE) seria opcional pra Kit por ele ser uma "montagem virtual"
sem medida física própria — **errado**: o usuário confirmou explicitamente
que cada linha de Kit tem nome e medida PRÓPRIOS, é um cadastro completo
igual Item/Componente ("todo kit tem medida na sua linha, o nome muda,
tudo muda"). Revertido — dimensão continua obrigatória pra qualquer tipo,
Kit incluso (só o "zero é válido" de antes continua valendo). Confirmado
que o resto da cadeia (schema de `kit_itens`, CHECK constraint de
`itens.tipo`, filtro "Kit" da tela de Itens Cadastrados em
`itens.filtros.mjs`) já estava correto. **Causa real ainda não
identificada** — próximo passo é pedir pro usuário reimportar (idempotente,
seguro) e copiar a mensagem de erro exata mostrada na prévia pra uma
linha de Kit específica, em vez de continuar supondo (mesmo raciocínio
que já funcionou pra achar o caso "ITEM E COMPONENTE": a prévia já mostra
o valor bruto lido da célula quando o KIT não é reconhecido — mas o erro
real aqui pode estar em outro campo obrigatório da mesma linha, não
necessariamente no KIT).

**"Locar somente no kit"**: aplicado de verdade, não só guardado —
`js/pedido/pedido.itens.mjs` (busca de item pra adicionar avulso a um
pedido) agora filtra `.eq("locar_somente_kit", false)`. O item continua
aparecendo normalmente como componente de um kit (kits são buscados/
adicionados como o próprio kit, não pelos componentes).

Núcleo de parsing/validação é um módulo separado, sem DOM
(`importar-itens-core.mjs`), justamente pra dar pra testar com
`node --test` sem precisar de navegador — `tests/importar-itens-core.test.mjs`
(59 testes: parsing de número BR/EN, booleano estrito, célula de kit
(incluindo o formato real do cliente com referências tipo
`COC001-PE`/`COC001-TAMPO` e a combinação real "ITEM E COMPONENTE"),
marcador de vazio `"#"`, dimensão zero, dimensão obrigatória mesmo pra
Kit, detecção de cabeçalho de 1 ou 2 linhas, detecção das colunas de
preço com nome/ano, canonicalização de classificação, `validarLinha`
end-to-end). Teste de integração completo (fluxo real: arquivo → prévia →
confirmar → reimportar pra provar idempotência) foi rodado à mão via
Playwright com um banco fake em memória (não commitado — os testes
"oficiais" do repo são os `node --test` acima); ficou provado que a
segunda importação do mesmo arquivo não duplica nada em nenhuma das 4
tabelas envolvidas (itens, tabelas_preco, itens_precos, kit_itens).

### Interface (importar-itens.html) — feedback de progresso e ajuda em modal

Dois pedidos do usuário depois de usar a tela de verdade com um arquivo
grande: (1) durante a gravação ("Importando...") não tinha nenhum sinal
de que estava realmente acontecendo algo — "não sei se está funcionando
ou não"; (2) os cards "Como funciona" e "Colunas do modelo" ocupavam
espaço grande na tela o tempo todo, e o usuário só queria ver ali o botão
de baixar modelo, a área de arrastar/selecionar arquivo, e a tabela.

**Progresso linha a linha**: `confirmarImportacao()` (`importar-itens.mjs`)
agora atualiza, a cada linha gravada (Item/Componente no passe 1, Kit no
passe 2): uma barra de progresso + rótulo texto ("Gravando... X de Y
linha(s) (Z%)"), o texto do botão ("Importando... Z%"), e a PRÓPRIA linha
na tabela de prévia — fica verde (`.import-row-gravado`) com o status
trocado pra "✓ Gravado", ou vermelha (`.import-row-erro-gravacao`) com o
erro de gravação, se a escrita daquela linha falhar. Cada `<tr>` da
prévia tem `data-linha="${linha.linhaPlanilha}"` (número real da linha na
planilha) especificamente pra permitir achar e atualizar a linha certa
depois, sem precisar re-renderizar a tabela inteira a cada linha gravada
(re-renderizar tudo a cada linha seria caro pra arquivos grandes). O
progresso conta 1 por linha de item/kit gravada (não conta separado o
passo de gravar preço, que é secundário e roda depois/dentro da mesma
linha). Sem ícone (lucide) no status "Gravado"/"Erro ao gravar" de
propósito — só texto simples, pra não precisar rodar
`lucide.createIcons()` (que varre o documento inteiro) a cada linha.

**Bug real de "parece que travou" achado numa importação de verdade
(planilha grande, 1161 linhas válidas, 4 tabelas de preço)**: a barra de
progresso parou exatamente em "750 de 1161" e ficou lá — não era
coincidência, 750 = 1161 válidas − 411 kits = todas as linhas NÃO-kit. O
passe 1 (gravar cada item) tinha progresso, mas o passo seguinte —
persistir o preço de cada item em cada tabela de preço — não tinha
NENHUM feedback e fazia um `upsert` por item por tabela, sequencial: com
750 itens × até 4 tabelas, até ~3.000 idas e voltas de rede uma atrás da
outra, silenciosamente, enquanto a barra ficava parada no valor do fim do
passe 1. Não era trava de verdade, só um passo grande sem instrumentação.
**Corrigido em duas frentes**: (1) esse passo agora entra na mesma conta
de progresso (`totalParaImportar` inclui a soma de `linha.precos.length`
de toda linha não-kit, não só a contagem de linhas); (2) os upserts de
`itens_precos` das linhas não-kit agora vão em **lote** (`PRECO_CHUNK =
300`, um array por `.upsert()` em vez de um registro por chamada) — se um
lote falhar, refaz só aquele lote um a um pra identificar a referência
com problema, sem perder os outros. Isso também deixa esse passo bem mais
rápido (dezenas de chamadas em vez de milhares). Preço de **Kit**
continua sendo gravado um a um dentro do próprio loop do kit (não
batcheado) — não precisa, porque o progresso já avança 1 vez por kit
processado (kit + componentes + seus preços todos antes do próximo
incremento), então nunca fica um trecho longo sem a barra se mexer, ao
contrário do que acontecia nas linhas não-kit antes da correção.

**"Como funciona" e "Colunas do modelo" viraram um modal de ajuda**
(`#ajudaImportacaoModal`, `.el-modal` padrão do projeto), aberto por um
botão de interrogação (`#btnAjudaImportacao`) ao lado do botão "Baixar
modelo" no cabeçalho da página. A página principal ficou só com: cabeçalho
+ botões, a área de arquivo (arrastar/selecionar), e a prévia/resultado —
pedido explícito do usuário. `renderColunasInfo()` continua preenchendo
os mesmos elementos (`#colunasInfoBody`/`#colunasIgnoradasBody`), só que
agora eles vivem dentro do modal em vez de sempre visíveis na página.
Como a página deixou de precisar de duas colunas lado a lado (não sobrou
nenhum card curto pra ocupar uma coluna só), o grid de 2 colunas do
`.importar-itens-page` foi trocado por uma pilha vertical simples
(`display:flex;flex-direction:column`) — voltar a 2 colunas não faz mais
sentido enquanto o conteúdo grande estiver dentro do modal.

### Interface (item-detalhes.html)

Reorganizado em exatamente as seções pedidas: Informações principais,
Classificação, Dimensões e Cubagem (já existia), Informações comerciais
(Fornecedor virou `<select>` carregado de `fornecedores`), Exibição no
site, Tabelas de preço (tabela somente-leitura, nome/ano/vigência/status/
valor deste item em cada tabela).

**Rótulos dos campos seguem o nome da coluna da planilha**, pedido
explícito do usuário pra quem preenche à mão "se localizar" comparando
com a planilha: "Produto" (`itensProdutoBase`, distinto de "Especificação
(nome do item)" — ver seção acima sobre `produto_base`), "Especificação
(nome do item)", "Código do cliente (Referência)", "Largura ou Diâmetro",
"Custo / Valor de Compra", "Ordem de Exposição no Site" — nomes que já
bastavam (Categoria, Subcategoria, Cor, Material, etc.) não foram mexidos.

## Cards de resumo no cabeçalho de um cadastro

Padrão visual usado por Locais, Clientes, Fornecedores, Caminhões e agora
Itens (`cadastro-itens.html`, cards Total/Itens/Componentes/Kits contando
por `tipo` em vez de `status`): cards entre o título e o botão de
adicionar, sempre preenchendo a largura toda até o botão, sem espaço
sobrando — cada card tem `flex:1`, então o espaço se distribui igual
entre 3 ou 4 cards. Componente compartilhado em `styles/design-system.css`
(`.el-stat-row`/`.el-stat-card`, cores `.blue/.green/.orange/.red/
.purple/.gray`) — **essa paleta do `.el-stat-card` é do componente
compartilhado, não trocar por módulo** (ver próximo parágrafo pra
diferença entre isso e o badge da coluna Tipo). Padrão de código: uma
função `Xxx_renderizarStats(lista)` que conta por campo (`status`, `tipo`
etc.) e escreve o número via `textContent` em `<strong id="...">`,
chamada logo depois de carregar a lista completa (não a filtrada) —
replicar esse padrão para qualquer novo cadastro em vez de inventar CSS
de card novo.

**Badge colorido de Tipo na tabela de Itens** (`.tipo-badge.item/
.componente/.kit` em `cadastro-itens.css`, montado em
`itens.tabela.mjs`): pedido explícito do usuário pra diferenciar
visualmente Item/Componente/Kit na coluna "Tipo" — e pedido, também
explícito, pra usar **o mesmo tom de cor das tags do Cadastro de
Clientes** (`.tag` azul/amarelo/verde em `cadastro-clientes.css`:
`#e0ecff`/`#1e3a8a`, `#fef9c3`/`#854d0e`, `#dcfce7`/`#166534`), não a
paleta do `.el-stat-card` — são dois sistemas de cor DIFERENTES no
mesmo app, mesmo parecendo com a mesma função; ao replicar um badge
assim em outro módulo, confirmar qual dos dois o usuário quer antes de
escolher hex de cor.

Todo `<link>`/`<script>` usa `?v=YYYYMMDDx` no fim do endereço. Não há
ferramenta que faça isso sozinha — ao editar qualquer CSS/JS compartilhado,
**bumpar a versão em todos os lugares que o referenciam**, incluindo:
- a tag no próprio `dashboard.html`;
- a tag em cada módulo que também carrega aquele arquivo;
- os `@import` internos de `styles/global.css` (já esquecido uma vez a
  sessão inteira — causa raiz de vários "nada mudou" que pareciam bug).

Esquecer de bumpar em um único lugar é a causa mais comum de "eu alterei
mas não aparece".

## Bug real: item ativo "sumido" do Cadastro de Itens (teto de 1000 linhas da API)

Pedido do usuário, com print do item "Sofá Berlim" aberto de dentro do
Catálogo (com specs, modelo 3D, já usado num Projeto): *"não estou
encontrando esse sofá no cadastro de item, quero inativar ele mas não
acho no cadastro de item dentro do sistema, por quê?"*.

**Investigação direto no banco de produção** (`npx supabase db query
--linked`, nunca suposto): o item existe de verdade, ativo, com os dados
exatos do print (`categoria:"Sofás"`, `descricao_total:"Sofá Berlim
Tecido Linho Off White (L) 2.58 m (A) 0.73 m (P) 0.89 m"`, `tipo:"Item"`,
`ativo:true`) — não é um item fantasma nem duplicado. A empresa tem
**1173 linhas em `itens`** (194 Item + 568 Componente + 411 Kit), fruto
da importação em massa desta sessão. `carregarItens()`
(`Modulos/Estoque/CadastroItens/itens.api.mjs`) sempre fez uma chamada
**única** `.select("*").eq("empresa_id",...).order("produto")`, sem
`.range()`/paginação — e a API do projeto Supabase tem um teto de **1000
linhas por requisição** (`Settings > API > Max Rows`, sem override —
confirmado com `npx supabase postgres-config get --experimental`, lista
vazia). Reproduzindo a MESMA ordenação que o código usa (`order by
produto asc`), o item "Sofá Berlim" cai na **posição 1060 de 1173** —
depois do corte, então nunca chegava a entrar em `itensCache`. Sem esse
item no cache, nenhuma busca/filtro no Cadastro de Itens acha ele —
não é bug de busca nem de filtro, o dado simplesmente nunca baixa do
banco, sem erro nenhum aparecendo em lugar nenhum (PostgREST corta
silenciosamente, não lança exceção).

**Não é um caso isolado**: qualquer item classificado depois da posição
1000 nessa ordenação (por volta de 173 itens hoje, crescendo conforme o
catálogo cresce) está igualmente invisível no Cadastro de Itens. O
Catálogo (`catalogo_acervo()`) nunca teve esse problema porque lê via
RPC que devolve os itens agregados dentro de UM `jsonb_agg` — pra
PostgREST isso é "1 linha" (a linha que contém o JSON inteiro), o teto de
1000 nunca entra em jogo.

**Corrigido** em `carregarItens()`: a chamada única virou um laço que pede
páginas de 1000 em 1000 (`.range(offset, offset+999)`) até a página
voltar com menos que 1000 linhas — carrega a empresa inteira não importa
o tamanho. Cache-busting: import de `itens.api.mjs` dentro de
`cadastro-itens.mjs` ganhou `?v=20260920-paginacao` (nunca tinha
`?v=` nenhum antes — não existia motivo pra ter, mas como o conteúdo do
arquivo mudou de verdade agora, ganhou um pra esta mudança em diante) e o
`<script>` de `cadastro-itens.mjs` em `cadastro-itens.html` foi bumpado
junto.

**Mesmo padrão de risco encontrado em mais 2 lugares, não corrigidos
nesta rodada** (fora do escopo do que foi pedido — documentado aqui pra
não pegar ninguém de surpresa depois): `Modulos/Estoque/TabelasPreco/
tabelas-preco.mjs` (`select("id,codigo,produto,categoria")` pra montar a
lista de itens precificáveis) e `Modulos/Importacao/ImportarItens/
importar-itens.mjs` (`select("id,referencia")` pra montar o mapa de
idempotência/resolução de kit ao reimportar) fazem a MESMA chamada única
sem paginação contra `itens`. Com 1173+ linhas, os dois também podem
deixar de enxergar itens/referências além da posição 1000 — no caso da
importação, isso poderia fazer um KIT reimportado falhar em achar um
componente de referência que na verdade existe, só que "invisível" pelo
mesmo motivo. Se aparecer um sintoma parecido ("item não aparece pra
precificar"/"reimportação não encontra a referência X que existe"), a
causa provável é esta — mesma correção (paginar com `.range()`).

## Home de categorias: topo mais compacto, hover mais expressivo, última linha centralizada

Três pedidos do usuário, em sequência, sobre a tela "Categorias" (Home do
catálogo, grade de cards por categoria).

**1) Espaço no topo** (*"essa parte de cima das categorias mais
compacta, esta sobrando muito espaco entre as categorias, o filtro e o
menu"*): `.catalog-grid-wrap` (compartilhado com a grade de itens e o
mosaico) tinha `padding-top:56px`, e `.catalog-home-filters` (a pílula
"Material") tinha `margin-bottom:44px` — juntos, ~134px de vão antes da
1ª linha de cards. Reduzidos pra 24px/24px (18px/18px no celular) — vão
medido caiu pra ~81px (a própria altura da pílula de filtro já soma boa
parte disso).

**2) Hover mais expressivo** (*"o efeito de passar o mouse por cima da
categoria quero que seja mais expressivo do que esta hoje"*): a versão
anterior só dava zoom (`scale(1.18)`, ver "Fotos maiores + hover premium
nos cards da Home" mais acima — o usuário já tinha rejeitado escurecer/
sombra ali antes). Em vez de reintroduzir o que foi explicitamente
recusado, o zoom subiu pra `scale(1.3)` e o nome ganhou o mesmo efeito de
"abrir" as letras (`letter-spacing`) já usado no Portal/mini-menu Módulo
3D (`.02em → .09em` no hover) — mais presença sem escurecer nada.

**3) Última linha centralizada** (*"centralize a linha de baixo de
categorias"*): com `.catalog-home-grid` em `auto-fill`/`minmax(160px,
1fr)`, quando o total de categorias não fecha um múltiplo exato de
colunas, a última linha (ex.: 4 cards numa grade de 6 colunas) ficava
colada à esquerda, com um vão vazio grande à direita — comportamento
padrão de CSS Grid (todas as linhas dividem os MESMOS trilhos de
coluna, e o preenchimento automático sempre começa pela 1ª coluna).
**Não trocado pra Flexbox** (a solução mais comum pra esse problema)
porque isso abriria mão do `1fr` que faz os cards crescerem pra
preencher a largura disponível (pedido de sessão anterior) — flexbox
com tamanho fixo mudaria o tamanho dos cards em telas largas, mais do
que foi pedido agora.

**Corrigido só reposicionando os cards da última linha, quando
incompleta** (`centerLastHomeGridRow()`, `catalogo.mjs`): conta quantas
colunas a grade tem de verdade no momento (`getComputedStyle(grid).
gridTemplateColumns.split(" ").length` — resolve o `auto-fill` pro
número real de colunas naquela largura), calcula quantos cards sobram
na última linha (`total % colunas`) e, se sobrar algo, desloca só ESSES
cards pro meio via `grid-column-start` inline — linhas cheias não
recebem nenhum estilo novo. Como todas as colunas continuam `1fr`
(mesmo trilho, mesma largura), mover um card pra uma coluna do meio não
muda o tamanho de nada, só a posição. Recalculado (`watchHomeGridWidth()`,
um `ResizeObserver` em `#catalogGrid`, elemento estável que nunca é
recriado — só o `innerHTML` troca) toda vez que a Home é redesenhada
(`refreshHomeFilters()`) e a cada redimensionamento de janela, já que o
número de colunas por linha é responsivo. **Só a Home** (`.catalog-home-
grid`) — a grade de produtos dentro de uma categoria usa `.catalog-grid`
com 3 colunas fixas, fora do escopo do que foi pedido.

Verificado com Playwright (10 categorias sintéticas, split 6+4 numa
tela larga): centro da última linha coincide com o centro da grade
(diferença de 0,008px); redimensionando pra uma tela mais estreita
(4+4+2), recalcula e centraliza de novo. `tests/catalogo-menu-browser.cjs`,
`tests/catalogo-filtros-browser.cjs`, `tests/catalogo-browser.cjs` e
`tests/catalogo-portal-browser.cjs` rodados de novo, todos passando (a
suíte já cobre "hover dá zoom sem travar o clique" — sem valor fixo de
escala — e não há teste que dependesse dos valores antigos de espaçamento).
Cache-busting: `catalogo.css?v=20260921-home-compacta`,
`catalogo.mjs?v=20260921-centralizar-linha`.

## Mini-menu "Módulo 3D" e Módulo Lounge (Composições) — removidos

Pedido explícito do usuário: *"dentro do modulo de 3d deixe apenas o 3d
livre, ou seja, pode remover os outros, quando eu clicar em em modulo 3d
ele ja vai direto, ou seja, nao precisa mais ter os 3 modulos separados,
pode remover tambem"* — o mini-menu "Módulo 3D" (3 cards: "3D Livre",
"Composições"/Módulo Lounge, "Em desenvolvimento"/Realidade aumentada,
ver seções "Mini-menu 'Módulo 3D'..." mais acima) e o Módulo Lounge
inteiro saíram do catálogo. Clicar em "Módulo 3D" no Portal volta a abrir
o Estúdio de Ambientes ("3D Livre") **direto**, sem nenhuma tela
intermediária — exatamente como era antes do mini-menu ter sido criado.

**O que saiu, de verdade removido (não só escondido)**: `catalogo-
lounge.mjs`/`.css` apagados por completo; em `catalogo.mjs`,
`MODULO3D_MENU_VIEW`/`MODULO3D_CARDS`/`modulo3dLabel`/
`MODULO3D_CAPA_FIELD`/`MODULO3D_CAPA_COLUMN` e toda a implementação do
mini-menu (`renderModulo3dMenu()`, `modulo3dCardMarkup()` e famílias,
`allItemsFlat()`, `modulo3dFeaturedItem()`, `capaModulo3dToggleMarkup()`,
`alternarCapaModulo3d()`, `handleCapaModulo3dToggleClick()`,
`ensureModelViewer()`/`supportsWebGL3D()`/`isEconomyDevice3D()`); em
`catalogo.html`, a seção `#catalogLounge` inteira (abas Formatos/Itens/
Ambiente, visualizador, controles) e `#loungeResultDialog`; em
`catalogo.css`, todo o bloco `.catalog-modulo3d-*`/`.catalog-capa-
modulo3d-*` (~150 linhas de CSS morto, consequência direta da remoção —
apagado, não deixado como lixo). O botão "Composições" no espaço de
trabalho de Projetos (`data-cpj="ir-lounge"`) e seu dispatcher em
`catalogo-projetos.mjs` também saíram; os 2 textos que mandavam "gerar
uma imagem em Composições ou 3D Livre" (mapa de renderizações, legenda
vazia da planta) viraram só "no 3D Livre".

**O banco não foi tocado** (mesma cautela já documentada neste arquivo
pra outras remoções — `lounge_formatos`/RPCs `lounge_formatos_listar`/
`lounge_formato_salvar`, a tabela `catalogo_capas` com a chave
`"lounge"`, as colunas `itens.capa_modulo3d_lounge`/`capa_modulo3d_ar`
ficam órfãs, não apagadas, sem misturar limpeza de banco não pedida com
a mudança pedida).

**Achado sério ao tentar apagar `catalogo-lounge.mjs`, não óbvio antes de
investigar**: `catalogo-studio3d.mjs` **importava `studioFormats`/
`studioFormatPlacements` de `catalogo-lounge.mjs`** —
`import { studioFormats, studioFormatPlacements } from
'./catalogo-lounge.mjs?...'`. Essas duas funções são o motor da feature
"formatos reutilizáveis" do 3D Livre (aba "Formatos" da biblioteca
lateral, "Salvar formato"/"Trocar item" — ver "Adiciona formatos
reutilizaveis no Estudio 3D" no histórico do git, de uma sessão anterior
a esta), que reaproveitou o `lounge_formatos`/RPCs já existentes do
Módulo Lounge (mesma tabela/RPCs, nomeadas "lounge_" no banco desde
quando só o Lounge existia) sem que isso tivesse sido percebido como uma
dependência cruzada até este momento — inclusive o botão "Salvar formato"
do 3D Livre dizia literalmente "Salvar em Composições". Apagar
`catalogo-lounge.mjs` inteiro quebraria o 3D Livre.

**Corrigido extraindo, não apagando**: as duas funções (`studioFormats`/
`studioFormatPlacements`) são puras — sem DOM, sem Three.js, sem
Supabase — e dependiam só de um punhado de outras funções/constantes
igualmente puras dentro do mesmo arquivo (`BUILTIN_FORMATS`,
`matchingItems()`, `toRuntimeFormat()`, `roleDefinitionForKey()`,
`groupPapeisByRole()`, `ROLE_DEFS`/`ROLE_ORDER`/`REQUIRED_ROLES`/
`LEGACY_ROLE_LABELS`/`DIAGRAM_SPAN_X`/`DIAGRAM_SPAN_Z`). Todo esse
conjunto foi movido pra um arquivo novo, `catalogo-formatos.mjs` — sem
DOM/estado/import de mais nada, só transformação de dado — e
`catalogo-studio3d.mjs` passou a importar de lá. Verificado rodando
`tests/studio-formatos-browser.cjs` (que já cobria essa feature) de
ponta a ponta contra o arquivo novo — passou sem nenhuma mudança de
comportamento.

**CSS na mesma situação, resolvida do mesmo jeito**: `#studioFormatsList`
(painel "Formatos" do 3D Livre) reaproveitava duas classes de
`catalogo-lounge.css` (`.catalog-lounge-format-list`/`.catalog-lounge-
format`, incluindo hover/estado ativo/foco — só o layout interno do
cartão vinha de `.studio-format-card`, próprio do 3D Livre). Confirmado
por grep que TODO o resto de `catalogo-lounge.css` (badge/controles/
abas/canvas/diálogo de resultado/editor de formato com diagrama
arrastável `.lfd-*`) não tinha nenhum uso fora do módulo Lounge — essas
duas classes migraram pra `catalogo-studio3d.css` (comentário no lugar
explicando a origem), o resto do arquivo foi apagado junto com
`catalogo-lounge.css`.

**Nomes ajustados pra não apontar pra um destino que não existe mais**:
o botão "Salvar em Composições" do 3D Livre virou "Salvar formato"; as 2
mensagens que citavam "Composições" (`studioFormatDescription`,
notificação de sucesso) foram reescritas pra descrever o que o 3D Livre
faz de verdade (reaplicar o bloco em qualquer ambiente / aba Formatos),
sem inventar nada que não exista.

**Testes**: `tests/catalogo-lounge-browser.cjs` e `tests/catalogo-
modulo3d-menu-browser.cjs` apagados (testavam só telas que não existem
mais). `tests/studio-formatos-browser.cjs` perdeu o cenário de
consistência cruzada "formato salvo no 3D Livre também aparece no
Lounge" (não tem mais Lounge pra checar) — a cobertura de "o 3D Livre
sozinho reaplica o formato certo" já bastava e continuou. Ajustados pra
apontar pro Estúdio direto (sem passar pelo mini-menu que não existe
mais): `catalogo-browser.cjs`, `catalogo-biblioteca-browser.cjs`,
`catalogo-cabecalho-browser.cjs`, `catalogo-portal-browser.cjs`,
`catalogo-fontes-browser.cjs` (que também perdeu os cenários "Módulo 3D"/
"Composições"/"Composições · Itens"/"Composições · Ambiente", que não
existem mais). `catalogo-projetos-browser.cjs` tinha 2 cenários que
abriam literalmente `#loungeResultDialog` (elemento apagado) pra simular
"renderização de IA salva no projeto" — trocados por `#studioResultDialog`
(o mesmo padrão `data-projeto-save-render`/`data-img`/`data-origem`, só
que do 3D Livre, que continua existindo) — **achado ao trocar**: como as
duas cenas de teste agora reaproveitam o MESMO `#studioResultDialog` que
um cenário de "Tirar print" mais adiante no mesmo arquivo também usa, foi
preciso adicionar um `.close()` explícito entre os cenários (`showModal()`
num `<dialog>` já aberto lança `InvalidStateError`) — sem isso o teste
quebraria por um motivo totalmente alheio ao que estava sendo migrado.
Fixtures/comentários com `origem:"Composições"` em dado JÁ SALVO (testando
que o app continua exibindo corretamente uma renderização antiga com esse
rótulo) foram mantidos de propósito — é sobre ler dado histórico, não
sobre a existência do módulo.

**Achado ao rodar a suíte inteira pra validar, não causado por esta
mudança**: `catalogo-browser.cjs` e `studio-browser.cjs` falham em
`#studioProjectSave`/`#studioProjectName` — uma feature "Studio Projects"
(salvar/exportar/importar a cena do 3D Livre) cujo JS existe mas nunca
ganhou o HTML correspondente em `catalogo.html`. Confirmado pré-existente
com `git diff`/`git show HEAD` nos dois arquivos de teste (o trecho que
falha não muda em nenhum dos dois) — já estava quebrado antes desta
sessão, não é regressão desta mudança. Resto da suíte (24 arquivos
`catalogo-*-browser.cjs` + `catalogo-decorador.test.cjs` +
`creditos-browser.cjs`) rodado de novo, tudo passando.

Cache-busting: `catalogo.mjs?v=20260923-sem-lounge`, `catalogo-
studio3d.mjs?v=20260923-sem-lounge` (import dentro de `catalogo.mjs`) e
`catalogo-studio3d.css?v=20260923-sem-lounge`; `catalogo-formatos.mjs`
importado com `?v=20260923-formatos-3d`.

## Formatos do 3D Livre: foto no lugar do 3D ao vivo + escolher os móveis antes de inserir

Pedido explícito do usuário, com print da aba "Formatos" (3D Livre) mostrando a mensagem "Preparando o
ambiente 3D" no lugar de um cartão: *"ao invés de ficar os 3d já carregados... eu quero que fique fotos das
composições porque dessa maneira imagino que ficará mais leve o carregamento... só que nessa foto ficará
gravado de alguma maneira o formato, ou seja, quando a pessoa clicar na foto a ideia que abra um modal pra ela
selecionar os móveis que ela quer colocar com aquela composição, quando ela escolher os móveis, no painel 3d
vai aparecer os móveis que ela criou exatamente no formato que ela escolheu através da foto... a forma de criar
os formatos permanece a mesma isso nao deve ser alterado"*.

**Três mudanças, nenhuma no fluxo de CRIAR um formato** (pedido explícito — "Salvar formato" continua
exatamente os mesmos passos/telas de antes):
1. O cartão da lista mostra uma FOTO da composição, não mais uma cena 3D renderizada ao vivo (`renderFormatPreview()`
   já era pesado — WebGL, GLTFLoader — e só piorava "no futuro serão centenas de formato").
2. Essa foto é capturada e enviada ao Storage **em silêncio**, logo depois de "Salvar formato" já ter fechado o
   diálogo e mostrado "Formato salvo" — a pessoa não vê nenhum passo/espera nova.
3. Clicar na foto **não insere mais direto** — abre um diálogo "Escolher os móveis" (um por papel/peça do
   formato); só depois de confirmar é que o formato entra no painel 3D, com os móveis escolhidos, nas mesmas
   posições/giros salvos.

### Banco (`supabase/migrations/20260923000100_lounge_formatos_capa.sql`, aplicada com `db push --linked`)

`lounge_formatos` ganhou `capa_url`/`capa_path` (nullable — formato salvo antes desta sessão fica sem foto até
o auto-cura abaixo preencher). `lounge_formato_json()` passou a incluir `capa_url`. `lounge_formato_salvar()`
ganhou 2 parâmetros novos (`p_capa_url`, `p_capa_path`, ambos opcionais) — no INSERT ficam nulos mesmo (o
cliente ainda não tem o `id` do formato nesse momento pra montar o caminho da foto); no UPDATE usam
`coalesce(novo, existente)`, então uma 2ª chamada sem foto nunca apaga uma que já existia. Assinatura antiga
(5 parâmetros) foi derrubada — nada mais no código a chama.

**Bucket novo, `lounge-formatos`, não reaproveita "biblioteca"**: as policies do bucket "biblioteca" exigem
`auth.uid()` (certo pra Biblioteca/Portal, sempre equipe interna) — mas um DECORADOR pode salvar um formato em
3D Livre (confirmado no próprio schema de `lounge_formatos`: "formato criado por um decorador... só aparece
pra ele e pra equipe") e ele não tem `auth.uid()` nenhum (entra por token do catálogo). Mesmo problema que
"Foto dos noivos"/renders de Projetos já resolveram: `lounge_formato_existe(empresa, formato)` — cópia fiel de
`projeto_existe()` — autoriza pela EXISTÊNCIA da linha, não pela identidade de quem está logado; as 4 policies
do bucket (`select`/`insert`/`update`/`delete`) são `to anon, authenticated`, igual ao bucket "projetos".
Caminho fixo por formato, `${empresa_id}/${formato_id}/capa.jpg` (upsert — trocar a foto no futuro sobrescreve,
nunca acumula arquivo órfão).

**Verificado direto contra o banco/Storage de produção, não assumido**: SQL num bloco `do $$...$$` (sem
`raise exception`, só `rollback` no fim, já que aqui é `insert`/`update` direto na tabela, não uma chamada de
RPC — `lounge_formato_salvar()` exige `auth.uid()`/token válidos via `projeto_ctx()`, que o ambiente de
`db query` não tem) confirma: `capa_url` nulo até ser setado, `lounge_formato_json()` devolve o campo,
`lounge_formato_existe()` responde `true`/`false` corretamente pro id certo/errado e pra empresa certa/errada.
Com a chave ANÔNIMA de verdade (`curl` contra `/storage/v1/object/...`): upload num caminho de formato real
200; upload num caminho de formato INEXISTENTE 400 (recusado); leitura pública 200; re-upload (upsert) no
mesmo caminho 200; remoção 200 — os 5 exatamente como o bucket "projetos" já se comporta.

### Frontend — captura da foto (`catalogo-studio3d.mjs`)

`renderFormatPreview(format)` (a prévia ao vivo de sempre) foi dividida em duas: `renderPlacementsCanvas(placements)`
faz o trabalho pesado de verdade (monta a cena offscreen, enquadra, recorta, devolve o `<canvas>` de 480×360) e
`renderFormatPreview()` vira um wrapper fino (chama a primeira, guarda o resultado como dataURL no MESMO cache
em memória de sempre). Isso deixou o núcleo reaproveitável pra CAPTURAR a foto de capa, não só exibi-la.

**`anexarFotoDoFormato(formatoId, nome, pecas)`** roda logo depois de `lounge_formato_salvar()` (1ª chamada)
responder com sucesso — `pecas` é o MESMO array que acabou de ser salvo (`formatDraft`, capturado numa
variável local ANTES de `saveSelectedFormat()` zerá-lo), então a foto é fiel ao que a pessoa realmente montou,
não a uma composição recalculada. Converte cada peça (`item_id`+posição+rotação em GRAUS) num `placement`
(item resolvido + rotação em RADIANOS), chama `renderPlacementsCanvas()`, comprime o canvas em JPEG
(`canvasParaJpegBlob()`, qualidade .86 — mesmo padrão de compressão já usado em todo upload de foto desta
sessão), sobe pro bucket (`upsert:true`) e faz a 2ª chamada a `lounge_formato_salvar()` (mesmo `id`, mesmo
`nome`/`papeis`, só acrescentando `p_capa_url`/`p_capa_path`). **Nunca lança pra fora** — se qualquer passo
falhar (upload, RPC, o que for), só cai no console; o formato já está salvo e utilizável de qualquer jeito, e a
lista tem o fallback abaixo pra formato sem foto.

**Auto-cura pra formato salvo ANTES desta feature existir** (sem `capa_url`): `formatCardMarkup()` decide, por
formato, entre mostrar a foto direto (`<img src=capaUrl>`, sem custo nenhum de 3D) ou cair no fallback de
sempre — spinner + `IntersectionObserver` + `renderFormatPreview()` ao vivo, exatamente como era antes desta
mudança, SÓ pra quem ainda não tem foto. A diferença: assim que essa prévia ao vivo termina de renderizar,
`backfillFormatCapa(format, dataUrl)` reaproveita a MESMA imagem (decodifica o dataURL de volta num canvas,
sem renderizar de novo) e faz o mesmo upload+2ª-chamada de `anexarFotoDoFormato` — então esse formato NUNCA
MAIS precisa renderizar ao vivo. Só formatos CUSTOM (`recordId` — dona linha no banco); o embutido "Lounge
compacto" não tem onde persistir, continua usando só o cache em memória por sessão de sempre.

### Frontend — diálogo "Escolher os móveis" (`catalogo-studio3d.mjs` + `catalogo.html` + `catalogo-studio3d.css`)

`studioFormatPlacements(format, items, selection)` (`catalogo-formatos.mjs`) ganhou um 3º parâmetro OPCIONAL:
um mapa `role.key -> item ESCOLHIDO à mão`, que vence sobre a escolha automática de sempre (item originalmente
salvo, senão o 1º disponível) quando presente pra aquele papel. Sem `selection` (ou papel ausente dela), o
comportamento é EXATAMENTE o de antes — usado assim por `renderFormatPreview()`/qualquer chamada que não passe
pelo diálogo novo. `matchingItems(role, items)` (mesmo arquivo) também passou a ser exportada — o diálogo
precisa dela pra filtrar as opções de CADA papel.

Clicar num cartão da lista chama `openFormatApplyDialog(key)` em vez de inserir direto — monta a seleção
PADRÃO (mesma lógica que `studioFormatPlacements()` já usava: item salvo originalmente, senão o 1º
disponível — clicar "Inserir formato" sem mexer em nada reproduz o resultado de sempre) e abre
`#studioFormatApplyDialog`. **Mesmo padrão visual de 2 colunas do diálogo "Trocar item" já existente**
(`#studioSwapDialog`) — esquerda lista os PAPÉIS do formato (rótulo = nome de quando foi salvo, ex. "Mesa 2",
que NUNCA muda — só o item escolhido pra ele muda, mostrado depois do " · "), clicar num papel ativa ele;
direita mostra só os itens que batem com aquele papel (`matchingItems`), clicar escolhe. CSS reaproveitado por
seletores AMPLIADOS (`#studioSwapCurrentList,#studioFormatApplyCurrentList{...}` etc.) em vez de duplicar
regras — zero mudança de comportamento no diálogo de troca já existente.

`insertStudioFormat(format, selection, status, disableTargets)` (antes `insertStudioFormat(key)`, chamada
direto pelo clique no cartão) virou a função que faz a inserção de verdade — mesma lógica de sempre
(`studioFormatPlacements` + `addItem` peça a peça + agrupar por `catalogGroupId`), só que agora recebe a
seleção do diálogo em vez de deixar tudo por conta do auto-pick, e devolve `true`/`false` em vez de só mexer
em texto de status (pra `confirmFormatApply()` saber se fecha o diálogo). Sucesso agora passa por
`catalogNotify` (toast, mesmo padrão do resto do catálogo) em vez de só um texto que sumia sozinho.

**Reabrir sempre reseta a seleção** (`formatApplySelection`/`formatApplyRoleIndex` recalculados do zero em
`openFormatApplyDialog()`, nunca preservados entre aberturas) — evita "herdar" uma escolha de uma tentativa
anterior sem perceber.

Teste de regressão (`tests/studio-formatos-browser.cjs`, reescrito): mock de `supabase.storage` novo (mesmo
padrão de `tests/mock-projetos.cjs` — upload registra em `window.uploads`, `getPublicUrl` devolve uma URL
fixture). Cobre: a foto é capturada e anexada em silêncio (upload no bucket/caminho certos, JPEG, 2ª chamada
RPC com o `id` certo) sem nenhum passo novo visível; o cartão com foto não usa o indicador de carregamento;
clicar abre o diálogo sem inserir nada ainda; seleção padrão reproduz o comportamento de antes (nomes originais
nos 2 papéis); a coluna direita filtra pelo papel ativo; trocar a seleção muda o item mostrado (não o rótulo do
papel, que é fixo); fechar e reabrir volta pra seleção padrão; inserir com a seleção default dá o MESMO
resultado de sempre (permitindo que todo o resto do teste — "Trocar item" num objeto já colocado, paginação,
busca, formato legado, bug do `variantGroup` circular — continuasse validando exatamente as mesmas coisas de
antes, sem reescrever); formato sem foto cai no fallback ao vivo (mesmo reaproveitamento de 1 contexto WebGL
já testado) E se auto-cura (a MESMA prévia sobe pro Storage e grava a URL, sem renderizar de novo — só pros
5 formatos custom, nunca pro embutido "Lounge compacto", que não tem onde persistir).

Cache-busting: `catalogo-formatos.mjs?v=20260924-capa-formato` (export novo + parâmetro novo em
`studioFormatPlacements`), `catalogo-studio3d.mjs?v=20260924-capa-formato` (import + toda a lógica nova) e
`catalogo-studio3d.css?v=20260924-capa-formato`, propagados em `catalogo.html`/`catalogo.mjs`.

## Formatos: modal grande + categoria obrigatória + favoritos

Pedido explícito do usuário, com print da aba "Formatos" já com 2 cartões (foto e "Prévia indisponível") na
barra lateral estreita: *"quando eu clicar em formatos ali do lado de itens eu quero que abra um modal maior
com todos os formatos criados, e quero que eles sejam separados por categoria. sendo assim a partir de agora no
momento da criação de algum formato, nós devemos obrigatoriamente colocar qual formato que é, se é lounge, se é
mesas de convidado, mesas de bolo e doces, enfim.... ali na barra lateral que já existe hoje onde ficam os
formatos, ali eu quero que fique somente os formatos favoritos, ou seja, dentro desse modal nós poderemos
selecionar quais são nossos formatos favoritos, esses formatos aparecem ali, o restante aparece no modal."*
Pergunta de esclarecimento antes de implementar (via AskUserQuestion): clicar em "Formatos" abre o modal
DIRETO (a barra lateral estreita deixa de ter uma aba que troca de painel — vira só uma prateleira de
favoritos, sempre visível), em vez de a aba continuar mostrando os favoritos e o modal ser uma ação à parte —
usuário escolheu a 1ª opção. **A forma de CRIAR um formato continua a mesma** (mesma restrição já valia pra
foto de capa, ver seção anterior) — só ganhou 1 campo novo obrigatório (categoria).

### Banco (`supabase/migrations/20260924000100_lounge_formatos_categoria_favorito.sql`, aplicada com `db push --linked`)

`lounge_formatos` ganhou `categoria text` (nullable — formato salvo antes desta migration fica sem categoria,
cai no grupo "Outros" no modal) e `favorito boolean not null default false`. `lounge_formato_json()` passou a
incluir os dois. `lounge_formato_salvar()` ganhou `p_categoria` (9º→8º parâmetro, já que os outros continuam
os mesmos) — **obrigatória só no INSERT** (`p_id is null and categoria vazia` → `raise exception 'Escolha uma
categoria pro formato'`); no UPDATE usa `coalesce(nova, existente)`, então a 2ª chamada de
`anexarFotoDoFormato`/`backfillFormatCapa` (que só está anexando a FOTO, não editando a categoria) nunca apaga
o valor já salvo mesmo que mande `null` por engano. "A partir de agora... obrigatoriamente" foi lido como
valendo pra criação DAQUI PRA FRENTE, não retroativo — nenhum formato já existente foi obrigado a ganhar uma
categoria.

**`lounge_formato_favoritar()`, endpoint próprio** (não reaproveita `lounge_formato_salvar` — giraria um
boolean tendo que reenviar nome/papéis à toa). **Favorito é uma flag COMPARTILHADA na própria linha do
formato, não por pessoa** — o pedido fala em "nossos formatos favoritos", e o formato já é compartilhado por
natureza (equipe vê tudo; decorador vê os seus + os da equipe). Por isso a regra de quem pode favoritar é a
MESMA de quem pode VER o formato (`lounge_formatos_listar`), não a mais restrita de "dono ou equipe" que edita/
exclui — senão um decorador nunca poderia favoritar um formato criado pela equipe.

Verificado direto no banco de produção (`npx supabase db query --linked`, manipulação direta da tabela — as
RPCs exigem `auth.uid()`/token via `projeto_ctx()`, que o ambiente de `db query` não tem): `categoria`/
`favorito` nascem `null`/`false`, ficam settáveis; `pg_proc` confirma `lounge_formato_salvar` com 8 argumentos,
`lounge_formato_favoritar` com 4, `lounge_formato_json` com 1, todos `prosecdef=true`.

### `catalogo-formatos.mjs` — só o dado

`BUILTIN_FORMATS[0]` ("Lounge compacto") ganhou `categoria:"Lounge"` fixa no código (nunca passa pela
validação, não tem onde ser diferente) e `favorito:false` fixo (sem `recordId` — não é uma linha do banco, não
tem onde persistir um favorito, então nunca aparece com a estrela ativável no modal). `toRuntimeFormat()`
ganhou `categoria: record.categoria || null` e `favorito: Boolean(record.favorito)` no objeto devolvido — quem
decide o rótulo de fallback ("Outros" pra categoria nula) é `catalogo-studio3d.mjs`, não este módulo (que
continua puramente de dado, sem DOM).

### `catalogo.html` — barra lateral virou prateleira de favoritos + modal novo

**Semântica das abas simplificada**: só sobra UM painel de verdade (`#studioItemsPanel`) — `#studioItemsTab`
fica sempre `aria-selected="true"` e ganhou `disabled` (nada pra alternar, clicar nele seria um no-op; sem
`disabled` o CSS de "ativo" continua igual, `.studio-library-tabs button:disabled{opacity:1;...}` evita o
esmaecimento padrão do navegador pra elemento desabilitado). `#studioFormatsTab` deixou de ser `role="tab"`/
`aria-controls` (não controla mais nenhum tabpanel) — virou um botão comum que abre
`#studioFormatsBrowseDialog`. `#studioFormatsPanel` (o painel antigo, com `#studioFormatsList`/pesquisa/
paginação) foi **removido por completo**, não só escondido.

**Prateleira de favoritos** (`#studioFavorites`, dentro de `#studioItemsPanel`, acima do campo de busca de
Itens): só aparece quando há pelo menos 1 favorito (`.hidden` por padrão); cartões compactos (foto 64×54 +
nome, sem estrela — favoritar só acontece dentro do modal). **Nunca dispara renderização 3D ao vivo** — se um
favorito ainda não tem `capa_url` (formato salvo antes da feature de foto, nunca aberto no modal desde então),
mostra um retângulo neutro em vez do fallback caro; a foto de verdade só chega quando o formato for aberto ao
menos uma vez no modal (o auto-cura de `backfillFormatCapa()`, já existente, chama `renderFavoritesShelf()` de
novo depois de preencher `capaUrl`).

**Modal "Todos os formatos"** (`#studioFormatsBrowseDialog`, `.studio-formats-browse-dialog{width:min(1100px,
...)}` — bem maior que os diálogos de troca/aplicar, que ficam em 1040px): busca (`#studioFormatsBrowseSearch`,
filtra por NOME **ou** CATEGORIA) + lista agrupada (`#studioFormatsBrowseList`). Cada card
(`formatBrowseCardMarkup()`) é o MESMO `formatCardMarkup()` de sempre (foto ou spinner+fallback ao vivo) com
uma estrela (`.studio-format-favorite`, ★/☆) sobreposta no canto — sem estrela pro "Lounge compacto" embutido
(sem `recordId`). Clicar na estrela favorita/desfavorita NA HORA (otimista — atualiza a UI antes da RPC
responder, desfaz se falhar) sem editar o formato nem fechar o modal; clicar em qualquer outro lugar do card
FECHA o modal e abre `#studioFormatApplyDialog` ("Escolher os móveis", já existente) — mesmo destino de
clicar num favorito na prateleira, os dois são só pontos de entrada diferentes pro mesmo fluxo.

**Agrupamento por categoria** (`renderFormatsBrowseModal()`): `format.categoria || "Outros"`, ordenado
alfabeticamente com "Outros" sempre por último (categoria nula não é "prioridade zero", é "não classificado
ainda"). **Sem paginação** — o modal (maior, com scroll PRÓPRIO em `#studioFormatsBrowseList`, não a página
inteira) mostra tudo de uma vez, dividido por seção; a categoria já cumpre o papel que a paginação de 6 em 6
cumpria antes (evitar uma lista longa demais de uma vez). O `IntersectionObserver` do fallback ao vivo
(formato sem foto) foi ajustado pra usar `root: list` (a própria `#studioFormatsBrowseList`, não o viewport)
— sem isso, cartões dentro de um contêiner com scroll PRÓPRIO poderiam nunca "intersectar" o viewport da
janela, mesmo visíveis dentro do modal.

**Categoria obrigatória em "Salvar formato"** (`#studioFormatDialog`): chips de sugestão + campo de texto
livre — mesmo padrão já usado em "Ambientes" no módulo Projetos (texto livre com sugestões, sem tabela de
lookup, exatamente como Categoria/Subcategoria de Itens já funcionam neste projeto). Sugestões
(`FORMAT_CATEGORY_SUGGESTIONS`): Lounge, Mesa de convidados, Mesa de bolo e doces, Bar, Cerimônia, Recepção,
Buffet — as 3 primeiras foram literalmente citadas pelo usuário como exemplo, as outras 4 seguem o mesmo
domínio (móveis pra evento). Clicar num chip desmarca o campo de texto (mutuamente exclusivos); digitar no
campo de texto desmarca qualquer chip ativo (`renderFormatCategoryChips()` decide o estado visual a partir de
`customFilled`, não guarda 2 fontes de verdade brigando). `effectiveFormatCategory()` (texto customizado, senão
o chip escolhido) é o valor de verdade enviado — `saveSelectedFormat()` bloqueia o `submit` com "Escolha uma
categoria pro formato." se vier vazio, ANTES de chamar a RPC (o servidor também valida, mas o cliente não
precisa de uma ida e volta de rede só pra descobrir isso).

### Fluxo completo (`catalogo-studio3d.mjs`)

`loadStudioFormats()` (antes só chamada ao clicar na aba "Formatos") agora roda **também uma vez no
`initCatalogStudio3D()`**, sem esperar nenhum clique — a prateleira de favoritos precisa estar povoada desde
o carregamento inicial da tela, já que não depende mais de abrir nada. Continua sendo chamada de novo toda vez
que o modal abre (`openFormatsBrowseDialog()`), pra sempre refletir formatos recém-criados/recém-favoritados
noutra aba. Depois de carregar, chama as duas renderizações: `renderFavoritesShelf()` (prateleira) e
`renderFormatsBrowseModal()` (conteúdo do modal, mesmo fechado — só fica invisível até `showModal()`).

`toggleFormatFavorite(key)`: atualiza `format.favorito` OTIMISTA (antes de a RPC responder) e redesenha os
dois lugares (`renderFormatsBrowseModal()` + `renderFavoritesShelf()`) na hora — desfaz e redesenha de novo se
a RPC falhar, com uma notificação de erro (`catalogNotify`, mesmo padrão do resto do catálogo).

`salvarCapaDoFormato()`/`anexarFotoDoFormato()`/`backfillFormatCapa()` (da feature de foto, sessão anterior)
ganharam um parâmetro `categoria` a mais, repassado em toda chamada subsequente de `lounge_formato_salvar` —
o `coalesce` da RPC já protegeria contra apagar a categoria mesmo sem isso, mas mandar o valor de verdade evita
depender só do `coalesce` do lado do banco.

Teste de regressão (`tests/studio-formatos-browser.cjs`, estendido): categoria bloqueia o `submit` até ser
escolhida (sem chamar a RPC enquanto vazia); digitar categoria própria desmarca os chips; escolher um chip
persiste `categoria` na 1ª chamada de salvar; "Formatos" abre o modal grande (não mais um painel que
alterna) com "Itens" continuando visível por trás; cartões agrupados por categoria (a escolhida ao salvar +
a fixa do embutido, "Outros" pra categoria nula, ordem alfabética com "Outros" por último); estrela favorita/
desfavorita na hora (chama `lounge_formato_favoritar`, sem estrela no embutido); formato favoritado aparece na
prateleira (nunca o embutido); clicar num card — tanto pela prateleira quanto pelo modal — fecha o que estiver
aberto e abre "Escolher os móveis" com seleção padrão fresca a cada vez; busca do modal filtra por nome OU
categoria; sem paginação (elementos antigos de página não existem mais); fallback ao vivo/auto-cura pra
formato sem foto continua funcionando igual dentro do modal (1 contexto WebGL reaproveitado, root do observer
escopado à lista do modal). **Ambiguidade encontrada rodando o teste**: com um formato favoritado, ele passa a
existir em DOIS lugares na tela ao mesmo tempo (prateleira + modal aberto) — qualquer seletor
`[data-studio-format="..."]` sem escopo vira `strict mode violation` no Playwright; corrigido escopando
explicitamente a `#studioFormatsBrowseList`/`#studioFavoritesList` em todo lugar onde os dois podem coexistir.

Cache-busting: `catalogo-studio3d.mjs?v=20260924-categoria-favorito` (toda a lógica nova) e
`catalogo-studio3d.css?v=20260924-categoria-favorito`, propagados em `catalogo.html`/`catalogo.mjs`/no import
de `catalogo-formatos.mjs` dentro de `catalogo-studio3d.mjs` (o próprio módulo de dado não mudou de conteúdo
nesta rodada — só ganhou 2 campos lidos de um registro que já existia — mas o `?v=` foi bumpado junto por
higiene, já que `catalogo-studio3d.mjs` importa esse caminho).

## Projetos: status do pedido saiu do espaço de trabalho, virou "Ver pedido" na lista

Pedido explícito do usuário, com print do espaço de trabalho de um projeto já enviado (a caixa "Pedido enviado
em... · Ver o que foi enviado" aparecendo logo abaixo do cabeçalho, empurrando o conteúdo): *"quero apagar isso,
quero que na linha de ana e bruno ali tenha o status do pedido, algo bem bonito e simples, por exemplo, pedido
enviado. aí algo pra clicar e ver o pedido por exemplo, mas esse ver pedido é aquele que a gente envia, bonito
com foto, com as renderizações"* — ou seja: (1) tirar a caixa fixa de dentro do projeto; (2) o status já aparece
na linha do projeto na LISTA (`.cpj-status`, já existia); (3) precisa de algo clicável ali que abra o pedido — e
esse "ver pedido" tem que ser a MESMA prévia bonita (com foto de cada item e as renderizações do projeto) que já
existe em "Enviar pedido"/"Reenviar pedido" (`pedidoPreviewHtml`, `projeto-apresentacao.mjs`), não inventar uma
segunda forma de mostrar a mesma coisa.

**A caixa (`#[data-cpj-banner]`/`pintarBanner()`) saiu do espaço de trabalho por completo** — não só escondida,
removida do HTML gerado por `pintarTela()` e da função que a desenhava. O que ela mostrava (selo de status, data
de envio, observação do decorador, aviso "alterado depois do envio", e os botões da equipe pra mudar o status)
não foi descartado — virou o topo do diálogo novo "Ver pedido" (`pedidoStatusHtml()`, reaproveitando as mesmas
classes CSS `.cpj-banner`/`.cpj-banner-main`/`.cpj-banner-status`/`.cpj-banner-obs`/`.cpj-banner-warn`). **O que
NÃO foi reaproveitado**: o `<details class="cpj-banner-snap">` que listava "o que foi enviado" em texto cru
(nome/quantidade/código por ambiente) — essa lista existia justamente pra suprir a falta de uma visão bonita; com
`pedidoPreviewHtml()` (foto de cada item + seção de renderizações) aparecendo logo abaixo no mesmo diálogo, o
resumo cru virou redundante e foi apagado (CSS `.cpj-banner-snap*` também removido, não só a marcação).

**O status na linha do projeto (`cartaoProjeto()`) virou o próprio gatilho**: quando `p.status !== "rascunho"`,
o `<span class="cpj-status">` vira `<button class="cpj-status" data-cpj-ver-pedido="...">` — o mesmo selo colorido
("Pedido enviado"/"Em análise"/"Convertido em pedido") já era "bonito e simples" o bastante (pedido literal do
usuário), só precisava ficar clicável; nenhum elemento novo foi adicionado ao lado dele. Projeto ainda em
rascunho continua com o `<span>` de sempre, sem nada pra "ver" ainda.

**Mesmo selo, também dentro do projeto** — pedido explícito do usuário logo em seguida, com print do espaço de
trabalho: *"quero que nessa tela, na mesma linha de Ana e Bruno também tenha o status do pedido"*. `pintarCabecalho()`
ganhou o MESMO botão `.cpj-status[data-cpj-ver-pedido]` (idêntico ao da lista, HTML e classe iguais — não um
componente novo) ao lado do `<h2>` do nome dos noivos, dentro de um `.cpj-work-title-row{display:flex;align-items:
center;gap:10px}` novo (só pra alinhar os dois na mesma linha visualmente, já que o `<h2>` serifado e o selo
`Manrope` têm alturas de linha bem diferentes). Como esse botão já mora DENTRO de `#catalogProjetos` (a `[data-cpj-
head]` faz parte do overlay, diferente do `<dialog>` do "Ver pedido", que é anexado em `document.body` à parte),
o clique já era capturado de graça pelo listener delegado que `aoClicarOverlay()` já tinha ganhado pra esse mesmo
atributo — nenhum listener novo precisou ser registrado.

**`fluxoVerPedido(id)`** busca o projeto completo na hora (`carregarProjeto`, a lista só guarda um resumo sem
`dados`/`pedido_snapshot`/`pedido_observacao`) e abre um `abrirModal({largo:true, confirmar:null, cancelar:
"Fechar", ...})` — mesmo padrão "só visualização" já usado no lightbox de renderização (`render-ver`). O corpo é
`pedidoStatusHtml(project, staff)` + `pedidoPreviewHtml(dadosApresentacao(project, ctx.findItem), {decorador})` —
a MESMA chamada que `fluxoEnviarPedido()` já fazia pra montar a prévia antes de confirmar o envio, sem duplicar
lógica. Ganhou também o botão "Baixar PDF" (`imprimirPedido`, idêntico ao que já existia no diálogo de envio) —
decorador e equipe conseguem baixar o PDF do pedido já enviado sem precisar reenviar pra ver a prévia de novo.

**Mudar o status agora acontece dentro do diálogo, não mais delegado pelo overlay**: como `abrirModal()` sempre
anexa o `<dialog>` direto em `document.body` (fora de `#catalogProjetos`), o listener delegado do overlay
(`aoClicarOverlay`) nunca alcança cliques lá dentro — os botões de status (`data-cpj-ver-status`, renomeados de
`data-cpj-status` pra não colidir com o atributo do gatilho da lista) ganham um listener próprio dentro do
`onMount`, mesmo padrão que o botão "Baixar PDF" do diálogo de envio já usava. `atualizarStatus(project, status)`
deixou de operar implicitamente em `S.current` (podia nem existir — "Ver pedido" abre direto da lista, sem entrar
no espaço de trabalho) — agora recebe o projeto explícito, só sincroniza `S.current` se for o mesmo projeto já
aberto, e devolve `true`/`false` em vez de pintar a UI sozinho; quem chama decide o que redesenhar (o bloco de
status dentro do diálogo, via `pedidoStatusHtml()` de novo, e a linha correspondente em `S.list` + `pintarLista()`
— senão a lista ficaria com o status antigo até um reload).

**Dead code removido junto, não só desativado**: o branch `data-cpj-status` do `aoClicarOverlay` (nunca mais
alcançável, já que os botões saíram do overlay) e a função antiga `pintarBanner()` foram apagados, não deixados
comentados. `pintarNavegacao()` também não chama mais `pintarBanner()` — o comentário que explicava esse
acoplamento ("toda edição de dados repinta a navegação: o aviso... acompanha") não fazia mais sentido sem o
banner ali dentro.

Teste: `tests/catalogo-projetos-browser.cjs` — os dois cenários que já cobriam "Enviar pedido"/"mudar status"
foram ajustados pro novo caminho (status na lista → diálogo, em vez da caixa dentro do projeto). **Esse arquivo
já tinha falhas pré-existentes não relacionadas** (achadas rodando o teste antes de mexer nele: trava em
`[data-cpj="ir-catalogo"]`, um botão que o handler em `aoClicarOverlay` já trata mas que sumiu do HTML de
`pintarPainel()` — resíduo de uma refatoração grande e ainda não commitada desta mesma sessão, sem relação com
"Ver pedido") — não corrigidas aqui, fora do escopo do que foi pedido. Pra não depender dessa suíte quebrada pra
verificar a mudança, a lógica nova foi confirmada ponta a ponta com um script Playwright avulso (mesmo mock,
`tests/mock-projetos.cjs`, sem passar pelo trecho quebrado): status na lista vira `<button>` só quando há pedido;
clicar abre o diálogo com a prévia de foto+renderizações; decorador não vê os botões de mudar status, equipe vê
e consegue mudar (RPC `projeto_atualizar_status` chamada com os parâmetros certos) e a lista reflete o novo
status ao fechar o diálogo, sem reload; e (depois do pedido de mostrar o selo também dentro do projeto) o mesmo
botão aparece em `.cpj-work-title-row`, ao lado do `<h2>`, e abre o mesmo diálogo de dentro do espaço de trabalho.

## Filtros da tela "Categorias" viraram uma pílula só (com print de referência)

Pedido explícito do usuário, com print de referência (barra "Filtre por... | Estilo ⌄ | Material ⌄ |
Personalizáveis ⌄", de outro site, "quero transformar os filtros do catálogo pra essa maneira"): a barra de
filtros (Material/Estilo/Personalizáveis, ver "Filtros na tela 'Categorias'..." mais acima) deixou de ser um
grupo de pílulas soltas lado a lado (cada uma com sua própria borda/fundo branco) e virou UMA pílula só —
fundo bege bem claro (`#f8f6f0`), contorno fino, sombra suave — com os segmentos separados por um traço vertical
fino, e um rótulo em itálico serifado ("Filtre por...") abrindo a barra, igual ao print. **Nenhuma lógica de
filtro mudou** — mesmo `HOME_FILTER_FIELDS`/`refreshHomeFilters()`/`itemMatchesHomeFilters()` de sempre, só o
HTML/CSS ao redor.

**Ordem invertida pra bater com o print**: `HOME_FILTER_FIELDS` era `[material, estilo]`, virou `[estilo,
material]` — o único efeito é a ORDEM dos botões no DOM (Estilo aparece primeiro agora); nenhum teste dependia
da ordem anterior.

**Estrutura nova** (`homeFilterBarMarkup()`, `catalogo.mjs`): a antiga `<div class="catalog-home-filters">`
única (que continha chips + "Limpar filtros" + resumo, tudo no mesmo flex-wrap) virou um wrapper
`.catalog-home-filters-wrap` com 3 filhos diretos — a pílula em si (`.catalog-home-filters`, agora só com o
rótulo + os campos + o toggle "Personalizáveis"), e "Limpar filtros"/o resumo ("5 itens em 4 categorias") logo
ABAIXO da pílula, centralizados, não mais dentro dela. Os ids (`#catalogHomeFilterClear`/
`#catalogHomeFilterSummary`) e todos os `data-home-filter-*` não mudaram — só a posição no HTML.

**Divisórias com CSS puro, sem elemento extra por divisória**: `.catalog-home-filters>*+*::before` desenha um
traço de 1px em CADA filho direto que tem um irmão anterior (rótulo→Estilo, Estilo→Material, Material→
Personalizáveis) — funciona igual pro `<span>` do rótulo, pros `<div class="catalog-filter">` (Estilo/Material)
e pro `<button>` solto (Personalizáveis), sem precisar de marcação condicional por tipo.

**Botões perderam a própria pílula branca-com-borda** (`.catalog-filter-chip`: era `border:1px solid
var(--line);background:#fff;border-radius:999px` — cada um uma pílula própria) — agora é só texto com padding
(`border:0;background:none`), a MESMA classe/comportamento de antes pro estado ativo (`.is-active{background:
var(--accent);color:#fff}` continua preenchendo, só que agora fica visualmente uma "pílula dentro da pílula"
quando um filtro está marcado — mesmo raciocínio de segmented control). Chevron (mesmo SVG de sempre) adicionado
também no botão "Personalizáveis" só por consistência visual com o print — ele continua sendo um TOGGLE (liga/
desliga na hora, sem painel), o chevron não gira nem abre nada ali, é só estética; `Estilo`/`Material` continuam
abrindo painel de verdade e o chevron deles continua girando 180° quando aberto (`.is-open`, sem mudança).

**Contagem do "Personalizáveis" continua sempre visível (mesmo em 0)** — comportamento JÁ EXISTENTE, não mexido:
diferente do badge de Estilo/Material (que só aparece quando ALGUM valor está marcado —
`badge.hidden = selected.size === 0`), o de Personalizáveis mostra sempre "quantos itens dariam match se
marcasse" (`refreshHomeFilters()`), então no print de referência (sem número nenhum) é só o print não ter dado
pra ver esse estado — a diferença de comportamento entre os dois badges é intencional de uma sessão anterior,
não foi tocada aqui.

Teste (`tests/catalogo-filtros-browser.cjs`, já existente): rodado sem nenhum ajuste — todos os seletores
(`.catalog-home-filters`, `[data-home-filter-trigger]`, `[data-home-filter-option]`,
`[data-home-filter-toggle="personalizable"]`, `#catalogHomeFilterClear`, `#catalogHomeFilterSummary`) continuam
os mesmos, só o HTML ao redor deles mudou. Verificado visualmente com Playwright (estado parado, painel aberto,
filtro ativo, e mobile 390px — a pílula cresce em altura e quebra em 2 linhas mantendo o formato arredondado, em
vez de vazar da tela). Cache-busting `catalogo.css?v=20260924-filtros-pilula` / `catalogo.mjs?v=20260924-
filtros-pilula`.

**Estendido pro filtro de subcategoria dentro de uma categoria** (pedido explícito do usuário, com print da
categoria "Armários e Estantes" mostrando "TODOS / BASES INFERIORES.../ BASES SUPERIORES.../ ESTANTES" ainda
como pílulas soltas: *"dentro da categoria o filtro deve ser o mesmo também"*) — `.catalog-subcat-filter`
(`renderSubcatFilterBar()`, ver "Filtro premium de subcategoria..." mais acima) ganhou a MESMA fórmula visual:
pílula única (fundo `#f8f6f0`, contorno, sombra) com os chips ("Todos" + cada subcategoria) sem borda/fundo
próprios, separados pelas mesmas divisórias finas (`>*+*::before`), ativo preenchido na cor terrosa. **CSS
duplicado de propósito, não compartilhado com `.catalog-home-filters`** — são dois filtros conceitualmente
diferentes (um grupo de campos com dropdown vs. uma lista de opções de seleção única) que só coincidem em
aparência; deixar cada um com sua própria regra evita que um ajuste futuro num afete o outro sem querer. Nenhum
`data-subcat-filter`/`aria-pressed` mudou — só o HTML ao redor. `.catalog-subcat-filter` virou `width:fit-
content;margin:0 auto` (antes centralizava os chips soltos via `justify-content:center` num flex de largura
total) pra a pílula única abraçar só o próprio conteúdo, exatamente como a de cima.

**1ª versão saiu sem o rótulo "Filtre por..."** (a leitura inicial foi "os chips já SÃO o próprio filtro, o
rótulo seria redundante aqui") — usuário corrigiu na hora, com print comparando lado a lado: *"não ficou a mesma
coisa, tinha que ter ficado, filtro por ... igualzinho"* — "igualzinho" (idêntico) foi levado ao pé da letra:
`renderSubcatFilterBar()` ganhou o MESMO `<span class="catalog-filter-label">Filtre por...</span>` (reaproveitado
tal qual, não uma cópia — é a classe já usada na barra de cima), como primeiro filho da pílula, antes do "Todos".
**Lição**: quando o usuário manda um print pedindo pra igualar a outro elemento já existente no próprio app
("do jeito que já fizemos ali"), replicar TODO o elemento de referência (rótulo incluso), não só a moldura visual
ao redor — a suposição de "essa parte não se aplica aqui" precisa ser confirmada, não assumida.

Teste (`tests/catalogo-subcategoria-browser.cjs`, já existente): rodado sem ajuste, mesmos seletores
(`[data-subcat-filter]`, `.is-active`) continuam passando. Verificado visualmente (pílula com o rótulo "Filtre
por..." + "Estantes" ativo, filtrando a grade de verdade). Cache-busting `catalogo.css?v=20260924-subcat-pilula`
/ `catalogo.mjs?v=20260924-subcat-filtre-por`.

**Superado pela seção seguinte** ("Filtro dentro de uma categoria virou o mesmo grupo..."): o atributo
`[data-subcat-filter]`/a classe `.catalog-subcat-chip` citados acima não existem mais — a subcategoria virou um
campo dropdown dentro da mesma barra de Material/Personalizáveis, não mais uma fileira de chips. Histórico
mantido só pelo raciocínio (visual "pílula única com divisórias", reaproveitado tal qual na versão nova).

## Filtro dentro de uma categoria virou o mesmo grupo Subcategoria + Material + Personalizáveis da tela "Categorias"

Pedido explícito do usuário, na sequência imediata da seção anterior, com print da barra já com "Filtre por..."
mas só com Subcategoria: *"essas subcategorias precisam estar dentro de todos, entendeu? e do lado vai estar os
mesmo filtros da categorias, material e personalizaveis, ou seja, quando eu clicar em todos vai aparecer as
subcategorias, aí eu seleciono qual eu quero ver"*. Ou seja: (1) Subcategoria deixa de ser uma fileira de chips
soltos e vira mais um CAMPO da barra, rotulado "Todos" (o texto que já significava "sem filtro"); (2) ao lado
dela, na MESMA barra, aparecem Material e Personalizáveis — os mesmos campos já usados na tela "Categorias"
(`HOME_FILTER_FIELDS`), só que escopados aos itens DESTA categoria, não do catálogo inteiro.

**"Todos" virou um `<select>` de fato, diferente de Material/Estilo**: o botão que abre o painel de Subcategoria
mostra o NOME DA SUBCATEGORIA ESCOLHIDA (ou "Todos", sem nada marcado) — não o nome fixo de um campo como
"Material"/"Estilo" sempre mostram. Dentro do painel, cada linha (`data-cat-subcat-option="slug"`, incluindo
`""` pra "Todos") é um `<button>`, seleção ÚNICA — clicar já aplica E fecha o painel sozinho, sem precisar de um
botão "Aplicar" à parte. Material/Estilo continuam como `<label><input type=checkbox>` (seleção múltipla,
painel fica aberto pra marcar mais de um valor).

**Estado próprio, para não arriscar a tela "Categorias" já testada**: `state.categoryFilters`/
`state.categoryFilterOpen` (mesmo formato de `state.homeFilters`/`newHomeFilters()`, reaproveitada a função de
fábrica) — independentes de `state.homeFilters`. `applyView()` já zerava `state.activeSubcat` a cada navegação
(entrar/trocar de categoria, reentrar pela trilha) — ganhou mais duas linhas zerando `categoryFilters`/
`categoryFilterOpen` junto, mesmo raciocínio ("tela limpa a cada entrada"). As funções de cálculo
(`itemMatchesCategoryFilters`, `categoryFieldOptions`, `categorySubcatOptions`, `hasCategoryFilters`) são cópias
PARALELAS das equivalentes de `state.homeFilters` (`itemMatchesHomeFilters` etc.), não uma generalização
compartilhada — decisão deliberada: `itemMatchesHomeFilters`/`homeFilterOptions`/`refreshHomeFilters()` já têm
uma suíte própria passando (`tests/catalogo-filtros-browser.cjs`); refatorar pra compartilhar código arriscaria
essa suíte por uma economia de ~40 linhas. Mesmo espírito de outras duplicações já documentadas neste arquivo
(ex. ícones/helpers repetidos entre `catalogo-biblioteca.mjs`/`catalogo-lounge.mjs`/`catalogo-studio3d.mjs`).

**Sem o "refresh cirúrgico" que `refreshHomeFilters()` tem** (que só repinta contagens/marcações, preservando o
painel aberto e o foco sem recriar nada — pensado pro volume do catálogo inteiro): aqui, TODO clique
(escolher/marcar/desmarcar/abrir/fechar campo) passa por um `renderCurrentView()` de verdade, reconstruindo a
barra e a grade inteiras — mesmo padrão simples que a subcategoria sozinha já usava antes desta mudança. **O
painel continua "aberto" mesmo com esse rebuild total** porque `state.categoryFilterOpen` decide isso NO PRÓPRIO
ESTADO a cada render (`categoryFilterFieldMarkup()`/`categorySubcatFieldMarkup()` leem
`state.categoryFilterOpen === field.key` pra decidir `hidden`/`aria-expanded`), não em manipulação de DOM — não
precisou de nenhuma lógica de "preservar o que já estava aberto". Troca aceita conscientemente: perde o foco do
teclado a cada clique (o elemento é recriado do zero), diferente da tela "Categorias" — like-for-like custaria
uma refatoração de `renderGridMarkup()`/`renderMosaicMarkup()` bem maior (separar a grade num container próprio
pra atualizar só ela) pra um ganho que não foi pedido.

**Material/Estilo já vêm ESCOPADOS pela subcategoria ativa**: `categoryFieldOptions(categoryItems, field)`
pré-filtra os itens por `state.activeSubcat` antes de calcular grafias/contagens — escolher "Sofás" faz o painel
de Material listar SÓ os materiais que existem entre os sofás (Madeira/Veludo de outras subcategorias nem
aparecem como opção, não é só a contagem que muda). `itemMatchesCategoryFilters(item, skip)` combina os TRÊS
critérios com E: subcategoria (pulada quando `skip==="subcat"`, usado pra contar as próprias opções dela),
Material/Estilo (mesmo `HOME_FILTER_FIELDS`, pulando a chave em `skip`) e Personalizáveis.

**Campo só aparece com 2+ valores DENTRO DA CATEGORIA INTEIRA — não da subcategoria atual**: diferente da tela
"Categorias" (catálogo inteiro, onde até um campo com 1 valor só já é mostrado, pensando no catálogo crescer),
aqui um campo com 1 valor só não ajudaria em nada (mesmo raciocínio já usado pra Subcategoria desde a sessão
anterior). **Achado implementando**: calcular esse "vale a pena mostrar" usando os itens JÁ ESCOPADOS pela
subcategoria ativa fazia o campo Material aparecer e desaparecer sozinho conforme a subcategoria escolhida (ex.:
dentro de "Sofás" só tem 1 material → campo sumia, ficando só "Todos" + Personalizáveis) — sensação de UI
"pulando". Corrigido calculando esse critério a partir da categoria INTEIRA, sem aplicar o filtro de
subcategoria ainda (`new Set(categoryItems.flatMap(item => homeFilterKeysOf(item, field.key))).size > 1`) — o
campo Material, uma vez que existe, nunca some por causa da subcategoria escolhida; só a LISTA DE OPÇÕES dentro
dele fica mais curta.

**Bug real corrigido ainda na implementação, achado no screenshot antes mesmo de escrever o teste**: as opções
de Subcategoria (agora `<button>`, não mais `<label>`) apareciam cada uma dentro de uma caixinha com borda —
`.catalog-filter-option` nunca tinha border/background explícitos porque, como `<label>`, o navegador já não
desenha nenhum dos dois por padrão; um `<button>` desenha os dois por padrão, e a classe nunca havia sido usada
num botão antes. Corrigido com `border:0;background:none;font:inherit;text-align:left;width:100%` na MESMA
regra `.catalog-filter-option` — inofensivo pro `<label>` (que já não tinha nenhum dos dois) e necessário pro
`<button>`. Achado comparando o screenshot ANTES/DEPOIS da correção, não só lendo o CSS — mesma lição já repetida
várias vezes neste arquivo (confirmar no navegador renderizado, não só no código-fonte).

Teste (`tests/catalogo-subcategoria-browser.cjs`, reescrito): fixtures ganharam `material`/`personalizable` nos
itens de "Estofados" pra testar a combinação de verdade — Subcategoria "Sofás" + Material "Estofado Tecido" +
Personalizáveis chega em 1 item só (dos 5 da categoria); Material dentro de "Sofás" mostra só o valor que existe
ali; o painel de Material fica aberto entre marcações (mesma UX da tela "Categorias") mas o de Subcategoria
fecha sozinho ao escolher; imersivo respeita o filtro combinado; sair e reentrar na categoria reseta os três de
uma vez; categoria com 1 subcategoria e 1 material (Mesas) não mostra barra nenhuma; categoria sem nenhuma
subcategoria mas com 2 materiais (Aparadores) mostra a barra só com Material, sem o campo Subcategoria nem
Personalizáveis; busca continua sem o filtro; sem overflow mobile. Suíte de regressão do catálogo (12 arquivos
tocando renderização/clique compartilhados) rodada de novo, incluindo `tests/catalogo-filtros-browser.cjs` (tela
"Categorias", intocada) — todas passando; as únicas 2 falhas encontradas
(`tests/catalogo-browser.cjs`/`#studioProjectSave`, `tests/catalogo-breadcrumb-browser.cjs` inexistente) já eram
conhecidas/pré-existentes, sem relação com esta mudança (ver "Riscos conhecidos"/"Trilha... apagada" mais
abaixo/acima). Cache-busting `catalogo.css?v=20260924-filtro-categoria-unificado` /
`catalogo.mjs?v=20260924-filtro-categoria-unificado`.

## Estado da migração (checar antes de assumir o padrão de um módulo)

Para saber se um módulo já é "novo" (documento próprio, HTML completo,
`shellNavigate`) ou "antigo" (fragmento, `carregarNaMain`), olhar a primeira
linha do `.html`: se começa com `<!DOCTYPE html>` é novo; se começa direto
com uma `<div>`/seção, é fragmento antigo.

Já convertidos (20): CadastroLocais, CadastroClientes, CadastroFornecedores,
cadastro-caminhoes, CadastroItens (+ item-detalhes + item-modelo-3d),
Pedidos/CentralPedidos (+ pedido.html), OrdemdeServicos, Almoxarifado,
Personalizacoes, SeparacaoMateriais, Cronograma, EquipeRotas, Catalogo,
Financeiro/fluxodecaixa, Importacao/ImportarItens, Estoque/TabelasPreco
(as duas últimas nasceram direto no modelo novo, nunca foram fragmento).

Ainda fragmento (13, maioria escondida do menu hoje): Contratos,
PlanejadorEventos, Configuracoes/Integracoes/GatewaysPagamento,
Configuracoes/Integracoes/WhatsApp, Configuracoes/Permissoes,
Estoque/Compras, Estoque/Controledequalidade,
Estoque/DisponibilidadeItens, IA/StudioIA, Logistica/Expedicao,
Logistica/PlanejamentoLogistico, Logistica/Roteirizacao,
RH/GestaoPessoas.

Plano de migração detalhado (fases, receita de conversão por módulo,
checklist de verificação): `C:\Users\jonat\.claude\plans\cryptic-swinging-creek.md`.

## Estrutura de pastas

Cada módulo mora em `Modulos/<Categoria>/<NomeDoModulo>/arquivo.{html,css,js}`
— 3 níveis de profundidade, por isso os caminhos relativos dentro de um
módulo convertido começam com `../../../` até a raiz (ex.:
`../../../styles/global.css`). Ao criar ou copiar um módulo, conferir esse
número de `../` contando a profundidade real da pasta.

Núcleo compartilhado fica em `js/core/` (não dentro de `Modulos/`):
`supabase.js` (cliente único, `window.supabaseClient`), `context.js`,
`moduleLoader.js`, `appShell.js`, `themePrepaint.js`, `alerta.js`,
`companyTheme.js`, `permissions.js`, `listPager.js`, `paymentPix.js`,
`zapiMessaging.js`, `qrCode.js`, `productionConsole.js`.

## Riscos conhecidos, ainda não corrigidos

- **A corrida assíncrona do `aguardarContexto()` (ver seção do
  `context.js` acima) provavelmente ainda afeta vários outros módulos
  convertidos** — só foi corrigida pontualmente em Clientes, Fornecedores,
  Caminhões, Personalizações e agora CadastroItens, conforme cada um foi
  reportado com problema. Uma varredura rápida (`grep` por
  `window.__CONTEXT.empresa_id`/`window.__CONTEXT?.empresa_id` sem
  `aguardarContexto` em algum lugar do arquivo) encontrou o mesmo padrão
  suspeito em: `Modulos/Comercial/Pedidos/CentralPedidos.js`,
  `Modulos/Estoque/Almoxarifado/Principal/almoxarifado.js` (esse já sabido,
  usa fallback `|| window.empresa_id || null` em vez de esperar),
  `Modulos/Estoque/CadastroItens/itens.foto.mjs`,
  `Modulos/Estoque/CadastroItens/kits.modal.mjs`,
  `Modulos/Estoque/SeparacaoMateriais/separacao-materiais.js`,
  `Modulos/Financeiro/fluxodecaixa.js`,
  `Modulos/Logistica/Cronograma/Cronograma.js` e
  `Modulos/Logistica/EquipeRotas/equipe-rotas.js`. **Não corrigido
  ainda** — nem todo "suspeito" é necessariamente um bug real (alguns só
  disparam depois de uma ação do usuário, quando o contexto já está pronto
  há tempo — o risco de verdade é sempre no carregamento INICIAL da lista),
  mas vale conferir cada um antes de assumir que está tudo bem. Perguntar
  antes de sair corrigindo todos de uma vez — pode ser mais do que foi
  pedido.
- ~~"Cadastro de Itens: clico na linha e nada acontece"~~ — corrigido.
  Causa: `cadastro-itens.mjs` tinha um `if(typeof window.carregarNaMain
  !== "function") return;` no início de `abrirPaginaDetalhesItem()` — uma
  checagem de sanidade do modelo ANTIGO (fazia sentido quando o módulo
  rodava dentro do `dashboard.html`, que carrega `moduleLoader.js`). Como
  esse módulo já é um documento próprio, `carregarNaMain` nunca existe
  nesse contexto, e a função sempre retornava sem navegar. Removida.
- ~~"Não estou vendo as personalizações cadastradas"~~ — corrigido. Era a
  mesma corrida assíncrona do `aguardarContexto()`: `js/Estoque/
  estoque-personalizacoes.mjs` lia `window.__CONTEXT.empresa_id` direto,
  sem esperar, logo no carregamento inicial (`carregarItensEComponentes`,
  `carregarInsumos`, `carregarPersonalizacoesBanco`). Corrigido com um
  `await window.aguardarContexto()` no início de
  `initEstoquePersonalizacoes()`, antes da primeira consulta.
- ~~Menu do `dashboard.html` era HTML escrito à mão e misturava as duas
  convenções de clique~~ — corrigido: menu agora é dado
  (`js/ui/sidebarMenu.js`), ver "Menu lateral" acima.
- ~~"O nome do item/componente em Personalizações cadastradas está em
  negrito"~~ — corrigido. Pegadinha: o nome nunca esteve em `<strong>`
  por acidente nem o negrito vinha dali — `js/Estoque/
  estoque-personalizacoes.mjs` até tinha `<strong>` ali, mas o negrito de
  verdade vinha de `styles/design-system.css`: `:is(#main-content,.el-page)
  :is(table,.el-table-card table) tbody td:first-child { font-weight:700;
  }` — deixa em negrito a PRIMEIRA coluna de QUALQUER tabela dentro de
  `.el-page`, tabela inteira, não só `<strong>`/`<b>`. O módulo já tinha
  regras tentando corrigir isso (`.data-table tbody td strong{font-
  weight:400}`), mas mirando na tag errada — o `<strong>` nunca foi a
  causa, e mesmo removendo a tag o negrito continuava (confirmado com
  `getComputedStyle` antes de mexer, não só lendo o código). Trocado
  `<strong>` por `<span>` (mais correto semanticamente, já que não é
  ênfase) e adicionada `.data-table tbody td:first-child{font-weight:400
  !important}` em `estoque-personalizacoes.css` — precisa do
  `!important` porque a regra de `design-system.css` ganha especificidade
  de ID via `:is(#main-content,.el-page)` mesmo a página só tendo a
  classe `.el-page`. **Esse `tbody td:first-child` é genérico pro app
  inteiro** — qualquer outra tabela dentro de uma tela `.el-page` com
  pedido parecido ("tirar negrito da primeira coluna") vai ter a mesma
  causa raiz, não adianta procurar `<strong>`/`<b>` no código-fonte.
- **Logo do menu (histórico resumido, várias idas e vindas — ler antes de
  mexer de novo):** passou por três abordagens diferentes na mesma sessão
  antes de chegar na atual. (1) Zoom por empresa (`logo_zoom`) aplicado via
  `transform:scale()` com origem `center` cortava o topo da logo quando o
  zoom passava de ~1.1, porque a barra é fixa no topo com pouca folga. (2)
  Trocar a origem pra `left top` resolveu o corte por cima mas não por
  baixo — a barra cresceu de 72px pra 92px "pra caber uma logo maior", o
  que o usuário **não tinha pedido** (ver [[feedback-scope-discipline]] na
  memória de longo prazo) — revertida pra 72px. (3) **Abordagem atual**: o
  usuário mostrou que a logo no Catálogo (`Modulos/Comercial/Catalogo/
  catalogo.css`, `.catalog-brand-logo`) já usa um recurso parecido — altura
  fixa pequena (`max-height:49px`) + `transform:scale(3.6)` fixo (sem JS,
  sem zoom por empresa) — e pediu pra logo do menu ficar "do mesmo jeito,
  mesmo tamanho". A logo do menu (`.app-navigation .sidebar-header img` em
  `styles/navigation-v2.css`) agora usa exatamente os mesmos valores
  (`max-width:215px;max-height:49px;transform:scale(3.6);transform-
  origin:left center;pointer-events:none`), e `js/core/companyTheme.js`
  **não aplica mais nenhum transform via JS** no `#sidebarLogo` — `logo_zoom`
  continua salvo no banco mas não afeta mais essa logo, exatamente como já
  acontecia no Catálogo. A barra continua em 72px; a logo **deliberadamente
  ultrapassa os limites da barra** (sobra visualmente por cima e por baixo,
  com `overflow:visible` nos containers) — isso é o efeito pedido, não um
  bug, desde que `pointer-events:none` continue lá (senão a logo bloqueia
  cliques no menu por baixo dela).
- ~~"Cadastro de Locais funciona melhor que os outros, principalmente
  Clientes" (mesmo CSS, resultado visual diferente)~~ — corrigido. Causa
  real, nada a ver com CSS: `cadastro-clientes.html`,
  `almoxarifado.html` (Estoque) e `Cronograma.html` (Logística) tinham um
  **BOM (byte-order-mark, `EF BB BF`) sobrando bem no meio do documento**
  — logo depois de `<body>`, antes da `<div>` principal — e não no início
  do arquivo (onde um BOM é normal e o navegador ignora sozinho). No meio
  do body, esse caractere vira um nó de texto de verdade antes da `<div>`,
  e cria uma caixa de linha invisível com ~20px de altura — exatamente o
  tipo de coisa que não aparece lendo o CSS, só medindo o layout
  renderizado. Removido dos três arquivos. **Se algo continuar
  "diferente" numa tela mesmo com CSS idêntico ao de um módulo que
  funciona, checar bytes crus do HTML** (`grep -c $'\xef\xbb\xbf' arquivo`
  e comparar se a ocorrência está no byte 0 do arquivo ou no meio) antes
  de assumir que é cascata de CSS — nem todo bug de layout é CSS.
- `styles/shell.css` ainda carrega um conjunto grande de regras do design
  antigo de sidebar (rail vertical colapsado com hover-para-expandir:
  `.sidebar:hover`, `.sidebar.expanded`, `.sidebar.flyout-locked`, busca
  lateral `.sidebar-search*`) que **nenhum JS do sistema atual usa mais**
  (confirmado: nenhuma classe `.expanded`/`.flyout-locked` é adicionada em
  lugar nenhum, e `.sidebar-search-row` é escondida com `!important` tanto
  no desktop quanto no mobile em `navigation-v2.css`). É código morto, não
  removido ainda por não ter sido pedido — mas é a fonte mais provável de
  "eu mudei o CSS e não fez efeito" nessa área do menu, porque tem muita
  regra concorrente sem `!important` competindo por especificidade com o
  layout novo. Antes de mexer em `.sidebar-header`/`.sidebar-brand`/menu,
  sempre confirmar no navegador renderizado (não só ler o código) qual
  arquivo realmente está vencendo.

## Tabelas Supabase referenciadas no código (índice, não schema verificado)

`empresas`, `usuarios`, `usuarios_empresas`, `assinaturas`, `clientes_empresas`,
`fornecedores`, `locais`, `locais_empresas`, `caminhoes`, `categorias`,
`categorias_caminhao`, `categorias_montagem`, `itens`, `itens_fotos`,
`itens_danificados`, `kit_itens`, `insumos`, `personalizacoes`,
`personalizacoes_insumos`, `ordens_servico`, `separacoes_itens`,
`separacoes_pedidos`, `contratos_pedidos`, `contratos_modelos`,
`cronograma_logistico`, `planejamento_caminhoes`, `planejamento_equipe`,
`planejamentos_logisticos`, `empresa_logistica_regras`, `empresa_financeiro`,
`configuracoes_empresa`, `empresas_configuracoes`, `colaboradores`,
`permissoes_usuario`, `permissoes_catalogo`, `logs_permissoes`, `avatares`,
`servicos_adicionais`, `metas_setores_mensal`, `producao_setores_mes`,
`desempenho_mensal`, `teto_gastos_mensal`, `studio_projetos`,
`studio_renderizacoes`, `ia_conhecimento`.

Levantado por busca textual (`.from("...")`) em todo o repositório — útil
como ponto de partida para achar onde uma tela lê/grava uma tabela, mas
**não confirma coluna nem relação**; conferir a migration correspondente em
`supabase/migrations/` antes de assumir um schema.

## Preferências de trabalho do responsável pelo projeto

- Não gosta de suposição de cache como resposta padrão para "não mudou nada"
  — sempre investigar até achar a causa real no código antes de sugerir
  cache do navegador.
- Prefere ver a estrutura ficar mais fácil de navegar/corrigir ao longo do
  tempo (este arquivo existe por causa disso) em vez de aceitar que o
  sistema "é difícil de mexer" como estado permanente.

## Busca saiu do cabeçalho (canto superior direito) + "Limpar filtros" ao lado da pílula

Pedido explícito do usuário: *"esse limpar filtro na categoria eu quero que fique na mesma linha do card principal,
outra coisa, quero remover o campo de pesquisa(pesquisar) do menu e quero colocar no canto superior direito"*.
**Supera** "Campo de busca do cabeçalho, mais visível" (a pílula translúcida dentro do cabeçalho escuro não existe mais).

- **Busca** (`.catalog-search`/`#catalogSearch`, mesmo id e mesmo listener de sempre): saiu do `<header>` e mora num
  wrapper novo, `.catalog-top-tools` (dentro de `.catalog-top-chrome`, `position:absolute;top:100%;right:0` — o mesmo
  mecanismo que o `#catalogViewSwitcher` já usava, e o switcher agora mora dentro desse wrapper, ao lado da busca).
  Visual claro (fundo branco translúcido + blur, contorno `var(--line)`, `var(--accent)` no foco), 180–240px. O
  wrapper tem `pointer-events:none` e só os filhos recebem clique, pra a faixa vazia não bloquear o conteúdo por baixo.
  O cabeçalho perdeu a coluna `search` em todas as faixas (`grid-template-areas` sem ela); as regras
  `body.catalog-modo-sistema .catalog-search*` foram apagadas (a busca não fica mais na faixa clara desse modo).
  Continua escondida no celular (≤767px) e dentro de overlays (`setActiveOverlay()` já fazia isso).
- **"Limpar filtros"** (tela Categorias): `.catalog-home-filters-wrap` virou flex em linha com quebra — pílula e
  "Limpar filtros" lado a lado, centralizados; o resumo ("1 item em 1 categoria") continua embaixo (`flex-basis:100%`).

Teste: `tests/catalogo-busca-visivel-browser.cjs` reescrito (busca fora do header, logo abaixo dele e na borda direita
em 1100–1920px, "Pesquisar" cabe, não sobrepõe a pílula nem o "Limpar filtros", que fica na mesma linha da pílula;
some em overlay e no celular). Cache-busting `catalogo.css?v=20260924-busca-canto`.

**Ajuste seguinte** (*"na home não era pra ter campo de pesquisa e não é pra ter o voltar"*): no Portal ("Home") a busca e
o botão "← Voltar" (`#catalogGlobalBack`, criado por `bindNavHistory()` quando o catálogo abre fora do dashboard) ficam
escondidos. `syncNavigation()` liga a classe `catalog-no-portal` no `<body>` quando `activeView===GATEWAY_VIEW` sem overlay,
e o CSS esconde os dois. Nas outras telas eles voltam. Coberto em `tests/catalogo-busca-visivel-browser.cjs`. Cache-busting
`?v=20260924-portal-sem-busca`.

## Projetos: digitar a quantidade de um item (não só clicar "＋" várias vezes)

Pedido do usuário, com print da grade de estantes: *"hoje temos que ficar clicando, mas eu quero que a pessoa possa clicar
pra adicionar 1 item ou que ela possa digitar a quantidade, imagina que são 30 itens do mesmo"*.

- **Chip do card** (`.cpj-add-chip`, grade e mosaico) virou duas partes: `＋` (soma 1, como sempre) e o número
  (`.cpj-add-count[data-projeto-qty]`; mostra "Qtd." antes de o item estar no ambiente). Clicar no número abre
  `abrirQtdPop()` (`catalogo-projetos.mjs`): um campo pequeno junto do chip com o nome do item e o ambiente, − / campo / ＋ e
  "Salvar"/"Adicionar". O número já vem selecionado, então basta digitar 30 e dar Enter. Esc ou clique fora cancela, e 0 tira
  o item do ambiente. O aviso tem "Desfazer", que volta à quantidade anterior. Grava por `mudarQuantidade(..., {definir})`,
  então o autosave é o de sempre. Sem projeto ativo, pergunta o destino primeiro (`garantirDestino`), igual ao `＋`.
- **O campo mora no `<body>`, não dentro do chip**: o chip fica dentro do `<button>` do card, e um `<input>` dentro de um
  botão é HTML inválido (em alguns navegadores nem recebe foco). Posição `fixed`, calculada a partir do chip e mantida dentro da
  tela. Fecha ao rolar ou redimensionar.
- **Página do item**: `projetoAddMarkup(id,"page")` agora devolve `.cpj-add-page-wrap` com "Adicionar ao projeto" + um link
  discreto "Quantidade" (`.cpj-add-page-qty[data-projeto-qty]`), que abre o mesmo campo.
- O clique em `[data-projeto-qty]` é tratado no mesmo listener de captura do `＋` (antes dele) e faz `stopPropagation`, então
  nunca abre o item.

Teste: `tests/catalogo-projetos-quantidade-browser.cjs` (＋ soma 1 sem abrir o item; número → digitar 30 + Enter; Esc e clique
fora não mudam nada; − / ＋ do campo; "Qtd." num item novo; 0 remove; "Quantidade" na página do item; campo dentro da tela no
celular). Cache-busting `catalogo-projetos.{css,mjs}?v=20260925-quantidade` e `catalogo.mjs?v=20260925-quantidade`.

## Botão "Voltar" abaixo da logo, fora do menu, com respiro

Pedidos do usuário, em sequência: *"quero que o botão voltar seja um pouco maior e não quero que fique assim por cima de outras
coisas"* → (tentativa dentro do cabeçalho, recusada) *"o botão voltar precisa ficar abaixo da logo fora do menu"* → *"não pode
ficar nada atrás dele, precisa ter um respiro mínimo"*. `#catalogGlobalBack` (criado por `bindNavHistory()` só quando o catálogo
abre fora do dashboard) mora em `.catalog-top-chrome` (sticky), `position:absolute;top:100%` + `margin-top:9px`, à esquerda
alinhado com a logo — pílula clara de 38px com seta SVG + "Voltar". Ao ser criado, liga `body.catalog-tem-voltar`, e cada
tela reserva o topo esquerdo pra ele (≥768px): grade/mosaico de categoria (`.catalog-grid-wrap` 60px, exceto quando abre com
uma barra de filtro centralizada, que não encosta nele), página do item (`.catalog-detail-panel` 62px), 3D Livre
(`.studio-library` 62px, em catalogo-studio3d.css) e Projetos (`.cpj-wrap` 62px, em catalogo-projetos.css). Some no Portal
(`catalog-no-portal`) e no celular (≤767px, a seta ‹ da linha do tempo faz o mesmo). **Tela nova que começa no canto superior
esquerdo precisa ganhar a mesma regra `body.catalog-tem-voltar ...{padding-top}`**, senão o conteúdo fica atrás do botão.

Teste: `tests/catalogo-voltar-browser.cjs` — 1100/1440/1920px em Categorias (com e sem filtro), grade, mosaico, imersiva,
Biblioteca (pastas e pasta aberta), 3D Livre, lista de Projetos e projeto aberto: nenhum texto/imagem/botão a menos de 6px do
Voltar, botão abaixo do menu, à esquerda, ≥36px; Portal sem ele. Cache-busting `?v=20260925-voltar-respiro`.

## Ordem dos itens na categoria: equipe interna arrasta, decoradores veem

Pedido do usuário, com print da grade de Estantes: *"essa função deve ser somente da equipe interna da Chiavari... se eu
quiser colocar a estante Lord na frente da estante Cacau eu posso simplesmente arrastar ela pra posição que eu quero, e
aquela posição passa a ser a padrão que todos os decoradores vão ver"*.

- **Dado**: reaproveita a coluna `itens.ordem_exposicao_site` (existia desde a importação, "NULL = sem ordem"). Migration
  `20260925000100_catalogo_ordem_itens.sql` (aplicada com `db push --linked`): `catalogo_acervo()` passa a devolver
  `ordem_exposicao_site` e a ordenar `categoria, ordem nulls last, produto, id`; RPC nova `catalogo_reordenar(p_empresa_id,
  p_itens jsonb [{id,ordem}])`, `security definer`, só com `auth.uid()` vinculado à empresa em `usuarios_empresas` (mesma
  regra das outras edições do catálogo — o decorador não tem `auth.uid()`, então nunca grava). Verificado no banco: sem
  login recusa ("Sem permissão para ordenar o catálogo"); a leitura já traz o campo.
- **Ordem na tela** (`compararOrdemCatalogo()`, usada em `renderProducts()` → vale pra grade, mosaico e imersiva): quem tem
  ordem primeiro, por ordem; sem ordem depois, com a regra antiga de "com foto antes" (sort estável). Grupo de variantes
  (mesma peça em várias cores) fica na posição da variante mais à frente (`agruparVariantes`), e ao reordenar TODAS as
  variantes do grupo recebem a mesma ordem.
- **Arrastar** (`bindReordenarCards()`, HTML5 drag & drop em `#catalogGrid`): só `state.acessoInterno`, só na GRADE de uma
  categoria (`podeReordenar(categoryItems)` — a busca não passa `categoryItems`, e o mosaico/imersiva não arrastam). Card
  com `draggable`, cursor de mão e uma alça (⋮⋮) no canto superior esquerdo que aparece no hover; o card arrastado fica
  esmaecido no lugar onde vai cair e os outros andam na hora (reordena o DOM no `dragover`). No `dragend`, se a ordem
  mudou, `reordenarCategoria()` grava a posição de TODOS os itens da categoria (10, 20, 30…) — com filtro ativo, os
  visíveis trocam de lugar só entre si e os escondidos pelo filtro ficam onde estavam. Aviso "Ordem salva"; erro volta a
  ordem anterior e redesenha. Clique normal no card continua abrindo o item.
- **Categorias também** (pedido seguinte: *"quero que a mesma função seja aplicada dentro de categorias"*): os cards da
  tela "Categorias" arrastam do mesmo jeito (mesmo `bindReordenarCards()`; o `dragend` decide pela classe
  `.catalog-home-grid`). Categoria é texto livre, então a ordem mora numa tabela nova, `catalogo_categorias_ordem
  (empresa_id, categoria, ordem)` (migration `20260925000200_catalogo_ordem_categorias.sql`, aplicada); RPC
  `catalogo_categorias_reordenar(p_empresa_id, p_categorias text[])` (mesma checagem de equipe) regrava a lista inteira;
  `catalogo_acervo()` faz `left join` nela, devolve `categoria_ordem` e ordena por ela primeiro. `getCategories()` ordena por
  `item.catOrdem` (sem ordem no fim, na ordem de sempre). **Pegadinha**: a Home centraliza a última linha com
  `grid-column-start` inline — limpar isso já no `dragstart` move o card e o Chromium CANCELA o arrasto na hora; por isso a
  limpeza acontece no 1º `dragover` e `centerLastHomeGridRow()` roda de novo no `dragend`.
- Não feito (não pedido): reordenar pelo teclado.

Teste: `tests/catalogo-ordem-arrastar-browser.cjs` (equipe: cards arrastáveis + alça, arrastar muda a tela e chama
`catalogo_reordenar` com todas as posições, ordem mantida ao voltar, clique ainda abre o item; decorador: ordem do banco
com os sem ordem no fim, sem alça, arrastar não grava nada, imersiva na mesma ordem). Cache-busting
`catalogo.css?v=20260925-ordem-arrastar`, `catalogo.mjs?v=20260925-ordem-categorias`. O teste também cobre as categorias
(equipe arrasta e grava pelo nome; decorador vê na ordem do banco, sem arrastar).

## Projeto aberto: noivos na linha do Voltar, abre na aba Geral, 3D antes dos móveis

Pedidos do usuário, com print do projeto "Ana e Bruno":
- *"a logo dos noivos, o nome deles, precisam ficar na mesma linha do botão voltar"*: só CSS
  (`catalogo-projetos.css`, fim do arquivo, ≥768px e só com `body.catalog-tem-voltar`): `.cpj-wrap.cpj-work` sobe pro topo
  (`padding-top:14px`, substitui os 62px de respiro da lista), `.cpj-work-head` abre 116px à esquerda pro botão, e o
  `#catalogGlobalBack` desce (`margin-top:31px`, via `body:has(#catalogProjetos:not(.hidden) .cpj-work-head)`) pra ficar
  centrado com a foto de 72px.
- *"sempre que entrarmos no projeto a aba principal que já deve vir aberta é a aba Geral"*: `definirAtual()` agora põe
  `S.workTab = "geral"` (antes "ambiente"). O ambiente ativo (`S.activeAmb`) continua lembrado pro "＋" e pro dock. Voltar
  (`backCatalogProjetos`) de qualquer outra aba cai em Geral, e de Geral sai pra lista.
- *"dentro de cada ambiente... primeiro aparece o 3D, e depois aparece os itens embaixo"*: em `pintarPainel()` o bloco
  "Renderizações" veio pra antes de "Móveis".

Teste: `tests/catalogo-projeto-abertura-browser.cjs` (1100/1440/1900px: Voltar centrado com a foto e o nome, foto à direita
do botão; abre em Geral; no ambiente, Renderizações antes de Móveis; Voltar ambiente→Geral→lista; reabrir volta pra Geral).
Cache-busting `catalogo-projetos.{css,mjs}?v=20260925-projeto-geral`, `catalogo.mjs?v=20260925-projeto-geral`.

**Ajuste seguinte** (*"pode remover isso que está por cima de renderizações, porque o nome da tela já está identificado na
coluna de ambientes... renderizações e móveis eu quero que fique centralizado igual fica dentro do módulo Geral"*): o
`.cpj-amb-head` com o nome do ambiente saiu do painel do ambiente (continua na tela de Plantas). Os títulos "Renderizações" e
"Móveis" ganharam `.cpj-block-head-center`: centralizados, mesmo tamanho/peso do título de ambiente da aba Geral
(`.pa-geral .pa-grupo h3`), com a linha fina embaixo; o botão "3D Livre" fica absoluto à direita pra não tirar o título do
centro. "Observações do ambiente" continua como antes. Coberto em `tests/catalogo-projeto-abertura-browser.cjs`.
Cache-busting `?v=20260925-ambiente-centro`.

## Cabeçalho do pedido/PDF: faixa escura na cor do menu do catálogo

Pedido do usuário (redesenho do topo da 1ª página do pedido, "mais sofisticado, premium", *"a cor do cabeçalho deve ser a
mesma do menu do catálogo"*). `cabecalhoPedidoHtml(empresa, decorador)` em `projeto-apresentacao.mjs`, usado por
`pedidoPreviewHtml()` (prévia de "Enviar pedido"/"Ver pedido") e, por tabela, `imprimirPedido()` (PDF):
- Faixa `#5a5a55` (a mesma de `.catalog-header`) de ponta a ponta do papel, filete `#c9ad84` de 2px embaixo, `print-color-
  adjust:exact`. Logo da empresa à esquerda, sempre branca via `filter:brightness(0) invert(1)` (serve qualquer arquivo). A
  logo da Chiavari é um PNG quadrado com a arte em ~26% da altura: um `onload` inline marca `.is-quadrada` quando a proporção
  é < 1,6 e o CSS recorta a faixa do meio (`object-fit:cover; object-position:center 49%`, 206×58px). Sem logo: nome da
  empresa em serifa branca.
- À direita: foto circular da decoradora, "DECORADOR SOLICITANTE" (caixa alta pequena, bege), nome em branco, divisória
  vertical fina e "PRÉVIA DO PEDIDO".
- Conteúdo abaixo não mudou (só o respiro de cima do bloco do evento subiu pra 34px).
- `pedidoPreviewHtml`/`imprimirPedido` ganharam a opção `empresa` (os 4 pontos de `catalogo-projetos.mjs` passam
  `ctx.getCompany?.()`).
- **PDF**: `@page{margin:14mm 0}` + `@page:first{margin-top:0}` e o papel com `padding:0 14mm` — assim a faixa encosta no topo
  e nas laterais da 1ª página e as páginas seguintes continuam com margem em cima/embaixo.

Teste: `tests/catalogo-pedido-cabecalho-browser.cjs` (cor igual à do menu, ponta a ponta do papel, logo branca e recortada,
ordem logo → decoradora → divisória → PRÉVIA DO PEDIDO, conteúdo mantido; no documento de impressão a faixa encosta no topo
e nas laterais e o fundo sai na impressão). `tests/mock-projetos.cjs` ganhou `opts.empresaLogo`. Cache-busting
`projeto-apresentacao.mjs?v=20260925-cabecalho-pedido`, `catalogo-projetos.{css,mjs}?v=20260925-cabecalho-pedido`.

**Ajuste seguinte, logo abaixo da faixa** (*"coloque Clientes e o nome Ana e Bruno, embaixo data do evento, e embaixo local do
evento. Ao lado... um aviso em um card amarelo bem bonito... que esse arquivo é uma prévia do pedido, que o pedido oficial
nossa equipe comercial enviará com todas as disponibilidades e serviços adicionais"*): o rótulo "RELAÇÃO DE MOBILIÁRIO" virou
"CLIENTES" (em cima do nome grande), e "Data do evento" / "Local do evento" ficam empilhados embaixo
(`.cpj-order-event-info`, uma `<dl>`). À direita, `.cpj-order-notice` (`role="note"`): card amarelo suave (`#fbf4de`, borda
`#ead9a8`, filete dourado `#c9a24f` à esquerda, ícone "i"), título "Esta é uma prévia do pedido" e o texto da equipe
comercial; `print-color-adjust:exact` pra sair no PDF. No celular (≤600px) o card desce pra baixo das informações. Coberto
em `tests/catalogo-pedido-cabecalho-browser.cjs`. Cache-busting `?v=20260925-pedido-clientes`.

**"Qtd." e "Item" logo acima da 1ª linha** (pedido: *"precisam ficar logo acima da primeira linha da tabela, ou seja, abaixo de
Lounge, bem em cima do nome do item e da qtd"*): o `<thead>` da tabela do pedido virou só pra leitor de tela (`.pa-sr`), as
larguras das colunas passaram pro `<colgroup>` (`.cpj-order-col-qty/-photo`), e cada ambiente ganhou uma linha
`.cpj-order-colhead` ("Qtd. · · Item", `aria-hidden`) logo depois do nome dele, alinhada com a quantidade e o nome dos itens.
Vale pra todos os ambientes do pedido, na tela e no PDF. Coberto em `tests/catalogo-pedido-cabecalho-browser.cjs`.
Cache-busting `?v=20260925-pedido-colunas`.

## Valores no catálogo — setembro/2026
A grade e o detalhe mostram o valor de locação com tipografia discreta em dourado. Referência escolhida explicitamente pelo usuário: **TABELA 2026 Padrão**. `catalogo_acervo` consulta `itens_precos` nessa tabela da mesma empresa; não usa o preço legado nem ativa a tabela em outros módulos. Sem preço = "Sob consulta"; zero explícito é preservado. A troca de variante atualiza o preço na grade e no detalhe. Migração: `20260925000400_catalogo_valores.sql` (aplicada no banco vinculado). Teste: `tests/catalogo-valores-browser.cjs` (interno/externo, variantes, nulo, zero e mobile).

### Correção da referência de preços
O usuário esclareceu com print que deseja **TABELA 2026**, não "TABELA 2026 Padrão". A migração `20260925000500_tabela_2026_referencia.sql` ativa a TABELA 2026 da empresa e sincroniza os 1.157 preços com `itens.valor_locacao`, usando os triggers existentes para futuras edições. O catálogo também consulta a TABELA 2026. As tabelas históricas são preservadas; itens sem preço nessa tabela não recebem valores inventados. A indicação anterior de usar "2026 Padrão" foi substituída por esse pedido explícito.

## Escolha de projeto ao clicar em Catálogo
Pedido final do usuário: a seleção aparece **somente ao clicar no bloco Catálogo da Home**, nunca automaticamente depois do login. `activateGatewayTile` chama `escolherProjetoNaEntrada` apenas para decoradores; a equipe segue direto. Lista editorial em tela cheia com foto, nomes dos noivos, data/local, sem cards; permite voltar à Home, tentar novamente em caso de erro e criar projeto quando não há nenhum. Selecionar carrega o projeto autorizado pela RPC existente, define o projeto/ambiente ativo e abre as categorias. Alterações pendentes são salvas antes de trocar. Não restaura automaticamente um projeto antigo para o decorador. Teste: `tests/catalogo-entrada-projetos-browser.cjs`; screenshots em `outputs/catalogo-entrada-projetos-desktop.png` e `outputs/catalogo-entrada-projetos-mobile.png`.

### Seleção integrada ao menu
A seleção de projeto deixou de ser modal: é uma seção integrada (`project-entry`) com o menu e o botão Voltar padrão visíveis, inclusive no celular. Conteúdo reduzido a "Qual história vamos criar hoje?", foto, local e data; nomes ficam apenas no rótulo acessível do botão. Removidos textos de apoio, numeração, Continuar e Novo projeto. O histórico e a navegação do menu abrem/fecham essa seção normalmente.

### Opções na escolha de projeto
A pedido do usuário, a seleção voltou a incluir **Novo projeto** e ganhou **Entrar sem projeto** abaixo do título. Novo projeto usa o formulário existente e entra no catálogo com o novo projeto ativo. Entrar sem projeto salva eventuais alterações pendentes e limpa o projeto/ambiente ativo e a lembrança local, sem apagar projetos. Teste de entrada cobre criação, cancelamento e navegação sem vínculo após selecionar um projeto anterior.

## Projeto: valores em colunas (Reposição / Valor un. / Total) na linha do item

Pedido do usuário, depois de um erro `precosHtml is not defined` que impedia abrir qualquer projeto (o Codex tinha colocado a
chamada `precosHtml(item)` nas linhas e ficou sem créditos antes de criar a função): *"o valor de reposição deve ser uma coluna
separada, o valor da unidade também e o valor total também, tudo deve ficar na mesma linha do nome do item"*.
- `projeto-apresentacao.mjs`: `dadosApresentacao()` leva `medidas` (`item.dims`), `preco` (`item.rentalPrice`, TABELA 2026) e
  `reposicao` (`item.replacementPrice`). `valoresTd()`/`valoresTh()` desenham 3 colunas (Reposição = valor da unidade, Valor un.,
  Total = quantidade × unidade; sem preço = "—" / "Sob consulta") em TODAS as tabelas: aba Geral, apresentação por ambiente e
  prévia/PDF do pedido (`VALOR_COLS` soma nos `colspan`). `precosHtml` não existe mais.
- `catalogo.mjs` `mapRow()` ganhou `replacementPrice` (`row.valor_reposicao`). A RPC só devolve esse campo depois da migration
  `20260925000600_catalogo_valor_reposicao.sql`, aplicada com `npx supabase db query --linked -f` (o Codex tinha criado e não
  aplicado). **Atenção**: 20260925000300–600 foram aplicadas por `db query`, não por `db push`, então `migration list` mostra
  as quatro como pendentes; um `db push` futuro vai tentar reaplicá-las (400–600 são `create or replace`, e a 300 faz
  `create table`/`create function` sem `if not exists`, então falha). Resolver com `npx supabase migration repair --status applied <versão>`
  antes do próximo push.
- Celular (≤700px): a tabela rola de lado dentro do próprio bloco (`min-width`), senão o nome ficava espremido letra por letra.
- Teste: `tests/catalogo-pedido-cabecalho-browser.cjs` confere as 3 colunas, os valores e que ficam na mesma linha, à direita do
  nome (o mock `tests/mock-projetos.cjs` ganhou `valor_locacao`/`valor_reposicao` nos itens 1 e 3).
- **Testes já quebrados, sem relação com esta mudança**: `catalogo-projetos-quantidade-browser.cjs` e `catalogo-valores-browser.cjs`
  clicam em "Catálogo" como decorador e esperam as categorias, mas agora aparece antes a escolha de projeto.
- **Medidas fora do nome, logo abaixo dele** (pedidos seguintes): no projeto/pedido, o nome (`nomeCompleto`) passa por
  `semMedidas()`, que tira "(L) 2.40 m (A) 0.75 m (P) 1.10 m" do `descricao_total`. A linha de baixo (`.pa-medidas`) mostra
  esse MESMO trecho, no formato do cadastro (`medidasComSiglas()`; sem o trecho no nome, monta "(L) x.xx m..." a partir de
  `item.dims`), com a mesma fonte, tamanho, peso e cor do nome (`font:inherit` + as mesmas regras do `strong` em cada
  tabela; o teste compara o `getComputedStyle` dos dois). Só vale nas telas de projeto/pedido.
- **Títulos das colunas da aba Geral abaixo do nome de cada ambiente** (pedido seguinte): o `<thead>` continua na tabela só
  para dar a largura das colunas (tabela `table-layout:fixed`) e para leitor de tela, mas fica zerado no CSS
  (`.pa-geral .pa-itens thead th{height:0;font-size:0;...}`). Os títulos visíveis são uma linha `.pa-colhead` (`COLHEAD_GERAL`,
  `aria-hidden`) logo depois do título de cada ambiente, igual à `.cpj-order-colhead` do pedido. Essa linha não tem
  `data-pa-item`, então o arrastar/ordenar ignora ela.

## Projeto: trocar móveis no 3D a partir da imagem do ambiente (editor de cena)

Pedido de uma cliente: clicar no print 3D salvo num ambiente do projeto e abrir, **na mesma tela, um modal com o 3D daquela
composição**, onde dá pra trocar um móvel por outro. O móvel que sai do 3D sai do pedido, e o que entra, entra. Decisões
confirmadas com o usuário: (1) imagens salvas antes disto (sem cena) só mostram um aviso ("gere a imagem de novo no 3D Livre");
(2) cada troca tira **1 unidade** do que saiu e põe 1 do que entrou (se chegar a 0, sai da lista); (3) qualquer item do
catálogo com modelo 3D (a mesma lista da biblioteca do 3D Livre, com busca); (4) a imagem é substituída sozinha ao concluir;
(5) vale também para imagens de IA; (6) no modal **só trocar**: nada de mover, girar, adicionar ou apagar; (7) decorador e
equipe; com pedido já enviado aparece o aviso de sempre ("alterado depois do envio" no "Ver pedido").

- **A cena passa a ser guardada com cada imagem salva no projeto.** `tirarPrintComposicao()` e `renderWithAI()`
  (`catalogo-studio3d.mjs`) chamam `window.catalogRegisterRenderItems(src, objetos, { tipo:"print"|"ia", snapshot })`. A IA
  guarda a cena do INÍCIO da renderização. `snapshotCena()` é o mesmo formato de `snapshotProject()`, sem id/nome, com as fotos
  de parede em JPEG até 1600px. No projeto, `uploadRenderPara()` sobe a cena como `.json` em
  `<empresa>/<projeto>/cenas/<uuid>.json` (bucket `projetos`) e grava `render.cena = { url, path, tipo }`. O arquivo fica fora de
  `projetos.dados` de propósito: pode ter vários MB, e o salvamento automático manda `dados` inteiro a cada edição. Migration
  `20260926000100_projetos_bucket_cena_json.sql` (aplicada e registrada com `migration repair`) liberou `application/json` no
  bucket. As políticas por pasta já cobriam o resto. Testado no Storage real com a chave anônima: upload, leitura e remoção
  deram 200. Excluir a imagem ou o projeto apaga também a cena (pasta `cenas` no `excluirProjeto`).
- **Motor**: `cenaEditor` (exportado por `catalogo-studio3d.mjs`, passado ao projeto como `ctx.cenaEditor` por
  `catalogo.mjs`) usa a MESMA cena/renderer do 3D Livre, para escala, luz e modelos iguais aos do print. `abrir(host, cena)`
  guarda um backup da cena do 3D Livre (`snapshotCena(false)`, fotos em PNG, sem perda), move o `<canvas>` para o modal
  (`studio.cenaModal.host`; `resize()` e o loop de render passam a olhar o modal), carrega a cena com `carregarCena()` e esconde
  grade e borda. A seleção é por clique sem arrasto (`cenaModalPointerDown/Up`, raio de 6px), destacada com um `BoxHelper` que
  fica fora dos prints. `selectFromPointer` não age com o modal aberto, então não há arrastar. `trocar(id)` usa
  `trocarItemSelecionado()` (mantém posição e giro). `capturar()` usa o mesmo `capturarPrintLimpo()` do "Tirar print".
  `corpoIA()`/`executarIA()` são o `renderWithAI()` separado em "montar o pedido" (síncrono, com a cena atual) e "chamar a IA".
  `fechar()` devolve o canvas e recarrega o backup. `carregarCena()` saiu de dentro de `openProject()` (que agora só valida e
  chama). `itemPorId()` também acha variantes de cor.
- **Modal** (`abrirEditorCena()` em `catalogo-projetos.mjs`, CSS `.cpj-cena-*`): o 3D à esquerda, e à direita o selecionado,
  a busca e a lista do catálogo, mais "Alterações no pedido" (− 1 X / + 1 Y). Cada troca chama `mudarQuantidade()` na hora.
  "Concluir" ou Esc fecham: sem troca, nada é enviado; com troca, `substituirImagemDaCena()` sobe o print novo e a cena nova
  no lugar dos antigos (mesmo `render.id`, mesma posição na lista, arquivos antigos removidos). Se a imagem era de IA, o print
  entra na hora e a IA roda em segundo plano (notificação "em andamento"); quando termina, a imagem de IA nova substitui o print
  provisório. Se a IA falhar, fica o print e aparece um aviso. As opções de atmosfera da IA não são guardadas, então a
  renderização refeita usa o padrão (dia, luz suave, sem convidados). Imagem com cena ganha o selo "Trocar móveis no 3D".
- Teste: `tests/catalogo-editor-cena-browser.cjs` (6 cenários, 3D de verdade com GLB triangular e clique real no canvas):
  imagem antiga só com aviso; troca −1/+1 com remoção do item zerado; imagem e cena substituídas e antigas removidas; aviso
  "alterado depois do envio"; IA refeita com a cena editada; celular; 3D Livre volta com os móveis, posição e giro de antes;
  "Tirar print" e "Renderizar com IA" reais guardam a cena ao salvar no projeto. `tests/mock-projetos.cjs` ganhou
  `opts.modelos` (itens com modelo 3D).
- **"Alterações no pedido" em destaque** (pedido seguinte: "talvez a informação mais importante do modal"): a coluna da
  direita passou de 340px para 420px (o 3D fica um pouco menor) e o card `.cpj-cena-trocas` fica no TOPO dela, sempre
  visível (vazio: "Nenhuma alteração ainda..."), com fundo amarelo suave, contador "N trocas" e, em cada troca, uma linha
  vermelha "− 1 / SAI DO PEDIDO" e uma verde "+ 1 / ENTRA NO PEDIDO", com foto e nome.
- **Legenda da planta acompanha a troca** (pedido seguinte: "quando eu alterar no 3D eu altero o pedido e a legenda
  automaticamente"): a legenda e o cartão do ambiente na planta mostram a imagem de `renderAtualDoAmbiente(amb)`, a com
  `atualizado_em`/`criado_em` mais recente (empate ou sem data: a última da lista, como antes). O editor de cena grava
  `atualizado_em` na imagem editada, então ela vira a foto da legenda mesmo que não seja a última do ambiente. Os nomes
  dos móveis na legenda já eram lidos do pedido na hora de desenhar, então também mudam.
- **Bug corrigido de passagem**: com uma planta aberta (`.cpj-planta-editor`, que cobre a tela inteira), o botão "Voltar"
  global ficava por cima do "← Plantas" da barra da planta, e o clique caía nele. Agora o "Voltar" global some com a planta
  aberta (`body:has(.cpj-planta-editor) .catalog-global-back{display:none}`). Isso fazia
  `tests/catalogo-planta-enquadramento-browser.cjs` falhar, e agora ele passa.

## Login do catálogo: faixa com a logo, frase, cartão e vitrine viva do acervo

Pedido do usuário, com uma imagem de referência e um texto detalhado (a versão atual segue os dois). Antes houve 3
tentativas recusadas: (1) metade foto de ambiente, "não quero foto"; (2) branco centralizado e pequeno, "falta conceito, cor
e movimento"; (3) a frase grande à esquerda com nomes de estilo passando e manchas de cor, interrompida pela referência. O
que vale agora:

- **Estrutura** (`#catalogLogin` em `catalogo.html`, CSS no bloco "Login do catálogo" de `catalogo.css`): faixa escura no
  topo (`#5a5a55`, a cor do cabeçalho do catálogo) com a logo da empresa em branco (`filter:brightness(0) invert(1)`; logo
  quadrada recortada na faixa do meio, `.is-quadrada`, mesma técnica do cabeçalho do pedido). No centro, a frase
  "Transite por vários estilos e encontre *o seu*" (Cormorant, "o seu" em itálico terroso), um filete e um cartão discreto
  (bordas arredondadas, translúcido, sombra suave) com **só** e-mail, senha e "Entrar →". Pedido explícito: nada de login com
  Google/Apple/Microsoft, nada de "Mobiliário e decoração para todos os seus projetos", nada de "esqueceu a senha", nada de
  cenário decorado. Os IDs que o JS usa não mudaram.
- **Vitrine viva**: ao redor, 12 peças do PRÓPRIO acervo (4 no celular, bem apagadas). Metade nítidas e metade desfocadas e
  apagadas ao fundo, sempre fora da coluna central. A cada 3,6s uma peça some devagar e volta como outra do acervo que não
  está na tela (nunca repete). Com movimento reduzido fica tudo parado.
  `catalogo-login-vitrine.mjs` (`iniciarVitrineLogin()`, self-contido) monta isso; `requireCatalogLogin()` inicia a vitrine
  quando o login aparece e para quando o login termina. As fotos de estúdio não são branco puro: `brightness` +
  `mix-blend-mode:multiply` sobre o fundo branco + uma máscara radial fazem só o móvel aparecer, "recortado". **Sem
  `drop-shadow`**: numa foto opaca ele desenha a sombra do RETÂNGULO (foi o que deixou as peças com um quadro cinza na 1ª
  versão; mesma lição da foto principal do item).
- **Dados**: RPC pública nova `catalogo_vitrine_login(p_empresa_id default null)` (migration
  `20260926000200_catalogo_vitrine_login.sql`, aplicada e registrada), `security definer`, liberada pra `anon`: roda antes do
  login e devolve só logo e nome da empresa e as fotos de até 24 itens do catálogo (até 3 por categoria, em ordem aleatória). Nada
  de preço, medida ou código; as fotos já são URLs públicas do bucket "itens". Qual empresa: o link do catálogo não diz, e sem
  parâmetro vale a ÚNICA empresa com acesso de decorador ativo (hoje só a Chiavari). Se houver mais de uma, não devolve nada (a
  tela funciona sem vitrine e sem logo) e o link precisa de `?empresa=<id>`, que o front repassa. Testada com a chave anônima de
  verdade: 22 fotos de 10 categorias.
- Teste: `tests/catalogo-login-vitrine-browser.cjs` (faixa e logo branca, frase, cartão centralizado só com os 2 campos e o
  botão, nada do que foi proibido, 12 peças com 6 desfocadas e nenhuma sobre o cartão, troca sem repetir, celular sem rolagem
  lateral, movimento reduzido parado, `?empresa=` repassado, tela sem vitrine).
  `tests/catalogo-login-equipe-browser.cjs` continua fazendo login nos 4 cenários (o 4º só para na escolha de projeto,
  problema antigo).
- **Ajustes seguintes na mesma tela** (3 pedidos em sequência):
  1. *"parece que são duas colunas de foto de cada lado, queria mais embaralhado"*: 15 posições irregulares (alturas,
     tamanhos e distâncias do centro diferentes, mais duas peças pequenas acima da frase e abaixo do formulário, com altura
     limitada por `--mh`), um sorteio de ±1,6% na posição a cada visita (`JITTER`) e uma flutuação bem lenta por peça, cada uma
     no seu ritmo (`translate` na imagem, que não briga com o fade do bloco). Em tela baixa ou estreita nem todas cabem:
     `evitarCentro()` mede cada peça e esconde (`.is-fora`, fora da troca) a que encostaria na frase ou no formulário,
     recalculando a cada imagem carregada e ao redimensionar. Medido em 1024×768, 1280×720, 1366×768, 1440×900, 1536×864 e
     1920×1080, 5 sorteios cada: nenhuma peça visível encosta no centro. No celular sobram 1 ou 2 peças apagadas.
  2. *"quando passar o mouse num item que não estiver esmaecido, quero ver o nome dele bem bonito com uma setinha
     desconstruída, só o nome"*: a RPC passou a devolver `nome` (produto_base + produto, o mesmo nome do catálogo; migration
     `20260926000300_catalogo_vitrine_login_nome.sql`, aplicada). Nas peças nítidas, no hover, aparece só o nome (Cormorant
     itálico) com uma seta de traço curvo que se desenha e a ponta solta aparecendo logo depois. A seta aponta pro lado do
     centro (`.is-direita` espelha) e fica abaixo da peça nas que estão coladas na faixa de cima (`.is-abaixo`). A peça sobe um
     pouco e passa pra frente (z-index 3). A peça com o nome aberto não é trocada. Não acontece em tela de toque nem nas peças
     desfocadas.
  3. *"retire esse card, deixe mais bonito escrito e-mail, senha, uma mensagem em cima: acesse seu catálogo exclusivo"*: o
     formulário ficou solto, sem cartão. Em cima, "Acesse seu catálogo exclusivo" (Manrope, caixa alta espaçada, terroso),
     depois "E-MAIL" e "SENHA" escritos acima de cada campo e só uma linha embaixo (os ícones e placeholders saíram). O
     autopreenchimento do navegador pintava o campo de azul claro (visto no print do usuário) e foi neutralizado com
     `-webkit-autofill` + `box-shadow` branco inset.
  Teste `tests/catalogo-login-vitrine-browser.cjs` atualizado: 15 peças (9 desfocadas), nenhuma peça visível sobre a frase ou
  o formulário, posições variadas, sem cartão, convite e rótulos, e o nome certo com a seta no hover (e nenhum nas desfocadas).
  Passa em execuções repetidas, cada uma com um sorteio diferente.

## Catálogo: entrar como visitante (sem acesso exclusivo)

Pedido do usuário: *"existe duas formas de alguém entrar no catálogo: cliente exclusivo, por e-mail e senha, ou um cliente
qualquer que vai acessar o catálogo que a gente criar, esse será o padrão... como se fosse um convidado"*. O visitante vê o
MESMO catálogo padrão que a equipe (Home, categorias, itens, filtros) e a Biblioteca, sem edição, com **"Sob consulta" no
lugar do preço**, e com **Módulo 3D e Projetos visíveis, mas com cadeado** (pedido seguinte: "que ele veja os módulos
exclusivos, só que com um cadeado").

- **Entrada** (`#catalogLogin`): por padrão só aparece "Explorar o catálogo" (`[data-login-visitante]`) e o link "Tenho
  acesso exclusivo" (`[data-login-exclusivo]`), que troca a escolha pelo formulário de e-mail e senha
  (`#catalogLogin.is-exclusivo`). "← Entrar sem acesso exclusivo" (`[data-login-voltar]`) volta. A escolha de visitante fica
  na aba (`sessionStorage.catalogo_visitante`), então recarregar não passa pela entrada de novo (o script anti-flash também
  conhece esse sinal e adiciona `body.catalog-visitante`). O "Sair" do cabeçalho (o visitante ganha só o botão, como a
  equipe no acesso direto) limpa o sinal e volta pra entrada.
- **Dados**: sem login não há token nem `auth.uid()`, então há 3 leituras públicas (`anon`), cada uma reaproveitando a função
  que a equipe já usa (migration `20260926000400_catalogo_visitante.sql`, aplicada e registrada):
  `catalogo_publico_carregar` (= `catalogo_acervo()` **sem `valor_locacao`/`valor_reposicao`, cortados no banco**, então o
  preço nunca chega ao navegador do visitante), `catalogo_capas_publico` (só a capa padrão da equipe) e
  `biblioteca_publico_carregar` (só fotos da empresa, `cliente_id is null`, sem `path`). A empresa sai de
  `catalogo_empresa_publica()`, que não é exposta ao anon: é a única com acesso de decorador ativo, ou `?empresa=<id>` no link
  (mesma regra da vitrine do login). Testado com a chave anônima: 589 itens e nenhum campo de preço.
- **Frontend** (`catalogo.mjs`): `ehVisitante()` (`state.catalogSession.visitante`) decide tudo:
  - carrega pelas leituras públicas;
  - não inicia Projetos nem o 3D Livre (então não aparece "＋ adicionar ao projeto", dock nem escolha de projeto);
  - "Experimente outro tecido" (créditos de IA) não aparece;
  - "Catálogo" no Portal vai direto pras categorias;
  - nada de edição (`state.acessoInterno` é falso).

  O preço mostra "Sob consulta" porque `rentalPrice` vem nulo. No Portal, `blocoBloqueado()` marca Módulo 3D e Projetos com
  `.is-bloqueado` (cadeado acima do título, selo "Acesso exclusivo" abaixo, foto levemente escurecida). Clicar mostra um aviso
  com "Entrar com acesso exclusivo", e `irParaAcessoExclusivo()` recarrega já no formulário
  (`sessionStorage.catalogo_abrir_exclusivo`). Na Biblioteca (`catalogo-biblioteca.mjs`, `ctx.visitante`) só dá pra ver:
  sem mover nem remover foto.
- **Biblioteca do visitante hoje está vazia, e isso é dado, não bug**: as 73 fotos da Biblioteca foram enviadas para
  decoradoras específicas (Kelly Khawam 44, Fabiane Gabrich 29), ou seja, são exclusivas delas. O visitante vê o mesmo que a
  equipe vê sem nenhum decorador selecionado (as fotos da empresa), e essas aparecem assim que a equipe subir fotos sem
  escolher decorador.
- Testes: `tests/catalogo-visitante-browser.cjs` (entrada, cadeados e aviso, "Entrar com acesso exclusivo" abrindo no
  formulário, "Sob consulta" sem "R$", item sem tecido/edição/projeto, Biblioteca só de leitura, só leituras públicas chamadas,
  recarregar mantém, sair volta). `catalogo-login-vitrine-browser.cjs`, `catalogo-login-equipe-browser.cjs` e
  `catalogo-browser.cjs` passaram a clicar em "Tenho acesso exclusivo" antes de preencher o e-mail.
  `tests/catalogo-biblioteca-browser.cjs` falha em "Enter numa foto focada abre ESSA foto" **também sem estas mudanças**
  (confirmado desfazendo as edições da Biblioteca e rodando de novo): problema antigo, não investigado.

## Deploy (GitHub Pages e Vercel): duas pegadinhas

- **GitHub Pages não atualiza só com o push.** O site sai do workflow `.github/workflows/deploy-pages.yml`, que em teoria roda
  a cada push em `main`, mas na prática nenhum push dispara (todas as execuções do histórico foram manuais). Depois do push,
  rodar `gh workflow run deploy-pages.yml --ref main` e conferir com `gh run watch`. Confirmar no ar buscando um texto novo em
  `https://operacionalchiavari-stack.github.io/easyloc/...`.
- **O Vercel (`vercel deploy --prod`) sobe a PASTA LOCAL, não o git**: arquivo não versionado também vai, se não estiver no
  `.vercelignore`. Aconteceu em 26/09: `outputs/` (com `backup-valores-antes-tabela-2026.json`, preços, e
  `projeto-apresentacao-dados.json`) ficou público em `easyloc-zeta.vercel.app` por cerca de 3 minutos, até `outputs` entrar
  no `.vercelignore` e um novo deploy tirar do ar. As URLs próprias de cada deploy (`easyloc-<hash>-jonatan-falcks-projects...`)
  exigem login no Vercel (302 pro SSO), então não ficaram públicas. Antes de publicar, conferir `git status` por arquivos
  soltos e, depois, testar com `curl` que nada de `outputs/`, `.env` ou `CLAUDE.md` responde 200.
