// Opt-in: valida catálogo externo usando uma sessão temporária, sem alterar senhas de clientes.
require('dotenv').config({quiet:true});
const {createClient}=require('@supabase/supabase-js');
const {chromium}=require('playwright');
const express=require('express');
const crypto=require('node:crypto');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
async function main(){
 if(process.env.RUN_CATALOGO_LIVE!=='1')throw new Error('Defina RUN_CATALOGO_LIVE=1');
 const url=process.env.SUPABASE_URL;assert.equal(new URL(url).host,'awemuohtvwvrdzfxwrmd.supabase.co');
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const checked=({data,error})=>{if(error)throw new Error(error.message);return data};
 const access=checked(await admin.from('catalogo_acessos').select('id,empresa_id').eq('ativo',true).limit(1))[0];
 const token=crypto.randomBytes(32).toString('hex'),sessionId=crypto.randomUUID();
 const app=express();app.use(express.static(process.cwd()));
 const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s))});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  checked(await admin.from('catalogo_sessoes').insert({id:sessionId,acesso_id:access.id,token_hash:crypto.createHash('sha256').update(token).digest('hex'),expires_at:new Date(Date.now()+600000).toISOString()}));
  const anonymous=createClient(url,'sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ',{auth:{persistSession:false,autoRefreshToken:false}});
  const start=Date.now();
  const result=checked(await anonymous.rpc('catalogo_carregar',{p_token:token}));
  console.log(JSON.stringify({rpcMs:Date.now()-start,items:result.itens.length,categories:new Set(result.itens.map(i=>i.categoria)).size,missingType:result.itens.filter(i=>!i.tipo).length,missingProductBase:result.itens.filter(i=>!Object.hasOwn(i,'produto_base')).length}));
  assert.ok(result.itens.length>0);
  assert.ok(result.itens.every(i=>Object.hasOwn(i,'produto_base')));
  assert.ok(result.itens.every(i=>i.itens_fotos.every(f=>f.cliente_id===null || f.cliente_id===result.decorador.id)));
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(token=>{sessionStorage.removeItem('login_ok');sessionStorage.setItem('catalogo_token',token)},token);
  await page.route('**/*.glb*',r=>r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/Modulos/Comercial/Catalogo/catalogo.html`);
  try{await page.locator('.catalog-product-section').first().waitFor({timeout:30000})}catch(e){console.log('Browser diagnostic:',await page.locator('body').innerText(),errors);throw e}
  const count=await page.locator('[data-header-category]').count();
  assert.equal(count,new Set(result.itens.map(i=>i.categoria)).size+1);
  const buttons=await page.locator('.catalog-group-trigger, #catalogHeaderCategories > button').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return{label:el.textContent,visible:r.width>0&&r.height>0&&r.x>=0&&r.right<=innerWidth}}));
  assert.ok(buttons.every(b=>b.visible),'Todas as categorias devem estar visíveis');
  const categories=await page.locator('[data-header-category]').evaluateAll(els=>els.map(el=>el.dataset.headerCategory).filter(key=>key!=='__destaques__'));
  const selectCategory=async category=>{
   const button=page.locator(`[data-header-category="${category}"]`);
   const group=button.locator('xpath=ancestor::details');
   if(await group.count() && await group.getAttribute('open')===null)await group.locator('summary').click();
   await button.click();
  };
  for(const category of categories){
   await selectCategory(category);
   assert.ok(await page.locator('.catalog-product-section').count(),`Categoria sem itens: ${category}`);
  }
  await page.locator('[data-header-category="__destaques__"]').click();
  const decorated=result.itens.find(i=>i.referencia==='SM009-M' && i.itens_fotos.some(f=>f.tipo==='galeria'&&f.cliente_id===result.decorador.id));
  if(decorated){
   const category=decorated.categoria.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
   await selectCategory(category);
   const variant=page.locator(`[data-variant-id="${decorated.id}"]`);
   if(await variant.count())await variant.click();
   const section=page.locator(`[data-product-id="${decorated.id}"]`);
   const event=section.locator('.product-event-image').first();
   await event.scrollIntoViewIfNeeded();
   await event.evaluate(img=>img.complete&&img.naturalWidth?Promise.resolve():new Promise((resolve,reject)=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',()=>reject(new Error('Foto ambientada não carregou')),{once:true})}));
   const eventSrc=await event.getAttribute('src');
   assert.ok(decorated.itens_fotos.some(f=>f.url===eventSrc && f.cliente_id===result.decorador.id));
   console.log('PASS: foto ambientada do SM009-M carregada no acesso do decorador');
  }
  await page.screenshot({path:path.join(os.tmpdir(),'chiavari-catalogo-cliente.png')});
  await page.setViewportSize({width:390,height:844});
  const mobile=await page.locator('.catalog-nav-toggle, .catalog-navigation > [data-studio-toggle]').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.x>=0&&r.right<=innerWidth}));
  assert.ok(mobile.every(Boolean),'Categorias visíveis no celular');
  assert.deepEqual(errors,[]);
  console.log('PASS: catálogo real externo, categorias e itens renderizados');
 }finally{
  await browser.close();server.close();checked(await admin.from('catalogo_sessoes').delete().eq('id',sessionId));
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
