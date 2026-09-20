const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const path=require('node:path');const os=require('node:os');

// PNG 1×1 de verdade (mesma constante já usada em
// tests/catalogo-editor-fotos-browser.cjs) — a foto de fundo agora vira
// uma parede 3D de verdade (`new Image(); image.onload=...`), que precisa
// decodificar a imagem de fato; um buffer inválido nunca dispararia
// 'load' (só 'error'), travando o teste esperando por uma parede que
// nunca seria criada.
const PNG_1X1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');

// PNG de verdade (não SVG/fixture 1×1) numa proporção BEM mais larga que
// a parede de fundo (9:4,6 ≈ 1,96:1) — necessária pra reproduzir o bug
// real reportado pelo usuário ("quero arrastar a foto de fundo mais pra
// baixo e eu não consigo"): com uma foto quadrada (como PNG_1X1), o eixo
// horizontal é sempre o "apertado" no ajuste "cover", sobrando folga
// vertical de sobra — o bug só aparece com uma foto mais panorâmica que a
// própria parede, onde é o eixo VERTICAL que zera a folga.
const zlib=require('node:zlib');
function crc32(buf){
  if(!crc32.table){
    const t=new Uint32Array(256);
    for(let n=0;n<256;n++){
      let c=n;
      for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
      t[n]=c>>>0;
    }
    crc32.table=t;
  }
  let crc=0xFFFFFFFF;
  for(let i=0;i<buf.length;i++) crc=crc32.table[(crc^buf[i])&0xFF]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}
function pngChunk(type,data){
  const len=Buffer.alloc(4);len.writeUInt32BE(data.length,0);
  const typeBuf=Buffer.from(type,'ascii');
  const crcBuf=Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf,data])),0);
  return Buffer.concat([len,typeBuf,data,crcBuf]);
}
function makeSolidPng(width,height,rgb){
  const sig=Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);
  ihdr[8]=8;ihdr[9]=2;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0; // 8-bit RGB, sem interlace
  const raw=Buffer.alloc((width*3+1)*height);
  for(let y=0;y<height;y++){
    const rowStart=y*(width*3+1);
    raw[rowStart]=0;
    for(let x=0;x<width;x++){
      const px=rowStart+1+x*3;
      raw[px]=rgb[0];raw[px+1]=rgb[1];raw[px+2]=rgb[2];
    }
  }
  const idat=pngChunk('IDAT',zlib.deflateSync(raw));
  return Buffer.concat([sig,pngChunk('IHDR',ihdr),idat,pngChunk('IEND',Buffer.alloc(0))]);
}
const PNG_WIDE_PANORAMIC=makeSolidPng(1200,220,[120,150,190]); // 5,45:1 — bem mais largo que a parede

// GLB mínimo mas com UM TRIÂNGULO de verdade (mesmo fixture já usado em
// tests/catalogo-modulo3d-menu-browser.cjs) — necessário porque o GLTFLoader
// faz parsing binário real assim que o modelo é carregado.
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

// Sofá A/B (pra trocar de item no papel "Sofá" e confirmar que a
// composição é remontada), Poltrona, Mesa de centro, Aparador — todos com
// modelo 3D. "Banqueta" não tem nenhum papel do Lounge compacto e não tem
// .glb — prova que itens sem modelo/sem papel não aparecem nos seletores.
function itemsFixture(){
  return [
    {id:'1',tipo:'Item',produto:'Sofá Lounge 3 Lugares',categoria:'Estofados',material:'Linho',cor:'Bege',largura:2.1,altura:.85,profundidade:.92,foto_url:'https://fixture/1.png',itens_fotos:[],itens_modelos_3d:[{url:'https://fixture/sofa-a.glb',status:'ativo'}]},
    {id:'2',tipo:'Item',produto:'Sofá Becca',categoria:'Estofados',material:'Veludo',cor:'Verde',largura:2.4,altura:.8,profundidade:.95,foto_url:'https://fixture/2.png',itens_fotos:[],itens_modelos_3d:[{url:'https://fixture/sofa-b.glb',status:'ativo'}]},
    {id:'3',tipo:'Item',produto:'Poltrona Águines',categoria:'Estofados',material:'Veludo',cor:'Terracota',largura:.7,altura:.9,profundidade:.75,foto_url:'https://fixture/3.png',itens_fotos:[],itens_modelos_3d:[{url:'https://fixture/poltrona.glb',status:'ativo'}]},
    {id:'4',tipo:'Item',produto:'Mesa de Centro Redonda',categoria:'Mesas',material:'Madeira',cor:'Natural',largura:.6,altura:.4,profundidade:.6,foto_url:'https://fixture/4.png',itens_fotos:[],itens_modelos_3d:[{url:'https://fixture/mesa-centro.glb',status:'ativo'}]},
    {id:'5',tipo:'Item',produto:'Aparador Baixo',categoria:'Mesas',material:'Madeira',cor:'Escuro',largura:1.4,altura:.75,profundidade:.4,foto_url:'https://fixture/5.png',itens_fotos:[],itens_modelos_3d:[{url:'https://fixture/aparador.glb',status:'ativo'}]},
    {id:'6',tipo:'Item',produto:'Banqueta Alta',categoria:'Assentos',material:'Metal',cor:'Preto',largura:.4,altura:.75,profundidade:.4,foto_url:'https://fixture/6.png',itens_fotos:[],itens_modelos_3d:[]},
  ];
}

// Espiona a Fullscreen API (mesmo padrão de tests/catalogo-modulo3d-menu-browser.cjs) —
// evita depender do suporte real do Chrome headless a tela cheia.
const FULLSCREEN_SPY=`(() => {
  window.__fullscreenCalls = [];
  let fsEl = null;
  Object.defineProperty(document, 'fullscreenElement', { get: () => fsEl, configurable: true });
  Element.prototype.requestFullscreen = function(){
    window.__fullscreenCalls.push('request');
    fsEl = this;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  };
  document.exitFullscreen = function(){
    window.__fullscreenCalls.push('exit');
    fsEl = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  };
})();`;

(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{

// ===== Cenário 1: equipe interna — card disponível, formatos/itens, câmera, tela cheia, teardown =====
{
 const page=await browser.newPage({viewport:{width:1600,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c9a874"/></svg>');
 await page.route('https://fixture/*.png',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 await page.route('https://fixture/*.glb',r=>r.fulfill({contentType:'model/gltf-binary',body:fakeGlbTriangle()}));
 await page.addInitScript(FULLSCREEN_SPY);
 // Espiona chamadas reais de desenho WebGL (nível de API do navegador,
 // não do módulo Three.js — funciona independente de quando/como "three"
 // é importado) — usado pra provar que loungeCleanPreview() força um
 // render() síncrono de verdade antes de capturar, não só lê o buffer
 // "como estiver".
 await page.addInitScript(()=>{
  window.__loungeWebglClears=0;
  const patch=(proto)=>{
   if(!proto||proto.__loungePatched) return;
   proto.__loungePatched=true;
   const original=proto.clear;
   proto.clear=function(...args){ window.__loungeWebglClears++; return original.apply(this,args); };
  };
  patch(window.WebGL2RenderingContext?.prototype);
  patch(window.WebGLRenderingContext?.prototype);
 });
 await page.addInitScript(()=>{
  // Login DIRETO da equipe (não login_ok/dashboard), mesmo motivo do
  // teste do mini-menu Módulo 3D: precisa voltar pro Portal (logo
  // clicável) sem o modo dashboard escondendo .catalog-brand.
  function builder(v){return new Proxy({},{get(_t,p){if(p==='then')return(r)=>r(v());return()=>builder(v);}});}
  window.supabaseClient={
   auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}},error:null}),getUser:async()=>({data:{user:{id:'u1'}},error:null})},
   from(table){
    if(table==='usuarios_empresas')return builder(()=>({data:{empresa_id:'company'},error:null}));
    if(table==='empresas')return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{nome:'Chiavari',logo_url:null},error:null})};
    return builder(()=>({data:[],error:null}));},
   rpc:async(name)=>{
    if(name==='funcionario_contexto')return{data:{ativo:true,administrador_legado:true},error:null};
    if(name==='catalogo_carregar_interno')return{data:{empresa:{nome:'Chiavari'},decorador:null,itens:window.__ITEMS_FIXTURE__}};
    if(name==='catalogo_capas_carregar_interno')return{data:{}};
    if(name==='biblioteca_carregar_interno')return{data:{fotos:[]}};
    return {data:null,error:null};
   },
   storage:{from(bucket){return{getPublicUrl:(p)=>({data:{publicUrl:'https://fixture/x/'+p}})};}},
   // window.CatalogCredits.invoke() chama client.functions.invoke() por
   // baixo — pra equipe interna (sem catalogo_token no sessionStorage)
   // isso pula direto pra cá, sem diálogo de confirmação de créditos (que
   // só existe pro decorador externo) — mock simples de sucesso.
   functions:{invoke:async(name,options)=>{
    window.__renderCalls=(window.__renderCalls||[]).concat(name);
    window.__lastRenderOptions=options;
    if(name==='studio-ai-engine') return {data:{providerStatus:'ok',images:[{url:'https://fixture/render-result.png'}]},error:null};
    return {data:null,error:new Error('not mocked')};
   }},
  };
 });
 await page.addInitScript((items)=>{ window.__ITEMS_FIXTURE__=items; }, itemsFixture());
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('.catalog-gateway').waitFor();
 await page.locator('[data-gateway-tile="modulo3d"]').click();
 await page.locator('.catalog-modulo3d-menu').waitFor();

 // "planejador-eventos" virou "Módulo Lounge": disponível, clicável —
 // não é mais um dos "Em breve". Só "Realidade aumentada" segue inerte.
 // Layout dos tiles (igual à Home: 3D grande + nome embaixo, sem
 // descrição/botão separado) é responsabilidade do mini-menu Módulo 3D —
 // ver tests/catalogo-modulo3d-menu-browser.cjs pra cobertura completa;
 // aqui só confirma que o card certo aparece disponível.
 assert.equal(await page.locator('.catalog-modulo3d-tile:not(.catalog-modulo3d-tile-soon)').count(),2,'3D Livre + Composições, os 2 disponíveis');
 assert.match(await page.locator('[data-modulo3d-card="lounge"] .catalog-modulo3d-tile-name').textContent(),/^Composições$/);
 const soonTitles=await page.locator('.catalog-modulo3d-tile-soon .catalog-modulo3d-tile-name').allTextContents();
 assert.deepEqual(soonTitles,['Em desenvolvimento'],'Só 1 recurso futuro sobrou, sem nome próprio: só "Em desenvolvimento"');
 // :light() restringe ao DOM "claro" do próprio tile — sem isso o
 // seletor atravessa a shadow DOM do <model-viewer> decorativo embutido
 // no tile (que tem seus PRÓPRIOS botões internos), que não tem nada a
 // ver com "o tile não tem elemento clicável" (ver Módulo 3D acima).
 assert.equal(await page.locator('.catalog-modulo3d-tile-soon :light(button), .catalog-modulo3d-tile-soon :light(a)').count(),0,'Recurso futuro continua sem nenhum elemento clicável no próprio DOM');

 // Clicar no tile abre o Módulo Lounge — caminho na linha do tempo, rótulo do
 // cabeçalho, mini-menu escondido (só um overlay por vez).
 await page.locator('[data-modulo3d-card="lounge"]').click();
 await page.locator('#catalogLounge:not(.hidden)').waitFor();
 assert.equal(await page.locator('#catalogPageLabel').textContent(),'Composições');
 assert.match(await page.locator('#catalogTimelinePast').innerText(),/m[óo]dulo 3d/i,'a linha do tempo do cabeçalho mostra o caminho até aqui (…› Módulo 3D › Composições)');
 assert.equal(await page.locator('#catalogBreadcrumb').count(),0,'a trilha abaixo do cabeçalho foi apagada');
 assert.equal(await page.evaluate(()=>document.querySelectorAll('model-viewer').length),0,'model-viewer do mini-menu foi desligado ao abrir o Módulo Lounge');
 // Pedido do usuário, com print: "ficou muito grudado as abas, precisa dar um respiro melhor" — a
 // barra de abas não pode ficar colada no cabeçalho. (Na época o "grudado" era contra a trilha
 // abaixo do cabeçalho, que foi apagada; o respiro agora é só o padding do topo da coluna.)
 const tabsGap=await page.evaluate(()=>{
   const hd=document.querySelector('.catalog-header').getBoundingClientRect();
   const tabs=document.querySelector('.catalog-lounge-tabs').getBoundingClientRect();
   return tabs.top-hd.bottom;
 });
 assert.ok(tabsGap>10,`Barra de abas tem respiro de verdade abaixo do cabeçalho (gap=${tabsGap}px)`);

 // Formato "Lounge compacto" ativo por padrão, único da coluna por
 // enquanto (pedido explícito: "só terá lounge mesmo").
 assert.equal(await page.locator('.catalog-lounge-format').count(),1);
 assert.match(await page.locator('.catalog-lounge-format').textContent(),/Lounge compacto/);
 assert.equal(await page.locator('.catalog-lounge-format.is-active').count(),1);

 // 5 papéis na coluna de itens: Sofá/Poltrona (obrigatórios) + Mesa de
 // centro/Mesa lateral/Aparador (opcionais, com "Nenhuma").
 const roleLabels=await page.locator('.catalog-lounge-role legend').allTextContents();
 assert.deepEqual(roleLabels,['Sofá *','Poltrona *','Mesa de centro','Mesa lateral/canto','Aparador']);
 assert.equal(await page.locator('[data-lounge-role="sofa"] .catalog-lounge-item-chip').count(),2,'2 sofás com modelo 3D no seletor');
 assert.equal(await page.locator('[data-lounge-role="armchair"] .catalog-lounge-item-chip').count(),1,'1 poltrona com modelo 3D');
 assert.equal(await page.locator('[data-lounge-role="center"] .catalog-lounge-item-chip.is-none').count(),1,'papel opcional tem "Nenhuma"');
 assert.equal(await page.locator('[data-lounge-role="side"] .catalog-lounge-role-empty').count(),1,'nenhuma "mesa lateral/canto" cadastrada — aviso, não quebra');

 // Papéis obrigatórios já vêm com um item padrão selecionado (o 1º
 // encontrado) — a composição aparece sem exigir nenhuma escolha manual
 // primeiro ("mais simples pro decorador testar").
 assert.equal(await page.locator('[data-lounge-role="sofa"] .catalog-lounge-item-chip.is-active').count(),1);
 assert.equal(await page.locator('[data-lounge-role="armchair"] .catalog-lounge-item-chip.is-active').count(),1);
 await page.locator('.catalog-lounge-canvas-host canvas').waitFor({timeout:10000});
 const host=page.locator('#loungeCanvasHost');
 await page.waitForFunction(()=>document.querySelector('#loungeCanvasHost')?.dataset.cameraDistance,null,{timeout:10000});
 const initialDistance=Number(await host.getAttribute('data-camera-distance'));
 assert.ok(initialDistance>0,'câmera inicial resolvida');

 // Abas do lado esquerdo (pedido explícito do usuário: "no lado esquerdo
 // eu quero que tenha abas, uma aba só pra formatos, uma aba pra itens e
 // uma aba pra ambiente") — só uma seção fica visível por vez agora,
 // então interagir com os chips de item precisa abrir a aba "Itens"
 // primeiro (as checagens de contagem/texto acima não precisam disso —
 // funcionam em qualquer aba, só ações de clique exigem visibilidade).
 assert.equal(await page.locator('[data-lounge-panel="formats"].is-active').count(),1,'Aba "Formatos" ativa por padrão ao abrir');
 await page.locator('[data-lounge-tab="items"]').click();
 assert.equal(await page.locator('[data-lounge-panel="items"].is-active').count(),1,'Aba "Itens" fica ativa depois do clique');
 assert.equal(await page.locator('[data-lounge-panel="formats"].is-active').count(),0,'Aba "Formatos" desativa (só uma por vez)');

 // Trocar o sofá selecionado remonta a composição (3D real, não
 // ilustrativo) — confere que o chip certo fica marcado.
 await page.locator('[data-lounge-role="sofa"] .catalog-lounge-item-chip').nth(1).click();
 await page.waitForFunction(()=>document.querySelector('[data-lounge-role="sofa"] .catalog-lounge-item-chip.is-active span')?.textContent.includes('Sofá Becca'));
 assert.equal(await page.locator('[data-lounge-role="sofa"] .catalog-lounge-item-chip').nth(0).getAttribute('aria-pressed'),'false');

 // Controles de câmera mexem na câmera DE VERDADE (mesmo padrão de rigor
 // já usado no mini-menu Módulo 3D — só que aqui via um atributo de
 // depuração, já que a cena é raw Three.js sem getCameraOrbit()).
 await page.locator('[data-lounge-zoom-in]').click();
 await page.waitForFunction((d0)=>Number(document.querySelector('#loungeCanvasHost')?.dataset.cameraDistance)<d0,initialDistance);
 const afterZoomIn=Number(await host.getAttribute('data-camera-distance'));
 assert.ok(afterZoomIn<initialDistance,'Aproximar reduz a distância da câmera');
 await page.locator('[data-lounge-zoom-out]').click();
 await page.waitForFunction((d0)=>Number(document.querySelector('#loungeCanvasHost')?.dataset.cameraDistance)>d0,afterZoomIn);
 const afterZoomOut=Number(await host.getAttribute('data-camera-distance'));
 assert.ok(afterZoomOut>afterZoomIn,'Afastar aumenta a distância de novo');
 await page.locator('[data-lounge-reset]').click();
 await page.waitForFunction((d0)=>Math.abs(Number(document.querySelector('#loungeCanvasHost')?.dataset.cameraDistance)-d0)<1e-3,initialDistance);
 assert.ok(true,'Redefinir volta pra distância inicial exata');

 // Bug real reportado pelo usuário: "a renderização mudou completamente
 // o mobiliário, tem que funcionar igual a renderização que acontece
 // dentro do nosso painel 3d que já existe". Causa: `placeRole()` é
 // assíncrona — `clearRole()` já tira a peça antiga da cena na hora, o
 // `.glb` novo só entra depois de um `await` — nessa janela o botão
 // "Renderizar com IA" continuava clicável, capturando uma composição
 // incompleta (papel sem nenhuma peça ainda) que a IA então "completava"
 // com mobiliário genérico. Reproduzido atrasando de propósito a resposta
 // do `.glb` de um papel AINDA NÃO carregado (Mesa de centro — sofá e
 // poltrona já estão em cache de `loadModel()` a essa altura do teste,
 // reselecioná-los não dispara rede nenhuma) — não um timeout arbitrário,
 // um controle real do momento exato da resposta de rede.
 let releaseCenterGlb;
 const centerGlbGate=new Promise((resolve)=>{ releaseCenterGlb=resolve; });
 await page.route('https://fixture/mesa-centro.glb',async(route)=>{ await centerGlbGate; route.fulfill({contentType:'model/gltf-binary',body:fakeGlbTriangle()}); });
 const renderCallsBeforeSwap=(await page.evaluate(()=>window.__renderCalls?.length||0));
 await page.locator('[data-lounge-role="center"] .catalog-lounge-item-chip:not(.is-none)').click();
 await page.waitForFunction(()=>document.querySelector('#loungeCanvasHost .catalog-lounge-loading'),null,{timeout:5000});
 assert.equal(await page.locator('#loungeRenderButton').isDisabled(),true,'Botão de renderizar fica desabilitado enquanto a composição ainda está sendo montada');
 await page.evaluate(()=>document.getElementById('loungeRenderButton')?.click()); // clique direto no DOM — bypassa a checagem de "actionability" do Playwright, prova que o handler em si recusa
 await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>window.__renderCalls?.length||0),renderCallsBeforeSwap,'Clicar durante a montagem não chega a chamar a IA — nenhuma composição incompleta é enviada');
 releaseCenterGlb();
 await page.waitForFunction(()=>!document.querySelector('#loungeCanvasHost .catalog-lounge-loading'),null,{timeout:5000});
 assert.equal(await page.locator('#loungeRenderButton').isDisabled(),false,'Botão volta a ficar habilitado assim que a composição termina de verdade');

 // "Renderizar com IA" — pedido explícito do usuário: "preciso que tenha
 // aqui o botão renderizar com IA também" (mesma capacidade do Estúdio de
 // Ambientes, mesma função de borda studio-ai-engine, mesmo padrão de
 // créditos). Equipe interna (sem catalogo_token) pula a confirmação de
 // créditos — chama a função direto.
 assert.equal(await page.locator('#loungeRenderButton').count(),1,'Botão de renderizar existe');
 assert.equal(await page.locator('#loungeRenderButton').textContent(),'Renderizar com IA');
 // O projeto (catalogo-projetos.mjs) precisa saber quais móveis estão na imagem — o módulo avisa quando a IA devolve.
 await page.evaluate(()=>{const original=window.catalogRegisterRenderItems;window.__registrados=[];window.catalogRegisterRenderItems=(src,objetos)=>{window.__registrados.push({src,objetos});original?.(src,objetos);};});
 await page.locator('[data-lounge-render]').click();
 await page.waitForFunction(()=>window.__renderCalls?.includes('studio-ai-engine'),null,{timeout:10000});
 await page.waitForFunction(()=>window.__registrados?.length===1,null,{timeout:10000});
 const registrado=await page.evaluate(()=>window.__registrados[0]);
 assert.match(registrado.src,/render-result\.png/,'Os móveis ficam atrelados à imagem devolvida');
 assert.ok(registrado.objetos.length>=2&&registrado.objetos.every(o=>o.itemId&&o.itemName),'Registra cada peça da cena com itemId e nome (sofá + poltronas)');
 assert.equal(new Set(registrado.objetos.map(o=>o.itemId)).size<registrado.objetos.length,true,'Poltrona repetida na cena conta como mais de uma unidade do mesmo item');
 // Pedido explícito do usuário: "quero que respeite exatamente o
 // ângulo, a distância e principalmente o preview... é como se tirasse
 // um print do que eu estou vendo no 3d e desse só o realismo... sem
 // inventar nada" — política própria (mais rígida que a do Estúdio de
 // Ambientes) que trava a arquitetura também, não só os móveis.
 assert.equal(await page.evaluate(()=>window.__lastRenderOptions?.body?.scene?.referencePolicy),'furniture_strict_literal_scene','Envia a política rígida de cena literal, não a flexível do Estúdio');
 assert.match(await page.evaluate(()=>window.__lastRenderOptions?.body?.prompt),/sem teto/i,'Prompt instrui explicitamente a não inventar teto/arquitetura fora do que já está na captura');
 // Pedido explícito do usuário, depois de já ter aprovado o resultado
 // geral: "eu só queria respeitar mais o posicionamento da câmera, queria
 // que seguisse exatamente o posicionamento que eu ajustei, queria que
 // fosse extremamente fiel a isso" — o prompt precisa tratar
 // ângulo/distância/enquadramento como prioridade máxima, não só mais um
 // item da lista de regras.
 assert.match(await page.evaluate(()=>window.__lastRenderOptions?.body?.prompt),/prioridade m[aá]xima/i,'Prompt trata o ângulo/distância/enquadramento da câmera como prioridade máxima, não só mais uma regra');
 await page.locator('.catalog-notification-action').waitFor({timeout:10000});
 // Pedido explícito do usuário: "quero que a notificação de todos os
 // módulos apareça a imagem, igual é em troca de tecido" — a notificação
 // de sucesso já mostra a foto ANTES de clicar "Ver resultado", mesmo
 // padrão de `.catalog-notification-photo` já usado no tecido.
 assert.match(await page.locator('.catalog-notification-photo').getAttribute('src'),/^https:\/\/fixture\/render-result\.png/,'Notificação de sucesso já mostra a foto, igual ao tecido');
 await page.locator('.catalog-notification-action').click();
 await page.locator('#loungeResultDialog[open]').waitFor({timeout:5000});
 assert.match(await page.locator('#loungeResultImage').getAttribute('src'),/^https:\/\/fixture\/render-result\.png/,'Diálogo de resultado mostra a imagem que a IA devolveu');
 assert.match(await page.locator('#loungeResultDownload').getAttribute('href'),/^https:\/\/fixture\/render-result\.png/);
 assert.match(await page.locator('#loungeResultDownload').getAttribute('download'),/lounge-acervo\.png/);
 await page.locator('#loungeResultClose').click();
 assert.equal(await page.locator('#loungeResultDialog[open]').count(),0,'Fecha o diálogo de resultado');
 assert.equal(await page.locator('#loungeRenderButton').isDisabled(),false,'Botão reabilitado depois da renderização');
 assert.equal(await page.locator('#loungeRenderButton').textContent(),'Renderizar com IA','Texto do botão volta ao original');

 // Bug real reportado pelo usuário, com prints lado a lado (a foto que a
 // IA devolveu não tinha NADA a ver com a composição real 3D): a captura
 // usada como referência (`loungeCleanPreview()`) só lia
 // `renderer.domElement` "como estivesse", confiando que o loop de
 // `requestAnimationFrame` tinha acabado de desenhar um frame válido —
 // sem `preserveDrawingBuffer:true`, isso não é garantido no momento
 // exato de um clique (tarefa assíncrona, fora do loop de RAF). O
 // Estúdio de Ambientes (`captureCleanPreview()`) sempre forçou um
 // `render()` síncrono bem antes de capturar, exatamente por essa razão
 // — corrigido replicando esse mesmo passo aqui. Provado congelando o
 // loop de RAF (parando os frames ambiente de propósito), girando a
 // câmera só no grafo de cena (sem nenhum repaint automático possível) e
 // confirmando que clicar em "Renderizar com IA" ainda assim dispara uma
 // passada de desenho WebGL de verdade — só pode vir do render() forçado
 // dentro de loungeCleanPreview(), já que o RAF está desligado.
 await page.evaluate(()=>{ window.__loungeRealRaf=window.requestAnimationFrame; window.requestAnimationFrame=()=>0; });
 await page.waitForTimeout(120); // deixa qualquer frame já agendado (antes do congelamento) terminar
 await page.locator('[data-lounge-zoom-in]').click(); // mexe no grafo de cena sem nenhum repaint automático possível
 const clearsBeforeRenderClick=await page.evaluate(()=>window.__loungeWebglClears);
 await page.locator('[data-lounge-render]').click();
 await page.waitForFunction(()=>window.__renderCalls?.filter(c=>c==='studio-ai-engine').length>1,null,{timeout:10000});
 const clearsAfterRenderClick=await page.evaluate(()=>window.__loungeWebglClears);
 assert.ok(clearsAfterRenderClick>clearsBeforeRenderClick,'Clicar em "Renderizar com IA" força um render() WebGL de verdade antes de capturar, mesmo com o loop de animação parado — a captura nunca fica por conta só do timing do RAF');
 await page.locator('.catalog-notification-action').waitFor({timeout:10000});
 await page.locator('.catalog-notification-action').click();
 await page.locator('#loungeResultDialog[open]').waitFor({timeout:5000});
 await page.locator('#loungeResultClose').click();
 await page.evaluate(()=>{ window.requestAnimationFrame=window.__loungeRealRaf; }); // religa o loop normal pro resto do cenário

 // Dica de uso esmaece numa interação real (roda do mouse no canvas).
 assert.equal(await page.locator('.catalog-lounge-hint.is-dismissed').count(),0);
 await page.locator('.catalog-lounge-canvas-host canvas').dispatchEvent('wheel');
 await page.waitForFunction(()=>document.querySelector('.catalog-lounge-hint')?.classList.contains('is-dismissed'));

 // Tela cheia expande só o visualizador, via a Fullscreen API de
 // verdade (espionada).
 assert.equal(await page.locator('.catalog-lounge-viewer.is-fullscreen').count(),0);
 await page.locator('[data-lounge-fullscreen]').click();
 await page.waitForFunction(()=>document.querySelector('.catalog-lounge-viewer')?.classList.contains('is-fullscreen'));
 assert.equal(await page.evaluate(()=>window.__fullscreenCalls.includes('request')),true);
 assert.match(await page.locator('[data-lounge-fullscreen]').getAttribute('aria-label'),/Sair da tela cheia/);
 await page.locator('[data-lounge-fullscreen]').click();
 await page.waitForFunction(()=>!document.querySelector('.catalog-lounge-viewer')?.classList.contains('is-fullscreen'));
 assert.equal(await page.evaluate(()=>window.__fullscreenCalls.includes('exit')),true);

 // Abre a aba "Ambiente" — piso e foto de fundo moram lá agora.
 await page.locator('[data-lounge-tab="environment"]').click();
 assert.equal(await page.locator('[data-lounge-panel="environment"].is-active').count(),1,'Aba "Ambiente" fica ativa');
 assert.equal(await page.locator('[data-lounge-panel="items"].is-active').count(),0);

 // Piso: 5 opções, "Piso neutro" ativo por padrão, trocar aplica de
 // verdade no chão da cena (pedido explícito: "quero que a pessoa possa
 // escolher o piso").
 assert.equal(await page.locator('.catalog-lounge-floor-swatch').count(),5);
 assert.equal(await host.getAttribute('data-floor-key'),'neutral');
 assert.equal(await page.locator('.catalog-lounge-floor-swatch.is-active').count(),1);
 await page.locator('[data-lounge-floor="wood"]').click();
 await page.waitForFunction(()=>document.querySelector('#loungeCanvasHost')?.dataset.floorKey==='wood');
 assert.match(await page.locator('[data-lounge-floor="wood"]').getAttribute('aria-pressed'),/true/);
 assert.equal(await page.locator('[data-lounge-floor="neutral"]').getAttribute('aria-pressed'),'false');

 // Fundo por foto: some por padrão, upload cria uma PAREDE de verdade na
 // cena (pedido explícito, corrigindo a 1ª versão que era só CSS: "a foto
 // de fundo ela deve ser igual a parede que nós temos no outro módulo
 // 3d" — mesma técnica do Estúdio de Ambientes, um plano com textura, não
 // um truque de background-image). `data-background-wall` no host é o
 // mesmo tipo de atributo de depuração já usado por
 // `data-camera-distance`/`data-floor-key` — dá pra confirmar de fora que
 // a parede existe/está visível sem expor nada em `window`.
 assert.equal(await page.locator('#loungeBgRemove:not(.hidden)').count(),0,'Sem foto de fundo ainda, botão de remover escondido');
 assert.equal(await page.locator('#loungeBgLabel').textContent(),'Escolher foto de fundo');
 assert.equal(await host.getAttribute('data-background-wall'),'none','Nenhuma parede de fundo na cena ainda');
 await page.locator('#loungeBgInput').setInputFiles({name:'fundo.png',mimeType:'image/png',buffer:PNG_1X1});
 await page.waitForFunction(()=>document.querySelector('#loungeCanvasHost')?.dataset.backgroundWall==='visible',null,{timeout:10000});
 assert.equal(await page.evaluate(()=>document.querySelectorAll('#loungeCanvasHost canvas').length),1,'Ainda só 1 canvas (a parede é malha 3D dentro da MESMA cena, não um elemento novo)');
 // Pedido explícito do usuário, com print real mostrando um vão vazio de
 // piso entre os móveis e a parede: "esse espaço do 3d até o fundo não
 // pode ter, o primeiro 3D tem que ficar pertinho da parede" — a parede
 // precisa encostar perto da composição de verdade (caixa delimitadora
 // real das peças), não ficar numa distância fixa e distante.
 const wallZ=Number(await host.getAttribute('data-background-wall-z'));
 assert.ok(wallZ>-2 && wallZ<-0.2,`Parede encosta perto da composição, sem vão vazio (z=${wallZ})`);

 // Ajustar a foto de fundo ARRASTANDO (pedido explícito do usuário,
 // preferindo isso a botões: "se puder ser arrastar seria ótimo ao invés
 // de botões"). Fora do modo de ajuste, arrastar no visualizador continua
 // girando a câmera normalmente — a foto NÃO deve se mexer.
 const canvasBox=await page.locator('.catalog-lounge-canvas-host canvas').boundingBox();
 const cx=canvasBox.x+canvasBox.width/2, cy=canvasBox.y+canvasBox.height/2;
 assert.equal(await host.getAttribute('data-wall-offset'),'50.0,50.0,1.00','Foto de fundo começa centralizada, sem zoom');
 await page.mouse.move(cx,cy);
 await page.mouse.down();
 await page.mouse.move(cx-120,cy-60,{steps:5});
 await page.mouse.up();
 await page.waitForTimeout(100);
 assert.equal(await host.getAttribute('data-wall-offset'),'50.0,50.0,1.00','Fora do modo de ajuste, arrastar NÃO move a foto (continua sendo o gesto de girar a câmera)');

 assert.equal(await page.locator('#loungeBgAdjust:not(.hidden)').count(),1,'Botão "Ajustar imagem" aparece com a foto aplicada');
 assert.equal(await page.locator('#loungeBgAdjust').textContent(),'Ajustar imagem (arrastar)');
 await page.locator('[data-lounge-bg-adjust]').click();
 assert.equal(await page.locator('#loungeBgAdjust.is-active').count(),1,'Modo de ajuste ativo');
 assert.equal(await page.locator('#loungeBgAdjust').textContent(),'Concluir ajuste');
 assert.equal(await page.locator('.catalog-lounge-canvas-host.is-adjusting-wall').count(),1,'Cursor de arrastar (grab) no canvas');
 assert.match(await page.locator('.catalog-lounge-hint span').textContent(),/Arraste para posicionar a foto de fundo/,'Dica muda de texto durante o ajuste (sem mencionar rolar — zoom não é mais por mouse)');

 await page.mouse.move(cx,cy);
 await page.mouse.down();
 await page.mouse.move(cx-120,cy-60,{steps:5});
 await page.mouse.up();
 await page.waitForTimeout(100);
 const [px,py]=(await host.getAttribute('data-wall-offset')).split(',').map(Number);
 assert.notEqual(px,50,'Arrastar dentro do modo de ajuste move a foto de verdade (x mudou)');
 assert.notEqual(py,50,'Arrastar dentro do modo de ajuste move a foto de verdade (y mudou)');

 // Pedido explícito do usuário, corrigindo a 1ª versão: "o zoom não pode
 // ser com o mouse, tem que ser com botão + e - mesmo" — rolar o mouse no
 // canvas (dentro OU fora do modo de ajuste) não deve mais alterar o zoom
 // da foto; só os botões +/- fazem isso.
 const zoomBeforeWheel=Number((await host.getAttribute('data-wall-offset')).split(',')[2]);
 await page.locator('.catalog-lounge-canvas-host canvas').dispatchEvent('wheel',{deltaY:-100});
 await page.waitForTimeout(100);
 assert.equal(Number((await host.getAttribute('data-wall-offset')).split(',')[2]),zoomBeforeWheel,'Rolar o mouse NÃO altera mais o zoom da foto');

 assert.equal(await page.locator('#loungeBgZoom:not(.hidden)').count(),1,'Botões de zoom (+/-) aparecem com a foto aplicada');
 await page.locator('[data-lounge-bg-zoom-in]').click();
 await page.waitForTimeout(50);
 const zoomAfterPlus=Number((await host.getAttribute('data-wall-offset')).split(',')[2]);
 assert.ok(zoomAfterPlus>zoomBeforeWheel,'Botão "+" aumenta o zoom da foto de verdade');
 await page.locator('[data-lounge-bg-zoom-out]').click();
 await page.locator('[data-lounge-bg-zoom-out]').click();
 await page.waitForTimeout(50);
 const zoomAfterMinus=Number((await host.getAttribute('data-wall-offset')).split(',')[2]);
 assert.ok(zoomAfterMinus<zoomAfterPlus,'Botão "−" diminui o zoom da foto de verdade');

 // Zoom por botão funciona mesmo FORA do modo de ajuste (só arrastar
 // precisa do modo — zoom por clique não conflita com girar a câmera).
 await page.locator('[data-lounge-bg-adjust]').click();
 assert.equal(await page.locator('#loungeBgAdjust.is-active').count(),0,'Modo de ajuste desativado');
 assert.equal(await page.locator('.catalog-lounge-canvas-host.is-adjusting-wall').count(),0);
 const offsetAfterExit=await host.getAttribute('data-wall-offset');
 await page.mouse.move(cx,cy);
 await page.mouse.down();
 await page.mouse.move(cx-120,cy-60,{steps:5});
 await page.mouse.up();
 await page.waitForTimeout(100);
 assert.equal(await host.getAttribute('data-wall-offset'),offsetAfterExit,'Depois de "Concluir ajuste", arrastar volta a girar a câmera (foto não muda mais)');
 await page.locator('[data-lounge-bg-zoom-in]').click();
 await page.waitForTimeout(50);
 assert.ok(Number((await host.getAttribute('data-wall-offset')).split(',')[2])>Number(offsetAfterExit.split(',')[2]),'Botão "+" continua funcionando mesmo fora do modo de ajuste');

 // Bug real reportado pelo usuário: "estou tendo uma limitação, quero
 // arrastar a foto de fundo mais pra baixo e eu não consigo". Causa:
 // com "cover" fit puro (zoom mínimo), o eixo que precisa da MAIOR
 // escala pra cobrir a parede (9:4,6 ≈ 1,96:1) fica com folga ZERO —
 // pra uma foto mais panorâmica que a própria parede, esse eixo é o
 // VERTICAL, e arrastar pra cima/baixo não tinha efeito nenhum. Trocada
 // a foto de fundo por uma bem mais larga que a parede pra reproduzir.
 await page.locator('#loungeBgInput').setInputFiles({name:'panoramica.png',mimeType:'image/png',buffer:PNG_WIDE_PANORAMIC});
 await page.waitForFunction(()=>document.querySelector('#loungeCanvasHost')?.dataset.wallOffset==='50.0,50.0,1.00',null,{timeout:10000});
 await page.locator('[data-lounge-bg-adjust]').click();
 assert.equal(await page.locator('#loungeBgAdjust.is-active').count(),1,'Modo de ajuste ativo de novo, com a foto panorâmica');
 const [drawXCentered,drawYCentered]=(await host.getAttribute('data-wall-draw-offset')).split(',').map(Number);
 await page.mouse.move(cx,cy);
 await page.mouse.down();
 await page.mouse.move(cx,cy-Math.min(200,canvasBox.height*0.4),{steps:6}); // arrasta pra CIMA
 await page.mouse.up();
 await page.waitForTimeout(100);
 const [,drawYAfterUp]=(await host.getAttribute('data-wall-draw-offset')).split(',').map(Number);
 assert.ok(Math.abs(drawYAfterUp-drawYCentered)>5,`Arrastar pra cima move a foto de verdade no eixo vertical (drawY ${drawYCentered} → ${drawYAfterUp})`);
 await page.mouse.move(cx,cy);
 await page.mouse.down();
 await page.mouse.move(cx,cy+Math.min(400,canvasBox.height*0.8),{steps:10}); // arrasta bem pra BAIXO
 await page.mouse.up();
 await page.waitForTimeout(100);
 const [,drawYAfterDown]=(await host.getAttribute('data-wall-draw-offset')).split(',').map(Number);
 assert.ok(drawYAfterDown>drawYAfterUp,`Arrastar pra baixo continua movendo a foto além de onde estava (drawY ${drawYAfterUp} → ${drawYAfterDown}) — antes da correção ficava travado no mesmo valor`);
 assert.ok(Math.abs(drawYAfterDown-drawYCentered)>5,'Arrastar pra baixo desloca a foto de forma perceptível a partir do centro, não fica preso');
 await page.locator('[data-lounge-bg-adjust]').click();
 assert.equal(await page.locator('#loungeBgAdjust.is-active').count(),0,'Modo de ajuste desativado de novo');

 assert.equal(await page.locator('#loungeBgRemove:not(.hidden)').count(),1,'Botão de remover aparece com a foto aplicada');
 assert.equal(await page.locator('#loungeBgLabel').textContent(),'Trocar foto de fundo');
 await page.locator('#loungeBgRemove').click();
 await page.waitForFunction(()=>document.querySelector('#loungeCanvasHost')?.dataset.backgroundWall==='hidden');
 assert.equal(await page.locator('#loungeBgRemove:not(.hidden)').count(),0,'Remover volta ao estado sem foto (parede escondida, não recriada do zero)');

 // Sair do Módulo Lounge (voltar pro mini-menu pela linha do tempo) desliga a
 // cena Three.js por completo — pedido explícito de não vazar contexto
 // WebGL/memória (mesma disciplina já aplicada ao mini-menu Módulo 3D).
 await page.locator('#catalogTimelinePast [data-timeline-entry]').filter({hasText:/m[óo]dulo 3d/i}).last().click();
 await page.locator('.catalog-modulo3d-menu').waitFor();
 assert.equal(await page.evaluate(()=>document.querySelectorAll('#loungeCanvasHost canvas').length),0,'Canvas do Lounge removido ao sair da tela');

 // Reabrir o Módulo Lounge reconstrói a cena do zero, limpa (mesmo
 // formato/seleção padrão de antes, sem lixo da sessão anterior).
 await page.locator('[data-modulo3d-card="lounge"]').click();
 await page.locator('#catalogLounge:not(.hidden)').waitFor();
 await page.locator('.catalog-lounge-canvas-host canvas').waitFor({timeout:10000});
 assert.equal(await page.locator('.catalog-lounge-format.is-active').count(),1,'Formato padrão selecionado de novo');
 assert.equal(await page.locator('#loungeCanvasHost').getAttribute('data-floor-key'),'neutral','Piso volta pro padrão numa sessão nova (não herda "Madeira" da visita anterior)');
 assert.equal(await page.locator('#loungeCanvasHost').getAttribute('data-background-wall'),'none','Parede de fundo não sobrevive à sessão anterior (cena inteira reconstruída do zero)');
 assert.equal(await page.locator('#loungeBgRemove:not(.hidden)').count(),0,'Sem botão de remover foto numa sessão nova');

 for(const width of [390,768,1024]){
   await page.setViewportSize({width,height:844});await page.waitForTimeout(150);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Módulo Lounge sem overflow horizontal em '+width+'px');
 }
 await page.screenshot({path:path.join(os.tmpdir(),'catalogo-lounge.png')});
 assert.deepEqual(errors,[]);
 await page.close();
}

// ===== Cenário 2: decorador externo — Módulo Lounge alcançável e funcional pelo mesmo caminho =====
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
   if(name==='catalogo_carregar') return {data:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:window.__ITEMS_FIXTURE__}};
   if(name==='catalogo_capas_carregar') return {data:{}};
   if(name==='biblioteca_carregar') return {data:{fotos:[]}};
   return {data:null,error:null};
  },storage:{from(bucket){return{getPublicUrl:(p)=>({data:{publicUrl:'https://fixture/x/'+p}})};}}};
 });
 await page.addInitScript((items)=>{ window.__ITEMS_FIXTURE__=items; }, itemsFixture());
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('.catalog-gateway').waitFor();
 await page.locator('[data-gateway-tile="modulo3d"]').click();
 await page.locator('.catalog-modulo3d-menu').waitFor();
 await page.locator('[data-modulo3d-card="lounge"]').click();
 await page.locator('#catalogLounge:not(.hidden)').waitFor();
 await page.locator('.catalog-lounge-canvas-host canvas').waitFor({timeout:10000});
 assert.equal(await page.locator('[data-lounge-role="sofa"] .catalog-lounge-item-chip.is-active').count(),1,'Decorador também vê a composição padrão montada');
 assert.deepEqual(errors,[]);
 await page.close();
}

console.log('PASS: Módulo Lounge — card "Módulo Lounge" disponível no mini-menu (só "Realidade aumentada" segue "Em breve"), trilha/rótulo de 3 níveis, formato "Lounge compacto" único e ativo por padrão, papéis obrigatórios (sofá/poltrona) com seleção padrão automática e opcionais com "Nenhuma"/aviso quando vazio, trocar item remonta a composição de verdade, controles de câmera REAIS (aproximar/afastar/redefinir mudam a distância da câmera), botão "Renderizar com IA" chama a MESMA função de borda do Estúdio de Ambientes (studio-ai-engine) de verdade e abre o diálogo de resultado com a imagem devolvida, dica de uso esmaece na interação, tela cheia via Fullscreen API de verdade, piso com 5 opções aplicado de verdade no chão da cena, parede de fundo REAL na cena aplicada com a foto (textura de verdade, mesma técnica do Estúdio de Ambientes) e removida/escondida corretamente, foto de fundo ajustável ARRASTANDO (modo dedicado que desliga a órbita da câmera enquanto ativo, arrastar move a foto de verdade, fora do modo o mesmo gesto continua girando a câmera normalmente) com zoom por BOTÃO +/- (nunca pela roda do mouse, funciona dentro ou fora do modo de arrastar), cena Three.js desligada por completo ao sair (sem canvas/contexto WebGL sobrando) e reconstruída limpa ao reabrir (piso volta ao padrão), decorador externo alcança o mesmo módulo funcional, sem overflow em 390/768/1024px');
}catch(error){ console.error(error); process.exitCode=1; }finally{ await browser.close(); server.close(); }})();
