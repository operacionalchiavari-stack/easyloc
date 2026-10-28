const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),{chromium}=require('playwright');
test('historico de manutencao: mesmas colunas, fotos do cadastro, origem e sem titulo duplicado',async()=>{
 const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1700,height:1000}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
  await page.addInitScript(()=>{
   window.aguardarContexto=async()=>({empresa_id:'empresa'});
   window.supabaseClient={rpc:async()=>({data:[{id:'os1',numero:'1234',codigo:'C1',fonte:'sistema',concluida:true,data:'2026-10-20T13:45:00Z',data_conclusao:'2026-10-24T18:00:00Z',solicitante:'Ana',fluxo:['Marcenaria'],quantidade:2,item:'Cadeira Madeira (L) 0.5 m (A) 0.8 m (P) 0.5 m',foto_url:'https://example.com/item.jpg',onde:'Montagem',pedido:'2401',motivo:'Estrutura reparada',prazo:'2026-10-23'}]}),from:nome=>{const q={};for(const n of ['select','eq','in'])q[n]=()=>q;q.then=(ok,fail)=>Promise.resolve({data:nome==='itens'?[{codigo:'C1',produto:'Cadeira',descricao_total:'Cadeira Madeira (L) 0.5 m (A) 0.8 m (P) 0.5 m',foto_url:'https://example.com/item.jpg'}]:[{nome:'Ana',foto_url:'https://example.com/ana.jpg'}]}).then(ok,fail);return q;}};
  });
  await page.route('**/js/core/**',r=>r.fulfill({contentType:'text/javascript',body:''}));await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
  await page.route('**/gas-cliente.js*',r=>r.fulfill({contentType:'text/javascript',body:`window.google={script:{run:new Proxy({}, {get(_t,n){if(n==='withSuccessHandler')return ok=>{const run=new Proxy({}, {get(_x,k){if(k==='withFailureHandler')return ()=>run;return ()=>Promise.resolve().then(()=>ok(k==='buscarOSConcluidas'?{sucesso:true,pagina:1,totalPaginas:1,total:1,setores:['Marcenaria'],dados:[{os:'1234',item:'Antigo',nome:'Ana',data:'20/10/2026 10:45',qtd:2,coluna7:'Marcenaria',dataConclusao:'24/10/2026 15:00'}]}:{sucesso:true,itens:[],categorias:[],dados:[]}));}});return run;};}})}};`}));
  await page.route('https://example.com/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="84" height="84"><rect width="84" height="84" fill="#e6edf4"/></svg>'}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Chiavari/CentralMetas/itens-danificados.html?concluidas=1');
  await page.locator('#tabelaConcluidas .os-item-foto').waitFor();
  assert.deepEqual(await page.locator('.os-concluidas-tabela th').allTextContents(),['Envio','Foto','Item','O.S','Qtd','Fluxo','Origem','Detalhes','Conclusão']);
  assert.equal(await page.locator('#modalConcluidas .modal-topo').count(),0);assert.equal(await page.locator('#contadorConcluidas').isVisible(),false);
  assert.match(await page.locator('#tabelaConcluidas').innerText(),/Montagem/);assert.match(await page.locator('#tabelaConcluidas').innerText(),/Pedido #2401/);
  assert.equal(await page.locator('#tabelaConcluidas .os-solicitante-foto img').count(),1);assert.match(await page.locator('#tabelaConcluidas .os-item-medidas').innerText(),/0.5 m/);
  assert.match(await page.locator('#tabelaConcluidas').innerText(),/Estrutura reparada/);assert.deepEqual(erros,[]);
  await page.screenshot({path:'.tmp/os-concluidas-tabela.png',fullPage:true});
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
