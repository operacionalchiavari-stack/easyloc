const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const BASE='http://portal-feedback.teste/';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const styles=[...fs.readFileSync('dashboard.html','utf8').matchAll(/<link\b[^>]*>/g)].map(m=>m[0]).filter(s=>/stylesheet/.test(s)).join('\n');
  await page.route('**/*',r=>{
   const u=r.request().url();
   if(u===BASE)return r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<style>#portalInicio{display:block!important;position:relative!important;inset:auto!important;margin:0!important;width:100%;padding-bottom:40px}.revelar{opacity:1!important;transform:none!important}</style></head><body class="portal-shell"><main id="portalInicio"></main><div id="luz"></div></body></html>`});
   if(u===BASE+'foto.svg')return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><rect width="60" height="60" fill="#bdad97"/><circle cx="30" cy="23" r="11" fill="#f7f3ec"/><path d="M9 60a21 25 0 0 1 42 0" fill="#f7f3ec"/></svg>'});
   if(u===BASE+'inexistente.jpg')return r.fulfill({status:404,body:''});
   if(u.startsWith(BASE)){
    const f=path.join(process.cwd(),decodeURIComponent(new URL(u).pathname));
    if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({body:fs.readFileSync(f),contentType:path.extname(f)==='.css'?'text/css':'text/javascript'});
   }
   if(/fonts\.(googleapis|gstatic)\.com/.test(u))return r.continue();
   return r.abort();
  });
  await page.goto(BASE);
  await page.evaluate(BASE=>{
   const relato='A equipe foi muito atenciosa e os móveis chegaram bem cuidados. ';
   window.__feedbacks=Array.from({length:6},(_,i)=>({id:'f'+i,decorador:['Kelly Khawam','Bruna Lima','Ana Paula','Rita Gomes','Fabiane Gabrich','Decorador <script>teste</script>'][i],foto:i===0?BASE+'foto.svg':i===2?BASE+'inexistente.jpg':i===3?'javascript:alert(1)':'',recebido_em:'2026-11-15T02:00:00Z',atencao:i===1||i===2,retorno_concluido:i===2,
    observacao:i===0?relato.repeat(35):i===1?'A coleta demorou mais do que o combinado. Gostaria de um retorno.':i===2?'O retorno foi feito e conseguimos resolver.':i===3?'':relato,
    respostas:[{pergunta:'Como foi a montagem?',respostas:[i===1?'Teve atraso':'Tudo certo'],ruim:i===1},{pergunta:'Estado dos móveis',respostas:['Impecáveis']}],observacoes_setor:{montagem:'Montadores muito educados'},eventos:[{pedido:String(101+i),data:'2026-11-12',tipo:'Casamento',local:'Villa do Lago'},...(i===0?[{pedido:'109',data:'2026-11-11',tipo:'Aniversário',local:'Casa de Festas'}]:[])]}));
   window.__CONTEXT={empresa_id:'empresa-1'};window.__rpc=[];window.__navegacoes=[];window.__falhar=false;
   window.shellNavigate=url=>__navegacoes.push(url);
   window.EasyLocPermissions={hasPermission:()=>true};
   window.fetch=async()=>({ok:true,json:async()=>({ok:true,resultado:{metasSetores:{setores:[]}}})});
   window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'teste'}}})},rpc:async(n,a)=>{
    __rpc.push({n,a});if(n==='portal_feedbacks_decoradores')return __falhar?{error:{message:'offline'}}:{data:{itens:__feedbacks}};
    if(n==='operacao_resumo_dia')return {data:{data:'2026-11-15',etapas:[],agenda:[]}};
    if(n==='operacao_pessoas')return {data:[]};return {data:null};
   }};
  },BASE);
  const fonte=fs.readFileSync('js/ui/portalMural.js','utf8').replace('window.portalMural = { mostrar: mostrar };','window.portalMural = { mostrar: mostrar, feedbackTeste:feedbacksDecoradoresHtml, recarregarTeste:atualizarFeedbacksDecoradores };');
  await page.addScriptTag({content:fonte});await page.evaluate(()=>portalMural.mostrar());
  await page.waitForSelector('.fd-linha');await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>document.querySelectorAll('.fd-avatar img').length===1);
  assert.doesNotMatch(await page.locator('#feedbackDecoradores').innerText(),/Um olhar de quem viveu/);
  assert.equal(await page.locator('#resumoDia + #feedbackDecoradores + #metasSetores').count(),1);
  assert.equal(await page.locator('.fd-linha').count(),6);
  assert.equal(await page.locator('.fd-status-atencao').count(),1);
  assert.equal(await page.locator('.fd-status-resolvido').count(),1);
  assert.equal(await page.locator('.fd-avatar img').count(),1,'foto inexistente e protocolo inválido usam iniciais');
  assert.equal(await page.locator('.fd-decorador small').first().innerText(),'Registrado em 14/11/2026','data do retorno no fuso de São Paulo');
  assert.equal(await page.locator('.fd-linha script').count(),0,'nome escapado');
  assert.match(await page.locator('.fd-nome').last().innerText(),/<script>/);
  assert.ok(await page.evaluate(()=>__rpc.some(x=>x.n==='portal_feedbacks_decoradores'&&x.a.p_empresa==='empresa-1'&&x.a.p_limite===6)));
  await page.locator('[data-fd-abrir]').click();assert.deepEqual(await page.evaluate(()=>__navegacoes),['Modulos/Chiavari/Feedback/feedback.html']);
  for(const width of [1500,1024,768,390,320]){
   await page.setViewportSize({width,height:1000});
   await page.locator('#feedbackDecoradores').scrollIntoViewIfNeeded();
   const layout=await page.locator('#feedbackDecoradores h2').evaluate(el=>{const r=el.getBoundingClientRect(),s=el.closest('section').getBoundingClientRect();return{center:Math.abs((r.left+r.right-s.left-s.right)/2),font:getComputedStyle(el).fontFamily,italic:getComputedStyle(el.querySelector('em')).fontFamily,overflow:document.documentElement.scrollWidth>innerWidth,clipped:r.left<s.left||r.right>s.right};});
   assert.ok(layout.center<1,JSON.stringify(layout));assert.equal(layout.font,layout.italic);assert.equal(layout.overflow,false,'sem rolagem lateral '+width);assert.equal(layout.clipped,false,'título completo '+width);
   if(width>800){const topo=await page.locator('.fd-topo').evaluate(el=>{const h=el.querySelector('h2').getBoundingClientRect(),b=el.querySelector('[data-fd-abrir]').getBoundingClientRect();return{mesmaLinha:Math.abs((h.top+h.bottom-b.top-b.bottom)/2)<1,sobreposicao:h.right>b.left};});assert.equal(topo.mesmaLinha,true);assert.equal(topo.sobreposicao,false);}
   await page.locator('[data-fd-avaliacao]').first().click();
   assert.equal(await page.locator('[data-fd-avaliacao]').first().getAttribute('aria-expanded'),'true');
   assert.match(await page.locator('.fd-completo').first().innerText(),/Montadores muito educados.*Eventos desta avaliação/s);
   assert.ok((await page.locator('.fd-completo').first().innerText()).length>2000,'relato completo disponível');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.locator('[data-fd-avaliacao]').first().click();
   if(width===1500||width===390)await page.locator('#feedbackDecoradores').screenshot({path:`.tmp/portal-feedbacks-${width}.png`});
  }
  await page.locator('[data-fd-avaliacao]').first().focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-fd-avaliacao]').first().getAttribute('aria-expanded'),'true');
  await page.evaluate(()=>{__falhar=true;return portalMural.recarregarTeste();});
  assert.equal(await page.locator('[data-fd-recarregar]').isVisible(),true);
  assert.equal(await page.locator('.fd-linha').count(),0);
  await page.evaluate(()=>{__falhar=false;});await page.locator('[data-fd-recarregar]').click();await page.waitForSelector('.fd-linha');
  assert.equal(await page.locator('.fd-linha').count(),6,'recarrega após falha');
  await page.evaluate(()=>{__feedbacks=[];return portalMural.recarregarTeste();});
  assert.match(await page.locator('.fd-vazio').innerText(),/próximos retornos/);
  const semPermissao=await page.evaluate(()=>{EasyLocPermissions.hasPermission=()=>false;return portalMural.feedbackTeste({itens:[]});});
  assert.doesNotMatch(semPermissao,/data-fd-abrir/);
  assert.deepEqual(errors,[]);
  console.log('OK: feedbacks reais por empresa, posição na página, fotos, relatos completos, teclado, celular e recuperação de falha.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
