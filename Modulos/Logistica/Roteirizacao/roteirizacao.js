(function(){
  "use strict";

  const STORAGE_KEY = "easyloc_roteirizacao_rotas";
  const GALPAO_ORIGEM_PADRAO = "Chiavari Eventos, Estrada Uniao e Industria, Itaipava, Petropolis - RJ, Brasil";
  const CALENDAR_MONTHS = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro"
  ];
  const ROUTE_MARKER_COLORS = {
    delivery: "#2563eb",
    pickup: "#7c3aed",
    warehouse: "#16a34a",
    blocked: "#6b7280"
  };

  const deliveries = [
    { id: 1, title: "Condomínio Sunset", address: "R. Funchal, 123 - Vila Olímpia", window: "08:00 - 08:30", volume: 2.4, x: 49, y: 26, lat: -23.5945, lng: -46.6836, region: "capital", event: "Casamento" },
    { id: 2, title: "Restaurante Le Jardin", address: "Av. dos Bandeirantes, 4567 - Campo Belo", window: "09:00 - 09:30", volume: 2.0, x: 51, y: 41, lat: -23.6265, lng: -46.6720, region: "capital", event: "Corporativo" },
    { id: 3, title: "Buffet Espaço Florescer", address: "R. do Socorro, 789 - Socorro", window: "11:30 - 12:06", volume: 2.8, x: 43, y: 79, lat: -23.6750, lng: -46.7049, region: "zona-sul", event: "Aniversário" },
    { id: 4, title: "Casa de Eventos Mirante", address: "Av. Cupeca, 2100 - Jabaquara", window: "13:15 - 13:45", volume: 1.6, x: 27, y: 61, lat: -23.6485, lng: -46.6408, region: "zona-sul", event: "Casamento" },
    { id: 5, title: "Morumbi Palace", address: "R. Dr. Chibata Miyakoshi, 300 - Morumbi", window: "15:00 - 15:30", volume: 2.0, x: 23, y: 38, lat: -23.6042, lng: -46.7237, region: "zona-oeste", event: "Formatura" },
    { id: 6, title: "Espaco Alto de Pinheiros", address: "R. Cerro Cora, 1150 - Alto de Pinheiros", window: "16:15 - 16:45", volume: 2.0, x: 30, y: 20, lat: -23.5510, lng: -46.7100, region: "zona-oeste", event: "Corporativo" },
    { id: 7, title: "Galeria Pompeia", address: "R. Turiassu, 450 - Perdizes", window: "17:00 - 17:30", volume: 1.3, x: 61, y: 11, lat: -23.5368, lng: -46.6805, region: "zona-oeste", event: "Exposição" },
    { id: 8, title: "Studio Paulista", address: "Al. Santos, 1400 - Jardins", window: "10:30 - 11:00", volume: 1.7, x: 87, y: 38, lat: -23.5634, lng: -46.6544, region: "capital", event: "Editorial" },
    { id: 9, title: "Vila Clementino Hall", address: "R. Borges Lagoa, 991 - Vila Clementino", window: "12:40 - 13:10", volume: 1.9, x: 68, y: 64, lat: -23.5983, lng: -46.6428, region: "capital", event: "Congresso" },
    { id: 10, title: "Ibirapuera Lounge", address: "Av. Republica do Libano, 990 - Moema", window: "14:20 - 14:50", volume: 1.4, x: 62, y: 82, lat: -23.6025, lng: -46.6626, region: "capital", event: "Coquetel" },
    { id: 11, title: "Pinheiros Garden", address: "R. dos Pinheiros, 640 - Pinheiros", window: "09:40 - 10:10", volume: 1.8, x: 29, y: 38, lat: -23.5652, lng: -46.6942, region: "zona-oeste", event: "Casamento" },
    { id: 12, title: "Lapa Eventos", address: "R. Guaicurus, 880 - Lapa", window: "08:50 - 09:20", volume: 1.6, x: 12, y: 16, lat: -23.5227, lng: -46.7042, region: "zona-oeste", event: "Corporativo" },
    { id: 13, title: "Chácara Interlagos", address: "Av. Interlagos, 4100 - Interlagos", window: "13:20 - 13:50", volume: 2.3, x: 11, y: 50, lat: -23.7057, lng: -46.6992, region: "zona-sul", event: "Infantil" },
    { id: 14, title: "Espaço Saúde", address: "R. Domingos de Morais, 2200 - Saúde", window: "15:20 - 15:50", volume: 1.1, x: 78, y: 49, lat: -23.6173, lng: -46.6371, region: "capital", event: "Workshop" },
    { id: 15, title: "Sumaré House", address: "R. Heitor Penteado, 1460 - Sumaré", window: "10:10 - 10:40", volume: 1.5, x: 69, y: 37, lat: -23.5441, lng: -46.6858, region: "zona-oeste", event: "Aniversário" },
    { id: 16, title: "Brooklin Prime", address: "Av. Berrini, 955 - Brooklin", window: "16:40 - 17:10", volume: 1.2, x: 55, y: 55, lat: -23.6105, lng: -46.6922, region: "capital", event: "Corporativo" },
    { id: 17, title: "Moema Classic", address: "Al. dos Arapanes, 1120 - Moema", window: "18:00 - 18:30", volume: 1.9, x: 93, y: 64, lat: -23.6094, lng: -46.6658, region: "capital", event: "Jantar" },
    { id: 18, title: "Tatuape Central", address: "R. Tuiuti, 1900 - Tatuape", window: "11:00 - 11:30", volume: 2.1, x: 91, y: 24, lat: -23.5408, lng: -46.5765, region: "capital", event: "Corporativo" }
  ];

  const trucks = [
    { id: "hr", name: "HR", capacity: 8 },
    { id: "sprinter", name: "Sprinter", capacity: 11 },
    { id: "vuc", name: "VUC", capacity: 16 },
    { id: "truck", name: "Truck", capacity: 22 }
  ];

  const defaultRoutes = [
    { id: "seed-1", name: "Rota 01 - Zona Sul", deliveries: 6, truck: "VUC - 16 m³", volume: 12.8, distance: 42.7, duration: "5h40min" },
    { id: "seed-2", name: "Rota 02 - Barra/Recreio", deliveries: 4, truck: "Sprinter - 11 m³", volume: 8.2, distance: 31.2, duration: "4h15min" },
    { id: "seed-3", name: "Rota 03 - Zona Oeste", deliveries: 7, truck: "Truck - 22 m³", volume: 15.8, distance: 58.6, duration: "7h10min" }
  ];

  const state = {
    supabase: null,
    empresaId: null,
    selectedIds: [],
    selectedRouteId: null,
    truckId: null,
    truckIds: [],
    draggedId: null,
    createdRoutes: [],
    region: "all",
    date: "",
    warehouseOrigin: GALPAO_ORIGEM_PADRAO,
    warehousePosition: null,
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    destroyed: false
  };

  const els = {};
  const googleMapState = {
    map: null,
    markers: new Map(),
    routeLine: null,
    warehouseMarker: null,
    directionsService: null,
    directionsRenderer: null,
    routeToken: 0,
    ready: false,
    loading: false,
    needsFit: true
  };

  function $(id){
    return document.getElementById(id);
  }

  function cacheEls(){
    [
      "routeDeliveryDate",
      "routeRegion",
      "routeCalendarTitle",
      "routeCalendarGrid",
      "routeCalendarPrev",
      "routeCalendarNext",
      "routeRefreshBtn",
      "routeAvailableCount",
      "routeSelectedCount",
      "routeCurrentVolume",
      "routeTruckCapacity",
      "routeCapacityRing",
      "routeOccupancyText",
      "routeMapShell",
      "routeGoogleMap",
      "routeMapStatus",
      "routeMapSvg",
      "routeMarkersLayer",
      "routeLegendSelected",
      "routeLegendAvailable",
      "routeFooterSelectedText",
      "routeClearBtn",
      "routeCreateBtn",
      "routeRecalculateBtn",
      "routeSequenceCount",
      "routeSequenceList",
      "routeAddStopBtn",
      "routeTotalCubage",
      "routeRemainingCapacity",
      "routeCapacityFill",
      "routeCapacityPercent",
      "routeTruckSelect",
      "routeCapacityStatus",
      "routeTruckCards",
      "routeCreatedCount",
      "routeCreatedList",
      "routeViewAllBtn"
    ].forEach((id) => {
      els[id] = $(id);
    });
  }

  function isoToday(){
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 10);
  }

  function toDateKey(value){
    return String(value || "").slice(0, 10);
  }

  function parseDateKey(value){
    const parts = toDateKey(value).split("-").map((part) => Number(part));
    const [year, month, day] = parts;
    if(!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  function formatDateKey(date){
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function syncCalendarToDate(){
    const selected = parseDateKey(state.date) || new Date();
    state.calendarYear = selected.getFullYear();
    state.calendarMonth = selected.getMonth();
  }

  function ensureSelectedDate(){
    const dates = deliveries
      .map((delivery) => toDateKey(delivery.date))
      .filter(Boolean)
      .sort();

    if(!dates.length){
      if(!state.date) state.date = isoToday();
      syncCalendarToDate();
      return;
    }

    if(dates.includes(state.date)){
      syncCalendarToDate();
      return;
    }

    const today = isoToday();
    state.date = dates.includes(today) ? today : dates[0];
    syncCalendarToDate();
  }

  function escapeHtml(value){
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatNumber(value, digits = 1){
    return Number(value || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function notify(message, title = "Roteirização", type = "info"){
    if(typeof window.alerta === "function"){
      window.alerta(message, title, type);
      return;
    }
    console.log(`[${title}] ${message}`);
  }

  function selectedTruckIds(){
    const ids = Array.isArray(state.truckIds) && state.truckIds.length
      ? state.truckIds
      : (state.truckId ? [state.truckId] : []);
    return [...new Set(ids.map((id) => String(id)).filter(Boolean))];
  }

  function setSelectedTruckIds(ids){
    const available = new Set(trucks.map((truck) => String(truck.id)));
    state.truckIds = [...new Set((ids || []).map((id) => String(id)).filter((id) => available.has(id)))];
    state.truckId = state.truckIds[0] || null;
  }

  function ensureTruckSelection(){
    if(!trucks.length){
      state.truckIds = [];
      state.truckId = null;
      return;
    }

    const valid = selectedTruckIds().filter((id) => trucks.some((truck) => String(truck.id) === id));
    setSelectedTruckIds(valid.length ? valid : [trucks[0].id]);
  }

  function getSelectedTrucks(){
    const ids = new Set(selectedTruckIds());
    return trucks.filter((truck) => ids.has(String(truck.id)));
  }

  function truckFleetCapacity(items = getSelectedTrucks()){
    return items.reduce((sum, truck) => sum + Number(truck.capacity || 0), 0);
  }

  function truckFleetLabel(items = getSelectedTrucks()){
    if(!items.length) return "Sem veiculo";
    const capacity = truckFleetCapacity(items);
    if(items.length === 1) return `${items[0].name} - ${formatNumber(items[0].capacity, 0)} m³`;
    return `${items.length} veiculos - ${formatNumber(capacity, 0)} m³`;
  }

  function getTruck(){
    const items = getSelectedTrucks();
    return {
      id: selectedTruckIds().join(","),
      name: items.length === 1 ? items[0].name : `${items.length || 0} veiculos`,
      capacity: truckFleetCapacity(items),
      items
    };
  }

  function deliveryMatchesId(delivery, id){
    const value = String(id);
    if(String(delivery?.id) === value) return true;
    if(String(delivery?.pedidoId || "") === value && delivery?.movementType === "entrega") return true;
    return false;
  }

  function routeOwnsDelivery(route, delivery){
    if(!route || !delivery) return false;
    const sequence = Array.isArray(route.sequence) ? route.sequence : [];
    return sequence.some((id) => deliveryMatchesId(delivery, id));
  }

  function routedRouteForDelivery(delivery, options = {}){
    if(!delivery) return null;
    const ignoreRouteId = options.ignoreRouteId ? String(options.ignoreRouteId) : "";
    return (state.createdRoutes || []).find((route) => {
      if(ignoreRouteId && String(route.id) === ignoreRouteId) return false;
      return routeOwnsDelivery(route, delivery);
    }) || null;
  }

  function isDeliveryBlocked(delivery, options = {}){
    return Boolean(routedRouteForDelivery(delivery, options));
  }

  function findVisibleDeliveryById(id){
    return visibleDeliveries().find((delivery) => deliveryMatchesId(delivery, id)) || null;
  }

  function isSelectedId(id){
    return state.selectedIds.some((selectedId) => String(selectedId) === String(id));
  }

  function selectedDeliveries(){
    const visible = visibleDeliveries();
    return state.selectedIds
      .map((id) => visible.find((delivery) => deliveryMatchesId(delivery, id)))
      .filter(Boolean);
  }

  function availableDeliveries(){
    return visibleDeliveries().filter((delivery) => {
      if(isSelectedId(delivery.id)) return false;
      return !isDeliveryBlocked(delivery, { ignoreRouteId: state.selectedRouteId });
    });
  }

  function visibleDeliveries(){
    return deliveries.filter((delivery) => {
      const matchDate = !state.date || toDateKey(delivery.date) === state.date;
      return matchDate;
    });
  }

  function totalVolume(){
    return selectedDeliveries().reduce((sum, delivery) => sum + Number(delivery.volume || 0), 0);
  }

  function routeMetrics(){
    const points = selectedDeliveries();
    if(points.length < 2){
      return { distance: 0, duration: "0h00min" };
    }

    let raw = 0;
    for(let index = 1; index < points.length; index += 1){
      const a = points[index - 1];
      const b = points[index];
      raw += Math.hypot(a.x - b.x, a.y - b.y);
    }

    const distance = Math.max(8, raw * 0.92);
    const minutes = Math.round(distance * 5 + points.length * 18);
    const hours = Math.floor(minutes / 60);
    const mins = String(minutes % 60).padStart(2, "0");
    return { distance, duration: `${hours}h${mins}min` };
  }

  function occupancy(){
    const capacity = getTruck().capacity;
    return capacity > 0 ? Math.round((totalVolume() / capacity) * 100) : 0;
  }

  function clamp(value, min, max){
    return Math.min(Math.max(value, min), max);
  }

  function loadCreatedRoutes(){
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      state.createdRoutes = Array.isArray(parsed) ? parsed : [];
    } catch {
      state.createdRoutes = [];
    }
  }

  function saveCreatedRoutes(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.createdRoutes.slice(0, 20)));
  }

  function isTabelaAusente(error){
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
      if(isTabelaAusente(error)){
        console.warn(`[Roteirizacao] Tabela ou campo indisponivel: ${table}`, error);
        return null;
      }
      throw error;
    }
    return data || [];
  }

  async function carregarOrigemGalpao(){
    state.warehouseOrigin = GALPAO_ORIGEM_PADRAO;
    state.warehousePosition = null;
    if(!state.supabase || !state.empresaId) return;

    const selects = [
      "id,endereco_google,endereco,numero_endereco,latitude,longitude",
      "id,endereco_google,endereco,numero_endereco",
      "id,endereco"
    ];

    for(const select of selects){
      const { data, error } = await state.supabase
        .from("empresas")
        .select(select)
        .eq("id", state.empresaId)
        .maybeSingle();

      if(error){
        if(isTabelaAusente(error)) continue;
        console.warn("[Roteirizacao] Nao foi possivel carregar origem do galpao:", error);
        return;
      }

      if(!data) continue;
      const lat = Number(data.latitude);
      const lng = Number(data.longitude);
      if(Number.isFinite(lat) && Number.isFinite(lng)){
        state.warehousePosition = { lat, lng };
      }

      const endereco = [
        data.endereco_google || data.endereco || "",
        data.numero_endereco ? String(data.numero_endereco).trim() : "",
        "Brasil"
      ].filter(Boolean).join(", ");

      if(endereco.trim()) state.warehouseOrigin = endereco.trim();
      return;
    }
  }

  function parseJson(value){
    if(!value) return {};
    if(typeof value === "object") return value;
    try { return JSON.parse(value); } catch { return {}; }
  }

  function normalizeText(value){
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function normalizeStatus(value){
    return normalizeText(value).replace(/\s+/g, "_");
  }

  function getPedidoNumero(pedido){
    return pedido?.numero_pedido || pedido?.numero || pedido?.codigo || String(pedido?.id || "").slice(0, 8) || "-";
  }

  function pedidoRoteirizavel(pedido){
    const comercial = normalizeStatus(pedido?.status_comercial || "");
    const operacional = normalizeStatus(pedido?.status || "");
    const combinado = `${comercial} ${operacional}`;
    if(combinado.includes("cancel")) return false;
    if(combinado.includes("finalizado")) return false;
    return (
      combinado.includes("aprov") ||
      combinado.includes("pre_reserva") ||
      combinado.includes("pre-reserva") ||
      combinado.includes("pendente") ||
      combinado.includes("em_separacao") ||
      combinado.includes("separado")
    );
  }

  function dataBasePedido(pedido){
    return pedido?.data_entrega || pedido?.data_evento || pedido?.data_hora || pedido?.criado_em || pedido?.created_at || "";
  }

  function dataMovimentoPedido(pedido, tipo){
    const obs = parseJson(pedido?.observacoes);
    if(tipo === "coleta"){
      return pedido?.data_coleta || obs.data_coleta || obs.coleta_data || obs.logistica?.data_coleta || "";
    }
    return dataBasePedido(pedido);
  }

  function formatDateShort(value){
    if(!value) return "-";
    const raw = String(value).slice(0, 10);
    const date = new Date(`${raw}T00:00:00`);
    if(Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("pt-BR");
  }

  function formatTimeFromPedido(pedido, tipo = "entrega"){
    const obs = parseJson(pedido?.observacoes);
    const candidates = tipo === "coleta"
      ? [
        pedido?.hora_coleta,
        pedido?.horario_coleta,
        obs.hora_coleta,
        obs.horario_coleta,
        obs.coleta_horario,
        obs.logistica?.hora_coleta
      ].filter(Boolean)
      : [
        pedido?.hora_entrega,
        pedido?.horario_entrega,
        obs.hora_entrega,
        obs.horario_entrega,
        obs.entrega_horario,
        obs.logistica?.hora_entrega
      ].filter(Boolean);
    const value = String(candidates[0] || "").slice(0, 5);
    return /^\d{2}:\d{2}$/.test(value) ? value : "";
  }

  function inferRegion(local, pedido){
    const text = normalizeText([
      local?.endereco,
      local?.nome_razao,
      pedido?.local_nome,
      pedido?.tipo_evento
    ].join(" "));
    if(/zona sul|socorro|interlagos|jabaquara|santo amaro|campo belo|moema|saude/.test(text)) return "zona-sul";
    if(/zona oeste|pinheiros|lapa|morumbi|perdizes|sumare|alto de pinheiros|itaim/.test(text)) return "zona-oeste";
    return "capital";
  }

  function deterministicPoint(index){
    const x = 12 + ((index * 17) % 78);
    const y = 14 + ((index * 23) % 72);
    return { x, y };
  }

  function capacidadeCaminhao(cam){
    const direto = Number(cam?.capacidade_m3 || cam?.capacidade || 0);
    if(Number.isFinite(direto) && direto > 0) return direto;
    const largura = Number(cam?.largura_bau || 0);
    const altura = Number(cam?.altura_bau || 0);
    const comprimento = Number(cam?.comprimento_bau || cam?.comprimento || 0);
    return largura > 0 && altura > 0 && comprimento > 0 ? largura * altura * comprimento : 0;
  }

  function volumePedido(pedido, itensPedido){
    const obs = parseJson(pedido?.observacoes);
    const logistica = obs.logistica || obs.resumo_logistica || obs.logistica_snapshot || {};
    const direto = Number(pedido?.volume_total || logistica.volume_total || logistica.volume || 0);
    if(Number.isFinite(direto) && direto > 0) return direto;

    return itensPedido.reduce((sum, item) => {
      const qtd = Number(item.quantidade_solicitada || item.quantidade || 1);
      const volumeUnitario = Number(item.itens?.volume_cubico || item.volume_cubico || 0);
      return sum + (Number.isFinite(qtd) ? qtd : 1) * (Number.isFinite(volumeUnitario) ? volumeUnitario : 0);
    }, 0);
  }

  async function carregarPedidosReais(){
    const selects = [
      "id,numero_pedido,cliente_nome,tipo_evento,local_nome,local_id,data_evento,data_entrega,data_coleta,data_hora,hora_entrega,hora_coleta,horario_entrega,horario_coleta,status,status_comercial,valor_total,observacoes,volume_total,status_planejamento,criado_em,created_at",
      "id,numero_pedido,cliente_nome,tipo_evento,local_nome,local_id,data_evento,data_entrega,data_coleta,data_hora,status,status_comercial,valor_total,observacoes,criado_em,created_at",
      "*"
    ];

    for(const select of selects){
      const data = await safeSelect("separacoes_pedidos", select, { order: { field: "data_evento", ascending: true } });
      if(Array.isArray(data)) return data;
    }
    return [];
  }

  async function carregarItensPedidos(pedidoIds){
    if(!pedidoIds.length) return [];
    const selects = [
      "id,separacao_pedido_id,item_id,item_nome,codigo_item,quantidade_solicitada,itens:item_id(id,produto,descricao_total,volume_cubico,setor_estoque)",
      "id,separacao_pedido_id,item_id,item_nome,codigo_item,quantidade_solicitada",
      "*"
    ];

    for(const select of selects){
      const data = await safeSelect("separacoes_itens", select, {
        in: { field: "separacao_pedido_id", values: pedidoIds },
        order: { field: "created_at", ascending: true }
      });
      if(Array.isArray(data)) return data;
    }
    return [];
  }

  async function carregarLocaisPedidos(localIds){
    if(!localIds.length) return [];
    const data = await safeSelect("locais_empresas", "id,nome_razao,endereco,numero_endereco,ponto_referencia,latitude,longitude,tags", {
      in: { field: "id", values: localIds }
    });
    return Array.isArray(data) ? data : [];
  }

  async function carregarCaminhoesReais(){
    const data = await safeSelect("caminhoes", "*", { order: { field: "created_at", ascending: false } });
    return Array.isArray(data) ? data : [];
  }

  function montarEntregasReais(pedidos, itens, locais){
    const itensPorPedido = new Map();
    itens.forEach((item) => {
      const key = String(item.separacao_pedido_id || "");
      if(!itensPorPedido.has(key)) itensPorPedido.set(key, []);
      itensPorPedido.get(key).push(item);
    });

    const locaisMap = new Map(locais.map((local) => [String(local.id), local]));

    return pedidos.flatMap((pedido, index) => {
      const local = locaisMap.get(String(pedido.local_id || "")) || {};
      const itensPedido = itensPorPedido.get(String(pedido.id)) || [];
      const obs = parseJson(pedido.observacoes);
      const point = deterministicPoint(index);
      const lat = Number(local.latitude ?? obs.local_latitude ?? obs.latitude);
      const lng = Number(local.longitude ?? obs.local_longitude ?? obs.longitude);
      const numero = getPedidoNumero(pedido);
      const endereco = [
        local.endereco || obs.local_endereco || pedido.local_nome,
        local.numero_endereco ? `, ${local.numero_endereco}` : ""
      ].join("").trim();

      return ["entrega", "coleta"].flatMap((tipo, typeIndex) => {
        const data = dataMovimentoPedido(pedido, tipo);
        if(!data) return [];

        const hora = formatTimeFromPedido(pedido, tipo);
        const label = tipo === "coleta" ? "Coleta" : "Entrega";
        const offsetPoint = {
          x: clamp(point.x + (typeIndex ? 2 : 0), 6, 94),
          y: clamp(point.y + (typeIndex ? 2 : 0), 6, 94)
        };

        return {
          id: `${pedido.id}:${tipo}`,
          pedidoId: pedido.id,
          movementType: tipo,
          movementLabel: label,
          number: numero,
          title: `#${numero} - ${label} - ${pedido.cliente_nome || "Cliente"}`,
          address: endereco || pedido.local_nome || "Local nao informado",
          window: `${formatDateShort(data)}${hora ? ` - ${hora}` : ""}`,
          date: String(data || "").slice(0, 10),
          volume: volumePedido(pedido, itensPedido),
          x: offsetPoint.x,
          y: offsetPoint.y,
          lat: Number.isFinite(lat) ? lat : null,
          lng: Number.isFinite(lng) ? lng : null,
          region: inferRegion(local, pedido),
          event: `${label} - ${pedido.tipo_evento || "Evento"}`,
          localName: pedido.local_nome || local.nome_razao || "Local",
          raw: pedido
        };
      });
    });
  }

  function montarCaminhoesReais(rows){
    return rows
      .filter((cam) => {
        const status = normalizeStatus(cam.status || "");
        return !status.includes("inativo") && !status.includes("indispon");
      })
      .map((cam) => ({
        id: String(cam.id),
        name: cam.modelo || cam.nome || cam.placa || "Caminhao",
        plate: cam.placa || "",
        capacity: capacidadeCaminhao(cam),
        raw: cam
      }))
      .filter((cam) => cam.id);
  }

  function reconciliarSelecao(){
    const visible = visibleDeliveries();
    state.selectedIds = state.selectedIds.filter((id) => {
      const delivery = visible.find((item) => deliveryMatchesId(item, id));
      if(!delivery) return false;
      return !isDeliveryBlocked(delivery, { ignoreRouteId: state.selectedRouteId });
    });

    ensureTruckSelection();
  }

  function filtrarRotasCriadasPelosPedidosReais(){
    const antes = state.createdRoutes.length;
    state.createdRoutes = state.createdRoutes.filter((route) => {
      if(!Array.isArray(route.sequence) || !route.sequence.length) return false;
      return route.sequence.some((id) => deliveries.some((delivery) => deliveryMatchesId(delivery, id)));
    });
    if(state.createdRoutes.length !== antes) saveCreatedRoutes();
  }

  async function carregarDadosReais(){
    state.supabase = window.supabaseClient || null;
    state.empresaId = window.__CONTEXT?.empresa_id || null;

    deliveries.splice(0, deliveries.length);
    trucks.splice(0, trucks.length);
    defaultRoutes.splice(0, defaultRoutes.length);

    if(!state.supabase || !state.empresaId){
      state.selectedIds = [];
      state.truckId = null;
      state.truckIds = [];
      return;
    }

    try{
      await carregarOrigemGalpao();
      const pedidos = (await carregarPedidosReais()).filter(pedidoRoteirizavel);
      const pedidoIds = pedidos.map((pedido) => pedido.id).filter(Boolean);
      const localIds = [...new Set(pedidos.map((pedido) => pedido.local_id).filter(Boolean))];

      const [itens, locais, caminhoes] = await Promise.all([
        carregarItensPedidos(pedidoIds),
        carregarLocaisPedidos(localIds),
        carregarCaminhoesReais()
      ]);

      deliveries.push(...montarEntregasReais(pedidos, itens, locais));
      trucks.push(...montarCaminhoesReais(caminhoes));
      ensureSelectedDate();
      reconciliarSelecao();
      filtrarRotasCriadasPelosPedidosReais();
    }catch(error){
      console.error("[EasyLoc Roteirizacao] erro ao carregar dados reais:", error);
      notify("Nao foi possivel carregar pedidos e caminhoes reais.", "Roteirizacao", "erro");
      state.selectedIds = [];
      state.truckId = null;
      state.truckIds = [];
    }
  }

  function render(){
    if(state.destroyed) return;
    renderCalendar();
    renderTruckSelect();
    renderSummary();
    renderMap();
    renderSequence();
    renderCubage();
    renderTrucks();
    renderCreatedRoutes();
    window.lucide?.createIcons?.();
  }

  function routedDeliveryIds(){
    const ids = new Set();
    (state.createdRoutes || []).forEach((route) => {
      const sequence = Array.isArray(route.sequence) ? route.sequence : [];
      sequence.forEach((id) => ids.add(String(id)));
    });
    return ids;
  }

  function isDeliveryRouted(delivery, routedIds){
    if(routedIds.has(String(delivery?.id))) return true;
    return delivery?.movementType === "entrega" && routedIds.has(String(delivery?.pedidoId || ""));
  }

  function calendarStatsByDate(){
    const routed = routedDeliveryIds();
    const stats = new Map();

    deliveries.forEach((delivery) => {
      const date = toDateKey(delivery.date);
      if(!date) return;
      const current = stats.get(date) || { total: 0, routed: 0, entrega: 0, coleta: 0 };
      current.total += 1;
      if(delivery.movementType === "coleta"){
        current.coleta += 1;
      }else{
        current.entrega += 1;
      }
      if(isDeliveryRouted(delivery, routed)) current.routed += 1;
      stats.set(date, current);
    });

    return stats;
  }

  function calendarStatus(stat){
    if(!stat || !stat.total) return "";
    if(!stat.routed) return "sem-rota";
    if(stat.routed < stat.total) return "parcial";
    return "concluido";
  }

  function calendarMovementClass(stat){
    if(!stat || !stat.total) return "";
    if(stat.entrega && stat.coleta) return "has-mixed-movements";
    if(stat.coleta) return "has-pickup-movement";
    return "has-delivery-movement";
  }

  function renderCalendar(){
    if(!els.routeCalendarGrid || !els.routeCalendarTitle) return;

    const year = state.calendarYear || new Date().getFullYear();
    const month = Number.isInteger(state.calendarMonth) ? state.calendarMonth : new Date().getMonth();
    const firstDay = new Date(year, month, 1);
    const firstWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const stats = calendarStatsByDate();
    const cells = [];

    setText(els.routeCalendarTitle, `${CALENDAR_MONTHS[month]} ${year}`);

    for(let index = 0; index < firstWeekday; index += 1){
      cells.push('<span class="route-calendar-day is-empty" aria-hidden="true"></span>');
    }

    for(let day = 1; day <= daysInMonth; day += 1){
      const date = formatDateKey(new Date(year, month, day));
      const stat = stats.get(date);
      const status = calendarStatus(stat);
      const movementClass = calendarMovementClass(stat);
      const isSelected = date === state.date;
      const classes = [
        "route-calendar-day",
        status ? `is-${status}` : "",
        movementClass,
        stat?.total ? "has-deliveries" : "",
        isSelected ? "is-selected" : ""
      ].filter(Boolean).join(" ");
      const total = Number(stat?.total || 0);
      const movementLabel = stat?.entrega && stat?.coleta
        ? "entrega e coleta"
        : (stat?.coleta ? "coleta" : "entrega");
      const label = total ? `${total} ${total === 1 ? "movimento" : "movimentos"} de ${movementLabel}` : "Sem entregas ou coletas";

      cells.push(`
        <button type="button" class="${classes}" data-calendar-date="${date}" aria-pressed="${isSelected ? "true" : "false"}" aria-label="${day} de ${CALENDAR_MONTHS[month]}: ${label}">
          <span class="route-calendar-day-number">${day}</span>
          <small>${total ? `${total} ${total === 1 ? "mov." : "movs."}` : "&nbsp;"}</small>
        </button>
      `);
    }

    els.routeCalendarGrid.innerHTML = cells.join("");
  }

  function renderSummary(){
    const selectedCount = selectedDeliveries().length;
    const totalDayCount = visibleDeliveries().length;
    const mapAvailableCount = availableDeliveries().length;
    const truck = getTruck();
    const total = totalVolume();
    const percent = occupancy();

    setText(els.routeAvailableCount, mapAvailableCount);
    setText(els.routeSelectedCount, selectedCount);
    setText(els.routeCurrentVolume, formatNumber(total));
    setText(els.routeTruckCapacity, formatNumber(truck.capacity));
    setText(els.routeOccupancyText, `${percent}%`);
    setText(els.routeLegendSelected, selectedCount);
    setText(els.routeLegendAvailable, mapAvailableCount);
    setText(els.routeFooterSelectedText, `${selectedCount} ${selectedCount === 1 ? "movimento selecionado" : "movimentos selecionados"}`);

    if(els.routeCapacityRing){
      els.routeCapacityRing.style.setProperty("--occupancy", `${clamp(percent, 0, 100) * 3.6}deg`);
    }
  }

  function deliveryPosition(delivery){
    return {
      lat: Number(delivery.lat),
      lng: Number(delivery.lng)
    };
  }

  function hasValidPosition(delivery){
    const position = deliveryPosition(delivery);
    return Number.isFinite(position.lat) && Number.isFinite(position.lng);
  }

  function warehouseLocation(){
    if(state.warehousePosition) return state.warehousePosition;
    return state.warehouseOrigin || GALPAO_ORIGEM_PADRAO;
  }

  function deliveryDirectionsLocation(delivery){
    if(hasValidPosition(delivery)) return deliveryPosition(delivery);
    const address = [delivery?.address || "", "Brasil"].filter(Boolean).join(", ").trim();
    return address || null;
  }

  function deliveryDirectionsPath(stops){
    const origin = warehouseLocation();
    const destinations = stops.map(deliveryDirectionsLocation).filter(Boolean);
    return origin && destinations.length ? [origin, ...destinations] : [];
  }

  function ensureMapContainers(){
    if(!els.routeMapShell) els.routeMapShell = $("routeMapShell");
    if(!els.routeMapShell) return;

    if(!els.routeGoogleMap){
      els.routeGoogleMap = document.createElement("div");
      els.routeGoogleMap.id = "routeGoogleMap";
      els.routeGoogleMap.className = "route-google-map";
      els.routeGoogleMap.setAttribute("aria-label", "Mapa Google da rota");
      els.routeMapShell.prepend(els.routeGoogleMap);
    }

    if(!els.routeMapStatus){
      els.routeMapStatus = document.createElement("div");
      els.routeMapStatus.id = "routeMapStatus";
      els.routeMapStatus.className = "route-map-status";
      els.routeMapStatus.hidden = true;
      els.routeMapShell.insertBefore(els.routeMapStatus, els.routeGoogleMap.nextSibling);
    }
  }

  function setMapStatus(message){
    ensureMapContainers();
    if(!els.routeMapStatus) return;
    els.routeMapStatus.textContent = message || "";
    els.routeMapStatus.hidden = !message;
  }

  function markerKindForDelivery(delivery){
    return delivery?.movementType === "coleta" ? "pickup" : "delivery";
  }

  function markerSvgUrl(svg){
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function pinSvg(color){
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
        <path fill="${color}" stroke="#ffffff" stroke-width="2.2" d="M24 4c-8.2 0-14.8 6.4-14.8 14.3 0 10.8 14.8 25.7 14.8 25.7s14.8-14.9 14.8-25.7C38.8 10.4 32.2 4 24 4z"/>
        <circle cx="24" cy="18.4" r="6.2" fill="#ffffff" opacity=".88"/>
        <circle cx="24" cy="18.4" r="3.8" fill="${color}"/>
      </svg>
    `;
  }

  function truckPinSvg(color){
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">
        <path fill="${color}" stroke="#ffffff" stroke-width="2.4" d="M28 4.8c-9.5 0-17.2 7.4-17.2 16.6 0 12.5 17.2 29.8 17.2 29.8s17.2-17.3 17.2-29.8C45.2 12.2 37.5 4.8 28 4.8z"/>
        <g fill="none" stroke="#ffffff" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.8 20.2h14.3v9.1H17.8z"/>
          <path d="M32.1 23.1h4.4l3 3.5v2.7h-7.4z"/>
          <circle cx="22" cy="31.8" r="2.2"/>
          <circle cx="36" cy="31.8" r="2.2"/>
        </g>
      </svg>
    `;
  }

  function truckGlyphSvg(){
    return `
      <svg class="route-marker-truck-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 7.5h10v7h-10z"></path>
        <path d="M13.5 10h3.7l2.3 2.8v1.7h-6z"></path>
        <circle cx="7" cy="17" r="1.8"></circle>
        <circle cx="17" cy="17" r="1.8"></circle>
      </svg>
    `;
  }

  function markerIcon(kind, size = 34){
    if(!window.google?.maps) return null;

    const color = ROUTE_MARKER_COLORS[kind] || ROUTE_MARKER_COLORS.delivery;
    const isBlocked = kind === "blocked";
    const svg = isBlocked ? truckPinSvg(color) : pinSvg(color);

    return {
      url: markerSvgUrl(svg),
      scaledSize: new google.maps.Size(size, size),
      anchor: new google.maps.Point(size / 2, size),
      labelOrigin: new google.maps.Point(size / 2, Math.round(size * 0.37))
    };
  }

  function ensureGoogleMap(){
    ensureMapContainers();
    if(googleMapState.map || !els.routeGoogleMap || !window.google?.maps?.Map) return;

    els.routeGoogleMap.innerHTML = "";
    googleMapState.map = new google.maps.Map(els.routeGoogleMap, {
      center: { lat: -23.5945, lng: -46.6836 },
      zoom: 11,
      disableDefaultUI: true,
      zoomControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: "greedy",
      clickableIcons: false
    });

    googleMapState.directionsService = new google.maps.DirectionsService();
    googleMapState.ready = true;
    googleMapState.needsFit = true;
    els.routeMapShell?.classList.add("has-google-map");
  }

  async function initGoogleMap(){
    if(googleMapState.ready || googleMapState.loading || state.destroyed) return;

    googleMapState.loading = true;
    setMapStatus("Carregando Google Maps...");

    try{
      if(!window.google?.maps?.Map){
        if(typeof window.carregarGooglePlaces !== "function"){
          throw new Error("Loader do Google Maps indisponivel.");
        }
        await window.carregarGooglePlaces();
      }

      if(state.destroyed) return;

      ensureGoogleMap();
      setMapStatus("");
      renderMap();
    }catch(error){
      console.warn("[EasyLoc Roteirizacao] Google Maps indisponivel:", error);
      setMapStatus("Google Maps indisponivel. Usando visualizacao temporaria.");
      els.routeMapShell?.classList.remove("has-google-map");
    }finally{
      googleMapState.loading = false;
    }
  }

  function fitGoogleMap(points = visibleDeliveries()){
    if(!googleMapState.map || !window.google?.maps?.LatLngBounds) return;

    const validPoints = points.filter(hasValidPosition);
    if(!validPoints.length) return;

    if(validPoints.length === 1){
      googleMapState.map.setCenter(deliveryPosition(validPoints[0]));
      googleMapState.map.setZoom(13);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    validPoints.forEach((delivery) => bounds.extend(deliveryPosition(delivery)));
    googleMapState.map.fitBounds(bounds, 58);
  }

  function clearGoogleRoute(){
    googleMapState.routeToken += 1;

    if(googleMapState.routeLine){
      googleMapState.routeLine.setMap(null);
      googleMapState.routeLine = null;
    }

    if(googleMapState.directionsRenderer){
      googleMapState.directionsRenderer.setMap(null);
      googleMapState.directionsRenderer = null;
    }
  }

  function metricsFromDirections(result){
    const legs = result?.routes?.[0]?.legs || [];
    const meters = legs.reduce((sum, leg) => sum + Number(leg.distance?.value || 0), 0);
    const seconds = legs.reduce((sum, leg) => sum + Number(leg.duration?.value || 0), 0);
    const distance = meters > 0 ? meters / 1000 : 0;
    const minutes = Math.max(0, Math.round(seconds / 60));
    const hours = Math.floor(minutes / 60);
    const mins = String(minutes % 60).padStart(2, "0");
    return { distance, duration: `${hours}h${mins}min` };
  }

  function updateCreatedRouteMetrics(routeId, metrics){
    if(!routeId || !metrics?.distance) return;
    const route = state.createdRoutes.find((item) => String(item.id) === String(routeId));
    if(!route) return;
    route.distance = metrics.distance;
    route.duration = metrics.duration;
    saveCreatedRoutes();
    renderCreatedRoutes();
    window.lucide?.createIcons?.();
  }

  function drawGoogleDirections(path, options = {}){
    if(path.length < 2 || !googleMapState.map || !googleMapState.directionsService){
      clearGoogleRoute();
      setMapStatus("");
      return;
    }

    const token = googleMapState.routeToken + 1;
    googleMapState.routeToken = token;

    if(googleMapState.routeLine){
      googleMapState.routeLine.setMap(null);
      googleMapState.routeLine = null;
    }

    if(!googleMapState.directionsRenderer){
      googleMapState.directionsRenderer = new google.maps.DirectionsRenderer({
        map: googleMapState.map,
        suppressMarkers: true,
        preserveViewport: false,
        polylineOptions: {
          strokeColor: options.color || "#4285F4",
          strokeOpacity: 0.92,
          strokeWeight: 5
        }
      });
    }else{
      googleMapState.directionsRenderer.setMap(googleMapState.map);
      googleMapState.directionsRenderer.setOptions({
        suppressMarkers: true,
        preserveViewport: false,
        polylineOptions: {
          strokeColor: options.color || "#4285F4",
          strokeOpacity: 0.92,
          strokeWeight: 5
        }
      });
    }

    googleMapState.directionsService.route({
      origin: path[0],
      destination: path[path.length - 1],
      waypoints: path.slice(1, -1).map((location) => ({ location, stopover: true })),
      travelMode: google.maps.TravelMode.DRIVING,
      optimizeWaypoints: false
    }, (result, status) => {
      if(state.destroyed || token !== googleMapState.routeToken) return;

      if(status === "OK" && result){
        setMapStatus("");
        googleMapState.directionsRenderer?.setDirections(result);
        const startLocation = result?.routes?.[0]?.legs?.[0]?.start_location;
        if(startLocation && googleMapState.warehouseMarker){
          googleMapState.warehouseMarker.setPosition(startLocation);
          googleMapState.warehouseMarker.setMap(googleMapState.map);
        }
        const metrics = metricsFromDirections(result);
        if(typeof options.onMetrics === "function") options.onMetrics(metrics);
        return;
      }

      googleMapState.directionsRenderer?.setMap(null);
      googleMapState.directionsRenderer = null;
      setMapStatus("Não foi possível calcular a rota por ruas para este endereço.");
      notify("Não foi possível calcular a rota por ruas para este endereço.", "Roteirização", "aviso");
    });
  }

  function renderGoogleMap(selected){
    if(!googleMapState.map || !window.google?.maps) return;

    if(els.routeMapSvg) els.routeMapSvg.innerHTML = "";
    if(els.routeMarkersLayer) els.routeMarkersLayer.innerHTML = "";

    const selectedMap = new Map(selected.map((delivery, index) => [String(delivery.id), index + 1]));
    const visibleIds = new Set();

    if(!googleMapState.warehouseMarker){
      googleMapState.warehouseMarker = new google.maps.Marker({
        map: googleMapState.map,
        title: "Galpão",
        icon: markerIcon("warehouse"),
        zIndex: 40
      });
    }

    const warehouse = warehouseLocation();
    if(typeof warehouse === "object"){
      googleMapState.warehouseMarker.setPosition(warehouse);
      googleMapState.warehouseMarker.setMap(googleMapState.map);
    }else{
      googleMapState.warehouseMarker.setMap(null);
    }

    visibleDeliveries().forEach((delivery) => {
      if(!hasValidPosition(delivery)) return;

      visibleIds.add(String(delivery.id));
      const order = selectedMap.get(String(delivery.id));
      const isSelected = Boolean(order);
      const isBlocked = !isSelected && isDeliveryBlocked(delivery, { ignoreRouteId: state.selectedRouteId });
      const markerKind = isBlocked ? "blocked" : markerKindForDelivery(delivery);
      let marker = googleMapState.markers.get(String(delivery.id));

      if(!marker){
        marker = new google.maps.Marker({
          map: googleMapState.map,
          position: deliveryPosition(delivery),
          title: `${delivery.title} - ${formatNumber(delivery.volume)} m³`,
          optimized: true
        });
        marker.addListener("click", () => toggleDelivery(delivery.id));
        googleMapState.markers.set(String(delivery.id), marker);
      }

      marker.setMap(googleMapState.map);
      marker.setPosition(deliveryPosition(delivery));
      marker.setIcon(markerIcon(markerKind, isBlocked ? 46 : 36));
      marker.setTitle(isBlocked
        ? `${delivery.title} - Este endereco ja esta vinculado a uma rota.`
        : `${delivery.title} - ${formatNumber(delivery.volume)} m³`);
      marker.setLabel(isSelected ? {
        text: String(order),
        color: "#ffffff",
        fontWeight: "800",
        fontSize: "12px"
      } : null);
      marker.setZIndex(isSelected ? 20 + Number(order || 0) : (isBlocked ? 6 : 10));
    });

    googleMapState.markers.forEach((marker, id) => {
      if(!visibleIds.has(id)) marker.setMap(null);
    });

    drawGoogleDirections(deliveryDirectionsPath(selected), {
      color: "#4285F4",
      routeId: state.selectedRouteId,
      onMetrics: (metrics) => updateCreatedRouteMetrics(state.selectedRouteId, metrics)
    });

    if(googleMapState.needsFit){
      if(!selected.length) fitGoogleMap(visibleDeliveries());
      googleMapState.needsFit = false;
    }
  }

  function renderFallbackMap(selected){
    if(els.routeMapSvg){
      els.routeMapSvg.innerHTML = "";
    }

    if(!els.routeMarkersLayer) return;

    const selectedMap = new Map(selected.map((delivery, index) => [String(delivery.id), index + 1]));

    els.routeMarkersLayer.innerHTML = visibleDeliveries().map((delivery, index) => {
      const order = selectedMap.get(String(delivery.id));
      const isSelected = Boolean(order);
      const isBlocked = !isSelected && isDeliveryBlocked(delivery, { ignoreRouteId: state.selectedRouteId });
      const markerKind = markerKindForDelivery(delivery);
      const label = isSelected ? order : (delivery.number || index + 1);
      const labelMarkup = isBlocked ? truckGlyphSvg() : label;
      const markerTitle = isBlocked
        ? "Este endereco ja esta vinculado a uma rota."
        : `${delivery.title} - ${formatNumber(delivery.volume)} m3`;
      return `
        <button
          type="button"
          class="route-marker ${markerKind} ${isSelected ? "selected" : ""} ${isBlocked ? "blocked" : ""}"
          data-delivery-id="${escapeHtml(delivery.id)}"
          aria-disabled="${isBlocked ? "true" : "false"}"
          style="left:${delivery.x}%;top:${delivery.y}%;"
          title="${escapeHtml(markerTitle)}">
          <span>${labelMarkup}</span>
        </button>
      `;
    }).join("");
  }

  function renderMap(){
    const selected = selectedDeliveries();

    if(googleMapState.ready && googleMapState.map){
      renderGoogleMap(selected);
      return;
    }

    renderFallbackMap(selected);
    initGoogleMap();
  }

  function renderSequence(){
    const selected = selectedDeliveries();
    setText(els.routeSequenceCount, selected.length);

    if(!els.routeSequenceList) return;
    if(!selected.length){
      els.routeSequenceList.innerHTML = `<div class="route-empty">Selecione pedidos no mapa para montar a sequência.</div>`;
      return;
    }

    els.routeSequenceList.innerHTML = selected.map((delivery, index) => `
      <div class="route-stop" draggable="true" data-delivery-id="${escapeHtml(delivery.id)}">
        <span class="route-stop-handle"><i data-lucide="grip-vertical"></i></span>
        <span class="route-stop-number">${index + 1}</span>
        <div class="route-stop-body">
          <strong>${escapeHtml(delivery.title)}</strong>
          <span>${escapeHtml(delivery.address)}</span>
          <small>${escapeHtml(delivery.window)}</small>
        </div>
        <span class="route-stop-volume">${formatNumber(delivery.volume)} m³</span>
        <button type="button" class="route-stop-remove" data-remove-delivery="${escapeHtml(delivery.id)}" title="Remover da rota">
          <i data-lucide="x"></i>
        </button>
      </div>
    `).join("");
  }

  function renderCubage(){
    const total = totalVolume();
    const truck = getTruck();
    const remaining = truck.capacity - total;
    const percent = occupancy();
    const isOver = remaining < 0;

    setText(els.routeTotalCubage, formatNumber(total));
    setText(els.routeRemainingCapacity, formatNumber(remaining));
    setText(els.routeCapacityPercent, `${percent}%`);

    if(els.routeCapacityFill){
      els.routeCapacityFill.style.width = `${clamp(percent, 0, 100)}%`;
      els.routeCapacityFill.classList.toggle("is-over", isOver);
    }

    if(els.routeCapacityStatus){
      els.routeCapacityStatus.classList.toggle("is-over", isOver);
      els.routeCapacityStatus.innerHTML = isOver
        ? `<i data-lucide="alert-triangle"></i>Cubagem acima da capacidade`
        : `<i data-lucide="check-circle"></i>Capacidade compatível`;
    }
  }

  function renderTruckSelect(){
    if(!els.routeTruckSelect) return;
    if(!trucks.length){
      els.routeTruckSelect.innerHTML = `<option value="">Nenhum caminhao cadastrado</option>`;
      state.truckId = null;
      state.truckIds = [];
      return;
    }
    ensureTruckSelection();
    const selected = new Set(selectedTruckIds());
    els.routeTruckSelect.multiple = true;
    els.routeTruckSelect.size = Math.min(Math.max(trucks.length, 2), 4);
    els.routeTruckSelect.innerHTML = trucks.map((truck) => `
      <option value="${escapeHtml(truck.id)}" ${selected.has(String(truck.id)) ? "selected" : ""}>
        ${truck.name} - ${formatNumber(truck.capacity, 0)} m³
      </option>
    `).join("");
  }

  function renderTrucks(){
    if(!els.routeTruckCards) return;
    if(!trucks.length){
      els.routeTruckCards.innerHTML = `<div class="route-empty">Nenhum caminhao cadastrado em Logistica.</div>`;
      return;
    }
    const selected = new Set(selectedTruckIds());
    els.routeTruckCards.innerHTML = trucks.map((truck) => `
      <button type="button" class="route-truck-card ${selected.has(String(truck.id)) ? "is-selected" : ""}" data-truck-id="${escapeHtml(truck.id)}" aria-pressed="${selected.has(String(truck.id)) ? "true" : "false"}">
        <i data-lucide="truck"></i>
        <strong>${escapeHtml(truck.name)}</strong>
        <span>${formatNumber(truck.capacity, 0)} m³</span>
      </button>
    `).join("");
  }

  function renderCreatedRoutes(){
    const routes = [...state.createdRoutes, ...defaultRoutes].slice(0, 5);
    setText(els.routeCreatedCount, routes.length);

    if(!els.routeCreatedList) return;
    els.routeCreatedList.innerHTML = routes.map((route) => `
      <div class="route-created-item ${String(route.id) === String(state.selectedRouteId) ? "is-selected" : ""}" data-route-id="${escapeHtml(route.id)}" role="button" tabindex="0">
        <strong>${escapeHtml(route.name)}</strong>
        <div class="route-created-actions">
          <button type="button" title="Visualizar" data-view-route="${escapeHtml(route.id)}"><i data-lucide="eye"></i></button>
          <button type="button" title="Editar"><i data-lucide="pencil"></i></button>
          <button type="button" title="Mais opcoes"><i data-lucide="more-horizontal"></i></button>
        </div>
        <div class="route-created-meta">
          <span>${route.deliveries} paradas</span>
          <span>${escapeHtml(route.truck)}</span>
          <span>${formatNumber(route.volume)} m³</span>
          <span>${formatNumber(route.distance)} km</span>
          <span>${escapeHtml(route.duration)}</span>
        </div>
      </div>
    `).join("");
  }

  function findCreatedRoute(routeId){
    return [...state.createdRoutes, ...defaultRoutes].find((route) => String(route.id) === String(routeId));
  }

  function routeStops(route){
    const sequence = Array.isArray(route?.sequence) ? route.sequence : [];
    if(!sequence.length) return [];
    return sequence
      .map((id) => deliveries.find((delivery) => deliveryMatchesId(delivery, id)))
      .filter(Boolean);
  }

  function removeDeliveryFromCreatedRoute(routeId, deliveryId){
    const routeIndex = state.createdRoutes.findIndex((route) => String(route.id) === String(routeId));
    if(routeIndex < 0) return false;

    const route = state.createdRoutes[routeIndex];
    const target = deliveries.find((delivery) => deliveryMatchesId(delivery, deliveryId));
    const sequence = Array.isArray(route.sequence) ? route.sequence : [];
    route.sequence = sequence.filter((id) => {
      if(target) return !deliveryMatchesId(target, id);
      return String(id) !== String(deliveryId);
    });

    if(!route.sequence.length){
      state.createdRoutes.splice(routeIndex, 1);
      if(String(state.selectedRouteId) === String(routeId)) state.selectedRouteId = null;
      saveCreatedRoutes();
      return true;
    }

    const stops = routeStops(route);
    route.deliveries = stops.length;
    route.volume = stops.reduce((sum, delivery) => sum + Number(delivery.volume || 0), 0);
    saveCreatedRoutes();
    return true;
  }

  function selectCreatedRoute(routeId){
    const route = findCreatedRoute(routeId);
    const stops = routeStops(route);
    if(!route || !stops.length){
      notify("Esta rota ainda não possui paradas vinculadas para visualizar no mapa.", "Roteirização", "aviso");
      return;
    }

    state.selectedRouteId = String(route.id);
    const firstDate = toDateKey(stops[0]?.date);
    if(firstDate){
      state.date = firstDate;
      syncCalendarToDate();
    }
    state.selectedIds = stops.map((delivery) => String(delivery.id));
    googleMapState.needsFit = true;
    render();
  }

  function setText(element, value){
    if(element) element.textContent = value;
  }

  function toggleDelivery(id){
    const deliveryId = String(id);
    const delivery = findVisibleDeliveryById(deliveryId);
    if(!delivery) return;

    if(!isSelectedId(deliveryId) && isDeliveryBlocked(delivery, { ignoreRouteId: state.selectedRouteId })){
      notify("Este endereco ja esta vinculado a uma rota.", "Roteirizacao", "aviso");
      return;
    }

    state.selectedRouteId = null;
    if(isSelectedId(deliveryId)){
      state.selectedIds = state.selectedIds.filter((selectedId) => String(selectedId) !== deliveryId);
    } else {
      state.selectedIds = [...state.selectedIds, deliveryId];
    }
    render();
  }

  function addFirstAvailableStop(){
    const next = availableDeliveries()[0];
    if(!next){
      notify("Não existem entregas ou coletas disponíveis nesta data.", "Roteirização", "aviso");
      return;
    }
    state.selectedRouteId = null;
    state.selectedIds = [...state.selectedIds, String(next.id)];
    render();
  }

  function clearSelection(){
    state.selectedRouteId = null;
    state.selectedIds = [];
    render();
  }

  function createRoute(){
    const selected = selectedDeliveries();
    if(!selected.length){
      notify("Selecione ao menos uma entrega ou coleta para criar a rota.", "Roteirização", "aviso");
      return;
    }

    const selectedTrucks = getSelectedTrucks();
    const blocked = selected.filter((delivery) => isDeliveryBlocked(delivery));
    if(blocked.length){
      notify("Um ou mais enderecos selecionados ja estao vinculados a outra rota.", "Roteirizacao", "aviso");
      return;
    }

    const truck = getTruck();
    if(!selectedTrucks.length){
      notify("Selecione ao menos um caminhao para criar a rota.", "Roteirizacao", "aviso");
      return;
    }
    const total = totalVolume();
    if(total > truck.capacity){
      notify("A cubagem selecionada ultrapassa a capacidade da frota selecionada.", "Roteirização", "erro");
      return;
    }

    state.selectedRouteId = null;
    const metrics = routeMetrics();
    const nextNumber = state.createdRoutes.length + defaultRoutes.length + 1;
    const route = {
      id: `route-${Date.now()}`,
      name: `Rota ${String(nextNumber).padStart(2, "0")} - ${regionName(state.region)}`,
      deliveries: selected.length,
      truck: truckFleetLabel(selectedTrucks),
      truckIds: selectedTrucks.map((item) => String(item.id)),
      trucks: selectedTrucks.map((item) => ({
        id: item.id,
        name: item.name,
        capacity: item.capacity
      })),
      volume: total,
      distance: metrics.distance,
      duration: metrics.duration,
      sequence: selected.map((delivery) => delivery.id),
      createdAt: new Date().toISOString()
    };

    state.createdRoutes.unshift(route);
    state.selectedRouteId = route.id;
    saveCreatedRoutes();
    render();
    notify("Rota criada e adicionada ao painel de rotas de hoje.", "Roteirização", "sucesso");
  }

  function regionName(value){
    const names = {
      "capital": "Capital",
      "zona-sul": "Zona Sul",
      "zona-oeste": "Zona Oeste",
      "all": "Geral"
    };
    return names[value] || "Geral";
  }

  function recalculateRoute(){
    const metrics = routeMetrics();
    googleMapState.needsFit = true;
    renderMap();
    notify("Recalculando rota real por ruas.", "Roteirização", "info");
  }

  function onSequenceDragStart(event){
    const stop = event.target.closest(".route-stop");
    if(!stop) return;
    state.draggedId = String(stop.dataset.deliveryId || "");
    stop.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(state.draggedId));
  }

  function onSequenceDragOver(event){
    const stop = event.target.closest(".route-stop");
    if(!stop || !state.draggedId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function onSequenceDrop(event){
    const stop = event.target.closest(".route-stop");
    if(!stop || !state.draggedId) return;
    event.preventDefault();

    const targetId = String(stop.dataset.deliveryId || "");
    if(targetId === state.draggedId) return;

    const next = state.selectedIds.filter((id) => String(id) !== String(state.draggedId));
    const targetIndex = next.indexOf(targetId);
    next.splice(targetIndex, 0, state.draggedId);
    state.selectedRouteId = null;
    state.selectedIds = next;
    state.draggedId = null;
    render();
  }

  function onSequenceDragEnd(){
    state.draggedId = null;
    document.querySelectorAll(".route-stop.dragging").forEach((item) => item.classList.remove("dragging"));
  }

  function handleMapAction(action){
    if(!action) return;

    if(googleMapState.ready && googleMapState.map){
      if(action === "zoom-in"){
        googleMapState.map.setZoom((googleMapState.map.getZoom() || 11) + 1);
        return;
      }

      if(action === "zoom-out"){
        googleMapState.map.setZoom((googleMapState.map.getZoom() || 11) - 1);
        return;
      }

      if(action === "center"){
        fitGoogleMap(visibleDeliveries());
        return;
      }

      if(action === "layers"){
        const current = googleMapState.map.getMapTypeId();
        const satellite = google.maps.MapTypeId.SATELLITE;
        const roadmap = google.maps.MapTypeId.ROADMAP;
        googleMapState.map.setMapTypeId(current === satellite ? roadmap : satellite);
        return;
      }
    }

    const messages = {
      "zoom-in": "Zoom visual aumentado.",
      "zoom-out": "Zoom visual reduzido.",
      "center": "Mapa centralizado nas paradas selecionadas.",
      "layers": "Camadas do mapa alternadas."
    };
    notify(messages[action] || "Mapa atualizado.", "Mapa", "info");
  }

  function changeCalendarMonth(direction){
    const current = new Date(state.calendarYear, state.calendarMonth, 1);
    current.setMonth(current.getMonth() + direction);
    state.calendarYear = current.getFullYear();
    state.calendarMonth = current.getMonth();
    renderCalendar();
    window.lucide?.createIcons?.();
  }

  function selectCalendarDate(date){
    if(!date) return;
    state.date = date;
    syncCalendarToDate();
    state.selectedRouteId = null;
    state.selectedIds = [];
    reconciliarSelecao();
    googleMapState.needsFit = true;
    render();
  }

  function bindEvents(){
    els.routeMarkersLayer?.addEventListener("click", (event) => {
      const marker = event.target.closest("[data-delivery-id]");
      if(marker) toggleDelivery(marker.dataset.deliveryId);
    });

    els.routeSequenceList?.addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove-delivery]");
      if(!remove) return;
      const deliveryId = String(remove.dataset.removeDelivery || "");
      if(state.selectedRouteId){
        removeDeliveryFromCreatedRoute(state.selectedRouteId, deliveryId);
      }
      state.selectedIds = state.selectedIds.filter((id) => String(id) !== deliveryId);
      render();
    });

    els.routeSequenceList?.addEventListener("dragstart", onSequenceDragStart);
    els.routeSequenceList?.addEventListener("dragover", onSequenceDragOver);
    els.routeSequenceList?.addEventListener("drop", onSequenceDrop);
    els.routeSequenceList?.addEventListener("dragend", onSequenceDragEnd);

    els.routeTruckSelect?.addEventListener("change", (event) => {
      const ids = Array.from(event.target.selectedOptions || []).map((option) => option.value);
      setSelectedTruckIds(ids);
      render();
    });

    els.routeTruckCards?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-truck-id]");
      if(!card) return;
      const truckId = String(card.dataset.truckId || "");
      const current = selectedTruckIds();
      const next = current.includes(truckId)
        ? current.filter((id) => id !== truckId)
        : [...current, truckId];
      setSelectedTruckIds(next);
      render();
    });

    els.routeCreatedList?.addEventListener("click", (event) => {
      const actionButton = event.target.closest("button");
      if(actionButton && !actionButton.dataset.viewRoute) return;
      const routeId = event.target.closest("[data-view-route]")?.dataset.viewRoute
        || event.target.closest("[data-route-id]")?.dataset.routeId;
      if(!routeId) return;
      selectCreatedRoute(routeId);
    });

    els.routeCreatedList?.addEventListener("keydown", (event) => {
      if(event.key !== "Enter" && event.key !== " ") return;
      const routeId = event.target.closest("[data-route-id]")?.dataset.routeId;
      if(!routeId) return;
      event.preventDefault();
      selectCreatedRoute(routeId);
    });

    els.routeClearBtn?.addEventListener("click", clearSelection);
    els.routeAddStopBtn?.addEventListener("click", addFirstAvailableStop);
    els.routeCreateBtn?.addEventListener("click", createRoute);
    els.routeRecalculateBtn?.addEventListener("click", recalculateRoute);
    els.routeCalendarPrev?.addEventListener("click", () => changeCalendarMonth(-1));
    els.routeCalendarNext?.addEventListener("click", () => changeCalendarMonth(1));
    els.routeCalendarGrid?.addEventListener("click", (event) => {
      const day = event.target.closest("[data-calendar-date]");
      if(!day) return;
      selectCalendarDate(day.dataset.calendarDate || "");
    });

    els.routeRefreshBtn?.addEventListener("click", async () => {
      await carregarDadosReais();
      notify("Entregas atualizadas para a data selecionada.", "Roteirização", "sucesso");
      googleMapState.needsFit = true;
      render();
    });

    els.routeDeliveryDate?.addEventListener("change", (event) => {
      state.date = event.target.value || "";
      syncCalendarToDate();
      state.selectedRouteId = null;
      state.selectedIds = [];
      reconciliarSelecao();
      googleMapState.needsFit = true;
      render();
    });

    els.routeRegion?.addEventListener("change", (event) => {
      state.region = event.target.value || "all";
      googleMapState.needsFit = true;
      render();
    });

    document.getElementById("routeMapShell")?.addEventListener("click", (event) => {
      const action = event.target.closest("[data-map-action]")?.dataset.mapAction;
      handleMapAction(action);
    });

    els.routeViewAllBtn?.addEventListener("click", () => {
      notify("A lista completa de rotas ficará disponível na próxima etapa.", "Roteirização", "info");
    });
  }

  function bindRouteTabs(){
    const tabs = Array.from(document.querySelectorAll("[data-route-tab]"));
    const panels = Array.from(document.querySelectorAll("[data-route-panel]"));
    if(!tabs.length || !panels.length) return;

    function activate(tabName){
      tabs.forEach((tab) => {
        const isActive = tab.dataset.routeTab === tabName;
        tab.classList.toggle("is-active", isActive);
        tab.setAttribute("aria-selected", isActive ? "true" : "false");
      });

      panels.forEach((panel) => {
        const isActive = panel.dataset.routePanel === tabName;
        panel.classList.toggle("is-active", isActive);
        panel.hidden = !isActive;
      });
    }

    tabs.forEach((tab) => {
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", tab.classList.contains("is-active") ? "true" : "false");
      tab.addEventListener("click", () => activate(tab.dataset.routeTab || "sequence"));
    });

    panels.forEach((panel) => {
      panel.setAttribute("role", "tabpanel");
    });
  }

  function finishModuleLoading(){
    if(typeof window.finalizarCarregamentoModulo === "function"){
      window.finalizarCarregamentoModulo();
      return;
    }
    document.getElementById("global-loader")?.classList.add("hidden");
  }

  async function init(){
    try{
      state.destroyed = false;
      cacheEls();
      loadCreatedRoutes();
      await carregarDadosReais();
      ensureSelectedDate();

      if(els.routeDeliveryDate) els.routeDeliveryDate.value = state.date || "";
      if(els.routeRegion) els.routeRegion.value = state.region;

      bindEvents();
      bindRouteTabs();
      render();
    }catch(error){
      console.error("[EasyLoc Roteirizacao] erro ao iniciar modulo:", error);
      notify("Nao foi possivel carregar a tela de roteirizacao.", "Roteirizacao", "erro");
    }finally{
      finishModuleLoading();
    }
  }

  window.__moduleInit = init;
  window.__activeModuleDestroy = function destroyRoteirizacao(){
    state.destroyed = true;
    clearGoogleRoute();
    googleMapState.markers.forEach((marker) => marker.setMap(null));
    googleMapState.markers.clear();
    googleMapState.warehouseMarker?.setMap(null);
    googleMapState.warehouseMarker = null;
    googleMapState.map = null;
    googleMapState.ready = false;
  };
})();
