(function () {
  const cache = {
    loaded: false,
    loading: null,
    empresaId: null,
    usuarioId: null,
    permissions: new Map(),
    strict: false
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
        cache.strict = false;
        return cache;
      }

      try {
        const { data, error } = await supabase.rpc("get_permissoes_usuario_resolvidas", {
          p_empresa_id: cache.empresaId,
          p_usuario_id: cache.usuarioId
        });

        if (error) throw error;

        cache.permissions.clear();
        (data || []).forEach((item) => {
          cache.permissions.set(item.chave, Boolean(item.permitido));
        });

        cache.strict = cache.permissions.size > 0 && Array.from(cache.permissions.values()).some(Boolean);
      } catch (error) {
        console.warn("[EasyLoc Permissions] permissões indisponíveis, sistema liberado temporariamente.", error);
        cache.strict = false;
      }

      cache.loaded = true;
      return cache;
    })();

    return cache.loading;
  }

  function hasPermission(chave, fallback = true) {
    if (!chave) return true;
    if (!cache.loaded || !cache.strict) return fallback;
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
  }

  window.EasyLocPermissions = {
    load,
    hasPermission,
    canView,
    canEdit,
    requirePermission,
    applyVisibility,
    _cache: cache
  };

  window.hasPermission = hasPermission;
  window.canView = canView;
  window.canEdit = canEdit;
  window.requirePermission = requirePermission;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => load().then(() => applyVisibility()));
  } else {
    load().then(() => applyVisibility());
  }
})();
