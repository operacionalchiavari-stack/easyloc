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

**2 achados reais testando, os dois corrigidos no PRÓPRIO teste, não no
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

Teste de regressão (`tests/catalogo-modulo3d-menu-browser.cjs`): Estúdio
e Realidade aumentada carregam livremente (mesmo item, por fallback),
Lounge fica retido no portão; confirma que logo ao entrar os 3 cards
ficam escondidos (opacity 0) com o percentual em 0%, mesmo que o modelo
mais rápido já tenha terminado por baixo; confirma o degrau intermediário
(67%, 2 dos 3 prontos) ainda com os cards escondidos, SÓ ENTÃO libera o
portão; confirma que só depois dos 3 resolverem o percentual chega em
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
