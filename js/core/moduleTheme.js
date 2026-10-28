// Documentos modernos e antigos recebem o mesmo tema, inclusive dentro de iframes.
(async function () {
  if (window.__moduleThemeReady) return;
  const scriptUrl = document.currentScript.src;
  if (!window.EasyLocTheme) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('companyTheme.js', scriptUrl).href;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  window.__moduleThemeReady = true;
  if(!document.querySelector('script[data-operacao-monitor]')){const m=document.createElement('script');m.src=new URL('operacaoMonitor.js?v=20261024',scriptUrl).href;m.dataset.operacaoMonitor='';document.head.appendChild(m);}
  if(!document.querySelector('link[data-table-text]')){
    const tables=document.createElement('link');tables.rel='stylesheet';
    tables.href=new URL('../../styles/table-text.css?v=20261020',scriptUrl).href;
    tables.dataset.tableText='';document.head.appendChild(tables);
  }
  if(!document.querySelector('script[data-mascaras]')){
    // Pontuação automática de CPF, CNPJ, telefone, CEP e PIS nos campos com data-mascara.
    const m=document.createElement('script');m.src=new URL('mascaras.js?v=20261025',scriptUrl).href;m.dataset.mascaras='';document.head.appendChild(m);
  }
  if(!document.querySelector('script[data-filter-inputs]')){
    const filters=document.createElement('script');
    filters.src=new URL('filterInputs.js?v=20261020-autofill2',scriptUrl).href;
    filters.dataset.filterInputs='';document.head.appendChild(filters);
  }
  if(!document.querySelector('script[data-global-loading]')){
    const loader=document.createElement('script');
    loader.src=new URL('loading.js?v=20261020',scriptUrl).href;
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
