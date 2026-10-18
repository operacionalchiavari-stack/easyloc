// Out/2026 — Cronograma só recarrega quando algo muda: a cada 20 s pergunta a assinatura
// (RPC cronograma_assinatura); assinatura igual = nada acontece; mudou = recarrega sem "Carregando".
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide|google is not defined|maps|places/i.test(e.message)) erros.push(e.message); });
  let assinatura = "A", cargas = 0, perguntas = 0;
  await page.addInitScript(() => {
    localStorage.setItem("easyloc-auth", JSON.stringify({ access_token: "tk" }));
    // relógio rápido: 20 s viram 200 ms
    const si = window.setInterval;
    window.setInterval = (fn, ms, ...a) => si(fn, ms === 20000 ? 200 : ms, ...a);
  });
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("/rest/v1/rpc/cronograma_assinatura")) {
      perguntas++;
      assert.strictEqual(r.request().headers()["authorization"], "Bearer tk");
      return r.fulfill({ contentType: "application/json", body: JSON.stringify(assinatura) });
    }
    if (u.includes("/api/gs")) {
      const { fn } = JSON.parse(r.request().postData() || "{}");
      if (fn === "getCronogramaSemana") cargas++;
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, resultado: fn === "getCronogramaSemana" ? [] : null }) });
    }
    if (u.startsWith(BASE)) {
      const f = path.join(raiz, decodeURIComponent(new URL(u).pathname));
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
      return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" });
    }
    return r.abort();
  });
  await page.goto(BASE + "Modulos/Chiavari/Cronograma/cronograma.html", { waitUntil: "load" });
  await page.waitForTimeout(5000);
  const cargasIniciais = cargas;
  assert.ok(cargasIniciais >= 1, "carregou ao abrir");
  await page.waitForTimeout(3000);
  assert.ok(perguntas > 5, "confere a assinatura de tempos em tempos (" + perguntas + ")");
  assert.strictEqual(cargas, cargasIniciais, "sem alteração não recarrega");
  console.log("ok 1 - sem alteração, nada recarrega (" + perguntas + " conferências)");

  await page.evaluate(() => { window.__loadingVisto = false; const lb = document.getElementById("loadingBox"); new MutationObserver(() => { if (getComputedStyle(lb).display !== "none") window.__loadingVisto = true; }).observe(lb, { attributes: true, attributeFilter: ["style", "class"] }); });
  assinatura = "B";
  await page.waitForFunction(() => true);
  await page.waitForTimeout(1500);
  assert.strictEqual(cargas, cargasIniciais + 1, "alteração recarrega uma vez");
  assert.strictEqual(await page.evaluate(() => window.__loadingVisto), false, "recarga sem 'Carregando'");
  await page.waitForTimeout(12000);
  assert.strictEqual(cargas, cargasIniciais + 1, "não recarrega de novo enquanto não muda");
  console.log("ok 2 - alteração recarrega uma vez, em silêncio");

  // com uma janela aberta espera fechar
  await page.evaluate(() => { const d = document.createElement("div"); d.className = "overlay show"; d.id = "tmpModal"; document.body.appendChild(d); });
  assinatura = "C";
  await page.waitForTimeout(1500);
  assert.strictEqual(cargas, cargasIniciais + 1, "não recarrega com janela aberta");
  await page.evaluate(() => document.getElementById("tmpModal").remove());
  await page.waitForTimeout(1500);
  assert.strictEqual(cargas, cargasIniciais + 2, "recarrega quando a janela fecha");
  console.log("ok 3 - com janela aberta espera fechar");

  assert.deepStrictEqual(erros, []);
  console.log("ok 4 - sem erro de JavaScript");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
