const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE='http://localhost:5640/';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),erros=[];
  page.on('pageerror',e=>erros.push(e.message));
  await page.addInitScript(()=>{
   window.__CONTEXT={empresa_id:'empresa',usuario_id:'usuario'};sessionStorage.setItem('empresa_id','empresa');window.aguardarContexto=async()=>__CONTEXT;window.lucide={createIcons(){}};
   window.TecnoAlert={error:console.error,info(){},success(){}};window.__rpc=[];
   const materiais=[{id:'m1',codigo:'INS-0001',nome:'Tecido linho off white',unidade:'M',categoria:'Matéria-prima',status:'ativo',quantidade_disponivel:50,quantidade_estoque:50,valor_unitario:25,localizacao:'A1'},{id:'m2',codigo:'INS-0002',nome:'Espuma D33 5cm',unidade:'UN',categoria:'Matéria-prima',status:'ativo',quantidade_disponivel:8,quantidade_estoque:8,valor_unitario:40,localizacao:'A2'}];
   const criar=(id,n,recebido=0,pacotes=[])=>({id:'t'+id,pedido_id:id,item_nome:'Bar para pintar',origem:{quantidade:1},pedido:{numero:n,cliente:'Cliente '+n,local:'Jardim',entrega:'2026-11-20',status:'aprovado'},etapas:[{id:'e'+id,setor:'pintura',nome:'Pintar bar',estado:'pendente',materiais:[{id:'m'+id,produto_id:'TINTA',nome:'Tinta Azul',unidade:'L',necessario:2,recebido,devolvido:0}],pacotes}]});
   window.__quadro={almox:true,itens:[criar('p1',1801),criar('p2',1802,0,[{id:'kit',estado:'separado',materiais:[{id:'mp2',quantidade:1}]}]),criar('p3',1803,2)]};
   const pedidos=[{id:'pc1',numero:51,status:'aguardando_recebimento',fornecedor:'Tecidos Aurora',prazo:'2026-11-20',valor_total:250,rascunho:{id:'r1',numero:1},itens:[{nome:'Tecido linho off white',unidade:'M',saldo:10}]},{id:'pc2',numero:52,status:'aguardando_recebimento',fornecedor:'Espumas Brasil',prazo:'2026-11-21',valor_total:200,itens:[{nome:'Espuma D33',unidade:'UN',saldo:5}]}];
   const registros=[{id:'r1',pedido_id:'pc1',numero:1,status:'rascunho',etapa:5,created_at:'2026-11-15',numero_nf:'321',origem:'manual',fornecedor_nome:'Tecidos Aurora',pedido_numero:51,itens_count:1,criado_por_nome:'Ana'},{id:'r2',pedido_id:'pc0',concluido_em:'2026-11-14T15:00:00Z',valor_total:200,numero:2,status:'concluido',etapa:5,created_at:'2026-11-14',numero_nf:'123',origem:'xml',fornecedor_nome:'Espumas Brasil',pedido_numero:50,itens_count:2,concluido_por_nome:'Marcos'}];
   window.supabaseClient={storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:'http://localhost:5640/test-avatar.svg'}})})},auth:{getSession:async()=>({data:{session:{user:{id:'usuario'}}}})},from(tabela){const q={select(){return q;},eq(){return q;},in(){return q;},order(){return q;},limit(){return q;},then(resolve){return Promise.resolve({data:tabela==='clientes_empresas'?[{catalogo_logo_url:'http://localhost:5640/test-avatar.svg'}]:tabela==='fornecedores'?[{id:'f1',nome_fantasia:'Tecidos Aurora',foto_url:'http://localhost:5640/test-avatar.svg'},{id:'f2',nome_fantasia:'Espumas Brasil',foto_url:'http://localhost:5640/test-avatar.svg'}]:tabela==='compras_registros'?[{id:'pc0',numero:50,criado_por:'comprador1',dados:{prazo_acordado:'2026-11-15',comprador_nome:'Mariana Compras'}},{id:'pc1',numero:51,criado_por:'comprador1',dados:{comprador_nome:'Mariana Compras'}}]:tabela==='almox_recebimento_itens'?[{recebimento_id:'r2',produto_nome:'Espuma D33',unidade_interna:'UN',quantidade_recebida:5,quantidade_avariada:0}]:[]}).then(resolve);}};return q;},rpc:async(nome,args)=>{
    __rpc.push({nome,args});
    if(nome==='producao_quadro')return {data:structuredClone(__quadro)};
    if(nome==='almox_produtos')return {data:[{id:'TINTA',codigo:'INS001',produto:'Tinta Azul',unidade:'L'}]};
    if(nome==='almox_receb_pedidos')return {data:pedidos};if(nome==='almox_receb_listar')return {data:registros};
    if(nome==='almox_receb_obter'||nome==='almox_receb_salvar')return {data:{...registros.find(r=>r.id===args.p_id),pedido:{id:'pc1',numero:51},itens:[{id:'ri1',produto_id:'m1',produto_nome:'Tecido',controla_estoque:true,quantidade_nf:10,quantidade_recebida:10,quantidade_avariada:0,valor_unitario:25}],editavel:true}};
    if(nome==='almox_receb_concluir'){Object.assign(registros.find(r=>r.id===args.p_id),{status:'concluido',concluido_em:'2026-11-16T14:00:00Z',concluido_por_nome:'Ana'});const idx=pedidos.findIndex(p=>p.rascunho?.id===args.p_id);if(window.__parcial){pedidos[idx].status='parcialmente_recebido';delete pedidos[idx].rascunho;pedidos[idx].itens[0].saldo=2;}else pedidos.splice(idx,1);return {data:{}};}
    return {data:[]};
   }};
   const api={listWarehouseData:async()=>({materiais,movimentacoesRecentes:[{id:'hist1',tipo:'entrada',material_id:'m1',quantidade:10,created_at:'2026-11-16T13:00:00Z'},{id:'hist2',tipo:'entrada',material_id:'m2',quantidade:2,created_at:'2026-11-16T14:00:00Z'}],indicadores:{},filtros:{},contagens:[{id:'count1',material_id:'m1',material:{id:'m1',nome:'Tecido linho off white',codigo:'INS-0001',unidade:'M'},quantidade_sistema:0,quantidade_contada:1,divergencia:1,ajuste_status:'aguardando_justificativa',created_at:'2026-11-16T13:00:00Z'},{id:'count2',material_id:'m2',material:{id:'m2',nome:'Espuma D33 5cm',codigo:'INS-0002',unidade:'UN'},quantidade_sistema:0,quantidade_contada:0,divergencia:0,created_at:'2026-11-16T14:00:00Z'}]}),listWarehouseMaterials:async()=>materiais,listAllWarehouseLocations:async()=>[{id:'l1',codigo:'A1',nome:'Prateleira A1',ativo:true},{id:'l2',codigo:'B2',nome:'Prateleira B2',ativo:true}],setMaterialLocation:async(id,loc)=>{window.__addressSave={id,loc};if(window.__failAddress)throw Error('Falha simulada');const m=materiais.find(m=>m.id===id);m.location_id=loc;m.localizacao=loc==='l2'?'B2':loc==='l1'?'A1':'';},getSystemParameters:async()=>({contagem_justificativas:['Perda identificada','Erro na entrada']}),justifyWarehouseCountItem:async(id,text)=>{window.__justificado={id,text};},getClient:()=>supabaseClient,listWarehouseCountCycle:async()=>[{material_id:'m2',liberado:false}],getWarehouseCountCycleState:async()=>null,getCountApprovalRights:async()=>null,clearCache(){}};
   window.TecnoweldAPI=new Proxy(api,{get(obj,key){return key in obj?obj[key]:async()=>[];}});
  });
  await page.route('**/*',r=>{
   const u=r.request().url();if(!u.startsWith(BASE))return r.abort();
   const pathname=decodeURIComponent(new URL(u).pathname);
   if(pathname==='/test-avatar.svg')return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" fill="#738594"/></svg>'});
   if(/\/js\/core\//.test(pathname)||/\/almox-(?:api|epi|vinculos)\.js$/.test(pathname)||/\/tw-global-alert\.js$/.test(pathname))return r.fulfill({body:'',contentType:'text/javascript'});
   const f=path.join(process.cwd(),pathname);if(!fs.existsSync(f)||!fs.statSync(f).isFile())return r.fulfill({status:404,body:''});
   return r.fulfill({body:fs.readFileSync(f),contentType:{'.css':'text/css','.html':'text/html','.js':'text/javascript','.mjs':'text/javascript'}[path.extname(f)]||'application/octet-stream'});
  });
  const url=BASE+'Modulos/Almoxarifado/almoxarifado.html';
  await page.goto(url);await page.waitForSelector('#almoxContent:not(.hidden)');
  await page.waitForFunction(()=>document.querySelector('#toSeparateBadge')?.textContent==='2');
  assert.match(await page.locator('[data-tab=receiving]').innerText(),/Pedidos a receber\s*2/);assert.equal(await page.locator('[data-tab=receipts]').count(),0);
  assert.match(await page.locator('[data-tab=toseparate]').innerText(),/^A separar/);
  assert.equal(await page.locator('[data-tab=stock]').innerText(),'Insumos');
  assert.equal(await page.locator('[data-tab=supplier-links]').innerText(),'Vínculos de insumos');
  assert.equal(await page.locator('#stockTab .almox-material-toolbar #topMaterialRegistrationBtn').count(),1);
  assert.equal(await page.locator('.almox-tabs [data-tab=locations]').count(),0);
  await page.locator('[data-material-location=m1]').selectOption('l2');
  await page.waitForFunction(()=>document.querySelector('[data-material-location=m1]')?.value==='l2'&&!document.querySelector('[data-material-location=m1]')?.disabled);
  assert.deepEqual(await page.evaluate(()=>__addressSave),{id:'m1',loc:'l2'});
  assert.equal(await page.locator('#stockTab').isVisible(),true);
  await page.locator('[data-material-location=m1]').selectOption('');
  await page.waitForFunction(()=>document.querySelector('[data-material-location=m1]')?.value===''&&!document.querySelector('[data-material-location=m1]')?.disabled);
  assert.equal(await page.evaluate(()=>__addressSave.loc),null);
  await page.evaluate(()=>window.__failAddress=true);
  await page.locator('[data-material-location=m1]').selectOption('l1');
  await page.waitForFunction(()=>document.querySelector('[data-material-location=m1]')?.value===''&&!document.querySelector('[data-material-location=m1]')?.disabled);
  await page.evaluate(()=>window.__failAddress=false);
  await page.locator('#manageAddressesBtn').click();
  assert.equal(await page.locator('#locationsTab').isVisible(),true);
  assert.equal(await page.locator('#locationsTab table').count(),1);
  assert.equal(await page.locator('#locationsTab th').count(),3);
  assert.equal(await page.locator('#locationsTab th').nth(1).innerText(),'Setor');
  assert.ok((await page.locator('.address-manager-card').boundingBox()).width<=640);
  await page.screenshot({path:'.tmp/almox-enderecos-modal.png'});
  await page.locator('[data-location-add]').click();await page.waitForSelector('#locationCreateModal:not(.hidden)');
  assert.equal(await page.locator('#locationCreateForm label').count(),3);
  assert.equal(await page.locator('#locationCreateSector').count(),1);
  await page.keyboard.press('Escape');
  await page.locator('#manageAddressesBtn').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#almoxAddressManagement').isVisible(),false);

  assert.ok((await page.locator('.almox-tabs>button[data-tab]').evaluateAll(els=>els.map(el=>getComputedStyle(el).fontSize))).every(v=>v==='14px'));
  assert.equal(await page.locator('#entryBtn i,#entryBtn svg,#entryBtn .almox-act-ico,#exitBtn i,#exitBtn svg,#exitBtn .almox-act-ico,#withdrawalBtn i,#withdrawalBtn svg,#withdrawalBtn .almox-act-ico').count(),0,'ações sem ícones');
  for(const width of [1920,1600,1366,1024,390]){
   await page.setViewportSize({width,height:1000});
   const medidas=await page.locator('main.almoxarifado-page').boundingBox();assert.ok(Math.abs(medidas.x+medidas.width/2-width/2)<1,'conteúdo centralizado em '+width);
   assert.equal(await page.locator('#materialsBody td').first().evaluate(el=>getComputedStyle(el).fontSize),'14px');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'estoque sem transbordar em '+width);
   assert.equal(await page.locator('[data-tab=stock]').evaluate(el=>getComputedStyle(el).fontSize),'14px');
   const gerenciar=await page.locator('#manageAddressesBtn').boundingBox(),cadastro=await page.locator('#topMaterialRegistrationBtn').boundingBox();assert.ok(Math.abs(gerenciar.y-cadastro.y)<1,'enderecos na linha do cadastro '+width);
   if(width>=1024){const aba=await page.locator('[data-tab=stock]').boundingBox(),acao=await page.locator('#entryBtn').boundingBox();assert.ok(Math.abs(acao.y+acao.height/2-aba.y-aba.height/2)<5,'acoes na linha das abas em '+width+' '+JSON.stringify({aba,acao}));}
   assert.notEqual(await page.locator('main').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)');
   if(width===390){const busca=await page.locator('#globalSearch').boundingBox(),primeira=await page.locator('#materialsBody tr').first().boundingBox();assert.ok(primeira.y>=busca.y+busca.height,'busca inteira acima dos materiais');}
   await page.screenshot({path:'.tmp/almox-layout-estoque-'+width+'.png',fullPage:true});
  }
  await page.setViewportSize({width:1600,height:1000});await page.locator('[data-tab=count]').click();
  assert.equal(await page.locator('#countTab th #countScanInput').count(),1);
  assert.equal(await page.locator('[data-count-justification]').evaluate(el=>el.tagName),'SELECT');
  for(const width of [1920,1600,1366]){
   await page.setViewportSize({width,height:1000});
   const head=await page.locator('.count-adjustments-panel .count-div-head').first().locator(':scope > span').nth(1).boundingBox();
   const cell=await page.locator('[data-count-item=count1] > .count-div-num').first().boundingBox();
   assert.ok(Math.abs(head.x-cell.x)<1,'cabecalho alinhado em '+width);
   assert.equal(await page.locator('.count-card.is-ok .count-div-head>span').evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),true,'titulos separados no card de conferidos '+width);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:'.tmp/almox-divergencias-'+width+'.png',fullPage:true});
  }
  await page.locator('[data-count-justify=count1]').click();
  assert.equal(await page.evaluate(()=>window.__justificado),undefined);
  await page.locator('[data-count-justification]').selectOption('Erro na entrada');
  await page.locator('[data-count-justify=count1]').click();
  await page.waitForFunction(()=>window.__justificado?.text==='Erro na entrada');
  assert.deepEqual(await page.evaluate(()=>window.__justificado),{id:'count1',text:'Erro na entrada'});

  assert.equal(await page.locator('#countTab .count-todo-head').count(),0);
  await page.locator('#countScanInput').fill('INS-0001');await page.locator('#countScanInput').press('Enter');
  await page.waitForFunction(()=>document.querySelector('#countBlindList [data-material-id=m1] .count-qty-input')?.value==='1');
  await page.locator('#countUndoScanBtn').click();
  assert.equal(await page.locator('#countBlindList [data-material-id=m1] .count-qty-input').inputValue(),'');
  assert.equal(await page.locator('#countTab .count-todo-foot #saveCountBtn').count(),1);
  assert.equal(await page.locator('#countTab .count-todo-foot [data-count-conclude]').count(),1);
  await page.screenshot({path:'.tmp/almox-contagem-bipe-cabecalho.png',fullPage:true});
  await page.locator('[data-tab=movements]').click();
  assert.equal(await page.locator('#historyExportBtn,#historyTypeFilter,#historyFrom,#historyTo').count(),0);
  assert.equal(await page.locator('th.history-material-heading #unifiedHistorySearch').count(),1);
  for(const width of [1366,390]){
   await page.setViewportSize({width,height:1000});
   await page.locator('#unifiedHistorySearch').fill('Tecido');
   await page.waitForFunction(()=>document.querySelectorAll('#unifiedHistoryBody .history-row').length===2);
   assert.match(await page.locator('#unifiedHistoryBody .history-row').first().textContent(),/Tecido/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:'.tmp/almox-historico-busca-'+width+'.png',fullPage:true});
   await page.locator('#unifiedHistorySearch').fill('inexistente');
   await page.waitForFunction(()=>document.querySelectorAll('#unifiedHistoryBody .history-row').length===0);
   await page.locator('#unifiedHistorySearch').fill('');
   await page.waitForFunction(()=>document.querySelectorAll('#unifiedHistoryBody .history-row').length===4);
  }
  await page.setViewportSize({width:1600,height:1000});await page.locator('[data-tab=toseparate]').click();await page.waitForSelector('[data-mp-pedido=p1]');
  assert.equal(await page.locator('#toseparateTab .separacao-lane').count(),3);
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-mp-card-avatar] img')].length===3&&[...document.querySelectorAll('[data-mp-card-avatar] img')].every(img=>img.complete&&img.naturalWidth>0));
  assert.equal(await page.locator('[data-mp-pedido=p1] .separacao-order-number').innerText(),'Pedido 1801');
  assert.equal(await page.locator('[data-mp-pedido=p1]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 249, 234)');
  assert.equal(await page.locator('[data-mp-card-avatar]').first().evaluate(el=>getComputedStyle(el).borderRadius),'50%');
  assert.equal(await page.locator('#toseparateTab .mp-topo h2,#toseparateTab [data-mp-atualizar]').count(),0,'sem título e atualizar na fila');
  for(const [id,coluna] of [['p1','aguardando'],['p2','andamento'],['p3','separado']])assert.equal(await page.locator('[data-mp-pedido='+id+']').getAttribute('data-coluna'),coluna);
  assert.equal(await page.locator('#toseparateTab .mp-board').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),3);
  await page.screenshot({path:'.tmp/almox-layout-separacao.png',fullPage:true});
  assert.equal(await page.locator('#toseparateTab [data-mp-busca],#toseparateTab .mp-topo').count(),0,'fila sem caixa de busca');
  assert.deepEqual(await page.locator('.almox-tabs > button[data-tab]').evaluateAll(els=>els.map(el=>el.dataset.tab)),['stock','toseparate','receiving','purchases','movements','count','supplier-links','epi']);
  await page.locator('[data-mp-pedido=p1]').click();await page.locator('.mp-escolha-modo [data-mp-modo=manual]').click();await page.waitForSelector('[data-mp-voltar]');
  await page.locator('[data-mp-delta="1"]').click();assert.equal(await page.locator('[data-mp-qtd=mp1]').inputValue(),'1');
  await page.locator('[data-mp-voltar]').click();assert.equal(await page.locator('[data-mp-pedido=p1]').getAttribute('data-coluna'),'andamento');
  await page.locator('[data-tab=stock]').click();await page.locator('#topMaterialRegistrationBtn').click();
  await page.waitForSelector('#materialWorkspaceTab:not(.hidden)');
  assert.equal(await page.locator('.almox-topbar').isVisible(),true,'abas continuam disponíveis no cadastro');
  await page.locator('[data-tab=receiving]').click();await page.waitForSelector('#tbodyRecebPedidos tr');
  assert.equal(await page.locator('[data-receb-nova-xml]').count(),0);
  assert.equal(await page.locator('#recebPedidosSection').isVisible(),true);assert.equal(await page.locator('#recebRegistrosSection').isVisible(),false);
  await page.screenshot({path:'.tmp/almox-layout-pedidos-receber.png',fullPage:true});
  await page.waitForSelector('#tbodyRecebPedidos .receb-comprador img');
  assert.match(await page.locator('#tbodyRecebPedidos .receb-comprador').innerText(),/Mariana Compras/);
  assert.equal(await page.locator('#recebPedidosSection th').count(),8);
  assert.equal(await page.locator('#recebPedidosSection th').nth(2).innerText(),'Comprador');
  assert.equal(await page.locator('#tbodyRecebPedidos tr').first().locator('td').nth(2).locator('.receb-comprador').count(),1);
  assert.equal(await page.locator('#recebRegistrosSection th').count(),9);
  assert.equal(await page.locator('#tbodyRecebPedidos button,#tbodyRecebLista button').count(),0);
  await page.locator('[data-receb-pedido=pc2]').focus();await page.keyboard.press('Enter');
  await page.waitForSelector('.receb-escolha[open]');
  assert.equal(await page.locator('.receb-escolha [data-receb-xml=pc2]').count(),1);
  await page.screenshot({path:'.tmp/almox-receber-escolha.png'});
  await page.locator('.receb-escolha [data-receb-manual=pc2]').click();
  await page.waitForSelector('#recebManualDialog[open]');
  assert.equal(await page.locator('.receb-escolha').count(),0);
  await page.locator('#recebManualDialog button[type=button]').click();
  await page.locator('[data-receb-pedido=pc2]').click();
  const arquivo=page.waitForEvent('filechooser');await page.locator('.receb-escolha [data-receb-xml=pc2]').click();await arquivo;
  assert.equal(await page.locator('#recebXmlInput').getAttribute('data-pedido'),'pc2');
  await page.locator('[data-receb-pedido=pc1]').click();
  assert.equal(await page.locator('.receb-escolha [data-receb-abrir=r1]').count(),1);
  assert.equal(await page.locator('.receb-escolha [data-receb-xml]').count(),0);
  await page.keyboard.press('Escape');

  await page.locator('[data-receb-lista=recebimentos]').click();
  assert.equal(await page.locator('#recebPedidosSection').isVisible(),false);assert.equal(await page.locator('#recebRegistrosSection').isVisible(),true);
  assert.equal(await page.locator('#tbodyRecebLista tr').count(),1);
  assert.match(await page.locator('#tbodyRecebLista').innerText(),/14\/11\/2026/);
  assert.equal(await page.locator('#tbodyRecebLista td').first().evaluate(el=>getComputedStyle(el).fontSize),'14px');
  await page.waitForSelector('#tbodyRecebLista .cs-foto img');
  await page.waitForSelector('#tbodyRecebLista .receb-comprador img');
  await page.locator('[data-receb-abrir=r2]').click();await page.waitForSelector('#recebFluxoView:not([hidden])');
  await page.locator('[data-receb-voltar]').first().click();assert.equal(await page.locator('#recebRegistrosSection').isVisible(),true);
  for(const width of [1920,1366,1100,1024,390]){
   await page.setViewportSize({width,height:1000});
   for(const modo of ['pedidos','recebimentos']){
    await page.locator('[data-receb-lista='+modo+']').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'sem overflow '+modo+' '+width);
    assert.equal(await page.locator('#tab-recebimento .almox-table-wrap:visible').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'tabela sem barra '+modo+' '+width);
    await page.screenshot({path:'.tmp/almox-unificado-'+modo+'-'+width+'.png',fullPage:true});
   }
  }
  await page.setViewportSize({width:1600,height:1000});
  await page.locator('[data-receb-lista=pedidos]').click();await page.locator('[data-receb-pedido=pc1]').click();await page.locator('.receb-escolha [data-receb-abrir=r1]').click();
  page.once('dialog',d=>d.accept());await page.locator('[data-receb-concluir]').click();
  await page.waitForSelector('#recebListaView:not([hidden])');
  assert.equal(await page.locator('[data-receb-lista=recebimentos]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#tbodyRecebLista tr').count(),2);
  assert.equal(await page.locator('#tbodyRecebPedidos tr').count(),1);
  assert.match(await page.locator('#tbodyRecebLista').innerText(),/16\/11\/2026/);
  await page.goto(url+'?aba=recebimentos');await page.waitForSelector('[data-tab=receiving].active');
  assert.equal(await page.locator('#recebRegistrosSection').isVisible(),true);
  await page.locator('[data-receb-lista=pedidos]').click();
  await page.evaluate(()=>window.__parcial=true);
  await page.locator('[data-receb-pedido=pc1]').click();await page.locator('.receb-escolha [data-receb-abrir=r1]').click();
  page.once('dialog',d=>d.accept());await page.locator('[data-receb-concluir]').click();
  await page.waitForSelector('#recebListaView:not([hidden])');
  assert.equal(await page.locator('#tbodyRecebLista tr').count(),2);
  assert.equal(await page.locator('#tbodyRecebPedidos tr').count(),2,'saldo parcial continua pendente');
  assert.match(await page.locator('#tbodyRecebPedidos').textContent(),/Recebido em parte/);
  assert.equal(await page.locator('#tbodyRecebPedidos [data-receb-abrir=r1]').count(),0,'concluido nao continua como rascunho');
  assert.deepEqual(erros,[]);console.log('OK: alinhamento central, fonte padrão, três colunas de separação sem busca e com conferência, recebimento unificado, fotos, historico, conclusao e tabelas sem rolagem horizontal.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
