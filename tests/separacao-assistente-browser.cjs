const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge'});try{
 for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:820}});
  await page.route('http://localhost:9947/**',r=>r.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));await page.goto('http://localhost:9947/');
  await page.addStyleTag({path:'styles/assistente-solicitacao.css'});
  await page.addStyleTag({path:'styles/avaria-setor.css'});
  await page.evaluate(()=>{
   window.salvos=[];window.ctx={empresa_id:'e1',usuario_id:'u1',usuario_nome:'Ana'};
   const resumo={motivo_id:'m1',quantidade:1,problema:'Pintura lascada',quando_identificado:'Ao retirar da embalagem',porque_agora:'Estava coberto',verificacoes:'Inspecionamos a embalagem',solucao_sugerida:'Avaliar reparo',pendencias:'Confirmar origem do dano',danificado:true,sem_foto_motivo:'',fotos_dano_claras:true,analise_fotos:'A imagem mostra uma lasca na pintura do assento'};
   window.supabaseClient={storage:{from:bucket=>({upload:async path=>{window.upload={bucket,path};return {};},createSignedUrl:async path=>({data:{signedUrl:'https://x.supabase.co/storage/v1/object/sign/'+bucket+'/'+path+'?token=teste'}})})},rpc:async(n,a)=>n==='separacao_assistente_contexto'?{data:{item:'Banco',quantidade_pedido:2,motivos:[{id:'m1',nome:'Item danificado'}]}}:(salvos.push(a),{data:'o1'}),functions:{invoke:async(n,{body})=>({data:{resposta:'Confira o resumo.',pronto:true,resumo}})}};
  });
  await page.addScriptTag({path:'js/ui/assistente-solicitacao.js'});await page.addScriptTag({path:'js/ui/separacao-assistente.js'});
  await page.evaluate(()=>SeparacaoAssistente.abrir({sb:supabaseClient,empresa:'e1',pedido:'p1',linha:'l1',item:'i1',nome:'Banco',ctx}));
  const verificarAltura=async()=>{
   const medidas=await page.evaluate(()=>{const d=document.querySelector('dialog.as-dialog'),m=d.querySelector('.as-msgs'),f=d.querySelector('.as-campo'),r=d.getBoundingClientRect(),c=f.getBoundingClientRect();return {espacoInferior:r.bottom-c.bottom,alturaMensagens:m.clientHeight,alturaJanela:r.height,rolagem:m.scrollHeight>m.clientHeight};});
   assert.ok(medidas.espacoInferior<4,'campo de mensagem no fim da janela: '+JSON.stringify(medidas));
   assert.ok(medidas.alturaMensagens>medidas.alturaJanela*.6,'conversa usa a altura disponivel');
  };
  await verificarAltura();
  {const foto=await page.screenshot();await page.locator('[data-as=arquivo-foto]').setInputFiles({name:'foto.png',mimeType:'image/png',buffer:foto});await page.locator('[data-as=aprovar]').waitFor();}
  await page.locator('textarea').fill('Dano visto agora na separacao, uma unidade.');await page.locator('form').evaluate(f=>f.requestSubmit());await page.locator('[data-as=aprovar]').waitFor();
  assert.equal(await page.evaluate(()=>salvos.length),0,'envio exige revisão humana');
  await page.locator('[data-as=aprovar]').click();await page.waitForFunction(()=>salvos.length===1);
  await verificarAltura();
  const salvo=await page.evaluate(()=>salvos[0]);assert.equal(salvo.p_resumo.quantidade,1);{assert.equal(salvo.p_fotos.length,1);assert.equal(await page.evaluate(()=>upload.bucket),'separacao-ocorrencias');assert.match(salvo.p_fotos[0],/^e1\/u1\//);}assert.ok(salvo.p_mensagens.some(m=>m.papel==='pessoa'));assert.ok(salvo.p_mensagens.some(m=>m.papel==='ia'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'.tmp/separacao-chat-'+width+'.png'});await page.close();
 }
 console.log('OK - chat desktop e celular: revisão, resumo, conversa e largura.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
