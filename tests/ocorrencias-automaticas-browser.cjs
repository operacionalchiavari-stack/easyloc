const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const raiz=path.resolve(__dirname,'..');
const fixture=()=>{
 window.__writes=[];window.__calls=0;window.__falhar=false;window.__tick=null;
 window.setInterval=f=>{window.__tick=f;return 1;};
 window.aguardarContexto=async()=>({empresa_id:'e'});
 let contagem={chave:'p|i',pedido_id:'p',item_id:'i',nome:'Cadeira',usa_capa:true,quantidade:null,danificadas:0,capacidade:2,esperado:3,versao:0};
 const casos=[{id:'a',chave:'a',origem:'materiais',objeto:'capa',tipo:'falta',etapa:'retorno',pedido:'DEMO-01',cliente:'Teste',item:'Capa Cadeira',quantidade:2,status:'aberta',data:'2026-11-01T12:00:00Z',descricao:'Faltam duas capas',evidencias:{quantidade:8,protecao_aplicada:false,observacao:'<img src=x onerror=alert(1)>'}},{id:'b',origem:'qualidade',objeto:'item',tipo:'reprovacao',item:'Mesa',status:'resolvida',data:'2026-11-01T13:00:00Z',quantidade:1}];
 window.supabaseClient={rpc:async(n,args)=>{
  if(n==='ocorrencias_painel'){window.__calls++;return window.__falhar?{error:{message:'Falha simulada'}}:{data:casos};}
  if(n==='ocorrencias_evidencias')return {data:[]};
  if(n==='capas_pedido')return {data:[contagem]};
  if(n==='capas_contagem_salvar'){window.__writes.push(args);contagem={...contagem,...args.p_contagens[0],versao:contagem.versao+1};return {data:[contagem]};}
  throw Error('RPC inesperada: '+n);
 }};
};
(async()=>{
 const servidor=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');if(url.pathname==='/__teste'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body></body></html>');return;}const alvo=path.resolve(raiz,'.'+decodeURIComponent(url.pathname));
  if(!alvo.startsWith(raiz+path.sep)){res.writeHead(403).end();return;}
  try{const dado=fs.readFileSync(alvo);res.setHeader('Content-Type',alvo.endsWith('.js')?'application/javascript':alvo.endsWith('.css')?'text/css':'text/html');res.end(dado);}catch{res.writeHead(404).end();}
 });await new Promise(ok=>servidor.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+servidor.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const largura of [1440,390]){
   const pagina=await browser.newPage({viewport:{width:largura,height:1000}}),erros=[];
   pagina.on('pageerror',e=>erros.push(e.message));
   await pagina.addInitScript(fixture);
   await pagina.route('**/*',route=>{
    const url=route.request().url();if(!url.startsWith(base))return route.abort();
    if(/\/js\/core\//.test(url)||url.includes('gas-cliente.js'))return route.fulfill({contentType:'application/javascript',body:''});
    return route.continue();
   });
   await pagina.goto(base+'/Modulos/Chiavari/Ocorrencias/OcorrenciasOperacionais.html');
   await pagina.locator('#opLinhas [data-detalhe="a"]').waitFor();
   assert.equal(await pagina.locator('#opLinhas tr').count(),2);
   assert.equal(await pagina.getByRole('button',{name:'Nova ocorrência',exact:true}).count(),0);
   await pagina.locator('#opBusca').fill('Capa Cadeira');assert.equal(await pagina.locator('#opLinhas tr').count(),1);
   await pagina.locator('[data-detalhe="a"]').click();await pagina.locator('#opDetalhe[open]').waitFor();
   assert.equal(await pagina.locator('#opDetalheCorpo img').count(),0);assert.match(await pagina.locator('#opDetalheCorpo').innerText(),/Faltam duas capas/);
   await pagina.locator('#opFecharDetalhe').click();await pagina.locator('#opBusca').fill('inexistente');assert.match(await pagina.locator('#opLinhas').innerText(),/Nenhuma/);
   await pagina.locator('#opBusca').fill('Capa Cadeira');
   await pagina.evaluate(()=>{window.__falhar=true;window.__tick();});await pagina.waitForFunction(()=>document.getElementById('opStatus').textContent.includes('Falha simulada'));
   assert.equal(await pagina.locator('#opLinhas [data-detalhe="a"]').count(),1);
   if(await pagina.evaluate(()=>document.documentElement.scrollWidth>innerWidth)){console.log(await pagina.evaluate(()=>({largura:innerWidth,overflow:[...document.querySelectorAll('main,main>*')].map(e=>({tag:e.tagName,classe:e.className,largura:e.getBoundingClientRect().width,direita:e.getBoundingClientRect().right}))})));await pagina.screenshot({path:path.join(raiz,'.tmp','ocorrencias-overflow.png'),fullPage:true});}assert.equal(await pagina.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await pagina.screenshot({path:path.join(raiz,'.tmp',`ocorrencias-automaticas-${largura}.png`),fullPage:true});
   assert.deepEqual(erros,[]);await pagina.close();
  }
  const pagina=await browser.newPage();await pagina.addInitScript(fixture);
  await pagina.goto(base+'/__teste');
  await pagina.setContent('<main id="teste"></main>');
  await pagina.addScriptTag({path:path.join(raiz,'js/ui/capas-operacao.js')});
  await pagina.evaluate(async()=>{window.__c=CapasOperacao.criar({sb:supabaseClient,pedido:'p',etapa:'carregamento'});await __c.pronto;document.getElementById('teste').innerHTML=__c.celula({item_id:'i'});});
  assert.equal(await pagina.locator('[data-capas-resumo]').textContent(),'');
  await pagina.locator('[data-capas-delta="1"]').click();await pagina.waitForFunction(()=>__writes.length===1);
  assert.equal(await pagina.locator('[data-capas-campo="quantidade"]').inputValue(),'1');
  await pagina.locator('summary').click();await pagina.locator('[data-capas-campo="protecao_aplicada"]').selectOption('false');
  await pagina.waitForFunction(()=>__writes.some(w=>w.p_contagens[0].protecao_aplicada===false));
  await pagina.close();console.log('Painel desktop/celular, filtros, evidencias, falha de rede e captura na etapa: OK.');
 }finally{await browser.close();await new Promise(ok=>servidor.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1;});
