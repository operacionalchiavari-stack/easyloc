const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),{chromium}=require('playwright');
test('acervo atual: saídas, ocorrências e histórico respeitam a empresa',async()=>{
 const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:950}}),erros=[];page.on('pageerror',e=>erros.push(e.message));page.on('console',m=>{if(m.text().startsWith('OVERFLOW'))console.log(m.text());});
  await page.clock.setFixedTime(new Date('2026-11-20T12:00:00-03:00'));
  await page.route('**/js/core/**',r=>r.fulfill({contentType:'text/javascript',body:''}));await page.route('https://**/*',r=>r.abort());
  await page.addInitScript(()=>{
   window.__calls=[];window.aguardarContexto=async()=>({empresa_id:'empresa-a',usuario_id:'u1'});
   const ocorrencia={id:'o1',pedido_id:'p1',pedido_numero:'901',pedido_data_entrega:'2026-11-21',pedido_hora_entrega:'08:00',pedido_local:'Salão Jardim',cliente:'Cliente do evento',item_id:'i1',item_nome:'Cadeira de madeira',quantidade:2,estado:'acervo',motivo_nome:'Peça quebrada',historico:[]};
   window.supabaseClient={rpc:async(n,a)=>{__calls.push({n,a});
    if(n==='acervo_painel')return {data:{retornos:[],ordens:[],inventarios:[],eventos:[]}};
    if(n==='acervo_proximas_saidas')return {data:[{id:'i1',item_id:'i1',nome:'Cadeira de madeira',codigo:'C1',total:10,manutencao:1,reservado:8,capa:{usa:false},pedidos:[{pedido_id:'p1',data:'2026-11-21',numero:'901',quantidade:8,cliente:'Cliente do evento',local:'Salão Jardim'}],livre_dia:{'2026-11-21':{total:10,manutencao:1,reservado:8}}}]};
    if(n==='separacao_ocorrencias_listar')return {data:[ocorrencia,{...ocorrencia,id:'o2',estado:'resolvida',atualizado_em:'2026-11-20T12:00:00Z'}]};
    throw Error('Consulta inesperada: '+n);
   },from:()=>{const q={};for(const n of ['select','eq','in','order','limit','range'])q[n]=()=>q;q.then=(ok,no)=>Promise.resolve({data:[],count:0}).then(ok,no);return q;}};
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Estoque/Acervo/acervo.html');
  await page.locator('[data-sa-corpo]').getByText('Cadeira de madeira',{exact:true}).first().waitFor();
  assert.equal(await page.locator('[data-aba=saidas]').getAttribute('aria-selected'),'true');assert.match(await page.locator('[data-sa-corpo]').innerText(),/901/);assert.match(await page.locator('[data-sa-corpo]').innerText(),/Cliente do evento/);
  await page.locator('[data-aba=ocorrencias]').click();await page.locator('[data-so-pedido=p1]').waitFor();assert.match(await page.locator('[data-so-pedido=p1]').innerText(),/901/);assert.match(await page.locator('#acOcorrencias').innerText(),/Cadeira de madeira/);
  await page.locator('[data-oc-hist="1"]').click();await page.locator('.so-chat-encerrado').waitFor();assert.equal(await page.locator('[data-oc-hist="1"]').getAttribute('aria-selected'),'true');
  const consultas=await page.evaluate(()=>__calls);assert.ok(consultas.length>=4);assert.ok(consultas.every(c=>c.a.p_empresa==='empresa-a'));assert.ok(consultas.every(c=>!/_criar$|_acao$|_movimentar$|_salvar$/.test(c.n)),'consultar não altera a operação');
  for(const width of [1440,1024,390]){await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>{if(document.documentElement.scrollWidth>innerWidth+2)console.log('OVERFLOW',JSON.stringify([...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:e.className,id:e.id,r:e.getBoundingClientRect().right})).filter(e=>e.r>innerWidth+2).slice(0,12)));return document.documentElement.scrollWidth<=innerWidth+2;}),'sem rolagem lateral em '+width);}
  await page.screenshot({path:'.tmp/acervo-corrigido-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:950});await page.screenshot({path:'.tmp/acervo-corrigido-desktop.png',fullPage:true});assert.deepEqual(erros,[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
