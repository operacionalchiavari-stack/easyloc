const {chromium}=require('playwright'),fs=require('fs'),assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge'});try{
 const page=await browser.newPage({viewport:{width:1900,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://localhost:9922/**',r=>r.request().url().endsWith('/foto.svg')?r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#8ba590"/><circle cx="20" cy="15" r="7" fill="#fff"/><path d="M8 40a12 16 0 0 1 24 0" fill="#fff"/></svg>'}):r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><body class="portal-shell"><div id="portalInicio"></div></body>'}));
 await page.goto('http://localhost:9922/');
 await page.addStyleTag({content:fs.readFileSync('styles/portal-shell.css','utf8').replace(/@import[^;]+;/g,'')});await page.addStyleTag({content:'#portalInicio{display:block!important;padding:20px}.revelar{opacity:1!important;transform:none!important}'});
 await page.evaluate(()=>{
  window.__CONTEXT={empresa_id:'e1'};window.__navegacoes=[];window.shellNavigate=url=>__navegacoes.push(url);
  const cliente='Kelly Khawam';
  window.supabaseClient={rpc:async nome=>nome==='operacao_pessoas'?{data:[{nome:'Joao Pedro',foto_url:'foto/joao.jpg',free:false}]}:{data:{data:'2026-11-03',etapas:[{etapa:'Triagem (Conferencia)',pedido:'1',cliente,local:'Vale dos Desejos',horario:'09:01'},{etapa:'Desmontagem',pedido:'1',cliente,local:'Vale dos Desejos',horario:'08:00',responsavel:'Joao Pedro',caminhao:'G'},{etapa:'Descarregamento',pedido:'1',cliente,local:'Vale dos Desejos',horario:'09:00',caminhao:'G'}],agenda:[{horario:'11:00',tipo:'Reuniao',setor:'Estoque',descricao:'Revisao de materiais'}]}},storage:{from:()=>({createSignedUrls:async paths=>({data:paths.map(path=>({path,signedUrl:'http://localhost:9922/foto.svg'}))})})},from:t=>{const q={select:()=>q,eq:()=>q,in:()=>q,then:ok=>Promise.resolve({data:t==='separacoes_pedidos'?[{numero_pedido:'1',local_id:'l1'}]:[{id:'l1',endereco:'Estrada do Passatempo - Alberto Torres, 976 - Tres Rios, Areal - RJ, 25850-000',numero_endereco:'976'}]}).then(ok)};return q;}};
 });
 const fonte=fs.readFileSync('js/ui/portalMural.js','utf8').replace('window.portalMural = { mostrar: mostrar };','window.portalMural = { mostrar: mostrar, testeHtml:resumoDiaHtml, testeBuscar:buscarResumoDia };');await page.addScriptTag({content:fonte});
 await page.evaluate(async()=>{const r=await portalMural.testeBuscar();document.querySelector('#portalInicio').innerHTML=portalMural.testeHtml(r);});
 assert.equal(await page.locator('.rd-cartao').count(),0);assert.equal(await page.locator('.rd-linha').count(),4);
 assert.deepEqual(await page.locator('.rd-linha td:nth-child(2)').allTextContents(),['08:00','09:00','09:01','11:00']);
 assert.match(await page.locator('.rd-dia').innerText(),/03\/11\/2026/);assert.match(await page.locator('.rd-linha').first().innerText(),/Estrada do Passatempo/);
 assert.equal(await page.locator('.rd-linha').first().locator('.rd-avatar img').count(),1);
 assert.equal(await page.locator('.rd-avatar>span').first().innerText(),'JP');
 assert.equal(await page.locator('.rd-linha').first().locator('td').nth(5).innerText(),'Vale dos Desejos - Estrada do Passatempo - Alberto Torres, 976 - Tres Rios, Areal - RJ, 25850-000');
 await page.locator('.rd-abrir').click();assert.deepEqual(await page.evaluate(()=>__navegacoes),['Modulos/Chiavari/Cronograma/cronograma.html']);
 await page.screenshot({path:'.tmp/home-resumo-tabela.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'sem overflow no celular');await page.screenshot({path:'.tmp/home-resumo-celular.png',fullPage:true});
 await page.evaluate(()=>{document.querySelector('#portalInicio').innerHTML=portalMural.testeHtml({data:'2026-11-03',etapas:[],agenda:[]});});assert.match(await page.locator('.rd-tabela-vazia').innerText(),/Nada no cronograma/);assert.deepEqual(errors,[]);
 console.log('OK - resumo em tabela, horario, data, endereco completo, foto assinada, agenda, acesso ao cronograma e celular.');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
