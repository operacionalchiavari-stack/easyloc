const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const vp of [{width:1440,height:900},{width:390,height:844}]){
 const page=await browser.newPage({viewport:vp});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#8fae9b"/></svg>');
 await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 await page.addInitScript(()=>{
  sessionStorage.setItem('login_ok','1');
  function builder(v){return new Proxy({},{get(_t,p){if(p==='then')return r=>r(v());return()=>builder(v);}});}
  window.supabaseClient={
   auth:{getSession:async()=>({data:{session:{user:{id:'u'}}},error:null}),getUser:async()=>({data:{user:{id:'u'}},error:null})},
   from(t){if(t==='usuarios_empresas')return builder(()=>({data:{empresa_id:'company'},error:null}));return builder(()=>({data:[],error:null}));},
   rpc:async(name)=>{
    if(name==='funcionario_contexto')return{data:{ativo:true,administrador_legado:true},error:null};
    if(name==='catalogo_carregar_interno')return{data:{empresa:{nome:'Chiavari'},decorador:null,itens:[
     {id:'1',tipo:'Item',produto:'Sofá Becca',categoria:'Estofados',material:'Junco e Ferro',cor:'Fendi Claro',foto_url:'https://fixture/s.png',personalizable:true,largura:2.6,altura:.76,profundidade:.97,itens_fotos:[],itens_modelos_3d:[]},
     {id:'2',tipo:'Item',produto:'Sofá Liso',categoria:'Estofados',foto_url:'https://fixture/t.png',personalizable:false,itens_fotos:[],itens_modelos_3d:[]},
    ]},error:null};
    return{data:null,error:null};},
   storage:{from(){return{getPublicUrl:p=>({data:{publicUrl:p}})};}},
   functions:{invoke:async()=>({data:null,error:null})},
  };
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('[data-gateway-tile="catalogo"]').click();
 await page.locator('[data-home-category]').first().click();
 await page.locator('[data-grid-item="1"]').click();
 const sec=page.locator('.catalog-product-section[data-product-id="1"]');
 await sec.waitFor();await page.waitForTimeout(2600);
 assert.equal(await page.locator('.product-bespoke-card').count(),0,'cartão antigo sumiu');
 const icon=sec.locator('.product-title-line .product-bespoke-icon');
 assert.equal(await icon.count(),1,'botão junto do nome');
 const g=await page.evaluate(()=>{const s=document.querySelector('.catalog-product-section[data-product-id="1"]');const t=s.querySelector('.product-title').getBoundingClientRect();const i=s.querySelector('.product-bespoke-icon').getBoundingClientRect();return{t:{l:t.left,r:t.right,cy:(t.top+t.bottom)/2},i:{l:i.left,w:i.width,h:i.height,cy:(i.top+i.bottom)/2},sw:document.documentElement.scrollWidth,iw:innerWidth};});
 assert.ok(g.i.l>=g.t.r-1||g.i.cy>g.t.cy,'botão à direita ou abaixo do nome');

 assert.ok(g.i.h<=34,'botão baixo');
 if(vp.width<500) assert.ok(g.sw<=g.iw,'sem overflow mobile');
 await page.screenshot({path:require('node:os').tmpdir()+'/tecido-icone-'+vp.width+'.png'});
 if(vp.width>500){
  await icon.hover();await page.waitForTimeout(300);
  await page.screenshot({path:require('node:os').tmpdir()+'/tecido-icone-hover.png',clip:{x:0,y:60,width:760,height:260}});
  await icon.click();await page.locator('#catalogCustomizeDialog[open]').waitFor();
 }
 assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
