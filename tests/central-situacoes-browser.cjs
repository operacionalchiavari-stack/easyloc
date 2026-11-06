// Out/2026 — Central de Pedidos: botões Pré-reserva / Orçamento / Reservado com a contagem numa bolinha vermelha
// piscando; clicar filtra a lista e clicar de novo mostra todos. Pré-reservas sempre no topo (a que vence primeiro em cima).
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const raiz = path.resolve(__dirname, "..");
const BASE = "http://acervo.teste/";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64");

// Supabase simulado: from(tabela) devolve um construtor encadeável que só tem "then" (igual ao real).
const mockSupabase = `
(() => {
  const banco = {
    separacoes_pedidos: [{ id: "o1", empresa_id: "e1", numero_pedido: "001", cliente_nome: "Cliente 001", status: "orcamento", pre_reserva_ate: null, data_evento: "2026-12-20", local_nome: "Local", valor_total: 100, created_at: "2026-10-09T10:00:00Z", data_hora: "2026-10-09T10:00:00Z", observacoes: {} },
{ id: "r1", empresa_id: "e1", numero_pedido: "002", cliente_nome: "Cliente 002", status: "aprovado", pre_reserva_ate: null, data_evento: "2026-12-19", local_nome: "Local", valor_total: 100, created_at: "2026-10-09T10:00:00Z", data_hora: "2026-10-09T10:00:00Z", observacoes: {} },
{ id: "p1", empresa_id: "e1", numero_pedido: "003", cliente_nome: "Cliente 003", status: "pre_reserva", pre_reserva_ate: "2026-11-10", data_evento: "2026-12-01", local_nome: "Local", valor_total: 100, created_at: "2026-10-09T10:00:00Z", data_hora: "2026-10-09T10:00:00Z", observacoes: {} },
{ id: "p2", empresa_id: "e1", numero_pedido: "004", cliente_nome: "Cliente 004", status: "pre_reserva", pre_reserva_ate: "2026-10-19", data_evento: "2026-11-01", local_nome: "Local", valor_total: 100, created_at: "2026-10-09T10:00:00Z", data_hora: "2026-10-09T10:00:00Z", observacoes: {} },
{ id: "o2", empresa_id: "e1", numero_pedido: "005", cliente_nome: "Cliente 005", status: "orcamento", pre_reserva_ate: null, data_evento: "2026-12-25", local_nome: "Local", valor_total: 100, created_at: "2026-10-09T10:00:00Z", data_hora: "2026-10-09T10:00:00Z", observacoes: {} },
{ id: "p3", empresa_id: "e1", numero_pedido: "006", cliente_nome: "Cliente 006", status: "pre_reserva", pre_reserva_ate: "2026-10-22", data_evento: "2026-11-05", local_nome: "Local", valor_total: 100, created_at: "2026-10-09T10:00:00Z", data_hora: "2026-10-09T10:00:00Z", observacoes: {} },
{ id: "c1", empresa_id: "e1", numero_pedido: "007", cliente_nome: "Cliente 007", status: "cancelado", pre_reserva_ate: null, data_evento: "2026-12-30", local_nome: "Local", valor_total: 100, created_at: "2026-10-09T10:00:00Z", data_hora: "2026-10-09T10:00:00Z", observacoes: {} }],
    separacoes_itens: [
      { item_id: "i1", item_nome: "Sofá Berlim", quantidade_solicitada: 2, empresa_id: "e1", separacao_pedido_id: "p1" },
      { item_id: "i2", item_nome: "Bar Bistrol", quantidade_solicitada: 1, empresa_id: "e1", separacao_pedido_id: "p1" },
      { item_id: "i3", item_nome: "Mesa Goa", quantidade_solicitada: 4, empresa_id: "e1", separacao_pedido_id: "p1" } ],
    itens: [
      { id: "i1", empresa_id: "e1", produto: "Berlim", produto_base: "Sofá", descricao_total: "Sofá Berlim Linho (L) 2.58 m (A) 0.73 m (P) 0.89 m", foto_url: "https://fixture/sofa.png", referencia: "SOF001", categoria: "Sofás", largura: 2.58, altura: 0.73, profundidade: 0.89, valor_locacao: 300, valor_reposicao: 5000 },
      { id: "i2", empresa_id: "e1", produto: "Bistrol", produto_base: "Bar", descricao_total: "Bar Bistrol", foto_url: "https://fixture/bar.png", referencia: "BAR002", categoria: "Bares", valor_locacao: 200, valor_reposicao: 3000 },
      { id: "i3", empresa_id: "e1", produto: "Goa", produto_base: "Mesa", descricao_total: "Mesa Goa", foto_url: "", referencia: "MES003", categoria: "Mesas", valor_locacao: null, valor_reposicao: null } ],
    empresas: [{ id: "e1", nome: "Chiavari", logo_url: "https://fixture/logo.png" }],
    projetos: [{ id: "pj1", empresa_id: "e1", cliente_id: "cl1", noivos: "Ana e Bruno — casamento no campo com cerimônia ao ar livre", data_evento: "2026-12-12", local_evento: "Fazenda Santa Clara, Estrada Municipal 123, Itaipava", status: "pedido_enviado", dados: { ambientes: [{ itens: [{ item_id: "i1", quantidade: 2 }] }] }, created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-02T10:00:00Z", pedido_enviado_em: "2026-11-02T10:00:00Z", numero_catalogo: 12 }],
    clientes_empresas: [{ id: "cl1", empresa_id: "e1", nome_razao: "Lis Baêtas", catalogo_logo_url: "https://fixture/lis.png" }]
  };
  banco.separacoes_pedidos.forEach(p=>{p.cliente_nome='DEMO · Decorações Casa das Flores e Eventos Corporativos '+p.numero_pedido;});
  const contatos=banco.separacoes_pedidos.map(p=>({pedido_id:p.id,situacao:'Aguardando decisão',motivo:'Reunião para decidir',observacao:'DEMO · Cliente fará uma reunião com a equipe para confirmar os itens, horários e detalhes do evento. Entrar em contato novamente após a reunião.',criado_em:'2026-10-20T15:00:00Z',autor:'DEMO · Beatriz Comercial',prazo:'2026-10-22',responsavel_id:'u1',responsavel:'DEMO · Ana Comercial'}));
  function consulta(tabela){
    let linhas = (banco[tabela] || []).slice(), unico = false;
    const q = {
      select(){ return q; }, order(){ return q; }, limit(){ return q; }, range(){ return q; }, gte(){ return q; }, lte(){ return q; },
      neq(){ return q; }, or(){ return q; }, ilike(){ return q; }, not(){ return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      in(c, vs){ linhas = linhas.filter((l) => vs.map(String).includes(String(l[c]))); return q; },
      single(){ unico = true; return q; }, maybeSingle(){ unico = true; return q; },
      update(){ return q; }, insert(){ return q; }, upsert(){ return q; }, delete(){ return q; },
      then(ok, erro){ return Promise.resolve({ data: unico ? (linhas[0] || null) : linhas, error: null }).then(ok, erro); }
    };
    return q;
  }
  const canal = { on(){ return canal; }, subscribe(){ return canal; } };
  const cliente = {
    auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }),
      getUser: async () => ({ data: { user: { id: "u1", email: "a@b" } } }), signOut: async () => {},
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: consulta,
    rpc: (nome, args) => { (window.__rpc ||= []).push({ nome, args }); return { then: (ok, erro) => Promise.resolve(nome === "comercial_followup_lista" ? { data: { config: { dias: 3, motivos: ["Achou o valor alto", "Reunião para decidir"] }, acompanhamentos: [{ alvo_tipo: "pedido", alvo_id: "o1", motivo: "Reunião para decidir", proximo: "2026-11-02", em: "2026-10-30T12:00:00Z", por: "Ana Souza", por_id: "u1" }], encerrados: [] }, error: null } : ["comercial_followup_registrar", "comercial_followup_nao_fechou"].includes(nome) ? { data: null, error: null } : nome === "funcionario_contexto"
      ? { data: { ativo: true, administrador_legado: true }, error: null } : { data: nome==='comercial_acompanhamentos'?contatos:nome==='comercial_fluxo_pedidos'?[{id:'r1',etapa:'posicao_final',posicao_final:true,finalizado:true}]:nome==='separacao_ocorrencias_listar'?[{id:'o1',estado:'comercial',item_nome:'Sofá Becca',pedido_numero:'4',cliente:'Ana',motivo_nome:'Peça quebrada',quantidade:1},{id:'o2',estado:'comercial',item_nome:'Mesa Nice',pedido_numero:'6',cliente:'Bia',motivo_nome:'Falta',quantidade:2},{id:'o3',estado:'acervo',item_nome:'Cadeira',pedido_numero:'7',cliente:'Cris',motivo_nome:'Falta',quantidade:1}]:[], error: null }).then(ok, erro) }; },
    channel: () => canal, removeChannel(){},
    storage: { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: "https://fixture/" + p } }) }) }
  };
  window.supabase = { createClient: () => cliente };
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.clock.setFixedTime(new Date('2026-10-21T15:00:00Z'));
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide is not defined/.test(e.message)) erros.push(e.message); });
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); sessionStorage.setItem("usuario_nome", "Teste"); });
  await page.route("**/*", (rota) => {
    const url = rota.request().url();
    if (url.startsWith("https://fixture/")) return rota.fulfill({ contentType: "image/png", body: PNG });
    if (url.includes("supabase-js")) return rota.fulfill({ contentType: "text/javascript", body: mockSupabase });
    if (url.startsWith(BASE)) {
      const arquivo = path.join(raiz, decodeURIComponent(new URL(url).pathname));
      if (!fs.existsSync(arquivo)) return rota.fulfill({ status: 404, body: "" });
      const tipo = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css" }[path.extname(arquivo)] || "application/octet-stream";
      return rota.fulfill({ contentType: tipo, body: fs.readFileSync(arquivo) });
    }
    return rota.abort();
  });
  // Nov/2026: a lista nunca pode mostrar "Nenhum pedido encontrado" enquanto carrega.
  await page.addInitScript(() => { window.__vazioDuranteCarga = false; new MutationObserver(() => { if (/Nenhum pedido encontrado/.test(document.getElementById("centralPedidosTbody")?.textContent || "")) window.__vazioDuranteCarga = true; }).observe(document, { childList: true, subtree: true, characterData: true }); });
  await page.goto(BASE + "Modulos/Comercial/Pedidos/CentralPedidos.html");
  await page.waitForSelector("[data-situacao=pre_reserva] .central-situacao-conta", { timeout: 15000 });
  await page.waitForSelector("#centralPedidosTbody [data-pedido-id]");
  assert.strictEqual(await page.evaluate(() => window.__vazioDuranteCarga), false, "não pisca Nenhum pedido encontrado ao abrir");
  assert.strictEqual(await page.locator(".central-skeleton").count(), 0, "esqueleto some depois de carregar");
  const numeros = () => page.$$eval("#centralPedidosTbody [data-pedido-id]", (l) => l.map((t) => t.dataset.pedidoId));
  const botoes = await page.$$eval("[data-situacao]", (l) => l.map((b) => ({ s: b.dataset.situacao, t: b.querySelector("b").textContent, n: b.querySelector(".central-situacao-conta")?.textContent || null, small: b.querySelector("small")?.textContent || "", anim: b.querySelector(".central-situacao-conta") && getComputedStyle(b.querySelector(".central-situacao-conta")).animationName, cor: b.querySelector(".central-situacao-conta") && getComputedStyle(b.querySelector(".central-situacao-conta")).backgroundColor })));
  assert.deepStrictEqual(botoes.map((b) => [b.t, b.n]), [["Todos", null], ["Reservado", null], ["Pré-reserva", "3"], ["Orçamento", "2"], ["Catálogo", "1"], ["Finalizados", null]]);
  assert.ok(botoes.filter((b) => b.n).every((b) => b.cor === "rgb(230, 0, 18)" && b.anim === "central-situacao-pulsa"), "bolinha vermelha piscando");
  assert.strictEqual(await page.getAttribute("[data-situacao=\"\"]", "aria-pressed"), "true", "Todos começa ativo");
  assert.strictEqual(botoes[2].small, "1 vencida · 1 vencendo");
  await page.waitForSelector('#centralSituacoes [data-aba-ocorrencias] .central-situacao-conta');
  assert.equal((await page.textContent('#centralSituacoes [data-aba-ocorrencias] .central-situacao-conta')).trim(), "2", "bolinha conta só as ocorrências do Comercial");
  assert.equal(await page.locator('#centralSituacoes svg, #centralSituacoes i').count(), 0, "abas sem ícones");
  assert.equal(await page.locator('.central-header [data-ocorrencias-comercial]').count(), 0, "botão saiu do topo");
  await page.click('#centralSituacoes [data-aba-ocorrencias]');
  await page.waitForSelector('#centralOcorrencias:not([hidden]) .so-table tbody tr');
  assert.equal(await page.locator('dialog[open]').count(), 0, "abre como aba, não janela");
  assert.ok(await page.$eval('#centralListaTabela', (e) => e.hidden), "lista de pedidos escondida");
  assert.equal(await page.locator('#centralOcorrencias .so-table tbody tr[data-ocorrencia]').count(), 2, "só a fila do Comercial");
  assert.ok(await page.$eval('[data-aba-ocorrencias]', (b) => b.classList.contains('is-active')), "aba marcada");
  assert.ok(!(await page.locator('#centralOcorrencias .so-ajuda').isVisible()), "sem o texto de orientação");
  if (process.env.SHOT_OC) await page.screenshot({ path: process.env.SHOT_OC });
  await page.click('#centralSituacoes [data-situacao=""]');
  assert.ok(await page.$eval('#centralOcorrencias', (e) => e.hidden), "voltar para Todos esconde as ocorrências");
  assert.ok(!(await page.$eval('#centralListaTabela', (e) => e.hidden)), "lista volta");
  assert.ok(await page.$eval('[data-aba-ocorrencias] + [data-situacao="finalizados"]', () => true), "Finalizados logo depois de Ocorrências");
  await page.click('#centralSituacoes [data-situacao="finalizados"]');
  await page.waitForFunction(() => document.querySelectorAll('#centralPedidosTbody tr[data-pedido-id]').length === 1);
  assert.equal(await page.getAttribute('#centralPedidosTbody tr[data-pedido-id]', 'data-pedido-id'), 'r1', "só o pedido com o fluxo finalizado");
  await page.click('#centralSituacoes [data-situacao="finalizados"]');
  await page.waitForFunction(() => document.querySelectorAll('#centralPedidosTbody tr[data-pedido-id]').length > 1);
  console.log("ok 0b - aba Finalizados mostra só os pedidos com o fluxo encerrado");
  for (const sit of ["pre_reserva", "orcamento", "catalogo", "aprovado", "finalizados", ""]) {
    await page.click('#centralSituacoes [data-situacao="' + sit + '"]');
    await page.waitForTimeout(300);
    const r = await page.$eval("#centralListaTabela .central-table-wrap", (w) => [w.scrollWidth, w.clientWidth]);
    assert.ok(r[0] <= r[1] + 1, sit + " sem barra horizontal: " + r);
    if (sit === "catalogo") assert.ok(await page.locator('#centralPedidosTbody tr[data-pedido-id]').count() >= 1, "catálogo com projeto na lista");
    if (sit === "catalogo") assert.ok(!/Nenhum pedido encontrado/.test(await page.textContent('#centralListaTabela')), "Catálogo vazio sem a frase");
    if (process.env.SHOT_SR) await page.screenshot({ path: process.env.SHOT_SR.replace(".png", "-" + sit + ".png") });
    for (const largura of [1000, 1100, 1280, 1366, 1600, 1920]) {
      await page.setViewportSize({ width: largura, height: 900 }); await page.waitForTimeout(150);
      const rr = await page.$eval("#centralListaTabela .central-table-wrap", (w) => [w.scrollWidth, w.clientWidth]);
      if (process.env.SHOT_SR && sit === "catalogo" && largura === 1100) await page.screenshot({ path: process.env.SHOT_SR.replace(".png", "-1100.png") });
      assert.ok(rr[0] <= rr[1] + 1, sit + " sem barra horizontal a " + largura + "px: " + rr);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.click('#centralSituacoes [data-situacao="' + sit + '"]');
  }
  console.log("ok 0c - nenhuma aba com barra horizontal (1000 a 1920px); Catálogo vazio sem a frase");
  console.log("ok 0 - Ocorrências da separação é aba, com a bolinha, e as abas não têm ícone");
  console.log("ok 1 - Todos e Reservado sem bolinha; Pré-reserva e Orçamento com contagem na bolinha vermelha piscando");
  const todos = await numeros();
  assert.deepStrictEqual(todos.slice(0, 3), ["p2", "p3", "p1"], "pré-reservas no topo, a que vence primeiro em cima: " + todos);
  console.log("ok 2 - pré-reservas no topo da lista");
  await page.click("[data-situacao=orcamento]");
  assert.deepStrictEqual((await numeros()).sort(), ["o1", "o2"]);
  assert.strictEqual(await page.getAttribute("[data-situacao=orcamento]", "aria-pressed"), "true");
  // Nov/2026: linha igual à dos pedidos, com Acompanhamento no lugar do Fluxo
  assert.equal(await page.locator('.cp-acomp-table').count(), 0, "sem a tabela antiga de acompanhamentos");
  const o1 = '#centralPedidosTbody tr[data-pedido-id="o1"]';
  assert.equal((await page.textContent('#centralColFluxo')).trim(), "Acompanhamento");
  assert.equal(await page.locator('#centralColFluxo button').count(), 0, "sem botões no cabeçalho");
  const bts = await page.$$eval(o1 + ' .ca-acoes .ca-btn', (l) => l.map((b) => { const r = b.getBoundingClientRect(), cs = getComputedStyle(b); return { t: b.textContent.trim(), top: r.top, left: r.left, bg: cs.backgroundColor }; }));
  assert.deepStrictEqual(bts.map((b) => b.t), ["Registrar", "Não vai fechar"]);
  assert.ok(bts[1].top > bts[0].top && Math.abs(bts[1].left - bts[0].left) < 2, "um em cima do outro");
  assert.ok(bts.every((b) => b.bg === "rgb(255, 255, 255)"), "fundo branco, só a borda colorida");
  const prox = await page.$eval(o1 + ' .ca-proximo', (e) => e.getBoundingClientRect().right);
  assert.ok(bts[0].left > prox, "ao lado do próximo contato");
  const textoO1 = await page.textContent(o1 + ' .ca-trilha');
  assert.equal(await page.locator(o1 + ' .ca-col').count(), 2, "só dois cards: última resposta e próximo contato");
  assert.match(textoO1, /1º contato/); assert.match(textoO1, /Reunião para decidir/); assert.match(textoO1, /Próximo contato/); assert.doesNotMatch(textoO1, /Orçamento enviado/);
  await page.hover(o1 + ' .ca-ultimo');
  await page.waitForSelector('.ca-historico');
  const hist = await page.textContent('.ca-historico');
  assert.match(hist, /Orçamento enviado.*1º contato.*Reunião para decidir.*Próximo contato/s, "linha do tempo com envio, contatos e próximo");
  assert.equal(await page.$eval('.ca-historico', (e) => getComputedStyle(e).backgroundColor), "rgb(255, 255, 255)");
  assert.equal(await page.textContent('.ca-historico .ca-h-avatar'), "AS", "iniciais de quem fez o contato");
  assert.ok(await page.$eval('.ca-historico .ca-h-topo', (t) => { const b = t.querySelector('b').getBoundingClientRect(), f = t.querySelector('.ca-h-avatar').getBoundingClientRect(); return Math.abs((b.top + b.height / 2) - (f.top + f.height / 2)) < 4 && f.left > b.right; }), 'foto na mesma linha de 1º contato');
  assert.match(await page.getAttribute('.ca-historico .ca-h-avatar img', 'src'), /u1\.jpg/, "foto do avatar de quem fez o contato");
  if (process.env.SHOT_AC) await page.screenshot({ path: process.env.SHOT_AC.replace(".png", "-historico.png") });
  await page.mouse.move(5, 5);
  await page.waitForFunction(() => !document.querySelector('.ca-historico'));
  assert.equal(await page.locator(o1 + ' td').count(), 9, "mesmas 9 colunas da linha dos pedidos");
  assert.match(await page.textContent('#centralPedidosTbody tr[data-pedido-id="o2"] .ca-trilha'), /Orçamento enviado/);
  if (process.env.SHOT_AC) await page.screenshot({ path: process.env.SHOT_AC });
  await page.click(o1 + ' [data-action="acomp-registrar"]');
  await page.waitForSelector('.ca-dialog[open]');
  assert.match(await page.textContent('.ca-dialog'), /2º acompanhamento/);
  if (process.env.SHOT_AC) await page.screenshot({ path: process.env.SHOT_AC.replace(".png", "-registrar.png") });
  await page.click('.ca-dialog [type=submit]');
  assert.equal(await page.locator('.ca-dialog[open]').count(), 1, "sem motivo não registra");
  await page.selectOption('.ca-dialog [name=motivo]', 'Achou o valor alto');
  await page.click('.ca-dialog [type=submit]');
  await page.waitForFunction(() => window.__rpc.some((r) => r.nome === "comercial_followup_registrar" && r.args.p_motivo === "Achou o valor alto" && r.args.p_tipo === "pedido" && r.args.p_alvo === "o1" && r.args.p_proximo));
  await page.waitForFunction(() => !document.querySelector('.ca-dialog'));
  await page.click(o1 + ' [data-action="acomp-nao-fechou"]');
  await page.waitForSelector('.ca-dialog[open]');
  assert.match(await page.textContent('.ca-dialog'), /será cancelado/);
  await page.selectOption('.ca-dialog [name=motivo]', 'Reunião para decidir');
  await page.click('.ca-dialog [type=submit]');
  await page.waitForFunction(() => window.__rpc.some((r) => r.nome === "comercial_followup_nao_fechou" && r.args.p_alvo === "o1"));
  await page.click('[data-situacao=pre_reserva]');
  assert.equal(await page.locator('#centralPedidosTbody tr[data-pedido-id] .ca-trilha').count(), 3, "pré-reserva com o mesmo acompanhamento");
  await page.click('[data-situacao=catalogo]');
  assert.equal(await page.locator('#centralPedidosTbody tr[data-pedido-id] .ca-trilha').count(), 1, "catálogo com o mesmo acompanhamento");
  await page.click('[data-situacao=catalogo]');
  console.log("ok 2b - acompanhamento em colunas no lugar do fluxo, registrar e não vai fechar");
  await page.click("[data-situacao=aprovado]");
  assert.equal((await page.textContent('#centralColFluxo')).trim(), "Fluxo", "volta ao fluxo nos reservados");
  assert.deepStrictEqual(await numeros(), ["r1"]);
  await page.click("[data-situacao=aprovado]");
  assert.strictEqual((await numeros()).length, 8, "clicar de novo mostra todos (7 pedidos + 1 projeto do catálogo)");
  await page.click("[data-situacao=orcamento]");
  await page.click("[data-situacao=\"\"]");
  assert.strictEqual((await numeros()).length, 8, "Todos mostra todos");
  assert.strictEqual(await page.getAttribute("[data-situacao=\"\"]", "aria-pressed"), "true");
  await page.click("[data-situacao=\"\"]");
  assert.strictEqual((await numeros()).length, 8, "Todos de novo continua em todos");
  console.log("ok 3 - clicar filtra e clicar de novo mostra todos");
  // Ordenar por (cabeçalho): número, data do evento e de volta ao padrão; a escolha fica guardada
  assert.strictEqual(await page.inputValue("#centralOrdem"), "padrao");
  await page.selectOption("#centralOrdem", "numero_asc");
  assert.deepStrictEqual(await numeros(), ["o1", "r1", "p1", "p2", "o2", "p3", "c1", "projeto:pj1"], "nº do pedido, menor primeiro");
  await page.selectOption("#centralOrdem", "numero_desc");
  assert.deepStrictEqual((await numeros())[0], "projeto:pj1");
  await page.selectOption("#centralOrdem", "evento_antigo");
  assert.deepStrictEqual((await numeros()).slice(0, 3), ["p2", "p3", "p1"], "evento mais antigo primeiro");
  await page.selectOption("#centralOrdem", "evento_recente");
  assert.deepStrictEqual((await numeros())[0], "c1", "evento mais recente primeiro");
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll("#centralTabelaPedidos tr, .central-table tbody tr").length > 1);
  assert.strictEqual(await page.inputValue("#centralOrdem"), "evento_recente", "a escolha fica guardada");
  await page.selectOption("#centralOrdem", "padrao");
  assert.deepStrictEqual((await numeros()).slice(0, 3), ["p2", "p3", "p1"]);
  console.log("ok 4 - ordenar por número, data do evento e padrão; escolha guardada");
  await page.screenshot({ path: process.env.FOTO || path.join(require("os").tmpdir(), "central-situacoes.png"), clip: { x: 0, y: 0, width: 1440, height: 420 } });
  assert.deepStrictEqual(erros, []);
  await browser.close();
  console.log("todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });
