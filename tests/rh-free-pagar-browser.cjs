// Nov/2026 — Pagamento de Freelancer como contas a pagar: sem semana, sem título, sem "Valor da hora",
// "Exportar planilha" e "Sair"; abas A pagar / Pagos sobre todos os eventos (pedidos com "tudo").
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const chamadas = [];
function pessoa(id, nome, situacao, total) {
  return { idInscricao: id, idFree: "f" + id, nome, cpf: "•••", telefone: "24999990000", pix: "pix@" + id, nota: 4.5, checkinEm: "27/10/2026 07:00:00", lat: -22.5, lng: -44.1, checkoutEm: "27/10/2026 17:00:00",
    via: "qr", distancia: 40, presencaPor: "", fotoUniforme: "", uniforme: null, pagamento: situacao === "PAGO" ? { valorPago: total, pagoEm: "28/10/2026 10:00:00", forma: "PIX" } : null,
    calc: { fase: "CONCLUIDO", minutos: 600, horas: "10h", atrasoMin: 0, diaria: 150, extraMin: 0, extraTexto: "", extraValor: 0, total, situacao, motivos: situacao === "REVISAR" ? ["Sem foto de uniforme"] : [] }, miniatura: "" };
}
const dados = { inicio: "tudo", fim: "2026-11-17", config: { valorHora: 25, horasDiaria: 8 }, usuario: "Teste", eventos: [
  { idVaga: "v1", idEtapa: "e1", pedido: "5", pontoEncontro: "Galpão Chiavari", cliente: "Lis", clienteFoto: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", local: "Villa", fotoEquipe: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", fotoEquipeEm: "01/10/2026 07:10:00", etapa: "Montagem", dataISO: "2026-10-01", horario: "07:00", lider: "K", responsavel: "K", valor: 150, quantidade: 2, fotos: [],
    pessoas: [pessoa("1", "Ana", "PAGO", 150), pessoa("2", "Bia", "PAGAR", 150)] },
  { idVaga: "v2", idEtapa: "e2", pedido: "6", cliente: "Kelly", local: "Sítio", etapa: "Desmontagem", dataISO: "2026-10-30", horario: "07:00", lider: "K", responsavel: "K", valor: 150, quantidade: 1, fotos: [],
    pessoas: [pessoa("3", "Caio", "REVISAR", 150)] },
  { idVaga: "v3", idEtapa: "e3", pedido: "7", cliente: "Rosa", local: "Clube", etapa: "Montagem", dataISO: "2026-09-15", horario: "07:00", lider: "K", responsavel: "K", valor: 150, quantidade: 1, fotos: [],
    pessoas: [pessoa("4", "Davi", "PAGO", 150)] }
] };
function resposta(fn, args) {
  if (fn === "RH_login") return { token: "acervo", nome: "Teste", cicloAtual: "2026-11-03" };
  if (fn === "RH_carregarCiclo") { assert.strictEqual(args[1], "tudo", "pede todos os eventos"); return dados; }
  return null;
}
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide|google is not defined/i.test(e.message)) erros.push(e.message); });
  await page.addInitScript(() => { try { localStorage.setItem("easyloc:limpeza-dados", "20261026-zerado"); } catch (_) {} });
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("operacao-sem-motor.js")) return r.fulfill({ contentType: "application/javascript", body:
      "window.__chamadas=[];window.ACERVO_LOCAL={RH_login:function(){return Promise.resolve({token:'acervo',nome:'Teste',cicloAtual:'2026-11-03'});}," +
      "RH_carregarCiclo:function(t,ini){window.__chamadas.push(ini);return Promise.resolve(" + JSON.stringify(dados) + ");},RH_enviarFinanceiro:function(t,ini,itens,venc,obs){window.__envio={itens:itens,venc:venc};var d=" + JSON.stringify(dados) + ";d.eventos.forEach(function(e){e.pessoas.forEach(function(p){itens.forEach(function(x){if(x.inscricao===p.idInscricao){p.calc.situacao='FINANCEIRO';p.financeiro={fechamento:'fe1',documento:'FL-0001',vencimento:venc,pago:0};}});});});return Promise.resolve(d);},RH_desfazerEnvio:function(t,ini,f){window.__desfeito=f;return Promise.resolve(" + JSON.stringify(dados) + ");},RH_uniformeEquipe:function(t,ini,lista){window.__uni=lista;var d=" + JSON.stringify(dados) + ";d.eventos.forEach(function(e){e.pessoas.forEach(function(p){lista.forEach(function(x){if(x.idInscricao===p.idInscricao)p.uniforme={avaliacao:x.avaliacao};});});});return Promise.resolve(d);}};" });
    if (u.includes("/api/gs")) {
      const { fn, args } = JSON.parse(r.request().postData() || "{}"); chamadas.push(fn);
      let res; try { res = resposta(fn, args); } catch (e) { return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: false, erro: e.message }) }); }
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, resultado: res }) });
    }
    if (u.startsWith(BASE)) {
      const f = path.join(raiz, decodeURIComponent(new URL(u).pathname));
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
      return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" });
    }
    return r.abort();
  });
  await page.goto(BASE + "Modulos/Chiavari/Cronograma/rh.html", { waitUntil: "load" });
  // sem a tela "Senha da RH": entra sozinho pelo login do sistema
  await page.waitForSelector(".evento", { timeout: 10000 });

  assert.deepStrictEqual(await page.evaluate(() => window.__chamadas), ["tudo"], "pede todos os eventos");
  assert.equal(await page.locator("#telaLogin, #loginSenha").count(), 0, "sem a tela de senha");
  assert.equal(await page.locator(".topo, #cicloTexto, [onclick*=abrirConfig], #btnExportar, [onclick*='sair()']").count(), 0, "sem título, semana, Valor da hora, Exportar e Sair");
  assert.ok(!(await page.innerText("#telaPainel")).includes("RH · Equipe Free"), "sem o título");
  assert.ok(await page.locator("#resumo").isHidden(), "sem os cards de resumo");
  assert.equal(await page.getByText("Marcar evento como pago").count(), 0, "sem Marcar evento como pago");
  assert.equal(await page.locator(".evento .td-acoes button").count(), 0, "sem Pago e Não pagar na linha");
  // A pagar: Bia (01/10) antes de Caio (30/10); pagos não aparecem
  let nomes = await page.$$eval(".evento .pessoa b", (l) => l.map((x) => x.textContent.trim()));
  assert.deepStrictEqual(nomes, ["Bia", "Caio"], "a pagar, do mais antigo para o mais novo");
  assert.equal(await page.textContent('[data-conta="apagar"]'), "2");
  assert.equal(await page.textContent('[data-conta="pagos"]'), "2");
  await page.click('[data-filtro="pagos"]');
  nomes = await page.$$eval(".evento .pessoa b", (l) => l.map((x) => x.textContent.trim()));
  assert.deepStrictEqual(nomes, ["Ana", "Davi"], "pagos, do mais recente para o mais antigo");
  assert.equal(await page.locator('[data-filtro="todos"]').count(), 0, "sem a aba Todos");
  assert.deepStrictEqual(await page.$$eval('.pg-abas [role="tab"]', (l) => l.map((x) => x.textContent.replace(/\s+\d+$/, "").trim())), ["A pagar", "No financeiro", "Pagos"]);
  await page.click('[data-filtro="apagar"]');
  assert.equal(await page.getAttribute('[data-filtro="apagar"]', "aria-selected"), "true");
  assert.equal(await page.locator(".evento").first().locator(".evento-cli img").count(), 1, "foto da decoradora");
  assert.match(await page.locator(".evento").first().innerText(), /Pedido 5[\s\S]*QUI[\s\S]*01\/10[\s\S]*Montagem · Lis – Villa[\s\S]*Encontro 07h · Galpão Chiavari · Responsável K/i);
  assert.equal(await page.locator(".evento").nth(1).locator(".evento-cli img").count(), 0, "sem foto: iniciais");
  const fontes = await page.evaluate(() => [...new Set([...document.querySelectorAll("#telaPainel *")].filter((e) => e.offsetParent && e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => getComputedStyle(e).fontFamily.split(",")[0].replace(/"/g, "").trim()))]);
  assert.deepStrictEqual(fontes, ["Inter"], "uma fonte só: " + fontes);
  assert.equal(await page.locator('.aba, [data-aba="fotos"], [data-aba="pagamentos"]').count(), 0, "sem as abas Pagamentos e Fotos e uniforme");
  // Agrupar por: 3 ícones no canto direito
  const barra = await page.locator(".pg-barra").boundingBox(), icones = await page.locator(".pg-agrupar").boundingBox();
  assert.ok(icones.x + icones.width > barra.x + barra.width - 4, "ícones no canto direito");
  assert.equal(await page.locator(".pg-agrupar button[data-agrupar]").count(), 3);
  await page.click('[data-agrupar="dias"]');
  if (process.env.SHOTD) await page.screenshot({ path: process.env.SHOTD });
  const dias = await page.$$eval(".dia-titulo .dia-nome", (l) => l.map((x) => x.textContent.trim()));
  assert.equal(dias.length, 2, "um grupo por dia: " + dias);
  assert.match(await page.locator(".dia-grupo", { hasText: "01/10" }).innerText(), /1 evento · 1 pessoa · R\$\s?150,00/);
  assert.ok(await page.locator('[data-agrupar="dias"]').evaluate((b) => b.classList.contains("ativo")));
  await page.click('[data-agrupar="pessoas"]');
  assert.ok(await page.locator(".dia-grupo").count() === 0);
  await page.click('[data-agrupar="eventos"]');
  assert.ok(await page.locator(".evento").count() === 2);
  await page.click('[data-filtro="apagar"]');
  console.log("ok 1 - contas a pagar: sem semana nem botões do topo; A pagar / Pagos sobre todos os eventos");
  if (process.env.SHOT) { await page.click('[data-filtro="apagar"]'); await page.screenshot({ path: process.env.SHOT }); }
  // Uniforme pela foto da equipe: foto no topo do evento, clique pergunta se todos estavam uniformizados
  const ev1 = page.locator(".evento", { hasText: "Pedido 5" });
  assert.equal(await ev1.locator("[data-eq-vaga] img").count(), 1, "foto da equipe no topo do evento");
  assert.match(await ev1.locator(".eq-foto[data-eq-vaga]").innerText(), /Conferir uniforme/);
  assert.match(await page.locator(".evento", { hasText: "Pedido 6" }).locator(".eq-foto").innerText(), /Sem foto/);
  await ev1.locator(".eq-foto[data-eq-vaga]").click();
  assert.ok(await page.locator("#janela .eq-pergunta").first().isVisible());
  assert.ok(await page.locator("#janela .eq-quem").isHidden(), "só pergunta primeiro");
  await page.click("#janela [data-eq-sim]");
  assert.deepStrictEqual(await page.evaluate(() => window.__uni), [{ idInscricao: "1", avaliacao: "OK" }, { idInscricao: "2", avaliacao: "OK" }]);
  await ev1.locator(".eq-foto[data-eq-vaga]").click();
  await page.click("#janela [data-eq-nao]");
  await page.locator("#janela .eq-pessoa", { hasText: "Bia" }).click();
  await page.click("#janela [data-eq-salvar]");
  assert.deepStrictEqual(await page.evaluate(() => window.__uni), [{ idInscricao: "1", avaliacao: "OK" }, { idInscricao: "2", avaliacao: "SEM" }]);
  if (process.env.SHOTEQ) { await ev1.locator(".eq-foto[data-eq-vaga]").click(); await page.screenshot({ path: process.env.SHOTEQ }); await page.click("#janela [data-eq-fechar]:visible"); }
  await page.click('[data-filtro="apagar"]');
  // Colunas Local do check-in e Uniformizado (Bia ficou "Não" no passo anterior)
  const ev5 = () => page.locator(".evento", { hasText: "Pedido 5" });
  const uniBia = () => ev5().locator("tr", { hasText: "Bia" }).locator('td[data-label="Uniformizado"]');
  assert.match(await ev5().locator("tr", { hasText: "Bia" }).locator('td[data-label="Local do check-in"]').innerText(), /No ponto · 40 m/);
  assert.equal((await uniBia().innerText()).trim(), "Não", "marcado pelo RH na foto: Não");
  await uniBia().locator("button").click();
  await page.click("#janela [data-eq-sim]");
  await page.waitForFunction(() => !document.querySelector("#fundo.ver"));
  assert.equal((await uniBia().innerText()).trim(), "Sim");
  assert.equal((await page.locator(".evento", { hasText: "Pedido 6" }).locator('td[data-label="Uniformizado"]').innerText()).trim(), "A conferir");
  // Mapa do check-in numa janela, dentro do sistema
  await ev5().locator("tr", { hasText: "Bia" }).locator(".lc-mapa").click();
  assert.match(await page.getAttribute("#janela .mapa-checkin iframe", "src"), /maps\.google\.com\/maps\?q=-22\.5%2C-44\.1.*output=embed/);
  assert.match(await page.innerText("#janela"), /Bia[\s\S]*No ponto de encontro · 40 m/);
  if (process.env.SHOTMAPA) await page.screenshot({ path: process.env.SHOTMAPA });
  for (const alt of [900, 660]) {
    await page.setViewportSize({ width: 1400, height: alt }); await page.waitForTimeout(150);
    const m = await page.evaluate(() => { const j = document.getElementById("janela"), r = j.getBoundingClientRect(); return { sobra: j.scrollHeight - j.clientHeight, topo: r.top, baixo: innerHeight - r.bottom }; });
    assert.ok(m.sobra <= 1, "janela do mapa sem barra vertical em " + alt + "px: " + JSON.stringify(m));
    assert.ok(Math.abs(m.topo - m.baixo) <= 4, "janela do mapa centralizada: " + JSON.stringify(m));
  }
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.click("#janela .acoes .btn:not(.btn-claro)");
  // Enviar ao Contas a Pagar: marcar em A pagar, enviar, aparece em No financeiro
  await page.click('[data-filtro="apagar"]');
  assert.equal(await page.locator(".sel-envio").count(), 2, "uma caixa por diária a pagar");
  await page.locator(".evento", { hasText: "Pedido 5" }).locator(".sel-evento").check();
  await page.locator(".evento", { hasText: "Pedido 6" }).locator(".sel-envio").check();
  assert.match(await page.innerText("#barraEnvio"), /2 diárias de 2 freelancers · R\$\s?300,00/);
  if (process.env.SHOTENV) await page.screenshot({ path: process.env.SHOTENV });
  await page.click("[data-envio-abrir]");
  assert.match(await page.innerText("#janela"), /Enviar ao Contas a Pagar[\s\S]*Revisar[\s\S]*Caio/);
  if (process.env.SHOTENV2) await page.screenshot({ path: process.env.SHOTENV2 });
  await page.click("#envioConfirmar");
  await page.waitForFunction(() => window.__envio);
  assert.deepStrictEqual(await page.evaluate(() => window.__envio.itens), [{ inscricao: "2", valor: 150 }, { inscricao: "3", valor: 150 }]);
  await page.click('[data-filtro="financeiro"]');
  assert.equal(await page.locator(".evento .chip.FINANCEIRO").count(), 2);
  assert.match(await page.locator(".evento").first().innerText(), /FL-0001 · vence/);
  await page.locator("[data-desfazer-envio]").first().click();
  await page.click("#desfazerEnvioOk");
  await page.waitForFunction(() => window.__desfeito === "fe1");
  await page.click('[data-filtro="apagar"]');
  console.log("ok 3 - marcar em A pagar e enviar ao Contas a Pagar; No financeiro; desfazer envio");
  console.log("ok 2 - uniforme pela foto da equipe: Sim marca todos, Não pergunta quem");
  assert.deepStrictEqual(erros, []);
  console.log("todos os testes passaram");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
