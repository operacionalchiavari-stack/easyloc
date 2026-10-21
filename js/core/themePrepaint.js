/**
 * THEME PREPAINT — anti-flash de tema
 *
 * Le o tema da empresa em cache (localStorage) e aplica as variaveis CSS
 * ANTES do primeiro paint, para nao piscar as cores padrao antes das
 * cores da empresa. Usado pelo shell (dashboard.html) e por todo modulo
 * que roda como documento proprio dentro do iframe.
 */
(function () {
  try {
    const empresaId = sessionStorage.getItem("empresa_id") || "default";
    const cachedTheme = localStorage.getItem("easyloc_theme_" + empresaId);
    if (!cachedTheme) return;

    const theme = JSON.parse(cachedTheme);
    const hex = value => /^#[0-9a-f]{6}$/i.test(String(value || '').trim());
    theme.cor_sidebar = hex(theme.cor_sidebar) ? theme.cor_sidebar.trim() : '#290610';
    theme.cor_destaque = hex(theme.cor_destaque) ? theme.cor_destaque.trim() : '#7d603d';
    theme.cor_fundo = '#f3f5f6';
    const escurecer = (color,amount) => '#' + color.slice(1).match(/../g).map(part=>Math.max(0,parseInt(part,16)-amount).toString(16).padStart(2,'0')).join('');
    const root = document.documentElement;
    const hexToRgbString = (hex) => {
      const value = String(hex || "").trim();
      if (!/^#[0-9A-F]{6}$/i.test(value)) return "46, 31, 31";
      const n = parseInt(value.slice(1), 16);
      return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
    };

    if (theme.cor_sidebar) {
      root.style.setProperty("--color-sidebar", theme.cor_sidebar);
      root.style.setProperty("--empresa-cor-principal-rgb", hexToRgbString(theme.cor_sidebar));
      root.style.setProperty("--el-color-primary", theme.cor_destaque);
      root.style.setProperty("--el-color-primary-strong", escurecer(theme.cor_destaque,23));
      root.style.setProperty("--el-color-primary-dark", escurecer(theme.cor_destaque,23));
      root.style.setProperty("--el-color-primary-soft", "#F3F4F6");
      root.style.setProperty("--el-color-title", "#142033");
      root.style.setProperty("--el-color-text", "#142033");
      root.style.setProperty("--el-color-text-secondary", "#526176");
      root.style.setProperty("--el-color-muted", "#6b7789");
      root.style.setProperty("--el-color-placeholder", "#929cab");
      root.style.setProperty("--el-table-header-bg", "#f3f5f7");
      root.style.setProperty("--el-table-header-color", "#526176");
      root.style.setProperty("--el-table-row-hover", "#f7f9fa");
      root.style.setProperty("--azul", theme.cor_destaque);
      root.style.setProperty("--azul-2", theme.cor_sidebar);
      root.style.setProperty("--texto-principal", "#142033");
      root.style.setProperty("--texto-secundario", "#6b7789");
      root.style.setProperty("--cor-texto", "#142033");
      root.style.setProperty("--cor-texto-suave", "#6b7789");
    }

    if (theme.cor_destaque) {
      root.style.setProperty("--color-primary", theme.cor_destaque);
      root.style.setProperty('--el-button-primary-bg', theme.cor_destaque);
      root.style.setProperty('--el-button-primary-rgb', hexToRgbString(theme.cor_destaque));
      root.style.setProperty('--el-button-primary-hover', escurecer(theme.cor_destaque,23));
      root.style.setProperty('--el-button-primary-active', escurecer(theme.cor_destaque,41));
      root.style.setProperty('--el-button-primary-soft', 'rgba(' + hexToRgbString(theme.cor_destaque) + ', 0.08)');
      root.style.setProperty('--el-color-accent', theme.cor_destaque);
      root.style.setProperty('--el-color-accent-strong', escurecer(theme.cor_destaque,23));
      root.style.setProperty("--laranja", theme.cor_destaque);
    }

    if (theme.cor_fundo) {
      root.style.setProperty("--color-bg", theme.cor_fundo);
      root.style.setProperty("--el-color-bg", theme.cor_fundo);
      root.style.setProperty("--fundo", theme.cor_fundo);
    }

    window.__COMPANY_THEME_CACHE = theme;
  } catch (error) {
    console.warn("[EasyLoc Theme] cache ignorado:", error);
  }
})();
