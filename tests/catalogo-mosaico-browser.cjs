const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const path=require('node:path');const os=require('node:os');
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c9a874"/></svg>');
await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
await page.addInitScript(()=>{
 sessionStorage.setItem('catalogo_token','test');
 window.supabaseClient={rpc:async name=>({data:name==='catalogo_validar_sessao'?{valido:true,empresa_id:'company',cliente_id:'client'}:name==='catalogo_capas_carregar'?{}:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:[
  {id:'1',tipo:'Item',produto:'Poltrona Águines Campo',categoria:'Estofados',subcategoria:'Poltronas',largura:0.65,altura:0.86,profundidade:0.65,foto_url:'https://fixture/1.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  {id:'2',tipo:'Item',produto:'Sofá Alex',categoria:'Estofados',subcategoria:'Sofás',largura:2.25,altura:0.65,profundidade:1,foto_url:'https://fixture/2.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  {id:'3',tipo:'Item',produto:'Sofá Becca',categoria:'Estofados',subcategoria:'Sofás',foto_url:'https://fixture/3.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
 ]}})};
});
await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
await page.locator('[data-gateway-tile="catalogo"]').waitFor();
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('.catalog-home-grid').waitFor();
await page.locator('[data-home-category="estofados"]').click();
await page.locator('[data-grid-item]').first().waitFor();

// Pedido explícito do usuário: um 3º ícone (mosaico), ao lado dos de
// grade/imersivo, no canto direito abaixo do cabeçalho.
assert.equal(await page.locator('.catalog-view-switch-btn[data-view-mode="mosaic"]').count(),1,'Existe um 3º ícone pra visualização em mosaico');
assert.equal(await page.locator('.catalog-view-switch-btn[data-view-mode="grid"].is-active').count(),1,'Categoria continua abrindo em grade por padrão, não em mosaico');

await page.locator('.catalog-view-switch-btn[data-view-mode="mosaic"]').click();
await page.locator('.catalog-mosaic').waitFor();
assert.equal(await page.locator('.catalog-view-switch-btn[data-view-mode="mosaic"].is-active').count(),1,'Ícone de mosaico fica marcado como ativo');
assert.equal(await page.locator('.catalog-grid').count(),0,'Grade normal não aparece junto com o mosaico');
assert.equal(await page.locator('.catalog-mosaic-tile').count(),3,'Os 3 itens da categoria aparecem como blocos no mosaico');

// "sem o nome do item... só aparece quando passa o mouse": nome/dimensões
// escondidos por padrão (opacity 0), revelados só no hover.
const firstTile=page.locator('.catalog-mosaic-tile').first();
const infoBefore=await firstTile.locator('.catalog-mosaic-info').evaluate(el=>getComputedStyle(el).opacity);
assert.equal(infoBefore,'0','Nome/dimensões ficam escondidos (opacity:0) fora do hover');
await firstTile.hover();
await page.waitForTimeout(400);
const infoAfter=await firstTile.locator('.catalog-mosaic-info').evaluate(el=>getComputedStyle(el).opacity);
assert.equal(infoAfter,'1','Hover revela o nome/dimensões (opacity:1)');
assert.match(await firstTile.locator('.catalog-mosaic-name').textContent(),/Poltrona Águines Campo/);

// Cada foto respeita a proporção NATURAL (sem esticar/cortar num
// quadrado) — pedido implícito de "tudo junto, meio que bagunçado" (o
// efeito vem justamente de alturas diferentes por item).
const naturalRatio=await page.locator('.catalog-mosaic-tile img').first().evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight,boxW:img.getBoundingClientRect().width,boxH:img.getBoundingClientRect().height}));
assert.ok(Math.abs((naturalRatio.boxW/naturalRatio.boxH)-(naturalRatio.w/naturalRatio.h))<0.05,'Proporção renderizada da foto bate com a proporção natural (sem cortar/esticar)');

// Clicar num bloco abre o item normalmente na imersiva (mesmo
// comportamento já usado pela grade).
await firstTile.click();
await page.locator('.catalog-product-section').first().waitFor();
assert.match(await page.locator('.product-title').first().textContent(),/Poltrona Águines Campo/,'Clicar no mosaico abre o item na imersiva, igual a grade');
assert.equal(await page.locator('.catalog-view-switch-btn[data-view-mode="immersive"].is-active').count(),1);

// Voltar pro mosaico (ícone continua funcionando depois de ter passado
// pela imersiva) preserva o mesmo conjunto de itens.
await page.locator('.catalog-view-switch-btn[data-view-mode="mosaic"]').click();
await page.locator('.catalog-mosaic').waitFor();
assert.equal(await page.locator('.catalog-mosaic-tile').count(),3);

// Reentrar na categoria (Home -> categoria de novo) sempre volta pra
// grade, nunca fica "preso" no mosaico — mesma regra já valia pro modo
// imersivo.
await page.locator('.catalog-brand').click();
await page.locator('.catalog-gateway').waitFor();
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('.catalog-home-grid').waitFor();
await page.locator('[data-home-category="estofados"]').click();
await page.locator('[data-grid-item]').first().waitFor();
assert.equal(await page.locator('.catalog-view-switch-btn[data-view-mode="grid"].is-active').count(),1,'Reentrar na categoria sempre volta pra grade, mesmo vindo do mosaico');

for(const width of [390,768]){
  await page.setViewportSize({width,height:844});await page.waitForTimeout(150);
  await page.locator('.catalog-view-switch-btn[data-view-mode="mosaic"]').click();
  await page.locator('.catalog-mosaic').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mosaico sem overflow horizontal em '+width+'px');
}
await page.screenshot({path:path.join(os.tmpdir(),'catalogo-mosaico.png'),fullPage:true});
assert.deepEqual(errors,[]);
console.log('PASS: 3º modo de visualização "mosaico" — ícone próprio no switcher, fotos em colunas na proporção natural, nome/dimensões só no hover, clique abre a imersiva, reentrar na categoria volta pra grade, sem overflow mobile');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
