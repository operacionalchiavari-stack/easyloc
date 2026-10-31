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
    clientes_empresas: [{ empresa_id: "e1", nome_razao: "Lis Baêtas", catalogo_logo_url: "https://fixture/lis.png" }]
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
    rpc: (nome) => ({ then: (ok, erro) => Promise.resolve(nome === "funcionario_contexto"
      ? { data: { ativo: true, administrador_legado: true }, error: null } : { data: nome==='comercial_acompanhamentos'?contatos:[], error: null }).then(ok, erro) }),
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
  await page.goto(BASE + "Modulos/Comercial/Pedidos/CentralPedidos.html");
  await page.waitForSelector("[data-situacao=pre_reserva] .central-situacao-conta", { timeout: 15000 });
  const numeros = () => page.$$eval("#centralPedidosTbody [data-pedido-id]", (l) => l.map((t) => t.dataset.pedidoId));
  const botoes = await page.$$eval("[data-situacao]", (l) => l.map((b) => ({ s: b.dataset.situacao, t: b.querySelector("b").textContent, n: b.querySelector(".central-situacao-conta")?.textContent || null, small: b.querySelector("small")?.textContent || "", anim: b.querySelector(".central-situacao-conta") && getComputedStyle(b.querySelector(".central-situacao-conta")).animationName, cor: b.querySelector(".central-situacao-conta") && getComputedStyle(b.querySelector(".central-situacao-conta")).backgroundColor })));
  assert.deepStrictEqual(botoes.map((b) => [b.t, b.n]), [["Todos", null], ["Pré-reserva", "3"], ["Orçamento", "2"], ["Reservado", null]]);
  assert.ok(botoes.filter((b) => b.n).every((b) => b.cor === "rgb(230, 0, 18)" && b.anim === "central-situacao-pulsa"), "bolinha vermelha piscando");
  assert.strictEqual(await page.getAttribute("[data-situacao=\"\"]", "aria-pressed"), "true", "Todos começa ativo");
  assert.strictEqual(botoes[1].small, "1 vencida · 1 vencendo");
  console.log("ok 1 - Todos e Reservado sem bolinha; Pré-reserva e Orçamento com contagem na bolinha vermelha piscando");
  const todos = await numeros();
  assert.deepStrictEqual(todos.slice(0, 3), ["p2", "p3", "p1"], "pré-reservas no topo, a que vence primeiro em cima: " + todos);
  console.log("ok 2 - pré-reservas no topo da lista");
  await page.click("[data-situacao=orcamento]");
  assert.deepStrictEqual((await numeros()).sort(), ["o1", "o2"]);
  assert.strictEqual(await page.getAttribute("[data-situacao=orcamento]", "aria-pressed"), "true");
  assert.equal(await page.locator('.cp-acomp-filtros').isVisible(),false,'sem faixa de filtros na tabela');
  assert.equal(await page.locator('#centralListaTabela .cp-acomp-filtros').count(),0);
  await page.click('#btnFiltrosPedidos');
  assert.equal(await page.locator('#centralFiltrosPedidos .cp-acomp-filtros').isVisible(),true,'Filtros do topo abre os controles da aba');
  await page.selectOption('[data-prazo]','hoje');
  assert.equal((await numeros()).length,0,'retornos filtrados pelo painel comum');
  await page.selectOption('[data-prazo]','');
  assert.equal((await numeros()).length,2);
  await page.click('[data-central-visao=receber]');
  assert.equal(await page.locator('#centralFiltrosPedidos').isVisible(),true);
  assert.equal(await page.locator('.cp-acomp-filtros').isVisible(),false,'contas a receber não mostra filtros de acompanhamento');
  assert.match(await page.locator('#filtroDataInicialPedido').locator('..').innerText(),/Vencimento de/i);
  await page.click('[data-central-visao=pedidos]');
  assert.equal(await page.locator('.cp-acomp-filtros').isVisible(),true);
  await page.click('#btnFiltrosPedidos');
  assert.equal(await page.locator('#centralFiltrosPedidos').isVisible(),false);
  async function conferirAlinhamento(){
    const r=await page.locator('.cp-acomp-table').evaluate(t=>{
      const cab=[...t.querySelectorAll('thead th')].map(c=>c.getBoundingClientRect());
      const linhas=[...t.querySelectorAll('tbody tr[data-pedido-id]')];
      return {larguraNumero:cab[0].width,colunas:linhas.every(tr=>[...tr.cells].every((c,i)=>Math.abs(c.getBoundingClientRect().left-cab[i].left)<1)),semSobreposicao:linhas.every(tr=>[...tr.cells].every(c=>{const range=document.createRange();range.selectNodeContents(c);const texto=range.getBoundingClientRect(),celula=c.getBoundingClientRect();return texto.right<=celula.right+1&&texto.left>=celula.left-1;}))};
    });
    assert.ok(r.larguraNumero>=180,JSON.stringify(r));assert.ok(r.colunas,JSON.stringify(r));assert.ok(r.semSobreposicao,JSON.stringify(r));
  }
  await conferirAlinhamento();
  await page.screenshot({path:path.join(raiz,'outputs/central-orcamentos-alinhados.png'),fullPage:true});
  await page.click('[data-situacao=pre_reserva]');await conferirAlinhamento();
  assert.equal(await page.locator('.cp-acomp-validade').count(),3);
  await page.screenshot({path:path.join(raiz,'outputs/central-prereserva-alinhada.png'),fullPage:true});
  await page.click("[data-situacao=aprovado]");
  assert.equal(await page.locator('.cp-acomp-table').count(),0,'retorna ao layout original nos reservados');
  assert.deepStrictEqual(await numeros(), ["r1"]);
  await page.click("[data-situacao=aprovado]");
  assert.strictEqual((await numeros()).length, 7, "clicar de novo mostra todos");
  await page.click("[data-situacao=orcamento]");
  await page.click("[data-situacao=\"\"]");
  assert.strictEqual((await numeros()).length, 7, "Todos mostra todos");
  assert.strictEqual(await page.getAttribute("[data-situacao=\"\"]", "aria-pressed"), "true");
  await page.click("[data-situacao=\"\"]");
  assert.strictEqual((await numeros()).length, 7, "Todos de novo continua em todos");
  console.log("ok 3 - clicar filtra e clicar de novo mostra todos");
  // Ordenar por (cabeçalho): número, data do evento e de volta ao padrão; a escolha fica guardada
  assert.strictEqual(await page.inputValue("#centralOrdem"), "padrao");
  await page.selectOption("#centralOrdem", "numero_asc");
  assert.deepStrictEqual(await numeros(), ["o1", "r1", "p1", "p2", "o2", "p3", "c1"], "nº do pedido, menor primeiro");
  await page.selectOption("#centralOrdem", "numero_desc");
  assert.deepStrictEqual((await numeros())[0], "c1");
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
