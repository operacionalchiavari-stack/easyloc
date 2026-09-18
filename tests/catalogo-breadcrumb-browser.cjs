const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
// Trilha de navegação "Catálogo / Categoria / Item" flutuando (overlay)
// logo abaixo do cabeçalho (pedido explícito do usuário: "pra pessoa
// saber o caminho que ela percorreu"; depois, "a foto está indo só até
// a linha, eu quero que ela vá até o menu" — a trilha virou overlay
// pra não empurrar a foto ambientada em tela cheia pra baixo) — cobre
// TODAS as telas de dentro do módulo Catálogo (não só a navegação de
// produtos: usuário confirmou depois que faltava também na Biblioteca).
// Só o Portal fica sem trilha (ponto de partida, ainda não há caminho
// nenhum percorrido).
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{

const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#8fae9b"/></svg>');
await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
await page.addInitScript(()=>{
 sessionStorage.setItem('catalogo_token','test');
 window.supabaseClient={rpc:async(name)=>{
  if(name==='catalogo_validar_sessao') return {data:{valido:true,empresa_id:'company',cliente_id:'client'}};
  if(name==='catalogo_carregar') return {data:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:[
    {id:'1',tipo:'Item',produto:'Sofá Um',categoria:'Sofás',foto_url:'https://fixture/sofa1.png',itens_fotos:[]},
    {id:'2',tipo:'Item',produto:'Sofá Dois',categoria:'Sofás',foto_url:'https://fixture/sofa2.png',itens_fotos:[]},
    {id:'3',tipo:'Item',produto:'Cadeira Um',categoria:'Cadeiras',foto_url:'https://fixture/cadeira1.png',itens_fotos:[]},
  ]}};
  if(name==='biblioteca_carregar') return {data:{fotos:[]}};
  if(name==='catalogo_capas_carregar') return {data:{}};
  return {data:null};
 }};
});
await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
await page.locator('.catalog-gateway').waitFor();
assert.equal(await page.locator('#catalogBreadcrumb.hidden').count(),1,'Portal: sem trilha (ainda não há caminho nenhum percorrido)');

// Biblioteca aberta DIRETO do Portal, sem passar pela Home — o overlay
// pode abrir com state.activeView ainda em GATEWAY_VIEW; a trilha
// precisa considerar o overlay ANTES desse cheque.
await page.locator('[data-gateway-tile="biblioteca"]').click();
await page.waitForTimeout(200);
assert.match(await page.locator('#catalogBreadcrumb').innerText(),/CATÁLOGO.*BIBLIOTECA/s,'Biblioteca aberta direto do Portal já mostra a trilha');

await page.locator('[data-breadcrumb="home"]').click();
await page.waitForTimeout(200);
assert.ok(await page.locator('#catalogBiblioteca.hidden').count(),'Clicar em "Catálogo" dentro da Biblioteca fecha o overlay');
assert.ok(await page.locator('#catalogGrid .catalog-home-grid').first().isVisible(),'...e volta pra Home');
assert.equal((await page.locator('#catalogBreadcrumb').innerText()).trim(),'CATÁLOGO','Home: trilha com 1 segmento só ("Catálogo"), não escondida');

// Botão "Painel 3D" do cabeçalho foi removido (pedido explícito do
// usuário) — só dá pra abrir pelo bloco do Portal agora, passando pelo
// mini-menu novo do Módulo 3D (pedido explícito: "quero que apareça
// como se fosse outro mini menu"). A trilha ganha um 3º nível aqui:
// Catálogo / Módulo 3D / Painel 3D — o "Módulo 3D" do meio volta pro
// mini-menu, não mais pro estúdio direto.
await page.locator('.catalog-brand').click();
await page.locator('[data-gateway-tile="modulo3d"]').click();
await page.waitForTimeout(200);
assert.match(await page.locator('#catalogBreadcrumb').innerText(),/CATÁLOGO.*MÓDULO 3D/s,'Mini-menu do Módulo 3D também ganha a trilha (Catálogo / Módulo 3D)');
await page.locator('[data-modulo3d-card="estudio"]').click();
await page.waitForTimeout(200);
assert.match(await page.locator('#catalogBreadcrumb').innerText(),/CATÁLOGO.*MÓDULO 3D.*PAINEL 3D/s,'Painel 3D ganha a trilha de 3 níveis (Catálogo / Módulo 3D / Painel 3D)');
await page.locator('[data-breadcrumb="modulo3d"]').click();
await page.waitForTimeout(200);
assert.ok(await page.locator('#catalogStudio.hidden').count(),'Clicar em "Módulo 3D" na trilha, de dentro do Painel 3D, volta pro mini-menu (fecha o estúdio)');
assert.ok(await page.locator('.catalog-modulo3d-menu').first().isVisible(),'...e mostra o mini-menu de novo');
await page.locator('[data-breadcrumb="home"]').click();
await page.waitForTimeout(200);

await page.locator('[data-home-category="sofas"]').click();
// Pedido explícito do usuário, com print da grade aberta numa
// categoria: "quando eu clicar em categoria, eu quero que apareça
// assim, sempre" — categoria abre em GRADE por padrão agora, não mais
// direto na imersiva; sem item nenhum "em foco" ainda, a trilha mostra
// só Catálogo/Categoria (2 segmentos).
await page.locator('[data-grid-item]').first().waitFor();
assert.equal((await page.locator('#catalogBreadcrumb').innerText()).replace(/\s+/g,' ').trim(),'CATÁLOGO / SOFÁS','Categoria em modo grade: trilha sem item (nenhum em foco)');
await page.locator('[data-grid-item]').first().click();
await page.locator('#produto-1').waitFor();
await page.waitForTimeout(200);
assert.match(await page.locator('#catalogBreadcrumb').innerText(),/CATÁLOGO.*SOFÁS.*SOFÁ UM/s,'Dentro de uma categoria: Catálogo / Categoria / item em foco');

// A trilha é overlay (position:absolute, flutua por CIMA do conteúdo,
// não empurra pra baixo) — pedido explícito do usuário depois de ver a
// primeira versão: "a foto está indo só até a linha [da trilha], eu
// quero que ela vá até o menu". --header-h volta a refletir só a altura
// do cabeçalho (não cabeçalho+trilha); a foto ambientada em tela cheia
// (.product-event-panel) precisa encostar exatamente no fim do
// cabeçalho, e o título do item não pode ficar coberto pela trilha
// flutuando por cima.
const headerBox=await page.locator('.catalog-header').boundingBox();
const eventPanelBox=await page.locator('#produto-1 .product-event-panel').boundingBox();
assert.ok(Math.abs(eventPanelBox.y-(headerBox.y+headerBox.height))<2,'Foto ambientada encosta exatamente no fim do cabeçalho (a trilha não empurra ela pra baixo)');
const breadcrumbBox=await page.locator('#catalogBreadcrumb').boundingBox();
assert.ok(Math.abs(breadcrumbBox.y-(headerBox.y+headerBox.height))<2,'Trilha flutua colada no fim do cabeçalho');
const titleBox=await page.locator('#produto-1 .product-title').boundingBox();
assert.ok(titleBox.y>=breadcrumbBox.y+breadcrumbBox.height,'Título do item não fica coberto pela trilha flutuante');

await page.locator('#produto-2').scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
assert.match(await page.locator('#catalogBreadcrumb').innerText(),/SOFÁ DOIS/,'Rolar pra outro item da mesma categoria atualiza o último segmento');

await page.locator('[data-breadcrumb="category"]').click();
await page.waitForTimeout(200);
assert.equal(await page.evaluate(()=>window.scrollY),0,'Clicar na categoria (2º segmento) volta pro topo dela');
// Clicar na categoria também passa por applyView(), que agora sempre
// volta pro modo grade (mesma regra de "clicar em categoria sempre
// mostra grade") — confirma que não ficou preso na imersiva.
assert.equal(await page.locator('[data-grid-item]').count(),2,'Clicar no segmento da categoria também volta pra visualização em grade');

await page.locator('[data-breadcrumb="home"]').click();
await page.waitForTimeout(200);
assert.ok(await page.locator('#catalogGrid .catalog-home-grid').first().isVisible(),'Clicar em "Catálogo" (1º segmento) volta pra Home');

await page.locator('[data-home-category="cadeiras"]').click();
await page.locator('[data-grid-item]').first().click();
await page.locator('#produto-3').waitFor();
await page.setViewportSize({width:390,height:844});
await page.waitForTimeout(150);
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Sem overflow horizontal no mobile, mesmo com trilha visível');
assert.deepEqual(errors,[]);

console.log('PASS: trilha some só no Portal, mostra "Catálogo" na Home, Catálogo/Biblioteca e Catálogo/Painel 3D nos overlays (inclusive abertos direto do Portal), Catálogo/Categoria/Item numa categoria, atualiza ao rolar entre itens, cabeçalho+trilha não cobrem o topo da seção, clique nos segmentos navega, mobile sem overflow');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
