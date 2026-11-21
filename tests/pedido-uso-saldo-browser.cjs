const {chromium}=require('playwright'),express=require('express'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const app=express(),html=fs.readFileSync('Modulos/Comercial/Pedidos/pedido.html','utf8');
 const bloco=html.slice(html.indexOf('        <section class="finance-card pagamento-card'),html.indexOf('        <section class="contrato pedido-contrato-card'));
 const resumo=html.slice(html.indexOf('        <section class="finance-card resumo-card"'),html.indexOf('        <section class="finance-card logistica-card"'));
 app.get('/teste',(_,res)=>res.type('html').send(`<!doctype html><html><head><link rel="stylesheet" href="/styles/global.css"><link rel="stylesheet" href="/Modulos/Comercial/Pedidos/pedido.css"><link rel="stylesheet" href="/styles/pedido-pagamentos-responsivo.css"></head><body style="margin:0"><div class="pedido-screen"><input type="hidden" id="clienteIdHidden" value="c"><input id="clienteInput" hidden><div class="pedido-etapa-financeiro" style="display:grid">${bloco}<aside class="pedido-financeiro">${resumo}</aside></div></div><script type="module">
 window.__CONTEXT={empresa_id:'e'};window.__TOTAL_PEDIDO=10000;window.__PEDIDO_VALORES={locacao:9000,montagem:500,frete:500};
 window.__saldoServidor={bv:6060.94,credito:0};
 const q={select(){return this},eq(){return this},neq(){return this},then(r){r({data:[],error:null})}};
 window.supabaseClient={from:()=>q,rpc:async(n)=>({data:n==='pedido_saldo_conta_cliente'?window.__saldoServidor:{lancamentos:[]},error:null})};
 const {initPagamento}=await import('/js/pedido/pedido.pagamento.mjs');initPagamento();window.atualizarPagamento();window.__pronto=true;
 </script></body></html>`));
 app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1892,height:950}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/teste`);await page.waitForFunction(()=>window.__pronto&&document.querySelector('#pgResumoBV').textContent.includes('6.060,94'));
  await page.locator('#btnAdicionarAbatimento').click();assert.equal(await page.locator('#pagamentoAbatimentoCredito').isDisabled(),true);
  await page.locator('#pagamentoAbatimentoBV').fill('6061');await page.locator('#btnConfirmarAbatimento').click();assert.match(await page.locator('#pagamentoAbatimentoErro').innerText(),/BV insuficiente/);
  await page.locator('#pagamentoAbatimentoBV').fill('5000');await page.locator('#btnConfirmarAbatimento').click();
  assert.match(await page.locator('#pgResumoBV').innerText(),/1.060,94/);assert.match(await page.locator('#pagamentoAbatimentosAplicados').innerText(),/BV aplicado:.*5.000,00/s);
  assert.equal(await page.evaluate(()=>window.__pedidoColetarPagamentoConfig().usoSaldoConta),true);
  assert.equal(await page.locator('#pgValorFinal').textContent(),'R$\u00a05.000,00');
  assert.equal(await page.locator('#resumoTotalGeral').textContent(),'R$\u00a05.000,00','resumo atualiza sem salvar');
  assert.match(await page.locator('#resumoAbatimentoBV').innerText(),/-.*5.000,00/);
  assert.equal(await page.locator('#resumoAbatimentoCredito').isVisible(),false);
  await page.evaluate(async()=>{window.__PEDIDO_ATUAL_ID='p';window.__saldoServidor={bv:1060.94,credito:0,aplicacoes:[{pedido_id:'p',bv:5000,credito:0}]};await window.__pedidoAtualizarSaldoCliente();});
  assert.match(await page.locator('#pgResumoBV').innerText(),/1.060,94/);assert.match(await page.locator('#pagamentoAbatimentosAplicados').innerText(),/Uso registrado/);
  await page.evaluate(async()=>{window.__saldoServidor.credito=100.50;await window.__pedidoAtualizarSaldoCliente();});
  await page.locator('#btnAdicionarAbatimento').click();await page.locator('#pagamentoAbatimentoCredito').fill('100.50');await page.locator('#btnConfirmarAbatimento').click();
  assert.match(await page.locator('#pgResumoCredito').innerText(),/0,00/);assert.match(await page.locator('#pagamentoAbatimentosAplicados').innerText(),/Crédito aplicado:.*100,50/s);
  assert.equal(await page.locator('#pgValorFinal').textContent(),'R$\u00a04.899,50');
  assert.equal(await page.locator('#resumoTotalGeral').textContent(),'R$\u00a04.899,50');
  assert.match(await page.locator('#resumoAbatimentoCredito').innerText(),/-.*100,50/);
  const config=await page.evaluate(()=>window.__pedidoColetarPagamentoConfig());
  await page.evaluate(c=>window.__pedidoAplicarPagamentoConfig(c),config);assert.match(await page.locator('#pagamentoAbatimentosAplicados').innerText(),/100,50/,'restaura os abatimentos ao reabrir');
  for(const width of [1892,1600,1440,1000,760,390]){
   await page.setViewportSize({width,height:950});
   const medidas=await page.locator('.pg-card-tabela').evaluateAll(els=>els.map(el=>({largura:el.clientWidth,conteudo:el.scrollWidth,filhos:[...el.querySelectorAll('input,select,button')].filter(c=>!c.classList.contains('sr-only')).every(c=>{const r=c.getBoundingClientRect(),p=el.getBoundingClientRect();return r.width<1||r.right<=p.right+2&&r.left>=p.left-2;})})));
   assert.ok(medidas.every(m=>m.conteudo<=m.largura+2&&m.filhos),`sem barra/cortes em ${width}px: ${JSON.stringify(medidas)}`);
   if(width>=760){
    const linhas=await page.locator('tr.pg-linha').evaluateAll(rows=>rows.map(row=>[...row.cells].map(td=>Math.round(td.getBoundingClientRect().top))));
    assert.ok(linhas.every(tops=>Math.max(...tops)-Math.min(...tops)<=1),`parcela em uma linha em ${width}px: ${JSON.stringify(linhas)}`);
    assert.ok(await page.locator('.pg-vencimento').first().evaluate(el=>el.getBoundingClientRect().width<=119),'vencimento compacto');
    assert.ok(await page.locator('.pagamento-metodo-select').first().evaluate(el=>el.getBoundingClientRect().width<=113),'forma compacta');
   }
   if(width===1892)await page.screenshot({path:'.tmp/pedido-pagamentos-sem-barra.png'});
   if(width===390)await page.screenshot({path:'.tmp/pedido-pagamentos-celular.png'});
  }
  await page.setViewportSize({width:1440,height:950});await page.locator('[data-remover-abatimento="credito"]').click();assert.match(await page.locator('#pgResumoCredito').innerText(),/100,50/);
  assert.equal(await page.locator('#resumoTotalGeral').textContent(),'R$\u00a05.000,00','remover crédito restaura total');
  assert.equal(await page.locator('#resumoAbatimentoCredito').isVisible(),false);
  await page.evaluate(()=>{window.__TOTAL_PEDIDO=12000;window.__PEDIDO_VALORES.locacao=11000;window.atualizarPagamento();});
  assert.equal(await page.locator('#resumoTotalGeral').textContent(),'R$\u00a07.000,00','novo valor dos itens mantém o abatimento aplicado');
  assert.equal(await page.evaluate(()=>window.__TOTAL_PEDIDO),12000,'total base preservado para gravar');
  await page.locator('[data-remover-abatimento="bv"]').click();assert.equal(await page.locator('#resumoTotalGeral').textContent(),'R$\u00a012.000,00');
  assert.deepEqual(erros,[]);console.log('PASS - uso/limite/saldo zero/centavos/persistência e pagamentos sem rolagem horizontal');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
