const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
const { installMock } = require('./mock-projetos.cjs');
// Cabeçalho do pedido/PDF (pedido do usuário: faixa horizontal de ponta a ponta na MESMA cor do menu do catálogo, logo branca
// à esquerda; à direita foto circular da decoradora, "DECORADOR SOLICITANTE", nome, divisória vertical sutil e "PRÉVIA DO
// PEDIDO"; filete bege/dourado embaixo; resto do documento igual). Cobre a prévia ("Ver pedido") e o documento de impressão.
const PNG_1X1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
(async()=>{
const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/png',body:PNG_1X1}));
const seed={projetos:[{id:'proj-1',cliente_id:'client',noivos:'Ana e Bruno',data_evento:'2026-09-25',local_evento:'Sítio Vale Verde',status:'pedido_enviado',pedido_enviado_em:'2026-09-20T10:00:00Z',
 dados:{ambientes:[{id:'amb1',nome:'Lounge',itens:[{item_id:'1',quantidade:1},{item_id:'3',quantidade:2}],renders:[],notas:''}]}}],calls:[],uploads:[],removed:[],seq:2};
await page.addInitScript((db)=>{ if(!sessionStorage.getItem('mockdb')) sessionStorage.setItem('mockdb',JSON.stringify(db)); },seed);
await page.addInitScript(()=>{ window.print=()=>{ window.__printed=true; }; });
await page.addInitScript(installMock,{token:true,empresaLogo:'https://fixture/storage/v1/object/public/logos/chiavari.png',decoradorCores:{logo_url:'https://fixture/storage/v1/object/public/logos/fabiane.png',nome:'Fabiane Gabrich'}});
await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
const menu=await page.evaluate(()=>getComputedStyle(document.querySelector('.catalog-header')).backgroundColor);
await page.locator('[data-gateway-tile="projetos"]').click();
await page.locator('button.cpj-status[data-cpj-ver-pedido]').first().click();
const cab=page.locator('dialog.cpj-modal[open] .cpj-order-letterhead');
await cab.waitFor();
const info=async(frame,sel)=>frame.evaluate((sel)=>{
 const h=document.querySelector(sel+' .cpj-order-letterhead');const paper=h.closest('.cpj-order-paper');
 const r=(e)=>e.getBoundingClientRect();const cs=getComputedStyle(h);
 const logo=h.querySelector('.cpj-order-logo');const req=h.querySelector('.cpj-order-requester');const div=h.querySelector('.cpj-order-divider');const kind=h.querySelector('.cpj-order-kind');
 return {bg:cs.backgroundColor,borda:cs.borderBottomColor,bordaW:cs.borderBottomWidth,hL:r(h).left,hR:r(h).right,hT:r(h).top,pL:r(paper).left,pR:r(paper).right,pT:r(paper).top,
  logoFiltro:getComputedStyle(logo).filter,logoQuadrada:logo.classList.contains('is-quadrada'),logoL:r(logo).left,logoR:r(logo).right,
  reqL:r(req).left,divL:r(div).left,kindL:r(kind).left,kind:kind.textContent,label:req.querySelector('span').textContent,nome:req.querySelector('strong').textContent,
  foto:getComputedStyle(req.querySelector('img')).borderRadius,evento:paper.querySelector('.cpj-order-event').textContent.replace(/\s+/g,' ')};
},sel);
await page.waitForFunction(()=>document.querySelector('dialog.cpj-modal[open] .cpj-order-logo')?.classList.contains('is-quadrada'));
const a=await info(page,'dialog.cpj-modal[open]');
assert.equal(a.bg,menu,'Mesma cor do menu do catálogo ('+a.bg+')');
assert.equal(a.bordaW,'2px');assert.notEqual(a.borda,a.bg,'Filete embaixo');
assert.ok(Math.abs(a.hL-a.pL)<1&&Math.abs(a.hR-a.pR)<1&&Math.abs(a.hT-a.pT)<1,'Faixa de ponta a ponta do papel');
assert.match(a.logoFiltro,/brightness\(0\).*invert\(1\)/,'Logo branca');assert.ok(a.logoQuadrada,'Logo quadrada recortada');
assert.ok(a.logoR<a.reqL&&a.reqL<a.divL&&a.divL<a.kindL,'Logo à esquerda; decoradora, divisória e PRÉVIA DO PEDIDO à direita, nessa ordem');
assert.equal(a.kind,'PRÉVIA DO PEDIDO');assert.equal(a.label,'DECORADOR SOLICITANTE');assert.equal(a.nome,'Fabiane Gabrich');assert.equal(a.foto,'50%');
// Reposição / Valor un. / Total: colunas próprias, na MESMA linha do nome do item (pedido do usuário).
const valores=await page.evaluate(()=>[...document.querySelectorAll('dialog.cpj-modal[open] .cpj-order-table tbody tr')].filter(tr=>tr.querySelector('strong')).map(tr=>{
 const nome=tr.querySelector('strong').getBoundingClientRect();const tds=[...tr.querySelectorAll('td.cpj-order-valor')];
 return {nome:tr.querySelector('strong').textContent,txt:tds.map(t=>t.textContent.replace(/\s+/g,' ').trim()),
  mesmaLinha:tds.every(t=>{const r=t.getBoundingClientRect();return r.top<nome.bottom&&r.bottom>nome.top&&r.left>=nome.right;})};}));
const cabecalhoValores=await page.evaluate(()=>[...document.querySelectorAll('dialog.cpj-modal[open] .cpj-order-colhead td.cpj-order-valor')].map(t=>t.textContent));
assert.deepEqual(cabecalhoValores,['Reposição','Valor un.','Total']);
assert.equal(valores.length,2);
const sofa=await page.evaluate(()=>{const tr=document.querySelector('dialog.cpj-modal[open] .cpj-order-table tbody tr:nth-child(3)');const n=getComputedStyle(tr.querySelector('strong')),m=getComputedStyle(tr.querySelector('.pa-medidas'));return {nome:tr.querySelector('strong').textContent,medidas:tr.querySelector('.pa-medidas')?.textContent,igual:['fontFamily','fontSize','fontWeight','color'].every(k=>n[k]===m[k])};});
assert.equal(sofa.nome,'Sofá Um Linho Off','Medidas saem do nome');
assert.equal(sofa.medidas,'(L) 2.20 m (A) 0.80 m (P) 0.90 m','Medidas no formato do cadastro');
assert.ok(sofa.igual,'Medidas com a mesma fonte, tamanho, peso e cor do nome');
assert.deepEqual(valores[0].txt,['R$ 4.200,00','R$ 350,00','R$ 350,00'],'Sofá Um: reposição, unitário, total');
assert.deepEqual(valores[1].txt,['R$ 980,00','R$ 120,50','R$ 241,00'],'Mesa Um ×2: total = 2 × unitário');
assert.ok(valores.every(v=>v.mesmaLinha),'Valores na mesma linha, à direita do nome');
assert.match(a.evento,/Clientes.*Ana e Bruno.*Data do evento.*25\/09\/2026.*Local do evento.*Sítio Vale Verde/,'Clientes, data e local');
// Clientes / Data do evento / Local do evento empilhados; card amarelo de prévia ao lado (pedido do usuário).
const ev=await page.evaluate(()=>{const box=document.querySelector('dialog.cpj-modal[open] .cpj-order-event');const r=(e)=>e.getBoundingClientRect();
 const blocos=[...box.querySelectorAll('.cpj-order-event-info>div')].map(d=>r(d).top);
 const n=box.querySelector('.cpj-order-notice');const info=box.querySelector('.cpj-order-event-info');
 return {nome:box.querySelector('h2').textContent,blocos,noticeL:r(n).left,infoR:r(info).right,bg:getComputedStyle(n).backgroundColor,texto:n.textContent.replace(/\s+/g,' ')};});
assert.equal(ev.nome,'Ana e Bruno');
assert.ok(ev.blocos.length===3&&ev.blocos[0]<ev.blocos[1]&&ev.blocos[1]<ev.blocos[2],'Clientes, data e local um embaixo do outro');
assert.ok(ev.noticeL>ev.infoR,'Card de aviso ao lado');
const [rr,gg,bb]=ev.bg.match(/\d+/g).map(Number);assert.ok(rr>240&&gg>230&&rr-bb>15,'Card amarelo suave ('+ev.bg+')');
// "Qtd." e "Item" logo abaixo do nome do ambiente, em cima da 1ª linha (não mais no topo da tabela).
const col=await page.evaluate(()=>{const t=document.querySelector('dialog.cpj-modal[open] .cpj-order-table');const r=(e)=>e.getBoundingClientRect();
 const amb=t.querySelector('.cpj-order-environment');const cab=t.querySelector('.cpj-order-colhead');const item=cab.nextElementSibling;
 return {ordem:amb.nextElementSibling===cab,cabT:r(cab).top,ambB:r(amb).bottom,itemT:r(item).top,cabB:r(cab).bottom,theadH:r(t.querySelector('thead')).height,
  qtdX:r(cab.cells[0]).left,qtdItemX:r(item.cells[0]).left,itemX:r(cab.cells[2]).left,nomeX:r(item.cells[2]).left,txt:cab.textContent};});
assert.ok(col.ordem&&col.cabT>=col.ambB-1&&col.cabB<=col.itemT+1,'Qtd./Item entre o nome do ambiente e a 1ª linha');
assert.ok(col.theadH<=2,'Sem cabeçalho visível no topo da tabela');
assert.ok(Math.abs(col.qtdX-col.qtdItemX)<1&&Math.abs(col.itemX-col.nomeX)<1,'Alinhados com a quantidade e o nome do item');
assert.match(col.txt,/Qtd\..*Item/);
assert.match(ev.texto,/prévia do pedido/i);assert.match(ev.texto,/equipe comercial/);assert.match(ev.texto,/disponibilidades/);assert.match(ev.texto,/serviços adicionais/);
await page.screenshot({path:require('path').join(require('os').tmpdir(),'pedido-cabecalho.png'),clip:{x:250,y:0,width:940,height:520}});
// Documento de impressão (PDF): mesma faixa, de ponta a ponta da página
await page.locator('dialog.cpj-modal[open] [data-cpj-pedido-pdf]').click();
const frameEl=await page.waitForSelector('iframe[title="Impressão do documento"]',{state:'attached'});
const frame=await frameEl.contentFrame();
await frame.waitForFunction(()=>window.__printed===true,null,{timeout:15000});
await page.emulateMedia({media:'print'});
const b=await frame.evaluate(()=>{const h=document.querySelector('.cpj-order-letterhead');const r=h.getBoundingClientRect();return {bg:getComputedStyle(h).backgroundColor,l:r.left,r:r.right,w:document.documentElement.clientWidth,t:r.top,adj:getComputedStyle(h).printColorAdjust||getComputedStyle(h).webkitPrintColorAdjust};});
assert.equal(b.bg,menu,'PDF com a cor do menu');
assert.ok(Math.abs(b.l)<1&&Math.abs(b.r-b.w)<1&&Math.abs(b.t)<1,'PDF: faixa encosta nas bordas e no topo ('+JSON.stringify(b)+')');
assert.equal(b.adj,'exact','Fundo sai na impressão');
await page.emulateMedia({media:'screen'});
assert.deepEqual(errors,[]);
await browser.close();server.close();
console.log('PASS: cabeçalho do pedido — faixa na cor do menu, logo branca à esquerda, decoradora + divisória + PRÉVIA DO PEDIDO à direita, filete dourado, de ponta a ponta na prévia e no PDF');
})().catch(e=>{console.error(e);process.exit(1)});
