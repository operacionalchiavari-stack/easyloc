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
      "centralPedidosTbody",
      "centralPedidoPreviewModal",
      "centralPedidoPreviewBody",
      "centralPreviewTitulo",
      "btnFecharPreviewPedido",
      "btnImprimirPreviewPedido"
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

  function abrirPedido(pedidoId = "", modo = "editar"){
    if(typeof window.carregarNaMain === "function"){
      const suffix = pedidoId ? `?pedido=${encodeURIComponent(pedidoId)}` : "";
      window.__PEDIDO_ATUAL_ID = pedidoId || null;
      window.__PEDIDO_MODO_ABERTURA = modo;
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
      status: row.status_comercial || row.status || "orcamento",
      valor: Number(row.valor_total || row.total || row.valor || 0),
      comercial: row.comercial_nome || row.comercial || row.responsavel || "-"
    };
  }

  function dataBR(value){
    if(!value) return "-";
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR");
  }

  function getEnderecoPedido(pedido){
    const html = pedido.observacoes?.local_html || "";
    if(!html) return "-";
    const temp = document.createElement("div");
    temp.innerHTML = html;
    return temp.innerText.replace(/\s+/g, " ").trim() || "-";
  }

  function getTagsPedido(pedido){
    const html = pedido.observacoes?.local_tags_html || "";
    if(!html) return [];
    const temp = document.createElement("div");
    temp.innerHTML = html;
    return Array.from(temp.querySelectorAll("*"))
      .map((el) => el.textContent.trim())
      .filter(Boolean);
  }

  async function abrirPreviewPedido(pedidoId){
    if(!pedidoId || !state.supabase || !state.empresaId) return;

    const { data: pedido, error } = await state.supabase
      .from("separacoes_pedidos")
      .select("*")
      .eq("empresa_id", state.empresaId)
      .eq("id", pedidoId)
      .single();

    if(error || !pedido){
      avisar("Nao foi possivel abrir a visualizacao do pedido.", "Visualizar", "erro");
      return;
    }

    const { data: itens, error: itensError } = await state.supabase
      .from("separacoes_itens")
      .select("*, itens:item_id(codigo,produto,descricao_total,foto_url,valor_locacao,valor_reposicao)")
      .eq("empresa_id", state.empresaId)
      .eq("separacao_pedido_id", pedidoId)
      .order("created_at", { ascending: true });

    if(itensError){
      console.warn("Erro ao carregar itens do preview:", itensError);
    }

    const parcelas = Array.isArray(pedido.observacoes?.parcelas_financeiras)
      ? pedido.observacoes.parcelas_financeiras
      : [];

    const { data: empresa } = await state.supabase
      .from("empresas")
      .select("nome,logo_url")
      .eq("id", state.empresaId)
      .maybeSingle();

    const itensRows = (itens || []).map((item) => {
      const cadastro = item.itens || {};
      const nome = item.item_nome || cadastro.descricao_total || cadastro.produto || "Item";
      const qtd = Number(item.quantidade_solicitada || 0);
      const unit = Number(cadastro.valor_locacao || 0);
      const total = qtd * unit;
      return `
        <tr>
          <td>${qtd}</td>
          <td>${item.foto_url || cadastro.foto_url ? `<img src="${escapeHtml(item.foto_url || cadastro.foto_url)}">` : ""}</td>
          <td><strong>${escapeHtml(nome)}</strong><small>${escapeHtml(item.codigo_item || cadastro.codigo || "")}</small></td>
          <td>${formatCurrency(unit)}</td>
          <td>${formatCurrency(total)}</td>
          <td>${formatCurrency(cadastro.valor_reposicao || 0)}</td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="6" class="empty">Nenhum item salvo neste pedido.</td></tr>`;

    const parcelasRows = parcelas.map((parcela, index) => `
      <tr>
        <td>${parcela.numero || index + 1}</td>
        <td>${escapeHtml(parcela.tipo || `Parcela ${index + 1}`)}</td>
        <td>${dataBR(parcela.vencimento)}</td>
        <td>${formatCurrency(parcela.valor || 0)}</td>
        <td>${escapeHtml(parcela.metodo || "A combinar")}</td>
        <td><span class="badge-ok">${escapeHtml(parcela.status || "Programado")}</span></td>
      </tr>
    `).join("") || `<tr><td colspan="6" class="empty">Programacao de pagamento nao informada.</td></tr>`;

    if(els.centralPreviewTitulo){
      els.centralPreviewTitulo.textContent = `Pedido #${pedido.numero_pedido || "-"}`;
    }

    if(els.centralPedidoPreviewBody){
      const tags = getTagsPedido(pedido);
      const endereco = getEnderecoPedido(pedido);
      const logo = empresa?.logo_url
        ? `<img class="preview-logo" src="${escapeHtml(empresa.logo_url)}" alt="${escapeHtml(empresa.nome || "Logo")}">`
        : `<div class="preview-logo-fallback">${escapeHtml(empresa?.nome || "EasyLoc")}</div>`;

      els.centralPedidoPreviewBody.innerHTML = `
        <main class="preview-page">
          <header class="preview-hero">
            <div class="preview-brand">
              ${logo}
              <div>
                <h1>Proposta comercial</h1>
                <p>Locacao de mobiliario e decoracao de eventos.</p>
              </div>
            </div>
            <div class="preview-pedido-box">
              <span>Pedido</span>
              <strong>#${escapeHtml(pedido.numero_pedido || "-")}</strong>
              <em>${escapeHtml(pedido.status_comercial || pedido.status || "orcamento")}</em>
            </div>
          </header>
          <section class="preview-section">
            <div class="preview-section-title">
              <h2>Dados do evento</h2>
              <span>${new Date().toLocaleDateString("pt-BR")}</span>
            </div>
          <div class="preview-grid">
            <div><span>Cliente</span><strong>${escapeHtml(pedido.cliente_nome || "-")}</strong></div>
            <div><span>Contato</span><strong>${escapeHtml(pedido.contato_cliente || "-")}</strong></div>
            <div><span>Evento</span><strong>${escapeHtml(pedido.tipo_evento || "-")}</strong></div>
            <div><span>Data do evento</span><strong>${dataBR(pedido.data_evento || pedido.data_hora)}</strong></div>
            <div><span>Entrega / Coleta</span><strong>${dataBR(pedido.data_entrega)} / ${dataBR(pedido.data_coleta)}</strong></div>
            <div class="wide"><span>Local</span><strong>${escapeHtml(pedido.local_nome || "-")}</strong></div>
            <div class="wide"><span>Endereco e referencia</span><strong>${escapeHtml(endereco)}</strong></div>
          </div>
            ${tags.length ? `<div class="preview-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
          </section>
          <section class="preview-section">
            <h2>Itens do pedido</h2>
            <table><thead><tr><th>Qtd</th><th>Foto</th><th>Item</th><th>Locacao</th><th>Total</th><th>Reposicao</th></tr></thead><tbody>${itensRows}</tbody></table>
          </section>
          <section class="preview-finance preview-section">
            <div>
              <h2>Programacao de pagamento</h2>
              <table><thead><tr><th>#</th><th>Tipo</th><th>Vencimento</th><th>Valor</th><th>Metodo</th><th>Status</th></tr></thead><tbody>${parcelasRows}</tbody></table>
            </div>
            <div>
              <h2>Resumo financeiro</h2>
              <div class="preview-total"><span>Total do pedido</span><strong>${formatCurrency(pedido.valor_total || 0)}</strong></div>
            </div>
          </section>
        </main>
      `;
    }

    els.centralPedidoPreviewModal?.classList.remove("hidden");
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
        <td><button type="button" class="pedido-numero-link" data-action="editar">${escapeHtml(pedido.numero)}</button></td>
        <td>${escapeHtml(pedido.cliente)}</td>
        <td>${escapeHtml(pedido.evento)}</td>
        <td>${escapeHtml(pedido.local)}</td>
        <td>${escapeHtml(formatDate(pedido.data))}</td>
        <td><span class="status-pill ${escapeHtml(pedido.status)}">${escapeHtml(pedido.status)}</span></td>
        <td>${formatCurrency(pedido.valor)}</td>
        <td>${escapeHtml(pedido.comercial)}</td>
        <td>
          <div class="central-actions">
            <button type="button" data-action="visualizar">Visualizar</button>
            <button type="button" data-action="editar">Editar</button>
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
    els.btnFecharPreviewPedido?.addEventListener("click", () => {
      els.centralPedidoPreviewModal?.classList.add("hidden");
    });
    els.btnImprimirPreviewPedido?.addEventListener("click", () => {
      window.print();
    });
    els.centralPedidoPreviewModal?.addEventListener("click", (event) => {
      if(event.target === els.centralPedidoPreviewModal){
        els.centralPedidoPreviewModal.classList.add("hidden");
      }
    });

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

      if(action === "editar"){
        abrirPedido(pedidoId, "editar");
        return;
      }

      if(action === "visualizar"){
        abrirPreviewPedido(pedidoId);
        return;
      }

      if(action === "duplicar"){
        avisar("Duplicacao pronta para receber persistencia do pedido selecionado.", "Duplicar", "info");
        return;
      }

      if(action === "imprimir"){
        abrirPreviewPedido(pedidoId);
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
