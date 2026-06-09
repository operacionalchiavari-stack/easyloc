console.log("✅ pedido.mjs carregado");

import { getEls, bindDiasSemana } from "./pedido.utils.mjs";
import { initAutocompleteClientes } from "./pedido.clientes.mjs";
import { initAutocompleteLocaisEKm } from "./pedido.locais-km.mjs";
import { initItens } from "./pedido.itens.mjs";
import { initFrete } from "./pedido.frete.mjs";
import { initServicos } from "./pedido.servicos.mjs";
import { carregarLogoEmpresa, imprimirPedido, abrirModalAvisoFrete } from "./pedido.misc.mjs";
import { initPagamento } from "./pedido.pagamento.mjs";

export async function initPedido(){

  console.log("✅ initPedido executou");

  /* =====================================================
     SPA GUARD (EASYLOC SPA SAFE)
  ===================================================== */
  if (window.__pedidoModuleLoaded) {
    console.log("⚠️ Pedido já inicializado");
    return;
  }
  window.__pedidoModuleLoaded = true;

  /* =====================================================
     CONTEXTO
  ===================================================== */
  const supabase = window.supabaseClient;

  /* =====================================================
     CARREGAR CONFIGURAÇÃO FINANCEIRA (ABSORÇÃO FRETE/MONTAGEM)
  ===================================================== */
  async function carregarFinanceiro(){

    const empresaId = window.__CONTEXT?.empresa_id;

    if(!empresaId){
      window.__ABS_FRETE_PERCENT = 0;
      window.__ABS_MONTAGEM_PERCENT = 0;
      return;
    }

    window.__FINANCEIRO_CACHE = window.__FINANCEIRO_CACHE || {};

    if(window.__FINANCEIRO_CACHE[empresaId]){
      window.__ABS_FRETE_PERCENT = window.__FINANCEIRO_CACHE[empresaId].frete;
      window.__ABS_MONTAGEM_PERCENT = window.__FINANCEIRO_CACHE[empresaId].montagem;
      return;
    }

    const { data, error } = await supabase
      .from("empresa_financeiro")
      .select("absorcao_frete_percent, absorcao_montagem_percent")
      .eq("empresa_id", empresaId)
      .single();

    if(error){
      console.error("❌ Erro ao buscar empresa_financeiro:", error);
      window.__ABS_FRETE_PERCENT = 0;
      window.__ABS_MONTAGEM_PERCENT = 0;
      return;
    }

    const frete = Number(data?.absorcao_frete_percent || 0);
    const montagem = Number(data?.absorcao_montagem_percent || 0);

    window.__FINANCEIRO_CACHE[empresaId] = {
      frete,
      montagem
    };

    window.__ABS_FRETE_PERCENT = frete;
    window.__ABS_MONTAGEM_PERCENT = montagem;

    console.log("💰 Financeiro carregado:", {
      frete: window.__ABS_FRETE_PERCENT,
      montagem: window.__ABS_MONTAGEM_PERCENT
    });
  }

  await carregarFinanceiro();

  const els = getEls();

  if (!els.tbody || !els.addItemBtn) {
    console.warn("⚠️ Pedido: elementos ainda não estão no DOM.");
    return;
  }

  /* =====================================================
     EXPÕE FUNÇÕES GLOBAIS QUE O HTML PODE CHAMAR
  ===================================================== */
  window.imprimirPedido = imprimirPedido;
  window.abrirModalAvisoFrete = abrirModalAvisoFrete;

  /* =====================================================
     DIAS DA SEMANA
  ===================================================== */
  bindDiasSemana(els);

  /* =====================================================
     FRETE + MONTAGEM (cria window.renderizarFreteCard e window.calcularFreteInteligente)
  ===================================================== */
  initFrete({ supabase });

  /* =====================================================
     AUTOCOMPLETE CLIENTES
  ===================================================== */
  initAutocompleteClientes({
    supabase,
    clienteInput: els.clienteInput,
    clienteLista: els.clienteLista,
    clienteIdHidden: els.clienteIdHidden,
    telefoneInput: els.telefoneInput,
    responsavelInput: els.responsavelInput,
  });

  /* =====================================================
     AUTOCOMPLETE LOCAIS + KM (ao selecionar local, calcula KM e dispara frete)
  ===================================================== */
  initAutocompleteLocaisEKm({
    supabase,
    localInput: els.localInput,
    localLista: els.localLista,
    localIdHidden: els.localIdHidden,
    obsDiv: els.localObservacoes,
  });

  /* =====================================================
     ITENS (tabela, espaços, componentes, volume, resumo)
  ===================================================== */
initItens({ supabase, els });

/* =====================================================
   SERVIÇOS
===================================================== */
initServicos({ supabase, els });

/* =====================================================
   PAGAMENTO 🔥
===================================================== */
initPagamento();
setupPedidoWorkspace({ supabase });

/* =====================================================
   PRÉ RESERVA
===================================================== */

const btnPreReserva = document.getElementById("btnPreReserva");
const preReservaBox = document.getElementById("preReservaBox");
const preReservaData = document.getElementById("preReservaData");
const alertaReserva = document.getElementById("alertaReserva");
const btnCancelarPreReserva = document.getElementById("btnCancelarPreReserva");
const cancelarWrapper = document.getElementById("cancelarPreReservaWrapper");

/* GARANTE QUE O BOTÃO CANCELAR COMEÇA ESCONDIDO */

cancelarWrapper?.classList.add("hidden");

/* MOSTRAR CAMPO DATA */

btnPreReserva?.addEventListener("click", () => {

  if(!preReservaBox) return;

  preReservaBox.classList.remove("hidden");

});

/* DEFINIR DATA DA PRÉ RESERVA */

preReservaData?.addEventListener("change", () => {

  const data = preReservaData.value;

  if(!data) return;

  window.preReservaData = data;

  /* FORMATAR DATA */

  const partes = data.split("-");
  const dataFormatada =
    partes[2] + "/" + partes[1] + "/" + partes[0];

  if(alertaReserva){

    alertaReserva.innerText =
      `Pré-reserva válida até ${dataFormatada}`;

    alertaReserva.classList.add("pre-reserva-ativa");

  }

  /* MOSTRAR BOTÃO CANCELAR */

  cancelarWrapper?.classList.remove("hidden");

  console.log("📦 Pré-reserva definida até:", data);

});

/* CANCELAR PRÉ RESERVA */

btnCancelarPreReserva?.addEventListener("click", () => {

  window.preReservaData = null;

  if(alertaReserva){

    alertaReserva.innerText =
      "Este orçamento não gera reserva de material";

    alertaReserva.classList.remove("pre-reserva-ativa");

  }

  if(preReservaBox){
    preReservaBox.classList.add("hidden");
  }

  if(preReservaData){
    preReservaData.value = "";
  }

  cancelarWrapper?.classList.add("hidden");

  console.log("❌ Pré-reserva cancelada");

});

/* DEFINIR DATA */

preReservaData?.addEventListener("change", () => {

  const data = preReservaData.value;

  if(!data) return;

  window.preReservaData = data;

  /* FORMATAR DATA */

  const partes = data.split("-");
  const dataFormatada =
    partes[2] + "/" + partes[1] + "/" + partes[0];

  if(alertaReserva){

    alertaReserva.innerText =
      `Pré-reserva válida até ${dataFormatada}`;

    alertaReserva.classList.add("pre-reserva-ativa");

  }

cancelarWrapper?.classList.remove("hidden");

  console.log("📦 Pré-reserva definida até:", data);

});

/* CANCELAR PRÉ RESERVA */

btnCancelarPreReserva?.addEventListener("click", () => {

  window.preReservaData = null;

  if(alertaReserva){

    alertaReserva.innerText =
      "Este orçamento não gera reserva de material";

    alertaReserva.classList.remove("pre-reserva-ativa");

  }

  if(preReservaBox){
    preReservaBox.classList.add("hidden");
  }

  if(preReservaData){
    preReservaData.value = "";
  }

cancelarWrapper?.classList.add("hidden");

  console.log("❌ Pré-reserva cancelada");

});
  /* =====================================================
     INICIAR (logo + loader)
  ===================================================== */
  carregarLogoEmpresa();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.finalizarCarregamentoModulo?.();
    });
  });

}

/* =====================================================
   DESTROY DO MÓDULO PEDIDO (SPA SAFE)
===================================================== */
export function destroyPedido(){

  console.log("🧹 destroy Pedido");

  window.__pedidoModuleLoaded = false;
  window.__pedidoWorkspaceObserver?.disconnect?.();
  delete window.__pedidoWorkspaceObserver;
  window.__pedidoOrderObserver?.disconnect?.();
  delete window.__pedidoOrderObserver;

  document
    .querySelectorAll(".autocomplete-list")
    .forEach(el => el.remove());

  document
    .querySelectorAll(".item-autocomplete-list")
    .forEach(el => { el.innerHTML = ""; el.style.display = "none"; });

  const root = document.getElementById("modal-root");
  if (root) root.innerHTML = "";
}

/* =====================================================
   COMPAT: EasyLoc loader pode chamar window.__moduleInit
===================================================== */
window.initPedido = initPedido;
window.__activeModuleDestroy = destroyPedido;
window.__moduleInit = initPedido;

function setupPedidoWorkspace({ supabase }){
  const avisar = (mensagem, titulo = "Pedido", tipo = "info") => {
    if(typeof window.alerta === "function"){
      window.alerta(mensagem, titulo, tipo);
      return;
    }
    alert(mensagem);
  };

  const abrirCentral = () => {
    if(typeof window.carregarNaMain === "function"){
      window.carregarNaMain(
        "Modulos/Comercial/Pedidos/CentralPedidos.html",
        "Modulos/Comercial/Pedidos/CentralPedidos.js",
        null,
        "Modulos/Comercial/Pedidos/CentralPedidos.css"
      );
      return;
    }
    window.location.href = "CentralPedidos.html";
  };

  document.getElementById("btnVoltarCentralPedidos")?.addEventListener("click", abrirCentral);

  document.getElementById("btnSalvarPedido")?.addEventListener("click", () => {
    avisar("A tela foi preparada para salvar o pedido quando a persistencia estiver conectada.", "Salvar pedido", "info");
  });

  document.getElementById("btnDuplicarPedido")?.addEventListener("click", () => {
    avisar("Duplicacao preparada para reaproveitar os dados do pedido atual.", "Duplicar pedido", "info");
  });

  document.getElementById("btnHistoricoPedido")?.addEventListener("click", () => {
    avisar("Historico operacional sera exibido aqui quando houver registros do pedido.", "Historico", "info");
  });

  document.getElementById("btnAddDropItem")?.addEventListener("click", () => {
    document.getElementById("addItemBtn")?.click();
  });

  const converterContrato = () => {
    document.querySelector(".contrato")?.scrollIntoView({ behavior: "smooth", block: "start" });
    avisar("Contrato exibido para revisao.", "Contrato", "sucesso");
  };

  document.getElementById("btnConverterContrato")?.addEventListener("click", converterContrato);

  setupMaisOpcoes({ converterContrato });
  setupCardsOperacionais();

  const clienteInput = document.getElementById("clienteInput");
  const tipoEventoSelect = document.getElementById("tipoEventoSelect");
  const tituloEvento = document.getElementById("pedidoEventoTitulo");
  const comercialInput = document.getElementById("comercialResponsavelInput");
  const dataCriacao = document.getElementById("pedidoDataCriacao");

  if(dataCriacao){
    dataCriacao.textContent = new Date().toLocaleDateString("pt-BR");
  }

  if(comercialInput && !comercialInput.value){
    comercialInput.value = window.__CONTEXT?.usuario_nome || "";
  }

  function atualizarTituloEvento(){
    if(!tituloEvento) return;
    const cliente = (clienteInput?.value || "").trim();
    const evento = tipoEventoSelect?.selectedOptions?.[0]?.textContent?.trim();
    tituloEvento.textContent = [evento && evento !== "Selecione" ? evento : "Evento", cliente].filter(Boolean).join(" - ");
  }

  clienteInput?.addEventListener("input", atualizarTituloEvento);
  tipoEventoSelect?.addEventListener("change", atualizarTituloEvento);
  atualizarTituloEvento();

  setupTimelinePedido({ avisar });

  setupComunicacoes();
  setupOndeEsta({ supabase });
  enhanceItemActions();
  setupOrdenacaoPedido();
}

function setupTimelinePedido({ avisar }){
  const statusEl = document.getElementById("pedidoStatus");
  const modalCancelamento = document.getElementById("modalCancelarOrcamento");
  const motivoInput = document.getElementById("motivoCancelamentoPedido");
  const motivoCards = document.querySelectorAll(".cancelamento-motivo-card");
  let motivoSelecionado = "";
  const fecharCancelamento = () => modalCancelamento?.classList.add("hidden");
  const statusLabels = {
    orcamento: "Orcamento",
    pre_reserva: "Pre reserva",
    aprovado: "Aprovado",
    cancelado: "Cancelado"
  };
  const statusEditaveis = new Set(["orcamento", "pre_reserva", "aprovado"]);

  function aplicarStatus(status){
    document.querySelectorAll(".timeline-step").forEach((step) => {
      step.classList.toggle("active", step.dataset.status === status);
    });

    if(statusEl) statusEl.textContent = statusLabels[status] || status;
    window.__PEDIDO_STATUS_ATUAL = status;
  }

  document.querySelectorAll(".timeline-step").forEach((button) => {
    button.addEventListener("click", () => {
      const status = button.dataset.status || "";

      if(status === "cancelado"){
        if(motivoInput) motivoInput.value = "";
        motivoSelecionado = "";
        motivoCards.forEach((card) => card.classList.remove("active"));
        modalCancelamento?.classList.remove("hidden");
        return;
      }

      if(!statusEditaveis.has(status)){
        avisar("Esta etapa sera atualizada automaticamente pelo operacional.", "Etapa bloqueada", "info");
        return;
      }

      aplicarStatus(status);
    });
  });

  document.getElementById("btnFecharCancelarOrcamento")?.addEventListener("click", fecharCancelamento);
  document.getElementById("btnCancelarCancelamento")?.addEventListener("click", fecharCancelamento);
  modalCancelamento?.addEventListener("click", (event) => {
    if(event.target === modalCancelamento) fecharCancelamento();
  });

  motivoCards.forEach((card) => {
    card.addEventListener("click", () => {
      motivoSelecionado = card.dataset.motivo || "";
      motivoCards.forEach((item) => item.classList.remove("active"));
      card.classList.add("active");
      motivoInput?.focus?.();
    });
  });

  document.getElementById("btnConfirmarCancelamentoPedido")?.addEventListener("click", () => {
    const observacao = (motivoInput?.value || "").trim();

    if(!motivoSelecionado){
      avisar("Selecione um motivo do cancelamento para continuar.", "Motivo obrigatorio", "aviso");
      return;
    }

    const payloadCancelamento = {
      motivo: motivoSelecionado,
      observacao,
      data: new Date().toISOString()
    };

    window.__PEDIDO_CANCELAMENTO_MOTIVO = motivoSelecionado;
    window.__PEDIDO_CANCELAMENTO_OBSERVACAO = observacao;
    window.__PEDIDO_CANCELAMENTO = payloadCancelamento;
    try{
      localStorage.setItem("easyloc:pedido:cancelamento", JSON.stringify(payloadCancelamento));
      localStorage.setItem("easyloc:pedido:motivo-cancelamento", motivoSelecionado);
    }catch{}

    aplicarStatus("cancelado");
    fecharCancelamento();
    avisar("Orcamento cancelado com motivo registrado.", "Cancelamento", "sucesso");
  });
}

function setupMaisOpcoes({ converterContrato }){
  const modal = document.getElementById("modalMaisOpcoesPedido");
  const openBtn = document.getElementById("btnMaisOpcoesPedido");
  const closeBtn = document.getElementById("btnFecharMaisOpcoes");

  openBtn?.addEventListener("click", () => modal?.classList.remove("hidden"));
  closeBtn?.addEventListener("click", () => modal?.classList.add("hidden"));
  modal?.addEventListener("click", (event) => {
    if(event.target === modal) modal.classList.add("hidden");
  });

  document.getElementById("btnMaisOpcoesComunicacoes")?.addEventListener("click", () => {
    modal?.classList.add("hidden");
    document.getElementById("modalComunicacoesPedido")?.classList.remove("hidden");
  });

  document.getElementById("btnMaisOpcoesContrato")?.addEventListener("click", () => {
    modal?.classList.add("hidden");
    converterContrato();
  });

  document.getElementById("btnMaisOpcoesEnviar")?.addEventListener("click", () => {
    modal?.classList.add("hidden");
    if(typeof window.alerta === "function"){
      window.alerta("Envio preparado para conectar e-mail ou WhatsApp ao pedido atual.", "Enviar pedido", "info");
      return;
    }
    alert("Envio preparado para conectar e-mail ou WhatsApp ao pedido atual.");
  });
}

function setupCardsOperacionais(){
  document.querySelectorAll(".btn-editar-operacional").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.target || "");
      target?.focus?.();
    });
  });
}

function setupComunicacoes(){
  const modal = document.getElementById("modalComunicacoesPedido");
  const closeBtn = document.getElementById("btnFecharComunicacoes");
  const storageKey = "easyloc:pedido:comunicacoes";
  const map = {
    entrega: document.getElementById("comEntrega"),
    separacao: document.getElementById("comSeparacao"),
    coleta: document.getElementById("comColeta"),
    financeiro: document.getElementById("comFinanceiro")
  };

  try{
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    Object.entries(map).forEach(([key, el]) => {
      if(el) el.value = saved[key] || "";
    });
  }catch{
    // localStorage indisponivel: comunicacoes seguem editaveis na sessao.
  }

  const persistir = () => {
    const payload = {};
    Object.entries(map).forEach(([key, el]) => {
      payload[key] = el?.value || "";
    });
    try{ localStorage.setItem(storageKey, JSON.stringify(payload)); }catch{}
  };

  Object.values(map).forEach((el) => el?.addEventListener("input", persistir));

  closeBtn?.addEventListener("click", () => modal?.classList.add("hidden"));
  modal?.addEventListener("click", (event) => {
    if(event.target === modal) modal.classList.add("hidden");
  });

  document.querySelectorAll(".comunicacoes-tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.comTab;
      document.querySelectorAll(".comunicacoes-tabs button").forEach((btn) => btn.classList.remove("active"));
      document.querySelectorAll(".comunicacao-text").forEach((text) => text.classList.remove("active"));
      button.classList.add("active");
      map[tab]?.classList.add("active");
    });
  });
}

function enhanceItemActions(){
  const tbody = document.getElementById("listaItens");
  if(!tbody) return;

  const apply = () => {
    tbody.querySelectorAll("tr.item-row .acoes-linha").forEach((actions) => {
      if(actions.querySelector(".btn-onde-esta")) return;

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "btn-editar-item";
      edit.title = "Editar";
      edit.textContent = "E";

      const onde = document.createElement("button");
      onde.type = "button";
      onde.className = "btn-onde-esta";
      onde.title = "Onde esta";
      onde.textContent = "O";

      const remover = actions.querySelector(".btn-remover-item");
      actions.insertBefore(edit, remover || null);
      actions.insertBefore(onde, remover || null);
    });
  };

  apply();

  const observer = new MutationObserver(apply);
  observer.observe(tbody, { childList: true, subtree: true });
  window.__pedidoWorkspaceObserver = observer;

  tbody.addEventListener("click", (event) => {
    const edit = event.target.closest(".btn-editar-item");
    if(!edit) return;

    const row = edit.closest("tr.item-row");
    const field = row?.querySelector(".nome-item");
    field?.focus?.();
  });
}

function setupOndeEsta({ supabase }){
  const panel = document.getElementById("ondeEstaPanel");
  const closeBtn = document.getElementById("btnFecharOndeEsta");
  const titulo = document.getElementById("ondeEstaTitulo");
  const disponivel = document.getElementById("ondeQtdDisponivel");
  const reservada = document.getElementById("ondeQtdReservada");
  const conflitos = document.getElementById("ondeConflitos");
  const lista = document.getElementById("ondePedidosLista");

  closeBtn?.addEventListener("click", () => panel?.classList.remove("open"));

  document.getElementById("listaItens")?.addEventListener("click", async (event) => {
    const btn = event.target.closest(".btn-onde-esta");
    if(!btn) return;

    const row = btn.closest("tr.item-row");
    const nome = row?.querySelector(".nome-item")?.innerText?.trim() || "Item";
    const itemId = row?.dataset?.itemId;

    if(titulo) titulo.textContent = nome;
    if(disponivel) disponivel.textContent = "A consultar";
    if(reservada) reservada.textContent = "A consultar";
    if(conflitos) conflitos.textContent = "Carregando";
    if(lista) lista.textContent = "Buscando pedidos que utilizam este item...";
    panel?.classList.add("open");

    if(!itemId || !supabase || !window.__CONTEXT?.empresa_id){
      if(conflitos) conflitos.textContent = "Sem item cadastrado selecionado";
      if(lista) lista.textContent = "Escolha um item do cadastro para consultar disponibilidade e conflitos.";
      return;
    }

    try{
      const { data, error } = await supabase
        .from("separacoes_itens")
        .select("quantidade_solicitada, separacoes_pedidos(numero_pedido, cliente_nome, tipo_evento, data_evento, data_hora, local_nome, status)")
        .eq("empresa_id", window.__CONTEXT.empresa_id)
        .eq("item_id", itemId)
        .limit(20);

      if(error) throw error;

      const totalReservado = (data || []).reduce((acc, item) => acc + Number(item.quantidade_solicitada || 0), 0);
      if(reservada) reservada.textContent = String(totalReservado);
      if(disponivel) disponivel.textContent = "Consulte estoque";
      if(conflitos) conflitos.textContent = data?.length ? `${data.length} uso(s) encontrado(s)` : "Nenhum conflito encontrado";
      if(lista){
        lista.innerHTML = (data || []).length
          ? data.map((item) => {
              const pedido = item.separacoes_pedidos || {};
              const dataEvento = pedido.data_evento || pedido.data_hora || "";
              return `
                <div class="onde-pedido">
                  <strong>Pedido ${pedido.numero_pedido || "-"}</strong>
                  <span>${pedido.cliente_nome || "Cliente"} - ${pedido.tipo_evento || "Evento"}</span>
                  <span>${dataEvento ? new Date(dataEvento).toLocaleDateString("pt-BR") : "Sem data"} - ${pedido.local_nome || "Local nao informado"}</span>
                </div>
              `;
            }).join("")
          : "Nenhum pedido usando este item foi encontrado.";
      }
    }catch(err){
      console.warn("Consulta Onde Esta indisponivel:", err);
      if(conflitos) conflitos.textContent = "Consulta indisponivel";
      if(lista) lista.textContent = "Nao foi possivel consultar a disponibilidade neste momento.";
    }
  });
}

function setupOrdenacaoPedido(){
  const tbody = document.getElementById("listaItens");
  if(!tbody) return;
  let applyingOrder = false;

  const storageKey = () => {
    const pedidoId = window.__PEDIDO_ATUAL_ID || document.getElementById("orcamentoNumero")?.textContent?.trim() || "novo";
    return `easyloc:pedido:${pedidoId}:ordem`;
  };

  const getRowId = (row) => {
    if(!row.dataset.orderId){
      row.dataset.orderId = row.dataset.itemId || row.dataset.personalizacaoId || `row-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
    return row.dataset.orderId;
  };

  const salvarOrdem = () => {
    const ordem = Array.from(tbody.children).map(getRowId);
    try{
      localStorage.setItem(storageKey(), JSON.stringify(ordem));
    }catch{}

    tbody.classList.add("sortable-saved");
    setTimeout(() => tbody.classList.remove("sortable-saved"), 480);
  };

  const restaurarOrdem = () => {
    let ordem = [];
    try{
      ordem = JSON.parse(localStorage.getItem(storageKey()) || "[]");
    }catch{
      ordem = [];
    }

    if(!Array.isArray(ordem) || !ordem.length) return;

    const rows = Array.from(tbody.children);
    const atual = rows.map(getRowId);
    const desejada = ordem.filter((id) => atual.includes(id));
    if(desejada.length && desejada.every((id, index) => atual[index] === id)) return;

    const byId = new Map(rows.map((row) => [getRowId(row), row]));
    applyingOrder = true;
    desejada.forEach((id) => {
      const row = byId.get(id);
      if(row) tbody.appendChild(row);
    });
    applyingOrder = false;
  };

  window.__salvarOrdemPedido = salvarOrdem;
  window.__restaurarOrdemPedido = restaurarOrdem;

  const observer = new MutationObserver(() => {
    if(applyingOrder) return;
    salvarOrdem();
  });

  observer.observe(tbody, { childList: true });
  window.__pedidoOrderObserver = observer;

  setTimeout(restaurarOrdem, 0);
}
