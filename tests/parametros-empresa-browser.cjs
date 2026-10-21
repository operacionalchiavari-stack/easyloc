const {chromium}=require('playwright');
const express=require('express');
const assert=require('node:assert/strict');
const fs=require('node:fs');

(async()=>{
  const app=express();app.use(express.static(process.cwd()));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      window.__writes=[];
      const banco={
        empresas:[{id:'e1',nome:'Empresa teste',razao_social:'Empresa Ltda',cnpj:'123',simples_nacional:'Sim',aliquota_iss:2,aliquota_ir:1}],
        empresas_configuracoes:[{empresa_id:'e1',frete_minimo:100,frete_maximo:1000,montagem_minima:200,montagem_maxima:2000,diaria_montador:150}],
        empresa_financeiro:[{empresa_id:'e1',absorcao_frete_percent:10,absorcao_montagem_percent:15}],
        configuracoes_empresa:[],empresa_logistica_regras:[],categorias_caminhao:[],categorias_montagem:[],servicos_adicionais:[]
      };
      window.supabaseClient={from(tabela){
        let linhas=banco[tabela]||[],single=false;
        const q={select(){return q},eq(k,v){linhas=linhas.filter(l=>String(l[k])===String(v));return q},order(){return q},limit(){return q},single(){single=true;return q},maybeSingle(){single=true;return q},
          update(payload){window.__writes.push({tabela,payload});return q},upsert(payload){window.__writes.push({tabela,payload});return q},insert(payload){window.__writes.push({tabela,payload});return q},delete(){return q},
          then(ok,fail){return Promise.resolve({data:single?(linhas[0]||null):linhas,error:null}).then(ok,fail)}};return q;
      },rpc:async()=>({data:{usuarios_ativos:2},error:null}),storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}})})}};
      window.__CONTEXT={empresa_id:'e1'};window.aguardarContexto=async()=>window.__CONTEXT;
      window.google={maps:{places:{Autocomplete:class{addListener(){} unbindAll(){}}}}};
    });
    await page.route('https://**/*',r=>r.fulfill({contentType:'text/javascript',body:''}));
    await page.route('**/js/core/context.js*',r=>r.fulfill({contentType:'text/javascript',body:''}));
    await page.route('**/js/core/permissions.js*',r=>r.fulfill({contentType:'text/javascript',body:''}));
    await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Configuracoes/Parametros/parametros.html');
    await page.waitForFunction(()=>!document.getElementById('salvarEmpresaParametros').disabled);
    assert.equal(await page.locator('#empresaNomeInput').inputValue(),'Empresa teste');
    assert.equal(await page.locator('[data-parametro-aba]').count(),7);
    await page.locator('#empresaNomeInput').fill('Empresa atualizada');
    await page.locator('#salvarEmpresaParametros').click();
    await page.waitForFunction(()=>document.getElementById('empresaParametrosStatus').textContent==='Parâmetros salvos.');
    const abrir=async nome=>{await page.locator('[data-parametro-aba="'+nome+'"]').click();await page.locator('#pr-painel-'+nome).waitFor({state:'visible'});};
    await abrir('tributacao');await page.locator('#aliquotaIssInput').fill('3');await page.locator('#salvarEmpresaParametros').click();
    await page.waitForFunction(()=>window.__writes.some(w=>w.payload.aliquota_iss===3));
    await abrir('logistica');assert.equal(await page.locator('#freteMinimoInput').inputValue(),'100');
    assert.equal(await page.locator('#logRegCarregamento').count(),0,'regras operacionais sem duplicação');
    await page.locator('#freteMinimoInput').fill('125');await page.locator('#salvarEmpresaParametros').click();
    await page.waitForFunction(()=>window.__writes.some(w=>w.tabela==='empresas_configuracoes'&&w.payload.frete_minimo===125));
    await abrir('financeiro');await page.locator('#financeiroAbsorcaoFrete').fill('12');await page.locator('#salvarEmpresaParametros').click();
    await page.waitForFunction(()=>window.__writes.some(w=>w.tabela==='empresa_financeiro'&&w.payload.absorcao_frete_percent===12));
    await abrir('comercial');
    await page.locator('#btnAdicionarServico').click();
    await page.locator('.svc-nome').fill('Serviço teste');
    await page.locator('#salvarEmpresaParametros').click();
    await page.waitForFunction(()=>window.__writes.some(w=>w.tabela==='servicos_adicionais'));
    await page.waitForFunction(()=>!document.getElementById('salvarEmpresaParametros').disabled);
    await page.locator('#salvarEmpresaParametros').click();
    await page.waitForFunction(()=>window.__writes.filter(w=>w.tabela==='servicos_adicionais').length===2);
    const servicos=await page.evaluate(()=>window.__writes.filter(w=>w.tabela==='servicos_adicionais'));
    assert.ok(Array.isArray(servicos[0].payload));
    assert.ok(!Array.isArray(servicos[1].payload),'salvar novamente atualiza o serviço existente');
    await abrir('identidade');
    assert.equal(await page.locator('#pr-painel-identidade input[type="color"]').count(),2,'somente menu e botões são editáveis');
    await page.locator('#identidadeCorMenu').evaluate(el=>{el.value='#123456';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.locator('#identidadeCorBotoes').evaluate(el=>{el.value='#246b48';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-preview-button]')).backgroundColor==='rgb(36, 107, 72)');
    assert.equal(await page.locator('[data-preview-sidebar]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(18, 52, 86)');
    assert.equal(await page.locator('[data-preview-button]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(36, 107, 72)');
    assert.equal(await page.locator('[data-preview-bg]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(243, 245, 246)');
    await page.locator('#salvarEmpresaParametros').click();
    await page.waitForFunction(()=>window.__writes.some(w=>w.tabela==='configuracoes_empresa'));
    const identidade=await page.evaluate(()=>window.__writes.find(w=>w.tabela==='configuracoes_empresa').payload);
    assert.equal(identidade.cor_sidebar,'#123456');
    assert.equal(identidade.cor_destaque,'#246b48');
    assert.equal(identidade.cor_fundo,'#f3f5f6');
    await page.mouse.move(0,0);
    await page.waitForFunction(()=>getComputedStyle(document.getElementById('salvarEmpresaParametros')).backgroundColor==='rgb(36, 107, 72)');
    assert.equal(await page.locator('#salvarEmpresaParametros').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(36, 107, 72)');
    await abrir('operacao');
    await page.locator('#btnSalvarParametros').click();
    await page.waitForFunction(()=>window.__writes.some(w=>w.tabela==='empresa_logistica_regras'));
    await abrir('dados');assert.equal(await page.locator('#empresaNomeInput').inputValue(),'Empresa atualizada');
    assert.deepEqual(errors,[]);
    assert.ok(!fs.readFileSync('dashboard.html','utf8').includes('Editar empresa'));
    assert.ok(!fs.readFileSync('dashboard.html','utf8').includes('empresa.modal.js'));
    console.log('OK — sete abas em Parâmetros, dados, tributação, logística, financeiro e operação salvos; modal antigo removido');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
