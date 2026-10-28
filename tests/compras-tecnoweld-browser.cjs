const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const path=require('node:path');
const {createDB}=require('./compras-fluxo-db.cjs');
(async()=>{
 const db=await createDB(),app=express();app.use(express.json());
 app.post('/__test/rpc',async(req,res)=>{try{const a=req.body;const r=await db.query('select compras_operar($1,$2,$3::jsonb) as data',[a.p_empresa,a.p_acao,JSON.stringify(a.p_dados)]);res.json({data:r.rows[0].data,error:null});}catch(e){res.json({data:null,error:{message:e.message}});}});
 app.get('/__test/table/:name',async(req,res)=>{if(!['fornecedores','insumos'].includes(req.params.name))return res.json({data:[],error:null});const r=await db.query('select * from '+req.params.name);res.json({data:r.rows,error:null});});
 app.use(express.static(path.resolve('.')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[],notices=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{notices.push(d.message());await d.dismiss();});
 await page.addInitScript(()=>{
  window.__CONTEXT={empresa_id:'10000000-0000-0000-0000-000000000001',usuario_id:'00000000-0000-0000-0000-000000000001'};
  window.aguardarContexto=async()=>window.__CONTEXT;window.alerta=(m)=>{window.__notices=window.__notices||[];window.__notices.push(m);};window.confirmarGlobal=async()=>true;
  window.lucide={createIcons(){}};
  window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'teste'}}})},rpc:async(name,args)=>name==='compras_pedido_pagamento'?(window.__pagamento=args,{data:{ok:true},error:null}):fetch('/__test/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)}).then(r=>r.json()),from(name){
   let single=false;const q={select(){return q;},eq(){return q;},single(){single=true;return q;},then(resolve,reject){
    if(name==='empresas')return Promise.resolve({data:{nome:'Empresa Teste',cnpj:'123'},error:null}).then(resolve,reject);
    return fetch('/__test/table/'+name).then(r=>r.json()).then(x=>{if(single)x.data=x.data[0];return x;}).then(resolve,reject);
   }};return q;
  }};
 });
 await page.route('**/*',r=>{
   const url=r.request().url();
   if(/\/js\/core\/(supabase|context|permissions|alerta)\.js/.test(url))return r.fulfill({contentType:'text/javascript',body:''});
   if(!url.startsWith('http://127.0.0.1:'))return r.fulfill({contentType:'text/javascript',body:''});
   return r.continue();
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Estoque/Compras/compras.html');
 await page.waitForFunction(()=>window.AcervoComprasAPI && window.AcervoComprasDocs);
 await page.evaluate(()=>document.fonts.ready);
 const headerTop=await page.locator('.compras-header').evaluate(el=>el.getBoundingClientRect().top);
 assert.ok(headerTop>=32,`Cabeçalho deve ter espaço acima: ${headerTop}px`);
 await page.evaluate(()=>{AcervoComprasDocs.previewQuotationRequest=async()=>{};AcervoComprasDocs.downloadPurchaseOrder=async()=>{};});
 await db.query("select compras_operar($1,'criar_necessidade',$2)",['10000000-0000-0000-0000-000000000001',{descricao_item:'Madeira',quantidade:4,unidade:'un'}]);await page.reload();
 await page.locator('[data-pv-tab="needs-avulsa"]').click();
 await page.locator('[data-link-material]').click();
 await page.locator('#purchaseLinkMaterial').selectOption('20000000-0000-0000-0000-000000000001');
 await page.getByRole('button',{name:'Vincular item',exact:true}).click();
 await page.locator('#needsAvulsaBody tr.pv-row-clickable').click();
 await page.locator('#quoteSelectedBtn').click();
 await page.locator('#quoteSupplierSearch').click();
 await page.locator('#quoteSupplierSearch').fill('Fornecedor');
 await page.locator('[data-supplier-option]').first().click();
 await page.locator('#quoteBuilderSubmit').click();
 await page.locator('[data-open-quotation]').click();
 await page.locator('[data-item-valor]').fill('25');await page.locator('#proposalFrete').fill('10');await page.locator('#proposalsSaveBtn').click();
 await page.locator('.pv-supplier-tab.is-answered').waitFor();
 await page.locator('[data-mode="compare"]').click();
 await page.locator('#proposalsGenerateBtn').click();
 await page.locator('[data-pv-tab="orders"]').click();
 await page.locator('#ordersBody tr[data-order-id]').click();
 await page.locator('#orderDetailDialog[open]').waitFor();assert.doesNotMatch(await page.locator('#orderDetailBody').innerText(),/certificado|informar lote/i);assert.equal(await page.locator('#certDialog,[data-lot-input],[data-attach-cert]').count(),0);assert.doesNotMatch(await page.locator('#ordersBody').locator('..').innerText(),/certificados/i);
 assert.ok((await page.locator('#orderDetailBody').innerText()).includes('Madeira'));
 assert.ok((await page.locator('#orderDetailFooterTotal').innerText()).includes('110,00'));
 assert.deepEqual(errors,[],errors.join('\n'));
 // valores e pagamento do pedido -> Contas a Pagar (out/2026)
 assert.ok(await page.locator('#orderDetailBody [data-payment]').isVisible());
 assert.equal(await page.inputValue('[data-payment-field="total"]'),'110');
 await page.fill('[data-payment-field="n"]','2');
 await page.locator('[data-payment-split]').click();
 assert.equal(await page.locator('[data-payment-row]').count(),2);
 await page.selectOption('[data-payment-field="forma"]','pix');
 await page.fill('[data-payment-row="1"] [data-payment-part="valor"]','10');
 assert.match(await page.locator('[data-payment-sum]').innerText(),/diferente do total/);
 await page.fill('[data-payment-row="1"] [data-payment-part="valor"]','55');
 await page.locator('[data-payment-send]').click();
 await page.waitForFunction(()=>window.__pagamento);
 const pag=await page.evaluate(()=>window.__pagamento);
 assert.equal(pag.p_forma,'pix');assert.equal(pag.p_total,110);assert.equal(pag.p_parcelas.length,2);assert.deepEqual(pag.p_parcelas.map(p=>p.valor),[55,55]);
 assert.ok(/\d{4}-\d{2}-\d{2}/.test(pag.p_parcelas[1].vencimento));
 assert.match(await page.locator('#orderDetailBody').innerHTML(),/aba=recebimento/);
 await page.screenshot({path:'outputs/compras-tecnoweld-pedido.png'});
 await page.locator('#orderDetailDialog').getByRole('button',{name:'Fechar',exact:true}).click();
 await page.screenshot({path:'outputs/compras-tecnoweld.png'});
 console.log('OK - interface Tecnoweld usa o banco Acervo: necessidade, vínculo, cotação, fornecedor, proposta, comparativo e pedido');
 }finally{await browser.close();server.close();await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
