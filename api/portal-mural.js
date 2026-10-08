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
    // Resumo do dia (etapas do Cronograma de hoje + agenda interna) — out/2026.
    // Se o Cronograma falhar, o mural continua aparecendo (resumo vem null).
    const [mural, resumoDia] = await Promise.all([
      executar(cfg, PROJETOS.portal, "MURAL_dadosPublicos_", [], { interno: true }),
      executar(cfg, PROJETOS.cronograma, "PORTAL_resumoDia_", [], { interno: true }).catch((e) => {
        console.error("[portal-mural] resumo do dia", e && e.message || e);
        return null;
      })
    ]);
    res.status(200).json({ ok: true, resultado: Object.assign({}, mural, { resumoDia }) });
  } catch (e) {
    console.error("[portal-mural]", e && e.stack || e);
    res.status(200).json({ ok: false, erro: String(e && e.message || e) });
  }
};
