const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const path=require('node:path');const os=require('node:os');
// Cores disponíveis no card da grade de itens (pedido do usuário: "nessa tela aqui dos itens quero que apareça as cores
// que temos disponíveis quando tiver mais de uma cor do mesmo item, igual" ao da página do item): bolinhas discretas, e
// clicar numa cor troca o PRÓPRIO card (foto/nome/medidas) sem abrir o item, e o card passa a abrir aquela cor.
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c9a874"/></svg>');
await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
await page.addInitScript(()=>{
 sessionStorage.setItem('catalogo_token','test');
 window.supabaseClient={rpc:async(name)=>{
  if(name==='catalogo_validar_sessao') return {data:{valido:true,empresa_id:'company',cliente_id:'client'}};
  if(name==='catalogo_carregar') return {data:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:[
   {id:'1',tipo:'Item',produto:'Poltrona Águines Campo',categoria:'Estofados',material:'Madeira',cor:'Castanho Claro',largura:.67,altura:.95,profundidade:.57,foto_url:'https://fixture/1.png',capa_categoria:false,itens_fotos:[]},
   {id:'2',tipo:'Item',produto:'Poltrona Águines Campo',categoria:'Estofados',material:'Madeira',cor:'Castanho Escuro',largura:.67,altura:.95,profundidade:.57,foto_url:'https://fixture/2.png',capa_categoria:false,itens_fotos:[]},
   {id:'3',tipo:'Item',produto:'Poltrona Águines Campo',categoria:'Estofados',material:'Madeira',cor:'Verde Musgo',largura:.67,altura:.95,profundidade:.57,foto_url:'https://fixture/3.png',capa_categoria:false,itens_fotos:[]},
   {id:'4',tipo:'Item',produto:'Sofá Alex',categoria:'Estofados',material:'Tecido',cor:'Cinza',largura:2.25,altura:.65,profundidade:1,foto_url:'https://fixture/4.png',capa_categoria:false,itens_fotos:[]},
  ]}};
  return {data:null};
 }};
});
await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('[data-home-category="estofados"]').click();
await page.locator('.catalog-grid-card').first().waitFor();

const cardCores=page.locator('.catalog-grid-card',{hasText:'Poltrona Águines Campo'});
const cardUnico=page.locator('.catalog-grid-card',{hasText:'Sofá Alex'});
assert.equal(await page.locator('.catalog-grid-card').count(),2,'As 3 cores da poltrona viram UM card (grupo de variantes), mais o sofá');
assert.equal(await cardCores.locator('[data-grid-variant]').count(),3,'Card com 3 cores mostra os 3 círculos');
assert.equal(await cardUnico.locator('[data-grid-variant]').count(),0,'Item de uma cor só não mostra círculo nenhum');
assert.deepEqual(await cardCores.locator('[data-grid-variant]').evaluateAll(els=>els.map(e=>e.getAttribute('aria-label'))),['Castanho Claro','Castanho Escuro','Verde Musgo'],'Cada bolinha diz a cor no title/aria-label (sem texto embaixo, pra ficar discreto)');
assert.equal(await cardCores.locator('.product-variant-swatch-label').count(),0,'Sem o nome da cor escrito embaixo de cada bolinha');
assert.equal(await cardCores.locator('.product-variant-swatch.active').getAttribute('data-grid-variant'),'1','A cor que o card mostra começa marcada');
assert.match(await cardCores.locator('.catalog-grid-card-photo img').getAttribute('src'),/\/1\.png/);
// As bolinhas são bem menores que as da página do item (44px) e ficam DENTRO do card, abaixo das medidas
const caixaCard=await cardCores.boundingBox();
const caixaCirculo=await cardCores.locator('.product-variant-swatch-photo').first().boundingBox();
const caixaDims=await cardCores.locator('.catalog-grid-card-dims').boundingBox();
assert.ok(caixaCirculo.width>=30&&caixaCirculo.width<=36,'Bolinha de ~32px: legível, mas menor que os 44px da página do item: '+caixaCirculo.width);
const caixaAreaClique=await cardCores.locator('[data-grid-variant]').first().boundingBox();
assert.ok(caixaAreaClique.width>=36,'A área de clique é maior que o desenho ('+caixaAreaClique.width+'px)');
assert.ok(await cardCores.locator('.catalog-grid-swatches').evaluate(el=>el.getBoundingClientRect().height)<=46,'A fileira de cores é baixa (uma linha de bolinhas)');
assert.ok(caixaCirculo.y>=caixaDims.y+caixaDims.height,'Círculos abaixo das medidas');
const ultimo=await cardCores.locator('.product-variant-swatch').last().boundingBox();
assert.ok(ultimo.x+ultimo.width<=caixaCard.x+caixaCard.width+1,'As 3 bolinhas cabem dentro do card');
await page.screenshot({path:path.join(os.tmpdir(),'cores-grade.png')});

// Clicar numa cor troca o card, sem abrir o item
await cardCores.locator('[data-grid-variant="2"]').click();
assert.equal(await page.locator('.catalog-product-section').count(),0,'Clicar na cor NÃO abre o item');
assert.match(await cardCores.locator('.catalog-grid-card-photo img').getAttribute('src'),/\/2\.png/,'A foto do card vira a da cor escolhida');
assert.equal(await cardCores.locator('.product-variant-swatch.active').getAttribute('data-grid-variant'),'2');
assert.equal(await cardCores.locator('[data-grid-variant="2"]').getAttribute('aria-pressed'),'true');
assert.equal(await cardCores.locator('[data-grid-variant="1"]').getAttribute('aria-pressed'),'false');
assert.equal(await cardCores.getAttribute('data-grid-item'),'2','O card passa a representar a cor escolhida');
// "＋ Adicionar ao projeto" do card acompanha a cor que está na tela
assert.equal(await cardCores.locator('[data-projeto-add]').getAttribute('data-projeto-add'),'2','O ＋ do card passa a adicionar a cor escolhida');
// Teclado: Enter numa cor também troca
await cardCores.locator('[data-grid-variant="3"]').focus();
await page.keyboard.press('Enter');
assert.match(await cardCores.locator('.catalog-grid-card-photo img').getAttribute('src'),/\/3\.png/);
assert.equal(await page.locator('.catalog-product-section').count(),0,'Enter na cor também não abre o item');

// Abrir o card abre a COR escolhida (não a principal do grupo)
await cardCores.locator('.catalog-grid-card-name').click();
await page.locator('.catalog-product-section').first().waitFor();
assert.equal(await page.locator('.catalog-product-section').first().getAttribute('data-product-id'),'3','A imersiva abre na cor que estava no card (Verde Musgo)');
assert.equal(await page.locator('.product-variant-swatch.active').first().getAttribute('data-variant-id'),'3');
await page.waitForFunction(()=>/\/3\.png/.test(document.querySelector('.product-main-image')?.getAttribute('src')||''),null,{timeout:3000}); // a foto troca com um fundido curto (renderMainSlide)

// Card de uma cor só continua abrindo como sempre
await page.locator('.catalog-brand').click();
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('[data-home-category="estofados"]').click();
await page.locator('.catalog-grid-card',{hasText:'Sofá Alex'}).locator('.catalog-grid-card-name').click();
await page.locator('.catalog-product-section').first().waitFor();

// Celular: os círculos ficam dentro do card e a página não ganha rolagem lateral
await page.setViewportSize({width:390,height:844});
await page.locator('.catalog-brand').click();
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('[data-home-category="estofados"]').click();
await page.locator('.catalog-grid-card').first().waitFor();
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Grade com cores sem overflow horizontal no celular');
const cardCel=await page.locator('.catalog-grid-card',{hasText:'Poltrona Águines Campo'}).boundingBox();
const ultimoCel=await page.locator('.catalog-grid-card',{hasText:'Poltrona Águines Campo'}).locator('.product-variant-swatch').last().boundingBox();
assert.ok(ultimoCel.x+ultimoCel.width<=cardCel.x+cardCel.width+1&&ultimoCel.x+ultimoCel.width<=390,'No celular os círculos não saem do card nem da tela');
await page.screenshot({path:path.join(os.tmpdir(),'cores-grade-mobile.png')});
assert.deepEqual(errors,[]);
}finally{await browser.close();server.close();}
console.log('catalogo-cores-grade-browser: ok');
})().catch((e)=>{console.error(e);process.exit(1);});
