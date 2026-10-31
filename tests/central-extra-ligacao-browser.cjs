// Out/2026 — Central de Pedidos: o traço do pedido extra sai de baixo do número do pedido principal e chega no meio
// do número de cada extra (002 → 002/2 e 002/3), sem o extra encostar na coluna do cliente.
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
    separacoes_pedidos: [{ id: "o1", empresa_id: "e1", numero_pedido: "001", cliente_nome: "Cliente 001", status: "orcamento", pre_reserva_ate: null, data_evento: "2026-12-20", local_nome: "Local", valor_total: 100, created_at: "2026-10-09T10:00:00Z", data_hora: "2026-10-09T10:00:00Z", observacoes: {} },
{ id: "r1", empresa_id: "e1", numero_pedido: "002", cliente_nome: "Cliente 002", status: "aprovado", pre_reserva_ate: null, data_evento: "2026-12-19", local_nome: "Local", valor_total: 100, created_at: "2026-10-09T10:00:00Z", data_hora: "2026-10-09T10:00:00Z", observacoes: {} },
{ id: "p1", empresa_id: "e1", numero_pedido: "003", cliente_nome: "Cliente 003", status: "pre_reserva", pre_reserva_ate: "2026-11-10", data_evento: "2026-12-01", local_nome: "Local", valor_total: 100, created_at: "2026-10-09T10:00:00Z", data_hora: "2026-10-09T10:00:00Z", observacoes: {} },
{ id: "p2", empresa_id: "e1", numero_pedido: "004", cliente_nome: "Cliente 004", status: "pre_reserva", pre_reserva_ate: "2026-10-19", data_evento: "2026-11-01", local_nome: "Local", valor_total: 100, created_at: "2026-10-09T10:00:00Z", data_hora: "2026-10-09T10:00:00Z", observacoes: {} },
{ id: "o2", empresa_id: "e1", numero_pedido: "005", cliente_nome: "Cliente 005", status: "orcamento", pre_reserva_ate: null, data_evento: "2026-12-25", local_nome: "Local", valor_total: 100, created_at: "2026-10-09T10:00:00Z", data_hora: "2026-10-09T10:00:00Z", observacoes: {} },
{ id: "p3", empresa_id: "e1", numero_pedido: "006", cliente_nome: "Cliente 006", status: "pre_reserva", pre_reserva_ate: "2026-10-22", data_evento: "2026-11-05", local_nome: "Local", valor_total: 100, created_at: "2026-10-09T10:00:00Z", data_hora: "2026-10-09T10:00:00Z", observacoes: {} },
{ id: "x1", empresa_id: "e1", numero_pedido: "002/2", pedido_origem_id: "r1", cliente_nome: "Cliente 002", status: "aprovado", pre_reserva_ate: null, data_evento: "2026-12-19", local_nome: "Local", valor_total: 50, created_at: "2026-10-10T10:00:00Z", data_hora: "2026-10-10T10:00:00Z", observacoes: {} },
{ id: "x2", empresa_id: "e1", numero_pedido: "002/3", pedido_origem_id: "r1", cliente_nome: "Cliente 002", status: "aprovado", pre_reserva_ate: null, data_evento: "2026-12-19", local_nome: "Local", valor_total: 50, created_at: "2026-10-11T10:00:00Z", data_hora: "2026-10-11T10:00:00Z", observacoes: {} },
{ id: "c1", empresa_id: "e1", numero_pedido: "007", cliente_nome: "Cliente 007", status: "cancelado", pre_reserva_ate: null, data_evento: "2026-12-30", local_nome: "Local", valor_total: 100, created_at: "2026-10-09T10:00:00Z", data_hora: "2026-10-09T10:00:00Z", observacoes: {} }],
    separacoes_itens: [
      { item_id: "i1", item_nome: "Sofá Berlim", quantidade_solicitada: 2, empresa_id: "e1", separacao_pedido_id: "p1" },
      { item_id: "i2", item_nome: "Bar Bistrol", quantidade_solicitada: 1, empresa_id: "e1", separacao_pedido_id: "p1" },
      { item_id: "i3", item_nome: "Mesa Goa", quantidade_solicitada: 4, empresa_id: "e1", separacao_pedido_id: "p1" } ],
    itens: [
      { id: "i1", empresa_id: "e1", produto: "Berlim", produto_base: "Sofá", descricao_total: "Sofá Berlim Linho (L) 2.58 m (A) 0.73 m (P) 0.89 m", foto_url: "https://fixture/sofa.png", referencia: "SOF001", categoria: "Sofás", largura: 2.58, altura: 0.73, profundidade: 0.89, valor_locacao: 300, valor_reposicao: 5000 },
      { id: "i2", empresa_id: "e1", produto: "Bistrol", produto_base: "Bar", descricao_total: "Bar Bistrol", foto_url: "https://fixture/bar.png", referencia: "BAR002", categoria: "Bares", valor_locacao: 200, valor_reposicao: 3000 },
      { id: "i3", empresa_id: "e1", produto: "Goa", produto_base: "Mesa", descricao_total: "Mesa Goa", foto_url: "", referencia: "MES003", categoria: "Mesas", valor_locacao: null, valor_reposicao: null } ],
    empresas: [{ id: "e1", nome: "Chiavari", logo_url: "https://fixture/logo.png" }],
    clientes_empresas: [{ empresa_id: "e1", nome_razao: "Lis Baêtas", catalogo_logo_url: "https://fixture/lis.png" }]
  };
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
    rpc: (nome) => ({ then: (ok, erro) => Promise.resolve(nome === "funcionario_contexto"
      ? { data: { ativo: true, administrador_legado: true }, error: null } : { data: [], error: null }).then(ok, erro) }),
    channel: () => canal, removeChannel(){},
    storage: { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: "https://fixture/" + p } }) }) }
  };
  window.supabase = { createClient: () => cliente };
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.clock.setFixedTime(new Date('2026-10-21T15:00:00Z'));
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide is not defined/.test(e.message)) erros.push(e.message); });
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); sessionStorage.setItem("usuario_nome", "Teste"); });
  await page.route("**/*", (rota) => {
    const url = rota.request().url();
    if (url.startsWith("https://fixture/")) return rota.fulfill({ contentType: "image/png", body: PNG });
    if (url.includes("supabase-js")) return rota.fulfill({ contentType: "text/javascript", body: mockSupabase });
    if (url.startsWith(BASE)) {
      const arquivo = path.join(raiz, decodeURIComponent(new URL(url).pathname));
      if (!fs.existsSync(arquivo)) return rota.fulfill({ status: 404, body: "" });
      const tipo = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css" }[path.extname(arquivo)] || "application/octet-stream";
      return rota.fulfill({ contentType: tipo, body: fs.readFileSync(arquivo) });
    }
    return rota.abort();
  });
  await page.goto(BASE + "Modulos/Comercial/Pedidos/CentralPedidos.html");
  await page.waitForSelector("[data-situacao=pre_reserva] .central-situacao-conta", { timeout: 15000 });
  const numeros = () => page.$$eval("#centralPedidosTbody [data-pedido-id]", (l) => l.map((t) => t.dataset.pedidoId));
  const botoes = await page.$$eval("[data-situacao]", (l) => l.map((b) => ({ s: b.dataset.situacao, t: b.querySelector("b").textContent, n: b.querySelector(".central-situacao-conta")?.textContent || null, small: b.querySelector("small")?.textContent || "", anim: b.querySelector(".central-situacao-conta") && getComputedStyle(b.querySelector(".central-situacao-conta")).animationName, cor: b.querySelector(".central-situacao-conta") && getComputedStyle(b.querySelector(".central-situacao-conta")).backgroundColor })));
  assert.deepStrictEqual(botoes.map((b) => [b.t, b.n]), [["Todos", null], ["Pré-reserva", "3"], ["Orçamento", "2"], ["Reservado", null]]);
  assert.ok(botoes.filter((b) => b.n).every((b) => b.cor === "rgb(230, 0, 18)" && b.anim === "central-situacao-pulsa"), "bolinha vermelha piscando");
  assert.strictEqual(await page.getAttribute("[data-situacao=\"\"]", "aria-pressed"), "true", "Todos começa ativo");
  assert.strictEqual(botoes[1].small, "1 vencida · 1 vencendo");
  await page.waitForSelector(".central-extra-ligacao");
  const medir = () => page.evaluate(() => { const card = (id) => document.querySelector("tr[data-pedido-id=" + id + "] .pedido-numero-card").getBoundingClientRect(); const pai = card("r1"); const cli = document.querySelector("tr[data-pedido-id=x1] td:nth-child(2)").getBoundingClientRect();
    return { n: document.querySelectorAll(".central-extra-ligacao").length, folga: Math.round(cli.left - card("x1").right), l: [...document.querySelectorAll(".central-extra-ligacao")].map((l, k) => { const r = l.getBoundingClientRect(), f = card(k ? "x2" : "x1"); return [Math.round(r.top - pai.bottom), r.left > pai.left && r.left < pai.right, Math.round(r.right - f.left), Math.round(r.bottom - (f.top + f.height / 2))]; }) }; });
  let m = await medir();
  assert.equal(m.n, 2, "uma ligação por extra");
  m.l.forEach((x) => assert.deepStrictEqual(x, [0, true, 0, 0], "sai de baixo do principal e chega no meio do extra: " + JSON.stringify(m.l)));
  assert.ok(m.folga >= 4, "o número do extra não encosta no cliente (folga " + m.folga + "px)");
  console.log("ok 1 - a ligação sai do número do principal e chega em cada extra");
  await page.setViewportSize({ width: 1280, height: 900 }); await page.waitForTimeout(300);
  m = await medir(); m.l.forEach((x) => assert.deepStrictEqual(x, [0, true, 0, 0], "redesenha ao mudar o tamanho: " + JSON.stringify(m.l)));
  console.log("ok 2 - redesenha quando a tela muda de tamanho");
  if (process.env.SP) { const r = await page.evaluate(() => { document.querySelector("tr[data-pedido-id=r1]").scrollIntoView({ block: "start" }); const a = document.querySelector("tr[data-pedido-id=r1]").getBoundingClientRect(), b = document.querySelector("tr[data-pedido-id=x2]").getBoundingClientRect(); return { y: a.top, h: b.bottom - a.top }; }); await page.screenshot({ path: process.env.SP + "/extra.png", clip: { x: 30, y: Math.max(0, r.y - 4), width: 380, height: Math.min(880, r.h + 8) } }); }
  assert.deepStrictEqual(erros, []);
  await browser.close();
  console.log("todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });