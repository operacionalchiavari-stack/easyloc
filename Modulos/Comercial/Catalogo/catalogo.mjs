import { getEmpresaAtualId } from "../../Estoque/CadastroItens/itens.api.mjs";
import { initCatalogStudio3D } from "./catalogo-studio3d.mjs?v=20260920-moveis";
import { initCatalogBiblioteca, openCatalogBiblioteca } from "./catalogo-biblioteca.mjs?v=20260919-zoom-galeria";
import { initCatalogLounge, openCatalogLounge, teardownCatalogLounge } from "./catalogo-lounge.mjs?v=20260921-texturas-piso";
import { initCatalogProjetos, openCatalogProjetos, closeCatalogProjetos, setProjetoDockVisible, projetoAddMarkup, atualizarBotoes as atualizarBotoesProjeto } from "./catalogo-projetos.mjs?v=20260921-mais-opcoes";

const supabase = window.supabaseClient;
const FOTO_PLACEHOLDER = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNDAgMjQwIj48cmVjdCB3aWR0aD0iMjQwIiBoZWlnaHQ9IjI0MCIgZmlsbD0iI2YxZjJmNCIvPjxnIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2M3Y2JkMSIgc3Ryb2tlLXdpZHRoPSI2IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxyZWN0IHg9IjYwIiB5PSI2OCIgd2lkdGg9IjEyMCIgaGVpZ2h0PSI5MCIgcng9IjgiLz48Y2lyY2xlIGN4PSI5MCIgY3k9Ijk2IiByPSIxMCIvPjxwYXRoIGQ9Ik02MCAxNDMgTDEwMCAxMTMgTDEzMCAxMzggTDE1NSAxMTYgTDE4MCAxNDMiLz48L2c+PHRleHQgeD0iMTIwIiB5PSIxODIiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgSGVsdmV0aWNhLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE2IiBmaWxsPSIjOWFhMGE4Ij5TZW0gZm90bzwvdGV4dD48L3N2Zz4=";
// Home do catálogo (pedido explícito do usuário): substitui a antiga tela
// de Destaques e o menu de categorias no cabeçalho — vira o menu do
// catálogo, mostrando um card por categoria (ver renderHome()).
const HOME_VIEW = "__home__";
// Itens que passam pelos filtros da tela "Categorias", na visualização imersiva (ver applyView/renderCurrentView).
const FILTER_VIEW = "__filtro__";
// Portal de entrada (pedido explícito do usuário): 3 destinos — Catálogo,
// Biblioteca, Módulo 3D — primeira tela tanto da equipe quanto do
// decorador (ver renderGateway()). É o valor inicial de activeView, "na
// frente" até da Home de categorias.
const GATEWAY_VIEW = "__gateway__";
// Chave única da foto de fundo do Portal em `catalogo_capas` (ver
// migration 20260918000100). Antes eram 3 fotos, uma por bloco — pedido
// explícito do usuário depois de ver o Portal de verdade: "ao invés de
// ser 3 fotos quero que seja uma foto só... a foto será da tela toda, o
// funcionamento dos módulos continuam normal" — os 3 destinos continuam
// existindo e navegando exatamente igual (GATEWAY_TILES/
// activateGatewayTile, inalterados), só a APRESENTAÇÃO virou uma foto
// só cobrindo a tela inteira, com os 3 nomes sobrepostos como zonas de
// clique, em vez de 3 fotos lado a lado com fotos/bordas próprias.
const GATEWAY_PHOTO_KEY = "portal";
const GATEWAY_TILES = [
  { key: "catalogo", label: "Catálogo" },
  { key: "biblioteca", label: "Biblioteca" },
  { key: "modulo3d", label: "Módulo 3D" },
  // 4º destino (pedido explícito do usuário: montar um projeto por evento, dividido em ambientes, direto do catálogo)
  // — ver catalogo-projetos.mjs.
  { key: "projetos", label: "Projetos" },
];
// Mini-menu do Módulo 3D (pedido explícito do usuário: "quando a pessoa
// clicar em módulo 3D... quero que apareça como se fosse outro mini menu,
// dentro do módulo 3D nós teremos 3 funcionalidades diferentes... no topo
// centralizado e grande apareça um móvel em 3d e embaixo deixe 3 campos
// clicáveis"). Bloco do Portal "Módulo 3D" deixou de abrir o estúdio
// direto (ver activateGatewayTile) e passou a abrir este mini-menu — o
// estúdio de sempre virou o 1º dos 3 cards (confirmado com o usuário).
const MODULO3D_MENU_VIEW = "__modulo3d__";
// Redesenho premium (pedido explícito do usuário, spec detalhada): os 2
// recursos ainda não construídos deixaram de levar a uma tela "Em breve"
// genérica ao clicar — agora são cards INERTES (sem elemento clicável,
// `aria-disabled`, "sem comportamento de clique"), cada um com nome e
// descrição próprios em vez do texto genérico "Em breve" como título.
// MODULO3D_CARDS é a fonte única dos 3 cards — `available:false` decide
// tanto o visual (card apagado, badge "EM BREVE") quanto o roteamento em
// activateModulo3dCard() (nunca navega).
// "planejador-eventos" virou "Módulo Lounge" (pedido explícito do
// usuário: "vira o card 'Planejador de eventos'") — tela dedicada e mais
// simples que o Estúdio de Ambientes, pra montar composições de lounge
// (sofá + poltronas), ver catalogo-lounge.mjs.
//
// RENOMEADOS (pedido explícito do usuário, olhando o mini-menu): o 1º
// virou "3D Livre" (montagens de espaços inteiros), o do meio
// "Composições" (testar/criar composições novas, sair do óbvio) e o
// último perdeu o nome e passou a mostrar só "Em desenvolvimento". Chegou
// a ter uma frase de descrição por card (revelada no hover) — o usuário
// pediu logo em seguida pra tirar: "retire as frases, deixe somente os
// títulos". `label` é o NOME do módulo (usado também na trilha, no rótulo
// do cabeçalho e na linha do tempo — ver modulo3dLabel()); `title` (só o
// 3º card) é o que APARECE escrito no quadro quando é diferente do nome —
// a Realidade aumentada não mostra mais o próprio nome, mas `label`
// continua identificando o card pra equipe nos botões de marcar o modelo
// em destaque.
const MODULO3D_CARDS = [
  { key: "estudio", label: "3D Livre", action: "studio", available: true },
  { key: "lounge", label: "Composições", action: "lounge", available: true },
  { key: "realidade-aumentada", label: "Realidade aumentada", title: "Em desenvolvimento", action: null, available: false },
];
// Nome de um módulo pela chave — fonte única pro rótulo do cabeçalho, a
// trilha e a linha do tempo (antes eram textos soltos "Painel 3D"/"Módulo
// Lounge" repetidos em 3 lugares).
const modulo3dLabel = (key) => MODULO3D_CARDS.find((card) => card.key === key)?.label || "";
// Pedido explícito do usuário: "quero um 3D diferente pra cada módulo" —
// antes só existia 1 modelo em destaque pra tela inteira (item.
// capaModulo3d/coluna capa_modulo3d); agora cada card do mini-menu tem
// sua PRÓPRIA flag, marcada independentemente no cadastro do item (ver
// migration 20260919000200_itens_capa_modulo3d_por_modulo.sql). Essas 2
// tabelas traduzem a chave de MODULO3D_CARDS pro campo do item
// (mapRow()) e pra coluna do banco (alternarCapaModulo3d()) — um card
// novo no futuro só precisa de uma entrada nova aqui + a coluna
// correspondente no banco.
const MODULO3D_CAPA_FIELD = { estudio: "capaModulo3dEstudio", lounge: "capaModulo3dLounge", "realidade-aumentada": "capaModulo3dAr" };
const MODULO3D_CAPA_COLUMN = { estudio: "capa_modulo3d_estudio", lounge: "capa_modulo3d_lounge", "realidade-aumentada": "capa_modulo3d_ar" };
const state = { items: [], activeView: GATEWAY_VIEW, company: null, decorator: null, catalogSession: null, sectionObserver: null, activeSection: null, eventTimer: null, customizeItem: null, fabricDataUrl: "", fabricFile: null, viewMode: "immersive", currentItems: [], currentHeading: "", overlay: null, gatewayCapas: {}, acessoInterno: false, eventPaused: false, activeSubcat: "", homeFilters: newHomeFilters(), homeFilterOpen: "", currentCategoryItems: null, navBack: [], navForward: [], navCurrent: null, navSuppress: false, timelineSignature: "" };
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[ch]));
const escapeAttr = (value) => escapeHtml(value).replace(/`/g, "&#96;");
const normalizeSearch = (value) => String(value || "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Cat\u00e1logo lento pra carregar fotos ao entrar numa categoria (pedido
// expl\u00edcito do usu\u00e1rio: "busque formas do cat\u00e1logo abrir com mais
// agilidade"). Investiga\u00e7\u00e3o confirmou 2 causas reais, corrigidas juntas:
// (1) o Storage do Supabase deste projeto j\u00e1 tem transforma\u00e7\u00e3o de imagem
// habilitada (plano Pro, testado direto: /storage/v1/render/image/...
// responde 200 e devolve um JPEG bem menor, cacheado no CDN da pr\u00f3pria
// Supabase) \u2014 s\u00f3 faltava o cat\u00e1logo pedir a vers\u00e3o certa pra cada
// contexto em vez do arquivo original; (2) o editor de recorte (cadastro
// de item E o ajuste inline dentro do cat\u00e1logo) gravava PNG sem
// compress\u00e3o no tamanho quase nativo da foto original \u2014 fotos reais
// encontradas no banco chegavam a 8-16MB CADA, s\u00f3 por causa desse bug
// (ver corre\u00e7\u00e3o em cropSessionBlob() mais abaixo). otimizarFoto() ataca a
// causa (1): pede ao Storage uma vers\u00e3o j\u00e1 redimensionada/recomprimida em
// vez do arquivo cru, sem precisar reprocessar nada que j\u00e1 est\u00e1 salvo \u2014
// resolve tanto fotos antigas (j\u00e1 gigantes) quanto novas de uma vez.
const IMG_WIDTH = {
  hero: 1600,   // foto principal/ambientada em tela cheia (imersiva)
  gateway: 1920, // foto do Portal, full-bleed
  card: 380,    // cards da Home/grade de categorias/produtos
  mosaic: 640,  // colunas do modo mosaico
  thumb: 160,   // itens relacionados, miniaturas pequenas
  swatch: 110,  // c\u00edrculos de cor das variantes
  toast: 340,   // foto dentro da notifica\u00e7\u00e3o
  zoom: 3200,   // visualizador de zoom (clique na foto) \u2014 perto do original, s\u00f3 sob demanda
};
// Qualidade um pouco mais alta s\u00f3 pras fotos GRANDES (tela cheia) \u2014 \u00e9
// nelas que a pessoa realmente repara em detalhe/textura ("eu quero que
// as fotos tenha uma qualidade boa"); miniaturas pequenas continuam na
// qualidade padr\u00e3o de otimizarFoto() (74), onde a diferen\u00e7a visual n\u00e3o
// se nota mas o peso do arquivo importa mais.
const IMG_QUALITY_HERO = 82;
// Qualidade do visualizador de zoom (clique na foto) — mais alta ainda
// que IMG_QUALITY_HERO porque aqui a pessoa está deliberadamente
// procurando ver detalhe/textura de perto; IMG_WIDTH.zoom (3200) já é
// perto do original, então uma perda maior de qualidade seria óbvia
// justo no lugar onde mais importa não ter.
const IMG_QUALITY_ZOOM = 90;

// Reescreve uma URL p\u00fablica do Storage pra pedir a vers\u00e3o transformada
// (redimensionada + recomprimida, cacheada pelo CDN da Supabase) em vez
// do arquivo original. Nunca mexe em URLs que n\u00e3o sejam do Storage
// (data:, blob:, o SVG embutido do placeholder "Sem foto") \u2014 passam
// direto, sem transforma\u00e7\u00e3o nenhuma. Importante: NUNCA aplicar em
// item.photo/detail.img/event.img guardados no objeto do item \u2014 v\u00e1rias
// rotinas (crop inline, compara\u00e7\u00e3o de troca de variante) precisam da URL
// crua original; s\u00f3 transformar no exato ponto de montar o `src` vis\u00edvel.
// BUG REAL já encontrado e corrigido (usuário reportou com print: fotos
// da Home cortadas/esticadas, só uma fatia vertical do móvel visível):
// pedir só `width` ao transformador do Supabase, sem `resize=contain`,
// faz ele manter a ALTURA ORIGINAL inteira e só encolher a largura — uma
// foto de 5215x4032 virava 1600x4032 (achatada/cortada), não 1600x1237
// (proporcional). `resize=contain` corrige isso mesmo sem informar
// height (o Storage calcula a altura sozinho a partir da proporção real
// do arquivo) — testado direto contra o Storage antes de aplicar aqui.
function otimizarFoto(url, width, quality = 74){
  if(!url || typeof url !== "string" || !width) return url;
  const marcador = "/storage/v1/object/public/";
  const indice = url.indexOf(marcador);
  if(indice === -1) return url;
  const base = url.slice(0, indice);
  const caminho = url.slice(indice + marcador.length);
  const separador = caminho.includes("?") ? "&" : "?";
  return `${base}/storage/v1/render/image/public/${caminho}${separador}width=${width}&quality=${quality}&resize=contain`;
}

function notify({ title, message, status = "done", actionLabel = "", onAction = null, duration = 7000, image = "" }){
  const host = $("catalogNotifications");
  if(!host) return { close(){}, update(){} };
  const toast = document.createElement("article");
  host.appendChild(toast);
  const state = { title, message, status, actionLabel, onAction, image, duration };
  const startedAt = Date.now();
  let closeTimer = null;
  let percentTimer = null;

  // Percentual "vivo" pro estado "working" (pedido explícito do usuário,
  // no lugar do círculo girando genérico: "quero que coloque
  // porcentagem, bem discreto bonito mas ao mesmo tempo visível") — sobe
  // rápido no início e desacelera com uma curva assintótica sobre o
  // tempo REAL decorrido (nunca chega em 100% sozinho, só quando
  // update() troca o status de verdade) — evita a "mentira" clássica de
  // barra de progresso que bate 100% e ainda fica esperando, e é "fiel
  // ao tempo que de fato demora" (pedido explícito) porque acompanha o
  // relógio de verdade, não uma animação de duração fixa. `tau=50`
  // calibrado pelos "~2 minutos" que o texto de status do tecido já
  // promete: aos 120s mostra ~87%, sem travar antes disso se demorar
  // mais.
  function currentPercent(){
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    return Math.min(96, Math.round(96 * (1 - Math.exp(-elapsedSeconds / 50))));
  }
  function stopPercentTimer(){
    clearInterval(percentTimer);
    percentTimer = null;
  }
  function iconHTML(){
    if(state.status === "working") return `<span class="catalog-notification-icon is-progress" aria-hidden="true" style="--pct:${currentPercent()}"><span class="catalog-notification-percent">${currentPercent()}%</span></span>`;
    return `<span class="catalog-notification-icon" aria-hidden="true">${state.status === "error" ? "!" : "✓"}</span>`;
  }
  function paint(){
    toast.className = `catalog-notification is-${state.status}${state.image ? " has-photo" : ""}`;
    toast.innerHTML = `${state.image ? `<img class="catalog-notification-photo" src="${escapeAttr(otimizarFoto(state.image, IMG_WIDTH.toast))}" alt="">` : ""}${iconHTML()}<div class="catalog-notification-copy"><strong>${escapeHtml(state.title)}</strong><span>${escapeHtml(state.message)}</span></div>${state.actionLabel ? `<button type="button" class="catalog-notification-action">${escapeHtml(state.actionLabel)}</button>` : ""}<button type="button" class="catalog-notification-close" aria-label="Fechar">×</button>`;
    toast.querySelector(".catalog-notification-close")?.addEventListener("click", close);
    toast.querySelector(".catalog-notification-action")?.addEventListener("click", () => { state.onAction?.(); close(); });
    stopPercentTimer();
    if(state.status === "working"){
      percentTimer = window.setInterval(() => {
        const pct = currentPercent();
        const icon = toast.querySelector(".catalog-notification-icon");
        const label = toast.querySelector(".catalog-notification-percent");
        if(icon) icon.style.setProperty("--pct", pct);
        if(label) label.textContent = `${pct}%`;
      }, 400);
    }
  }
  const close = () => {
    if(!toast.isConnected) return;
    clearTimeout(closeTimer);
    stopPercentTimer();
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 300);
  };
  function armCloseTimer(){
    clearTimeout(closeTimer);
    if(state.duration > 0) closeTimer = window.setTimeout(close, state.duration);
  }
  // Reaproveita o MESMO elemento em vez de fechar e criar um toast novo
  // — pedido explícito do usuário pro tecido: "no momento que bater 100%
  // a imagem deve aparecer". Ao sair de "working" pra "done" (sucesso de
  // verdade), mostra 100% por um instante antes de virar o conteúdo
  // final, pra a pessoa VER o percentual realmente chegar no fim, em vez
  // do número sumir escondido atrás da troca de conteúdo. Erro não passa
  // por esse "flash" (não faz sentido mostrar 100% de uma geração que
  // falhou).
  function update(next){
    const wasWorking = state.status === "working";
    Object.assign(state, next);
    if(wasWorking && state.status === "done"){
      const label = toast.querySelector(".catalog-notification-percent");
      const icon = toast.querySelector(".catalog-notification-icon");
      if(label && icon){
        icon.style.setProperty("--pct", 100);
        label.textContent = "100%";
        stopPercentTimer();
        window.setTimeout(() => { paint(); armCloseTimer(); }, 450);
        return;
      }
    }
    paint();
    armCloseTimer();
  }

  paint();
  armCloseTimer();
  return { close, update, element: toast };
}
window.catalogNotify = notify;

function ensureFonts(){
  if($("catalog-fonts")) return;
  const link = document.createElement("link");
  link.id = "catalog-fonts";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Manrope:wght@400;500;600&display=swap";
  document.head.appendChild(link);
}

function slugify(value){
  return String(value || "sem-categoria").trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "sem-categoria";
}

function formatDims(largura, altura, profundidade){
  const values = [largura, altura, profundidade].map((value) =>
    value !== null && value !== "" && Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : null
  );
  return values.every((value) => value === null) ? "" : values.map((value) => value ?? "–").join(" × ") + " cm";
}

function catalogItemAllowed(row){
  return ['item','kit'].includes(String(row?.tipo || '').trim().toLowerCase());
}

function mapRow(row){
  const model = Array.isArray(row.itens_modelos_3d) ? row.itens_modelos_3d[0] : row.itens_modelos_3d;
  const photos = (row.itens_fotos || []).filter((photo) => photo.url).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const details = photos.filter((photo) => photo.tipo === "detalhe");
  // Fotos exclusivas do decorador têm prioridade; sem elas, usa o catálogo padrão.
  const ownEvents = photos.filter((photo) => photo.tipo === "galeria" && photo.cliente_id && String(photo.cliente_id) === String(state.catalogSession?.cliente_id || ""));
  const events = ownEvents.length ? ownEvents : photos.filter((photo) => photo.tipo === "galeria" && !photo.cliente_id);
  // PRODUTO (row.produto_base, ex. "Cadeira") prefixa a ESPECIFICAÇÃO
  // (row.produto, ex. "Arabesco") no nome exibido — mesmo padrão de
  // `nomeGerado`/`descricao_total` usado no cadastro manual e na
  // importação em massa (ver itens.api.mjs / montarDescricaoTotal).
  const nome = row.produto_base ? `${row.produto_base} ${row.produto || ""}`.trim() : (row.produto || "Item sem nome");
  return {
    id: row.id,
    tipo: row.tipo,
    material: row.material || "",
    estilo: row.estilo || "",
    cor: row.cor || "",
    personalizable: row.personalizable === true,
    cat: slugify(row.categoria),
    catLabel: row.categoria || "Sem categoria",
    // Filtro premium por subcategoria dentro de uma categoria (pedido
    // explícito do usuário: "quero que apareça as subcategorias que tem
    // dentro do cadastro itens... e um filtro premium" — ver
    // renderSubcatFilter()/GATEWAY... abaixo). String vazia = item sem
    // subcategoria cadastrada, nunca vira um chip (só apareceria "vazio"
    // clicável, sem sentido) mas continua contado no "Todos".
    subcat: row.subcategoria ? slugify(row.subcategoria) : "",
    subcatLabel: row.subcategoria || "",
    name: nome,
    dims: formatDims(row.largura, row.altura, row.profundidade),
    dimensions: {
      width: Number(row.largura) > 0 ? Number(row.largura) : null,
      height: Number(row.altura) > 0 ? Number(row.altura) : null,
      depth: Number(row.profundidade) > 0 ? Number(row.profundidade) : null,
    },
    desc: row.descricao_complementar || "",
    // Capa da categoria na Home do catálogo (pedido explícito do usuário) —
    // ver categoryCoverPhoto()/renderHome().
    capaCategoria: row.capa_categoria === true,
    // Modelo 3D em destaque no mini-menu "Módulo 3D" (pedido explícito do
    // usuário: "da mesma forma que eu escolho a foto da capa da
    // categoria, vou escolher o 3D que aparece... um dos que temos
    // cadastrados no sistema") — mesmo padrão de capaCategoria, só que
    // UMA FLAG POR MÓDULO (pedido explícito, sessão seguinte: "quero um 3D
    // diferente pra cada módulo" — antes era 1 flag global pra tela
    // inteira, `capa_modulo3d`) — ver modulo3dFeaturedItem()/
    // renderModulo3dMenu().
    capaModulo3dEstudio: row.capa_modulo3d_estudio === true,
    capaModulo3dLounge: row.capa_modulo3d_lounge === true,
    capaModulo3dAr: row.capa_modulo3d_ar === true,
    // Painel técnico (pedido explícito do usuário): algumas informações
    // relevantes do cadastro do item, além do que já aparece (nome e
    // medidas). A tela não tem mais nenhum lugar mostrando a categoria por
    // item (o breadcrumb "← CATEGORIA" foi removido numa edição anterior),
    // então ela entra aqui também.
    specs: [
      { label: "Categoria", value: row.categoria },
      { label: "Família", value: row.familia },
      { label: "Material", value: row.material },
      { label: "Cor", value: row.cor },
      { label: "Estilo", value: row.estilo },
      { label: "Marca/Modelo", value: row.marca_modelo },
      // As medidas moravam numa linha própria abaixo do nome (.product-dimensions,
      // com letras bem espaçadas); a pedido do usuário ("coloque as medidas junto
      // com categoria, material...") viraram uma linha das specs, como as outras.
      { label: "Medidas", value: formatDims(row.largura, row.altura, row.profundidade) },
      { label: "Código", value: row.referencia },
    ].filter((spec) => String(spec.value || "").trim()),
    photo: row.foto_url || FOTO_PLACEHOLDER,
    glb: model && model.status !== "removido" ? model.url : null,
    // slot/path só existem pra poder EDITAR essas fotos direto do catálogo
    // (equipe interna, ver startInlineEdit()) — substituir ou remover uma
    // foto de slot específico precisa saber qual slot ela ocupa e onde
    // está no Storage pra limpar o arquivo antigo.
    details: details.map((photo) => ({ img: photo.url, label: photo.titulo || `Detalhe de ${nome}`, slot: photo.slot, path: photo.path })),
    events: events.map((photo) => ({ img: photo.url, label: photo.titulo || `${nome} em evento`, slot: photo.slot, path: photo.path })),
  };
}

// Agrupamento de variantes (pedido explícito do usuário): quando duas ou
// mais linhas do cadastro têm o mesmo nome, categoria, material e medidas
// — e só diferem em Cor e/ou Descrição complementar (ex.: a mesma poltrona
// em 5 cores) — elas viram UM card só no catálogo, com miniaturas de cada
// variante abaixo do card de personalização, estilo marketplace. Chave
// deliberadamente NÃO inclui cor/descrição complementar (são exatamente o
// que pode variar dentro do grupo); dims entra na chave pra nunca juntar
// produtos de tamanhos diferentes (ex.: "P"/"M"/"G") por engano.
function chaveVariante(item){
  return [item.cat, item.tipo || "", item.name, item.material || "", item.dims || ""].join("||");
}

function agruparVariantes(items){
  const grupos = new Map();
  items.forEach((item) => {
    const chave = chaveVariante(item);
    if(!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(item);
  });
  const resultado = [];
  grupos.forEach((variantes) => {
    if(variantes.length === 1){
      resultado.push(variantes[0]);
      return;
    }
    const ordenadas = [...variantes].sort((a, b) =>
      (a.cor || "").localeCompare(b.cor || "", "pt-BR") || (a.desc || "").localeCompare(b.desc || "", "pt-BR")
    );
    // Cada variante guarda a mesma referência de array — dá pra achar as
    // irmãs a partir de QUALQUER uma delas, não só da principal (necessário
    // depois de trocar de variante mais de uma vez, ver applyVariant()).
    ordenadas.forEach((variante) => { variante.variantGroup = ordenadas; });
    const comFoto = ordenadas.filter((variante) => variante.photo && variante.photo !== FOTO_PLACEHOLDER);
    const candidatas = comFoto.length ? comFoto : ordenadas;
    const principal = candidatas.find((variante) => variante.capaCategoria) || candidatas[0];
    principal.capaCategoria = ordenadas.some((variante) => variante.capaCategoria);
    resultado.push(principal);
  });
  return resultado;
}

// Acha um item (principal OU variante) pelo id — precisa procurar dentro
// de variantGroup porque, depois de trocar de variante numa seção, o
// data-product-id daquela seção passa a ser o id de uma variante que não
// é a "principal" e por isso não está em state.items diretamente.
function findItemById(id){
  for(const item of state.items){
    if(String(item.id) === String(id)) return item;
    const variante = item.variantGroup?.find((candidate) => String(candidate.id) === String(id));
    if(variante) return variante;
  }
  return null;
}

async function carregarItens(){
  const externo = Boolean(state.catalogSession?.token);
  const { data, error } = await catalogRpc(
    externo ? "catalogo_carregar" : "catalogo_carregar_interno",
    externo ? { p_token: state.catalogSession.token } : { p_empresa_id: state.catalogSession?.empresa_id || await getEmpresaAtualId() }
  );
  if(error) throw error;
  if(!Array.isArray(data?.itens)) throw new Error("O servidor não retornou os itens do catálogo. Recarregue para tentar novamente.");
  state.company = data.empresa || null;
  state.decorator = externo ? data.decorador || null : null;
  return agruparVariantes(data.itens.filter(catalogItemAllowed).map(mapRow));
}

async function carregarEmpresa(){
  if(state.company) return state.company;
  const empresaId = state.catalogSession?.empresa_id || await getEmpresaAtualId();
  const { data, error } = await supabase.from("empresas").select("nome,logo_url").eq("id", empresaId).maybeSingle();
  if(error) console.warn("Não foi possível carregar a identidade da empresa:", error);
  return data || null;
}

function getCategories(){
  const map = new Map();
  state.items.forEach((item) => map.set(item.cat, item.catLabel));
  return [...map].map(([cat, label]) => ({ cat, label }));
}

function renderHeader(){
  const logo = $("catalogBrandLogo");
  const name = $("catalogBrandName");
  const companyName = state.company?.nome || "Acervo";
  const user = $("catalogUser");
  const userName = $("catalogUserName");
  const userLogo = $("catalogUserLogo");

  name.textContent = companyName;
  if(state.company?.logo_url){
    logo.src = state.company.logo_url;
    logo.alt = `Logo ${companyName}`;
    logo.classList.remove("hidden");
    name.classList.add("hidden");
    logo.addEventListener("error", () => {
      logo.classList.add("hidden");
      name.classList.remove("hidden");
    }, { once: true });
  }

  if(state.decorator?.nome){
    userName.textContent = state.decorator.nome;
    user.classList.remove("hidden");
    if(state.decorator.logo_url){
      userLogo.src = state.decorator.logo_url;
      userLogo.alt = `Logo de ${state.decorator.nome}`;
      userLogo.classList.remove("hidden");
    }else userLogo.classList.add("hidden");
  }
}

// --header-h e usado em varios lugares (altura de cada secao de produto, do
// Painel 3D) para descontar exatamente o espaco do cabecalho — por isso
// precisa refletir a altura REAL renderizada, nao um numero fixo.
// ResizeObserver acompanha qualquer mudanca (janela redimensionada etc.).
// Observa só .catalog-header (não o wrapper .catalog-top-chrome) — a
// trilha de navegação ("Catálogo / Categoria / Item", apagada depois a
// pedido do usuário) era position:absolute, flutuava por CIMA do conteúdo em vez de empurrá-lo
// pra baixo (pedido explícito do usuário: a foto ambientada em tela
// cheia precisa encostar no cabeçalho, não parar na trilha), então ela
// não deve entrar nesta conta — só o cabeçalho reserva espaço de
// verdade no layout.
function syncHeaderHeight(){
  const header = document.querySelector(".catalog-header");
  const page = document.querySelector(".catalog-page");
  if(!header || !page) return;
  page.style.setProperty("--header-h", `${header.offsetHeight}px`);
}

function watchHeaderHeight(){
  const header = document.querySelector(".catalog-header");
  if(!header || !("ResizeObserver" in window)) return;
  new ResizeObserver(syncHeaderHeight).observe(header);
  syncHeaderHeight();
}

// Centraliza a última linha da grade de categorias da Home quando ela não
// fecha todas as colunas (pedido explícito do usuário, com print
// mostrando a 2ª linha "Estofados/Mesas Auxiliares/.../Objetos" grudada
// à esquerda, com um vão vazio grande à direita). `.catalog-home-grid`
// continua `auto-fill`/`1fr` de sempre (linhas cheias não mudam nada) —
// só os cards da última linha, quando incompleta, ganham um
// `grid-column-start` deslocado pro meio das colunas existentes, em vez
// de começar sempre na 1ª coluna. Recalculado a cada redesenho da Home E
// no resize (o número de colunas por linha é responsivo, via auto-fill).
function centerLastHomeGridRow(){
  const grid = document.querySelector(".catalog-home-grid");
  if(!grid) return;
  const cards = [...grid.children];
  cards.forEach((card) => { card.style.gridColumnStart = ""; });
  if(!cards.length) return;
  const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
  if(columns <= 1) return;
  const remainder = cards.length % columns;
  if(!remainder) return;
  const start = Math.floor((columns - remainder) / 2) + 1;
  cards.slice(-remainder).forEach((card, i) => { card.style.gridColumnStart = String(start + i); });
}

function watchHomeGridWidth(){
  const grid = $("catalogGrid");
  if(!grid || !("ResizeObserver" in window)) return;
  new ResizeObserver(centerLastHomeGridRow).observe(grid);
}

// O catálogo mostra só UMA categoria de cada vez — pedido explícito do
// usuário: antes ele renderizava TODOS os itens de uma vez (uma seção de
// tela cheia por item, todas empilhadas), pesado pra carregar e sem
// separação real por categoria. Trocar de categoria re-renderiza só o
// subconjunto certo.
function itemsForView(view){
  return state.items.filter((item) => item.cat === view);
}

// Mostra/esconde os ícones de imersivo/grade (#catalogViewSwitcher) —
// só fazem sentido dentro de uma categoria, não no Portal nem na Home
// (que já são, por natureza, uma grade, sem uma "visualização imersiva"
// equivalente).
function updateViewToggleVisibility(){
  $("catalogViewSwitcher")?.classList.toggle("hidden", state.activeView === HOME_VIEW || state.activeView === FILTER_VIEW || state.activeView === GATEWAY_VIEW || state.activeView === MODULO3D_MENU_VIEW || state.overlay);
}

// Único jeito de abrir esses dois overlays hoje: os blocos do Portal
// (activateGatewayTile) — os botões "Biblioteca"/"Painel 3D" que
// existiam soltos no cabeçalho foram removidos a pedido do usuário
// (ver bindInteractions/comentário em cima de .catalog-page-label);
// pra chegar neles de dentro de uma categoria agora é preciso voltar
// pro Portal primeiro (clicando na logo).
function openStudioOverlay(){
  setActiveOverlay("studio");
  window.dispatchEvent(new Event("catalog-studio-open"));
}

function openBibliotecaOverlay(){
  setActiveOverlay("biblioteca");
  openCatalogBiblioteca();
}

function openLoungeOverlay(){
  setActiveOverlay("lounge");
  openCatalogLounge();
}

function openProjetosOverlay(options = {}){
  setActiveOverlay("projetos");
  openCatalogProjetos(options);
}

// Clique/Enter num bloco do Portal (ver renderGateway). "Módulo 3D" não
// abre mais o estúdio direto — leva pro mini-menu novo (MODULO3D_MENU_VIEW),
// que por sua vez tem o estúdio como um dos 3 cards (ver activateModulo3dCard).
function activateGatewayTile(key){
  if(key === "catalogo") applyView(HOME_VIEW);
  else if(key === "biblioteca") openBibliotecaOverlay();
  else if(key === "modulo3d") applyView(MODULO3D_MENU_VIEW);
  else if(key === "projetos") openProjetosOverlay();
}

// Clique num card disponível (Estúdio, Lounge) — o recurso futuro
// restante não tem elemento clicável nenhum, ver modulo3dCardMarkup()).
function activateModulo3dCard(key){
  const card = MODULO3D_CARDS.find((candidate) => candidate.key === key);
  if(!card || !card.available) return;
  if(card.action === "studio") openStudioOverlay();
  else if(card.action === "lounge") openLoungeOverlay();
}

// Só UMA das quatro telas do catálogo aparece por vez: os produtos/Home
// (#catalogGrid), o Painel 3D (#catalogStudio), a Biblioteca
// (#catalogBiblioteca) ou o Módulo Lounge (#catalogLounge). `mode` é
// "studio", "biblioteca", "lounge" ou null (mostra #catalogGrid).
function setActiveOverlay(mode){
  // #catalogGrid só fica ESCONDIDO ao abrir um overlay por cima dele
  // (nunca destruído) — sem isso o <model-viewer> do mini-menu (se
  // estava aberto) continuaria renderizando atrás do Painel 3D/
  // Biblioteca/Lounge, e o listener de fullscreen ficaria vivo à toa.
  if(mode) modulo3dTeardownViewer();
  // O Módulo Lounge tem ciclo de vida EXPLÍCITO (cena Three.js própria,
  // ver catalogo-lounge.mjs) — precisa ser desligado de verdade ao sair
  // dele (troca pra outro overlay OU fecha o overlay de vez), diferente
  // do Painel 3D, que só pausa o render loop enquanto escondido.
  if(state.overlay === "lounge" && mode !== "lounge") teardownCatalogLounge();
  // Projetos salva o que estiver pendente ao sair da tela.
  if(state.overlay === "projetos" && mode !== "projetos") closeCatalogProjetos();
  state.overlay = mode;
  $("catalogStudio")?.classList.toggle("hidden", mode !== "studio");
  $("catalogBiblioteca")?.classList.toggle("hidden", mode !== "biblioteca");
  $("catalogLounge")?.classList.toggle("hidden", mode !== "lounge");
  $("catalogProjetos")?.classList.toggle("hidden", mode !== "projetos");
  $("catalogGrid")?.classList.toggle("hidden", Boolean(mode));
  $("catalogSearch")?.closest(".catalog-search")?.classList.toggle("hidden", Boolean(mode));
  updateViewToggleVisibility();
  syncNavigation();
}

function applyView(view, options = {}){
  state.activeView = view;
  // Voltar pro Portal é recomeçar: os filtros da tela "Categorias" zeram (navegar entre as telas de dentro
  // do catálogo os mantém — abrir um item e voltar pela linha do tempo não perde o que foi filtrado).
  if(view === GATEWAY_VIEW){ state.homeFilters = newHomeFilters(); state.homeFilterOpen = ""; }
  // Pedido explícito do usuário, com print mostrando a visualização em
  // grade aberta numa categoria: "quando eu clicar em categoria, eu
  // quero que apareça assim, sempre" — toda vez que a pessoa entra numa
  // categoria (ou volta pra ela pela trilha/Home), começa em grade, não
  // mais na imersiva. Clicar num card da grade ainda abre o item na
  // imersiva normalmente (openImmersiveFromGrid) — só o PONTO DE
  // ENTRADA da categoria mudou, os botões #catalogViewSwitcher continuam
  // funcionando pra quem quiser trocar depois de já estar lá dentro.
  // Só se aplica a uma categoria de verdade (nunca Home/Portal, que nem
  // usam viewMode) — do contrário a BUSCA (que não passa por applyView,
  // só chama renderProducts direto) herdaria esse "grid" sempre que
  // rodasse a partir da Home sem antes ter entrado numa categoria,
  // mudando um comportamento que não foi pedido.
  if(view === FILTER_VIEW){
    state.viewMode = "immersive";
    updateViewToggleButton();
  }else if(view !== GATEWAY_VIEW && view !== HOME_VIEW && view !== MODULO3D_MENU_VIEW){
    state.viewMode = "grid";
    updateViewToggleButton();
  }
  // Mesmo raciocínio do reset de viewMode acima: entrar numa categoria
  // (mesmo que seja a mesma de novo, via clique na trilha) volta pro
  // estado "limpo" — sem filtro de subcategoria nenhum selecionado.
  state.activeSubcat = "";
  // Toda navegação (Home, categoria) sai do Painel 3D/Biblioteca se
  // estiverem abertos e limpa a busca — mesma limpeza que antes só
  // acontecia ao clicar numa categoria do cabeçalho (ver antigo bloco
  // [data-header-category] em bindInteractions, removido junto com o
  // menu de categorias no topo).
  setActiveOverlay(null);
  if($("catalogSearch")) $("catalogSearch").value = "";
  renderCurrentView();
  syncNavigation();
  // "auto" aqui respeitaria o `scroll-behavior:smooth` do <html> (definido
  // em catalogo.css pros outros scrolls do catálogo) e animaria a subida —
  // exatamente o efeito que o usuário pediu pra tirar ao trocar de
  // categoria. "instant" ignora esse CSS e pula direto pro topo.
  window.scrollTo({ top: 0, behavior: "instant" });
  // Vindo de um card dos resultados filtrados: já cai no item clicado, dentro da lista filtrada.
  if(options.focusItemId){
    const focado = findItemById(options.focusItemId);
    const section = focado ? showItemSection(focado) : null;
    requestAnimationFrame(() => section?.scrollIntoView({ behavior: "instant", block: "start" }));
  }
}

function categoryButtons(activeCat){
  return getCategories().map((category) =>
    `<button type="button" class="bottom-category ${category.cat === activeCat ? "active" : ""}" data-category-target="${escapeAttr(category.cat)}">${escapeHtml(category.label)}</button>`
  ).join("");
}

function specsPanel(item){
  if(!item.specs.length) return "";
  return `<dl class="product-specs">${item.specs.map((spec) =>
    `<div class="product-specs-row"><dt>${escapeHtml(spec.label)}</dt><dd>${escapeHtml(spec.value)}</dd></div>`
  ).join("")}</dl>`;
}

// Carrossel da foto principal (pedido explícito do usuário, depois de
// ver a tela do item com o bloco "Detalhes"/"Visualização 3D" separado
// embaixo: "quero apagar aquele campo onde tem o 3d e as duas fotos de
// detalhe, quero que a pessoa veja os detalhes no mesmo lugar da foto
// principal, quero que tenha uma seta esmaecida premium onde a pessoa
// troque a foto no próprio local da foto principal" — confirmado que o
// modelo 3D por item SOME de vez dessa tela, não vira mais um slide;
// o Módulo 3D do Portal, que monta composições, continua existindo
// normalmente, só esse atalho por item que deixa de existir).
//
// `mainSlides(item)` monta a sequência navegável: principal + até 2
// detalhes cadastrados. Pra equipe interna (acessoInterno), slots de
// detalhe AINDA VAZIOS entram como slides "vazios" (`empty:true`) — é
// assim que a equipe continua alcançando "+ Adicionar Detalhe" sem
// nenhum card separado, só navegando o carrossel; pro decorador, só
// entram slides com foto de verdade (nunca mostra um slide vazio pra
// quem não pode editar).
function mainSlides(item){
  // `rawSrc` guarda a URL crua (sem transformação) — é o que vai pra
  // data-original-src, único lugar que precisa da identidade real do
  // arquivo; `src` (transformado via otimizarFoto) é só pra exibição.
  const slides = [{ slot: "principal", src: otimizarFoto(item.photo, IMG_WIDTH.hero, IMG_QUALITY_HERO), rawSrc: item.photo, alt: item.name, empty: false }];
  ["detalhe_01", "detalhe_02"].forEach((slot) => {
    const detail = item.details.find((foto) => foto.slot === slot);
    if(detail){
      slides.push({ slot, src: otimizarFoto(detail.img, IMG_WIDTH.hero, IMG_QUALITY_HERO), rawSrc: detail.img, alt: detail.label, empty: false });
    }else if(state.acessoInterno){
      slides.push({ slot, src: FOTO_PLACEHOLDER, rawSrc: FOTO_PLACEHOLDER, alt: ITEM_PHOTO_SLOTS_CONFIG[slot].label, empty: true });
    }
  });
  return slides;
}

// Pinta o slide `slot` dentro do carrossel já existente na seção — usada
// tanto pra navegar (stepMainSlide) quanto pra sincronizar depois de
// trocar de variante/editar uma foto (applyVariant). Atualiza a imagem,
// os pontinhos, e retarget o lápis de edição (data-inline-edit) pro slot
// que está em foco — o mesmo gatilho de edição de sempre, só que agora
// segue o carrossel em vez de ficar fixo na foto principal.
function renderMainSlide(section, item, slot){
  const media = section.querySelector(".product-main-media");
  const img = media?.querySelector(".product-main-image");
  if(!media || !img) return;
  const slides = mainSlides(item);
  const target = slides.find((s) => s.slot === slot) || slides[0];
  media.dataset.activeSlot = target.slot;
  const commit = () => {
    img.src = target.src;
    img.alt = target.alt;
    img.classList.toggle("is-empty-slide", target.empty);
    if(target.slot === "principal"){
      img.dataset.originalSrc = target.rawSrc;
      img.dataset.originalAlt = target.alt;
    }
    requestAnimationFrame(() => img.classList.remove("is-changing"));
  };
  if(img.src === target.src) commit();
  else{
    img.classList.add("is-changing");
    setTimeout(commit, 120);
  }
  media.querySelectorAll(".product-main-dot").forEach((dot, i) => dot.classList.toggle("is-active", slides[i] === target));
  const badge = media.querySelector("[data-inline-edit]");
  if(badge){
    badge.dataset.inlineEdit = target.slot;
    badge.textContent = target.empty ? "+" : "✎";
    badge.setAttribute("aria-label", target.empty ? `Adicionar ${target.alt}` : `Ajustar ${target.alt}`);
  }
}

// Seta ‹ › — pedido explícito do usuário, "esmaecida premium": ver
// .product-main-nav em catalogo.css.
function stepMainSlide(section, item, direction){
  const media = section.querySelector(".product-main-media");
  if(!media) return;
  const slides = mainSlides(item);
  if(slides.length < 2) return;
  const currentIndex = Math.max(0, slides.findIndex((s) => s.slot === (media.dataset.activeSlot || "principal")));
  const nextIndex = (currentIndex + direction + slides.length) % slides.length;
  renderMainSlide(section, item, slides[nextIndex].slot);
}

function mainCarouselMarkup(item){
  const slides = mainSlides(item);
  if(slides.length < 2) return "";
  return `<button type="button" class="product-main-nav product-main-nav-prev" data-main-nav="prev" aria-label="Foto anterior">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>
    </button>
    <button type="button" class="product-main-nav product-main-nav-next" data-main-nav="next" aria-label="Próxima foto">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>
    </button>
    <div class="product-main-dots">${slides.map((slide, i) => `<span class="product-main-dot${i === 0 ? " is-active" : ""}"></span>`).join("")}</div>`;
}

// Card de variantes (pedido explícito do usuário, estilo marketplace):
// miniatura de cada variante do grupo (ver agruparVariantes), rotulada
// pela Cor + Descrição complementar quando existirem. Fica escondido
// quando o grupo tem só 1 variante (produto sem irmãs de cor).
//
// Pedido explícito do usuário, depois de ver a tela de verdade: "quero
// diminuir um pouco o nome do item e quero colocar ao lado na mesma
// linha os círculos das cores disponíveis" — o rótulo "Cores
// disponíveis" (que existia como título da própria seção, numa linha
// separada acima dos círculos) foi removido: ao lado do nome do item já
// fica óbvio o que aquilo é, e repetir o rótulo ali competiria por
// espaço na mesma linha do título. A informação não se perde — cada
// círculo continua com `title`/`aria-label`, e o GRUPO ganha
// `aria-label="Cores disponíveis"` pra quem usa leitor de tela. O nome
// de cada cor embaixo do círculo (pedido "estilo marketplace" de uma
// sessão anterior) foi mantido — só o cabeçalho do grupo que sumiu, não
// a legenda de cada variante.
function variantLabel(variante){
  return [variante.cor, variante.desc].filter((valor) => String(valor || "").trim()).join(" ") || "Padrão";
}

function variantSwatchesBlock(item){
  const grupo = item.variantGroup;
  if(!grupo || grupo.length < 2) return "";
  return `<div class="product-variants-row" role="group" aria-label="Cores disponíveis">
    ${grupo.map((variante) => {
      const rotulo = variantLabel(variante);
      return `<button type="button" class="product-variant-swatch ${String(variante.id) === String(item.id) ? "active" : ""}" data-variant-id="${escapeAttr(variante.id)}" title="${escapeAttr(rotulo)}" aria-label="${escapeAttr(rotulo)}">
        <span class="product-variant-swatch-photo"><img src="${escapeAttr(otimizarFoto(variante.photo, IMG_WIDTH.swatch))}" alt="${escapeAttr(rotulo)}" loading="lazy" decoding="async"></span>
        <span class="product-variant-swatch-label">${escapeHtml(variante.cor || rotulo)}</span>
      </button>`;
    }).join("")}
  </div>`;
}

// Capa da categoria (pedido explícito do usuário): botão persistente,
// nunca escondido atrás de outro controle — equipe marca o item aberto
// como capa da SUA categoria (mesmo campo itens.capa_categoria do
// Cadastro de Itens), desmarcando quem era capa antes.
function capaToggleMarkup(item){
  if(!state.acessoInterno) return "";
  const categoryLabel = getCategories().find((category) => category.cat === item.cat)?.label || item.catLabel;
  const isCapa = Boolean(item.capaCategoria);
  return `<button type="button" class="catalog-capa-toggle ${isCapa ? "is-active" : ""}" data-capa-toggle>
    <span class="catalog-capa-toggle-star" aria-hidden="true">${isCapa ? "★" : "☆"}</span>
    <span>${isCapa ? `Capa de "${escapeHtml(categoryLabel)}"` : `Definir como capa de "${escapeHtml(categoryLabel)}"`}</span>
  </button>`;
}

// Painel de foto ambientada — função única usada tanto no primeiro render
// (productTemplate) quanto ao trocar de variante (applyVariant), pra não
// duplicar o template em dois lugares (o comportamento de sempre —
// mostra item.events[0], sem mudar) e, pra equipe interna, soma os 3
// pontinhos de seleção de slot (galeria_01/02/03) usados pela edição
// inline — ver [data-inline-edit] em bindInteractions().
function eventPanelMarkup(item, index){
  const event = item.events[0];
  const img = event
    ? `<img class="product-event-image" src="${escapeAttr(otimizarFoto(event.img, IMG_WIDTH.hero, IMG_QUALITY_HERO))}" alt="${escapeAttr(event.label)}" data-event-index="0" data-original-src="${escapeAttr(event.img)}" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
    : `<img class="event-fallback" src="${escapeAttr(FOTO_PLACEHOLDER)}" alt="Sem foto">`;
  const controls = eventControlsMarkup(item);
  if(!state.acessoInterno) return img + controls;
  const slots = ["galeria_01", "galeria_02", "galeria_03"];
  const picker = `<div class="catalog-event-slot-picker">${slots.map((slot) => {
    const filled = item.events.some((foto) => foto.slot === slot);
    return `<button type="button" class="catalog-event-slot-dot ${filled ? "is-filled" : ""}" data-inline-edit="${escapeAttr(slot)}" aria-label="Ajustar ${escapeAttr(ITEM_PHOTO_SLOTS_CONFIG[slot].label)}"></button>`;
  }).join("")}</div>`;
  return img + controls + picker;
}

// Setas (anterior/próxima) e "pausar" da foto ambientada (pedido do usuário: "na foto do item ambientado eu
// quero que tenha uma seta de avançar ou voltar e um pause também, bem discreto, pra parar de alterar").
// A foto ambientada troca sozinha a cada 10s (startEventRotation); agora dá pra passar na mão e pra parar a
// troca automática. Só aparecem com 2+ fotos (com uma só não há o que trocar). "Pausar" vale pra TODOS os
// itens enquanto a página está aberta (state.eventPaused) — as setas continuam funcionando pausado.
const EVENT_ICONS = {
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="5" width="3.4" height="14" rx="1"/><rect x="13.6" y="5" width="3.4" height="14" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
};

function eventPauseAttrs(){
  return state.eventPaused
    ? { label: "Retomar a troca automática das fotos", icon: EVENT_ICONS.play }
    : { label: "Pausar a troca automática das fotos", icon: EVENT_ICONS.pause };
}

function eventControlsMarkup(item){
  if(item.events.length < 2) return "";
  const pause = eventPauseAttrs();
  return `<button type="button" class="catalog-event-nav is-prev" data-event-nav="prev" aria-label="Foto ambientada anterior" title="Anterior">${EVENT_ICONS.prev}</button>
    <button type="button" class="catalog-event-nav is-next" data-event-nav="next" aria-label="Próxima foto ambientada" title="Próxima">${EVENT_ICONS.next}</button>
    <button type="button" class="catalog-event-pause" data-event-pause aria-pressed="${state.eventPaused}" aria-label="${pause.label}" title="${pause.label}">${pause.icon}</button>`;
}

// Todos os botões de pausar que estão na tela acompanham o estado (só as seções renderizadas existem no DOM).
function syncEventPauseButtons(){
  const pause = eventPauseAttrs();
  document.querySelectorAll("[data-event-pause]").forEach((button) => {
    button.setAttribute("aria-pressed", String(state.eventPaused));
    button.setAttribute("aria-label", pause.label);
    button.title = pause.label;
    button.innerHTML = pause.icon;
  });
}

// Sugestões de combinação (pedido explícito do usuário, no lugar onde
// ficavam as fotos de Detalhe: "quero que apareça alguns itens
// relacionados, esses itens você coloca itens que são da mesma
// subcategoria lá dentro de cadastro... pra pessoa conseguir ver
// sugestões de combinações"). Mesma categoria E subcategoria do item
// aberto (nunca só subcategoria isolada — duas categorias diferentes
// poderiam coincidir no nome da subcategoria por acaso); item sem
// subcategoria cadastrada não tem como ter "relacionados" (nada pra
// comparar). Nunca inclui o próprio item nem as variantes de cor dele
// (variantGroup) — sugerir a mesma poltrona noutra cor não é uma
// "combinação". Lê de state.items (lista principal, uma entrada por
// grupo de variante) pra cada item relacionado resolver direto pra uma
// seção já renderizada (mesma categoria = já está no DOM da imersiva).
function relatedItems(item){
  if(!item.subcat) return [];
  const ownGroupIds = new Set((item.variantGroup || [item]).map((variante) => String(variante.id)));
  return state.items.filter((candidate) =>
    candidate.cat === item.cat && candidate.subcat === item.subcat && !ownGroupIds.has(String(candidate.id))
  );
}

// Faixa passando sozinha (pedido explícito do usuário: "eles ficarão
// passando ali") — CSS puro (@keyframes translateX 0→-50%, ver
// .catalog-related-track em catalogo.css), pausa no hover/foco pra dar
// tempo de clicar. A lista dobrada (looped) é o truque padrão de loop
// perfeito: ao andar exatamente 50% da largura (que é 2x a lista real),
// a "cópia" cai visualmente onde o original começou. Duração
// proporcional à quantidade REAL de itens (não à cópia), com um piso —
// poucos itens não podem passar rápido demais pra dar tempo de ver.
// "Mas quero a foto desses itens pequena mesmo" — só foto pequena, nome
// só aparece no hover (mesmo padrão de revelação já usado no modo
// mosaico). Precisa de 2+ pra fazer sentido como faixa "passando" — com
// só 1, a cópia ficaria só repetindo a mesma foto sem nenhum efeito.
function relatedItemsMarkup(item){
  const related = relatedItems(item);
  if(related.length < 2) return "";
  const looped = [...related, ...related];
  const duration = Math.max(18, related.length * 4);
  // Só a 1ª cópia (índice < related.length) recebe foco por teclado — a
  // 2ª existe só pro loop visual da animação, dar Tab nela repetiria os
  // mesmos itens de novo sem nenhum motivo.
  return `<div class="catalog-related-items" style="--catalog-related-duration:${duration}s">
    <span class="catalog-related-label">Combine também com</span>
    <div class="catalog-related-track">
      ${looped.map((relacionado, i) => `<button type="button" class="catalog-related-item" data-related-item="${escapeAttr(relacionado.id)}" aria-label="Ver ${escapeAttr(relacionado.name)}"${i >= related.length ? ' tabindex="-1" aria-hidden="true"' : ""}>
        <img class="catalog-related-photo" src="${escapeAttr(otimizarFoto(relacionado.photo, IMG_WIDTH.thumb))}" alt="${escapeAttr(relacionado.name)}" loading="lazy" decoding="async">
        <span class="catalog-related-name">${escapeHtml(relacionado.name)}</span>
      </button>`).join("")}
    </div>
  </div>`;
}

function productTemplate(item, index){
  const personalizavel = item.personalizable || item.variantGroup?.some((variante) => variante.personalizable);
  return `<section class="catalog-product-section" id="produto-${escapeAttr(item.id)}" data-product-id="${escapeAttr(item.id)}" data-category="${escapeAttr(item.cat)}" data-search="${escapeAttr(normalizeSearch(`${item.name} ${item.catLabel || ""}`))}">
    <div class="catalog-detail-panel">
      <div class="catalog-detail-top">
        <div class="product-copy product-reveal">
          <div class="product-title-row">
            <h1 class="product-title">${escapeHtml(item.name)}</h1>
            ${variantSwatchesBlock(item)}
          </div>
          <div class="product-rule" aria-hidden="true"></div>
          ${specsPanel(item)}
          ${personalizavel ? `<button type="button" class="product-bespoke-card ${item.personalizable ? "" : "hidden"}" data-customize-item="${escapeAttr(item.id)}"><span>SOB MEDIDA</span><strong>Experimente outro tecido</strong><small>Personalize com inteligência artificial →</small></button>` : ""}
          ${capaToggleMarkup(item)}
          ${capaModulo3dToggleMarkup(item)}
          ${projetoAddMarkup(item.id, "page")}
        </div>
        <div class="product-main-media product-reveal${state.acessoInterno ? " catalog-editable" : ""}" data-active-slot="principal">
          <img class="product-main-image" src="${escapeAttr(otimizarFoto(item.photo, IMG_WIDTH.hero, IMG_QUALITY_HERO))}" alt="${escapeAttr(item.name)}" data-original-src="${escapeAttr(item.photo)}" data-original-alt="${escapeAttr(item.name)}" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
          ${mainCarouselMarkup(item)}
          ${state.acessoInterno ? `<span class="catalog-inline-edit-badge" data-inline-edit="principal" role="button" tabindex="0" aria-label="Ajustar foto principal">✎</span>` : ""}
        </div>
      </div>
      ${relatedItemsMarkup(item)}
    </div>
    <aside class="product-event-panel${state.acessoInterno ? " catalog-editable" : ""}">
      ${eventPanelMarkup(item, index)}
    </aside>
  </section>`;
}

// Nome mostrado como título da visualização em grade — mesma categoria
// ativa no momento (ver applyView), calculado aqui em vez de guardado à
// parte pra nunca ficar desatualizado.
function currentViewLabel(){
  return getCategories().find((category) => category.cat === state.activeView)?.label || "";
}

// Rótulo no cabeçalho, no lugar onde ficavam os botões "Biblioteca"/
// "Painel 3D" (removidos a pedido do usuário: "ali onde está biblioteca
// e painel 3d no menu eu quero remover, e ali sempre vai entrar o nome
// da página que estamos" — Portal = "Home", grade de categorias =
// "Categoria", dentro de uma categoria = o nome dela, overlays =
// "Biblioteca"/"Painel 3D"). Diferente da trilha logo abaixo, este
// SEMPRE mostra algo (não some no Portal) — chamado de dentro de
// syncNavigation(), que já roda em todo ponto de navegação certo.
// Extraído de updatePageLabel() pra ser reaproveitado pelas legendas das
// setas de voltar/avançar (ver trackNavHistory() mais abaixo) — mesmo
// texto pra QUALQUER screen {activeView, overlay}, não só o atual.
function screenLabelFor(screen){
  if(screen.overlay === "biblioteca") return "Biblioteca";
  if(screen.overlay === "projetos") return "Projetos";
  if(screen.overlay === "studio") return modulo3dLabel("estudio");
  if(screen.overlay === "lounge") return modulo3dLabel("lounge");
  if(screen.activeView === GATEWAY_VIEW) return "Home";
  if(screen.activeView === HOME_VIEW) return "Categorias";
  if(screen.activeView === FILTER_VIEW) return "Resultados";
  if(screen.activeView === MODULO3D_MENU_VIEW) return "Módulo 3D";
  return getCategories().find((category) => category.cat === screen.activeView)?.label || "Categoria";
}

function updatePageLabel(){
  const label = $("catalogPageLabel");
  if(!label) return;
  const text = screenLabelFor({ activeView: state.activeView, overlay: state.overlay });
  if(label.textContent !== text) label.textContent = text;
}

// LINHA DO TEMPO das telas visitadas, no cabeçalho (pedido explícito do
// usuário, evoluindo as antigas setas de voltar/avançar: "no menu eu quero
// algo conceitual, eu quero que forme tipo uma linha do tempo com todas as
// páginas que eu acessei, então por exemplo, a primeira seria home, a
// segunda seria categorias, a terceira seria bares... a minha tela que eu
// estou agora ela deve ser sempre centralizada e do jeito que está hoje...
// quando eu mudasse de página rolasse um efeito no menu trocando de uma
// tela pra outra, tipo uma rolagem"). Modelo de HISTÓRICO (a ORDEM em que a
// pessoa navegou, com repetição — Home › Categorias › Bares › Categorias),
// diferente da antiga trilha #catalogBreadcrumb (HIERARQUIA Catálogo/
// Categoria/Item, já removida). Cada entrada é `{id, activeView, overlay}` — o suficiente pra
// restaurar a tela via applyView()/openXOverlay(), sem tentar preservar
// estado mais fino (scroll, item em foco, filtro). O `id` é o que permite
// a animação de rolagem reconhecer a MESMA entrada entre uma renderização
// e a seguinte (ver renderTimeline()).
//
// Estrutura no cabeçalho: [entradas anteriores] [#catalogPageLabel = a
// tela ATUAL] [entradas seguintes] — as duas laterais são colunas iguais
// de um grid `1fr auto 1fr`, então a tela atual fica no centro exato como
// já era (ver .catalog-navigation em catalogo.css); as laterais só
// mostram o que couber, esmaecendo pra fora.
let navEntrySeq = 0;
const TIMELINE_MAX_SIDE = 14;
const TIMELINE_MAX_HISTORY = 60;

function trackNavHistory(){
  const screen = { activeView: state.activeView, overlay: state.overlay };
  const current = state.navCurrent;
  if(!current){
    state.navCurrent = { id: ++navEntrySeq, ...screen };
  }else if(state.navSuppress){
    // navSuppress fica true só durante jumpToHistoryEntry() (clique numa
    // entrada da linha do tempo) — as pilhas já foram reorganizadas à mão
    // ali; empilhar de novo aqui criaria um loop. Só sincroniza a tela da
    // entrada com o que realmente ficou ativo (abrir um overlay não muda
    // state.activeView, então os dois podem diferir).
    current.activeView = screen.activeView;
    current.overlay = screen.overlay;
  }else if(current.activeView !== screen.activeView || current.overlay !== screen.overlay){
    state.navBack.push(current);
    if(state.navBack.length > TIMELINE_MAX_HISTORY) state.navBack.shift();
    // Navegação NOVA descarta as entradas "seguintes" — igual navegador.
    state.navForward = [];
    state.navCurrent = { id: ++navEntrySeq, ...screen };
  }
  renderTimeline();
}

function restoreNavScreen(screen){
  if(screen.overlay === "biblioteca") openBibliotecaOverlay();
  else if(screen.overlay === "studio") openStudioOverlay();
  else if(screen.overlay === "lounge") openLoungeOverlay();
  else if(screen.overlay === "projetos") openProjetosOverlay();
  else applyView(screen.activeView);
}

// Vai direto pra QUALQUER entrada da linha do tempo (anterior ou seguinte,
// pulando quantas telas forem) — a lista inteira vira [...voltar, atual,
// ...avançar], o alvo vira a tela atual e o que estava antes/depois dele
// se reparte de novo nos dois lados.
function jumpToHistoryEntry(id){
  const all = [...state.navBack, state.navCurrent, ...state.navForward];
  const targetIndex = all.findIndex((entry) => String(entry.id) === String(id));
  if(targetIndex < 0 || targetIndex === state.navBack.length) return;
  const target = all[targetIndex];
  state.navBack = all.slice(0, targetIndex);
  state.navForward = all.slice(targetIndex + 1);
  state.navCurrent = target;
  state.navSuppress = true;
  restoreNavScreen(target);
  state.navSuppress = false;
}

function timelineItemMarkup(entry, distance){
  const label = screenLabelFor(entry);
  return `<button type="button" class="catalog-timeline-item${distance === 1 ? " is-near" : ""}" data-timeline-entry="${entry.id}" style="--d:${distance}" aria-label="${escapeAttr(`Ir para ${label}`)}"><span>${escapeHtml(label)}</span></button>`;
}

// Retrato da posição/tamanho/opacidade de cada entrada visível (as das
// laterais + a tela atual, que é o próprio #catalogPageLabel) — a base da
// animação "FLIP": mede ANTES de mexer no DOM, mede DEPOIS, e anima cada
// elemento do lugar antigo pro novo, pelo `id` da entrada.
function timelineSnapshot(){
  const snapshot = new Map();
  const put = (element, id) => {
    const box = element.getBoundingClientRect();
    if(!box.width || !box.height || !id) return;
    snapshot.set(String(id), { cx: box.left + box.width / 2, cy: box.top + box.height / 2, w: box.width, opacity: Number(getComputedStyle(element).opacity) });
  };
  document.querySelectorAll("#catalogTimelinePast [data-timeline-entry], #catalogTimelineFuture [data-timeline-entry]").forEach((element) => put(element, element.dataset.timelineEntry));
  const label = $("catalogPageLabel");
  if(label) put(label, label.dataset.entryId);
  return snapshot;
}

const TIMELINE_ANIMATION = { duration: 640, easing: "cubic-bezier(.22,1,.36,1)" };

// "Rolagem" ao trocar de tela (pedido explícito do usuário): a tela que
// era a atual ENCOLHE e desliza pro lado virando uma entrada da linha do
// tempo, e a nova cresce/entra no centro — tudo junto, como uma fita
// rolando. Entrada que já existia (mesmo id) vai do lugar antigo pro novo;
// a tela ATUAL nova, quando é uma navegação inédita (não existia antes),
// entra vinda da direita.
function animateTimeline(first){
  if(!first.size || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const last = timelineSnapshot();
  const label = $("catalogPageLabel");
  const mobile = window.matchMedia("(max-width: 767px)").matches;
  const targets = mobile
    ? [[label, label.dataset.entryId]]
    : [...document.querySelectorAll("#catalogTimelinePast [data-timeline-entry], #catalogTimelineFuture [data-timeline-entry]")].map((element) => [element, element.dataset.timelineEntry]).concat([[label, label.dataset.entryId]]);
  targets.forEach(([element, id]) => {
    const to = last.get(String(id));
    if(!to) return;
    const from = first.get(String(id));
    if(!from || mobile){
      const isLabel = element === label;
      const shift = isLabel ? (from ? from.cx - to.cx : 90) : 0;
      element.animate(
        [{ transform: `translateX(${shift}px)`, opacity: 0 }, { transform: "none", opacity: to.opacity }],
        TIMELINE_ANIMATION
      );
      return;
    }
    const scale = to.w ? from.w / to.w : 1;
    element.animate(
      [
        { transform: `translate(${from.cx - to.cx}px, ${from.cy - to.cy}px) scale(${scale})`, opacity: from.opacity },
        { transform: "none", opacity: to.opacity },
      ],
      TIMELINE_ANIMATION
    );
  });
}

// Só redesenha (e anima) quando a linha do tempo mudou de verdade —
// syncNavigation() roda várias vezes por navegação (applyView chama duas)
// e a cada troca de item por scroll, e nada disso deve reiniciar a
// animação: a assinatura (ids + rótulos) filtra esses casos.
function renderTimeline(){
  const past = $("catalogTimelinePast");
  const future = $("catalogTimelineFuture");
  const label = $("catalogPageLabel");
  const current = state.navCurrent;
  if(!past || !future || !label || !current) return;
  const backSlice = state.navBack.slice(-TIMELINE_MAX_SIDE);
  const forwardSlice = state.navForward.slice(0, TIMELINE_MAX_SIDE);
  const currentLabel = screenLabelFor(current);
  const signature = [backSlice.map((entry) => `${entry.id}:${screenLabelFor(entry)}`).join(","), `${current.id}:${currentLabel}`, forwardSlice.map((entry) => `${entry.id}:${screenLabelFor(entry)}`).join(",")].join("|");
  if(signature === state.timelineSignature) return;
  const first = timelineSnapshot();
  past.innerHTML = backSlice.map((entry, index) => timelineItemMarkup(entry, backSlice.length - index)).join("");
  future.innerHTML = forwardSlice.map((entry, index) => timelineItemMarkup(entry, index + 1)).join("");
  label.textContent = currentLabel;
  label.dataset.entryId = String(current.id);
  // No Portal (rótulo "Home") as laterais somem — mesmo pedido explícito
  // das antigas setas: "na home não precisa ter esses botões, só nos
  // outros". A tela atual continua lá, centralizada, como sempre.
  label.closest(".catalog-navigation")?.classList.toggle("is-portal", state.activeView === GATEWAY_VIEW && !state.overlay);
  state.timelineSignature = signature;
  animateTimeline(first);
}

function bindNavHistory(){
  const onClick = (event) => {
    const item = event.target.closest("[data-timeline-entry]");
    if(item) jumpToHistoryEntry(item.dataset.timelineEntry);
  };
  $("catalogTimelinePast")?.addEventListener("click", onClick);
  $("catalogTimelineFuture")?.addEventListener("click", onClick);
}

// Estado de navegação do catálogo — chamada por applyView() (troca de
// categoria/Home), setActiveOverlay() (abrir/fechar Biblioteca/3D
// Livre/Composições), pelo observer de seção (rolar pra outro item, ver
// setupObservers()) e pela busca. Sempre recalcula do zero a partir de
// state.activeView/state.overlay. (Chamava-se renderBreadcrumb() quando
// também desenhava a trilha "Catálogo / Categoria / Item" abaixo do
// cabeçalho — a trilha foi apagada a pedido do usuário; o caminho
// percorrido continua na linha do tempo do cabeçalho.)
function syncNavigation(){
  // trackNavHistory() vem ANTES de updatePageLabel() de propósito: a
  // animação da linha do tempo mede o rótulo com o texto ANTIGO ainda no
  // lugar (renderTimeline() é quem troca o texto); updatePageLabel() só
  // garante o texto certo quando a linha do tempo não redesenhou.
  trackNavHistory();
  updatePageLabel();
  // A pílula do projeto ativo aparece na navegação do catálogo (categorias, itens), não no Portal nem dentro dos
  // overlays (onde o próprio módulo já mostra/pergunta o destino).
  setProjetoDockVisible(!state.overlay && state.activeView !== GATEWAY_VIEW);
}

// Foto de capa de uma categoria, pra Home (pedido explícito do usuário):
// usa o item marcado capaCategoria=true nessa categoria; sem nenhum
// marcado, cai pro primeiro item da categoria (decisão confirmada com o
// usuário — a categoria nunca aparece sem foto na Home).
function categoryCoverPhoto(cat){
  const itemsInCategory = state.items.filter((item) => item.cat === cat);
  const cover = itemsInCategory.find((item) => item.capaCategoria) || itemsInCategory[0];
  return cover?.photo || FOTO_PLACEHOLDER;
}

// Home do catálogo (pedido explícito do usuário — substitui a antiga tela
// de Destaques e o menu de categorias do cabeçalho): um card por
// categoria, mesmo formato visual dos cards de produto da visualização em
// grade (ver renderGridMarkup), só que com o nome da categoria + a foto de
// capa em vez de nome do produto + dimensões. Sem título "Categorias"
// aqui dentro (tinha um <h2>, removido a pedido do usuário: "como o nome
// está no menu, o que está embaixo pode remover pra não ficar
// duplicado" — ver #catalogPageLabel no cabeçalho, que já mostra isso).
// Clicar num card entra na
// categoria (ver data-home-category em bindInteractions).
// Filtros da tela "Categorias" (pedido do usuário: "quero colocar alguns filtros dentro do módulo de
// categorias, exemplos de filtro... Material, Estilo e customizáveis, quando fizermos isso aparece todos
// os itens com esse filtro e separados por categoria, então imagina que aparece aparadores, aí em baixo os
// móveis, aí depois armários e por aí vai").
//
// Sem nenhum filtro, a tela é a grade de categorias de sempre. Com algum filtro ativo, a grade de
// categorias dá lugar aos ITENS que passam por todos os filtros, agrupados por categoria (um título por
// categoria, com a contagem, e os cards do item embaixo). Regras: dentro de um mesmo filtro os valores
// marcados se somam (Madeira OU Ferro); entre filtros diferentes, todos precisam bater (Madeira E
// personalizável). As contagens ao lado de cada opção respeitam os OUTROS filtros já ativos (quanto
// resultaria se marcasse aquela opção) — uma opção que zeraria fica apagada.
//
// Um filtro sem nenhuma opção nos itens carregados NÃO aparece (hoje nenhum item tem "Estilo"
// cadastrado, então só aparecem Material e Personalizáveis — Estilo entra sozinho quando houver dado).
// O estado (`state.homeFilters`) fica guardado enquanto a pessoa navega (abrir um item e voltar pela
// linha do tempo mantém os filtros) e só zera ao voltar pro Portal.
const HOME_FILTER_FIELDS = [
  { key: "material", label: "Material" },
  { key: "estilo", label: "Estilo" },
];

function newHomeFilters(){
  return { material: new Set(), estilo: new Set(), personalizable: false };
}

// "Estofado Tecido" e "estofado tecido" (ou com acento diferente) contam como o mesmo valor.
const filterKey = (value) => normalizeSearch(String(value || "").trim().replace(/\s+/g, " "));

function itemIsPersonalizable(item){
  return Boolean(item.personalizable || item.variantGroup?.some((variante) => variante.personalizable));
}

// Um item do catálogo pode ser um GRUPO de variantes (mesma poltrona em 5 cores) — o material é igual
// dentro do grupo (faz parte da chave), mas o estilo pode variar, então olha o grupo inteiro.
function homeFilterKeysOf(item, field){
  const grupo = item.variantGroup?.length ? item.variantGroup : [item];
  return [...new Set(grupo.map((variante) => filterKey(variante[field])).filter(Boolean))];
}

// `skip` = campo a IGNORAR na conta (usado pra contar "quanto daria se eu marcasse esta opção").
function itemMatchesHomeFilters(item, skip = ""){
  const filters = state.homeFilters;
  for(const { key } of HOME_FILTER_FIELDS){
    if(key === skip || !filters[key].size) continue;
    if(!homeFilterKeysOf(item, key).some((valor) => filters[key].has(valor))) return false;
  }
  if(filters.personalizable && skip !== "personalizable" && !itemIsPersonalizable(item)) return false;
  return true;
}

function hasHomeFilters(){
  const filters = state.homeFilters;
  return filters.personalizable || HOME_FILTER_FIELDS.some(({ key }) => filters[key].size > 0);
}

function filteredHomeItems(){
  return state.items.filter((item) => itemMatchesHomeFilters(item));
}

// Opções de um campo (todas as que existem nos itens, ordem alfabética) com a contagem contextual.
// O rótulo mostrado é a grafia mais frequente daquele valor.
function homeFilterOptions(field){
  const grafias = new Map();
  const contagens = new Map();
  state.items.forEach((item) => {
    (item.variantGroup?.length ? item.variantGroup : [item]).forEach((variante) => {
      const bruto = String(variante[field] || "").trim();
      const chave = filterKey(bruto);
      if(!chave) return;
      if(!grafias.has(chave)) grafias.set(chave, new Map());
      grafias.get(chave).set(bruto, (grafias.get(chave).get(bruto) || 0) + 1);
    });
    if(itemMatchesHomeFilters(item, field)) homeFilterKeysOf(item, field).forEach((chave) => contagens.set(chave, (contagens.get(chave) || 0) + 1));
  });
  return [...grafias].map(([key, opcoes]) => ({
    key,
    label: [...opcoes].sort((a, b) => b[1] - a[1])[0][0],
    count: contagens.get(key) || 0,
  })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

function homeFilterFieldMarkup(field, options){
  return `<div class="catalog-filter" data-home-filter-field="${escapeAttr(field.key)}">
    <button type="button" class="catalog-filter-chip catalog-filter-trigger" data-home-filter-trigger="${escapeAttr(field.key)}" aria-haspopup="true" aria-expanded="false">
      <span>${escapeHtml(field.label)}</span><em class="catalog-filter-count" hidden>0</em>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="catalog-filter-panel" role="group" aria-label="${escapeAttr(field.label)}" hidden>
      ${options.map((option) => `<label class="catalog-filter-option"><input type="checkbox" data-home-filter-option="${escapeAttr(field.key)}" value="${escapeAttr(option.key)}"><span class="catalog-filter-option-label">${escapeHtml(option.label)}</span><em class="catalog-filter-option-count">${option.count}</em></label>`).join("")}
    </div>
  </div>`;
}

function homeFilterBarMarkup(){
  const fields = HOME_FILTER_FIELDS.map((field) => ({ field, options: homeFilterOptions(field.key) })).filter(({ options }) => options.length);
  const hasPersonalizable = state.items.some(itemIsPersonalizable);
  if(!fields.length && !hasPersonalizable) return "";
  return `<div class="catalog-home-filters" role="group" aria-label="Filtros">
    ${fields.map(({ field, options }) => homeFilterFieldMarkup(field, options)).join("")}
    ${hasPersonalizable ? `<button type="button" class="catalog-filter-chip" data-home-filter-toggle="personalizable" aria-pressed="false"><span>Personalizáveis</span><em class="catalog-filter-count">0</em></button>` : ""}
    <button type="button" class="catalog-filter-clear" id="catalogHomeFilterClear" data-home-filter-clear hidden>Limpar filtros</button>
    <p class="catalog-filter-summary" id="catalogHomeFilterSummary" aria-live="polite"></p>
  </div>`;
}

function homeCategoriesMarkup(categories){
  return `<div class="catalog-grid catalog-home-grid">${categories.map((category) => `
      <button type="button" class="catalog-grid-card catalog-home-card" data-home-category="${escapeAttr(category.cat)}">
        <span class="catalog-grid-card-photo"><img src="${escapeAttr(otimizarFoto(categoryCoverPhoto(category.cat), IMG_WIDTH.card))}" alt="${escapeAttr(category.label)}" loading="lazy" decoding="async"></span>
        <span class="catalog-grid-card-body"><span class="catalog-grid-card-name">${escapeHtml(category.label)}</span></span>
      </button>`).join("")}
    </div>`;
}

// O que aparece embaixo da barra de filtros: as categorias (sem filtro) ou os itens filtrados, por categoria.
function homeResultsMarkup(items){
  const categories = getCategories();
  if(!hasHomeFilters()) return homeCategoriesMarkup(categories);
  if(!items.length){
    return `<p class="catalog-subcat-empty">Nenhum item com esses filtros. <button type="button" class="catalog-filter-clear-inline" data-home-filter-clear>Limpar filtros</button></p>`;
  }
  return categories.map((category) => {
    const grupo = items.filter((item) => item.cat === category.cat);
    if(!grupo.length) return "";
    return `<section class="catalog-filter-group" aria-label="${escapeAttr(category.label)}">
      <h2 class="catalog-filter-group-title"><span>${escapeHtml(category.label)}</span><em>${grupo.length}</em></h2>
      <div class="catalog-grid">${grupo.map(gridCardMarkup).join("")}</div>
    </section>`;
  }).join("");
}

function renderHomeMarkup(){
  return `<div class="catalog-grid-wrap">
    ${homeFilterBarMarkup()}
    <div id="catalogHomeResults"></div>
  </div>`;
}

// Redesenha só o que depende dos filtros (resultados, contagens, marcações) sem recriar a barra — o painel
// aberto continua aberto e o foco continua na caixinha clicada, então dá pra marcar vários valores seguidos.
function refreshHomeFilters(){
  const results = $("catalogHomeResults");
  if(!results) return;
  const filters = state.homeFilters;
  const active = hasHomeFilters();
  const items = active ? filteredHomeItems() : [];
  state.currentItems = items;
  results.innerHTML = homeResultsMarkup(items);
  centerLastHomeGridRow();
  HOME_FILTER_FIELDS.forEach(({ key }) => {
    const field = document.querySelector(`[data-home-filter-field="${key}"]`);
    if(!field) return;
    const selected = filters[key];
    const trigger = field.querySelector("[data-home-filter-trigger]");
    trigger.classList.toggle("is-active", selected.size > 0);
    const badge = trigger.querySelector(".catalog-filter-count");
    badge.textContent = String(selected.size);
    badge.hidden = selected.size === 0;
    const inputs = new Map([...field.querySelectorAll("[data-home-filter-option]")].map((input) => [input.value, input]));
    homeFilterOptions(key).forEach((option) => {
      const input = inputs.get(option.key);
      if(!input) return;
      input.checked = selected.has(option.key);
      const vazia = option.count === 0 && !input.checked;
      input.disabled = vazia;
      const label = input.closest("label");
      label.classList.toggle("is-empty", vazia);
      label.querySelector(".catalog-filter-option-count").textContent = String(option.count);
    });
  });
  const personalizable = document.querySelector('[data-home-filter-toggle="personalizable"]');
  if(personalizable){
    personalizable.classList.toggle("is-active", filters.personalizable);
    personalizable.setAttribute("aria-pressed", String(filters.personalizable));
    personalizable.querySelector(".catalog-filter-count").textContent = String(state.items.filter((item) => itemMatchesHomeFilters(item, "personalizable") && itemIsPersonalizable(item)).length);
  }
  const clear = $("catalogHomeFilterClear");
  if(clear) clear.hidden = !active;
  const summary = $("catalogHomeFilterSummary");
  if(summary){
    const categorias = new Set(items.map((item) => item.cat)).size;
    summary.textContent = active && items.length
      ? `${items.length} ${items.length === 1 ? "item" : "itens"} em ${categorias} ${categorias === 1 ? "categoria" : "categorias"}`
      : "";
  }
}

function setHomeFilterOpen(key){
  state.homeFilterOpen = key || "";
  document.querySelectorAll("[data-home-filter-field]").forEach((field) => {
    const open = field.dataset.homeFilterField === state.homeFilterOpen;
    field.classList.toggle("is-open", open);
    field.querySelector(".catalog-filter-panel").hidden = !open;
    field.querySelector("[data-home-filter-trigger]").setAttribute("aria-expanded", String(open));
  });
}

function clearHomeFilters(){
  state.homeFilters = newHomeFilters();
  refreshHomeFilters();
}

function renderHome(){
  const grid = $("catalogGrid");
  state.currentHeading = "Categorias";
  state.homeFilterOpen = "";
  grid.classList.add("catalog-products-static-mode");
  // Mesma limpeza de observers/animação da visualização em grade — nada
  // disso se aplica à Home (ver renderProducts, ramo "grid").
  state.sectionObserver?.disconnect();
  state.motionCleanup?.();
  state.activeSection = null;
  const categories = getCategories();
  grid.innerHTML = categories.length ? renderHomeMarkup() : "";
  state.currentItems = [];
  refreshHomeFilters();
  $("catalogEmpty")?.classList.toggle("hidden", categories.length > 0);
}

// Portal de entrada: UMA foto só cobrindo a tela inteira (pedido
// explícito do usuário — ver comentário em GATEWAY_PHOTO_KEY acima),
// com os 3 destinos (Catálogo/Biblioteca/Módulo 3D) sobrepostos como
// zonas de clique lado a lado sobre essa mesma foto, sem foto/borda
// própria de cada um. Equipe interna vê UM SÓ botão "Trocar foto"
// (acessoInterno vem de acessoInternoDoSistema(), calculado uma vez em
// init()); o decorador só clica pra navegar. A foto fica no MESMO bucket
// "biblioteca" (path `${empresaId}/_capas/portal.ext`, dentro da mesma
// política de storage por prefixo de empresa) — sem bucket novo.
function renderGateway(){
  const grid = $("catalogGrid");
  grid.classList.add("catalog-products-static-mode");
  state.currentItems = [];
  state.currentHeading = "";
  state.sectionObserver?.disconnect();
  state.motionCleanup?.();
  state.activeSection = null;
  // Os controles da equipe (Ajustar/Trocar foto) ficam FORA das zonas de
  // clique — não tem mais um bloco por destino pra aninhar dentro. O
  // clique pra navegar continua delegado (data-gateway-tile) e ignora
  // cliques que caem dentro do data-gateway-edit/data-gateway-adjust —
  // ver bindInteractions().
  grid.innerHTML = `<div class="catalog-gateway">
    <img class="catalog-gateway-photo" src="${escapeAttr(otimizarFoto(state.gatewayCapas[GATEWAY_PHOTO_KEY] || FOTO_PLACEHOLDER, IMG_WIDTH.gateway, IMG_QUALITY_HERO))}" alt="" loading="eager" decoding="async">
    <div class="catalog-gateway-zones">${GATEWAY_TILES.map((tile) => `
      <div class="catalog-gateway-zone" data-gateway-tile="${escapeAttr(tile.key)}" role="button" tabindex="0">
        <span class="catalog-gateway-title">${escapeHtml(tile.label)}</span>
      </div>`).join("")}
    </div>
    ${state.acessoInterno ? `<div class="catalog-gateway-controls">
      <button type="button" class="catalog-gateway-adjust" data-gateway-adjust="${GATEWAY_PHOTO_KEY}" aria-label="Ajustar posição e zoom da foto" title="Ajustar foto">✎</button>
      <label class="catalog-gateway-edit" data-gateway-edit="${GATEWAY_PHOTO_KEY}">
        <span>Trocar foto</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" data-gateway-file="${GATEWAY_PHOTO_KEY}">
      </label>
    </div>` : ""}
  </div>`;
  $("catalogEmpty")?.classList.add("hidden");
}

async function carregarCapasGateway(){
  try{
    const externo = Boolean(state.catalogSession?.token);
    const { data, error } = await supabase.rpc(
      externo ? "catalogo_capas_carregar" : "catalogo_capas_carregar_interno",
      externo ? { p_token: state.catalogSession.token } : { p_empresa_id: state.catalogSession.empresa_id }
    );
    if(error) throw error;
    state.gatewayCapas = data && typeof data === "object" ? data : {};
  }catch(error){
    console.error("Não foi possível carregar as fotos do portal:", error);
    state.gatewayCapas = {};
  }
}

function extensaoImagemGateway(mime){
  return ({ "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg" })[mime] || "png";
}

// Retorna true/false (sucesso/falha) — usado tanto pela troca instantânea
// (clique direto em "Trocar foto") quanto pelo ajuste inline
// (applyInlineEdit(), que precisa saber se deu certo pra decidir se fecha
// a sessão de crop ou deixa aberta pra tentar de novo).
async function trocarCapaGateway(chave, file){
  if(!state.acessoInterno) return false;
  if(!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024){
    notify({ title: "Não foi possível trocar a foto", message: "Envie uma imagem PNG, JPG ou WebP de até 15 MB.", status: "error" });
    return false;
  }
  const empresaId = state.catalogSession.empresa_id;
  const path = `${empresaId}/_capas/${chave}.${extensaoImagemGateway(file.type)}`;
  const { error: uploadError } = await supabase.storage.from("biblioteca").upload(path, file, { contentType: file.type, upsert: true });
  // Achado real (usuário reportou "o botão trocar foto não está
  // funcionando"): antes disso não havia NENHUM aviso quando o upload
  // falhava — só console.error, invisível pra quem não tem o DevTools
  // aberto. A causa raiz de verdade era o bucket "biblioteca" não ter
  // policy de UPDATE em storage.objects (só INSERT/SELECT/DELETE — ver
  // migration 20260918000200_biblioteca_storage_update_policy.sql):
  // a PRIMEIRA foto subia bem (cai na policy de INSERT), mas TROCAR uma
  // foto que já existia no mesmo caminho (upsert:true reaproveitando o
  // mesmo path por chave, de propósito) precisa de UPDATE e falhava
  // silenciosamente. Corrigida a policy no banco; o aviso aqui fica
  // como rede de segurança pra qualquer outra falha futura (rede, etc.)
  // não voltar a ser invisível pro usuário.
  if(uploadError){
    console.error("Erro ao subir foto do portal:", uploadError);
    notify({ title: "Não foi possível trocar a foto", message: "Tente novamente em instantes.", status: "error" });
    return false;
  }
  const { data: urlData } = supabase.storage.from("biblioteca").getPublicUrl(path);
  const url = `${urlData.publicUrl}?v=${Date.now()}`;
  const { error: upsertError } = await supabase.from("catalogo_capas")
    .upsert({ empresa_id: empresaId, chave, path, url }, { onConflict: "empresa_id,chave" });
  if(upsertError){
    console.error("Erro ao salvar foto do portal:", upsertError);
    notify({ title: "Não foi possível trocar a foto", message: "Tente novamente em instantes.", status: "error" });
    return false;
  }
  state.gatewayCapas[chave] = url;
  if(state.activeView === GATEWAY_VIEW) renderGateway();
  notify({ title: "Foto atualizada", message: "Portal", duration: 4000 });
  return true;
}

// ============================================================
// Mini-menu "Módulo 3D" (pedido explícito do usuário: "quando a pessoa
// clicar em módulo 3D... quero que apareça como se fosse outro mini
// menu, dentro do módulo 3D nós teremos 3 funcionalidades diferentes...
// no topo do html centralizado e grande apareça um móvel em 3d e embaixo
// deixe 3 campos clicáveis pra acessar esses 3 módulos que vamos
// desenvolver"). Confirmado com o usuário antes de implementar: o
// estúdio já existente (planta/render/câmera) vira o 1º dos 3 cards
// (MODULO3D_CARDS), os outros 2 ainda não construídos mostram uma tela
// "Em breve" ao clicar.
// ============================================================

// Modelo em destaque no topo — procura em TODOS os itens (não só os
// "principais" pós-agrupamento de variante, já que capaModulo3d pode
// estar marcado em qualquer variante específica de um grupo, mesmo
// padrão de findItemById()). Prioriza o item marcado capaModulo3d=true;
// sem nenhum marcado, cai pro primeiro item com QUALQUER modelo .glb
// cadastrado (nunca fica sem mostrar nada existindo pelo menos 1 modelo
// no sistema); sem nenhum modelo em lugar nenhum, retorna null.
function allItemsFlat(){
  const seen = new Map();
  state.items.forEach((item) => {
    (item.variantGroup || [item]).forEach((variante) => seen.set(String(variante.id), variante));
  });
  return [...seen.values()];
}

// Modelo em destaque de um card específico — procura em TODOS os itens
// (não só os "principais" pós-agrupamento de variante, já que a flag
// pode estar marcada em qualquer variante específica de um grupo, mesmo
// padrão de findItemById()). Prioriza o item marcado pra ESSE módulo;
// sem nenhum marcado, cai pro primeiro item com QUALQUER modelo .glb
// cadastrado (nunca fica sem mostrar nada existindo pelo menos 1 modelo
// no sistema); sem nenhum modelo em lugar nenhum, retorna null.
function modulo3dFeaturedItem(moduleKey){
  const field = MODULO3D_CAPA_FIELD[moduleKey];
  const all = allItemsFlat();
  return all.find((item) => field && item[field] && item.glb) || all.find((item) => item.glb) || null;
}

// Botões de marcar o item aberto como o modelo em destaque DE CADA
// MÓDULO (pedido explícito do usuário: "da mesma forma que eu escolho a
// foto da capa da categoria, vou escolher o 3D que aparece... um dos que
// temos cadastrados no sistema", depois "quero um 3D diferente pra cada
// módulo") — só aparece pra equipe interna, e só em itens que JÁ têm um
// modelo .glb cadastrado (marcar um item sem modelo não teria o que
// mostrar). Um grupo com 1 botão por card de MODULO3D_CARDS — inclusive
// "Realidade aumentada", que ainda não tem funcionalidade nenhuma, mas
// precisa de um modelo em destaque igual aos outros dois.
function capaModulo3dToggleMarkup(item){
  if(!state.acessoInterno || !item.glb) return "";
  const buttons = MODULO3D_CARDS.map((card) => {
    const isCapa = Boolean(item[MODULO3D_CAPA_FIELD[card.key]]);
    return `<button type="button" class="catalog-capa-toggle catalog-capa-modulo3d-toggle ${isCapa ? "is-active" : ""}" data-capa-modulo3d-toggle="${escapeAttr(card.key)}">
      <span class="catalog-capa-toggle-star" aria-hidden="true">${isCapa ? "★" : "☆"}</span>
      <span>${escapeHtml(card.label)}</span>
    </button>`;
  }).join("");
  return `<div class="catalog-capa-modulo3d-group" role="group" aria-label="Modelo em destaque no Módulo 3D">
    <span class="catalog-capa-modulo3d-group-label">Modelo em destaque no Módulo 3D:</span>
    ${buttons}
  </div>`;
}

// Só um item na empresa inteira pode ser o modelo em destaque de um
// MÓDULO por vez — mesmo padrão de alternarCapaCategoria(), só que
// GLOBAL por módulo (sem filtrar por categoria): desmarca qualquer outro
// que já estivesse marcado NESSE MESMO módulo antes de marcar o atual
// (um item pode ser capa do Estúdio E do Lounge ao mesmo tempo, são
// flags independentes). Devolve os itens desmarcados — o chamador (ver
// handleCapaModulo3dToggleClick) precisa disso pra atualizar o GRUPO
// deles também, caso a seção esteja renderizada na mesma categoria
// (diferente de alternarCapaCategoria, que é por categoria — aqui um
// "irmão" desmarcado pode estar em QUALQUER categoria, inclusive a
// mesma que está aberta na tela agora).
async function alternarCapaModulo3d(item, moduleKey){
  const field = MODULO3D_CAPA_FIELD[moduleKey];
  const column = MODULO3D_CAPA_COLUMN[moduleKey];
  const novoValor = !item[field];
  const desmarcados = [];
  if(novoValor){
    const marcados = state.items.filter((outro) => String(outro.id) !== String(item.id) && outro[field]);
    for(const outro of marcados){
      const { error } = await supabase.from("itens").update({ [column]: false }).eq("id", outro.id);
      if(error) throw error;
      outro[field] = false;
      desmarcados.push(outro);
    }
  }
  const { error } = await supabase.from("itens").update({ [column]: novoValor }).eq("id", item.id);
  if(error) throw error;
  item[field] = novoValor;
  item.variantGroup?.forEach((variante) => { if(String(variante.id) === String(item.id)) variante[field] = novoValor; });
  return desmarcados;
}

async function handleCapaModulo3dToggleClick(item, moduleKey, button){
  button.disabled = true;
  try{
    const desmarcados = await alternarCapaModulo3d(item, moduleKey);
    const group = button.closest(".catalog-capa-modulo3d-group");
    if(group) group.outerHTML = capaModulo3dToggleMarkup(item);
    desmarcados.forEach((outro) => {
      const outroGroup = document.querySelector(`.catalog-product-section[data-product-id="${CSS.escape(String(outro.id))}"] .catalog-capa-modulo3d-group`);
      if(outroGroup) outroGroup.outerHTML = capaModulo3dToggleMarkup(outro);
    });
    const card = MODULO3D_CARDS.find((candidate) => candidate.key === moduleKey);
    notify({ title: item[MODULO3D_CAPA_FIELD[moduleKey]] ? `Definido como modelo do ${card?.label || "módulo"}` : `Modelo removido do ${card?.label || "módulo"}`, message: item.name, duration: 4000 });
  }catch(error){
    console.error("Erro ao definir modelo do Módulo 3D:", error);
    notify({ title: "Não foi possível salvar", message: "Tente novamente.", status: "error" });
    button.disabled = false;
  }
}

// Carregador do <model-viewer> — mesmo componente vendorizado
// (js/vendor/model-viewer) que a prévia 3D por item usava antes de ser
// removida desta tela (ver comentário sobre window.catalogLoadModelAsset
// mais abaixo: a infraestrutura de download/cache do .glb em si nunca
// saiu, só o CONSUMIDOR mudou de lugar — de "dentro de cada item" pra
// "só aqui, uma vez, pro modelo em destaque do mini-menu").
let modelViewerPromise = null;
function ensureModelViewer(){
  if(customElements.get("model-viewer")) return Promise.resolve();
  if(!modelViewerPromise){
    modelViewerPromise = import("../../../js/vendor/model-viewer/model-viewer.min.js")
      .catch((error) => { modelViewerPromise = null; throw error; });
  }
  return modelViewerPromise;
}

function supportsWebGL3D(){
  try{
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if(!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  }catch{
    return false;
  }
}

function isEconomyDevice3D(){
  const cores = Number(navigator.hardwareConcurrency) || 4;
  const memory = Number(navigator.deviceMemory) || 4;
  return cores <= 4 || memory <= 4 || matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Cards disponíveis (3D Livre, Composições) vs. o único "recurso futuro"
// que sobrou (Realidade aumentada, hoje só "Em desenvolvimento") — pedido
// explícito do usuário pro recurso futuro: precisa "parecer
// intencionalmente indisponível, não card quebrado ou incompleto" — sem
// NENHUM elemento clicável (nem <button>) e com `aria-disabled`.
//
// Layout (pedido explícito do usuário, 2ª rodada: "eu quero que fique igual
// a home, literalmente um 3d do lado do outro... esse 3d tem que ser
// grande"): copia o padrão dos cards de categoria da Home do catálogo
// (`.catalog-home-card`/`.catalog-home-grid`) — quadrado GRANDE, o
// próprio quadrado inteiro é o alvo do clique, só o título, sem descrição
// nem botão separado. Não reaproveita as classes da Home 1:1 (são
// DOM/hover distintos: aqui tem um <model-viewer> vivo), mas os
// tamanhos/proporções/tipografia foram calibrados pra ficarem visualmente
// equivalentes.

// Nome do módulo ESCRITO DENTRO do quadro (pedido explícito do usuário:
// "o nome do módulo embaixo está muito escondido... podíamos fazer
// igual a home, escrito dentro e quando passar o mouse dá aquele
// efeito") — "home" aqui é o Portal (rótulo "Home" no cabeçalho, ver
// MODULO3D_CAPA_FIELD acima e a seção "Botões Biblioteca/Painel 3D
// removidos..." no CLAUDE.md), mesmo tratamento visual de
// `.catalog-gateway-title` (letter-spacing "abrindo" no hover) — ver
// CSS. Subiu pro TOPO do quadro depois (pedido explícito: "quero subir
// o nome dos card mais pra cima do card pra ficar tipo um título mesmo")
// — deixou de ficar centralizado verticalmente, posição via CSS. Fica
// DENTRO do stage (não mais abaixo dele) pra sobreviver sozinho junto
// com qualquer troca de conteúdo do stage (ícone↔model-viewer↔erro), ver
// renderModulo3dModel().
function modulo3dCardNameMarkup(card){
  return `<span class="catalog-modulo3d-tile-name">${escapeHtml(card.title || card.label)}</span>`;
}

// O nome fica dentro de um wrapper (`.catalog-modulo3d-tile-caption`) que o
// posiciona perto do topo do quadro — ver posição/fonte em CSS.
function modulo3dCardOverlayMarkup(card){
  return `<div class="catalog-modulo3d-tile-caption">${modulo3dCardNameMarkup(card)}</div>`;
}

// 1ª pintura do stage, antes do JS montar o <model-viewer> — só o
// título+resumo sobre o fundo do quadro. Sem ícone de fallback nenhum
// (removido por completo: "aparece 3 ícones um em cada card, pode
// remover eles, são inúteis") — um card sem modelo marcado/`.glb` fica
// só com o fundo do quadro, nunca com um ícone genérico no lugar.
function modulo3dCardStageMarkup(card){
  return `<div class="catalog-modulo3d-tile-stage" data-modulo3d-stage="${escapeAttr(card.key)}">
    ${modulo3dCardOverlayMarkup(card)}
  </div>`;
}

function modulo3dCardMarkup(card){
  if(card.available){
    return `<button type="button" class="catalog-modulo3d-tile" data-modulo3d-card="${escapeAttr(card.key)}">
      ${modulo3dCardStageMarkup(card)}
    </button>`;
  }
  // Sem o selo "Em breve" que ficava embaixo do quadro — o próprio título
  // ("Em desenvolvimento") já diz isso, e o pedido foi "sem descrição em
  // baixo".
  return `<article class="catalog-modulo3d-tile catalog-modulo3d-tile-soon" aria-disabled="true">
    ${modulo3dCardStageMarkup(card)}
  </article>`;
}

// ---- Estado dos visualizadores vivos (só existe enquanto o mini-menu
// está na tela) — precisa ficar fora de `state` porque são referências a
// elementos que precisam ser desligados explicitamente ao sair da tela
// (ver modulo3dTeardownViewer), senão vazam contexto WebGL. Um ARRAY
// agora (não mais um único elemento) — até 3 <model-viewer> simultâneos,
// um por card.
let modulo3dViewerEls = [];

// Desliga tudo que não morre sozinho junto com o innerHTML (contexto
// WebGL de cada <model-viewer>) — chamada tanto ao navegar pra outra
// `view` quanto ao abrir um overlay (Estúdio/Biblioteca) por cima do
// mini-menu, nos dois casos o #catalogGrid só fica ESCONDIDO (não
// destruído), então sem isso os modelos continuariam renderizando atrás
// do Painel 3D aberto.
function modulo3dTeardownViewer(){
  modulo3dViewerEls.forEach((viewer) => viewer.remove());
  modulo3dViewerEls = [];
}

async function renderModulo3dModel(stage, featured, card){
  if(!stage) return;
  // Nome + resumo precisam ser reinseridos em CADA estado do stage
  // (sem modelo, model-viewer de verdade, erro) — stage.innerHTML=""
  // abaixo apaga tudo que já estava lá dentro, inclusive o que a 1ª
  // pintura já tinha desenhado (ver modulo3dCardStageMarkup()).
  const overlayMarkup = modulo3dCardOverlayMarkup(card);
  if(!featured?.glb || !supportsWebGL3D()){
    stage.innerHTML = overlayMarkup;
    return;
  }
  try{
    const [, modelUrl] = await Promise.all([ensureModelViewer(), loadModelAsset(featured.glb)]);
    if(!stage.isConnected) return;
    const viewer = document.createElement("model-viewer");
    viewer.src = modelUrl;
    viewer.alt = `Modelo 3D de ${featured.name}`;
    viewer.setAttribute("loading", "eager");
    viewer.setAttribute("reveal", "auto");
    // Sem camera-controls de propósito — é um preview pequeno e
    // decorativo dentro de um card clicável, não um visualizador
    // interativo (esse papel já é do Estúdio/Lounge, um clique de
    // distância). bounds="tight" enquadra pela geometria real do
    // modelo (não uma esfera genérica), 95% do raio de auto-
    // enquadramento deixa o móvel ocupando quase todo o quadradinho.
    viewer.setAttribute("bounds", "tight");
    viewer.setAttribute("camera-orbit", "auto auto 95%");
    if(!isEconomyDevice3D()) viewer.setAttribute("auto-rotate", "");
    viewer.setAttribute("auto-rotate-delay", "0");
    viewer.setAttribute("rotation-per-second", "16deg");
    viewer.setAttribute("shadow-intensity", isEconomyDevice3D() ? ".25" : ".6");
    viewer.setAttribute("shadow-softness", "1");
    viewer.setAttribute("exposure", "1.05");
    viewer.style.setProperty("--progress-bar-height", "0px");
    viewer.style.pointerEvents = "none";
    // Espera o <model-viewer> terminar de carregar DE VERDADE (evento
    // "load" — o modelo já parseado/pronto pra desenhar, não só o
    // download do .glb, que `loadModelAsset` acima já cobria sozinho) —
    // pedido explícito do usuário sobre o carregamento único da tela:
    // "no momento que o carregando chegar a 100 os módulos 3D já
    // precisam aparecer juntos e carregados já ao mesmo tempo, não pode
    // piscar". Sem esperar esse evento, o spinner podia sumir enquanto
    // o componente ainda estava internamente terminando de revelar o
    // modelo — reabrindo a mesma sensação de "um aparece, depois o
    // outro" que o carregamento único deveria evitar.
    const ready = new Promise((resolve) => {
      const settle = () => { viewer.removeEventListener("load", settle); resolve(); };
      viewer.addEventListener("load", settle, { once: true });
      viewer.addEventListener("error", () => { stage.innerHTML = overlayMarkup; settle(); }, { once: true });
    });
    stage.innerHTML = "";
    stage.appendChild(viewer);
    stage.insertAdjacentHTML("beforeend", overlayMarkup);
    modulo3dViewerEls.push(viewer);
    await ready;
    // 2 frames de folga pro navegador realmente PINTAR o 1º quadro do
    // modelo antes de considerar esse card "pronto" — evita revelar um
    // canvas ainda vazio no exato instante do evento "load".
    if(stage.isConnected) await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }catch(error){
    console.warn(`Não foi possível abrir o modelo 3D do card "${card.key}":`, error);
    stage.innerHTML = overlayMarkup;
  }
}

// Título editorial "Explore os recursos" com linhas finas dos dois lados
// (pedido explícito) + os 3 cards, na proporção sugerida (estúdio maior,
// os 2 recursos futuros menores) via CSS (.catalog-modulo3d-cards).
function modulo3dExploreMarkup(){
  return `<div class="catalog-modulo3d-explore">
    <div class="catalog-modulo3d-explore-title">
      <span class="catalog-modulo3d-explore-line" aria-hidden="true"></span>
      <h2>Explore os recursos</h2>
      <span class="catalog-modulo3d-explore-line" aria-hidden="true"></span>
    </div>
    <div class="catalog-modulo3d-cards">${MODULO3D_CARDS.map(modulo3dCardMarkup).join("")}</div>
  </div>`;
}

// Indicador de carregamento único (ver CSS, `.catalog-modulo3d-loading`)
// — cobre os 3 cards até TODOS os modelos resolverem juntos. Percentual
// REAL (0/33/67/100%, um degrau por card que termina de verdade), mesmo
// princípio já usado nas notificações "em andamento" do catálogo.
function modulo3dLoadingMarkup(){
  return `<div class="catalog-modulo3d-loading" aria-hidden="true">
    <span class="catalog-modulo3d-loading-ring" style="--pct:0"><span class="catalog-modulo3d-loading-pct">0%</span></span>
    <p>Carregando módulos…</p>
  </div>`;
}

function renderModulo3dMenu(){
  const grid = $("catalogGrid");
  grid.classList.add("catalog-products-static-mode");
  state.currentItems = [];
  state.currentHeading = "";
  state.sectionObserver?.disconnect();
  state.motionCleanup?.();
  state.activeSection = null;
  grid.innerHTML = `<div class="catalog-modulo3d-menu is-loading">${modulo3dExploreMarkup()}${modulo3dLoadingMarkup()}</div>`;
  $("catalogEmpty")?.classList.add("hidden");
  const menu = grid.querySelector(".catalog-modulo3d-menu");
  const ring = menu.querySelector(".catalog-modulo3d-loading-ring");
  const pctLabel = menu.querySelector(".catalog-modulo3d-loading-pct");
  // Pedido explícito do usuário: "quero que tenha um carregamento ali
  // antes de liberar a página, pra não acontecer de aparecer um 3d aí
  // depois o outro e depois o outro", reforçado depois: "no momento que
  // o carregando chegar a 100 os módulos 3D já precisam aparecer juntos
  // e carregados já ao mesmo tempo, não pode piscar" — os 3 cards ficam
  // escondidos atrás do anel de progresso até os 3 `renderModulo3dModel()`
  // resolverem (sucesso, erro ou sem modelo — a função já trata os 3
  // casos internamente e só resolve depois do <model-viewer> realmente
  // ter carregado/pintado, nunca rejeita), incrementando o percentual um
  // degrau por card que termina de verdade — só então a classe sai e os
  // 3 aparecem juntos, já prontos, no MESMO instante em que bate 100%.
  let settled = 0;
  const bumpProgress = () => {
    settled += 1;
    const pct = Math.round((settled / MODULO3D_CARDS.length) * 100);
    ring?.style.setProperty("--pct", pct);
    if(pctLabel) pctLabel.textContent = `${pct}%`;
  };
  const loads = MODULO3D_CARDS.map((card) => {
    const stage = grid.querySelector(`[data-modulo3d-stage="${CSS.escape(card.key)}"]`);
    return renderModulo3dModel(stage, modulo3dFeaturedItem(card.key), card).finally(bumpProgress);
  });
  Promise.all(loads).then(() => { menu?.classList.remove("is-loading"); });
}

// Ponto único de decisão do que desenhar em #catalogGrid: o Portal (3
// blocos), a Home (menu de categorias) ou os produtos da categoria ativa,
// no modo atual (imersivo/grade/mosaico). Usado por applyView() e
// sempre que a busca é limpa.
function renderCurrentView(){
  // Desliga o visualizador 3D do mini-menu (se estava vivo) antes de
  // desenhar qualquer outra coisa em #catalogGrid — mesmo raciocínio de
  // setActiveOverlay() acima, cobrindo o caminho "Home/categoria/Portal
  // de volta" em vez de "abrir overlay por cima".
  modulo3dTeardownViewer();
  if(state.activeView === GATEWAY_VIEW){
    renderGateway();
    return;
  }
  if(state.activeView === HOME_VIEW){
    renderHome();
    return;
  }
  if(state.activeView === FILTER_VIEW){
    // Restaurada pela linha do tempo depois de os filtros terem sido limpos: não sobra o que mostrar,
    // volta pra grade de categorias.
    if(!hasHomeFilters()){
      state.activeView = HOME_VIEW;
      renderHome();
      return;
    }
    renderProducts(filteredHomeItems(), "Resultados", null);
    return;
  }
  if(state.activeView === MODULO3D_MENU_VIEW){
    renderModulo3dMenu();
    return;
  }
  // categoryItems = TODOS os itens da categoria, sem o filtro de
  // subcategoria aplicado — precisa deles inteiros pra sempre listar
  // todas as subcategorias possíveis nos chips (não só as que sobraram
  // depois do filtro atual, senão escolher uma subcategoria faria as
  // outras "sumirem" do próprio filtro). `items` é quem realmente
  // desenha na tela.
  const categoryItems = itemsForView(state.activeView);
  const items = state.activeSubcat ? categoryItems.filter((item) => item.subcat === state.activeSubcat) : categoryItems;
  renderProducts(items, undefined, categoryItems);
}

// Filtro premium por subcategoria dentro de uma categoria (pedido
// explícito do usuário, com print da categoria "Estofados" cheia de
// produtos: "quero que apareça as subcategorias que tem dentro do
// cadastro itens, por exemplo, Clássicos, e quando eu selecionar ali só
// vai aparecer os móveis daquela subcategoria... um filtro premium").
// Só aparece quando a categoria tem PELO MENOS 2 subcategorias
// distintas cadastradas — com 0 ou 1, filtrar não ajudaria em nada
// (mostraria um chip só, sem nenhuma alternativa pra escolher).
function renderSubcatFilterBar(categoryItems){
  const seen = new Map();
  categoryItems.forEach((item) => {
    if(item.subcat && !seen.has(item.subcat)) seen.set(item.subcat, item.subcatLabel);
  });
  if(seen.size < 2) return "";
  const options = [...seen].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  const chip = (slug, label, active) =>
    `<button type="button" class="catalog-subcat-chip${active ? " is-active" : ""}" data-subcat-filter="${escapeAttr(slug)}" aria-pressed="${active}">${escapeHtml(label)}</button>`;
  return `<div class="catalog-subcat-filter">
    ${chip("", "Todos", !state.activeSubcat)}
    ${options.map(([slug, label]) => chip(slug, label, state.activeSubcat === slug)).join("")}
  </div>`;
}

// Card de um item (foto + nome + dimensões) — usado pela grade de uma categoria e pelos resultados dos
// filtros da tela "Categorias". Clicar nele: ver data-grid-item em bindInteractions.
// Cores disponíveis no card (pedido do usuário: "quero que apareça as cores que temos disponíveis quando tiver mais de
// uma cor do mesmo item, igual" ao da página do item) — mesmos círculos (.product-variant-swatch), mas como <span
// role="button">: o card inteiro já é um <button> e um botão não pode conter outro. Discretos de propósito (pedido: "ficou muito grande"): só a bolinha,
// sem o nome da cor embaixo — o nome fica no title/aria-label. Clicar numa cor troca a foto/nome/
// medidas DO PRÓPRIO CARD (selectGridVariant) sem abrir o item; o card passa a abrir aquela cor.
function gridSwatchesMarkup(item){
  const grupo = item.variantGroup;
  if(!grupo || grupo.length < 2) return "";
  return `<span class="catalog-grid-swatches" role="group" aria-label="Cores disponíveis">${grupo.map((variante) => {
    const rotulo = variantLabel(variante);
    const ativa = String(variante.id) === String(item.id);
    return `<span role="button" tabindex="0" class="product-variant-swatch${ativa ? " active" : ""}" data-grid-variant="${escapeAttr(variante.id)}" title="${escapeAttr(rotulo)}" aria-label="${escapeAttr(rotulo)}" aria-pressed="${ativa}"><span class="product-variant-swatch-photo"><img src="${escapeAttr(otimizarFoto(variante.photo, IMG_WIDTH.swatch))}" alt="" loading="lazy" decoding="async"></span></span>`;
  }).join("")}</span>`;
}

function selectGridVariant(card, variante){
  card.dataset.gridItem = String(variante.id);
  const img = card.querySelector(".catalog-grid-card-photo > img");
  if(img){ img.src = otimizarFoto(variante.photo, IMG_WIDTH.card); img.alt = variante.name; }
  const nome = card.querySelector(".catalog-grid-card-name");
  if(nome) nome.textContent = variante.name;
  const dims = card.querySelector(".catalog-grid-card-dims");
  if(dims && variante.dims) dims.textContent = `Dimensões: ${variante.dims}`;
  card.querySelectorAll("[data-grid-variant]").forEach((swatch) => {
    const ativa = swatch.dataset.gridVariant === String(variante.id);
    swatch.classList.toggle("active", ativa);
    swatch.setAttribute("aria-pressed", String(ativa));
  });
  // O "＋ Adicionar ao projeto" do card passa a adicionar a cor que está na tela.
  const chip = card.querySelector("[data-projeto-add]");
  if(chip) chip.dataset.projetoAdd = String(variante.id);
  atualizarBotoesProjeto(card);
}

function gridCardMarkup(item){
  return `
      <button type="button" class="catalog-grid-card" data-grid-item="${escapeAttr(item.id)}">
        <span class="catalog-grid-card-photo"><img src="${escapeAttr(otimizarFoto(item.photo, IMG_WIDTH.card))}" alt="${escapeAttr(item.name)}" loading="lazy" decoding="async">${projetoAddMarkup(item.id)}</span>
        <span class="catalog-grid-card-body">
          <span class="catalog-grid-card-name">${escapeHtml(item.name)}</span>
          ${item.dims ? `<span class="catalog-grid-card-dims">Dimensões: ${escapeHtml(item.dims)}</span>` : ""}
          ${gridSwatchesMarkup(item)}
        </span>
      </button>`;
}

// Card da visualização em grade de produtos (pedido explícito do usuário):
// só foto do produto + nome + dimensões, agrupados sob o nome da categoria
// ativa — sem fotos ambientadas/de evento, sem painel técnico, sem galeria
// de detalhe. Clicar num card abre o produto na visualização imersiva (ver
// data-grid-item em bindInteractions). `categoryItems` (opcional, só
// presente na navegação normal por categoria — a busca não passa) é a
// base do filtro de subcategoria; sem ela, a barra de chips não aparece.
function renderGridMarkup(items, heading, categoryItems){
  // Título só aparece quando é DIFERENTE do nome da categoria ativa —
  // caso da busca ("Resultados da busca", não mostrado em lugar nenhum
  // do cabeçalho). O nome da categoria em si (heading === currentViewLabel())
  // já está no rótulo do cabeçalho (#catalogPageLabel) — mostrar de novo
  // aqui embaixo foi removido a pedido do usuário: "como o nome está no
  // menu, o que está embaixo pode remover pra não ficar duplicado"
  // (reportado com print mostrando "BIBLIOTECA" repetida — mesma lógica
  // vale pro nome da categoria aqui).
  const showHeading = heading && heading !== currentViewLabel();
  const subcatBar = categoryItems ? renderSubcatFilterBar(categoryItems) : "";
  if(!items.length && !subcatBar) return "";
  return `<div class="catalog-grid-wrap">
    ${showHeading ? `<h2 class="catalog-grid-heading">${escapeHtml(heading)}</h2>` : ""}
    ${subcatBar}
    ${items.length ? `<div class="catalog-grid">${items.map(gridCardMarkup).join("")}</div>` : `<p class="catalog-subcat-empty">Nenhum item nessa subcategoria.</p>`}
  </div>`;
}

// Visualização "mosaico" (pedido explícito do usuário, com print de um
// moodboard de referência: "eu quero que tenha mais um estilo de
// visualização que é assim tudo junto, meio que bagunçado mesmo, sem o
// nome do item, o nome e as informações só aparecem quando a gente passa
// o mouse por cima dele"). Terceiro modo ao lado de grade/imersivo — as
// fotos entram numa grade de colunas em `columns` (CSS puro, sem JS de
// posicionamento): cada foto mantém a PRÓPRIA proporção natural
// (`width:100%;height:auto`, sem cortar/espremer em nenhum quadrado
// fixo), então itens com formatos bem diferentes (um banco baixo e
// largo, uma mesinha alta e estreita) já criam sozinhos o efeito
// "bagunçado"/moodboard do print, sem precisar de posicionamento
// aleatório calculado à mão. Nome/dimensões ficam num overlay
// (`.catalog-mosaic-info`) com opacity:0 em repouso, revelado só no
// hover/foco — mesmo mecanismo de fade já usado em outros lugares do
// catálogo (ex. escurecer da foto ambientada do item).
function renderMosaicMarkup(items, heading, categoryItems){
  const showHeading = heading && heading !== currentViewLabel();
  const subcatBar = categoryItems ? renderSubcatFilterBar(categoryItems) : "";
  if(!items.length && !subcatBar) return "";
  return `<div class="catalog-grid-wrap">
    ${showHeading ? `<h2 class="catalog-grid-heading">${escapeHtml(heading)}</h2>` : ""}
    ${subcatBar}
    ${items.length ? `<div class="catalog-mosaic">${items.map((item) => `
      <button type="button" class="catalog-mosaic-tile" data-grid-item="${escapeAttr(item.id)}">
        <img src="${escapeAttr(otimizarFoto(item.photo, IMG_WIDTH.mosaic))}" alt="${escapeAttr(item.name)}" loading="lazy" decoding="async">
        ${projetoAddMarkup(item.id)}
        <span class="catalog-mosaic-info">
          <span class="catalog-mosaic-name">${escapeHtml(item.name)}</span>
          ${item.dims ? `<span class="catalog-mosaic-dims">${escapeHtml(item.dims)}</span>` : ""}
        </span>
      </button>`).join("")}
    </div>` : `<p class="catalog-subcat-empty">Nenhum item nessa subcategoria.</p>`}
  </div>`;
}

function renderProducts(items, heading, categoryItems){
  // Prioriza itens com foto, preservando a ordem atual dentro de cada grupo.
  items = [...items].sort((a, b) =>
    Number(Boolean(b.photo && b.photo !== FOTO_PLACEHOLDER)) -
    Number(Boolean(a.photo && a.photo !== FOTO_PLACEHOLDER))
  );
  const grid = $("catalogGrid");
  state.currentItems = items;
  state.currentHeading = heading ?? currentViewLabel();
  // undefined = "não mexe" (setViewMode/openImmersiveFromGrid só
  // re-renderizam o que já estava, sem recalcular a categoria inteira de
  // novo) — categoria de verdade passa um array, busca passa `null`
  // explícito (sem barra de subcategoria nos resultados de busca).
  if(categoryItems !== undefined) state.currentCategoryItems = categoryItems;
  // "static" cobre tanto grade quanto mosaico — as duas são visualizações
  // paradas (sem scroll-snap de tela cheia nem observers de seção), só o
  // CARTÃO de cada item muda entre elas.
  grid.classList.toggle("catalog-products-static-mode", state.viewMode !== "immersive");
  if(state.viewMode !== "immersive"){
    // Observers/animação de scroll são só da visualização imersiva —
    // desconecta antes de trocar o conteúdo pra não vazar, apontando pra
    // seções que não existem mais nesse modo.
    state.sectionObserver?.disconnect();
    state.motionCleanup?.();
    state.activeSection = null;
    grid.innerHTML = state.viewMode === "grid"
      ? renderGridMarkup(items, state.currentHeading, state.currentCategoryItems)
      : renderMosaicMarkup(items, state.currentHeading, state.currentCategoryItems);
    // Checa o HTML de verdade, não só items.length: um filtro de
    // subcategoria pode zerar os itens da tela sem a categoria estar
    // vazia (a barra de chips continua lá, só a mensagem embaixo muda) —
    // nesse caso #catalogEmpty (a mensagem genérica de catálogo vazio)
    // continua escondido, quem explica a ausência é o texto dentro do
    // próprio .catalog-grid-wrap.
    $("catalogEmpty")?.classList.toggle("hidden", grid.innerHTML.trim() !== "");
    return;
  }
  grid.innerHTML = items.map((item, index) => productTemplate(item, index, items.length)).join("");
  $("catalogEmpty")?.classList.toggle("hidden", items.length > 0);
  // Cada troca de categoria substitui o conteúdo de #catalogGrid inteiro —
  // os observers antigos (setupObservers) ficam apontando pra elementos
  // que não existem mais, então precisam ser recriados aqui.
  setupObservers();
  requestAnimationFrame(() => grid.querySelector(".catalog-product-section")?.classList.add("is-visible"));
}

// Escolhe a visualização diretamente (imersiva ou grade) — pedido
// explícito do usuário, depois de ver o ícone único (que ALTERNAVA entre
// os dois) espremido ao lado do nome da categoria no cabeçalho: "quero
// colocar no canto direito da tela, logo abaixo do menu... quero que
// tenha um ícone pra cada tipo de visualização... no caso de hoje
// precisa ter 2 ícones ali" — um botão por modo, não mais um botão só
// que alterna. Ver #catalogViewSwitcher (catalogo.html) e a chamada em
// bindInteractions().
function setViewMode(mode){
  if(state.viewMode === mode) return;
  state.viewMode = mode;
  updateViewToggleButton();
  renderProducts(state.currentItems, state.currentHeading);
  window.scrollTo({ top: 0, behavior: "instant" });
}

function updateViewToggleButton(){
  const switcher = $("catalogViewSwitcher");
  if(!switcher) return;
  switcher.querySelectorAll("[data-view-mode]").forEach((button) => {
    const active = button.dataset.viewMode === state.viewMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

// Clique num card da grade: mostra o mesmo produto na visualização
// imersiva, dentro do mesmo conjunto de itens que já estava na grade
// (categoria ou resultado de busca — ver state.currentItems).
// A seção imersiva de um grupo de cores é desenhada com o id do item "principal"; abrir uma cor que não é a principal
// = abrir a seção e trocar pra ela (a mesma troca dos círculos da página do item).
// Síncrono, logo depois de desenhar as seções (antes de qualquer quadro pintado) — a troca não aparece como um pisca da cor
// principal. Devolve a seção pra rolar até ela no quadro seguinte.
function showItemSection(item){
  const principal = state.items.find((candidato) => String(candidato.id) === String(item.id) || candidato.variantGroup?.some((v) => String(v.id) === String(item.id))) || item;
  const section = document.getElementById(`produto-${principal.id}`);
  if(section && String(principal.id) !== String(item.id)) applyVariant(section, item);
  return section;
}

function openImmersiveFromGrid(item){
  if(state.viewMode !== "immersive"){
    state.viewMode = "immersive";
    updateViewToggleButton();
  }
  renderProducts(state.currentItems, state.currentHeading);
  const section = showItemSection(item);
  requestAnimationFrame(() => section?.scrollIntoView({ behavior: "instant", block: "start" }));
}

function scrollToIndex(index){
  document.querySelectorAll(".catalog-product-section")[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindInteractions(){
  $("catalogViewSwitcher")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view-mode]");
    if(button) setViewMode(button.dataset.viewMode);
  });

  // Marcar/desmarcar um valor num filtro da tela "Categorias" — o painel continua aberto pra marcar outros.
  $("catalogGrid").addEventListener("change", (event) => {
    const option = event.target.closest("[data-home-filter-option]");
    if(!option) return;
    const selected = state.homeFilters[option.dataset.homeFilterOption];
    if(option.checked) selected.add(option.value); else selected.delete(option.value);
    refreshHomeFilters();
  });
  // Painel de filtro aberto fecha clicando fora dele e com Esc (o foco volta pro botão que o abriu).
  document.addEventListener("click", (event) => {
    if(state.homeFilterOpen && !event.target.closest("[data-home-filter-field]")) setHomeFilterOpen("");
  });
  document.addEventListener("keydown", (event) => {
    if(event.key !== "Escape" || !state.homeFilterOpen) return;
    const trigger = document.querySelector(`[data-home-filter-trigger="${state.homeFilterOpen}"]`);
    setHomeFilterOpen("");
    trigger?.focus();
  });

  $("catalogGrid").addEventListener("click", (event) => {
    // Clique dentro do "Trocar foto" (label/input) não deve navegar — só
    // o clique fora dele, no resto do bloco, abre o destino.
    if(event.target.closest("[data-gateway-edit]")) return;
    const gatewayAdjust = event.target.closest("[data-gateway-adjust]");
    if(gatewayAdjust){
      startInlineEditForGateway(gatewayAdjust.dataset.gatewayAdjust);
      return;
    }
    const gatewayTile = event.target.closest("[data-gateway-tile]");
    if(gatewayTile){
      activateGatewayTile(gatewayTile.dataset.gatewayTile);
      return;
    }
    const modulo3dCard = event.target.closest("[data-modulo3d-card]");
    if(modulo3dCard){
      activateModulo3dCard(modulo3dCard.dataset.modulo3dCard);
      return;
    }
    // Filtros da tela "Categorias" (ver HOME_FILTER_FIELDS).
    const filterTrigger = event.target.closest("[data-home-filter-trigger]");
    if(filterTrigger){
      const key = filterTrigger.dataset.homeFilterTrigger;
      setHomeFilterOpen(state.homeFilterOpen === key ? "" : key);
      return;
    }
    const filterToggle = event.target.closest("[data-home-filter-toggle]");
    if(filterToggle){
      state.homeFilters.personalizable = !state.homeFilters.personalizable;
      refreshHomeFilters();
      return;
    }
    if(event.target.closest("[data-home-filter-clear]")){
      clearHomeFilters();
      return;
    }
    const gridVariant = event.target.closest("[data-grid-variant]");
    if(gridVariant){
      const variante = findItemById(gridVariant.dataset.gridVariant);
      const card = gridVariant.closest(".catalog-grid-card");
      if(variante && card) selectGridVariant(card, variante);
      return;
    }
    const gridCard = event.target.closest("[data-grid-item]");
    if(gridCard){
      const item = findItemById(gridCard.dataset.gridItem);
      if(!item) return;
      // Card dos resultados filtrados: abre o item dentro da LISTA FILTRADA (rolar pro próximo item continua
      // nos itens filtrados), como uma tela nova na linha do tempo — não a categoria inteira.
      if(state.activeView === HOME_VIEW && hasHomeFilters()) applyView(FILTER_VIEW, { focusItemId: item.id });
      else openImmersiveFromGrid(item);
      return;
    }
    const subcatFilter = event.target.closest("[data-subcat-filter]");
    if(subcatFilter){
      state.activeSubcat = subcatFilter.dataset.subcatFilter;
      renderCurrentView();
      return;
    }
    const homeCard = event.target.closest("[data-home-category]");
    if(homeCard){
      applyView(homeCard.dataset.homeCategory);
      return;
    }
    const step = event.target.closest("[data-step]");
    if(step && !step.disabled){
      const section = step.closest(".catalog-product-section");
      const sections = [...document.querySelectorAll(".catalog-product-section")];
      scrollToIndex(sections.indexOf(section) + Number(step.dataset.step));
      return;
    }
    const category = event.target.closest("[data-category-target]");
    if(category){
      applyView(category.dataset.categoryTarget);
      return;
    }
    const inlineEditTrigger = event.target.closest("[data-inline-edit]");
    if(inlineEditTrigger){
      const section = inlineEditTrigger.closest(".catalog-product-section");
      const item = findItemById(section?.dataset.productId);
      if(item && section) startInlineEdit(section, item, inlineEditTrigger.dataset.inlineEdit);
      return;
    }
    const cropZoomIn = event.target.closest("[data-crop-zoom-in]");
    if(cropZoomIn){ cropZoom(1); return; }
    const cropZoomOut = event.target.closest("[data-crop-zoom-out]");
    if(cropZoomOut){ cropZoom(-1); return; }
    const cropCancel = event.target.closest("[data-crop-cancel]");
    if(cropCancel){ cancelInlineEdit(); return; }
    const cropApply = event.target.closest("[data-crop-apply]");
    if(cropApply){ applyInlineEdit(); return; }
    const cropRemove = event.target.closest("[data-crop-remove]");
    if(cropRemove){ removeCropSlot(); return; }
    const capaToggle = event.target.closest("[data-capa-toggle]");
    if(capaToggle){
      const section = capaToggle.closest(".catalog-product-section");
      const item = findItemById(section?.dataset.productId);
      if(item) handleCapaToggleClick(item, capaToggle);
      return;
    }
    const capaModulo3dToggle = event.target.closest("[data-capa-modulo3d-toggle]");
    if(capaModulo3dToggle){
      const section = capaModulo3dToggle.closest(".catalog-product-section");
      const item = findItemById(section?.dataset.productId);
      if(item) handleCapaModulo3dToggleClick(item, capaModulo3dToggle.dataset.capaModulo3dToggle, capaModulo3dToggle);
      return;
    }
    // Setas do carrossel da foto principal (pedido explícito do usuário:
    // "uma seta esmaecida premium onde a pessoa troque a foto no próprio
    // local da foto principal") — navega entre principal/detalhes sem
    // sair do lugar da foto grande. Ver stepMainSlide()/mainSlides().
    const mainNav = event.target.closest("[data-main-nav]");
    if(mainNav){
      const section = mainNav.closest(".catalog-product-section");
      const item = findItemById(section?.dataset.productId);
      if(item && section) stepMainSlide(section, item, mainNav.dataset.mainNav === "next" ? 1 : -1);
      return;
    }
    // Clicar na própria foto (principal/detalhe no carrossel, ou a
    // ambientada) abre o visualizador de zoom em resolução bem maior —
    // pedido explícito do usuário depois de saber que a exibição normal
    // usa uma versão reduzida pra carregar rápido ("eu quero que a
    // pessoa possa dar zoom e de fato ver os detalhes"). `data-original-
    // src` é sempre a URL crua (nunca a já otimizada que está no `src`
    // hoje em tela) — ver mainSlides()/rotateActiveEvent(). Badge de
    // edição e setas de navegação são elementos IRMÃOS da foto (não
    // filhos), então cliques neles nunca alcançam este `closest`.
    const zoomableMain = event.target.closest(".product-main-image");
    if(zoomableMain){
      if(!zoomableMain.classList.contains("is-empty-slide")) openPhotoZoom(zoomableMain.dataset.originalSrc, zoomableMain.alt, zoomableMain.currentSrc || zoomableMain.src, zoomGalleryForMainImage(zoomableMain));
      return;
    }
    // Setas e pausar da foto ambientada — botões irmãos da foto, nunca alcançam o zoom.
    const eventNav = event.target.closest("[data-event-nav]");
    if(eventNav){
      const section = eventNav.closest(".catalog-product-section");
      if(section) stepEvent(section, eventNav.dataset.eventNav === "next" ? 1 : -1, { manual: true });
      startEventRotation();   // recomeça os 10s: a troca automática não dispara logo depois de um clique
      return;
    }
    if(event.target.closest("[data-event-pause]")){
      state.eventPaused = !state.eventPaused;
      syncEventPauseButtons();
      if(!state.eventPaused) startEventRotation();
      return;
    }
    const zoomableEvent = event.target.closest(".product-event-image");
    if(zoomableEvent){
      openPhotoZoom(zoomableEvent.dataset.originalSrc, zoomableEvent.alt, zoomableEvent.currentSrc || zoomableEvent.src, zoomGalleryForEventImage(zoomableEvent));
      return;
    }
    // Sugestão de combinação (ver relatedItemsMarkup()) — item sempre da
    // MESMA categoria do que está aberto, então a seção dele já está
    // renderizada na imersiva (categoria inteira no DOM de uma vez); só
    // precisa rolar até ela, mesmo padrão de scrollToIndex().
    const relatedItem = event.target.closest("[data-related-item]");
    if(relatedItem){
      document.getElementById(`produto-${relatedItem.dataset.relatedItem}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const customizeButton = event.target.closest("[data-customize-item]");
    if(customizeButton){
      const item = findItemById(customizeButton.dataset.customizeItem);
      if(item) openCustomizeDialog(item);
      return;
    }
    const variantSwatch = event.target.closest("[data-variant-id]");
    if(variantSwatch){
      const section = variantSwatch.closest(".catalog-product-section");
      const current = findItemById(section?.dataset.productId);
      const variante = current?.variantGroup?.find((candidate) => String(candidate.id) === variantSwatch.dataset.variantId);
      if(variante && section) applyVariant(section, variante);
      return;
    }
  });

  // Clicar na logo leva pro Portal (as 3 fotos — Catálogo/Biblioteca/
  // Módulo 3D) de qualquer lugar do catálogo — mesma ideia de "clicar na
  // logo volta pro início", só que o início agora é o Portal, não mais a
  // Home de categorias direto (ver GATEWAY_VIEW). O <a> mantém
  // href="#catalogGrid" como fallback (funciona mesmo sem JS), mas o
  // clique normal é interceptado pra navegar de verdade em vez de só
  // rolar a página.
  document.querySelector(".catalog-brand")?.addEventListener("click", (event) => {
    event.preventDefault();
    applyView(GATEWAY_VIEW);
  });

  $("catalogGrid").addEventListener("keydown", (event) => {
    if(event.key === "Escape" && cropSession){
      cancelInlineEdit();
      return;
    }
    if(event.key !== "Enter" && event.key !== " ") return;
    const gridVariantKey = event.target.closest("[data-grid-variant]");
    if(gridVariantKey){ event.preventDefault(); gridVariantKey.click(); return; }
    const inlineEditTrigger = event.target.closest("[data-inline-edit]");
    if(inlineEditTrigger){
      event.preventDefault();
      const section = inlineEditTrigger.closest(".catalog-product-section");
      const item = findItemById(section?.dataset.productId);
      if(item && section) startInlineEdit(section, item, inlineEditTrigger.dataset.inlineEdit);
      return;
    }
    const gatewayTile = event.target.closest("[data-gateway-tile]");
    if(!gatewayTile || event.target.closest("[data-gateway-edit]")) return;
    event.preventDefault();
    activateGatewayTile(gatewayTile.dataset.gatewayTile);
  });

  $("catalogGrid").addEventListener("change", async (event) => {
    const gatewayFileInput = event.target.closest("[data-gateway-file]");
    if(gatewayFileInput){
      const file = gatewayFileInput.files?.[0];
      gatewayFileInput.value = "";
      if(file) trocarCapaGateway(gatewayFileInput.dataset.gatewayFile, file);
      return;
    }
    const cropSwapInput = event.target.closest("[data-crop-swap]");
    if(cropSwapInput){
      const file = cropSwapInput.files?.[0];
      cropSwapInput.value = "";
      if(!file || !cropSession) return;
      if(!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024){
        notify({ title: "Arquivo inválido", message: "Envie uma imagem PNG, JPG ou WebP de até 15 MB.", status: "error" });
        return;
      }
      try{
        await setCropSource(file);
      }catch(error){
        console.error("Erro ao abrir a foto escolhida:", error);
        notify({ title: "Não foi possível abrir essa foto", message: "Tente novamente.", status: "error" });
      }
    }
  });

  $("catalogSearch")?.addEventListener("input", (event) => {
    const query = normalizeSearch(event.target.value.trim());
    // Busca precisa varrer TODAS as categorias, não só a view ativa: como
    // só a categoria atual (ou a Home) fica no DOM por vez (ver
    // itemsForView/applyView, pedido explícito de performance), filtrar
    // apenas as seções já renderizadas fazia a busca "não achar" um item
    // que existe mas está numa categoria diferente da aberta no momento.
    // Corrigido re-renderizando a partir de `state.items` inteiro quando
    // há busca. Query vazia volta pra o que estava ativo (Home incluída).
    if(!query){
      renderCurrentView();
      syncNavigation();
      return;
    }
    const matches = state.items.filter((item) =>
      normalizeSearch(`${item.name} ${item.catLabel || ""}`).includes(query)
    );
    // `null` explícito (não `undefined`) pra LIMPAR a barra de filtro de
    // subcategoria de uma categoria anterior — resultado de busca mistura
    // categorias diferentes, filtrar por subcategoria de uma só não faria
    // sentido aqui.
    renderProducts(matches, "Resultados da busca", null);
  });
}

function bindCatalogSession(){
  $("catalogLogout")?.addEventListener("click", () => {
    sessionStorage.removeItem("catalogo_token");
    location.reload();
  });
}

function fileToDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function flattenImageOnCatalogBackground(src){
  try{
    const response = await fetch(src);
    if(!response.ok) return src;
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return canvas.toDataURL("image/png");
  }catch(error){
    console.warn("Não foi possível consolidar o fundo do catálogo:", error);
    return src;
  }
}

function openCustomizeDialog(item){
  if(state.fabricGenerating){
    $("catalogCustomizeDialog").showModal();
    return;
  }
  state.customizeItem = item;
  state.fabricDataUrl = "";
  state.fabricFile = null;
  // Só a PRÉVIA visível no diálogo é otimizada — o valor bruto de
  // item.photo continua sendo mandado como referência pra IA em
  // generateFabricVariation() (scene.preview), lido direto do objeto do
  // item, nunca desta <img>.
  $("catalogCustomizeProduct").src = otimizarFoto(item.customizedPhoto || item.photo, IMG_WIDTH.card);
  $("catalogCustomizeProduct").alt = item.name;
  $("catalogFabricPreview").src = "";
  $("catalogFabricPreview").classList.add("hidden");
  $("catalogFabricUpload").classList.remove("has-fabric");
  $("catalogFabricInput").value = "";
  $("catalogCustomizeGenerate").disabled = true;
  $("catalogCustomizeStatus").textContent = "";
  $("catalogCustomizeDialog").showModal();
  window.CatalogCredits.prepareFabric();
}

async function generateFabricVariation(){
  const item = state.customizeItem;
  if(state.fabricGenerating || !item || !state.fabricDataUrl || !state.fabricFile) return;
  state.fabricGenerating = true;
  const fabricReference = state.fabricDataUrl;
  const button = $("catalogCustomizeGenerate");
  button.disabled = true;
  button.textContent = "Criando sua versão…";
  $("catalogFabricInput").disabled = true;
  $("catalogAiLoading").classList.remove("hidden");
  $("catalogCustomizeStatus").textContent = "Aplicando o tecido. A geração pode levar cerca de 2 minutos. Você pode fechar esta janela e continuar navegando.";
  // Pedido explícito do usuário: ao mandar aplicar, o diálogo fecha
  // sozinho (em vez de ficar parado mostrando "Criando sua versão…") —
  // a notificação no canto da tela (abaixo) é quem avisa do andamento e
  // do resultado. Reabrir "SOB MEDIDA" enquanto ainda gera continua
  // funcionando (openCustomizeDialog() já tem esse caminho).
  $("catalogCustomizeDialog").close();
  const workingToast = notify({ title: "Personalização em andamento", message: `${item.name} está recebendo o novo tecido. Você pode continuar navegando.`, status: "working", duration: 0 });
  try{
    const empresaId = state.catalogSession.empresa_id;
    const { data, error } = await window.CatalogCredits.invoke("studio-ai-engine", {
      body: {
        empresa_id: empresaId,
        catalog_token: state.catalogSession.token,
        prompt: `Edite exclusivamente o revestimento têxtil do móvel da primeira imagem, aplicando com alta fidelidade o tecido fornecido na segunda imagem. Preserve absolutamente o mesmo ${item.name}: geometria, desenho, estrutura, junco, madeira, metal, pés, costuras, almofadas, volumes, perspectiva, enquadramento, iluminação, sombras e resolução. O fundo deve ser liso, uniforme e totalmente opaco no branco puro exato do catálogo #FFFFFF, sem cenário, textura, gradiente, preto ou transparência. O contorno do móvel deve permanecer limpo, natural e sem halos. Não redesenhe o móvel, não altere cores de partes não estofadas e não modifique o ambiente. A textura deve acompanhar dobras, costuras e direção real do tecido.`,
        scene: {
          referencePolicy: "fabric_customization",
          fabricReference,
          preview: item.photo,
          objects: [{ itemId: item.id, itemName: "Amostra de tecido", itemImage: fabricReference }],
          options: { formato: { largura: 1536, altura: 1024 }, convidados: "Sem convidados", ambientacao: [] },
        },
        provider: "openai", versions: 1,
      },
    });
    if(error){
      let payload;
      try { payload = await error.context?.json(); } catch { /* Resposta sem JSON. */ }
      throw new Error(payload?.details || payload?.erro || payload?.error?.message || error.message);
    }
    if(data?.providerStatus !== "ok"){
      const providerMessage = data?.error?.message || data?.error?.error?.message || data?.erro;
      throw new Error(providerMessage || "O Studio IA não conseguiu processar as imagens.");
    }
    const result = data?.images?.[0];
    const rawSrc = result?.base64
      ? (String(result.base64).startsWith("data:") ? result.base64 : `data:image/png;base64,${result.base64}`)
      : result?.url;
    if(!rawSrc) throw new Error(data?.erro || data?.error?.message || "A IA não retornou a imagem.");
    const src = await flattenImageOnCatalogBackground(rawSrc);
    item.customizedPhoto = src;
    $("catalogCustomizeProduct").src = src;
    $("catalogCustomizeStatus").textContent = "Tecido aplicado. A imagem acima e a foto do catálogo foram atualizadas.";
    const section = document.querySelector(`.catalog-product-section[data-product-id="${CSS.escape(String(item.id))}"]`);
    const image = section?.querySelector(".product-main-image");
    if(image){
      image.src = src;
      image.alt = `${item.name} com tecido personalizado`;
      image.classList.remove("hidden");
    }
    workingToast.update({
      status: "done",
      title: "Sua personalização ficou pronta",
      message: `${item.name} já está com o novo tecido.`,
      image: src,
      actionLabel: "Ver resultado",
      duration: 12000,
      onAction: () => openFabricResultPreview(item, src),
    });
  }catch(error){
    console.error("Erro ao personalizar tecido:", error);
    const rawDetail = String(error?.message || "").trim();
    const detail = /billing hard limit|billing limit|quota/i.test(rawDetail)
      ? "O limite de uso da IA foi atingido. Regularize o faturamento da API para continuar."
      : rawDetail;
    $("catalogCustomizeStatus").textContent = detail || "Não foi possível aplicar o tecido. Tente novamente.";
    workingToast.update({ status: "error", title: "Personalização não concluída", message: detail || "Não foi possível gerar esta versão. Tente novamente.", actionLabel: "", onAction: null, image: "", duration: 12000 });
  }finally{
    state.fabricGenerating = false;
    $("catalogFabricInput").disabled = false;
    $("catalogAiLoading").classList.add("hidden");
    button.disabled = false;
    button.textContent = "Aplicar tecido com IA";
    window.CatalogCredits.syncFabric();
  }
}

// Pedido explícito do usuário: clicar em "Ver resultado" na notificação
// não deve reabrir o diálogo inteiro de "Experimente seu tecido" (com
// upload/dropzone/botão de aplicar, que não fazem sentido pra só OLHAR o
// que já foi gerado) — abre uma prévia minimalista, só a foto grande +
// um link de baixar (mesmo padrão do resultado do Painel 3D).
function openFabricResultPreview(item, src){
  $("catalogFabricResultImage").src = src;
  $("catalogFabricResultImage").alt = `${item.name} com tecido personalizado`;
  $("catalogFabricResultTitle").textContent = item.name;
  const download = $("catalogFabricResultDownload");
  download.href = src;
  download.download = `${slugify(item.name)}-tecido-personalizado.png`;
  $("catalogFabricResultDialog").showModal();
}

function bindCustomization(){
  $("catalogCustomizeClose")?.addEventListener("click", () => $("catalogCustomizeDialog").close());
  $("catalogFabricResultClose")?.addEventListener("click", () => $("catalogFabricResultDialog").close());
  $("catalogFabricInput")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if(!file) return;
    if(!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024){
      state.fabricDataUrl = "";
      state.fabricFile = null;
      $("catalogCustomizeGenerate").disabled = true;
      $("catalogCustomizeStatus").textContent = "Envie uma imagem PNG, JPG ou WebP de até 15 MB.";
      event.target.value = "";
      return;
    }
    state.fabricDataUrl = await fileToDataUrl(file);
    state.fabricFile = file;
    $("catalogFabricPreview").src = state.fabricDataUrl;
    $("catalogFabricPreview").classList.remove("hidden");
    $("catalogFabricUpload").classList.add("has-fabric");
    $("catalogCustomizeGenerate").disabled = false;
    $("catalogCustomizeStatus").textContent = "Tecido pronto para aplicação.";
    window.CatalogCredits.syncFabric();
  });
  $("catalogCustomizeGenerate")?.addEventListener("click", generateFabricVariation);
}

// Visualizador de zoom da foto (pedido explícito do usuário, depois de
// perguntar sobre a otimização de carregamento: "eu quero que a pessoa
// possa dar zoom e de fato ver os detalhes" — servir uma versão menor
// pra deixar o catálogo rápido não podia significar nunca dar pra ver
// textura/acabamento de perto). Clicar na foto principal ou na
// ambientada (dentro da visualização imersiva, ver bindInteractions())
// abre este diálogo em tela cheia com a MESMA foto em IMG_WIDTH.zoom —
// carregada só nesse clique, nunca pré-carregada, então não pesa a
// navegação normal que a otimização de leitura resolveu.
const photoZoom = { scale: 1, x: 0, y: 0, dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 };
const PHOTO_ZOOM_MIN = 1;
const PHOTO_ZOOM_MAX = 4;
const PHOTO_ZOOM_STEP = 0.6;
const PHOTO_SWIPE_MIN = 90;

function applyPhotoZoomTransform(){
  $("catalogPhotoZoomImage").style.transform = `translate(${photoZoom.x}px, ${photoZoom.y}px) scale(${photoZoom.scale})`;
}

function resetPhotoZoom(){
  photoZoom.scale = 1;
  photoZoom.x = 0;
  photoZoom.y = 0;
  applyPhotoZoomTransform();
}

// `src` é sempre a URL CRUA (data-original-src do elemento clicado, não
// o src já otimizado que está na tela) — só aqui, no momento de abrir o
// zoom, é que pedimos a versão grande; o resto do catálogo continua
// pedindo a versão pequena o tempo todo.
// Bug real reportado pelo usuário: "quando eu clico pra ampliar uma foto ele
// abre a última foto que ampliei, depois pisca e abre a foto que realmente é
// pra aparecer". Causa: o <img> do diálogo é UM elemento só, reaproveitado; ao
// trocar o src, o navegador continua desenhando a imagem ANTERIOR até a nova
// (3200px, demora) terminar de carregar — então o diálogo abria mostrando a
// foto da vez passada e só depois trocava. Agora, a cada abertura: (1) o <img>
// é esvaziado e escondido (opacity 0) — nunca sobra a foto anterior; (2) a
// versão pequena que JÁ está na tela e em cache (`previewSrc`) aparece na hora,
// então o clique responde de imediato; (3) a grande carrega e é decodificada por
// trás (new Image().decode()) e só troca quando está pronta — sem piscar,
// porque preview e grande ocupam exatamente a mesma caixa (ver CSS). `openId`
// invalida respostas atrasadas de uma abertura anterior.
let photoZoomOpenId = 0;

function clearPhotoZoomImage(){
  photoZoomOpenId++;
  const img = $("catalogPhotoZoomImage");
  if(!img) return;
  img.classList.remove("is-ready");
  img.removeAttribute("src");
}

// Mostra UMA foto no <img> do diálogo (esvazia, preview, grande por trás) —
// usada tanto pra abrir quanto pra passar de uma foto pra outra.
function showPhotoZoomPhoto(src, alt, previewSrc){
  const img = $("catalogPhotoZoomImage");
  clearPhotoZoomImage();
  const openId = photoZoomOpenId;
  const full = otimizarFoto(src, IMG_WIDTH.zoom, IMG_QUALITY_ZOOM);
  const reveal = () => { if(openId === photoZoomOpenId) img.classList.add("is-ready"); };
  img.alt = alt || "";
  resetPhotoZoom();
  img.addEventListener("load", reveal, { once: true });
  if(previewSrc && previewSrc !== full){
    img.src = previewSrc;
    const big = new Image();
    big.src = full;
    const swapToFull = () => { if(openId === photoZoomOpenId) img.src = full; };
    // Se a grande falhar, fica a pequena (melhor que trocar por uma imagem quebrada).
    big.decode().then(swapToFull, () => {});
  }else{
    img.src = full;
  }
}

// Galeria do visualizador (pedido do usuário: "quero poder trocar as fotos
// pelo preview"): quem abre pode passar `gallery = { items: [{ src, alt,
// preview }], index }` — as fotos "irmãs" da clicada (as da pasta da
// Biblioteca, os slides do carrossel do item, as ambientadas do item). Com 2+
// fotos aparecem as setas e o contador; com uma só, o visualizador é o mesmo
// de sempre. `src` é sempre a URL crua; `preview` é a versão pequena (já em
// cache quando a foto está na tela).
let photoZoomGallery = null;

function renderPhotoZoomNav(){
  const dialog = $("catalogPhotoZoomDialog");
  const multiple = !!photoZoomGallery;
  dialog.classList.toggle("has-gallery", multiple);
  [$("catalogPhotoZoomPrev"), $("catalogPhotoZoomNext"), $("catalogPhotoZoomCounter")].forEach((el) => { if(el) el.hidden = !multiple; });
  if(multiple) $("catalogPhotoZoomCounter").textContent = `${photoZoomGallery.index + 1} / ${photoZoomGallery.items.length}`;
}

// Só as vizinhas imediatas, e só a versão pequena: passar de foto responde na
// hora sem baixar 3200px de fotos que talvez ninguém abra.
function preloadPhotoZoomNeighbors(){
  if(!photoZoomGallery) return;
  const { items, index } = photoZoomGallery;
  [-1, 1].forEach((offset) => {
    const neighbor = items[(index + offset + items.length) % items.length];
    const url = neighbor?.preview || (neighbor?.src ? otimizarFoto(neighbor.src, IMG_WIDTH.hero, IMG_QUALITY_HERO) : "");
    if(url) new Image().src = url;
  });
}

function stepPhotoZoom(direction){
  if(!photoZoomGallery) return;
  const { items } = photoZoomGallery;
  photoZoomGallery.index = (photoZoomGallery.index + direction + items.length) % items.length;
  const target = items[photoZoomGallery.index];
  showPhotoZoomPhoto(target.src, target.alt, target.preview || otimizarFoto(target.src, IMG_WIDTH.hero, IMG_QUALITY_HERO));
  renderPhotoZoomNav();
  preloadPhotoZoomNeighbors();
}

function openPhotoZoom(src, alt, previewSrc, gallery){
  // Sem foto de verdade (placeholder genérico "Sem foto") não tem o que
  // ampliar — silenciosamente não abre, mesmo comportamento de clicar
  // ali antes desta feature existir.
  if(!src || src === FOTO_PLACEHOLDER) return;
  const items = gallery?.items || [];
  photoZoomGallery = items.length > 1
    ? { items, index: Math.min(items.length - 1, Math.max(0, gallery.index || 0)) }
    : null;
  showPhotoZoomPhoto(src, alt, previewSrc);
  renderPhotoZoomNav();
  preloadPhotoZoomNeighbors();
  const dialog = $("catalogPhotoZoomDialog");
  if(!dialog.open) dialog.showModal();
}

// Galerias dos dois lugares do item que abrem o visualizador. A foto clicada
// entra com a URL/alt/preview que JÁ estão na tela (pode ser, por exemplo, a
// foto personalizada com tecido, que não é a que está em item.photo).
function zoomGalleryForMainImage(image){
  const section = image.closest(".catalog-product-section");
  const item = section ? findItemById(section.dataset.productId) : null;
  if(!item) return null;
  const slides = mainSlides(item).filter((slide) => !slide.empty);
  const activeSlot = image.closest(".product-main-media")?.dataset.activeSlot || "principal";
  const index = Math.max(0, slides.findIndex((slide) => slide.slot === activeSlot));
  const items = slides.map((slide) => ({ src: slide.rawSrc, alt: slide.alt, preview: slide.src }));
  if(items[index]) items[index] = { src: image.dataset.originalSrc, alt: image.alt, preview: image.currentSrc || image.src };
  return { items, index };
}

function zoomGalleryForEventImage(image){
  const section = image.closest(".catalog-product-section");
  const item = section ? findItemById(section.dataset.productId) : null;
  if(!item) return null;
  const events = item.events.filter((event) => event.img);
  const index = Math.min(events.length - 1, Number(image.dataset.eventIndex || 0));
  const items = events.map((event) => ({ src: event.img, alt: event.label, preview: otimizarFoto(event.img, IMG_WIDTH.hero, IMG_QUALITY_HERO) }));
  if(items[index]) items[index] = { src: image.dataset.originalSrc, alt: image.alt, preview: image.currentSrc || image.src };
  return { items, index };
}

function photoZoomBy(delta){
  photoZoom.scale = Math.min(PHOTO_ZOOM_MAX, Math.max(PHOTO_ZOOM_MIN, photoZoom.scale + delta));
  // Volta pro centro ao encolher até o mínimo — sem isso, dar zoom de
  // novo depois de já ter arrastado começaria descentralizado.
  if(photoZoom.scale === PHOTO_ZOOM_MIN){ photoZoom.x = 0; photoZoom.y = 0; }
  applyPhotoZoomTransform();
}

function bindPhotoZoom(){
  const dialog = $("catalogPhotoZoomDialog");
  const stage = $("catalogPhotoZoomStage");
  if(!dialog || !stage) return;
  $("catalogPhotoZoomClose")?.addEventListener("click", () => dialog.close());
  // Escape já fecha um <dialog> aberto via showModal() sozinho (nativo do
  // navegador) — só precisamos resetar o zoom/posição pra próxima vez que
  // abrir, não importa como foi fechado (botão, Escape, clique fora).
  dialog.addEventListener("close", () => { resetPhotoZoom(); clearPhotoZoomImage(); photoZoomGallery = null; renderPhotoZoomNav(); });
  // Passar de foto: setas do teclado, botões e arrastar pro lado (só sem zoom — com zoom, arrastar é mover a foto).
  $("catalogPhotoZoomPrev")?.addEventListener("click", () => stepPhotoZoom(-1));
  $("catalogPhotoZoomNext")?.addEventListener("click", () => stepPhotoZoom(1));
  dialog.addEventListener("keydown", (event) => {
    if(!photoZoomGallery || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    stepPhotoZoom(event.key === "ArrowRight" ? 1 : -1);
  });
  dialog.querySelector("[data-photo-zoom-in]")?.addEventListener("click", () => photoZoomBy(PHOTO_ZOOM_STEP));
  dialog.querySelector("[data-photo-zoom-out]")?.addEventListener("click", () => photoZoomBy(-PHOTO_ZOOM_STEP));
  dialog.querySelector("[data-photo-zoom-reset]")?.addEventListener("click", resetPhotoZoom);
  stage.addEventListener("wheel", (event) => {
    event.preventDefault();
    photoZoomBy(event.deltaY < 0 ? PHOTO_ZOOM_STEP : -PHOTO_ZOOM_STEP);
  }, { passive: false });
  stage.addEventListener("pointerdown", (event) => {
    photoZoom.dragging = true;
    photoZoom.startX = event.clientX;
    photoZoom.startY = event.clientY;
    photoZoom.originX = photoZoom.x;
    photoZoom.originY = photoZoom.y;
    stage.classList.add("is-dragging");
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener("pointermove", (event) => {
    if(!photoZoom.dragging) return;
    photoZoom.x = photoZoom.originX + (event.clientX - photoZoom.startX);
    photoZoom.y = photoZoom.originY + (event.clientY - photoZoom.startY);
    applyPhotoZoomTransform();
  });
  const endPhotoZoomDrag = (event) => {
    if(!photoZoom.dragging) return;
    photoZoom.dragging = false;
    stage.classList.remove("is-dragging");
    try{ stage.releasePointerCapture(event.pointerId); }catch{ /* já liberado */ }
    // Arrastar pro lado (sem zoom) passa pra próxima/anterior — o gesto natural no celular.
    const dx = event.clientX - photoZoom.startX;
    const dy = event.clientY - photoZoom.startY;
    if(event.type === "pointerup" && photoZoomGallery && photoZoom.scale === PHOTO_ZOOM_MIN && Math.abs(dx) >= PHOTO_SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5){
      stepPhotoZoom(dx < 0 ? 1 : -1);
    }
  };
  stage.addEventListener("pointerup", endPhotoZoomDrag);
  stage.addEventListener("pointercancel", endPhotoZoomDrag);
}

// A Biblioteca (catalogo-biblioteca.mjs) é um módulo self-contido que não
// importa este arquivo — mesmo padrão de window.catalogNotify: o visualizador
// de foto em tela cheia fica aqui e ela o chama por esta ponte. Recebe a URL
// CRUA da foto (openPhotoZoom pede a versão grande ao Storage).
window.catalogOpenPhotoZoom = openPhotoZoom;

// Edição de fotos do item, DIRETO no layout real do catálogo (pedido
// explícito do usuário, depois de rejeitar uma primeira versão em modal:
// "não quero que abra um modal... quero que a pessoa adicione no próprio
// html, assim ele pode ajustar, aproximar, chegar pro lado" — a pessoa
// vê exatamente como a foto vai ficar publicada enquanto ajusta, sem
// popup). Equipe interna pode trocar TODAS as fotos que aparecem no
// catálogo (principal, Detalhes, Ambientadas) e a capa da categoria, sem
// sair da visualização imersiva — e o que muda aqui é o MESMO dado do
// Cadastro de Itens (itens.foto_url, itens_fotos, itens.capa_categoria),
// não uma cópia à parte. Mesmo bucket/convenção de caminho do Cadastro
// de Itens (Modulos/Estoque/CadastroItens/itens.foto.mjs) —
// reimplementado aqui de propósito, não importado, porque aquele arquivo
// é todo acoplado ao DOM específico de item-detalhes.html; aqui o upload
// é instantâneo por foto, mesmo padrão já usado pra Biblioteca/Portal.
const ITEM_PHOTO_SLOTS_CONFIG = {
  detalhe_01: { tipo: "detalhe", titulo: "Detalhe 01", ordem: 1, arquivo: "detalhe-01", label: "Detalhe 1" },
  detalhe_02: { tipo: "detalhe", titulo: "Detalhe 02", ordem: 2, arquivo: "detalhe-02", label: "Detalhe 2" },
  galeria_01: { tipo: "galeria", titulo: "Galeria 01", ordem: 1, arquivo: "galeria-01", label: "Ambientada 1" },
  galeria_02: { tipo: "galeria", titulo: "Galeria 02", ordem: 2, arquivo: "galeria-02", label: "Ambientada 2" },
  galeria_03: { tipo: "galeria", titulo: "Galeria 03", ordem: 3, arquivo: "galeria-03", label: "Ambientada 3" },
};

function normalizarMimeItemFoto(mime){
  return ["image/png", "image/webp", "image/jpeg"].includes(mime) ? mime : "image/png";
}
function extensaoItemFoto(mime){
  return ({ "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg" })[normalizarMimeItemFoto(mime)];
}

async function trocarFotoPrincipal(item, file){
  const empresaId = state.catalogSession.empresa_id;
  const mime = normalizarMimeItemFoto(file.type);
  const ext = extensaoItemFoto(mime);
  const path = `${empresaId}/${item.id}/principal.${ext}`;
  const { error: uploadError } = await supabase.storage.from("itens").upload(path, file, { contentType: mime, upsert: true });
  if(uploadError) throw uploadError;
  // Mesma limpeza de itens_processarFoto (itens.foto.mjs): só depois do
  // novo arquivo estar seguro no Storage, apaga variantes de extensão
  // antigas pra não sobrar arquivo órfão.
  const outras = ["jpg", "jpeg", "png", "webp"].filter((extensao) => extensao !== ext).map((extensao) => `${empresaId}/${item.id}/principal.${extensao}`);
  await supabase.storage.from("itens").remove(outras);
  const { data: urlData } = supabase.storage.from("itens").getPublicUrl(path);
  const url = `${urlData.publicUrl}?v=${Date.now()}`;
  const { error: updateError } = await supabase.from("itens").update({ foto_url: url }).eq("id", item.id);
  if(updateError) throw updateError;
  item.photo = url;
  item.variantGroup?.forEach((variante) => { if(String(variante.id) === String(item.id)) variante.photo = url; });
}

async function trocarFotoSlot(item, slot, file){
  const config = ITEM_PHOTO_SLOTS_CONFIG[slot];
  const empresaId = state.catalogSession.empresa_id;
  const mime = normalizarMimeItemFoto(file.type);
  const ext = extensaoItemFoto(mime);
  const path = `${empresaId}/${item.id}/geral/${config.arquivo}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("itens").upload(path, file, { contentType: mime, upsert: true });
  if(uploadError) throw uploadError;
  const lista = config.tipo === "detalhe" ? item.details : item.events;
  const existente = lista.find((foto) => foto.slot === slot);
  const { data: urlData } = supabase.storage.from("itens").getPublicUrl(path);
  const url = `${urlData.publicUrl}?v=${Date.now()}`;
  if(existente?.path && existente.path !== path) await supabase.storage.from("itens").remove([existente.path]);
  const { error: deleteError } = await supabase.from("itens_fotos").delete().eq("item_id", item.id).eq("slot", slot).is("cliente_id", null);
  if(deleteError) throw deleteError;
  const { error: insertError } = await supabase.from("itens_fotos").insert({
    empresa_id: empresaId, item_id: item.id, slot, tipo: config.tipo, titulo: config.titulo, ordem: config.ordem,
    path, url, mime_type: mime, tamanho_bytes: file.size, cliente_id: null,
  });
  if(insertError) throw insertError;
  const entry = { img: url, label: config.titulo, slot, path };
  const index = lista.findIndex((foto) => foto.slot === slot);
  if(index >= 0) lista[index] = entry; else lista.push(entry);
}

async function removerFotoSlot(item, slot){
  const config = ITEM_PHOTO_SLOTS_CONFIG[slot];
  const lista = config.tipo === "detalhe" ? item.details : item.events;
  const existente = lista.find((foto) => foto.slot === slot);
  const { error: deleteError } = await supabase.from("itens_fotos").delete().eq("item_id", item.id).eq("slot", slot).is("cliente_id", null);
  if(deleteError) throw deleteError;
  if(existente?.path) await supabase.storage.from("itens").remove([existente.path]);
  const index = lista.findIndex((foto) => foto.slot === slot);
  if(index >= 0) lista.splice(index, 1);
}

// Só um item por categoria pode ser capa por vez — desmarca qualquer
// outro que já estivesse marcado antes de marcar o atual (o cadastro
// manual, em item-detalhes.html, não faz essa exclusão sozinho; ver
// "Não impede" na seção de capa por categoria no CLAUDE.md).
async function alternarCapaCategoria(item){
  const empresaId = state.catalogSession.empresa_id;
  const novoValor = !item.capaCategoria;
  if(novoValor){
    const irmaos = state.items.filter((outro) => outro.cat === item.cat && String(outro.id) !== String(item.id) && outro.capaCategoria);
    for(const irmao of irmaos){
      const { error } = await supabase.from("itens").update({ capa_categoria: false }).eq("id", irmao.id);
      if(error) throw error;
      irmao.capaCategoria = false;
    }
  }
  const { error } = await supabase.from("itens").update({ capa_categoria: novoValor }).eq("id", item.id);
  if(error) throw error;
  item.capaCategoria = novoValor;
  item.variantGroup?.forEach((variante) => { if(String(variante.id) === String(item.id)) variante.capaCategoria = novoValor; });
}

// Reaplica o item na seção imersiva já aberta (se o usuário estiver
// olhando pra ele) — reaproveita applyVariant() tal qual, mesmo sem estar
// trocando de variante de verdade: ela só atualiza o que realmente mudou,
// então chamar de novo com o MESMO item é seguro e pega as mutações que
// as funções de troca de foto acima já fizeram direto no objeto.
// `preserveSlot:true` mantém o carrossel no MESMO slide que estava (ex.:
// editou a foto de Detalhe 1 e aplicou — continua vendo o Detalhe 1
// atualizado, em vez de voltar pra principal); uma troca de variante de
// cor de verdade (clique numa amostra) não pede isso, sempre volta pra
// principal — ver applyVariant().
function refreshOpenSection(item){
  const section = document.querySelector(`.catalog-product-section[data-product-id="${CSS.escape(String(item.id))}"]`);
  if(section) applyVariant(section, item, { preserveSlot: true });
}

async function handleCapaToggleClick(item, button){
  button.disabled = true;
  try{
    await alternarCapaCategoria(item);
    button.outerHTML = capaToggleMarkup(item);
    notify({ title: item.capaCategoria ? "Definida como capa" : "Capa removida", message: item.name, duration: 4000 });
  }catch(error){
    console.error("Erro ao definir capa da categoria:", error);
    notify({ title: "Não foi possível salvar", message: "Tente novamente.", status: "error" });
    button.disabled = false;
  }
}

// ============================================================
// Edição inline das fotos (pedido explícito do usuário: "não quero que
// abra um modal... quero que a pessoa adicione no próprio html, assim
// ele pode ajustar, aproximar, chegar pro lado" — a pessoa ajusta a foto
// vendo exatamente como vai ficar publicada, sem popup). Uma sessão de
// cada vez (`cropSession`), sempre ANCORADA no contêiner real da página
// (`.product-main-media` ou `.product-event-panel`) — esses elementos
// NUNCA têm o conteúdo original destruído: a UI de ajuste entra como um
// `<div class="catalog-inline-crop-overlay">` adicional por cima, com os
// filhos originais só escondidos (`.catalog-inline-crop-hide`) enquanto
// dura a sessão. Cancelar = remover o overlay e reexibir os filhos
// originais, sem tocar no banco. Aplicar = gerar o blob final (mesmo
// cálculo de itens_gerarImagemFinal() em itens.foto.mjs, só que usando o
// tamanho REAL do contêiner — a "moldura" — em vez da caixa de prévia
// fixa de 240×240 daquele arquivo), subir com trocarFotoPrincipal/
// trocarFotoSlot e então remover o overlay + refreshOpenSection() pra
// mostrar o resultado de verdade.
//
// Detalhe (`detalhe_01`/`detalhe_02`) usa a MESMA moldura da principal
// (`.product-main-media`) desde que os detalhes passaram a ser mais um
// slide do carrossel da foto principal, em vez de um card próprio
// embaixo (ver mainSlides()/renderMainSlide() acima — pedido explícito
// do usuário: "quero que a pessoa veja os detalhes no mesmo lugar da
// foto principal").
// ============================================================

let cropSession = null;

function cropFrameForSlot(section, slot){
  if(slot === "principal" || slot.startsWith("detalhe")) return section.querySelector(".product-main-media");
  return section.querySelector(".product-event-panel");
}

function cropClampScale(value){
  return Math.min(5, Math.max(0.3, value));
}

function applyCropTransform(){
  const img = cropSession?.placeholder.querySelector(".catalog-inline-crop-img");
  if(!img) return;
  img.style.transform = `translate(${cropSession.x}px, ${cropSession.y}px) scale(${cropSession.scale})`;
}

function cropZoom(direction){
  if(!cropSession || !cropSession.blob) return;
  cropSession.scale = cropClampScale(cropSession.scale + direction * 0.15);
  applyCropTransform();
}

function cropPointerMove(event){
  if(!cropSession?.dragging || event.pointerId !== cropSession.pointerId) return;
  cropSession.x = cropSession.startX + (event.clientX - cropSession.startPointerX);
  cropSession.y = cropSession.startY + (event.clientY - cropSession.startPointerY);
  applyCropTransform();
}

function cropPointerUp(event){
  if(!cropSession || event.pointerId !== cropSession.pointerId) return;
  cropSession.dragging = false;
  const img = event.currentTarget;
  img.removeEventListener("pointermove", cropPointerMove);
  img.removeEventListener("pointerup", cropPointerUp);
  img.removeEventListener("pointercancel", cropPointerUp);
}

function cropPointerDown(event){
  if(!cropSession) return;
  const img = event.currentTarget;
  img.setPointerCapture(event.pointerId);
  cropSession.dragging = true;
  cropSession.pointerId = event.pointerId;
  cropSession.startPointerX = event.clientX;
  cropSession.startPointerY = event.clientY;
  cropSession.startX = cropSession.x;
  cropSession.startY = cropSession.y;
  img.addEventListener("pointermove", cropPointerMove);
  img.addEventListener("pointerup", cropPointerUp);
  img.addEventListener("pointercancel", cropPointerUp);
  event.preventDefault();
}

function cropWheel(event){
  if(!cropSession || !cropSession.blob) return;
  event.preventDefault();
  cropSession.scale = cropClampScale(cropSession.scale - event.deltaY * 0.0015);
  applyCropTransform();
}

// Centraliza a imagem "em contain" dentro da moldura real (mesma relação
// Math.min(...) que o cálculo final do blob usa) — o transform de
// arrastar/zoom aplica POR CIMA desse tamanho-base, nunca substituindo.
function positionCropImage(){
  const img = cropSession?.placeholder.querySelector(".catalog-inline-crop-img");
  if(!img) return;
  const rect = cropSession.frame.getBoundingClientRect();
  const baseRatio = Math.min(rect.width / cropSession.naturalW, rect.height / cropSession.naturalH);
  const width = cropSession.naturalW * baseRatio;
  const height = cropSession.naturalH * baseRatio;
  img.style.width = `${width}px`;
  img.style.height = `${height}px`;
  img.style.marginLeft = `${-width / 2}px`;
  img.style.marginTop = `${-height / 2}px`;
  applyCropTransform();
  img.addEventListener("pointerdown", cropPointerDown);
  img.addEventListener("wheel", cropWheel, { passive: false });
}

function renderCropWorkspace(){
  const { placeholder, blob, slot } = cropSession;
  if(cropSession.objectUrl) URL.revokeObjectURL(cropSession.objectUrl);
  cropSession.objectUrl = URL.createObjectURL(blob);
  // Remover só faz sentido pra Detalhe/Ambientada — a foto principal do
  // item e a foto única do Portal não têm como ficar vazias (sempre
  // existe alguma, nem que seja o placeholder).
  const podeRemover = slot !== "principal" && !cropSession.gatewayKey && cropSession.hadExistingPhoto;
  placeholder.innerHTML = `<img class="catalog-inline-crop-img" src="${cropSession.objectUrl}" alt="Ajustar foto" draggable="false">
    <div class="catalog-inline-crop-toolbar">
      <label title="Trocar arquivo">🖼<input type="file" accept="image/png,image/jpeg,image/webp" data-crop-swap></label>
      <button type="button" data-crop-zoom-out aria-label="Diminuir zoom">−</button>
      <button type="button" data-crop-zoom-in aria-label="Aumentar zoom">+</button>
      ${podeRemover ? `<button type="button" data-crop-remove aria-label="Remover foto">🗑</button>` : ""}
      <button type="button" data-crop-cancel aria-label="Cancelar">✕</button>
      <button type="button" data-crop-apply aria-label="Aplicar">✓</button>
    </div>`;
  positionCropImage();
}

async function setCropSource(blobOrFile){
  const bitmap = await createImageBitmap(blobOrFile);
  cropSession.blob = blobOrFile;
  cropSession.naturalW = bitmap.width;
  cropSession.naturalH = bitmap.height;
  cropSession.scale = 1;
  cropSession.x = 0;
  cropSession.y = 0;
  bitmap.close?.();
  renderCropWorkspace();
}

// Carrega a foto atual (Carregando… -> setCropSource) ou, sem foto
// nenhuma ainda, mostra "+ Escolher foto" e já abre o seletor de arquivo
// na hora (compartilhado entre startInlineEdit/startInlineEditForGateway
// — mesma lógica, só muda de onde vem existenteUrl/frame).
async function loadCropSourceOrEmptyPicker(existenteUrl, placeholder){
  if(existenteUrl){
    placeholder.innerHTML = `<div class="catalog-inline-crop-loading">Carregando…</div>`;
    try{
      const response = await fetch(existenteUrl);
      if(!response.ok) throw new Error(`status ${response.status}`);
      await setCropSource(await response.blob());
    }catch(error){
      console.error("Não foi possível carregar a foto atual pra ajustar:", error);
      placeholder.innerHTML = `<div class="catalog-inline-crop-error"><span>Não foi possível carregar essa foto.</span><button type="button" data-crop-cancel>Fechar</button></div>`;
    }
  }else{
    placeholder.innerHTML = `<label class="catalog-inline-crop-pick"><span>+ Escolher foto</span><input type="file" accept="image/png,image/jpeg,image/webp" data-crop-swap></label>
      <button type="button" class="catalog-inline-crop-empty-cancel" data-crop-cancel aria-label="Cancelar">✕</button>`;
    // Abre o seletor de arquivo do sistema na hora, sem exigir um segundo
    // clique em "+ Escolher foto" (pedido explícito do usuário: "hoje eu
    // estou tendo que colocar duas vezes"). Só funciona porque este
    // branch roda inteiro SÍNCRONO, sem nenhum await antes — ainda dentro
    // do mesmo clique/tecla do usuário que abriu a sessão de ajuste;
    // navegadores exigem um gesto do usuário pra abrir esse seletor, um
    // .click() fora dessa cadeia seria ignorado silenciosamente.
    placeholder.querySelector("[data-crop-swap]")?.click();
  }
}

async function startInlineEdit(section, item, slot){
  if(!state.acessoInterno) return;
  if(cropSession) cancelInlineEdit();
  const frame = cropFrameForSlot(section, slot);
  if(!frame) return;

  const placeholder = document.createElement("div");
  placeholder.className = "catalog-inline-crop-overlay";
  Array.from(frame.children).forEach((child) => child.classList.add("catalog-inline-crop-hide"));
  // Rede de segurança: SE algum dia um frame voltar a ser, ele mesmo, o
  // gatilho com [data-inline-edit] (em vez de um filho/badge separado —
  // era o caso do antigo detail-thumb vazio, removido junto com a
  // galeria de Detalhes própria, ver mainSlides() acima), um clique em
  // qualquer botão da barra de ferramentas (aninhada dentro desse mesmo
  // elemento) seria capturado de novo pelo cheque de [data-inline-edit]
  // em bindInteractions() (que roda ANTES do cheque de [data-crop-*]),
  // reabrindo a sessão em vez de aplicar/cancelar. Hoje nenhum frame
  // (.product-main-media/.product-event-panel) carrega esse atributo
  // diretamente — só filhos (badge/pontinhos) — então isso nunca
  // dispara na prática, mas não custa manter a proteção.
  const frameInlineEditSlot = frame.dataset.inlineEdit || null;
  if(frameInlineEditSlot) frame.removeAttribute("data-inline-edit");
  frame.appendChild(placeholder);
  frame.classList.add("is-cropping");
  const isPrincipal = slot === "principal";
  const config = isPrincipal ? null : ITEM_PHOTO_SLOTS_CONFIG[slot];
  const existenteUrl = isPrincipal
    ? (item.photo && item.photo !== FOTO_PLACEHOLDER ? item.photo : null)
    : (config.tipo === "detalhe" ? item.details : item.events).find((foto) => foto.slot === slot)?.img;

  cropSession = { section, item, slot, frame, placeholder, frameInlineEditSlot, scale: 1, x: 0, y: 0, naturalW: 0, naturalH: 0, blob: null, objectUrl: null, dragging: false, hadExistingPhoto: Boolean(existenteUrl) };
  await loadCropSourceOrEmptyPicker(existenteUrl, placeholder);
}

// Mesmo sistema de ajuste (arrastar/zoom) das fotos do item, aplicado à
// foto única do Portal — pedido explícito do usuário, depois do Portal
// virar uma foto só cobrindo a tela: "o ícone de mover, ajustar a foto
// não está aparecendo também" (esperava o mesmo recurso que já existe
// pras fotos do item). `cropSession` ganha um campo `gatewayKey` em vez
// de `item`/`slot`/`section` — todo o resto do sistema (arrastar, zoom,
// gerar o blob final, cancelar) já era genérico o bastante pra não
// precisar de nenhuma mudança; só `applyInlineEdit()`/`renderCropWorkspace()`
// precisam saber diferenciar os dois casos (ver abaixo). Frame = o
// próprio `.catalog-gateway` (mesma caixa que a foto real ocupa,
// `object-fit:cover` — ajustar aqui mostra exatamente o que vai
// aparecer publicado, mesmo raciocínio "sem popup" de sempre).
async function startInlineEditForGateway(chave){
  if(!state.acessoInterno) return;
  if(cropSession) cancelInlineEdit();
  const frame = document.querySelector(".catalog-gateway");
  if(!frame) return;

  const placeholder = document.createElement("div");
  placeholder.className = "catalog-inline-crop-overlay";
  Array.from(frame.children).forEach((child) => child.classList.add("catalog-inline-crop-hide"));
  frame.appendChild(placeholder);
  frame.classList.add("is-cropping");
  const existenteUrl = state.gatewayCapas[chave] && state.gatewayCapas[chave] !== FOTO_PLACEHOLDER ? state.gatewayCapas[chave] : null;

  cropSession = { gatewayKey: chave, frame, placeholder, frameInlineEditSlot: null, scale: 1, x: 0, y: 0, naturalW: 0, naturalH: 0, blob: null, objectUrl: null, dragging: false, hadExistingPhoto: Boolean(existenteUrl) };
  await loadCropSourceOrEmptyPicker(existenteUrl, placeholder);
}

function cancelInlineEdit(){
  if(!cropSession) return;
  const { frame, placeholder, objectUrl, frameInlineEditSlot } = cropSession;
  placeholder.remove();
  frame.classList.remove("is-cropping");
  Array.from(frame.children).forEach((child) => child.classList.remove("catalog-inline-crop-hide"));
  if(frameInlineEditSlot) frame.setAttribute("data-inline-edit", frameInlineEditSlot);
  if(objectUrl) URL.revokeObjectURL(objectUrl);
  cropSession = null;
}

// Mesmo cálculo de itens_gerarImagemFinal() (itens.foto.mjs), só que
// parametrizado pela moldura REAL da página (frame.getBoundingClientRect())
// em vez da caixa fixa de 240×240 daquele arquivo — o que está visível
// dentro da moldura no momento do clique em "Aplicar" é exatamente o que
// vira o arquivo final.
// Teto de resolução do arquivo salvo pelo editor inline — sem isso, uma
// foto de celular de alta resolução saía do canvas quase no tamanho
// nativo (ex.: 4000x3000) e, gravada como PNG sem compressão, virava um
// arquivo de 8 a 16MB (achado real, direto no banco, ao investigar por
// que o catálogo demorava pra carregar). 2400px no lado maior já é mais
// que suficiente pra tela cheia em qualquer monitor comum, e o Storage
// ainda serve uma versão redimensionada em cima dessa pro catálogo (ver
// otimizarFoto()) — não precisa guardar mais resolução que isso.
const MAX_INLINE_CROP_DIMENSION = 2400;

async function cropSessionBlob(){
  const { frame, blob, naturalW, naturalH, scale, x, y } = cropSession;
  const rect = frame.getBoundingClientRect();
  let outputScale = Math.max(naturalW / rect.width, naturalH / rect.height, 1);
  let width = Math.max(1, Math.round(rect.width * outputScale));
  let height = Math.max(1, Math.round(rect.height * outputScale));
  const maiorLado = Math.max(width, height);
  if(maiorLado > MAX_INLINE_CROP_DIMENSION){
    // Reduz width/height E outputScale pelo MESMO fator — outputScale
    // também controla o deslocamento de arrastar (drawX/drawY), então
    // precisa encolher junto pra manter o enquadramento idêntico ao que
    // a pessoa viu na tela, só que numa resolução final menor.
    const fator = MAX_INLINE_CROP_DIMENSION / maiorLado;
    width = Math.max(1, Math.round(width * fator));
    height = Math.max(1, Math.round(height * fator));
    outputScale *= fator;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Fundo branco antes de desenhar: o resultado final vira JPEG (sem
  // canal alpha) — sem isso, qualquer sobra transparente no canvas
  // (ex.: zoom < 1, se algum dia existir) viraria preto em vez de branco.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const bitmap = await createImageBitmap(blob);
  const baseRatio = Math.min(width / bitmap.width, height / bitmap.height);
  const ratio = baseRatio * scale;
  const imgWidth = bitmap.width * ratio;
  const imgHeight = bitmap.height * ratio;
  const drawX = (width - imgWidth) / 2 + x * outputScale;
  const drawY = (height - imgHeight) / 2 + y * outputScale;
  ctx.drawImage(bitmap, drawX, drawY, imgWidth, imgHeight);
  bitmap.close?.();
  // JPEG em vez de PNG sem compressão nenhuma: mesma foto, mesma
  // resolução, arquivo ordens de grandeza menor (fotografia de produto
  // não precisa de compressão sem perdas). Ver MAX_INLINE_CROP_DIMENSION
  // acima pro resto da correção deste bug.
  return new Promise((resolve) => canvas.toBlob((result) => resolve(result), "image/jpeg", 0.9));
}

async function applyInlineEdit(){
  if(!cropSession || !cropSession.blob) return;
  const { item, slot, gatewayKey } = cropSession;
  const toolbar = cropSession.placeholder.querySelector(".catalog-inline-crop-toolbar");
  toolbar?.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  try{
    const blob = await cropSessionBlob();
    if(!blob) throw new Error("Canvas não gerou a imagem final.");
    // Nome/tipo do File seguem o blob de verdade (agora JPEG, ver
    // cropSessionBlob) — antes vinham fixos em "image/png" independente
    // do que o canvas realmente gerasse; trocarFotoPrincipal/trocarFotoSlot
    // decidem extensão e content-type a partir desse .type, então um valor
    // hardcoded errado geraria um arquivo .png com bytes de JPEG dentro.
    const file = new File([blob], `foto.${extensaoItemFoto(blob.type)}`, { type: blob.type });
    if(gatewayKey){
      // trocarCapaGateway() já mostra seu próprio notify() de erro (e,
      // em caso de sucesso, já re-renderiza o Portal via renderGateway()
      // — o que substitui #catalogGrid inteiro, derrubando o overlay de
      // crop junto; por isso NÃO chama cancelInlineEdit() nesse caminho,
      // ele operaria em nós já desconectados do documento). Falha =
      // sessão continua aberta, botões reabilitados, pra tentar de novo.
      const ok = await trocarCapaGateway(gatewayKey, file);
      if(!ok){ toolbar?.querySelectorAll("button").forEach((button) => { button.disabled = false; }); return; }
      cropSession = null;
      return;
    }
    if(slot === "principal") await trocarFotoPrincipal(item, file);
    else await trocarFotoSlot(item, slot, file);
    cancelInlineEdit();
    refreshOpenSection(item);
    notify({ title: "Foto atualizada", message: item.name, duration: 4000 });
  }catch(error){
    console.error("Erro ao salvar foto:", error);
    notify({ title: "Não foi possível salvar essa foto", message: "Tente novamente.", status: "error" });
    toolbar?.querySelectorAll("button").forEach((button) => { button.disabled = false; });
  }
}

async function removeCropSlot(){
  if(!cropSession || cropSession.slot === "principal" || cropSession.gatewayKey) return;
  const { item, slot } = cropSession;
  const toolbar = cropSession.placeholder.querySelector(".catalog-inline-crop-toolbar");
  toolbar?.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  try{
    await removerFotoSlot(item, slot);
    cancelInlineEdit();
    refreshOpenSection(item);
    notify({ title: "Foto removida", message: item.name, duration: 4000 });
  }catch(error){
    console.error("Erro ao remover foto do item:", error);
    notify({ title: "Não foi possível remover essa foto", message: "Tente novamente.", status: "error" });
    toolbar?.querySelectorAll("button").forEach((button) => { button.disabled = false; });
  }
}

// Cache/loader de assets .glb — pedido pra REMOVER o modelo 3D por item
// desta tela (ver comentário em mainSlides()) não mexeu nisso aqui:
// window.catalogLoadModelAsset é reaproveitado pelo Módulo 3D
// (catalogo-studio3d.mjs, que continua existindo normalmente) pra buscar
// e cachear modelos sem baixar de novo — infraestrutura COMPARTILHADA,
// não exclusiva da prévia 3D por item que foi removida.
const modelAssetCache = new Map();
const MAX_MODEL_ASSETS_IN_MEMORY = 4;

function notifyAssetProgress(entry, progress){
  entry.listeners.forEach((listener) => listener(progress));
}

function trimModelAssetCache(currentUrl){
  if(modelAssetCache.size <= MAX_MODEL_ASSETS_IN_MEMORY) return;
  for(const [url, entry] of modelAssetCache){
    if(url === currentUrl || !entry.objectUrl) continue;
    URL.revokeObjectURL(entry.objectUrl);
    modelAssetCache.delete(url);
    if(modelAssetCache.size <= MAX_MODEL_ASSETS_IN_MEMORY) break;
  }
}

function loadModelAsset(url, onProgress){
  const key = String(url || "");
  let entry = modelAssetCache.get(key);
  if(entry){
    if(entry.objectUrl) onProgress?.(1);
    else if(onProgress) entry.listeners.add(onProgress);
    return entry.promise;
  }
  entry = { listeners: new Set(onProgress ? [onProgress] : []), objectUrl: "", promise: null };
  entry.promise = fetch(key, { cache: "force-cache", credentials: "omit" }).then(async (response) => {
    if(!response.ok) throw new Error(`Falha ao baixar o modelo (${response.status}).`);
    const total = Number(response.headers.get("content-length")) || 0;
    let blob;
    if(response.body && total > 0){
      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;
      while(true){
        const { done, value } = await reader.read();
        if(done) break;
        chunks.push(value);
        loaded += value.byteLength;
        notifyAssetProgress(entry, loaded / total);
      }
      blob = new Blob(chunks, { type: response.headers.get("content-type") || "model/gltf-binary" });
    }else{
      blob = await response.blob();
    }
    entry.objectUrl = URL.createObjectURL(blob);
    notifyAssetProgress(entry, 1);
    entry.listeners.clear();
    trimModelAssetCache(key);
    return entry.objectUrl;
  }).catch((error) => {
    modelAssetCache.delete(key);
    throw error;
  });
  modelAssetCache.set(key, entry);
  return entry.promise;
}

window.catalogLoadModelAsset = loadModelAsset;
window.addEventListener("pagehide", () => {
  modelAssetCache.forEach((entry) => { if(entry.objectUrl) URL.revokeObjectURL(entry.objectUrl); });
  modelAssetCache.clear();
}, { once: true });

// Troca de variante (clique numa miniatura de cor): atualiza no lugar só
// as partes que podem mudar entre variantes do mesmo grupo (foto, texto
// complementar, specs, card de personalização, foto de evento) —
// nome/medida ficam intactos de propósito, já que são justamente o que
// garante que as variantes pertencem ao mesmo grupo (ver chaveVariante).
// `options.preserveSlot` (usado por refreshOpenSection, nunca por uma
// troca de cor de verdade): mantém o carrossel no slide que já estava
// em vez de voltar pra principal — ver comentário em refreshOpenSection.
function applyVariant(section, variant, options = {}){
  section.dataset.productId = String(variant.id);
  section.id = `produto-${variant.id}`;

  const media = section.querySelector(".product-main-media");
  if(media){
    const slot = options.preserveSlot ? (media.dataset.activeSlot || "principal") : "principal";
    renderMainSlide(section, variant, slot);
    const nav = mainCarouselMarkup(variant);
    media.querySelectorAll(".product-main-nav, .product-main-dots").forEach((el) => el.remove());
    media.querySelector(".product-main-image")?.insertAdjacentHTML("afterend", nav);
    media.querySelectorAll(".product-main-dot").forEach((dot, i) => dot.classList.toggle("is-active", i === mainSlides(variant).findIndex((s) => s.slot === slot)));
  }

  section.querySelector(".product-specs")?.remove();
  const bespokeCard = section.querySelector(".product-bespoke-card");
  const specsHtml = specsPanel(variant);
  if(specsHtml){
    // .product-variants-row (os círculos de cor) mudou de lugar — agora
    // mora dentro de .product-title-row, embaixo do nome (pedido
    // explícito do usuário), não é mais irmã das specs. Âncora de
    // inserção passou a ser o botão de capa (próximo irmão fixo depois
    // das specs); sem ele (decorador externo), cai pro fim de
    // .product-rule, que SEMPRE existe, garantindo que as specs nunca
    // fiquem sem lugar pra entrar.
    const anchor = bespokeCard || section.querySelector("[data-capa-toggle]");
    if(anchor) anchor.insertAdjacentHTML("beforebegin", specsHtml);
    else section.querySelector(".product-rule")?.insertAdjacentHTML("afterend", specsHtml);
  }

  if(bespokeCard){
    bespokeCard.classList.toggle("hidden", !variant.personalizable);
    bespokeCard.dataset.customizeItem = String(variant.id);
  }

  const eventPanel = section.querySelector(".product-event-panel");
  if(eventPanel) eventPanel.innerHTML = eventPanelMarkup(variant);

  const capaButton = section.querySelector("[data-capa-toggle]");
  if(capaButton) capaButton.outerHTML = capaToggleMarkup(variant);
  atualizarBotoesProjeto(section);

  // Grupo de botões de modelo em destaque do Módulo 3D (1 por módulo):
  // removido e reinserido do zero (em vez de só atualizar outerHTML)
  // porque, diferente da capa de categoria, ele pode simplesmente NÃO
  // EXISTIR pra uma variante sem modelo .glb — precisa cobrir aparecer/
  // sumir/atualizar ao trocar de variante, não só atualizar um grupo que
  // já estava lá.
  section.querySelector(".catalog-capa-modulo3d-group")?.remove();
  const modulo3dToggleHtml = capaModulo3dToggleMarkup(variant);
  if(modulo3dToggleHtml){
    const modulo3dAnchor = section.querySelector("[data-capa-toggle]") || bespokeCard || section.querySelector(".product-rule");
    modulo3dAnchor?.insertAdjacentHTML("afterend", modulo3dToggleHtml);
  }

  section.querySelectorAll(".product-variant-swatch").forEach((button) => {
    button.classList.toggle("active", button.dataset.variantId === String(variant.id));
  });
}

// Troca a foto ambientada de uma seção pra anterior (direction -1) ou próxima (+1), com o mesmo fundido de
// sempre. Serve à troca automática (rotateActiveEvent) e às setas do painel (manual). Um clique manual
// durante uma troca em andamento NÃO se perde: guarda o último e roda quando a troca termina.
function stepEvent(section, direction, { manual = false } = {}){
  const item = findItemById(section.dataset.productId);
  const panel = section.querySelector(".product-event-panel");
  const image = panel?.querySelector(".product-event-image:not(.product-event-image-next)");
  if(!image || !item || item.events.length < 2) return;
  if(panel.dataset.transitioning === "true"){
    if(manual) panel._pendingEventStep = direction;
    return;
  }

  const total = item.events.length;
  const nextIndex = (Number(image.dataset.eventIndex || 0) + direction + total) % total;
  const nextEvent = item.events[nextIndex];
  panel.dataset.transitioning = "true";

  const nextImage = new Image();
  nextImage.className = "product-event-image product-event-image-next";
  nextImage.alt = nextEvent.label;
  nextImage.dataset.originalSrc = nextEvent.img;
  nextImage.decoding = "async";
  nextImage.onload = () => {
    panel.appendChild(nextImage);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        image.classList.add("is-leaving");
        nextImage.classList.add("is-visible");
      });
    });
    window.setTimeout(() => {
      /*
       * A camada já decodificada passa a ser a imagem principal. Evita trocar
       * o src novamente e elimina o frame vazio que causava a piscada.
       */
      nextImage.dataset.eventIndex = String(nextIndex);
      nextImage.classList.remove("product-event-image-next", "is-visible");
      image.remove();
      delete panel.dataset.transitioning;
      const pending = panel._pendingEventStep;
      panel._pendingEventStep = 0;
      if(pending) stepEvent(section, pending, { manual: true });
    }, 900);
  };
  nextImage.onerror = () => {
    delete panel.dataset.transitioning;
  };
  nextImage.src = otimizarFoto(nextEvent.img, IMG_WIDTH.hero, IMG_QUALITY_HERO);
}

// Troca automática (a cada 10s, ver startEventRotation): só a seção que está na tela, e não com a troca pausada.
function rotateActiveEvent(){
  if(state.eventPaused) return;
  if(document.hidden || $("catalogGrid")?.classList.contains("hidden")) return;
  const section = state.activeSection;
  if(!section) return;
  stepEvent(section, 1);
}

function startEventRotation(){
  clearInterval(state.eventTimer);
  state.eventTimer = window.setInterval(rotateActiveEvent, 10000);
}

function setupScrollMotion(){
  state.motionCleanup?.();
  const sections=[...document.querySelectorAll('.catalog-product-section')];
  const nearby=new Set();
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  const mobile=matchMedia('(max-width: 767px)');
  let frame=0;
  let smoothScroll=window.scrollY;
  let lastTime=0;
  function update(time){
    frame=0;
    const header=document.querySelector('.catalog-header')?.getBoundingClientRect().height || 0;
    const target=window.scrollY;
    const elapsed=lastTime?Math.min(64,time-lastTime):16;
    lastTime=time;
    smoothScroll=preference.matches || mobile.matches ? target : smoothScroll+(target-smoothScroll)*(1-Math.exp(-elapsed/190));
    if(Math.abs(target-smoothScroll)<.1) smoothScroll=target;
    const snapshots=[...nearby].map(section=>({section,rect:section.getBoundingClientRect(),gap:parseFloat(getComputedStyle(section).marginBottom)||parseFloat(getComputedStyle(section.previousElementSibling || section).marginBottom)||0}));
    for(const {section,rect,gap} of snapshots){
      const stride=Math.max(1,rect.height+gap);
      const relativeTop=rect.top+target-smoothScroll-header;
      const distance=preference.matches || mobile.matches ? 0 : Math.min(1,Math.abs(relativeTop/stride));
      // Symmetric curve: outgoing and incoming items share the same visual rhythm.
      const fade=distance*distance*(3-2*distance);
      const direction=Math.sign(relativeTop);
      const travel=preference.matches || mobile.matches ? 0 : direction*fade;
      const amplitude=Math.min(180,innerWidth*.12);
      section.style.setProperty('--catalog-photo-x',(-travel*amplitude)+'px');
      section.style.setProperty('--catalog-copy-x',(-travel*amplitude*.65)+'px');
      section.style.setProperty('--catalog-event-x',(travel*amplitude)+'px');
      section.style.setProperty('--catalog-photo-opacity',String(1-fade));
      section.style.setProperty('--catalog-photo-scale',String(1-.035*fade));
      section.style.setProperty('--catalog-copy-opacity',String(1-.22*fade));
      section.style.setProperty('--catalog-event-opacity',String(1-fade));
      section.style.setProperty('--catalog-copy-y',((preference.matches || mobile.matches)?0:Math.max(-10,Math.min(10,relativeTop/stride*10)))+'px');
    }
    if(smoothScroll!==target) frame=requestAnimationFrame(update);
    else lastTime=0;
  }
  function schedule(){if(!frame) frame=requestAnimationFrame(update);}
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>entry.isIntersecting?nearby.add(entry.target):nearby.delete(entry.target));
    schedule();
  },{rootMargin:'100% 0px',threshold:0});
  sections.forEach(section=>observer.observe(section));
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule);
  preference.addEventListener('change',schedule);
  mobile.addEventListener('change',schedule);
  state.motionCleanup=()=>{
    observer.disconnect();cancelAnimationFrame(frame);
    window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);
    preference.removeEventListener('change',schedule);mobile.removeEventListener('change',schedule);
  };
}

function setupObservers(){
  setupScrollMotion();
  // Recriado a cada troca de categoria (renderProducts substitui o
  // #catalogGrid inteiro) — desconecta os observers antigos antes, senão
  // ficam vazando, observando elementos que já não existem mais no DOM.
  state.sectionObserver?.disconnect();
  state.sectionObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if(entry.isIntersecting){
      entry.target.classList.add("is-visible");
      state.activeSection = entry.target;
      syncNavigation();
    }else{
      entry.target.classList.remove("is-visible");
    }
  }), { rootMargin: "-10% 0px -35% 0px", threshold: .08 });
  document.querySelectorAll(".catalog-product-section").forEach((section) => state.sectionObserver.observe(section));
}

function renderGate(title, message, href, label){
  document.body.innerHTML = `<div class="catalog-gate"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p><a class="catalog-gate-btn" href="${href}">${escapeHtml(label)}</a></div>`;
}

async function catalogRpc(name, params, attempts = 3){
  let lastError = null;
  for(let attempt = 1; attempt <= attempts; attempt++){
    try{
      const result = await supabase.rpc(name, params);
      if(!result.error || result.error?.code) return result;
      lastError = result.error;
    }catch(error){ lastError = error; }
    if(attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 650));
  }
  return { data: null, error: lastError || new Error("Falha de conexão") };
}

// Reconhece a equipe interna tanto pelo acesso de dentro do sistema
// (dashboard, sessionStorage.login_ok) quanto por um LOGIN DIRETO nesta
// mesma tela do catálogo, usando a própria conta do Supabase Auth (a
// MESMA de login.html) — pedido explícito do usuário: "ao invés de eu
// editar pelo sistema eu quero editar pelo catálogo mesmo... vou entrar
// com o meu login, e o catálogo vai reconhecer que o meu login pode
// fazer edições". Retorna o empresa_id se autorizado, ou null — nunca
// lança erro (decorador não tem sessão nenhuma do Supabase Auth, isso é
// esperado, não é falha). A autorização de verdade é sempre esta checagem
// (mesma que catalogo_carregar_interno já faz de novo no banco, via
// funcionario_pode(...,'comercial.catalogo.visualizar')) — o que roda
// aqui no cliente só decide se mostra UI de edição, nunca é a barreira
// real.
async function resolveAcessoInterno(){
  try{
    const { data: authData } = await supabase.auth.getUser();
    if(!authData?.user) return null;
    const empresaId = await getEmpresaAtualId();
    const { data: access, error: accessError } = await supabase.rpc("funcionario_contexto", { p_empresa_id: empresaId });
    if(accessError || !access?.ativo) return null;
    if(!access.administrador_legado){
      const { data: permissions, error } = await supabase.rpc("get_permissoes_usuario_resolvidas", { p_empresa_id: empresaId, p_usuario_id: authData.user.id });
      if(error || !permissions?.some((p) => p.chave === "comercial.catalogo.visualizar" && p.permitido)) return null;
    }
    return empresaId;
  }catch{
    return null;
  }
}

async function requireCatalogLogin(){
  const login = $("catalogLogin");
  const form = $("catalogLoginForm");
  const status = $("catalogLoginStatus");
  const savedToken = sessionStorage.getItem("catalogo_token");
  if(savedToken){
    const { data } = await catalogRpc("catalogo_validar_sessao", { p_token: savedToken });
    if(data?.valido){
      state.catalogSession = { token: savedToken, cliente_id: data.cliente_id, empresa_id: data.empresa_id };
      login.classList.add("hidden");
      return;
    }
    sessionStorage.removeItem("catalogo_token");
  }
  // O script anti-flash no <head> pode ter escondido esta tela achando
  // (pela sessionStorage) que a sessão ainda era válida — se chegou até
  // aqui é porque não era mais (token de decorador expirado, sessão da
  // equipe expirada/sem permissão). Sem isso, a tela ficava em branco:
  // nem o catálogo carregava (sem sessão) nem o login aparecia (ainda
  // escondido pelo script anti-flash).
  sessionStorage.removeItem("catalogo_acesso_interno_direto");
  login.classList.remove("hidden");
  await new Promise((resolve) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true; status.textContent = "Verificando acesso...";
    const email = $("catalogLoginEmail").value.trim().toLowerCase();
    const senha = $("catalogLoginPassword").value;

    // 1) Decorador (fluxo de sempre): e-mail/senha configurados pela
    // equipe pra um cliente específico — ver catalogo_login() no banco.
    const { data, error } = await catalogRpc("catalogo_login", { p_email: email, p_senha: senha });
    if(!error && data?.token){
      state.catalogSession = data;
      sessionStorage.setItem("catalogo_token", data.token);
      form.reset(); login.classList.add("hidden"); button.disabled = false; resolve();
      return;
    }
    const networkFailure = error && /failed to fetch|network|fetch failed/i.test(String(error.message || error));
    if(networkFailure){
      button.disabled = false;
      status.textContent = "Não foi possível conectar ao servidor. Verifique a internet e tente novamente.";
      return;
    }

    // 2) Não bateu como decorador — tenta como a PRÓPRIA equipe, com a
    // MESMA conta usada em login.html (Supabase Auth de verdade, não um
    // token do catálogo). Credenciais erradas aqui só retornam erro, não
    // deixam nenhuma sessão pendurada.
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password: senha });
    if(!authError && authData?.user){
      const empresaIdInterno = await resolveAcessoInterno();
      if(empresaIdInterno){
        state.catalogSession = { token: null, cliente_id: null, empresa_id: empresaIdInterno, interno: true };
        state.company = await carregarEmpresa();
        sessionStorage.setItem("catalogo_acesso_interno_direto", "1");
        form.reset(); login.classList.add("hidden"); button.disabled = false; resolve();
        return;
      }
      // Login válido, mas sem permissão de ver o catálogo — não deixa uma
      // sessão autenticada pendurada nesta aba pra quem não devia ter
      // acesso a mais nada aqui além do próprio login.
      await supabase.auth.signOut();
    }

    button.disabled = false;
    status.textContent = "E-mail ou senha inválidos.";
  }));
}

// Aberto de dentro do proprio sistema (equipe ja logada em login.html),
// nao pelo link publico enviado a um decorador — nesse caso mostra o
// catalogo padrao da empresa (todos os itens, sem personalizacao de um
// decorador especifico) e nao pede e-mail/senha de novo. Usado só pra
// decidir a classe visual .catalog-modo-sistema (esconde marca/busca do
// catálogo porque o dashboard já tem as suas) — a permissão de EDITAR em
// si vem de resolveAcessoInterno(), que reconhece a equipe tanto por
// aqui quanto por um login direto nesta própria tela (ver acima).
function acessoInternoDoSistema(){
  return Boolean(sessionStorage.getItem("login_ok"));
}

async function init(){
  ensureFonts();
  watchHeaderHeight();
  watchHomeGridWidth();
  if(!supabase){
    renderGate("Não foi possível conectar ao Acervo", "Abra esta página pelo endereço servido pelo sistema.", "../../../login.html", "Ir para o login");
    return;
  }
  try{
    if(acessoInternoDoSistema()){
      const empresaId = await getEmpresaAtualId();
      const { data: access, error: accessError } = await supabase.rpc("funcionario_contexto", { p_empresa_id: empresaId });
      const { data: auth } = await supabase.auth.getUser();
      if (accessError || !access?.ativo || !auth?.user) throw new Error("Acesso indisponível. Consulte o administrador.");
      if (!access.administrador_legado) {
        const { data: permissions, error } = await supabase.rpc("get_permissoes_usuario_resolvidas", { p_empresa_id: empresaId, p_usuario_id: auth.user.id });
        if (error || !permissions?.some(p => p.chave === "comercial.catalogo.visualizar" && p.permitido)) throw new Error("Você não possui permissão para acessar o catálogo.");
      }
      state.catalogSession = { token: null, cliente_id: null, empresa_id: empresaId };
      state.company = await carregarEmpresa();
      $("catalogLogin")?.classList.add("hidden");
      // Aberto de dentro do sistema: o dashboard ja tem seu proprio menu no
      // topo, entao a marca/busca/usuario do cabecalho do catalogo somem
      // (senao fica "menu dentro de menu") — ver .catalog-modo-sistema no
      // CSS. Só se aplica aqui (login_ok) — um login direto nesta própria
      // tela (ver bloco abaixo) continua mostrando o cabeçalho normal do
      // catálogo, igual um decorador veria.
      document.body.classList.add("catalog-modo-sistema");
      state.acessoInterno = true;
    }else{
      // Não veio de dentro do sistema (sem login_ok) — mas pode já ter uma
      // sessão da EQUIPE válida neste navegador (login direto anterior
      // nesta própria tela: o Supabase Auth persiste sozinho entre
      // recarregamentos, então não pede e-mail/senha de novo à toa).
      const empresaIdDireto = await resolveAcessoInterno();
      if(empresaIdDireto){
        state.catalogSession = { token: null, cliente_id: null, empresa_id: empresaIdDireto };
        state.company = await carregarEmpresa();
        $("catalogLogin")?.classList.add("hidden");
        sessionStorage.setItem("catalogo_acesso_interno_direto", "1");
        state.acessoInterno = true;
      }else{
        await requireCatalogLogin();
        state.acessoInterno = Boolean(state.catalogSession?.interno);
      }
    }
    const empresaId = state.catalogSession.empresa_id;
    state.items = await carregarItens();
    window.CatalogCredits?.refresh().catch(() => {});
    await carregarCapasGateway();
    initCatalogProjetos({
      supabase,
      getSession: () => state.catalogSession,
      isStaff: () => state.acessoInterno,
      findItem: findItemById,
      getDecorator: () => state.decorator,
      getCompany: () => state.company,
      listItems: () => allItemsFlat(),
      notify,
      goCatalog: () => applyView(HOME_VIEW),
      goLounge: () => openLoungeOverlay(),
      goStudio: () => openStudioOverlay(),
      openProjetos: (options) => openProjetosOverlay(options),
    });
    renderHeader();
    updateViewToggleButton();
    updateViewToggleVisibility();
    renderCurrentView();
    syncNavigation();
    bindInteractions();
    bindCatalogSession();
    bindCustomization();
    bindPhotoZoom();
    bindNavHistory();
    startEventRotation();
    initCatalogStudio3D({ items: state.items, supabase, empresaId, ownerId: state.catalogSession.cliente_id });
    initCatalogBiblioteca({
      supabase, empresaId, token: state.catalogSession.token,
      acessoInterno: state.acessoInterno, categories: getCategories(),
    });
    initCatalogLounge({ items: state.items, empresaId });
  }catch(error){
    console.error("Erro ao carregar catálogo:", error);
    const interno = acessoInternoDoSistema();
    renderGate("Não foi possível carregar o catálogo", "Recarregue para tentar novamente. Se o problema continuar, entre em contato com a Chiavari.", interno ? "../../../dashboard.html" : location.pathname, interno ? "Voltar ao painel" : "Tentar novamente");
  }
}

init();
