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
const raiz = path.resolve(__dirname, ".."), BASE = process.env.FLUXO_SITE || "http://localhost:5599/"; // localhost: contexto seguro (o catálogo usa crypto.randomUUID)
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
  const cpfMont = (() => { const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)); for (const t of [10, 11]) { const s = n.reduce((a, d, i) => a + d * (t - i), 0) % 11; n.push(s < 2 ? 0 : 11 - s); } return n.join(""); })();
  const inicioTeste = new Date(Date.now() - 60000).toISOString();
  const nomeCliente = "Cliente Fluxo " + suffix, nomeLocal = "Espaço Fluxo " + suffix, nomeMont = "Montador Fluxo " + suffix;
  const DESLOC = Number(process.env.FLUXO_DESLOCAR_DIAS || 0); // dia livre na frota (ex.: 30)
  const ENTREGA = dia(1 + DESLOC), EVENTO = dia(1 + DESLOC), COLETA = dia(2 + DESLOC);
  let owner, clienteId, localId, mont, browser, pedidoId, contaId, travaPagamento = null;
  const estoques = [], respostas = [], contagensTeste = [];
  const erros = [], passo = m => console.log("ok - " + m);
  try {
    /* ---------- preparação ---------- */
    // trava de pagamento mínimo (Parâmetros > Financeiro): desligada só durante o teste (não há conta para um recebimento de teste antes do carregamento); religada no fim
    travaPagamento = (await admin.from("empresa_financeiro").select("pagamento_exige").eq("empresa_id", EMPRESA).maybeSingle()).data?.pagamento_exige ?? null;
    if (travaPagamento) check(await admin.from("empresa_financeiro").update({ pagamento_exige: false }).eq("empresa_id", EMPRESA));
    owner = check(await admin.auth.admin.createUser({ email: "fluxo-" + suffix + "@example.invalid", password: senha, email_confirm: true, user_metadata: { nome: "Equipe Fluxo " + suffix } })).user;
    check(await admin.from("usuarios_empresas").insert({ user_id: owner.id, empresa_id: EMPRESA, role: "admin" }));
    const sessao = check(await client.auth.signInWithPassword({ email: owner.email, password: senha })).session;
    clienteId = check(await admin.from("clientes_empresas").insert({ empresa_id: EMPRESA, tipo_pessoa: "PF", nome_razao: nomeCliente, telefone: "11999990000", email: "cliente-fluxo@example.invalid", endereco: "Rua Teste, 1", status: "Ativo" }).select("id").single()).id;
    localId = check(await admin.from("locais_empresas").insert({ empresa_id: EMPRESA, tipo_pessoa: "PJ", cpf_cnpj: "", inscricao_estadual: "isento", telefone: "11999990000", email: "fluxo@example.invalid", numero_endereco: "100", ponto_referencia: "Teste", tags: { tipo: "Casa de Festa", observacoes: ["Tem escadas"] }, nome_razao: nomeLocal, endereco: "Rua Teste, 100 - São Paulo", status: "Ativo", latitude: -23.55, longitude: -46.63, distancia_galpao_km: 12 }).select("id").single()).id;
    const r = await client.functions.invoke("funcionarios-admin", { body: { action: "save", empresa_id: EMPRESA, employee: { nome: nomeMont, setor: "Montagem", cargo: "Teste", acesso_sistema: false, ativo: true, pin: "0123", nivel_acesso: "Visualizador", cpf: cpfMont, equipe_operacional: "montagem" } } });
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
    await ped.fill("#dataEvento", EVENTO); await ped.locator("#dataEvento").dispatchEvent("change"); // entrega e coleta só depois do evento
    await ped.fill("#dataEntrega", ENTREGA); await ped.fill("#horaEntrega", "08:00");
    await ped.fill("#dataColeta", COLETA); await ped.fill("#horaColeta", "09:00");
    await ped.fill("#localInput", nomeLocal);
    await ped.click(`#localLista .autocomplete-item:has-text("${nomeLocal}")`, { timeout: 15000 }).catch(async () => { await ped.locator(".autocomplete-item", { hasText: nomeLocal }).first().click(); });
    await ped.waitForFunction(() => document.getElementById("localIdHidden")?.value);
    // itens entram pelo catálogo do pedido (a lista do pedido vem dos ambientes do catálogo)
    await ped.waitForFunction(() => { const w = document.querySelector("iframe.pedido-catalogo-real")?.contentWindow; return w?.catalogAssistenteProjeto && typeof w.sincronizarPedidoCatalogo === "function"; }, null, { timeout: 90000 });
    await ped.evaluate(async ([item, kit]) => {
      const w = document.querySelector("iframe.pedido-catalogo-real").contentWindow;
      await w.catalogAssistenteProjeto.quantidade({ item_id: item, quantidade: 3, ambiente: "Lounge" });
      await w.catalogAssistenteProjeto.quantidade({ item_id: kit, quantidade: 2, ambiente: "Lounge" });
      await w.sincronizarPedidoCatalogo();
    }, [ITEM, KIT]);
    // financeiro do pedido separado por divisão: um bloco para locação, frete e montagem; o frete vira 2 parcelas
    await ped.click(".comercial-trilha [data-etapa=financeiro]");
    await ped.waitForSelector(".pedido-etapa-financeiro:not([hidden])", { timeout: 15000 });
    await ped.waitForFunction(() => document.querySelectorAll("#cronogramaParcelas .pg-grupo").length >= 2, null, { timeout: 30000 });
    const grupos = await ped.$$eval("#cronogramaParcelas .pg-grupo", gs => gs.map(g => g.dataset.componente));
    assert.ok(grupos.includes("locacao") && grupos.includes("frete"), "blocos do financeiro: " + grupos);
    const valorFrete = await ped.evaluate(() => window.__PEDIDO_VALORES.frete);
    const metade = Math.round(valorFrete * 50) / 100;
    await ped.evaluate(v => { const c = document.querySelector("#cronogramaParcelas tr.pg-linha[data-componente=frete] .pg-valor"); c.textContent = v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); c.dispatchEvent(new Event("input", { bubbles: true })); }, metade);
    await ped.click("#cronogramaParcelas [data-pg-add=frete]");
    assert.equal(await ped.locator("#cronogramaParcelas tr.pg-linha[data-componente=frete]").count(), 2, "frete com 2 parcelas");
    assert.equal((await ped.textContent("#cronogramaParcelas .pg-grupo[data-componente=frete] [data-pg-grupo-falta]")).trim(), "Distribuído");
    // montagem com valor (categorias de montagem cadastradas): uma parcela com o que falta, senão o pedido não salva
    if (await ped.locator("#cronogramaParcelas [data-pg-add=montagem]").count() && (await ped.textContent("#cronogramaParcelas .pg-grupo[data-componente=montagem] [data-pg-grupo-falta]")).trim() !== "Distribuído") {
      await ped.click("#cronogramaParcelas [data-pg-add=montagem]");
      assert.equal((await ped.textContent("#cronogramaParcelas .pg-grupo[data-componente=montagem] [data-pg-grupo-falta]")).trim(), "Distribuído");
    }
    // frete e montagem são recalculados em segundo plano: antes de salvar, completa toda divisão que ainda falte
    await ped.waitForTimeout(2000);
    for (const comp of await ped.$$eval("#cronogramaParcelas .pg-grupo", gs => gs.map(g => g.dataset.componente))) {
      const falta = (await ped.textContent("#cronogramaParcelas .pg-grupo[data-componente=" + comp + "] [data-pg-grupo-falta]")).trim();
      if (falta !== "Distribuído" && /Falta/i.test(falta)) await ped.click("#cronogramaParcelas [data-pg-add=" + comp + "]");
    }
    await foto(ped, "01b-pedido-financeiro");
    await ped.selectOption("#pedidoStatusComercial", "aprovado");
    await ped.waitForFunction(() => (window.__PEDIDO_STATUS_ATUAL || "") === "aprovado", null, { timeout: 10000 }).catch(() => {});
    await foto(ped, "01-pedido-dados");
    await ped.evaluate(() => { window.__alertas = []; const o = window.alerta; window.alerta = (...a) => { window.__alertas.push(a.slice(0, 2).join(" · ")); return o?.(...a); }; });
    await ped.click(".ct-avancar");
    await ped.waitForFunction(() => window.__PEDIDO_ATUAL_ID, null, { timeout: 30000 }).catch(() => {});
    await ped.waitForTimeout(2500);
    await foto(ped, "02-pedido-salvo");
    pedidoId = await ped.evaluate(() => window.__PEDIDO_ATUAL_ID);
    if (!pedidoId) { const msg = await ped.evaluate(() => [...document.querySelectorAll(".ct-erro, .el-alert, .alerta, .toast, [role=alert], .modal-alerta")].map(e => e.innerText).join(" | ") + " | alertas: " + (window.__alertas || []).join(" / ")); throw Error("Pedido não foi salvo: " + msg); }
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
      await cf.waitForSelector("#cfCorpo:not([hidden])", { timeout: 30000 }).catch(async (e) => { console.log("TELA:", (await cf.innerText("body")).slice(0, 1500)); throw e; });
      for (const c of codigos) {
        await cf.fill("#cfEntrada", "ACERVO:ENV:" + c); await cf.press("#cfEntrada", "Enter"); await cf.waitForTimeout(450);
      }
      await cf.waitForTimeout(800);
      await foto(cf, nomeFoto);
      await cf.click("#cfConcluir");
      // janelas da conclusão, na ordem em que aparecerem: caminhão (só no carregamento), confirmações
      for (let i = 0; i < 24; i++) {
        const escolha = cf.locator("dialog.cf-escolha-caminhao[open]");
        if (await escolha.isVisible().catch(() => false)) {
          if (!(await escolha.locator("input:checked").count())) { assert.ok(await escolha.locator("input").count(), "a frota precisa ter um caminhão para concluir o carregamento"); await escolha.locator("input").first().check(); }
          await escolha.locator("[data-ok]").click(); await cf.waitForTimeout(600); continue;
        }
        const confirma = cf.locator(".el-alert-confirm .el-alert__actions button").last();
        if (await confirma.isVisible().catch(() => false)) { await confirma.click(); await cf.waitForTimeout(600); continue; }
        const confirmaNova = cf.locator("dialog.cf-confirmacao[open] [type=submit]");
        if (await confirmaNova.isVisible().catch(() => false)) { await confirmaNova.click(); await cf.waitForTimeout(600); continue; }
        const r = check(await admin.from("separacoes_pedidos").select("operacao").eq("id", pedidoId).single());
        if (r.operacao?.[etapa]?.concluido_em) break;
        await cf.waitForTimeout(500);
      }
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
    await app.waitForSelector("#loginCpf", { timeout: 30000 });
    await app.fill("#loginCpf", cpfMont);
    await app.fill("#loginSenha", "0123"); await app.click("#btnEntrar");
    await app.waitForFunction(() => localStorage.getItem("montadorToken"), null, { timeout: 20000 });
    const tok = await app.evaluate(() => localStorage.getItem("montadorToken"));
    const L = (fn, ...args) => app.evaluate(([fn, args]) => window.ACERVO_LOCAL[fn](...args), [fn, args]);
    const dadosApp = JSON.stringify(DESLOC ? [await L("MONT_appCarregar", tok, montagem.id), await L("MONT_appCarregar", tok, desmontagem.id)] : await L("MONT_appCarregar", tok, "")); // com data deslocada, abre a etapa pelo id (o app lista só 7 dias)
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
    await assert.rejects(L("concluirDesmontagem", { idCronograma: desmontagem.id }), /contagem/);
    // contagem por item (out/2026): o montador lança quanto voltou de cada item — aqui tudo voltou
    const contagem = await L("MONT_contagemItens", tok, desmontagem.id);
    assert.ok((contagem.itens || []).length > 0, "a contagem lista os itens do pedido");
    const qtd = {}; for (const it of contagem.itens) qtd[it.chave] = it.esperado;
    await L("MONT_contagemSalvar", tok, desmontagem.id, qtd);
    await L("concluirDesmontagem", { idCronograma: desmontagem.id });
    await L("MONT_finalizarApontamento", tok, ap2.id);
    const regs = check(await admin.from("operacao_registros").select("tipo").in("etapa_id", [montagem.id, desmontagem.id]));
    assert.equal(regs.length, 8, regs.map(r => r.tipo).join());
    passo("5 - App do Montador: entra com PIN, registra chegada no local, sacolas, posicionamento, lista assinada; desmontagem com lista conferida, contagem por item e concluída (com as travas de ordem)");

    /* ---------- 5b. entrega e coleta confirmadas (Logística > Entregas e Coletas) ---------- */
    for (const etapaEc of ["entrega", "coleta"]) {
      const r = await exp.evaluate(async ({ id, etapa }) => {
        const sb = window.supabaseClient;
        const { data: base, error: e1 } = await sb.rpc("logistica_confirmacao_base", { p_pedido: id, p_etapa: etapa });
        if (e1) return { erro: e1.message };
        const itens = (base.itens || []).map((p) => etapa === "entrega"
          ? { chave: p.chave, entregue: Number(p.previsto), voltou_antes: 0, retirado_lista: 0, motivo_id: null, observacao: "" }
          : { chave: p.chave, coletado: Number(p.previsto), danificado: 0, retirado_lista: 0, motivo_id: null, observacao: "" });
        const { error: e2 } = await sb.rpc("logistica_confirmacao_salvar", { p_pedido: id, p_etapa: etapa, p_token: base.token, p_itens: itens, p_responsavel: "Teste do fluxo", p_observacao: "" });
        return e2 ? { erro: e2.message } : { ok: itens.length };
      }, { id: pedidoId, etapa: etapaEc });
      assert.ok(r.ok, etapaEc + ": " + r.erro);
    }
    passo("5b - entrega e coleta confirmadas, com todas as peças");

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
    // faltou peça: a 1ª tentativa de concluir pede a segunda busca (janela com o item que não bateu); a 2ª conclui
    await cfRet.click("#cfConcluir");
    const segunda = cfRet.locator("dialog.cf-segunda[open]");
    await segunda.waitFor({ timeout: 10000 });
    assert.ok(/lidas/i.test(await segunda.innerText()), "a janela da segunda busca mostra o item que não bateu");
    await foto(cfRet, "09-retorno-segunda-busca");
    await segunda.locator("[type=submit]").click();
    await cfRet.click("#cfConcluir");
    for (let i = 0; i < 30; i++) {
      const confirma = cfRet.locator("dialog.cf-confirmacao[open] [type=submit], .el-alert-confirm .el-alert__actions button").last();
      if (await confirma.isVisible().catch(() => false)) { await confirma.click(); await cfRet.waitForTimeout(600); continue; }
      if (/Não voltaram|não voltaram/.test(await cfRet.innerText("body"))) break;
      await cfRet.waitForTimeout(500);
    }
    await cfRet.waitForFunction(() => /Não voltaram|não voltaram/.test(document.body.innerText), null, { timeout: 30000 });
    await foto(cfRet, "09-retorno-resultado");
    const ocs = check(await admin.from("operacao_ocorrencias").select("*").eq("pedido_id", pedidoId));
    assert.equal(ocs.length, 1); assert.equal(ocs[0].tipo, "falta"); assert.equal(ocs[0].codigo, faltou.codigo);
    passo("7 - triagem de volta às cegas: 6 bipadas, o sistema acusou a Katrina que não voltou e abriu a ocorrência de falta");

    /* ---------- 8. avaria, perda e encerramento ---------- */
    await cfRet.waitForSelector("#cfEncerrar", { timeout: 20000 });
    // desde 01/11 as ocorrências são automáticas: a conferência não tem mais registro manual de avaria
    assert.equal(await cfRet.locator("#cfFormularioOcorrencia").count(), 0, "sem formulário manual de ocorrência");
    // falta: contagem geral do item e perda confirmada pela Gestão do acervo (Estoque > Gestão do acervo > Divergências)
    const falta = check(await admin.from("operacao_ocorrencias").select("*").eq("pedido_id", pedidoId).eq("tipo", "falta").single());
    const rAcervo = await cfRet.evaluate(async ({ emp, itemId, oc }) => {
      const sb = window.supabaseClient;
      const { data: g, error: e0 } = await sb.from("acervo_contagens_gerais").select("id").eq("empresa_id", emp).eq("item_id", itemId).eq("status", "pendente").maybeSingle();
      if (e0 || !g) return { erro: "sem contagem geral pendente: " + (e0?.message || "") };
      const { data: it } = await sb.from("itens").select("estoque_total").eq("id", itemId).single();
      const { error: e1 } = await sb.rpc("acervo_contagem_registrar", { p_empresa: emp, p_contagem: g.id, p_contado: Math.max(Number(it.estoque_total) - 1, 0) });
      if (e1) return { erro: e1.message };
      const { data: m } = await sb.from("logistica_motivos").select("id").eq("empresa_id", emp).eq("etapa", "divergencia_falta").eq("situacao", "continua").eq("ativo", true).limit(1).maybeSingle();
      const esperado = oc.esperado != null ? Number(oc.esperado) : Number(oc.conferido || 0) + Number(oc.quantidade);
      const { data: r, error: e2 } = await sb.rpc("acervo_divergencia_fechar", { p_empresa: emp, p_id: oc.id, p_contagem: esperado - 1, p_motivo: m?.id });
      return e2 ? { erro: e2.message } : { r, contagemId: g.id };
    }, { emp: EMPRESA, itemId: ITEM, oc: falta });
    assert.ok(rAcervo.r, "Gestão do acervo: " + rAcervo.erro);
    contagensTeste.push(rAcervo.contagemId);
    assert.equal(Number(rAcervo.r.perda), 1, "perda de 1 confirmada");
    const estoqueDepois = check(await admin.from("itens").select("estoque_total").eq("id", ITEM).single()).estoque_total;
    assert.ok(rAcervo.r.acervo || Number(estoqueDepois) === Number(estoqueAntes) - 1, "perda: baixa no estoque ou no Retorno do acervo");
    await cfRet.reload(); await cfRet.waitForSelector("#cfEncerrar", { timeout: 30000 });
    await cfRet.click("#cfEncerrar");
    await cfRet.waitForFunction(() => /Operação encerrada/.test(document.getElementById("cfEncerramentoMensagem")?.textContent || ""), null, { timeout: 15000 }).catch(async (e) => { console.log("ENCERRAR:", await cfRet.locator("#cfEncerramentoMensagem").textContent()); throw e; });
    await foto(cfRet, "10-encerrado");
    const pf = check(await admin.from("separacoes_pedidos").select("status_operacional,encerrado_operacional_em").eq("id", pedidoId).single());
    assert.equal(pf.status_operacional, "encerrado"); assert.ok(pf.encerrado_operacional_em);
    passo("8 - falta resolvida pela Gestão do acervo (contagem geral + perda), operação encerrada");

    /* ---------- 9. financeiro: o pedido reservado virou contas a receber; recebimento pela tela ---------- */
    const titulos = check(await admin.from("fin_receber").select("*").eq("pedido_id", pedidoId).neq("status", "cancelado"));
    assert.ok(titulos.length >= 1, "pedido aprovado gera contas a receber");
    const salvas = p1.observacoes.parcelas_financeiras;
    assert.ok(salvas.every(x => ["locacao", "frete", "montagem"].includes(x.componente)), "cada parcela do pedido guarda a divisão");
    const fretes = titulos.filter(t => t.componente === "frete").sort((x, y) => x.parcela - y.parcela);
    assert.equal(fretes.length, 2, "o frete virou 2 contas a receber, como no pedido");
    assert.deepEqual(fretes.map(t => t.parcela + "/" + t.parcelas), ["1/2", "2/2"]);
    for (const x of salvas) { assert.ok(titulos.some(t => t.componente === x.componente && Math.abs(Number(t.valor) - x.valor) < 0.01), "conta a receber igual à parcela " + x.componente + " " + x.valor); }
    const somaTit = titulos.reduce((s, t) => s + Number(t.valor), 0);
    assert.ok(Math.abs(somaTit - Number(p1.valor_total)) < 0.05, "contas a receber somam o valor do pedido: " + somaTit + " x " + p1.valor_total);
    // desde 30/10 não há "Receber" manual: recebimento entra pela conciliação do banco ou pelo caixa físico
    contaId = check(await admin.from("fin_contas").insert({ empresa_id: EMPRESA, nome: "Caixa Fluxo " + suffix, tipo: "caixa" }).select("id").single()).id;
    const fin = await abrir(equipe, "Modulos/Financeiro/financeiro.html?aba=receber");
    const cartao = fin.locator("article.fin-pedido", { hasText: "Pedido " + p1.numero_pedido + " · " + nomeCliente });
    await cartao.waitFor({ timeout: 30000 });
    assert.equal(await cartao.locator("[data-r-baixar]").count(), 0, "sem botão Receber manual");
    const tit = titulos.sort((x, y) => String(x.vencimento).localeCompare(String(y.vencimento)))[0];
    const rCaixa = await fin.evaluate(async ({ emp, conta, t, hoje }) => {
      const { data, error } = await window.supabaseClient.rpc("fin_caixa_lancar", { p_empresa: emp, p_conta: conta, p_data: hoje, p_valor: Number(t.valor), p_descricao: "Recebimento em dinheiro (teste)", p_acao: { tipo: "baixar", titulos: [{ tipo: "receber", id: t.id, valor: Number(t.valor) }], resumo: "Recebimento · teste" } });
      return error ? { erro: error.message } : { ok: data };
    }, { emp: EMPRESA, conta: contaId, t: tit, hoje: dia(0) });
    assert.ok(rCaixa.ok !== undefined, "caixa físico: " + rCaixa.erro);
    let recebido = 0;
    for (let i = 0; i < 30 && !recebido; i++) { await fin.waitForTimeout(500); recebido = check(await admin.from("fin_receber").select("recebido").eq("pedido_id", pedidoId)).reduce((s, t) => s + Number(t.recebido), 0); }
    assert.ok(recebido > 0, "recebimento registrado");
    await foto(fin, "11-financeiro");
    passo("9 - financeiro: o pedido gerou " + titulos.length + " conta(s) a receber somando o valor do pedido, e o recebimento entrou pelo caixa físico");

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

    assert.deepEqual(erros, [], "sem erros de JavaScript nem chamadas ao motor antigo: " + erros.join(" | "));
    console.log("PASS LIVE: fluxo completo do pedido ao encerramento" + (process.env.FLUXO_SITE ? " no site publicado" : ""));
  } finally {
    if (travaPagamento) { const r = await admin.from("empresa_financeiro").update({ pagamento_exige: true }).eq("empresa_id", EMPRESA); console.log(r.error ? "ERRO ao religar a trava de pagamento: " + r.error.message : "trava de pagamento religada"); }
    if (browser) { await browser.close(); }
    if (process.env.FLUXO_MANTER === "1") { console.log("FLUXO_MANTER=1: dados mantidos. pedido", pedidoId, "owner", owner?.email); return; }
    for (const e of estoques) { await admin.from("itens").update({ estoque_total: e.valor }).eq("id", e.id); }
    await limpar({ admin, pedidoId, clienteId, localId, mont, owner, suffix, contaId, inicioTeste });
  }
})().catch(e => { console.error(e); process.exit(1); });

async function limpar({ admin, pedidoId, clienteId, localId, mont, owner, suffix, contaId, inicioTeste }) {
  const tenta = async (nome, fn) => { try { const r = await fn(); if (r && r.error) { console.error("limpeza", nome, r.error.message); } } catch (e) { console.error("limpeza", nome, e.message); } };
  if (pedidoId) {
    const etapas = ((await admin.from("operacao_etapas").select("id").eq("pedido_id", pedidoId)).data || []).map(e => e.id);
    if (etapas.length) {
      for (const t of ["operacao_registros", "operacao_apontamentos", "operacao_trocas", "operacao_etapa_pessoas", "operacao_etapa_caminhoes", "free_vagas"]) { await tenta(t, () => admin.from(t).delete().in("etapa_id", etapas)); }
    }
    // fin_receber apaga junto as baixas e os movimentos delas (cascade)
    // retornos do acervo (e o histórico/OS deles) e a contagem geral que a falta do teste abriu no item
    const rets = ((await admin.from("acervo_retornos").select("id").eq("pedido_id", pedidoId)).data || []).map(r => r.id);
    if (rets.length) { for (const t of ["acervo_historico", "acervo_os"]) { await tenta(t, () => admin.from(t).delete().in("retorno_id", rets)); } }
    if (inicioTeste) { await tenta("contagem_geral", () => admin.from("acervo_contagens_gerais").delete().eq("item_id", ITEM).gte("criado_em", inicioTeste)); }
    for (const t of ["fin_receber", "logistica_confirmacoes", "acervo_retornos", "logistica_evidencias", "logistica_envios", "fin_posicoes_finais", "fin_custos_evento", "fin_resultados_revisados", "producao_itens", "operacao_alertas_motorista", "operacao_ocorrencias", "operacao_patrimonios_lidos", "pedido_cronograma_pendencias", "operacao_pedidos_info"]) { await tenta(t, () => admin.from(t).delete().eq("pedido_id", pedidoId)); }
    // comissão do decorador (BV) não apaga em cascata e segurava o pedido e o cliente
    await tenta("bv", () => admin.from("fin_bv_comissoes").delete().eq("pedido_id", pedidoId));
    await tenta("historico", () => admin.from("comercial_historico").delete().eq("pedido_id", pedidoId));
    await tenta("pedido0", () => admin.from("separacoes_pedidos").delete().eq("id", pedidoId));
    await tenta("leituras", () => admin.from("separacoes_leituras").delete().eq("separacao_pedido_id", pedidoId));
    await tenta("etiquetas", () => admin.from("separacoes_etiquetas").delete().eq("separacao_pedido_id", pedidoId));
    await tenta("contratos", () => admin.from("contratos_pedidos").delete().eq("pedido_id", pedidoId));
    await tenta("itens", () => admin.from("separacoes_itens").delete().eq("separacao_pedido_id", pedidoId));
    await tenta("pedido", () => admin.from("separacoes_pedidos").delete().eq("id", pedidoId));
  }
  if (contaId) { await tenta("fin_extrato", () => admin.from("fin_extrato").delete().eq("conta_id", contaId)); await tenta("fin_extrato_lotes", () => admin.from("fin_extrato_lotes").delete().eq("conta_id", contaId)); await tenta("fin_movimentos", () => admin.from("fin_movimentos").delete().eq("conta_id", contaId)); await tenta("fin_baixas", () => admin.from("fin_baixas").delete().eq("conta_id", contaId)); await tenta("fin_auditoria", () => admin.from("fin_auditoria").delete().eq("entidade_id", contaId)); await tenta("conta", () => admin.from("fin_contas").delete().eq("id", contaId)); }
  await tenta("alteracoes", () => admin.from("operacao_alteracoes").delete().like("usuario_nome", "%" + suffix + "%"));
  if (owner) { await tenta("fin_auditoria", () => admin.from("fin_auditoria").delete().eq("usuario_id", owner.id)); await tenta("qualidade", () => admin.from("qualidade_inspecoes").delete().eq("criado_por", owner.id)); await tenta("alteracoes2", () => admin.from("operacao_alteracoes").delete().eq("usuario_nome", owner.email)); }
  if (clienteId) { await tenta("bv_cliente", () => admin.from("fin_bv_comissoes").delete().eq("cliente_id", clienteId)); }
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
