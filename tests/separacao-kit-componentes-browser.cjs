// Out/2026 — Kit nunca é separado como uma peça: na separação vira os componentes (kit_itens × quantidade);
// progresso no jsonb componentes da linha do Kit; etiquetas e leitura por componente.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const hoje = new Date().toISOString().slice(0, 10);
const mock = `(() => {
  window.__gravados = [];
  const banco = {
    separacoes_pedidos: [{ id: "p1", empresa_id: "e1", numero_pedido: "12", cliente_nome: "Lis", tipo_evento: "Casamento", local_nome: "Villa", status: "pendente", status_comercial: "aprovado", data_evento: "${hoje}", data_entrega: "${hoje}", data_hora: "${hoje}T12:00:00" }],
    separacoes_itens: [
      { id: "s1", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "k1", item_nome: "Sofá Becca (kit)", quantidade_solicitada: 2, quantidade_separada: 0, tipo_controle: "quantidade", componentes: {}, itens: { id: "k1", tipo: "Kit", codigo: "KIT1" } },
      { id: "s2", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i2", item_nome: "Mesa Goa", quantidade_solicitada: 1, quantidade_separada: 0, tipo_controle: "quantidade", itens: { id: "i2", tipo: "Item", codigo: "MES1" } }],
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
  const cliente = {
    auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }), getUser: async () => ({ data: { user: { id: "u1" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: consulta,
    rpc: (n) => ({ then: (ok) => Promise.resolve(n === "funcionario_contexto" ? { data: { ativo: true, administrador_legado: true }, error: null } : { data: [], error: null }).then(ok) })
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
  await page.evaluate(() => { window.EasyLocEtiquetas.escolherFormato = async () => "100x150"; });

  await page.click('[data-separacao-modo="qr"]');
  const linhas = await page.$$eval("#separacaoQrItens .item-card .item-name", (e) => e.map((x) => x.textContent.trim()));
  assert.deepStrictEqual(linhas, ["Corpo do sofá", "Almofada", "Mesa Goa"], "kit aberto nos componentes, sem a linha do kit");
  assert.ok((await page.textContent("#separacaoQrQtd")).startsWith("0 / 9"), "2 corpos + 6 almofadas + 1 mesa");
  assert.ok((await page.textContent("#separacaoQrItens")).includes("Parte do kit: Sofá Becca (kit)"));
  console.log("ok 1 - kit vira os componentes (2 corpos, 6 almofadas), sem a linha do kit");
  const ler = async (c) => { await page.fill("#scannerInput", c); await page.press("#scannerInput", "Enter"); await page.waitForTimeout(250); };
  await ler("ALM1"); await ler("ALM1"); await ler("ALM1"); await ler("CORPO1");
  assert.ok((await page.textContent("#separacaoQrQtd")).startsWith("4 / 9"));
  const kit = await page.evaluate(() => window.__gravados.filter((g) => g.t === "separacoes_itens" && g.p.componentes).pop().p);
  assert.deepStrictEqual({ a: kit.componentes.cA.separado, b: kit.componentes.cB.separado, kits: kit.quantidade_separada }, { a: 1, b: 3, kits: 1 }, "progresso no jsonb; 1 kit completo");
  console.log("ok 2 - leitura do componente soma; a linha do kit guarda o progresso e 1 kit completo");
  await ler("KIT1");
  assert.strictEqual(await page.textContent("#lastReadItem"), "Kit: leia cada componente");
  console.log("ok 3 - ler o código do kit pede os componentes");
  await page.evaluate(() => { window.EasyLocEtiquetas.escolherFormato = async () => "100x150"; });
  await page.click("#separacaoQrModal [data-etiquetas-envio]");
  await page.waitForFunction(() => window.__ultimaImpressaoEtiquetas);
  const criadas = await page.evaluate(() => window.__gravados.filter((g) => g.t === "separacoes_etiquetas" && g.tipo === "insert").flatMap((g) => g.p));
  assert.strictEqual(criadas.length, 9);
  assert.ok(criadas.filter((e) => e.item_id === "cB").every((e) => e.separacao_item_id === "s1"), "etiqueta do componente aponta para a linha do kit");
  assert.ok((await page.evaluate(() => window.__ultimaImpressaoEtiquetas)).includes("Almofada"));
  console.log("ok 4 - 9 etiquetas, uma por peça, nomes dos componentes");
  const etq = criadas.find((e) => e.item_id === "cA" && e.sequencia === 2);
  await ler("ACERVO:ENV:" + etq.codigo);
  assert.ok((await page.textContent("#separacaoQrQtd")).startsWith("5 / 9"));
  console.log("ok 5 - etiqueta de componente marca a peça certa");
  await page.click('#btnFecharQrSeparacao');
  await page.click('.separacao-order-card[data-pedido-id=p1]');
  await page.waitForSelector('#separacaoModoModal:not(.hidden)');
  await page.click('#separacaoModoModal [data-relatorio-separacao]');
  await page.waitForFunction(() => window.__ultimoRelatorioSeparacao);
  const rel = await page.evaluate(() => window.__ultimoRelatorioSeparacao);
  assert.ok(rel.includes('Separação · Pedido 12') && rel.includes('Corpo do sofá') && rel.includes('Parte do kit: Sofá Becca (kit)') && rel.includes('Faltou') && rel.includes('Separado por'), 'relatório com componentes, campos para marcar e assinaturas');
  require('fs').writeFileSync(require('os').tmpdir() + '/relatorio-separacao.html', rel);
  console.log('ok 6 - relatório de separação com componentes, campos para marcar e assinaturas');
  assert.deepStrictEqual(erros, [], erros.join("\n"));
  console.log("todos os testes passaram");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
