import { getEmpresaAtualId } from "../../Estoque/CadastroItens/itens.api.mjs";
import { initCatalogStudio3D } from "./catalogo-studio3d.mjs?v=20260911-render-options";

const supabase = window.supabaseClient;
const FOTO_PLACEHOLDER = "https://awemuohtvwvrdzfxwrmd.supabase.co/storage/v1/object/public/logos/placeholders/sem-foto.png";
const state = { items: [], company: null, decorator: null, catalogSession: null, sectionObserver: null, modelObserver: null, activeSection: null, eventTimer: null, customizeItem: null, fabricDataUrl: "", fabricFile: null };
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

function mapRow(row){
  const model = Array.isArray(row.itens_modelos_3d) ? row.itens_modelos_3d[0] : row.itens_modelos_3d;
  const photos = (row.itens_fotos || []).filter((photo) => photo.url).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const details = photos.filter((photo) => photo.tipo === "detalhe");
  const events = photos.filter((photo) => photo.tipo === "galeria" && String(photo.cliente_id || "") === String(state.catalogSession?.cliente_id || ""));
  return {
    id: row.id,
    personalizable: row.personalizable === true,
    cat: slugify(row.categoria),
    catLabel: row.categoria || "Sem categoria",
    name: row.produto || "Item sem nome",
    dims: formatDims(row.largura, row.altura, row.profundidade),
    dimensions: {
      width: Number(row.largura) > 0 ? Number(row.largura) : null,
      height: Number(row.altura) > 0 ? Number(row.altura) : null,
      depth: Number(row.profundidade) > 0 ? Number(row.profundidade) : null,
    },
    desc: row.descricao_complementar || "",
    photo: row.foto_url || FOTO_PLACEHOLDER,
    glb: model && model.status !== "removido" ? model.url : null,
    details: details.map((photo) => ({ img: photo.url, label: photo.titulo || `Detalhe de ${row.produto || "produto"}` })),
    events: events.map((photo) => ({ img: photo.url, label: photo.titulo || `${row.produto || "Produto"} em evento` })),
  };
}

async function carregarItens(){
  if(state.catalogSession?.token){
    const { data, error } = await catalogRpc("catalogo_carregar", { p_token: state.catalogSession.token });
    if(error) throw error;
    state.company = data?.empresa || null;
    state.decorator = data?.decorador || null;
    return (data?.itens || []).map(mapRow);
  }
  const empresaId = state.catalogSession?.empresa_id || await getEmpresaAtualId();
  const { data, error } = await supabase.from("itens").select(`
    id, produto, material, cor, categoria, descricao_total, descricao_complementar,
    largura, altura, profundidade, foto_url,
    itens_modelos_3d ( url, status ),
    itens_fotos ( tipo, titulo, url, ordem, cliente_id )
  `).eq("empresa_id", empresaId).eq("exibir_no_site", true).eq("ativo", true)
    .order("categoria", { ascending: true }).order("produto", { ascending: true });
  if(error) throw error;
  const items = (data || []).map(mapRow);
  const { data: customizations, error: customizationError } = await supabase
    .from("personalizacoes")
    .select("vinculo_id,tipo")
    .eq("empresa_id", empresaId)
    .eq("alvo", "ITEM")
    .eq("status", "ATIVO");
  if(customizationError) console.warn("Personalizações não disponíveis no catálogo:", customizationError);
  const customizableIds = new Set((customizations || []).map((row) => String(row.vinculo_id)));
  items.forEach((item) => { item.personalizable = customizableIds.has(String(item.id)); });
  return items;
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

  categories.innerHTML = `<button type="button" class="catalog-header-category catalog-studio-tab" data-studio-toggle>PAINEL 3D</button>` + getCategories().map((category, index) =>
    `<button type="button" class="catalog-header-category ${index === 0 ? "active" : ""}" data-header-category="${escapeAttr(category.cat)}">${escapeHtml(category.label)}</button>`
  ).join("");

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

function setHeaderCategory(cat){
  document.querySelectorAll(".catalog-header-category").forEach((button) => {
    const active = button.dataset.headerCategory === cat;
    button.classList.toggle("active", active);
    if(active) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
}

function categoryButtons(activeCat){
  return getCategories().map((category) =>
    `<button type="button" class="bottom-category ${category.cat === activeCat ? "active" : ""}" data-category-target="${escapeAttr(category.cat)}">${escapeHtml(category.label)}</button>`
  ).join("");
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

function productTemplate(item, index){
  const event = item.events[0];
  const current = String(index + 1).padStart(2, "0");
  const total = String(state.items.length).padStart(2, "0");
  return `<section class="catalog-product-section" id="produto-${escapeAttr(item.id)}" data-product-id="${escapeAttr(item.id)}" data-category="${escapeAttr(item.cat)}" data-search="${escapeAttr(normalizeSearch(`${item.name} ${item.catLabel || ""}`))}">
    <div class="catalog-detail-panel">
      <div class="catalog-detail-top">
        <div class="product-copy product-reveal">
          <button type="button" class="product-category-back" data-category-target="${escapeAttr(item.cat)}" aria-label="Voltar para ${escapeAttr(item.catLabel)}"><span aria-hidden="true">←</span>${escapeHtml(item.catLabel)}</button>
          <h1 class="product-title">${escapeHtml(item.name)}</h1>
          ${item.dims ? `<p class="product-dimensions">${escapeHtml(item.dims)}</p>` : ""}
          <div class="product-rule" aria-hidden="true"></div>
          ${item.desc ? `<p class="product-description">${escapeHtml(item.desc)}</p>` : ""}
          ${item.personalizable ? `<button type="button" class="product-bespoke-card" data-customize-item="${escapeAttr(item.id)}"><span>SOB MEDIDA</span><strong>Experimente outro tecido</strong><small>Personalize com inteligência artificial →</small></button>` : ""}
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
      <nav class="catalog-bottom-nav" aria-label="Navegação entre produtos">
        <div class="product-stepper">
          <button type="button" class="step-button" data-step="-1" aria-label="Produto anterior" ${index === 0 ? "disabled" : ""}>↑</button>
          <span class="product-counter">${current} / ${total}</span>
          <button type="button" class="step-button" data-step="1" aria-label="Próximo produto" ${index === state.items.length - 1 ? "disabled" : ""}>↓</button>
        </div>
        <div class="bottom-categories">${categoryButtons(item.cat)}</div>
      </nav>
    </div>
    <aside class="product-event-panel">
      ${event ? `<img class="product-event-image" src="${escapeAttr(event.img)}" alt="${escapeAttr(event.label)}" data-event-index="0" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">` : `<div class="event-fallback" aria-hidden="true"></div>`}
    </aside>
  </section>`;
}

function renderProducts(){
  const grid = $("catalogGrid");
  grid.innerHTML = state.items.map(productTemplate).join("");
  $("catalogEmpty")?.classList.toggle("hidden", state.items.length > 0);
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
      document.querySelector(`.catalog-product-section[data-category="${CSS.escape(category.dataset.categoryTarget)}"]`)?.scrollIntoView({ behavior: "smooth" });
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
      const item = state.items.find((candidate) => String(candidate.id) === section?.dataset.productId);
      if(item?.glb) showModelInMain(section, item);
      return;
    }
    const customizeButton = event.target.closest("[data-customize-item]");
    if(customizeButton){
      const item = state.items.find((candidate) => String(candidate.id) === customizeButton.dataset.customizeItem);
      if(item) openCustomizeDialog(item);
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
    const item = state.items.find((candidate) => String(candidate.id) === section?.dataset.productId);
    if(item) warmModelExperience(item);
  };
  $("catalogGrid").addEventListener("pointerover", warmHoveredModel, { passive: true });
  $("catalogGrid").addEventListener("focusin", warmHoveredModel);

  $("catalogHeaderCategories")?.addEventListener("click", (event) => {
    const studioToggle = event.target.closest("[data-studio-toggle]");
    if(studioToggle){
      const opening = $("catalogStudio")?.classList.contains("hidden");
      $("catalogStudio")?.classList.toggle("hidden", !opening);
      $("catalogGrid")?.classList.toggle("hidden", opening);
      $("catalogSearch")?.closest(".catalog-search")?.classList.toggle("hidden", opening);
      studioToggle.classList.toggle("active", opening);
      if(opening) window.dispatchEvent(new Event("catalog-studio-open"));
      return;
    }
    const button = event.target.closest("[data-header-category]");
    if(!button) return;
    $("catalogStudio")?.classList.add("hidden");
    $("catalogGrid")?.classList.remove("hidden");
    $("catalogSearch")?.closest(".catalog-search")?.classList.remove("hidden");
    document.querySelector("[data-studio-toggle]")?.classList.remove("active");
    document.querySelector(`.catalog-product-section[data-category="${CSS.escape(button.dataset.headerCategory)}"]`)?.scrollIntoView({ behavior: "smooth" });
  });

  $("catalogSearch")?.addEventListener("input", (event) => {
    const query = normalizeSearch(event.target.value.trim());
    let visibleCount = 0;
    document.querySelectorAll(".catalog-product-section").forEach((section) => {
      const match = !query || section.dataset.search.includes(query);
      section.classList.toggle("hidden", !match);
      if(match) visibleCount += 1;
    });
    $("catalogEmpty")?.classList.toggle("hidden", visibleCount > 0);
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
    const { data, error } = await supabase.functions.invoke("studio-ai-engine", {
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
  const item = state.items.find((candidate) => String(candidate.id) === section.dataset.productId);
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

function setupObservers(){
  state.sectionObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if(entry.isIntersecting){
      entry.target.classList.add("is-visible");
      state.activeSection = entry.target;
      setHeaderCategory(entry.target.dataset.category);
    }else{
      entry.target.classList.remove("is-visible");
    }
  }), { rootMargin: "-10% 0px -35% 0px", threshold: .08 });
  document.querySelectorAll(".catalog-product-section").forEach((section) => state.sectionObserver.observe(section));
  state.modelObserver = new IntersectionObserver((entries, observer) => entries.forEach((entry) => {
    if(!entry.isIntersecting) return;
    const section = entry.target.closest(".catalog-product-section");
    const item = state.items.find((candidate) => String(candidate.id) === section?.dataset.productId);
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

async function init(){
  ensureFonts();
  if(!supabase){
    renderGate("Não foi possível conectar ao Acervo", "Abra esta página pelo endereço servido pelo sistema.", "../../../login.html", "Ir para o login");
    return;
  }
  try{
    await requireCatalogLogin();
    const empresaId = state.catalogSession.empresa_id;
    state.items = await carregarItens();
    renderHeader();
    renderProducts();
    bindInteractions();
    bindCatalogSession();
    bindCustomization();
    setupObservers();
    startEventRotation();
    initCatalogStudio3D({ items: state.items, supabase, empresaId, ownerId: state.catalogSession.cliente_id });
    requestAnimationFrame(() => document.querySelector(".catalog-product-section")?.classList.add("is-visible"));
  }catch(error){
    console.error("Erro ao carregar catálogo:", error);
    renderGate("Não foi possível carregar o catálogo", "Verifique sua conexão e o vínculo com a empresa.", "../../../dashboard.html", "Voltar ao painel");
  }
}

init();
