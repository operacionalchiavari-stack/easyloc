const assert=require('node:assert/strict'),fs=require('node:fs'),express=require('express'),{chromium}=require('playwright');
const {installMock}=require('./mock-projetos.cjs');
(async()=>{
 const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:390,height:844}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
  await page.route('https://**/*',r=>r.fulfill({contentType:'text/javascript',body:''}));
  await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64')}));
  await page.addInitScript(()=>{
   sessionStorage.setItem('mockdb',JSON.stringify({projetos:[{id:'p1',cliente_id:'client',noivos:'Aniversário de Mariana',data_evento:'2026-12-12',local_evento:'Vale dos Desejos',status:'rascunho',dados:{evento:{data_entrega:'2026-12-11',data_coleta:'2026-12-13'},ambientes:[{id:'a1',nome:'Lounge principal',itens:[{item_id:'1',quantidade:2}],renders:[],notas:''}]}}],calls:[],uploads:[],removed:[],seq:2}));
  });await page.addInitScript(installMock,{staff:true});await page.addInitScript(()=>{supabaseClient.auth.onAuthStateChange=()=>({data:{subscription:{unsubscribe(){}}}});supabaseClient.functions={invoke:async()=>({data:{nome:'Helena',mensagens:[]}})};});
  await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo-app.html?app=1&agente=helena');
  const botao=page.getByRole('button',{name:'Ver pedido',exact:true});await botao.waitFor();assert.ok(await botao.isDisabled(),'sem pedido, botão explica que precisa abrir um');
  await page.evaluate(()=>catalogAssistenteProjeto.usarProjeto('p1'));await page.waitForFunction(()=>!document.querySelector('[data-cas-documento]').disabled);
  const ordem=await page.locator('[data-cas-documento]').evaluate(e=>e.nextElementSibling.hasAttribute('data-cas-ligar'));assert.ok(ordem,'botão ao lado de ligar');
  fs.mkdirSync('.tmp/helena-pedido',{recursive:true});
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});await botao.click();const previa=page.locator('dialog.cpj-order-preview[open]');await previa.waitFor();assert.ok(await previa.evaluate(e=>e.matches(':modal')));
   assert.match(await previa.innerText(),/Aniversário de Mariana/);assert.match(await previa.innerText(),/Lounge principal/);assert.match(await previa.innerText(),/Sofá Um/);assert.ok(await previa.getByRole('button',{name:'Baixar PDF',exact:true}).isVisible());
   assert.ok(await page.evaluate(()=>document.body.classList.contains('assistente-aberta')));assert.ok(await previa.evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;}),'documento cabe na tela');
   assert.ok(await previa.locator('[data-pedido-pdf]').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight),'PDF acessível sem rolar a folha inteira');
   await page.screenshot({path:'.tmp/helena-pedido/documento-'+width+'.png'});await previa.locator('[data-pedido-fechar]').click();assert.ok(await page.locator('[data-cas-input]').isVisible());
  }
  await page.evaluate(()=>catalogAssistenteProjeto.quantidade({item_id:'1',quantidade:5,ambiente:'Lounge principal'}));await botao.click();
  const previa=page.locator('dialog.cpj-order-preview[open]');await previa.waitFor();assert.equal(await previa.locator('td.cpj-order-qty').first().innerText(),'5','reabrir mostra a quantidade atual');
  await previa.locator('[data-pedido-pdf]').click();await page.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(f=>f.title==='Impressão do documento'&&f.contentDocument?.querySelector('.cpj-order-paper')));
  await page.keyboard.press('Escape');assert.ok(await page.locator('[data-cas-input]').isVisible());assert.deepEqual(erros,[]);console.log('OK: botão ao lado de ligar, pedido real no modelo de impressão, PDF, celular/computador, retorno ao chat e quantidades atualizadas.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
