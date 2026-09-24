// Usa RPCs reais e um clone temporário de um projeto existente. Sem service role no navegador.
const {chromium}=require('playwright');
const {createClient}=require('@supabase/supabase-js');
const express=require('express');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const config=JSON.parse(process.env.PROJETO_TEST_SESSION);
 const sb=createClient(config.url,config.anon,{auth:{persistSession:false}});
 const rpc=async(name,args={})=>{const {data,error}=await sb.rpc(name,{p_token:config.token,...args});if(error)throw new Error(error.message);return data;};
 const lista=await rpc('projeto_listar');
 const origem=lista.find(p=>p.itens>2 && p.renders>0); assert.ok(origem,'Projeto existente com itens e renders');
 const real=await rpc('projeto_obter',{p_id:origem.id});
 const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const browser=await chromium.launch({channel:'msedge',headless:true}); let clone;
 try{
  clone=await rpc('projeto_criar',{p_noivos:'Validação temporária — '+real.noivos,p_data_evento:real.data_evento,p_local_evento:real.local_evento,p_ambientes:[]});
  const dados=structuredClone(real.dados);
  dados.ambientes.push({id:'validacao-vazio',nome:'Ambiente sem mídia',itens:[],renders:[],notas:''});
  await rpc('projeto_salvar',{p_id:clone.id,p_noivos:clone.noivos,p_data_evento:real.data_evento,p_local_evento:real.local_evento,p_dados:dados});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({url,anon,token})=>{
   sessionStorage.setItem('catalogo_token',token);
   window.supabaseClient={rpc:async(name,args)=>{
    const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+anon,'Content-Type':'application/json'},body:JSON.stringify(args)});
    const data=await response.json();return response.ok?{data,error:null}:{data:null,error:data};
   }};
  },config);
  const base='http://127.0.0.1:'+server.address().port;
  const abrir=async(id)=>{await page.locator('[data-gateway-tile="projetos"]').click();await page.locator(`[data-cpj-open="${id}"]`).click();await page.locator('[data-cpj-panel]').waitFor();};
  await page.goto(base+'/Modulos/Comercial/Catalogo/catalogo.html');await abrir(real.id);
  assert.ok(await page.locator('[data-cpj-item]').count()>0,'Abre ambiente real');
  await page.locator('[data-cpj="voltar"]').click();await page.locator(`[data-cpj-open="${clone.id}"]`).click();
  await page.locator('[data-cpj-worktab="geral"]').click();
  fs.mkdirSync('outputs',{recursive:true});
  await page.screenshot({path:'outputs/projeto-geral-desktop.png',fullPage:true});
  const amb=dados.ambientes.find(a=>a.itens.length>=2);assert.ok(amb);
  const rows=page.locator(`[data-pa-amb="${amb.id}"]`);
  assert.equal(await page.locator('.pa-grupo').count(),dados.ambientes.length);
  const ids=await rows.evaluateAll(rs=>rs.map(r=>r.dataset.paItem));
  const first=rows.nth(0).locator('[data-pa-drag]'), second=rows.nth(1);
  await first.scrollIntoViewIfNeeded();const a=await first.boundingBox(),b=await second.boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('[data-cpj-save-state]')?.dataset.state==='saved');
  let saved=await rpc('projeto_obter',{p_id:clone.id});
  assert.equal(saved.dados.ambientes.find(a=>a.id===amb.id).itens[0].item_id,ids[1]);
  assert.deepEqual(saved.dados.ambientes.map(a=>a.itens.reduce((s,i)=>s+Number(i.quantidade||1),0)),dados.ambientes.map(a=>a.itens.reduce((s,i)=>s+Number(i.quantidade||1),0)));
  await page.reload();await abrir(clone.id);await page.locator('[data-cpj-worktab="geral"]').click();
  assert.equal(await rows.first().getAttribute('data-pa-item'),ids[1]);
  await rows.first().locator('[data-pa-drag]').focus();await page.keyboard.press('ArrowDown');
  await page.waitForFunction(()=>document.querySelector('[data-cpj-save-state]')?.dataset.state==='saved');
  await page.locator('[data-cpj="voltar"]').click();await page.locator(`[data-cpj-open="${clone.id}"]`).click();await page.locator('[data-cpj-worktab="geral"]').click();
  assert.equal(await rows.first().getAttribute('data-pa-item'),ids[0]);
  await page.route('**/rest/v1/rpc/projeto_salvar',route=>route.abort());
  await rows.first().locator('[data-pa-drag]').focus();await page.keyboard.press('ArrowDown');
  await page.waitForFunction(()=>document.querySelector('[data-cpj-save-state]')?.dataset.state==='error');
  assert.equal((await rpc('projeto_obter',{p_id:clone.id})).dados.ambientes.find(a=>a.id===amb.id).itens[0].item_id,ids[0]);
  await page.unroute('**/rest/v1/rpc/projeto_salvar');
  await page.getByRole('button',{name:'Tentar salvar',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-cpj-save-state]')?.dataset.state==='saved');
  assert.equal((await rpc('projeto_obter',{p_id:clone.id})).dados.ambientes.find(a=>a.id===amb.id).itens[0].item_id,ids[1]);
  await rows.first().locator('[data-pa-drag]').focus();await page.keyboard.press('ArrowDown');
  await page.waitForFunction(()=>document.querySelector('[data-cpj-save-state]')?.dataset.state==='saved');
  for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
    await page.setViewportSize({width,height});
    await page.evaluate(async()=>{const images=[...document.querySelectorAll('.pa-geral img')];images.forEach(i=>i.loading='eager');await Promise.all(images.map(i=>i.decode().catch(()=>{})));});
    await page.screenshot({path:`outputs/projeto-geral-${name}.png`,fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await page.setViewportSize({width:1440,height:1000});
  // Nova página, mesma sessão: leitura de outro cliente/browser sem estado em memória.
  const other=await browser.newPage();await other.goto(base);assert.equal((await rpc('projeto_obter',{p_id:clone.id})).dados.ambientes.find(a=>a.id===amb.id).itens[0].item_id,ids[0]);await other.close();
  await page.locator('[data-cpj-worktab="plantas"]').click();
  if(dados.plantas?.length){await page.locator('[data-cpj="planta-abrir"]').first().click();await page.locator('[data-cpj-planta-img]').waitFor();}
  await page.locator('[data-cpj="apresentacao"]').click();await page.locator(`[data-pa-page="${amb.id}"]`).first().click();
  assert.equal(await page.locator('.pa-render').getAttribute('src'),amb.renders[0].url);
  const total=amb.itens.reduce((s,i)=>s+Number(i.quantidade||1),0);
  assert.equal(await page.locator('.pa-quantidade b').evaluateAll(es=>es.reduce((s,e)=>s+Number(e.textContent),0)),total);
  fs.mkdirSync('outputs',{recursive:true});
  for(const [name,width,height] of [['desktop',1440,1000],['tablet',820,1180],['mobile',390,844]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(250);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' sem overflow');
   await page.screenshot({path:`outputs/projeto-apresentacao-${name}.png`,fullPage:true});
  }
  await page.locator('[data-pa-page="validacao-vazio"]').first().click();assert.match(await page.locator('.pa-ambiente').innerText(),/Nenhum item/);assert.match(await page.locator('.pa-ambiente').innerText(),/ainda não possui imagem/);
  await page.locator('#catalogGlobalBack').click();assert.equal(await page.locator('.pa-capa').count(),1);
  // O próprio documento utilizado pelo botão de exportação é renderizado em PDF pelo Chromium.
  const model=await page.evaluate(async({project})=>{
   const {dadosApresentacao}=await import('./projeto-apresentacao.mjs');
   const {data}=await window.supabaseClient.rpc('catalogo_carregar',{p_token:sessionStorage.getItem('catalogo_token')});
   const map=new Map(data.itens.map(i=>[String(i.id),{name:i.produto,photo:i.foto_url,referencia:i.referencia,catLabel:i.categoria}]));
   return dadosApresentacao(project,id=>map.get(id));
  },{project:await rpc('projeto_obter',{p_id:clone.id})});
  const html=await page.evaluate(async m=>(await import('./projeto-apresentacao.mjs')).documentoApresentacao(m),model);
  fs.writeFileSync('outputs/projeto-apresentacao-dados.json',JSON.stringify(model));
  const pdfPage=await browser.newPage({viewport:{width:1100,height:800}});await pdfPage.setContent(html,{waitUntil:'networkidle'});
  await pdfPage.evaluate(async()=>{document.querySelectorAll('img').forEach(i=>i.loading='eager');await Promise.all([...document.images].map(i=>i.decode()));});
  await pdfPage.pdf({path:'outputs/projeto-apresentacao-validacao.pdf',printBackground:true,preferCSSPageSize:true});
  assert.equal(await pdfPage.locator('[data-pa-section]').count(),dados.ambientes.length);
  const pdfData=fs.readFileSync('outputs/projeto-apresentacao-validacao.pdf');
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const pdf=await pdfjs.getDocument({data:new Uint8Array(pdfData),useSystemFonts:true}).promise;
  let texto='';for(let i=1;i<=pdf.numPages;i++){
    const pagina=await pdf.getPage(i),textos=(await pagina.getTextContent()).items;
    for(const t of textos) if(t.str.trim()) assert.ok(t.transform[4]+t.width<=pagina.view[2]-20,'Texto do PDF dentro da margem: '+t.str);
    texto+=textos.map(x=>x.str).join(' ')+' ';
  }
  for(const a of model.ambientes){assert.ok(texto.includes(a.nome));for(const i of a.itens)assert.ok(texto.includes(i.nome));}
  assert.ok(pdf.numPages>=dados.ambientes.length+1);await pdf.destroy();await pdfPage.close();
  // Testa o botão real sem abrir diálogo de sistema no headless.
  await page.evaluate(()=>{window.__prints=0;const observer=new MutationObserver(()=>{document.querySelectorAll('iframe[title="Impressão da apresentação"]').forEach(f=>f.addEventListener('load',()=>{f.contentWindow.print=()=>{window.__prints++;f.contentWindow.dispatchEvent(new Event('afterprint'));};},{once:true}));});observer.observe(document.body,{childList:true});});
  await page.locator('[data-cpj="apresentacao-pdf"]').click();await page.waitForFunction(()=>window.__prints===1,{},{timeout:45000});
  await rpc('projeto_salvar',{p_id:clone.id,p_noivos:clone.noivos,p_data_evento:real.data_evento,p_local_evento:real.local_evento,p_dados:{ambientes:[]}});
  await page.reload();await abrir(clone.id);await page.locator('[data-cpj-worktab="geral"]').click();
  assert.match(await page.locator('.pa-geral').innerText(),/Este projeto ainda não possui itens adicionados/);
  await page.locator('[data-cpj-worktab="plantas"]').click();await page.locator('[data-cpj="apresentacao"]').click();
  assert.match(await page.locator('.pa-apresentacao').innerText(),/Este projeto ainda não possui ambientes/);
  assert.deepEqual(errors,[]);
  console.log('PASS: projeto real, Geral, quantidades, drag/teclado, persistência após refresh/reentrada, Plantas, renders, navegação, desktop/tablet/mobile e PDF completo.');
 }finally{
  if(clone)await rpc('projeto_excluir',{p_id:clone.id});
  await browser.close();server.close();
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
