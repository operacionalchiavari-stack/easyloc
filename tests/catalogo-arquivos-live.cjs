// Integração opt-in (out/2026): o decorador (sem login do Acervo, só com o token do catálogo) sobe, lista e apaga
// imagens do PRÓPRIO projeto pela função catalogo-arquivos; o Storage recusa escrita anônima direta; outro projeto
// e token inválido são recusados. Contra o Supabase de verdade; tudo o que cria é apagado no fim.
// Uso: RUN_ARQUIVOS_LIVE=1 node tests/catalogo-arquivos-live.cjs
require("dotenv").config({ quiet: true });
const { createClient } = require("@supabase/supabase-js");
const { randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");
const EMPRESA = "bb1260f0-99cd-4d17-ab9b-23c299b4c50b";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

(async () => {
  if (process.env.RUN_ARQUIVOS_LIVE !== "1") { throw Error("Defina RUN_ARQUIVOS_LIVE=1"); }
  const url = process.env.SUPABASE_URL;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const equipe = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const anon = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const check = r => { if (r.error) { throw Error(r.error.message); } return r.data; };
  const sfx = randomUUID().slice(0, 8), senha = "Temp-" + randomUUID() + "!";
  const emailDec = "decoradora-" + sfx + "@example.invalid";
  let owner, cliente, projeto, projetoOutro;
  try {
    owner = check(await admin.auth.admin.createUser({ email: "arquivos-" + sfx + "@example.invalid", password: senha, email_confirm: true })).user;
    check(await admin.from("usuarios_empresas").insert({ user_id: owner.id, empresa_id: EMPRESA, role: "admin" }));
    check(await equipe.auth.signInWithPassword({ email: owner.email, password: senha }));
    cliente = check(await admin.from("clientes_empresas").insert({ empresa_id: EMPRESA, tipo_pessoa: "PF", nome_razao: "Decoradora Arquivos " + sfx, cpf_cnpj: "00000000000", telefone: "11999990000", email: emailDec, endereco: "Rua Teste, 1", status: "Ativo" }).select("id").single()).id;
    check(await equipe.rpc("configurar_acesso_catalogo", { p_cliente_id: cliente, p_email: emailDec, p_senha: "SenhaDec123", p_ativo: true }));
    const login = check(await anon.rpc("catalogo_login", { p_email: emailDec, p_senha: "SenhaDec123" }));
    assert.ok(login?.token, "decoradora entra no catálogo");
    const token = login.token;
    projeto = check(await anon.rpc("projeto_criar", { p_token: token, p_noivos: "Ana e Bruno " + sfx, p_data_evento: "2026-12-12", p_local_evento: "Villa Teste", p_ambientes: ["Lounge"], p_evento: { tipo: "Casamento", data_entrega: "2026-12-11", data_coleta: "2026-12-13" } })).id;
    projetoOutro = check(await equipe.rpc("projeto_criar", { p_empresa_id: EMPRESA, p_noivos: "Outro " + sfx, p_data_evento: "2026-12-12", p_local_evento: "X", p_ambientes: ["Bar"], p_evento: { tipo: "Casamento", data_entrega: "2026-12-11", data_coleta: "2026-12-13" } })).id;
    const caminho = `${EMPRESA}/${projeto}/renders/${randomUUID()}.png`;

    const direto = await anon.storage.from("projetos").upload(caminho, PNG, { contentType: "image/png" });
    assert.ok(direto.error, "o Storage recusa escrita anônima direta");

    const inv = (body) => anon.functions.invoke("catalogo-arquivos", { body: { bucket: "projetos", catalog_token: token, empresa_id: EMPRESA, ...body } });
    const up = await inv({ acao: "upload", path: caminho });
    assert.ok(!up.error && up.data?.token, "a função dá a URL de envio para o projeto da decoradora: " + (up.error?.message || JSON.stringify(up.data)));
    check(await anon.storage.from("projetos").uploadToSignedUrl(up.data.path, up.data.token, PNG, { contentType: "image/png" }));
    const pub = anon.storage.from("projetos").getPublicUrl(caminho).data.publicUrl;
    assert.equal((await fetch(pub)).status, 200, "a imagem enviada abre pelo link público");
    const lista = await inv({ acao: "listar", pasta: `${EMPRESA}/${projeto}/renders` });
    assert.ok(!lista.error && lista.data.arquivos.some(a => caminho.endsWith(a.name)), "lista os arquivos do projeto");
    const outro = await inv({ acao: "upload", path: `${EMPRESA}/${projetoOutro}/renders/${randomUUID()}.png` });
    assert.ok(outro.error, "não envia para projeto de outra pessoa");
    const ruim = await anon.functions.invoke("catalogo-arquivos", { body: { bucket: "projetos", catalog_token: "token-invalido", acao: "upload", path: caminho } });
    assert.ok(ruim.error, "token inválido é recusado");
    const rm = await inv({ acao: "remover", paths: [caminho] });
    assert.ok(!rm.error, "a decoradora apaga a própria imagem");
    console.log("PASS LIVE: decoradora sobe, lista e apaga imagens do próprio projeto pela função catalogo-arquivos; escrita anônima direta, projeto alheio e token inválido recusados.");
  } finally {
    for (const id of [projeto, projetoOutro].filter(Boolean)) { await admin.from("projetos").delete().eq("id", id); }
    if (cliente) {
      const acessos = ((await admin.from("catalogo_acessos").select("id").eq("cliente_id", cliente)).data || []).map(a => a.id);
      if (acessos.length) { await admin.from("catalogo_sessoes").delete().in("acesso_id", acessos); await admin.from("catalogo_acessos").delete().in("id", acessos); }
      await admin.from("clientes_empresas").delete().eq("id", cliente);
    }
    if (owner) { await admin.from("usuarios_empresas").delete().eq("user_id", owner.id); await admin.from("usuarios").delete().eq("id", owner.id); await admin.auth.admin.deleteUser(owner.id); }
  }
})().catch(e => { console.error(e); process.exit(1); });
