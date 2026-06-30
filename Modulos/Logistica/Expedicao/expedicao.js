(function(){
  "use strict";

  const ROUTES_KEY = "easyloc_roteirizacao_rotas";
  const TEAMS_KEY = "easyloc_equipes_rotas";
  const FALLBACK_KEY = "easyloc_expedicoes";
  const EXP_TABLE = "logistica_expedicoes";

  const state = {
    supabase: null,
    empresaId: null,
    usuarioId: null,
    usuarioNome: null,
    routes: [],
    routeDetails: new Map(),
    teams: {},
    expeditions: {},
    trucksCatalog: [],
    employees: [],
    selectedRouteId: null,
    selectedItemId: null,
    selectedTruckId: null,
    selectedStartTruckId: null,
    selectedCheckItemId: null,
    dbReady: true,
    bound: false,
    destroyed: false
  };

  const els = {};

  function $(id){ return document.getElementById(id); }

  function cacheEls(){
    [
      "expRefreshBtn","expSummaryRoute","expSummaryDate","expSummaryClients","expSummaryEvent",
      "expSummaryOrders","expSummaryTrucks","expRoutesCount","expRoutesList","expPendingCount",
      "expItemsList","expMoveQtyBtn","expMoveAllBtn","expReturnQtyBtn","expReturnAllBtn",
      "expTrucksGrid","expFooterOrders","expFooterItemTypes","expFooterDistributed","expFooterPending",
      "expFooterVolume","expFooterWeight","expStartLoadingBtn","expStartModal","expStartTrucks",
      "expStartOrders","expOpenConferenceBtn","expConferenceModal","expConferenceTitle",
      "expConferenceSubtitle","expConferenceSummary","expConferenceIndicators","expManualCheckBtn",
      "expConferenceItems","expScanInput","expLastRead","expReadHistory","expFocusScanBtn",
      "expPauseLoadingBtn","expCancelLoadingBtn","expFinishLoadingBtn"
    ].forEach((id) => { els[id] = $(id); });
  }

  function notify(message, title = "ExpediÃ§Ã£o", type = "info"){
    if(typeof window.alerta === "function"){
      window.alerta(message, title, type);
      return;
    }
    console.log(`[${title}] ${message}`);
  }

  function escapeHtml(value){
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parseJson(value, fallback){
    if(value && typeof value === "object") return value;
    if(!value) return fallback;
    try { return JSON.parse(value); } catch { return fallback; }
  }

  function normalizeText(value){
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function formatNumber(value, digits = 1){
    return Number(value || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function formatDate(value){
    if(!value) return "-";
    const raw = String(value);
    const date = raw.includes("T") ? new Date(raw) : new Date(`${raw.slice(0, 10)}T00:00:00`);
    if(Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("pt-BR");
  }

  function formatTime(value){
    if(!value) return "-";
    if(/^\d{2}:\d{2}/.test(String(value))) return String(value).slice(0, 5);
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return "-";
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function nowIso(){ return new Date().toISOString(); }

  function isMissingTable(error){
    const code = String(error?.code || "");
    const message = String(error?.message || "");
    return code === "42P01" || code === "42703" || /does not exist|schema cache|could not find/i.test(message);
  }

  async function safeSelect(table, select, opts = {}){
    if(!state.supabase || !state.empresaId) return [];
    let query = state.supabase.from(table).select(select);
    if(opts.empresa !== false) query = query.eq("empresa_id", state.empresaId);
    if(opts.in?.field && opts.in.values?.length) query = query.in(opts.in.field, opts.in.values);
    if(opts.order) query = query.order(opts.order.field, { ascending: opts.order.ascending ?? true });
    const { data, error } = await query;
    if(error){
      if(isMissingTable(error)) return null;
      throw error;
    }
    return data || [];
  }

  function loadRoutes(){
    const parsed = parseJson(localStorage.getItem(ROUTES_KEY), []);
    state.routes = Array.isArray(parsed)
      ? parsed.filter((route) => route?.id).map(normalizeRoute)
      : [];
  }

  function normalizeRoute(route, index){
    const sequence = Array.isArray(route.sequence) ? route.sequence.map(String) : [];
    return {
      ...route,
      id: String(route.id),
      name: route.name || `Rota ${String(index + 1).padStart(2, "0")}`,
      number: route.numero || route.number || String(index + 1).padStart(2, "0"),
      sequence,
      deliveries: Number(route.deliveries || route.pedidos || sequence.length || 0),
      truck: route.truck || route.caminhao || "CaminhÃ£o nÃ£o definido",
      volume: Number(route.volume || route.cubagem || 0),
      distance: Number(route.distance || route.distancia || 0),
      duration: route.duration || route.duracao || "-",
      createdAt: route.createdAt || route.created_at || nowIso()
    };
  }

  function loadTeams(){
    const parsed = parseJson(localStorage.getItem(TEAMS_KEY), {});
    state.teams = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }

  function teamForRoute(routeId){
    return state.teams[String(routeId || "")] || null;
  }

  function routeHasTeam(routeId){
    const team = teamForRoute(routeId);
    return Array.isArray(team?.roles) && team.roles.some((role) => role.employeeId);
  }

  function routesReadyForExpedition(){
    return state.routes.filter((route) => routeHasTeam(route.id));
  }

  async function loadExpeditions(){
    const fallback = parseJson(localStorage.getItem(FALLBACK_KEY), {});
    state.expeditions = fallback && typeof fallback === "object" && !Array.isArray(fallback) ? fallback : {};

    if(!state.supabase || !state.empresaId) return;

    const rows = await safeSelect(EXP_TABLE, "*", { order: { field: "updated_at", ascending: false } });
    if(rows === null){
      state.dbReady = false;
      return;
    }

    state.dbReady = true;
    (rows || []).forEach((row) => {
      state.expeditions[String(row.route_id)] = normalizeExpedition(row);
    });
  }

  function normalizeExpedition(row){
    return {
      id: row.id || null,
      routeId: String(row.route_id || row.routeId || ""),
      status: row.status || "aguardando_distribuicao",
      distribution: parseJson(row.distribuicao ?? row.distribution, {}),
      loading: parseJson(row.carregamentos ?? row.loading, {}),
      routeSnapshot: parseJson(row.route_snapshot ?? row.routeSnapshot, {}),
      teamSnapshot: parseJson(row.team_snapshot ?? row.teamSnapshot, {}),
      updatedAt: row.updated_at || row.updatedAt || nowIso()
    };
  }

  function defaultExpedition(routeId){
    const route = getRoute(routeId);
    const team = teamForRoute(routeId);
    return {
      routeId: String(routeId || ""),
      status: "aguardando_distribuicao",
      distribution: {},
      loading: {},
      routeSnapshot: route || {},
      teamSnapshot: team || {},
      updatedAt: nowIso()
    };
  }

  function getExpedition(routeId = state.selectedRouteId){
    const id = String(routeId || "");
    if(!id) return null;
    if(!state.expeditions[id]) state.expeditions[id] = defaultExpedition(id);
    return state.expeditions[id];
  }

  async function saveExpedition(){
    const route = selectedRoute();
    if(!route) return;
    const expedition = getExpedition(route.id);
    expedition.updatedAt = nowIso();
    state.expeditions[route.id] = expedition;
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(state.expeditions));

    if(!state.supabase || !state.empresaId || !state.dbReady) return;

    const payload = {
      empresa_id: state.empresaId,
      route_id: route.id,
      status: expedition.status,
      route_snapshot: route,
      team_snapshot: teamForRoute(route.id) || {},
      distribuicao: expedition.distribution || {},
      carregamentos: expedition.loading || {},
      atualizado_por: state.usuarioId || null,
      updated_at: nowIso()
    };

    const { data, error } = await state.supabase
      .from(EXP_TABLE)
      .upsert(payload, { onConflict: "empresa_id,route_id" })
      .select("id")
      .single();

    if(error){
      if(isMissingTable(error)){
        state.dbReady = false;
        notify("Tabela de expediÃ§Ã£o ainda nÃ£o aplicada. Salvando localmente atÃ© a migration ser executada.", "ExpediÃ§Ã£o", "aviso");
        return;
      }
      console.error("[ExpediÃ§Ã£o] erro ao salvar:", error);
      notify("NÃ£o foi possÃ­vel salvar a expediÃ§Ã£o no banco.", "ExpediÃ§Ã£o", "erro");
      return;
    }
    expedition.id = data?.id || expedition.id;
  }

  async function loadTrucksCatalog(){
    const rows = await safeSelect("caminhoes", "*", { order: { field: "created_at", ascending: false } });
    state.trucksCatalog = Array.isArray(rows) ? rows.map(normalizeTruckFromDb) : [];
  }

  async function loadEmployees(){
    if(!state.supabase || !state.empresaId){
      state.employees = [];
      return;
    }
    try{
      const [rhRows, legacyRows] = await Promise.all([
        safeSelect("rh_colaboradores", "*", { order: { field: "nome_completo", ascending: true } }),
        safeSelect("colaboradores", "*", { order: { field: "created_at", ascending: false } })
      ]);
      const merged = new Map();
      (Array.isArray(rhRows) ? rhRows : []).forEach((row) => {
        const employee = normalizeEmployee(row, "rh");
        merged.set(employee.id, employee);
      });
      (Array.isArray(legacyRows) ? legacyRows : []).forEach((row) => {
        const employee = normalizeEmployee(row, "legacy");
        if(!merged.has(employee.id)) merged.set(employee.id, employee);
      });
      state.employees = Array.from(merged.values());
    }catch(error){
      console.warn("[ExpediÃ§Ã£o] nÃ£o foi possÃ­vel carregar funcionÃ¡rios:", error);
      state.employees = [];
    }
  }

  function normalizeEmployee(row, source){
    const rawId = String(row.id || row.uuid || row.codigo || "");
    const name = row.nome_completo || row.nome || row.name || row.apelido || "Funcionario";
    return {
      id: `${source}:${rawId}`,
      rawId,
      source,
      name,
      role: row.funcao || row.cargo || row.setor || "Equipe",
      raw: row
    };
  }

  function findEmployee(employeeId){
    const id = String(employeeId || "");
    if(!id) return null;
    return state.employees.find((employee) => employee.id === id || employee.rawId === id) || null;
  }

  function truckCapacity(row){
    const direto = Number(row?.capacidade_m3 || row?.capacidade || 0);
    if(Number.isFinite(direto) && direto > 0) return direto;
    const largura = Number(row?.largura_bau || 0);
    const altura = Number(row?.altura_bau || 0);
    const comprimento = Number(row?.comprimento_bau || row?.comprimento || 0);
    return largura > 0 && altura > 0 && comprimento > 0 ? largura * altura * comprimento : 0;
  }

  function normalizeTruckFromDb(row){
    return {
      id: String(row.id),
      name: row.modelo || row.nome || row.placa || "Caminhao",
      plate: row.placa || "",
      driver: row.motorista || row.motorista_nome || "",
      capacity: truckCapacity(row),
      weightCapacity: Number(row.capacidade_kg || row.peso_maximo || 0),
      raw: row
    };
  }

  async function loadRouteDetails(){
    state.routeDetails = new Map();
    const routes = routesReadyForExpedition();
    const ids = [...new Set(routes.flatMap((route) => route.sequence || []).map(String).filter(Boolean))];
    if(!ids.length) return;

    const pedidos = await safeSelect("separacoes_pedidos", "*", {
      in: { field: "id", values: ids },
      order: { field: "data_entrega", ascending: true }
    });
    const pedidoRows = Array.isArray(pedidos) ? pedidos : [];
    const pedidoMap = new Map(pedidoRows.map((pedido) => [String(pedido.id), pedido]));

    routes.forEach((route) => {
      const details = route.sequence
        .map((id, index) => normalizeDeliveryFromPedido(route, pedidoMap.get(String(id)), index))
        .filter(Boolean);
      state.routeDetails.set(route.id, details);
    });
  }

  function normalizeDeliveryFromPedido(route, pedido, index){
    if(!pedido) return null;
    const obs = parseJson(pedido.observacoes, {});
    return {
      id: String(pedido.id),
      pedidoId: pedido.id,
      number: pedido.numero_pedido || pedido.numero || String(index + 1).padStart(3, "0"),
      cliente: pedido.cliente_nome || pedido.cliente || "Cliente",
      event: pedido.tipo_evento || pedido.evento || "Evento",
      local: pedido.local_nome || obs.local_nome || "Local",
      address: pedido.local_endereco || obs.local_endereco || pedido.local_nome || "",
      date: pedido.data_entrega || pedido.data_evento || pedido.data_hora || pedido.created_at || route.createdAt,
      time: pedido.hora_entrega || pedido.horario_entrega || "",
      volume: Number(pedido.volume_total || 0),
      raw: pedido
    };
  }

  async function loadSelectedRouteItems(){
    const route = selectedRoute();
    if(!route) return [];
    const ids = (route.sequence || []).map(String).filter(Boolean);
    if(!ids.length) return [];

    const selects = [
      "id,separacao_pedido_id,item_id,item_nome,codigo_item,foto_url,quantidade_solicitada,quantidade_separada,itens:item_id(id,produto,descricao_total,codigo,foto_url,imagem_url,volume_cubico,peso,valor_reposicao)",
      "id,separacao_pedido_id,item_id,item_nome,codigo_item,foto_url,quantidade_solicitada,quantidade_separada",
      "*"
    ];

    for(const select of selects){
      const data = await safeSelect("separacoes_itens", select, {
        in: { field: "separacao_pedido_id", values: ids },
        order: { field: "created_at", ascending: true }
      });
      if(Array.isArray(data)) return data.map(normalizeRouteItem);
    }
    return [];
  }

  function normalizeRouteItem(row){
    const cadastro = row.itens || {};
    const qty = Number(row.quantidade_solicitada || row.quantidade || 0);
    const volumeUnit = Number(cadastro.volume_cubico || row.volume_cubico || 0);
    const weightUnit = Number(cadastro.peso || row.peso || row.peso_estimado || 0);
    return {
      id: String(row.id),
      separacaoItemId: row.id,
      pedidoId: String(row.separacao_pedido_id || ""),
      itemId: String(row.item_id || cadastro.id || ""),
      code: row.codigo_item || cadastro.codigo || row.codigo || "",
      name: row.item_nome || cadastro.descricao_total || cadastro.produto || "Item",
      photo: row.foto_url || cadastro.foto_url || cadastro.imagem_url || "",
      unit: row.unidade || "un",
      qty,
      separatedQty: Number(row.quantidade_separada || 0),
      volumeUnit: Number.isFinite(volumeUnit) ? volumeUnit : 0,
      weightUnit: Number.isFinite(weightUnit) ? weightUnit : 0,
      raw: row
    };
  }

  function selectedRoute(){
    return state.routes.find((route) => route.id === state.selectedRouteId) || null;
  }

  function getRoute(id){
    return state.routes.find((route) => route.id === String(id)) || null;
  }

  function routeDetails(route = selectedRoute()){
    return route ? (state.routeDetails.get(route.id) || []) : [];
  }

  function routeTrucks(route = selectedRoute()){
    if(!route) return [];
    const fromRoute = Array.isArray(route.trucks) ? route.trucks : Array.isArray(route.caminhoes) ? route.caminhoes : [];
    if(fromRoute.length){
      return fromRoute.map((truck, index) => normalizeRouteTruck(truck, index));
    }

    const routeTruckText = String(route.truck || "").trim();
    const matched = state.trucksCatalog.find((truck) => {
      const haystack = normalizeText(`${truck.name} ${truck.plate}`);
      return routeTruckText && (normalizeText(routeTruckText).includes(haystack) || haystack.includes(normalizeText(routeTruckText.split("-")[0])));
    });

    if(matched) return [{ ...matched, id: matched.id }];

    const matchCapacity = routeTruckText.match(/([\d,.]+)\s*m/i);
    return [{
      id: `route-truck-${route.id}`,
      name: routeTruckText || "CaminhÃ£o da rota",
      plate: "",
      driver: mainDriverName(route.id),
      capacity: matchCapacity ? Number(matchCapacity[1].replace(",", ".")) : Number(route.volume || 0),
      weightCapacity: 0
    }];
  }

  function normalizeRouteTruck(truck, index){
    const rawId = truck.id || truck.caminhao_id || truck.truckId || `${index + 1}`;
    const catalog = state.trucksCatalog.find((item) => String(item.id) === String(rawId));
    return {
      ...(catalog || {}),
      id: String(rawId),
      name: truck.name || truck.nome || truck.modelo || catalog?.name || `Caminhao ${index + 1}`,
      plate: truck.placa || catalog?.plate || "",
      driver: truck.motorista || truck.driver || catalog?.driver || mainDriverName(state.selectedRouteId),
      capacity: Number(truck.capacity || truck.capacidade || truck.capacidade_m3 || catalog?.capacity || 0),
      weightCapacity: Number(truck.weightCapacity || truck.capacidade_kg || catalog?.weightCapacity || 0)
    };
  }

  function mainDriverName(routeId){
    const team = teamForRoute(routeId);
    const role = (team?.roles || []).find((item) => normalizeText(item.name).includes("motorista") && item.employeeId);
    return role?.employeeName || findEmployee(role?.employeeId)?.name || "";
  }

  function allItems(){
    return state.currentItems || [];
  }

  function distributedQty(itemId, truckId = null){
    const expedition = getExpedition();
    const dist = expedition?.distribution || {};
    if(truckId){
      return Number(dist[String(truckId)]?.[String(itemId)] || 0);
    }
    return Object.values(dist).reduce((sum, truckItems) => sum + Number(truckItems?.[String(itemId)] || 0), 0);
  }

  function remainingQty(item){
    return Math.max(0, Number(item.qty || 0) - distributedQty(item.id));
  }

  function truckItems(truckId){
    const dist = getExpedition()?.distribution?.[String(truckId)] || {};
    return allItems()
      .map((item) => ({ ...item, distributed: Number(dist[item.id] || 0) }))
      .filter((item) => item.distributed > 0);
  }

  function itemTotals(items){
    return items.reduce((acc, item) => {
      const qty = Number(item.distributed ?? item.qty ?? 0);
      acc.qty += qty;
      acc.volume += qty * Number(item.volumeUnit || 0);
      acc.weight += qty * Number(item.weightUnit || 0);
      return acc;
    }, { qty: 0, volume: 0, weight: 0 });
  }

  async function selectRoute(routeId){
    state.selectedRouteId = String(routeId || "");
    state.selectedItemId = null;
    state.selectedTruckId = routeTrucks(getRoute(routeId))[0]?.id || null;
    state.currentItems = await loadSelectedRouteItems();
    render();
  }

  function render(){
    if(state.destroyed) return;
    renderRoutes();
    renderSummary();
    renderItems();
    renderTrucks();
    renderFooter();
    window.lucide?.createIcons?.();
  }

  function renderRoutes(){
    const routes = routesReadyForExpedition();
    if(els.expRoutesCount) els.expRoutesCount.textContent = routes.length;
    if(!els.expRoutesList) return;
    if(!routes.length){
      els.expRoutesList.innerHTML = `<div class="exp-empty">Nenhuma rota com equipe aguardando distribuiÃ§Ã£o.</div>`;
      return;
    }
    els.expRoutesList.innerHTML = routes.map((route) => {
      const details = routeDetails(route);
      const clients = unique(details.map((item) => item.cliente)).slice(0, 2).join(", ") || "-";
      const trucks = routeTrucks(route);
      const exp = getExpedition(route.id);
      const active = route.id === state.selectedRouteId ? " is-active" : "";
      return `
        <button type="button" class="exp-route-card${active}" data-exp-route="${escapeHtml(route.id)}">
          <div class="exp-truck-title-row">
            <h3>${escapeHtml(route.name)}</h3>
            <span class="exp-badge">${statusLabel(exp?.status)}</span>
          </div>
          <p>${escapeHtml(clients)}</p>
          <div class="exp-meta-grid">
            <span>${details.length || route.deliveries || 0} pedidos</span>
            <span>${trucks.length} caminhÃ£o${trucks.length === 1 ? "" : "Ãµes"}</span>
            <span>${formatDate(routeDate(route))}</span>
            <span>#${escapeHtml(route.number)}</span>
          </div>
        </button>
      `;
    }).join("");
  }

  function renderSummary(){
    const route = selectedRoute();
    const details = routeDetails(route);
    const trucks = routeTrucks(route);
    setText(els.expSummaryRoute, route?.name || "Selecione uma rota");
    setText(els.expSummaryDate, formatDate(routeDate(route)));
    setText(els.expSummaryClients, unique(details.map((item) => item.cliente)).join(", ") || "-");
    setText(els.expSummaryEvent, unique(details.map((item) => item.event)).join(", ") || "-");
    setText(els.expSummaryOrders, details.length || route?.deliveries || 0);
    setText(els.expSummaryTrucks, trucks.length);
  }

  function renderItems(){
    const items = allItems();
    const pending = items.filter((item) => remainingQty(item) > 0);
    setText(els.expPendingCount, pending.length);
    if(!els.expItemsList) return;
    if(!selectedRoute()){
      els.expItemsList.innerHTML = `<div class="exp-empty">Selecione uma rota para carregar os itens reais.</div>`;
      return;
    }
    if(!pending.length){
      els.expItemsList.innerHTML = `<div class="exp-empty">Todos os itens desta rota foram distribuÃ­dos.</div>`;
      return;
    }
    const trucks = routeTrucks();
    els.expItemsList.innerHTML = pending.map((item) => {
      const selected = item.id === state.selectedItemId ? " is-active" : "";
      return `
        <article class="exp-item-row${selected}" data-exp-item="${escapeHtml(item.id)}">
          ${itemImage(item.photo, "exp-item-photo")}
          <div class="exp-item-main">
            <h3>${escapeHtml(item.name)}</h3>
            <span class="exp-item-code">${escapeHtml(item.code || item.itemId || "-")}</span>
            <div class="exp-item-meta">
              <span>Unidade: ${escapeHtml(item.unit)}</span>
              <span>Total: ${formatNumber(item.qty, 0)}</span>
              <span>Restante: ${formatNumber(remainingQty(item), 0)}</span>
            </div>
            <div class="exp-qty-row">
              <select data-exp-target-truck="${escapeHtml(item.id)}">
                ${trucks.map((truck) => `<option value="${escapeHtml(truck.id)}" ${truck.id === state.selectedTruckId ? "selected" : ""}>${escapeHtml(truck.name)}</option>`).join("")}
              </select>
              <input type="number" min="1" max="${remainingQty(item)}" value="1" data-exp-qty="${escapeHtml(item.id)}">
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderTrucks(){
    const route = selectedRoute();
    const trucks = routeTrucks(route);
    if(!els.expTrucksGrid) return;
    if(!route){
      els.expTrucksGrid.innerHTML = `<div class="exp-empty">Nenhuma rota selecionada.</div>`;
      return;
    }
    els.expTrucksGrid.innerHTML = trucks.map((truck) => truckCardTemplate(truck)).join("");
  }

  function truckCardTemplate(truck){
    const items = truckItems(truck.id);
    const totals = itemTotals(items);
    const capacity = Number(truck.capacity || 0);
    const percent = capacity > 0 ? Math.min(100, Math.round((totals.volume / capacity) * 100)) : 0;
    const active = truck.id === state.selectedTruckId ? " is-active" : "";
    return `
      <article class="exp-truck-card${active}" data-exp-truck="${escapeHtml(truck.id)}">
        <header class="exp-truck-head">
          <div class="exp-truck-title-row">
            <div>
              <h3>${escapeHtml(truck.name)}</h3>
              <span class="exp-card-muted">${escapeHtml(truck.driver || "Motorista nÃ£o definido")}</span>
            </div>
            <span class="exp-badge blue">${percent}%</span>
          </div>
          <div class="exp-capacity">
            <div class="exp-capacity-top">
              <span>${formatNumber(totals.volume)} m3 usados</span>
              <span>${formatNumber(capacity)} m3</span>
            </div>
            <div class="exp-progress-track"><span style="width:${percent}%"></span></div>
            <div class="exp-capacity-top">
              <span>Peso estimado</span>
              <span>${formatNumber(totals.weight)} kg</span>
            </div>
          </div>
        </header>
        <div class="exp-truck-items">
          ${items.length ? items.map((item) => `
            <div class="exp-truck-item">
              ${itemImage(item.photo, "exp-truck-item-photo")}
              <div>
                <strong>${escapeHtml(item.name)}</strong>
                <small>${escapeHtml(item.code || "-")} - ${formatNumber(item.distributed, 0)} un.</small>
              </div>
              <button type="button" class="exp-icon-btn" data-exp-remove-item="${escapeHtml(item.id)}" data-exp-remove-truck="${escapeHtml(truck.id)}" title="Remover item">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          `).join("") : `<div class="exp-empty">Nenhum item neste caminhÃ£o.</div>`}
        </div>
        <footer class="exp-truck-footer">
          <span>${items.length} tipos</span>
          <span>${formatNumber(totals.qty, 0)} itens</span>
          <span>${formatNumber(totals.volume)} m3</span>
          <span>${formatNumber(totals.weight)} kg</span>
        </footer>
      </article>
    `;
  }

  function renderFooter(){
    const details = routeDetails();
    const items = allItems();
    const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const distributed = items.reduce((sum, item) => sum + distributedQty(item.id), 0);
    const pending = Math.max(0, totalQty - distributed);
    const allDistributedItems = routeTrucks().flatMap((truck) => truckItems(truck.id));
    const totals = itemTotals(allDistributedItems);
    setText(els.expFooterOrders, details.length);
    setText(els.expFooterItemTypes, items.length);
    setText(els.expFooterDistributed, formatNumber(distributed, 0));
    setText(els.expFooterPending, formatNumber(pending, 0));
    setText(els.expFooterVolume, formatNumber(totals.volume));
    setText(els.expFooterWeight, formatNumber(totals.weight));
    if(els.expStartLoadingBtn) els.expStartLoadingBtn.disabled = !selectedRoute() || pending > 0 || !items.length;
  }

  function itemImage(src, className){
    const safe = src ? escapeHtml(src) : "logo%20nova%20-%20com%20fundo%20branco.png";
    return `<img class="${className}" src="${safe}" alt="">`;
  }

  function unique(values){
    return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  }

  function setText(el, value){
    if(el) el.textContent = String(value ?? "");
  }

  function routeDate(route){
    const first = routeDetails(route)[0];
    return first?.date || route?.createdAt || "";
  }

  function statusLabel(status){
    const labels = {
      aguardando_distribuicao: "Aguardando",
      distribuicao_em_andamento: "Em distribuiÃ§Ã£o",
      pronto_carregamento: "Pronto",
      carregamento_em_andamento: "Carregando",
      carregamento_concluido: "Concluido",
      cancelado: "Cancelado",
      pausado: "Pausado"
    };
    return labels[status] || "Aguardando";
  }

  function selectedItem(){
    return allItems().find((item) => item.id === state.selectedItemId) || allItems().find((item) => remainingQty(item) > 0) || null;
  }

  function quantityInputFor(itemId){
    return document.querySelector(`[data-exp-qty="${CSS.escape(String(itemId))}"]`);
  }

  function targetTruckFor(itemId){
    const select = document.querySelector(`[data-exp-target-truck="${CSS.escape(String(itemId))}"]`);
    return select?.value || state.selectedTruckId || routeTrucks()[0]?.id || null;
  }

  async function distributeSelected(all = false){
    const item = selectedItem();
    if(!item){
      notify("Selecione um item pendente para distribuir.", "ExpediÃ§Ã£o", "aviso");
      return;
    }
    const truckId = targetTruckFor(item.id);
    if(!truckId){
      notify("Selecione um caminhÃ£o para receber o item.", "ExpediÃ§Ã£o", "aviso");
      return;
    }
    const remaining = remainingQty(item);
    const inputQty = Math.max(1, Number(quantityInputFor(item.id)?.value || 1));
    const qty = all ? remaining : Math.min(inputQty, remaining);
    if(qty <= 0) return;
    const expedition = getExpedition();
    expedition.distribution[truckId] = expedition.distribution[truckId] || {};
    expedition.distribution[truckId][item.id] = Number(expedition.distribution[truckId][item.id] || 0) + qty;
    expedition.status = remainingQty(item) - qty <= 0 && allItems().every((it) => it.id === item.id ? true : remainingQty(it) <= 0)
      ? "pronto_carregamento"
      : "distribuicao_em_andamento";
    state.selectedTruckId = truckId;
    await saveExpedition();
    render();
  }

  async function removeFromTruck(all = false, itemId = state.selectedItemId, truckId = state.selectedTruckId){
    const expedition = getExpedition();
    const bucket = expedition?.distribution?.[String(truckId)];
    if(!bucket || !itemId || !bucket[String(itemId)]) return;
    if(all){
      delete bucket[String(itemId)];
    }else{
      bucket[String(itemId)] = Math.max(0, Number(bucket[String(itemId)] || 0) - 1);
      if(bucket[String(itemId)] <= 0) delete bucket[String(itemId)];
    }
    expedition.status = "distribuicao_em_andamento";
    await saveExpedition();
    render();
  }

  function openStartModal(){
    state.selectedStartTruckId = routeTrucks()[0]?.id || null;
    renderStartModal();
    els.expStartModal.hidden = false;
    window.lucide?.createIcons?.();
  }

  function closeStartModal(){ els.expStartModal.hidden = true; }

  function renderStartModal(){
    const trucks = routeTrucks();
    if(els.expStartTrucks){
      els.expStartTrucks.innerHTML = trucks.map((truck) => {
        const items = truckItems(truck.id);
        const totals = itemTotals(items);
        const loading = getLoading(truck.id);
        const active = truck.id === state.selectedStartTruckId ? " is-active" : "";
        return `
          <button type="button" class="exp-start-truck-card${active}" data-exp-start-truck="${escapeHtml(truck.id)}">
            <h3>${escapeHtml(truck.name)}</h3>
            <p class="exp-card-muted">${escapeHtml(truck.driver || "Motorista nÃ£o definido")}</p>
            <div class="exp-meta-grid">
              <span>${routeDetailsByTruck(truck.id).length} pedidos</span>
              <span>${formatNumber(totals.qty, 0)} itens</span>
              <span>${formatNumber(totals.volume)} m3</span>
              <span>${formatNumber(totals.weight)} kg</span>
              <span>${formatNumber(truck.capacity)} m3 cap.</span>
              <span>${statusLabel(loading.status)}</span>
              <span>Equipe: ${escapeHtml(teamSummary())}</span>
            </div>
          </button>
        `;
      }).join("");
    }
    renderStartOrders();
  }

  function routeDetailsByTruck(truckId){
    const itemPedidoIds = new Set(truckItems(truckId).map((item) => String(item.pedidoId)));
    return routeDetails().filter((detail) => itemPedidoIds.has(String(detail.pedidoId)));
  }

  function renderStartOrders(){
    if(!els.expStartOrders) return;
    const orders = routeDetailsByTruck(state.selectedStartTruckId);
    if(!orders.length){
      els.expStartOrders.innerHTML = `<div class="exp-empty">Nenhum pedido distribuÃ­do para este caminhÃ£o.</div>`;
      return;
    }
    els.expStartOrders.innerHTML = orders.map((order) => {
      const items = truckItems(state.selectedStartTruckId).filter((item) => String(item.pedidoId) === String(order.pedidoId));
      const totals = itemTotals(items);
      return `
        <div class="exp-order-chip">
          <strong>#${escapeHtml(order.number)} - ${escapeHtml(order.cliente)}</strong>
          <span>${escapeHtml(order.event)} - ${items.length} itens - ${formatNumber(totals.volume)} m3 - ${formatNumber(totals.weight)} kg</span>
        </div>
      `;
    }).join("");
  }

  function getLoading(truckId){
    const expedition = getExpedition();
    expedition.loading[truckId] = expedition.loading[truckId] || {
      status: "nao_iniciado",
      startedAt: null,
      finalizedAt: null,
      pausedAt: null,
      reads: [],
      checked: {}
    };
    return expedition.loading[truckId];
  }

  async function openConferenceModal(){
    if(!state.selectedStartTruckId){
      notify("Selecione um caminhÃ£o para iniciar.", "ExpediÃ§Ã£o", "aviso");
      return;
    }
    const loading = getLoading(state.selectedStartTruckId);
    if(!loading.startedAt) loading.startedAt = nowIso();
    loading.status = loading.status === "concluido" ? "concluido" : "em_andamento";
    getExpedition().status = "carregamento_em_andamento";
    await saveExpedition();
    closeStartModal();
    renderConferenceModal();
    els.expConferenceModal.hidden = false;
    setTimeout(() => els.expScanInput?.focus(), 120);
  }

  function closeConferenceModal(){ els.expConferenceModal.hidden = true; }

  function selectedTruck(){
    return routeTrucks().find((truck) => truck.id === state.selectedStartTruckId) || routeTrucks()[0] || null;
  }

  function renderConferenceModal(){
    const truck = selectedTruck();
    const items = truckItems(truck?.id);
    const loading = getLoading(truck?.id);
    if(!state.selectedCheckItemId || !items.some((item) => item.id === state.selectedCheckItemId)){
      state.selectedCheckItemId = items.find((item) => checkedRemaining(item, loading) > 0)?.id || items[0]?.id || null;
    }
    setText(els.expConferenceTitle, truck?.name || "Caminhao");
    setText(els.expConferenceSubtitle, truck?.driver ? `Motorista: ${truck.driver}` : "Escaneie os QR Codes dos itens ou utilize conferÃªncia manual.");
    renderConferenceSummary(truck, items, loading);
    renderConferenceItems(items, loading);
    renderReadHistory(loading);
    window.lucide?.createIcons?.();
  }

  function renderConferenceSummary(truck, items, loading){
    const totals = itemTotals(items);
    const checked = items.reduce((sum, item) => sum + Number(loading.checked[item.id] || 0), 0);
    const total = totals.qty;
    const percent = total > 0 ? Math.round((checked / total) * 100) : 0;
    const orders = routeDetailsByTruck(truck?.id);
    const started = loading.startedAt ? new Date(loading.startedAt) : null;
    const minutes = started ? Math.max(0, Math.round((Date.now() - started.getTime()) / 60000)) : 0;
    if(els.expConferenceSummary){
      els.expConferenceSummary.innerHTML = [
        ["Caminhao", truck?.name || "-"],
        ["Motorista", truck?.driver || "-"],
        ["Equipe", teamSummary()],
        ["Rota", selectedRoute()?.name || "-"],
        ["Pedidos", orders.length],
        ["HorÃ¡rio previsto", formatTime(orders[0]?.time || orders[0]?.date)],
        ["Volume", `${formatNumber(totals.volume)} m3`]
      ].map(([label, value]) => `<div>${escapeHtml(label)}<strong>${escapeHtml(value)}</strong></div>`).join("");
    }
    if(els.expConferenceIndicators){
      els.expConferenceIndicators.innerHTML = [
        ["Progresso", `${percent}%`],
        ["Conferida", formatNumber(checked, 0)],
        ["Restante", formatNumber(Math.max(0, total - checked), 0)],
        ["Itens", formatNumber(total, 0)],
        ["Volume", `${formatNumber(totals.volume)} m3`],
        ["Peso", `${formatNumber(totals.weight)} kg`],
        ["Tempo", `${minutes} min`]
      ].map(([label, value]) => `<div>${escapeHtml(label)}<strong>${escapeHtml(value)}</strong></div>`).join("");
    }
  }

  function teamSummary(){
    const team = teamForRoute(state.selectedRouteId);
    const names = (team?.roles || [])
      .map((role) => role.employeeName || findEmployee(role.employeeId)?.name)
      .filter(Boolean);
    return unique(names).slice(0, 3).join(", ") || "-";
  }

  function renderConferenceItems(items, loading){
    if(!els.expConferenceItems) return;
    if(!items.length){
      els.expConferenceItems.innerHTML = `<div class="exp-empty">Nenhum item distribuÃ­do para este caminhÃ£o.</div>`;
      return;
    }
    els.expConferenceItems.innerHTML = items.map((item) => {
      const checked = Number(loading.checked[item.id] || 0);
      const total = Number(item.distributed || 0);
      const percent = total > 0 ? Math.round((checked / total) * 100) : 0;
      const status = checked <= 0 ? "NÃ£o iniciado" : checked >= total ? "ConcluÃ­do" : "Em andamento";
      const active = item.id === state.selectedCheckItemId ? " is-active" : "";
      return `
        <article class="exp-check-row${active}" data-exp-check-item="${escapeHtml(item.id)}">
          <div class="exp-check-row-top">
            ${itemImage(item.photo, "exp-truck-item-photo")}
            <div>
              <h4>${escapeHtml(item.name)}</h4>
              <span class="exp-card-muted">${escapeHtml(item.code || "-")} - total ${formatNumber(total, 0)} - conferido ${formatNumber(checked, 0)} - restante ${formatNumber(Math.max(0, total - checked), 0)}</span>
            </div>
            <span class="exp-badge ${checked >= total ? "green" : checked > 0 ? "blue" : "gray"}">${status}</span>
          </div>
          <div class="exp-progress-track"><span style="width:${percent}%"></span></div>
        </article>
      `;
    }).join("");
  }

  function renderReadHistory(loading){
    const reads = Array.isArray(loading.reads) ? loading.reads.slice(-8).reverse() : [];
    if(els.expReadHistory){
      els.expReadHistory.innerHTML = reads.length
        ? reads.map((read) => `<div class="exp-read-line">${formatTime(read.at)} - ${escapeHtml(read.itemName)} - ${formatNumber(read.qty, 0)} un. - ${escapeHtml(read.user || "-")}</div>`).join("")
        : `<div class="exp-empty">Nenhuma leitura registrada.</div>`;
    }
  }

  function checkedRemaining(item, loading){
    return Math.max(0, Number(item.distributed || 0) - Number(loading.checked[item.id] || 0));
  }

  async function registerRead(code, qty = 1, manual = false){
    const truck = selectedTruck();
    const loading = getLoading(truck?.id);
    const normalized = normalizeText(code);
    const items = truckItems(truck?.id);
    const item = manual
      ? items.find((entry) => entry.id === state.selectedCheckItemId)
      : items.find((entry) => normalizeText(entry.code) === normalized || normalizeText(entry.itemId) === normalized || normalizeText(entry.id) === normalized);

    if(!item){
      showLastRead("error", "Item nÃ£o pertence a este caminhÃ£o", code);
      return;
    }
    const remaining = checkedRemaining(item, loading);
    if(remaining <= 0){
      showLastRead("error", "Quantidade deste item ja foi concluida", item.name);
      return;
    }
    const readQty = Math.min(Math.max(1, Number(qty || 1)), remaining);
    loading.checked[item.id] = Number(loading.checked[item.id] || 0) + readQty;
    loading.reads = Array.isArray(loading.reads) ? loading.reads : [];
    loading.reads.push({
      at: nowIso(),
      itemId: item.itemId,
      itemName: item.name,
      code: item.code,
      qty: readQty,
      user: state.usuarioNome || "Usuario"
    });
    loading.status = items.every((entry) => checkedRemaining(entry, loading) <= 0) ? "concluido_pendente_finalizacao" : "em_andamento";
    showLastRead("success", `${item.name}`, `${formatNumber(loading.checked[item.id], 0)} / ${formatNumber(item.distributed, 0)}`);
    await saveExpedition();
    renderConferenceModal();
  }

  function showLastRead(type, title, subtitle){
    if(!els.expLastRead) return;
    els.expLastRead.className = `exp-last-read ${type}`;
    els.expLastRead.innerHTML = `
      <i data-lucide="${type === "success" ? "check-circle-2" : "x-circle"}"></i>
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(subtitle || "")}</span>
      </div>
    `;
    window.lucide?.createIcons?.();
  }

  async function manualCheck(){
    const item = truckItems(state.selectedStartTruckId).find((entry) => entry.id === state.selectedCheckItemId);
    if(!item){
      notify("Selecione um item para conferÃªncia manual.", "ExpediÃ§Ã£o", "aviso");
      return;
    }
    const qty = Number(prompt("Quantidade conferida", "1") || 0);
    if(qty <= 0) return;
    await registerRead(item.code || item.id, qty, true);
  }

  async function pauseLoading(){
    const loading = getLoading(state.selectedStartTruckId);
    loading.status = "pausado";
    loading.pausedAt = nowIso();
    getExpedition().status = "pausado";
    await saveExpedition();
    renderConferenceModal();
    notify("Carregamento pausado.", "ExpediÃ§Ã£o", "sucesso");
  }

  async function cancelLoading(){
    if(!confirm("Cancelar este carregamento?")) return;
    const loading = getLoading(state.selectedStartTruckId);
    loading.status = "cancelado";
    getExpedition().status = "cancelado";
    await saveExpedition();
    closeConferenceModal();
    render();
  }

  async function finishLoading(){
    const items = truckItems(state.selectedStartTruckId);
    const loading = getLoading(state.selectedStartTruckId);
    const pending = items.some((item) => checkedRemaining(item, loading) > 0);
    if(pending){
      notify("Ainda existem itens pendentes neste caminhÃ£o.", "ExpediÃ§Ã£o", "erro");
      return;
    }
    loading.status = "concluido";
    loading.finalizedAt = nowIso();
    loading.finalizedBy = state.usuarioId || null;

    const allDone = routeTrucks().every((truck) => getLoading(truck.id).status === "concluido");
    getExpedition().status = allDone ? "carregamento_concluido" : "carregamento_em_andamento";
    await saveExpedition();
    closeConferenceModal();
    render();
    notify(allDone ? "Todos os caminhÃµes foram concluÃ­dos. SaÃ­da liberada." : "CaminhÃ£o concluÃ­do.", "ExpediÃ§Ã£o", "sucesso");
  }

  function bindEvents(){
    if(state.bound) return;
    state.bound = true;
    els.expRefreshBtn?.addEventListener("click", init);
    els.expRoutesList?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-exp-route]");
      if(button) await selectRoute(button.dataset.expRoute);
    });
    els.expItemsList?.addEventListener("click", (event) => {
      const row = event.target.closest("[data-exp-item]");
      if(!row) return;
      state.selectedItemId = row.dataset.expItem;
      render();
    });
    els.expTrucksGrid?.addEventListener("click", async (event) => {
      const remove = event.target.closest("[data-exp-remove-item]");
      if(remove){
        state.selectedItemId = remove.dataset.expRemoveItem;
        state.selectedTruckId = remove.dataset.expRemoveTruck;
        await removeFromTruck(true, state.selectedItemId, state.selectedTruckId);
        return;
      }
      const card = event.target.closest("[data-exp-truck]");
      if(card){
        state.selectedTruckId = card.dataset.expTruck;
        render();
      }
    });
    els.expMoveQtyBtn?.addEventListener("click", () => distributeSelected(false));
    els.expMoveAllBtn?.addEventListener("click", () => distributeSelected(true));
    els.expReturnQtyBtn?.addEventListener("click", () => removeFromTruck(false));
    els.expReturnAllBtn?.addEventListener("click", () => removeFromTruck(true));
    els.expStartLoadingBtn?.addEventListener("click", openStartModal);
    document.querySelectorAll("[data-exp-close-start]").forEach((button) => button.addEventListener("click", closeStartModal));
    document.querySelectorAll("[data-exp-close-conference]").forEach((button) => button.addEventListener("click", closeConferenceModal));
    els.expStartTrucks?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-exp-start-truck]");
      if(!card) return;
      state.selectedStartTruckId = card.dataset.expStartTruck;
      renderStartModal();
    });
    els.expOpenConferenceBtn?.addEventListener("click", openConferenceModal);
    els.expConferenceItems?.addEventListener("click", (event) => {
      const row = event.target.closest("[data-exp-check-item]");
      if(!row) return;
      state.selectedCheckItemId = row.dataset.expCheckItem;
      renderConferenceModal();
    });
    els.expScanInput?.addEventListener("keydown", async (event) => {
      if(event.key !== "Enter") return;
      event.preventDefault();
      const code = els.expScanInput.value.trim();
      els.expScanInput.value = "";
      if(code) await registerRead(code, 1, false);
    });
    els.expFocusScanBtn?.addEventListener("click", () => els.expScanInput?.focus());
    els.expManualCheckBtn?.addEventListener("click", manualCheck);
    els.expPauseLoadingBtn?.addEventListener("click", pauseLoading);
    els.expCancelLoadingBtn?.addEventListener("click", cancelLoading);
    els.expFinishLoadingBtn?.addEventListener("click", finishLoading);
  }

  async function init(){
    state.destroyed = false;
    state.supabase = window.supabaseClient || null;
    state.empresaId = window.__CONTEXT?.empresa_id || null;
    state.usuarioId = window.__CONTEXT?.usuario_id || window.__USER?.id || null;
    state.usuarioNome = window.__CONTEXT?.usuario_nome || window.__USER?.email || "";
    cacheEls();
    bindEvents();
    loadRoutes();
    loadTeams();
    await Promise.all([loadTrucksCatalog(), loadEmployees(), loadExpeditions()]);
    await loadRouteDetails();
    const routes = routesReadyForExpedition();
    state.selectedRouteId = state.selectedRouteId && routes.some((route) => route.id === state.selectedRouteId)
      ? state.selectedRouteId
      : routes[0]?.id || null;
    if(state.selectedRouteId){
      state.selectedTruckId = routeTrucks(getRoute(state.selectedRouteId))[0]?.id || null;
      state.currentItems = await loadSelectedRouteItems();
    }else{
      state.currentItems = [];
    }
    render();
    window.finalizarCarregamentoModulo?.();
  }

  window.__moduleInit = init;
  window.__activeModuleDestroy = function destroyExpedicao(){
    state.destroyed = true;
  };
})();
