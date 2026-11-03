const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage(),erros=[];page.on('pageerror',e=>erros.push(e.message));
 await page.route('http://acervo.teste/**',r=>{const file=path.join(process.cwd(),new URL(r.request().url()).pathname);return r.fulfill({contentType:'text/javascript',body:fs.readFileSync(file)});});
 await page.setContent('<div id="financeiro"></div><section id="registros"></section>');
 await page.addScriptTag({url:'http://acervo.teste/js/empresa/empresa.sections.financeiro.js'});
 await page.evaluate(async()=>{const s=window.empresa.sections.financeiro,c=document.querySelector('#financeiro');s.render(c,{});await s.bind(c,{financeiro:{producao_pagamento_exige:true,producao_pagamento_percent:35}},{});});
 assert.equal(await page.locator('#financeiroProducaoExige').isChecked(),true);assert.equal(await page.locator('#financeiroProducaoPercent').inputValue(),'35');
 await page.locator('#financeiroProducaoExige').uncheck();assert.equal(await page.locator('#financeiroProducaoPercent').isDisabled(),true);
 await page.addScriptTag({url:'http://acervo.teste/Modulos/Logistica/Conferencia/carga-por-veiculo.js'});
 await page.evaluate(async()=>{
  const b={token:'1',concluido:false,veiculos:[],itens:[{chave:'cadeira',nome:'Cadeira',esperado:10}]};window.chamadas=[];
  const sb={rpc:async(n,args)=>{window.chamadas.push(n);if(n==='operacao_frota')return {data:[{id:'c1',codigo:'Caminhao 1'},{id:'c2',codigo:'Caminhao 2'}]};if(n==='operacao_carga_veiculo_salvar'){b.veiculos=b.veiculos.filter(c=>c.caminhao_id!==args.p_caminhao).concat({caminhao_id:args.p_caminhao,itens:args.p_itens});b.token=String(Number(b.token)+1);}return {data:structuredClone(b)};}};
  await CargaPorVeiculo.abrir(sb,'pedido','empresa');
 });
 await page.locator('[name=veiculo]').selectOption('c1');await page.locator('[data-i="0"]').fill('6');await page.getByRole('button',{name:/Salvar carga/}).click();
 await page.getByText(/O pedido continua em carregamento/).waitFor();await page.locator('[name=veiculo]').selectOption('c2');
 assert.equal(await page.locator('[data-i="0"]').getAttribute('max'),'4');await page.locator('[data-i="0"]').fill('4');await page.getByRole('button',{name:/Salvar carga/}).click();
 await page.waitForFunction(()=>window.chamadas.filter(n=>n==='operacao_carga_veiculo_salvar').length===2);
 assert.equal(await page.evaluate(()=>chamadas.some(n=>/concluir/.test(n))),false);await page.getByRole('button',{name:'Voltar',exact:true}).click();
 await page.addScriptTag({url:'http://acervo.teste/Modulos/Logistica/EntregasColetas/montagem-registros.js'});
 await page.evaluate(async()=>{await MontagemRegistros.carregar(document.querySelector('#registros'),{rpc:async()=>({data:[{id:'etapa',nome:'Montagem',tipo:'montagem',data:'2026-11-02',registros:[{tipo:'conferencia_entrega',origem:'mobile',autor:'Ana',criado_em:'2026-11-02T12:00:00Z',dados:{lista:[{chave:'cadeira',nome:'Cadeira',esperado:10,ambiente:'Cerimonia'}],itens:{cadeira:{entregue:10,danificados:1,observacao:'Encosto danificado'}}}}]}]})},'pedido');});
 assert.match(await page.locator('#registros').innerText(),/registrada pelo app/);
 assert.match(await page.locator('#registros').innerText(),/Ana/);
 assert.equal(await page.locator('#registros details, #registros iframe, #registros button').count(),0);
 assert.deepEqual(erros,[]);console.log('OK - percentual de producao, carga por dois veiculos sem conclusao e registros mobile no sistema.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
