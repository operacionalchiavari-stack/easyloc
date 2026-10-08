// =====================================================================
// Rotinas agendadas dos sistemas do Apps Script (no lugar dos gatilhos
// de tempo do Google). Chamado pelo Cron da Vercel (vercel.json), que
// manda "Authorization: Bearer <CRON_SECRET>".
// GET /api/gs-cron?projeto=cronograma&fn=FECH_registrarIndicadoresSemana
// =====================================================================
const { executar } = require("./_gas/motor");
const PROJETOS = require("./_gas/projetos");
const { configuracao } = require("./gs");

module.exports = async (req, res) => {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.authorization !== "Bearer " + segredo) { res.status(401).json({ ok: false }); return; }

  const projeto = PROJETOS[req.query.projeto];
  const fn = String(req.query.fn || "");
  if (!projeto || (projeto.agendadas || []).indexOf(fn) < 0) { res.status(404).json({ ok: false, erro: "Rotina não encontrada." }); return; }

  try {
    const resultado = await executar(configuracao(req), Object.assign({}, projeto, { bloqueadas: [] }), fn, []);
    res.status(200).json({ ok: true, resultado });
  } catch (e) {
    console.error("[gs-cron]", req.query.projeto, fn, e && e.stack || e);
    res.status(500).json({ ok: false, erro: String(e && e.message || e) });
  }
};
