const fs=require('node:fs'),assert=require('node:assert/strict'),express=require('express'),{chromium}=require('playwright');
(async()=>{
 const app=express();app.get('/preview',(req,res)=>res.send('<html><head><link rel="stylesheet" href="/styles/global.css"><link rel="stylesheet" href="/Modulos/Configuracoes/Parametros/parametros.css"><link rel="stylesheet" href="/Modulos/Estoque/Acervo/acervo-tabela.css"></head><body><section id="pr-painel-acervo"></section><button data-aba="saidas" aria-selected="true">Próximas saídas <span class="tab-badge"></span></button><section id="items"></section></body></html>'));app.use(express.static(process.cwd()));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/preview');
  await page.evaluate(()=>{
   window.saved={};window.readonly=false;window.failSave=false;window.ctx={empresa_id:'company-a'};window.aguardarContexto=async()=>ctx;window.permissionsReady=false;window.EasyLocPermissions={load:async()=>{await new Promise(r=>setTimeout(r,100));permissionsReady=true;},hasPermission:()=>permissionsReady&&!readonly};
   window.supabaseClient={from:table=>{if(table!=='acervo_sinalizacoes_config')throw Error(table);return {select:()=>({eq:(key,company)=>({maybeSingle:async()=>{if(key!=='empresa_id'||company!=='company-a')throw Error('Empresa incorreta');return {data:{regras:saved}};}})}),upsert:async row=>{if(failSave)return {error:{message:'Falha de teste'}};if(row.empresa_id!=='company-a')throw Error('Empresa incorreta');window.saved=row.regras;return {};}};},rpc:async()=>({data:window.fixture})};
   const day=offset=>{const d=new Date();d.setDate(d.getDate()+offset);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};window.day=day;
   window.fixture=[{id:'a',nome:'Cadeira',total:10,manutencao:1,reservado:5,capa:{usa:false},pedidos:[{data:day(3),numero:1,cliente:'Ana',quantidade:5},{data:day(4),numero:2,cliente:'Bia',quantidade:5}]},{id:'b',nome:'Mesa',total:10,manutencao:1,reservado:5,capa:{usa:false},pedidos:[{data:day(8),numero:3,quantidade:5}]}];
  });
  await page.addScriptTag({url:'/js/estoque/acervo-sinalizacoes.js'});await page.addScriptTag({url:'/Modulos/Configuracoes/Parametros/parametros-acervo.js'});
  await page.waitForSelector('[data-sinal=manutencao]');assert.equal(await page.locator('[data-sinal]').count(),10);assert.ok(await page.locator('[data-sinal=manutencao] [name=mostrar]').isEnabled(),'aguarda as permissoes antes de liberar os campos');
  await page.locator('[data-sinal=manutencao] [name=avisar]').selectOption('sim');await page.locator('[data-sinal=manutencao] [name=dias]').fill('7');await page.locator('#acervoSinaisForm button').click();await page.waitForFunction(()=>saved.manutencao?.dias===7);
  await page.addScriptTag({url:'/Modulos/Estoque/Acervo/acervo-saidas.js'});
  await page.evaluate(async()=>{window.testCtx={host:document.getElementById('items'),esc:v=>String(v??''),empresa:'company-a',sb:supabaseClient};await AcervoSaidas.contar(testCtx);await AcervoSaidas.render(testCtx);});
  await page.waitForFunction(()=>document.querySelector('.tab-badge').textContent==='1');assert.equal(await page.locator('.tab-badge').evaluate(e=>getComputedStyle(e).animationName),'sa-aviso-piscar');
  assert.match(await page.locator('#items').innerText(),/em manutenção/);
  await page.locator('[data-sinal=manutencao] [name=mostrar]').uncheck();assert.ok(await page.locator('[data-sinal=manutencao] [name=dias]').isDisabled());await page.locator('#acervoSinaisForm button').click();
  await page.evaluate(async()=>{await AcervoSaidas.contar(testCtx);await AcervoSaidas.render(testCtx);});assert.equal(await page.locator('.tab-badge').innerText(),'');assert.doesNotMatch(await page.locator('#items').innerText(),/em manutenção/);
  await page.locator('[data-sinal=manutencao] [name=mostrar]').check();await page.locator('[data-sinal=manutencao] [name=dias]').fill('0');await page.locator('#acervoSinaisForm button').click();await page.evaluate(()=>AcervoSaidas.contar(testCtx));assert.equal(await page.locator('.tab-badge').innerText(),'');
  await page.evaluate(()=>fixture[0].pedidos[0].data=day(0));await page.evaluate(()=>AcervoSaidas.contar(testCtx));assert.equal(await page.locator('.tab-badge').innerText(),'1');
  await page.locator('[data-sinal=manutencao] [name=dias]').fill('366');assert.equal(await page.locator('[data-sinal=manutencao] [name=dias]').evaluate(e=>e.checkValidity()),false);
  await page.locator('[data-sinal=manutencao] [name=dias]').fill('2');await page.evaluate(()=>failSave=true);await page.locator('#acervoSinaisForm button').click();await page.waitForFunction(()=>document.querySelector('#acervoSinaisForm [role=status]').textContent.includes('Falha de teste'));assert.equal(await page.evaluate(()=>saved.manutencao.dias),0);
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.tab-badge').evaluate(e=>getComputedStyle(e).animationName),'none');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('#pr-painel-acervo').evaluate(e=>e.scrollWidth<=e.clientWidth));
  await page.evaluate(()=>{readonly=true;document.querySelector('[data-sinal=manutencao] [name=mostrar]').dispatchEvent(new Event('change',{bubbles:true}));});assert.ok(await page.locator('[data-sinal=manutencao] [name=mostrar]').isDisabled());
  assert.deepEqual(errors,[]);console.log('OK: parâmetros por empresa, salvar/erro, sinais filtrados, antecedência 0/7 dias, item sem duplicação, piscar e acessibilidade, layout móvel.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
