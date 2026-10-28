const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
const { installMock } = require('./mock-projetos.cjs');
// Out/2026 — Projetos: aba "Histórico" (todas as alterações do projeto, gravadas no banco pelo gatilho
// projeto_hist_gatilho). Lista por dia, com hora, descrição e quem fez; filtros Tudo/Itens/Ambientes/Imagens/Evento.
(async()=>{
const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 const seed={projetos:[{id:'proj-1',cliente_id:'client',noivos:'Ana e Bruno',data_evento:'2027-05-10',local_evento:'Sítio Vale Verde',status:'rascunho',
  dados:{ambientes:[{id:'amb1',nome:'Lounge',itens:[{item_id:'1',quantidade:2}],renders:[],notas:''}]}}],calls:[],uploads:[],removed:[],seq:2};
 await page.addInitScript((db)=>{ if(!sessionStorage.getItem('mockdb')) sessionStorage.setItem('mockdb',JSON.stringify(db)); },seed);
 await page.addInitScript(()=>{ try{ localStorage.clear(); }catch{} });
 await page.addInitScript(installMock,{token:true});
 await page.addInitScript(()=>{
  const agora=Date.now(), ontem=agora-86400000;
  const linhas=[
   {id:'h1',quando:new Date(agora-60000).toISOString(),autor:'Kelly Decor',autor_tipo:'decorador',tipo:'item',descricao:'Mudou a quantidade de Sofá Um em Lounge: 2 → 5'},
   {id:'h2',quando:new Date(agora-120000).toISOString(),autor:'Jonatan Falck',autor_tipo:'equipe',tipo:'status',descricao:'Mudou o status: Rascunho → Em análise'},
   {id:'h3',quando:new Date(ontem).toISOString(),autor:'Kelly Decor',autor_tipo:'decorador',tipo:'ambiente',descricao:'Criou o ambiente Lounge'}];
  const pronto=setInterval(()=>{const c=window.supabaseClient;if(!c||c.__hist)return;c.__hist=true;const orig=c.rpc.bind(c);
   c.rpc=async(n,p)=>{if(n==='projeto_historico'){window.__histChamadas=(window.__histChamadas||[]).concat([p]);return {data:linhas,error:null};}return orig(n,p);};clearInterval(pronto);},5);
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.waitForTimeout(3000);if(process.env.DBG)console.log(errors, await page.evaluate(()=>document.body.innerText.slice(0,300)));
 await page.locator('[data-gateway-tile="projetos"]').click();
 await page.locator('[data-cpj-open]').first().click();
 await page.locator('[data-cpj-worktab="historico"]').click();
 await page.locator('.cpj-hist-linha').first().waitFor();
 assert.equal((await page.evaluate(()=>window.__histChamadas[0].p_id)),'proj-1','pede o histórico do projeto aberto');
 const dias=(await page.locator('.cpj-hist-dia h4').allTextContents()).map(t=>t.trim());
 assert.deepEqual(dias,['Hoje','Ontem'],'agrupado por dia');
 const primeira=await page.locator('.cpj-hist-linha').first().innerText();
 assert.match(primeira,/Sofá Um em Lounge: 2 → 5/);assert.match(primeira,/Kelly Decor · decorador/);
 assert.match(await page.locator('.cpj-hist-linha').nth(1).innerText(),/Jonatan Falck · equipe/);
 assert.match(primeira,/^\d{2}:\d{2}/,'mostra a hora');
 console.log('ok 1 - aba Histórico lista as alterações por dia, com hora, descrição e quem fez');
 await page.locator('[data-cpj-hist-filtro="item"]').click();
 assert.equal(await page.locator('.cpj-hist-linha').count(),1,'filtro Itens');
 await page.locator('[data-cpj-hist-filtro="ambiente"]').click();
 assert.match(await page.locator('.cpj-hist-linha').first().innerText(),/Criou o ambiente Lounge/);
 await page.locator('[data-cpj-hist-filtro=""]').click();
 assert.equal(await page.locator('.cpj-hist-linha').count(),3);
 console.log('ok 2 - filtros Itens / Ambientes / Tudo');
 if(process.env.FOTO) await page.screenshot({path:process.env.FOTO});
 await page.setViewportSize({width:390,height:800});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=391),'celular sem rolagem lateral');
 console.log('ok 3 - celular sem rolagem lateral');
 assert.deepEqual(errors,[]);
 console.log('todos os testes passaram');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
