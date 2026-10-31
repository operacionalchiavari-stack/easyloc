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
    andamento: {total:10,separado:5,carregamento:{total:10,lidas:3}},
    etapas: [
      { id: "t" + n, etapa: "Triagem (Separação)", dataEtapa: "2026-10-1" + (3 + (n % 5)), horario: "06:00", responsavel:"Igor Ramos" },
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

  assert.equal(await page.getByRole('button',{name:'Agenda',exact:true}).count(),0);
  const quantidadeEtapas=await page.locator('#cronogramaGrade [data-crono-detalhes]').count();
  await page.getByRole('button',{name:'Visualizar como tabela',exact:true}).click();
  await page.locator('#cronogramaTabela').waitFor({state:'visible'});
  assert.equal(await page.locator('.board-wrap').isVisible(),false);
  assert.equal(await page.locator('#cronogramaTabela .crono-tabela-linha').count(),Math.min(20,quantidadeEtapas),'primeiro lote com até 20 etapas');
  const corGrade=await page.locator('#cronogramaGrade .task-montagem[data-crono-detalhes]').first().evaluate(el=>getComputedStyle(el).backgroundColor);
  const corTabela=await page.locator('#cronogramaTabela [data-crono-detalhes]').filter({hasText:'Montagem'}).first().evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.equal(corTabela,corGrade,'etapa usa a mesma cor da grade');
  assert.equal(await page.locator('#cronogramaTabela .crono-tabela-etapa').filter({hasText:'Triagem (Separação)'}).first().getByRole('progressbar').getAttribute('aria-valuenow'),'50');
  assert.equal(await page.locator('#cronogramaTabela .crono-tabela-etapa').filter({hasText:'Carregamento'}).first().getByRole('progressbar').getAttribute('aria-valuenow'),'30');
  await page.evaluate(()=>{cronogramaData.find(p=>p.pedido==='1410').andamento.carregamento.lidas=7;renderCronograma();});
  await page.waitForFunction(()=>[...document.querySelectorAll('#cronogramaTabela .crono-tabela-etapa')].some(el=>{const d=JSON.parse(el.dataset.cronoDetalhes);return d.pedido==='1410'&&d.etapa==='Carregamento'&&el.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')==='70';}));
  assert.equal(await page.locator('.crono-tabela-scroll').evaluate(el=>el.scrollHeight>el.clientHeight+1),false,'sem rolagem vertical interna');
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  await page.waitForFunction(n=>document.querySelectorAll('#cronogramaTabela tbody [data-crono-detalhes]').length===n,quantidadeEtapas);
  assert.equal(await page.locator('.crono-tabela-mais').isVisible(),false,'rodapé desaparece ao terminar as etapas');
  const datas=await page.locator('#cronogramaTabela .crono-tabela-linha').evaluateAll(rows=>rows.map(r=>r.cells[0].textContent.split('/').reverse().join('-')+' '+r.cells[1].textContent));
  assert.deepEqual(datas,[...datas].sort(),'tabela em ordem de data e horário');
  const grupos=await page.locator('#cronogramaTabela tbody[data-dia]').evaluateAll(nodes=>nodes.map(el=>({dia:el.dataset.dia,linhas:[...el.querySelectorAll('.crono-tabela-data')].map(c=>c.textContent.split('/').reverse().join('-')),cabecalhos:el.querySelectorAll('.crono-tabela-dia').length})));
  assert.ok(grupos.length>1);assert.ok(grupos.every(g=>g.cabecalhos===1&&g.linhas.every(d=>d===g.dia)),'um grupo por dia, sem misturar etapas');
  await page.locator('#cronogramaTabela [data-crono-responsavel="Wesley"] img').first().waitFor();
  assert.match(await page.locator('.crono-tabela-pedido-tag').first().innerText(),/^#\d+/);
  await page.screenshot({path:path.join(raiz,'outputs/cronograma-tabela.png'),fullPage:true});
  await page.locator('#cronogramaTabela [data-crono-detalhes]').filter({hasText:'Montagem'}).first().click();
  await page.locator('.crono-detalhes').waitFor();
  assert.match(await page.locator('.crono-detalhes').innerText(),/Wesley/);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{window.__testeBackupCronograma=cronogramaData;cronogramaData=[];renderCronograma();});
  await page.getByText('Nenhuma etapa no período selecionado.',{exact:true}).waitFor();
  await page.evaluate(()=>{cronogramaData=window.__testeBackupCronograma;renderCronograma();});
  await page.waitForFunction(n=>document.querySelectorAll('#cronogramaTabela tbody [data-crono-detalhes]').length===n,quantidadeEtapas);
  await page.getByRole('button',{name:'Visualizar como cronograma',exact:true}).click();
  assert.equal(await page.locator('.board-wrap').isVisible(),true);
  assert.equal(await page.locator('#cronogramaTabela').isVisible(),false);
  console.log('PASS: alternância grade/tabela, ordenação por data e hora, detalhes e atualização sem etapas.');

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
