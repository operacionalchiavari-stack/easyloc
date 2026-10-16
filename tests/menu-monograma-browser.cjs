// Menu fechado mostra a própria logo recortada no 1º bloco de letras ("Ch") — js/ui/menuMonograma.js (out/2026).
// Usa a logo real da Chiavari: LOGO=<caminho do PNG> node tests/menu-monograma-browser.cjs
const assert = require("assert");
const { chromium } = require("playwright"); const fs = require("fs"); const path = require("path");
const raiz = path.resolve(__dirname, ".."); const BASE = "http://acervo.teste/";
const LOGO = "https://awemuohtvwvrdzfxwrmd.supabase.co/storage/v1/object/public/empresas-logos/bb/identidade-logo.png";
const mock = fs.readFileSync(path.join(__dirname, "central-ver-pedido-browser.cjs"), "utf8").match(/const mockSupabase = `([\s\S]*?)`;/)[1];
(async () => {
  const b = await chromium.launch({ channel: "msedge" }); const page = await b.newPage({ viewport: { width: 1280, height: 700 } });
  const erros = []; page.on("pageerror", (e) => erros.push(e.message));
  await page.addInitScript((logo) => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1");
    localStorage.setItem("easyloc_theme_e1", JSON.stringify({ logo_url: logo })); }, LOGO);
  await page.route("**/*", (r) => { const u = r.request().url();
    if (u.includes("identidade-logo.png") || u.includes("fixture/logo.png")) return r.fulfill({ contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: fs.readFileSync(process.env.LOGO) });
    if (u.includes("supabase-js")) return r.fulfill({ contentType: "text/javascript", body: mock });
    if (u.startsWith(BASE)) { const a = path.join(raiz, decodeURIComponent(new URL(u).pathname)); if (!fs.existsSync(a)) return r.fulfill({ status: 404, body: "" });
      const t = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png" }[path.extname(a)] || "application/octet-stream";
      return r.fulfill({ contentType: t, body: fs.readFileSync(a) }); }
    return r.abort(); });
  await page.goto(BASE + "dashboard.html", { waitUntil: "domcontentloaded" }); await page.mouse.move(900, 400);
  await page.waitForFunction(() => !document.getElementById("sidebarMonograma").hidden, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => { const m = document.getElementById("sidebarMonograma"), r = m.getBoundingClientRect(), s = document.getElementById("sidebar").getBoundingClientRect();
    return { mono: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], rail: Math.round(s.width), cache: !!localStorage.getItem("easyloc_monograma"), logoVisivel: getComputedStyle(document.getElementById("sidebarLogo")).display }; });
  assert.ok(!info.cache === false, "recorte guardado no navegador");
  assert.equal(info.logoVisivel, "none", "menu fechado: logo inteira escondida");
  assert.ok(info.mono[3] === 34 && info.mono[2] > 30 && info.mono[2] < 46, "tamanho do Ch: " + info.mono);
  assert.ok(Math.abs(info.mono[0] * 2 + info.mono[2] - info.rail) <= 2, "Ch centralizado no trilho");
  console.log("ok 1 - menu fechado mostra o Ch recortado da logo", JSON.stringify(info));
  await page.mouse.move(30, 300); await page.waitForTimeout(700);
  const aberto = await page.evaluate(() => ({ mono: getComputedStyle(document.getElementById("sidebarMonograma")).display, logo: getComputedStyle(document.getElementById("sidebarLogo")).display }));
  assert.deepStrictEqual(aberto, { mono: "none", logo: "block" });
  console.log("ok 2 - menu aberto volta a logo inteira");
  // Recarregar: o recorte já vem do cache (anti-flash) antes do script do recorte rodar.
  await page.mouse.move(900, 400); await page.reload({ waitUntil: "domcontentloaded" });
  assert.ok(await page.evaluate(() => !document.getElementById("sidebarMonograma").hidden && document.getElementById("sidebarMonograma").src.startsWith("data:")), "recarregar: recorte já vem do cache");
  console.log("ok 3 - ao recarregar o Ch aparece na hora (cache)");
  // sessionStorage negado vem de iframes de telas que o teste bloqueia; lucide é CDN bloqueado.
  assert.deepStrictEqual(erros.filter((e) => !/lucide|sessionStorage/.test(e)), []);
  await b.close(); console.log("PASS");
})().catch((e) => { console.error(e); process.exit(1); });
