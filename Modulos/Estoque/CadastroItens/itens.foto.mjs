/* =====================================================
   FOTO DO ITEM - EASYLOC
   Preview + Zoom + Crop + Upload

   A imagem final salva terá exatamente o tamanho
   da caixa .foto-guia-container (240x240 no CSS)

   Storage:
   itens/empresa_id/item_id/principal.<formato-original>
===================================================== */

const supabase = window.supabaseClient;

const FOTO_PLACEHOLDER =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNDAgMjQwIj48cmVjdCB3aWR0aD0iMjQwIiBoZWlnaHQ9IjI0MCIgZmlsbD0iI2YxZjJmNCIvPjxnIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2M3Y2JkMSIgc3Ryb2tlLXdpZHRoPSI2IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxyZWN0IHg9IjYwIiB5PSI2OCIgd2lkdGg9IjEyMCIgaGVpZ2h0PSI5MCIgcng9IjgiLz48Y2lyY2xlIGN4PSI5MCIgY3k9Ijk2IiByPSIxMCIvPjxwYXRoIGQ9Ik02MCAxNDMgTDEwMCAxMTMgTDEzMCAxMzggTDE1NSAxMTYgTDE4MCAxNDMiLz48L2c+PHRleHQgeD0iMTIwIiB5PSIxODIiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgSGVsdmV0aWNhLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE2IiBmaWxsPSIjOWFhMGE4Ij5TZW0gZm90bzwvdGV4dD48L3N2Zz4=";

const FOTO_SLOTS = {
  detalhe_01: { tipo: "detalhe", titulo: "Detalhe 01", ordem: 1, arquivo: "detalhe-01" },
  detalhe_02: { tipo: "detalhe", titulo: "Detalhe 02", ordem: 2, arquivo: "detalhe-02" },
  galeria_01: { tipo: "galeria", titulo: "Galeria 01", ordem: 1, arquivo: "galeria-01" },
  galeria_02: { tipo: "galeria", titulo: "Galeria 02", ordem: 2, arquivo: "galeria-02" },
  galeria_03: { tipo: "galeria", titulo: "Galeria 03", ordem: 3, arquivo: "galeria-03" },
};

const fotosSlotState = new Map();
let fotosItemAtualId = null;

/* =====================================================
   ESTADO
===================================================== */

let fotoScale = 1;
let fotoX = 0;
let fotoY = 0;

let zoomInterval = null;

/* blob real da imagem */
let fotoBlobOriginal = null;

/* =====================================================
   ELEMENTOS
===================================================== */

function getEls(){

  return {
    foto: document.getElementById("itensFotoPreview"),
    inputFoto: document.getElementById("itensFotoInput")
  };

}

function getSlotConfig(slot){
  return FOTO_SLOTS[slot] || null;
}

function getSlotState(slot){
  if(!fotosSlotState.has(slot)){
    fotosSlotState.set(slot, {
      file: null,
      path: null,
      url: null,
      removed: false,
      objectUrl: null,
    });
  }

  return fotosSlotState.get(slot);
}

function getSlotEls(slot){
  return {
    preview: document.querySelector(`[data-item-photo-preview="${slot}"]`),
    input: document.querySelector(`[data-item-photo-input="${slot}"]`),
  };
}

function limparObjectUrl(state){
  if(state?.objectUrl){
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }
}

function setSlotPreview(slot, url){
  const { preview } = getSlotEls(slot);
  if(!preview) return;

  preview.src = url || preview.getAttribute("data-placeholder") || FOTO_PLACEHOLDER;
}

function resetSlot(slot){
  const state = getSlotState(slot);
  limparObjectUrl(state);
  state.file = null;
  state.path = null;
  state.url = null;
  state.removed = false;

  const { input } = getSlotEls(slot);
  if(input) input.value = "";

  setSlotPreview(slot, null);
}

/* =====================================================
   TRANSFORM
===================================================== */

function aplicarTransform(){

  const { foto } = getEls();

  if(!foto) return;

  foto.style.transform =
    `translate(${fotoX}px, ${fotoY}px) scale(${fotoScale})`;

  foto.style.transformOrigin = "center center";

}

/* =====================================================
   SELECIONAR FOTO
===================================================== */

window.itens_selecionarFoto = function(){

  const { inputFoto } = getEls();

  if(!inputFoto) return;

  inputFoto.click();

};

window.itens_selecionarFotoSlot = function(slot){
  if(!getSlotConfig(slot)) return;

  const { input } = getSlotEls(slot);
  input?.click();
};

window.itens_removerFotoSlot = function(slot){
  if(!getSlotConfig(slot)) return;

  const state = getSlotState(slot);
  limparObjectUrl(state);
  state.file = null;
  state.removed = Boolean(state.path || state.url);

  const { input } = getSlotEls(slot);
  if(input) input.value = "";

  setSlotPreview(slot, null);
};

/* =====================================================
   PREVIEW
===================================================== */

document.addEventListener("change", async function(e){

  const slot = e.target?.dataset?.itemPhotoInput;

  if(slot){
    const config = getSlotConfig(slot);
    const file = e.target.files?.[0];
    if(!config || !file) return;

    const state = getSlotState(slot);
    limparObjectUrl(state);
    state.file = file;
    state.removed = false;
    state.objectUrl = URL.createObjectURL(file);

    setSlotPreview(slot, state.objectUrl);
    return;
  }

  if(e.target.id !== "itensFotoInput") return;

  const file = e.target.files[0];
  if(!file) return;

  fotoBlobOriginal = file;

  const { foto } = getEls();
  if(!foto) return;

  const url = URL.createObjectURL(file);

  foto.src = url;

  fotoScale = 1;
  fotoX = 0;
  fotoY = 0;

  aplicarTransform();

});

/* =====================================================
   RESET
===================================================== */

window.itens_resetarFoto = function(){

  const { foto } = getEls();

  if(!foto) return;

  const placeholder =
    foto.getAttribute("data-placeholder");

  foto.src = placeholder;

  fotoBlobOriginal = null;

  fotoScale = 1;
  fotoX = 0;
  fotoY = 0;

  aplicarTransform();

};

/* =====================================================
   ZOOM
===================================================== */

window.itens_startZoom = function(direction){

  zoomInterval = setInterval(()=>{

    fotoScale += direction * 0.05;

    if(fotoScale < 0.2) fotoScale = 0.2;
    if(fotoScale > 5) fotoScale = 5;

    aplicarTransform();

  },40);

};

window.itens_stopZoom = function(){

  if(zoomInterval){

    clearInterval(zoomInterval);
    zoomInterval = null;

  }

};

/* =====================================================
   GERAR IMAGEM FINAL
===================================================== */

window.itens_gerarImagemFinal = async function(){

  if(!fotoBlobOriginal) return null;

  // Sem zoom ou reposicionamento, preserve o arquivo original byte por byte.
  if(fotoScale === 1 && fotoX === 0 && fotoY === 0){
    return fotoBlobOriginal;
  }

  const container =
    document.querySelector(".foto-guia-container");

  if(!container) return null;

  const previewWidth = container.offsetWidth;
  const previewHeight = container.offsetHeight;

  const bitmap =
    await createImageBitmap(fotoBlobOriginal);

  // A resolução final acompanha a original; os 240px são apenas da prévia.
  const outputScale = Math.max(
    bitmap.width / previewWidth,
    bitmap.height / previewHeight,
    1
  );
  const width = Math.max(1, Math.round(previewWidth * outputScale));
  const height = Math.max(1, Math.round(previewHeight * outputScale));

  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

const ctx = canvas.getContext("2d", { alpha: true });
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = "high";
ctx.clearRect(0,0,width,height);

let ratio = Math.min(
  width / bitmap.width,
  height / bitmap.height
);

ratio = ratio * fotoScale;

const imgWidth = bitmap.width * ratio;
const imgHeight = bitmap.height * ratio;

const drawX = (width - imgWidth) / 2 + (fotoX * outputScale);
const drawY = (height - imgHeight) / 2 + (fotoY * outputScale);

  ctx.drawImage(
  bitmap,
  drawX,
  drawY,
  imgWidth,
  imgHeight
  );

  bitmap.close?.();

  return new Promise(resolve=>{

    canvas.toBlob(blob=>{

      resolve(blob);

    },"image/png");

  });

};

/* =====================================================
   UPLOAD
===================================================== */

async function uploadImagem(blob, path){

  const contentType = normalizarMimeImagem(blob?.type);

  const { error } =
    await supabase
      .storage
      .from("itens")
      .upload(path, blob, {
        contentType,
        upsert:true
      });

  if(error){

    console.error("Erro upload:", error);
    return false;

  }

  return true;

}

function normalizarMimeImagem(mime){
  const permitidos = ["image/png", "image/webp", "image/jpeg"];
  return permitidos.includes(mime) ? mime : "image/png";
}

function extensaoImagem(mime){
  return ({
    "image/png": "png",
    "image/webp": "webp",
    "image/jpeg": "jpg",
  })[normalizarMimeImagem(mime)];
}

async function removerImagem(path){
  if(!path) return true;

  const { error } =
    await supabase
      .storage
      .from("itens")
      .remove([path]);

  if(error){
    console.error("Erro ao remover imagem:", error);
    return false;
  }

  return true;
}

function publicUrl(path){
  const { data } =
    supabase
      .storage
      .from("itens")
      .getPublicUrl(path);

  return data.publicUrl + "?v=" + Date.now();
}

async function gerarBlobImagemSlot(file){
  // Preserve resolução, transparência e compressão originais.
  return file;
}

/* =====================================================
   PROCESSAR FOTO
===================================================== */

window.itens_processarFoto = async function(itemId){

  const empresaId =
    window.__CONTEXT?.empresa_id;

  if(!empresaId || !itemId){

    console.error("empresa ou item id faltando");
    return null;

  }

  const blobFinal =
    await window.itens_gerarImagemFinal();

  if(!blobFinal) return null;

  const extensao = extensaoImagem(blobFinal.type);
  const path =
    `${empresaId}/${itemId}/principal.${extensao}`;

  const uploaded = await uploadImagem(blobFinal, path);
  if(!uploaded){
    throw new Error("A foto principal não foi enviada. O item não será salvo com a imagem antiga.");
  }

  // Limpe formatos antigos somente após o novo arquivo estar seguro.
  const pathsAntigos = ["jpg", "jpeg", "png", "webp"]
    .filter((ext) => ext !== extensao)
    .map((ext) => `${empresaId}/${itemId}/principal.${ext}`);
  await supabase.storage.from("itens").remove(pathsAntigos);

  const { data } =
    supabase
      .storage
      .from("itens")
      .getPublicUrl(path);

return data.publicUrl + "?v=" + Date.now();

};

window.itens_resetarFotosAdicionais = function(){
  Object.keys(FOTO_SLOTS).forEach(resetSlot);
};

window.itens_carregarFotosAdicionais = async function(itemId){
  fotosItemAtualId = itemId;
  window.itens_resetarFotosAdicionais();

  if(!itemId) return;

  const { data, error } = await supabase
    .from("itens_fotos")
    .select("slot,path,url,titulo,tipo,ordem,cliente_id")
    .eq("item_id", itemId)
    .order("tipo", { ascending: true })
    .order("ordem", { ascending: true });

  if(error){
    console.error("Erro ao carregar fotos do item:", error);
    return;
  }

  const clienteId = document.getElementById("itemGaleriaCliente")?.value || null;
  (data || []).filter((foto) => foto.tipo === "detalhe" ? !foto.cliente_id : String(foto.cliente_id || "") === String(clienteId || "")).forEach((foto) => {
    if(!getSlotConfig(foto.slot)) return;

    const state = getSlotState(foto.slot);
    limparObjectUrl(state);
    state.file = null;
    state.path = foto.path || null;
    state.url = foto.url || null;
    state.removed = false;

    setSlotPreview(foto.slot, foto.url);
  });
};

window.itens_salvarFotosAdicionais = async function(itemId, empresaId){
  if(!itemId || !empresaId) return true;

  for(const [slot, config] of Object.entries(FOTO_SLOTS)){
    const state = getSlotState(slot);
    const clienteId = config.tipo === "galeria" ? (document.getElementById("itemGaleriaCliente")?.value || null) : null;

    if(state.removed){
      await removerImagem(state.path);

      let deleteQuery = supabase
        .from("itens_fotos")
        .delete()
        .eq("item_id", itemId)
        .eq("slot", slot);
      deleteQuery = clienteId ? deleteQuery.eq("cliente_id", clienteId) : deleteQuery.is("cliente_id", null);
      const { error: deleteError } = await deleteQuery;

      if(deleteError){
        console.error("Erro ao remover registro da foto:", deleteError);
        return false;
      }

      resetSlot(slot);
      continue;
    }

    if(!state.file) continue;

    const blob = await gerarBlobImagemSlot(state.file);
    if(!blob) return false;

    const mimeType = normalizarMimeImagem(blob.type);
    const path = `${empresaId}/${itemId}/${clienteId || "geral"}/${config.arquivo}.${extensaoImagem(mimeType)}`;
    const uploaded = await uploadImagem(blob, path);
    if(!uploaded) return false;

    if(state.path && state.path !== path){
      await removerImagem(state.path);
    }

    const url = publicUrl(path);

    let existingQuery = supabase.from("itens_fotos").delete().eq("item_id", itemId).eq("slot", slot);
    existingQuery = clienteId ? existingQuery.eq("cliente_id", clienteId) : existingQuery.is("cliente_id", null);
    const { error: replaceError } = await existingQuery;
    if(replaceError) return false;
    const { error: upsertError } = await supabase.from("itens_fotos").insert({
        empresa_id: empresaId,
        item_id: itemId,
        slot,
        tipo: config.tipo,
        titulo: config.titulo,
        ordem: config.ordem,
        path,
        url,
        mime_type: mimeType,
        tamanho_bytes: blob.size,
        cliente_id: clienteId,
      });

    if(upsertError){
      console.error("Erro ao salvar registro da foto:", upsertError);
      return false;
    }

    limparObjectUrl(state);
    state.file = null;
    state.path = path;
    state.url = url;
    state.removed = false;
    setSlotPreview(slot, url);
  }

  return true;
};

async function iniciarSeletorGaleriaCliente(){
  const select = document.getElementById("itemGaleriaCliente");
  if(!select || select.dataset.ready) return;
  const empresaId = window.__CONTEXT?.empresa_id;
  if(!empresaId) return;
  select.dataset.ready = "true";
  const { data } = await supabase.from("clientes_empresas").select("id,nome_razao").eq("empresa_id", empresaId).order("nome_razao");
  select.innerHTML = `<option value="">Chiavari — catálogo padrão</option>${(data || []).map((cliente) => `<option value="${cliente.id}">${String(cliente.nome_razao || "Cliente").replace(/[&<>"']/g, "")}</option>`).join("")}`;
  select.addEventListener("change", () => window.itens_carregarFotosAdicionais(fotosItemAtualId));
}
document.addEventListener("click", (event) => { if(event.target.closest('[data-item-tab="galeria"]')) iniciarSeletorGaleriaCliente(); });

/* =====================================================
   CARREGAR FOTO EXISTENTE
===================================================== */

window.itens_carregarFotoExistente = async function(url){

  const { foto } = getEls();

  if(!url || !foto) return;

  const resp = await fetch(url);

  const blob = await resp.blob();

  fotoBlobOriginal = blob;

  const objectUrl = URL.createObjectURL(blob);

  foto.src = objectUrl;

  fotoScale = 1;
  fotoX = 0;
  fotoY = 0;

  aplicarTransform();

};
