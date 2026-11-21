// Navegador logado como a vendedora da demonstração, abrindo os arquivos do computador (como o Live Server).
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const C = require("./comum.cjs");
const BASE = "http://localhost:5599/";
const tipos = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".glb": "model/gltf-binary", ".webmanifest": "application/manifest+json" };

async function abrirNavegador(sessao, { headless = true } = {}) {
  const browser = await chromium.launch({ channel: "msedge", headless });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.route("**/*", (rota) => {
    const u = new URL(rota.request().url());
    if (u.origin + "/" !== BASE) return rota.continue();
    const arq = path.join(C.raiz, decodeURIComponent(u.pathname));
    if (!fs.existsSync(arq) || fs.statSync(arq).isDirectory()) return rota.fulfill({ status: 404, body: "" });
    return rota.fulfill({ contentType: tipos[path.extname(arq)] || "application/octet-stream", body: fs.readFileSync(arq) });
  });
  await ctx.addInitScript(() => { window.print = () => {}; });
  await ctx.addInitScript(([s, emp]) => { localStorage.setItem("easyloc-auth", s); sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", emp); sessionStorage.setItem("usuario_nome", "Larissa Mendes"); }, [JSON.stringify(sessao), C.EMPRESA]);
  const erros = [];
  const abrir = async (rota) => {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => erros.push(rota + ": " + e.message));
    page.on("dialog", (d) => d.accept());
    await page.goto(BASE + rota, { waitUntil: "domcontentloaded", timeout: 90000 });
    return page;
  };
  return { browser, ctx, abrir, erros };
}
module.exports = { abrirNavegador, BASE };
