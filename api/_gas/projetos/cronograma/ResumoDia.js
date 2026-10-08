/****************************************************
 * RESUMO DO DIA — tela Início do dashboard (out/2026)
 *
 * Pedido: "no portal da nossa equipe quero um resumo do dia, o que
 * temos naquele dia... puxa do cronograma, o que temos de montagem,
 * o que temos de triagem". Leitura leve (só a aba Cronograma e a
 * Agenda, sem os cruzamentos de getCronogramaSemana). Chamada só pelo
 * servidor (api/portal-mural.js, executar(..., { interno: true })) —
 * termina em "_", então o navegador não chama direto.
 ****************************************************/

const RESUMO_ORDEM_ETAPAS = [
  "Triagem (Separação)",
  "Triagem (Conferência)",
  "Carregamento",
  "Montagem",
  "Desmontagem"
];

function RESUMO_horaTexto_(v, tz) {
  if (v instanceof Date) { return Utilities.formatDate(v, tz, "HH:mm"); }
  return String(v || "").replace(/^'/, "").trim();
}

function PORTAL_resumoDia_(dataISO) {
  const tz = Session.getScriptTimeZone();
  const hoje = dataISO || Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  const ss = SpreadsheetApp.openById("14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ");

  /* Etapas do cronograma com data de hoje */
  const grupos = {};
  const aba = ss.getSheetByName(NOME_ABA);
  const linhas = aba ? aba.getDataRange().getValues() : [];
  for (let i = 1; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l[0] || !l[5]) { continue; }
    const dataEtapa = l[6] instanceof Date ? Utilities.formatDate(l[6], tz, "yyyy-MM-dd") : "";
    if (dataEtapa !== hoje) { continue; }
    const etapa = String(l[5]).trim();
    (grupos[etapa] = grupos[etapa] || []).push({
      pedido: String(l[1] || "").trim(),
      cliente: String(l[3] || "").trim(),
      local: String(l[4] || "").trim(),
      horario: RESUMO_horaTexto_(l[7], tz),
      caminhao: String(l[8] || "").trim(),
      responsavel: String(l[9] || "").trim(),
      equipe: String(l[10] || "").trim()
    });
  }
  const etapas = Object.keys(grupos)
    .sort(function (a, b) {
      const ia = RESUMO_ORDEM_ETAPAS.indexOf(a), ib = RESUMO_ORDEM_ETAPAS.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    })
    .map(function (etapa) {
      const itens = grupos[etapa].sort(function (a, b) { return (a.horario || "99").localeCompare(b.horario || "99"); });
      return { etapa: etapa, total: itens.length, itens: itens };
    });

  /* Agenda interna de hoje */
  const agenda = [];
  const abaAgenda = ss.getSheetByName("Agenda");
  const linhasAgenda = abaAgenda ? abaAgenda.getDataRange().getValues() : [];
  for (let i = 1; i < linhasAgenda.length; i++) {
    const a = linhasAgenda[i];
    if (!(a[2] instanceof Date) || Utilities.formatDate(a[2], tz, "yyyy-MM-dd") !== hoje) { continue; }
    agenda.push({
      horario: RESUMO_horaTexto_(a[9], tz),
      tipo: String(a[4] || "").trim(),
      setor: String(a[3] || "").trim(),
      descricao: String(a[5] || "").trim(),
      responsavel: String(a[1] || "").trim()
    });
  }
  agenda.sort(function (a, b) { return (a.horario || "99").localeCompare(b.horario || "99"); });

  return {
    data: hoje,
    totalEtapas: etapas.reduce(function (s, g) { return s + g.total; }, 0),
    etapas: etapas,
    agenda: agenda
  };
}
