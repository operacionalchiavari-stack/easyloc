// Teste opt-in (RUN_SOLIC_LIVE=1) das especialistas de compras e de manutenção (Edge Function solicitacao-assistente)
// contra a IA real. Empresa e usuário temporários, apagados no fim. Confere: ela pergunta antes de resumir (uma pergunta
// por vez) e chega a um resumo com os campos que a tela grava.
require("dotenv").config({ quiet: true });
const { createClient } = require("@supabase/supabase-js");
const { randomUUID } = require("node:crypto");
const assert = require("node:assert/strict"), fs = require("fs");

(async () => {
  if (process.env.RUN_SOLIC_LIVE !== "1") throw Error("Defina RUN_SOLIC_LIVE=1");
  const url = process.env.SUPABASE_URL;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const client = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const check = (r) => { if (r.error) throw Error(r.error.message); return r.data; };
  const sfx = randomUUID().slice(0, 8), senha = "Temp-" + randomUUID() + "!";
  let empresa, user; const fotosEnviadas = [];
  try {
    empresa = check(await admin.from("empresas").insert({ nome: "TESTE SOLIC " + sfx }).select("id").single()).id;
    user = check(await admin.auth.admin.createUser({ email: "solic-" + sfx + "@example.invalid", password: senha, email_confirm: true })).user;
    check(await admin.from("usuarios").insert({ id: user.id, empresa_id: empresa, nome: "Igor Ramos" }));
    check(await admin.from("usuarios_empresas").insert({ user_id: user.id, empresa_id: empresa, role: "admin" }));
    const sessao = check(await client.auth.signInWithPassword({ email: user.email, password: senha })).session;
    const sessaoCli = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: "Bearer " + sessao.access_token } } });

    const conversa = async (tipo, falas, msgs = [{ papel: "ia", texto: "Oi, Igor! Me conte o que você precisa." }]) => {
      if (!msgs.length) msgs.push({ papel: "ia", texto: "Oi, Igor! Me conte o que você precisa." });
      let r;
      for (const fala of falas) {
        msgs.push(typeof fala === "string" ? { papel: "pessoa", texto: fala } : { papel: "pessoa", ...fala });
        const resp = await fetch(url + "/functions/v1/solicitacao-assistente", { method: "POST", headers: { "Content-Type": "application/json", apikey: process.env.SUPABASE_ANON_KEY, Authorization: "Bearer " + sessao.access_token }, body: JSON.stringify({ empresa_id: empresa, tipo, acao: "conversar", mensagens: msgs }) });
        r = await resp.json(); if (!resp.ok || r.erro) throw Error(r.erro || resp.status);
        msgs.push({ papel: "ia", texto: r.resposta }); console.log("  IA:", r.resposta, r.pronto ? "[PRONTO]" : "");
        if (msgs.length === 3 && !process.env.SEM_CHECAGEM) { assert.equal(r.pronto, false, tipo + ": com pouca informação ela pergunta"); assert.ok((r.resposta.match(/\?/g) || []).length <= 1, "uma pergunta por vez"); }
        if (r.pronto) break;
      }
      return r;
    };
    // 1) A mesa do print do usuário: ela tem que questionar a necessidade/alternativas, não só a especificação.
    const mesa = [];
    let r = await conversa("compra", ["oi, estou precisando de uma mesa pro meu setor", "pode ser qualquer cor, acho que precisa de uns 2 metros"], mesa);
    const perguntasMesa = mesa.filter((m) => m.papel === "ia").map((m) => m.texto).join(" | ");
    assert.match(perguntasMesa, /por que|porque|falta|hoje|outr[ao] setor|estoque|almoxarifado|alternativ|reaproveit|usar no lugar|sem a mesa/i, "questiona a necessidade: " + perguntasMesa);
    console.log("ok 1 - compra: questiona antes de pedir especificação");
    // 2) EPI: pergunta da bota atual e pede foto; com a foto, chega ao resumo com justificativa.
    const bota = [];
    r = await conversa("compra", ["Preciso de uma bota de segurança."], bota);
    assert.match(r.resposta, /bota/i); assert.match(bota.filter((m) => m.papel === "ia").map((m) => m.texto).join(" "), /atual|sua bota|você usa|está usando|como (ela )?está/i, "pergunta da bota atual");
    r = await conversa("compra", ["A minha está com a sola rasgada e entrando água."], bota);
    assert.match(r.resposta, /foto/i, "pede foto como evidência: " + r.resposta);
    const caminho = `${empresa}/${user.id}/${randomUUID()}.jpg`;
    check(await sessaoCli.storage.from("solicitacoes-evidencias").upload(caminho, fs.readFileSync("slide2.jpg"), { contentType: "image/jpeg" }));
    const foto = sessaoCli.storage.from("solicitacoes-evidencias").getPublicUrl(caminho).data.publicUrl;
    fotosEnviadas.push(caminho);
    r = await conversa("compra", [{ texto: "Tirei agora", fotos: [foto] }], bota);
    for (const fala of ["Já procurei no almoxarifado e não tem. É bota de bico de aço, número 42, uso todo dia na montagem.", "Uma só. Uso geral, sem pedido. Preciso até sexta.", "É isso, pode resumir."]) { if (r.pronto) break; r = await conversa("compra", [fala], bota); }
    assert.ok(r.pronto && r.resumo, "bota chega ao resumo");
    console.log("  RESUMO:", JSON.stringify(r.resumo));
    assert.match(r.resumo.descricao_item, /bota/i); assert.ok(r.resumo.justificativa.length >= 10); assert.match(r.resumo.alternativas, /almox|estoque/i);
    console.log("ok 2 - compra de EPI: bota atual, foto, alternativas e justificativa");
    // 3) Manutenção pede foto.
    const man = [];
    r = await conversa("manutencao", ["Tem uma lâmpada queimada no galpão 2, no corredor das prateleiras."], man);
    for (const fala of ["É a terceira lâmpada do corredor, tubular de LED, apagou ontem.", "Não tem risco, só fica escuro para separar os pedidos."]) { if (/foto/i.test(man.filter((m) => m.papel === "ia").map((m) => m.texto).join(" "))) break; r = await conversa("manutencao", [fala], man); }
    assert.match(man.filter((m) => m.papel === "ia").map((m) => m.texto).join(" "), /foto/i, "manutenção pede foto");
    console.log("ok 3 - manutenção pede foto como evidência");
    console.log("todos os testes passaram");
  } finally {
    if (fotosEnviadas.length) await admin.storage.from("solicitacoes-evidencias").remove(fotosEnviadas);
    if (user) { await admin.from("usuarios_empresas").delete().eq("user_id", user.id); await admin.from("usuarios").delete().eq("id", user.id); await admin.auth.admin.deleteUser(user.id); }
    if (empresa) await admin.from("empresas").delete().eq("id", empresa);
  }
})().catch((e) => { console.error(e); process.exit(1); });
