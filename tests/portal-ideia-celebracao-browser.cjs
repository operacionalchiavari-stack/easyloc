// Ideia Premiada na Início (nov/2026): com ideia premiada nos últimos N dias o 1º destaque vira a celebração.
const {chromium}=require('playwright'),fs=require('fs'),assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge'});try{
 const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://localhost:9923/**',r=>r.request().url().includes('/assinada/')?r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#8ba590"/></svg>'}):r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><body class="portal-shell"><div id="portalInicio"></div></body>'}));
 await page.goto('http://localhost:9923/');
 await page.addStyleTag({content:fs.readFileSync('styles/portal-shell.css','utf8').replace(/@import[^;]+;/g,'')});await page.addStyleTag({content:'#portalInicio{display:block!important}'});
 await page.evaluate(()=>{window.__CONTEXT={empresa_id:'e1'};window.__nav=[];window.shellNavigate=u=>__nav.push(u);
  window.supabaseClient={auth:{getSession:async()=>({data:{session:null}})},rpc:async nome=>nome==='ideias_premiadas_celebracao'?{data:{dias:4,ideias:[
   {id:'i1',titulo:'Prateleiras móveis no baú',area:'Logística',autor:'Jonatan Falck',autor_id:'u1',foto_url:'empresa/u1.jpg',premio:'Restaurante em Itaipava',proposta:'Instalar prateleiras móveis no baú para proteger itens leves.',premiada_em:new Date().toISOString()},
   {id:'i2',titulo:'Reaproveitar retalhos',area:'Sustentabilidade',autor:'Fernanda Lima',autor_id:'u2',premio:'Vale-compras',proposta:'Almofadas com retalhos.',premiada_em:new Date().toISOString()}]}}:{data:null},
   storage:{from:b=>({createSignedUrl:async p=>({data:{signedUrl:'http://localhost:9923/assinada/'+b+'/'+p}}),getPublicUrl:()=>({data:{publicUrl:'http://localhost:9923/sem-foto.jpg'}})})}};});
 const fonte=fs.readFileSync('js/ui/portalMural.js','utf8').replace('window.portalMural = { mostrar: mostrar };','window.portalMural = { mostrar: mostrar, testeCel: buscarCelebracao, testeMontar: function(m){ estado.mural=m; montarMural(); } };');
 await page.addScriptTag({content:fonte});
 await page.evaluate(async()=>{const c=await portalMural.testeCel();portalMural.testeMontar({celebracao:c});});
 const slide=page.locator('.hero-celebracao');
 assert.equal(await slide.count(),1,'banner de celebração');assert.equal(await page.locator('.hero-convite:not(.hero-celebracao)').count(),0,'convite saiu');
 assert.match(await slide.innerText(),/Prateleiras móveis no baú/);assert.match(await slide.innerText(),/Jonatan Falck/);assert.match(await slide.innerText(),/Restaurante em Itaipava/);assert.match(await slide.innerText(),/Também premiadas: Reaproveitar retalhos/);
 assert.equal(await page.locator('.hero-celebracao-fundo .cel-confete').count(),28,'confetes');
 assert.notEqual(await page.locator('.cel-trofeu').evaluate(e=>getComputedStyle(e).animationName),'none','troféu animado');
 assert.match(await page.locator('.cel-autor-foto img').getAttribute('src'),/assinada\/funcionarios-fotos\/empresa\/u1\.jpg/,'foto do Cadastro de Funcionários');
 assert.ok(await page.locator('.cel-autor-foto img').evaluate(i=>i.complete&&i.naturalWidth>0&&i.getBoundingClientRect().width>=70),'foto visível');
 await page.waitForTimeout(1200);await page.screenshot({path:'.tmp/home-ideia-celebracao.png'});
 await page.locator('.hero-celebracao .atalho-ideia').click();assert.deepEqual(await page.evaluate(()=>__nav),['Modulos/RH/IdeiaPremiada/ideia-premiada.html']);
 await page.evaluate(()=>portalMural.testeMontar({celebracao:{dias:4,ideias:[]}}));
 assert.equal(await page.locator('.hero-celebracao').count(),0);assert.equal(await page.locator('.hero-convite').count(),1,'sem ideia premiada volta o convite');
 await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{portalMural.testeMontar({celebracao:await portalMural.testeCel()});});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'sem overflow no celular');await page.screenshot({path:'.tmp/home-ideia-celebracao-celular.png'});
 assert.deepEqual(errors,[]);console.log('OK - celebração da ideia premiada na Início.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
