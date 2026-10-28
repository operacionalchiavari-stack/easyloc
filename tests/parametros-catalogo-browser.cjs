// Out/2026 — Parâmetros > Catálogo: preço, estoque e disponível, cada um com Equipe interna / Decoradores (todos,
// só os escolhidos, nenhum) / Visitantes. Grava em catalogo_parametros.config.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const raiz = path.resolve(__dirname, "..");
const BASE = "http://acervo.teste/";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64");

// Supabase simulado: from(tabela) devolve um construtor encadeável que só tem "then" (igual ao real).
const mockSupabase = `
(() => {
  const banco = {
    empresas: [{ id: "e1", nome: "Chiavari", razao_social: "Chiavari", cnpj: "" }],
    catalogo_parametros: [{ empresa_id: "e1", config: { preco: { equipe: true, decoradores: "escolhidos", decoradores_ids: ["c2"], visitantes: false } } }]
  };
  window.__gravado = null;
  function consulta(tabela){
    let linhas = (banco[tabela] || []).slice(), unico = false;
    const q = {
      select(){ return q; }, order(){ return q; }, limit(){ return q; }, range(){ return q; }, gte(){ return q; }, lte(){ return q; },
      neq(){ return q; }, or(){ return q; }, ilike(){ return q; }, not(){ return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      in(c, vs){ linhas = linhas.filter((l) => vs.map(String).includes(String(l[c]))); return q; },
      single(){ unico = true; return q; }, maybeSingle(){ unico = true; return q; },
      update(){ return q; }, insert(){ return q; }, upsert(p){ window.__gravado = p; return q; }, delete(){ return q; },
      then(ok, erro){ return Promise.resolve({ data: unico ? (linhas[0] || null) : linhas, error: null }).then(ok, erro); }
    };
    return q;
  }
  const canal = { on(){ return canal; }, subscribe(){ return canal; } };
  const cliente = {
    auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }),
      getUser: async () => ({ data: { user: { id: "u1", email: "a@b" } } }), signOut: async () => {},
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: consulta,
    rpc: (nome) => ({ then: (ok, erro) => Promise.resolve(nome === "funcionario_contexto"
      ? { data: { ativo: true, administrador_legado: true }, error: null }
      : nome === "catalogo_decoradores_lista" ? { data: [{ id: "c1", nome: "Lis Baêtas", ativo: true }, { id: "c2", nome: "Kelly Khawam", ativo: true }, { id: "c3", nome: "Fabiane", ativo: false }], error: null }
      : { data: [], error: null }).then(ok, erro) }),
    channel: () => canal, removeChannel(){},
    storage: { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: "https://fixture/" + p } }) }) }
  };
  window.supabase = { createClient: () => cliente };
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide|google/i.test(e.message)) erros.push(e.message); });
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); sessionStorage.setItem("usuario_nome", "Teste"); });
  await page.route("**/*", (rota) => {
    const url = rota.request().url();
    if (url.includes("supabase-js")) return rota.fulfill({ contentType: "text/javascript", body: mockSupabase });
    if (url.startsWith(BASE)) {
      const arquivo = path.join(raiz, decodeURIComponent(new URL(url).pathname));
      if (!fs.existsSync(arquivo)) return rota.fulfill({ status: 404, body: "" });
      const tipo = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[path.extname(arquivo)] || "application/octet-stream";
      return rota.fulfill({ contentType: tipo, body: fs.readFileSync(arquivo) });
    }
    return rota.abort();
  });
  await page.goto(BASE + "Modulos/Configuracoes/Parametros/parametros.html");
  await page.waitForSelector("[data-recurso=preco]", { state: "attached", timeout: 15000 });
  await page.waitForFunction(() => document.querySelector("#pr-tab-dados") && !document.getElementById("salvarEmpresaParametros").disabled, null, { timeout: 15000 }).catch(() => {});
  await page.click("#pr-tab-catalogo");
  await page.waitForSelector("#pr-painel-catalogo:not([hidden]) [data-recurso=preco]");
  assert.deepStrictEqual(await page.$$eval("[data-recurso] h3", (l) => l.map((h) => h.textContent)), ["Preço", "Quantidade em estoque", "Quantidade disponível"]);
  const preco = await page.$eval("[data-recurso=preco]", (s) => ({ modo: s.querySelector("input[type=radio]:checked").value, lista: !s.querySelector(".pr-cat-decoradores").hidden, marcados: [...s.querySelectorAll("[data-decorador]:checked")].map((i) => i.dataset.decorador) }));
  assert.deepStrictEqual(preco, { modo: "escolhidos", lista: true, marcados: ["c2"] });
  const estoque = await page.$eval("[data-recurso=estoque]", (s) => ({ equipe: s.querySelector("[data-campo=equipe]").checked, vis: s.querySelector("[data-campo=visitantes]").checked, modo: s.querySelector("input[type=radio]:checked").value, lista: !s.querySelector(".pr-cat-decoradores").hidden }));
  assert.deepStrictEqual(estoque, { equipe: true, vis: false, modo: "todos", lista: false }, "sem configuração vale o padrão de antes");
  assert.ok(await page.isHidden("#parametrosEmpresa"), "o bloco da empresa some na aba Catálogo");
  console.log("ok 1 - aba Catálogo com Preço, Estoque e Disponível; carrega a configuração salva e o padrão");

  await page.click("[data-recurso=estoque] input[value=escolhidos]");
  assert.ok(await page.isVisible("[data-recurso=estoque] .pr-cat-decoradores"));
  await page.evaluate(() => { window.__alertas = []; window.alerta = (m) => window.__alertas.push(m); });
  await page.click("#btnSalvarCatalogo");
  assert.ok((await page.evaluate(() => window.__alertas.join(" "))).includes("escolha pelo menos um decorador"));
  assert.strictEqual(await page.evaluate(() => window.__gravado), null);
  console.log("ok 2 - Só os escolhidos mostra a lista e exige ao menos um decorador");

  await page.check("[data-recurso=estoque] [data-decorador=c1]");
  await page.click("[data-recurso=disponivel] input[value=nenhum]");
  await page.check("[data-recurso=disponivel] [data-campo=visitantes]");
  await page.click("#btnSalvarCatalogo");
  await page.waitForFunction(() => window.__gravado);
  const g = await page.evaluate(() => window.__gravado);
  assert.strictEqual(g.empresa_id, "e1");
  assert.deepStrictEqual(g.config, {
    preco: { equipe: true, visitantes: false, decoradores: "escolhidos", decoradores_ids: ["c2"] },
    estoque: { equipe: true, visitantes: false, decoradores: "escolhidos", decoradores_ids: ["c1"] },
    disponivel: { equipe: true, visitantes: true, decoradores: "nenhum", decoradores_ids: [] } });
  console.log("ok 3 - salvar grava a configuração dos três itens");
  await page.setViewportSize({ width: 390, height: 800 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 391), "celular sem rolagem lateral");
  console.log("ok 4 - celular sem rolagem lateral");
  if (process.env.FOTO) { await page.setViewportSize({ width: 1280, height: 900 }); await page.screenshot({ path: process.env.FOTO, fullPage: true }); }
  assert.deepStrictEqual(erros, []);
  await browser.close();
  console.log("todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });
