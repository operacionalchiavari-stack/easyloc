const assert=require('node:assert/strict'),fs=require('node:fs'),express=require('express'),{chromium}=require('playwright');
(async()=>{
 const app=express();app.get('/fixture-avatares',(req,res)=>res.send('<html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles/assistente-solicitacao.css"><link rel="stylesheet" href="/Modulos/Comercial/Catalogo/catalogo-assistente.css"></head><body><script src="/js/ui/assistente-solicitacao.js"></script></body></html>'));app.use(express.static(process.cwd()));
 app.get('/fixture-desktop',(req,res)=>res.send('<html><head><link rel="stylesheet" href="/styles/global.css"><link rel="stylesheet" href="/Modulos/Estoque/Acervo/acervo-tabela.css"><link rel="stylesheet" href="/Modulos/Financeiro/financeiro-clara.css"></head><body><main class="el-page"><section id="finConteudo"></section><section id="cora"></section></main><script src="/Modulos/Financeiro/financeiro-clara.js"></script><script src="/Modulos/Estoque/Acervo/acervo-cora.js"></script></body></html>'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const base='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.abort());await page.route('**/js/core/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
  await page.addInitScript(()=>{
   sessionStorage.setItem('empresa_id','e1');sessionStorage.setItem('usuario_nome','Pessoa Teste');
   window.supabaseClient={auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}}),getUser:async()=>({data:{user:{id:'u1'}}})},functions:{invoke:async()=>({data:{resposta:'Olá! Vou ajudar a conferir as informações.',pronto:false}})},
    storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:'/assets/agentes/clara.jpg'}})})},from:()=>{const q={};for(const n of ['select','eq'])q[n]=()=>q;q.then=ok=>Promise.resolve({data:[{empresa_id:'e1'}]}).then(ok);return q;},rpc:async n=>({data:n==='funcionario_contexto'?{ativo:true,nome:'Pessoa Teste'}:n==='app_celular_modulos'?Object.fromEntries(['nome','ag_helena','ag_clara','ag_cora','ag_carla','ag_marcos','ag_ideia'].map(k=>[k,k==='nome'?'Pessoa Teste':true])):[]})};
  });
  const conferirFoto=async(selector,id)=>{
   if(id==='cora'||id==='separacao')id='miguel';
   await page.waitForFunction(sel=>[...document.querySelectorAll(sel)].length>0&&[...document.querySelectorAll(sel)].every(e=>e.complete&&e.naturalWidth>0),selector);
   await page.locator(selector).evaluateAll(async es=>{await Promise.all(es.map(e=>e.decode()));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
   const fotos=await page.locator(selector).evaluateAll(es=>es.map(e=>({src:e.getAttribute('src'),w:e.clientWidth,h:e.clientHeight,texto:e.parentElement.textContent,fit:getComputedStyle(e).objectFit})));
   for(const f of fotos){assert.ok(f.src.endsWith('/'+id+'.jpg'),f.src);if(f.w)assert.ok(f.w>=24&&Math.abs(f.w-f.h)<1,'foto circular sem deformação');assert.equal(f.texto.trim(),'','sigla substituída');assert.equal(f.fit,'cover');}
  };
  fs.mkdirSync('.tmp/agentes-retratos',{recursive:true});
  for(const id of ['clara','cora','carla','marcos','ideia']){
   await page.goto(base+'/Modulos/Gestao/AgentesApp/agente.html?ag='+id);await page.locator('#agForm textarea').waitFor();await conferirFoto('.ag-avatar img[data-ia-foto]',id);
   await page.locator('#agForm textarea').fill('Pode me ajudar?');await page.locator('#agForm textarea').press('Enter');await page.locator('.ag-msg.ia:not(:has(.ag-digitando))').waitFor();await conferirFoto('.ag-avatar img[data-ia-foto]',id);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'.tmp/agentes-retratos/'+id+'-chat.png'});
   await page.setViewportSize({width:1440,height:950});await conferirFoto('.ag-avatar img[data-ia-foto]',id);await page.setViewportSize({width:390,height:844});
  }
  await page.route(/\/js\/app\/(?:avisos-app|avisos-android|rastreamento-app)\.js/,r=>r.fulfill({contentType:'text/javascript',body:''}));
  await page.goto(base+'/app.html#agentes');await page.locator('.ap-agente').first().waitFor();assert.equal(await page.locator('.ap-agente').count(),6);
  await page.waitForFunction(()=>[...document.querySelectorAll('.ap-agente-avatar img')].every(e=>e.complete&&e.naturalWidth>0));
  for(const id of ['helena','clara','miguel','carla','marcos','ideia'])await conferirFoto('.ap-agente img[src$="/'+id+'.jpg"]',id);
  await page.screenshot({path:'.tmp/agentes-retratos/lista-agentes.png',fullPage:true});
  const miguel=page.locator('.ap-agente').filter({hasText:'Miguel'});assert.equal(await miguel.count(),1);assert.equal(await page.locator('.ap-agente').filter({hasText:'Cora'}).count(),0);
  for(let volta=0;volta<2;volta++){
   await miguel.click();await page.locator('#agNome').waitFor();assert.equal(await page.locator('#agNome').innerText(),'Miguel');await conferirFoto('.ag-avatar img[data-ia-foto]','miguel');
   await page.locator('#agVoltar').click();await page.locator('.ap-agente').first().waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.ap-agente-avatar img')].length===6&&[...document.querySelectorAll('.ap-agente-avatar img')].every(e=>e.complete&&e.naturalWidth>0));
   for(const id of ['helena','clara','miguel','carla','marcos','ideia'])await conferirFoto('.ap-agente img[src$="/'+id+'.jpg"]',id);
  }
  await page.locator('.ap-agente').filter({hasText:'Clara'}).click();await page.locator('#agNome').waitFor();await page.goBack();await page.locator('.ap-agente').first().waitFor();await conferirFoto('.ap-agente img[src$="/miguel.jpg"]','miguel');
  await page.evaluate(()=>{const foto=document.querySelector('.ap-agente img[src$="/clara.jpg"]');foto.removeAttribute('src');window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await conferirFoto('.ap-agente img[src$="/clara.jpg"]','clara');

  await page.goto(base+'/fixture-avatares');
  for(const [tipo,id] of [['compra','carla'],['manutencao','marcos'],['separacao','separacao'],['montagem','montagem'],['ideia','ideia']]){
   await page.evaluate(tipo=>EasyLocAssistenteSolicitacao.abrir({tipo,titulo:'Conversa',assistente:'Assistente · IA',ctx:{empresa_id:'e1',usuario_id:'u1'},saudacao:()=> 'Olá!',resumoHtml:()=>'',confirmar:async()=>{},persistir:false}),tipo);
   await conferirFoto('.as-avatar img[data-ia-foto]',id);await page.locator('[data-as=fechar]').click();
  }
  await page.evaluate(async()=>{
   const m=await import('/Modulos/Comercial/Catalogo/catalogo-assistente.mjs');m.initCatalogAssistente({getSession:()=>({empresa_id:'e1'}),notify:()=>{},supabase:{functions:{invoke:async()=>({data:{nome:'Helena',mensagens:[]}})}}});m.abrirCatalogAssistente();
  });await page.locator('.cas-boasvindas').waitFor();await conferirFoto('.cas-avatar img[data-ia-foto]','helena');await page.screenshot({path:'.tmp/agentes-retratos/helena-chat.png',animations:'disabled'});
  await page.goto(base+'/fixture-desktop');await page.setViewportSize({width:1440,height:950});await page.evaluate(()=>{
   FinanceiroClara.chat({S:{emp:'e1'},esc:v=>String(v??'')});AcervoCora.render({host:document.getElementById('cora'),empresa:'e1',sb:supabaseClient});
  });await conferirFoto('.ch-avatar img[data-ia-foto]','clara');await conferirFoto('.cora-avatar img[data-ia-foto]','cora');
  await page.locator('[data-cora-texto]').fill('Quais peças vão sair?');await page.locator('[data-cora-texto]').press('Enter');await page.locator('.cora-msg.ia:not(:has(.cora-digitando))').waitFor();await conferirFoto('.cora-avatar img[data-ia-foto]','cora');
  for(const id of ['clara','miguel','carla','marcos','helena','ideia','montagem']){const r=await page.request.get(base+'/assets/agentes/'+id+'.jpg');assert.equal(r.status(),200);assert.match(r.headers()['content-type'],/image\/jpeg/);assert.ok((await r.body()).length<160000,'retrato leve para celular');}
  assert.deepEqual(errors,[]);console.log('OK: retratos reais carregados nos cabeçalhos e respostas dos cinco chats do app, Helena com histórico, compras, manutenção, separação, montagem e ideias; celular e computador; Miguel unificado, retorno às conversas e restauração das fotos.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
