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
  await page.locator('[data-tab=epi]').click();
  await page.waitForSelector('[data-epi-person]');
  assert.equal(await page.locator('[data-epi-person]').count(),12);
  assert.equal(await page.locator('.epi-people-list img').count(),12);
  await page.locator('[data-epi-people-search]').fill('Carlos');
  assert.equal(await page.locator('[data-epi-person]').count(),1);
  await page.locator('[data-epi-person]').click();
  assert.match(await page.locator('.epi-selected-person').innerText(),/Carlos Santos/);
  const id=await page.locator('.epi-person-option.is-selected').getAttribute('data-epi-person');
  const expected=await page.evaluate(async id=>{const {data}=await TecnoweldAPI.getClient().rpc('almox_epi_data');return data.entregas.filter(e=>e.colaborador_id===id&&!e.devolvido_em).length;},id);
  assert.equal(await page.locator('[data-epi-body] tbody tr').count(),expected);
  await page.locator('[data-epi-search]').fill('zzznenhum');
  assert.match(await page.locator('[data-epi-body]').innerText(),/Nada nesta lista/);
  assert.equal(await page.locator('[data-epi-search]').evaluate(el=>document.activeElement===el),true);
  await page.locator('[data-epi-search]').fill('');
  const delivery=await page.locator('[data-epi-dev]').first().getAttribute('data-epi-dev');
  await page.locator('[data-epi-dev]').first().click();
  await page.waitForFunction(id=>!document.querySelector('[data-epi-dev="'+id+'"]'),delivery);
  assert.equal(await page.locator('[data-epi-body] tbody tr').count(),expected-1);
  await page.locator('[data-v=entregas]').click();
  assert.match(await page.locator('[data-epi-body]').innerText(),/Devolvido/);
  await page.evaluate(()=>{TecnoReport.mount=async html=>window.__printedEpi=html;});
  await page.locator('[data-epi-ficha]').click();
  await page.waitForFunction(()=>window.__printedEpi?.includes('Carlos Santos'));
  await page.locator('[data-epi-people-search]').fill('');
  assert.equal(await page.locator('[data-epi-person]').count(),12);
  for(const width of [1600,1366,1024,390]){
   await page.setViewportSize({width,height:1100});
   for(const view of ['uso','trocas','entregas','catalogo']){
    await page.locator('[data-v='+view+']').click();
    assert.equal(await page.locator('[data-epi-body] .tw-table-scroll').evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),true,'tabela sem barra '+width+' '+view);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:'.tmp/almox-epi-colunas-'+width+'-'+view+'.png'});
   }
  }
  await page.locator('[data-epi-person]').first().click();
  assert.equal(await page.locator('[data-v=uso]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(erros,[]);assert.deepEqual(await page.evaluate(()=>__realCalls),[]);
  console.log('OK: colaboradores com fotos, busca, EPIs pessoais, devolucao, historico, ficha e telas sem barra horizontal.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
