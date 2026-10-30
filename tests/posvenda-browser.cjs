// Out/2026 — Pós-venda: ligações vindas da Posição final, formulário de múltipla escolha, não atendeu / não ligar;
// e o card de Parâmetros > Comercial (regras e formulário).
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const hoje = new Date().toISOString().slice(0, 10);
const futuro = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
const cfg = { intervalo_dias: 15, novo_ate_pedidos: 1, dias_apos_posicao: 1, prazo_dias: 5, tentar_dias: 2, max_tentativas: 3, agrupar: true, observacao: true,
  perguntas: [
    { id: "atendimento", texto: "Como foi o atendimento comercial?", tipo: "unica", obrigatoria: true, opcoes: [{ id: "a1", texto: "Excelente" }, { id: "a4", texto: "Ruim", ruim: true }] },
    { id: "gostou", texto: "O que mais gostou?", tipo: "multipla", obrigatoria: false, opcoes: [{ id: "g1", texto: "Atendimento" }, { id: "g2", texto: "Acervo" }] }] };
const mock = `(() => {
  window.__rpc = [];
  const cfg = ${JSON.stringify(cfg)};
  const contatos = [
    { id: "c1", cliente_nome: "Kelly Khawam", telefone: "(24) 99999-0001", novo: true, status: "pendente", disponivel_em: "${hoje}", prazo: "${hoje}", tentativas: 0, pedidos: [{ id: "p1", numero: "1", data_evento: "2026-10-25", tipo: "Casamento", local: "Villa" }, { id: "p2", numero: "2", data_evento: "2026-10-26", tipo: "Aniversário", local: "Casa" }] },
    { id: "c2", cliente_nome: "Fabiane Gabrich", telefone: "24999990002", novo: false, status: "pendente", disponivel_em: "${futuro}", prazo: "${futuro}", ultimo_contato: "2026-10-20T10:00:00Z", pedidos: [{ id: "p3", numero: "3", data_evento: "2026-10-27", local: "Sítio" }] },
    { id: "c3", cliente_nome: "Ana", status: "concluido", atencao: true, concluido_em: "2026-10-28T10:00:00Z", feito_por_nome: "Igor", respostas: [{ pergunta: "Como foi o atendimento comercial?", respostas: ["Ruim"], ruim: true }], pedidos: [] }];
  const r = (data) => Promise.resolve({ data, error: null });
  const rpc = (n, a) => {
    window.__rpc.push({ n, a });
    if (n === "posvenda_lista") return r({ config: cfg, hoje: "${hoje}", contatos });
    if (n === "posvenda_registrar") { const c = contatos.find((x) => x.id === a.p_contato); if (a.p_acao === "concluir") Object.assign(c, { status: "concluido", concluido_em: new Date().toISOString(), respostas: [] }); if (a.p_acao === "dispensar") Object.assign(c, { status: "dispensado", motivo: a.p_motivo }); if (a.p_acao === "nao_atendeu") c.tentativas++; return r(c); }
    if (n === "posvenda_cfg") return r(cfg);
    if (n === "posvenda_config_salvar") return r(a.p_config);
    return r(null);
  };
  const consulta = () => { const q = { select(){return q}, eq(){return q}, order(){return q}, maybeSingle(){return q}, then(ok){ return Promise.resolve({ data: null, error: null }).then(ok); } }; return q; };
  const cliente = { auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }), getUser: async () => ({ data: { user: { id: "u1" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) }, from: consulta, rpc };
  window.supabase = { createClient: () => cliente };
  window.__CONTEXT = { empresa_id: "e1", usuario_id: "u1", usuario_nome: "Igor" };
  window.aguardarContexto = async () => window.__CONTEXT;
  window.confirmarGlobal = async () => true;
  window.EasyLocPermissions = { load: async () => {}, hasPermission: () => true, canNavigate: () => true, applyVisibility(){}, guardPage(){} };
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide/.test(e.message)) erros.push(e.message); });
  page.on("dialog", (d) => d.dismiss());
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); });
  await page.route("**/*", (rt) => {
    const u = rt.request().url();
    if (u.includes("supabase-js")) return rt.fulfill({ contentType: "text/javascript", body: mock });
    if (/permissions\.js|context\.js|alerta\.js/.test(u)) return rt.fulfill({ contentType: "text/javascript", body: "" });
    if (u.startsWith(BASE)) {
      if (u.includes("teste-param.html")) return rt.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/Modulos/Configuracoes/Parametros/parametros.css"></head><body><div id="host"></div><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script src="/js/core/supabase.js"></script><script src="/Modulos/Configuracoes/Parametros/parametros-posvenda.js"></script><script>carregarParametrosPosVenda(document.getElementById("host"),"e1").then(()=>window.__pronto=1)</script></body></html>' });
      const f = path.join(raiz, decodeURIComponent(new URL(u).pathname));
      if (!fs.existsSync(f)) return rt.fulfill({ status: 404, body: "" });
      return rt.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" });
    }
    return rt.abort();
  });

  await page.goto(BASE + "Modulos/Chiavari/Feedback/feedback.html");
  await page.waitForSelector(".pv-tabela tbody tr");
  const linhas = page.locator(".pv-tabela tbody tr");
  assert.strictEqual(await linhas.count(), 2, "Ligações: a de hoje e a próxima, na mesma tabela");
  const t = await linhas.nth(0).innerText();
  assert.ok(/Kelly Khawam/.test(t) && /Cliente novo/.test(t) && /Pedido 1/.test(t) && /Pedido 2/.test(t) && /Ligar agora/.test(t), "uma ligação cobre os 2 eventos: " + t);
  assert.ok(/A partir de/.test(await linhas.nth(1).innerText()), "a próxima mostra quando liga");
  assert.strictEqual(await page.locator("#pvContHoje").innerText(), "1");
  assert.strictEqual(await page.locator("#pvContAtencao").innerText(), "1");
  assert.strictEqual(await page.locator("#pvRegras").count(), 0, "sem a frase de regras");
  assert.strictEqual(await page.locator("#pvAbas.el-tabs [role=tab]").count(), 3, "abas globais");
  const topo = await page.evaluate(() => { const h = document.querySelector(".pv-topo h1").getBoundingClientRect(), a = document.querySelector("#pvAbas").getBoundingClientRect(); return Math.abs((h.top + h.bottom) / 2 - (a.top + a.bottom) / 2); });
  assert.ok(topo < 20, "abas na linha do título: " + topo);
  await page.click('[data-aba="atencao"]');
  assert.ok(/Ana/.test(await page.locator(".pv-tabela tbody").innerText()) && (await page.locator(".pv-tabela .pv-ruim").count()) === 1, "resposta ruim em vermelho");
  await page.click('[data-ver="c3"]');
  assert.strictEqual(await page.locator("#pvForm .pv-resp dd.ruim").count(), 1); await page.click("#pvForm [data-fechar]");
  console.log("ok 1 - tabela; Ligações (hoje + próximas) / Precisam de atenção; abas globais na linha do título");

  await page.click('[data-aba="ligacoes"]');
  await page.click('[data-registrar="c1"]');
  await page.waitForSelector("#pvForm[open]");
  assert.strictEqual(await page.locator("#pvForm .pv-perg").count(), 2);
  assert.strictEqual(await page.locator('#pvForm input[name="gostou"][type=checkbox]').count(), 2, "várias respostas = caixinhas");
  await page.click('#pvForm button[type=submit]');
  assert.ok(/Responda: Como foi o atendimento/.test(await page.locator("#pvFormErro").innerText()), "obrigatória");
  await page.click('#pvForm label.pv-opcao:has(input[value="a1"])');
  await page.click('#pvForm label.pv-opcao:has(input[value="g1"])'); await page.click('#pvForm label.pv-opcao:has(input[value="g2"])');
  await page.fill('#pvForm textarea[name="__obs"]', "Tudo ótimo");
  await page.click('#pvForm button[type=submit]');
  await page.waitForFunction(() => window.__rpc.some((x) => x.n === "posvenda_registrar"));
  const reg = await page.evaluate(() => window.__rpc.find((x) => x.n === "posvenda_registrar").a);
  assert.deepStrictEqual(reg.p_respostas, { atendimento: "a1", gostou: ["g1", "g2"] });
  assert.strictEqual(reg.p_observacao, "Tudo ótimo");
  console.log("ok 2 - formulário de múltipla escolha: obrigatória, uma/várias respostas e observação");

  // ---------------- Parâmetros
  await page.goto(BASE + "teste-param.html");
  await page.waitForFunction(() => window.__pronto === 1);
  assert.strictEqual(await page.inputValue('.pr-posvenda-regras [name=intervalo_dias]'), "15");
  await page.fill('.pr-posvenda-regras [name=intervalo_dias]', "20");
  await page.click('.pr-posvenda-regras button[type=submit]');
  await page.waitForFunction(() => window.__rpc.some((x) => x.n === "posvenda_config_salvar"));
  assert.strictEqual(await page.evaluate(() => window.__rpc.filter((x) => x.n === "posvenda_config_salvar").pop().a.p_config.intervalo_dias), 20);
  await page.click("[data-nova-pergunta]");
  const nova = page.locator(".pr-pv-pergunta").last();
  await nova.locator("[data-k=texto]").fill("A montagem ficou como combinado?");
  await nova.locator("[data-o=texto]").nth(0).fill("Sim"); await nova.locator("[data-o=texto]").nth(1).fill("Não");
  await nova.locator("[data-o=ruim]").nth(1).check();
  await page.click("[data-salvar-form]");
  await page.waitForFunction(() => window.__rpc.filter((x) => x.n === "posvenda_config_salvar").length === 2);
  const salvo = await page.evaluate(() => window.__rpc.filter((x) => x.n === "posvenda_config_salvar").pop().a.p_config.perguntas);
  assert.strictEqual(salvo.length, 3);
  assert.strictEqual(salvo[2].texto, "A montagem ficou como combinado?");
  assert.ok(salvo[2].opcoes[1].ruim === true && salvo[2].opcoes[0].texto === "Sim");
  console.log("ok 3 - Parâmetros: regras e nova pergunta com opção 'ruim'");
  assert.deepStrictEqual(erros, []);
  console.log("todos os testes passaram");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
