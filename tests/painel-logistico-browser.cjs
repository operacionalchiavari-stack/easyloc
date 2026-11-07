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
  let tentativa = 0;const planejamento=painel();planejamento.pessoas[2].foto_url=BASE+'foto-igor.png';planejamento.pessoas.push({nome:'Bruno Lima',foto_url:BASE+'foto-igor.png',equipe:'montagem',lider:false});planejamento.etapas.push({...planejamento.etapas[1],id:'pre',data:'2026-10-22',pedido:'9999',cliente:'Pre reserva em consulta',somente_consulta:true,responsavel:'',equipe:[],caminhoes:[]});planejamento.etapas.push({...planejamento.etapas[1],id:'e4',data:'2026-10-21',cliente:'Evento do dia seguinte',responsavel:'',equipe:[],caminhoes:[]});
  await page.addInitScript(()=>{window.__CONTEXT={empresa_id:'e1',usuario_id:'u1'};window.aguardarContexto=async()=>window.__CONTEXT;window.supabaseClient={auth:{getSession:async()=>({data:{session:null}})},rpc:async()=>({data:[],error:null})};});
  await page.route("**/*", r => {
    if(r.request().url().includes('/js/core/permissions.js'))return r.fulfill({contentType:'text/javascript',body:'window.EasyLocPermissions={load:async()=>{},hasPermission:()=>true};window.hasPermission=()=>true;'});
    if(r.request().url().includes('/js/core/context.js')||r.request().url().includes('/js/core/supabase.js'))return r.fulfill({contentType:'text/javascript',body:''});
    const u = r.request().url();
    if(u.endsWith("foto-igor.png"))return r.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="gray"/></svg>'});
    if (u.includes("operacao-sem-motor.js")) { return r.fulfill({ contentType: "application/javascript", body: require("fs").readFileSync(require("path").join(__dirname, "stub-sem-motor.js")) }); }
    if (u.includes("/api/gs")) {
      const { fn, args } = JSON.parse(r.request().postData() || "{}");
      chamadas.push({ fn, args });
      let res = null;
      if (fn === "ESC_painel") { res = structuredClone(planejamento); if (args[2]) res.preenchidas = 3; }
      if (fn === "ESC_salvarEtapa") { tentativa++; res = args[2] ? { ok: true, conflitos: ["Caminhão M também está em Montagem do pedido 2104"] } : (args[1].caminhoes.includes("M") && args[0] === "e3" ? { ok: false, conflitos: ["Caminhão M também está em Montagem do pedido 2104 (09:00)"] } : { ok: true, conflitos: [] }); }
      if(fn==='ESC_salvarEtapa'&&res.ok){Object.assign(planejamento.etapas.find(e=>e.id===args[0]),args[1]);}
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, resultado: res }) });
    }
    if (u.startsWith(BASE)) {
      const f = path.join(raiz, decodeURIComponent(new URL(u).pathname));
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
      return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" });
    }
    return r.abort();
  });
  await page.clock.setFixedTime(new Date('2026-10-20T15:00:00Z'));
  await page.goto(BASE + "Modulos/Logistica/PainelLogistico/painel-logistico.html");
  await page.waitForSelector(".pl-etapa");
  assert.equal(await page.locator('#plTabEquipe .pl-alerta-aba').innerText(), '3'); // nov/2026: conta só o que falta planejar
  assert.equal(await page.locator('#plTabEquipe .pl-alerta-aba').isVisible(), true);
  assert.equal(await page.locator('#plTabEquipe .pl-alerta-aba').evaluate(el=>getComputedStyle(el).animationName), 'none');
  assert.equal(await page.locator('#plDias details').count(), 0);
  assert.equal(await page.locator('#plDias [data-selecionar=e1]').count(), 0);
  assert.equal(await page.locator('[data-dia="2026-10-20"] .pl-pendencia-dia').innerText(), '1'); // pendentes do dia
  assert.equal(await page.locator('#plTabEntrega .pl-alerta-aba').isVisible(), false);
  assert.equal(await page.locator('#plTabColeta .pl-alerta-aba').isVisible(), false);
  const faixaDias=await page.locator('#plAbasDias').boundingBox();
  const bolinhaDia=await page.locator('[data-dia="2026-10-20"] .pl-pendencia-dia').boundingBox();
  const textoDia=await page.locator('[data-dia="2026-10-20"] strong').boundingBox();
  assert.ok(bolinhaDia.y>=faixaDias.y,'indicador inteiro dentro da faixa de datas');
  assert.ok(bolinhaDia.y+bolinhaDia.height<=textoDia.y,'indicador acima do texto da data');
  const abriu = chamadas.find(c => c.fn === "ESC_painel");
  assert.strictEqual(abriu.args[2], false, "abrir não pede para preencher");
  const abasAntes=await page.locator('#plAbasDias [role=tab]').count();assert.ok(abasAntes>=14,'começa com pelo menos 14 dias: '+abasAntes);assert.deepStrictEqual(abriu.args,['2026-10-20',14,false]);
  await page.locator('#plAbasDias').evaluate(n=>{n.scrollLeft=n.scrollWidth;n.dispatchEvent(new Event('scroll'));});
  await page.waitForFunction(n=>document.querySelectorAll('#plAbasDias [role=tab]').length>n,abasAntes);
  assert.ok(chamadas.some(c=>c.fn==='ESC_painel'&&c.args[0]===(abasAntes===14?'2026-11-03':c.args[0])&&c.args[1]===14),'ao chegar no fim pede o bloco seguinte');
  assert.equal(await page.locator('[data-dia="2026-11-10"]').count(),1,'dias além de duas semanas aparecem');
  await page.locator('#plAbasDias').evaluate(n=>{n.scrollLeft=0;});assert.strictEqual(await page.locator('.pl-etapa').count(),2);assert.equal(await page.locator('.pl-planejamento-lista [data-selecionar=e4]').count(),0);await page.locator('[data-dia="2026-10-21"]').click();assert.equal(await page.locator('.pl-planejamento-lista [data-selecionar=e2]').count(),0);await page.locator('[data-selecionar=e4]').waitFor();await page.locator('[data-dia="2026-10-20"]').click();await page.locator('[data-selecionar=e3]').click();
  const e3=page.locator('.pl-planejamento-edicao');assert.equal(await page.locator('.pl-selecao-resumo').count(),0);assert.equal(await e3.locator('.pl-vaga-pessoa').count(),2);assert.equal(await e3.locator('img[alt="Igor Ramos"]').count(),1);assert.ok((await e3.innerText()).includes('Igor Ramos'));assert.equal(await page.locator('#plResumo, .pl-barra, .pl-ajuda').count(),0);assert.equal(await page.locator('.pl-topo #plPreencher').count(),1);assert.equal(await page.locator('[data-dia="2026-10-20"] .pl-pendencia-dia').count(),1);assert.equal(await page.locator('[data-dia="2026-10-21"] .pl-pendencia-dia').count(),1);assert.equal(await page.locator('#plAbasDias small').count(),0);const tabAtiva=page.locator('#plAbasDias [role=tab][aria-selected=true]');assert.equal(await tabAtiva.evaluate(el=>getComputedStyle(el).color),'rgb(22, 101, 52)');assert.equal(await tabAtiva.locator('strong').evaluate(el=>getComputedStyle(el).color),'rgb(38, 49, 68)');const ponto=tabAtiva.locator('.pl-pendencia-dia');assert.equal(await ponto.evaluate(el=>getComputedStyle(el).position),'absolute');assert.ok((await ponto.boundingBox()).y<(await tabAtiva.locator('strong').boundingBox()).y);assert.equal(await page.locator('[role=tab]').first().evaluate(el=>getComputedStyle(el).borderRadius),'0px');assert.equal(await page.locator('[data-aba-recurso]').count(),3);await page.locator('[data-aba-recurso=free]').click();assert.equal(await page.locator('#plRecursoConteudo [data-recurso=equipe]').count(),0);await page.locator('[data-aba-recurso=interna]').click();const livres=await page.locator('.pl-planejamento-recursos').innerText();assert.equal(await page.locator('.pl-planejamento-recursos img[alt="Bruno Lima"]').count(),1);assert.ok(livres.includes('Bruno Lima')&&!livres.includes('Wesley Santos'));await page.locator('[data-aba-recurso=cam]').click();assert.equal(await page.locator('[data-recurso=cam][data-valor=P]').count(),1);if(SAIDA)await page.screenshot({path:SAIDA+'/painel.png',fullPage:true});console.log('OK: seven day tabs, one day only, three columns, selected task and unassigned resources.');

  // tirar alguém da equipe grava na hora
  await e3.locator('button[data-papel="equipe"][data-nome="Igor Ramos"]').click();
  await page.waitForTimeout(300);
  let salvar = chamadas.filter(c => c.fn === "ESC_salvarEtapa").pop();
  assert.equal(await e3.locator('.pl-vaga-pessoa.is-vazia').count(),1);assert.deepStrictEqual(salvar.args.slice(0, 2), ["e3", { responsavel: "Wesley Santos", equipe: [], caminhoes: ["G"] }]);
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
  const opcoesResp = await page.locator('.pl-planejamento-edicao select[data-papel="resp"] option').allTextContents();
  assert.ok(opcoesResp.every(t => !/Igor|Vitor|Thiago/.test(t)), "só líderes: " + opcoesResp);
  console.log("ok 4 - para responsável só aparecem líderes");

  await page.click("#plPreencher");
  await page.waitForTimeout(400);
  assert.deepStrictEqual(chamadas.filter(c => c.fn === "ESC_painel" && c.args[2]).pop().args,["2026-10-20",1,true]);
  assert.ok((await page.locator(".pl-toast").innerText()).includes("3 etapas preenchidas"));
  console.log("ok 5 - 'Preencher vazios' pede ao servidor e avisa quantas preencheu");

  await page.locator('[data-selecionar=e2]').click();await page.locator('[data-recurso=cam][data-valor=P]').click();await page.waitForFunction(()=>!document.querySelector('[data-recurso=cam][data-valor=P]'));assert.ok(chamadas.filter(c=>c.fn==='ESC_salvarEtapa').at(-1).args[1].caminhoes.includes('P'));await page.locator('[data-aba-recurso=interna]').click();await page.locator('[data-recurso=equipe][data-valor="Bruno Lima"]').click();await page.waitForFunction(()=>!document.querySelector('[data-recurso=equipe][data-valor="Bruno Lima"]'));assert.ok(chamadas.filter(c=>c.fn==='ESC_salvarEtapa').at(-1).args[1].equipe.includes('Bruno Lima'));console.log('OK: quick assignment updates the stage and available resource lists.');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(200);
  const largura = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(largura <= 392, "celular sem rolar de lado: " + largura);
  await page.locator('[data-dia="2026-10-22"]').click();await page.locator('[data-selecionar=pre]').click();assert.equal(await page.locator('#plPreencher').isDisabled(),true);
  assert.ok((await page.locator('.pl-planejamento-edicao').textContent()).includes('somente consulta'));
  assert.equal(await page.locator('.pl-planejamento-edicao select,.pl-planejamento-edicao [data-acao="tirar"]').count(),0);
  assert.equal(await page.locator('.pl-planejamento-recursos [data-recurso]:enabled').count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=392));
  assert.deepStrictEqual(erros, []);
  console.log("ok 6 - celular sem rolagem lateral e sem erro de JavaScript");
  planejamento.etapas=[];
  await page.evaluate(()=>window.PainelLogisticoEquipe.iniciar());
  assert.equal(await page.locator('#plTabEquipe .pl-alerta-aba').isVisible(), false);
  assert.equal(await page.locator('#plAbasDias .pl-pendencia-dia').count(), 0);
  console.log('OK: only planning operations appear; all zero indicators are hidden.');
  await page.evaluate(()=>{window.carregarParametrosEscala=async host=>{host.textContent='Parametros da escala';};});
  await page.locator('#plTabParametros').click();
  await page.waitForFunction(()=>document.getElementById('plModuloParametros').textContent==='Parametros da escala');
  assert.equal(await page.locator('#plModuloParametros').isVisible(),true);
  assert.equal(await page.locator('#plAbasDias').isVisible(),false);
  assert.equal(await page.locator('#plModuloEquipe').isVisible(),false);
  await page.locator('#plTabEquipe').click();
  assert.equal(await page.locator('#plModuloParametros').isVisible(),false);
  assert.equal(await page.locator('#plAbasDias').isVisible(),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=392));
  console.log('OK: parameters tab and returning to planning work on mobile.');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
