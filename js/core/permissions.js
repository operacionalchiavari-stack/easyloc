(function () {
  const cache = {
    loaded: false,
    loading: null,
    empresaId: null,
    usuarioId: null,
    permissions: new Map(),
    strict: true,
    legacyAdmin: false,
    active: false
  };

  function getClient() {
    return window.supabaseClient || window.supabase;
  }

  function contextReady() {
    return Boolean(window.__CONTEXT?.empresa_id && window.__CONTEXT?.usuario_id);
  }

  function waitForContext(timeout = 6000) {
    if (contextReady()) return Promise.resolve(window.__CONTEXT);

    return new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (contextReady() || Date.now() - started > timeout) {
          clearInterval(timer);
          resolve(window.__CONTEXT || null);
        }
      }, 120);
    });
  }

  async function load() {
    if (cache.loaded) return cache;
    if (cache.loading) return cache.loading;

    cache.loading = (async () => {
      const ctx = await waitForContext();
      const supabase = getClient();

      cache.empresaId = ctx?.empresa_id || null;
      cache.usuarioId = ctx?.usuario_id || null;

      if (!supabase || !cache.empresaId || !cache.usuarioId) {
        cache.loaded = true;
        cache.strict = true;
        return cache;
      }

      try {
        const access = await supabase.rpc("funcionario_contexto", { p_empresa_id: cache.empresaId });
        if (access.error) throw access.error;
        cache.active = access.data?.ativo === true;
        cache.legacyAdmin = access.data?.administrador_legado === true;
        if (!cache.active) throw new Error("Acesso inativo");
        const { data, error } = await supabase.rpc("get_permissoes_usuario_resolvidas", {
          p_empresa_id: cache.empresaId,
          p_usuario_id: cache.usuarioId
        });

        if (error) throw error;

        cache.permissions.clear();
        (data || []).forEach((item) => {
          cache.permissions.set(item.chave, Boolean(item.permitido));
        });

        cache.strict = true;
      } catch (error) {
        console.warn("[EasyLoc Permissions] Nao foi possivel validar o acesso.", error);
        cache.strict = true;
        cache.active = false;
        cache.legacyAdmin = false;
        cache.permissions.clear();
      }

      cache.loaded = true;
      return cache;
    })();

    return cache.loading;
  }

  function hasPermission(chave, fallback = true) {
    if (!chave) return true;
    if (!cache.loaded || !cache.active) return false;
    if (cache.legacyAdmin) return true;
    return cache.permissions.get(chave) === true;
  }

  function canView(chave) {
    return hasPermission(chave);
  }

  function canEdit(chave) {
    return hasPermission(chave);
  }

  function requirePermission(chave, mensagem) {
    if (hasPermission(chave)) return true;

    const msg = mensagem || "Você não possui permissão para executar esta ação.";
    if (typeof window.alerta === "function") window.alerta(msg, "Permissão necessária", "aviso");
    else alert(msg);

    return false;
  }

  function applyVisibility(root = document) {
    root.querySelectorAll("[data-permission]").forEach((el) => {
      const permission = el.getAttribute("data-permission");
      const allowed = hasPermission(permission);
      el.hidden = !allowed;
      el.classList.toggle("permission-hidden", !allowed);
    });
    root.querySelectorAll("[data-module-href]").forEach((el) => {
      el.hidden = !canNavigate(el.getAttribute("data-module-href"));
    });
  }

  const routes = [
    [/CadastroFuncionarios/i, 'rh.funcionarios.visualizar'],
    [/CadastroClientes/i, 'comercial.clientes.visualizar'],
    [/CadastroLocais/i, 'comercial.locais.visualizar'],
    [/CreditosIA/i, 'comercial.creditos.visualizar'],
    [/Catalogo/i, 'comercial.catalogo.visualizar'],
    [/Pedidos/i, 'comercial.pedidos.visualizar'],
    [/Contratos/i, 'comercial.contratos.visualizar'],
    [/ImportarItens/i, 'estoque.importacao.executar'],
    [/CadastroItens|DisponibilidadeItens/i, 'estoque.itens.visualizar'],
    [/Personalizacoes/i, 'estoque.insumos.visualizar'],
    [/CadastroFornecedores/i, 'estoque.fornecedores.visualizar'],
    [/TabelasPreco/i, 'estoque.tabelas_preco.visualizar'],
    [/Almoxarifado|OrdemdeServicos|Controledequalidade/i, 'estoque.almoxarifado.visualizar'],
    [/Compras/i, 'estoque.compras.visualizar'],
    [/SeparacaoMateriais/i, 'logistica.separacao.visualizar'],
    [/Cronograma/i, 'logistica.cronograma.visualizar'],
    [/Expedicao/i, 'logistica.expedicao.visualizar'],
    [/Planejamento|Roteirizacao|EquipeRotas|cadastro-caminhoes/i, 'logistica.planejamento.visualizar'],
    [/Financeiro|fluxodecaixa/i, 'financeiro.fluxo.visualizar'],
    [/GestaoPessoas/i, 'rh.colaboradores.visualizar'],
    [/Permissoes/i, 'configuracoes.permissoes.visualizar'],
    [/WhatsApp/i, 'configuracoes.integracoes.whatsapp.visualizar'],
    [/GatewaysPagamento/i, 'configuracoes.integracoes.gateways_pagamento.visualizar'],
    [/studio-ia|StudioIA/i, 'ia.studio.visualizar'],
    [/empresa/i, 'configuracoes.empresa.visualizar']
  ];
  function canNavigate(href) {
    if (!cache.loaded || !cache.active) return false;
    let path;
    try { const url = new URL(href, location.href); if (url.origin !== location.origin) return false; path = decodeURIComponent(url.pathname); } catch (_) { return false; }
    if (cache.legacyAdmin) return true;
    const match = routes.find(([pattern]) => pattern.test(path));
    return match ? hasPermission(match[1]) : /\/(dashboard|usuario)\.html$/i.test(path);
  }
  function guardPage() {
    if (!canNavigate(location.href)) {
      if (document.getElementById('permissionDeniedNotice')) return;
      [...document.body.children].filter(el => !['SCRIPT', 'STYLE'].includes(el.tagName)).forEach(el => { el.hidden = true; });
      const notice = document.createElement('p');
      notice.id = 'permissionDeniedNotice';
      notice.setAttribute('role', 'alert');
      notice.style.cssText = 'padding:32px;color:#374151;background:#fff;font:16px system-ui';
      notice.textContent = 'Você não possui acesso a esta parte do sistema. Consulte o administrador.';
      document.body.appendChild(notice);
    }
  }

  window.EasyLocPermissions = {
    load,
    hasPermission,
    canView,
    canEdit,
    requirePermission,
    applyVisibility,
    canNavigate,
    _cache: cache
  };

  window.hasPermission = hasPermission;
  window.canView = canView;
  window.canEdit = canEdit;
  window.requirePermission = requirePermission;

  // Revalida abas abertas para aplicar bloqueios e mudanças de permissão sem novo login.
  setInterval(async () => {
    if (!cache.loaded || document.hidden) return;
    cache.loaded = false;
    cache.loading = null;
    await load();
    applyVisibility();
    guardPage();
  }, 30000);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => load().then(() => { applyVisibility(); guardPage(); }));
  } else {
    load().then(() => { applyVisibility(); guardPage(); });
  }
})();
