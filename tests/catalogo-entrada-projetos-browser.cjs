const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const {installMock}=require('./mock-projetos.cjs');
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300"><rect width="240" height="300" fill="#d8c9b7"/><circle cx="80" cy="90" r="30" fill="#a39381"/><circle cx="158" cy="104" r="29" fill="#b6a28c"/><path d="M35 290V160Q80 110 125 160V290M115 290V170Q160 120 205 170V290" fill="#f3eee7"/></svg>'}));
 await page.addInitScript(()=>{if(!sessionStorage.getItem('mockdb'))sessionStorage.setItem('mockdb',JSON.stringify({projetos:[{id:'p1',cliente_id:'client',noivos:'Ana & Bruno',data_evento:'2027-05-22',local_evento:'Jardim das Oliveiras',status:'rascunho',dados:{foto_casal:{url:'https://fixture/casal.png'},ambientes:[{id:'a1',nome:'Lounge',itens:[],renders:[]}]}},{id:'p2',cliente_id:'client',noivos:'Clara & Miguel',data_evento:'2027-09-18',local_evento:'Fazenda Santa Rita',status:'rascunho',dados:{ambientes:[]}}],calls:[],uploads:[],removed:[],seq:3}));});
 await page.addInitScript(installMock,{token:true});
 const url='http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html';await page.goto(url);await page.locator('[data-gateway-tile="catalogo"]').waitFor();assert.equal(await page.locator('.cpj-entry').count(),0);await page.locator('[data-gateway-tile="catalogo"]').click();
 await page.locator('[data-entry-project="p1"]').waitFor();assert.equal(await page.locator('.cpj-entry .cpj-card').count(),0);
 assert.equal(await page.locator('.catalog-header').isVisible(),true);assert.equal(await page.locator('#catalogGlobalBack').isVisible(),true);assert.equal(await page.locator('.cpj-entry-header,.cpj-entry-footer,.cpj-entry-name,.cpj-entry-go,.cpj-entry-number,.cpj-entry-eyebrow').count(),0);await page.locator('#catalogGlobalBack').click();assert.equal(await page.locator('.cpj-entry').count(),0);await page.locator('[data-gateway-tile="catalogo"]').click();await page.locator('[data-entry-project="p1"]').waitFor();
 await page.screenshot({path:'outputs/catalogo-entrada-projetos-desktop.png'});
 await page.locator('[data-entry-project="p1"]').click();await page.locator('.cpj-entry').waitFor({state:'detached'});await page.locator('[data-home-category]').first().waitFor();
 assert.match(await page.locator('#catalogProjetoDock').textContent(),/Ana & Bruno/);
 await page.reload();await page.locator('[data-gateway-tile="catalogo"]').click();await page.locator('[data-entry-project="p2"]').waitFor();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'outputs/catalogo-entrada-projetos-mobile.png'});
 await page.locator('[data-entry-project="p2"]').focus();await page.keyboard.press('Enter');await page.locator('.cpj-entry').waitFor({state:'detached'});assert.match(await page.locator('#catalogProjetoDock').textContent(),/Clara & Miguel/);
 await page.reload();await page.locator('[data-gateway-tile="catalogo"]').click();
 await page.locator('[data-entry-without]').click();await page.locator('[data-home-category]').first().waitFor();
 assert.equal(await page.locator('#catalogProjetoDock').isVisible(),false);
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>{try{return JSON.parse(localStorage[k])?.id==='p2';}catch{return false;}})),false);
 // Empty list and creation cancellation must keep the entry choice available.
 await page.evaluate(()=>{const db=JSON.parse(sessionStorage.getItem('mockdb'));db.projetos=[];sessionStorage.setItem('mockdb',JSON.stringify(db));});await page.reload();await page.locator('[data-gateway-tile="catalogo"]').click();await page.locator('.cpj-entry-empty').waitFor();
 await page.locator('[data-entry-new]').click();await page.locator('.cpj-modal[open]').waitFor();
 await page.keyboard.press('Escape');assert.equal(await page.locator('.cpj-entry').isVisible(),true);
 await page.locator('[data-entry-new]').click();
 await page.locator('.cpj-modal input[name="noivos"]').fill('Julia e Pedro');
 await page.locator('.cpj-modal input[name="data"]').fill('2027-11-20');
 await page.locator('.cpj-modal input[name="local"]').fill('Jardim');
 await page.locator('.cpj-modal button[type="submit"]').click();
 await page.locator('.cpj-entry').waitFor({state:'detached'});
 assert.match(await page.locator('#catalogProjetoDock').textContent(),/Julia e Pedro/);
 // Retry after a list error, without silently entering the catalog.
 await page.close();const failPage=await browser.newPage();await failPage.addInitScript(installMock,{token:true});await failPage.addInitScript(()=>{const orig=window.supabaseClient.rpc;let fail=true;window.supabaseClient.rpc=async(...args)=>{if(args[0]==='projeto_listar'&&fail){fail=false;return {error:{message:'Falha de rede'}};}return orig(...args);};});await failPage.goto(url);await failPage.locator('[data-gateway-tile="catalogo"]').click();await failPage.locator('[data-entry-retry]').click();await failPage.locator('.cpj-entry-empty').waitFor();await failPage.close();
 const staff=await browser.newPage();await staff.addInitScript(installMock,{staff:true});await staff.goto(url);await staff.locator('[data-gateway-tile]').first().waitFor();assert.equal(await staff.locator('.cpj-entry').count(),0);await staff.close();
 assert.deepEqual(errors,[]);console.log('PASS: escolha obrigatoria a cada entrada, projeto ativo, teclado, mobile, vazio, cancelamento, erro/retry e equipe sem seletor.');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
