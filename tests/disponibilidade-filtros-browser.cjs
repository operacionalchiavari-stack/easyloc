// Disponibilidade de Itens: filtros (data, busca, categoria, status) com banco simulado (out/2026).
// Também confere que o botão "Simular semana movimentada" não existe mais.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const DIR = "Modulos/Estoque/DisponibilidadeItens/";

const host = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/styles/global.css"><link rel="stylesheet" href="/${DIR}disponibilidade-itens.css"></head>
<body><main id="main-content"></main>
<script src="/js/core/loading.js"></script>
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
    { id: "r3", item_id: "z000", quantidade_solicitada: 2, empresa_id: E, separacoes_pedidos: pedido(3, D, D) },
    // visão por pedido: a002 usado por dois pedidos no dia D (um em pré-reserva)
    { id: "r4", item_id: "a002", quantidade_solicitada: 2, empresa_id: E, separacoes_pedidos: pedido(4, D, D) },
    { id: "r5", item_id: "a002", quantidade_solicitada: 3, empresa_id: E, separacoes_pedidos: { ...pedido(5, D, D), status_comercial: "pre_reserva" } }
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
    async rpc(nome, args) { window.__rpcs = (window.__rpcs || []).concat([{ nome, args }]); return { data: nome === "operacao_livre_periodo" ? (window.__livreDb || []) : [], error: null }; }
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
  await page.waitForFunction(() => document.querySelector('#disponMais').getAttribute('aria-busy') === 'false');
  assert.equal(await page.locator('#disponMais').textContent(), 'Carregar mais itens', 'sem carregamento permanente entre páginas');
  assert.equal(await page.locator('#disponMais .el-loading-indicator').count(), 0);
  await page.locator('#disponMais').click();
  await page.waitForFunction(() => document.querySelectorAll('.dispon-row').length === 40 && document.querySelector('#disponMais').getAttribute('aria-busy') === 'false');
  await page.locator('.dispon-table-wrap').evaluate(el => { el.scrollTop=el.scrollHeight; });
  await page.waitForFunction(() => document.querySelectorAll('.dispon-row').length === 60 && document.querySelector('#disponMais').getAttribute('aria-busy') === 'false');
  await page.locator('#disponMais').click();
  await page.locator('#disponMais').waitFor({state:'hidden'});
  assert.equal((await linhas()).length,60,'rolagem interna carrega os itens restantes');
  console.log('ok - botão e rolagem interna paginam; indicador encerra e some ao fim da lista');

  // só dois filtros (Data e Buscar item), na mesma linha do título, que continua no centro
  assert.equal(await page.locator("#disponCategoria, #disponStatus").count(), 0, "sem Categoria e Status");
  const naLinha = await page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const t = r(".dispon-hero h1"), d = r("#disponData"), b = r("#disponBusca"), h = r(".dispon-hero"); return { mesmaLinha: Math.abs((d.top + d.bottom) / 2 - (t.top + t.bottom) / 2) < 20 && Math.abs(b.top - d.top) < 2, aEsquerda: b.right < t.left, centro: Math.abs((t.left + t.right) / 2 - (h.left + h.right) / 2) }; });
  assert.ok(naLinha.mesmaLinha && naLinha.aEsquerda, "filtros na linha do título, à esquerda: " + JSON.stringify(naLinha));
  assert.ok(naLinha.centro < 2, "título no centro (" + naLinha.centro + "px)");
  console.log("ok 2 - só Data e Buscar item, na linha do título, que fica no centro");

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

  await page.fill("#disponBusca", "sofas"); await esperarFim();
  l = await linhas();
  assert.deepEqual(l.map(x => x.nome), ["Sofá 0", "Sofá 1", "Sofá 2"], "busca pela categoria acha itens do fim da lista: " + JSON.stringify(l));
  await page.fill("#disponBusca", ""); await esperarFim();
  console.log("ok 5 - buscar pela categoria acha itens do fim da lista");


  for (const t of ["c", "ca", "cad", "cade", "cadei", ""]) { await page.fill("#disponBusca", t); await page.waitForTimeout(60); }
  await esperarFim();
  l = await linhas();
  assert.equal(l.length, 20, "limpar volta a 20");
  assert.equal(new Set(l.map(x => x.nome)).size, l.length, "sem linhas repetidas depois de digitar rápido");
  console.log("ok 8 - limpar filtros e digitar rápido sem repetir linhas");

  // O "Disponível" vem da conta única do banco (operacao_livre_periodo → operacao_livre_calc), não da conta da tela
  await page.evaluate(() => { window.__livreDb = [{ item_id: "a002", livre: 3, bloqueio_contagem: false }, { item_id: "a003", livre: 0, bloqueio_contagem: true }]; });
  await page.fill("#disponData", "2099-11-11"); await page.dispatchEvent("#disponData", "change"); await esperarFim();
  const consulta = await page.evaluate(() => (window.__rpcs || []).filter(r => r.nome === "operacao_livre_periodo").at(-1)?.args);
  assert.deepEqual([consulta.p_inicio, consulta.p_fim], ["2099-11-11", "2099-11-11"]);
  const disp = await page.$$eval(".dispon-row", rs => Object.fromEntries(rs.map(r => [r.querySelector(".dispon-item-name").textContent.trim(), r.querySelector(".dispon-badge").className.replace("dispon-badge", "").trim()])));
  assert.equal(disp["Cadeira 3"], "indisponivel", "item bloqueado por contagem fica indisponível");
  const c2 = await page.$$eval(".dispon-row", rs => rs.find(r => r.querySelector(".dispon-item-name").textContent.trim() === "Cadeira 2")?.textContent || "");
  assert.match(c2, /\b3\b/, "Cadeira 2 com o disponível do banco (3): " + c2);
  console.log("ok 9 - disponível vem da mesma conta do catálogo e do pedido");

  // visão por pedido: no lugar de "Reservado na data", uma coluna por pedido da data, antes de "Disponível"
  await page.evaluate(() => { window.__livreDb = null; });
  await page.fill("#disponData", "2099-11-10"); await page.dispatchEvent("#disponData", "change"); await esperarFim();
  await page.fill("#disponBusca", ""); await page.dispatchEvent("#disponBusca", "input");
  await page.waitForTimeout(400);
  await page.click("[data-dispon-visao=pedidos]");
  await page.waitForSelector("th.dispon-col-pedido");
  const cab = await page.$$eval("#disponCabecalho th", (t) => t.map((x) => x.querySelector(".dispon-ped-num")?.textContent || x.textContent.trim()));
  assert.ok(!cab.some((t) => /Reservado/.test(t)), "sem a coluna Reservado: " + cab);
  assert.deepEqual(cab.filter((t) => /^Pedido/.test(t)), ["Pedido 1", "Pedido 2", "Pedido 4", "Pedido 5"]);
  assert.equal(cab[cab.length - 2], "Disponivel"); assert.equal(cab[cab.indexOf("Pedido 1") - 1], "Manutencao", "pedidos logo antes de Disponível");
  const linha = await page.$$eval(".dispon-row", (rs) => { const r = rs.find((x) => x.querySelector(".dispon-item-name").textContent.trim() === "Cadeira 2"); return [...r.querySelectorAll(".dispon-cel-pedido")].map((c) => c.textContent.trim()); });
  assert.deepEqual(linha, ["–", "–", "2", "3"], "Cadeira 2: 2 no pedido 4 e 3 no pedido 5");
  assert.equal(await page.locator("th.dispon-col-pedido.is-pre").count(), 1, "pré-reserva sinalizada");
  assert.equal(await page.evaluate(() => { const r = [...document.querySelectorAll(".dispon-row")][0]; return r.children.length === document.querySelectorAll("#disponCabecalho th").length; }), true, "linha com o mesmo número de colunas do cabeçalho");
  if (process.env.SP) { await page.setViewportSize({ width: 1500, height: 900 }); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: process.env.SP + "/dispon-pedidos.png" }); }
  await page.click("[data-dispon-visao=resumo]");
  await page.waitForFunction(() => /Reservado na data/.test(document.getElementById("disponCabecalho").textContent));
  assert.equal(await page.locator("th.dispon-col-pedido").count(), 0);
  console.log("ok 10 - visão por pedido: uma coluna por pedido da data, antes de Disponível, e volta ao resumo");

  // cabeçalho fixo: a tabela rola dentro da própria caixa e o cabeçalho fica parado no topo dela; rolar carrega mais itens
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.fill("#disponBusca", ""); await page.dispatchEvent("#disponBusca", "input"); await page.waitForTimeout(400);
  const linhasAntes = await page.locator(".dispon-row").count();
  const fixo = await page.evaluate(async () => {
    const wrap = document.querySelector(".dispon-table-wrap"), th = document.querySelector("#disponCabecalho th");
    const topo = th.getBoundingClientRect().top;
    wrap.scrollTop = 400; await new Promise((r) => setTimeout(r, 120));
    return { rolou: wrap.scrollTop > 300, rolaDentro: wrap.scrollHeight > wrap.clientHeight, mesmoLugar: Math.abs(document.querySelector("#disponCabecalho th").getBoundingClientRect().top - wrap.getBoundingClientRect().top) < 1 && topo > -1 };
  });
  assert.deepEqual(fixo, { rolou: true, rolaDentro: true, mesmoLugar: true }, "cabeçalho parado: " + JSON.stringify(fixo));
  await page.evaluate(() => { const w = document.querySelector(".dispon-table-wrap"); w.scrollTop = w.scrollHeight; w.dispatchEvent(new Event("scroll")); });
  await page.waitForFunction((n) => document.querySelectorAll(".dispon-row").length > n, linhasAntes, { timeout: 10000 });
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#disponCabecalho th")).backgroundColor), "rgb(255, 255, 255)", "cabeçalho com fundo (as linhas não aparecem por trás)");
  console.log("ok 11 - cabeçalho fixo ao rolar a tabela, e rolar a tabela carrega mais itens");

  assert.deepEqual(erros, []);
  await browser.close(); console.log("todos os testes passaram");
})().catch(e => { console.error(e); process.exit(1); });
