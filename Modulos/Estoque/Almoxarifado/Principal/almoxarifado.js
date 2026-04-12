(function () {

// 🔥 PADRÃO SPA: MÓDULO ALMoxarifado
window.almoxarifadoInitialized = window.almoxarifadoInitialized || false;
window.eventListenersAlmoxarifado = window.eventListenersAlmoxarifado || []; // Para armazenar listeners para cleanup

function initAlmoxarifado() {
const root = document.querySelector('[data-module="almoxarifado"]') || document.getElementById("main-content");
if (!root) {
console.warn("⚠️ Root do almoxarifado não encontrado");
return;
}

// Reset se já foi inicializado antes
if (window.almoxarifadoInitialized) {
cleanupAlmoxarifado();
}

window.almoxarifadoInitialized = true;

console.log("🚀 Almoxarifado inicializado");

// Iniciar lógica do módulo
initSistemaFront();
carregarSetoresMetas();
carregarFuncionarios();

// Adicionar event listeners
setupEventListeners();

// Carregar dados iniciais
carregarTudo();

if (window.finalizarCarregamentoModulo) {
window.finalizarCarregamentoModulo();
}
}

function cleanupAlmoxarifado() {
console.log("🧹 Limpando almoxarifado");

// Remover event listeners
window.eventListenersAlmoxarifado.forEach(({ element, event, handler }) => {
if (element && element.removeEventListener) {
element.removeEventListener(event, handler);
}
});
window.eventListenersAlmoxarifado = [];

// Resetar flags e variáveis globais se necessário
window.almoxarifadoInitialized = false;
}

// Funções auxiliares
function addEventListenerSafe(element, event, handler) {
if (element) {
element.addEventListener(event, handler);
window.eventListenersAlmoxarifado.push({ element, event, handler });
}
}

function showLoading(status) {
document.getElementById("loading").classList.toggle("show", !!status);
}

function abrirTab(tab) {
document.querySelectorAll(".tab-btn").forEach(btn => {
btn.classList.toggle("active", btn.dataset.tab === tab);
});

document.querySelectorAll(".section").forEach(sec => sec.classList.remove("active"));
document.getElementById("tab-" + tab).classList.add("active");

// 🔥 AQUI É O SEGREDO
if (tab === "cadastro") {
carregarCodigoAutomatico();
}
}

function alertar(msg) {
alert(msg);
}

function initSistemaFront() {
console.log("🚀 Sistema front-end inicializado");
showLoading(false);
}

function carregarTudo() {
carregarDashboard();
atualizarSelectsProdutos();
carregarUsuariosSelect();
}

function carregarDashboard() {
console.log("📊 Carregando dashboard (mock data)");
showLoading(false);

// Mock data for testing
document.getElementById("cardTotalItens").innerText = "0";
document.getElementById("cardEstoqueTotal").innerText = "0";
document.getElementById("cardAbaixoMinimo").innerText = "0";
document.getElementById("cardEmprestimos").innerText = "0";
document.getElementById("cardMeta").innerText = "0%";
document.getElementById("semanaAtualLabel").innerText = formatarPeriodoSemana(gerarSemanaAtual());
document.getElementById("cardAssertividade").innerText = "0%";
document.getElementById("cardTetoGastos").innerText = "0%";

renderTabelaProdutos([]);
renderMovimentacoesRecentes([]);
renderMovimentacoes([]);
renderEmprestimos([]);
renderContagens([]);
}

function preencherSelectProdutos(id, lista) {
const select = document.getElementById(id);
if (!select) return;

select.innerHTML = `<option value="">Selecione</option>`;

(lista || []).forEach(p => {
const opt = document.createElement("option");
opt.value = p.ID;
opt.textContent = `${p.Codigo || "-"} • ${p.Produto || "-"}`;
select.appendChild(opt);
});
}

function carregarUsuariosSelect() {
console.log("👥 Carregando usuários (mock data)");
preencherSelectUsuarios("movResponsavel", []);
preencherSelectUsuarios("empResponsavelEntrega", []);
preencherSelectUsuarios("contResponsavel", []);
renderUsuarios([]);
}

function preencherSelectUsuarios(id, lista) {
const select = document.getElementById(id);
if (!select) return;

select.innerHTML = `<option value="">Selecione</option>`;

(lista || []).forEach(u => {
const opt = document.createElement("option");
opt.value = u.Nome;
opt.textContent = u.Nome;
select.appendChild(opt);
});
}

function renderUsuarios(lista) {
const tbody = document.getElementById("tbodyUsuarios");
if (!tbody) return;

tbody.innerHTML = "";

(lista || []).forEach(u => {
const tr = document.createElement("tr");
tr.innerHTML = `
<td>${u.Nome || "-"}</td>
<td>${u.Setor || "-"}</td>
<td>${u.Funcao || "-"}</td>
<td>${u.Status || "Ativo"}</td>
`;
tbody.appendChild(tr);
});
}

window.produtosDashboard = window.produtosDashboard || [];

function renderTabelaProdutos(lista) {
const tbody = document.getElementById("tbodyProdutos");
const filtroInput = document.getElementById("filtroProduto");
if (!tbody) return;

if (Array.isArray(lista)) {
window.produtosDashboard = lista;
}

const filtro = ((filtroInput && filtroInput.value) || "").toLowerCase().trim();

tbody.innerHTML = "";

(window.produtosDashboard || [])
.filter(p => {
if (!filtro) return true;
return (
  String(p.Codigo || "").toLowerCase().includes(filtro) ||
  String(p.Produto || "").toLowerCase().includes(filtro) ||
  String(p.Categoria || "").toLowerCase().includes(filtro) ||
  String(p.Setor || "").toLowerCase().includes(filtro)
);
})
.forEach(p => {
const tr = document.createElement("tr");
tr.innerHTML = `
<td>${p.Codigo || "-"}</td>
<td>${p.Produto || "-"}</td>
<td>${p.Categoria || "-"}</td>
<td>${p.Setor || "-"}</td>
<td>${p.Unidade || "-"}</td>
<td>${formatarNumero(p.EstoqueMinimo || 0)}</td>
<td><span class="badge badge-ok">OK</span></td>
`;
tbody.appendChild(tr);
});
}

function formatarNumero(valor) {
return Number(valor || 0).toLocaleString("pt-BR");
}
function salvarProdutoFront() {
alertar("💾 Salvar produto - Funcionalidade a ser implementada com Supabase");
}

function limparFormProduto() {
document.getElementById("prodCodigo").value = "";
document.getElementById("prodNome").value = "";
document.getElementById("prodCategoria").value = "";
document.getElementById("prodSetor").value = "";
document.getElementById("prodUnidade").value = "";
document.getElementById("prodEstoqueAtual").value = "";
document.getElementById("prodEstoqueMinimo").value = "";
document.getElementById("prodValorCusto").value = "";
document.getElementById("prodValorReposicao").value = "";
document.getElementById("prodStatus").value = "Ativo";
document.getElementById("prodObs").value = "";
}

function salvarMovimentacaoFront() {
alertar("📦 Salvar movimentação - Funcionalidade a ser implementada com Supabase");
}

function salvarEmprestimoFront() {
alertar("🔄 Salvar empréstimo - Funcionalidade a ser implementada com Supabase");
}

function salvarContagemFront() {
alertar("📊 Salvar contagem - Funcionalidade a ser implementada com Supabase");
}

function salvarUsuarioFront() {
alertar("👤 Salvar usuário - Funcionalidade a ser implementada com Supabase");
}

function formatarNumero(valor) {
return Number(valor || 0).toLocaleString("pt-BR");
}

function formatarDataHora(data) {
return new Date(data).toLocaleString("pt-BR");
}
function capitalize(txt) {
txt = String(txt || "");
return txt ? txt.charAt(0).toUpperCase() + txt.slice(1) : "-";
}

// window.addEventListener("load", () => {

const semana = gerarSemanaAtual();

document.getElementById("contSemana").dataset.valor = semana;
document.getElementById("contSemana").value = formatarPeriodoSemana(semana);

function atualizarSelectsProdutos() {
const semana = document.getElementById("contSemana")?.value || "";
console.log("📦 Atualizando selects de produtos (mock data)");
preencherSelectProdutos("movProduto", []);
preencherSelectProdutos("empProduto", []);
renderListaContagem([], semana);
}
function carregarCodigoAutomatico() {
console.log("🔢 Gerar código automático - Funcionalidade a ser implementada com Supabase");
document.getElementById("prodCodigo").value = "AUTO-" + Date.now();
}
function renderMovimentacoesRecentes(lista) {

const tbody = document.getElementById("tbodyMovRecentes");
if (!tbody) return;

tbody.innerHTML = "";

(lista || []).forEach(m => {

  const tr = document.createElement("tr");

  tr.innerHTML = `
<td>${formatarDataHora(m.DataHora)}</td>
<td>
<span class="badge-tipo ${m.Tipo === "entrada" ? "tipo-entrada" : "tipo-saida"}">
${capitalize(m.Tipo)}
</span>
</td>
<td>${m.Produto || "-"}</td>
<td>${formatarNumero(m.Quantidade || 0)}</td>
<td>${m.Responsavel || "-"}</td>
`;

  tbody.appendChild(tr);
});
}
function renderMovimentacoes(lista) {

const tbody = document.getElementById("tbodyMovimentacoes");
if (!tbody) return;

tbody.innerHTML = "";

(lista || []).forEach(m => {

  const tr = document.createElement("tr");

  tr.innerHTML = `
<td>${formatarDataHora(m.DataHora)}</td>
<td>
<span class="badge-tipo ${m.Tipo === "entrada" ? "tipo-entrada" : "tipo-saida"}">
${capitalize(m.Tipo)}
</span>
</td>
<td>${m.Produto || "-"}</td>
<td>${formatarNumero(m.Quantidade || 0)}</td>
<td>${m.Solicitante || "-"}</td>
`;

  tbody.appendChild(tr);
});
}
function renderEmprestimos(lista) {

const tbody = document.getElementById("tbodyEmprestimos");
if (!tbody) return;

tbody.innerHTML = "";

(lista || []).forEach(e => {

  const tr = document.createElement("tr");

  tr.innerHTML = `
<td>${e.Produto || "-"}</td>
<td>${formatarNumero(e.Quantidade || 0)}</td>
<td>${e.PessoaQuePegou || "-"}</td>
<td>
  <span class="badge ${e.Status === "Aberto" ? "badge-open" : "badge-ok"}">
    ${e.Status || "-"}
  </span>
</td>
<td>
  ${e.Status === "Aberto"
      ? `<button onclick="devolverEmprestimo('${e.ID}')" class="btn btn-outline">Devolver</button>`
      : "-"
    }
</td>
`;

  tbody.appendChild(tr);
});
}
function devolverEmprestimo(id) {
alertar("🔄 Devolver empréstimo - Funcionalidade a ser implementada com Supabase");
}
function abrirModalConfirm(callback) {

const modal = document.getElementById("modalConfirm");
modal.classList.remove("hidden");

document.getElementById("inputResponsavel").value = "";

const btn = document.getElementById("btnConfirmar");

btn.onclick = () => {
  callback();
};
}

function fecharModal() {
document.getElementById("modalConfirm").classList.add("hidden");
}
function renderCirculosMetas(lista) {

const container = document.getElementById("areaCirculos");
if (!container) return;

container.innerHTML = "";

(lista || []).forEach(item => {

  container.innerHTML += `
<div class="card-circulo">
  <div class="circulo" data-percent="${item.percentual}">
    <div class="circulo-inner">${Math.round(item.percentual)}%</div>
  </div>
  <div class="titulo">${item.nome}</div>
</div>
`;
});

document.querySelectorAll(".circulo").forEach(el => {
  const percent = Number(el.dataset.percent || 0);
  el.style.setProperty("--p", percent);
});
}
function carregarSetoresMetas() {
console.log("🏢 Carregando setores e metas (mock data)");
// Mock: não faz nada por enquanto
}
function carregarFuncionarios() {
console.log("👷 Carregando funcionários (mock data)");
// Mock: não faz nada por enquanto
}

function renderListaContagem(lista, semana) {

const container = document.getElementById("listaContagem");
if (!container) return;

container.innerHTML = "";

if (!lista.length) {
  container.innerHTML = `
<div style="text-align:center; padding:20px; color:#64748b;">
  ✔ Tudo contado essa semana!
</div>
`;
  return;
}

lista.forEach(item => {

  const div = document.createElement("div");

  div.style = `
display:flex;
align-items:center;
justify-content:space-between;
padding:8px 12px;
border:1px solid #e2e8f0;
border-radius:10px;
background:#fff;
`;

  div.innerHTML = `
<div style="display:flex; flex-direction:column; gap:2px;">
<span style="font-weight:600; font-size:13px;">
${item.Codigo || "-"} • ${item.Produto}
</span>
</div>

<div style="display:flex; align-items:center; gap:6px;">
<input 
type="number" 
placeholder="0"
style="
  width:60px;
  padding:6px;
  border-radius:6px;
  border:1px solid #cbd5e1;
  text-align:center;
  font-size:13px;
"
data-id="${item.ID}"
class="input-contagem"
>
<span style="font-size:11px; color:#64748b; min-width:28px;">
${item.Unidade || ""}
</span>
</div>
`;

  container.appendChild(div);

});

}
function gerarSemanaAtual() {

const hoje = new Date();

const ano = hoje.getFullYear();

const primeiraSemana = new Date(ano, 0, 1);
const dias = Math.floor((hoje - primeiraSemana) / (24 * 60 * 60 * 1000));

const semana = Math.ceil((dias + primeiraSemana.getDay() + 1) / 7);

return `${ano}-S${String(semana).padStart(2, "0")}`;
}

function renderContagens(lista) {

const tbody = document.getElementById("tbodyContagens");
if (!tbody) return;

tbody.innerHTML = "";

(lista || []).forEach(c => {

  const diff = Number(c.Diferenca || 0);

  // 🔥 define cor
  let cor = "#16a34a"; // verde
  if (diff !== 0) {
    cor = "#dc2626"; // vermelho
  }

  const tr = document.createElement("tr");

  tr.innerHTML = `
<td>${c.SemanaRef || "-"}</td>
<td>${c.Produto || "-"}</td>
<td>${formatarNumero(c.EstoqueSistema || 0)}</td>
<td>${formatarNumero(c.EstoqueContado || 0)}</td>
<td style="color:${cor}; font-weight:700;">
  ${formatarNumero(diff)}
</td>
<td>${c.Responsavel || "-"}</td>
`;

  // 🔥 pinta a linha inteira (opcional)
  if (diff !== 0) {
    tr.style.background = "#fff5f5";
  } else {
    tr.style.background = "#f0fdf4";
  }

  tbody.appendChild(tr);

});

}
function abrirModalAbaixoMinimo() {

const modal = document.getElementById("modalAbaixoMinimo");
const lista = document.getElementById("listaAbaixoMinimo");

lista.innerHTML = "";

(window.produtosDashboard || []).forEach(p => {

  const atual = Number(p.EstoqueAtual || 0);
  const minimo = Number(p.EstoqueMinimo || 0);

  if (atual <= minimo) {

    const tr = document.createElement("tr");

    tr.innerHTML = `
  <td>${p.Codigo || "-"}</td>
  <td>${p.Produto || "-"}</td>
  <td>${p.Categoria || "-"}</td>
  <td>${p.Setor || "-"}</td>
  <td style="color:#dc2626; font-weight:600;">
    ${formatarNumero(atual)}
  </td>
  <td>${formatarNumero(minimo)}</td>
`;

    lista.appendChild(tr);
  }
});

modal.classList.remove("hidden");
}

function fecharModalAbaixoMinimo() {
document.getElementById("modalAbaixoMinimo").classList.add("hidden");
}
// window.addEventListener("load", () => {



const selectTipo = document.getElementById("movTipo");
const card = document.getElementById("cardMovimentacao");

function atualizarCorMovimentacao() {

if (!selectTipo || !card) return;

const tipo = selectTipo.value;

card.style.border = "";
card.style.background = "";

if (tipo === "entrada") {
  card.style.background = "#ecfdf5";
  card.style.border = "1px solid #16a34a";
}

if (tipo === "saida") {
  card.style.background = "#fef2f2";
  card.style.border = "1px solid #dc2626";
}
}

function setupEventListeners() {
const selectTipo = document.getElementById("movTipo");
if (selectTipo) {
addEventListenerSafe(selectTipo, "change", atualizarCorMovimentacao);
atualizarCorMovimentacao(); // Inicializar cor
}
}

function atualizarCorMovimentacao() {
const selectTipo = document.getElementById("movTipo");
const card = document.getElementById("cardMovimentacao");

if (!selectTipo || !card) return;

const tipo = selectTipo.value;

card.style.border = "";
card.style.background = "";

if (tipo === "entrada") {
card.style.background = "#ecfdf5";
card.style.border = "1px solid #16a34a";
}

if (tipo === "saida") {
card.style.background = "#fef2f2";
card.style.border = "1px solid #dc2626";
}
}

// ... [restante das funções do código original, sem mudanças]

function formatarPeriodoSemana(semanaRef) {

if (!semanaRef) return "";

const match = semanaRef.match(/(\d{4})-S(\d+)/);
if (!match) return semanaRef;

const ano = Number(match[1]);
const semana = Number(match[2]);

const jan1 = new Date(ano, 0, 1);
const diaSemana = jan1.getDay();

const diff = (diaSemana <= 4 ? 1 - diaSemana : 8 - diaSemana);
const primeiraSegunda = new Date(ano, 0, 1 + diff);

const inicio = new Date(primeiraSegunda);
inicio.setDate(primeiraSegunda.getDate() + (semana - 1) * 7);

const fim = new Date(inicio);
fim.setDate(inicio.getDate() + 6);

const formatar = (d) => {
return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

return `${formatar(inicio)} a ${formatar(fim)}`;
}

// Definir funções globais para o moduleLoader
window.__moduleInit = initAlmoxarifado;
window.__activeModuleDestroy = cleanupAlmoxarifado;

// Exportar handlers usados pelo HTML inline
window.abrirTab = abrirTab;
window.salvarProdutoFront = salvarProdutoFront;
window.salvarMovimentacaoFront = salvarMovimentacaoFront;
window.salvarEmprestimoFront = salvarEmprestimoFront;
window.salvarContagemFront = salvarContagemFront;
window.salvarUsuarioFront = salvarUsuarioFront;
window.devolverEmprestimo = devolverEmprestimo;
window.abrirModalConfirm = abrirModalConfirm;
window.fecharModal = fecharModal;
window.carregarCodigoAutomatico = carregarCodigoAutomatico;

})();
