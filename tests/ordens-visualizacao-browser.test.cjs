const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),{chromium}=require('playwright');
test('cronograma usa ordens reais e permanece somente leitura',async()=>{
 const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage(),erros=[];page.on('pageerror',e=>erros.push(e.message));
  await page.addInitScript(()=>{window.__chamadas=[];window.aguardarContexto=async()=>({empresa_id:'empresa'});window.supabaseClient={rpc:async(nome)=>{window.__chamadas.push(nome);return {data:[{id:'nativa',fonte:'sistema',numero:'501',item:'Cadeira (L) 0.5 m',quantidade:2,setor:'Marcenaria',fluxo:['Marcenaria'],data:'2026-10-20T13:00:00Z',prazo:'2026-11-01',concluida:false},{id:'importada',fonte:'legado',numero:'999',item:'Registro da planilha',quantidade:5,setor:'Solda',concluida:false}]};},from:()=>{throw Error('O cronograma nao deve carregar exemplos');}};});
  await page.route('**/js/core/**',r=>r.fulfill({contentType:'text/javascript',body:''}));await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
  const root='http://127.0.0.1:'+server.address().port;await page.goto(root+'/Modulos/Chiavari/CentralMetas/itens-danificados.html');await page.locator('#tabela tr[data-id=nativa]').waitFor();
  assert.equal(await page.locator('#tabela tr').count(),1);assert.doesNotMatch(await page.locator('#tabela').innerText(),/999|Registro da planilha/);
  assert.equal(await page.getByRole('button',{name:'+ Nova O.S',exact:true}).isVisible(),false);assert.equal(await page.locator('.data-urgencia-input').count(),0);
  assert.equal(await page.evaluate(()=>servidor('removerOSPorIds',[],'1234').then(()=>false,()=>true)),true);
  assert.deepEqual(await page.evaluate(()=>window.__chamadas),['acervo_ordens']);assert.deepEqual(erros,[]);
  await page.goto(root+'/Modulos/Chiavari/CentralMetas/itens-danificados.html?gestao=1');assert.equal(await page.evaluate(()=>window.OSGestaoAcervo),false);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
