const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
  const art='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#90a384"/><circle cx="300" cy="300" r="180" fill="#d8dfce"/><path d="M0 900L260 480H340L600 900" fill="#d4c4a6"/></svg>');
  await page.setContent('<body class="catalog-page"><div style="width:560px;height:780px;margin:30px auto"><aside class="product-event-panel"><img class="product-event-image" alt="Foto ambientada" src="'+art+'"></aside></div></body>');
  await page.addStyleTag({content:fs.readFileSync('Modulos/Comercial/Catalogo/catalogo.css','utf8')});
  const panel=page.locator('.product-event-panel');
  const measure=()=>panel.evaluate(el=>({overlay:Number(getComputedStyle(el,'::before').opacity),textOpacity:Number(getComputedStyle(el,'::after').opacity),spacing:parseFloat(getComputedStyle(el,'::after').letterSpacing),scale:Number(getComputedStyle(el.querySelector('img')).scale),text:getComputedStyle(el,'::after').content}));
  const before=await measure();assert.equal(before.overlay,0);assert.equal(before.textOpacity,0);assert.equal(before.scale,1);assert.match(before.text,/INSPIRE-SE/);
  await panel.hover();await page.waitForTimeout(120);const during=await measure();assert.ok(during.overlay>0&&during.overlay<.46);assert.ok(during.scale>1&&during.scale<1.045);
  await page.waitForTimeout(1450);const after=await measure();assert.equal(after.overlay,.46);assert.equal(after.textOpacity,1);assert.equal(after.scale,1.045);assert.ok(after.spacing>before.spacing*2);
  await page.screenshot({path:require('path').join(require('os').tmpdir(),'catalog-inspire-hover.png')});
  await page.mouse.move(10,10);await page.waitForTimeout(1500);assert.equal((await measure()).overlay,0);assert.equal((await measure()).textOpacity,0);assert.equal((await measure()).scale,1);
  // Variant changes replace the photo inside the same panel; invitation must survive.
  await panel.evaluate(el=>{el.innerHTML=el.innerHTML;});await panel.hover();await page.waitForTimeout(1500);assert.equal((await measure()).overlay,.46);
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(200);assert.equal((await measure()).scale,1);assert.equal((await measure()).spacing,before.spacing);
  await page.setViewportSize({width:390,height:844});await panel.evaluate(el=>{el.parentElement.style.width='100%';});assert.ok((await panel.boundingBox()).width<=390);
  console.log('PASS: gradual overlay, subtle zoom, letter spacing, mouse leave, variant replacement, reduced motion and mobile fit');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
