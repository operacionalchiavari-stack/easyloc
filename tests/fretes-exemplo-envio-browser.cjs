// Nov/2026: a prévia de exemplo da Conciliação de Fretes (Gestão de Fretes, ?exemplo=1) deixa conferir e enviar ao Contas a Pagar
// (tudo na memória da página): caixa "Enviar" em cada viagem, barra embaixo, janela de resumo.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://localhost:5598/";
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem("easyloc:limpeza-dados", "20261026-zerado"); } catch (_) {} window.supabase = { createClient: () => ({ from: () => ({ select() { return this; }, eq() { return this; }, in: async () => ({ data: [], error: null }) }), rpc: async () => ({ data: null, error: null }), auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange() {} } }) }; window.aguardarContexto = async () => ({ empresa_id: "e1" }); });
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE)) {
      const pth = decodeURIComponent(new URL(u).pathname);
      if (/supabase\.js$|context\.js|permissions\.js|limpezaDados|companyTheme/.test(pth)) return r.fulfill({ contentType: "text/javascript", body: "" });
      const f = path.join(raiz, pth);
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
      return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" });
    }
    return r.abort();
  });
  await page.goto(BASE + "Modulos/Chiavari/Fretes/conciliacao.html?exemplo=1", { waitUntil: "load" });
  await page.waitForSelector(".cf-viagens");
  const n = await page.locator(".cf-viagens [data-sel]").count();
  assert.ok(n > 0, "caixas Enviar no exemplo");
  const primeiro = await page.locator(".cf-viagens [data-final]").first().getAttribute("data-final");
  await page.fill('[data-final="' + primeiro + '"]', "300"); await page.press('[data-final="' + primeiro + '"]', "Enter");
  await page.waitForTimeout(400);
  await page.check('[data-sel="' + primeiro + '"]');
  await page.waitForFunction(() => /1 viagem/.test(document.getElementById("cfBarraEnvio")?.innerText || ""));
  await page.click("[data-envio-abrir]");
  await page.click('.cf-envio-dialog [type="submit"]');
  await page.waitForFunction(() => document.querySelectorAll(".cf-viagens [data-sel]").length < 18 || !document.querySelector("#cfBarraEnvio:not([hidden])"));
  await page.waitForTimeout(500);
  assert.ok(await page.locator("#cfFechLista").innerText().then((t) => /FR-0001/.test(t)), "fechamento na lista");
  assert.deepStrictEqual(erros, []);
  console.log("ok - exemplo: valor final, marcar, enviar ao Contas a Pagar");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
