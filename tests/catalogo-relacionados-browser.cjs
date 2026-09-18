const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const path=require('node:path');const os=require('node:os');
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c9a874"/></svg>');
await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
await page.addInitScript(()=>{
 // Grava scrollIntoView em vez de deixar rolar de verdade — mais fácil
 // provar QUAL elemento foi alvo do que medir scrollTop pixel a pixel.
 window.__scrollCalls=[];
 const original=Element.prototype.scrollIntoView;
 Element.prototype.scrollIntoView=function(opts){ window.__scrollCalls.push({id:this.id, opts}); return original.call(this, opts); };
 sessionStorage.setItem('catalogo_token','test');
 window.supabaseClient={rpc:async name=>({data:name==='catalogo_validar_sessao'?{valido:true,empresa_id:'company',cliente_id:'client'}:name==='catalogo_capas_carregar'?{}:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:[
  // Estofados/Sofás: 3 itens — abrir o 1º deve mostrar os outros 2 como relacionados.
  {id:'1',tipo:'Item',produto:'Sofá Alex',categoria:'Estofados',subcategoria:'Sofás',largura:2.2,altura:.7,profundidade:1,foto_url:'https://fixture/1.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  {id:'2',tipo:'Item',produto:'Sofá Becca',categoria:'Estofados',subcategoria:'Sofás',foto_url:'https://fixture/2.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  {id:'3',tipo:'Item',produto:'Sofá Cadu',categoria:'Estofados',subcategoria:'Sofás',foto_url:'https://fixture/3.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  // Estofados/Poltronas: só 1 item — sem relacionados (precisa de 2+).
  {id:'4',tipo:'Item',produto:'Poltrona Solo',categoria:'Estofados',subcategoria:'Poltronas',foto_url:'https://fixture/4.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  // Estofados sem subcategoria — nunca tem relacionados (nada pra comparar).
  {id:'5',tipo:'Item',produto:'Puff Avulso',categoria:'Estofados',subcategoria:'',foto_url:'https://fixture/5.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
  // Mesas/Sofás — MESMO nome de subcategoria, categoria DIFERENTE: não pode
  // contar como relacionado do Sofá Alex (categoria diferente).
  {id:'6',tipo:'Item',produto:'Mesa Sofá (nome coincidente)',categoria:'Mesas',subcategoria:'Sofás',foto_url:'https://fixture/6.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
 ]}})};
});
await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
await page.locator('[data-gateway-tile="catalogo"]').waitFor();
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('.catalog-home-grid').waitFor();
await page.locator('[data-home-category="estofados"]').click();
await page.locator('[data-grid-item]').first().waitFor();

// ===== Item com 2+ relacionados na mesma subcategoria =====
await page.locator('[data-grid-item="1"]').click();
await page.locator('#produto-1').waitFor();
assert.equal(await page.locator('#produto-1 .catalog-related-items').count(),1,'Sofá Alex tem 2 outros sofás na mesma subcategoria — faixa aparece');
assert.match(await page.locator('#produto-1 .catalog-related-label').textContent(),/Combine também com/);
// Lista dobrada pro loop: 2 relacionados reais -> 4 botões no total.
assert.equal(await page.locator('#produto-1 .catalog-related-item').count(),4,'Lista vem dobrada (2 relacionados reais x2) pro loop perfeito da animação');
const relatedIds=await page.locator('#produto-1 [data-related-item]').evaluateAll(els=>els.map(el=>el.dataset.relatedItem));
assert.deepEqual(relatedIds,['2','3','2','3'],'Relacionados são exatamente os outros 2 sofás, repetidos (cópia do loop)');
assert.equal(await page.locator('#produto-1 .catalog-related-item[data-related-item="1"]').count(),0,'O próprio item nunca aparece como relacionado de si mesmo');
// Cópia (2ª metade) não pode roubar foco de teclado.
const tabindexes=await page.locator('#produto-1 .catalog-related-item').evaluateAll(els=>els.map(el=>el.getAttribute('tabindex')));
assert.deepEqual(tabindexes,[null,null,'-1','-1'],'Só a 1ª cópia (visível/real) é alcançável por Tab; a cópia do loop fica fora da navegação por teclado');

// "Ficarão passando ali" — animação de verdade rodando fora do hover.
const animBefore=await page.locator('#produto-1 .catalog-related-track').evaluate(el=>getComputedStyle(el).animationPlayState);
assert.equal(animBefore,'running','Faixa passa sozinha fora do hover');

// Nome escondido enquanto ninguém passa o mouse (pedido explícito: "quero
// a foto desses itens pequena mesmo" — só a foto, nome vem no hover).
const nameOpacityBefore=await page.locator('#produto-1 .catalog-related-item').first().locator('.catalog-related-name').evaluate(el=>getComputedStyle(el).opacity);
assert.equal(nameOpacityBefore,'0','Nome escondido fora do hover');

// A faixa fica em movimento contínuo (translateX animando) — passar o
// mouse sobre o CONTÊINER estático (não sobre o botão em si, que nunca
// fica "parado" tempo suficiente pro `.hover()` do Playwright convergir,
// mesma classe de problema já documentada no CLAUDE.md pro hover da Home)
// já pausa a animação; só DEPOIS disso o botão individual fica parado de
// verdade e pode ser hovered/clicado com segurança.
await page.locator('#produto-1 .catalog-related-items').hover();
await page.waitForTimeout(100);
const animDuringHover=await page.locator('#produto-1 .catalog-related-track').evaluate(el=>getComputedStyle(el).animationPlayState);
assert.equal(animDuringHover,'paused','Passar o mouse pausa a faixa (dá tempo de clicar)');

const photoSize=await page.locator('#produto-1 .catalog-related-photo').first().boundingBox();
assert.ok(photoSize.width<=90 && photoSize.height<=90,'Foto pequena de verdade, não um card grande');
await page.locator('#produto-1 .catalog-related-item').first().hover();
await page.waitForFunction(()=>getComputedStyle(document.querySelector('#produto-1 .catalog-related-item .catalog-related-name')).opacity==='1');
const nameOpacityAfter=await page.locator('#produto-1 .catalog-related-item').first().locator('.catalog-related-name').evaluate(el=>getComputedStyle(el).opacity);
assert.equal(nameOpacityAfter,'1','Hover no item específico revela o nome');
// Pedido explícito do usuário: "as informações não podem aparecer dentro
// da foto" — o nome fica ABAIXO da foto (bounding box não sobrepõe), não
// mais num degradê por cima da imagem.
const namePos=await page.locator('#produto-1 .catalog-related-item').first().locator('.catalog-related-name').boundingBox();
assert.ok(namePos.y>=photoSize.y+photoSize.height-1,'Nome fica abaixo da foto, nunca sobreposto a ela');

// Tirar o mouse (sem ter clicado em nada ainda — nenhum botão focado)
// retoma o movimento de verdade.
await page.mouse.move(5,5);
await page.waitForTimeout(100);
const animAfterLeaving=await page.locator('#produto-1 .catalog-related-track').evaluate(el=>getComputedStyle(el).animationPlayState);
assert.equal(animAfterLeaving,'running','Tirar o mouse retoma o movimento');

// Clicar num relacionado rola até a seção dele (mesma categoria, já
// renderizada na imersiva). Hover no contêiner de novo antes de clicar
// pelo mesmo motivo de estabilidade explicado acima — depois do clique o
// próprio botão fica focado, então :focus-within mantém a faixa parada
// (comportamento correto pra quem navega por teclado), não é mais
// checado aqui pra não confundir com o resultado do hover puro acima.
await page.locator('#produto-1 .catalog-related-items').hover();
await page.waitForTimeout(100);
await page.locator('#produto-1 .catalog-related-item[data-related-item="2"]').first().click();
await page.waitForFunction(()=>window.__scrollCalls.some(c=>c.id==='produto-2'));

// ===== Sem relacionados (subcategoria com só 1 item) =====
await page.locator('#produto-4').scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
assert.equal(await page.locator('#produto-4 .catalog-related-items').count(),0,'Poltrona Solo é a única da subcategoria — sem faixa de relacionados');

// ===== Sem subcategoria cadastrada =====
await page.locator('#produto-5').scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
assert.equal(await page.locator('#produto-5 .catalog-related-items').count(),0,'Item sem subcategoria não tem como ter relacionados');

// A "Mesa Sofá" (id 6, categoria Mesas) nunca pode ter entrado na lista
// do Sofá Alex, mesmo com o mesmo nome de subcategoria — já verificado
// acima (relatedIds só tem 2 e 3), reforçando aqui por clareza.
assert.equal(relatedIds.includes('6'), false, 'Mesma subcategoria em OUTRA categoria não conta como relacionado');

for(const width of [390,768]){
  await page.setViewportSize({width,height:844});await page.waitForTimeout(150);
  await page.locator('#produto-1').scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Faixa de relacionados sem overflow horizontal em '+width+'px');
}
await page.screenshot({path:path.join(os.tmpdir(),'catalogo-relacionados.png')});
assert.deepEqual(errors,[]);
console.log('PASS: itens relacionados (mesma categoria+subcategoria) — faixa passando sozinha, pausa no hover, nome só no hover, exclui o próprio item, exige 2+ pra aparecer, some sem subcategoria, clique rola até o item, sem overflow mobile');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
