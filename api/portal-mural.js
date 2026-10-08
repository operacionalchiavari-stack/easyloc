// =====================================================================
// GET /api/portal-mural  (Authorization: Bearer <token do Supabase>)
// Devolve o mural do Portal Interno (avisos, números do mês,
// aniversariantes, reconhecimentos, boas-vindas e galeria) para a tela
// "Início" do dashboard. No Portal original isso vinha junto do login
// do Firebase (PORTAL_iniciar); aqui quem entra é a conta do Acervo,
// então o servidor confere a sessão do Supabase antes de responder.
// =====================================================================
const { executar } = require("./_gas/motor");
const PROJETOS = require("./_gas/projetos");
const { configuracao, liberarOrigem } = require("./gs");

async function usuarioDoToken(cfg, token) {
  if (!token) { return null; }
  const r = await fetch(cfg.url + "/auth/v1/user", {
    headers: { apikey: cfg.chave, Authorization: "Bearer " + token }
  });
  if (!r.ok) { return null; }
  const u = await r.json().catch(() => null);
  return u && u.id ? u : null;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  liberarOrigem(res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "GET") { res.status(405).json({ ok: false, erro: "Use GET." }); return; }

  const cfg = configuracao(req);
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");

  try {
    const usuario = await usuarioDoToken(cfg, token);
    if (!usuario) { res.status(401).json({ ok: false, erro: "Sessão expirada. Entre de novo." }); return; }
    const mural = await executar(cfg, PROJETOS.portal, "MURAL_dadosPublicos_", [], { interno: true });
    res.status(200).json({ ok: true, resultado: mural });
  } catch (e) {
    console.error("[portal-mural]", e && e.stack || e);
    res.status(200).json({ ok: false, erro: String(e && e.message || e) });
  }
};
