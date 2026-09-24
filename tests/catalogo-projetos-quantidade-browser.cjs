const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
const { installMock } = require('./mock-projetos.cjs');
// Digitar a quantidade de um item no projeto (pedido do usuário: "quero que a pessoa possa clicar pra adicionar 1 item
// ou que ela possa digitar a quantidade, imagina que são 30 itens do mesmo"). Clicar no "＋" do card soma 1 (como antes);
// clicar no número do chip ("Qtd." antes de adicionar) abre um campo junto do botão: digita, Enter salva, Esc cancela,
// 0 tira do ambiente. Na página do item, "Quantidade" ao lado de "Adicionar ao projeto" faz o mesmo.
const PNG_1X1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
(async()=>{
const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1500,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/png',body:PNG_1X1}));
const seed={projetos:[{id:'proj-1',cliente_id:'client',noivos:'Ana e Bruno',data_evento:'2027-05-10',local_evento:'Sítio',status:'rascunho',dados:{ambientes:[{id:'amb1',nome:'Lounge',itens:[],renders:[],notas:''}]}}],calls:[],uploads:[],removed:[],seq:2};
await page.addInitScript((db)=>{ if(!sessionStorage.getItem('mockdb')) sessionStorage.setItem('mockdb',JSON.stringify(db)); },seed);
await page.addInitScript(()=>{ try{ localStorage.clear(); }catch{} });
await page.addInitScript(installMock,{token:true});
await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('[data-home-category="sofas"]').click();
await page.locator('[data-grid-item="1"]').waitFor();
const card=page.locator('[data-grid-item="1"]');
const chip=card.locator('.cpj-add-chip');
const qtdNoProjeto=()=>page.evaluate(()=>{const p=JSON.parse(sessionStorage.getItem('mockdb')).projetos[0];return p;});

// 1º clique no "＋" sem projeto ativo pergunta o destino.
await card.hover();
await chip.locator('.cpj-add-plus').click();
const modal=page.locator('dialog.cpj-modal[open]');
await modal.waitFor();
await modal.locator('button[type=submit]').click();
await page.waitForFunction(()=>document.querySelector('[data-grid-item="1"] .cpj-add-count')?.textContent==='1');
assert.equal(await page.locator('.catalog-product-section').count(),0,'Clicar no ＋ não abre o item');

// "＋" soma 1.
await chip.locator('.cpj-add-plus').click();
await page.waitForFunction(()=>document.querySelector('[data-grid-item="1"] .cpj-add-count')?.textContent==='2');

// Clicar no número abre o campo, já selecionado — digitar 30 + Enter.
await chip.locator('.cpj-add-count').click();
const pop=page.locator('.cpj-qty-pop');
await pop.waitFor();
assert.equal(await page.locator('.catalog-product-section').count(),0,'Clicar no número não abre o item');
assert.equal(await pop.locator('input').evaluate(el=>document.activeElement===el),true,'Campo já focado');
assert.equal(await pop.locator('input').inputValue(),'2');
assert.match(await pop.textContent(),/Sofá Um/);assert.match(await pop.textContent(),/Lounge/);
await page.keyboard.type('30');await page.keyboard.press('Enter');
await pop.waitFor({state:'detached'});
await page.waitForFunction(()=>document.querySelector('[data-grid-item="1"] .cpj-add-count')?.textContent==='30');
await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('mockdb')).projetos[0].dados.ambientes[0].itens.some(i=>i.item_id==='1'&&i.quantidade===30),null,{timeout:5000});

// Esc cancela sem mudar.
await chip.locator('.cpj-add-count').click();await pop.waitFor();
await page.keyboard.type('7');await page.keyboard.press('Escape');
await pop.waitFor({state:'detached'});
assert.equal(await chip.locator('.cpj-add-count').textContent(),'30');

// Botões − / ＋ do campo e "Salvar".
await chip.locator('.cpj-add-count').click();await pop.waitFor();
await pop.locator('[data-qty-step="1"]').click();await pop.locator('[data-qty-step="1"]').click();
assert.equal(await pop.locator('input').inputValue(),'32');
await pop.locator('[data-qty-ok]').click();
await page.waitForFunction(()=>document.querySelector('[data-grid-item="1"] .cpj-add-count')?.textContent==='32');

// Clicar fora fecha sem salvar.
await chip.locator('.cpj-add-count').click();await pop.waitFor();
await page.mouse.click(20,600);
await pop.waitFor({state:'detached'});

// Item ainda não adicionado: o chip mostra "Qtd." e dá pra digitar direto.
const card2=page.locator('[data-grid-item="2"]');
await card2.hover();
assert.equal(await card2.locator('.cpj-add-count').textContent(),'Qtd.');
await card2.locator('.cpj-add-count').click();await pop.waitFor();
assert.equal(await pop.locator('[data-qty-ok]').textContent(),'Adicionar');
await pop.locator('input').fill('12');await page.keyboard.press('Enter');
await page.waitForFunction(()=>document.querySelector('[data-grid-item="2"] .cpj-add-count')?.textContent==='12');

// 0 tira do ambiente.
await card2.locator('.cpj-add-count').click();await pop.waitFor();
await pop.locator('input').fill('0');await page.keyboard.press('Enter');
await page.waitForFunction(()=>document.querySelector('[data-grid-item="2"] .cpj-add-count')?.textContent==='Qtd.');

// Página do item: "Quantidade" ao lado de "Adicionar ao projeto".
await card.click();
await page.locator('.catalog-product-section .cpj-add-page-qty').first().waitFor();
await page.locator('.catalog-product-section .cpj-add-page-qty').first().click();
await pop.waitFor();
assert.equal(await pop.locator('input').inputValue(),'32');
await pop.locator('input').fill('40');await page.keyboard.press('Enter');
await page.waitForFunction(()=>/40 em Lounge/.test(document.querySelector('.catalog-product-section .cpj-add-label')?.textContent||''));

// Celular: o campo cabe na tela.
await page.setViewportSize({width:390,height:844});
await page.locator('.catalog-product-section .cpj-add-page-qty').first().scrollIntoViewIfNeeded();
await page.locator('.catalog-product-section .cpj-add-page-qty').first().click();await pop.waitFor();
const r=await pop.boundingBox();
assert.ok(r.x>=0&&r.x+r.width<=390,'Campo dentro da tela no celular');
await page.keyboard.press('Escape');

assert.deepEqual(errors,[]);
await browser.close();server.close();
console.log('PASS: quantidade no projeto — ＋ soma 1, clicar no número (ou "Qtd.") abre campo pra digitar, Enter salva, Esc/clique fora cancela, 0 remove, − / ＋ do campo, página do item com "Quantidade", celular');
})().catch(e=>{console.error(e);process.exit(1)});
