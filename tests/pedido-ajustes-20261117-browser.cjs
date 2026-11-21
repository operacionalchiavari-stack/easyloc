const {chromium}=require('playwright'),express=require('express'),assert=require('node:assert/strict'),fs=require('node:fs');
const {installMock}=require('./mock-projetos.cjs');
const root=process.cwd();fs.mkdirSync('.tmp',{recursive:true});
(async()=>{
 const app=express();
 app.get('/teste-lista',(_,res)=>res.type('html').send(`<!doctype html><body style="margin:0"><input id="dataEntrega" type="hidden" value="2026-11-19"><input id="dataColeta" type="hidden" value="2026-11-21"><iframe id="cat" src="/Modulos/Comercial/Catalogo/catalogo.html?comercial=pedido" style="width:100%;height:95vh;border:0"></iframe><script>
 const projeto={id:'p',noivos:'Cliente',data_evento:'2026-11-20',local_evento:'Salão',dados:{terceirizados:[{id:'t',ambiente_id:'a',nome:'Mesa parceira',quantidade:4,valor:30,custo:10}],ambientes:[{id:'a',nome:'Evento',itens:[{item_id:'1',quantidade:5,observacao:'Preservar'}],renders:[{id:'r',url:'https://fixture/render.png'}]},{id:'b',nome:'Lounge',itens:[],renders:[]}],plantas:[]}};
 window.__sincronizados=[];window.pedidoProjetoCatalogo=()=>structuredClone(projeto);window.pedidoMetadadosCatalogo=()=>({});window.pedidoSincronizarProjetoCatalogo=async p=>window.__sincronizados.push(structuredClone(p));window.__pedidoSincronizarEtapa=()=>{};
 </script>`));
 const html=fs.readFileSync('Modulos/Comercial/Pedidos/pedido.html','utf8');
 const mapa=html.slice(html.indexOf('  <div class="pedido-map-modal"'),html.indexOf('  <div class="pedido-contrato-modal'));
 app.get('/teste-ajustes',(_,res)=>res.type('html').send(`<!doctype html><html lang="pt-BR"><head><link rel="stylesheet" href="/styles/global.css"><link rel="stylesheet" href="/Modulos/Comercial/Pedidos/pedido.css"></head><body style="margin:0;padding:30px"><div class="pedido-screen" style="transform:translateY(0)"><div class="autocomplete-wrapper"><label for="clienteInput">Cliente</label><input id="clienteInput"><input id="clienteIdHidden" type="hidden" value="c"><div id="clienteLista" class="autocomplete-list"></div></div><div class="pagamento-top-summary" style="margin-top:60px"><div class="pagamento-mini-card positive"><span>BV</span><strong id="pgResumoBV"></strong></div><div class="pagamento-mini-card positive"><span>Crédito</span><strong id="pgResumoCredito"></strong></div></div><input id="localInput"><div id="localLista"></div><input id="localIdHidden" type="hidden"><div id="pedidoMiniMapa" style="height:100px"></div><button id="pedidoMiniMapaAbrir">Ajustar mapa</button>${mapa}</div></body></html>`));
 app.use(express.static(root));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const ctx=await browser.newContext({viewport:{width:1412,height:820}}),page=await ctx.newPage(),erros=[];page.on('pageerror',e=>erros.push(e.message));
  await ctx.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await ctx.addInitScript(installMock,{staff:true});
  await ctx.addInitScript(()=>{
   const orig=window.supabaseClient.from.bind(window.supabaseClient),rpc=window.supabaseClient.rpc.bind(window.supabaseClient);
   const q=new Proxy({},{get:(_,k)=>k==='then'?resolve=>resolve({data:[{id:'comp',tipo:'Componente',produto:'Tampo',ativo:true,valor_locacao:40,referencia:'TMP'}],error:null}):()=>q});
   window.supabaseClient.from=t=>t==='itens'?q:orig(t);
   window.supabaseClient.rpc=(n,p)=>n==='pedido_catalogo_estoque'?Promise.resolve({data:{comp:[10,4,null,3]},error:null}):rpc(n,p);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/teste-lista`);
  await page.waitForFunction(()=>typeof document.querySelector('#cat').contentWindow.abrirProjetoComercialPedido==='function');
  const cat=page.frameLocator('#cat'),frame=page.frames().find(f=>f.url().includes('catalogo.html'));
  await frame.evaluate(()=>window.abrirProjetoComercialPedido());
  await cat.locator('[data-pa-amb="a"] [data-cpj="item-transferir"]').click();
  const dlg=cat.locator('dialog.cpj-modal');await dlg.locator('[name="quantidade"]').fill('2');await dlg.locator('[type="submit"]').click();
  await page.waitForFunction(()=>window.__sincronizados.at(-1)?.dados?.ambientes[1].itens[0]?.quantidade===2);
  let dados=await page.evaluate(()=>window.__sincronizados.at(-1).dados);assert.equal(dados.ambientes[0].itens[0].quantidade,3);assert.equal(dados.ambientes[1].itens[0].observacao,'Preservar');
  await cat.locator('[data-pa-amb="a"] [data-cpj="item-transferir"]').click();await dlg.locator('[name="quantidade"]').fill('4');await dlg.locator('[type="submit"]').click();assert.match(await dlg.locator('.cpj-modal-error').innerText(),/entre 1 e 3/);
  await dlg.locator('[name="quantidade"]').fill('3');await dlg.locator('[type="submit"]').click();
  await page.waitForFunction(()=>window.__sincronizados.at(-1)?.dados?.ambientes[1].itens[0]?.quantidade===5);
  dados=await page.evaluate(()=>window.__sincronizados.at(-1).dados);assert.equal(dados.ambientes[0].itens.length,0);assert.equal(dados.ambientes[1].itens[0].quantidade,5);
  await cat.locator('[data-terc-id="t"] [data-cpj="terc-transferir"]').click();await dlg.locator('[name="quantidade"]').fill('1');await dlg.locator('[type="submit"]').click();
  await page.waitForFunction(()=>window.__sincronizados.at(-1)?.dados?.terceirizados.length===2);
  dados=await page.evaluate(()=>window.__sincronizados.at(-1).dados);assert.equal(dados.terceirizados.find(t=>t.id==='t').quantidade,3);const movido=dados.terceirizados.find(t=>t.id!=='t');assert.equal(movido.ambiente_id,'b');assert.equal(movido.custo,10);assert.equal(movido.valor,30);
  await cat.locator('[data-cpj="add-componente"]').click();await dlg.locator('[data-comp-id="comp"]').waitFor();
  assert.match(await dlg.locator('[data-comp-id="comp"]').innerText(),/Disponível.*4/s);assert.match(await dlg.locator('[data-comp-id="comp"]').innerText(),/Reservado.*3/s);
  await page.screenshot({path:'.tmp/pedido-componentes.png'});await dlg.locator('[data-comp-id="comp"]').click();await dlg.locator('[name="ambiente"]').selectOption('b');await dlg.locator('[type="submit"]').click();
  await page.waitForFunction(()=>window.__sincronizados.at(-1)?.dados?.ambientes[1].itens.some(i=>i.item_id==='comp'));
  await frame.evaluate(async()=>{
   const {pedidoPreviewHtml,dadosApresentacao}=await import('/Modulos/Comercial/Catalogo/projeto-apresentacao.mjs');
   const projeto={dados:{ambientes:[{id:'a',nome:'Lounge',itens:[],renders:[{url:'https://fixture/render.png'}]}]}};
   document.querySelector('#catalogProjetos').insertAdjacentHTML('beforeend',pedidoPreviewHtml(dadosApresentacao(projeto,()=>null),{layout:'final'}));
  });
  assert.equal(await cat.locator('.cpj-order-renders>h2').evaluate(el=>getComputedStyle(el).textAlign),'center');
  console.log('OK - transferência parcial/total salva; valida quantidade; componente mostra disponível e reserva real');
  await page.goto(`http://127.0.0.1:${server.address().port}/teste-ajustes`);
  await page.evaluate(async()=>{
   window.__CONTEXT={empresa_id:'e'};window.__calls=[];
   const query={select(){return this},eq(){return this},ilike(){return this},limit(){return this},single(){return this},then(resolve){resolve({data:[],error:null})}};
   window.supabaseClient={from:()=>query,rpc:async(n,p)=>{window.__calls.push({n,p});return {data:n==='pedido_saldo_conta_cliente'?{bv:123,credito:45}:{lancamentos:[{origem:'bv',numero_pedido:'100',aberto:123,emissao:'2026-11-01',descricao:'BV do pedido'},{origem:'credito_cliente',descricao:'Pagamento a maior',observacoes:'Pix duplicado',aberto:45}]},error:null}}};
   const {initAutocompleteClientes}=await import('/js/pedido/pedido.clientes.mjs');initAutocompleteClientes({supabase:window.supabaseClient,clienteInput:document.querySelector('#clienteInput'),clienteLista:document.querySelector('#clienteLista'),clienteIdHidden:document.querySelector('#clienteIdHidden')});
   const {iniciarSaldoClientePedido}=await import('/js/pedido/pedido.saldo-cliente.mjs');window.__saldo=iniciarSaldoClientePedido();
   window.google={maps:{Map:class{constructor(el){this.el=el;el.style.background='#dce6d5'}getDiv(){return this.el}addListener(){}setCenter(){}},Marker:class{addListener(){}setMap(){}setPosition(){}setDraggable(){}setTitle(){}},event:{trigger(){}}}};
   const {initAutocompleteLocaisEKm}=await import('/js/pedido/pedido.locais-km.mjs');initAutocompleteLocaisEKm({supabase:window.supabaseClient,localInput:document.querySelector('#localInput'),localLista:document.querySelector('#localLista'),localIdHidden:document.querySelector('#localIdHidden')});
   window.__pedidoRenderizarLocalEvento({id:'l',nome_razao:'Local',latitude:-22,longitude:-43,distancia_galpao_km:5});
  });
  await page.locator('#pgResumoBV').waitFor();await page.locator('.pagamento-mini-card').first().hover();
  await page.locator('#pedidoSaldoTooltip li').waitFor();assert.match(await page.locator('#pedidoSaldoTooltip').innerText(),/Pedido #100/);assert.doesNotMatch(await page.locator('#pedidoSaldoTooltip').innerText(),/Pix duplicado/);
  await page.screenshot({path:'.tmp/pedido-saldo.png'});assert.equal(await page.locator('#pedidoSaldoTooltip').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
  await page.locator('.pagamento-mini-card').nth(1).hover();await page.waitForFunction(()=>document.querySelector('#pedidoSaldoTooltip')?.textContent.includes('Pix duplicado'));
  assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.n==='pedido_saldo_conta_cliente_detalhes').length),1);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#pedidoSaldoTooltip').isVisible(),false);
  await page.locator('#clienteInput').fill('Kell');await page.locator('.autocomplete-novo-cliente').waitFor();assert.match(await page.locator('.autocomplete-novo-cliente').innerText(),/Cadastrar novo cliente.*Kell/s);
  assert.equal(await page.locator('.autocomplete-novo-cliente').evaluate(el=>getComputedStyle(el).borderTopWidth),'1px');
  await page.locator('.autocomplete-novo-cliente').click();await page.locator('#pedidoCadastroTela').waitFor();assert.match(await page.locator('#pedidoCadastroTela').getAttribute('src'),/nome=Kell/);
  await page.locator('#pedidoCadastroTela').evaluate(el=>el.remove());
  for(const [width,height,zoom] of [[1412,820,1],[1412,820,1.25],[1412,820,.8],[390,640,1],[1000,420,1.25]]){
   await page.setViewportSize({width,height});await page.evaluate(z=>document.documentElement.style.zoom=z,zoom);
   await page.mouse.move(2,2);await page.keyboard.press('Escape');
   await page.locator('#pedidoMiniMapaAbrir').click();await page.locator('#pedidoMapModal').waitFor();
   if(width===1412&&zoom===1.25)await page.screenshot({path:'.tmp/pedido-mapa.png'});const r=await page.locator('.pedido-map-dialog').boundingBox();assert.ok(Math.abs(r.y+r.height/2-height/2)<3,JSON.stringify({width,height,zoom,r}));assert.ok(r.y>=0&&r.y+r.height<=height+1);
   await page.locator('#pedidoMapModalConcluir').click();
  }
  assert.deepEqual(erros,[]);console.log('OK - cadastro formatado abre; hover branco detalha BV/crédito; mapa centralizado em desktop, celular e zoom');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
