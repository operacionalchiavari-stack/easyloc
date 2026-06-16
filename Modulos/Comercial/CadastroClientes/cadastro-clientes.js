function initCadastroClientes(){
  "use strict";

  // evita listeners duplicados
const root = document.querySelector("#clientTable");
if (!root) return;

if (root.dataset.initialized === "true") return;
root.dataset.initialized = "true";

  /* =====================================================
     UTIL
  ===================================================== */
  function normalizarDataUltimaLocacao(valor) {
    if (!valor) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      return valor;
    }

    const match = valor.match(/\d+/);
    if (match) {
      const dias = parseInt(match[0], 10);
      const d = new Date();
      d.setDate(d.getDate() - dias);
      return d.toISOString().slice(0, 10);
    }

    return null;
  }

  /* =====================================================
     VALIDAÇÕES - CLIENTE
  ===================================================== */

  // remove tudo que não é número
  function soNumeros(v) {
    return (v || "").replace(/\D/g, "");
  }

  /* ---------- CPF ---------- */
  function validarCPF(cpf) {
    cpf = soNumeros(cpf);

    if (cpf.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cpf)) return false;

    let soma = 0;
    let resto;

    for (let i = 1; i <= 9; i++) {
      soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
    }

    resto = (soma * 10) % 11;
    if (resto >= 10) resto = 0;
    if (resto !== parseInt(cpf.substring(9, 10))) return false;

    soma = 0;
    for (let i = 1; i <= 10; i++) {
      soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
    }

    resto = (soma * 10) % 11;
    if (resto >= 10) resto = 0;
    if (resto !== parseInt(cpf.substring(10, 11))) return false;

    return true;
  }

  /* ---------- EMAIL ---------- */
  function validarEmail(email) {
    if (!email) return false;
    email = email.trim().toLowerCase();

    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  /* ---------- TELEFONE (BR) ---------- */
  function validarTelefoneBR(tel) {
    tel = soNumeros(tel);

    if (tel.length < 10 || tel.length > 11) return false;
    if (tel[0] === "0") return false;
    if (tel.length === 11 && tel[2] !== "9") return false;

    return true;
  }

  /* ---------- TAGS ---------- */
  function validarTagsObrigatorias() {
    let valido = true;

    document.querySelectorAll(".tag-group").forEach(group => {
      const groupName = group.dataset.group;
      if (!groupName) return;

      const selecionadas = group.querySelectorAll(".tag.selected");

      if (selecionadas.length === 0) {
        valido = false;
      }
    });

    if (!valido) {
      mostrarAlerta("Selecione pelo menos uma opção em cada grupo de tags.");
      return false;
    }

    return true;
  }

  /* ---------- VALIDAÇÃO COMPLETA DO CLIENTE ---------- */
  function validarClienteCompleto() {

    const enderecoInput = document.getElementById("endereco");

    if (!nome.value.trim()) {
      mostrarAlerta("Nome / Razão Social é obrigatório");
      nome.focus();
      return false;
    }

    if (!cpfCnpj.value.trim()) {
      mostrarAlerta("CPF / CNPJ é obrigatório");
      cpfCnpj.focus();
      return false;
    }

    if (
      tipoPessoa.value === "PF" ||
      tipoPessoa.value === "Pessoa Física"
    ) {
      if (!validarCPF(cpfCnpj.value)) {
        mostrarAlerta("CPF inválido. Verifique os números.");
        cpfCnpj.focus();
        return false;
      }
    }

    if (!validarEmail(email.value)) {
      mostrarAlerta("Email inválido. Verifique e tente novamente.");
      email.focus();
      return false;
    }

    if (!validarTelefoneBR(telefone.value)) {
      mostrarAlerta("Telefone inválido. Use DDD + número.");
      telefone.focus();
      return false;
    }

    if (!enderecoInput || !enderecoInput.value.trim()) {
      mostrarAlerta("Endereço é obrigatório.");
      enderecoInput?.focus();
      return false;
    }

    if (!numeroEndereco.value.trim()) {
      mostrarAlerta("Número do endereço é obrigatório.");
      numeroEndereco.focus();
      return false;
    }

    if (!pontoReferencia.value.trim()) {
      mostrarAlerta("Ponto de referência é obrigatório.");
      pontoReferencia.focus();
      return false;
    }

    if (!statusCliente.value) {
      mostrarAlerta("Status do cliente é obrigatório.");
      statusCliente.focus();
      return false;
    }

    if (!window.enderecoSelecionadoGoogle) {
      mostrarAlerta("Selecione um endereço válido da lista do Google.");
      enderecoInput?.focus();
      return false;
    }

    return true;
  }
/* =====================================================
   SUPABASE
===================================================== */
if (!window.supabaseClient) {
  console.error("SupabaseClient não encontrado");
  return;
}

const supabase = window.supabaseClient;

/* =====================================================
   AUTH / EMPRESA
===================================================== */
function getEmpresaAtualId() {
  return window.__CONTEXT?.empresa_id;
}

/* =====================================================
   ESTADO
===================================================== */
let clienteAtualId = null;
const modal = document.getElementById("modal");

/* ESTADO ÚNICO (LOCAL + GLOBAL) */
let clientesCache = [];
window.clientesCache = clientesCache;

/* =====================================================
   MODAL
===================================================== */
function clientes_openAdd() {
  clienteAtualId = null;

  modal.style.display = "flex";

  // REMOVE MODO READONLY DO MODAL
  modal.classList.remove("readonly");

  // cria input limpo
  criarInputEndereco("");

  document
    .querySelectorAll("#modal input, #modal textarea")
    .forEach(e => {
      e.value = "";
      e.readOnly = false;
    });

  document
    .querySelectorAll("#modal select")
    .forEach(e => (e.disabled = false));

  // LIBERA TAGS
  document.querySelectorAll(".tag").forEach(tag => {
    tag.classList.remove("selected");
    tag.style.pointerEvents = "auto";
    tag.style.opacity = "1";
  });

  document.querySelector(".btn-save").style.display = "inline-block";

  setTimeout(() => {
    initEnderecoAutocomplete();
  }, 200);
}

function clientes_enableEdit() {
  resetEnderecoAutocomplete();
  setReadOnly(false);

  // endereço vindo do banco é válido
  window.enderecoSelecionadoGoogle = true;

  setTimeout(() => {
    if (window.google?.maps?.places) initEnderecoAutocomplete();
  }, 300);
}

function clientes_closeModal() {
  modal.style.display = "none";
}

function setReadOnly(v) {
  modal.classList.toggle("readonly", v);

  document
    .querySelectorAll("#modal input, #modal textarea")
    .forEach(e => (e.readOnly = v));

  document
    .querySelectorAll("#modal select")
    .forEach(e => (e.disabled = v));

  document.querySelectorAll(".tag").forEach(tag => {
    tag.style.pointerEvents = v ?"none" : "auto";
    tag.style.opacity = v ?0.6 : 1;
  });

  document.querySelector(".btn-save").style.display =
    v ?"none" : "inline-block";

  document.querySelector(".btn-delete").style.display =
    v ?"inline-block" : "none";
}

/* =====================================================
   VALIDAÇÃO
===================================================== */
function mostrarAlerta(msg) {
  try { document.activeElement?.blur(); } catch (e) {}

  const pac = document.querySelector(".pac-container");
  if (pac) pac.style.display = "none";

  if (typeof window.alerta === "function") {
    window.alerta(msg, "Atenção", "aviso");
    return;
  }

  alert(msg);
}

function fecharValidationModal() {
  const modal = document.getElementById("validationModal");
  if (modal) modal.style.display = "none";
}

window.fecharValidationModal = fecharValidationModal;

/* =====================================================
   TAGS
===================================================== */
function coletarTagsSelecionadas() {
  const tags = {};

  document.querySelectorAll(".tag-group").forEach(group => {
    const groupName = group.dataset.group;
    if (!groupName) return;

    const selecionadas = Array.from(
      group.querySelectorAll(".tag.selected")
    ).map(tag => tag.textContent.trim());

    if (group.classList.contains("single")) {
      tags[groupName] = selecionadas[0] || null;
    } else {
      tags[groupName] = selecionadas;
    }
  });

  return tags;
}

/* =====================================================
   DUPLICIDADE
===================================================== */
async function verificarDuplicidadeCliente({
  cpf,
  nome,
  empresaId,
  clienteId
}) {
  const cpfLimpo = soNumeros(cpf);
  const nomeLimpo = nome.trim();

  if (cpfLimpo) {
    let query = supabase
      .from("clientes_empresas")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("cpf_cnpj", cpfLimpo);

    if (clienteId) query = query.neq("id", clienteId);

    const { data, error } = await query;

    if (error) {
      console.error("Erro CPF duplicado:", error);
      return "Erro ao verificar CPF.";
    }

    if (data?.length) {
      return "Já existe um cliente com este CPF cadastrado nesta empresa.";
    }
  }

  if (nomeLimpo) {
    let query = supabase
      .from("clientes_empresas")
      .select("id")
      .eq("empresa_id", empresaId)
      .ilike("nome_razao", nomeLimpo);

    if (clienteId) query = query.neq("id", clienteId);

    const { data, error } = await query;

    if (error) {
      console.error("Erro nome duplicado:", error);
      return "Erro ao verificar nome.";
    }

    if (data?.length) {
      return "Já existe um cliente com este nome cadastrado nesta empresa.";
    }
  }

  return null;
}
/* =====================================================
   SALVAR
===================================================== */

async function clientes_salvar() {
  if (!validarClienteCompleto()) return;
  if (!validarTagsObrigatorias()) return;

  try {
    const empresaId = await getEmpresaAtualId();

    // VERIFICA CPF OU NOME JÁ CADASTRADOS
    const existe = await verificarDuplicidadeCliente({
      cpf: soNumeros(cpfCnpj.value),
      nome: nome.value,
      empresaId,
      clienteId: clienteAtualId // ESSENCIAL
    });

    if (existe) {
      mostrarAlerta(existe);
      return;
    }

    const payload = {
      nome_razao: nome.value,
      cpf_cnpj: soNumeros(cpfCnpj.value),
      telefone: telefone.value,
      email: email.value,
      endereco: endereco.value,
      numero_endereco: numeroEndereco.value,
      ponto_referência: pontoReferencia.value,
      status: statusCliente.value,
      ultima_locacao: normalizarDataUltimaLocacao(ultimaLocacao.value),
      tipo_pessoa:
        tipoPessoa.value === "Pessoa Jurídica" ?"PJ" : "PF",
      inscricao_estadual: inscricaoEstadual.value || null,
      empresa_id: empresaId,

      // TAGS (JSON)
      tags: coletarTagsSelecionadas()
    };

    let query = supabase.from("clientes_empresas");
    let result;

    if (clienteAtualId) {
      result = await query.update(payload).eq("id", clienteAtualId);
    } else {
      result = await query.insert(payload);
    }

    if (result.error) {
      mostrarAlerta("Erro ao salvar cliente.");
      return;
    }

    clientes_closeModal();
    await carregarClientes(); // garante reload consistente

  } catch (err) {
    mostrarAlerta(err.message || "Erro ao salvar cliente");
  }
}

function abrirDetalhesCliente(cliente) {
  clienteAtualId = cliente.id;

  // abre modal
  modal.style.display = "flex";

  // =============================
  // ENDEREÇO (CRIA INPUT + GOOGLE)
  // =============================
  criarInputEndereco(cliente.endereco || "");

  setTimeout(() => {
    initEnderecoAutocomplete();
  }, 200);

  // =============================
  // PREENCHIMENTO DOS CAMPOS
  // =============================
  tipoPessoa.value =
    cliente.tipo_pessoa === "PJ"
      ?"Pessoa Jurídica"
      : "Pessoa Física";

  cpfCnpj.value = cliente.cpf_cnpj || "";
  nome.value = cliente.nome_razao || "";
  telefone.value = cliente.telefone || "";
  email.value = cliente.email || "";

  inscricaoEstadual.value = cliente.inscricao_estadual || "";
  numeroEndereco.value = cliente.numero_endereco || "";
  pontoReferencia.value = cliente.ponto_referência || "";
  ultimaLocacao.value = cliente.ultima_locacao || "";
  statusCliente.value = cliente.status || "";

  // =============================
  // TAGS
  // =============================
  document
    .querySelectorAll(".tag")
    .forEach(tag => tag.classList.remove("selected"));

  if (cliente.tags) {
    document.querySelectorAll(".tag-group").forEach(group => {
      const groupName = group.dataset.group;
      if (!groupName) return;

      const valor = cliente.tags[groupName];
      if (!valor) return;

      const valores = Array.isArray(valor)
        ?valor
        : [valor];

      valores.forEach(v => {
        const tagEl = Array.from(
          group.querySelectorAll(".tag")
        ).find(t => t.textContent.trim() === v);

        if (tagEl) tagEl.classList.add("selected");
      });
    });
  }

  // =============================
  // MODO VISUALIZAÇÃO
  // =============================
  setReadOnly(true);

  window.enderecoSelecionadoGoogle = true;
}

async function clientes_excluir() {
  if (!clienteAtualId) return;

  const confirmou = await window.confirmarGlobal?.(
    "Deseja realmente excluir este cliente?",
    "Confirmar exclusão",
    { confirmarTexto: "Excluir", tipo: "error" }
  );

  if (!confirmou) return;

  const { error } = await supabase
    .from("clientes_empresas")
    .delete()
    .eq("id", clienteAtualId);

  if (error) {
    mostrarAlerta("Erro ao excluir cliente.");
    return;
  }

  clientes_closeModal();
  await carregarClientes();
}

/* =====================================================
   LISTAGEM
===================================================== */
async function carregarClientes() {
  try {
    const empresaId = await getEmpresaAtualId();

    const { data, error } = await supabase
      .from("clientes_empresas")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false });

    if (!error) {
      clientesCache = (data || []).map(c => {
        if (typeof c.tags === "string") {
          try {
            c.tags = JSON.parse(c.tags);
          } catch {
            c.tags = {};
          }
        }
        return c;
      });

      // SINCRONIZA GLOBAL
      window.clientesCache = clientesCache;

      aplicarFiltros();
    }
  } catch {}
}
/* =====================================================
   SEGURANÇA HTML (ANTI XSS)
===================================================== */
function esc(v){
  return String(v || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}
function calcularInatividade(ultimaLocacao) {
  if (!ultimaLocacao) return "-";

  const hoje = new Date();
  const ultima = new Date(ultimaLocacao);

  const diffMs = hoje - ultima;
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return diffDias + " dias";
}

function extrairTag(tags, nomeGrupo) {
  if (!tags) return "-";

  const chave = Object.keys(tags).find(
    k => k.toLowerCase() === nomeGrupo.toLowerCase()
  );

  if (!chave) return "-";

  const valor = tags[chave];

  return Array.isArray(valor) ?valor.join(", ") : valor;
}

function renderizarTagsComoCards(tags, grupo, classe) {
  if (!tags) return "-";

  const normalizar = str =>
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const chave = Object.keys(tags).find(
    k => normalizar(k) === normalizar(grupo)
  );

  if (!chave) return "-";

  const valores = Array.isArray(tags[chave])
    ?tags[chave]
    : [tags[chave]];

  return `
    <div class="table-tags">
      ${valores
        .map(v => `<span class="table-tag ${classe}">${esc(v)}</span>`)
        .join("")}
    </div>
  `;
}

function renderizarTabelaClientes(clientes) {
  const tbody = document.getElementById("clientTable");
  if (!tbody) return;

  tbody.innerHTML = "";

const fragment = document.createDocumentFragment();

clientes.forEach(c => {

  const tr = document.createElement("tr");
  tr.style.cursor = "pointer";

  tr.innerHTML = `
    <td>${esc(c.nome_razao)}</td>
    <td>${esc(c.cpf_cnpj)}</td>
    <td>${esc(c.telefone)}</td>
    <td>${esc(c.email)}</td>

    <td>${renderizarTagsComoCards(c.tags,"Estilo","tag-estilo")}</td>
    <td>${renderizarTagsComoCards(c.tags,"Canal","tag-canal")}</td>
    <td>${renderizarTagsComoCards(c.tags,"Orçamento","tag-orcamento")}</td>

    <td>${calcularInatividade(c.ultima_locacao)}</td>

    <td>
      <span class="status ${calcularStatusAutomatico(c).toLowerCase()}">
        ${calcularStatusAutomatico(c)}
      </span>
    </td>
  `;

  tr.addEventListener("click", () => abrirDetalhesCliente(c));

  fragment.appendChild(tr);
});

tbody.appendChild(fragment);
}

function aplicarFiltros() {
  const texto =
    document.getElementById("searchInput")?.value.toLowerCase() || "";
  const status =
    document.getElementById("statusFilter")?.value || "";
  const inatividade =
    document.getElementById("inactiveFilter")?.value || "";
  const estilo =
    document.getElementById("styleFilter")?.value || "";
  const orcamento =
    document.getElementById("budgetFilter")?.value || "";

  const base =
    window.clientesCache || clientesCache || [];

  let filtrados = [...base];

  // BUSCA
  if (texto) {
    filtrados = filtrados.filter(c =>
      c.nome_razao?.toLowerCase().includes(texto) ||
      c.cpf_cnpj?.includes(texto) ||
      c.email?.toLowerCase().includes(texto)
    );
  }

  // STATUS
  if (status) {
    filtrados = filtrados.filter(
      c => calcularStatusAutomatico(c) === status
    );
  }

  //  INATIVIDADE
  if (inatividade) {
    filtrados = filtrados.filter(c => {
      if (!c.ultima_locacao) return false;

      const dias =
        (new Date() - new Date(c.ultima_locacao)) /
        (1000 * 60 * 60 * 24);

      if (inatividade === "30") return dias <= 30;
      if (inatividade === "90") return dias > 30 && dias <= 90;
      if (inatividade === "180") return dias > 90;
      return true;
    });
  }

  // ESTILO
  if (estilo) {
    filtrados = filtrados.filter(c => {
      if (!c.tags || !Array.isArray(c.tags.estilo)) return false;
      return c.tags.estilo.includes(estilo);
    });
  }

  // ORÇAMENTO
  if (orcamento) {
    filtrados = filtrados.filter(c =>
      Array.isArray(c.tags?.orcamento)
        ?c.tags.orcamento.includes(orcamento)
        : false
    );
  }

  window.clientesFiltrados = filtrados;
  renderizarTabelaClientes(filtrados);
}

/* =====================================================
   TAGS
===================================================== */
document.addEventListener("click", e => {
  const tag = e.target.closest(".tag");
  if (!tag || tag.closest(".modal.readonly")) return;

  const group = tag.closest(".tag-group");
  if (group?.classList.contains("single")) {
    group
      .querySelectorAll(".tag")
      .forEach(t => t.classList.remove("selected"));
  }

  tag.classList.toggle("selected");
});

/* =====================================================
   EXPORT
===================================================== */
window.clientes_openAdd = clientes_openAdd;
window.clientes_enableEdit = clientes_enableEdit;
window.clientes_closeModal = clientes_closeModal;
window.clientes_salvar = clientes_salvar;
window.clientes_excluir = clientes_excluir;
window.aplicarFiltros = aplicarFiltros;

// inicialização
carregarClientes();

/* =====================================================
   DESTROY DO MÓDULO CLIENTES (SPA SAFE)
===================================================== */
window.__activeModuleDestroy = function(){

  console.log("destroy Cadastro Clientes");

  // limpa Google Places
  resetEnderecoAutocomplete();

  // libera SPA guard
  const root = document.querySelector("#clientTable");
  if (root) {
    root.dataset.initialized = "false";
  }

};

window.finalizarCarregamentoModulo?.();
}

// SPA guard: expõe init
window.__moduleInit = initCadastroClientes;
/* =====================================================
   GOOGLE PLACES - AUTOCOMPLETE + VALIDAÇÃO
===================================================== */

// estado global (SPA safe)
window.enderecoAutocomplete = window.enderecoAutocomplete || null;
window.enderecoSelecionadoGoogle = window.enderecoSelecionadoGoogle || false;

function resetEnderecoAutocomplete() {
  if (window.enderecoAutocomplete) {
    try {
      window.enderecoAutocomplete.unbindAll();
    } catch (e) {}
  }
  window.enderecoAutocomplete = null;
  window.enderecoSelecionadoGoogle = false;
}

function initEnderecoAutocomplete() {
  const input = document.getElementById("endereco");

  if (!input) {
    console.warn("Input #endereco ainda não existe");
    return;
  }

  // limpa autocomplete antigo
  if (window.enderecoAutocomplete) {
    try {
      window.enderecoAutocomplete.unbindAll();
    } catch (e) {}
    window.enderecoAutocomplete = null;
  }

  if (!window.google?.maps?.places) {
    window.carregarGooglePlaces?.()
      .then(() => initEnderecoAutocomplete())
      .catch((error) => {
        console.error("Google Places não carregado:", error);
        mostrarAlerta?.("Google Places nao configurado. Verifique a chave do Google Maps.");
      });
    return;
  }

  window.enderecoAutocomplete = new google.maps.places.Autocomplete(input, {
    componentRestrictions: { country: "br" }
  });

  window.enderecoAutocomplete.addListener("place_changed", () => {
    const place = window.enderecoAutocomplete.getPlace();

    if (!place || !place.formatted_address) {
      window.enderecoSelecionadoGoogle = false;
      return;
    }

    window.enderecoSelecionadoGoogle = true;
    input.value = place.formatted_address;
  });

  input.addEventListener("input", () => {
    window.enderecoSelecionadoGoogle = false;
  });

  console.log("Google Places OK");
}

function calcularStatusAutomatico(cliente) {
  if (!cliente || !cliente.ultima_locacao) return "Ativo";

  const hoje = new Date();
  const ultima = new Date(cliente.ultima_locacao);
  const diffDias = Math.floor(
    (hoje - ultima) / (1000 * 60 * 60 * 24)
  );

  if (diffDias > 120) return "Inativo";
  if (diffDias > 90) return "Morno";

  return "Ativo";
}

function clientes_imprimir() {
  const clientes =
    window.clientesFiltrados ||
    window.clientesCache ||
    [];

  if (!clientes.length) {
    mostrarAlerta("Nenhum cliente para imprimir.");
    return;
  }

  const win = window.open("", "_blank");

  win.document.write(`
    <html>
      <head>
        <title>Clientes • EasyLoc</title>
        <style>
          ${clientes_css_impressao()}
        </style>
      </head>
      <body>
        <h1>Clientes Cadastrados</h1>
        <div class="cards">
          ${clientes.map(c => clientes_card_impressao(c)).join("")}
        </div>
      </body>
    </html>
  `);

  win.document.close();

  win.onload = () => {
    win.focus();
    win.print();
  };
}

function clientes_css_impressao() {
  return `
    @page {
      size: A4;
      margin: 20mm;
    }

    body {
      font-family: 'Inter', Arial, sans-serif;
      color: #1f2937;
      background: #ffffff;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #ff7a00;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }

    .logo {
      font-size: 22px;
      font-weight: 800;
      color: #1f3b73;
    }

    .logo img {
      max-height: 48px;
      display: block;
    }

    .meta {
      font-size: 12px;
      text-align: right;
      color: #374151;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    thead {
      background: #1f3b73;
      color: #ffffff;
    }

    th, td {
      padding: 8px;
      border-bottom: 1px solid #e5e7eb;
      text-align: left;
    }

    tr:nth-child(even) {
      background: #f9fafb;
    }

    .status {
      font-weight: 600;
      color: #ff7a00;
    }
  `;
}

function clientes_card_impressao(c) {
  return `
    <tr>
<td>${esc(c.nome_razao)}</td>
<td>${esc(c.cpf_cnpj)}</td>
<td>${esc(c.telefone)}</td>
<td>${esc(c.email)}</td>
      <td>${c.endereco || ""} ${c.numero_endereco || ""}</td>
      <td class="status">${calcularStatusAutomatico(c)}</td>
    </tr>
  `;
}

document.addEventListener("keydown", function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
    e.preventDefault();
    clientes_imprimir();
  }
});
// =====================
// IMPRESSÃO / PDF
// =====================

window.clientes_imprimir = function () {
  const lista =
    window.clientesFiltrados ||
    window.clientesCache ||
    [];

  if (!lista.length) {
    mostrarAlerta("Nenhum cliente para imprimir.");
    return;
  }

  const iframe = document.getElementById("printFrame");
  if (!iframe || !iframe.contentWindow) {
    mostrarAlerta("Iframe de impressão não encontrado.");
    return;
  }

  const doc = iframe.contentWindow.document;

  doc.open();
  doc.write(`
    <html>
      <head>
        <title>Clientes • EasyLoc</title>
        <style>
          ${clientes_css_impressao()}
        </style>
      </head>
      <body>
        ${clientes_cabecalho_impressao()}
        ${clientes_filtros_impressao()}

        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>CPF / CNPJ</th>
              <th>Telefone</th>
              <th>Email</th>
              <th>Endereço</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${lista.map(c => clientes_card_impressao(c)).join("")}
          </tbody>
        </table>
      </body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  }, 300);
};

// intercepta CTRL + P
document.addEventListener("keydown", function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
    e.preventDefault();
    window.clientes_imprimir();
  }
});

function clientes_cabecalho_impressao() {
  const agora = new Date();
  const dataHora = agora.toLocaleString("pt-BR");

  return `
    <div class="header">
      <div class="logo">
        <img
          src="https://awemuohtvwvrdzfxwrmd.supabase.co/storage/v1/object/public/logos/logo.png"
          alt="EasyLoc"
        >
      </div>
      <div class="meta">
        <div><strong>Relatório de Clientes</strong></div>
        <div>Impresso em: ${dataHora}</div>
      </div>
    </div>
  `;
}

function clientes_filtros_impressao() {
  const filtros = [];

  const searchInput = document.getElementById("searchInput");
  const statusFilter = document.getElementById("statusFilter");
  const styleFilter = document.getElementById("styleFilter");
  const budgetFilter = document.getElementById("budgetFilter");
  const inactiveFilter = document.getElementById("inactiveFilter");

  if (searchInput?.value) filtros.push(`Busca: "${searchInput.value}"`);
  if (statusFilter?.value) filtros.push(`Status: ${statusFilter.value}`);
  if (styleFilter?.value) filtros.push(`Estilo: ${styleFilter.value}`);
  if (budgetFilter?.value) filtros.push(`Orçamento: ${budgetFilter.value}`);
  if (inactiveFilter?.value) filtros.push(`Inatividade: ${inactiveFilter.value} dias`);

  if (!filtros.length) {
    filtros.push("Nenhum filtro aplicado");
  }

  return `
    <div class="filters">
      <strong>Filtros aplicados:</strong><br>
      ${filtros.join(" • ")}
    </div>
  `;
}

// ENDEREÇO
// =====================

function criarInputEndereco(valor = "") {
  const wrapper = document.getElementById("endereco-wrapper");
  if (!wrapper) return;

  wrapper.innerHTML = "";

  const input = document.createElement("input");
  input.id = "endereco";
  input.className = "el-input";
  input.type = "text";
  input.placeholder =
    "Pesquise rua, salão, chácara, buffet, ponto conhecido...";
  input.value = valor || "";
  input.autocomplete = "off";

  wrapper.appendChild(input);
}

