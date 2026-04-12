(function () {

if (!window.__CADASTRO_INSUMOS_JS__) {
  window.__CADASTRO_INSUMOS_JS__ = true;
  console.log("cadastro-insumos.js inicializado pela primeira vez");
}


console.log("📦 cadastro-insumos.js EXECUTADO");


let arquivoFotoSelecionado = null;
let zoomAtualFoto = 1;
let insumosCache = [];


/* =====================================================
   CONTEXTO & SUPABASE
===================================================== */
if (!window.supabaseClient) {
  throw new Error("❌ Supabase client não encontrado no contexto global");
}

if (!window.__CONTEXT || !window.__CONTEXT.empresa_id) {
  throw new Error("❌ Contexto global da empresa não carregado");
}

const sb = window.supabaseClient;
const empresaId = window.__CONTEXT.empresa_id;

/* =====================================================
   ELEMENTOS
===================================================== */

const campoNomeTopo = document.getElementById("nomeInsumoGeradoTopo");

/* =====================================================
   CAMPOS QUE FORMAM O NOME DO INSUMO
   (SEM quantidade por embalagem)
===================================================== */
const camposNome = [
  "tipoProduto",
  "especificacaoProduto",
  "marcaProduto",
  "corProduto",
  "novaUnidade"
];

/* =====================================================
   GERAR NOME AUTOMÁTICO
===================================================== */
function gerarNomeInsumoAutomatico() {
  const tipo = document.getElementById("tipoProduto")?.value.trim();
  const especificacao = document.getElementById("especificacaoProduto")?.value.trim();
  const marca = document.getElementById("marcaProduto")?.value.trim();
  const cor = document.getElementById("corProduto")?.value.trim();
  const unidade = document.getElementById("novaUnidade")?.value;

  const partes = [];

  if (tipo) partes.push(tipo);
  if (especificacao) partes.push(especificacao);
  if (marca) partes.push(marca);
  if (cor) partes.push(cor);
  if (unidade && unidade !== "Selecione") partes.push(unidade);

  const nomeFinal = partes.join(" ");

  if (campoNomeTopo) {
    campoNomeTopo.value = nomeFinal;
  }

  return nomeFinal;
}

/* =====================================================
   ESCUTA OS CAMPOS EM TEMPO REAL
===================================================== */
function ativarGeracaoAutomaticaNome() {
  camposNome.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", gerarNomeInsumoAutomatico);
      el.addEventListener("change", gerarNomeInsumoAutomatico);
    }
  });
}

/* =====================================================
   CARREGAR INSUMOS
===================================================== */
async function carregarInsumos() {
  console.log("🔄 Carregando insumos...");
const tabelaBody = document.getElementById("tabelaInsumos");
if (!tabelaBody) return;


  const { data, error } = await sb
    .from("insumos")
    .select(`
      id,
      codigo,
      nome,
      categoria,
      unidade,
      estoque_minimo,
      status
    `)
    .eq("empresa_id", empresaId)
    .order("nome", { ascending: true });

  if (error) {
    console.error("❌ Erro ao buscar insumos:", error);
    return;
  }

insumosCache = data || [];
popularFiltroCategorias();
aplicarFiltrosInsumos();


}

/* =====================================================
   RENDER TABELA
===================================================== */
function renderTabelaInsumos(insumos) {

  const tabelaBody = document.getElementById("tabelaInsumos");
  if (!tabelaBody) return;

  tabelaBody.innerHTML = "";

  insumos.forEach(insumo => {
    tabelaBody.innerHTML += `
      <tr onclick="abrirDetalheInsumo('${insumo.id}')" style="cursor:pointer;">
        <td>${insumo.codigo}</td>
        <td style="color:#1f2937;font-weight:500;">
          ${insumo.nome}
        </td>
        <td>
          <span class="table-card categoria">
            ${insumo.categoria}
          </span>
        </td>
        <td>${insumo.estoque_minimo ?? 0}</td>
        <td>—</td>
        <td>${insumo.unidade}</td>
        <td>
          <span class="table-card fornecedor">—</span>
        </td>
        <td>
          <span class="table-card status ${insumo.status}">
            ${insumo.status === "ativo" ? "Ativo" : "Inativo"}
          </span>
        </td>
      </tr>
    `;
  });
  window.finalizarCarregamentoModulo?.();
}

/* =====================================================
   MODAL — NOVO INSUMO
===================================================== */
let novoStatus = "ativo";

function abrirModalAdicionarInsumo() {
  document.getElementById("tipoProduto").value = "";
  document.getElementById("especificacaoProduto").value = "";
  document.getElementById("marcaProduto").value = "";
  document.getElementById("corProduto").value = "";
  document.getElementById("novoMinimo").value = "";

  document.getElementById("novaCategoria").value = "Marcenaria";
  document.getElementById("novaUnidade").value = "Unidade";

  if (campoNomeTopo) campoNomeTopo.value = "";

  setNovoStatus("ativo");

  arquivoFotoSelecionado = null;
  zoomAtualFoto = 1;

  const img = document.getElementById("previewFoto");
  if (img) {
    img.src = "";
    img.style.display = "none";
    img.style.transform = "scale(1)";
  }

  const placeholder = img?.nextElementSibling;
  if (placeholder) placeholder.style.display = "block";

  document
    .getElementById("modalAdicionarInsumo")
    .classList.remove("hidden");

  ativarGeracaoAutomaticaNome();
}

function fecharModalAdicionar() {
  document
    .getElementById("modalAdicionarInsumo")
    .classList.add("hidden");
}

/* =====================================================
   STATUS
===================================================== */
function setNovoStatus(status) {
  novoStatus = status;

  const ativo = document.getElementById("novoStatusAtivo");
  const inativo = document.getElementById("novoStatusInativo");

  if (!ativo || !inativo) return;

  ativo.classList.toggle("active", status === "ativo");
  inativo.classList.toggle("active", status === "inativo");
}



/* =====================================================
   GERAR CÓDIGO
===================================================== */
async function gerarCodigoInsumo() {
  const { data } = await sb
    .from("insumos")
    .select("codigo")
    .eq("empresa_id", empresaId)
    .order("codigo", { ascending: false })
    .limit(1);

  if (!data || !data.length) return "INS-000001";

  const ultimo = Number(data[0].codigo.replace("INS-", "")) || 0;
  return `INS-${String(ultimo + 1).padStart(6, "0")}`;
}

/* =====================================================
   SALVAR NOVO INSUMO
===================================================== */
async function salvarNovoInsumo() {
  const tipo = document.getElementById("tipoProduto").value.trim();
  const especificacao = document.getElementById("especificacaoProduto").value.trim();
  const marca = document.getElementById("marcaProduto").value.trim();
  const cor = document.getElementById("corProduto").value.trim();
  const categoria = document.getElementById("novaCategoria").value;
  const unidade = document.getElementById("novaUnidade").value;
  const minimoRaw = document.getElementById("novoMinimo").value;

  const nome = gerarNomeInsumoAutomatico();

  if (!tipo) return abrirModalAlerta("O campo Tipo de produto é obrigatório.");
  if (!especificacao) return abrirModalAlerta("O campo Especificação é obrigatório.");
  if (!marca) return abrirModalAlerta("O campo Marca é obrigatório.");
  if (!unidade || unidade === "Selecione") return abrirModalAlerta("Selecione a Unidade do insumo.");
  if (!categoria) return abrirModalAlerta("Selecione a Categoria do insumo.");
  if (minimoRaw === "") return abrirModalAlerta("O campo Estoque mínimo é obrigatório.");

  const { data: existente } = await sb
    .from("insumos")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("nome", nome)
    .limit(1);

  if (existente && existente.length > 0) {
    abrirModalAlerta("Já existe um insumo cadastrado com esse nome.");
    return;
  }

  const minimo = Number(minimoRaw) || 0;
  const codigo = await gerarCodigoInsumo();

  let fotoUrl = null;

  if (arquivoFotoSelecionado) {
    const extensao = arquivoFotoSelecionado.name.split(".").pop();
    const caminhoArquivo = `${empresaId}/${codigo}.${extensao}`;

    const { error: uploadError } = await sb
      .storage
      .from("insumos")
      .upload(caminhoArquivo, arquivoFotoSelecionado, { upsert: true });

    if (uploadError) {
      alert("Erro ao enviar a foto");
      return;
    }

    const { data } = sb
      .storage
      .from("insumos")
      .getPublicUrl(caminhoArquivo);

    fotoUrl = data.publicUrl;
  }

  const { error } = await sb.from("insumos").insert({
    empresa_id: empresaId,
    codigo,
    nome,
    categoria,
    unidade,
    estoque_minimo: minimo,
    status: novoStatus,
    foto_url: fotoUrl
  });

  if (error) {
    alert("Erro ao salvar insumo");
    return;
  }

  arquivoFotoSelecionado = null;
  fecharModalAdicionar();
  carregarInsumos();
}

/* =====================================================
   DETALHE — ABERTURA GARANTIDA
===================================================== */
async function abrirDetalheInsumo(id) {

  // 🔒 GARANTE QUE O MODAL DE CADASTRO FECHA
  const modalCadastro = document.getElementById("modalAdicionarInsumo");
  if (modalCadastro && !modalCadastro.classList.contains("hidden")) {
    modalCadastro.classList.add("hidden");
  }

  const modal = document.getElementById("modalDetalheInsumo");
  if (!modal) {
    console.error("❌ modalDetalheInsumo NÃO existe no HTML desta página");
    return;
  }

  const { data, error } = await sb
    .from("insumos")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    abrirModalAlerta("Erro ao carregar o detalhe do insumo.");
    return;
  }

  // ===== DADOS PRINCIPAIS =====
  document.getElementById("detalheNome").innerText = data.nome;
  statusDetalheAtual = data.status || "ativo";
atualizarVisualStatusDetalhe();


const img = document.getElementById("detalheFoto");
const placeholder = img?.nextElementSibling;

if (data.foto_url) {
  img.src = data.foto_url;
  img.style.display = "block";
  if (placeholder) placeholder.style.display = "none";
} else {
  img.src = "";
  img.style.display = "none";
  if (placeholder) placeholder.style.display = "flex";
}


// ===== CÓDIGO DE BARRAS =====
setTimeout(() => {

  const barcodeTexto = document.getElementById("barcodeTexto");
  const barcodeSvg = document.getElementById("barcode");

  if (!barcodeSvg) {
    console.warn("❌ SVG do barcode não encontrado");
    return;
  }

  if (barcodeTexto) {
    barcodeTexto.innerText = data.codigo;
  }

  if (typeof JsBarcode !== "function") {
    console.warn("❌ JsBarcode não carregado");
    return;
  }

  barcodeSvg.innerHTML = "";

  JsBarcode(barcodeSvg, data.codigo, {
    format: "CODE128",
    width: 2,
    height: 60,
    displayValue: false,
    margin: 0
  });

}, 100);


  // ===== KPIs (mock por enquanto) =====
  document.getElementById("kpiUltimo").innerText = "—";
  document.getElementById("kpiUltimoFornecedor").innerText = "—";
  document.getElementById("kpiMedio").innerText = "—";
  document.getElementById("kpiMenor").innerText = "—";
  document.getElementById("kpiMenorFornecedor").innerText = "—";

  // ===== HISTÓRICO (mock) =====
const historicoBody = document.getElementById("historicoPrecos");

if (historicoBody) {
  historicoBody.innerHTML = `
    <tr>
      <td>12/01/2025</td>
      <td>Loja A</td>
      <td>R$ 18,90</td>
    </tr>
    <tr>
      <td>10/11/2024</td>
      <td>Loja B</td>
      <td>R$ 17,50</td>
    </tr>
    <tr>
      <td>01/08/2024</td>
      <td>Loja A</td>
      <td>R$ 19,20</td>
    </tr>
  `;
} else {
  console.warn("⚠️ historicoPrecos não existe no HTML deste modal");
}


  // ✅ AGORA SIM, ABRE O MODAL CERTO
  modal.classList.remove("hidden");
}

function fecharModalDetalhe() {
  const modal = document.getElementById("modalDetalheInsumo");
  if (!modal) return;

  modal.classList.add("hidden");
}

/* garante que o botão sempre funcione no SPA */
document.addEventListener("click", function(e) {
  if (e.target && e.target.id === "btnFecharDetalheInsumo") {
    fecharModalDetalhe();
  }
});

function esperarElemento(seletor, callback){

  const el = document.querySelector(seletor);

  if(el){
    callback(el);
    return;
  }

  const observer = new MutationObserver(() => {

    const el = document.querySelector(seletor);

    if(el){
      observer.disconnect();
      callback(el);
    }

  });

  observer.observe(document.body,{
    childList:true,
    subtree:true
  });
}
/* =====================================================
   INIT (SPA SAFE)
===================================================== */
function initCadastroInsumos() {

  console.log("🚀 initCadastroInsumos iniciado");

  esperarElemento("#tabelaInsumos", () => {
    console.log("✅ tabela encontrada");

    carregarInsumos();
  });

}
/* ===============================
   STATUS DETALHE
================================ */

let statusDetalheAtual = "ativo";

function setStatusDetalhe(status) {
  statusDetalheAtual = status;
  atualizarVisualStatusDetalhe();
}

function atualizarVisualStatusDetalhe() {
  const ativo = document.getElementById("detalheStatusAtivo");
  const inativo = document.getElementById("detalheStatusInativo");

  if (!ativo || !inativo) return;

  ativo.classList.toggle("active", statusDetalheAtual === "ativo");
  inativo.classList.toggle("active", statusDetalheAtual === "inativo");
}
/* ===============================
   ZOOM FOTO DETALHE
================================ */

let zoomDetalhe = 1;

function zoomFotoDetalhe(delta) {
  const img = document.getElementById("detalheFoto");
  if (!img || img.style.display === "none") return;

  zoomDetalhe += delta;

  if (zoomDetalhe < 0.5) zoomDetalhe = 0.5;
  if (zoomDetalhe > 2.5) zoomDetalhe = 2.5;

  img.style.transform = `scale(${zoomDetalhe})`;
}

/* =====================================================
   EXPORTA PARA O HTML
===================================================== */
window.abrirModalAdicionarInsumo = abrirModalAdicionarInsumo;
window.fecharModalAdicionar = fecharModalAdicionar;
window.salvarNovoInsumo = salvarNovoInsumo;
window.setNovoStatus = setNovoStatus;
window.abrirDetalheInsumo = abrirDetalheInsumo;
window.zoomFoto = zoomFoto;
window.previewNovaFoto = previewNovaFoto;
window.__moduleInit = initCadastroInsumos;
window.fecharModalDetalhe = fecharModalDetalhe;
window.setStatusDetalhe = setStatusDetalhe;
window.zoomFotoDetalhe = zoomFotoDetalhe;


/* ✅ ALERTA (BOTÃO OK) */
window.fecharModalAlerta = fecharModalAlerta;
window.abrirModalAlerta = abrirModalAlerta;


function previewNovaFoto(event) {
  const file = event.target.files[0];
  if (!file) return;

  arquivoFotoSelecionado = file;

  const img = document.getElementById("previewFoto");
  const placeholder = img?.nextElementSibling;

  const reader = new FileReader();
  reader.onload = e => {
    if (img) {
      img.src = e.target.result;
      img.style.display = "block";
    }
    if (placeholder) placeholder.style.display = "none";
  };

  reader.readAsDataURL(file);
}

function zoomFoto(delta) {
  const img = document.getElementById("previewFoto");
  if (!img || img.style.display === "none") return;

  zoomAtualFoto += delta;
  if (zoomAtualFoto < 0.5) zoomAtualFoto = 0.5;
  if (zoomAtualFoto > 2.5) zoomAtualFoto = 2.5;

  img.style.transform = `scale(${zoomAtualFoto})`;
}

function abrirModalAlerta(mensagem, titulo = "Atenção") {
  document.getElementById("alertaTitulo").innerText = titulo;
  document.getElementById("alertaMensagem").innerText = mensagem;
  document.getElementById("modalAlerta").classList.remove("hidden");
}

function fecharModalAlerta() {
  document.getElementById("modalAlerta").classList.add("hidden");
}
function aplicarFiltrosInsumos() {
  let filtrados = [...insumosCache];

  const texto = document
    .getElementById("filtroInsumoTexto")?.value
    ?.toLowerCase() || "";

  const categoria = document.getElementById("filtroCategoria")?.value || "";
  const status = document.getElementById("filtroStatus")?.value || "";

  if (texto) {
    filtrados = filtrados.filter(i =>
      i.nome.toLowerCase().includes(texto) ||
      i.codigo.toLowerCase().includes(texto)
    );
  }

  if (categoria) {
    filtrados = filtrados.filter(i => i.categoria === categoria);
  }

  if (status) {
    filtrados = filtrados.filter(i => i.status === status);
  }

  renderTabelaInsumos(filtrados);
}
function popularFiltroCategorias() {
  const select = document.getElementById("filtroCategoria");
  if (!select) return;

  const categorias = [...new Set(insumosCache.map(i => i.categoria))];

  select.innerHTML = `<option value="">Todas as categorias</option>`;

  categorias.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
}

document.addEventListener("input", e => {
  if (
    e.target.id === "filtroInsumoTexto" ||
    e.target.id === "filtroCategoria" ||
    e.target.id === "filtroStatus"
  ) {
    aplicarFiltrosInsumos();
  }
});

})();