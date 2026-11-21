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
  await page.locator('#entryBtn').click();
  await page.waitForSelector('#entryMaterial:visible');
  assert.equal(await page.locator('#entryLocation,#entryLocationList').count(),0);
  assert.equal(await page.locator('#entryReason').evaluate(el=>getComputedStyle(el).appearance),'base-select');
  await page.locator('#entryMaterial').fill('INS-0001');
  await page.waitForSelector('#almoxOperationSuggestions:popover-open [data-operation-option]');
  await page.screenshot({path:'.tmp/almox-entrada-lista-material.png'});
  await page.locator('#entryMaterial').press('ArrowDown');await page.locator('#entryMaterial').press('Enter');
  assert.equal(await page.locator('#entryMaterialId').inputValue(),'demo-material-0');
  await page.locator('#entryQty').fill('2');
  await page.locator('#entryReason').click();
  await page.screenshot({path:'.tmp/almox-entrada-lista-motivo.png'});
  await page.keyboard.press('Escape');
  await page.locator('#entryReason').selectOption({label:'Estoque inicial'});
  await page.evaluate(()=>{window.__saveEntryOriginal=TecnoweldAPI.saveWarehouseEntries;TecnoweldAPI.saveWarehouseEntries=async payload=>{window.__entryPayload=payload;return __saveEntryOriginal(payload);};});
  const before=await page.evaluate(async()=>{const {data}=await TecnoweldAPI.getClient().from('warehouse_materials').select('*').eq('id','demo-material-0').maybeSingle();return data;});
  await page.locator('#saveEntryBtn').click();
  await page.waitForFunction(()=>window.__entryPayload && document.querySelectorAll('#entryCartBody tr').length===0 && !document.querySelector('#saveEntryBtn').disabled);
  assert.equal(await page.evaluate(()=>Object.hasOwn(__entryPayload,'localizacao')),false);
  const after=await page.evaluate(async()=>{const {data}=await TecnoweldAPI.getClient().from('warehouse_materials').select('*').eq('id','demo-material-0').maybeSingle();return data;});
  assert.equal(after.quantidade_disponivel,before.quantidade_disponivel+2);assert.equal(after.localizacao,before.localizacao);assert.equal(after.location_id,before.location_id);
  await page.locator('#exitBtn').click();await page.waitForSelector('#exitScanCode:visible');
  await page.locator('#exitScanCode').fill('INS-0001');await page.locator('#exitScanCode').press('Enter');
  await page.waitForSelector('#exitCartBody tr');
  await page.locator('#exitPurpose').selectOption('os');
  assert.equal(await page.locator('#exitPurpose').inputValue(),'os');
  await page.screenshot({path:'.tmp/almox-saida-listas.png'});
  await page.locator('[data-tab=stock]').click();
  await page.locator('#withdrawalBtn').click();await page.waitForSelector('#loanRetiradoPorTrigger:visible');
  await page.locator('#loanRetiradoPorTrigger').click();await page.waitForSelector('#loanRetiradoPorOptions [data-person-id]');
  await page.screenshot({path:'.tmp/almox-retirada-lista-pessoas.png'});
  await page.locator('#loanRetiradoPorOptions [data-person-id]').first().click();
  const item=page.locator('.loan-item-material-input').first();await item.fill('INS-0001');
  await page.waitForSelector('#almoxOperationSuggestions:popover-open [data-operation-option]');
  await page.locator('[data-operation-option]').first().click();
  assert.equal(await page.locator('.loan-item-material').first().inputValue(),'demo-material-0');
  await item.fill('INS');await item.press('Escape');
  assert.equal(await page.locator('#almoxOperationSuggestions:popover-open').count(),0);
  assert.equal(await item.isVisible(),true,'Escape fecha a lista e preserva a operacao');
  for(const width of [1366,390]){
   await page.setViewportSize({width,height:1100});
   await item.fill('INS-0001');
   const box=await page.locator('#almoxOperationSuggestions').boundingBox();
   assert.ok(box.x>=0&&box.x+box.width<=width);
   await page.screenshot({path:'.tmp/almox-retirada-lista-material-'+width+'.png'});
   await item.press('Escape');
  }
  assert.deepEqual(erros,[]);assert.deepEqual(await page.evaluate(()=>__realCalls),[]);
  console.log('OK: entrada sem endereco, saldo atualizado preservando local, listas estilizadas, teclado e scanner mantidos.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
