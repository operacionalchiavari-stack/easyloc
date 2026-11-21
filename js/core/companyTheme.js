(function () {
  "use strict";

  const DEFAULT_THEME = Object.freeze({
    logo_url: "",
    logo_zoom: 1,
    sistema_zoom: 100,
    tema_festivo: "",
    tema_festivo_inicio: null,
    tema_festivo_fim: null,
    cor_sidebar: "#5a5a55",
    cor_destaque: "#7d603d",
    cor_fundo: "#f3f5f6"
  });

  // As cores da empresa continuam sendo a fonte dos documentos e impressões.
  // A seleção festiva sobrepõe somente os tokens da interface.
  const FESTIVE_THEMES = Object.freeze({
    carnaval: Object.freeze({ id: 'carnaval', nome: 'Carnaval', simbolo: '🎭', cor_sidebar: '#46206b', cor_destaque: '#853b95', titulo: 'A alegria fica melhor com você.', mensagem: 'Que não faltem sorrisos, leveza e bons motivos para celebrar. Seu jeito de fazer a diferença dá mais cor à nossa equipe.', assinatura: 'Um Carnaval cheio de alegria e cuidado!', cores: ['#b365d4', '#f4be58', '#4ec6b2'] }),
    natal: Object.freeze({ id: 'natal', nome: 'Natal', simbolo: '🎄', cor_sidebar: '#173f37', cor_destaque: '#a53741', titulo: 'O melhor presente é ter você aqui.', mensagem: 'Que o carinho aqueça os seus dias e a esperança ilumine o seu caminho. Obrigado por fazer parte da nossa história.', assinatura: 'Com carinho, um Feliz Natal para você e sua família!', cores: ['#38765c', '#c95159', '#e6c681'] }),
    pascoa: Object.freeze({ id: 'pascoa', nome: 'Páscoa', simbolo: '🐇', cor_sidebar: '#53416a', cor_destaque: '#805293', titulo: 'Que a vida se renove em coisas boas.', mensagem: 'Um novo começo, um abraço apertado e a doçura dos pequenos momentos. Que a sua Páscoa seja cheia de amor, paz e chocolate.', assinatura: 'Você torna os nossos dias mais especiais. Feliz Páscoa!', cores: ['#c3a2d5', '#f0bf9d', '#b4ceae'] }),
    ano_novo: Object.freeze({ id: 'ano_novo', nome: 'Ano Novo', simbolo: '🥂', cor_sidebar: '#1e2c46', cor_destaque: '#8a652c', titulo: 'Novos sonhos. Conquistas juntos.', mensagem: 'Que o novo ano traga saúde, abraços e oportunidades para realizar seus sonhos. Cada conquista nossa também tem um pedacinho seu.', assinatura: 'Um brinde a você e a tudo de bom que vem pela frente!', cores: ['#d8b46c', '#f0e4c8', '#809fc9'] })
  });

  function festiveTheme(id) { return Object.prototype.hasOwnProperty.call(FESTIVE_THEMES, id) ? FESTIVE_THEMES[id] : null; }
  function todayISO(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = type => parts.find(item => item.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function activeFestiveTheme(theme, today = todayISO()) {
    const start = theme?.tema_festivo_inicio, end = theme?.tema_festivo_fim;
    return validDate(start) && validDate(end) && start <= today && today <= end ? festiveTheme(theme?.tema_festivo) : null;
  }
  function systemTheme(rawTheme, { preview = false } = {}) {
    const theme = normalizeTheme(rawTheme);
    const festive = preview ? festiveTheme(theme.tema_festivo) : activeFestiveTheme(theme);
    return festive ? { ...theme, cor_sidebar: festive.cor_sidebar, cor_destaque: festive.cor_destaque } : theme;
  }

  let periodTimer = null, lastDay = '';
  function refreshPeriod() {
    if (window.__COMPANY_THEME && lastDay !== todayISO()) applyTheme(window.__COMPANY_THEME);
  }
  if (window.addEventListener) {
    window.addEventListener('focus', refreshPeriod);
    document.addEventListener?.('visibilitychange', () => { if (!document.hidden) refreshPeriod(); });
  }

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

  function hexToRgbString(hex) {
    const value = String(hex || "").trim();
    if (!isHex(value)) return "46, 31, 31";
    const n = parseInt(value.slice(1), 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
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

  function mixColor(a, b, amount) {
    const channels = hex => hex.slice(1).match(/../g).map(part => parseInt(part, 16));
    const first = channels(a), second = channels(b);
    return '#' + first.map((value, index) => Math.round(value + (second[index] - value) * amount).toString(16).padStart(2, '0')).join('');
  }

  // Todos os destaques partem da mesma cor efetivamente aplicada ao menu.
  function portalPalette(menuColor) {
    const bg = isHex(menuColor) ? menuColor : DEFAULT_THEME.cor_sidebar;
    let text = contrast(bg, '#ffffff') >= contrast(bg, '#142033') ? '#ffffff' : '#142033';
    if (contrast(bg, text) < 4.5) text = '#000000';
    const readableTint = (amount, minimum = 4.5) => {
      let color = mixColor(bg, text, amount);
      while (contrast(bg, color) < minimum && amount < 1) { amount = Math.min(1, amount + .02); color = mixColor(bg, text, amount); }
      return color;
    };
    const paper = mixColor(bg, '#ffffff', .94);
    const muted = readableTint(.82), accent = readableTint(.87);
    const surfaceTint = amount => {
      let surface = mixColor(bg, text, amount);
      while ([text, muted, accent].some(color => contrast(surface, color) < 4.5) && amount > 0) {
        amount = Math.max(0, amount - .01); surface = mixColor(bg, text, amount);
      }
      return surface;
    };
    return {
      bg, text, muted, accent, art: readableTint(.58, 3),
      glow: surfaceTint(.22), soft: surfaceTint(.09), line: mixColor(bg, text, .28),
      paper, ink: contrast(paper, bg) >= 4.5 ? bg : '#142033'
    };
  }

  function normalizeTheme(theme) {
    const logoZoom = Number(theme?.logo_zoom || 1);
    return {
      logo_url: theme?.logo_url || "",
      tema_festivo: festiveTheme(theme?.tema_festivo) ? theme.tema_festivo : '',
      tema_festivo_inicio: validDate(theme?.tema_festivo_inicio) ? theme.tema_festivo_inicio : null,
      tema_festivo_fim: validDate(theme?.tema_festivo_fim) ? theme.tema_festivo_fim : null,
      sistema_zoom: Number.isFinite(Number(theme?.sistema_zoom)) ? Math.min(125, Math.max(75, Number(theme.sistema_zoom))) : 100,
      logo_zoom: Number.isFinite(logoZoom) ? Math.min(2.2, Math.max(0.5, logoZoom)) : 1,
      // O bordo era o padrao do antigo menu lateral; o menu superior usa cinza.
      cor_sidebar: isHex(theme?.cor_sidebar) && theme.cor_sidebar.trim().toLowerCase() !== "#290610" ? theme.cor_sidebar.trim() : DEFAULT_THEME.cor_sidebar,
      cor_destaque: isHex(theme?.cor_destaque) ? theme.cor_destaque.trim() : DEFAULT_THEME.cor_destaque,
      cor_fundo: DEFAULT_THEME.cor_fundo
    };
  }

  function logoCacheVersion(theme) {
    return theme?.logo_cache || theme?.updated_at || "";
  }

  function withCacheBust(url, version = "") {
    if (!url) return "";
    if (url.startsWith("blob:") || url.startsWith("data:")) return url;
    const cleanUrl = url.replace(/([?&])v=[^&]*(&?)/, (match, prefix, suffix) => suffix ? prefix : "");
    // Sem uma versão informada, use uma chave estável. Date.now() forçava o
    // navegador a baixar novamente a mesma logo e causava uma piscada.
    const cacheValue = version || "stable";
    const separator = cleanUrl.includes("?") ? "&" : "?";
    return `${cleanUrl}${separator}v=${encodeURIComponent(cacheValue)}`;
  }

  function applyTheme(rawTheme) {
    const baseTheme = normalizeTheme(rawTheme);
    const theme = systemTheme(baseTheme);
    lastDay = todayISO();
    if (baseTheme.tema_festivo && !periodTimer && window.setInterval) periodTimer = window.setInterval(refreshPeriod, 30000);
    if (!baseTheme.tema_festivo && periodTimer) { window.clearInterval(periodTimer); periodTimer = null; }
    const root = document.documentElement;
    window.EasyLocSystemZoom?.apply(theme.sistema_zoom);
    const sidebarStrong = shade(theme.cor_sidebar, -0.09);
    const accentStrong = shade(theme.cor_destaque, -0.09);
    const accentSoft = 'rgba(' + hexToRgbString(theme.cor_destaque) + ', 0.08)';
    const onAccent = contrast(theme.cor_destaque, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#142033';
    root.style.setProperty('--el-button-primary-bg', theme.cor_destaque);
    root.style.setProperty('--el-button-primary-rgb', hexToRgbString(theme.cor_destaque));
    root.style.setProperty('--el-button-primary-hover', accentStrong);
    root.style.setProperty('--el-button-primary-active', shade(theme.cor_destaque, -0.16));
    root.style.setProperty('--el-button-primary-soft', accentSoft);

    root.style.setProperty("--color-sidebar", theme.cor_sidebar);
    root.style.setProperty("--color-primary", theme.cor_destaque);
    root.style.setProperty("--color-bg", theme.cor_fundo);
    root.style.setProperty("--empresa-cor-principal-rgb", hexToRgbString(theme.cor_sidebar));
    Object.entries(portalPalette(theme.cor_sidebar)).forEach(([name, value]) => root.style.setProperty(`--portal-hero-${name}`, value));

    root.style.setProperty("--el-color-primary", theme.cor_destaque);
    root.style.setProperty("--el-color-primary-strong", accentStrong);
    root.style.setProperty("--el-color-primary-dark", accentStrong);
    root.style.setProperty("--el-color-primary-soft", accentSoft);
    root.style.setProperty("--el-color-accent", theme.cor_destaque);
    root.style.setProperty("--el-color-on-accent", onAccent);
    root.style.setProperty("--el-color-accent-soft", accentSoft);
    root.style.setProperty("--el-color-accent-strong", accentStrong);
    root.style.setProperty("--el-color-accent-active", shade(theme.cor_destaque, -0.16));
    root.style.setProperty("--el-color-bg", theme.cor_fundo);
    root.style.setProperty("--el-color-title", "#142033");
    root.style.setProperty("--el-color-text", "#142033");
    root.style.setProperty("--el-color-text-secondary", "#526176");
    root.style.setProperty("--el-color-muted", "#6b7789");
    root.style.setProperty("--el-color-placeholder", "#929cab");
    root.style.setProperty("--el-table-header-bg", "#f3f5f7");
    root.style.setProperty("--el-table-header-color", "#526176");
    root.style.setProperty("--el-table-row-hover", "#f7f9fa");
    root.style.setProperty("--azul", theme.cor_destaque);
    root.style.setProperty("--azul-2", sidebarStrong);
    root.style.setProperty("--laranja", theme.cor_destaque);
    root.style.setProperty("--fundo", theme.cor_fundo);
    root.style.setProperty("--company-logo-zoom", String(theme.logo_zoom));
    root.style.setProperty("--texto-principal", "#142033");
    root.style.setProperty("--texto-secundario", "#6b7789");
    root.style.setProperty("--cor-texto", "#142033");
    root.style.setProperty("--cor-texto-suave", "#6b7789");

    // @media print também protege impressões que herdam os tokens da tela.
    if (document.createElement && document.head) {
      let printStyle = document.getElementById('company-theme-print');
      if (!printStyle) {
        printStyle = document.createElement('style');
        printStyle.id = 'company-theme-print';
        document.head.appendChild(printStyle);
      }
      const accent = baseTheme.cor_destaque;
      const strong = shade(accent, -0.09);
      const soft = `rgba(${hexToRgbString(accent)}, 0.08)`;
      const printTokens = {
        '--color-sidebar': baseTheme.cor_sidebar, '--empresa-cor-principal-rgb': hexToRgbString(baseTheme.cor_sidebar),
        '--color-primary': accent, '--el-color-primary': accent, '--el-color-primary-strong': strong,
        '--el-color-primary-dark': strong, '--el-color-primary-soft': soft, '--el-color-accent': accent,
        '--el-color-on-accent': contrast(accent, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#142033',
        '--el-color-accent-soft': soft, '--el-color-accent-strong': strong, '--el-color-accent-active': shade(accent, -0.16),
        '--el-button-primary-bg': accent, '--el-button-primary-rgb': hexToRgbString(accent),
        '--el-button-primary-hover': strong, '--el-button-primary-active': shade(accent, -0.16),
        '--el-button-primary-soft': soft, '--azul': accent, '--azul-2': shade(baseTheme.cor_sidebar, -0.09), '--laranja': accent
      };
      printStyle.textContent = '@media print{ :root{' + Object.entries(printTokens).map(([key,value]) => `${key}:${value}!important`).join(';') + '} }';
    }

    const sidebarLogo = document.getElementById("sidebarLogo");
    if (sidebarLogo) {
      // Nunca a logo Acervo (pedido do usuário, nov/2026): sem logo da empresa, fica a que já estava (ou nenhuma).
      if (theme.logo_url) {
        const nextLogoSrc = withCacheBust(theme.logo_url, logoCacheVersion(rawTheme));
        if ((sidebarLogo.getAttribute("src") || "") !== nextLogoSrc) sidebarLogo.src = nextLogoSrc;
      }
      // Tamanho da logo do menu e todo em CSS (hoje styles/portal-shell.css,
      // ".sidebar-header img"), igual ao logo do catalogo (.catalog-brand-logo
      // em Modulos/Comercial/Catalogo/catalogo.css): mesmo max-height:49px +
      // transform:scale(3.6), a pedido do usuario ("olha como a logo aparece
      // no catalogo... quero do mesmo jeito, mesmo tamanho"). O catalogo
      // tambem nao aplica logo_zoom por JS — por isso essa linha nao mexe
      // mais em transform aqui, pra os dois lugares ficarem identicos.
    }

    document.body?.classList.add("company-theme-loaded");
    document.body?.classList.toggle("company-logo-active", Boolean(theme.logo_url));
    window.__COMPANY_THEME = baseTheme;
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('easyloc:themechange', { detail: { ...baseTheme } }));
    }

    const empresaId = window.__CONTEXT?.empresa_id || sessionStorage.getItem("empresa_id");
    if (empresaId) {
      try {
        const festiveColors = festiveTheme(baseTheme.tema_festivo) || baseTheme;
        localStorage.setItem("acervo_ultima_empresa", empresaId);
        localStorage.setItem(`easyloc_theme_${empresaId}`, JSON.stringify({ ...baseTheme, cores_sistema: { cor_sidebar: festiveColors.cor_sidebar, cor_destaque: festiveColors.cor_destaque } }));
      } catch (error) {
        console.warn("[EasyLoc Theme] nao foi possivel salvar cache:", error);
      }
    }

    return baseTheme;
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
        .select("*")
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
    if (normalized.tema_festivo) {
      if (!normalized.tema_festivo_inicio || !normalized.tema_festivo_fim) errors.push('Informe as datas de início e fim do tema festivo.');
      else if (normalized.tema_festivo_fim < normalized.tema_festivo_inicio) errors.push('A data final precisa ser igual ou posterior à data inicial.');
    }
    return { ok: errors.length === 0, errors, theme: normalized };
  }

  window.EasyLocTheme = {
    color(role = 'accent') {
      const token = role === 'soft' ? '--el-button-primary-soft' : '--el-button-primary-bg';
      return getComputedStyle(document.documentElement).getPropertyValue(token).trim()
        || (role === 'soft' ? '#f4efe8' : DEFAULT_THEME.cor_destaque);
    },
    DEFAULT_THEME,
    FESTIVE_THEMES,
    festiveTheme,
    activeFestiveTheme,
    todayISO,
    refreshPeriod,
    systemTheme,
    isHex,
    hexToRgbString,
    contrast,
    portalPalette,
    validateTheme,
    applyTheme,
    applyForEmpresa,
    withCacheBust
  };
})();
