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
  await page.locator('[data-tab=movements]').click();
  await page.waitForSelector('.history-row');
  const total=await page.locator('.history-row').count();
  await page.locator('[data-history-type=consumo]').click();
  assert.equal(await page.locator('[data-history-type=consumo]').getAttribute('aria-pressed'),'true');
  const count=await page.locator('.history-row').count();assert.ok(count>0&&count<total);
  for(const label of await page.locator('.history-row td:nth-child(2)').allTextContents())assert.match(label,/Consumo na produ/);
  await page.locator('#unifiedHistorySearch').fill('zzinexistente');
  await page.waitForFunction(()=>!document.querySelector('.history-row'));
  assert.equal(await page.locator('[data-history-type=consumo]').getAttribute('aria-pressed'),'true');
  await page.locator('#unifiedHistorySearch').fill('');
  await page.waitForSelector('.history-row');
  assert.equal(await page.locator('.history-row').count(),count);
  await page.locator('[data-history-type=recebimento]').click();
  assert.ok(await page.locator('.history-qty.is-in').count()>0);
  await page.locator('.history-row').first().click();
  assert.equal(await page.locator('#stockAllocationModal').isVisible(),false);
  await page.locator('[data-history-type=""]').press('Enter');
  assert.equal(await page.locator('.history-row').count(),total);
  for(const width of [1600,1366,1024,390]){
   await page.setViewportSize({width,height:1100});
   const boxes=await page.locator('.history-layout').evaluate(el=>({types:el.children[0].getBoundingClientRect().toJSON(),history:el.children[1].getBoundingClientRect().toJSON()}));
   if(width>=1024){assert.ok(boxes.types.right<boxes.history.left);assert.equal(Math.round(boxes.types.y),Math.round(boxes.history.y));}
   assert.equal(await page.locator('.almox-history-panel .almox-table-wrap').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'tabela sem barra '+width);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:'.tmp/almox-historico-colunas-'+width+'.png'});
  }
  assert.deepEqual(erros,[]);assert.deepEqual(await page.evaluate(()=>__realCalls),[]);
  console.log('OK: tipos na lateral, filtros combinados com busca, historico apenas visualizacao e sem barra horizontal.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
