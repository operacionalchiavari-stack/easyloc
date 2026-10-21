// Out/2026 — Triagem pelo cronograma: separacao-materiais.html?pedido=<id>&etapa=ida abre direto o pedido;
// leitura pela câmera (BarcodeDetector simulado) e pelo leitor; etiqueta "ACERVO:ITEM:<código>" vale como o código.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const hoje = new Date().toISOString().slice(0, 10);
const mock = `(() => {
  window.__gravados = [];
  const banco = {
    separacoes_pedidos: [{ id: "p1", empresa_id: "e1", numero_pedido: "12", cliente_nome: "Lis", tipo_evento: "Casamento", local_nome: "Villa", status: "pendente", status_comercial: "aprovado", data_evento: "${hoje}", data_hora: "${hoje}T12:00:00" },
      { id: "p2", empresa_id: "e1", numero_pedido: "13", cliente_nome: "Ana", tipo_evento: "Feira", local_nome: "Expo", status: "separado", status_comercial: "aprovado", status_operacional: "carregado", data_evento: "${hoje}", data_coleta: "${hoje}", data_hora: "${hoje}T13:00:00", operacao: { carregamento: { concluido_em: "${hoje}T10:00:00Z", por: "Igor", faltando: [] } } }],
    separacoes_itens: [
      { id: "s1", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i1", item_nome: "Cadeira Tiffany", quantidade_solicitada: 2, quantidade_separada: 0, tipo_controle: "quantidade", itens: { id: "i1", codigo: "CAD1", produto: "Cadeira" } },
      { id: "s2", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i2", item_nome: "Mesa Goa", quantidade_solicitada: 1, quantidade_separada: 0, tipo_controle: "quantidade", itens: { id: "i2", codigo: "MES1", produto: "Mesa" } }],
    itens: [{ id: "i1", empresa_id: "e1", codigo: "CAD1", produto: "Cadeira" }, { id: "i2", empresa_id: "e1", codigo: "MES1", produto: "Mesa" }],
    itens_patrimonios: [], separacoes_leituras: [], empresa_logistica_regras: [],
    separacoes_etiquetas: [{ id: "t1", empresa_id: "e1", separacao_pedido_id: "p2", codigo: "13-001", lida_carregamento_em: "x" }, { id: "t2", empresa_id: "e1", separacao_pedido_id: "p2", codigo: "13-002", lida_carregamento_em: "x" }]
  };
  banco.separacoes_pedidos.find(p=>p.id==="p2").operacao.descarregamento={concluido_em:"2026-10-18T11:00:00Z"};
  function consulta(t){
    let linhas = (banco[t] || []).slice(), unico = false, acao = null, dados = null;
    const q = {
      select(){ return q; }, order(){ return q; }, limit(){ return q; },
      or(expr){ const conds = expr.split(",").map((c) => c.split(".eq.")); linhas = linhas.filter((l) => conds.some(([c, v]) => String(l[c]) === v)); return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      in(c, vs){ linhas = linhas.filter((l) => !(c in l) || vs.map(String).includes(String(l[c]))); return q; },
      single(){ unico = true; return q; }, maybeSingle(){ unico = true; return q; },
      insert(p){ window.__gravados.push({ t, tipo: "insert", p }); const r = { id: "l" + Math.random(), created_at: new Date().toISOString(), ...p }; (banco[t] ||= []).unshift(r); linhas = [r]; return q; },
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
  // Câmera e leitor nativo simulados: o leitor "vê" o código que o teste colocar em window.__qr.
  window.BarcodeDetector = class { static async getSupportedFormats(){ return ["qr_code"]; } async detect(){ const v = window.__qr; window.__qr = ""; return v ? [{ rawValue: v }] : []; } };
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => { const c = document.createElement("canvas"); c.width = 64; c.height = 64; const g = c.getContext("2d"); setInterval(() => { g.fillStyle = "#" + Math.floor(Math.random()*999); g.fillRect(0, 0, 64, 64); }, 50); return c.captureStream(10); } } });
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide|single is not a function/.test(e.message)) erros.push(e.message); });
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); });
  await page.addInitScript({ content: "window.__CONTEXT_FIXO=1" });
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
  await page.goto(BASE + "Modulos/Estoque/SeparacaoMateriais/separacao-materiais.html?pedido=p1&etapa=ida");
  await page.waitForFunction(() => window.__CONTEXT || true);
  await page.evaluate(() => { window.__CONTEXT = { empresa_id: "e1", usuario_id: "u1", usuario_nome: "Teste" }; });
  await page.waitForSelector("#separacaoModoModal:not(.hidden)", { timeout: 15000 });
  console.log("ok 1 - link do cronograma abre o pedido e a escolha do modo");
  assert.ok(await page.evaluate(() => window.__gravados.some((g) => g.t === "separacoes_pedidos" && g.p.status === "em_separacao")), "pedido passa a em separação");

  await page.click('[data-separacao-modo="qr"]');
  await page.click("#btnCameraSeparacao");
  await page.waitForFunction(() => !document.getElementById("scannerCamera").hidden);
  await page.evaluate(() => { window.__qr = "ACERVO:ITEM:CAD1"; });
  await page.waitForFunction(() => document.getElementById("separacaoQrQtd").textContent.startsWith("1 /"));
  console.log("ok 2 - câmera lê a etiqueta e soma 1 Cadeira");
  await page.evaluate(() => { window.__qr = "ACERVO:ITEM:CAD1"; });
  await page.waitForTimeout(700);
  assert.ok((await page.textContent("#separacaoQrQtd")).startsWith("1 /"), "mesmo QR seguido não soma de novo antes de 2 s");
  console.log("ok 3 - o mesmo QR visto várias vezes não conta em dobro");

  await page.click("#btnCameraSeparacao");
  assert.ok(await page.evaluate(() => document.getElementById("scannerCamera").hidden));
  await page.fill("#scannerInput", "CAD1"); await page.press("#scannerInput", "Enter");
  await page.waitForFunction(() => document.getElementById("separacaoQrQtd").textContent.startsWith("2 /"));
  await page.fill("#scannerInput", "MES1"); await page.press("#scannerInput", "Enter");
  await page.waitForFunction(() => document.getElementById("separacaoQrQtd").textContent.startsWith("3 /"));
  console.log("ok 4 - leitor de teclado continua funcionando; 3 de 3");
  const leituras = await page.evaluate(() => window.__gravados.filter((g) => g.t === "separacoes_leituras").length);
  assert.ok(leituras >= 3, "leituras gravadas no histórico");

  await page.click("#btnFinalizarSeparacao");
  await page.waitForFunction(() => window.__gravados.some((g) => g.t === "separacoes_pedidos" && g.p.status === "separado"));
  console.log("ok 5 - finalizar marca o pedido como separado");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "Modulos/Estoque/SeparacaoMateriais/separacao-materiais.html?pedido=p1&etapa=volta");
  await page.evaluate(() => { window.__CONTEXT = { empresa_id: "e1", usuario_id: "u1", usuario_nome: "Teste" }; }).catch(() => {});
  await page.waitForURL(/Conferencia\/conferencia\.html\?pedido=p1&etapa=retorno&de=separacao/, { timeout: 15000 });
  console.log("ok 6 - triagem da volta abre a conferência de retorno");
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(BASE + "Modulos/Estoque/SeparacaoMateriais/separacao-materiais.html");
  await page.evaluate(() => { window.__CONTEXT = { empresa_id: "e1", usuario_id: "u1", usuario_nome: "Teste" }; });
  await page.waitForSelector("#separacaoColunaAguardando .card-retorno[data-pedido-id=p2]", { timeout: 15000 });
  const card = await page.$eval("#separacaoColunaAguardando .card-retorno", (c) => ({ txt: c.textContent.replace(/\s+/g, " "), fundo: getComputedStyle(c).backgroundColor }));
  assert.match(card.txt, /Retorno/); assert.match(card.txt, /às cegas/);
  assert.ok(!/peças|volume|\d+ \/ \d+/.test(card.txt.replace(/\d{2}\/\d{2}\/\d{4}/g, "")), "retorno não mostra quantidade: " + card.txt);
  assert.strictEqual(card.fundo, "rgb(244, 239, 252)");
  await page.screenshot({ path: process.env.SHOT || path.join(require("os").tmpdir(),"acervo-triagem-operacao.png") });
  await page.click("#separacaoColunaAguardando .card-retorno");
  await page.waitForURL(/etapa=retorno&de=separacao/);
  await page.waitForSelector("#cfVoltar:not([hidden])");
  await page.click("#cfVoltar");
  await page.waitForSelector("#separacaoColunaAguardando .card-retorno", { timeout: 15000 });
  console.log("ok 7 - na Triagem o pedido carregado ganha o cartão lilás de retorno, às cegas, que abre a conferência e volta");
  assert.deepStrictEqual(erros, [], erros.join("\n"));
  console.log("todos os testes passaram");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
