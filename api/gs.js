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

// ---------------------------------------------------------------------
// Login do Acervo. As senhas próprias de cada tela foram tiradas (out/2026);
// quem protege agora é o login: toda função que não está em `publicas`
// (as dos apps de campo — Montador, Vagas Free, Motorista, Meu Bônus — que
// são usados sem conta) exige o token do Supabase de alguém vinculado a uma
// empresa em usuarios_empresas. A tela manda o token (gas-cliente.js).
// ---------------------------------------------------------------------
const sessoes = new Map(); // token -> { ate, usuario }; evita conferir no Supabase a cada clique
const VALIDADE_SESSAO = 5 * 60 * 1000;

async function rest(cfg, caminho, corpo) {
  const r = await fetch(cfg.url + "/rest/v1/" + caminho, {
    method: corpo ? "POST" : "GET",
    headers: { apikey: cfg.chave, Authorization: "Bearer " + cfg.chave, "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  return r.ok ? r.json().catch(() => null) : null;
}

/* Quem está logado: { id, nome, email, empresaId, admin, permissoes[] } ou null.
   Mesma regra de public.funcionario_pode: precisa de vínculo em usuarios_empresas;
   funcionário inativo (funcionarios_acesso) não entra; role admin/owner/administrador
   (sem cadastro de funcionário) pode tudo; os outros, as permissões resolvidas. */
async function usuarioDaSessao(cfg, token) {
  if (!token) { return null; }
  const agora = Date.now();
  const cache = sessoes.get(token);
  if (cache && cache.ate > agora) { return cache.usuario; }
  try {
    const r = await fetch(cfg.url + "/auth/v1/user", { headers: { apikey: cfg.chave, Authorization: "Bearer " + token } });
    if (!r.ok) { return null; }
    const u = await r.json().catch(() => null);
    if (!u || !u.id) { return null; }
    const id = encodeURIComponent(u.id);
    const [vinculos, funcionarios, perfis] = await Promise.all([
      rest(cfg, "usuarios_empresas?select=empresa_id,role&user_id=eq." + id),
      rest(cfg, "funcionarios_acesso?select=empresa_id,ativo,nome&id=eq." + id),
      rest(cfg, "usuarios?select=nome&id=eq." + id)
    ]);
    const vinc = Array.isArray(vinculos) && vinculos[0];
    if (!vinc) { return null; }
    const func = Array.isArray(funcionarios) && funcionarios[0];
    if (func && (func.ativo === false || func.empresa_id !== vinc.empresa_id)) { return null; }
    const admin = !func && ["admin", "owner", "administrador"].indexOf(String(vinc.role || "").toLowerCase()) >= 0;
    let permissoes = [];
    if (!admin) {
      const lista = await rest(cfg, "rpc/get_permissoes_usuario_resolvidas", { p_empresa_id: vinc.empresa_id, p_usuario_id: u.id });
      permissoes = (Array.isArray(lista) ? lista : []).filter(p => p && p.permitido).map(p => p.chave);
    }
    const usuario = {
      id: u.id,
      email: u.email || "",
      nome: (func && func.nome) || (Array.isArray(perfis) && perfis[0] && perfis[0].nome) || u.email || "Usuário",
      empresaId: vinc.empresa_id,
      admin,
      permissoes
    };
    if (sessoes.size > 500) { sessoes.clear(); }
    sessoes.set(token, { ate: agora + VALIDADE_SESSAO, usuario });
    return usuario;
  } catch (e) {
    console.error("[gs] conferir sessão", e && e.message || e);
    return null;
  }
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

  const cfg = configuracao(req);
  const fn = String(corpo.fn || "");
  // Quem está logado vai junto pro código (Acervo.usuario()/Acervo.pode() — ver motor.js).
  // Os apps de campo (funções em `publicas`) seguem sem usuário quando não há login.
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const usuario = await usuarioDaSessao(cfg, token);
  if ((projeto.publicas || []).indexOf(fn) < 0) {
    if (!usuario) {
      res.status(401).json({ ok: false, erro: "Entre no sistema para usar esta tela.", login: true });
      return;
    }
  }

  try {
    const resultado = await executar(cfg, projeto, fn, Array.isArray(corpo.args) ? corpo.args : [], { usuario });
    res.status(200).json({ ok: true, resultado });
  } catch (e) {
    console.error("[gs]", corpo.projeto, corpo.fn, e && e.stack || e);
    res.status(200).json({ ok: false, erro: String(e && e.message || e) });
  }
};

module.exports.configuracao = configuracao;
module.exports.liberarOrigem = liberarOrigem;
