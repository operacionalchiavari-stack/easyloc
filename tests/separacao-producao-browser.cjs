// Out/2026 — item personalizado na Triagem: a parte em produção aparece no setor do item, sem quantidade, com o aviso;
// a parte normal se separa como sempre; a triagem só finaliza depois que a produção termina e o separador confirma.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const hoje = new Date().toISOString().slice(0, 10);
const mock = `(() => {
  window.__gravados = []; window.__rpcs = [];
  const ss = (k, d) => { try { const v = sessionStorage.getItem(k); return v == null ? d : Number(v); } catch (_) { return d; } };
  const banco = {
    separacoes_pedidos: [{ id: "p1", empresa_id: "e1", numero_pedido: "12", cliente_nome: "Lis", tipo_evento: "Casamento", local_nome: "Villa", status: "em_separacao", modo_separacao: "manual", status_comercial: "aprovado", data_evento: "${hoje}", data_entrega: "${hoje}", data_hora: "${hoje}T12:00:00" }],
    separacoes_itens: [
      { id: "x1", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i1", item_nome: "Poltrona Orka", quantidade_solicitada: 10, quantidade_separada: ss("x1sep", 0), tipo_controle: "quantidade", itens: { id: "i1", tipo: "Item", codigo: "ORKA", setor_estoque: "Estofados" } },
      { id: "x2", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i2", item_nome: "Cadeira Tiffany", quantidade_solicitada: 2, quantidade_separada: 2, tipo_controle: "quantidade", itens: { id: "i2", tipo: "Item", codigo: "TIF", setor_estoque: "Cadeiras" } }],
    kit_itens: [], itens_patrimonios: [], separacoes_etiquetas: [], separacoes_leituras: [], empresa_logistica_regras: [], meusSetores: null
  };
  function consulta(t){
    let linhas = (banco[t] || []).slice(), unico = false, acao = null, dados = null;
    const q = {
      select(){ return q; }, order(){ return q; }, limit(){ return q; },
      or(){ return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      in(c, vs){ linhas = linhas.filter((l) => !(c in l) || vs.map(String).includes(String(l[c]))); return q; },
      single(){ unico = true; return q; }, maybeSingle(){ unico = true; return q; },
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
    rpc: (n, args) => {
      window.__rpcs.push({ n, args });
      if (n === "separacao_producao") return Promise.resolve({ data: [{ pedido_id: "p1", item_id: "i1", unidades: 4, prontas: ss("prontas", 0), confirmadas: ss("conf", 0), personalizacoes: "Forração" }], error: null });
      if (n === "separacao_producao_confirmar") { sessionStorage.setItem("conf", String(ss("prontas", 0))); return Promise.resolve({ data: {}, error: null }); }
      if (n === "operacao_atualizar_separacao" && args.p_item === "x1") sessionStorage.setItem("x1sep", String(args.p_dados.quantidade_separada));
      return rpcOperacao(banco, n, args);
    }
  };
  window.supabase = { createClient: () => cliente };
  window.__CONTEXT = { empresa_id: "e1", usuario_id: "u1", usuario_nome: "Teste", empresa_nome: "Chiavari" };
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
  const abrir = async () => {
    await page.goto(BASE + "Modulos/Estoque/SeparacaoMateriais/separacao-materiais.html?pedido=p1&etapa=ida");
    await page.waitForSelector("#separacaoManualModal:not(.hidden) .item-card-producao", { timeout: 15000 });
  };
  await abrir();
  const normal = page.locator('#separacaoManualItens [data-manual-qty][data-separacao-item-id="x1"]');
  assert.strictEqual(await normal.getAttribute("max"), "6", "a parte normal da Poltrona é 6 de 10");
  const prod = page.locator("#separacaoManualItens .item-card-producao");
  const tp = await prod.innerText();
  assert.ok(/Poltrona Orka/.test(tp) && /\b4\b/.test(tp) && /Em produção/.test(tp) && /Forração/.test(tp), tp);
  assert.strictEqual(await prod.locator("input, [data-manual-delta]").count(), 0, "parte em produção sem quantidade");
  assert.strictEqual(await prod.locator("[data-confirmar-producao]").count(), 0, "sem confirmar enquanto não fica pronto");
  console.log("ok 1 - linha dividida: 6 para separar + 4 em produção, sem quantidade, no setor do item");

  await normal.click(); await normal.fill("6"); await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  await page.click("#btnSalvarManualSeparacao");
  await page.waitForTimeout(800);
  assert.ok(/Aguardando a Produção|em produção \(personalização\)/.test(await page.evaluate(() => document.body.innerText)), "avisa que falta a produção");
  assert.ok(!(await page.evaluate(() => window.__gravados.some((g) => g.t === "separacoes_pedidos" && g.p?.status === "separado"))), "não finaliza");
  console.log("ok 2 - galpão separado, mas a triagem não finaliza enquanto a produção não entrega");

  await page.locator('.separacao-pendencias-dialog button').click();
  await page.evaluate(() => sessionStorage.setItem("prontas", "4"));
  await abrir();
  const btn = page.locator("#separacaoManualItens [data-confirmar-producao]");
  assert.ok(/Pronto na produção/.test(await page.locator("#separacaoManualItens .item-card-producao").innerText()));
  await btn.click();
  await page.waitForFunction(() => /Recebido da produção/.test(document.querySelector("#separacaoManualItens .item-card-producao")?.innerText || ""), null, { timeout: 10000 });
  const conf = await page.evaluate(() => window.__rpcs.find((x) => x.n === "separacao_producao_confirmar")?.args);
  assert.deepStrictEqual(conf, { p_pedido: "p1", p_item: "i1" });
  console.log("ok 3 - produção pronta: o separador confirma o recebimento");

  await page.click("#btnSalvarManualSeparacao");
  await page.waitForFunction(() => window.__gravados.some((g) => g.t === "separacoes_pedidos" && g.p?.status === "separado"), null, { timeout: 10000 });
  console.log("ok 4 - com a produção confirmada a triagem finaliza");
  assert.ok(erros.length === 0, erros.join("\n"));
  await browser.close();
  console.log("todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });
