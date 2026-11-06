const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const BASE='http://localhost:9907/';
(async()=>{const browser=await chromium.launch({channel:'msedge'});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
 await page.route('**/*',r=>{
  const u=new URL(r.request().url());if(!r.request().url().startsWith(BASE))return r.abort();
  if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><div id="ecMensagem" hidden></div><section class="ec-page"><input id="ecBusca"><div id="ecPedidos"></div><div id="ecDetalhe"></div></section>'});
  if(u.pathname==='/foto.svg')return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#dbe9e0"/><path d="M100 100h600v300H100z" fill="none" stroke="#50785d" stroke-width="8"/></svg>'});
  const f=path.join(process.cwd(),decodeURIComponent(u.pathname));if(!fs.existsSync(f))return r.fulfill({status:404,body:''});return r.fulfill({body:fs.readFileSync(f),contentType:{'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'}[path.extname(f)]||'text/plain'});
 });
 await page.goto(BASE);await page.addStyleTag({content:fs.readFileSync('styles/design-system.css','utf8').replace(/@import[^;]+;/g,'')});await page.addStyleTag({content:fs.readFileSync('styles/tema-chiavari.css','utf8').replace(/@import[^;]+;/g,'')});await page.addStyleTag({url:BASE+'Modulos/Comercial/Catalogo/catalogo-projetos.css'});await page.addStyleTag({url:BASE+'Modulos/Comercial/Catalogo/projeto-apresentacao.css'});await page.addStyleTag({url:BASE+'Modulos/Logistica/EntregasColetas/entregas-coletas.css'});
 await page.evaluate(BASE=>{
  window.__CONTEXT={empresa_id:'e1',usuario_nome:'Supervisor'};window.aguardarContexto=async()=>__CONTEXT;window.__salvos=[];
  const projeto={noivos:'Decoradora',dados:{ambientes:[{id:'a1',nome:'Cerimônia',itens:[{item_id:'cadeira',quantidade:2,observacao:'Reservar primeira fila',personalizacao_id:'pers',personalizacao_nome:'Linho claro',personalizacao_valor:12345}],renders:[{id:'r1',url:BASE+'foto.svg',origem:'Projeto da cerimônia'}]},{id:'a2',nome:'Lounge',itens:[{item_id:'cadeira',quantidade:2},{item_id:'kit',quantidade:1}],renders:[]}],plantas:[{id:'pl',nome:'Planta do evento',url:BASE+'foto.svg',papel:'A4-P',legendas:[{id:'leg',ambienteId:'a1',renderId:'r1',ponto:{x:.5,y:.5}}]}]}};
  const pedido={id:'p1',numero_pedido:'8',cliente_nome:'Decoradora',local_nome:'Local do evento',local_id:'local1',data_entrega:'2026-11-03',fluxo_etapa:'entrega',observacoes:{projeto_comercial:projeto,contrato:'CONTRATO_SIGILOSO',financeiro:{total:987654}}};
  const itens=[{chave:'lc|cadeira',item_id:'cadeira',nome:'Cadeira',previsto:4,carregado:4},{chave:'lk|tampo',item_id:'tampo',nome:'Tampo do kit',previsto:1,carregado:1},{chave:'lk|base',item_id:'base',nome:'Base do kit',previsto:1,carregado:1},{chave:'fora|extra',item_id:'extra',nome:'Peça adicionada à carga',previsto:1,carregado:1}];
  window.b={pedido,itens,historico:[],atual:null,token:'1'};window.PedidoFluxo={fila:async()=>[pedido]};
  const banco={locais_empresas:[{endereco:'Estrada do Passatempo, 976 - Tres Rios, Areal - RJ, 25850-000',numero_endereco:'976'}],logistica_motivos:[{id:'m1',nome:'Item nao entregue',etapa:'entrega'}],separacoes_pedidos:[pedido],separacoes_itens:[{id:'lc',separacao_pedido_id:'p1',item_id:'cadeira',item_nome:'Cadeira',quantidade_solicitada:4},{id:'lk',separacao_pedido_id:'p1',item_id:'kit',item_nome:'Mesa',quantidade_solicitada:1}],itens:[{id:'cadeira',produto:'Cadeira Tiffany',descricao_total:'Cadeira Tiffany (L) 0.50 m (A) 0.90 m (P) 0.50 m',foto_url:BASE+'foto.svg',codigo:'CAD1'},{id:'kit',produto:'Mesa Nice',foto_url:BASE+'foto.svg'},{id:'tampo',produto:'Tampo'},{id:'base',produto:'Base'},{id:'extra',produto:'Peça extra'}],clientes_empresas:[{catalogo_logo_url:BASE+'foto.svg'}]};
  window.supabaseClient={from:t=>{const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,range:()=>q,limit:()=>q,then:f=>f({data:banco[t]||[],error:null})};return q;},rpc:async(n,a)=>{
   if(n==='logistica_confirmacao_base')return {data:structuredClone(b)};
   if(n==='logistica_confirmacao_salvar'){__salvos.push(a);b.atual={itens:a.p_itens,versao:1,criado_em:new Date().toISOString(),responsavel:'Supervisor'};return {data:structuredClone(b)};}
   return {data:[]};}};
 },BASE);
 await page.addScriptTag({url:BASE+'js/core/alerta.js'});
 await page.addScriptTag({url:BASE+'js/logistica/pedido-conferencia.js'});await page.addScriptTag({url:BASE+'Modulos/Logistica/EntregasColetas/entregas-coletas.js'});
 await page.locator('[data-pedido=p1]').click();await page.locator('.ec-documento-tabela').waitFor();
 const fontesDocumento=await page.evaluate(()=>Object.fromEntries([
  ['local','.cpj-order-local h2'],['ambiente','.cpj-order-environment th']
 ].map(([nome,seletor])=>{const s=getComputedStyle(document.querySelector(seletor));return[nome,{familia:s.fontFamily,peso:s.fontWeight,tamanho:s.fontSize}]})));
 assert.deepEqual(fontesDocumento,{
  local:{familia:'Georgia, serif',peso:'400',tamanho:'30px'},
  ambiente:{familia:'Georgia, serif',peso:'400',tamanho:'21px'}
 },'titulos seguem a tipografia comercial mesmo dentro do painel');
 assert.equal(await page.locator('.ec-decorador-foto img').count(),1);
 assert.equal(await page.locator('.ec-pedido-identificacao').count(),0,'sem identificacao repetida acima da lista');
 assert.ok(await page.locator('.ec-sem-foto-item').count()>0);assert.equal(await page.locator('.ec-sem-foto-item').first().innerText(),'Sem foto');
 assert.deepEqual(await page.locator('.ec-conferencia-cinco .cpj-order-colhead').first().locator('td').allTextContents(),['Qtd.','','Item','Entregue','Danificados','Foto dano','Desist\u00eancia','Foto desist\u00eancia'],'titulos na mesma ordem dos campos');

 await page.evaluate(()=>{
  const td=document.querySelector('.ec-conferencia-cinco .ec-documento-item td:nth-child(6)');
  const teste=document.createElement('div');teste.id='teste-miniatura';teste.className='ec-fotos-item';
  teste.innerHTML='<label class="ec-anexar">Foto<input type="file"></label><div class="ec-evidencias"></div>';td.append(teste);
 });
 assert.equal(await page.locator('#teste-miniatura .ec-anexar').isVisible(),true);
 await page.evaluate(()=>{const img=document.createElement('img');img.src='/foto.svg';document.querySelector('#teste-miniatura .ec-evidencias').append(img)});
 assert.equal(await page.locator('#teste-miniatura .ec-anexar').isVisible(),false,'foto substitui botao de anexar');
 await page.locator('#teste-miniatura img').evaluate(el=>el.remove());
 assert.equal(await page.locator('#teste-miniatura .ec-anexar').isVisible(),true,'remover foto restaura botao');
 for(const coluna of [6,8]){
  await page.evaluate(coluna=>{const galeria=document.querySelector('#teste-miniatura .ec-evidencias');galeria.innerHTML='<a href="/foto.svg" target="_blank"><img src="/foto.svg" alt="Foto da ocorrencia"></a>';document.querySelector('.ec-documento-item td:nth-child('+coluna+')').append(document.querySelector('#teste-miniatura'));},coluna);
  await page.locator('#teste-miniatura a').click();
  assert.equal(await page.locator('dialog.ec-preview-foto').evaluate(el=>el.matches(':modal')),true,'foto abre na propria tela');
  assert.equal(await page.locator('dialog.ec-preview-foto img').getAttribute('alt'),'Foto da ocorrencia');
  await page.keyboard.press('Escape');await page.locator('dialog.ec-preview-foto').waitFor({state:'detached'});assert.equal(await page.locator('dialog.ec-preview-foto').count(),0);
 }
 await page.locator('#teste-miniatura').evaluate(el=>el.remove());

 assert.equal(await page.locator('.cpj-order-local-endereco').innerText(),'Estrada do Passatempo, 976 - Tres Rios, Areal - RJ, 25850-000','endereco completo sem duplicar numero');
 assert.deepEqual(await page.locator('.cpj-order-environment').allTextContents(),['Cerimônia','Lounge','Itens adicionais']);
 assert.match(await page.locator('.ec-documento-pedido').innerText(),/Linho claro/);assert.match(await page.locator('.ec-documento-pedido').innerText(),/Reservar primeira fila/);
 assert.equal(await page.locator('.cpj-order-render-group img,.cpj-order-planta-folha').count(),0,'tela sem renderizacoes e planta');
 assert.doesNotMatch(await page.locator('.ec-documento-pedido').innerText(),/R\$|Reposição|Valor un\.|Pagamento|CONTRATO_SIGILOSO|987654|12345/);
 assert.equal(await page.locator('[name=entregue_local]').count(),4,'cada peça operacional aparece uma unica vez, mesmo em ambientes repetidos e kits');
 assert.doesNotMatch(await page.locator('.ec-documento-item').first().innerText(),/C\u00f3d\./,'tela de conferencia sem codigo');
 const kit=page.locator('.ec-documento-kit');assert.equal(await kit.count(),1);assert.equal(await kit.locator('input').count(),0,'kit nao possui campos de conferencia');
 const componentes=page.locator('.ec-documento-componente');assert.equal(await componentes.count(),2);
 assert.match(await kit.innerText(),/Composto por 2 itens/);assert.equal(await kit.locator('.pa-medidas').count(),0,'medidas ficam nos componentes');
 assert.equal(await kit.locator('td').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(232, 233, 231)');
 await kit.hover();assert.equal(await kit.locator('td').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(232, 233, 231)','kit mantem cor no hover');
 await componentes.first().hover();assert.equal(await componentes.first().locator('td').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(242, 243, 241)','componente mantem cor no hover');
 assert.equal(await page.locator('.ec-documento-componente-ultimo').count(),1);assert.equal(await page.locator('.ec-componente-ramo').count(),2,'ligacao visual dos componentes');

 assert.deepEqual(await componentes.locator('td:nth-child(3)>strong').allTextContents(),['Tampo','Base']);
 for(const linha of await componentes.all())assert.equal(await linha.locator('input[type=number]').count(),3,'componente tem os tres campos na sua linha');
 assert.equal(await kit.evaluate(el=>el.nextElementSibling.classList.contains('ec-documento-componente')&&el.nextElementSibling.nextElementSibling.classList.contains('ec-documento-componente')),true,'componentes ficam logo abaixo do kit');

 await page.evaluate(()=>{b.itens.forEach((p,i)=>{const el=document.querySelector('[name=entregue_local][data-i="'+i+'"]');el.value=p.previsto;el.dispatchEvent(new Event('input',{bubbles:true}));});});
 const linhaConferencia=page.locator('[name=entregue_local][data-i="0"]').locator('xpath=ancestor::tr');
 assert.equal(await linhaConferencia.evaluate(el=>el.classList.contains('ec-entregue-igual')),true,'entrega integral verde');
 await page.locator('[name=desistencia][data-i="0"]').fill('1');
 assert.equal(await linhaConferencia.evaluate(el=>el.classList.contains('ec-entregue-diferente')),true,'desistencia amarela');
 await page.locator('[name=danificado][data-i="0"]').fill('1');
 assert.equal(await linhaConferencia.evaluate(el=>el.classList.contains('ec-entrega-danificado')),true,'dano tem prioridade vermelha');
 assert.equal(await linhaConferencia.locator('td').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(254, 226, 226)');
 await page.locator('[name=desistencia][data-i="0"]').fill('0');await page.locator('[name=danificado][data-i="0"]').fill('0');
 assert.deepEqual(await linhaConferencia.locator('input[type=number]').evaluateAll(els=>els.map(el=>el.name)),['entregue_local','danificado','desistencia']);
 await page.locator('[name=entregue_local][data-i="0"]').fill('3');
 assert.equal(await page.locator('[data-motivo-item="0"][data-motivo-tipo=entregue]').isVisible(),true,'falta tem motivo em entregue');
 assert.equal(await page.locator('[data-motivo-item="0"][data-motivo-tipo=desistencia]').isVisible(),false,'falta nao e desistencia');
 await page.locator('[name=desistencia][data-i="0"]').fill('1');
 assert.equal(await page.locator('[data-motivo-item="0"][data-motivo-tipo=desistencia]').isVisible(),true,'motivo de desistencia so aparece com quantidade');
 await page.locator('[name=motivo_desistencia][data-i="0"]').selectOption('m1');
 await page.locator('[name=desistencia][data-i="0"]').fill('0');
 assert.equal(await page.locator('[data-motivo-item="0"][data-motivo-tipo=desistencia]').isVisible(),false,'zerar esconde motivo de desistencia');
 await page.locator('[name=entregue_local][data-i="0"]').fill('3');await page.locator('#ecForm [type=submit]').click();
 await page.locator('[role=alertdialog]').waitFor();
 assert.match(await page.locator('[role=alertdialog]').innerText(),/Selecione o motivo/);
 const alertaTopo=await page.locator('[role=alertdialog]').boundingBox();assert.ok(alertaTopo.y<=30,'modal de aviso fica no topo');
 assert.equal(await page.locator('#ecMensagem').isVisible(),false,'aviso nao aparece na faixa');
 await page.locator('[role=alertdialog] button').filter({hasText:'OK'}).click();
 await page.waitForFunction(()=>document.activeElement?.name==='motivo');
 await page.locator('[name=motivo][data-i="0"]').selectOption('m1');
 assert.equal(await page.locator('.ec-documento-layout').isVisible(),false,'opcoes de impressao ocultas durante conferencia');
 await page.locator('#ecImprimir').click();
 assert.equal(await page.locator('.ec-documento-layout').isVisible(),true,'opcoes aparecem ao pedir impressao');
 assert.equal(await page.locator('dialog.ec-documento-layout').evaluate(el=>el.matches(':modal')),true,'escolha abre em modal');
 assert.equal(await page.locator('.ec-previa-folha').count(),2,'previa visual dos dois layouts');
 await page.locator('dialog.ec-documento-layout').screenshot({path:'.tmp/impressao-previas.png'});
 await page.locator('[data-pedido-layout=horizontal]').click();
 assert.equal(await page.locator('.ec-documento-pedido').evaluate(el=>el.classList.contains('is-horizontal')),false);
 assert.equal(await page.locator('.ec-conferencia-cinco .cpj-order-colhead').first().locator('td').count(),8,'cinco colunas de conferencia separadas');
 assert.equal(await page.locator('.ec-documento-kit input').count(),0);assert.equal(await page.locator('.ec-documento-componente').count(),2);
 assert.equal(await page.locator('.cpj-order-amb-fotos img').count(),0,'renderizacao fica ao lado do mesmo ambiente');
 assert.equal(await page.locator('.cpj-order-amb.has-foto .ec-documento-tabela').count(),0);
 assert.equal(await page.locator('[name=entregue_local][data-i="0"]').inputValue(),'3','trocar layout preserva a conferencia');assert.equal(await page.locator('[name=motivo][data-i="0"]').inputValue(),'m1','motivo preservado');
 const horizontal=await page.evaluate(()=>PedidoConferencia.impressao(document.querySelector('.ec-documento-pedido'),{titulo:'Conferencia horizontal'}));
 assert.match(horizontal,/@page\{size:A4 landscape/);assert.match(horizontal,/cpj-order-amb-fotos/);assert.doesNotMatch(horizontal,/CONTRATO_SIGILOSO|987654|12345|cpj-order-contrato|class="cpj-order-financeiro"/);
 await page.locator('.ec-documento-pedido').screenshot({path:'.tmp/kit-agrupado-entrega.png'});
 await page.screenshot({path:'.tmp/entrega-layout-horizontal.png',fullPage:true});
 await page.locator('[data-pedido-layout=final]').click();assert.equal(await page.locator('[name=entregue_local][data-i="0"]').inputValue(),'3');
 const vertical=await page.evaluate(()=>PedidoConferencia.impressao(document.querySelector('.ec-documento-pedido'),{titulo:'Conferencia vertical'}));assert.match(vertical,/@page\{size:A4 portrait/);assert.doesNotMatch(vertical,/@page\{size:A4 landscape;margin:0 0 10mm/);
 const impresso=await page.evaluate(()=>PedidoConferencia.impressao(document.querySelector('.ec-documento-pedido'),{titulo:'Lista de entrega',subtitulo:'Pedido #8'}));
 const camposImpressos=await page.evaluate(html=>{
  const doc=new DOMParser().parseFromString(html,'text/html');
  return {campos:[...doc.querySelectorAll('.ec-impressao-quantidade')].map(c=>c.textContent),kit:doc.querySelector('.ec-documento-kit').querySelectorAll('.ec-impressao-quantidade').length,componentes:[...doc.querySelectorAll('.ec-documento-componente')].map(c=>c.querySelectorAll('.ec-impressao-quantidade').length)};
 },impresso);
 assert.deepEqual(camposImpressos,{campos:Array(12).fill(''),kit:0,componentes:[3,3]},'impressao possui caixas vazias para escrever quantidades, inclusive componentes');
 assert.match(impresso,/Renderiza|Planta do evento/);assert.doesNotMatch(impresso,/CONTRATO_SIGILOSO|987654|12345|class="cpj-order-financeiro"|type="number"/);
 await page.locator('[data-fechar-impressao]').click();
 assert.equal(await page.locator('.ec-documento-layout').isVisible(),false);
 await page.locator('#ecForm [type=submit]').click();await page.waitForFunction(()=>__salvos.length===1);
 await page.locator('.el-alert-stack [data-variant=success]').waitFor();
 assert.match(await page.locator('.el-alert-stack [data-variant=success]').innerText(),/Entrega confirmada/);
 assert.ok((await page.locator('.el-alert-stack').boundingBox()).y<=22,'sucesso global no topo');
 assert.equal(await page.locator('#ecMensagem').isVisible(),false);
 const salvos=await page.evaluate(()=>__salvos[0].p_itens);assert.deepEqual(salvos.map(p=>p.chave),['lc|cadeira','lk|tampo','lk|base','fora|extra']);assert.deepEqual(salvos.map(p=>p.entregue_local),[3,1,1,1]);assert.equal(salvos[0].motivo_id,'m1');
 await page.screenshot({path:'.tmp/entrega-documento-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'sem barra horizontal');
 await page.screenshot({path:'.tmp/entrega-documento-celular.png',fullPage:true});assert.deepEqual(erros,[]);
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 for(const [nome,documento,paisagem] of [['vertical',vertical,false],['horizontal',horizontal,true]]){
  await page.setContent(documento,{waitUntil:'networkidle'});
  const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true});fs.writeFileSync('.tmp/conferencia-'+nome+'.pdf',pdf);
  const leitor=await pdfjs.getDocument({data:new Uint8Array(pdf),useSystemFonts:true}).promise;
  const primeira=await leitor.getPage(1),vista=primeira.getViewport({scale:1});assert.equal(vista.width>vista.height,paisagem,'orientacao real do PDF '+nome);
  const texto=(await primeira.getTextContent()).items.map(i=>i.str).join(' ');assert.match(texto,/Entregue/);assert.doesNotMatch(texto,/Reposi|Valor un|R\$/);await leitor.destroy();
 }
 const loading=await browser.newPage({viewport:{width:1440,height:900}});await loading.setContent('<section class="pl-page"><div id="plDias" class="pl-dias"><div class="pl-vazio">Carregando...</div></div></section>');
 await loading.addStyleTag({path:'Modulos/Logistica/PainelLogistico/painel-logistico.css'});await loading.addScriptTag({path:'js/core/loading.js'});
 const centralizado=await loading.evaluate(()=>{const host=document.getElementById('plDias').getBoundingClientRect(),ring=document.querySelector('.el-loading-indicator').getBoundingClientRect();return Math.abs((host.left+host.width/2)-(ring.left+ring.width/2))<2&&Math.abs((host.top+host.height/2)-(ring.top+ring.height/2))<2;});assert.ok(centralizado,'loading no centro da area disponivel');await loading.close();
 console.log('OK - mesma lista comercial sem valores, ambientes, kit, itens extras, foto, renderizacao, planta legendada, impressao e conferencia.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
