// Teste de ponta a ponta (out/2026), opt-in, contra o Supabase de verdade e pelas telas reais:
// cria um pedido na tela do pedido, deixa reservado, separa (com kit virando componentes), imprime as etiquetas,
// confere o carregamento, faz montagem e desmontagem pelo App do Montador, confere o descarregamento e a triagem de
// volta às cegas (com uma peça faltando), resolve a ocorrência e encerra a operação. Confere no caminho o cronograma,
// a escala, a disponibilidade, a expedição e o financeiro.
// Tudo o que o teste cria (usuário, cliente, local, funcionário, pedido e tudo que nasce dele) é apagado no fim.
// Uso: RUN_FLUXO_LIVE=1 node tests/fluxo-completo-live.cjs   (FLUXO_MANTER=1 não apaga, para olhar depois)
require("dotenv").config({ quiet: true });
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { randomUUID } = require("node:crypto");
const fs = require("fs"), path = require("path"), assert = require("node:assert/strict");
// FLUXO_SITE=https://operacionalchiavari-stack.github.io/easyloc/ roda contra o site publicado em vez dos arquivos locais
const raiz = path.resolve(__dirname, ".."), BASE = process.env.FLUXO_SITE || "http://acervo.teste/";
const EMPRESA = "bb1260f0-99cd-4d17-ab9b-23c299b4c50b";
const ITEM = "935f7e88-04b8-4d1a-9c0b-693e17e44a0b";   // Katrina (Item)
const KIT = "8d158e93-8828-4f6d-8b48-dd6533e2ec28";    // Tiffany (Kit)
const tipos = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };
const FOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const dia = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); };
const shots = path.join(raiz, "outputs", "fluxo-completo");

(async () => {
  if (process.env.RUN_FLUXO_LIVE !== "1") { throw Error("Defina RUN_FLUXO_LIVE=1"); }
  fs.mkdirSync(shots, { recursive: true });
  const url = process.env.SUPABASE_URL; assert.equal(new URL(url).hostname, "awemuohtvwvrdzfxwrmd.supabase.co");
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const client = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const check = r => { if (r.error) { throw Error(r.error.message); } return r.data; };
  const suffix = randomUUID().slice(0, 8), senha = "Temp-" + randomUUID() + "!";
  const nomeCliente = "Cliente Fluxo " + suffix, nomeLocal = "Espaço Fluxo " + suffix, nomeMont = "Montador Fluxo " + suffix;
  const ENTREGA = dia(1), EVENTO = dia(1), COLETA = dia(2);
  let owner, clienteId, localId, mont, browser, pedidoId, contaId;
  const estoques = [], respostas = [];
  const erros = [], passo = m => console.log("ok - " + m);
  try {
    /* ---------- preparação ---------- */
    owner = check(await admin.auth.admin.createUser({ email: "fluxo-" + suffix + "@example.invalid", password: senha, email_confirm: true, user_metadata: { nome: "Equipe Fluxo " + suffix } })).user;
    check(await admin.from("usuarios_empresas").insert({ user_id: owner.id, empresa_id: EMPRESA, role: "admin" }));
    const sessao = check(await client.auth.signInWithPassword({ email: owner.email, password: senha })).session;
    clienteId = check(await admin.from("clientes_empresas").insert({ empresa_id: EMPRESA, tipo_pessoa: "PF", nome_razao: nomeCliente, cpf_cnpj: "00000000000", telefone: "11999990000", email: "cliente-fluxo@example.invalid", endereco: "Rua Teste, 1", status: "Ativo" }).select("id").single()).id;
    localId = check(await admin.from("locais_empresas").insert({ empresa_id: EMPRESA, tipo_pessoa: "PJ", cpf_cnpj: "00000000000000", inscricao_estadual: "isento", telefone: "11999990000", email: "fluxo@example.invalid", numero_endereco: "100", ponto_referencia: "Teste", tags: { tipo: "Casa de Festa", observacoes: ["Tem escadas"] }, nome_razao: nomeLocal, endereco: "Rua Teste, 100 - São Paulo", status: "Ativo", latitude: -23.55, longitude: -46.63, distancia_galpao_km: 12 }).select("id").single()).id;
    const r = await client.functions.invoke("funcionarios-admin", { body: { action: "save", empresa_id: EMPRESA, employee: { nome: nomeMont, setor: "Montagem", cargo: "Teste", acesso_sistema: false, ativo: true, pin: "0123", nivel_acesso: "Visualizador", cpf: "", equipe_operacional: "montagem" } } });
    if (r.error) { let d; try { d = await r.error.context.json(); } catch (e) {} throw Error(d?.error || r.error.message); }
    mont = r.data.id;
    check(await client.rpc("rh_definir_lider", { p_empresa_id: EMPRESA, p_funcionario: mont, p_lider: true }));

    browser = await chromium.launch({ channel: "msedge" });
    const novoContexto = async (logado) => {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: [] });
      await ctx.route("**/*", rota => {
        const u = new URL(rota.request().url());
        if (process.env.FLUXO_SITE || u.origin + "/" !== BASE) { return rota.continue(); }
        if (u.pathname.startsWith("/api/")) { erros.push("Chamou o motor antigo: " + u.pathname); return rota.fulfill({ status: 500, body: "{}" }); }
        const arq = path.join(raiz, decodeURIComponent(u.pathname));
        if (!fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { return rota.fulfill({ status: 404, body: "" }); }
        return rota.fulfill({ contentType: tipos[path.extname(arq)] || "application/octet-stream", body: fs.readFileSync(arq) });
      });
      await ctx.route(/easyloc-zeta\.vercel\.app/, rota => { erros.push("Chamou a Vercel: " + rota.request().url()); return rota.fulfill({ status: 500, body: "{}" }); });
      await ctx.addInitScript(() => { window.print = () => { window.__impressoes = (window.__impressoes || 0) + 1; }; });
      if (logado) { await ctx.addInitScript(s => { localStorage.setItem("easyloc-auth", s); sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "bb1260f0-99cd-4d17-ab9b-23c299b4c50b"); }, JSON.stringify(sessao)); }
      return ctx;
    };
    const abrir = async (ctx, rota) => {
      const page = await ctx.newPage();
      page.on("pageerror", e => erros.push(rota + ": " + e.message));
      page.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource|ERR_|net::|Geocoding Service|Google Maps JavaScript API/i.test(m.text())) { erros.push(rota + " (console): " + m.text()); } });
      page.on("dialog", d => d.type() === "prompt" ? d.accept(respostas.length ? respostas.shift() : d.defaultValue()) : d.accept());
      await page.goto(BASE + rota, { waitUntil: "domcontentloaded", timeout: 60000 });
      return page;
    };
    const foto = async (page, nome) => page.screenshot({ path: path.join(shots, nome + ".png"), fullPage: false });
    const equipe = await novoContexto(true);

    /* ---------- 1. pedido criado na tela do pedido ---------- */
    const ped = await abrir(equipe, "Modulos/Comercial/Pedidos/pedido.html");
    await ped.waitForSelector(".pedido-entrada", { timeout: 30000 });
    await ped.waitForFunction(() => typeof window.pedidoAdicionarDoCatalogo === "function" && window.__CONTEXT?.empresa_id, null, { timeout: 30000 });
    await ped.fill("#clienteInput", nomeCliente);
    await ped.click(`.autocomplete-item:has-text("${nomeCliente}")`, { timeout: 15000 });
    const tipoEv = await ped.$$eval("#tipoEventoSelect option", os => os.map(o => o.value).filter(Boolean));
    if (tipoEv.length) { await ped.selectOption("#tipoEventoSelect", tipoEv[0]); }
    await ped.fill("#dataEntrega", ENTREGA); await ped.fill("#horaEntrega", "08:00");
    await ped.fill("#dataEvento", EVENTO);
    await ped.fill("#dataColeta", COLETA); await ped.fill("#horaColeta", "09:00");
    await ped.fill("#localInput", nomeLocal);
    await ped.click(`#localLista .autocomplete-item:has-text("${nomeLocal}")`, { timeout: 15000 }).catch(async () => { await ped.locator(".autocomplete-item", { hasText: nomeLocal }).first().click(); });
    await ped.waitForFunction(() => document.getElementById("localIdHidden")?.value);
    await ped.evaluate(async ([item, kit]) => {
      await window.pedidoAdicionarDoCatalogo(item); await window.pedidoAdicionarDoCatalogo(kit);
      const linha = id => [...document.querySelectorAll("#listaItens tr.item-row")].find(r => r.dataset.itemId === id);
      linha(item).querySelector(".qtd").innerText = "3"; linha(kit).querySelector(".qtd").innerText = "2";
      linha(item).querySelector(".qtd").dispatchEvent(new Event("input", { bubbles: true }));
      linha(kit).querySelector(".qtd").dispatchEvent(new Event("input", { bubbles: true }));
    }, [ITEM, KIT]);
    await ped.selectOption("#pedidoStatusComercial", "aprovado");
    await ped.waitForFunction(() => (window.__PEDIDO_STATUS_ATUAL || "") === "aprovado", null, { timeout: 10000 }).catch(() => {});
    await foto(ped, "01-pedido-dados");
    await ped.click(".ct-avancar");
    await ped.waitForFunction(() => window.__PEDIDO_ATUAL_ID, null, { timeout: 30000 }).catch(() => {});
    await ped.waitForTimeout(2500);
    await foto(ped, "02-pedido-salvo");
    pedidoId = await ped.evaluate(() => window.__PEDIDO_ATUAL_ID);
    if (!pedidoId) { const msg = await ped.evaluate(() => [...document.querySelectorAll(".ct-erro, .alerta, .toast, [role=alert], .modal-alerta")].map(e => e.innerText).join(" | ")); throw Error("Pedido não foi salvo: " + msg); }
    const p1 = check(await admin.from("separacoes_pedidos").select("*").eq("id", pedidoId).single());
    assert.equal(p1.status_comercial, "aprovado");
    const linhas1 = check(await admin.from("separacoes_itens").select("*").eq("separacao_pedido_id", pedidoId));
    assert.equal(linhas1.length, 2);
    passo("1 - pedido " + p1.numero_pedido + " criado na tela do pedido, reservado (cliente, local, datas, 3 Katrina + 2 kits Tiffany)");

    /* ---------- 2. cronograma, escala e disponibilidade ---------- */
    const etapas = check(await admin.from("operacao_etapas").select("id,tipo,data,hora").eq("pedido_id", pedidoId));
    const tiposEt = etapas.map(e => e.tipo).sort();
    for (const t of ["triagem_ida", "carregamento", "montagem", "desmontagem", "descarregamento", "triagem_volta"]) { assert.ok(tiposEt.includes(t), "falta a etapa " + t + ": " + tiposEt); }
    const montagem = etapas.find(e => e.tipo === "montagem"), desmontagem = etapas.find(e => e.tipo === "desmontagem");
    assert.equal(montagem.data, ENTREGA); assert.equal(desmontagem.data, COLETA);
    // mesma conta da disponibilidade que o catálogo e a Helena mostram
    const disp = await client.functions.invoke("catalogo-assistente", { body: { action: "disponibilidade", empresa_id: EMPRESA, data: EVENTO, item_ids: [ITEM] } });
    if (disp.error) { throw Error("disponibilidade: " + disp.error.message); }
    const dk = disp.data.itens[ITEM];
    assert.ok(dk && dk.total - dk.livre >= 3, "Katrina reservada no dia do evento: " + JSON.stringify(dk));
    const crono = await abrir(equipe, "Modulos/Chiavari/Cronograma/cronograma.html");
    await crono.waitForFunction(() => window.ACERVO_LOCAL && window.google?.script, null, { timeout: 30000 });
    const semana = await crono.evaluate(d => window.ACERVO_LOCAL.getCronogramaSemana(d), ENTREGA);
    const grupo = semana.find(g => g.pedidoSistemaId === pedidoId);
    assert.ok(grupo, "pedido aparece no cronograma da semana");
    await crono.waitForFunction(n => document.body.innerText.includes(n), p1.numero_pedido, { timeout: 30000 });
    await foto(crono, "03-cronograma");
    // a escala: o montador líder do teste vira responsável pela montagem e desmontagem
    for (const et of [montagem, desmontagem]) {
      const s = await client.rpc("operacao_escala_salvar", { p_etapa: et.id, p_responsavel: nomeMont, p_equipe: [], p_caminhoes: [], p_forcar: true });
      if (s.error) { throw Error("escala: " + s.error.message); }
    }
    passo("2 - o pedido gerou as 6 etapas no cronograma (montagem na entrega, desmontagem na coleta), reservou o estoque e a escala grava o responsável");

    /* ---------- 3. separação com etiquetas de envio ---------- */
    const sep = await abrir(equipe, "Modulos/Estoque/SeparacaoMateriais/separacao-materiais.html?pedido=" + pedidoId + "&etapa=ida");
    await sep.waitForSelector("#separacaoModoModal:not(.hidden)", { timeout: 30000 });
    await sep.click("[data-etiquetas-envio]");
    await sep.waitForSelector("dialog.etq-dialogo[open]", { timeout: 15000 });
    await sep.click("dialog.etq-dialogo .etq-ok");
    let etiquetas = [];
    for (let i = 0; i < 40 && etiquetas.length < 7; i++) { await sep.waitForTimeout(500); etiquetas = check(await admin.from("separacoes_etiquetas").select("*").eq("separacao_pedido_id", pedidoId).order("codigo")); }
    assert.equal(etiquetas.length, 7, "3 Katrina + 2 kits × 2 componentes = 7 etiquetas");
    assert.ok(etiquetas.every(e => e.codigo.startsWith(p1.numero_pedido + "-")), etiquetas.map(e => e.codigo).join());
    await sep.waitForFunction(() => (window.__impressoes || 0) > 0 || document.querySelector("iframe"), null, { timeout: 15000 }).catch(() => {});
    await sep.click('[data-separacao-modo="qr"]');
    await sep.waitForSelector("#separacaoQrModal:not(.hidden)", { timeout: 15000 });
    for (const [i, e] of etiquetas.entries()) {
      await sep.fill("#scannerInput", "ACERVO:ENV:" + e.codigo); await sep.press("#scannerInput", "Enter");
      await sep.waitForFunction(n => document.getElementById("separacaoQrQtd").textContent.trim().startsWith(n + " /"), String(i + 1), { timeout: 15000 });
    }
    await sep.fill("#scannerInput", "ACERVO:ENV:" + etiquetas[0].codigo); await sep.press("#scannerInput", "Enter");
    await sep.waitForTimeout(1200);
    assert.ok((await sep.textContent("#separacaoQrQtd")).trim().startsWith("7 /"), "etiqueta lida duas vezes não conta de novo");
    await foto(sep, "04-separacao-qr");
    await sep.click("#btnFinalizarSeparacao");
    let p3;
    for (let i = 0; i < 30; i++) { await sep.waitForTimeout(500); p3 = check(await admin.from("separacoes_pedidos").select("status").eq("id", pedidoId).single()); if (p3.status === "separado") { break; } }
    assert.equal(p3.status, "separado");
    const lidasSep = check(await admin.from("separacoes_etiquetas").select("lida_separacao_em").eq("separacao_pedido_id", pedidoId));
    assert.ok(lidasSep.every(e => e.lida_separacao_em), "todas as etiquetas marcadas como lidas na separação");
    passo("3 - separação: 7 etiquetas de envio impressas (kit virou cadeira + futton), lidas pelo QR, leitura repetida recusada, separação finalizada");

    /* ---------- conferência por bipagem (carregamento, descarregamento e volta) ---------- */
    const conferir = async (etapa, codigos, nomeFoto) => {
      const cf = await abrir(equipe, "Modulos/Logistica/Conferencia/conferencia.html?pedido=" + pedidoId + "&etapa=" + etapa);
      await cf.waitForSelector("#cfCorpo:not([hidden])", { timeout: 30000 });
      for (const c of codigos) {
        await cf.fill("#cfEntrada", "ACERVO:ENV:" + c); await cf.press("#cfEntrada", "Enter"); await cf.waitForTimeout(450);
      }
      await cf.waitForTimeout(800);
      await foto(cf, nomeFoto);
      await cf.click("#cfConcluir");
      const confirma = cf.locator(".el-alert-confirm .el-alert__actions button").last();
      if (await confirma.isVisible({ timeout: 2500 }).catch(() => false)) { await confirma.click(); }
      let reg;
      for (let i = 0; i < 30; i++) { await cf.waitForTimeout(500); reg = check(await admin.from("separacoes_pedidos").select("operacao,status_operacional").eq("id", pedidoId).single()); if (reg.operacao?.[etapa]?.concluido_em) { break; } }
      assert.ok(reg.operacao?.[etapa]?.concluido_em, etapa + " concluído");
      return { cf, reg };
    };
    const codigos = etiquetas.map(e => e.codigo);

    /* ---------- 4. carregamento ---------- */
    const { cf: cfCarr, reg: r4 } = await conferir("carregamento", codigos, "05-carregamento");
    assert.equal(r4.status_operacional, "carregado"); assert.equal(r4.operacao.carregamento.lidas, 7);
    await cfCarr.close();
    const exp = await abrir(equipe, "Modulos/Logistica/Expedicao/expedicao.html");
    await exp.waitForFunction(n => [...document.querySelectorAll("#separacaoColunaSeparados .exp-card, #separacaoColunaSeparados [data-pedido-id]")].some(c => c.innerText.includes(n)) || document.body.innerText.includes(n), p1.numero_pedido, { timeout: 30000 });
    await foto(exp, "06-expedicao");
    passo("4 - carregamento conferido por bipagem (7 de 7) e o pedido aparece na Expedição");

    /* ---------- 5. montagem e desmontagem pelo App do Montador ---------- */
    const campo = await novoContexto(false);
    const app = await abrir(campo, "Modulos/Chiavari/Cronograma/montador.html");
    await app.waitForFunction(n => [...document.querySelectorAll("#loginNome option")].some(o => o.textContent.trim() === n), nomeMont, { timeout: 30000 });
    await app.selectOption("#loginNome", { label: nomeMont });
    await app.fill("#loginSenha", "0123"); await app.click("#btnEntrar");
    await app.waitForFunction(() => localStorage.getItem("montadorToken"), null, { timeout: 20000 });
    const tok = await app.evaluate(() => localStorage.getItem("montadorToken"));
    const L = (fn, ...args) => app.evaluate(([fn, args]) => window.ACERVO_LOCAL[fn](...args), [fn, args]);
    const dadosApp = JSON.stringify(await L("MONT_appCarregar", tok, ""));
    assert.ok(dadosApp.includes(montagem.id) && dadosApp.includes(desmontagem.id), "o montador vê a montagem e a desmontagem do pedido");
    await foto(app, "07-app-montador");
    await assert.rejects(L("salvarEquipeTerceirizada", { idCronograma: montagem.id, foto: FOTO, latitude: -23.55, longitude: -46.63, precisaoGPS: 10, quantidade: 2 }), /Inicie este evento/);
    const ap1 = await L("MONT_iniciarApontamento", tok, montagem.id);
    const eq = await L("salvarEquipeTerceirizada", { idCronograma: montagem.id, foto: FOTO, latitude: -23.5501, longitude: -46.6301, precisaoGPS: 10, quantidade: 2 });
    assert.equal(eq.chegada?.localStatus, "NO_LOCAL", "chegada registrada no local do evento");
    await L("salvarSacolasProtecao", { idCronograma: montagem.id, sacolas: [{ codigo: "SAC-1", foto: FOTO }] });
    await L("salvarPosicionamentoItens", { idCronograma: montagem.id, fotos: [FOTO], observacao: "ok" });
    await assert.rejects(L("MONT_iniciarApontamento", tok, desmontagem.id), /Finalize os registros obrigatórios da montagem|Encerre o evento em andamento/);
    await L("salvarListaAssinada", { idCronograma: montagem.id, nome: "Recebedor Teste", foto: FOTO });
    await L("MONT_finalizarApontamento", tok, ap1.id);
    await L("MONT_iniciarApontamento", tok, desmontagem.id);
    const ap2 = await L("MONT_apontamentoAtual", tok);
    await L("salvarEquipeTerceirizada", { idCronograma: desmontagem.id, foto: FOTO, latitude: -23.5501, longitude: -46.6301, precisaoGPS: 10, quantidade: 2 });
    await assert.rejects(L("concluirDesmontagem", { idCronograma: desmontagem.id }), /lista conferida/);
    await L("salvarListaConferidaDesmontagem", { idCronograma: desmontagem.id, fotos: [FOTO] });
    await L("concluirDesmontagem", { idCronograma: desmontagem.id });
    await L("MONT_finalizarApontamento", tok, ap2.id);
    const regs = check(await admin.from("operacao_registros").select("tipo").in("etapa_id", [montagem.id, desmontagem.id]));
    assert.equal(regs.length, 7, regs.map(r => r.tipo).join());
    passo("5 - App do Montador: entra com PIN, registra chegada no local, sacolas, posicionamento, lista assinada; desmontagem com lista conferida e concluída (com as travas de ordem)");

    /* ---------- 6. descarregamento ---------- */
    const { cf: cfDesc, reg: r6 } = await conferir("descarregamento", codigos, "08-descarregamento");
    assert.equal(r6.status_operacional, "descarregado"); await cfDesc.close();
    passo("6 - descarregamento conferido no galpão");

    /* ---------- 7. triagem de volta às cegas, com uma peça faltando ---------- */
    const katrinas = etiquetas.filter(e => e.item_id === ITEM);
    const faltou = katrinas[katrinas.length - 1];
    const estoqueAntes = check(await admin.from("itens").select("estoque_total").eq("id", ITEM).single()).estoque_total;
    estoques.push({ id: ITEM, valor: estoqueAntes });
    const cfRet = await abrir(equipe, "Modulos/Logistica/Conferencia/conferencia.html?pedido=" + pedidoId + "&etapa=retorno");
    await cfRet.waitForSelector("#cfCorpo:not([hidden])", { timeout: 30000 });
    const textoCego = await cfRet.innerText("#cfCorpo");
    assert.ok(!/de 7|7 volumes|\/ ?7/.test(textoCego), "às cegas: a tela não diz quantas peças devem voltar: " + textoCego.slice(0, 200));
    for (const c of codigos.filter(c => c !== faltou.codigo)) { await cfRet.fill("#cfEntrada", "ACERVO:ENV:" + c); await cfRet.press("#cfEntrada", "Enter"); await cfRet.waitForTimeout(450); }
    await cfRet.click("#cfConcluir");
    await cfRet.locator(".el-alert-confirm .el-alert__actions button").last().click({ timeout: 10000 });
    await cfRet.waitForFunction(() => /Não voltaram|não voltaram/.test(document.body.innerText), null, { timeout: 30000 });
    await foto(cfRet, "09-retorno-resultado");
    const ocs = check(await admin.from("operacao_ocorrencias").select("*").eq("pedido_id", pedidoId));
    assert.equal(ocs.length, 1); assert.equal(ocs[0].tipo, "falta"); assert.equal(ocs[0].codigo, faltou.codigo);
    passo("7 - triagem de volta às cegas: 6 bipadas, o sistema acusou a Katrina que não voltou e abriu a ocorrência de falta");

    /* ---------- 8. avaria, perda e encerramento ---------- */
    await cfRet.waitForSelector("#cfEncerrar", { timeout: 20000 });
    await cfRet.click("#cfEncerrar");
    await cfRet.waitForFunction(() => /Resolva as ocorr/.test(document.getElementById("cfEncerramentoMensagem")?.textContent || ""), null, { timeout: 15000 });
    await cfRet.click("#cfOcorrencias summary");
    const futton = etiquetas.find(e => e.item_id !== ITEM);
    await cfRet.selectOption("#cfFormularioOcorrencia select[name=tipo]", "avaria");
    await cfRet.selectOption("#cfFormularioOcorrencia select[name=codigo]", futton.codigo);
    await cfRet.fill("#cfFormularioOcorrencia textarea[name=descricao]", "Futton rasgado, mandar para a costura");
    await cfRet.click("#cfNovaOcorrencia");
    await cfRet.waitForFunction(() => document.querySelectorAll("[data-resolver]").length === 2, null, { timeout: 15000 });
    const dispAv = await client.functions.invoke("catalogo-assistente", { body: { action: "disponibilidade", empresa_id: EMPRESA, data: dia(30), item_ids: [futton.item_id] } });
    const futtonItem = check(await admin.from("itens").select("estoque_total").eq("id", futton.item_id).single());
    assert.ok(dispAv.data.itens[futton.item_id].livre <= futtonItem.estoque_total - 1, "peça em avaria fica indisponível até ser resolvida");
    respostas.push("perda", "Cliente não devolveu, cobrar reposição", "resolvido", "Costura trocou o tecido");
    const btnFalta = cfRet.locator("[data-resolver]").first();
    await btnFalta.click();
    await cfRet.locator(".el-alert-confirm .el-alert__actions button").last().click({ timeout: 10000 });
    await cfRet.waitForFunction(() => document.querySelectorAll("[data-resolver]").length === 1, null, { timeout: 15000 });
    await cfRet.locator("[data-resolver]").first().click();
    await cfRet.waitForFunction(() => document.querySelectorAll("[data-resolver]").length === 0, null, { timeout: 15000 });
    const estoqueDepois = check(await admin.from("itens").select("estoque_total").eq("id", ITEM).single()).estoque_total;
    assert.equal(Number(estoqueDepois), Number(estoqueAntes) - 1, "perda confirmada baixa 1 do estoque");
    await cfRet.click("#cfEncerrar");
    await cfRet.waitForFunction(() => /Operação encerrada/.test(document.getElementById("cfEncerramentoMensagem")?.textContent || ""), null, { timeout: 15000 });
    await foto(cfRet, "10-encerrado");
    const pf = check(await admin.from("separacoes_pedidos").select("status_operacional,encerrado_operacional_em").eq("id", pedidoId).single());
    assert.equal(pf.status_operacional, "encerrado"); assert.ok(pf.encerrado_operacional_em);
    passo("8 - avaria registrada (peça indisponível até resolver), falta confirmada como perda (baixa 1 do estoque), operação encerrada");

    /* ---------- 9. financeiro: o pedido reservado virou contas a receber; recebimento pela tela ---------- */
    const titulos = check(await admin.from("fin_receber").select("*").eq("pedido_id", pedidoId).neq("status", "cancelado"));
    assert.ok(titulos.length >= 1, "pedido aprovado gera contas a receber");
    const somaTit = titulos.reduce((s, t) => s + Number(t.valor), 0);
    assert.ok(Math.abs(somaTit - Number(p1.valor_total)) < 0.05, "contas a receber somam o valor do pedido: " + somaTit + " x " + p1.valor_total);
    contaId = check(await admin.from("fin_contas").insert({ empresa_id: EMPRESA, nome: "Conta Fluxo " + suffix, tipo: "corrente" }).select("id").single()).id;
    const fin = await abrir(equipe, "Modulos/Financeiro/financeiro.html?aba=receber");
    const cartao = fin.locator("article.fin-pedido", { hasText: "Pedido " + p1.numero_pedido + " · " + nomeCliente });
    await cartao.waitFor({ timeout: 30000 });
    await cartao.locator("[data-r-baixar]").first().click();
    await fin.waitForSelector("#finModal[open]");
    await fin.selectOption("#finModalCorpo select[name=conta]", contaId);
    await fin.locator("#finModalRodape button", { hasText: "Confirmar recebimento" }).click();
    let recebido = 0;
    for (let i = 0; i < 30 && !recebido; i++) { await fin.waitForTimeout(500); recebido = check(await admin.from("fin_receber").select("recebido").eq("pedido_id", pedidoId)).reduce((s, t) => s + Number(t.recebido), 0); }
    assert.ok(recebido > 0, "recebimento registrado");
    await foto(fin, "11-financeiro");
    passo("9 - financeiro: o pedido gerou " + titulos.length + " conta(s) a receber somando o valor do pedido, e o recebimento foi registrado pela tela");

    /* ---------- 10. Central de Pedidos e cronograma mostram o pedido encerrado ---------- */
    const central = await abrir(equipe, "Modulos/Comercial/Pedidos/CentralPedidos.html");
    await central.waitForFunction(n => document.body.innerText.includes(n), nomeCliente, { timeout: 30000 });
    await foto(central, "12-central-pedidos");
    const crono2 = await abrir(equipe, "Modulos/Chiavari/Cronograma/cronograma.html");
    await crono2.waitForFunction(() => window.ACERVO_LOCAL && window.google?.script, null, { timeout: 30000 });
    const sem2 = await crono2.evaluate(d => window.ACERVO_LOCAL.getCronogramaSemana(d), ENTREGA);
    const g2 = sem2.find(g => g.pedidoSistemaId === pedidoId);
    assert.ok(g2, "pedido continua no cronograma");
    passo("10 - Central de Pedidos lista o pedido e o cronograma mostra o andamento");

    assert.deepEqual(erros, [], "sem erros de JavaScript nem chamadas ao motor antigo:
" + erros.join("
"));
    console.log("PASS LIVE: fluxo completo do pedido ao encerramento" + (process.env.FLUXO_SITE ? " no site publicado" : ""));
  } finally {
    if (browser) { await browser.close(); }
    if (process.env.FLUXO_MANTER === "1") { console.log("FLUXO_MANTER=1: dados mantidos. pedido", pedidoId, "owner", owner?.email); return; }
    for (const e of estoques) { await admin.from("itens").update({ estoque_total: e.valor }).eq("id", e.id); }
    await limpar({ admin, pedidoId, clienteId, localId, mont, owner, suffix, contaId });
  }
})().catch(e => { console.error(e); process.exit(1); });

async function limpar({ admin, pedidoId, clienteId, localId, mont, owner, suffix, contaId }) {
  const tenta = async (nome, fn) => { try { const r = await fn(); if (r && r.error) { console.error("limpeza", nome, r.error.message); } } catch (e) { console.error("limpeza", nome, e.message); } };
  if (pedidoId) {
    const etapas = ((await admin.from("operacao_etapas").select("id").eq("pedido_id", pedidoId)).data || []).map(e => e.id);
    if (etapas.length) {
      for (const t of ["operacao_registros", "operacao_apontamentos", "operacao_trocas", "operacao_etapa_pessoas", "operacao_etapa_caminhoes", "free_vagas"]) { await tenta(t, () => admin.from(t).delete().in("etapa_id", etapas)); }
    }
    // fin_receber apaga junto as baixas e os movimentos delas (cascade)
    for (const t of ["fin_receber", "operacao_alertas_motorista", "operacao_ocorrencias", "operacao_patrimonios_lidos", "pedido_cronograma_pendencias", "operacao_etapas", "operacao_pedidos_info"]) { await tenta(t, () => admin.from(t).delete().eq("pedido_id", pedidoId)); }
    await tenta("pedido0", () => admin.from("separacoes_pedidos").delete().eq("id", pedidoId));
    await tenta("leituras", () => admin.from("separacoes_leituras").delete().eq("separacao_pedido_id", pedidoId));
    await tenta("etiquetas", () => admin.from("separacoes_etiquetas").delete().eq("separacao_pedido_id", pedidoId));
    await tenta("contratos", () => admin.from("contratos_pedidos").delete().eq("pedido_id", pedidoId));
    await tenta("itens", () => admin.from("separacoes_itens").delete().eq("separacao_pedido_id", pedidoId));
    await tenta("pedido", () => admin.from("separacoes_pedidos").delete().eq("id", pedidoId));
  }
  if (contaId) { await tenta("fin_movimentos", () => admin.from("fin_movimentos").delete().eq("conta_id", contaId)); await tenta("fin_baixas", () => admin.from("fin_baixas").delete().eq("conta_id", contaId)); await tenta("fin_auditoria", () => admin.from("fin_auditoria").delete().eq("entidade_id", contaId)); await tenta("conta", () => admin.from("fin_contas").delete().eq("id", contaId)); }
  await tenta("alteracoes", () => admin.from("operacao_alteracoes").delete().like("usuario_nome", "%" + suffix + "%"));
  if (owner) { await tenta("fin_auditoria", () => admin.from("fin_auditoria").delete().eq("usuario_id", owner.id)); await tenta("qualidade", () => admin.from("qualidade_inspecoes").delete().eq("criado_por", owner.id)); await tenta("alteracoes2", () => admin.from("operacao_alteracoes").delete().eq("usuario_nome", owner.email)); }
  if (clienteId) { await tenta("cliente", () => admin.from("clientes_empresas").delete().eq("id", clienteId)); }
  if (localId) { await tenta("local", () => admin.from("locais_empresas").delete().eq("id", localId)); }
  if (mont) {
    const ses = (await admin.from("app_sessoes").select("pasta").eq("funcionario_id", mont)).data || [];
    for (const s of ses) { const arqs = (await admin.storage.from("operacao-fotos").list(s.pasta)).data || []; if (arqs.length) { await admin.storage.from("operacao-fotos").remove(arqs.map(a => s.pasta + "/" + a.name)); } }
    await tenta("sessoes", () => admin.from("app_sessoes").delete().eq("funcionario_id", mont));
  }
  for (const id of [mont, owner && owner.id].filter(Boolean)) {
    await tenta("pin", () => admin.from("rh_pin_tentativas").delete().eq("funcionario_id", id));
    await tenta("logs", () => admin.from("logs_permissoes").delete().eq("usuario_alvo_id", id));
    await tenta("perm", () => admin.from("permissoes_usuario").delete().eq("usuario_id", id));
    await tenta("ue", () => admin.from("usuarios_empresas").delete().eq("user_id", id));
    await tenta("usu", () => admin.from("usuarios").delete().eq("id", id));
    await tenta("func", () => admin.from("funcionarios_acesso").delete().eq("id", id));
    if (!(await admin.auth.admin.getUserById(id)).error) { await admin.auth.admin.deleteUser(id); }
  }
  console.log("limpeza concluída");
}
