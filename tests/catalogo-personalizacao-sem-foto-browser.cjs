const {chromium}=require('playwright'),express=require('express'),fs=require('node:fs'),assert=require('node:assert/strict');
const {installMock}=require('./mock-projetos.cjs');
const pasta='Modulos/Comercial/Catalogo/';
const normalizar=s=>JSON.parse(JSON.stringify(s,(_,v)=>typeof v==='number'?Number(v.toFixed(8)):v));
(async()=>{
 const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
  await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await page.route('https://fixture/**',r=>r.fulfill({body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#b47a50"/></svg>',contentType:'image/svg+xml'}));
  await page.route('**/catalogo.mjs*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(pasta+'catalogo.mjs','utf8')+'\nwindow.personalizacaoTeste={state,openCustomizeDialog,imagemPersonalizacao,FOTO_PLACEHOLDER};'}));
  await page.route('**/catalogo-studio3d.mjs*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(pasta+'catalogo-studio3d.mjs','utf8')+'\nwindow.studioTeste={snapshotCena,addItem,cenaEditor};'}));
  await page.addInitScript(installMock,{staff:true,cartela:true,pinturaSemCartela:true,modelos:true});
  await page.goto(`http://127.0.0.1:${server.address().port}/${pasta}catalogo.html`);
  await page.waitForFunction(()=>window.personalizacaoTeste?.state.items.length&&window.studioTeste?.cenaEditor.pronto());
  const antes=await page.evaluate(async()=>{
   const t=window.personalizacaoTeste,original=t.state.items.find(i=>i.id==='1');original.glb='/siteglb.glb';await window.studioTeste.addItem(original,0,{position:[2,0,1],rotation:Math.PI/3});
   const item=t.state.items.find(i=>i.id==='2');item.photo=t.FOTO_PLACEHOLDER;item.glb='/siteglb.glb';
   const snapshot=window.studioTeste.snapshotCena();t.openCustomizeDialog(item);return snapshot;
  });
  await page.waitForFunction(()=>document.getElementById('catalogCustomizeProduct').src.startsWith('data:image/jpeg')&&!document.getElementById('catalogCustomizeStatus').textContent,{timeout:30000});
  assert.deepEqual(normalizar(await page.evaluate(()=>window.studioTeste.snapshotCena())),normalizar(antes),'captura do item preserva a composição 3D que já estava em edição');
  await page.screenshot({path:'.tmp/personalizacao-sem-foto-3d.png'});
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
  await page.locator('#catalogFabricInput').setInputFiles({name:'cor.png',mimeType:'image/png',buffer:png});
  await page.locator('#catalogCustomizeGenerate').click();
  await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('mockdb')).invokes?.length===1);
  const envio=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mockdb')).invokes[0]);
  assert.equal(envio.name,'studio-ai-engine');assert.equal(envio.body.scene.referencePolicy,'fabric_customization');assert.match(envio.body.scene.preview,/^data:image\/jpeg;base64,/);assert.ok(envio.body.scene.preview.length>10000,'captura real do móvel é enviada, sem o placeholder');assert.match(envio.body.scene.fabricReference,/^data:image\/png;base64,/);
  await page.locator('.catalog-notification.has-photo').waitFor();
  assert.deepEqual(normalizar(await page.evaluate(()=>window.studioTeste.snapshotCena())),normalizar(antes));
  const semReferencia=await page.evaluate(async()=>{
   try{await window.personalizacaoTeste.imagemPersonalizacao({id:'sem-imagem',photo:window.personalizacaoTeste.FOTO_PLACEHOLDER});return '';}catch(e){return e.message;}
  });
  assert.match(semReferencia,/sem foto e sem modelo 3D/);assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mockdb')).invokes.length),1,'sem referência não há chamada de IA cobrada');
  assert.deepEqual(erros,[]);console.log('PASS - captura real do modelo sem foto, envio para personalização, preservação do 3D e ausência de chamada sem referência');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
