const {chromium}=require('playwright');
const express=require('express');const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const rows=[{id:'real-item',tipo:'Item',produto:'Estante Collin com Base de Aparador',categoria:'Armários e Estantes',material:'Madeira',cor:'Castanho Claro',largura:2.1,altura:2.25,profundidade:.48,valor_locacao:1200,foto_url:(fs.existsSync('outputs/catalogo-precos-fixture.json') ? JSON.parse(fs.readFileSync('outputs/catalogo-precos-fixture.json','utf8')).find(row=>row.foto_url)?.foto_url : null)}];
  assert.ok(rows.length);
  const base={...rows[0],id:'price-a',produto:'Estante teste',produto_base:null,cor:'Natural',valor_locacao:1250.5};
  const items=[...rows,base,{...base,id:'price-b',cor:'Preto',valor_locacao:890},{...base,id:'no-price',produto:'Item sem valor',valor_locacao:null},{...base,id:'zero-price',produto:'Item cortesia',valor_locacao:0}];
  for(const internal of [false,true]){
   const page=await browser.newPage({viewport:{width:1440,height:960}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(({items,internal})=>{
    sessionStorage.setItem(internal?'login_ok':'catalogo_token',internal?'1':'test');
    const builder=new Proxy({},{get(_t,p){if(p==='then')return resolve=>resolve({data:{empresa_id:'company'},error:null});return ()=>builder;}});
    window.supabaseClient={auth:{getSession:async()=>({data:{session:internal?{user:{id:'user'}}:null}}),getUser:async()=>({data:{user:internal?{id:'user'}:null}})},from:()=>builder,rpc:async(name)=>{
     if(name==='funcionario_contexto')return {data:{ativo:true,administrador_legado:true}};
     if(name==='catalogo_validar_sessao')return {data:{valido:true,empresa_id:'company',cliente_id:'client'}};
     if(name==='catalogo_carregar'||name==='catalogo_carregar_interno')return {data:{empresa:{nome:'Chiavari'},decorador:internal?null:{nome:'Kelly'},itens:items}};
     return {data:null,error:null};
    }};
   },{items,internal});
   await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
   await page.locator('[data-gateway-tile="catalogo"]').click();await page.locator('[data-home-category]').first().click();
   const card=page.locator('[data-grid-item="price-a"]');
   assert.match(await card.locator('.catalog-rental-price').textContent(),/1\.250,50/);
   assert.match(await page.locator('[data-grid-item="no-price"] .catalog-rental-price').textContent(),/Sob consulta/);
   assert.match(await page.locator('[data-grid-item="zero-price"] .catalog-rental-price').textContent(),/0,00/);
   await card.locator('[data-grid-variant="price-b"]').click();
   assert.match(await page.locator('[data-grid-item="price-b"] .catalog-rental-price').textContent(),/890,00/);
   if(!internal)await page.screenshot({path:'outputs/catalogo-valores-grade.png',fullPage:true});
   await page.locator('[data-grid-item="price-b"]').click();
   const detail=page.locator('.catalog-product-section[data-product-id="price-b"]');
   await detail.waitFor({state:'visible'});
   assert.match(await detail.locator('.catalog-rental-price').textContent(),/890,00/);
   await detail.locator('[data-variant-id="price-a"]').click();
   const selected=page.locator('.catalog-product-section[data-product-id="price-a"]');
   assert.match(await selected.locator('.catalog-rental-price').textContent(),/1\.250,50/);
   await selected.scrollIntoViewIfNeeded();
   if(!internal)await page.screenshot({path:'outputs/catalogo-valores-item.png',fullPage:false});
   await page.setViewportSize({width:390,height:844});
   assert.ok(await selected.locator('.catalog-rental-price').isVisible());
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await selected.locator('.catalog-rental-price').scrollIntoViewIfNeeded();
   if(!internal)await page.screenshot({path:'outputs/catalogo-valores-mobile.png',fullPage:false});
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS: valores na grade e detalhe, variantes, nulo, zero, acessos interno e externo, mobile.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
