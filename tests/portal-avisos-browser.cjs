// Quadro de avisos da Início (nov/2026): quadro de cortiça com moldura de madeira, avisos como papéis presos com
// alfinete (até 6 por quadro), papel em branco "Novo comunicado", ponto da página sem o quadradinho dourado.
const {chromium}=require('playwright'),fs=require('fs'),assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge'});try{
 const page=await browser.newPage({viewport:{width:1440,height:760}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://localhost:9925/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><body class="portal-shell portal-em-inicio"><main id="portalInicio"></main></body>'}));
 await page.goto('http://localhost:9925/');
 await page.addStyleTag({content:fs.readFileSync('styles/portal-shell.css','utf8').replace(/@import[^;]+;/g,'')});
 await page.evaluate(()=>{window.__CONTEXT={empresa_id:'e1'};window.shellNavigate=()=>{};window.__abriu=0;window.supabaseClient={auth:{getSession:async()=>({data:{session:null}})},rpc:async()=>({data:null})};});
 await page.addScriptTag({content:fs.readFileSync('js/ui/portalMural.js','utf8').replace('window.portalMural = { mostrar: mostrar };','window.portalMural = { mostrar: mostrar, m: function(x){ estado.mural=x; montarMural(); } };')});
 await page.evaluate(()=>{window.abrirAvisoPortal=()=>{window.__abriu++;};});
 const aviso=(i,extra)=>Object.assign({id:'a'+i,titulo:'Aviso '+i,texto:'Texto do aviso '+i,cor:['neutro','areia','verde','azul','lavanda'][i%5],publicadoEm:'2026-11-0'+(1+i%8)},extra||{});
 const tres=[aviso(1,{prioridade:'IMPORTANTE',fixado:true}),aviso(2),aviso(3)];
 await page.evaluate(a=>portalMural.m({avisos:a}),tres);
 assert.equal((await page.locator('.qa-quadro .qa-placa').textContent()).trim(),'Quadro de avisos');
 assert.equal(await page.locator('.qa-nota:not(.qa-nova)').count(),3,'um papel por aviso');
 assert.equal(await page.locator('.qa-nova').count(),1,'papel para publicar');
 assert.equal(await page.locator('.qa-nota .qa-pino').count(),4,'alfinete em todos');
 assert.match(await page.locator('.qa-nota.is-importante .qa-selo').textContent(),/Importante/i);
 assert.match(await page.locator('.qa-nota').first().locator('time').textContent(),/^\d\d\/\d\d\/2026$/);
 assert.equal(await page.locator('.hero-aviso-item, .av-item').count(),0,'sem os modelos antigos');
 await page.locator('.hero-ponto').nth(1).click();await page.mouse.move(2,700);
 assert.equal(await page.locator('.hero-ponto[aria-pressed=true]').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)','ponto sem quadradinho');
 assert.notEqual(await page.locator('.qa-nota').first().evaluate(e=>getComputedStyle(e).animationName),'none','papéis animados');
 const giros=await page.locator('.qa-nota').evaluateAll(n=>n.map(e=>getComputedStyle(e).rotate));assert.ok(new Set(giros).size>1,'papéis tortos diferentes');
 await page.waitForTimeout(2200);
 const caixa=await page.evaluate(()=>{const q=document.querySelector('.qa-quadro').getBoundingClientRect(),h=document.querySelector('.hero').getBoundingClientRect();return [q.top-h.top,h.bottom-q.bottom];});
 assert.ok(caixa[0]>=0&&caixa[1]>=0,'quadro dentro do destaque: '+caixa);
 await page.locator('.qa-nova').click();assert.equal(await page.evaluate(()=>__abriu),1,'papel em branco abre o novo aviso');
 await page.evaluate(a=>portalMural.m({avisos:a}),Array.from({length:8},(_,i)=>aviso(i)));
 assert.equal(await page.locator('.hero-aviso').count(),2,'8 avisos = 2 quadros (até 6 por quadro)');
 assert.equal(await page.locator('.hero-aviso').first().locator('.qa-nova').count(),0,'quadro cheio sem papel em branco');
 await page.evaluate(()=>portalMural.m({avisos:[]}));
 assert.match(await page.locator('.qa-nova').textContent(),/Nenhum comunicado por enquanto/);
 await page.setViewportSize({width:390,height:844});await page.evaluate(a=>portalMural.m({avisos:a}),tres);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'sem overflow no celular');
 // Publicar com foto: sobe para empresas-logos/<empresa>/avisos/, publica e liga o anexo ao aviso novo.
 await page.setViewportSize({width:1440,height:760});
 await page.evaluate(()=>{
  window.__gravado=null;window.__subido=null;window.__avisosServidor=[{id:'AVI_antigo1',titulo:'Antigo',texto:'x',publicadoEm:'2026-11-01'}];
  window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'t'}}})},rpc:async()=>({data:null}),
   storage:{from:b=>({upload:async(path,f,o)=>{window.__subido={b,path,type:o.contentType};return {error:null};},getPublicUrl:path=>({data:{publicUrl:'http://localhost:9925/'+path}})})},
   from:t=>{const q={_t:t,select:()=>q,eq:()=>q,in:()=>q,upsert:async(row)=>{window.__gravado=row;return {error:null};},then:ok=>Promise.resolve({data:window.__gravado?[{aviso_id:window.__gravado.aviso_id,url:window.__gravado.url,tipo:window.__gravado.tipo,nome:window.__gravado.nome}]:[]}).then(ok)};return q;}};
  window.fetch=async(url,o)=>{if(o&&o.method==='POST'){const d=JSON.parse(o.body).dados;window.__avisosServidor.push({id:'AVI_novo1234',titulo:d.titulo,texto:d.texto,publicadoEm:'2026-11-05'});return {ok:true,json:async()=>({ok:true})};}return {ok:true,json:async()=>({ok:true,resultado:{avisos:window.__avisosServidor.slice()}})};};
 });
 await page.evaluate(a=>portalMural.m({avisos:a}),[{id:'AVI_antigo1',titulo:'Antigo',texto:'x',publicadoEm:'2026-11-01'}]);
 await page.evaluate(()=>{delete window.abrirAvisoPortal;});
 await page.addScriptTag({content:fs.readFileSync('js/ui/portalMural.js','utf8').replace('window.portalMural = { mostrar: mostrar };','window.portalMural = { mostrar: mostrar, m: function(x){ estado.mural=x; montarMural(); } };')});
 await page.evaluate(()=>portalMural.m({avisos:[{id:'AVI_antigo1',titulo:'Antigo',texto:'x',publicadoEm:'2026-11-01'}]}));
 await page.evaluate(()=>abrirAvisoPortal());
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
 assert.ok(await page.locator('#novoAvisoPortal [name=anexo]').isHidden(),'escrito: sem campo de foto');
 await page.click('#novoAvisoPortal .aviso-modo label:nth-of-type(2)');
 assert.ok(await page.locator('#novoAvisoPortal [name=titulo]').isHidden(),'anexo: sem título');
 assert.ok(await page.locator('#novoAvisoPortal [name=texto]').isHidden(),'anexo: sem mensagem');
 assert.ok(await page.locator('#novoAvisoPortal .aviso-cores').isHidden(),'anexo: sem cor');
 assert.ok(await page.locator('#novoAvisoPortal [name=validoAte]').isVisible(),'anexo: até quando fica');
 await page.setInputFiles('#novoAvisoPortal [name=anexo]',{name:'outubro-rosa.png',mimeType:'image/png',buffer:png});
 assert.equal(await page.locator('#novoAvisoPortal .aviso-anexo-previa img').count(),1,'prévia da foto');
 await page.click('#novoAvisoPortal [type=submit]');
 await page.waitForFunction(()=>!document.getElementById('novoAvisoPortal').open);
 const sub=await page.evaluate(()=>window.__subido),grav=await page.evaluate(()=>window.__gravado);
 assert.equal(sub.b,'empresas-logos');assert.match(sub.path,/^e1\/avisos\/.+\.png$/);
 assert.equal(grav.aviso_id,'AVI_novo1234','anexo ligado ao aviso novo');assert.equal(grav.tipo,'imagem');
 assert.equal(await page.locator('.qa-nota.com-foto[data-aviso="AVI_novo1234"] .qa-foto img').count(),1,'cartaz com a foto no quadro');
 for(const sel of ['.qa-texto','h2','time','.qa-selo'])assert.equal(await page.locator('.qa-nota[data-aviso="AVI_novo1234"] '+sel).count(),0,'só a foto, sem '+sel);
 const alt=await page.locator('.qa-nota[data-aviso="AVI_novo1234"] .qa-foto').evaluate(e=>e.getBoundingClientRect().height);assert.ok(alt>=200,'foto grande: '+alt);
 assert.deepEqual(errors,[]);console.log('OK - quadro de avisos de cortiça: papéis com alfinete, animação, publicar, páginas, vazio, celular.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
