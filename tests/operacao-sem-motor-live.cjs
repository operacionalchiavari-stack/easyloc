// Integração opt-in (out/2026): Cronograma, Painel Logístico, Equipe Free, Painel RH Free, App do Montador
// e App do Free rodando SEM o motor da Vercel, contra o Supabase de verdade.
// Tudo o que o teste cria (usuário, funcionário, free, sessões, fotos, alterações) é apagado no fim.
// Uso: RUN_OPERACAO_LIVE=1 node tests/operacao-sem-motor-live.cjs
require("dotenv").config({ quiet: true });
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { randomUUID } = require("node:crypto");
const fs = require("fs"), path = require("path"), assert = require("node:assert/strict");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const EMPRESA = "bb1260f0-99cd-4d17-ab9b-23c299b4c50b";
const tipos = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".jpg": "image/jpeg", ".webp": "image/webp" };
const FOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
function cpfValido() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  for (const t of [10, 11]) { let s = 0; n.forEach((d, i) => { s += d * (t - i); }); const r = (s * 10) % 11; n.push(r === 10 ? 0 : r); }
  return n.join("");
}

(async () => {
  if (process.env.RUN_OPERACAO_LIVE !== "1") { throw Error("Defina RUN_OPERACAO_LIVE=1"); }
  const url = process.env.SUPABASE_URL; assert.equal(new URL(url).hostname, "awemuohtvwvrdzfxwrmd.supabase.co");
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const client = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const check = r => { if (r.error) { throw Error(r.error.message); } return r.data; };
  const suffix = randomUUID().slice(0, 8), senha = "Temp-" + randomUUID() + "!", cpf = cpfValido();
  const nomeMont = "Teste Montador " + suffix;
  let owner, mont, freeId, browser, etapaTeste, escalaAntes;
  const erros = [];
  try {
    owner = check(await admin.auth.admin.createUser({ email: "operacao-" + suffix + "@example.invalid", password: senha, email_confirm: true })).user;
    check(await admin.from("usuarios_empresas").insert({ user_id: owner.id, empresa_id: EMPRESA, role: "admin" }));
    const sessao = check(await client.auth.signInWithPassword({ email: owner.email, password: senha })).session;
    const r = await client.functions.invoke("funcionarios-admin", { body: { action: "save", empresa_id: EMPRESA, employee: { nome: nomeMont, setor: "Montagem", cargo: "Teste", acesso_sistema: false, ativo: true, pin: "0123", nivel_acesso: "Visualizador", cpf: "", equipe_operacional: "montagem" } } });
    if (r.error) { let d; try { d = await r.error.context.json(); } catch (e) {} throw Error(d?.error || r.error.message); }
    mont = r.data.id;
    check(await client.rpc("rh_definir_lider", { p_empresa_id: EMPRESA, p_funcionario: mont, p_lider: true }));

    browser = await chromium.launch({ channel: "msedge" });
    const novoContexto = async (logado) => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.route("**/*", rota => {
        const u = new URL(rota.request().url());
        if (u.origin + "/" !== BASE) { return rota.continue(); }
        if (u.pathname.startsWith("/api/")) { erros.push("Chamou o motor antigo: " + u.pathname); return rota.fulfill({ status: 500, body: "{}" }); }
        const arq = path.join(raiz, decodeURIComponent(u.pathname));
        if (!fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { return rota.fulfill({ status: 404, body: "" }); }
        return rota.fulfill({ contentType: tipos[path.extname(arq)] || "application/octet-stream", body: fs.readFileSync(arq) });
      });
      await ctx.route(/easyloc-zeta\.vercel\.app/, rota => { erros.push("Chamou a Vercel: " + rota.request().url()); return rota.fulfill({ status: 500, body: "{}" }); });
      if (logado) { await ctx.addInitScript(s => { localStorage.setItem("easyloc-auth", s); sessionStorage.setItem("login_ok", "1"); }, JSON.stringify(sessao)); }
      return ctx;
    };
    const abrir = async (ctx, rota) => {
      const page = await ctx.newPage();
      page.on("pageerror", e => erros.push(rota + ": " + e.message));
      page.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource/i.test(m.text())) { erros.push(rota + " (console): " + m.text()); } });
      await page.goto(BASE + rota);
      await page.waitForFunction(() => window.ACERVO_LOCAL && window.google && window.google.script);
      return page;
    };
    const L = (page, fn, ...args) => page.evaluate(([fn, args]) => window.ACERVO_LOCAL[fn](...args), [fn, args]);

    /* ----- equipe logada ----- */
    const equipe = await novoContexto(true);
    const crono = await abrir(equipe, "Modulos/Chiavari/Cronograma/cronograma.html");
    const semana = await L(crono, "getCronogramaSemana", "2026-10-19");
    assert.ok(semana.length > 3, "cronograma da semana vem das tabelas novas: " + semana.length);
    assert.ok(semana.every(g => g.chave.startsWith("sis:") && g.etapas.length >= 1));
    await crono.waitForFunction(() => document.querySelectorAll(".evento-box").length > 0, null, { timeout: 30000 });
    console.log("ok 1 - cronograma abre com", semana.length, "pedidos na semana, sem o motor");

    const painel = await abrir(equipe, "Modulos/Logistica/PainelLogistico/painel-logistico.html");
    const p = await L(painel, "ESC_painel", "2026-10-19", 7, false);
    assert.ok(p.etapas.length > 5 && p.pessoas.some(x => x.nome === nomeMont && x.lider));
    etapaTeste = p.etapas.find(e => e.tipo === "montagem" && !e.passada);
    escalaAntes = { responsavel: etapaTeste.responsavel, equipe: etapaTeste.equipe, caminhoes: etapaTeste.caminhoes };
    const s1 = await L(painel, "ESC_salvarEtapa", etapaTeste.id, { responsavel: nomeMont, equipe: [], caminhoes: escalaAntes.caminhoes }, false);
    assert.ok(s1.ok || s1.conflitos.length, "salvar escala responde");
    if (!s1.ok) { await L(painel, "ESC_salvarEtapa", etapaTeste.id, { responsavel: nomeMont, equipe: [], caminhoes: escalaAntes.caminhoes }, true); }
    const outra = p.etapas.find(e => e.id !== etapaTeste.id && e.data === etapaTeste.data && e.tipo === "montagem");
    if (outra) {
      const s2 = await L(painel, "ESC_salvarEtapa", outra.id, { responsavel: nomeMont, equipe: outra.equipe, caminhoes: outra.caminhoes }, false);
      assert.equal(s2.ok, false, "mesma pessoa em duas montagens no mesmo dia: conflito");
      assert.ok(s2.conflitos.some(m => m.includes(nomeMont)), JSON.stringify(s2.conflitos));
    }
    await painel.waitForFunction(() => document.body.innerText.includes("Montagem"), null, { timeout: 30000 });
    console.log("ok 2 - painel logístico lista, grava a escala e recusa a mesma pessoa em dois lugares" + (outra ? "" : " (sem 2ª montagem no dia para testar conflito)"));

    const agendaAntes = (await L(crono, "listarAgendaPorPeriodo", "2026-10-19", "2026-10-25").catch(() => null));
    const ef = await abrir(equipe, "Modulos/Chiavari/Cronograma/equipe-free.html");
    const cad = await L(ef, "FREE_admListarCadastros");
    assert.ok(Array.isArray(cad));
    const rh = await abrir(equipe, "Modulos/Chiavari/Cronograma/rh.html");
    const lg = await L(rh, "RH_login");
    assert.ok(lg && (lg.token || lg.nome || lg.sucesso !== false), "RH entra pelo login do Acervo");
    console.log("ok 3 - Equipe Free e Painel RH Free abrem pelo login do Acervo", agendaAntes ? "" : "");

    /* ----- App do Montador (sem login do Acervo) ----- */
    const campo = await novoContexto(false);
    const appM = await abrir(campo, "Modulos/Chiavari/Cronograma/montador.html");
    await appM.waitForFunction(n => [...document.querySelectorAll("#loginNome option")].some(o => o.textContent.trim() === n), nomeMont, { timeout: 30000 });
    await appM.selectOption("#loginNome", { label: nomeMont });
    await appM.fill("#loginSenha", "9999");
    await appM.click("#btnEntrar");
    await appM.waitForSelector("#erroLogin.ver", { timeout: 20000 });
    await appM.fill("#loginSenha", "0123");
    await appM.click("#btnEntrar");
    await appM.waitForFunction(() => localStorage.getItem("montadorToken"), null, { timeout: 20000 });
    const dadosM = await L(appM, "MONT_appCarregar", await appM.evaluate(() => localStorage.getItem("montadorToken")), "");
    const minhas = JSON.stringify(dadosM);
    assert.ok(minhas.includes(etapaTeste.id), "o montador vê a etapa em que foi escalado");
    console.log("ok 4 - App do Montador: PIN errado recusado, PIN certo entra e vê a etapa escalada");

    /* ----- App do Free ----- */
    const appF = await abrir(campo, "Modulos/Chiavari/Cronograma/free.html");
    const cadF = await L(appF, "FREE_appCadastrar", { nome: "Teste Free " + suffix, cpf, telefone: "11999990000", senha: "Senha123", pix: "teste@pix", foto: FOTO });
    assert.ok(cadF.token);
    freeId = check(await admin.from("free_cadastros").select("id,status,foto_url,cpf").eq("nome", "Teste Free " + suffix).single());
    assert.ok(String(freeId.cpf).startsWith("cofre:v1:"), "CPF do Free gravado cifrado");
    assert.ok(/operacao-fotos/.test(freeId.foto_url || ""), "foto do cadastro foi pro Storage");
    const login = await L(appF, "FREE_appLogin", cpf, "Senha123");
    const dadosF = await L(appF, "FREE_appCarregar", login.token);
    assert.equal(String(dadosF.perfil.status).toUpperCase(), "PENDENTE");
    await assert.rejects(L(appF, "FREE_appLogin", cpf, "errada"));
    console.log("ok 5 - App do Free: cadastro com foto, login, senha errada recusada");

    const aprovou = await L(ef, "FREE_admAlterarStatusCadastro", "", freeId.id, "APROVADO");
    assert.ok(Array.isArray(aprovou));
    assert.equal(check(await admin.from("free_cadastros").select("status").eq("id", freeId.id).single()).status.toLowerCase(), "aprovado");
    console.log("ok 6 - Equipe Free aprova o cadastro");

    assert.deepEqual(erros, [], "sem erros nem chamadas ao motor:\n" + erros.join("\n"));
    console.log("PASS LIVE: operação sem o motor da Vercel.");
  } finally {
    if (browser) { await browser.close(); }
    if (owner) { await admin.from("operacao_alteracoes").delete().like("usuario_nome", "%" + suffix + "%"); await admin.from("operacao_alteracoes").delete().eq("usuario_nome", owner.email); }
    if (etapaTeste && escalaAntes) {
      const v = await client.rpc("operacao_escala_salvar", { p_etapa: etapaTeste.id, p_responsavel: escalaAntes.responsavel || "", p_equipe: escalaAntes.equipe || [], p_caminhoes: escalaAntes.caminhoes || [], p_forcar: true });
      if (v.error) { console.error("Não voltou a escala da etapa", etapaTeste.id, v.error.message); }
    }
    const limparSessoes = async (campo, id) => {
      const ses = (await admin.from("app_sessoes").select("pasta").eq(campo, id)).data || [];
      for (const s of ses) { const arqs = (await admin.storage.from("operacao-fotos").list(s.pasta)).data || []; if (arqs.length) { await admin.storage.from("operacao-fotos").remove(arqs.map(a => s.pasta + "/" + a.name)); } }
      await admin.from("app_sessoes").delete().eq(campo, id);
    };
    if (freeId) { await limparSessoes("free_id", freeId.id); await admin.from("free_cadastros").delete().eq("id", freeId.id); }
    if (mont) { await limparSessoes("funcionario_id", mont); }
    for (const id of [mont, owner && owner.id].filter(Boolean)) {
      await admin.from("rh_pin_tentativas").delete().eq("funcionario_id", id);
      await admin.from("logs_permissoes").delete().eq("usuario_alvo_id", id);
      await admin.from("permissoes_usuario").delete().eq("usuario_id", id);
      await admin.from("usuarios_empresas").delete().eq("user_id", id);
      await admin.from("usuarios").delete().eq("id", id);
      await admin.from("funcionarios_acesso").delete().eq("id", id);
      if (!(await admin.auth.admin.getUserById(id)).error) { await admin.auth.admin.deleteUser(id); }
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
