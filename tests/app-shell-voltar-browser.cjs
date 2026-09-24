const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
(async()=>{
 const app=express();
 app.get('/dashboard.html',(_req,res)=>res.send(`<html><head><link rel="stylesheet" href="/styles/navigation-v2.css"></head><body><aside id="sidebar" class="app-navigation"><div class="sidebar-header">Chiavari</div><div class="menu">Menu</div></aside><main id="main-content">Início</main><iframe id="appModuleFrame" src="about:blank"></iframe><script>window.EasyLocPermissions={load:async()=>{},canNavigate:h=>!h.includes('negado')};</script><script src="/js/core/appShell.js"></script></body></html>`));
 app.get('/Modulos/test/:file',(_req,res)=>res.send('<html><head><title>Módulo de teste</title></head><body>Módulo</body></html>'));
 app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/dashboard.html`);
  const nav=async name=>{await page.evaluate(n=>window.shellNavigate('/Modulos/test/'+n+'.html'),name);await page.waitForFunction(n=>document.querySelector('iframe').contentWindow.location.pathname.endsWith('/'+n+'.html'),name);};
  await nav('itens');await nav('clientes');await nav('pedidos');
  await page.locator('#appGlobalBack').click();await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.location.pathname.endsWith('clientes.html'));
  await page.locator('#appGlobalBack').click();await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.location.pathname.endsWith('itens.html'));
  await page.locator('#appGlobalBack').click();await page.waitForURL(/dashboard.html$/);
  assert.doesNotMatch(page.url(),/login/);
  await nav('itens');await page.evaluate(()=>window.shellNavigate('https://example.com/login.html'));assert.match(page.url(),/itens/);
  await page.evaluate(()=>window.shellNavigate('/login.html'));assert.match(page.url(),/itens/);
  await nav('clientes');await page.reload();
  await page.locator('#appGlobalBack').click();await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.location.pathname.endsWith('itens.html'));
  await page.evaluate(()=>{const w=document.querySelector('iframe').contentWindow;w.appGoBack=async()=>{w.innerBack=true;return true;};});
  await page.locator('#appGlobalBack').click();assert.equal(await page.evaluate(()=>document.querySelector('iframe').contentWindow.innerBack),true);
  await page.evaluate(()=>{const w=document.querySelector('iframe').contentWindow;w.appGoBack=()=>false;w.appBeforeLeave=()=>false;});
  await page.locator('#appGlobalBack').click();assert.match(page.url(),/itens/);
  for(const width of [1440,820,390]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('#appGlobalBack').count(),1);}
  assert.deepEqual(errors,[]);console.log('PASS: Voltar entre módulos, fallback seguro, recarga, navegação interna, proteção de alterações e rejeição de login/URL externa.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
