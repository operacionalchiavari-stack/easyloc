const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
const { installMock } = require('./mock-projetos.cjs');
// Projeto aberto (pedidos do usuário): (1) foto e nome dos noivos na MESMA linha do botão "Voltar"; (2) entrar no
// projeto sempre abre a aba "Geral"; (3) dentro de cada ambiente as renderizações 3D vêm ANTES dos móveis.
const PNG_1X1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
(async()=>{
const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
for(const width of [1100,1440,1900]){
 const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/png',body:PNG_1X1}));
 const seed={projetos:[{id:'proj-1',cliente_id:'client',noivos:'Ana e Bruno',data_evento:'2027-05-10',local_evento:'Sítio Vale Verde',status:'pedido_enviado',
  dados:{foto_casal:{url:'https://fixture/storage/v1/object/public/projetos/casal.jpg',path:'x'},ambientes:[{id:'amb1',nome:'Lounge',itens:[{item_id:'1',quantidade:2}],renders:[{id:'r1',url:'https://fixture/storage/v1/object/public/projetos/r1.jpg',path:'r1',origem:'3D Livre'}],notas:''},{id:'amb2',nome:'Bar',itens:[],renders:[],notas:''}]}}],calls:[],uploads:[],removed:[],seq:2};
 await page.addInitScript((db)=>{ if(!sessionStorage.getItem('mockdb')) sessionStorage.setItem('mockdb',JSON.stringify(db)); },seed);
 await page.addInitScript(()=>{ try{ localStorage.clear(); }catch{} });
 await page.addInitScript(installMock,{token:true});
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('[data-gateway-tile="projetos"]').click();
 await page.locator('[data-cpj-open]').first().click();
 await page.locator('.cpj-work-head .cpj-avatar').waitFor();
 // (2) aba Geral aberta
 assert.equal((await page.locator('.cpj-amb-tab.is-active').textContent()).trim(),'Geral',width+': abre na aba Geral');
 // Títulos das colunas logo abaixo do nome do ambiente, em cima da 1ª linha, cada um alinhado com a sua coluna.
 const colunas=await page.evaluate(()=>{const g=document.querySelector('.pa-geral .pa-grupo');if(!g) return null;
  const tit=g.querySelector('.pa-ambiente-titulo'),cab=g.querySelector('.pa-colhead'),item=g.querySelector('[data-pa-item]');const r=e=>e.getBoundingClientRect();
  return {ordem:tit.closest('tr').nextElementSibling===cab&&cab.nextElementSibling===item,abaixo:r(cab).top>=r(tit).bottom-1&&r(cab).bottom<=r(item).top+1,
   alinhado:[...cab.cells].every((c,i)=>Math.abs(r(c).left-r(item.cells[i]).left)<1),
   theadVisivel:r(document.querySelector('.pa-geral thead')).height>1,txt:cab.textContent};});
 assert.ok(colunas,width+': tabela da aba Geral');{assert.ok(colunas.ordem&&colunas.abaixo,width+': títulos das colunas entre o ambiente e a 1ª linha');
  assert.ok(colunas.alinhado,width+': cada título em cima da sua coluna');assert.ok(!colunas.theadVisivel,width+': sem títulos no topo da tabela');
  assert.match(colunas.txt,/Qtd\..*Item.*Reposição.*Valor un\..*Total/);}
 // (1) mesma linha do Voltar
 await page.waitForTimeout(300);
 const g=await page.evaluate(()=>{const r=(s)=>{const x=document.querySelector(s).getBoundingClientRect();return {l:x.left,r:x.right,t:x.top,b:x.bottom,cy:(x.top+x.bottom)/2};};
  return {v:r('#catalogGlobalBack'),a:r('.cpj-work-head .cpj-avatar'),n:r('.cpj-work-title h2'),h:r('.catalog-header')};});
 assert.ok(Math.abs(g.v.cy-g.a.cy)<=4,width+': Voltar centrado com a foto ('+g.v.cy+' x '+g.a.cy+')');
 assert.ok(Math.abs(g.v.cy-g.n.cy)<=24,width+': nome na mesma linha do Voltar');
 assert.ok(g.a.l>=g.v.r+12,width+': foto à direita do Voltar, com respiro');
 assert.ok(g.v.t>=g.h.b,width+': Voltar abaixo do menu');
 // (3) ambiente: renderizações antes dos móveis
 await page.locator('.cpj-amb-tab',{hasText:'Lounge'}).click();
 await page.locator('[data-cpj-renders]').waitFor();
 const ordem=await page.locator('[data-cpj-panel] .cpj-block-head h4').allTextContents();
 assert.deepEqual(ordem.slice(0,2),['Renderizações','Móveis'],width+': 3D primeiro, móveis embaixo');
 // Sem o nome do ambiente repetido em cima (já está na coluna de ambientes) e títulos centralizados como na aba Geral.
 assert.equal(await page.locator('[data-cpj-panel] .cpj-amb-head').count(),0,width+': sem título do ambiente no painel');
 const centro=await page.evaluate(()=>{const p=document.querySelector('[data-cpj-panel]').getBoundingClientRect();const pc=(p.left+p.right)/2;
  return [...document.querySelectorAll('[data-cpj-panel] .cpj-block-head-center h4')].map(h=>{const r=h.getBoundingClientRect();return Math.abs((r.left+r.right)/2-pc);});});
 assert.equal(centro.length,2);assert.ok(centro.every(d=>d<3),width+': Renderizações e Móveis centralizados ('+centro+')');
 // Voltar: ambiente -> Geral -> lista
 await page.locator('#catalogGlobalBack').click();
 await page.waitForFunction(()=>document.querySelector('.cpj-amb-tab.is-active')?.textContent.trim()==='Geral');
 await page.locator('#catalogGlobalBack').click();
 await page.locator('[data-cpj-lista]').waitFor();
 // Reabrir o projeto volta pra Geral de novo
 await page.locator('[data-cpj-open]').first().click();
 await page.locator('.cpj-work-head .cpj-avatar').waitFor();
 assert.equal((await page.locator('.cpj-amb-tab.is-active').textContent()).trim(),'Geral');
 assert.deepEqual(errors,[]);
 await page.close();
}
await browser.close();server.close();
console.log('PASS: projeto — noivos na linha do Voltar, abre na aba Geral, 3D antes dos móveis no ambiente, Voltar ambiente→Geral→lista');
})().catch(e=>{console.error(e);process.exit(1)});
