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
      { id: "cx", empresa_id: "e1", nome: "Caixa", tipo: "caixa", ativo: true, saldo_inicial: 0, saldo_minimo: 0 },
      { id: "c2", empresa_id: "e1", nome: "Fretes BB", tipo: "corrente", agencia: "cofre:v1:aa:bb", conta: "cofre:v1:cc:dd", titular_documento: "cofre:v1:ee:ff", pix_chave: "cofre:v1:gg:hh", ativo: true, saldo_inicial: 0, saldo_minimo: 0,
        cofre_mascaras: { agencia: "••••34", conta: "••••90", titular_documento: "••••22", pix_chave: "f•••@x.com" } }],
    fin_config: [{ empresa_id: "e1", conta_locacao: "c1", conta_frete: "c2", conta_montagem: null, conta_gateway: null }],
    fin_categorias: [{ id: "k1", empresa_id: "e1", codigo: "1", nome: "Receitas", tipo: "entrada", ativo: true, ordem: 1 }, { id: "k2", empresa_id: "e1", codigo: "1.1", nome: "Locação de mobiliário", tipo: "entrada", pai_id: "k1", chave: "locacao", ativo: true, ordem: 2 },
      { id: "k3", empresa_id: "e1", codigo: "2", nome: "Despesas", tipo: "saida", ativo: true, ordem: 3 }],
    fin_centros_custo: [{ id: "cc1", empresa_id: "e1", nome: "Operação", ativo: true }],
    fin_receber: [
      { id: "r1", empresa_id: "e1", origem: "pedido", grupo: "g1", pedido_id: "p1", pedido_numero: "12", componente: "locacao", cliente_nome: "Lis", descricao: "Pedido 12 · Locação", vencimento: H, valor: 3000, recebido: 0, aberto: 3000, parcela: 1, parcelas: 1, conta_id: "c1", status: "aberto" },
      { id: "r2", empresa_id: "e1", origem: "pedido", grupo: "g1", pedido_id: "p1", pedido_numero: "12", componente: "frete", cliente_nome: "Lis", descricao: "Pedido 12 · Frete", vencimento: new Date(Date.now() + 5 * 864e5).toLocaleDateString("sv-SE"), valor: 400, recebido: 0, aberto: 400, parcela: 1, parcelas: 1, conta_id: "c2", status: "aberto" },
      { id: "r3", empresa_id: "e1", origem: "pedido", grupo: "g1", pedido_id: "p1", pedido_numero: "12", componente: "montagem", cliente_nome: "Lis", descricao: "Pedido 12 · Montagem", vencimento: H, valor: 600, recebido: 0, aberto: 600, parcela: 1, parcelas: 1, conta_id: null, status: "aberto" },
      { id: "r9", empresa_id: "e1", origem: "manual", grupo: "g9", pedido_id: null, pedido_numero: null, componente: "outro", cliente_nome: "Ana Recebida", descricao: "Sinal recebido", vencimento: H, valor: 250, recebido: 250, aberto: 0, parcela: 1, parcelas: 1, conta_id: null, status: "recebido" }],
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
    fin_fluxo: () => Array.from({ length: 31 }, (_, i) => ({ dia: new Date(Date.parse(H + "T12:00:00Z") + i * 864e5).toISOString().slice(0, 10), previsto_entrada: i === 0 ? 4000 : 0, previsto_saida: i === 0 ? 500 : 0, realizado_entrada: 0, realizado_saida: 0, saldo_previsto: 1300 + (i === 0 ? 3500 : 0), saldo_realizado: 1300, vencido_receber: 0, vencido_pagar: 0 })),
    fin_dre: () => [{ categoria_id: "k2", codigo: "1.1", nome: "Locação de mobiliário", tipo: "entrada", previsto: 3000, realizado: 0 }],
    fin_inadimplencia: () => [],
    fin_baixar: (a) => { const t = banco[a.p_tipo === "receber" ? "fin_receber" : "fin_pagar"].find((x) => x.id === a.p_id); if (a.p_tipo === "receber") { t.recebido += a.p_valor; t.aberto = t.valor - t.recebido; t.status = t.aberto <= 0 ? "recebido" : "parcial"; } return null; },
    fin_aprovar_pagar: (a) => { const t = banco.fin_pagar.find((x) => x.id === a.p_id); t.aprovacao = a.p_aprovar ? "aprovada" : "reprovada"; t.status = a.p_aprovar ? "aprovado" : "pendente"; return null; },
    fin_salvar_config: (a) => { Object.assign(banco.fin_config[0], a.p_dados); banco.fin_receber.filter((r) => r.componente === "montagem").forEach((r) => { r.conta_id = a.p_dados.conta_montagem || null; }); return null; },
    fin_importar_extrato_lote: (a) => { a.p_linhas.forEach((l, i) => banco.fin_extrato.push({ id: "x" + i, empresa_id: "e1", conta_id: a.p_conta, ...l, ignorado: false, baixa_id: null, sugestao: null })); return { novas: a.p_linhas.length, total: a.p_linhas.length }; },
    fin_assist_aplicar: (a) => { const l = banco.fin_extrato.find((x) => x.id === a.p_extrato); l.baixa_id = "b1"; l.conciliado_em = "agora"; return { ok: true }; },
    fin_saldo_em: () => 0,
    fin_bancos_resumo: () => [{ conta_id: "c1", saldo: 1500, pendentes: 0 }],
    fin_bancos_extrato: () => ({ contas: [], linhas: [], pendentes: 0 })
  };
  const cliente = {
    auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }), getUser: async () => ({ data: { user: { id: "u1" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: consulta,
    functions: { invoke: async (n, o) => {
      window.__rpc.push({ n: "fn:" + n, a: o.body });
      if (n === "financeiro-assistente" && o.body.action === "ler_extrato") return { data: { formato: "ofx", banco: "", modelo_novo: false, arquivo: o.body.arquivo.nome, linhas: o.body.arquivo.linhas.map((l) => ({ ...l, fitid: "ofx-" + l.fitid })), resumo: {} }, error: null };
      if (n === "financeiro-assistente" && o.body.action === "organizar") { banco.fin_extrato.forEach((l) => { l.sugestao = { acao: { tipo: "lancar", categoria_id: "" }, confianca: "alta", resumo: "Lançar · Outras receitas", motivo: "PIX sem título." }; }); return { data: { total: banco.fin_extrato.length, restantes: 0 }, error: null }; }
      return { data: o.body.action === "revelar" ? { valores: { agencia: "1234" } } : { ok: true, id: o.body.conta_id || "n1" }, error: null };
    } },
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
  await page.waitForSelector(".fin-geral-2col", { timeout: 15000 });
  const geral = await page.textContent("#finConteudo");
  assert.doesNotMatch(geral, /Saldo nas contas|A pagar em aberto|Pagamentos vencidos/, "sem os cartões de totais"); assert.match(geral, /Locações Itaú/); assert.match(geral, /Montagem/);
  const col = await page.evaluate(() => { const c = document.querySelector(".fin-geral-cal").getBoundingClientRect(), l = document.querySelector(".fin-geral-lado").getBoundingClientRect(); return { ladoALado: l.left > c.right - 1 && Math.abs(l.top - c.top) < 2, blocosNoLado: document.querySelectorAll(".fin-geral-lado > .fin-bloco").length }; });
  assert.deepStrictEqual(col, { ladoALado: true, blocosNoLado: 2 }, "calendário de um lado, os 2 blocos do outro");
  console.log("ok 1 - visão geral com saldos, divisões e próximos 30 dias");
  // Calendário financeiro em destaque: mês inteiro, hoje com E/S/Saldo e cor pelo saldo; passar o mouse abre o detalhe.
  await page.waitForSelector("#finCalDias [data-dia]");
  const hojeCal = new Date().toISOString().slice(0, 10);
  const dia = page.locator('#finCalDias [data-dia="' + hojeCal + '"]');
  assert.match(await dia.innerText(), /E: 4 mil[\s\S]*S: 500[\s\S]*Saldo: 4,8 mil/);
  assert.ok(await dia.evaluate((el) => el.classList.contains("positivo") && el.classList.contains("hoje")), "hoje em verde (saldo positivo)");
  const dias = await page.locator("#finCalDias [data-dia]").count();
  assert.equal(dias, Number(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()), "um quadro por dia do mês");
  await dia.hover(); await page.waitForSelector("#finCalDetalhe:not([hidden])");
  assert.match(await page.textContent("#finCalDetalhe"), /Entradas do dia[\s\S]*Saídas do dia/);
  const mesAtual = await page.textContent("#finCalMes");
  await page.click('[data-cal="1"]'); await page.waitForFunction((m) => document.getElementById("finCalMes").textContent !== m, mesAtual);
  await page.click('[data-cal="hoje"]'); await page.waitForFunction((m) => document.getElementById("finCalMes").textContent === m, mesAtual);
  // Valores em reais: verde se positivo, vermelho se negativo, no Financeiro inteiro.
  await page.waitForTimeout(200);
  const cores = await page.evaluate(() => [...document.querySelectorAll(".fin-geral-lado td b")].map((b) => [b.textContent.trim(), getComputedStyle(b).color]));
  const neg = cores.find(([t]) => /-R\$/.test(t)), pos = cores.find(([t]) => !/-/.test(t) && /[1-9]/.test(t));
  assert.ok(neg && neg[1] === "rgb(180, 35, 24)", "negativo em vermelho: " + JSON.stringify(cores));
  assert.ok(pos && pos[1] === "rgb(31, 122, 68)", "positivo em verde: " + JSON.stringify(cores));
  console.log("ok 1b - calendário financeiro em destaque na visão geral (E/S/saldo por dia, detalhe ao passar o mouse, troca de mês)");

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
  // Botão ao lado de "+ Novo recebimento": troca o agrupado por pedido por "por data" (cada parcela numa linha).
  const modo = page.locator("#frModo");
  assert.ok(await modo.isVisible(), "botão de trocar a visão ao lado de Novo recebimento");
  const vizinho = await page.evaluate(() => document.getElementById("frModo").nextElementSibling?.id);
  assert.strictEqual(vizinho, "frRecebidas");
  await modo.click();
  await page.waitForSelector(".fin-receber-data");
  assert.strictEqual(await page.locator(".fin-pedido:not(.fin-receber-data)").count(), 0, "não agrupa mais por pedido");
  const linhasData = await page.$$eval(".fin-receber-data tbody tr", (l) => l.map((tr) => tr.children[0].querySelector("b").textContent));
  assert.strictEqual(linhasData.length, 3, "uma linha por parcela");
  assert.deepStrictEqual(linhasData, linhasData.slice().sort((x, y) => x.split("/").reverse().join("").localeCompare(y.split("/").reverse().join(""))), "em ordem de vencimento");
  assert.match(await page.textContent(".fin-receber-data tbody tr"), /Pedido 12 · Lis/);
  assert.strictEqual(await modo.getAttribute("aria-pressed"), "true");
  await page.selectOption("#frDiv", "frete");
  assert.strictEqual(await page.locator(".fin-receber-data tbody tr").count(), 1, "filtro vale na visão por data");
  await page.selectOption("#frDiv", "");
  await page.click("#frModo");
  await page.waitForSelector(".fin-pedido:not(.fin-receber-data)");
  console.log("ok 3b - a receber por data (cada parcela numa linha) e volta para agrupado por pedido");
  // "Recebidas", ao lado do ícone: mostra só o que já foi recebido; clicar de novo volta para em aberto.
  assert.strictEqual(await page.evaluate(() => document.getElementById("frRecebidas").previousElementSibling?.id), "frModo", "Recebidas ao lado do ícone");
  assert.ok(!(await page.textContent("#finConteudo")).includes("Ana Recebida"), "em aberto não mostra o que já foi recebido");
  await page.click("#frRecebidas");
  await page.waitForFunction(() => document.getElementById("frRecebidas")?.getAttribute("aria-pressed") === "true");
  const rec = await page.textContent("#finConteudo");
  assert.ok(rec.includes("Ana Recebida") && !rec.includes("Pedido 12 · Lis"), "só as recebidas");
  assert.strictEqual(await page.inputValue("#frStatus"), "recebidos");
  await page.click("#frRecebidas");
  await page.waitForFunction(() => document.getElementById("frRecebidas")?.getAttribute("aria-pressed") === "false");
  assert.strictEqual(await page.inputValue("#frStatus"), "abertos");
  console.log("ok 3c - botão Recebidas mostra só as contas recebidas e volta");
  // aviso de vencimento: limites de 3 e 7 dias, passado e título sem saldo
  const fonte = fs.readFileSync(path.join(raiz, "Modulos/Financeiro/financeiro.js"), "utf8").replace(/\r\n/g, "\n");
  const ini = fonte.indexOf("  function diasParaVencer(t) {"), corpo = fonte.slice(ini, fonte.indexOf("  function statusR(t) {"));
  const alertaVenc = new Function(corpo + "; return alertaVenc;")();
  const emDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };
  const aviso = (n, extra = {}) => { const h = alertaVenc({ status: "aberto", aberto: 100, vencimento: emDias(n), ...extra }); return h ? [/vermelho/.test(h) ? "vermelho" : "amarelo", h.replace(/<[^>]+>/g, "")] : null; };
  assert.deepStrictEqual([aviso(-2), aviso(-1), aviso(0), aviso(1), aviso(3), aviso(4), aviso(7), aviso(8)], [["vermelho", "Venceu há 2 dias"], ["vermelho", "Venceu ontem"], ["vermelho", "Vence hoje"], ["vermelho", "Vence amanhã"], ["vermelho", "Vence em 3 dias"], ["amarelo", "Vence em 4 dias"], ["amarelo", "Vence em 7 dias"], null]);
  assert.equal(aviso(0, { status: "recebido" }), null); assert.equal(aviso(0, { status: "cancelado" }), null); assert.equal(aviso(0, { aberto: 0 }), null);
  await page.selectOption("#frStatus", "abertos").catch(() => {});
  await page.waitForSelector(".fin-venc-alerta.vermelho");
  assert.match(await page.textContent(".fin-venc-alerta.vermelho"), /Vence hoje/);
  assert.notEqual(await page.$eval(".fin-venc-alerta i", (e) => getComputedStyle(e).animationName), "none", "a bolinha pisca");
  await page.locator(".fin-pedido").first().screenshot({ path: path.join(process.env.SP || raiz, "fin-venc.png") }).catch(() => {});
  console.log("ok 3d - aviso de vencimento: vermelho até 3 dias, amarelo até 7");
  const prazos = () => page.$$eval("[data-prazo]", (l) => l.map((b) => [b.dataset.prazo, b.querySelector(".fin-prazo-n")?.textContent || ""]));
  assert.deepStrictEqual(await prazos(), [["vencidos", ""], ["hoje", "2"], ["semana", "1"]], "bolinha com a quantidade, sem bolinha quando é zero");
  const linhasAbertas = () => page.locator(".fin-pedido tbody tr").count();
  assert.equal(await linhasAbertas(), 3);
  await page.click('[data-prazo="hoje"]'); await page.waitForSelector('[data-prazo="hoje"].ativa');
  assert.equal(await linhasAbertas(), 2, "só as que vencem hoje");
  await page.click('[data-prazo="semana"]'); await page.waitForSelector('[data-prazo="semana"].ativa');
  assert.equal(await linhasAbertas(), 1, "só as dos próximos 7 dias");
  await page.click("#frBusca"); await page.fill("#frBusca", "Lis"); await page.press("#frBusca", "Enter"); await page.waitForSelector('[data-prazo="semana"].ativa');
  assert.equal(await linhasAbertas(), 1, "a aba continua valendo com a busca");
  await page.click("#frBusca"); await page.fill("#frBusca", ""); await page.press("#frBusca", "Enter"); await page.waitForSelector('[data-prazo="semana"].ativa');
  if (process.env.SP) await page.screenshot({ path: process.env.SP + "/fin-prazo.png" });
  await page.click('[data-prazo="semana"]'); await page.waitForSelector('[data-prazo="semana"]:not(.ativa)');
  assert.equal(await linhasAbertas(), 3, "clicar de novo volta a mostrar tudo");
  await page.click('[data-prazo="hoje"]'); await page.waitForSelector('[data-prazo="hoje"].ativa'); await page.click("#frRecebidas"); await page.waitForSelector('[data-prazo="hoje"]:not(.ativa)');
  await page.click("#frRecebidas"); await page.waitForFunction(() => document.getElementById("frRecebidas")?.getAttribute("aria-pressed") === "false");
  console.log("ok 3e - abas Vencidos, Vence hoje e Próximos 7 dias com a quantidade");

  assert.strictEqual(await page.locator("[data-r-baixar]").count(), 0, "A receber não tem mais o botão Receber");
  await page.click('[data-aba="bancos"]');
  await page.click('[data-bk-conta="cx"]');
  await page.waitForSelector('[data-caixa-lancar="1"]');
  assert.strictEqual(await page.locator("[data-bk-vista=conciliar]").count(), 0, "caixa não tem Conciliar");
  await page.click('[data-caixa-lancar="1"]');
  await page.waitForSelector("#finModal[open] [name=cx_valor]");
  await page.click('#finModalRodape [data-bt="1"]');
  assert.match(await page.textContent("#finModal"), /Informe o valor/);
  await page.fill("[name=cx_valor]", "1000"); await page.fill("[name=cx_desc]", "Recebido em dinheiro");
  await page.check('[data-tit="r1"]');
  await page.click('#finModalRodape [data-bt="1"]');
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "fin_caixa_lancar" && r.a.p_valor === 1000 && r.a.p_conta === "cx" && r.a.p_acao.tipo === "baixar" && r.a.p_acao.titulos[0].id === "r1" && r.a.p_acao.titulos[0].valor === 1000));
  await page.waitForFunction(() => !document.getElementById("finModal").open);
  await page.click('[data-caixa-lancar="-1"]');
  await page.waitForSelector("#finModal[open] [name=cx_valor]");
  assert.ok(await page.locator('[data-alt-tipo="ignorar"]').count() === 0);
  await page.fill("[name=cx_valor]", "35,50"); await page.fill("[name=cx_desc]", "Café");
  await page.click('[data-alt-tipo="lancar"]');
  await page.selectOption('#finModalCorpo [name="categoria_id"]', { index: 1 });
  await page.click('#finModalRodape [data-bt="1"]');
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "fin_caixa_lancar" && r.a.p_valor === -35.5 && r.a.p_acao.tipo === "lancar"));
  await page.click(".alerta-btn, #alertaOk", { timeout: 1500 }).catch(() => {});
  console.log("ok 4 - receber só pelo caixa físico (entrada com título, saída lançada) ou pela conciliação");

  await page.click('[data-aba="bancos"]');
  await page.click("[data-bk-config]");
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
  await page.waitForSelector('[data-p-programar="g9"]');
  assert.strictEqual(await page.locator("[data-p-baixar]").count(), 0, "A pagar não tem mais o botão Pagar");
  console.log("ok 6 - a pagar com aprovação, sem botão de pagar à mão");

  await page.click('[data-aba="bancos"]');
  await page.click('[data-bk-conta="c1"]');
  await page.click('[data-bk-vista="conciliar"]');
  await page.waitForSelector("#clArquivo", { state: "attached" });
  const ofx = "<OFX><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>" + hoje.replace(/-/g, "") + "<TRNAMT>2000.00<FITID>abc<MEMO>PIX LIS</STMTTRN></OFX>";
  await page.setInputFiles("#clArquivo", { name: "extrato.ofx", mimeType: "text/plain", buffer: Buffer.from(ofx) });
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "fn:financeiro-assistente" && r.a.action === "ler_extrato" && r.a.arquivo.formato === "ofx" && r.a.arquivo.linhas[0].valor === 2000 && r.a.arquivo.linhas[0].fitid === "abc"));
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "fin_importar_extrato_lote" && r.a.p_linhas[0].valor === 2000) && window.__rpc.some((r) => r.a?.action === "organizar"));
  await page.waitForSelector(".cl-tabela tbody tr");
  assert.match(await page.textContent(".cl-tabela"), /Lançar · Outras receitas/);
  await page.click("#clConfirmar");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "fin_assist_aplicar" && r.a.p_acao.tipo === "lancar"));
  console.log("ok 7 - extrato OFX enviado à Clara, importado, organizado e confirmado");

  for (const aba of ["dre"]) { await page.click('[data-aba="' + aba + '"]'); await page.waitForTimeout(300); }
  // Plano de contas mora dentro da aba DRE; créditos dentro de Decoradores (out/2026: abas numa linha só).
  await page.click('[data-aba="dre"]'); await page.click('#finSubAbas [data-subaba="plano"]'); await page.waitForTimeout(300);
  assert.ok(await page.$eval('#finAbas [data-aba="dre"]', (b) => b.classList.contains("ativa")), "aba DRE continua marcada no Plano de contas");
  await page.click('[data-aba="bv"]'); assert.strictEqual(await page.locator('#finSubAbas [data-subaba]').count(), 0, 'Decoradores sem a parte Gestão de créditos');
  assert.equal(await page.locator('#finAbas [data-aba]').count(), 10, "10 abas (Bancos, Gateways e a Clara)");
  await page.click('[data-aba="gateways"]'); await page.waitForSelector(".fin-gateways #pgBtnRefresh"); assert.ok(await page.locator(".fin-gateways .pg-card").count() === 2, "gateways dentro do Financeiro");
  await page.setViewportSize({ width: 1700, height: 900 }); await page.waitForTimeout(200);
  assert.equal(await page.$$eval('#finAbas [data-aba]', (l) => new Set(l.map((b) => Math.round(b.getBoundingClientRect().top))).size), 1, "abas numa linha só a 1700px");
  assert.equal(Math.round(await page.$eval('.fin-topo h2', (h) => h.getBoundingClientRect().top)), Math.round(await page.$eval('#finAbas [data-aba]', (b) => b.getBoundingClientRect().top)), "na mesma linha do título");
  await page.click('[data-aba="dre"]'); await page.click('#finSubAbas [data-subaba="plano"]'); await page.waitForTimeout(300);
  assert.match(await page.textContent("#finConteudo"), /Locação de mobiliário/);
  console.log("ok 8 - DRE e plano de contas abrem");

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
