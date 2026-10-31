// Out/2026 — Financeiro: painel gerencial (aba Gerencial, números em formato de planilha, com os lançamentos de cada
// número) e A receber com a situação do pedido (quanto falta para quitar, em cada parcela).
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
      { id: "y5", empresa_id: "e1", fornecedor_nome: "Papelaria", descricao: "Material", competencia: MA + "-12", vencimento: MA + "-12", valor: 100, pago: 0, aberto: 100, parcela: 1, parcelas: 1, categoria_id: null, status: "aberto" }],
    fornecedores: [], clientes_empresas: [],
    fin_baixas: [{ receber_id: "x1", data: MA + "-08", estornado_em: null }, { receber_id: "x2", data: MA + "-03", estornado_em: null }],
    fin_custos_evento: [{ pedido_id: "p1", categoria: "frete", descricao: "Frete ida", valor: 800, cancelado_em: null, criado_em: MA + "-25" }, { pedido_id: "p1", categoria: "equipe", descricao: "Equipe free", valor: 1200, cancelado_em: null, criado_em: MA + "-25" },
      { pedido_id: "p2", categoria: "frete", descricao: "Frete", valor: 9000, cancelado_em: null, criado_em: MP + "-12" }],
    separacoes_pedidos: [
      { id: "p1", empresa_id: "e1", numero_pedido: "7", cliente_nome: "Lis", tipo_evento: "Casamento", data_evento: MA + "-25", data_entrega: MA + "-24", data_coleta: MA + "-26", local_nome: "Villa Bisutti", valor_total: 10000, status_comercial: "aprovado" },
      { id: "p2", empresa_id: "e1", numero_pedido: "8", cliente_nome: "Ana", tipo_evento: "Festa", data_evento: MP + "-12", valor_total: 8000, status_comercial: "aprovado" }]
  };
  function consulta(t){
    let linhas = (banco[t] || []).slice(), unico = false;
    const q = { select(){ return q; }, order(){ return q; }, not(){ return q; }, limit(){ return q; }, range(){ return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      in(c, vs){ linhas = linhas.filter((l) => vs.map(String).includes(String(l[c]))); return q; },
      single(){ unico = true; return q; }, maybeSingle(){ unico = true; return q; },
      update(p){ q._u = p; return q; },
      then(ok, erro){ if (q._u) linhas.forEach((l) => Object.assign(l, q._u)); return Promise.resolve({ data: unico ? (linhas[0] || null) : linhas, error: null }).then(ok, erro); } };
    return q;
  }
  const respostas = { funcionario_contexto: () => ({ ativo: true, administrador_legado: true }), fin_saldos: () => [{ conta_id: "c1", saldo: 5000 }], fin_fluxo: () => [],
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide/.test(e.message)) erros.push(e.message); });
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); });
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("supabase-js")) return r.fulfill({ contentType: "text/javascript", body: mock });
    if (u.includes("xlsx")) { const f = path.join(raiz, "node_modules/xlsx/dist/xlsx.full.min.js"); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: "text/javascript" }) : r.continue(); }
    if (u.startsWith(BASE)) {
      const f = path.join(raiz, decodeURIComponent(new URL(u).pathname));
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
      return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" });
    }
    return r.abort();
  });
  await page.goto(BASE + "Modulos/Financeiro/financeiro.html?aba=receber");
  await page.waitForSelector(".fin-ped-resumo", { timeout: 15000 });
  // ---- A receber: o pedido 7 tem 10.000, recebidos 7.000, falta 3.000 (vencido 3.000: as duas vencem hoje? não, vencem hoje = não vencido)
  const ped = await page.evaluate(() => {
    const a = [...document.querySelectorAll(".fin-pedido")].find((x) => /Pedido 7/.test(x.textContent));
    return { resumo: a.querySelector(".fin-ped-resumo").textContent.replace(/\s+/g, " "), falta: [...a.querySelectorAll("td.fin-falta")].map((t) => t.textContent.replace(/\s+/g, " ").trim()) };
  });
  assert.match(ped.resumo, /Villa Bisutti/); assert.match(ped.resumo, /Entrega/); assert.match(ped.resumo, /Coleta/);
  assert.match(ped.resumo, /70% pago/); assert.match(ped.resumo, /1 de 3 parcela/); assert.match(ped.resumo, /Falta para quitar R\$\s?3.000,00/);
  assert.ok(ped.falta.length === 2 && ped.falta.every((t) => /R\$\s?3.000,00/.test(t)), "cada parcela em aberto mostra quanto falta no pedido: " + ped.falta);
  assert.ok(ped.falta.some((t) => /depois desta/.test(t)), "e quanto vai faltar depois dela");
  // recebido em: x1 venceu dia 05 e foi pago dia 08 = 3 dias depois
  await page.selectOption("#frStatus", "todos");
  await page.waitForFunction(() => /3 dias depois/.test(document.getElementById("finConteudo").textContent));
  const recEm = await page.evaluate(() => [...document.querySelectorAll("td.fin-receb-em")].map((t) => t.textContent.trim()));
  assert.ok(recEm.some((t) => t.includes("3 dias depois") && t.includes("/")), JSON.stringify(recEm));
  await page.selectOption("#frStatus", "abertos");
  console.log("ok 1 - A receber: situação do pedido e falta em cada parcela");
  await page.click("#frModo");
  await page.waitForSelector(".fin-receber-data td.fin-falta");
  const linhaData = await page.textContent(".fin-receber-data tbody tr");
  assert.match(linhaData, /Villa Bisutti/); assert.match(linhaData, /R\$\s?3.000,00/);
  await page.click("#frModo");
  console.log("ok 2 - por data: dados do pedido e falta no pedido");

  // ---- Gerencial
  await page.click('#finAbas [data-aba="gerencial"]');
  await page.waitForSelector(".gr-dre:not(.gr-pe)");
  const txt = await page.textContent(".gr");
  assert.match(txt, /Saúde financeira/); assert.match(txt, /Posição de hoje/); assert.match(txt, /Demonstrativo de resultado mês a mês/); assert.match(txt, /Onde está o gasto/);
  const lin = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll(".gr-dre:not(.gr-pe) tbody tr").forEach((tr) => { const th = tr.querySelector("th").textContent.replace(/[▸▾]/g, "").trim(); out[th] = [...tr.querySelectorAll("td")].map((t) => t.textContent.trim()); });
    return out;
  });
  const col = M - 1; // Jan..Dez na ordem
  assert.equal(lin["RECEITA BRUTA"][col], (M === 1 ? "18.000,00" : "10.000,00"));
  assert.equal(lin["(−) IMPOSTOS"][col], M === 1 ? "(2.000,00)" : "(1.200,00)");
  assert.equal(lin["(=) RECEITA LÍQUIDA"][col], M === 1 ? "16.000,00" : "8.800,00");
  assert.equal(lin["(=) RESULTADO"][col], M === 1 ? "12.500,00" : "5.300,00", "10.000 − 1.200 − 900 − 2.500 − 100");
  // ponto de equilíbrio: variáveis = impostos 1.200 + fretes 900; fixos = aluguel 2.500 + sem categoria 100
  const pe = await page.evaluate(() => { const sec = [...document.querySelectorAll(".gr-bloco")].find((x) => /Ponto de equilíbrio/.test(x.querySelector("h3").textContent)); const o = {}; sec.querySelectorAll("tbody tr").forEach((tr) => { o[tr.querySelector("th").textContent.trim()] = [...tr.querySelectorAll("td")].map((t) => t.textContent.trim()); }); return { o, frase: sec.querySelector(".gr-frase")?.textContent || "" }; });
  if (M > 1) {
    assert.equal(pe.o["(−) Custos variáveis"][col], "(2.100,00)"); assert.equal(pe.o["(−) Custos fixos"][col], "(2.600,00)");
    assert.equal(pe.o["Ponto de equilíbrio (faturamento necessário)"][col], "3.291,14", "2.600 / 79%");
    assert.equal(pe.o["Faturamento acima (abaixo) do ponto"][col], "6.708,86");
    assert.ok(pe.frase.includes("precisava faturar R$ 3.291,14"), pe.frase);
    assert.ok((await page.textContent(".gr-bloco")).includes("Ponto de equilíbrio (faturamento necessário)"), "também na saúde financeira");
  }
  console.log("ok 3b - ponto de equilíbrio");
  // lucro por evento: pedido 7 = 10.000 − 2.000 = 8.000; pedido 8 = 8.000 − 9.000 = prejuízo
  const ev = await page.evaluate(() => { const t = document.querySelector(".gr-ev"); return [...t.querySelectorAll("tbody tr")].map((tr) => ({ txt: tr.textContent.replace(/s+/g, " "), alerta: tr.classList.contains("alerta") })); });
  assert.ok(ev.some((r) => /Pedido 7/.test(r.txt) && /8.000,00/.test(r.txt) && /80,0%/.test(r.txt)), JSON.stringify(ev));
  assert.ok(ev.some((r) => /Pedido 8/.test(r.txt) && r.alerta && r.txt.includes("(1.000,00)")), "evento com prejuízo destacado");
  { const th = await page.textContent(".gr-ev thead"); assert.ok(th.includes("Frete") && th.includes("Equipe")); }
  await page.click(".gr-ev [data-gr-ver=\"ev:p1\"]");
  await page.waitForSelector("#finModal[open]");
  const evm = await page.textContent("#finModal"); assert.match(evm, /Frete ida/); assert.match(evm, /Equipe free/); assert.match(evm, /Lucro/);
  await page.click("#finModalRodape button:has-text(\"Fechar\")");
  await page.click("[data-gr-evordem=margem]"); await page.waitForFunction(() => /Pedido 8/.test(document.querySelector(".gr-ev tbody tr").textContent));
  console.log("ok 3c - lucro por evento");
  console.log("ok 3 - DRE gerencial mês a mês com receita líquida, margem e resultado");
  // grupo fechado mostra só o total; abrir mostra as categorias
  assert.ok(!lin["4.2 Aluguel e utilidades"], "grupo começa fechado");
  await page.click('button[data-gr-abrir="*"]');
  await page.waitForFunction(() => /Aluguel e utilidades/.test(document.querySelector(".gr-dre:not(.gr-pe)").textContent));
  console.log("ok 4 - abrir grupos");
  // clicar nos impostos do mês abre os lançamentos
  await page.click('.gr-dre:not(.gr-pe) tr.grupo:has(th:text-matches("IMPOSTOS")) td >> nth=' + col + ' >> button');
  await page.waitForSelector(".gr-detalhe");
  const det = await page.textContent("#finModal");
  assert.match(det, /Simples Nacional/); assert.match(det, /Receita Federal/); assert.match(det, /1 lançamento/);
  assert.ok(await page.evaluate(() => document.getElementById("finModal").classList.contains("gr-modal-largo")));
  // exportar a lista
  const xlsxOk = true;
  if (xlsxOk) {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click('#finModalRodape button:has-text("Exportar para Excel")')]);
    assert.match(dl.suggestedFilename(), /\.xlsx$/);
  }
  await page.click('#finModalRodape button:has-text("Fechar")');
  console.log("ok 5 - impostos do mês abrem os lançamentos" + (xlsxOk ? " e exportam para Excel" : ""));
  // posição de hoje
  const pos = await page.textContent(".gr-pos");
  assert.match(pos, /5\.000,00/); assert.match(pos, /3.000,00/);
  // sem categoria aparece em linha própria
  assert.match(await page.textContent(".gr-dre:not(.gr-pe)"), /SEM CATEGORIA/);
  if (xlsxOk) { const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#grExcel")]); assert.match(dl.suggestedFilename(), /Painel gerencial/); }
  // base realizado: frete a receber (0 recebido) some
  await page.click('[data-gr-base="realizado"]');
  await page.waitForFunction(() => document.querySelector('[data-gr-base="realizado"]').classList.contains("ativa"));
  const lin2 = await page.evaluate((c) => [...document.querySelectorAll(".gr-dre:not(.gr-pe) tbody tr")].find((tr) => /RECEITA BRUTA/.test(tr.textContent)).querySelectorAll("td")[c].textContent.trim(), col);
  assert.equal(lin2, M === 1 ? "15.000,00" : "7.000,00");
  console.log("ok 6 - posição de hoje, sem categoria, exportar tudo e realizado");
  // sub-abas do Gerencial: Painel + Lançar custos dos eventos (a antiga aba Resultados)
  assert.equal(await page.locator("#finAbas [data-aba=resultados]").count(), 0, "Resultados não é mais aba própria");
  await page.click("#finSubAbas [data-subaba=resultados]");
  await page.waitForFunction(() => /Resultado por evento e por móvel/.test(document.getElementById("finConteudo").textContent));
  assert.ok(await page.evaluate(() => document.querySelector("#finAbas [data-aba=gerencial]").classList.contains("ativa")));
  await page.click("#finSubAbas [data-subaba=gerencial]"); await page.waitForSelector(".gr-pe");
  // plano de contas: fixo ou variável
  await page.click("[data-gr-plano]"); await page.waitForSelector("[data-cat-nat]");
  const nat = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-cat-nat]")].map((s) => [s.closest("tr").querySelector("td").textContent.replace("automática", "").trim(), s.selectedOptions[0].textContent])));
  assert.equal(nat["3 Impostos"], "Automático (variável)"); assert.equal(nat["4.2 Aluguel e utilidades"], "Automático (fixo)"); assert.equal(nat["2.1 Fretes e transporte"], "Automático (variável)");
  await page.selectOption("[data-cat-nat=a2]", "variavel");
  await page.waitForFunction(() => document.querySelector("[data-cat-nat=a2]") && document.querySelector("[data-cat-nat=a2]").value === "variavel");
  await page.click("#finAbas [data-aba=gerencial]"); await page.waitForSelector(".gr-pe");
  await page.click("[data-gr-base=lancado]"); await page.waitForFunction(() => document.querySelector("[data-gr-base=lancado]").classList.contains("ativa"));
  const fixosAgora = await page.evaluate((c) => [...document.querySelectorAll(".gr-pe tbody tr")].find((tr) => /Custos fixos/.test(tr.textContent)).querySelectorAll("td")[c].textContent.trim(), col);
  assert.equal(fixosAgora, M > 1 ? "(100,00)" : fixosAgora, "aluguel passou a variável");
  console.log("ok 7 - sub-aba de custos dos eventos e fixo/variável no plano de contas");
  if (process.env.SP) { await page.screenshot({ path: process.env.SP + "/gerencial.png", fullPage: true }); }
  assert.deepStrictEqual(erros, []);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
