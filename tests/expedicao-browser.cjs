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
      { id: "p5", empresa_id: "e1", numero_pedido: "16", cliente_nome: "Orc", local_nome: "x", data_entrega: "2099-10-27", status: "pendente", status_comercial: "orcamento", operacao: {} }],
    separacoes_itens: [{ id: "s1", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i1", item_nome: "Cadeira Tiffany" }, { id: "s2", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i2", item_nome: "Mesa Goa" }],
    separacoes_etiquetas: [
      { id: "e1a", empresa_id: "e1", separacao_pedido_id: "p1", separacao_item_id: "s1", item_id: "i1", codigo: "12-001", sequencia: 1, total_item: 2 },
      { id: "e1b", empresa_id: "e1", separacao_pedido_id: "p1", separacao_item_id: "s1", item_id: "i1", codigo: "12-002", sequencia: 2, total_item: 2 },
      { id: "e2a", empresa_id: "e1", separacao_pedido_id: "p1", separacao_item_id: "s2", item_id: "i2", codigo: "12-003", sequencia: 1, total_item: 1 },
      { id: "q1", empresa_id: "e1", separacao_pedido_id: "p2", separacao_item_id: "s1", item_id: "i1", codigo: "13-001", sequencia: 1, total_item: 2, lida_carregamento_em: "2099-10-24T10:00:00Z" },
      { id: "q2", empresa_id: "e1", separacao_pedido_id: "p2", separacao_item_id: "s1", item_id: "i1", codigo: "13-002", sequencia: 2, total_item: 2 },
      { id: "x9", empresa_id: "e1", separacao_pedido_id: "outro", separacao_item_id: "zz", item_id: "i9", codigo: "99-001", sequencia: 1, total_item: 1 }],
    itens: [{ id: "i1", empresa_id: "e1", produto: "Cadeira Tiffany" }, { id: "i2", empresa_id: "e1", produto: "Mesa Goa" }],
    itens_patrimonios: [{ empresa_id: "e1", item_id: "i1", codigo_patrimonio: "CAD-001" }],
    separacoes_leituras: []
  };
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
  const cliente = {
    auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }), getUser: async () => ({ data: { user: { id: "u1" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: consulta,
    rpc: (n) => ({ then: (ok) => Promise.resolve(n === "funcionario_contexto" ? { data: { ativo: true, administrador_legado: true }, error: null } : { data: [], error: null }).then(ok) })
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
  const ids = (sel) => page.$$eval(sel + " [data-pedido]", (n) => n.map((x) => x.dataset.pedido));
  assert.deepStrictEqual(await ids("#expColAguardando"), ["p1", "p4"]);
  assert.deepStrictEqual(await ids("#expColAndamento"), ["p2"]);
  assert.deepStrictEqual(await ids("#expColCarregados"), ["p3"]);
  assert.strictEqual(await page.textContent("#expContAguardando"), "2");
  assert.match(await page.textContent("#expColAndamento"), /1 \/ 2/);
  assert.match(await page.textContent("#expColAguardando"), /Ainda em separação/);
  assert.match(await page.textContent("#expColCarregados"), /por Igor · 1 pendência/);
  console.log("ok 1 - 3 colunas: separado sem leitura aguarda, parcial em carregamento, concluído em carregados; orçamento fora");
  await page.fill("#expBusca", "ana");
  assert.deepStrictEqual(await ids("#expColAguardando"), []);
  assert.deepStrictEqual(await ids("#expColAndamento"), ["p2"]);
  await page.fill("#expBusca", "");
  console.log("ok 2 - busca filtra");
  await page.screenshot({ path: process.env.SHOT || "expedicao.png" });
  await page.click("[data-pedido=p2]");
  await page.waitForURL(/conferencia\.html\?pedido=p2&etapa=carregamento&de=expedicao/);
  await page.waitForSelector("#cfVoltar:not([hidden])"); await page.waitForTimeout(600);
  const box = await page.evaluate(() => { const v = document.getElementById("cfVoltar").getBoundingClientRect(), r = document.createRange(); r.selectNodeContents(document.getElementById("cfTitulo")); const t = r.getBoundingClientRect(); return { dv: Math.abs((v.top + v.bottom) / 2 - (t.top + t.bottom) / 2), sobre: v.right > t.left }; });
  await page.screenshot({ path: (process.env.SHOT || "expedicao.png").replace(".png", "-conf.png") });
  assert.ok(box.dv < 12 && !box.sobre, JSON.stringify(box));
  console.log("ok 3 - clicar abre a conferência do carregamento, com Voltar na linha do título");
  await page.screenshot({ path: (process.env.SHOT || "expedicao.png").replace(".png", "-conf.png") });
  await page.click("#cfVoltar");
  await page.waitForSelector("#expColAguardando [data-pedido]");
  console.log("ok 4 - Voltar retorna para a Expedição");
  await page.goto(BASE + "Modulos/Logistica/Conferencia/conferencia.html?pedido=p1&etapa=carregamento");
  await page.waitForSelector("#cfCorpo:not([hidden])");
  assert.ok(await page.isHidden("#cfVoltar"));
  console.log("ok 5 - aberto pelo cronograma não mostra o Voltar");
  assert.deepStrictEqual(erros, []);
  await browser.close();
  console.log("todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });
