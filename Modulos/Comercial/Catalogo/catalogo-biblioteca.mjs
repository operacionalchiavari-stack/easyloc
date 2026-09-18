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

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[ch]));
const escapeAttr = (value) => escapeHtml(value).replace(/`/g, "&#96;");
// Ícone de pasta (pedido explícito do usuário): cada categoria da
// Biblioteca é uma PASTA, não uma foto — mostrar o placeholder genérico
// "Sem foto" ali passava a ideia errada ("falta uma foto") quando na
// verdade é só uma pasta ainda vazia. SVG inline (não data URI) de
// propósito: assim dá pra colorir via CSS normal (var(--accent) etc.),
// igual qualquer outro elemento da página — uma <img src="data:..."> não
// herda variáveis CSS do documento.
const FOLDER_ICON_SVG = `<svg class="catalog-biblioteca-folder-icon" viewBox="0 0 100 80" aria-hidden="true">
  <rect class="catalog-biblioteca-folder-tab" x="10" y="16" width="28" height="12" rx="3"/>
  <rect class="catalog-biblioteca-folder-back" x="10" y="22" width="80" height="48" rx="6"/>
  <rect class="catalog-biblioteca-folder-front" x="6" y="32" width="88" height="38" rx="6"/>
</svg>`;

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
        <span class="catalog-grid-card-photo catalog-biblioteca-folder${photos.length ? "" : " is-empty"}">${FOLDER_ICON_SVG}</span>
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
  const title = $("catalogBibliotecaDetailTitle");
  if(title) title.textContent = category?.label || "";
  $("catalogBibliotecaUpload")?.classList.toggle("hidden", !ctx.acessoInterno);
  const status = $("catalogBibliotecaUploadStatus");
  if(status) status.textContent = state.uploading ? "Enviando fotos…" : "";
  const host = $("catalogBibliotecaPhotos");
  if(!host) return;
  host.innerHTML = photos.length
    ? photos.map((photo) => `<figure class="catalog-biblioteca-photo" data-photo-id="${escapeAttr(photo.id)}">
        <img src="${escapeAttr(photo.url)}" alt="${escapeAttr(photo.titulo || category?.label || "")}" loading="lazy" decoding="async">
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
    if(!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) continue;
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
  $("catalogBibliotecaBack")?.addEventListener("click", showFolders);
  $("catalogBibliotecaPhotos")?.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-photo]");
    if(removeButton) removerFoto(removeButton.dataset.removePhoto);
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
