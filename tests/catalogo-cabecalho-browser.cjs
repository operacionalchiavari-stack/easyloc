// Cabeçalho do catálogo depois de dois pedidos do usuário, olhando a tela de um item:
//   "Catálogo / Bares / Bar Bistrol G — apague isso que fica por baixo da logo"  (a trilha some)
//   "e aumente a logo um pouco pro limite da altura do menu"                      (logo maior)
// A logo real da Chiavari é um PNG QUADRADO com margem transparente (a arte ocupa ~26% da altura do
// arquivo), por isso o fixture aqui reproduz essa proporção: 627×627 com um retângulo magenta opaco
// onde fica a arte. A altura/posição da arte é medida em PIXELS do que o navegador de fato desenha
// (screenshot do cabeçalho → bounding box do magenta), não deduzida do CSS.
const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const zlib=require('node:zlib');

function crc32(buf){
  if(!crc32.table){const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}crc32.table=t;}
  let crc=0xFFFFFFFF;for(let i=0;i<buf.length;i++)crc=crc32.table[(crc^buf[i])&0xFF]^(crc>>>8);return (crc^0xFFFFFFFF)>>>0;
}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length,0);const t=Buffer.from(type,'ascii');const c=Buffer.alloc(4);c.writeUInt32BE(crc32(Buffer.concat([t,data])),0);return Buffer.concat([len,t,data,c]);}
function logoPng(size,art){ // RGBA, transparente, com um retângulo magenta opaco em `art`
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  const raw=Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++){const row=y*(size*4+1);raw[row]=0;
    for(let x=0;x<size;x++){if(x>=art.x0&&x<=art.x1&&y>=art.y0&&y<=art.y1){const p=row+1+x*4;raw[p]=255;raw[p+1]=0;raw[p+2]=255;raw[p+3]=255;}}}
  return Buffer.concat([Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
// Mesmas proporções da logo real (1254×1254, arte x 39–1198, y 448–777), na metade da resolução.
const LOGO=logoPng(627,{x0:20,x1:599,y0:224,y1:389});
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c9b79c"/></svg>');
const ST='https://fixture/storage/v1/object/public/itens/';

(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
const decoder=await browser.newPage();await decoder.setContent('<canvas id=c></canvas>');
// bounding box (em px do screenshot) dos pixels magenta
const magentaBox=(buf)=>decoder.evaluate(async b64=>{const im=new Image();im.src='data:image/png;base64,'+b64;await im.decode();const c=document.getElementById('c');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);const a=x.getImageData(0,0,c.width,c.height).data;let l=1e9,t=1e9,r=-1,bt=-1;for(let y=0;y<c.height;y++)for(let xx=0;xx<c.width;xx++){const p=(y*c.width+xx)*4;if(a[p]>200&&a[p+1]<80&&a[p+2]>200){if(xx<l)l=xx;if(xx>r)r=xx;if(y<t)t=y;if(y>bt)bt=y;}}return r<0?null:{l,t,r,b:bt};},buf.toString('base64'));

async function abrir(vw,vh=800){
  const page=await browser.newPage({viewport:{width:vw,height:vh}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page._errors=errors;
  await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
  await page.route('https://fixture/logo.png',r=>r.fulfill({contentType:'image/png',body:LOGO}));
  await page.addInitScript(({ST})=>{
    sessionStorage.setItem('catalogo_token','test');
    window.supabaseClient={rpc:async n=>{
      if(n==='catalogo_validar_sessao')return {data:{valido:true,empresa_id:'company',cliente_id:'client'}};
      if(n==='catalogo_carregar')return {data:{empresa:{nome:'Chiavari',logo_url:'https://fixture/logo.png'},decorador:{nome:'Kelly'},itens:[
        {id:'1',tipo:'Item',produto:'Bistrol G',produto_base:'Bar',categoria:'Bares',material:'Madeira',cor:'Natural',referencia:'BAR001',largura:3.8,altura:1.1,profundidade:.55,foto_url:ST+'a.png',itens_fotos:[{slot:'galeria_01',tipo:'galeria',titulo:'Galeria 01',url:ST+'g.png',path:'x',ordem:1,cliente_id:null}],itens_modelos_3d:[]},
        {id:'2',tipo:'Item',produto:'Bistrol P',produto_base:'Bar',categoria:'Bares',material:'Madeira',cor:'Natural',referencia:'BAR002',largura:2,altura:1.1,profundidade:.5,foto_url:ST+'b.png',itens_fotos:[],itens_modelos_3d:[]},
      ]}};
      if(n==='catalogo_capas_carregar')return {data:{portal:'https://fixture/capa.png'}};
      if(n==='biblioteca_carregar')return {data:{fotos:[]}};
      return {data:null};
    },from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{nome:'Chiavari',logo_url:'https://fixture/logo.png'},error:null})};},functions:{invoke:async()=>({data:null,error:null})}};
  },{ST});
  await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
  await page.locator('.catalog-gateway').waitFor();
  return page;
}
const semTrilha=async(page,onde)=>{
  assert.equal(await page.locator('#catalogBreadcrumb,.catalog-breadcrumb,[data-breadcrumb]').count(),0,`${onde}: a trilha "Catálogo / Categoria / Item" foi apagada`);
};

// ===== 1. A trilha não existe em NENHUMA tela, e a linha do tempo do cabeçalho continua funcionando =====
{
  const page=await abrir(1440,900);
  await semTrilha(page,'Portal');
  await page.locator('[data-gateway-tile="catalogo"]').click();await page.locator('#catalogGrid .catalog-home-grid').waitFor();
  await semTrilha(page,'Categorias');
  await page.locator('[data-home-category="bares"]').click();await page.locator('[data-grid-item]').first().waitFor();
  await semTrilha(page,'Categoria em grade');
  await page.locator('[data-grid-item]').first().click();await page.locator('#produto-1').waitFor();await page.waitForTimeout(700);
  await semTrilha(page,'Item imersivo');
  // O que ficava por baixo da logo era uma faixa de ~30px flutuando sobre o conteúdo: sem ela, o
  // topo da tela do item volta a ser só o cabeçalho — a foto ambientada encosta nele e o título não fica coberto.
  const header=await page.locator('.catalog-header').boundingBox();
  const evento=await page.locator('#produto-1 .product-event-panel').boundingBox();
  assert.ok(Math.abs(evento.y-(header.y+header.height))<2,'Foto ambientada encosta exatamente no fim do cabeçalho');
  // A linha do tempo (que já mostrava o caminho percorrido) continua no cabeçalho: Home › Categorias › Bares.
  const caminho=(await page.locator('#catalogTimelinePast').innerText()).replace(/\s+/g,' ').toUpperCase();
  assert.ok(caminho.includes('HOME')&&caminho.includes('CATEGORIAS'),`o caminho percorrido segue na linha do tempo do cabeçalho ("${caminho}")`);
  assert.equal((await page.locator('#catalogPageLabel').textContent()).trim(),'Bares');
  // Clicar numa entrada da linha do tempo volta de verdade (era o que a trilha também fazia).
  await page.locator('#catalogTimelinePast [data-timeline-entry]').filter({hasText:/categorias/i}).last().click();
  await page.locator('#catalogGrid .catalog-home-grid').waitFor();
  await page.locator('.catalog-brand').click();
  await page.locator('[data-gateway-tile="biblioteca"]').click();await page.locator('#catalogBiblioteca:not(.hidden)').waitFor();
  await semTrilha(page,'Biblioteca');
  await page.locator('.catalog-brand').click();
  await page.locator('[data-gateway-tile="modulo3d"]').click();await page.locator('#catalogStudio:not(.hidden)').waitFor();
  await semTrilha(page,'3D Livre');
  // Sem a trilha por cima, a barra de ferramentas do estúdio deixa de ficar cortada na metade.
  const barra=await page.locator('.studio-toolbar').boundingBox();
  const cabecalho=await page.locator('.catalog-header').boundingBox();
  assert.ok(barra.y>=cabecalho.y+cabecalho.height-1&&await page.evaluate(()=>{const b=document.querySelector('.studio-toolbar').getBoundingClientRect();const el=document.elementFromPoint(b.left+40,b.top+8);return !!el&&document.querySelector('.studio-toolbar').contains(el);}),'3D Livre: nada mais cobre o topo da barra de ferramentas do estúdio');
  assert.deepEqual(page._errors,[],'nenhum erro de página');
  await page.close();
}

// ===== 2. Logo maior, dentro da altura do menu, sem cortar e sem invadir a linha do tempo =====
const casos=[
  // largura, altura mínima da arte, folga mínima em cima/embaixo, o que precisa ficar livre à direita da arte
  {vw:1920,minH:62,gap:2},
  {vw:1600,minH:62,gap:2},
  {vw:1440,minH:50,gap:5},
  {vw:1280,minH:50,gap:5},
  {vw:1100,minH:44,gap:8},
];
for(const c of casos){
  const page=await abrir(c.vw);
  await page.locator('#catalogBrandLogo:not(.hidden)').waitFor();
  await page.waitForFunction(()=>document.getElementById('catalogBrandLogo').complete&&document.getElementById('catalogBrandLogo').naturalWidth>0);
  await page.mouse.move(5,400);await page.waitForTimeout(300);
  const hdr=await page.locator('.catalog-header').boundingBox();
  const shot=await page.screenshot({clip:{x:0,y:0,width:c.vw,height:Math.round(hdr.height)}});
  const art=await magentaBox(shot);
  assert.ok(art,`${c.vw}px: a arte da logo aparece no cabeçalho`);
  const altura=art.b-art.t+1;
  assert.ok(altura>=c.minH,`${c.vw}px: logo ao menos ${c.minH}px de altura (era ~46px) — achou ${altura}px`);
  assert.ok(art.t>=c.gap&&hdr.height-1-art.b>=c.gap,`${c.vw}px: a arte cabe na altura do menu (${hdr.height}px) com folga de ${c.gap}px em cima e embaixo — topo ${art.t}, base ${Math.round(hdr.height-1-art.b)}`);
  assert.ok(Math.abs(art.t-(hdr.height-1-art.b))<=2,`${c.vw}px: arte centralizada na vertical (topo ${art.t}px, base ${Math.round(hdr.height-1-art.b)}px)`);
  // Não pode estar cortada pela caixa da marca (overflow:hidden) nem encostar na linha do tempo.
  const marca=await page.locator('.catalog-brand').boundingBox();
  assert.ok(art.r<marca.x+marca.width-2,`${c.vw}px: a arte não é cortada pela caixa da marca (arte termina em ${art.r}px, caixa em ${Math.round(marca.x+marca.width)}px)`);
  const nav=await page.locator('.catalog-navigation').boundingBox();
  assert.ok(art.r<=nav.x,`${c.vw}px: a arte (termina em ${art.r}px) não invade a linha do tempo (começa em ${Math.round(nav.x)}px)`);
  assert.equal(Math.round(hdr.height),76,`${c.vw}px: o cabeçalho continua com altura FIXA de 76px`);
  await page.close();
}
// Celular: não cresceu (a coluna é estreita) e continua inteira dentro do cabeçalho de 72px.
{
  const page=await abrir(390,800);
  await page.locator('#catalogBrandLogo:not(.hidden)').waitFor();
  await page.waitForFunction(()=>document.getElementById('catalogBrandLogo').complete&&document.getElementById('catalogBrandLogo').naturalWidth>0);
  await page.waitForTimeout(300);
  const hdr=await page.locator('.catalog-header').boundingBox();
  const art=await magentaBox(await page.screenshot({clip:{x:0,y:0,width:390,height:Math.round(hdr.height)}}));
  assert.ok(art&&art.t>=0&&art.b<=hdr.height-1,'celular: arte inteira dentro do cabeçalho');
  assert.equal(Math.round(hdr.height),72,'celular: cabeçalho de 72px');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'celular: sem rolagem horizontal');
  await page.close();
}
await browser.close();server.close();
console.log('PASS: cabeçalho — a trilha "Catálogo / Categoria / Item" não existe mais em nenhuma tela (Portal, Categorias, grade, item, Biblioteca, Módulo 3D, 3D Livre), a foto ambientada encosta no cabeçalho, o topo do 3D Livre não fica mais coberto e o caminho continua na linha do tempo; a logo ficou maior (arte com ~66px no desktop largo, ~54px até 1450px), centralizada, inteira dentro dos 76px do menu, sem invadir a linha do tempo; celular intacto');
})().catch(e=>{console.error(e);process.exit(1);});
