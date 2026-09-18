const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const path=require('node:path');const os=require('node:os');
// createImageBitmap() (usado pra decodificar a foto atual antes de
// desenhar no crop) lança InvalidStateError pra um SVG fulfilled via
// page.route() neste Edge headless — precisa de um PNG 1x1 de verdade
// (mesma constante usada em tests/catalogo-editor-fotos-browser.cjs).
const PNG_1X1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{

// ===== Cenário 1: decorador (externo) — navega pelos 3 blocos, sem editar =====
{
 const page=await browser.newPage({viewport:{width:1600,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#7d8f7a"/></svg>');
 await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 await page.addInitScript(()=>{
  sessionStorage.setItem('catalogo_token','test');
  window.supabaseClient={rpc:async(name)=>{
   if(name==='catalogo_validar_sessao') return {data:{valido:true,empresa_id:'company',cliente_id:'client'}};
   if(name==='catalogo_carregar') return {data:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:[
     {id:'1',tipo:'Item',produto:'Sofá Um',categoria:'Sofás',foto_url:'https://fixture/sofa.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
   ]}};
   if(name==='catalogo_capas_carregar') return {data:{portal:'https://fixture/capa-portal.png'}};
   if(name==='biblioteca_carregar') return {data:{fotos:[]}};
   return {data:null};
  }};
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('.catalog-gateway').waitFor();
 // Pedido explícito do usuário, depois de ver a versão com 3 fotos lado
 // a lado: "ao invés de ser 3 fotos quero que seja uma foto só... a
 // foto será da tela toda, o funcionamento dos módulos continuam
 // normal" — só UMA <img> de fundo agora (.catalog-gateway-photo, fora
 // das zonas de clique), mas as 3 zonas (data-gateway-tile) continuam
 // existindo e navegando exatamente igual.
 assert.equal(await page.locator('.catalog-gateway-photo').count(),1,'Uma foto só cobrindo a tela, não mais uma por bloco');
 assert.equal(await page.locator('[data-gateway-tile] img').count(),0,'Zonas de clique não têm mais foto própria');
 assert.equal(await page.locator('[data-gateway-tile]').count(),3,'3 zonas de clique continuam existindo: Catálogo, Biblioteca, Módulo 3D');
 const titles=await page.locator('.catalog-gateway-title').allTextContents();
 assert.deepEqual(titles,['Catálogo','Biblioteca','Módulo 3D']);
 assert.equal(await page.locator('.catalog-gateway-edit').count(),0,'Decorador não vê botão de trocar foto');
 assert.equal(await page.locator('[data-gateway-adjust]').count(),0,'Decorador não vê o ícone de ajustar foto');
 assert.equal(await page.locator('#catalogViewSwitcher').isVisible(),false,'Ícones de imersivo/grade escondidos no Portal');
 const portalImg=await page.locator('.catalog-gateway-photo').getAttribute('src');
 assert.ok(portalImg.includes('capa-portal'),'Foto única do Portal vem da RPC catalogo_capas_carregar (chave "portal")');
 // Sem margin/gap: a foto encosta nas bordas da área abaixo do
 // cabeçalho (pedido explícito: "sem nenhuma borda branca dessa").
 const [headerBox,galleryBox]=await Promise.all([
   page.locator('.catalog-header').boundingBox(),
   page.locator('.catalog-gateway').boundingBox(),
 ]);
 assert.equal(galleryBox.x,0,'Foto do Portal encosta na borda esquerda');
 assert.ok(Math.abs(galleryBox.y-(headerBox.y+headerBox.height))<1,'Foto do Portal encosta embaixo do cabeçalho, sem gutter');
 // Pedido explícito do usuário: mesmo efeito de letter-spacing "abrindo"
 // no hover que já existe em "INSPIRE-SE" (foto ambientada do item).
 const catalogoTitle=page.locator('[data-gateway-tile="catalogo"] .catalog-gateway-title');
 const spacingBefore=await catalogoTitle.evaluate(el=>getComputedStyle(el).letterSpacing);
 await page.locator('[data-gateway-tile="catalogo"]').hover();
 await page.waitForTimeout(1300);
 const spacingAfter=await catalogoTitle.evaluate(el=>getComputedStyle(el).letterSpacing);
 assert.ok(parseFloat(spacingAfter)>parseFloat(spacingBefore),`Letra do título deve "abrir" no hover (${spacingBefore} -> ${spacingAfter})`);
 await page.mouse.move(0,0);
 await page.screenshot({path:path.join(os.tmpdir(),'catalogo-portal-decorador.png')});

 // Bloco Catálogo -> Home de categorias. Título "Categorias" foi
 // removido do corpo (duplicava o rótulo do cabeçalho, #catalogPageLabel).
 await page.locator('[data-gateway-tile="catalogo"]').click();
 await page.locator('.catalog-home-grid').waitFor();
 assert.equal(await page.locator('#catalogPageLabel').textContent(),'Categoria');

 // Logo volta pro Portal.
 await page.locator('.catalog-brand').click();
 await page.locator('.catalog-gateway').waitFor();

 // Bloco Biblioteca -> abre a Biblioteca direto, sem passar pela Home.
 // Botões "Biblioteca"/"Painel 3D" que existiam soltos no cabeçalho
 // foram removidos a pedido do usuário — no lugar deles fica um rótulo
 // com o nome da página atual (#catalogPageLabel), é ele que confirma
 // agora que o overlay certo abriu.
 await page.locator('[data-gateway-tile="biblioteca"]').click();
 await page.locator('#catalogBiblioteca:not(.hidden)').waitFor();
 assert.equal(await page.locator('#catalogPageLabel').textContent(),'Biblioteca','Rótulo do cabeçalho mostra a página atual');
 await page.locator('.catalog-brand').click();
 await page.locator('.catalog-gateway').waitFor();

 // Bloco Módulo 3D -> abre o mini-menu novo (pedido explícito do
 // usuário: "quero que apareça como se fosse outro mini menu"), não mais
 // o Painel 3D direto — o estúdio virou o 1º dos 3 cards ali dentro.
 await page.locator('[data-gateway-tile="modulo3d"]').click();
 await page.locator('.catalog-modulo3d-menu').waitFor();
 assert.equal(await page.locator('#catalogPageLabel').textContent(),'Módulo 3D');
 assert.equal(await page.locator('.catalog-modulo3d-tile').count(),3,'3 cards no mini-menu');
 await page.locator('[data-modulo3d-card="estudio"]').click();
 await page.locator('#catalogStudio:not(.hidden)').waitFor();
 assert.equal(await page.locator('#catalogPageLabel').textContent(),'Painel 3D');

 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
 await page.locator('.catalog-brand').click();
 await page.locator('.catalog-gateway').waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Portal sem overflow horizontal no mobile');
 await page.screenshot({path:path.join(os.tmpdir(),'catalogo-portal-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 await page.close();
}

// ===== Cenário 2: equipe interna — troca a foto de um bloco =====
{
 const page=await browser.newPage({viewport:{width:1600,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await page.addInitScript(()=>{
  sessionStorage.setItem('login_ok','1');
  function builder(resolveValue){
   return new Proxy({},{get(_t,prop){
    if(prop==='then') return (resolve)=>resolve(resolveValue());
    return ()=>builder(resolveValue);
   }});
  }
  window.testUpserts=[];window.testUploaded=[];
  window.supabaseClient={
   auth:{
    getSession:async()=>({data:{session:{user:{id:'user-1'}}},error:null}),
    getUser:async()=>({data:{user:{id:'user-1'}},error:null}),
   },
   from(table){
    if(table==='usuarios_empresas') return builder(()=>({data:{empresa_id:'company'},error:null}));
    if(table==='catalogo_capas'){
     return {upsert(row,opts){window.testUpserts.push({row,opts});return Promise.resolve({data:null,error:null});}};
    }
    return builder(()=>({data:[],error:null}));
   },
   rpc:async(name)=>{
    if(name==='funcionario_contexto') return {data:{ativo:true,administrador_legado:true},error:null};
    if(name==='catalogo_carregar_interno') return {data:{empresa:{nome:'Chiavari'},decorador:null,itens:[
     {id:'1',tipo:'Item',produto:'Sofá Um',categoria:'Sofás',foto_url:'https://fixture/sofa.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
    ]}};
    if(name==='catalogo_capas_carregar_interno') return {data:{}};
    return {data:null,error:null};
   },
   storage:{from(bucket){return {
    upload:async(path,file,opts)=>{window.testUploaded.push({bucket,path,type:opts?.contentType});return {error:null};},
    getPublicUrl:(path)=>({data:{publicUrl:'https://fixture/biblioteca/'+path}}),
   };}},
  };
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('.catalog-gateway').waitFor();
 // Pedido explícito do usuário: uma foto só, então um botão de trocar
 // foto só — não mais um por bloco.
 assert.equal(await page.locator('.catalog-gateway-edit').count(),1,'Equipe interna vê UM SÓ "Trocar foto", não mais um por bloco');
 await page.locator('[data-gateway-file="portal"]').setInputFiles({name:'capa.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});
 await page.waitForFunction(()=>window.testUploaded.length===1);
 assert.equal(await page.evaluate(()=>window.testUploaded[0].bucket),'biblioteca','Reaproveita o mesmo bucket da Biblioteca');
 assert.equal(await page.evaluate(()=>window.testUploaded[0].path),'company/_capas/portal.png','Caminho fixo pela chave "portal", não por uuid — substitui a foto anterior');
 assert.equal(await page.evaluate(()=>window.testUpserts.length),1);
 assert.equal(await page.evaluate(()=>window.testUpserts[0].row.chave),'portal');
 assert.equal(await page.evaluate(()=>window.testUpserts[0].opts.onConflict),'empresa_id,chave');
 const novoSrc=await page.locator('.catalog-gateway-photo').getAttribute('src');
 assert.ok(novoSrc.includes('company/_capas/portal.png'),'A imagem na tela atualiza pra nova foto sem precisar recarregar');
 // Clicar dentro do controle de trocar foto não deve navegar pro destino de nenhuma zona.
 assert.equal(await page.locator('#catalogBiblioteca').isVisible(),false);
 assert.equal(await page.locator('#catalogStudio').isVisible(),false);
 assert.deepEqual(errors,[]);
 await page.close();
}

// ===== Cenário 3: falha no upload avisa a equipe, não fica em silêncio =====
// Bug real reportado pelo usuário: "o botão trocar foto não está
// funcionando" — a causa raiz de verdade era o bucket "biblioteca" sem
// policy de UPDATE em storage.objects (corrigida no banco, ver
// 20260918000200_biblioteca_storage_update_policy.sql: a PRIMEIRA foto
// subia bem, mas TROCAR uma foto que já existia no mesmo caminho
// falhava). Além da causa raiz, trocarCapaGateway() nunca avisava a
// pessoa quando o upload falhava — só console.error, invisível sem o
// DevTools aberto, dando a impressão de "não fazer nada". Este cenário
// simula qualquer falha de upload (RLS, rede, etc.) e confere que agora
// aparece uma notificação de erro de verdade.
{
 const page=await browser.newPage({viewport:{width:1600,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await page.addInitScript(()=>{
  sessionStorage.setItem('login_ok','1');
  function builder(resolveValue){
   return new Proxy({},{get(_t,prop){
    if(prop==='then') return (resolve)=>resolve(resolveValue());
    return ()=>builder(resolveValue);
   }});
  }
  window.supabaseClient={
   auth:{
    getSession:async()=>({data:{session:{user:{id:'user-1'}}},error:null}),
    getUser:async()=>({data:{user:{id:'user-1'}},error:null}),
   },
   from(table){ return builder(()=>({data:{empresa_id:'company'},error:null})); },
   rpc:async(name)=>{
    if(name==='funcionario_contexto') return {data:{ativo:true,administrador_legado:true},error:null};
    if(name==='catalogo_carregar_interno') return {data:{empresa:{nome:'Chiavari'},decorador:null,itens:[]}};
    if(name==='catalogo_capas_carregar_interno') return {data:{}};
    return {data:null,error:null};
   },
   storage:{from(bucket){return {
    // Simula exatamente o bug real: upload rejeitado (ex.: RLS sem UPDATE).
    upload:async()=>({error:{message:'new row violates row-level security policy'}}),
    getPublicUrl:(path)=>({data:{publicUrl:'https://fixture/biblioteca/'+path}}),
   };}},
  };
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('.catalog-gateway').waitFor();
 await page.locator('[data-gateway-file="portal"]').setInputFiles({name:'capa.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});
 await page.locator('.catalog-notification.is-error').waitFor({timeout:5000});
 assert.match(await page.locator('.catalog-notification.is-error').innerText(),/Não foi possível trocar a foto/,'Falha no upload agora avisa a equipe, não fica em silêncio');
 assert.deepEqual(errors,[]);
 await page.close();
}

// ===== Cenário 4: equipe interna — "Ajustar foto" (arrastar/zoom) =====
// Pedido explícito do usuário, depois de ver o Portal com uma foto só:
// "o ícone de mover, ajustar a foto não está aparecendo também" — o
// mesmo sistema de arrastar/zoom já usado nas fotos do item
// (startInlineEditForGateway() em catalogo.mjs) agora também existe pra
// foto única do Portal.
{
 const page=await browser.newPage({viewport:{width:1600,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/png',body:PNG_1X1}));
 await page.addInitScript(()=>{
  sessionStorage.setItem('login_ok','1');
  function builder(resolveValue){
   return new Proxy({},{get(_t,prop){
    if(prop==='then') return (resolve)=>resolve(resolveValue());
    return ()=>builder(resolveValue);
   }});
  }
  window.testUploaded=[];
  window.supabaseClient={
   auth:{
    getSession:async()=>({data:{session:{user:{id:'user-1'}}},error:null}),
    getUser:async()=>({data:{user:{id:'user-1'}},error:null}),
   },
   from(table){
    if(table==='usuarios_empresas') return builder(()=>({data:{empresa_id:'company'},error:null}));
    if(table==='catalogo_capas') return {upsert(){return Promise.resolve({data:null,error:null});}};
    return builder(()=>({data:[],error:null}));
   },
   rpc:async(name)=>{
    if(name==='funcionario_contexto') return {data:{ativo:true,administrador_legado:true},error:null};
    if(name==='catalogo_carregar_interno') return {data:{empresa:{nome:'Chiavari'},decorador:null,itens:[]}};
    // Já tem uma foto salva — exercita o caminho "carrega a foto EXISTENTE
    // pra ajustar", não o de escolher uma nova do zero.
    if(name==='catalogo_capas_carregar_interno') return {data:{portal:'https://fixture/capa-portal-atual.png'}};
    return {data:null,error:null};
   },
   storage:{from(bucket){return {
    upload:async(path,file,opts)=>{window.testUploaded.push({bucket,path,type:opts?.contentType});return {error:null};},
    getPublicUrl:(path)=>({data:{publicUrl:'https://fixture/biblioteca/'+path}}),
   };}},
  };
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('.catalog-gateway').waitFor();
 assert.equal(await page.locator('[data-gateway-adjust]').count(),1,'Equipe interna vê o ícone de ajustar foto');
 await page.locator('[data-gateway-adjust]').click();
 const cropImg=page.locator('.catalog-inline-crop-img');
 await cropImg.waitFor();
 assert.equal(await page.locator('[data-crop-remove]').count(),0,'Foto única do Portal não pode ser removida, só trocada/ajustada');
 const box=await cropImg.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await page.mouse.down();
 await page.mouse.move(box.x+box.width/2+30,box.y+box.height/2+10,{steps:5});
 await page.mouse.up();
 assert.match(await cropImg.evaluate(el=>el.style.transform),/translate\(30px, 10px\)/,'Arrastar move a imagem (translate reflete o deslocamento do mouse)');
 await page.locator('[data-crop-zoom-in]').click();
 assert.match(await cropImg.evaluate(el=>el.style.transform),/scale\(1\.15\)/,'Zoom aplica no crop da foto do Portal igual no do item');
 // Mesma checagem já usada no editor de fotos do item — não confiar só
 // no .click() funcionar, confirmar que o alvo de verdade é o <button>.
 const applyBtn=page.locator('[data-crop-apply]');
 const applyBox=await applyBtn.boundingBox();
 const elAtApplyPoint=await page.evaluate(({x,y})=>{const el=document.elementFromPoint(x,y);return el?el.tagName:null;},{x:applyBox.x+applyBox.width/2,y:applyBox.y+applyBox.height/2});
 assert.equal(elAtApplyPoint,'BUTTON','Botão Aplicar não pode ficar coberto por outro elemento');
 await applyBtn.click();
 await page.waitForFunction(()=>window.testUploaded.length===1);
 assert.equal(await page.evaluate(()=>window.testUploaded[0].path),'company/_capas/portal.png','Mesmo caminho fixo por chave usado pela troca instantânea');
 await page.locator('.catalog-inline-crop-overlay').waitFor({state:'detached',timeout:5000});
 assert.equal(await page.locator('.catalog-gateway').count(),1,'Portal continua de pé depois de aplicar (renderGateway() reconstrói a tela)');
 await page.getByText('Foto atualizada',{exact:true}).waitFor();

 // Cancelar não grava nada.
 await page.locator('[data-gateway-adjust]').click();
 await page.locator('.catalog-inline-crop-img').waitFor();
 await page.locator('[data-crop-cancel]').click();
 await page.waitForTimeout(200);
 assert.equal(await page.evaluate(()=>window.testUploaded.length),1,'Cancelar não faz upload nenhum (continua só o Aplicar de antes)');
 assert.equal(await page.locator('.catalog-inline-crop-overlay').count(),0);
 assert.deepEqual(errors,[]);
 await page.close();
}

console.log('PASS: Portal com uma foto só cobrindo a tela toda (sem borda/gap), 3 zonas de clique (Catálogo/Biblioteca/Módulo 3D) navegando normal, título com efeito de letter-spacing igual ao INSPIRE-SE no hover, logo volta pro Portal, decorador só navega, equipe troca a foto única sem sair da tela, ajusta posição/zoom da foto com o mesmo editor do item, falha de upload avisa em vez de ficar em silêncio, mobile sem overflow');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
