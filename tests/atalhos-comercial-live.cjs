// Atalhos de teclado do Comercial (out/2026), opt-in, contra o Supabase de verdade:
// F2 vai para o Catálogo, F4 vai para o Catálogo com o cursor na pesquisa; no catálogo o cursor fica sempre na pesquisa — na tela do pedido (inclusive com o
// cursor dentro de um campo e dentro do catálogo) e na Central de Pedidos (botão "Catálogo" também).
// Usuário temporário, apagado no fim. Uso: RUN_ATALHOS_LIVE=1 node tests/atalhos-comercial-live.cjs
require("dotenv").config({ quiet: true });
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { randomUUID } = require("node:crypto");
const fs = require("fs"), path = require("path"), assert = require("node:assert/strict");
const raiz = path.resolve(__dirname, ".."), BASE = "http://localhost:5599/"  // localhost: contexto seguro (crypto.randomUUID), igual ao site em https;
const EMPRESA = "bb1260f0-99cd-4d17-ab9b-23c299b4c50b";
const tipos = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".jpg": "image/jpeg", ".webp": "image/webp" };

(async () => {
  if (process.env.RUN_ATALHOS_LIVE !== "1") { throw Error("Defina RUN_ATALHOS_LIVE=1"); }
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const senha = "Temp-" + randomUUID();
  let u, browser;
  const erros = [];
  try {
    u = (await admin.auth.admin.createUser({ email: "atalhos-" + randomUUID().slice(0, 6) + "@example.invalid", password: senha, email_confirm: true })).data.user;
    await admin.from("usuarios_empresas").insert({ user_id: u.id, empresa_id: EMPRESA, role: "admin" });
    const sessao = (await client.auth.signInWithPassword({ email: u.email, password: senha })).data.session;
    browser = await chromium.launch({ channel: "msedge" });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route("**/*", rota => {
      const x = new URL(rota.request().url());
      if (x.origin + "/" !== BASE) { return rota.continue(); }
      const arq = path.join(raiz, decodeURIComponent(x.pathname));
      if (!fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { return rota.fulfill({ status: 404, body: "" }); }
      return rota.fulfill({ contentType: tipos[path.extname(arq)] || "application/octet-stream", body: fs.readFileSync(arq) });
    });
    await ctx.addInitScript(s => { localStorage.setItem("easyloc-auth", s); sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "bb1260f0-99cd-4d17-ab9b-23c299b4c50b"); }, JSON.stringify(sessao));
    const abrir = async (rota) => {
      const p = await ctx.newPage();
      p.on("pageerror", e => erros.push(rota + ": " + e.message));
      await p.goto(BASE + rota, { waitUntil: "domcontentloaded", timeout: 60000 });
      return p;
    };

    /* ----- tela do pedido ----- */
    const ped = await abrir("Modulos/Comercial/Pedidos/pedido.html");
    await ped.waitForFunction(() => typeof window.__pedidoAtalho === "function" && window.__CONTEXT?.empresa_id, null, { timeout: 30000 });
    assert.equal(await ped.textContent('.ct-ferramentas [data-etapa="catalogo"] .ct-kbd'), "F2", "o botão Catálogo mostra o atalho");
    await ped.click("#clienteInput");
    await ped.keyboard.press("F4");                // com o cursor dentro de um campo
    const frame = () => ped.frameLocator("iframe.pedido-catalogo-real");
    await ped.waitForFunction(() => document.querySelector(".ct-atual")?.dataset.etapa === "catalogo", null, { timeout: 30000 });
    const iframe = ped.frames().find(f => /catalogo\.html/.test(f.url()));
    await iframe.waitForFunction(() => document.activeElement?.id === "catalogSearch", null, { timeout: 30000 });
    assert.equal(await iframe.getAttribute("#catalogSearch", "placeholder"), "Pesquisar (F4)");
    await ped.keyboard.type("sofa");
    await iframe.waitForFunction(() => /Resultados da busca/i.test(document.body.innerText) || document.querySelectorAll("[data-grid-item]").length > 0, null, { timeout: 20000 });
    console.log("ok 1 - pedido: F4 (mesmo dentro do campo Cliente) abre o catálogo com o cursor na pesquisa e já dá para digitar");

    await ped.keyboard.press("F2");                // dentro do catálogo
    await iframe.waitForFunction(() => document.querySelectorAll(".catalog-home-card").length > 0 && document.getElementById("catalogSearch").value === "", null, { timeout: 20000 });
    console.log("ok 2 - dentro do catálogo, F2 volta para as categorias");
    // o cursor fica sempre na pesquisa: depois de abrir uma categoria e ao digitar fora de um campo
    await iframe.click(".catalog-home-card");
    await iframe.waitForFunction(() => !document.querySelector(".catalog-home-card") && document.activeElement?.id === "catalogSearch", null, { timeout: 20000 });
    await iframe.evaluate(() => document.activeElement.blur());
    await ped.keyboard.type("mesa");
    await iframe.waitForFunction(() => document.getElementById("catalogSearch").value === "mesa", null, { timeout: 10000 });
    await ped.keyboard.press("F2");
    await iframe.waitForFunction(() => document.querySelectorAll(".catalog-home-card").length > 0 && document.activeElement?.id === "catalogSearch", null, { timeout: 20000 });
    console.log("ok 2b - no catálogo o cursor volta para a pesquisa depois de navegar, e digitar fora de um campo escreve na pesquisa");

    await ped.click('.comercial-trilha [data-etapa="financeiro"]');
    await ped.waitForFunction(() => document.querySelector(".ct-atual")?.dataset.etapa === "financeiro");
    await ped.keyboard.press("F2");
    await ped.waitForFunction(() => document.querySelector(".ct-atual")?.dataset.etapa === "catalogo", null, { timeout: 20000 });
    await ped.click('.comercial-trilha [data-etapa="financeiro"]');
    await ped.waitForFunction(() => document.querySelector(".ct-atual")?.dataset.etapa === "financeiro");
    await ped.keyboard.press("F4");
    await iframe.waitForFunction(() => document.activeElement?.id === "catalogSearch", null, { timeout: 20000 });
    console.log("ok 3 - de outra etapa (financeiro), F2 e F4 levam ao catálogo");

    /* ----- Central de Pedidos ----- */
    const cen = await abrir("Modulos/Comercial/Pedidos/CentralPedidos.html");
    await cen.waitForSelector("#btnCatalogoCentral", { timeout: 30000 });
    await cen.waitForTimeout(1500);
    await cen.keyboard.press("F4");
    await cen.waitForURL(/Catalogo\/catalogo\.html\?pesquisar=1/, { timeout: 20000, waitUntil: "commit" });
    await cen.waitForFunction(() => document.activeElement?.id === "catalogSearch", null, { timeout: 30000 });
    await cen.goBack();
    await cen.waitForSelector("#btnCatalogoCentral", { timeout: 30000 });
    await cen.waitForTimeout(1000);
    await cen.click(".el-page-title");
    await cen.keyboard.press("F2");
    await cen.waitForURL(/Catalogo\/catalogo\.html$/, { timeout: 20000, waitUntil: "commit" });
    const cen2 = await abrir("Modulos/Comercial/Pedidos/CentralPedidos.html");
    await cen2.waitForSelector("#btnCatalogoCentral", { timeout: 30000 });
    await cen2.waitForTimeout(1500);
    await cen2.click("#btnCatalogoCentral");
    await cen2.waitForURL(/Catalogo\/catalogo\.html$/, { timeout: 20000, waitUntil: "commit" });
    console.log("ok 4 - Central de Pedidos: botão Catálogo, F2 e F4 (abre já na pesquisa)");

    assert.deepEqual(erros, [], "sem erros de JavaScript: " + erros.join(" | "));
    console.log("PASS LIVE: atalhos do Comercial");
  } finally {
    if (browser) { await browser.close(); }
    if (u) { await admin.from("usuarios_empresas").delete().eq("user_id", u.id); await admin.from("usuarios").delete().eq("id", u.id); await admin.auth.admin.deleteUser(u.id); }
  }
})().catch(e => { console.error(e); process.exit(1); });
