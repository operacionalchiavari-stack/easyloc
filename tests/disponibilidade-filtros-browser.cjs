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

  const linhas = () => page.$$eval(".dispon-row", rs => rs.map(r => ({ nome: r.querySelector(".dispon-item-name").textContent.trim(), cat: r.children[2].textContent.trim(), status: r.dataset.status, reservado: r.querySelector('td[data-det="reservado"]').textContent.trim() })));
  const esperarFim = () => page.waitForFunction(() => !document.querySelector(".dispon-row") || true).then(() => page.waitForTimeout(700));

  assert.equal(await page.locator("#btnSimularSemana, #disponSimulacaoAviso, #disponSimulacaoRoteiro").count(), 0, "simulação removida");
  assert.equal((await linhas()).length, 20, "primeira página com 20 itens");
  console.log("ok 1 - sem simulação; carrega 20 itens");
  await page.waitForFunction(() => document.querySelector('#disponMais').getAttribute('aria-busy') === 'false');
  assert.equal(await page.locator('#disponMais').textContent(), 'Carregar mais itens', 'sem carregamento permanente entre páginas');
  assert.equal(await page.locator('#disponMais .el-loading-indicator').count(), 0);
  await page.evaluate(() => document.getElementById('disponMais').click());
  await page.waitForFunction(() => document.querySelectorAll('.dispon-row').length === 40 && document.querySelector('#disponMais').getAttribute('aria-busy') === 'false');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => document.querySelectorAll('.dispon-row').length === 60 && document.querySelector('#disponMais').getAttribute('aria-busy') === 'false');
  await page.evaluate(() => document.getElementById('disponMais').click());
  await page.locator('#disponMais').waitFor({state:'hidden'});
  assert.equal((await linhas()).length,60,'rolagem da pagina carrega os itens restantes');
  console.log('ok - botão e rolagem da pagina paginam; indicador encerra e some ao fim da lista');

  // só dois filtros (Data e Buscar item), na mesma linha do título, que continua no centro
  assert.equal(await page.locator(".dispon-hero #disponCategoria, .dispon-hero #disponStatus").count(), 0, "Categoria e Status ficam na linha de filtros, não no título");
  assert.ok(await page.locator(".dispon-filtros-linha #disponCategoria").count(), "linha de filtros com Categoria");
  const naLinha = await page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const t = r(".dispon-hero h1"), d = r("#disponData"), b = r("#disponBusca"), h = r(".dispon-hero"); return { mesmaLinha: Math.abs((d.top + d.bottom) / 2 - (t.top + t.bottom) / 2) < 20 && Math.abs(b.top - d.top) < 2, aEsquerda: d.right < t.left && b.left > t.right, centro: Math.abs((t.left + t.right) / 2 - (h.left + h.right) / 2) }; });
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
  const disp = await page.$$eval(".dispon-row", rs => Object.fromEntries(rs.map(r => [r.querySelector(".dispon-item-name").textContent.trim(), r.dataset.status])));
  assert.equal(disp["Cadeira 3"], "indisponivel", "item bloqueado por contagem fica indisponível");
  const c2 = await page.$$eval(".dispon-row", rs => rs.find(r => r.querySelector(".dispon-item-name").textContent.trim() === "Cadeira 2")?.textContent || "");
  assert.match(c2, /\b3\b/, "Cadeira 2 com o disponível do banco (3): " + c2);
  console.log("ok 9 - disponível vem da mesma conta do catálogo e do pedido");

  // visão por pedido: no lugar de "Reservado na data", uma coluna por pedido da data, antes de "Disponível"
  await page.evaluate(() => { window.__livreDb = null; });
  await page.fill("#disponData", "2099-11-10"); await page.dispatchEvent("#disponData", "change"); await esperarFim();
  await page.fill("#disponBusca", ""); await page.dispatchEvent("#disponBusca", "input");
  await page.waitForTimeout(400);
  await page.waitForSelector("th.dispon-col-pedido");
  const cab = await page.$$eval("#disponCabecalho th", (t) => t.map((x) => (x.dataset.pedidoCol ? (x.getAttribute("aria-label") || "").split(" · ")[0] : x.textContent.trim())));
  assert.ok(!cab.some((t) => /Reservado na data/.test(t)), "sem a coluna Reservado na data: " + cab);
  assert.deepEqual(cab.filter((t) => /^Pedido/.test(t)), ["Pedido 1", "Pedido 2", "Pedido 4", "Pedido 5"]);
  // cabeçalho do pedido: só foto (iniciais) + nome do cliente; detalhes num cartão ao passar o mouse
  assert.deepEqual(await page.$$eval("#disponCabecalho [data-pedido-col]", (t) => t.map((x) => x.textContent.replace(/\s+/g, " ").trim())), ["C1Cliente 1", "C2Cliente 2", "C4Cliente 4", "C5Cliente 5"]);
  await page.hover('#disponCabecalho [data-pedido-col="3"]');
  const cartao = await page.$eval("#disponPedidoCartao", (c) => !c.hidden && c.innerText);
  assert.ok(/Pedido 5/.test(cartao) && /Pré-reserva/.test(cartao) && /Cliente 5/.test(cartao), "cartão com os detalhes: " + cartao);
  assert.equal(await page.$eval("#disponPedidoCartao", (c) => c.classList.contains("is-pre") && getComputedStyle(c).backgroundColor), "rgb(253, 246, 221)", "cartão da pré-reserva em amarelo");
  await page.mouse.move(5, 5);
  await page.hover('#disponCabecalho [data-pedido-col="0"]');
  assert.equal(await page.$eval("#disponPedidoCartao", (c) => c.classList.contains("is-pre")), false, "pedido reservado: cartão branco");
  await page.mouse.move(5, 5);
  assert.equal(await page.$eval("#disponPedidoCartao", (c) => c.hidden), true, "cartão some ao tirar o mouse");
  const alin = await page.evaluate(() => { const th = [...document.querySelectorAll("#disponCabecalho th")].find((t) => t.textContent.trim() === "Total"), r = th.getBoundingClientRect(), c = document.querySelector(".dispon-row td:nth-child(4) .dispon-quantity").getBoundingClientRect(); const s = document.createRange(); s.selectNodeContents(th); const tr = s.getBoundingClientRect(); return Math.round((tr.left + tr.width / 2) - (c.left + c.width / 2)); });
  assert.ok(Math.abs(alin) <= 2, "título Total centralizado com os números: " + alin);
  // cartões das células: pedido (na coluna do pedido) e Disponível
  await page.mouse.move(5, 5);
  await page.hover('tr[data-item-id="a002"] td[data-det="pedido:3"] .dispon-quantity');
  const cPed = await page.$eval("#disponPedidoCartao", (c) => !c.hidden && c.innerText);
  assert.ok(/Pedido 5/.test(cPed) && /Cliente 5/.test(cPed) && /\b3\b/.test(cPed) && !/Pedido 4/.test(cPed), "cartão da célula do pedido: " + cPed);
  await page.hover('tr[data-item-id="a002"] td[data-det="disponivel"] .dispon-quantity');
  const cDisp = await page.$eval("#disponPedidoCartao", (c) => !c.hidden && c.innerText);
  assert.ok(/5 peças livres/.test(cDisp) && /No estoque/.test(cDisp) && /Reservado/.test(cDisp), "cartão do Disponível: " + cDisp);
  await page.mouse.move(5, 5);
  assert.deepEqual(cab.slice(cab.indexOf("Manutencao"), cab.indexOf("Manutencao") + 3), ["Manutencao", "Reservado", "Disponivel"], "Manutenção · Reservado (soma) · Disponível");
  assert.equal(await page.$eval('tr[data-item-id="a002"] td[data-det="reservado"]', (td) => td.textContent.trim()), "5", "Reservado soma os pedidos (2 + 3)");
  assert.equal(await page.$$eval("#disponCabecalho th.dispon-divisao", (t) => t.length === 1 && t[0].dataset.pedidoCol === "0" && getComputedStyle(document.querySelector("#disponCabecalho th.dispon-fixa-3")).boxShadow !== "none"), true, "linha de divisão entre Disponível e o primeiro pedido"); assert.equal(cab[cab.indexOf("Pedido 1") - 1], "Disponivel", "pedidos depois de Disponível"); assert.equal(cab[cab.length - 1], "Pedido 5");
  const linha = await page.$$eval(".dispon-row", (rs) => { const r = rs.find((x) => x.querySelector(".dispon-item-name").textContent.trim() === "Cadeira 2"); return [...r.querySelectorAll(".dispon-cel-pedido")].map((c) => c.textContent.trim()); });
  assert.deepEqual(linha, ["–", "–", "2", "3"], "Cadeira 2: 2 no pedido 4 e 3 no pedido 5");
  assert.equal(await page.locator("#disponCabecalho th.dispon-col-pedido.is-pre").count(), 1, "pré-reserva sinalizada");
  assert.equal(await page.evaluate(() => { const r = [...document.querySelectorAll(".dispon-row")][0]; return r.children.length === document.querySelectorAll("#disponCabecalho th").length; }), true, "linha com o mesmo número de colunas do cabeçalho");
  await page.setViewportSize({width:700,height:800});
  await page.evaluate(()=>{const w=document.querySelector('.dispon-table-wrap');w.scrollLeft=0;window.scrollTo(0,window.scrollY+w.getBoundingClientRect().top+80);});
  const arraste=await page.locator('.dispon-table-wrap').evaluate(w=>({x:w.getBoundingClientRect().left+350,y:180,temColunas:w.scrollWidth>w.clientWidth}));
  assert.ok(arraste.temColunas,'ha colunas fora da largura visivel');
  await page.mouse.move(arraste.x,arraste.y);await page.mouse.down();await page.mouse.move(arraste.x-180,arraste.y,{steps:8});await page.mouse.up();
  assert.ok(await page.locator('.dispon-table-wrap').evaluate(w=>w.scrollLeft>100),'arrastar o mouse desloca as colunas');
  assert.equal(await page.locator('#disponDetalheTela').isVisible(),false,'arrastar nao abre detalhes do item');
  await page.waitForFunction(()=>{const h=document.querySelector('.dispon-floating-header');if(!h||h.hidden)return false;const a=document.querySelector('#disponCabecalho th'),b=h.querySelector('th');return Math.abs(a.getBoundingClientRect().left-b.getBoundingClientRect().left)<2;});
  await page.setViewportSize({width:1400,height:900});await page.evaluate(()=>{document.querySelector('.dispon-table-wrap').scrollLeft=0;window.scrollTo(0,0);});
  console.log('ok - arraste horizontal com mouse, sem clique acidental e cabecalho alinhado');
  // Foto, Item e Disponível ficam presos no canto esquerdo ao rolar a tabela para o lado
  await page.setViewportSize({ width: 720, height: 900 });
  await page.waitForTimeout(200);
  const fixas = () => page.evaluate(() => { const w = document.querySelector(".dispon-table-wrap"), wl = w.getBoundingClientRect().left, tr = document.querySelector('tr[data-item-id="a002"]');
    return { sl: w.scrollLeft, max: w.scrollWidth - w.clientWidth, foto: Math.round(tr.children[0].getBoundingClientRect().left - wl), item: Math.round(tr.querySelector(".dispon-fixa-2").getBoundingClientRect().left - wl), disp: Math.round(tr.querySelector(".dispon-fixa-3").getBoundingClientRect().left - wl), cat: Math.round(tr.children[2].getBoundingClientRect().left - wl), fx2: parseFloat(getComputedStyle(w).getPropertyValue("--fx2")), fx3: parseFloat(getComputedStyle(w).getPropertyValue("--fx3")) }; });
  const f0 = await fixas();
  assert.ok(f0.max > 50, "a tabela precisa rolar para o lado neste teste: " + JSON.stringify(f0));
  await page.evaluate(() => { const w = document.querySelector(".dispon-table-wrap"); w.scrollLeft = w.scrollWidth; });
  await page.waitForTimeout(200);
  const f1 = await fixas();
  assert.equal(f1.foto, 0, "Foto presa na esquerda: " + JSON.stringify(f1));
  assert.equal(f1.item, f0.item, "Item preso logo depois da foto");
  assert.ok(Math.abs((f1.disp - f1.item) - (f1.fx3 - f1.fx2)) <= 1, "Disponível preso logo depois do Item: " + JSON.stringify(f1));
  assert.ok(f1.cat < f0.cat, "as outras colunas rolam por baixo");
  await page.evaluate(() => { document.querySelector(".dispon-table-wrap").scrollLeft = 0; });
  console.log("ok 10b - Foto, Item e Disponível ficam fixos ao rolar para o lado");
  if (process.env.SP) { await page.setViewportSize({ width: 1500, height: 900 }); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: process.env.SP + "/dispon-pedidos.png" }); }
  assert.equal(await page.locator("[data-dispon-visao]").count(), 0, "só existe a visão com as colunas dos pedidos");
  await page.waitForFunction(() => document.querySelector('tr[data-item-id="a002"] td[data-det="reservado"]'));
  await page.hover('tr[data-item-id="a002"] td[data-det="reservado"] .dispon-quantity');
  const cRes = await page.$eval("#disponPedidoCartao", (c) => !c.hidden && c.innerText);
  assert.ok(/Pedido 4/.test(cRes) && /Pedido 5/.test(cRes) && /Pré-reserva/.test(cRes), "cartão do Reservado lista os pedidos: " + cRes);
  assert.ok(/2 reservadas/.test(cRes) && /3 em pré-reserva/.test(cRes), "resumo confirmados × pré-reserva: " + cRes);
  assert.equal(await page.$$eval("#disponPedidoCartao li.is-pre", (l) => l.length), 1, "a linha da pré-reserva fica amarela");
  await page.hover('tr[data-item-id="a002"] td[data-det="manutencao"] .dispon-quantity');
  assert.ok(/fora de uso/.test(await page.$eval("#disponPedidoCartao", (c) => c.innerText)), "cartão da Manutenção");
  await page.mouse.move(5, 5);
  // período De / Até: os pedidos de qualquer dia do período aparecem; "Até" antes de "De" vira o mesmo dia
  await page.fill("#disponData", "2099-11-01"); await page.fill("#disponDataFim", "2099-11-30"); await page.dispatchEvent("#disponDataFim", "change"); await esperarFim();
  await page.waitForFunction(() => document.querySelectorAll("#disponCabecalho [data-pedido-col]").length === 4);
  await page.fill("#disponData", "2099-11-20"); await page.fill("#disponDataFim", "2099-11-05"); await page.dispatchEvent("#disponDataFim", "change"); await esperarFim();
  await page.waitForFunction(() => document.getElementById("disponDataFim").value === "2099-11-20" && document.querySelectorAll("#disponCabecalho [data-pedido-col]").length === 0);
  await page.fill("#disponData", "2099-11-10"); await page.fill("#disponDataFim", "2099-11-10"); await page.dispatchEvent("#disponDataFim", "change"); await esperarFim();
  console.log("ok 10c - consulta por período (De / Até)");
  console.log("ok 10 - visão por pedido: uma coluna por pedido da data, antes de Disponível, e volta ao resumo");

  // A tabela aumenta; o fim da pagina carrega mais linhas sem rolagem vertical interna.
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.evaluate(() => window.scrollTo(0,0));
  await page.fill('#disponBusca','');await page.dispatchEvent('#disponBusca','input');await page.waitForTimeout(400);
  const linhasAntes=await page.locator('.dispon-row').count();
  const alturaAntes=await page.locator('.dispon-table-wrap').evaluate(w=>w.clientHeight);
  assert.equal(await page.locator('.dispon-table-wrap').evaluate(w=>Math.abs(w.scrollHeight-w.clientHeight)<=1),true,'sem rolagem vertical interna');
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  await page.waitForFunction(n=>document.querySelectorAll('.dispon-row').length>n,linhasAntes,{timeout:10000});
  assert.ok(await page.locator('.dispon-table-wrap').evaluate((w,h)=>w.clientHeight>h,alturaAntes),'a tabela cresceu ao carregar mais itens');
  assert.ok(await page.evaluate(()=>window.scrollY>0),'a pagina e que rola');
  await page.evaluate(()=>window.scrollTo(0,500));
  await page.waitForFunction(()=>{const h=document.querySelector('.dispon-floating-header');return h&&!h.hidden&&Math.abs(h.getBoundingClientRect().top)<2;});
  const alinhado=await page.evaluate(()=>{const a=[...document.querySelectorAll('#disponCabecalho th')],b=[...document.querySelectorAll('.dispon-floating-header th')];return a.length===b.length&&a.every((th,i)=>Math.abs(th.getBoundingClientRect().left-b[i].getBoundingClientRect().left)<2);});
  assert.ok(alinhado,'colunas do cabecalho fixo alinhadas com a tabela');
  await page.evaluate(()=>{const menu=document.createElement('div');menu.id='sidebar';menu.style.cssText='position:fixed;top:0;left:0;width:100%;height:90px';document.body.append(menu);window.dispatchEvent(new Event('resize'));});
  await page.waitForFunction(()=>Math.abs(document.querySelector('.dispon-floating-header').getBoundingClientRect().top-90)<2);
  assert.equal(await page.locator('#disponCabecalho').count(),1,'sem duplicar o identificador do cabecalho');
  await page.evaluate(()=>window.scrollTo(0,0));await page.waitForFunction(()=>document.querySelector('.dispon-floating-header').hidden);
  console.log('ok 11 - tabela cresce e cabecalho permanece fixo e alinhado durante a rolagem');

  assert.deepEqual(erros, []);
  await browser.close(); console.log("todos os testes passaram");
})().catch(e => { console.error(e); process.exit(1); });
