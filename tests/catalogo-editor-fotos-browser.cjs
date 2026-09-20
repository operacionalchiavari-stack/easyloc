const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const path=require('node:path');const os=require('node:os');
// PNG 1x1 de verdade — createImageBitmap() não decodifica o SVG fulfill() do Playwright
// nesse Edge headless (falha "InvalidStateError: The source image could not be decoded"),
// então qualquer fixture que passe pelo editor inline (que usa createImageBitmap) precisa
// ser um PNG válido, não um SVG sintético como o resto dos testes de catálogo usa.
const PNG_1X1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{

// ===== Cenário 1: decorador (externo) — nunca vê nenhum controle de edição =====
{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/png',body:PNG_1X1}));
 await page.addInitScript(()=>{
  sessionStorage.setItem('catalogo_token','test');
  window.supabaseClient={rpc:async(name)=>{
   if(name==='catalogo_validar_sessao') return {data:{valido:true,empresa_id:'company',cliente_id:'client'}};
   if(name==='catalogo_carregar') return {data:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:[
     {id:'1',tipo:'Item',produto:'Sofá Um',categoria:'Sofás',foto_url:'https://fixture/sofa.png',capa_categoria:true,itens_fotos:[]},
   ]}};
   return {data:null};
  }};
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('.catalog-gateway').waitFor();
 await page.locator('[data-gateway-tile="catalogo"]').click();
 await page.locator('[data-home-category="sofas"]').click();
 // Categoria abre em grade por padrão agora (pedido explícito do
 // usuário) — clica no card do item pra entrar na imersiva.
 await page.locator('[data-grid-item]').first().click();
 await page.locator('.catalog-product-section').first().waitFor();
 assert.equal(await page.locator('[data-inline-edit]').count(),0,'Decorador não vê nenhum badge/ponto de edição');
 assert.equal(await page.locator('.catalog-capa-toggle').count(),0,'Decorador não vê o botão de capa');
 // Item sem nenhuma foto de Detalhe cadastrada: pro decorador (sem acesso
 // interno) o carrossel da foto principal nem ganha as posições vazias de
 // Detalhe (mainSlides só inclui placeholder vazio pra equipe) — sobra só
 // 1 slide (a própria principal), então nenhuma seta/pontinho aparece.
 assert.equal(await page.locator('.product-main-nav').count(),0,'Sem Detalhe cadastrado + sem acesso interno = só 1 slide, nenhuma seta de navegação');
 assert.equal(await page.locator('.product-main-dot').count(),0);
 assert.deepEqual(errors,[]);
 await page.close();
}

// ===== Cenário 2: equipe interna — fluxo completo de edição inline =====
{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
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
  window.testItemUpdates=[];window.testFotosInserted=[];window.testFotosDeleted=[];window.testStorageUploaded=[];window.testStorageRemoved=[];
  window.supabaseClient={
   auth:{
    getSession:async()=>({data:{session:{user:{id:'user-1'}}},error:null}),
    getUser:async()=>({data:{user:{id:'user-1'}},error:null}),
   },
   from(table){
    if(table==='usuarios_empresas') return builder(()=>({data:{empresa_id:'company'},error:null}));
    if(table==='itens'){
     return {update(payload){return {eq:(col,val)=>{window.testItemUpdates.push({col,val,payload});return Promise.resolve({error:null});}};}};
    }
    if(table==='itens_fotos'){
     return {
      insert(row){window.testFotosInserted.push(row);return Promise.resolve({error:null});},
      delete(){
       const filters={};
       const chain={eq(col,val){filters[col]=val;return chain;},is(col,val){filters[col]=val;return chain;},then(resolve){window.testFotosDeleted.push({...filters});resolve({error:null});}};
       return chain;
      },
     };
    }
    return builder(()=>({data:[],error:null}));
   },
   rpc:async(name)=>{
    if(name==='funcionario_contexto') return {data:{ativo:true,administrador_legado:true},error:null};
    if(name==='catalogo_carregar_interno') return {data:{empresa:{nome:'Chiavari'},decorador:null,itens:[
     {id:'1',tipo:'Item',produto:'Sofá Um',categoria:'Sofás',foto_url:'https://fixture/sofa-1.png',capa_categoria:false,
      itens_fotos:[{slot:'detalhe_01',tipo:'detalhe',titulo:'Detalhe 01',url:'https://fixture/det-1.png',path:'company/1/geral/detalhe-01.png',ordem:1,cliente_id:null},
                   {slot:'galeria_01',tipo:'galeria',titulo:'Galeria 01',url:'https://fixture/gal-1.png',path:'company/1/geral/galeria-01.png',ordem:1,cliente_id:null}]},
    ]}};
    if(name==='catalogo_capas_carregar_interno') return {data:{}};
    if(name==='biblioteca_carregar_interno') return {data:{fotos:[]}};
    return {data:null,error:null};
   },
   storage:{from(bucket){return {
    upload:async(path,file,opts)=>{window.testStorageUploaded.push({bucket,path,type:opts?.contentType});return {error:null};},
    remove:async(paths)=>{window.testStorageRemoved.push(...paths);return {error:null};},
    getPublicUrl:(path)=>({data:{publicUrl:'https://fixture/itens/'+path}}),
   };}},
  };
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('.catalog-gateway').waitFor();
 await page.locator('[data-gateway-tile="catalogo"]').click();
 await page.locator('[data-home-category="sofas"]').click();
 await page.locator('[data-grid-item]').first().click();
 await page.locator('#produto-1').waitFor();

 // Modo "dentro do sistema" (login_ok): o rótulo da página também fica no
 // centro exato da tela, e a busca continua à direita — como o rótulo saiu
 // do fluxo do cabeçalho pra ser centralizado de verdade, nada mais
 // empurrava a busca pra direita neste modo (antes era o flex:1 dele).
 // Espera a animação de rolagem do rótulo (linha do tempo do cabeçalho, ~640ms
 // depois de entrar na categoria) terminar — no meio dela o nome ainda está
 // deslizando pro centro. Só a do próprio rótulo, não document.getAnimations():
 // outras animações infinitas da tela (ex.: faixa de itens relacionados)
 // nunca terminam.
 await page.waitForFunction(()=>document.getElementById('catalogPageLabel').getAnimations().length===0);
 const centroDoRotulo=await page.evaluate(()=>{const h=document.querySelector('.catalog-header').getBoundingClientRect();const l=document.getElementById('catalogPageLabel').getBoundingClientRect();const s=document.querySelector('.catalog-search').getBoundingClientRect();return {offset:Math.abs((l.left+l.right)/2-(h.left+h.right)/2),buscaAEsquerda:s.left<(h.left+h.right)/2};});
 assert.ok(centroDoRotulo.offset<=1,'Rótulo da página centralizado também no modo dentro do sistema');
 assert.equal(centroDoRotulo.buscaAEsquerda,false,'Busca continua no lado direito do cabeçalho neste modo');

 // Estrutura: badge na principal, carrossel com 3 posições (principal +
 // Detalhe 1 preenchido + Detalhe 2 vazio — placeholder só aparece pra
 // quem tem acesso interno), 3 pontinhos de Ambientada, botão de capa.
 // Pedido explícito do usuário: "quero que a pessoa veja os detalhes no
 // mesmo lugar da foto principal, quero que tenha uma seta esmaecida
 // premium onde a pessoa troque a foto no próprio local da foto
 // principal" — não existe mais galeria de Detalhes separada.
 assert.equal(await page.locator('#produto-1 [data-inline-edit="principal"]').count(),1);
 assert.equal(await page.locator('#produto-1 .product-main-dot').count(),3,'Carrossel: principal + Detalhe 1 (preenchido) + Detalhe 2 (placeholder vazio, só equipe)');
 assert.equal(await page.locator('#produto-1 .product-main-nav').count(),2,'Setas de navegação aparecem com 2+ slides');
 // Pedido do usuário: "só quero que apareça as setas quando eu passar o mouse por cima... não quero ela branca,
 // quero com esse efeito igual da home" — setas escondidas em repouso, aparecem com o mouse na foto, em preto a
 // 50% (o mesmo preto/.5 do escurecer dos blocos do Portal) com a seta branca; os pontinhos avisam o resto do tempo.
 const setaEstado=()=>page.locator('#produto-1 .product-main-nav-next').evaluate(el=>{const cs=getComputedStyle(el);return {opacidade:Number(cs.opacity),cor:cs.color,fundo:cs.backgroundColor};});
 await page.mouse.move(5,5);await page.waitForTimeout(800);
 assert.equal((await setaEstado()).opacidade,0,'Sem o mouse na foto as setas ficam escondidas');
 assert.ok(await page.locator('#produto-1 .product-main-dots').isVisible(),'...mas os pontinhos de posição continuam visíveis (avisam que há mais fotos)');
 const midia=await page.locator('#produto-1 .product-main-media').boundingBox();
 await page.mouse.move(midia.x+midia.width/2,midia.y+midia.height/2);await page.waitForTimeout(800);
 const noHover=await setaEstado();
 assert.equal(noHover.opacidade,1,'Com o mouse na foto as setas aparecem');
 assert.equal(noHover.fundo,'rgba(0, 0, 0, 0.5)','Círculo preto a 50% (o mesmo escurecer da home), não branco');
 assert.equal(noHover.cor,'rgb(255, 255, 255)','Seta branca');
 await page.mouse.move(5,5);await page.waitForTimeout(800);
 await page.locator('#produto-1 .product-main-nav-next').focus();await page.waitForTimeout(800);
 assert.equal((await setaEstado()).opacidade,1,'Com o foco do teclado na seta ela aparece (senão não dá pra trocar de foto sem mouse)');
 await page.evaluate(()=>document.activeElement?.blur());
 assert.equal(await page.locator('#produto-1 .catalog-event-slot-dot').count(),3);
 assert.equal(await page.locator('#produto-1 .catalog-event-slot-dot.is-filled').count(),1,'Só Ambientada 1 está preenchida');
 assert.match(await page.locator('#produto-1 .catalog-capa-toggle').textContent(),/Definir como capa/);

 // Ajustar a foto principal: abre com a foto existente carregada, arrastar
 // muda x/y, zoom muda a escala, aplicar sobe e atualiza itens.foto_url.
 await page.locator('#produto-1 [data-inline-edit="principal"]').click();
 const cropImg=page.locator('#produto-1 .catalog-inline-crop-img');
 await cropImg.waitFor();
 const box=await cropImg.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await page.mouse.down();
 await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2+15,{steps:5});
 await page.mouse.up();
 const transformAfterDrag=await cropImg.evaluate(el=>el.style.transform);
 assert.match(transformAfterDrag,/translate\(40px, 15px\)/,'Arrastar move a imagem (translate reflete o deslocamento do mouse)');
 await page.locator('#produto-1 [data-crop-zoom-in]').click();
 await page.locator('#produto-1 [data-crop-zoom-in]').click();
 const transformAfterZoom=await cropImg.evaluate(el=>el.style.transform);
 assert.match(transformAfterZoom,/scale\(1\.3\)/,'Dois cliques de zoom (+0.15 cada) somam 1.3');
 // Trava o bug real já encontrado: a barra de ferramentas ficava fora da
 // caixa da foto (abaixo dela) e era coberta pela seção seguinte — checa
 // que o ponto central do botão Aplicar realmente resolve pro próprio
 // <button>, não pra outro elemento por cima.
 const applyBtn=page.locator('#produto-1 [data-crop-apply]');
 const applyBox=await applyBtn.boundingBox();
 const elAtApplyPoint=await page.evaluate(({x,y})=>{const el=document.elementFromPoint(x,y);return el?el.tagName:null;},{x:applyBox.x+applyBox.width/2,y:applyBox.y+applyBox.height/2});
 assert.equal(elAtApplyPoint,'BUTTON','Botão Aplicar não pode ficar coberto por outro elemento');
 await applyBtn.click();
 // O editor de recorte agora grava JPEG, não PNG sem compressão (bug real
 // corrigido: fotos chegavam a 8-16MB cada só por causa disso) — o
 // caminho de upload segue a extensão do blob de verdade, então vira .jpg.
 await page.waitForFunction(()=>window.testStorageUploaded.some(u=>u.path==='company/1/principal.jpg'&&u.type==='image/jpeg'));
 assert.ok(await page.evaluate(()=>window.testItemUpdates.some(u=>u.val==='1'&&'foto_url' in u.payload)),'itens.foto_url atualizado');
 await page.waitForFunction(()=>!document.querySelector('#produto-1 .catalog-inline-crop-overlay'),null,{timeout:5000});
 await page.waitForFunction(()=>document.querySelector('#produto-1 .product-main-image')?.src.includes('company/1/principal.jpg'));

 // Navegar pelo carrossel: depois de aplicar a principal, o slide ativo
 // continua "principal" (preserveSlot) — avançar uma vez cai no Detalhe 1
 // (preenchido) e o lápis "retargeta" sozinho pro slot em foco (pedido
 // explícito do usuário: "quero que a pessoa veja os detalhes no mesmo
 // lugar da foto principal").
 await page.locator('#produto-1 [data-main-nav="next"]').click();
 await page.waitForFunction(()=>document.querySelector('#produto-1 .product-main-media')?.dataset.activeSlot==='detalhe_01');
 assert.equal(await page.locator('#produto-1 [data-inline-edit="detalhe_01"]').count(),1,'Badge de edição retargeta pro slot em foco (Detalhe 1)');
 assert.equal(await page.locator('#produto-1 .catalog-inline-edit-badge').textContent(),'✎','Detalhe 1 está preenchido, badge mostra lápis');

 // Detalhe 2 (vazio): avançar mais uma vez troca o badge pra "+"; clicar
 // já abre o seletor de arquivo do sistema na hora — sem exigir um
 // segundo clique (pedido explícito do usuário: "hoje eu estou tendo que
 // colocar duas vezes").
 await page.locator('#produto-1 [data-main-nav="next"]').click();
 await page.waitForFunction(()=>document.querySelector('#produto-1 .product-main-media')?.dataset.activeSlot==='detalhe_02');
 const badgeDetalhe2=page.locator('#produto-1 [data-inline-edit="detalhe_02"]');
 assert.equal(await badgeDetalhe2.textContent(),'+','Detalhe 2 está vazio, badge vira "+"');
 assert.match(await badgeDetalhe2.getAttribute('aria-label'),/Adicionar Detalhe 2/);
 const filaSeletor=page.waitForEvent('filechooser');
 await badgeDetalhe2.click();
 const seletor=await filaSeletor;
 assert.ok(await seletor.element().evaluate((el)=>el.hasAttribute('data-crop-swap')),'O seletor que abriu sozinho é o input do slot de Detalhe 2');
 await page.locator('#produto-1 .catalog-inline-crop-pick').waitFor();
 assert.equal(await page.locator('#produto-1 .catalog-inline-crop-img').count(),0,'Nada pra arrastar ainda — slot estava vazio');
 await seletor.setFiles({name:'detalhe.png',mimeType:'image/png',buffer:PNG_1X1});
 await page.locator('#produto-1 .catalog-inline-crop-img').waitFor();
 await page.locator('#produto-1 [data-crop-apply]').click();
 await page.waitForFunction(()=>window.testFotosInserted.some(f=>f.slot==='detalhe_02'));
 const inserted=await page.evaluate(()=>window.testFotosInserted.find(f=>f.slot==='detalhe_02'));
 assert.equal(inserted.tipo,'detalhe');assert.equal(inserted.item_id,'1');assert.equal(inserted.cliente_id,null);
 // Depois de gravar, o slide em foco continua Detalhe 2 (preserveSlot) —
 // mas agora com a foto nova, não mais o placeholder vazio.
 await page.waitForFunction(()=>document.querySelector('#produto-1 .product-main-image')?.src.includes('detalhe-02'));
 assert.equal(await page.locator('#produto-1 .product-main-dot').count(),3,'Continuam 3 posições no carrossel — Detalhe 2 só deixou de ser placeholder');

 // Ambientada 1 (preenchida): cancelar não grava nada — compara a
 // contagem de chamadas ANTES/DEPOIS (não com zero: o passo anterior, ao
 // trocar o Detalhe 2 vazio, já gravou 1 delete-antes-do-insert próprio
 // dele — ver trocarFotoSlot()).
 const deletedCountBeforeCancel=await page.evaluate(()=>window.testFotosDeleted.length);
 await page.locator('#produto-1 [data-inline-edit="galeria_01"]').click();
 await page.locator('#produto-1 .catalog-inline-crop-img').waitFor();
 await page.locator('#produto-1 [data-crop-cancel]').click();
 await page.waitForFunction(()=>!document.querySelector('#produto-1 .catalog-inline-crop-overlay'));
 assert.equal(await page.evaluate(()=>window.testFotosDeleted.length),deletedCountBeforeCancel,'Cancelar não grava nada no banco');

 // Ambientada 1: remover de verdade.
 await page.locator('#produto-1 [data-inline-edit="galeria_01"]').click();
 await page.locator('#produto-1 [data-crop-remove]').waitFor();
 await page.locator('#produto-1 [data-crop-remove]').click();
 await page.waitForFunction(()=>window.testFotosDeleted.some(f=>f.slot==='galeria_01'));
 const deleted=await page.evaluate(()=>window.testFotosDeleted.find(f=>f.slot==='galeria_01'));
 assert.equal(deleted.item_id,'1');assert.equal(deleted.cliente_id,null);
 assert.ok(await page.evaluate(()=>window.testStorageRemoved.includes('company/1/geral/galeria-01.png')));
 await page.waitForFunction(()=>document.querySelectorAll('#produto-1 .catalog-event-slot-dot.is-filled').length===0);

 // Capa da categoria.
 await page.locator('#produto-1 [data-capa-toggle]').click();
 await page.waitForFunction(()=>window.testItemUpdates.some(u=>u.val==='1'&&u.payload.capa_categoria===true));
 await page.waitForFunction(()=>/Capa de/.test(document.querySelector('#produto-1 .catalog-capa-toggle')?.textContent||''));

 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Sem overflow horizontal no mobile');
 await page.screenshot({path:path.join(os.tmpdir(),'catalogo-editor-inline-mobile.png')});
 assert.deepEqual(errors,[]);
 await page.close();
}

console.log('PASS: badges/pontos de edição só pra equipe interna, arrastar/zoom refletem no transform, trocar foto principal, adicionar foto em slot vazio, cancelar não grava, remover apaga do banco e do storage, capa da categoria, mobile sem overflow');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
