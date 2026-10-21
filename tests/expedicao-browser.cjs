// Out/2026 — Expedição: 3 colunas (aguardando / em carregamento / carregados); clicar abre a conferência do
// carregamento com "← Voltar" de volta para a Expedição.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const mock = `(() => {
  window.__gravados = [];
  const banco = {
    separacoes_pedidos: [
      { id: "p1", empresa_id: "e1", numero_pedido: "12", cliente_nome: "Lis", tipo_evento: "Casamento", local_nome: "Villa", data_entrega: "2099-10-24", status: "separado", status_comercial: "aprovado", operacao: {} },
      { id: "p2", empresa_id: "e1", numero_pedido: "13", cliente_nome: "Ana", tipo_evento: "15 anos", local_nome: "Haras", data_entrega: "2099-10-25", status: "separado", status_comercial: "aprovado", operacao: {} },
      { id: "p3", empresa_id: "e1", numero_pedido: "14", cliente_nome: "Rafa", tipo_evento: "Corporativo", local_nome: "Hotel", data_entrega: "2099-10-26", status: "separado", status_comercial: "aprovado", status_operacional: "carregado", operacao: { carregamento: { concluido_em: "2099-10-25T14:30:00Z", por: "Igor", faltando: 1 } } },
      { id: "p4", empresa_id: "e1", numero_pedido: "15", cliente_nome: "Bia", tipo_evento: "Casamento", local_nome: "Sitio", data_entrega: "2099-10-27", status: "em_separacao", status_comercial: "aprovado", operacao: {} },
      { id: "p6", empresa_id: "e1", numero_pedido: "17", cliente_nome: "Caio", tipo_evento: "Feira", local_nome: "Expo", data_entrega: "2099-10-20", data_coleta: "2099-10-22", status: "separado", status_comercial: "aprovado", status_operacional: "carregado", operacao: { carregamento: { concluido_em: "2099-10-20T10:00:00Z", por: "Igor", faltando: [] } } },
      { id: "p7", empresa_id: "e1", numero_pedido: "18", cliente_nome: "Duda", tipo_evento: "Festa", local_nome: "Clube", data_entrega: "2099-10-18", data_coleta: "2099-10-19", status: "separado", status_comercial: "aprovado", status_operacional: "retornado", operacao: { carregamento: { concluido_em: "2099-10-18T10:00:00Z", faltando: [] }, retorno: { concluido_em: "2099-10-19T20:00:00Z", por: "Igor", faltando: [{ codigo: "18-002", item: "Mesa" }], lidas: 1, total: 2 } } },
      { id: "p5", empresa_id: "e1", numero_pedido: "16", cliente_nome: "Orc", local_nome: "x", data_entrega: "2099-10-27", status: "pendente", status_comercial: "orcamento", operacao: {} }],
    separacoes_itens: [{ id: "s1", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i1", item_nome: "Cadeira Tiffany" }, { id: "s2", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i2", item_nome: "Mesa Goa" }],
    separacoes_etiquetas: [
      { id: "e1a", empresa_id: "e1", separacao_pedido_id: "p1", separacao_item_id: "s1", item_id: "i1", codigo: "12-001", sequencia: 1, total_item: 2 },
      { id: "e1b", empresa_id: "e1", separacao_pedido_id: "p1", separacao_item_id: "s1", item_id: "i1", codigo: "12-002", sequencia: 2, total_item: 2 },
      { id: "e2a", empresa_id: "e1", separacao_pedido_id: "p1", separacao_item_id: "s2", item_id: "i2", codigo: "12-003", sequencia: 1, total_item: 1 },
      { id: "q1", empresa_id: "e1", separacao_pedido_id: "p2", separacao_item_id: "s1", item_id: "i1", codigo: "13-001", sequencia: 1, total_item: 2, lida_carregamento_em: "2099-10-24T10:00:00Z" },
      { id: "q2", empresa_id: "e1", separacao_pedido_id: "p2", separacao_item_id: "s1", item_id: "i1", codigo: "13-002", sequencia: 2, total_item: 2 },
      { id: "r1", empresa_id: "e1", separacao_pedido_id: "p3", separacao_item_id: "s1", item_id: "i1", codigo: "14-001", sequencia: 1, total_item: 2, lida_carregamento_em: "2099-10-25T10:00:00Z" },
      { id: "r2", empresa_id: "e1", separacao_pedido_id: "p3", separacao_item_id: "s1", item_id: "i1", codigo: "14-002", sequencia: 2, total_item: 2, lida_carregamento_em: "2099-10-25T10:01:00Z" },
      { id: "r3", empresa_id: "e1", separacao_pedido_id: "p3", separacao_item_id: "s2", item_id: "i2", codigo: "14-003", sequencia: 1, total_item: 1 },
      { id: "c1", empresa_id: "e1", separacao_pedido_id: "p6", separacao_item_id: "s1", item_id: "i1", codigo: "17-001", sequencia: 1, total_item: 1, lida_carregamento_em: "2099-10-20T09:00:00Z", lida_retorno_em: "2099-10-22T09:00:00Z" },
      { id: "x9", empresa_id: "e1", separacao_pedido_id: "outro", separacao_item_id: "zz", item_id: "i9", codigo: "99-001", sequencia: 1, total_item: 1 }],
    itens: [{ id: "i1", empresa_id: "e1", produto: "Cadeira Tiffany" }, { id: "i2", empresa_id: "e1", produto: "Mesa Goa" }],
    itens_patrimonios: [{ empresa_id: "e1", item_id: "i1", codigo_patrimonio: "CAD-001" }],
    separacoes_leituras: []
  };
  banco.separacoes_pedidos.filter(p => ["p3","p6","p7"].includes(p.id)).forEach(p => { p.operacao.descarregamento = {concluido_em:"2099-10-25T15:30:00Z",por:"Igor",faltando:[],total:2,lidas:2}; });
  banco.separacoes_pedidos.push({id:"p8",empresa_id:"e1",numero_pedido:"19",cliente_nome:"Descarga pendente",data_entrega:"2099-10-24",status:"separado",status_comercial:"aprovado",operacao:{carregamento:{concluido_em:"2099-10-24T10:00:00Z"}}});
  function consulta(t){
    let linhas = (banco[t] || []).slice(), unico = false, acao = null, dados = null;
    const q = {
      select(){ return q; }, order(){ return q; }, limit(){ return q; }, or(){ return q; }, range(){ return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      in(c, vs){ linhas = linhas.filter((l) => !(c in l) || vs.map(String).includes(String(l[c]))); return q; },
      maybeSingle(){ unico = true; return q; }, single(){ unico = true; return q; },
      insert(p){ window.__gravados.push({ t, tipo: "insert", p }); return q; },
      update(p){ acao = "update"; dados = p; return q; },
      then(ok, erro){
        if(acao === "update"){ linhas.forEach((l) => Object.assign(l, dados)); window.__gravados.push({ t, tipo: "update", p: dados }); }
        return Promise.resolve({ data: unico ? (linhas[0] || null) : linhas, error: null }).then(ok, erro);
      }
    };
    return q;
  }
  const rpcOperacao = ${require("./operacao-rpc-fixture.cjs").toString()};
  const cliente = {
    auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }), getUser: async () => ({ data: { user: { id: "u1" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: consulta,
    rpc: (n, args) => rpcOperacao(banco, n, args)
  };
  window.supabase = { createClient: () => cliente };
  window.__CONTEXT = { empresa_id: "e1", usuario_id: "u1", usuario_nome: "Igor" };
  window.aguardarContexto = async () => window.__CONTEXT;
  window.confirmarGlobal = async () => true;
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide|single is not a function/.test(e.message)) erros.push(e.message); });
  page.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text()); });
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); });
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("supabase-js")) return r.fulfill({ contentType: "text/javascript", body: mock });
    if (u.startsWith(BASE)) {
      const f = path.join(raiz, decodeURIComponent(new URL(u).pathname));
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
      return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" });
    }
    return r.abort();
  });
  await page.goto(BASE + "Modulos/Logistica/Expedicao/expedicao.html");
  await page.waitForSelector("#expColAguardando [data-pedido]", { timeout: 15000 });
  const ids = (sel) => page.$$eval(sel + " [data-pedido]", (n) => n.map((x) => x.dataset.pedido + ":" + x.dataset.tipo));
  // Aguardando: ida p1 e p4 + retorno de p3 (carregado). Em conferência: ida p2 + retorno p6. Conferido: ida p3/p6 e retorno p7 (ida de p7 some).
  assert.deepStrictEqual((await ids("#expColAguardando")).sort(), ["p1:ida", "p3:retorno", "p4:ida", "p8:descarregamento"]);
  assert.deepStrictEqual((await ids("#expColAndamento")).sort(), ["p2:ida", "p6:retorno"]);
  assert.deepStrictEqual((await ids("#expColCarregados")).sort(), ["p3:descarregamento", "p3:ida", "p6:descarregamento", "p6:ida", "p7:descarregamento", "p7:retorno", "p8:ida"]);
  assert.strictEqual(await page.textContent("#expContAguardando"), "4");
  assert.match(await page.textContent("#expColAndamento"), /1 \/ 2/);
  assert.match(await page.textContent("#expColAguardando"), /Ainda em separação/);
  assert.match(await page.textContent("#expColCarregados"), /por Igor · 1 pendência/);
  assert.match(await page.textContent("#expColCarregados"), /Retorno conferido .* por Igor · 1 não voltou/);
  const titulos = await page.$$eval(".separacao-lane h2", (n) => n.map((x) => x.textContent));
  assert.deepStrictEqual(titulos, ["Aguardando conferência", "Em conferência", "Conferido"]);
  console.log("ok 1 - ida e volta nas 3 colunas (aguardando / em conferência / conferido); orçamento fora");
  // Retorno: cor própria, selo, às cegas (sem total nem volumes)
  const ret = await page.$eval("#expColAguardando [data-tipo=retorno]", (c) => ({ txt: c.textContent, fundo: getComputedStyle(c).backgroundColor }));
  const ida = await page.$eval("#expColAguardando [data-tipo=ida]", (c) => getComputedStyle(c).backgroundColor);
  assert.ok(ret.fundo !== ida, "retorno com cor própria: " + ret.fundo);
  assert.match(ret.txt, /Retorno/); assert.match(ret.txt, /às cegas/);
  assert.ok(!/volume|\d+ \/ \d+|peças/.test(ret.txt), "retorno não mostra quantidade: " + ret.txt);
  const retAnd = await page.$eval("#expColAndamento [data-tipo=retorno]", (c) => c.textContent);
  assert.match(retAnd, /1 peça lida/); assert.ok(!/\//.test(retAnd.replace(/\d{2}\/\d{2}\/\d{4}/g, "")), retAnd);
  console.log("ok 1b - retorno lilás, com selo, e às cegas (só quantas foram lidas)");
  await page.click("#expBusca"); await page.fill("#expBusca", "ana");
  assert.deepStrictEqual(await ids("#expColAguardando"), []);
  assert.deepStrictEqual(await ids("#expColAndamento"), ["p2:ida"]);
  await page.click("#expBusca"); await page.fill("#expBusca", "");
  console.log("ok 2 - busca filtra");
  await page.screenshot({ path: process.env.SHOT || path.join(require("os").tmpdir(),"acervo-expedicao-operacao.png") });
  await page.click("[data-pedido=p2][data-tipo=ida]");
  await page.waitForURL(/conferencia\.html\?pedido=p2&etapa=carregamento&de=expedicao/);
  await page.waitForSelector("#cfVoltar:not([hidden])"); await page.waitForTimeout(600);
  const box = await page.evaluate(() => { const v = document.getElementById("cfVoltar").getBoundingClientRect(), r = document.createRange(); r.selectNodeContents(document.getElementById("cfTitulo")); const t = r.getBoundingClientRect(); return { dv: Math.abs((v.top + v.bottom) / 2 - (t.top + t.bottom) / 2), sobre: v.right > t.left }; });
  await page.screenshot({ path: (process.env.SHOT || path.join(require("os").tmpdir(),"acervo-expedicao-operacao.png")).replace(".png", "-conf.png") });
  assert.ok(box.dv < 12 && !box.sobre, JSON.stringify(box));
  console.log("ok 3 - clicar abre a conferência do carregamento, com Voltar na linha do título");
  await page.screenshot({ path: (process.env.SHOT || path.join(require("os").tmpdir(),"acervo-expedicao-operacao.png")).replace(".png", "-conf.png") });
  await page.click("#cfVoltar");
  await page.waitForSelector("#expColAguardando [data-pedido]");
  console.log("ok 4 - Voltar retorna para a Expedição");
  // Conferência de retorno às cegas
  await page.click("#expColAguardando [data-pedido=p3][data-tipo=retorno]");
  await page.waitForURL(/etapa=retorno&de=expedicao/);
  await page.waitForSelector("#cfCorpo:not([hidden])");
  assert.ok(await page.isHidden("#cfPercent")); assert.ok(await page.isHidden(".cf-barra"));
  assert.strictEqual(await page.textContent("#cfContagem"), "0 peças lidas");
  assert.ok(!/14-00/.test(await page.textContent("#cfItens")), "não lista o que deve voltar");
  assert.ok(!/faltando/.test(await page.textContent("#cfRodapeTexto")));
  await page.fill("#cfEntrada", "ACERVO:ENV:14-001"); await page.press("#cfEntrada", "Enter"); await page.waitForTimeout(250);
  assert.strictEqual(await page.textContent("#cfContagem"), "1 peça lida");
  assert.ok(!/ de /.test(await page.textContent("#cfUltimaDetalhe")), await page.textContent("#cfUltimaDetalhe"));
  assert.match(await page.textContent("#cfItens"), /14-001/);
  await page.screenshot({ path: (process.env.SHOT || path.join(require("os").tmpdir(),"acervo-expedicao-operacao.png")).replace(".png", "-cega.png") });
  await page.click("#cfConcluir");
  await page.getByRole("button", { name: "Concluir", exact: true }).click();
  await page.waitForFunction(() => window.__gravados.some((g) => g.t === "separacoes_pedidos" && g.p.status_operacional === "retornado"), null, { timeout: 3000 });
  await page.waitForTimeout(200);
  const res = await page.textContent("#cfAviso");
  assert.match(res, /Não voltaram 1 de 2 peças/); assert.match(res, /14-002/); assert.ok(!/14-003/.test(res), "só compara com o que saiu: " + res);
  const op = await page.evaluate(() => window.__gravados.filter((g) => g.t === "separacoes_pedidos").pop().p);
  assert.strictEqual(op.status_operacional, "retornado"); assert.strictEqual(op.operacao.retorno.total, 2); assert.strictEqual(op.operacao.retorno.faltando.length, 1);
  assert.ok(await page.isVisible("#cfPercent"), "depois de concluir o sistema mostra o resultado");
  await page.screenshot({ path: (process.env.SHOT || path.join(require("os").tmpdir(),"acervo-expedicao-operacao.png")).replace(".png", "-resultado.png") });
  console.log("ok 4b - retorno às cegas: sem total nem pendentes; ao concluir o sistema mostra o que não voltou");
  await page.goto(BASE + "Modulos/Logistica/Conferencia/conferencia.html?pedido=p1&etapa=carregamento");
  await page.waitForSelector("#cfCorpo:not([hidden])");
  assert.ok(await page.isHidden("#cfVoltar"));
  console.log("ok 5 - aberto pelo cronograma não mostra o Voltar");
  assert.deepStrictEqual(erros, []);
  await browser.close();
  console.log("todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });
