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
    { id: "p1", nome: "Ana Souza", setor: "Montagem", cargo: "Montadora", ativo: true, cpf: "12345678901", data_admissao: "${anos(3)}", dados_rh: { rg: "11" }, ficha: { tipo_contrato: "clt", status: "ativo" } },
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
  const cliente = {
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
  await page.waitForSelector(".rh-pessoa", { timeout: 15000 });
  assert.strictEqual(await page.locator(".rh-pessoa").count(), 4);
  const ana = await page.textContent('[data-pessoa="p1"]');
  assert.match(ana, /vencido/, "Ana tem CNH vencida e ASO faltando: " + ana);
  assert.strictEqual(await page.locator("#rhAbas [data-cont=vencimentos]").textContent() !== "", true);
  console.log("ok 1 - colaboradores por setor, com pendências");

  await page.click('[data-pessoa="p1"]');
  await page.waitForSelector(".rh-ficha-topo");
  assert.match(await page.textContent(".rh-ficha-topo"), /anos de casa/);
  assert.match(await page.textContent("#rhFichaCorpo"), /CNH vencido|Sem ASO periódico/);
  await page.click('[data-acao="editar-ficha"]');
  await page.fill('[name="pix"]', "ana@pix"); await page.fill('[name="cpf"]', "123.456.789-09"); await page.selectOption('[name="tamanho_camisa"]', "M");
  await modalOk("Salvar");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "rh_ficha_salvar" && r.a.p_dados.pix === "ana@pix" && r.a.p_dados.tamanho_camisa === "M"));
  console.log("ok 2 - ficha abre e a edição salva pelo rh_ficha_salvar");

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
  await page.waitForSelector('[data-acao="nova-turma"]');
  assert.match(await page.textContent("#rhConteudo"), /Bruno Lima[\s\S]*NR-35/);
  await page.click('[data-acao="nova-turma"]');
  await page.selectOption('#rhModalCorpo [name="treino"]', "t1");
  await page.click('[data-marca="precisa"]');
  const marcados = await page.$$eval('#rhModalCorpo [name="pessoas"]:checked', (l) => l.map((x) => x.value).sort());
  assert.deepStrictEqual(marcados, ["p1", "p2"], "marcar quem precisa = setor Montagem");
  await modalOk("Registrar");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "rh_turma_registrar" && r.a.p_funcionarios.length === 2));
  console.log("ok 6 - turma marca quem precisa (setor obrigatório) e gera os certificados");

  await page.click('[data-aba="beneficios"]');
  await page.waitForSelector("details summary");
  await page.click("details summary");
  assert.match(await page.textContent("#rhConteudo"), /Começa em/);
  await page.locator('[data-adesao="b1"][data-pessoa-adesao="p1"]').click();
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "insert:rh_beneficio_adesoes"));
  console.log("ok 7 - benefício com carência e adesão");

  await page.click('[data-aba="ferias"]');
  await page.waitForSelector('[data-acao="coletiva"]');
  assert.match(await page.textContent("#rhConteudo"), /Ana Souza[\s\S]*Vencida/, "Ana (3 anos) tem período vencido");
  await page.locator('[data-acao="programar-ferias"][data-pessoa-ferias="p1"]').first().click();
  await page.fill('#rhModalCorpo [name="dias"]', "40");
  await page.locator("#rhModalRodape button", { hasText: "Programar" }).click();
  assert.match(await page.textContent("#rhModalCorpo .fin-erro"), /saldo|30/);
  await page.fill('#rhModalCorpo [name="dias"]', "20"); await page.fill('#rhModalCorpo [name="abono"]', "10");
  await modalOk("Programar");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "insert:rh_ferias" && r.a.dias === 20 && r.a.abono_dias === 10 && r.a.status === "aprovada"));
  await page.click('[data-acao="coletiva"]');
  await page.fill('#rhModalCorpo [name="inicio"]', "2026-12-21");
  await page.click('#rhModalCorpo [data-marca="todos"]');
  await modalOk("Programar coletiva");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "insert:rh_ferias" && Array.isArray(r.a) && r.a.length >= 2 && r.a.every((x) => x.coletiva_id)));
  console.log("ok 8 - férias: saldo conferido, abono, coletiva");

  await page.click('[data-aba="movimentacoes"]');
  await page.waitForSelector('[data-iniciar-check="p3"]');
  await page.click('[data-iniciar-check="p3"]');
  await page.waitForSelector('[data-check]');
  await page.locator('[data-check]').first().check();
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "update:rh_checklists" && r.a.itens?.[0]?.feito));
  await page.click('[data-acao="desligar-escolher"]');
  assert.ok(!(await page.$$eval('#rhModalCorpo [name="pessoa"] option', (o) => o.map((x) => x.value))).includes("eu"), "não dá pra se desligar");
  await page.selectOption('#rhModalCorpo [name="pessoa"]', "p2");
  await page.locator("#rhModalRodape button", { hasText: "Continuar" }).click();
  await modalOk("Registrar desligamento");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "rh_status" && r.a.p_status === "desligado" && r.a.p_funcionario === "p2"));
  await page.waitForFunction(() => /Desligamento/.test(document.getElementById("rhConteudo").textContent) && document.querySelectorAll(".fin-conta").length >= 2);
  console.log("ok 9 - checklist de admissão e desligamento");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-aba="pessoas"]');
  await page.click('[data-pessoa="p1"]');
  await page.waitForSelector(".rh-ficha-topo");
  const larg = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(larg <= 392, "sem rolagem lateral no celular: " + larg);
  console.log("ok 10 - celular sem rolagem lateral");
  if (process.env.SHOT) { await page.setViewportSize({ width: 1400, height: 900 }); await page.click('[data-acao="voltar-lista"]'); await page.screenshot({ path: process.env.SHOT, fullPage: false }); }
  assert.deepStrictEqual(erros, [], erros.join("\n"));
  console.log("todos os testes passaram");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
