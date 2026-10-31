// Out/2026 — Tela antiga (carregarNaMain) cujo arquivo não carrega (servidor local desligado, sem internet): antes a tela
// ficava esperando para sempre; agora aparece o aviso "Não foi possível abrir esta tela" e dá para abrir outra.
const { chromium } = require("playwright"); const express = require("express"); const fs = require("fs"); const assert = require("node:assert/strict");
const mock = fs.readFileSync(__dirname + "/financeiro-gerencial-browser.cjs", "utf8").match(/const mock = `([\s\S]*?)`;\n/)[1]
  .replace(/\$\{HOJE\}/g, new Date().toLocaleDateString("sv-SE")).replace(/\$\{mm\(M\)\}/g, "2026-10").replace(/\$\{mm\(mesAnt\)\}/g, "2026-09");
(async () => {
  const app = express(); app.use(express.static(process.cwd())); const server = app.listen(0, "127.0.0.1"); await new Promise((r) => server.on("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ channel: "msedge" });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    let falhar = true;
    await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); });
    await page.route("**/*", (r) => {
      const u = r.request().url();
      if (u.includes("supabase-js")) return r.fulfill({ contentType: "text/javascript", body: mock });
      if (falhar && u.includes("disponibilidade-itens.js")) return r.abort("failed");
      if (u.startsWith(base)) return r.continue();
      return r.fulfill({ body: "", contentType: "text/plain" });
    });
    await page.goto(base + "dashboard.html");
    await page.waitForSelector('[data-legado-href*="DisponibilidadeItens"]', { state: "attached", timeout: 15000 });
    await page.evaluate(() => document.querySelector('[data-legado-href*="DisponibilidadeItens"]').click());
    await page.waitForSelector("#main-content [role=alert]", { timeout: 10000 });
    assert.match(await page.textContent("#main-content [role=alert]"), /Não foi possível abrir esta tela/);
    assert.equal(await page.evaluate(() => window.__loadingModule), false, "não fica travado carregando");
    console.log("ok 1 - arquivo que não carrega mostra o aviso e não trava");
    falhar = false;
    await page.evaluate(() => document.querySelector('[data-legado-href*="DisponibilidadeItens"]').click());
    await page.waitForSelector("#disponCabecalho", { timeout: 10000 });
    assert.equal(await page.locator("#main-content [role=alert]", { hasText: "Não foi possível abrir" }).count(), 0, "o aviso some");
    console.log("ok 2 - tentando de novo, a tela abre");
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
