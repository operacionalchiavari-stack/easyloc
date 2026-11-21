// Almoxarifado (cópia da Tecnoweld, 16/11/2026): este arquivo faz as telas da Tecnoweld (almoxarifado.js,
// almox-epi.js, almox-vinculos.js) usarem o banco daqui. Ele cria window.TecnoweldAPI só com o que essas telas chamam,
// lendo as tabelas warehouse_* e as funções do banco portadas (migrations 20261116100000..100300).
// "OP" da Tecnoweld = número do pedido daqui. Setores = Parâmetros > RH. Pessoas = Cadastro de Funcionários.
(function () {
  "use strict";
  const ready = (async () => { await window.aguardarContexto?.(); await window.AlmoxDemo?.ready; })();
  const db = () => window.AlmoxDemo?.enabled ? window.AlmoxDemo.client : window.supabaseClient;
  const empresa = () => window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
  const cache = new Map();

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  }
  function err(error, fallback) {
    const e = new Error(error?.message || fallback || "Não foi possível concluir.");
    e.code = error?.code; return e;
  }
  async function q(build) { await ready; const { data, error } = await build(db()); if (error) throw err(error); return data; }
  async function rpc(name, args) { return q((c) => c.rpc(name, args || {})); }
  async function cached(key, ms, fn) {
    const hit = cache.get(key); if (hit && hit.until > Date.now()) return hit.value;
    const value = await fn(); cache.set(key, { value, until: Date.now() + ms }); return value;
  }
  const clear = () => cache.clear();

  // ---------- pessoas e setores ----------
  async function listSectors() {
    return cached("setores", 60000, async () => (await rpc("almox_setores_lista")) || []);
  }
  async function listEmployees() {
    return cached("pessoas", 60000, async () => ((await rpc("almox_pessoas")) || []).map((p) => ({
      ...p, setor_id: p.setor_id, setor: p.setor_id || p.setor ? { id: p.setor_id, nome: p.setor || "", tipo: p.setor || "" } : null,
      status: "ativo", ativo: true,
    })));
  }
  const nomePessoa = (id, pessoas) => (pessoas || []).find((p) => p.id === id)?.nome || null;

  // ---------- painel ----------
  function movimento(row) {
    return {
      ...row,
      responsavel: row.responsavel_id || row.responsavel_nome ? { id: row.responsavel_id, nome: row.responsavel_nome || "—" } : null,
      solicitante: row.solicitante_id || row.solicitante_nome ? { id: row.solicitante_id, nome: row.solicitante_nome || "—" } : null,
      setor: row.setor_id || row.setor_nome ? { id: row.setor_id, nome: row.setor_nome || "" } : null,
    };
  }
  const MOV_SELECT = "*, material:warehouse_materials(id,codigo,nome,unidade,localizacao,tipo_material,foto_url)";

  async function listWarehouseData() {
    return cached("painel", 8000, async () => {
      const [materials, movements, counts, reservas, consumos, aguardando] = await Promise.all([
        q((c) => c.from("warehouse_materials").select("*").order("nome")),
        q((c) => c.from("warehouse_movements").select(MOV_SELECT).order("created_at", { ascending: false }).limit(80)),
        q((c) => c.from("warehouse_count_items").select("*, material:warehouse_materials(id,codigo,nome,unidade)").order("created_at", { ascending: false }).limit(100)),
        rpc("almox_reservas_tela").catch(() => []),
        q((c) => c.from("warehouse_movements").select("id,material_id,quantidade,unidade,op_numero,documento,observacao,created_at,responsavel_nome,setor_nome")
          .eq("tipo", "saida").eq("origem", "producao").order("created_at", { ascending: false }).limit(1000)).catch(() => []),
        rpc("almox_aguardando_chegada").catch(() => []),
      ]);
      const mats = materials || [];
      const ids = [...new Set((counts || []).map((x) => x.responsavel_id).filter(Boolean))];
      const nomes = ids.length ? (await rpc("almox_nomes", { p_ids: ids }).catch(() => ({}))) || {} : {};
      const reserved = new Map();
      for (const r of reservas || []) {
        const e = reserved.get(r.material_id) || 0; reserved.set(r.material_id, e + Number(r.quantidade_reservada || 0));
      }
      const livre = (m) => Math.max(Number(m.quantidade_disponivel || 0) - (reserved.get(m.id) || 0), 0);
      const abaixo = (m) => Number(m.estoque_minimo || 0) > 0 && livre(m) <= Number(m.estoque_minimo || 0);
      const mes = new Date().toISOString().slice(0, 7);
      const uniq = (v) => [...new Set(v.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
      return {
        indicadores: {
          valorEstoque: mats.reduce((t, m) => t + Number(m.quantidade_disponivel || 0) * Number(m.valor_unitario || 0), 0),
          abaixoMinimo: mats.filter(abaixo).length,
          retalhosDisponiveis: 0, ferramentasEmprestadas: 0,
          divergenciasContagem: (counts || []).filter((x) => Number(x.divergencia || 0) !== 0).length,
          pedidosASeparar: new Set((reservas || []).map((r) => r.op_numero)).size,
          totalComprasMes: (movements || []).filter((m) => m.tipo === "entrada" && String(m.created_at || "").startsWith(mes)).reduce((t, m) => t + Number(m.valor_total || 0), 0),
          atualizadoEm: new Date().toISOString(),
        },
        materiais: mats,
        movimentacoesRecentes: (movements || []).map(movimento),
        materiaisAtencao: mats.filter((m) => abaixo(m) || Number(m.quantidade_disponivel || 0) < (reserved.get(m.id) || 0)),
        contagens: (counts || []).map((x) => ({ ...x, responsavel: x.responsavel_id ? { id: x.responsavel_id, nome: nomes[x.responsavel_id] || "—" } : null })),
        reservas: reservas || [],
        tetosPorSetor: [], separacaoProgresso: [], separacaoMateriaisProgresso: [], materiaisEtapas: [],
        filtros: { grupos: uniq(mats.map((m) => m.grupo)), categorias: uniq(mats.map((m) => m.categoria)), status: uniq(mats.map((m) => m.status)), localizacoes: uniq(mats.map((m) => m.localizacao)) },
        pcpStartByOrder: {}, pcpStartByStep: {},
        consumos: (consumos || []).map((x) => ({ ...x, responsavel: { nome: x.responsavel_nome }, setor: { nome: x.setor_nome } })),
        aguardandoChegada: aguardando || [],
      };
    });
  }
  async function listWarehouseMaterials() {
    return q((c) => c.from("warehouse_materials").select("id,codigo,nome,unidade,quantidade_disponivel,categoria,status,localizacao,material_referencia,observacoes,valor_unitario").order("nome"));
  }
  async function listWarehouseMovementsPage({ from = null, to = null, offset = 0, limit = 50 } = {}) {
    const rows = await q((c) => {
      let x = c.from("warehouse_movements").select(MOV_SELECT).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (from) x = x.gte("created_at", `${from}T00:00:00`);
      if (to) x = x.lte("created_at", `${to}T23:59:59`);
      return x;
    });
    return (rows || []).map(movimento);
  }
  async function listMaterialCategories() {
    return cached("categorias", 60000, async () => (await q((c) => c.from("warehouse_material_categories").select("*").order("ordem").order("nome"))) || []);
  }
  async function listAllWarehouseLocations() { return q((c) => c.from("warehouse_locations").select("*").order("codigo")); }

  // ---------- cadastro e movimentos ----------
  async function saveWarehouseEntry(payload) {
    await ready;
    let material = null;
    if (payload.material_id) material = await q((c) => c.from("warehouse_materials").select("*").eq("id", payload.material_id).maybeSingle());
    if (!material) {
      const novo = {
        empresa_id: empresa(), codigo: "", nome: payload.nome, especificacao: payload.especificacao || null,
        categoria: payload.categoria || null, unidade: payload.unidade || "UN", valor_unitario: Number(payload.valor_unitario || 0),
        estoque_minimo: Number(payload.estoque_minimo || 0), estoque_ideal: Number(payload.estoque_ideal || 0),
        observacoes: payload.observacoes || null, type_id: payload.type_id || null, exige_lote: !!payload.exige_lote,
        status: payload.status === "inativo" ? "inativo" : "disponivel",
        comprimento_maximo: payload.comprimento_maximo || null, largura_maxima: payload.largura_maxima || null, espessura: payload.espessura || null,
        diametro: payload.diametro || null, foto_url: payload.foto_url || null, tipo_material: payload.tipo_material || null,
        material_referencia: payload.material_referencia || null, localizacao: payload.localizacao || null,
      };
      material = await q((c) => c.from("warehouse_materials").insert(novo).select().single());
    }
    const quantity = Number(payload.quantidade || 0);
    if (quantity > 0) {
      material = await rpc("register_warehouse_manual_movement", {
        p_material_id: material.id, p_tipo: "entrada", p_quantidade: quantity,
        p_payload: {
          unidade: material.unidade, setor_id: payload.setor_id || null, solicitante_id: payload.solicitante_id || null,
          documento: payload.nota_fiscal || payload.finalidade || null, op_numero: payload.op_origem || payload.op_numero || null,
          localizacao: payload.localizacao || material.localizacao, responsavel_id: payload.responsavel_id || null,
          observacao: payload.observacoes || null, valor_unitario: payload.valor_unitario || null, fornecedor: payload.fornecedor || null,
        },
      });
    }
    clear(); return material;
  }
  async function saveWarehouseEntries(payload) {
    const result = await rpc("register_warehouse_entry_batch", {
      p_items: payload.items, p_reason: payload.reason, p_op_number: payload.op_number || null,
      p_note: payload.note || null, p_idempotency_key: payload.idempotency_key,
    });
    clear(); return result;
  }
  async function saveWarehouseExit(payload) {
    if (!payload.material_id) throw new Error("Material não informado.");
    const quantity = Number(payload.quantidade || 0);
    if (quantity <= 0) throw new Error("Quantidade inválida.");
    const r = await rpc("register_warehouse_manual_movement", {
      p_material_id: payload.material_id, p_tipo: "saida", p_quantidade: quantity,
      p_payload: {
        unidade: payload.unidade || null, setor_id: payload.setor_id || null, solicitante_id: payload.solicitante_id || null,
        responsavel_id: payload.responsavel_id || null, op_numero: payload.op_numero || null, origem: payload.origem || null,
        documento: payload.finalidade || null, localizacao: payload.local_retirada || null, observacao: payload.observacao || null,
      },
    });
    clear(); return r;
  }
  async function saveWarehouseMovement() { throw new Error("Use Entrada ou Saída para movimentar o estoque."); }

  // ---------- retiradas ----------
  async function listWarehouseLoans() {
    const [rows, pessoas, setores] = await Promise.all([
      q((c) => c.from("warehouse_loans").select("*, itens:warehouse_loan_items(*, material:warehouse_materials(id,codigo,nome,unidade))").order("created_at", { ascending: false })),
      listEmployees().catch(() => []), listSectors().catch(() => []),
    ]);
    return (rows || []).map((l) => ({
      ...l,
      responsavel_entrega: l.responsavel_entrega_id ? { id: l.responsavel_entrega_id, nome: nomePessoa(l.responsavel_entrega_id, pessoas) || "—" } : null,
      retirado_por: l.retirado_por_id ? { id: l.retirado_por_id, nome: nomePessoa(l.retirado_por_id, pessoas) || "—" } : null,
      setor: l.setor_id ? { id: l.setor_id, nome: setores.find((s) => s.id === l.setor_id)?.nome || "" } : null,
    }));
  }
  async function saveWarehouseLoan(payload) {
    const items = (payload.items || []).filter((i) => i.material_id && Number(i.quantidade || 0) > 0);
    if (!items.length) throw new Error("Adicione pelo menos um item para a retirada.");
    const r = await rpc("register_warehouse_loan", { p_payload: {
      responsavel_entrega_id: payload.responsavel_entrega_id || null, retirado_por_id: payload.retirado_por_id || null,
      setor_id: payload.setor_id || null, previsao_devolucao: payload.previsao_devolucao || null, observacoes: payload.observacoes || null,
      op_numero: payload.op_numero || null, items: items.map((i) => ({ material_id: i.material_id, quantidade: Number(i.quantidade), unidade: i.unidade || null })) } });
    clear(); return r;
  }
  async function returnWarehouseLoanItem(itemId, quantidade) {
    const r = await rpc("return_warehouse_loan_item", { p_item_id: itemId, p_quantidade: Number(quantidade || 0) }); clear(); return r;
  }

  // ---------- senha de 4 dígitos ----------
  async function verifyEmployeeWarehousePin(employeeId, pin) {
    if (!employeeId || !/^\d{4}$/.test(String(pin || ""))) throw new Error("Funcionário e senha de 4 dígitos são obrigatórios.");
    const ok = await rpc("verify_employee_warehouse_pin", { p_employee_id: employeeId, p_pin: String(pin) });
    if (!ok) throw new Error("Senha incorreta.");
    return true;
  }
  async function identifyEmployeeByWarehousePin(pin) {
    if (!/^\d{4}$/.test(String(pin || ""))) throw new Error("Informe a senha de 4 dígitos.");
    const e = await rpc("identify_employee_by_warehouse_pin", { p_pin: String(pin) });
    if (!e?.employee_id) throw new Error("Senha incorreta.");
    return e;
  }
  async function processWarehouseExitCart(payload) {
    if (!['op','os'].includes(payload.destination)) throw new Error('Selecione Pedido ou O.S. como destino.');
    const serviceOrder = payload.destination === 'os' ? {p_service_order_id:payload.service_order_id || null,p_service_order_source:payload.service_order_source || null} : {};
    const r = await rpc("process_warehouse_exit_cart", {
      p_pin: String(payload.pin || ""), p_items: payload.items || [], p_destination: payload.destination,
      p_op_number: payload.op_number || null, p_note: payload.note || null, p_idempotency_key: payload.idempotency_key, ...serviceOrder });
    clear(); return r;
  }
  async function resolveWarehouseScan(code) { return rpc("resolve_warehouse_scan", { p_code: String(code || "") }); }

  // ---------- endereços ----------
  async function createWarehouseLocation(code, name, description, sectorId = null) {
    const r = await rpc("create_warehouse_location", { p_code: code, p_name: name || null, p_description: description || null, p_sector_id: sectorId }); clear(); return r;
  }
  async function updateWarehouseLocation(id, name, description, active) {
    const r = await rpc("update_warehouse_location", { p_id: id, p_name: name || null, p_description: description || null, p_active: active }); clear(); return r;
  }
  async function setMaterialLocation(materialId, locationId) {
    const r = await rpc("set_material_location", { p_material_id: materialId, p_location_id: locationId || null }); clear(); return r;
  }

  // ---------- contagem ----------
  const listWarehouseCountCycle = () => rpc("list_warehouse_count_cycle");
  const listWarehouseCountCycles = () => rpc("list_warehouse_count_cycles");
  const getWarehouseCountCycleState = () => rpc("get_warehouse_count_cycle_state");
  const getWarehouseCountCycleReport = (id) => rpc("get_warehouse_count_cycle_report", { p_cycle_id: id });
  const getCountApprovalRights = () => rpc("get_count_approval_rights");
  async function registerWarehouseCount(items) { const r = await rpc("register_warehouse_count", { p_items: items }); clear(); return r || []; }
  async function justifyWarehouseCountItem(id, text) { await rpc("justify_warehouse_count_item", { p_id: id, p_justificativa: text }); clear(); }
  async function reviewWarehouseCountAdjustment(id, approve, note) { const r = await rpc("review_warehouse_count_adjustment", { p_id: id, p_approve: !!approve, p_note: note || null }); clear(); return r; }
  async function concludeWarehouseCountCycle() { const r = await rpc("conclude_warehouse_count_cycle"); clear(); return r; }

  // ---------- vínculos ----------
  const listWarehouseSupplierLinks = (search = "", offset = 0) => rpc("warehouse_supplier_links_list", { p_search: search || "", p_offset: offset || 0, p_limit: 50 });
  const updateWarehouseSupplierLink = (id, materialId, factor) => rpc("warehouse_supplier_link_update", { p_id: id, p_material_id: materialId, p_factor: Number(factor) });
  async function listSupplierProductLinks() { return q((c) => c.from("supplier_product_links").select("*")); }

  const listWarehouseServiceOrders = () => cached("ordens-servico", 30000, () => rpc("almox_ordens_servico_abertas"));

  // ---------- pedidos (o "OP" da Tecnoweld) ----------
  async function listOrders() {
    return cached("pedidos", 30000, async () => ((await rpc("almox_pedidos_abertos")) || []).map((p) => ({ ...p, status: "em_andamento" })));
  }

  // ---------- empresa, arquivos, parâmetros ----------
  async function getCompanyProfile() {
    return cached("empresa", 300000, async () => {
      const e = await q((c) => c.from("empresas").select("*").eq("id", empresa()).maybeSingle());
      return { ...(e || {}), nome_fantasia: e?.nome || e?.razao_social, razao_social: e?.razao_social || e?.nome, cnpj: e?.cnpj, logo_url: e?.logo_url };
    });
  }
  async function uploadFile(file, folder = "materiais") {
    await ready;
    if (!file) throw new Error("Escolha um arquivo.");
    if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo maior que 10 MB.");
    const nome = String(file.name || "arquivo").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${empresa()}/${folder}/${crypto.randomUUID()}-${nome}`;
    const { error } = await db().storage.from("almoxarifado").upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (error) throw err(error);
    return db().storage.from("almoxarifado").getPublicUrl(path).data.publicUrl;
  }
  async function getSystemParameters() {
    const data=await q(c=>c.from('almoxarifado_configuracoes').select('valor').eq('empresa_id',empresa()).eq('chave','contagem_justificativas').maybeSingle());
    return {dias_alerta_material_almoxarifado:7,contagem_justificativas:Array.isArray(data?.valor)?data.valor.filter(v=>typeof v==='string'&&v.trim().length>=5).map(v=>v.trim()):[]};
  }
  async function listPurchaseRequests() { return []; }
  async function listBlockedRncStock() { return []; }
  async function listRecentSeparationPackages() { return []; }

  // ---------- etiqueta do material (QR) ----------
  async function getLabelTemplate() { return null; }

  // Funções da Tecnoweld que não existem aqui (volumes, notas pela tela antiga, chapas): avisam em vez de quebrar.
  const naoUsado = (nome) => async () => { throw new Error("Esta função não é usada neste sistema."); };
  const vazio = async () => [];
  const stubs = {};
  ["listWarehouseSeparationPackages", "listWarehouseVolumes", "listNfeReceipts", "listIncomingPurchaseOrders", "listIncomingPurchases",
    "listReceivingChecklistQuestions"].forEach((n) => { stubs[n] = vazio; });
  ["getNfeReceipt", "updateNfeReceiptItem", "updateNfeReceipt", "saveNfeReceiptDraft", "findNfeReceiptByKey", "updateWarehouseReservationStatus",
    "saveSupplierProductLink", "saveNfeScan", "saveNfeDivergence", "createWarehouseSeparationPackage", "linkMaterialBarcode",
    "updateWarehouseSeparationPackageQuantity", "undoNfeScan", "undoInventoryScan", "transferWarehouseVolume", "syncChecklistRnc",
    "supplierOccurrenceConfig", "startInventoryLocation", "splitWarehouseVolume", "setReceivingItemCertificate", "setPurchaseOrderNfFile",
    "scanInventoryItem", "saveReceivingChecklistAnswer", "registerWarehouseSeparationPackagePrint", "purchaseDocumentUrl",
    "mountLabelDynamicCodes", "getPurchaseOrderV2Detail", "finishInventoryLocation", "createManualReceiptForPurchaseOrder", "completeNfeReceipt",
    "cancelWarehouseSeparationPackage", "approveInventoryAdjustment"].forEach((n) => { stubs[n] = naoUsado(n); });

  window.TecnoweldAPI = {
    ...stubs,
    getClient: () => db(), normalize,
    listSectors, listEmployees, listWarehouseData, listWarehouseMaterials, listWarehouseMovementsPage, listMaterialCategories,
    listAllWarehouseLocations, saveWarehouseEntry, saveWarehouseEntries, saveWarehouseExit, saveWarehouseMovement, listWarehouseLoans, saveWarehouseLoan,
    returnWarehouseLoanItem, verifyEmployeeWarehousePin, identifyEmployeeByWarehousePin, processWarehouseExitCart, resolveWarehouseScan,
    createWarehouseLocation, updateWarehouseLocation, setMaterialLocation, listWarehouseCountCycle, listWarehouseCountCycles,
    getWarehouseCountCycleState, getWarehouseCountCycleReport, getCountApprovalRights, registerWarehouseCount, justifyWarehouseCountItem,
    reviewWarehouseCountAdjustment, concludeWarehouseCountCycle, listWarehouseSupplierLinks, updateWarehouseSupplierLink,
    listSupplierProductLinks, listOrders, listWarehouseServiceOrders, getCompanyProfile, uploadFile, getSystemParameters, listPurchaseRequests, listBlockedRncStock,
    listRecentSeparationPackages, getLabelTemplate,
    buildLabelBodyHtml: () => "", applyLabelPrintSize: () => {},
    clearCache: clear,
  };

  // Permissões com os nomes da Tecnoweld -> chaves daqui.
  const MAPA = {
    "Acessar almoxarifado": "estoque.almoxarifado.visualizar", "Registrar entrada": "estoque.almoxarifado.movimentar",
    "Registrar saida": "estoque.almoxarifado.movimentar", "Editar material": "estoque.almoxarifado.movimentar",
    "Finalizar contagem": "estoque.almoxarifado.movimentar", "Ajustar saldo": "estoque.almoxarifado.aprovar",
    "Acessar compras": "estoque.compras.visualizar", "Editar colaboradores": "rh.colaboradores.editar",
  };
  const pode = (nome) => {
    const P = window.EasyLocPermissions;
    if (!P?.hasPermission) return true;
    try { return P.hasPermission(MAPA[nome] || "estoque.almoxarifado.movimentar") !== false; } catch { return true; }
  };
  window.TecnoweldPermissions = {
    has: pode, hasAny: (l) => (l || []).some(pode),
    requirePermission: (p, m) => { if (pode(p)) return true; window.TecnoAlert?.warning?.(m || "Você não tem permissão para esta ação."); return false; },
    apply(root = document) {
      root.querySelectorAll("[data-permission]").forEach((el) => {
        const ok = String(el.dataset.permission).split("|").some((p) => pode(p.trim()));
        el.classList.toggle("permission-denied", !ok);
        if (!ok) { el.setAttribute("disabled", ""); el.title = "Sem permissão"; }
      });
    },
  };

  // Usuário logado no formato que a tela espera (quem registrou o recebimento, etc.).
  ready.then(() => {
    const c = window.__CONTEXT || {};
    try { localStorage.setItem("tecnoweld_usuario_logado", JSON.stringify({ id: c.usuario_id, nome: c.usuario_nome })); } catch (_) {}
  });
})();
