const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE='http://localhost:5642/';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1100}}),erros=[];
  page.on('pageerror',e=>erros.push(e.message));
  await page.addInitScript(()=>{
   window.__CONTEXT={empresa_id:'demo-teste',usuario_id:'pessoa-real',usuario_nome:'Teste'};sessionStorage.setItem('empresa_id','demo-teste');localStorage.setItem('almox:modo:demo-teste','demo');window.aguardarContexto=async()=>__CONTEXT;window.lucide={createIcons(){}};window.__realCalls=[];
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
  for(const tab of ['stock','toseparate','receiving','purchases','movements','count','supplier-links','epi']){
   await page.locator('[data-tab='+tab+']').click();
   if(tab==='toseparate')await page.waitForSelector('[data-mp-pedido]');
   if(tab==='receiving')await page.waitForSelector('#tbodyRecebPedidos tr');
   if(tab==='supplier-links')await page.waitForSelector('[data-links-result] table tbody tr');
   if(tab==='epi')await page.waitForSelector('#epiTab table tbody tr');
   if(tab==='movements'){
    await page.locator('#unifiedHistoryBody .history-row').first().click();
    assert.equal(await page.locator('#stockAllocationModal').isVisible(),false,'historico apenas para consulta');
    assert.equal(await page.locator('#unifiedHistoryBody .history-row').first().evaluate(el=>getComputedStyle(el).cursor),'default');
    const colors=await page.locator('#unifiedHistoryBody .history-day-row td').evaluateAll(cells=>cells.slice(0,4).map(el=>getComputedStyle(el).backgroundColor));
    assert.equal(new Set(colors).size,1,'mesmo cinza em todos os cabecalhos de data');
   }
   await page.screenshot({path:'.tmp/almox-exemplos-'+tab+'.png',fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'sem transbordar em '+tab);
  }
  assert.equal(await page.locator('[data-epi-person]').count(),12);
  assert.equal(await page.locator('#epiTab table tbody tr').count()>0,true);
  const entrega=await page.locator('[data-epi-dev]').first().getAttribute('data-epi-dev');
  await page.locator('[data-epi-dev]').first().click();
  await page.waitForFunction(id=>!document.querySelector('[data-epi-dev="'+id+'"]'),entrega);
  await page.locator('[data-tab=supplier-links]').click();await page.locator('[data-link-edit]').first().click();
  await page.locator('.link-inline-factor').fill('2');await page.locator('[data-link-save]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-link-save]'));
  await page.locator('[data-tab=count]').click();
  await page.locator('[data-count-item=demo-contagem-1] [data-count-justification]').selectOption('Erro de registro na entrada');
  await page.locator('[data-count-justify=demo-contagem-1]').click();
  await page.locator('[data-count-result-tab=aprovacao]').click();
  await page.waitForSelector('[data-count-item=demo-contagem-1] [data-count-review=approve]');
  await page.locator('[data-count-item=demo-contagem-1] [data-count-review=approve]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-count-item=demo-contagem-1] [data-count-review]'));
  await page.locator('[data-tab=toseparate]').click();await page.locator('[data-mp-pedido=demo-pedido-0]').click();
  for(const width of [1600,390]){
   await page.setViewportSize({width,height:1100});
   const modal=page.locator('.mp-escolha-modo[open]');
   assert.equal(await modal.locator('.separacao-mode-option svg').count(),2);
   assert.equal(await modal.locator('[data-mp-modo=manual]').evaluate(el=>getComputedStyle(el).display),'grid');
   assert.equal(await modal.evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'modal sem transbordar '+width);
   await page.screenshot({path:'.tmp/almox-modo-triagem-'+width+'.png'});
  }
  await page.setViewportSize({width:1600,height:1100});
  await page.locator('[data-mp-modo=manual]').click();
  for(const [i,q] of [[0,4],[1,6],[2,8]]){await page.locator('[data-mp-qtd=demo-mat-etapa-0-'+i+']').fill(String(q));await page.locator('[data-mp-qtd=demo-mat-etapa-0-'+i+']').dispatchEvent('change');}
  await page.locator('[data-mp-finalizar]').click();await page.waitForFunction(()=>document.querySelector('[data-mp-progresso]')?.value===100);
  await page.locator('[data-mp-voltar]').click();
  assert.equal(await page.locator('[data-mp-pedido=demo-pedido-0]').getAttribute('data-coluna'),'separado');
  for(const width of [1366,390]){
   await page.setViewportSize({width,height:1100});
   for(const tab of ['stock','toseparate','receiving','purchases','movements','count','supplier-links','epi']){
    await page.locator('[data-tab='+tab+']').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'sem transbordar '+tab+' '+width);
    if(tab==='receiving')assert.equal(await page.locator('#recebPedidosSection .almox-table-wrap').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
   }
  }
  await page.setViewportSize({width:1600,height:1100});

  await page.locator('[data-tab=receiving]').click();await page.waitForFunction(()=>document.querySelectorAll('#tbodyRecebPedidos tr').length===16);
  await page.waitForSelector('#tbodyRecebPedidos .cs-foto img');
  await page.locator('[data-receb-lista=recebimentos]').click();assert.equal(await page.locator('#tbodyRecebLista tr').count(),12);
  await page.locator('[data-receb-lista=pedidos]').click();await page.locator('[data-receb-pedido=demo-compra-0]').click();await page.locator('.receb-escolha [data-receb-abrir]').click();
  page.once('dialog',d=>d.accept());await page.locator('[data-receb-concluir]').click();await page.waitForSelector('#recebListaView:not([hidden])');
  assert.equal(await page.locator('#tbodyRecebLista tr').count(),13);assert.equal(await page.locator('#tbodyRecebPedidos tr').count(),15);
  await page.reload();await page.waitForSelector('#almoxContent:not(.hidden)');
  assert.equal(await page.evaluate(()=>AlmoxDemo.enabled),true);
  await page.locator('[data-tab=receiving]').click();await page.waitForFunction(()=>document.querySelectorAll('#tbodyRecebPedidos tr').length===15);
  await page.locator('[data-tab=stock]').click();await page.locator('#almoxDemoReset').click();await page.waitForSelector('#almoxContent:not(.hidden)');
  await page.locator('[data-tab=receiving]').click();await page.waitForFunction(()=>document.querySelectorAll('#tbodyRecebPedidos tr').length===16);
  assert.deepEqual(await page.evaluate(()=>__realCalls),[]);assert.deepEqual(erros,[]);
  console.log('OK: todas as abas com dados, fotos, recebimento, persistência e reinício; nenhuma chamada ao banco real.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
