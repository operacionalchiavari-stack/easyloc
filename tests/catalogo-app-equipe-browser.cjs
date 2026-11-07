// Catálogo de celular aberto pela equipe (nov/2026): começa nas categorias, sem a Início, sem a Helena, sem a barra de
// abas e sem "Escolher projeto"; fundo branco; voltar (para o app da equipe) e busca na mesma linha; categorias como na
// Home do site (foto inteira no branco, nome embaixo).
const { chromium } = require("playwright"), express = require("express"), assert = require("assert/strict");
const { installMock } = require("./mock-projetos.cjs");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
(async () => {
  const app = express(); app.use(express.static(process.cwd())); const server = app.listen(0, "127.0.0.1"); await new Promise((r) => server.on("listening", r));
  const browser = await chromium.launch({ channel: "msedge" });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }), erros = [];
    page.on("pageerror", (e) => erros.push(e.message));
    await page.route("https://**/*", (r) => r.fulfill({ body: "", contentType: "text/javascript" }));
    await page.route("https://fixture/**", (r) => r.fulfill({ contentType: "image/png", body: PNG }));
    await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
    await page.addInitScript(installMock, { staff: true });
    await page.goto("http://127.0.0.1:" + server.address().port + "/Modulos/Comercial/Catalogo/catalogo-app.html?app=1");
    await page.waitForSelector(".cat-card");
    assert.ok(await page.evaluate(() => document.body.classList.contains("catalogo-equipe")), "modo equipe");
    assert.equal(await page.locator(".inicio-hero, .helena-card").count(), 0, "sem a Início nem a Helena");
    assert.ok(await page.locator("#appAbas").isHidden(), "sem a barra de abas: " + await page.evaluate(() => getComputedStyle(document.getElementById("appAbas")).display + " " + document.body.className));
    assert.equal(await page.locator(".chip-projeto").count(), 0, "sem Escolher projeto");
    const [volta, busca] = [await page.locator(".topo [data-app-inicio]").boundingBox(), await page.locator(".topo [data-busca]").boundingBox()];
    assert.ok(volta && busca && Math.abs((volta.y + volta.height / 2) - (busca.y + busca.height / 2)) < 6, "voltar e busca na mesma linha");
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(255, 255, 255)", "fundo branco");
    const nomeDentro = await page.evaluate(() => { const c = document.querySelector(".cat-card"), i = c.querySelector("img").getBoundingClientRect(), s = c.querySelector("span").getBoundingClientRect(); return s.top >= i.bottom - 1; });
    assert.ok(nomeDentro, "nome da categoria embaixo da foto");
    if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/cat-equipe.png" });
    // item: sem a barra de adicionar ao projeto e sem "Perguntar à Helena"
    await page.locator(".cat-card").first().click();
    await page.locator("[data-item], .produto-card, .card-produto").first().click().catch(() => {});
    await page.waitForTimeout(500);
    assert.equal(await page.locator(".barra-acao, [data-perguntar]").count(), 0, "item só para consulta");
    assert.deepEqual(erros, []);
    console.log("ok - catálogo da equipe no celular");
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
