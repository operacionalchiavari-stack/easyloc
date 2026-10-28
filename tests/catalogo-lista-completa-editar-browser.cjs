const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
const { installMock } = require('./mock-projetos.cjs');
// Out/2026 — Lista Completa (aba Geral do projeto): a quantidade é editável e o ambiente inteiro se arrasta pela alça
// do título (o bloco vai junto com todos os itens). Teclado: ↑/↓ na alça.
(async()=>{
const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 const seed={projetos:[{id:'proj-1',cliente_id:'client',noivos:'Ana e Bruno',data_evento:'2027-05-10',local_evento:'Sítio Vale Verde',status:'rascunho',
  dados:{ambientes:[
   {id:'a1',nome:'Cerimônia',itens:[{item_id:'1',quantidade:50},{item_id:'3',quantidade:1}],renders:[],notas:''},
   {id:'a2',nome:'Lounge',itens:[{item_id:'2',quantidade:2}],renders:[],notas:''},
   {id:'a3',nome:'Bar',itens:[{item_id:'3',quantidade:4}],renders:[],notas:''}]}}],calls:[],uploads:[],removed:[],seq:2};
 await page.addInitScript((db)=>{ if(!sessionStorage.getItem('mockdb')) sessionStorage.setItem('mockdb',JSON.stringify(db)); },seed);
 await page.addInitScript(()=>{ try{ localStorage.clear(); }catch{} });
 await page.addInitScript(installMock,{token:true});
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('[data-gateway-tile="projetos"]').click();
 await page.locator('[data-cpj-open]').first().click();
 await page.locator('.pa-geral [data-pa-grupo]').first().waitFor();
 const ordem=()=>page.$$eval('.pa-geral [data-pa-grupo] h3',l=>l.map(h=>h.textContent));
 const salvo=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('mockdb')).projetos[0].dados.ambientes.map(a=>a.nome+':'+a.itens.map(i=>i.item_id+'x'+i.quantidade).join(',')));
 assert.deepEqual(await ordem(),['Cerimônia','Lounge','Bar']);

 // Quantidade editável na Lista Completa (a linha diz o ambiente)
 const campo=page.locator('[data-pa-grupo="a3"] [data-cpj-qtd-input]');
 assert.equal(await campo.inputValue(),'4');
 await campo.fill('12'); await campo.press('Enter');
 await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('mockdb')).projetos[0].dados.ambientes[2].itens[0].quantidade===12,null,{timeout:8000});
 assert.equal(await page.locator('[data-pa-grupo="a1"] [data-cpj-qtd-input]').first().inputValue(),'50','outro ambiente não mudou');
 assert.equal(await page.locator('.pa-geral [data-cpj="item-remover"]').count(),0,'sem o × de remover na Lista Completa');
 console.log('ok 1 - quantidade editável na Lista Completa, gravada no ambiente da linha');

 // Arrastar o Bar (com o item) pra cima da Cerimônia
 const alca=await page.locator('[data-pa-grupo="a3"] [data-pa-drag-amb]').boundingBox();
 const alvo=await page.locator('[data-pa-grupo="a1"] h3').boundingBox();
 await page.mouse.move(alca.x+alca.width/2,alca.y+alca.height/2);
 await page.mouse.down();
 await page.mouse.move(alca.x+alca.width/2,alvo.y+2,{steps:12});
 await page.mouse.up();
 await page.waitForFunction(()=>document.querySelector('.pa-geral [data-pa-grupo] h3')?.textContent==='Bar');
 assert.deepEqual(await ordem(),['Bar','Cerimônia','Lounge']);
 await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('mockdb')).projetos[0].dados.ambientes[0].id==='a3',null,{timeout:8000});
 assert.deepEqual(await salvo(),['Bar:3x12','Cerimônia:1x50,3x1','Lounge:2x2'],'ambiente movido com todos os itens');
 const nav=await page.$$eval('[data-cpj-amb]',l=>l.map(b=>b.dataset.cpjAmb));
 assert.deepEqual(nav.slice(0,3),['a3','a1','a2'],'menu lateral na mesma ordem');
 console.log('ok 2 - arrastar o título move o ambiente inteiro (itens juntos), salva e reordena o menu lateral');

 // Teclado: ↓ na alça do Bar volta ele pra depois da Cerimônia
 await page.locator('[data-pa-grupo="a3"] [data-pa-drag-amb]').focus();
 await page.keyboard.press('ArrowDown');
 await page.waitForFunction(()=>document.querySelector('.pa-geral [data-pa-grupo] h3')?.textContent==='Cerimônia');
 assert.deepEqual(await ordem(),['Cerimônia','Bar','Lounge']);
 console.log('ok 3 - setas do teclado também movem o ambiente');
 if(process.env.FOTO) await page.screenshot({path:process.env.FOTO});
 assert.deepEqual(errors,[]);
 console.log('todos os testes passaram');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
