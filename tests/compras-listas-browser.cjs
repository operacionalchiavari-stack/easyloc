const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE='http://localhost:5639/';
const needs=[{id:'n1',origem:'solicitacao',solicitante_nome:'Ana Ferreira',criado_por:'ana',setor_nome:'Costura',order_number:'1801',cliente_nome:'Cliente Jardim',material_nome:'Tecido de linho',unidade:'m',quantidade:10,status:'comprada',pcp_status:'published'},{id:'n2',origem:'manutencao',solicitante_nome:'Marcos Lima',criado_por:'marcos',local:'Galpão 2',material_nome:'Cola',unidade:'kg',quantidade:2,status:'comprada',pcp_status:'published'}];
const items=[{id:'i1',nome:'Tecido de linho',codigo:'TEC01',unidade:'m',quantidade_cotada:10,quantidade:10,quantidade_recebida:4,valor_total:50,need_allocations:[{purchase_request_id:'n1',quantidade_alocada:10}],respostas:[{supplier_id:'f1',valor_unitario:5},{supplier_id:'f2',valor_unitario:4},{supplier_id:'f3',valor_unitario:1}]},{id:'i2',nome:'Cola',unidade:'kg',quantidade_cotada:2,quantidade:2,quantidade_recebida:2,valor_total:40,need_allocations:[{purchase_request_id:'n2',quantidade_alocada:2}],respostas:[{supplier_id:'f1',valor_unitario:20},{supplier_id:'f2',valor_unitario:30},{supplier_id:'f3',nao_cotado:true}]}];
const suppliers=[{supplier_id:'f1',id:'f1',nome:'Tecidos Aurora',status:'respondido',header:{frete:20,desconto:5}},{supplier_id:'f2',id:'f2',nome:'Casa dos Materiais',status:'respondido',header:{frete:10}},{supplier_id:'f3',id:'f3',nome:'Loja Parcial',status:'respondido',header:{}},{supplier_id:'f4',id:'f4',nome:'Aguardando Ltda',status:'aguardando',header:{}}];
const quotations=[{id:'q1',numero:31,created_at:'2026-11-10',status:'aberta',items,suppliers,prazo_desejado:'2026-11-20',itens_count:2,fornecedores_count:4,respostas_count:3}];
const orders=[{id:'o1',numero:51,created_at:'2026-11-10',fornecedor_nome:'Tecidos Aurora',fornecedor_id:'f1',status:'recebido_parcial',items,valor_total:105,prazo_acordado:'2026-11-14',forma_pagamento:'boleto',parcelas:[{due_date:'2026-12-10',amount:52.5},{due_date:'2027-01-10',amount:52.5}],nfe_receipts:[{numero_nfe:'321'}]},{id:'o2',numero:52,created_at:'2026-11-12',fornecedor_nome:'Casa dos Materiais',fornecedor_id:'f2',status:'recebido',registro_direto:true,destino:'locacao',numero_nf:'987',comprador_nome:'Jonatan',items:[{id:'i3',nome:'Cadeira Chiavari',quantidade:5,quantidade_recebida:5,unidade:'un'}],valor_total:500,nfe_receipts:[]},{id:'o3',numero:53,status:'cancelado',fornecedor_nome:'Loja Parcial',items:[{nome:'Material cancelado',quantidade:8,unidade:'un'}],valor_total:0,nfe_receipts:[]}];
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({needs,quotations,orders,suppliers})=>{
   window.__CONTEXT={empresa_id:'empresa',usuario_id:'usuario'};window.aguardarContexto=async()=>__CONTEXT;window.lucide={createIcons(){}};
   window.__notices=[];window.alerta=m=>__notices.push(m);window.AcervoComprasAlert={success:alerta,error:alerta};window.AcervoComprasAuth={ready:Promise.resolve()};
   window.supabaseClient={from(){const q={select(){return q;},eq(){return q;},in(){return q;},then(resolve){return Promise.resolve({data:[]}).then(resolve);}};return q;}};
   window.__dados={needs,quotations,orders,suppliers};window.__abertos=[];
   window.AcervoComprasAPI={listSuppliers:async()=>suppliers,getPcpParameters:async()=>({}),listSupplierQualityIndex:async()=>[],listPurchaseNeeds:async()=>__dados.needs,listQuotationRequests:async()=>__dados.quotations,listPurchaseOrdersV2:async()=>__dados.orders,listNeedsInOpenQuotation:async()=>new Map(),listPurchaseCompositionQuotes:async()=>[],getPurchaseOrderV2Detail:async id=>{__abertos.push(id);return structuredClone(__dados.orders.find(o=>o.id===id));},getQuotationWorkspace:async id=>structuredClone(__dados.quotations.find(q=>q.id===id))};
  },{needs,quotations,orders,suppliers});
  await page.route('**/*',r=>{
   const u=r.request().url();if(!u.startsWith(BASE))return r.abort();
   const pathname=decodeURIComponent(new URL(u).pathname);
   if(/\.(?:js|mjs)$/.test(pathname)&&!/(?:compras|compras-listas|compras-fotos|compras-detalhes)\.js$/.test(pathname))return r.fulfill({body:'',contentType:'text/javascript'});
   const f=path.join(process.cwd(),pathname);if(!fs.existsSync(f)||!fs.statSync(f).isFile())return r.fulfill({status:404,body:''});
   return r.fulfill({body:fs.readFileSync(f),contentType:{'.css':'text/css','.html':'text/html','.js':'text/javascript','.woff2':'font/woff2'}[path.extname(f)]||'application/octet-stream'});
  });
  await page.goto(BASE+'Modulos/Estoque/Compras/compras.html');await page.waitForSelector('#ordersBody tr',{state:'attached'});
  await page.locator('[data-pv-tab=orders]').click();
  assert.equal(await page.locator('.pv-orders-table th').count(),8);
  assert.equal(await page.locator('.pv-orders-table th').first().innerText(),'FORNECEDOR');
  const pedido=page.locator('[data-order-id=o1]');
  async function semBarraHorizontal(tab,width){
   const medidas=await page.locator(`[data-pv-panel=${tab}] .tw-table-scroll`).evaluate(el=>({visivel:el.clientWidth,conteudo:el.scrollWidth}));
   assert.ok(medidas.conteudo<=medidas.visivel+1,`${tab} sem barra horizontal em ${width}: ${JSON.stringify(medidas)}`);
  }
  assert.match(await pedido.locator('.pv-order-people').textContent(),/Ana Ferreira.*Costura.*Marcos Lima/s);
  assert.match(await pedido.locator('.pv-order-destination').textContent(),/Pedido 1801.*Cliente Jardim.*Manutenção.*Galpão 2/s);
  assert.match(await pedido.locator('.pv-order-receipt').textContent(),/4 m de 10 m.*Faltam 6 m.*2 kg de 2 kg.*Concluído/s);
  assert.match(await pedido.textContent(),/XML anexado.*NF 321/s);
  assert.equal(await page.locator('[data-order-id=o2] .pv-order-people').count(),0,'não atribui o comprador como solicitante');
  assert.match(await page.locator('[data-order-id=o2]').textContent(),/Acervo de locação.*XML pendente.*NF 987 registrada/s);
  assert.equal(await page.locator('[data-order-id=o3] .pv-order-receipt').innerText(),'Pedido cancelado');
  await page.locator('#comprasSearch').fill('Costura');assert.equal(await page.locator('#ordersBody tr').count(),1);
  await page.locator('#comprasSearch').fill('987');assert.equal(await page.locator('#ordersBody tr').count(),1);assert.equal(await page.locator('#ordersBody tr').getAttribute('data-order-id'),'o2');
  await page.locator('#comprasSearch').fill('');await page.locator('#ordersStatusFilter').selectOption('recebidos');assert.equal(await page.locator('#ordersBody tr').count(),1);await page.locator('#ordersStatusFilter').selectOption('todos');
  await page.locator('[data-order-invoice=o1]').click();await page.waitForSelector('#orderDetailDialog[open]');
  assert.deepEqual(await page.evaluate(()=>__abertos),['o1'],'nota fiscal abre o pedido uma vez');
  assert.equal(await page.locator('#attachInvoiceBtn').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');
  for(const width of [1500,1366,1280,1100,1024,390]){
   await page.setViewportSize({width,height:1000});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'página de pedidos cabe em '+width);
   await semBarraHorizontal('orders',width);
   if(width>1050)assert.ok(await pedido.evaluate(e=>e.getBoundingClientRect().height<=66),'linha compacta de pedidos em '+width);
   assert.equal(await pedido.locator('td').first().evaluate(el=>getComputedStyle(el).fontSize),'14px','fonte normal em '+width);
   if(width===390){const titulo=await page.locator('.compras-header h1').boundingBox(),busca=await page.locator('.pv-search-box').boundingBox();assert.ok(busca.y>=titulo.y+titulo.height,'busca abaixo do título no celular');}
   await page.locator('[data-pv-panel=orders] .tw-table-scroll').evaluate(el=>el.scrollLeft=0);
   await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'.tmp/compras-pedidos-colunas-'+width+'.png',fullPage:true});
  }
  await page.setViewportSize({width:1500,height:1000});await page.locator('[data-pv-tab=quotations]').click();
  assert.equal(await page.locator('.pv-quotations-table th').count(),8);
  assert.equal(await page.locator('.pv-quotations-table th').first().innerText(),'SOLICITANTE / SETOR');
  assert.match(await page.locator('#quotationsBody').textContent(),/Ana Ferreira.*Tecido de linho.*10 m.*Cola.*2 kg.*Pedido 1801.*3 de 4 fornecedores/s);
  await page.locator('#quotationsBody td').nth(4).locator('.pv-cell-preview').hover();
  await page.locator('#comprasDetalheCelula').waitFor({state:'visible'});
  assert.match(await page.locator('#comprasDetalheCelula').innerText(),/Tecidos Aurora.*Casa dos Materiais.*Loja Parcial/s);
  assert.equal(await page.locator('#proposalsDialog[open]').count(),0,'consultar fornecedores n?o abre a cota??o');
  assert.equal(await page.locator('#comprasDetalheCelula').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
  await page.locator('#comprasDetalheCelula').hover();await page.waitForTimeout(200);assert.ok(await page.locator('#comprasDetalheCelula').isVisible());
  await page.mouse.move(1,1);await page.waitForTimeout(180);
  assert.match(await page.locator('.pv-quote-values').textContent(),/105,00.*110,00.*2 proposta\(s\) completa\(s\).*frete e desconto.*1 proposta\(s\) parcial/s);
  assert.match(await page.locator('.pv-list-action').innerText(),/Cobrar 1 fornecedor/);
  await page.locator('#comprasSearch').fill('Galpão 2');assert.equal(await page.locator('#quotationsBody tr').count(),1);
  await page.locator('#comprasSearch').fill('nenhum item existe');assert.equal(await page.locator('#quotationsBody tr').count(),0);assert.equal(await page.locator('#quotationsEmpty').isVisible(),true);await page.locator('#comprasSearch').fill('');
  for(const width of [1500,1366,1280,1100,1024,390]){
   await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'página de cotações cabe em '+width);
   await semBarraHorizontal('quotations',width);
   if(width>1050)assert.ok(await page.locator('#quotationsBody tr').evaluate(e=>e.getBoundingClientRect().height<=66),'linha compacta de cotacao em '+width);
   assert.equal(await page.locator('#quotationsBody td').first().evaluate(el=>getComputedStyle(el).fontSize),'14px','fonte normal nas cotações em '+width);
   await page.locator('[data-pv-panel=quotations] .tw-table-scroll').evaluate(el=>el.scrollLeft=0);
   await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'.tmp/compras-cotacoes-colunas-'+width+'.png',fullPage:true});
  }
  await page.evaluate(()=>{__dados.quotations[0].items[0].comprado=true;window.dispatchEvent(new Event('compras-recarregar'));});
  await page.waitForFunction(()=>document.querySelector('.pv-quote-values')?.textContent.includes('Comparar itens pendentes'));
  assert.doesNotMatch(await page.locator('.pv-quote-values').textContent(),/105,00|110,00/);
  assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>__notices),[]);
  console.log('OK: tabelas enriquecidas, comparação de propostas equivalentes, origens, recebimentos por unidade, pagamento, NF, pesquisa, filtros e celular.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
