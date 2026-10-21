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
    if (u.includes("operacao-sem-motor.js")) { return r.fulfill({ contentType: "application/javascript", body: require("fs").readFileSync(require("path").join(__dirname, "stub-sem-motor.js")) }); }
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
  const extrasVisiveis = () => page.evaluate(() => [...document.querySelectorAll(".task-extra")].filter(e => e.offsetHeight > 0).length);
  assert.strictEqual(await extrasVisiveis(), 0, "fechado: nada de caminhão/obs nos cartões");
  const c = await page.evaluate(() => { const card = document.querySelector(".task-montagem"); return { ponto: !card.querySelector(".task-ponto"), linhas: card.querySelectorAll(".task-linha-icone").length, cont: card.querySelector(".task-detalhes-contagem")?.textContent.trim(), dia: document.getElementById("thc0").textContent }; });
  assert.ok(c.ponto && c.linhas === 2 && Number(c.cont) > 0, "cartão compacto: " + JSON.stringify(c));
  assert.ok(/[0-9]+ atividades?/.test(c.dia), "contagem no cabeçalho do dia: " + c.dia);
  console.log("ok 1 - cartão compacto (" + c.linhas + " linhas, " + c.cont + " informações guardadas) e \"" + c.dia + "\" no dia");
  await page.evaluate(() => { window.__abertos = 0; window.editarPedido = function(){ window.__abertos++; }; });
  await page.click(".linha-expandir >> nth=1");
  const aberta = await page.evaluate(() => { const tr = document.querySelectorAll("tr.linha-pedido")[1]; return { aberta: tr.classList.contains("is-aberta"), extras: [...tr.querySelectorAll(".task-extra")].filter(e => e.offsetHeight > 0).length, outras: [...document.querySelectorAll("tr.linha-pedido:not(.is-aberta) .task-extra")].filter(e => e.offsetHeight > 0).length, texto: tr.querySelector(".task-extra").innerText, abriu: window.__abertos }; });
  assert.ok(aberta.aberta && aberta.extras > 0 && aberta.outras === 0, "só a linha clicada abre: " + JSON.stringify(aberta));
  assert.ok(/Obs/.test(aberta.texto), "mostra as obs");
  const cam = await page.evaluate(() => document.querySelector(".task-montagem .task-linha-icone .task-caminhao-linha")?.textContent.trim());
  assert.ok(cam && /Volkswagen/.test(cam), "caminhão na linha do responsável: " + cam);
  assert.strictEqual(aberta.abriu, 0, "a seta não abre o pedido");
  console.log("ok 2 - a seta abre só aquela linha com caminhão e observações, sem abrir o pedido");
  await page.evaluate(() => renderCronograma());
  assert.ok(await page.evaluate(() => document.querySelectorAll("tr.linha-pedido")[1].classList.contains("is-aberta")), "continua aberta depois de redesenhar");
  await page.click(".linha-expandir >> nth=1");
  assert.strictEqual(await extrasVisiveis(), 0, "fecha de novo");
  console.log("ok 3 - continua aberta depois da atualização e fecha na seta");
  const foi = await page.evaluate(() => { window.__operacao = 0; window.abrirOperacaoEtapa = function(){ window.__operacao++; }; const c = document.querySelector(".task-montagem"); c.click(); return { op: window.__operacao, cursor: getComputedStyle(c).cursor, onclick: c.hasAttribute("onclick") }; });
  assert.ok(foi.op === 0 && !foi.onclick && foi.cursor !== "pointer", "Montagem não vai mais para o app: " + JSON.stringify(foi));
  console.log("ok 4a - sem bolinha colorida e clicar em Montagem não abre o App do Montador");
  assert.deepStrictEqual(erros, []);
  console.log("ok 4 - sem erro de JavaScript");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });