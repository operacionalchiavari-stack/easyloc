// Teste opt-in (RUN_CLARA_LIVE=1) da Clara, a assistente da Conciliação, no navegador, contra o banco, a Edge
// Function financeiro-assistente e a IA reais. Empresa, usuário, contas e títulos temporários, apagados no fim.
// Confere: Excel de um banco é lido (formato aprendido e reaproveitado), as linhas ganham sugestões (baixa do título
// certo, lançamento com categoria, transferência), confirmar dá baixa de verdade, a outra conta reconhece a
// transferência, a conversa responde e a DRE ganha sugestões de classificação.
require("dotenv").config({ quiet: true });
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { randomUUID } = require("node:crypto");
const fs = require("fs"), path = require("path"), assert = require("node:assert/strict");
const raiz = path.resolve(__dirname, ".."), BASE = "http://localhost:5599/";
const tipos = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".jpg": "image/jpeg", ".webp": "image/webp" };
const SAIDA = process.env.CLARA_PRINTS || path.join(require("os").tmpdir(), "clara-prints");

(async () => {
  if (process.env.RUN_CLARA_LIVE !== "1") throw Error("Defina RUN_CLARA_LIVE=1");
  fs.mkdirSync(SAIDA, { recursive: true });
  const url = process.env.SUPABASE_URL;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const client = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const check = (r) => { if (r.error) throw Error(r.error.message); return r.data; };
  const sfx = randomUUID().slice(0, 8), senha = "Temp-" + randomUUID() + "!";
  let empresa, user, browser;
  const erros = [];
  try {
    empresa = check(await admin.from("empresas").insert({ nome: "TESTE CLARA " + sfx }).select("id").single()).id;
    user = check(await admin.auth.admin.createUser({ email: "clara-" + sfx + "@example.invalid", password: senha, email_confirm: true })).user;
    check(await admin.from("usuarios").insert({ id: user.id, empresa_id: empresa, nome: "Equipe Financeiro" }));
    check(await admin.from("usuarios_empresas").insert({ user_id: user.id, empresa_id: empresa, role: "admin" }));
    const sessao = check(await client.auth.signInWithPassword({ email: user.email, password: senha })).session;
    const comoUser = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: "Bearer " + sessao.access_token } } });
    check(await comoUser.rpc("fin_preparar", { p_empresa: empresa }));
    check(await admin.from("fin_contas").insert([
      { empresa_id: empresa, nome: "Conta Locação", banco: "Itaú", saldo_inicial: 10000, saldo_inicial_data: "2026-09-30" },
      { empresa_id: empresa, nome: "Conta Frete", banco: "Bradesco", saldo_inicial: 0, saldo_inicial_data: "2026-09-30" },
      { empresa_id: empresa, nome: "Conta Montagem", banco: "Banco do Brasil", saldo_inicial: 0, saldo_inicial_data: "2026-09-30" },
    ]).select("id,nome"));
    const contaA = (await admin.from("fin_contas").select("id").eq("empresa_id", empresa).eq("nome", "Conta Locação").single()).data.id;
    const contaB = (await admin.from("fin_contas").select("id").eq("empresa_id", empresa).eq("nome", "Conta Frete").single()).data.id;
    const recMaria = check(await admin.from("fin_receber").insert({ empresa_id: empresa, descricao: "Locação · Pedido 12", cliente_nome: "Maria Souza", pedido_numero: "12", componente: "locacao", vencimento: "2026-10-01", valor: 1500, conta_id: contaA }).select("id").single()).id;
    check(await admin.from("fin_receber").insert({ empresa_id: empresa, descricao: "Locação · Pedido 30", cliente_nome: "Carlos Lima", pedido_numero: "30", componente: "locacao", vencimento: "2026-11-20", valor: 1500, conta_id: contaA }));
    const pagJoao = check(await admin.from("fin_pagar").insert({ empresa_id: empresa, descricao: "Frete do pedido 12", fornecedor_nome: "João Fretes Ltda", vencimento: "2026-10-03", valor: 800 }).select("id").single()).id;
    const pagLuz = check(await admin.from("fin_pagar").insert({ empresa_id: empresa, descricao: "Conta de energia do galpão", fornecedor_nome: "Light Energia", vencimento: "2026-10-05", valor: 320 }).select("id").single()).id;

    browser = await chromium.launch({ channel: "msedge" });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route("**/*", (rota) => {
      const u = new URL(rota.request().url());
      if (u.origin + "/" !== BASE) return rota.continue();
      const arq = path.join(raiz, decodeURIComponent(u.pathname));
      if (!fs.existsSync(arq) || fs.statSync(arq).isDirectory()) return rota.fulfill({ status: 404, body: "" });
      return rota.fulfill({ contentType: tipos[path.extname(arq)] || "application/octet-stream", body: fs.readFileSync(arq) });
    });
    await ctx.addInitScript(() => { const guardar = (m) => { (window.__alertas = window.__alertas || []).push(String(m)); }; Object.defineProperty(window, "alerta", { configurable: true, get() { return guardar; }, set() {} }); window.confirmarGlobal = async () => true; });
    await ctx.addInitScript(([s, e]) => { localStorage.setItem("easyloc-auth", s); sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", e); }, [JSON.stringify(sessao), empresa]);
    const page = await ctx.newPage();
    const conciliar = async (id) => { await page.click('[data-bk-conta="' + id + '"]'); await page.waitForSelector('[data-bk-vista="conciliar"]'); if (!(await page.locator('[data-bk-vista="conciliar"].ativa').count())) await page.click('[data-bk-vista="conciliar"]'); await page.waitForSelector("#clDrop"); };
    page.on("pageerror", (e) => erros.push(e.message));
    await page.goto(BASE + "Modulos/Financeiro/financeiro.html?aba=bancos", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".bk-contas", { timeout: 30000 });
    assert.equal(await page.locator(".bk-contas [data-bk-conta]").count(), 4, "Todas + 3 contas");
    await conciliar(contaA);
    console.log("ok 1 - a Conciliação abre com a Clara e a área de enviar o extrato");

    // Foto da conta: Configurar contas → Editar → Escolher foto → Salvar → aparece na lista
    await page.click("[data-bk-config]");
    await page.waitForSelector('[data-c-editar="' + contaA + '"]');
    await page.click('[data-c-editar="' + contaA + '"]');
    await page.waitForSelector("#fcLogoArq", { state: "attached" });
    assert.equal(await page.textContent("#fcLogoPrev"), "L", "sem foto mostra a inicial");
    await page.setInputFiles("#fcLogoArq", path.join(raiz, "logo nova - com fundo branco.png"));
    await page.waitForSelector("#fcLogoPrev img");
    await page.click('#finModalRodape [data-bt="1"]');
    await page.waitForFunction(() => !document.getElementById("finModal").open, null, { timeout: 30000 });
    const logoUrl = check(await admin.from("fin_contas").select("logo_url").eq("id", contaA).single()).logo_url;
    assert.match(logoUrl || "", new RegExp("/empresas-logos/" + empresa + "/bancos/" + contaA + "-[0-9]+[.]png$"), "foto gravada na pasta da empresa");
    await page.waitForSelector('.bk-contas [data-bk-conta="' + contaA + '"] .fin-logo-conta img');
    assert.equal(await page.locator('.bk-contas [data-bk-conta="todas"] .bk-logos .fin-logo-conta').count(), 3);
    await page.screenshot({ path: path.join(SAIDA, "0-foto-conta.png") });
    console.log("ok 1b - foto da conta escolhida no cadastro aparece na lista de contas");
    await conciliar(contaA);

    // Excel no formato de um banco (cabeçalho, linhas de saldo no meio)
    const xlsx = async (linhas) => page.evaluate(async (ls) => {
      if (!window.XLSX) await new Promise((ok) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"; s.onload = ok; document.head.appendChild(s); });
      const ws = window.XLSX.utils.aoa_to_sheet(ls); const wb = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb, ws, "Extrato");
      return window.XLSX.write(wb, { type: "base64", bookType: "xlsx" });
    }, linhas);
    const cab = [["Banco Itaú - Extrato de conta corrente"], ["Agência 1234 Conta 56789-0"], [], ["Data", "Lançamento", "Ag./Origem", "Valor (R$)", "Saldo (R$)"]];
    const arq1 = await xlsx([...cab,
      ["30/09/2026", "SALDO ANTERIOR", "", "", "10.000,00"],
      ["01/10/2026", "PIX RECEBIDO MARIA SOUZA PED 12", "", "1.500,00", "11.500,00"],
      ["01/10/2026", "TAR MANUT CONTA", "", "-45,90", "11.454,10"],
      ["02/10/2026", "TED MESMA TITULARIDADE 237 CONTA FRETE", "", "-1.000,00", "10.454,10"],
      ["02/10/2026", "SALDO DO DIA", "", "", "10.454,10"],
      ["03/10/2026", "PIX ENVIADO JOAO FRETES LTDA", "", "-800,00", "9.654,10"],
      ["05/10/2026", "PAGTO CONTA LUZ LIGHT", "", "-320,00", "9.334,10"],
      ["05/10/2026", "IOF", "", "-3,12", "9.330,98"]]);
    const t0 = Date.now();
    await page.setInputFiles("#clArquivo", { name: "extrato-itau-outubro.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(arq1, "base64") });
    await page.waitForSelector("#finModal[open]", { timeout: 120000 });
    const leitura = await page.textContent("#finModalCorpo");
    assert.match(leitura, /6 lançamento/, leitura);
    assert.ok(!/SALDO DO DIA/.test(leitura), "pulou as linhas de saldo");
    await page.screenshot({ path: path.join(SAIDA, "1-leitura.png") });
    await page.click('#finModalRodape button:has-text("Está certo, organizar")');
    await page.waitForFunction(() => document.querySelectorAll(".cl-tabela tbody tr").length >= 6 && document.getElementById("clEtapa")?.hidden, null, { timeout: 240000 });
    console.log("ok 2 - Excel lido (6 lançamentos, saldos pulados) e organizado em " + Math.round((Date.now() - t0) / 1000) + "s");
    await page.screenshot({ path: path.join(SAIDA, "2-sugestoes.png"), fullPage: true });

    const linhas = check(await admin.from("fin_extrato").select("descricao,valor,sugestao,saldo").eq("conta_id", contaA));
    const sug = (txt) => linhas.find((l) => l.descricao.includes(txt))?.sugestao;
    const resumo = linhas.map((l) => l.descricao + " → " + (l.sugestao?.acao?.tipo || "-") + " [" + l.sugestao?.confianca + "] " + (l.sugestao?.resumo || "") + " | " + (l.sugestao?.motivo || "")).join("\n");
    console.log(resumo);
    assert.equal(sug("MARIA")?.acao?.tipo, "baixar", resumo); assert.equal(sug("MARIA").acao.titulos[0].id, recMaria);
    assert.equal(sug("JOAO")?.acao?.tipo, "baixar", resumo); assert.equal(sug("JOAO").acao.titulos[0].id, pagJoao);
    assert.equal(sug("LUZ")?.acao?.tipo, "baixar", resumo); assert.equal(sug("LUZ").acao.titulos[0].id, pagLuz);
    assert.equal(sug("TAR MANUT")?.acao?.tipo, "lancar", resumo); assert.ok(sug("TAR MANUT").acao.categoria_id, "tarifa com categoria");
    assert.equal(sug("IOF")?.acao?.tipo, "lancar", resumo);
    assert.equal(sug("TED MESMA")?.acao?.tipo, "transferencia", resumo); assert.equal(sug("TED MESMA").acao.conta_id, contaB);
    console.log("ok 3 - sugestões certas: baixas dos títulos certos, tarifa e IOF lançados com categoria, transferência para a Conta Frete");

    // Confirmar tudo
    assert.ok(await page.$eval("#clTodas", (c) => c.checked), "as prontas já vêm marcadas");
    await page.click("#clConfirmar");
    await page.waitForFunction(() => !document.querySelector(".cl-tabela tbody tr") , null, { timeout: 60000 });
    assert.equal(check(await admin.from("fin_receber").select("status").eq("id", recMaria).single()).status, "recebido");
    assert.equal(check(await admin.from("fin_pagar").select("status").eq("id", pagJoao).single()).status, "pago");
    const saldoTxt = await page.textContent(".cl-saldo");
    assert.match(saldoTxt, /Os saldos batem/, saldoTxt);
    await page.screenshot({ path: path.join(SAIDA, "3-confirmado.png"), fullPage: true });
    console.log("ok 4 - confirmar dá baixa de verdade, e o saldo do banco bate com o do sistema");
    await page.click('[data-bk-vista="extrato"]');
    await page.waitForSelector(".bk-resumo");
    await page.fill("#bkIni", "2026-09-01"); await page.dispatchEvent("#bkIni", "change");
    await page.waitForTimeout(800);
    await page.fill("#bkFim", "2026-10-31"); await page.dispatchEvent("#bkFim", "change");
    await page.waitForFunction(() => document.querySelectorAll(".bk-extrato tbody tr:not(.bk-dia)").length === 6, null, { timeout: 20000 });
    const ext = await page.textContent(".bk-extrato");
    assert.match(ext, /TED MESMA TITULARIDADE/); assert.ok(!/SALDO DO DIA/.test(ext), "linhas de saldo do banco não viram lançamento");
    assert.match(await page.textContent(".bk-resumo"), /9.330,98/, "saldo final igual ao do banco");
    assert.match(await page.locator(".bk-dia").last().textContent(), /9.330,98/, "saldo do dia igual ao do banco");
    await page.screenshot({ path: path.join(SAIDA, "3b-extrato.png"), fullPage: true });
    console.log("ok 4b - conciliação finalizada: o extrato da conta tem as 6 linhas do banco, com o mesmo saldo");

    // Outra conta, CSV de outro banco: a TED recebida é a transferência já registrada
    await conciliar(contaB);
    const csv = "Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)\n02/10/2026;TED RECEBIDA ITAU MESMA TITULARIDADE;991;1.000,00;;1.000,00\n06/10/2026;TARIFA PACOTE SERVICOS;992;;29,90;970,10\n";
    await page.setInputFiles("#clArquivo", { name: "extrato-bradesco.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "latin1") });
    await page.waitForSelector("#finModal[open]", { timeout: 120000 });
    await page.click('#finModalRodape button:has-text("Está certo, organizar")');
    await page.waitForFunction(() => document.querySelectorAll(".cl-tabela tbody tr").length >= 2 && document.getElementById("clEtapa")?.hidden, null, { timeout: 180000 });
    const lb = check(await admin.from("fin_extrato").select("descricao,sugestao").eq("conta_id", contaB));
    const ted = lb.find((l) => l.descricao.includes("TED"))?.sugestao;
    assert.equal(ted?.acao?.tipo, "transferencia"); assert.ok(ted.acao.grupo, "reconhece a transferência já registrada");
    assert.equal(ted.confianca, "alta");
    console.log("ok 5 - CSV de outro banco lido, e a TED recebida reconhecida como a transferência já registrada");

    // Mesmo banco de novo: formato já aprendido, sem a janela de conferência
    await conciliar(contaA);
    const arq2 = await xlsx([...cab, ["08/10/2026", "TAR MANUT CONTA", "", "-45,90", "9.285,08"], ["09/10/2026", "PIX RECEBIDO CARLOS LIMA", "", "1.500,00", "10.785,08"]]);
    await page.setInputFiles("#clArquivo", { name: "extrato-itau-2.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(arq2, "base64") });
    await page.waitForFunction(() => (document.querySelectorAll(".cl-tabela tbody tr").length >= 2 && document.getElementById("clEtapa")?.hidden) || document.getElementById("finModal").open, null, { timeout: 180000 })
      .catch(async (e) => { console.log("alertas:", await page.evaluate(() => window.__alertas)); await page.screenshot({ path: path.join(SAIDA, "erro-6.png"), fullPage: true }); throw e; });
    assert.equal(await page.locator("#finModal[open]").count(), 0, "sem janela: formato já conhecido · " + (await page.locator("#finModalCorpo").textContent().catch(() => "")));
    const modelos = check(await admin.from("fin_extrato_modelos").select("usos").eq("empresa_id", empresa));
    assert.ok(modelos.some((m) => m.usos >= 2));
    const tar2 = check(await admin.from("fin_extrato").select("sugestao").eq("conta_id", contaA).eq("data", "2026-10-08").single()).sugestao;
    assert.equal(tar2.origem, "regra", JSON.stringify(tar2)); assert.equal(tar2.confianca, "alta");
    console.log("ok 6 - mesmo banco: lido direto pelo formato aprendido, e a tarifa veio da regra aprendida");
    await page.click('[data-bk-vista="extrato"]');
    await page.waitForSelector(".bk-resumo");
    assert.match(await page.textContent("#bkMain"), /Faltam 2 lançamento/, "aviso das linhas ainda não conciliadas");
    assert.equal(await page.locator(".bk-extrato tbody tr:not(.bk-dia)").count(), 6, "linhas da conciliação aberta ainda fora do extrato");
    await page.click('[data-bk-conta="todas"]');
    await page.waitForSelector(".bk-extrato th:has-text('Conta')");
    assert.equal(await page.locator('[data-bk-vista="conciliar"]').count(), 0, "Todas as contas: só extrato");
    await page.screenshot({ path: path.join(SAIDA, "3c-todas.png"), fullPage: true });
    console.log("ok 6b - extrato só com conciliações finalizadas; Todas as contas soma e não concilia");
    await conciliar(contaA);

    // Conversa: aba própria
    assert.equal(await page.locator("#clChat").count(), 0, "Bancos sem a coluna de conversa");
    await page.click('#finAbas [data-aba="clara"]');
    await page.waitForSelector(".ch-boasvindas");
    await page.waitForSelector(".ch-lado-blocos");
    assert.equal(await page.locator(".ch-lado-blocos .ch-lado-item").count() >= 6, true, "panorama com contas, conciliação, a receber e a pagar");
    await page.screenshot({ path: path.join(SAIDA, "4a-clara-inicio.png") });
    await page.fill("#chTexto", "O que falta conciliar na Conta Locação?");
    await page.press("#chTexto", "Enter");
    await page.waitForFunction(() => document.querySelectorAll(".ch-msg.is-bot .ch-bubble:not(.ch-digitando)").length >= 1 && !document.querySelector(".ch-digitando"), null, { timeout: 90000 });
    const resp = await page.locator(".ch-msg.is-bot .ch-bubble").last().textContent();
    assert.ok(resp.length > 20, resp);
    console.log("ok 7 - a Clara tem aba própria e responde: " + resp.slice(0, 140).replace(/s+/g, " "));
    await page.screenshot({ path: path.join(SAIDA, "4-conversa.png") });

    // DRE
    await page.click('#finAbas [data-aba="dre"]');
    await page.waitForSelector("#fdClara");
    await page.click("#fdClara");
    await page.waitForFunction(() => document.querySelector(".cl-dre") || /Tudo classificado/.test(document.getElementById("finModalCorpo")?.textContent || ""), null, { timeout: 120000 });
    await page.screenshot({ path: path.join(SAIDA, "5-dre.png") });
    const nDre = await page.locator(".cl-dre tbody tr").count();
    const vazios = await page.evaluate(() => [...document.querySelectorAll(".cl-dre [data-dre-cc]")].filter((x) => !x.value).length);
    assert.equal(vazios, 0, "a Clara sugeriu um centro de custo para cada título");
    if (nDre) {
      await page.click("#clDreOk");
      await page.waitForFunction(() => !document.getElementById("finModal").open, null, { timeout: 30000 });
    }
    const semCentro = [...check(await admin.from("fin_pagar").select("descricao").eq("empresa_id", empresa).neq("status", "cancelado").is("centro_custo_id", null)), ...check(await admin.from("fin_receber").select("descricao").eq("empresa_id", empresa).neq("status", "cancelado").is("centro_custo_id", null))];
    const semCat = check(await admin.from("fin_receber").select("descricao").eq("empresa_id", empresa).neq("status", "cancelado").is("categoria_id", null));
    assert.ok(nDre >= 4, "sugeriu os títulos sem classificação");
    assert.deepEqual(semCentro.map((x) => x.descricao), [], "todos com centro de custo depois de confirmar");
    assert.deepEqual(semCat.map((x) => x.descricao), [], "receitas com categoria depois de confirmar");
    console.log("ok 8 - DRE: " + nDre + " título(s) classificados pela Clara (categoria e centro de custo) e confirmados");
    await page.click('[data-dre-modo="centros"]');
    await page.waitForSelector(".cl-dre-centros");
    await page.screenshot({ path: path.join(SAIDA, "6-dre-centros.png"), fullPage: true });
    console.log("ok 9 - DRE por centro de custo");

    assert.deepEqual(erros, []);
    console.log("OK - Clara · prints em " + SAIDA);
  } finally {
    if (browser) await browser.close();
    if (empresa) {
      for (const t of ["fin_movimentos", "fin_baixas", "fin_extrato", "fin_extrato_lotes", "fin_extrato_modelos", "fin_assist_regras", "fin_receber", "fin_pagar", "fin_contas", "fin_auditoria", "fin_categorias", "fin_centros_custo", "fin_config"]) {
        const r = await admin.from(t).delete().eq("empresa_id", empresa); if (r.error) console.error(t, r.error.message);
      }
    }
    if (empresa) { const { data: arqs } = await admin.storage.from("empresas-logos").list(empresa + "/bancos"); if (arqs?.length) await admin.storage.from("empresas-logos").remove(arqs.map((a) => empresa + "/bancos/" + a.name)); }
    if (user) { await admin.from("usuarios_empresas").delete().eq("user_id", user.id); await admin.from("usuarios").delete().eq("id", user.id); await admin.auth.admin.deleteUser(user.id); }
    if (empresa) { const r = await admin.from("empresas").delete().eq("id", empresa); if (r.error) console.error("empresa", r.error.message); }
  }
})().catch((e) => { console.error(e); process.exit(1); });
