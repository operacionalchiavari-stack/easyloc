function doGet(e) {

  // Painel Fretes
  if (e && e.parameter && e.parameter.page === "painel") {
    return HtmlService.createHtmlOutputFromFile("FretesPainel")
      .setTitle("Painel • Fretes")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // Página Calendário
  if (e && e.parameter && e.parameter.page === "calendario") {
    return HtmlService.createHtmlOutputFromFile("Calendario")
      .setTitle("Calendário Interno • Chiavari")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // Página Conciliação (NOVA)
  if (e && e.parameter && e.parameter.page === "conciliacao") {
    return HtmlService.createHtmlOutputFromFile("index") // o arquivo HTML da conciliação
      .setTitle("Conciliação Financeira • Chiavari")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // Página padrão (Cadastro Fretes)
  return HtmlService.createHtmlOutputFromFile("Fretes")
    .setTitle("Cadastro de Fretes • Chiavari")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
