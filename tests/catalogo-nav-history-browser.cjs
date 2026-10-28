const assert=require('node:assert/strict'),iniciar=require('./helpers/catalogo-browser.cjs');
(async()=>{const app=await iniciar();try{for(const width of [1440,390]){
 const {page,errors}=await app.pagina({width,height:900});const voltar=()=>width<768?page.evaluate(()=>window.appGoBack()):page.locator('#catalogGlobalBack').click();
 await page.locator('[data-gateway-tile="catalogo"]').click();await page.locator('[data-entry-without]').click();await page.locator('[data-home-category="sofas"]').click();
 assert.equal(await page.locator('#catalogViewSwitcher').isVisible(),false);
 await page.locator('[data-grid-item="1"]').click();await page.locator('#produto-1').waitFor();assert.equal(await page.locator('.catalog-product-section').count(),1);
 await voltar();await page.locator('[data-grid-item="1"]').waitFor();assert.equal(await page.locator('.catalog-product-section').count(),0);
 await voltar();await page.locator('.catalog-home-grid').waitFor();
 await page.locator('.catalog-brand').click();await page.locator('[data-gateway-tile="biblioteca"]').click();await page.locator('#catalogBiblioteca:not(.hidden)').waitFor();
 assert.equal(await page.locator('.catalog-search').isVisible(),false);await voltar();await page.locator('.catalog-gateway').waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await page.close();
 }console.log('PASS: navegacao atual, escolha de projeto, item unico, voltar e biblioteca no desktop e celular.');}finally{await app.fechar();}})().catch(e=>{console.error(e);process.exitCode=1;});
