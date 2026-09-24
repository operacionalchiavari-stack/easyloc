const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
const { installMock } = require('./mock-projetos.cjs');
// Ordem dos itens da categoria definida pela equipe interna arrastando os cards (pedido do usuário: "essa função deve
// ser somente da equipe interna da Chiavari... arrastar a estante Lord na frente da estante Cacau... e aquela posição
// passa a ser a padrão que todos os decoradores vão ver"). Cobre: equipe vê os cards arrastáveis e a alça; arrastar
// muda a posição na tela e grava via RPC catalogo_reordenar (todas as posições da categoria); a ordem se mantém ao sair
// e voltar; o decorador NÃO consegue arrastar e vê os itens na ordem que veio do banco (ordem_exposicao_site),
// com os sem ordem no fim.
const PNG_1X1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
(async()=>{
const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const base='http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html';
const browser=await chromium.launch({channel:'msedge',headless:true});
const nomes=(page)=>page.locator('.catalog-grid-card .catalog-grid-card-name').allTextContents();

// ===== Equipe interna =====
{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/png',body:PNG_1X1}));
 await page.addInitScript(installMock,{staff:true});
 await page.goto(base);
 await page.locator('[data-gateway-tile="catalogo"]').click();
 await page.locator('[data-home-category="sofas"]').click();
 await page.locator('.catalog-grid-card').first().waitFor();
 assert.deepEqual(await nomes(page),['Sofá Um','Sofá Dois']);
 assert.equal(await page.locator('.catalog-grid-card[draggable="true"]').count(),2,'Cards arrastáveis pra equipe');
 await page.locator('.catalog-grid-card').first().hover();
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.catalog-grid-card .catalog-grid-drag')).opacity==='1',null,{timeout:3000});
 await page.locator('.catalog-grid-card').nth(1).dragTo(page.locator('.catalog-grid-card').nth(0),{targetPosition:{x:10,y:60}});
 await page.waitForFunction(()=>window.mockdb.calls.some(c=>c.name==='catalogo_reordenar'));
 assert.deepEqual(await nomes(page),['Sofá Dois','Sofá Um'],'Arrastar muda a posição na tela');
 const call=await page.evaluate(()=>window.mockdb.calls.find(c=>c.name==='catalogo_reordenar').params);
 assert.equal(call.p_empresa_id,'company');
 assert.deepEqual(call.p_itens,[{id:'2',ordem:10},{id:'1',ordem:20}],'Grava a posição de todos os itens da categoria');
 await page.locator('.catalog-notification',{hasText:'Ordem salva'}).waitFor();
 assert.equal(await page.locator('.catalog-product-section').count(),0,'Arrastar não abre o item');
 // Sai e volta: continua na ordem nova.
 await page.locator('[data-timeline-entry]').last().click();
 await page.locator('.catalog-home-grid').waitFor();
 await page.locator('[data-home-category="sofas"]').click();
 await page.locator('.catalog-grid-card').first().waitFor();
 assert.deepEqual(await nomes(page),['Sofá Dois','Sofá Um'],'Ordem mantida ao voltar pra categoria');
 // Clique normal ainda abre o item.
 await page.locator('.catalog-grid-card').first().click();
 await page.locator('.catalog-product-section').first().waitFor();
 // Tela "Categorias": mesma função (pedido: "quero que a mesma função seja aplicada dentro de categorias").
 await page.locator('[data-timeline-entry]').filter({hasText:'Categorias'}).last().click();
 await page.locator('.catalog-home-grid').waitFor();
 const cats=()=>page.locator('.catalog-home-card .catalog-grid-card-name').allTextContents();
 assert.deepEqual(await cats(),['Sofás','Mesas']);
 assert.equal(await page.locator('.catalog-home-card[draggable="true"]').count(),2,'Categorias arrastáveis pra equipe');
 // Arrasto com o mouse "de verdade" (em passos): a Home tira a centralização da última linha assim que o arrasto
 // começa, então o alvo muda de lugar — mede de novo depois do primeiro movimento, como uma pessoa acompanharia.
 {const src=await page.locator('.catalog-home-card').nth(1).boundingBox();
  await page.mouse.move(src.x+src.width/2,src.y+40);await page.mouse.down();await page.mouse.move(src.x+src.width/2+15,src.y+45,{steps:4});
  const alvo=await page.locator('.catalog-home-card').nth(0).boundingBox();
  await page.mouse.move(alvo.x+10,alvo.y+60,{steps:10});await page.mouse.up();}
 await page.waitForFunction(()=>window.mockdb.calls.some(c=>c.name==='catalogo_categorias_reordenar'));
 assert.deepEqual(await cats(),['Mesas','Sofás'],'Arrastar muda a posição da categoria');
 const callCat=await page.evaluate(()=>window.mockdb.calls.find(c=>c.name==='catalogo_categorias_reordenar').params);
 assert.deepEqual(callCat,{p_empresa_id:'company',p_categorias:['Mesas','Sofás']},'Grava pelo nome da categoria');
 await page.locator('.catalog-home-card').first().click();
 await page.locator('.catalog-grid-card').first().waitFor();
 assert.deepEqual(await nomes(page),['Mesa Um'],'Clique na categoria ainda abre ela');
 assert.deepEqual(errors,[]);
 await page.close();
}

// ===== Decorador: ordem do banco, sem arrastar =====
{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/png',body:PNG_1X1}));
 const b={tipo:'Item',categoria:'Estantes',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[],foto_url:'https://fixture/a.png'};
 const itens=[{...b,id:'a',produto:'Estante Cacau',ordem_exposicao_site:30,categoria_ordem:20},{...b,id:'b',produto:'Estante Lord',ordem_exposicao_site:10,categoria_ordem:20},{...b,id:'c',produto:'Estante Aurora',ordem_exposicao_site:null,categoria_ordem:20},{...b,id:'d',produto:'Estante Collin',ordem_exposicao_site:20,categoria_ordem:20},
  {...b,id:'e',categoria:'Aparadores',produto:'Aparador Um',categoria_ordem:null},{...b,id:'f',categoria:'Bares',produto:'Bar Um',categoria_ordem:10}];
 await page.addInitScript((its)=>{
  sessionStorage.setItem('catalogo_token','test');
  window.calls=[];
  window.supabaseClient={rpc:async(name,params)=>{window.calls.push(name);return {data:name==='catalogo_validar_sessao'?{valido:true,empresa_id:'company',cliente_id:'client'}:name==='catalogo_capas_carregar'?{}:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:its}};}};
 },itens);
 await page.goto(base);
 await page.locator('[data-gateway-tile="catalogo"]').click();
 await page.locator('.catalog-home-grid').waitFor();
 assert.deepEqual(await page.locator('.catalog-home-card .catalog-grid-card-name').allTextContents(),['Bares','Estantes','Aparadores'],'Decorador vê as categorias na ordem da equipe (sem ordem no fim)');
 assert.equal(await page.locator('.catalog-home-card[draggable="true"]').count(),0,'Decorador não arrasta categorias');
 await page.locator('[data-home-category="estantes"]').click();
 await page.locator('.catalog-grid-card').first().waitFor();
 assert.deepEqual(await nomes(page),['Estante Lord','Estante Collin','Estante Cacau','Estante Aurora'],'Decorador vê a ordem definida pela equipe (sem ordem no fim)');
 assert.equal(await page.locator('.catalog-grid-card[draggable="true"]').count(),0,'Decorador não arrasta');
 assert.equal(await page.locator('.catalog-grid-drag').count(),0,'Decorador não vê a alça');
 await page.locator('.catalog-grid-card').nth(3).dragTo(page.locator('.catalog-grid-card').nth(0));
 await page.waitForTimeout(300);
 assert.equal(await page.evaluate(()=>window.calls.includes('catalogo_reordenar')),false,'Nada é gravado pelo decorador');
 // Imersiva segue a mesma ordem.
 await page.locator('[data-view-mode="immersive"]').click();
 await page.locator('.catalog-product-section').first().waitFor();
 assert.equal(await page.locator('.catalog-product-section .product-title').first().textContent(),'Estante Lord');
 assert.deepEqual(errors,[]);
 await page.close();
}
await browser.close();server.close();
console.log('PASS: ordem por arrastar — só equipe interna, grava via catalogo_reordenar, mantém ao voltar, decorador vê a ordem do banco e não arrasta');
})().catch(e=>{console.error(e);process.exit(1)});
