import { getEmpresaAtualId } from "../../Estoque/CadastroItens/itens.api.mjs";
import { initCatalogStudio3D } from "./catalogo-studio3d.mjs?v=20260915-creditos";

const supabase = window.supabaseClient;
const FOTO_PLACEHOLDER = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNDAgMjQwIj48cmVjdCB3aWR0aD0iMjQwIiBoZWlnaHQ9IjI0MCIgZmlsbD0iI2YxZjJmNCIvPjxnIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2M3Y2JkMSIgc3Ryb2tlLXdpZHRoPSI2IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxyZWN0IHg9IjYwIiB5PSI2OCIgd2lkdGg9IjEyMCIgaGVpZ2h0PSI5MCIgcng9IjgiLz48Y2lyY2xlIGN4PSI5MCIgY3k9Ijk2IiByPSIxMCIvPjxwYXRoIGQ9Ik02MCAxNDMgTDEwMCAxMTMgTDEzMCAxMzggTDE1NSAxMTYgTDE4MCAxNDMiLz48L2c+PHRleHQgeD0iMTIwIiB5PSIxODIiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgSGVsdmV0aWNhLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE2IiBmaWxsPSIjOWFhMGE4Ij5TZW0gZm90bzwvdGV4dD48L3N2Zz4=";
const DESTAQUES_VIEW = "__destaques__";
const state = { items: [], activeView: DESTAQUES_VIEW, company: null, decorator: null, catalogSession: null, sectionObserver: null, modelObserver: null, activeSection: null, eventTimer: null, customizeItem: null, fabricDataUrl: "", fabricFile: null };
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[ch]));
const escapeAttr = (value) => escapeHtml(value).replace(/`/g, "&#96;");
const normalizeSearch = (value) => String(value || "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function notify({ title, message, status = "done", actionLabel = "", onAction = null, duration = 7000 }){
  const host = $("catalogNotifications");
  if(!host) return { close(){} };
  const toast = document.createElement("article");
  toast.className = `catalog-notification is-${status}`;
  toast.innerHTML = `<span class="catalog-notification-icon" aria-hidden="true">${status === "error" ? "!" : "✓"}</span><div class="catalog-notification-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>${actionLabel ? `<button type="button" class="catalog-notification-action">${escapeHtml(actionLabel)}</button>` : ""}<button type="button" class="catalog-notification-close" aria-label="Fechar">×</button>`;
  host.appendChild(toast);
  let timer = null;
  const close = () => {
    if(!toast.isConnected) return;
    clearTimeout(timer);
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 300);
  };
  toast.querySelector(".catalog-notification-close")?.addEventListener("click", close);
  toast.querySelector(".catalog-notification-action")?.addEventListener("click", () => { onAction?.(); close(); });
  if(duration > 0) timer = window.setTimeout(close, duration);
  return { close, element: toast };
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
    cor: row.cor || "",
    personalizable: row.personalizable === true,
    cat: slugify(row.categoria),
    catLabel: row.categoria || "Sem categoria",
    name: nome,
    dims: formatDims(row.largura, row.altura, row.profundidade),
    dimensions: {
      width: Number(row.largura) > 0 ? Number(row.largura) : null,
      height: Number(row.altura) > 0 ? Number(row.altura) : null,
      depth: Number(row.profundidade) > 0 ? Number(row.profundidade) : null,
    },
    desc: row.descricao_complementar || "",
    destaque: row.destaque_site === true,
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
      { label: "Código", value: row.referencia },
    ].filter((spec) => String(spec.value || "").trim()),
    photo: row.foto_url || FOTO_PLACEHOLDER,
    glb: model && model.status !== "removido" ? model.url : null,
    details: details.map((photo) => ({ img: photo.url, label: photo.titulo || `Detalhe de ${nome}` })),
    events: events.map((photo) => ({ img: photo.url, label: photo.titulo || `${nome} em evento` })),
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
    const principal = ordenadas.find((variante) => variante.destaque) || ordenadas[0];
    principal.destaque = ordenadas.some((variante) => variante.destaque);
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

function groupedCatalogCategories(){
  const groups = [
    { label: "Assentos", matches: /banco|banqueta|bistro|cadeira|estofado|poltrona|sofa/, categories: [] },
    { label: "Mesas", matches: /mesa/, categories: [] },
    { label: "Apoio e armazenamento", matches: /aparador|armario|estante|bares|buffet|balcao/, categories: [] },
    { label: "Decoração", matches: /objeto|decoracao|vaso|luminaria|tapete/, categories: [] },
    { label: "Outras categorias", matches: /.*/, categories: [] }
  ];
  getCategories().forEach(category => groups.find(group => group.matches.test(normalizeSearch(category.label))).categories.push(category));
  return groups.filter(group => group.categories.length);
}

function renderHeader(){
  const logo = $("catalogBrandLogo");
  const name = $("catalogBrandName");
  const categories = $("catalogHeaderCategories");
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

  categories.innerHTML = `<button type="button" class="catalog-header-category" data-header-category="${DESTAQUES_VIEW}">Destaques</button>`
    + groupedCatalogCategories().map(group => `<details class="catalog-category-group">
      <summary class="catalog-group-trigger">${escapeHtml(group.label)}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary>
      <div class="catalog-category-panel"><span class="catalog-category-heading">${escapeHtml(group.label)}</span>${group.categories.map(category =>
        `<button type="button" class="catalog-header-category" data-header-category="${escapeAttr(category.cat)}">${escapeHtml(category.label)}</button>`
      ).join("")}</div></details>`).join("");
  setHeaderCategory(state.activeView);

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

// O cabecalho pode ocupar mais de uma linha (categorias quebram quando nao
// cabem todas lado a lado — pedido explicito do usuario pra nunca esconder
// nenhuma atras de scroll horizontal, ver .catalog-header-categories no
// CSS). --header-h e usado em varios lugares (altura de cada secao de
// produto, do Painel 3D) para descontar exatamente o espaco do cabecalho —
// por isso precisa refletir a altura REAL renderizada, nao um numero fixo.
// ResizeObserver acompanha qualquer mudanca (categorias carregadas, janela
// redimensionada, quebra de linha diferente em telas menores).
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

function setHeaderCategory(cat){
  document.querySelectorAll(".catalog-header-category[data-header-category]").forEach((button) => {
    const active = button.dataset.headerCategory === cat;
    button.classList.toggle("active", active);
    if(active) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll('.catalog-category-group').forEach(group => {
    group.classList.toggle('has-active', Boolean(group.querySelector('[aria-current="true"]')));
  });
}

// O catálogo mostra só UMA categoria (ou só os Destaques) de cada vez —
// pedido explícito do usuário: antes ele renderizava TODOS os itens de
// uma vez (uma seção de tela cheia por item, todas empilhadas), pesado
// pra carregar e sem separação real por categoria (clicar numa categoria
// só rolava a tela até ela, sem esconder o resto). Trocar de categoria ou
// ir pra Destaques re-renderiza só o subconjunto certo.
function itemsForView(view){
  return view === DESTAQUES_VIEW
    ? state.items.filter((item) => item.destaque)
    : state.items.filter((item) => item.cat === view);
}

function applyView(view){
  state.activeView = view;
  setHeaderCategory(view);
  renderProducts(itemsForView(view));
  // "auto" aqui respeitaria o `scroll-behavior:smooth` do <html> (definido
  // em catalogo.css pros outros scrolls do catálogo) e animaria a subida —
  // exatamente o efeito que o usuário pediu pra tirar ao trocar de
  // categoria/Destaques. "instant" ignora esse CSS e pula direto pro topo.
  window.scrollTo({ top: 0, behavior: "instant" });
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

function detailGallery(item){
  if(!item.details.length) return `<div class="detail-gallery-empty">SEM FOTOS DE DETALHE</div>`;
  return `<div class="detail-gallery">${item.details.map((detail) =>
    `<button type="button" class="detail-thumb" data-detail-src="${escapeAttr(detail.img)}" data-detail-alt="${escapeAttr(detail.label)}" aria-label="Exibir ${escapeAttr(detail.label)} como foto principal"><img src="${escapeAttr(detail.img)}" alt="${escapeAttr(detail.label)}" loading="lazy" decoding="async"></button>`
  ).join("")}</div>`;
}

function modelBlock(item, index){
  if(!item.glb) return `<div class="model-card"><div class="model-fallback">MODELO 3D INDISPONÍVEL</div></div>`;
  return `<div class="model-card">
    <div class="model-stage" data-index="${index}"><img src="${escapeAttr(item.photo)}" alt="Prévia de ${escapeAttr(item.name)}" loading="lazy" decoding="async"></div>
    <button type="button" class="model-action" data-model-open aria-label="Interagir com o modelo 3D">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m12 2 8.5 5v10L12 22l-8.5-5V7L12 2Z"/><path d="m3.5 7 8.5 5 8.5-5M12 12v10"/></svg>
      VER EM 3D
    </button>
  </div>`;
}

// Card de variantes (pedido explícito do usuário, estilo marketplace):
// miniatura de cada variante do grupo (ver agruparVariantes), rotulada
// pela Cor + Descrição complementar quando existirem. Fica escondido
// quando o grupo tem só 1 variante (produto sem irmãs de cor).
function variantSwatchesBlock(item){
  const grupo = item.variantGroup;
  if(!grupo || grupo.length < 2) return "";
  return `<div class="product-variants">
    <span class="section-kicker">Cores disponíveis</span>
    <div class="product-variants-row">
      ${grupo.map((variante) => {
        const rotulo = [variante.cor, variante.desc].filter((valor) => String(valor || "").trim()).join(" ") || "Padrão";
        return `<button type="button" class="product-variant-swatch ${String(variante.id) === String(item.id) ? "active" : ""}" data-variant-id="${escapeAttr(variante.id)}" title="${escapeAttr(rotulo)}" aria-label="${escapeAttr(rotulo)}">
          <span class="product-variant-swatch-photo"><img src="${escapeAttr(variante.photo)}" alt="${escapeAttr(rotulo)}" loading="lazy" decoding="async"></span>
          <span class="product-variant-swatch-label">${escapeHtml(variante.cor || rotulo)}</span>
        </button>`;
      }).join("")}
    </div>
  </div>`;
}

function productTemplate(item, index){
  const event = item.events[0];
  const personalizavel = item.personalizable || item.variantGroup?.some((variante) => variante.personalizable);
  return `<section class="catalog-product-section" id="produto-${escapeAttr(item.id)}" data-product-id="${escapeAttr(item.id)}" data-category="${escapeAttr(item.cat)}" data-search="${escapeAttr(normalizeSearch(`${item.name} ${item.catLabel || ""}`))}">
    <div class="catalog-detail-panel">
      <div class="catalog-detail-top">
        <div class="product-copy product-reveal">
          <h1 class="product-title">${escapeHtml(item.name)}</h1>
          ${item.dims ? `<p class="product-dimensions">${escapeHtml(item.dims)}</p>` : ""}
          <div class="product-rule" aria-hidden="true"></div>
          ${specsPanel(item)}
          ${personalizavel ? `<button type="button" class="product-bespoke-card ${item.personalizable ? "" : "hidden"}" data-customize-item="${escapeAttr(item.id)}"><span>SOB MEDIDA</span><strong>Experimente outro tecido</strong><small>Personalize com inteligência artificial →</small></button>` : ""}
          ${variantSwatchesBlock(item)}
        </div>
        <div class="product-main-media product-reveal">
          <img class="product-main-image" src="${escapeAttr(item.photo)}" alt="${escapeAttr(item.name)}" data-original-src="${escapeAttr(item.photo)}" data-original-alt="${escapeAttr(item.name)}" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
          <button type="button" class="product-main-back hidden" data-main-back aria-label="Voltar à foto principal">← FOTO PRINCIPAL</button>
        </div>
      </div>
      <div class="catalog-detail-lower product-reveal">
        <div class="detail-gallery-block"><span class="section-kicker">Detalhes</span>${detailGallery(item)}</div>
        <div class="model-block"><span class="section-kicker">Visualização 3D</span>${modelBlock(item, index)}</div>
      </div>
    </div>
    <aside class="product-event-panel">
      ${event ? `<img class="product-event-image" src="${escapeAttr(event.img)}" alt="${escapeAttr(event.label)}" data-event-index="0" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">` : `<img class="event-fallback" src="${escapeAttr(FOTO_PLACEHOLDER)}" alt="Sem foto">`}
    </aside>
  </section>`;
}

function renderProducts(items){
  const grid = $("catalogGrid");
  grid.innerHTML = items.map((item, index) => productTemplate(item, index, items.length)).join("");
  $("catalogEmpty")?.classList.toggle("hidden", items.length > 0);
  // Cada troca de categoria/Destaques substitui o conteúdo de #catalogGrid
  // inteiro — os observers antigos (setupObservers) ficam apontando pra
  // elementos que não existem mais, então precisam ser recriados aqui.
  setupObservers();
  requestAnimationFrame(() => grid.querySelector(".catalog-product-section")?.classList.add("is-visible"));
}

function scrollToIndex(index){
  document.querySelectorAll(".catalog-product-section")[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindInteractions(){
  $("catalogGrid").addEventListener("click", (event) => {
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
    const thumb = event.target.closest("[data-detail-src]");
    if(thumb){
      const section = thumb.closest(".catalog-product-section");
      const mainImage = section?.querySelector(".product-main-image");
      if(!mainImage) return;
      section.querySelector(".product-main-model")?.remove();
      mainImage.classList.remove("hidden");
      section.querySelector("[data-main-back]")?.classList.remove("hidden");
      if(mainImage.src === thumb.dataset.detailSrc){
        mainImage.classList.remove("is-changing");
        return;
      }
      mainImage.classList.add("is-changing");
      setTimeout(() => {
        mainImage.src = thumb.dataset.detailSrc;
        mainImage.alt = thumb.dataset.detailAlt;
        section.querySelectorAll(".detail-thumb").forEach((item) => item.classList.toggle("active", item === thumb));
        requestAnimationFrame(() => mainImage.classList.remove("is-changing"));
      }, 120);
      return;
    }
    const modelButton = event.target.closest("[data-model-open]");
    if(modelButton){
      const section = modelButton.closest(".catalog-product-section");
      const item = findItemById(section?.dataset.productId);
      if(item?.glb) showModelInMain(section, item);
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
    const backButton = event.target.closest("[data-main-back]");
    if(backButton){
      restoreMainPhoto(backButton.closest(".catalog-product-section"));
    }
  });

  const warmHoveredModel = (event) => {
    const button = event.target.closest("[data-model-open]");
    if(!button) return;
    const section = button.closest(".catalog-product-section");
    const item = findItemById(section?.dataset.productId);
    if(item) warmModelExperience(item);
  };
  $("catalogGrid").addEventListener("pointerover", warmHoveredModel, { passive: true });
  $("catalogGrid").addEventListener("focusin", warmHoveredModel);

  const closeCompactNavigation = () => {
    document.querySelector('.catalog-navigation')?.classList.remove('is-open');
    document.querySelector('.catalog-nav-toggle')?.setAttribute('aria-expanded', 'false');
  };
  document.querySelector('.catalog-nav-toggle')?.addEventListener('click', event => {
    const open = document.querySelector('.catalog-navigation').classList.toggle('is-open');
    event.currentTarget.setAttribute('aria-expanded', String(open));
  });
  document.querySelector(".catalog-header")?.addEventListener("click", (event) => {
    const studioToggle = event.target.closest("[data-studio-toggle]");
    if(studioToggle){
      closeCompactNavigation();
      document.querySelectorAll('.catalog-category-group[open]').forEach(group => { group.open = false; });
      const opening = $("catalogStudio")?.classList.contains("hidden");
      $("catalogStudio")?.classList.toggle("hidden", !opening);
      $("catalogGrid")?.classList.toggle("hidden", opening);
      $("catalogSearch")?.closest(".catalog-search")?.classList.toggle("hidden", opening);
      studioToggle.classList.toggle("active", opening);
      setHeaderCategory(opening ? null : state.activeView);
      if(opening) window.dispatchEvent(new Event("catalog-studio-open"));
      return;
    }
    const button = event.target.closest("[data-header-category]");
    if(!button) return;
    $("catalogStudio")?.classList.add("hidden");
    $("catalogGrid")?.classList.remove("hidden");
    $("catalogSearch")?.closest(".catalog-search")?.classList.remove("hidden");
    document.querySelector("[data-studio-toggle]")?.classList.remove("active");
    if($("catalogSearch")) $("catalogSearch").value = "";
    applyView(button.dataset.headerCategory);
    const group = button.closest('.catalog-category-group');
    if(group){ group.open = false; group.querySelector('summary').focus({ preventScroll: true }); }
    if(document.querySelector('.catalog-navigation.is-open')){
      closeCompactNavigation();
      document.querySelector('.catalog-nav-toggle').focus({ preventScroll: true });
    }
  });

  document.querySelectorAll('.catalog-category-group').forEach(group => {
    group.addEventListener('toggle', () => {
      if(group.open) document.querySelectorAll('.catalog-category-group[open]').forEach(other => { if(other !== group) other.open = false; });
    });
  });
  document.addEventListener('click', event => {
    if(!event.target.closest('.catalog-navigation')) closeCompactNavigation();
    document.querySelectorAll('.catalog-category-group[open]').forEach(group => { if(!group.contains(event.target)) group.open = false; });
  });
  document.addEventListener('keydown', event => {
    if(event.key !== 'Escape') return;
    if(document.querySelector('.catalog-navigation.is-open')){
      closeCompactNavigation();
      document.querySelector('.catalog-nav-toggle').focus();
    }
    document.querySelectorAll('.catalog-category-group[open]').forEach(group => {
      group.open = false;
      if(group.contains(document.activeElement)) group.querySelector('summary').focus();
    });
  });

  $("catalogSearch")?.addEventListener("input", (event) => {
    const query = normalizeSearch(event.target.value.trim());
    // Busca precisa varrer TODAS as categorias, não só a view ativa: como
    // só a categoria (ou Destaques) atual fica no DOM por vez (ver
    // itemsForView/applyView, pedido explícito de performance), filtrar
    // apenas as seções já renderizadas fazia a busca "não achar" um item
    // que existe mas está numa categoria diferente da aba aberta no
    // momento — reproduzido de verdade: abrir o catálogo (cai em
    // Destaques) e buscar "mesa" não encontrava nenhuma das Mesas de
    // Convidados, que só aparecem ao clicar na aba própria. Corrigido
    // re-renderizando a partir de `state.items` inteiro quando há busca.
    if(!query){
      renderProducts(itemsForView(state.activeView));
      return;
    }
    const matches = state.items.filter((item) =>
      normalizeSearch(`${item.name} ${item.catLabel || ""}`).includes(query)
    );
    renderProducts(matches);
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
    context.fillStyle = "#f7f3ec";
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
  $("catalogCustomizeProduct").src = item.customizedPhoto || item.photo;
  $("catalogCustomizeProduct").alt = item.name;
  $("catalogFabricPreview").src = "";
  $("catalogFabricPreview").classList.add("hidden");
  $("catalogFabricUpload").classList.remove("has-fabric");
  $("catalogFabricInput").value = "";
  $("catalogCustomizeGenerate").disabled = true;
  $("catalogCustomizeStatus").textContent = "";
  $("catalogCustomizeDialog").showModal();
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
  const workingToast = notify({ title: "Personalização em andamento", message: `${item.name} está recebendo o novo tecido. Você pode continuar navegando.`, status: "working", duration: 0 });
  try{
    const empresaId = state.catalogSession.empresa_id;
    const { data, error } = await window.CatalogCredits.invoke("studio-ai-engine", {
      body: {
        empresa_id: empresaId,
        catalog_token: state.catalogSession.token,
        prompt: `Edite exclusivamente o revestimento têxtil do móvel da primeira imagem, aplicando com alta fidelidade o tecido fornecido na segunda imagem. Preserve absolutamente o mesmo ${item.name}: geometria, desenho, estrutura, junco, madeira, metal, pés, costuras, almofadas, volumes, perspectiva, enquadramento, iluminação, sombras e resolução. O fundo deve ser liso, uniforme e totalmente opaco na cor creme exata do catálogo #F7F3EC, sem cenário, textura, gradiente, preto, branco puro ou transparência. O contorno do móvel deve permanecer limpo, natural e sem halos. Não redesenhe o móvel, não altere cores de partes não estofadas e não modifique o ambiente. A textura deve acompanhar dobras, costuras e direção real do tecido.`,
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
      section.querySelector(".product-main-model")?.remove();
      image.src = src;
      image.alt = `${item.name} com tecido personalizado`;
      image.classList.remove("hidden");
      section.querySelector("[data-main-back]")?.classList.remove("hidden");
    }
    workingToast.close();
    notify({
      title: "Sua personalização ficou pronta",
      message: `${item.name} já está com o novo tecido.`,
      actionLabel: "Ver resultado",
      duration: 12000,
      onAction: () => openCustomizeDialog(item),
    });
  }catch(error){
    console.error("Erro ao personalizar tecido:", error);
    const rawDetail = String(error?.message || "").trim();
    const detail = /billing hard limit|billing limit|quota/i.test(rawDetail)
      ? "O limite de uso da IA foi atingido. Regularize o faturamento da API para continuar."
      : rawDetail;
    workingToast.close();
    $("catalogCustomizeStatus").textContent = detail || "Não foi possível aplicar o tecido. Tente novamente.";
    notify({ title: "Personalização não concluída", message: detail || "Não foi possível gerar esta versão. Tente novamente.", status: "error", duration: 12000 });
  }finally{
    state.fabricGenerating = false;
    $("catalogFabricInput").disabled = false;
    $("catalogAiLoading").classList.add("hidden");
    button.disabled = false;
    button.textContent = "Aplicar tecido com IA";
  }
}

function bindCustomization(){
  $("catalogCustomizeClose")?.addEventListener("click", () => $("catalogCustomizeDialog").close());
  $("catalogFabricInput")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if(!file) return;
    if(!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024){
      state.fabricDataUrl = "";
      state.fabricFile = null;
      $("catalogCustomizeGenerate").disabled = true;
      $("catalogCustomizeStatus").textContent = "Envie uma imagem PNG, JPG ou WebP de até 8 MB.";
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
  });
  $("catalogCustomizeGenerate")?.addEventListener("click", generateFabricVariation);
}

let modelViewerPromise = null;
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

function isEconomyDevice(){
  const cores = Number(navigator.hardwareConcurrency) || 4;
  const memory = Number(navigator.deviceMemory) || 4;
  return cores <= 4 || memory <= 4 || matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function warmModelExperience(item){
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if(item?.glb && !connection?.saveData && !/2g/.test(connection?.effectiveType || "")){
    loadModelAsset(item.glb).catch(() => { /* O clique normal permite tentar novamente. */ });
  }
  ensureModelViewer().catch(() => { /* O clique apresenta a mensagem de erro. */ });
}

function supportsWebGL(){
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

async function ensureModelViewer(){
  if(customElements.get("model-viewer")) return;
  if(!modelViewerPromise){
    modelViewerPromise = import("../../../js/vendor/model-viewer/model-viewer.min.js")
      .catch((error) => { modelViewerPromise = null; throw error; });
  }
  await modelViewerPromise;
}

function restoreMainPhoto(section){
  const image = section?.querySelector(".product-main-image");
  if(!image) return;
  section.querySelector(".product-main-model")?.remove();
  image.src = image.dataset.originalSrc;
  image.alt = image.dataset.originalAlt;
  image.classList.remove("hidden", "is-changing");
  section.querySelectorAll(".detail-thumb").forEach((thumb) => thumb.classList.remove("active"));
  section.querySelector("[data-main-back]")?.classList.add("hidden");
}

// Troca de variante (clique numa miniatura de cor): atualiza no lugar só
// as partes que podem mudar entre variantes do mesmo grupo (foto, texto
// complementar, specs, card de personalização, galeria de detalhe, bloco
// 3D e foto de evento) — nome/medida ficam intactos de propósito, já que
// são justamente o que garante que as variantes pertencem ao mesmo grupo
// (ver chaveVariante). Reaproveita specsPanel/detailGallery/modelBlock
// pra nunca desenhar esses blocos de um jeito diferente do render inicial.
function applyVariant(section, variant){
  section.dataset.productId = String(variant.id);
  section.id = `produto-${variant.id}`;

  const mainImage = section.querySelector(".product-main-image");
  if(mainImage){
    section.querySelector(".product-main-model")?.remove();
    mainImage.classList.remove("hidden");
    section.querySelector("[data-main-back]")?.classList.add("hidden");
    if(mainImage.dataset.originalSrc !== variant.photo){
      mainImage.classList.add("is-changing");
      setTimeout(() => {
        mainImage.src = variant.photo;
        mainImage.alt = variant.name;
        mainImage.dataset.originalSrc = variant.photo;
        mainImage.dataset.originalAlt = variant.name;
        requestAnimationFrame(() => mainImage.classList.remove("is-changing"));
      }, 120);
    }
  }

  section.querySelector(".product-specs")?.remove();
  const bespokeCard = section.querySelector(".product-bespoke-card");
  const specsHtml = specsPanel(variant);
  if(specsHtml){
    const anchor = bespokeCard || section.querySelector(".product-variants");
    anchor?.insertAdjacentHTML("beforebegin", specsHtml);
  }

  if(bespokeCard){
    bespokeCard.classList.toggle("hidden", !variant.personalizable);
    bespokeCard.dataset.customizeItem = String(variant.id);
  }

  const detailBlock = section.querySelector(".detail-gallery-block");
  if(detailBlock) detailBlock.innerHTML = `<span class="section-kicker">Detalhes</span>${detailGallery(variant)}`;

  const modelBlockEl = section.querySelector(".model-block");
  if(modelBlockEl){
    const index = [...document.querySelectorAll(".catalog-product-section")].indexOf(section);
    modelBlockEl.innerHTML = `<span class="section-kicker">Visualização 3D</span>${modelBlock(variant, index)}`;
  }

  const eventPanel = section.querySelector(".product-event-panel");
  if(eventPanel){
    const event = variant.events[0];
    eventPanel.innerHTML = event
      ? `<img class="product-event-image" src="${escapeAttr(event.img)}" alt="${escapeAttr(event.label)}" data-event-index="0" loading="lazy" decoding="async">`
      : `<img class="event-fallback" src="${escapeAttr(FOTO_PLACEHOLDER)}" alt="Sem foto">`;
  }

  section.querySelectorAll(".product-variant-swatch").forEach((button) => {
    button.classList.toggle("active", button.dataset.variantId === String(variant.id));
  });
}

async function showModelInMain(section, item){
  const media = section?.querySelector(".product-main-media");
  const image = media?.querySelector(".product-main-image");
  if(!media || !image || media.querySelector(".product-main-model")) return;
  document.querySelectorAll(".product-main-model").forEach((model) => {
    const owner = model.closest(".catalog-product-section");
    model.remove();
    owner?.querySelector(".product-main-image")?.classList.remove("hidden");
  });
  if(!supportsWebGL()){
    const notice = document.createElement("div");
    notice.className = "product-main-model product-main-3d-error";
    notice.innerHTML = "<strong>3D indisponível neste navegador</strong><span>Ative a aceleração de hardware nas configurações do navegador e recarregue a página.</span>";
    image.classList.add("hidden");
    media.appendChild(notice);
    section.querySelector("[data-main-back]")?.classList.remove("hidden");
    return;
  }
  const stage = document.createElement("div");
  stage.className = "product-main-model is-loading";
  stage.innerHTML = `<img class="product-main-model-poster" src="${escapeAttr(item.photo)}" alt=""><div class="product-main-model-loading" role="status"><i aria-hidden="true"></i><span>Carregando modelo 3D…</span></div>`;
  image.classList.add("hidden");
  media.appendChild(stage);
  section.querySelector("[data-main-back]")?.classList.remove("hidden");
  try{
    const status = stage.querySelector(".product-main-model-loading span");
    const [, modelUrl] = await Promise.all([
      ensureModelViewer(),
      loadModelAsset(item.glb, (progress) => {
        const percent = Math.round(progress * 100);
        if(status && percent > 0 && percent < 100) status.textContent = `Baixando modelo 3D… ${percent}%`;
      }),
    ]);
    if(!stage.isConnected) return;
    const viewer = document.createElement("model-viewer");
    viewer.src = modelUrl;
    viewer.alt = `Modelo 3D de ${item.name}`;
    viewer.setAttribute("poster", item.photo);
    viewer.setAttribute("loading", "eager");
    viewer.setAttribute("reveal", "auto");
    viewer.setAttribute("camera-controls", "");
    if(!isEconomyDevice()) viewer.setAttribute("auto-rotate", "");
    viewer.setAttribute("auto-rotate-delay", "1800");
    viewer.setAttribute("rotation-per-second", "7deg");
    viewer.setAttribute("interaction-prompt", "auto");
    viewer.setAttribute("shadow-intensity", isEconomyDevice() ? ".18" : ".4");
    viewer.setAttribute("exposure", ".95");
    viewer.addEventListener("progress", (event) => {
      const progress = Math.round(Number(event.detail?.totalProgress || 0) * 100);
      if(status && progress > 0 && progress < 100) status.textContent = `Carregando modelo 3D… ${progress}%`;
    });
    viewer.addEventListener("load", () => stage.classList.remove("is-loading"), { once: true });
    viewer.addEventListener("error", () => {
      stage.classList.add("has-error");
      if(status) status.textContent = "Não foi possível abrir este modelo.";
    }, { once: true });
    stage.appendChild(viewer);
  }catch(error){
    console.warn("Não foi possível abrir o modelo 3D:", error);
    stage.classList.add("has-error");
    const status = stage.querySelector(".product-main-model-loading span");
    if(status) status.textContent = "Não foi possível iniciar a visualização 3D.";
  }
}

function rotateActiveEvent(){
  if(document.hidden || $("catalogGrid")?.classList.contains("hidden")) return;
  const section = state.activeSection;
  if(!section) return;
  const item = findItemById(section.dataset.productId);
  const image = section.querySelector(".product-event-image");
  const panel = section.querySelector(".product-event-panel");
  if(!image || !panel || panel.dataset.transitioning === "true" || !item || item.events.length < 2) return;

  const nextIndex = (Number(image.dataset.eventIndex || 0) + 1) % item.events.length;
  const nextEvent = item.events[nextIndex];
  panel.dataset.transitioning = "true";

  const nextImage = new Image();
  nextImage.className = "product-event-image product-event-image-next";
  nextImage.alt = nextEvent.label;
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
    }, 900);
  };
  nextImage.onerror = () => {
    delete panel.dataset.transitioning;
  };
  nextImage.src = nextEvent.img;
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
      section.style.setProperty('--catalog-details-x',(-travel*amplitude*.35)+'px');
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
  // Recriado a cada troca de categoria/Destaques (renderProducts substitui
  // o #catalogGrid inteiro) — desconecta os observers antigos antes, senão
  // ficam vazando, observando elementos que já não existem mais no DOM.
  state.sectionObserver?.disconnect();
  state.modelObserver?.disconnect();
  state.sectionObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if(entry.isIntersecting){
      entry.target.classList.add("is-visible");
      state.activeSection = entry.target;
      // NÃO chama mais setHeaderCategory aqui: agora só uma categoria (ou
      // só os Destaques, que mistura categorias diferentes) fica no DOM
      // por vez, então a aba ativa do cabeçalho é controlada só por
      // applyView() — se isso chamasse setHeaderCategory com a categoria
      // própria de CADA item, a aba "DESTAQUES" trocaria sozinha assim que
      // um item de outra categoria entrasse na tela.
    }else{
      entry.target.classList.remove("is-visible");
    }
  }), { rootMargin: "-10% 0px -35% 0px", threshold: .08 });
  document.querySelectorAll(".catalog-product-section").forEach((section) => state.sectionObserver.observe(section));
  state.modelObserver = new IntersectionObserver((entries, observer) => entries.forEach((entry) => {
    if(!entry.isIntersecting) return;
    const section = entry.target.closest(".catalog-product-section");
    const item = findItemById(section?.dataset.productId);
    if(item){
      const warm = () => warmModelExperience(item);
      if("requestIdleCallback" in window) window.requestIdleCallback(warm, { timeout: 1600 });
      else window.setTimeout(warm, 450);
    }
    observer.unobserve(entry.target);
  }), { rootMargin: "300px 0px", threshold: .01 });
  document.querySelectorAll(".model-card").forEach((card) => state.modelObserver.observe(card));
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
  await new Promise((resolve) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true; status.textContent = "Verificando acesso...";
    const { data, error } = await catalogRpc("catalogo_login", {
      p_email: $("catalogLoginEmail").value.trim().toLowerCase(), p_senha: $("catalogLoginPassword").value,
    });
    button.disabled = false;
    if(error){
      const networkFailure = /failed to fetch|network|fetch failed/i.test(String(error.message || error));
      status.textContent = networkFailure ? "Não foi possível conectar ao servidor. Verifique a internet e tente novamente." : (error.message || "Não foi possível validar o acesso.");
      return;
    }
    if(!data?.token){ status.textContent = "E-mail ou senha inválidos."; return; }
    state.catalogSession = data;
    sessionStorage.setItem("catalogo_token", data.token);
    form.reset(); login.classList.add("hidden"); resolve();
  }));
}

// Aberto de dentro do proprio sistema (equipe ja logada em login.html),
// nao pelo link publico enviado a um decorador — nesse caso mostra o
// catalogo padrao da empresa (todos os itens, sem personalizacao de um
// decorador especifico) e nao pede e-mail/senha de novo.
function acessoInternoDoSistema(){
  return Boolean(sessionStorage.getItem("login_ok"));
}

async function init(){
  ensureFonts();
  watchHeaderHeight();
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
      // (senao fica "menu dentro de menu") e sobram so as categorias, num
      // visual mais simples de abas — ver .catalog-modo-sistema no CSS.
      document.body.classList.add("catalog-modo-sistema");
    }else{
      await requireCatalogLogin();
    }
    const empresaId = state.catalogSession.empresa_id;
    state.items = await carregarItens();
    window.CatalogCredits?.refresh().catch(() => {});
    // Destaques é a tela de entrada (pedido explícito do usuário) — só cai
    // pra a primeira categoria se não houver nenhum item marcado como
    // destaque ainda, nunca pra "todos os itens de uma vez" (isso é
    // exatamente o carregamento pesado que o usuário pediu pra evitar).
    if(!state.items.some((item) => item.destaque)){
      state.activeView = getCategories()[0]?.cat || null;
    }
    renderHeader();
    renderProducts(state.activeView ? itemsForView(state.activeView) : state.items);
    bindInteractions();
    bindCatalogSession();
    bindCustomization();
    startEventRotation();
    initCatalogStudio3D({ items: state.items, supabase, empresaId, ownerId: state.catalogSession.cliente_id });
  }catch(error){
    console.error("Erro ao carregar catálogo:", error);
    const interno = acessoInternoDoSistema();
    renderGate("Não foi possível carregar o catálogo", "Recarregue para tentar novamente. Se o problema continuar, entre em contato com a Chiavari.", interno ? "../../../dashboard.html" : location.pathname, interno ? "Voltar ao painel" : "Tentar novamente");
  }
}

init();
