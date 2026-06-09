(function(){
  const state = {
    pedidos: [],
    filtrados: [],
    supabase: null,
    empresaId: null
  };

  const els = {};
  const MISSING_SEPARACAO_TABLES_KEY = "easyloc:separacao-tabelas-ausentes";

  function $(id){
    return document.getElementById(id);
  }

  function cacheEls(){
    [
      "btnNovoPedidoCentral",
      "btnAtualizarPedidos",
      "filtroClientePedido",
      "filtroNumeroPedido",
      "filtroLocalPedido",
      "filtroComercialPedido",
      "filtroStatusPedido",
      "filtroDataInicialPedido",
      "filtroDataFinalPedido",
      "centralStatusCarregamento",
      "centralPedidosTbody"
    ].forEach((id) => {
      els[id] = $(id);
    });
  }

  function avisar(mensagem, titulo = "Central de Pedidos", tipo = "info"){
    if(typeof window.alerta === "function"){
      window.alerta(mensagem, titulo, tipo);
      return;
    }
    alert(mensagem);
  }

  function escapeHtml(value){
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatCurrency(value){
    return Number(value || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function formatDate(value){
    if(!value) return "-";
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("pt-BR");
  }

  function isTabelaAusente(error){
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    return code === "42P01" || /does not exist|schema cache|could not find/i.test(message);
  }

  function tabelasSeparacaoAusentes(){
    try{
      return localStorage.getItem(MISSING_SEPARACAO_TABLES_KEY) === "1";
    }catch{
      return false;
    }
  }

  function marcarTabelasSeparacaoAusentes(){
    try{
      localStorage.setItem(MISSING_SEPARACAO_TABLES_KEY, "1");
    }catch{}
  }

  function abrirPedido(pedidoId = ""){
    if(typeof window.carregarNaMain === "function"){
      const suffix = pedidoId ? `?pedido=${encodeURIComponent(pedidoId)}` : "";
      window.__PEDIDO_ATUAL_ID = pedidoId || null;
      window.carregarNaMain(
        `Modulos/Comercial/Pedidos/pedido.html${suffix}`,
        "js/pedido/pedido.mjs",
        null,
        "Modulos/Comercial/Pedidos/pedido.css"
      );
      return;
    }

    window.location.href = pedidoId
      ? `pedido.html?pedido=${encodeURIComponent(pedidoId)}`
      : "pedido.html";
  }

  function normalizarPedido(row){
    return {
      id: row.id,
      numero: row.numero_pedido || row.numero || row.codigo || row.id || "-",
      cliente: row.cliente_nome || row.cliente || row.nome_cliente || "Cliente nao informado",
      evento: row.tipo_evento || row.evento || row.nome_evento || "Evento",
      local: row.local_nome || row.local || row.endereco || "Local nao informado",
      data: row.data_evento || row.data_hora || row.data || row.created_at,
      status: row.status || "orcamento",
      valor: Number(row.valor_total || row.total || row.valor || 0),
      comercial: row.comercial_nome || row.comercial || row.responsavel || "-"
    };
  }

  function aplicarFiltros(){
    const cliente = (els.filtroClientePedido?.value || "").trim().toLowerCase();
    const numero = (els.filtroNumeroPedido?.value || "").trim().toLowerCase();
    const local = (els.filtroLocalPedido?.value || "").trim().toLowerCase();
    const comercial = (els.filtroComercialPedido?.value || "").trim().toLowerCase();
    const status = els.filtroStatusPedido?.value || "";
    const inicial = els.filtroDataInicialPedido?.value;
    const final = els.filtroDataFinalPedido?.value;

    state.filtrados = state.pedidos.filter((pedido) => {
      const dataPedido = pedido.data ? new Date(pedido.data) : null;
      const dataISO = dataPedido && !Number.isNaN(dataPedido.getTime())
        ? dataPedido.toISOString().slice(0, 10)
        : "";

      return (!cliente || pedido.cliente.toLowerCase().includes(cliente))
        && (!numero || String(pedido.numero).toLowerCase().includes(numero))
        && (!local || pedido.local.toLowerCase().includes(local))
        && (!comercial || pedido.comercial.toLowerCase().includes(comercial))
        && (!status || pedido.status === status)
        && (!inicial || dataISO >= inicial)
        && (!final || dataISO <= final);
    });

    render();
  }

  function render(){
    if(els.centralStatusCarregamento){
      els.centralStatusCarregamento.textContent = `${state.filtrados.length} pedido(s)`;
    }

    if(!els.centralPedidosTbody) return;

    if(!state.filtrados.length){
      els.centralPedidosTbody.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="central-empty">
              Nenhum pedido encontrado. Use "Novo Pedido" para montar um evento.
            </div>
          </td>
        </tr>
      `;
      return;
    }

    els.centralPedidosTbody.innerHTML = state.filtrados.map((pedido) => `
      <tr data-pedido-id="${escapeHtml(pedido.id)}">
        <td><button type="button" class="pedido-numero-link" data-action="abrir">${escapeHtml(pedido.numero)}</button></td>
        <td>${escapeHtml(pedido.cliente)}</td>
        <td>${escapeHtml(pedido.evento)}</td>
        <td>${escapeHtml(pedido.local)}</td>
        <td>${escapeHtml(formatDate(pedido.data))}</td>
        <td><span class="status-pill ${escapeHtml(pedido.status)}">${escapeHtml(pedido.status)}</span></td>
        <td>${formatCurrency(pedido.valor)}</td>
        <td>${escapeHtml(pedido.comercial)}</td>
        <td>
          <div class="central-actions">
            <button type="button" data-action="abrir">Visualizar</button>
            <button type="button" data-action="abrir">Editar</button>
            <button type="button" data-action="duplicar">Duplicar</button>
            <button type="button" data-action="imprimir">Imprimir</button>
            <button type="button" data-action="contrato">Contrato</button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  async function carregarPedidos(){
    if(els.centralStatusCarregamento) els.centralStatusCarregamento.textContent = "Carregando...";

    if(!state.supabase || !state.empresaId){
      state.pedidos = [];
      state.filtrados = [];
      render();
      window.finalizarCarregamentoModulo?.();
      return;
    }

    if(tabelasSeparacaoAusentes()){
      state.pedidos = [];
      state.filtrados = [];
      if(els.centralStatusCarregamento){
        els.centralStatusCarregamento.textContent = "Tabela de pedidos indisponivel";
      }
      render();
      window.finalizarCarregamentoModulo?.();
      return;
    }

    try{
      const { data:{ session } } = await state.supabase.auth.getSession();
      if(!session?.access_token){
        console.warn("[EasyLoc Debug]", {
          arquivo: "Modulos/Comercial/Pedidos/CentralPedidos.js",
          funcao: "carregarPedidos",
          tabela: "separacoes_pedidos",
          causa: "Sessao ausente/expirada antes da consulta"
        });
        throw new Error("Sessao ausente para carregar pedidos");
      }

      const { data, error } = await state.supabase
        .from("separacoes_pedidos")
        .select("*")
        .eq("empresa_id", state.empresaId)
        .order("data_hora", { ascending: false })
        .limit(200);

      if(error){
        console.warn("[EasyLoc Debug]", {
          arquivo: "Modulos/Comercial/Pedidos/CentralPedidos.js",
          funcao: "carregarPedidos",
          tabela: "separacoes_pedidos",
          empresaId: state.empresaId,
          erro: error
        });
        if(isTabelaAusente(error)) marcarTabelasSeparacaoAusentes();
        throw error;
      }
      state.pedidos = (data || []).map(normalizarPedido);
    }catch(err){
      console.warn("Central de Pedidos sem tabela de pedidos disponivel:", err);
      state.pedidos = [];
      if(els.centralStatusCarregamento){
        els.centralStatusCarregamento.textContent = "Tabela de pedidos indisponivel";
      }
    }

    aplicarFiltros();
    window.finalizarCarregamentoModulo?.();
  }

  function bindEvents(){
    els.btnNovoPedidoCentral?.addEventListener("click", () => abrirPedido());
    els.btnAtualizarPedidos?.addEventListener("click", carregarPedidos);

    [
      els.filtroClientePedido,
      els.filtroNumeroPedido,
      els.filtroLocalPedido,
      els.filtroComercialPedido,
      els.filtroStatusPedido,
      els.filtroDataInicialPedido,
      els.filtroDataFinalPedido
    ].forEach((el) => {
      el?.addEventListener("input", aplicarFiltros);
      el?.addEventListener("change", aplicarFiltros);
    });

    els.centralPedidosTbody?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if(!button) return;

      const row = button.closest("[data-pedido-id]");
      const pedidoId = row?.dataset?.pedidoId || "";
      const action = button.dataset.action;

      if(action === "abrir"){
        abrirPedido(pedidoId);
        return;
      }

      if(action === "duplicar"){
        avisar("Duplicacao pronta para receber persistencia do pedido selecionado.", "Duplicar", "info");
        return;
      }

      if(action === "imprimir"){
        avisar("Abra o pedido para imprimir com todos os detalhes.", "Imprimir", "info");
        return;
      }

      if(action === "contrato"){
        abrirPedido(pedidoId);
      }
    });
  }

  async function init(){
    cacheEls();
    state.supabase = window.supabaseClient;
    state.empresaId = window.__CONTEXT?.empresa_id;
    bindEvents();
    await carregarPedidos();
  }

  function destroy(){
    delete window.__centralPedidosLoaded;
  }

  window.__moduleInit = async function initCentralPedidos(){
    if(window.__centralPedidosLoaded) return;
    window.__centralPedidosLoaded = true;
    await init();
  };

  window.__activeModuleDestroy = destroy;
})();
