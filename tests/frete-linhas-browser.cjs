const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1860,height:900}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
 await page.setContent('<main id="plModuloFretes"></main>');
 await page.evaluate(()=>{
  window.__calls=[];window.aguardarContexto=async()=>({empresa_id:'emp'});window.EasyLocPermissions={hasPermission:()=>true};
  const programado={id:'p',transportadora:'Transportes Caminho Certo',nome:'Mercedes Accelo · TCC4B56'};
  const cargas=[1,2,3].map(n=>({id:'c'+n,transportadora:'Transportadora '+n,nome:'Caminhão '+n,em:'2026-11-23T11:00:00Z',expedidor:'João Expedidor'}));
  window.__servicos=cargas.map((c,i)=>({id:i?null:'a',pedido_id:'pedido',pedido:'31',cliente:'Kelly Khawam',local:'Vale dos Desejos',data:'2026-11-27',direcao:'entrega',etapa:i?'Entrega · extra':'Entrega',quantidade:1,valor:i?null:310,
   linhas:[{chave:i?'carga:'+c.id:'anuncio:a',versao:'v'+i,tipo_linha:i?'extra':'substituicao',nome:programado.transportadora,detalhe:programado.nome,programado:i?null:programado,
    confirmado:!i,carregamentos:[c],carregamentos_opcoes:i?[c]:cargas,cobrancas:[],cobranca:null,valor_sistema:i?100*i:310}]}));
  window.supabaseClient={rpc:async(n,a)=>{
   __calls.push({n,a});if(n==='logistica_frete_conferir'){const l=__servicos.flatMap(s=>s.linhas).find(l=>l.chave===a.p_chave);l.conferencia={caminhao_id:a.p_caminhao,valor_final:a.p_valor,motivo:a.p_motivo,decidido_nome:'Maria',decidido_em:'2026-11-23T12:00:00Z'};}
   return {data:n==='logistica_fretes_anunciados'?__servicos:[]};
  }};
 });
 await page.addStyleTag({path:path.resolve('Modulos/Logistica/PainelLogistico/painel-anunciados.css')});await page.addScriptTag({path:path.resolve('Modulos/Logistica/PainelLogistico/painel-anunciados.js')});await page.evaluate(()=>PainelAnunciados.abrir('frete'));
 assert.equal(await page.locator('tbody tr').count(),3);assert.equal(await page.getByText('Frete extra',{exact:true}).count(),2);
 assert.equal(await page.getByText('Substituindo o programado',{exact:true}).count(),1);
 for(const tr of await page.locator('tbody tr').all())assert.equal(await tr.locator('.pla-carga').count(),1);
 assert.deepEqual(await page.locator('.pla-carga .pla-caminhao strong').allTextContents(),['Transportadora 1','Transportadora 2','Transportadora 3']);
 assert.match(await page.locator('.pla-chip').innerText(),/1 de 1/,'extras não contam como vagas aguardando confirmação no app');
 await page.locator('[data-frete-conferir="carga:c2"]').click();assert.equal(await page.locator('dialog [name=caminhao] option').count(),2,'extra só oferece seu próprio caminhão');
 assert.equal(await page.locator('dialog [name=caminhao]').inputValue(),'c2');await page.fill('dialog [name=motivo]','Caminhão extra conferido');await page.click('dialog [type=submit]');await page.locator('dialog').waitFor({state:'detached'});
 const salvo=await page.evaluate(()=>__calls.find(c=>c.n==='logistica_frete_conferir').a);assert.equal(salvo.p_chave,'carga:c2');assert.equal(salvo.p_caminhao,'c2');assert.equal(salvo.p_valor,null);
 assert.equal(await page.locator('tbody tr').count(),3);for(const tr of await page.locator('tbody tr').all())assert.equal(await tr.locator('.pla-carga').count(),1);
 await page.screenshot({path:'outputs/frete-um-caminhao-por-linha.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(erros,[]);
 console.log('frete-linhas-browser: ok');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
