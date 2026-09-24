const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const path=require('node:path');const os=require('node:os');
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{

// ===== Cenário 1: decorador (externo) — só visualiza, sem upload/remoção =====
{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#8fae9b"/></svg>');
 await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 // sofa-2.png fica com uma proporção BEM diferente de sofa-1.png (que
 // segue o fallback 300×300 acima) — necessário pra provar de verdade a
 // grade uniforme (ver asserção logo abaixo). Registrada DEPOIS do
 // catch-all de propósito: no Playwright, quando 2 rotas casam a mesma
 // URL, a ÚLTIMA registrada vence — sem essa ordem, o catch-all 300×300
 // sempre responderia primeiro e essa rota mais específica nunca seria
 // usada (achado implementando: a 1ª tentativa de verificação visual
 // deste recurso, fora da suíte, caiu exatamente nessa pegadinha).
 const tallSvg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="600"><rect width="300" height="600" fill="#8fae9b"/></svg>');
 await page.route('https://fixture/biblioteca/sofa-2.png',r=>r.fulfill({contentType:'image/svg+xml',body:tallSvg}));
 await page.addInitScript(()=>{
  sessionStorage.setItem('catalogo_token','test');
  window.libraryCalls=[]; window.confirm=()=>true; window.supabaseClient={rpc:async(name,args)=>{ if(name==='biblioteca_reordenar'||name==='biblioteca_remover'){window.libraryCalls.push({name,args});return {error:null};}
   if(name==='catalogo_validar_sessao') return {data:{valido:true,empresa_id:'company',cliente_id:'client'}};
   if(name==='catalogo_carregar') return {data:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:[
     {id:'1',tipo:'Item',produto:'Sofá Um',categoria:'Sofás',foto_url:'https://fixture/sofa.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
     {id:'2',tipo:'Item',produto:'Bar Um',categoria:'Bares',foto_url:'https://fixture/bar.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
   ]}};
   if(name==='biblioteca_carregar') return {data:{fotos:[
     {id:'f1',categoria:'Sofás',titulo:null,url:'https://fixture/biblioteca/sofa-1.png',path:'company/sofas/1.png',ordem:null},
     {id:'f2',categoria:'Sofás',titulo:null,url:'https://fixture/biblioteca/sofa-2.png',path:'company/sofas/2.png',ordem:null},
   ]}};
   return {data:null};
  }};
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 // Primeira tela agora é o Portal — o bloco "Biblioteca" leva direto pra
 // lá (o botão homônimo que existia no cabeçalho foi removido a pedido
 // do usuário, ver .catalog-page-label em catalogo.css/mjs).
 await page.locator('.catalog-gateway').waitFor();
 await page.locator('[data-gateway-tile="biblioteca"]').click();
 await page.locator('#catalogBiblioteca:not(.hidden)').waitFor();
 await page.locator('[data-library-folder]').first().waitFor();
 const centroPastas = await page.evaluate(() => {
   const area = document.querySelector('#catalogBibliotecaFolders > .catalog-grid-wrap').getBoundingClientRect();
   const cards = [...document.querySelectorAll('[data-library-folder]')].map(el => el.getBoundingClientRect());
   return { x: (Math.min(...cards.map(r => r.left)) + Math.max(...cards.map(r => r.right))) / 2,
     y: (Math.min(...cards.map(r => r.top)) + Math.max(...cards.map(r => r.bottom))) / 2,
     esperadoX: area.left + area.width / 2, esperadoY: area.top + area.height / 2 };
 });
 assert.ok(Math.abs(centroPastas.x - centroPastas.esperadoX) < 2, 'Pastas centralizadas horizontalmente');
 assert.ok(Math.abs(centroPastas.y - centroPastas.esperadoY) < 2, 'Pastas centralizadas verticalmente');
 assert.equal(await page.locator('#catalogGrid').isVisible(),false,'Grade de produtos some quando a Biblioteca abre');
 assert.equal(await page.locator('[data-library-folder]').count(),2,'Uma pasta por categoria existente (Sofás, Bares)');
 const sofaMeta=await page.locator('[data-library-folder="sofas"] .catalog-grid-card-meta').textContent();
 assert.equal(sofaMeta.trim(),'2 fotos','Contagem de fotos da pasta Sofás bate com as fotos carregadas');
 const barMeta=await page.locator('[data-library-folder="bares"] .catalog-grid-card-meta').textContent();
 assert.equal(barMeta.trim(),'0 fotos','Pasta sem fotos ainda mostra 0, não fica escondida');

 // Pedido explícito do usuário, com print real: "quero deixar essas
 // pastas sem essas caixas em volta, quero que elas fiquem mais bonitas
 // só a pasta mesmo... mas elas precisam ser visíveis, as cores que elas
 // estão hoje está muito claro" — sem moldura (fundo/borda) ao redor do
 // quadrado, e o ícone da pasta (cheia OU vazia) precisa ter cor real,
 // não um tom quase branco que suma contra a página.
 const folderBoxStyle=await page.locator('[data-library-folder="bares"] .catalog-grid-card-photo').evaluate((el)=>{
   const cs=getComputedStyle(el);
   return { background: cs.backgroundColor, borderWidth: cs.borderTopWidth };
 });
 assert.equal(folderBoxStyle.background,'rgb(255, 255, 255)','Sem fundo bege/caixa ao redor da pasta — volta a ser o branco padrão do card');
 assert.equal(folderBoxStyle.borderWidth,'0px','Sem borda ao redor da pasta');
 const emptyFrontOpacity=await page.locator('[data-library-folder="bares"] .catalog-biblioteca-folder-front').evaluate((el)=>{
   const rgb=getComputedStyle(el).fill.match(/\d+/g).map(Number);
   return 255-rgb[0]; // quanto MENOR o valor de vermelho (mais longe de branco puro), mais visível a cor
 });
 assert.ok(emptyFrontOpacity>30,`Frente da pasta vazia tem cor visível de verdade, não quase-branca (diferença do branco: ${emptyFrontOpacity})`);
 const filledFrontOpacity=await page.locator('[data-library-folder="sofas"] .catalog-biblioteca-folder-front').evaluate((el)=>{
   const rgb=getComputedStyle(el).fill.match(/\d+/g).map(Number);
   return 255-rgb[0];
 });
 assert.ok(filledFrontOpacity>30,`Frente da pasta com fotos tem cor visível de verdade (diferença do branco: ${filledFrontOpacity})`);

 // 2 pedidos explícitos do usuário, em sequência, sobre o mesmo vão vazio:
 // primeiro "o nome da pasta está muito longe dela" (ícone centralizado,
 // vão grande embaixo antes do nome) — corrigido ancorando o ícone na
 // base do quadrado (`align-items:flex-end`), o que só EMPURROU o mesmo
 // vão pra cima, gerando a 2ª queixa: "elas também estão aparecendo
 // muito embaixo do menu... olha o espaço que está entre o menu e a
 // primeira linha". Corrigido de vez aumentando o ícone (56%→86% do
 // quadrado) SEM ancorar em nenhuma borda — reduz o vão dos dois lados
 // ao mesmo tempo, em vez de só realocar o mesmo vão de um lado pro
 // outro. Confere que sobra uma margem pequena e BALANCEADA nos dois
 // lados (não zero de um lado e grande do outro).
 const folderGap=await page.locator('[data-library-folder="bares"]').evaluate((card)=>{
   const box=card.querySelector('.catalog-grid-card-photo').getBoundingClientRect();
   const icon=card.querySelector('.catalog-biblioteca-folder-icon').getBoundingClientRect();
   const name=card.querySelector('.catalog-grid-card-name').getBoundingClientRect();
   return {
     gapAboveIcon: icon.top-box.top,
     gapBelowIcon: box.bottom-icon.bottom,
     gapIconToName: name.top-icon.bottom,
     iconFillsBox: icon.height/box.height,
   };
 });
 assert.ok(folderGap.iconFillsBox>0.8,`Ícone ocupa a maior parte do quadrado (medido: ${(folderGap.iconFillsBox*100).toFixed(0)}%)`);
 assert.ok(folderGap.gapAboveIcon<24,`Margem acima do ícone é pequena, sem vão grande até o topo do quadrado (medido: ${folderGap.gapAboveIcon}px)`);
 assert.ok(Math.abs(folderGap.gapAboveIcon-folderGap.gapBelowIcon)<2,'Margens acima/abaixo do ícone são praticamente iguais — nenhum lado concentra o vão sozinho');
 assert.ok(folderGap.gapIconToName<36,`Distância do ícone até o nome continua pequena, não um vão grande (medido: ${folderGap.gapIconToName}px)`);

 // Pedido explícito do usuário, com print real: "quero que as pastas
 // tenham um efeito de parecer que a foto tá saindo dela" — só desenhado
 // pra pasta com pelo menos 1 foto (Sofás, 2 fotos), usando a PRIMEIRA
 // foto da categoria; pasta vazia (Bares, 0 fotos) não ganha nenhum
 // elemento de "foto saindo" — nem escondido via CSS, ausente do DOM.
 assert.equal(await page.locator('[data-library-folder="sofas"] .catalog-biblioteca-folder-peek').count(),1,'Pasta com foto ganha o efeito de foto saindo');
 assert.equal(await page.locator('[data-library-folder="sofas"] .catalog-biblioteca-folder-peek image').getAttribute('href'),'https://fixture/biblioteca/sofa-1.png','Usa a PRIMEIRA foto da categoria');
 assert.equal(await page.locator('[data-library-folder="bares"] .catalog-biblioteca-folder-peek').count(),0,'Pasta vazia não tem nenhuma foto pra "sair" dela — sem o elemento no DOM');

 await page.locator('[data-library-folder="sofas"]').click();
 await page.locator('#catalogBibliotecaDetail:not(.hidden)').waitFor();
 // Pedido explícito do usuário ("← CATEGORIAS" + "Estofados" num print,
 // "quero que apague isso") — cabeçalho da tela de detalhe (botão de
 // voltar + nome da categoria) removido por completo. Voltar à lista de
 // pastas agora só clicando na logo (Portal) e abrindo "Biblioteca" de
 // novo — openCatalogBiblioteca() sempre chama showFolders(), então
 // nunca fica presa na categoria anterior (ver mais abaixo).
 assert.equal(await page.locator('#catalogBibliotecaBack').count(),0,'Botão "← CATEGORIAS" não existe mais');
 assert.equal(await page.locator('#catalogBibliotecaDetailTitle').count(),0,'Nome da categoria não aparece mais no cabeçalho da tela de detalhe');
 assert.equal(await page.locator('.catalog-biblioteca-photo').count(),2,'As 2 fotos da categoria aparecem na tela de detalhe');
 // Histórico: já foi mosaico (altura natural de cada foto, sem cortar) —
 // revertido de volta a pedido do MESMO usuário, com print real do grid
 // do Instagram: "acho melhor todas aparecerem igual ao print que te
 // mandei em retangulos iguais mesmo". Agora é grade uniforme de
 // verdade — sofa-1.png (300×300) e sofa-2.png (300×600, proporção BEM
 // diferente) precisam renderizar em ALTURAS DIFERENTES, na verdade
 // MESMA altura (célula fixa, `object-fit:cover` recortando cada uma
 // pra caber), prova de que a grade é uniforme mesmo com fotos de
 // proporções diferentes.
 const photoHeights=await page.evaluate(()=>[...document.querySelectorAll('.catalog-biblioteca-photo')].map((el)=>Math.round(el.getBoundingClientRect().height)));
 assert.equal(photoHeights[0],photoHeights[1],`Fotos de proporções diferentes renderizam na MESMA altura, recortadas pra caber na célula (medido: ${photoHeights.join('px, ')}px)`);
 // Bug real reportado pelo usuário, com print: "as fotos não estão
 // ficando centralizadas no html, estão mais pro lado direito do que
 // pro esquerdo" — Sofás tem 2 fotos, uma linha INCOMPLETA (a grade é de
 // 4 colunas). Causa raiz de verdade, achada com getComputedStyle() (não
 // só lendo o CSS-fonte): cada `.catalog-biblioteca-photo` é um
 // `<figure>`, e o navegador aplica `margin:1em 40px` por padrão a esse
 // elemento — nunca zerado neste arquivo. Com `display:grid` isso só
 // encolhia a foto visível dentro da própria célula (mascarado); ao
 // trocar pra `display:flex;justify-content:center` (pra centralizar
 // linhas incompletas — grid sempre preenche a partir da 1ª coluna,
 // deixando a sobra do lado direito), essa margem invisível de +80px por
 // foto impedia a linha de ficar simétrica de verdade. Corrigido com
 // `margin:0`. Prova real: a distância do viewport até a 1ª foto tem que
 // ser IGUAL à distância da última foto até a borda oposta.
 const centering=await page.evaluate(()=>{
  const photos=[...document.querySelectorAll('.catalog-biblioteca-photo')];
  const first=photos[0].getBoundingClientRect();
  const last=photos[photos.length-1].getBoundingClientRect();
  return { leftGap: first.left, rightGap: innerWidth-last.right };
 });
 assert.ok(Math.abs(centering.leftGap-centering.rightGap)<1,`Linha incompleta (2 fotos) fica centralizada de verdade — folga esquerda e direita iguais (medido: ${centering.leftGap.toFixed(2)}px vs ${centering.rightGap.toFixed(2)}px)`);
 assert.equal(await page.locator('.catalog-biblioteca-photo').first().evaluate((el)=>getComputedStyle(el).marginLeft),'0px','<figure> não herda mais a margem padrão do navegador (margin:1em 40px)');
 assert.equal(await page.locator('#catalogBibliotecaUpload').isVisible(),false,'Decorador não vê o botão de adicionar fotos');
 assert.equal(await page.locator('.catalog-biblioteca-photo-remove').count(),2,'Decorador pode remover fotos');
 // Pedido do usuário: "quero clicar na foto dentro da biblioteca e quero que ela fique em tela toda"
 // — abre o MESMO visualizador em tela cheia do zoom das fotos do item (#catalogPhotoZoomDialog).
 assert.equal(await page.locator('#catalogPhotoZoomDialog[open]').count(),0,'Visualizador começa fechado');
 assert.equal(await page.locator('.catalog-biblioteca-photo img').first().evaluate((el)=>getComputedStyle(el).cursor),'zoom-in','A foto indica que dá pra ampliar (cursor de zoom)');
 await page.locator('.catalog-biblioteca-photo img').first().click();
 await page.locator('#catalogPhotoZoomDialog[open]').waitFor();
 const viewport=page.viewportSize();
 const dialogBox=await page.locator('#catalogPhotoZoomDialog').boundingBox();
 assert.ok(Math.abs(dialogBox.width-viewport.width)<1&&Math.abs(dialogBox.height-viewport.height)<1,`Foto abre em TELA TODA (visualizador ${Math.round(dialogBox.width)}x${Math.round(dialogBox.height)} num viewport ${viewport.width}x${viewport.height})`);
 assert.match(await page.locator('#catalogPhotoZoomImage').getAttribute('src'),/sofa-1.png/,'Mostra a foto clicada (a 1ª da pasta)');
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.getElementById('catalogPhotoZoomDialog').open);
 // Teclado: a foto é focável e Enter abre a mesma coisa; clicar na SEGUNDA mostra a segunda.
 await page.locator('.catalog-biblioteca-photo img').nth(1).focus();
 await page.keyboard.press('Enter');
 await page.locator('#catalogPhotoZoomDialog[open]').waitFor();
 assert.match(await page.locator('#catalogPhotoZoomImage').getAttribute('src'),/sofa-2.png/,'Enter numa foto focada abre ESSA foto, não outra');
 await page.locator('#catalogPhotoZoomClose').click();
 await page.waitForFunction(()=>!document.getElementById('catalogPhotoZoomDialog').open);

 // Pedido do usuário: "quero poder trocar as fotos pelo preview" — passar de uma foto da pasta pra outra SEM
 // fechar o visualizador: setas na tela, setas do teclado e arrastar pro lado (só sem zoom), com contador.
 const zoomSrc=()=>page.locator('#catalogPhotoZoomImage').getAttribute('src');
 const contador=()=>page.locator('#catalogPhotoZoomCounter').textContent();
 await page.locator('.catalog-biblioteca-photo img').first().click();
 await page.locator('#catalogPhotoZoomDialog[open]').waitFor();
 assert.equal(await page.locator('#catalogPhotoZoomPrev').isVisible(),true,'Pasta com 2 fotos: seta "anterior" aparece');
 assert.equal(await page.locator('#catalogPhotoZoomNext').isVisible(),true,'...e a seta "próxima"');
 assert.equal((await contador()).trim(),'1 / 2','Contador mostra a posição (1 / 2)');
 await page.locator('#catalogPhotoZoomNext').click();
 await page.waitForFunction(()=>/sofa-2/.test(document.getElementById('catalogPhotoZoomImage').getAttribute('src')||''));
 assert.equal((await contador()).trim(),'2 / 2','Seta "próxima" passa pra 2ª foto');
 await page.locator('#catalogPhotoZoomNext').click();
 await page.waitForFunction(()=>/sofa-1/.test(document.getElementById('catalogPhotoZoomImage').getAttribute('src')||''));
 assert.equal((await contador()).trim(),'1 / 2','Depois da última volta pra primeira (não trava no fim)');
 await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>/sofa-2/.test(document.getElementById('catalogPhotoZoomImage').getAttribute('src')||''));
 await page.keyboard.press('ArrowLeft');
 await page.waitForFunction(()=>/sofa-1/.test(document.getElementById('catalogPhotoZoomImage').getAttribute('src')||''));
 assert.equal((await contador()).trim(),'1 / 2','Setas do teclado ← → também passam de foto');
 // Arrastar pro lado passa de foto (gesto do celular) — mas SÓ sem zoom: com zoom, arrastar é mover a foto.
 const stageBox=await page.locator('#catalogPhotoZoomStage').boundingBox();
 const cx=stageBox.x+stageBox.width/2,cy=stageBox.y+stageBox.height/2;
 await page.locator('[data-photo-zoom-in]').click();
 await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx-220,cy,{steps:6});await page.mouse.up();
 assert.equal((await contador()).trim(),'1 / 2','Com zoom, arrastar pro lado move a foto — não troca de foto');
 await page.locator('[data-photo-zoom-reset]').click();
 await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx-220,cy,{steps:6});await page.mouse.up();
 await page.waitForFunction(()=>/sofa-2/.test(document.getElementById('catalogPhotoZoomImage').getAttribute('src')||''));
 assert.equal((await contador()).trim(),'2 / 2','Sem zoom, arrastar pra esquerda passa pra próxima foto');
 assert.equal(await page.locator('#catalogPhotoZoomImage').evaluate(el=>el.style.transform),'translate(0px, 0px) scale(1)','A foto nova abre centralizada (não herda o deslocamento do arrasto)');
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.getElementById('catalogPhotoZoomDialog').open);
 assert.equal(await page.locator('#catalogPhotoZoomPrev').isVisible(),false,'Fechado, as setas ficam escondidas');
 const handle=page.locator('[data-photo-id="f1"] [data-move-photo]');
 const a=await handle.boundingBox(); const b=await page.locator('[data-photo-id="f2"]').boundingBox();
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});await page.mouse.up();
 await page.waitForFunction(()=>document.querySelector('[data-photo-id]').dataset.photoId==='f2');
 assert.deepEqual(await page.evaluate(()=>window.libraryCalls[0].args.p_fotos),['f2','f1']);
 await page.locator('[data-photo-id="f1"] [data-move-photo]').focus();await page.keyboard.press('ArrowLeft');
 await page.waitForFunction(()=>document.querySelector('[data-photo-id]').dataset.photoId==='f1');
 await page.locator('[data-remove-photo="f1"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-photo-id]').length===1);
 assert.equal(await page.evaluate(()=>window.libraryCalls.at(-1).args.p_token),'test');
 assert.equal(await page.locator('#catalogPhotoZoomDialog[open]').count(),0);
 await page.locator('.catalog-brand').click();
 await page.locator('.catalog-gateway').waitFor();
 assert.equal(await page.locator('#catalogBiblioteca').isVisible(),false,'Voltar pro Portal fecha a Biblioteca');
 // Sem o botão "← CATEGORIAS", reabrir a Biblioteca pelo Portal é o
 // caminho que substitui o antigo botão de voltar — precisa sempre cair
 // de volta na lista de pastas, nunca ficar presa na categoria (Sofás)
 // que estava aberta antes de sair.
 await page.locator('[data-gateway-tile="biblioteca"]').click();
 await page.locator('#catalogBibliotecaFolders:not(.hidden)').waitFor();
 assert.equal(await page.locator('#catalogBibliotecaDetail').isVisible(),false,'Reabrir a Biblioteca sempre volta pra lista de pastas, nunca fica presa na categoria anterior');
 // Painel 3D e Biblioteca continuam mutuamente exclusivos. Sem o botão
 // "Painel 3D" solto no cabeçalho (removido em sessão anterior), o único
 // jeito de chegar lá agora é voltar pro Portal (a logo já fecha a
 // Biblioteca sozinha) e entrar pelo bloco "Módulo 3D" (que abre o 3D
 // Livre direto, sem mini-menu intermediário — removido nesta sessão).
 await page.locator('.catalog-brand').click();
 await page.locator('.catalog-gateway').waitFor();
 assert.equal(await page.locator('#catalogBiblioteca').isVisible(),false,'Voltar pro Portal fecha a Biblioteca de novo');
 await page.locator('[data-gateway-tile="modulo3d"]').click();
 assert.equal(await page.locator('#catalogBiblioteca').isVisible(),false,'Painel 3D e Biblioteca continuam mutuamente exclusivos');
 assert.equal(await page.locator('#catalogStudio').isVisible(),true);
 await page.locator('.catalog-brand').click();
 assert.equal(await page.locator('#catalogGrid').isVisible(),true,'Logo fecha qualquer painel aberto e volta pro Portal');
 assert.equal(await page.locator('.catalog-gateway').isVisible(),true,'Portal é o que aparece de volta ao clicar na logo');
 await page.screenshot({path:path.join(os.tmpdir(),'catalogo-biblioteca-decorador.png')});
 assert.deepEqual(errors,[]);
 await page.close();
}

// ===== Cenário 2: equipe interna — upload e remoção de foto =====
{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await page.addInitScript(()=>{
  sessionStorage.setItem('login_ok','1');
  function builder(resolveValue){
   return new Proxy({},{get(_t,prop){
    if(prop==='then') return (resolve)=>resolve(resolveValue());
    return ()=>builder(resolveValue);
   }});
  }
  window.testInserted=[];window.testDeleted=[];window.testUploaded=[];
  window.supabaseClient={
   auth:{
    getSession:async()=>({data:{session:{user:{id:'user-1'}}},error:null}),
    getUser:async()=>({data:{user:{id:'user-1'}},error:null}),
   },
   from(table){
    if(table==='usuarios_empresas') return builder(()=>({data:{empresa_id:'company'},error:null}));
    if(table==='biblioteca_fotos'){
     const b=builder(()=>({data:[],error:null}));
     return {
      insert(row){
       window.testInserted.push(row);
       const saved={id:'novo-1',categoria:row.categoria,titulo:null,url:row.url,path:row.path,ordem:null,cliente_id:row.cliente_id};
       return {select:()=>({single:async()=>({data:saved,error:null})})};
      },
      delete(){
       return {eq:async(_col,id)=>{window.testDeleted.push(id);return {error:null};}};
      },
     };
    }
    return b_default();
    function b_default(){return builder(()=>({data:[],error:null}));}
   },
   rpc:async(name,params)=>{
    if(name==='funcionario_contexto') return {data:{ativo:true,administrador_legado:true},error:null};
    if(name==='catalogo_carregar_interno') return {data:{empresa:{nome:'Chiavari'},decorador:null,itens:[
     {id:'1',tipo:'Item',produto:'Sofá Um',categoria:'Sofás',foto_url:'https://fixture/sofa.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
    ]}};
    if(name==='biblioteca_carregar_interno') return {data:{fotos:[],clientes:[{id:'kelly',nome:'Kelly Khawam'},{id:'fabi',nome:'Fabiane Gabrich'}]}};
    return {data:null,error:null};
   },
   storage:{from(bucket){return {
    upload:async(path,file,opts)=>{window.testUploaded.push({bucket,path,type:opts?.contentType});return {error:null};},
    getPublicUrl:(path)=>({data:{publicUrl:'https://fixture/biblioteca/'+path}}),
    remove:async(paths)=>{window.testDeleted.push(...paths);return {error:null};},
   };}},
  };
  window.confirm=()=>true;
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('.catalog-gateway').waitFor();
 await page.locator('[data-gateway-tile="biblioteca"]').click();
 await page.locator('[data-library-folder="sofas"]').click();
 await page.locator('#catalogBibliotecaDetail:not(.hidden)').waitFor();
 assert.equal(await page.locator('#catalogBibliotecaUpload').isVisible(),true,'Equipe interna vê o botão de adicionar fotos');
 assert.equal(await page.locator('.catalog-biblioteca-empty').textContent(),'Nenhuma foto nesta categoria ainda.');
 await page.locator('#catalogBibliotecaUploadInput').setInputFiles({name:'foto.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});
 await page.waitForFunction(()=>document.querySelectorAll('.catalog-biblioteca-photo').length===1);
 assert.equal(await page.evaluate(()=>window.testUploaded.length),1,'Upload chamado no bucket biblioteca');
 assert.equal(await page.evaluate(()=>window.testUploaded[0].bucket),'biblioteca');
 assert.match(await page.evaluate(()=>window.testUploaded[0].path),/^company\/sofas\//,'Caminho do arquivo começa com empresa/categoria');
 assert.equal(await page.evaluate(()=>window.testInserted[0].categoria),'Sofás','Linha gravada usa o rótulo da categoria, não o slug');
 assert.equal(await page.locator('.catalog-biblioteca-photo-remove').count(),1,'Equipe interna vê botão de remover foto');
 // A equipe também abre a foto em tela toda; e o "×" de remover NUNCA abre o visualizador.
 await page.locator('.catalog-biblioteca-photo img').click();
 await page.locator('#catalogPhotoZoomDialog[open]').waitFor();
 assert.equal(await page.locator('#catalogPhotoZoomPrev').isVisible()||await page.locator('#catalogPhotoZoomNext').isVisible()||await page.locator('#catalogPhotoZoomCounter').isVisible(),false,'Pasta com UMA foto só: sem setas nem contador');
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.getElementById('catalogPhotoZoomDialog').open);
 await page.locator('.catalog-biblioteca-photo-remove').click();
 assert.equal(await page.locator('#catalogPhotoZoomDialog[open]').count(),0,'Clicar no × de remover não abre a foto em tela toda');
 await page.waitForFunction(()=>document.querySelectorAll('.catalog-biblioteca-photo').length===0);
 assert.equal(await page.evaluate(()=>window.testDeleted.includes('novo-1')),true,'Linha removida da tabela');
 assert.match(await page.evaluate(()=>window.testDeleted[window.testDeleted.length-1]),/^company\/sofas\//,'Arquivo removido do storage também');
 await page.locator('#catalogBibliotecaCliente select').selectOption('fabi');
 await page.locator('#catalogBibliotecaUploadInput').setInputFiles({name:'fabi.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});
 await page.waitForFunction(()=>document.querySelectorAll('.catalog-biblioteca-photo').length===1);
 assert.equal(await page.evaluate(()=>window.testInserted.at(-1).cliente_id),'fabi','Upload vinculado à Fabi');
 assert.match(await page.evaluate(()=>window.testUploaded.at(-1).path),/^company\/fabi\/sofas\//);
 await page.locator('#catalogBibliotecaCliente select').selectOption('kelly');
 assert.equal(await page.locator('.catalog-biblioteca-photo').count(),0,'Foto da Fabi não aparece para Kelly');
 await page.locator('#catalogBibliotecaCliente select').selectOption('fabi');
 assert.equal(await page.locator('.catalog-biblioteca-photo').count(),1,'Foto preservada na biblioteca da Fabi');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Sem overflow horizontal no mobile');
 await page.screenshot({path:path.join(os.tmpdir(),'catalogo-biblioteca-interno-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 await page.close();
}

console.log('PASS: clicar numa foto abre em tela toda (mouse e teclado, decorador e equipe; o × de remover não abre), pastas por categoria, contagem de fotos, decorador só visualiza, equipe faz upload/remoção, exclusividade com Painel 3D, logo fecha overlays, mobile sem overflow');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
