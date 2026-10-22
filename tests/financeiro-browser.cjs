// Out/2026 — Financeiro: abas, contas a receber agrupadas por pedido com a divisão locação/frete/montagem,
// conta (CNPJ/PIX) por parte, contas padrão do pedido, baixa, a pagar com aprovação e importação de extrato.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const hoje = new Date().toISOString().slice(0, 10);
const mock = `(() => {
  window.__rpc = [];
  const H = "${hoje}";
  const banco = {
    fin_contas: [{ id: "c1", empresa_id: "e1", nome: "Locações Itaú", tipo: "corrente", titular_nome: "Chiavari Locações", titular_documento: "11.111.111/0001-11", pix_tipo: "cnpj", pix_chave: "11111111000111", ativo: true, saldo_inicial: 0, saldo_minimo: 0 },
      { id: "c2", empresa_id: "e1", nome: "Fretes BB", tipo: "corrente", agencia: "cofre:v1:aa:bb", conta: "cofre:v1:cc:dd", titular_documento: "cofre:v1:ee:ff", pix_chave: "cofre:v1:gg:hh", ativo: true, saldo_inicial: 0, saldo_minimo: 0,
        cofre_mascaras: { agencia: "••••34", conta: "••••90", titular_documento: "••••22", pix_chave: "f•••@x.com" } }],
    fin_config: [{ empresa_id: "e1", conta_locacao: "c1", conta_frete: "c2", conta_montagem: null, conta_gateway: null }],
    fin_categorias: [{ id: "k1", empresa_id: "e1", codigo: "1", nome: "Receitas", tipo: "entrada", ativo: true, ordem: 1 }, { id: "k2", empresa_id: "e1", codigo: "1.1", nome: "Locação de mobiliário", tipo: "entrada", pai_id: "k1", chave: "locacao", ativo: true, ordem: 2 },
      { id: "k3", empresa_id: "e1", codigo: "2", nome: "Despesas", tipo: "saida", ativo: true, ordem: 3 }],
    fin_centros_custo: [{ id: "cc1", empresa_id: "e1", nome: "Operação", ativo: true }],
    fin_receber: [
      { id: "r1", empresa_id: "e1", origem: "pedido", grupo: "g1", pedido_id: "p1", pedido_numero: "12", componente: "locacao", cliente_nome: "Lis", descricao: "Pedido 12 · Locação", vencimento: H, valor: 3000, recebido: 0, aberto: 3000, parcela: 1, parcelas: 1, conta_id: "c1", status: "aberto" },
      { id: "r2", empresa_id: "e1", origem: "pedido", grupo: "g1", pedido_id: "p1", pedido_numero: "12", componente: "frete", cliente_nome: "Lis", descricao: "Pedido 12 · Frete", vencimento: H, valor: 400, recebido: 0, aberto: 400, parcela: 1, parcelas: 1, conta_id: "c2", status: "aberto" },
      { id: "r3", empresa_id: "e1", origem: "pedido", grupo: "g1", pedido_id: "p1", pedido_numero: "12", componente: "montagem", cliente_nome: "Lis", descricao: "Pedido 12 · Montagem", vencimento: H, valor: 600, recebido: 0, aberto: 600, parcela: 1, parcelas: 1, conta_id: null, status: "aberto" }],
    fin_pagar: [{ id: "g9", empresa_id: "e1", fornecedor_nome: "Transp X", descricao: "Frete terceirizado", vencimento: H, valor: 500, pago: 0, aberto: 500, parcela: 1, parcelas: 1, status: "pendente", requer_aprovacao: true, aprovacao: "pendente" }],
    fin_extrato: [], fin_baixas: [],
    fornecedores: [{ id: "f1", empresa_id: "e1", nome_razao_social: "Transp X Ltda", nome_fantasia: "Transp X" }],
    clientes_empresas: [{ id: "cl1", empresa_id: "e1", nome_razao: "Lis Decor" }],
    separacoes_pedidos: [{ id: "p1", empresa_id: "e1", numero_pedido: "12", cliente_nome: "Lis", tipo_evento: "Casamento", data_evento: H, valor_total: 4000, status_comercial: "aprovado" }]
  };
  function consulta(t){
    let linhas = (banco[t] || []).slice(), unico = false, acao = null, dados = null;
    const q = {
      select(){ return q; }, order(){ return q; }, limit(){ return q; }, range(){ return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      in(c, vs){ linhas = linhas.filter((l) => vs.map(String).includes(String(l[c]))); return q; },
      single(){ unico = true; return q; }, maybeSingle(){ unico = true; return q; },
      insert(p){ (banco[t] ||= []).push({ id: "n" + Math.random(), ...p }); window.__rpc.push({ n: "insert:" + t, a: p }); return q; },
      update(p){ acao = "update"; dados = p; return q; },
      then(ok, erro){
        if(acao === "update"){ linhas.forEach((l) => Object.assign(l, dados)); window.__rpc.push({ n: "update:" + t, a: dados }); }
        return Promise.resolve({ data: unico ? (linhas[0] || null) : linhas, error: null }).then(ok, erro);
      }
    };
    return q;
  }
  const respostas = {
    funcionario_contexto: () => ({ ativo: true, administrador_legado: true }),
    fin_saldos: () => [{ conta_id: "c1", saldo: 1500 }, { conta_id: "c2", saldo: -200 }],
    fin_fluxo: () => Array.from({ length: 31 }, (_, i) => ({ dia: H, previsto_entrada: i === 0 ? 4000 : 0, previsto_saida: i === 0 ? 500 : 0, realizado_entrada: 0, realizado_saida: 0, saldo_previsto: 1300 + (i === 0 ? 3500 : 0), saldo_realizado: 1300, vencido_receber: 0, vencido_pagar: 0 })),
    fin_dre: () => [{ categoria_id: "k2", codigo: "1.1", nome: "Locação de mobiliário", tipo: "entrada", previsto: 3000, realizado: 0 }],
    fin_inadimplencia: () => [],
    fin_baixar: (a) => { const t = banco[a.p_tipo === "receber" ? "fin_receber" : "fin_pagar"].find((x) => x.id === a.p_id); if (a.p_tipo === "receber") { t.recebido += a.p_valor; t.aberto = t.valor - t.recebido; t.status = t.aberto <= 0 ? "recebido" : "parcial"; } return null; },
    fin_aprovar_pagar: (a) => { const t = banco.fin_pagar.find((x) => x.id === a.p_id); t.aprovacao = a.p_aprovar ? "aprovada" : "reprovada"; t.status = a.p_aprovar ? "aprovado" : "pendente"; return null; },
    fin_salvar_config: (a) => { Object.assign(banco.fin_config[0], a.p_dados); banco.fin_receber.filter((r) => r.componente === "montagem").forEach((r) => { r.conta_id = a.p_dados.conta_montagem || null; }); return null; },
    fin_importar_extrato: (a) => { a.p_linhas.forEach((l, i) => banco.fin_extrato.push({ id: "x" + i, empresa_id: "e1", conta_id: a.p_conta, ...l, ignorado: false, baixa_id: null })); return a.p_linhas.length; }
  };
  const cliente = {
    auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }), getUser: async () => ({ data: { user: { id: "u1" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: consulta,
    functions: { invoke: async (n, o) => { window.__rpc.push({ n: "fn:" + n, a: o.body }); return { data: o.body.action === "revelar" ? { valores: { agencia: "1234" } } : { ok: true, id: o.body.conta_id || "n1" }, error: null }; } },
    rpc: (n, a) => ({ then: (ok, erro) => { window.__rpc.push({ n, a }); return Promise.resolve({ data: respostas[n] ? respostas[n](a) : null, error: null }).then(ok, erro); } })
  };
  window.supabase = { createClient: () => cliente };
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide/.test(e.message)) erros.push(e.message); });
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
  await page.goto(BASE + "Modulos/Financeiro/financeiro.html");
  await page.waitForSelector(".fin-cards", { timeout: 15000 });
  const geral = await page.textContent("#finConteudo");
  assert.match(geral, /Saldo nas contas/); assert.match(geral, /Locações Itaú/); assert.match(geral, /Montagem/);
  console.log("ok 1 - visão geral com saldos, divisões e próximos 30 dias");

  await page.click('[data-aba="receber"]');
  await page.waitForSelector(".fin-pedido");
  const ped = await page.textContent(".fin-pedido");
  assert.match(ped, /Pedido 12 · Lis/);
  assert.match(ped, /Locação R\$\s*3\.000,00/); assert.match(ped, /Frete R\$\s*400,00/); assert.match(ped, /Montagem R\$\s*600,00/);
  assert.match(ped, /11\.111\.111\/0001-11/); assert.match(ped, /PIX f•••@x\.com/); assert.ok(!ped.includes("cofre:")); assert.match(ped, /Sem conta/);
  assert.ok(!/As parcelas somam/.test(ped), "sem diferença quando a soma bate");
  console.log("ok 2 - a receber agrupado por pedido, cada divisão com sua conta (CNPJ e PIX)");

  await page.selectOption("#frDiv", "frete");
  assert.strictEqual(await page.locator(".fin-pedido tbody tr").count(), 1);
  await page.selectOption("#frDiv", "");
  console.log("ok 3 - filtro por divisão");

  await page.click('[data-r-baixar="r1"]');
  await page.waitForSelector("#finModal[open]");
  await page.fill('[name="valor"]', "1000");
  await page.click('#finModalRodape [data-bt="1"]');
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "fin_baixar" && r.a.p_valor === 1000 && r.a.p_conta === "c1"));
  await page.waitForFunction(() => !document.getElementById("finModal").open);
  console.log("ok 4 - baixa parcial na conta da locação");

  await page.click('[data-aba="contas"]');
  await page.waitForSelector("[data-cfg=conta_montagem]");
  await page.selectOption("[data-cfg=conta_montagem]", "c2");
  await page.click("#fcSalvarCfg");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "fin_salvar_config" && r.a.p_dados.conta_montagem === "c2"));
  await page.click(".fin-modal .fin-x, #alertaOk, .alerta-btn", { timeout: 2000 }).catch(() => {});
  console.log("ok 5 - contas padrão do pedido (locação, frete, montagem) salvas");

  // Conta com dados no cofre: a tela mostra só a máscara; editar não reenvia o campo protegido que não foi mexido
  const cartoes = await page.textContent(".fin-contas-grade");
  assert.ok(!cartoes.includes("cofre:"), "não mostra o texto cifrado");
  assert.ok(cartoes.includes("••••34") && cartoes.includes("f•••@x.com"), cartoes);
  await page.click('[data-c-editar="c2"]');
  await page.waitForSelector('#finModalCorpo [name="agencia"]');
  assert.equal(await page.inputValue('#finModalCorpo [name="agencia"]'), "");
  assert.match(await page.getAttribute('#finModalCorpo [name="pix_chave"]', "placeholder"), /f•••@x.com.*protegido/);
  await page.click('#finModalCorpo .cofre-ver');
  await page.waitForFunction(() => document.querySelector('#finModalCorpo [name="agencia"]').value === "1234");
  await page.fill('#finModalCorpo [name="conta"]', "777-1");
  await page.click('#finModalRodape [data-bt="1"]');
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "fn:financeiro-protegido" && r.a.action === "salvar_conta"));
  const env = await page.evaluate(() => window.__rpc.find((r) => r.n === "fn:financeiro-protegido" && r.a.action === "salvar_conta").a);
  assert.equal(env.conta_id, "c2"); assert.equal(env.conta.conta, "777-1"); assert.equal(env.conta.nome, "Fretes BB");
  assert.ok(!("pix_chave" in env.conta) && !("titular_documento" in env.conta) && !("agencia" in env.conta), JSON.stringify(env.conta));
  assert.ok(!("empresa_id" in env.conta));
  await page.click(".fin-modal .fin-x, #alertaOk, .alerta-btn", { timeout: 2000 }).catch(() => {});
  console.log("ok 5b - dados bancários no cofre: só a máscara na tela, \"Ver\" abre, salvar manda só o que mudou");

  await page.click('[data-aba="pagar"]');
  await page.waitForSelector('[data-p-aprovar="g9"]');
  assert.strictEqual(await page.locator('[data-p-baixar="g9"]').count(), 0, "sem aprovar não aparece Pagar");
  await page.click('[data-p-aprovar="g9"]');
  await page.waitForSelector('[data-p-baixar="g9"]');
  console.log("ok 6 - a pagar com aprovação antes de pagar");

  await page.click('[data-aba="conciliacao"]');
  await page.waitForSelector("#fcArquivo", { state: "attached" });
  const ofx = "<OFX><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>" + hoje.replace(/-/g, "") + "<TRNAMT>2000.00<FITID>abc<MEMO>PIX LIS</STMTTRN></OFX>";
  page.once("dialog", (d) => d.accept());
  await page.setInputFiles("#fcArquivo", { name: "extrato.ofx", mimeType: "text/plain", buffer: Buffer.from(ofx) });
  const conf = page.getByRole("button", { name: "Confirmar", exact: true });
  await conf.click({ timeout: 4000 }).catch(() => {});
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "fin_importar_extrato" && r.a.p_linhas[0].valor === 2000 && r.a.p_linhas[0].fitid === "abc"));
  console.log("ok 7 - extrato OFX lido e importado");

  for (const aba of ["dre", "inadimplencia", "plano"]) { await page.click('[data-aba="' + aba + '"]'); await page.waitForTimeout(300); }
  assert.match(await page.textContent("#finConteudo"), /Locação de mobiliário/);
  console.log("ok 8 - DRE, inadimplência e plano de contas abrem");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-aba="receber"]');
  await page.waitForSelector(".fin-pedido");
  const larg = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(larg <= 392, "sem rolagem lateral no celular: " + larg);
  console.log("ok 9 - celular sem rolagem lateral");
  if (process.env.SHOT) { await page.setViewportSize({ width: 1400, height: 900 }); await page.screenshot({ path: process.env.SHOT, fullPage: true }); }
  assert.deepStrictEqual(erros, [], erros.join("\n"));
  console.log("todos os testes passaram");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
