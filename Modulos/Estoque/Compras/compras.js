(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—");
  const notify = (message, type = "success") => (window.AcervoComprasAlert ? window.AcervoComprasAlert[type === "error" ? "error" : "success"](message) : alert(message));

  const state = {
    needs: [], quotations: [], orders: [], suppliers: [], compositionQuotes: [],
    selectedNeedIds: new Set(),
    supplierQuality: new Map(),
    quoteBuilderNeeds: [], quoteSelectedSupplierIds: new Set(), purchaseLeadDays: 5, consolidationBase: null, consolidationCandidates: [], consolidationSelected: new Set(),
    currentWorkspace: null, activeSupplierId: null, proposalsMode: "launch", pendingAiDocument: null, lastAiResult: null, pendingAiMatchIndex: null,
    currentOrderDetail: null,
    pendingInvoiceOrder: null,
  };

  const URGENCY_LABEL = { atrasado: "Atrasada", critico: "Crítica", atencao: "Atenção", normal: "No prazo", sem_data: "Sem data" };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bind();
    window.addEventListener("compra-registrada",async()=>{await reloadAll();$("comprasSearch").value="";$("ordersStatusFilter").value="todos";selectTab("orders");renderOrders();});
    try {
      if (window.AcervoComprasAuth?.ready) await window.AcervoComprasAuth.ready;
      const [suppliers, pcpParams] = await Promise.all([window.AcervoComprasAPI.listSuppliers(true), window.AcervoComprasAPI.getPcpParameters()]);
      state.suppliers = suppliers || [];
      try { ((await window.AcervoComprasAPI.listSupplierQualityIndex()) || []).forEach((row) => state.supplierQuality.set(row.supplier_id, row)); } catch { /* indice e informativo */ }
      state.purchaseLeadDays = Number(pcpParams?.purchase_quotation_lead_days ?? 5);
      await reloadAll();
      openAgendaNeed();
    } catch (e) {
      console.error(e);
      notify(e?.message || "Não foi possível carregar Compras.", "error");
    }
  }

  // (2026-10-12) Links da Agenda ("Meu dia"): ?necessidade= | ?cotacao= | ?pedido= (a divergência, ?rnc=, abre em compras-rnc.js)
  function openAgendaNeed() {
    const params = new URLSearchParams(location.search);
    if (params.get('cotacao')) {
      if (state.quotations.some((q) => q.id === params.get('cotacao'))) { selectTab('quotations'); openProposals(params.get('cotacao')); }
      else notify('Esta cotação não está mais aberta.', 'error');
      return;
    }
    if (params.get('pedido')) { selectTab('orders'); openOrderDetail(params.get('pedido')); return; }
    const id = params.get('necessidade'); if (!id) return;
    const need = state.needs.find((n) => n.id === id);
    selectTab(!need || ['op_faltando', 'ferramental'].includes(need.origem) ? 'needs-op' : need.origem === 'manutencao' ? 'needs-servicos' : 'needs-avulsa');
    const row = document.querySelector('[data-need-id="' + CSS.escape(id) + '"]');
    if (!row) { notify('A necessidade já saiu desta fila. Confira os pedidos e cotações.', 'error'); return; }
    if (row.classList.contains('pv-row-clickable') && !state.selectedNeedIds.has(id)) { state.selectedNeedIds.add(id); row.classList.add('is-selected'); row.setAttribute('aria-selected', 'true'); updateSelectionBar(); }
    row.scrollIntoView({ block: 'center' }); row.focus();
  }
  window.addEventListener('compras-recarregar', () => reloadAll().catch(() => {}));
  async function reloadAll() {
    const [needs, quotations, orders] = await Promise.all([
      window.AcervoComprasAPI.listPurchaseNeeds(),
      window.AcervoComprasAPI.listQuotationRequests(),
      window.AcervoComprasAPI.listPurchaseOrdersV2(),
    ]);
    state.needs = needs || [];
    state.quotations = quotations || [];
    state.orders = orders || [];
    state.selectedNeedIds.clear();
    carregarOpInfo().then(() => { if (typeof renderNeeds === "function") renderNeeds(); });
    try { state.needQuotations = await window.AcervoComprasAPI.listNeedsInOpenQuotation(); }
    catch (e) { state.needQuotations = new Map(); console.warn("[Compras] cotações das necessidades", e); }
    try { state.compositionQuotes = await window.AcervoComprasAPI.listPurchaseCompositionQuotes() || []; }
    catch (e) { state.compositionQuotes = []; notify('Não foi possível consultar os orçamentos da composição: ' + e.message, 'error'); }
    renderKpis();
    renderNeeds();
    renderQuotations();
    renderOrders();
    lucide.createIcons();
  }

  function bind() {
    document.querySelectorAll(".pv-tab").forEach((btn) => btn.onclick = () => selectTab(btn.dataset.pvTab));
    const startTab = new URLSearchParams(location.search).get("tab");
    if (startTab && [...document.querySelectorAll(".pv-tab")].some((b) => b.dataset.pvTab === startTab)) selectTab(startTab);
    $("quoteSelectedBtn").onclick = () => {
      const selected = [...state.selectedNeedIds].map((id) => state.needs.find((n) => n.id === id)).filter(Boolean);
      if (new Set(selected.map((n) => n.origem === "manutencao")).size > 1) return notify("Serviços são cotados separados de materiais. Desmarque um dos dois.", "error");
      // necessidade de OP com material cadastrado: oferece juntar outras pedidos do mesmo material (30 dias)
      const base = selected.find((n) => n.order_number && n.material_id);
      if (base) startQuoteFlow(base.id); else openQuoteBuilder(selected);
    };
    $("quoteBuilderSubmit").onclick = submitQuoteBuilder;
    $("consolidationOnlyBtn").onclick = () => {
      openQuoteBuilder([state.consolidationBase, ...selectedNeedsExcluding(new Set([state.consolidationBase.id]))]);
      $("consolidationDialog").close();
    };
    $("consolidationMergeBtn").onclick = () => {
      const chosen = [state.consolidationBase, ...state.consolidationCandidates.filter((c) => state.consolidationSelected.has(c.id))];
      const chosenNeeds = chosen.map((c) => state.needs.find((n) => n.id === c.id) || c);
      const excludeIds = new Set(chosenNeeds.map((n) => n.id));
      openQuoteBuilder([...chosenNeeds, ...selectedNeedsExcluding(excludeIds)]);
      $("consolidationDialog").close();
    };
    document.querySelectorAll("#proposalsModeTabs .pv-mode-tab").forEach((btn) => btn.onclick = () => switchProposalsMode(btn.dataset.mode));
    $("proposalsSaveBtn").onclick = saveProposal;
    $("proposalsPdfBtn").onclick = downloadProposalsPdf;
    $("proposalsGenerateBtn").onclick = generatePurchaseOrdersFromWorkspace;
    $("importAiBtn").onclick = startAiImport;
    $("proposalFileInput").addEventListener("change", handleAiFileSelected);
    $("aiMatchConfirm").onclick = confirmAiMatch;
    ["proposalCondicao", "proposalFrete", "proposalValidade", "proposalEntrega"].forEach((id) => $(id).addEventListener("input", recalcFooter));
    $("proposalsItemsList").addEventListener("click", (e) => {
      const toggleBtn = e.target.closest("[data-toggle-deadline]");
      if (toggleBtn) {
        const row = toggleBtn.closest(".pv-proposal-item-row");
        row.querySelector("[data-deadline-box]").classList.remove("hidden");
        toggleBtn.style.display = "none";
      }
    });
    $("proposalsItemsList").addEventListener("input", (e) => {
      const row = e.target.closest(".pv-proposal-item-row");
      if (!row) return;
      if (e.target.matches("[data-item-valor], [data-item-deadline-input]")) { recalcItemRowTotal(row); recalcFooter(); }
    });
    $("proposalsItemsList").addEventListener("change", (e) => {
      const row = e.target.closest(".pv-proposal-item-row");
      if (!row) return;
      if (e.target.matches("[data-item-nao-cotado]")) {
        const disabled = e.target.checked;
        row.querySelector("[data-item-valor]").disabled = disabled;
        row.classList.toggle("is-not-quoted", disabled);
        recalcItemRowTotal(row);
        recalcFooter();
      }
    });
    $("invoiceSubmit").onclick = submitInvoiceXml;
    $("orderDetailPdfBtn").onclick = downloadOrderPdf;
    $("orderDirectDeliveryBtn").onclick = confirmDirectDelivery;
    $("comprasSearch").addEventListener("input", () => { renderNeeds(); renderQuotations(); renderOrders(); });
    $("ordersStatusFilter").addEventListener("change", renderOrders);
    $("orderCancelBtn").onclick = cancelCurrentOrder;
    $("quoteSupplierSearch").addEventListener("input", renderSupplierOptions);
    $("quoteSupplierSearch").addEventListener("focus", renderSupplierOptions);
    document.addEventListener("click", (e) => { if (!e.target.closest(".pv-supplier-search")) $("quoteSupplierOptions").classList.add("hidden"); });
    let resizeTimer;
    window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(fitAllocChips, 120); });
  }

  function selectTab(tab) {
    document.querySelectorAll(".pv-tab").forEach((b) => b.classList.toggle("active", b.dataset.pvTab === tab));
    $("ordersStatusFilter").classList.toggle("hidden", tab !== "orders");
    document.querySelectorAll(".pv-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.pvPanel !== tab));
    updateSelectionBar();
    if (tab === "orders") fitAllocChips();
  }

  // ===================== KPIs =====================
  function renderKpis() {
    $("quotationsBadge").textContent = state.quotations.filter((q) => q.status !== "encerrada" && q.status !== "cancelada").length;
    $("ordersBadge").textContent = state.orders.filter((o) => !["recebido", "cancelado"].includes(o.status)).length;
    const { op, avulsa, servicos } = splitNeeds();
    $("needsOpBadge").textContent = op.length;
    $("needsAvulsaBadge").textContent = avulsa.length;
    $("needsServicosBadge").dataset.operacionais = state.needs.filter(n=>n.origem === "manutencao" && !["comprada","aguardando_recebimento","recebida_parcial","atendida","cancelada"].includes(n.status)).length;
    window.dispatchEvent(new Event("compras-servicos-contagem"));
    ["needsOpBadge", "needsAvulsaBadge", "needsServicosBadge", "quotationsBadge", "ordersBadge"].forEach((id) => {
      $(id).hidden = Number($(id).textContent) === 0;
    });
  }

  // ===================== Necessidades =====================
  function quantityText(value, unit = "") {
    return value == null ? "—" : `${Number(value).toLocaleString("pt-BR")} ${esc(unit)}`;
  }

  function deadlineHtml(value, closed = false) {
    if (!value) return '<span class="pv-muted">Não informado</span>';
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime())) return '<span class="pv-muted">Não informado</span>';
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const days = Math.round((date - today) / 86400000);
    const label = closed ? 'Prazo acordado' : days < 0 ? `${Math.abs(days)} dia(s) em atraso` : days === 0 ? 'Hoje' : `Em ${days} dia(s)`;
    return `<strong>${fmtDate(value)}</strong><small class="${!closed && days < 0 ? 'pv-text-danger' : ''}">${label}</small>`;
  }

  function progressHtml(done, total, label) {
    const pct = total > 0 ? Math.min(100, Math.max(0, Math.round(done / total * 100))) : 0;
    return `<div class="pv-table-progress"><span>${esc(label)}</span><progress max="100" value="${pct}" aria-label="${esc(label)}"></progress></div>`;
  }
  function searchTerm() {
    return ($("comprasSearch")?.value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function matchesSearch(...values) {
    const term = searchTerm();
    if (!term) return true;
    return values.join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term);
  }

  function filteredNeeds() {
    return state.needs.filter((n) => matchesSearch(n.material_nome, n.material_codigo, n.order_number, n.etapa_nome, n.setor_nome, n.solicitante_nome));
  }

  // Necessidades de OP (origem = op_faltando, falta de material da OP, e ferramental — ferramenta que as pedidos precisam,
  // do Ferramental ou do programador CNC; as duas sem aprovacao financeira, desde 2026-10-01) vs. avulsas (solicitacao
  // manual e estoque minimo, com aprovacao) — cada uma numa tabela (OP/Destino vs. Origem/Solicitante).
  function splitNeeds() {
    const op = [];
    const avulsa = [];
    const servicos = [];
    // (2026-10-10) já comprada (pedido de compra emitido) sai das necessidades: segue em Pedidos/Recebimento — evita comprar duas vezes
    const bought = new Set(["comprada", "aguardando_recebimento", "recebida_parcial", "atendida", "cancelada"]); // atendida/cancelada: fechada pelo Almoxarifado (estoque reposto ou cancelada lá)
    filteredNeeds().forEach((n) => {
      if (bought.has(n.status)) return;
      if (n.origem === "manutencao") servicos.push(n);
      else (["solicitacao", "estoque_minimo", "cartela"].includes(n.origem) ? avulsa : op).push(n);
    });
    return { op, avulsa, servicos };
  }

  function needRowState(n) {
    const awaitingLink = !n.material_id && !["manutencao", "solicitacao"].includes(n.origem); // serviço e solicitação de compra: vínculo opcional (16/11/2026)
    const pendingApproval = n.status === "aguardando_aprovacao" || awaitingLink;
    const internalRequest = n.origem === "solicitacao" && !n.order_number;
    const selected = !pendingApproval && state.selectedNeedIds.has(n.id);
    const pcpTag = n.pcp_status === "published"
      ? `<span class="pv-pcp-tag is-confirmada">Necessidade confirmada</span>`
      : n.pcp_status === "suggested"
        ? `<span class="pv-pcp-tag is-prevista">Necessidade prevista</span>`
        : `<span class="pv-pcp-tag is-indefinida">Sem programação da operação</span>`;
    const quoting = state.needQuotations?.get(n.id);
    const quoteTag = quoting?.length ? `<span class="pv-quoting-tag" title="Este material já está sendo cotado. Ele sai da lista quando o pedido de compra for gerado."><i data-lucide="file-search"></i> Em cotação · Nº ${quoting.map(esc).join(", ")}</span>` : "";
    return { awaitingLink, pendingApproval, internalRequest, selected, pcpTag: quoteTag + pcpTag };
  }

  function needRowAttrs(n, pendingApproval, selected) {
    return `data-need-id="${esc(n.id)}" class="${pendingApproval ? "" : "pv-row-clickable"} ${selected ? "is-selected" : ""}" tabindex="${pendingApproval ? -1 : 0}" aria-selected="${selected}"`;
  }

  function needQtyCell(n) {
    return `<td class="pv-request-qty"><strong>${quantityText(n.quantidade_faltante)}</strong><small>${esc(n.unidade || "")}</small></td>`;
  }

  function needDateCell(n) {
    return `<td>${n.data_necessidade ? `<strong>${fmtDate(n.data_necessidade)}</strong>` : `<span class="subtext">—</span>`}</td>`;
  }

  function needStatusCell(awaitingLink, status, pcpTag) {
    return `<td>${awaitingLink ? '<span class="pv-status-pill pv-link-pending">Aguardando vínculo ao cadastro</span>' : status === 'aguardando_aprovacao' ? '<span class="pv-status-pill pv-financial-pending">Aguardando aprovação financeira</span>' : pcpTag}</td>`;
  }

  function needAttachmentsCell(n) {
    return `<td>${productLinkHtml(n.produto_url) || compositionQuoteLinks(n.id)}</td>`;
  }

  // pedidos que precisam da ferramenta: programador CNC = a OP do pedido; Ferramental = as pedidos com falta (tool_details.ops)
  function toolNeedOrders(n) {
    if (n.order_number) return [n.order_number];
    const ops = Array.isArray(n.tool_details?.ops) ? n.tool_details.ops : [];
    return [...new Set(ops.map((o) => o?.op_numero).filter(Boolean))];
  }
  function opNeedRowHtml(n) {
    if(!n.material_id)return avulsaNeedRowHtml(n);
    const { pendingApproval, selected, pcpTag } = needRowState(n);
    if (n.origem === "ferramental") {
      const fromProgrammer = n.tool_details?.fonte === "programador_cnc";
      const orders = toolNeedOrders(n);
      const value = n.valor_estimado != null && n.valor_estimado !== "" ? `${Number(n.valor_estimado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/un` : "";
      const sub = fromProgrammer
        ? [n.tool_details?.maquina, n.tool_details?.motivo, value, n.fornecedor_nome ? `Fornecedor sugerido: ${n.fornecedor_nome}` : ""].filter(Boolean).join(" · ")
        : `${n.tool_details?.compra_em_risco ? "Compra em risco" : "Capacidade/vida útil"} · Comprar até ${fmtDate(n.tool_details?.compra_recomendada_ate)}`;
      return `<tr ${needRowAttrs(n, pendingApproval, selected)}>
        ${needQtyCell(n)}
        <td><strong>${esc(n.material_nome)}</strong><span class="pv-origin-tag is-tool">${fromProgrammer ? "Ferramenta · Programador CNC" : "Ferramenta"}</span><small>${esc(sub)}${fromProgrammer ? "" : ` · <a href="../Almoxarifado/Principal/almoxarifado.html" data-tool-link>Ver detalhes</a>`}</small>${companyChip(n)}</td>
        <td>${orders.length ? orders.map((o) => `<span class="cs-pedido-num">${esc(o)}</span>`).join(" ") : '<span class="subtext">Estoque mínimo de ferramenta</span>'}</td>
        <td>${esc(fromProgrammer ? (n.tool_details?.maquina || "Programação CNC") : "Ferramental")}</td>
        ${needDateCell(n)}
        ${needStatusCell(false, n.status, pcpTag)}
        ${needAttachmentsCell(n)}
      </tr>`;
    }
    return `<tr ${needRowAttrs(n, pendingApproval, selected)}>
        ${opPedidoCell(n)}
        ${needQtyCell(n)}
        <td><strong>${esc(n.material_nome)}</strong>${companyChip(n)}${n.entrega_direta_endereco ? `<small class="pv-direct-delivery" title="${esc(n.entrega_direta_endereco)}"><i data-lucide="truck"></i> Entregar direto no terceirizado: ${esc(n.entrega_direta_endereco)}</small>` : ""}</td>
        ${opItemCell(n)}
        <td>${esc(n.etapa_nome || n.setor_nome || "—")}</td>
        ${needDateCell(n)}
        ${needStatusCell(false, n.status, pcpTag)}
      </tr>`;
  }

  // (16/11/2026) Necessidades operacionais: pedido (número, nunca "OP"), cliente com foto, local e o item que vai ser
  // personalizado, com foto. Vêm de dados da própria necessidade (pedido_id, item_id) ou do pedido pelo número.
  state.opInfo = state.opInfo || { pedidos: new Map(), itens: new Map(), pronto: false };
  async function carregarOpInfo() {
    const op = state.needs.filter((n) => n.order_number || n.pedido_id || n.item_id);
    if (!op.length) return;
    const sb = window.supabaseClient, emp = window.__CONTEXT?.empresa_id;
    const numeros = [...new Set(op.map((n) => String(n.order_number || "")).filter(Boolean))].filter((x) => !state.opInfo.pedidos.has(x));
    const itens = [...new Set(op.map((n) => n.item_id).filter(Boolean))].filter((x) => !state.opInfo.itens.has(x));
    try {
      if (numeros.length) {
        const { data: peds } = await sb.from("separacoes_pedidos").select("id,numero_pedido,cliente_nome,cliente_id,local_nome").eq("empresa_id", emp).in("numero_pedido", numeros);
        const ids = [...new Set((peds || []).map((p) => p.cliente_id).filter(Boolean))];
        const { data: cli } = ids.length ? await sb.from("clientes_empresas").select("id,catalogo_logo_url").in("id", ids) : { data: [] };
        const foto = new Map((cli || []).map((c) => [c.id, c.catalogo_logo_url]));
        (peds || []).forEach((p) => state.opInfo.pedidos.set(String(p.numero_pedido), { ...p, foto: foto.get(p.cliente_id) || "" }));
      }
      if (itens.length) {
        const { data: its } = await sb.from("itens").select("id,produto,descricao_total,foto_url").in("id", itens);
        (its || []).forEach((i) => state.opInfo.itens.set(i.id, i));
      }
    } catch (e) { console.warn("[Compras] dados do pedido das necessidades", e); }
  }
  // Pedido, Cliente (com foto) e Local em três colunas
  function opPedidoCell(n) {
    const p = state.opInfo.pedidos.get(String(n.order_number || "")) || {};
    const cliente = n.cliente_nome || p.cliente_nome, local = n.local_nome || p.local_nome, foto = n.cliente_foto || p.foto;
    const ini = (v) => String(v).trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
    const av = cliente ? `<span class="cs-foto cs-foto-pessoa${foto ? " tem-foto" : ""}" style="--cs-tam:30px" aria-hidden="true">${foto ? `<img src="${esc(foto)}" alt="">` : esc(ini(cliente))}</span>` : "";
    return `<td>${n.order_number ? `<span class="cs-pedido-num">${esc(n.order_number)}</span>` : '<span class="subtext">—</span>'}</td>
        <td>${cliente ? `<span class="cs-com-foto">${av}<span class="cs-com-foto-txt"><strong>${esc(cliente)}</strong></span></span>` : '<span class="subtext">—</span>'}</td>
        <td>${local ? esc(local) : '<span class="subtext">—</span>'}</td>`;
  }
  function opItemCell(n) {
    const i = state.opInfo.itens.get(n.item_id) || {};
    const nome = n.item_nome || i.produto || i.descricao_total, foto = n.item_foto || i.foto_url;
    if (!nome) return `<td><span class="subtext">—</span></td>`;
    return `<td><span class="cs-com-foto"><span class="cs-item-foto">${foto ? `<img src="${esc(foto)}" alt="" loading="lazy">` : ""}</span><span class="cs-com-foto-txt"><strong>${esc(nome)}</strong>${n.personalizacao_nome ? `<small>${esc(n.personalizacao_nome)}</small>` : ""}</span></span></td>`;
  }

  function avulsaNeedRowHtml(n) {
    const { awaitingLink, pendingApproval, internalRequest, selected, pcpTag } = needRowState(n);
    const isTool = n.origem === "ferramental";
    const fromProgrammer = isTool && n.tool_details?.fonte === "programador_cnc";
    const linkIcon = !n.material_id && n.origem !== "manutencao"
      ? `<button type="button" class="pv-link-material-icon" data-link-material="${esc(n.id)}" title="Vincular item cadastrado" aria-label="Vincular item cadastrado"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/></svg></button>`
      : "";
    const programmerValue = n.valor_estimado != null && n.valor_estimado !== "" ? `${Number(n.valor_estimado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/un` : "";
    const toolSubtitle = fromProgrammer
      ? `<small>${esc([n.order_number ? `Pedido ${n.order_number}` : "", n.tool_details?.maquina, n.tool_details?.motivo, programmerValue, n.fornecedor_nome ? `Fornecedor sugerido: ${n.fornecedor_nome}` : ""].filter(Boolean).join(" · "))}</small>`
      : isTool
      ? `<small>${esc(n.tool_details?.compra_em_risco ? 'Compra em risco' : 'Capacidade/vida útil')} · Comprar até ${fmtDate(n.tool_details?.compra_recomendada_ate)} · <a href="../Almoxarifado/Principal/almoxarifado.html" data-tool-link>Ver detalhes</a></small>`
      : "";
    const isMinimum = n.origem === "estoque_minimo";
    const isService = n.origem === "manutencao";
    const isCartela = n.origem === "cartela"; // 15/11/2026: tecido/tinta escolhido na cartela que ainda não existe no Almoxarifado
    const originTag = isCartela ? `<span class="pv-origin-tag is-tool">${esc(n.cartela_tipo || "Cartela")} · Pedido ${esc(n.pedido_numero || "")}</span>` : isService ? '<span class="pv-origin-tag is-tool">Manutenção</span>' : fromProgrammer ? '<span class="pv-origin-tag is-tool">Programador CNC</span>' : isTool ? '<span class="pv-origin-tag is-tool">Ferramental</span>' : isMinimum ? '<span class="pv-origin-tag is-tool">Estoque mínimo</span>' : ""; // (16/11/2026) solicitação de compra comum não mostra etiqueta de origem (pedido do usuário)
    const ia = camposIA(n);
    return `<tr ${needRowAttrs(n, pendingApproval, selected)}>
        <td>${isCartela ? `<span class="subtext">Automático</span><small>${esc(n.pedido_cliente || "")}</small>` : fromProgrammer ? window.ComprasFoto.comNome(window.ComprasFoto.pessoa(n.criado_por, n.solicitante_nome || "Programador CNC"), esc(n.solicitante_nome || "Programador CNC")) : isTool ? '<span class="subtext">—</span>' : isMinimum ? '<span class="subtext">Automático</span>' : window.ComprasFoto.comNome(window.ComprasFoto.pessoa(n.criado_por, n.solicitante_nome), esc(n.solicitante_nome || 'Solicitante não informado'))}</td>
        ${needQtyCell(n)}
        <td>${linkIcon}<strong>${esc(n.material_nome)}</strong>${toolSubtitle}${companyChip(n)}<span class="cs-origem">${originTag}</span>${!n.material_id && n.origem === "solicitacao" ? `<small class="cs-sem-vinculo">Sem vínculo com o Almoxarifado</small>` : ""}${ia.extra ? `<small class="cs-clamp" title="${esc(ia.extra)}">${esc(ia.extra)}</small>` : ""}</td>
        ${textoCell(ia.motivo)}
        <td>${ia.justificativa ? `<span class="cs-clamp" title="${esc(ia.justificativa)}">${esc(ia.justificativa)}</span>` : '<span class="subtext">—</span>'}${ia.alternativas ? `<small class="cs-clamp" title="${esc(ia.alternativas)}">Alternativas: ${esc(ia.alternativas)}</small>` : ""}</td>
        ${textoCell(ia.pedido)}
        ${needDateCell(n)}
        ${fotosCell(n.evidencias || ia.fotos)}
        ${needStatusCell(awaitingLink, n.status, pcpTag)}
        ${needAttachmentsCell(n)}
      </tr>`;
  }

  // (16/11/2026) respostas da assistente (Carla) em campos próprios; registros antigos: lidos do texto da observação
  function camposIA(n) {
    const obs = String(n.observacao || "");
    const linha = (rot) => { const m = obs.match(new RegExp("^" + rot + ":\\s*(.+)$", "mi")); return m ? m[1].trim() : ""; };
    const fotos = (obs.match(/https?:\/\/\S+solicitacoes-evidencias\S+/g) || []);
    const pedido = n.pedido_destino || linha("Pedido \\/ evento");
    return {
      motivo: n.motivo || linha("Para que"),
      justificativa: n.justificativa || linha("Por que precisa"),
      alternativas: (n.alternativas || linha("Alternativas avaliadas")).replace(/^nenhuma( alternativa avaliada)?\.?$/i, ""),
      pedido: /^uso geral/i.test(pedido) ? "Uso geral / estoque" : pedido,
      extra: n.observacao_extra || "",
      fotos,
    };
  }
  function textoCell(v) { return `<td>${v ? `<span class="cs-clamp" title="${esc(v)}">${esc(v)}</span>` : '<span class="subtext">—</span>'}</td>`; }
  function fotosCell(lista) {
    const fotos = (Array.isArray(lista) ? lista : []).map((f) => (typeof f === "string" ? f : f?.url)).filter((u) => /^https?:\/\//.test(u || ""));
    if (!fotos.length) return `<td><span class="subtext">Sem foto</span></td>`;
    return `<td><span class="cs-fotos" data-cs-todas="${esc(fotos.join("|"))}">${fotos.slice(0, 3).map((u) => `<a href="${esc(u)}" data-cs-foto-ver title="Ver foto"><img src="${esc(u)}" alt="" loading="lazy"></a>`).join("")}${fotos.length > 3 ? `<b>+${fotos.length - 3}</b>` : ""}</span></td>`;
  }

  // (16/11/2026) linha do serviço com as respostas do Marcos (manutenção): título, categoria, local, problema, prioridade, prazo e fotos
  const CATEGORIA_SERV = { hidraulica: "Hidráulica", eletrica: "Elétrica", alvenaria: "Alvenaria", pintura: "Pintura", portas_janelas: "Portas e janelas", climatizacao: "Climatização", outros: "Outros" };
  function servicoNeedRowHtml(n) {
    const { pendingApproval, selected, pcpTag } = needRowState(n);
    const prio = { baixa: "Baixa", normal: "Normal", alta: "Alta", urgente: "Urgente" }[n.prioridade] || "";
    return `<tr ${needRowAttrs(n, pendingApproval, selected)}>
        <td>${n.solicitante_nome ? window.ComprasFoto.comNome(window.ComprasFoto.pessoa(n.criado_por, n.solicitante_nome), esc(n.solicitante_nome)) : '<span class="subtext">—</span>'}</td>
        <td><strong>${esc(n.descricao_item || n.material_nome)}</strong>${n.categoria ? `<small>${esc(CATEGORIA_SERV[n.categoria] || n.categoria)}${n.predial_numero ? ` · #${esc(n.predial_numero)}` : ""}</small>` : ""}</td>
        ${textoCell(n.local)}
        ${textoCell(n.observacao)}
        <td>${prio ? `<span class="pv-status-pill ${n.prioridade === "urgente" || n.prioridade === "alta" ? "is-pending" : ""}">${esc(prio)}</span>` : "—"}</td>
        ${needDateCell(n)}
        ${fotosCell(n.evidencias)}
        ${needStatusCell(false, n.status, pcpTag)}
        <td>${n.predial_id ? `<button type="button" class="btn btn-secondary pv-btn-sm" data-predial-atender="${esc(n.predial_id)}">Atendimento</button>` : ""}</td>
      </tr>`;
  }

  function renderNeeds() {
    const { op, avulsa, servicos } = splitNeeds();

    // (16/11/2026) Serviços = solicitações de manutenção viradas necessidade (origem manutencao): clicar na linha seleciona para orçar
    $("needsServicosBody").innerHTML = servicos.map(servicoNeedRowHtml).join("");
    $("needsServicosBody").querySelectorAll("[data-predial-atender]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();window.ComprasPredialAbrir?.(b.dataset.predialAtender);}));
    $("needsServicosEmpty")?.classList.toggle("hidden", servicos.length > 0);
    window.dispatchEvent(new Event("compras-servicos-contagem"));
    $("needsOpEmpty").classList.toggle("hidden", op.length > 0);
    $("needsOpBody").innerHTML = op.map(opNeedRowHtml).join("");
    $("needsAvulsaEmpty").classList.toggle("hidden", avulsa.length > 0);
    $("needsAvulsaBody").innerHTML = avulsa.map(avulsaNeedRowHtml).join("");

    [$("needsOpBody"), $("needsAvulsaBody"), $("needsServicosBody")].forEach((body) => {
      body.querySelectorAll('[data-link-material]').forEach(b=>b.onclick=e=>{e.stopPropagation();linkInternalMaterial(b.dataset.linkMaterial);});
      body.querySelectorAll("tr.pv-row-clickable").forEach(tr=>{
        const toggle=()=>{
          const id=tr.dataset.needId;
          // (16/11/2026) serviço é sempre cotado separado de material (necessidade operacional e solicitação de compra)
          if(!state.selectedNeedIds.has(id)){
            const eServ=(n)=>n?.origem==="manutencao";
            const esta=state.needs.find(n=>n.id===id);
            const outro=[...state.selectedNeedIds].map(x=>state.needs.find(n=>n.id===x)).find(n=>n&&eServ(n)!==eServ(esta));
            if(outro){notify(eServ(esta)?"Serviços são cotados separados. Desmarque os materiais selecionados para cotar este serviço.":"Serviços são cotados separados. Desmarque os serviços selecionados para cotar este material.","error");return;}
          }
          if(state.selectedNeedIds.has(id)) state.selectedNeedIds.delete(id); else state.selectedNeedIds.add(id);
          const selected=state.selectedNeedIds.has(id);
          tr.classList.toggle('is-selected',selected);tr.setAttribute('aria-selected',String(selected));
          updateSelectionBar();
        };
        tr.addEventListener('click',event=>{if(!event.target.closest('a, button, input, select'))toggle();});
        tr.addEventListener('keydown',event=>{if(event.target===tr&&['Enter',' '].includes(event.key)){event.preventDefault();toggle();}});
      });
    });
    updateSelectionBar();
  }

  function compositionQuoteLinks(requestId) {
    const files=state.compositionQuotes.filter(a=>a.request_id===requestId);
    const safe=files.filter(a=>{try{return ['https:','http:'].includes(new URL(a.url).protocol);}catch{return false;}});
    return safe.length ? safe.map(a=>`<a class="pv-composition-link" data-composition-quote href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" title="${esc(a.name || 'Ver orçamento')}" aria-label="${esc(a.name || 'Ver orçamento')}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg></a>`).join('') : '';
  }

  function productLinkHtml(value) {
    try { if (!['https:', 'http:'].includes(new URL(value).protocol)) return ''; }
    catch { return ''; }
    return `<a data-composition-quote href="${esc(value)}" target="_blank" rel="noopener noreferrer" title="Link do produto" class="pv-product-link">Ver produto</a>`;
  }

  // 15/11/2026: solicitação de tecido/tinta da cartela — vincula a um material do Almoxarifado ou cadastra um novo.
  // A opção da cartela passa a apontar para esse material: os próximos pedidos já reservam no Almoxarifado.
  async function linkCartelaMaterial(need) {
    const sb=window.supabaseClient, emp=window.__CONTEXT?.empresa_id;
    try {
      const {data:materiais,error}=await sb.rpc('compras_almox_materiais',{p_empresa:emp});if(error)throw error;
      const d=document.createElement('dialog');d.className='pv-dialog pv-link-dialog pv-cartela-dialog';
      d.setAttribute('aria-label','Vincular ao Almoxarifado');
      d.innerHTML=`<form class="dialog-card"><header><h2>Vincular ao Almoxarifado</h2></header><div class="pv-link-dialog-body">
        <div class="pv-link-request"><div><span>Escolhido pelo cliente</span><strong>${esc(need.material_nome)}</strong></div><div><span>Quantidade</span><strong>${quantityText(need.quantidade_faltante,need.unidade)}</strong></div></div>
        <p class="pv-cartela-dica">Pedido ${esc(need.pedido_numero||'')} · ${esc(need.pedido_cliente||'')}. Depois do vínculo, esta opção da cartela ${esc(need.cartela_nome||'')} passa a reservar no Almoxarifado nos próximos pedidos.</p>
        <div class="pv-cartela-modo" role="radiogroup"><label><input type="radio" name="modo" value="novo" checked> Ainda não existe — cadastrar no Almoxarifado</label><label><input type="radio" name="modo" value="existente"${materiais?.length?'':' disabled'}> Já existe no Almoxarifado</label></div>
        <div data-modo="novo" class="pv-cartela-novo">
          <label>Nome do material<input name="nome" required maxlength="120" value="${esc(need.material_nome||'')}"></label>
          <div class="pv-cartela-linha"><label>Unidade<input name="unidade" maxlength="20" value="${esc(String(need.unidade||'UN').toUpperCase())}"></label>
          <label>Categoria<input name="categoria" maxlength="60" value="${esc(need.cartela_tipo==='Tinta'?'Tintas':need.cartela_tipo==='Tecido'?'Tecidos':(need.cartela_tipo||''))}"></label>
          <label>Custo (R$)<input name="custo" inputmode="decimal" value="${need.valor_estimado!=null&&need.valor_estimado!==''?String(need.valor_estimado).replace('.',','):''}"></label></div>
        </div>
        <div data-modo="existente" class="pv-cartela-existente" hidden><label for="purchaseCartelaMaterial">Material do Almoxarifado</label><select id="purchaseCartelaMaterial" name="material"><option value="">Selecione o material</option>${(materiais||[]).map(m=>`<option value="${esc(m.id)}">${esc(m.codigo||'')} · ${esc(m.produto)} (${esc(m.unidade||'')})</option>`).join('')}</select></div>
        <p role="alert" data-error></p></div>
        <footer><button type="button" class="btn btn-secondary" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Vincular</button></footer></form>`;
      document.body.append(d);d.querySelector('[data-close]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());
      const form=d.querySelector('form');
      const modo=()=>form.querySelector('[name=modo]:checked').value;
      form.addEventListener('change',e=>{if(e.target.name!=='modo')return;d.querySelector('[data-modo=novo]').hidden=modo()!=='novo';d.querySelector('[data-modo=existente]').hidden=modo()!=='existente';form.nome.required=modo()==='novo';form.material.required=modo()==='existente';});
      form.onsubmit=async e=>{e.preventDefault();const b=d.querySelector('[type=submit]');b.disabled=true;
        try{
          const args={p_empresa:emp,p_necessidade:need.id,p_produto_id:null,p_novo:null};
          if(modo()==='existente')args.p_produto_id=form.material.value;
          else args.p_novo={nome:form.nome.value.trim(),unidade:form.unidade.value.trim(),categoria:form.categoria.value.trim(),custo:form.custo.value.trim()};
          const {data,error}=await sb.rpc('compras_cartela_vincular',args);if(error)throw error;
          d.close();await reloadAll();notify(data?.novo?`Material ${data.material_codigo} cadastrado no Almoxarifado e vinculado.`:'Material vinculado.');
        }catch(err){d.querySelector('[data-error]').textContent=err.message;b.disabled=false;}};
      d.showModal();
    }catch(e){notify(e.message,'error');}
  }

  async function linkInternalMaterial(id) {
    const need=state.needs.find(n=>n.id===id);if(!need)return;
    if(need.origem==='cartela')return linkCartelaMaterial(need);
    try {
      const materials=await window.AcervoComprasAPI.listWarehouseMaterials();
      const d=document.createElement('dialog');d.className='pv-dialog pv-link-dialog';
      d.setAttribute('aria-label','Vincular item cadastrado');
      d.innerHTML=`<form class="dialog-card"><header><h2>Vincular item cadastrado</h2></header><div class="pv-link-dialog-body"><div class="pv-link-request"><div><span>Material solicitado</span><strong>${esc(need.material_nome)}</strong></div><div><span>Quantidade</span><strong>${quantityText(need.quantidade_faltante,need.unidade)}</strong></div></div><label for="purchaseLinkMaterial">Item do cadastro</label><select id="purchaseLinkMaterial" name="material" required><option value="">Selecione o item</option>${materials.map(m=>`<option value="${esc(m.id)}">${esc(m.codigo)} · ${esc(m.nome)} (${esc(m.unidade)})</option>`).join('')}</select><p role="alert" data-error></p></div><footer><button type="button" class="btn btn-secondary" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Vincular item</button></footer></form>`;
      document.body.append(d);d.querySelector('[data-close]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());
      d.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=d.querySelector('[type=submit]');b.disabled=true;try{await window.AcervoComprasAPI.linkInternalPurchaseMaterial(id,new FormData(e.target).get('material'));d.close();await reloadAll();notify('Item vinculado.');}catch(err){d.querySelector('[data-error]').textContent=err.message;b.disabled=false;}};
      d.showModal();
    }catch(e){notify(e.message,'error');}
  }

  function updateSelectionBar() {
    $("selectedCount").textContent = state.selectedNeedIds.size;
    const onNeedsTab = document.querySelector('.pv-tab.active')?.dataset.pvTab.startsWith("needs");
    $("quoteSelectionBar").classList.toggle("hidden", state.selectedNeedIds.size === 0 || !onNeedsTab);
  }

  function selectedNeedsExcluding(excludeIds) {
    return [...state.selectedNeedIds].map((id) => state.needs.find((n) => n.id === id)).filter((n) => n && !excludeIds.has(n.id));
  }

  async function startQuoteFlow(needId) {
    const need = state.needs.find((n) => n.id === needId);
    if (!need) return;
    try {
      // (2026-10-10) só pergunta pelas necessidades que ficaram FORA da seleção (as selecionadas já entram na cotação)
      const servico = need.origem === "manutencao";
      const candidates = (await window.AcervoComprasAPI.findConsolidatableNeeds(needId, 30) || []).filter((c) => !state.selectedNeedIds.has(c.id) && ((state.needs.find((n) => n.id === c.id)?.origem || c.origem) === "manutencao") === servico);
      if (!candidates.length) { openQuoteBuilder([need, ...selectedNeedsExcluding(new Set([need.id]))]); return; }
      state.consolidationBase = need;
      state.consolidationCandidates = candidates;
      state.consolidationSelected = new Set(candidates.map((c) => c.id));
      renderConsolidationDialog();
      $("consolidationDialog").showModal();
      lucide.createIcons();
    } catch (e) { notify(e.message || "Não foi possível verificar consolidação.", "error"); }
  }

  function renderConsolidationDialog() {
    const base = state.consolidationBase;
    $("consolidationTitle").textContent = `${base.material_nome} — outras pedidos na fila`;
    const baseQty = Number(base.quantidade_faltante || 0);
    const selectedQty = state.consolidationCandidates.filter((c) => state.consolidationSelected.has(c.id)).reduce((s, c) => s + Number(c.quantidade_faltante || 0), 0);
    $("consolidationBody").innerHTML = `
      <p class="pv-hint">A OP <b>${esc(base.order_number || "")}</b> precisa de <b>${baseQty.toLocaleString("pt-BR")} ${esc(base.unidade || "")}</b> em <b>${fmtDate(base.data_necessidade)}</b>. Existem outras necessidades da fila da operação para o mesmo material dentro de 30 dias:</p>
      <div class="pv-consolidation-list">
        ${state.consolidationCandidates.map((c) => `
          <label class="pv-consolidation-row">
            <input type="checkbox" class="pv-cons-check" data-id="${esc(c.id)}" ${state.consolidationSelected.has(c.id) ? "checked" : ""}>
            <span><strong>${esc(c.order_number || "")}</strong> ${esc(c.peca_nome || "")}</span>
            <span>${Number(c.quantidade_faltante || 0).toLocaleString("pt-BR")} ${esc(c.unidade || "")}</span>
            <span>${c.data_necessidade ? fmtDate(c.data_necessidade) : "sem data"}</span>
            <span class="pv-pcp-tag ${c.pcp_status === "published" ? "is-confirmada" : c.pcp_status === "suggested" ? "is-prevista" : "is-indefinida"}">${c.pcp_status === "published" ? "Confirmada" : c.pcp_status === "suggested" ? "Prevista" : "Sem programação"}</span>
          </label>`).join("")}
      </div>
      <div class="pv-consolidation-summary">
        <span>Necessidade atual: <b>${baseQty.toLocaleString("pt-BR")}</b></span>
        <span>Outras necessidades próximas: <b>${selectedQty.toLocaleString("pt-BR")}</b></span>
        <span>Necessidade consolidada: <b id="consolidationTotal">${(baseQty + selectedQty).toLocaleString("pt-BR")}</b></span>
      </div>`;
    $("consolidationBody").querySelectorAll(".pv-cons-check").forEach((chk) => chk.addEventListener("change", () => {
      if (chk.checked) state.consolidationSelected.add(chk.dataset.id); else state.consolidationSelected.delete(chk.dataset.id);
      renderConsolidationDialog();
    }));
    $("consolidationMergeBtn").disabled = state.consolidationSelected.size === 0;
  }

  // ===================== Construtor de cotação =====================
  function sortByTableOrder(needs) {
    const order = new Map(state.needs.map((n, i) => [n.id, i]));
    return [...needs].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  function suggestedQuoteDeadline(needs) {
    const dates = needs.map((n) => n.data_necessidade).filter(Boolean).sort();
    if (!dates.length) return "";
    const d = new Date(`${dates[0]}T12:00:00`);
    d.setDate(d.getDate() - state.purchaseLeadDays);
    if (d < new Date(new Date().toDateString())) return new Date().toISOString().slice(0, 10);
    return d.toISOString().slice(0, 10);
  }

  function openQuoteBuilder(needsInput) {
    const unlinked=needsInput.find(n=>n.origem==='solicitacao'&&!n.order_number&&!n.material_id);
    if(unlinked){linkInternalMaterial(unlinked.id);return;}
    if (!needsInput.length) return;
    const needs = sortByTableOrder(needsInput);
    state.quoteBuilderNeeds = needs;
    const groups = new Map();
    needs.forEach((n) => {
      const key = n.tool_type_id ? `tool:${n.tool_type_id}` : n.material_id || `desc:${(n.material_nome || "").toLowerCase()}`;
      if (!groups.has(key)) groups.set(key, { semVinculo: !n.material_id && n.origem === "solicitacao", tool: Boolean(n.tool_type_id) || n.origem === "manutencao", material_id: n.material_id || null, codigo: n.material_codigo || "", nome: n.material_nome, especificacao: n.especificacao || "", unidade: n.unidade || "un", needs: [] });
      groups.get(key).needs.push(n);
    });
    state.quoteBuilderGroups = [...groups.values()].map((g) => ({ ...g, quantidade_cotada: g.needs.reduce((s, n) => s + Number(n.quantidade_faltante || 0), 0) }));
    renderQuoteBuilder();
    $("quoteDesiredDate").value = suggestedQuoteDeadline(needs);
    $("quoteObservations").value = "";
    state.quoteSelectedSupplierIds = new Set();
    $("quoteSupplierSearch").value = "";
    $("quoteSupplierOptions").classList.add("hidden");
    renderSupplierChips();
    $("quoteBuilderDialog").showModal();
    lucide.createIcons();
  }

  function supplierName(s) { return s.trade_name || s.legal_name; }

  // % de recebimentos sem divergência nos ultimos 12 meses.
  function qualityTag(supplierId) {
    const q = state.supplierQuality.get(supplierId);
    if (!q) return `<span class="pv-quality-tag is-none" title="Nenhum recebimento concluído nos últimos 12 meses">Sem histórico</span>`;
    const tone = Number(q.indice) >= 95 ? "is-good" : Number(q.indice) >= 80 ? "is-mid" : "is-bad";
    return `<span class="pv-quality-tag ${tone}" title="${q.recebimentos} recebimento(s) em 12 meses, ${q.com_rnc} com divergência">Qualidade ${Number(q.indice)}%</span>`;
  }

  function renderSupplierOptions() {
    const term = $("quoteSupplierSearch").value.trim().toLowerCase();
    const available = state.suppliers.filter((s) => !state.quoteSelectedSupplierIds.has(s.id) && supplierName(s).toLowerCase().includes(term));
    const box = $("quoteSupplierOptions");
    if (!available.length) {
      box.innerHTML = `<p class="pv-supplier-empty">${state.suppliers.length ? "Nenhum fornecedor encontrado." : "Nenhum fornecedor cadastrado."}</p>`;
    } else {
      box.innerHTML = available.map((s) => `<button type="button" class="pv-supplier-option" data-supplier-option="${esc(s.id)}">${esc(supplierName(s))} ${qualityTag(s.id)}</button>`).join("");
      box.querySelectorAll("[data-supplier-option]").forEach((btn) => btn.addEventListener("click", () => {
        state.quoteSelectedSupplierIds.add(btn.dataset.supplierOption);
        $("quoteSupplierSearch").value = "";
        box.classList.add("hidden");
        renderSupplierChips();
      }));
    }
    box.classList.remove("hidden");
  }

  function renderSupplierChips() {
    const chips = [...state.quoteSelectedSupplierIds].map((id) => state.suppliers.find((s) => s.id === id)).filter(Boolean);
    $("quoteSupplierChips").innerHTML = chips.length
      ? chips.map((s) => `<span class="pv-supplier-chip">${esc(supplierName(s))} ${qualityTag(s.id)}<button type="button" data-remove-supplier="${esc(s.id)}" aria-label="Remover"><i data-lucide="x"></i></button></span>`).join("")
      : `<p class="pv-supplier-empty">Nenhum fornecedor convidado ainda.</p>`;
    $("quoteSupplierChips").querySelectorAll("[data-remove-supplier]").forEach((btn) => btn.addEventListener("click", () => {
      state.quoteSelectedSupplierIds.delete(btn.dataset.removeSupplier);
      renderSupplierChips();
    }));
    lucide.createIcons();
  }

  function renderQuoteBuilder() {
    $("quoteBuilderItems").innerHTML = `
      <div class="pv-quote-item-list">
        <div class="pv-quote-item-headrow"><span>Material</span><span>pedidos incluídas</span><span>Qtd. a cotar</span><span>Un.</span></div>
        ${state.quoteBuilderGroups.map((g, idx) => `
        <div class="pv-quote-item-row ${g.material_id || g.tool || g.semVinculo ? "" : "is-risk"}">
          <div class="pv-quote-item-name"><strong>${esc(g.nome)}</strong>${g.codigo ? `<small>${esc(g.codigo)}</small>` : ""}</div>
          <details class="pv-quote-item-needs"><summary>${g.needs.length} OP${g.needs.length > 1 ? "s" : ""}</summary>
            <ul>${g.needs.map((n) => `<li>${esc(n.order_number || "geral")} — ${Number(n.quantidade_faltante || 0).toLocaleString("pt-BR")} ${esc(n.unidade || "")} ${n.data_necessidade ? `· ${fmtDate(n.data_necessidade)}` : ""}</li>`).join("")}</ul>
          </details>
          <input type="number" class="pv-quote-item-qty" min="0.01" step="0.01" data-group-qty="${idx}" value="${g.quantidade_cotada}">
          <input type="text" class="pv-quote-item-unit" value="${esc(g.unidade)}" disabled>
          ${g.material_id || g.tool ? "" : g.semVinculo ? `<p class="pv-quote-item-note">Sem vínculo com o Almoxarifado: ao chegar, não entra no estoque.</p>` : `<p class="pv-quote-item-warning"><i data-lucide="alert-triangle"></i> Sem material cadastrado no Almoxarifado — não será possível gerar o pedido até cadastrá-lo.</p>`}
        </div>`).join("")}
      </div>`;
    $("quoteBuilderItems").querySelectorAll("[data-group-qty]").forEach((input) => input.addEventListener("input", () => {
      state.quoteBuilderGroups[Number(input.dataset.groupQty)].quantidade_cotada = Number(input.value) || 0;
    }));
  }

  async function submitQuoteBuilder() {
    const supplierIds = [...state.quoteSelectedSupplierIds];
    if (!supplierIds.length) return notify("Selecione ao menos um fornecedor.", "error");
    // Quantidade cotada dividida entre as pedidos na ordem da necessidade da operação, sem passar do total.
    const items = state.quoteBuilderGroups.map((g) => {
      let left = Number(g.quantidade_cotada || 0);
      const ordered = [...g.needs].sort((a, b) => String(a.data_necessidade || "9999").localeCompare(String(b.data_necessidade || "9999")));
      return {
        material_id: g.material_id, codigo: g.codigo, nome: g.nome, especificacao: g.especificacao, unidade: g.unidade,
        quantidade_cotada: g.quantidade_cotada,
        need_allocations: ordered.map((n) => {
          const alloc = Math.max(0, Math.min(Number(n.quantidade_faltante || 0), left));
          left -= alloc;
          return { purchase_request_id: n.id, quantidade_alocada: alloc };
        }).filter((a) => a.quantidade_alocada > 0),
      };
    });
    const prazoDesejado = $("quoteDesiredDate").value || null;
    const observacoes = $("quoteObservations").value.trim() || null;
    let result;
    try {
      result = await window.AcervoComprasAPI.createQuotationRequest({ items, supplier_ids: supplierIds, prazo_desejado: prazoDesejado, observacoes });
    } catch (e) { notify(e.message || "Não foi possível criar a cotação.", "error"); return; }
    $("quoteBuilderDialog").close();
    try {
      const payload = await buildQuotationRequestPayload({
        numero: result.numero, prazoDesejado, observacoes,
        items: items.map((i) => ({ codigo: i.codigo, nome: i.nome, especificacao: i.especificacao, quantidade: i.quantidade_cotada, unidade: i.unidade })),
      });
      await window.AcervoComprasDocs.previewQuotationRequest(payload);
    } catch (e) { notify(e.message || "Não foi possível gerar o PDF da solicitação.", "error"); }
    await reloadAll();
    notify(`Solicitação de cotação SC-${String(result.numero).padStart(6, "0")} criada.`);
    selectTab("quotations");
    document.querySelectorAll(".pv-tab").forEach((b) => b.classList.toggle("active", b.dataset.pvTab === "quotations"));
  }

  async function buildQuotationRequestPayload({ numero, prazoDesejado, observacoes, items }) {
    const company = await safeCompanyProfile();
    return { numero, prazoDesejado, observacoes, items, company };
  }

  // ===================== Cotações =====================
  function purchasePeopleHtml(ctx,registro){
    return ctx.pessoas.map(p=>`<div class="pv-list-item">${window.ComprasFoto.comNome(window.ComprasFoto.pessoa(p.id,p.nome),`<span>${esc(p.nome)}${p.setor?'<small>'+esc(p.setor)+'</small>':''}</span>`)}</div>`).join('')||`<span class="pv-muted">Não informado</span>${registro.comprador_nome?'<small>Registrado por '+esc(registro.comprador_nome)+'</small>':''}`;
  }
  function labelPurchaseCells(body){
    const headers=[...body.closest('table').tHead.rows[0].cells].map(th=>th.textContent.trim()||'Documentos');
    for(const tr of body.rows)for(const [n,td] of [...tr.cells].entries())td.dataset.colLabel=headers[n];
    window.ComprasDetalhes?.preparar(body);
  }
  function purchaseDestinationsHtml(ctx){
    return ctx.destinos.map(d=>`<div class="pv-list-item"><strong>${esc(d.nome)}</strong>${d.detalhe?'<small>'+esc(d.detalhe)+'</small>':''}</div>`).join('')||'<span class="pv-muted">Não informado</span>';
  }
  function purchaseSearch(registro){
    const ctx=window.ComprasListas.contexto(registro,state.needs);
    return [...(registro.items||[]).flatMap(i=>[i.nome,i.material_nome,i.codigo]),...ctx.pessoas.flatMap(p=>[p.nome,p.setor]),...ctx.destinos.flatMap(d=>[d.nome,d.detalhe])];
  }
  function quotationValuesHtml(p){
    if(p.parcial)return '<span class="pv-muted">Comparar itens pendentes</span><small>Parte desta cotação já gerou pedidos.</small>';
    let html;
    if(p.totais.length){
      const menor=p.totais[0],maior=p.totais.at(-1);
      html=`<strong>${money(menor.total)}</strong>${maior.total!==menor.total?'<small>até '+money(maior.total)+'</small>':''}<small>${p.totais.length} proposta(s) completa(s) · frete e desconto incluídos</small><small>Menor total: ${esc(menor.fornecedor||'Fornecedor')}</small>`;
    }else html='<span class="pv-muted">Sem total comparável</span>';
    if(p.parciais)html+=`<small>${p.parciais} proposta(s) parcial(is)</small>`;
    if(p.vencidas)html+=`<small class="pv-text-danger">${p.vencidas} proposta(s) vencida(s)</small>`;
    return html;
  }
  function purchaseReceiptHtml(o){
    if(o.status==='cancelado')return '<span class="pv-muted">Pedido cancelado</span>';
    const r=window.ComprasListas.recebimento(o);
    return r.itens.map(i=>`<div class="pv-list-item"><small>${esc(i.nome)}</small><span class="pv-list-received">${quantityText(i.recebido,i.unidade)} de ${quantityText(i.comprado,i.unidade)}</span><small>${i.recebido>=i.comprado?'Concluído':'Faltam '+quantityText(Math.max(0,i.comprado-i.recebido),i.unidade)}</small></div>`).join('')||'<span class="pv-muted">Sem itens informados</span>';
  }
  function purchaseInvoiceHtml(o){
    const notas=Array.isArray(o.nfe_receipts)?o.nfe_receipts:[];
    return `<button type="button" class="pv-list-nf ${notas.length?'is-attached':'is-missing'}" data-order-invoice="${esc(o.id)}" aria-label="Ver nota fiscal do pedido PC-${esc(String(o.numero).padStart(6,'0'))}">${notas.length?'XML anexado':'XML pendente'}</button>${notas.length?notas.map(n=>'<small>NF '+esc(n.numero_nfe||'s/n')+'</small>').join(''):o.numero_nf?'<small>NF '+esc(o.numero_nf)+' registrada</small>':''}`;
  }
  function renderQuotations() {
    const rows = state.quotations.filter((q) => q.status !== "encerrada" && q.status !== "cancelada" && matchesSearch(`SC-${String(q.numero).padStart(6, "0")}`, q.numero, ...purchaseSearch(q), ...(q.suppliers||[]).map(s=>s.nome)));
    $("quotationsEmpty").classList.toggle("hidden", rows.length > 0);
    $("quotationsEmpty").textContent=state.quotations.some(q=>!['encerrada','cancelada'].includes(q.status))?'Nenhuma cotação nesta busca.':'Nenhuma cotação em aberto.';
    const hoje=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
    $("quotationsBody").innerHTML = rows.map((q) => {
      const p=window.ComprasListas.propostas(q,hoje),ctx=window.ComprasListas.contexto(q,state.needs);
      return `
      <tr class="pv-row-clickable" data-quotation-id="${esc(q.id)}" tabindex="0" aria-label="Abrir cotação SC-${esc(String(q.numero).padStart(6,'0'))}">
        <td>${purchasePeopleHtml(ctx,q)}</td>
        <td><strong>SC-${esc(String(q.numero).padStart(6, "0"))}</strong><small>Criada em ${fmtDate(q.created_at)}</small></td>
        <td class="pv-list-material">${(q.items||[]).map(i=>`<div class="pv-list-item"><strong>${esc(i.nome||i.material_nome||'Item')}</strong><small>${quantityText(i.quantidade_cotada,i.unidade||'un')}${i.comprado===true||i.comprado==='true'?' · Já comprado':''}</small></div>`).join('')||esc(q.itens_count||0)+' item(ns)'}</td>
        <td>${purchaseDestinationsHtml(ctx)}</td>
        <td>${progressHtml(p.respondidos,p.totalFornecedores,`${p.respondidos} de ${p.totalFornecedores} fornecedores`)}<small>${p.pendentes} sem resposta</small>${p.fornecedores.length?'<details class="pv-list-suppliers"><summary>Ver fornecedores</summary>'+p.fornecedores.map(s=>`<div class="pv-list-item">${esc(s.nome||'Fornecedor')}<small>${s.status==='respondido'?'Respondeu':'Aguardando resposta'}</small></div>`).join('')+'</details>':''}</td>
        <td class="pv-quote-values">${quotationValuesHtml(p)}</td>
        <td>${deadlineHtml(q.prazo_desejado)}<span class="pv-status-pill is-${esc(q.status)}">${esc(quotationStatusLabel(q.status))}</span></td>
        <td><strong class="pv-list-action">${esc(p.acao)}</strong><small>${esc(p.detalhe)}</small><div class="pv-list-documents">
          <button class="icon-btn" type="button" data-reprint-quotation="${esc(q.id)}" title="Gerar 2ª via em PDF"><i data-lucide="file-down"></i></button>
        </div></td>
      </tr>`;}).join("");
    labelPurchaseCells($('quotationsBody'));
    // (16/11/2026) igual à Tecnoweld: clicar na linha abre as propostas em tela inteira
    $("quotationsBody").querySelectorAll("tr[data-quotation-id]").forEach((tr) => tr.addEventListener("click", (e) => { if (!e.target.closest("button, a, input, details")) openProposals(tr.dataset.quotationId); }));
    $("quotationsBody").querySelectorAll('tr[data-quotation-id]').forEach(tr=>tr.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target===tr){e.preventDefault();openProposals(tr.dataset.quotationId);}}));
    $("quotationsBody").querySelectorAll("[data-reprint-quotation]").forEach((btn) => btn.addEventListener("click", () => reprintQuotation(btn.dataset.reprintQuotation)));
    $("quotationsBody").querySelectorAll("[data-cancel-quotation]").forEach((btn) => btn.addEventListener("click", () => cancelQuotation(btn.dataset.cancelQuotation)));
    lucide.createIcons();
  }
  function quotationStatusLabel(s) { return { aberta: "Aguardando respostas", parcial: "Parcialmente convertida", rascunho: "Rascunho", enviada: "Aguardando respostas", respondida: "Com propostas", encerrada: "Encerrada", cancelada: "Cancelada" }[s] || s; }

  async function reprintQuotation(id) {
    try {
      const data = await window.AcervoComprasAPI.getQuotationWorkspace(id);
      const payload = await buildQuotationRequestPayload({
        numero: data.numero, prazoDesejado: data.prazo_desejado, observacoes: data.observacoes,
        items: (data.items || []).map((i) => ({ codigo: i.codigo, nome: i.nome, especificacao: i.especificacao, quantidade: i.quantidade_cotada, unidade: i.unidade })),
      });
      await window.AcervoComprasDocs.downloadQuotationRequest(payload);
    } catch (e) { notify(e.message || "Não foi possível gerar o PDF da solicitação.", "error"); }
  }

  // ===================== Propostas recebidas (modal unificado) =====================
  async function openProposals(id) {
    try {
      await loadWorkspace(id);
      state.proposalsMode = "launch";
      state.pendingAiDocument = null;
      state.lastAiResult = null;
      const firstPending = state.currentWorkspace.suppliers.find((s) => s.status !== "respondido");
      state.activeSupplierId = (firstPending || state.currentWorkspace.suppliers[0])?.supplier_id || null;
      renderProposalsShell();
      $("proposalsDialog").showModal();
      lucide.createIcons();
    } catch (e) { notify(e.message || "Não foi possível abrir a cotação.", "error"); }
  }

  async function loadWorkspace(id) {
    state.currentWorkspace = await window.AcervoComprasAPI.getQuotationWorkspace(id);
  }

  async function refreshWorkspace() {
    await loadWorkspace(state.currentWorkspace.id);
    renderProposalsShell();
  }

  function renderProposalsShell() {
    const data = state.currentWorkspace;
    $("proposalsTitle").textContent = `Cotação SC-${String(data.numero).padStart(6, "0")}`;
    $("proposalsMetaBar").innerHTML = `
      <span><small>Prazo solicitado</small><b>${fmtDate(data.prazo_desejado)}</b></span>
      <span><small>Itens</small><b>${data.items.length}</b></span>
      <span><small>Fornecedores</small><b>${data.suppliers.length}</b></span>
    `;
    $("proposalsSupplierCount").textContent=data.suppliers.length;
    $("proposalsItemCount").textContent=data.items.length;
    $("proposalsResponseCount").textContent=data.suppliers.filter(s=>s.status==="respondido").length+" de "+data.suppliers.length+" propostas recebidas";
    switchProposalsMode(state.proposalsMode);
    renderSupplierTabs();
    if (state.activeSupplierId) selectSupplier(state.activeSupplierId);
    renderCompareMode();
  }

  function switchProposalsMode(mode) {
    state.proposalsMode = mode;
    document.querySelectorAll("#proposalsModeTabs .pv-mode-tab").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    $("proposalsLaunchMode").classList.toggle("hidden", mode !== "launch");
    $("proposalsCompareMode").classList.toggle("hidden", mode !== "compare");
    $("proposalsSaveBtn").classList.toggle("hidden", mode !== "launch");
    $("proposalsGenerateBtn").classList.toggle("hidden", mode !== "compare");
  }

  function renderSupplierTabs() {
    $("proposalsSupplierTabs").innerHTML = state.currentWorkspace.suppliers.map((s) => `
      <button type="button" class="pv-supplier-tab ${s.status === "respondido" ? "is-answered" : ""} ${s.supplier_id === state.activeSupplierId ? "active" : ""}" data-select-supplier="${esc(s.supplier_id)}" aria-pressed="${s.supplier_id === state.activeSupplierId}">
        ${window.ComprasFoto.comNome(window.ComprasFoto.fornecedor(s.supplier_id, s.nome, 30), `<strong>${esc(s.nome)}</strong>`, `<small>${s.status === "respondido" ? "Proposta recebida" : "Aguardando proposta"}</small>`)}
      </button>`).join("");
    $("proposalsSupplierTabs").querySelectorAll("[data-select-supplier]").forEach((btn) => btn.addEventListener("click", () => {
      state.pendingAiDocument = null;
      state.lastAiResult = null;
      selectSupplier(btn.dataset.selectSupplier);
    }));
  }

  function selectSupplier(supplierId) {
    state.activeSupplierId = supplierId;
    document.querySelectorAll("#proposalsSupplierTabs .pv-supplier-tab").forEach((b) => {b.classList.toggle("active", b.dataset.selectSupplier === supplierId);b.setAttribute("aria-pressed",String(b.dataset.selectSupplier === supplierId));});
    const supplier = state.currentWorkspace.suppliers.find((s) => s.supplier_id === supplierId);
    $("proposalsActiveSupplier").textContent=supplier?.nome||"Selecione um fornecedor";
    const header = supplier?.header || {};
    $("proposalCondicao").value = header.condicao_pagamento || "";
    $("proposalFrete").value = header.frete || 0;
    $("proposalValidade").value = header.validade_proposta || "";
    $("proposalEntrega").value = header.data_prevista_entrega || "";
    $("proposalObservacao").value = header.observacao || "";
    $("proposalOriginalLink").classList.toggle("hidden", !header.documento_original_url);
    if (header.documento_original_url) $("proposalOriginalLink").href = header.documento_original_url;
    $("proposalsAiStatus").classList.add("hidden");
    $("proposalsUnmatchedList").innerHTML = "";
    renderProposalItems();
    recalcFooter();
  }

  function generalFieldsFromForm() {
    return {
      condicao_pagamento: $("proposalCondicao").value.trim(), frete: Number($("proposalFrete").value) || 0,
      validade_proposta: $("proposalValidade").value, data_prevista_entrega: $("proposalEntrega").value,
      observacao: $("proposalObservacao").value.trim(),
    };
  }

  function renderProposalItems() {
    const supplierId = state.activeSupplierId;
    $("proposalsItemsList").innerHTML = state.currentWorkspace.items.map((item) => {
      const resp = (item.respostas || []).find((r) => r.supplier_id === supplierId);
      const naoCotado = resp?.nao_cotado || false;
      const valorUnitario = resp && !resp.nao_cotado ? resp.valor_unitario : "";
      const prazoIndividual = resp?.prazo_individual ? resp.data_prevista_entrega : "";
      return `
      <div class="pv-proposal-item-row ${naoCotado ? "is-not-quoted" : ""}" data-item-id="${esc(item.id)}">
        <div class="pv-proposal-item-info">
          <strong>${esc(item.nome)}</strong>
          <small>${Number(item.quantidade_cotada).toLocaleString("pt-BR")} ${esc(item.unidade)} · Necessidade operação: ${item.data_necessidade_mais_cedo ? fmtDate(item.data_necessidade_mais_cedo) : "—"}</small>
          <button type="button" class="pv-item-deadline-link" data-toggle-deadline ${prazoIndividual ? "style=\"display:none\"" : ""}>+ prazo diferente para este item</button>
          <div class="pv-item-deadline ${prazoIndividual ? "" : "hidden"}" data-deadline-box>
            <label>Entrega prevista deste item<input type="date" data-item-deadline-input value="${esc(prazoIndividual)}"></label>
          </div>
        </div>
        <label class="pv-proposal-item-checkbox"><input type="checkbox" data-item-nao-cotado ${naoCotado ? "checked" : ""}> Não cotado</label>
        <div class="pv-item-valor-unitario-field"><small>Valor unitário</small><input type="number" min="0" step="0.01" data-item-valor value="${valorUnitario}" ${naoCotado ? "disabled" : ""}></div>
        <div class="pv-proposal-item-total"><small>Total</small><strong data-item-total>${money(naoCotado ? 0 : (Number(valorUnitario) || 0) * Number(item.quantidade_cotada))}</strong></div>
      </div>`;
    }).join("");
    lucide.createIcons();
  }

  function itemRowInfo(row) {
    const item = state.currentWorkspace.items.find((i) => i.id === row.dataset.itemId);
    const naoCotado = row.querySelector("[data-item-nao-cotado]").checked;
    const valorUnitario = Number(row.querySelector("[data-item-valor]").value) || 0;
    const deadlineBox = row.querySelector("[data-deadline-box]");
    const deadlineInput = row.querySelector("[data-item-deadline-input]");
    const hasOverride = deadlineBox && !deadlineBox.classList.contains("hidden") && deadlineInput.value;
    return { item, naoCotado, valorUnitario, overrideDate: hasOverride ? deadlineInput.value : null };
  }

  function recalcItemRowTotal(row) {
    const { item, naoCotado, valorUnitario } = itemRowInfo(row);
    row.querySelector("[data-item-total]").textContent = money(naoCotado ? 0 : valorUnitario * Number(item.quantidade_cotada));
  }

  function recalcFooter() {
    const general = generalFieldsFromForm();
    let itemsTotal = 0, atende = true, anyQuoted = false;
    document.querySelectorAll("#proposalsItemsList .pv-proposal-item-row").forEach((row) => {
      const { item, naoCotado, valorUnitario, overrideDate } = itemRowInfo(row);
      if (naoCotado) return;
      anyQuoted = true;
      itemsTotal += valorUnitario * Number(item.quantidade_cotada);
      const effectiveDate = overrideDate || general.data_prevista_entrega;
      if (item.data_necessidade_mais_cedo && effectiveDate && effectiveDate > item.data_necessidade_mais_cedo) atende = false;
    });
    $("proposalsFooterItemsTotal").textContent = money(itemsTotal);
    $("proposalsFooterFrete").textContent = money(general.frete);
    $("proposalsFooterTotal").textContent = money(itemsTotal + general.frete);
    const pill = $("proposalsFooterPcp");
    if (!anyQuoted) { pill.textContent = ""; pill.className = "pv-status-pill"; return; }
    pill.textContent = atende ? "Atende a operação" : "Não atende a operação";
    pill.className = `pv-status-pill ${atende ? "is-atende" : "is-nao-atende"}`;
  }

  async function saveProposal() {
    const supplierId = state.activeSupplierId;
    if (!supplierId) return notify("Selecione um fornecedor.", "error");
    const rows = [...document.querySelectorAll("#proposalsItemsList .pv-proposal-item-row")];
    const items = [];
    let hasQuoted = false;
    for (const row of rows) {
      const { item, naoCotado, valorUnitario, overrideDate } = itemRowInfo(row);
      if (naoCotado) { items.push({ quotation_item_id: item.id, nao_cotado: true }); continue; }
      if (valorUnitario <= 0) return notify(`Informe o valor unitário de "${item.nome}" ou marque como Não cotado.`, "error");
      hasQuoted = true;
      items.push({ quotation_item_id: item.id, nao_cotado: false, valor_unitario: valorUnitario, data_prevista_entrega: overrideDate });
    }
    if (!hasQuoted) return notify("Informe o valor de ao menos um item.", "error");
    const general = generalFieldsFromForm();
    const header = {
      condicao_pagamento: general.condicao_pagamento || null, frete: general.frete,
      validade_proposta: general.validade_proposta || null, data_prevista_entrega: general.data_prevista_entrega || null,
      observacao: general.observacao || null,
    };
    if (state.pendingAiDocument) {
      header.documento_original_path = state.pendingAiDocument.path || state.pendingAiDocument.url;
      header.documento_original_nome = state.pendingAiDocument.nome;
      header.documento_original_tipo = state.pendingAiDocument.tipo;
      header.importado_com_ia = true;
    }
    try {
      await window.AcervoComprasAPI.saveQuotationSupplierResponse(state.currentWorkspace.id, supplierId, header, items);
      state.pendingAiDocument = null;
      state.lastAiResult = null;
      notify("Proposta salva.");
      await refreshWorkspace();
      await reloadAll();
    } catch (e) { notify(e.message || "Não foi possível salvar a proposta.", "error"); }
  }

  // ===================== Comparativo (mesmo modal) =====================
  function renderCompareMode() {
    const data = state.currentWorkspace;
    $("proposalsCompareBody").innerHTML = data.items.map((item) => {
      const respostas = (item.respostas || []).filter((r) => !r.nao_cotado);
      const cheapestId = respostas.length ? respostas.reduce((best, r) => (Number(r.valor_total) < Number(best.valor_total) ? r : best)).supplier_id : null;
      const withEta = respostas.filter((r) => r.data_prevista_entrega);
      const fastestId = withEta.length ? withEta.reduce((best, r) => (r.data_prevista_entrega < best.data_prevista_entrega ? r : best)).supplier_id : null;
      const fitting = respostas.filter((r) => r.atende_pcp);
      const pool = fitting.length ? fitting : respostas;
      const suggestedId = pool.length ? pool.reduce((best, r) => (Number(r.valor_total) < Number(best.valor_total) ? r : best)).supplier_id : null;
      return `
      <article class="pv-compare-item">
        <header>
          <div><strong>${esc(item.nome)}</strong><small>${Number(item.quantidade_cotada).toLocaleString("pt-BR")} ${esc(item.unidade)} · Necessidade operação: ${item.data_necessidade_mais_cedo ? fmtDate(item.data_necessidade_mais_cedo) : "—"}</small></div>
        </header>
        ${respostas.length ? `
        <div class="pv-proposal-list">
          ${respostas.map((r, idx) => {
            const isCheapest = r.supplier_id === cheapestId, isFastest = r.supplier_id === fastestId, isRisk = !r.atende_pcp;
            return `<label class="pv-proposal-row ${isCheapest ? "is-cheapest" : ""} ${isFastest ? "is-fastest" : ""} ${isRisk ? "is-risk" : ""}">
              <input type="radio" name="winner-${esc(item.id)}" value="${esc(r.supplier_id)}" ${r.supplier_id === suggestedId ? "checked" : ""}>
              <div class="pv-proposal-fornecedor">
                ${window.ComprasFoto.comNome(window.ComprasFoto.fornecedor(r.supplier_id, r.fornecedor_nome, 26), `<strong>${esc(r.fornecedor_nome)}</strong>`)}
                ${isCheapest ? `<span class="pv-proposal-badge is-cheapest">Melhor preço</span>` : ""}
                ${isFastest ? `<span class="pv-proposal-badge is-fastest">Melhor prazo</span>` : ""}
                ${isRisk ? `<span class="pv-proposal-badge is-risk">Não atende operação</span>` : ""}
                ${qualityTag(r.supplier_id)}
              </div>
              <div class="pv-proposal-cell"><small>Vl. unit.</small>${money(r.valor_unitario)}</div>
              <div class="pv-proposal-cell"><small>Frete</small>${money(r.frete)}</div>
              <div class="pv-proposal-cell pv-proposal-total"><small>Total</small>${money(r.valor_total)}</div>
              <div class="pv-proposal-cell"><small>Chegada</small>${r.data_prevista_entrega ? fmtDate(r.data_prevista_entrega) : "—"}</div>
              <div class="pv-proposal-cell"><small>Pagamento</small>${esc(r.condicao_pagamento || "—")}</div>
            </label>`;
          }).join("")}
          <label class="pv-proposal-row is-skip"><input type="radio" name="winner-${esc(item.id)}" value=""><div class="pv-proposal-fornecedor"><strong>Não comprar agora</strong></div></label>
        </div>` : `<div class="pv-compare-empty"><span>Nenhuma proposta registrada</span></div>`}
      </article>`;
    }).join("");
  }

  async function generatePurchaseOrdersFromWorkspace() {
    const selections = [];
    (state.currentWorkspace.items || []).forEach((item) => {
      const checked = document.querySelector(`#proposalsCompareBody input[name="winner-${item.id}"]:checked`);
      if (checked && checked.value) selections.push({ quotation_item_id: item.id, supplier_id: checked.value, quantidade: item.quantidade_cotada });
    });
    if (!selections.length) return notify("Escolha o fornecedor vencedor de ao menos um item.", "error");
    // Trava contra clique duplo: cada clique emitia um novo conjunto de pedidos.
    const generateBtn = $("proposalsGenerateBtn");
    if (generateBtn.disabled) return;
    generateBtn.disabled = true;
    try {
      const result = await window.AcervoComprasAPI.createPurchaseOrdersFromQuotation(state.currentWorkspace.id, selections);
      // (2026-10-10) um ARQUIVO por pedido (um por fornecedor): abrir em abas novas fazia o navegador bloquear a 2ª como pop-up
      let pdfFailures = 0;
      for (const order of result.orders || []) {
        try {
          const o = await window.AcervoComprasAPI.getPurchaseOrderV2Detail(order.id);
          const company = await safeCompanyProfile(o.billing_company);
          await window.AcervoComprasDocs.downloadPurchaseOrder({
            numero: o.numero, fornecedor: o.fornecedor, comprador: o.comprador_nome,
            condicaoPagamento: o.condicao_pagamento, prazoAcordado: o.prazo_acordado, enderecoEntrega: o.endereco_entrega,
            observacoes: o.observacoes, valorTotal: o.valor_total,
            items: (o.items || []).map((i) => ({ codigo: i.codigo, nome: i.nome, especificacao: i.especificacao, quantidade: i.quantidade, unidade: i.unidade, valorUnitario: i.valor_unitario, valorTotal: i.valor_total })),
            company,
          });
        } catch (pdfError) {
          pdfFailures += 1; // o pedido já foi gerado; o PDF pode ser baixado depois na aba Pedidos
          console.error("[Compras] PDF do pedido", pdfError);
        }
      }
      $("proposalsDialog").close();
      await reloadAll();
      notify(`${result.orders.length} pedido(s) de compra emitido(s) — um arquivo por fornecedor baixado${pdfFailures ? ` (${pdfFailures} arquivo(s) não gerado(s): baixe na aba Pedidos)` : ""}.`);
      selectTab("orders");
      document.querySelectorAll(".pv-tab").forEach((b) => b.classList.toggle("active", b.dataset.pvTab === "orders"));
    } catch (e) { notify(e.message || "Não foi possível gerar o(s) pedido(s).", "error"); }
    finally { generateBtn.disabled = false; }
  }

  async function downloadProposalsPdf() {
    const data = state.currentWorkspace;
    try {
      const payload = await buildQuotationRequestPayload({
        numero: data.numero, prazoDesejado: data.prazo_desejado, observacoes: data.observacoes,
        items: (data.items || []).map((i) => ({ codigo: i.codigo, nome: i.nome, especificacao: i.especificacao, quantidade: i.quantidade_cotada, unidade: i.unidade })),
      });
      await window.AcervoComprasDocs.downloadQuotationRequest(payload);
    } catch (e) { notify(e.message || "Não foi possível gerar o PDF.", "error"); }
  }

  // ===================== Importar proposta com IA =====================
  function startAiImport() {
    if (!state.activeSupplierId) return notify("Selecione um fornecedor primeiro.", "error");
    $("proposalFileInput").value = "";
    $("proposalFileInput").click();
  }

  async function handleAiFileSelected() {
    const file = $("proposalFileInput").files?.[0];
    if (!file) return;
    const statusEl = $("proposalsAiStatus");
    statusEl.className = "pv-ai-status";
    statusEl.innerHTML = `<span class="pv-ai-spinner"></span><div><strong>Analisando proposta...</strong><br><small>Identificando materiais, preços e condições comerciais.</small></div>`;
    try {
      const [uploaded, analysis] = await Promise.all([
        window.AcervoComprasAPI.uploadPurchaseDocument(file),
        window.AcervoComprasAPI.analyzePurchaseProposal({
          file, quotationItems: state.currentWorkspace.items.map((i) => ({ id: i.id, codigo: i.codigo, nome: i.nome, especificacao: i.especificacao, unidade: i.unidade })),
        }),
      ]);
      state.pendingAiDocument = uploaded;
      applyAiResult(analysis);
      const matched = analysis.itens.filter((i) => i.quotation_item_id).length;
      const review = analysis.itens.filter((i) => i.confianca === "baixa").length;
      const unmatched = analysis.itens.filter((i) => !i.quotation_item_id).length;
      statusEl.className = "pv-ai-status is-done";
      statusEl.innerHTML = `<i data-lucide="check-circle-2"></i><div><strong>Proposta importada com IA</strong><br><small>${matched} de ${analysis.itens.length} itens identificados${review ? ` · ${review} precisa(m) de revisão` : ""}${unmatched ? ` · ${unmatched} não relacionado(s)` : ""}</small></div>`;
      lucide.createIcons();
    } catch (e) {
      statusEl.className = "pv-ai-status is-error";
      statusEl.innerHTML = `<i data-lucide="alert-triangle"></i><span>${esc(e.message || "Não foi possível analisar o arquivo.")}</span>`;
      lucide.createIcons();
    }
  }

  function applyAiResult(analysis) {
    state.lastAiResult = analysis;
    if (analysis.condicao_pagamento) $("proposalCondicao").value = analysis.condicao_pagamento;
    if (analysis.frete != null) $("proposalFrete").value = analysis.frete;
    if (analysis.validade_proposta) $("proposalValidade").value = analysis.validade_proposta;
    if (analysis.data_prevista_entrega) $("proposalEntrega").value = analysis.data_prevista_entrega;
    if (analysis.observacoes) $("proposalObservacao").value = analysis.observacoes;

    analysis.itens.forEach((aiItem) => {
      if (!aiItem.quotation_item_id) return;
      const row = document.querySelector(`.pv-proposal-item-row[data-item-id="${CSS.escape(aiItem.quotation_item_id)}"]`);
      if (!row) return;
      const naoCotadoBox = row.querySelector("[data-item-nao-cotado]");
      naoCotadoBox.checked = false;
      const valorInput = row.querySelector("[data-item-valor]");
      valorInput.disabled = false;
      if (aiItem.valor_unitario != null) valorInput.value = aiItem.valor_unitario;
      row.classList.remove("is-not-quoted");
      let badge = row.querySelector(".pv-ai-badge");
      if (!badge) { badge = document.createElement("span"); badge.className = "pv-ai-badge"; row.querySelector(".pv-proposal-item-info").appendChild(badge); }
      badge.className = `pv-ai-badge ${aiItem.confianca === "alta" ? "is-safe" : "is-review"}`;
      badge.textContent = aiItem.confianca === "alta" ? "Correspondência encontrada" : "Revisar correspondência";
      row.classList.toggle("is-needs-review", aiItem.confianca === "baixa");
      recalcItemRowTotal(row);
    });
    recalcFooter();
    renderAiUnmatchedItems();
  }

  function renderAiUnmatchedItems() {
    const unmatched = (state.lastAiResult?.itens || []).filter((i) => !i.quotation_item_id);
    $("proposalsUnmatchedList").innerHTML = unmatched.map((aiItem, index) => `
      <div class="pv-ai-unmatched-row">
        <div><strong>Item não relacionado</strong><span>${esc(aiItem.texto_original || "Item do documento")}</span></div>
        <div class="pv-ai-unmatched-actions">
          <button type="button" class="btn btn-secondary pv-btn-sm" data-ai-relate="${index}">Relacionar</button>
          <button type="button" class="icon-btn" data-ai-ignore="${index}" title="Ignorar"><i data-lucide="x"></i></button>
        </div>
      </div>`).join("");
    $("proposalsUnmatchedList").querySelectorAll("[data-ai-relate]").forEach((btn) => btn.addEventListener("click", () => openAiMatchDialog(Number(btn.dataset.aiRelate))));
    $("proposalsUnmatchedList").querySelectorAll("[data-ai-ignore]").forEach((btn) => btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.aiIgnore);
      state.lastAiResult.itens[idx].confianca = "nenhuma";
      state.lastAiResult.itens.splice(idx, 1);
      renderAiUnmatchedItems();
    }));
    lucide.createIcons();
  }

  function openAiMatchDialog(index) {
    state.pendingAiMatchIndex = index;
    const aiItem = state.lastAiResult.itens[index];
    $("aiMatchOriginalText").textContent = `No arquivo: "${aiItem.texto_original || "—"}"`;
    $("aiMatchSelect").innerHTML = `<option value="">Não relacionar</option>` + state.currentWorkspace.items.map((i) => `<option value="${esc(i.id)}">${esc(i.nome)}${i.codigo ? ` (${esc(i.codigo)})` : ""}</option>`).join("");
    $("aiMatchDialog").showModal();
  }

  function confirmAiMatch() {
    const index = state.pendingAiMatchIndex;
    const selectedId = $("aiMatchSelect").value;
    if (selectedId) {
      const aiItem = state.lastAiResult.itens[index];
      aiItem.quotation_item_id = selectedId;
      aiItem.confianca = "baixa";
      applyAiResult(state.lastAiResult);
    }
    $("aiMatchDialog").close();
  }

  // ===================== Pedidos =====================
  function opNumbersChipsHtml(numeros) {
    if (!numeros.length) return `<span class="pv-cell-na">—</span>`;
    const chips = numeros.map((n) => `<span class="pv-alloc-chip">${esc(n)}</span>`).join("");
    return `<div class="pv-alloc-chips" data-fit-chips>${chips}<button type="button" class="pv-alloc-more hidden" data-alloc-toggle>+0</button></div>`;
  }

  function filteredOrders() {
    const mode = $("ordersStatusFilter")?.value || "todos";
    return state.orders.filter((o) => {
      if (mode === "abertos" && ["recebido", "cancelado"].includes(o.status)) return false;
      if (mode === "recebidos" && o.status !== "recebido") return false;
      if (mode === "cancelados" && o.status !== "cancelado") return false;
      return matchesSearch(`PC-${String(o.numero).padStart(6, "0")}`, o.numero, o.fornecedor_nome, ...(o.op_numeros || []), ...purchaseSearch(o),o.numero_nf,...(o.nfe_receipts||[]).map(n=>n.numero_nfe));
    });
  }

  function renderOrders() {
    const orders = filteredOrders();
    $("ordersEmpty").classList.toggle("hidden", orders.length > 0);
    $("ordersEmpty").textContent = state.orders.length ? "Nenhum pedido nesta situação ou busca. Troque o filtro para ver os demais." : "Nenhum pedido de compra emitido ainda.";
    $("ordersBody").innerHTML = orders.map((o) => {
      const ctx=window.ComprasListas.contexto(o,state.needs);
      return `
      <tr class="pv-row-clickable" data-order-id="${esc(o.id)}" tabindex="0" aria-label="Abrir pedido PC-${esc(String(o.numero).padStart(6,'0'))}">
        <td>${window.ComprasFoto.comNome(window.ComprasFoto.fornecedor(o.fornecedor_id || o.fornecedor?.id, o.fornecedor_nome), `<strong>${esc(o.fornecedor_nome)}</strong>`)}</td>
        <td><strong>PC-${esc(String(o.numero).padStart(6, "0"))}</strong><small>Emitido em ${fmtDate(o.created_at)}</small></td>
        <td class="pv-order-quantity">${(o.items || []).map(i => `<div class="pv-list-item"><strong>${esc(i.nome || i.material_nome || "Item")}</strong><small>${quantityText(i.quantidade,i.unidade||'un')}</small></div>`).join('') || '—'}</td>
        <td class="pv-order-destination">${purchaseDestinationsHtml(ctx)}${ctx.pessoas.length?'<small class="pv-order-people">Solicitado por '+ctx.pessoas.map(p=>esc(p.nome)+(p.setor?' · '+esc(p.setor):'')).join('; ')+'</small>':''}</td>
        <td class="pv-order-total">${money(o.valor_total)}</td>
        <td>${deadlineHtml(o.prazo_acordado, ['recebido', 'cancelado'].includes(o.status))}</td>
        <td class="pv-order-receipt">${purchaseReceiptHtml(o)}</td>
        <td><span class="pv-status-pill is-${esc(o.status)}">${esc(orderStatusLabel(o.status))}</span><div class="pv-list-documents">${purchaseInvoiceHtml(o)}</div></td>
      </tr>`;}).join("");
    labelPurchaseCells($('ordersBody'));
    $("ordersBody").querySelectorAll("tr.pv-row-clickable").forEach((tr) => {
      tr.addEventListener("click",e=>{if(!e.target.closest('button,a,input'))openOrderDetail(tr.dataset.orderId);});
      tr.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target===tr){e.preventDefault();openOrderDetail(tr.dataset.orderId);}});
    });
    $("ordersBody").querySelectorAll('[data-order-invoice]').forEach(b=>b.onclick=async()=>{await openOrderDetail(b.dataset.orderInvoice);if(state.currentOrderDetail?.id!==b.dataset.orderInvoice||!$('orderDetailDialog').open)return;const alvo=$('orderCardNf');alvo?.scrollIntoView({behavior:'auto',block:'start'});alvo?.querySelector('button')?.focus();});
    bindAllocChipsToggle($("ordersBody"));
    fitAllocChips();
  }

  function bindAllocChipsToggle(scope) {
    scope.querySelectorAll("[data-alloc-toggle]").forEach((btn) => btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const container = btn.closest(".pv-alloc-chips");
      const expanding = !container.classList.contains("is-expanded");
      container.classList.toggle("is-expanded", expanding);
      if (expanding) {
        container.querySelectorAll(".pv-alloc-chip").forEach((c) => c.classList.remove("hidden"));
        btn.textContent = "− ocultar";
      } else {
        fitAllocChips();
      }
    }));
  }
  function orderStatusLabel(s) { return { aguardando_recebimento: "Aguardando recebimento", parcialmente_recebido: "Recebido parcialmente", emitido: "Emitido", aguardando_faturamento: "Aguardando faturamento", faturado: "Faturado", aguardando_entrega: "Aguardando entrega", recebido_parcial: "Recebido parcialmente", recebido: "Recebido", cancelado: "Cancelado" }[s] || s; }
  function paymentMethodLabel(v) { return { boleto: "Boleto", pix: "PIX", transferencia: "Transferência", cartao: "Cartão", dinheiro: "Dinheiro" }[v] || v || "—"; }
  async function confirmDirectDelivery() {
    const order = state.currentOrderDetail;
    if (!order?.id) return;
    const ok = window.AcervoComprasAlert?.confirm
      ? await window.AcervoComprasAlert.confirm({ type: "warning", title: "Confirmar entrega no terceirizado?", message: `O pedido PC-${String(order.numero).padStart(6, "0")} fica recebido e o material da OP é dado como entregue no fornecedor da terceirização (não entra no almoxarifado).`, confirmText: "Confirmar entrega", cancelText: "Cancelar" })
      : window.confirm("Confirmar entrega no terceirizado?");
    if (!ok) return;
    try {
      const { error } = await window.AcervoComprasAPI.getClient().rpc("confirm_purchase_order_direct_delivery", { p_order_id: order.id });
      if (error) throw error;
      notify("Entrega no terceirizado confirmada.");
      $("orderDetailDialog").close();
      await reloadAll();
    } catch (e) { notify(e.message || "Não foi possível confirmar a entrega.", "error"); }
  }

  async function openOrderDetail(id) {
    state.paymentDraft = null;
    try {
      const data = await window.AcervoComprasAPI.getPurchaseOrderV2Detail(id);
      state.currentOrderDetail = data;
      renderOrderDetail();
      $("orderDetailTitle").textContent = `PC-${String(data.numero).padStart(6, "0")}`;
      const received = (data.items || []).some((it) => Number(it.quantidade_recebida || 0) > 0);
      $("orderCancelBtn").classList.toggle("hidden", data.status === "cancelado" || received);
      // entrega direta no fornecedor da terceirizacao: Compras confirma aqui (nao passa pelo almoxarifado)
      $("orderDirectDeliveryBtn").classList.toggle("hidden", !data.entrega_direta_fornecedor_id || ["recebido", "cancelado"].includes(data.status));
      $("orderDetailDialog").showModal();
      fitAllocChips();
      lucide.createIcons();
    } catch (e) { notify(e.message || "Não foi possível abrir o pedido.", "error"); }
  }

  function orderSaldo(it) { return Math.max(0, Number(it.quantidade) - Number(it.quantidade_recebida || 0)); }

  function orderDocStatus(o) {
    const xmlOk = (o.nfe_receipts || []).length > 0;
    return { xmlOk };
  }

  function allocationChipsHtml(necessidades, unidade, expanded = false) {
    if (!necessidades.length) return `<span class="pv-cell-na">—</span>`;
    const chips = necessidades.map((n) => `<span class="pv-alloc-chip">${esc(n.order_number ? "Pedido " + n.order_number : "Solicitação interna")} · ${Number(n.quantidade_alocada).toLocaleString("pt-BR")} ${esc(unidade)}</span>`).join("");
    return `<div class="pv-alloc-chips${expanded ? " is-expanded" : ""}" data-fit-chips>${chips}<button type="button" class="pv-alloc-more hidden" data-alloc-toggle>+0</button></div>`;
  }

  function fitAllocChips() {
    document.querySelectorAll(".pv-alloc-chips[data-fit-chips]").forEach((container) => {
      if (container.classList.contains("is-expanded")) return;
      const more = container.querySelector(".pv-alloc-more");
      const chips = [...container.querySelectorAll(".pv-alloc-chip")];
      if (!more || chips.length < 2) { more?.classList.add("hidden"); return; }
      chips.forEach((c) => c.classList.remove("hidden"));
      more.classList.add("hidden");
      const available = container.clientWidth;
      if (!available) return;
      const gap = 5;
      let used = 0, visibleCount = chips.length;
      for (let i = 0; i < chips.length; i++) {
        used += chips[i].getBoundingClientRect().width + gap;
        if (used > available) { visibleCount = i; break; }
      }
      if (visibleCount >= chips.length) return;
      more.classList.remove("hidden");
      more.textContent = `+${chips.length - visibleCount}`;
      const moreWidth = more.getBoundingClientRect().width + gap;
      while (visibleCount > 0 && used + moreWidth > available) {
        visibleCount--;
        used -= chips[visibleCount].getBoundingClientRect().width + gap;
        more.textContent = `+${chips.length - visibleCount}`;
      }
      chips.forEach((c, i) => c.classList.toggle("hidden", i >= visibleCount));
    });
  }

  function renderOrderDetail() {
    const o = state.currentOrderDetail;
    const { xmlOk } = orderDocStatus(o);
    // (16/11/2026) igual à Tecnoweld: resumo no cabeçalho, andamento, itens + pagamento à esquerda, nota fiscal / recebimento / histórico à direita
    const recebido = o.status === "recebido";
    const pago = Boolean(o.parcelas && o.parcelas.length);
    const passos = [
      { ok: true, t: "Pedido emitido", d: fmtDate(o.created_at) },
      { ok: Boolean(o.prazo_acordado), t: "Prazo combinado", d: o.prazo_acordado ? fmtDate(o.prazo_acordado) : "falta informar" },
      { ok: pago, t: "Pagamento", d: pago ? `${o.parcelas.length} parcela(s) no Contas a Pagar` : "falta informar", go: "orderPaySection" },
      { ok: xmlOk, t: "Nota fiscal", d: xmlOk ? "XML anexado" : "aguardando", go: "orderCardNf" },
      { ok: recebido, t: "Recebido", d: recebido ? "concluído" : o.status === "recebido_parcial" ? "parcial" : "aguardando" },
    ];
    const fz = o.fornecedor || {};
    $("orderDetailMeta").innerHTML = `<div class="pv-od-headline">
        <div class="pv-od-summary pv-od-summary-head">
          <div class="pv-od-kpi is-main"><small>Fornecedor</small>${window.ComprasFoto.comNome(window.ComprasFoto.fornecedor(fz.id || o.fornecedor_id, fz.nome || o.fornecedor_nome, 34), `<strong>${esc(fz.nome || o.fornecedor_nome || "—")}</strong>`)}<span>${esc([fz.documento, fz.telefone, fz.email].filter(Boolean).join(" · "))}</span></div>
          <div class="pv-od-kpi"><small>Valor total</small><strong class="pv-od-money">${money(o.valor_total)}</strong><span>${(o.items || []).length} item(ns)</span></div>
          <div class="pv-od-kpi"><small>Chegada combinada</small><strong>${o.prazo_acordado ? fmtDate(o.prazo_acordado) : "—"}</strong><span>${esc(orderStatusLabel(o.status))}</span></div>
          <div class="pv-od-kpi"><small>Faturar para</small><button type="button" class="pv-company-chip" data-order-company title="Trocar a empresa (CNPJ) deste pedido"><i data-lucide="building-2"></i>${esc(o.billing_company ? [o.billing_company.rotulo, o.billing_company.cnpj].filter(Boolean).join(" · ") : "Empresa principal")}</button>${o.comprador_nome ? `<span>Comprador: ${esc(o.comprador_nome)}</span>` : ""}</div>
        </div>
      </div>`;
    $("orderDetailBody").innerHTML = `
      <div class="pv-od">
        ${o.billing_company_conflito ? `<p class="pv-company-warning"><i data-lucide="triangle-alert"></i> Este pedido junta itens de pedidos de empresas diferentes. Confira e escolha em "Faturar para" o CNPJ do pedido (ou separe em pedidos).</p>` : ""}
        <nav class="pv-od-steps" aria-label="Andamento do pedido">
          ${passos.map((x) => `<button type="button" class="pv-od-step${x.ok ? " is-ok" : ""}" ${x.go ? `data-od-go="${x.go}"` : "disabled"}><span class="pv-od-dot">${x.ok ? "✓" : ""}</span><span><strong>${esc(x.t)}</strong><small>${esc(x.d)}</small></span></button>`).join("")}
        </nav>
        <div class="pv-od-grid">
          <div class="pv-od-main">
            <section class="pv-od-card" id="orderCardItens">
              <div class="pv-order-table-wrap">
                <table class="pv-table pv-order-table">
                  <thead><tr><th>Material</th><th>Comprado</th><th>Recebido</th><th>Saldo</th><th>Para</th></tr></thead>
                  <tbody>
                    ${(o.items || []).map((it) => `
                    <tr data-item-id="${esc(it.id)}">
                      <td><strong>${esc(it.nome)}</strong>${it.valor_unitario ? `<small>${money(it.valor_unitario)} / ${esc(it.unidade)} · ${money(it.valor_total)}</small>` : ""}</td>
                      <td>${Number(it.quantidade).toLocaleString("pt-BR")} ${esc(it.unidade)}</td>
                      <td>${Number(it.quantidade_recebida || 0).toLocaleString("pt-BR")} ${esc(it.unidade)}</td>
                      <td>${orderSaldo(it).toLocaleString("pt-BR")} ${esc(it.unidade)}</td>
                      <td>${allocationChipsHtml(it.necessidades || [], it.unidade, true)}</td>
                    </tr>`).join("")}
                  </tbody>
                </table>
              </div>
            </section>
            <section class="pv-pay-section" id="orderPaySection"><header><h3>Pagamento e parcelas</h3><small>Forma de pagamento e parcelas que vão para o Contas a Pagar</small></header>${paymentBlockHtml(o)}</section>
          </div>
          <aside class="pv-od-side">
            <section class="pv-od-card" id="orderCardNf">
              <header><h3>Nota fiscal</h3><span class="pv-status-pill ${xmlOk ? "is-ok" : "is-pending"}">${xmlOk ? "XML anexado" : "Pendente"}</span></header>
              ${(o.nfe_receipts || []).length ? `<ul class="pv-od-list">${o.nfe_receipts.map((r) => `<li><strong>NF ${esc(r.numero_nfe || "s/n")}</strong><span>${money(r.valor_total)}</span></li>`).join("")}</ul>` : `<p class="pv-od-hint">O XML pode chegar antes da mercadoria; o Almoxarifado encontra a nota pronta.</p>`}
              <div class="pv-od-btns">
                <button class="btn btn-secondary pv-btn-sm" type="button" id="attachInvoiceBtn"><i data-lucide="file-plus"></i> Anexar XML da NF-e</button>
              </div>
            </section>
            ${(o.historico || []).length ? `<section class="pv-od-card"><header><h3>Histórico</h3><small>${o.historico.length} registro(s)</small></header><ul class="pv-od-history">${o.historico.slice(0, 8).map((h) => `<li><time>${new Date(h.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time><strong>${esc(h.acao === "alterado_recebimento" ? "Alterado no recebimento" : String(h.acao || "").replaceAll("_", " "))}</strong><span>${esc(h.observacao || "")}${h.usuario_nome ? ` · ${esc(h.usuario_nome)}` : ""}</span></li>`).join("")}</ul></section>` : ""}
          </aside>
        </div>
      </div>
    `;
    $("orderDetailBody").querySelectorAll("[data-od-go]").forEach((b) => b.addEventListener("click", () => {
      const el = $(b.dataset.odGo); if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" }); el.classList.add("pv-od-flash"); setTimeout(() => el.classList.remove("pv-od-flash"), 1400);
    }));
    $("attachInvoiceBtn").addEventListener("click", () => { state.pendingInvoiceOrder = o.id; $("invoiceDialog").showModal(); });
    bindPaymentBlock(o);
    // (16/11/2026) Salvar no rodapé (ao lado de Gerar PDF e Fechar): grava o pagamento e as parcelas no Contas a Pagar
    const save = $("orderDetailSaveBtn");
    save.classList.toggle("hidden", o.status === "cancelado");
    save.onclick = () => { const b = $("orderDetailBody").querySelector("[data-payment-send]"); if (b) b.click(); else notify("Nada para salvar: o pagamento já está no Contas a Pagar. Use Refazer para mudar as parcelas."); };
    bindAllocChipsToggle($("orderDetailBody"));
    fitAllocChips();
    updateOrderFooterSummary();
    lucide.createIcons();
  }

  // Valores e pagamento do pedido (out/2026): Compras diz quanto deu e como paga; vira títulos no Contas a Pagar
  // (compras_pedido_pagamento). Refazer só enquanto nada foi pago no Financeiro.
  function paymentAddDays(iso, days) { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
  function paymentDefaultDraft(o) {
    const total = Math.round(Number(o.valor_total || 0) * 100) / 100;
    const first = paymentAddDays(new Date().toISOString().slice(0, 10), 30);
    return { forma: o.forma_pagamento || "boleto", total, parcelas: [{ vencimento: first, valor: total }], cartao: o.cartao_id || "", compra: o.cartao_compra_em || new Date().toISOString().slice(0, 10) };
  }
  function paymentBlockHtml(o) {
    if (o.status === "cancelado") return "";
    const d = state.paymentDraft;
    if (o.parcelas && !d) {
      return `<p class="pv-payment-confirmed"><i data-lucide="check-circle-2"></i> Pagamento confirmado — ${esc(paymentMethodLabel(o.forma_pagamento))}${o.cartao_nome ? ` (${esc(o.cartao_nome)})` : ""}, ${o.parcelas.length} parcela(s) enviada(s) ao Contas a Pagar${o.pagamento_por_nome ? ` por ${esc(o.pagamento_por_nome)}` : ""}.<button type="button" class="btn btn-secondary pv-btn-sm pv-payment-redo" data-payment-redo>Refazer</button></p>
        <ul class="pv-payment-list">${o.parcelas.map((p, k) => `<li>${k + 1}ª · ${fmtDate(p.due_date)} · ${money(p.amount)}</li>`).join("")}</ul>`;
    }
    const draft = d || paymentDefaultDraft(o);
    const sum = draft.parcelas.reduce((s, p) => s + Number(p.valor || 0), 0);
    const wrong = Math.abs(sum - Number(draft.total || 0)) > 0.05;
    return `<div class="pv-payment" data-payment>
      <div class="pv-payment-head"><h3>Valores e pagamento</h3><span class="pv-hint">Gera os títulos no Contas a Pagar (Financeiro).</span></div>
      <div class="pv-payment-grid">
        <label>Forma de pagamento<select data-payment-field="forma">${["boleto", "pix", "transferencia", "cartao", "dinheiro"].map((f) => `<option value="${f}"${f === draft.forma ? " selected" : ""}>${paymentMethodLabel(f)}</option>`).join("")}</select></label>
        ${draft.forma === "cartao" ? `<label>Cartão<select data-payment-field="cartao"><option value="">${(state.cartoes || []).length ? "Escolha o cartão" : "Nenhum cartão cadastrado"}</option>${(state.cartoes || []).map((c) => `<option value="${esc(c.id)}"${c.id === draft.cartao ? " selected" : ""}>${esc(c.nome + (c.final ? " · final " + c.final : ""))}</option>`).join("")}</select></label><label>Data da compra<input type="date" data-payment-field="compra" value="${esc(draft.compra || "")}"></label>` : ""}
        <label>Total a pagar<input type="text" inputmode="decimal" data-payment-field="total" value="${esc(String(draft.total).replace(".", ","))}"></label>
        <label>Parcelas<span class="pv-payment-split"><input type="number" min="1" max="24" data-payment-field="n" value="${draft.parcelas.length}"><button type="button" class="btn btn-secondary pv-btn-sm" data-payment-split>Dividir</button></span></label>
      </div>
      <table class="pv-payment-rows"><tbody>${draft.parcelas.map((p, k) => `<tr data-payment-row="${k}"><td>${k + 1}ª</td><td><input type="date" data-payment-part="vencimento" value="${esc(p.vencimento)}"></td><td><input type="text" inputmode="decimal" data-payment-part="valor" value="${esc(String(p.valor).replace(".", ","))}"></td></tr>`).join("")}</tbody></table>
      ${draft.forma === "cartao" && draft.cartao ? `<p class="pv-hint">No cartão, cada parcela vence na fatura em que cai (pela data da compra e o dia em que o cartão vira); as datas acima são ajustadas no Financeiro.</p>` : ""}
      <p class="pv-payment-sum${wrong ? " is-error" : ""}" data-payment-sum>Soma das parcelas: ${money(sum)}${wrong ? " — diferente do total" : ""}</p>
      <div class="pv-payment-actions">${o.parcelas ? `<button type="button" class="btn btn-secondary pv-btn-sm" data-payment-cancel>Cancelar</button>` : ""}<button type="button" hidden data-payment-send>Salvar</button></div>
    </div>`;
  }
  function paymentNumber(v) { let t = String(v || "").trim(); if (t.includes(",")) t = t.replace(/\./g, "").replace(",", "."); const n = Number(t); return Number.isFinite(n) ? n : 0; }
  function bindPaymentBlock(o) {
    const box = $("orderDetailBody");
    const rerender = () => { renderOrderDetail(); };
    box.querySelector("[data-payment-redo]")?.addEventListener("click", () => { state.paymentDraft = paymentDefaultDraft(o); state.paymentDraft.parcelas = (o.parcelas || []).map((p) => ({ vencimento: p.due_date, valor: Number(p.amount) })); if (!state.paymentDraft.parcelas.length) state.paymentDraft = paymentDefaultDraft(o); else state.paymentDraft.total = Math.round(state.paymentDraft.parcelas.reduce((s, p) => s + p.valor, 0) * 100) / 100; rerender(); });
    const panel = box.querySelector("[data-payment]");
    if (!panel) return;
    if (!state.paymentDraft) state.paymentDraft = paymentDefaultDraft(o);
    const d = state.paymentDraft;
    const refreshSum = () => {
      const sum = d.parcelas.reduce((s, p) => s + Number(p.valor || 0), 0), wrong = Math.abs(sum - Number(d.total || 0)) > 0.05;
      const el = panel.querySelector("[data-payment-sum]");
      el.textContent = `Soma das parcelas: ${money(sum)}${wrong ? " — diferente do total" : ""}`;
      el.classList.toggle("is-error", wrong);
    };
    panel.querySelector('[data-payment-field="forma"]').addEventListener("change", (e) => { d.forma = e.target.value; if (d.forma === "cartao" && !state.cartoes) window.AcervoComprasAPI.listCreditCards().then((l) => { state.cartoes = l; if (!d.cartao && l.length === 1) d.cartao = l[0].id; rerender(); }).catch(() => { state.cartoes = []; rerender(); }); else rerender(); });
    panel.querySelector('[data-payment-field="cartao"]')?.addEventListener("change", (e) => { d.cartao = e.target.value; rerender(); });
    panel.querySelector('[data-payment-field="compra"]')?.addEventListener("change", (e) => { d.compra = e.target.value; });
    if (d.forma === "cartao" && !state.cartoes) window.AcervoComprasAPI.listCreditCards().then((l) => { state.cartoes = l; if (!d.cartao && l.length === 1) d.cartao = l[0].id; rerender(); }).catch(() => { state.cartoes = []; });
    panel.querySelector('[data-payment-field="total"]').addEventListener("input", (e) => { d.total = paymentNumber(e.target.value); refreshSum(); });
    panel.querySelectorAll("[data-payment-row]").forEach((tr) => {
      const p = d.parcelas[Number(tr.dataset.paymentRow)];
      tr.querySelector('[data-payment-part="vencimento"]').addEventListener("input", (e) => { p.vencimento = e.target.value; });
      tr.querySelector('[data-payment-part="valor"]').addEventListener("input", (e) => { p.valor = paymentNumber(e.target.value); refreshSum(); });
    });
    panel.querySelector("[data-payment-split]").addEventListener("click", () => {
      const n = Math.min(24, Math.max(1, parseInt(panel.querySelector('[data-payment-field="n"]').value, 10) || 1));
      const total = Number(d.total || 0), base = Math.floor((total / n) * 100) / 100;
      const start = d.parcelas[0]?.vencimento || paymentAddDays(new Date().toISOString().slice(0, 10), 30);
      d.parcelas = Array.from({ length: n }, (_, k) => ({ vencimento: paymentAddDays(start, 30 * k), valor: k === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base }));
      rerender();
    });
    panel.querySelector("[data-payment-cancel]")?.addEventListener("click", () => { state.paymentDraft = null; rerender(); });
    panel.querySelector("[data-payment-send]").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (!(Number(d.total) > 0)) { notify("Informe o total a pagar.", "error"); return; }
      if (d.parcelas.some((p) => !p.vencimento || !(Number(p.valor) > 0))) { notify("Cada parcela precisa de vencimento e valor.", "error"); return; }
      if (Math.abs(d.parcelas.reduce((s, p) => s + Number(p.valor || 0), 0) - Number(d.total)) > 0.05) { notify("A soma das parcelas está diferente do total.", "error"); return; }
      if (d.forma === "cartao" && (state.cartoes || []).length && !d.cartao) { notify("Escolha o cartão de crédito usado na compra.", "error"); return; }
      btn.disabled = true;
      try {
        await window.AcervoComprasAPI.setPurchaseOrderPayment(o.id, d.forma, d.parcelas.map((p) => ({ vencimento: p.vencimento, valor: Number(p.valor) })), Number(d.total), d.cartao || null, d.compra || null);
        notify(`${d.parcelas.length} parcela(s) enviada(s) ao Contas a Pagar.`);
        state.paymentDraft = null;
        await openOrderDetail(o.id);
        await reloadAll();
      } catch (err) { notify(err.message || "Não foi possível enviar ao Contas a Pagar.", "error"); btn.disabled = false; }
    });
  }

  function updateOrderFooterSummary() {
    const o = state.currentOrderDetail;
    const { xmlOk } = orderDocStatus(o);
    $("orderDetailFooterTotal").textContent = money(o.valor_total);
    const complete = xmlOk;
    const pill = $("orderDetailFooterStatus");
    pill.textContent = complete ? "Documentação completa" : "Aguardando documentação";
    pill.className = `pv-status-pill ${complete ? "is-ok" : "is-pending"}`;
  }

  async function submitInvoiceXml() {
    const file = $("invoiceXmlFile").files?.[0];
    if (!file) return notify("Selecione o arquivo XML.", "error");
    try {
      const text = await file.text();
      const parsed = window.AcervoNfeParser.parse(text);
      await window.AcervoComprasAPI.createNfeReceiptDraftForPurchaseOrder(
        state.pendingInvoiceOrder,
        { ...parsed, nome_arquivo_xml: file.name, xml_text: text },
        parsed.items,
      );
      $("invoiceDialog").close();
      await openOrderDetail(state.pendingInvoiceOrder);
      await reloadAll();
      notify("XML importado. O Almoxarifado vai encontrar esta nota pronta ao dar entrada.");
    } catch (e) { notify(e.message || "Não foi possível importar o XML.", "error"); }
  }

  async function downloadOrderPdf() {
    const o = state.currentOrderDetail;
    const company = await safeCompanyProfile(o.billing_company);
    try {
      await window.AcervoComprasDocs.downloadPurchaseOrder({
        numero: o.numero, fornecedor: o.fornecedor, comprador: o.comprador_nome,
        condicaoPagamento: o.condicao_pagamento, prazoAcordado: o.prazo_acordado, enderecoEntrega: o.endereco_entrega,
        observacoes: o.observacoes, valorTotal: o.valor_total,
        items: (o.items || []).map((i) => ({ codigo: i.codigo, nome: i.nome, especificacao: i.especificacao, quantidade: i.quantidade, unidade: i.unidade, valorUnitario: i.valor_unitario, valorTotal: i.valor_total })),
        company,
      });
    } catch (e) { notify(e.message || "Não foi possível gerar o PDF.", "error"); }
  }

  // Pede um motivo obrigatorio (cancelar pedido / encerrar cotacao).
  function askReason(title, message, confirmText) {
    return new Promise((resolve) => {
      const d = document.createElement("dialog");
      d.className = "pv-dialog";
      d.innerHTML = `<form class="dialog-card"><header><h2>${esc(title)}</h2></header><div><p class="pv-hint">${esc(message)}</p><label>Motivo<textarea name="motivo" rows="3" required></textarea></label></div><footer><button type="button" class="btn btn-secondary" data-close>Voltar</button><button type="submit" class="btn btn-primary">${esc(confirmText)}</button></footer></form>`;
      document.body.append(d);
      let value = null;
      d.querySelector("[data-close]").onclick = () => d.close();
      d.querySelector("form").onsubmit = (e) => { e.preventDefault(); value = new FormData(e.target).get("motivo").trim(); if (value) d.close(); };
      d.addEventListener("close", () => { d.remove(); resolve(value || null); });
      d.showModal();
      d.querySelector("textarea").focus();
    });
  }

  async function cancelCurrentOrder() {
    const o = state.currentOrderDetail;
    if (!o) return;
    const motivo = await askReason(`Cancelar PC-${String(o.numero).padStart(6, "0")}`, "As solicitações deste pedido voltam para a fila de Compras. Notas ainda não recebidas deste pedido também são canceladas.", "Cancelar pedido");
    if (!motivo) return;
    try {
      await window.AcervoComprasAPI.cancelPurchaseOrderV2(o.id, motivo);
      $("orderDetailDialog").close();
      await reloadAll();
      notify("Pedido cancelado.");
    } catch (e) { notify(e.message || "Não foi possível cancelar o pedido.", "error"); }
  }

  async function cancelQuotation(id) {
    const q = state.quotations.find((item) => item.id === id);
    const motivo = await askReason(`Encerrar SC-${String(q?.numero || "").padStart(6, "0")}`, "A cotação é encerrada sem gerar pedido e as necessidades voltam para a fila de Compras.", "Encerrar cotação");
    if (!motivo) return;
    try {
      await window.AcervoComprasAPI.cancelQuotationRequest(id, motivo);
      await reloadAll();
      notify("Cotação encerrada.");
    } catch (e) { notify(e.message || "Não foi possível encerrar a cotação.", "error"); }
  }

  async function safeCompanyProfile(billing) {
    try {
      const profile = await window.AcervoComprasAPI.getCompanyProfile();
      const base = {
        logo: profile?.logo_url || "",
        isoSeal: profile?.iso_selo_url || null,
        isoName: profile?.iso_certificacao_nome || "Certificação ISO",
        tradeName: profile?.nome_fantasia || profile?.razao_social || "",
        document: profile?.documento || "",
      };
      // pedido de compra faturado em outra empresa (CNPJ): o documento sai com os dados dela
      if (billing) return { ...base, logo: billing.logo_url || base.logo, tradeName: billing.razao_social || billing.nome_fantasia || billing.rotulo || base.tradeName, document: billing.cnpj || base.document };
      return base;
    } catch { return {}; }
  }

  // ---------------------------------------------------------------- Empresa (CNPJ) da compra
  // Cada necessidade vem com a empresa do pedido da OP (sem OP: empresa principal); Compras troca aqui.
  let billingCompanies = null;
  async function loadBillingCompanies() {
    if (billingCompanies) return billingCompanies;
    try { billingCompanies = (await window.AcervoComprasAPI.listBillingCompaniesBasic())?.empresas || []; } catch { billingCompanies = []; }
    return billingCompanies;
  }
  function companyChip(n) {
    if (!n.billing_company_id && !n.billing_company_rotulo) return "";
    return `<button type="button" class="pv-company-chip" data-need-company="${esc(n.id)}" title="Empresa (CNPJ) desta compra — clique para trocar"><i data-lucide="building-2"></i>${esc(n.billing_company_rotulo || "Empresa")}</button>`;
  }
  async function pickCompany(title, currentId) {
    const empresas = await loadBillingCompanies();
    if (!empresas.length) { notify("Nenhuma empresa de faturamento cadastrada (Parâmetros Gerais → Empresa).", "error"); return null; }
    return new Promise((resolve) => {
      const d = document.createElement("dialog");
      d.className = "pv-company-dialog";
      d.innerHTML = `<form method="dialog"><h3>${esc(title)}</h3><div class="pv-company-options">${empresas.map((c) => `<button type="button" data-pick="${esc(c.id)}" class="${c.id === currentId ? "is-current" : ""}"><strong>${esc(c.rotulo)}</strong><small>${esc([c.razao_social, c.cnpj].filter(Boolean).join(" · "))}${c.id === currentId ? " · atual" : ""}</small></button>`).join("")}</div><footer><button class="btn btn-secondary" value="cancel">Cancelar</button></footer></form>`;
      document.body.append(d);
      let chosen = null;
      d.addEventListener("click", (event) => { const b = event.target.closest("[data-pick]"); if (b) { chosen = b.dataset.pick; d.close(); } });
      d.addEventListener("close", () => { d.remove(); resolve(chosen && chosen !== currentId ? chosen : null); });
      d.showModal();
    });
  }
  async function changeNeedCompany(needId) {
    const need = state.needs.find((n) => n.id === needId);
    const chosen = await pickCompany("Empresa (CNPJ) desta compra", need?.billing_company_id);
    if (!chosen) return;
    try {
      await window.AcervoComprasAPI.setPurchaseRequestsBillingCompany([needId], chosen);
      notify("Empresa da compra atualizada.");
      await reloadAll();
    } catch (e) { notify(e.message || "Não foi possível trocar a empresa.", "error"); }
  }
  async function changeOrderCompany() {
    const o = state.currentOrderDetail;
    if (!o) return;
    const chosen = await pickCompany("Faturar este pedido de compra para", o.billing_company_id);
    if (!chosen) return;
    try {
      await window.AcervoComprasAPI.setPurchaseOrderBillingCompany(o.id, chosen);
      state.currentOrderDetail = await window.AcervoComprasAPI.getPurchaseOrderV2Detail(o.id);
      renderOrderDetail();
      lucide.createIcons();
      notify("Empresa do pedido de compra atualizada.");
    } catch (e) { notify(e.message || "Não foi possível trocar a empresa.", "error"); }
  }
  document.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-need-company]");
    if (chip) { event.stopPropagation(); changeNeedCompany(chip.dataset.needCompany); return; }
    if (event.target.closest("[data-order-company]")) changeOrderCompany();
  }, true);

})();
