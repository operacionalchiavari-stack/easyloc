/* =====================================================
   MODAL DE ITENS
===================================================== */
/* =====================================================
   GERAR CÓDIGO FORMATADO DO ITEM
===================================================== */

window.itens_gerarCodigoFormatado = function(){

  const numero =
    Math.floor(Math.random() * 999999) + 1;

  const codigo =
    "ITM-" +
    numero
      .toString()
      .padStart(6,"0");

  return codigo;

};

function itens_gerarQrCode(){
  return window.EasyLocQR?.generateValue?.()
    || window.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function itens_colunaQrAusente(error){
  return error?.code === "42703"
    || String(error?.message || "").includes("qr_code does not exist");
}

function itens_setQrVisual(qrCode){
  const autoCard = document.getElementById("itensQrAutoCard");
  const section = document.getElementById("itensQrIdentificacao");
  const code = document.getElementById("itensQrCodigo");
  const render = document.getElementById("itensQrRender");

  if(!autoCard || !section) return;

  if(!qrCode){
    autoCard.style.display = "flex";
    section.classList.add("hidden");
    if(code) code.textContent = "";
    if(render) render.innerHTML = "";
    return;
  }

  autoCard.style.display = "none";
  section.classList.remove("hidden");
  if(code) code.textContent = qrCode;

  if(window.EasyLocQR?.render && render){
    window.EasyLocQR.render(render, qrCode, 96);
  }
}

async function itens_garantirQrCode(item){
  if(item?.qr_code) return item.qr_code;

  const qrCode = itens_gerarQrCode();
  item.qr_code = qrCode;

  try{
    const { error } = await window.supabaseClient
      ?.from("itens")
      .update({ qr_code: qrCode })
      .eq("id", item.id);

    if(itens_colunaQrAusente(error)){
      item.qr_code = "";
      return "";
    }
  }catch(error){
    console.warn("Nao foi possivel salvar QR Code do item antigo:", error);
  }

  return qrCode;
}

window.itens_copiarQrCode = function(){
  if(window.itemAtualQrCode){
    window.EasyLocQR?.copy?.(window.itemAtualQrCode);
  }
};

window.itens_baixarQrCode = function(){
  const container = document.getElementById("itensQrRender");
  const codigo = document.getElementById("itensCodigo")?.value || window.itemAtualQrCode;
  window.EasyLocQR?.downloadFromContainer?.(container, codigo);
};

window.itens_openAdd = function(){

  const modal =
    document.getElementById("itensModal");

  if(!modal){
    if (typeof window.alerta === "function") {
      window.alerta("Modal itensModal não encontrado", "Erro", "erro");
    } else {
      alert("Modal itensModal não encontrado");
    }
    return;
  }

  /* limpa item atual */
  window.itemAtualId = null;
  window.itemAtualQrCode = null;

  /* ===============================
     LIMPAR INPUTS
  =============================== */

  modal.querySelectorAll("input").forEach(el=>{
    if(el.type !== "file"){
      el.value="";
    }
  });

  /* limpar selects */

  modal.querySelectorAll("select").forEach(el=>{
    el.selectedIndex = 0;
  });

  /* ===============================
     GERAR CÓDIGO AUTOMÁTICO
  =============================== */

const codigoInput =
  document.getElementById("itensCodigo");

if(codigoInput){
  codigoInput.value = "";
  codigoInput.placeholder = "Gerado automaticamente";
}

  /* ===============================
     RESETAR FOTO
  =============================== */

if(window.itens_resetarFoto){
  window.itens_resetarFoto();
}

itens_setQrVisual(null);

  /* ===============================
     RESETAR TIPO
  =============================== */

  document
    .querySelectorAll(".item-tipo-toggle-row .tipo-btn")
    .forEach(btn=>btn.classList.remove("active"));

  document
    .querySelector(".item-tipo-toggle-row .tipo-btn")
    ?.classList.add("active");

  /* ===============================
     RESETAR STATUS
  =============================== */

  document
    .querySelectorAll(".item-status-toggle-row .status-btn")
    .forEach(btn=>btn.classList.remove("active"));

  document
    .querySelector(".status-btn.ativo")
    ?.classList.add("active");

  /* ===============================
     ABRIR MODAL
  =============================== */

  modal.style.display = "flex";

};


window.itens_closeModal = function(){

  const modal =
    document.getElementById("itensModal");

  if(!modal) return;

  modal.style.display="none";

};


window.itens_enableEdit = function(){};


/* =====================================================
   ABRIR ITEM (DETALHES)
===================================================== */

window.abrirDetalhesItem = function(item){

  const modal = document.getElementById("itensModal");
  if(!modal) return;

  /* guarda id do item */
  window.itemAtualId = item.id;
  window.itemAtualQrCode = item.qr_code || null;

  /* abre modal */
  modal.style.display = "flex";

  itens_garantirQrCode(item).then((qrCode)=>{
    window.itemAtualQrCode = qrCode;
    itens_setQrVisual(qrCode);
  });

  /* ===============================
     CAMPOS BÁSICOS
  =============================== */

  document.getElementById("itensCodigo").value =
    item.codigo || "";

  document.getElementById("itensProduto").value =
    item.produto || "";

  document.getElementById("itensMaterial").value =
    item.material || "";

  document.getElementById("itensCor").value =
    item.cor || "";

  document.getElementById("itensDescricaoComplementar").value =
    item.descricao_complementar || "";

  document.getElementById("itensDescricaoTotal").value =
    item.descricao_total || "";

  /* ===============================
     DIMENSÕES
  =============================== */

document.getElementById("itensLargura").value =
  item.largura != null
    ? Number(item.largura).toFixed(2)
    : "";

document.getElementById("itensAltura").value =
  item.altura != null
    ? Number(item.altura).toFixed(2)
    : "";

document.getElementById("itensProfundidade").value =
  item.profundidade != null
    ? Number(item.profundidade).toFixed(2)
    : "";

  document.getElementById("itensVolumeCubico").value =
    item.volume_cubico || "";

  /* ===============================
     CLASSIFICAÇÃO
  =============================== */

  document.getElementById("itensFamilia").value =
    item.familia || "";

  document.getElementById("itensCategoria").value =
    item.categoria || "";

  document.getElementById("itensSetor").value =
    item.setor_estoque || "";

  document.getElementById("itensExibirSite").value =
    item.exibir_no_site ? "true" : "false";

  /* ===============================
     VALORES
  =============================== */

  document.getElementById("itensCusto").value =
    item.custo || "";

  document.getElementById("itensValorLocacao").value =
    item.valor_locacao || "";

  document.getElementById("itensValorReposicao").value =
    item.valor_reposicao || "";

  /* ===============================
     FOTO
  =============================== */

if(item.foto_url){

  if(window.itens_carregarFotoExistente){
    window.itens_carregarFotoExistente(item.foto_url);
  }

}else{

  if(window.itens_resetarFoto){
    window.itens_resetarFoto();
  }

}

  /* ===============================
     TIPO
  =============================== */

  document
    .querySelectorAll(".item-tipo-toggle-row .tipo-btn")
    .forEach(btn => btn.classList.remove("active"));

  if(item.tipo === "Componente"){
    document
      .querySelectorAll(".item-tipo-toggle-row .tipo-btn")[1]
      ?.classList.add("active");
  }else{
    document
      .querySelectorAll(".item-tipo-toggle-row .tipo-btn")[0]
      ?.classList.add("active");
  }

  /* ===============================
     STATUS
  =============================== */

  document
    .querySelectorAll(".item-status-toggle-row .status-btn")
    .forEach(btn => btn.classList.remove("active"));

  if(item.status === "Inativo"){
    document
      .querySelector(".status-btn.inativo")
      ?.classList.add("active");
  }else{
    document
      .querySelector(".status-btn.ativo")
      ?.classList.add("active");
  }

};
/* =====================================================
   STATUS (ATIVO / INATIVO)
===================================================== */

window.itens_setStatus = function(btn){

  const grupo = btn.closest(".item-status-toggle-row");

  if(!grupo) return;

  grupo.querySelectorAll(".status-btn")
    .forEach(b => b.classList.remove("active"));

  btn.classList.add("active");

};
/* =====================================================
   TIPO (ITEM / COMPONENTE)
===================================================== */

window.itens_setTipo = function(tipo, btn){

document
.querySelectorAll(".tipo-btn")
.forEach(b => b.classList.remove("active"));

btn.classList.add("active");

const area = document.getElementById("kitComponentesArea");

if(tipo === "Kit"){
  area.style.display = "block";
}else{
  area.style.display = "none";
}

};
/* =====================================================
   CALCULAR VOLUME AUTOMÁTICO
===================================================== */

window.itens_calcularVolume = function(){

  const largura =
    parseFloat(
      document
        .getElementById("itensLargura")
        .value
        .replace(",",".")
    ) || 0;

  const altura =
    parseFloat(
      document
        .getElementById("itensAltura")
        .value
        .replace(",",".")
    ) || 0;

  const profundidade =
    parseFloat(
      document
        .getElementById("itensProfundidade")
        .value
        .replace(",",".")
    ) || 0;

  const volume = largura * altura * profundidade;

  const campoVolume =
    document.getElementById("itensVolumeCubico");

  if(!campoVolume) return;

  if(volume > 0){

    campoVolume.value =
      volume.toFixed(3);

  }else{

    campoVolume.value = "";

  }

};
/* =====================================================
   GERAR NOME AUTOMÁTICO DO ITEM
===================================================== */

window.itens_atualizarTituloAutomatico = function(){

  const produto =
    document.getElementById("itensProduto")?.value?.trim() || "";

  const material =
    document.getElementById("itensMaterial")?.value?.trim() || "";

  const cor =
    document.getElementById("itensCor")?.value?.trim() || "";

  const largura =
    document.getElementById("itensLargura")?.value?.trim() || "";

  const altura =
    document.getElementById("itensAltura")?.value?.trim() || "";

  const profundidade =
    document.getElementById("itensProfundidade")?.value?.trim() || "";

  const titulo =
    document.getElementById("itensDescricaoTotal");

  if(!titulo) return;

const descricaoComplementar =
  document.getElementById("itensDescricaoComplementar")?.value?.trim() || "";

const partes = [];

if(produto) partes.push(produto);
if(material) partes.push(material);
if(cor) partes.push(cor);
if(descricaoComplementar) partes.push(descricaoComplementar);

if(largura){
  partes.push(`(L) ${Number(largura).toFixed(2)} m`);
}

if(altura){
  partes.push(`(A) ${Number(altura).toFixed(2)} m`);
}

if(profundidade){
  partes.push(`(P) ${Number(profundidade).toFixed(2)} m`);
}

titulo.value = partes.join(" ").trim();

};
document.addEventListener("input", function(e){

const ids = [
  "itensProduto",
  "itensMaterial",
  "itensCor",
  "itensDescricaoComplementar",
  "itensLargura",
  "itensAltura",
  "itensProfundidade"
];

  if(!ids.includes(e.target.id)) return;

  window.itens_atualizarTituloAutomatico();

});
/* =====================================================
   FORMATAR CAMPOS DE DIMENSÃO
===================================================== */

window.itens_formatarDimensao = function(input){

  if(!input) return;

  /* permite apenas números e ponto */
  let valor = input.value.replace(/[^0-9.]/g,"");

  let numero = parseFloat(valor);

  if(isNaN(numero)){
    input.value = "";
    return;
  }

  /* sempre 2 casas decimais com ponto */
  input.value = numero.toFixed(2);

};
/* =====================================================
   ATIVAR FORMATAÇÃO NAS DIMENSÕES
===================================================== */

document.addEventListener("blur", function(e){

  const ids = [
    "itensLargura",
    "itensAltura",
    "itensProfundidade"
  ];

  if(!ids.includes(e.target.id)) return;

  window.itens_formatarDimensao(e.target);

}, true);

window.itens_toggleStatus = function(btn){

  const ativo = btn.dataset.ativo === "true";

  if(ativo){

    btn.dataset.ativo = "false";
    btn.classList.remove("ativo");
    btn.classList.add("inativo");
    btn.innerHTML = "🔴 Inativo";

  }else{

    btn.dataset.ativo = "true";
    btn.classList.remove("inativo");
    btn.classList.add("ativo");
    btn.innerHTML = "🟢 Ativo";

  }

};
