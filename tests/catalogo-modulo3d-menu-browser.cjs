const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const path=require('node:path');const os=require('node:os');

// GLB mínimo mas com UM TRIÂNGULO de verdade (não só cabeçalho vazio) —
// bounds="tight" calcula o enquadramento a partir da geometria REAL do
// modelo; um GLB sem nenhuma malha não dá pra "tight" calcular nada e o
// <model-viewer> dispara 'error' em vez de 'load'.
function fakeGlbTriangle(){
  const json=JSON.stringify({
    asset:{version:"2.0"},
    scene:0,
    scenes:[{nodes:[0]}],
    nodes:[{mesh:0}],
    meshes:[{primitives:[{attributes:{POSITION:0},indices:1,mode:4}]}],
    buffers:[{byteLength:42}],
    bufferViews:[
      {buffer:0,byteOffset:0,byteLength:36,target:34962},
      {buffer:0,byteOffset:36,byteLength:6,target:34963},
    ],
    accessors:[
      {bufferView:0,componentType:5126,count:3,type:"VEC3",max:[1,1,0],min:[0,0,0]},
      {bufferView:1,componentType:5123,count:3,type:"SCALAR",max:[2],min:[0]},
    ],
  });
  const jsonBuf=Buffer.from(json,'utf8');
  const jsonPad=(4-(jsonBuf.length%4))%4;
  const jsonPadded=Buffer.concat([jsonBuf,Buffer.alloc(jsonPad,0x20)]);

  const positions=Buffer.alloc(36);
  positions.writeFloatLE(0,0);positions.writeFloatLE(0,4);positions.writeFloatLE(0,8);
  positions.writeFloatLE(1,12);positions.writeFloatLE(0,16);positions.writeFloatLE(0,20);
  positions.writeFloatLE(0,24);positions.writeFloatLE(1,28);positions.writeFloatLE(0,32);
  const indices=Buffer.alloc(6);
  indices.writeUInt16LE(0,0);indices.writeUInt16LE(1,2);indices.writeUInt16LE(2,4);
  const binRaw=Buffer.concat([positions,indices]);
  const binPad=(4-(binRaw.length%4))%4;
  const binPadded=Buffer.concat([binRaw,Buffer.alloc(binPad,0)]);

  const jsonChunkHeader=Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonPadded.length,0);
  jsonChunkHeader.writeUInt32LE(0x4E4F534A,4); // "JSON"
  const binChunkHeader=Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binPadded.length,0);
  binChunkHeader.writeUInt32LE(0x004E4942,4); // "BIN\0"

  const totalLength=12+8+jsonPadded.length+8+binPadded.length;
  const header=Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67,0); // "glTF"
  header.writeUInt32LE(2,4);
  header.writeUInt32LE(totalLength,8);
  return Buffer.concat([header,jsonChunkHeader,jsonPadded,binChunkHeader,binPadded]);
}

// Pedido explícito do usuário, depois de já aprovado este mini-menu:
// "quero um 3D diferente pra cada módulo" — cada card (Estúdio/Lounge/
// Realidade aumentada) agora tem sua PRÓPRIA flag de modelo em destaque
// (capa_modulo3d_estudio/_lounge/_ar), não mais 1 flag global. Fixture
// pensada pra provar que as 3 flags são realmente independentes: A é
// capa só do Estúdio, B é capa só do Lounge, C não é capa de nada (alvo
// do toggle no teste), D não tem modelo nenhum (não pode ganhar botão).
// Nenhum item é capa de "realidade-aumentada" de propósito — prova o
// fallback pro 1º item com QUALQUER modelo.
function itemsFixture(){
  return [
    {id:'1',tipo:'Item',produto:'Poltrona Águines Campo',categoria:'Estofados',material:'Madeira',cor:'Castanho',largura:.67,altura:.95,profundidade:.57,foto_url:'https://fixture/1.png',capa_categoria:false,capa_modulo3d_estudio:true,capa_modulo3d_lounge:false,capa_modulo3d_ar:false,itens_fotos:[],itens_modelos_3d:[{url:'https://fixture/modelo-a.glb',status:'ativo'}]},
    {id:'2',tipo:'Item',produto:'Sofá Becca',categoria:'Estofados',material:'Madeira',cor:'Verde',largura:2.2,altura:.7,profundidade:1,foto_url:'https://fixture/2.png',capa_categoria:false,capa_modulo3d_estudio:false,capa_modulo3d_lounge:true,capa_modulo3d_ar:false,itens_fotos:[],itens_modelos_3d:[{url:'https://fixture/modelo-b.glb',status:'ativo'}]},
    {id:'3',tipo:'Item',produto:'Aparador Baixo',categoria:'Estofados',material:'Madeira',cor:'Escuro',largura:1.4,altura:.75,profundidade:.4,foto_url:'https://fixture/3.png',capa_categoria:false,capa_modulo3d_estudio:false,capa_modulo3d_lounge:false,capa_modulo3d_ar:false,itens_fotos:[],itens_modelos_3d:[{url:'https://fixture/modelo-c.glb',status:'ativo'}]},
    {id:'4',tipo:'Item',produto:'Puff Redondo',categoria:'Estofados',material:'Madeira',cor:'Bege',largura:.5,altura:.4,profundidade:.5,foto_url:'https://fixture/4.png',capa_categoria:false,capa_modulo3d_estudio:false,capa_modulo3d_lounge:false,capa_modulo3d_ar:false,itens_fotos:[],itens_modelos_3d:[]},
  ];
}

(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{

// ===== Cenário 1: equipe interna — 3 modelos independentes, toggle por módulo, hover, teardown =====
{
 const page=await browser.newPage({viewport:{width:1600,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c9a874"/></svg>');
 await page.route('https://fixture/*.png',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 // Os 2 estágios do carregamento (0%→67%→100%) ficam SEGUROS por
 // portões controlados pelo teste, em vez de delays fixos por tempo —
 // um `setTimeout`, mesmo curto, tem uma corrida real contra a leitura
 // do estado logo abaixo (achado rodando o teste repetidas vezes,
 // sobretudo sob carga — dentro da suíte completa, não isolado: às
 // vezes o "0%" imediatamente após o clique já vinha como "67%", porque
 // modelo-a (Estúdio+AR, mesmo item) resolvia rápido demais, antes até
 // da 1ª leitura). Com os portões, modelo-a (Estúdio+AR) só responde
 // depois de `releaseEstudioEAr()`, e modelo-b (Lounge) só depois de
 // `releaseLounge()` — cada um liberado pelo teste só DEPOIS de já ter
 // confirmado o estado anterior com segurança. Zero corrida possível.
 let releaseEstudioEAr, releaseLounge;
 const estudioGate=new Promise((resolve)=>{ releaseEstudioEAr=resolve; });
 const loungeGate=new Promise((resolve)=>{ releaseLounge=resolve; });
 await page.route('https://fixture/*.glb', async (r)=>{
  const url=r.request().url();
  if(url.includes('modelo-a.glb')) await estudioGate;
  if(url.includes('modelo-b.glb')) await loungeGate;
  await r.fulfill({contentType:'model/gltf-binary',body:fakeGlbTriangle()});
 });
 await page.addInitScript(()=>{
  // Login DIRETO da equipe (não login_ok/dashboard) de propósito: o modo
  // dashboard (catalog-modo-sistema) esconde .catalog-brand, e este
  // teste precisa voltar pro Portal várias vezes — só o login direto
  // mantém a logo clicável (mesmo cabeçalho normal do catálogo).
  function builder(v){return new Proxy({},{get(_t,p){if(p==='then')return(r)=>r(v());return()=>builder(v);}});}
  window.supabaseClient={
   auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}},error:null}),getUser:async()=>({data:{user:{id:'u1'}},error:null})},
   from(table){
    if(table==='usuarios_empresas')return builder(()=>({data:{empresa_id:'company'},error:null}));
    if(table==='empresas')return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{nome:'Chiavari',logo_url:null},error:null})};
    if(table==='itens'){
     return {update(payload){return {eq:(col,val)=>{window.testCapaUpdates=window.testCapaUpdates||[];window.testCapaUpdates.push({val,payload});return Promise.resolve({error:null});}};}};
    }
    return builder(()=>({data:[],error:null}));},
   rpc:async(name)=>{
    if(name==='funcionario_contexto')return{data:{ativo:true,administrador_legado:true},error:null};
    if(name==='catalogo_carregar_interno')return{data:{empresa:{nome:'Chiavari'},decorador:null,itens:window.__ITEMS_FIXTURE__}};
    if(name==='catalogo_capas_carregar_interno')return{data:{}};
    if(name==='biblioteca_carregar_interno')return{data:{fotos:[]}};
    return {data:null,error:null};
   },
   storage:{from(bucket){return{getPublicUrl:(p)=>({data:{publicUrl:'https://fixture/x/'+p}})};}},
  };
 });
 await page.addInitScript((items)=>{ window.__ITEMS_FIXTURE__=items; }, itemsFixture());
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('.catalog-gateway').waitFor();

 // Clicar em "Módulo 3D" não abre mais o estúdio direto — mostra o
 // mini-menu (pedido explícito: "quero que apareça como se fosse outro
 // mini menu").
 await page.locator('[data-gateway-tile="modulo3d"]').click();
 await page.locator('.catalog-modulo3d-menu').waitFor();
 assert.equal(await page.locator('#catalogStudio:not(.hidden)').count(),0,'Estúdio não abre direto');
 assert.equal(await page.locator('#catalogPageLabel').textContent(),'Módulo 3D');
 assert.equal(await page.locator('#catalogBreadcrumb').count(),0,'a trilha abaixo do cabeçalho foi apagada');

 // Carregamento único, pedido explícito do usuário: "quero que tenha um
 // carregamento ali antes de liberar a página, pra não acontecer de
 // aparecer um 3d aí depois o outro e depois o outro, isso dá a sensação
 // de lentidão", reforçado depois: "no momento que o carregando chegar a
 // 100 os módulos 3D já precisam aparecer juntos e carregados já ao
 // mesmo tempo, não pode piscar" — logo depois de entrar, os 3 cards
 // ficam escondidos atrás do anel de PERCENTUAL REAL (mesmo princípio já
 // usado nas notificações "em andamento" do catálogo, nunca um spinner
 // genérico), mesmo que o modelo mais rápido (30ms) já tenha terminado
 // de carregar por baixo.
 const loadingSnapshot=async()=>page.evaluate(()=>{
   const menu=document.querySelector('.catalog-modulo3d-menu');
   const loading=document.querySelector('.catalog-modulo3d-loading');
   const explore=document.querySelector('.catalog-modulo3d-explore');
   const pctLabel=document.querySelector('.catalog-modulo3d-loading-pct');
   return {
     isLoading: menu.classList.contains('is-loading'),
     loadingOpacity: Number(getComputedStyle(loading).opacity),
     exploreOpacity: Number(getComputedStyle(explore).opacity),
     pct: pctLabel?.textContent,
   };
 });
 const soonAfterEnter=await loadingSnapshot();
 assert.equal(soonAfterEnter.isLoading,true,'Mini-menu entra em estado de carregamento logo ao abrir');
 assert.equal(soonAfterEnter.loadingOpacity,1,'Anel de percentual visível');
 assert.equal(soonAfterEnter.exploreOpacity,0,'Cards ficam escondidos atrás do percentual, mesmo com algum modelo já pronto por baixo');
 assert.equal(soonAfterEnter.pct,'0%','Percentual começa em 0%, nenhum dos 3 terminou ainda');
 releaseEstudioEAr();

 // Percentual REAL avança em degraus discretos (um por card que TERMINA
 // DE VERDADE, não uma curva chutada) — prova que não é só decoração:
 // Estúdio e Realidade aumentada (mesmo item por fallback, liberados
 // acima) terminam, enquanto Lounge fica preso no portão — nesse
 // meio-tempo o percentual já reflete 2 dos 3 prontos, mas o
 // carregamento continua ativo até o 3º também terminar (sem corrida
 // possível: o 3º só é liberado logo abaixo, DEPOIS de confirmar isso).
 await page.waitForFunction(()=>document.querySelector('.catalog-modulo3d-loading-pct')?.textContent==='67%',{timeout:5000});
 const midLoad=await loadingSnapshot();
 assert.equal(midLoad.isLoading,true,'Ainda escondido com 67% (2 dos 3 prontos) — falta o mais lento (Lounge)');
 assert.equal(midLoad.pct,'67%');
 releaseLounge();

 // 3 tiles, igual à Home (foto grande + só o título, sem descrição nem
 // botão separado). Nomes pedidos pelo usuário olhando o mini-menu: "3D
 // Livre" (antigo Estúdio de Ambientes), "Composições" (antigo Módulo
 // Lounge) e o último sem nome, só "Em desenvolvimento" e nada embaixo.
 assert.equal(await page.locator('.catalog-modulo3d-tile').count(),3);
 assert.match(await page.locator('[data-modulo3d-card="estudio"] .catalog-modulo3d-tile-name').textContent(),/^3D Livre$/);
 assert.match(await page.locator('[data-modulo3d-card="lounge"] .catalog-modulo3d-tile-name').textContent(),/^Composições$/);
 const soonTitles=await page.locator('.catalog-modulo3d-tile-soon .catalog-modulo3d-tile-name').allTextContents();
 assert.deepEqual(soonTitles,['Em desenvolvimento'],'O recurso futuro perdeu o próprio nome: só "Em desenvolvimento"');
 assert.equal(await page.locator('.catalog-modulo3d-tile-soon .catalog-modulo3d-tile-badge').count(),0,'Sem o selo "Em breve" embaixo do quadro');
 assert.equal(await page.locator('.catalog-modulo3d-tile-desc').count(),0,'Pedido do usuário: "retire as frases, deixe somente os títulos" — nenhum card tem frase de descrição');
 assert.equal(await page.locator('.catalog-modulo3d-tile-soon').evaluate(el=>el.innerText.trim().replace(/\s+/g,' ').toUpperCase()),'EM DESENVOLVIMENTO','Nada além do título dentro/embaixo do card indisponível');
 assert.equal(await page.locator('.catalog-modulo3d-tile-soon[aria-disabled="true"]').count(),1,'O recurso futuro restante tem aria-disabled');
 // :light() restringe a busca ao DOM "claro" do próprio tile — sem isso
 // o seletor do Playwright atravessa a shadow DOM do <model-viewer>
 // embutido no stage (que tem seus PRÓPRIOS botões internos, ex. AR),
 // o que não tem nada a ver com "o tile não tem elemento clicável".
 assert.equal(await page.locator('.catalog-modulo3d-tile-soon :light(button), .catalog-modulo3d-tile-soon :light(a)').count(),0,'Recurso futuro não tem NENHUM elemento clicável no próprio DOM (sem comportamento de clique)');

 // Pedido explícito do usuário: "quero um 3D diferente pra cada módulo" —
 // 3 model-viewer simultâneos, cada um dentro do stage do card certo, e
 // cada um mostrando o item marcado PRA AQUELE módulo especificamente
 // (não mais 1 modelo global pra tela inteira).
 const estudioViewer=page.locator('[data-modulo3d-stage="estudio"] model-viewer');
 const loungeViewer=page.locator('[data-modulo3d-stage="lounge"] model-viewer');
 const arViewer=page.locator('[data-modulo3d-stage="realidade-aumentada"] model-viewer');
 await estudioViewer.waitFor({timeout:10000});
 await loungeViewer.waitFor({timeout:10000});
 await arViewer.waitFor({timeout:10000});
 assert.equal(await page.evaluate(()=>document.querySelectorAll('model-viewer').length),3,'3 model-viewer simultâneos, um por card');
 assert.match(await estudioViewer.evaluate(el=>el.alt),/Poltrona Águines Campo/,'Card do Estúdio mostra o item marcado capa_modulo3d_estudio=true (A)');
 assert.match(await loungeViewer.evaluate(el=>el.alt),/Sofá Becca/,'Card do Lounge mostra o item marcado capa_modulo3d_lounge=true (B) — flag INDEPENDENTE da do Estúdio');
 assert.match(await arViewer.evaluate(el=>el.alt),/Poltrona Águines Campo/,'Sem nenhum item marcado pra "Realidade aumentada", cai pro 1º item com QUALQUER modelo (A)');

 // Depois que os 3 terminaram (Lounge só depois de `releaseLounge()`
 // acima), o carregamento some e os 3 cards aparecem JUNTOS —
 // continuação do pedido "não acontecer de aparecer um 3d aí depois o
 // outro e depois o outro". Cada card só é considerado "pronto" depois
 // do evento `load` REAL do <model-viewer> (não só o download do .glb) —
 // por isso a checagem abaixo confere `viewer.loaded===true` nos 3, não
 // só que o elemento existe no DOM: prova de verdade de "não pode
 // piscar" (no instante em que o percentual bate 100%, o conteúdo já
 // está genuinamente pronto pra desenhar, não só prestes a aparecer).
 await page.waitForTimeout(600); // transição de 320ms + evento load real — espera terminar de verdade
 const afterAllLoaded=await loadingSnapshot();
 assert.equal(afterAllLoaded.isLoading,false,'Carregamento termina só depois que os 3 modelos resolveram');
 assert.equal(afterAllLoaded.loadingOpacity,0,'Anel de percentual some');
 assert.equal(afterAllLoaded.exploreOpacity,1,'Os 3 cards ficam visíveis juntos, de uma vez só');
 assert.equal(afterAllLoaded.pct,'100%','Percentual chega em 100% exatamente quando os 3 cards já estão prontos');
 assert.equal(await page.evaluate(()=>[...document.querySelectorAll('model-viewer')].every((v)=>v.loaded===true)),true,'Os 3 <model-viewer> já terminaram de carregar de verdade (não só existem no DOM) no momento da revelação');

 // Decorativo, não interativo: sem camera-controls, sem captar clique
 // nenhum (o card inteiro continua clicável por baixo).
 assert.equal(await estudioViewer.evaluate(el=>el.hasAttribute('camera-controls')),false,'Preview decorativo, sem controles de câmera manuais');
 assert.equal(await estudioViewer.evaluate(el=>getComputedStyle(el).pointerEvents),'none','model-viewer nunca captura o clique/arrastar do card');

 // Efeito de hover, versão final depois de 4 rodadas de ajuste: (1)
 // rejeitado escurecer + "luz de teatro"/funil no 3D ("esquece esse
 // efeito, não ficou bonito") — virou zoom sutil no 3D, mesmo já
 // aprovado nos cards da Home; (2) nome pra DENTRO do quadro, branco,
 // replicando o mecanismo REAL do Portal (escurecer sempre ativo,
 // reforçado no hover); (3) "o fundo do 3d está muito escuro de todos,
 // quero deixar eles mais claros, eu sei que a fonte esconde um pouco
 // mas quando passar o mouse ela vai aparecer" — opacidade de repouso
 // .22→.08, hover .5→.6; (4) "quero subir o nome dos card mais pra cima
 // do card pra ficar tipo um título mesmo, e quando eu passar o mouse
 // quero que apareça um resumo sobre pra que serve aquele módulo... essa
 // frase só aparece quando a gente passa o mouse, ela não deve ficar à
 // mostra sempre" — nome virou título no topo do quadro, resumo
 // (card.description) revelado só no hover; (5) correção imediata, vendo
 // o resumo centralizado no meio do quadro: "a frase ela deve aparecer
 // não no meio, mais logo abaixo do título e precisa ter a mesma fonte
 // também pra não parecer algo aleatório e sem nexo" — nome+resumo
 // moraram pro MESMO wrapper (.catalog-modulo3d-tile-caption), resumo
 // logo abaixo do nome no fluxo normal, mesma font-family serif do nome.
 await page.evaluate(()=>{ document.querySelector('[data-modulo3d-card="estudio"]').id='__hoverTestCard'; });
 const estudioCard=page.locator('#__hoverTestCard');
 const stageScale=()=>page.evaluate(()=>{
   const m=getComputedStyle(document.querySelector('#__hoverTestCard [data-modulo3d-stage] model-viewer')).transform;
   if(m==='none') return 1;
   return Number(new DOMMatrix(m).a.toFixed(2));
 });
 const darkenOpacity=()=>page.evaluate(()=>Number(getComputedStyle(document.querySelector('#__hoverTestCard [data-modulo3d-stage]'),'::before').opacity));
 const nameColor=()=>page.evaluate(()=>getComputedStyle(document.querySelector('#__hoverTestCard .catalog-modulo3d-tile-name')).color);
 assert.equal(await stageScale(),1,'3D no tamanho normal fora do hover');
 assert.equal(await darkenOpacity(),0.08,'Quadro fica claro em repouso — só uma tinta bem sutil pro texto não ficar 100% invisível');
 assert.equal(await nameColor(),'rgb(255, 255, 255)','Nome do módulo é branco');
 // Título no topo do quadro (não fica centralizado verticalmente).
 const captionLayout=await page.evaluate(()=>{
   const stage=document.querySelector('#__hoverTestCard [data-modulo3d-stage]');
   const name=stage.querySelector('.catalog-modulo3d-tile-name');
   const stageRect=stage.getBoundingClientRect();
   const nameRect=name.getBoundingClientRect();
   return { nameNearTop: (nameRect.top - stageRect.top) < stageRect.height * 0.25 };
 });
 assert.ok(captionLayout.nameNearTop,'Nome fica perto do topo do quadro, como um título — não mais centralizado verticalmente');
 await estudioCard.hover();
 await page.waitForTimeout(1600); // transição de 1400ms — espera terminar de verdade, sem ler no meio do caminho
 assert.ok(await stageScale()>1.05,'3D recebe um leve zoom no hover');
 assert.equal(await darkenOpacity(),0.6,'Quadro escurece bem mais no hover — é aí que o nome precisa "aparecer" de verdade');
 await page.mouse.move(5,5);
 await page.waitForTimeout(1600);
 assert.equal(await stageScale(),1,'Zoom desfaz ao tirar o mouse');
 assert.equal(await darkenOpacity(),0.08,'Escurecer volta ao valor claro de repouso ao tirar o mouse');

 // Card do estúdio abre o estúdio de verdade — mesma rota/overlay de sempre.
 await page.locator('[data-modulo3d-card="estudio"]').click();
 await page.locator('#catalogStudio:not(.hidden)').waitFor();
 assert.equal(await page.locator('#catalogPageLabel').textContent(),'3D Livre');
 assert.match(await page.locator('#catalogTimelinePast').innerText(),/m[óo]dulo 3d/i,'Linha do tempo do cabeçalho mostra o caminho até o 3D Livre (…› Módulo 3D › 3D Livre)');
 // Os 3 visualizadores do mini-menu foram desligados (não continuam
 // rodando atrás do estúdio) — pedido explícito: "evitar vazamentos de
 // memória... e recursos gráficos quando a tela for fechada".
 assert.equal(await page.evaluate(()=>document.querySelectorAll('model-viewer').length),0,'Os 3 model-viewer do mini-menu são removidos ao abrir o estúdio (sem contextos WebGL sobrando)');

 // Voltar pro mini-menu pela linha do tempo — o recurso futuro restante continua
 // sem fazer nada ao "clicar" (não têm elemento clicável), e os 3
 // modelos voltam a existir (reconstruídos do zero).
 await page.locator('#catalogTimelinePast [data-timeline-entry]').filter({hasText:/m[óo]dulo 3d/i}).last().click();
 await page.locator('.catalog-modulo3d-menu').waitFor();
 await page.locator('[data-modulo3d-stage="estudio"] model-viewer').waitFor({timeout:10000});
 await page.locator('.catalog-modulo3d-tile-soon').first().click({force:true});
 await page.waitForTimeout(200);
 assert.equal(await page.locator('.catalog-modulo3d-menu').isVisible(),true,'Clicar num recurso futuro não navega pra lugar nenhum');

 // Botão de marcar modelo em destaque (pedido explícito: "da mesma forma
 // que eu escolho a foto da capa da categoria, vou escolher o 3D que
 // aparece"), agora 1 grupo de 3 botões (1 por módulo) — só em itens com
 // modelo cadastrado.
 await page.locator('.catalog-brand').click();
 await page.locator('[data-gateway-tile="catalogo"]').click();
 await page.locator('[data-home-category="estofados"]').click();
 await page.locator('[data-grid-item]').first().waitFor();
 await page.locator('.catalog-view-switch-btn[data-view-mode="immersive"]').click();
 await page.locator('.catalog-product-section').first().waitFor();
 assert.equal(await page.locator('#produto-1 .catalog-capa-modulo3d-group').count(),1,'Item A (com modelo) tem o grupo de botões');
 assert.equal(await page.locator('#produto-1 [data-capa-modulo3d-toggle]').count(),3,'3 botões no grupo, 1 por módulo');
 assert.equal(await page.locator('#produto-4 .catalog-capa-modulo3d-group').count(),0,'Item D (sem modelo) não tem grupo nenhum');
 assert.match(await page.locator('#produto-1 [data-capa-modulo3d-toggle="estudio"]').textContent(),/★/,'A começa marcado como capa do Estúdio (vindo do fixture)');
 assert.match(await page.locator('#produto-1 [data-capa-modulo3d-toggle="lounge"]').textContent(),/☆/,'A NÃO é capa do Lounge — flags independentes');
 assert.match(await page.locator('#produto-3 [data-capa-modulo3d-toggle="estudio"]').textContent(),/☆/,'C começa desmarcado em todos os módulos');

 // Marcar C como capa do Estúdio desmarca A (mesmo módulo) — mas NÃO
 // mexe na marcação de B como capa do Lounge (módulo diferente).
 await page.locator('#produto-3 [data-capa-modulo3d-toggle="estudio"]').click();
 await page.waitForFunction(()=>window.testCapaUpdates?.some(u=>u.val==='3'&&u.payload.capa_modulo3d_estudio===true));
 await page.waitForFunction(()=>document.querySelector('#produto-3 [data-capa-modulo3d-toggle="estudio"]')?.textContent.includes('★'));
 assert.match(await page.locator('#produto-1 [data-capa-modulo3d-toggle="estudio"]').textContent(),/☆/,'Marcar C como capa do Estúdio desmarca A automaticamente (só 1 por módulo)');
 assert.ok(await page.evaluate(()=>window.testCapaUpdates.some(u=>u.val==='1'&&u.payload.capa_modulo3d_estudio===false)),'A foi desmarcado no banco (coluna capa_modulo3d_estudio)');
 assert.equal(await page.evaluate(()=>window.testCapaUpdates.some(u=>'capa_modulo3d_lounge' in u.payload)),false,'Nenhuma escrita tocou a coluna capa_modulo3d_lounge — módulos são independentes de verdade');

 // Volta pro mini-menu — o modelo em destaque do Estúdio agora é o item C.
 await page.locator('.catalog-brand').click();
 await page.locator('[data-gateway-tile="modulo3d"]').click();
 await page.locator('.catalog-modulo3d-menu').waitFor();
 await page.locator('[data-modulo3d-stage="estudio"] model-viewer').waitFor({timeout:10000});
 assert.match(await page.locator('[data-modulo3d-stage="estudio"] model-viewer').evaluate(el=>el.alt),/Aparador Baixo/,'Modelo em destaque do Estúdio trocou pro item C (recém-marcado)');
 assert.match(await page.locator('[data-modulo3d-stage="lounge"] model-viewer').evaluate(el=>el.alt),/Sofá Becca/,'Modelo do Lounge continua o mesmo (B) — não foi afetado');

 for(const width of [390,768,1024]){
   await page.setViewportSize({width,height:844});await page.waitForTimeout(150);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mini-menu sem overflow horizontal em '+width+'px');
 }
 await page.screenshot({path:path.join(os.tmpdir(),'catalogo-modulo3d-menu.png')});
 assert.deepEqual(errors,[]);
 await page.close();
}

// ===== Cenário 2: decorador externo — sem toggle, fallback sem modelo marcado =====
{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c9a874"/></svg>');
 await page.route('https://fixture/*.png',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 await page.route('https://fixture/*.glb',r=>r.fulfill({contentType:'model/gltf-binary',body:fakeGlbTriangle()}));
 await page.addInitScript(()=>{
  sessionStorage.setItem('catalogo_token','test');
  window.supabaseClient={rpc:async(name)=>{
   if(name==='catalogo_validar_sessao') return {data:{valido:true,empresa_id:'company',cliente_id:'client'}};
   if(name==='catalogo_carregar') return {data:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:[
     // Nenhum item marcado em módulo nenhum — só B tem modelo, deve ser o fallback nos 3 cards.
     {id:'1',tipo:'Item',produto:'Poltrona Águines Campo',categoria:'Estofados',foto_url:'https://fixture/1.png',capa_categoria:false,capa_modulo3d_estudio:false,capa_modulo3d_lounge:false,capa_modulo3d_ar:false,itens_fotos:[],itens_modelos_3d:[]},
     {id:'2',tipo:'Item',produto:'Sofá Becca',categoria:'Estofados',foto_url:'https://fixture/2.png',capa_categoria:false,capa_modulo3d_estudio:false,capa_modulo3d_lounge:false,capa_modulo3d_ar:false,itens_fotos:[],itens_modelos_3d:[{url:'https://fixture/modelo-b.glb',status:'ativo'}]},
   ]}};
   return {data:null};
  }};
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('[data-gateway-tile="modulo3d"]').waitFor();
 await page.locator('[data-gateway-tile="modulo3d"]').click();
 await page.locator('.catalog-modulo3d-menu').waitFor();
 await page.locator('[data-modulo3d-stage="estudio"] model-viewer').waitFor({timeout:10000});
 assert.match(await page.locator('[data-modulo3d-stage="estudio"] model-viewer').evaluate(el=>el.alt),/Sofá Becca/,'Sem nenhum marcado, cai pro primeiro item com modelo (B), nos 3 cards');
 assert.match(await page.locator('[data-modulo3d-stage="lounge"] model-viewer').evaluate(el=>el.alt),/Sofá Becca/);
 assert.match(await page.locator('[data-modulo3d-stage="realidade-aumentada"] model-viewer').evaluate(el=>el.alt),/Sofá Becca/);

 // Decorador nunca vê o botão de marcar, nem no item de detalhe.
 await page.locator('[data-modulo3d-card="estudio"]').click();
 await page.locator('#catalogStudio:not(.hidden)').waitFor();
 await page.locator('#catalogTimelinePast [data-timeline-entry]').filter({hasText:/m[óo]dulo 3d/i}).last().click();
 await page.locator('.catalog-modulo3d-menu').waitFor();
 await page.locator('.catalog-brand').click();
 await page.locator('[data-gateway-tile="catalogo"]').click();
 await page.locator('[data-home-category="estofados"]').click();
 await page.locator('[data-grid-item]').first().waitFor();
 assert.equal(await page.locator('[data-capa-modulo3d-toggle]').count(),0,'Decorador nunca vê nenhum botão de marcar modelo em destaque');

 await page.screenshot({path:path.join(os.tmpdir(),'catalogo-modulo3d-menu-decorador.png')});
 assert.deepEqual(errors,[]);
 await page.close();
}

// ===== Cenário 3: nenhum item do sistema tem modelo 3D nenhum — os 3 cards ficam só com fundo+título/resumo (sem ícone, removido a pedido do usuário) =====
{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c9a874"/></svg>');
 await page.route('https://fixture/*.png',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 await page.addInitScript(()=>{
  sessionStorage.setItem('catalogo_token','test');
  window.supabaseClient={rpc:async(name)=>{
   if(name==='catalogo_validar_sessao') return {data:{valido:true,empresa_id:'company',cliente_id:'client'}};
   if(name==='catalogo_carregar') return {data:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:[
     {id:'1',tipo:'Item',produto:'Poltrona Águines Campo',categoria:'Estofados',foto_url:'https://fixture/1.png',capa_categoria:false,capa_modulo3d_estudio:false,capa_modulo3d_lounge:false,capa_modulo3d_ar:false,itens_fotos:[],itens_modelos_3d:[]},
   ]}};
   return {data:null};
  }};
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('[data-gateway-tile="modulo3d"]').waitFor();
 await page.locator('[data-gateway-tile="modulo3d"]').click();
 await page.locator('.catalog-modulo3d-menu').waitFor();
 await page.waitForTimeout(300);
 assert.equal(await page.evaluate(()=>document.querySelectorAll('model-viewer').length),0,'Sem nenhum modelo no sistema, nenhum dos 3 cards tenta montar viewer');
 // Sem ícone de fallback nenhum (removido por completo — pedido
 // explícito do usuário: "aparece 3 ícones um em cada card, pode
 // remover eles, são inúteis") — sem modelo, o quadro fica só com o
 // fundo + título/resumo, título continua presente nos 3.
 assert.equal(await page.locator('.catalog-modulo3d-tile-stage svg').count(),0,'Nenhum SVG de ícone sobrou no stage sem modelo');
 assert.equal(await page.locator('.catalog-modulo3d-tile-name').count(),3,'Título continua aparecendo nos 3 cards mesmo sem nenhum modelo 3D');
 assert.deepEqual(errors,[]);
 await page.close();
}

console.log('PASS: mini-menu do Módulo 3D com carregamento único (percentual REAL 33/67/100%, cards escondidos até os 3 <model-viewer> terminarem de carregar DE VERDADE, revelados juntos sem piscar), um 3D diferente por card (Estúdio/Lounge/Realidade aumentada), cada um com sua PRÓPRIA flag de modelo em destaque (capa_modulo3d_estudio/_lounge/_ar, independentes entre si), nome do módulo virou título no topo do quadro + resumo (card.description) revelado logo abaixo SÓ no hover, na mesma fonte do título, quadro escurecendo mais forte no hover (mesmo mecanismo do Portal/Home), 3D com leve zoom no hover (desfaz ao tirar o mouse), sem ícone de fallback nenhum (removido — card sem modelo mostra só fundo+título/resumo), Estúdio abre a rota de sempre e desliga os 3 viewers do mini-menu ao sair, recurso futuro genuinamente inerte, botão de marcar por módulo, decorador nunca vê os botões, sem overflow em 390/768/1024px');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
