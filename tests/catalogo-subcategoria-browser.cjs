const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const path=require('node:path');const os=require('node:os');
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c9a874"/></svg>');
await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
await page.addInitScript(()=>{
 sessionStorage.setItem('catalogo_token','test');
 window.supabaseClient={rpc:async name=>({data:name==='catalogo_validar_sessao'?{valido:true,empresa_id:'company',cliente_id:'client'}:name==='catalogo_capas_carregar'?{}:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:[
  // Estofados: 3 subcategorias distintas + 1 item sem subcategoria (deve
  // continuar aparecendo em "Todos", nunca some, mas não ganha chip próprio).
  {id:'1',tipo:'Item',produto:'Poltrona Águines Campo',categoria:'Estofados',subcategoria:'Poltronas',foto_url:'https://fixture/1.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  {id:'2',tipo:'Item',produto:'Sofá Alex',categoria:'Estofados',subcategoria:'Sofás',foto_url:'https://fixture/2.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  {id:'3',tipo:'Item',produto:'Sofá Becca',categoria:'Estofados',subcategoria:'Sofás',foto_url:'https://fixture/3.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  {id:'4',tipo:'Item',produto:'Puff Redondo',categoria:'Estofados',subcategoria:'Puffes',foto_url:'https://fixture/4.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  {id:'5',tipo:'Item',produto:'Namoradeira Clássica',categoria:'Estofados',subcategoria:'',foto_url:'https://fixture/5.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  // Mesas: só 1 subcategoria distinta (com valor) — não deve mostrar filtro nenhum.
  {id:'6',tipo:'Item',produto:'Mesa Um',categoria:'Mesas',subcategoria:'Mesas de Jantar',foto_url:'https://fixture/6.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  {id:'7',tipo:'Item',produto:'Mesa Dois',categoria:'Mesas',subcategoria:'Mesas de Jantar',foto_url:'https://fixture/7.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  // Aparadores: nenhum item com subcategoria — não deve mostrar filtro nenhum.
  {id:'8',tipo:'Item',produto:'Aparador Um',categoria:'Aparadores',subcategoria:'',foto_url:'https://fixture/8.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
 ]}})};});
await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
await page.locator('[data-gateway-tile="catalogo"]').waitFor();
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('.catalog-home-grid').waitFor();

// ===== Categoria com 3+ subcategorias: filtro aparece =====
await page.locator('[data-home-category="estofados"]').click();
await page.locator('[data-grid-item]').first().waitFor();
assert.equal(await page.locator('.catalog-subcat-filter').count(),1,'Filtro de subcategoria aparece em Estofados (3 subcategorias distintas)');
const chips=await page.locator('.catalog-subcat-chip').allTextContents();
assert.deepEqual(chips,['Todos','Poltronas','Puffes','Sofás'],'Chips ordenados alfabeticamente, "Todos" primeiro, sem chip pro item sem subcategoria');
assert.equal(await page.locator('.catalog-subcat-chip.is-active').textContent(),'Todos','"Todos" começa ativo ao entrar na categoria');
assert.equal(await page.locator('[data-grid-item]').count(),5,'"Todos" mostra os 5 itens de Estofados, incluindo o sem subcategoria');

// Seleciona "Sofás" — só os 2 itens dessa subcategoria aparecem.
await page.locator('.catalog-subcat-chip',{hasText:'Sofás'}).click();
await page.waitForTimeout(100);
assert.equal(await page.locator('[data-grid-item]').count(),2,'Filtro "Sofás" mostra só os 2 sofás');
const nomesSofas=await page.locator('.catalog-grid-card-name').allTextContents();
assert.deepEqual(nomesSofas.sort(),['Sofá Alex','Sofá Becca'],'Item sem subcategoria e Poltrona/Puff somem com o filtro ativo');
assert.equal(await page.locator('.catalog-subcat-chip.is-active').textContent(),'Sofás','Chip "Sofás" fica marcado como ativo');

// Alternar pra imersivo e voltar pra grade preserva o filtro ativo —
// agora são 2 ícones separados (um por modo), não mais um botão só que
// alterna (pedido explícito do usuário, ver seção correspondente no
// CLAUDE.md).
await page.locator('.catalog-view-switch-btn[data-view-mode="immersive"]').click();
await page.locator('.catalog-product-section').first().waitFor();
assert.equal(await page.locator('.catalog-product-section').count(),2,'Modo imersivo também respeita o filtro ativo (só os 2 sofás)');
await page.locator('.catalog-view-switch-btn[data-view-mode="grid"]').click();
await page.locator('[data-grid-item]').first().waitFor();
assert.equal(await page.locator('.catalog-subcat-chip.is-active').textContent(),'Sofás','Filtro continua ativo depois de ir e voltar da imersiva');
assert.equal(await page.locator('[data-grid-item]').count(),2);

// Volta pra "Todos".
await page.locator('.catalog-subcat-chip',{hasText:'Todos'}).click();
await page.waitForTimeout(100);
assert.equal(await page.locator('[data-grid-item]').count(),5,'"Todos" de novo mostra os 5 itens');

// Escolhe uma subcategoria sem nenhum item (impossível pela UI, mas testa
// o caminho de "0 itens depois do filtro" via clique + categoria vazia
// de verdade): sai e reentra pra conferir que o filtro reseta sozinho.
await page.locator('.catalog-subcat-chip',{hasText:'Puffes'}).click();
await page.waitForTimeout(100);
assert.equal(await page.locator('[data-grid-item]').count(),1);
await page.locator('.catalog-brand').click();
await page.locator('.catalog-gateway').waitFor();
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('.catalog-home-grid').waitFor();
await page.locator('[data-home-category="estofados"]').click();
await page.locator('[data-grid-item]').first().waitFor();
assert.equal(await page.locator('.catalog-subcat-chip.is-active').textContent(),'Todos','Reentrar na categoria reseta o filtro pra "Todos"');
assert.equal(await page.locator('[data-grid-item]').count(),5);

// ===== Categoria com só 1 subcategoria distinta: sem filtro =====
await page.locator('.catalog-brand').click();
await page.locator('.catalog-gateway').waitFor();
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('.catalog-home-grid').waitFor();
await page.locator('[data-home-category="mesas"]').click();
await page.locator('[data-grid-item]').first().waitFor();
assert.equal(await page.locator('.catalog-subcat-filter').count(),0,'Categoria com só 1 subcategoria distinta não mostra filtro nenhum');

// ===== Categoria sem nenhuma subcategoria cadastrada: sem filtro =====
await page.locator('.catalog-brand').click();
await page.locator('.catalog-gateway').waitFor();
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('.catalog-home-grid').waitFor();
await page.locator('[data-home-category="aparadores"]').click();
await page.locator('[data-grid-item]').first().waitFor();
assert.equal(await page.locator('.catalog-subcat-filter').count(),0,'Categoria sem nenhum item com subcategoria não mostra filtro nenhum');

// ===== Busca não mostra filtro de subcategoria (mistura categorias) =====
await page.locator('#catalogSearch').fill('sofá');
await page.locator('[data-grid-item]').first().waitFor();
assert.equal(await page.locator('.catalog-subcat-filter').count(),0,'Resultado de busca não mostra filtro de subcategoria');
await page.locator('#catalogSearch').fill('');
await page.locator('[data-grid-item]').first().waitFor();

for(const width of [390,768]){
  await page.setViewportSize({width,height:844});await page.waitForTimeout(150);
  await page.locator('[data-home-category]');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Filtro de subcategoria sem overflow horizontal em '+width+'px');
}
await page.screenshot({path:path.join(os.tmpdir(),'catalogo-subcategoria.png')});
assert.deepEqual(errors,[]);
console.log('PASS: filtro premium de subcategoria — aparece só com 2+ subcategorias distintas, filtra a grade e a imersiva, preserva o filtro ao alternar de modo, reseta ao reentrar na categoria, some na busca, sem overflow mobile');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
