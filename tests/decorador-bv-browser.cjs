const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = 'http://acervo.teste/';
(async () => {
  const browser = await chromium.launch({ channel:'msedge', headless:true });
  try {
    const page = await browser.newPage({ viewport:{ width:1440,height:1000 } });
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(() => {
      window.__CONTEXT={empresa_id:'e1'};window.aguardarContexto=async()=>window.__CONTEXT;
      window.hasPermission=()=>true;window.alerta=()=>{};window.lucide={createIcons(){}};
      const cliente={id:'c1',empresa_id:'e1',nome_razao:'Decoradora BV',catalogo_logo_url:'https://fixture/decoradora.png',bv_recebe:true,bv_percentual:10,bv_vigente_desde:'2026-10-21T12:00:00Z',status:'Ativo'};
      const titulo={id:'t1',empresa_id:'e1',origem:'bv',fornecedor_nome:'Decoradora BV',descricao:'BV Pedido 2123',valor:1000,pago:400,aberto:600,status:'parcial',vencimento:'2026-10-25',parcela:1,parcelas:1};
      const pedido={id:'p1',numero_pedido:'2123',cliente_id:'c1',cliente_nome:'Decoradora BV',data_evento:'2026-10-25',status_comercial:'aprovado',base_locacao:10000,percentual:10,valor:1000,pago:400,saldo:600,pagar_id:'t1',ativo:true,registro:'registrado'};
      const banco={clientes_empresas:[cliente],fin_pagar:[titulo],fin_contas:[{id:'b1',nome:'Banco teste',ativo:true}],fin_receber:[]};
      window.supabaseClient={from(t){let single=false,linhas=banco[t]||[];const q={select(){return q},eq(k,v){linhas=linhas.filter(l=>String(l[k])===String(v));return q},order(){return q},range(){return q},limit(){return q},in(){return q},single(){single=true;return q},maybeSingle(){single=true;return q},then(ok,fail){return Promise.resolve({data:single?linhas[0]||null:linhas,error:null}).then(ok,fail)}};return q},async rpc(n,args){
        if(n==='fin_bv_extrato' || n==='fin_conta_cliente_extrato')return {data:{clientes:[cliente],pedidos:[pedido],creditos:[{id:'cred1',fornecedor_id:'c1',fornecedor_nome:'Decoradora BV',emissao:'2026-10-21',descricao:'Pagamento a maior',valor:200,pago:50,aberto:150,status:'parcial',observacoes:'Excedente no pedido'}],pagamentos:[{id:'z1',data:'2026-10-21',cliente_nome:'Decoradora BV',numero_pedido:'2123',valor:400,liquido:400,conta:'Banco teste',forma:'PIX'}]}};
        if(n==='pedido_saldo_conta_cliente')return {data:{bv:600,credito:150,total:750}};
        if(n==='obter_acesso_catalogo')return {data:{}};
        return {data:[],error:null};
      }};
    });
    await page.route('**/*',route=>{
      const url=route.request().url();if(url==='https://fixture/decoradora.png')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==','base64')});if(!url.startsWith(base))return route.fulfill({body:'',contentType:'text/javascript'});
      const filename=path.join(process.cwd(),decodeURIComponent(new URL(url).pathname));
      if(!fs.existsSync(filename))return route.fulfill({status:404,body:''});
      if(url.includes('/js/core/')&&!url.includes('/campoProtegido.js'))return route.fulfill({body:'',contentType:'text/javascript'});
      let body=fs.readFileSync(filename);
      if(filename.endsWith('pedido.html')) {
        body=body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
        body=body.replace('</body>',`<script type="module">import {iniciarEntradaComercial} from '/js/pedido/pedido.entrada.mjs';iniciarEntradaComercial(document.createElement('div'));import {initPagamento} from '/js/pedido/pedido.pagamento.mjs';initPagamento();</script></body>`);
      }
      return route.fulfill({body,contentType:filename.endsWith('.html')?'text/html':filename.endsWith('.css')?'text/css':'text/javascript'});
    });
    await page.goto(base+'Modulos/Financeiro/financeiro.html?aba=bv');
    await page.waitForSelector('[data-bv-cliente]');
    assert.match(await page.locator('#finConteudo').innerText(),/10\.000,00/);
    assert.match(await page.locator('#finConteudo').innerText(),/1\.000,00/);
    await page.fill('[data-bv-cliente]','Decoradora');
    await page.locator('[data-bv-cliente]').press('Enter');
    await page.waitForSelector('[data-p-baixar="t1"]');
    await page.waitForFunction(()=>document.querySelector('.fin-bv-conta img')?.complete && document.querySelector('.fin-bv-conta img').naturalWidth>0);
    assert.equal(await page.locator('.fin-bv-intro').count(),0);
    assert.equal(await page.locator('.fin-bv-conta [data-bv-inicio]').count(),1);
    assert.equal(await page.locator('.fin-bv-conta [data-bv-cliente]').inputValue(),'Decoradora BV');
    await page.screenshot({path:'tests/bv-financeiro-compacto-preview.png',fullPage:true});
    assert.match(await page.locator('[data-bv-saldo-total]').innerText(),/750,00/);
    await page.click('[data-cliente-credito]');
    await page.waitForSelector('#finModal[open]');
    assert.match(await page.locator('#finModal').innerText(),/Registrar cr/);
    await page.click('#finModal [data-fechar]');
    await page.click('[data-p-baixar="t1"]');
    await page.waitForSelector('#finModal[open]');
    assert.match(await page.locator('#finModal').innerText(),/600,00/);
    await page.screenshot({path:'tests/bv-financeiro-preview.png',fullPage:true});
    await page.goto(base+'Modulos/Comercial/CadastroClientes/cadastro-clientes.html');
    await page.waitForFunction(()=>typeof window.clientes_openAdd==='function');
    await page.evaluate(()=>window.clientes_abrirDetalhesPorIdOuNome({id:'c1'}));
    await page.waitForSelector('#modal:not(.hidden)');
    assert.equal(await page.inputValue('#clienteBvRecebe'),'true');
    assert.equal(await page.inputValue('#clienteBvPercentual'),'10');
    await page.click('.edit-btn');
    await page.selectOption('#clienteBvRecebe','true');await page.fill('#clienteBvPercentual','15');
    assert.equal(await page.inputValue('#clienteBvPercentual'),'15');
    await page.goto(base+'Modulos/Comercial/Pedidos/pedido.html');
    await page.waitForSelector('.ct-depois [data-etapa="lista"]');
    await page.click('.ct-depois [data-etapa="lista"]');
    assert.equal(await page.locator('[aria-invalid="true"]').count(),7);
    assert.equal(await page.locator('.pedido-campo-erro').count(),7);
    await page.waitForFunction(()=>getComputedStyle(document.getElementById('dataEntrega')).borderTopColor==='rgb(220, 38, 38)',null,{timeout:5000});
    await page.fill('#dataEvento','2026-11-11');await page.locator('#dataEvento').dispatchEvent('change'); // entrega só libera depois do evento
    await page.fill('#dataEntrega','2026-11-10');
    assert.equal(await page.locator('#dataEntrega').getAttribute('aria-invalid'),null);
    assert.equal(await page.locator('#erro-dataEntrega').count(),0);
    assert.equal(await page.locator('[aria-invalid="true"]').count(),5);
    await page.evaluate(()=>{document.getElementById('clienteIdHidden').value='c1';return window.__pedidoAtualizarSaldoCliente();});
    assert.match(await page.locator('#pgResumoCredito').textContent(),/150,00/);
    assert.match(await page.locator('#pgResumoBV').textContent(),/600,00/);
    assert.equal(await page.inputValue('#pagamentoCreditoCliente'),'0');
    await page.screenshot({path:'tests/pedido-campos-obrigatorios-preview.png',fullPage:true});
    await page.fill('#clienteInput','Decoradora BV');await page.fill('#localInput','Local teste');
    await page.fill('#dataEvento','2026-11-11');await page.fill('#dataColeta','2026-11-12');await page.fill('#horaEntrega','08:00');await page.fill('#horaColeta','09:00');
    await page.evaluate(()=>{window.__TOTAL_PEDIDO=1500;window.__PEDIDO_VALORES={locacao:1000,montagem:300,frete:200,total:1500};window.atualizarPagamento();});
    await page.click('.ct-depois [data-etapa="financeiro"]');
    assert.equal(await page.locator('.pg-componente-card').count(),3);
    assert.deepEqual(await page.locator('.pg-componente-card').evaluateAll(cards=>cards.map(c=>c.dataset.componente)),['locacao','montagem','frete']);
    const montagem=page.locator('.pg-componente-card[data-componente="montagem"]');
    assert.equal(await montagem.locator('tr.pg-linha').count(),1);
    await montagem.locator('[data-pg-add]').click();
    assert.equal(await montagem.locator('tr.pg-linha').count(),2);
    assert.equal(await page.locator('.pg-componente-card[data-componente="frete"] tr.pg-linha').count(),1);
    await montagem.locator('tr.pg-linha').last().locator('[data-pg-action="remove"]').click();
    assert.equal(await montagem.locator('tr.pg-linha').count(),1);
    await page.screenshot({path:'tests/pedido-financeiro-tres-cards-preview.png',fullPage:true});

    assert.deepEqual(errors,[]);
    console.log('OK: extrato e pagamento BV, cadastro individual e campos obrigatorios em vermelho.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
