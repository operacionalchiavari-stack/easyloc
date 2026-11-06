// Nov/2026 — Ideia Premiada: conversa com a assistente (texto e áudio), resumo para aprovar e envio ao RH.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://localhost:5597/";
const mock = String.raw`(() => {
  window.__chamadas = [];
  let rodada = 0;
  const cliente = {
    auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }), getUser: async () => ({ data: { user: { id: "u1" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    storage: { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: "https://fixture/" + p } }) }) },
    from: () => { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: () => q, single: () => q, then: (ok) => Promise.resolve({ data: [], error: null }).then(ok) }; return q; },
    functions: { invoke: async (nome, { body }) => {
      window.__chamadas.push({ nome, body });
      if (body.acao === "transcrever") return { data: { texto: "Os caminhões voltam vazios do evento" }, error: null };
      rodada++;
      if (rodada === 1) return { data: { resposta: "Entendi! E como você imagina a solução na prática?", pronto: false, resumo: null }, error: null };
      return { data: { resposta: "Perfeito, vou te mostrar o resumo para conferir.", pronto: true, resumo: { titulo: "Retorno aproveitado dos caminhões", area: "Logística", problema: "Os caminhões voltam vazios dos eventos.", proposta: "Usar a volta para buscar material de fornecedores no caminho.", beneficio: "Economia de frete e menos viagens." } }, error: null };
    } },
    rpc: async (nome, args) => {
      window.__chamadas.push({ nome, args });
      if (nome === "ideias_premiadas_listar") return { data: [], error: null };
      if (nome === "funcionario_contexto") return { data: { ativo: true, administrador_legado: true }, error: null };
      return { data: null, error: null };
    } };
  window.supabase = { createClient: () => cliente };
})();`;
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erros = []; page.on("pageerror", (e) => erros.push(e.message));
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); sessionStorage.setItem("usuario_nome", "Igor Ramos"); });
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("supabase-js")) return r.fulfill({ contentType: "text/javascript", body: mock });
    if (u.startsWith(BASE)) { const f = path.join(raiz, decodeURIComponent(new URL(u).pathname)); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" }); return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" }); }
    return r.abort();
  });
  await page.goto(BASE + "Modulos/RH/IdeiaPremiada/ideia-premiada.html");
  await page.waitForSelector("#ideiaMsgs .ideia-msg.ia");
  assert.ok(await page.locator("#formIdeia").isHidden(), "o formulário dá lugar ao chat");
  assert.match(await page.textContent("#ideiaMsgs"), /Oi, Igor!/);
  assert.match(await page.textContent(".ideia-aviso"), /avaliadas pela empresa/);
  assert.equal(await page.locator(".ideia-aviso").evaluate((e) => getComputedStyle(e).backgroundColor), "rgb(255, 250, 235)", "aviso em card amarelo");
  assert.equal(await page.locator(".ideia-passos li").count(), 3);
  console.log("ok 1 - chat no lugar do formulário, lado esquerdo com passos e aviso amarelo");

  await page.setInputFiles("#ideiaAudioArquivo", { name: "ideia.webm", mimeType: "audio/webm", buffer: Buffer.alloc(2000, 1) });
  await page.waitForFunction(() => /como você imagina a solução/.test(document.getElementById("ideiaMsgs").textContent));
  const tr = await page.evaluate(() => window.__chamadas.find((c) => c.body?.acao === "transcrever").body);
  assert.match(tr.audio, /^data:audio\/webm;base64,/); assert.equal(tr.empresa_id, "e1");
  assert.match(await page.textContent(".ideia-msg.pessoa"), /Áudio[\s\S]*caminhões voltam vazios/, "o áudio vira texto na conversa");
  console.log("ok 2 - áudio transcrito e enviado para a assistente");

  await page.fill("#ideiaChatTexto", "Na volta a gente busca material dos fornecedores.");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".ideia-resumo [data-aprovar]");
  const conv = await page.evaluate(() => window.__chamadas.filter((c) => c.body?.acao === "conversar").at(-1).body.mensagens);
  assert.deepStrictEqual(conv.map((m) => m.papel), ["ia", "pessoa", "ia", "pessoa"], "a conversa inteira vai para a assistente");
  assert.match(await page.textContent(".ideia-resumo"), /Retorno aproveitado dos caminhões[\s\S]*Logística[\s\S]*Economia de frete/);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await page.reload();
  await page.waitForSelector(".ideia-resumo [data-aprovar]");
  console.log("ok 3 - resumo para aprovar (e a conversa sobrevive a recarregar a página)");

  await page.click("[data-aprovar]");
  await page.waitForFunction(() => window.__chamadas.some((c) => c.nome === "ideias_premiadas_enviar"));
  const env = await page.evaluate(() => window.__chamadas.find((c) => c.nome === "ideias_premiadas_enviar").args);
  assert.equal(env.p_empresa, "e1"); assert.equal(env.p_dados.titulo, "Retorno aproveitado dos caminhões"); assert.equal(env.p_dados.area, "Logística");
  await page.waitForSelector(".ideia-msg-ok");
  assert.match(await page.textContent(".ideia-resumo"), /Enviada para o RH/);
  console.log("ok 4 - aprovar envia a ideia ao RH");

  await page.click("#ideiaUsarFormulario");
  assert.ok(await page.locator("#formIdeia").isVisible() && await page.locator("#ideiaChat").isHidden(), "dá para usar o formulário");
  await page.click("#ideiaVoltarChat");
  assert.ok(await page.locator("#ideiaChat").isVisible());
  await page.click("#ideiaRecomecar");
  assert.equal(await page.locator("#ideiaMsgs .ideia-msg").count(), 1, "começar de novo limpa a conversa");
  console.log("ok 5 - formulário como alternativa e começar de novo");

  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(150);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 392), "celular sem rolagem lateral");
  assert.deepStrictEqual(erros, []);
  await browser.close();
  console.log("todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });
