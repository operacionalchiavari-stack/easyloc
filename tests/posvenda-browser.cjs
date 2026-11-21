// Out/2026 — Pós-venda: ligações vindas da Posição final, formulário de múltipla escolha, não atendeu / não ligar;
// e o card de Parâmetros > Comercial (regras e formulário).
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const hoje = new Date().toISOString().slice(0, 10);
const futuro = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
const cfg = { categorias: [{ id: "c1", nome: "Atendimento" }, { id: "c2", nome: "Gostou" }], intervalo_dias: 15, novo_ate_pedidos: 1, dias_apos_posicao: 1, prazo_dias: 5, tentar_dias: 2, max_tentativas: 3, agrupar: true, observacao: true,
  perguntas: [
    { id: "atendimento", categoria: "c1", texto: "Como foi o atendimento comercial?", tipo: "unica", obrigatoria: true, opcoes: [{ id: "a1", texto: "Excelente" }, { id: "a4", texto: "Ruim", ruim: true }] },
    { id: "gostou", categoria: "c2", texto: "O que mais gostou?", tipo: "multipla", obrigatoria: false, opcoes: [{ id: "g1", texto: "Atendimento" }, { id: "g2", texto: "Acervo" }] }] };
const mock = `(() => {
  window.__rpc = [];
  const cfg = ${JSON.stringify(cfg)};
  const contatos = [
    { id: "c1", cliente_nome: "Kelly Khawam", telefone: "(24) 99999-0001", novo: true, status: "pendente", disponivel_em: "${hoje}", prazo: "${hoje}", tentativas: 0, ultima_ligacao: { em: "2026-10-20T10:00:00Z", por: "Igor", atencao: true, ruins: ["Coleta"], observacao: "Atrasou a coleta" }, historico: [{ em: "2026-10-20T10:00:00Z", por: "Igor", atencao: true, observacao: "Atrasou a coleta", respostas: [{ pergunta: "Como foi o atendimento comercial?", respostas: ["Excelente"] }, { pergunta: "O que mais gostou?", respostas: ["Acervo"] }, { pergunta: "Coleta", respostas: ["Atrasou"], ruim: true }], elogios: ["Montadores muito educados"], criticas: ["Faltou uma cadeira"] }], pedidos: [{ id: "p1", numero: "1", data_evento: "2026-10-25", tipo: "Casamento", local: "Villa", montador: { nome: "Eduardo Pacheco", funcionario_id: "f1" }, posicao_final: true, ocorrencias: 2, valor: 5558.62, vendedor: { nome: "Carla Nogueira", usuario_id: "u9" }, problemas: [{ tipo: "atraso_inicio", qtd: 2 }, { tipo: "carregamento_incompleto", qtd: 1, itens: ["Estante Lotus"] }], separacao_problemas: 1, etapas: [{ tipo: "montagem", nome: "Montagem", data: "2026-10-25", hora: "08:00:00", pessoas: [{ nome: "Eduardo Pacheco", papel: "responsavel", funcionario_id: "f1", setor: "Montagem" }, { nome: "Joana Free", papel: "equipe", free: true, free_foto: "https://fixture/joana.jpg" }], caminhoes: [{ codigo: "G", placa: "HBZ7I14", modelo: "Mercedes 1620", foto_url: "https://fixture/g.jpg" }] }, { tipo: "desmontagem", nome: "Desmontagem", data: "2026-10-27", pessoas: [], caminhoes: [{ codigo: "G", placa: "HBZ7I14", modelo: "Mercedes 1620" }, { codigo: "FR01", placa: "ABC1D23", terceiro: "Fretes Silva" }] }] }, { id: "p2", numero: "2", data_evento: "2026-10-26", tipo: "Aniversário", local: "Casa" }] },
    { id: "c2", cliente_nome: "Fabiane Gabrich", telefone: "24999990002", novo: false, status: "pendente", disponivel_em: "${futuro}", prazo: "${futuro}", ultimo_contato: "2026-10-20T10:00:00Z", pedidos: [{ id: "p3", numero: "3", data_evento: "2026-10-27", local: "Sítio" }] },
    { id: "c4", cliente_nome: "Bruna Lima", status: "concluido", atencao: false, concluido_em: "2026-10-29T10:00:00Z", feito_por_nome: "Carla", respostas: [{ pergunta: "Como foi o atendimento comercial?", respostas: ["Excelente"] }], observacoes_setor: { montagem: "Equipe muito educada" }, pedidos: [{ id: "p9", numero: "9", data_evento: "2026-10-20", tipo: "Casamento", local: "Villa" }] },
    { id: "c3", cliente_nome: "Ana", tratativa_responsavel: "Carla", status: "concluido", atencao: true, concluido_em: "2026-10-28T10:00:00Z", feito_por_nome: "Igor", respostas: [{ pergunta: "Como foi o atendimento comercial?", respostas: ["Ruim"], ruim: true }], pedidos: [] }];
  const r = (data) => Promise.resolve({ data, error: null });
  const rpc = (n, a) => {
    window.__rpc.push({ n, a });
    if (n === "posvenda_lista") return r({ config: cfg, hoje: "${hoje}", contatos });
    if (n === "posvenda_registrar") { const c = contatos.find((x) => x.id === a.p_contato); if (a.p_acao === "concluir") Object.assign(c, { status: "concluido", concluido_em: new Date().toISOString(), respostas: [] }); if (a.p_acao === "dispensar") Object.assign(c, { status: "dispensado", motivo: a.p_motivo }); if (a.p_acao === "nao_atendeu") c.tentativas++; return r(c); }
    if (n === "posvenda_posicao_final") return r({ pedido: { id: "p1", numero_pedido: "1", cliente_nome: "Kelly Khawam", local_nome: "Villa", data_evento: "2026-10-25" }, titulos: [], pagamentos: [], salvo: { status: "confirmado", confirmado_em: "2026-10-27T10:00:00Z", itens: [{ tipo: "avaria", nome: "Cadeira Tiffany", quantidade: 2, valor: 80, decisao: "cobrar" }] } });
    if (n === "posvenda_equipe_marcar") { window.__eq = a; window.__eqDb = (window.__eqDb || []).filter((f) => !(f.pedido_id === a.p_pedido && f.etapa === a.p_etapa && f.nome === a.p_nome)); if (a.p_tipo) window.__eqDb.push({ pedido_id: a.p_pedido, etapa: a.p_etapa, nome: a.p_nome, tipo: a.p_tipo }); return r(window.__eqDb); }
    if (n === "posvenda_observacoes_setor") return r(a.p_obs);
    if (n === "posvenda_painel") { window.__painel = a; return r({ config: cfg, hoje: "${hoje}", pendentes: { total: 4, atrasadas: 1 },
      contatos: [
        { id: "h1", cliente_nome: "Bruna Lima", status: "concluido", concluido_em: "2026-10-29T10:00:00Z", prazo: "2026-10-30", feito_por_nome: "Carla", feito_por: "u2", respostas: [{ pergunta: "Como foi o atendimento comercial?", respostas: ["Excelente"] }], observacoes_setor: { montagem: "Equipe muito educada" }, pedidos: [{ id: "p9", numero: "9", vendedor: { nome: "Ana Paula", usuario_id: "u3" } }] },
        { id: "h2", cliente_nome: "Ana", status: "concluido", atencao: true, concluido_em: "2026-10-28T10:00:00Z", prazo: "2026-10-27", feito_por_nome: "Igor", respostas: [{ pergunta: "Como foi o atendimento comercial?", respostas: ["Ruim"], ruim: true }], pedidos: [{ id: "p8", numero: "8", vendedor: { nome: "Ana Paula", usuario_id: "u3" } }] },
        { id: "h3", cliente_nome: "Rita", status: "sem_contato", ultima_tentativa_em: "2026-10-20T10:00:00Z", feito_por_nome: "Igor", pedidos: [] }],
      equipe: [{ nome: "Eduardo Pacheco", funcionario_id: "f1", setor: "Montagem", tipo: "elogio", etapa: "montagem", pedido: "9", cliente: "Bruna Lima", em: "2026-10-29T10:00:00Z", por: "Carla" },
        { nome: "Eduardo Pacheco", funcionario_id: "f1", setor: "Montagem", tipo: "elogio", etapa: "desmontagem", pedido: "8", cliente: "Ana", em: "2026-10-28T10:00:00Z", por: "Igor" },
        { nome: "Joana Free", free_id: "fr1", tipo: "negativo", etapa: "montagem", pedido: "8", cliente: "Ana", em: "2026-10-28T10:00:00Z", por: "Igor" }] }); }
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
  assert.strictEqual(await page.locator("#pvAbas.el-tabs [role=tab]").count(), 4, "abas globais (com Conversas)");
  const topo = await page.evaluate(() => { const h = document.querySelector(".pv-topo h1").getBoundingClientRect(), a = document.querySelector("#pvAbas").getBoundingClientRect(); return Math.abs((h.top + h.bottom) / 2 - (a.top + a.bottom) / 2); });
  assert.ok(topo < 20, "abas na linha do título: " + topo);
  await page.click('[data-aba="atencao"]');
  assert.ok(/Ana/.test(await page.locator(".pv-tabela tbody").innerText()) && (await page.locator(".pv-tabela .pv-curto.ruim").count()) === 1, "resposta ruim em vermelho");
  { const tb = await page.locator(".pv-tabela tbody").innerText(); assert.match(tb, /Retorno|Carla/); assert.match(tb, /Aguardando retorno/); }
  assert.match(await page.locator(".pv-tabela thead").innerText(), /VALOR.*VENDIDO POR.*RECLAMAÇÃO.*AGUARDA HÁ.*RETORNO AO CLIENTE.*QUEM LIGOU/is);
  for (const w of [1360, 1100]) { await page.setViewportSize({ width: w, height: 900 }); assert.ok(await page.evaluate(() => { const r = document.querySelector(".pv-rolar"); return r.scrollWidth <= r.clientWidth + 1; }), "sem barra lateral em " + w); }
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.click('[data-aba="feitas"]');
  { const tb = await page.locator(".pv-tabela tbody").innerText(); assert.match(tb, /Bruna Lima.*Tudo bem.*Excelente.*atendimento comercial/s);
    assert.ok(await page.evaluate(() => [...document.querySelectorAll(".pv-tabela tbody tr")].every((tr) => tr.getBoundingClientRect().height < 90)), "linhas baixas"); }
  await page.click('[data-aba="atencao"]');
  await page.click('[data-ver="c3"]');
  await page.waitForSelector("#pvLateral.aberta");
  { const lt = await page.textContent("#pvLateral"); assert.match(lt, /Ana.*Retorno ao cliente.*O que o cliente disse.*Ruim/s); }
  assert.strictEqual(await page.locator("#pvLateral .pv-disse.ruim").count(), 1);
  assert.ok(await page.evaluate(() => { const r = document.querySelector("#pvLateral .pvd-tela").getBoundingClientRect(); return r.left === 0 && r.right >= innerWidth - 1 && r.width >= innerWidth - 1; }), "detalhe em tela inteira");
  assert.match(await page.locator('#pvLateral .pvd-historico').innerText(), /Linha do tempo.*Ligação registrada/s);
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains('pvd-aberta') && document.querySelector('.pv-page').inert), 'lista protegida enquanto o detalhe está aberto');
  await page.keyboard.press("Escape"); await page.waitForFunction(() => !document.querySelector("#pvLateral.aberta"));
  assert.ok(await page.evaluate(() => !document.querySelector('.pv-page').inert), 'lista volta a receber foco');
  console.log("ok 1 - tabela; Ligações (hoje + próximas) / Precisam de atenção; abas globais na linha do título");

  await page.click('[data-aba="ligacoes"]');
  assert.strictEqual(await page.locator('.pv-tabela tbody [data-registrar]').count(), 0, "botões saíram da linha");
  { const tb = await page.locator(".pv-tabela tbody").innerText();
    assert.match(tb, /Eduardo Pacheco/); assert.match(tb, /R\$\s*5\.558,62/); assert.match(await page.locator('.pv-tabela tbody tr >> nth=0').locator('td >> nth=4').innerText(), /Carla Nogueira/); assert.match(await page.locator('.pv-tabela tbody tr >> nth=0').locator('td >> nth=3').innerText(), /5\.558,62/); assert.doesNotMatch(await page.locator('.pv-tabela tbody tr >> nth=0').locator('td >> nth=2').innerText(), /R\$/); assert.match(await page.locator('.pv-tabela thead').innerText(), /VALOR DO PEDIDO/i); assert.match(await page.locator('.pv-tabela thead').innerText(), /VALOR DO PEDIDO.*VENDIDO POR/is); assert.match(await page.locator('.pv-tabela tbody tr >> nth=0').locator('td >> nth=3').innerText(), /R\$\s*5\.558,62/); assert.doesNotMatch(await page.locator('.pv-tabela tbody tr >> nth=0').locator('td >> nth=2').innerText(), /R\$/); assert.match(tb, /4 problemas/); assert.match(tb, /Teve reclamação/); assert.doesNotMatch(await page.locator(".pv-tabela thead").innerText(), /TENTATIVAS/i); assert.match(tb, /2 ocorrências/); assert.match(tb, /Posição não confirmada/);
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector(".pv-tabela tbody td")).boxShadow), "none", "sem faixa colorida");
    await page.click('.pv-tabela [data-posicao="p1"] >> nth=0'); await page.waitForSelector("dialog.pf-documento-modal[open]");
    assert.strictEqual(await page.locator("#pvGaveta.aberta").count(), 0, "o documento não abre a ligação");
    assert.ok(await page.evaluate(() => window.__rpc.some((x) => x.n === "posvenda_posicao_final" && x.a.p_pedido === "p1")));
    await page.waitForFunction(() => /Cadeira Tiffany/.test(document.querySelector("dialog.pf-documento-modal iframe")?.contentDocument?.body?.innerText || ""));
    await page.click("dialog.pf-documento-modal [data-fechar]"); }
  await page.click('[data-abrir-lig="c1"]'); await page.waitForSelector('#pvGaveta.aberta');
  assert.match(await page.textContent('#pvGaveta'), /Kelly Khawam/); assert.match(await page.textContent('#pvGaveta'), /Responsável pela montagem/); assert.match(await page.textContent('#pvGaveta .pv-prob-lista'), /Atraso no início da etapa \(2×\).*Carregamento incompleto: Estante Lotus.*separação/s); assert.match(await page.textContent('#pvGaveta header'), /Kelly Khawam.*Telefone.*Situação.*Tentativas.*Última ligação/s);
  { const [v, f] = await page.evaluate(() => [".pv-gaveta-voltar", "#pvGaveta header .pv-foto"].map((q) => document.querySelector(q).getBoundingClientRect()).map((r) => ({ y: r.y + r.height / 2, h: r.height })));
    assert.ok(Math.abs(v.y - f.y) < 6, "na linha do Voltar"); assert.ok(f.h >= 50 && f.h <= 64, "foto de tamanho médio"); }
  assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector("#pvGaveta header .pv-cli b")).fontWeight), "500", "nome sem negrito");
  assert.match(await page.textContent('#pvGaveta .pv-gav-abas'), /Eventos desta ligação.*Equipe.*2.*Caminhão.*2/s);
  assert.ok(await page.locator('[data-gav-painel="equipe"]').isHidden());
  await page.click('[data-gav-aba="equipe"]'); assert.ok(await page.locator('[data-gav-painel="eventos"]').isHidden());
  { const eq = await page.textContent('[data-gav-painel="equipe"]'); assert.match(eq, /Montagem.*25\/10\/2026.*08:00.*Eduardo Pacheco.*Responsável.*Joana Free.*Freelancer/s); assert.doesNotMatch(eq, /Desmontagem/); }
  { const b = page.locator('[data-gav-painel="equipe"] [data-eq-fb="elogio"][data-nome="Eduardo Pacheco"]');
    await b.click(); await page.waitForFunction(() => window.__eq?.p_nome === "Eduardo Pacheco");
    assert.deepStrictEqual(await page.evaluate(() => ({ t: window.__eq.p_tipo, e: window.__eq.p_etapa, p: window.__eq.p_pedido })), { t: "elogio", e: "montagem", p: "p1" });
    assert.match(await b.getAttribute("class"), /(^| )on( |$)/);
    await page.click('[data-gav-painel="equipe"] [data-eq-fb="negativo"][data-nome="Joana Free"]'); await page.waitForFunction(() => window.__eq?.p_nome === "Joana Free" && window.__eq.p_tipo === "negativo");
    await b.click(); await page.waitForFunction(() => window.__eq?.p_nome === "Eduardo Pacheco" && window.__eq.p_tipo === null);
    assert.doesNotMatch(await b.getAttribute("class"), /(^| )on( |$)/, "clicar de novo desfaz"); }
  await page.click('[data-gav-aba="caminhao"]');
  { const cm = await page.textContent('[data-gav-painel="caminhao"]'); assert.match(cm, /G · Mercedes 1620.*Placa HBZ7I14 · Frota própria.*Montagem 25\/10.*Desmontagem 27\/10.*FR01.*Terceirizado · Fretes Silva/s);
    assert.strictEqual(await page.locator('[data-gav-painel="caminhao"] .pv-cam').count(), 2, "um cartão por caminhão"); }
  await page.click('[data-gav-aba="eventos"]');
  { const bom = await page.textContent('#pvGaveta .pv-fb-card.bom'), ruim = await page.textContent('#pvGaveta .pv-fb-card.ruim');
    assert.match(bom, /Como foi o atendimento comercial — Excelente.*Gostou de: Acervo.*Montadores muito educados/s); assert.doesNotMatch(bom, /Atrasou/);
    assert.match(ruim, /Coleta — Atrasou.*Faltou uma cadeira.*Atrasou a coleta/s); }
  await page.waitForSelector("#pvGaveta .pv-gav-form #pvFormulario", { timeout: 3000 });
  assert.strictEqual(await page.locator("#pvForm[open]").count(), 0, "sem janela por cima: as perguntas já aparecem na tela da ligação");
  assert.ok(await page.locator("#pvGaveta .pv-gaveta-acoes").isHidden(), "sem o botão Registrar ligação");
  assert.match(await page.textContent('#pvGaveta .pv-gav-form footer'), /Não atendeu.*Não ligar.*Salvar ligação/s);
  { const [i, f] = await page.evaluate(() => [document.querySelector("#pvGaveta .pv-gav-info").getBoundingClientRect(), document.querySelector("#pvGaveta .pv-gav-form").getBoundingClientRect()].map((r) => ({ x: r.x, y: r.y, w: r.width })));
    assert.ok(f.x > i.x + i.w - 1 && Math.abs(f.y - i.y) < 30, "duas colunas: dados à esquerda, perguntas à direita"); assert.ok(i.w + f.w > 1100, "usa a largura da tela"); }
  assert.strictEqual(await page.locator("#pvGaveta .pv-gav-form .pv-perg").count(), 2);
  assert.deepStrictEqual((await page.locator("#pvGaveta .pv-gav-form [data-form-aba]").allInnerTexts()).map((x) => x.trim()), ["ATENDIMENTO", "GOSTOU", "OBSERVAÇÃO"], "uma aba por categoria + Observação");
  await page.click('[data-form-aba="obs"]'); assert.ok(await page.locator('[data-form-painel="c0"]').isHidden());
  assert.strictEqual(await page.locator('#pvGaveta .pv-gav-form input[name="gostou"][type=checkbox]').count(), 2, "várias respostas = caixinhas");
  await page.click('#pvGaveta .pv-gav-form button[type=submit]');
  assert.ok(/Responda: Como foi o atendimento/.test(await page.locator("#pvFormErro").innerText()), "obrigatória");
  assert.ok(await page.locator('[data-form-painel="c0"]').isVisible(), "volta para a aba da pergunta que falta");
  await page.click('#pvGaveta .pv-gav-form label.pv-opcao:has(input[value="a1"])');
  assert.match(await page.locator('[data-form-aba="c0"]').getAttribute("class"), /feita/, "✓ na aba respondida");
  await page.click('[data-form-aba="c1"]');
  await page.click('#pvGaveta .pv-gav-form label.pv-opcao:has(input[value="g1"])'); await page.click('#pvGaveta .pv-gav-form label.pv-opcao:has(input[value="g2"])');
  await page.click('[data-form-aba="obs"]');
  await page.fill('#pvGaveta .pv-gav-form textarea[name="__obs"]', "Tudo ótimo");
  await page.fill('#pvGaveta .pv-gav-form textarea[name="__obs_montagem"]', "Montagem impecável");
  await page.click('#pvGaveta .pv-gav-form button[type=submit]');
  await page.waitForFunction(() => window.__rpc.some((x) => x.n === "posvenda_registrar"));
  const reg = await page.evaluate(() => window.__rpc.find((x) => x.n === "posvenda_registrar").a);
  assert.deepStrictEqual(reg.p_respostas, { atendimento: "a1", gostou: ["g1", "g2"] });
  assert.strictEqual(reg.p_observacao, "Tudo ótimo");
  await page.waitForFunction(() => window.__rpc.some((x) => x.n === "posvenda_observacoes_setor"));
  assert.deepStrictEqual(await page.evaluate(() => window.__rpc.find((x) => x.n === "posvenda_observacoes_setor").a.p_obs), { montagem: "Montagem impecável" });
  console.log("ok 2 - formulário de múltipla escolha: obrigatória, uma/várias respostas e observação");

  // ---------------- Painel (no lugar da antiga aba Conversas)
  assert.strictEqual(await page.locator('[data-aba="conversas"]').count(), 0, "aba Conversas removida");
  await page.click('[data-aba="painel"]'); await page.waitForSelector(".pp-secao");
  assert.ok(await page.locator("#pvBusca").isHidden() && await page.locator("#ppDe").isVisible(), "busca vira De/Até");
  { const t = await page.textContent("#pvPainel");
    assert.match(t, /Resumo do período.*Ligações realizadas.*2.*Tudo bem.*1.*50%.*Com reclamação.*1.*Sem contato.*1/s);
    assert.match(t, /Equipe: elogios e feedbacks negativos.*Eduardo Pacheco.*2.*0.*\+2.*Joana Free.*0.*1.*-1/s);
    assert.match(t, /Por quem vendeu.*Ana Paula.*2.*1/s);
    assert.match(t, /Observações para os setores.*Montagem.*1/s); }
  assert.ok(await page.locator(".pp-rosca").count() === 1 && await page.locator(".pp-barras").count() >= 4, "gráficos ao lado");
  assert.ok(await page.evaluate(() => { const s = document.querySelector('[data-secao="equipe"] .pp-secao-grade'); const [a, b] = [...s.children].map((x) => x.getBoundingClientRect()); return b.left >= a.right - 1; }), "tabela à esquerda, gráfico à direita");
  await page.click('[data-secao="equipe"] tr[data-pp-grupo] >> nth=0'); await page.waitForSelector("#ppGaveta.aberta");
  assert.match(await page.textContent("#ppGaveta"), /Eduardo Pacheco.*2 registro.*Elogio.*Pedido 9.*Bruna Lima/s);
  await page.keyboard.press("Escape");
  await page.click('[data-secao="resumo"] tr[data-pp-grupo] >> nth=2'); await page.waitForSelector("#ppGaveta.aberta");
  assert.match(await page.textContent("#ppGaveta"), /Com reclamação.*Ana.*Ruim/s);
  await page.click('#ppGaveta [data-pp-ligacao="h2"]'); await page.waitForSelector("#pvLateral.aberta");
  assert.match(await page.textContent("#pvLateral"), /Ana/); await page.keyboard.press("Escape");
  await page.fill("#ppDe", "2026-10-01"); await page.dispatchEvent("#ppDe", "change");
  await page.waitForFunction(() => window.__painel?.p_de === "2026-10-01");
  await page.click('[data-aba="ligacoes"]'); assert.ok(await page.locator("#pvBusca").isVisible());
  console.log("ok 2b - Painel: resumo, equipe, vendedor, setores, gráficos e card lateral");

  // ---------------- Parâmetros
  await page.goto(BASE + "teste-param.html");
  await page.waitForFunction(() => window.__pronto === 1);
  assert.strictEqual(await page.inputValue('.pr-posvenda-regras [name=intervalo_dias]'), "15");
  await page.fill('.pr-posvenda-regras [name=intervalo_dias]', "20");
  await page.click('.pr-posvenda-regras button[type=submit]');
  await page.waitForFunction(() => window.__rpc.some((x) => x.n === "posvenda_config_salvar"));
  assert.strictEqual(await page.evaluate(() => window.__rpc.filter((x) => x.n === "posvenda_config_salvar").pop().a.p_config.intervalo_dias), 20);
  assert.strictEqual(await page.locator(".pr-pv-cat").count(), 2, "categorias salvas");
  await page.click("[data-nova-cat]");
  await page.locator(".pr-pv-cat").last().locator(".pr-pv-cat-nome").fill("Entrega e montagem");
  await page.locator(".pr-pv-cat").last().locator(".pr-pv-cat-nome").dispatchEvent("change");
  await page.click('.pr-pv-cat >> nth=2 >> [data-nova-pergunta]');
  const nova = page.locator(".pr-pv-cat").last().locator(".pr-pv-pergunta").last();
  await nova.locator("[data-k=texto]").fill("A montagem ficou como combinado?");
  await nova.locator("[data-o=texto]").nth(0).fill("Sim"); await nova.locator("[data-o=texto]").nth(1).fill("Não");
  await nova.locator("[data-o=ruim]").nth(1).check();
  await page.click("[data-salvar-form]");
  await page.waitForFunction(() => window.__rpc.filter((x) => x.n === "posvenda_config_salvar").length === 2);
  const salvoCfg = await page.evaluate(() => window.__rpc.filter((x) => x.n === "posvenda_config_salvar").pop().a.p_config);
  const salvo = salvoCfg.perguntas;
  assert.deepStrictEqual(salvoCfg.categorias.map((c) => c.nome), ["Atendimento", "Gostou", "Entrega e montagem"]);
  assert.strictEqual(salvo.length, 3);
  assert.strictEqual(salvo[2].texto, "A montagem ficou como combinado?"); assert.strictEqual(salvo[2].categoria, salvoCfg.categorias[2].id);
  assert.ok(salvo[2].opcoes[1].ruim === true && salvo[2].opcoes[0].texto === "Sim");
  console.log("ok 3 - Parâmetros: regras, categorias e nova pergunta com opção 'ruim'");
  assert.deepStrictEqual(erros, []);
  console.log("todos os testes passaram");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
