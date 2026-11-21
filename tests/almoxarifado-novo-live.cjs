// Teste opt-in (RUN_ALMOX_LIVE=1) do Almoxarifado novo (cópia da Tecnoweld, 16/11/2026), no navegador, contra o banco real.
// Empresa e usuário temporários, apagados no fim. SHOTS=<pasta> salva fotos das abas.
require("dotenv").config({ quiet: true });
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { randomUUID } = require("node:crypto");
const fs = require("fs"), path = require("path"), assert = require("node:assert/strict");
const raiz = path.resolve(__dirname, ".."), BASE = "http://localhost:5599/";
const tipos = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".jpg": "image/jpeg", ".webp": "image/webp" };

(async () => {
  if (process.env.RUN_ALMOX_LIVE !== "1") throw Error("Defina RUN_ALMOX_LIVE=1");
  const url = process.env.SUPABASE_URL, shots = process.env.SHOTS;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const client = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const check = (r) => { if (r.error) throw Error(r.error.message); return r.data; };
  const sfx = randomUUID().slice(0, 8), senha = "Temp-" + randomUUID() + "!";
  let empresa, user, browser;
  const erros = [];
  try {
    empresa = check(await admin.from("empresas").insert({ nome: "TESTE ALMOX " + sfx }).select("id").single()).id;
    user = check(await admin.auth.admin.createUser({ email: "almox-" + sfx + "@example.invalid", password: senha, email_confirm: true })).user;
    check(await admin.from("usuarios").insert({ id: user.id, empresa_id: empresa, nome: "Almoxarife Teste" }));
    check(await admin.from("usuarios_empresas").insert({ user_id: user.id, empresa_id: empresa, role: "admin" }));
    const sessao = check(await client.auth.signInWithPassword({ email: user.email, password: senha })).session;

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
    page.on("console", (m) => { if (m.type() === "error") erros.push("console: " + m.text()); });
    page.on("dialog", (d) => d.accept("Teste de motivo"));
    page.on("response", async (r) => { if (r.status() >= 400) erros.push("HTTP " + r.status() + " " + r.url().slice(0, 160) + " " + (await r.text().catch(() => "")).slice(0, 200)); });
    await page.goto(BASE + "Modulos/Almoxarifado/almoxarifado.html", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#almoxContent:not(.hidden)", { timeout: 30000 }).catch(async () => {
      throw Error("não carregou: " + (await page.textContent("#almoxState")) + " | " + erros.join(" | "));
    });
    if (shots) await page.screenshot({ path: path.join(shots, "01-dashboard-vazio.png") });
    console.log("ok 1 - a tela abre (vazia)");

    const api = (fn, ...a) => page.evaluate(([fn, a]) => window.TecnoweldAPI[fn](...a), [fn, a]);
    const rpc = (fn, args) => page.evaluate(([fn, args]) => window.supabaseClient.rpc(fn, args).then((r) => { if (r.error) throw Error(r.error.message); return r.data; }), [fn, args]);

    const mat = await api("saveWarehouseEntry", { nome: "Tecido Linho Bege", categoria: "Tecidos", unidade: "M", valor_unitario: 32.5, estoque_minimo: 5, quantidade: 20 });
    assert.ok(mat.id, "material criado"); assert.equal(Number(mat.quantidade_disponivel), 20);
    const mat2 = await api("saveWarehouseEntry", { nome: "Espuma D33 5cm", categoria: "Espumas", unidade: "UN", valor_unitario: 18, quantidade: 4 });
    console.log("ok 2 - cadastro + entrada:", mat.codigo, mat2.codigo);

    const s = await api("saveWarehouseExit", { material_id: mat.id, quantidade: 3, observacao: "teste", finalidade: "Uso interno" });
    assert.equal(Number(s.quantidade_disponivel), 17);
    console.log("ok 3 - saída baixa o saldo");

    const loc = await api("createWarehouseLocation", "A-01-02", "Prateleira A1", "Tecidos", null);
    await api("setMaterialLocation", mat.id, loc.id);
    await api("saveWarehouseLoan", { retirado_por_id: user.id, items: [{ material_id: mat2.id, quantidade: 2 }] });
    const loans = await api("listWarehouseLoans");
    assert.equal(loans.length, 1);
    await api("returnWarehouseLoanItem", loans[0].itens[0].id, 2);
    console.log("ok 4 - endereço, retirada e devolução");

    const cnt = await api("registerWarehouseCount", [{ material_id: mat2.id, quantidade_contada: 3 }]);
    assert.equal(cnt[0].ajuste_status, "aguardando_justificativa");
    await api("justifyWarehouseCountItem", cnt[0].id, "Uma peça rasgada descartada");
    console.log("ok 5 - contagem com divergência e justificativa");

    const epiMat = await api("saveWarehouseEntry", { nome: "Luva de proteção", categoria: "EPI", unidade: "PAR", quantidade: 10 });
    await rpc("almox_material_epi_set", { p_material_id: epiMat.id, p_is_epi: true, p_ca: "12345", p_ca_validade: null, p_troca_dias: 30 });
    const epi = await rpc("almox_epi_data", {});
    assert.equal(epi.epis.length, 1);
    console.log("ok 6 - EPI ligado ao material");

    const prods = await rpc("almox_produtos", { p_empresa_id: empresa });
    assert.ok(prods.some((p) => p.id === mat.id));
    check(await admin.rpc("almox_estoque_mover", { p_empresa: empresa, p_produto_id: mat.id, p_qtd: 1, p_tipo: "saida", p_valor_unit: 0, p_origem: "PRODUCAO", p_responsavel: user.id, p_fornecedor: null, p_nota: null, p_obs: "Pedido 12 · teste" }));
    const m1 = check(await admin.from("warehouse_materials").select("quantidade_disponivel").eq("id", mat.id).single());
    assert.equal(Number(m1.quantidade_disponivel), 16);
    console.log("ok 7 - Produção/Compras enxergam e movimentam o material");

    // compra automática: mínimo 5, ideal 30, saldo 16 -> sem pedido; saída até 4 -> pedido de 26
    check(await admin.from("almoxarifado_configuracoes").insert({ empresa_id: empresa, chave: "compra_automatica", valor: true }));
    await rpc("almox_produto_limites", { p_empresa: empresa, p_produto_id: mat.id, p_minimo: 5, p_ideal: 30 });
    await api("saveWarehouseExit", { material_id: mat.id, quantidade: 12, finalidade: "Uso interno" });
    const sol = check(await admin.from("almox_solicitacoes_compra").select("quantidade,status").eq("empresa_id", empresa));
    assert.equal(sol.length, 1); assert.equal(Number(sol[0].quantidade), 26);
    console.log("ok 8 - compra automática abre a solicitação (ideal − saldo)");

    // 8b. Recebimento: pedido de compra (Compras) com material do almoxarifado novo -> receber sem XML -> saldo entra
    const ped = check(await admin.from("compras_registros").insert({ empresa_id: empresa, tipo: "pedido", numero: 1, status: "aguardando_recebimento", dados: {
      fornecedor_nome: "Fornecedor Teste", fornecedor: { nome: "Fornecedor Teste" }, valor_total: 300,
      items: [{ id: "it-1", material_id: mat2.id, material_nome: "Espuma D33 5cm", nome: "Espuma D33 5cm", unidade: "UN", quantidade: 10, quantidade_recebida: 0, valor_unitario: 30, valor_total: 300 }] } }).select("id").single());
    const pend = await rpc("almox_receb_pedidos", { p_empresa: empresa });
    assert.ok((pend || []).some((x) => x.id === ped.id), "pedido aparece em Pedidos a receber");
    const rec = await rpc("almox_receb_criar", { p_empresa: empresa, p_dados: { pedido_id: ped.id, origem: "manual", nota: { numero: "123" } } });
    const recDados = await rpc("almox_receb_obter", { p_empresa: empresa, p_id: rec });
    const itensRec = (recDados.itens || []).map((i) => ({ id: i.id, quantidade_recebida: 10, quantidade_avariada: 0 }));
    await rpc("almox_receb_salvar", { p_empresa: empresa, p_id: rec, p_dados: { etapa: 5, itens: itensRec } });
    const antesRec = Number(check(await admin.from("warehouse_materials").select("quantidade_disponivel").eq("id", mat2.id).single()).quantidade_disponivel);
    await rpc("almox_receb_concluir", { p_empresa: empresa, p_id: rec, p_financeiro: null });
    const depoisRec = Number(check(await admin.from("warehouse_materials").select("quantidade_disponivel").eq("id", mat2.id).single()).quantidade_disponivel);
    assert.equal(depoisRec - antesRec, 10, "recebimento deu entrada de 10");
    const pedDepois = check(await admin.from("compras_registros").select("status").eq("id", ped.id).single());
    console.log("ok 8b - recebimento de compra dá entrada no almoxarifado novo (pedido agora:", pedDepois.status + ")");

    // 9. Cadastro de insumos pela tela (tipo Tecido -> código TEC-001-01) e Entrada pela tela
    await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForSelector("#almoxContent:not(.hidden)");
    await page.click("#topMaterialRegistrationBtn"); await page.waitForTimeout(800);
    const tecido = await page.evaluate(() => [...document.querySelectorAll("#refMaterialTipo option")].find((o) => /Tecido/.test(o.textContent))?.value);
    assert.ok(tecido, "tipo Tecido semeado");
    await page.selectOption("#refMaterialTipo", tecido);
    await page.fill("#refMaterialEspecificacao", "veludo azul");
    await page.click("#refMaterialCategoryTrigger"); await page.click('[data-category="Matéria-prima"]');
    await page.fill("#refMaterialStock", "15"); await page.fill("#refMaterialMinimum", "3"); await page.fill("#refMaterialIdeal", "20"); await page.fill("#refMaterialCost", "41.9");
    await page.waitForTimeout(500);
    if (shots) await page.screenshot({ path: path.join(shots, "cadastro-preenchido.png") });
    await page.click("#saveReferenceMaterialBtn"); await page.waitForTimeout(2500);
    const novo = check(await admin.from("warehouse_materials").select("*").eq("empresa_id", empresa).ilike("nome", "%VELUDO AZUL%").maybeSingle());
    assert.ok(novo, "cadastro pela tela gravou: " + erros.join(" | "));
    assert.equal(novo.codigo, "TEC-001-01"); assert.equal(Number(novo.quantidade_disponivel), 15); assert.equal(Number(novo.estoque_ideal), 20);
    console.log("ok 9 - cadastro pela tela:", novo.codigo, novo.nome);
    await page.click("#entryBtn"); await page.waitForTimeout(700);
    await page.fill("#entryMaterial", (await page.evaluate((id) => { const m = window.TecnoweldAPI && document.querySelector("#entryMaterialList option"); return [...document.querySelectorAll("#entryMaterialList option")].map((o) => o.value).find((v) => v.includes("VELUDO")); })));
    await page.fill("#entryQty", "5"); await page.selectOption("#entryReason", "Compra avulsa");
    await page.click("#saveEntryBtn"); await page.waitForTimeout(2500);
    const depois = check(await admin.from("warehouse_materials").select("quantidade_disponivel").eq("id", novo.id).single());
    assert.equal(Number(depois.quantidade_disponivel), 20, "entrada pela tela: " + erros.join(" | "));
    console.log("ok 10 - entrada pela tela soma no saldo");

    await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForSelector("#almoxContent:not(.hidden)");
    for (const tab of ["stock", "movements", "count", "toseparate", "locations", "epi", "supplier-links", "purchases", "receiving"]) {
      await page.click(`.almox-tabs > button[data-tab="${tab}"]`); await page.waitForTimeout(1500);
      if (shots) await page.screenshot({ path: path.join(shots, `tab-${tab}.png`) });
    }
    for (const [id, nome] of [["entryBtn", "entrada"], ["exitBtn", "saida"], ["withdrawalBtn", "retirada"], ["topMaterialRegistrationBtn", "cadastro"]]) {
      await page.click(".almox-tabs > button[data-tab=stock]"); await page.waitForTimeout(500);
      await page.click("#" + id).catch((e) => erros.push(id + ": " + e.message)); await page.waitForTimeout(1200);
      if (shots) await page.screenshot({ path: path.join(shots, `acao-${nome}.png`) });
      await page.keyboard.press("Escape"); await page.evaluate(() => window.closeAllModals?.());
    }
    console.log("ok 11 - abas e ações abertas");
    console.log(erros.length ? "ERROS:\n" + [...new Set(erros)].join("\n") : "sem erros de página");
  } finally {
    if (browser) await browser.close();
    if (empresa) {
      for (const t of ["almox_recebimento_itens", "almox_recebimentos", "compras_registros", "rh_epi_entregas", "rh_epis", "warehouse_count_items", "warehouse_count_cycles", "warehouse_loan_items", "warehouse_loans", "warehouse_movements", "warehouse_operations", "employee_warehouse_pin_attempts", "supplier_product_links", "warehouse_materials", "warehouse_locations", "warehouse_material_categories", "almox_solicitacoes_compra", "almoxarifado_configuracoes"])
        await admin.from(t).delete().eq("empresa_id", empresa);
      await admin.from("usuarios_empresas").delete().eq("empresa_id", empresa);
      if (user) { await admin.from("usuarios").delete().eq("id", user.id); await admin.auth.admin.deleteUser(user.id); }
      await admin.from("empresas").delete().eq("id", empresa);
    }
  }
})().catch((e) => { console.error("FALHOU:", e.message); process.exit(1); });
