(function () {
  const TABLES = {
    pedidos: "separacoes_pedidos",
    itens: "separacoes_itens",
    leituras: "separacoes_leituras",
    patrimonios: "itens_patrimonios",
    config: "configuracoes_separacao",
    cadastroItens: "itens"
  };

  const STATUS_LABEL = {
    pendente: "Pendente",
    em_separacao: "Em separação",
    separado: "Separado",
    separado_com_divergencia: "Com divergência",
    pausado: "Pausado"
  };

  const state = {
    supabase: null,
    empresaId: null,
    usuarioId: null,
    usuarioNome: null,
    pedidos: [],
    pedidosFiltrados: [],
    itens: [],
    leituras: [],
    pedidoAtualId: null,
    tab: "pendentes",
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
      "btnFocarLeitor",
      "separacaoFilaCount",
      "separacaoBuscaPedido",
      "separacaoStatusFiltro",
      "separacaoFilaPedidos",
      "separacaoPedidoTitulo",
      "separacaoPedidoMeta",
      "separacaoPedidoStatus",
      "separacaoProgressoPercent",
      "separacaoProgressoBar",
      "separacaoProgressoQtd",
      "separacaoProgressoFaltante",
      "separacaoItens",
      "scannerDot",
      "scannerStatus",
      "scannerInput",
      "lastReadCard",
      "lastReadItem",
      "lastReadCode",
      "lastReadQty",
      "lastReadTime",
      "btnFinalizarSeparacao",
      "btnPausarSeparacao",
      "separacaoHistorico"
    ].forEach((id) => {
      els[id] = $(id);
    });
  }

  function avisar(mensagem, titulo = "Atenção", tipo = "aviso") {
    if (typeof window.alerta === "function") {
      window.alerta(mensagem, titulo, tipo);
      return;
    }

    alert(mensagem);
  }

  function setupState(message) {
    state.dbReady = false;
    if (els.separacaoFilaPedidos) {
      els.separacaoFilaPedidos.innerHTML = `
        <div class="empty-state setup-state">
          ${escapeHtml(message)}
        </div>
      `;
    }
    if (els.separacaoItens) {
      els.separacaoItens.innerHTML = `
        <div class="empty-state setup-state">
          Aplique o SQL entregue em <strong>supabase/separacao-materiais.sql</strong> e atualize a fila.
        </div>
      `;
    }
    window.finalizarCarregamentoModulo?.();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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

  function statusClass(status) {
    if (status === "em_separacao") return "em-separacao";
    if (status === "separado_com_divergencia") return "divergencia";
    return status || "pendente";
  }

  function getPedidoAtual() {
    return state.pedidos.find((pedido) => pedido.id === state.pedidoAtualId) || null;
  }

  function itemTotal(item) {
    return Number(item.quantidade_solicitada || 0);
  }

  function itemSeparado(item) {
    return Number(item.quantidade_separada || 0);
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
    const itens = state.itens.filter((item) => item.separacao_pedido_id === pedidoId);
    const total = itens.reduce((acc, item) => acc + itemTotal(item), 0);
    const separado = itens.reduce((acc, item) => acc + itemSeparado(item), 0);
    const faltante = Math.max(total - separado, 0);
    const percent = total ? Math.min(Math.round((separado / total) * 100), 100) : 0;
    return { total, separado, faltante, percent };
  }

  function renderFila() {
    const termo = (els.separacaoBuscaPedido?.value || "").trim().toLowerCase();
    const status = els.separacaoStatusFiltro?.value || "";

    state.pedidosFiltrados = state.pedidos.filter((pedido) => {
      const texto = [
        pedido.numero_pedido,
        pedido.cliente_nome,
        pedido.tipo_evento,
        pedido.status
      ].join(" ").toLowerCase();

      return (!termo || texto.includes(termo)) && (!status || pedido.status === status);
    });

    if (els.separacaoFilaCount) {
      els.separacaoFilaCount.textContent = state.pedidosFiltrados.length;
    }

    if (!els.separacaoFilaPedidos) return;

    if (!state.pedidosFiltrados.length) {
      els.separacaoFilaPedidos.innerHTML = `
        <div class="empty-state">
          Nenhum pedido encontrado para separação.
        </div>
      `;
      return;
    }

    els.separacaoFilaPedidos.innerHTML = state.pedidosFiltrados.map((pedido) => {
      const resumo = pedidoResumo(pedido.id);
      const active = pedido.id === state.pedidoAtualId ? " active" : "";
      return `
        <button type="button" class="queue-card${active}" data-pedido-id="${escapeHtml(pedido.id)}">
          <div class="queue-card-top">
            <div>
              <div class="queue-number">Pedido ${escapeHtml(pedido.numero_pedido || "-")}</div>
              <div class="queue-client">${escapeHtml(pedido.cliente_nome || "Cliente não informado")}</div>
            </div>
            <span class="status-pill ${statusClass(pedido.status)}">${escapeHtml(STATUS_LABEL[pedido.status] || pedido.status || "Pendente")}</span>
          </div>
          <div class="queue-meta">
            ${escapeHtml(pedido.tipo_evento || "Evento")} · ${escapeHtml(formatDateTime(pedido.data_evento || pedido.data_hora))}
          </div>
          <div class="mini-progress"><span style="width:${resumo.percent}%"></span></div>
          <div class="queue-progress-text">
            <span>${resumo.percent}%</span>
            <span>${resumo.separado} / ${resumo.total}</span>
          </div>
        </button>
      `;
    }).join("");
  }

  function renderPedidoAtual() {
    const pedido = getPedidoAtual();

    if (!pedido) {
      els.separacaoPedidoTitulo.textContent = "Nenhum pedido selecionado";
      els.separacaoPedidoMeta.textContent = "Selecione um pedido na fila para iniciar.";
      els.separacaoPedidoStatus.textContent = "Aguardando";
      els.separacaoPedidoStatus.className = "status-pill";
      renderProgress({ total: 0, separado: 0, faltante: 0, percent: 0 });
      renderItens();
      return;
    }

    const resumo = pedidoResumo(pedido.id);
    els.separacaoPedidoTitulo.textContent = `Pedido ${pedido.numero_pedido || "-"}`;
    els.separacaoPedidoMeta.textContent = `${pedido.cliente_nome || "Cliente não informado"} · ${pedido.tipo_evento || "Evento"} · ${formatDateTime(pedido.data_evento || pedido.data_hora)}`;
    els.separacaoPedidoStatus.textContent = STATUS_LABEL[pedido.status] || pedido.status || "Pendente";
    els.separacaoPedidoStatus.className = `status-pill ${statusClass(pedido.status)}`;
    renderProgress(resumo);
    renderItens();
  }

  function renderProgress(resumo) {
    els.separacaoProgressoPercent.textContent = `${resumo.percent}%`;
    els.separacaoProgressoBar.style.width = `${resumo.percent}%`;
    els.separacaoProgressoQtd.textContent = `${resumo.separado} / ${resumo.total} separados`;
    els.separacaoProgressoFaltante.textContent = `${resumo.faltante} faltantes`;
  }

  function filtrarItensTab(item) {
    const separado = itemSeparado(item);
    const total = itemTotal(item);

    if (state.tab === "pendentes") return separado === 0 && total > 0;
    if (state.tab === "andamento") return separado > 0 && separado < total;
    if (state.tab === "concluidos") return total > 0 && separado >= total;
    return true;
  }

  function renderItens() {
    if (!els.separacaoItens) return;

    const pedido = getPedidoAtual();
    if (!pedido) {
      els.separacaoItens.innerHTML = `
        <div class="empty-state">
          A fila está pronta. Selecione um pedido para visualizar os itens pendentes.
        </div>
      `;
      return;
    }

    const itens = state.itens
      .filter((item) => item.separacao_pedido_id === pedido.id)
      .filter(filtrarItensTab);

    if (!itens.length) {
      els.separacaoItens.innerHTML = `
        <div class="empty-state">
          Nenhum item nesta aba.
        </div>
      `;
      return;
    }

    els.separacaoItens.innerHTML = itens.map((item) => {
      const percent = itemPercent(item);
      const cadastro = item.itens || {};
      const nome = item.item_nome || cadastro.descricao_total || cadastro.produto || "Item sem nome";
      const codigo = item.codigo_item || cadastro.codigo || "Sem código";
      const foto = item.foto_url || cadastro.foto_url;
      const localizacao = item.localizacao || cadastro.setor_estoque || "Sem localização";

      return `
        <article class="item-card" data-separacao-item-id="${escapeHtml(item.id)}">
          <div class="item-photo">
            ${foto ? `<img src="${escapeHtml(foto)}" alt="${escapeHtml(nome)}">` : `<i data-lucide="package"></i>`}
          </div>
          <div>
            <div class="item-card-top">
              <div>
                <div class="item-name">${escapeHtml(nome)}</div>
                <div class="item-code">Código ${escapeHtml(codigo)} · Controle ${escapeHtml(item.tipo_controle || "quantidade")}</div>
              </div>
              <span class="status-pill ${percent >= 100 ? "separado" : percent > 0 ? "em-separacao" : "pendente"}">${percent}%</span>
            </div>
            <div class="item-location">${escapeHtml(localizacao)}</div>
            <div class="item-metrics">
              <div class="item-metric"><span>Solicitado</span><strong>${itemTotal(item)}</strong></div>
              <div class="item-metric"><span>Separado</span><strong>${itemSeparado(item)}</strong></div>
              <div class="item-metric"><span>Faltante</span><strong>${itemFaltante(item)}</strong></div>
            </div>
            <div class="item-progress"><span style="width:${percent}%"></span></div>
          </div>
        </article>
      `;
    }).join("");

    if (window.lucide) lucide.createIcons();
  }

  function renderHistorico() {
    if (!els.separacaoHistorico) return;

    const recentes = state.leituras.slice(0, 8);
    if (!recentes.length) {
      els.separacaoHistorico.innerHTML = `
        <div class="empty-state">
          Nenhuma leitura registrada nesta sessão.
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

      const { data: pedidos, error: erroPedidos } = await state.supabase
        .from(TABLES.pedidos)
        .select("*")
        .eq("empresa_id", state.empresaId)
        .in("status", ["pendente", "em_separacao", "pausado", "separado", "separado_com_divergencia"])
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

      if (!state.pedidoAtualId && state.pedidos.length) {
        state.pedidoAtualId = state.pedidos[0].id;
      }

      renderFila();
      renderPedidoAtual();
      await carregarHistorico();
      window.finalizarCarregamentoModulo?.();
    } catch (err) {
      console.error("Erro ao carregar separação:", err);
      const code = err?.code || "";
      if (code === "42P01" || /does not exist|schema cache/i.test(err?.message || "")) {
        setupState("As tabelas de separação ainda não existem neste Supabase.");
        return;
      }
      avisar("Não foi possível carregar a fila de separação.", "Erro", "erro");
      window.finalizarCarregamentoModulo?.();
    }
  }

  async function carregarHistorico() {
    if (!state.pedidoAtualId) {
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
      console.warn("Histórico indisponível:", error);
      state.leituras = [];
    } else {
      state.leituras = data || [];
    }

    renderHistorico();
  }

  async function selecionarPedido(pedidoId) {
    state.pedidoAtualId = pedidoId;
    const pedido = getPedidoAtual();

    if (pedido && pedido.status === "pendente") {
      await atualizarPedidoStatus(pedido.id, "em_separacao", false);
    }

    await carregarHistorico();
    renderFila();
    renderPedidoAtual();
    focarLeitor();
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

    const pedido = state.pedidos.find((p) => p.id === pedidoId);
    if (pedido) Object.assign(pedido, payload);

    if (reload) {
      renderFila();
      renderPedidoAtual();
    }
  }

  function focarLeitor() {
    els.scannerInput?.focus();
    setScannerStatus("Aguardando leitura", "ok");
  }

  function setScannerStatus(texto, tipo = "waiting") {
    els.scannerStatus.textContent = texto;
    els.scannerDot.className = `scanner-dot ${tipo === "ok" ? "ok" : tipo === "error" ? "error" : ""}`;
  }

  function setUltimaLeitura({ tipo, itemNome, codigo, quantidade, observacao }) {
    els.lastReadCard.className = `last-read-card ${tipo === "sucesso" ? "success" : "error"}`;
    els.lastReadItem.textContent = itemNome || observacao || "Leitura processada";
    els.lastReadCode.textContent = codigo || "—";
    els.lastReadQty.textContent = quantidade || "—";
    els.lastReadTime.textContent = new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
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

    try {
      setScannerStatus("Processando leitura", "ok");

      const patrimonio = await buscarPatrimonio(codigo);
      const itemCadastro = patrimonio?.itens || await buscarItemPorCodigo(codigo);
      const itemId = patrimonio?.item_id || itemCadastro?.id;

      if (!itemId) {
        await registrarLeitura({
          codigo,
          status: "erro",
          observacao: "Código não encontrado no cadastro de itens ou patrimônios"
        });
        setScannerStatus("Código não encontrado", "error");
        setUltimaLeitura({ tipo: "erro", codigo, observacao: "Código não encontrado" });
        return;
      }

      const itemSeparacao = state.itens.find((item) =>
        item.separacao_pedido_id === pedido.id && item.item_id === itemId
      );

      if (!itemSeparacao) {
        await registrarLeitura({
          codigo,
          itemId,
          status: "erro",
          observacao: "Item não pertence ao pedido atual"
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
          observacao: "Quantidade já completa"
        });
        setScannerStatus("Quantidade completa", "error");
        setUltimaLeitura({ tipo: "erro", codigo, itemNome: nomeItemSeparacao(itemSeparacao), quantidade: `${itemSeparado(itemSeparacao)} / ${itemTotal(itemSeparacao)}` });
        avisar("A quantidade desse item já está completa.", "Quantidade excedida", "aviso");
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
      focarLeitor();
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
        observacao: "Item exige patrimônio individual, mas o código lido não é patrimônio"
      });
      setScannerStatus("Patrimônio inválido", "error");
      setUltimaLeitura({ tipo: "erro", codigo, itemNome: nomeItemSeparacao(itemSeparacao), observacao: "Patrimônio inválido" });
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
        observacao: "Patrimônio já lido neste pedido"
      });
      setScannerStatus("Patrimônio duplicado", "error");
      setUltimaLeitura({ tipo: "erro", codigo, itemNome: nomeItemSeparacao(itemSeparacao), observacao: "Patrimônio duplicado" });
      return;
    }

    const novosPatrimonios = [...patrimoniosLidos, codigo];
    await atualizarItemSeparacao(itemSeparacao, {
      quantidade_separada: itemSeparado(itemSeparacao) + 1,
      patrimonios_lidos: novosPatrimonios,
      status: itemSeparado(itemSeparacao) + 1 >= itemTotal(itemSeparacao) ? "concluido" : "em_andamento"
    });

    await registrarLeitura({
      codigo,
      itemId: itemSeparacao.item_id,
      separacaoItemId: itemSeparacao.id,
      tipoControle: "patrimonio",
      status: "sucesso",
      observacao: "Patrimônio separado com sucesso"
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
    const resumo = pedidoResumo();
    const pedido = getPedidoAtual();

    setScannerStatus("Leitura confirmada", "ok");
    setUltimaLeitura({
      tipo: "sucesso",
      codigo,
      itemNome: nomeItemSeparacao(itemSeparacao),
      quantidade: `${itemSeparado(itemSeparacao)} / ${itemTotal(itemSeparacao)}`
    });

    if (pedido && pedido.status !== "em_separacao") {
      pedido.status = "em_separacao";
      atualizarPedidoStatus(pedido.id, "em_separacao", false).catch(console.error);
    }

    renderFila();
    renderPedidoAtual();
    carregarHistorico().catch(console.error);
  }

  function nomeItemSeparacao(itemSeparacao) {
    const cadastro = itemSeparacao.itens || {};
    return itemSeparacao.item_nome || cadastro.descricao_total || cadastro.produto || "Item";
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
      ? state.itens.find((it) => it.id === separacaoItemId)
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
      console.warn("Não foi possível salvar histórico da leitura:", error);
      return;
    }

    state.leituras.unshift(data);
    renderHistorico();
  }

  async function finalizarSeparacao() {
    const pedido = getPedidoAtual();
    if (!pedido) {
      avisar("Selecione um pedido para finalizar.", "Separação", "aviso");
      return;
    }

    const resumo = pedidoResumo(pedido.id);
    let status = "separado";
    let motivo = "";

    if (resumo.faltante > 0) {
      const confirmar = typeof window.confirmarGlobal === "function"
        ? await window.confirmarGlobal(
          `Ainda existem ${resumo.faltante} itens faltantes. Finalizar com divergência?`,
          "Finalizar com pendência",
          { confirmarTexto: "Finalizar", cancelarTexto: "Voltar", tipo: "warning" }
        )
        : confirm(`Ainda existem ${resumo.faltante} itens faltantes. Finalizar com divergência?`);

      if (!confirmar) return;
      status = "separado_com_divergencia";
      motivo = `Finalizado com ${resumo.faltante} itens faltantes.`;
    }

    await atualizarPedidoStatus(pedido.id, status, true, {
      finalizado_por: state.usuarioId,
      finalizado_em: new Date().toISOString(),
      motivo_divergencia: motivo || null
    });

    avisar(
      status === "separado" ? "Separação finalizada com sucesso." : "Separação finalizada com divergência.",
      "Separação",
      status === "separado" ? "sucesso" : "aviso"
    );
  }

  async function pausarSeparacao() {
    const pedido = getPedidoAtual();
    if (!pedido) {
      avisar("Selecione um pedido para pausar.", "Separação", "aviso");
      return;
    }

    await atualizarPedidoStatus(pedido.id, "pausado", true);
    avisar("Separação pausada.", "Separação", "info");
  }

  function bindEvents() {
    els.btnAtualizarSeparacao?.addEventListener("click", carregarFila);
    els.btnFocarLeitor?.addEventListener("click", focarLeitor);
    els.btnFinalizarSeparacao?.addEventListener("click", finalizarSeparacao);
    els.btnPausarSeparacao?.addEventListener("click", pausarSeparacao);

    els.separacaoBuscaPedido?.addEventListener("input", renderFila);
    els.separacaoStatusFiltro?.addEventListener("change", renderFila);

    els.separacaoFilaPedidos?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-pedido-id]");
      if (!card) return;
      selecionarPedido(card.dataset.pedidoId).catch(console.error);
    });

    document.querySelectorAll(".separacao-tabs .tab").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".separacao-tabs .tab").forEach((tab) => tab.classList.remove("active"));
        button.classList.add("active");
        state.tab = button.dataset.tab || "pendentes";
        renderItens();
      });
    });

    els.scannerInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      processarCodigo(els.scannerInput.value).catch(console.error);
    });

    state.keyHandler = (event) => {
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
    state.usuarioNome = window.__CONTEXT?.usuario_nome || "Usuário";

    if (!state.supabase || !state.empresaId || !state.usuarioId) {
      setupState("Contexto do EasyLoc indisponível. Faça login novamente para acessar a separação.");
      return;
    }

    bindEvents();
    focarLeitor();
    await carregarFila();
  }

  function destroy() {
    if (state.keyHandler) {
      document.removeEventListener("keydown", state.keyHandler);
    }
    clearTimeout(state.scanTimer);
    delete window.__separacaoMateriaisLoaded;
  }

  window.__moduleInit = async function initSeparacaoMateriais() {
    if (window.__separacaoMateriaisLoaded) return;
    window.__separacaoMateriaisLoaded = true;
    await init();
  };

  window.__activeModuleDestroy = destroy;
})();
