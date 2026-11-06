// Teste opt-in (RUN_SOLIC_LIVE=1) das especialistas de compras e de manutenção (Edge Function solicitacao-assistente)
// contra a IA real. Empresa e usuário temporários, apagados no fim. Confere: ela pergunta antes de resumir (uma pergunta
// por vez) e chega a um resumo com os campos que a tela grava.
require("dotenv").config({ quiet: true });
const { createClient } = require("@supabase/supabase-js");
const { randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");

(async () => {
  if (process.env.RUN_SOLIC_LIVE !== "1") throw Error("Defina RUN_SOLIC_LIVE=1");
  const url = process.env.SUPABASE_URL;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const client = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const check = (r) => { if (r.error) throw Error(r.error.message); return r.data; };
  const sfx = randomUUID().slice(0, 8), senha = "Temp-" + randomUUID() + "!";
  let empresa, user;
  try {
    empresa = check(await admin.from("empresas").insert({ nome: "TESTE SOLIC " + sfx }).select("id").single()).id;
    user = check(await admin.auth.admin.createUser({ email: "solic-" + sfx + "@example.invalid", password: senha, email_confirm: true })).user;
    check(await admin.from("usuarios").insert({ id: user.id, empresa_id: empresa, nome: "Igor Ramos" }));
    check(await admin.from("usuarios_empresas").insert({ user_id: user.id, empresa_id: empresa, role: "admin" }));
    const sessao = check(await client.auth.signInWithPassword({ email: user.email, password: senha })).session;
    const conversa = async (tipo, falas) => {
      const msgs = [{ papel: "ia", texto: "Oi, Igor! Me conte o que você precisa." }];
      let r;
      for (const texto of falas) {
        msgs.push({ papel: "pessoa", texto });
        const resp = await fetch(url + "/functions/v1/solicitacao-assistente", { method: "POST", headers: { "Content-Type": "application/json", apikey: process.env.SUPABASE_ANON_KEY, Authorization: "Bearer " + sessao.access_token }, body: JSON.stringify({ empresa_id: empresa, tipo, acao: "conversar", mensagens: msgs }) });
        r = await resp.json(); if (!resp.ok || r.erro) throw Error(r.erro || resp.status);
        msgs.push({ papel: "ia", texto: r.resposta }); console.log("  IA:", r.resposta, r.pronto ? "[PRONTO]" : "");
        if (msgs.length === 3) { assert.equal(r.pronto, false, tipo + ": com pouca informação ela pergunta"); assert.ok((r.resposta.match(/\?/g) || []).length <= 1, "uma pergunta por vez"); }
        if (r.pronto) break;
      }
      return r;
    };
    let r = await conversa("compra", ["Preciso de fita dupla face.",
      "É fita dupla face 3M VHB, 19 mm de largura, rolo de 20 metros. Quero 6 rolos.",
      "É para colar os espelhos nos painéis do pedido 9, da decoradora Ana, evento dia 21.",
      "Preciso até dia 18. Não tenho link, pode ser similar se for de boa qualidade.",
      "Acho que é isso, pode resumir."]);
    assert.ok(r.pronto && r.resumo, "compra chega ao resumo");
    console.log("  RESUMO:", JSON.stringify(r.resumo));
    assert.equal(r.resumo.quantidade, 6); assert.match(r.resumo.descricao_item, /dupla face/i); assert.match(r.resumo.pedido, /9/);
    assert.match(r.resumo.data_necessidade, /^\d{4}-\d{2}-18$/); assert.ok(r.resumo.motivo.length >= 5);
    console.log("ok 1 - especialista em compras");
    r = await conversa("manutencao", ["Tem um vazamento no banheiro.",
      "É no banheiro masculino do galpão 2, a descarga da segunda cabine não para de correr água desde ontem.",
      "Não tem risco, mas está alagando um pouco o chão e desperdiçando água. Ninguém mexeu ainda.",
      "Sem prazo específico, o quanto antes.",
      "É isso, pode resumir."]);
    assert.ok(r.pronto && r.resumo, "manutenção chega ao resumo");
    console.log("  RESUMO:", JSON.stringify(r.resumo));
    assert.equal(r.resumo.categoria, "hidraulica"); assert.match(r.resumo.local, /galp/i); assert.ok(["normal", "alta", "urgente"].includes(r.resumo.prioridade));
    console.log("ok 2 - especialista em manutenção");
    console.log("todos os testes passaram");
  } finally {
    if (user) { await admin.from("usuarios_empresas").delete().eq("user_id", user.id); await admin.from("usuarios").delete().eq("id", user.id); await admin.auth.admin.deleteUser(user.id); }
    if (empresa) await admin.from("empresas").delete().eq("id", empresa);
  }
})().catch((e) => { console.error(e); process.exit(1); });
