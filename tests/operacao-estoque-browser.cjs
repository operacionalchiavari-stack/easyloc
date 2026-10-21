const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const raiz=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({channel:'msedge'});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const erros=[];page.on('pageerror',e=>erros.push(e.message));
  await page.setContent('<main id="main-content"></main>');
  await page.evaluate(()=>{
    window.__CONTEXT={empresa_id:'e1'};window.aguardarContexto=async()=>window.__CONTEXT;
    window.__banco={itens:[{id:'i1',empresa_id:'e1',produto:'Cadeira real',codigo:'CAD1',estoque_total:10,estoque_manutencao:1},{id:'i2',empresa_id:'e1',produto:'Mesa real',codigo:'MES1',estoque_total:8}],itens_patrimonios:[],qualidade_inspecoes:[],separacoes_itens:[{item_id:'i1',quantidade_solicitada:2,separacoes_pedidos:{status_comercial:'aprovado',data_evento:new Date().toISOString().slice(0,10)}}]};
    window.supabaseClient={from:t=>{
      let rows=window.__banco[t]||[],inserir=null,selected='*',range=null,ids=null;
      const q={select(value){selected=value;return q;},eq(){return q;},order(){return q;},limit(){return q;},
        in(column,values){ids={column,values};return q;},range(start,end){range=[start,end];return q;},
        insert(p){inserir=p;return q;},then(ok){
        if(inserir){if(window.__falhaQualidade)return Promise.resolve({data:null,error:{message:'Rede indisponível'}}).then(ok);window.__banco[t].push(inserir);}
        let result=ids?rows.filter(row=>ids.values.includes(row[ids.column])):rows;
        if(range) result=result.slice(range[0],range[1]+1);
        if(t==='itens'&&selected==='*') (window.__itemRequests ||= []).push({range,count:result.length});
        return Promise.resolve({data:result,error:null}).then(ok);
      }};return q;
    },rpc:async(name,args)=>({data:window.__bloqueios?.[args.p_data] || [{item_id:'i1',quantidade:3}],error:null})};
  });
  await page.locator('#main-content').evaluate((el,html)=>el.innerHTML=html,fs.readFileSync(path.join(raiz,'Modulos/Estoque/Controledequalidade/controledequalidade.html'),'utf8'));
  await page.addScriptTag({path:path.join(raiz,'Modulos/Estoque/Controledequalidade/controledequalidade.js')});
  await page.evaluate(()=>window.__moduleInit());
  await page.waitForFunction(()=>document.getElementById('itemNome').textContent==='Cadeira real');
  await page.fill('#responsavel','Ana');await page.click('[data-status="Aprovado"]');
  await page.evaluate(()=>{window.__falhaQualidade=true;});
  await page.click('#btnSalvarProximo');
  await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('Falha ao salvar'));
  assert.equal(await page.locator('#itemNome').textContent(),'Cadeira real');
  assert.equal(await page.locator('#responsavel').inputValue(),'Ana');
  await page.evaluate(()=>{window.__falhaQualidade=false;});
  await page.click('#btnSalvarProximo');
  await page.waitForFunction(()=>window.__banco.qualidade_inspecoes.length===1);
  await page.evaluate(()=>window.carregarDados());
  assert.match(await page.locator('#tabelaInspecoes').textContent(),/Ana/);
  console.log('ok - qualidade usa cadastro real, mantém formulário ao falhar e recupera inspeção gravada');
  await page.locator('#main-content').evaluate((el,html)=>el.innerHTML=html,fs.readFileSync(path.join(raiz,'Modulos/Estoque/DisponibilidadeItens/disponibilidade-itens.html'),'utf8'));
  await page.addScriptTag({path:path.join(raiz,'Modulos/Estoque/DisponibilidadeItens/disponibilidade-itens.js')});
  await page.evaluate(()=>window.__moduleInit());
  await page.waitForFunction(()=>document.querySelector('#disponTabela')?.textContent.includes('Cadeira real'));
  const saldo=await page.evaluate(()=>window.EasyLocDisponibilidade.calcular('i1',document.getElementById('disponData').value));
  assert.equal(saldo.disponivel,4);assert.equal(saldo.reservado,2);
  assert.deepEqual(erros,[]);
  console.log('ok - disponibilidade desconta reserva, manutenção e peças fisicamente pendentes');
  await page.addStyleTag({path:path.join(raiz,'Modulos/Estoque/DisponibilidadeItens/disponibilidade-itens.css')});
  await page.addStyleTag({path:path.join(raiz,'styles/tokens.css')});
  await page.addStyleTag({path:path.join(raiz,'styles/design-system.css')});
  await page.evaluate(async()=>{
    window.__banco.itens.push(...Array.from({length:65},(_,i)=>({id:`extra${i}`,produto:`Extra ${i}`,estoque_total:5})));
    await window.EasyLocDisponibilidade.recarregar();
  });
  assert.equal(await page.locator('#disponTabela .dispon-row').count(),20);
  await page.waitForTimeout(800);
  assert.equal(await page.locator('#disponTabela .dispon-row').count(),20);
  const firstRequests=await page.evaluate(()=>window.__itemRequests.length);
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  await page.waitForFunction(()=>document.querySelectorAll('#disponTabela .dispon-row').length===40);
  await page.waitForTimeout(800);
  assert.equal(await page.locator('#disponTabela .dispon-row').count(),40);
  assert.equal(await page.evaluate(()=>window.__itemRequests.length),firstRequests+1);
  assert.match(await page.locator('#disponTabela').textContent(),/Cadeira real/);
  while(await page.locator('#disponTabela .dispon-row').count()<67){
    const before=await page.locator('#disponTabela .dispon-row').count();
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    await page.waitForFunction(n=>document.querySelectorAll('#disponTabela .dispon-row').length>n,before);
  }
  assert.equal(await page.locator('#disponMais').isVisible(),false);
  await page.evaluate(async()=>{
    window.scrollTo(0,0);
    const main=document.querySelector('#main-content');
    main.style.height='500px';main.style.overflowY='auto';
    await window.EasyLocDisponibilidade.recarregar();
  });
  await page.evaluate(()=>{const main=document.querySelector('#main-content');main.scrollTop=main.scrollHeight;});
  await page.waitForFunction(()=>document.querySelectorAll('#disponTabela .dispon-row').length===40);
  await page.waitForTimeout(800);
  assert.equal(await page.locator('#disponTabela .dispon-row').count(),40);
  const requests=await page.evaluate(()=>window.__itemRequests);
  assert.ok(requests.every(request=>request.range&&request.range[1]-request.range[0]===19&&request.count<=20));
  assert.ok(requests.some(request=>request.range[0]===20));
  await page.locator('#main-content').evaluate(el=>{el.scrollTop=200;});
  const listBefore=await page.evaluate(()=>({scroll:document.querySelector('#main-content').scrollTop,
    rows:document.querySelectorAll('#disponTabela .dispon-row').length,busca:document.querySelector('#disponBusca').value,
    inicio:document.querySelector('#disponData').value}));
  await page.locator('#disponTabela .dispon-item-link').first().evaluate(el=>el.click());
  assert.equal(await page.locator('#disponDetalheTela').isVisible(),true);
  assert.equal(await page.locator('#disponLista').isVisible(),false);
  await page.click('#btnVoltarDispon');
  const listAfter=await page.evaluate(()=>({scroll:document.querySelector('#main-content').scrollTop,
    rows:document.querySelectorAll('#disponTabela .dispon-row').length,busca:document.querySelector('#disponBusca').value,
    inicio:document.querySelector('#disponData').value}));
  assert.deepEqual(listAfter,listBefore,'voltar preserva filtros, itens carregados e rolagem');
  await page.fill('#disponBusca','Extra 64');
  await page.waitForFunction(()=>document.querySelectorAll('#disponTabela .dispon-row').length===1&&document.querySelector('#disponTabela').textContent.includes('Extra 64'));
  await page.fill('#disponBusca','Cadeira real');
  await page.waitForFunction(()=>document.querySelectorAll('#disponTabela .dispon-row').length===1);
  assert.deepEqual(erros,[]);
  console.log('ok - rolagem acrescenta itens, termina no ultimo e reinicia ao filtrar');
  await page.evaluate(async()=>{
    document.querySelector('#disponBusca').value='';
    document.querySelector('#disponData').value='2026-11-01';
    window.__banco.itens=[
      {id:'base',produto:'Base compartilhada',estoque_total:2},
      {id:'topo',produto:'Parte de cima',estoque_total:6},
      {id:'tampo',produto:'Tampo alternativo',estoque_total:6},
      {id:'estante',produto:'Estante completa',tipo:'Kit',estoque_total:99},
      {id:'outro',produto:'Outro kit',tipo:'Kit',estoque_total:99},
      {id:'duplo',produto:'Kit com duas bases',tipo:'Kit'},
      {id:'avulso',produto:'Avulso',estoque_total:10},
      {id:'zero',produto:'Saldo zero',estoque_total:0,quantidade:20},
      {id:'sem-composicao',produto:'Kit incompleto',tipo:'Kit'},
      {id:'ciclo',produto:'Kit circular',tipo:'Kit'}
    ];
    window.__banco.kit_itens=[
      {kit_id:'estante',item_id:'base',quantidade:1},
      {kit_id:'estante',item_id:'topo',quantidade:1},
      {kit_id:'outro',item_id:'base',quantidade:1},
      {kit_id:'outro',item_id:'tampo',quantidade:1},
      {kit_id:'duplo',item_id:'estante',quantidade:1},
      {kit_id:'duplo',item_id:'base',quantidade:1},
      {kit_id:'ciclo',item_id:'ciclo',quantidade:1}
    ];
    const reserva=(id,item,q,inicio,fim,status='aprovado',extra={})=>({id,item_id:item,quantidade_solicitada:q,separacoes_pedidos:{numero_pedido:id,status_comercial:status,data_entrega:inicio,data_coleta:fim,...extra}});
    window.__banco.separacoes_itens=[
      reserva('kit-reservado','outro',2,'2026-11-01','2026-11-03'),
      reserva('base-reservada','base',1,'2026-11-04','2026-11-06'),
      reserva('avulso-a','avulso',4,'2026-11-01','2026-11-03'),
      reserva('avulso-b','avulso',5,'2026-11-04','2026-11-06'),
      reserva('cancelado','base',100,'2026-11-01','2026-11-06','cancelado'),
      reserva('orcamento','base',100,'2026-11-01','2026-11-06','orcamento'),
      reserva('encerrado','base',100,'2026-11-01','2026-11-06','aprovado',{encerrado_operacional_em:'2026-10-30'})
    ];
    window.__bloqueios={'2026-11-01':[], '2026-11-04':[], '2026-11-06':[]};
    await window.EasyLocDisponibilidade.recarregar();
  });
  const calcular=(id,inicio='2026-11-01',fim='2026-11-06')=>page.evaluate(({id,inicio,fim})=>window.EasyLocDisponibilidade.calcular(id,inicio,fim),{id,inicio,fim});
  let estante=await calcular('estante');
  assert.equal(estante.total,2,'estoque do kit vem das pecas, nao do saldo proprio');
  assert.equal(estante.disponivel,0,'outro kit ocupou todas as bases');
  assert.equal(estante.limitante.item.id,'base');
  assert.equal((await calcular('topo')).disponivel,6);
  assert.equal((await calcular('base')).disponivel,0);
  assert.equal((await calcular('estante','2026-11-04','2026-11-06')).disponivel,1);
  assert.equal((await calcular('duplo')).total,1,'soma componente repetido no kit aninhado');
  assert.equal((await calcular('avulso')).disponivel,5,'reservas nao simultaneas nao se somam');
  assert.equal((await calcular('zero')).total,0,'zero explicito nao usa outro saldo como fallback');
  assert.match((await calcular('sem-composicao')).erro,/sem componentes/);
  assert.match((await calcular('ciclo')).erro,/circular/);
  await page.locator('[data-item-id="estante"] .dispon-item-link').click();
  await page.waitForFunction(()=>document.querySelectorAll('#disponDias tr').length===1);
  await page.fill('#disponDetalheFim','2026-11-06');
  await page.locator('#disponDetalheFim').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelectorAll('#disponDias tr').length===6);
  const modalBounds=await page.locator('.dispon-detail-shell').boundingBox();
  assert.ok(modalBounds.width>1300,'detalhe usa a largura da pagina');
  assert.equal(await page.locator('#disponLista').isVisible(),false);
  assert.equal(await page.locator('[role="dialog"]').count(),0);
  assert.equal(await page.locator('#disponDetalheTela').evaluate(el=>getComputedStyle(el).position),'static');
  await page.screenshot({path:path.join(require('node:os').tmpdir(),'dispon-detalhe-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  const mobileBounds=await page.locator('.dispon-detail-shell').boundingBox();
  assert.ok(mobileBounds.x>=0&&mobileBounds.x+mobileBounds.width<=390);
  await page.screenshot({path:path.join(require('node:os').tmpdir(),'dispon-detalhe-mobile.png')});
  await page.setViewportSize({width:1440,height:900});
  assert.deepEqual(await page.locator('#disponDias tr td:last-child').allTextContents(),['0','0','0','1','1','1']);
  assert.match(await page.locator('#disponComponentes').textContent(),/Base compartilhada/);
  assert.match(await page.locator('#disponReservasTbody').textContent(),/Outro kit/);
  await page.click('[data-dispon-dia="2026-11-04"]');
  assert.match(await page.locator('#disponReservasTbody').textContent(),/base-reservada/);
  assert.doesNotMatch(await page.locator('#disponReservasTbody').textContent(),/kit-reservado/);
  assert.equal(await page.locator('#disponComponentes .is-available strong').textContent(),'1');
  await page.click('#disponVerPeriodo');
  assert.match(await page.locator('#disponReservasTbody').textContent(),/kit-reservado/);
  await page.fill('#disponDetalheInicio','2026-11-04');
  await page.locator('#disponDetalheInicio').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelectorAll('#disponDias tr').length===3);
  assert.deepEqual(await page.locator('#disponDias tr td:last-child').allTextContents(),['1','1','1']);
  await page.fill('#disponDetalheFim','2026-12-10');
  await page.locator('#disponDetalheFim').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelectorAll('#disponDias tr').length===31);
  await page.locator('#disponDiasScroll').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await page.waitForFunction(()=>document.querySelectorAll('#disponDias tr').length===37);
  assert.equal(await page.locator('#disponDias tr:last-child td:first-child').textContent(),'10/12/2026');
  await page.click('#btnVoltarDispon');
  await page.evaluate(async()=>{
    window.__banco.separacoes_itens.find(r=>r.id==='avulso-b').separacoes_pedidos.data_entrega='2026-11-03';
    window.__bloqueios['2026-11-03']=[{item_id:'avulso',quantidade:2}];
    await window.EasyLocDisponibilidade.recarregar();
  });
  assert.equal((await calcular('avulso')).disponivel,0,'fronteiras inclusivas e bloqueio fisico no pico');
  await page.locator('[data-item-id="avulso"] .dispon-item-link').click();
  await page.waitForFunction(()=>document.querySelectorAll('#disponDias tr').length===1);
  await page.fill('#disponDetalheFim','2026-11-06');
  await page.locator('#disponDetalheFim').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelectorAll('#disponDias tr').length===6);
  assert.deepEqual(await page.locator('#disponDias tr td:last-child').allTextContents(),['6','6','0','5','5','5']);
  await page.click('#btnVoltarDispon');
  await page.evaluate(async()=>{
    const kit=window.__banco.itens.find(item=>item.id==='estante');
    window.__banco.itens=[kit,...Array.from({length:25},(_,i)=>({id:`filler-${i}`,produto:`Outro item ${i}`,estoque_total:5})),...window.__banco.itens.filter(item=>item.id!=='estante')];
    await window.EasyLocDisponibilidade.recarregar();
  });
  assert.equal(await page.locator('#disponTabela .dispon-row').count(),20);
  assert.equal(await page.locator('#disponTabela tr[data-item-id="base"]').count(),0);
  assert.equal((await calcular('estante')).disponivel,0,'consulta componentes e reservas de outros kits fora da pagina visivel');
  assert.equal(await page.locator('#disponDataFim').count(),0);
  assert.equal(await page.locator('#disponErro').isVisible(),false);
  await page.locator('#disponTabela .dispon-item-link').first().click();
  await page.fill('#disponDetalheFim','2026-10-01');
  await page.locator('#disponDetalheFim').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelector('#disponDiasResumo').textContent.includes('v\u00e1lido'));
  assert.equal(await page.locator('#disponDias tr').count(),0);
  await page.click('#btnVoltarDispon');
  assert.equal(await page.locator('#disponTabela .dispon-row').count(),20);
  assert.equal(await page.locator('#disponData').inputValue(),'2026-11-01');
  await page.fill('#disponData','2026-11-04');
  await page.waitForFunction(()=>document.querySelector('#disponTabela tr[data-item-id="estante"] .dispon-quantity-available')?.textContent==='1');
  const antesSimulacao=await page.evaluate(()=>({banco:JSON.stringify(window.__banco),consultas:window.__itemRequests.length,data:document.querySelector('#disponData').value}));
  await page.click('#btnSimularSemana');
  await page.waitForFunction(()=>document.querySelectorAll('#disponTabela .dispon-row').length===8);
  assert.equal(await page.locator('#disponSimulacaoAviso').isVisible(),true);
  const saldoSim=id=>page.locator(`#disponTabela tr[data-item-id="sim-${id}"] .dispon-quantity-available`).textContent();
  assert.equal(await saldoSim('01-estante'),'0');
  assert.equal(await saldoSim('04-base'),'0');
  assert.equal(await saldoSim('05-topo'),'4');
  assert.equal(await page.locator('#disponTabela tr[data-item-id="sim-08-mesa"] .dispon-quantity-maintenance').textContent(),'1');
  await page.locator('#disponTabela tr[data-item-id="sim-01-estante"] .dispon-item-link').click();
  await page.waitForFunction(()=>document.querySelectorAll('#disponDias tr').length===7);
  assert.deepEqual(await page.locator('#disponDias tr td:last-child').allTextContents(),['2','1','3','3','0','0','3']);
  assert.match(await page.locator('#disponReservasTbody').textContent(),/Buffet com duas bases/);
  assert.match(await page.locator('#disponReservasTbody').textContent(),/Base compartilhada/);
  assert.doesNotMatch(await page.locator('#disponReservasTbody').textContent(),/SIM-109|SIM-110/);
  const sexta=await page.locator('#disponDias [data-dispon-dia]').nth(4).getAttribute('data-dispon-dia');
  await page.locator(`#disponDias [data-dispon-dia="${sexta}"]`).click();
  assert.match(await page.locator('#disponReservasTbody').textContent(),/SIM-105/);
  assert.match(await page.locator('#disponReservasTbody').textContent(),/SIM-106/);
  assert.match(await page.locator('#disponReservasTbody').textContent(),/SIM-107/);
  await page.click('#btnVoltarDispon');
  await page.locator('#disponSimulacaoDias button').first().click();
  await page.waitForFunction(()=>document.querySelector('#disponTabela tr[data-item-id="sim-01-estante"] .dispon-quantity-available')?.textContent==='2');
  assert.equal(await saldoSim('04-base'),'3');
  assert.equal(await page.evaluate(()=>window.__itemRequests.length),antesSimulacao.consultas,'simulacao nao consulta itens reais');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__banco)),antesSimulacao.banco,'simulacao nao altera dados reais');
  await page.locator('#disponTabela tr[data-item-id="sim-02-buffet"] .dispon-item-link').click();
  await page.click('#btnSairSimulacao');
  await page.waitForFunction(()=>document.querySelector('#disponTabela tr[data-item-id="estante"] .dispon-quantity-available')?.textContent==='1');
  assert.equal(await page.locator('#disponData').inputValue(),antesSimulacao.data);
  assert.equal(await page.locator('#disponSimulacaoAviso').isVisible(),false);
  assert.equal(await page.locator('#disponDetalheTela').isVisible(),false);
  console.log('ok - semana simulada usa o mesmo calculo, compartilha bases, exclui orcamentos e cancelados, isola dados reais e permite sair pelo detalhe');
  assert.deepEqual(erros,[]);
  await page.evaluate(()=>window.__activeModuleDestroy());
  console.log('ok - periodo, pico simultaneo, componentes compartilhados, kits aninhados, bloqueios, erros de cadastro e detalhe de reservas');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
