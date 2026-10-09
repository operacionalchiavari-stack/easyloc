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
const { configuracao, liberarOrigem, usuarioDaSessao } = require("./gs");
const { createClient } = require('@supabase/supabase-js');

async function perfisMensagens(cfg, mensagens){
  const client=createClient(cfg.url,cfg.chave,{auth:{persistSession:false}});
  const ids=[...new Set(mensagens.map(m=>m.autorId).filter(Boolean))];
  if(!ids.length)return;
  const [{data:funcionarios},{data:vinculos},{data:usuarios}]=await Promise.all([
    client.from('funcionarios_acesso').select('id,nome,foto_url,empresa_id').in('id',ids),
    client.from('usuarios_empresas').select('user_id,empresa_id').in('user_id',ids),
    client.from('usuarios').select('id,nome').in('id',ids)
  ]);
  const perfis=await Promise.all(ids.map(async id=>{
    const f=(funcionarios || []).find(f=>f.id===id);
    const empresa=f?.empresa_id || (vinculos || []).find(v=>v.user_id===id)?.empresa_id;
    let foto=f?.foto_url || '';
    if(foto && !/^https?:\/\//i.test(foto)){
      if(!empresa || !foto.startsWith(empresa+'/'))foto='';
      else {const {data}=await client.storage.from('funcionarios-fotos').createSignedUrl(foto,3600);foto=data?.signedUrl || '';}
    }
    if(!foto && empresa)foto=client.storage.from('avatares').getPublicUrl(empresa+'/'+id+'.jpg').data.publicUrl;
    return {id,nome:f?.nome || (usuarios || []).find(u=>u.id===id)?.nome,foto};
  }));
  mensagens.forEach(m=>{const p=perfis.find(p=>p.id===m.autorId);if(p){m.foto=p.foto || m.foto;if(p.nome)m.autor=p.nome;}});
}

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
  if (!["GET","POST"].includes(req.method)) { res.status(405).json({ ok: false, erro: "Use GET ou POST." }); return; }

  const cfg = configuracao(req);
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");

  try {
    const usuario = await usuarioDoToken(cfg, token);
    if (!usuario) { res.status(401).json({ ok: false, erro: "Sessão expirada. Entre de novo." }); return; }
    if(req.method === "POST"){
      const corpo = req.body || {};
      if(corpo.acao === 'aviso' || corpo.acao === 'corAviso'){
        const membro=await usuarioDaSessao(cfg,token);
        if(!membro) return res.status(403).json({ok:false,erro:'Sem acesso à empresa.'});
        const resultado=await executar(cfg,PROJETOS.portal,corpo.acao === 'corAviso' ? 'MURAL_corAviso_' : 'MURAL_publicarAviso_',[corpo.dados],{interno:true,usuario:membro});
        return res.status(200).json({ok:true,resultado});
      }
      const perfilResposta = await fetch(cfg.url + '/rest/v1/usuarios?select=*&id=eq.' + encodeURIComponent(usuario.id), {headers:{apikey:cfg.chave,Authorization:'Bearer '+cfg.chave}});
      const perfis = perfilResposta.ok ? await perfilResposta.json() : [];
      const perfil = perfis[0] || {};
      const foto = perfil.foto_url || perfil.avatar_url || perfil.foto || usuario.user_metadata?.avatar_url || usuario.user_metadata?.picture || '';
      const autor = {id:usuario.id,nome:perfil.nome || usuario.user_metadata?.nome || usuario.user_metadata?.full_name || usuario.email?.split('@')[0] || 'Colega da equipe',foto:/^https?:\/\//i.test(foto) ? foto : ''};
      const resultado = await executar(cfg,PROJETOS.portal,"MURAL_enviarParabens_",[corpo.destinatario,corpo.texto,autor],{interno:true});
      await perfisMensagens(cfg,resultado);
      return res.status(200).json({ok:true,resultado});
    }
    // Resumo do dia (etapas do Cronograma de hoje + agenda interna) — out/2026.
    // Se o Cronograma falhar, o mural continua aparecendo (resumo vem null).
    const [mural, resumoDia, metasSetores] = await Promise.all([
      executar(cfg, PROJETOS.portal, "MURAL_dadosPublicos_", [true], { interno: true }),
      executar(cfg, PROJETOS.cronograma, "PORTAL_resumoDia_", [], { interno: true }).catch((e) => {
        console.error("[portal-mural] resumo do dia", e && e.message || e);
        return null;
      }),
      executar(cfg, PROJETOS.central, "PORTAL_metasSetores_", [], { interno: true }).catch((e) => {
        console.error("[portal-mural] metas por setor", e && e.message || e);
        return null;
      })
    ]);
    await perfisMensagens(cfg,(mural.aniversariantes || []).flatMap(a=>a.mensagens || []));
    res.status(200).json({ ok: true, resultado: Object.assign({}, mural, { resumoDia, metasSetores }) });
  } catch (e) {
    console.error("[portal-mural]", e && e.stack || e);
    res.status(200).json({ ok: false, erro: String(e && e.message || e) });
  }
};
