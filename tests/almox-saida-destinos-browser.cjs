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
  const latestMovement=()=>page.evaluate(async()=>{const {data}=await TecnoweldAPI.getClient().from('warehouse_movements').select('*');return data.find(m=>m.origem==='saida_manual');});
  for(const destination of ['op','acervo','predial']){
   await page.locator('#exitBtn').click();await page.waitForSelector('#exitScanCode:visible');
   assert.deepEqual(await page.locator('#exitPurpose option').allTextContents(),['Pedido','O.S.']);
   await page.locator('#exitScanCode').fill('INS-0001');await page.locator('#exitScanCode').press('Enter');
   await page.waitForSelector('#exitCartBody tr');
   if(destination==='op'){
    await page.waitForFunction(()=>document.querySelector('#exitOp option[value="1820"]'));
    await page.locator('#saveExitBtn').click();assert.equal(await page.locator('#movementPinInput').isVisible(),false,'exige pedido');
    await page.locator('#exitOp').selectOption('1820');
   }else{
    await page.locator('#exitPurpose').selectOption('os');
    await page.waitForFunction(()=>document.querySelector('#exitServiceOrder option')?.textContent==='Selecione a O.S.');
    assert.equal(await page.locator('#exitOpField').isVisible(),false);
    assert.equal(await page.locator('#exitServiceOrderField').isVisible(),true);
    await page.locator('#saveExitBtn').click();assert.equal(await page.locator('#movementPinInput').isVisible(),false,'exige OS');
    const value=await page.locator('#exitServiceOrder option').evaluateAll((options,source)=>options.find(o=>o.value.startsWith(source+':')).value,destination);
    await page.locator('#exitServiceOrder').selectOption(value);
    await page.screenshot({path:'.tmp/almox-saida-destino-'+destination+'.png'});
   }
   await page.locator('#saveExitBtn').click();await page.waitForSelector('#movementPinInput:visible');
   await page.locator('#movementPinInput').fill('1234');await page.locator('#confirmMovementPinBtn').click();
   await page.waitForFunction(()=>!document.querySelector('#movementPinInput').getClientRects().length);
   const move=await latestMovement();assert.equal(move.quantidade,1);assert.ok(move.valor_total>0);
   if(destination==='op'){assert.equal(move.op_numero,'1820');assert.equal(move.service_order_id,null);}
   else{assert.equal(move.service_order_source,destination);assert.ok(move.service_order_id);assert.equal(move.op_numero,null);assert.match(move.documento,/O.S./);}
  }
  await page.locator('[data-tab=movements]').click();
  assert.match(await page.locator('#unifiedHistoryBody').innerText(),/O.S./);
  assert.deepEqual(erros,[]);assert.deepEqual(await page.evaluate(()=>__realCalls),[]);
  console.log('OK: apenas Pedido e OS, selecao obrigatoria, PIN, baixa e custo nos tres vinculos, referencia no historico.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
