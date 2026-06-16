(function () {
  "use strict";

  const TABLES = {
    materiais: "almoxarifado_materiais",
    movimentacoes: "almoxarifado_movimentacoes",
    ferramentas: "almoxarifado_ferramentas",
    solicitacoes: "almoxarifado_solicitacoes",
    compras: "almoxarifado_compras",
    itens: "itens",
    notas: "almoxarifado_notas",
    auditoria: "almoxarifado_auditoria",
    configuracoes: "almoxarifado_configuracoes"
  };

  const DEFAULT_SETORES = [
    "Marcenaria",
    "Solda",
    "Acabamento",
    "Tapeçaria",
    "Expedição",
    "Almoxarifado",
    "Escritório",
    "Manutenção",
    "Administrativo"
  ];

  const CATEGORIAS = {
    consumivel: ["Tinta", "Cola", "Verniz", "Filme Stretch", "Estopa", "Parafusos", "Lixas"],
    retornavel: ["Martelo", "Furadeira", "Escada", "Trena", "Parafusadeira"],
    epi: ["Luvas", "Óculos", "Protetores", "Capacetes"]
  };

  const state = {
    materiais: [],
    movimentacoes: [],
    ferramentas: [],
    solicitacoes: [],
    compras: [],
    notas: [],
    auditoria: [],
    config: {},
    unavailableTables: new Set(),
    pendingMovement: null,
    activeMaterial: null,
    activeImportMode: null,
    scannerStream: null,
    scannerTimer: null,
    initialized: false
  };

  const rootSelector = '[data-module="almoxarifado"]';
  const sb = () => window.supabaseClient || window.supabase;
  const empresaId = () => window.__CONTEXT?.empresa_id || window.empresa_id || null;

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function $$(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function formatCurrency(value) {
    return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }

  function formatDate(value) {
    if (!value) return "-";
    return new Date(value).toLocaleDateString("pt-BR");
  }

  function formatDateTime(value) {
    if (!value) return "-";
    return new Date(value).toLocaleString("pt-BR");
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function uuid() {
    return window.EasyLocQR?.generateValue?.()
      || window.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function isMissingTable(error) {
    const message = String(error?.message || "");
    return error?.code === "42P01" || message.includes("does not exist");
  }

  function notify(message, title = "Almoxarifado") {
    if (typeof window.mostrarAlerta === "function") {
      window.mostrarAlerta(message, title);
      return;
    }
    if (typeof window.alerta === "function") {
      window.alerta(message, title, "aviso");
      return;
    }
    alert(message);
  }

  async function queryTable(table, select = "*") {
    if (!sb() || state.unavailableTables.has(table)) return [];

    let query = sb().from(table).select(select);
    if (empresaId()) query = query.eq("empresa_id", empresaId());

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) {
      if (isMissingTable(error)) {
        state.unavailableTables.add(table);
        console.warn(`[Almoxarifado EasyLoc] tabela ausente: ${table}`);
        return [];
      }
      console.error(`[Almoxarifado EasyLoc] erro em ${table}:`, error);
      return [];
    }
    return data || [];
  }

  async function insertRecord(table, payload) {
    if (!sb() || state.unavailableTables.has(table)) return { data: null, error: { message: "Tabela indisponível" } };
    const { data, error } = await sb().from(table).insert(payload).select().single();
    if (error && isMissingTable(error)) state.unavailableTables.add(table);
    return { data, error };
  }

  async function updateRecord(table, id, payload) {
    if (!sb() || state.unavailableTables.has(table)) return { error: { message: "Tabela indisponível" } };
    const { error } = await sb().from(table).update(payload).eq("id", id);
    if (error && isMissingTable(error)) state.unavailableTables.add(table);
    return { error };
  }

  async function incrementarEstoqueItemLocacao(itemId, quantidade) {
    if (!sb() || !itemId || !Number(quantidade || 0)) return false;

    const { data, error } = await sb()
      .from(TABLES.itens)
      .select("id,estoque_total")
      .eq("id", itemId)
      .single();

    if (error) {
      console.warn("[Almoxarifado] item de locacao nao encontrado para recebimento:", error);
      return false;
    }

    const estoqueAnterior = Number(data?.estoque_total || 0);
    const estoqueAtual = estoqueAnterior + Number(quantidade || 0);
    const result = await updateRecord(TABLES.itens, itemId, {
      estoque_total: estoqueAtual,
      updated_at: new Date().toISOString()
    });

    if (result.error) {
      console.warn("[Almoxarifado] nao foi possivel atualizar estoque do item:", result.error);
      return false;
    }

    await logAudit("entrada_item_locacao", "compra", {
      item_id: itemId,
      quantidade: Number(quantidade || 0),
      estoque_anterior: estoqueAnterior,
      estoque_atual: estoqueAtual
    });

    return true;
  }

  function getMaterialName(id) {
    return state.materiais.find(item => item.id === id)?.nome || "-";
  }

  function getMaterialStatus(material) {
    if (material.ativo === false) return "inativo";
    if (Number(material.estoque_atual || 0) <= Number(material.estoque_minimo || 0)) return "baixo";
    return "ok";
  }

  function getLocation(material) {
    return material.localizacao
      || [material.corredor, material.prateleira, material.nivel, material.posicao].filter(Boolean).join("-")
      || "-";
  }

  function cleanCode(value) {
    return String(value || "")
      .replace(/^https?:\/\/\S*[?&](?:p|chNFe|chave)=/i, "")
      .replace(/\D/g, "");
  }

  function findMaterialByCode(value) {
    const raw = String(value || "").trim();
    const clean = cleanCode(raw);
    const normalized = normalizeText(raw);
    return state.materiais.find(item => {
      const fields = [item.qr_code, item.codigo_barras, item.codigo, item.nome];
      return fields.some(field => {
        const text = String(field || "").trim();
        return text && (
          text === raw
          || cleanCode(text) === clean && clean
          || normalizeText(text) === normalized && normalized
        );
      });
    });
  }

  function fillMovementFromMaterial(material, code = "") {
    const form = $("#almoxMovementForm");
    if (!form || !material) return;
    form.elements.tipo.value = "entrada";
    form.elements.material_id.value = material.id;
    form.elements.quantidade.value = form.elements.quantidade.value || "1";
    form.elements.valor_unitario.value = material.valor_medio || "";
    form.elements.observacao.value = [form.elements.observacao.value, code ? `Leitura: ${code}` : ""].filter(Boolean).join("\n");
  }

  function setImportPreview(html) {
    const preview = $("#almoxNotaPreview");
    if (!preview) return;
    preview.classList.toggle("hidden", !html);
    preview.innerHTML = html || "";
  }

  function decodeXmlText(xmlText, tag) {
    const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(xmlText || "");
    const doc = new DOMParser().parseFromString(`<x>${match?.[1] || ""}</x>`, "text/xml");
    return doc.documentElement.textContent.trim();
  }

  function parseNfeXml(xmlText) {
    const xml = String(xmlText || "");
    const fornecedor = decodeXmlText(xml, "xNome");
    const numero = decodeXmlText(xml, "nNF");
    const chave = /Id=["']NFe(\d{44})["']/i.exec(xml)?.[1] || /chNFe[^>]*>(\d{44})</i.exec(xml)?.[1] || "";
    const itens = [];
    const dets = xml.match(/<det\b[\s\S]*?<\/det>/gi) || [];

    dets.forEach(det => {
      const nome = decodeXmlText(det, "xProd");
      if (!nome) return;
      itens.push({
        codigo: decodeXmlText(det, "cProd"),
        codigo_barras: decodeXmlText(det, "cEAN") || decodeXmlText(det, "cEANTrib"),
        nome,
        unidade: decodeXmlText(det, "uCom") || decodeXmlText(det, "uTrib") || "UN",
        quantidade: Number(String(decodeXmlText(det, "qCom") || decodeXmlText(det, "qTrib") || "0").replace(",", ".")),
        valor_unitario: Number(String(decodeXmlText(det, "vUnCom") || decodeXmlText(det, "vUnTrib") || "0").replace(",", ".")),
        valor_total: Number(String(decodeXmlText(det, "vProd") || "0").replace(",", "."))
      });
    });

    return {
      fornecedor,
      numero_nf: numero,
      chave_nfe: chave,
      itens,
      valor_total: itens.reduce((sum, item) => sum + Number(item.valor_total || 0), 0)
    };
  }

  function parseSimpleNotaText(text) {
    const lines = String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const itens = [];
    lines.forEach(line => {
      const parts = line.split(/[;\t]/).map(part => part.trim());
      if (parts.length < 3) return;
      const quantidade = Number(String(parts.at(-2)).replace(",", "."));
      const valor = Number(String(parts.at(-1)).replace(",", "."));
      if (!Number.isFinite(quantidade) || !Number.isFinite(valor)) return;
      itens.push({
        codigo: parts[0],
        nome: parts.slice(1, -2).join(" ") || parts[0],
        quantidade,
        valor_unitario: valor,
        valor_total: quantidade * valor,
        unidade: "UN"
      });
    });
    return { fornecedor: "", numero_nf: "", chave_nfe: "", itens, valor_total: itens.reduce((sum, item) => sum + item.valor_total, 0) };
  }

  async function loadLegacyInsumosFallback() {
    if (!sb() || !state.unavailableTables.has(TABLES.materiais)) return;
    let { data, error } = await sb()
      .from("insumos")
      .select("id,codigo,nome,categoria,unidade,estoque_atual,estoque_minimo,valor_medio,status,qr_code,codigo_barras")
      .limit(200);

    if (error?.code === "42703") {
      const fallback = await sb()
        .from("insumos")
        .select("id,codigo,nome,categoria,unidade,estoque_minimo,status,qr_code")
        .limit(200);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) return;

    state.materiais = (data || []).map(item => ({
      id: item.id,
      codigo: item.codigo,
      nome: item.nome,
      categoria: item.categoria,
      tipo_item: "consumivel",
      unidade: item.unidade,
      estoque_atual: item.estoque_atual || 0,
      estoque_minimo: item.estoque_minimo || 0,
      estoque_maximo: 0,
      valor_medio: item.valor_medio || 0,
      setor_principal: "Almoxarifado",
      localizacao: "-",
      qr_code: item.qr_code,
      codigo_barras: item.codigo_barras,
      ativo: item.status !== "inativo",
      origem_legada: true
    }));
  }

  async function loadAll() {
    state.materiais = await queryTable(TABLES.materiais);
    await loadLegacyInsumosFallback();
    state.movimentacoes = await queryTable(TABLES.movimentacoes);
    state.ferramentas = await queryTable(TABLES.ferramentas);
    state.solicitacoes = await queryTable(TABLES.solicitacoes);
    state.compras = await queryTable(TABLES.compras);
    state.notas = await queryTable(TABLES.notas);
    state.auditoria = await queryTable(TABLES.auditoria);
    const configs = await queryTable(TABLES.configuracoes);
    state.config = configs.reduce((acc, item) => ({ ...acc, [item.chave]: item.valor }), {});
    renderAll();
  }

  function renderAll() {
    fillStaticSelects();
    renderDashboard();
    renderMaterials();
    renderMovementSelects();
    renderMovements();
    renderBatchRows();
    renderTools();
    renderBlindCount();
    renderRequests();
    renderPurchases();
    renderAudit();
    renderReports();
    renderConfigurations();
    if (window.lucide) window.lucide.createIcons();
  }

  function renderDashboard() {
    const totalItens = state.materiais.length;
    const valorEstoque = state.materiais.reduce((sum, item) => sum + Number(item.estoque_atual || 0) * Number(item.valor_medio || 0), 0);
    const abaixoMinimo = state.materiais.filter(item => getMaterialStatus(item) === "baixo").length;
    const itensEmUso = state.ferramentas.filter(item => !item.data_devolucao).length;
    const ferramentasPendentes = state.ferramentas.filter(tool => getToolStatus(tool) !== "ok").length;
    const solicitacoesPendentes = state.solicitacoes.filter(req => !["entregue", "cancelado"].includes(req.status)).length;
    const divergenciasSemana = 0;
    const comprasMes = state.compras.reduce((sum, item) => sum + Number(item.valor_total || 0), 0);
    const consumoMes = state.movimentacoes
      .filter(item => item.tipo === "saida")
      .reduce((sum, item) => sum + Number(item.valor_total || 0), 0);
    const economiaMes = state.movimentacoes.reduce((sum, item) => sum + Number(item.economia || 0), 0);

    const kpis = [
      ["Itens cadastrados", totalItens, "Materiais ativos e legados"],
      ["Valor total em estoque", formatCurrency(valorEstoque), "Estoque x valor médio"],
      ["Itens abaixo do mínimo", abaixoMinimo, "Exigem reposição"],
      ["Itens em uso", itensEmUso, "Ferramentas retiradas"],
      ["Ferramentas pendentes", ferramentasPendentes, "Próximas ou atrasadas"],
      ["Solicitações pendentes", solicitacoesPendentes, "Aguardando fluxo"],
      ["Divergências da semana", divergenciasSemana, "Após conferência"],
      ["Compras do mês", formatCurrency(comprasMes), "Compras lançadas"],
      ["Consumo do mês", formatCurrency(consumoMes), "Saídas registradas"],
      ["Economia do mês", formatCurrency(economiaMes), "Descontos e ajustes"]
    ];

    $("#almoxKpis").innerHTML = kpis.map(([label, value, sub]) => `
      <div class="almox-kpi">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>${sub}</small>
      </div>
    `).join("");

    const bySector = DEFAULT_SETORES.map(setor => {
      const total = state.movimentacoes
        .filter(item => normalizeText(item.setor) === normalizeText(setor) && item.tipo === "saida")
        .reduce((sum, item) => sum + Number(item.quantidade || 0), 0);
      return { setor, total };
    });
    const maxSector = Math.max(1, ...bySector.map(item => item.total));

    $("#almoxSectorRings").innerHTML = bySector.map(item => {
      const percent = Math.round((item.total / maxSector) * 100);
      return `
        <div class="almox-ring">
          <div class="almox-ring-circle" style="--p:${percent}">
            <strong>${percent}%</strong>
          </div>
          <span>${item.setor}</span>
        </div>
      `;
    }).join("");

    const mostConsumed = [...state.movimentacoes]
      .filter(item => item.tipo === "saida")
      .reduce((acc, mov) => {
        acc[mov.material_id] = (acc[mov.material_id] || 0) + Number(mov.quantidade || 0);
        return acc;
      }, {});
    const topMaterialId = Object.entries(mostConsumed).sort((a, b) => b[1] - a[1])[0]?.[0];
    const sectorSorted = [...bySector].sort((a, b) => b.total - a.total);

    const insights = [
      ["Setor que mais consumiu", sectorSorted[0]?.setor || "-"],
      ["Setor que menos consumiu", sectorSorted.at(-1)?.setor || "-"],
      ["Maior consumidor do mês", sectorSorted[0]?.setor || "-"],
      ["Maior consumidor do ano", sectorSorted[0]?.setor || "-"],
      ["Item mais consumido", topMaterialId ? getMaterialName(topMaterialId) : "-"],
      ["Itens parados há mais de 90 dias", state.materiais.filter(item => !item.updated_at).length],
      ["Próximos do mínimo", state.materiais.filter(item => Number(item.estoque_atual || 0) <= Number(item.estoque_minimo || 0) * 1.2).length],
      ["Ferramentas atrasadas", state.ferramentas.filter(tool => getToolStatus(tool) === "atrasado").length]
    ];

    $("#almoxInsights").innerHTML = insights.map(([label, value]) => `
      <div class="almox-insight">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `).join("");

    renderCriticalTable();
    renderRecentMovements();
  }

  function renderCriticalTable() {
    const list = state.materiais
      .filter(item => getMaterialStatus(item) === "baixo")
      .slice(0, 10);

    $("#almoxCriticalTable").innerHTML = list.length ? list.map(item => `
      <tr>
        <td>${item.codigo || "-"}</td>
        <td>${item.nome || "-"}</td>
        <td>${typeBadge(item.tipo_item)}</td>
        <td>${formatNumber(item.estoque_atual)}</td>
        <td>${formatNumber(item.estoque_minimo)}</td>
        <td>${statusBadge(getMaterialStatus(item))}</td>
      </tr>
    `).join("") : emptyRow(6, "Nenhum item crítico encontrado.");
  }

  function renderRecentMovements() {
    $("#almoxRecentMovements").innerHTML = state.movimentacoes.slice(0, 8).map(item => `
      <tr>
        <td>${formatDateTime(item.created_at || item.data_movimentacao)}</td>
        <td>${movementBadge(item.tipo)}</td>
        <td>${getMaterialName(item.material_id)}</td>
        <td>${formatNumber(item.quantidade)}</td>
        <td>${item.setor || "-"}</td>
      </tr>
    `).join("") || emptyRow(5, "Nenhuma movimentação registrada.");
  }

  function renderMaterials() {
    const term = normalizeText($("#almoxBuscaMaterial")?.value);
    const tipo = $("#almoxFiltroTipo")?.value || "";
    const status = $("#almoxFiltroStatus")?.value || "";

    const filtered = state.materiais.filter(item => {
      const haystack = normalizeText([
        item.codigo,
        item.nome,
        item.categoria,
        item.subcategoria,
        item.setor_principal,
        getLocation(item)
      ].join(" "));

      const statusItem = getMaterialStatus(item);
      return (!term || haystack.includes(term))
        && (!tipo || item.tipo_item === tipo)
        && (!status || statusItem === status);
    });

    $("#almoxMaterialsTable").innerHTML = filtered.map(item => `
      <tr>
        <td>${item.codigo || "-"}</td>
        <td>
          <strong>${item.nome || "-"}</strong>
          <span class="almox-muted">${item.subcategoria || item.unidade || ""}</span>
        </td>
        <td>${typeBadge(item.tipo_item)}</td>
        <td>${item.categoria || "-"}</td>
        <td>${getLocation(item)}</td>
        <td>${formatNumber(item.estoque_atual)} ${item.unidade || ""}</td>
        <td>${formatCurrency(item.valor_medio)}</td>
        <td><button type="button" class="almox-table-btn" data-qr-material="${item.id}">QR</button></td>
        <td>${statusBadge(getMaterialStatus(item))}</td>
        <td>
          <div class="almox-action-group">
            <button type="button" class="almox-table-btn" data-edit-material="${item.id}">Editar</button>
          </div>
        </td>
      </tr>
    `).join("") || emptyRow(10, "Nenhum material cadastrado.");
  }

  function renderMovementSelects() {
    const options = `<option value="">Selecione</option>` + state.materiais
      .filter(item => item.ativo !== false)
      .map(item => `<option value="${item.id}">${item.codigo || "-"} - ${item.nome || "-"}</option>`)
      .join("");

    ["almoxMovMaterial"].forEach(id => {
      const select = document.getElementById(id);
      if (select) select.innerHTML = options;
    });

    const setorOptions = DEFAULT_SETORES.map(setor => `<option value="${setor}">${setor}</option>`).join("");
    ["almoxMovSetor", "almoxMaterialSetor"].forEach(id => {
      const select = document.getElementById(id);
      if (select) select.innerHTML = setorOptions;
    });
  }

  function renderMovements() {
    $("#almoxMovementsTable").innerHTML = state.movimentacoes.map(item => `
      <tr>
        <td>${formatDateTime(item.created_at || item.data_movimentacao)}</td>
        <td>${movementBadge(item.tipo)}</td>
        <td>${getMaterialName(item.material_id)}</td>
        <td>${formatNumber(item.quantidade)}</td>
        <td>${item.setor || "-"}</td>
        <td>${item.solicitante || "-"}</td>
        <td>${item.numero_nf || item.pedido_evento || "-"}</td>
        <td>${item.autorizado_por || "-"}</td>
      </tr>
    `).join("") || emptyRow(8, "Nenhuma movimentação registrada.");
  }

  function renderBatchRows() {
    const tbody = $("#almoxBatchRows");
    if (!tbody.dataset.ready) {
      tbody.dataset.ready = "true";
      tbody.innerHTML = "";
      addBatchRow();
    }
    updateBatchTotal();
  }

  function addBatchRow() {
    const tbody = $("#almoxBatchRows");
    const tr = document.createElement("tr");
    const options = state.materiais.map(item => `<option value="${item.id}">${item.nome}</option>`).join("");
    tr.innerHTML = `
      <td><select class="el-select batch-material"><option value="">Produto</option>${options}</select></td>
      <td><input class="el-input batch-qty" type="number" min="0" step="0.01" value="1"></td>
      <td><input class="el-input batch-value" type="number" min="0" step="0.01" value="0"></td>
      <td class="batch-total">R$ 0,00</td>
      <td><button type="button" class="almox-table-btn batch-remove">X</button></td>
    `;
    tbody.appendChild(tr);
  }

  function addBatchRowData(data = {}) {
    addBatchRow();
    const row = $$("#almoxBatchRows tr").at(-1);
    if (!row) return;
    $(".batch-material", row).value = data.material_id || "";
    $(".batch-qty", row).value = data.quantidade ?? 1;
    $(".batch-value", row).value = data.valor_unitario ?? 0;
    updateBatchTotal();
  }

  function updateBatchTotal() {
    let total = 0;
    $$("#almoxBatchRows tr").forEach(row => {
      const qty = Number($(".batch-qty", row)?.value || 0);
      const value = Number($(".batch-value", row)?.value || 0);
      const rowTotal = qty * value;
      total += rowTotal;
      $(".batch-total", row).textContent = formatCurrency(rowTotal);
    });
    $("#almoxBatchTotal").textContent = formatCurrency(total);
  }

  function openImportPanel(mode) {
    state.activeImportMode = mode;
    const labels = {
      qr: ["QR Code do produto", "Leia o QR do material para preencher a movimentação."],
      barras: ["Código de barras", "Leia ou digite o código de barras para encontrar o material."],
      foto_nf: ["Foto da nota", "Envie uma imagem da nota para registrar o documento e conferir manualmente."],
      pdf_nf: ["PDF da nota", "Envie o PDF da nota. XML ou TXT preenchem o lote automaticamente."],
      qr_nfe: ["QR Code NF-e", "Cole a chave ou o conteúdo do QR da NF-e para vincular ao recebimento."],
      chave_nfe: ["Chave NF-e", "Digite a chave de 44 dígitos para registrar a nota no recebimento."],
      lote: ["Entrada em lote", "Preencha as linhas ao lado ou envie XML/TXT da nota para montar o lote."]
    };
    const [title, help] = labels[mode] || ["Leitura inteligente", "Escolha uma forma de entrada para o almoxarifado."];
    $("#almoxImportTitle").textContent = title;
    $("#almoxImportHelp").textContent = help;
    $("#almoxImportModeLabel").textContent = "Recebimento";
    $("#almoxImportPanel").classList.remove("hidden");
    setImportPreview("");
    setTimeout(() => $("#almoxScanInput")?.focus(), 50);
  }

  function closeImportPanel() {
    stopCameraScanner();
    $("#almoxImportPanel")?.classList.add("hidden");
    setImportPreview("");
  }

  async function handleScanCode() {
    const input = $("#almoxScanInput");
    const code = input?.value?.trim();
    if (!code) {
      notify("Informe ou leia um código antes de continuar.");
      return;
    }

    const clean = cleanCode(code);
    if (clean.length === 44 || ["qr_nfe", "chave_nfe"].includes(state.activeImportMode)) {
      const form = $("#almoxMovementForm");
      if (form) {
        form.elements.numero_nf.value = clean || code;
        form.elements.observacao.value = [form.elements.observacao.value, `NF-e: ${code}`].filter(Boolean).join("\n");
      }
      await registerNota({ chave_nfe: clean || code, origem_importacao: state.activeImportMode || "chave_nfe", itens: [], valor_total: 0 });
      notify("Chave NF-e vinculada ao recebimento. Confira os itens antes de lançar.");
      return;
    }

    const material = findMaterialByCode(code);
    if (!material) {
      notify("Nenhum material encontrado para esse QR ou código de barras.");
      return;
    }

    fillMovementFromMaterial(material, code);
    notify(`Material encontrado: ${material.nome}`);
  }

  async function openCameraScanner() {
    if (!("BarcodeDetector" in window)) {
      notify("Este navegador não liberou leitura por câmera. Use um leitor USB ou digite o código no campo.");
      return;
    }

    const video = $("#almoxScannerVideo");
    const box = $("#almoxScannerBox");
    try {
      state.scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      video.srcObject = state.scannerStream;
      await video.play();
      box.classList.remove("hidden");
      const detector = new BarcodeDetector({ formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "itf"] });
      const scan = async () => {
        if (!state.scannerStream) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length) {
            $("#almoxScanInput").value = codes[0].rawValue;
            stopCameraScanner();
            await handleScanCode();
            return;
          }
        } catch (error) {
          console.warn("[Almoxarifado] leitura por câmera falhou:", error);
        }
        state.scannerTimer = window.setTimeout(scan, 600);
      };
      scan();
    } catch (error) {
      console.error(error);
      notify("Não foi possível abrir a câmera. Verifique a permissão do navegador.");
    }
  }

  function stopCameraScanner() {
    if (state.scannerTimer) window.clearTimeout(state.scannerTimer);
    state.scannerTimer = null;
    state.scannerStream?.getTracks?.().forEach(track => track.stop());
    state.scannerStream = null;
    const box = $("#almoxScannerBox");
    const video = $("#almoxScannerVideo");
    if (video) video.srcObject = null;
    box?.classList.add("hidden");
  }

  async function handleNotaUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = file.name.split(".").pop().toLowerCase();
    const textLike = ["xml", "txt"].includes(extension) || file.type.includes("xml") || file.type.includes("text");
    const content = textLike ? await file.text() : "";
    const nota = extension === "xml" ? parseNfeXml(content) : textLike ? parseSimpleNotaText(content) : {
      fornecedor: "",
      numero_nf: "",
      chave_nfe: "",
      itens: [],
      valor_total: 0,
      origem_importacao: extension
    };

    nota.documento = file.name;
    nota.origem_importacao = nota.origem_importacao || extension;
    const savedNota = await registerNota(nota);

    if (!nota.itens.length) {
      setImportPreview(`
        <strong>Documento recebido para conferência</strong>
        <p>${file.name}</p>
        <small>Para leitura automática de itens, envie o XML da NF-e ou um TXT separado por ponto e vírgula: código; nome; quantidade; valor.</small>
      `);
      notify("Nota anexada. Confira os dados manualmente antes de lançar no estoque.");
      return;
    }

    await fillBatchFromNota(nota, savedNota?.id);
    notify("Nota lida e entrada em lote preparada para conferência.");
  }

  async function registerNota(nota) {
    const payload = {
      empresa_id: empresaId(),
      fornecedor: nota.fornecedor || "",
      numero_nf: nota.numero_nf || "",
      documento: nota.documento || "",
      chave_nfe: nota.chave_nfe || "",
      origem_importacao: nota.origem_importacao || state.activeImportMode || "manual",
      itens: nota.itens || [],
      valor_total: Number(nota.valor_total || 0),
      status: nota.itens?.length ? "conferida" : "pendente"
    };

    const result = await insertRecord(TABLES.notas, payload);
    if (result.error && !state.unavailableTables.has(TABLES.notas)) console.warn("[Almoxarifado] nota não salva:", result.error);
    if (state.unavailableTables.has(TABLES.notas)) {
      const localNota = { ...payload, id: uuid(), created_at: new Date().toISOString() };
      state.notas = [localNota, ...state.notas];
      return localNota;
    }
    if (result.data) state.notas = [result.data, ...state.notas];
    return result.data;
  }

  async function ensureMaterialFromNotaItem(item) {
    const found = findMaterialByCode(item.codigo_barras || item.codigo || item.nome);
    if (found) return found;

    const payload = {
      empresa_id: empresaId(),
      codigo: item.codigo || nextCode(),
      nome: item.nome || "Material da nota",
      categoria: "Nota fiscal",
      subcategoria: "Entrada fiscal",
      tipo_item: "consumivel",
      unidade: item.unidade || "UN",
      estoque_atual: 0,
      estoque_minimo: 0,
      estoque_maximo: 0,
      valor_medio: 0,
      setor_principal: "Almoxarifado",
      localizacao: "",
      qr_code: uuid(),
      codigo_barras: item.codigo_barras || "",
      ativo: true,
      updated_at: new Date().toISOString()
    };

    const result = await insertRecord(TABLES.materiais, payload);
    const material = result.data || { ...payload, id: uuid(), created_at: new Date().toISOString() };
    state.materiais = [material, ...state.materiais];
    renderMovementSelects();
    return material;
  }

  async function fillBatchFromNota(nota, notaId = null) {
    const tbody = $("#almoxBatchRows");
    tbody.dataset.ready = "true";
    tbody.innerHTML = "";
    const rows = [];

    for (const item of nota.itens) {
      const material = await ensureMaterialFromNotaItem(item);
      rows.push({ ...item, material_id: material.id, material_nome: material.nome, nota_id: notaId });
      addBatchRowData({
        material_id: material.id,
        quantidade: item.quantidade || 1,
        valor_unitario: item.valor_unitario || 0
      });
    }

    const form = $("#almoxMovementForm");
    if (form) {
      form.elements.tipo.value = "entrada";
      form.elements.fornecedor.value = nota.fornecedor || "";
      form.elements.numero_nf.value = nota.numero_nf || nota.chave_nfe || "";
      form.elements.setor.value = "Almoxarifado";
      form.elements.observacao.value = `Entrada importada da nota ${nota.numero_nf || nota.documento || ""}`.trim();
    }

    setImportPreview(`
      <strong>${rows.length} item(ns) preparado(s)</strong>
      <p>${nota.fornecedor || "Fornecedor não identificado"} ${nota.numero_nf ? `- NF ${nota.numero_nf}` : ""}</p>
      <small>Confira produtos, quantidades e valores antes de clicar em "Lançar lote no estoque".</small>
    `);
  }

  async function finalizeBatch() {
    const form = $("#almoxMovementForm");
    const headerData = form ? Object.fromEntries(new FormData(form).entries()) : {};
    const rows = $$("#almoxBatchRows tr").map(row => {
      const materialId = $(".batch-material", row)?.value;
      const material = state.materiais.find(item => item.id === materialId);
      const quantidade = Number($(".batch-qty", row)?.value || 0);
      const valorUnitario = Number($(".batch-value", row)?.value || 0);
      return { material, quantidade, valorUnitario };
    }).filter(row => row.material && row.quantidade > 0);

    if (!rows.length) {
      notify("Adicione ao menos um material válido no lote.");
      return;
    }

    for (const row of rows) {
      await persistMovement({
        empresa_id: empresaId(),
        tipo: "entrada",
        material_id: row.material.id,
        material_nome: row.material.nome,
        quantidade: row.quantidade,
        valor_unitario: row.valorUnitario,
        valor_total: row.quantidade * row.valorUnitario,
        fornecedor: headerData.fornecedor || "",
        numero_nf: headerData.numero_nf || "",
        setor: headerData.setor || "Almoxarifado",
        solicitante: headerData.solicitante || "",
        responsavel: headerData.responsavel || "",
        pedido_evento: headerData.pedido_evento || "",
        observacao: headerData.observacao || "Entrada em lote",
        data_movimentacao: new Date().toISOString()
      }, { silent: true });
    }

    await loadAll();
    const tbody = $("#almoxBatchRows");
    tbody.dataset.ready = "";
    renderBatchRows();
    notify("Lote lançado no estoque com sucesso.");
  }

  async function receivePurchase(purchaseId) {
    const compra = state.compras.find(item => item.id === purchaseId);
    if (!compra) return;
    const itens = Array.isArray(compra.itens) ? compra.itens : [];
    if (!itens.length) {
      notify("Esta compra não possui itens para receber.");
      return;
    }

    const ok = window.confirm
      ? window.confirm("Confirmar recebimento físico desta compra e atualizar o estoque?")
      : true;
    if (!ok) return;

    let recebidos = 0;
    let ignorados = 0;

    for (const item of itens) {
      const isItemLocacao = item.material_tipo === "item_locacao"
        || item.tipo_compra === "itens_locacao"
        || !!item.item_locacao_id;

      if (isItemLocacao) {
        const itemId = item.item_locacao_id || item.material_id;
        const okItem = await incrementarEstoqueItemLocacao(itemId, Number(item.quantidade || 0));
        if (okItem) recebidos += 1;
        else ignorados += 1;
        continue;
      }

      const material = state.materiais.find(mat => mat.id === item.material_id)
        || state.materiais.find(mat => normalizeText(mat.nome || mat.produto || mat.descricao_total) === normalizeText(item.material_nome));
      if (!material) {
        ignorados += 1;
        continue;
      }

      await persistMovement({
        empresa_id: empresaId(),
        tipo: "entrada",
        material_id: material.id,
        material_nome: material.nome || material.produto || material.descricao_total || item.material_nome,
        quantidade: Number(item.quantidade || 0),
        valor_unitario: Number(item.valor_unitario || 0),
        valor_total: Number(item.valor_total || 0),
        fornecedor: compra.fornecedor || "",
        numero_nf: compra.numero_nf || compra.documento || "",
        setor: "Almoxarifado",
        solicitante: compra.responsavel || "",
        responsavel: window.__USER?.nome || window.__CONTEXT?.usuario_nome || "Almoxarifado",
        pedido_evento: "",
        observacao: `Recebimento da compra ${compra.numero_nf || compra.documento || compra.id}`,
        data_movimentacao: new Date().toISOString()
      }, { silent: true });
      recebidos += 1;
    }

    if (!state.unavailableTables.has(TABLES.compras)) {
      await updateRecord(TABLES.compras, compra.id, {
        status: "recebido",
        recebido_em: new Date().toISOString(),
        recebido_por: window.__USER?.nome || window.__CONTEXT?.usuario_nome || "Almoxarifado",
        updated_at: new Date().toISOString()
      });
    }

    await loadAll();
    notify(ignorados
      ? `Compra recebida. ${recebidos} item(ns) atualizado(s), ${ignorados} pendente(s) de conferencia.`
      : "Compra recebida e estoque atualizado."
    );
  }

  function renderTools() {
    $("#almoxToolsTable").innerHTML = state.ferramentas.map(tool => `
      <tr>
        <td>${tool.material_nome || getMaterialName(tool.material_id)}</td>
        <td>${tool.responsavel || "-"}</td>
        <td>${tool.setor || "-"}</td>
        <td>${formatDate(tool.data_retirada)}</td>
        <td>${formatDate(tool.data_prevista)}</td>
        <td>${daysInUse(tool)}</td>
        <td>${toolStatusBadge(getToolStatus(tool))}</td>
        <td>${tool.data_devolucao ? "-" : `<button type="button" class="almox-table-btn" data-return-tool="${tool.id}">Devolver</button>`}</td>
      </tr>
    `).join("") || emptyRow(8, "Nenhuma ferramenta em uso.");

    const alerts = state.ferramentas.filter(tool => !tool.data_devolucao);
    $("#almoxToolAlerts").innerHTML = alerts.map(tool => `
      <div class="almox-tool-alert">
        <span>${toolStatusBadge(getToolStatus(tool))}</span>
        <strong>${tool.material_nome || getMaterialName(tool.material_id)}</strong>
        <small>${tool.responsavel || "-"} - previsto para ${formatDate(tool.data_prevista)}</small>
      </div>
    `).join("") || `<div class="almox-empty-state">Sem alertas de devolução.</div>`;
  }

  function getToolStatus(tool) {
    if (tool.data_devolucao) return "ok";
    if (!tool.data_prevista) return "pendente";
    const today = new Date();
    const due = new Date(tool.data_prevista);
    const diff = Math.ceil((due - today) / 86400000);
    if (diff < 0) return "atrasado";
    if (diff <= 2) return "pendente";
    return "ok";
  }

  function daysInUse(tool) {
    if (!tool.data_retirada) return "-";
    const end = tool.data_devolucao ? new Date(tool.data_devolucao) : new Date();
    return Math.max(0, Math.ceil((end - new Date(tool.data_retirada)) / 86400000));
  }

  function renderBlindCount() {
    $("#almoxBlindCountTable").innerHTML = state.materiais.map(item => `
      <tr>
        <td>${item.nome || "-"}</td>
        <td><button type="button" class="almox-table-btn" data-qr-material="${item.id}">QR</button></td>
        <td>${item.codigo || "-"}</td>
        <td>${getLocation(item)}</td>
        <td><input class="el-input blind-count-input" data-material-id="${item.id}" type="number" min="0" step="0.01" placeholder="Contagem física"></td>
        <td><input class="el-input blind-count-user" data-material-id="${item.id}" placeholder="Responsável"></td>
      </tr>
    `).join("") || emptyRow(6, "Cadastre materiais para iniciar a conferência.");
  }

  function finishBlindCount() {
    const rows = $$(".blind-count-input")
      .filter(input => input.value !== "")
      .map(input => {
        const material = state.materiais.find(item => item.id === input.dataset.materialId);
        const counted = Number(input.value || 0);
        const system = Number(material?.estoque_atual || 0);
        const diff = counted - system;
        return { material, counted, system, diff };
      });

    $("#almoxConferenceResult").innerHTML = rows.length ? rows.map(row => `
      <div class="almox-insight">
        <span>${row.material?.nome || "-"}</span>
        <strong>Sistema: ${formatNumber(row.system)} | Contagem: ${formatNumber(row.counted)} | Diferença: ${formatNumber(row.diff)}</strong>
      </div>
    `).join("") : `<div class="almox-empty-state">Informe ao menos uma contagem física para finalizar.</div>`;
  }

  function renderRequests() {
    const statuses = ["solicitado", "separando", "pronto", "entregue", "cancelado"];
    $("#almoxRequestsBoard").innerHTML = statuses.map(status => {
      const cards = state.solicitacoes.filter(req => (req.status || "solicitado") === status);
      return `
        <div class="almox-status-column">
          <h3>${statusLabel(status)} (${cards.length})</h3>
          ${cards.map(req => `
            <div class="almox-request-card">
              <strong>${req.titulo || req.setor || "Solicitação"}</strong>
              <span>${req.solicitante || "-"} - ${formatDate(req.created_at)}</span>
            </div>
          `).join("") || `<div class="almox-muted">Sem itens</div>`}
        </div>
      `;
    }).join("");
  }

  function renderPurchases() {
    const compras = state.compras.filter(item => (item.status || "aguardando_recebimento") !== "recebido");
    $("#almoxPurchasesTable").innerHTML = compras.map(item => `
      <tr>
        <td>${formatDate(item.created_at || item.data_compra)}</td>
        <td>${item.fornecedor || "-"}</td>
        <td>${item.numero_nf || item.documento || "-"}</td>
        <td>${formatDate(item.data_prevista)}</td>
        <td>${statusBadge(item.status || "pendente")}</td>
        <td>${formatCurrency(item.valor_total)}</td>
        <td><button type="button" class="almox-table-btn" data-receive-purchase="${item.id}">Conferir e receber</button></td>
      </tr>
    `).join("") || emptyRow(7, "Nenhuma compra aguardando recebimento.");
  }

  function renderAudit() {
    $("#almoxAuditTable").innerHTML = state.auditoria.map(item => `
      <tr>
        <td>${formatDateTime(item.created_at)}</td>
        <td>${item.usuario_nome || item.usuario_id || "-"}</td>
        <td>${item.acao || "-"}</td>
        <td>${item.tipo_movimentacao || "-"}</td>
        <td>${item.ip || "-"}</td>
        <td>${item.dispositivo || "-"}</td>
        <td>${item.detalhes ? JSON.stringify(item.detalhes) : "-"}</td>
      </tr>
    `).join("") || emptyRow(7, "Nenhum registro de auditoria encontrado.");
  }

  function renderReports() {
    const reports = [
      "Consumo por setor",
      "Consumo por período",
      "Compras por período",
      "Ferramentas em uso",
      "Ferramentas atrasadas",
      "Itens abaixo do mínimo",
      "Itens sem movimentação",
      "Conferências realizadas",
      "Divergências",
      "Custos por centro de custo"
    ];

    $("#almoxReportsGrid").innerHTML = reports.map(report => `
      <button type="button" class="almox-report-card">
        <span>Relatório</span>
        <strong>${report}</strong>
      </button>
    `).join("");
  }

  function renderConfigurations() {
    $("#almoxCostCentersTable").innerHTML = DEFAULT_SETORES.map(setor => `
      <tr>
        <td>${setor}</td>
        <td><input class="el-input sector-password" data-sector="${setor}" type="password" value="${state.config?.senhas_setor?.[setor] || ""}" placeholder="Senha do setor"></td>
        <td>${statusBadge("ok")}</td>
      </tr>
    `).join("");
  }

  function fillStaticSelects() {
    const categorySelect = $("#almoxMaterialCategoria");
    if (categorySelect && !categorySelect.dataset.ready) {
      categorySelect.dataset.ready = "true";
      categorySelect.innerHTML = Object.entries(CATEGORIAS)
        .map(([tipo, items]) => `<optgroup label="${typeLabel(tipo)}">${items.map(item => `<option value="${item}">${item}</option>`).join("")}</optgroup>`)
        .join("");
    }
  }

  function openTab(tab) {
    $$(".almox-tabs button").forEach(button => button.classList.toggle("active", button.dataset.almoxTab === tab));
    $$(".almox-section").forEach(section => section.classList.toggle("active", section.id === `almox-tab-${tab}`));
  }

  function openMaterialModal(material = null) {
    state.activeMaterial = material;
    const modal = $("#almoxMaterialModal");
    const form = $("#almoxMaterialForm");
    form.reset();
    $("#almoxMaterialModalTitle").textContent = material ? "Editar material" : "Novo material";

    if (material) {
      Object.entries(material).forEach(([key, value]) => {
        const field = form.elements[key];
        if (!field) return;
        if (key === "ativo") field.value = value === false ? "false" : "true";
        else field.value = value ?? "";
      });
      renderQr(material);
    } else {
      form.elements.id.value = "";
      form.elements.codigo.value = nextCode();
      renderQr(null);
    }

    modal.classList.remove("hidden");
  }

  function closeModal(id) {
    document.getElementById(id)?.classList.add("hidden");
  }

  function renderQr(material) {
    const render = $("#almoxMaterialQrRender");
    const code = $("#almoxMaterialQrCode");
    render.innerHTML = "";
    code.textContent = material?.qr_code || "Será gerado ao salvar";
    if (material?.qr_code) window.EasyLocQR?.render?.(render, material.qr_code, 96);
  }

  function nextCode() {
    const number = state.materiais.length + 1;
    return `ALM-${String(number).padStart(4, "0")}`;
  }

  async function saveMaterial(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const location = data.localizacao || [data.corredor, data.prateleira, data.nivel, data.posicao].filter(Boolean).join("-");
    const payload = {
      empresa_id: empresaId(),
      codigo: data.codigo || nextCode(),
      nome: data.nome,
      categoria: data.categoria,
      subcategoria: data.subcategoria,
      tipo_item: data.tipo_item,
      unidade: data.unidade,
      estoque_atual: Number(data.estoque_atual || 0),
      estoque_minimo: Number(data.estoque_minimo || 0),
      estoque_maximo: Number(data.estoque_maximo || 0),
      valor_medio: Number(data.valor_medio || 0),
      setor_principal: data.setor_principal,
      localizacao: location,
      corredor: data.corredor,
      prateleira: data.prateleira,
      nivel: data.nivel,
      posicao: data.posicao,
      qr_code: state.activeMaterial?.qr_code || uuid(),
      codigo_barras: data.codigo_barras,
      ativo: data.ativo !== "false",
      updated_at: new Date().toISOString()
    };

    const existingId = data.id || state.activeMaterial?.id;
    const result = existingId
      ? await updateRecord(TABLES.materiais, existingId, payload)
      : await insertRecord(TABLES.materiais, payload);

    if (result.error && !state.unavailableTables.has(TABLES.materiais)) {
      notify("Não foi possível salvar o material. Verifique as permissões do Supabase.");
      console.error(result.error);
      return;
    }

    if (state.unavailableTables.has(TABLES.materiais)) {
      const localMaterial = { ...payload, id: existingId || uuid(), created_at: new Date().toISOString() };
      state.materiais = existingId
        ? state.materiais.map(item => item.id === existingId ? localMaterial : item)
        : [localMaterial, ...state.materiais];
      notify("Material mantido na tela. Aplique a migration do Almoxarifado para salvar no banco definitivo.");
    } else {
      await logAudit(existingId ? "editar_material" : "criar_material", "material", payload);
      await loadAll();
    }

    closeModal("almoxMaterialModal");
    renderAll();
  }

  async function saveMovement(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const material = state.materiais.find(item => item.id === data.material_id);
    if (!material) {
      notify("Selecione um material válido.");
      return;
    }

    const payload = {
      empresa_id: empresaId(),
      tipo: data.tipo,
      material_id: data.material_id,
      material_nome: material.nome,
      quantidade: Number(data.quantidade || 0),
      valor_unitario: Number(data.valor_unitario || 0),
      valor_total: Number(data.quantidade || 0) * Number(data.valor_unitario || 0),
      fornecedor: data.fornecedor,
      numero_nf: data.numero_nf,
      setor: data.setor,
      solicitante: data.solicitante,
      responsavel: data.responsavel,
      pedido_evento: data.pedido_evento,
      observacao: data.observacao,
      data_movimentacao: new Date().toISOString()
    };

    if (payload.tipo === "saida") {
      state.pendingMovement = payload;
      $("#almoxAuthForm").reset();
      $("#almoxAuthModal").classList.remove("hidden");
      return;
    }

    await persistMovement(payload);
    form.reset();
  }

  async function authorizeMovement(event) {
    event.preventDefault();
    const senha = new FormData(event.currentTarget).get("senha");
    const payload = state.pendingMovement;
    if (!payload) return;

    const expected = state.config?.senhas_setor?.[payload.setor];
    if (expected && senha !== expected) {
      notify("Senha do setor inválida. A saída não foi liberada.");
      return;
    }

    payload.autorizado_por = payload.responsavel || "Autorizado";
    payload.autorizado_em = new Date().toISOString();
    closeModal("almoxAuthModal");
    await persistMovement(payload);
    state.pendingMovement = null;
    $("#almoxMovementForm").reset();
  }

  async function syncLegacyInsumo(material, payload) {
    if (!sb() || !material?.origem_legada) return;
    const allowed = {
      estoque_atual: payload.estoque_atual,
      valor_medio: payload.valor_medio,
      codigo_barras: payload.codigo_barras,
      qr_code: payload.qr_code,
      updated_at: payload.updated_at
    };
    Object.keys(allowed).forEach(key => allowed[key] === undefined && delete allowed[key]);
    if (!Object.keys(allowed).length) return;
    const { error } = await sb().from("insumos").update(allowed).eq("id", material.id);
    if (error && !String(error.message || "").includes("does not exist")) {
      console.warn("[Almoxarifado] não foi possível sincronizar insumo legado:", error);
    }
  }

  async function persistMovement(payload, options = {}) {
    const material = state.materiais.find(item => item.id === payload.material_id);
    const current = Number(material?.estoque_atual || 0);
    const next = payload.tipo === "entrada"
      ? current + payload.quantidade
      : Math.max(0, current - payload.quantidade);
    const currentAverage = Number(material?.valor_medio || 0);
    const materialPayload = { estoque_atual: next, updated_at: new Date().toISOString() };

    if (payload.tipo === "entrada" && Number(payload.valor_unitario || 0) > 0) {
      const incomingTotal = Number(payload.quantidade || 0) * Number(payload.valor_unitario || 0);
      const currentTotal = current * currentAverage;
      const divisor = Math.max(0.0001, current + Number(payload.quantidade || 0));
      materialPayload.valor_medio = (currentTotal + incomingTotal) / divisor;
    }

    const result = await insertRecord(TABLES.movimentacoes, payload);
    if (result.error && !state.unavailableTables.has(TABLES.movimentacoes)) {
      notify("Não foi possível registrar a movimentação.");
      console.error(result.error);
      return;
    }

    if (!state.unavailableTables.has(TABLES.materiais) && material?.id) {
      await updateRecord(TABLES.materiais, material.id, { estoque_atual: next, updated_at: new Date().toISOString() });
    }

    if (state.unavailableTables.has(TABLES.movimentacoes)) {
      state.movimentacoes = [{ ...payload, id: uuid(), created_at: new Date().toISOString() }, ...state.movimentacoes];
      if (material) material.estoque_atual = next;
      notify("Movimentação mantida na tela. Aplique a migration do Almoxarifado para salvar no banco definitivo.");
    } else {
      await logAudit("movimentacao_material", payload.tipo, payload);
      await loadAll();
    }

    renderAll();
  }

  persistMovement = async function persistMovementAtualizado(payload, options = {}) {
    const material = state.materiais.find(item => item.id === payload.material_id);
    const current = Number(material?.estoque_atual || 0);
    const quantity = Number(payload.quantidade || 0);
    const next = payload.tipo === "entrada"
      ? current + quantity
      : Math.max(0, current - quantity);
    const materialPayload = { estoque_atual: next, updated_at: new Date().toISOString() };

    if (payload.tipo === "entrada" && Number(payload.valor_unitario || 0) > 0) {
      const currentAverage = Number(material?.valor_medio || 0);
      const incomingTotal = quantity * Number(payload.valor_unitario || 0);
      const currentTotal = current * currentAverage;
      const divisor = Math.max(0.0001, current + quantity);
      materialPayload.valor_medio = (currentTotal + incomingTotal) / divisor;
    }

    const result = await insertRecord(TABLES.movimentacoes, payload);
    if (result.error && !state.unavailableTables.has(TABLES.movimentacoes)) {
      if (!options.silent) notify("Não foi possível registrar a movimentação.");
      console.error(result.error);
      return;
    }

    if (state.unavailableTables.has(TABLES.movimentacoes)) {
      state.movimentacoes = [{ ...payload, id: uuid(), created_at: new Date().toISOString() }, ...state.movimentacoes];
    }

    if (material) {
      material.estoque_atual = next;
      if (materialPayload.valor_medio !== undefined) material.valor_medio = materialPayload.valor_medio;
      if (!state.unavailableTables.has(TABLES.materiais) && material.id) {
        if (!material.origem_legada) await updateRecord(TABLES.materiais, material.id, materialPayload);
        await syncLegacyInsumo(material, materialPayload);
      }
    }

    await logAudit("movimentacao_material", payload.tipo, payload);

    if (!options.silent) {
      await loadAll();
      renderAll();
      notify("Movimentação registrada com sucesso.");
    }
  };

  async function logAudit(acao, tipo, detalhes) {
    if (state.unavailableTables.has(TABLES.auditoria)) return;
    await insertRecord(TABLES.auditoria, {
      empresa_id: empresaId(),
      usuario_id: window.__USER?.id || null,
      usuario_nome: window.__USER?.nome || window.__CONTEXT?.usuario_nome || "Sistema",
      acao,
      tipo_movimentacao: tipo,
      ip: null,
      dispositivo: navigator.userAgent,
      detalhes
    });
  }

  function saveConfig() {
    const senhas = {};
    $$(".sector-password").forEach(input => {
      senhas[input.dataset.sector] = input.value;
    });
    state.config.senhas_setor = senhas;
    notify("Configurações atualizadas na tela. A migration cria o armazenamento definitivo no Supabase.");
  }

  function showQuickQr(materialId) {
    const material = state.materiais.find(item => item.id === materialId);
    if (!material) return;
    if (window.EasyLocQR?.openQuickModal) {
      window.EasyLocQR.openQuickModal({
        qr_code: material.qr_code || "",
        codigo: material.codigo || "",
        nome: material.nome || ""
      });
      return;
    }
    openMaterialModal(material);
  }

  function exportMaterials() {
    const rows = state.materiais.map(item => ({
      codigo: item.codigo,
      nome: item.nome,
      tipo_item: item.tipo_item,
      categoria: item.categoria,
      estoque_atual: item.estoque_atual,
      localizacao: getLocation(item),
      qr_code: item.qr_code
    }));
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "almoxarifado-materiais.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    $$(".almox-tabs button").forEach(button => {
      button.addEventListener("click", () => openTab(button.dataset.almoxTab));
    });

    $$("[data-almox-tab-shortcut]").forEach(button => {
      button.addEventListener("click", () => openTab(button.dataset.almoxTabShortcut));
    });

    ["btnAlmoxNovoMaterial", "btnAlmoxNovoMaterialTabela"].forEach(id => {
      document.getElementById(id)?.addEventListener("click", () => openMaterialModal());
    });

    $("#btnAlmoxNovaEntrada")?.addEventListener("click", () => openTab("movimentacoes"));
    $("#btnAlmoxHistorico")?.addEventListener("click", () => openTab("auditoria"));
    $("#btnAlmoxEtiqueta")?.addEventListener("click", () => window.print());
    $("#btnAlmoxExportarMateriais")?.addEventListener("click", exportMaterials);
    $("#btnAlmoxAtualizarCompras")?.addEventListener("click", loadAll);
    $("#btnAlmoxAddLote")?.addEventListener("click", addBatchRow);
    $("#btnAlmoxFinalizarLote")?.addEventListener("click", finalizeBatch);
    $("#btnAlmoxUsarCodigo")?.addEventListener("click", handleScanCode);
    $("#btnAlmoxAbrirCamera")?.addEventListener("click", openCameraScanner);
    $("#btnAlmoxPararCamera")?.addEventListener("click", stopCameraScanner);
    $("#btnAlmoxFecharImport")?.addEventListener("click", closeImportPanel);
    $("#almoxNotaUpload")?.addEventListener("change", handleNotaUpload);
    $("#almoxScanInput")?.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleScanCode();
      }
    });
    $("#btnAlmoxFinalizarConferencia")?.addEventListener("click", finishBlindCount);
    $("#btnAlmoxSalvarConfig")?.addEventListener("click", saveConfig);
    $("#btnAlmoxNovaFerramenta")?.addEventListener("click", () => notify("Fluxo de retirada de ferramenta preparado. Use as tabelas novas para gravar retiradas e devoluções."));
    $("#btnAlmoxNovaSolicitacao")?.addEventListener("click", () => notify("Fluxo de solicitação preparado: Solicitado, Separando, Pronto, Entregue e Cancelado."));
    $("#btnAlmoxNovaCompra")?.addEventListener("click", () => notify("Fluxo de compras preparado para aprovação, importação fiscal e recebimento."));
    $("#btnAlmoxCopiarQr")?.addEventListener("click", () => {
      if (state.activeMaterial?.qr_code) window.EasyLocQR?.copy?.(state.activeMaterial.qr_code);
    });
    $("#btnAlmoxBaixarQr")?.addEventListener("click", () => {
      window.EasyLocQR?.downloadFromContainer?.($("#almoxMaterialQrRender"), state.activeMaterial?.codigo || state.activeMaterial?.nome || "material");
    });

    $("#almoxMaterialForm")?.addEventListener("submit", saveMaterial);
    $("#almoxMovementForm")?.addEventListener("submit", saveMovement);
    $("#almoxAuthForm")?.addEventListener("submit", authorizeMovement);
    $("#btnAlmoxLimparMov")?.addEventListener("click", () => $("#almoxMovementForm")?.reset());

    ["almoxBuscaMaterial", "almoxFiltroTipo", "almoxFiltroStatus"].forEach(id => {
      document.getElementById(id)?.addEventListener("input", renderMaterials);
      document.getElementById(id)?.addEventListener("change", renderMaterials);
    });

    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("input", handleDocumentInput);
  }

  function handleDocumentClick(event) {
    const close = event.target.closest("[data-close-modal]");
    if (close) closeModal(close.dataset.closeModal);

    const edit = event.target.closest("[data-edit-material]");
    if (edit) openMaterialModal(state.materiais.find(item => item.id === edit.dataset.editMaterial));

    const qr = event.target.closest("[data-qr-material]");
    if (qr) showQuickQr(qr.dataset.qrMaterial);

    const receive = event.target.closest("[data-receive-purchase]");
    if (receive) receivePurchase(receive.dataset.receivePurchase);

    if (event.target.closest(".batch-remove")) {
      event.target.closest("tr")?.remove();
      updateBatchTotal();
    }

    const option = event.target.closest("[data-entry-mode], [data-import-mode]");
    if (option) {
      const mode = option.dataset.entryMode || option.dataset.importMode;
      if (mode === "manual") {
        closeImportPanel();
        $("#almoxMovementForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (mode === "compra") {
        openTab("compras");
      } else {
        openImportPanel(mode);
      }
      return;
      notify(`Fluxo selecionado: ${option.dataset.entryMode || option.dataset.importMode}. A tela de conferência será usada antes de lançar no estoque.`);
    }

    const returnTool = event.target.closest("[data-return-tool]");
    if (returnTool) {
      notify("Devolução registrada na interface. A gravação definitiva será feita pelas tabelas novas do Almoxarifado.");
    }
  }

  function handleDocumentInput(event) {
    if (event.target.matches(".batch-qty, .batch-value")) updateBatchTotal();
  }

  function typeLabel(type) {
    return {
      consumivel: "Consumível",
      retornavel: "Retornável",
      epi: "EPI"
    }[type] || "Material";
  }

  function typeBadge(type) {
    return `<span class="almox-badge ${type || "consumivel"}">${typeLabel(type)}</span>`;
  }

  function movementBadge(type) {
    return `<span class="almox-badge ${type === "saida" ? "saida" : "entrada"}">${type === "saida" ? "Saída" : "Entrada"}</span>`;
  }

  function statusLabel(status) {
    return {
      solicitado: "Solicitado",
      separando: "Separando",
      pronto: "Pronto",
      entregue: "Entregue",
      cancelado: "Cancelado",
      ok: "OK",
      baixo: "Abaixo do mínimo",
      inativo: "Inativo",
      pendente: "Pendente",
      aguardando_recebimento: "Aguardando recebimento",
      recebido: "Recebido",
      atrasado: "Atrasado",
      programado: "Programado"
    }[status] || status || "-";
  }

  function statusBadge(status) {
    return `<span class="almox-badge ${status || "ok"}">${statusLabel(status)}</span>`;
  }

  function toolStatusBadge(status) {
    return statusBadge(status);
  }

  function emptyRow(cols, message) {
    return `<tr><td colspan="${cols}" class="almox-empty-row">${message}</td></tr>`;
  }

  function initAlmoxarifado() {
    if (state.initialized) return;
    state.initialized = true;
    bindEvents();
    loadAll().finally(() => window.finalizarCarregamentoModulo?.());
  }

  function destroyAlmoxarifado() {
    document.removeEventListener("click", handleDocumentClick);
    document.removeEventListener("input", handleDocumentInput);
    state.initialized = false;
  }

  window.__moduleInit = initAlmoxarifado;
  window.__activeModuleDestroy = destroyAlmoxarifado;
})();
