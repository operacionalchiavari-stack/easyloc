const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge'});try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
 await page.route('http://localhost:9901/**',r=>r.fulfill({contentType:'text/html',body:'<div id="ecMensagem" hidden></div><section class="ec-page"><input id="ecBusca"><div id="ecPedidos"></div><section id="ecDetalhe"></section></section>'}));await page.goto('http://localhost:9901/');
 await page.addStyleTag({path:'Modulos/Logistica/EntregasColetas/entregas-coletas.css'});
 await page.evaluate(()=>{
  window.confirm=()=>true;window.__CONTEXT={empresa_id:'e1',usuario_nome:'Supervisor'};window.aguardarContexto=async()=>__CONTEXT;
  const item={chave:'linha|item',item_id:'item',nome:'Cadeira Tiffany para o evento',previsto:10,carregado:10};
  const pedido={id:'p1',numero_pedido:'8',cliente_nome:'Decoradora',local_nome:'Local do evento',data_entrega:'2026-11-03',fluxo_etapa:'entrega'};
  window.b={pedido,itens:[item],historico:[],atual:null,token:'1'};window.chamadas=[];window.evFotos=[];
  window.PedidoFluxo={fila:async()=>[pedido]};
  window.EvidenciasOperacao={carregar:async()=>evFotos,render:()=>{},preparar:async(file,chave)=>({id:'foto1',chave,foto:'data:image/jpeg;base64,/9j/2Q==',descricao:'Foto do retorno'})};
  window.supabaseClient={storage:{from:()=>({upload:async()=>({})})},from:t=>{const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,range:()=>q,then:f=>f({data:t==='logistica_motivos'?[{id:'motivo',nome:'Cliente dispensou o item',etapa:'entrega'}]:[],error:null})};return q;},rpc:async(n,a)=>{
   chamadas.push([n,a]);if(n==='logistica_confirmacao_base')return {data:structuredClone(b)};
   if(n==='logistica_evidencia_registrar'){evFotos.push({chave:a.p_chave,etapa:a.p_etapa});return {data:'foto1'};}
   if(n==='logistica_confirmacao_salvar'){b.atual={itens:a.p_itens,versao:1,criado_em:new Date().toISOString(),responsavel:'Supervisor'};return {data:structuredClone(b)};}
   if(n==='logistica_montagem_registros')return {data:[{tipo:'montagem',registros:[{tipo:'conferencia_entrega',origem:'mobile',autor:'Ana',criado_em:new Date().toISOString()}]}]};
   return {data:[]};}};
 });
 await page.addScriptTag({path:'Modulos/Logistica/EntregasColetas/montagem-registros.js'});
 await page.addScriptTag({path:'Modulos/Logistica/EntregasColetas/entregas-coletas.js'});
 await page.locator('[data-pedido=p1]').click();await page.locator('[name=entregue_local]').waitFor();
 assert.match(await page.locator('.ec-app-registrado').innerText(),/registrada pelo app/);
 assert.equal(await page.locator('.ec-historico').count(),0);
 assert.equal(await page.locator('.ec-fotos-item').isVisible(),false);
 await page.locator('[name=entregue_local]').fill('6');await page.locator('[name=desistencia]').fill('2');await page.locator('[name=danificado]').fill('2');await page.locator('[name=motivo]').selectOption('motivo');
 await page.locator('#ecForm [type=submit]').click();assert.match(await page.locator('#ecMensagem').innerText(),/foto/);assert.equal(await page.evaluate(()=>chamadas.filter(([n])=>n==='logistica_confirmacao_salvar').length),0);
 await page.locator('[data-evidencia]').setInputFiles({name:'foto.jpg',mimeType:'image/jpeg',buffer:Buffer.from('foto')});
 await page.waitForFunction(()=>document.querySelector('#ecForm')&&document.querySelector('[data-fotos-item]').hidden===false);
 await page.locator('#ecForm [type=submit]').click();await page.waitForFunction(()=>chamadas.some(([n])=>n==='logistica_confirmacao_salvar'));
 const enviado=await page.evaluate(()=>chamadas.find(([n])=>n==='logistica_confirmacao_salvar')[1].p_itens[0]);
 assert.equal(enviado.entregue_local,6);assert.equal(enviado.entregue,10);assert.equal(enviado.voltou_antes,4);assert.equal(enviado.desistencia,2);assert.equal(enviado.danificado,2);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=390));
 await page.screenshot({path:'.tmp/entrega-colunas-celular.png',fullPage:true});
 // Colunas da volta e foto opcional.
 const retorno=await browser.newPage();await retorno.setContent('<div id="caixa"><div class="cf-qtd-tabela"><div class="cf-qtd-linha cf-qtd-cabeca"><span></span><span>Item</span><span></span><span>Voltou</span><span>Capas</span><span>Observacao</span></div><div class="cf-qtd-linha"><span></span><strong>Cadeira</strong><span></span><label><span>Quantidade</span><input class="cf-qtd-input" data-chave="chave" value="3"></label><div>Capas</div><input class="cf-qtd-obs"></div></div></div>');
 await retorno.addScriptTag({path:'Modulos/Logistica/Conferencia/retorno-colunas.js'});
 await retorno.evaluate(async()=>{await RetornoColunas.montar({caixa:document.querySelector('#caixa'),lista:[{chave:'chave',nome:'Cadeira'}],sb:{rpc:async()=>({data:[]})},empresa:'e1',pedido:{id:'p1'}});});
 assert.match(await retorno.locator('.cf-qtd-cabeca').innerText(),/1.*contagem.*2.*contagem.*Danificados/s);
 assert.equal(await retorno.locator('.cf-primeira-celula .cf-qtd-input').count(),1);
 await retorno.evaluate(()=>RetornoColunas.segunda({chave:3}));assert.equal(await retorno.locator('.cf-primeira-celula').innerText(),'3');assert.equal(await retorno.locator('.cf-segunda-celula .cf-qtd-input').count(),1);
 await retorno.locator('[data-danificado]').fill('1');const payload=await retorno.evaluate(()=>RetornoColunas.payload(document.querySelector('#caixa'),{chave:3}));assert.equal(payload.p_danificados.chave,1);assert.deepEqual(payload.p_fotos.chave,[]);
 assert.deepEqual(erros,[]);console.log('OK - entrega, motivo, foto obrigatoria, app compacto, celular e contagens separadas com danos opcionais.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
