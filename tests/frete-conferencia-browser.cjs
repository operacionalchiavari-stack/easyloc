const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1860,height:900}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
 await page.setContent('<main id="plModuloFretes"></main>');
 await page.evaluate(()=>{
  window.__editar=true;window.__calls=[];window.aguardarContexto=async()=>({empresa_id:'emp'});window.EasyLocPermissions={hasPermission:()=>__editar};
  const programado={id:'cam1',transportadora:'Caminho Certo',nome:'Mercedes Axor · ABC1234',foto:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="%23123f86"/></svg>',fornecedor_id:'for1'};
  const real={id:'cam2',transportadora:'Outra Transportadora',nome:'Mercedes Atego · DEF5678',foto:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="%23276743"/></svg>',fornecedor_id:'for2',em:'2026-11-23T11:00:00Z',expedidor:'João Expedidor'};
  const cob={id:'lanc2',fornecedor:'Outra Transportadora',fornecedor_id:'for2',caminhao_id:'cam2',caminhao:real.nome,valor:350,enviado:true,origem_lanc:'freteiro',situacao:'divergente'};
  window.__linha={chave:'anuncio:a',versao:'v1',nome:programado.transportadora,detalhe:programado.nome,foto:programado.foto,confirmado:true,programado,carregamentos:[real],cobrancas:[cob],cobranca:null};
  window.supabaseClient={rpc:async(n,a)=>{
   __calls.push({n,a});
   if(n==='logistica_frete_conferir'){
    if(window.__falhar)return {error:{message:'Os dados mudaram. Atualize a tela antes de decidir'}};
    __linha.conferencia={caminhao_id:a.p_caminhao,lancamento_id:a.p_lancamento,valor_final:a.p_valor,motivo:a.p_motivo,decidido_nome:'Maria',decidido_em:'2026-11-23T12:00:00Z'};__linha.cobranca=cob;
   }
   return {data:n==='logistica_fretes_anunciados'?[{id:'a',pedido_id:'p',pedido:'13',cliente:'Evento Studio Ramos',data:new Date().toISOString().slice(0,10),etapa:'Entrega',direcao:'entrega',quantidade:1,valor:310,linhas:[__linha]}]:[]};
  }};
 });
 await page.addStyleTag({path:path.resolve('Modulos/Logistica/PainelLogistico/painel-anunciados.css')});await page.addScriptTag({path:path.resolve('Modulos/Logistica/PainelLogistico/painel-anunciados.js')});
 await page.evaluate(()=>PainelAnunciados.abrir('frete'));
 assert.match(await page.locator('.pla-carga').innerText(),/Outra Transportadora/);assert.equal(await page.locator('.pla-carga img').count(),1);
 await page.click('[data-frete-conferir]');
 await page.selectOption('dialog [name=caminhao]','cam2');await page.selectOption('dialog [name=lancamento]','lanc2');
 assert.match(await page.locator('[data-valor-enviado]').innerText(),/350,00/);await page.fill('dialog [name=valor]','340');await page.fill('dialog [name=motivo]','Expedição carregou outra transportadora; valor negociado.');
 await page.click('dialog [type=submit]');await page.locator('dialog').waitFor({state:'detached'});
 const enviado=await page.evaluate(()=>__calls.find(c=>c.n==='logistica_frete_conferir').a);
 assert.equal(enviado.p_caminhao,'cam2');assert.equal(enviado.p_lancamento,'lanc2');assert.equal(enviado.p_valor,340);
 const cells=page.locator('tbody tr').first().locator('td');assert.match(await cells.nth(4).innerText(),/Outra Transportadora/);
 assert.match(await cells.nth(5).innerText(),/310,00/);assert.match(await cells.nth(6).innerText(),/350,00/);assert.match(await cells.nth(7).innerText(),/340,00/);
 await page.screenshot({path:'outputs/frete-conferencia.png',fullPage:true});
 await page.click('[data-frete-conferir]');await page.evaluate(()=>window.__falhar=true);await page.click('dialog [type=submit]');await page.locator('dialog .pls-erro:not([hidden])').waitFor();assert.match(await page.locator('dialog .pls-erro').innerText(),/dados mudaram/);await page.click('dialog [data-voltar]');
 await page.fill('[data-busca]','DEF5678');assert.equal(await page.locator('.pla-grupo').count(),1,'busca encontra o caminhão real');
 const leitura=await browser.newPage();await leitura.setContent('<main id="plModuloFretes"></main>');
 await leitura.evaluate(dados=>{window.aguardarContexto=async()=>({empresa_id:'emp'});window.EasyLocPermissions={hasPermission:()=>false};window.supabaseClient={rpc:async n=>({data:n==='logistica_fretes_anunciados'?dados:[]})};},await page.evaluate(()=>[{id:'a',pedido_id:'p',data:'2026-11-23',linhas:[__linha]}]));
 await leitura.addScriptTag({path:path.resolve('Modulos/Logistica/PainelLogistico/painel-anunciados.js')});await leitura.evaluate(()=>PainelAnunciados.abrir('frete'));assert.equal(await leitura.locator('[data-frete-conferir]').count(),0);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'rolagem da tabela fica dentro do cartão no celular');
 const div=await browser.newPage();await div.setContent('<button id="plTabDivergencias"><b class="pl-alerta-aba"></b></button><main id="plModuloDivergencias"></main>');
 await div.evaluate(()=>{
  window.aguardarContexto=async()=>({empresa_id:'emp'});window.EasyLocPermissions={hasPermission:()=>false};
  window.DivergenciasTabela={lerFotos:async()=>{},pedidoDe:()=>'',clienteDe:()=>'',html:lista=>lista.map(d=>'<p>'+d.nome+'</p>').join('')};
  window.supabaseClient={rpc:async()=>({data:{abertas:[{origem:'frete',nome:'Frete oculto'},{origem:'free',nome:'Free pendente'},{origem:'uber',nome:'Uber pendente'}],resolvidas:[]}})};
 });
 await div.addScriptTag({path:path.resolve('Modulos/Logistica/PainelLogistico/painel-servicos.js')});await div.evaluate(()=>PainelServicos.abrir('divergencias'));
 assert.equal(await div.locator('[data-origem] option[value=frete]').count(),0);assert.doesNotMatch(await div.locator('main').innerText(),/Frete oculto/);assert.equal(await div.locator('.pl-alerta-aba').innerText(),'2');
 assert.deepEqual(erros,[]);console.log('frete-conferencia-browser: ok');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
