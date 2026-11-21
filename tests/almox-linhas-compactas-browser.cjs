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

  await page.locator('#exitBtn').click();
  await page.locator('#exitScanCode').fill('INS-0001');await page.locator('#exitScanCode').press('Enter');
  await page.waitForSelector('#exitCartBody tr');
  assert.deepEqual(await page.locator('#exitModal .exit-cart-table th').allTextContents(),['Qtd.','Item','Valor']);
  const quantity=page.locator('.exit-cart-qty');await quantity.fill('12');
  assert.equal(await quantity.inputValue(),'12');assert.equal(await quantity.evaluate(e=>e===document.activeElement),true,'editar quantidade preserva foco');
  const total=await page.evaluate(()=>formatCurrency(materials.find(m=>m.codigo==='INS-0001').valor_unitario*12));
  assert.equal(await page.locator('[data-exit-total]').innerText(),total);
  const name=page.locator('#exitCartBody [data-almox-detail]');await name.hover();
  await page.waitForSelector('#almoxCellDetails:popover-open');
  assert.match(await page.locator('#almoxCellDetails').innerText(),/Lote:/);
  assert.doesNotMatch(await page.locator('#almoxCellDetails').innerText(),/Saldo:|Reservado:|Livre:/);
  await page.keyboard.press('Escape');assert.equal(await quantity.isVisible(),true);
  await page.screenshot({path:'.tmp/almox-saida-linha-compacta.png',fullPage:true});
  for(const width of [1600,1366,390]){
   await page.setViewportSize({width,height:1100});
   await page.locator('#exitBtn').click();await page.locator('#exitScanCode').fill('INS-0001');await page.locator('#exitScanCode').press('Enter');
   await page.waitForSelector('#exitCartBody tr');
   assert.equal(await page.locator('#exitCartBody tr td').count(),3);
   assert.ok(await page.locator('#exitCartBody tr').evaluate(e=>e.getBoundingClientRect().height)<=58);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   for(const tab of ['purchases','receiving']){
    await page.locator('[data-tab='+tab+']').click();
    const selector=tab==='purchases'?'#tbodyCompras tr':'#tbodyRecebPedidos tr';
    await page.waitForSelector(selector);
    const heights=await page.locator(selector).evaluateAll(rows=>rows.map(row=>row.getBoundingClientRect().height));
    assert.ok(heights.length>10);
    if(width>1050)assert.ok(heights.every(h=>h>=54&&h<=58),tab+' alturas '+JSON.stringify(heights));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'sem overflow '+tab+' '+width);
    await page.screenshot({path:'.tmp/almox-'+tab+'-compacto-'+width+'.png',fullPage:true});
   }
  }
  await page.setViewportSize({width:1600,height:1100});
  const material=page.locator('#tbodyRecebPedidos .receb-material-summary').first();await material.hover();
  await page.waitForSelector('#almoxCellDetails:popover-open');
  assert.equal(await page.locator('#almoxCellDetails').innerText(),await material.getAttribute('data-almox-detail'));
  await page.locator('#tbodyRecebPedidos tr').first().click();await page.waitForSelector('.receb-escolha[open]');
  assert.deepEqual(erros,[]);assert.deepEqual(await page.evaluate(()=>__realCalls),[]);
  console.log('OK: saida em 3 colunas/uma linha, valor atualizado sem perder foco, detalhes no mouse e linhas uniformes de 56px, sem overflow.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
