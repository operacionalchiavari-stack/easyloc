(function () {
  "use strict";

  const state = {
    itens: [],
    patrimonios: [],
    reservas: [],
    rows: [],
    page: 1,
    perPage: 20,
    initialized: false
  };

  const sb = () => window.supabaseClient || window.supabase;
  const empresaId = () => window.__CONTEXT?.empresa_id || window.empresa_id || null;
  const $ = (selector, root = document) => root.querySelector(selector);

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function number(value) {
    return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }

  function formatDate(value) {
    if (!value) return "-";
    const iso = String(value).slice(0, 10);
    const date = new Date(`${iso}T00:00:00`);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR");
  }

  function statusLabel(status) {
    return {
      disponivel: "Disponivel",
      atencao: "Atencao",
      indisponivel: "Indisponivel"
    }[status] || status;
  }

  function itemPhoto(item) {
    return item.foto_url
      || item.imagem_url
      || item.foto
      || item.url_foto
      || item.image_url
      || "";
  }

  async function getRows(table, select = "*") {
    if (!sb()) return [];
    let query = sb().from(table).select(select);
    if (empresaId()) query = query.eq("empresa_id", empresaId());
    const { data, error } = await query;
    if (error) {
      console.warn(`[Disponibilidade] ${table}:`, error);
      return [];
    }
    return data || [];
  }

  async function loadAll() {
    state.itens = await getRows("itens", "*");
    state.patrimonios = await getRows("itens_patrimonios", "*");
    state.reservas = await loadReservas();
    fillCategories();
    buildRows();
    render();
  }

  async function loadReservas() {
    if (!sb()) return [];
    let query = sb()
      .from("separacoes_itens")
      .select(`
        item_id,
        quantidade_solicitada,
        separacoes_pedidos(
          id,
          numero_pedido,
          cliente_nome,
          tipo_evento,
          local_nome,
          data_hora,
          data_evento,
          data_entrega,
          data_coleta,
          status,
          status_comercial
        )
      `);
    if (empresaId()) query = query.eq("empresa_id", empresaId());
    const { data, error } = await query;
    if (error) {
      console.warn("[Disponibilidade] reservas indisponiveis:", error);
      return [];
    }
    return data || [];
  }

  function selectedDate() {
    return $("#disponData")?.value || new Date().toISOString().slice(0, 10);
  }

  function sameDay(value, target) {
    if (!value || !target) return false;
    return String(value).slice(0, 10) === target;
  }

  function dateInPedidoRange(pedido, target) {
    if (!pedido || !target) return false;
    const inicio = String(pedido.data_entrega || pedido.data_evento || pedido.data_hora || "").slice(0, 10);
    const fim = String(pedido.data_coleta || pedido.data_evento || pedido.data_hora || "").slice(0, 10);
    if (inicio && fim) return target >= inicio && target <= fim;
    return sameDay(pedido.data_evento || pedido.data_hora, target);
  }

  function isReservaAtiva(row) {
    const pedido = row.separacoes_pedidos || {};
    const status = normalize(pedido.status);
    const comercial = normalize(pedido.status_comercial);

    if (comercial === "cancelado" || status === "cancelado") return false;
    if (comercial === "orcamento") return false;
    return true;
  }

  function reservasDoItemNaData(itemId, data = selectedDate()) {
    return state.reservas
      .filter((row) => row.item_id === itemId)
      .filter(isReservaAtiva)
      .filter((row) => dateInPedidoRange(row.separacoes_pedidos, data));
  }

  function totalItem(item) {
    const patrimonioTotal = state.patrimonios.filter((p) => p.item_id === item.id && p.status !== "inativo").length;
    return Number(item.estoque_total || item.quantidade_total || item.quantidade || item.estoque || patrimonioTotal || 0);
  }

  function manutencaoItem(item) {
    const patrimonioManutencao = state.patrimonios.filter((p) => p.item_id === item.id && p.status === "manutencao").length;
    return Number(item.estoque_manutencao || item.quantidade_manutencao || patrimonioManutencao || 0);
  }

  function reservadoItem(item, data) {
    return reservasDoItemNaData(item.id, data)
      .reduce((sum, row) => sum + Number(row.quantidade_solicitada || 0), 0);
  }

  function calcularItem(item, data = selectedDate()) {
    const total = totalItem(item);
    const reservado = reservadoItem(item, data);
    const manutencao = manutencaoItem(item);
    const disponivel = Math.max(0, total - reservado - manutencao);
    const status = disponivel <= 0 ? "indisponivel" : disponivel <= Math.max(1, total * 0.2) ? "atencao" : "disponivel";
    return { total, reservado, manutencao, disponivel, status };
  }

  function buildRows() {
    const data = selectedDate();
    state.rows = state.itens.map((item) => ({
      item,
      ...calcularItem(item, data)
    }));
  }

  function fillCategories() {
    const select = $("#disponCategoria");
    if (!select || select.dataset.ready) return;
    const categories = [...new Set(state.itens.map((item) => item.categoria).filter(Boolean))].sort();
    select.innerHTML = `<option value="">Todas</option>` + categories.map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join("");
    select.dataset.ready = "true";
  }

  function filteredRows() {
    const term = normalize($("#disponBusca")?.value);
    const category = $("#disponCategoria")?.value || "";
    const status = $("#disponStatus")?.value || "";
    return state.rows.filter((row) => {
      const item = row.item;
      const haystack = normalize([item.codigo, item.produto, item.descricao_total, item.categoria, item.setor_estoque].join(" "));
      return (!term || haystack.includes(term))
        && (!category || item.categoria === category)
        && (!status || row.status === status);
    });
  }

  function currentPageRows(rows) {
    const totalPages = Math.max(1, Math.ceil(rows.length / state.perPage));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const start = (state.page - 1) * state.perPage;
    return rows.slice(start, start + state.perPage);
  }

  function renderPagination(rows) {
    const root = $("#disponPaginacao");
    if (!root) return;

    const totalPages = Math.max(1, Math.ceil(rows.length / state.perPage));
    const start = rows.length ? ((state.page - 1) * state.perPage) + 1 : 0;
    const end = Math.min(rows.length, state.page * state.perPage);

    root.innerHTML = `
      <span>Mostrando ${start} a ${end} de ${rows.length} itens</span>
      <div class="dispon-page-buttons">
        <button type="button" data-page="${state.page - 1}" ${state.page <= 1 ? "disabled" : ""}>&lt;</button>
        ${Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => `
          <button type="button" data-page="${page}" class="${page === state.page ? "active" : ""}">${page}</button>
        `).join("")}
        <button type="button" data-page="${state.page + 1}" ${state.page >= totalPages ? "disabled" : ""}>&gt;</button>
      </div>
    `;
  }

  function render() {
    buildRows();
    const rows = filteredRows();
    const pageRows = currentPageRows(rows);
    const totalItens = rows.length;
    const totalPecas = rows.reduce((sum, row) => sum + row.total, 0);
    const disponiveis = rows.reduce((sum, row) => sum + row.disponivel, 0);
    const reservadas = rows.reduce((sum, row) => sum + row.reservado, 0);
    const manutencao = rows.reduce((sum, row) => sum + row.manutencao, 0);

    $("#disponKpis").innerHTML = [
      ["Itens analisados", totalItens],
      ["Pecas totais", number(totalPecas)],
      ["Disponiveis", number(disponiveis)],
      ["Reservadas", number(reservadas)],
      ["Manutencao", number(manutencao)]
    ].map(([label, value]) => `
      <div class="dispon-kpi">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `).join("");

    $("#disponTabela").innerHTML = pageRows.map((row) => {
      const item = row.item;
      const photo = itemPhoto(item);
      const itemName = item.descricao_total || item.produto || "-";
      return `
        <tr class="dispon-row" data-item-id="${escapeHtml(item.id)}">
          <td>
            <div class="dispon-photo">
              ${photo
                ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(itemName)}" loading="lazy">`
                : `<span>Sem foto</span>`
              }
            </div>
          </td>
          <td>
            <button type="button" class="dispon-item-link" data-item-id="${escapeHtml(item.id)}">
              <span class="dispon-item-name">${escapeHtml(itemName)}</span>
              <span class="dispon-item-code">${escapeHtml(item.codigo || "-")} - ${escapeHtml(item.tipo || "Item")}</span>
            </button>
          </td>
          <td>${escapeHtml(item.categoria || "-")}</td>
          <td>${number(row.total)}</td>
          <td>${number(row.reservado)}</td>
          <td>${number(row.manutencao)}</td>
          <td><strong>${number(row.disponivel)}</strong></td>
          <td><span class="dispon-badge ${row.status}">${statusLabel(row.status)}</span></td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="8" class="dispon-empty">Nenhum item encontrado.</td></tr>`;

    renderPagination(rows);
  }

  function abrirModalReservas(itemId) {
    const item = state.itens.find((row) => row.id === itemId);
    if (!item) return;

    const modal = $("#disponReservasModal");
    const titulo = $("#disponReservasTitulo");
    const tbody = $("#disponReservasTbody");
    const reservas = reservasDoItemNaData(itemId);

    if (titulo) {
      titulo.textContent = item.descricao_total || item.produto || "Locacoes na data";
    }

    if (tbody) {
      tbody.innerHTML = reservas.length
        ? reservas.map((row) => {
          const pedido = row.separacoes_pedidos || {};
          return `
            <tr>
              <td>#${escapeHtml(pedido.numero_pedido || "-")}</td>
              <td>${escapeHtml(pedido.cliente_nome || "-")}</td>
              <td>${escapeHtml(pedido.tipo_evento || "-")}</td>
              <td>${escapeHtml(pedido.local_nome || "-")}</td>
              <td>${formatDate(pedido.data_entrega || pedido.data_evento || pedido.data_hora)} a ${formatDate(pedido.data_coleta || pedido.data_evento || pedido.data_hora)}</td>
              <td>${number(row.quantidade_solicitada)}</td>
              <td><span class="dispon-badge atencao">${escapeHtml(pedido.status_comercial || pedido.status || "-")}</span></td>
            </tr>
          `;
        }).join("")
        : `<tr><td colspan="7" class="dispon-empty">Nenhum pedido ativo usando este item nesta data.</td></tr>`;
    }

    modal?.classList.remove("hidden");
    modal?.setAttribute("aria-hidden", "false");
  }

  async function calcularDisponibilidade(itemId, data) {
    if (!state.itens.length) await loadAll();
    const item = state.itens.find((row) => row.id === itemId);
    if (!item) return null;
    return calcularItem(item, data);
  }

  function resetPageAndRender() {
    state.page = 1;
    render();
  }

  function bindEvents() {
    $("#btnDisponAtualizar")?.addEventListener("click", loadAll);
    ["disponData", "disponBusca", "disponCategoria", "disponStatus"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", resetPageAndRender);
      document.getElementById(id)?.addEventListener("change", resetPageAndRender);
    });

    $("#disponPaginacao")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button || button.disabled) return;
      state.page = Number(button.dataset.page || 1);
      render();
    });

    $("#disponTabela")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-item-id]");
      if (!button) return;
      abrirModalReservas(button.dataset.itemId);
    });

    $("#btnFecharReservasItem")?.addEventListener("click", () => {
      $("#disponReservasModal")?.classList.add("hidden");
      $("#disponReservasModal")?.setAttribute("aria-hidden", "true");
    });

    $("#disponReservasModal")?.addEventListener("click", (event) => {
      if (event.target === $("#disponReservasModal")) {
        $("#disponReservasModal")?.classList.add("hidden");
        $("#disponReservasModal")?.setAttribute("aria-hidden", "true");
      }
    });
  }

  function initDisponibilidade() {
    if (state.initialized) return;
    state.initialized = true;
    const inputDate = $("#disponData");
    if (inputDate && !inputDate.value) inputDate.value = new Date().toISOString().slice(0, 10);
    bindEvents();
    loadAll().finally(() => window.finalizarCarregamentoModulo?.());
  }

  function destroyDisponibilidade() {
    state.initialized = false;
  }

  window.EasyLocDisponibilidade = {
    calcular: calcularDisponibilidade,
    recarregar: loadAll
  };
  window.__moduleInit = initDisponibilidade;
  window.__activeModuleDestroy = destroyDisponibilidade;
})();
