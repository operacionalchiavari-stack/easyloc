const {chromium}=require('playwright'),express=require('express'),assert=require('node:assert/strict');
(async()=>{
 const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base||u.pathname.includes('/js/core/')||u.pathname.endsWith('estoque-cartelas.mjs'))return r.fulfill({body:'',contentType:'text/javascript'});return r.continue();});
  await page.addInitScript(()=>{
   window.lucide={createIcons(){}};window.__CONTEXT={empresa_id:'emp'};window.aguardarContexto=async()=>window.__CONTEXT;window.alerta=()=>{};window.calls=[];
   const config={categorias:['Pintura','Tecidos'],setores:['Almoxarifado','Forração'],custos:{custo_hora:30,margem:40,complexidades:{simples:0,media:20,alta:50}}};
   const banco={personalizacoes:[{id:'pers',tipo:'Pintura',alvo:'ITEM',vinculo_id:'bar',vinculo_nome:'Bar de pintura',tempo:2,custo_hora:30,complexidade:1.3,margem:40,status:'Ativo'}],itens:[{id:'bar',tipo:'Item',descricao_total:'Bar de pintura',foto_url:location.origin+'/slide1.jpg'}]};
   window.supabaseClient={from:t=>{let unico=false;const q={select:()=>q,eq:()=>q,order:()=>q,range:()=>q,in:()=>q,limit:()=>q,insert:p=>{window.calls.push({insert:t,p});return q;},update:()=>q,delete:()=>q,single:()=>{unico=true;return q;},maybeSingle:()=>{unico=true;return q;},then:ok=>Promise.resolve({data:unico?null:banco[t]||[],error:null}).then(ok)};return q;},rpc:async(name,args)=>{window.calls.push({name,args});return {data:name==='operacao_cadastros_config'?structuredClone(config):name==='producao_quadro'?{config:{dias:[],inicio:'08:00',fim:'18:00',pausa_inicio:'12:00',pausa_fim:'13:00',feriados:[],antecedencia_horas:8,responsaveis:{}}}:[],error:null};}};
  });
  await page.goto(base+'/Modulos/Estoque/Personalizacoes/estoque-personalizacoes.html');
  await page.locator('#btnAddPersonalizacao').click();await page.locator('#inpVinculoNome').fill('bar');
  const resultado=page.locator('#listaVinculos button');await resultado.waitFor();assert.equal(await resultado.locator('img').count(),1);await resultado.click();
  assert.equal(await page.locator('#inpVinculoNome').inputValue(),'Bar de pintura');
  assert.equal(await page.locator('#inpCustoHora').inputValue(),'R$ 30,00');
  await page.locator('#inpTipo').selectOption('Pintura');await page.locator('#inpTempo').fill('2');await page.locator('#inpComplexidade').selectOption('1.30');
  assert.match(await page.locator('#outPrecoSugerido').innerText(),/126,00/);
  await page.screenshot({path:'.tmp/personalizacao-custos.png',fullPage:true});
  await page.locator('#btnCancelar').click();await page.locator('#tbodyPersonalizacoes tr').first().click();assert.equal(await page.locator('#inpComplexidade').inputValue(),'1.30');assert.match(await page.locator('#outPrecoSugerido').innerText(),/126,00/);
  await page.goto(base+'/Modulos/Configuracoes/Parametros/parametros.html');
  const form=page.locator('form:has([data-adicionar])').filter({has:page.locator('[name=custo_hora]')});await form.waitFor({state:'attached'});
  await page.evaluate(()=>{document.querySelector('#pr-painel-almoxarifado').hidden=false;});
  await form.locator('[name=categoria]').fill('Ferragens');await form.locator('[data-adicionar]').click();
  await form.locator('[name=custo_hora]').fill('R$ 45,50');await form.locator('[name=alta]').fill('60');
  await form.locator('[type=submit]').click();
  const salvo=await page.evaluate(()=>window.calls.find(c=>c.name==='operacao_cadastros_salvar').args.p_config);
  assert.ok(salvo.categorias.includes('Ferragens'));assert.equal(salvo.custos.custo_hora,45.5);assert.equal(salvo.custos.complexidades.alta,60);
  assert.deepEqual(erros,[]);console.log('OK - busca com foto, preço por parâmetros, moeda e gravação de categorias e percentuais.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
