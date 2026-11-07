// App da Expedição no celular (nov/2026): fila carregar/descarregar, bloqueio, QR com sinal, caminhão, quantidade.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const BASE='http://localhost:9903/';
const mock=`(()=>{
 const pessoa={id:'u1',email:'equipe@teste.local'};window.__chamadas=[];
 const etq=()=>[{id:'t1',codigo:'8-001',separacao_pedido_id:'p1',separacao_item_id:'s1',item_id:'i1',item_nome:'Cadeira Tiffany'},{id:'t2',codigo:'8-002',separacao_pedido_id:'p1',separacao_item_id:'s1',item_id:'i1',item_nome:'Cadeira Tiffany'}];
 window.__db={etq:etq(),pedidos:{
  p1:{id:'p1',numero_pedido:'8',cliente_nome:'Kelly Khawam',local_nome:'Vale dos Desejos',data_entrega:'2026-11-08',operacao:{},modo_separacao:'qr',fluxo_etapa:'expedicao'},
  p2:{id:'p2',numero_pedido:'9',cliente_nome:'Ana',local_nome:'Villa',data_entrega:'2026-11-09',operacao:{},modo_separacao:'qr',fluxo_etapa:'expedicao'},
  p3:{id:'p3',numero_pedido:'10',cliente_nome:'Bia',local_nome:'Casa',data_coleta:'2026-11-07',operacao:{carregamento:{concluido_em:'x',itens:[{chave:'s9|i9',esperado:3,conferido:3}]}},modo_separacao:'manual',fluxo_etapa:'descarregamento'}}};
 const q=(t)=>{const f={};const o={select:()=>o,eq:(c,v)=>{f[c]=v;return o;},in:()=>o,neq:()=>o,order:()=>o,
   maybeSingle:async()=>({data:t==='separacoes_pedidos'?window.__db.pedidos[f.id]||null:t==='empresa_logistica_regras'?{descarregamento_conferencia:'quantidade'}:t==='separacoes_etiquetas'?null:null}),
   then:r=>r({data:t==='usuarios_empresas'?[{empresa_id:'e1'}]:t==='empresas'?[{id:'e1',nome:'Chiavari'}]:t==='separacoes_etiquetas'?(f.separacao_pedido_id==='p1'?window.__db.etq:[]):t==='itens'?[{id:'i1',produto:'Cadeira Tiffany',foto_url:''},{id:'i9',produto:'Mesa Nice'}]:t==='separacoes_pedidos'?[]:[]})};return o;};
 const sb={auth:{getSession:async()=>({data:{session:{user:pessoa}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>{}},functions:{invoke:async()=>({data:{}})},from:q,
 rpc:async(n,a)=>{window.__chamadas.push([n,a]);const d=window.__db;
  if(n==='funcionario_contexto')return {data:{ativo:true,nome:'Carlos da Expedicao'}};
  if(n==='catalogo_vitrine_login')return {data:{nome:'Chiavari'}};
  if(n==='pedido_fluxo_fila')return {data:Object.values(d.pedidos)};
  if(n==='pedidos_pagamento_bloqueados')return {data:['p2']};
  if(n==='pedidos_sem_caminhao_bloqueados')return {data:[]};
  if(n==='operacao_iniciar_conferencia')return {data:{id:a.p_pedido}};
  if(n==='capas_pedido')return {data:[]};
  if(n==='operacao_conferencia_pecas')return {data:[{chave:'s9|i9',item_id:'i9',nome:'Mesa Nice',esperado:5}]};
  if(n==='operacao_ler_peca'){const e=d.etq.find(x=>x.codigo===a.p_codigo);if(e.lida_carregamento_em)return {error:{message:'Etiqueta já foi conferida'}};e.lida_carregamento_em='agora';return {data:{...e}};}
  if(n==='operacao_frota')return {data:[{id:'c1',codigo:'G',placa:'ABC1D23'},{id:'c2',codigo:'M2',placa:'SEM PLACA - M2'}]};
  if(n==='operacao_caminhoes_programados')return {data:[{caminhao_id:'c1'}]};
  if(n==='operacao_registrar_caminhoes')return {data:true};
  if(n==='operacao_concluir_conferencia')return {data:{concluido_em:new Date().toISOString(),por:'Carlos',faltando:[],itens:a.p_quantidades?Object.entries(a.p_quantidades).map(([chave,v])=>({chave,conferido:v,esperado:3})):[]}};
  return {data:[]};}};
 window.supabase={createClient:()=>sb};
})();`;
(async()=>{const browser=await chromium.launch({channel:'msedge'});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
 await page.route('**/*',r=>{const u=r.request().url();if(u.includes('supabase-js'))return r.fulfill({body:mock,contentType:'text/javascript'});if(u.startsWith(BASE)){const file=path.join(process.cwd(),decodeURIComponent(new URL(u).pathname));if(!fs.existsSync(file))return r.fulfill({status:404,body:''});return r.fulfill({body:fs.readFileSync(file),contentType:{'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png'}[path.extname(file)]||'application/octet-stream'});}return r.abort();});
 await page.goto(BASE+'Modulos/Logistica/ExpedicaoApp/expedicao.html?app=1');await page.locator('[data-pedido=p1]').waitFor();
 assert.equal(await page.locator('#taFilaTitulo').innerText(),'Carregamento');assert.equal(await page.locator('[data-total=carregamento]').innerText(),'2');assert.equal(await page.locator('[data-total=descarregamento]').innerText(),'1');
 // Pedido sem o pagamento mínimo: travado, não abre.
 await page.locator('[data-pedido=p2]').click();await page.locator('#taSinal.sinal-erro.ver').waitFor();assert.match(await page.locator('#taSinal').innerText(),/Financeiro/);await page.locator('#taSinal').click();await page.waitForFunction(()=>!document.querySelector('#taSinal.ver'));
 await page.locator('[data-pedido=p1]').click();await page.locator('#taCodigo').waitFor();
 await page.locator('#taCodigo').fill('ACERVO:ENV:8-001');await page.locator('#taFormCodigo').evaluate(f=>f.requestSubmit());
 await page.locator('#taSinal.sinal-ok.ver').waitFor();assert.match(await page.locator('#taSinal .sinal-contagem').innerText(),/1 de 2 carregados/);await page.screenshot({path:'.tmp/app-expedicao-sinal.png'});
 await page.waitForFunction(()=>!document.querySelector('#taSinal.ver'),null,{timeout:4000});
 await page.locator('#taCodigo').fill('ACERVO:ENV:8-001');await page.locator('#taFormCodigo').evaluate(f=>f.requestSubmit());await page.locator('#taSinal.sinal-aviso.ver').waitFor();await page.locator('#taSinal').click();await page.waitForFunction(()=>!document.querySelector('#taSinal.ver'));
 await page.locator('#taCodigo').fill('XYZ-999');await page.locator('#taFormCodigo').evaluate(f=>f.requestSubmit());await page.locator('#taSinal.sinal-erro.ver').waitFor();assert.equal(await page.locator('#taSinal .sinal-titulo').innerText(),'Código não encontrado');await page.locator('#taSinal').click();await page.waitForFunction(()=>!document.querySelector('#taSinal.ver'));
 // Faltando volume: não conclui pelo celular.
 await page.locator('#taFinalizar').click();await page.locator('#taSinal.sinal-erro.ver').waitFor();assert.match(await page.locator('#taSinal .sinal-titulo').innerText(),/Ainda faltam 1/);await page.locator('#taSinal').click();await page.waitForFunction(()=>!document.querySelector('#taSinal.ver'));
 await page.locator('#taCodigo').fill('ACERVO:ENV:8-002');await page.locator('#taFormCodigo').evaluate(f=>f.requestSubmit());await page.locator('#taSinal.sinal-ok.ver').waitFor();assert.match(await page.locator('#taSinal .sinal-titulo').innerText(),/Item completo/);
 await page.waitForFunction(()=>!document.querySelector('#taSinal.ver'),null,{timeout:4000});
 await page.locator('#taFinalizar').click();await page.locator('#taEscolha[open]').waitFor();assert.equal(await page.locator('#taEscolha input[value=c1]').isChecked(),true,'programado já marcado');await page.screenshot({path:'.tmp/app-expedicao-caminhao.png'});
 await page.locator('[data-confirmar-caminhao]').click();await page.getByText('Carregamento concluído').first().waitFor();
 const reg=await page.evaluate(()=>__chamadas.find(([n])=>n==='operacao_registrar_caminhoes')[1]);assert.deepEqual(reg.p_caminhoes,['c1']);
 // Descarregamento por quantidade com 2ª contagem.
 await page.locator('#taSinal').click().catch(()=>{});await page.locator('[data-voltar]').click();await page.locator('[data-etapa=descarregamento]').click();await page.locator('[data-pedido=p3]').click();
 await page.locator('[data-contagem="s9|i9"]').waitFor();assert.match(await page.locator('.material').innerText(),/Saiu: 3/);
 await page.locator('[data-contagem="s9|i9"]').fill('2');await page.locator('#taFinalizar').click();await page.locator('#taSinal.sinal-aviso.ver').waitFor();await page.locator('#taSinal').click();
 assert.equal(await page.locator('#taRodada').innerText(),'2ª contagem');await page.locator('[data-contagem="s9|i9"]').fill('3');
 await page.locator('#taFinalizar').click();await page.locator('#taConfirmacao [value=confirmar]').click();await page.getByText('Descarregamento concluído').first().waitFor();
 const fim=await page.evaluate(()=>__chamadas.filter(([n])=>n==='operacao_concluir_conferencia').pop()[1]);assert.equal(fim.p_quantidades['s9|i9'],3);assert.equal(fim.p_primeira['s9|i9'],2);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'sem rolagem horizontal');await page.screenshot({path:'.tmp/app-expedicao-volta.png',fullPage:true});
 assert.deepEqual(erros,[]);console.log('OK - app da Expedição: fila, bloqueio, QR com sinal, caminhão, quantidade com 2ª contagem.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
