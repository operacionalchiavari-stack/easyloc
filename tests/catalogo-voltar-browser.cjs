// "Voltar" logo abaixo da logo, fora do menu, sem NADA atrás dele e com respiro mínimo (pedido do usuário: "não pode ficar
// nada atrás dele, precisa ter um respiro mínimo"). Percorre as telas do catálogo em 1100/1440/1920px e falha se qualquer
// texto/imagem/botão chegar a menos de 6px do botão. Também: fica abaixo do cabeçalho e à esquerda, ≥36px, some no Portal.
const assert=require('node:assert/strict');const {chromium}=require('playwright');const express=require('express');
const { installMock } = require('./mock-projetos.cjs');
const PNG_1X1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
(async()=>{
const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
for(const width of [1100,1440,1920]){
const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/png',body:PNG_1X1}));
const seed={projetos:[{id:'proj-1',cliente_id:'client',noivos:'Ana e Bruno',data_evento:'2027-05-10',local_evento:'Sítio',status:'rascunho',dados:{ambientes:[{id:'amb1',nome:'Lounge',itens:[{item_id:'1',quantidade:2}],renders:[],notas:''}]}}],calls:[],uploads:[],removed:[],seq:2};
await page.addInitScript((db)=>{ if(!sessionStorage.getItem('mockdb')) sessionStorage.setItem('mockdb',JSON.stringify(db)); },seed);
await page.addInitScript(installMock,{token:true});
await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
const probe=async(nome)=>{
  await page.waitForTimeout(900);
  const r=await page.evaluate(()=>{
    const btn=document.getElementById('catalogGlobalBack');
    if(!btn||!btn.offsetParent) return 'escondido';
    const b=btn.getBoundingClientRect();const pad=6;
    const hits=[];
    document.querySelectorAll('body *').forEach(el=>{
      if(btn.contains(el)||el.contains(btn)) return;
      const cs=getComputedStyle(el); if(cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0) return;
      const conteudo=el.matches('img,button,input,select,textarea,svg,canvas,a,label,[role=button],video')||[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
      if(!conteudo) return;
      if(el.closest('svg')&&!el.matches('svg')) return;
      const x=el.getBoundingClientRect(); if(!x.width||!x.height) return;
      if(x.left<b.right+pad&&b.left-pad<x.right&&x.top<b.bottom+pad&&b.top-pad<x.bottom) hits.push((el.tagName+'.'+String(el.className).split(' ')[0]+' '+(el.textContent||'').trim().slice(0,20)).trim()+' ['+Math.round(x.left)+','+Math.round(x.top)+']');
    });
    return {btn:[Math.round(b.left),Math.round(b.top),Math.round(b.right),Math.round(b.bottom)],hits};
  });
  if(nome==='portal'){ assert.equal(r,'escondido','Portal sem Voltar'); return; }
  assert.notEqual(r,'escondido',width+'/'+nome+': Voltar visível');
  assert.deepEqual(r.hits,[],width+'/'+nome+': nada atrás/encostado no Voltar');
  const h=await page.evaluate(()=>document.querySelector('.catalog-header').getBoundingClientRect().bottom);
  assert.ok(r.btn[1]>h&&r.btn[0]<60&&r.btn[3]-r.btn[1]>=36,width+'/'+nome+': abaixo do menu, à esquerda, ≥36px');
};
await probe('portal');
await page.locator('[data-gateway-tile="catalogo"]').click();await probe('categorias');await page.locator('[data-home-filter-toggle="personalizable"]').click().catch(()=>{});await probe('categorias-filtro');await page.locator('#catalogHomeFilterClear').click().catch(()=>{});
await page.locator('[data-home-category="sofas"]').click();await probe('categoria-grade');
await page.locator('[data-view-mode="mosaic"]').click();await probe('mosaico');
await page.locator('[data-view-mode="immersive"]').click();await probe('imersiva');
await page.locator('.catalog-brand').click();await page.locator('[data-gateway-tile="biblioteca"]').click();await probe('biblioteca');await page.locator('[data-biblioteca-folder]').first().click().catch(()=>{});await probe('biblioteca-pasta');
await page.locator('.catalog-brand').click();await page.locator('[data-gateway-tile="modulo3d"]').click();await probe('3d');
await page.locator('.catalog-brand').click();await page.locator('[data-gateway-tile="projetos"]').click();await probe('projetos-lista');
await page.locator('[data-cpj-open]').first().click();await probe('projeto');
assert.deepEqual(errors,[]);await page.close();
}
await browser.close();server.close();console.log('PASS: Voltar abaixo da logo, fora do menu, sem nada atrás e com respiro em todas as telas');
})().catch(e=>{console.error(e);process.exit(1)});
