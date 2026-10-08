// =====================================================================
// Sistemas que vieram do Google Apps Script e rodam no motor (motor.js).
// O código de cada um fica em api/_gas/projetos/<pasta>/ exatamente como
// era no Apps Script; as telas ficam em Modulos/Chiavari/<Sistema>/.
// =====================================================================
const path = require("path");

module.exports = {
  cronograma: {
    chave: "cronograma",
    pasta: path.join(__dirname, "projetos", "cronograma"),
    planilhaAtiva: "14HXOljlAeE_8oTd56QB5bsDrDHbuNrdI772HP0I1QAQ",
    urlApp: base => base + "/Modulos/Chiavari/Cronograma/",
    // Rotinas agendadas (vercel.json → /api/gs-cron?projeto=cronograma&fn=...)
    agendadas: ["FECH_registrarIndicadoresSemana"],
    // Funções que existiam só para o editor do Apps Script (gatilhos, testes)
    bloqueadas: ["doGet", "FECH_criarTriggerSemanal", "configurarAuditoriaCronograma", "testeAuditoriaManual"]
  }
};
