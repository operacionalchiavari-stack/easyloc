const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
// Linha do tempo das telas visitadas, no cabeçalho (pedido explícito do usuário,
// evoluindo as antigas setas de voltar/avançar: "eu quero que forme tipo uma
// linha do tempo com todas as páginas que eu acessei, então por exemplo, a
// primeira seria home, a segunda seria categorias, a terceira seria bares... a
// minha tela que eu estou agora ela deve ser sempre centralizada e do jeito que
// está hoje... quando eu mudasse de página rolasse um efeito no menu trocando de
// uma tela pra outra, tipo uma rolagem"). Modelo de HISTÓRICO (a ordem em que a
// pessoa navegou, com repetição), não a hierarquia (a trilha hierárquica
// #catalogBreadcrumb foi apagada depois a pedido do usuário). Somem as laterais no Portal
// ("Home" no cabeçalho) — mesmo pedido das antigas setas: "na home não precisa
// ter esses botões, só nos outros".
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#7d8f7a"/></svg>');
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{

async function abrir(contextOptions={}){
 const context=await browser.newContext({viewport:{width:1600,height:900},...contextOptions});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 await page.addInitScript(()=>{
  sessionStorage.setItem('catalogo_token','test');
  window.supabaseClient={rpc:async(name)=>{
   if(name==='catalogo_validar_sessao') return {data:{valido:true,empresa_id:'company',cliente_id:'client'}};
   if(name==='catalogo_carregar') return {data:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:[
     {id:'1',tipo:'Item',produto:'Sofá Um',categoria:'Sofás',foto_url:'https://fixture/sofa.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
     {id:'2',tipo:'Item',produto:'Mesa Um',categoria:'Mesas',foto_url:'https://fixture/mesa.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
   ]}};
   if(name==='catalogo_capas_carregar') return {data:{portal:'https://fixture/capa-portal.png'}};
   if(name==='biblioteca_carregar') return {data:{fotos:[]}};
   return {data:null};
  }};
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('.catalog-gateway').waitFor();
 return {context,page,errors};
}

const {context,page,errors}=await abrir();
const label=()=>page.locator('#catalogPageLabel').textContent();
const passadas=()=>page.$$eval('#catalogTimelinePast [data-timeline-entry]',els=>els.map(e=>e.textContent.trim()));
const seguintes=()=>page.$$eval('#catalogTimelineFuture [data-timeline-entry]',els=>els.map(e=>e.textContent.trim()));
// Pedido explícito: a tela atual "deve ser sempre centralizada" — distância
// entre o centro do rótulo e o centro do cabeçalho, em pixels.
const centerOffset=()=>page.evaluate(()=>{const h=document.querySelector('.catalog-header').getBoundingClientRect();const l=document.getElementById('catalogPageLabel').getBoundingClientRect();return Math.abs((l.left+l.right)/2-(h.left+h.right)/2);});
const esperarRepouso=()=>page.waitForFunction(()=>document.getAnimations().length===0);

// ===== Portal: só a tela atual, centralizada; laterais escondidas =====
assert.equal(await label(),'Home');
assert.equal(await page.locator('.catalog-navigation').evaluate(el=>el.classList.contains('is-portal')),true,'Portal marca a navegação como is-portal (laterais escondidas)');
assert.equal(await page.locator('#catalogTimelinePast').evaluate(el=>getComputedStyle(el).visibility),'hidden');
assert.ok(await centerOffset()<=1,'Rótulo centralizado no Portal');

// ===== Portal -> Categorias: "Home" vira a 1ª entrada da linha do tempo =====
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('#catalogGrid .catalog-home-grid').waitFor();
await esperarRepouso();
assert.equal(await label(),'Categorias');
assert.deepEqual(await passadas(),['Home'],'1ª entrada: Home');
assert.deepEqual(await seguintes(),[]);
assert.equal(await page.locator('#catalogTimelinePast').evaluate(el=>getComputedStyle(el).visibility),'visible','Fora do Portal as laterais aparecem');
assert.ok(await centerOffset()<=1,'Categorias no centro exato');

// ===== Categorias -> Sofás: Home › Categorias › [SOFÁS] =====
await page.locator('[data-home-category="sofas"]').click();
await page.locator('[data-view-mode="grid"].is-active').waitFor();
await esperarRepouso();
assert.equal(await label(),'Sofás');
assert.deepEqual(await passadas(),['Home','Categorias'],'Linha do tempo na ORDEM em que foi visitado');
assert.ok(await centerOffset()<=1,'Nome da categoria no centro exato, com histórico só do lado esquerdo');
await page.setViewportSize({width:1280,height:900});await page.waitForTimeout(150);
assert.ok(await centerOffset()<=1,'Continua no centro exato em 1280px');
await page.setViewportSize({width:1600,height:900});await page.waitForTimeout(150);

// ===== Clicar na entrada anterior volta de verdade; a tela de onde saiu vira "seguinte" =====
await page.locator('#catalogTimelinePast [data-timeline-entry]').last().click();
await page.waitForFunction(()=>document.getElementById('catalogPageLabel').textContent==='Categorias');
await esperarRepouso();
assert.deepEqual(await passadas(),['Home']);
assert.deepEqual(await seguintes(),['Sofás'],'Sofás passou pro lado direito (dá pra avançar de novo)');
assert.ok(await centerOffset()<=1);
assert.equal(await page.locator('.catalog-home-grid').first().isVisible(),true,'A grade de categorias voltou pra tela de verdade');

// ===== Clicar na entrada seguinte avança =====
await page.locator('#catalogTimelineFuture [data-timeline-entry]').first().click();
await page.waitForFunction(()=>document.getElementById('catalogPageLabel').textContent==='Sofás');
await esperarRepouso();
assert.deepEqual(await passadas(),['Home','Categorias']);
assert.deepEqual(await seguintes(),[]);

// ===== Pular várias telas de uma vez: clicar na 1ª entrada (Home) volta 2 passos =====
await page.locator('#catalogTimelinePast [data-timeline-entry]').first().click();
await page.locator('.catalog-gateway').waitFor();
await esperarRepouso();
assert.equal(await label(),'Home');
assert.equal(await page.locator('.catalog-navigation').evaluate(el=>el.classList.contains('is-portal')),true,'Chegou no Portal: laterais escondem de novo');
// as entradas seguem guardadas (Categorias e Sofás), só ficam escondidas no Portal
assert.deepEqual(await seguintes(),['Categorias','Sofás']);

// ===== Navegação NOVA descarta as entradas "seguintes" =====
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('#catalogGrid .catalog-home-grid').waitFor();
await esperarRepouso();
assert.deepEqual(await seguintes(),[],'Navegar pra um lugar novo descarta o que estava "à frente"');
assert.deepEqual(await passadas(),['Home']);

// ===== A linha do tempo é o histórico REAL, com repetição =====
await page.locator('[data-home-category="mesas"]').click();
await page.waitForFunction(()=>document.getElementById('catalogPageLabel').textContent==='Mesas');
await page.locator('.catalog-brand').click();           // logo volta pro Portal (2ª vez em "Home")
await page.locator('.catalog-gateway').waitFor();
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('#catalogGrid .catalog-home-grid').waitFor();
await esperarRepouso();
assert.deepEqual(await passadas(),['Home','Categorias','Mesas','Home'],'Telas repetidas aparecem de novo, na ordem em que foram acessadas');

// ===== Overlays (Biblioteca) entram na linha do tempo como qualquer tela =====
await page.locator('.catalog-brand').click();
await page.locator('.catalog-gateway').waitFor();
await page.locator('[data-gateway-tile="biblioteca"]').click();
await page.locator('#catalogBiblioteca:not(.hidden)').waitFor();
await esperarRepouso();
assert.equal(await label(),'Biblioteca');
assert.equal((await passadas()).at(-1),'Home');
assert.ok(await centerOffset()<=1,'Biblioteca centralizada');
await page.locator('#catalogTimelinePast [data-timeline-entry]').last().click();
await page.locator('.catalog-gateway').waitFor();
assert.equal(await page.locator('#catalogBiblioteca').evaluate(el=>el.classList.contains('hidden')),true,'Voltar pela linha do tempo fecha a Biblioteca de verdade');

// ===== Efeito de rolagem: o nome novo ENTRA de fora do centro e assenta no centro =====
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('#catalogGrid .catalog-home-grid').waitFor();
await esperarRepouso();
const inicio=await page.evaluate(()=>{
 document.querySelector('[data-home-category="sofas"]').click();
 const h=document.querySelector('.catalog-header').getBoundingClientRect();
 const l=document.getElementById('catalogPageLabel').getBoundingClientRect();
 return {animacoes:document.getAnimations().length,offset:Math.abs((l.left+l.right)/2-(h.left+h.right)/2)};
});
assert.ok(inicio.animacoes>0,'Trocar de tela dispara a animação de rolagem');
assert.ok(inicio.offset>20,'No 1º quadro o nome novo ainda está fora do centro (vem deslizando de lado)');
await esperarRepouso();
assert.ok(await centerOffset()<=1,'Ao fim da rolagem o nome assenta no centro exato');

// ===== Nome longo e telas estreitas: continua no centro, sem estourar =====
await page.setViewportSize({width:1100,height:900});await page.waitForTimeout(150);
assert.ok(await centerOffset()<=1,'Centralizado em 1100px');
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Sem overflow horizontal no celular');
// no celular sobra só a entrada vizinha de cada lado (uma seta), clicável
const visiveisCelular=await page.$$eval('#catalogTimelinePast [data-timeline-entry]',els=>els.filter(e=>getComputedStyle(e).display!=='none').length);
assert.equal(visiveisCelular,1,'Celular: só a entrada vizinha (seta) aparece do lado esquerdo');
await page.locator('#catalogTimelinePast [data-timeline-entry].is-near').click();
await page.waitForFunction(()=>document.getElementById('catalogPageLabel').textContent==='Categorias');
// Achado rodando a suíte: no celular o nome novo ENTRA deslizando de fora
// (translateX na animação) — sem o recorte do .catalog-navigation isso
// aumentava o scrollWidth da página no meio da animação (a tela "balançava"
// pro lado por ~0,6s a cada troca de tela). Mede 2 quadros depois de trocar,
// com a animação ainda no começo.
const semOverflowNoMeio=await page.evaluate(()=>new Promise((resolve)=>{
 document.querySelector('.catalog-brand').click();
 requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({rodando:document.getAnimations().length>0,ok:document.documentElement.scrollWidth<=innerWidth})));
}));
assert.equal(semOverflowNoMeio.rodando,true,'a animação está mesmo em andamento na hora da medida');
assert.equal(semOverflowNoMeio.ok,true,'Sem overflow horizontal NO MEIO da animação no celular');

assert.deepEqual(errors,[]);
await context.close();

// ===== Quem pede menos movimento no sistema não recebe a animação =====
{
 const reduzido=await abrir({reducedMotion:'reduce'});
 await reduzido.page.locator('[data-gateway-tile="catalogo"]').click();
 await reduzido.page.locator('#catalogGrid .catalog-home-grid').waitFor();
 const animacoes=await reduzido.page.evaluate(()=>{document.querySelector('[data-home-category="sofas"]').click();return document.getAnimations().length;});
 assert.equal(animacoes,0,'prefers-reduced-motion: a troca de tela acontece sem animação');
 assert.deepEqual(reduzido.errors,[]);
 await reduzido.context.close();
}

console.log('PASS: linha do tempo no cabeçalho — laterais somem no Portal, tela atual sempre no centro exato (1600/1280/1100px), entradas na ordem real visitada (com repetição), clicar numa entrada volta/avança/pula várias telas de verdade, navegação nova descarta as "seguintes", Biblioteca entra como qualquer tela, animação de rolagem (nome novo entra de fora e assenta no centro), sem animação em prefers-reduced-motion, celular com só a seta da entrada vizinha e sem overflow');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
