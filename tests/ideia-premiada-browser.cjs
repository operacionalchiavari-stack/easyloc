// Nov/2026 — Ideia Premiada em duas colunas: lista (com a foto de quem enviou) | detalhes, decisão com justificativa e histórico.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://localhost:5598/";
const mock = String.raw`(() => {
  const ideias = [
    { id: "i1", autor_id: "u1", autor_nome: "Ana Souza", titulo: "Economia de material", area: "Estoque e triagem", problema: "Sobra muita fita.", proposta: "Usar rolos menores.", beneficio: "Menos desperdício.", status: "recebida", retorno: "", premio: "", created_at: "2026-11-01T12:00:00Z", updated_at: "2026-11-01T12:00:00Z", historico: [] },
    { id: "i2", autor_id: "u2", autor_nome: "Bruno Lima", titulo: "Checklist do caminhão", area: "Logística", problema: "Esquecem itens.", proposta: "Checklist na porta.", beneficio: "Menos viagens.", status: "selecionada", retorno: "Ótima ideia, vamos testar.", premio: "", created_at: "2026-11-02T12:00:00Z", updated_at: "2026-11-02T12:00:00Z", historico: [{ status: "selecionada", retorno: "Ótima ideia, vamos testar.", em: "2026-11-03T15:00:00Z", por: "Carol RH" }] } ];
  window.__chamadas = [];
  const cliente = {
    auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "rh" } } } }), getUser: async () => ({ data: { user: { id: "rh" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    storage: { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: "https://fixture/" + p } }) }) },
    from: () => { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: () => q, single: () => q, then: (ok) => Promise.resolve({ data: [], error: null }).then(ok) }; return q; },
    rpc: async (nome, args) => {
      window.__chamadas.push({ nome, args });
      if (nome === "ideias_premiadas_listar") return { data: JSON.parse(JSON.stringify(ideias)), error: null };
      if (nome === "ideias_premiadas_avaliar") { const i = ideias.find((x) => x.id === args.p_id); i.status = args.p_status; i.retorno = args.p_retorno; i.updated_at = new Date().toISOString(); i.historico.unshift({ status: args.p_status, retorno: args.p_retorno, em: i.updated_at, por: "Carol RH" }); return { data: i, error: null }; }
      if (nome === "funcionario_contexto") return { data: { ativo: true, administrador_legado: true }, error: null };
      return { data: null, error: null };
    } };
  window.supabase = { createClient: () => cliente };
})();`;
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erros = []; page.on("pageerror", (e) => erros.push(e.message));
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); sessionStorage.setItem("usuario_nome", "Carol"); });
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("supabase-js")) return r.fulfill({ contentType: "text/javascript", body: mock });
    if (u.startsWith("https://fixture/")) return r.fulfill({ status: 404, body: "" });
    if (u.startsWith(BASE)) { const f = path.join(raiz, decodeURIComponent(new URL(u).pathname)); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" }); return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" }); }
    return r.abort();
  });
  await page.goto(BASE + "Modulos/RH/IdeiaPremiada/ideia-premiada.html?aba=recebidas");
  await page.waitForSelector(".ideia-item");
  const col = await page.evaluate(() => { const a = document.querySelector(".ideia-col-lista").getBoundingClientRect(), b = document.getElementById("ideiaDetalhe").getBoundingClientRect(); return { lado: b.left > a.right, topo: Math.abs(a.top - b.top) }; });
  assert.ok(col.lado && col.topo < 4, "duas colunas lado a lado");
  assert.ok(await page.evaluate(() => { const l = document.getElementById("listaIdeias"); return getComputedStyle(l).overflowY !== "auto" && l.scrollHeight <= l.clientHeight + 1; }), "lista sem barra própria");
  assert.ok(await page.evaluate(() => document.querySelector(".ideia-col-lista").getBoundingClientRect().top - document.querySelector(".ideia-tabs").getBoundingClientRect().bottom) < 90, "colunas perto das abas");
  assert.equal(await page.locator(".ideia-item .ideia-foto").count(), 1, "foto (ou iniciais) de quem enviou em cada ideia");
  assert.match(await page.textContent(".ideia-item"), /Economia de material[\s\S]*Ana Souza/);
  assert.match(await page.textContent("#ideiaDetalhe"), /Economia de material[\s\S]*Sobra muita fita/, "a primeira ideia já aparece nos detalhes");
  assert.deepStrictEqual(await page.$$eval("#ideiaGrupos [data-grupo]", (l) => l.map((b) => b.textContent.replace(/\s+/g, " ").trim())), ["Recebidas 1", "Em espera 0", "Premiadas 1", "Reprovadas 0"]);
  assert.equal(await page.getAttribute("[data-grupo=recebidas]", "aria-selected"), "true", "começa em Recebidas");
  assert.ok(await page.evaluate(() => { const n = document.getElementById("ideiaGrupos"), d = document.getElementById("ideiaDetalhe").getBoundingClientRect(); return [...n.querySelectorAll("button")].every((b) => b.getBoundingClientRect().right <= d.left) && n.getBoundingClientRect().height < 50; }), "abas numa linha, sem invadir os detalhes");
  console.log("ok 1 - duas colunas: ideias com a foto de quem enviou | detalhes");

  assert.deepStrictEqual(await page.$$eval("[data-decisao]", (l) => l.map((b) => b.textContent)), ["Aprovar e premiar", "Colocar em espera", "Reprovar"]);
  assert.ok(await page.locator("#salvarAvaliacao").isDisabled(), "sem decisão escolhida não salva");
  await page.click("[data-decisao=nao_priorizada]");
  await page.click("#salvarAvaliacao");
  assert.match(await page.textContent("#avisoAvaliacao"), /justificativa/i, "justificativa obrigatória");
  assert.ok(!(await page.evaluate(() => window.__chamadas.some((c) => c.nome === "ideias_premiadas_avaliar"))));
  await page.fill("#formAvaliacao textarea[name=retorno]", "Custo alto agora, retomamos no próximo ano.");
  await page.click("#salvarAvaliacao");
  await page.waitForFunction(() => window.__chamadas.some((c) => c.nome === "ideias_premiadas_avaliar"));
  const salvo = await page.evaluate(() => window.__chamadas.find((c) => c.nome === "ideias_premiadas_avaliar").args);
  assert.equal(salvo.p_status, "nao_priorizada"); assert.equal(salvo.p_id, "i1"); assert.match(salvo.p_retorno, /Custo alto/);
  await page.waitForFunction(() => /Reprovadas 1/.test(document.getElementById("ideiaGrupos").textContent.replace(/\s+/g, " ")));
  assert.equal(await page.locator("#listaIdeias [data-id=i1]").count(), 0, "sai de Recebidas");
  await page.click("[data-grupo=reprovadas]");
  await page.waitForSelector("#listaIdeias [data-id=i1]");
  assert.match(await page.textContent("#ideiaDetalhe"), /Histórico de decisões[\s\S]*Reprovada[\s\S]*Custo alto/);
  console.log("ok 2 - reprovar exige a justificativa, salva e entra no histórico");

  await page.click("[data-grupo=premiadas]");
  await page.click('[data-id="i2"]');
  assert.match(await page.textContent("#ideiaDetalhe"), /Checklist do caminhão[\s\S]*Ótima ideia/);
  assert.equal(await page.locator("[data-grupo=aprovadas]").count(), 0, "sem aba Aprovadas: aprovada fica em Premiadas");
  await page.click("[data-decisao=premiada]");
  assert.ok(await page.locator(".ideia-premio").isVisible(), "aprovar e premiar pede a premiação");
  await page.fill("#formAvaliacao textarea[name=retorno]", "Funcionou no teste de outubro.");
  await page.click("#salvarAvaliacao");
  assert.match(await page.textContent("#avisoAvaliacao"), /premiação/i, "premiação obrigatória");
  await page.fill("#formAvaliacao input[name=premio]", "Vale-presente de R$ 300");
  await page.click("#salvarAvaliacao");
  await page.waitForFunction(() => window.__chamadas.some((c) => c.nome === "ideias_premiadas_avaliar" && c.args.p_status === "premiada"));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });
  console.log("ok 3 - trocar de ideia na lista e premiar uma aprovada");

  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(150);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 392), "celular sem rolagem lateral");
  assert.deepStrictEqual(erros, []);
  await browser.close();
  console.log("todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });
