const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const BASE='http://localhost:9907/';
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),erros=[];page.on('pageerror',e=>erros.push(e.message));page.on('console',m=>{if(m.type()==='error')console.log(m.text());});
 await page.route('**/*',r=>{
  const u=new URL(r.request().url());if(!r.request().url().startsWith(BASE))return r.abort();
  if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><section class="pl-page"><section id="plModuloEntregas" class="ec-page"><div id="ecMensagem" hidden></div><div class="ec-layout"><aside class="ec-pedidos"><input id="ecBusca"><div id="ecPedidos"></div></aside><section id="ecDetalhe" class="ec-detalhe"></section></div></section></section>'});
  if(u.pathname==='/foto.svg')return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#dbe9e0"/><path d="M100 100h600v300H100z" fill="none" stroke="#50785d" stroke-width="8"/></svg>'});
  const f=path.join(process.cwd(),decodeURIComponent(u.pathname));if(!fs.existsSync(f))return r.fulfill({status:404,body:''});return r.fulfill({body:fs.readFileSync(f),contentType:{'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'}[path.extname(f)]||'text/plain'});
 });
 await page.goto(BASE);await page.addStyleTag({url:BASE+'styles/global.css'});await page.addStyleTag({content:fs.readFileSync('styles/design-system.css','utf8').replace(/@import[^;]+;/g,'')});await page.addStyleTag({content:fs.readFileSync('styles/tema-chiavari.css','utf8').replace(/@import[^;]+;/g,'')});await page.addStyleTag({url:BASE+'Modulos/Comercial/Catalogo/catalogo-projetos.css'});await page.addStyleTag({url:BASE+'Modulos/Comercial/Catalogo/projeto-apresentacao.css'});await page.addStyleTag({url:BASE+'Modulos/Logistica/EntregasColetas/entregas-coletas.css'});
 await page.addStyleTag({url:BASE+'Modulos/Logistica/PainelLogistico/painel-logistico.css'});await page.addStyleTag({url:BASE+'Modulos/Comercial/Catalogo/projeto-apresentacao.css'});await page.addStyleTag({url:BASE+'Modulos/Comercial/Catalogo/catalogo-projetos.css'});
 await page.evaluate(BASE=>{
  window.__CONTEXT={empresa_id:'e1',usuario_nome:'Supervisor'};window.aguardarContexto=async()=>__CONTEXT;window.__salvos=[];
  const projeto={noivos:'Decoradora',dados:{ambientes:[{id:'a1',nome:'Cerimônia',itens:[{item_id:'cadeira',quantidade:2,observacao:'Reservar primeira fila',personalizacao_id:'pers',personalizacao_nome:'Linho claro',personalizacao_valor:12345}],renders:[{id:'r1',url:BASE+'foto.svg',origem:'Projeto da cerimônia'}]},{id:'a2',nome:'Lounge',itens:[{item_id:'cadeira',quantidade:2},{item_id:'kit',quantidade:1}],renders:[]}],plantas:[]}};
  const pedido={id:'p1',numero_pedido:'8',cliente_nome:'Decoradora com nome completo para eventos',local_nome:'Local do evento',local_id:'local1',data_entrega:'2026-11-03',fluxo_etapa:'entrega',observacoes:{observacoes_entrega:"ENTREGA: usar o portao lateral",observacoes_coleta:"COLETA: falar com o porteiro",projeto_comercial:projeto,contrato:'CONTRATO_SIGILOSO',financeiro:{total:987654}}};
  const itens=[{chave:'lc|cadeira',item_id:'cadeira',nome:'Cadeira',previsto:4,carregado:4},{chave:'lk|tampo',item_id:'tampo',nome:'Tampo do kit',previsto:1,carregado:1},{chave:'lk|base',item_id:'base',nome:'Base do kit',previsto:1,carregado:1},{chave:'fora|extra',item_id:'extra',nome:'Peça adicionada à carga',previsto:1,carregado:1}];
  window.b={pedido,itens,historico:[],atual:null,token:'1'};window.PedidoFluxo={fila:async()=>[pedido]};
  const banco={empresas:[{nome:'Chiavari',logo_url:BASE+'foto.svg'}],locais_empresas:[{endereco:'Estrada do Passatempo, 976 - Tres Rios, Areal - RJ, 25850-000',numero_endereco:'976'}],logistica_motivos:[{id:'m1',nome:'Item nao entregue',etapa:'entrega'}],separacoes_pedidos:[pedido],separacoes_itens:[{id:'lc',separacao_pedido_id:'p1',item_id:'cadeira',item_nome:'Cadeira',quantidade_solicitada:4},{id:'lk',separacao_pedido_id:'p1',item_id:'kit',item_nome:'Mesa',quantidade_solicitada:1}],itens:[{id:'cadeira',produto:'Cadeira Tiffany',descricao_total:'Cadeira Tiffany (L) 0.50 m (A) 0.90 m (P) 0.50 m',foto_url:BASE+'foto.svg',codigo:'CAD1'},{id:'kit',produto:'Mesa Nice',foto_url:BASE+'foto.svg'},{id:'tampo',produto:'Tampo'},{id:'base',produto:'Base'},{id:'extra',produto:'Peça extra'}],clientes_empresas:[{catalogo_logo_url:BASE+'foto.svg'}]};
  window.supabaseClient={from:t=>{const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,range:()=>q,limit:()=>q,then:f=>f({data:banco[t]||[],error:null})};return q;},rpc:async(n,a)=>{
   if(n==='logistica_confirmacao_base')return {data:structuredClone(b)};
   if(n==='logistica_confirmacao_salvar'){__salvos.push(a);b.atual={itens:a.p_itens,versao:1,criado_em:new Date().toISOString(),responsavel:'Supervisor'};return {data:structuredClone(b)};}
   return {data:[]};}};
 },BASE);
 await page.addScriptTag({url:BASE+'js/core/alerta.js'});await page.evaluate(()=>window.alerta=msg=>console.error('AVISO: '+msg));
 await page.addScriptTag({url:BASE+'js/logistica/pedido-conferencia.js'});await page.addScriptTag({url:BASE+'Modulos/Logistica/EntregasColetas/entregas-coletas.js'});
 await page.locator('[data-pedido=p1]').click();await page.locator('.ec-documento-tabela').waitFor({timeout:5000}).catch(async e=>{console.log(await page.locator('body').innerText());console.log(erros);throw e;});

 for(const etapa of ['entrega','coleta']){
  if(etapa==='coleta'){await page.evaluate(()=>{b.pedido.fluxo_etapa='coleta';b.pedido.data_coleta=b.pedido.data_entrega;b.itens.forEach(i=>{i.entregue=i.previsto;i.voltou_antes=0;});});await page.evaluate(()=>EntregasColetas.iniciar());await page.evaluate(()=>EntregasColetas.definirOperacao('coleta'));await page.locator('[data-pedido=p1]').click();await page.locator('.ec-documento-tabela').waitFor({timeout:5000}).catch(async e=>{console.log(await page.locator('body').innerText());console.log(erros);throw e;});}
  for(const width of [1905,1366,1024,768,390]){
   await page.setViewportSize({width,height:1000});
   const medidas=await page.evaluate(()=>{const paper=document.querySelector('.ec-documento-pedido'),head=paper.querySelector('.cpj-order-letterhead'),r=head.getBoundingClientRect(),p=paper.getBoundingClientRect(),det=document.getElementById('ecDetalhe').getBoundingClientRect(),rect=e=>{const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right};};return {head:rect(head),paper:rect(paper),detalhe:{top:det.top,left:det.left,right:det.right},conteudo:[...head.querySelectorAll('.cpj-order-logo,.cpj-order-requester,.cpj-order-kind')].map(rect),overflow:head.scrollWidth>head.clientWidth+1};});
   assert.ok(medidas.head.top>=medidas.paper.top-1,'cabecalho dentro do papel '+etapa+' '+width+' '+JSON.stringify(medidas));
   assert.ok(medidas.head.left>=medidas.paper.left-1&&medidas.head.right<=medidas.paper.right+1,'largura do cabecalho');
   assert.ok(medidas.conteudo.every(c=>c.top>=medidas.head.top-1&&c.bottom<=medidas.head.bottom+1&&c.left>=medidas.head.left-1&&c.right<=medidas.head.right+1),'logo, cliente e pedido inteiros '+etapa+' '+width+' '+JSON.stringify(medidas));
   assert.equal(medidas.overflow,false,'sem corte horizontal '+etapa+' '+width);
   assert.equal(await page.locator('.ec-responsaveis,#ecImprimir,.ec-observacoes-pedido').count(),0,'blocos removidos continuam ausentes');
   await page.screenshot({path:'.tmp/painel-'+etapa+'-cabecalho-'+width+'.png'});
  }
 }
 assert.deepEqual(erros,[]);console.log('OK: cabecalho de entrega e coleta sem cortes, logo e nomes longos inteiros, nas larguras 1905/1366/1024/768/390; APIs simuladas.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
