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
    currentOrderDetail: null, orderDetailDirty: false,
    pendingCertBatch: null, pendingInvoiceOrder: null,
  };

  const URGENCY_LABEL = { atrasado: "Atrasada", critico: "Crítica", atencao: "Atenção", normal: "No prazo", sem_data: "Sem data" };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bind();
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
    $("certSubmit").onclick = submitCertificate;
    $("orderDetailPdfBtn").onclick = downloadOrderPdf;
    $("orderDirectDeliveryBtn").onclick = confirmDirectDelivery;
    $("orderDetailSaveBtn").onclick = saveOrderDetailChanges;
    $("orderDetailBody").addEventListener("input", (e) => { if (e.target.matches("[data-lot-input]")) markOrderDetailDirty(); });
    $("orderDetailDialog").querySelectorAll('button[value="cancel"]').forEach((btn) => btn.addEventListener("click", (e) => {
      if (state.orderDetailDirty) { e.preventDefault(); guardCloseOrderDetail(); }
    }));
    $("orderDetailDialog").addEventListener("cancel", (e) => {
      if (state.orderDetailDirty) { e.preventDefault(); guardCloseOrderDetail(); }
    });
    $("newManualNeedBtn").onclick = () => {
      ["manualNeedPedido", "manualNeedDescricao", "manualNeedQuantidade", "manualNeedData", "manualNeedObservacao", "manualNeedLink"].forEach((id) => ($(id).value = ""));
      $("manualNeedUnidade").value = "un";
      $("manualNeedDialog").showModal();
    };
    $("manualNeedSubmit").onclick = submitManualNeed;
    $("comprasSearch").addEventListener("input", () => { renderNeeds(); renderQuotations(); renderOrders(); });
    $("ordersStatusFilter").addEventListener("change", renderOrders);
    $("orderCancelBtn").onclick = cancelCurrentOrder;
    $("quoteSupplierSearch").addEventListener("input", renderSupplierOptions);
    $("quoteSupplierSearch").addEventListener("focus", renderSupplierOptions);
    document.addEventListener("click", (e) => { if (!e.target.closest(".pv-supplier-search")) $("quoteSupplierOptions").classList.add("hidden"); });
    let resizeTimer;
    window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(fitAllocChips, 120); });
  }

  async function submitManualNeed() {
    const descricao = $("manualNeedDescricao").value.trim();
    const quantidade = Number($("manualNeedQuantidade").value);
    if (!descricao) return notify("Descreva o material.", "error");
    if (!quantidade || quantidade <= 0) return notify("Informe a quantidade.", "error");
    if (quantidade > 10000) {
      const ok = window.AcervoComprasAlert?.confirm
        ? await window.AcervoComprasAlert.confirm({ title: "Quantidade fora do normal", message: `Confirma a solicitação de ${quantidade.toLocaleString("pt-BR")} unidade(s) de "${descricao}"?`, confirmText: "Confirmar quantidade", cancelText: "Corrigir" })
        : window.confirm(`Confirma a solicitação de ${quantidade} unidade(s)?`);
      if (!ok) return;
    }
    const productLink = $("manualNeedLink").value.trim();
    if (productLink) {
      try { if (!['https:', 'http:'].includes(new URL(productLink).protocol)) throw new Error(); }
      catch { return notify('Informe um link válido começando com https:// ou http://.', 'error'); }
    }
    try {
      await window.AcervoComprasAPI.createPurchaseRequest({
        origem: $("manualNeedOrigem").value, order_number: $("manualNeedPedido").value.trim(), descricao_item: descricao, quantidade, unidade: $("manualNeedUnidade").value.trim() || "un",
        data_necessidade: $("manualNeedData").value || null, observacao: $("manualNeedObservacao").value.trim() || null,
        prioridade: "media",
        produto_url: productLink || null,
      });
      $("manualNeedDialog").close();
      await reloadAll();
      notify("Necessidade registrada. Vincule o item para enviar à aprovação financeira.");
    } catch (e) { notify(e.message || "Não foi possível registrar a necessidade.", "error"); }
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
    $("needsServicosBadge").textContent = servicos.length;
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
    const bought = new Set(["comprada", "aguardando_recebimento", "recebida_parcial"]);
    filteredNeeds().forEach((n) => {
      if (bought.has(n.status)) return;
      if (n.origem === "manutencao") servicos.push(n);
      else (["solicitacao", "estoque_minimo"].includes(n.origem) ? avulsa : op).push(n);
    });
    return { op, avulsa, servicos };
  }

  function needRowState(n) {
    const awaitingLink = !n.material_id;
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
        <td>${orders.length ? orders.map((o) => `<span class="pv-origin-tag is-op">OP ${esc(o)}</span>`).join(" ") : '<span class="subtext">Estoque mínimo de ferramenta</span>'}</td>
        <td>${esc(fromProgrammer ? (n.tool_details?.maquina || "Programação CNC") : "Ferramental")}</td>
        ${needDateCell(n)}
        ${needStatusCell(false, n.status, pcpTag)}
        ${needAttachmentsCell(n)}
      </tr>`;
    }
    return `<tr ${needRowAttrs(n, pendingApproval, selected)}>
        ${needQtyCell(n)}
        <td><strong>${esc(n.material_nome)}</strong>${companyChip(n)}${n.entrega_direta_endereco ? `<small class="pv-direct-delivery" title="${esc(n.entrega_direta_endereco)}"><i data-lucide="truck"></i> Entregar direto no terceirizado: ${esc(n.entrega_direta_endereco)}</small>` : ""}</td>
        <td>${n.order_number ? `<span class="pv-origin-tag is-op">OP ${esc(n.order_number)}</span>` : '<span class="subtext">—</span>'}</td>
        <td>${esc(n.etapa_nome || n.setor_nome || "—")}</td>
        ${needDateCell(n)}
        ${needStatusCell(false, n.status, pcpTag)}
        ${needAttachmentsCell(n)}
      </tr>`;
  }

  function avulsaNeedRowHtml(n) {
    const { awaitingLink, pendingApproval, internalRequest, selected, pcpTag } = needRowState(n);
    const isTool = n.origem === "ferramental";
    const fromProgrammer = isTool && n.tool_details?.fonte === "programador_cnc";
    const linkIcon = !n.material_id
      ? `<button type="button" class="pv-link-material-icon" data-link-material="${esc(n.id)}" title="Vincular item cadastrado" aria-label="Vincular item cadastrado"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/></svg></button>`
      : "";
    const programmerValue = n.valor_estimado != null && n.valor_estimado !== "" ? `${Number(n.valor_estimado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/un` : "";
    const toolSubtitle = fromProgrammer
      ? `<small>${esc([n.order_number ? `OP ${n.order_number}` : "", n.tool_details?.maquina, n.tool_details?.motivo, programmerValue, n.fornecedor_nome ? `Fornecedor sugerido: ${n.fornecedor_nome}` : ""].filter(Boolean).join(" · "))}</small>`
      : isTool
      ? `<small>${esc(n.tool_details?.compra_em_risco ? 'Compra em risco' : 'Capacidade/vida útil')} · Comprar até ${fmtDate(n.tool_details?.compra_recomendada_ate)} · <a href="../Almoxarifado/Principal/almoxarifado.html" data-tool-link>Ver detalhes</a></small>`
      : "";
    const isMinimum = n.origem === "estoque_minimo";
    const isService = n.origem === "manutencao";
    const originTag = isService ? '<span class="pv-origin-tag is-tool">Manutenção</span>' : fromProgrammer ? '<span class="pv-origin-tag is-tool">Programador CNC</span>' : isTool ? '<span class="pv-origin-tag is-tool">Ferramental</span>' : isMinimum ? '<span class="pv-origin-tag is-tool">Estoque mínimo</span>' : '<span class="pv-origin-tag is-internal">Solicitação interna</span>';
    return `<tr ${needRowAttrs(n, pendingApproval, selected)}>
        ${needQtyCell(n)}
        <td>${linkIcon}<strong>${esc(n.material_nome)}</strong>${toolSubtitle}${companyChip(n)}</td>
        <td>${originTag}</td>
        <td>${fromProgrammer ? esc(n.solicitante_nome || "Programador CNC") : isTool ? '<span class="subtext">—</span>' : isMinimum ? '<span class="subtext">Automático</span>' : esc(n.solicitante_nome || 'Solicitante não informado')}</td>
        ${needDateCell(n)}
        ${needStatusCell(awaitingLink, n.status, pcpTag)}
        ${needAttachmentsCell(n)}
      </tr>`;
  }

  function renderNeeds() {
    const { op, avulsa, servicos } = splitNeeds();
    $("needsServicosEmpty").classList.toggle("hidden", servicos.length > 0);
    $("needsServicosBody").innerHTML = servicos.map(avulsaNeedRowHtml).join("");
    $("needsOpEmpty").classList.toggle("hidden", op.length > 0);
    $("needsOpBody").innerHTML = op.map(opNeedRowHtml).join("");
    $("needsAvulsaEmpty").classList.toggle("hidden", avulsa.length > 0);
    $("needsAvulsaBody").innerHTML = avulsa.map(avulsaNeedRowHtml).join("");

    [$("needsOpBody"), $("needsAvulsaBody"), $("needsServicosBody")].forEach((body) => {
      body.querySelectorAll('[data-link-material]').forEach(b=>b.onclick=e=>{e.stopPropagation();linkInternalMaterial(b.dataset.linkMaterial);});
      body.querySelectorAll("tr.pv-row-clickable").forEach(tr=>{
        const toggle=()=>{
          const id=tr.dataset.needId;
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

  async function linkInternalMaterial(id) {
    const need=state.needs.find(n=>n.id===id);if(!need)return;
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
      const candidates = (await window.AcervoComprasAPI.findConsolidatableNeeds(needId, 30) || []).filter((c) => !state.selectedNeedIds.has(c.id));
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
      if (!groups.has(key)) groups.set(key, { tool: Boolean(n.tool_type_id) || n.origem === "manutencao", material_id: n.material_id || null, codigo: n.material_codigo || "", nome: n.material_nome, especificacao: n.especificacao || "", unidade: n.unidade || "un", needs: [] });
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
        <div class="pv-quote-item-row ${g.material_id || g.tool ? "" : "is-risk"}">
          <div class="pv-quote-item-name"><strong>${esc(g.nome)}</strong>${g.codigo ? `<small>${esc(g.codigo)}</small>` : ""}</div>
          <details class="pv-quote-item-needs"><summary>${g.needs.length} OP${g.needs.length > 1 ? "s" : ""}</summary>
            <ul>${g.needs.map((n) => `<li>${esc(n.order_number || "geral")} — ${Number(n.quantidade_faltante || 0).toLocaleString("pt-BR")} ${esc(n.unidade || "")} ${n.data_necessidade ? `· ${fmtDate(n.data_necessidade)}` : ""}</li>`).join("")}</ul>
          </details>
          <input type="number" class="pv-quote-item-qty" min="0.01" step="0.01" data-group-qty="${idx}" value="${g.quantidade_cotada}">
          <input type="text" class="pv-quote-item-unit" value="${esc(g.unidade)}" disabled>
          ${g.material_id || g.tool ? "" : `<p class="pv-quote-item-warning"><i data-lucide="alert-triangle"></i> Sem material cadastrado no Almoxarifado — não será possível gerar o pedido até cadastrá-lo (necessário para lote/certificado).</p>`}
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
  function renderQuotations() {
    const rows = state.quotations.filter((q) => q.status !== "encerrada" && q.status !== "cancelada" && matchesSearch(`SC-${String(q.numero).padStart(6, "0")}`, q.numero));
    $("quotationsEmpty").classList.toggle("hidden", rows.length > 0);
    $("quotationsBody").innerHTML = rows.map((q) => `
      <tr>
        <td><strong>SC-${esc(String(q.numero).padStart(6, "0"))}</strong><small>Criada em ${fmtDate(q.created_at)}</small></td>
        <td>${q.itens_count}</td>
        <td>${q.fornecedores_count}</td>
        <td>${progressHtml(Number(q.respostas_count), Number(q.fornecedores_count), `${q.respostas_count} de ${q.fornecedores_count} fornecedores`)}<small>${Math.max(0, Number(q.fornecedores_count) - Number(q.respostas_count))} sem resposta</small></td>
        <td><span class="pv-status-pill is-${q.status}">${quotationStatusLabel(q.status)}</span></td>
        <td>${deadlineHtml(q.prazo_desejado)}</td>
        <td class="pv-row-actions">
          <button class="btn btn-secondary pv-btn-sm" type="button" data-open-quotation="${esc(q.id)}">Abrir</button>
          <button class="icon-btn" type="button" data-reprint-quotation="${esc(q.id)}" title="Gerar 2ª via em PDF"><i data-lucide="file-down"></i></button>
          <button class="btn btn-secondary pv-btn-sm" type="button" data-cancel-quotation="${esc(q.id)}" title="Encerrar sem gerar pedido">Encerrar</button>
        </td>
      </tr>`).join("");
    $("quotationsBody").querySelectorAll("[data-open-quotation]").forEach((btn) => btn.addEventListener("click", () => openProposals(btn.dataset.openQuotation)));
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
    $("proposalsTitle").textContent = `Solicitação SC-${String(data.numero).padStart(6, "0")}`;
    $("proposalsMetaBar").innerHTML = `
      <span>Prazo solicitado: <b>${fmtDate(data.prazo_desejado)}</b></span>
      <span>Itens: <b>${data.items.length}</b></span>
      <span>Fornecedores convidados: <b>${data.suppliers.length}</b></span>
    `;
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
      <button type="button" class="pv-supplier-tab ${s.status === "respondido" ? "is-answered" : ""} ${s.supplier_id === state.activeSupplierId ? "active" : ""}" data-select-supplier="${esc(s.supplier_id)}">
        <strong>${esc(s.nome)}</strong>
        <small>${s.status === "respondido" ? "Proposta recebida" : "Aguardando proposta"}</small>
      </button>`).join("");
    $("proposalsSupplierTabs").querySelectorAll("[data-select-supplier]").forEach((btn) => btn.addEventListener("click", () => {
      state.pendingAiDocument = null;
      state.lastAiResult = null;
      selectSupplier(btn.dataset.selectSupplier);
    }));
  }

  function selectSupplier(supplierId) {
    state.activeSupplierId = supplierId;
    document.querySelectorAll("#proposalsSupplierTabs .pv-supplier-tab").forEach((b) => b.classList.toggle("active", b.dataset.selectSupplier === supplierId));
    const supplier = state.currentWorkspace.suppliers.find((s) => s.supplier_id === supplierId);
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
    pill.textContent = atende ? "Atende o operação" : "Não atende o operação";
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
                <strong>${esc(r.fornecedor_nome)}</strong>
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
  function pctPillHtml(pct) {
    if (pct === null || pct === undefined) return `<span class="pv-cell-na">Não exigido</span>`;
    // (2026-10-10) matéria-prima sem certificado: pisca para chamar atenção até completar
    if (Number(pct) < 100) return `<span class="pv-cert-missing" title="Há matéria-prima neste pedido sem certificado">${progressHtml(Number(pct), 100, `${Number(pct)}% completo`)}</span>`;
    return progressHtml(Number(pct), 100, `${Number(pct)}% completo`);
  }

  function opNumbersChipsHtml(numeros) {
    if (!numeros.length) return `<span class="pv-cell-na">—</span>`;
    const chips = numeros.map((n) => `<span class="pv-alloc-chip">${esc(n)}</span>`).join("");
    return `<div class="pv-alloc-chips" data-fit-chips>${chips}<button type="button" class="pv-alloc-more hidden" data-alloc-toggle>+0</button></div>`;
  }

  function filteredOrders() {
    const mode = $("ordersStatusFilter")?.value || "abertos";
    return state.orders.filter((o) => {
      if (mode === "abertos" && ["recebido", "cancelado"].includes(o.status)) return false;
      if (mode === "recebidos" && o.status !== "recebido") return false;
      if (mode === "cancelados" && o.status !== "cancelado") return false;
      return matchesSearch(`PC-${String(o.numero).padStart(6, "0")}`, o.numero, o.fornecedor_nome, ...(o.op_numeros || []));
    });
  }

  function renderOrders() {
    const orders = filteredOrders();
    $("ordersEmpty").classList.toggle("hidden", orders.length > 0);
    $("ordersEmpty").textContent = state.orders.length ? "Nenhum pedido nesta situação ou busca. Troque o filtro para ver os demais." : "Nenhum pedido de compra emitido ainda.";
    $("ordersBody").innerHTML = orders.map((o) => `
      <tr class="pv-row-clickable" data-order-id="${esc(o.id)}">
        <td><strong>PC-${esc(String(o.numero).padStart(6, "0"))}</strong><small>Emitido em ${fmtDate(o.created_at)}</small></td>
        <td><strong>${esc(o.fornecedor_nome)}</strong></td>
        <td>${o.itens_count}</td>
        <td>${money(o.valor_total)}</td>
        <td>${deadlineHtml(o.prazo_acordado, ['recebido', 'cancelado'].includes(o.status))}</td>
        <td><span class="pv-status-pill is-${esc(o.status)}">${esc(orderStatusLabel(o.status))}</span>${o.pendencia_documental ? '<small class="pv-text-danger">Documentação pendente</small>' : ''}</td>
        <td>${pctPillHtml(o.certificado_pct)}</td>
        <td>${opNumbersChipsHtml(o.op_numeros || [])}</td>
      </tr>`).join("");
    $("ordersBody").querySelectorAll("tr.pv-row-clickable").forEach((tr) => tr.addEventListener("click", () => openOrderDetail(tr.dataset.orderId)));
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
    try {
      const data = await window.AcervoComprasAPI.getPurchaseOrderV2Detail(id);
      state.currentOrderDetail = data;
      state.orderDetailDirty = false;
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
    // (2026-10-02) Compras nao informa mais lote: a documentacao do item e so o certificado (quando exigido)
    const loteOk = (o.items || []).filter((it) => it.requer_certificado).every((it) => (it.lotes || []).some((b) => b.certificado_url));
    return { xmlOk, loteOk };
  }

  function allocationChipsHtml(necessidades, unidade, expanded = false) {
    if (!necessidades.length) return `<span class="pv-cell-na">—</span>`;
    const chips = necessidades.map((n) => `<span class="pv-alloc-chip">${esc(n.order_number ? "Pedido/OS " + n.order_number : "Solicitação interna")} · ${Number(n.quantidade_alocada).toLocaleString("pt-BR")} ${esc(unidade)}</span>`).join("");
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

  function lotCellHtml(it) {
    if (!it.requer_lote) return `<span class="pv-cell-na">—</span>`;
    const lotes = it.lotes || [];
    if (!lotes.length) return `<input type="text" class="pv-lot-input" placeholder="Informar lote" data-lot-input data-item-id="${esc(it.id)}">`;
    return `<div class="pv-lot-chips">${lotes.map((b) => `<span class="pv-lot-chip">${esc(b.lote)}</span>`).join("")}</div>`;
  }

  function certCellHtml(it) {
    if (!it.requer_certificado) return `<span class="pv-cell-na">—</span>`;
    const lotes = it.lotes || [];
    if (!lotes.length) return `<button type="button" class="pv-cert-chip" data-attach-cert-new="${esc(it.id)}"><i data-lucide="plus"></i> Adicionar certificado</button>`;
    return `<div class="pv-cert-cell">${lotes.map((b) => b.certificado_url
      ? `<a class="pv-cert-chip is-ok" href="${esc(b.certificado_url)}" target="_blank" rel="noopener"><i data-lucide="check"></i> Certificado anexado</a>`
      : `<button type="button" class="pv-cert-chip" data-attach-cert="${esc(b.id)}" data-cert-name="${esc(it.nome || "")}"><i data-lucide="plus"></i> Adicionar certificado</button>`).join("")}</div>`;
  }

  function renderOrderDetail() {
    const o = state.currentOrderDetail;
    const pendingLotValues = {};
    document.querySelectorAll("#orderDetailBody [data-lot-input]").forEach((input) => { if (input.value.trim()) pendingLotValues[input.dataset.itemId] = input.value; });
    const { xmlOk, loteOk } = orderDocStatus(o);
    $("orderDetailBody").innerHTML = `
      <div class="pv-order-meta">
        <span><small>Fornecedor</small><strong>${esc(o.fornecedor?.nome || "—")}</strong></span>
        <span><small>Status</small><strong>${orderStatusLabel(o.status)}</strong></span>
        <span><small>Comprador</small><strong>${esc(o.comprador_nome || "—")}</strong></span>
        <span><small>Valor total</small><strong>${money(o.valor_total)}</strong></span>
        <span><small>Prazo acordado</small><strong>${fmtDate(o.prazo_acordado)}</strong></span>
        <span><small>Faturar para</small><strong><button type="button" class="pv-company-chip" data-order-company title="Trocar a empresa (CNPJ) deste pedido"><i data-lucide="building-2"></i>${esc(o.billing_company ? [o.billing_company.rotulo, o.billing_company.cnpj].filter(Boolean).join(" · ") : "Empresa principal")}</button></strong></span>
        <span><small>XML</small><span class="pv-status-pill ${xmlOk ? "is-ok" : "is-pending"}">${xmlOk ? "Anexado" : "Pendente"}</span></span>
        <span><small>Certificado</small><span class="pv-status-pill ${loteOk ? "is-ok" : "is-pending"}">${loteOk ? "Completo" : "Pendente"}</span></span>
      </div>
      ${o.billing_company_conflito ? `<p class="pv-company-warning"><i data-lucide="triangle-alert"></i> Este pedido junta itens de pedidos de empresas diferentes. Confira e escolha em "Faturar para" o CNPJ do pedido (ou separe em pedidos).</p>` : ""}
      <div class="pv-order-actions">
        ${(o.items || []).some(i=>Number(i.quantidade_recebida)>0) ? `<button class="btn btn-secondary pv-btn-sm" type="button" id="registerRncBtn">Registrar divergência</button>` : ""}<a class="btn btn-secondary pv-btn-sm" href="../Almoxarifado/Principal/almoxarifado.html">Recebimento no Almoxarifado</a><button class="btn btn-secondary pv-btn-sm" type="button" id="attachInvoiceBtn"><i data-lucide="file-plus"></i> Anexar XML da NF-e</button>
      </div>
      ${o.parcelas ? `<p class="pv-payment-confirmed"><i data-lucide="check-circle-2"></i> Pagamento confirmado — ${esc(paymentMethodLabel(o.forma_pagamento))}, ${o.parcelas.length} parcela(s) enviada(s) ao Contas a Pagar.</p>` : ""}
      <div class="pv-order-table-wrap">
        <table class="pv-table pv-order-table">
          <thead><tr><th>Material</th><th>Comprado</th><th>Recebido</th><th>Saldo</th><th>Alocado para</th><th>Certificado</th></tr></thead>
          <tbody>
            ${(o.items || []).map((it) => `
            <tr data-item-id="${esc(it.id)}">
              <td><strong>${esc(it.nome)}</strong></td>
              <td>${Number(it.quantidade).toLocaleString("pt-BR")} ${esc(it.unidade)}</td>
              <td>${Number(it.quantidade_recebida || 0).toLocaleString("pt-BR")} ${esc(it.unidade)}</td>
              <td>${orderSaldo(it).toLocaleString("pt-BR")} ${esc(it.unidade)}</td>
              <td>${allocationChipsHtml(it.necessidades || [], it.unidade, true)}</td>
              <td>${certCellHtml(it)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
      ${(o.historico || []).length ? `<details class="pv-order-history"${(o.historico || []).some((h) => h.acao === "alterado_recebimento") ? " open" : ""}><summary>Histórico do pedido (${o.historico.length})</summary><ul>${o.historico.map((h) => `<li><time>${new Date(h.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time><strong>${esc(h.acao === "alterado_recebimento" ? "Alterado no recebimento" : String(h.acao || "").replaceAll("_", " "))}</strong><span>${esc(h.observacao || "")}${h.usuario_nome ? ` · ${esc(h.usuario_nome)}` : ""}</span></li>`).join("")}</ul></details>` : ""}
    `;
    Object.entries(pendingLotValues).forEach(([itemId, value]) => {
      const input = document.querySelector(`#orderDetailBody [data-lot-input][data-item-id="${CSS.escape(itemId)}"]`);
      if (input) input.value = value;
    });
    $("attachInvoiceBtn").addEventListener("click", () => { state.pendingInvoiceOrder = o.id; $("invoiceDialog").showModal(); });
    $("registerRncBtn")?.addEventListener("click",async()=>{await window.AcervoComprasAPI.openOrderRnc(o);await openOrderDetail(o.id);await reloadAll();});
    $("orderDetailBody").querySelectorAll("[data-attach-cert]").forEach((btn) => btn.addEventListener("click", () => { state.pendingCertBatch = btn.dataset.attachCert; openCertDialog(btn.dataset.certName); }));
    // certificado sem lote: cria o registro do certificado do item (identificado pelo pedido) e ja abre o envio do arquivo
    $("orderDetailBody").querySelectorAll("[data-attach-cert-new]").forEach((btn) => btn.addEventListener("click", async () => {
      const it = (o.items || []).find((i) => i.id === btn.dataset.attachCertNew);
      if (!it || btn.disabled) return;
      btn.disabled = true;
      try {
        const res = await window.AcervoComprasAPI.savePurchaseLot({ order_item_id: it.id, lote: `PC ${o.numero || o.codigo || ""}`.trim(), quantidade: Number(it.quantidade || 0), validade: null });
        if (!res?.id) throw new Error("Não foi possível preparar o certificado.");
        state.pendingCertBatch = res.id;
        openCertDialog(it.nome);
      } catch (e) { notify(e.message || "Não foi possível preparar o certificado.", "error"); }
      finally { btn.disabled = false; }
    }));
    bindAllocChipsToggle($("orderDetailBody"));
    fitAllocChips();
    updateOrderFooterSummary();
    lucide.createIcons();
  }

  function updateOrderFooterSummary() {
    const o = state.currentOrderDetail;
    const { xmlOk, loteOk } = orderDocStatus(o);
    $("orderDetailFooterTotal").textContent = money(o.valor_total);
    const complete = xmlOk && loteOk;
    const pill = $("orderDetailFooterStatus");
    pill.textContent = complete ? "Documentação completa" : "Aguardando documentação";
    pill.className = `pv-status-pill ${complete ? "is-ok" : "is-pending"}`;
  }

  function markOrderDetailDirty() {
    state.orderDetailDirty = true;
    $("orderDetailSaveBtn").disabled = false;
  }

  async function saveOrderDetailChanges() {
    const pending = [...document.querySelectorAll("#orderDetailBody [data-lot-input]")].filter((input) => input.value.trim());
    if (!pending.length) return;
    try {
      for (const input of pending) {
        const it = (state.currentOrderDetail.items || []).find((i) => i.id === input.dataset.itemId);
        const lotQty = it ? (orderSaldo(it) || Number(it.quantidade || 0)) : 0;
        await window.AcervoComprasAPI.savePurchaseLot({ order_item_id: input.dataset.itemId, lote: input.value.trim(), quantidade: lotQty, validade: null });
      }
      state.orderDetailDirty = false;
      $("orderDetailSaveBtn").disabled = true;
      await openOrderDetail(state.currentOrderDetail.id);
      await reloadAll();
      notify("Alterações salvas.");
    } catch (e) { notify(e.message || "Não foi possível salvar as alterações.", "error"); }
  }

  async function guardCloseOrderDetail() {
    if (!state.orderDetailDirty) { $("orderDetailDialog").close(); return; }
    const proceed = await window.AcervoComprasAlert.confirm({
      title: "Alterações não salvas", message: "Existem alterações não salvas. Deseja sair mesmo assim?",
      confirmText: "Sair sem salvar", cancelText: "Continuar editando",
    });
    if (proceed) { state.orderDetailDirty = false; $("orderDetailDialog").close(); }
  }

  // (2026-10-10) janela do certificado: arrastar e soltar + previa do PDF/imagem antes de anexar
  let certFileChosen = null, certPreviewUrl = null;
  function setCertFile(file) {
    if (certPreviewUrl) { URL.revokeObjectURL(certPreviewUrl); certPreviewUrl = null; }
    certFileChosen = file || null;
    $("certPreview").hidden = !file;
    $("certDrop").hidden = !!file;
    $("certSubmit").disabled = !file;
    if (!file) { $("certFrame").innerHTML = ""; return; }
    const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
    const isImg = /^image\//i.test(file.type);
    if (!isPdf && !isImg) { notify("Use um arquivo PDF, JPG ou PNG.", "error"); setCertFile(null); return; }
    certPreviewUrl = URL.createObjectURL(file);
    $("certName").textContent = file.name;
    $("certSize").textContent = `${isPdf ? "PDF" : "Imagem"} · ${file.size >= 1048576 ? (file.size / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB" : Math.max(1, Math.round(file.size / 1024)) + " KB"}`;
    $("certFrame").innerHTML = isPdf ? '<p class="cert-frame-msg">Carregando prévia…</p>' : `<img src="${certPreviewUrl}" alt="Prévia do certificado">`;
    if (isPdf) renderCertPdf(file);
  }
  // prévia do PDF desenhada com o pdf.js (funciona em qualquer navegador/tablet); se falhar, cai no visualizador do navegador
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      tag.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; resolve(window.pdfjsLib); };
      tag.onerror = reject;
      document.head.append(tag);
    });
  }
  async function renderCertPdf(file) {
    const frame = $("certFrame");
    try {
      const lib = await loadPdfJs();
      const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      if (certFileChosen !== file) return;
      const page = await doc.getPage(1);
      const width = Math.max(320, frame.clientWidth - 24);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (width / base.width) * (window.devicePixelRatio || 1) });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width; canvas.height = viewport.height;
      canvas.style.width = `${width}px`;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      if (certFileChosen !== file) return;
      frame.innerHTML = "";
      frame.append(canvas);
      if (doc.numPages > 1) frame.insertAdjacentHTML("beforeend", `<p class="cert-frame-msg">Página 1 de ${doc.numPages}</p>`);
    } catch (_) {
      if (certFileChosen === file) frame.innerHTML = `<iframe src="${certPreviewUrl}#toolbar=0&navpanes=0&view=FitH" title="Prévia do certificado"></iframe>`;
    }
  }
  function openCertDialog(materialName) {
    $("certFile").value = "";
    setCertFile(null);
    $("certFor").hidden = !materialName;
    $("certFor").innerHTML = materialName ? `Certificado de <b>${esc(materialName)}</b>` : "";
    if (!openCertDialog.ready) {
      openCertDialog.ready = true;
      const drop = $("certDrop");
      $("certFile").addEventListener("change", () => setCertFile($("certFile").files?.[0]));
      $("certChange").addEventListener("click", () => $("certFile").click());
      ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
      ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-over"); }));
      drop.addEventListener("drop", (e) => setCertFile(e.dataTransfer?.files?.[0]));
      $("certDialog").addEventListener("close", () => setCertFile(null));
    }
    $("certDialog").showModal();
    window.lucide?.createIcons?.();
  }

  async function submitCertificate() {
    const file = certFileChosen || $("certFile").files?.[0];
    if (!file) return notify("Selecione um arquivo.", "error");
    const btn = $("certSubmit");
    btn.disabled = true;
    try {
      await window.AcervoComprasAPI.attachBatchCertificate(state.pendingCertBatch, file);
      $("certDialog").close();
      await openOrderDetail(state.currentOrderDetail.id);
      await reloadAll();
      notify("Certificado anexado.");
    } catch (e) { btn.disabled = false; notify(e.message || "Não foi possível anexar o certificado.", "error"); }
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
      state.orderDetailDirty = false;
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
