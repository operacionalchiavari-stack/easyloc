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
      root.style.setProperty("--el-color-primary", "#1F2937");
      root.style.setProperty("--el-color-primary-strong", "#111827");
      root.style.setProperty("--el-color-primary-dark", "#111827");
      root.style.setProperty("--el-color-primary-soft", "#F3F4F6");
      root.style.setProperty("--el-color-title", "#142033");
      root.style.setProperty("--el-color-text", "#142033");
      root.style.setProperty("--el-color-text-secondary", "#526176");
      root.style.setProperty("--el-color-muted", "#6b7789");
      root.style.setProperty("--el-color-placeholder", "#929cab");
      root.style.setProperty("--el-table-header-bg", "#f3f5f7");
      root.style.setProperty("--el-table-header-color", "#526176");
      root.style.setProperty("--el-table-row-hover", "#f7f9fa");
      root.style.setProperty("--azul", "#142033");
      root.style.setProperty("--azul-2", theme.cor_sidebar);
      root.style.setProperty("--texto-principal", "#142033");
      root.style.setProperty("--texto-secundario", "#6b7789");
      root.style.setProperty("--cor-texto", "#142033");
      root.style.setProperty("--cor-texto-suave", "#6b7789");
    }

    if (theme.cor_destaque) {
      root.style.setProperty("--color-primary", theme.cor_destaque);
      root.style.setProperty("--laranja", theme.cor_destaque);
    }

    if (theme.cor_fundo) {
      root.style.setProperty("--color-bg", theme.cor_fundo);
      root.style.setProperty("--fundo", theme.cor_fundo);
    }

    window.__COMPANY_THEME_CACHE = theme;
  } catch (error) {
    console.warn("[EasyLoc Theme] cache ignorado:", error);
  }
})();
