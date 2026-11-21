// Login do Acervo para as funções da Vercel que continuam (hoje só api/compras-proposta.js, leitura de propostas
// com IA). Era parte de api/gs.js (o servidor antigo das planilhas, apagado em nov/2026).
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-App-Token");
  res.setHeader("Access-Control-Max-Age", "86400");
}

const sessoes = new Map(); // token -> { ate, usuario }; evita conferir no Supabase a cada clique
const VALIDADE_SESSAO = 5 * 60 * 1000;
const EMPRESA_DONA = "bb1260f0-99cd-4d17-ab9b-23c299b4c50b";
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
      rest(cfg, "usuarios_empresas?select=empresa_id,role&user_id=eq." + id + "&empresa_id=eq." + EMPRESA_DONA),
      rest(cfg, "funcionarios_acesso?select=empresa_id,ativo,nome,acesso_sistema&id=eq." + id),
      rest(cfg, "usuarios?select=nome&id=eq." + id)
    ]);
    const vinc = Array.isArray(vinculos) && vinculos[0];
    if (!vinc) { return null; }
    // Verificação em duas etapas (out/2026): com a exigência ligada, a sessão precisa ter confirmado o código do
    // WhatsApp. Pergunta ao banco COMO o usuário (token dele); sem resposta, não libera.
    const st = await fetch(cfg.url + "/rest/v1/rpc/seguranca_2fa_status", {
      method: "POST",
      headers: { apikey: cfg.chave, Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: "{}"
    }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (!st || (st.obrigatorio && !st.verificado)) { return null; }
    const func = Array.isArray(funcionarios) && funcionarios[0];
    if (func && (func.ativo === false || func.acesso_sistema === false || func.empresa_id !== vinc.empresa_id)) { return null; }
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
    console.error("[sessao] conferir sessão", e && e.message || e);
    return null;
  }
}

module.exports = { configuracao, liberarOrigem, usuarioDaSessao };
