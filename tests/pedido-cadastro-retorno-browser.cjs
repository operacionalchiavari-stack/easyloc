const {chromium}=require('playwright'),express=require('express'),assert=require('node:assert/strict');
(async()=>{
 const app=express();app.get('/teste',(_,r)=>r.send('<input id="pedido" value="Dados preservados"><div id="selecionado"></div>'));app.use(express.static(process.cwd()));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();const erros=[];page.on('pageerror',e=>erros.push(e.message));page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
  await page.addInitScript(()=>{
   window.__CONTEXT={empresa_id:'e1'};window.__empresa_id_cache='e1';window.aguardarContexto=async()=>window.__CONTEXT;
   window.lucide={createIcons(){}};window.alerta=(...a)=>console.error(...a);window.hasPermission=()=>true;
   window.EasyLocCofre={preparar(){},mudou(){return false;}};
   window.supabaseClient={auth:{getSession:async()=>({data:{session:null}})},from(t){let id=null,linha=null;const q={select(){return q;},eq(k,v){if(k==='id')id=v;return q;},order(){return q;},limit(){return q;},ilike(){return q;},or(){return q;},range(){return q;},neq(){return q;},insert(v){linha=v;return q;},update(v){linha=v;return q;},single(){return q;},maybeSingle(){return q;},then(resolve){
    const db=window.parent!==window?window.parent.__db:window.__db;
    if(linha){db[t]||=[];db[t].push(linha);resolve({data:linha,error:null});}
    else resolve({data:id?(db[t]||[]).find(x=>x.id===id):[],error:null});
   }};return q;},rpc:async()=>({data:[],error:null})};window.__db={};
  });
  await page.route('**/*',r=>{
   const u=new URL(r.request().url());
   if(u.pathname.endsWith('/functions/v1/calcular-distancia'))return r.fulfill({json:{ok:true,km:12}});
   if(u.origin!==`http://127.0.0.1:${server.address().port}`||/\/(supabase|context|permissions|google|google.config|campoProtegido|etiquetasCadastro|moduleTheme|companyTheme|doisFatores|clientes-equipes)\.js/.test(u.pathname))return r.fulfill({body:'',contentType:'text/javascript'});
   return r.continue();
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/teste`);
  const abrir=tipo=>page.evaluate(async tipo=>{
   const {abrirCadastroDoPedido}=await import('/js/pedido/pedido.cadastro.mjs');
   abrirCadastroDoPedido({tipo,nome:'Nome novo',supabase:window.supabaseClient,aoSelecionar:d=>document.querySelector('#selecionado').textContent=d.id+':'+d.nome_razao});
  },tipo);
  for(const tipo of ['local','cliente']){
   await abrir(tipo);
   const frame=page.frameLocator('#pedidoCadastroTela');
   const nome=tipo==='local'?'#locaisNome':'#nome';
   await frame.locator(nome).waitFor({state:'visible'});
   await page.waitForFunction(nome=>document.querySelector('#pedidoCadastroTela')?.contentDocument?.querySelector(nome)?.value==='Nome novo',nome);
   assert.equal(await frame.locator(nome).inputValue(),'Nome novo');
   await frame.locator('.back-btn').click();
   await page.locator('#pedidoCadastroTela').waitFor({state:'detached'});
   assert.equal(await page.locator('#pedido').inputValue(),'Dados preservados');
   await abrir(tipo);await frame.locator(nome).waitFor({state:'visible'});
   await page.waitForTimeout(400);
   await frame.locator(nome).fill('Cadastro salvo');
   if(tipo==='local'){
    await frame.locator('#locais-endereco').fill('Rua do Evento, 123');
    await frame.locator('#locaisNome').click();
    await frame.locator('body').evaluate(async()=>{
     await window.__locaisAplicarPontoLocal({lat:-22.4,lng:-43.1});
     window.enderecoSelecionadoGoogle=true;
     document.querySelectorAll('.tag-group').forEach(g=>g.querySelector('.tag')?.classList.add('selected'));
    });
   }else{
    await frame.locator('#telefone').fill('24999999999');
    await frame.locator('#email').fill('cadastro@example.invalid');
   }
   await frame.locator('body').evaluate((_,tipo)=>tipo==='local'?window.Locais_salvar():window.clientes_salvar(),tipo);

   await page.locator('#pedidoCadastroTela').waitFor({state:'detached'});
   assert.match(await page.locator('#selecionado').textContent(),/:Cadastro salvo$/);
   const registro=await page.evaluate(tipo=>window.__db[tipo==='local'?'locais_empresas':'clientes_empresas'][0],tipo);
   assert.equal(registro.empresa_id,'e1');assert.ok(registro.id);
   assert.equal(await page.locator('#pedido').inputValue(),'Dados preservados');
  }
  assert.deepEqual(erros,[]);console.log('OK - telas completas de local e cliente; voltar e selecionar preservam o pedido');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
