// Ponte do Almoxarifado novo (16/11/2026) com o que já existia aqui:
//  - aba Recebimento: o recebimento de mercadorias do Acervo (almox-recebimento.js: pedido de Compras -> nota/XML ->
//    conferência -> estoque -> Contas a Pagar), que já seguia o modelo da Tecnoweld;
//  - aba Solicitações de compra: o Almoxarifado acompanha o que a compra automática (estoque mínimo -> ideal) mandou para Compras;
//  - aba Pedidos a separar: materiais das ordens de produção (Produção > Ordens), por pedido.
// Define as funções que esses módulos esperam da página (almoxBanco, empresaAlmox, produtosDashboard...).
(function () {
  "use strict";
  window.escAlmox = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  window.numeroAlmox = (v) => {
    if (typeof v === "number") return v;
    const s = String(v ?? "").replace(/[^\d,.-]/g, "").trim(); if (!s) return 0;
    const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s); return Number.isFinite(n) ? n : 0;
  };
  window.formatarNumero = (v) => Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  window.formatarMoedaBR = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  window.almoxBanco = async () => { await window.aguardarContexto?.(); await window.AlmoxDemo?.ready; return window.TecnoweldAPI.getClient(); };
  window.empresaAlmox = () => window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
  window.produtosDashboard = [];
  async function atualizarMateriais() {
    try {
      const lista = await window.TecnoweldAPI.listWarehouseMaterials();
      window.produtosDashboard = (lista || []).map((m) => ({ ID: m.id, Codigo: m.codigo, Produto: m.nome, Unidade: m.unidade,
        Status: m.status === "inativo" ? "Inativo" : "Ativo", EstoqueAtual: m.quantidade_disponivel, ValorCusto: m.valor_unitario }));
    } catch (e) { console.warn("Materiais não carregaram:", e); }
  }
  // Depois de receber mercadoria, o estoque mudou: recarrega o painel.
  window.carregarDashboard = () => { window.TecnoweldAPI?.clearCache?.(); document.dispatchEvent(new CustomEvent("almox:recarregar")); };

  const RECEBIMENTO_HTML = `
    <div class="receb-aviso" id="recebAviso" hidden></div>
    <div id="recebListaView">
      <nav class="receb-lista-tabs" aria-label="Situação dos pedidos">
        <button type="button" class="active" data-receb-lista="pedidos" aria-pressed="true">A receber <b id="recebPendentesCount">0</b></button>
        <button type="button" data-receb-lista="recebimentos" aria-pressed="false">Recebidos <b id="recebConcluidosCount">0</b></button>
      </nav>
      <section class="acv-card" id="recebPedidosSection">
        <div class="almox-table-wrap"><table class="acv-table receb-pedidos-table">
          <thead><tr><th>Fornecedor</th><th>Pedido</th><th>Comprador</th><th>Materiais / quantidade</th><th>Prazo</th><th>Nota fiscal</th><th>Valor</th><th>Situação</th></tr></thead>
          <tbody id="tbodyRecebPedidos"><tr><td colspan="8" class="hist-vazio">Carregando…</td></tr></tbody></table></div>
      </section>
      <section class="acv-card" id="recebRegistrosSection" hidden>
        <div class="almox-table-wrap"><table class="acv-table receb-pedidos-table is-recebidos">
          <thead><tr><th>Fornecedor</th><th>Pedido</th><th>Comprador</th><th>Materiais / quantidade</th><th>Prazo</th><th>Nota fiscal</th><th>Valor</th><th>Situação</th><th>Recebido em</th></tr></thead>
          <tbody id="tbodyRecebLista"></tbody></table></div>
      </section>
    </div>
    <div id="recebFluxoView" class="receb-fluxo" hidden></div>`;

  const COMPRAS_HTML = `
    <section class="acv-card">
      <p class="acv-aviso" id="comprasAviso" hidden></p>
      <div class="almox-table-wrap"><table class="acv-table">
        <thead><tr><th>Nº</th><th>Data</th><th>Código</th><th>Material</th><th class="col-qtd">Estoque</th><th class="col-qtd">Mínimo</th><th class="col-qtd">Ideal</th><th class="col-qtd">Comprar</th><th>Situação em Compras</th><th></th></tr></thead>
        <tbody id="tbodyCompras"></tbody></table></div>
    </section>`;

  // ---------- Solicitações de compra (só acompanha; cancelar com motivo enquanto Compras não cotou) ----------
  let solicitacoes = [], automatica = null;
  const FASE = { aguardando: "warning", andamento: "info", concluida: "success", cancelada: "neutral" };
  async function carregarSolicitacoes() {
    try {
      const c = await almoxBanco(), e = empresaAlmox();
      const [lista, cfg] = await Promise.all([c.rpc("almox_solicitacoes_lista", { p_empresa: e }), c.rpc("almox_compra_config", { p_empresa: e })]);
      if (lista.error) throw lista.error;
      solicitacoes = Array.isArray(lista.data) ? lista.data : [];
      automatica = cfg.error ? null : Boolean(cfg.data?.automatica);
      window.__almoxEditaFinanceiro = cfg.error ? false : Boolean(cfg.data?.edita_financeiro);
      renderSolicitacoes();
    } catch (err) { console.warn("Solicitações de compra não carregaram:", err); }
  }
  function renderSolicitacoes() {
    const andamento = solicitacoes.filter((x) => x.fase === "aguardando" || x.fase === "andamento");
    const badge = document.getElementById("purchasesBadge");
    if (badge) { badge.textContent = String(andamento.length); badge.hidden = !andamento.length; }
    const aviso = document.getElementById("comprasAviso");
    if (aviso) { aviso.hidden = automatica !== false; aviso.innerHTML = "A compra automática está <strong>desligada</strong>. Para ligar: Gestão › Parâmetros › Almoxarifado."; }
    const tb = document.getElementById("tbodyCompras"); if (!tb) return;
    const lista = solicitacoes;
    const n = (v) => formatarNumero(Number(v || 0));
    tb.innerHTML = lista.length ? lista.map((x) => `<tr>
      <td>${x.numero}</td><td>${window.AlmoxDetails.text(new Date(x.criado_em).toLocaleDateString("pt-BR"),new Date(x.criado_em).toLocaleString("pt-BR"))}</td>
      <td><span class="material-code">${escAlmox(x.codigo || "-")}</span></td>
      <td>${window.AlmoxDetails.text(x.produto||'-',[x.produto,x.origem==='automatica'?'Autom\u00e1tica':x.origem].filter(Boolean).join('\n'))}</td>
      <td class="col-qtd">${n(x.estoque_no_pedido)}</td><td class="col-qtd">${n(x.estoque_minimo)}</td><td class="col-qtd">${n(x.estoque_ideal)}</td>
      <td class="col-qtd"><strong>${n(x.quantidade)} ${escAlmox(x.unidade || "")}</strong></td>
      <td><span class="status-badge ${FASE[x.fase] || "neutral"}">${window.AlmoxDetails.text(x.rotulo||'-',[x.rotulo,x.fase==='cancelada'&&x.observacao?'Motivo: '+x.observacao:x.fase==='aguardando'?'Compras ainda n\u00e3o cotou':''].filter(Boolean).join('\n'))}</span></td>
      <td>${x.pode_cancelar ? `<button type="button" class="btn btn-secondary" data-acv-cancelar="${escAlmox(x.id)}">Cancelar</button>` : ""}</td></tr>`).join("")
      : `<tr><td colspan="10" class="empty-state">Nenhuma solicita\u00e7\u00e3o.</td></tr>`;
    const headings=[...tb.closest('table').tHead.rows[0].cells].map(th=>th.textContent.trim());
    [...tb.rows].forEach(row=>[...row.cells].forEach((td,index)=>td.dataset.colLabel=headings[index]));
  }
  async function cancelar(id) {
    const x = solicitacoes.find((s) => String(s.id) === String(id)); if (!x) return;
    const motivo = (window.prompt(`Motivo do cancelamento da solicitação nº ${x.numero} (${x.produto}):`) || "").trim();
    if (!motivo) return;
    if (motivo.length < 3) { window.TecnoAlert?.warning?.("Escreva o motivo do cancelamento."); return; }
    const c = await almoxBanco();
    const { error } = await c.rpc("almox_solicitacao_cancelar", { p_empresa: empresaAlmox(), p_id: x.id, p_motivo: motivo });
    if (error) window.TecnoAlert?.error?.(error.message); else window.TecnoAlert?.success?.("Solicitação cancelada.");
    carregarSolicitacoes();
  }

  // ---------- montagem das abas ----------
  function montar() {
    const rec = document.getElementById("receivingTab");
    if (rec && !rec.dataset.montado) { rec.innerHTML = `<div id="tab-recebimento">${RECEBIMENTO_HTML}</div>`; rec.dataset.montado = "1"; }
    const com = document.getElementById("purchasesTab");
    if (com && !com.dataset.montado) { com.innerHTML = COMPRAS_HTML; com.dataset.montado = "1"; }
  }
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-acv-cancelar]"); if (b) cancelar(b.dataset.acvCancelar); });

  window.AlmoxAcervo = {
    async abrirRecebimento(aba='pedidos') { montar(); window.AlmoxRecebimento?.abrirAba?.(aba); await atualizarMateriais(); },
    abrirSolicitacoes() { montar(); carregarSolicitacoes(); },
    abrirSeparacao() { window.AlmoxMateriaisProducao?.abrirAba?.(); },
    atualizarMateriais,
  };
  document.addEventListener("DOMContentLoaded", async () => {
    montar();
    await window.aguardarContexto?.();
    atualizarMateriais(); carregarSolicitacoes();
    window.AlmoxRecebimento?.carregar?.();
  });
})();
