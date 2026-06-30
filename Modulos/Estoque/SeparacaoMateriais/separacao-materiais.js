(function () {
  const TABLES = {
    pedidos: "separacoes_pedidos",
    itens: "separacoes_itens",
    leituras: "separacoes_leituras",
    patrimonios: "itens_patrimonios",
    config: "configuracoes_separacao",
    cadastroItens: "itens"
  };

  const STATUS_EM_ANDAMENTO = new Set(["em_separacao", "pausado"]);
  const STATUS_FINALIZADO = new Set(["separado", "separado_com_divergencia"]);

  const state = {
    supabase: null,
    empresaId: null,
    usuarioId: null,
    usuarioNome: null,
    pedidos: [],
    pedidosFiltrados: [],
    itens: [],
    leituras: [],
    regrasLogistica: {
      separacao_dias_antes_evento: 2
    },
    pedidoAtualId: null,
    activeMode: null,
    scanBuffer: "",
    scanTimer: null,
    keyHandler: null,
    dbReady: true
  };

  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cacheEls() {
    [
      "btnAtualizarSeparacao",
      "separacaoBuscaPedido",
      "separacaoStatusFiltro",
      "separacaoKanban",
      "separacaoColunaAguardando",
      "separacaoColunaEmSeparacao",
      "separacaoColunaSeparados",
      "separacaoLaneAguardandoCount",
      "separacaoLaneEmSeparacaoCount",
      "separacaoLaneSeparadosCount",
      "separacaoModoModal",
      "btnFecharModoSeparacao",
      "separacaoModoTitulo",
      "separacaoModoMeta",
      "separacaoManualModal",
      "btnFecharManualSeparacao",
      "btnCancelarManualSeparacao",
      "btnSalvarManualSeparacao",
      "separacaoManualTitulo",
      "separacaoManualMeta",
      "separacaoManualPercent",
      "separacaoManualBar",
      "separacaoManualQtd",
      "separacaoManualFaltante",
      "separacaoManualItens",
      "separacaoQrModal",
      "btnFecharQrSeparacao",
      "btnCancelarQrSeparacao",
      "separacaoQrTitulo",
      "separacaoQrMeta",
      "separacaoQrPercent",
      "separacaoQrBar",
      "separacaoQrQtd",
      "separacaoQrFaltante",
      "separacaoQrItens",
      "scannerDot",
      "scannerStatus",
      "scannerInput",
      "lastReadCard",
      "lastReadItem",
      "lastReadCode",
      "lastReadQty",
      "lastReadTime",
      "btnFinalizarSeparacao",
      "separacaoHistorico",
      "separacaoUmCliqueModal",
      "btnFecharUmCliqueSeparacao",
      "btnCancelarUmCliqueSeparacao",
      "btnConfirmarUmCliqueSeparacao",
      "separacaoUmCliqueTitulo",
      "separacaoUmCliqueMeta"
    ].forEach((id) => {
      els[id] = $(id);
    });
  }

  function avisar(mensagem, titulo = "Atencao", tipo = "aviso") {
    if (typeof window.alerta === "function") {
      window.alerta(mensagem, titulo, tipo);
      return;
    }

    alert(mensagem);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setupState(message) {
    state.dbReady = false;
    const html = `
      <div class="empty-state setup-state">
        ${escapeHtml(message)}
      </div>
    `;
    [
      els.separacaoColunaAguardando,
      els.separacaoColunaEmSeparacao,
      els.separacaoColunaSeparados,
      els.separacaoManualItens,
      els.separacaoQrItens
    ].forEach((container) => {
      if (container) container.innerHTML = html;
    });
    window.finalizarCarregamentoModulo?.();
  }

  function isTabelaAusente(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    return code === "42P01" || /does not exist|schema cache|could not find/i.test(message);
  }

  function formatDateTime(value) {
    if (!value) return "Sem data";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Sem data";
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function formatDateOnly(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("pt-BR");
  }

  function formatQty(value) {
    const number = Number(value || 0);
    if (Number.isInteger(number)) return String(number);
    return number.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }

  function statusClass(status) {
    if (status === "em_separacao") return "em-separacao";
    if (status === "separado_com_divergencia") return "divergencia";
    return status || "pendente";
  }

  function getPedidoAtual() {
    return state.pedidos.find((pedido) => String(pedido.id) === String(state.pedidoAtualId)) || null;
  }

  function itemTotal(item) {
    return Number(item?.quantidade_solicitada || 0);
  }

  function itemSeparado(item) {
    return Number(item?.quantidade_separada || 0);
  }

  function itemFaltante(item) {
    return Math.max(itemTotal(item) - itemSeparado(item), 0);
  }

  function itemPercent(item) {
    const total = itemTotal(item);
    if (!total) return 0;
    return Math.min(Math.round((itemSeparado(item) / total) * 100), 100);
  }

  function pedidoResumo(pedidoId = state.pedidoAtualId) {
    const itens = state.itens.filter((item) => String(item.separacao_pedido_id) === String(pedidoId));
    const total = itens.reduce((acc, item) => acc + itemTotal(item), 0);
    const separado = itens.reduce((acc, item) => acc + itemSeparado(item), 0);
    const faltante = Math.max(total - separado, 0);
    const percent = total ? Math.min(Math.round((separado / total) * 100), 100) : 0;
    return { total, separado, faltante, percent, itensCount: itens.length };
  }

  function pedidoLocal(pedido) {
    return pedido?.local_nome || pedido?.local_evento || pedido?.local || pedido?.endereco_local || "-";
  }

  function pedidoSetor(pedido) {
    const setores = state.itens
      .filter((item) => String(item.separacao_pedido_id) === String(pedido?.id))
      .map((item) => item.setor_estoque || item.itens?.setor_estoque || item.localizacao)
      .filter(Boolean);
    return [...new Set(setores)][0] || pedido?.setor || "Estoque";
  }

  function parseDataPedido(value) {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      const date = new Date(`${value}T00:00:00`);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function normalizarStatusComercial(status) {
    return String(status || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_");
  }

  function diasAteEvento(pedido) {
    const dataEvento = parseDataPedido(pedido?.data_evento || pedido?.data_hora || pedido?.data_entrega);
    if (!dataEvento) return null;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return Math.ceil((dataEvento.getTime() - hoje.getTime()) / 86400000);
  }

  function regraSeparacaoPedido(pedido) {
    if (!pedido) {
      return { liberado: false, motivo: "Selecione um pedido para iniciar a separacao." };
    }

    const statusComercial = normalizarStatusComercial(pedido.status_comercial);
    if (statusComercial !== "aprovado") {
      return {
        liberado: false,
        motivo: "Pedido em pre reserva. A equipe pode visualizar, mas a separacao fica bloqueada ate a aprovacao comercial."
      };
    }

    const diasLiberacao = Number(state.regrasLogistica?.separacao_dias_antes_evento ?? 2);
    const diferencaDias = diasAteEvento(pedido);
    if (diferencaDias !== null && diferencaDias > diasLiberacao) {
      return {
        liberado: false,
        motivo: `Separacao liberada somente ${diasLiberacao} dia(s) antes do evento. Faltam ${diferencaDias} dia(s).`
      };
    }

    return { liberado: true, motivo: "Separacao liberada." };
  }

  function separacaoLiberada(pedido = getPedidoAtual()) {
    return regraSeparacaoPedido(pedido).liberado;
  }

  function pedidoOperavel(pedido = getPedidoAtual()) {
    return Boolean(pedido && separacaoLiberada(pedido) && !STATUS_FINALIZADO.has(pedido.status));
  }

  function modoEditavel() {
    return state.activeMode !== "resumo" && pedidoOperavel();
  }

  function avisarSeparacaoBloqueada(pedido = getPedidoAtual()) {
    avisar(regraSeparacaoPedido(pedido).motivo, "Separacao bloqueada", "aviso");
  }

  function modalAberto(element) {
    return Boolean(element && !element.classList.contains("hidden"));
  }

  function modalSeparacaoAberto() {
    return [
      els.separacaoModoModal,
      els.separacaoManualModal,
      els.separacaoQrModal,
      els.separacaoUmCliqueModal
    ].some(modalAberto);
  }

  function modalQrAberto() {
    return modalAberto(els.separacaoQrModal);
  }

  function abrirModal(element, focusScanner = false) {
    if (!element) return;
    element.classList.remove("hidden");
    element.setAttribute("aria-hidden", "false");
    document.body.classList.add("separacao-modal-open");
    if (window.lucide) lucide.createIcons();
    if (focusScanner) setTimeout(() => focarLeitor(), 80);
  }

  function fecharModal(element) {
    if (!element) return;
    element.classList.add("hidden");
    element.setAttribute("aria-hidden", "true");
    if (!modalSeparacaoAberto()) {
      document.body.classList.remove("separacao-modal-open");
      state.activeMode = null;
    }
  }

  function fecharTodosModais() {
    [
      els.separacaoModoModal,
      els.separacaoManualModal,
      els.separacaoQrModal,
      els.separacaoUmCliqueModal
    ].forEach((modal) => {
      if (!modal) return;
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
    });
    document.body.classList.remove("separacao-modal-open");
    state.activeMode = null;
  }

  function atualizaTexto(el, text) {
    if (el) el.textContent = text;
  }

  function renderContadores(grupos) {
    const aguardando = grupos.aguardando.length;
    const emSeparacao = grupos.emSeparacao.length;
    const separados = grupos.separados.length;

    atualizaTexto(els.separacaoLaneAguardandoCount, aguardando);
    atualizaTexto(els.separacaoLaneEmSeparacaoCount, emSeparacao);
    atualizaTexto(els.separacaoLaneSeparadosCount, separados);
  }

  function pedidoCard(pedido, coluna) {
    const resumo = pedidoResumo(pedido.id);
    const regra = regraSeparacaoPedido(pedido);
    const numero = pedido.numero_pedido || "-";
    const numeroLabel = String(numero).startsWith("#") ? String(numero) : `#${numero}`;
    const cliente = pedido.cliente_nome || "Cliente nao informado";
    const evento = pedido.tipo_evento || "Evento";
    const data = formatDateOnly(pedido.data_evento || pedido.data_hora);
    const setor = pedidoSetor(pedido);
    const local = pedidoLocal(pedido);
    const qtdLabel = `${formatQty(resumo.total)} ${Number(resumo.total) === 1 ? "item" : "itens"}`;
    const progresso = `
      <div class="separacao-card-progress">
        <span>${resumo.percent}%</span>
        <div class="mini-progress"><span style="width:${resumo.percent}%"></span></div>
        <strong>${formatQty(resumo.separado)} / ${formatQty(resumo.total)}</strong>
      </div>
    `;

    let cardAction = "";
    if (coluna === "aguardando") {
      cardAction = regra.liberado ? "iniciar" : "resumo";
    } else if (coluna === "andamento") {
      cardAction = regra.liberado ? "modo" : "resumo";
    } else {
      cardAction = "resumo";
    }

    return `
      <article class="separacao-order-card" data-pedido-id="${escapeHtml(pedido.id)}" data-card-action="${escapeHtml(cardAction)}" data-clickable="true" data-coluna="${escapeHtml(coluna)}" tabindex="0">
        <div class="separacao-card-top">
          <span class="separacao-order-number">Pedido ${escapeHtml(numeroLabel)}</span>
          ${coluna === "separado" ? `<span class="separacao-done-mark"><i data-lucide="check"></i></span>` : ""}
        </div>
        <div class="separacao-card-mainline">
          <strong>${escapeHtml(cliente)}</strong>
          <span>${escapeHtml(evento)} &middot; ${escapeHtml(local)}</span>
        </div>
        <div class="separacao-card-meta-line">${escapeHtml(data)} &middot; ${escapeHtml(setor)} &middot; ${escapeHtml(qtdLabel)}</div>
        ${coluna === "andamento" ? progresso : ""}
        ${regra.liberado ? "" : `<div class="separacao-lock-note">${escapeHtml(regra.motivo)}</div>`}
      </article>
    `;
  }

  function renderColuna(container, pedidos, coluna) {
    if (!container) return;
    if (!pedidos.length) {
      const emptyText = coluna === "aguardando"
        ? "Nenhum pedido aguardando separacao."
        : coluna === "andamento"
          ? "Nenhum pedido em separacao."
          : "Nenhum pedido separado por enquanto.";
      container.innerHTML = `<div class="empty-state">${emptyText}</div>`;
      return;
    }

    container.innerHTML = pedidos.map((pedido) => pedidoCard(pedido, coluna)).join("");
  }

  function renderFila() {
    const termo = (els.separacaoBuscaPedido?.value || "").trim().toLowerCase();
    const status = els.separacaoStatusFiltro?.value || "";

    state.pedidosFiltrados = state.pedidos.filter((pedido) => {
      const texto = [
        pedido.numero_pedido,
        pedido.cliente_nome,
        pedido.tipo_evento,
        pedidoLocal(pedido),
        pedido.status,
        pedido.status_comercial
      ].join(" ").toLowerCase();

      return (!termo || texto.includes(termo)) && (!status || pedido.status === status);
    });

    const grupos = {
      aguardando: state.pedidosFiltrados.filter((pedido) => pedido.status === "pendente"),
      emSeparacao: state.pedidosFiltrados.filter((pedido) => STATUS_EM_ANDAMENTO.has(pedido.status)),
      separados: state.pedidosFiltrados.filter((pedido) => STATUS_FINALIZADO.has(pedido.status))
    };

    renderContadores(grupos);
    renderColuna(els.separacaoColunaAguardando, grupos.aguardando, "aguardando");
    renderColuna(els.separacaoColunaEmSeparacao, grupos.emSeparacao, "andamento");
    renderColuna(els.separacaoColunaSeparados, grupos.separados, "separado");

    if (window.lucide) lucide.createIcons();
  }

  function renderPedidoAtual() {
    const pedido = getPedidoAtual();
    if (!pedido) {
      atualizaTexto(els.separacaoModoTitulo, "Pedido selecionado");
      atualizaTexto(els.separacaoModoMeta, "Como deseja separar este pedido?");
      atualizaTexto(els.separacaoManualTitulo, "Pedido selecionado");
      atualizaTexto(els.separacaoManualMeta, "Ajuste as quantidades separadas de cada item.");
      atualizaTexto(els.separacaoQrTitulo, "Pedido selecionado");
      atualizaTexto(els.separacaoQrMeta, "Leia os codigos dos itens para confirmar a separacao.");
      atualizaTexto(els.separacaoUmCliqueMeta, "Tem certeza que deseja marcar todos os itens como separados?");
      renderProgress({ total: 0, separado: 0, faltante: 0, percent: 0 });
      renderItens();
      aplicarEstadoOperacaoPedido(null);
      return;
    }

    const titulo = `Pedido ${pedido.numero_pedido || "-"}`;
    const metaLimpo = [
      pedido.cliente_nome || "Cliente nao informado",
      pedido.tipo_evento || "Evento",
      pedidoLocal(pedido)
    ].join(" Â· ");
    atualizaTexto(els.separacaoModoTitulo, titulo);
    atualizaTexto(els.separacaoModoMeta, metaLimpo);
    atualizaTexto(els.separacaoManualTitulo, titulo);
    atualizaTexto(els.separacaoManualMeta, metaLimpo);
    atualizaTexto(els.separacaoQrTitulo, titulo);
    atualizaTexto(els.separacaoQrMeta, metaLimpo);
    atualizaTexto(els.separacaoUmCliqueTitulo, `Concluir ${titulo}?`);
    atualizaTexto(els.separacaoUmCliqueMeta, `Marcar todos os itens do pedido ${pedido.numero_pedido || "-"} como separados.`);

    renderProgress(pedidoResumo(pedido.id));
    renderItens();
    aplicarEstadoOperacaoPedido(pedido);
  }

  function renderProgress(resumo) {
    [
      ["Manual", els.separacaoManualPercent, els.separacaoManualBar, els.separacaoManualQtd, els.separacaoManualFaltante],
      ["Qr", els.separacaoQrPercent, els.separacaoQrBar, els.separacaoQrQtd, els.separacaoQrFaltante]
    ].forEach(([, percentEl, barEl, qtdEl, faltanteEl]) => {
      atualizaTexto(percentEl, `${resumo.percent}%`);
      if (barEl) barEl.style.width = `${resumo.percent}%`;
      atualizaTexto(qtdEl, `${formatQty(resumo.separado)} / ${formatQty(resumo.total)} separados`);
      atualizaTexto(faltanteEl, `${formatQty(resumo.faltante)} faltantes`);
    });
  }

  function aplicarEstadoOperacaoPedido(pedido) {
    const regra = regraSeparacaoPedido(pedido);
    const editavel = modoEditavel();

    [els.separacaoManualModal, els.separacaoQrModal].forEach((modal) => {
      modal?.classList.toggle("separacao-readonly", !editavel);
    });

    if (els.scannerInput) {
      els.scannerInput.disabled = !editavel;
      els.scannerInput.placeholder = editavel
        ? "Passe o codigo de barras"
        : regra.motivo || "Separacao bloqueada";
    }

    if (els.btnFinalizarSeparacao) els.btnFinalizarSeparacao.disabled = !editavel;
    if (els.btnSalvarManualSeparacao) {
      els.btnSalvarManualSeparacao.disabled = !editavel;
      els.btnSalvarManualSeparacao.style.display = state.activeMode === "resumo" ? "none" : "";
    }
    if (els.btnConfirmarUmCliqueSeparacao) els.btnConfirmarUmCliqueSeparacao.disabled = !editavel;

    if (!editavel) setScannerStatus("Somente visualizacao", "waiting");
    return regra;
  }

  function itemPhotoHtml(item, nome) {
    const cadastro = item.itens || {};
    const foto = item.foto_url || cadastro.foto_url;
    return foto
      ? `<img src="${escapeHtml(foto)}" alt="${escapeHtml(nome)}">`
      : `<i data-lucide="package"></i>`;
  }

  function itemBaseInfo(item) {
    const cadastro = item.itens || {};
    const nome = nomeItemSeparacao(item);
    const codigo = item.codigo_item || cadastro.codigo || "";
    const localizacao = item.localizacao || cadastro.setor_estoque || "";
    return { cadastro, nome, codigo, localizacao };
  }

  function renderManualItem(item, editavel) {
    const { nome, codigo, localizacao } = itemBaseInfo(item);
    const total = itemTotal(item);
    const separado = itemSeparado(item);

    return `
      <article class="item-card" data-separacao-item-id="${escapeHtml(item.id)}">
        <div class="item-requested" title="Quantidade solicitada">
          <span>Qtd</span>
          <strong>${escapeHtml(formatQty(total))}</strong>
        </div>
        <div class="item-photo">${itemPhotoHtml(item, nome)}</div>
        <div class="item-content">
          <div class="item-name">${escapeHtml(nome)}</div>
          ${codigo ? `<div class="item-code">Cod. ${escapeHtml(codigo)}</div>` : ""}
          ${localizacao ? `<div class="item-location">${escapeHtml(localizacao)}</div>` : ""}
        </div>
        <div class="manual-stepper" aria-label="Quantidade separada">
          <button type="button" data-manual-delta="-1" data-separacao-item-id="${escapeHtml(item.id)}" ${editavel ? "" : "disabled"} aria-label="Diminuir quantidade">-</button>
          <input
            class="manual-qty-input"
            type="number"
            min="0"
            max="${escapeHtml(total)}"
            value="${escapeHtml(separado)}"
            ${editavel ? "" : "disabled"}
            data-manual-qty
            data-separacao-item-id="${escapeHtml(item.id)}"
          >
          <button type="button" data-manual-delta="1" data-separacao-item-id="${escapeHtml(item.id)}" ${editavel ? "" : "disabled"} aria-label="Aumentar quantidade">+</button>
        </div>
      </article>
    `;
  }

  function renderQrItem(item) {
    const { nome, codigo, localizacao } = itemBaseInfo(item);
    const percent = itemPercent(item);

    return `
      <article class="item-card" data-separacao-item-id="${escapeHtml(item.id)}">
        <div class="item-requested" title="Quantidade solicitada">
          <span>Qtd</span>
          <strong>${escapeHtml(formatQty(itemTotal(item)))}</strong>
        </div>
        <div class="item-photo">${itemPhotoHtml(item, nome)}</div>
        <div class="item-content">
          <div class="item-name">${escapeHtml(nome)}</div>
          ${codigo ? `<div class="item-code">Cod. ${escapeHtml(codigo)}</div>` : ""}
          ${localizacao ? `<div class="item-location">${escapeHtml(localizacao)}</div>` : ""}
        </div>
        <div class="item-progress">
          <div class="item-progress-track"><span style="width:${percent}%"></span></div>
          <span>${escapeHtml(formatQty(itemSeparado(item)))} / ${escapeHtml(formatQty(itemTotal(item)))}</span>
        </div>
      </article>
    `;
  }

  function renderItens() {
    const pedido = getPedidoAtual();
    const containers = [els.separacaoManualItens, els.separacaoQrItens].filter(Boolean);

    if (!pedido) {
      containers.forEach((container) => {
        container.innerHTML = `
          <div class="empty-state">
            Selecione um pedido para visualizar os itens.
          </div>
        `;
      });
      return;
    }

    const itens = state.itens.filter((item) => String(item.separacao_pedido_id) === String(pedido.id));
    if (!itens.length) {
      containers.forEach((container) => {
        container.innerHTML = `
          <div class="empty-state">
            Nenhum item encontrado neste pedido.
          </div>
        `;
      });
      return;
    }

    const regra = regraSeparacaoPedido(pedido);
    const editavel = modoEditavel();
    const avisoBloqueio = editavel ? "" : `
      <div class="separacao-readonly-banner">
        <strong>Somente visualizacao</strong>
        <span>${escapeHtml(regra.motivo || "Pedido finalizado ou bloqueado para alteracoes.")}</span>
      </div>
    `;

    if (els.separacaoManualItens) {
      els.separacaoManualItens.innerHTML = avisoBloqueio + itens.map((item) => renderManualItem(item, editavel)).join("");
    }

    if (els.separacaoQrItens) {
      els.separacaoQrItens.innerHTML = avisoBloqueio + itens.map(renderQrItem).join("");
    }

    if (window.lucide) lucide.createIcons();
  }

  function renderHistorico() {
    if (!els.separacaoHistorico) return;

    const recentes = state.leituras.slice(0, 8);
    if (!recentes.length) {
      els.separacaoHistorico.innerHTML = `
        <div class="empty-state">
          Nenhuma leitura registrada nesta sessao.
        </div>
      `;
      return;
    }

    els.separacaoHistorico.innerHTML = recentes.map((leitura) => `
      <div class="history-item ${leitura.status_leitura === "sucesso" ? "success" : "error"}">
        <div class="history-row">
          <strong>${escapeHtml(leitura.item_nome || leitura.codigo_lido)}</strong>
          <span>${escapeHtml(formatDateTime(leitura.created_at))}</span>
        </div>
        <div class="history-note">${escapeHtml(leitura.observacao || leitura.status_leitura)}</div>
      </div>
    `).join("");
  }

  async function carregarFila() {
    if (!state.supabase || !state.empresaId) return;

    try {
      state.dbReady = true;
      await carregarRegrasLogistica();

      const { data: pedidos, error: erroPedidos } = await state.supabase
        .from(TABLES.pedidos)
        .select("*")
        .eq("empresa_id", state.empresaId)
        .in("status", ["pendente", "em_separacao", "pausado", "separado", "separado_com_divergencia"])
        .in("status_comercial", ["pre_reserva", "aprovado"])
        .order("data_hora", { ascending: true });

      if (erroPedidos) throw erroPedidos;

      state.pedidos = pedidos || [];

      const pedidoIds = state.pedidos.map((pedido) => pedido.id);
      if (!pedidoIds.length) {
        state.itens = [];
      } else {
        const { data: itens, error: erroItens } = await state.supabase
          .from(TABLES.itens)
          .select("*, itens:item_id(id,codigo,produto,descricao_total,foto_url,setor_estoque,tipo)")
          .eq("empresa_id", state.empresaId)
          .in("separacao_pedido_id", pedidoIds)
          .order("created_at", { ascending: true });

        if (erroItens) throw erroItens;
        state.itens = itens || [];
      }

      if (state.pedidoAtualId && !state.pedidos.some((pedido) => String(pedido.id) === String(state.pedidoAtualId))) {
        state.pedidoAtualId = null;
      }

      renderFila();
      renderPedidoAtual();
      await carregarHistorico();
      window.finalizarCarregamentoModulo?.();
    } catch (err) {
      console.error("Erro ao carregar separacao:", err);
      if (isTabelaAusente(err)) {
        setupState("As tabelas de separacao ainda nao existem neste Supabase.");
        return;
      }
      avisar("Nao foi possivel carregar a fila de separacao.", "Erro", "erro");
      window.finalizarCarregamentoModulo?.();
    }
  }

  async function carregarRegrasLogistica() {
    try {
      const { data, error } = await state.supabase
        .from("empresa_logistica_regras")
        .select("separacao_dias_antes_evento")
        .eq("empresa_id", state.empresaId)
        .maybeSingle();

      if (error) throw error;

      state.regrasLogistica = {
        separacao_dias_antes_evento: Number(data?.separacao_dias_antes_evento ?? 2)
      };
    } catch (error) {
      console.warn("Regras logisticas de separacao indisponiveis; usando padrao.", error);
      state.regrasLogistica = { separacao_dias_antes_evento: 2 };
    }
  }

  async function carregarHistorico() {
    if (!state.pedidoAtualId || !state.dbReady) {
      state.leituras = [];
      renderHistorico();
      return;
    }

    const { data, error } = await state.supabase
      .from(TABLES.leituras)
      .select("*")
      .eq("empresa_id", state.empresaId)
      .eq("separacao_pedido_id", state.pedidoAtualId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.warn("Historico indisponivel:", error);
      state.leituras = [];
    } else {
      state.leituras = data || [];
    }

    renderHistorico();
  }

  async function selecionarPedido(pedidoId) {
    state.pedidoAtualId = pedidoId;
    await carregarHistorico();
    renderPedidoAtual();
  }

  async function atualizarPedidoStatus(pedidoId, status, reload = true, extra = {}) {
    const payload = {
      status,
      atualizado_por: state.usuarioId,
      atualizado_em: new Date().toISOString(),
      ...extra
    };

    const { error } = await state.supabase
      .from(TABLES.pedidos)
      .update(payload)
      .eq("id", pedidoId)
      .eq("empresa_id", state.empresaId);

    if (error) throw error;

    const pedido = state.pedidos.find((p) => String(p.id) === String(pedidoId));
    if (pedido) Object.assign(pedido, payload);

    if (reload) {
      renderFila();
      renderPedidoAtual();
    }
  }

  async function iniciarPedidoSeparacao(pedidoId) {
    await selecionarPedido(pedidoId);
    const pedido = getPedidoAtual();
    if (!pedido) return;

    if (!separacaoLiberada(pedido)) {
      avisarSeparacaoBloqueada(pedido);
      abrirResumoSeparacao(pedido.id).catch(console.error);
      return;
    }

    if (pedido.status === "pendente" || pedido.status === "pausado") {
      await atualizarPedidoStatus(pedido.id, "em_separacao", true);
    }
  }

  async function abrirModoSeparacao(pedidoId) {
    await selecionarPedido(pedidoId);
    const pedido = getPedidoAtual();
    if (!pedido) return;

    if (!pedidoOperavel(pedido)) {
      if (!separacaoLiberada(pedido)) avisarSeparacaoBloqueada(pedido);
      abrirResumoSeparacao(pedido.id).catch(console.error);
      return;
    }

    state.activeMode = "modo";
    renderPedidoAtual();
    abrirModal(els.separacaoModoModal);
  }

  async function abrirResumoSeparacao(pedidoId) {
    await selecionarPedido(pedidoId);
    state.activeMode = "resumo";
    renderPedidoAtual();
    abrirModal(els.separacaoManualModal);
  }

  function abrirManualSeparacao() {
    fecharModal(els.separacaoModoModal);
    state.activeMode = "manual";
    renderPedidoAtual();
    abrirModal(els.separacaoManualModal);
  }

  function abrirQrSeparacao() {
    fecharModal(els.separacaoModoModal);
    state.activeMode = "qr";
    renderPedidoAtual();
    abrirModal(els.separacaoQrModal, true);
  }

  function abrirUmCliqueSeparacao() {
    fecharModal(els.separacaoModoModal);
    state.activeMode = "um-clique";
    renderPedidoAtual();
    abrirModal(els.separacaoUmCliqueModal);
  }

  function focarLeitor() {
    els.scannerInput?.focus();
    setScannerStatus("Aguardando leitura", "ok");
  }

  function setScannerStatus(texto, tipo = "waiting") {
    if (els.scannerStatus) els.scannerStatus.textContent = texto;
    if (els.scannerDot) {
      els.scannerDot.className = `scanner-dot ${tipo === "ok" ? "ok" : tipo === "error" ? "error" : ""}`;
    }
  }

  function setUltimaLeitura({ tipo, itemNome, codigo, quantidade, observacao }) {
    if (els.lastReadCard) {
      els.lastReadCard.className = `last-read-card ${tipo === "sucesso" ? "success" : "error"}`;
    }
    atualizaTexto(els.lastReadItem, itemNome || observacao || "Leitura processada");
    atualizaTexto(els.lastReadCode, codigo || "-");
    atualizaTexto(els.lastReadQty, quantidade || "-");
    atualizaTexto(els.lastReadTime, new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }));
  }

  async function processarCodigo(codigoLido) {
    const codigo = String(codigoLido || "").trim();
    if (!codigo) return;

    const pedido = getPedidoAtual();
    if (!pedido) {
      await registrarLeitura({
        codigo,
        status: "erro",
        observacao: "Nenhum pedido selecionado"
      });
      setScannerStatus("Selecione um pedido", "error");
      setUltimaLeitura({ tipo: "erro", codigo, observacao: "Nenhum pedido selecionado" });
      avisar("Selecione um pedido antes de iniciar as leituras.", "Leitor", "aviso");
      return;
    }

    if (!modoEditavel()) {
      await registrarLeitura({
        codigo,
        status: "bloqueado",
        observacao: regraSeparacaoPedido(pedido).motivo
      });
      setScannerStatus("Separacao bloqueada", "error");
      setUltimaLeitura({ tipo: "erro", codigo, observacao: "Separacao bloqueada" });
      avisarSeparacaoBloqueada(pedido);
      return;
    }

    try {
      setScannerStatus("Processando leitura", "ok");

      const patrimonio = await buscarPatrimonio(codigo);
      const itemCadastro = patrimonio?.itens || await buscarItemPorCodigo(codigo);
      const itemId = patrimonio?.item_id || itemCadastro?.id;

      if (!itemId) {
        await registrarLeitura({
          codigo,
          status: "erro",
          observacao: "Codigo nao encontrado no cadastro de itens ou patrimonios"
        });
        setScannerStatus("Codigo nao encontrado", "error");
        setUltimaLeitura({ tipo: "erro", codigo, observacao: "Codigo nao encontrado" });
        return;
      }

      const itemSeparacao = state.itens.find((item) =>
        String(item.separacao_pedido_id) === String(pedido.id) && String(item.item_id) === String(itemId)
      );

      if (!itemSeparacao) {
        await registrarLeitura({
          codigo,
          itemId,
          status: "erro",
          observacao: "Item nao pertence ao pedido atual"
        });
        setScannerStatus("Item fora do pedido", "error");
        setUltimaLeitura({ tipo: "erro", codigo, itemNome: itemCadastro?.descricao_total || itemCadastro?.produto, observacao: "Item fora do pedido" });
        return;
      }

      if (itemSeparado(itemSeparacao) >= itemTotal(itemSeparacao)) {
        await registrarLeitura({
          codigo,
          itemId,
          separacaoItemId: itemSeparacao.id,
          status: "bloqueado",
          observacao: "Quantidade ja completa"
        });
        setScannerStatus("Quantidade completa", "error");
        setUltimaLeitura({ tipo: "erro", codigo, itemNome: nomeItemSeparacao(itemSeparacao), quantidade: `${formatQty(itemSeparado(itemSeparacao))} / ${formatQty(itemTotal(itemSeparacao))}` });
        avisar("A quantidade desse item ja esta completa.", "Quantidade excedida", "aviso");
        return;
      }

      if ((itemSeparacao.tipo_controle || "quantidade") === "patrimonio") {
        await processarPatrimonio({ codigo, patrimonio, itemSeparacao });
      } else {
        await incrementarQuantidade({ codigo, itemSeparacao });
      }
    } catch (err) {
      console.error("Erro ao processar leitura:", err);
      setScannerStatus("Erro na leitura", "error");
      setUltimaLeitura({ tipo: "erro", codigo, observacao: "Erro inesperado na leitura" });
      await registrarLeitura({
        codigo,
        status: "erro",
        observacao: err?.message || "Erro inesperado"
      });
    } finally {
      if (els.scannerInput) els.scannerInput.value = "";
      if (modalQrAberto()) focarLeitor();
    }
  }

  async function buscarItemPorCodigo(codigo) {
    const { data, error } = await state.supabase
      .from(TABLES.cadastroItens)
      .select("id,codigo,produto,descricao_total,foto_url,setor_estoque")
      .eq("empresa_id", state.empresaId)
      .eq("codigo", codigo)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async function buscarPatrimonio(codigo) {
    const { data, error } = await state.supabase
      .from(TABLES.patrimonios)
      .select("*, itens:item_id(id,codigo,produto,descricao_total,foto_url,setor_estoque)")
      .eq("empresa_id", state.empresaId)
      .eq("codigo_patrimonio", codigo)
      .maybeSingle();

    if (error && error.code !== "42P01") throw error;
    return data || null;
  }

  async function processarPatrimonio({ codigo, patrimonio, itemSeparacao }) {
    if (!patrimonio) {
      await registrarLeitura({
        codigo,
        itemId: itemSeparacao.item_id,
        separacaoItemId: itemSeparacao.id,
        status: "erro",
        observacao: "Item exige patrimonio individual, mas o codigo lido nao e patrimonio"
      });
      setScannerStatus("Patrimonio invalido", "error");
      setUltimaLeitura({ tipo: "erro", codigo, itemNome: nomeItemSeparacao(itemSeparacao), observacao: "Patrimonio invalido" });
      return;
    }

    const patrimoniosLidos = Array.isArray(itemSeparacao.patrimonios_lidos)
      ? itemSeparacao.patrimonios_lidos
      : [];

    if (patrimoniosLidos.includes(codigo)) {
      await registrarLeitura({
        codigo,
        itemId: itemSeparacao.item_id,
        separacaoItemId: itemSeparacao.id,
        tipoControle: "patrimonio",
        status: "bloqueado",
        observacao: "Patrimonio ja lido neste pedido"
      });
      setScannerStatus("Patrimonio duplicado", "error");
      setUltimaLeitura({ tipo: "erro", codigo, itemNome: nomeItemSeparacao(itemSeparacao), observacao: "Patrimonio duplicado" });
      return;
    }

    const novaQtd = itemSeparado(itemSeparacao) + 1;
    const novosPatrimonios = [...patrimoniosLidos, codigo];
    await atualizarItemSeparacao(itemSeparacao, {
      quantidade_separada: novaQtd,
      patrimonios_lidos: novosPatrimonios,
      status: novaQtd >= itemTotal(itemSeparacao) ? "concluido" : "em_andamento"
    });

    await registrarLeitura({
      codigo,
      itemId: itemSeparacao.item_id,
      separacaoItemId: itemSeparacao.id,
      tipoControle: "patrimonio",
      status: "sucesso",
      observacao: "Patrimonio separado com sucesso"
    });

    leituraSucesso(itemSeparacao, codigo);
  }

  async function incrementarQuantidade({ codigo, itemSeparacao }) {
    const novaQtd = itemSeparado(itemSeparacao) + 1;
    await atualizarItemSeparacao(itemSeparacao, {
      quantidade_separada: novaQtd,
      status: novaQtd >= itemTotal(itemSeparacao) ? "concluido" : "em_andamento"
    });

    await registrarLeitura({
      codigo,
      itemId: itemSeparacao.item_id,
      separacaoItemId: itemSeparacao.id,
      tipoControle: "quantidade",
      status: "sucesso",
      observacao: "Quantidade separada com sucesso"
    });

    leituraSucesso(itemSeparacao, codigo);
  }

  async function ajustarQuantidadeManual(itemSeparacao, delta) {
    if (!itemSeparacao) return;
    if (!modoEditavel()) {
      avisarSeparacaoBloqueada();
      return;
    }

    const atual = itemSeparado(itemSeparacao);
    const total = itemTotal(itemSeparacao);
    const novaQtd = Math.max(0, Math.min(total, atual + delta));

    if (novaQtd === atual) {
      avisar(
        delta > 0 ? "A quantidade desse item ja esta completa." : "Esse item ainda nao possui separacao para remover.",
        "Separacao manual",
        "aviso"
      );
      return;
    }

    await atualizarItemSeparacao(itemSeparacao, {
      quantidade_separada: novaQtd,
      status: novaQtd >= total ? "concluido" : novaQtd > 0 ? "em_andamento" : "pendente"
    });

    await registrarLeitura({
      codigo: "manual",
      itemId: itemSeparacao.item_id,
      separacaoItemId: itemSeparacao.id,
      tipoControle: itemSeparacao.tipo_controle || "quantidade",
      status: "sucesso",
      observacao: delta > 0 ? "Quantidade separada manualmente" : "Quantidade removida manualmente"
    });

    leituraSucesso(itemSeparacao, "manual");
  }

  async function definirQuantidadeManual(itemSeparacao, quantidade) {
    if (!itemSeparacao) return;
    if (!modoEditavel()) {
      avisarSeparacaoBloqueada();
      return;
    }

    const total = itemTotal(itemSeparacao);
    const atual = itemSeparado(itemSeparacao);
    const valor = Number.parseFloat(String(quantidade).replace(",", "."));
    const novaQtd = Number.isFinite(valor) ? Math.max(0, Math.min(total, valor)) : atual;

    if (novaQtd === atual) return;

    await atualizarItemSeparacao(itemSeparacao, {
      quantidade_separada: novaQtd,
      status: novaQtd >= total ? "concluido" : novaQtd > 0 ? "em_andamento" : "pendente"
    });

    await registrarLeitura({
      codigo: "manual",
      itemId: itemSeparacao.item_id,
      separacaoItemId: itemSeparacao.id,
      tipoControle: itemSeparacao.tipo_controle || "quantidade",
      status: "sucesso",
      observacao: "Quantidade definida manualmente"
    });

    leituraSucesso(itemSeparacao, "manual");
  }

  async function atualizarItemSeparacao(itemSeparacao, payload) {
    const { error } = await state.supabase
      .from(TABLES.itens)
      .update({
        ...payload,
        atualizado_por: state.usuarioId,
        atualizado_em: new Date().toISOString()
      })
      .eq("id", itemSeparacao.id)
      .eq("empresa_id", state.empresaId);

    if (error) throw error;
    Object.assign(itemSeparacao, payload);
  }

  function leituraSucesso(itemSeparacao, codigo) {
    const pedido = getPedidoAtual();

    setScannerStatus("Leitura confirmada", "ok");
    setUltimaLeitura({
      tipo: "sucesso",
      codigo,
      itemNome: nomeItemSeparacao(itemSeparacao),
      quantidade: `${formatQty(itemSeparado(itemSeparacao))} / ${formatQty(itemTotal(itemSeparacao))}`
    });

    if (pedido && pedido.status !== "em_separacao" && !STATUS_FINALIZADO.has(pedido.status)) {
      pedido.status = "em_separacao";
      atualizarPedidoStatus(pedido.id, "em_separacao", false).catch(console.error);
    }

    renderFila();
    renderPedidoAtual();
    carregarHistorico().catch(console.error);
  }

  function nomeItemSeparacao(itemSeparacao) {
    const cadastro = itemSeparacao?.itens || {};
    return itemSeparacao?.item_nome || cadastro.descricao_total || cadastro.produto || "Item";
  }

  async function registrarLeitura({
    codigo,
    itemId = null,
    separacaoItemId = null,
    tipoControle = null,
    status,
    observacao = ""
  }) {
    if (!state.dbReady) return;

    const item = separacaoItemId
      ? state.itens.find((it) => String(it.id) === String(separacaoItemId))
      : null;

    const payload = {
      empresa_id: state.empresaId,
      separacao_pedido_id: state.pedidoAtualId,
      separacao_item_id: separacaoItemId,
      item_id: itemId,
      codigo_lido: codigo,
      tipo_controle: tipoControle || item?.tipo_controle || "quantidade",
      usuario_id: state.usuarioId,
      usuario_nome: state.usuarioNome,
      status_leitura: status,
      observacao,
      item_nome: item ? nomeItemSeparacao(item) : null
    };

    const { data, error } = await state.supabase
      .from(TABLES.leituras)
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      console.warn("Nao foi possivel salvar historico da leitura:", error);
      return;
    }

    state.leituras.unshift(data);
    renderHistorico();
  }

  async function finalizarSeparacao() {
    const pedido = getPedidoAtual();
    if (!pedido) {
      avisar("Selecione um pedido para finalizar.", "Separacao", "aviso");
      return false;
    }

    if (!modoEditavel()) {
      avisarSeparacaoBloqueada(pedido);
      return false;
    }

    const resumo = pedidoResumo(pedido.id);
    let status = "separado";
    let motivo = "";

    if (resumo.faltante > 0) {
      const confirmar = typeof window.confirmarGlobal === "function"
        ? await window.confirmarGlobal(
          `Ainda existem ${formatQty(resumo.faltante)} itens faltantes. Finalizar com divergencia?`,
          "Finalizar com pendencia",
          { confirmarTexto: "Finalizar", cancelarTexto: "Voltar", tipo: "warning" }
        )
        : confirm(`Ainda existem ${formatQty(resumo.faltante)} itens faltantes. Finalizar com divergencia?`);

      if (!confirmar) return false;
      status = "separado_com_divergencia";
      motivo = `Finalizado com ${formatQty(resumo.faltante)} itens faltantes.`;
    }

    await atualizarPedidoStatus(pedido.id, status, true, {
      finalizado_por: state.usuarioId,
      finalizado_em: new Date().toISOString(),
      motivo_divergencia: motivo || null
    });

    avisar(
      status === "separado" ? "Separacao finalizada com sucesso." : "Separacao finalizada com divergencia.",
      "Separacao",
      status === "separado" ? "sucesso" : "aviso"
    );
    return true;
  }

  async function finalizarModalAtual() {
    const ok = await finalizarSeparacao();
    if (ok) fecharTodosModais();
  }

  async function salvarManualSeparacao() {
    await finalizarModalAtual();
  }

  async function confirmarUmCliqueSeparacao() {
    const pedido = getPedidoAtual();
    if (!pedido) {
      avisar("Selecione um pedido.", "Separacao", "aviso");
      return;
    }

    if (!modoEditavel()) {
      avisarSeparacaoBloqueada(pedido);
      return;
    }

    const itens = state.itens.filter((item) => String(item.separacao_pedido_id) === String(pedido.id));
    for (const item of itens) {
      if (itemSeparado(item) >= itemTotal(item)) continue;
      await atualizarItemSeparacao(item, {
        quantidade_separada: itemTotal(item),
        status: "concluido"
      });
    }

    await registrarLeitura({
      codigo: "1-clique",
      status: "sucesso",
      observacao: "Todos os itens foram marcados como separados em 1 clique"
    });

    renderPedidoAtual();
    const ok = await finalizarSeparacao();
    if (ok) fecharTodosModais();
  }

  function itemPorId(id) {
    return state.itens.find((item) => String(item.id) === String(id));
  }

  function bindEvents() {
    els.btnAtualizarSeparacao?.addEventListener("click", carregarFila);
    els.separacaoBuscaPedido?.addEventListener("input", renderFila);
    els.separacaoStatusFiltro?.addEventListener("change", renderFila);

    els.separacaoKanban?.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-separacao-action]");
      if (actionButton) {
        event.preventDefault();
        event.stopPropagation();
        const pedidoId = actionButton.dataset.pedidoId;
        const action = actionButton.dataset.separacaoAction;
        if (action === "iniciar") iniciarPedidoSeparacao(pedidoId).catch(console.error);
        if (action === "modo") abrirModoSeparacao(pedidoId).catch(console.error);
        if (action === "resumo") abrirResumoSeparacao(pedidoId).catch(console.error);
        return;
      }

      const card = event.target.closest(".separacao-order-card[data-pedido-id]");
      if (!card || card.dataset.clickable !== "true") return;
      const action = card.dataset.cardAction;
      if (action === "iniciar") iniciarPedidoSeparacao(card.dataset.pedidoId).catch(console.error);
      if (action === "modo") abrirModoSeparacao(card.dataset.pedidoId).catch(console.error);
      if (action === "resumo") abrirResumoSeparacao(card.dataset.pedidoId).catch(console.error);
    });

    els.separacaoKanban?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const card = event.target.closest(".separacao-order-card[data-pedido-id]");
      if (!card || card.dataset.clickable !== "true") return;
      event.preventDefault();
      const action = card.dataset.cardAction;
      if (action === "iniciar") iniciarPedidoSeparacao(card.dataset.pedidoId).catch(console.error);
      if (action === "modo") abrirModoSeparacao(card.dataset.pedidoId).catch(console.error);
      if (action === "resumo") abrirResumoSeparacao(card.dataset.pedidoId).catch(console.error);
    });

    els.separacaoModoModal?.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-separacao-modal]")) {
        fecharModal(els.separacaoModoModal);
        return;
      }
      const option = event.target.closest("[data-separacao-modo]");
      if (!option) return;
      const modo = option.dataset.separacaoModo;
      if (modo === "manual") abrirManualSeparacao();
      if (modo === "qr") abrirQrSeparacao();
      if (modo === "um-clique") abrirUmCliqueSeparacao();
    });

    els.separacaoManualModal?.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-separacao-modal]")) fecharModal(els.separacaoManualModal);
    });
    els.separacaoQrModal?.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-separacao-modal]")) fecharModal(els.separacaoQrModal);
    });
    els.separacaoUmCliqueModal?.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-separacao-modal]")) fecharModal(els.separacaoUmCliqueModal);
    });

    els.btnFecharModoSeparacao?.addEventListener("click", () => fecharModal(els.separacaoModoModal));
    els.btnFecharManualSeparacao?.addEventListener("click", () => fecharModal(els.separacaoManualModal));
    els.btnCancelarManualSeparacao?.addEventListener("click", () => fecharModal(els.separacaoManualModal));
    els.btnFecharQrSeparacao?.addEventListener("click", () => fecharModal(els.separacaoQrModal));
    els.btnCancelarQrSeparacao?.addEventListener("click", () => fecharModal(els.separacaoQrModal));
    els.btnFecharUmCliqueSeparacao?.addEventListener("click", () => fecharModal(els.separacaoUmCliqueModal));
    els.btnCancelarUmCliqueSeparacao?.addEventListener("click", () => fecharModal(els.separacaoUmCliqueModal));
    els.btnSalvarManualSeparacao?.addEventListener("click", () => salvarManualSeparacao().catch(console.error));
    els.btnFinalizarSeparacao?.addEventListener("click", () => finalizarModalAtual().catch(console.error));
    els.btnConfirmarUmCliqueSeparacao?.addEventListener("click", () => confirmarUmCliqueSeparacao().catch(console.error));

    els.separacaoManualItens?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-manual-delta]");
      if (!button) return;
      const item = itemPorId(button.dataset.separacaoItemId);
      if (!item) return;
      ajustarQuantidadeManual(item, Number(button.dataset.manualDelta)).catch((error) => {
        console.error("Erro na separacao manual:", error);
        avisar("Nao foi possivel ajustar esse item manualmente.", "Separacao manual", "erro");
      });
    });

    els.separacaoManualItens?.addEventListener("change", (event) => {
      const input = event.target.closest("[data-manual-qty]");
      if (!input) return;
      const item = itemPorId(input.dataset.separacaoItemId);
      if (!item) return;
      definirQuantidadeManual(item, input.value).catch((error) => {
        console.error("Erro na separacao manual:", error);
        avisar("Nao foi possivel ajustar esse item manualmente.", "Separacao manual", "erro");
      });
    });

    els.separacaoManualItens?.addEventListener("keydown", (event) => {
      const input = event.target.closest("[data-manual-qty]");
      if (!input || event.key !== "Enter") return;
      event.preventDefault();
      input.blur();
    });

    els.scannerInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
      processarCodigo(els.scannerInput.value).catch(console.error);
    });

    state.keyHandler = (event) => {
      if (event.key === "Escape" && modalSeparacaoAberto()) {
        fecharTodosModais();
        return;
      }

      if (!modalQrAberto()) return;

      const target = event.target;
      const isEditable = target?.matches?.("input, textarea, select, [contenteditable='true']");
      if (isEditable && target !== els.scannerInput) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      if (event.key === "Enter") {
        const codigo = state.scanBuffer || els.scannerInput?.value || "";
        state.scanBuffer = "";
        clearTimeout(state.scanTimer);
        if (codigo.trim()) processarCodigo(codigo).catch(console.error);
        return;
      }

      if (event.key.length !== 1) return;
      state.scanBuffer += event.key;
      clearTimeout(state.scanTimer);
      state.scanTimer = setTimeout(() => {
        state.scanBuffer = "";
      }, 120);
    };

    document.addEventListener("keydown", state.keyHandler);
  }

  async function init() {
    cacheEls();

    state.supabase = window.supabaseClient;
    state.empresaId = window.__CONTEXT?.empresa_id;
    state.usuarioId = window.__CONTEXT?.usuario_id;
    state.usuarioNome = window.__CONTEXT?.usuario_nome || "Usuario";

    if (!state.supabase || !state.empresaId || !state.usuarioId) {
      setupState("Contexto do Acervo indisponivel. Faca login novamente para acessar a separacao.");
      return;
    }

    bindEvents();
    await carregarFila();
  }

  function destroy() {
    if (state.keyHandler) {
      document.removeEventListener("keydown", state.keyHandler);
    }
    clearTimeout(state.scanTimer);
    fecharTodosModais();
    delete window.__separacaoMateriaisLoaded;
  }

  window.__moduleInit = async function initSeparacaoMateriais() {
    if (window.__separacaoMateriaisLoaded) return;
    window.__separacaoMateriaisLoaded = true;
    await init();
  };

  window.__activeModuleDestroy = destroy;
})();
