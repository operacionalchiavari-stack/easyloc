const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge'});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),erros=[];page.on('pageerror',e=>erros.push(e.message));const BASE='http://localhost:9930/';
 await page.route(BASE+'**',route=>{const u=new URL(route.request().url()),file=path.join(process.cwd(),decodeURIComponent(u.pathname));if(u.pathname.endsWith('/Pedidos/pedido.html'))return route.fulfill({contentType:'text/html',body:'<p>Pedido</p>'});if(!fs.existsSync(file))return route.fulfill({status:404,body:''});const ext=path.extname(file);let body=fs.readFileSync(file);if(ext==='.html')body=body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');return route.fulfill({body,contentType:ext==='.html'?'text/html':ext==='.js'?'text/javascript':'text/plain'});});
 await page.goto(BASE+'Modulos/Comercial/ContasReceber/contas-receber.html');
 await page.evaluate(()=>{
  window.__CONTEXT={empresa_id:'e1'};window.aguardarContexto=async()=>{};window.__rpc=[];
  const base={recebido:0,divisao:'locacao',parcela:1,parcelas:1,status_comercial:'aprovado'};
  window.supabaseClient={rpc:async(nome,args)=>{__rpc.push({nome,args});return {data:[{...base,id:'t1',pedido_id:'p1',numero_pedido:'1',cliente_id:'c1',cliente_nome:'Cliente A',vencimento:'2001-01-01',valor:100,aberto:100,local_nome:'Local A'},{...base,id:'t2',pedido_id:'p2',numero_pedido:'2',cliente_id:'c2',cliente_nome:'Cliente B',vencimento:'2099-12-31',valor:200,aberto:200,local_nome:'Local B'}]}}};
 });
 for(const file of ['styles/design-system.css','styles/tema-chiavari.css','Modulos/Comercial/comercial-relatorios.css','Modulos/Comercial/ContasReceber/contas-receber.css'])await page.addStyleTag({content:fs.readFileSync(file,'utf8').replace(/@import[^;]+;/g,'')});
 for(const file of ['Modulos/Comercial/comercial-relatorios.js','Modulos/Comercial/Pedidos/central-contas-receber.js','Modulos/Comercial/ContasReceber/contas-receber.js'])await page.addScriptTag({url:BASE+file});
 await page.locator('#crOrdenar').selectOption('data');await page.locator('#crConteudo [data-abrir=p2]').waitFor();assert.match(await page.locator('#crConteudo').innerText(),/Cliente A/);assert.match(await page.locator('#crConteudo').innerText(),/Cliente B/);
 await page.locator('#receberBusca').fill('Cliente B');assert.doesNotMatch(await page.locator('#crConteudo').innerText(),/Cliente A/);
 await page.locator('#receberBusca').fill('');assert.match(await page.locator('#crConteudo').innerText(),/Cliente A/);
 assert.equal(await page.locator('#receberDe,#receberAte,#receberLimpar,#receberAtualizar').count(),0);
 assert.equal(await page.locator('.receber-subtitulo').innerText(),'(COMERCIAL)');
 const titulo=await page.locator('.receber-cabecalho h2').boundingBox(),sub=await page.locator('.receber-subtitulo').boundingBox();assert.ok(sub.y>=titulo.y+titulo.height && sub.y-(titulo.y+titulo.height)<12,'Subtitulo logo abaixo');assert.ok(Math.abs((titulo.x+titulo.width/2)-(sub.x+sub.width/2))<3,'Subtitulo centralizado com titulo');

 assert.equal(await page.evaluate(()=>__rpc[0].nome),'comercial_contas_receber');assert.equal(await page.evaluate(()=>__rpc[0].args.p_empresa),'e1');
 await page.locator('#crConteudo [data-abrir=p2]').click();await page.waitForURL('**/Pedidos/pedido.html?pedido=p2&modo=editar');assert.deepEqual(erros,[]);
 const central=fs.readFileSync('Modulos/Comercial/Pedidos/CentralPedidos.html','utf8');assert.doesNotMatch(central,/data-central-visao|id="centralContasReceber"|id="btnCatalogoCentral"|data-sublocacoes/);
 const menu=fs.readFileSync('js/ui/sidebarMenu.js','utf8');assert.match(menu,/rotulo: "Contas a receber", href: "Modulos\/Comercial\/ContasReceber\/contas-receber.html"/);
 console.log('OK - contas a receber no menu Comercial, pagina propria, filtros, agrupamento e abertura do pedido; Central sem os acessos removidos.');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});

