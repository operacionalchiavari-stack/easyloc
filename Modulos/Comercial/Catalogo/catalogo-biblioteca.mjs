// Biblioteca do catálogo (pedido explícito do usuário): módulo DENTRO do
// catálogo, mesmo padrão do Painel 3D (ver #catalogBiblioteca em
// catalogo.html/.mjs) — não uma tela separada. Aberta só pelo bloco
// "Biblioteca" do Portal (openBibliotecaOverlay em catalogo.mjs) — o
// botão que existia solto no cabeçalho foi removido a pedido do usuário.
// Pastas = as próprias categorias do catálogo, calculadas no cliente (sem
// tabela de lookup, mesmo padrão de "categoria" no resto do sistema); as
// fotos de cada pasta são subidas manualmente pela equipe (independentes
// de qualquer item específico — galeria de referência/inspiração), e o
// decorador só visualiza (sem upload/remoção). `initCatalogBiblioteca()`
// recebe um snapshot estático de `categories` (mesma lista de
// getCategories() em catalogo.mjs) e a sessão atual — self-contido, sem
// importar nada de catalogo.mjs, mesmo padrão de catalogo-studio3d.mjs.
//
// Histórico: chegou a virar uma "página única" com abas pequenas no topo
// (uma por categoria, com o ícone de pasta miniatura dentro de cada aba)
// no lugar desta grade de pastas — o usuário pediu de volta o formato de
// antes ("CANCELE ESSA FORMATACAO DAS PAGINAS COMO ABAS, VOLTE NO
// FORMATO QUE ERA ANTES"), então essa versão de abas foi revertida por
// completo. Se um pedido parecido de "abas" surgir de novo, não propor
// essa mesma implementação sem confirmar antes — já foi tentada e
// desfeita nesta sessão.

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[ch]));
const escapeAttr = (value) => escapeHtml(value).replace(/`/g, "&#96;");
// Mesma otimização de carregamento aplicada em catalogo.mjs (pedido do
// usuário: "busque formas do catálogo abrir com mais agilidade") — pede
// ao Storage do Supabase (transformação de imagem confirmada habilitada
// neste projeto) uma versão redimensionada/recomprimida em vez do
// arquivo original, que pode ter vários MB. Duplicado aqui em vez de
// importado porque este módulo é self-contido de propósito (mesmo padrão
// de catalogo-studio3d.mjs), sem importar nada de catalogo.mjs.
function otimizarFoto(url, width, quality = 74){
  if(!url || typeof url !== "string" || !width) return url;
  const marcador = "/storage/v1/object/public/";
  const indice = url.indexOf(marcador);
  if(indice === -1) return url;
  const base = url.slice(0, indice);
  const caminho = url.slice(indice + marcador.length);
  const separador = caminho.includes("?") ? "&" : "?";
  // resize=contain é obrigatório aqui: só `width` sem isso faz o Storage
  // manter a altura ORIGINAL inteira (bug real já visto em produção —
  // foto virava uma fatia vertical cortada/esticada, não uma miniatura
  // proporcional). Com resize=contain, a altura é calculada sozinha a
  // partir da proporção real do arquivo, mesmo sem informar height.
  return `${base}/storage/v1/render/image/public/${caminho}${separador}width=${width}&quality=${quality}&resize=contain`;
}
// Ícone de pasta (pedido explícito do usuário): cada categoria da
// Biblioteca é uma PASTA, não uma foto — mostrar o placeholder genérico
// "Sem foto" ali passava a ideia errada ("falta uma foto") quando na
// verdade é só uma pasta ainda vazia. SVG inline (não data URI) de
// propósito: assim dá pra colorir via CSS normal (var(--accent) etc.),
// igual qualquer outro elemento da página — uma <img src="data:..."> não
// herda variáveis CSS do documento.
//
// "Foto saindo da pasta" (pedido explícito do usuário, com print real:
// "quero que as pastas tenham um efeito de parecer que a foto tá saindo
// dela") — só faz sentido pra pasta com pelo menos 1 foto (`photoUrl`
// opcional aqui); pasta vazia continua só com o ícone, sem nada pra
// "sair" dela. A foto entra como um <image> DENTRO do mesmo <svg> — não
// como um <img> HTML à parte — porque precisa ficar numa camada exata
// entre `back` e `front` (pintada DEPOIS do fundo da pasta mas ANTES da
// aba da frente, que é quem "segura" a foto por baixo, escondendo a
// parte inferior dela): tudo isso é só ordem de elementos dentro do
// MESMO <svg>, no mesmo sistema de coordenadas do viewBox — nenhuma
// matemática de posicionamento em CSS precisaria disso se fosse uma
// camada HTML separada por cima do SVG (o SVG já escala/centraliza
// sozinho dentro do quadrado, ver `.catalog-biblioteca-folder-icon`).
// `uid` (o slug da categoria, já único por pasta) evita colisão de id
// de <clipPath> entre pastas diferentes na mesma página.
function folderIconSvg(photoUrl, uid){
  // Foto ampliada (pedido explícito do usuário, depois de ver a pasta
  // real: "quero que a foto de dentro da pasta seja maior") — mesmo
  // centro de antes (x 27-73, y 6-36), escalado ~1.4x (46×30 → 64×42),
  // então cresce pros dois lados igualmente em vez de só esticar de um
  // canto. Ainda tucked atrás de `front` (que começa em y=32) por uma
  // fatia proporcional, mantendo o efeito "saindo da pasta".
  const peek = photoUrl ? `
    <clipPath id="peek-${uid}"><rect x="18" y="0" width="64" height="42" rx="4"/></clipPath>
    <g class="catalog-biblioteca-folder-peek">
      <image href="${escapeAttr(otimizarFoto(photoUrl, 160))}" x="18" y="0" width="64" height="42" preserveAspectRatio="xMidYMid slice" clip-path="url(#peek-${uid})"/>
      <rect class="catalog-biblioteca-folder-peek-frame" x="18" y="0" width="64" height="42" rx="4" fill="none"/>
    </g>` : "";
  return `<svg class="catalog-biblioteca-folder-icon" viewBox="0 0 100 80" aria-hidden="true">
    <rect class="catalog-biblioteca-folder-tab" x="10" y="16" width="28" height="12" rx="3"/>
    <rect class="catalog-biblioteca-folder-back" x="10" y="22" width="80" height="48" rx="6"/>${peek}
    <rect class="catalog-biblioteca-folder-front" x="6" y="32" width="88" height="38" rx="6"/>
  </svg>`;
}

function slugify(value){
  return String(value || "sem-categoria").trim().toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "sem-categoria";
}

let ctx = null;
const state = { loaded: false, loading: false, photos: [], activeCategory: null, uploading: false };

function photosForCategory(cat){
  return state.photos.filter((photo) => slugify(photo.categoria) === cat);
}

function renderFolders(){
  const host = $("catalogBibliotecaFolders");
  if(!host) return;
  // Sem título "Biblioteca" aqui dentro — duplicava o rótulo do
  // cabeçalho (#catalogPageLabel), pedido explícito do usuário: "como o
  // nome está no menu, o que está embaixo pode remover pra não ficar
  // duplicado" (reportado com print mostrando "BIBLIOTECA" duas vezes).
  host.innerHTML = `<div class="catalog-grid-wrap">
    <div class="catalog-grid catalog-home-grid">${ctx.categories.map((category) => {
      const photos = photosForCategory(category.cat);
      return `<button type="button" class="catalog-grid-card catalog-home-card" data-library-folder="${escapeAttr(category.cat)}">
        <span class="catalog-grid-card-photo catalog-biblioteca-folder${photos.length ? "" : " is-empty"}">${folderIconSvg(photos[0]?.url, category.cat)}</span>
        <span class="catalog-grid-card-body">
          <span class="catalog-grid-card-name">${escapeHtml(category.label)}</span>
          <span class="catalog-grid-card-meta">${photos.length} foto${photos.length === 1 ? "" : "s"}</span>
        </span>
      </button>`;
    }).join("")}</div>
  </div>`;
}

function renderDetail(){
  const category = ctx.categories.find((c) => c.cat === state.activeCategory);
  const photos = photosForCategory(state.activeCategory);
  $("catalogBibliotecaUpload")?.classList.toggle("hidden", !ctx.acessoInterno);
  const status = $("catalogBibliotecaUploadStatus");
  if(status) status.textContent = state.uploading ? "Enviando fotos…" : "";
  const host = $("catalogBibliotecaPhotos");
  if(!host) return;
  host.innerHTML = photos.length
    ? photos.map((photo) => `<figure class="catalog-biblioteca-photo" data-photo-id="${escapeAttr(photo.id)}">
        <img src="${escapeAttr(otimizarFoto(photo.url, 700))}" alt="${escapeAttr(photo.titulo || category?.label || "")}" loading="lazy" decoding="async" data-open-photo role="button" tabindex="0" aria-label="Ver foto em tela cheia">
        ${ctx.acessoInterno ? `<button type="button" class="catalog-biblioteca-photo-remove" data-remove-photo="${escapeAttr(photo.id)}" aria-label="Remover foto">×</button>` : ""}
      </figure>`).join("")
    : `<p class="catalog-biblioteca-empty">Nenhuma foto nesta categoria ainda.</p>`;
}

function showFolders(){
  state.activeCategory = null;
  $("catalogBibliotecaDetail")?.classList.add("hidden");
  $("catalogBibliotecaFolders")?.classList.remove("hidden");
  renderFolders();
}

function showDetail(cat){
  state.activeCategory = cat;
  renderDetail();
  $("catalogBibliotecaFolders")?.classList.add("hidden");
  $("catalogBibliotecaDetail")?.classList.remove("hidden");
}

async function carregarFotos(){
  if(state.loaded || state.loading) return;
  state.loading = true;
  try{
    const externo = Boolean(ctx.token);
    const { data, error } = await ctx.supabase.rpc(
      externo ? "biblioteca_carregar" : "biblioteca_carregar_interno",
      externo ? { p_token: ctx.token } : { p_empresa_id: ctx.empresaId }
    );
    if(error) throw error;
    state.photos = Array.isArray(data?.fotos) ? data.fotos : [];
    state.loaded = true;
  }catch(error){
    console.error("Não foi possível carregar a biblioteca:", error);
    window.catalogNotify?.({ title: "Biblioteca indisponível", message: "Não foi possível carregar as fotos. Tente novamente.", status: "error" });
  }finally{
    state.loading = false;
  }
}

function extensaoImagem(mime){
  return ({ "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg" })[mime] || "png";
}

async function enviarFotos(files){
  if(!ctx.acessoInterno || !state.activeCategory || !files.length) return;
  const category = ctx.categories.find((c) => c.cat === state.activeCategory);
  state.uploading = true;
  renderDetail();
  for(const file of files){
    if(!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024) continue;
    const path = `${ctx.empresaId}/${state.activeCategory}/${crypto.randomUUID()}.${extensaoImagem(file.type)}`;
    const { error: uploadError } = await ctx.supabase.storage.from("biblioteca").upload(path, file, { contentType: file.type, upsert: false });
    if(uploadError){ console.error("Erro ao subir foto da biblioteca:", uploadError); continue; }
    const { data: urlData } = ctx.supabase.storage.from("biblioteca").getPublicUrl(path);
    const url = `${urlData.publicUrl}?v=${Date.now()}`;
    const { data: row, error: insertError } = await ctx.supabase.from("biblioteca_fotos").insert({
      empresa_id: ctx.empresaId,
      categoria: category?.label || state.activeCategory,
      path, url, mime_type: file.type, tamanho_bytes: file.size,
    }).select("id,categoria,titulo,url,path,ordem").single();
    if(insertError){ console.error("Erro ao salvar foto da biblioteca:", insertError); continue; }
    state.photos.push(row);
  }
  state.uploading = false;
  renderDetail();
  renderFolders();
}

async function removerFoto(id){
  if(!ctx.acessoInterno) return;
  const photo = state.photos.find((p) => String(p.id) === String(id));
  if(!photo) return;
  if(!window.confirm("Remover esta foto da biblioteca?")) return;
  const { error } = await ctx.supabase.from("biblioteca_fotos").delete().eq("id", photo.id);
  if(error){
    console.error("Erro ao remover foto da biblioteca:", error);
    window.catalogNotify?.({ title: "Não foi possível remover", message: "Tente novamente.", status: "error" });
    return;
  }
  if(photo.path) await ctx.supabase.storage.from("biblioteca").remove([photo.path]);
  state.photos = state.photos.filter((p) => String(p.id) !== String(id));
  renderDetail();
  renderFolders();
}

function bindInteractions(){
  $("catalogBibliotecaFolders")?.addEventListener("click", (event) => {
    const folder = event.target.closest("[data-library-folder]");
    if(folder) showDetail(folder.dataset.libraryFolder);
  });
  // Clicar numa foto abre o visualizador em tela cheia do catálogo (o mesmo do
  // zoom das fotos do item, exposto em window.catalogOpenPhotoZoom — ver
  // catalogo.mjs). O "×" de remover (só equipe interna) é checado ANTES: clicar
  // nele nunca abre a foto.
  // O 3º argumento é a versão pequena que já está na grade (em cache): o
  // visualizador a mostra na hora enquanto a grande carrega, em vez de abrir
  // vazio ou com a foto da vez anterior.
  // O visualizador recebe TODAS as fotos da pasta pra dar pra passar de uma
  // pra outra sem fechar (setas, teclado, arrastar) — cada uma com a miniatura
  // que já está na grade como preview.
  const openPhoto = (opener) => {
    const figure = opener.closest("[data-photo-id]");
    const photos = photosForCategory(state.activeCategory);
    const index = photos.findIndex((item) => String(item.id) === figure.dataset.photoId);
    if(index < 0) return;
    const label = ctx.categories.find((c) => c.cat === state.activeCategory)?.label || "";
    const items = photos.map((photo) => {
      const thumb = document.querySelector(`#catalogBibliotecaPhotos [data-photo-id="${CSS.escape(String(photo.id))}"] img`);
      return { src: photo.url, alt: photo.titulo || label, preview: thumb ? (thumb.currentSrc || thumb.src) : "" };
    });
    window.catalogOpenPhotoZoom?.(photos[index].url, photos[index].titulo || label, opener.currentSrc || opener.src, { items, index });
  };
  $("catalogBibliotecaPhotos")?.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-photo]");
    if(removeButton){ removerFoto(removeButton.dataset.removePhoto); return; }
    const opener = event.target.closest("[data-open-photo]");
    if(opener) openPhoto(opener);
  });
  // A <img> é role="button" (irmã do "×", nunca um botão dentro do outro):
  // Enter/Espaço abrem também — uma <img> não tem isso de graça.
  $("catalogBibliotecaPhotos")?.addEventListener("keydown", (event) => {
    if(event.key !== "Enter" && event.key !== " ") return;
    const opener = event.target.closest("[data-open-photo]");
    if(!opener) return;
    event.preventDefault();
    openPhoto(opener);
  });
  $("catalogBibliotecaUploadInput")?.addEventListener("change", (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if(files.length) enviarFotos(files);
  });
}

export function initCatalogBiblioteca({ supabase, empresaId, token, acessoInterno, categories }){
  ctx = { supabase, empresaId, token, acessoInterno, categories };
  bindInteractions();
}

// Chamado só na primeira vez que a aba Biblioteca é aberta (ver
// openBibliotecaOverlay em catalogo.mjs) — evita gastar uma chamada de
// rede logo no carregamento do catálogo pra quem nunca abre a Biblioteca.
export async function openCatalogBiblioteca(){
  await carregarFotos();
  showFolders();
}
