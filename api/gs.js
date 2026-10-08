// =====================================================================
// POST /api/gs  { projeto, fn, args }
// É o "google.script.run" dos sistemas que vieram do Apps Script
// (ver Modulos/Chiavari/gas-cliente.js e api/_gas/motor.js).
// =====================================================================
const { executar } = require("./_gas/motor");
const PROJETOS = require("./_gas/projetos");

function configuracao(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return {
    url: process.env.SUPABASE_URL,
    chave: process.env.SUPABASE_SERVICE_ROLE_KEY,
    mapsKey: process.env.GOOGLE_MAPS_KEY || "",
    urlBase: proto + "://" + host
  };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ ok: false, erro: "Use POST." }); return; }

  let corpo = req.body;
  try { if (typeof corpo === "string") { corpo = JSON.parse(corpo); } } catch (e) { corpo = null; }
  corpo = corpo || {};

  const projeto = PROJETOS[corpo.projeto];
  if (!projeto) { res.status(404).json({ ok: false, erro: "Sistema não encontrado." }); return; }

  try {
    const resultado = await executar(configuracao(req), projeto, String(corpo.fn || ""), Array.isArray(corpo.args) ? corpo.args : []);
    res.status(200).json({ ok: true, resultado });
  } catch (e) {
    console.error("[gs]", corpo.projeto, corpo.fn, e && e.stack || e);
    res.status(200).json({ ok: false, erro: String(e && e.message || e) });
  }
};

module.exports.configuracao = configuracao;
