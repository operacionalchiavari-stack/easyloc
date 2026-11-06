(function () {
  const TABLES = {
    pedidos: "separacoes_pedidos",
    itens: "separacoes_itens",
    leituras: "separacoes_leituras",
    etiquetas: "separacoes_etiquetas",
    patrimonios: "itens_patrimonios",
    config: "configuracoes_separacao",
    cadastroItens: "itens"
  };

  const STATUS_EM_ANDAMENTO = new Set(["em_separacao", "pausado"]);
  const STATUS_FINALIZADO = new Set(["separado", "separado_com_divergencia"]);

  const state = {
    meusSetores: null,   // Separação por setor (Parâmetros): null = todos; senão Set com os setores da pessoa
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
    modosDisponiveis: {},
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
      "separacaoUmCliqueMeta",
      "btnCameraSeparacao",
      "scannerCamera",
      "scannerVideo",
      "scannerVisual"
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

  // Item personalizado (out/2026): a parte que está em produção não se separa aqui. itemTotal é só a parte normal;
  // a parte em produção entra no resumo do pedido e só conta depois que o separador confirma que recebeu.
  function itemProducao(item) { return Number(item?.prod?.unidades || 0); }
  function itemTotal(item) {
    return Math.max(Number(item?.quantidade_solicitada || 0) - itemProducao(item), 0);
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

  // Separação por setor (out/2026): o setor é o "Setor de estoque" do item (no Kit, o do componente).
  function setorDoItem(item) { return String(item?.itens?.setor_estoque || "").trim() || "Sem setor"; }
  function itemVisivel(item) { return !state.meusSetores || state.meusSetores.has(setorDoItem(item)); }
  function itensDoPedido(pedidoId, soMeus = false) {
    return state.itens.filter((item) => String(item.separacao_pedido_id) === String(pedidoId) && (!soMeus || itemVisivel(item)));
  }
  async function carregarMeusSetores() {
    try {
      const { data, error } = await state.supabase.rpc("separacao_meus_setores", { p_empresa: state.empresaId });
      state.meusSetores = !error && Array.isArray(data) && data.length ? new Set(data) : null;
    } catch (erro) { console.warn("Setores da separação indisponíveis:", erro); state.meusSetores = null; }
  }

  function pedidoResumo(pedidoId = state.pedidoAtualId, soMeus = false) {
    const itens = itensDoPedido(pedidoId, soMeus);
    const total = itens.reduce((acc, item) => acc + itemTotal(item) + itemProducao(item), 0);
    const separado = itens.reduce((acc, item) => acc + itemSeparado(item) + Math.min(Number(item?.prod?.confirmadas || 0), itemProducao(item)), 0);
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
    if(pedido.operacao?.carregamento?.iniciado_em || pedido.operacao?.carregamento?.concluido_em || pedido.status_operacional)return {liberado:false,motivo:'A Expedição assumiu o pedido. Solicite a liberação para a Triagem.'};
    if (pedido.reducao_liberada_em) return { liberado: false, motivo: "Retirada liberada ao comercial. Separação pausada até salvar a revisão ou cancelar a liberação." };
    if (!["aprovado", "enviado", "finalizado"].includes(statusComercial)) {
      return {
        liberado: false,
        motivo: "Pedido em pre reserva. A equipe pode visualizar, mas a separacao fica bloqueada ate a aprovacao comercial."
      };
    }

    const diasLiberacao = Number(state.regrasLogistica?.separacao_dias_antes_evento ?? 2);
    const diferencaDias = diasAteEvento({ ...pedido, data_evento: pedido.data_entrega || pedido.data_evento });
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
    window.scrollTo?.({ top: 0, behavior: "instant" });
    if (window.lucide) lucide.createIcons();
    if (focusScanner) setTimeout(() => focarLeitor(), 80);
  }

  function fecharModal(element) {
    if (!element) return;
    if (element === els.separacaoQrModal) pararCamera();
    element.classList.add("hidden");
    element.setAttribute("aria-hidden", "true");
    if (!modalSeparacaoAberto()) {
      document.body.classList.remove("separacao-modal-open");
      state.activeMode = null;
    }
  }

  function fecharTodosModais() {
    pararCamera();
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

  // Foto do decorador (cadastro do cliente), guardada por cliente para não buscar de novo.
  const fotosClientes = new Map();
  async function fotoCliente(pedido) {
    const chave = pedido.cliente_id || "nome:" + (pedido.cliente_nome || "");
    if (!fotosClientes.has(chave)) {
      fotosClientes.set(chave, (async () => {
        let q = state.supabase.from("clientes_empresas").select("catalogo_logo_url").eq("empresa_id", state.empresaId);
        q = pedido.cliente_id ? q.eq("id", pedido.cliente_id) : q.eq("nome_razao", pedido.cliente_nome || "");
        const { data } = await q.limit(1);
        const url = data?.[0]?.catalogo_logo_url || "";
        return /^https?:\/\//i.test(url) ? url : "";
      })().catch(() => ""));
    }
    return fotosClientes.get(chave);
  }
  function pintarClienteCabecalho(el, pedido) {
    if (!el) return;
    const nome = pedido.cliente_nome || "Cliente não informado";
    const local = pedidoLocal(pedido);
    const avatar = document.createElement("span");
    avatar.className = "separacao-cliente-foto";
    avatar.textContent = nome.trim().charAt(0).toUpperCase() || "?";
    const textoNome = document.createElement("strong");
    textoNome.className = "separacao-cliente-nome";
    textoNome.textContent = nome;
    const partes = [avatar, textoNome];
    if (local && local !== "-") {
      const textoLocal = document.createElement("span");
      textoLocal.className = "separacao-cliente-local";
      textoLocal.textContent = local;
      partes.push(textoLocal);
    }
    el.classList.add("separacao-cliente");
    el.replaceChildren(...partes);
    fotoCliente(pedido).then((url) => {
      if (!url || !avatar.isConnected) return;
      const img = document.createElement("img");
      img.src = url; img.alt = "";
      img.onerror = () => { img.remove(); avatar.textContent = nome.trim().charAt(0).toUpperCase() || "?"; };
      avatar.textContent = ""; avatar.appendChild(img);
    });
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

    // Pagamento mínimo (Parâmetros > Financeiro) travando a Triagem: aviso pequeno e o cartão não abre.
    const bloqueado = coluna !== "separado" && state.bloqueados?.has(String(pedido.id));
    return `
      <article class="separacao-order-card${bloqueado ? " is-bloqueado-fin" : ""}${state.problemas?.[pedido.id] ? " tem-problema" : ""}" data-pedido-id="${escapeHtml(pedido.id)}" data-card-action="${escapeHtml(cardAction)}" data-clickable="${bloqueado ? "false" : "true"}" data-coluna="${escapeHtml(coluna)}" ${bloqueado ? 'aria-disabled="true" title="Aguardando aprovação do Financeiro. Avise o supervisor."' : 'tabindex="0"'}>
        ${state.problemas?.[pedido.id] ? `<span class="sep-problema-dot" title="${state.problemas[pedido.id]} problema(s) reportado(s) na separação" aria-label="Problema reportado na separação"></span>` : ""}
        <div class="separacao-card-top">
          <span class="separacao-order-number">Pedido ${escapeHtml(numeroLabel)}</span>
          <span class="card-tipo-ida">Ida</span>
          ${bloqueado ? '<span class="exp-aviso-fin">Aguardando Financeiro</span>' : ""}
          ${coluna === "separado" ? `<span class="separacao-done-mark"><i data-lucide="check"></i></span>` : ""}
        </div>
        <div class="separacao-card-mainline">
          <strong>${escapeHtml(cliente)}</strong>
          <span>${escapeHtml(evento)} &middot; ${escapeHtml(local)}</span>
        </div>
        <div class="separacao-card-meta-line">${escapeHtml(data)} &middot; ${escapeHtml(setor)} &middot; ${escapeHtml(qtdLabel)}</div>
        ${coluna === "andamento" ? progresso : ""}
        ${regra.liberado ? "" : `<div class="separacao-lock-note">${escapeHtml(regra.motivo)}</div>`}
        ${coluna === "andamento" && STATUS_EM_ANDAMENTO.has(pedido.status) && !pedido.status_operacional ? `<button type="button" class="btn" data-separacao-action="liberar-retirada" data-pedido-id="${escapeHtml(pedido.id)}">Liberar pedido</button>` : ""}
        ${coluna==='separado'?`<button type="button" class="btn" data-separacao-action="reabrir-triagem" data-pedido-id="${escapeHtml(pedido.id)}">Reabrir triagem</button>`:''}
      </article>
    `;
  }

  /* Conferência de retorno (out/2026): depois do carregamento concluído, o pedido ganha um cartão lilás
     "Retorno" na Triagem. É às cegas: o cartão nunca mostra quantas peças devem voltar, só quantas já foram
     lidas; o resultado (o que não voltou) só aparece depois de concluída, na conferência. */
  const idaConcluida = (p) => ["carregado", "retornado"].includes(p.status_operacional) || !!p.operacao?.carregamento?.concluido_em;
  const voltaConcluida = (p) => p.status_operacional === "retornado" || !!p.operacao?.retorno?.concluido_em;

  function colunaRetorno(pedido) {
    if (voltaConcluida(pedido)) return "separado";
    return (state.retornoLidos?.get(String(pedido.id)) || 0) > 0 ? "andamento" : "aguardando";
  }

  function retornoCard(pedido, coluna) {
    const numero = pedido.numero_pedido || "-";
    const numeroLabel = String(numero).startsWith("#") ? String(numero) : "#" + numero;
    const lidos = state.retornoLidos?.get(String(pedido.id)) || 0;
    const feito = pedido.operacao?.retorno;
    let nota = pedido.fluxo_etapa==='retorno_simultaneo' ? "Conferência às cegas · simultânea com a Expedição" : "Conferência às cegas";
    if (coluna === "separado" && feito) {
      const falta = Array.isArray(feito.faltando) ? feito.faltando.length : 0;
      nota = "Retorno conferido" + (feito.por ? " por " + feito.por : "") + (falta ? " · " + falta + " não voltou" : " · tudo voltou");
    }
    const lidosHtml = coluna === "andamento" ? '<div class="card-retorno-lidos">' + lidos + " peça" + (lidos === 1 ? "" : "s") + " lida" + (lidos === 1 ? "" : "s") + "</div>" : "";
    return '<article class="separacao-order-card card-retorno" data-pedido-id="' + escapeHtml(pedido.id) + '" data-card-action="retorno" data-clickable="true" data-coluna="' + escapeHtml(coluna) + '" tabindex="0">' +
      '<div class="separacao-card-top"><span class="separacao-order-number">Pedido ' + escapeHtml(numeroLabel) + '</span><span class="card-tipo-retorno">Retorno</span>' +
      (coluna === "separado" ? '<span class="separacao-done-mark"><i data-lucide="check"></i></span>' : "") + "</div>" +
      '<div class="separacao-card-mainline"><strong>' + escapeHtml(pedido.cliente_nome || "Cliente nao informado") + "</strong><span>" +
      escapeHtml(pedido.tipo_evento || "Evento") + " &middot; " + escapeHtml(pedidoLocal(pedido)) + "</span></div>" +
      '<div class="separacao-card-meta-line">Coleta ' + escapeHtml(formatDateOnly(pedido.data_coleta || pedido.data_evento)) + "</div>" +
      lidosHtml + '<div class="separacao-lock-note">' + escapeHtml(nota) + "</div></article>";
  }

  // Divergências abertas da volta (out/2026): o pedido não some do quadro enquanto houver falta ou peça a mais sem resolver.
  async function divergenciasAbertas(sb, empresa, etapa) {
    let data, error;
    try { ({ data, error } = await sb.from("operacao_ocorrencias").select("pedido_id,tipo,quantidade,etapa")
      .eq("empresa_id", empresa).is("resolvida_em", null).in("tipo", ["falta", "sobra"]).eq("etapa", etapa)); } catch (e) { error = e; }
    if (error) { console.warn("Divergências não carregadas:", error); return { mapa: new Map(), pedidos: [] }; }
    const mapa = new Map();
    (data || []).forEach((o) => { const k = String(o.pedido_id); const r = mapa.get(k) || { falta: 0, sobra: 0 }; r[o.tipo] += 1; mapa.set(k, r); });
    if (!mapa.size) return { mapa, pedidos: [] };
    const { data: pedidos } = await sb.from("separacoes_pedidos").select("*").eq("empresa_id", empresa).in("id", [...mapa.keys()]);
    return { mapa, pedidos: pedidos || [] };
  }
  function resumoDivergencia(r) {
    return [r.falta ? r.falta + " item(ns) faltando" : "", r.sobra ? r.sobra + " item(ns) a mais" : ""].filter(Boolean).join(" · ");
  }

  function divergenciaCard(pedido) {
    const r = state.divergencias?.mapa.get(String(pedido.id)) || { falta: 0, sobra: 0 };
    const numero = String(pedido.numero_pedido || "-");
    return '<article class="separacao-order-card card-retorno card-divergencia' + (r.falta ? " tem-falta" : " so-sobra") + '" data-pedido-id="' + escapeHtml(pedido.id) + '" data-card-action="retorno" data-clickable="true" data-coluna="divergencias" tabindex="0">' +
      '<div class="separacao-card-top"><span class="separacao-order-number">Pedido ' + escapeHtml(numero.startsWith("#") ? numero : "#" + numero) + '</span><span class="card-tipo-retorno">Retorno</span></div>' +
      '<div class="separacao-card-mainline"><strong>' + escapeHtml(pedido.cliente_nome || "Cliente nao informado") + "</strong><span>" +
      escapeHtml(pedido.tipo_evento || "Evento") + " &middot; " + escapeHtml(pedidoLocal(pedido)) + "</span></div>" +
      '<div class="separacao-card-meta-line divergencia-meta"><span>Coleta ' + escapeHtml(formatDateOnly(pedido.data_coleta || pedido.data_evento)) + '</span><span class="card-divergencia-resumo" title="' + escapeHtml(resumoDivergencia(r)) + '">' + escapeHtml([r.falta ? r.falta + ' faltante(s)' : '', r.sobra ? r.sobra + ' a mais' : ''].filter(Boolean).join(' · ')) + '</span></div></article>';
  }

  function abrirConferenciaRetorno(pedidoId) {
    const query = "?pedido=" + encodeURIComponent(pedidoId) + "&etapa=retorno&de=separacao";
    try {
      if (window.top !== window && typeof window.top.shellNavigate === "function") { window.top.shellNavigate("Modulos/Logistica/Conferencia/conferencia.html" + query); return; }
    } catch (_) { /* outra origem */ }
    location.href = "../../Logistica/Conferencia/conferencia.html" + query;
  }

  function renderColuna(container, pedidos, coluna, retornos = []) {
    if (!container) return;
    if (!pedidos.length && !retornos.length) {
      const emptyText = coluna === "aguardando"
        ? "Nada aguardando triagem."
        : coluna === "andamento"
          ? "Nenhuma triagem em andamento."
          : "Nada concluído por enquanto.";
      container.innerHTML = `<div class="empty-state">${emptyText}</div>`;
      return;
    }

    container.innerHTML = retornos.map((pedido) => retornoCard(pedido, coluna)).join("") + pedidos.map((pedido) => pedidoCard(pedido, coluna)).join("");
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

    // Separado e ainda não carregado chega com fluxo_etapa 'expedicao': fica em Concluídos até a Expedição começar.
    const naTriagem=state.pedidosFiltrados.filter(p=>(p.fluxo_etapa==='triagem'||p.fluxo_etapa==='expedicao'||p.somente_consulta)&&(!state.meusSetores||itensDoPedido(p.id,true).length));
    const grupos = {
      aguardando: naTriagem.filter((pedido) => pedido.status === "pendente"),
      emSeparacao: naTriagem.filter((pedido) => STATUS_EM_ANDAMENTO.has(pedido.status)),
      separados: naTriagem.filter((pedido) => STATUS_FINALIZADO.has(pedido.status))
    };

    const volta=state.pedidosFiltrados.filter(p=>['triagem_retorno','retorno_simultaneo'].includes(p.fluxo_etapa));
    const retornos = { aguardando: volta.filter(p=>!p.operacao?.retorno?.iniciado_em), andamento: volta.filter(p=>p.operacao?.retorno?.iniciado_em), separado: [] };
    renderContadores({
      aguardando: [...grupos.aguardando, ...retornos.aguardando],
      emSeparacao: [...grupos.emSeparacao, ...retornos.andamento],
      separados: [...grupos.separados, ...retornos.separado]
    });
    renderColuna(els.separacaoColunaAguardando, grupos.aguardando, "aguardando", retornos.aguardando);
    renderColuna(els.separacaoColunaEmSeparacao, grupos.emSeparacao, "andamento", retornos.andamento);
    renderColuna(els.separacaoColunaSeparados, grupos.separados, "separado", retornos.separado);
    const divergentes = (state.divergencias?.pedidos || []).filter((p) => !termo || [p.numero_pedido, p.cliente_nome, p.tipo_evento, pedidoLocal(p)].join(" ").toLowerCase().includes(termo));
    const colDiv = document.getElementById("separacaoColunaDivergencias");
    if (colDiv) colDiv.innerHTML = divergentes.length ? divergentes.map(divergenciaCard).join("") : '<div class="empty-state">Nenhuma divergência aberta.</div>';
    atualizaTexto(document.getElementById("separacaoLaneDivergenciasCount"), divergentes.length);

    window.pintarFotosDecoradores?.({ sb: state.supabase, empresa: state.empresaId, pedidos: [...state.pedidos, ...(state.divergencias?.pedidos || [])] });

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
    ].join(" · ");
    atualizaTexto(els.separacaoModoTitulo, titulo);
    atualizaTexto(els.separacaoModoMeta, metaLimpo);
    atualizaTexto(els.separacaoManualTitulo, titulo);
    atualizaTexto(els.separacaoQrTitulo, titulo);
    // Cabeçalho da separação (out/2026): foto do decorador, nome e local.
    [els.separacaoManualMeta, els.separacaoQrMeta].forEach((el) => pintarClienteCabecalho(el, pedido));
    atualizaTexto(els.separacaoUmCliqueTitulo, `Concluir ${titulo}?`);
    atualizaTexto(els.separacaoUmCliqueMeta, `Marcar todos os itens do pedido ${pedido.numero_pedido || "-"} como separados.`);

    renderProgress(pedidoResumo(pedido.id, true));
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
    const localizacao = [item.localizacao || cadastro.setor_estoque || "", item.kit_nome ? "Parte do kit: " + item.kit_nome + " (" + formatQty(item.por_kit) + " por kit)" : ""].filter(Boolean).join(" · ");
    return { cadastro, nome, codigo, localizacao };
  }

  // Parte em produção: sem quantidade, só o aviso. Quando a produção termina, o separador confirma que recebeu.
  function renderProducaoItem(item, editavel) {
    const { nome, codigo } = itemBaseInfo(item);
    const p = item.prod, un = itemProducao(item), conf = Math.min(Number(p.confirmadas || 0), un), prontas = Math.min(Number(p.prontas || 0), un);
    const linhaItem = item.virtual ? item.kitRow.item_id : item.item_id;
    let situacao, acao = "";
    if (conf >= un) situacao = '<span class="producao-sit is-ok">✓ Recebido da produção</span>';
    else if (prontas > conf) {
      situacao = '<span class="producao-sit is-pronto">Pronto na produção' + (prontas < un ? " (" + formatQty(prontas) + " de " + formatQty(un) + ")" : "") + "</span>";
      acao = '<button type="button" class="btn primary producao-confirmar" data-confirmar-producao="' + escapeHtml(linhaItem) + '" data-pedido="' + escapeHtml(item.separacao_pedido_id) + '"' + (editavel ? "" : " disabled") + ">Confirmar recebimento</button>";
    } else situacao = '<span class="producao-sit is-andamento">Em produção</span>';
    return `
      <article class="item-card item-card-producao${conf >= un ? " is-completo" : ""}" data-separacao-item-id="${escapeHtml(item.id)}-producao">
        <div class="item-requested" title="Quantidade em produção"><span>Qtd</span><strong>${escapeHtml(formatQty(un))}</strong></div>
        <div class="item-photo">${itemPhotoHtml(item, nome)}</div>
        <div class="item-content">
          <div class="item-name">${escapeHtml(nome)}</div>
          ${codigo ? `<div class="item-code">Cod. ${escapeHtml(codigo)}</div>` : ""}
          ${ocorrenciaItemHtml(item, typeof editavel!=="undefined"?editavel:modoEditavel())}
          <div class="producao-aviso">Personalização${p.personalizacoes ? " · " + escapeHtml(p.personalizacoes) : ""} — a separação desta parte é feita pela Produção${item.virtual ? " (kit " + escapeHtml(item.kit_nome || "") + ")" : ""}.</div>
        </div>
        <div class="producao-lado">${situacao}${acao}</div>
      </article>`;
  }

  function ocorrenciaItemHtml(item,editavel){
    return `<div class="so-item-acoes">${editavel?`<button type="button" data-reportar-problema="${escapeHtml(item.id)}">Reportar problema</button>`:''}<button type="button" class="so-acompanhar" data-ver-ocorrencias="${escapeHtml(item.id)}" hidden>Acompanhar problema</button><span data-so-item="${escapeHtml(item.item_id)}"></span></div>`;
  }

  function renderManualItem(item, editavel) {
    if (itemProducao(item) > 0) {
      const prod = renderProducaoItem(item, editavel);
      if (itemTotal(item) <= 0) return prod;
      return renderManualItemNormal(item, editavel) + prod;
    }
    return renderManualItemNormal(item, editavel);
  }

  function renderManualItemNormal(item, editavel) {
    const { nome, codigo, localizacao } = itemBaseInfo(item);
    const total = itemTotal(item);
    const separado = itemSeparado(item);

    return `
      <article class="item-card${itemTotal(item) > 0 && itemSeparado(item) >= itemTotal(item) ? " is-completo" : itemSeparado(item) < itemTotal(item) ? " is-incompleto" : ""}" data-separacao-item-id="${escapeHtml(item.id)}">
        <div class="item-requested" title="Quantidade solicitada">
          <span>Qtd</span>
          <strong>${escapeHtml(formatQty(total))}</strong>
        </div>
        <div class="item-photo">${itemPhotoHtml(item, nome)}</div>
        <div class="item-content">
          <div class="item-name">${escapeHtml(nome)}</div>
          ${codigo ? `<div class="item-code">Cod. ${escapeHtml(codigo)}</div>` : ""}
          ${ocorrenciaItemHtml(item, typeof editavel!=="undefined"?editavel:modoEditavel())}
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
        ${state.capas?.celula(item, editavel) || ''}
      </article>
    `;
  }

  function renderQrItem(item) {
    if (itemProducao(item) > 0) {
      const prod = renderProducaoItem(item, modoEditavel());
      return itemTotal(item) <= 0 ? prod : renderQrItemNormal(item) + prod;
    }
    return renderQrItemNormal(item);
  }

  function renderQrItemNormal(item) {
    const { nome, codigo, localizacao } = itemBaseInfo(item);
    const percent = itemPercent(item);

    return `
      <article class="item-card${itemTotal(item) > 0 && itemSeparado(item) >= itemTotal(item) ? " is-completo" : itemSeparado(item) < itemTotal(item) ? " is-incompleto" : ""}" data-separacao-item-id="${escapeHtml(item.id)}">
        <div class="item-requested" title="Quantidade solicitada">
          <span>Qtd</span>
          <strong>${escapeHtml(formatQty(itemTotal(item)))}</strong>
        </div>
        <div class="item-photo">${itemPhotoHtml(item, nome)}</div>
        <div class="item-content">
          <div class="item-name">${escapeHtml(nome)}</div>
          ${codigo ? `<div class="item-code">Cod. ${escapeHtml(codigo)}</div>` : ""}
          ${ocorrenciaItemHtml(item, typeof editavel!=="undefined"?editavel:modoEditavel())}
          ${localizacao ? `<div class="item-location">${escapeHtml(localizacao)}</div>` : ""}
        </div>
        <div class="item-progress">
          <div class="item-progress-track"><span style="width:${percent}%"></span></div>
          <span>${escapeHtml(formatQty(itemSeparado(item)))} / ${escapeHtml(formatQty(itemTotal(item)))}</span>
        </div>
        ${state.capas?.celula(item, modoEditavel()) || ''}
      </article>
    `;
  }

  function renderItens() {
    const pedido = getPedidoAtual();
    const capasReabriram=pedido&&modoEditavel()&&state.capas?.rows?.some(r=>r.concluida)&&!state.capasRecarregando;
    if(pedido&&window.CapasOperacao&&(state.capas?.pedido!==pedido.id||capasReabriram)){
      state.capasRecarregando=true;
      const capas=state.capas=window.CapasOperacao.criar({sb:state.supabase,pedido:pedido.id,etapa:'triagem'});
      capas.pronto.then(()=>{state.capasRecarregando=false;if(state.capas===capas)renderItens();}).catch(e=>{state.capasRecarregando=false;console.error(e);if(state.capas===capas)renderItens();});
    }
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

    const itens = itensDoPedido(pedido.id, true);
    if (!itens.length) {
      containers.forEach((container) => {
        container.innerHTML = `
          <div class="empty-state">
            ${state.meusSetores ? "Nenhum item dos seus setores neste pedido." : "Nenhum item encontrado neste pedido."}
          </div>
        `;
      });
      return;
    }

    const regra = regraSeparacaoPedido(pedido);
    const editavel = modoEditavel();
    const outros = itensDoPedido(pedido.id).length - itens.length;
    const avisoSetor = state.meusSetores ? `
      <div class="separacao-setor-banner">
        <strong>Seus setores: ${escapeHtml([...state.meusSetores].join(" · "))}</strong>
        <span>${outros ? `${outros} item(ns) de outros setores ficam com a equipe de cada setor.` : "Todos os itens deste pedido são dos seus setores."}</span>
      </div>
    ` : "";
    const avisoBloqueio = avisoSetor + (editavel ? "" : `
      <div class="separacao-readonly-banner">
        <strong>Somente visualização</strong>
        <span>${escapeHtml(STATUS_FINALIZADO.has(pedido.status) ? "Separação já concluída." : (regra.motivo || "Pedido bloqueado para alterações."))}</span>
      </div>
    `);

    if (els.separacaoManualItens) {
      // Campo em edição antes de redesenhar (quem já está digitando na linha de baixo não perde o que digitou).
      const ativo = document.activeElement?.matches?.("[data-manual-qty]") && els.separacaoManualItens.contains(document.activeElement)
        ? { id: document.activeElement.dataset.separacaoItemId, valor: document.activeElement.value, inicio: document.activeElement.selectionStart, fim: document.activeElement.selectionEnd } : null;
      els.separacaoManualItens.innerHTML = avisoBloqueio + itens.map((item) => renderManualItem(item, editavel)).join("");
      // Enter na quantidade leva à linha de baixo: a lista é redesenhada depois de salvar, então o foco volta pelo id.
      const idFoco = ativo?.id || (state.focoManual && Date.now() < state.focoManual.ate ? state.focoManual.id : null);
      if (idFoco) {
        const alvo = els.separacaoManualItens.querySelector('[data-manual-qty][data-separacao-item-id="' + CSS.escape(idFoco) + '"]');
        if (alvo && !alvo.disabled) {
          alvo.focus({ preventScroll: true });
          if (ativo && ativo.id === idFoco && ativo.valor !== alvo.value) { alvo.value = ativo.valor; try { alvo.setSelectionRange(ativo.inicio, ativo.fim); } catch (_) {} }
          else alvo.select();
        }
      }
    }

    if (els.separacaoQrItens) {
      els.separacaoQrItens.innerHTML = avisoBloqueio + itens.map(renderQrItem).join("");
    }

    if (window.lucide) lucide.createIcons();
    containers.forEach(host=>window.SeparacaoOcorrencias?.sinalizar({sb:state.supabase,empresa:state.empresaId,pedido:pedido.id,host}));

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

      state.pedidos = await window.PedidoFluxo.fila(state.supabase,state.empresaId,'triagem');

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
        state.itens = await abrirKitsEmComponentes(itens || []);
        await aplicarProducao(pedidoIds);
      }
      await carregarRetornos();
      // Nov/2026: pedidos com problema reportado na separação e ainda não resolvido ganham a bolinha vermelha no cartão.
      state.problemas = {};
      try {
        const { data: probs, error: erroProbs } = await state.supabase.rpc("separacao_ocorrencias_listar", { p_empresa: state.empresaId, p_pedido: null });
        if (!erroProbs) (probs || []).forEach((o) => { if (o && o.estado !== "resolvida" && o.pedido_id) state.problemas[o.pedido_id] = (state.problemas[o.pedido_id] || 0) + 1; });
      } catch (_) {}
      state.bloqueados = new Set();
      const idaIds = state.pedidos.filter((p) => p.fluxo_etapa === "triagem").map((p) => p.id);
      for (let i = 0; i < idaIds.length; i += 100) {
        const { data: bloq, error: erroBloq } = await state.supabase.rpc("pedidos_pagamento_bloqueados", { p_pedidos: idaIds.slice(i, i + 100), p_etapa: "triagem" });
        if (erroBloq || !Array.isArray(bloq)) break;
        bloq.forEach((id) => state.bloqueados.add(String(id)));
      }
      // A Triagem acompanha as divergencias abertas ate a contagem do estoque ser finalizada.
      state.divergencias = await divergenciasAbertas(state.supabase, state.empresaId, "retorno");

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

  /* Kit nunca é separado como uma peça (out/2026): cada linha de Kit vira os componentes dele
     (kit_itens × quantidade do pedido). As linhas de componente são "virtuais": o progresso de cada uma
     fica no jsonb componentes da linha do Kit, e a linha do Kit guarda quantos kits estão completos. */
  async function abrirKitsEmComponentes(linhas) {
    const kits = linhas.filter((l) => String(l.itens?.tipo || "").toLowerCase() === "kit");
    if (!kits.length) return linhas;
    const kitIds = [...new Set(kits.map((l) => l.item_id))];
    const { data: composicao, error } = await state.supabase.from("kit_itens")
      .select("kit_id,item_id,quantidade,itens:itens!fk_kit_itens_item(id,codigo,produto,descricao_total,foto_url,setor_estoque,tipo)")
      .eq("empresa_id", state.empresaId).in("kit_id", kitIds);
    if (error) { console.warn("Componentes dos kits indisponíveis:", error); return linhas; }
    const porKit = new Map();
    (composicao || []).forEach((c) => { if (!porKit.has(c.kit_id)) porKit.set(c.kit_id, []); porKit.get(c.kit_id).push(c); });
    const saida = [];
    linhas.forEach((linha) => {
      const comps = String(linha.itens?.tipo || "").toLowerCase() === "kit" ? porKit.get(linha.item_id) : null;
      if (!comps || !comps.length) { saida.push(linha); return; }
      const salvo = linha.componentes && typeof linha.componentes === "object" ? linha.componentes : {};
      const kitNome = linha.item_nome || linha.itens?.descricao_total || linha.itens?.produto || "Kit";
      comps.forEach((c) => {
        const porUnidade = Number(c.quantidade) || 1;
        const reg = salvo[c.item_id] || {};
        saida.push({
          id: linha.id + "|" + c.item_id, virtual: true, kitRow: linha, kit_nome: kitNome, por_kit: porUnidade,
          empresa_id: linha.empresa_id, separacao_pedido_id: linha.separacao_pedido_id, item_id: c.item_id,
          item_nome: c.itens?.descricao_total || c.itens?.produto || "Componente", codigo_item: c.itens?.codigo || "",
          foto_url: c.itens?.foto_url || "", localizacao: c.itens?.setor_estoque || "", itens: c.itens || {},
          quantidade_solicitada: porUnidade * Number(linha.quantidade_solicitada || 0),
          quantidade_separada: Number(reg.separado || 0), patrimonios_lidos: Array.isArray(reg.patrimonios) ? reg.patrimonios : [],
          tipo_controle: "quantidade", status: "pendente"
        });
      });
    });
    return saida;
  }

  // Quanto de cada linha está em produção (personalização), quanto ficou pronto e quanto o separador já confirmou.
  async function aplicarProducao(pedidoIds) {
    const mapa = new Map();
    for (let i = 0; i < pedidoIds.length; i += 100) {
      const { data, error } = await state.supabase.rpc("separacao_producao", { p_pedidos: pedidoIds.slice(i, i + 100) });
      if (error) { console.warn("Produção da triagem indisponível:", error); return; }
      (Array.isArray(data) ? data : []).forEach((r) => mapa.set(r.pedido_id + "|" + r.item_id, r));
    }
    state.itens.forEach((item) => {
      const r = mapa.get(item.separacao_pedido_id + "|" + (item.virtual ? item.kitRow.item_id : item.item_id));
      if (!r) { delete item.prod; return; }
      const f = item.virtual ? Number(item.por_kit || 1) : 1;
      item.prod = { unidades: Number(r.unidades || 0) * f, prontas: Number(r.prontas || 0) * f, confirmadas: Number(r.confirmadas || 0) * f, personalizacoes: r.personalizacoes || "" };
    });
  }

  async function confirmarProducao(pedidoId, itemId, botao) {
    if (!modoEditavel()) { avisarSeparacaoBloqueada(); return; }
    if (botao) botao.disabled = true;
    try {
      const { error } = await state.supabase.rpc("separacao_producao_confirmar", { p_pedido: pedidoId, p_item: itemId });
      if (error) throw error;
      avisar("Recebimento da produção confirmado.", "Produção", "sucesso");
      await carregarFila();
    } catch (e) { avisar(e.message || String(e), "Produção", "aviso"); if (botao) botao.disabled = false; }
  }

  // Linha real do pedido + componente: é assim que as etiquetas de envio apontam para a peça.
  function linhaDoItem(item) { return item?.virtual ? item.kitRow.id : item?.id; }
  function chaveItem(item) { return linhaDoItem(item) + "|" + item?.item_id; }
  function chaveEtiqueta(e) { return e.separacao_item_id + "|" + e.item_id; }

  // Quantas peças já foram lidas na conferência de retorno de cada pedido carregado (nunca o total).
  async function carregarRetornos() {
    state.retornoLidos = new Map();
    const ids = state.pedidos.filter(idaConcluida).map((p) => p.id);
    if (!ids.length) return;
    try {
      const { data, error } = await state.supabase.from(TABLES.etiquetas).select("separacao_pedido_id,lida_retorno_em")
        .eq("empresa_id", state.empresaId).in("separacao_pedido_id", ids);
      if (error) throw error;
      (data || []).filter((e) => e.lida_retorno_em).forEach((e) => { const k = String(e.separacao_pedido_id); state.retornoLidos.set(k, (state.retornoLidos.get(k) || 0) + 1); });
    } catch (e) { console.warn("Leituras do retorno não carregadas:", e); }
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
    // Clicar no pedido da fila já abre a tela dele (out/2026).
    if (!modalSeparacaoAberto()) await abrirModoSeparacao(pedido.id);
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

    // Pagamento mínimo (Parâmetros > Financeiro): com a trava na Triagem, a separação não começa sem ele.
    const {data:pagamento,error:erroPagamento}=await state.supabase.rpc('pedido_pagamento_situacao',{p_pedido:pedido.id,p_etapa:'triagem'});
    if(!erroPagamento && pagamento && pagamento.liberada===false){avisar(pagamento.mensagem,'Separação','aviso');return;}
    const {data:modos,error:erroModos}=await state.supabase.rpc('separacao_modos_disponiveis',{p_empresa:state.empresaId});
    if(erroModos){avisar(erroModos.message,'Separação','erro');return;}
    state.modosDisponiveis=modos || {};
    // Modo travado por pedido (out/2026): o pedido iniciado num modo continua nele, sem perguntar de novo.
    if(pedido.modo_separacao){
      if(!state.modosDisponiveis[pedido.modo_separacao]){avisar(`Este pedido foi iniciado no modo ${nomeModo(pedido.modo_separacao)}, que não está liberado para você.`,'Separação','aviso');return;}
      abrirNoModo(pedido.modo_separacao);
      return;
    }
    document.querySelectorAll('[data-separacao-modo]').forEach(b=>{b.hidden=!state.modosDisponiveis[b.dataset.separacaoModo];});
    els.separacaoModoModal.querySelector('[data-sem-modos]').hidden=Object.values(state.modosDisponiveis).some(Boolean);
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

  const nomeModo=m=>({manual:'Manual',qr:'QR Code','um-clique':'1 clique'}[m]||m);
  function abrirNoModo(modo){
    if(modo==='manual')abrirManualSeparacao();
    if(modo==='qr')abrirQrSeparacao();
    if(modo==='um-clique')abrirUmCliqueSeparacao();
  }
  // Grava o modo escolhido no pedido; depois disso ele não muda mais.
  async function escolherModoSeparacao(modo){
    const pedido=getPedidoAtual();
    if(!pedido || !state.modosDisponiveis[modo])return;
    const {data,error}=await state.supabase.rpc('separacao_definir_modo',{p_pedido:pedido.id,p_modo:modo});
    if(error){avisar(error.message,'Separação','aviso');return;}
    pedido.modo_separacao=data || modo;
    abrirNoModo(pedido.modo_separacao);
  }

  function abrirManualSeparacao() {
    if(!state.modosDisponiveis["manual"])return;
    fecharModal(els.separacaoModoModal);
    state.activeMode = "manual";
    renderPedidoAtual();
    abrirModal(els.separacaoManualModal);
  }

  function abrirQrSeparacao() {
    if(!state.modosDisponiveis["qr"])return;
    fecharModal(els.separacaoModoModal);
    state.activeMode = "qr";
    renderPedidoAtual();
    abrirModal(els.separacaoQrModal, true);
  }

  function abrirUmCliqueSeparacao() {
    if(!state.modosDisponiveis["um-clique"])return;
    fecharModal(els.separacaoModoModal);
    state.activeMode = "um-clique";
    renderPedidoAtual();
    abrirModal(els.separacaoUmCliqueModal);
  }

  /* ---------- Câmera (out/2026): QR pelo celular, sem leitor ----------
     Usa o leitor nativo do navegador (BarcodeDetector) e, onde não existe (iPhone), a biblioteca jsQR. */
  const camera = { stream: null, timer: null, detector: null, canvas: null, ultimo: "", ultimoEm: 0, ocupado: false };

  function carregarJsQr() {
    if (window.jsQR) return Promise.resolve();
    return new Promise((ok, erro) => {
      const tag = document.createElement("script");
      tag.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
      tag.onload = () => ok();
      tag.onerror = () => erro(new Error("Leitor de QR indisponível."));
      document.head.appendChild(tag);
    });
  }

  async function lerQuadro() {
    const video = els.scannerVideo;
    if (!camera.stream || !video || video.readyState < 2) return "";
    if (camera.detector) {
      const achados = await camera.detector.detect(video).catch(() => []);
      return achados[0]?.rawValue || "";
    }
    if (!window.jsQR) return "";
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return "";
    camera.canvas ||= document.createElement("canvas");
    const escala = Math.min(1, 640 / w);
    camera.canvas.width = Math.round(w * escala);
    camera.canvas.height = Math.round(h * escala);
    const ctx = camera.canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, camera.canvas.width, camera.canvas.height);
    const img = ctx.getImageData(0, 0, camera.canvas.width, camera.canvas.height);
    return window.jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data || "";
  }

  async function iniciarCamera() {
    if (camera.stream) { pararCamera(); return; }
    if (!navigator.mediaDevices?.getUserMedia) {
      avisar("Este aparelho não permite usar a câmera aqui. Use o leitor ou digite o código.", "Câmera", "aviso");
      return;
    }
    try {
      if ("BarcodeDetector" in window) {
        const formatos = await window.BarcodeDetector.getSupportedFormats?.().catch(() => []) || [];
        if (formatos.includes("qr_code")) camera.detector = new window.BarcodeDetector({ formats: ["qr_code", "code_128", "ean_13"].filter((f) => formatos.includes(f)) });
      }
      if (!camera.detector) await carregarJsQr();
      camera.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    } catch (erro) {
      camera.stream = null;
      avisar(erro?.name === "NotAllowedError" ? "Permita o uso da câmera para ler os QR codes." : "Não foi possível abrir a câmera.", "Câmera", "aviso");
      return;
    }
    els.scannerVideo.srcObject = camera.stream;
    els.scannerVideo.play?.().catch(() => {});
    if (els.scannerCamera) els.scannerCamera.hidden = false;
    if (els.scannerVisual) els.scannerVisual.hidden = true;
    const rotulo = els.btnCameraSeparacao?.querySelector("span");
    if (rotulo) rotulo.textContent = "Desligar câmera";
    setScannerStatus("Aponte a câmera para o QR", "ok");
    camera.timer = setInterval(async () => {
      if (camera.ocupado) return;
      camera.ocupado = true;
      try {
        const codigo = String(await lerQuadro() || "").trim();
        const agora = Date.now();
        // O mesmo código seguido só conta de novo depois de 2 s (a câmera vê o QR várias vezes por segundo).
        if (codigo && (codigo !== camera.ultimo || agora - camera.ultimoEm > 2000)) {
          camera.ultimo = codigo; camera.ultimoEm = agora;
          navigator.vibrate?.(60);
          await processarCodigo(codigo);
        }
      } finally { camera.ocupado = false; }
    }, 250);
  }

  function pararCamera() {
    clearInterval(camera.timer); camera.timer = null;
    camera.stream?.getTracks().forEach((t) => t.stop());
    camera.stream = null;
    if (els.scannerVideo) els.scannerVideo.srcObject = null;
    if (els.scannerCamera) els.scannerCamera.hidden = true;
    if (els.scannerVisual) els.scannerVisual.hidden = false;
    const rotulo = els.btnCameraSeparacao?.querySelector("span");
    if (rotulo) rotulo.textContent = "Ler com a câmera";
  }

  // Etiquetas do sistema trazem o tipo no QR: ACERVO:PAT:<patrimônio fixo>, ACERVO:ENV:<etiqueta de envio>,
  // ACERVO:ITEM:<código do item>. Sem prefixo (leitor/digitado), vale o código puro.
  function lerEtiqueta(texto) {
    const t = String(texto || "").trim();
    const m = /^ACERVO:(PAT|ITEM|ENV):(.+)$/i.exec(t);
    return m ? { tipo: m[1].toUpperCase(), codigo: m[2].trim() } : { tipo: "", codigo: t };
  }

  async function buscarEtiquetaEnvio(codigo) {
    const { data, error } = await state.supabase.from(TABLES.etiquetas).select("*")
      .eq("empresa_id", state.empresaId).eq("codigo", codigo).maybeSingle();
    if (error && error.code !== "42P01") throw error;
    return data || null;
  }

  /* Relatório de separação (out/2026): a lista para a equipe levar ao galpão, em A4, agrupada pelo local do
     estoque (para andar menos), com caixinha para marcar à mão, observações e assinaturas. */
  function imprimirRelatorioSeparacao() {
    const pedido = getPedidoAtual();
    if (!pedido) { avisar("Selecione um pedido.", "Relatório", "aviso"); return; }
    const itens = itensDoPedido(pedido.id, true);
    if (!itens.length) { avisar(state.meusSetores ? "Este pedido não tem itens dos seus setores." : "Este pedido não tem itens para separar.", "Relatório", "aviso"); return; }
    const obs = pedido.observacoes && typeof pedido.observacoes === "object" ? pedido.observacoes : {};
    const notasItens = Array.isArray(obs.itens_operacionais) ? obs.itens_operacionais : [];
    const notaDoItem = (item) => {
      const alvo = item.virtual ? item.kitRow.item_id : item.item_id;
      const n = notasItens.find((x) => String(x.item_id) === String(alvo));
      return String(n?.observacoes?.separacao || n?.texto || "").trim();
    };
    const grupos = new Map();
    itens.forEach((item) => {
      const local = item.localizacao || item.itens?.setor_estoque || "Sem local definido";
      if (!grupos.has(local)) grupos.set(local, []);
      grupos.get(local).push(item);
    });
    const ordenados = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
    const resumo = pedidoResumo(pedido.id);
    const data = (v) => (v ? formatDateOnly(v) : "-");
    const linhas = ordenados.map(([local, lista]) =>
      '<tr class="grupo"><td colspan="7">' + escapeHtml(local) + " · " + lista.length + " item(ns)</td></tr>" +
      lista.map((item) => {
        const foto = item.foto_url || item.itens?.foto_url || "";
        const nota = notaDoItem(item);
        const separado = itemSeparado(item), total = itemTotal(item);
        return '<tr' + (separado >= total && total ? ' class="ok"' : "") + '>' +
          '<td class="foto">' + (foto ? '<img src="' + escapeHtml(foto) + '" alt="">' : "") + "</td>" +
          '<td><strong>' + escapeHtml(nomeItemSeparacao(item)) + "</strong>" +
            (item.kit_nome ? '<small>Parte do kit: ' + escapeHtml(item.kit_nome) + "</small>" : "") +
            (nota ? '<small class="nota">Obs.: ' + escapeHtml(nota) + "</small>" : "") + "</td>" +
          '<td class="cod">' + escapeHtml(item.codigo_item || item.itens?.codigo || "") + "</td>" +
          '<td class="num">' + escapeHtml(formatQty(total)) + "</td>" +
          '<td class="escrever"><span></span>' + (separado ? '<small>sistema: ' + escapeHtml(formatQty(separado)) + '</small>' : '') + '</td>' +
          '<td class="escrever"><span></span></td>' +
          '<td class="check"><span></span></td></tr>';
      }).join("")).join("");
    const empresa = window.__CONTEXT?.empresa_nome || "";
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>Separação · Pedido ' + escapeHtml(pedido.numero_pedido || "") + '</title><style>' +
      '@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#1f1d1a;font-size:11pt}' +
      'header{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #1f1d1a;padding-bottom:8px;margin-bottom:10px}' +
      'header .marca{font-size:9pt;letter-spacing:.14em;text-transform:uppercase;color:#6b665e}header h1{margin:2px 0 0;font-size:20pt}' +
      'header .dir{text-align:right;font-size:10pt;line-height:1.5}' +
      '.dados{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 16px;font-size:10pt;margin-bottom:10px}.dados b{display:block;font-size:8pt;text-transform:uppercase;color:#6b665e;letter-spacing:.06em}' +
      '.obs{border:1px solid #c9c2b5;border-radius:6px;padding:6px 10px;margin-bottom:10px;font-size:10pt}' +
      'table{width:100%;border-collapse:collapse}th{text-align:left;font-size:8.5pt;text-transform:uppercase;color:#6b665e;border-bottom:1px solid #1f1d1a;padding:5px 6px}' +
      'td{border-bottom:1px solid #e1dbcf;padding:6px;vertical-align:middle}tr{break-inside:avoid}' +
      'tr.grupo td{background:#ebedef;font-weight:600;font-size:10pt;border-bottom:1px solid #c9c2b5;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      'td.foto{width:16mm}td.foto img{width:14mm;height:14mm;object-fit:cover;border-radius:3px}' +
      'td small{display:block;font-size:8.5pt;color:#6b665e;margin-top:2px}td small.nota{color:#8a4b04}' +
      'td.cod{font-family:"Courier New",monospace;font-size:9pt;width:30mm}td.num{text-align:center;font-size:13pt;font-weight:600;width:18mm}' +
      'td.escrever{width:22mm;text-align:center}td.escrever span{display:inline-block;width:17mm;height:8mm;border:1.2px solid #1f1d1a;border-radius:1.5mm}td.escrever small{font-size:7pt}' +
      'td.check{width:14mm;text-align:center}td.check span{display:inline-block;width:6mm;height:6mm;border:1.5px solid #1f1d1a;border-radius:1.5mm}' +
      'tr.ok td.check span{background:#1f1d1a;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.assin{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;margin-top:22px;font-size:9pt;color:#6b665e}.assin div{border-top:1px solid #1f1d1a;padding-top:4px}' +
      '</style></head><body>' +
      '<header><div><div class="marca">' + escapeHtml(empresa) + '</div><h1>Separação · Pedido ' + escapeHtml(pedido.numero_pedido || "-") + '</h1></div>' +
      '<div class="dir"><b>' + escapeHtml(formatQty(resumo.total)) + ' peça(s)</b><br>' + escapeHtml(formatQty(resumo.separado)) + ' já separada(s)<br>Impresso em ' + escapeHtml(new Date().toLocaleString("pt-BR")) + '</div></header>' +
      '<div class="dados"><div><b>Cliente</b>' + escapeHtml(pedido.cliente_nome || "-") + '</div><div><b>Evento</b>' + escapeHtml(pedido.tipo_evento || "-") + '</div><div><b>Local</b>' + escapeHtml(pedidoLocal(pedido)) + '</div>' +
      '<div><b>Entrega</b>' + escapeHtml(data(pedido.data_entrega)) + '</div><div><b>Evento</b>' + escapeHtml(data(pedido.data_evento)) + '</div><div><b>Coleta</b>' + escapeHtml(data(pedido.data_coleta)) + '</div></div>' +
      (String(obs.observacoes_separacao || "").trim() ? '<div class="obs"><b>Observações da separação:</b> ' + escapeHtml(obs.observacoes_separacao) + '</div>' : "") +
      '<table><thead><tr><th></th><th>Item</th><th>Código</th><th style="text-align:center">Pedido</th><th style="text-align:center">Separado</th><th style="text-align:center">Faltou</th><th style="text-align:center">OK</th></tr></thead><tbody>' + linhas + '</tbody></table>' +
      '<div class="assin"><div>Separado por</div><div>Conferido por</div><div>Data e hora</div></div>' +
      '</body></html>';
    const quadro = document.createElement("iframe");
    quadro.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(quadro);
    const doc = quadro.contentDocument;
    doc.open(); doc.write(html); doc.close();
    window.__ultimoRelatorioSeparacao = html; // para os testes
    const imprimir = () => { try { quadro.contentWindow.focus(); quadro.contentWindow.print(); } catch (e) { console.error(e); } setTimeout(() => quadro.remove(), 60000); };
    // espera as fotos carregarem (até 2,5 s) para saírem no papel
    const imgs = [...doc.images];
    Promise.race([Promise.all(imgs.map((i) => (i.complete ? null : new Promise((ok) => { i.onload = i.onerror = ok; })))), new Promise((ok) => setTimeout(ok, 2500))]).then(imprimir);
  }

  /* Etiquetas de envio (out/2026): uma por móvel do pedido, criadas na hora (só as que faltam) e impressas. */
  async function imprimirEtiquetasEnvio() {
    const pedido = getPedidoAtual();
    if (!pedido) { avisar("Selecione um pedido.", "Etiquetas", "aviso"); return; }
    if (!window.EasyLocEtiquetas) { avisar("Gerador de etiquetas indisponível.", "Etiquetas", "erro"); return; }
    const itens = state.itens.filter((item) => String(item.separacao_pedido_id) === String(pedido.id));
    if (!itens.length) { avisar("Este pedido não tem itens para etiquetar.", "Etiquetas", "aviso"); return; }
    const formato = await window.EasyLocEtiquetas.escolherFormato("100x150");
    if (!formato) return;
    const { data: existentes, error } = await state.supabase.from(TABLES.etiquetas).select("*")
      .eq("empresa_id", state.empresaId).eq("separacao_pedido_id", pedido.id);
    if (error) { console.error(error); avisar("Não foi possível ler as etiquetas do pedido.", "Etiquetas", "erro"); return; }
    const lista = existentes || [];
    const numero = String(pedido.numero_pedido || "PED").replace(/\s+/g, "");
    let proximo = lista.reduce((max, e) => Math.max(max, Number(String(e.codigo).split("-").pop()) || 0), 0);
    const novas = [];
    itens.forEach((item) => {
      const total = Math.max(0, Math.round(itemTotal(item)));
      const ja = new Set(lista.filter((e) => chaveEtiqueta(e) === chaveItem(item)).map((e) => e.sequencia));
      for (let seq = 1; seq <= total; seq++) {
        if (ja.has(seq)) continue;
        proximo += 1;
        novas.push({ empresa_id: state.empresaId, separacao_pedido_id: pedido.id, separacao_item_id: linhaDoItem(item), item_id: item.item_id,
          codigo: numero + "-" + String(proximo).padStart(3, "0"), sequencia: seq, total_item: total,
          patrimonio_codigo: item.patrimonios_lidos?.[seq-1] || null });
      }
    });
    if (novas.length) {
      const { data: criadas, error: erroCriar } = await state.supabase.from(TABLES.etiquetas).insert(novas).select("*");
      if (erroCriar) { console.error(erroCriar); avisar("Não foi possível criar as etiquetas.", "Etiquetas", "erro"); return; }
      lista.push(...(criadas && criadas.length ? criadas : novas));
    }
    const ordemItem = new Map(itens.map((item, i) => [chaveItem(item), i]));
    const validas = lista.filter((e) => ordemItem.has(chaveEtiqueta(e)))
      .sort((a, b) => ordemItem.get(chaveEtiqueta(a)) - ordemItem.get(chaveEtiqueta(b)) || a.sequencia - b.sequencia);
    const dataEntrega = formatDateOnly(pedido.data_entrega || pedido.data_evento);
    const marca = window.__CONTEXT?.empresa_nome || "";
    await window.EasyLocEtiquetas.imprimir({
      formato,
      etiquetas: validas.map((e) => {
        const item = itens.find((i) => chaveItem(i) === chaveEtiqueta(e));
        return {
          qr: "ACERVO:ENV:" + e.codigo, marca, destaque: "PEDIDO " + (pedido.numero_pedido || "-"),
          titulo: nomeItemSeparacao(item), codigo: e.codigo, contador: e.sequencia + " de " + e.total_item,
          linhas: [pedido.cliente_nome || "", pedidoLocal(pedido), "Entrega: " + dataEntrega, pedido.tipo_evento || ""]
        };
      })
    });
    avisar(validas.length + " etiqueta(s) de envio" + (novas.length ? " (" + novas.length + " nova(s))" : "") + ". Leia a etiqueta de cada móvel para marcar como separado.", "Etiquetas", "sucesso");
  }

  function focarLeitor() {
    if (camera.stream) { setScannerStatus("Aponte a câmera para o QR", "ok"); return; }
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
    const lida = lerEtiqueta(codigoLido);
    const codigo = lida.codigo;
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

      // Etiqueta de envio: marca aquela unidade do pedido (uma leitura por etiqueta).
      const etiqueta = lida.tipo === "ENV" || !lida.tipo ? await buscarEtiquetaEnvio(codigo) : null;
      if (etiqueta) {
        await processarEtiquetaEnvio({ codigo, etiqueta, pedido });
        return;
      }
      if (lida.tipo === "ENV") {
        await registrarLeitura({ codigo, status: "erro", observacao: "Etiqueta de envio não encontrada" });
        setScannerStatus("Etiqueta não encontrada", "error");
        setUltimaLeitura({ tipo: "erro", codigo, observacao: "Etiqueta não encontrada" });
        return;
      }

      const patrimonio = lida.tipo === "ITEM" ? null : await buscarPatrimonio(codigo);
      const itemCadastro = patrimonio?.itens || (lida.tipo === "PAT" ? null : await buscarItemPorCodigo(codigo));
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
        const ehKit = String(itemCadastro?.tipo || "").toLowerCase() === "kit";
        const aviso = ehKit ? "Kit: leia cada componente" : "Item fora do pedido";
        setScannerStatus(aviso, "error");
        setUltimaLeitura({ tipo: "erro", codigo, itemNome: aviso, observacao: aviso });
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

      // QR fixo (patrimônio): conta e guarda qual móvel foi lido, para o mesmo nunca contar duas vezes.
      if (patrimonio || (itemSeparacao.tipo_controle || "quantidade") === "patrimonio") {
        await processarPatrimonio({ codigo, patrimonio, itemSeparacao });
      } else {
        await incrementarQuantidade({ codigo, itemSeparacao });
      }
    } catch (err) {
      console.error("Erro ao processar leitura:", err);
      setScannerStatus("Erro na leitura", "error");
      setUltimaLeitura({ tipo: "erro", codigo, observacao: err.message || "Erro inesperado na leitura" });
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
      .select("id,codigo,produto,descricao_total,foto_url,setor_estoque,tipo")
      .eq("empresa_id", state.empresaId)
      .or(["codigo", "referencia", "qr_code"].map((c) => c + ".eq." + codigo.replace(/[,()]/g, "")).join(","))
      .limit(1);

    if (error) throw error;
    return (data || [])[0] || null;
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

  async function processarEtiquetaEnvio({ codigo, etiqueta, pedido }) {
    const erro = async (obs, status = "erro") => {
      await registrarLeitura({ codigo, itemId: etiqueta.item_id, separacaoItemId: etiqueta.separacao_item_id, status, observacao: obs });
      setScannerStatus(obs, "error");
      setUltimaLeitura({ tipo: "erro", codigo, observacao: obs });
    };
    if (String(etiqueta.separacao_pedido_id) !== String(pedido.id)) return erro("Etiqueta de outro pedido");
    if (etiqueta.lida_separacao_em) return erro("Esta etiqueta já foi lida", "bloqueado");
    const itemSeparacao = state.itens.find((item) => chaveItem(item) === chaveEtiqueta(etiqueta));
    if (!itemSeparacao) return erro("Item da etiqueta não está mais no pedido");
    if (itemSeparado(itemSeparacao) >= itemTotal(itemSeparacao)) return erro("Quantidade já completa", "bloqueado");
    const novaQtd = itemSeparado(itemSeparacao) + 1;
    await atualizarItemSeparacao(itemSeparacao, { quantidade_separada: novaQtd, status: novaQtd >= itemTotal(itemSeparacao) ? "concluido" : "em_andamento" }, etiqueta.id);
    await registrarLeitura({ codigo, itemId: itemSeparacao.item_id, separacaoItemId: itemSeparacao.id, tipoControle: "etiqueta", status: "sucesso", observacao: "Etiqueta de envio " + etiqueta.sequencia + " de " + etiqueta.total_item });
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
    if(delta < 0) await carregarFila();
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
    if(novaQtd < atual) await carregarFila();
  }

  async function atualizarItemSeparacao(itemSeparacao, payload, etiquetaId = null) {
    if (!itemVisivel(itemSeparacao)) throw new Error(`Este item é do setor ${setorDoItem(itemSeparacao)}, que não está liberado para você separar.`);
    const modo=state.activeMode;
    if(!state.modosDisponiveis[modo])throw new Error('Este modo de separação não está liberado para você.');
    payload={...payload,modo_separacao:modo};
    if (itemSeparacao.virtual) {
      const anterior = { ...itemSeparacao };
      Object.assign(itemSeparacao, payload);
      const kit = itemSeparacao.kitRow;
      const irmaos = state.itens.filter((i) => i.virtual && i.kitRow === kit);
      const componentes = {};
      irmaos.forEach((i) => { componentes[i.item_id] = { separado: itemSeparado(i), patrimonios: i.patrimonios_lidos || [] }; });
      const kitsCompletos = Math.min(...irmaos.map((i) => Math.floor(itemSeparado(i) / (i.por_kit || 1))));
      const algum = irmaos.some((i) => itemSeparado(i) > 0);
      const dadosKit = {
        componentes, modo_separacao:modo, quantidade_separada: kitsCompletos,
        status: irmaos.every((i) => itemSeparado(i) >= itemTotal(i)) ? "concluido" : algum ? "em_andamento" : "pendente",
        atualizado_por: state.usuarioId, atualizado_em: new Date().toISOString()
      };
      const { error: erroKit } = await state.supabase.rpc("operacao_atualizar_separacao", { p_item:kit.id,p_dados:dadosKit,p_quantidade_anterior:kit.quantidade_separada || 0,p_componentes_anteriores:kit.componentes || {},p_etiqueta:etiquetaId });
      if (erroKit) { Object.assign(itemSeparacao, anterior); throw erroKit; }
      Object.assign(kit, dadosKit);
      return;
    }
    const { error } = await state.supabase.rpc("operacao_atualizar_separacao", {
      p_item:itemSeparacao.id,p_dados:payload,p_quantidade_anterior:itemSeparacao.quantidade_separada || 0,
      p_componentes_anteriores:itemSeparacao.componentes || {},p_etiqueta:etiquetaId
    });
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
      separacao_item_id: separacaoItemId ? String(separacaoItemId).split("|")[0] : null,
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

  function pendenciasDoPedido(pedidoId){
    return itensDoPedido(pedidoId).map(item=>({
      nome:nomeItemSeparacao(item),codigo:item.itens?.codigo||item.item_codigo||'',setor:setorDoItem(item),
      solicitada:itemTotal(item)+itemProducao(item),separada:itemSeparado(item)+Math.min(Number(item.prod?.confirmadas||0),itemProducao(item)),
      faltante:itemFaltante(item)+Math.max(itemProducao(item)-Number(item.prod?.confirmadas||0),0)
    })).filter(item=>item.faltante>0);
  }
  function mostrarPendenciasSeparacao(itens,titulo='Revise a separação',texto='Separe os itens abaixo para finalizar a triagem.'){
    const dialog=document.createElement('dialog');dialog.className='separacao-pendencias-dialog';
    dialog.setAttribute('aria-labelledby','separacaoPendenciasTitulo');
    dialog.innerHTML='<header><h2 id="separacaoPendenciasTitulo">'+escapeHtml(titulo)+'</h2></header><p>'+escapeHtml(texto)+'</p><div class="separacao-pendencias-lista"><table><thead><tr><th>Item pendente</th><th>Separado / necessário</th><th>Falta</th></tr></thead><tbody>'+itens.map(i=>'<tr><td><strong>'+escapeHtml(i.nome||'Item')+'</strong><small>'+escapeHtml([i.codigo,i.setor].filter(Boolean).join(' · '))+'</small></td><td>'+escapeHtml(formatQty(i.separada))+' / '+escapeHtml(formatQty(i.solicitada))+'</td><td><b>'+escapeHtml(formatQty(i.faltante))+'</b></td></tr>').join('')+'</tbody></table></div><footer><button type="button" class="btn secondary">Fechar</button></footer>';
    document.body.append(dialog);dialog.showModal();dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
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

    // Separação por setor: a parte da pessoa pronta e outros setores faltando → avisa e fecha (a triagem termina
    // quando o último setor separar).
    if (resumo.faltante > 0 && state.meusSetores && pedidoResumo(pedido.id, true).faltante === 0) {
      mostrarPendenciasSeparacao(pendenciasDoPedido(pedido.id),'Pendências de outros setores','Sua parte está separada. Os itens abaixo ainda precisam ser separados pelos outros setores.');
      await carregarFila();
      return "parcial";
    }
    // A triagem só termina com a separação inteira (out/2026): não existe mais finalizar com divergência.
    const emProducao = itensDoPedido(pedido.id).reduce((s, i) => s + Math.max(itemProducao(i) - Number(i.prod?.confirmadas || 0), 0), 0);
    if (resumo.faltante > 0 && emProducao > 0 && resumo.faltante <= emProducao) {
      mostrarPendenciasSeparacao(pendenciasDoPedido(pedido.id),'Aguardando a Produção','A parte do galpão está separada. Falta receber e conferir as peças abaixo que estão em produção.');
      await carregarFila();
      return "parcial";
    }
    if (resumo.faltante > 0) {
      mostrarPendenciasSeparacao(pendenciasDoPedido(pedido.id),'Separação incompleta');
      return false;
    }

    try { await state.capas?.salvar(true);await atualizarPedidoStatus(pedido.id, status, true, {
      finalizado_por: state.usuarioId,
      finalizado_em: new Date().toISOString(),
      motivo_divergencia: motivo || null
    }); } catch(error){
      let pendentes;try{const detalhe=JSON.parse(error.details||'null');if(Array.isArray(detalhe))pendentes=detalhe.filter(i=>Number(i.faltante)>0);}catch{}
      if(pendentes?.length)mostrarPendenciasSeparacao(pendentes);
      else if(/itens? pendentes/i.test(error.message||'')&&pendenciasDoPedido(pedido.id).length)mostrarPendenciasSeparacao(pendenciasDoPedido(pedido.id));
      else avisar(error.message, "Revise a separação", "aviso");
      await carregarFila();
      return false;
    }

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

    const itens = itensDoPedido(pedido.id, true);
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
    document.addEventListener('click',e=>{
      const b=e.target.closest('[data-reportar-problema],[data-ver-ocorrencias]');if(!b)return;
      const item=itemPorId(b.dataset.reportarProblema||b.dataset.verOcorrencias);if(!item)return;
      const op={sb:state.supabase,empresa:state.empresaId,pedido:item.separacao_pedido_id,item:item.item_id};
      if(b.hasAttribute('data-ver-ocorrencias')){window.SeparacaoOcorrencias.abrirPainel({...op,fila:'triagem'});return;}
      if(!modoEditavel()){avisarSeparacaoBloqueada();return;}
      window.SeparacaoOcorrencias.reportar({...op,linha:linhaDoItem(item),quantidade:itemTotal(item)+itemProducao(item),nome:itemBaseInfo(item).nome,aoSalvar:renderItens});
    });
    document.addEventListener('separacao-ocorrencias-atualizadas',()=>{if(getPedidoAtual())renderItens();});
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-confirmar-producao]");
      if (b) confirmarProducao(b.dataset.pedido, b.dataset.confirmarProducao, b);
    });
    els.btnAtualizarSeparacao?.addEventListener("click", carregarFila);
    els.btnCameraSeparacao?.addEventListener("click", () => iniciarCamera().catch(console.error));
    document.querySelectorAll("[data-relatorio-separacao]").forEach((botao) => botao.addEventListener("click", () => { try { imprimirRelatorioSeparacao(); } catch (e) { console.error(e); avisar("Não foi possível imprimir o relatório.", "Relatório", "erro"); } }));
    document.querySelectorAll("[data-etiquetas-envio]").forEach((botao) => botao.addEventListener("click", () => imprimirEtiquetasEnvio().catch((e) => { console.error(e); avisar("Não foi possível imprimir as etiquetas.", "Etiquetas", "erro"); })));
    els.separacaoBuscaPedido?.addEventListener("input", renderFila);
    els.separacaoStatusFiltro?.addEventListener("change", renderFila);

    els.separacaoKanban?.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-separacao-action]");
      if (actionButton) {
        event.preventDefault();
        event.stopPropagation();
        const pedidoId = actionButton.dataset.pedidoId;
        const action = actionButton.dataset.separacaoAction;
        if(action==='reabrir-triagem'){
          (async()=>{actionButton.disabled=true;const {error}=await state.supabase.rpc('operacao_transferir_pedido',{p_pedido:pedidoId,p_acao:'reabrir_triagem',p_motivo:'Correção antes do início da Expedição'});if(error)throw error;await carregarFila();await iniciarPedidoSeparacao(pedidoId);})().catch(e=>{actionButton.disabled=false;avisar(e.message,'Triagem','aviso');});return;
        }
        if (action === "liberar-retirada") {
          const pedido = state.pedidos.find(p => String(p.id) === String(pedidoId));
          if(!pedido || !STATUS_EM_ANDAMENTO.has(pedido.status) || pedido.status_operacional) return;
          const liberar = !pedido?.reducao_liberada_em;
          (async () => {
            if(liberar && !await window.confirmarGlobal("O pedido voltará ao Comercial e sairá da fila da Triagem até a revisão ser salva. Peças separadas precisam ser desmarcadas antes de reduzir a quantidade.", "Liberar pedido", { confirmarTexto: "Liberar", cancelarTexto: "Voltar" })) return;
            actionButton.disabled = true;
            const { error } = await state.supabase.rpc("pedido_liberar_reducao", { p_pedido: pedidoId, p_liberar: liberar });
            if(error) throw error;
            await carregarFila();
          })().catch(error => { actionButton.disabled = false; avisar(error.message, "Retirada", "erro"); });
          return;
        }
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
      if (action === "retorno") abrirConferenciaRetorno(card.dataset.pedidoId);
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
      if (action === "retorno") abrirConferenciaRetorno(card.dataset.pedidoId);
    });

    els.separacaoModoModal?.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-separacao-modal]")) {
        fecharModal(els.separacaoModoModal);
        return;
      }
      const option = event.target.closest("[data-separacao-modo]");
      if (!option) return;
      const modo = option.dataset.separacaoModo;
      escolherModoSeparacao(modo).catch((e) => avisar(e.message, "Separação", "erro"));
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
      // Salva (o change dispara no blur) e já vai para a próxima linha editável (Shift+Enter volta para a anterior).
      const campos = [...els.separacaoManualItens.querySelectorAll("[data-manual-qty]:not(:disabled)")];
      const proximo = campos[campos.indexOf(input) + (event.shiftKey ? -1 : 1)];
      state.focoManual = proximo ? { id: proximo.dataset.separacaoItemId, ate: Date.now() + 4000 } : null;
      if (proximo) { proximo.focus({ preventScroll: true }); proximo.select(); proximo.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
      else input.blur();
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
    await window.aguardarContexto?.(); // espera a empresa ser identificada (ver CLAUDE.md, "aguardarContexto")
    state.empresaId = window.__CONTEXT?.empresa_id;
    state.usuarioId = window.__CONTEXT?.usuario_id;
    state.usuarioNome = window.__CONTEXT?.usuario_nome || "Usuario";

    if (!state.supabase || !state.empresaId || !state.usuarioId) {
      setupState("Contexto do Acervo indisponivel. Faca login novamente para acessar a separacao.");
      return;
    }

    bindEvents();
    await carregarMeusSetores();
    await carregarFila();
    await abrirPedidoDaUrl();
    // Sem botão Atualizar (out/2026): a fila se atualiza sozinha a cada 30 s e ao voltar para a aba,
    // nunca enquanto uma janela de separação está aberta (para não mexer na tela de quem está bipando).
    state.autoTimer = setInterval(async () => {
      if(document.visibilityState !== "visible" || state.verificandoRevisao) return;
      if(!modalSeparacaoAberto()){ carregarFila(); return; }
      if(document.activeElement?.matches("[data-manual-qty]")) return;
      const pedido = getPedidoAtual();
      if(!pedido) return;
      state.verificandoRevisao = true;
      try {
        const {data,error} = await state.supabase.from(TABLES.pedidos).select("revisao").eq("id",pedido.id).eq("empresa_id",state.empresaId).maybeSingle();
        if(!error && data && Number(data.revisao || 0)!==Number(pedido.revisao || 0)){
          await carregarFila();
          setScannerStatus("Lista atualizada pelo comercial. Confira os novos itens.","ok");
        }
      } finally { state.verificandoRevisao = false; }
    }, 10000);
    state.autoVisivel = () => { if (document.visibilityState === "visible" && !modalSeparacaoAberto()) carregarFila(); };
    document.addEventListener("visibilitychange", state.autoVisivel);
  }

  /* Aberto pelo cronograma (out/2026): ?pedido=<id>&etapa=ida|volta abre direto o pedido. */
  async function abrirPedidoDaUrl() {
    const params = new URLSearchParams(location.search);
    const pedidoId = params.get("pedido");
    if (!pedidoId || !state.dbReady) return;
    const pedido = state.pedidos.find((p) => String(p.id) === String(pedidoId));
    if (!pedido) {
      const { data } = await state.supabase.from(TABLES.pedidos).select("numero_pedido,status_comercial")
        .eq("empresa_id", state.empresaId).eq("id", pedidoId).maybeSingle();
      const numero = data?.numero_pedido ? "O pedido " + data.numero_pedido : "Este pedido";
      avisar(data && !["pre_reserva", "aprovado"].includes(data.status_comercial)
        ? numero + " ainda não reservou os itens (precisa estar em pré-reserva ou aprovado para ter a lista de separação)."
        : numero + " não está na fila de separação.", "Separação", "aviso");
      return;
    }
    if (params.get("etapa") === "volta") { abrirConferenciaRetorno(pedido.id); return; }
    if (pedido.status === "pendente" && separacaoLiberada(pedido)) await iniciarPedidoSeparacao(pedido.id);
    if (pedidoOperavel(pedido)) await abrirModoSeparacao(pedido.id);
    else await abrirResumoSeparacao(pedido.id);
  }

  function destroy() {
    if (state.keyHandler) {
      document.removeEventListener("keydown", state.keyHandler);
    }
    clearTimeout(state.scanTimer);
    clearInterval(state.autoTimer);
    if (state.autoVisivel) document.removeEventListener("visibilitychange", state.autoVisivel);
    fecharTodosModais();
    delete window.__separacaoMateriaisLoaded;
  }

  async function initSeparacaoMateriais() {
    if (window.__separacaoMateriaisLoaded) return;
    window.__separacaoMateriaisLoaded = true;
    await init();
  }

  requestAnimationFrame(() => requestAnimationFrame(initSeparacaoMateriais));

  window.__activeModuleDestroy = destroy;
})();
