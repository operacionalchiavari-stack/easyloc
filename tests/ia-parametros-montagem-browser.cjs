const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('fs');
(async()=>{const browser=await chromium.launch({channel:'msedge'});try{
 for(const width of [1400,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
  await page.route('http://localhost:9958/**',r=>r.fulfill({contentType:'text/html',body:'<html lang="pt-BR"><body><section id="parametros"></section><main id="telaEtapa"></main></body></html>'}));await page.goto('http://localhost:9958/');
  await page.addStyleTag({path:'Modulos/Configuracoes/Parametros/parametros.css'});await page.addStyleTag({path:'styles/assistente-solicitacao.css'});await page.addStyleTag({path:'Modulos/Chiavari/Cronograma/montador-ia.css'});
  await page.evaluate(()=>{
   window.relato=null;window.chamadas=[];window.cfg=[];
   const agente={chave:'montagem',nome:'Assistente de montagem',descricao:'Memória para desmontagem',comportamento:'Uma pergunta por vez',coletar:'Acessos e cuidados',indispensavel:'Orientações para desmontagem',limites:'Nao alterar a escala'};
   const resumo={montagem:'Montagem nos lounges 1 e 2',acessos:'Portão lateral, sem escadas',desmontagem:'Retirar depois das 22h pela lateral',cuidados:'Tampo de vidro e parafusos guardados na caixa azul',ocorrencias:'Equipe não identificou danos',melhorias:'Levar carrinho menor para a passagem',pendencias:'Confirmar horário de liberação com o local',pendencias_obrigatorias:[]};
   window.supabaseClient={from:t=>{const q={select:()=>q,eq:()=>q,order:()=>q,then:fn=>fn({data:t==='ia_agentes'?[agente]:cfg})};return q;},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://foto.test/foto.jpg'}})})},
    rpc:async(n,a)=>{chamadas.push({n,a});if(n==='ia_agente_salvar'){const r={agente:a.p_agente,comportamento:a.p_comportamento,coletar:a.p_coletar,indispensavel:a.p_indispensavel,limites:a.p_limites,atualizado_em:'2026-11-08T20:00:00Z'};cfg=[r];return {data:r};}
     if(n==='mont_assistente_contexto')return {data:{empresa_id:'e1',usuario_id:'u1',nome:'João',etapa:a.p_etapa==='m1'?'montagem':'desmontagem',pedido:'14',local:'Vale dos Desejos',relatos:relato?[relato]:[]}};
     if(n==='mont_assistente_salvar'){relato={etapa_id:'m1',resumo:a.p_resumo,conversa:a.p_conversa,fotos:a.p_fotos,autor:'João',atualizado_em:'2026-11-08T20:10:00Z'};return {data:relato};}throw Error(n);},
    functions:{invoke:async()=>({data:{resposta:'Confira o relato para a próxima equipe.',pronto:true,resumo}})}};
   window.alerta=()=>{};
  });
  await page.addScriptTag({path:'Modulos/Configuracoes/Parametros/parametros-ia.js'});
  await page.evaluate(()=>carregarParametrosIa(document.querySelector('#parametros'),'e1'));
  await page.locator('[name=comportamento]').fill('Seja objetiva e confirme os acessos antes de concluir.');await page.locator('[name=limites]').fill('Nao prometer troca ao cliente');await page.locator('form').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>cfg.length===1);assert.equal(await page.locator('[name=limites]').inputValue(),'Nao prometer troca ao cliente');assert.match(await page.locator('[name=comportamento]').inputValue(),/confirme os acessos/);
  await page.screenshot({path:'.tmp/ia-parametros-'+width+'.png',fullPage:true});await page.locator('#parametros').evaluate(e=>e.remove());
  await page.addScriptTag({path:'js/ui/assistente-solicitacao.js'});await page.addScriptTag({path:'js/ui/montagem-assistente.js'});
  await page.evaluate(()=>MontagemAssistente.montar({id:'m1',operacao:'montagem'},'token-app'));
  await page.locator('[data-chat-montagem]').click();await page.locator('textarea').fill('Acesso lateral, lounges montados, tampo de vidro exige cuidado.');await page.locator('.as-campo').evaluate(f=>f.requestSubmit());await page.locator('[data-as=aprovar]').waitFor();assert.equal(await page.evaluate(()=>relato),null);
  await page.locator('[data-as=aprovar]').click();await page.waitForFunction(()=>!!relato);assert.equal(await page.evaluate(()=>relato.conversa.some(m=>m.papel==='pessoa')),true);await page.locator('[data-as=fechar]').click();
  await page.evaluate(()=>MontagemAssistente.montar({id:'d1',operacao:'desmontagem'},'token-app'));
  assert.match(await page.locator('#etapaAssistenteIa').innerText(),/caixa azul/);assert.equal(await page.locator('[data-chat-montagem]').count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(erros,[]);await page.screenshot({path:'.tmp/ia-desmontagem-'+width+'.png',fullPage:true});await page.close();
 }
 console.log('OK - parâmetros, personalização, revisão do relato e consulta na desmontagem, desktop e celular.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
