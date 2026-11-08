// App de celular (nov/2026): no celular o link do sistema abre app.html; login único (o mesmo do sistema) com os móveis;
// Início com Triagem e Montagem conforme app_celular_modulos; os apps sem sessão voltam para o app; no computador nada muda.
const {chromium,devices}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const RAIZ=path.resolve(__dirname,'..'),BASE='http://localhost:9930/';
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const tipos={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
function falso(opts){
 // Supabase simulado: guardado em sessionStorage para sobreviver às trocas de página.
 return `(()=>{const O=${JSON.stringify(opts)};const k='__sb_falso';const st=()=>JSON.parse(sessionStorage.getItem(k)||'{"user":null}');const sv=v=>sessionStorage.setItem(k,JSON.stringify(v));
 const q=(t)=>{const r={t,f:{},select(){return r},eq(c,v){r.f[c]=v;return r},in(){return r},limit(){return r},order(){return r},
  async single(){return r.res(true)},maybeSingle(){return r.res(true)},then(ok,er){return r.res(false).then(ok,er)},
  res(um){let d=[];if(t==='usuarios_empresas')d=[{empresa_id:'e1'}];if(t==='assinaturas')d=[{status:'ativo',vencimento:'2099-01-01'}];if(t==='usuarios')d=[{nome:'Jonatan Falck'}];if(t==='empresas')d=[{id:'e1',nome:'Chiavari'}];return Promise.resolve({data:um?d[0]||null:d,error:null});}};return r;};
 const cli={auth:{async getUser(){return {data:{user:st().user}}},async getSession(){const u=st().user;return {data:{session:u?{user:u,access_token:'t'}:null},error:null}},
   async signInWithPassword({email,password}){if(password!=='certa')return {data:{},error:{message:'x'}};const u={id:'u1',email};sv({user:u});return {data:{user:u},error:null}},
   async signOut(){sv({user:null});window.__saiu=true;return {}},onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},async setSession(){return {data:{},error:null}}},
  from:q,
  async rpc(n,a){window.__rpcs=(window.__rpcs||[]).concat(n);if(n==='catalogo_vitrine_login')return {data:{empresa:{nome:'Chiavari'},fotos:Array.from({length:8},(_,i)=>({url:'${BASE}movel-'+i+'.png',nome:'Peça '+i}))}};
   if(n==='funcionario_contexto')return {data:{ativo:true,nome:'Jonatan Falck'}};if(n==='app_celular_modulos')return {data:Object.assign({nome:'Jonatan Falck'},O.modulos)};return {data:null,error:{message:'sem '+n}}},
  storage:{from:()=>({getPublicUrl:p=>({data:{publicUrl:'${BASE}sem-avatar/'+p}})})},functions:{async invoke(){return {data:null,error:{message:'x'}}}}};
 window.supabase={createClient:()=>cli};window.EasyLoc2FA={garantir:async()=>true};
 Object.defineProperty(window,'__fixar2FA',{value:true});
})();`;
}
async function abrir(browser,celular,opts){
 const ctx=await browser.newContext(celular?{...devices['iPhone 13']}:{viewport:{width:1440,height:900}});
 await ctx.addInitScript(falso(opts||{modulos:{triagem:true,montagem:true}}));
 await ctx.route(BASE+'**',r=>{const u=new URL(r.request().url());let f=decodeURIComponent(u.pathname.slice(1))||'index.html';
  if(/^movel-\d+\.png$/.test(f))return r.fulfill({contentType:'image/png',body:PNG});
  if(f.endsWith('doisFatores.js'))return r.fulfill({contentType:'application/javascript',body:'window.EasyLoc2FA=window.EasyLoc2FA||{garantir:async()=>true};'});
  if(f==='dashboard.html')return r.fulfill({contentType:'text/html',body:'<!doctype html><title>dashboard</title><script src="js/core/versaoCelular.js" data-ir-para-app></script><p id="dash">Sistema completo</p>'});
  const p=path.join(RAIZ,f);if(fs.existsSync(p)&&fs.statSync(p).isFile())return r.fulfill({contentType:tipos[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(p)});
  r.fulfill({status:404,body:''});});
 await ctx.route(/cdn\.jsdelivr\.net|unpkg\.com\/@supabase|cdnjs\.cloudflare/,r=>r.fulfill({contentType:'application/javascript',body:''}));
 await ctx.route(/fonts\.(googleapis|gstatic)\.com|unpkg\.com\/lucide/,r=>r.fulfill({body:''}));
 const page=await ctx.newPage(),erros=[];page.on('pageerror',e=>erros.push(e.message));return {ctx,page,erros};
}
(async()=>{const browser=await chromium.launch({channel:'msedge'});try{
 // 1) Celular: o link do sistema abre o app, com o login e os móveis.
 let {ctx,page,erros}=await abrir(browser,true,{modulos:{triagem:true,montagem:true,catalogo:true,bonus:true}});
 await page.goto(BASE+'index.html');await page.waitForURL(/app\.html/);
 await page.waitForSelector('#apLogin:not([hidden])');
 await page.waitForFunction(()=>document.querySelectorAll('#apVitrine .ap-peca.is-visivel').length>=3);
 assert.equal(await page.locator('#apVitrine .ap-peca').count(),5,'móveis no login');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'sem rolagem lateral');
 await page.screenshot({path:'.tmp/app-login.png'});
 await page.fill('#apEmail','jonatan@chiavari.com');await page.fill('#apSenha','errada');await page.click('#apEntrar');
 await page.waitForFunction(()=>/incorretos/.test(document.getElementById('apMsg').textContent));
 await page.fill('#apSenha','certa');await page.click('#apEntrar');
 await page.waitForSelector('#apInicio:not([hidden])');
 assert.equal(await page.locator('#apOla').textContent(),'Olá, Jonatan');
 const mods=await page.locator('.ap-modulo').evaluateAll(a=>a.map(x=>[x.querySelector('.ap-modulo-titulo').textContent,x.getAttribute('href')]));
 assert.deepEqual(mods,[['Triagem','Modulos/Estoque/TriagemApp/triagem.html?app=1'],['Montagem','Modulos/Chiavari/Cronograma/montador.html?app=1'],['Catálogo','Modulos/Comercial/Catalogo/catalogo-app.html?app=1'],['Meu bônus','Modulos/Chiavari/Cronograma/montador.html?app=1&tela=bonus'],['Configurações','#config']]);
 // Configurações: notificações e localização com um botão liga/desliga cada; voltar leva ao Início.
 await page.click('.ap-modulo[href="#config"]');await page.waitForSelector('#apConfig:not([hidden])');
 assert.equal(await page.locator('#apAvisos b').first().textContent(),'Notificações');assert.equal(await page.locator('#apLocal b').first().textContent(),'Localização');
 assert.equal(await page.locator('#apLocal .ap-switch').getAttribute('aria-checked'),'false');assert.equal(await page.locator('section[aria-label="Compartilhamento de localização"]').count(),0,'sem painel flutuante');
 await page.screenshot({path:'.tmp/app-config.png'});await page.click('#apConfigVoltar');await page.waitForSelector('#apInicio:not([hidden])');
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('login_ok')),'1');
 await page.waitForTimeout(900);await page.screenshot({path:'.tmp/app-inicio.png'});
 // recarregar com a sessão: vai direto para o Início
 await page.reload();await page.waitForSelector('#apInicio:not([hidden])');
 // versão completa
 await page.click('#apCompleta');await page.waitForURL(/dashboard\.html/);await page.waitForSelector('#dash');
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('acervo_versao')),'completa','fica na versão completa nesta aba');
 // sair volta ao login
 await page.goto(BASE+'app.html');await page.waitForSelector('#apInicio:not([hidden])');
 await page.click('#apSair');await page.waitForSelector('#apLogin:not([hidden])');
 assert.deepEqual(erros,[]);await ctx.close();

 // 2) Só Triagem liberada.
 ({ctx,page,erros}=await abrir(browser,true,{modulos:{triagem:true,montagem:false}}));
 await page.goto(BASE+'app.html');await page.fill('#apEmail','a@b.com');await page.fill('#apSenha','certa');await page.click('#apEntrar');
 await page.waitForSelector('#apInicio:not([hidden])');
 assert.deepEqual(await page.locator('.ap-modulo-titulo').allTextContents(),['Triagem','Configurações']);await ctx.close();

 // 3) Os apps sem sessão do sistema voltam para o app (sem login próprio).
 ({ctx,page,erros}=await abrir(browser,true));
 await page.goto(BASE+'Modulos/Estoque/TriagemApp/triagem.html?app=1');await page.waitForURL(/\/app\.html/,{timeout:15000});
 await page.goto(BASE+'Modulos/Chiavari/Cronograma/montador.html?app=1');await page.waitForURL(/\/app\.html/,{timeout:15000});
 await ctx.close();

 // 4) Computador: o login de sempre, sem trocar para o app.
 ({ctx,page,erros}=await abrir(browser,false));
 await page.goto(BASE+'index.html');await page.waitForURL(/login\.html/);await page.waitForTimeout(500);
 assert.match(page.url(),/login\.html/,'computador continua no login do sistema');await ctx.close();
 console.log('OK - app de celular: link abre o app, login com móveis, módulos por permissão, versão completa, sair, apps sem login próprio, computador igual.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
