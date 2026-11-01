const {chromium}=require('playwright'),express=require('express'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const regras=require('../js/shared/complexidade');
const contexto={id:'00000000-0000-0000-0000-000000000030',numero:'101',data_evento:'2026-11-04',cliente_nome:'Cliente de teste',local_nome:'Local de teste',tipo_evento:'Casamento',config:regras.padrao(),cliente:{complexidade:{reclamacao:false}},pedidos_anteriores:1,local:{complexidade:{baldeacao:false,escada:true,distancia_manual_m:20}},caminhoes:1,carregamento:{data:'2026-11-02',hora:'09:00:00'},montagem:{data:'2026-11-04',hora:'10:00:00'},confirmado_em:'2026-10-30T10:00:00-03:00',excecoes:{viagens:1},itens:[{item_id:'a',familia:'Sofás',complexidade:{sob_medida:false,volumoso:true}}],pecas:[{item_id:'a',quantidade:5,complexidade:{fragil:false}}],servicos:[]};
(async()=>{
 const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const width of [390,1360]){
  const page=await browser.newPage({viewport:{width,height:950},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.fulfill({body:''}));await page.route('**/gas-cliente.js*',r=>r.fulfill({body:''}));await page.route('**/js/core/supabase.js*',r=>r.fulfill({body:''}));
  await page.addInitScript(c=>{
   localStorage.setItem('easyloc:limpeza-dados','20261026-zerado');sessionStorage.setItem('painel_complexidade_acesso_ate',String(Date.now()+600000));
   window.__CONTEXT={empresa_id:'empresa'};window.__contexto=c;window.__writes=[];window.__lista=[];
   function runner(ok,no){return new Proxy({},{get:(_,fn)=>fn==='withSuccessHandler'?f=>runner(f,no):fn==='withFailureHandler'?f=>runner(ok,f):(...args)=>Promise.resolve().then(()=>{
    if(fn==='listarPedidos'){const p=CXRegras.paraPainel(window.__contexto);p.planejamento=window.__contexto.excecoes;window.__lista=[p];return [p];}
    if(fn==='validarSenhaPlanilha')return true;return [];
   }).then(r=>ok?.(r)).catch(e=>no?.(e))});}
   window.google={script:{run:runner()}};
   window.supabaseClient={auth:{getSession:async()=>({data:{session:{user:{id:'gestor'}}}})},rpc:async(nome,args)=>{
    if(nome==='complexidade_salvar_excecoes'){window.__writes.push({nome,args});window.__contexto.excecoes={...args.p_dados,respostas:Object.fromEntries(Object.entries(args.p_dados.respostas).map(([k,v])=>[k,{valor:v,motivo:args.p_motivo}]))};}
    return {data:null,error:null};
   }};
  },contexto);
  await page.goto(`http://127.0.0.1:${server.address().port}/Modulos/Chiavari/Costura/costura.html`);
  await page.locator('#listaPedidos tbody tr').waitFor();assert.match(await page.locator('#listaPedidos .score').textContent(),/\d+(,\d+)?%/);assert.equal(await page.locator('#listaPedidos .cx-score-legenda').textContent(),'Dificuldade mínima');assert.doesNotMatch(await page.locator('#listaPedidos').textContent(),/Não se aplica/);
  await page.locator('#btnPintura').click();assert.equal(await page.locator('#listaPedidos .cx-score-legenda').textContent(),'Dificuldade mínima');
  await page.locator('#listaPedidos tbody tr').click();await page.locator('.cx-auto-dialog[open]').waitFor();assert.match(await page.locator('.cx-auto-scores').textContent(),/Dificuldade mínima/);assert.doesNotMatch(await page.locator('.cx-auto-scores').textContent(),/Não se aplica/);await page.getByRole('button',{name:'Fechar análise',exact:true}).click();
  await page.locator('#btnPersonalizacao').click();
  await page.getByRole('searchbox',{name:'Filtrar cliente ou local',exact:true}).click();await page.getByRole('searchbox',{name:'Filtrar cliente ou local',exact:true}).fill('Local de teste');assert.equal(await page.locator('#listaPedidos tbody tr').count(),1);
  await page.getByRole('searchbox',{name:'Filtrar cliente ou local',exact:true}).fill('Cliente de teste');assert.equal(await page.locator('#listaPedidos tbody tr').count(),1);
  await page.getByRole('searchbox',{name:'Filtrar cliente ou local',exact:true}).fill('');
  if(width>1100){assert.ok(await page.locator('.cx-cabecalho-linha').evaluate(e=>{const [a,b,c]=[...e.children].map(x=>x.getBoundingClientRect());return a.right<b.left&&b.right<c.left&&Math.abs((b.left+b.right)/2-innerWidth/2)<3;}));}
  assert.equal(await page.getByRole('button',{name:'Limpar',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Atualizar dados',exact:true}).count(),0);assert.equal(await page.locator('.cx-automacao-ajuda').count(),0);
  await page.screenshot({path:path.join(os.tmpdir(),`complexidade-cabecalho-${width}.png`)});
  await page.locator('#btnMontagem').click();
  assert.match(await page.locator('#listaPedidos .score').textContent(),/\d+(,\d+)?%/);assert.equal(await page.locator('#listaPedidos .cx-score-legenda').textContent(),'');
  await page.evaluate(async()=>{__contexto.cliente={};pedidos=await new Promise(ok=>google.script.run.withSuccessHandler(ok).listarPedidos());render();});
  assert.match(await page.locator('#listaPedidos .score').textContent(),/%.*%/);assert.match(await page.locator('#listaPedidos .cx-score-legenda').textContent(),/Parcial/);
  assert.match(await page.locator('#listaPedidos .score').getAttribute('title'),/Faixa possível/);
  await page.locator('#listaPedidos tbody tr').click();await page.locator('.cx-auto-dialog[open]').waitFor();
  assert.match(await page.locator('.cx-auto-scores').textContent(),/Parcial/);assert.equal(await page.locator('[data-cx-pendente="true"]').count(),1);
  await page.getByRole('button',{name:'Fechar análise',exact:true}).click();
  await page.screenshot({path:path.join(os.tmpdir(),`complexidade-score-parcial-${width}.png`)});
  await page.evaluate(async()=>{__contexto.cliente={complexidade:{reclamacao:false}};pedidos=await new Promise(ok=>google.script.run.withSuccessHandler(ok).listarPedidos());render();});
  await page.locator('#listaPedidos tbody tr').click();await page.locator('.cx-auto-dialog[open]').waitFor();
  assert.equal(await page.locator('[data-cx-resposta]').count(),26);assert.match(await page.locator('.cx-auto-dialog').textContent(),/Cadastro do local/);
  assert.equal(await page.locator('#cxSemPendencias').isVisible(),true);await page.locator('#cxMostrarTodas').check();
  await page.locator('[data-cx-resposta="16"]').selectOption('false');await page.locator('[name=motivo]').fill('Neste evento a montagem acontece no térreo');
  await page.getByRole('button',{name:'Salvar ajustes do pedido',exact:true}).click();await page.waitForFunction(()=>document.getElementById('cxAutoStatus').textContent.includes('recalculados'));
  const saved=await page.evaluate(()=>__writes[0]);assert.equal(saved.args.p_empresa,'empresa');assert.equal(saved.args.p_dados.respostas[16],false);assert.equal(saved.args.p_dados.viagens,1);
  assert.match(await page.locator('.cx-auto-dialog').textContent(),/Exceção do pedido/);assert.ok(await page.locator('.cx-auto-dialog').evaluate(e=>e.getBoundingClientRect().width<=innerWidth));
  await page.screenshot({path:path.join(os.tmpdir(),`complexidade-automatica-${width}.png`)});
  await page.getByRole('button',{name:'Fechar análise',exact:true}).click();
  await page.getByRole('button',{name:'Painel',exact:true}).click();await page.locator('#painelCX.aberto').waitFor();
  assert.match(await page.locator('#cxSubtitulo').textContent(),/pendentes ficam fora/);
  assert.equal(await page.locator('#painelCX svg').evaluateAll(els=>els.some(e=>/NaN/.test(e.outerHTML))),false);
  await page.evaluate(()=>PainelCX.fechar());
  await page.evaluate(async()=>{__contexto.local={};__contexto.excecoes={viagens:1,montagem_aplica:false};pedidos=await new Promise(ok=>google.script.run.withSuccessHandler(ok).listarPedidos());render();});await page.locator('#listaPedidos tbody tr').click();
  await page.locator('.cx-auto-dialog[open]').waitFor();assert.match(await page.locator('.cx-auto-scores').textContent(),/Dificuldade mínima/);assert.equal(await page.locator('#cxSemPendencias').isVisible(),true);assert.equal(await page.locator('[data-cx-pendente="true"]').count(),0);
  await page.getByRole('button',{name:'Fechar análise',exact:true}).click();
  await page.evaluate(async()=>{__contexto.congelado_em='2026-11-05T10:00:00Z';pedidos=await new Promise(ok=>google.script.run.withSuccessHandler(ok).listarPedidos());render();});await page.locator('#listaPedidos tbody tr').click();
  await page.locator('.cx-auto-dialog[open]').waitFor();assert.equal(await page.getByRole('button',{name:'Salvar ajustes do pedido',exact:true}).count(),0);assert.equal(await page.locator('[data-cx-resposta="16"]').isDisabled(),true);
  assert.deepEqual(errors,[]);await page.close();console.log(`Complexidade ${width}px: fontes, exceções, gráficos e histórico congelado OK.`);
 }}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
