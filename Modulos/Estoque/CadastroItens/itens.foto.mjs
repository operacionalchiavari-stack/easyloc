/* =====================================================
   FOTO DO ITEM - EASYLOC
   Preview + Zoom + Crop + Upload

   A imagem final salva terá exatamente o tamanho
   da caixa .foto-guia-container (240x240 no CSS)

   Storage:
   itens/empresa_id/item_id/principal.jpg
===================================================== */

const supabase = window.supabaseClient;

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

/* =====================================================
   PREVIEW
===================================================== */

document.addEventListener("change", async function(e){

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