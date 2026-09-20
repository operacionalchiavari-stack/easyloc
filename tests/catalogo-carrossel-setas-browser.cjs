// Setas do carrossel da foto principal (principal + Detalhes) — pedido do usuário: "só quero que apareça as setas
// quando eu passar o mouse por cima, outra coisa, não quero ela branca, quero com esse efeito igual da home".
// Desktop: escondidas em repouso, aparecem com o mouse na foto (ou o foco do teclado), círculo preto a 50% (o mesmo
// escurecer do Portal) com seta branca. Tela de toque (sem hover): SEMPRE visíveis, senão não haveria como trocar.
const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500"><rect width="900" height="500" fill="#fbfbfb"/><rect x="90" y="175" width="720" height="150" rx="30" fill="#d9dadd"/></svg>');
const ST='https://fixture/storage/v1/object/public/itens/';
const ITENS=[{id:'1',tipo:'Item',produto:'Sofá Berlim',categoria:'Sofás',material:'Tecido',cor:'Off White',referencia:'S1',largura:2.58,altura:.73,profundidade:.89,foto_url:ST+'s.png',itens_fotos:[
  {slot:'detalhe_01',tipo:'detalhe',titulo:'Detalhe 1',url:ST+'d1.png',path:'x/1',ordem:1,cliente_id:null},
  {slot:'detalhe_02',tipo:'detalhe',titulo:'Detalhe 2',url:ST+'d2.png',path:'x/2',ordem:2,cliente_id:null}],itens_modelos_3d:[]}];
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
async function abrir(opcoes){
  const ctx=await browser.newContext(opcoes);const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page._errors=errors;
  await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
  await page.addInitScript(({itens})=>{sessionStorage.setItem('catalogo_token','test');window.supabaseClient={rpc:async n=>{
    if(n==='catalogo_validar_sessao')return {data:{valido:true,empresa_id:'company',cliente_id:'client'}};
    if(n==='catalogo_carregar')return {data:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens}};
    if(n==='catalogo_capas_carregar')return {data:{}};return {data:null};}};},{itens:ITENS});
  await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
  await page.locator('.catalog-gateway').waitFor();
  await page.locator('[data-gateway-tile="catalogo"]').click();await page.locator('#catalogGrid .catalog-home-grid').waitFor();
  await page.locator('[data-home-category="sofas"]').click();await page.locator('[data-grid-item="1"]').click();
  await page.locator('#produto-1 .product-main-nav').first().waitFor();
  return page;
}
const estado=(page,lado='next')=>page.locator(`#produto-1 .product-main-nav-${lado}`).evaluate(el=>{const cs=getComputedStyle(el);return {op:Number(cs.opacity),fundo:cs.backgroundColor,cor:cs.color};});

// ===== Desktop =====
{
  const page=await abrir({viewport:{width:1440,height:900}});
  assert.equal(await page.evaluate(()=>matchMedia('(hover:hover)').matches),true,'o teste roda com um ambiente com hover');
  await page.mouse.move(5,5);await page.waitForTimeout(800);
  for(const lado of ['prev','next']) assert.equal((await estado(page,lado)).op,0,`seta ${lado} escondida com o mouse fora da foto`);
  assert.ok(await page.locator('#produto-1 .product-main-dots').isVisible(),'os pontinhos de posição seguem visíveis (é o que avisa que há mais fotos)');
  const m=await page.locator('#produto-1 .product-main-media').boundingBox();
  await page.mouse.move(m.x+m.width/2,m.y+m.height/2);await page.waitForTimeout(800);
  for(const lado of ['prev','next']){
    const e=await estado(page,lado);
    assert.equal(e.op,1,`seta ${lado} aparece com o mouse na foto`);
    assert.equal(e.fundo,'rgba(0, 0, 0, 0.5)','círculo preto a 50% — o mesmo escurecer da home — e não branco');
    assert.equal(e.cor,'rgb(255, 255, 255)','seta branca');
  }
  // Mouse EM CIMA da seta: fica mais escura ainda.
  const seta=await page.locator('#produto-1 .product-main-nav-next').boundingBox();
  await page.mouse.move(seta.x+seta.width/2,seta.y+seta.height/2);await page.waitForTimeout(700);
  assert.equal((await estado(page)).fundo,'rgba(0, 0, 0, 0.72)','com o mouse na seta o círculo escurece');
  // Clicar continua trocando de foto.
  await page.locator('#produto-1 .product-main-nav-next').click();
  await page.waitForFunction(()=>document.querySelector('#produto-1 .product-main-media').dataset.activeSlot==='detalhe_01');
  // Teclado: com o foco na seta ela aparece mesmo sem mouse.
  await page.mouse.move(5,5);await page.waitForTimeout(800);
  await page.locator('#produto-1 .product-main-nav-prev').focus();await page.waitForTimeout(800);
  assert.equal((await estado(page,'prev')).op,1,'com o foco do teclado a seta aparece');
  assert.deepEqual(page._errors,[]);
  await page.context().close();
}
// ===== Tela de toque: sem hover, as setas ficam sempre visíveis =====
{
  const page=await abrir({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  assert.equal(await page.evaluate(()=>matchMedia('(hover:none)').matches),true,'o teste roda com um ambiente sem hover');
  await page.waitForTimeout(800);
  for(const lado of ['prev','next']) assert.equal((await estado(page,lado)).op,1,`toque: seta ${lado} sempre visível (não existe "passar o mouse")`);
  assert.equal((await estado(page)).fundo,'rgba(0, 0, 0, 0.5)','no toque também é o círculo preto, não branco');
  await page.context().close();
}
await browser.close();server.close();
console.log('PASS: setas do carrossel principal — escondidas em repouso e aparecem com o mouse na foto (ou foco do teclado), círculo preto a 50% como o escurecer da home com seta branca (mais escuro com o mouse na seta), pontinhos sempre visíveis, e sempre visíveis em tela de toque');
})().catch(e=>{console.error(e);process.exit(1);});
