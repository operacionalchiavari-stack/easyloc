// Teste opt-in (RUN_IDEIA_LIVE=1) da assistente da Ideia Premiada contra a Edge Function e a IA reais.
// Empresa e usuário temporários, apagados no fim. Confere: a assistente pergunta (uma pergunta por vez), chega a um
// resumo completo quando a ideia está clara, e transcreve um áudio de verdade (IDEIA_AUDIO=caminho de um .wav, opcional).
require("dotenv").config({ quiet: true });
const { createClient } = require("@supabase/supabase-js");
const { randomUUID } = require("node:crypto");
const fs = require("fs"), assert = require("node:assert/strict");

(async () => {
  if (process.env.RUN_IDEIA_LIVE !== "1") throw Error("Defina RUN_IDEIA_LIVE=1");
  const url = process.env.SUPABASE_URL;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const client = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const check = (r) => { if (r.error) throw Error(r.error.message); return r.data; };
  const sfx = randomUUID().slice(0, 8), senha = "Temp-" + randomUUID() + "!";
  let empresa, user;
  try {
    empresa = check(await admin.from("empresas").insert({ nome: "TESTE IDEIA " + sfx }).select("id").single()).id;
    user = check(await admin.auth.admin.createUser({ email: "ideia-" + sfx + "@example.invalid", password: senha, email_confirm: true })).user;
    check(await admin.from("usuarios").insert({ id: user.id, empresa_id: empresa, nome: "Igor Ramos" }));
    check(await admin.from("usuarios_empresas").insert({ user_id: user.id, empresa_id: empresa, role: "admin" }));
    const sessao = check(await client.auth.signInWithPassword({ email: user.email, password: senha })).session;
    const chamar = async (body) => {
      const r = await fetch(url + "/functions/v1/ideia-assistente", { method: "POST", headers: { "Content-Type": "application/json", apikey: process.env.SUPABASE_ANON_KEY, Authorization: "Bearer " + sessao.access_token }, body: JSON.stringify({ empresa_id: empresa, ...body }) });
      const d = await r.json(); if (!r.ok || d.erro) throw Error(d.erro || r.status); return d;
    };
    const msgs = [{ papel: "ia", texto: "Oi, Igor! Me conte sua ideia." }];
    const falar = async (texto) => { msgs.push({ papel: "pessoa", texto }); const r = await chamar({ acao: "conversar", mensagens: msgs }); msgs.push({ papel: "ia", texto: r.resposta }); console.log("  IA:", r.resposta, r.pronto ? "[PRONTO]" : ""); return r; };
    let r = await falar("Percebi que os caminhões voltam vazios dos eventos.");
    assert.equal(r.pronto, false, "com pouca informação ela pergunta"); assert.ok((r.resposta.match(/\?/g) || []).length <= 2, "uma pergunta por vez");
    r = await falar("A ideia é usar a volta para buscar insumos nos fornecedores que ficam no caminho, como tecido e espuma.");
    if (!r.pronto) r = await falar("Isso economizaria o frete que pagamos para entregarem, uns 400 reais por semana, e o almoxarifado recebe mais rápido. O cuidado é combinar o horário com o fornecedor.");
    if (!r.pronto) r = await falar("Acho que é isso, pode resumir.");
    assert.ok(r.pronto && r.resumo, "chega ao resumo");
    console.log("  RESUMO:", JSON.stringify(r.resumo, null, 1));
    assert.ok(r.resumo.titulo.length >= 5 && r.resumo.beneficio.length >= 10 && r.resumo.area);
    assert.match(r.resumo.beneficio, /400|frete/i, "benefício com o que a pessoa contou");
    console.log("ok 1 - conversa e resumo com a IA real");
    if (process.env.IDEIA_AUDIO) {
      const b = fs.readFileSync(process.env.IDEIA_AUDIO);
      const t = await chamar({ acao: "transcrever", audio: "data:audio/wav;base64," + b.toString("base64") });
      console.log("  TRANSCRIÇÃO:", t.texto);
      assert.match(t.texto, /caminh/i);
      console.log("ok 2 - áudio real transcrito");
    }
    console.log("todos os testes passaram");
  } finally {
    if (user) { await admin.from("usuarios_empresas").delete().eq("user_id", user.id); await admin.from("usuarios").delete().eq("id", user.id); await admin.auth.admin.deleteUser(user.id); }
    if (empresa) await admin.from("empresas").delete().eq("id", empresa);
  }
})().catch((e) => { console.error(e); process.exit(1); });
