// Nov/2026 — cartões de crédito no Financeiro (trazido da Tecnoweld).
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const d = new Date(), ANO = d.getFullYear(), M = d.getMonth() + 1;
const mm = (m) => ANO + "-" + String(m).padStart(2, "0");
const HOJE = d.toLocaleDateString("sv-SE");
const mesAnt = M > 1 ? M - 1 : 1;
const mock = `(() => {
  window.__rpc = [];
  const H = "${HOJE}", MA = "${mm(M)}", MP = "${mm(mesAnt)}";
  const cat = (id, codigo, nome, tipo, pai, chave, ordem) => ({ id, empresa_id: "e1", codigo, nome, tipo, pai_id: pai, chave, ativo: true, ordem });
  const banco = {
    fin_contas: [{ id: "c1", empresa_id: "e1", nome: "Itaú", tipo: "corrente", ativo: true }],
    fin_config: [{ empresa_id: "e1" }],
    fin_categorias: [
      cat("r", "1", "Receitas", "entrada", null, null, 1), cat("r1", "1.1", "Locação de mobiliário", "entrada", "r", "locacao", 2), cat("r2", "1.2", "Frete cobrado do cliente", "entrada", "r", "frete", 3),
      cat("c", "2", "Custos da operação", "saida", null, null, 4), cat("c1", "2.1", "Fretes e transporte", "saida", "c", "fretes", 5), cat("c2", "2.2", "Montadores e equipe free", "saida", "c", "equipe_free", 6),
      cat("i", "3", "Impostos", "saida", null, "impostos", 7),
      cat("a", "4", "Despesas administrativas", "saida", null, null, 8), cat("a1", "4.1", "Folha e encargos", "saida", "a", "folha", 9), cat("a2", "4.2", "Aluguel e utilidades", "saida", "a", "aluguel", 10)],
    fin_centros_custo: [{ id: "cc1", empresa_id: "e1", nome: "Operação", ativo: true }],
    fin_receber: [
      { id: "x1", empresa_id: "e1", origem: "pedido", grupo: "g1", pedido_id: "p1", pedido_numero: "7", componente: "locacao", cliente_nome: "Lis", descricao: "Pedido 7 · Locação", competencia: MA + "-05", vencimento: MA + "-05", valor: 6000, recebido: 6000, aberto: 0, parcela: 1, parcelas: 2, categoria_id: "r1", status: "recebido" },
      { id: "x2", empresa_id: "e1", origem: "pedido", grupo: "g1", pedido_id: "p1", pedido_numero: "7", componente: "locacao", cliente_nome: "Lis", descricao: "Pedido 7 · Locação", competencia: MA + "-20", vencimento: H, valor: 3000, recebido: 1000, aberto: 2000, parcela: 2, parcelas: 2, categoria_id: "r1", status: "parcial" },
      { id: "x3", empresa_id: "e1", origem: "pedido", grupo: "g1", pedido_id: "p1", pedido_numero: "7", componente: "frete", cliente_nome: "Lis", descricao: "Pedido 7 · Frete", competencia: MA + "-20", vencimento: H, valor: 1000, recebido: 0, aberto: 1000, parcela: 1, parcelas: 1, categoria_id: "r2", status: "aberto" },
      { id: "x4", empresa_id: "e1", origem: "pedido", grupo: "g2", pedido_id: "p2", pedido_numero: "8", componente: "locacao", cliente_nome: "Ana", descricao: "Pedido 8 · Locação", competencia: MP + "-10", vencimento: MP + "-10", valor: 8000, recebido: 8000, aberto: 0, parcela: 1, parcelas: 1, categoria_id: "r1", status: "recebido" }],
    fin_pagar: [
      { id: "y1", empresa_id: "e1", fornecedor_nome: "Receita Federal", descricao: "Simples Nacional", competencia: MA + "-20", vencimento: MA + "-20", valor: 1200, pago: 1200, aberto: 0, parcela: 1, parcelas: 1, categoria_id: "i", status: "pago" },
      { id: "y2", empresa_id: "e1", fornecedor_nome: "Receita Federal", descricao: "Simples Nacional", competencia: MP + "-20", vencimento: MP + "-20", valor: 800, pago: 800, aberto: 0, parcela: 1, parcelas: 1, categoria_id: "i", status: "pago" },
      { id: "y3", empresa_id: "e1", fornecedor_nome: "Transp X", descricao: "Fretes", competencia: MA + "-15", vencimento: MA + "-15", valor: 900, pago: 0, aberto: 900, parcela: 1, parcelas: 1, categoria_id: "c1", status: "aberto" },
      { id: "y4", empresa_id: "e1", fornecedor_nome: "Imobiliária", descricao: "Aluguel", competencia: MA + "-10", vencimento: MA + "-10", valor: 2500, pago: 2500, aberto: 0, parcela: 1, parcelas: 1, categoria_id: "a2", status: "pago" },
      { id: "y6", empresa_id: "e1", fornecedor_nome: "Posto", descricao: "Combustível", emissao: "2026-11-10", vencimento: "2026-12-15", valor: 300, pago: 0, aberto: 300, parcela: 1, parcelas: 1, categoria_id: "c1", status: "aberto", cartao_id: "k1", cartao_compra_em: "2026-11-10", fatura_id: "f1" },
      { id: "y7", empresa_id: "e1", fornecedor_nome: "Loja X", descricao: "Ferramentas", emissao: "2026-11-11", vencimento: "2026-12-15", valor: 200, pago: 0, aberto: 200, parcela: 1, parcelas: 1, categoria_id: "a2", status: "aberto", cartao_id: "k1", cartao_compra_em: "2026-11-11", fatura_id: "f1" },
      { id: "y5", empresa_id: "e1", fornecedor_nome: "Papelaria", descricao: "Material", competencia: MA + "-12", vencimento: MA + "-12", valor: 100, pago: 0, aberto: 100, parcela: 1, parcelas: 1, categoria_id: null, status: "aberto" }],
    fornecedores: [], clientes_empresas: [],
    fin_cartoes: [{ id: "k1", empresa_id: "e1", nome: "Itaú Empresas", final: "1234", dia_virada: 5, dia_vencimento: 15, conta_id: "c1", ativo: true }],
    fin_cartao_faturas: [{ id: "f1", empresa_id: "e1", cartao_id: "k1", vencimento: "2026-12-15", virada: "2026-12-05" }],
    fin_baixas: [{ receber_id: "x1", data: MA + "-08", estornado_em: null }, { receber_id: "x2", data: MA + "-03", estornado_em: null }],
    fin_custos_evento: [{ pedido_id: "p1", categoria: "frete", descricao: "Frete ida", valor: 800, cancelado_em: null, criado_em: MA + "-25" }, { pedido_id: "p1", categoria: "equipe", descricao: "Equipe free", valor: 1200, cancelado_em: null, criado_em: MA + "-25" },
      { pedido_id: "p2", categoria: "frete", descricao: "Frete", valor: 9000, cancelado_em: null, criado_em: MP + "-12" }],
    separacoes_pedidos: [
      { id: "p1", empresa_id: "e1", numero_pedido: "7", cliente_nome: "Lis", tipo_evento: "Casamento", data_evento: MA + "-25", data_entrega: MA + "-24", data_coleta: MA + "-26", local_nome: "Villa Bisutti", valor_total: 10000, status_comercial: "aprovado" },
      { id: "p2", empresa_id: "e1", numero_pedido: "8", cliente_nome: "Ana", tipo_evento: "Festa", data_evento: MP + "-12", valor_total: 8000, status_comercial: "aprovado" }]
  };
  function consulta(t){
    let linhas = (banco[t] || []).slice(), unico = false;
    const q = { select(){ return q; }, order(){ return q; }, gte(){ return q; }, lte(){ return q; }, is(){ return q; }, not(){ return q; }, limit(){ return q; }, range(){ return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      in(c, vs){ linhas = linhas.filter((l) => vs.map(String).includes(String(l[c]))); return q; },
      single(){ unico = true; return q; }, maybeSingle(){ unico = true; return q; },
      update(p){ q._u = p; return q; },
      then(ok, erro){ if (q._u) linhas.forEach((l) => Object.assign(l, q._u)); return Promise.resolve({ data: unico ? (linhas[0] || null) : linhas, error: null }).then(ok, erro); } };
    return q;
  }
  const respostas = { funcionario_contexto: () => ({ ativo: true, administrador_legado: true }), fin_saldos: () => [{ conta_id: "c1", saldo: 5000 }], fin_fluxo: () => [], fin_bancos_resumo: () => [{ conta_id: "c1", saldo: 5000, pendentes: 0 }], fin_bancos_extrato: () => ({ contas: [], linhas: [] }),
    fin_cartao_faturas: () => [{ id: "f1", vencimento: "2026-12-15", virada: "2026-12-05", total: 500, aberto: 500, pago: 0, qtd: 2, linhas: 2, linhas_pendentes: 1, situacao: "aberta", atual: true }],
    fin_cartao_fatura_detalhe: () => ({ fatura: { id: "f1", cartao_id: "k1", vencimento: "2026-12-15", virada: "2026-12-05", valor_banco: 545, arquivo_nome: "fatura.csv" }, outras: [],
      parcelas: [{ id: "y6", fornecedor: "Posto", descricao: "Combustível", compra: "2026-11-10", parcela: 1, parcelas: 1, valor: 300, aberto: 300, pago: 0, status: "aberto", linha_id: "l1" }, { id: "y7", fornecedor: "Loja X", descricao: "Ferramentas", compra: "2026-11-11", parcela: 1, parcelas: 1, valor: 200, aberto: 200, pago: 0, status: "aberto", linha_id: null }],
      linhas: [{ id: "l1", data: "2026-11-10", descricao: "POSTO SHELL", valor: 300, situacao: "conferida", titulo_id: "y6", titulo_fatura_id: "f1" }, { id: "l2", data: "2026-11-20", descricao: "ANUIDADE", valor: 45, situacao: "pendente", sugestao: { tipo: "lancar", categoria_id: "a2", descricao: "Anuidade do cartão", confianca: "alta", motivo: "É anuidade." } }] }),
    fin_cartao_linha_acao: (a) => { window.__acoes = (window.__acoes || []).concat([a]); return { ok: true }; },
    fin_resultado_eventos: () => ({ eventos: [
      { id: "p1", numero_pedido: "7", cliente_nome: "Lis", data_evento: MA + "-25", valor_total: 10000, credito: 0, reposicao: 0, recebido: 7000, em_aberto: 3000, custos_revisados: true },
      { id: "p2", numero_pedido: "8", cliente_nome: "Ana", data_evento: MP + "-12", valor_total: 8000, credito: 0, reposicao: 0, recebido: 8000, em_aberto: 0, custos_revisados: false }], itens: [] }) };
  const cliente = {
    auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }), getUser: async () => ({ data: { user: { id: "u1" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: consulta, functions: { invoke: async () => ({ data: null, error: null }) },
    rpc: (n, a) => ({ then: (ok, erro) => Promise.resolve({ data: respostas[n] ? respostas[n](a) : null, error: null }).then(ok, erro) })
  };
  window.supabase = { createClient: () => cliente };
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide/.test(e.message)) erros.push(e.message); });
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); });
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("supabase-js")) return r.fulfill({ contentType: "text/javascript", body: mock });
    if (u.startsWith(BASE)) { const f = path.join(raiz, decodeURIComponent(new URL(u).pathname)); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
      return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" }); }
    return r.abort();
  });
  // A pagar: as duas compras no cartão viram UMA linha da fatura
  await page.goto(BASE + "Modulos/Financeiro/financeiro.html?aba=pagar");
  await page.waitForSelector("[data-fat-linha]", { timeout: 15000 });
  assert.equal(await page.locator("[data-fat-linha]").count(), 1);
  assert.equal(await page.locator('[data-p-linha="y6"]').count(), 0, "compra do cartão não aparece solta");
  await page.click("[data-fat-linha]");
  const comp = await page.textContent(".fin-fech-comp"); assert.match(comp, /Posto/); assert.match(comp, /Loja X/); assert.match(comp, /500,00/);
  console.log("ok 1 - A pagar: uma linha por fatura, abre as compras");
  // Novo pagamento no cartão: vencimento pela fatura
  await page.click("#fpNovo"); await page.waitForSelector("#finModal[open]");
  await page.selectOption('#finModal [name="forma"]', "Cartão de crédito");
  await page.selectOption('#finModal [name="cartao_id"]', "k1");
  await page.fill('#finModal [name="cartao_compra_em"]', "2026-11-10");
  await page.fill('#finModal [name="valor"]', "100"); await page.fill('#finModal [name="parcelas"]', "2");
  await page.dispatchEvent('#finModal [name="parcelas"]', "input");
  const prev = await page.textContent("#finParcelasPrev"); assert.match(prev, /15\/12\/2026/); assert.match(prev, /15\/01\/2027/);
  await page.keyboard.press("Escape");
  console.log("ok 2 - novo pagamento no cartão: parcelas nas faturas certas");
  // Bancos -> Cartões
  await page.goto(BASE + "Modulos/Financeiro/financeiro.html?aba=bancos");
  await page.waitForSelector("[data-bk-modo=cartoes]", { timeout: 15000 });
  await page.click("[data-bk-modo=cartoes]");
  await page.waitForSelector("[data-cc-fat]");
  const t = await page.textContent("#bkMain"); assert.match(t, /ANUIDADE/); assert.match(t, /Diferença de/);
  await page.click("[data-cc-confirmar]").catch(async () => { await page.click("[data-cc-sel]"); await page.click("[data-cc-confirmar]"); });
  await page.waitForFunction(() => (window.__acoes || []).length > 0);
  const a = await page.evaluate(() => window.__acoes[0]); assert.equal(a.p_acao.tipo, "lancar"); assert.equal(a.p_linha, "l2");
  console.log("ok 3 - Cartões: fatura com a linha do banco e confirmar lança a anuidade");
  await page.click("[data-cc-config]"); await page.waitForSelector(".cc-tabela"); assert.match(await page.textContent(".cc-tabela"), /Itaú Empresas/);
  console.log("ok 4 - configurar cartões");
  assert.deepEqual(erros, []);
  console.log("financeiro-cartoes-browser: ok");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
