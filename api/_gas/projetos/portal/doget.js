function doGet(e) {

  const pagina = e && e.parameter ? String(e.parameter.page || '') : '';
  const base = ScriptApp.getService().getUrl();

  function servir(arquivo, titulo) {
    const t = HtmlService.createTemplateFromFile(arquivo);
    t.urlBase = base;
    return t.evaluate()
      .setTitle(titulo)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  }

  if (pagina === 'portal') {
    return servir('portal', 'Portal Interno • Chiavari Eventos');
  }

  if (pagina === 'mural') {
    return servir('mural_admin', 'Mural • Administração');
  }

  return servir('login', 'Login • Portal Interno');
}
