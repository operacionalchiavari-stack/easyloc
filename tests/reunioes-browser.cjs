// Reuniões (nov/2026): agenda, convite, ata, transcrição, pergunte à reunião e gravação de verdade (microfone simulado do
// navegador) até a ata — com o Supabase simulado. Rodar: node tests/reunioes-browser.cjs
const { chromium } = require("playwright"), fs = require("fs"), path = require("path"), assert = require("assert/strict");
const RAIZ = path.resolve(__dirname, ".."), BASE = "http://localhost:9941/";
const tipos = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const SAIDA = process.env.REUNIOES_PRINTS || "";

const MOCK = `(function(){
const agora=Date.now(), h=(x)=>new Date(agora+x*3600e3).toISOString();
const P=(id,nome,extra)=>Object.assign({id:'p-'+id,funcionario_id:id,nome,resposta:'confirmado',presente:null,externo:false,tem_voz:id!=='u3',setor:'Comercial'},extra||{});
const R=[
 {id:'r1',titulo:'Alinhamento da semana',tipo:'Alinhamento semanal',inicio:h(2),duracao_min:60,local:'Sala de reunião',link:'meet.google.com/abc',visibilidade:'participantes',status:'agendada',organizador_id:'u2',organizador_nome:'Larissa Marques',sou_organizador:false,minha_resposta:'pendente',gravacao_segundos:0,partes:0,tarefas_abertas:0,
  participantes:[P('u2','Larissa Marques'),P('u1','Igor Ramos',{resposta:'pendente'}),P('u3','João Pedro',{resposta:'talvez'})],pauta:'Eventos do fim de semana\\nFrota',pode_editar:true,pode_aprovar:false,partes_lista:[],tarefas:[]},
 {id:'r2',titulo:'Comercial · fechamento de outubro',tipo:'Comercial',inicio:h(-30),duracao_min:45,visibilidade:'confidencial',status:'realizada',organizador_id:'u1',organizador_nome:'Igor Ramos',sou_organizador:true,minha_resposta:'confirmado',ata_status:'rascunho',gravacao_segundos:610,partes:2,tarefas_abertas:1,
  participantes:[P('u1','Igor Ramos',{presente:true}),P('u2','Larissa Marques',{presente:true}),{id:'p-x',funcionario_id:null,nome:'Fornecedor X',externo:true,resposta:'pendente'}],
  pode_editar:true,pode_aprovar:true,ata:{resumo:'A equipe fechou outubro acima da meta e decidiu reforçar a frota em dezembro.',gerada_por_ia:true,topicos:[{titulo:'Resultado de outubro',minuto:'00:40',pontos:['Faturamento 12% acima da meta','Dois cancelamentos por chuva']}],decisoes:['Alugar um caminhão extra em dezembro'],pendencias:['Definir o fornecedor do caminhão'],destaques:[{quem:'Larissa Marques',frase:'Dezembro vai ser o maior mês do ano.',minuto:'05:12'}],proxima_reuniao:'Segunda que vem, 9h'},
  partes_lista:[{id:'pa1',ordem:1,path:'e1/r2/parte-1.webm',segundos:300,transcrita:true,transcricao:[{quem:'Igor Ramos',id:'u1',ini:3,texto:'Bom dia, vamos começar.'},{quem:'Larissa Marques',id:'u2',ini:9,texto:'Outubro foi muito bom.'}]},{id:'pa2',ordem:2,path:'e1/r2/parte-2.webm',segundos:310,transcrita:true,transcricao:[{quem:'Participante A',ini:2,texto:'E o caminhão?'}]}],
  tarefas:[{id:'t1',descricao:'Cotar caminhão extra',responsavel_id:'u1',responsavel_nome:'Igor Ramos',prazo:'2026-11-20',concluida:false,origem:'ia'}]},
];
const pessoas=[{id:'u1',nome:'Igor Ramos',setor:'Comercial',tem_voz:true},{id:'u2',nome:'Larissa Marques',setor:'Administrativo',tem_voz:true},{id:'u3',nome:'João Pedro',setor:'Montagem',tem_voz:false},{id:'u4',nome:'Kauã Lima',setor:'Montagem',tem_voz:false}];
window.__CONTEXT={empresa_id:'e1',usuario_id:'u1',usuario_nome:'Igor Ramos'};window.aguardarContexto=async()=>window.__CONTEXT;
window.EasyLocPermissions={load:async()=>{},canNavigate:()=>true,guardPage:()=>{},hasPermission:()=>true};
window.__alertas=[];window.alerta=(m,t,v)=>window.__alertas.push({m,v});window.confirmarGlobal=async()=>true;window.__rpc=[];window.__ia=[];window.__up=[];
const lista=()=>R.map(r=>JSON.parse(JSON.stringify(r)));
window.supabaseClient={auth:{getUser:async()=>({data:{user:{id:'u1'}}})},
 storage:{from:b=>({upload:async(p,blob)=>{window.__up.push({b,p,size:blob.size});return{error:null};},remove:async()=>({}),createSignedUrl:async(p)=>({data:{signedUrl:'data:audio/webm;base64,'}}),getPublicUrl:p=>({data:{publicUrl:''}})})},
 rpc:async(n,a)=>{window.__rpc.push({n,a});
  if(n==='reunioes_listar')return{data:lista()};
  if(n==='reuniao_obter'){const r=R.find(x=>x.id===a.p_id);return r?{data:JSON.parse(JSON.stringify(r))}:{error:{message:'não achou'}};}
  if(n==='reunioes_pessoas')return{data:pessoas};
  if(n==='reunioes_minhas_tarefas')return{data:[{id:'t1',descricao:'Cotar caminhão extra',prazo:'2026-11-20',reuniao_id:'r2',reuniao_titulo:'Comercial · fechamento de outubro'}]};
  if(n==='reuniao_voz_obter')return{data:{tem_voz:false,pode_editar:true}};
  if(n==='reuniao_responder'){R[0].participantes[1].resposta=a.p_resposta;R[0].minha_resposta=a.p_resposta;return{data:null};}
  if(n==='reuniao_salvar'){window.__salvo=a.p_dados;const id='r9';R.push({...R[0],id,titulo:a.p_dados.titulo,organizador_id:'u1',sou_organizador:true,minha_resposta:'confirmado',inicio:new Date(a.p_dados.inicio).toISOString(),participantes:[P('u1','Igor Ramos'),...a.p_dados.participantes.filter(x=>x.funcionario_id).map(x=>P(x.funcionario_id,pessoas.find(p=>p.id===x.funcionario_id).nome,{resposta:'pendente'}))],pode_aprovar:true,partes_lista:[]});return{data:{id,criadas:1}};}
  if(n==='reuniao_status'){const r=R.find(x=>x.id===a.p_id);r.status=a.p_status;return{data:null};}
  if(n==='reuniao_parte_registrar'){const r=R.find(x=>x.id===a.p_id);r.partes_lista.push({id:'np'+a.p_ordem,ordem:a.p_ordem,path:a.p_path,segundos:a.p_segundos,transcrita:false});r.partes=r.partes_lista.length;r.gravacao_segundos=(r.gravacao_segundos||0)+a.p_segundos;return{data:'np'+a.p_ordem};}
  return{data:null};},
 functions:{invoke:async(n,o)=>{const b=o.body;window.__ia.push(b);await new Promise(r=>setTimeout(r,120));
  if(b.acao==='transcrever_parte'){const r=R.find(x=>x.id===b.reuniao_id);const p=r.partes_lista.find(x=>x.id===b.parte_id);if(p){p.transcrita=true;p.transcricao=[{quem:'Igor Ramos',id:'u1',ini:0,texto:'Teste de gravação.'}];}return{data:{segmentos:1,vozes:1}};}
  if(b.acao==='gerar_ata'){const r=R.find(x=>x.id===b.reuniao_id);r.ata={resumo:'Reunião de teste gravada.',gerada_por_ia:true,topicos:[],decisoes:['Seguir com o plano'],pendencias:[],destaques:[]};r.ata_status='rascunho';r.status='realizada';return{data:{ok:true,tarefas:0}};}
  if(b.acao==='perguntar')return{data:{resposta:'Ficou decidido alugar um caminhão extra em dezembro [05:12].'}};
  return{data:{erro:'?'}};}}};
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 960 }, permissions: ["microphone", "clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage(), erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_/.test(m.text())) erros.push(m.text()); });
  await page.route(BASE + "**", (r) => {
    const u = new URL(r.request().url()), f = path.join(RAIZ, decodeURIComponent(u.pathname));
    if (/supabase\.js$|context\.js$|permissions\.js$|limpezaDados\.js$|companyTheme\.js$/.test(u.pathname)) return r.fulfill({ contentType: "text/javascript", body: u.pathname.endsWith("/supabase.js") ? MOCK : "" });
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: tipos[path.extname(f)] || "text/plain", body: fs.readFileSync(f) });
  });
  await page.route("https://cdn.jsdelivr.net/**", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
  try {
    await page.goto(BASE + "Modulos/Gestao/Reunioes/reunioes.html");
    await page.waitForSelector(".rn-agenda", { timeout: 8000 }).catch((e) => { console.log(erros); throw e; });
    // abas: Próximas aberta, bolinha de convites; cabeçalho com pesquisa, título no centro e Nova reunião na mesma linha
    assert.equal(await page.locator("#rnQtdConvites").textContent(), "1", "bolinha de convites");
    assert.equal(await page.locator('.rn-abas-top [aria-selected="true"]').getAttribute("data-vista"), "proximas");
    assert.equal(await page.locator(".rn-hero").count(), 0, "sem o destaque azul");
    assert.equal(await page.locator(".rn-numeros").count(), 0, "sem os cartões de números");
    const vb = await page.locator(".rn-agenda").boundingBox(); assert.ok(vb.width > 1400, "usa a largura da tela: " + vb.width);
    assert.equal(await page.locator("#rnMinhaVoz, #rnVozLado").count(), 0, "cadastro de voz não fica nesta tela");
    const [hb, ht, hn] = [await page.locator(".rn-busca").boundingBox(), await page.locator(".rn-header h1").boundingBox(), await page.locator("#rnNova").boundingBox()];
    assert.ok(Math.abs((hb.y + hb.height / 2) - (ht.y + ht.height / 2)) < 12 && Math.abs((hn.y + hn.height / 2) - (ht.y + ht.height / 2)) < 12, "pesquisa, título e botão na mesma linha");
    const vw = await page.evaluate(() => innerWidth);
    assert.ok(Math.abs(ht.x + ht.width / 2 - vw / 2) < 20, "título no centro da tela");
    assert.ok(hb.x >= 20, "respiro na borda esquerda: " + hb.x);
    assert.ok(await page.locator(".rn-linha").count() >= 1, "lista das próximas por dia");
    assert.equal(await page.locator('.rn-abas-top [data-vista="calendario"]').count(), 0, "calendário fica dentro de Próximas");
    assert.ok(await page.locator(".rn-agenda .rn-cevt").count() >= 1, "reunião aparece no calendário do mês");
    const [cb, lb] = [await page.locator(".rn-calendario").boundingBox(), await page.locator(".rn-agenda-lista").boundingBox()];
    assert.ok(cb.x + cb.width <= lb.x + 2, "calendário ao lado da lista");
    const diaR2 = await page.locator('.rn-cevt[data-abrir="r2"]').evaluate((b) => b.closest("[data-cdia]").dataset.cdia);
    await page.click(`[data-cdia="${diaR2}"] .rn-cdia-num`);
    await page.waitForSelector('.rn-agenda-lista .rn-linha[data-abrir="r2"]');
    assert.equal(await page.locator('.rn-agenda-lista .rn-linha[data-abrir="r1"]').count(), 0, "escolher o dia filtra a lista");
    await page.click("[data-dia-todas]");
    if (SAIDA) await page.screenshot({ path: path.join(SAIDA, "reunioes-calendario.png") });
    await page.click('.rn-abas-top [data-vista="convites"]');
    await page.waitForSelector(".rn-rsvp-mini");
    if (SAIDA) await page.screenshot({ path: path.join(SAIDA, "reunioes-convites.png") });
    await page.click('.rn-abas-top [data-vista="proximas"]');
    if (SAIDA) await page.screenshot({ path: path.join(SAIDA, "reunioes-inicio.png") });
    // Minhas tarefas é uma sub-aba da coluna da direita das Próximas (não é mais aba do topo)
    assert.equal(await page.locator('.rn-abas-top [data-vista="tarefas"]').count(), 0, "Minhas tarefas saiu do topo");
    await page.click('.rn-lado-abas [data-lado="tarefas"]');
    await page.waitForSelector(".rn-agenda-lista .rn-tarefas-vista .rn-tarefa");
    assert.equal(await page.locator(".rn-calendario").count(), 1, "calendário continua ao lado das tarefas");
    if (SAIDA) await page.screenshot({ path: path.join(SAIDA, "reunioes-tarefas.png") });
    await page.click('.rn-lado-abas [data-lado="reunioes"]');
    await page.waitForSelector(".rn-agenda-lista .rn-linha");
    console.log("ok 1 abas, cabeçalho numa linha, calendário e convites");

    await page.click('.rn-linha[data-abrir="r1"]');
    await page.waitForSelector(".rn-rsvp");
    const [c, d] = [await page.locator(".rn-centro").boundingBox(), await page.locator(".rn-dir").boundingBox()];
    assert.ok(c.x + c.width <= d.x + 2, "reunião e convidados lado a lado");
    await page.click('[data-rsvp="confirmado"]');
    await page.waitForFunction(() => document.querySelector('[data-rsvp="confirmado"]')?.classList.contains("on"));
    assert.equal(await page.locator("#rnQtdConvites").isHidden(), true, "respondido sai dos convites");
    assert.equal(await page.locator(".rn-pessoa").count(), 3);
    assert.equal(await page.locator(".rn-mic.sem").count(), 1, "quem não tem voz aparece apagado");
    console.log("ok 2 responder ao convite");

    await page.click("#rnVoltar");
    await page.click('.rn-abas-top [data-vista="realizadas"]');
    await page.click('.rn-linha[data-abrir="r2"]');
    await page.waitForSelector(".rn-resumo");
    assert.match(await page.locator(".rn-resumo").textContent(), /acima da meta/);
    assert.equal(await page.locator(".rn-decisoes li").count(), 1);
    assert.equal(await page.locator(".rn-tarefa").count(), 1);
    assert.equal(await page.locator('[data-ata="aprovar"]').count(), 1, "organizador aprova");
    await page.click('[data-sug="O que ficou decidido?"]');
    await page.waitForFunction(() => /caminhão extra/.test(document.querySelector(".rn-resposta")?.textContent || ""));
    if (SAIDA) await page.screenshot({ path: path.join(SAIDA, "reunioes-ata.png"), fullPage: true });
    await page.click('.rn-tabs [data-aba="transcricao"]');
    await page.waitForSelector(".rn-fala");
    assert.equal(await page.locator(".rn-fala").count(), 3);
    assert.match(await page.locator(".rn-fala time").nth(2).textContent(), /05:02/, "minuto soma as partes anteriores");
    await page.fill("[data-trans-busca]", "caminhão");
    assert.equal(await page.locator(".rn-fala:visible").count(), 1, "procura na conversa");
    console.log("ok 3 ata, tarefas, pergunte à reunião e transcrição");

    // nova reunião com convidados
    await page.click("#rnNova");
    await page.fill('[name="titulo"]', "Planejamento de dezembro");
    await page.click("[data-picker]"); await page.keyboard.type("joa");
    await page.waitForSelector('[data-poe="u3"]'); await page.keyboard.press("Enter");
    await page.click('[data-setor="Montagem"]');
    await page.fill("[data-ext-nome]", "Consultor Y"); await page.click("[data-ext-add]");
    await page.click('.rn-vis label:has([value="confidencial"])');
    if (SAIDA) await page.screenshot({ path: path.join(SAIDA, "reunioes-nova.png") });
    await page.click('#rnDialog [type="submit"]');
    await page.waitForFunction(() => window.__salvo);
    const salvo = await page.evaluate(() => window.__salvo);
    assert.equal(salvo.visibilidade, "confidencial");
    assert.deepEqual(salvo.participantes.filter((p) => p.funcionario_id).map((p) => p.funcionario_id).sort(), ["u3", "u4"]);
    assert.equal(salvo.participantes.find((p) => p.nome)?.nome, "Consultor Y");
    assert.match(salvo.inicio, /T\d\d:\d\d:00-03:00$/);
    await page.waitForSelector(".rn-grav");
    console.log("ok 4 marcar reunião com convidados, setor e externo");

    // grava de verdade (microfone simulado) e gera a ata
    await page.click('[data-g="gravar"]');
    await page.waitForSelector(".rn-grav.gravando #rnOnda");
    await page.waitForTimeout(2600);
    assert.match(await page.locator("#rnTempo").textContent(), /00:0[2-4]/, "cronômetro anda");
    if (SAIDA) await page.screenshot({ path: path.join(SAIDA, "reunioes-gravando.png") });
    await page.click('[data-g="pausar"]'); await page.waitForTimeout(800);
    const t1 = await page.locator("#rnTempo").textContent(); await page.waitForTimeout(1200);
    assert.equal(await page.locator("#rnTempo").textContent(), t1, "pausado não conta");
    await page.click('[data-g="continuar"]'); await page.waitForTimeout(2800);
    await page.click('[data-g="encerrar"]');
    await page.waitForFunction(() => window.__ia.some((b) => b.acao === "gerar_ata"), null, { timeout: 15000 }).catch(async (e) => { console.log(await page.evaluate(() => JSON.stringify({ ia: window.__ia, rpc: window.__rpc.map((c) => c.n).slice(-8), al: window.__alertas, up: window.__up }))); console.log(erros); throw e; });
    await page.waitForSelector(".rn-resumo");
    const up = await page.evaluate(() => window.__up);
    assert.equal(up.length, 1); assert.match(up[0].p, /^e1\/r9\/parte-1-\d+\.(webm|ogg|m4a)$/); assert.ok(up[0].size > 1500, "áudio de verdade");
    const reg = await page.evaluate(() => window.__rpc.find((c) => c.n === "reuniao_parte_registrar").a);
    assert.ok(reg.p_segundos >= 4 && reg.p_segundos <= 8, "segundos sem o tempo pausado: " + reg.p_segundos);
    assert.equal((await page.evaluate(() => window.__ia.filter((b) => b.acao === "transcrever_parte"))).length, 1, "transcreve uma vez só");
    console.log("ok 5 gravar, pausar, encerrar e a ata sai sozinha");

    // celular
    await page.setViewportSize({ width: 390, height: 840 });
    await page.waitForTimeout(200);
    const larg = await page.evaluate(() => document.documentElement.scrollWidth);
    if (larg > 392) console.log(await page.evaluate(() => [...document.querySelectorAll("#acervo-reunioes *")].filter((e) => e.getBoundingClientRect().right > 392).slice(0, 8).map((e) => e.tagName + "." + e.className + " " + (e.textContent || "").slice(0, 30) + " " + Math.round(e.getBoundingClientRect().right))));
    assert.ok(larg <= 392, "sem rolagem lateral no celular: " + larg);
    console.log("ok 6 celular sem rolagem lateral");
    assert.deepEqual(erros, [], "sem erros de JavaScript");
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
