// Comercial > Contas a receber (nov/2026): a mesma tabela do Financeiro > A receber (por pedido e por data) e a aba
// Recebimentos previstos. Só leitura: "Abrir pedido" no lugar de Editar/Detalhes.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge'});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),erros=[];page.on('pageerror',e=>erros.push(e.message));const BASE='http://localhost:9930/';
 await page.addInitScript(()=>{try{localStorage.removeItem('fin_receber_modo')}catch(_){}});
 await page.route(BASE+'**',route=>{const u=new URL(route.request().url()),file=path.join(process.cwd(),decodeURIComponent(u.pathname));if(u.pathname.endsWith('/Pedidos/pedido.html'))return route.fulfill({contentType:'text/html',body:'<p>Pedido</p>'});if(!fs.existsSync(file))return route.fulfill({status:404,body:''});const ext=path.extname(file);let body=fs.readFileSync(file);if(ext==='.html')body=body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');return route.fulfill({body,contentType:ext==='.html'?'text/html':ext==='.js'?'text/javascript':'text/plain'});});
 await page.goto(BASE+'Modulos/Comercial/ContasReceber/contas-receber.html');
 await page.evaluate(()=>{
  window.__CONTEXT={empresa_id:'e1'};window.aguardarContexto=async()=>{};window.__rpc=[];
  const base={recebido:0,componente:'locacao',parcela:1,parcelas:2,status:'aberto',status_comercial:'aprovado',conta_id:'k1',conta_nome:'Conta Locação',conta_doc:'12.***.***/0001-**',tipo_evento:'Casamento',data_evento:'2099-12-20',data_entrega:'2099-12-19',data_coleta:'2099-12-21',valor_pedido:300};
  const receber=[{...base,id:'t1',pedido_id:'p1',numero_pedido:'1',cliente_id:'c1',cliente_nome:'Cliente A',cliente_foto:'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',vencimento:'2001-01-01',valor:100,aberto:100,local_nome:'Local A'},
   {...base,id:'t2',pedido_id:'p1',numero_pedido:'1',cliente_id:'c1',cliente_nome:'Cliente A',parcela:2,vencimento:'2099-12-31',valor:200,aberto:200,local_nome:'Local A'},
   {...base,id:'t3',pedido_id:'p2',numero_pedido:'2',cliente_id:'c2',cliente_nome:'Cliente B',parcelas:1,componente:'frete',conta_id:null,conta_nome:null,vencimento:'2099-11-30',valor:50,aberto:50,local_nome:'Local B',valor_pedido:50}];
  const prev=[{pedido_id:'p9',pedido_numero:'9',cliente_nome:'Cliente C',situacao:'pre_reserva',pre_reserva_ate:'2099-10-01',data_evento:'2099-10-10',dia:'2099-09-01',valor:400,componente:'locacao',parcela:1,parcelas:1,sem_parcelas:false,valor_pedido:400}];
  const q=(rows)=>{const o={select:()=>o,in:()=>o,eq:()=>o,then:(ok,f)=>Promise.resolve({data:rows,error:null}).then(ok,f)};return o;};
  window.supabaseClient={rpc:async(nome,args)=>{__rpc.push({nome,args});return {data:nome==='comercial_contas_receber'?receber:nome==='comercial_recebimentos_previstos'?prev:null,error:null}},
   from:(t)=>q(t==='separacoes_pedidos'?[{id:'p9',cliente_id:'c9',local_nome:'Local C',tipo_evento:'Festa',data_evento:'2099-10-10'}]:[{id:'c9',catalogo_logo_url:null}])};
 });
 for(const file of ['styles/design-system.css','styles/abas-global.css','styles/tema-chiavari.css','Modulos/Financeiro/financeiro.css','Modulos/Comercial/ContasReceber/contas-receber.css'])await page.addStyleTag({content:fs.readFileSync(file,'utf8').replace(/@import[^;]+;/g,'')});
 for(const file of ['Modulos/Comercial/comercial-relatorios.js','Modulos/Comercial/ContasReceber/contas-receber.js'])await page.addScriptTag({url:BASE+file});
 await page.locator('#crConteudo article.fin-pedido').first().waitFor();
 // mesma tabela do Financeiro, agrupada por pedido
 assert.equal(await page.locator('#crConteudo article.fin-pedido').count(),2,'um bloco por pedido');
 const cab=await page.locator('#crConteudo article.fin-pedido').first().locator('thead th').allInnerTexts();
 assert.deepEqual(cab.map(s=>s.trim().toLowerCase()),['parcela','divisão','conta (cnpj · pix)','vencimento','valor','recebido','status','falta no pedido']);
 assert.equal(await page.locator('#crConteudo .fin-num-card').first().innerText(),'1');
 assert.equal(await page.locator('#crConteudo .fin-cli-foto img').count(),1,'foto do cliente');
 const txt=await page.locator('#crConteudo').innerText();
 assert.match(txt,/Conta Locação/);assert.match(txt,/Sem conta/);assert.match(txt,/vencido/i);
 assert.equal(await page.locator('#crContReceber').innerText(),'1','bolinha das vencidas');
 assert.equal(await page.locator('#crContPrevistos').innerText(),'1','bolinha amarela dos previstos');
 // por data
 await page.locator('#frModo').click();
 const cab2=await page.locator('#crConteudo .fin-receber-data thead th').allInnerTexts();
 assert.deepEqual(cab2.map(s=>s.trim().toLowerCase()),['vencimento','pedido','cliente','local','divisão','conta (cnpj · pix)','valor','status','falta no pedido','']);
 assert.equal(await page.locator('#crConteudo .fin-receber-data tbody tr').count(),3);
 // filtros e atalho de prazo
 await page.locator('#frBusca').fill('Cliente B');await page.locator('#frBusca').press('Enter');
 assert.equal(await page.locator('#crConteudo .fin-receber-data tbody tr').count(),1);
 await page.locator('#frBusca').fill('');await page.locator('#frBusca').press('Enter');
 await page.locator('[data-prazo="vencidos"]').click();assert.equal(await page.locator('#crConteudo .fin-receber-data tbody tr').count(),1);
 // recebimentos previstos
 await page.locator('[data-cr-aba="previstos"]').click();
 const cab3=await page.locator('#crConteudo .fin-previstos-tab thead th').allInnerTexts();
 assert.deepEqual(cab3.map(s=>s.trim().toLowerCase()),['vencimento','pedido','cliente','local','divisão','situação','valor','']);
 const t3=await page.locator('#crConteudo').innerText();assert.match(t3,/Cliente C/);assert.match(t3,/Local C/);assert.match(t3,/Pré-reserva/);
 assert.deepEqual(await page.evaluate(()=>__rpc.map(r=>r.nome).sort()),['comercial_contas_receber','comercial_recebimentos_previstos']);
 await page.locator('[data-cr-aba="receber"]').click();await page.locator('#frModo').click();
 await page.locator('[data-prazo="vencidos"]').click();
 await page.locator('#crConteudo article.fin-pedido').first().locator('a.fin-link-pag').click();await page.waitForURL('**/Pedidos/pedido.html?pedido=p1&modo=editar');
 assert.deepEqual(erros,[]);
 const menu=fs.readFileSync('js/ui/sidebarMenu.js','utf8');assert.match(menu,/rotulo: "Contas a receber", href: "Modulos\/Comercial\/ContasReceber\/contas-receber.html"/);
 console.log('OK - Contas a receber do Comercial com a mesma tabela do Financeiro (por pedido e por data), filtros, prazos e Recebimentos previstos.');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
