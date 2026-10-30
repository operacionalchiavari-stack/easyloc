// Out/2026 — Expedição: 3 colunas (aguardando / em carregamento / carregados); clicar abre a conferência do
// carregamento com "← Voltar" de volta para a Expedição.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const mock = `(() => {
  window.__gravados = [];
  const banco = {
    bloqueadosFinanceiro: ["p1"],
    semCaminhao: ["p20"],
    separacoes_pedidos: [
      { id: "p1", empresa_id: "e1", numero_pedido: "12", cliente_nome: "Lis", tipo_evento: "Casamento", local_nome: "Villa", data_entrega: "2099-10-24", status: "separado", status_comercial: "aprovado", operacao: {} },
      { id: "p20", empresa_id: "e1", numero_pedido: "18", cliente_nome: "Kelly", tipo_evento: "Casamento", local_nome: "Vale", data_entrega: "2099-10-26", status: "separado", status_comercial: "aprovado", operacao: {} },
      { id: "p2", empresa_id: "e1", numero_pedido: "13", cliente_nome: "Ana", tipo_evento: "15 anos", local_nome: "Haras", data_entrega: "2099-10-25", status: "separado", status_comercial: "aprovado", operacao: {} },
      { id: "p3", empresa_id: "e1", numero_pedido: "14", cliente_nome: "Rafa", tipo_evento: "Corporativo", local_nome: "Hotel", data_entrega: "2099-10-26", status: "separado", status_comercial: "aprovado", status_operacional: "carregado", operacao: { carregamento: { concluido_em: "2099-10-25T14:30:00Z", por: "Igor", faltando: 1 } } },
      { id: "p4", empresa_id: "e1", numero_pedido: "15", cliente_nome: "Bia", tipo_evento: "Casamento", local_nome: "Sitio", data_entrega: "2099-10-27", status: "em_separacao", status_comercial: "aprovado", operacao: {} },
      { id: "p6", empresa_id: "e1", numero_pedido: "17", cliente_nome: "Caio", tipo_evento: "Feira", local_nome: "Expo", data_entrega: "2099-10-20", data_coleta: "2099-10-22", status: "separado", status_comercial: "aprovado", status_operacional: "carregado", operacao: { carregamento: { concluido_em: "2099-10-20T10:00:00Z", por: "Igor", faltando: [] } } },
      { id: "p7", empresa_id: "e1", numero_pedido: "18", cliente_nome: "Duda", tipo_evento: "Festa", local_nome: "Clube", data_entrega: "2099-10-18", data_coleta: "2099-10-19", status: "separado", status_comercial: "aprovado", status_operacional: "retornado", operacao: { carregamento: { concluido_em: "2099-10-18T10:00:00Z", faltando: [] }, retorno: { concluido_em: "2099-10-19T20:00:00Z", por: "Igor", faltando: [{ codigo: "18-002", item: "Mesa" }], lidas: 1, total: 2 } } },
      { id: "p5", empresa_id: "e1", numero_pedido: "16", cliente_nome: "Orc", local_nome: "x", data_entrega: "2099-10-27", status: "pendente", status_comercial: "orcamento", operacao: {} }],
    caminhoesProgramados: { p1: ["c1", "c2"] },
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
  banco.operacao_ocorrencias=localStorage.getItem('resolver-retorno')?[{pedido_id:'p7',codigo:'18-002',tipo:'falta',empresa_id:'e1',resolvida_em:'2099-10-26T10:00:00Z'}]:[];
  banco.separacoes_pedidos.push({id:'p-revisao',empresa_id:'e1',numero_pedido:'20',status:'separado',status_comercial:'aprovado',reducao_liberada_em:'2099-10-24T12:00:00Z',data_entrega:'2099-10-26',operacao:{}});
  banco.separacoes_pedidos.find(p=>p.id==='p2').operacao={carregamento:{iniciado_em:'2099-10-25T08:00:00Z'}};
  banco.separacoes_pedidos.push({id:'p9',empresa_id:'e1',numero_pedido:'21',cliente_nome:'Retorno confirmado no evento',status:'separado',status_comercial:'aprovado',data_coleta:'2099-10-27',operacao:{coleta:{concluido_em:'2099-10-27T08:00:00Z'},carregamento:{concluido_em:'2099-10-25T08:00:00Z'}}});
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
  assert.deepStrictEqual((await ids('#expColAguardando')).sort(),['p1:ida','p20:ida','p9:descarregamento']);
  assert.deepStrictEqual(await ids('#expColAndamento'),['p2:ida']);
  assert.equal((await ids('#expColCarregados')).length,0,'conferidos avancam de etapa');
  assert.equal(await page.locator('[data-pedido=p3],[data-pedido=p4],[data-pedido=p8],[data-pedido=p-revisao]').count(),0,'outras etapas nao duplicam o pedido na Expedicao');
  await page.click('#expBusca');await page.fill('#expBusca','ana');assert.deepStrictEqual(await ids('#expColAguardando'),[]);assert.deepStrictEqual(await ids('#expColAndamento'),['p2:ida']);
  await page.fill('#expBusca','');await page.waitForTimeout(300);
  const cam = await page.evaluate(() => ({ p1: document.querySelector('[data-pedido=p1][data-tipo=ida] .exp-caminhoes')?.innerText || '', p2: document.querySelector('[data-pedido=p2][data-tipo=ida] .exp-caminhoes')?.className || '' }));
  assert.ok(/programados/i.test(cam.p1) && /G/.test(cam.p1) && /M2/.test(cam.p1), 'cartão mostra os caminhões programados: ' + cam.p1);
  assert.ok(/is-vazio/.test(cam.p2), 'pedido sem caminhão programado avisa');
  console.log('ok - caminhões programados em destaque no cartão da ida');
  // Travado pelo pagamento mínimo: aviso pequeno na linha do Ida, sem % nem valor, e o cartão não abre.
  const travado = page.locator('[data-pedido=p1][data-tipo=ida]');
  assert.equal((await travado.locator('.exp-aviso-fin').innerText()).trim(), 'Aguardando Financeiro');
  const linhaTopo = await travado.locator('.separacao-card-top').boundingBox(), aviso = await travado.locator('.exp-aviso-fin').boundingBox();
  assert.ok(aviso.y >= linhaTopo.y - 1 && aviso.y + aviso.height <= linhaTopo.y + linhaTopo.height + 1, 'aviso na mesma linha do Ida');
  await travado.click(); await page.waitForTimeout(500);
  assert.ok(!/conferencia.html/.test(page.url()), 'cartão travado não abre a conferência');
  assert.equal(await page.locator('[data-pedido=p2][data-tipo=ida] .exp-aviso-fin').count(), 0, 'pedido liberado sem aviso');
  console.log('ok - pedido travado pelo Financeiro: aviso pequeno e não abre');
  const semCam = page.locator('[data-pedido=p20][data-tipo=ida]');
  assert.equal((await semCam.locator('.exp-aviso-fin').innerText()).trim(), 'Sem caminhão programado');
  assert.ok(/Painel Logístico/.test(await semCam.getAttribute('title')), 'explica onde programar');
  await semCam.click(); await page.waitForTimeout(400);
  assert.ok(!/conferencia.html/.test(page.url()), 'sem caminhão programado não abre a conferência');
  console.log('ok - sem caminhão programado: aviso e não abre');if(process.env.FOTO)await page.screenshot({path:process.env.FOTO});
  await page.fill('#expBusca','');await page.click('[data-pedido=p2][data-tipo=ida]');
  await page.waitForURL(/conferencia\.html\?pedido=p2&etapa=carregamento&de=expedicao/);
  await page.waitForSelector('#cfCorpo:not([hidden])');
  assert.equal(await page.locator('#cfTitulo').textContent(),'Conferencia do carregamento'.normalize('NFC').replace('Conferencia','Confer\u00eancia'));
  assert.deepStrictEqual(erros, []);
  await browser.close();
  console.log("todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });
