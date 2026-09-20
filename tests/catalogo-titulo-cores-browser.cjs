const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const path=require('node:path');const os=require('node:os');
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{

// ===== Cenário 1: decorador externo (sem capa/bespoke), grupo de 3 cores =====
// Item sem "Experimente outro tecido" (personalizable:false) e sem botão de
// capa (decorador não vê) — o cenário exato onde a âncora de inserção das
// specs em applyVariant() ficava sem NENHUM elemento pra se apoiar antes da
// correção (ver CLAUDE.md, "Itens relacionados..."/"diminuir o nome").
{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c9a874"/></svg>');
 await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 await page.addInitScript(()=>{
  sessionStorage.setItem('catalogo_token','test');
  window.supabaseClient={rpc:async(name)=>{
   if(name==='catalogo_validar_sessao') return {data:{valido:true,empresa_id:'company',cliente_id:'client'}};
   if(name==='catalogo_carregar') return {data:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:[
     {id:'1',tipo:'Item',produto:'Poltrona Águines Campo',categoria:'Estofados',material:'Madeira',cor:'Castanho Claro',largura:.67,altura:.95,profundidade:.57,foto_url:'https://fixture/1.png',capa_categoria:false,itens_fotos:[]},
     {id:'2',tipo:'Item',produto:'Poltrona Águines Campo',categoria:'Estofados',material:'Madeira',cor:'Castanho Escuro',largura:.67,altura:.95,profundidade:.57,foto_url:'https://fixture/2.png',capa_categoria:false,itens_fotos:[]},
     {id:'3',tipo:'Item',produto:'Poltrona Águines Campo',categoria:'Estofados',material:'Madeira',cor:'Verde Musgo',largura:.67,altura:.95,profundidade:.57,foto_url:'https://fixture/3.png',capa_categoria:false,itens_fotos:[]},
   ]}};
   return {data:null};
  }};
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('[data-gateway-tile="catalogo"]').waitFor();
 await page.locator('[data-gateway-tile="catalogo"]').click();
 await page.locator('[data-home-category="estofados"]').click();
 await page.locator('[data-grid-item]').first().click();
 await page.locator('.catalog-product-section').first().waitFor();

 // Círculos moram dentro do MESMO wrapper do título, não numa seção à parte.
 assert.equal(await page.locator('.product-title-row .product-variant-swatch').count(),3,'3 círculos de cor, dentro do wrapper do título');
 assert.equal(await page.locator('.product-title-row .product-title').count(),1,'O nome do item está no mesmo wrapper dos círculos');
 assert.equal(await page.locator('.product-variants').count(),0,'Não existe mais a seção própria "Cores disponíveis" separada');

 // Pedido do usuário, com print de uma poltrona com 4 cores: "coloque os ícones das cores EM BAIXO do nome do
 // item". Antes ficavam ao lado do nome, vazando por cima da foto; agora o nome tem a sua linha e os círculos a
 // deles, logo abaixo, alinhados à esquerda com o nome.
 const titleBox=await page.locator('.product-title').boundingBox();
 const rowBox=await page.locator('.product-variants-row').boundingBox();
 const gap=rowBox.y-(titleBox.y+titleBox.height);
 assert.ok(gap>=0&&gap<40,`Círculos ficam EMBAIXO do nome, encostados nele (folga de ${Math.round(gap)}px entre o fim do nome e o começo dos círculos)`);
 assert.ok(Math.abs(rowBox.x-titleBox.x)<2,'Círculos alinhados à esquerda com o nome');
 const swatchTops=await page.locator('.product-variant-swatch').evaluateAll(els=>els.map(el=>Math.round(el.getBoundingClientRect().top)));
 assert.equal(new Set(swatchTops).size,1,'Os 3 círculos cabem numa linha só (não quebram em 2+1)');

 // As medidas saíram da linha solta abaixo do nome e viraram uma linha das specs, junto de categoria/material/cor.
 assert.equal(await page.locator('.product-dimensions').count(),0,'Não existe mais a linha de medidas solta abaixo do nome');
 const rotulos=(await page.locator('#produto-1 .product-specs-row dt').allTextContents()).map(t=>t.trim());
 assert.deepEqual(rotulos.slice(0,4),['Categoria','Material','Cor','Medidas'],'Medidas entra na lista de specs, depois de Categoria/Material/Cor');
 assert.match(await page.locator('#produto-1 .product-specs-row',{hasText:'Medidas'}).locator('dd').textContent(),/^\s*67 × 95 × 57 cm\s*$/,'Valor das medidas no mesmo formato de sempre (L × A × P cm)');
 // ...e o valor cabe numa linha só na coluna estreita do desktop (a coluna de rótulos tem a largura do maior rótulo).
 const ddAltura=await page.locator('#produto-1 .product-specs-row',{hasText:'Medidas'}).locator('dd').evaluate(el=>Math.round(el.getBoundingClientRect().height));
 assert.ok(ddAltura<24,`As medidas não quebram em duas linhas (altura ${ddAltura}px)`);

 // Clicar num círculo troca de variante — a seção inteira é atualizada
 // (applyVariant), incluindo as specs, mesmo sem bespoke card nem botão de
 // capa (decorador) — esse era exatamente o caminho sem âncora antes da
 // correção.
 assert.match(await page.locator('#produto-1 .product-specs-row',{hasText:'Cor'}).locator('dd').textContent(),/Castanho Claro/);
 await page.locator('#produto-1 .product-variant-swatch[data-variant-id="2"]').click();
 await page.waitForFunction(()=>document.querySelector('#produto-2')!==null);
 assert.match(await page.locator('#produto-2 .product-specs-row',{hasText:'Cor'}).locator('dd').textContent(),/Castanho Escuro/,'Specs atualizam pra cor da nova variante mesmo sem bespoke/capa (âncora de inserção não quebrou)');
 assert.equal(await page.locator('#produto-2 .product-variant-swatch[data-variant-id="2"]').getAttribute('class'),'product-variant-swatch active','Círculo clicado fica marcado como ativo');

 for(const width of [390,768]){
   await page.setViewportSize({width,height:844});await page.waitForTimeout(150);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Título+círculos sem overflow horizontal em '+width+'px');
 }
 assert.deepEqual(errors,[]);
 await page.close();
}

// ===== Cenário 2: item sem grupo de variantes (só 1 cor) — sem círculo nenhum =====
{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c9a874"/></svg>');
 await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 await page.addInitScript(()=>{
  sessionStorage.setItem('catalogo_token','test');
  window.supabaseClient={rpc:async(name)=>{
   if(name==='catalogo_validar_sessao') return {data:{valido:true,empresa_id:'company',cliente_id:'client'}};
   if(name==='catalogo_carregar') return {data:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:[
     {id:'1',tipo:'Item',produto:'Mesa Única',categoria:'Mesas',material:'Vidro',cor:'Transparente',largura:1.2,altura:.75,profundidade:.7,foto_url:'https://fixture/1.png',capa_categoria:false,itens_fotos:[]},
   ]}};
   return {data:null};
  }};
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('[data-gateway-tile="catalogo"]').waitFor();
 await page.locator('[data-gateway-tile="catalogo"]').click();
 await page.locator('[data-home-category="mesas"]').click();
 await page.locator('[data-grid-item]').first().click();
 await page.locator('.catalog-product-section').first().waitFor();
 assert.equal(await page.locator('.product-variant-swatch').count(),0,'Sem grupo de variantes, nenhum círculo aparece');
 assert.equal(await page.locator('.product-title-row .product-title').count(),1,'Título continua no wrapper, mesmo sozinho');
 assert.deepEqual(errors,[]);
 await page.close();
}

console.log('PASS: círculos de cor EMBAIXO do nome (numa linha só, alinhados ao nome), medidas como linha das specs (junto de categoria/material/cor, sem quebrar), sem linha de medidas solta, sem seção "Cores disponíveis" separada, specs continuam atualizando ao trocar de variante mesmo sem bespoke/capa, sem círculo quando só há 1 cor, sem overflow mobile');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
