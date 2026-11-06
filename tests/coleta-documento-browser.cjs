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
  const pedido={id:'p1',numero_pedido:'8',cliente_nome:'Decoradora',local_nome:'Local do evento',local_id:'local1',data_entrega:'2026-11-03',fluxo_etapa:'coleta',observacoes:{projeto_comercial:projeto,contrato:'CONTRATO_SIGILOSO',financeiro:{total:987654}}};
  const itens=[{chave:'lc|cadeira',item_id:'cadeira',nome:'Cadeira',previsto:4,carregado:4},{chave:'lk|tampo',item_id:'tampo',nome:'Tampo do kit',previsto:1,carregado:1},{chave:'lk|base',item_id:'base',nome:'Base do kit',previsto:1,carregado:1},{chave:'fora|extra',item_id:'extra',nome:'Peça adicionada à carga',previsto:1,carregado:1}];
  window.b={pedido,itens,historico:[],atual:null,token:'1'};window.PedidoFluxo={fila:async()=>[pedido]};
  const banco={locais_empresas:[{endereco:'Estrada do Passatempo, 976 - Tres Rios, Areal - RJ, 25850-000',numero_endereco:'976'}],logistica_motivos:[{id:'m1',nome:'Item nao entregue',etapa:'coleta'}],separacoes_pedidos:[pedido],separacoes_itens:[{id:'lc',separacao_pedido_id:'p1',item_id:'cadeira',item_nome:'Cadeira',quantidade_solicitada:4},{id:'lk',separacao_pedido_id:'p1',item_id:'kit',item_nome:'Mesa',quantidade_solicitada:1}],itens:[{id:'cadeira',produto:'Cadeira Tiffany',descricao_total:'Cadeira Tiffany (L) 0.50 m (A) 0.90 m (P) 0.50 m',foto_url:BASE+'foto.svg',codigo:'CAD1'},{id:'kit',produto:'Mesa Nice',foto_url:BASE+'foto.svg'},{id:'tampo',produto:'Tampo'},{id:'base',produto:'Base'},{id:'extra',produto:'Peça extra'}],clientes_empresas:[{catalogo_logo_url:BASE+'foto.svg'}]};
  window.supabaseClient={from:t=>{const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,range:()=>q,limit:()=>q,then:f=>f({data:banco[t]||[],error:null})};return q;},rpc:async(n,a)=>{
   if(n==='logistica_confirmacao_base')return {data:structuredClone(b)};
   if(n==='logistica_confirmacao_salvar'){__salvos.push(a);b.atual={itens:a.p_itens,versao:1,criado_em:new Date().toISOString(),responsavel:'Supervisor'};return {data:structuredClone(b)};}
   return {data:[]};}};
 },BASE);

 await page.evaluate(()=>{
  b.pedido.data_coleta='2026-11-03';b.itens[0].previsto=3;b.pedido.extras=['8/2'];b.itens[3].pedido_numero='8/2';
  b.itens.forEach(p=>{p.entregue=p.previsto;p.voltou_antes=0;});
 });
 await page.addScriptTag({url:BASE+'js/core/alerta.js'});
 await page.addScriptTag({url:BASE+'js/core/evidenciasOperacao.js'});
 await page.addScriptTag({url:BASE+'js/logistica/pedido-conferencia.js'});
 await page.addScriptTag({url:BASE+'Modulos/Logistica/EntregasColetas/entregas-coletas.js'});
 await page.evaluate(()=>EntregasColetas.definirOperacao('coleta'));
 await page.locator('[data-pedido=p1]').click();await page.locator('.ec-conferencia-cinco').waitFor();
 assert.equal(await page.locator('.ec-pedido-identificacao').count(),0);
 assert.deepEqual(await page.locator('.ec-conferencia-cinco .cpj-order-colhead').first().locator('td').allTextContents(),['Qtd.','','Item','Coletado','Danificados','Foto dano','N\u00e3o encontrado','Foto n\u00e3o encontrado']);
 assert.ok((await page.locator('.cpj-order-environment').allTextContents()).includes('Pedido extra #8/2'),'itens extras identificados pelo pedido');
 assert.equal(await page.locator('.ec-documento-kit').count(),1);assert.equal(await page.locator('.ec-documento-kit input').count(),0);
 assert.equal(await page.locator('.ec-documento-componente').count(),2);
 assert.equal(await page.locator('.ec-documento-pedido.is-horizontal,.cpj-order-renders,.cpj-order-planta-folha').count(),0);
 const quantidades=await page.locator('.ec-documento-item:not(.ec-documento-kit) .cpj-order-qty').allTextContents();
 assert.deepEqual(quantidades.map(s=>Number(s.trim())),[2,1,1,1,1],'quantidades refletem tres cadeiras no evento, distribuidas pelos ambientes');
 assert.equal(await page.locator('[name=coletado]').count(),4);assert.equal(await page.locator('[name=danificado]').count(),4);
 await page.locator('[name=coletado][data-i="0"]').fill('2');
 assert.equal(await page.locator('[data-falta="0"]').innerText(),'1');
 assert.equal(await page.locator('[name=motivo][data-i="0"]').isVisible(),true);
 assert.equal(await page.locator('[data-fotos-item="0"][data-foto-tipo=nao_encontrado]').isVisible(),true);
 assert.equal(await page.locator('[data-fotos-item="0"][data-foto-tipo=danificado]').isVisible(),false);
 await page.locator('[name=danificado][data-i="0"]').fill('1');
 assert.equal(await page.locator('[data-fotos-item="0"][data-foto-tipo=danificado]').isVisible(),true);
 await page.locator('[name=motivo][data-i="0"]').selectOption('m1');
 await page.locator('#ecImprimir').click();
 assert.equal(await page.locator('.ec-impressao-cab h2').innerText(),'Imprimir lista de coleta');
 await page.locator('[data-pedido-layout=horizontal]').click();
 assert.equal(await page.locator('[name=coletado][data-i="0"]').inputValue(),'2');
 assert.equal(await page.locator('[name=danificado][data-i="0"]').inputValue(),'1');
 const imprimir=()=>page.evaluate(()=>PedidoConferencia.impressao(document.querySelector('.ec-documento-pedido'),{titulo:'Lista de coleta'}));
 const horizontal=await imprimir();assert.match(horizontal,/@page\{size:A4 landscape/);assert.doesNotMatch(horizontal,/class="cpj-order-amb-fotos"|class="cpj-order-renders"/);
 await page.locator('[data-pedido-layout=final]').click();const vertical=await imprimir();assert.match(vertical,/@page\{size:A4 portrait/);assert.doesNotMatch(vertical,/class="cpj-order-renders"|class="cpj-order-render-group"/);
 const caixas=await page.evaluate(html=>new DOMParser().parseFromString(html,'text/html').querySelectorAll('.ec-impressao-quantidade').length,vertical);assert.equal(caixas,12);
 await page.locator('[data-fechar-impressao]').click();
 await page.evaluate(()=>b.itens.forEach((p,i)=>{const c=document.querySelector('[name=coletado][data-i="'+i+'"]');c.value=p.previsto;c.dispatchEvent(new Event('input',{bubbles:true}));}));
 await page.locator('[name=danificado][data-i="0"]').fill('0');
 await page.locator('#ecForm [type=submit]').click();await page.waitForFunction(()=>__salvos.length===1);
 const payload=await page.evaluate(()=>__salvos[0]);assert.equal(payload.p_etapa,'coleta');assert.deepEqual(payload.p_itens.map(i=>i.coletado),[3,1,1,1]);
 await page.locator('.el-alert-stack [data-variant=success]').waitFor();
 await page.screenshot({path:'.tmp/coleta-documento-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(erros,[]);console.log('OK - coleta com mesmo documento, kits, quantidades no evento, fotos separadas, impressao nos dois layouts e gravacao.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
