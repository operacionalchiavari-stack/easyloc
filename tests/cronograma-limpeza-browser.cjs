// Out/2026 — Limpeza do Cronograma: sem Equipe Free (foi para o RH), sem confirmação do decorador,
// sem criação de pedido; confirmações de sucesso viram mensagem que some sozinha.
// A tela nova Modulos/Chiavari/Cronograma/equipe-free.html abre o painel da Equipe Free direto.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const chamadas = [];
const hoje = new Date(); const iso = hoje.toISOString().slice(0, 10);
function resposta(fn, args) {
  if (fn === "CRON_entrarComLogin") return { valido: true, perfil: "montagem", usuario: "Teste RH", token: "tk", duracaoSegundos: 600 };
  if (fn === "getCronogramaSemana") return [];
  if (fn === "FREE_admListarVagas") return [{ idVaga: "v1", idEtapa: "e1", dataISO: iso, horario: "08:00", etapa: "Montagem", pedido: "12", cliente: "Lis", local: "Villa", vagas: 3, status: "ABERTA", confirmados: 1, cancelados: 0, cimaDaHora: 0, checkins: 0, checkouts: 0, faltas: 0, mudancasPendentes: 0, nomes: ["Ana Free"] }];
  if (fn === "FREE_admListarCadastros") return [{ idFree: "f1", nome: "João Free", telefone: "51 99999-0000", status: "PENDENTE", cpf: "" }];
  if (fn === "FREE_getUrlApp" || fn === "MONT_getUrlApp") return "https://acervo.teste/free";
  if (/^FREE_/.test(fn)) return [];
  return null;
}
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const erros = [];
  async function abrir(arquivo) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on("pageerror", (e) => { if (!/lucide|google is not defined|maps|places/i.test(e.message)) erros.push(arquivo + ": " + e.message); });
    page.on("dialog", (d) => d.dismiss());
    await page.route("**/*", (r) => {
      const u = r.request().url();
      if (u.includes("/api/gs")) {
        const { fn, args } = JSON.parse(r.request().postData() || "{}");
        chamadas.push(fn);
        return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, resultado: resposta(fn, args) }) });
      }
      if (u.startsWith(BASE)) {
        const f = path.join(raiz, decodeURIComponent(new URL(u).pathname));
        if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
        return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" });
      }
      if (u.includes("qrcode")) return r.fulfill({ contentType: "text/javascript", body: "window.QRCode=function(){};" });
      return r.abort();
    });
    await page.goto(BASE + "Modulos/Chiavari/Cronograma/" + arquivo, { waitUntil: "load" });
    return page;
  }

  // 1) Cronograma
  const cron = await abrir("cronograma.html");
  await cron.waitForTimeout(1500);
  assert.strictEqual(await cron.locator('[onclick*="freeAbrirPainel"]').count(), 0, "sem botão FREE");
  assert.strictEqual(await cron.locator("#modalFreePainel, #modalFreeVaga").count(), 0, "sem janelas do Free");
  assert.strictEqual(await cron.locator(".confirmacao-decorador-box").count(), 0, "sem caixa do decorador");
  assert.strictEqual(await cron.locator("#listaLote").count(), 0, "sem lote de pedidos");
  assert.ok(await cron.evaluate(() => typeof abrirAppMontador === "function"), "link do app do montador continua");
  assert.ok(await cron.evaluate(() => typeof adicionarAoLote === "undefined" && typeof abrirNovoPedidoProtegido === "undefined"), "sem criação de pedido");
  await cron.evaluate(() => avisoRapido("Equipe salva."));
  await cron.waitForSelector("#avisoRapido.show");
  assert.strictEqual(await cron.locator("#modalAlerta.show, #modalAlerta[style*='flex']").count(), 0, "sucesso não abre janela");
  await cron.waitForSelector("#avisoRapido:not(.show)", { timeout: 5000 });
  console.log("ok 1 - Cronograma sem Free, sem decorador, sem criação de pedido; sucesso some sozinho");

  // 2) Equipe Free (RH)
  const free = await abrir("equipe-free.html");
  await free.waitForFunction(() => !/Carregando/.test(document.getElementById("freePainelCorpo").textContent), { timeout: 15000 });
  assert.ok(chamadas.includes("CRON_entrarComLogin"), "entra pelo login");
  assert.ok(await free.locator("#freePainelCorpo .free-aba, #freePainelCorpo [data-aba], #freePainelCorpo button").count() > 0, "painel desenhado");
  await free.screenshot({ path: path.join(raiz, "outputs", "equipe-free.png") });
  console.log("ok 2 - Equipe Free abre o painel direto na tela (" + (await free.locator("#freePainelCorpo").innerText()).slice(0, 80).replace(/\n/g, " | ") + ")");

  assert.deepStrictEqual(erros, [], "sem erro de JavaScript");
  console.log("ok 3 - sem erro de JavaScript");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
