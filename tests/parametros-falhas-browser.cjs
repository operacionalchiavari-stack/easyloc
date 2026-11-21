const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge'});try{
 for(const tipo of ['catalogo','almoxarifado'])for(const modo of ['carga','rede']){
  const p=await browser.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.setContent(tipo==='catalogo'?'<form id="formCatalogoParametros"><div id="catalogoRecursos"></div><span id="catalogoParametrosStatus"></span><button id="btnSalvarCatalogo" type="submit">Salvar</button></form>':'<form id="formAlmoxParametros"><input id="almoxCompraAutomatica" type="checkbox"><input id="almoxEditaFinanceiro" type="checkbox"><span id="almoxParametrosStatus"></span><button id="btnSalvarAlmox" type="submit">Salvar</button></form>');
  await p.evaluate(({tipo,modo})=>{
   window.writes=0;window.alertas=[];window.aguardarContexto=async()=>({empresa_id:'e1'});window.alerta=t=>alertas.push(t);
   window.supabaseClient={from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>modo==='carga'?{error:{message:'Falha na leitura'}}:{data:null},upsert:async()=>{writes++;throw Error('Sem rede ao salvar');}};return q;},rpc:async(n)=>{if(n==='catalogo_decoradores_lista')return {data:[]};if(n==='almox_compra_config')return modo==='carga'?{error:{message:'Falha na leitura'}}:{data:{automatica:true}};writes++;throw Error('Sem rede ao salvar');}};
  },{tipo,modo});
  await p.addScriptTag({path:'Modulos/Configuracoes/Parametros/parametros-'+tipo+'.js'});
  const btn=p.locator('button');if(modo==='carga'){
   await p.waitForFunction(()=>document.querySelector('[id$=Status]').textContent.includes('carregar'));assert.equal(await btn.isDisabled(),true);await p.locator('form').evaluate(f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(await p.evaluate(()=>writes),0);
  }else{
   await p.waitForFunction(()=>!document.querySelector('button').disabled);await btn.click();await p.waitForFunction(()=>alertas.length===1);assert.equal(await btn.isDisabled(),false);assert.equal(await p.evaluate(()=>writes),1);
  }
  assert.deepEqual(errors,[]);await p.close();
 }
 const p=await browser.newPage();await p.setContent('<main></main>');await p.evaluate(()=>{window.supabaseClient={from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({error:{message:'Falha na leitura'}})};return q;}};window.EasyLocPermissions={hasPermission:()=>true};});
 await p.addScriptTag({path:'Modulos/Configuracoes/Parametros/parametros-divergencias.js'});
 await p.evaluate(async()=>{for(const fn of ['carregarParametrosDivergencias','carregarParametrosCarregamento','carregarParametrosAppMontador'])await window[fn](document.querySelector('main'),'e1');});assert.equal(await p.locator('main button:enabled').count(),0);assert.equal(await p.locator('main [role=status]').count(),3);
 await p.close();console.log('OK - falhas de carga não sobrescrevem parâmetros; falhas de rede liberam nova tentativa; regras operacionais ficam bloqueadas quando a leitura falha.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
