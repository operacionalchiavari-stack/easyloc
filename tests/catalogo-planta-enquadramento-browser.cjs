const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const path=require('node:path');const os=require('node:os');
// Projetos do catálogo (catalogo-projetos.mjs): decorador cria um projeto por evento (noivos, data e local
// obrigatórios), divide em ambientes, adiciona móveis pelo "＋" dos cards, salva renderizações e envia o pedido;
// equipe vê os projetos de todos e acompanha o status. Este teste foca em Plantas legendadas. O "servidor" aqui é
// um mock em memória das RPCs projeto_* (persistido em sessionStorage pra sobreviver a recarregar a página —
// variável de JS não sobrevive a navegação).
const PNG_1X1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const PNG_DATA_URL='data:image/png;base64,'+PNG_1X1.toString('base64');

const { installMock } = require('./mock-projetos.cjs');

// PNG retangular de verdade (não SVG/1x1) — mesma técnica já usada noutros testes de imagem de fundo desta suíte, pra testar
// o ajuste de zoom/posição da planta com uma imagem de proporção BEM diferente da folha (a planta baixa costuma ser
// bem mais larga que alta; a folha A4 retrato padrão é o oposto) — é esse descasamento que expõe se o "cover" tem
// folga de verdade nos dois eixos pra arrastar (MIN_PLANTA_OVERSCAN em catalogo-projetos.mjs).
const zlib=require('node:zlib');
function crc32(buf){
  if(!crc32.table){
    const t=new Uint32Array(256);
    for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[n]=c>>>0; }
    crc32.table=t;
  }
  let crc=0xFFFFFFFF;
  for(let i=0;i<buf.length;i++) crc=crc32.table[(crc^buf[i])&0xFF]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}
function pngChunk(type,data){
  const len=Buffer.alloc(4);len.writeUInt32BE(data.length,0);
  const typeBuf=Buffer.from(type,'ascii');
  const crcBuf=Buffer.alloc(4);crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf,data])),0);
  return Buffer.concat([len,typeBuf,data,crcBuf]);
}
function pngRetangular(width,height,rgb){
  const sig=Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);
  ihdr[8]=8;ihdr[9]=2;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
  const raw=Buffer.alloc((width*3+1)*height);
  for(let y=0;y<height;y++){
    const rowStart=y*(width*3+1);raw[rowStart]=0;
    for(let x=0;x<width;x++){ const px=rowStart+1+x*3; raw[px]=rgb[0];raw[px+1]=rgb[1];raw[px+2]=rgb[2]; }
  }
  return Buffer.concat([sig,pngChunk('IHDR',ihdr),pngChunk('IDAT',zlib.deflateSync(raw)),pngChunk('IEND',Buffer.alloc(0))]);
}
const PNG_PLANTA_LARGA=pngRetangular(1200,400,[230,225,215]); // 3:1 — bem mais larga que alta, o oposto de A4 retrato

(async()=>{
const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const base='http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/';
const browser=await chromium.launch({channel:'msedge',headless:true});
const newPage=async(opts,viewport={width:1500,height:900},seed=null)=>{
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/png',body:PNG_1X1}));
  // O banco de mentira precisa estar semeado ANTES do installMock lê-lo.
  if(seed) await page.addInitScript((db)=>{ if(!sessionStorage.getItem('mockdb')) sessionStorage.setItem('mockdb',JSON.stringify(db)); },seed);
  await page.addInitScript(installMock,opts);
  return {page,errors};
};
const calls=(page,name)=>page.evaluate((n)=>window.mockdb.calls.filter(c=>c.name===n),name);
const modal=(page)=>page.locator('dialog.cpj-modal[open]');
// Pedido do cliente: leitura confortável — nenhum texto visível do módulo abaixo de 12px (mesmo piso de catalogo-fontes-browser.cjs).
const textosPequenos=(page)=>page.evaluate(()=>{const out=[];document.querySelectorAll('#catalogProjetos *, dialog.cpj-modal *, #catalogProjetoDock *').forEach(el=>{const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')return;const r=el.getBoundingClientRect();if(!r.width||!r.height)return;if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))return;const px=parseFloat(cs.fontSize);if(px<12)out.push(el.className+' '+px+'px "'+el.textContent.trim().slice(0,24)+'"');});return out;});

// ===== Cenário 4c: Plantas — folha de impressão (bordas do papel) + ajustar (arrastar/zoom) a planta dentro dela =====
// Pedido explícito do usuário: "eu quero que voce mostre as bordas como se fosse a folha de impressao, pra eu
// saber os espacos que eu posso ocupar com os prints... e eu quero que tenha a opcao de eu aumentar ou diminuir o
// pdf que o decorador enviar dentro desse espaco da folha".
{
 const {page,errors}=await newPage({token:true,numeroPedido:'18'},undefined,{seq:9,calls:[],uploads:[],removed:[],projetos:[
   {id:'p-planta-folha',cliente_id:'client',noivos:'Ana & Bruno',data_evento:'2027-05-10',local_evento:'Sítio Vale Verde',status:'pedido_enviado',compartilhar:false,slug:null,pin:null,pedido_enviado_em:null,atualizado_em:'2026-09-01T10:00:00Z',
    dados:{ambientes:[{id:'amb1',nome:'Lounge 3',itens:[],renders:[],notas:''}],plantas:[]}},
  ]});
 await page.addInitScript(()=>{ window.__printCalls=0; window.print=()=>{ window.__printCalls++; }; });
 await page.goto(base+'catalogo.html');
 await page.locator('.catalog-gateway').waitFor();
 await page.locator('[data-gateway-tile="projetos"]').click();
 await page.locator('.cpj-ped-linha').click();
 await page.locator('.cpj-work').waitFor();
 // Nov/2026: as plantas ficam embaixo da Lista Completa (sem botão/aba "Plantas")
 await page.locator('.cpj-plantas-na-lista .cpj-plantas-grid').waitFor();
 assert.equal(await page.locator('[data-cpj-worktab="plantas"]').count(),0,'sem botão Plantas');
 assert.ok(await page.evaluate(()=>{const l=document.querySelector('.pa-geral');const p=document.querySelector('.cpj-plantas-na-lista');return l&&p&&l.getBoundingClientRect().bottom<=p.getBoundingClientRect().top+1;}),'plantas abaixo da Lista Completa');
 // Planta bem mais larga que alta (3:1) — o OPOSTO do papel padrão (A4 retrato, mais alto que largo) — é esse
 // descasamento que prova de verdade se sobra folga pra arrastar nos dois eixos (ver MIN_PLANTA_OVERSCAN).
 await page.locator('[data-cpj-planta-nova-input]').setInputFiles({name:'planta.png',mimeType:'image/png',buffer:PNG_PLANTA_LARGA});
 await page.locator('[data-cpj-planta-frame]').waitFor();
 await page.waitForFunction(()=>{ const img=document.querySelector('[data-cpj-planta-img]'); return Boolean(img && img.complete && img.naturalWidth>0); });
 // Nov/2026: a planta abre dentro da tela, logo abaixo da Lista Completa (não cobre a tela inteira)
 assert.equal(await page.locator('.cpj-plantas-na-lista .cpj-planta-editor.cpj-planta-inline').count(),1,'editor da planta abaixo da lista');
 assert.equal(await page.locator('.pa-geral').count(),1,'a Lista Completa continua na tela');
 await page.locator('[data-cpj-num-pedido]:not([hidden])').waitFor();assert.equal((await page.locator('[data-cpj-num-pedido]').textContent()).trim(),'18','número do pedido ao lado do Histórico');
 { const [c,l]=await page.evaluate(()=>[document.querySelector('.cpj-work-datas').getBoundingClientRect().left,document.querySelector('.pa-geral').getBoundingClientRect().left]); assert.ok(Math.abs(c-l)<4,'cards alinhados com o início da lista: '+c+' / '+l); }
 assert.deepEqual(await page.locator('.cpj-secao-titulo h2').allTextContents(),['Plantas','Observações','Condições de Pagamento'],'títulos das seções no desenho da Lista Completa');
 await page.locator('[data-cpj-obs="obs_entrega"]').fill('Portaria fecha às 18h');
 await page.locator('[data-cpj-obs="obs_coleta"]').fill('Coletar pela entrada de serviço');
 await page.waitForFunction(()=>window.mockdb.calls.filter(c=>c.name==='projeto_salvar').some(c=>c.params.p_dados?.evento?.obs_entrega==='Portaria fecha às 18h'&&c.params.p_dados?.evento?.obs_coleta==='Coletar pela entrada de serviço'));
 await page.locator('.cpj-pagamento-na-lista input[value="cond-2"]').check();
 await page.waitForFunction(()=>window.mockdb.calls.filter(c=>c.name==='projeto_salvar').some(c=>c.params.p_dados?.pagamento?.id==='cond-2'));
 { const [pl,pg]=await page.evaluate(()=>[document.querySelector('.cpj-plantas-na-lista').getBoundingClientRect().bottom,document.querySelector('.cpj-pagamento-na-lista').getBoundingClientRect().top]); assert.ok(pg>=pl-1,'pagamento abaixo das plantas'); }
 assert.deepEqual(await page.locator('.cpj-work-head .cpj-wd-tit').evaluateAll(es=>es.map(e=>e.firstChild.textContent.trim())),['Local','Evento','Entrega','Coleta'],'dados do evento na tela');
 assert.equal(await page.locator('.cpj-wd-ate').isVisible(),false,'Até só em vários dias');
 await page.locator('[data-cpj-wd-modo="varios"]').click();
 assert.equal(await page.locator('.cpj-wd-ate').isVisible(),true,'Vários dias mostra o Até');
 await page.locator('[data-cpj-wd-modo="um"]').click();
 { const ev=await page.locator('[data-cpj-wd-form] input[name="data"]').inputValue();
   const antes=new Date(ev+'T12:00:00');antes.setDate(antes.getDate()-1);const ent=antes.toISOString().slice(0,10);
   await page.locator('[data-cpj-wd-form] input[name="ev_data_entrega"]').fill(ent);await page.locator('[data-cpj-wd-form] input[name="ev_data_entrega"]').dispatchEvent('change');
   await page.locator('[data-cpj-wd-form] input[name="ev_hora_entrega"]').fill('09:30');await page.locator('[data-cpj-wd-form] input[name="ev_hora_entrega"]').dispatchEvent('change');
   await page.waitForFunction((e)=>window.mockdb.calls.filter(c=>c.name==='projeto_salvar').some(c=>c.params.p_dados?.evento?.data_entrega===e&&c.params.p_dados?.evento?.hora_entrega==='09:30'),ent);
   const depois=new Date(ev+'T12:00:00');depois.setDate(depois.getDate()+3);
   await page.locator('[data-cpj-wd-form] input[name="ev_data_entrega"]').fill(depois.toISOString().slice(0,10));await page.locator('[data-cpj-wd-form] input[name="ev_data_entrega"]').dispatchEvent('change');
   assert.equal(await page.locator('[data-cpj-wd-form] input[name="ev_data_entrega"]').inputValue(),ent,'entrega depois do evento é recusada e volta'); }
 assert.equal(await page.locator('[data-cpj="editar-info"]').count(),0,'sem o botão Editar (janela)');
 assert.equal(await page.locator('.cpj-work-nome input[name="ev_tipo"]').count(),1,'tipo do evento na linha do nome');
 await page.locator('.cpj-work-nome input[name="noivos"]').fill('Carla & Dani');await page.locator('.cpj-work-nome input[name="noivos"]').dispatchEvent('change');
 assert.equal(await page.locator('.cpj-wd-evento').count(),0,'card Evento (tipo/noivos) saiu');
 await page.waitForFunction(()=>window.mockdb.calls.filter(c=>c.name==='projeto_salvar').some(c=>c.params.p_noivos==='Carla & Dani'));
 // Local só do Cadastro de Locais (igual ao pedido)
 await page.locator('[data-cpj-wd-form] input[name="local"]').fill('vale');
 await page.locator('.cpj-wd-sugestoes li[data-i]').first().waitFor();
 await page.locator('.cpj-wd-sugestoes li[data-i]').first().dispatchEvent('mousedown');
 await page.waitForFunction(()=>window.mockdb.calls.filter(c=>c.name==='projeto_salvar').some(c=>c.params.p_local_evento==='Vale dos Desejos'&&c.params.p_dados?.evento?.local_id==='loc-1'));
 assert.match(await page.locator('.cpj-wd-endereco').textContent(),/Estrada do Passatempo/,'endereço do cadastro aparece no card');
 assert.deepEqual(await page.locator('.cpj-wd-local-tags span').allTextContents(),['Necessita Baldeação','Caminhão para em frente'],'observações do local em pílulas');
 assert.match(await page.locator('.cpj-wd-local-meta').textContent(),/Hotel · 33,7 km do galpão/);
 await page.setViewportSize({width:1900,height:900});await page.waitForTimeout(300);{const w=await page.locator('.cpj-wd-card').evaluateAll(es=>es.map(e=>Math.round(e.getBoundingClientRect().width)));assert.ok(Math.abs(w[1]-w[3])<3&&Math.abs(w[1]-w[2])<3&&w[0]>w[1],'larguras: '+w);}await page.setViewportSize({width:1366,height:768});
 await page.locator('[data-cpj-wd-form] input[name="local"]').fill('Lugar inventado');await page.locator('[data-cpj-wd-form] input[name="local"]').blur();await page.waitForTimeout(400);
 assert.equal(await page.locator('[data-cpj-wd-form] input[name="local"]').inputValue(),'Vale dos Desejos','texto que não é do cadastro não fica');
 assert.ok(await page.locator('.pa-geral').evaluate(e=>{const c=getComputedStyle(e);return e.scrollHeight<=e.clientHeight+1&&!['auto','scroll'].includes(c.overflowY)&&!['auto','scroll'].includes(c.overflowX);}),'a lista não tem barra de rolagem própria');
 assert.ok(await page.evaluate(()=>document.querySelector('.pa-geral').getBoundingClientRect().bottom<=document.querySelector('.cpj-planta-editor').getBoundingClientRect().top),'a planta começa depois do fim da lista');
 await page.locator('.cpj-planta-editor').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));


 const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const geometry=()=>page.evaluate(()=>{
  const p=document.querySelector('[data-cpj-planta-pagina]').getBoundingClientRect();
  const f=document.querySelector('[data-cpj-planta-frame]');
  const v=document.querySelector('[data-cpj-planta-viewport]').getBoundingClientRect();
  const s=document.querySelector('[data-cpj-planta-stage]').getBoundingClientRect();
  return {paper:p.toJSON(),viewport:v.toJSON(),stage:s.toJSON(),width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,scale:Number(f.dataset.escalaVisual),logicalWidth:f.offsetWidth};
 });
 const assertFits=async()=>{
  const g=await geometry();
  // Nov/2026: o editor fica dentro da página (rola com ela), então só confere a folha dentro da área da planta e na largura da tela
  assert.ok(g.paper.left>=0 && g.paper.right<=g.width+1,JSON.stringify(g));
  assert.ok(g.paper.left>=g.viewport.left && g.paper.right<=g.viewport.right+1 && g.paper.top>=g.viewport.top && g.paper.bottom<=g.viewport.bottom+1,'Entire sheet inside workspace');

  assert.ok(g.scroll<=g.width,'No horizontal page overflow '+g.width+' '+g.scroll);
  assert.ok(Math.abs(g.stage.x+g.stage.width/2-g.paper.x-g.paper.width/2)<1);
  assert.ok(Math.abs(g.stage.y+g.stage.height/2-g.paper.y-g.paper.height/2)<1);
 };
 assert.equal(await page.locator('[data-cpj-planta-papel]').inputValue(),'a4-paisagem');
 assert.equal(await page.locator('[data-cpj-planta-zoom]').textContent(),'100%');
 const imageWidth=()=>page.locator('[data-cpj-planta-img]').evaluate(el=>parseFloat(el.style.width));
 const initialImage=await imageWidth();
 await page.waitForTimeout(400);
 const initialArea=await page.locator('[data-cpj-planta-stage]').boundingBox();
 await page.locator('[data-cpj="planta-zoom-mais"]').click();
 assert.ok(Math.abs(await imageWidth()/initialImage-1.01)<.001,'Image zoom increases independently');
 assert.deepEqual(await page.locator('[data-cpj-planta-stage]').boundingBox(),initialArea,'Image zoom preserves crop area');
 assert.equal(await page.locator('[data-cpj-planta-zoom]').textContent(),'101%');
 await page.locator('[data-cpj="planta-zoom-menos"]').click();
 assert.ok(Math.abs(await imageWidth()-initialImage)<.01);
 await page.locator('[data-cpj="planta-zoom-menos"]').click();
 assert.ok(Math.abs(await imageWidth()/initialImage-.99)<.001,'Zoom goes below 100%');
 assert.deepEqual(await page.locator('[data-cpj-planta-stage]').boundingBox(),initialArea,'Reducing image preserves crop area');
 for(let i=0;i<90;i++) await page.locator('[data-cpj="planta-zoom-menos"]').click();
 assert.equal(await page.locator('[data-cpj-planta-zoom]').textContent(),'10%');
 assert.ok(Math.abs(await imageWidth()/initialImage-.1)<.001,'Image can shrink to 10%');
 for(let i=0;i<75;i++) await page.locator('[data-cpj="planta-zoom-mais"]').click();
 await page.waitForFunction(()=>window.mockdb.projetos[0]?.dados.plantas[0]?.ajuste.zoom===.85);
 for(const viewport of [{width:1905,height:893},{width:1366,height:768},{width:1024,height:600},{width:390,height:844},{width:390,height:600},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  for(const paper of ['a4-retrato','a4-paisagem','a3-retrato','carta-paisagem']){
   await page.locator('[data-cpj-planta-papel]').selectOption(paper);await settle();
   await assertFits();
  }
 }
 await page.setViewportSize({width:1366,height:768});
 await page.locator('[data-cpj-planta-papel]').selectOption('a4-paisagem');await settle();
 for(let i=0;i<10;i++){await page.locator('[data-cpj="planta-tamanho-mais"]').click();await settle();await assertFits();}
 for(let i=0;i<12;i++){await page.locator('[data-cpj="planta-tamanho-menos"]').click();await settle();await assertFits();}
 await page.locator('.cpj-planta-editor').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));await settle();
 const stage=await page.locator('[data-cpj-planta-stage]').boundingBox();
 await page.mouse.click(stage.x+stage.width*.4,stage.y+stage.height*.4);
 await modal(page).locator('.cpj-planta-amb-card').click();await settle();
 const label=page.locator('.cpj-planta-label');
 assert.deepEqual(await page.locator('.cpj-planta-letra').allTextContents(),['A','A']);
 const arrowBefore=await page.locator('.cpj-planta-seta').getAttribute('d');
 const lineStyle=await page.locator('.cpj-planta-lines line').evaluate(el=>({stroke:getComputedStyle(el).stroke,dash:getComputedStyle(el).strokeDasharray,width:getComputedStyle(el).strokeWidth}));
 assert.deepEqual(lineStyle,{stroke:'rgb(0, 0, 0)',dash:'none',width:'1px'});
 await label.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await settle();
 const before=await label.boundingBox();
 await page.mouse.move(before.x+before.width/2,before.y+before.height/2);await page.mouse.down();
 await page.mouse.move(before.x+before.width/2+35,before.y+before.height/2+25,{steps:6});await page.mouse.up();await settle();
 const after=await label.boundingBox();
 assert.notEqual(await page.locator('.cpj-planta-seta').getAttribute('d'),arrowBefore,'Arrow follows dragged composition');
 assert.ok(Math.abs(after.x-before.x-35)<2 && Math.abs(after.y-before.y-25)<2,'Drag follows screen pointer at reduced scale');
 await assertFits();
 const secondStage=await page.locator('[data-cpj-planta-stage]').boundingBox();
 await page.mouse.click(secondStage.x+secondStage.width*.7,secondStage.y+secondStage.height*.7);
 await modal(page).locator('.cpj-planta-amb-card').click();await settle();
 assert.deepEqual((await page.locator('.cpj-planta-letra').allTextContents()).sort(),['A','A','B','B']);
 const larguras=()=>page.locator('.cpj-planta-label').evaluateAll(els=>els.map(el=>parseFloat(el.style.width)));
 const antesIndividual=await larguras();
 await page.locator('[data-cpj="planta-foto-mais"]').first().click();await settle();
 const depoisIndividual=await larguras();
 assert.ok(depoisIndividual[0]>antesIndividual[0]);assert.equal(depoisIndividual[1],antesIndividual[1]);
 await page.locator('[data-cpj="planta-prints-mais"]').click();await settle();
 const depoisGlobal=await larguras();assert.ok(depoisGlobal.every((w,i)=>w>depoisIndividual[i]));

 const measure=()=>page.evaluate(()=>{
  const root=document.getElementById('cpjPlantaImpressao');
  const p=(root||document.querySelector('[data-cpj-planta-pagina]')).getBoundingClientRect();
  return [...(root||document.querySelector('[data-cpj-planta-frame]')).querySelectorAll('.cpj-planta-stage,.cpj-planta-label,.cpj-planta-img')].map(e=>{const r=e.getBoundingClientRect();return [(r.x-p.x)/p.width,(r.y-p.y)/p.height,r.width/p.width,r.height/p.height];});
 });
 const screen=await measure();
 const lado=await page.evaluate(()=>{const t=document.querySelector('.cpj-planta-toolbar').getBoundingClientRect(),v=document.querySelector('[data-cpj-planta-viewport]').getBoundingClientRect();return {t,v,w:innerWidth,botoes:document.querySelectorAll('.cpj-planta-toolbar button').length};});
 assert.ok(lado.t.right<=lado.v.left+1,'Controles numa coluna à esquerda da planta');
 assert.ok(lado.v.width>lado.w*0.7,'Planta ocupa a maior parte da largura');
 assert.ok(lado.t.height>=lado.v.height-4,'Coluna dos controles tem a altura da planta');
 assert.equal(await page.locator('.cpj-planta-editor [data-cpj="apresentacao"]').count(),0,'Sem o botão de apresentação no editor');
 for(const mode of ['letras','setas','ambos']){
  await page.locator('[data-cpj-planta-marcacao]').selectOption(mode);await settle();
  const checkMode=async(root)=>{
   assert.equal(await page.locator(root+' .cpj-planta-lines line').first().evaluate(el=>getComputedStyle(el).display==='none'),mode==='letras');
   assert.equal(await page.locator(root+' .cpj-planta-seta').first().evaluate(el=>getComputedStyle(el).display==='none'),mode==='letras');
   assert.equal(await page.locator(root+' .cpj-planta-letra').first().evaluate(el=>getComputedStyle(el).display==='none'),mode==='setas');
  };
  await checkMode('[data-cpj-planta-frame]');
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));await page.emulateMedia({media:'print'});
  await checkMode('#cpjPlantaImpressao');
  await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));await page.emulateMedia({media:'screen'});await settle();
 }
 const beforeWheel=await geometry();
 await page.mouse.wheel(0,1000);await settle();
 // Nov/2026: o editor fica dentro da página — rolar move a página inteira, a folha continua do mesmo tamanho
 { const g2=await geometry(); assert.ok(Math.abs(g2.paper.width-beforeWheel.paper.width)<1&&Math.abs(g2.paper.height-beforeWheel.paper.height)<1,'Scrolling does not cut the sheet'); }
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-folha-inteira.png'),fullPage:false});
 await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));await page.emulateMedia({media:'print'});
 assert.deepEqual((await page.locator('#cpjPlantaImpressao .cpj-planta-letra').allTextContents()).sort(),['A','A','B','B']);
 assert.equal(await page.locator('#cpjPlantaImpressao .cpj-planta-seta').count(),2);
 const print=await measure();screen.forEach((box,i)=>box.forEach((n,k)=>assert.ok(Math.abs(n-print[i][k])<.002,'Print geometry')));
 const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true});
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const doc=await getDocument({data:new Uint8Array(pdf)}).promise;assert.equal(doc.numPages,1);await doc.destroy();
 await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));await page.emulateMedia({media:'screen'});await settle();await assertFits();
 await page.locator('[data-cpj-planta-marcacao]').selectOption('letras');
 await page.waitForFunction(()=>window.mockdb.projetos[0]?.dados.plantas[0]?.marcacao==='letras');
 // Nov/2026: a planta fica sempre aberta embaixo da lista — sem "Fechar planta"; recarregar o projeto abre de novo
 assert.equal(await page.locator('[data-cpj="plantas-voltar"]').isVisible(),false,'sem Fechar planta');
 assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).overflow),'hidden','a página rola normalmente');
 assert.equal(await page.locator('.cpj-plantas-aba.is-ativa').count(),1,'aba da planta aberta');
 assert.equal(await page.locator('.cpj-planta-icones').isVisible(),false,'sem a linha de ícones');
 assert.equal(await page.locator('.cpj-plantas-abas [data-cpj="planta-excluir"]').isVisible(),true,'lixeira na linha das abas');
 await page.locator('[data-cpj="planta-abrir"]').click();await settle();
 assert.equal(await page.locator('[data-cpj-planta-marcacao]').inputValue(),'letras','Reopening preserves annotation mode');
 assert.equal(await page.locator('[data-cpj-planta-zoom]').textContent(),'85%','Reopening preserves zoom below 100%');
 assert.deepEqual(errors,[]);await page.close();
}
await browser.close();server.close();console.log('catalogo-planta-enquadramento-browser: ok');
})().catch(e=>{console.error(e);process.exit(1);});
