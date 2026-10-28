// Disponibilidade de Itens: filtros (data, busca, categoria, status) com banco simulado (out/2026).
// Também confere que o botão "Simular semana movimentada" não existe mais.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const DIR = "Modulos/Estoque/DisponibilidadeItens/";

const host = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/styles/global.css"><link rel="stylesheet" href="/${DIR}disponibilidade-itens.css"></head>
<body><main id="main-content"></main>
<script>
(async () => {
  document.getElementById("main-content").innerHTML = await (await fetch("/${DIR}disponibilidade-itens.html")).text();
  const s = document.createElement("script"); s.src = "/${DIR}disponibilidade-itens.js";
  s.onload = () => window.__moduleInit(); document.body.appendChild(s);
})();
</script></body></html>`;

const mock = () => {
  const E = "e1", D = "2099-11-10";
  window.__CONTEXT = { empresa_id: E };
  const itens = [];
  // 60 itens: Cadeiras e Mesas no começo da ordem por id; Sofás no fim (testa a busca que precisa paginar).
  for (let i = 0; i < 30; i++) itens.push({ id: "a" + String(i).padStart(3, "0"), codigo: "CAD-" + i, produto: i === 5 ? "Cadeira Ágata Branca" : "Cadeira " + i, tipo: "Item", categoria: "Cadeiras", estoque_total: 10, empresa_id: E });
  for (let i = 0; i < 27; i++) itens.push({ id: "b" + String(i).padStart(3, "0"), codigo: "MES-" + i, produto: i === 3 ? "Mesa Agata Redonda" : "Mesa " + i, tipo: "Item", categoria: "Mesas", estoque_total: 5, empresa_id: E });
  for (let i = 0; i < 3; i++) itens.push({ id: "z" + String(i).padStart(3, "0"), codigo: "SOF-" + i, produto: "Sofá " + i, tipo: "Item", categoria: "Sofás", estoque_total: 2, empresa_id: E });
  const pedido = (n, de, ate) => ({ id: "p" + n, numero_pedido: String(n), cliente_nome: "Cliente " + n, status_comercial: "aprovado", data_entrega: de, data_coleta: ate, data_evento: de });
  const reservas = [
    // dia D: a000 esgota (10/10), a001 fica em atenção (9/10), z000 esgota (2/2)
    { id: "r1", item_id: "a000", quantidade_solicitada: 10, empresa_id: E, separacoes_pedidos: pedido(1, D, D) },
    { id: "r2", item_id: "a001", quantidade_solicitada: 9, empresa_id: E, separacoes_pedidos: pedido(2, D, D) },
    { id: "r3", item_id: "z000", quantidade_solicitada: 2, empresa_id: E, separacoes_pedidos: pedido(3, D, D) }
  ];
  const tabelas = { itens, kit_itens: [], separacoes_itens: reservas, itens_patrimonios: [] };
  window.__consultas = 0;
  window.supabaseClient = {
    from(tabela) {
      const filtros = [], ordens = []; let faixa = null;
      const q = {
        select() { return q; },
        eq(c, v) { filtros.push(r => r[c] === v); return q; },
        in(c, vs) { filtros.push(r => vs.includes(r[c])); return q; },
        order(c) { ordens.push(c); return q; },
        range(a, b) { faixa = [a, b]; return q; },
        then(ok, no) {
          window.__consultas++;
          let rows = (tabelas[tabela] || []).filter(r => filtros.every(f => f(r)));
          if (ordens.length) rows.sort((a, b) => { for (const c of ordens) { const x = String(a[c] || "").localeCompare(String(b[c] || "")); if (x) return x; } return 0; });
          if (faixa) rows = rows.slice(faixa[0], faixa[1] + 1);
          return new Promise(r => setTimeout(r, 5)).then(() => ({ data: rows, error: null })).then(ok, no);
        }
      };
      return q;
    },
    async rpc() { return { data: [], error: null }; }
  };
};

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const erros = []; page.on("pageerror", e => erros.push(e.message));
  await page.addInitScript(mock);
  await page.route("**/*", r => {
    const u = new URL(r.request().url());
    if (!u.href.startsWith(BASE)) return r.abort();
    if (u.pathname === "/__host.html") return r.fulfill({ contentType: "text/html", body: host });
    const f = path.join(raiz, decodeURIComponent(u.pathname));
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
    return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" });
  });
  await page.goto(BASE + "__host.html");
  await page.waitForFunction(() => document.querySelectorAll(".dispon-row").length >= 20);

  const linhas = () => page.$$eval(".dispon-row", rs => rs.map(r => ({ nome: r.querySelector(".dispon-item-name").textContent.trim(), cat: r.children[2].textContent.trim(), status: r.querySelector(".dispon-badge").className.replace("dispon-badge", "").trim(), reservado: r.children[4].textContent.trim() })));
  const esperarFim = () => page.waitForFunction(() => !document.querySelector(".dispon-row") || true).then(() => page.waitForTimeout(700));

  assert.equal(await page.locator("#btnSimularSemana, #disponSimulacaoAviso, #disponSimulacaoRoteiro").count(), 0, "simulação removida");
  assert.equal((await linhas()).length, 20, "primeira página com 20 itens");
  console.log("ok 1 - sem simulação; carrega 20 itens");

  const cats = await page.$$eval("#disponCategoria option", os => os.map(o => o.value));
  assert.deepEqual(cats, ["", "Cadeiras", "Mesas", "Sofás"], "categorias completas: " + cats);
  console.log("ok 2 - lista de categorias completa");

  await page.fill("#disponData", "2099-11-10"); await page.dispatchEvent("#disponData", "change"); await esperarFim();
  let l = await linhas();
  assert.equal(l.find(x => x.nome === "Cadeira 0").status, "indisponivel");
  assert.equal(l.find(x => x.nome === "Cadeira 1").status, "atencao");
  assert.equal(l.find(x => x.nome === "Cadeira 1").reservado, "9");
  console.log("ok 3 - data muda reservado e status");

  const antes = await page.evaluate(() => window.__consultas);
  await page.fill("#disponBusca", "agata"); await esperarFim();
  l = await linhas();
  assert.deepEqual(l.map(x => x.nome).sort(), ["Cadeira Ágata Branca", "Mesa Agata Redonda"], "busca sem acento: " + JSON.stringify(l.map(x => x.nome)));
  await page.fill("#disponBusca", "MES-2"); await esperarFim();
  l = await linhas();
  assert.ok(l.length >= 1 && l.every(x => x.nome.startsWith("Mesa")), "busca por código");
  await page.fill("#disponBusca", ""); await esperarFim();
  assert.ok(await page.evaluate(() => window.__consultas) - antes < 25, "busca não recarrega tudo do banco");
  console.log("ok 4 - busca por nome (sem acento) e por código");

  await page.selectOption("#disponCategoria", "Sofás"); await esperarFim();
  l = await linhas();
  assert.deepEqual(l.map(x => x.nome), ["Sofá 0", "Sofá 1", "Sofá 2"], "categoria Sofás (no fim da lista): " + JSON.stringify(l));
  console.log("ok 5 - categoria acha itens do fim da lista");

  await page.selectOption("#disponCategoria", ""); await page.selectOption("#disponStatus", "indisponivel"); await esperarFim();
  l = await linhas();
  assert.deepEqual(l.map(x => x.nome).sort(), ["Cadeira 0", "Sofá 0"], "status indisponível: " + JSON.stringify(l));
  await page.selectOption("#disponStatus", "atencao"); await esperarFim();
  l = await linhas();
  assert.ok(l.length >= 1 && l.every(x => x.status === "atencao"), "status atenção");
  console.log("ok 6 - status");

  await page.selectOption("#disponCategoria", "Sofás"); await page.selectOption("#disponStatus", "indisponivel"); await esperarFim();
  l = await linhas();
  assert.deepEqual(l.map(x => x.nome), ["Sofá 0"], "categoria + status");
  console.log("ok 7 - filtros combinados");

  await page.selectOption("#disponCategoria", ""); await page.selectOption("#disponStatus", "");
  for (const t of ["c", "ca", "cad", "cade", "cadei", ""]) { await page.fill("#disponBusca", t); await page.waitForTimeout(60); }
  await esperarFim();
  l = await linhas();
  assert.equal(l.length, 20, "limpar volta a 20");
  assert.equal(new Set(l.map(x => x.nome)).size, l.length, "sem linhas repetidas depois de digitar rápido");
  console.log("ok 8 - limpar filtros e digitar rápido sem repetir linhas");

  assert.deepEqual(erros, []);
  await browser.close(); console.log("todos os testes passaram");
})().catch(e => { console.error(e); process.exit(1); });
