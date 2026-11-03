const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const BASE='http://localhost:9906/';
(async()=>{
 const browser=await chromium.launch({channel:'msedge'});
 try{
  for(const caso of ['vazio','parcial','novo']){
   const context=await browser.newContext(),page=await context.newPage();
   await page.route(BASE+'**',r=>{const p=new URL(r.request().url()).pathname;if(p==='/')return r.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'});const f=path.join(process.cwd(),p);return r.fulfill({contentType:'text/javascript',body:fs.readFileSync(f)});});
   await page.goto(BASE);
   await page.evaluate(async caso=>{
    if(caso==='novo')return;
    await new Promise((resolve,reject)=>{const r=indexedDB.open('acervo-operacao-v1',1);r.onupgradeneeded=()=>{if(caso==='parcial'){r.result.createObjectStore('chaves',{keyPath:'id'});const loja=r.result.createObjectStore('envios',{keyPath:'id'});loja.put({id:'pendente',owner:'outro:usuario',data:'preservar'});}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{r.result.close();resolve();};});
   },caso);
   if(caso==='novo'){
    await page.addScriptTag({url:BASE+'js/core/limpezaDados.js'});
    await page.evaluate(()=>window.__limpezaDadosPronta);
    assert.equal(await page.evaluate(async()=>(await indexedDB.databases()).some(d=>d.name==='acervo-operacao-v1')),false,'limpeza nao cria banco vazio');
   }
   await page.addScriptTag({url:BASE+'js/core/operacaoOffline.js'});
   await page.evaluate(()=>window.OperacaoOffline.init({auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}})}},{empresa_id:'e1',usuario_nome:'Teste'}));
   await page.evaluate(()=>window.OperacaoOffline.cache('teste',{ok:true}));
   assert.deepEqual(await page.evaluate(()=>window.OperacaoOffline.lerCache('teste')),{ok:true});
   const dados=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('acervo-operacao-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const q=db.transaction('envios').objectStore('envios').get('pendente');q.onsuccess=()=>{resolve({lojas:[...db.objectStoreNames],pendente:q.result});db.close();};};}));
   assert.deepEqual(dados.lojas,['cache','chaves','envios']);
   if(caso==='parcial')assert.equal(dados.pendente.data,'preservar','reparo preserva envios existentes');
   console.log('OK armazenamento offline: '+caso);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
