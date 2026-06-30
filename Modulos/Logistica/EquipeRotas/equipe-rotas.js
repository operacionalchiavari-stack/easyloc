(function(){
  "use strict";

  const ROUTES_KEY = "easyloc_roteirizacao_rotas";
  const TEAMS_KEY = "easyloc_equipes_rotas";

  const DEFAULT_ROLES = [
    { id: "motorista", name: "Motorista", removable: false },
    { id: "responsavel", name: "Responsavel", removable: false },
    { id: "assistente", name: "Assistente", removable: false },
    { id: "ajudante-01", name: "Ajudante 01", removable: false },
    { id: "ajudante-02", name: "Ajudante 02", removable: false },
    { id: "ajudante-03", name: "Ajudante 03", removable: false },
    { id: "ajudante-04", name: "Ajudante 04", removable: false }
  ];

  const state = {
    supabase: null,
    empresaId: null,
    routes: [],
    routeDetails: new Map(),
    teams: {},
    employees: [],
    selectedRouteId: null,
    routeSearch: "",
    employeeSearch: "",
    filters: {
      date: "",
      type: "",
      status: "",
      truck: ""
    },
    destroyed: false,
    drag: null
  };

  const els = {};
  const googleMapState = {
    map: null,
    markers: [],
    line: null,
    ready: false,
    loading: false
  };

  function $(id){
    return document.getElementById(id);
  }

  function cacheEls(){
    [
      "equipeRotasPage",
      "teamRouteRefreshBtn",
      "teamFilterDate",
      "teamFilterType",
      "teamFilterStatus",
      "teamFilterTruck",
      "teamFilterBtn",
      "teamRoutesAvailableCount",
      "teamRoutesAvailableList",
      "teamRouteSearch",
      "teamSelectedRouteName",
      "teamSelectedRouteDate",
      "teamSelectedRouteTime",
      "teamSelectedRouteTruck",
      "teamRouteMapShell",
      "teamRouteGoogleMap",
      "teamRouteMapEmpty",
      "teamRouteFallbackLine",
      "teamRouteFallbackPoints",
      "teamRouteOrdersCount",
      "teamRouteOrdersBody",
      "teamDropZones",
      "teamAddRoleBtn",
      "teamClearBtn",
      "teamSaveBtn",
      "teamRoutesAssignedCount",
      "teamRoutesAssignedList",
      "teamEmployeesCount",
      "teamEmployeeSearch",
      "teamEmployeesList",
      "teamRoleModal",
      "teamRoleModalClose",
      "teamRoleCancel",
      "teamRoleAdd",
      "teamRoleName",
      "teamRoleQuantity"
    ].forEach((id) => {
      els[id] = $(id);
    });
  }

  function escapeHtml(value){
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeText(value){
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function parseJson(value, fallback){
    if(!value) return fallback;
    if(typeof value === "object") return value;
    try{
      return JSON.parse(value);
    }catch{
      return fallback;
    }
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

  function dateKey(value){
    if(!value) return "";
    const raw = String(value);
    if(/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const date = new Date(raw);
    if(Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function formatDateTime(value){
    if(!value) return "-";
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function formatTime(value){
    if(!value) return "-";
    if(/^\d{2}:\d{2}/.test(String(value))) return String(value).slice(0, 5);
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return "-";
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function notify(message, title = "Equipe das Rotas", type = "info"){
    if(typeof window.alerta === "function"){
      window.alerta(message, title, type);
      return;
    }
    console.log(`[${title}] ${message}`);
  }

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
      if(isMissingTable(error)){
        console.warn(`[EquipeRotas] Tabela/campo indisponivel: ${table}`, error);
        return null;
      }
      throw error;
    }
    return data || [];
  }

  function loadRoutes(){
    const parsed = parseJson(localStorage.getItem(ROUTES_KEY), []);
    state.routes = Array.isArray(parsed)
      ? parsed.filter((route) => route && route.id).map(normalizeRoute)
      : [];
  }

  function normalizeRoute(route, index){
    const sequence = Array.isArray(route.sequence) ? route.sequence.map((id) => String(id)) : [];
    const createdAt = route.createdAt || route.criado_em || route.created_at || new Date().toISOString();
    return {
      ...route,
      id: String(route.id),
      name: route.name || `Rota ${String(index + 1).padStart(2, "0")}`,
      number: route.numero || route.number || String(index + 1).padStart(2, "0"),
      deliveries: Number(route.deliveries || route.pedidos || sequence.length || 0),
      truck: route.truck || route.caminhao || "Caminhao nao definido",
      volume: Number(route.volume || route.cubagem || 0),
      distance: Number(route.distance || route.distancia || 0),
      duration: route.duration || route.duracao || "-",
      sequence,
      createdAt
    };
  }

  function loadTeams(){
    const parsed = parseJson(localStorage.getItem(TEAMS_KEY), {});
    state.teams = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }

  function saveTeams(){
    const normalized = {};
    Object.entries(state.teams).forEach(([routeId, team]) => {
      const roles = Array.isArray(team?.roles) ? team.roles : [];
      const hasMembers = roles.some((role) => role.employeeId);
      const hasCustom = roles.some((role) => role.removable);
      if(hasMembers || hasCustom){
        normalized[routeId] = {
          ...team,
          routeId,
          roles,
          updatedAt: new Date().toISOString()
        };
      }
    });
    state.teams = normalized;
    localStorage.setItem(TEAMS_KEY, JSON.stringify(state.teams));
  }

  function defaultTeam(routeId){
    return {
      routeId,
      roles: DEFAULT_ROLES.map((role) => ({ ...role, employeeId: null })),
      expeditionSentAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: null
    };
  }

  function getTeam(routeId){
    const id = String(routeId || "");
    if(!id) return null;

    const existing = state.teams[id];
    const baseRoles = DEFAULT_ROLES.map((role) => ({ ...role, employeeId: null }));
    const roles = Array.isArray(existing?.roles) ? existing.roles : [];
    const merged = baseRoles.map((role) => {
      const found = roles.find((item) => item.id === role.id);
      return found ? { ...role, ...found, removable: false } : role;
    });
    const custom = roles.filter((role) => role.removable && !merged.some((item) => item.id === role.id));

    state.teams[id] = {
      ...defaultTeam(id),
      ...existing,
      roles: [...merged, ...custom]
    };

    return state.teams[id];
  }

  function routeHasTeam(routeId){
    const team = state.teams[String(routeId || "")];
    return Array.isArray(team?.roles) && team.roles.some((role) => role.employeeId);
  }

  function selectedRoute(){
    return state.routes.find((route) => route.id === state.selectedRouteId) || null;
  }

  function selectedRouteDetails(){
    const route = selectedRoute();
    if(!route) return [];
    return state.routeDetails.get(route.id) || [];
  }

  async function loadEmployees(){
    state.supabase = window.supabaseClient || null;
    state.empresaId = window.__CONTEXT?.empresa_id || null;
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

      state.employees = Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    }catch(error){
      console.error("[EquipeRotas] erro ao carregar funcionarios:", error);
      state.employees = [];
    }
  }

  function normalizeEmployee(row, source){
    const rawId = String(row.id || row.uuid || row.codigo || `${source}-${Math.random()}`);
    const name = row.nome_completo || row.nome || row.name || row.apelido || "Funcionario";
    return {
      id: `${source}:${rawId}`,
      rawId,
      source,
      name,
      role: row.funcao || row.cargo || row.setor || "Equipe",
      phone: row.telefone || row.celular || "",
      photo: row.foto_url || row.avatar_url || row.foto || row.imagem_url || "",
      statusRaw: row.status || row.situacao || "Disponivel",
      raw: row
    };
  }

  async function loadRouteDetails(){
    state.routeDetails = new Map();
    if(!state.routes.length) return;
    if(!state.supabase || !state.empresaId){
      state.routes.forEach((route) => state.routeDetails.set(route.id, fallbackRouteDetails(route)));
      return;
    }

    const ids = [...new Set(state.routes.flatMap((route) => route.sequence || []).map(String).filter(Boolean))];
    if(!ids.length){
      state.routes.forEach((route) => state.routeDetails.set(route.id, fallbackRouteDetails(route)));
      return;
    }

    try{
      const pedidos = await safeSelect("separacoes_pedidos", "*", {
        in: { field: "id", values: ids },
        order: { field: "data_entrega", ascending: true }
      });
      const pedidoRows = Array.isArray(pedidos) ? pedidos : [];
      const pedidoMap = new Map(pedidoRows.map((pedido) => [String(pedido.id), pedido]));
      const localIds = [...new Set(pedidoRows.map((pedido) => pedido.local_id).filter(Boolean).map(String))];
      const locais = localIds.length
        ? await safeSelect("locais_empresas", "id,nome_razao,endereco,numero_endereco,ponto_referencia,latitude,longitude,tags", {
          in: { field: "id", values: localIds }
        })
        : [];
      const localMap = new Map((Array.isArray(locais) ? locais : []).map((local) => [String(local.id), local]));

      state.routes.forEach((route) => {
        const details = route.sequence.map((id, index) => {
          const pedido = pedidoMap.get(String(id));
          if(!pedido) return fallbackDelivery(route, id, index);
          return normalizeDeliveryFromPedido(route, pedido, localMap.get(String(pedido.local_id || "")), index);
        });
        state.routeDetails.set(route.id, details);
      });
    }catch(error){
      console.error("[EquipeRotas] erro ao carregar detalhes das rotas:", error);
      state.routes.forEach((route) => state.routeDetails.set(route.id, fallbackRouteDetails(route)));
    }
  }

  function fallbackRouteDetails(route){
    return (route.sequence || []).map((id, index) => fallbackDelivery(route, id, index));
  }

  function fallbackDelivery(route, id, index){
    const point = deterministicPoint(index);
    return {
      id: String(id),
      pedidoId: String(id),
      number: String(index + 1).padStart(3, "0"),
      cliente: "Cliente nao carregado",
      event: "Evento",
      local: route.name,
      address: "Endereco nao carregado",
      date: route.createdAt,
      time: "08:00",
      volume: 0,
      lat: null,
      lng: null,
      x: point.x,
      y: point.y
    };
  }

  function normalizeDeliveryFromPedido(route, pedido, local, index){
    const obs = parseJson(pedido.observacoes, {});
    const point = deterministicPoint(index);
    const lat = Number(local?.latitude ?? obs.local_latitude ?? obs.latitude);
    const lng = Number(local?.longitude ?? obs.local_longitude ?? obs.longitude);
    const endereco = [
      local?.endereco || obs.local_endereco || pedido.local_endereco || pedido.endereco || pedido.local_nome,
      local?.numero_endereco ? `, ${local.numero_endereco}` : ""
    ].join("").trim();

    return {
      id: String(pedido.id),
      pedidoId: pedido.id,
      number: getPedidoNumero(pedido),
      cliente: pedido.cliente_nome || pedido.cliente || "Cliente",
      event: pedido.tipo_evento || pedido.evento || "Evento",
      local: pedido.local_nome || local?.nome_razao || "Local",
      address: endereco || "Endereco nao informado",
      date: dataBasePedido(pedido) || route.createdAt,
      time: horaPedido(pedido) || "08:00",
      volume: Number(pedido.volume_total || 0),
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      x: point.x,
      y: point.y,
      raw: pedido
    };
  }

  function getPedidoNumero(pedido){
    return pedido?.numero_pedido || pedido?.numero || pedido?.codigo || String(pedido?.id || "").slice(0, 6) || "-";
  }

  function dataBasePedido(pedido){
    return pedido?.data_entrega || pedido?.data_evento || pedido?.data_hora || pedido?.data_coleta || pedido?.created_at || pedido?.criado_em || "";
  }

  function horaPedido(pedido){
    const direct = pedido?.hora_entrega || pedido?.horario_entrega || pedido?.hora_evento || "";
    if(direct) return formatTime(direct);
    const data = dataBasePedido(pedido);
    return String(data || "").includes("T") ? formatTime(data) : "";
  }

  function deterministicPoint(index){
    const points = [
      { x: 38, y: 20 }, { x: 56, y: 34 }, { x: 48, y: 76 }, { x: 24, y: 62 },
      { x: 18, y: 42 }, { x: 31, y: 24 }, { x: 66, y: 18 }, { x: 82, y: 38 },
      { x: 72, y: 64 }, { x: 60, y: 84 }, { x: 28, y: 48 }, { x: 12, y: 28 }
    ];
    return points[index % points.length];
  }

  function routeDate(route){
    const first = (state.routeDetails.get(route.id) || [])[0];
    return first?.date || route.createdAt;
  }

  function routeTime(route){
    const first = (state.routeDetails.get(route.id) || [])[0];
    return first?.time || "08:00";
  }

  function routeLocationsCount(route){
    const details = state.routeDetails.get(route.id) || [];
    const unique = new Set(details.map((item) => item.local || item.address).filter(Boolean));
    return unique.size || details.length || route.deliveries || 0;
  }

  function routeSearchText(route){
    const details = state.routeDetails.get(route.id) || [];
    return normalizeText([
      route.name,
      route.truck,
      details.map((item) => `${item.number} ${item.cliente} ${item.local} ${item.address}`).join(" ")
    ].join(" "));
  }

  function routeType(route){
    const details = state.routeDetails.get(route.id) || [];
    const events = uniqueValues(details.map((item) => item.event)).filter((event) => event && event !== "Evento");
    if(events.length) return events[0];
    const parts = String(route.name || "").split("-");
    return (parts[1] || parts[0] || "Rota").trim();
  }

  function routePassesFilters(route, statusKey){
    const filterDate = state.filters.date;
    const filterType = normalizeText(state.filters.type);
    const filterStatus = state.filters.status;
    const filterTruck = normalizeText(state.filters.truck);

    if(filterStatus && filterStatus !== statusKey) return false;
    if(filterDate && dateKey(routeDate(route)) !== filterDate) return false;
    if(filterType && normalizeText(routeType(route)) !== filterType) return false;
    if(filterTruck && normalizeText(route.truck) !== filterTruck) return false;
    return true;
  }

  function filteredAvailableRoutes(){
    const query = normalizeText(state.routeSearch);
    return state.routes.filter((route) => {
      if(routeHasTeam(route.id)) return false;
      if(!routePassesFilters(route, "sem-equipe")) return false;
      return !query || routeSearchText(route).includes(query);
    });
  }

  function routesWithTeam(){
    return state.routes.filter((route) => routeHasTeam(route.id) && routePassesFilters(route, "com-equipe"));
  }

  function employeeAssignedRoute(employeeId){
    const id = String(employeeId || "");
    for(const [routeId, team] of Object.entries(state.teams)){
      const role = (team.roles || []).find((item) => item.employeeId === id);
      if(role) return routeId;
    }
    return null;
  }

  function employeeStatus(employee){
    const assignedRoute = employeeAssignedRoute(employee.id);
    if(assignedRoute && assignedRoute !== state.selectedRouteId) return { label: "Alocado", key: "alocado", available: false };
    if(assignedRoute && assignedRoute === state.selectedRouteId) return { label: "Alocado", key: "alocado", available: false };

    const status = normalizeText(employee.statusRaw);
    if(!status || status.includes("ativo") || status.includes("disponivel") || status.includes("dispon")) {
      return { label: "Disponivel", key: "disponivel", available: true };
    }
    if(status.includes("folga")) return { label: "Folga", key: "bloqueado", available: false };
    if(status.includes("ferias")) return { label: "Ferias", key: "bloqueado", available: false };
    if(status.includes("afast")) return { label: "Afastado", key: "bloqueado", available: false };
    if(status.includes("trein")) return { label: "Treinamento", key: "bloqueado", available: false };
    if(status.includes("inativo") || status.includes("indispon")) return { label: "Indisponivel", key: "bloqueado", available: false };
    return { label: employee.statusRaw || "Indisponivel", key: "bloqueado", available: false };
  }

  function filteredEmployees(){
    const query = normalizeText(state.employeeSearch);
    return state.employees.filter((employee) => {
      const haystack = normalizeText(`${employee.name} ${employee.role} ${employee.phone} ${employeeStatus(employee).label}`);
      return !query || haystack.includes(query);
    });
  }

  function render(){
    if(state.destroyed) return;
    if(!state.selectedRouteId || !state.routes.some((route) => route.id === state.selectedRouteId)){
      state.selectedRouteId = filteredAvailableRoutes()[0]?.id || routesWithTeam()[0]?.id || state.routes[0]?.id || null;
    }

    renderAvailableRoutes();
    renderAssignedRoutes();
    renderSelectedRoute();
    renderEmployees();
    hydrateFilters();
    window.lucide?.createIcons?.();
  }

  function hydrateFilters(){
    hydrateSelect(els.teamFilterType, uniqueValues(state.routes.map(routeType)).sort((a, b) => a.localeCompare(b, "pt-BR")), "Todas", state.filters.type);
    hydrateSelect(els.teamFilterTruck, uniqueValues(state.routes.map((route) => route.truck).filter(Boolean)).sort((a, b) => a.localeCompare(b, "pt-BR")), "Todos", state.filters.truck);
  }

  function hydrateSelect(select, values, firstLabel, selectedValue){
    if(!select) return;
    const firstValue = "";
    const current = selectedValue || select.value || "";
    const html = `<option value="${firstValue}">${escapeHtml(firstLabel)}</option>` +
      values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
    if(select.dataset.lastHtml === html) return;
    select.innerHTML = html;
    select.value = values.includes(current) ? current : "";
    select.dataset.lastHtml = html;
  }

  function renderAvailableRoutes(){
    const routes = filteredAvailableRoutes();
    if(els.teamRoutesAvailableCount) els.teamRoutesAvailableCount.textContent = routes.length;
    if(!els.teamRoutesAvailableList) return;

    if(!routes.length){
      els.teamRoutesAvailableList.innerHTML = `<div class="team-empty">Nenhuma rota disponivel sem equipe.</div>`;
      return;
    }

    els.teamRoutesAvailableList.innerHTML = routes.map((route) => routeCardTemplate(route)).join("");
  }

  function routeCardTemplate(route){
    const details = state.routeDetails.get(route.id) || [];
    const clientes = uniqueValues(details.map((item) => item.cliente));
    const pedidos = uniqueValues(details.map((item) => `#${item.number}`));
    const selected = route.id === state.selectedRouteId ? " is-selected" : "";
    return `
      <button type="button" class="team-route-card${selected}" data-route-select="${escapeHtml(route.id)}">
        <div class="team-route-card-top">
          <h3>${escapeHtml(route.name)}</h3>
          <span class="team-route-number">#${escapeHtml(route.number)}</span>
        </div>
        <div class="team-route-metrics">
          <span><i data-lucide="clipboard-list"></i>${Number(route.deliveries || details.length || 0)} pedidos</span>
          <span><i data-lucide="map-pin"></i>${routeLocationsCount(route)} locais</span>
          <span><i data-lucide="route"></i>${formatNumber(route.distance)} km</span>
          <span><i data-lucide="clock-3"></i>${escapeHtml(route.duration || "-")}</span>
          <span><i data-lucide="truck"></i>${escapeHtml(route.truck || "-")}</span>
          <span><i data-lucide="calendar-days"></i>${formatDate(routeDate(route))}</span>
        </div>
        <div class="team-route-tags">
          ${chipsTemplate(pedidos, 3)}
          ${chipsTemplate(clientes, 2)}
        </div>
      </button>
    `;
  }

  function chipsTemplate(items, limit){
    const visible = items.slice(0, limit);
    const more = items.length - visible.length;
    return `${visible.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}${more > 0 ? `<span>+${more}</span>` : ""}`;
  }

  function uniqueValues(values){
    return [...new Set(values.filter(Boolean).map(String))];
  }

  function renderAssignedRoutes(){
    const routes = routesWithTeam();
    if(els.teamRoutesAssignedCount) els.teamRoutesAssignedCount.textContent = routes.length;
    if(!els.teamRoutesAssignedList) return;

    if(!routes.length){
      els.teamRoutesAssignedList.innerHTML = `<div class="team-empty">Nenhuma rota com equipe salva.</div>`;
      return;
    }

    els.teamRoutesAssignedList.innerHTML = routes.map((route) => assignedRouteTemplate(route)).join("");
  }

  function assignedRouteTemplate(route){
    const team = getTeam(route.id);
    const members = (team.roles || [])
      .map((role) => findEmployee(role.employeeId))
      .filter(Boolean);
    const driver = (team.roles || []).find((role) => role.id === "motorista")?.employeeId;
    const selected = route.id === state.selectedRouteId ? " is-selected" : "";
    return `
      <button type="button" class="team-assigned-card${selected}" data-route-team-select="${escapeHtml(route.id)}">
        <div class="team-assigned-top">
          <h3>${escapeHtml(route.name)}</h3>
          <span class="team-route-number">#${escapeHtml(route.number)}</span>
        </div>
        <div class="team-assigned-info">
          <span>Motorista: ${escapeHtml(findEmployee(driver)?.name || "-")}</span>
          <span>${members.length} ${members.length === 1 ? "integrante" : "integrantes"}</span>
        </div>
        <div class="team-assigned-people">
          ${members.slice(0, 5).map((employee) => avatarTemplate(employee, "team-mini-avatar")).join("")}
          ${members.length > 5 ? `<span class="team-mini-avatar">+${members.length - 5}</span>` : ""}
        </div>
      </button>
    `;
  }

  function renderSelectedRoute(){
    const route = selectedRoute();
    const details = selectedRouteDetails();

    if(els.teamSelectedRouteName) els.teamSelectedRouteName.textContent = route?.name || "Selecione uma rota";
    if(els.teamSelectedRouteDate) els.teamSelectedRouteDate.textContent = route ? formatDate(routeDate(route)) : "-";
    if(els.teamSelectedRouteTime) els.teamSelectedRouteTime.textContent = route ? routeTime(route) : "-";
    if(els.teamSelectedRouteTruck) els.teamSelectedRouteTruck.textContent = route?.truck || "-";
    if(els.teamRouteOrdersCount) els.teamRouteOrdersCount.textContent = details.length;

    renderMap(route, details);
    renderOrders(details);
    renderDropZones(route);
  }

  function renderOrders(details){
    if(!els.teamRouteOrdersBody) return;
    if(!details.length){
      els.teamRouteOrdersBody.innerHTML = `
        <tr>
          <td colspan="3">Nenhum pedido carregado para esta rota.</td>
        </tr>
      `;
      return;
    }

    els.teamRouteOrdersBody.innerHTML = details.map((item, index) => `
      <tr>
        <td><span class="team-order-index">${index + 1}</span>#${escapeHtml(item.number)}</td>
        <td>
          <strong>${escapeHtml(item.cliente)}</strong><br>
          <small>${escapeHtml(item.event)} - ${escapeHtml(item.local)}</small>
        </td>
        <td>${escapeHtml(item.address)}</td>
      </tr>
    `).join("");
  }

  function renderDropZones(route){
    if(!els.teamDropZones) return;
    if(!route){
      els.teamDropZones.innerHTML = `<div class="team-empty">Selecione uma rota para montar a equipe.</div>`;
      return;
    }

    const team = getTeam(route.id);
    els.teamDropZones.innerHTML = team.roles.map((role) => {
      const employee = findEmployee(role.employeeId);
      return `
        <section class="team-role-card" data-team-drop-role="${escapeHtml(role.id)}">
          <header class="team-role-head">
            <strong>${escapeHtml(role.name)}</strong>
            ${role.removable
              ? `<button type="button" class="team-role-remove" data-remove-role="${escapeHtml(role.id)}" title="Remover cargo"><i data-lucide="trash-2"></i></button>`
              : ""}
          </header>
          ${employee ? `
            <div class="team-role-person">
              ${avatarTemplate(employee)}
              <div>
                <span class="team-person-name">${escapeHtml(employee.name)}</span>
                <span class="team-person-role">${escapeHtml(employee.role)}</span>
              </div>
              <button type="button" class="team-role-clear" data-clear-role="${escapeHtml(role.id)}" title="Remover funcionario">
                <i data-lucide="x"></i>
              </button>
            </div>
          ` : `<div class="team-role-empty">Arraste um funcionario aqui</div>`}
        </section>
      `;
    }).join("");
  }

  function renderEmployees(){
    const employees = filteredEmployees();
    if(els.teamEmployeesCount) els.teamEmployeesCount.textContent = employees.length;
    if(!els.teamEmployeesList) return;

    if(!employees.length){
      els.teamEmployeesList.innerHTML = `<div class="team-empty">Nenhum funcionario encontrado.</div>`;
      return;
    }

    els.teamEmployeesList.innerHTML = employees.map(employeeTemplate).join("");
  }

  function employeeTemplate(employee){
    const status = employeeStatus(employee);
    const disabled = !status.available ? `aria-disabled="true"` : "";
    const draggable = status.available ? `draggable="true"` : "";
    return `
      <article class="team-employee-card" data-team-employee="${escapeHtml(employee.id)}" ${draggable} ${disabled}>
        ${avatarTemplate(employee)}
        <div>
          <span class="team-person-name">${escapeHtml(employee.name)}</span>
          <span class="team-person-role">${escapeHtml(employee.role)}</span>
        </div>
        <span class="team-status ${escapeHtml(status.key)}">${escapeHtml(status.label)}</span>
      </article>
    `;
  }

  function avatarTemplate(employee, className = "team-avatar"){
    if(!employee) return `<span class="${className}">?</span>`;
    if(employee.photo){
      return `<span class="${className}"><img src="${escapeHtml(employee.photo)}" alt="${escapeHtml(employee.name)}"></span>`;
    }
    return `<span class="${className}">${escapeHtml(initials(employee.name))}</span>`;
  }

  function initials(name){
    const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] || "?").toUpperCase() + (parts[1]?.[0] || "").toUpperCase();
  }

  function findEmployee(employeeId){
    if(!employeeId) return null;
    return state.employees.find((employee) => employee.id === employeeId) || null;
  }

  async function renderMap(route, details){
    if(!els.teamRouteMapShell) return;
    const valid = details.filter((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)));

    if(!route){
      clearGoogleMap();
      renderFallbackMap([]);
      els.teamRouteMapShell.classList.remove("has-google");
      if(els.teamRouteMapEmpty) els.teamRouteMapEmpty.hidden = false;
      return;
    }

    if(els.teamRouteMapEmpty) els.teamRouteMapEmpty.hidden = details.length > 0;
    renderFallbackMap(details);

    if(!valid.length){
      clearGoogleMap();
      els.teamRouteMapShell.classList.remove("has-google");
      return;
    }

    try{
      await ensureGoogleMap(valid[0]);
      if(!googleMapState.ready) return;
      updateGoogleMap(valid);
      els.teamRouteMapShell.classList.add("has-google");
    }catch(error){
      console.warn("[EquipeRotas] Google Maps indisponivel:", error);
      els.teamRouteMapShell.classList.remove("has-google");
    }
  }

  async function ensureGoogleMap(firstPoint){
    if(googleMapState.ready) return;
    if(googleMapState.loading) return;
    googleMapState.loading = true;

    if(!window.google?.maps && typeof window.carregarGooglePlaces === "function"){
      await window.carregarGooglePlaces();
    }

    if(!window.google?.maps || !els.teamRouteGoogleMap){
      googleMapState.loading = false;
      return;
    }

    googleMapState.map = new google.maps.Map(els.teamRouteGoogleMap, {
      center: { lat: Number(firstPoint.lat), lng: Number(firstPoint.lng) },
      zoom: 11,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      gestureHandling: "greedy"
    });
    googleMapState.ready = true;
    googleMapState.loading = false;
  }

  function updateGoogleMap(points){
    clearGoogleMap();
    if(!googleMapState.map) return;
    const bounds = new google.maps.LatLngBounds();
    const path = points.map((point, index) => {
      const position = { lat: Number(point.lat), lng: Number(point.lng) };
      bounds.extend(position);
      googleMapState.markers.push(new google.maps.Marker({
        position,
        map: googleMapState.map,
        label: {
          text: String(index + 1),
          color: "#ffffff",
          fontSize: "12px",
          fontWeight: "700"
        },
        title: `#${point.number} - ${point.cliente}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 13,
          fillColor: "#2563eb",
          fillOpacity: 1,
          strokeWeight: 3,
          strokeColor: "#ffffff"
        }
      }));
      return position;
    });

    if(path.length > 1){
      googleMapState.line = new google.maps.Polyline({
        path,
        map: googleMapState.map,
        strokeColor: "#2563eb",
        strokeOpacity: .86,
        strokeWeight: 4
      });
    }

    googleMapState.map.fitBounds(bounds);
    if(path.length === 1) googleMapState.map.setZoom(14);
  }

  function clearGoogleMap(){
    googleMapState.markers.forEach((marker) => marker.setMap(null));
    googleMapState.markers = [];
    if(googleMapState.line){
      googleMapState.line.setMap(null);
      googleMapState.line = null;
    }
  }

  function renderFallbackMap(details){
    if(els.teamRouteFallbackLine){
      const points = details.map((item) => `${item.x},${item.y}`).join(" ");
      els.teamRouteFallbackLine.innerHTML = points ? `<polyline points="${points}"></polyline>` : "";
    }
    if(els.teamRouteFallbackPoints){
      els.teamRouteFallbackPoints.innerHTML = details.map((item, index) => `
        <span class="team-map-point" style="left:${Number(item.x || 50)}%;top:${Number(item.y || 50)}%">${index + 1}</span>
      `).join("");
    }
  }

  function assignEmployee(roleId, employeeId){
    const route = selectedRoute();
    if(!route) return;
    const employee = findEmployee(employeeId);
    if(!employee) return;
    const status = employeeStatus(employee);
    if(!status.available && employeeAssignedRoute(employee.id) !== route.id){
      notify("Funcionario indisponivel para esta rota.", "Equipe das Rotas", "erro");
      return;
    }

    const team = getTeam(route.id);
    team.roles.forEach((role) => {
      if(role.employeeId === employee.id) role.employeeId = null;
    });
    const role = team.roles.find((item) => item.id === roleId);
    if(role) role.employeeId = employee.id;
    team.updatedAt = new Date().toISOString();
    render();
  }

  function clearRole(roleId){
    const route = selectedRoute();
    if(!route) return;
    const team = getTeam(route.id);
    const role = team.roles.find((item) => item.id === roleId);
    if(role) role.employeeId = null;
    team.updatedAt = new Date().toISOString();
    render();
  }

  function removeRole(roleId){
    const route = selectedRoute();
    if(!route) return;
    const team = getTeam(route.id);
    team.roles = team.roles.filter((role) => role.id !== roleId || !role.removable);
    team.updatedAt = new Date().toISOString();
    render();
  }

  function clearCurrentTeam(){
    const route = selectedRoute();
    if(!route) return;
    state.teams[route.id] = defaultTeam(route.id);
    render();
  }

  function openRoleModal(){
    if(!selectedRoute()){
      notify("Selecione uma rota antes de adicionar cargos.", "Equipe das Rotas", "erro");
      return;
    }
    if(els.teamRoleName) els.teamRoleName.value = "";
    if(els.teamRoleQuantity) els.teamRoleQuantity.value = "1";
    if(els.teamRoleModal) els.teamRoleModal.hidden = false;
    setTimeout(() => els.teamRoleName?.focus(), 40);
  }

  function closeRoleModal(){
    if(els.teamRoleModal) els.teamRoleModal.hidden = true;
  }

  function addRoleFromModal(){
    const route = selectedRoute();
    if(!route) return;
    const name = (els.teamRoleName?.value || "").trim();
    const quantity = Math.max(1, Math.min(20, Number(els.teamRoleQuantity?.value || 1)));
    if(!name){
      notify("Informe o nome do cargo.", "Equipe das Rotas", "erro");
      return;
    }
    const team = getTeam(route.id);
    const stamp = Date.now();
    for(let index = 1; index <= quantity; index += 1){
      const suffix = quantity > 1 ? ` ${String(index).padStart(2, "0")}` : "";
      team.roles.push({
        id: `custom-${stamp}-${index}`,
        name: `${name}${suffix}`,
        removable: true,
        employeeId: null
      });
    }
    team.updatedAt = new Date().toISOString();
    closeRoleModal();
    render();
  }

  function saveCurrentTeam(){
    const route = selectedRoute();
    if(!route){
      notify("Selecione uma rota para salvar.", "Equipe das Rotas", "erro");
      return;
    }
    saveTeams();
    render();
    notify("Equipe salva com sucesso.", "Equipe das Rotas", "sucesso");
  }

  function sendToExpedition(){
    const route = selectedRoute();
    if(!route) return;
    const team = getTeam(route.id);
    const hasMembers = team.roles.some((role) => role.employeeId);
    if(!hasMembers){
      notify("Monte a equipe antes de enviar para Expedicao.", "Equipe das Rotas", "erro");
      return;
    }
    team.expeditionSentAt = new Date().toISOString();
    saveTeams();
    render();
    notify("Rota enviada para Expedicao.", "Equipe das Rotas", "sucesso");
  }

  function printCurrentRoute(){
    const route = selectedRoute();
    if(!route){
      notify("Selecione uma rota para visualizar.", "Equipe das Rotas", "erro");
      return;
    }
    const details = selectedRouteDetails();
    const team = getTeam(route.id);
    const popup = window.open("", "_blank", "width=920,height=760");
    if(!popup){
      window.print();
      return;
    }
    popup.document.write(`
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <title>${escapeHtml(route.name)}</title>
          <style>
            body{font-family:Arial,sans-serif;color:#1f2937;margin:32px}
            h1{margin:0 0 8px;font-size:28px}
            h2{margin:24px 0 10px;font-size:18px}
            table{width:100%;border-collapse:collapse;margin-top:8px}
            th,td{border:1px solid #e5e7eb;padding:10px;text-align:left;font-size:13px}
            th{background:#f3f4f6}
            .meta{color:#6b7280;margin-bottom:18px}
            .team{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
            .role{border:1px solid #e5e7eb;border-radius:12px;padding:10px}
            .role strong{display:block}
          </style>
        </head>
        <body>
          <h1>${escapeHtml(route.name)}</h1>
          <div class="meta">${formatDate(routeDate(route))} - ${escapeHtml(route.truck || "-")}</div>
          <h2>Pedidos</h2>
          <table>
            <thead><tr><th>Ordem</th><th>Pedido</th><th>Cliente</th><th>Endereco</th></tr></thead>
            <tbody>
              ${details.map((item, index) => `<tr><td>${index + 1}</td><td>#${escapeHtml(item.number)}</td><td>${escapeHtml(item.cliente)}</td><td>${escapeHtml(item.address)}</td></tr>`).join("")}
            </tbody>
          </table>
          <h2>Equipe</h2>
          <div class="team">
            ${team.roles.map((role) => `<div class="role"><strong>${escapeHtml(role.name)}</strong><span>${escapeHtml(findEmployee(role.employeeId)?.name || "-")}</span></div>`).join("")}
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    popup.document.close();
  }

  function exportCurrentRouteCsv(){
    const route = selectedRoute();
    if(!route){
      notify("Selecione uma rota para exportar.", "Equipe das Rotas", "erro");
      return;
    }
    const details = selectedRouteDetails();
    const team = getTeam(route.id);
    const lines = [
      ["Rota", route.name],
      ["Data", formatDate(routeDate(route))],
      ["Caminhao", route.truck || "-"],
      [],
      ["Ordem", "Pedido", "Cliente", "Local", "Endereco"],
      ...details.map((item, index) => [index + 1, `#${item.number}`, item.cliente, item.local, item.address]),
      [],
      ["Cargo", "Funcionario", "Funcao"],
      ...team.roles.map((role) => {
        const employee = findEmployee(role.employeeId);
        return [role.name, employee?.name || "", employee?.role || ""];
      })
    ];
    const csv = lines.map((line) => line.map(csvCell).join(";")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${route.name.replace(/[\\/:*?"<>|]+/g, "-")}-equipe.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function csvCell(value){
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function bindEvents(){
    els.teamRouteRefreshBtn?.addEventListener("click", async () => {
      await reloadAll();
      notify("Rotas e funcionarios atualizados.", "Equipe das Rotas", "sucesso");
    });

    els.teamRouteSearch?.addEventListener("input", (event) => {
      state.routeSearch = event.target.value || "";
      renderAvailableRoutes();
    });

    els.teamEmployeeSearch?.addEventListener("input", (event) => {
      state.employeeSearch = event.target.value || "";
      renderEmployees();
    });

    [els.teamFilterDate, els.teamFilterType, els.teamFilterStatus, els.teamFilterTruck].forEach((input) => {
      input?.addEventListener("change", () => {
        state.filters.date = els.teamFilterDate?.value || "";
        state.filters.type = els.teamFilterType?.value || "";
        state.filters.status = els.teamFilterStatus?.value || "";
        state.filters.truck = els.teamFilterTruck?.value || "";
        render();
      });
    });

    els.teamFilterBtn?.addEventListener("click", () => {
      state.filters.date = els.teamFilterDate?.value || "";
      state.filters.type = els.teamFilterType?.value || "";
      state.filters.status = els.teamFilterStatus?.value || "";
      state.filters.truck = els.teamFilterTruck?.value || "";
      render();
    });

    els.equipeRotasPage?.addEventListener("click", (event) => {
      const routeBtn = event.target.closest("[data-route-select]");
      if(routeBtn){
        state.selectedRouteId = routeBtn.dataset.routeSelect;
        render();
        return;
      }

      const assignedBtn = event.target.closest("[data-route-team-select]");
      if(assignedBtn){
        state.selectedRouteId = assignedBtn.dataset.routeTeamSelect;
        render();
        return;
      }

      const clearBtn = event.target.closest("[data-clear-role]");
      if(clearBtn){
        clearRole(clearBtn.dataset.clearRole);
        return;
      }

      const removeBtn = event.target.closest("[data-remove-role]");
      if(removeBtn){
        removeRole(removeBtn.dataset.removeRole);
      }
    });

    els.teamAddRoleBtn?.addEventListener("click", openRoleModal);
    els.teamRoleModalClose?.addEventListener("click", closeRoleModal);
    els.teamRoleCancel?.addEventListener("click", closeRoleModal);
    els.teamRoleAdd?.addEventListener("click", addRoleFromModal);
    els.teamRoleModal?.addEventListener("click", (event) => {
      if(event.target === els.teamRoleModal) closeRoleModal();
    });

    els.teamClearBtn?.addEventListener("click", clearCurrentTeam);
    els.teamSaveBtn?.addEventListener("click", saveCurrentTeam);

    const dnd = new TeamDragDrop(els.equipeRotasPage, {
      draggableSelector: "[data-team-employee]",
      dropSelector: "[data-team-drop-role]",
      onDrop: ({ draggable, dropzone }) => {
        assignEmployee(dropzone.dataset.teamDropRole, draggable.dataset.teamEmployee);
      }
    });
    state.drag = dnd;
  }

  class TeamDragDrop {
    constructor(root, options){
      this.root = root;
      this.options = options;
      this.dragging = null;
      this.onDragStart = this.onDragStart.bind(this);
      this.onDragEnd = this.onDragEnd.bind(this);
      this.onDragOver = this.onDragOver.bind(this);
      this.onDragLeave = this.onDragLeave.bind(this);
      this.onDrop = this.onDrop.bind(this);
      this.bind();
    }

    bind(){
      if(!this.root) return;
      this.root.addEventListener("dragstart", this.onDragStart);
      this.root.addEventListener("dragend", this.onDragEnd);
      this.root.addEventListener("dragover", this.onDragOver);
      this.root.addEventListener("dragleave", this.onDragLeave);
      this.root.addEventListener("drop", this.onDrop);
    }

    destroy(){
      if(!this.root) return;
      this.root.removeEventListener("dragstart", this.onDragStart);
      this.root.removeEventListener("dragend", this.onDragEnd);
      this.root.removeEventListener("dragover", this.onDragOver);
      this.root.removeEventListener("dragleave", this.onDragLeave);
      this.root.removeEventListener("drop", this.onDrop);
    }

    onDragStart(event){
      const draggable = event.target.closest(this.options.draggableSelector);
      if(!draggable || draggable.getAttribute("aria-disabled") === "true"){
        event.preventDefault();
        return;
      }
      this.dragging = draggable;
      draggable.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggable.dataset.teamEmployee || "");
    }

    onDragEnd(){
      this.dragging?.classList.remove("dragging");
      this.dragging = null;
      this.root.querySelectorAll(".drag-over").forEach((item) => item.classList.remove("drag-over"));
    }

    onDragOver(event){
      const dropzone = event.target.closest(this.options.dropSelector);
      if(!dropzone || !this.dragging) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      dropzone.classList.add("drag-over");
    }

    onDragLeave(event){
      const dropzone = event.target.closest(this.options.dropSelector);
      if(!dropzone) return;
      const next = event.relatedTarget;
      if(next && dropzone.contains(next)) return;
      dropzone.classList.remove("drag-over");
    }

    onDrop(event){
      const dropzone = event.target.closest(this.options.dropSelector);
      if(!dropzone || !this.dragging) return;
      event.preventDefault();
      dropzone.classList.remove("drag-over");
      this.options.onDrop?.({ draggable: this.dragging, dropzone, event });
    }
  }

  window.EasyLocTeamDragDrop = window.EasyLocTeamDragDrop || TeamDragDrop;

  async function reloadAll(){
    loadRoutes();
    loadTeams();
    await loadEmployees();
    await loadRouteDetails();
    if(!state.selectedRouteId || !state.routes.some((route) => route.id === state.selectedRouteId)){
      state.selectedRouteId = state.routes[0]?.id || null;
    }
    render();
  }

  async function init(){
    try{
      state.destroyed = false;
      document.body.classList.add("equipe-rotas-active");
      cacheEls();
      bindEvents();
      await reloadAll();
    }catch(error){
      console.error("[EquipeRotas] erro no init:", error);
      notify("Nao foi possivel carregar a equipe das rotas.", "Equipe das Rotas", "erro");
    }finally{
      window.finalizarCarregamentoModulo?.();
    }
  }

  window.__moduleInit = init;
  window.__activeModuleDestroy = function(){
    state.destroyed = true;
    document.body.classList.remove("equipe-rotas-active");
    state.drag?.destroy?.();
    clearGoogleMap();
    googleMapState.map = null;
    googleMapState.ready = false;
  };
})();
