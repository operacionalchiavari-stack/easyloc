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
  await page.locator('[data-tab=supplier-links]').click();
  await page.waitForSelector('[data-link-edit]');
  const suppliers=page.locator('[data-links-supplier]');
  assert.equal(await suppliers.count(),13);
  await page.waitForSelector('[data-links-suppliers] .cs-foto img');
  assert.equal(await page.locator('[data-links-refresh]').count(),0);
  const supplierSearch=page.locator('[data-links-supplier-search]');
  await supplierSearch.fill('Aurora');
  assert.equal(await suppliers.count(),2);
  assert.match(await suppliers.nth(1).innerText(),/Aurora/);
  await suppliers.nth(1).click();
  assert.equal(await page.locator('[data-links-body] tr').count(),4);
  for(const name of await page.locator('[data-links-body] .links-supplier-text strong').allTextContents())assert.equal(name,'Tecidos Aurora');
  const search=page.locator('th [data-links-search]');
  await search.fill('zzzzinexistente');
  await page.waitForSelector('[data-links-body] .gp-empty');
  assert.equal(await search.evaluate(el=>document.activeElement===el),true);
  await search.fill('');await page.waitForSelector('[data-link-edit]');
  await supplierSearch.fill('');
  assert.equal(await suppliers.count(),13);
  await suppliers.first().click();assert.equal(await page.locator('[data-link-edit]').count(),42);
  await page.locator('[data-link-edit]').first().click();
  await page.locator('.link-inline-factor').fill('2');await page.locator('[data-link-save]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-link-save]'));
  assert.match(await page.locator('[data-links-body] tr').first().innerText(),/2 M/);
  for(const width of [1600,1366,1024,390]){
   await page.setViewportSize({width,height:1100});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'pagina '+width);
   assert.equal(await page.locator('#supplierLinksTab .tw-table-scroll').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'tabela '+width);
   await page.screenshot({path:'.tmp/almox-vinculos-colunas-'+width+'.png'});
  }
  const fits=await page.locator('[data-links-body] tr').first().locator('td').evaluateAll(cells=>cells.every(el=>el.scrollHeight<=el.clientHeight+1));
  assert.equal(fits,true,'celulas sem sobrepor textos no celular');
  assert.deepEqual(erros,[]);assert.deepEqual(await page.evaluate(()=>__realCalls),[]);
  console.log('OK: duas colunas, fotos, busca fornecedor, selecao, busca material, edicao e sem barra horizontal.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
