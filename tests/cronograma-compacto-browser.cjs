// Out/2026 — Cronograma compacto: cartão só com etapa, hora, andamento, responsável e equipe;
// a seta do pedido abre o resto (caminhão, obs...) da linha, sem abrir o pedido, e continua aberta ao recarregar.
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
    if(u.includes('foto-teste.svg'))return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="gray"/></svg>'});
    if (u.includes("operacao-sem-motor.js")) { return r.fulfill({ contentType: "application/javascript", body: require("fs").readFileSync(require("path").join(__dirname, "stub-sem-motor.js")) }); }
    if (u.includes("/api/gs")) {
      const { fn } = JSON.parse(r.request().postData() || "{}");
      const res = fn === 'listarCaminhoes'?[{nome:'Volkswagen',tipo:'XL',foto_url:BASE+'foto-teste.svg'}]:fn === 'listarResponsaveis'?[{nome:'Wesley',foto_url:BASE+'foto-teste.svg'}]:fn === 'listarEquipes'?[{nome:'Equipe Interna',foto_url:BASE+'foto-teste.svg'},{nome:'Free',foto_url:BASE+'foto-teste.svg'}]:fn === "getCronogramaSemana" ? pedidos : fn === "CRON_entrarComLogin" ? { valido: true, perfil: "montagem", usuario: "T", token: "tk" } : null;
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

  const card=page.locator('.task-montagem[data-crono-detalhes]').first();
  await card.waitFor();
  assert.match(await card.innerText(),/Montagem/i);
  assert.ok(!(await card.innerText()).includes('Wesley'));
  assert.ok(!(await card.innerText()).includes('Equipe Interna'));
  assert.ok(!(await card.innerText()).includes('Volkswagen'));
  await card.hover();
  assert.equal(await page.locator('.crono-detalhes').count(),0);
  await card.click();
  const detalhe=page.locator('.crono-detalhes');
  await detalhe.waitFor();
  assert.match(await detalhe.innerText(),/Wesley/);
  assert.match(await detalhe.innerText(),/Equipe Interna/);
  assert.match(await detalhe.innerText(),/Volkswagen/);
  await detalhe.locator('img').nth(3).waitFor();
  assert.equal(await detalhe.locator('img').count(),4);
  await page.keyboard.press('Escape');
  assert.equal(await detalhe.count(),0);
  await card.focus();assert.equal(await detalhe.count(),0);
  await page.keyboard.press('Enter');await detalhe.waitFor();
  await detalhe.locator('img').nth(3).waitFor();
  assert.equal(await detalhe.locator('img').count(),4);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.task-extra:visible').count(),0);
  assert.deepStrictEqual(erros,[]);
  console.log('PASS: somente etapa e horario na grade; clique e Enter mostram evento, equipe e quatro fotos; grade permanece compacta.');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
