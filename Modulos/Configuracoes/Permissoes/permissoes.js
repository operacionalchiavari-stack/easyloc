(function () {
  const supabase = () => window.supabaseClient || window.supabase;
  const empresaId = () => window.__CONTEXT?.empresa_id || null;
  const usuarioId = () => window.__CONTEXT?.usuario_id || null;
  const usuarioNome = () => window.__CONTEXT?.usuario_nome || "Usuario";
  const controller = new AbortController();
  const listen = (target, event, handler) => target?.addEventListener(event, handler, { signal: controller.signal });

  const ACTIONS = ["visualizar", "criar", "editar", "excluir", "aprovar"];
  const LEVELS = [
    { key: "sem", label: "Sem acesso", actions: [] },
    { key: "leitura", label: "Somente leitura", actions: ["visualizar"] },
    { key: "operacional", label: "Operacional", actions: ["visualizar", "criar"] },
    { key: "supervisor", label: "Supervisor", actions: ["visualizar", "criar", "editar", "aprovar"] },
    { key: "admin", label: "Administrador", actions: ACTIONS }
  ];
  const STEPS = ["usuario", "perfil", "acessos", "revisao"];

  const LOCAL_CATALOG = [
    ["comercial.clientes.visualizar", "Comercial", "Cadastro de Clientes", "visualizar", "Visualizar clientes", false],
    ["comercial.clientes.criar", "Comercial", "Cadastro de Clientes", "criar", "Cadastrar clientes", false],
    ["comercial.clientes.editar", "Comercial", "Cadastro de Clientes", "editar", "Editar clientes", false],
    ["comercial.clientes.excluir", "Comercial", "Cadastro de Clientes", "excluir", "Excluir clientes", true],
    ["comercial.clientes.dados_sensiveis", "Comercial", "Cadastro de Clientes", "sensivel", "Ver CPF/CNPJ, telefone e email completos", true],
    ["comercial.locais.visualizar", "Comercial", "Cadastro de Locais", "visualizar", "Visualizar locais", false],
    ["comercial.locais.criar", "Comercial", "Cadastro de Locais", "criar", "Cadastrar locais", false],
    ["comercial.locais.editar", "Comercial", "Cadastro de Locais", "editar", "Editar locais", false],
    ["comercial.locais.excluir", "Comercial", "Cadastro de Locais", "excluir", "Excluir locais", true],
    ["comercial.pedidos.visualizar", "Comercial", "Pedidos", "visualizar", "Visualizar pedidos", false],
    ["comercial.pedidos.criar", "Comercial", "Pedidos", "criar", "Criar pedidos", false],
    ["comercial.pedidos.editar", "Comercial", "Pedidos", "editar", "Editar pedidos", false],
    ["comercial.pedidos.cancelar", "Comercial", "Pedidos", "aprovar", "Cancelar pedidos", true],
    ["comercial.pedidos.aprovar", "Comercial", "Pedidos", "aprovar", "Aprovar pedidos", true],
    ["comercial.pedidos.valores", "Comercial", "Pedidos", "sensivel", "Visualizar valores comerciais", true],
    ["estoque.itens.visualizar", "Estoque", "Itens", "visualizar", "Visualizar itens", false],
    ["estoque.itens.criar", "Estoque", "Itens", "criar", "Cadastrar itens", false],
    ["estoque.itens.editar", "Estoque", "Itens", "editar", "Editar itens", false],
    ["estoque.itens.excluir", "Estoque", "Itens", "excluir", "Excluir itens", true],
    ["estoque.itens.qrcode", "Estoque", "Itens", "sensivel", "Gerar e baixar QR Codes", true],
    ["estoque.insumos.visualizar", "Estoque", "Insumos", "visualizar", "Visualizar insumos", false],
    ["estoque.insumos.criar", "Estoque", "Insumos", "criar", "Cadastrar insumos", false],
    ["estoque.insumos.editar", "Estoque", "Insumos", "editar", "Editar insumos", false],
    ["estoque.almoxarifado.visualizar", "Estoque", "Almoxarifado", "visualizar", "Visualizar almoxarifado", false],
    ["estoque.almoxarifado.movimentar", "Estoque", "Almoxarifado", "criar", "Registrar entradas e saidas", false],
    ["estoque.almoxarifado.aprovar", "Estoque", "Almoxarifado", "aprovar", "Aprovar movimentacoes", true],
    ["estoque.compras.visualizar", "Estoque", "Compras", "visualizar", "Visualizar compras", false],
    ["estoque.compras.criar", "Estoque", "Compras", "criar", "Criar compras", false],
    ["estoque.compras.editar", "Estoque", "Compras", "editar", "Editar compras", false],
    ["estoque.compras.receber", "Estoque", "Compras", "aprovar", "Confirmar recebimento", true],
    ["logistica.cronograma.visualizar", "Logistica", "Cronograma", "visualizar", "Visualizar cronograma", false],
    ["logistica.cronograma.editar", "Logistica", "Cronograma", "editar", "Editar cronograma", false],
    ["logistica.planejamento.visualizar", "Logistica", "Planejamento", "visualizar", "Visualizar planejamento logistico", false],
    ["logistica.planejamento.editar", "Logistica", "Planejamento", "editar", "Alocar caminhoes e equipes", false],
    ["logistica.separacao.visualizar", "Logistica", "Separacao", "visualizar", "Visualizar separacao", false],
    ["logistica.separacao.executar", "Logistica", "Separacao", "criar", "Executar leituras de separacao", false],
    ["logistica.separacao.finalizar", "Logistica", "Separacao", "aprovar", "Finalizar separacao", true],
    ["financeiro.fluxo.visualizar", "Financeiro", "Fluxo de Caixa", "visualizar", "Visualizar financeiro", true],
    ["financeiro.fluxo.criar", "Financeiro", "Fluxo de Caixa", "criar", "Criar lancamentos", true],
    ["financeiro.fluxo.editar", "Financeiro", "Fluxo de Caixa", "editar", "Editar lancamentos", true],
    ["financeiro.fluxo.excluir", "Financeiro", "Fluxo de Caixa", "excluir", "Excluir lancamentos", true],
    ["financeiro.contas_receber.visualizar", "Financeiro", "Contas a Receber", "visualizar", "Visualizar contas a receber", true],
    ["financeiro.contas_receber.editar", "Financeiro", "Contas a Receber", "editar", "Editar contas a receber", true],
    ["financeiro.contas_pagar.visualizar", "Financeiro", "Contas a Pagar", "visualizar", "Visualizar contas a pagar", true],
    ["financeiro.contas_pagar.editar", "Financeiro", "Contas a Pagar", "editar", "Editar contas a pagar", true],
    ["rh.colaboradores.visualizar", "RH", "Colaboradores", "visualizar", "Visualizar colaboradores", true],
    ["rh.colaboradores.criar", "RH", "Colaboradores", "criar", "Cadastrar colaboradores", true],
    ["rh.colaboradores.editar", "RH", "Colaboradores", "editar", "Editar colaboradores", true],
    ["rh.ocorrencias.visualizar", "RH", "Ocorrencias", "visualizar", "Visualizar ocorrencias", true],
    ["rh.ocorrencias.criar", "RH", "Ocorrencias", "criar", "Registrar ocorrencias", true],
    ["ia.lia.usar", "Inteligencia Artificial", "Lia", "visualizar", "Usar assistente Lia", false],
    ["ia.studio.visualizar", "Inteligencia Artificial", "Studio IA", "visualizar", "Visualizar Studio IA", false],
    ["ia.studio.gerar", "Inteligencia Artificial", "Studio IA", "criar", "Gerar imagens com IA", true],
    ["configuracoes.empresa.visualizar", "Configuracoes", "Empresa", "visualizar", "Visualizar configuracoes da empresa", true],
    ["configuracoes.empresa.editar", "Configuracoes", "Empresa", "editar", "Editar configuracoes da empresa", true],
    ["configuracoes.permissoes.visualizar", "Configuracoes", "Permissoes", "visualizar", "Visualizar permissoes", true],
    ["configuracoes.permissoes.editar", "Configuracoes", "Permissoes", "editar", "Editar permissoes", true]
  ].map(([chave, modulo, submodulo, acao, descricao, sensivel], index) => ({
    chave, modulo, submodulo, acao, descricao, sensivel, ordem: index
  }));

  const state = {
    users: [],
    catalog: LOCAL_CATALOG,
    selectedUserId: null,
    selectedModule: null,
    permissions: new Map(),
    logs: [],
    dirty: false,
    filter: "",
    currentStep: "usuario"
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  function notify(message, type = "sucesso", title = "Permissões") {
    if (typeof window.alerta === "function") window.alerta(message, title, type);
    else alert(message);
  }

  function initials(name) {
    return String(name || "U")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  function userName(user) {
    return user?.nome || user?.nome_completo || user?.name || user?.email || "Usuario";
  }

  function userEmail(user) {
    return user?.email || user?.login || "";
  }

  function userRole(user) {
    return user?.cargo || user?.funcao || user?.setor || "Equipe";
  }

  function currentSidebarPhoto() {
    const localImg = document.querySelector("#userAvatar img, .user-avatar img, .sidebar-user img");
    const parentImg = window.parent?.document?.querySelector?.("#userAvatar img, .user-avatar img, .sidebar-user img");
    return localImg?.src || parentImg?.src || "";
  }

  function userPhoto(user) {
    const direct = user?.foto_url || user?.avatar_url || user?.foto || user?.imagem_url || user?.photo_url || "";
    if (direct) return direct;

    const currentId = usuarioId();
    if (!currentId || String(user?.id || "") === String(currentId)) {
      return currentSidebarPhoto();
    }

    return "";
  }

  function avatarHtml(user, className = "perm-user-photo", id = "") {
    const photo = userPhoto(user);
    const idAttr = id ? ` id="${id}"` : "";
    return photo
      ? `<div class="${className}"${idAttr}><img src="${photo}" alt="${userName(user)}"></div>`
      : `<div class="${className}"${idAttr}>${initials(userName(user))}</div>`;
  }

  function permissionValue(key) {
    return state.permissions.get(key) === true;
  }

  function setPermission(key, value, render = true) {
    state.permissions.set(key, Boolean(value));
    state.dirty = true;
    $("#permDirtyBadge")?.classList.remove("hidden");
    if (render) renderAllExceptUsers();
  }

  function selectedUser() {
    return state.users.find((user) => String(user.id) === String(state.selectedUserId));
  }

  function groupedCatalog() {
    const groups = new Map();
    state.catalog
      .slice()
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
      .forEach((item) => {
        if (!groups.has(item.modulo)) groups.set(item.modulo, new Map());
        const module = groups.get(item.modulo);
        if (!module.has(item.submodulo)) module.set(item.submodulo, []);
        module.get(item.submodulo).push(item);
      });
    return groups;
  }

  async function loadCatalog() {
    const client = supabase();
    if (!client) return;

    const { data, error } = await client
      .from("permissoes_catalogo")
      .select("*")
      .order("ordem", { ascending: true });

    if (!error && Array.isArray(data) && data.length) {
      state.catalog = data;
    }
  }

  async function loadUsers() {
    const client = supabase();
    const empresa = empresaId();

    if (!client || !empresa) {
      state.users = [{
        id: usuarioId() || "local",
        nome: usuarioNome(),
        email: "",
        cargo: "Administrador"
      }];
      state.selectedUserId = state.users[0].id;
      return;
    }

    try {
      const { data: links, error: linkError } = await client
        .from("usuarios_empresas")
        .select("*")
        .eq("empresa_id", empresa);

      if (linkError) throw linkError;

      const ids = (links || [])
        .map((link) => link.user_id || link.usuario_id || link.id_usuario)
        .filter(Boolean);

      if (!ids.length) {
        state.users = [{ id: usuarioId(), nome: usuarioNome(), cargo: "Administrador", foto_url: currentSidebarPhoto() }];
      } else {
        const { data, error } = await client
          .from("usuarios")
          .select("*")
          .in("id", ids);

        if (error) throw error;

        const linkById = new Map((links || []).map((link) => [
          String(link.user_id || link.usuario_id || link.id_usuario),
          link
        ]));
        const byId = new Map((data || []).map((user) => [String(user.id), user]));
        state.users = ids.map((id) => {
          const link = linkById.get(String(id)) || {};
          const user = byId.get(String(id)) || {};
          return {
            id,
            ...link,
            ...user,
            nome: userName({ ...link, ...user, nome: user.nome || link.nome || link.nome_usuario || "Usuario" }),
            cargo: userRole({ ...link, ...user }),
            foto_url: userPhoto({ ...link, ...user, id })
          };
        });
      }
    } catch (error) {
      console.warn("[Permissoes] Falha ao carregar usuarios, usando usuario atual.", error);
      state.users = [{ id: usuarioId(), nome: usuarioNome(), cargo: "Administrador", foto_url: currentSidebarPhoto() }];
    }

    if (!state.selectedUserId || !state.users.some((user) => String(user.id) === String(state.selectedUserId))) {
      state.selectedUserId = state.users[0]?.id || null;
    }
  }

  async function loadUserPermissions() {
    state.permissions.clear();
    if (!state.selectedUserId || !supabase() || !empresaId()) return;

    const { data, error } = await supabase().rpc("get_permissoes_usuario_resolvidas", {
      p_empresa_id: empresaId(),
      p_usuario_id: state.selectedUserId
    });

    if (error) {
      console.warn("[Permissoes] Sem RPC/tabela de permissoes, aplicando acesso total temporario.", error);
      state.catalog.forEach((item) => state.permissions.set(item.chave, true));
      return;
    }

    (data || []).forEach((item) => state.permissions.set(item.chave, Boolean(item.permitido)));

    if (!state.permissions.size) {
      state.catalog.forEach((item) => state.permissions.set(item.chave, false));
    }
  }

  async function loadLogs() {
    if (!supabase() || !empresaId() || !state.selectedUserId) return;

    const { data, error } = await supabase()
      .from("logs_permissoes")
      .select("*")
      .eq("empresa_id", empresaId())
      .eq("usuario_alvo_id", state.selectedUserId)
      .order("created_at", { ascending: false })
      .limit(30);

    state.logs = error ? [] : (data || []);
  }

  function renderUsers() {
    const list = $("#permUserList");
    if (!list) return;

    const term = state.filter.toLowerCase();
    const users = state.users.filter((user) => {
      const haystack = `${userName(user)} ${userEmail(user)} ${userRole(user)}`.toLowerCase();
      return haystack.includes(term);
    });

    list.innerHTML = users.map((user) => `
      <button class="perm-user-card ${String(user.id) === String(state.selectedUserId) ? "active" : ""}" type="button" data-user-id="${user.id}">
        ${avatarHtml(user)}
        <span class="perm-user-card-info">
          <strong>${userName(user)}</strong>
          <span>${userEmail(user) || userRole(user)}</span>
          <span>${userRole(user)}</span>
        </span>
      </button>
    `).join("") || `<div class="perm-note">Nenhum usuario encontrado.</div>`;
  }

  function renderSelectedHeader() {
    const user = selectedUser();
    const allowed = state.catalog.filter((item) => permissionValue(item.chave)).length;
    const blocked = Math.max(0, state.catalog.length - allowed);
    const sensitive = state.catalog.filter((item) => item.sensivel && permissionValue(item.chave)).length;

    const avatar = $("#permAvatar");
    if (avatar) avatar.outerHTML = avatarHtml(user, "perm-avatar", "permAvatar");
    $("#permUserName").textContent = user ? userName(user) : "Selecione um usuário";
    $("#permUserMeta").textContent = user ? `${userEmail(user) || "Sem email"} · ${userRole(user)}` : "Configure os acessos por modulo.";
    $("#permSummary").innerHTML = `
      <div class="perm-summary-item"><span>Liberadas</span><strong>${allowed}</strong></div>
      <div class="perm-summary-item"><span>Bloqueadas</span><strong>${blocked}</strong></div>
      <div class="perm-summary-item"><span>Sensíveis</span><strong>${sensitive}</strong></div>
    `;
  }

  function renderSteps() {
    const activeIndex = Math.max(0, STEPS.indexOf(state.currentStep));

    $$("[data-step]").forEach((button) => {
      const index = STEPS.indexOf(button.dataset.step);
      button.classList.toggle("active", button.dataset.step === state.currentStep);
      button.classList.toggle("done", index > -1 && index < activeIndex);
    });

    $$("[data-step-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.stepPanel === state.currentStep);
    });

    const prev = $("#permPrevStepBtn");
    const next = $("#permNextStepBtn");
    const bottomSave = $("#permBottomSaveBtn");

    if (prev) prev.disabled = activeIndex <= 0;
    if (next) next.hidden = state.currentStep === "revisao";
    if (bottomSave) bottomSave.hidden = state.currentStep !== "revisao";
  }

  function switchStep(step) {
    if (!STEPS.includes(step)) return;
    if (step !== "usuario" && !state.selectedUserId) {
      notify("Selecione um usuário antes de avançar.", "aviso", "Permissões");
      return;
    }
    state.currentStep = step;
    renderSteps();
  }

  function nextStep() {
    const index = STEPS.indexOf(state.currentStep);
    switchStep(STEPS[Math.min(STEPS.length - 1, index + 1)]);
  }

  function prevStep() {
    const index = STEPS.indexOf(state.currentStep);
    switchStep(STEPS[Math.max(0, index - 1)]);
  }

  function renderTree() {
    const tree = $("#permModuleTree");
    if (!tree) return;

    const groups = groupedCatalog();
    let html = "";

    groups.forEach((submodules, moduleName) => {
      html += `<div class="perm-module-group"><strong>${moduleName}</strong>`;
      submodules.forEach((items, submoduleName) => {
        const total = items.length;
        const allowed = items.filter((item) => permissionValue(item.chave)).length;
        const key = `${moduleName}||${submoduleName}`;
        html += `
          <button class="perm-submodule ${state.selectedModule === key ? "active" : ""}" type="button" data-module-key="${key}">
            <strong>${submoduleName}</strong>
            <span>${allowed}/${total} permissões liberadas</span>
          </button>
        `;
      });
      html += `</div>`;
    });

    tree.innerHTML = html;

    if (!state.selectedModule) {
      const first = tree.querySelector("[data-module-key]");
      if (first) state.selectedModule = first.dataset.moduleKey;
    }
  }

  function selectedModuleItems() {
    if (!state.selectedModule) return [];
    const [moduleName, submoduleName] = state.selectedModule.split("||");
    return state.catalog.filter((item) => item.modulo === moduleName && item.submodulo === submoduleName);
  }

  function currentLevel(items) {
    const allowedActions = new Set(items.filter((item) => permissionValue(item.chave)).map((item) => item.acao));
    for (const level of LEVELS.slice().reverse()) {
      const applicable = items.filter((item) => ACTIONS.includes(item.acao));
      const expected = new Set(applicable.filter((item) => level.actions.includes(item.acao)).map((item) => item.chave));
      const active = applicable.filter((item) => permissionValue(item.chave)).map((item) => item.chave);
      if (expected.size === active.length && active.every((key) => expected.has(key))) return level.key;
    }
    if (allowedActions.has("visualizar")) return "leitura";
    return "sem";
  }

  function renderDetail() {
    const items = selectedModuleItems();
    const [moduleName = "Permissões", submoduleName = "Selecione um módulo"] = (state.selectedModule || "").split("||");

    $("#permDetailModule").textContent = moduleName || "Permissões";
    $("#permDetailTitle").textContent = submoduleName || "Selecione um módulo";

    const level = currentLevel(items);
    $("#permLevels").innerHTML = LEVELS.map((item) => `
      <button type="button" class="${level === item.key ? "active" : ""}" data-level="${item.key}">
        ${item.label}
      </button>
    `).join("");

    const rows = items
      .filter((item) => ACTIONS.includes(item.acao))
      .map((item) => `
        <div class="perm-row">
          <strong>${item.descricao || item.chave}</strong>
          ${ACTIONS.map((acao) => acao === item.acao
            ? `<label class="perm-toggle"><input type="checkbox" data-permission-key="${item.chave}" ${permissionValue(item.chave) ? "checked" : ""}><span></span></label>`
            : `<span></span>`
          ).join("")}
        </div>
      `).join("");

    $("#permMatrix").innerHTML = `
      <div class="perm-row header">
        <span>Ação</span>
        <span>Visualizar</span>
        <span>Criar</span>
        <span>Editar</span>
        <span>Excluir</span>
        <span>Aprovar</span>
      </div>
      ${rows || `<div class="perm-note">Este módulo possui apenas permissões sensíveis.</div>`}
    `;
  }

  function renderDetailed() {
    const body = $("#permDetailedBody");
    if (!body) return;
    body.innerHTML = state.catalog.map((item) => `
      <tr>
        <td>${item.modulo}</td>
        <td>${item.submodulo}</td>
        <td>${item.descricao || item.acao}</td>
        <td><label class="perm-toggle"><input type="checkbox" data-permission-key="${item.chave}" ${permissionValue(item.chave) ? "checked" : ""}><span></span></label></td>
      </tr>
    `).join("");
  }

  function renderSensitive() {
    const sensitive = state.catalog.filter((item) => item.sensivel);
    const html = sensitive.map((item) => `
      <div class="perm-sensitive-card">
        <div>
          <strong>${item.descricao || item.chave}</strong>
          <span class="perm-eyebrow">${item.modulo} · ${item.submodulo}</span>
        </div>
        <label class="perm-toggle"><input type="checkbox" data-permission-key="${item.chave}" ${permissionValue(item.chave) ? "checked" : ""}><span></span></label>
      </div>
    `).join("");

    $("#permSensitiveGrid").innerHTML = html;
    $("#permSideSensitive").innerHTML = html;
  }

  function renderLogs() {
    const list = $("#permLogList");
    if (!list) return;

    list.innerHTML = state.logs.map((log) => `
      <div class="perm-log-item">
        <strong>${log.acao || "Alteração"}</strong>
        <p class="perm-note">${new Date(log.created_at).toLocaleString("pt-BR")} · ${log.usuario_responsavel_nome || "Sistema"}</p>
      </div>
    `).join("") || `<div class="perm-note">Nenhuma alteração registrada para este usuário.</div>`;
  }

  function renderAllExceptUsers() {
    renderSelectedHeader();
    renderSteps();
    renderTree();
    renderDetail();
    renderDetailed();
    renderSensitive();
    renderLogs();
    if (window.lucide) window.lucide.createIcons();
  }

  function render() {
    renderUsers();
    renderAllExceptUsers();
  }

  function applyLevel(levelKey) {
    const level = LEVELS.find((item) => item.key === levelKey);
    const items = selectedModuleItems();
    if (!level) return;

    items.forEach((item) => {
      if (ACTIONS.includes(item.acao)) {
        state.permissions.set(item.chave, level.actions.includes(item.acao));
      }
    });

    state.dirty = true;
    $("#permDirtyBadge")?.classList.remove("hidden");
    renderAllExceptUsers();
  }

  function applyPreset(preset) {
    if (!preset) return;
    const all = preset === "admin";
    state.catalog.forEach((item) => {
      const moduleKey = item.modulo.toLowerCase();
      const allowed = all || moduleKey.includes(preset) || (preset === "comercial" && moduleKey.includes("inteligencia") && item.chave === "ia.lia.usar");
      state.permissions.set(item.chave, allowed);
    });
    state.dirty = true;
    $("#permDirtyBadge")?.classList.remove("hidden");
    renderAllExceptUsers();
  }

  async function savePermissions() {
    if (!state.selectedUserId || !supabase() || !empresaId()) return;

    const rows = state.catalog.map((item) => ({
      empresa_id: empresaId(),
      usuario_id: state.selectedUserId,
      permissao_chave: item.chave,
      permitido: permissionValue(item.chave),
      origem: "usuario",
      updated_at: new Date().toISOString()
    }));

    const { error } = await supabase()
      .from("permissoes_usuario")
      .upsert(rows, { onConflict: "empresa_id,usuario_id,permissao_chave" });

    if (error) {
      notify(error.message || "Não foi possível salvar as permissões.", "erro", "Erro");
      return;
    }

    await supabase().from("logs_permissoes").insert({
      empresa_id: empresaId(),
      usuario_alvo_id: state.selectedUserId,
      acao: "Permissões atualizadas",
      depois: Object.fromEntries(state.permissions),
      usuario_responsavel_id: usuarioId(),
      usuario_responsavel_nome: usuarioNome()
    });

    state.dirty = false;
    $("#permDirtyBadge")?.classList.add("hidden");
    window.EasyLocPermissions?.load?.();
    notify("Permissões salvas com sucesso.", "sucesso");
    await loadLogs();
    renderLogs();
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    modal?.classList.add("is-open");
    modal?.setAttribute("aria-hidden", "false");
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    modal?.classList.remove("is-open");
    modal?.setAttribute("aria-hidden", "true");
  }

  async function copyPermissions() {
    const source = $("#permCopySource")?.value;
    if (!source) return;

    const current = state.selectedUserId;
    state.selectedUserId = source;
    await loadUserPermissions();
    const copied = new Map(state.permissions);
    state.selectedUserId = current;
    state.permissions = copied;
    state.dirty = true;
    closeModal("permCopyModal");
    render();
  }

  async function createUser() {
    const name = $("#permNewUserName")?.value?.trim();
    const email = $("#permNewUserEmail")?.value?.trim();
    const role = $("#permNewUserRole")?.value?.trim();
    const status = $("#permNewUserStatus")?.value || "Ativo";

    if (!name) {
      notify("Informe o nome do usuário.", "aviso", "Usuário");
      return;
    }

    const id = crypto.randomUUID();
    try {
      const { error: userError } = await supabase().from("usuarios").insert({
        id,
        nome: name,
        email,
        cargo: role,
        status
      });
      if (userError) throw userError;

      const { error: linkError } = await supabase().from("usuarios_empresas").insert({
        empresa_id: empresaId(),
        user_id: id
      });
      if (linkError) throw linkError;

      closeModal("permUserModal");
      await loadUsers();
      state.selectedUserId = id;
      await loadUserPermissions();
      render();
      switchStep("perfil");
      notify("Usuário operacional cadastrado.", "sucesso", "Usuário");
    } catch (error) {
      notify(error.message || "Não foi possível criar o usuário.", "erro", "Erro");
    }
  }

  function exportPermissions() {
    const user = selectedUser();
    const payload = {
      usuario: userName(user),
      email: userEmail(user),
      permissoes: Object.fromEntries(state.permissions)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `permissoes-${userName(user).replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function bind() {
    listen($("#permUserSearch"), "input", (event) => {
      state.filter = event.target.value || "";
      renderUsers();
    });

    listen(document, "click", async (event) => {
      const stepBtn = event.target.closest("[data-step]");
      if (stepBtn) {
        switchStep(stepBtn.dataset.step);
        return;
      }

      const profileCard = event.target.closest("[data-profile-card]");
      if (profileCard) {
        const preset = profileCard.dataset.profileCard;
        const select = $("#permProfilePreset");
        if (select) select.value = preset;
        applyPreset(preset);
        switchStep("acessos");
        return;
      }

      const userBtn = event.target.closest("[data-user-id]");
      if (userBtn) {
        if (state.dirty && !confirm("Existem alterações não salvas. Continuar mesmo assim?")) return;
        state.selectedUserId = userBtn.dataset.userId;
        state.dirty = false;
        $("#permDirtyBadge")?.classList.add("hidden");
        await loadUserPermissions();
        await loadLogs();
        render();
        switchStep("perfil");
        return;
      }

      const moduleBtn = event.target.closest("[data-module-key]");
      if (moduleBtn) {
        state.selectedModule = moduleBtn.dataset.moduleKey;
        renderAllExceptUsers();
        return;
      }

      const levelBtn = event.target.closest("[data-level]");
      if (levelBtn) {
        applyLevel(levelBtn.dataset.level);
        return;
      }

      const closeBtn = event.target.closest("[data-perm-close]");
      if (closeBtn) {
        closeModal(closeBtn.dataset.permClose);
      }
    });

    listen(document, "change", (event) => {
      const input = event.target.closest("[data-permission-key]");
      if (input) setPermission(input.dataset.permissionKey, input.checked);
    });

    listen($("#permSaveBtn"), "click", savePermissions);
    listen($("#permBottomSaveBtn"), "click", savePermissions);
    listen($("#permNextStepBtn"), "click", nextStep);
    listen($("#permPrevStepBtn"), "click", prevStep);
    listen($("#permRefreshBtn"), "click", initPermissoes);
    listen($("#permApplyPresetBtn"), "click", () => {
      applyPreset($("#permProfilePreset")?.value);
      switchStep("acessos");
    });
    listen($("#permCopyBtn"), "click", () => {
      const select = $("#permCopySource");
      select.innerHTML = state.users
        .filter((user) => String(user.id) !== String(state.selectedUserId))
        .map((user) => `<option value="${user.id}">${userName(user)}</option>`)
        .join("");
      openModal("permCopyModal");
    });
    listen($("#permConfirmCopyBtn"), "click", copyPermissions);
    listen($("#permExportBtn"), "click", exportPermissions);
    listen($("#permPreviewBtn"), "click", () => notify("Pré-visualização pronta para ligar nas próximas telas com requirePermission().", "info", "Visualização"));
    listen($("#permNewUserBtn"), "click", () => openModal("permUserModal"));
    listen($("#permCreateUserBtn"), "click", createUser);
  }

  async function initPermissoes() {
    try {
      await loadCatalog();
      await loadUsers();
      await loadUserPermissions();
      await loadLogs();
      if (!state.selectedModule) {
        const first = state.catalog[0];
        if (first) state.selectedModule = `${first.modulo}||${first.submodulo}`;
      }
      render();
    } catch (error) {
      console.error("Erro ao iniciar permissões:", error);
      notify(error.message || "Falha ao carregar permissões.", "erro", "Erro");
    } finally {
      window.finalizarCarregamentoModulo?.();
    }
  }

  bind();
  window.__activeModuleDestroy = () => controller.abort();
  window.__moduleInit = initPermissoes;
  window.initPermissoes = initPermissoes;
})();
