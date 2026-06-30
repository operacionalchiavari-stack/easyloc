(function () {
  "use strict";

  const STORAGE_KEY = "easyloc_planejador_eventos_wizard_v2";
  const LEGACY_STORAGE_KEY = "easyloc_planejador_eventos_wizard_v1";
  const steps = ["Local", "Modo", "Demarcar", "Estilo", "Gerar", "Aprovar"];
  const areaTypes = ["Lounge", "Mesa de bolo", "Mesa da familia", "Pista de danca", "Palco", "Buffet", "Bar", "Cerimonia", "Area tecnica", "Area livre", "Personalizado"];
  const areaRules = {
    lounge: {
      titulo: "Lounge",
      resumo: "composicao completa obrigatoria",
      bloqueiaItens: false,
      composicoes: {
        pequeno: { sofa: 1, poltrona: 2, mesaCentro: 1, mesaLateral: 2 },
        medio: { sofa: 1, poltrona: 4, mesaCentro: 1, mesaLateral: 2 },
        grande: { sofa: 2, poltrona: 4, mesaCentro: 2, mesaLateral: 4 }
      }
    },
    "mesa de bolo": { titulo: "Mesa de bolo", resumo: "sem cadeiras, com area livre para fotos", bloqueiaCadeiras: true },
    "mesa da familia": { titulo: "Mesa da familia", resumo: "com cadeiras, proxima ao bolo e pista", lugares: 10 },
    "pista de danca": { titulo: "Pista de danca", resumo: "area livre sem itens", bloqueiaItens: true },
    palco: { titulo: "Palco", resumo: "area livre com visao preservada", bloqueiaItens: true },
    buffet: { titulo: "Buffet", resumo: "acesso frontal e circulacao preservada" },
    bar: { titulo: "Bar", resumo: "acesso frontal e apoio operacional" },
    cerimonia: { titulo: "Cerimonia", resumo: "cadeiras orientadas para o eixo principal" },
    "area tecnica": { titulo: "Area tecnica", resumo: "restrita para operacao", bloqueiaItens: true },
    "area livre": { titulo: "Area livre", resumo: "sem ocupacao de mobiliario", bloqueiaItens: true },
    personalizado: { titulo: "Personalizado", resumo: "regras definidas manualmente" }
  };
  const loungeCompositions = [
    { id: "chiavari-premium", nome: "Lounge Chiavari Premium", tamanho: "medio" },
    { id: "boho", nome: "Lounge Boho", tamanho: "medio" },
    { id: "moderno", nome: "Lounge Moderno", tamanho: "grande" }
  ];
  const styles = ["Casamento classico", "Casamento moderno", "Boho", "Tropical", "Corporativo", "Festa jovem", "Personalizado"];
  const preferences = [
    "Priorizar mesas redondas",
    "Priorizar bistros proximos da pista",
    "Evitar mesas grandes perto da pista",
    "Usar lounges proximos da pista",
    "Manter buffet com area livre frontal",
    "Valorizar areas nobres e vista principal",
    "Preservar corredores de circulacao",
    "Seguir padroes das referencias do local"
  ];
  const decoratorPriorities = [
    "Referencias historicas do local",
    "Fluxo de circulacao",
    "Estetica e areas nobres",
    "Conforto e capacidade dos convidados",
    "Ocupacao do espaco apenas quando fizer sentido"
  ];
  const generationSteps = [
    "Lendo planta crua principal",
    "Estudando referencias historicas do local",
    "Identificando fluxo, acessos e areas nobres",
    "Carregando catalogo e itens cadastrados",
    "Respeitando areas demarcadas",
    "Aplicando motor decorador do Planejador IA",
    "Validando circulacao",
    "Gerando lista de itens"
  ];

  const catalog = [
    { nome: "Mesa redonda grande", tipo: "mesa", w: 96, h: 96, operationalW: 132, operationalH: 132 },
    { nome: "Mesa redonda media", tipo: "mesa", w: 92, h: 92, operationalW: 126, operationalH: 126 },
    { nome: "Mesa redonda pequena", tipo: "mesa", w: 86, h: 86, operationalW: 118, operationalH: 118 },
    { nome: "Bistro", tipo: "bistro", w: 72, h: 72, operationalW: 160, operationalH: 160 },
    { nome: "Lounge", tipo: "lounge", w: 180, h: 110, operationalW: 260, operationalH: 190 }
  ];

  const state = {
    currentStep: 1,
    completed: new Set(),
    places: [],
    activePlaceId: null,
    creationMode: null,
    activeTool: "Coluna",
    activeAreaType: "Pista",
    selectedId: null,
    selectedStyle: "Casamento classico",
    selectedPrefs: new Set(["Priorizar bistros proximos da pista", "Manter buffet com area livre frontal"]),
    eventBrief: {
      convidados: 120,
      mesas: "",
      lounges: 2
    },
    generated: false,
    aiStatus: "idle",
    itens: [],
    guidance: null,
    drag: null,
    resize: null,
    rotate: null,
    newLocal: {
      rawPlant: null,
      references: []
    },
    addressAutocomplete: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function uid() {
    return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function defaultPlace() {
    return {
      id: uid(),
      nome: "Vale dos Desejos",
      endereco: "Estr. do Passatempo - Alberto Torres, Areal - RJ",
      googlePlace: null,
      rawPlant: null,
      references: [],
      layouts: [],
      objects: []
    };
  }

  function migratePlace(place) {
    const plantas = Array.isArray(place.plantas) ? place.plantas : [];
    const rawPlant = place.rawPlant || plantas[0] || null;
    const references = Array.isArray(place.references) ? place.references : plantas.slice(1);
    return {
      ...place,
      rawPlant,
      references,
      layouts: Array.isArray(place.layouts) ? place.layouts : [],
      objects: Array.isArray(place.objects) ? place.objects.map(migrateObject) : []
    };
  }

  function migrateObject(object) {
    if (!object || typeof object !== "object") return object;
    if (object.kind !== "area") return { rotation: 0, ...object };
    const type = normalizeAreaType(object.areaType || object.label);
    return {
      rotation: 0,
      rules: areaRules[type]?.resumo || "",
      restrictions: areaRules[type]?.bloqueiaItens ? "Area livre sem mobiliario" : "",
      composition: type === "lounge" ? "chiavari-premium" : "",
      places: areaRules[type]?.lugares || "",
      ...object,
      areaType: type,
      label: object.label || areaRules[type]?.titulo || "Area",
      rotation: Number(object.rotation || 0)
    };
  }

  function activePlace() {
    return state.places.find(place => place.id === state.activePlaceId) || null;
  }

  function activePlant() {
    return activePlace()?.rawPlant || null;
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || "{}");
      state.places = Array.isArray(saved.places) && saved.places.length
        ? saved.places.map(migratePlace)
        : [defaultPlace()];
      state.activePlaceId = saved.activePlaceId || null;
      state.creationMode = saved.creationMode || null;
      state.currentStep = saved.currentStep || 1;
      state.generated = !!saved.generated;
      state.selectedStyle = saved.selectedStyle || state.selectedStyle;
      state.selectedPrefs = new Set(saved.selectedPrefs || Array.from(state.selectedPrefs));
      state.eventBrief = { ...state.eventBrief, ...(saved.eventBrief || {}) };
    } catch {
      state.places = [defaultPlace()];
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      places: state.places,
      activePlaceId: state.activePlaceId,
      creationMode: state.creationMode,
      currentStep: state.currentStep,
      generated: state.generated,
      selectedStyle: state.selectedStyle,
      selectedPrefs: Array.from(state.selectedPrefs),
      eventBrief: state.eventBrief
    }));
  }

  async function loadRegisteredPlaces() {
    const supabase = window.supabaseClient;
    const empresaId = window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
    if (!supabase || !empresaId) return;

    const { data, error } = await supabase
      .from("locais_empresas")
      .select("id,nome_razao,endereco,numero_endereco,ponto_referencia")
      .eq("empresa_id", empresaId)
      .order("nome_razao", { ascending: true });

    if (error) {
      console.warn("Planejador: nao foi possivel carregar locais cadastrados.", error);
      return;
    }

    const savedBySource = new Map(state.places.map(place => [place.sourceId || place.id, place]));
    (data || []).forEach(local => {
      const sourceId = `locais_empresas:${local.id}`;
      if (savedBySource.has(sourceId)) return;
      state.places.push({
        id: uid(),
        sourceId,
        nome: local.nome_razao || "Local sem nome",
        endereco: [local.endereco, local.numero_endereco].filter(Boolean).join(", "),
        referencia: local.ponto_referencia || "",
        googlePlace: null,
        rawPlant: null,
        references: [],
        layouts: [],
        objects: []
      });
    });

    saveState();
    render();
  }

  async function loadInventoryItems() {
    const supabase = window.supabaseClient;
    const empresaId = window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
    if (!supabase || !empresaId) return;

    const { data, error } = await supabase
      .from("itens")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("produto", { ascending: true });

    if (error) {
      console.warn("Planejador: nao foi possivel carregar itens cadastrados.", error);
      state.itens = [];
      return;
    }

    state.itens = (data || []).map(normalizeInventoryItem).filter(Boolean);
    renderReviewStep();
  }

  function normalizeInventoryItem(item) {
    if (!item) return null;
    const nome = item.descricao_total || item.produto || item.nome || "Item cadastrado";
    const larguraCm = parseDimension(item.largura || item.largura_cm || item.area_operacional_largura);
    const profundidadeCm = parseDimension(item.profundidade || item.profundidade_cm || item.comprimento || item.area_operacional_profundidade);
    const tipo = classifyInventoryItem(item);
    const defaults = defaultSizeByType(tipo);
    const w = clamp(larguraCm ? larguraCm * 1.6 : defaults.w, 58, 240);
    const h = clamp(profundidadeCm ? profundidadeCm * 1.6 : defaults.h, 58, 220);

    return {
      id: item.id,
      codigo: item.codigo || "",
      nome,
      tipo,
      categoria: item.categoria || "",
      foto_url: item.foto_url || item.foto || "",
      valorLocacao: Number(item.valor_locacao || item.locacao || 0),
      valorReposicao: Number(item.valor_reposicao || item.reposicao || 0),
      w,
      h,
      operationalW: defaults.operationalW,
      operationalH: defaults.operationalH
    };
  }

  function parseDimension(value) {
    if (value === null || value === undefined || value === "") return 0;
    const number = Number(String(value).replace(",", ".").replace(/[^\d.]/g, ""));
    if (!Number.isFinite(number) || number <= 0) return 0;
    return number <= 10 ? number * 100 : number;
  }

  function classifyInventoryItem(item) {
    const text = normalize(`${item.tipo || ""} ${item.categoria || ""} ${item.produto || ""} ${item.descricao_total || ""}`);
    if (text.includes("bistro") || text.includes("bistro")) return "bistro";
    if (text.includes("lounge") || text.includes("sofa") || text.includes("poltrona") || text.includes("pufe")) return "lounge";
    if (text.includes("bar") || text.includes("aparador") || text.includes("buffet")) return "apoio";
    if (text.includes("retangular")) return "mesa_retangular";
    if (text.includes("quadrada")) return "mesa_quadrada";
    if (text.includes("mesa")) return "mesa";
    if (text.includes("cadeira")) return "cadeira";
    return "decoracao";
  }

  function defaultSizeByType(tipo) {
    return {
      mesa: { w: 96, h: 96, operationalW: 132, operationalH: 132 },
      mesa_retangular: { w: 132, h: 80, operationalW: 165, operationalH: 110 },
      mesa_quadrada: { w: 92, h: 92, operationalW: 126, operationalH: 126 },
      bistro: { w: 58, h: 58, operationalW: 88, operationalH: 88 },
      lounge: { w: 138, h: 86, operationalW: 170, operationalH: 118 },
      apoio: { w: 152, h: 46, operationalW: 180, operationalH: 76 },
      cadeira: { w: 32, h: 32, operationalW: 44, operationalH: 44 },
      decoracao: { w: 42, h: 42, operationalW: 64, operationalH: 64 }
    }[tipo] || { w: 76, h: 76, operationalW: 108, operationalH: 108 };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(Number(value) || min, min), max);
  }

  function render() {
    renderStepper();
    renderStepVisibility();
    renderGuidanceBanner();
    renderLocalStep();
    renderModeStep();
    renderMarkingStep();
    renderStyleStep();
    renderGenerationStep();
    renderReviewStep();
    renderFooter();
  }

  function renderGuidanceBanner() {
    const target = $("#plannerGuidanceBanner");
    if (!target) return;
    const guidance = state.guidance;
    target.classList.toggle("hidden", !guidance);
    if (!guidance) {
      target.innerHTML = "";
      return;
    }
    target.innerHTML = `
      <div>
        <span class="planner-kicker">${escapeHtml(guidance.stepLabel || "OrientaÃ§Ã£o")}</span>
        <strong>${escapeHtml(guidance.title)}</strong>
        <p>${escapeHtml(guidance.message)}</p>
      </div>
      <div class="planner-guidance-actions">
        ${guidance.step ? `<button type="button" class="btn secondary" data-guidance-step="${guidance.step}">${escapeHtml(guidance.actionLabel || "Ir para a etapa")}</button>` : ""}
        ${guidance.regenerate ? `<button type="button" class="btn primary" data-guidance-regenerate>Gerar novamente</button>` : ""}
        <button type="button" class="planner-icon-btn" data-guidance-close>Ã—</button>
      </div>
    `;
  }

  function renderStepper() {
    const target = $("#plannerSteps");
    if (!target) return;
    target.innerHTML = steps.map((label, index) => {
      const number = index + 1;
      const done = state.completed.has(number) || number < state.currentStep;
      return `
        <div class="planner-step-pill ${number === state.currentStep ? "active" : ""} ${done ? "done" : ""}">
          <strong>${done ? "OK" : number}</strong>
          <span>${label}</span>
        </div>
      `;
    }).join("");
  }

  function renderStepVisibility() {
    $$(".planner-step").forEach(section => {
      section.classList.toggle("active", Number(section.dataset.stepPanel) === state.currentStep);
    });
  }

  function renderLocalStep() {
    const list = $("#plannerLocalList");
    if (!list) return;
    const term = normalize($("#plannerLocalSearch")?.value || "");
    const places = state.places.filter(place => normalize(`${place.nome} ${place.endereco}`).includes(term));

    list.innerHTML = places.map(place => `
      <button type="button" class="planner-local-card ${place.id === state.activePlaceId ? "selected" : ""}" data-select-place="${place.id}">
        <h3>${escapeHtml(place.nome)}</h3>
        <div class="planner-card-meta">
          <span>${escapeHtml(place.endereco || "Sem endereco")}</span>
          <span>${place.rawPlant ? "Planta crua cadastrada" : "Sem planta crua"} Â· ${place.references.length} referencia(s)</span>
        </div>
      </button>
    `).join("") || `<div class="planner-muted">Nenhum local encontrado. Use "Adicionar novo local".</div>`;

    renderSelectedPlacePreview();
  }

  function renderSelectedPlacePreview() {
    const place = activePlace();
    const title = $("#plannerPreviewTitle");
    const chip = $("#plannerPreviewChip");
    const preview = $("#plannerRawPlantPreview");
    const refs = $("#plannerReferenceStrip");
    if (!preview || !title || !chip || !refs) return;

    if (!place) {
      title.textContent = "Nenhum local selecionado";
      chip.textContent = "Selecione um local";
      preview.innerHTML = emptyPreview("Busque ou adicione um local", "A planta crua principal aparecera aqui antes de avancar.");
      refs.innerHTML = "";
      return;
    }

    title.textContent = place.nome;
    chip.textContent = place.rawPlant ? "Pronto para continuar" : "Local sem planta crua";
    preview.innerHTML = plantPreviewTemplate(place.rawPlant, "Este local ainda nao possui planta crua principal.");
    refs.innerHTML = place.references.length
      ? place.references.map(file => `
          <span class="planner-reference-mini">
            ${referencePreviewTemplate(file)}
            <button type="button" title="Excluir planta" data-delete-reference="${file.id}">Ã—</button>
          </span>
        `).join("")
      : `<span class="planner-muted">Sem plantas de referencia cadastradas.</span>`;
  }

  function renderModeStep() {
    $$(".planner-mode-card").forEach(card => {
      card.classList.toggle("selected", card.dataset.modeChoice === state.creationMode);
    });
  }

  function renderMarkingStep() {
    renderAreaTools();
    renderCanvasInto("#plannerCanvas", { mode: "marking" });
    renderDetectedList();
    renderAreasList();
    renderAreaConfigPanel();
    renderStepAssist();
  }

  function renderStepAssist() {
    const target = $("#plannerDetectedList");
    if (!target || state.currentStep !== 3 || !state.guidance) return;
    target.insertAdjacentHTML("afterbegin", `
      <div class="planner-step-assist">
        <strong>VocÃª estÃ¡ na etapa certa para corrigir</strong>
        <span>${escapeHtml(state.guidance.message)}</span>
      </div>
    `);
  }

  function renderAreaTools() {
    const target = $("#plannerAreaTools");
    if (!target) return;
    target.innerHTML = areaTypes.map(type => `
      <button type="button" class="${type === state.activeAreaType ? "active" : ""}" data-area-type="${type}">${type}</button>
    `).join("");
  }

  function renderDetectedList() {
    const target = $("#plannerDetectedList");
    const place = activePlace();
    if (!target || !place) return;
    const obstacles = place.objects.filter(object => object.kind === "obstacle");
    target.innerHTML = obstacles.map(item => `
      <div class="planner-detected-item">
        <strong>${escapeHtml(item.label)}</strong>
        <span class="planner-muted">Marcacao manual ou sugerida pela IA.</span>
      </div>
    `).join("") || `<div class="planner-muted">Use os botoes Coluna, Parede e Area proibida para orientar a IA.</div>`;
  }

  function renderAreasList() {
    const target = $("#plannerAreasList");
    const place = activePlace();
    if (!target || !place) return;
    const areas = place.objects.filter(object => object.kind === "area");
    target.innerHTML = areas.map(area => `
      <div class="planner-area-row ${area.id === state.selectedId ? "selected" : ""}" data-select-object="${area.id}">
        <span class="planner-area-dot" style="background:${areaColor(area.label)}"></span>
        <div>
          <strong>${escapeHtml(area.label)}</strong>
          <span>${areaRuleSummary(area)} Â· L ${Math.round(area.w)} x P ${Math.round(area.h)} Â· ${Math.round(area.rotation || 0)}Â°</span>
        </div>
        <button type="button" class="planner-mini-danger" data-delete-object="${area.id}">Excluir</button>
      </div>
    `).join("") || `<div class="planner-muted">Selecione uma area e clique na planta para demarcar.</div>`;
  }

  function renderAreaConfigPanel() {
    const target = $("#plannerAreaConfigPanel");
    const area = selectedArea();
    if (!target) return;
    if (!area) {
      target.innerHTML = `
        <div class="planner-area-config empty">
          <strong>ConfiguraÃ§Ã£o da Ã¡rea</strong>
          <span class="planner-muted">Clique em uma demarcaÃ§Ã£o para editar regras, composiÃ§Ã£o e rotaÃ§Ã£o.</span>
        </div>
      `;
      return;
    }

    const type = normalizeAreaType(area.areaType || area.label);
    const rule = areaRules[type] || areaRules.personalizado;
    target.innerHTML = `
      <div class="planner-area-config">
        <div class="planner-area-config-head">
          <span class="planner-kicker">Ãrea selecionada</span>
          <strong>${escapeHtml(rule.titulo)}</strong>
        </div>
        <label>Nome da Ã¡rea
          <input class="el-input" data-area-field="label" value="${escapeHtml(area.label)}">
        </label>
        <label>Tipo da Ã¡rea
          <select class="el-input" data-area-field="areaType">
            ${areaTypes.map(typeName => {
              const value = normalizeAreaType(typeName);
              return `<option value="${value}" ${value === type ? "selected" : ""}>${typeName}</option>`;
            }).join("")}
          </select>
        </label>
        <div class="planner-area-config-grid">
          <label>Largura
            <input class="el-input" type="number" min="40" data-area-field="w" value="${Math.round(area.w)}">
          </label>
          <label>Altura
            <input class="el-input" type="number" min="40" data-area-field="h" value="${Math.round(area.h)}">
          </label>
        </div>
        <label>RotaÃ§Ã£o
          <input class="el-input" type="number" min="-180" max="180" data-area-field="rotation" value="${Math.round(area.rotation || 0)}">
        </label>
        ${type === "mesa da familia" ? `
          <label>Lugares
            <input class="el-input" type="number" min="2" data-area-field="places" value="${area.places || rule.lugares || 10}">
          </label>
        ` : ""}
        ${type === "lounge" ? `
          <label>ComposiÃ§Ã£o
            <select class="el-input" data-area-field="composition">
              ${loungeCompositions.map(item => `<option value="${item.id}" ${item.id === area.composition ? "selected" : ""}>${item.nome}</option>`).join("")}
            </select>
          </label>
        ` : ""}
        <div class="planner-rule-box">
          <strong>${escapeHtml(rule.titulo)} â€“ ${escapeHtml(rule.resumo)}</strong>
          <span>${escapeHtml(areaRestrictions(area).join(" Â· ") || "Sem restriÃ§Ãµes adicionais.")}</span>
        </div>
      </div>
    `;
  }

  function selectedArea() {
    const place = activePlace();
    return place?.objects.find(object => object.id === state.selectedId && object.kind === "area") || null;
  }

  function normalizeAreaType(value) {
    const n = normalize(value);
    if (n.includes("pista")) return "pista de danca";
    if (n.includes("palco")) return "palco";
    if (n.includes("bolo")) return "mesa de bolo";
    if (n.includes("familia")) return "mesa da familia";
    if (n.includes("lounge")) return "lounge";
    if (n.includes("buffet")) return "buffet";
    if (n.includes("bar")) return "bar";
    if (n.includes("cerimon")) return "cerimonia";
    if (n.includes("tecnica")) return "area tecnica";
    if (n.includes("livre")) return "area livre";
    if (areaRules[n]) return n;
    return "personalizado";
  }

  function areaRuleSummary(area) {
    const type = normalizeAreaType(area.areaType || area.label);
    const rule = areaRules[type] || areaRules.personalizado;
    return `${rule.titulo} - ${rule.resumo}`;
  }

  function areaRestrictions(area) {
    const type = normalizeAreaType(area.areaType || area.label);
    const restrictions = [];
    if (areaRules[type]?.bloqueiaItens) restrictions.push("Nao recebe mobiliario");
    if (areaRules[type]?.bloqueiaCadeiras) restrictions.push("Sem cadeiras");
    if (type === "lounge") restrictions.push("Composicao completa obrigatoria");
    if (type === "mesa da familia") restrictions.push(`${area.places || areaRules[type].lugares || 10} lugares`);
    return restrictions;
  }

  function updateSelectedAreaField(field, value) {
    const area = selectedArea();
    if (!area) return;
    if (["w", "h"].includes(field)) {
      area[field] = Math.max(40, Number(value) || 40);
    } else if (field === "rotation") {
      area.rotation = normalizeDegrees(Number(value) || 0);
    } else if (field === "areaType") {
      area.areaType = normalizeAreaType(value);
      area.label = areaRules[area.areaType]?.titulo || area.label;
      area.rules = areaRules[area.areaType]?.resumo || "";
      area.restrictions = areaRestrictions(area).join(", ");
      if (area.areaType === "lounge" && !area.composition) area.composition = "chiavari-premium";
      if (area.areaType === "mesa da familia" && !area.places) area.places = areaRules[area.areaType]?.lugares || 10;
    } else {
      area[field] = value;
    }
    saveState();
    if (state.currentStep === 3) {
      renderCanvasInto("#plannerCanvas", { mode: "marking" });
      renderAreasList();
      if (field === "areaType") renderAreaConfigPanel();
    } else {
      renderActiveCanvasOnly();
    }
  }

  function normalizeDegrees(value) {
    let number = Number(value) || 0;
    while (number > 180) number -= 360;
    while (number < -180) number += 360;
    return Math.round(number);
  }

  function renderStyleStep() {
    const styleGrid = $("#plannerStyleGrid");
    const prefGrid = $("#plannerPreferences");
    const priorityList = $("#plannerPriorityList");
    if (!styleGrid || !prefGrid) return;

    styleGrid.innerHTML = styles.map(style => `
      <div class="planner-style-card ${style === state.selectedStyle ? "selected" : ""}" data-style="${style}">
        <h3>${style}</h3>
        <p class="planner-muted">Define linguagem visual, densidade e comportamento do layout.</p>
      </div>
    `).join("");

    prefGrid.innerHTML = preferences.map(pref => `
      <div class="planner-pref-card ${state.selectedPrefs.has(pref) ? "active" : ""}" data-pref="${pref}">
        <strong>${state.selectedPrefs.has(pref) ? "OK " : ""}${pref}</strong>
      </div>
    `).join("");

    if (priorityList) {
      priorityList.innerHTML = `
        <strong>Como o Planejador decide</strong>
        ${decoratorPriorities.map((item, index) => `<span>${index + 1}. ${item}</span>`).join("")}
      `;
    }

    const guests = $("#plannerBriefGuests");
    const tables = $("#plannerBriefTables");
    const lounges = $("#plannerBriefLounges");
    if (guests) guests.value = state.eventBrief.convidados ?? "";
    if (tables) tables.value = state.eventBrief.mesas ?? "";
    if (lounges) lounges.value = state.eventBrief.lounges ?? "";
  }

  function renderGenerationStep() {
    renderCanvasInto("#plannerCanvasGenerate", { mode: "generate" });
    const progress = $("#plannerGenerationProgress");
    if (progress && !progress.innerHTML) {
      progress.innerHTML = generationSteps.map(text => `
        <div class="planner-progress-item"><strong>${text}</strong></div>
      `).join("");
    }
  }

  function renderReviewStep() {
    renderCanvasInto("#plannerCanvasReview", { mode: "review" });
    const place = activePlace();
    const furniture = place?.objects.filter(object => object.kind === "furniture") || [];
    const items = $("#plannerItemsList");
    const notes = $("#plannerReviewNotes");
    const rules = $("#plannerAppliedRules");
    if (items) {
      const grouped = groupFurnitureForLegend(furniture);
      items.innerHTML = grouped.map(item => `
        <div class="planner-item-row planner-legend-row">
          <div class="planner-legend-symbol">${furnitureSymbolTemplate(item.sample)}</div>
          <div>
            <strong>${item.count}x ${escapeHtml(item.label)}</strong>
            <span class="planner-muted">${escapeHtml(item.codigo || item.tipo || "Item cadastrado")}</span>
          </div>
        </div>
      `).join("") || `<div class="planner-muted">${state.generated ? "Nenhum item foi posicionado. Revise as areas demarcadas e gere novamente." : "Clique em Iniciar geracao para montar a primeira proposta."}</div>`;
    }
    if (notes) {
      notes.innerHTML = [
        "A planta crua do local foi usada como base principal.",
        plannerEngineMessage(),
        "A ordem de decisao priorizou referencias historicas, circulacao, estetica, conforto e somente depois ocupacao do espaco.",
        "Espacos vazios foram preservados quando ajudam fluxo, fotos, filas ou operacao da equipe.",
        state.creationMode === "assistida" ? "As demarcacoes manuais foram tratadas como prioridade." : "A IA usou as referencias do local para criar a primeira proposta.",
        "Revise corredores, areas livres e itens antes de aprovar."
      ].map(note => `<div class="planner-note"><strong>Planejador IA</strong><span>${note}</span></div>`).join("");
    }
    if (rules) {
      rules.innerHTML = appliedRulesList(place).map(rule => `
        <div class="planner-rule-applied"><strong>OK</strong><span>${escapeHtml(rule)}</span></div>
      `).join("") || `<div class="planner-muted">Nenhuma area com regra especifica foi demarcada.</div>`;
    }
  }

  function appliedRulesList(place) {
    const areas = place?.objects.filter(object => object.kind === "area") || [];
    const rules = [];
    areas.forEach(area => {
      const type = normalizeAreaType(area.areaType || area.label);
      if (type === "pista de danca") rules.push("Pista de danca: area livre sem itens");
      else if (type === "palco") rules.push("Palco: area livre e visao preservada");
      else if (type === "mesa de bolo") rules.push("Mesa de bolo: sem cadeiras e com area livre para fotos");
      else if (type === "lounge") rules.push("Lounge: composicao completa aplicada");
      else if (type === "area livre" || type === "area tecnica") rules.push(`${areaRules[type].titulo}: sem ocupacao de mobiliario`);
    });
    rules.push("Circulacoes principais verificadas");
    rules.push("Corredores para pista, bar, buffet e operacao preservados");
    rules.push("Areas nobres priorizadas para lounges e pontos de permanencia");
    rules.push("Sobreposicoes e colisoes verificadas");
    return rules;
  }

  function plannerEngineMessage() {
    if (state.aiStatus === "ok") {
      return "A distribuicao foi gerada pela IA remota do Planejador.";
    }
    if (state.aiStatus === "integrated") {
      return "A distribuicao foi criada pelo motor inteligente integrado, usando os itens reais cadastrados.";
    }
    if (!canUseRemotePlannerAi()) {
      return "Ambiente local detectado: o motor inteligente integrado montou a proposta sem depender da IA remota.";
    }
    return "O motor inteligente integrado montou a proposta com base nas regras operacionais do Acervo.";
  }

  function groupFurnitureForLegend(furniture) {
    const map = new Map();
    furniture.forEach(item => {
      const key = item.itemId || item.label;
      const current = map.get(key) || {
        label: item.label,
        codigo: item.itemCodigo,
        tipo: item.itemTipo,
        count: 0,
        sample: item
      };
      current.count += 1;
      map.set(key, current);
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  function renderCanvasInto(selector, options = {}) {
    const target = $(selector);
    const plant = activePlant();
    const place = activePlace();
    if (!target || !place) return;
    target.dataset.canvasMode = options.mode || "mark";

    const visibleObjects = ["generate", "review"].includes(options.mode)
      ? place.objects.filter(object => object.kind === "furniture")
      : place.objects;

    target.innerHTML = `
      <div class="planner-empty-canvas" style="${plant ? "display:none" : ""}">
        <strong>Nenhuma planta selecionada</strong>
        <span>Volte para a etapa Local e cadastre uma planta crua.</span>
      </div>
      ${canvasPlantTemplate(plant)}
      <div class="planner-layer">
        ${visibleObjects.map(objectTemplate).join("")}
      </div>
    `;

    target.querySelectorAll(".planner-object").forEach(el => {
      el.addEventListener("pointerdown", handleObjectPointerDown);
    });
    target.onclick = event => handleCanvasClick(event, options.mode);
  }

  function objectTemplate(object) {
    const color = object.kind === "area" ? areaColor(object.label) : "";
    const areaStyle = object.kind === "area"
      ? `--area-color:${color};--area-bg:${hexToRgba(color, 0.14)};`
      : "";
    const symbol = object.kind === "furniture" ? furnitureSymbolTemplate(object) : "";
    const rotation = Number(object.rotation || 0);
    return `
      <div class="planner-object ${object.kind} ${object.id === state.selectedId ? "selected" : ""}"
        data-object-id="${object.id}"
        title="${escapeHtml(object.label)}"
        style="left:${object.x}px;top:${object.y}px;width:${object.w}px;height:${object.h}px;transform:rotate(${rotation}deg);${areaStyle}">
        ${object.kind === "area" ? `<em class="rotation-badge">${Math.round(rotation)}Â°</em><button type="button" class="rotate-handle" title="Girar Ã¡rea"></button>` : ""}
        ${object.kind === "obstacle" ? '<span class="planner-halo"></span>' : ""}
        ${symbol || `<span>${escapeHtml(object.label)}</span>`}
        <i class="resize-handle"></i>
      </div>
    `;
  }

  function furnitureSymbolTemplate(object) {
    const type = object.symbolType || object.itemTipo || "decoracao";
    if (["mesa", "mesa_quadrada", "mesa_retangular"].includes(type)) {
      const tableClass = type === "mesa_retangular" ? "table-rect" : type === "mesa_quadrada" ? "table-square" : "table-round";
      return `
        <div class="planner-symbol ${tableClass}">
          <span class="table-core"></span>
          ${Array.from({ length: type === "mesa_retangular" ? 10 : 8 }, (_, index) => `<i class="chair c${index + 1}"></i>`).join("")}
        </div>
      `;
    }
    if (type === "bistro") {
      return `
        <div class="planner-symbol bistro-symbol">
          <span class="table-core"></span>
          <i class="chair c1"></i><i class="chair c2"></i><i class="chair c3"></i>
        </div>
      `;
    }
    if (type === "lounge") {
      return `
        <div class="planner-symbol lounge-symbol">
          <span class="sofa"></span><i></i><i></i><b></b>
        </div>
      `;
    }
    if (type === "apoio") return `<div class="planner-symbol bar-symbol"></div>`;
    if (type === "cadeira") return `<div class="planner-symbol chair-symbol"></div>`;
    return `<div class="planner-symbol decor-symbol"></div>`;
  }

  function areaColor(label) {
    const colors = {
      pista: "#2563eb",
      palco: "#7c3aed",
      bar: "#0891b2",
      buffet: "#1f1515",
      lounge: "#16a34a",
      "mesa da familia": "#db2777",
      "mesa de bolo": "#d97706",
      cerimonia: "#0f766e",
      "espaco kids": "#9333ea",
      "area vip": "#b45309"
    };
    return colors[normalize(label)] || "#64748b";
  }

  function hexToRgba(hex, alpha) {
    const clean = String(hex || "").replace("#", "");
    const value = clean.length === 3
      ? clean.split("").map(char => char + char).join("")
      : clean.padEnd(6, "0").slice(0, 6);
    const num = parseInt(value, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function renderFooter() {
    const prev = $("#plannerPrev");
    const next = $("#plannerNext");
    const hint = $("#plannerStepHint");
    if (!prev || !next || !hint) return;
    prev.disabled = state.currentStep === 1;
    next.textContent = state.currentStep === 6 ? "Finalizar" : "Proximo";
    next.disabled = state.currentStep === 2 && !state.creationMode;
    hint.textContent = [
      "Busque ou cadastre um local antes de continuar.",
      "Escolha como a planta sera criada.",
      state.creationMode === "automatica" ? "Modo automatico selecionado. Revise as sugestoes antes de gerar." : "Demarque pontos importantes para orientar a IA.",
      "Defina estilo e preferencias.",
      "Gere a distribuicao automatica.",
      "Revise, ajuste e aprove o layout."
    ][state.currentStep - 1] || "";
  }

  function plantPreviewTemplate(file, emptyText) {
    if (!file?.url) return emptyPreview("Sem planta crua", emptyText);
    if (file.tipo === "pdf") {
      return `<iframe src="${file.url}" title="${escapeHtml(file.nome)}"></iframe>`;
    }
    return `<img src="${file.url}" alt="${escapeHtml(file.nome)}">`;
  }

  function canvasPlantTemplate(file) {
    if (!file?.url) return "";
    if (file.tipo === "pdf") {
      return `<iframe src="${file.url}" title="${escapeHtml(file.nome)}" style="border:0;height:100%;inset:0;position:absolute;width:100%;"></iframe>`;
    }
    return `<img src="${file.url}" alt="${escapeHtml(file.nome)}" style="display:block;height:100%;width:100%;object-fit:contain;opacity:.94;position:absolute;inset:0;">`;
  }

  function emptyPreview(title, text) {
    return `<div class="planner-empty-preview"><strong>${title}</strong><span>${text}</span></div>`;
  }

  function goToStep(step) {
    state.currentStep = Math.max(1, Math.min(steps.length, step));
    saveState();
    render();
  }

  function nextStep() {
    if (!canAdvance()) return;
    state.completed.add(state.currentStep);
    if (state.currentStep === 2 && state.creationMode === "automatica") {
      runAutoReading();
      goToStep(5);
      return;
    }
    if (state.currentStep === 6) return approveLayout();
    goToStep(state.currentStep + 1);
  }

  function canAdvance() {
    const place = activePlace();
    if (state.currentStep === 1 && !place) return warn("Escolha ou cadastre um local para continuar.");
    if (state.currentStep === 1 && !place.rawPlant) return warn("Cadastre a planta crua principal do local antes de continuar.");
    if (state.currentStep === 2 && !state.creationMode) return warn("Escolha o modo de criacao da planta.");
    if (state.currentStep === 5 && !state.generated) return warn("Gere o layout antes de revisar.");
    return true;
  }

  function warn(message) {
    if (window.mostrarAlerta) window.mostrarAlerta(message, "Planejador");
    else alert(message);
    return false;
  }

  function openNewLocalModal() {
    resetNewLocalDraft();
    $("#plannerNewLocalModal")?.classList.remove("hidden");
    $("#plannerNewLocalModal")?.setAttribute("aria-hidden", "false");
    setTimeout(initAddressAutocomplete, 120);
  }

  function closeNewLocalModal() {
    const modal = $("#plannerNewLocalModal");
    if (modal?.contains(document.activeElement)) document.activeElement.blur();
    modal?.classList.add("hidden");
    modal?.setAttribute("aria-hidden", "true");
  }

  function resetNewLocalDraft() {
    state.newLocal = { rawPlant: null, references: [] };
    ["#plannerNewLocalName", "#plannerNewLocalAddress", "#plannerRawPlantUpload", "#plannerReferenceUpload"].forEach(selector => {
      const input = $(selector);
      if (input) input.value = "";
    });
    renderNewLocalPreviews();
  }

  function initAddressAutocomplete() {
    const input = $("#plannerNewLocalAddress");
    if (!input) return;
    if (state.addressAutocomplete?.unbindAll) state.addressAutocomplete.unbindAll();

    const setup = () => {
      if (!window.google?.maps?.places) return;
      state.addressAutocomplete = new google.maps.places.Autocomplete(input, {
        componentRestrictions: { country: "br" },
        fields: ["formatted_address", "geometry", "name"]
      });
      state.addressAutocomplete.addListener("place_changed", () => {
        const place = state.addressAutocomplete.getPlace();
        if (place?.formatted_address) input.value = place.formatted_address;
      });
    };

    if (window.google?.maps?.places) setup();
    else if (window.carregarGoogleMaps) window.carregarGoogleMaps().then(setup).catch(() => warn("Google Places nao carregou. Verifique a chave do Google Maps."));
  }

  async function readFileAsPlant(file) {
    const isPdf = file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
    const url = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return {
      id: uid(),
      nome: file.name,
      tipo: isPdf ? "pdf" : "image",
      url,
      created_at: new Date().toISOString()
    };
  }

  async function handleRawPlantUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    state.newLocal.rawPlant = await readFileAsPlant(file);
    renderNewLocalPreviews();
  }

  async function handleReferenceUpload(event) {
    const files = Array.from(event.target.files || []);
    state.newLocal.references = await Promise.all(files.map(readFileAsPlant));
    renderNewLocalPreviews();
  }

  async function handleAttachRawPlant(event) {
    const place = activePlace();
    const file = event.target.files?.[0];
    if (!place || !file) return;
    place.rawPlant = await readFileAsPlant(file);
    state.generated = false;
    saveState();
    render();
    event.target.value = "";
  }

  async function handleAttachReferences(event) {
    const place = activePlace();
    const files = Array.from(event.target.files || []);
    if (!place || !files.length) return;
    const references = await Promise.all(files.map(readFileAsPlant));
    place.references.push(...references);
    saveState();
    render();
    event.target.value = "";
  }

  function openPlantManager() {
    const place = activePlace();
    if (!place) return warn("Selecione um local para gerenciar as plantas.");
    renderPlantManager();
    $("#plannerPlantManagerModal")?.classList.remove("hidden");
    $("#plannerPlantManagerModal")?.setAttribute("aria-hidden", "false");
  }

  function closePlantManager() {
    const modal = $("#plannerPlantManagerModal");
    if (modal?.contains(document.activeElement)) document.activeElement.blur();
    modal?.classList.add("hidden");
    modal?.setAttribute("aria-hidden", "true");
  }

  function renderPlantManager() {
    const place = activePlace();
    const title = $("#plannerPlantManagerTitle");
    const subtitle = $("#plannerPlantManagerSubtitle");
    const raw = $("#plannerManagerRawPreview");
    const refs = $("#plannerManagerReferenceList");
    if (!place || !title || !subtitle || !raw || !refs) return;

    title.textContent = `Gerenciar plantas - ${place.nome}`;
    subtitle.textContent = place.endereco || "Local sem endereco informado";
    raw.innerHTML = `
      <div class="planner-manager-raw-wrap">
        ${plantPreviewTemplate(place.rawPlant, "Use o botao Trocar planta crua para anexar a planta base principal.")}
      </div>
    `;
    if (place.rawPlant) {
      raw.insertAdjacentHTML("beforeend", `
        <button type="button" class="planner-danger-btn planner-raw-delete" data-delete-raw-plant>Excluir planta crua</button>
      `);
    }

    refs.innerHTML = place.references.length
      ? `<div class="planner-reference-gallery">${place.references.map(file => fileTileTemplate(file)).join("")}</div>`
      : `<div class="planner-muted">Nenhuma planta pronta ou referencia cadastrada para este local.</div>`;
  }

  function fileTileTemplate(file) {
    const preview = referencePreviewTemplate(file);
    return `
      <div class="planner-reference-tile">
        <div class="planner-reference-thumb">${preview}</div>
        <div class="planner-reference-tile-foot">
          <span>${file.tipo === "pdf" ? "PDF" : "Imagem"} - ${new Date(file.created_at).toLocaleDateString("pt-BR")}</span>
          <button type="button" class="planner-danger-btn" data-delete-reference="${file.id}">Excluir</button>
        </div>
      </div>
    `;
  }

  function referencePreviewTemplate(file) {
    if (file?.tipo === "image" && file.url) {
      return `<img src="${file.url}" alt="${escapeHtml(file.nome)}">`;
    }
    if (file?.url) {
      return `<iframe src="${file.url}" title="${escapeHtml(file.nome)}"></iframe>`;
    }
    return `<span>PDF</span>`;
  }

  async function handleManagerRawUpload(event) {
    await handleAttachRawPlant(event);
    renderPlantManager();
  }

  async function handleManagerReferenceUpload(event) {
    await handleAttachReferences(event);
    renderPlantManager();
  }

  function deleteRawPlant() {
    const place = activePlace();
    if (!place) return;
    place.rawPlant = null;
    state.generated = false;
    saveState();
    render();
    renderPlantManager();
  }

  function deleteReference(referenceId) {
    const place = activePlace();
    if (!place) return;
    place.references = place.references.filter(file => file.id !== referenceId);
    saveState();
    render();
    renderPlantManager();
  }

  function renderNewLocalPreviews() {
    const raw = $("#plannerNewRawPreview");
    const refs = $("#plannerNewReferenceList");
    if (raw) raw.innerHTML = plantPreviewTemplate(state.newLocal.rawPlant, "Envie a planta crua principal do local.");
    if (refs) {
      refs.innerHTML = state.newLocal.references.length
        ? `<div class="planner-reference-gallery">${state.newLocal.references.map(file => draftReferenceTileTemplate(file)).join("")}</div>`
        : `<span class="planner-muted">Nenhum arquivo de referencia adicionado.</span>`;
    }
  }

  function draftReferenceTileTemplate(file) {
    return `
      <div class="planner-reference-tile">
        <div class="planner-reference-thumb">${referencePreviewTemplate(file)}</div>
        <div class="planner-reference-tile-foot">
          <span>${file.tipo === "pdf" ? "PDF" : "Imagem"} - ${new Date(file.created_at).toLocaleDateString("pt-BR")}</span>
        </div>
      </div>
    `;
  }

  function createLocal() {
    const nome = $("#plannerNewLocalName")?.value.trim();
    const endereco = $("#plannerNewLocalAddress")?.value.trim();
    if (!nome) return warn("Informe o nome do local.");
    if (!endereco) return warn("Informe o endereco do local.");
    if (!state.newLocal.rawPlant) return warn("Envie a planta crua principal do local.");

    const place = {
      id: uid(),
      nome,
      endereco,
      googlePlace: null,
      rawPlant: state.newLocal.rawPlant,
      references: state.newLocal.references,
      layouts: [],
      objects: []
    };

    state.places.push(place);
    state.activePlaceId = place.id;
    state.creationMode = null;
    state.generated = false;
    state.completed.add(1);
    saveState();
    closeNewLocalModal();
    render();
  }

  function handleCanvasClick(event, mode) {
    if (event.target.closest(".planner-object")) return;
    const point = canvasPoint(event.currentTarget, event);
    if (mode === "marking") {
      const kind = event.shiftKey ? "area" : (state.activeTool ? "obstacle" : "area");
      const label = kind === "area" ? state.activeAreaType : state.activeTool;
      addObject(kind, label, point.x, point.y);
    }
  }

  function canvasPoint(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = 1700 / rect.width;
    const scaleY = 1200 / rect.height;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  }

  function addObject(kind, label, x, y) {
    const place = activePlace();
    if (!place) return;
    const areaType = kind === "area" ? normalizeAreaType(label) : "";
    const object = {
      id: uid(),
      kind,
      label,
      areaType,
      x: Math.max(0, x),
      y: Math.max(0, y),
      w: kind === "obstacle" ? 90 : 220,
      h: kind === "obstacle" ? 90 : 140,
      rotation: 0,
      rules: areaType ? areaRules[areaType]?.resumo || "" : "",
      restrictions: areaType ? areaRestrictions({ areaType, label }).join(", ") : "",
      composition: areaType === "lounge" ? "chiavari-premium" : "",
      places: areaType === "mesa da familia" ? 10 : "",
      locked: kind === "obstacle"
    };
    place.objects.push(object);
    state.selectedId = object.id;
    saveState();
    render();
  }

  function handleObjectPointerDown(event) {
    const el = event.currentTarget;
    const object = activePlace()?.objects.find(item => item.id === el.dataset.objectId);
    if (!object) return;
    event.stopPropagation();
    state.selectedId = object.id;
    if (event.target.matches(".rotate-handle")) {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const startAngle = Math.atan2(event.clientY - cy, event.clientX - cx) * 180 / Math.PI;
      state.rotate = { id: object.id, cx, cy, startAngle, rotation: Number(object.rotation || 0) };
    } else if (event.target.matches(".resize-handle")) {
      state.resize = { id: object.id, sx: event.clientX, sy: event.clientY, w: object.w, h: object.h };
    } else {
      state.drag = { id: object.id, sx: event.clientX, sy: event.clientY, x: object.x, y: object.y };
    }
    render();
  }

  function handlePointerMove(event) {
    if (state.drag) {
      const object = activePlace()?.objects.find(item => item.id === state.drag.id);
      if (!object) return;
      object.x = Math.max(0, state.drag.x + (event.clientX - state.drag.sx) * 1.35);
      object.y = Math.max(0, state.drag.y + (event.clientY - state.drag.sy) * 1.35);
      renderActiveCanvasOnly();
    }
    if (state.resize) {
      const object = activePlace()?.objects.find(item => item.id === state.resize.id);
      if (!object) return;
      object.w = Math.max(44, state.resize.w + (event.clientX - state.resize.sx) * 1.35);
      object.h = Math.max(34, state.resize.h + (event.clientY - state.resize.sy) * 1.35);
      renderActiveCanvasOnly();
    }
    if (state.rotate) {
      const object = activePlace()?.objects.find(item => item.id === state.rotate.id);
      if (!object) return;
      const angle = Math.atan2(event.clientY - state.rotate.cy, event.clientX - state.rotate.cx) * 180 / Math.PI;
      object.rotation = normalizeDegrees(state.rotate.rotation + angle - state.rotate.startAngle);
      renderActiveCanvasOnly();
    }
  }

  function renderActiveCanvasOnly() {
    if (state.currentStep === 3) renderMarkingStep();
    if (state.currentStep === 5) renderGenerationStep();
    if (state.currentStep === 6) renderReviewStep();
  }

  function handlePointerUp() {
    if (state.drag || state.resize || state.rotate) saveState();
    state.drag = null;
    state.resize = null;
    state.rotate = null;
  }

  function deleteSelected() {
    const place = activePlace();
    if (!place || !state.selectedId) return;
    deleteObject(state.selectedId);
  }

  function deleteObject(objectId) {
    const place = activePlace();
    if (!place || !objectId) return;
    place.objects = place.objects.filter(item => item.id !== objectId);
    if (state.selectedId === objectId) state.selectedId = null;
    saveState();
    render();
  }

  function confirmMarks() {
    state.completed.add(3);
    saveState();
    goToStep(4);
  }

  function runAutoReading() {
    const place = activePlace();
    if (!place || place.objects.some(o => o.source === "auto")) return;
    place.objects.push(
      { id: uid(), kind: "obstacle", label: "Coluna", x: 330, y: 260, w: 70, h: 70, source: "auto", locked: true },
      { id: uid(), kind: "obstacle", label: "Coluna", x: 880, y: 260, w: 70, h: 70, source: "auto", locked: true },
      { id: uid(), kind: "area", label: "Pista", x: 520, y: 430, w: 330, h: 250, source: "auto" },
      { id: uid(), kind: "area", label: "Bar", x: 1060, y: 330, w: 280, h: 160, source: "auto" },
      { id: uid(), kind: "area", label: "Lounge", x: 180, y: 680, w: 380, h: 200, source: "auto" }
    );
    saveState();
  }

  async function generateLayout() {
    state.generated = false;
    state.aiStatus = "running";
    const progress = $("#plannerGenerationProgress");
    if (progress) progress.innerHTML = generationSteps.map(text => `<div class="planner-progress-item"><strong>${text}</strong></div>`).join("");
    $("#plannerSeeGenerated")?.classList.add("hidden");
    const place = activePlace();
    if (place) place.objects = place.objects.filter(object => object.kind !== "furniture");
    const preValidation = validatePlannerRules(place, { includeFurniture: false });
    if (!preValidation.ok) {
      state.aiStatus = "blocked";
      showPlannerIssue(preValidation.errors[0], { step: 3 });
      renderReviewStep();
      return;
    }
    goToStep(5);

    const rows = $$("#plannerGenerationProgress .planner-progress-item");
    for (let index = 0; index < rows.length; index++) {
      await wait(240);
      rows[index].classList.add("done");
      rows[index].innerHTML = `<strong>OK ${generationSteps[index]}</strong>`;
    }

    const aiWorked = await createAiFurnitureLayout();
    if (!aiWorked) createFurnitureLayout();
    const cleanup = cleanupGeneratedOverlaps(place);

    const validation = validatePlannerRules(place, { includeFurniture: true });
    if (!validation.ok) {
      if (place) place.objects = place.objects.filter(object => object.kind !== "furniture");
      state.generated = false;
      state.aiStatus = "blocked";
      saveState();
      renderGenerationStep();
      showPlannerIssue(validation.errors[0], { step: 3, regenerate: true });
      return;
    }
    if (cleanup.removed) {
      state.guidance = {
        stepLabel: "Ajuste automÃ¡tico",
        title: "Alguns itens sobrepostos foram removidos",
        message: `${cleanup.removed} item(ns) conflitavam com outros sÃ­mbolos. A planta foi mantida vÃ¡lida; revise a lista e gere novamente se quiser mais preenchimento.`,
        step: 5,
        actionLabel: "Ver geraÃ§Ã£o",
        regenerate: true
      };
    }

    state.generated = true;
    state.completed.add(5);
    saveState();
    $("#plannerSeeGenerated")?.classList.remove("hidden");
    renderGuidanceBanner();
    renderGenerationStep();
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function createAiFurnitureLayout() {
    const supabase = window.supabaseClient;
    const empresaId = window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
    const place = activePlace();
    if (!canUseRemotePlannerAi() || !supabase || !empresaId || !place || !state.itens.length) {
      state.aiStatus = "integrated";
      return false;
    }

    try {
      const { data, error } = await supabase.functions.invoke("planejador-eventos-ai", {
        body: buildPlannerAiPayload(place, empresaId)
      });
      if (error) throw error;
      if (data?.providerStatus !== "ok" || !Array.isArray(data?.layout?.objects)) {
        console.warn("Planejador: IA nao retornou layout estruturado.", data);
        state.aiStatus = data?.providerStatus || "integrated";
        return false;
      }

      const objects = data.layout.objects.map(materializeAiObject).filter(Boolean);
      if (!isUsableAiLayout(objects, place)) {
        state.aiStatus = "integrated";
        return false;
      }

      place.objects.push(...objects.slice(0, 60));
      state.aiStatus = "ok";
      return true;
    } catch (err) {
      console.warn("Planejador: Edge Function de IA indisponivel, usando motor local.", err);
      state.aiStatus = "integrated";
      return false;
    }
  }

  function canUseRemotePlannerAi() {
    const host = window.location.hostname;
    return host !== "127.0.0.1" && host !== "localhost";
  }

  function isUsableAiLayout(objects, place) {
    if (!Array.isArray(objects) || objects.length < 4) return false;
    const hasDinnerArea = place.objects.some(object => {
      if (object.kind !== "area") return false;
      const label = normalize(object.label);
      return label.includes("jantar") || label.includes("mesa") || label.includes("salao");
    });
    const expectedTables = normalizeEventBrief().mesasDesejadas || 0;
    const minimumTables = Math.min(8, Math.max(2, Math.round(expectedTables * 0.45)));
    const hasTableSymbols = objects.filter(object => ["mesa", "mesa_quadrada", "mesa_retangular", "bistro"].includes(object.symbolType)).length >= minimumTables;
    return !hasDinnerArea || hasTableSymbols;
  }

  function buildPlannerAiPayload(place, empresaId) {
    return {
      empresa_id: empresaId,
      local: {
        nome: place.nome,
        endereco: place.endereco,
        referencias: place.references.map(file => ({ nome: file.nome, tipo: file.tipo })),
        padroesReferencias: inferReferencePatterns(place)
      },
      modo: state.creationMode,
      estilo: state.selectedStyle,
      preferencias: Array.from(state.selectedPrefs),
      briefing: normalizeEventBrief(),
      prioridades: decoratorPriorities,
      areaUtilInferida: inferUsableRegion(place, place.objects.filter(object => object.kind === "area")),
      canvas: { width: 1700, height: 1200 },
      areas: place.objects.filter(object => object.kind === "area").map(object => ({
        id: object.id,
        label: object.label,
        areaType: object.areaType || normalizeAreaType(object.label),
        rules: object.rules || areaRuleSummary(object),
        restrictions: areaRestrictions(object),
        composition: object.composition || "",
        places: object.places || "",
        rotation: Math.round(object.rotation || 0),
        x: Math.round(object.x),
        y: Math.round(object.y),
        w: Math.round(object.w),
        h: Math.round(object.h)
      })),
      obstacles: place.objects.filter(object => object.kind === "obstacle").map(object => ({
        label: object.label,
        x: Math.round(object.x),
        y: Math.round(object.y),
        w: Math.round(object.w),
        h: Math.round(object.h)
      })),
      itens: state.itens.slice(0, 80).map(item => ({
        id: item.id,
        nome: item.nome,
        codigo: item.codigo,
        tipo: item.tipo,
        categoria: item.categoria,
        w: Math.round(item.w),
        h: Math.round(item.h),
        operationalW: Math.round(item.operationalW),
        operationalH: Math.round(item.operationalH),
        valorLocacao: item.valorLocacao
      }))
    };
  }

  function materializeAiObject(object) {
    const item = state.itens.find(i => String(i.id) === String(object.item_id || object.itemId))
      || findInventoryForArea(object.area || object.label || "");
    if (!item) return null;
    return furnitureObjectFromItem(item, clamp(Number(object.x), 0, 1600), clamp(Number(object.y), 0, 1120), {
      label: object.label || item.nome,
      source: "ai",
      area: object.area || "",
      rationale: object.rationale || "",
      rotation: Number(object.rotation || 0)
    });
  }

  function normalizeEventBrief() {
    const guests = Number(state.eventBrief.convidados || 0);
    const tables = Number(state.eventBrief.mesas || 0);
    const lounges = Number(state.eventBrief.lounges || 0);
    return {
      convidados: guests || null,
      mesasDesejadas: tables || Math.max(0, Math.round((guests || 0) / 10)) || null,
      loungesDesejados: lounges || null,
      ocupacao: Number($("#plannerOccupancy")?.value || 45)
    };
  }

  function inferReferencePatterns(place) {
    const refs = place?.references || [];
    const text = normalize(refs.map(file => file.nome).join(" "));
    return {
      quantidadeReferencias: refs.length,
      deveEstudarHistorico: refs.length >= 2,
      pistaRecorrente: text.includes("pista") || text.includes("danca"),
      barRecorrente: text.includes("bar"),
      buffetRecorrente: text.includes("buffet"),
      boloRecorrente: text.includes("bolo"),
      loungeRecorrente: text.includes("lounge"),
      mesasRecorrentes: text.includes("mesa") || text.includes("layout"),
      instrucao: refs.length
        ? "Use as plantas de referencia como memoria do local: identifique padroes recorrentes antes de criar um layout novo."
        : "Sem referencias historicas anexadas; priorize fluxo de circulacao e areas demarcadas."
    };
  }

  function createFurnitureLayout() {
    const place = activePlace();
    if (!place) return;
    const obstacles = place.objects.filter(object => object.kind === "obstacle");
    const areas = place.objects.filter(object => object.kind === "area");
    const decoratorPlan = buildDecoratorPlan(place, areas);
    const restrictedAreas = [...areas.filter(area => areaBlocksFurniture(area)), ...decoratorPlan.corridors];
    const zones = buildLayoutZones(areas, decoratorPlan).sort((a, b) => zonePriority(a) - zonePriority(b));
    const budgets = { ...decoratorPlan.budgets };
    const furniture = [];

    zones.forEach(zone => {
      const order = itemOrder(zone.label);
      const step = layoutStepForZone(zone.label);
      const margin = layoutMarginForZone(zone.label);
      let row = 0;
      for (let y = zone.y + margin.y; y < zone.y + zone.h - 70; y += step.y) {
        const rowOffset = row % 2 ? Math.round(step.x * 0.38) : 0;
        for (let x = zone.x + margin.x + rowOffset; x < zone.x + zone.w - 70; x += step.x) {
          const item = order.find(candidate => respectsDecoratorBudget(candidate, zone, budgets) && fits(candidate, x, y, obstacles, furniture, restrictedAreas, zone));
          if (!item) continue;
          furniture.push(furnitureObjectFromItem(item, x, y, { source: "local", area: zone.label, rotation: Number(zone.rotation || 0) }));
          consumeDecoratorBudget(item, zone, budgets);
        }
        row += 1;
      }
    });

    place.objects.push(...furniture);
    state.aiStatus = "integrated";
  }

  function buildDecoratorPlan(place, areas) {
    const brief = normalizeEventBrief();
    const tableTarget = brief.mesasDesejadas || 10;
    const loungeTarget = brief.loungesDesejados || (areas.some(area => normalizeAreaType(area.areaType || area.label) === "lounge") ? 1 : 2);
    const usableRegion = inferUsableRegion(place, areas);
    return {
      referencePatterns: inferReferencePatterns(place),
      priorities: decoratorPriorities,
      usableRegion,
      budgets: {
        mesas: Math.max(4, Math.min(28, tableTarget)),
        lounges: Math.max(0, Math.min(6, loungeTarget)),
        bistros: 8,
        apoios: 4,
        cadeirasCerimonia: 80
      },
      corridors: buildCirculationCorridors(areas, usableRegion)
    };
  }

  function inferUsableRegion(place, areas) {
    const manualMainArea = areas.find(area => {
      const type = normalizeAreaType(area.areaType || area.label);
      const label = normalize(area.label);
      return !areaBlocksFurniture(area) && (label.includes("salao") || label.includes("jantar") || label.includes("principal") || type === "personalizado");
    });
    if (manualMainArea) {
      return { type: "rect", bounds: objectBounds(manualMainArea), source: "manual" };
    }

    const text = normalize(`${place?.nome || ""} ${place?.rawPlant?.nome || ""} ${(place?.references || []).map(file => file.nome).join(" ")}`);
    const likelyCircularHall = text.includes("vale dos desejos") || text.includes("layout") || text.includes("planta");
    if (likelyCircularHall) {
      return {
        type: "circle",
        cx: 875,
        cy: 520,
        r: 385,
        source: "inferido pela planta principal"
      };
    }

    return { type: "rect", bounds: { x: 210, y: 130, w: 1240, h: 860 }, source: "inferido" };
  }

  function buildCirculationCorridors(areas, usableRegion = null) {
    const corridors = usableRegion?.type === "circle"
      ? []
      : [
          { id: "corridor-main", kind: "area", label: "Corredor principal", x: 800, y: 100, w: 70, h: 940, rotation: 0 },
          { id: "corridor-service", kind: "area", label: "Corredor operacional", x: 160, y: 1040, w: 1360, h: 50, rotation: 0 }
        ];
    areas.forEach(area => {
      const type = normalizeAreaType(area.areaType || area.label);
      if (["pista de danca", "palco", "buffet", "bar", "mesa de bolo"].includes(type)) {
        const bounds = expand(objectBounds(area), type === "pista de danca" ? 42 : 30);
        corridors.push({ ...bounds, id: `flow-${area.id}`, kind: "area", label: `Circulacao - ${area.label}`, rotation: 0 });
      }
    });
    return corridors;
  }

  function zonePriority(zone) {
    const n = normalize(zone.label);
    if (n.includes("bolo")) return 1;
    if (n.includes("lounge")) return 2;
    if (n.includes("bar")) return 3;
    if (n.includes("buffet")) return 4;
    if (n.includes("mesa") || n.includes("jantar")) return 5;
    if (n.includes("bistro")) return 6;
    return 9;
  }

  function respectsDecoratorBudget(item, zone, budgets) {
    const zoneType = normalizeAreaType(zone.areaType || zone.label);
    if (zoneType === "mesa de bolo") return item.tipo === "apoio" && budgets.apoios > 0;
    if (zoneType === "lounge") return item.tipo === "lounge" && budgets.lounges > 0;
    if (zoneType === "bar") return ["apoio", "bistro"].includes(item.tipo) && (item.tipo === "bistro" ? budgets.bistros > 0 : budgets.apoios > 0);
    if (zoneType === "buffet") return item.tipo === "apoio" && budgets.apoios > 0;
    if (zoneType === "cerimonia") return item.tipo === "cadeira" && budgets.cadeirasCerimonia > 0;
    if (item.tipo === "mesa" || item.tipo === "mesa_quadrada" || item.tipo === "mesa_retangular") return budgets.mesas > 0;
    if (item.tipo === "bistro") return budgets.bistros > 0;
    return false;
  }

  function consumeDecoratorBudget(item, zone, budgets) {
    const zoneType = normalizeAreaType(zone.areaType || zone.label);
    if (zoneType === "lounge" && item.tipo === "lounge") budgets.lounges -= 1;
    else if (zoneType === "bar" && item.tipo === "bistro") budgets.bistros -= 1;
    else if (zoneType === "cerimonia" && item.tipo === "cadeira") budgets.cadeirasCerimonia -= 1;
    else if (item.tipo === "mesa" || item.tipo === "mesa_quadrada" || item.tipo === "mesa_retangular") budgets.mesas -= 1;
    else if (item.tipo === "bistro") budgets.bistros -= 1;
    else if (item.tipo === "apoio") budgets.apoios -= 1;
  }

  function buildLayoutZones(areas, decoratorPlan = {}) {
    const manualZones = areas.filter(area => area.source !== "auto" && !areaBlocksFurniture(area));
    const base = manualZones.length ? [...manualZones] : [];
    const hasDinner = base.some(area => {
      const label = normalize(area.label);
      return label.includes("jantar") || label.includes("mesa") || label.includes("salao");
    });

    if (!hasDinner) {
      const region = decoratorPlan.usableRegion || {};
      if (region.type === "circle") {
        const circle = { cx: region.cx, cy: region.cy, r: region.r };
        base.push(
          { id: "auto-jantar-topo", kind: "area", label: "Jantar dentro do salao", x: 585, y: 135, w: 575, h: 250, safeShape: { type: "circle", ...circle } },
          { id: "auto-jantar-meio", kind: "area", label: "Jantar dentro do salao", x: 500, y: 355, w: 740, h: 275, safeShape: { type: "circle", ...circle } },
          { id: "auto-jantar-base", kind: "area", label: "Jantar dentro do salao", x: 585, y: 610, w: 575, h: 250, safeShape: { type: "circle", ...circle } }
        );
        return base;
      }
      base.push(
        { id: "auto-jantar-esquerda", kind: "area", label: "Jantar lateral esquerdo", x: 250, y: 180, w: 430, h: 620 },
        { id: "auto-jantar-direita", kind: "area", label: "Jantar lateral direito", x: 980, y: 180, w: 430, h: 620 },
        { id: "auto-bistro-bar", kind: "area", label: "Bistros proximos ao bar", x: 1180, y: 820, w: 280, h: 180 }
      );
    }

    areas
      .filter(area => {
        const label = normalize(area.label);
        return !areaBlocksFurniture(area) && (label.includes("bar") || label.includes("buffet") || label.includes("lounge") || label.includes("cerimonia"));
      })
      .forEach(area => base.push(area));

    if (!base.length) {
      base.push({ id: "auto-jantar", kind: "area", label: "Jantar", x: 220, y: 150, w: 1180, h: 780 });
    }

    return base;
  }

  function layoutStepForZone(label) {
    const n = normalize(label);
    if (n.includes("bar") || n.includes("buffet")) return { x: 210, y: 135 };
    if (n.includes("lounge")) return { x: 205, y: 150 };
    if (n.includes("cerimonia") || n.includes("palco")) return { x: 72, y: 54 };
    if (n.includes("bistro")) return { x: 112, y: 108 };
    return { x: 142, y: 132 };
  }

  function layoutMarginForZone(label) {
    const n = normalize(label);
    if (n.includes("bar") || n.includes("buffet")) return { x: 18, y: 26 };
    if (n.includes("lounge")) return { x: 20, y: 24 };
    if (n.includes("cerimonia") || n.includes("palco")) return { x: 14, y: 14 };
    if (n.includes("bistro")) return { x: 18, y: 20 };
    return { x: 20, y: 22 };
  }

  function itemOrder(label) {
    const n = normalize(label);
    const itens = state.itens.length ? state.itens : catalog;
    const byType = (...types) => itens.filter(i => types.includes(i.tipo));
    if (n.includes("pista")) return [];
    if (n.includes("bar")) return [...byType("apoio"), ...byType("bistro")];
    if (n.includes("buffet") || n.includes("bolo")) return [...byType("apoio", "mesa_retangular")];
    if (n.includes("lounge")) return byType("lounge");
    if (n.includes("bistro")) return byType("bistro");
    if (n.includes("palco")) return [];
    if (n.includes("cerimonia")) return byType("cadeira");
    return byType("mesa", "mesa_quadrada", "mesa_retangular", "bistro");
  }

  function findInventoryForArea(label) {
    return itemOrder(label)[0] || null;
  }

  function furnitureObjectFromItem(item, x, y, extra = {}) {
    return {
      id: uid(),
      kind: "furniture",
      itemId: item.id,
      label: extra.label || item.nome,
      x,
      y,
      w: symbolicSize(item.tipo).w,
      h: symbolicSize(item.tipo).h,
      itemImage: item.foto_url || "",
      itemTipo: item.tipo,
      symbolType: item.tipo,
      itemCodigo: item.codigo || "",
      source: extra.source || "local",
      area: extra.area || "",
      rationale: extra.rationale || "",
      rotation: Number(extra.rotation || 0)
    };
  }

  function symbolicSize(tipo) {
    return {
      mesa: { w: 96, h: 96 },
      mesa_quadrada: { w: 92, h: 92 },
      mesa_retangular: { w: 132, h: 80 },
      bistro: { w: 58, h: 58 },
      lounge: { w: 138, h: 86 },
      apoio: { w: 152, h: 46 },
      cadeira: { w: 32, h: 32 },
      decoracao: { w: 42, h: 42 }
    }[tipo] || { w: 76, h: 76 };
  }

  function fits(item, x, y, obstacles, furniture, restrictedAreas = [], zone = null) {
    const rect = { x, y, w: item.operationalW, h: item.operationalH, rotation: 0 };
    const insideZone = isInsideSafeShape(rect, zone);
    const noCollision = [...obstacles, ...furniture].every(obj => !intersects(rect, expand(objectBounds(obj), obj.kind === "obstacle" ? 28 : 12)));
    const respectsFreeAreas = restrictedAreas.every(area => !intersects(rect, expand(objectBounds(area), 8)));
    return insideZone && noCollision && respectsFreeAreas;
  }

  function isInsideSafeShape(rect, zone) {
    if (!zone?.safeShape) return true;
    if (zone.safeShape.type === "circle") {
      return rectCorners(rect).every(point => {
        const dx = point.x - zone.safeShape.cx;
        const dy = point.y - zone.safeShape.cy;
        return Math.sqrt(dx * dx + dy * dy) <= zone.safeShape.r - 8;
      });
    }
    if (zone.safeShape.type === "rect") {
      const bounds = zone.safeShape.bounds;
      return rect.x >= bounds.x && rect.y >= bounds.y && rect.x + rect.w <= bounds.x + bounds.w && rect.y + rect.h <= bounds.y + bounds.h;
    }
    return true;
  }

  function rectCorners(rect) {
    return [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x, y: rect.y + rect.h },
      { x: rect.x + rect.w, y: rect.y + rect.h }
    ];
  }

  function intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function expand(obj, pad) {
    return { x: obj.x - pad, y: obj.y - pad, w: obj.w + pad * 2, h: obj.h + pad * 2 };
  }

  function objectBounds(obj) {
    const rotation = Math.abs(Number(obj.rotation || 0) % 180);
    if (!rotation) return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    const rad = rotation * Math.PI / 180;
    const w = Math.abs(obj.w * Math.cos(rad)) + Math.abs(obj.h * Math.sin(rad));
    const h = Math.abs(obj.w * Math.sin(rad)) + Math.abs(obj.h * Math.cos(rad));
    return {
      x: obj.x + obj.w / 2 - w / 2,
      y: obj.y + obj.h / 2 - h / 2,
      w,
      h
    };
  }

  function areaBlocksFurniture(area) {
    const type = normalizeAreaType(area.areaType || area.label);
    return !!areaRules[type]?.bloqueiaItens;
  }

  function validatePlannerRules(place, options = {}) {
    if (!place) return { ok: false, errors: ["Selecione um local antes de gerar a planta."] };
    const areas = place.objects.filter(object => object.kind === "area");
    const furniture = options.includeFurniture ? place.objects.filter(object => object.kind === "furniture") : [];
    const errors = [];
    areas.forEach(area => {
      const type = normalizeAreaType(area.areaType || area.label);
      const rule = areaRules[type] || areaRules.personalizado;
      if (!area.w || !area.h) errors.push(`${rule.titulo}: informe largura e altura validas.`);
      if (rule.bloqueiaItens && furniture.some(item => intersects(objectBounds(item), objectBounds(area)))) {
        errors.push(`${rule.titulo}: area livre recebeu mobiliario. Remova itens ou ajuste a demarcacao.`);
      }
      if (type === "mesa de bolo" && furniture.some(item => item.itemTipo === "cadeira" && intersects(objectBounds(item), objectBounds(area)))) {
        errors.push("Mesa de bolo: nao pode receber cadeiras.");
      }
      if (type === "lounge" && !area.composition) {
        errors.push("Lounge: selecione uma composicao completa antes de gerar.");
      }
    });

    for (let i = 0; i < furniture.length; i += 1) {
      for (let j = i + 1; j < furniture.length; j += 1) {
        if (intersects(expand(objectBounds(furniture[i]), 8), expand(objectBounds(furniture[j]), 8))) {
          errors.push("Sobreposicao detectada entre itens. Ajuste as areas ou gere novamente.");
          return { ok: false, errors };
        }
      }
    }

    return { ok: !errors.length, errors };
  }

  function cleanupGeneratedOverlaps(place) {
    if (!place) return { removed: 0 };
    const keep = [];
    const removedIds = new Set();
    const furniture = place.objects.filter(object => object.kind === "furniture");
    furniture.forEach(item => {
      const collision = keep.some(saved => intersects(expand(objectBounds(item), 6), expand(objectBounds(saved), 6)));
      if (collision) removedIds.add(item.id);
      else keep.push(item);
    });
    if (!removedIds.size) return { removed: 0 };
    place.objects = place.objects.filter(object => object.kind !== "furniture" || !removedIds.has(object.id));
    return { removed: removedIds.size };
  }

  function showPlannerIssue(message, options = {}) {
    const guidance = guidanceForIssue(message, options);
    state.guidance = guidance;
    saveState();
    if (guidance.step) goToStep(guidance.step);
    else renderGuidanceBanner();
    return false;
  }

  function guidanceForIssue(message, options = {}) {
    const cleanMessage = String(message || "O Planejador encontrou um ajuste necessario.");
    const lower = normalize(cleanMessage);
    if (lower.includes("sobreposicao")) {
      return {
        stepLabel: "Ajuste recomendado: Etapa 3",
        title: "As Ã¡reas estÃ£o apertadas para a quantidade de itens",
        message: "Volte para a Etapa 3 e aumente a Ã¡rea de jantar/lounge ou remova uma Ã¡rea muito pequena. Se preferir, gere novamente para o Planejador tentar outra distribuiÃ§Ã£o.",
        step: options.step || 3,
        actionLabel: "Ir para Etapa 3",
        regenerate: true
      };
    }
    if (lower.includes("area livre") || lower.includes("pista") || lower.includes("palco")) {
      return {
        stepLabel: "Ajuste recomendado: Etapa 3",
        title: "Existe item dentro de uma Ã¡rea livre",
        message: "Na Etapa 3, confira as demarcaÃ§Ãµes de Pista, Palco, Ãrea livre ou Ãrea tÃ©cnica. Essas Ã¡reas nÃ£o podem receber mÃ³veis.",
        step: options.step || 3,
        actionLabel: "Revisar Ã¡reas",
        regenerate: true
      };
    }
    if (lower.includes("lounge")) {
      return {
        stepLabel: "Ajuste recomendado: Etapa 3",
        title: "O lounge precisa de uma composiÃ§Ã£o completa",
        message: "Clique na Ã¡rea de Lounge na Etapa 3 e escolha uma composiÃ§Ã£o. O Planejador nÃ£o monta lounge incompleto.",
        step: options.step || 3,
        actionLabel: "Configurar lounge",
        regenerate: false
      };
    }
    return {
      stepLabel: "Ajuste recomendado",
      title: "Revise uma configuraÃ§Ã£o antes de gerar",
      message: cleanMessage,
      step: options.step || 3,
      actionLabel: "Ir para ajuste",
      regenerate: !!options.regenerate
    };
  }

  function approveLayout() {
    const place = activePlace();
    if (!place) return;
    place.layouts.push({
      id: uid(),
      aprovado: true,
      modo: state.creationMode,
      created_at: new Date().toISOString(),
      objects: JSON.parse(JSON.stringify(place.objects))
    });
    saveState();
    warn("Layout aprovado e salvo no conhecimento do local.");
  }

  function handleDocumentClick(event) {
    const guidanceStep = event.target.closest("[data-guidance-step]");
    if (guidanceStep) {
      goToStep(Number(guidanceStep.dataset.guidanceStep));
      return;
    }

    const guidanceRegenerate = event.target.closest("[data-guidance-regenerate]");
    if (guidanceRegenerate) {
      state.guidance = null;
      generateLayout();
      return;
    }

    const guidanceClose = event.target.closest("[data-guidance-close]");
    if (guidanceClose) {
      state.guidance = null;
      saveState();
      renderGuidanceBanner();
      return;
    }

    const placeButton = event.target.closest("[data-select-place]");
    if (placeButton) {
      state.activePlaceId = placeButton.dataset.selectPlace;
      state.creationMode = null;
      state.generated = false;
      state.completed.add(1);
      saveState();
      render();
      return;
    }

    const modeButton = event.target.closest("[data-mode-choice]");
    if (modeButton) {
      state.creationMode = modeButton.dataset.modeChoice;
      state.completed.add(2);
      saveState();
      render();
      return;
    }

    const obstacleTool = event.target.closest("[data-obstacle-tool]");
    if (obstacleTool) {
      state.activeTool = obstacleTool.dataset.obstacleTool;
      return;
    }

    const areaTool = event.target.closest("[data-area-type]");
    if (areaTool) {
      state.activeAreaType = areaTool.dataset.areaType;
      state.activeTool = null;
      renderMarkingStep();
      return;
    }

    const style = event.target.closest("[data-style]");
    if (style) {
      state.selectedStyle = style.dataset.style;
      renderStyleStep();
      return;
    }

    const pref = event.target.closest("[data-pref]");
    if (pref) {
      const value = pref.dataset.pref;
      if (state.selectedPrefs.has(value)) state.selectedPrefs.delete(value);
      else state.selectedPrefs.add(value);
      renderStyleStep();
      return;
    }

    const collapseButton = event.target.closest("[data-collapse-panel]");
    if (collapseButton) {
      collapseButton.closest(".planner-collapsible-card")?.classList.toggle("is-collapsed");
      return;
    }

    const deleteReferenceButton = event.target.closest("[data-delete-reference]");
    if (deleteReferenceButton) {
      deleteReference(deleteReferenceButton.dataset.deleteReference);
      return;
    }

    const deleteObjectButton = event.target.closest("[data-delete-object]");
    if (deleteObjectButton) {
      deleteObject(deleteObjectButton.dataset.deleteObject);
      return;
    }

    const selectObjectButton = event.target.closest("[data-select-object]");
    if (selectObjectButton) {
      state.selectedId = selectObjectButton.dataset.selectObject;
      renderMarkingStep();
      return;
    }

    const deleteRawButton = event.target.closest("[data-delete-raw-plant]");
    if (deleteRawButton) {
      deleteRawPlant();
    }
  }

  function handleDocumentInput(event) {
    const briefField = event.target.closest("[data-event-brief]");
    if (briefField) {
      state.eventBrief[briefField.dataset.eventBrief] = briefField.value;
      saveState();
      return;
    }

    const field = event.target.closest("[data-area-field]");
    if (!field) return;
    updateSelectedAreaField(field.dataset.areaField, field.value);
  }

  function bindEvents() {
    $("#plannerPrev")?.addEventListener("click", () => goToStep(state.currentStep - 1));
    $("#plannerNext")?.addEventListener("click", nextStep);
    $("#plannerSaveDraft")?.addEventListener("click", () => { saveState(); warn("Rascunho salvo."); });
    $("#plannerCancel")?.addEventListener("click", () => goToStep(1));
    $("#plannerLocalSearch")?.addEventListener("input", renderLocalStep);
    $("#plannerOpenNewLocalModal")?.addEventListener("click", openNewLocalModal);
    $("#plannerOpenPlantManager")?.addEventListener("click", openPlantManager);
    $("#plannerCloseNewLocalModal")?.addEventListener("click", closeNewLocalModal);
    $("#plannerCancelNewLocal")?.addEventListener("click", closeNewLocalModal);
    $("#plannerClosePlantManager")?.addEventListener("click", closePlantManager);
    $("#plannerClosePlantManagerFooter")?.addEventListener("click", closePlantManager);
    $("#plannerCreateLocal")?.addEventListener("click", createLocal);
    $("#plannerRawPlantUpload")?.addEventListener("change", handleRawPlantUpload);
    $("#plannerReferenceUpload")?.addEventListener("change", handleReferenceUpload);
    $("#plannerAttachRawPlant")?.addEventListener("change", handleAttachRawPlant);
    $("#plannerAttachReferences")?.addEventListener("change", handleAttachReferences);
    $("#plannerManagerRawUpload")?.addEventListener("change", handleManagerRawUpload);
    $("#plannerManagerReferenceUpload")?.addEventListener("change", handleManagerReferenceUpload);
    $("#plannerDeleteMark")?.addEventListener("click", deleteSelected);
    $("#plannerConfirmMarks")?.addEventListener("click", confirmMarks);
    $("#plannerStartGeneration")?.addEventListener("click", generateLayout);
    $("#plannerSeeGenerated")?.addEventListener("click", () => goToStep(6));
    $("#plannerRegenerate")?.addEventListener("click", generateLayout);
    $("#plannerSaveFinalDraft")?.addEventListener("click", () => { saveState(); warn("Rascunho salvo."); });
    $("#plannerApproveLayout")?.addEventListener("click", approveLayout);
    $("#plannerNewLocalModal")?.addEventListener("click", event => {
      if (event.target.id === "plannerNewLocalModal") closeNewLocalModal();
    });
    $("#plannerPlantManagerModal")?.addEventListener("click", event => {
      if (event.target.id === "plannerPlantManagerModal") closePlantManager();
    });

    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("input", handleDocumentInput);
    document.addEventListener("change", handleDocumentInput);
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function initPlanejadorEventos() {
    loadState();
    bindEvents();
    render();
    loadRegisteredPlaces();
    loadInventoryItems();
    window.finalizarCarregamentoModulo?.();
  }

  function destroyPlanejadorEventos() {
    document.removeEventListener("click", handleDocumentClick);
    document.removeEventListener("input", handleDocumentInput);
    document.removeEventListener("change", handleDocumentInput);
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", handlePointerUp);
    if (state.addressAutocomplete?.unbindAll) state.addressAutocomplete.unbindAll();
  }

  window.__moduleInit = initPlanejadorEventos;
  window.__activeModuleDestroy = destroyPlanejadorEventos;
})();
