import { buscarTodos } from "../../../js/core/buscarTodos.mjs?v=20261008";

const supabase = window.supabaseClient;

function $(id) { return document.getElementById(id); }

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseMoedaInput(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return NaN;
  const semMilhar = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return parseFloat(semMilhar);
}

const state = { empresaId: null, tabelas: [], tabelaAtual: null, precosAlterados: new Map(), agendamento: null };

/* =====================================================
   LISTA DE TABELAS
===================================================== */

async function carregarTabelas() {
  const { data: tabelas, error } = await supabase
    .from("tabelas_preco")
    .select("id,nome,ano_referencia,vigencia_inicio,vigencia_fim,ativa")
    .eq("empresa_id", state.empresaId)
    .order("ano_referencia", { ascending: false })
    .order("nome", { ascending: true });

  if (error) {
    console.error("Erro ao carregar tabelas de preço:", error);
    window.alerta?.("Não foi possível carregar as tabelas de preço.", "Tabelas de Preço", "erro");
    return;
  }

  const { data: contagens } = await buscarTodos(() => supabase
    .from("itens_precos")
    .select("tabela_preco_id")
    .eq("empresa_id", state.empresaId)
    .order("id"));

  const contagemPorTabela = new Map();
  (contagens || []).forEach((row) => {
    contagemPorTabela.set(row.tabela_preco_id, (contagemPorTabela.get(row.tabela_preco_id) || 0) + 1);
  });

  state.tabelas = (tabelas || []).map((t) => ({ ...t, totalItens: contagemPorTabela.get(t.id) || 0 }));
  renderTabelas();
  preencherSelectBase();
}

function formatarVigencia(t) {
  if (!t.vigencia_inicio && !t.vigencia_fim) return "-";
  // Monta a data a partir das partes (YYYY-MM-DD) em vez de `new Date(d)`,
  // que interpretaria a data como meia-noite UTC e poderia exibir o dia
  // anterior dependendo do fuso horário de quem está vendo a tela.
  const fmt = (d) => { if (!d) return "?"; const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; };
  return `${fmt(t.vigencia_inicio)} a ${fmt(t.vigencia_fim)}`;
}

function renderTabelas() {
  const corpo = $("tabelasBody");
  if (!state.tabelas.length) {
    corpo.innerHTML = '<tr><td colspan="6">Nenhuma tabela de preço cadastrada ainda.</td></tr>';
    return;
  }
  corpo.innerHTML = state.tabelas.map((t) => `
    <tr>
      <td>${escapeHtml(t.nome)}</td>
      <td>${t.ano_referencia}</td>
      <td>${formatarVigencia(t)}</td>
      <td>${t.totalItens}</td>
      <td>${t.ativa ? '<span class="tp-badge tp-badge-ativa">Ativa</span>' : '<span class="tp-badge">Inativa</span>'}</td>
      <td class="tp-acoes">
        <button type="button" class="btn secondary btn-sm" data-abrir="${t.id}">Ver / editar preços</button>
        <button type="button" class="btn ${t.ativa ? "secondary" : "primary"} btn-sm" data-toggle-ativa="${t.id}">${t.ativa ? "Inativar" : "Ativar"}</button>
      </td>
    </tr>
  `).join("");

  corpo.querySelectorAll("[data-abrir]").forEach((btn) => btn.addEventListener("click", () => abrirDetalheTabela(btn.dataset.abrir)));
  corpo.querySelectorAll("[data-toggle-ativa]").forEach((btn) => btn.addEventListener("click", () => alternarAtiva(btn.dataset.toggleAtiva)));
}

async function alternarAtiva(tabelaId) {
  const tabela = state.tabelas.find((t) => t.id === tabelaId);
  if (!tabela) return;

  const novoStatus = !tabela.ativa;
  const mensagem = novoStatus
    ? `Ativar "${tabela.nome}"? O preço de locação de cada item com preço nessa tabela será atualizado imediatamente para todo o sistema (pedidos, kits, etc. passam a usar esse valor).`
    : `Inativar "${tabela.nome}"? Os preços já aplicados nos itens continuam como estão até outra tabela ser ativada.`;

  const confirmado = await window.confirmarGlobal?.(mensagem, "Tabelas de Preço");
  if (!confirmado) return;

  const { error } = await supabase.from("tabelas_preco").update({ ativa: novoStatus }).eq("id", tabelaId);
  if (error) {
    window.alerta?.("Não foi possível atualizar a tabela.", "Tabelas de Preço", "erro");
    return;
  }
  window.alerta?.(`Tabela "${tabela.nome}" ${novoStatus ? "ativada" : "inativada"}.`, "Tabelas de Preço", "sucesso");
  await carregarTabelas();
}

/* =====================================================
   DETALHE / EDIÇÃO DE PREÇOS
===================================================== */

async function abrirDetalheTabela(tabelaId) {
  const tabela = state.tabelas.find((t) => t.id === tabelaId);
  if (!tabela) return;

  state.tabelaAtual = tabela;
  state.precosAlterados.clear();
  $("tabelaDetalheTitulo").textContent = `${tabela.nome} (${tabela.ano_referencia})`;

  const [{ data: itens, error: erroItens }, { data: precos, error: erroPrecos }] = await Promise.all([
    buscarTodos(() => supabase.from("itens").select("id,codigo,produto,categoria").eq("empresa_id", state.empresaId).order("produto").order("id")),
    buscarTodos(() => supabase.from("itens_precos").select("item_id,valor_locacao").eq("empresa_id", state.empresaId).eq("tabela_preco_id", tabelaId).order("item_id")),
  ]);

  if (erroItens || erroPrecos) {
    console.error(erroItens || erroPrecos);
    window.alerta?.("Não foi possível carregar os itens/preços dessa tabela.", "Tabelas de Preço", "erro");
    return;
  }

  const precoPorItem = new Map((precos || []).map((p) => [p.item_id, p.valor_locacao]));
  state.itensParaTabela = (itens || []).map((i) => ({ ...i, valor: precoPorItem.get(i.id) ?? null }));

  renderItensTabela();
  document.querySelector(".container").classList.add("hidden");
  $("tabelaDetalheView").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "instant" });
}

function renderItensTabela(filtro = "") {
  const termo = filtro.trim().toLowerCase();
  const corpo = $("tabelaItensBody");
  const linhas = state.itensParaTabela.filter((i) =>
    !termo || i.produto?.toLowerCase().includes(termo) || i.codigo?.toLowerCase().includes(termo)
  );

  if (!linhas.length) {
    corpo.innerHTML = '<tr><td colspan="4">Nenhum item encontrado.</td></tr>';
    return;
  }

  corpo.innerHTML = linhas.map((i) => `
    <tr>
      <td>${escapeHtml(i.codigo)}</td>
      <td>${escapeHtml(i.produto)}</td>
      <td>${escapeHtml(i.categoria || "-")}</td>
      <td><input class="el-input tp-preco-input" data-item-id="${i.id}" value="${i.valor != null ? Number(i.valor).toFixed(2) : ""}" placeholder="Sem preço"></td>
    </tr>
  `).join("");

  corpo.querySelectorAll(".tp-preco-input").forEach((input) => {
    input.addEventListener("input", () => {
      const valor = parseMoedaInput(input.value);
      if (input.value.trim() === "") { state.precosAlterados.delete(input.dataset.itemId); return; }
      if (Number.isFinite(valor) && valor >= 0) state.precosAlterados.set(input.dataset.itemId, valor);
    });
  });
}

async function salvarPrecosAlterados() {
  if (!state.tabelaAtual) return;
  if (!state.precosAlterados.size) {
    window.alerta?.("Nenhum preço foi alterado.", "Tabelas de Preço", "info");
    return;
  }

  const linhas = [...state.precosAlterados.entries()].map(([itemId, valor]) => ({
    empresa_id: state.empresaId,
    tabela_preco_id: state.tabelaAtual.id,
    item_id: itemId,
    valor_locacao: valor,
  }));

  const { error } = await supabase.from("itens_precos").upsert(linhas, { onConflict: "tabela_preco_id,item_id" });
  if (error) {
    console.error(error);
    window.alerta?.("Não foi possível salvar os preços.", "Tabelas de Preço", "erro");
    return;
  }

  window.alerta?.(`${linhas.length} preço(s) salvo(s).`, "Tabelas de Preço", "sucesso");
  state.precosAlterados.clear();
  await abrirDetalheTabela(state.tabelaAtual.id);
}

async function aplicarReajuste() {
  const percentualRaw = $("tabelaReajustePercentual").value.trim();
  const percentual = parseMoedaInput(percentualRaw);
  if (!Number.isFinite(percentual)) {
    window.alerta?.("Informe um percentual válido (ex.: 10 para +10%, -5 para -5%).", "Tabelas de Preço", "aviso");
    return;
  }

  const confirmado = await window.confirmarGlobal?.(`Aplicar ${percentual > 0 ? "+" : ""}${percentual}% em todos os preços já definidos nesta tabela? Isso não afeta itens sem preço definido.`, "Reajuste geral");
  if (!confirmado) return;

  const fator = 1 + (percentual / 100);
  document.querySelectorAll(".tp-preco-input").forEach((input) => {
    const atual = parseMoedaInput(input.value);
    if (!Number.isFinite(atual)) return;
    const novo = Math.max(0, Number((atual * fator).toFixed(2)));
    input.value = novo.toFixed(2);
    state.precosAlterados.set(input.dataset.itemId, novo);
  });

  window.alerta?.("Reajuste aplicado na tela — clique em \"Salvar preços alterados\" para confirmar.", "Tabelas de Preço", "info");
}

window.tp_fecharDetalhe = function () {
  $("tabelaDetalheView").classList.add("hidden");
  document.querySelector(".container").classList.remove("hidden");
  state.tabelaAtual = null;
  state.precosAlterados.clear();
};

/* =====================================================
   NOVA TABELA
===================================================== */

function preencherSelectBase() {
  const select = $("novaTabelaBase");
  select.innerHTML = '<option value="">Começar em branco</option>' +
    state.tabelas.map((t) => `<option value="${t.id}">${escapeHtml(t.nome)} (${t.ano_referencia})</option>`).join("");
}

window.tp_fecharModalNovaTabela = function () {
  $("novaTabelaModal").style.display = "none";
  $("novaTabelaNome").value = "";
  $("novaTabelaAno").value = "";
  $("novaTabelaVigenciaInicio").value = "";
  $("novaTabelaVigenciaFim").value = "";
  $("novaTabelaObservacoes").value = "";
  $("novaTabelaBase").value = "";
};

async function criarTabela() {
  const nome = $("novaTabelaNome").value.trim();
  const ano = parseInt($("novaTabelaAno").value.trim(), 10);
  const vigenciaInicio = $("novaTabelaVigenciaInicio").value || null;
  const vigenciaFim = $("novaTabelaVigenciaFim").value || null;
  const observacoes = $("novaTabelaObservacoes").value.trim() || null;
  const baseId = $("novaTabelaBase").value || null;

  if (!nome) { window.alerta?.("Informe o nome da tabela.", "Tabelas de Preço", "aviso"); return; }
  if (!Number.isFinite(ano)) { window.alerta?.("Informe o ano de referência.", "Tabelas de Preço", "aviso"); return; }

  const { data: nova, error } = await supabase
    .from("tabelas_preco")
    .insert({ empresa_id: state.empresaId, nome, ano_referencia: ano, vigencia_inicio: vigenciaInicio, vigencia_fim: vigenciaFim, observacoes, ativa: false })
    .select("id")
    .single();

  if (error) {
    console.error(error);
    window.alerta?.(`Não foi possível criar a tabela: ${error.message}`, "Tabelas de Preço", "erro");
    return;
  }

  if (baseId) {
    const { data: precosBase } = await buscarTodos(() => supabase.from("itens_precos").select("item_id,valor_locacao").eq("empresa_id", state.empresaId).eq("tabela_preco_id", baseId).order("item_id"));
    if (precosBase?.length) {
      const copia = precosBase.map((p) => ({ empresa_id: state.empresaId, tabela_preco_id: nova.id, item_id: p.item_id, valor_locacao: p.valor_locacao }));
      await supabase.from("itens_precos").insert(copia);
    }
  }

  window.tp_fecharModalNovaTabela();
  window.alerta?.(`Tabela "${nome}" criada${baseId ? " com os preços copiados" : ""}.`, "Tabelas de Preço", "sucesso");
  await carregarTabelas();
}

/* =====================================================
   REAJUSTE AUTOMÁTICO ANUAL
   Uma linha por empresa em tabelas_preco_agendamento. Quem cria a tabela
   é a rotina do banco (pg_cron, todo dia às 6h de Brasília) — ver
   supabase/migrations/20261008000200_tabelas_preco_reajuste_anual.sql.
===================================================== */

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function fmtPercent(p) {
  return Number(p).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
}

// Próxima data em que a rotina vai agir (dia 31 em mês curto cai no último dia).
function proximaExecucao(ag) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dataDoAno = (ano) => {
    const ultimo = new Date(ano, ag.mes, 0).getDate();
    return new Date(ano, ag.mes - 1, Math.min(ag.dia, ultimo));
  };
  let ano = hoje.getFullYear();
  if (dataDoAno(ano) < hoje || (ag.ultima_execucao_ano || 0) >= ano) ano += 1;
  const data = dataDoAno(ano);
  return { data, anoTabela: ano + (ag.ano_seguinte ? 1 : 0) };
}

function renderReajuste() {
  const ag = state.agendamento;
  const resumo = $("tpAutoResumo"), status = $("tpAutoStatus"), ultimo = $("tpAutoUltimo"), btn = $("btnProgramarReajuste");
  if (!ag) {
    resumo.textContent = "Não programado. Defina um percentual e uma data para o sistema criar a tabela do ano sozinho.";
    status.textContent = "Desligado"; status.className = "tp-badge";
    btn.textContent = "Programar";
    ultimo.hidden = true;
    return;
  }
  const prox = proximaExecucao(ag);
  const data = prox.data.toLocaleDateString("pt-BR");
  resumo.textContent = ag.ativo
    ? `${fmtPercent(ag.percentual)} todo dia ${ag.dia} de ${MESES[ag.mes - 1]}. Próxima: TABELA ${prox.anoTabela} em ${data}, ${ag.ativar_automaticamente ? "já ativada" : "criada inativa"}.`
    : `Pausado (${fmtPercent(ag.percentual)} todo dia ${ag.dia} de ${MESES[ag.mes - 1]}). Nenhuma tabela será criada enquanto estiver desligado.`;
  status.textContent = ag.ativo ? "Ligado" : "Desligado";
  status.className = "tp-badge" + (ag.ativo ? " tp-badge-ativa" : "");
  btn.textContent = "Editar";
  ultimo.hidden = !ag.ultimo_resultado;
  if (ag.ultimo_resultado) {
    const quando = ag.ultima_execucao_em ? new Date(ag.ultima_execucao_em).toLocaleDateString("pt-BR") : "";
    ultimo.textContent = `Última execução${quando ? " (" + quando + ")" : ""}: ${ag.ultimo_resultado}`;
  }
}

async function carregarReajuste() {
  const { data, error } = await supabase.from("tabelas_preco_agendamento").select("*").eq("empresa_id", state.empresaId).maybeSingle();
  if (error) { console.error(error); $("tpAutoResumo").textContent = "Não foi possível carregar o reajuste automático."; return; }
  state.agendamento = data || null;
  renderReajuste();
}

function lerFormReajuste() {
  const percentual = parseMoedaInput($("reajustePercentual").value);
  const dia = parseInt($("reajusteDia").value, 10);
  const mes = parseInt($("reajusteMes").value, 10);
  return {
    ativo: $("reajusteAtivo").checked,
    percentual, dia, mes,
    ano_seguinte: $("reajusteAnoSeguinte").value === "true",
    ativar_automaticamente: $("reajusteAtivar").checked,
  };
}

function atualizarPreviaReajuste() {
  const f = lerFormReajuste();
  const el = $("reajustePrevia");
  if (!Number.isFinite(f.percentual) || !(f.dia >= 1 && f.dia <= 31)) { el.textContent = ""; return; }
  const prox = proximaExecucao({ ...f, ultima_execucao_ano: state.agendamento?.ultima_execucao_ano });
  const exemplo = 100 * (1 + f.percentual / 100);
  el.textContent = `Próxima: TABELA ${prox.anoTabela} em ${prox.data.toLocaleDateString("pt-BR")}. Exemplo: um item de ${money(100)} passa a ${money(exemplo)}.`;
}

function abrirReajuste() {
  const ag = state.agendamento;
  $("reajusteAtivo").checked = ag ? ag.ativo : true;
  $("reajustePercentual").value = ag ? String(ag.percentual).replace(".", ",") : "";
  $("reajusteDia").value = ag ? ag.dia : 1;
  $("reajusteMes").value = ag ? String(ag.mes) : "1";
  $("reajusteAnoSeguinte").value = ag?.ano_seguinte ? "true" : "false";
  $("reajusteAtivar").checked = ag ? ag.ativar_automaticamente : false;
  atualizarPreviaReajuste();
  $("reajusteModal").style.display = "flex";
  $("reajustePercentual").focus();
}

function fecharReajuste() { $("reajusteModal").style.display = "none"; }

async function salvarReajuste() {
  const f = lerFormReajuste();
  if (!Number.isFinite(f.percentual) || f.percentual < -90 || f.percentual > 500) {
    window.alerta?.("Informe o reajuste em % (entre -90 e 500).", "Reajuste automático", "aviso"); return;
  }
  if (!(f.dia >= 1 && f.dia <= 31)) { window.alerta?.("Informe um dia entre 1 e 31.", "Reajuste automático", "aviso"); return; }
  f.percentual = Math.round(f.percentual * 100) / 100;

  const btn = $("btnSalvarReajuste");
  btn.disabled = true;
  const { error } = await supabase.from("tabelas_preco_agendamento").upsert({ empresa_id: state.empresaId, ...f }, { onConflict: "empresa_id" });
  btn.disabled = false;
  if (error) {
    console.error(error);
    window.alerta?.(`Não foi possível salvar: ${error.message}`, "Reajuste automático", "erro");
    return;
  }
  fecharReajuste();
  await carregarReajuste();
  window.alerta?.(f.ativo ? "Reajuste automático programado." : "Reajuste automático desligado.", "Reajuste automático", "sucesso");
}

/* =====================================================
   INIT
===================================================== */

async function init() {
  // Voltar: a tela é aberta pela Central de Pedidos, então volta pra ela.
  // Dentro do dashboard vai pelo shell (registra no histórico); aberta sozinha, navega direto.
  $("btnVoltarTabelas")?.addEventListener("click", () => {
    try { if (window.parent !== window && window.parent.shellNavigate) { window.parent.shellNavigate("Modulos/Comercial/Pedidos/CentralPedidos.html"); return; } } catch (e) {}
    location.href = "../../Comercial/Pedidos/CentralPedidos.html";
  });

  window.lucide?.createIcons?.();

  const contexto = await window.aguardarContexto?.();
  state.empresaId = contexto?.empresa_id;
  if (!state.empresaId) return;

  await Promise.all([carregarTabelas(), carregarReajuste()]);

  $("btnProgramarReajuste").addEventListener("click", abrirReajuste);
  $("btnCancelarReajuste").addEventListener("click", fecharReajuste);
  $("btnSalvarReajuste").addEventListener("click", salvarReajuste);
  ["reajustePercentual", "reajusteDia", "reajusteMes", "reajusteAnoSeguinte"].forEach((id) => {
    $(id).addEventListener("input", atualizarPreviaReajuste);
    $(id).addEventListener("change", atualizarPreviaReajuste);
  });

  $("btnNovaTabela").addEventListener("click", () => { $("novaTabelaModal").style.display = "flex"; });
  $("btnCriarTabela").addEventListener("click", criarTabela);
  $("btnSalvarPrecosTabela").addEventListener("click", salvarPrecosAlterados);
  $("btnAplicarReajuste").addEventListener("click", aplicarReajuste);
  $("tabelaDetalheBusca").addEventListener("input", (e) => renderItensTabela(e.target.value));

  window.lucide?.createIcons?.();
}

init();
