(function () {
  "use strict";

  const TABLES = {
    compras: "almoxarifado_compras",
    materiais: "almoxarifado_materiais",
    insumos: "insumos",
    itens: "itens",
    fornecedores: "fornecedores"
  };

  const state = {
    compras: [],
    materiais: [],
    itens: [],
    fornecedores: [],
    tipoCompra: "insumos",
    scannerStream: null,
    scannerTimer: null,
    initialized: false
  };

  const sb = () => window.supabaseClient || window.supabase;
  const empresaId = () => window.__CONTEXT?.empresa_id || window.empresa_id || null;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function notify(message, title = "Compras") {
    if (typeof window.mostrarAlerta === "function") return window.mostrarAlerta(message, title);
    if (typeof window.alerta === "function") return window.alerta(message, title, "aviso");
    alert(message);
  }

  function money(value) {
    return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function date(value) {
    if (!value) return "-";
    return new Date(value).toLocaleDateString("pt-BR");
  }

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function statusLabel(status) {
    return {
      aguardando_recebimento: "Aguardando recebimento",
      recebido: "Recebido",
      atrasado: "Atrasado",
      cancelado: "Cancelado",
      pendente: "Pendente"
    }[status] || status || "-";
  }

  function purchaseTypeLabel(type) {
    return {
      insumos: "Insumos",
      itens_locacao: "Itens de locacao"
    }[type] || "Insumos";
  }

  function visualStatus(item) {
    const status = item.status || "aguardando_recebimento";
    if (status === "aguardando_recebimento" && item.data_prevista) {
      const today = new Date().toISOString().slice(0, 10);
      if (item.data_prevista < today) return "atrasado";
    }
    return status;
  }

  function cleanDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function extractNfeKey(value) {
    const text = String(value || "");
    const urlKey = /(?:chNFe|chave|p)=?(\d{44})/i.exec(text)?.[1];
    return urlKey || /\b\d{44}\b/.exec(text)?.[0] || "";
  }

  function parseNfeKey(key) {
    const clean = cleanDigits(key);
    if (clean.length !== 44) return null;
    return {
      chave: clean,
      uf: clean.slice(0, 2),
      anoMes: clean.slice(2, 6),
      cnpj: clean.slice(6, 20),
      modelo: clean.slice(20, 22),
      serie: clean.slice(22, 25),
      numero: String(Number(clean.slice(25, 34)) || clean.slice(25, 34)),
      tipoEmissao: clean.slice(34, 35)
    };
  }

  function formatCnpj(cnpj) {
    const clean = cleanDigits(cnpj);
    if (clean.length !== 14) return cnpj || "";
    return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }

  function findFornecedorByCnpj(cnpj) {
    const clean = cleanDigits(cnpj);
    return state.fornecedores.find(item => cleanDigits(item.documento || item.cnpj || item.cpf_cnpj) === clean);
  }

  async function consultarFornecedorPorCnpj(cnpj) {
    const clean = cleanDigits(cnpj);
    if (clean.length !== 14) return null;
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.warn("[Compras] CNPJ não consultado:", error);
      return null;
    }
  }

  async function preencherFornecedorPorCnpj(cnpj) {
    const form = $("#comprasForm");
    if (!form) return false;
    const local = findFornecedorByCnpj(cnpj);
    if (local) {
      form.elements.fornecedor.value = local.nome_razao_social || local.nome_fantasia || local.nome || "";
      setScanFeedback(`Fornecedor preenchido pelo cadastro: ${form.elements.fornecedor.value}`, "ok");
      return true;
    }

    const api = await consultarFornecedorPorCnpj(cnpj);
    const nome = api?.razao_social || api?.nome_fantasia || api?.nome;
    if (nome) {
      form.elements.fornecedor.value = nome;
      setScanFeedback(`Fornecedor preenchido pelo CNPJ ${formatCnpj(cnpj)}.`, "ok");
      return true;
    }

    form.elements.fornecedor.placeholder = `Fornecedor não encontrado para ${formatCnpj(cnpj)}`;
    setScanFeedback(`CNPJ ${formatCnpj(cnpj)} identificado, mas o fornecedor não foi encontrado.`, "warn");
    return false;
  }

  function findMaterialByCode(value) {
    const raw = String(value || "").trim();
    const digits = cleanDigits(raw);
    const norm = normalize(raw);
    return currentPurchaseMaterials().find(item => {
      const fields = [
        item.qr_code,
        item.codigo_barras,
        item.codigo,
        item.nome,
        item.produto,
        item.descricao_total
      ];
      return fields.some(field => {
        const text = String(field || "").trim();
        return text && (
          text === raw
          || (digits && cleanDigits(text) === digits)
          || normalize(text) === norm
        );
      });
    });
  }

  function setScanFeedback(message, type = "ok") {
    const box = $("#comprasScanFeedback");
    if (!box) return;
    box.className = `compras-scan-feedback ${type}`;
    box.textContent = message || "";
  }

  async function getRows(table, select = "*") {
    if (!sb()) return [];
    let query = sb().from(table).select(select);
    if (empresaId()) query = query.eq("empresa_id", empresaId());
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) {
      console.warn(`[Compras] erro ao carregar ${table}:`, error);
      return [];
    }
    return data || [];
  }

  async function loadItensLocacao() {
    if (!sb()) return [];
    let query = sb()
      .from(TABLES.itens)
      .select("id,codigo,produto,descricao_total,tipo,categoria,valor_locacao,valor_reposicao,custo,qr_code")
      .limit(500);
    if (empresaId()) query = query.eq("empresa_id", empresaId());
    const { data, error } = await query.order("produto", { ascending: true });
    if (error) {
      console.warn("[Compras] erro ao carregar itens de locacao:", error);
      return [];
    }
    return (data || []).map(item => ({
      ...item,
      nome: item.produto || item.descricao_total || item.codigo || "Item de locacao",
      unidade: "UN",
      tipo_item: "item_locacao",
      compra_origem: "itens_locacao"
    }));
  }

  async function loadAll() {
    state.compras = await getRows(TABLES.compras);
    state.materiais = await getRows(TABLES.materiais);
    state.itens = await loadItensLocacao();
    state.fornecedores = await getRows(TABLES.fornecedores);

    if (!state.materiais.length && sb()) {
      const { data } = await sb()
        .from(TABLES.insumos)
        .select("id,codigo,nome,categoria,unidade,qr_code,codigo_barras")
        .limit(300);
      state.materiais = (data || []).map(item => ({
        ...item,
        tipo_item: "consumivel",
        origem_legada: true
      }));
    }

    render();
  }

  function render() {
    renderKpis();
    renderTable();
  }

  function renderKpis() {
    const aguardando = state.compras.filter(item => visualStatus(item) === "aguardando_recebimento");
    const atrasadas = state.compras.filter(item => visualStatus(item) === "atrasado");
    const recebido = state.compras.filter(item => item.status === "recebido");
    const totalAguardando = state.compras
      .filter(item => ["aguardando_recebimento", "atrasado"].includes(visualStatus(item)))
      .reduce((sum, item) => sum + Number(item.valor_total || 0), 0);
    const itensAguardando = state.compras
      .filter(item => ["aguardando_recebimento", "atrasado"].includes(visualStatus(item)))
      .reduce((sum, item) => sum + ((item.itens || []).length), 0);

    $("#comprasKpis").innerHTML = [
      ["Aguardando recebimento", aguardando.length],
      ["Compras atrasadas", atrasadas.length],
      ["Itens para chegar", itensAguardando],
      ["Valor em aberto", money(totalAguardando)],
      ["Recebidas", recebido.length]
    ].map(([label, value]) => `
      <div class="compras-kpi">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `).join("");
  }

  function materialOptions() {
    return `<option value="">Selecione</option>` + currentPurchaseMaterials()
      .map(item => {
        const source = state.tipoCompra === "itens_locacao" ? "item_locacao" : "insumo";
        return `<option value="${source}:${item.id}">${item.codigo || "-"} - ${item.nome || item.produto || item.descricao_total || "-"}</option>`;
      })
      .join("");
  }

  function currentPurchaseMaterials() {
    return state.tipoCompra === "itens_locacao" ? state.itens : state.materiais;
  }

  function parseMaterialValue(value) {
    const [source, ...idParts] = String(value || "").split(":");
    const id = idParts.join(":");
    if (!id) return { source: state.tipoCompra === "itens_locacao" ? "item_locacao" : "insumo", id: value || "" };
    return { source, id };
  }

  function findPurchaseMaterial(value) {
    const { source, id } = parseMaterialValue(value);
    const list = source === "item_locacao" ? state.itens : state.materiais;
    return list.find(item => item.id === id);
  }

  function refreshMaterialSelects() {
    const options = materialOptions();
    $$("#comprasItensRows .compra-material").forEach(select => {
      select.innerHTML = options;
    });
  }

  function addItemRow(data = {}) {
    const tbody = $("#comprasItensRows");
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><select class="el-select compra-material">${materialOptions()}</select></td>
      <td><input class="el-input compra-qtd" type="number" min="0.01" step="0.01" value="${data.quantidade || 1}"></td>
      <td><input class="el-input compra-valor" type="number" min="0" step="0.01" value="${data.valor_unitario || 0}"></td>
      <td class="compra-total">${money(0)}</td>
      <td><button type="button" class="compras-remove btn secondary sm">X</button></td>
    `;
    $(".compra-material", row).value = data.material_id
      ? `${data.material_tipo || (state.tipoCompra === "itens_locacao" ? "item_locacao" : "insumo")}:${data.material_id}`
      : "";
    tbody.appendChild(row);
    updateTotal();
  }

  function resetItemRows() {
    const tbody = $("#comprasItensRows");
    tbody.innerHTML = "";
    addItemRow();
  }

  function updateTotal() {
    let total = 0;
    $$("#comprasItensRows tr").forEach(row => {
      const qty = Number($(".compra-qtd", row)?.value || 0);
      const value = Number($(".compra-valor", row)?.value || 0);
      const subtotal = qty * value;
      total += subtotal;
      $(".compra-total", row).textContent = money(subtotal);
    });

    const form = $("#comprasForm");
    total += Number(form?.elements.valor_frete?.value || 0);
    total -= Number(form?.elements.valor_desconto?.value || 0);
    $("#comprasTotal").textContent = money(total);
  }

  function filteredPurchases() {
    const status = $("#comprasStatusFiltro")?.value || "";
    const term = normalize($("#comprasBusca")?.value);
    return state.compras.filter(item => {
      const currentStatus = visualStatus(item);
      const haystack = normalize([
        item.fornecedor,
        item.numero_nf,
        item.documento,
        item.motivo_compra,
        item.descricao,
        item.responsavel
      ].join(" "));
      return (!status || currentStatus === status)
        && (!term || haystack.includes(term));
    });
  }

  function renderTable() {
    const rows = filteredPurchases();
    $("#comprasTabela").innerHTML = rows.map(item => `
      <tr>
        <td>
          <strong>${date(item.created_at || item.data_compra)}</strong>
          <span class="compras-muted-line">${item.responsavel || "-"}</span>
        </td>
        <td><span class="compras-type-badge">${purchaseTypeLabel(item.tipo_compra)}</span></td>
        <td>${item.fornecedor || "-"}</td>
        <td>${item.numero_nf || item.documento || "-"}</td>
        <td>${date(item.data_prevista)}</td>
        <td>
          <strong>${item.forma_pagamento || "-"}</strong>
          <span class="compras-muted-line">${item.condicao_pagamento || ""}</span>
        </td>
        <td>${item.motivo_compra || item.descricao || "-"}</td>
        <td>${(item.itens || []).length}</td>
        <td>${money(item.valor_total)}</td>
        <td><span class="compras-badge ${visualStatus(item)}">${statusLabel(visualStatus(item))}</span></td>
      </tr>
    `).join("") || `<tr><td colspan="10" class="compras-empty">Nenhuma compra lançada.</td></tr>`;
  }

  function openPurchaseModal() {
    const modal = $("#comprasModal");
    const form = $("#comprasForm");
    form?.reset();
    state.tipoCompra = form?.elements.tipo_compra?.value || "insumos";
    resetItemRows();
    setScanFeedback("");
    modal?.classList.remove("hidden");
    setTimeout(() => $("#comprasScanInput")?.focus(), 80);
  }

  function closePurchaseModal() {
    stopCameraScanner();
    $("#comprasModal")?.classList.add("hidden");
  }

  function addMaterialFromScan(material) {
    const existingEmpty = $$("#comprasItensRows tr").find(row => !$(".compra-material", row)?.value);
    const row = existingEmpty || (() => {
      addItemRow();
      return $$("#comprasItensRows tr").at(-1);
    })();
    if (!row) return;
    const source = state.tipoCompra === "itens_locacao" ? "item_locacao" : "insumo";
    $(".compra-material", row).value = `${source}:${material.id}`;
    $(".compra-qtd", row).value = $(".compra-qtd", row).value || "1";
    updateTotal();
    setScanFeedback(`Item adicionado: ${material.nome || material.produto || material.descricao_total || material.codigo}`, "ok");
  }

  async function useScannedCode() {
    const input = $("#comprasScanInput");
    const code = input?.value?.trim();
    const form = $("#comprasForm");
    if (!code || !form) {
      setScanFeedback("Informe ou leia um código primeiro.", "warn");
      return;
    }

    const nfeKey = extractNfeKey(code);
    if (nfeKey) {
      const parsed = parseNfeKey(nfeKey);
      form.elements.chave_nfe.value = nfeKey;
      if (parsed) {
        if (!form.elements.numero_nf.value) form.elements.numero_nf.value = parsed.numero;
        if (!form.elements.descricao.value) form.elements.descricao.value = `Compra importada pela chave NF-e ${parsed.chave}`;
        await preencherFornecedorPorCnpj(parsed.cnpj);
      } else {
        setScanFeedback("Chave NF-e preenchida automaticamente.", "ok");
      }
      input.value = "";
      return;
    }

    const material = findMaterialByCode(code);
    if (!material) {
      setScanFeedback("Código não encontrado no cadastro. Confira ou cadastre o material.", "error");
      return;
    }

    addMaterialFromScan(material);
    input.value = "";
  }

  async function openCameraScanner() {
    if (!("BarcodeDetector" in window)) {
      setScanFeedback("Este navegador não liberou leitura por câmera. Use um leitor USB ou digite o código.", "warn");
      return;
    }

    const video = $("#comprasScannerVideo");
    const box = $("#comprasScannerBox");
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
            $("#comprasScanInput").value = codes[0].rawValue;
            stopCameraScanner();
            await useScannedCode();
            return;
          }
        } catch (error) {
          console.warn("[Compras] leitura por câmera falhou:", error);
        }
        state.scannerTimer = window.setTimeout(scan, 600);
      };
      scan();
    } catch (error) {
      console.error(error);
      setScanFeedback("Não foi possível abrir a câmera. Verifique a permissão do navegador.", "error");
    }
  }

  function stopCameraScanner() {
    if (state.scannerTimer) window.clearTimeout(state.scannerTimer);
    state.scannerTimer = null;
    state.scannerStream?.getTracks?.().forEach(track => track.stop());
    state.scannerStream = null;
    const video = $("#comprasScannerVideo");
    if (video) video.srcObject = null;
    $("#comprasScannerBox")?.classList.add("hidden");
  }

  async function savePurchase(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = Object.fromEntries(new FormData(form).entries());
    const itens = $$("#comprasItensRows tr").map(row => {
      const materialValue = $(".compra-material", row)?.value;
      const { source, id: materialId } = parseMaterialValue(materialValue);
      const material = findPurchaseMaterial(materialValue);
      const quantidade = Number($(".compra-qtd", row)?.value || 0);
      const valorUnitario = Number($(".compra-valor", row)?.value || 0);
      return {
        material_id: materialId,
        material_tipo: source,
        tipo_compra: formData.tipo_compra || state.tipoCompra,
        material_nome: material?.nome || material?.produto || material?.descricao_total || "",
        codigo: material?.codigo || "",
        unidade: material?.unidade || "UN",
        quantidade,
        valor_unitario: valorUnitario,
        valor_total: quantidade * valorUnitario,
        origem_legada: !!material?.origem_legada,
        item_locacao_id: source === "item_locacao" ? materialId : null,
        insumo_id: source === "insumo" ? materialId : null
      };
    }).filter(item => item.material_id && item.quantidade > 0);

    if (!itens.length) {
      notify("Adicione ao menos um item comprado.");
      return;
    }

    const subtotal = itens.reduce((sum, item) => sum + Number(item.valor_total || 0), 0);
    const payload = {
      empresa_id: empresaId(),
      tipo_compra: formData.tipo_compra || state.tipoCompra,
      fornecedor: formData.fornecedor,
      numero_nf: formData.numero_nf,
      documento: formData.numero_nf,
      chave_nfe: formData.chave_nfe,
      data_prevista: formData.data_prevista || null,
      responsavel: formData.responsavel,
      centro_custo: formData.centro_custo,
      prioridade: formData.prioridade,
      descricao: formData.descricao,
      motivo_compra: formData.motivo_compra,
      forma_pagamento: formData.forma_pagamento,
      condicao_pagamento: formData.condicao_pagamento,
      parcelas: Number(formData.parcelas || 1),
      primeiro_vencimento: formData.primeiro_vencimento || null,
      valor_frete: Number(formData.valor_frete || 0),
      valor_desconto: Number(formData.valor_desconto || 0),
      observacao_financeira: formData.observacao_financeira,
      observacao: formData.observacao,
      itens,
      valor_total: subtotal + Number(formData.valor_frete || 0) - Number(formData.valor_desconto || 0),
      status: formData.status || "aguardando_recebimento",
      origem_importacao: "compras",
      data_compra: new Date().toISOString().slice(0, 10)
    };

    const { error } = await sb().from(TABLES.compras).insert(payload);
    if (error) {
      console.error(error);
      notify("Não foi possível salvar a compra.");
      return;
    }

    closePurchaseModal();
    await loadAll();
    notify("Compra enviada para recebimento no almoxarifado.");
  }

  function bindEvents() {
    $("#btnComprasAtualizar")?.addEventListener("click", loadAll);
    $("#btnComprasNova")?.addEventListener("click", openPurchaseModal);
    $("#btnComprasAddItem")?.addEventListener("click", () => addItemRow());
    $("#btnComprasUsarCodigo")?.addEventListener("click", () => useScannedCode());
    $("#btnComprasCamera")?.addEventListener("click", openCameraScanner);
    $("#btnComprasPararCamera")?.addEventListener("click", stopCameraScanner);
    $("#comprasScanInput")?.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        useScannedCode();
      }
    });
    $("#btnComprasLimpar")?.addEventListener("click", () => {
      $("#comprasForm")?.reset();
      state.tipoCompra = $("#comprasForm")?.elements.tipo_compra?.value || "insumos";
      resetItemRows();
    });
    $$("[name='tipo_compra']").forEach(input => {
      input.addEventListener("change", () => {
        state.tipoCompra = input.value || "insumos";
        resetItemRows();
        setScanFeedback(
          state.tipoCompra === "itens_locacao"
            ? "Busca: itens de locacao."
            : "Busca: insumos.",
          "ok"
        );
      });
    });
    $("#comprasForm")?.addEventListener("submit", savePurchase);
    $("#comprasStatusFiltro")?.addEventListener("change", renderTable);
    $("#comprasBusca")?.addEventListener("input", renderTable);
    document.addEventListener("input", handleInput);
    document.addEventListener("click", handleClick);
  }

  function handleInput(event) {
    if (event.target.matches(".compra-qtd, .compra-valor, [name='valor_frete'], [name='valor_desconto']")) updateTotal();
  }

  function handleClick(event) {
    if (event.target.closest("[data-compras-close]")) {
      closePurchaseModal();
      return;
    }

    if (!event.target.closest(".compras-remove")) return;
    event.target.closest("tr")?.remove();
    if (!$("#comprasItensRows tr")) addItemRow();
    updateTotal();
  }

  function initCompras() {
    if (state.initialized) return;
    state.initialized = true;
    bindEvents();
    loadAll().finally(() => window.finalizarCarregamentoModulo?.());
  }

  function destroyCompras() {
    document.removeEventListener("input", handleInput);
    document.removeEventListener("click", handleClick);
    state.initialized = false;
  }

  window.__moduleInit = initCompras;
  window.__activeModuleDestroy = destroyCompras;
})();
