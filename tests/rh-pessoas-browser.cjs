// Out/2026 — Gestão de Pessoas: colaboradores, ficha, documentos, exames, treinamento (turma), benefícios,
// férias (individual e coletiva), desligamento e checklists. Banco simulado.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const hoje = new Date().toISOString().slice(0, 10);
const anos = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); };
const mock = `(() => {
  window.__rpc = []; window.__uploads = [];
  const banco = {
    rh_documentos: [{ id: "d1", empresa_id: "e1", funcionario_id: "p1", categoria: "cnh", nome: "CNH", emissao: "2020-01-01", validade: "2025-01-01" }],
    rh_exames: [], rh_exames_cadastro: [{ id: "c1", empresa_id: "e1", nome: "ASO periódico", tipo: "periodico", validade_meses: 12, setores_obrigatorios: [], ativo: true }],
    rh_treinamentos: [{ id: "t1", empresa_id: "e1", nome: "NR-35 Trabalho em altura", categoria: "nr", validade_meses: 24, setores_obrigatorios: ["Montagem"], ativo: true }],
    rh_turmas: [], rh_beneficios: [{ id: "b1", empresa_id: "e1", nome: "Plano de saúde", meses_carencia: 3, tipos_contrato: ["clt"], adesao: "quem_aderir", cobranca: "dividido", ativo: true }],
    rh_beneficio_adesoes: [], rh_ferias: [], rh_checklists: []
  };
  const pessoas = [
    { id: "p1", nome: "Ana Souza", setor: "Montagem", cargo: "Montadora", ativo: true, cpf: "•••.•••.•••-01", protegidos: ["cpf"], pode_revelar: true, data_admissao: "${anos(3)}", dados_rh: { rg: "11" }, ficha: { tipo_contrato: "clt", status: "ativo" } },
    { id: "p2", nome: "Bruno Lima", setor: "Montagem", cargo: "Ajudante", ativo: true, data_admissao: "${anos(1)}", dados_rh: {}, ficha: null },
    { id: "p3", nome: "Carla Dias", setor: "Comercial", cargo: "Vendedora", ativo: true, data_admissao: "${hoje}", dados_rh: {}, ficha: null },
    { id: "eu", nome: "Jonatan Falck", setor: "Administrativo", ativo: true, eu: true, dados_rh: {}, ficha: null }
  ];
  function consulta(t){
    let linhas = (banco[t] || []).slice(), acao = null, dados = null;
    const q = {
      select(){ return q; }, order(){ return q; }, range(){ return q; }, limit(){ return q; }, in(){ return q; }, single(){ return q; }, maybeSingle(){ return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      insert(p){ (Array.isArray(p) ? p : [p]).forEach((x) => (banco[t] ||= []).push({ id: "n" + Math.random().toString(36).slice(2), created_at: new Date().toISOString(), ...x })); window.__rpc.push({ n: "insert:" + t, a: p }); return q; },
      update(p){ acao = "u"; dados = p; return q; },
      delete(){ acao = "d"; return q; },
      then(ok, erro){
        if (acao === "u") { linhas.forEach((l) => Object.assign(l, dados)); window.__rpc.push({ n: "update:" + t, a: dados }); }
        if (acao === "d") { banco[t] = banco[t].filter((l) => !linhas.includes(l)); window.__rpc.push({ n: "delete:" + t }); }
        return Promise.resolve({ data: linhas, error: null }).then(ok, erro);
      }
    };
    return q;
  }
  const respostas = {
    funcionario_contexto: () => ({ ativo: true, administrador_legado: true }),
    rh_pessoas: () => JSON.parse(JSON.stringify(pessoas)),
    rh_ficha_salvar: (a) => { const p = pessoas.find((x) => x.id === a.p_funcionario); p.ficha = Object.assign(p.ficha || {}, a.p_dados); if (a.p_dados.cpf) p.cpf = a.p_dados.cpf.replace(/[^0-9]/g, ""); return null; },
    rh_status: (a) => { const p = pessoas.find((x) => x.id === a.p_funcionario); p.ficha = Object.assign(p.ficha || {}, { status: a.p_status, desligamento_data: a.p_dados.data, desligamento_tipo: a.p_dados.tipo }); p.ativo = a.p_status !== "desligado";
      if (a.p_status === "desligado") banco.rh_checklists.push({ id: "ck-d", empresa_id: "e1", funcionario_id: p.id, tipo: "desligamento", itens: [{ texto: "Exame demissional", feito: false }, { texto: "Devolução de EPI", feito: false }] }); return null; },
    rh_turma_registrar: (a) => { a.p_funcionarios.forEach((f) => banco.rh_documentos.push({ id: "c" + f, empresa_id: "e1", funcionario_id: f, nome: "NR-35 Trabalho em altura", categoria: "nr", emissao: a.p_data, validade: "2099-01-01", treinamento_id: a.p_treinamento, turma_id: "tu1" })); banco.rh_turmas.push({ id: "tu1", empresa_id: "e1", treinamento_id: a.p_treinamento, data: a.p_data }); return "tu1"; }
  };
  // Edge Function rh-protegido (cofre): salvar_ficha cai no mesmo rh_ficha_salvar; revelar devolve o valor inteiro
  const funcoes = { "rh-protegido": (b) => {
    window.__rpc.push({ n: "rh-protegido:" + b.action, a: b });
    if (b.action === "salvar_ficha") { respostas.rh_ficha_salvar({ p_funcionario: b.funcionario_id, p_dados: b.dados }); return { ok: true }; }
    if (b.action === "revelar") return { valores: Object.fromEntries(b.campos.map((c) => [c, c === "cpf" ? "12345678901" : "x"])) };
  } };
  const cliente = {
    functions: { invoke: async (n, o) => ({ data: funcoes[n] ? funcoes[n](o.body) : null, error: null }) },
    auth: { getSession: async () => ({ data: { session: { access_token: "tok", user: { id: "eu" } } } }), getUser: async () => ({ data: { user: { id: "eu" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: consulta,
    rpc: (n, a) => ({ then: (ok, erro) => { window.__rpc.push({ n, a }); return Promise.resolve({ data: respostas[n] ? respostas[n](a) : null, error: null }).then(ok, erro); } }),
    storage: { from: (b) => ({ upload: async (p) => { window.__uploads.push({ b, p }); return { error: null }; }, remove: async () => ({ error: null }), getPublicUrl: (p) => ({ data: { publicUrl: "http://acervo.teste/sem-foto/" + p } }), createSignedUrl: async (p) => ({ data: { signedUrl: "http://acervo.teste/arquivo/" + p } }) }) }
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
    if (u.includes("operacao-sem-motor.js")) {
      const pes = (i) => ({ idInscricao: "i" + i, idFree: "f" + i, nome: "Free " + i, cpf: "•", telefone: "", pix: "", nota: 4, checkinEm: "", checkoutEm: "", via: "qr", distancia: 40, presencaPor: "", fotoUniforme: "", uniforme: null, pagamento: null,
        calc: { fase: "CONCLUIDO", minutos: 600, horas: "10h", atrasoMin: 0, diaria: 150, extraMin: 0, extraTexto: "", extraValor: 0, total: 150, situacao: "PAGAR", motivos: [] }, miniatura: "" });
      const dadosFree = { inicio: "tudo", fim: "2026-11-17", config: { valorHora: 25, horasDiaria: 8 }, usuario: "T", eventos: Array.from({ length: 8 }, (_, k) => ({ idVaga: "v" + k, idEtapa: "e" + k, pedido: String(k + 1), cliente: "Cli", local: "Local", etapa: "Montagem", dataISO: "2026-10-0" + (k + 1), horario: "07:00", lider: "K", responsavel: "K", valor: 150, quantidade: 2, fotos: [], pessoas: [pes(k * 2), pes(k * 2 + 1)] })) };
      return r.fulfill({ contentType: "application/javascript", body: "window.ACERVO_LOCAL={RH_login:function(){return Promise.resolve({token:'a',nome:'T',cicloAtual:'2026-11-03'});},RH_carregarCiclo:function(){return Promise.resolve(" + JSON.stringify(dadosFree) + ");}};" });
    }
    if (u.includes("supabase-js")) return r.fulfill({ contentType: "text/javascript", body: mock });
    if (u.includes("/api/gs")) return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, resultado: [{ funcionario: "Ana Souza", tipo: "Falta", dataOcorrencia: "10/10/2026", observacao: "Sem aviso", responsavel: "Lia" }, { funcionario: "Bruno Lima", tipo: "Atraso", dataOcorrencia: "11/10/2026" }] }) });
    if (u.startsWith(BASE)) {
      const f = path.join(raiz, decodeURIComponent(new URL(u).pathname));
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: "" });
      return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" });
    }
    return r.abort();
  });
  const modalOk = async (rotulo) => { await page.locator("#rhModalRodape button", { hasText: rotulo }).click(); await page.waitForFunction(() => !document.getElementById("rhModal").open, null, { timeout: 8000 }); await page.locator(".alerta-btn, #alertaOk, [data-alerta-ok]").first().click({ timeout: 1500 }).catch(() => {}); };

  await page.goto(BASE + "Modulos/RH/Pessoas/pessoas.html");
  // Nov/2026: sem a aba Colaboradores; a primeira é Funcionários (o cadastro). A ficha abre pelas outras abas ou por ?pessoa=.
  await page.waitForSelector('#rhAbas [data-aba="cadastro"].ativa', { timeout: 15000 });
  assert.equal(await page.textContent('#rhAbas button:first-child'), "Funcionários");
  assert.equal(await page.locator('#rhAbas [data-aba="pessoas"]').count(), 0, "sem a aba Colaboradores");
  assert.strictEqual(await page.locator("#rhAbas [data-cont=vencimentos]").textContent() !== "", true);
  console.log("ok 1 - abre em Funcionários, sem a aba Colaboradores");

  await page.goto(BASE + "Modulos/RH/Pessoas/pessoas.html?pessoa=p1");
  await page.waitForSelector(".rh-ficha-topo");
  assert.match(await page.textContent(".rh-ficha-topo"), /anos( e \d+ m[eê]s(es)?)? de casa/);
  assert.match(await page.textContent("#rhFichaCorpo"), /CNH vencido|Sem ASO periódico/);
  // Cofre: o CPF aparece só mascarado; "Mostrar dados protegidos" busca o valor (fica registrado)
  assert.match(await page.textContent("#rhFichaCorpo"), /•••.•••.•••-01/);
  await page.click('[data-acao="revelar-dados"]');
  await page.waitForFunction(() => document.querySelector('#rhFichaCorpo [data-cofre="cpf"]').textContent.includes("12345678901"));
  assert.ok(await page.evaluate(() => window.__rpc.some((r) => r.n === "rh-protegido:revelar" && r.a.campos.includes("cpf"))));
  await page.click('[data-acao="editar-ficha"]');
  assert.strictEqual(await page.inputValue('[name="cpf"]'), "", "CPF protegido não vem preenchido");
  assert.match(await page.getAttribute('[name="cpf"]', "placeholder"), /•••-01.*protegido/);
  assert.strictEqual(await page.locator('#rhModalCorpo .cofre-ver').count(), 1, "botão Ver no CPF");
  await page.fill('[name="pix"]', "ana@pix"); await page.selectOption('[name="tamanho_camisa"]', "M");
  await modalOk("Salvar");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "rh-protegido:salvar_ficha" && r.a.dados.pix === "ana@pix" && r.a.dados.tamanho_camisa === "M"));
  assert.ok(await page.evaluate(() => !window.__rpc.find((r) => r.n === "rh-protegido:salvar_ficha").a.dados.hasOwnProperty("cpf")), "CPF que ninguém mexeu não é enviado");
  assert.ok(await page.evaluate(() => !window.__rpc.some((r) => r.n === "rh_ficha_salvar")), "a ficha não grava mais direto no banco");
  console.log("ok 2 - ficha com dado protegido: máscara, Ver com registro, e salvar pelo servidor sem mandar o que não mudou");

  await page.click('[data-subaba="documentos"]');
  await page.click('[data-acao="novo-doc"]');
  await page.fill('#rhModalCorpo [name="nome"]', "Contrato de trabalho");
  await page.setInputFiles('#rhModalCorpo [name="arquivo"]', { name: "contrato.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await modalOk("Salvar");
  await page.waitForFunction(() => window.__uploads.some((u) => u.b === "rh-documentos" && /^e1\/rh\/p1\//.test(u.p)));
  assert.match(await page.textContent("#rhFichaCorpo"), /Contrato de trabalho/);
  console.log("ok 3 - documento com arquivo na pasta do RH");

  await page.click('[data-subaba="exames"]');
  await page.click('[data-acao="novo-exame"]');
  await page.selectOption('#rhModalCorpo [name="cad"]', "c1");
  assert.strictEqual(await page.inputValue('#rhModalCorpo [name="meses"]'), "12");
  await modalOk("Salvar");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "insert:rh_exames" && r.a.exame_cadastro_id === "c1" && r.a.validade));
  assert.match(await page.textContent("#rhFichaCorpo"), /ASO periódico: válido/);
  console.log("ok 4 - exame do cadastro com validade calculada");

  await page.click('[data-subaba="ocorrencias"]');
  await page.waitForFunction(() => /Sem aviso/.test(document.getElementById("rhFichaCorpo").textContent));
  assert.ok(!/Atraso/.test(await page.textContent("#rhFichaCorpo")), "só as ocorrências da Ana");
  console.log("ok 5 - ocorrências lidas do Controle RH pelo nome");

  await page.click('[data-aba="vencimentos"]');
  await page.waitForFunction(() => /Bruno Lima[\s\S]*NR-35/.test(document.getElementById("rhConteudo").textContent));
  assert.equal(await page.locator('#rhConteudo [data-acao="nova-turma"], #rhConteudo [data-acao="novo-exame"]').count(), 0, "sem a barra de botões");
  assert.ok(await page.locator('#rhTopoExame').isVisible(), "+ Registrar exame na linha do título");
  await page.click('#rhTopoExame');
  await page.waitForFunction(() => document.getElementById("rhModal").open && /Registrar exame/.test(document.getElementById("rhModalTitulo").textContent));
  await page.click('#rhModal [data-fechar]');
  if (process.env.SHOTV) { await page.waitForTimeout(600); await page.screenshot({ path: process.env.SHOTV, fullPage: true }); }
  await page.click('[data-aba="beneficios"]');
  assert.ok(await page.locator('#rhTopoExame').isHidden(), "botão só em Exames e treinamentos");
  console.log("ok 6 - Exames e treinamentos: + Registrar exame na linha do título, sem Registrar treinamento realizado");

  await page.click('[data-aba="beneficios"]');
  await page.waitForSelector("details summary");
  assert.ok(await page.locator('[data-topo-acao="novo-beneficio"]').isVisible(), "+ Novo benefício na linha do título");
  await page.click("details summary");
  assert.match(await page.textContent("#rhConteudo"), /Começa em/);
  await page.locator('[data-adesao="b1"][data-pessoa-adesao="p1"]').click();
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "insert:rh_beneficio_adesoes"));
  console.log("ok 7 - benefício com carência e adesão");
  if (process.env.SHOTB) { await page.waitForTimeout(600); await page.screenshot({ path: process.env.SHOTB, fullPage: true }); }

  await page.click('[data-aba="ferias"]');
  await page.waitForSelector('[data-topo-acao="coletiva"]:not([hidden])');
  assert.ok(await page.locator('[data-topo-acao="programar-ferias"]').isVisible(), "+ Programar férias na linha do título");
  assert.equal(await page.locator('#rhConteudo [data-acao="coletiva"]').count(), 0);
  { const alt = await page.$$eval('.rh-cards-linha .fin-card', (l) => l.map((x) => Math.round(x.getBoundingClientRect().height))); assert.ok(alt.length === 4 && alt.every((h) => h <= 50), "cards baixos: " + alt); }
  assert.match(await page.textContent("#rhConteudo"), /Ana Souza[\s\S]*Vencida/, "Ana (3 anos) tem período vencido");
  await page.locator('[data-acao="programar-ferias"][data-pessoa-ferias="p1"]').first().click();
  await page.fill('#rhModalCorpo [name="dias"]', "40");
  await page.locator("#rhModalRodape button", { hasText: "Programar" }).click();
  assert.match(await page.textContent("#rhModalCorpo .fin-erro"), /saldo|30/);
  await page.fill('#rhModalCorpo [name="dias"]', "20"); await page.fill('#rhModalCorpo [name="abono"]', "10");
  await modalOk("Programar");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "insert:rh_ferias" && r.a.dias === 20 && r.a.abono_dias === 10 && r.a.status === "aprovada"));
  await page.click('[data-topo-acao="coletiva"]');
  await page.fill('#rhModalCorpo [name="inicio"]', "2027-02-01");
  await page.click('#rhModalCorpo [data-marca="todos"]');
  await modalOk("Programar coletiva");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "insert:rh_ferias" && Array.isArray(r.a) && r.a.length >= 2 && r.a.every((x) => x.coletiva_id)));
  console.log("ok 8 - férias: saldo conferido, abono, coletiva");
  if (process.env.SHOTF) { await page.waitForTimeout(800); await page.screenshot({ path: process.env.SHOTF, fullPage: true }); }

  await page.click('[data-aba="movimentacoes"]');
  await page.waitForSelector('[data-iniciar-check="p3"]');
  await page.click('[data-iniciar-check="p3"]');
  await page.waitForSelector('[data-check]');
  await page.locator('[data-check]').first().check();
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "update:rh_checklists" && r.a.itens?.[0]?.feito));
  assert.ok(await page.locator('[data-topo-acao="admissao"]').isVisible(), "+ Nova admissão na linha do título");
  await page.click('[data-topo-acao="desligar-escolher"]');
  assert.ok(!(await page.$$eval('#rhModalCorpo [name="pessoa"] option', (o) => o.map((x) => x.value))).includes("eu"), "não dá pra se desligar");
  await page.selectOption('#rhModalCorpo [name="pessoa"]', "p2");
  await page.locator("#rhModalRodape button", { hasText: "Continuar" }).click();
  assert.equal(await page.locator('#rhModalCorpo [name="motivo_lista"]').count(), 1, "motivo vem de Parâmetros");
  await modalOk("Registrar desligamento");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "rh_status" && r.a.p_status === "desligado" && r.a.p_funcionario === "p2"));
  await page.waitForFunction(() => /Desligamento/.test(document.getElementById("rhConteudo").textContent) && document.querySelectorAll(".fin-conta").length >= 2);
  console.log("ok 9 - checklist de admissão e desligamento");
  if (process.env.SHOTM) { await page.waitForTimeout(800); await page.screenshot({ path: process.env.SHOTM, fullPage: true }); }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "Modulos/RH/Pessoas/pessoas.html?pessoa=p1");
  await page.waitForSelector(".rh-ficha-topo");
  const larg = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(larg <= 392, "sem rolagem lateral no celular: " + larg);
  console.log("ok 10 - celular sem rolagem lateral");
  // Nov/2026: Cadastro de funcionários e Controle RH como abas, cada uma com a tela dela num quadro.
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.click('[data-acao="voltar-lista"]');
  await page.waitForSelector('iframe.rh-embutida:not([hidden])');
  assert.match(await page.getAttribute('iframe.rh-embutida:not([hidden])', 'src'), /cadastro-funcionarios\.html/);
  assert.ok(await page.locator('#rhConteudo').isHidden(), 'conteúdo das outras abas escondido');
  const alt = await page.evaluate(() => { const f = document.querySelector('iframe.rh-embutida:not([hidden])'); return f.getBoundingClientRect().bottom; });
  assert.ok(alt <= 900 && alt > 800, 'quadro ocupa o resto da janela: ' + alt);
  if (process.env.SHOT2) { await page.waitForTimeout(2500); await page.screenshot({ path: process.env.SHOT2 }); }
  await page.click('[data-aba="controle"]');
  assert.match(await page.getAttribute('iframe.rh-embutida:not([hidden])', 'src'), /ControleRH\/rh\.html/);
  assert.equal((await page.textContent('[data-aba="controle"]')).trim(), "Ocorrências");
  assert.ok(await page.locator('#rhOcorPainel').isVisible() && await page.locator('#rhOcorNova').isVisible() && await page.locator('#rhBuscaOcor').isVisible(), "Painel, + Nova ocorrência e pesquisa na linha do título");
  assert.ok(await page.locator('#rhBuscaFunc').isHidden() && await page.locator('#rhNovoFunc').isHidden());
  if (process.env.SHOT3) { await page.waitForTimeout(2500); await page.screenshot({ path: process.env.SHOT3 }); }
  assert.equal(await page.locator('iframe.rh-embutida').count(), 2);
  await page.click('[data-aba="ideias"]');
  assert.match(await page.getAttribute('iframe.rh-embutida:not([hidden])', 'src'), /ideia-premiada.html/);
  await page.waitForFunction(() => { const d = document.querySelector('iframe.rh-embutida:not([hidden])')?.contentDocument; const h = d?.querySelector('.ideia-heading'); const t = d?.querySelector('.ideia-tabs'); return h && t && d.defaultView.getComputedStyle(h).display === 'none' && d.defaultView.getComputedStyle(t).display === 'none'; }, null, { timeout: 15000 });
  assert.ok(await page.locator('#rhBuscaIdeia').isVisible() && await page.locator('#rhStatusIdeia').isHidden(), "pesquisa da Ideia Premiada na linha do título; o filtro de situação virou as abas da coluna (nov/2026)");
  await page.waitForFunction(() => { const d = document.querySelector('iframe.rh-embutida:not([hidden])').contentDocument; return d.defaultView.getComputedStyle(d.querySelector('.ideia-list-tools')).display === 'none'; });
  { const d = await page.evaluate(() => { const doc = document.querySelector('iframe.rh-embutida:not([hidden])').contentDocument; return [doc.documentElement.classList.contains('ideia-embutida'), doc.defaultView.getComputedStyle(doc.getElementById('painelEnviar')).display]; }); assert.deepStrictEqual(d, [true, 'none'], 'tela da equipe nunca aparece dentro da aba'); }
  await page.click('#rhBuscaIdeia'); await page.fill('#rhBuscaIdeia', 'teste');
  assert.equal(await page.evaluate(() => document.querySelector('iframe.rh-embutida:not([hidden])').contentDocument.getElementById('buscaIdeias').value), 'teste');
  if (process.env.SHOT5) { await page.waitForTimeout(1500); await page.screenshot({ path: process.env.SHOT5 }); }
  await page.click('[data-aba="ferias"]');
  assert.ok(await page.locator('#rhConteudo').isVisible() && (await page.locator('iframe.rh-embutida:not([hidden])').count()) === 0);
  await page.click('[data-aba="free-cad"]');
  if (process.env.SHOTFL) { await page.waitForTimeout(3000); await page.screenshot({ path: process.env.SHOTFL }); console.log('rolagem', await page.evaluate(() => [document.documentElement.scrollHeight, innerHeight, getComputedStyle(document.documentElement).overflow])); }
  assert.match(await page.getAttribute('iframe.rh-embutida:not([hidden])', 'src'), /equipe-free\.html/);
  // Cadastros em abas (Aguardando aprovação / Aprovados), sem títulos de coluna
  await page.waitForFunction(() => { const d = document.querySelector('iframe.rh-embutida:not([hidden])').contentDocument; return typeof d.defaultView.freeHtmlCadastros === 'function' && d.defaultView.eval('typeof freeEstado') === 'object'; }, null, { timeout: 10000 });
  { const r = await page.evaluate(() => { const w = document.querySelector('iframe.rh-embutida:not([hidden])').contentWindow, d = w.document;
      const c = (id, nome, status) => ({ idFree: id, nome, status, cpf: '•••', telefone: '24999990000', historico: [] });
      w.__cad = [c('1', 'Pendente Um', 'PENDENTE'), c('2', 'Aprovado Um', 'APROVADO'), c('3', 'Aprovado Dois', 'APROVADO')]; w.eval('freeEstado.cadastros = window.__cad');
      let col = d.getElementById('freeColCadastros'); if (!col) { col = d.createElement('div'); col.id = 'freeColCadastros'; d.body.append(col); }
      w.freeTrocarAbaCad('pendentes');
      const nomes = () => [...col.querySelectorAll('.fc-item b')].map((x) => x.textContent.trim().split(' ')[0] + ' ' + x.textContent.trim().split(' ')[1]);
      const abas = [...col.querySelectorAll('.free-abas-cad button')].map((b) => b.textContent.trim());
      const a = nomes(); col.querySelectorAll('.free-abas-cad button')[1].click(); const b = nomes();
      return { abas, a, b, titulos: col.querySelectorAll('.free-secao').length + d.querySelectorAll('.free-col-titulo').length, link: d.querySelectorAll('.free-link').length }; });
    assert.deepStrictEqual(r, { abas: ['Aguardando aprovação 1', 'Aprovados 2'], a: ['Pendente Um'], b: ['Aprovado Um', 'Aprovado Dois'], titulos: 0, link: 0 }, JSON.stringify(r)); }
  { const r = await page.evaluate(async () => { const w = document.querySelector('iframe.rh-embutida:not([hidden])').contentWindow, d = w.document;
      const abas = [...d.querySelectorAll('[data-free-aba]')].map((b) => b.textContent.trim().split(' ')[0]);
      const antes = { sel: d.querySelector('[data-free-aba][aria-selected="true"]').dataset.freeAba, dias: !d.getElementById('freeDias').hidden };
      d.querySelector('[data-free-aba="cadastros"]').click(); await new Promise((r) => setTimeout(r, 300));
      const depois = { sel: d.querySelector('[data-free-aba][aria-selected="true"]').dataset.freeAba, dias: !d.getElementById('freeDias').hidden, cad: !!d.getElementById('freeColCadastros'), vagas: !!d.getElementById('freeColVagas') };
      d.querySelector('[data-free-aba="necessidades"]').click(); await new Promise((r) => setTimeout(r, 300));
      return { abas, antes, depois, voltou: !!d.getElementById('freeColVagas') && !d.getElementById('freeDias').hidden }; });
    assert.deepStrictEqual(r, { abas: ['Necessidades', 'Cadastros'], antes: { sel: 'necessidades', dias: true }, depois: { sel: 'cadastros', dias: false, cad: true, vagas: false }, voltou: true }, JSON.stringify(r)); }
  { const r = await page.evaluate(() => { const w = document.querySelector('iframe.rh-embutida:not([hidden])').contentWindow, d = w.document;
      w.__cad2 = [{ idFree: 'a', id: 'a', nome: 'Wellington Rosa', status: 'APROVADO', cpf: '•••-28', telefone: '24987018052', nota: 3.9, trabalhos: 2, confirmacoes: 3, cancelamentos: 0, faltas: 1,
        historico: [{ titulo: 'Montagem 31/10', motivo: 'Trabalho realizado', delta: 0.2, nota: 3.9 }, { titulo: 'Montagem 31/10', motivo: 'Trabalho realizado', delta: 0.2, nota: 3.7 }, { titulo: 'Montagem 30/10', motivo: 'Faltou sem avisar', delta: -1.5, nota: 3.5 }] }];
      w.eval('freeEstado.cadastros = window.__cad2'); w.freeTrocarAbaCad('aprovados');
      const col = d.getElementById('freeColCadastros');
      w.__cad2.push({ idFree: 'b', id: 'b', nome: 'Outro Free', status: 'APROVADO', cpf: '•••-11', telefone: '2499', nota: 5, trabalhos: 0, confirmacoes: 0, cancelamentos: 0, faltas: 0, historico: [] }); w.freeTrocarAbaCad('aprovados');
      const lista = [...col.querySelectorAll('.fc-item b')].map((x) => x.textContent.trim());
      const det1 = { nome: col.querySelector('.fc-det-nome strong').textContent, cards: [...col.querySelectorAll('.fc-card b')].map((x) => x.textContent), hist: [...col.querySelectorAll('.fc-hist-tab tbody tr')].map((x) => x.className + ':' + x.querySelector('.fc-pontos').textContent) };
      col.querySelectorAll('.fc-item')[1].click();
      return { lista, det1, det2: col.querySelector('.fc-det-nome strong').textContent, ativo: col.querySelector('.fc-item.ativo b').textContent }; });
    assert.deepStrictEqual(r, { lista: ['Wellington Rosa', 'Outro Free'], det1: { nome: 'Wellington Rosa', cards: ['2', '3', '0', '1'], hist: ['sobe:+0,2', 'sobe:+0,2', 'desce:-1,5'] }, det2: 'Outro Free', ativo: 'Outro Free' }, JSON.stringify(r));
    if (process.env.SHOTCAD) await page.screenshot({ path: process.env.SHOTCAD }); }
  console.log('ok 11c - Cadastro de Freelancer: abas Aguardando aprovação / Aprovados, sem link e sem títulos');
  await page.click('[data-aba="free-pag"]');
  assert.match(await page.getAttribute('iframe.rh-embutida:not([hidden])', 'src'), /Cronograma\/rh\.html/);
  assert.equal((await page.textContent('[data-aba="free-pag"]')).trim(), "Pagamento de Freelancer");
  // Pagamento de Freelancer: o quadro cresce com o conteúdo e só a página rola (uma barra só)
  await page.waitForFunction(() => { const f = document.querySelector('iframe.rh-embutida:not([hidden])'); return f && f.contentDocument.querySelectorAll('.evento').length === 8; }, null, { timeout: 10000 });
  await page.waitForTimeout(400);
  const cresce = await page.evaluate(() => { const f = document.querySelector('iframe.rh-embutida:not([hidden])'); const d = f.contentDocument; return { quadro: f.offsetHeight, conteudo: Math.ceil(d.body.getBoundingClientRect().height), janela: innerHeight, pagina: document.documentElement.scrollHeight, html: getComputedStyle(document.documentElement).overflowY, interno: d.documentElement.scrollHeight - d.documentElement.clientHeight, ladoEsq: d.querySelector('.evento').getBoundingClientRect().left + f.getBoundingClientRect().left }; });
  assert.ok(cresce.quadro > cresce.janela && Math.abs(cresce.quadro - cresce.conteudo) <= 2, JSON.stringify(cresce));
  assert.ok(cresce.pagina > cresce.janela && cresce.html !== 'hidden' && cresce.interno <= 1, "só a página rola: " + JSON.stringify(cresce));
  if (process.env.SHOTPAG) await page.screenshot({ path: process.env.SHOTPAG });
  // janela aberta no quadro escurece também as laterais da página; clicar no escuro fecha
  await page.evaluate(() => document.querySelector('iframe.rh-embutida:not([hidden])').contentWindow.abrirJanela("<h2>Teste</h2>"));
  await page.waitForFunction(() => { const v = document.getElementById("rhVeuQuadro"); return v && !v.hidden; });
  assert.ok(await page.evaluate(() => { const v = document.getElementById("rhVeuQuadro"), r = v.getBoundingClientRect(); return r.width >= innerWidth - 1 && r.height >= innerHeight - 1 && getComputedStyle(v).backgroundColor !== "rgba(0, 0, 0, 0)"; }), "véu na página toda");
  await page.mouse.click(5, 450);
  await page.waitForFunction(() => document.getElementById("rhVeuQuadro").hidden);
  // janela do mapa: sem barra vertical e no meio da parte visível, mesmo com a tela baixa e a página rolada
  for (const [alt, rolar] of [[900, 0], [660, 700]]) {
    await page.setViewportSize({ width: 1400, height: alt }); await page.evaluate((y) => scrollTo(0, y), rolar); await page.waitForTimeout(200);
    await page.evaluate(() => document.querySelector('iframe.rh-embutida:not([hidden])').contentWindow.abrirJanela('<h2>Local do check-in</h2><p>Teste<br>linha</p><div class="mapa-checkin"></div><div class="acoes"><button class="btn">Fechar</button></div>', true));
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => { const f = document.querySelector('iframe.rh-embutida:not([hidden])'), fr = f.getBoundingClientRect(), j = f.contentDocument.getElementById("janela"), r = j.getBoundingClientRect();
      const topoVis = Math.max(0, fr.top), baixoVis = Math.min(innerHeight, fr.bottom);
      return { sobra: j.scrollHeight - j.clientHeight, cima: fr.top + r.top - topoVis, baixo: baixoVis - (fr.top + r.bottom) }; });
    assert.ok(m.sobra <= 1 && m.cima >= 0 && m.baixo >= 0 && Math.abs(m.cima - m.baixo) <= 6, "mapa sem barra e centralizado (" + alt + "px): " + JSON.stringify(m));
    await page.evaluate(() => document.querySelector('iframe.rh-embutida:not([hidden])').contentWindow.fecharJanela());
  }
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.waitForFunction(() => document.getElementById("rhVeuQuadro").hidden && !document.querySelector('iframe.rh-embutida:not([hidden])').contentDocument.querySelector(".fundo.ver"));
  console.log("ok 11d - janela do quadro escurece a página inteira");
  await page.evaluate(() => scrollTo(0, 900)); await page.waitForTimeout(100);
  const vt = await page.evaluate(() => document.querySelector('iframe.rh-embutida:not([hidden])').contentDocument.documentElement.style.getPropertyValue('--rh-vt'));
  assert.ok(parseInt(vt) > 500, "janelas acompanham a parte visível: " + vt);
  await page.evaluate(() => scrollTo(0, 0));
  console.log("ok 11b - Pagamento de Freelancer sem barra própria", JSON.stringify(cresce));
  console.log("ok 11 - abas Cadastro de funcionários e Controle RH");
  if (process.env.SHOT) { await page.setViewportSize({ width: 1400, height: 900 }); await page.click('[data-acao="voltar-lista"]'); await page.screenshot({ path: process.env.SHOT, fullPage: false }); }
  assert.deepStrictEqual(erros, [], erros.join("\n"));
  console.log("todos os testes passaram");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
