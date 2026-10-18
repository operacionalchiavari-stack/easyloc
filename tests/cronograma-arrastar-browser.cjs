// Out/2026 — Cronograma com dias largos (260px) que rolam dentro da caixa: arrastar com o mouse
// mostra os próximos dias; clique sem arrastar continua abrindo o pedido; pedido e cabeçalho ficam parados.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const assert = require("assert");
const pedidos = [];
for (let n = 0; n < 8; n++) {
  pedidos.push({ pedido: String(1410 + n), chave: String(1410 + n), cliente: ["Ana Souza Decorações e Eventos", "Lis", "Casamento Paula e Rafael", "Expo Feira"][n % 4],
    local: "Villa Bisutti, São Paulo", dataEvento: "2026-10-1" + (4 + (n % 5)),
    infoLogistica: { baldeacao: "Sim", escada: "Não", caminhaoPerto: "Não", lona: "Não" },
    etapas: [
      { id: "a" + n, etapa: "Carregamento", dataEtapa: "2026-10-1" + (3 + (n % 5)), horario: "07:00", caminhao: "Mercedez - Benz (G)", responsavel: "Igor Ramos", equipe: "Igor Ramos" },
      { id: "b" + n, etapa: "Montagem", dataEtapa: "2026-10-1" + (3 + (n % 5)), horario: "08:00", caminhao: "Volkswagen (XL)", responsavel: "Wesley", equipe: "Equipe Interna | Free", observacao: n % 2 ? "Levar escada própria" : "" },
      { id: "c" + n, etapa: "Desmontagem", dataEtapa: "2026-10-1" + (5 + (n % 4)), horario: "07:00", caminhao: "", responsavel: "", equipe: "" }] });
}
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide|google is not defined|maps|places/i.test(e.message)) erros.push(e.message); });
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("/api/gs")) {
      const { fn } = JSON.parse(r.request().postData() || "{}");
      const res = fn === "getCronogramaSemana" ? pedidos : fn === "CRON_entrarComLogin" ? { valido: true, perfil: "montagem", usuario: "T", token: "tk" } : null;
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, resultado: res }) });
    }
    if (u.startsWith(BASE)) {
      const f = path.join(raiz, decodeURIComponent(new URL(u).pathname));
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
      return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" });
    }
    return r.abort();
  });
  await page.goto(BASE + "Modulos/Chiavari/Cronograma/cronograma.html", { waitUntil: "load" });
  await page.evaluate(() => { const d = new Date("2026-10-13T12:00:00"); semanaInicioAtual = getInicioSemanaOperacional(d); carregarCronograma(); });
  await page.waitForTimeout(2500);
  const wrap = await page.locator(".board-wrap").boundingBox();
  const antes = await page.evaluate(() => { const w = document.querySelector(".board-wrap"); return { l: w.scrollLeft, sw: w.scrollWidth, cw: w.clientWidth }; });
  assert.ok(antes.sw > antes.cw + 500, "dias mais largos que a tela: rola para o lado");
  const th1 = await page.evaluate(() => document.querySelectorAll(".board thead th")[1].offsetWidth);
  assert.ok(th1 >= 255, "dia com ~260px (" + th1 + ")");
  console.log("ok 1 - dias de " + th1 + "px, tabela " + antes.sw + "px numa caixa de " + antes.cw + "px");

  await page.evaluate(() => { window.__abertos = 0; const o = window.editarPedido; window.editarPedido = function(){ window.__abertos++; }; });
  const card = await page.locator(".col-evento").nth(1).boundingBox();
  const x0 = wrap.x + 1000, y0 = card.y + 60;
  await page.mouse.move(x0, y0); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x0 - i * 60, y0);
  await page.mouse.up();
  const depois = await page.evaluate(() => document.querySelector(".board-wrap").scrollLeft);
  assert.ok(depois >= 550, "arrastar 600px para a esquerda rola ~600px (" + depois + ")");
  const fixo = await page.evaluate(() => { const td = document.querySelector(".board tbody td.col-evento"); return Math.round(td.getBoundingClientRect().left - document.querySelector(".board-wrap").getBoundingClientRect().left); });
  assert.ok(Math.abs(fixo) <= 2, "coluna do pedido fica parada (" + fixo + ")");
  console.log("ok 2 - arrastar com o mouse rola " + depois + "px e a coluna do pedido fica parada");

  // soltar o arrasto em cima do pedido não abre; clique simples abre
  await page.mouse.move(card.x + 60, card.y + 40); await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(card.x + 60 + i * 20, card.y + 40);
  await page.mouse.up();
  assert.strictEqual(await page.evaluate(() => window.__abertos), 0, "arrastar não abre o pedido");
  await page.mouse.click(card.x + 60, card.y + 40);
  assert.strictEqual(await page.evaluate(() => window.__abertos), 1, "clique simples abre o pedido");
  console.log("ok 3 - clique sem arrastar abre o pedido; arrastar não");

  const rows = await page.evaluate(() => [...document.querySelectorAll(".board tbody tr")].map(r => r.offsetHeight));
  assert.ok(rows[0] <= 70, "linha da agenda vazia baixa (" + rows[0] + ")");
  assert.deepStrictEqual(erros, []);
  console.log("ok 4 - linhas baixas (" + rows.slice(0, 3).join("/") + "px), sem erro de JavaScript");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
