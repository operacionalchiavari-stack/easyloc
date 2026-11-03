const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
 await page.route('https://foto.teste/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#b8cddd"/></svg>'}));
 await page.setContent('<html lang="pt-BR"><body><main id="painel"></main></body></html>');
 await page.addStyleTag({content:fs.readFileSync('styles/separacao-ocorrencias.css','utf8')});
 await page.addScriptTag({content:fs.readFileSync('js/ui/separacao-ocorrencias.js','utf8')});
 await page.evaluate(()=>{
  window.__lista=[];window.__motivos=[{id:'m1',nome:'Dano cadastrado em Parâmetros'},{id:'m2',nome:'Falta de componente'}];window.__chamadas=[];
  window.__sb={from:()=>{const q={select:()=>q,eq:()=>q,order:async()=>({data:window.__motivos,error:null})};return q;},rpc:async(n,a)=>{
   window.__chamadas.push({n,a});
   if(n==='separacao_ocorrencias_listar')return {data:window.__lista};
   if(n==='separacao_ocorrencia_criar'){
    window.__lista.push({id:'o1',pedido_numero:'8',cliente:'Kelly',item_id:'i1',item_nome:'Torre Bar',item_foto:'https://foto.teste/torre.png',codigo:'TORRE',motivo_nome:window.__motivos.find(m=>m.id===a.p_motivo).nome,estado:'acervo',quantidade:a.p_quantidade,observacao:a.p_observacao,historico:[{acao:'reportar',em:new Date().toISOString(),texto:a.p_observacao}]});return {data:'o1'};
   }
   if(n==='separacao_ocorrencia_acao'){const o=window.__lista.find(o=>o.id===a.p_id);const anterior=o.estado;o.estado=a.p_acao;o.historico.push({anterior,acao:a.p_acao,em:new Date().toISOString(),texto:a.p_texto});return {data:null};}
   throw Error(n);
  }};
  window.__op={sb:window.__sb,empresa:'e1',pedido:'p1',linha:'l1',item:'i1',nome:'Torre Bar',quantidade:3};
 });
 await page.evaluate(()=>window.SeparacaoOcorrencias.reportar(window.__op));await page.locator('.so-tipos').waitFor();
 assert.match(await page.locator('.so-tipos').innerText(),/Dano cadastrado em Parâmetros/);
 await page.locator('[name=foto]').setInputFiles({name:'foto-item.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
 assert.ok(await page.locator('.so-anexo-preview').isVisible());
 assert.match(await page.locator('[data-foto-nome]').innerText(),/foto-item.png/);
 assert.equal(await page.locator('[data-escolher-foto]').isVisible(),false);
 fs.mkdirSync('.tmp',{recursive:true});await page.screenshot({path:path.resolve('.tmp/ocorrencia-anexo-foto.png')});
 await page.click('[data-remover-foto]');
 assert.ok(await page.locator('[data-escolher-foto]').isVisible());
 assert.equal(await page.locator('[name=foto]').evaluate(el=>el.files.length),0);
 await page.locator('[name=foto]').setInputFiles({name:'arquivo.txt',mimeType:'text/plain',buffer:Buffer.from('teste')});
 assert.match(await page.locator('.so-anexo-erro').innerText(),/Escolha uma foto/);
 assert.equal(await page.locator('[name=foto]').evaluate(el=>el.files.length),0);

 await page.locator('.so-tipo').filter({hasText:'Dano cadastrado'}).click();
 assert.equal(await page.locator('[name=motivo]:checked').inputValue(),'m1');
 assert.doesNotMatch(await page.locator('dialog').innerText(),/O restante do pedido/);
 const colunas=await page.locator('.so-report-col').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().top));assert.equal(colunas[0],colunas[1]);await page.fill('[name=quantidade]','2');await page.fill('[name=observacao]','Pintura danificada <script>alert(1)</script>');await page.click('[type=submit]');
 await page.waitForFunction(()=>!document.querySelector('dialog'));
 const montar=fila=>page.evaluate(fila=>window.SeparacaoOcorrencias.painel({sb:window.__sb,empresa:'e1',host:document.querySelector('#painel'),fila}),fila);
 await montar('acervo');
 assert.equal(await page.locator('.so-table tbody tr').count(),1);
 assert.equal(await page.locator('.so-ocorrencia').count(),0);
 assert.equal(await page.locator('.so-table [data-so-acao]').count(),0);
 assert.equal(await page.locator('footer [data-so-acao]').count(),2);
 assert.match(await page.locator('.so-problema-col').innerText(),/Pintura danificada/);
 assert.match(await page.locator('.so-resposta-col').innerText(),/Aguardando resposta/);
 await page.locator('[data-foto-item]').click();
 assert.equal(await page.locator('.so-foto').getAttribute('src'),'https://foto.teste/torre.png');
 await page.locator('dialog [data-fechar]').click();
 assert.match(await page.locator('#painel').innerText(),/Pintura danificada/);assert.equal(await page.locator('#painel script').count(),0);
 await page.click('[data-so-acao=comercial]');await page.fill('textarea','Não é possível reparar a tempo. Verificar troca ou sublocação.');await page.click('dialog [type=submit]');await page.waitForFunction(()=>!document.querySelector('dialog'));
 assert.match(await page.locator('#painel').innerText(),/Nenhuma ocorrência/);
 await montar('comercial');assert.match(await page.locator('#painel').innerText(),/Verificar troca ou sublocação/);
 await page.click('[data-so-acao=triagem]');await page.fill('textarea','Cliente aprovou substituição. Peça disponível para receber.');await page.click('dialog [type=submit]');await page.waitForFunction(()=>!document.querySelector('dialog'));
 await montar('triagem');assert.equal(await page.locator('.so-estado[data-estado=triagem]').count(),1);
 await page.evaluate(async()=>{const host=document.createElement('div');host.id='teste-sinalizar';host.innerHTML='<span data-so-item="i1"></span>';document.body.append(host);await window.SeparacaoOcorrencias.sinalizar({sb:window.__sb,empresa:'e1',pedido:'p1',host});});
 assert.equal(await page.locator('#teste-sinalizar [data-so-item]').innerText(),'');
 await page.locator('#teste-sinalizar').evaluate(el=>el.remove());
 assert.match(await page.locator('.so-resposta-col').innerText(),/Não é possível reparar a tempo/);
 assert.doesNotMatch(await page.locator('.so-problema-col').innerText(),/Não é possível reparar a tempo/);
 await page.click('[data-so-acao=resolvida]');await page.fill('textarea','Peça correta recebida e conferida.');await page.click('dialog [type=submit]');await page.waitForFunction(()=>!document.querySelector('dialog'));
 assert.match(await page.locator('#painel').innerText(),/Resolvida/);assert.equal(await page.locator('[data-so-acao]').count(),0);
 await page.evaluate(()=>{const original=window.__lista[0];window.__lista.push({...original,id:'o2',estado:'triagem',item_nome:'Outro item'});});
 await montar('triagem');
 assert.equal(await page.locator('[data-so-grupo]:visible').getAttribute('data-ocorrencia'),'o2');
 await page.locator('tr[data-ocorrencia=o1]').click();
 assert.equal(await page.locator('[data-so-grupo]:visible').getAttribute('data-ocorrencia'),'o1');
 assert.equal(await page.locator('[data-so-grupo]:visible [data-so-acao]').count(),0);
 await page.locator('tr[data-ocorrencia=o2]').focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('[data-so-grupo]:visible').getAttribute('data-ocorrencia'),'o2');
 await page.evaluate(()=>window.__lista.pop());
 await page.evaluate(()=>{window.__motivos=[];return window.SeparacaoOcorrencias.reportar(window.__op);});assert.match(await page.locator('dialog').innerText(),/Cadastre ou ative os tipos/);
 await page.click('[data-fechar]');await page.setViewportSize({width:390,height:844});await montar('triagem');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.equal(await page.locator('.so-table .so-item-foto img').count(),1);
 assert.deepEqual(erros,[]);fs.mkdirSync('.tmp',{recursive:true});await page.screenshot({path:path.resolve('.tmp/ocorrencias-separacao.png'),fullPage:true});
 console.log('OK: tipos parametrizados, reporte, Acervo, Comercial, confirmação na Triagem, segurança de texto e celular.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
