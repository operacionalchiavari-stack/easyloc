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
  },
  fretes: {
    chave: "fretes",
    pasta: path.join(__dirname, "projetos", "fretes"),
    planilhaAtiva: "1uVhL4YbFbheyWDfVpDSwzPRg1P4AmgkMhAUhogrSVQs",
    urlApp: base => base + "/Modulos/Chiavari/Fretes/",
    agendadas: [],
    bloqueadas: ["doGet"]
  },
  costura: {
    chave: "costura",
    pasta: path.join(__dirname, "projetos", "costura"),
    planilhaAtiva: "1btYPbmM0-uwwjHx2Yu6zbFFUefv3IXHwcMXY_qw0p78",
    urlApp: base => base + "/Modulos/Chiavari/Costura/",
    agendadas: [],
    bloqueadas: ["doGet"]
  },
  uber: {
    chave: "uber",
    pasta: path.join(__dirname, "projetos", "uber"),
    planilhaAtiva: "1qYMrypoMvB7t1kwmw-lm_Dye7262OhifKEpXEW5oWow",
    urlApp: base => base + "/Modulos/Chiavari/Uber/",
    agendadas: [],
    bloqueadas: ["doGet"]
  },
  ocorrencias: {
    chave: "ocorrencias",
    pasta: path.join(__dirname, "projetos", "ocorrencias"),
    planilhaAtiva: "1i197sFXQSzZ7yVdRlQ_Z6H7K9TuaoN5rOOpPnoyjOhI",
    urlApp: base => base + "/Modulos/Chiavari/Ocorrencias/",
    agendadas: [],
    bloqueadas: ["doGet"]
  },
  almoxarifado: {
    chave: "almoxarifado",
    pasta: path.join(__dirname, "projetos", "almoxarifado"),
    planilhaAtiva: "1IIW1wI52mlymAJ7q4a8Y7y-cjNniCCaPm1EHP4hNFRI",
    urlApp: base => base + "/Modulos/Chiavari/Almoxarifado/",
    agendadas: ["atualizarTetoGastosAutomatico"],
    bloqueadas: ["doGet"]
  },
  controlerh: {
    chave: "controlerh",
    pasta: path.join(__dirname, "projetos", "controlerh"),
    planilhaAtiva: "1Jk1ScSsqmdYo70AiD96A5HRmfnVe2zdyljPn5f9EAZo",
    urlApp: base => base + "/Modulos/Chiavari/ControleRH/",
    agendadas: [],
    bloqueadas: ["doGet"]
  },
  feedback: {
    chave: "feedback",
    pasta: path.join(__dirname, "projetos", "feedback"),
    planilhaAtiva: "1lh7ArXcVK11PxGrmbMhTA9plR_S8eiESi3s49ZrgYOA",
    urlApp: base => base + "/Modulos/Chiavari/Feedback/",
    agendadas: [],
    bloqueadas: ["doGet"]
  },
  central: {
    chave: "central",
    pasta: path.join(__dirname, "projetos", "central"),
    planilhaAtiva: "1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE",
    urlApp: base => base + "/Modulos/Chiavari/CentralMetas/",
    agendadas: [],
    bloqueadas: ["doGet"]
  },
  portal: {
    chave: "portal",
    pasta: path.join(__dirname, "projetos", "portal"),
    planilhaAtiva: "133H-gZXPDZ_H_9ETKRRs35PV_4uAuvQHOQcdyFmAxvk",
    urlApp: base => base + "/Modulos/Chiavari/Portal/",
    agendadas: [],
    bloqueadas: ["doGet"]
  }
};
