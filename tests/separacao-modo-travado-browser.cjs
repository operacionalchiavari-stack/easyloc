// Out/2026 — o modo da triagem fica travado no pedido: escolhido uma vez, abre direto nele e não pergunta de novo.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const hoje = new Date().toISOString().slice(0, 10);
const mock = `(() => {
  window.__gravados = [];
  const banco = {
    separacoes_pedidos: [{ id: "p1", empresa_id: "e1", numero_pedido: "12", cliente_nome: "Lis", tipo_evento: "Casamento", local_nome: "Villa", status: "pendente", status_comercial: "aprovado", data_evento: "${hoje}", data_entrega: "${hoje}", data_hora: "${hoje}T12:00:00" }],
    separacoes_itens: [
      { id: "x0", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i0", item_nome: "Cadeira modelo 0", quantidade_solicitada: 1, quantidade_separada: 1, tipo_controle: "quantidade", itens: { id: "i0", tipo: "Item", codigo: "C0" } },
      { id: "x1", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i1", item_nome: "Cadeira modelo 1", quantidade_solicitada: 1, quantidade_separada: 1, tipo_controle: "quantidade", itens: { id: "i1", tipo: "Item", codigo: "C1" } },
      { id: "x2", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i2", item_nome: "Cadeira modelo 2", quantidade_solicitada: 1, quantidade_separada: 1, tipo_controle: "quantidade", itens: { id: "i2", tipo: "Item", codigo: "C2" } },
      { id: "x3", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i3", item_nome: "Cadeira modelo 3", quantidade_solicitada: 1, quantidade_separada: 1, tipo_controle: "quantidade", itens: { id: "i3", tipo: "Item", codigo: "C3" } },
      { id: "x4", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i4", item_nome: "Cadeira modelo 4", quantidade_solicitada: 1, quantidade_separada: 1, tipo_controle: "quantidade", itens: { id: "i4", tipo: "Item", codigo: "C4" } },
      { id: "x5", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i5", item_nome: "Cadeira modelo 5", quantidade_solicitada: 1, quantidade_separada: 1, tipo_controle: "quantidade", itens: { id: "i5", tipo: "Item", codigo: "C5" } },
      { id: "x6", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i6", item_nome: "Cadeira modelo 6", quantidade_solicitada: 1, quantidade_separada: 1, tipo_controle: "quantidade", itens: { id: "i6", tipo: "Item", codigo: "C6" } },
      { id: "x7", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i7", item_nome: "Cadeira modelo 7", quantidade_solicitada: 1, quantidade_separada: 1, tipo_controle: "quantidade", itens: { id: "i7", tipo: "Item", codigo: "C7" } },
      { id: "x8", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i8", item_nome: "Cadeira modelo 8", quantidade_solicitada: 1, quantidade_separada: 1, tipo_controle: "quantidade", itens: { id: "i8", tipo: "Item", codigo: "C8" } },
      { id: "x9", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i9", item_nome: "Cadeira modelo 9", quantidade_solicitada: 1, quantidade_separada: 1, tipo_controle: "quantidade", itens: { id: "i9", tipo: "Item", codigo: "C9" } },
      { id: "x10", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i10", item_nome: "Cadeira modelo 10", quantidade_solicitada: 1, quantidade_separada: 1, tipo_controle: "quantidade", itens: { id: "i10", tipo: "Item", codigo: "C10" } },
      { id: "x11", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i11", item_nome: "Cadeira modelo 11", quantidade_solicitada: 1, quantidade_separada: 1, tipo_controle: "quantidade", itens: { id: "i11", tipo: "Item", codigo: "C11" } },
      { id: "x12", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i12", item_nome: "Cadeira modelo 12", quantidade_solicitada: 1, quantidade_separada: 0, tipo_controle: "quantidade", itens: { id: "i12", tipo: "Item", codigo: "C12" } },
      { id: "x13", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i13", item_nome: "Cadeira modelo 13", quantidade_solicitada: 1, quantidade_separada: 0, tipo_controle: "quantidade", itens: { id: "i13", tipo: "Item", codigo: "C13" } }],
    kit_itens: [
      { empresa_id: "e1", kit_id: "k1", item_id: "cA", quantidade: 1, itens: { id: "cA", codigo: "CORPO1", produto: "Corpo do sofá", tipo: "Componente" } },
      { empresa_id: "e1", kit_id: "k1", item_id: "cB", quantidade: 3, itens: { id: "cB", codigo: "ALM1", produto: "Almofada", tipo: "Componente" } }],
    itens: [{ id: "k1", empresa_id: "e1", codigo: "KIT1", tipo: "Kit" }, { id: "cA", empresa_id: "e1", codigo: "CORPO1", tipo: "Componente" }, { id: "cB", empresa_id: "e1", codigo: "ALM1", tipo: "Componente" }, { id: "i2", empresa_id: "e1", codigo: "MES1", tipo: "Item" }],
    itens_patrimonios: [],
    separacoes_etiquetas: [],
    separacoes_leituras: [], empresa_logistica_regras: []
  };
  function consulta(t){
    let linhas = (banco[t] || []).slice(), unico = false, acao = null, dados = null;
    const q = {
      select(){ return q; }, order(){ return q; }, limit(){ return q; },
      or(expr){ const conds = expr.split(",").map((c) => c.split(".eq.")); linhas = linhas.filter((l) => conds.some(([c, v]) => String(l[c]) === v)); return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      in(c, vs){ linhas = linhas.filter((l) => !(c in l) || vs.map(String).includes(String(l[c]))); return q; },
      single(){ unico = true; return q; }, maybeSingle(){ unico = true; return q; },
      insert(p){ const lista = (Array.isArray(p) ? p : [p]).map((x) => ({ id: "n" + Math.random().toString(36).slice(2), created_at: new Date().toISOString(), ...x })); window.__gravados.push({ t, tipo: "insert", p }); (banco[t] ||= []).push(...lista); linhas = lista; return q; },
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
  window.__CONTEXT = { empresa_id: "e1", usuario_id: "u1", usuario_nome: "Teste", empresa_nome: "Chiavari" };
})();`;
const QR = "/* qrcodejs falso */ window.QRCode = function(el, o){ const c = document.createElement('canvas'); c.width = o.width; c.height = o.height; el.appendChild(c); }; window.QRCode.CorrectLevel = { M: 0 };";

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide|single is not a function/.test(e.message)) erros.push(e.message); });
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); });
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("supabase-js")) return r.fulfill({ contentType: "text/javascript", body: mock });
    if (u.includes("qrcodejs")) return r.fulfill({ contentType: "text/javascript", body: QR });
    if (u.startsWith(BASE)) {
      const f = path.join(raiz, decodeURIComponent(new URL(u).pathname));
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
      return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" });
    }
    return r.abort();
  });
  await page.goto(BASE + "Modulos/Estoque/SeparacaoMateriais/separacao-materiais.html?pedido=p1&etapa=ida");
  await page.waitForSelector("#separacaoModoModal:not(.hidden)", { timeout: 15000 });

  await page.click('[data-separacao-modo="manual"]');
  await page.waitForSelector('#separacaoManualModal:not(.hidden)');
  await page.click('#btnFecharManualSeparacao');
  await page.waitForTimeout(400);
  await page.locator('[data-pedido-id="p1"]').first().click();
  await page.waitForTimeout(800);
  assert.ok(!(await page.isVisible('#separacaoModoModal:not(.hidden)')), 'não pergunta o modo de novo');
  assert.ok(await page.isVisible('#separacaoManualModal:not(.hidden)'), 'abre direto no modo manual');
  console.log('ok 1 - escolhido o modo, sair e voltar abre direto nele');
  const barras = await page.evaluate(() => {
    const r = [];
    document.querySelectorAll('*').forEach((e) => { const c = getComputedStyle(e); if (/(auto|scroll)/.test(c.overflowY) && e.scrollHeight > e.clientHeight + 2) r.push(e.tagName + '#' + e.id + '.' + String(e.className).slice(0, 60) + ' ' + e.clientHeight + '/' + e.scrollHeight); });
    const d = document.scrollingElement; if (d.scrollHeight > d.clientHeight + 2) r.push('documento ' + d.clientHeight + '/' + d.scrollHeight);
    return r;
  });
  if (process.env.MOSTRAR) console.log(barras.join('\n'));
  if (process.env.FOTO) await page.screenshot({ path: process.env.FOTO });
  assert.ok(barras.length <= 1, 'uma barra de rolagem só, achou: ' + barras.join(' | '));
  console.log('ok 2 - uma barra de rolagem só na tela da separação');
  await page.click('#btnSalvarManualSeparacao');
  await page.waitForTimeout(500);
  const finalizou = await page.evaluate(() => window.__gravados.some((g) => g.t === 'separacoes_pedidos' && /separado/.test(g.p?.status || '')));
  assert.ok(!finalizou, 'não finaliza a triagem com itens faltando');
  assert.ok(/Separe todos os itens/.test(await page.evaluate(() => document.body.innerText)), 'avisa que falta separar');
  assert.ok(!/Finalizar com divergencia|Finalizar com pendencia/i.test(await page.evaluate(() => document.body.innerText)), 'não oferece finalizar com pendência');
  console.log('ok 3 - não finaliza a triagem com item faltando');
  assert.ok(erros.length === 0, erros.join('\n'));
  await browser.close();
  console.log('todos os testes passaram');
})().catch((e) => { console.error(e); process.exit(1); });
