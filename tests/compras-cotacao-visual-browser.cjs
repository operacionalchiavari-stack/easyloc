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

  await page.evaluate(()=>{
   __dados.quotations[0].items.forEach(i=>{i.data_necessidade_mais_cedo='2030-11-24';i.respostas.forEach(r=>{r.fornecedor_nome=__dados.suppliers.find(s=>s.supplier_id===r.supplier_id)?.nome;r.valor_total=(r.valor_unitario||0)*i.quantidade_cotada;r.atende_pcp=true;r.data_prevista_entrega='2030-11-20';r.condicao_pagamento='30/60 dias';r.frete=10;});});
   __dados.quotations[0].suppliers[3].nome='Fornecedor de materiais e acabamentos com nome completo longo';
   window.__saves=[];AcervoComprasAPI.saveQuotationSupplierResponse=async(id,supplier,header,items)=>{__saves.push({id,supplier,header,items});const q=__dados.quotations.find(q=>q.id===id),s=q.suppliers.find(s=>s.supplier_id===supplier);s.status='respondido';s.header=header;items.forEach(r=>{const i=q.items.find(i=>i.id===r.quotation_item_id);i.respostas=i.respostas.filter(x=>x.supplier_id!==supplier);i.respostas.push({...r,supplier_id:supplier,fornecedor_nome:s.nome,valor_total:(r.valor_unitario||0)*i.quantidade_cotada,atende_pcp:true,data_prevista_entrega:r.data_prevista_entrega||header.data_prevista_entrega,condicao_pagamento:header.condicao_pagamento,frete:header.frete});});};
  });
  await page.locator('[data-pv-tab=quotations]').click();await page.locator('[data-quotation-id=q1]').click();await page.waitForSelector('#proposalsDialog[open]');
  assert.equal(await page.locator('#proposalsSupplierTabs button').count(),4);
  assert.match(await page.locator('#proposalsActiveSupplier').innerText(),/Fornecedor de materiais/);
  assert.equal(await page.locator('[data-select-supplier=f4]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-select-supplier=f1]').click();assert.equal(await page.locator('#proposalFrete').inputValue(),'20');assert.equal(await page.locator('#proposalsActiveSupplier').innerText(),'Tecidos Aurora');
  assert.ok(await page.locator('#proposalFrete').evaluate(e=>parseFloat(getComputedStyle(e).paddingLeft)>=38),'valor sem sobrepor o prefixo R$');
  assert.equal(await page.locator('#proposalsSupplierTabs').evaluate(e=>getComputedStyle(e).display),'grid');

  for(const width of [1905,1366,1024,768,390]){
   await page.setViewportSize({width,height:1000});
   const dimensions=await page.locator('#proposalsDialog').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));assert.ok(dimensions.scroll<=dimensions.width+1,'cotacao cabe em '+width+': '+JSON.stringify(dimensions));
   assert.ok(await page.locator('.pv-proposals-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'conteudo sem rolagem horizontal em '+width);
   const side=await page.locator('.pv-quotation-suppliers').boundingBox(),editor=await page.locator('.pv-quotation-editor').boundingBox();if(width>900)assert.ok(side.x+side.width<editor.x,'duas colunas');else assert.ok(editor.y>=side.y+side.height,'colunas empilhadas');
   assert.equal(await page.locator('#proposalCondicao').evaluate(e=>getComputedStyle(e).fontSize),'14px');
   await page.locator('.pv-proposals-scroll').evaluate(e=>e.scrollTop=0);await page.screenshot({path:'.tmp/compras-cotacao-nova-'+width+'.png',fullPage:true});
   await page.locator('[data-mode=compare]').click();assert.ok(await page.locator('#proposalsCompareMode').isVisible());assert.ok(await page.locator('.pv-proposal-row').count()>2);assert.ok(await page.locator('.pv-proposals-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'comparativo sem rolagem horizontal em '+width);
   await page.screenshot({path:'.tmp/compras-comparativo-novo-'+width+'.png',fullPage:true});await page.locator('[data-mode=launch]').click();
  }
  await page.setViewportSize({width:1366,height:1000});await page.locator('#proposalCondicao').fill('30 dias');await page.locator('#proposalFrete').fill('12.5');await page.locator('#proposalValidade').fill('2030-11-30');await page.locator('#proposalEntrega').fill('2030-11-20');
  const first=page.locator('#proposalsItemsList [data-item-id=i1]'),second=page.locator('#proposalsItemsList [data-item-id=i2]');await first.locator('[data-item-valor]').fill('7.5');await second.locator('[data-item-nao-cotado]').check();assert.ok(await second.locator('[data-item-valor]').isDisabled());
  await first.locator('[data-toggle-deadline]').click();await first.locator('[data-item-deadline-input]').fill('2030-11-22');await page.locator('#proposalObservacao').fill('Conferir acabamento antes da entrega.');assert.match(await page.locator('#proposalsFooterTotal').innerText(),/87,50/);
  await page.locator('#proposalsSaveBtn').click();await page.waitForFunction(()=>__saves.length===1);const saved=await page.evaluate(()=>__saves[0]);assert.equal(saved.supplier,'f1');assert.equal(saved.header.frete,12.5);assert.equal(saved.header.observacao,'Conferir acabamento antes da entrega.');assert.equal(saved.items[0].valor_unitario,7.5);assert.equal(saved.items[0].data_prevista_entrega,'2030-11-22');assert.equal(saved.items[1].nao_cotado,true);
  assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>__notices),['Proposta salva.']);await page.locator('#proposalsDialog .pv-back-btn').click();assert.equal(await page.locator('#proposalsDialog[open]').count(),0);
  console.log('OK: nova cotacao em duas colunas, fornecedores, comparativo, valores, frete, prazo individual, nao cotado e salvar simulados; sem barra horizontal em 1905/1366/1024/768/390.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
