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

// As telas também abrem pelo GitHub Pages (outro domínio), que chama este servidor
// direto: libera a origem (sem cookies — nada aqui depende de sessão do navegador).
function liberarOrigem(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  liberarOrigem(res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
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
module.exports.liberarOrigem = liberarOrigem;
