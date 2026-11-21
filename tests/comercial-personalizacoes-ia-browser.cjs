const {chromium}=require('playwright');
const express=require('express');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {installMock}=require('./mock-projetos.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
(async()=>{
 const app=express();
 app.get('/host-personalizacao.html',(req,res)=>res.type('html').send(`<!doctype html><html><body style="margin:0"><script>
 window.pedidoProjetoCatalogo=()=>JSON.parse(sessionStorage.getItem('mockdb')).projetos[0];
 window.pedidoMetadadosCatalogo=()=>({noivos:'Ana & Bruno',data_evento:'2027-05-22',local_evento:'Jardim'});
 window.pedidoSincronizarProjetoCatalogo=async p=>{const db=JSON.parse(sessionStorage.getItem('mockdb'));db.projetos[0]=structuredClone(p);sessionStorage.setItem('mockdb',JSON.stringify(db));};
 window.__pedidoCatalogoModal=()=>{};
 </script><button id="abrir-lista" onclick="document.querySelector('iframe').contentWindow.abrirProjetoComercialPedido()">Lista</button><iframe src="/Modulos/Comercial/Catalogo/catalogo.html?comercial=pedido" style="border:0;width:100vw;height:94vh"></iframe></body></html>`));
 app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const [tipo,comercial] of [['tinta',false],['tecido',false],['tinta',true],['tecido',true]]){
   const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
   await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="#d1ac8c"/></svg>'}));
   await page.route('**/js/core/context.js*',r=>r.fulfill({contentType:'text/javascript',body:"window.__CONTEXT={empresa_id:'company'};window.aguardarContexto=async()=>window.__CONTEXT;"}));
   await page.addInitScript(()=>{if(!sessionStorage.getItem('mockdb'))sessionStorage.setItem('mockdb',JSON.stringify({projetos:[{id:'p1',cliente_id:'client',noivos:'Ana & Bruno',data_evento:'2027-05-22',local_evento:'Jardim',status:'rascunho',dados:{ambientes:[{id:'a1',nome:'Lounge',itens:[],renders:[]},{id:'a2',nome:'Bar',itens:[],renders:[]}]}}],calls:[],uploads:[],removed:[],seq:3}));});
   await page.addInitScript(installMock,{token:!comercial,staff:comercial,cartela:true});
   await page.addInitScript(()=>{
    const sb=window.supabaseClient,rpc=sb.rpc.bind(sb),invoke=sb.functions.invoke.bind(sb.functions);
    sb.functions.invoke=async(name,args)=>{
     if(name!=='studio-ai-engine')return invoke(name,args);
     const db=window.mockdb,meta=args.body.scene.personalizacao;
     const foto={id:'foto-'+(db.seq++),url:'https://fixture/personalizado-'+meta.tipo+'.png',cliente_id:'client',item_id:meta.item_id,item_nome:meta.item_id==='1'?'Sofá Um':'Sofá Dois',item_codigo:'SF-0'+meta.item_id,categoria:'Sofás',tipo:meta.tipo,criado_em:'2026-11-18T12:00:00Z',titulo:meta.descricao,personalizacao:meta};
     db.fotos=(db.fotos||[]).concat(foto);sessionStorage.setItem('mockdb',JSON.stringify(db));
     return{data:{providerStatus:'ok',images:[{url:foto.url}],personalizacaoSalva:foto},error:null};
    };
    sb.rpc=async(name,args)=>{
     if(name==='comercial_personalizacoes_ia_carregar'){const db=window.mockdb;db.leiturasIA=(db.leiturasIA||0)+1;sessionStorage.setItem('mockdb',JSON.stringify(db));return{data:{fotos:db.fotos||[]},error:null};}
     return rpc(name,args);
    };
    if(location.pathname.includes('/PersonalizacoesIA/')){
     sessionStorage.setItem('login_ok','1');sessionStorage.setItem('empresa_id','company');
     sb.auth.getSession=async()=>({data:{session:{user:{id:'user-1'}}},error:null});sb.auth.getUser=async()=>({data:{user:{id:'user-1'}},error:null});
    }
   });
   const base='http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html';
   await page.goto(comercial?'http://127.0.0.1:'+server.address().port+'/host-personalizacao.html':base);
   let ui=comercial?page.frameLocator('iframe'):page;
   if(comercial){await page.waitForFunction(()=>typeof document.querySelector('iframe')?.contentWindow.abrirCatalogoComercialPedido==='function');await page.locator('iframe').evaluate(f=>f.contentWindow.abrirCatalogoComercialPedido());}
   else{await page.locator('[data-gateway-tile="catalogo"]').click();await page.locator('[data-entry-project="p1"]').click();await page.locator('.cpj-entry').waitFor({state:'detached'});}
   const id=tipo==='tinta'?'1':'2';
   await ui.locator('[data-home-category="sofas"]').click();
   if(comercial)await ui.locator(`[data-grid-item="${id}"] [data-customize-item="${id}"]`).click();
   else{await ui.locator(`[data-grid-item="${id}"]`).click();await ui.locator(`.catalog-product-section[data-product-id="${id}"] .product-bespoke-icon`).click();}
   if(tipo==='tinta'){
    const dlg=ui.locator('dialog.cpj-pers-dialog[open]');await dlg.locator('[data-pers-aba="novas"]').click();await dlg.locator('[data-pers-opcao="o2"]').click();await dlg.locator('[data-pers-ia]').click();
   }else{
    await ui.locator('#catalogFabricInput').setInputFiles({name:'tecido.png',mimeType:'image/png',buffer:png});
    await ui.locator('#catalogCustomizeGenerate:not([disabled])').waitFor();await ui.locator('#catalogCustomizeGenerate').click();
   }
   const toast=ui.locator('.catalog-notification.has-photo');await toast.waitFor();assert.match(await toast.textContent(),/Comercial › Renderizações/);
   await toast.locator('.catalog-notification-action').click();await ui.locator('#catalogFabricResultDialog[open]').waitFor();
   assert.match(await ui.locator('#catalogFabricResultImage').getAttribute('alt'),new RegExp(tipo));
   await ui.locator('#catalogFabricResultAdd').click();
   let dest=ui.locator('.cpj-modal[open]');await dest.locator('select[name="ambiente"]:not([disabled])').waitFor();
   await dest.locator('select[name="ambiente"]').selectOption('a1');await dest.locator('button[type="submit"]').click();
   await page.waitForFunction(id=>JSON.parse(sessionStorage.getItem('mockdb')).projetos[0].dados.ambientes[0].itens.some(l=>l.item_id===id&&l.personalizacao_foto),id);
   let dados=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mockdb')).projetos[0].dados);
   assert.equal(dados.ambientes[0].itens[0].quantidade,1);assert.equal(dados.ambientes[0].itens[0].personalizacao_foto,'https://fixture/personalizado-'+tipo+'.png');
   if(tipo==='tinta'){assert.equal(dados.ambientes[0].itens[0].personalizacao_escolhas.Tinta.codigo,'SV-202');assert.equal(dados.ambientes[0].itens[0].personalizacao_valor,80);}
   assert.equal(dados.ambientes[1].itens.length,0);
   await ui.locator('#catalogFabricResultDialog').waitFor({state:'hidden'});
   if(comercial)await page.locator('#abrir-lista').click();else await ui.locator('[data-cpj-dock="abrir"]').click();
   const row=ui.locator(`[data-pa-amb="a1"][data-pa-item="${id}"]`);await row.waitFor();
   assert.match(await row.locator('img').getAttribute('src'),new RegExp('personalizado-'+tipo));
   await row.locator('[data-cpj-qtd-input]').fill('4');await row.locator('[data-cpj-qtd-input]').press('Tab');
   await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('mockdb')).projetos[0].dados.ambientes[0].itens[0].quantidade===4);
   fs.mkdirSync('.tmp/biblioteca-personalizacoes',{recursive:true});await page.screenshot({path:'.tmp/biblioteca-personalizacoes/lista-'+tipo+(comercial?'-comercial':'')+'.png',fullPage:false});
   // A recuperação ocorre na tela independente do Comercial, sem carregar o catálogo.
   const requests=[];page.on('request',r=>requests.push(r.url()));
   const acervo='http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/PersonalizacoesIA/personalizacoes-ia.html';
   await page.goto(acervo);await page.locator('[data-open-root="itens"]').click();await page.locator('[data-category="Sofás"]').click();await page.locator(`[data-item="${id}"]`).click();
   assert.equal(await page.locator('[data-photo]').count(),1);await page.locator('[data-photo]').click();await page.locator('#piaPreview[open]').waitFor();
   assert.match(await page.locator('#piaImagem').getAttribute('src'),new RegExp('personalizado-'+tipo));
   assert.equal(await page.locator('iframe').count(),0);assert.ok(!requests.some(url=>url.includes('/Comercial/Catalogo/')),'o módulo não importa nem abre o catálogo');
   assert.equal(await page.locator('#catalogBiblioteca').count(),0);assert.equal(await page.title(),'Renderizações — Comercial');
   await page.locator('#piaFechar').click();await page.reload();await page.locator('[data-open-root="itens"]').waitFor();
   dados=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mockdb')).projetos[0].dados);
   assert.equal(dados.ambientes[0].itens[0].quantidade,4,'abrir o acervo preserva a quantidade ajustada');assert.equal(dados.ambientes[0].renders.length,1);
   fs.mkdirSync('.tmp/biblioteca-personalizacoes',{recursive:true});await page.screenshot({path:'.tmp/biblioteca-personalizacoes/'+tipo+'.png',fullPage:false});
   assert.deepEqual(errors,[]);console.log('PASS '+tipo+(comercial?' comercial':' decorador')+': acervo independente, item + foto + escolha no ambiente e quantidade editável');await page.close();
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
