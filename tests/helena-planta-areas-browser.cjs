const {chromium}=require('playwright'),express=require('express'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const app=express();app.get('/teste-planta',(_,res)=>res.send('<html><head><link rel="stylesheet" href="/Modulos/Comercial/Catalogo/catalogo-assistente.css"></head><body></body></html>'));app.use(express.static(process.cwd()));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto(`http://127.0.0.1:${server.address().port}/teste-planta`);
  await page.evaluate(async()=>{
   const {demarcarAreasPlanta}=await import('/Modulos/Comercial/Catalogo/assistente-planta-areas.mjs');
   const c=document.createElement('canvas');c.width=800;c.height=600;const ctx=c.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,400,600);ctx.fillStyle='blue';ctx.fillRect(400,0,400,600);
   const blob=await new Promise(r=>c.toBlob(r));window.__resultadoAreas=null;
   demarcarAreasPlanta(new File([blob],'planta.png',{type:'image/png'})).then(async areas=>{
    window.__resultadoAreas=await Promise.all(areas.map(async a=>{const bitmap=await createImageBitmap(a.file),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const cx=canvas.getContext('2d');cx.drawImage(bitmap,0,0);return {nome:a.area,rect:a.recorte,w:bitmap.width,h:bitmap.height,pixel:[...cx.getImageData(20,20,1,1).data]};}));
   });
  });
  await page.locator('.cas-planta-editor[open]').waitFor();
  const desenhar=async(nome,x1,x2)=>{
   await page.locator('[data-pa-nome]').fill(nome);const r=await page.locator('[data-pa-palco]').boundingBox();
   await page.mouse.move(r.x+r.width*x1,r.y+r.height*.1);await page.mouse.down();await page.mouse.move(r.x+r.width*x2,r.y+r.height*.3,{steps:8});await page.mouse.up();
  };
  await page.locator('[data-pa-zoom]').fill('200');await desenhar('Cerimônia',.1,.3);
  await page.locator('[data-pa-zoom]').fill('100');await desenhar('Lounge 1',.6,.9);
  assert.equal(await page.locator('.cas-planta-caixa').count(),2);
  await page.locator('[data-pa-renomear="1"]').fill('Cerimônia');await page.locator('[data-pa-concluir]').click();
  assert.match(await page.locator('[data-pa-status]').innerText(),/nomes diferentes/);
  await page.locator('[data-pa-renomear="1"]').fill('Lounge 1');
  await page.locator('[data-pa-remover="0"]').click();assert.equal(await page.locator('.cas-planta-caixa').count(),1);
  await desenhar('Cerimônia',.1,.3);
  fs.mkdirSync('.tmp',{recursive:true});await page.screenshot({path:'.tmp/helena-planta-areas.png'});
  await page.locator('[data-pa-concluir]').click();await page.waitForFunction(()=>window.__resultadoAreas?.length===2);
  const areas=await page.evaluate(()=>window.__resultadoAreas);
  assert.equal(areas[0].nome,'Lounge 1');assert.equal(areas[1].nome,'Cerimônia');
  assert.ok(areas[0].pixel[2]>240&&areas[0].pixel[0]<15,'recorte do lounge contém apenas a área azul');
  assert.ok(areas[1].pixel[0]>240&&areas[1].pixel[2]<15,'recorte da cerimônia contém apenas a área vermelha');
  assert.ok(Math.abs(areas[0].w-240)<3);assert.ok(Math.abs(areas[1].w-160)<3);
  assert.equal(await page.locator('.cas-planta-editor').count(),0);
  console.log('OK - zoom, demarcação, nomes, exclusão e recortes correspondentes à imagem original.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
