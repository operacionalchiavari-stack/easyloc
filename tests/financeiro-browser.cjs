// Out/2026 — Financeiro: abas, contas a receber agrupadas por pedido com a divisão locação/frete/montagem,
// conta (CNPJ/PIX) por parte, contas padrão do pedido, baixa, a pagar com aprovação e importação de extrato.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
process.env.TZ = "UTC"; // datas do teste e da tela no mesmo fuso (perto da meia-noite UTC o "hoje" mudava)
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
    fin_categorias: [{ id: "kf", empresa_id: "e1", codigo: "4.1", nome: "Aluguel do galpão", tipo: "saida", natureza: "fixo", ativo: true, ordem: 50 }, { id: "k1", empresa_id: "e1", codigo: "1", nome: "Receitas", tipo: "entrada", ativo: true, ordem: 1 }, { id: "k2", empresa_id: "e1", codigo: "1.1", nome: "Locação de mobiliário", tipo: "entrada", pai_id: "k1", chave: "locacao", ativo: true, ordem: 2 },
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
      select(){ return q; }, order(){ return q; }, not(){ return q; }, limit(){ return q; }, range(){ return q; },
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
    pedido_fluxo_fila: (a) => a.p_setor === "posicao_final" && !a.p_de ? [{ id: "pf1", numero_pedido: "77", cliente_id: "cl1", cliente_nome: "Kelly Khawam", local_nome: "Villa", data_evento: H }] : [],
    fin_posicao_final_base: () => ({ pedido: { id: "pf1", numero_pedido: "77", cliente_nome: "Kelly Khawam", local_nome: "Villa", valor_total: 5000, extras: [] }, fonte: "f1", salvo: null,
      entrega_confirmada: true, coleta_confirmada: true, titulos: [], pagamentos: [], credito_titulo: null,
      itens: [{ chave: "avaria:1", item_id: "i1", nome: "Cadeira Tiffany", tipo: "avaria", quantidade: 1, unitario: 120, valor: 120, motivo: "Perna quebrada" }],
      bv: { percentual: 10, base: 3000, valor: 300, manual: false, aprovacao: "pendente", desconto: 0, sugestao_desconto: 120,
        partes: [{ cliente_id: "cl1", nome: "Kelly Khawam", percentual: 6, valor: 180 }, { cliente_id: "cl2", nome: "Ana Assistente", percentual: 4, valor: 120 }] } }),
    pedido_saldo_conta_cliente: () => ({ bv: 400, credito: 50, total: 450 }),
    fin_posicao_final_salvar: (a) => ({ pedido: { id: "pf1", numero_pedido: "77", cliente_nome: "Kelly Khawam", valor_total: 5000, extras: [] }, fonte: "f1", salvo: { status: a.p_confirmar ? "confirmado" : "rascunho", versao: 1, itens: [], bv: a.p_bv, confirmado_em: H },
      entrega_confirmada: true, coleta_confirmada: true, titulos: [], pagamentos: [], itens: [], bv: null }),
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
    fin_recebimentos_previstos: () => [
      { pedido_id: "pp1", pedido_numero: "31", cliente_nome: "Ana Prévia", situacao: "pre_reserva", pre_reserva_ate: H, data_evento: H, dia: H, valor: 4000, componente: "locacao", parcela: 1, parcelas: 2, forma: "pix", sem_parcelas: false, valor_pedido: 8000 },
      { pedido_id: "pp2", pedido_numero: "32", cliente_nome: "Bia Orçada", situacao: "orcamento", pre_reserva_ate: null, data_evento: H, dia: H, valor: 2500, componente: "frete", parcela: 1, parcelas: 1, forma: null, sem_parcelas: true, valor_pedido: 2500 }],
    fin_contas_fixas_previstas: () => [{ dia: H, valor: 1200, titulo: "Aluguel do galpão", detalhe: "Todo mês · previsão", categoria_id: "kf" }],
    fin_reagendar_titulo: (a) => { const t = banco[a.p_tipo === "receber" ? "fin_receber" : "fin_pagar"].find((x) => x.id === a.p_id); t.programado_para = a.p_data; return null; },
    fin_bancos_resumo: () => [{ conta_id: "c1", saldo: 1500, pendentes: window.__pendBancos ?? 0 }],
    fin_bancos_extrato: () => ({ contas: [], linhas: [], pendentes: 0 })
  };
  const cliente = {
    auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }), getUser: async () => ({ data: { user: { id: "u1" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: consulta,
    functions: { invoke: async (n, o) => {
      window.__rpc.push({ n: "fn:" + n, a: o.body });
      if (n === "financeiro-assistente" && o.body.action === "ler_extrato") return { data: { formato: "ofx", banco: "", modelo_novo: false, arquivo: o.body.arquivo.nome, linhas: o.body.arquivo.linhas.map((l) => ({ ...l, fitid: "ofx-" + l.fitid })), resumo: {} }, error: null };
      // nov/2026: Clara CFO devolve resposta + provas (séries calculadas no servidor) + título do relatório
      if (n === "financeiro-assistente" && o.body.action === "conversar") return { data: { resposta: "**O caixa aperta em 20 dias.**" + String.fromCharCode(10) + "- Cobrar os vencidos.", titulo_relatorio: "Projeção de caixa 90 dias", evidencias: [
        { serie: "caixa_previsto_90_dias", titulo: "Caixa previsto", leitura: "O saldo cai até o dia 01/12.", dados: { tipo: "linha", unidade: "brl", rotulos: ["11/11", "18/11", "25/11"], series: [{ nome: "Real (contas lançadas)", valores: [5000, 1200, -300] }, { nome: "Com as pré-reservas", valores: [5000, 2200, 900] }], colunas: ["Dia", "Saldo real", "Com pré-reservas"], linhas: [["11/11/2026", 5000, 5000], ["18/11/2026", 1200, 2200], ["25/11/2026", -300, 900]], formatos: ["texto", "brl", "brl"], nota: "Pré-reserva ainda não é venda." } },
        { serie: "prazos_medios", titulo: "Prazos", leitura: "Ciclo positivo.", dados: { tipo: "kpis", itens: [{ rotulo: "Prazo médio de recebimento", valor: 25, unidade: "dias" }, { rotulo: "Cobertura de caixa", valor: 0.8, unidade: "meses" }] } }] }, error: null };
      if (n === "financeiro-assistente" && o.body.action === "organizar") { banco.fin_extrato.forEach((l) => { l.sugestao = { acao: { tipo: "lancar", categoria_id: "" }, confianca: "alta", resumo: "Lançar · Outras receitas", motivo: "PIX sem título." }; }); return { data: { total: banco.fin_extrato.length, restantes: 0 }, error: null }; }
      return { data: o.body.action === "revelar" ? { valores: { agencia: "1234" } } : { ok: true, id: o.body.conta_id || "n1" }, error: null };
    } },
    rpc: (n, a) => ({ then: (ok, erro) => { window.__rpc.push({ n, a }); return Promise.resolve({ data: respostas[n] ? respostas[n](a) : null, error: null }).then(ok, erro); } })
  };
  window.supabase = { createClient: () => cliente };
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, timezoneId: "UTC" });
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
  await page.addInitScript(() => { window.__pendBancos = 2; });
  await page.goto(BASE + "Modulos/Financeiro/financeiro.html");
  // bolinha de Bancos e cartões já ao abrir (sem precisar clicar na aba)
  await page.waitForFunction(() => document.querySelector("[data-cont=bancos]")?.textContent.trim() === "2", null, { timeout: 15000 });
  await page.waitForSelector(".fin-geral-2col", { timeout: 15000 });
  const geral = await page.textContent("#finConteudo");
  assert.doesNotMatch(geral, /Saldo nas contas|A pagar em aberto|Pagamentos vencidos/, "sem os cartões de totais"); assert.match(geral, /Locações Itaú/); assert.match(geral, /Montagem/);
  const col = await page.evaluate(() => { const c = document.querySelector(".fin-geral-cal").getBoundingClientRect(), l = document.querySelector(".fin-geral-lado").getBoundingClientRect(); return { ladoALado: l.left > c.right - 1 && Math.abs(l.top - c.top) < 2, blocosNoLado: document.querySelectorAll(".fin-geral-lado > .fin-bloco").length }; });
  assert.deepStrictEqual(col, { ladoALado: true, blocosNoLado: 1 }, "calendário de um lado, a Agenda do dia do outro");
  // nov/2026: Agenda do dia igual à da Tecnoweld (no lugar de Saldos por conta / A receber por divisão)
  assert.match(await page.textContent("#finAgendaDia h3"), /Agenda do dia/);
  assert.match(await page.textContent("#finAgendaDia"), /Pedido 12 · Lis[\s\S]*R\$\s*3\.000,00/);
  assert.equal(await page.locator('#finAgendaDia [data-agenda-aba="receber"][aria-selected="true"]').count(), 1);
  await page.click('#finAgendaDia [data-agenda-aba="pagar"]'); assert.match(await page.textContent("#finAgendaPainel"), /Transp X/);
  assert.match(await page.textContent("#finAgendaPainel"), /Conta fixa\s*Aluguel do galpão[\s\S]*R\$\s*1\.200,00/, "conta fixa prevista nas saídas do dia");
  await page.click('#finAgendaDia [data-agenda-aba="receber"]');
  await page.locator('#finAgendaDia [data-reagendar="r1"]').click(); await page.waitForSelector("#finModal[open]");
  await page.fill('#finModalCorpo [name="data"]', new Date(Date.now() + 3 * 864e5).toLocaleDateString("sv-SE")); await page.fill('#finModalCorpo [name="motivo"]', "cliente pediu para sexta");
  await page.click('#finModalRodape button:has-text("Salvar nova data")');
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "fin_reagendar_titulo" && r.a.p_id === "r1" && r.a.p_tipo === "receber" && r.a.p_motivo === "cliente pediu para sexta"));
  console.log("ok 1 - visão geral: calendário e Agenda do dia (abas Entradas/Saídas, Alterar data)");
  // Calendário financeiro em destaque: mês inteiro, hoje com E/S/Saldo e cor pelo saldo; passar o mouse abre o detalhe.
  await page.waitForSelector("#finCalDias [data-dia]");
  const hojeCal = new Date().toISOString().slice(0, 10);
  const dia = page.locator('#finCalDias [data-dia="' + hojeCal + '"]');
  assert.match(await dia.innerText(), /E: 4 mil[\s\S]*S: 500[\s\S]*Saldo: 4,8 mil/);
  assert.ok(await dia.evaluate((el) => el.classList.contains("positivo") && el.classList.contains("hoje")), "hoje em verde (saldo positivo)");
  const dias = await page.locator("#finCalDias [data-dia]").count();
  assert.equal(dias, Number(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()), "um quadro por dia do mês");
  await dia.hover(); await page.waitForTimeout(200); assert.equal(await page.locator("#finCalDetalhe").count(), 0, "sem o cartão ao passar o mouse");
  const mesAtual = await page.textContent("#finCalMes");
  await page.click('[data-cal="1"]'); await page.waitForFunction((m) => document.getElementById("finCalMes").textContent !== m, mesAtual);
  await page.click('[data-cal="hoje"]'); await page.waitForFunction((m) => document.getElementById("finCalMes").textContent === m, mesAtual);
  // Valores em reais: verde se positivo, vermelho se negativo, no Financeiro inteiro.
  await page.waitForTimeout(200);
  const cores = await page.evaluate(() => [...document.querySelectorAll("#finAgendaDia .fin-agenda-valor")].map((b) => [b.textContent.trim(), getComputedStyle(b).color]));
  const pos = cores.find(([t]) => !/-/.test(t) && /[1-9]/.test(t));
  assert.ok(pos && pos[1] === "rgb(31, 122, 68)", "positivo em verde: " + JSON.stringify(cores));
  // nov/2026: fluxo Previsto (pré-reserva + orçamento) em amarelo
  await page.click('[data-fluxo-modo="previsto"]'); await page.waitForSelector("#finCalendario.fin-cal-previsto");
  await page.waitForSelector('.fin-cal-dia.previsto[data-dia="' + hoje + '"] .pv');
  assert.match(await page.textContent('.fin-cal-dia[data-dia="' + hoje + '"] .pv'), /Previsto: 6,5 mil/);
  assert.equal(await page.$eval("#finCalendario", (e) => getComputedStyle(e).borderTopColor), "rgb(245, 197, 66)");
  await page.click('.fin-cal-dia[data-dia="' + hoje + '"]'); await page.click('#finAgendaDia [data-agenda-aba="previsto"]');
  assert.match(await page.textContent("#finAgendaPainel"), /Pré-reserva[\s\S]*Pedido 31[\s\S]*Orçamento[\s\S]*Pedido 32/);
  await page.click('[data-fluxo-modo="real"]'); await page.waitForFunction(() => !document.querySelector("#finCalendario.fin-cal-previsto"));
  assert.equal(await page.locator('#finAgendaDia [data-agenda-aba="previsto"]').count(), 0, "no Real não tem a aba Previsto");
  assert.equal(await page.locator(".fin-cal-dia .pv").count(), 0);
  // aba Recebimentos previstos
  await page.click('#finAbas [data-aba="previstos"]'); await page.waitForSelector(".fin-previstos-tab");
  assert.equal(await page.locator(".fin-previstos-tab tbody tr").count(), 2);
  assert.match(await page.textContent(".fin-prev-total"), /2 pedido\(s\) · R\$\s*6\.500,00/);
  await page.click('[data-prev-sit="orcamento"]'); assert.equal(await page.locator(".fin-previstos-tab tbody tr").count(), 1);
  assert.match(await page.textContent(".fin-previstos-tab tbody"), /Data do evento[\s\S]*32/);
  // nov/2026: mesmas colunas de A receber (Pedido no card vermelho, Cliente com foto, Local)
  assert.deepEqual(await page.$$eval(".fin-previstos-tab thead th", (l) => l.map((t) => t.textContent.trim()).filter(Boolean)), ["Vencimento", "Pedido", "Cliente", "Local", "Divisão", "Situação", "Valor"]);
  assert.strictEqual((await page.textContent(".fin-previstos-tab tbody tr td.fin-num-ped .fin-num-card")).trim(), "32");
  assert.strictEqual(await page.locator(".fin-previstos-tab tbody tr .fin-cli-foto").count(), 1, "foto (ou iniciais) do cliente");
  await page.click('[data-prev-sit=""]'); await page.click('#finAbas [data-aba="geral"]'); await page.waitForSelector("#finCalDias .fin-cal-dia");
  for (const w of [1280, 1400, 1500, 1920]) { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(150);
    const ex = await page.$$eval("#finAbas [data-aba]", (l) => l.map((x) => x.getBoundingClientRect()).reduce((m, q) => [Math.min(m[0], q.left), Math.max(m[1], q.right)], [1e9, -1e9]));
    assert.ok(ex[0] >= 0 && ex[1] <= w, "abas dentro da tela a " + w + "px: " + ex);
    const ord = await page.$eval(".fin-topo", (t) => { const h = t.querySelector("h2").getBoundingClientRect(), a = t.querySelector('[data-aba="geral"]').getBoundingClientRect(); return [h.width, a.left]; });
    assert.ok(ord[0] <= 1 && ord[1] < 120, "sem o título Financeiro na frente; abas começam no canto: " + ord);
    const linhas = await page.$$eval("#finAbas [data-aba]", (l) => new Set(l.map((x) => Math.round(x.getBoundingClientRect().top))).size);
    assert.equal(linhas, 1, "todas as abas numa linha a " + w + "px");
    }
  await page.setViewportSize({ width: 1400, height: 900 });
  { const b = await page.evaluate(() => { const e = document.querySelector("[data-cont=previstos]"); const c = getComputedStyle(e); return { t: e.textContent.trim(), bg: c.backgroundColor, an: c.animationName }; });
    assert.ok(/^\d+$/.test(b.t) && Number(b.t) > 0, "bolinha com a quantidade: " + b.t); assert.strictEqual(b.bg, "rgb(242, 183, 5)", "bolinha amarela"); assert.strictEqual(b.an, "fin-prev-pulsa", "piscando"); }
  await page.click("[data-aba=receber]"); await page.waitForSelector(".fin-pedido"); assert.strictEqual(await page.locator(".fin-previsao").count(), 0, "A receber sem o bloco de pré-reservas");
  console.log("ok 1c - fluxo Previsto em amarelo e aba Recebimentos previstos");
  console.log("ok 1b - calendário financeiro em destaque na visão geral (E/S/saldo por dia, detalhe ao passar o mouse, troca de mês)");

  await page.click('[data-aba="receber"]');
  await page.waitForSelector(".fin-pedido");
  const ped = await page.textContent(".fin-pedido");
  assert.match(ped, /12[\s\S]*Lis/);
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
  assert.match(await page.textContent(".fin-receber-data tbody tr"), /12[\s\S]*Lis/); assert.strictEqual(await page.locator(".fin-receber-data tbody tr").first().locator("td.fin-num-ped .fin-num-card").textContent(), "12", "pedido em coluna própria, no card vermelho");
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
  const alertaVenc = new Function("S", corpo + "; return alertaVenc;")({});
  const emDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };
  const aviso = (n, extra = {}) => { const h = alertaVenc({ status: "aberto", aberto: 100, vencimento: emDias(n), ...extra }); return h ? [/vermelho/.test(h) ? "vermelho" : "amarelo", h.replace(/<[^>]+>/g, "")] : null; };
  assert.deepStrictEqual([aviso(-2), aviso(-1), aviso(0), aviso(1), aviso(3), aviso(4), aviso(7), aviso(8)], [["vermelho", "Venceu há 2 dias"], ["vermelho", "Venceu ontem"], ["vermelho", "Vence hoje"], ["vermelho", "Vence amanhã"], ["vermelho", "Vence em 3 dias"], ["amarelo", "Vence em 4 dias"], ["amarelo", "Vence em 7 dias"], null]);
  assert.equal(aviso(0, { status: "recebido" }), null); assert.equal(aviso(0, { status: "cancelado" }), null); assert.equal(aviso(0, { aberto: 0 }), null);
  await page.selectOption("#frStatus", "abertos").catch(() => {});
  await page.waitForSelector(".fin-venc-alerta.vermelho");
  assert.match(await page.textContent(".fin-venc-alerta.vermelho"), /Vence hoje/);
  assert.notEqual(await page.$eval(".fin-venc-alerta i", (e) => getComputedStyle(e).animationName), "none", "a bolinha pisca");
  if (process.env.SP) await page.locator(".fin-pedido").first().screenshot({ path: process.env.SP + "/fin-venc.png" }).catch(() => {});
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
  await page.waitForFunction(() => !document.querySelector('[data-p-aprovar="g9"]'));
  assert.strictEqual(await page.locator('#finConteudo [data-p-programar], #finConteudo [data-p-editar], #finConteudo [data-p-ver]').count(), 0, 'sem Programar/Editar/Detalhes na linha');
  await page.click('[data-p-linha="g9"] td:first-child');
  await page.waitForSelector('#finModal.fin-modal-detalhe .fpd-topo');
  if (process.env.SHOT_PAGAR) await page.screenshot({ path: process.env.SHOT_PAGAR });
  const det = await page.textContent('#finModalCorpo');
  assert.match(det, /Pagamentos/); assert.match(det, /Informações/);
  const rod = await page.textContent('#finModalRodape');
  assert.match(rod, /Programar pagamento/); assert.match(rod, /Editar/);
  await page.click('#finModal .fin-x');
  assert.strictEqual(await page.locator("[data-p-baixar]").count(), 0, "A pagar não tem mais o botão Pagar");
  console.log("ok 6 - a pagar com aprovação, sem botão de pagar à mão");
  // nov/2026: filtros de A pagar iguais aos de A receber (categoria, conta sem a opção "Sem conta", atalhos de vencimento e Pagas)
  assert.equal(await page.locator("#fpCat").count(), 1); assert.equal(await page.locator("#fpConta").count(), 0, "sem o filtro de conta"); assert.ok(await page.locator("[data-p-linha] td.fin-quem .fin-cli-foto").count() > 0, "foto (ou iniciais) de quem recebe na coluna Fornecedor"); { const tops = await page.$$eval("#fpBusca, #fpNovo", (l) => l.map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2))); assert.ok(Math.abs(tops[0] - tops[1]) <= 4, "Novo pagamento na mesma linha dos filtros: " + tops); }
  assert.deepStrictEqual(await page.$$eval("[data-prazo-p]", (l) => l.map((b) => b.textContent.replace(/\d+$/, "").trim())), ["Vencidos", "Vence hoje", "Próximos 7 dias"]);
  await page.click('[data-prazo-p="hoje"]'); await page.waitForSelector('[data-prazo-p="hoje"][aria-pressed="true"]');
  assert.equal(await page.locator('[data-p-linha="g9"]').count(), 1, "Vence hoje mostra a conta de hoje");
  await page.click('[data-prazo-p="semana"]'); assert.equal(await page.locator("[data-p-linha]").count(), 0, "nada nos próximos 7 dias");
  await page.click('[data-prazo-p="semana"]');
  await page.click("#fpPagas"); await page.waitForSelector('#fpPagas[aria-pressed="true"]'); assert.equal(await page.locator('[data-p-linha="g9"]').count(), 0, "Pagas esconde as em aberto");
  await page.click("#fpPagas"); await page.waitForSelector('[data-p-linha="g9"]');
  console.log("ok 6b - A pagar com os mesmos filtros de A receber");

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
  // nov/2026: Clara igual à da Tecnoweld — coluna da direita com relatórios prontos, provas (gráficos/tabelas) e relatório A4
  await page.click('#finAbas [data-aba="clara"]'); await page.waitForSelector("#chLado .clp-rel");
  assert.equal(await page.locator("#chLado .clp-rel").count(), 6, "6 relatórios prontos na coluna da direita");
  await page.locator("#chLado .clp-rel", { hasText: "Projeção de caixa 90 dias" }).click();
  await page.waitForSelector("#chLado .clp-card svg.clp-svg");
  assert.equal(await page.locator("#chLado .clp-card").count(), 2, "duas provas");
  assert.match(await page.textContent("#chLado h3"), /Projeção de caixa 90 dias/);
  assert.equal(await page.locator("#chLado .clp-card polyline").count(), 2, "linha com as duas séries");
  assert.equal(await page.locator("#chLado .clp-kpi").count(), 2, "indicadores");
  assert.ok(await page.locator(".clp-ver.ativo").count() === 1, "resposta com o botão Ver provas marcado");
  assert.ok((await page.evaluate(() => window.__rpc.find((r) => r.a?.action === "conversar").a.mensagens[0].content)).includes("projeção de caixa"), "pergunta do relatório enviada");
  await page.click("#clpRel"); await page.waitForSelector("#finRelPrev iframe");
  await page.waitForFunction(() => document.querySelector("#finRelPrev iframe").contentDocument?.querySelector(".rr-doc h1"));
  assert.match(await page.evaluate(() => document.querySelector("#finRelPrev iframe").contentDocument.querySelector(".rr-doc").innerText), /Projeção de caixa 90 dias[\s\S]*O caixa aperta em 20 dias[\s\S]*Caixa previsto/);
  assert.equal(await page.evaluate(() => document.querySelector("#finRelPrev iframe").contentDocument.querySelectorAll(".rr-doc svg").length), 1, "gráfico no relatório");
  await page.screenshot({ path: ".tmp/financeiro-clara-relatorio.png" });
  await page.keyboard.press("Escape"); await page.waitForFunction(() => !document.getElementById("finRelPrev"));
  await page.click("#clpVoltar"); await page.waitForSelector("#chLado .clp-rel");
  await page.screenshot({ path: ".tmp/financeiro-clara-provas.png" });
  console.log("ok 7b - Clara: relatórios prontos, provas com gráfico e relatório A4");


  for (const aba of ["dre"]) { await page.click('[data-aba="' + aba + '"]'); await page.waitForTimeout(300); }
  // Plano de contas mora dentro da aba DRE; créditos dentro de Decoradores (out/2026: abas numa linha só).
  await page.click('[data-aba="dre"]'); await page.click('#finSubAbas [data-subaba="plano"]'); await page.waitForTimeout(300);
  assert.ok(await page.$eval('#finAbas [data-aba="dre"]', (b) => b.classList.contains("ativa")), "aba DRE continua marcada no Plano de contas");
  await page.click('[data-aba="bv"]'); assert.strictEqual(await page.locator('#finSubAbas [data-subaba]').count(), 0, 'Decoradores sem a parte Gestão de créditos');
  assert.equal(await page.locator('#finAbas [data-aba]').count(), 12, "12 abas (Recebimentos previstos e Fechamentos de parceiros)");
  await page.click('[data-aba="gateways"]'); await page.waitForSelector(".fin-gateways #pgBtnRefresh"); assert.ok(await page.locator(".fin-gateways .pg-card").count() === 2, "gateways dentro do Financeiro");
  await page.setViewportSize({ width: 1700, height: 900 }); await page.waitForTimeout(200);
  assert.equal(await page.$$eval('#finAbas [data-aba]', (l) => new Set(l.map((b) => Math.round(b.getBoundingClientRect().top))).size), 1, "abas numa linha só a 1700px");
  { const meio = (r) => (r.top + r.bottom) / 2; const t = await page.$eval('.fin-topo h2', (h) => { const r = h.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }), b = await page.$eval('#finAbas [data-aba]', (x) => { const r = x.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    assert.ok(Math.abs(meio(t) - meio(b)) < 14, "na mesma linha do título: " + JSON.stringify([t, b])); }
  await page.click('[data-aba="dre"]'); await page.click('#finSubAbas [data-subaba="plano"]'); await page.waitForTimeout(300);
  assert.match(await page.textContent("#finConteudo"), /Locação de mobiliário/);
  // nov/2026: contas fixas com Previsão e Dia do pagamento (alimentam o fluxo de caixa)
  await page.click('#finAbas [data-aba="dre"]'); await page.click('#finSubAbas [data-subaba="plano"]'); await page.waitForSelector(".fin-plano");
  assert.match(await page.textContent(".fin-plano thead"), /Previsão[\s\S]*Dia do pagamento/);
  await page.click('[data-cat-prev="kf"]'); await page.waitForSelector("#finModal[open]");
  // valor previsto POR MÊS: repetir em todos e depois mudar dezembro
  await page.fill('#finModalCorpo [name="dia"]', "10"); await page.fill('#finModalCorpo [name="todos"]', "1.200,00"); await page.click("#finPrevTodos");
  assert.equal(await page.inputValue('#finModalCorpo [name="m5"]'), "1200,00");
  await page.fill('#finModalCorpo [name="m12"]', "2.500,00");
  assert.match(await page.textContent("#finPrevTotal"), /15\.700,00/);
  await page.click('#finModalRodape button:has-text("Salvar")');
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "update:fin_categorias" && r.a.previsao_dia === 10 && Array.isArray(r.a.previsao_meses) && r.a.previsao_meses[0] === 1200 && r.a.previsao_meses[11] === 2500));
  await page.waitForSelector('[data-cat-prev="kf"]:has-text("Dia 10")');
  assert.match(await page.textContent(".fin-plano"), /Varia por mês · R\$\s*15\.700,00 no ano[\s\S]*Dia 10/);
  console.log("ok 8 - DRE e plano de contas abrem; conta fixa com previsão e dia do pagamento");

  // nov/2026: BV indicado pelo Comercial é aprovado (ou não) pelo Financeiro na Posição final
  await page.click('#finAbas [data-aba="posicao"]'); await page.waitForSelector('.pf-lista [data-id], .pf-lista button');
  await page.locator(".pf-lista button").first().click(); await page.waitForSelector(".pf-bv");
  assert.match(await page.textContent(".pf-bv"), /BV do decorador[\s\S]*Kelly Khawam[\s\S]*R\$\s*180,00[\s\S]*Ana Assistente[\s\S]*R\$\s*120,00/);
  await page.click('.pf-ocorrencias [data-decisao="0"][value="cobrar"]');
  await page.click("[data-confirmar]"); await page.waitForTimeout(300);
  assert.ok(!(await page.evaluate(() => window.__rpc.some((r) => r.n === "fin_posicao_final_salvar"))), "não confirma sem decidir o BV");
  await page.click('[data-bv-decisao="aprovar"]'); await page.click("[data-bv-sugestao]");
  assert.match(await page.textContent('[data-bv-parte="cl1"]'), /108,00/, "desconto de 120 repartido: 180 - 72");
  assert.match(await page.textContent('[data-bv-parte="cl2"]'), /72,00/);
  assert.equal(await page.inputValue("[data-bv-motivo]"), "Itens danificados ou não encontrados no evento");
  assert.match(await page.textContent(".pf-cabecalho .pf-cab-card.bv"), /BV a pagar \(aprovando\)[\s\S]*R\$\s*180,00/, "card do BV no resumo: 300 - 120");
  await page.click("[data-confirmar]"); await page.click('.el-alert-confirm .el-alert__actions button:has-text("Confirmar")');
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "fin_posicao_final_salvar" && r.a.p_confirmar));
  const pbv = await page.evaluate(() => window.__rpc.find((r) => r.n === "fin_posicao_final_salvar" && r.a.p_confirmar).a.p_bv);
  assert.deepStrictEqual(pbv, { decisao: "aprovar", desconto: 120, motivo: "Itens danificados ou não encontrados no evento" });
  assert.match(await page.textContent(".pf-cabecalho"), /Saldo na conta do decorador \(sem este BV\)\s*R\$\s*450,00/);
  console.log("ok 8b - Posição final: Financeiro aprova o BV com desconto das avarias (só então vai para Contas a pagar)");

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
