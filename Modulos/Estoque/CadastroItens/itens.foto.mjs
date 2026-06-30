/* =====================================================
   FOTO DO ITEM - EASYLOC
   Preview + Zoom + Crop + Upload

   A imagem final salva terá exatamente o tamanho
   da caixa .foto-guia-container (240x240 no CSS)

   Storage:
   itens/empresa_id/item_id/principal.jpg
===================================================== */

const supabase = window.supabaseClient;

const FOTO_PLACEHOLDER =
  "https://awemuohtvwvrdzfxwrmd.supabase.co/storage/v1/object/public/logos/placeholders/sem-foto.png";

const FOTO_SLOTS = {
  detalhe_01: { tipo: "detalhe", titulo: "Detalhe 01", ordem: 1, arquivo: "detalhe-01.jpg" },
  detalhe_02: { tipo: "detalhe", titulo: "Detalhe 02", ordem: 2, arquivo: "detalhe-02.jpg" },
  galeria_01: { tipo: "galeria", titulo: "Galeria 01", ordem: 1, arquivo: "galeria-01.jpg" },
  galeria_02: { tipo: "galeria", titulo: "Galeria 02", ordem: 2, arquivo: "galeria-02.jpg" },
  galeria_03: { tipo: "galeria", titulo: "Galeria 03", ordem: 3, arquivo: "galeria-03.jpg" },
};

const fotosSlotState = new Map();

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

  const container =
    document.querySelector(".foto-guia-container");

  if(!container) return null;

  const width = container.offsetWidth;
  const height = container.offsetHeight;

  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

const ctx = canvas.getContext("2d");

/* fundo branco */
ctx.fillStyle = "#ffffff";
ctx.fillRect(0,0,width,height);

  const bitmap =
    await createImageBitmap(fotoBlobOriginal);

let ratio = Math.min(
  width / bitmap.width,
  height / bitmap.height
);

ratio = ratio * fotoScale;

const imgWidth = bitmap.width * ratio;
const imgHeight = bitmap.height * ratio;

const drawX = (width - imgWidth) / 2 + fotoX;
const drawY = (height - imgHeight) / 2 + fotoY;

ctx.drawImage(
  bitmap,
  drawX,
  drawY,
  imgWidth,
  imgHeight
);

  return new Promise(resolve=>{

    canvas.toBlob(blob=>{

      resolve(blob);

    },"image/jpeg",0.92);

  });

};

/* =====================================================
   UPLOAD
===================================================== */

async function uploadImagem(blob, path){

  const { error } =
    await supabase
      .storage
      .from("itens")
      .upload(path, blob, {
        contentType:"image/jpeg",
        upsert:true
      });

  if(error){

    console.error("Erro upload:", error);
    return false;

  }

  return true;

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
  const bitmap = await createImageBitmap(file);
  const maxSide = 1400;
  const ratio = Math.min(1, maxSide / bitmap.width, maxSide / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9);
  });
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

  const path =
    `${empresaId}/${itemId}/principal.jpg`;

  await uploadImagem(blobFinal, path);

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
  window.itens_resetarFotosAdicionais();

  if(!itemId) return;

  const { data, error } = await supabase
    .from("itens_fotos")
    .select("slot,path,url,titulo,tipo,ordem")
    .eq("item_id", itemId)
    .order("tipo", { ascending: true })
    .order("ordem", { ascending: true });

  if(error){
    console.error("Erro ao carregar fotos do item:", error);
    return;
  }

  (data || []).forEach((foto) => {
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

    if(state.removed){
      await removerImagem(state.path);

      const { error: deleteError } = await supabase
        .from("itens_fotos")
        .delete()
        .eq("item_id", itemId)
        .eq("slot", slot);

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

    const path = `${empresaId}/${itemId}/${config.arquivo}`;
    const uploaded = await uploadImagem(blob, path);
    if(!uploaded) return false;

    const url = publicUrl(path);

    const { error: upsertError } = await supabase
      .from("itens_fotos")
      .upsert({
        empresa_id: empresaId,
        item_id: itemId,
        slot,
        tipo: config.tipo,
        titulo: config.titulo,
        ordem: config.ordem,
        path,
        url,
        mime_type: "image/jpeg",
        tamanho_bytes: blob.size,
      }, { onConflict: "item_id,slot" });

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
