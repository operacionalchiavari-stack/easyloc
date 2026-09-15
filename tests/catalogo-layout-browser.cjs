const fs=require('fs'),vm=require('vm'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{const page=await browser.newPage({viewport:{width:1900,height:800}});const src=fs.readFileSync('Modulos/Comercial/Catalogo/catalogo.mjs','utf8');const ctx={escapeAttr:x=>x,escapeHtml:x=>x,normalizeSearch:x=>x,detailGallery:()=>'<div class="detail-gallery"><button class="detail-thumb"><img src="https://fixture/detail"></button></div>',modelBlock:()=>'<div class="model-card"></div>',categoryButtons:()=>'',FOTO_PLACEHOLDER:''};vm.createContext(ctx);vm.runInContext(src.slice(src.indexOf('function productTemplate('),src.indexOf('function renderProducts('))+';this.template=productTemplate;',ctx);const svg='<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1800"><rect width="2400" height="1800" fill="#dbc5a1"/></svg>';await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));await page.setContent('<body class="catalog-page catalog-modo-sistema"><header class="catalog-header">Categorias</header>'+ctx.template({id:'test',name:'Cadeira',cat:'cadeiras',catLabel:'Cadeiras',photo:'https://fixture/product',events:[{img:'https://fixture/event',label:'Evento'}],dims:'60 x 90 x 42 cm',desc:'Assento de palha'},0,1)+'</body>');await page.addStyleTag({content:fs.readFileSync('Modulos/Comercial/Catalogo/catalogo.css','utf8')});await page.addStyleTag({content:fs.readFileSync('Modulos/Comercial/Catalogo/catalogo-studio3d.css','utf8')});
const assert=require('node:assert/strict');
for(const viewport of [{width:1900,height:800},{width:1440,height:900},{width:1024,height:768},{width:1366,height:560},{width:390,height:844}]) {
 await page.setViewportSize(viewport);
 await page.evaluate(()=>{document.querySelector('.catalog-product-section').classList.add('is-visible');});
 await page.waitForTimeout(1000);
 const rects=await page.evaluate(()=>Object.fromEntries(['.catalog-detail-panel','.catalog-detail-top','.product-main-media','.product-main-image','.product-event-panel','.catalog-detail-lower'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return[selector,{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}]})));
 const media=rects['.product-main-media'],event=rects['.product-event-panel'],detail=rects['.catalog-detail-lower'];
 assert.ok(media.width>100 && media.height>100,'Product photo remains visible');
 if(viewport.width>=768){
  assert.ok(event.bottom<=viewport.height+1,'Full event panel fits below the header');
  assert.ok(detail.bottom<=viewport.height+1,'Detail photos fit inside first viewport');
  assert.ok(media.right<=event.x+1,'Product photo stays left of the event photo');
  assert.ok(media.right<=rects['.catalog-detail-panel'].right+1,'Main media stays inside detail panel');
 }
 else assert.ok(media.bottom<=event.y+1,'Mobile photos do not overlap');
 assert.ok(media.bottom<=detail.y+1,'Main photo does not cover thumbnails');
 await page.screenshot({path:require('path').join(require('os').tmpdir(),'catalog-layout-'+viewport.width+'.png')});
}

await page.setViewportSize({width:1440,height:900});
await page.emulateMedia({reducedMotion:'no-preference'});
await page.evaluate(()=>{const first=document.querySelector('.catalog-product-section');const second=first.cloneNode(true);second.id='second';second.classList.remove('is-visible');first.after(second);});
const observerStart=src.indexOf('function setupScrollMotion(){');
const setupStart=src.indexOf('function setupObservers(){');
const observerEnd=src.indexOf('\n}',setupStart)+2;
await page.addScriptTag({content:'const state={items:[]};function warmModelExperience(){};'+src.slice(observerStart,observerEnd)+';setupObservers();'});
await page.locator('#second').scrollIntoViewIfNeeded();
await page.waitForFunction(()=>document.querySelector('#second').classList.contains('is-visible'));

await page.evaluate(()=>{const first=document.querySelector('.catalog-product-section');window.scrollTo({top:first.offsetTop+(first.offsetHeight+parseFloat(getComputedStyle(first).marginBottom))/2-56,behavior:'instant'});});
await page.waitForTimeout(2000);
const pair=await page.locator('.product-main-media').evaluateAll(els=>els.map(el=>Number(getComputedStyle(el).opacity)));
assert.ok(Math.abs(pair[0]-pair[1])<.02,'Adjacent items share the same halfway transition');
const lateral=await page.locator('.product-main-image').evaluateAll(els=>els.map(el=>parseFloat(getComputedStyle(el).translate)));
assert.ok(lateral[0]>30 && lateral[1]<-30,'Outgoing and incoming product photos slide in opposing phases');
const eventLateral=await page.locator('.product-event-image').evaluateAll(els=>els.map(el=>parseFloat(getComputedStyle(el).translate)));
assert.ok(eventLateral[0]<-30 && eventLateral[1]>30,'Ambient photos counterbalance the product movement');
assert.ok(pair[0]>.45 && pair[0]<.55,'Outgoing and incoming photos crossfade together');
assert.ok(await page.locator('.catalog-product-section').first().evaluate(el=>parseFloat(getComputedStyle(el).marginBottom))>=48,'Sections have breathing room');
await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
await page.waitForTimeout(2000);
assert.equal(await page.locator('.product-main-media').first().evaluate(el=>getComputedStyle(el).opacity),'1');
await page.screenshot({path:require('path').join(require('os').tmpdir(),'catalog-premium-desktop.png')});
await page.emulateMedia({reducedMotion:'reduce'});
assert.equal(await page.locator('#second .product-main-media').evaluate(el=>getComputedStyle(el).animationName),'none');
assert.equal(await page.locator('#second .product-main-image').evaluate(el=>getComputedStyle(el).translate),'none');
console.log('PASS: enlarged photos stay contained, complete first item, paired scroll transitions, reverse scroll and reduced motion');

}finally{await browser.close()}})();
