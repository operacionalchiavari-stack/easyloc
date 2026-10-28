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
  let quebraConfigurada=1;const buscas=[];
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide|google is not defined|maps|places/i.test(e.message)) erros.push(e.message); });
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if(u.includes('foto-teste.svg'))return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="gray"/></svg>'});
    if (u.includes("operacao-sem-motor.js")) { return r.fulfill({ contentType: "application/javascript", body: require("fs").readFileSync(require("path").join(__dirname, "stub-sem-motor.js")) }); }
    if (u.includes("/api/gs")) {
      const { fn, args } = JSON.parse(r.request().postData() || "{}");
      if(fn==='getCronogramaSemana')buscas.push(args[0]);
      const res = fn === 'getParametrosCronograma'?{pedido_apos_dia:quebraConfigurada}:fn === 'listarCaminhoes'?[{nome:'Volkswagen',tipo:'XL',foto_url:BASE+'foto-teste.svg'}]:fn === 'listarResponsaveis'?[{nome:'Wesley',foto_url:BASE+'foto-teste.svg'}]:fn === 'listarEquipes'?[{nome:'Equipe Interna',foto_url:BASE+'foto-teste.svg'},{nome:'Free',foto_url:BASE+'foto-teste.svg'}]:fn === "getCronogramaSemana" ? (args[0]==='2026-10-20'?[{pedido:'9999',chave:'9999',cliente:'Evento futuro',local:'Local futuro',dataEvento:'2026-10-21',etapas:[{id:'futura',etapa:'Montagem',dataEtapa:'2026-10-20',horario:'09:00'}]}]:args[0]==='2026-10-13'?pedidos:[]) : fn === "CRON_entrarComLogin" ? { valido: true, perfil: "montagem", usuario: "T", token: "tk" } : null;
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


  const wrap=page.locator('.board-wrap');
  const linhasOriginais=await page.locator('tr.linha-pedido').count();
  assert.equal(await page.locator('table.board thead th').count(),8);
  assert.ok(buscas.includes('2026-10-20'),'proxima semana preparada antes da rolagem');
  await wrap.evaluate(el=>el.scrollLeft=el.scrollWidth);
  await page.waitForFunction(()=>document.querySelector('table.board thead tr').cells.length===16);
  assert.equal(await page.locator('table.board thead .crono-pedido-col').count(),2);
  assert.equal(buscas.filter(d=>d==='2026-10-20').length,1,'consome dados preparados sem buscar a semana novamente');
  assert.equal(await page.locator('table.board th.crono-pedido-col').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(244, 239, 232)');
  assert.equal(await page.locator('tr.linha-pedido').count(),linhasOriginais,'as semanas reutilizam linhas, sem somar todos os pedidos');
  const pedidosDaSegundaSemana=await page.locator('tr.linha-pedido').evaluateAll(rows=>rows.map(r=>r.cells[8].textContent.trim()).filter(Boolean));
  assert.equal(pedidosDaSegundaSemana.length,1);assert.match(pedidosDaSegundaSemana[0],/Evento futuro/);

  assert.match(await page.locator('table.board').innerText(),/Evento futuro/);
  assert.equal(await page.locator('[data-crono-detalhes]').evaluateAll(nodes=>nodes.filter(n=>JSON.parse(n.dataset.cronoDetalhes).pedido==='9999').length),1);
  const medidas=await page.locator('table.board thead th').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
  assert.ok(medidas.every(w=>Math.abs(w-260)<1),JSON.stringify(medidas));
  assert.equal(await page.locator('table.board td.crono-pedido-col').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(244, 239, 232)');
  assert.match(await page.locator('table.board thead th').nth(9).innerText(),/20\/10\/2026/);
  for(const quantidade of await page.locator('table.board tbody tr').evaluateAll(rows=>rows.filter(r=>r.cells.length>1).map(r=>r.cells.length)))assert.equal(quantidade,16);
  await wrap.evaluate(el=>el.scrollLeft=el.scrollWidth);
  await page.waitForFunction(()=>document.querySelector('table.board thead tr').cells.length===24);
  assert.equal(await page.locator('table.board thead .crono-pedido-col').count(),3);
  assert.equal(await page.locator('[data-crono-detalhes]').evaluateAll(nodes=>nodes.filter(n=>JSON.parse(n.dataset.cronoDetalhes).pedido==='9999').length),1);
  await page.evaluate(()=>{mudarSemana(7);});
  await page.waitForFunction(()=>document.querySelector('table.board thead tr').cells.length===8);
  assert.match(await page.locator('table.board').innerText(),/Evento futuro/);
  quebraConfigurada=3;
  await page.reload();
  await page.evaluate(()=>{semanaInicioAtual=getInicioSemanaOperacional(new Date('2026-10-13T12:00:00'));atualizarCabecalhoSemana();carregarCronograma();});
  await page.waitForFunction(()=>document.querySelector('table.board thead tr').cells.length===9);
  assert.equal((await page.locator('table.board thead th').nth(3).innerText()).toLowerCase(),'pedido');
  assert.match(await page.locator('table.board thead th').nth(2).innerText(),/14\/10\/2026/);
  assert.match(await page.locator('table.board thead th').nth(4).innerText(),/15\/10\/2026/);
  assert.deepEqual(erros,[]);
  console.log('PASS: rolagem carrega semanas, repete Pedido apos segunda, mantem largura e cor, sem duplicar etapas; navegacao semanal reinicia intervalo.');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
