const {chromium}=require('playwright'),express=require('express'),assert=require('node:assert/strict');
(async()=>{
 const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
  await page.route('https://easyloc-zeta.vercel.app/api/gs',r=>{const {fn}=JSON.parse(r.request().postData());return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,resultado:fn==='getDashboardAlmoxarifadoJSON'?JSON.stringify({ok:true,produtos:[],movimentacoes:[],emprestimos:[],contagens:[],metas:[]}):[]})});});
  await page.route(/cdn\.jsdelivr|fonts\.g|unpkg|cdnjs/,r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await page.addInitScript(()=>{
   sessionStorage.setItem('empresa_id','emp');window.__rpc=[];window.confirm=()=>true;window.confirmarGlobal=async()=>true;window.EasyLocQR={render:async(el,code)=>el.textContent='QR '+code};
   const criar=(id,numero,necessario,recebido=0,pacotes=[])=>({id:'t'+id,pedido_id:id,item_nome:'Bar para pintar',origem:{quantidade:1},pedido:{numero,cliente:'Cliente '+numero,local:'Jardim',entrega:'2026-11-20',status:'aprovado'},etapas:[{id:'e'+id,setor:'pintura',nome:'Pintar bar',estado:'pendente',materiais:[{id:'m'+id,produto_id:'TINTA',nome:'Tinta Azul',unidade:'L',necessario,recebido,devolvido:0}],pacotes}]});
   window.fixture={almox:true,itens:[criar('p1',10,2),criar('p2',11,3,0,[{id:'antigo',qr:'PROD:MAT:antigo',estado:'separado',materiais:[{id:'mp2',quantidade:1}]}]),criar('p3',12,1,1)]};
   window.fixture.itens[0].etapas[0].materiais.push({id:'cola',produto_id:'COLA',nome:'Cola',unidade:'UN',necessario:1,recebido:0,devolvido:0});
   const produtos=[{id:'TINTA',codigo:'INS001',produto:'Tinta Azul',unidade:'L'},{id:'COLA',codigo:'INS002',produto:'Cola',unidade:'UN'}];
   window.supabaseClient={auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}})},from:t=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,then:f=>Promise.resolve({data:t==='clientes_empresas'?[{catalogo_logo_url:location.origin+'/decoradora.svg'}]:t==='separacoes_pedidos'?[{cliente_id:'cliente'}]:[],error:null}).then(f)};return q;},rpc:async(nome,args)=>{window.__rpc.push({nome,args});if(nome==='producao_quadro')return {data:structuredClone(window.fixture)};if(nome==='almox_produtos')return {data:produtos};if(nome==='operacao_cadastros_config')return {data:{categorias:['Pintura'],setores:['Almoxarifado'],custos:{custo_hora:30,margem:40,complexidades:{simples:0,media:20,alta:50}}}};if(nome==='producao_separar_modo'){if(window.__erroSeparar)return {error:{message:'Estoque insuficiente para separar Tinta Azul'}};const e=window.fixture.itens.flatMap(t=>t.etapas).find(e=>e.id===args.p_etapa),id='pacote'+window.__rpc.length;e.pacotes.push({id,qr:'PROD:MAT:'+id,estado:'separado',modo_separacao:args.p_modo,materiais:args.p_materiais});return {data:id};}return {data:[]};}};
   window.__cameraStops=0;window.BarcodeDetector=class{static async getSupportedFormats(){return ['qr_code'];}async detect(){return [];}};
   HTMLMediaElement.prototype.play=async()=>{};HTMLMediaElement.prototype.pause=()=>{};
   Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{const s=new MediaStream();s.getTracks=()=>[{stop(){window.__cameraStops++;}}];return s;}}});
  });
  await page.route('**/decoradora.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="30" cy="30" r="30" fill="blue"/></svg>'}));
  const escolher=async(id,modo)=>{if(await page.locator('[data-mp-voltar]').isVisible())await page.locator('[data-mp-voltar]').click();await page.locator('[data-mp-pedido='+id+']').click();await page.locator('.mp-escolha-modo[open]').waitFor();assert.equal(await page.locator('[data-mp-voltar]').count(),0);await page.locator('.mp-escolha-modo [data-mp-modo='+modo+']').click();await page.locator('.mp-escolha-modo').waitFor({state:'detached'});};
  const url=base+'/Modulos/Chiavari/Almoxarifado/almoxarifado.html';await page.goto(url);await page.waitForFunction(()=>document.querySelector('#badgeMateriaisProducao').textContent==='2');assert.equal(await page.locator('#tab-dashboard').isVisible(),true);assert.equal(await page.locator('#badgeMateriaisProducao').evaluate(el=>getComputedStyle(el).animationName),'almox-producao-pisca');
  await page.locator('[data-tab=producao]').click();await page.locator('[data-mp-pedido=p1]').waitFor();
  assert.equal(page.url(),url);assert.equal(await page.locator('.tabs').isVisible(),true);assert.equal(await page.locator('#tab-dashboard').isVisible(),false);
  assert.equal(await page.locator('#tab-producao .separacao-lane').count(),3);
  for(const [id,col] of [['p1','aguardando'],['p2','andamento'],['p3','separado']])assert.equal(await page.locator('[data-mp-pedido='+id+']').getAttribute('data-coluna'),col);
  await page.screenshot({path:'.tmp/almox-materiais-aba.png',fullPage:true});
  await escolher('p1','manual');assert.equal(page.url(),url);await page.locator('[data-mp-avatar] img').waitFor();assert.match(await page.locator('[data-mp-avatar] img').getAttribute('src'),/decoradora/);assert.equal(await page.locator('.mp-root [data-mp-modo],.mp-nota').count(),0);
  await page.locator('[data-mp-delta="1"][data-material=mp1]').click();await page.locator('[data-mp-qtd=cola]').fill('1');await page.locator('[data-mp-qtd=cola]').dispatchEvent('change');
  assert.equal(await page.locator('[data-mp-percentual]').innerText(),'75%');await page.screenshot({path:'.tmp/almox-materiais-manual.png',fullPage:true});
  await page.locator('[data-tab=dashboard]').click();await page.locator('[data-tab=producao]').click();assert.equal(await page.locator('[data-mp-qtd=mp1]').inputValue(),'1');
  await page.reload();await page.locator('[data-tab=producao]').click();await escolher('p1','manual');assert.equal(await page.locator('[data-mp-qtd=mp1]').inputValue(),'1');
  await escolher('p1','qr');const codigo=page.locator('[data-mp-codigo]');
  await codigo.fill('INVALIDO');await codigo.press('Enter');assert.match(await page.locator('[data-mp-aviso]').innerText(),/não pertence/);
  await codigo.fill('INS001');await codigo.press('Enter');assert.equal(await page.locator('[data-mp-percentual]').innerText(),'100%');
  await codigo.fill('INS001');await codigo.press('Enter');assert.equal(await page.locator('[data-mp-percentual]').innerText(),'100%');
  await page.screenshot({path:'.tmp/almox-materiais-qr.png',fullPage:true});
  await page.locator('[data-mp-finalizar]').click();await page.locator('.mp-etiquetas[open]').waitFor();
  const salvo=await page.evaluate(()=>window.__rpc.find(r=>r.nome==='producao_separar_modo').args);assert.deepEqual(salvo.p_materiais,[{id:'mp1',quantidade:2},{id:'cola',quantidade:1}]);
  assert.match(await page.locator('.mp-etiquetas').innerText(),/PROD:MAT:/);await page.locator('.mp-etiquetas [data-fechar]').click();
  await page.locator('[data-mp-voltar]').click();assert.equal(await page.locator('[data-mp-pedido=p1]').getAttribute('data-coluna'),'separado');assert.equal(await page.locator('#badgeMateriaisProducao').innerText(),'1');
  await escolher('p2','manual');await page.locator('[data-mp-delta="1"][data-material=mp2]').click();await page.locator('[data-mp-finalizar]').click();await page.waitForFunction(()=>document.querySelector('[data-mp-aviso]').textContent.includes('Kit parcial registrado'));assert.equal(await page.locator('.mp-etiquetas[open]').count(),0);assert.equal(await page.evaluate(()=>window.__rpc.filter(r=>r.nome==='producao_separar_modo').at(-1).args.p_modo),'manual');
  await escolher('p2','qr');await page.locator('[data-mp-camera]').click();await page.waitForFunction(()=>document.querySelector('[data-mp-camera]').textContent==='Desligar câmera');await page.locator('[data-tab=dashboard]').click();assert.equal(await page.evaluate(()=>window.__cameraStops),1);
  await page.locator('[data-tab=producao]').click();await page.locator('[data-mp-voltar]').click();assert.equal(await page.locator('[data-mp-pedido=p2]').getAttribute('data-coluna'),'andamento');
  assert.equal(await page.evaluate(()=>window.__rpc.filter(r=>r.nome==='producao_receber').length),0);
  await page.evaluate(()=>{window.fixture.almox=false;});await page.evaluate(()=>window.AlmoxMateriaisProducao.abrirAba());await escolher('p2','manual');assert.equal(await page.locator('[data-mp-qtd=mp2]').isDisabled(),true);
  await page.locator('[data-mp-voltar]').click();await page.evaluate(()=>{window.fixture.almox=true;const t=window.fixture.itens[1],e=structuredClone(t.etapas[0]);e.id='duplicada';e.nome='Segunda pintura';e.pacotes=[];e.materiais=[{...e.materiais[0],id:'segundo',necessario:1}];t.etapas.push(e);});await page.evaluate(()=>window.AlmoxMateriaisProducao.abrirAba());await escolher('p2','qr');
  await codigo.fill('INS001');await codigo.press('Enter');assert.match(await page.locator('[data-mp-aviso]').innerText(),/mais de uma etapa/);
  await page.locator('[data-mp-etapa]').selectOption('ep2');await codigo.fill('INS001');await codigo.press('Enter');
  await page.evaluate(()=>window.__erroSeparar=true);await page.locator('[data-mp-finalizar]').click();await page.waitForFunction(()=>document.querySelector('[data-mp-aviso]').textContent.includes('Estoque insuficiente'));await escolher('p2','manual');assert.equal(await page.locator('[data-mp-qtd=mp2]').inputValue(),'1');

  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.tmp/almox-materiais-mobile.png',fullPage:true});
  assert.ok(await page.locator('.mp-root').evaluate(e=>e.scrollWidth<=e.clientWidth+2));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=392));assert.deepEqual(erros,[]);
  await page.evaluate(()=>{window.fixture.itens.forEach(t=>t.etapas.forEach(e=>{e.pacotes=[];e.materiais.forEach(m=>{m.recebido=m.necessario;m.devolvido=0;});}));});await page.evaluate(()=>window.AlmoxMateriaisProducao.abrirAba());assert.equal(await page.locator('#badgeMateriaisProducao').isVisible(),false);
  console.log('OK - aba sem navegação, três colunas, manual e QR, rascunho restaurado, kits parciais, etiquetas e câmera encerrada ao trocar de aba.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
