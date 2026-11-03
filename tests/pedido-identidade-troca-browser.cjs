const {chromium}=require('playwright'),express=require('express'),assert=require('node:assert/strict');
(async()=>{
 const app=express();app.get('/teste',(_,r)=>r.send('<html><body></body></html>'));app.use(express.static(process.cwd()));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();const erros=[];page.on('pageerror',e=>erros.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/teste`);
  await page.setContent(`<div class="pedido-screen"><div class="autocomplete-wrapper"><input id="clienteInput" value="Ana"><input id="clienteIdHidden" value="c1"><div id="clienteLista"></div></div><input id="telefoneInput" value="111"><input id="localInput" value="Local antigo"><input id="localIdHidden" value="l1"><div id="localLista"></div><div id="localObservacoes"></div><input id="freteKmManual" value="42"><span id="freteDistanciaKm">42 km</span><section id="pedidoContratoCard"><div id="pedidoContratoAviso"></div><button id="btnEditarContratoPedido">Editar</button><textarea id="pedidoContratoEditor" hidden></textarea><div id="pedidoContratoPreview"></div></section></div>`);
  await page.evaluate(async()=>{
   window.__CONTEXT={empresa_id:'e1'};window.__avisos=[];window.alerta=(m)=>window.__avisos.push(m);window.kmPedido=42;
   const banco={empresas:[{id:'e1',nome:'Empresa'}],clientes_empresas:[{id:'c1',empresa_id:'e1',nome_razao:'Ana',cpf_cnpj:'11111111111',telefone:'111'},{id:'c2',empresa_id:'e1',nome_razao:'Beatriz',cpf_cnpj:'22222222222',telefone:'222'}],locais_empresas:[{id:'l1',empresa_id:'e1',nome_razao:'Local antigo',endereco:'Rua antiga',distancia_galpao_km:42},{id:'l2',empresa_id:'e1',nome_razao:'Local novo',endereco:'Rua nova',distancia_galpao_km:7}],contratos_modelos:[{id:'m1',empresa_id:'e1',padrao:true,ativo:true,conteudo:'Cliente {{cliente_nome}} Documento {{cliente_documento}} Local {{local_nome}} Endereco {{local_endereco}}'}]};
   window.sb={from(t){let filtro=[],unico=false,termo='';const q={select:()=>q,update:()=>{window.__distanciaAtualizada=true;return q;},eq:(k,v)=>{filtro.push([k,v]);return q;},limit:()=>q,ilike:(k,v)=>{termo=v.replaceAll('%','').toLowerCase();return q;},maybeSingle:()=>{unico=true;return q;},single:()=>{unico=true;return q;},then(ok,erro){const rows=(banco[t]||[]).filter(r=>filtro.every(([k,v])=>r[k]===v)&&(!termo||r.nome_razao.toLowerCase().includes(termo)));const out={data:unico?rows[0]||null:rows,error:null};if(t==='clientes_empresas'&&window.__adiarCliente&&filtro.some(([k,v])=>k==='id'&&v==='c1')){return new Promise(resolve=>{window.__resolverCliente=()=>resolve(out);}).then(ok,erro);}if(t==='clientes_empresas'&&termo==='an'&&window.__adiarBusca)return new Promise(resolve=>{window.__resolverBusca=()=>resolve(out);}).then(ok,erro);return Promise.resolve(out).then(ok,erro);}};return q;}};
   const c=await import('/js/pedido/pedido.clientes.mjs'),l=await import('/js/pedido/pedido.locais-km.mjs'),contrato=await import('/js/pedido/pedido.contratos.mjs');
   c.initAutocompleteClientes({supabase:sb,clienteInput:document.getElementById('clienteInput'),clienteLista:document.getElementById('clienteLista'),clienteIdHidden:document.getElementById('clienteIdHidden'),telefoneInput:document.getElementById('telefoneInput')});
   l.initAutocompleteLocaisEKm({supabase:sb,localInput:document.getElementById('localInput'),localLista:document.getElementById('localLista'),localIdHidden:document.getElementById('localIdHidden'),obsDiv:document.getElementById('localObservacoes')});
   await contrato.initContratoPedido({supabase:sb});
  });
  assert.match(await page.locator('#pedidoContratoPreview').innerText(),/11111111111.*Rua antiga/);
  await page.locator('#clienteInput').fill('Beatriz');assert.equal(await page.locator('#clienteIdHidden').inputValue(),'');assert.equal(await page.locator('#telefoneInput').inputValue(),'');
  await page.locator('#clienteLista .autocomplete-item').click();await page.evaluate(()=>window.__pedidoContratoAtualizar());
  assert.equal(await page.locator('#clienteIdHidden').inputValue(),'c2');assert.match(await page.locator('#pedidoContratoPreview').innerText(),/22222222222/);
  await page.locator('#localInput').fill('Local novo');assert.equal(await page.locator('#localIdHidden').inputValue(),'');
  assert.equal(await page.evaluate(()=>window.kmPedido),0);assert.equal(await page.locator('#freteKmManual').inputValue(),'');
  await page.evaluate(()=>window.__pedidoContratoAtualizar());assert.doesNotMatch(await page.locator('#pedidoContratoPreview').innerText(),/Rua antiga/);
  await page.locator('#localLista .autocomplete-item').click();await page.evaluate(()=>window.__pedidoContratoAtualizar());
  assert.equal(await page.evaluate(()=>window.kmPedido),7);assert.match(await page.locator('#pedidoContratoPreview').innerText(),/Rua nova/);
  await page.evaluate(()=>{
    window.sb.auth={getSession:async()=>({data:{session:{access_token:'teste'}}})};window.sb.supabaseUrl=location.origin;window.sb.supabaseKey='teste';
    const originalFetch=window.fetch;window.fetch=(url,args)=>String(url).includes('/functions/v1/calcular-distancia')?new Promise(resolve=>{window.__payloadDistancia=JSON.parse(args.body);window.__resolverDistancia=()=>resolve(new Response(JSON.stringify({km:123}),{headers:{'Content-Type':'application/json'}}));}):originalFetch(url,args);
    window.__pedidoRenderizarLocalEvento({id:'l3',nome_razao:'Local atrasado',endereco:'Rua atrasada',latitude:null,longitude:null});
  });
  await page.waitForFunction(()=>window.__resolverDistancia);
  const destino=await page.evaluate(()=>window.__payloadDistancia);assert.equal(destino.latitudeDestino,null);assert.ok(destino.destino.includes('Rua atrasada'));
  await page.evaluate(()=>{window.__pedidoRenderizarLocalEvento({id:'l2',nome_razao:'Local novo',endereco:'Rua nova',distancia_galpao_km:7});window.__resolverDistancia();});
  await page.waitForFunction(()=>window.__distanciaAtualizada);assert.equal(await page.evaluate(()=>window.kmPedido),7,'resposta de outro local nao altera o frete atual');
  await page.evaluate(()=>{document.getElementById('clienteIdHidden').value='c1';window.__adiarCliente=true;window.__contratoAntigo=window.__pedidoContratoAtualizar();});
  await page.waitForFunction(()=>window.__resolverCliente);
  await page.evaluate(async()=>{document.getElementById('clienteIdHidden').value='c2';window.__adiarCliente=false;await window.__pedidoContratoAtualizar();window.__resolverCliente();await window.__contratoAntigo;});
  assert.match(await page.locator('#pedidoContratoPreview').innerText(),/22222222222/);assert.doesNotMatch(await page.locator('#pedidoContratoPreview').innerText(),/11111111111/);
  await page.evaluate(()=>{window.__adiarBusca=true;});await page.locator('#clienteInput').fill('An');await page.waitForFunction(()=>window.__resolverBusca);
  await page.locator('#clienteInput').fill('');await page.evaluate(()=>window.__resolverBusca());
  assert.equal(await page.locator('#clienteLista .autocomplete-item').count(),0);
  await page.evaluate(()=>{document.getElementById('clienteIdHidden').value='c1';window.__adiarCliente=true;window.__resolverCliente=null;window.__contratoAntigo=window.__pedidoContratoAtualizar();});
  await page.waitForFunction(()=>window.__resolverCliente);
  await page.locator('#btnEditarContratoPedido').click();await page.locator('#pedidoContratoEditor').fill('Texto combinado manualmente com a cliente.');await page.locator('#btnEditarContratoPedido').click();
  await page.evaluate(async()=>{window.__resolverCliente();await window.__contratoAntigo;});
  assert.equal(await page.locator('#pedidoContratoPreview').innerText(),'Texto combinado manualmente com a cliente.');assert.deepEqual(erros,[]);
  console.log('OK - troca de cliente/local invalida vínculo, documento, endereço e frete; respostas antigas não sobrescrevem o contrato.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
