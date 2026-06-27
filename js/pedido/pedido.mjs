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
  if(window.__pedidoAtalhosHandler){
    document.removeEventListener("keydown", window.__pedidoAtalhosHandler);
    delete window.__pedidoAtalhosHandler;
  }
  if(window.__pedidoPixHandler){
    window.removeEventListener("easyloc:pix-atualizado", window.__pedidoPixHandler);
    window.removeEventListener("easyloc:pedido-financeiro-atualizado", window.__pedidoPixHandler);
    delete window.__pedidoPixHandler;
  }
  if(window.__pedidoRealtimeChannel && window.supabaseClient?.removeChannel){
    window.supabaseClient.removeChannel(window.__pedidoRealtimeChannel);
    delete window.__pedidoRealtimeChannel;
    delete window.__pedidoRealtimeId;
  }
  delete window.__restaurarItensPedido;
  delete window.__PEDIDO_DADOS_ATUAL;

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

  const statusBloqueiaComercial = (status) => ["em_separacao", "pausado"].includes(String(status || ""));

  const aplicarBloqueioComercialSeparacao = (pedido) => {
    const bloqueado = statusBloqueiaComercial(pedido?.status);
    window.__PEDIDO_BLOQUEADO_SEPARACAO = bloqueado;
    const btnSalvar = document.getElementById("btnSalvarPedido");
    if (btnSalvar) {
      btnSalvar.dataset.separacaoBloqueada = bloqueado ? "1" : "0";
      btnSalvar.title = bloqueado
        ? "Pedido em separacao. A equipe operacional precisa liberar antes de editar."
        : "";
    }
  };

  window.__PEDIDO_BLOQUEADO_SEPARACAO = false;

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

  const moedaParaNumero = (valor) => {
    const limpo = String(valor || "")
      .replace(/[^\d,.-]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    return Number(limpo || 0);
  };

  const dataParaISO = (valor) => {
    const texto = String(valor || "").trim();
    if(!texto) return null;
    if(/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);
    const match = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(match) return `${match[3]}-${match[2]}-${match[1]}`;
    const data = new Date(texto);
    return Number.isNaN(data.getTime()) ? null : data.toISOString().slice(0, 10);
  };

  const statusComercialAtual = () => {
    return window.__PEDIDO_STATUS_ATUAL
      || document.querySelector(".timeline-step.active")?.dataset?.status
      || "orcamento";
  };

  const coletarItensParaReserva = () => {
    return Array.from(document.querySelectorAll("#listaItens tr.item-row"))
      .map((row) => {
        const itemId = row.dataset.itemId;
        if(!itemId) return null;

        const quantidadeTexto = row.querySelector(".qtd")?.value
          || row.querySelector(".qtd")?.innerText
          || "0";
        const quantidade = Number(String(quantidadeTexto).replace(",", ".") || 0);
        if(!quantidade) return null;

        return {
          item_id: itemId,
          item_nome: row.querySelector(".nome-item")?.innerText?.trim() || "Item",
          codigo_item: row.dataset.codigoItem || "",
          foto_url: row.querySelector(".foto-item img")?.getAttribute("src") || "",
          quantidade_solicitada: quantidade,
          quantidade_separada: 0,
          tipo_controle: "quantidade",
          status: "pendente"
        };
      })
      .filter(Boolean);
  };

  const observacaoOperacionalDaLinha = (row, index = 0) => {
    const textoLegado = (row?.dataset?.obsTexto || "").trim();
    const separacaoTexto = (row?.dataset?.obsSeparacaoTexto || (row?.dataset?.obsSeparacao !== "0" ? textoLegado : "")).trim();
    const entregaTexto = (row?.dataset?.obsEntregaTexto || (row?.dataset?.obsEntrega === "1" ? textoLegado : "")).trim();
    if(!separacaoTexto && !entregaTexto) return null;

    return {
      index,
      item_id: row.dataset.itemId || "",
      codigo_item: row.dataset.codigoItem || "",
      item_nome: row.querySelector(".nome-item")?.innerText?.trim()
        || row.querySelector(".nome-item")?.value?.trim()
        || "Item",
      texto: separacaoTexto || entregaTexto,
      observacoes: {
        separacao: separacaoTexto,
        entrega: entregaTexto
      },
      destinos: {
        separacao: Boolean(separacaoTexto),
        entrega: Boolean(entregaTexto)
      },
      atualizado_em: new Date().toISOString()
    };
  };

  const coletarObservacoesItensOperacionais = () => {
    return Array.from(document.querySelectorAll("#listaItens tr.item-row"))
      .map((row, index) => observacaoOperacionalDaLinha(row, index))
      .filter(Boolean);
  };

  const encontrarObservacaoItem = (observacoes = [], item = {}, index = 0) => {
    if(!Array.isArray(observacoes) || !observacoes.length) return null;
    const itemId = String(item.item_id || item.id || "");
    const codigo = String(item.codigo_item || item.codigo || "");
    const nome = String(item.item_nome || item.produto || item.descricao_total || "").trim();
    return observacoes.find((obs) => {
      if(itemId && String(obs.item_id || "") === itemId) return true;
      if(codigo && String(obs.codigo_item || "") === codigo) return true;
      if(nome && String(obs.item_nome || "").trim() === nome) return true;
      return Number(obs.index) === Number(index);
    }) || null;
  };

  async function obterProximoNumeroPedido(){
    const { data, error } = await supabase
      .from("separacoes_pedidos")
      .select("numero_pedido")
      .eq("empresa_id", window.__CONTEXT.empresa_id);

    if(error) throw error;

    const usados = new Set((data || []).map((row) => String(row.numero_pedido || "").trim()));
    let proximo = usados.size + 1;
    let numero = String(proximo).padStart(3, "0");

    while(usados.has(numero)){
      proximo += 1;
      numero = String(proximo).padStart(3, "0");
    }

    return numero;
  }

  const coletarParcelasFinanceiras = () => {
    return Array.from(document.querySelectorAll("#cronogramaParcelas tr"))
      .map((row, index) => {
        const tipo = row.querySelector(".pg-parcela-label")?.textContent?.trim() || `Parcela ${index + 1}`;
        const numero = row.querySelector(".pg-numero")?.textContent?.trim() || String(index + 1);
        const vencimento = dataParaISO(row.querySelector(".pg-vencimento")?.value || "");
        const valor = moedaParaNumero(row.querySelector(".pg-valor")?.innerText || row.querySelector(".pg-valor")?.textContent || "");
        const recebido = moedaParaNumero(row.querySelector(".pg-recebido")?.innerText || row.querySelector(".pg-recebido")?.textContent || "");
        const metodo = row.querySelector(".pg-metodo")?.value
          || row.querySelector(".pg-metodo-text")?.textContent?.trim()
          || document.getElementById("pagamentoMetodo")?.value
          || "A combinar";
        const status = row.querySelector(".pg-status")?.value
          || row.querySelector(".pg-status-badge")?.textContent?.trim()
          || "Programado";

        if(!valor) return null;
        return {
          numero,
          tipo,
          vencimento,
          valor,
          recebido,
          metodo,
          status
        };
      })
      .filter(Boolean);
  };

  const textById = (id) => document.getElementById(id)?.textContent?.trim() || "";

  const coletarLogisticaSnapshot = () => ({
    km: Number(window.kmPedido || 0),
    volume: textById("freteVolumeTotal"),
    distancia: textById("freteDistanciaKm"),
    totalOperacao: textById("logisticaTotalOperacao"),
    descontoCaminhao: textById("logisticaDescontoCaminhao"),
    resumoFrete: textById("resumoFreteBruto"),
    resumoMontagem: textById("resumoMontagemBruto"),
    descontoMontagem: textById("resumoMontagemDesconto")
  });

  const aplicarLogisticaSnapshot = (snapshot = null) => {
    if(!snapshot || typeof snapshot !== "object") return;

    if(Number(snapshot.km)) window.kmPedido = Number(snapshot.km);

    const valores = {
      freteVolumeTotal: snapshot.volume,
      freteDistanciaKm: snapshot.distancia,
      logisticaTotalOperacao: snapshot.totalOperacao,
      logisticaDescontoCaminhao: snapshot.descontoCaminhao,
      resumoFreteBruto: snapshot.resumoFrete,
      resumoMontagemBruto: snapshot.resumoMontagem,
      resumoMontagemDesconto: snapshot.descontoMontagem
    };

    Object.entries(valores).forEach(([id, value]) => {
      if(value) setTextValue(id, value);
    });
  };

  const setInputValue = (id, value = "") => {
    const el = document.getElementById(id);
    if(el) el.value = value || "";
  };

  const setTextValue = (id, value = "") => {
    const el = document.getElementById(id);
    if(el) el.textContent = value || "";
  };

  const horaParaInput = (value = "") => {
    const texto = String(value || "").trim();
    const match = texto.match(/(?:T|\s)(\d{2}:\d{2})/);
    return match?.[1] || "";
  };

  const listaParcelasFinanceiras = (value) => {
    if(Array.isArray(value)) return value;
    if(value && typeof value === "object"){
      return Object.values(value).filter((item) => item && typeof item === "object");
    }
    return [];
  };

  const extrairParcelasFinanceiras = (observacoes = {}, pedido = {}) => {
    const obs = observacoes && typeof observacoes === "object" ? observacoes : {};
    const candidatos = [
      obs.parcelas_financeiras,
      obs.financeiro?.parcelas_financeiras,
      obs.financeiro?.parcelas,
      obs.pagamento?.parcelas_financeiras,
      obs.pagamento?.parcelas,
      obs.pix?.parcelas,
      pedido.parcelas_financeiras,
      pedido.parcelas_pagamento
    ];

    for(const candidato of candidatos){
      const lista = listaParcelasFinanceiras(candidato);
      if(lista.length) return lista;
    }

    return [];
  };

  const selecionarOpcaoPorTexto = (id, texto = "") => {
    const select = document.getElementById(id);
    if(!select) return;
    const alvo = String(texto || "").trim().toLowerCase();
    const option = Array.from(select.options).find((opt) => {
      return opt.value === texto || opt.textContent.trim().toLowerCase() === alvo;
    });
    if(option) select.value = option.value;
  };

  const aplicarStatusVisual = (status = "orcamento") => {
    const labels = {
      orcamento: "Orcamento",
      pre_reserva: "Pre reserva",
      aprovado: "Aprovado",
      cancelado: "Cancelado"
    };
    document.querySelectorAll(".timeline-step").forEach((step) => {
      step.classList.toggle("active", step.dataset.status === status);
    });
    setTextValue("pedidoStatus", labels[status] || status);
    window.__PEDIDO_STATUS_ATUAL = status;
  };

  const renderizarParcelasSalvas = (parcelas = []) => {
    const tbody = document.getElementById("cronogramaParcelas");
    if(!tbody || !Array.isArray(parcelas) || !parcelas.length) return;
    const metodos = ["PIX", "Cartao", "Transferencia", "Boleto", "Dinheiro", "A combinar"];
    const statuses = ["Programado", "Pago", "Pendente", "Cancelado"];
    const normalizar = (value = "") => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
    const normalizarMetodo = (value = "") => {
      const key = normalizar(value);
      if(key.includes("pix")) return "PIX";
      if(key.includes("cartao") || key.includes("credito")) return "Cartao";
      if(key.includes("boleto")) return "Boleto";
      if(key.includes("transferencia")) return "Transferencia";
      if(key.includes("dinheiro")) return "Dinheiro";
      return "A combinar";
    };
    const metodoLabel = (value = "") => ({
      PIX: "PIX",
      Cartao: "Cartão de crédito",
      Boleto: "Boleto",
      Transferencia: "Transferência",
      Dinheiro: "Dinheiro",
      "A combinar": "A combinar"
    })[normalizarMetodo(value)] || "A combinar";
    const metodoIcon = (value = "") => ({
      PIX: "qr-code",
      Cartao: "credit-card",
      Boleto: "barcode",
      Transferencia: "banknote",
      Dinheiro: "wallet",
      "A combinar": "circle-ellipsis"
    })[normalizarMetodo(value)] || "qr-code";
    const metodoClass = (value = "") => normalizarMetodo(value).toLowerCase().replace(/\s+/g, "-");

    tbody.innerHTML = parcelas.map((parcela, index) => {
      const data = dataParaISO(parcela.vencimento);
      const status = parcela.status || "Programado";
      const recebido = Number(parcela.recebido || parcela.valor_recebido || 0);
      const valor = Number(parcela.valor || 0);
      const metodo = normalizarMetodo(parcela.metodo || "PIX");
      const normalizado = normalizar(status);
      const pago = normalizado.includes("pago") || (valor > 0 && recebido >= valor);
      const venc = data ? new Date(`${data}T00:00:00`) : null;
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const atrasado = !pago && venc && !Number.isNaN(venc.getTime()) && venc < hoje;
      const statusKey = pago ? "paid" : atrasado ? "overdue" : "programmed";
      const statusLabel = pago ? "Pago" : atrasado ? "Atrasado" : "Em dia";
      return `
        <tr class="is-${statusKey}">
          <td>
            <strong class="pg-parcela-label">${parcela.tipo || `Parcela ${index + 1}`}</strong>
            <span class="pg-numero sr-only">${parcela.numero || index + 1}</span>
            <small class="pg-parcela-pos">${index + 1} de ${parcelas.length}</small>
          </td>
          <td><input class="el-input pg-vencimento" type="date" value="${data || ""}"></td>
          <td contenteditable="true" class="pg-valor">${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
          <td>
            <span class="pg-status-badge ${statusKey}">${statusLabel}</span>
            <select class="pg-status sr-only">
              ${statuses.map((option) => `<option ${option === status || (option === "Pago" && pago) ? "selected" : ""}>${option}</option>`).join("")}
            </select>
          </td>
          <td>
            <select class="pg-metodo pagamento-metodo-select" aria-label="Forma de pagamento da parcela">
              ${metodos.map((option) => `<option value="${option}" ${option === metodo ? "selected" : ""}>${metodoLabel(option)}</option>`).join("")}
            </select>
            <span class="pg-metodo-text sr-only">${metodoLabel(metodo)}</span>
            <span class="pg-recebido sr-only">${Number(recebido).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
          </td>
          <td>
            <button type="button" class="pedido-cobranca-btn ${metodoClass(metodo)}" data-cobranca-parcela title="Cobrança via ${metodoLabel(metodo)}" aria-label="Cobrança via ${metodoLabel(metodo)}">
              <i data-lucide="${metodoIcon(metodo)}"></i>
            </button>
          </td>
          <td>
            <div class="pg-row-actions">
              <button type="button" class="pg-action-btn" data-pg-action="edit" title="Editar parcela" aria-label="Editar parcela"><i data-lucide="pencil"></i></button>
              <button type="button" class="pg-action-btn danger" data-pg-action="remove" title="Remover parcela" aria-label="Remover parcela"><i data-lucide="trash-2"></i></button>
              <button type="button" class="pg-action-btn muted" data-pg-action="more" title="Mais opções" aria-label="Mais opções"><i data-lucide="grip-vertical"></i></button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
    window.lucide?.createIcons?.();
  };

  function setupPedidoRealtime(pedidoId){
    if(!pedidoId || !supabase?.channel || !window.__CONTEXT?.empresa_id) return;
    if(window.__pedidoRealtimeId === pedidoId && window.__pedidoRealtimeChannel) return;

    if(window.__pedidoRealtimeChannel && supabase.removeChannel){
      supabase.removeChannel(window.__pedidoRealtimeChannel);
      window.__pedidoRealtimeChannel = null;
    }

    window.__pedidoRealtimeId = pedidoId;
    window.__pedidoRealtimeChannel = supabase
      .channel(`pedido-${pedidoId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "separacoes_pedidos",
        filter: `id=eq.${pedidoId}`
      }, (payload) => {
        if(payload?.new?.empresa_id && String(payload.new.empresa_id) !== String(window.__CONTEXT.empresa_id)) return;
        carregarPedidoSalvoSeNecessario();
      })
      .subscribe();
  }

  async function carregarPedidoSalvoSeNecessario(){
    const pedidoId = window.__PEDIDO_ATUAL_ID;
    if(!pedidoId || !supabase || !window.__CONTEXT?.empresa_id) return;

    const { data: pedido, error } = await supabase
      .from("separacoes_pedidos")
      .select("*")
      .eq("empresa_id", window.__CONTEXT.empresa_id)
      .eq("id", pedidoId)
      .single();

    if(error || !pedido){
      console.error("Erro ao carregar pedido salvo:", error);
      avisar("Nao foi possivel carregar os dados deste pedido.", "Editar pedido", "erro");
      return;
    }

    const observacoesPedido = pedido.observacoes && typeof pedido.observacoes === "object"
      ? pedido.observacoes
      : {};
    const parcelasFinanceiras = extrairParcelasFinanceiras(observacoesPedido, pedido);

    window.__PEDIDO_DADOS_ATUAL = {
      ...pedido,
      observacoes: observacoesPedido
    };
    setupPedidoRealtime(pedidoId);
    aplicarBloqueioComercialSeparacao(pedido);

    setTextValue("orcamentoNumero", pedido.numero_pedido || "");
    setInputValue("clienteInput", pedido.cliente_nome || "");
    setInputValue("clienteIdHidden", pedido.cliente_id || "");
    setInputValue("telefoneInput", pedido.contato_cliente || "");
    selecionarOpcaoPorTexto("tipoEventoSelect", pedido.tipo_evento || "");
    setInputValue("localInput", pedido.local_nome || "");
    setInputValue("localIdHidden", pedido.local_id || "");
    setInputValue("dataEntrega", dataParaISO(pedido.data_entrega));
    setInputValue("dataEvento", dataParaISO(pedido.data_evento || pedido.data_hora));
    setInputValue("dataColeta", dataParaISO(pedido.data_coleta));
    const horariosPedido = observacoesPedido.horarios_pedido || observacoesPedido.horarios || {};
    setInputValue(
      "horaEntrega",
      observacoesPedido.horario_entrega || horariosPedido.entrega || horaParaInput(pedido.data_entrega)
    );
    setInputValue(
      "horaColeta",
      observacoesPedido.horario_coleta || horariosPedido.coleta || horaParaInput(pedido.data_coleta)
    );
    setInputValue("pagamentoObservacaoFinanceira", typeof observacoesPedido.financeiro === "string" ? observacoesPedido.financeiro : "");
    if(observacoesPedido.local_html && document.getElementById("localObservacoes")){
      document.getElementById("localObservacoes").innerHTML = observacoesPedido.local_html;
    }
    if(observacoesPedido.local_tags_html && document.getElementById("localTagsInline")){
      document.getElementById("localTagsInline").innerHTML = observacoesPedido.local_tags_html;
    }
    if(pedido.local_id){
      const { data: localSalvo } = await supabase
        .from("locais_empresas")
        .select("id,nome_razao,endereco,numero_endereco,ponto_referencia,latitude,longitude,distancia_galpao_km,distancia_galpao_texto,google_place_id,tags")
        .eq("empresa_id", window.__CONTEXT.empresa_id)
        .eq("id", pedido.local_id)
        .maybeSingle();
      if(localSalvo){
        if(typeof window.__pedidoRenderizarLocalEvento === "function"){
          window.__pedidoRenderizarLocalEvento(localSalvo);
        }else{
          if(!observacoesPedido.local_html && document.getElementById("localObservacoes")){
            document.getElementById("localObservacoes").innerHTML = `
              ${localSalvo.endereco ? `<div style="margin-bottom:4px;"><strong>Endereco:</strong> <span>${localSalvo.endereco}${localSalvo.numero_endereco ? ", " + localSalvo.numero_endereco : ""}</span></div>` : ""}
              ${localSalvo.ponto_referencia ? `<div style="margin-bottom:4px;"><strong>Referencia:</strong> <span>${localSalvo.ponto_referencia}</span></div>` : ""}
            `;
          }
          if(!observacoesPedido.local_tags_html && document.getElementById("localTagsInline")){
            const tags = getTagsOperacionaisLocal(localSalvo.tags || {});
            document.getElementById("localTagsInline").innerHTML = tags
              .map((tag) => `<span class="local-tag-real">${tag}</span>`)
              .join("");
          }
        }
      }
    }
    aplicarStatusVisual(pedido.status_comercial || "orcamento");
    if(window.__pedidoAplicarPagamentoConfig){
      window.__pedidoAplicarPagamentoConfig(
        observacoesPedido.pagamento_config || {},
        parcelasFinanceiras
      );
    }else{
      renderizarParcelasSalvas(parcelasFinanceiras);
    }
    aplicarLogisticaSnapshot(observacoesPedido.logistica_snapshot || null);

    const { data: itens, error: itensError } = await supabase
      .from("separacoes_itens")
      .select("*, itens:item_id(id,codigo,produto,descricao_total,foto_url,valor_locacao,valor_reposicao,volume_cubico)")
      .eq("empresa_id", window.__CONTEXT.empresa_id)
      .eq("separacao_pedido_id", pedidoId)
      .order("created_at", { ascending: true });

    if(itensError){
      console.error("Erro ao carregar itens do pedido:", itensError);
      avisar("Pedido carregado, mas os itens nao foram encontrados.", "Itens do pedido", "aviso");
    }else{
      const observacoesItens = Array.isArray(observacoesPedido.itens_operacionais)
        ? observacoesPedido.itens_operacionais
        : [];
      const itensTela = (itens || []).map((item, index) => ({
        item_id: item.item_id,
        codigo_item: item.codigo_item || item.itens?.codigo || "",
        item_nome: item.item_nome || item.itens?.descricao_total || item.itens?.produto || "Item",
        foto_url: item.foto_url || item.itens?.foto_url || "",
        quantidade_solicitada: item.quantidade_solicitada || 1,
        valor_locacao: item.itens?.valor_locacao || 0,
        valor_reposicao: item.itens?.valor_reposicao || 0,
        volume_cubico: item.itens?.volume_cubico || 0,
        observacao_operacional: encontrarObservacaoItem(observacoesItens, item, index)
      }));
      window.__restaurarItensPedido?.(itensTela);
    }

    document.getElementById("tipoEventoSelect")?.dispatchEvent(new Event("change"));
    document.getElementById("localInput")?.dispatchEvent(new Event("change", { bubbles: true }));
    window.atualizarResumoGlobal?.();
    window.__ocultarAutocompleteClientePedido?.();

    if(["visualizar", "imprimir"].includes(window.__PEDIDO_MODO_ABERTURA)){
      setTimeout(() => window.imprimirPedido?.(), 350);
    }
  }

  function getTagsOperacionaisLocal(tags){
    const observacoes = Array.isArray(tags?.observacoes) ? tags.observacoes.filter(Boolean) : [];
    const normalizar = (value) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const entradas = [
      ...Object.entries(tags || {}).filter(([, value]) => value === true).map(([key]) => key),
      ...Object.values(tags || {}).filter((value) => typeof value === "string")
    ].map(normalizar);
    const tem = (...nomes) => nomes.some((nome) => entradas.some((entrada) => entrada.includes(normalizar(nome))));
    const inferidas = [
      tem("baldeacao", "baldeacao necessaria") ? "Necessita Baldeação" : "",
      tem("escada") ? "Tem escadas" : "",
      tem("elevador") ? "Tem Elevador" : "",
      tem("caminhao perto", "caminhao_proximo", "caminhao proximo") ? "Caminhão para perto" : ""
    ].filter(Boolean);
    return [...new Set([...observacoes, ...inferidas])];
  }

  function addDaysISO(dateValue, days) {
    if (!dateValue) return null;
    const [year, month, day] = String(dateValue).slice(0, 10).split("-").map(Number);
    if (!year || !month || !day) return null;
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }

  async function carregarRegrasCronograma() {
    const padrao = {
      carregamento_dias_antes_entrega: 1,
      triagem_dias_antes_carregamento: 2,
      montagem_dias_apos_entrega: 0,
      desmontagem_dias_apos_coleta: 0,
      triagem_retorno_dias_apos_coleta: 1,
      hora_padrao: "08:00"
    };

    const { data, error } = await supabase
      .from("empresa_logistica_regras")
      .select("*")
      .eq("empresa_id", window.__CONTEXT.empresa_id)
      .maybeSingle();

    if (error) {
      console.warn("Regras do cronograma indisponiveis; usando padrao.", error);
      return padrao;
    }

    return { ...padrao, ...(data || {}) };
  }

  async function garantirCronogramaLogistico(pedidoId, pedido) {
    if (!pedidoId || !pedido?.data_evento || pedido.status_comercial === "cancelado") {
      return;
    }

    const { count, error: countError } = await supabase
      .from("cronograma_logistico")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", window.__CONTEXT.empresa_id)
      .eq("pedido_id", pedidoId);

    if (countError) {
      console.warn("Nao foi possivel verificar cronograma existente.", countError);
      return;
    }

    if (count && count > 0) {
      return;
    }

    const regras = await carregarRegrasCronograma();
    const entrega = pedido.data_entrega || pedido.data_evento;
    const coleta = pedido.data_coleta || pedido.data_evento;
    const carregamento = addDaysISO(entrega, -Number(regras.carregamento_dias_antes_entrega || 0));
    const triagem = addDaysISO(carregamento, -Number(regras.triagem_dias_antes_carregamento || 0));
    const montagem = addDaysISO(entrega, Number(regras.montagem_dias_apos_entrega || 0));
    const desmontagem = addDaysISO(coleta, Number(regras.desmontagem_dias_apos_coleta || 0));
    const triagemRetorno = addDaysISO(coleta, Number(regras.triagem_retorno_dias_apos_coleta || 0));
    const horario = String(regras.hora_padrao || "08:00").slice(0, 5);

    const etapas = [
      { etapa: "Triagem", data_etapa: triagem, observacao: "Separacao previa do pedido." },
      { etapa: "Carregamento", data_etapa: carregamento, observacao: "Carregamento conforme regra da empresa." },
      { etapa: "Montagem", data_etapa: montagem, observacao: "Montagem conforme data de entrega." },
      { etapa: "Evento", data_etapa: pedido.data_evento, observacao: "Data do evento." },
      { etapa: "Desmontagem", data_etapa: desmontagem, observacao: "Desmontagem conforme coleta." },
      { etapa: "Triagem Retorno", data_etapa: triagemRetorno, observacao: "Conferencia de retorno." }
    ].filter((item) => item.data_etapa);

    if (!etapas.length) {
      return;
    }

    const payload = etapas.map((item) => ({
      ...item,
      empresa_id: window.__CONTEXT.empresa_id,
      pedido_id: pedidoId,
      numero_pedido: pedido.numero_pedido,
      cliente_nome: pedido.cliente_nome,
      local_nome: pedido.local_nome,
      tipo_evento: pedido.tipo_evento,
      data_evento: pedido.data_evento,
      horario,
      origem: "pedido",
      status: "programado",
      regras_snapshot: regras,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from("cronograma_logistico")
      .insert(payload);

    if (error) {
      console.warn("Pedido salvo, mas o cronograma logistico nao foi gerado.", error);
    }
  }

  async function salvarPedidoOperacional(){
    if(!supabase || !window.__CONTEXT?.empresa_id){
      avisar("Sessao ou empresa nao encontrada para salvar o pedido.", "Salvar pedido", "erro");
      return;
    }

    if (window.__PEDIDO_BLOQUEADO_SEPARACAO) {
      avisar(
        "Este pedido esta em separacao. O comercial so pode alterar depois que a equipe de separacao liberar o pedido.",
        "Pedido bloqueado",
        "aviso"
      );
      return;
    }

    const statusComercial = statusComercialAtual();
    let numeroPedido = document.getElementById("orcamentoNumero")?.textContent?.trim() || "";
    const clienteNome = document.getElementById("clienteInput")?.value?.trim() || "Cliente nao informado";
    const clienteId = document.getElementById("clienteIdHidden")?.value || null;
    const localId = document.getElementById("localIdHidden")?.value || null;
    const localNome = document.getElementById("localInput")?.value?.trim() || "";
    const dataEvento = document.getElementById("dataEvento")?.value || null;
    const dataEntrega = document.getElementById("dataEntrega")?.value || null;
    const dataColeta = document.getElementById("dataColeta")?.value || null;
    const horaEntrega = document.getElementById("horaEntrega")?.value || "";
    const horaColeta = document.getElementById("horaColeta")?.value || "";
    const valorTotal = moedaParaNumero(document.getElementById("resumoTotalGeral")?.textContent);
    const deveReservar = ["pre_reserva", "aprovado"].includes(statusComercial);
    const itensReserva = deveReservar ? coletarItensParaReserva() : [];

    if(deveReservar && !itensReserva.length){
      avisar("Adicione itens cadastrados antes de criar uma reserva.", "Reserva sem itens", "aviso");
      return;
    }

    const observacoesAtuais = window.__PEDIDO_DADOS_ATUAL?.observacoes
      && typeof window.__PEDIDO_DADOS_ATUAL.observacoes === "object"
      ? { ...window.__PEDIDO_DADOS_ATUAL.observacoes }
      : {};

    const payloadPedido = {
      empresa_id: window.__CONTEXT.empresa_id,
      numero_pedido: numeroPedido,
      cliente_id: clienteId || null,
      cliente_nome: clienteNome,
      contato_cliente: document.getElementById("telefoneInput")?.value?.trim() || "",
      tipo_evento: document.getElementById("tipoEventoSelect")?.selectedOptions?.[0]?.textContent?.trim() || "",
      local_id: localId || null,
      local_nome: localNome,
      data_evento: dataEvento,
      data_entrega: dataEntrega,
      data_coleta: dataColeta,
      data_hora: dataEvento ? `${dataEvento}T12:00:00` : null,
      valor_total: valorTotal,
      status: statusComercial === "cancelado" ? "pausado" : "pendente",
      status_comercial: statusComercial,
      observacoes: {
        ...observacoesAtuais,
        financeiro: document.getElementById("pagamentoObservacaoFinanceira")?.value || "",
        parcelas_financeiras: coletarParcelasFinanceiras(),
        pagamento_config: window.__pedidoColetarPagamentoConfig?.() || null,
        itens_operacionais: coletarObservacoesItensOperacionais(),
        logistica_snapshot: coletarLogisticaSnapshot(),
        cancelamento: window.__PEDIDO_CANCELAMENTO || null,
        local_html: document.getElementById("localObservacoes")?.innerHTML || "",
        local_tags_html: document.getElementById("localTagsInline")?.innerHTML || "",
        horario_entrega: horaEntrega,
        horario_coleta: horaColeta,
        horarios_pedido: {
          entrega: horaEntrega,
          coleta: horaColeta
        },
        origem: "pedido"
      },
      atualizado_em: new Date().toISOString()
    };

    let pedidoId = window.__PEDIDO_ATUAL_ID || null;
    let result;

    if(pedidoId){
      result = await supabase
        .from("separacoes_pedidos")
        .update(payloadPedido)
        .eq("id", pedidoId)
        .select("id")
        .single();
    }else{
      numeroPedido = await obterProximoNumeroPedido();
      payloadPedido.numero_pedido = numeroPedido;
      setTextValue("orcamentoNumero", numeroPedido);

      result = await supabase
        .from("separacoes_pedidos")
        .insert({ ...payloadPedido, criado_em: new Date().toISOString() })
        .select("id")
        .single();

      if(result.error?.code === "23505"){
        numeroPedido = await obterProximoNumeroPedido();
        payloadPedido.numero_pedido = numeroPedido;
        setTextValue("orcamentoNumero", numeroPedido);
        result = await supabase
          .from("separacoes_pedidos")
          .insert({ ...payloadPedido, criado_em: new Date().toISOString() })
          .select("id")
          .single();
      }
    }

    if(result.error){
      console.error("Erro ao salvar pedido:", result.error);
      avisar("Nao foi possivel salvar o pedido. Verifique as tabelas de pedidos no Supabase.", "Salvar pedido", "erro");
      return;
    }

    pedidoId = result.data?.id || pedidoId;
    window.__PEDIDO_ATUAL_ID = pedidoId;
    setupPedidoRealtime(pedidoId);
    window.__PEDIDO_DADOS_ATUAL = {
      ...(window.__PEDIDO_DADOS_ATUAL || {}),
      id: pedidoId,
      ...payloadPedido
    };

    const deveSincronizarItens = statusComercial !== "cancelado";

    if(deveSincronizarItens){
      await supabase
        .from("separacoes_itens")
        .delete()
        .eq("empresa_id", window.__CONTEXT.empresa_id)
        .eq("separacao_pedido_id", pedidoId);
    }

    if(deveSincronizarItens && itensReserva.length){
      const itensPayload = itensReserva.map((item) => ({
        ...item,
        empresa_id: window.__CONTEXT.empresa_id,
        separacao_pedido_id: pedidoId
      }));

      const { error: itensError } = await supabase
        .from("separacoes_itens")
        .insert(itensPayload);

      if(itensError){
        console.error("Erro ao salvar itens do pedido:", itensError);
        avisar("Pedido salvo, mas os itens nao foram reservados.", "Reserva", "aviso");
        return;
      }
    }

    await garantirCronogramaLogistico(pedidoId, payloadPedido);

    avisar(
      deveReservar
        ? "Pedido salvo e disponibilidade atualizada."
        : "Orcamento salvo sem reservar estoque.",
      "Salvar pedido",
      "sucesso"
    );
  }

  window.__salvarPedidoOperacional = salvarPedidoOperacional;

  function isCampoDigitavel(target){
    const tag = target?.tagName?.toLowerCase();
    return target?.isContentEditable || ["input", "textarea", "select"].includes(tag);
  }

  function setupAtalhosPedido(){
    const atalhos = {
      F2: { id: "addItemBtn", label: "Adicionar item" },
      F3: { id: "addComponenteBtn", label: "Adicionar componente" },
      F4: { id: "addEspacoBtn", label: "Adicionar espaco" },
      F8: { id: "addPersonalizacaoBtn", label: "Adicionar personalizacao" },
      F9: { id: "addServicoBtn", label: "Adicionar servico" }
    };

    Object.entries(atalhos).forEach(([key, config]) => {
      const button = document.getElementById(config.id);
      if(button && !button.dataset.shortcutBound){
        button.dataset.shortcutBound = "1";
        button.title = `${config.label} (${key})`;
        button.setAttribute("aria-keyshortcuts", key);
      }
    });

    if(window.__pedidoAtalhosHandler){
      document.removeEventListener("keydown", window.__pedidoAtalhosHandler);
    }

    window.__pedidoAtalhosHandler = function(event){
      const config = atalhos[event.key];
      if(!config || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if(isCampoDigitavel(event.target)) return;

      const button = document.getElementById(config.id);
      if(!button) return;

      event.preventDefault();
      button.click();
    };

    document.addEventListener("keydown", window.__pedidoAtalhosHandler);
  }

  document.getElementById("btnVoltarCentralPedidos")?.addEventListener("click", abrirCentral);

  document.getElementById("btnSalvarPedido")?.addEventListener("click", salvarPedidoOperacional);

  document.getElementById("btnDuplicarPedido")?.addEventListener("click", () => {
    avisar("Duplicacao preparada para reaproveitar os dados do pedido atual.", "Duplicar pedido", "info");
  });

  document.getElementById("btnHistoricoPedido")?.addEventListener("click", () => {
    avisar("Historico operacional sera exibido aqui quando houver registros do pedido.", "Historico", "info");
  });

  document.getElementById("btnAddDropItem")?.addEventListener("click", () => {
    document.getElementById("addItemBtn")?.click();
  });

  setupAtalhosPedido();

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
  if(window.__pedidoPixHandler){
    window.removeEventListener("easyloc:pix-atualizado", window.__pedidoPixHandler);
    window.removeEventListener("easyloc:pedido-financeiro-atualizado", window.__pedidoPixHandler);
  }
  window.__pedidoPixHandler = (event) => {
    const pedidoId = event?.detail?.pedido_id || event?.detail?.pedidoId || "";
    if(pedidoId && window.__PEDIDO_ATUAL_ID && String(pedidoId) !== String(window.__PEDIDO_ATUAL_ID)) return;
    carregarPedidoSalvoSeNecessario();
  };
  window.addEventListener("easyloc:pix-atualizado", window.__pedidoPixHandler);
  window.addEventListener("easyloc:pedido-financeiro-atualizado", window.__pedidoPixHandler);
  carregarPedidoSalvoSeNecessario();
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
    window.__salvarPedidoOperacional?.();
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
  const modal = document.getElementById("modalObservacaoItem");
  const titulo = document.getElementById("itemObservacaoTitulo");
  const textarea = document.getElementById("itemObservacaoTexto");
  const tabButtons = Array.from(document.querySelectorAll("[data-item-observacao-tab]"));
  const btnFechar = document.getElementById("btnFecharObservacaoItem");
  const btnLimpar = document.getElementById("btnLimparObservacaoItem");
  const btnSalvar = document.getElementById("btnSalvarObservacaoItem");
  let linhaObservacaoAtual = null;
  let abaObservacaoAtual = "separacao";
  let observacaoDraft = { separacao: "", entrega: "" };

  const nomeLinha = (row) => row?.querySelector(".nome-item")?.innerText?.trim()
    || row?.querySelector(".nome-item")?.value?.trim()
    || "Item";

  const aplicarEstadoObservacao = (row) => {
    if(!row) return;
    const temTexto = Boolean(
      (row.dataset.obsSeparacaoTexto || "").trim()
      || (row.dataset.obsEntregaTexto || "").trim()
      || (row.dataset.obsTexto || "").trim()
    );
    row.classList.toggle("has-operational-note", temTexto);
    const button = row.querySelector(".btn-editar-item");
    if(button){
      button.title = temTexto ? "Editar observação operacional" : "Adicionar observação operacional";
      button.setAttribute("aria-label", button.title);
    }
  };

  const fecharModal = () => {
    modal?.classList.add("hidden");
    linhaObservacaoAtual = null;
  };

  const obterObservacoesLinha = (row) => {
    const textoLegado = (row?.dataset?.obsTexto || "").trim();
    return {
      separacao: (row?.dataset?.obsSeparacaoTexto || (row?.dataset?.obsSeparacao !== "0" ? textoLegado : "")).trim(),
      entrega: (row?.dataset?.obsEntregaTexto || (row?.dataset?.obsEntrega === "1" ? textoLegado : "")).trim()
    };
  };

  const atualizarAbaModal = (tab = "separacao") => {
    abaObservacaoAtual = tab === "entrega" ? "entrega" : "separacao";
    tabButtons.forEach((button) => {
      const active = button.dataset.itemObservacaoTab === abaObservacaoAtual;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    if(textarea){
      textarea.value = observacaoDraft[abaObservacaoAtual] || "";
      textarea.placeholder = abaObservacaoAtual === "entrega"
        ? "Ex.: entregar montado, conferir acesso, orientar motorista..."
        : "Ex.: separar com cuidado, conferir acabamento...";
    }
  };

  const guardarTextoAbaAtual = () => {
    if(!textarea) return;
    observacaoDraft[abaObservacaoAtual] = textarea.value || "";
  };

  const abrirModal = (row) => {
    if(!modal || !row) return;
    linhaObservacaoAtual = row;
    observacaoDraft = obterObservacoesLinha(row);
    if(titulo) titulo.textContent = nomeLinha(row);
    atualizarAbaModal("separacao");
    modal.classList.remove("hidden");
    window.lucide?.createIcons?.();
    setTimeout(() => textarea?.focus?.(), 40);
  };

  if(modal && !modal.dataset.bound){
    modal.dataset.bound = "1";
    btnFechar?.addEventListener("click", fecharModal);
    modal.addEventListener("click", (event) => {
      if(event.target === modal) fecharModal();
    });
    btnLimpar?.addEventListener("click", () => {
      if(!linhaObservacaoAtual) return;
      observacaoDraft[abaObservacaoAtual] = "";
      if(textarea) textarea.value = "";
    });
    btnSalvar?.addEventListener("click", () => {
      if(!linhaObservacaoAtual) return;
      guardarTextoAbaAtual();
      linhaObservacaoAtual.dataset.obsSeparacaoTexto = (observacaoDraft.separacao || "").trim();
      linhaObservacaoAtual.dataset.obsEntregaTexto = (observacaoDraft.entrega || "").trim();
      linhaObservacaoAtual.dataset.obsTexto = linhaObservacaoAtual.dataset.obsSeparacaoTexto || linhaObservacaoAtual.dataset.obsEntregaTexto;
      linhaObservacaoAtual.dataset.obsSeparacao = linhaObservacaoAtual.dataset.obsSeparacaoTexto ? "1" : "0";
      linhaObservacaoAtual.dataset.obsEntrega = linhaObservacaoAtual.dataset.obsEntregaTexto ? "1" : "0";
      aplicarEstadoObservacao(linhaObservacaoAtual);
      fecharModal();
    });
    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        guardarTextoAbaAtual();
        atualizarAbaModal(button.dataset.itemObservacaoTab);
        textarea?.focus?.();
      });
    });
  }

  const apply = () => {
    tbody.querySelectorAll("tr.item-row .acoes-linha").forEach((actions) => {
      if(actions.querySelector(".btn-onde-esta")) return;

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "btn-editar-item";
      edit.title = "Adicionar observação operacional";
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
    tbody.querySelectorAll("tr.item-row").forEach(aplicarEstadoObservacao);
  };

  apply();

  const observer = new MutationObserver(apply);
  observer.observe(tbody, { childList: true, subtree: true });
  window.__pedidoWorkspaceObserver = observer;

  tbody.addEventListener("click", (event) => {
    const edit = event.target.closest(".btn-editar-item");
    if(!edit) return;

    const row = edit.closest("tr.item-row");
    abrirModal(row);
  });
}

function setupOndeEsta({ supabase }){
  const panel = document.getElementById("ondeEstaPanel");
  const closeBtn = document.getElementById("btnFecharOndeEsta");
  const titulo = document.getElementById("ondeEstaTitulo");
  const itemNome = document.getElementById("ondeItemNome");
  const itemCodigo = document.getElementById("ondeItemCodigo");
  const itemFoto = document.getElementById("ondeItemFoto");
  const buscaInput = document.getElementById("ondeBuscaItem");
  const buscaLista = document.getElementById("ondeBuscaLista");
  const disponivel = document.getElementById("ondeQtdDisponivel");
  const reservada = document.getElementById("ondeQtdReservada");
  const totalEl = document.getElementById("ondeQtdTotal");
  const manutencaoEl = document.getElementById("ondeQtdManutencao");
  const conflitos = document.getElementById("ondeConflitos");
  const lista = document.getElementById("ondePedidosLista");
  const empresaId = () => window.__CONTEXT?.empresa_id;

  const escapeHtml = (value = "") => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const fotoDoItem = (item = {}) => item.foto_url || "";

  const nomeDoItem = (item = {}, fallback = "Item") => item.descricao_total
    || item.produto
    || fallback
    || "Item";

  const toDateOnly = (value) => {
    if(!value) return "";
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  };

  const formatDate = (value) => {
    const normalized = toDateOnly(value);
    if(!normalized) return "";
    const [year, month, day] = normalized.split("-");
    return `${day}/${month}/${year}`;
  };

  const selectedDate = () => document.getElementById("dataEvento")?.value
    || document.getElementById("dataEntrega")?.value
    || "";

  const isDateInsidePedido = (pedido = {}) => {
    const base = selectedDate();
    if(!base) return true;
    const alvo = toDateOnly(base);
    const inicio = toDateOnly(pedido.data_entrega || pedido.data_evento || pedido.data_hora);
    const fim = toDateOnly(pedido.data_coleta || pedido.data_evento || pedido.data_hora);
    if(!inicio && !fim) return true;
    return alvo >= (inicio || fim) && alvo <= (fim || inicio);
  };

  const isReservaAtiva = (pedido = {}) => {
    const comercial = String(pedido.status_comercial || "").toLowerCase();
    const operacional = String(pedido.status || "").toLowerCase();
    return !["orcamento", "cancelado"].includes(comercial) && operacional !== "cancelado";
  };

  const setLoading = (nome = "Item") => {
    if(titulo) titulo.textContent = nome;
    if(itemNome) itemNome.textContent = nome;
    if(itemCodigo) itemCodigo.textContent = "-";
    if(itemFoto) itemFoto.textContent = "Sem foto";
    if(disponivel) disponivel.textContent = "...";
    if(reservada) reservada.textContent = "...";
    if(totalEl) totalEl.textContent = "...";
    if(manutencaoEl) manutencaoEl.textContent = "...";
    if(conflitos) conflitos.textContent = "Consultando disponibilidade na data selecionada.";
    if(lista) lista.textContent = "Buscando pedidos relacionados...";
  };

  const setItemVisual = (item = {}, fallback = "Item") => {
    const nome = nomeDoItem(item, fallback);
    const codigo = item.codigo || item.id || "-";
    const foto = fotoDoItem(item);
    if(titulo) titulo.textContent = nome;
    if(itemNome) itemNome.textContent = nome;
    if(itemCodigo) itemCodigo.textContent = `Codigo: ${codigo}`;
    if(itemFoto){
      itemFoto.innerHTML = foto
        ? `<img src="${escapeHtml(foto)}" alt="${escapeHtml(nome)}">`
        : "Sem foto";
    }
  };

  const periodoPedido = (pedido = {}) => {
    const inicio = formatDate(pedido.data_entrega || pedido.data_evento || pedido.data_hora);
    const fim = formatDate(pedido.data_coleta);
    if(inicio && fim && inicio !== fim) return `${inicio} ate ${fim}`;
    return inicio || "Sem data";
  };

  const consultarItem = async (itemId, fallbackName = "Item") => {
    panel?.classList.add("open");
    panel?.setAttribute("aria-hidden", "false");
    setLoading(fallbackName);

    if(!itemId || !supabase || !empresaId()){
      if(conflitos) conflitos.textContent = "Sem item cadastrado selecionado.";
      if(lista) lista.textContent = "Escolha um item do cadastro para consultar disponibilidade e conflitos.";
      return;
    }

    try{
      const [{ data: itemEstoque, error: estoqueError }, { data, error }] = await Promise.all([
        supabase
          .from("itens")
          .select("id,codigo,produto,descricao_total,foto_url,estoque_total,estoque_manutencao,estoque_indisponivel,categoria")
          .eq("empresa_id", empresaId())
          .eq("id", itemId)
          .maybeSingle(),
        supabase
          .from("separacoes_itens")
          .select("quantidade_solicitada, separacoes_pedidos(numero_pedido, cliente_nome, tipo_evento, data_evento, data_hora, data_entrega, data_coleta, local_nome, status,status_comercial)")
          .eq("empresa_id", empresaId())
          .eq("item_id", itemId)
          .limit(80)
      ]);

      if(error) throw error;
      if(estoqueError) console.warn("Estoque do item indisponivel:", estoqueError);

      setItemVisual(itemEstoque || { id: itemId }, fallbackName);

      const reservasDaData = (data || [])
        .filter((item) => isReservaAtiva(item.separacoes_pedidos || {}))
        .filter((item) => isDateInsidePedido(item.separacoes_pedidos || {}));

      const totalReservado = reservasDaData.reduce((acc, item) => acc + Number(item.quantidade_solicitada || 0), 0);
      const totalEstoque = Number(itemEstoque?.estoque_total || 0);
      const totalManutencao = Number(itemEstoque?.estoque_manutencao || itemEstoque?.estoque_indisponivel || 0);
      const totalDisponivel = Math.max(0, totalEstoque - totalReservado - totalManutencao);

      if(reservada) reservada.textContent = String(totalReservado);
      if(disponivel) disponivel.textContent = String(totalDisponivel);
      if(totalEl) totalEl.textContent = String(totalEstoque);
      if(manutencaoEl) manutencaoEl.textContent = String(totalManutencao);
      if(conflitos){
        conflitos.textContent = reservasDaData.length
          ? `${reservasDaData.length} pedido(s) usando este item na data selecionada.`
          : "Nenhum pedido ativo usando este item na data selecionada.";
      }

      if(lista){
        lista.innerHTML = reservasDaData.length
          ? reservasDaData.map((item) => {
              const pedido = item.separacoes_pedidos || {};
              const qtd = Number(item.quantidade_solicitada || 0);
              return `
                <div class="onde-pedido">
                  <div class="onde-pedido-top">
                    <strong>Pedido ${escapeHtml(pedido.numero_pedido || "-")}</strong>
                    <span class="onde-pedido-qtd">Qtd ${qtd}</span>
                  </div>
                  <span>${escapeHtml(pedido.cliente_nome || "Cliente")} - ${escapeHtml(pedido.tipo_evento || "Evento")}</span>
                  <div class="onde-pedido-meta">
                    <span>${escapeHtml(periodoPedido(pedido))}</span>
                    <span>${escapeHtml(pedido.local_nome || "Local nao informado")}</span>
                  </div>
                </div>
              `;
            }).join("")
          : "Nenhum pedido usando este item foi encontrado para a data selecionada.";
      }
    }catch(err){
      console.warn("Consulta Onde Esta indisponivel:", err);
      if(conflitos) conflitos.textContent = "Consulta indisponivel.";
      if(lista) lista.textContent = "Nao foi possivel consultar a disponibilidade neste momento.";
    }
  };

  const fecharSugestoes = () => {
    buscaLista?.classList.remove("open");
    if(buscaLista) buscaLista.innerHTML = "";
  };

  closeBtn?.addEventListener("click", () => {
    panel?.classList.remove("open");
    panel?.setAttribute("aria-hidden", "true");
    fecharSugestoes();
  });

  document.getElementById("listaItens")?.addEventListener("click", (event) => {
    const btn = event.target.closest(".btn-onde-esta");
    if(!btn) return;

    const row = btn.closest("tr.item-row");
    const nome = row?.querySelector(".nome-item")?.innerText?.trim() || "Item";
    const itemId = row?.dataset?.itemId;
    consultarItem(itemId, nome);
  });

  let searchTimer = null;
  buscaInput?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const termo = buscaInput.value.trim();
    if(termo.length < 2){
      fecharSugestoes();
      return;
    }

    searchTimer = setTimeout(async () => {
      if(!supabase || !empresaId()) return;
      try{
        const busca = termo.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
        const { data, error } = await supabase
          .from("itens")
          .select("id,codigo,produto,descricao_total,foto_url")
          .eq("empresa_id", empresaId())
          .or(`descricao_total.ilike.%${busca}%,produto.ilike.%${busca}%,codigo.ilike.%${busca}%`)
          .limit(8);
        if(error) throw error;

        if(!data?.length){
          if(buscaLista){
            buscaLista.innerHTML = `<div class="onde-busca-vazio">Nenhum item encontrado.</div>`;
            buscaLista.classList.add("open");
          }
          return;
        }

        if(buscaLista){
          buscaLista.innerHTML = data.map((item) => {
            const nome = nomeDoItem(item);
            const foto = fotoDoItem(item);
            return `
              <button type="button" class="onde-busca-opcao" data-item-id="${escapeHtml(item.id)}" data-item-nome="${escapeHtml(nome)}">
                ${foto ? `<img src="${escapeHtml(foto)}" alt="${escapeHtml(nome)}">` : `<span class="onde-busca-thumb">Sem foto</span>`}
                <span>
                  <strong>${escapeHtml(nome)}</strong>
                  <span>${escapeHtml(item.codigo || item.id || "-")}</span>
                </span>
              </button>
            `;
          }).join("");
          buscaLista.classList.add("open");
        }
      }catch(err){
        console.warn("Busca de item no Onde Esta indisponivel:", err);
      }
    }, 250);
  });

  buscaLista?.addEventListener("click", (event) => {
    const option = event.target.closest(".onde-busca-opcao");
    if(!option) return;
    const itemId = option.dataset.itemId;
    const nome = option.dataset.itemNome || "Item";
    if(buscaInput) buscaInput.value = "";
    fecharSugestoes();
    consultarItem(itemId, nome);
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
