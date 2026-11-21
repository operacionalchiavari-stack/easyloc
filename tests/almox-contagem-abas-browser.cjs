const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE='http://localhost:5642/';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1100}}),erros=[];
  page.on('pageerror',e=>erros.push(e.message));
  await page.addInitScript(()=>{
   window.__CONTEXT={empresa_id:'demo-teste',usuario_id:'pessoa-real',usuario_nome:'Teste'};sessionStorage.setItem('empresa_id','demo-teste');window.aguardarContexto=async()=>__CONTEXT;window.lucide={createIcons(){}};window.__realCalls=[];
   window.EasyLocPermissions={hasPermission:()=>true};
   window.supabaseClient={from(nome){__realCalls.push(nome);throw Error('A simulação tentou acessar o banco real: '+nome);},rpc(nome){__realCalls.push(nome);throw Error('A simulação tentou executar uma RPC real: '+nome);}};
  });
  await page.route('**/*',r=>{
   const u=r.request().url();if(!u.startsWith(BASE))return r.abort();const pathname=decodeURIComponent(new URL(u).pathname);
   if(/\/js\/core\//.test(pathname))return r.fulfill({body:'',contentType:'text/javascript'});
   const f=path.join(process.cwd(),pathname);if(!fs.existsSync(f)||!fs.statSync(f).isFile())return r.fulfill({status:404,body:''});
   return r.fulfill({body:fs.readFileSync(f),contentType:{'.css':'text/css','.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.jpg':'image/jpeg','.svg':'image/svg+xml'}[path.extname(f)]||'application/octet-stream'});
  });
  await page.goto(BASE+'Modulos/Almoxarifado/almoxarifado.html');
  await page.waitForSelector('#almoxContent:not(.hidden)',{timeout:30000});
  assert.match(await page.locator('#materialsResultCount').innerText(),/48/);
  assert.match(await page.locator('#almoxDemoToggle').innerText(),/Simulação/);
  await page.locator('[data-tab=count]').click();
  await page.waitForSelector('#countBlindList tr');
  const history=page.locator('.count-history-table');
  assert.equal(await history.locator('thead th').count(),8);
  assert.match(await history.locator('thead th').nth(3).innerText(),/Data de conclus/);
  assert.equal(await history.locator('tbody tr').first().locator('td').nth(2).locator('img').count(),1);
  assert.match(await history.locator('tbody tr').first().locator('td').nth(2).innerText(),/Mariana Costa/);
  assert.match(await history.locator('tbody tr').first().locator('td').nth(3).innerText(),/12\/10\/2026/);
  const qty=page.locator('#countBlindList .count-qty-input').first();
  await qty.fill('3');
  for(const tab of ['aprovacao','bateu','divergencias']){
   await page.locator('[data-count-result-tab='+tab+']').click();
   assert.equal(await page.locator('[data-count-result-panel='+tab+']').isVisible(),true);
   assert.equal(await page.locator('[data-count-result-panel]:visible').count(),1);
   assert.equal(await qty.inputValue(),'3','trocar abas preserva contagem digitada');
  }
  await page.locator('[data-count-result-tab=divergencias]').press('ArrowRight');
  assert.equal(await page.locator('[data-count-result-tab=aprovacao]').getAttribute('aria-selected'),'true');
  await page.locator('[data-count-result-tab=divergencias]').click();
  await page.locator('[data-count-item=demo-contagem-1] [data-count-justification]').selectOption('Erro de registro na entrada');
  await page.locator('[data-count-justify=demo-contagem-1]').click();
  await page.waitForFunction(()=>document.querySelector('#count-result-aprovacao [data-count-item="demo-contagem-1"]'));
  await page.locator('[data-count-result-tab=aprovacao]').click();
  await page.locator('[data-count-item=demo-contagem-1] [data-count-review=approve]').click();
  await page.waitForFunction(()=>!document.querySelector('#count-result-aprovacao [data-count-item="demo-contagem-1"]'));
  for(const width of [1920,1600,1366,1024,390]){
   await page.setViewportSize({width,height:1100});
   const boxes=await page.locator('#countTab .count-cards').evaluate(el=>({todo:el.querySelector('.is-todo').getBoundingClientRect().toJSON(),results:el.querySelector('.count-results').getBoundingClientRect().toJSON(),history:el.querySelector('.is-history').getBoundingClientRect().toJSON()}));
   assert.equal(Math.round(boxes.todo.height),560);assert.equal(Math.round(boxes.results.height),560);
   if(width>=1366){assert.equal(Math.round(boxes.todo.y),Math.round(boxes.results.y));assert.ok(Math.abs(boxes.todo.bottom-boxes.results.bottom)<2,'fim alinhado aos botoes');}
   assert.ok(boxes.history.top>=Math.max(boxes.todo.bottom,boxes.results.bottom));
   for(const tab of ['divergencias','aprovacao','bateu']){
    await page.locator('[data-count-result-tab='+tab+']').click();
    assert.equal(await page.locator('.count-result-panels').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'painel sem barra horizontal '+width+' '+tab);
    await page.screenshot({path:'.tmp/almox-contagem-abas-'+width+'-'+tab+'.png'});
   }
   assert.equal(await history.locator('..').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'historico sem barra horizontal '+width);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await page.evaluate(()=>{materials.forEach(item=>countCycle.set(item.id,{material_id:item.id,liberado:false}));warehouseData.contagens=[];rerenderCountTab();});
  await page.locator('[data-count-result-tab=aprovacao]').click();
  assert.equal(await page.locator('#countBlindListWrap').count(),0);
  for(const width of [1366,390]){
   await page.setViewportSize({width,height:1100});
   for(const selector of ['.count-cards>.is-todo','.count-cards>.count-results'])assert.equal(await page.locator(selector).evaluate(el=>Math.round(el.getBoundingClientRect().height)),560,'altura fixa mesmo vazio');
   await page.screenshot({path:'.tmp/almox-contagem-altura-vazia-'+width+'.png'});
  }
  assert.deepEqual(erros,[]);console.log('OK: abas de resultados, justificativa e aprovacao, altura alinhada, historico abaixo e sem barra horizontal.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
