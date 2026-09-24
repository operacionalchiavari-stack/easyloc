const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
// Busca fora do cabeçalho, no canto superior direito logo abaixo dele (pedido explícito do usuário: "quero
// remover o campo de pesquisa do menu e quero colocar no canto superior direito"), e "Limpar filtros" na MESMA
// linha da pílula de filtros da tela "Categorias". Cobre: a busca não mora mais no <header>, fica colada na borda
// direita logo abaixo dele, é legível (pílula com contorno), "Pesquisar" cabe inteiro, não cobre a pílula de
// filtros em nenhuma largura de desktop, continua funcionando, some no celular e dentro de um overlay; e o
// "Limpar filtros" alinhado verticalmente com a pílula.
(async()=>{
const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c9a874"/></svg>');
const base={tipo:'Item',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[],foto_url:'https://fixture/a.png'};
const itens=[
 {...base,id:'1',produto:'Poltrona Um',categoria:'Estofados',material:'Madeira',personalizable:true},
 {...base,id:'2',produto:'Mesa Dois',categoria:'Mesas',material:'Ferro'},
 {...base,id:'3',produto:'Bar Três',categoria:'Bares',material:'Madeira'},
];
const abrir=async(viewport)=>{
 const context=await browser.newContext({viewport});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await context.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 await page.addInitScript((its)=>{
  sessionStorage.setItem('catalogo_token','test');
  window.supabaseClient={rpc:async(name)=>({data:name==='catalogo_validar_sessao'?{valido:true,empresa_id:'company',cliente_id:'client'}:name==='catalogo_capas_carregar'?{}:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:its}})};
 },itens);
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('[data-gateway-tile="catalogo"]').click();
 await page.locator('.catalog-home-grid').waitFor();
 return {context,page,errors};
};
const box=(page,s)=>page.evaluate(sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};},s);

for(const width of [1100,1280,1440,1920]){
 const {context,page,errors}=await abrir({width,height:900});
 assert.equal(await page.locator('.catalog-header .catalog-search').count(),0,'A busca saiu do cabeçalho');
 assert.equal(await page.locator('.catalog-search').isVisible(),true,'Busca visível na tela Categorias');
 const h=await box(page,'.catalog-header'),s=await box(page,'.catalog-search');
 assert.ok(s.top>=h.bottom&&s.top-h.bottom<24,`${width}: busca logo abaixo do cabeçalho (${s.top} vs ${h.bottom})`);
 assert.ok(width-s.right<=42,`${width}: busca no canto direito (sobra ${width-s.right}px)`);
 const estilo=await page.evaluate(()=>{const cs=getComputedStyle(document.querySelector('.catalog-search'));return {borda:cs.borderTopWidth,radius:cs.borderRadius,appearance:getComputedStyle(document.getElementById('catalogSearch')).appearance};});
 assert.equal(estilo.borda,'1px');assert.match(estilo.radius,/^(999|1000)px/);assert.equal(estilo.appearance,'none');
 const texto=await page.evaluate(()=>{const inp=document.getElementById('catalogSearch');const cs=getComputedStyle(inp);const c=document.createElement('span');c.style.cssText='position:absolute;visibility:hidden;white-space:pre;font:'+cs.font+';letter-spacing:'+cs.letterSpacing;c.textContent='Pesquisar';document.body.appendChild(c);const w=c.getBoundingClientRect().width;c.remove();return {precisa:w,tem:inp.getBoundingClientRect().width};});
 assert.ok(texto.tem>=texto.precisa,`${width}: "Pesquisar" cabe inteiro`);
 // Com filtro ativo (pílula + "Limpar filtros" na mesma linha): nada encosta na busca.
 await page.locator('[data-home-filter-toggle="personalizable"]').click();
 await page.locator('#catalogHomeFilterClear').waitFor();
 const pil=await box(page,'.catalog-home-filters'),limpar=await box(page,'#catalogHomeFilterClear'),resumo=await box(page,'#catalogHomeFilterSummary');
 assert.ok(Math.abs((limpar.top+limpar.bottom)/2-(pil.top+pil.bottom)/2)<3,`${width}: "Limpar filtros" na mesma linha da pílula`);
 assert.ok(limpar.left>pil.right,`${width}: "Limpar filtros" à direita da pílula`);
 assert.ok(resumo.top>=pil.bottom,`${width}: resumo continua embaixo`);
 const s2=await box(page,'.catalog-search');
 const sobrepoe=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
 assert.ok(!sobrepoe(s2,pil)&&!sobrepoe(s2,limpar),`${width}: busca não cobre os filtros`);
 // Continua buscando.
 await page.locator('#catalogSearch').fill('mesa');
 await page.waitForFunction(()=>document.querySelectorAll('[data-grid-item], .catalog-product-section').length>0);
 assert.deepEqual(errors,[]);
 await context.close();
}

// Home (Portal): sem busca e sem "← Voltar"; voltam ao entrar em Categorias.
{
 const {context,page,errors}=await abrir({width:1440,height:900});
 assert.equal(await page.locator(".catalog-search").isVisible(),true);
 await page.locator(".catalog-brand").click();
 await page.locator(".catalog-gateway").waitFor();
 assert.equal(await page.locator(".catalog-search").isVisible(),false,"Portal sem busca");
 if(await page.locator("#catalogGlobalBack").count()) assert.equal(await page.locator("#catalogGlobalBack").isVisible(),false,"Portal sem Voltar");
 await page.locator("[data-gateway-tile=\"catalogo\"]").click();
 await page.locator(".catalog-home-grid").waitFor();
 assert.equal(await page.locator(".catalog-search").isVisible(),true,"Busca volta em Categorias");
 assert.deepEqual(errors,[]);
 await context.close();
}

// Overlay (Biblioteca): a busca some, pra não cobrir a tela do overlay.
{
 const {context,page,errors}=await abrir({width:1440,height:900});
 await page.locator('.catalog-brand').click();
 await page.locator('[data-gateway-tile="biblioteca"]').click();
 await page.locator('#catalogBiblioteca:not(.hidden)').waitFor();
 assert.equal(await page.locator('.catalog-search').isVisible(),false,'Busca escondida dentro de um overlay');
 assert.deepEqual(errors,[]);
 await context.close();
}

// Celular: continua escondida (sem espaço) e sem rolagem horizontal.
{
 const {context,page,errors}=await abrir({width:390,height:844});
 assert.equal(await page.locator('.catalog-search').isVisible(),false);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);
 await context.close();
}
await browser.close();server.close();console.log('Busca no canto + limpar filtros na linha: OK');
})().catch(e=>{console.error(e);process.exit(1)});
