// Documentos modernos e antigos recebem o mesmo tema, inclusive dentro de iframes.
(function () {
  if (window.__moduleThemeReady) return;
  window.__moduleThemeReady = true;
  if(!document.querySelector('link[data-table-text]')){
    const tables=document.createElement('link');tables.rel='stylesheet';
    tables.href=new URL('../../styles/table-text.css?v=20261020',document.currentScript.src).href;
    tables.dataset.tableText='';document.head.appendChild(tables);
  }
  if(!document.querySelector('script[data-filter-inputs]')){
    const filters=document.createElement('script');
    filters.src=new URL('filterInputs.js?v=20261020-autofill2',document.currentScript.src).href;
    filters.dataset.filterInputs='';document.head.appendChild(filters);
  }
  if(!document.querySelector('script[data-global-loading]')){
    const loader=document.createElement('script');
    loader.src=new URL('loading.js?v=20261020',document.currentScript.src).href;
    loader.dataset.globalLoading='';document.head.appendChild(loader);
  }
  const aplicar = tema => {
    if (tema && window.EasyLocTheme) window.EasyLocTheme.applyTheme(tema);
  };
  let pai;
  try {
    if (window.parent !== window && window.parent.location.origin === location.origin) pai = window.parent;
  } catch (_) {}
  if (pai) {
    const atualizar = event => aplicar(event.detail || pai.__COMPANY_THEME);
    pai.addEventListener('easyloc:themechange', atualizar);
    window.addEventListener('pagehide', () => pai.removeEventListener('easyloc:themechange', atualizar), { once: true });
    if (pai.__COMPANY_THEME) aplicar(pai.__COMPANY_THEME);
  }
  if (!window.__COMPANY_THEME) {
    try {
      const empresaId = window.__CONTEXT?.empresa_id || sessionStorage.getItem('empresa_id');
      const cached = empresaId && localStorage.getItem('easyloc_theme_' + empresaId);
      aplicar(cached ? JSON.parse(cached) : window.EasyLocTheme?.DEFAULT_THEME);
    } catch (_) { aplicar(window.EasyLocTheme?.DEFAULT_THEME); }
  }
  window.addEventListener('storage', event => {
    const empresaId = window.__CONTEXT?.empresa_id || sessionStorage.getItem('empresa_id');
    if (event.key === 'easyloc_theme_' + empresaId && event.newValue) {
      try { aplicar(JSON.parse(event.newValue)); } catch (_) {}
    }
  });
})();
