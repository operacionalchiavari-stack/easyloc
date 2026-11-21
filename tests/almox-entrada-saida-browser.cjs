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
  await page.evaluate(()=>localStorage.setItem('tecnoweld_usuario_logado',JSON.stringify({id:'pessoa-real',nome:'Teste'})));

  for(const type of ['entry','exit']){
   await page.locator('#'+type+'Btn').click();
   await page.waitForSelector('#'+type+'HistoryBody tr');
   assert.equal(await page.locator('#'+type+'Modal .almox-modal-head').count(),0,'sem cabecalho externo nem X');
   assert.equal(await page.locator(type==='entry'?'#entryResponsibleName':'#exitReleaseUser').innerText(),'Teste');
   assert.equal(await page.locator('#'+type+'ResponsibleAvatar').innerText(),'T');
   assert.equal(await page.locator('#'+type+'Modal .movement-header-operator').count(),1);
   await page.waitForTimeout(120);
   assert.equal(await page.locator('#almoxOperationSuggestions:popover-open').count(),0,'lista nao abre ao entrar na operacao');
   const field=page.locator(type==='entry'?'#entryMaterial':'#exitScanCode');
   await field.click();await page.waitForSelector('#almoxOperationSuggestions:popover-open [data-operation-option]');
   assert.ok(await page.locator('#almoxOperationSuggestions .operation-material-quantities').count()>0);
   await field.press('Escape');assert.equal(await field.isVisible(),true);
   await field.click();await page.waitForSelector('#almoxOperationSuggestions:popover-open');
   await field.press('Escape');
   assert.ok(await page.locator('#'+type+'HistoryBody tr').count()>5);
   const color=await page.locator('#'+type+'Modal .operation-entry-exit-panel').evaluate(e=>getComputedStyle(e).backgroundColor);
   assert.equal(color,type==='entry'?'rgb(236, 253, 243)':'rgb(255, 241, 242)');
   const avatars=await page.locator('#'+type+'HistoryBody .operation-history-avatar img').evaluateAll(imgs=>imgs.map(i=>[i.getBoundingClientRect().width,i.getBoundingClientRect().height]));
   assert.ok(avatars.length>0&&avatars.every(([w,h])=>w===30&&h===30));
   const grid=await page.locator('#'+type+'Modal .operation-workspace-grid').evaluate(e=>[...e.children].map(x=>x.getBoundingClientRect().top));
   assert.equal(grid[0],grid[1]);
   await page.screenshot({path:'.tmp/almox-'+type+'-duas-colunas.png',fullPage:true});
  }
  await page.locator('#entryBtn').click();
  for(const [code,quantity] of [['INS-0001','2'],['INS-0002','3']]){
   await page.locator('#entryMaterial').fill(code);await page.locator('#entryQty').fill(quantity);
   await page.locator('#entryAddItemBtn').click();
  }
  assert.equal(await page.locator('#entryCartBody tr').count(),2);
  assert.equal(await page.locator('#entryCartBody [data-stock-metric]').count(),0,'saldo somente na pesquisa');
  const before=await page.evaluate(async()=>{const {data}=await TecnoweldAPI.getClient().from('warehouse_materials').select('*');return data.slice(0,2);});
  await page.locator('#saveEntryBtn').click();
  await page.waitForFunction(()=>document.querySelectorAll('#entryCartBody tr').length===0&&!document.querySelector('#saveEntryBtn').disabled);
  const after=await page.evaluate(async()=>{const {data}=await TecnoweldAPI.getClient().from('warehouse_materials').select('*');return data.slice(0,2);});
  assert.equal(after[0].quantidade_disponivel,before[0].quantidade_disponivel+2);
  assert.equal(after[1].quantidade_disponivel,before[1].quantidade_disponivel+3);
  assert.equal(after[0].localizacao,before[0].localizacao);
  assert.equal(after[0].location_id,before[0].location_id);
  const first=await page.locator('#entryHistoryBody tr').first().innerText();assert.match(first,/\+3/);
  await page.locator('#entryHistorySearch').fill('naoexiste');assert.match(await page.locator('#entryHistoryBody').innerText(),/Nenhuma/);
  for(const width of [1366,390]){
   await page.setViewportSize({width,height:1000});
   for(const type of ['entry','exit']){
    await page.locator('#'+type+'Btn').click();
    if(type==='entry'){await page.locator('#entryMaterial').fill('INS-0001');await page.locator('#entryAddItemBtn').click();}
    else{await page.locator('#exitScanCode').fill('INS-0001');await page.locator('#exitScanCode').press('Enter');await page.waitForSelector('#exitCartBody tr');assert.match(await page.locator('#exitCartBody').innerText(),/Tecido linho/);assert.doesNotMatch(await page.locator('#exitCartBody [data-almox-detail]').getAttribute('data-almox-detail'),/Saldo:|Reservado:|Livre:/);}
    if(width===390){
     const cells=await page.locator('#'+type+'HistoryBody tr').first().locator('td').evaluateAll(tds=>tds.map(td=>({bottom:td.getBoundingClientRect().bottom,children:[...td.children].map(c=>c.getBoundingClientRect().bottom)})));
     assert.ok(cells.every(td=>td.children.every(bottom=>bottom<=td.bottom+1)),'conteudo cabe em cada celula no celular');
    }
    const overflow=await page.evaluate(()=>({doc:document.documentElement.scrollWidth>innerWidth+1, tables:[...document.querySelectorAll('.operation-workspace-grid')].filter(e=>e.getClientRects().length).some(e=>e.scrollWidth>e.clientWidth+1)}));
    assert.deepEqual(overflow,{doc:false,tables:false});
    await page.screenshot({path:'.tmp/almox-'+type+'-'+width+'.png',fullPage:true});
   }
  }
  assert.deepEqual(erros,[]);assert.deepEqual(await page.evaluate(()=>__realCalls),[]);
  console.log('OK: entrada em lote, estoque/endereco preservados, historicos separados, cores e duas colunas, sem overflow em 1600/1366/390.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
