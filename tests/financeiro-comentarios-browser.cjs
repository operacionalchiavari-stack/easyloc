const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),express=require('express'),{chromium}=require('playwright');
// API e dados isolados. A navegação usa o HTML, os controladores e a tabela compartilhada reais.
(async()=>{
 const app=express();app.use(express.json());const hoje=new Date().toLocaleDateString('sv-SE');
 const base={empresa_id:'e1',valor:100,aberto:100,pago:0,recebido:0,vencimento:hoje,emissao:hoje,parcela:1,parcelas:1,status:'pendente',categoria_id:'cat',fornecedor_id:'f1',fornecedor_nome:'Fornecedor de cadeiras',conta_id:'c1',origem_id:'pc1',compra_numero:1,conta_nome:'Banco Compras',categoria_nome:'Materiais',aprovacao:'nao_requerida'};
 const banco={fin_pagar:[{...base,id:'p1',origem:'compra',descricao:'Cadeiras para o acervo'},
  {...base,id:'p2',origem:'manual',descricao:'Despesa administrativa'},
  {...base,id:'p3',origem:'compra',descricao:'Compra no cartão',fatura_id:'fat1',cartao_id:'cart1',cartao_nome:'Cartão Compras'},
  {...base,id:'p4',origem:'manual',descricao:'Outra compra da fatura',fatura_id:'fat1',cartao_id:'cart1',valor:900,aberto:900},
  {...base,id:'p5',origem:'compra',descricao:'Compra já paga',status:'pago',pago:100,aberto:0}],
  fin_receber:[{...base,id:'r1',status:'aberto',origem:'manual',grupo:'r1',componente:'outro',descricao:'Recebimento de teste',cliente_nome:'Cliente Teste',numero_pedido:null}],
  fin_contas:[{id:'c1',empresa_id:'e1',nome:'Banco Compras',ativo:true}],fin_categorias:[{id:'cat',nome:'Materiais',tipo:'saida',ativo:true}],fin_config:[],fin_centros_custo:[],
  fornecedores:[{id:'f1',nome_razao_social:'Fornecedor de cadeiras'}],clientes_empresas:[],fin_cartoes:[{id:'cart1',nome:'Cartão Compras'}],fin_cartao_faturas:[{id:'fat1',cartao_id:'cart1',vencimento:hoje}]};
 let writes=[],falhar=false;
 app.get('/__dados/:t',(req,res)=>res.json({data:banco[req.params.t]||[],error:null}));
 app.post('/__rpc/:n',(req,res)=>{
  const a=req.body,n=req.params.n;
  if(n==='fin_titulo_comentar'){
   if(falhar)return res.json({error:{message:'Falha simulada ao salvar.'}});
   const t=(a.p_tipo==='receber'?banco.fin_receber:banco.fin_pagar).find(t=>t.id===a.p_id);
   if((t.comentario_em||null)!==a.p_versao)return res.json({error:{message:'Comentário alterado por outra pessoa.'}});
   const texto=a.p_texto.trim(),dados={comentario:texto||null,comentario_por:texto?'u1':null,comentario_nome:texto?'Ana Teste':null,comentario_em:texto?new Date().toISOString():null};
   Object.assign(t,dados);writes.push(a);return res.json({data:dados,error:null});
  }
  res.json({data:n==='compras_contas_pagar'?banco.fin_pagar.filter(t=>t.origem==='compra'):n==='comercial_contas_receber'?banco.fin_receber:[],error:null});
 });
 const permitidos=new Set(['financeiro-comentarios.js','financeiro-pagar-lista.js','financeiro.js','contas-receber.js','comercial-relatorios.js','compras.js','compras-contas-pagar.js']);
 app.use((req,res,next)=>{
  if(!req.path.endsWith('.html'))return next();
  const file=path.join(process.cwd(),req.path);if(!fs.existsSync(file))return next();
  const html=fs.readFileSync(file,'utf8').replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi,(tag,attr)=>{const src=attr.match(/src="([^"]+)"/);return src&&permitidos.has(path.basename(src[1].split('?')[0]))?tag:'';});
  res.type('html').send(html);
 });app.use(express.static(process.cwd()));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),erros=[];
  await context.route('https://**',r=>r.abort());
  await context.addInitScript(()=>{
   window.__CONTEXT={empresa_id:'e1',usuario_id:'u1'};window.aguardarContexto=async()=>window.__CONTEXT;window.lucide={createIcons(){}};window.alerta=()=>{};
   window.AcervoComprasAuth={ready:Promise.resolve()};
   window.AcervoComprasAPI={listSuppliers:async()=>[],getPcpParameters:async()=>({}),listSupplierQualityIndex:async()=>[],listPurchaseNeeds:async()=>[],listQuotationRequests:async()=>[],listPurchaseOrdersV2:async()=>[],listNeedsInOpenQuotation:async()=>new Map(),listPurchaseCompositionQuotes:async()=>[]};
   const query=t=>{let single=false;const filters=[];const q={select:()=>q,order:()=>q,range:()=>q,not:()=>q,limit:()=>q,eq:(k,v)=>{filters.push([k,v]);return q;},in:()=>q,maybeSingle:()=>{single=true;return q;},then:(ok,fail)=>fetch('/__dados/'+t).then(r=>r.json()).then(r=>{r.data=r.data.filter(x=>filters.every(([k,v])=>!(k in x)||x[k]===v));if(single)r.data=r.data[0]||null;return r;}).then(ok,fail)};return q;};
   window.supabaseClient={from:query,rpc:async(n,a)=>fetch('/__rpc/'+n,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(a)}).then(r=>r.json())};
  });
  const baseUrl='http://127.0.0.1:'+server.address().port,fin=await context.newPage(),com=await context.newPage(),comp=await context.newPage();
  for(const p of [fin,com,comp])p.on('pageerror',e=>erros.push(e.message));
  await fin.goto(baseUrl+'/Modulos/Financeiro/financeiro.html?aba=receber');await fin.locator('[data-fin-com="receber:r1"]').waitFor();
  await com.goto(baseUrl+'/Modulos/Comercial/ContasReceber/contas-receber.html');await com.locator('[data-fin-com="receber:r1"]').waitFor();
  const editar=async(p,key,texto)=>{await p.locator('[data-fin-com="'+key+'"]').click();await p.locator('.fin-com-ed textarea').fill(texto);await p.locator('[data-com-ok]').click();await p.locator('.fin-com-ed').waitFor({state:'detached'});};
  await editar(fin,'receber:r1','Cliente pediu prazo. <script>erro()</script>\nConferir amanhã.');
  await com.locator('[data-fin-com="receber:r1"].tem').waitFor();await com.locator('[data-fin-com="receber:r1"]').hover();
  assert.match(await com.locator('.fin-com-card').innerText(),/Cliente pediu prazo/);assert.match(await com.locator('.fin-com-card').innerText(),/Ana Teste/);assert.equal(await com.locator('.fin-com-card script').count(),0);
  await editar(com,'receber:r1','Prazo confirmado pelo Comercial.');
  await fin.locator('[data-fin-com="receber:r1"]').click();assert.equal(await fin.locator('.fin-com-ed textarea').inputValue(),'Prazo confirmado pelo Comercial.');
  await fin.locator('.fin-com-ed textarea').fill('Rascunho não salvo');await fin.locator('[data-com-x]').click();assert.equal(writes.length,2);
  await com.locator('#frModo').click();assert.equal(await com.locator('[data-fin-com="receber:r1"].tem').count(),1);
  await fin.locator('[data-aba="pagar"]').click();await fin.locator('[data-fin-com="pagar:p1"]').waitFor();await editar(fin,'pagar:p1','Aguardando boleto do fornecedor.');
  await comp.goto(baseUrl+'/Modulos/Estoque/Compras/compras.html');await comp.locator('[data-pv-tab="contas-pagar"]').click();await comp.locator('[data-fin-com="pagar:p1"].tem').waitFor();
  assert.equal(await comp.locator('[data-fin-com="pagar:p2"]').count(),0);assert.doesNotMatch(await comp.locator('#purchasePayablesList').innerText(),/Despesa administrativa|Outra compra da fatura/);
  assert.equal(await comp.locator('#fpNovo').count(),0);assert.equal(await comp.locator('[data-p-baixar],[data-p-aprovar]').count(),0);
  assert.equal(await comp.locator('.pv-search-box').isVisible(),false,'a aba usa a busca da tabela financeira');
  await comp.locator('[data-p-linha="p1"] td').first().click();await comp.locator('dialog.fin-modal').waitFor();assert.match(await comp.locator('dialog.fin-modal').innerText(),/PC-000001/);await comp.locator('[data-cp-fechar]').click();
  const cab=p=>p.locator('.fin-tabela').first().locator('thead th').allTextContents();assert.deepEqual(await cab(comp),await cab(fin));
  await editar(comp,'pagar:p1','Boleto chegou pelo Compras.');await fin.locator('[data-fin-com="pagar:p1"]').click();assert.equal(await fin.locator('.fin-com-ed textarea').inputValue(),'Boleto chegou pelo Compras.');await fin.locator('[data-com-x]').click();
  await comp.locator('[data-fat-linha="fat1"]').click();assert.equal(await comp.locator('.fin-fech-comp [data-p-linha]').count(),1);assert.doesNotMatch(await comp.locator('.fin-fech-comp').innerText(),/Outra compra da fatura/);await editar(comp,'pagar:p3','Conferir esta compra no cartão.');assert.ok(await comp.locator('.fin-fech-comp').isVisible(),'salvar comentário mantém fatura aberta');
  await comp.locator('#fpPagas').click();assert.equal(await comp.locator('[data-fin-com="pagar:p5"]').count(),1);await comp.locator('#fpPagas').click();
  await comp.locator('#fpBusca').fill('Cadeiras');await comp.locator('#fpBusca').press('Enter');assert.equal(await comp.locator('#purchasePayablesList [data-p-linha]').count(),1);
  falhar=true;await comp.locator('[data-fin-com="pagar:p1"]').click();await comp.locator('.fin-com-ed textarea').fill('Tentativa');await comp.locator('[data-com-ok]').click();await comp.getByText('Falha simulada ao salvar.').waitFor();assert.ok(await comp.locator('[data-com-ok]').isEnabled());assert.equal(banco.fin_pagar[0].comentario,'Boleto chegou pelo Compras.');falhar=false;await comp.locator('[data-com-x]').click();
  await comp.locator('[data-fin-com="pagar:p1"]').click();await comp.locator('[data-com-del]').click();await comp.locator('.fin-com-ed').waitFor({state:'detached'});await fin.locator('[data-fin-com="pagar:p1"]:not(.tem)').waitFor();assert.equal(banco.fin_pagar[0].comentario,null);
  await comp.setViewportSize({width:390,height:844});await comp.locator('[data-fin-com="pagar:p1"]').click();await comp.locator('.fin-com-ed textarea').fill('Comentário no celular');await comp.locator('.fin-com-ed textarea').press('Control+Enter');await comp.locator('.fin-com-ed').waitFor({state:'detached'});await comp.locator('[data-fin-com="pagar:p1"]').focus();const tooltip=await comp.locator('.fin-com-card').boundingBox();assert.ok(tooltip.x>=0&&tooltip.x+tooltip.width<=390);
  fs.mkdirSync('.tmp',{recursive:true});await comp.screenshot({path:'.tmp/compras-contas-pagar-celular.png',fullPage:true});
  await comp.setViewportSize({width:1440,height:1000});await comp.locator('[data-fin-com="pagar:p1"]').click();await comp.screenshot({path:'.tmp/compras-contas-pagar-comentario.png',fullPage:true});
  assert.deepEqual(erros,[]);assert.ok(writes.every(w=>w.p_empresa==='e1'));console.log('OK: comentários Financeiro/Comercial/Compras, sincronização entre abas, persistência, apagar/cancelar/erro, fatura limitada às compras, filtros, teclado e celular.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
