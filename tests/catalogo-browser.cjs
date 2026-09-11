const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const express = require('express');

function pdfFixture(pages = 1, size = 300) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({length:pages}, (_,i)=>`${3+i} 0 R`).join(' ')}] /Count ${pages} >>`];
  for(let i=0;i<pages;i++) objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size} ${size}] /Resources << >> /Contents ${3+pages} 0 R >>`);
  const stream='0 0 0 RG 30 30 200 200 re S';
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let text='%PDF-1.4\n', offsets=[0];
  objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${o}\nendobj\n`;});
  const xref=Buffer.byteLength(text);
  text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('');
  return Buffer.from(text+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
}

(async()=>{
  const app=express(); app.use(express.static(process.cwd()));
  const server=app.listen(5520,'127.0.0.1');
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[], requests=[];
    page.on('pageerror',e=>errors.push(e.message));
    // Simulate static hosts which cannot serve the old worker module.
    await page.route('**/node_modules/pdfjs-dist/**',r=>r.abort());
    await page.route('**/catalogo-studio3d.mjs*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('Modulos/Comercial/Catalogo/catalogo-studio3d.mjs','utf8')+'\nwindow.studioTest={studio,ensureScene,snapshotProject,selectObject,applyEasyAction,showTopView,showPerspectiveView,toggleGrid};'}));
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    await page.route('**/rest/v1/rpc/*',async r=>{
      const name=r.request().url().split('/').pop();
      const response=name==='catalogo_login'?{token:'test-session',empresa_id:'company',cliente_id:'decorator'}:name==='catalogo_validar_sessao'?{valido:true,empresa_id:'company',cliente_id:'decorator'}:{empresa:{nome:'Empresa teste'},decorador:{id:'decorator',nome:'Decoradora teste'},itens:[{id:'fixture',produto:'Mesa teste',categoria:'Mesas',largura:1,altura:1,profundidade:1,foto_url:png,personalizable:true,itens_modelos_3d:[{url:'/siteglb.glb',status:'ativo'}],itens_fotos:[]}]};
      await r.fulfill({json:response});
    });
    await page.route('**/functions/v1/studio-ai-engine',async r=>{
      const body=r.request().postDataJSON();requests.push(body);
      if(body.scene?.referencePolicy==='fabric_customization') await new Promise(resolve=>setTimeout(resolve,1500));
      assert.equal(body.catalog_token,'test-session');assert.equal(body.empresa_id,'company');
      const response=body.action==='analyze_floor_plan'?{ok:true,analysis:{width_m:10,depth_m:10,bounds:{left:0,top:0,right:1,bottom:1},confidence:1}}:body.action==='plan_layout'?{ok:true,plan:{items:[{itemId:'fixture',zone:'back'}]}}:{ok:true,providerStatus:'ok',images:[{url:png}]};
      await r.fulfill({json:response});
    });
    await page.goto('http://127.0.0.1:5520/Modulos/Comercial/Catalogo/catalogo.html');
    await page.locator('#catalogLoginEmail').fill('teste@example.com');
    await page.locator('#catalogLoginPassword').fill('test-password');
    await page.locator('#catalogLoginForm button[type=submit]').click();
    await page.locator('.catalog-product-section').waitFor();
    await page.locator('#catalogSearch').fill('inexistente');assert.equal(await page.locator('#catalogEmpty').isVisible(),true);
    await page.locator('#catalogSearch').fill('mesa');assert.equal(await page.locator('.catalog-product-section').isVisible(),true);
    await page.locator('[data-customize-item]').click();
    await page.locator('#catalogFabricInput').setInputFiles({name:'tecido.png',mimeType:'image/png',buffer:Buffer.from(png.split(',')[1],'base64')});
    await page.locator('#catalogCustomizeGenerate').click();
    assert.equal(await page.locator('#catalogCustomizeDialog').isVisible(),true);
    assert.equal(await page.locator('#catalogAiLoading').isVisible(),true);
    assert.equal(await page.locator('#catalogFabricInput').isDisabled(),true);
    await page.getByText('Sua personalização ficou pronta',{exact:true}).waitFor();
    assert.match(await page.locator('#catalogCustomizeStatus').innerText(),/Tecido aplicado/);
    assert.equal(await page.locator('#catalogAiLoading').isVisible(),false);
    assert.equal(await page.locator('#catalogCustomizeProduct').getAttribute('src'),await page.locator('.product-main-image').getAttribute('src'));
    await page.locator('#catalogCustomizeClose').click();
    assert.equal(requests.at(-1).scene.fabricReference,png);
    await page.locator('[data-studio-toggle]').click();
    await page.waitForFunction(()=>window.studioTest?.studio.renderer);
    await page.locator('#studioPlanInput').setInputFiles({name:'planta.pdf',mimeType:'application/pdf',buffer:pdfFixture()});
    await page.getByText('Planta inteira dimensionada',{exact:true}).waitFor({timeout:30000});
    assert.match(requests.at(-1).plan_image,/^data:image\/jpeg/);
    assert.equal(await page.locator('#studioRoomWidth').inputValue(),'10');
    const pdfChecks=await page.evaluate(async({multi,large})=>{
      const {renderPdfPage}=await import('./catalogo-pdf.mjs');
      const file=bytes=>new File([new Uint8Array(bytes)],'teste.pdf',{type:'application/pdf'});
      const cancelled=await renderPdfPage(file(multi),()=>null);
      let rejected=false;try{await renderPdfPage(file(multi),()=>1.5);}catch{rejected=true;}
      const second=await renderPdfPage(file(multi),()=>2);
      const result=await renderPdfPage(file(large));const bitmap=await createImageBitmap(result);
      return {cancelled,rejected,name:second.name,width:bitmap.width,height:bitmap.height};
    },{multi:[...pdfFixture(2)],large:[...pdfFixture(1,10000)]});
    assert.equal(pdfChecks.cancelled,null);assert.equal(pdfChecks.rejected,true);assert.match(pdfChecks.name,/pagina-2/);assert.ok(Math.max(pdfChecks.width,pdfChecks.height)<=2600);
    await page.locator('[data-studio-add]').click();
    await page.waitForFunction(()=>window.studioTest.studio.objects.length===1);
    await page.evaluate(()=>{const t=window.studioTest;t.showPerspectiveView();t.showTopView();t.toggleGrid();t.toggleGrid();});
    await page.locator('#studioRenderButton').click();
    await page.getByText('Sua renderização ficou pronta',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Ver resultado',exact:true}).last().click();
    assert.equal(await page.locator('#studioResultDialog').isVisible(),true);
    await page.evaluate(()=>document.getElementById('studioResultDialog').close());
    await page.locator('#studioProjectSave').click();
    await page.waitForFunction(()=>document.getElementById('studioProjectStatus').textContent.startsWith('Salvo'));
    const download=page.waitForEvent('download');await page.locator('#studioProjectExport').click();assert.equal((await download).suggestedFilename(),'projeto-acervo.json');
    const backup=await page.evaluate(()=>window.studioTest.snapshotProject());
    await page.locator('#studioProjectNew').click();await page.waitForFunction(()=>window.studioTest.studio.objects.length===0);
    await page.locator('#studioProjectImport').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    await page.waitForFunction(()=>window.studioTest.studio.objects.length===1);
    await page.locator('#studioProjectImport').setInputFiles({name:'invalido.json',mimeType:'application/json',buffer:Buffer.from('{}')});
    await page.waitForFunction(()=>document.getElementById('studioProjectStatus').textContent.includes('inválido'));
    await page.locator('#studioProjectNew').click();await page.waitForFunction(()=>window.studioTest.studio.objects.length===0);
    await page.locator('.studio-project-panel details:nth-child(2) summary').click();
    await page.locator('#studioDesignItems input').check();await page.locator('#design-quantity').fill('2');await page.locator('#design-brief').fill('Mesas no fundo');
    await page.locator('#studioDesignBuild').click();await page.waitForFunction(()=>document.getElementById('studioDesignStatus').textContent.includes('2 itens adicionados'));
    assert.ok(requests.some(r=>r.action==='plan_layout'));
    await page.locator('#catalogLogout').click();await page.locator('#catalogLoginEmail').waitFor();
    assert.deepEqual(errors,[]);
    console.log('PASS: login, busca, tecido, PDF real/worker, páginas/cancelamento/limite, modelo 3D, câmera, renderização, backup, projetos, layout IA e logout. Respostas da IA simuladas.');
  } finally { await browser.close();server.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
