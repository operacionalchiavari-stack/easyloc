const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const path=require('node:path');const os=require('node:os');
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c9a874"/></svg>');
await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
await page.addInitScript(()=>{
 sessionStorage.setItem('catalogo_token','test');
 window.supabaseClient={rpc:async name=>({data:name==='catalogo_validar_sessao'?{valido:true,empresa_id:'company',cliente_id:'client'}:name==='catalogo_capas_carregar'?{}:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:[
  // Estofados: 3 subcategorias distintas + 1 item sem subcategoria (deve continuar aparecendo em "Todos", nunca
  // some, mas não ganha opção própria) — e Material/Personalizáveis pra testar o filtro combinado (pedido
  // explícito do usuário, com print da barra antiga só com subcategoria: "essas subcategorias precisam estar
  // dentro de todos... e do lado vai estar os mesmos filtros da categorias, material e personalizaveis").
  {id:'1',tipo:'Item',produto:'Poltrona Águines Campo',categoria:'Estofados',subcategoria:'Poltronas',material:'Madeira',foto_url:'https://fixture/1.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  {id:'2',tipo:'Item',produto:'Sofá Alex',categoria:'Estofados',subcategoria:'Sofás',material:'Estofado Tecido',personalizable:true,foto_url:'https://fixture/2.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  {id:'3',tipo:'Item',produto:'Sofá Becca',categoria:'Estofados',subcategoria:'Sofás',material:'Estofado Tecido',foto_url:'https://fixture/3.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  {id:'4',tipo:'Item',produto:'Puff Redondo',categoria:'Estofados',subcategoria:'Puffes',material:'Veludo',foto_url:'https://fixture/4.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  {id:'5',tipo:'Item',produto:'Namoradeira Clássica',categoria:'Estofados',subcategoria:'',material:'Madeira',foto_url:'https://fixture/5.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  // Mesas: só 1 subcategoria distinta e o mesmo material nos dois — não deve mostrar filtro nenhum.
  {id:'6',tipo:'Item',produto:'Mesa Um',categoria:'Mesas',subcategoria:'Mesas de Jantar',material:'Madeira',foto_url:'https://fixture/6.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  {id:'7',tipo:'Item',produto:'Mesa Dois',categoria:'Mesas',subcategoria:'Mesas de Jantar',material:'Madeira',foto_url:'https://fixture/7.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  // Aparadores: nenhum item com subcategoria, mas 2 materiais distintos — a barra aparece só com Material
  // (sem o campo Subcategoria, sem Personalizáveis).
  {id:'8',tipo:'Item',produto:'Aparador Um',categoria:'Aparadores',subcategoria:'',material:'Madeira',foto_url:'https://fixture/8.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  {id:'9',tipo:'Item',produto:'Aparador Dois',categoria:'Aparadores',subcategoria:'',material:'Ferro',foto_url:'https://fixture/9.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
 ]}})};});
await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
await page.locator('[data-gateway-tile="catalogo"]').waitFor();
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('.catalog-home-grid').waitFor();

// ===== Categoria com 3+ subcategorias: Subcategoria vira um campo (rotulado "Todos") na MESMA barra de
// Material/Personalizáveis — pedido explícito do usuário =====
await page.locator('[data-home-category="estofados"]').click();
await page.locator('[data-grid-item]').first().waitFor();
assert.equal(await page.locator('.catalog-subcat-filter').count(),1,'Filtro aparece em Estofados (3 subcategorias distintas)');
assert.match(await page.locator('.catalog-subcat-filter .catalog-filter-label').textContent(),/Filtre por/,'Mesmo rótulo "Filtre por..." da tela Categorias');
const subcatTrigger=page.locator('[data-cat-filter-trigger="subcat"]');
assert.equal(await subcatTrigger.locator('span').textContent(),'Todos','O campo Subcategoria começa rotulado "Todos"');
assert.equal(await page.locator('[data-cat-filter-trigger="material"]').count(),1,'Material aparece do lado, igual a tela "Categorias"');
assert.equal(await page.locator('[data-cat-filter-toggle="personalizable"]').count(),1,'Personalizáveis também aparece');
assert.equal(await page.locator('[data-grid-item]').count(),5,'"Todos" mostra os 5 itens de Estofados, incluindo o sem subcategoria');

// Clicar em "Todos" abre as subcategorias — pedido literal do usuário ("quando eu clicar em todos vai aparecer
// as subcategorias, aí eu seleciono qual eu quero ver").
await subcatTrigger.click();
assert.equal(await subcatTrigger.getAttribute('aria-expanded'),'true');
const opcoesSubcat=await page.locator('[data-cat-filter-field="subcat"] [data-cat-subcat-option]').evaluateAll(els=>els.map(el=>[el.querySelector('.catalog-filter-option-label').textContent.trim(),el.querySelector('.catalog-filter-option-count').textContent.trim()]));
assert.deepEqual(opcoesSubcat,[['Todos','5'],['Poltronas','1'],['Puffes','1'],['Sofás','2']],'"Todos" + subcategorias em ordem alfabética, com contagem, sem opção pro item sem subcategoria');

await page.locator('[data-cat-subcat-option="sofas"]').click();
assert.equal(await subcatTrigger.locator('span').textContent(),'Sofás','O rótulo do campo passa a mostrar a subcategoria escolhida, igual um <select>');
assert.equal(await page.locator('[data-cat-filter-field="subcat"] .catalog-filter-panel').isHidden(),true,'Selecionar fecha o painel sozinho (diferente de Material/Estilo, que ficam abertos)');
assert.equal(await page.locator('[data-grid-item]').count(),2,'Filtro "Sofás" mostra só os 2 sofás');
const nomesSofas=await page.locator('.catalog-grid-card-name').allTextContents();
assert.deepEqual(nomesSofas.sort(),['Sofá Alex','Sofá Becca'],'Item sem subcategoria e Poltrona/Puff somem com o filtro ativo');

// Material dentro de "Sofás" já vem ESCOPADO — só os valores que existem ali (Madeira/Veludo, de outras
// subcategorias, nem aparecem como opção).
const materialTrigger=page.locator('[data-cat-filter-trigger="material"]');
await materialTrigger.click();
const opcoesMaterial=await page.locator('[data-cat-filter-field="material"] .catalog-filter-option').evaluateAll(els=>els.map(el=>[el.querySelector('.catalog-filter-option-label').textContent.trim(),el.querySelector('.catalog-filter-option-count').textContent.trim()]));
assert.deepEqual(opcoesMaterial,[['Estofado Tecido','2']],'Madeira/Veludo não aparecem: nenhum sofá usa esses materiais');
await page.locator('input[data-cat-filter-option="material"][value="estofado tecido"]').check();
assert.equal(await page.locator('[data-grid-item]').count(),2,'Sofás + Estofado Tecido: continuam os 2 (os dois sofás usam esse material)');
assert.equal(await materialTrigger.getAttribute('aria-expanded'),'true','O painel de Material continua aberto depois de marcar — mesma UX da tela "Categorias"');

// Personalizáveis combina (E) com Subcategoria + Material já ativos — só o Sofá Alex é personalizável.
await page.locator('[data-cat-filter-toggle="personalizable"]').click();
assert.equal(await page.locator('[data-grid-item]').count(),1,'Sofás + Estofado Tecido + Personalizáveis: só o Sofá Alex');
assert.equal(await page.locator('.catalog-grid-card-name').first().textContent(),'Sofá Alex');
assert.equal(await page.locator('[data-cat-filter-toggle="personalizable"]').getAttribute('aria-pressed'),'true');

// Alternar pra imersivo e voltar pra grade preserva o filtro combinado inteiro.
await page.locator('.catalog-view-switch-btn[data-view-mode="immersive"]').click();
await page.locator('.catalog-product-section').first().waitFor();
assert.equal(await page.locator('.catalog-product-section').count(),1,'Modo imersivo também respeita o filtro combinado (só o Sofá Alex)');
await page.locator('.catalog-view-switch-btn[data-view-mode="grid"]').click();
await page.locator('[data-grid-item]').first().waitFor();
assert.equal(await subcatTrigger.locator('span').textContent(),'Sofás','Filtro de subcategoria continua ativo depois de ir e voltar da imersiva');
assert.equal(await page.locator('[data-grid-item]').count(),1);

// Sair e reentrar na categoria reseta TUDO (subcategoria, material, personalizáveis) — mesmo raciocínio que já
// valia só pra subcategoria antes.
await page.locator('.catalog-brand').click();
await page.locator('.catalog-gateway').waitFor();
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('.catalog-home-grid').waitFor();
await page.locator('[data-home-category="estofados"]').click();
await page.locator('[data-grid-item]').first().waitFor();
assert.equal(await subcatTrigger.locator('span').textContent(),'Todos','Reentrar na categoria reseta a subcategoria pra "Todos"');
assert.equal(await page.locator('input[data-cat-filter-option="material"]:checked').count(),0,'...e desmarca o Material');
assert.equal(await page.locator('[data-cat-filter-toggle="personalizable"]').getAttribute('aria-pressed'),'false','...e desliga Personalizáveis');
assert.equal(await page.locator('[data-grid-item]').count(),5);

// ===== Categoria com só 1 subcategoria distinta e o mesmo material nos dois itens: sem filtro nenhum =====
await page.locator('.catalog-brand').click();
await page.locator('.catalog-gateway').waitFor();
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('.catalog-home-grid').waitFor();
await page.locator('[data-home-category="mesas"]').click();
await page.locator('[data-grid-item]').first().waitFor();
assert.equal(await page.locator('.catalog-subcat-filter').count(),0,'Sem subcategoria pra escolher, sem Material variando e sem item personalizável: barra some por completo');

// ===== Categoria sem nenhuma subcategoria cadastrada, mas com 2 materiais: a barra aparece só com Material =====
await page.locator('.catalog-brand').click();
await page.locator('.catalog-gateway').waitFor();
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('.catalog-home-grid').waitFor();
await page.locator('[data-home-category="aparadores"]').click();
await page.locator('[data-grid-item]').first().waitFor();
assert.equal(await page.locator('.catalog-subcat-filter').count(),1,'Sem nenhuma subcategoria cadastrada, mas Material tem 2 valores: a barra ainda aparece');
assert.equal(await page.locator('[data-cat-filter-trigger="subcat"]').count(),0,'...só que sem o campo Subcategoria (não haveria nada pra escolher ali)');
assert.equal(await page.locator('[data-cat-filter-trigger="material"]').count(),1);
assert.equal(await page.locator('[data-cat-filter-toggle="personalizable"]').count(),0,'Nenhum item personalizável aqui: o toggle nem aparece');

// ===== Busca não mostra o filtro (mistura categorias) =====
await page.locator('#catalogSearch').fill('sofá');
await page.locator('[data-grid-item]').first().waitFor();
assert.equal(await page.locator('.catalog-subcat-filter').count(),0,'Resultado de busca não mostra o filtro');
await page.locator('#catalogSearch').fill('');
await page.locator('[data-grid-item]').first().waitFor();

for(const width of [390,768]){
  await page.setViewportSize({width,height:844});await page.waitForTimeout(150);
  await page.locator('[data-home-category]');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Filtro sem overflow horizontal em '+width+'px');
}
await page.screenshot({path:path.join(os.tmpdir(),'catalogo-subcategoria.png')});
assert.deepEqual(errors,[]);
console.log('PASS: filtro premium dentro de uma categoria — Subcategoria virou um campo "Todos" na MESMA barra "Filtre por..." de Material/Personalizáveis (aparece só com 2+ subcategorias, cada campo aparece independente conforme tem dado), escolher combina (E) os três, Material já vem escopado pela subcategoria ativa, painel de Material fica aberto entre marcações mas o de Subcategoria fecha sozinho ao escolher, filtra a grade e a imersiva, reseta tudo ao reentrar na categoria, some na busca, sem overflow mobile');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
