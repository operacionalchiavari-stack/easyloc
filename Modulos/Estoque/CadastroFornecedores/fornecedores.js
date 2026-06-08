(function () {
"use strict";

console.log("📦 cadastro-fornecedores módulo carregado");

/* =====================================================
   CONTEXTO & SUPABASE
===================================================== */

if (!window.supabaseClient) {
  throw new Error("❌ Supabase client não encontrado");
}

if (!window.__CONTEXT?.empresa_id) {
  throw new Error("❌ empresa_id não encontrado no contexto");
}

const sb = window.supabaseClient;
const empresaId = window.__CONTEXT.empresa_id;

/* =====================================================
   GOOGLE AUTOCOMPLETE
===================================================== */

let autocompleteFornecedor = null;

function iniciarAutocompleteEndereco() {

  const input = document.getElementById("enderecoGoogle");
  if (!input) return;

  if (!window.google?.maps?.places) {
    console.warn("⚠️ Google Places não carregado");
    return;
  }

  if (autocompleteFornecedor) return;

  autocompleteFornecedor = new google.maps.places.Autocomplete(input, {
    componentRestrictions: { country: "br" }
  });

  autocompleteFornecedor.addListener("place_changed", () => {
    const place = autocompleteFornecedor.getPlace();
    if (!place.address_components) return;

    const mapa = {};

    place.address_components.forEach(c => {
      c.types.forEach(t => mapa[t] = c.long_name);
    });

    setVal("endLogradouro", mapa.route);
    setVal("endNumero", mapa.street_number);
    setVal("endBairro", mapa.sublocality || mapa.neighborhood);
    setVal("endCidade", mapa.administrative_area_level_2);
    setVal("endEstado", mapa.administrative_area_level_1);
    setVal("endCep", mapa.postal_code);

    if (place.geometry?.location) {
      setVal("endLatitude", place.geometry.location.lat());
      setVal("endLongitude", place.geometry.location.lng());
    }
  });
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el && value) el.value = value;
}
/* =====================================================
   CONSULTA AUTOMÁTICA CNPJ
===================================================== */

async function consultarCNPJ(cnpj) {

  const apenasNumeros = (cnpj || "").replace(/\D/g, "");

  if (apenasNumeros.length !== 14) return;

  try {

    const response = await fetch(
      `https://brasilapi.com.br/api/cnpj/v1/${apenasNumeros}`
    );

    if (!response.ok) {
      console.warn("CNPJ não encontrado");
      return;
    }

    const data = await response.json();

    // Preenche automaticamente
document.getElementById("fNome").value = data.razao_social || "";

// Nome fantasia pode vir null, vazio ou nem existir
const fantasia =
  data.nome_fantasia ||
  data.fantasia ||
  data.nome ||
  data.razao_social || "";

document.getElementById("fFantasia").value = fantasia;


    document.getElementById("endLogradouro").value = data.logradouro || "";
    document.getElementById("endNumero").value = data.numero || "";
    document.getElementById("endBairro").value = data.bairro || "";
    document.getElementById("endCidade").value = data.municipio || "";
    document.getElementById("endEstado").value = data.uf || "";
    document.getElementById("endCep").value = data.cep || "";

    document.getElementById("enderecoGoogle").value =
      `${data.logradouro || ""}, ${data.numero || ""} - ${data.municipio || ""} ${data.uf || ""}`;

  } catch (err) {
    console.error("Erro ao consultar CNPJ:", err);
  }
}

/* =====================================================
   LISTAR
===================================================== */

async function carregarFornecedores() {

  const { data, error } = await sb
    .from("fornecedores")
    .select("*")
    .eq("empresa_id", empresaId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ Erro ao buscar:", error);
    return;
  }

  renderizarTabela(data || []);
}

function renderizarTabela(lista) {

  const tabela = document.getElementById("tabelaFornecedores");
  if (!tabela) return;

  tabela.innerHTML = "";

  lista.forEach(f => {

    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";

    // clique na linha abre detalhe (exceto quando clicar nos botões)
    tr.addEventListener("click", (e) => {
      if (e.target.closest(".action-btn")) return;
      abrirModalDetalheFornecedor(f);
    });

    tr.innerHTML = `
      <td>${esc(f.nome_razao_social || "-")}</td>
      <td>${esc(f.documento || "-")}</td>
      <td>${esc(f.telefone || "-")}</td>
      <td>${esc(f.email || "-")}</td>
      <td><span class="badge tipo">${esc(f.tipo || "-")}</span></td>
      <td><span class="badge categoria">${esc(f.categoria || "-")}</span></td>
      <td>
        <span class="badge ${esc(f.status || "")}">
          ${f.status === "ativo" ? "Ativo" : "Inativo"}
        </span>
      </td>
      <td>
        <div class="actions">
          <button class="action-btn btn-ver" type="button">Ver</button>
          <button class="action-btn btn-editar" type="button">Editar</button>
        </div>
      </td>
    `;

    // botões da coluna ações
    tr.querySelector(".btn-ver").addEventListener("click", (e) => {
      e.stopPropagation();
      abrirModalDetalheFornecedor(f);
    });

    tr.querySelector(".btn-editar").addEventListener("click", (e) => {
      e.stopPropagation();
      prepararEdicaoFornecedor(f);
    });

    tabela.appendChild(tr);
  });
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =====================================================
   MODAL
===================================================== */

function abrirModalFornecedor() {

  const modal = document.getElementById("modalFornecedor");
  if (!modal) return;

  fornecedorSelecionado = null;
  modoFornecedor = "novo";

  document.getElementById("modalTitulo").innerText = "Novo Fornecedor";

  limparFormulario();

  // 🔥 GARANTE QUE ESTÁ DESBLOQUEADO
  bloquearFormularioFornecedor(false);

  // 🔥 ESCONDE BOTÃO LÁPIS
  mostrarBotaoEditar(false);

  // 🔥 GARANTE BOTÃO SALVAR VISÍVEL
  const btnSalvar = document.querySelector("#modalFornecedor .modal-footer .btn.primary");
  if (btnSalvar) btnSalvar.style.display = "inline-flex";

  modal.classList.remove("hidden");

  setTimeout(() => {
    iniciarAutocompleteEndereco();
    initTagsFornecedor();
  }, 200);
}

function fecharModalFornecedor() {
  document.getElementById("modalFornecedor").classList.add("hidden");
}

window.fecharModalFornecedor = fecharModalFornecedor;

/* =====================================================
   LIMPAR FORM
===================================================== */

function limparFormulario() {

  const campos = document.querySelectorAll("#modalFornecedor input, #modalFornecedor select");
  campos.forEach(c => c.value = "");

  document.querySelectorAll(".tag.selected")
    .forEach(t => t.classList.remove("selected"));

  document.getElementById("fStatus").value = "ativo";
}

/* =====================================================
   TAGS
===================================================== */

function initTagsFornecedor() {
  document.querySelectorAll(".tag").forEach(tag => {
    tag.onclick = () => tag.classList.toggle("selected");
  });
}

function coletarTagsSelecionadas() {

  const resultado = {};
  document.querySelectorAll(".tag.selected").forEach(tag => {

    const grupo = tag.dataset.group;
    const valor = tag.dataset.value;

    if (!resultado[grupo]) resultado[grupo] = [];
    resultado[grupo].push(valor);
  });

  return resultado;
}

/* =====================================================
   SALVAR
===================================================== */

async function salvarFornecedor() {

  const nome = document.getElementById("fNome").value.trim();
  const fantasia = document.getElementById("fFantasia").value.trim();
  const documento = document.getElementById("fDocumento").value.replace(/\D/g, "");
  const tipo = document.getElementById("fTipo").value;
  const categoria = document.getElementById("fCategoria").value;
  const endereco = document.getElementById("enderecoGoogle").value.trim();
  const email = document.getElementById("fEmail").value.trim();
  const telefone = document.getElementById("fTelefone").value.replace(/\D/g, "");
  const latitude = document.getElementById("endLatitude").value;
  const longitude = document.getElementById("endLongitude").value;

  /* ================= VALIDAÇÕES ================= */

  if (!nome) {
mostrarAlerta("Razão Social é obrigatória");
    return;
  }

  if (!validarCNPJ(documento)) {
mostrarAlerta("CNPJ inválido");
    return;
  }

  if (!tipo) {
mostrarAlerta("Selecione o tipo do fornecedor");
    return;
  }

if (!latitude || !longitude) {
mostrarAlerta("Selecione o endereço corretamente na lista do Google");

  return;
}


  if (email && !validarEmail(email)) {
mostrarAlerta("E-mail inválido");
    return;
  }

  if (telefone && telefone.length < 10) {
mostrarAlerta("Telefone inválido");
    return;
  }

  const tags = coletarTagsSelecionadas();

  if (!tags.operacional || tags.operacional.length === 0) {
mostrarAlerta("Selecione pelo menos uma tag Operacional");
    return;
  }

  /* ================= BLOQUEIO DUPLICIDADE ================= */
const { data: existente } = await sb
  .from("fornecedores")
  .select("id")
  .eq("empresa_id", empresaId)
  .eq("documento", documento)
  .maybeSingle();

if (existente && existente.id !== fornecedorSelecionado?.id) {
  mostrarAlerta("Já existe fornecedor cadastrado com esse CNPJ");
  return;
}



  /* ================= PAYLOAD ================= */

  const payload = {
    empresa_id: empresaId,
    nome_razao_social: nome,
    nome_fantasia: fantasia,
    documento,
    tipo,
    categoria,
    status: document.getElementById("fStatus").value,
    telefone,
    email,
    contato_responsavel: document.getElementById("fContato").value,
    endereco_google: endereco,
    logradouro: document.getElementById("endLogradouro").value,
    numero: document.getElementById("endNumero").value,
    bairro: document.getElementById("endBairro").value,
    cidade: document.getElementById("endCidade").value,
    estado: document.getElementById("endEstado").value,
    cep: document.getElementById("endCep").value,
    latitude: latitude ? parseFloat(latitude) : null,
    longitude: longitude ? parseFloat(longitude) : null,
    informacoes_adicionais: tags
  };

  let error;

  if (fornecedorSelecionado?.id) {
    ({ error } = await sb
      .from("fornecedores")
      .update(payload)
      .eq("id", fornecedorSelecionado.id)
      .eq("empresa_id", empresaId));
  } else {
    ({ error } = await sb
      .from("fornecedores")
      .insert(payload));
  }

  if (error) {
    console.error("❌ Erro ao salvar:", error);
    mostrarAlerta("Erro ao salvar fornecedor", "Erro");
    return;
  }

  fecharModalFornecedor();
  fornecedorSelecionado = null;
  await carregarFornecedores();
}

/* =====================================================
   INIT SPA SAFE
===================================================== */

function initCadastroFornecedores() {

  console.log("🚀 initCadastroFornecedores");

  /* =====================================
     ANTI DUPLA INICIALIZAÇÃO (SPA SAFE)
  ===================================== */
  if (window.__fornecedores_Eventos) {
    console.log("⚠️ fornecedores já inicializado");
    return;
  }

  window.__fornecedores_Eventos = true;

  /* =====================================
     GARANTE DOM PRESENTE
  ===================================== */
  const tabela = document.getElementById("tabelaFornecedores");
  if (!tabela) {
    console.warn("Tabela fornecedores não encontrada");
    return;
  }

  /* =====================================
     CARREGAMENTO INICIAL
  ===================================== */
  carregarFornecedores();

  /* =====================================
     BOTÃO NOVO FORNECEDOR
  ===================================== */
  const btn = document.getElementById("btnNovoFornecedor");
  if (btn) {
    btn.onclick = abrirModalFornecedor;
  }

  /* =====================================
     CONSULTA AUTOMÁTICA CNPJ
  ===================================== */
  const campoCNPJ = document.getElementById("fDocumento");

  if (campoCNPJ) {
    campoCNPJ.addEventListener("blur", () => {
      consultarCNPJ(campoCNPJ.value);
    });
  }

  /* =====================================
     DESTROY DO MÓDULO (🔥 ESSENCIAL)
  ===================================== */
  window.__activeModuleDestroy = function () {

    console.log("🧹 destroy fornecedores");

    window.__fornecedores_Eventos = false;

    const btn = document.getElementById("btnNovoFornecedor");
    if (btn) btn.onclick = null;

  };

  /* =====================================
     FINALIZA LOADER
  ===================================== */
  window.finalizarCarregamentoModulo?.();
}


/* =====================================
   ESTADO GLOBAL
===================================== */
let fornecedorSelecionado = null;
let modoFornecedor = "novo";

/* =====================================================
   MODAL DETALHE / VISUALIZAÇÃO
===================================================== */

function abrirModalDetalheFornecedor(f) {

  fornecedorSelecionado = f;
  modoFornecedor = "detalhe";

  document.getElementById("modalTitulo").innerText = "Detalhes do Fornecedor";

  preencherFormularioFornecedor(f);

  bloquearFormularioFornecedor(true);

  mostrarBotaoEditar(true);

  document.getElementById("modalFornecedor").classList.remove("hidden");
}

/* =====================================================
   EDITAR (ATIVA EDIÇÃO NO MESMO MODAL)
===================================================== */

function prepararEdicaoFornecedor(f) {

  fornecedorSelecionado = f;
  modoFornecedor = "editar";

  document.getElementById("modalTitulo").innerText = "Editar Fornecedor";

  preencherFormularioFornecedor(f);

  bloquearFormularioFornecedor(false);

  mostrarBotaoEditar(false);

  document.getElementById("modalFornecedor").classList.remove("hidden");

  setTimeout(() => {
    iniciarAutocompleteEndereco();
    initTagsFornecedor();
  }, 200);
}

/* =====================================================
   PREENCHER FORMULÁRIO
===================================================== */

function preencherFormularioFornecedor(f) {

  document.getElementById("fNome").value = f.nome_razao_social || "";
  document.getElementById("fFantasia").value = f.nome_fantasia || "";
  document.getElementById("fDocumento").value = f.documento || "";
  document.getElementById("fTipo").value = f.tipo || "";
  document.getElementById("fCategoria").value = f.categoria || "";
  document.getElementById("fStatus").value = f.status || "ativo";
  document.getElementById("fTelefone").value = f.telefone || "";
  document.getElementById("fEmail").value = f.email || "";
  document.getElementById("fContato").value = f.contato_responsavel || "";

  document.getElementById("enderecoGoogle").value = f.endereco_google || "";
  document.getElementById("endLogradouro").value = f.logradouro || "";
  document.getElementById("endNumero").value = f.numero || "";
  document.getElementById("endBairro").value = f.bairro || "";
  document.getElementById("endCidade").value = f.cidade || "";
  document.getElementById("endEstado").value = f.estado || "";
  document.getElementById("endCep").value = f.cep || "";
  document.getElementById("endLatitude").value = f.latitude ?? "";
  document.getElementById("endLongitude").value = f.longitude ?? "";

  // limpa tags
  document.querySelectorAll(".tag.selected")
    .forEach(t => t.classList.remove("selected"));

  if (f.informacoes_adicionais && typeof f.informacoes_adicionais === "object") {
    Object.entries(f.informacoes_adicionais).forEach(([grupo, valores]) => {
      (valores || []).forEach(v => {
        const el = document.querySelector(`.tag[data-group="${grupo}"][data-value="${v}"]`);
        if (el) el.classList.add("selected");
      });
    });
  }
}

/* =====================================================
   BLOQUEAR / DESBLOQUEAR FORM
===================================================== */

function bloquearFormularioFornecedor(bloquear) {

  document
    .querySelectorAll("#modalFornecedor input, #modalFornecedor select")
    .forEach(el => el.disabled = bloquear);

  document.querySelectorAll(".tag").forEach(tag => {
    if (bloquear) {
      tag.classList.add("disabled");
      tag.style.pointerEvents = "none";
      tag.style.opacity = "0.6";
    } else {
      tag.classList.remove("disabled");
      tag.style.pointerEvents = "auto";
      tag.style.opacity = "1";
    }
  });

  // botão salvar
  const btnSalvar = document.querySelector("#modalFornecedor .modal-footer .btn.primary");
  if (btnSalvar) {
    btnSalvar.style.display = bloquear ? "none" : "inline-flex";
  }
}

/* =====================================================
   BOTÃO LÁPIS
===================================================== */

function mostrarBotaoEditar(mostrar) {

  let btn = document.getElementById("btnEditarFornecedor");

  if (!btn) {
    btn = document.createElement("button");
    btn.id = "btnEditarFornecedor";
    btn.innerHTML = "✏️";
    btn.className = "btn secondary";
    btn.style.marginLeft = "auto";

    btn.onclick = () => {
      modoFornecedor = "editar";
      bloquearFormularioFornecedor(false);
      mostrarBotaoEditar(false);
    };

    document.querySelector("#modalFornecedor .modal-header")
      .appendChild(btn);
  }

  btn.style.display = mostrar ? "inline-flex" : "none";
}
function validarCNPJ(cnpj) {

  if (!cnpj || cnpj.length !== 14) return false;

  if (/^(\d)\1+$/.test(cnpj)) return false;

  let tamanho = cnpj.length - 2;
  let numeros = cnpj.substring(0, tamanho);
  let digitos = cnpj.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += numeros.charAt(tamanho - i) * pos--;
    if (pos < 2) pos = 9;
  }

  let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
  if (resultado != digitos.charAt(0)) return false;

  tamanho = tamanho + 1;
  numeros = cnpj.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += numeros.charAt(tamanho - i) * pos--;
    if (pos < 2) pos = 9;
  }

  resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;

  return resultado == digitos.charAt(1);
}
function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function mostrarAlerta(mensagem, titulo = "Atenção") {
  if (typeof window.alerta === "function") {
    window.alerta(mensagem, titulo, titulo === "Erro" ? "erro" : "aviso");
    return;
  }

  alert(mensagem);
}

function fecharModalAlerta() {
  window.fecharAlertaGlobal?.();
}

/* =====================================================
   REGISTRO MODULE LOADER ✅ EASYLOC SPA
===================================================== */

window.initCadastroFornecedores = initCadastroFornecedores;
window.__moduleInit = window.initCadastroFornecedores;

})();
