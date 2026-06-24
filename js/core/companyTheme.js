(function () {
  "use strict";

  const DEFAULT_THEME = {
    logo_url: "",
    logo_zoom: 1,
    cor_sidebar: "#0F2A44",
    cor_destaque: "#FF6A00",
    cor_fundo: "#FFFAF6"
  };

  function isHex(value) {
    return /^#[0-9A-F]{6}$/i.test(String(value || "").trim());
  }

  function clamp(value) {
    return Math.max(0, Math.min(255, value));
  }

  function shade(hex, percent) {
    if (!isHex(hex)) return hex;
    const n = parseInt(hex.slice(1), 16);
    const r = clamp((n >> 16) + Math.round(255 * percent));
    const g = clamp(((n >> 8) & 255) + Math.round(255 * percent));
    const b = clamp((n & 255) + Math.round(255 * percent));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  function luminance(hex) {
    if (!isHex(hex)) return 1;
    const n = parseInt(hex.slice(1), 16);
    const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }

  function contrast(hexA, hexB) {
    const a = luminance(hexA);
    const b = luminance(hexB);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  function normalizeTheme(theme) {
    const logoZoom = Number(theme?.logo_zoom || 1);
    return {
      logo_url: theme?.logo_url || "",
      logo_zoom: Number.isFinite(logoZoom) ? Math.min(2.2, Math.max(0.5, logoZoom)) : 1,
      cor_sidebar: isHex(theme?.cor_sidebar) ? theme.cor_sidebar : DEFAULT_THEME.cor_sidebar,
      cor_destaque: isHex(theme?.cor_destaque) ? theme.cor_destaque : DEFAULT_THEME.cor_destaque,
      cor_fundo: isHex(theme?.cor_fundo) ? theme.cor_fundo : DEFAULT_THEME.cor_fundo
    };
  }

  function applyTheme(rawTheme) {
    const theme = normalizeTheme(rawTheme);
    const root = document.documentElement;
    const sidebarStrong = shade(theme.cor_sidebar, -0.09);
    const accentStrong = shade(theme.cor_destaque, -0.08);

    root.style.setProperty("--color-sidebar", theme.cor_sidebar);
    root.style.setProperty("--color-primary", theme.cor_destaque);
    root.style.setProperty("--color-bg", theme.cor_fundo);

    root.style.setProperty("--el-color-primary", theme.cor_sidebar);
    root.style.setProperty("--el-color-primary-strong", sidebarStrong);
    root.style.setProperty("--el-color-primary-dark", shade(theme.cor_sidebar, -0.14));
    root.style.setProperty("--el-color-accent", theme.cor_destaque);
    root.style.setProperty("--el-color-accent-strong", accentStrong);
    root.style.setProperty("--el-color-bg", theme.cor_fundo);
    root.style.setProperty("--azul", theme.cor_sidebar);
    root.style.setProperty("--azul-2", sidebarStrong);
    root.style.setProperty("--laranja", theme.cor_destaque);
    root.style.setProperty("--fundo", theme.cor_fundo);
    root.style.setProperty("--company-logo-zoom", String(theme.logo_zoom));
    root.style.setProperty("--el-color-text", "#0f172a");
    root.style.setProperty("--el-color-muted", "#64748b");
    root.style.setProperty("--texto-principal", "#0f172a");
    root.style.setProperty("--texto-secundario", "#64748b");
    root.style.setProperty("--cor-texto", "#0f172a");
    root.style.setProperty("--cor-texto-suave", "#64748b");

    const sidebarLogo = document.getElementById("sidebarLogo");
    if (sidebarLogo) {
      sidebarLogo.src = theme.logo_url || "logosimbolo.png";
      sidebarLogo.style.transform = `scale(${theme.logo_zoom})`;
      sidebarLogo.style.transformOrigin = "center";
    }

    document.body?.classList.add("company-theme-loaded");
    document.body?.classList.toggle("company-logo-active", Boolean(theme.logo_url));
    window.__COMPANY_THEME = theme;

    const empresaId = window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
    if (empresaId) {
      try {
        localStorage.setItem(`easyloc_theme_${empresaId}`, JSON.stringify(theme));
      } catch (error) {
        console.warn("[EasyLoc Theme] nao foi possivel salvar cache:", error);
      }
    }

    return theme;
  }

  async function applyForEmpresa(empresaId) {
    if (!empresaId || !window.supabaseClient) return applyTheme(DEFAULT_THEME);

    try {
      const cached = localStorage.getItem(`easyloc_theme_${empresaId}`);
      if (cached) applyTheme(JSON.parse(cached));
    } catch (error) {
      console.warn("[EasyLoc Theme] cache invalido:", error);
    }

    try {
      const { data, error } = await window.supabaseClient
        .from("configuracoes_empresa")
        .select("logo_url, logo_zoom, cor_sidebar, cor_destaque, cor_fundo")
        .eq("empresa_id", empresaId)
        .maybeSingle();
      if (error) {
        console.warn("[EasyLoc Theme] usando paleta padrao:", error);
        const { data: empresa } = await window.supabaseClient
          .from("empresas")
          .select("logo_url")
          .eq("id", empresaId)
          .maybeSingle();
        return applyTheme({ ...DEFAULT_THEME, logo_url: empresa?.logo_url || "" });
      }
      if (data) return applyTheme(data);

      const { data: empresa } = await window.supabaseClient
        .from("empresas")
        .select("logo_url")
        .eq("id", empresaId)
        .maybeSingle();

      return applyTheme({ ...DEFAULT_THEME, logo_url: empresa?.logo_url || "" });
    } catch (error) {
      console.warn("[EasyLoc Theme] falha ao aplicar tema:", error);
      return applyTheme(DEFAULT_THEME);
    }
  }

  function validateTheme(theme) {
    const normalized = normalizeTheme(theme);
    const errors = [];
    if (!isHex(theme?.cor_sidebar)) errors.push("Cor do menu lateral invalida.");
    if (!isHex(theme?.cor_destaque)) errors.push("Cor de destaque invalida.");
    if (!isHex(theme?.cor_fundo)) errors.push("Cor do fundo invalida.");
    if (luminance(normalized.cor_fundo) < 0.82) errors.push("Escolha uma cor de fundo mais clara para manter a leitura.");
    if (contrast(normalized.cor_sidebar, "#FFFFFF") < 4.5) errors.push("A cor do menu lateral precisa ter mais contraste com texto branco.");
    if (contrast(normalized.cor_destaque, "#FFFFFF") < 2.4) errors.push("A cor de destaque pode ficar fraca em botoes com texto branco.");
    return { ok: errors.length === 0, errors, theme: normalized };
  }

  window.EasyLocTheme = {
    DEFAULT_THEME,
    isHex,
    contrast,
    validateTheme,
    applyTheme,
    applyForEmpresa
  };
})();
