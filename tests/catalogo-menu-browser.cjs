const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const path=require('node:path');const os=require('node:os');
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c9a874"/></svg>');await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));await page.addInitScript(()=>{sessionStorage.setItem('catalogo_token','test');window.supabaseClient={rpc:async name=>({data:name==='catalogo_validar_sessao'?{valido:true,empresa_id:'company',cliente_id:'client'}:name==='catalogo_capas_carregar'?{}:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:[
 {id:'1',tipo:'Item',produto:'Poltrona Um',categoria:'Estofados',foto_url:'https://fixture/estofado-2.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
 {id:'2',tipo:'Item',produto:'Sofá Dois',categoria:'Estofados',foto_url:'https://fixture/capa-estofados.png',capa_categoria:true,itens_fotos:[],itens_modelos_3d:[]},
 {id:'3',tipo:'Item',produto:'Mesa Um',categoria:'Mesas',foto_url:'https://fixture/mesa-1.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
 {id:'4',tipo:'Item',produto:'Aparador Um',categoria:'Aparadores',foto_url:'https://fixture/aparador-1.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
]}})};});
await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
// Primeira tela agora é o Portal (Catálogo/Biblioteca/Módulo 3D) — entra
// na Home de categorias pelo bloco "Catálogo".
await page.locator('[data-gateway-tile="catalogo"]').waitFor();
await page.locator('[data-gateway-tile="catalogo"]').click();
// Título "Categorias" foi removido da Home (duplicava o rótulo do
// cabeçalho — ver #catalogPageLabel/.catalog-grid-heading logo abaixo).
await page.locator('.catalog-home-grid').waitFor();
assert.equal(await page.locator('.catalog-header').evaluate(e=>e.offsetHeight),76,'Cabeçalho mantém a altura fixa mesmo sem o menu de categorias');
assert.equal(await page.locator('.catalog-grid-heading').count(),0,'Sem título "Categorias" no corpo da página — duplicava o rótulo do cabeçalho');
assert.equal(await page.locator('[data-home-category]').count(),3,'Um card por categoria distinta');
assert.equal(await page.locator('.catalog-header-categories,[data-header-category],.catalog-nav-toggle,.catalog-category-group').count(),0,'Menu de categorias do cabeçalho não existe mais — só a Home navega por categoria');
assert.equal(await page.locator('#catalogViewSwitcher').isVisible(),false,'Ícones de imersivo/grade ficam escondidos na Home (não se aplicam a ela)');
// Botões "Biblioteca"/"Painel 3D" removidos do cabeçalho (pedido
// explícito do usuário) — no lugar deles, um rótulo com o nome da
// página atual. A comparação de fonte com ".catalog-grid-heading" está
// mais abaixo (depois de entrar numa categoria), porque esse título foi
// removido da Home nesse meio-tempo (duplicava o rótulo — pedido
// seguinte: "como o nome está no menu, o que está embaixo pode remover
// pra não ficar duplicado") e só sobrevive pro título de busca.
assert.equal(await page.locator('[data-biblioteca-toggle],[data-studio-toggle]').count(),0,'Botões Biblioteca/Painel 3D não existem mais no cabeçalho');
assert.equal(await page.locator('#catalogPageLabel').textContent(),'Categoria','Rótulo do cabeçalho mostra "Categoria" na Home');
const estofadosImg=await page.locator('[data-home-category="estofados"] img').getAttribute('src');
assert.ok(estofadosImg.includes('capa-estofados'),'Categoria com item marcado capa_categoria usa a foto desse item');
const mesasImg=await page.locator('[data-home-category="mesas"] img').getAttribute('src');
assert.ok(mesasImg.includes('mesa-1'),'Categoria sem capa marcada cai pra foto do primeiro item');
// Fotos maiores (pedido explícito do usuário: "quero que aumente essas
// fotos") — coluna mínima da grade subiu de 130px pra 190px, depois
// pedido pra diminuir "um pouco" — 190px voltou pra 160px.
const photoBox=await page.locator('[data-home-category="estofados"] .catalog-grid-card-photo').boundingBox();
assert.ok(photoBox.width>=160,`Foto do card da Home devia ter pelo menos 160px, veio ${photoBox.width}`);
// Efeito de hover: só zoom na foto (pedido explícito do usuário; uma
// versão anterior tinha também escurecer+sombra+"levantar"+sublinhado,
// removida a pedido dele: "não quero que tenha essa mudança de cor
// deixando mais escuro, essa sombra. quero apenas que deixe o zoom").
// O PRÓXIMO clique (linha abaixo, depois de passar o mouse) continua
// sendo o teste de verdade contra o bug já visto aqui uma vez: qualquer
// efeito de hover que mexa no transform do PRÓPRIO <button> clicável
// (em vez de um filho) faz o Playwright travar esperando o elemento
// "estabilizar" antes de clicar — o mesmo problema afetaria a precisão
// de um clique real.
await page.locator('[data-home-category="estofados"]').hover();
await page.waitForTimeout(600);
const imgTransform=await page.locator('[data-home-category="estofados"] .catalog-grid-card-photo img').evaluate(el=>getComputedStyle(el).transform);
assert.notEqual(imgTransform,'none','Foto do card dá zoom no hover');
await page.screenshot({path:path.join(os.tmpdir(),'catalogo-home-desktop.png')});
await page.locator('[data-home-category="estofados"]').click();
// Pedido explícito do usuário, com print mostrando a grade aberta numa
// categoria: "quando eu clicar em categoria, eu quero que apareça
// assim, sempre" — entrar numa categoria agora abre na visualização em
// GRADE por padrão (não mais direto na imersiva em tela cheia).
await page.locator('[data-grid-item]').first().waitFor();
assert.equal(await page.locator('.catalog-product-section').count(),0,'Categoria abre em grade, não direto na imersiva');
assert.equal(await page.locator('.catalog-view-switch-btn[data-view-mode="grid"].is-active').count(),1,'Ícone "grade" no canto direito reflete o modo ativo');
// Rótulo do cabeçalho na MESMA fonte do título "CATEGORIAS" que a
// página mostrava antes de ser removido (pedido explícito do usuário:
// "o que deve aparecer no menu deve ser exatamente aquela escrita ali
// na parte de baixo categorias, mesma fonte, mesmo tamanho, mesma
// coisa"). A classe .catalog-grid-heading (mesma regra de fonte)
// sobrevive só pro título de busca ("Resultados da busca", o único caso
// que não duplica o rótulo) — usa esse elemento renderizado de verdade
// pra comparar via getComputedStyle, já em modo grade (categoria já
// força isso, então a busca aqui também renderiza em grade).
assert.equal(await page.locator('#catalogPageLabel').textContent(),'Estofados');
await page.locator('#catalogSearch').fill('sofá');
await page.locator('.catalog-grid-heading').waitFor();
const [labelFont,headingFont]=await Promise.all([
  page.locator('#catalogPageLabel').evaluate(el=>{const s=getComputedStyle(el);return {family:s.fontFamily,size:s.fontSize,weight:s.fontWeight,spacing:s.letterSpacing,transform:s.textTransform};}),
  page.locator('.catalog-grid-heading').evaluate(el=>{const s=getComputedStyle(el);return {family:s.fontFamily,size:s.fontSize,weight:s.fontWeight,spacing:s.letterSpacing,transform:s.textTransform};}),
]);
assert.deepEqual(labelFont,headingFont,'Rótulo do cabeçalho usa exatamente a mesma fonte/tamanho/peso/espaçamento/caixa do título "CATEGORIAS"');
await page.locator('#catalogSearch').fill('');
await page.locator('[data-grid-item]').first().waitFor();
await page.locator('[data-grid-item]').first().click();
await page.locator('.catalog-product-section').first().waitFor();
assert.equal(await page.locator('#catalogViewSwitcher').isVisible(),true,'Dentro de uma categoria os ícones de imersivo/grade reaparecem');
// Logo agora volta pro Portal (o novo "início"), não direto pra Home.
await page.locator('.catalog-brand').click();
await page.locator('.catalog-gateway').waitFor();
assert.equal(await page.locator('[data-gateway-tile]').count(),3,'Clicar na logo de dentro de uma categoria volta pro Portal');
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('.catalog-home-grid').waitFor();
assert.equal(await page.locator('[data-home-category]').count(),3,'Do Portal, o bloco Catálogo volta pra Home de categorias');
for(const width of [390,768]){await page.setViewportSize({width,height:844});await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Sem overflow horizontal na Home em '+width+'px');await page.screenshot({path:path.join(os.tmpdir(),'catalogo-home-'+width+'.png')});}
assert.deepEqual(errors,[]);
console.log('PASS: Home com um card por categoria, capa explícita e fallback pro primeiro item, fotos maiores com hover premium (zoom sem travar o clique), navegação categoria->Portal->Home pela logo, sem menu de categorias no cabeçalho, sem overflow mobile');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
