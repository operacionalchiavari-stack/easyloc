// Out/2026 — Triagem pelo cronograma: separacao-materiais.html?pedido=<id>&etapa=ida abre direto o pedido;
// leitura pela câmera (BarcodeDetector simulado) e pelo leitor; etiqueta "ACERVO:ITEM:<código>" vale como o código.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const hoje = new Date().toISOString().slice(0, 10);
const mock = `(() => {
  window.__gravados = [];
  const banco = {
    ocorrenciasSeparacao: [{ id: "oc1", pedido_id: "p1", estado: "acervo" }, { id: "oc2", pedido_id: "p2", estado: "resolvida" }],
    separacoes_pedidos: [{ id: "p1", empresa_id: "e1", numero_pedido: "12", cliente_nome: "Lis", tipo_evento: "Casamento", local_nome: "Villa", status: "pendente", status_comercial: "aprovado", data_evento: "${hoje}", data_hora: "${hoje}T12:00:00" },
      { id: "p2", empresa_id: "e1", numero_pedido: "13", cliente_nome: "Ana", tipo_evento: "Feira", local_nome: "Expo", status: "separado", status_comercial: "aprovado", status_operacional: "carregado", data_evento: "${hoje}", data_coleta: "${hoje}", data_hora: "${hoje}T13:00:00", operacao: { carregamento: { concluido_em: "${hoje}T10:00:00Z", por: "Igor", faltando: [] } } }],
    separacoes_itens: [
      { id: "s1", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i1", item_nome: "Cadeira Tiffany", quantidade_solicitada: 2, quantidade_separada: 0, tipo_controle: "quantidade", itens: { id: "i1", codigo: "CAD1", produto: "Cadeira" } },
      { id: "s2", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i2", item_nome: "Mesa Goa", quantidade_solicitada: 1, quantidade_separada: 0, tipo_controle: "quantidade", itens: { id: "i2", codigo: "MES1", produto: "Mesa" } }],
    itens: [{ id: "i1", empresa_id: "e1", codigo: "CAD1", produto: "Cadeira" }, { id: "i2", empresa_id: "e1", codigo: "MES1", produto: "Mesa" }],
    itens_patrimonios: [], separacoes_leituras: [], empresa_logistica_regras: [],
    operacao_ocorrencias: [
      { id: "d1", empresa_id: "e1", pedido_id: "pd", tipo: "falta", etapa: "retorno", quantidade: 2, resolvida_em: null },
      { id: "d2", empresa_id: "e1", pedido_id: "pd", tipo: "sobra", etapa: "retorno", quantidade: 1, resolvida_em: null },
      { id: "d3", empresa_id: "e1", pedido_id: "pd", tipo: "falta", etapa: "retorno", quantidade: 1, resolvida_em: "2026-10-28T10:00:00Z" },
      { id: "d4", empresa_id: "e1", pedido_id: "px", tipo: "falta", etapa: "descarregamento", quantidade: 1, resolvida_em: null }],
    separacoes_etiquetas: [{ id: "t1", empresa_id: "e1", separacao_pedido_id: "p2", codigo: "13-001", lida_carregamento_em: "x" }, { id: "t2", empresa_id: "e1", separacao_pedido_id: "p2", codigo: "13-002", lida_carregamento_em: "x" }]
  };
  banco.separacoes_pedidos.find(p=>p.id==="p2").operacao.descarregamento={concluido_em:"2026-10-18T11:00:00Z"};
  banco.separacoes_pedidos.push({ id: "pd", empresa_id: "e1", numero_pedido: "77", cliente_nome: "Bia Divergente", tipo_evento: "Casamento", local_nome: "Sítio", status: "separado", status_comercial: "aprovado", status_operacional: "retornado", data_evento: "2026-10-20", data_coleta: "2026-10-21", operacao: { retorno: { concluido_em: "2026-10-22T10:00:00Z" } } });
  banco.separacoes_pedidos.push({...banco.separacoes_pedidos.find(p=>p.id==='pd'),id:'sobra',numero_pedido:'78'});
  banco.operacao_ocorrencias.push({id:'ds',empresa_id:'e1',pedido_id:'sobra',tipo:'sobra',etapa:'retorno',quantidade:3,resolvida_em:null});
  banco.separacoes_pedidos.push({...banco.separacoes_pedidos[0],id:'standby',status:'separado',operacao:{}},{...banco.separacoes_pedidos[0],id:'assumido',status:'separado',operacao:{carregamento:{iniciado_em:'2026-10-23T12:00:00Z'}}},{...banco.separacoes_pedidos[0],id:'revisao',reducao_liberada_em:'2026-10-23T12:00:00Z'});
  function consulta(t){
    let linhas = (banco[t] || []).slice(), unico = false, acao = null, dados = null;
    const q = {
      select(){ return q; }, order(){ return q; }, limit(){ return q; },
      or(expr){ const conds = expr.split(",").map((c) => c.split(".eq.")); linhas = linhas.filter((l) => conds.some(([c, v]) => String(l[c]) === v)); return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      in(c, vs){ linhas = linhas.filter((l) => !(c in l) || vs.map(String).includes(String(l[c]))); return q; },
      is(c, v){ linhas = linhas.filter((l) => (l[c] ?? null) === v); return q; },
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
  // Nov/2026: só vira "em separação" depois de escolher a forma de separar.
  assert.ok(!(await page.evaluate(() => window.__gravados.some((g) => g.t === "separacoes_pedidos" && g.p.status === "em_separacao"))), "abrir não muda a situação");

  await page.click('[data-separacao-modo="qr"]');
  await page.waitForFunction(() => window.__gravados.some((g) => g.t === "separacoes_pedidos" && g.p.status === "em_separacao"), null, { timeout: 8000 });
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
  // Separado e ainda não carregado: continua na Triagem, na coluna Concluídos.
  await page.waitForFunction(() => !!document.querySelector("#separacaoColunaSeparados [data-pedido-id]"), null, { timeout: 8000 });
  console.log("ok 5b - pedido separado fica em Concluídos até a Expedição carregar");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "Modulos/Estoque/SeparacaoMateriais/separacao-materiais.html?pedido=p1&etapa=volta");
  await page.evaluate(() => { window.__CONTEXT = { empresa_id: "e1", usuario_id: "u1", usuario_nome: "Teste" }; }).catch(() => {});
  await page.waitForURL(/Conferencia\/conferencia\.html\?pedido=p1&etapa=retorno&de=separacao/, { timeout: 15000 });
  console.log("ok 6 - triagem da volta abre a conferência de retorno");
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(BASE + "Modulos/Estoque/SeparacaoMateriais/separacao-materiais.html");
  await page.evaluate(() => { window.__CONTEXT = { empresa_id: "e1", usuario_id: "u1", usuario_nome: "Teste" }; });
  await page.locator('#separacaoColunaAguardando [data-pedido-id=p1]').waitFor();
  assert.ok(await page.locator('.separacao-lane-divergencias').isVisible(), 'coluna Divergencias visivel');
  assert.equal(await page.locator('#separacaoColunaDivergencias [data-pedido-id=pd]').count(), 1, 'pedido permanece na Triagem enquanto houver contagem pendente');
  for(const id of ['pd','sobra']){
    const cores=await page.locator('#separacaoColunaDivergencias [data-pedido-id='+id+']').evaluate(card=>({fundo:getComputedStyle(card).backgroundColor,borda:getComputedStyle(card).borderTopColor}));
    assert.deepStrictEqual(cores,{fundo:'rgb(251, 236, 235)',borda:'rgb(239, 194, 191)'},'falta e sobra ficam vermelhas, sem herdar o roxo do retorno');
  }
  const medidas=await page.locator('#separacaoColunaDivergencias [data-pedido-id=pd]').evaluate(card=>({altura:card.getBoundingClientRect().height,resumoX:card.querySelector('.card-divergencia-resumo').getBoundingClientRect().left,fotoX:card.querySelector('.decorador-card-foto').getBoundingClientRect().right,linhas:card.children.length}));
  const outraAltura=await page.locator('#separacaoColunaAguardando [data-pedido-id=p1]').evaluate(card=>card.getBoundingClientRect().height);
  assert.ok(medidas.altura<=outraAltura+24,'card divergente usa a mesma altura compacta dos demais');
  assert.ok(medidas.resumoX>=medidas.fotoX,'resumo fica junto aos dados, fora da coluna estreita da foto');
  await page.evaluate(async()=>{await window.supabaseClient.from('operacao_ocorrencias').update({resolvida_em:new Date().toISOString()}).eq('pedido_id','pd');});
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(()=>document.querySelectorAll('#separacaoColunaDivergencias [data-pedido-id=pd]').length===0);
  console.log('ok 6b - divergencias ficam na Triagem ate o estoque finalizar a contagem');
  assert.equal(await page.locator('#separacaoKanban [data-pedido-id=p1] .sep-problema-dot').count(),1,'pedido com problema aberto tem a bolinha');
  assert.equal(await page.locator('#separacaoKanban [data-pedido-id=p1] .sep-problema-dot').evaluate(d=>getComputedStyle(d).backgroundColor),'rgb(230, 0, 18)');
  assert.equal(await page.locator('#separacaoKanban [data-pedido-id=standby] .sep-problema-dot').count(),0,'sem problema, sem bolinha');
  await page.waitForTimeout(100);
  const sob=await page.locator('#separacaoKanban [data-pedido-id=p1]').first().evaluate(c=>{const d=c.querySelector('.sep-problema-dot').getBoundingClientRect(),f=c.querySelector('.decorador-card-foto').getBoundingClientRect();return {d:[d.left,d.top,d.right,d.bottom],f:[f.left,f.top,f.right,f.bottom]};});
  assert.ok(sob.d[0]>=sob.f[0]&&sob.d[2]<=sob.f[2]+6&&sob.d[1]<=sob.f[1]+8&&sob.d[3]>=sob.f[1],'bolinha em cima da foto do decorador '+JSON.stringify(sob));
  if(process.env.SHOT_DOT)await page.locator('#separacaoKanban [data-pedido-id=p1]').first().screenshot({path:process.env.SHOT_DOT});
  console.log('ok 6c - bolinha vermelha no cartão do pedido com problema na separação');
  assert.ok(await page.locator('#separacaoColunaSeparados [data-pedido-id=standby]').count() >= 1,'separado e ainda não carregado fica em Concluídos');
  assert.equal(await page.locator('[data-pedido-id=assumido]').count(),0,'carregamento começou: sai da Triagem');
  assert.equal(await page.locator('[data-pedido-id=assumido]').count(),0);assert.equal(await page.locator('[data-pedido-id=revisao]').count(),0);
  await page.evaluate(()=>window.__modosSeparacao={manual:false,qr:true,'um-clique':false});
  await page.locator('#separacaoKanban .separacao-order-card[data-pedido-id=p1]').click();
  await page.locator('#separacaoModoModal:not(.hidden)').waitFor();
  assert.equal(await page.locator('[data-separacao-modo=manual]').isVisible(),false);
  assert.equal(await page.locator('[data-separacao-modo=qr]').isVisible(),true);
  assert.equal(await page.locator('[data-separacao-modo="um-clique"]').isVisible(),false);
  await page.locator('#btnFecharModoSeparacao').click();
  await page.evaluate(()=>window.__modosSeparacao={manual:false,qr:false,'um-clique':false});
  await page.locator('#separacaoKanban .separacao-order-card[data-pedido-id=p1]').click();
  await page.locator('#separacaoModoModal:not(.hidden)').waitFor();
  assert.equal(await page.locator('[data-sem-modos]').isVisible(),true);
  console.log('OK: modos nao autorizados ocultos e aviso quando nenhum modo esta liberado.');
  assert.deepStrictEqual(erros, [], erros.join("\n"));
  console.log("todos os testes passaram");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
