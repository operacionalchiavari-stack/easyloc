// Painel de Complexidade sem o servidor antigo (nov/2026): a lista vem do banco e nada vai para /api/gs.
const {chromium}=require('playwright'),express=require('express'),assert=require('node:assert/strict');
const regras=require('../js/shared/complexidade');
const ctx=n=>({id:'p'+n,numero:String(n),data_evento:'2026-12-0'+n,cliente_nome:'Cliente '+n,local_nome:'Local '+n,tipo_evento:'Casamento',config:regras.padrao(),cliente:{complexidade:{reclamacao:false}},pedidos_anteriores:0,local:{tags:{observacoes:['Tem escadas']}},caminhoes:1,carregamento:{data:'2026-12-01',hora:'09:00:00'},confirmado_em:'2026-11-01T10:00:00-03:00',excecoes:{},itens:[],pecas:[{item_id:'a',quantidade:3,material:'Vidro'}],servicos:[]});
(async()=>{
 const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const b=await chromium.launch({channel:'msedge'});const pg=await b.newPage({viewport:{width:1360,height:900}}),erros=[],gs=[];
 pg.on('pageerror',e=>erros.push(e.message));
 await pg.route('**/api/gs*',r=>{gs.push(r.request().url());r.fulfill({status:500,body:'{}'});});
 await pg.route('**/supabase-js@*',r=>r.fulfill({contentType:'text/javascript',body:'window.supabase={createClient:()=>window.__mock}'}));
 await pg.route('**/js/core/supabase.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.supabaseClient=window.__mock'}));
 await pg.route('https://fonts.**',r=>r.fulfill({body:''}));
 await pg.addInitScript(lista=>{
  localStorage.setItem('easyloc:limpeza-dados','20261026-zerado');sessionStorage.setItem('empresa_id','e1');window.__CONTEXT={empresa_id:'e1'};
  const q=()=>{const o={select:()=>o,eq:()=>o,in:()=>o,neq:()=>o,lt:()=>o,order:()=>o,limit:()=>o,single:()=>o,maybeSingle:()=>o,then:(ok,no)=>Promise.resolve({data:[],error:null}).then(ok,no)};return o;};
  window.__mock={from:q,rpc:async n=>n==='complexidade_contextos_tela'?{data:lista,error:null}:{data:null,error:null},auth:{getSession:async()=>({data:{session:{user:{id:'u'},access_token:'x'}}})}};
  window.supabaseClient=window.__mock;
 },[ctx(1),ctx(2)]);
 await pg.goto(`http://127.0.0.1:${server.address().port}/Modulos/Chiavari/Costura/costura.html`);
 await pg.waitForFunction(()=>document.querySelectorAll('#listaPedidos tbody tr').length===2,null,{timeout:15000});
 await pg.locator('#listaPedidos tbody tr').first().click();
 await pg.locator('.cxt:not([hidden]) .cxt-q').first().waitFor();
 await pg.locator('[data-cxt-setor="triagem"]').click();await pg.locator('[data-cxt-q="20"]').click();
 await pg.waitForFunction(()=>/Vidro/.test(document.querySelector('[data-cxt-provas]').textContent));
 assert.deepEqual(gs,[],'nada vai para o servidor antigo');assert.deepEqual(erros,[]);
 console.log('ok - Painel de Complexidade lê do banco, sem o servidor antigo');
 await b.close();server.close();
})().catch(e=>{console.error(e);process.exit(1);});
