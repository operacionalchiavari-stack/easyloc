// Teste opt-in (RUN_ALMOX_LIVE=1) do Compras ligado ao Almoxarifado novo (16/11/2026), no navegador, contra o banco real.
// Confere: a tela abre sem erro; "Vincular item" lista os materiais do almoxarifado novo e vincula; a divergência decidida
// como "abater" num pedido com conta a pagar vira crédito na aba Créditos; abater o crédito numa conta a pagar baixa o valor.
require("dotenv").config({ quiet: true });
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { randomUUID } = require("node:crypto");
const fs = require("fs"), path = require("path"), assert = require("node:assert/strict");
const raiz = path.resolve(__dirname, ".."), BASE = "http://localhost:5599/";
const tipos = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };

(async () => {
  if (process.env.RUN_ALMOX_LIVE !== "1") throw Error("Defina RUN_ALMOX_LIVE=1");
  const url = process.env.SUPABASE_URL, shots = process.env.SHOTS;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const client = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const check = (r) => { if (r.error) throw Error(r.error.message); return r.data; };
  const sfx = randomUUID().slice(0, 8), senha = "Temp-" + randomUUID() + "!";
  let empresa, user, browser; const erros = [];
  try {
    empresa = check(await admin.from("empresas").insert({ nome: "TESTE COMPRAS " + sfx }).select("id").single()).id;
    user = check(await admin.auth.admin.createUser({ email: "compras-" + sfx + "@example.invalid", password: senha, email_confirm: true })).user;
    check(await admin.from("usuarios").insert({ id: user.id, empresa_id: empresa, nome: "Comprador Teste" }));
    check(await admin.from("usuarios_empresas").insert({ user_id: user.id, empresa_id: empresa, role: "admin" }));
    const sessao = check(await client.auth.signInWithPassword({ email: user.email, password: senha })).session;
    const mat = check(await admin.from("warehouse_materials").insert({ empresa_id: empresa, codigo: "", nome: "Cola de contato 750ml", unidade: "UN", categoria: "Consumível" }).select("*").single());
    const forn = check(await admin.from("fornecedores").insert({ empresa_id: empresa, nome_razao_social: "Fornecedor Crédito " + sfx, nome_fantasia: "Forn Crédito", documento: "", tipo: "materiais", foto_url: "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="#1f6feb"/><text x="32" y="42" font-size="28" text-anchor="middle" fill="#fff" font-family="Arial">FC</text></svg>').toString("base64") }).select("id").single());
    // necessidade sem material (solicitação interna) para vincular
    const nec = check(await admin.from("compras_registros").insert({ empresa_id: empresa, tipo: "necessidade", numero: 1, status: "aguardando_vinculo",
      dados: { origem: "solicitacao", material_nome: "Cola de contato", quantidade: 4, quantidade_faltante: 4, unidade: "UN" } }).select("id").single());
    // necessidade operacional (pedido, cliente, local e item a personalizar)
    const svg = (t, c) => "data:image/svg+xml;base64," + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="10" fill="${c}"/><text x="32" y="40" font-size="20" text-anchor="middle" fill="#fff" font-family="Arial">${t}</text></svg>`).toString("base64");
    check(await admin.from("compras_registros").insert({ empresa_id: empresa, tipo: "necessidade", numero: 2, status: "pendente", dados: { origem: "op_faltando", material_id: mat.id,
      material_nome: "Cola de contato 750ml", unidade: "UN", quantidade: 5, quantidade_faltante: 5, order_number: "3021", etapa_nome: "Forração", pcp_status: "published",
      cliente_nome: "Casa Celebra", cliente_foto: svg("CC", "#9b5de5"), local_nome: "Casa das Flores", item_nome: "Poltrona Orka", item_foto: svg("PO", "#2a9d8f"), personalizacao_nome: "Forração em linho" } }));
    // pedido com conta a pagar e divergência
    const ped = check(await admin.from("compras_registros").insert({ empresa_id: empresa, tipo: "pedido", numero: 7, status: "recebido", dados: {
      fornecedor_id: forn.id, fornecedor_nome: "Forn Crédito", fornecedor: { id: forn.id, nome: "Forn Crédito" }, valor_total: 200,
      items: [{ id: "i1", material_id: mat.id, nome: "Cola de contato 750ml", unidade: "UN", material_nome: "Cola de contato 750ml", quantidade: 10, quantidade_recebida: 10, valor_unitario: 20, valor_total: 200 }] } }).select("id").single());
    const tit = check(await admin.from("fin_pagar").insert({ empresa_id: empresa, origem: "compra", origem_id: ped.id, fornecedor_id: forn.id, fornecedor_nome: "Forn Crédito",
      descricao: "PC-000007", vencimento: new Date(Date.now() + 864e6).toISOString().slice(0, 10), valor: 200, status: "pendente" }).select("id").single());
    const rnc = check(await admin.from("compras_registros").insert({ empresa_id: empresa, tipo: "rnc", numero: 3, status: "aberta",
      dados: { order_id: ped.id, order_item_id: "i1", material_id: mat.id, quantidade_bloqueada: 2, recebimento_concluido: true, numero_nfe: "555" } }).select("id").single());

    browser = await chromium.launch({ channel: "msedge" });
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
    await ctx.route("**/*", (rota) => {
      const u = new URL(rota.request().url());
      if (u.origin + "/" !== BASE) return rota.continue();
      const arq = path.join(raiz, decodeURIComponent(u.pathname));
      if (!fs.existsSync(arq) || fs.statSync(arq).isDirectory()) return rota.fulfill({ status: 404, body: "" });
      return rota.fulfill({ contentType: tipos[path.extname(arq)] || "application/octet-stream", body: fs.readFileSync(arq) });
    });
    await ctx.addInitScript(([s, e]) => { localStorage.setItem("easyloc-auth", s); sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", e); }, [JSON.stringify(sessao), empresa]);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => erros.push(e.message));
    page.on("response", async (r) => { if (r.status() >= 400 && !r.url().includes("rpc/compras_operar")) erros.push("HTTP " + r.status() + " " + r.url().slice(0, 140) + " " + (await r.text().catch(() => "")).slice(0, 160)); });
    await page.goto(BASE + "Modulos/Estoque/Compras/compras.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.AcervoComprasAPI && document.querySelector("#needsAvulsaBody tr"), null, { timeout: 30000 });
    await page.click('[data-pv-tab="needs-op"]'); await page.waitForSelector("#needsOpBody tr", { timeout: 15000 });
    const op = await page.evaluate(() => ({ th: [...document.querySelectorAll("#needsOpTable thead th")].map((t) => t.textContent.trim()), td: document.querySelector("#needsOpBody tr").innerText }));
    assert.ok(!op.th.join("|").includes("OS") && !op.th.join("|").includes("Orçamentos"), "cabeçalho sem OS/orçamentos " + op.th);
    assert.ok(op.td.includes("3021") && !/OP 3021/.test(op.td) && op.td.includes("Casa Celebra") && op.td.includes("Casa das Flores") && op.td.includes("Poltrona Orka"), op.td);
    if (shots) await page.screenshot({ path: path.join(shots, "compras-needs-op-dados.png") });
    console.log("ok 1 - Compras abre e lista a solicitação");

    // solicitação criada pela assistente (Carla): cada resposta numa coluna
    const criada = await page.evaluate(async (e) => { const { data, error } = await window.supabaseClient.rpc("compras_galpao", { p_empresa: e, p_acao: "criar", p_dados: {
      descricao_item: "Botina de segurança nº 42", quantidade: 1, unidade: "par", data_necessidade: "", produto_url: "",
      observacao: "Para que: trabalhar no carregamento", motivo: "Usar no carregamento dos caminhões", justificativa: "A botina atual rasgou na sola e entra água; sem ela não posso carregar.",
      alternativas: "Almoxarifado não tem nº 42", pedido: "Uso geral / estoque", observacao_extra: "Aceita similar" } }); if (error) throw Error(error.message); return data; }, empresa);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.AcervoComprasAPI && document.querySelector("#needsAvulsaBody tr"), null, { timeout: 30000 });
    await page.click('[data-pv-tab="needs-avulsa"]');
    const linhaIA = await page.evaluate((id) => { const tr = document.querySelector(`#needsAvulsaBody tr[data-need-id="${id}"]`); return { th: [...document.querySelectorAll("#needsAvulsaTable thead th")].map((t) => t.textContent.trim()), td: [...tr.cells].map((c) => c.innerText.trim()) }; }, criada.id);
    const col = (nome) => linhaIA.td[linhaIA.th.indexOf(nome)] || "";
    assert.match(col("Para que"), /carregamento dos caminhões/); assert.match(col("Por que precisa"), /rasgou na sola/); assert.match(col("Por que precisa"), /Alternativas: Almoxarifado/);
    assert.match(col("Pedido / evento"), /Uso geral/); assert.match(col("Item"), /Aceita similar/); assert.equal(linhaIA.th[0], "Solicitante");
    if (shots) await page.screenshot({ path: path.join(shots, "compras-solicitacoes-ia.png") });
    assert.equal(criada.status, "pendente", "solicitação nasce pronta para cotar");
    await page.click(`#needsAvulsaBody tr[data-need-id="${criada.id}"] td:nth-child(3)`);
    assert.equal(await page.locator(`#needsAvulsaBody tr[data-need-id="${criada.id}"].is-selected`).count(), 1, "sem vínculo pode ser selecionada");
    assert.match(await page.locator(`#needsAvulsaBody tr[data-need-id="${criada.id}"]`).innerText(), /Sem vínculo com o Almoxarifado/);
    await page.click(`#needsAvulsaBody tr[data-need-id="${criada.id}"] td:nth-child(3)`);
    const cotSV = await page.evaluate(([n, f]) => window.AcervoComprasAPI.createQuotationRequest({ items: [{ material_id: null, nome: "Botina de segurança nº 42", unidade: "par", quantidade_cotada: 1,
      need_allocations: [{ purchase_request_id: n, quantidade_alocada: 1 }] }], supplier_ids: [f], prazo_desejado: null, observacoes: null }).then(() => "ok").catch((e) => e.message), [criada.id, forn.id]);
    assert.equal(cotSV, "ok", "solicitação sem vínculo vai para cotação: " + cotSV);
    console.log("ok 1c - solicitação sem vínculo com o Almoxarifado pode ser cotada");
    console.log("ok 1b - Solicitações: respostas da assistente nas colunas Para que / Por que precisa / Pedido / Item");
    const lista = await page.evaluate(() => window.AcervoComprasAPI.listWarehouseMaterials());
    assert.ok(lista.some((m) => m.id === mat.id), "materiais do almoxarifado novo");
    await page.evaluate(([id, m]) => window.AcervoComprasAPI.linkInternalPurchaseMaterial(id, m), [nec.id, mat.id]);
    const n2 = check(await admin.from("compras_registros").select("status,dados").eq("id", nec.id).single());
    assert.equal(n2.status, "pendente"); assert.equal(n2.dados.material_id, mat.id);
    console.log("ok 2 - vincular a solicitação a um material do almoxarifado novo");

    await page.evaluate((id) => window.AcervoComprasAPI.resolveReceivingRnc(id, "abater", "Combinado desconto", 30), rnc.id);
    const cred = check(await admin.from("compras_creditos").select("*").eq("empresa_id", empresa));
    assert.equal(cred.length, 1, "crédito criado: " + erros.join(" | ")); assert.equal(Number(cred[0].valor), 30);
    console.log("ok 3 - divergência decidida 'abater' com conta a pagar vira crédito de R$ 30");

    await page.click('[data-pv-tab="creditos"]'); await page.waitForSelector("[data-credito-usar]", { timeout: 15000 });
    if (shots) await page.screenshot({ path: path.join(shots, "compras-creditos.png") });
    await page.click("[data-credito-usar]"); await page.waitForSelector("[data-cc-ok]");
    await page.click("[data-cc-ok]"); await page.waitForTimeout(2000);
    const t2 = check(await admin.from("fin_pagar").select("compensado,aberto,observacoes").eq("id", tit.id).single());
    assert.equal(Number(t2.compensado), 30); assert.equal(Number(t2.aberto), 170); assert.match(t2.observacoes || "", /Crédito do fornecedor/);
    const c2 = check(await admin.from("compras_creditos").select("status,saldo").eq("id", cred[0].id).single());
    assert.equal(c2.status, "usado");
    console.log("ok 4 - abater o crédito na conta a pagar: aberto 200 -> 170, crédito usado");
    for (const tab of ["needs-op", "needs-avulsa", "needs-servicos", "quotations", "orders", "rnc", "creditos"]) {
      await page.click(`[data-pv-tab="${tab}"]`); await page.waitForTimeout(800);
      if (shots) await page.screenshot({ path: path.join(shots, `compras-${tab}.png`) });
    }
    // telas inteiras: pedido de compra e divergência (iguais à Tecnoweld)
    const rnc2 = check(await admin.from("compras_registros").insert({ empresa_id: empresa, tipo: "rnc", numero: 4, status: "aberta",
      dados: { order_id: ped.id, order_item_id: "i1", material_id: mat.id, quantidade_bloqueada: 1, recebimento_concluido: true, numero_nfe: "556", descricao: "Lata amassada" } }).select("id").single());
    const ped2 = check(await admin.from("compras_registros").insert({ empresa_id: empresa, tipo: "pedido", numero: 8, status: "emitido", dados: {
      fornecedor_id: forn.id, fornecedor_nome: "Forn Crédito", fornecedor: { id: forn.id, nome: "Forn Crédito" }, valor_total: 90,
      items: [{ id: "j1", material_id: mat.id, nome: "Cola de contato 750ml", unidade: "UN", quantidade: 3, quantidade_recebida: 0, valor_unitario: 30, valor_total: 90 }] } }).select("id").single());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.AcervoComprasAPI && document.querySelector("#needsAvulsaBody tr"), null, { timeout: 30000 });
    await page.click('[data-pv-tab="orders"]'); await page.waitForSelector(`#ordersBody tr[data-order-id="${ped2.id}"]`, { timeout: 15000 });
    await page.click(`#ordersBody tr[data-order-id="${ped2.id}"] td:nth-child(2)`);
    await page.waitForSelector("#orderDetailDialog[open] .pv-od-steps", { timeout: 15000 });
    const geo = await page.evaluate(() => { const r = document.getElementById("orderDetailDialog").getBoundingClientRect(); return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, pay: !!document.getElementById("orderPaySection"), voltar: !!document.querySelector("#orderDetailDialog .pv-back-btn") }; });
    assert.ok(geo.w >= geo.vw - 2 && geo.h >= geo.vh - 2, "pedido em tela inteira " + JSON.stringify(geo)); assert.ok(geo.pay && geo.voltar);
    if (shots) await page.screenshot({ path: path.join(shots, "compras-pedido-tela.png") });
    assert.equal(await page.locator("#orderDetailDialog [data-payment-send]:visible").count(), 0, "sem o botão Enviar ao Contas a Pagar");
    assert.equal(await page.locator("#orderDetailDialog :text('Recebimento no Almoxarifado')").count(), 0, "sem o quadro Recebimento");
    await page.click("#orderDetailSaveBtn"); await page.waitForTimeout(2500);
    const p2 = check(await admin.from("compras_registros").select("dados").eq("id", ped2.id).single());
    assert.ok((p2.dados.parcelas || []).length === 1, "Salvar gravou as parcelas: " + JSON.stringify(p2.dados.parcelas) + " " + erros.join(" | "));
    await page.click("#orderDetailDialog .pv-back-btn");
    assert.ok(await page.locator("#orderDetailDialog .cs-foto-fornecedor.tem-foto").count() >= 1, "foto do fornecedor no pedido");
    console.log("ok 5 - pedido de compra abre em tela inteira com Voltar e Pagamento e parcelas");
    await page.click('[data-pv-tab="rnc"]'); await page.waitForSelector(`tr[data-rnc-id="${rnc2.id}"]`, { timeout: 15000 });
    await page.click(`tr[data-rnc-id="${rnc2.id}"]`); await page.waitForSelector("dialog.pv-dialog-full[open] .pv-back-btn", { timeout: 15000 });
    await page.waitForTimeout(800);
    if (shots) await page.screenshot({ path: path.join(shots, "compras-divergencia-tela.png") });
    const g2 = await page.evaluate(() => { const r = document.querySelector("dialog.pv-dialog-full[open]").getBoundingClientRect(); return r.width >= innerWidth - 2; });
    assert.ok(g2, "divergência em tela inteira");
    console.log("ok 6 - divergência abre em tela inteira com Voltar");
    // cotações: clicar na linha abre as propostas em tela inteira; sem os botões Abrir e Encerrar
    await page.click("dialog.pv-dialog-full[open] .pv-back-btn").catch(() => {});
    await page.evaluate(([m, f, n]) => window.AcervoComprasAPI.createQuotationRequest({ items: [{ material_id: m, nome: "Cola de contato 750ml", unidade: "UN", quantidade_cotada: 4, need_allocations: [{ purchase_request_id: n, quantidade_alocada: 4 }] }], supplier_ids: [f], prazo_desejado: null, observacoes: null }), [mat.id, forn.id, nec.id]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.AcervoComprasAPI && document.querySelector("#needsAvulsaBody"), null, { timeout: 30000 });
    await page.click('[data-pv-tab="quotations"]'); await page.waitForSelector("#quotationsBody tr[data-quotation-id]", { timeout: 15000 });
    assert.equal(await page.locator("#quotationsBody :text-is('Abrir'), #quotationsBody :text-is('Encerrar')").count(), 0, "sem Abrir/Encerrar");
    await page.click("#quotationsBody tr[data-quotation-id] td:first-child");
    await page.waitForSelector("#proposalsDialog[open] .pv-back-btn", { timeout: 15000 }); await page.waitForTimeout(800);
    assert.ok(await page.evaluate(() => document.getElementById("proposalsDialog").getBoundingClientRect().width >= innerWidth - 2), "propostas em tela inteira");
    if (shots) await page.screenshot({ path: path.join(shots, "compras-cotacao-tela.png") });
    console.log("ok 7 - cotação: clicar na linha abre as propostas em tela inteira");
    // Serviços: manutenção da empresa vira necessidade de serviço e o clique seleciona para orçar
    await page.click("#proposalsDialog .pv-back-btn").catch(() => {});
    const man = check(await admin.from("manutencao_predial_solicitacoes").insert({ empresa_id: empresa, numero: 1, token: randomUUID(), titulo: "Trocar lâmpadas do galpão",
      local: "Galpão 2", descricao: "Três lâmpadas queimadas no corredor da costura; o local fica escuro à tarde.", evidencias: ["https://example.com/storage/v1/object/public/solicitacoes-evidencias/x/foto.jpg"], categoria: "eletrica", prioridade: "alta", criado_por: user.id, solicitante_nome: "Comprador Teste" }).select("id").single());
    const nm = check(await admin.from("compras_registros").select("id,status,dados").eq("empresa_id", empresa).eq("tipo", "necessidade").eq("dados->>predial_id", man.id));
    assert.equal(nm.length, 1); assert.equal(nm[0].status, "pendente");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.AcervoComprasAPI && document.querySelector("#needsAvulsaBody"), null, { timeout: 30000 });
    await page.click('[data-pv-tab="needs-servicos"]'); await page.waitForSelector(`#needsServicosBody tr[data-need-id="${nm[0].id}"]`, { timeout: 15000 });
    const topoAntes = await page.evaluate(() => document.querySelector("#needsServicosBody").getBoundingClientRect().top);
    await page.click(`#needsServicosBody tr[data-need-id="${nm[0].id}"] td:nth-child(2)`);
    await page.waitForTimeout(300);
    const topoDepois = await page.evaluate(() => document.querySelector("#needsServicosBody").getBoundingClientRect().top);
    assert.equal(Math.round(topoAntes), Math.round(topoDepois), "a tabela não se mexe ao selecionar");
    const barra = await page.evaluate(() => getComputedStyle(document.getElementById("quoteSelectionBar")).position);
    assert.equal(barra, "fixed", "barra de cotação flutuando");
    assert.ok(await page.locator(`#needsServicosBody tr[data-need-id="${nm[0].id}"].is-selected`).count() === 1, "selecionou");
    assert.ok(await page.locator("#quoteSelectionBar:not(.hidden)").count() === 1, "barra de cotação");
    const linhaS = await page.evaluate((id) => [...document.querySelector(`#needsServicosBody tr[data-need-id="${id}"]`).cells].map((c) => c.innerText.trim()).join(" | "), nm[0].id);
    assert.match(linhaS, /Elétrica/); assert.match(linhaS, /corredor da costura/); assert.ok((await page.locator(`#needsServicosBody tr[data-need-id="${nm[0].id}"] .cs-fotos a`).count()) === 1, "foto do serviço");
    // passar o mouse no problema: cartão branco com o texto inteiro; clicar na foto: prévia na própria tela
    await page.hover(`#needsServicosBody tr[data-need-id="${nm[0].id}"] [data-cs-dica]:not(.subtext)`);
    await page.waitForSelector(".cs-dica:not([hidden])", { timeout: 5000 });
    const dica = await page.evaluate(() => { const c = document.querySelector(".cs-dica"); return { txt: c.innerText, bg: getComputedStyle(c).backgroundColor }; });
    assert.ok(/corredor da costura|Trocar lâmpadas|Galpão 2/.test(dica.txt) && dica.bg === "rgb(255, 255, 255)", "cartão branco: " + JSON.stringify(dica));
    if (shots) await page.screenshot({ path: path.join(shots, "compras-servicos-dica.png") });
    await page.mouse.move(5, 5);
    const paginas = ctx.pages().length;
    await page.click(`#needsServicosBody tr[data-need-id="${nm[0].id}"] [data-cs-foto-ver]`);
    await page.waitForSelector("dialog.cs-visor[open]", { timeout: 5000 });
    assert.equal(ctx.pages().length, paginas, "não abriu outra aba");
    assert.equal(await page.locator(`#needsServicosBody tr[data-need-id="${nm[0].id}"].is-selected`).count(), 1, "clicar na foto não muda a seleção");
    await page.keyboard.press("Escape");
    console.log("ok 8c - Serviços: cartão branco no texto e prévia da foto na tela");
    if (shots) await page.screenshot({ path: path.join(shots, "compras-servicos.png") });
    // regra: serviço é sempre cotado separado de material
    const opNec = check(await admin.from("compras_registros").select("id").eq("empresa_id", empresa).eq("tipo", "necessidade").eq("dados->>origem", "op_faltando").single());
    await page.click('[data-pv-tab="needs-op"]'); await page.click(`#needsOpBody tr[data-need-id="${opNec.id}"] td:nth-child(2)`);
    assert.equal(await page.locator(`#needsOpBody tr[data-need-id="${opNec.id}"].is-selected`).count(), 0, "não deixa selecionar material junto com serviço");
    await page.click('[data-pv-tab="needs-servicos"]');
    const mist2 = await page.evaluate(([n, o, m, f]) => window.AcervoComprasAPI.createQuotationRequest({ items: [
      { material_id: null, nome: "Trocar lâmpadas do galpão", unidade: "SV", quantidade_cotada: 1, need_allocations: [{ purchase_request_id: n, quantidade_alocada: 1 }] },
      { material_id: m, nome: "Cola de contato 750ml", unidade: "UN", quantidade_cotada: 5, need_allocations: [{ purchase_request_id: o, quantidade_alocada: 5 }] }],
      supplier_ids: [f], prazo_desejado: null, observacoes: null }).then(() => "ok").catch((e) => e.message), [nm[0].id, opNec.id, mat.id, forn.id]);
    const mist = await page.evaluate(([n, o, f]) => window.AcervoComprasAPI.createQuotationRequest({ items: [
      { material_id: null, nome: "Trocar lâmpadas do galpão", unidade: "SV", quantidade_cotada: 1, need_allocations: [{ purchase_request_id: n, quantidade_alocada: 1 }] }],
      supplier_ids: [f], prazo_desejado: null, observacoes: null }).then(() => "ok").catch((e) => e.message), [nm[0].id, opNec.id, forn.id]);
    assert.match(mist2, /separados/, "banco recusa misturar serviço e material: " + mist2);
    assert.equal(mist, "ok", "serviço sozinho vai para cotação: " + mist);
    console.log("ok 8b - serviço não se mistura com material (tela e banco)");
    if (false) await page.evaluate(([n, f]) => window.AcervoComprasAPI.createQuotationRequest({ items: [{ material_id: null, nome: "Trocar lâmpadas do galpão", unidade: "SV", quantidade_cotada: 1, need_allocations: [{ purchase_request_id: n, quantidade_alocada: 1 }] }], supplier_ids: [f], prazo_desejado: null, observacoes: null }), [nm[0].id, forn.id]);
    assert.equal(check(await admin.from("compras_registros").select("status").eq("id", nm[0].id).single()).status, "em_cotacao", "serviço foi para cotação");
    await admin.from("manutencao_predial_solicitacoes").update({ status: "cancelada" }).eq("id", man.id);
    assert.equal(check(await admin.from("compras_registros").select("status").eq("id", nm[0].id).single()).status, "em_cotacao", "já cotada não é cancelada sozinha");
    await admin.from("manutencao_predial_solicitacoes").delete().eq("id", man.id);
    console.log("ok 8 - Serviços: manutenção vira necessidade, clique seleciona para orçar, vai para cotação");
    console.log(erros.length ? "ERROS:\n" + [...new Set(erros)].join("\n") : "sem erros de página");
  } finally {
    if (browser) await browser.close();
    if (empresa) {
      await admin.from("manutencao_predial_historico").delete().eq("empresa_id", empresa); await admin.from("manutencao_predial_solicitacoes").delete().eq("empresa_id", empresa);
      for (const t of ["compras_creditos", "fin_auditoria", "fin_pagar", "compras_auditoria", "compras_registros", "warehouse_movements", "warehouse_materials", "warehouse_material_types", "warehouse_material_categories", "fornecedores"])
        await admin.from(t).delete().eq("empresa_id", empresa);
      await admin.from("usuarios_empresas").delete().eq("empresa_id", empresa);
      if (user) { await admin.from("usuarios").delete().eq("id", user.id); await admin.auth.admin.deleteUser(user.id); }
      await admin.from("empresas").delete().eq("id", empresa);
    }
  }
})().catch((e) => { console.error("FALHOU:", e.message); process.exit(1); });
