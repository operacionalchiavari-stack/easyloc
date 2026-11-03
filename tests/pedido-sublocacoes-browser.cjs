const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1380,height:950}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
 await page.route('http://acervo.teste/**',r=>{const file=path.join(process.cwd(),new URL(r.request().url()).pathname);return r.fulfill({contentType:file.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(file)});});
 await page.setContent('<link rel="stylesheet" href="http://acervo.teste/styles/sublocacoes.css"><button data-sublocacoes>Sublocações</button>');
 await page.evaluate(()=>{
  window.__CONTEXT={empresa_id:'empresa'};window.aguardarContexto=async()=>{};window.envios=[];
  const b={pedido:{id:'pedido',numero:'6',cliente:'Cliente A',entrega:'2026-11-10',coleta:'2026-11-12'},itens:[{item_id:'cadeira',nome:'Cadeira Dior',quantidade:10,sublocada:0}],fornecedores:[{id:'fornecedor',nome:'Locadora parceira'},{id:'fornecedor2',nome:'Locadora B'}],sublocacoes:[]};window.__baseSublocacao=b;
  window.supabaseClient={rpc:async(n,args)=>{
   if(n==='pedido_sublocacoes_listar')return {data:[]};
   if(n==='pedido_sublocacao_pedidos_buscar')return {data:[{id:'pedido',numero_pedido:'6',cliente_nome:'Cliente A'}]};
   if(n==='pedido_item_outros_pedidos')return {data:[{id:'p2',numero:'2',cliente:'Cliente B',contato:'222',quantidade:4,evento:'2026-11-11',status:'aprovado'},{id:'p3',numero:'3',cliente:'Cliente C',contato:'333',quantidade:4,evento:'2026-11-11',status:'aprovado'}]};
   if(n==='pedido_sublocacao_salvar'){
    window.envios.push(args);const s={...args.p_dados,id:'sub1',pedido_id:'pedido',numero_pedido:'6',cliente:'Cliente A',item_nome:'Cadeira Dior',fornecedor_nome:'Locadora parceira',revisao:(args.p_revisao??-1)+1};b.sublocacoes=[s];b.itens[0].sublocada=s.status==='cotacao'?0:s.quantidade;
   }
   if(n==='pedido_sublocacao_transferir_saldo'){
    window.__transferencia=args;const s=b.sublocacoes[0],saldo=s.quantidade-s.quantidade_recebida;s.quantidade=s.quantidade_recebida;s.status='recebida';s.revisao++;
    b.sublocacoes.push({...s,id:'sub2',fornecedor_id:'fornecedor2',fornecedor_nome:'Locadora B',quantidade:saldo,quantidade_recebida:0,quantidade_devolvida:0,status:'confirmada',revisao:0});
   }
   return {data:structuredClone(b)};
  }};
 });
 await page.addScriptTag({url:'http://acervo.teste/js/ui/sublocacoes.js'});await page.getByRole('button',{name:'Sublocações',exact:true}).click();
 await page.getByRole('button',{name:'Buscar pedidos',exact:true}).click();await page.getByRole('button',{name:'Pedido 6 · Cliente A'}).click();
 await page.locator('[name=item_id]').selectOption('cadeira');await page.getByRole('button',{name:'Consultar outros pedidos'}).click();
 await page.locator('[data-alternativas]').getByText(/Cliente B/).waitFor();assert.match(await page.locator('[data-alternativas]').innerText(),/Cliente B.*4.*Cliente C.*4/s);
 assert.match(await page.locator('[data-alternativas]').innerText(),/Só remaneje depois do aceite/);
 await page.locator('[name=fornecedor_id]').selectOption('fornecedor');await page.locator('[name=quantidade]').fill('8');await page.locator('[name=custo_unitario]').fill('25');
 assert.match(await page.locator('[data-total]').innerText(),/200,00/);await page.getByRole('button',{name:'Salvar sublocação',exact:true}).click();
 await page.getByText(/Sublocação salva/).waitFor();assert.equal(await page.evaluate(()=>envios[0].p_dados.status),'cotacao');
 await page.getByRole('button',{name:'Consultar / editar'}).click();await page.locator('[name=status]').selectOption('confirmada');await page.getByRole('button',{name:'Salvar sublocação',exact:true}).click();
 await page.waitForFunction(()=>envios.length===2);assert.equal(await page.evaluate(()=>envios[1].p_revisao),0);
 await page.getByRole('button',{name:'Consultar / editar'}).click();await page.locator('[name=status]').selectOption('recebida');await page.getByRole('button',{name:'Salvar sublocação',exact:true}).click();await page.waitForFunction(()=>envios.length===3);
 await page.getByRole('button',{name:'Consultar / editar'}).click();assert.equal(await page.locator('[name=quantidade]').isDisabled(),true);await page.locator('[name=status]').selectOption('devolvida');await page.getByRole('button',{name:'Salvar sublocação',exact:true}).click();await page.waitForFunction(()=>envios.length===4);
 await page.getByRole('button',{name:'Consultar / editar'}).click();assert.equal(await page.getByRole('button',{name:'Salvar sublocação',exact:true}).isDisabled(),true);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('.sl-dialog').evaluate(e=>e.getBoundingClientRect().width<=innerWidth));
 await page.screenshot({path:'.tmp/sublocacoes-mobile.png'});await page.getByRole('button',{name:'Fechar',exact:true}).click();
 await page.evaluate(()=>{window.__PEDIDO_ATUAL_ID='pedido';document.body.insertAdjacentHTML('beforeend','<button id="btnSalvarPedido">Salvar</button>');Sublocacoes.abrir('atual');});
 await page.getByRole('heading',{name:'Pedido 6 · Cliente A'}).waitFor();await page.getByRole('button',{name:'Fechar',exact:true}).click();
 await page.evaluate(()=>{window.__PEDIDO_ATUAL_ID=null;Sublocacoes.abrir('atual');});await page.getByText(/Salve o orçamento antes/).waitFor();
 await page.getByRole('button',{name:'Fechar',exact:true}).click();
 await page.evaluate(()=>{const s=window.__baseSublocacao.sublocacoes[0];Object.assign(s,{status:'confirmada',quantidade:8,quantidade_recebida:0,quantidade_devolvida:0});Sublocacoes.abrir('pedido');});
 await page.getByRole('button',{name:'Consultar / editar'}).click();await page.locator('[name=status]').selectOption('recebida_parcial');await page.locator('[name=quantidade_recebida]').fill('6');await page.getByRole('button',{name:'Salvar sublocação',exact:true}).click();
 await page.getByText('6 recebidas · 0 devolvidas').waitFor();await page.getByRole('button',{name:'Consultar / editar'}).click();
 await page.getByRole('button',{name:'Transferir saldo a outro fornecedor'}).click();
 const transferir=page.getByRole('dialog',{name:'Transferir saldo de sublocação'});await transferir.locator('[name=fornecedor_id]').selectOption('fornecedor2');await transferir.locator('[name=custo_unitario]').fill('30');await transferir.locator('[name=observacao]').fill('Saldo acordado com os dois fornecedores.');await transferir.getByRole('button',{name:'Confirmar transferência do saldo'}).click();
 await page.getByText('Saldo transferido. Confira os recebimentos por fornecedor.').waitFor();assert.equal(await page.evaluate(()=>__transferencia.p_dados.fornecedor_id),'fornecedor2');assert.equal(await page.getByRole('button',{name:'Consultar / editar'}).count(),2);
 assert.deepEqual(erros,[]);console.log('OK - Comercial e pedido: consulta 4+4, cotacao, confirmacao, recebimento, devolucao, concorrencia e celular.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
