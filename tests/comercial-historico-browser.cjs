// Out/2026 — Comercial > Histórico: resumo, filtros (enviados ao servidor), lista de pedidos com contagem, linha do tempo
// por dia com tipo, pedido, descrição e quem; escolher um pedido mostra só o histórico dele; exportar CSV.
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
  const banco = {};
  const agora = Date.now();
  const H = (min, extra) => Object.assign({ id: "h" + min, quando: new Date(agora - min * 60000).toISOString(), inicio: new Date(agora - min * 60000).toISOString(), autor_tipo: "equipe" }, extra);
  const LINHAS = [
    H(5, { origem: "pedido", pedido_id: "p1", pedido_numero: "2178", cliente_nome: "Lis Baêtas", tipo: "itens", autor: "Jonatan Falck", descricao: "Mudou a quantidade de Cadeira Tiffany: 12 → 15" }),
    H(9, { origem: "pedido", pedido_id: "p1", pedido_numero: "2178", cliente_nome: "Lis Baêtas", tipo: "status", autor: "Carol", descricao: "Mudou a situação: Orçamento → Pré-reserva" }),
    H(20, { origem: "pedido", pedido_id: "p2", pedido_numero: "2190", cliente_nome: "Kelly Khawam", tipo: "financeiro", autor: "Sistema", autor_tipo: "sistema", descricao: "Recebeu R$ 1.000,00 — Locação · parcela 1/2 (PIX)" }),
    H(60 * 30, { origem: "catalogo", pedido_id: null, projeto_id: "c1", projeto_nome: "Elis e Bruno", cliente_nome: "Lis Baêtas", tipo: "catalogo", autor: "Lis Baêtas", autor_tipo: "decorador", descricao: "Adicionou 4× Sofá Berlim em Lounge" })
  ];
  window.__rpcHist = [];
  function consulta(tabela){
    let linhas = (banco[tabela] || []).slice(), unico = false;
    const q = {
      select(){ return q; }, order(){ return q; }, limit(){ return q; }, range(){ return q; }, gte(){ return q; }, lte(){ return q; },
      neq(){ return q; }, or(){ return q; }, ilike(){ return q; }, not(){ return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      in(c, vs){ linhas = linhas.filter((l) => vs.map(String).includes(String(l[c]))); return q; },
      single(){ unico = true; return q; }, maybeSingle(){ unico = true; return q; },
      update(){ return q; }, insert(){ return q; }, upsert(){ return q; }, delete(){ return q; },
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
    rpc: (nome, args) => ({ then: (ok, erro) => Promise.resolve(nome === "funcionario_contexto"
      ? { data: { ativo: true, administrador_legado: true }, error: null }
      : nome === "comercial_historico" ? (window.__rpcHist.push(args), { data: LINHAS.filter((l) => (!args.p_pedido || l.pedido_id === args.p_pedido) && (!args.p_tipo || l.tipo === args.p_tipo)), error: null })
      : { data: [], error: null }).then(ok, erro) }),
    channel: () => canal, removeChannel(){},
    storage: { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: "https://fixture/" + p } }) }) }
  };
  window.supabase = { createClient: () => cliente };
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await page.clock.install({ time: new Date('2026-10-25T15:00:00Z') });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
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
  await page.goto(BASE + "Modulos/Comercial/Historico/historico.html");
  await page.waitForSelector(".hc-item", { timeout: 15000 });
  await page.waitForFunction(() => document.getElementById("hcKpiHoje").textContent !== "—");
  assert.strictEqual(await page.textContent("#hcKpiHoje"), "3");
  assert.strictEqual(await page.textContent("#hcKpiSemana"), "4");
  assert.strictEqual(await page.textContent("#hcKpiPedidos"), "3");
  assert.strictEqual(await page.textContent("#hcKpiPessoas"), "3", "sem contar o Sistema");
  const dias = (await page.locator(".hc-dia h4").allTextContents()).map((t) => t.replace(/\d+$/, "").trim());
  assert.deepStrictEqual(dias, ["Hoje", "Ontem"]);
  const primeira = await page.locator(".hc-item").first().innerText();
  assert.match(primeira, /Itens/); assert.match(primeira, /Pedido 2178 · Lis Baêtas/); assert.match(primeira, /12 → 15/); assert.match(primeira, /Jonatan Falck/);
  assert.match(await page.locator(".hc-item").nth(3).innerText(), /Projeto Elis e Bruno/);
  const autores = await page.$$eval("#hcAutor option", (o) => o.map((x) => x.textContent));
  assert.ok(autores.includes("Carol") && autores.includes("Sistema"));
  const peds = await page.$$eval(".hc-ped strong", (l) => l.map((x) => x.textContent));
  assert.deepStrictEqual(peds, ["Todos os pedidos", "Pedido 2178", "Pedido 2190", "Projeto Elis e Bruno"]);
  console.log("ok 1 - resumo, linha do tempo por dia (tipo, pedido, descrição, quem), pessoas e pedidos à esquerda");

  await page.selectOption("#hcTipo", "financeiro");
  await page.waitForFunction(() => document.querySelectorAll(".hc-item").length === 1);
  assert.strictEqual(await page.evaluate(() => window.__rpcHist.at(-1).p_tipo), "financeiro", "filtro vai pro servidor");
  await page.selectOption("#hcTipo", "");
  await page.waitForFunction(() => document.querySelectorAll(".hc-item").length === 4);
  console.log("ok 2 - filtro por tipo");

  await page.click('.hc-ped[data-hc-ped="p:p1"]');
  await page.waitForFunction(() => document.querySelectorAll(".hc-item").length === 2);
  assert.strictEqual(await page.evaluate(() => window.__rpcHist.at(-1).p_pedido), "p1");
  assert.match(await page.textContent("#hcPedidoTopo"), /Pedido 2178[\s\S]*Alterações[\s\S]*2/);
  assert.ok(await page.isVisible('[data-hc-abrir="p1"]'), "botão Abrir pedido");
  await page.click('#hcPedidoTopo [data-hc-ped=""]');
  await page.waitForFunction(() => document.querySelectorAll(".hc-item").length === 4);
  console.log("ok 3 - escolher um pedido mostra só o histórico dele, com resumo e Abrir pedido");

  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#hcExportar")]);
  const csv = fs.readFileSync(await download.path(), "utf8");
  assert.match(csv, /"Data";.*"Alteração";.*"Quem"/); assert.match(csv, /12 → 15/);
  console.log("ok 4 - exportar CSV");
  if (process.env.FOTO) await page.screenshot({ path: process.env.FOTO, fullPage: true });
  await page.setViewportSize({ width: 390, height: 800 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 391), "celular sem rolagem lateral");
  console.log("ok 5 - celular sem rolagem lateral");
  assert.deepStrictEqual(erros.filter((e) => !/lucide|google/i.test(e)), []);
  await browser.close();
  console.log("todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });
