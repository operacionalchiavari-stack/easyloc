// Out/2026 — Painel Logístico: mostra a escala da semana, ajusta responsável/equipe/caminhão,
// avisa conflito antes de gravar e só grava com "Salvar mesmo assim"; "Preencher vazios" pede ao servidor.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const SAIDA = process.env.SHOT_DIR || "";

const regras = { deslocamento_h: 1, volume_padrao_m3: 10, usar_free: true, etapas: {
  triagem: { equipe: "triagem", caminhao: false }, carregamento: { equipe: "carregamento", caminhao: true },
  descarregamento: { equipe: "carregamento", caminhao: true }, montagem: { equipe: "montagem", caminhao: true }, desmontagem: { equipe: "montagem", caminhao: true } } };
const pessoas = [
  { nome: "Kauã Bernardes", equipe: "montagem", lider: true }, { nome: "Wesley Santos", equipe: "montagem", lider: true },
  { nome: "Igor Ramos", equipe: "montagem", lider: false }, { nome: "Vitor Machado", equipe: "montagem", lider: false },
  { nome: "Fabio Luiz", equipe: "carregamento", lider: true }, { nome: "Thiago Free", equipe: "free", lider: false, free: true }
];
const caminhoes = [{ codigo: "M", modelo: "Mercedez - Benz", capacidade: 42, empresa: "Simas Frete" }, { codigo: "G", modelo: "Volkswagen", capacidade: 54, empresa: "Simas Frete" }, { codigo: "P", modelo: "Hyundai HR", capacidade: 0, empresa: "Edir" }];
function painel() {
  return { inicio: "2026-10-20", fim: "2026-10-26", hoje: "2026-10-20", preenchidas: 0, regras, pessoas, caminhoes, etapas: [
    { id: "e1", pedido: "2104", cliente: "Marcos Vinícius", local: "Haras Pedra do Elefante", etapa: "Carregamento", tipo: "carregamento", data: "2026-10-20", hora: "07:00", responsavel: "Fabio Luiz", equipe: [], caminhoes: ["M"], m3: 30, pecas: 40, sugerido: 2, freeConfirmados: [], conflitos: [], avisos: ["Equipe pequena: 1 de 2 pessoas sugeridas"], passada: false },
    { id: "e2", pedido: "2104", cliente: "Marcos Vinícius", local: "Haras Pedra do Elefante", etapa: "Montagem", tipo: "montagem", data: "2026-10-20", hora: "09:00", responsavel: "Kauã Bernardes", equipe: ["Igor Ramos", "Vitor Machado", "Thiago Free"], caminhoes: ["M"], m3: 30, pecas: 40, sugerido: 4, freeConfirmados: ["Thiago Free"], conflitos: [], avisos: [], passada: false },
    { id: "e3", pedido: "2117", cliente: "Grupo Horizonte", local: "Espaço Jardim", etapa: "Montagem", tipo: "montagem", data: "2026-10-20", hora: "10:00", responsavel: "Wesley Santos", equipe: ["Igor Ramos"], caminhoes: ["G"], m3: 12, pecas: 10, sugerido: 2, freeConfirmados: [], conflitos: ["Igor Ramos também está em Montagem do pedido 2104 (09:00)"], avisos: [], passada: false }
  ] };
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erros = [], chamadas = [];
  page.on("pageerror", e => erros.push(e.message));
  let tentativa = 0;
  await page.route("**/*", r => {
    const u = r.request().url();
    if (u.includes("operacao-sem-motor.js")) { return r.fulfill({ contentType: "application/javascript", body: require("fs").readFileSync(require("path").join(__dirname, "stub-sem-motor.js")) }); }
    if (u.includes("/api/gs")) {
      const { fn, args } = JSON.parse(r.request().postData() || "{}");
      chamadas.push({ fn, args });
      let res = null;
      if (fn === "ESC_painel") { res = painel(); if (args[2]) res.preenchidas = 3; }
      if (fn === "ESC_salvarEtapa") { tentativa++; res = args[2] ? { ok: true, conflitos: ["Caminhão M também está em Montagem do pedido 2104"] } : (args[1].caminhoes.includes("M") && args[0] === "e3" ? { ok: false, conflitos: ["Caminhão M também está em Montagem do pedido 2104 (09:00)"] } : { ok: true, conflitos: [] }); }
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, resultado: res }) });
    }
    if (u.startsWith(BASE)) {
      const f = path.join(raiz, decodeURIComponent(new URL(u).pathname));
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
      return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" });
    }
    return r.abort();
  });
  await page.goto(BASE + "Modulos/Logistica/PainelLogistico/painel-logistico.html");
  await page.waitForSelector(".pl-etapa");
  const abriu = chamadas.find(c => c.fn === "ESC_painel");
  assert.strictEqual(abriu.args[2], false, "abrir não pede para preencher");
  assert.strictEqual(await page.locator(".pl-dia").count(), 7, "7 dias");
  assert.strictEqual(await page.locator(".pl-etapa").count(), 3);
  const e3 = page.locator('.pl-etapa[data-id="e3"]');
  assert.ok(await e3.evaluate(el => el.classList.contains("is-erro")), "conflito em vermelho");
  assert.ok((await e3.innerText()).includes("Igor Ramos também está em Montagem"));
  assert.ok((await page.locator("#plResumo").innerText()).includes("1 com conflito"));
  assert.ok((await page.locator('.pl-etapa[data-id="e2"]').innerText()).includes("Free com vaga confirmada: Thiago Free"));
  const livres = await page.locator(".pl-dia").first().locator(".pl-livres").innerText();
  assert.ok(/Wesley|Fabio/.test(livres) === false && /Caminhões livres: P/.test(livres), "livres do dia: " + livres);
  console.log("ok 1 - semana com 7 dias, conflito em vermelho, aviso, free confirmado e livres do dia");
  if (SAIDA) await page.screenshot({ path: SAIDA + "/painel.png", fullPage: true });

  // tirar alguém da equipe grava na hora
  await e3.locator('button[data-papel="equipe"][data-nome="Igor Ramos"]').click();
  await page.waitForTimeout(300);
  let salvar = chamadas.filter(c => c.fn === "ESC_salvarEtapa").pop();
  assert.deepStrictEqual(salvar.args.slice(0, 2), ["e3", { responsavel: "Wesley Santos", equipe: [], caminhoes: ["G"] }]);
  console.log("ok 2 - tirar uma pessoa grava a escala da etapa");

  // pôr um caminhão ocupado: avisa e não grava sem confirmar
  await e3.locator('select[data-papel="cam"]').selectOption("M");
  await page.waitForSelector("#plConflito[open]");
  assert.ok((await page.locator("#plConflitoLista").innerText()).includes("Caminhão M"));
  const antes = chamadas.filter(c => c.fn === "ESC_salvarEtapa").length;
  await page.click("#plConflitoVoltar");
  await page.waitForTimeout(200);
  assert.strictEqual(chamadas.filter(c => c.fn === "ESC_salvarEtapa").length, antes, "voltar não grava");
  await e3.locator('select[data-papel="cam"]').selectOption("M");
  await page.waitForSelector("#plConflito[open]");
  await page.click("#plConflitoSalvar");
  await page.waitForTimeout(400);
  salvar = chamadas.filter(c => c.fn === "ESC_salvarEtapa").pop();
  assert.strictEqual(salvar.args[2], true, "salvar mesmo assim manda forçar");
  console.log("ok 3 - conflito: avisa, 'Voltar' não grava e 'Salvar mesmo assim' grava forçando");

  // responsável só entre líderes
  const opcoesResp = await page.locator('.pl-etapa[data-id="e1"] select[data-papel="resp"] option').allTextContents();
  assert.ok(opcoesResp.every(t => !/Igor|Vitor|Thiago/.test(t)), "só líderes: " + opcoesResp);
  console.log("ok 4 - para responsável só aparecem líderes");

  await page.click("#plPreencher");
  await page.waitForTimeout(400);
  assert.strictEqual(chamadas.filter(c => c.fn === "ESC_painel").pop().args[2], true);
  assert.ok((await page.locator(".pl-toast").innerText()).includes("3 etapas preenchidas"));
  console.log("ok 5 - 'Preencher vazios' pede ao servidor e avisa quantas preencheu");

  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(200);
  const largura = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(largura <= 392, "celular sem rolar de lado: " + largura);
  assert.deepStrictEqual(erros, []);
  console.log("ok 6 - celular sem rolagem lateral e sem erro de JavaScript");
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
