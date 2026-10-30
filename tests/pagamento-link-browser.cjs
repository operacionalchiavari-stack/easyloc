// Out/2026 — Link de pagamento do pedido: página do cliente (código, lista neutra, QR por pagamento, confirmação),
// janela da equipe (link, código, QR, aviso de conta sem gateway) e o QR no documento do pedido.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const mock = `(() => {
  window.__chamadas = [];
  const pagamentos = [
    { id: "r1", numero: 1, vencimento: "2026-11-10", valor: 3000, aberto: 3000, situacao: "aberto", pagavel: true, pix: null },
    { id: "r2", numero: 2, vencimento: "2026-11-10", valor: 600, aberto: 600, situacao: "aberto", pagavel: true, pix: null },
    { id: "r3", numero: 3, vencimento: "2026-11-10", valor: 400, aberto: 400, situacao: "aberto", pagavel: false, pix: null },
    { id: "r4", numero: 4, vencimento: "2026-10-01", valor: 100, aberto: 0, situacao: "pago", pagavel: true, pix: null },
  ];
  let consultas = 0;
  const cliente = {
    rpc: async (n, a) => {
      window.__chamadas.push({ n, a });
      if (n === "pagamento_link_abrir") {
        if (a.p_pin !== "123456") return { data: { erro: "Código incorreto.", codigo_errado: true }, error: null };
        return { data: { ok: true, empresa: { nome: "Chiavari", logo_url: null }, pedido: { numero: "12", cliente: "Lis Decor", data_evento: "2026-11-20", data_evento_fim: null }, pagamentos,
          detalhe: { nome: "Lis Decor", numero: "12", status: "aprovado", data_evento: "2026-11-20", data_entrega: "2026-11-19", hora_entrega: "10:00", data_coleta: "2026-11-21", hora_coleta: "08:00",
            local: "Vale dos Desejos", endereco: "Estrada do Passatempo, 976 - Areal - RJ", valor_total: 4000, valores: { locacao: 3000, frete: 600, montagem: 400, total: 4000 },
            ambientes: [{ id: "a1", nome: "Lounge", notas: "", renders: [{ url: "/slide2.jpg", jogos: 2 }], itens: [
              { item_id: "i1", quantidade: 2, personalizacao_id: "pz", personalizacao_nome: "Forração", personalizacao_valor: 100, personalizacao_escolhas: { Tecido: { codigo: "T12", nome: "Linho" } } },
              { item_id: "i2", quantidade: 3 }] },
              { id: "a2", nome: "Bar", renders: [], itens: [{ item_id: "i3", quantidade: 1 }] }],
            cadastro: [{ id: "i1", descricao_total: "Sofá Orka Estofado Tecido Off White (L) 2.40 m (A) 0.75 m (P) 1.10 m", produto: "Orka", foto_url: "/slide2.jpg", codigo: "SOF1", valor_locacao: 762.3, valor_reposicao: 12000 },
              { id: "i2", produto: "Mesa Lateral", largura: 0.5, altura: 0.6, profundidade: 0.5, valor_locacao: 100, valor_reposicao: 800 },
              { id: "i3", descricao_total: "Bar Bistrol (L) 2 m (A) 1.1 m (P) 0.6 m", produto: "Bar", foto_url: "/slide2.jpg", valor_locacao: 900, valor_reposicao: 5000 }],
            servicos: [{ nome: "Montagem Extra", quantidade: 1, valor: 250, data: "2026-11-19", hora: "14:00" }], plantas: [{ nome: "Planta", w: 297, h: 210, html: '<div style="width:100%;height:100%;background:#ddd"></div>' }] } }, error: null };
      }
      if (n === "pagamento_link_obter") return { data: { slug: "abc", pin: a.p_novo_codigo ? "654321" : "123456", ativo: true, pagamentos: 4, contas_sem_gateway: ["Conta Montagem"] }, error: null };
      return { data: null, error: null };
    },
    functions: { invoke: async (nome, o) => {
      window.__chamadas.push({ n: "fn:" + nome, a: o.body });
      if (o.body.action === "gerar") return { data: { ok: true, qr_code: "00020126PIXCOPIAECOLA", qr_code_base64: "${PNG}", expira_em: new Date(Date.now() + 1800000).toISOString(), valor: 3000, pago: false }, error: null };
      consultas++;
      if (consultas >= 2) { pagamentos[0].situacao = "pago"; pagamentos[0].aberto = 0; return { data: { ok: true, pago: true, valor: 3000 }, error: null }; }
      return { data: { ok: true, pago: false }, error: null };
    } },
    auth: { getSession: async () => ({ data: { session: null } }) },
  };
  window.supabase = { createClient: () => cliente };
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE }).catch(() => {});
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await ctx.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("supabase-js")) return r.fulfill({ contentType: "text/javascript", body: mock });
    if (u.includes("qrcodejs")) return r.fulfill({ contentType: "text/javascript", body: fs.readFileSync(path.join(__dirname, "fixtures-qrcode-stub.js"), "utf8") });
    if (u.startsWith(BASE)) {
      const f = path.join(raiz, decodeURIComponent(new URL(u).pathname));
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
      return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" });
    }
    return r.abort();
  });

  await page.goto(BASE + "Modulos/Financeiro/pagar.html?p=abc");
  await page.waitForSelector("#pgEntrar:not([hidden])");
  await page.fill("#pgCodigo", "000000");
  await page.waitForSelector("#pgErro:not([hidden])");
  assert.match(await page.textContent("#pgErro"), /Código incorreto/);
  await page.fill("#pgCodigo", "123456");
  await page.waitForSelector(".pg-item");
  // o documento é o mesmo do PDF: folha do pedido, layout em pé, e os pagamentos no fim
  await page.waitForSelector(".cpj-order-paper");
  assert.equal(await page.locator(".cpj-order-paper.is-horizontal").count(), 0, "layout em pé");
  assert.equal(await page.locator(".cpj-order-letterhead").count(), 1, "cabeçalho do pedido");
  assert.equal(await page.locator(".pd-hero, .pg-topo:visible").count(), 0, "sem a capa própria nem a faixa da página");
  const pedido = await page.textContent("#pgLista");
  assert.match(pedido, /PEDIDO Nº 12/i); assert.match(pedido, /Vale dos Desejos[\s\S]*Lounge[\s\S]*Sofá Orka[\s\S]*Bar Bistrol[\s\S]*Montagem Extra[\s\S]*Renderizações do projeto[\s\S]*Resumo do pedido[\s\S]*Pagamento 1/);
  assert.doesNotMatch(pedido, /Programação de pagamento/, "os pagamentos entram no lugar dela");
  assert.equal(await page.locator(".cpj-order-renders figure").count(), 1);
  await page.click(".cpj-order-render-group img"); await page.waitForSelector("#pgFoto[open]"); await page.click("[data-fechar-foto]");
  assert.ok(await page.isVisible("#pdBarra"), "barra para ir ao pagamento");
  await page.evaluate(() => document.getElementById("pagamento").scrollIntoView()); await page.waitForFunction(() => document.getElementById("pdBarra").classList.contains("oculta"));
  const texto = await page.textContent("#pagamento");
  assert.match(texto, /Pagamento 1[\s\S]*Pagamento 2[\s\S]*Pagamento 3/);
  assert.doesNotMatch(texto, /Locação|Frete|Montagem|banco|Mercado Pago|chave/i, "nos pagamentos o cliente não vê conta, banco nem chave");
  assert.match(texto, /Total em aberto\s*R\$\s*4\.000,00/, "o total em aberto não soma o que já foi pago");
  assert.equal(await page.locator("[data-pagar]").count(), 2, "só os pagamentos com gateway têm botão");
  assert.match(await page.locator(".pg-item").nth(2).textContent(), /Fale com a nossa equipe/);
  assert.match(await page.locator(".pg-item").nth(3).textContent(), /Pago ✓/);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "celular sem rolagem lateral");
  assert.ok(await page.evaluate(() => { const f = document.querySelector(".cpj-order-planta-folha").getBoundingClientRect(); return f.width > 100 && f.right <= innerWidth; }), "planta cabe no celular");
  console.log("ok 1 - pedido completo e, no final, pagamentos neutros, conta sem gateway e pago");
  if (process.env.SP) {
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; scrollTo(0, 0); });
    await page.waitForTimeout(900); await page.screenshot({ path: process.env.SP + "/pd-cel.png", fullPage: true });
    await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(300); await page.screenshot({ path: process.env.SP + "/pd-pc.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
  }

  await page.click('[data-pagar="r1"]');
  await page.waitForSelector(".pg-pix-qr");
  const pix = await page.textContent("#pgPixCorpo");
  assert.match(pix, /R\$\s*3\.000,00/);
  assert.equal(await page.inputValue(".pg-copia input"), "00020126PIXCOPIAECOLA");
  assert.ok(await page.evaluate(() => { const c = window.__chamadas.find((x) => x.n === "fn:pagamento-link"); return c.a.action === "gerar" && c.a.receber_id === "r1" && c.a.pin === "123456" && c.a.slug === "abc"; }));
  console.log("ok 2 - gera o QR do pagamento com o valor travado");
  await page.waitForSelector(".pg-pix-ok", { timeout: 20000 });
  await page.click(".pg-pix-ok [data-fechar]");
  await page.waitForFunction(() => document.querySelector(".pg-item").classList.contains("is-ok"));
  console.log("ok 3 - pagamento confirmado sozinho e a lista atualiza");

  // recarregar não pede o código de novo; ?p= com código no QR entra direto e tira o código do endereço
  const p2 = await ctx.newPage();
  await p2.goto(BASE + "Modulos/Financeiro/pagar.html?p=abc#c=123456");
  await p2.waitForSelector(".pg-item");
  assert.ok(!p2.url().includes("#c="), "o código não fica no endereço");
  console.log("ok 4 - QR do documento entra direto, sem deixar o código no endereço");

  // janela da equipe + QR do documento
  const p3 = await ctx.newPage();
  await p3.setViewportSize({ width: 1200, height: 800 });
  await p3.goto(BASE + "Modulos/Financeiro/pagar.html?p=abc#c=123456");
  await p3.waitForSelector(".pg-item");
  await p3.addScriptTag({ url: BASE + "js/core/linkPagamento.js" });
  await p3.evaluate(() => window.EasyLocLinkPagamento.abrir({ empresaId: "e1", pedidoId: "p1", numero: "12", cliente: "Lis", telefone: "(24) 99999-0000" }));
  await p3.waitForSelector(".elp-codigo");
  const jan = await p3.textContent(".elp-dialog");
  assert.match(jan, /123456/); assert.match(jan, /Conta Montagem/);
  assert.match(await p3.inputValue(".elp-linha input"), /\/Modulos\/Financeiro\/pagar\.html\?p=abc$/);
  assert.match(await p3.getAttribute(".elp-rodape a.whats", "href"), /wa\.me\/5524999990000\?text=/);
  const doc = await p3.evaluate(() => window.EasyLocLinkPagamento.paraDocumento({ empresaId: "e1", pedidoId: "p1" }));
  assert.match(doc.url, /#c=123456$/); assert.ok(doc.qr.startsWith("data:image/"));
  console.log("ok 5 - janela da equipe e QR para o documento");
  assert.deepStrictEqual(erros, []);
  await browser.close();
  console.log("todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });
