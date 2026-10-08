function doGet(e) {
  // Verifica parametro ?page=
  let page = e && e.parameter && e.parameter.page
      ? e.parameter.page.toLowerCase()
      : "login";

  switch (page) {

    // LOGIN
    case "login":
      return HtmlService.createHtmlOutputFromFile("login")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

    // PAINEL DE CORRIDAS (TABELA + DASHBOARD)
    case "corridas":
      return HtmlService.createHtmlOutputFromFile("corridas")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

    // APP DO MOTORISTA (antigo formulário de envio)
    case "motorista":
    case "app":
    case "form":
    case "formulario":
    case "index":
      return HtmlService.createHtmlOutputFromFile("motorista")
        .setTitle("Chiavari • Motorista")
        .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover")
        .addMetaTag("mobile-web-app-capable", "yes")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

    // PADRÃO → LOGIN
    default:
      return HtmlService.createHtmlOutputFromFile("login")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}
