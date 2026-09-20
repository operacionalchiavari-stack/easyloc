const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
// Visualizador de zoom da foto (pedido explícito do usuário, depois de saber que a
// otimização de carregamento do catálogo passou a servir uma versão reduzida da foto:
// "eu quero que a pessoa possa dar zoom e de fato ver os detalhes" — clicar na foto
// principal/ambientada abre um diálogo em tela cheia com a MESMA foto numa resolução
// bem maior). URLs de fixture usam o formato real do Storage
// (".../storage/v1/object/public/<bucket>/<path>") de propósito — só assim
// otimizarFoto() de verdade reescreve pra ".../render/image/public/..." com os
// parâmetros de largura/qualidade; um domínio de fixture qualquer (sem esse trecho no
// caminho) faria a função devolver a URL sem nenhuma transformação, e o teste não
// provaria nada sobre o comportamento real.
const PNG_1X1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{

// ===== Cenário 1: decorador (externo) — também pode dar zoom (não é feature de edição) =====
{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/png',body:PNG_1X1}));
 await page.addInitScript(()=>{
  sessionStorage.setItem('catalogo_token','test');
  window.supabaseClient={rpc:async(name)=>{
   if(name==='catalogo_validar_sessao') return {data:{valido:true,empresa_id:'company',cliente_id:'client'}};
   if(name==='catalogo_carregar') return {data:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:[
     {id:'1',tipo:'Item',produto:'Sofá Um',categoria:'Sofás',foto_url:'https://fixture/storage/v1/object/public/itens/sofa.png',capa_categoria:true,itens_fotos:[
      {slot:'galeria_01',tipo:'galeria',titulo:'Galeria 01',url:'https://fixture/storage/v1/object/public/itens/gal-1.png',path:'company/1/geral/galeria-01.png',ordem:1,cliente_id:null},
     ]},
   ]}};
   return {data:null};
  }};
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('.catalog-gateway').waitFor();
 await page.locator('[data-gateway-tile="catalogo"]').click();
 await page.locator('[data-home-category="sofas"]').click();
 await page.locator('[data-grid-item]').first().click();
 await page.locator('.catalog-product-section').first().waitFor();

 // Foto principal: clicar abre o diálogo com a MESMA foto numa URL
 // transformada bem maior (width=3200), nunca igual ao src pequeno que
 // já estava na tela (hero, width=1600).
 const telaSrc=await page.locator('.product-main-image').getAttribute('src');
 assert.match(telaSrc,/width=1600/,'Foto na tela usa a versão hero (1600), não a original');
 await page.locator('.product-main-image').click();
 const dialog=page.locator('#catalogPhotoZoomDialog');
 await dialog.waitFor();
 assert.equal(await dialog.evaluate(el=>el.open),true,'Diálogo de zoom abriu (showModal)');
 // Decorador: item com só a foto principal (sem Detalhes) e 1 ambientada — nada pra passar: sem setas.
 assert.equal(await page.locator('#catalogPhotoZoomNext').isVisible()||await page.locator('#catalogPhotoZoomPrev').isVisible()||await page.locator('#catalogPhotoZoomCounter').isVisible(),false,'Foto única: sem setas nem contador');
 // A versão pequena que já está na tela aparece na hora; a grande a substitui quando decodifica.
 await page.waitForFunction(()=>/width=3200/.test(document.getElementById('catalogPhotoZoomImage').getAttribute('src')||''));
 const zoomSrc=await page.locator('#catalogPhotoZoomImage').getAttribute('src');
 assert.match(zoomSrc,/render\/image\/public/,'Pede a versão transformada do Storage, não o objeto cru');
 assert.match(zoomSrc,/width=3200/,'Largura do zoom é a maior de todas (IMG_WIDTH.zoom)');
 assert.match(zoomSrc,/resize=contain/,'resize=contain presente — sem isso a foto viria cortada/esticada (bug real já corrigido)');
 assert.notEqual(zoomSrc,telaSrc,'URL do zoom é diferente da URL pequena que já estava na tela');

 // Arrastar move a imagem (translate reflete o deslocamento do mouse).
 const stage=page.locator('#catalogPhotoZoomStage');
 const box=await stage.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await page.mouse.down();
 await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2+12,{steps:5});
 await page.mouse.up();
 const zoomImg=page.locator('#catalogPhotoZoomImage');
 assert.match(await zoomImg.evaluate(el=>el.style.transform),/translate\(35px, 12px\)/,'Arrastar reflete o deslocamento do mouse');

 // Roda do mouse dá zoom de verdade (scale sobe).
 await stage.hover();
 await page.mouse.wheel(0,-100);
 const scaleAfterWheel=await zoomImg.evaluate(el=>{const m=el.style.transform.match(/scale\(([\d.]+)\)/);return m?parseFloat(m[1]):1;});
 assert.ok(scaleAfterWheel>1,'Rolar pra cima aumenta o zoom (scale>1)');

 // Botões +/- também funcionam.
 const scaleBefore=scaleAfterWheel;
 await page.locator('[data-photo-zoom-in]').click();
 const scaleAfterButton=await zoomImg.evaluate(el=>parseFloat(el.style.transform.match(/scale\(([\d.]+)\)/)[1]));
 assert.ok(scaleAfterButton>scaleBefore,'Botão "+" aumenta o zoom ainda mais');
 await page.locator('[data-photo-zoom-out]').click();
 await page.locator('[data-photo-zoom-out]').click();
 const scaleAfterOut=await zoomImg.evaluate(el=>parseFloat(el.style.transform.match(/scale\(([\d.]+)\)/)[1]));
 assert.ok(scaleAfterOut<scaleAfterButton,'Botão "-" reduz o zoom');

 // Redefinir volta ao estado inicial (scale 1, sem deslocamento).
 await page.locator('[data-photo-zoom-reset]').click();
 assert.equal(await zoomImg.evaluate(el=>el.style.transform),'translate(0px, 0px) scale(1)','Redefinir volta ao estado inicial exato');

 // Fechar pelo botão.
 await page.locator('#catalogPhotoZoomClose').click();
 await page.waitForFunction(()=>!document.getElementById('catalogPhotoZoomDialog').open);

 // Reabrir depois de ter dado zoom antes: o estado NÃO fica "vazado" de
 // uma sessão pra outra (dialog "close" reseta scale/x/y).
 await page.locator('.product-main-image').click();
 await dialog.waitFor();
 assert.equal(await zoomImg.evaluate(el=>el.style.transform),'translate(0px, 0px) scale(1)','Reabrir começa sempre do zero, não herda zoom da sessão anterior');
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.getElementById('catalogPhotoZoomDialog').open);
 assert.equal(await zoomImg.evaluate(el=>el.style.transform),'translate(0px, 0px) scale(1)','Esc fecha (nativo do <dialog>) e também reseta o zoom');

 // (Precisa vir ANTES de a ambientada ser ampliada pela 1ª vez: o navegador guarda em cache a versão grande
 // de toda foto já ampliada, e uma "grande retida" já em cache responderia na hora, sem testar nada.)
 // ===== Bug real: "quando eu clico pra ampliar uma foto ele abre a ÚLTIMA foto que ampliei, depois pisca e abre a foto que realmente é pra aparecer" =====
 // Causa: o <img> do diálogo é um elemento só; trocar o src mantinha a foto anterior na tela até a nova
 // (3200px) terminar de carregar. Aqui a grande da ambientada FICA RETIDA (como numa rede lenta) enquanto
 // um gravador anota, a cada quadro, qual foto está sendo mostrada e se está visível.
 await page.locator('.product-main-image').click();           // 1ª abertura: a foto PRINCIPAL (sofa.png)
 await page.waitForFunction(()=>/sofa\.png.*width=3200/.test(document.getElementById('catalogPhotoZoomImage').getAttribute('src')||''));
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.getElementById('catalogPhotoZoomDialog').open);
 // O evento 'close' do <dialog> dispara numa tarefa DEPOIS de open virar false (era uma corrida: às vezes a leitura vinha antes) — espera o <img> esvaziar.
 await page.waitForFunction(()=>!document.getElementById('catalogPhotoZoomImage').hasAttribute('src'),null,{timeout:3000}).catch(()=>{});
 assert.equal(await page.evaluate(()=>document.getElementById('catalogPhotoZoomImage').hasAttribute('src')),false,'Fechar esvazia o <img> — nada da foto anterior sobra pra próxima abertura');
 let liberaGrande;const grandeRetida=new Promise(r=>{liberaGrande=r;});
 await page.route(u=>/gal-1\.png/.test(u.href)&&/width=3200/.test(u.href),async route=>{await grandeRetida;await route.fulfill({contentType:'image/png',body:PNG_1X1});});
 await page.evaluate(()=>{window.__frames=[];const img=document.getElementById('catalogPhotoZoomImage');const tick=()=>{window.__frames.push({src:img.getAttribute('src')||'',ready:img.classList.contains('is-ready'),op:+getComputedStyle(img).opacity});window.__raf=requestAnimationFrame(tick);};tick();});
 await page.locator('.product-event-image').click();           // 2ª abertura: OUTRA foto (gal-1.png), grande retida
 await page.waitForFunction(()=>window.__frames.some(fr=>/gal-1\.png/.test(fr.src)&&fr.ready&&fr.op>0.5));
 assert.equal(await page.evaluate(()=>document.getElementById('catalogPhotoZoomDialog').open),true);
 const durante=await page.evaluate(()=>window.__frames.slice());
 assert.equal(durante.filter(fr=>/sofa\.png/.test(fr.src)).length,0,'NUNCA aparece a foto da abertura anterior (sofa.png) — nem por um quadro');
 const primeiraVisivel=durante.find(fr=>fr.ready&&fr.op>0.5);
 assert.ok(primeiraVisivel&&/gal-1\.png/.test(primeiraVisivel.src),'A primeira coisa visível já é a foto CERTA (a versão pequena que estava na tela)');
 assert.ok(!/width=3200/.test(primeiraVisivel.src),'...e aparece antes de a versão grande chegar (o clique responde na hora, sem esperar 3200px)');
 liberaGrande();
 await page.waitForFunction(()=>/gal-1\.png.*width=3200/.test(document.getElementById('catalogPhotoZoomImage').getAttribute('src')||''));
 await page.waitForTimeout(300);
 const depois=await page.evaluate(()=>{cancelAnimationFrame(window.__raf);return window.__frames.slice();});
 assert.equal(depois.filter(fr=>/sofa\.png/.test(fr.src)).length,0,'Nenhum quadro, do começo ao fim, mostrou a foto anterior');
 const apagou=depois.filter((fr,i)=>i>0&&depois[i-1].ready&&depois[i-1].op>0.5&&(!fr.ready||fr.op<0.5)&&/gal-1\.png/.test(fr.src));
 assert.equal(apagou.length,0,'Trocar da pequena pra grande não faz a foto sumir/piscar (nunca volta a ficar invisível depois de aparecer)');
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.getElementById('catalogPhotoZoomDialog').open);

 // Foto ambientada (Ambientada 1, já preenchida) também abre o zoom,
 // com a URL crua certa (não a mesma da foto principal).
 await page.locator('.product-event-image').click();
 await dialog.waitFor();
 await page.waitForFunction(()=>/gal-1\.png.*width=3200/.test(document.getElementById('catalogPhotoZoomImage').getAttribute('src')||''));
 const zoomSrcEvento=await page.locator('#catalogPhotoZoomImage').getAttribute('src');
 assert.match(zoomSrcEvento,/gal-1\.png/,'Zoom da ambientada usa a foto certa (galeria_01), não a principal');
 await page.keyboard.press('Escape');

 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
 await page.locator('.product-main-image').click();
 await dialog.waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Diálogo de zoom sem overflow horizontal no mobile');
 await page.keyboard.press('Escape');

 assert.deepEqual(errors,[]);
 await page.close();
}

// ===== Cenário 2: equipe interna — zoom não conflita com edição =====
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
  window.supabaseClient={
   auth:{
    getSession:async()=>({data:{session:{user:{id:'user-1'}}},error:null}),
    getUser:async()=>({data:{user:{id:'user-1'}},error:null}),
   },
   from(table){
    if(table==='usuarios_empresas') return builder(()=>({data:{empresa_id:'company'},error:null}));
    return builder(()=>({data:[],error:null}));
   },
   rpc:async(name)=>{
    if(name==='funcionario_contexto') return {data:{ativo:true,administrador_legado:true},error:null};
    if(name==='catalogo_carregar_interno') return {data:{empresa:{nome:'Chiavari'},decorador:null,itens:[
     {id:'1',tipo:'Item',produto:'Sofá Um',categoria:'Sofás',foto_url:'https://fixture/storage/v1/object/public/itens/sofa-1.png',capa_categoria:false,
      itens_fotos:[{slot:'detalhe_01',tipo:'detalhe',titulo:'Detalhe 01',url:'https://fixture/storage/v1/object/public/itens/det-1.png',path:'company/1/geral/detalhe-01.png',ordem:1,cliente_id:null}]},
    ]}};
    if(name==='catalogo_capas_carregar_interno') return {data:{}};
    if(name==='biblioteca_carregar_interno') return {data:{fotos:[]}};
    return {data:null,error:null};
   },
   storage:{from(bucket){return {
    upload:async()=>({error:null}),
    remove:async()=>({error:null}),
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

 // Clicar no lápis de edição NÃO abre o zoom — continua abrindo o editor
 // de recorte inline (badge é irmão da <img>, não filho, então o
 // clique nunca alcança o closest('.product-main-image')).
 await page.locator('#produto-1 [data-inline-edit="principal"]').click();
 await page.locator('#produto-1 .catalog-inline-crop-img').waitFor();
 assert.equal(await page.locator('#catalogPhotoZoomDialog[open]').count(),0,'Clicar no lápis abre o editor, não o zoom');
 await page.locator('#produto-1 [data-crop-cancel]').click();
 await page.waitForFunction(()=>!document.querySelector('#produto-1 .catalog-inline-crop-overlay'));

 // Clicar na própria foto (fora do lápis) abre o zoom normalmente.
 await page.locator('#produto-1 .product-main-image').click();
 await page.locator('#catalogPhotoZoomDialog[open]').waitFor();
 await page.waitForFunction(()=>/width=3200/.test(document.getElementById('catalogPhotoZoomImage').getAttribute('src')||''));
 assert.match(await page.locator('#catalogPhotoZoomImage').getAttribute('src'),/width=3200/);
 // Pedido do usuário: "quero poder trocar as fotos pelo preview" — o item tem a principal + o Detalhe 1 (o
 // Detalhe 2 é um slot vazio, que a equipe vê no carrossel mas NÃO entra no visualizador): 2 fotos, setas e contador.
 assert.equal(await page.locator('#catalogPhotoZoomNext').isVisible(),true,'Item com principal + detalhe: o visualizador tem seta "próxima"');
 assert.equal((await page.locator('#catalogPhotoZoomCounter').textContent()).trim(),'1 / 2','Contador ignora o slot vazio (2 fotos, não 3)');
 await page.locator('#catalogPhotoZoomNext').click();
 await page.waitForFunction(()=>/det-1/.test(document.getElementById('catalogPhotoZoomImage').getAttribute('src')||''));
 assert.equal((await page.locator('#catalogPhotoZoomCounter').textContent()).trim(),'2 / 2','Seta "próxima" mostra o Detalhe 1');
 await page.keyboard.press('ArrowLeft');
 await page.waitForFunction(()=>/sofa-1/.test(document.getElementById('catalogPhotoZoomImage').getAttribute('src')||'')&&!/det-1/.test(document.getElementById('catalogPhotoZoomImage').getAttribute('src')||''));
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.getElementById('catalogPhotoZoomDialog').open);

 // Detalhe 2 é um slot VAZIO (placeholder "+") — clicar na foto (que
 // mostra o SVG genérico "Sem foto") não deve abrir zoom nenhum.
 await page.locator('#produto-1 [data-main-nav="next"]').click();
 await page.waitForFunction(()=>document.querySelector('#produto-1 .product-main-media')?.dataset.activeSlot==='detalhe_01');
 await page.locator('#produto-1 [data-main-nav="next"]').click();
 // dataset.activeSlot muda na hora (síncrono), mas a troca de src/classe
 // do <img> só acontece depois do crossfade de 120ms (ver commit() em
 // renderMainSlide()) — esperar só o dataset seria uma corrida real
 // (achado rodando este teste: passava o dataset, ainda sem a classe).
 await page.waitForFunction(()=>document.querySelector('#produto-1 .product-main-image')?.classList.contains('is-empty-slide'));
 assert.equal(await page.locator('#produto-1 .product-main-image').evaluate(el=>el.classList.contains('is-empty-slide')),true);
 await page.locator('#produto-1 .product-main-image').click();
 await page.waitForTimeout(200);
 assert.equal(await page.evaluate(()=>document.getElementById('catalogPhotoZoomDialog').open),false,'Slot vazio (placeholder "Sem foto") não abre o zoom');

 assert.deepEqual(errors,[]);
 await page.close();
}

console.log('PASS: visualizador de zoom da foto — clique abre em resolução bem maior (width=3200, resize=contain), arrastar/roda/botões mudam o transform de verdade, redefinir volta ao estado inicial, fechar (botão ou Esc) reseta pra próxima abertura, foto ambientada usa a URL certa, não conflita com o lápis de edição nem abre pra um slot vazio, sem overflow mobile');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
