// Out/2026 — Etiquetas: na separação, "Imprimir etiquetas de envio" cria uma etiqueta por móvel (só as que faltam)
// e imprime; ler ACERVO:ENV:<código> marca aquela unidade uma única vez; QR fixo (ACERVO:PAT:) do mesmo móvel
// nunca conta duas vezes; etiqueta de outro pedido é recusada.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const hoje = new Date().toISOString().slice(0, 10);
const mock = `(() => {
  window.__gravados = [];
  const banco = {
    separacoes_pedidos: [{ id: "p1", empresa_id: "e1", numero_pedido: "12", cliente_nome: "Lis", tipo_evento: "Casamento", local_nome: "Villa", status: "pendente", status_comercial: "aprovado", data_evento: "${hoje}", data_entrega: "${hoje}", data_hora: "${hoje}T12:00:00" }],
    separacoes_itens: [
      { id: "s1", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i1", item_nome: "Cadeira Tiffany", quantidade_solicitada: 2, quantidade_separada: 0, tipo_controle: "quantidade" },
      { id: "s2", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i2", item_nome: "Mesa Goa", quantidade_solicitada: 1, quantidade_separada: 0, tipo_controle: "quantidade" }],
    itens: [{ id: "i1", empresa_id: "e1", codigo: "CAD1" }, { id: "i2", empresa_id: "e1", codigo: "MES1" }],
    itens_patrimonios: [{ id: "pt1", empresa_id: "e1", item_id: "i1", codigo_patrimonio: "CAD-001", status: "ativo", itens: { id: "i1", codigo: "CAD1" } }],
    separacoes_etiquetas: [{ id: "x9", empresa_id: "e1", separacao_pedido_id: "outro", separacao_item_id: "zz", codigo: "99-001", sequencia: 1, total_item: 1 }],
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

  await page.click("#separacaoModoModal [data-etiquetas-envio]");
  await page.waitForFunction(() => window.__ultimaImpressaoEtiquetas);
  const imp = await page.evaluate(() => ({ html: window.__ultimaImpressaoEtiquetas, criadas: window.__gravados.filter((g) => g.t === "separacoes_etiquetas" && g.tipo === "insert").flatMap((g) => g.p) }));
  assert.deepStrictEqual(imp.criadas.map((e) => e.codigo), ["12-001", "12-002", "12-003"], "uma etiqueta por móvel");
  assert.ok(imp.html.includes("PEDIDO 12") && imp.html.includes("1 de 2") && imp.html.includes("Cadeira Tiffany") && imp.html.includes("size:100mm 150mm"), "conteúdo e tamanho da etiqueta");
  console.log("ok 1 - etiquetas de envio criadas (12-001..003) e impressas em 100x150");

  await page.evaluate(() => { window.__ultimaImpressaoEtiquetas = null; });
  await page.click("#separacaoModoModal [data-etiquetas-envio]");
  await page.waitForFunction(() => window.__ultimaImpressaoEtiquetas);
  const insercoes = await page.evaluate(() => window.__gravados.filter((g) => g.t === "separacoes_etiquetas" && g.tipo === "insert").length);
  assert.strictEqual(insercoes, 1, "reimprimir não cria etiquetas de novo");
  console.log("ok 2 - reimprimir não duplica as etiquetas");

  await page.click('[data-separacao-modo="qr"]');
  const ler = async (codigo) => { await page.fill("#scannerInput", codigo); await page.press("#scannerInput", "Enter"); await page.waitForTimeout(250); };
  const qtd = () => page.textContent("#separacaoQrQtd");
  await ler("ACERVO:ENV:12-003");
  assert.ok((await qtd()).startsWith("1 /"), "etiqueta da mesa soma 1");
  await ler("ACERVO:ENV:12-003");
  assert.ok((await qtd()).startsWith("1 /"), "mesma etiqueta não soma de novo");
  assert.ok((await page.textContent("#lastReadItem")).includes("já foi lida"));
  console.log("ok 3 - etiqueta de envio marca a unidade uma única vez");

  await ler("ACERVO:ENV:99-001");
  assert.ok((await page.textContent("#lastReadItem")).includes("outro pedido"));
  console.log("ok 4 - etiqueta de outro pedido é recusada");

  await ler("ACERVO:PAT:CAD-001");
  assert.ok((await qtd()).startsWith("2 /"));
  await ler("ACERVO:PAT:CAD-001");
  assert.ok((await qtd()).startsWith("2 /"), "o mesmo móvel (patrimônio) não conta duas vezes");
  console.log("ok 5 - QR fixo do mesmo móvel conta uma vez");
  await ler("CAD1");
  assert.ok((await qtd()).startsWith("3 /"), "código do item continua valendo");
  console.log("ok 6 - código do item pelo leitor continua valendo; 3 de 3");
  assert.deepStrictEqual(erros, [], erros.join("\n"));
  console.log("todos os testes passaram");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
