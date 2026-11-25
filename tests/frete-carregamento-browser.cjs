const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const html=fs.readFileSync('Modulos/Chiavari/Fretes/freteiro.html','utf8');
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
 assert.doesNotMatch(html,/frete_presenca|btnCheck|qrCaixa|registrarPeloLink/);
 const browser=await chromium.launch({channel:'msedge',headless:true});try{
  const page=await browser.newPage({viewport:{width:1400,height:850}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
  await page.setContent('<main id="plModuloFretes"></main><main id="plModuloFree"></main><main id="plModuloUber"></main>');
  await page.evaluate(()=>{
   window.aguardarContexto=async()=>({empresa_id:'emp'});window.EasyLocPermissions={hasPermission:()=>false};
   window.supabaseClient={rpc:async(n,a)=>{
    const servico={id:'a',pedido_id:'p',pedido:'13',cliente:'Evento',data:new Date().toISOString().slice(0,10),etapa:'Entrega',direcao:'entrega',quantidade:2,valor:310,ativo:true,
      linhas:[{nome:'Transportes Caminho Certo',confirmado:true,carregamentos:[{codigo:'TC',placa:'TCC4B56',em:'2026-11-23T11:00:00Z',expedidor:'João'}]}]};
    if(n==='logistica_fretes_anunciados')return {data:[servico,{...servico,id:'t',quantidade:1,linhas:[{nome:'Transportadora',situacao:'escalado',confirmado:true,carregamentos:[]}]},{...servico,id:'c',direcao:'coleta',etapa:'Coleta',quantidade:1}]};
    if(n==='logistica_anunciados')return {data:[{...servico,tipo:a.p_tipo,quantidade:1}]};
    return {data:[]};
   }};
  });
  await page.addStyleTag({path:path.resolve('Modulos/Logistica/PainelLogistico/painel-anunciados.css')});
  await page.addScriptTag({path:path.resolve('Modulos/Logistica/PainelLogistico/painel-anunciados.js')});
  await page.evaluate(()=>PainelAnunciados.abrir('frete'));
  assert.deepEqual(await page.locator('#plModuloFretes th').allTextContents(),['Etapa e horário','Programado','Confirmou','Carregamento','Decisão do caminhão','Valor sistema','Valor fornecedor','Valor final']);
  assert.equal(await page.locator('#plModuloFretes [data-qr]').count(),0);
  assert.match(await page.locator('#plModuloFretes').innerText(),/TC · TCC4B56/);
  assert.match(await page.locator('#plModuloFretes').innerText(),/João/);
  assert.match(await page.locator('#plModuloFretes').innerText(),/Sem registro/);
  assert.match(await page.locator('#plModuloFretes').innerText(),/Não se aplica/);
  assert.equal(await page.locator('#plModuloFretes tr.pla-aberta td').count(),7);
  await page.click('#plModuloFretes [data-periodo="realizados"]');
  await page.locator('#plModuloFretes .pla-carga').waitFor();
  for(const tipo of ['free','uber']){
   await page.evaluate(t=>PainelAnunciados.abrir(t),tipo);
   const host=tipo==='free'?'plModuloFree':'plModuloUber';
   assert.equal(await page.locator('#'+host+' th').count(),9);
   assert.equal(await page.locator('#'+host+' [data-qr]').count(),1);
  }
  fs.mkdirSync('outputs',{recursive:true});await page.locator('#plModuloFree').evaluate(e=>e.hidden=true);await page.locator('#plModuloUber').evaluate(e=>e.hidden=true);
  await page.screenshot({path:'outputs/frete-carregamento.png',fullPage:true});
  assert.deepEqual(erros,[]);console.log('frete-carregamento-browser: ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
