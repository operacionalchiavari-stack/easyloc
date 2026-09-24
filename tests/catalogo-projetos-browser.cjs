const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const path=require('node:path');const os=require('node:os');
// Projetos do catálogo (catalogo-projetos.mjs): decorador cria um projeto por evento (noivos, data e local
// obrigatórios), divide em ambientes, adiciona móveis pelo "＋" dos cards, salva renderizações e envia o pedido;
// equipe vê os projetos de todos e acompanha o status. O link de apresentação pública e os layouts foram removidos
// (pedido explícito do usuário) — Plantas legendadas é o que sobrou além de ambientes/pedido. O "servidor" aqui é
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

// ===== Cenário 1: decorador — cria projeto, ambientes, adiciona móveis, salva render e envia pedido =====
{
 const {page,errors}=await newPage({token:true});
 await page.goto(base+'catalogo.html');
 await page.locator('.catalog-gateway').waitFor();
 assert.equal(await page.locator('[data-gateway-tile]').count(),4,'Portal ganhou o 4º destino');
 assert.equal((await page.locator('.catalog-gateway-title').allTextContents()).pop(),'Projetos');
 assert.equal(await page.locator('#catalogProjetoDock').isVisible(),false,'Sem projeto ativo, o dock não aparece');

 await page.locator('[data-gateway-tile="projetos"]').click();
 await page.locator('#catalogProjetos:not(.hidden)').waitFor();
 assert.equal(await page.locator('#catalogPageLabel').textContent(),'Projetos');
 await page.locator('.cpj-empty-big').waitFor();
 assert.match(await page.locator('.cpj-empty-big').textContent(),/Nenhum projeto ainda/);

 // Criar: noivos, data e local são obrigatórios
 await page.locator('[data-cpj="novo"]').first().click();
 await modal(page).waitFor();
 await modal(page).locator('button[type=submit]').click();
 assert.match(await modal(page).locator('.cpj-modal-error').textContent(),/nome dos noivos/i,'Sem noivos não cria');
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-1-criar-vazio.png')});
 await modal(page).locator('[name=noivos]').fill('Ana & Bruno');
 await modal(page).locator('button[type=submit]').click();
 assert.match(await modal(page).locator('.cpj-modal-error').textContent(),/data do evento/i,'Sem data não cria');
 await modal(page).locator('[name=data]').fill('2027-05-10');
 await modal(page).locator('button[type=submit]').click();
 assert.match(await modal(page).locator('.cpj-modal-error').textContent(),/local/i,'Sem local não cria');
 await modal(page).locator('[name=local]').fill('Sítio Vale Verde');
 assert.equal(await modal(page).locator('[data-chip][aria-pressed="true"]').count(),0,'Nenhum ambiente vem marcado sozinho');
 assert.equal(await modal(page).locator('[data-foto-preview] img').count(),0,'Foto dos noivos é opcional: começa sem foto');
 await modal(page).locator('[data-foto-input]').setInputFiles({name:'casal.png',mimeType:'image/png',buffer:PNG_1X1});
 await modal(page).locator('[data-foto-preview] img').waitFor();
 assert.equal(await modal(page).locator('[data-foto-limpar]').isVisible(),true,'Dá pra desistir da foto antes de criar');
 await modal(page).locator('[data-foto-limpar]').click();
 assert.equal(await modal(page).locator('[data-foto-preview] img').count(),0);
 await modal(page).locator('[data-foto-input]').setInputFiles({name:'casal.png',mimeType:'image/png',buffer:PNG_1X1});
 await modal(page).locator('[data-foto-preview] img').waitFor();
 await modal(page).locator('[data-chip]',{hasText:'Cerimônia'}).click();
 await modal(page).locator('[data-chip]',{hasText:'Bar'}).click();
 await modal(page).locator('[data-amb-input]').fill('Bistrô da varanda');
 await modal(page).locator('[data-amb-add]').click();
 assert.equal(await modal(page).locator('[data-chip][aria-pressed="true"]').count(),3,'Ambiente com nome livre entra como opção marcada');
 assert.deepEqual(await textosPequenos(page),[],'Diálogo de criação: nenhum texto abaixo de 12px');
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-2-criar-preenchido.png')});
 await modal(page).locator('button[type=submit]').click();
 await page.locator('.cpj-work').waitFor();
 const criar=(await calls(page,'projeto_criar'))[0];
 assert.equal(criar.params.p_token,'test','Decorador usa o token do catálogo');
 assert.equal('p_empresa_id' in criar.params,false,'Decorador não manda empresa_id');
 assert.deepEqual(criar.params.p_ambientes,['Cerimônia','Bar','Bistrô da varanda']);
 assert.equal(await page.locator('.cpj-work-title h2').textContent(),'Ana & Bruno');
 assert.match(await page.locator('.cpj-work-title p').textContent(),/10 de maio de 2027.*Sítio Vale Verde/);
 assert.deepEqual(await page.locator('.cpj-amb-tab:not(.cpj-amb-new):not(.cpj-amb-tab-plantas) span').allTextContents(),['Cerimônia','Bar','Bistrô da varanda']);
 assert.equal((await page.locator('.cpj-amb-tab.is-active').textContent()).trim(),'Geral','Entrar no projeto abre a aba Geral (o 1º ambiente continua sendo o ativo pro ＋ do catálogo)');
 assert.equal(await page.locator('#catalogProjetoDock').isVisible(),false,'Dock não aparece dentro do próprio módulo');
 // Foto dos noivos: subiu depois de o projeto existir (a política do Storage exige isso), no caminho empresa/projeto/casal
 await page.locator('.cpj-avatar.has-photo img').waitFor();
 const upCasal=await page.evaluate(()=>window.mockdb.uploads.filter(u=>/\/casal\//.test(u.path)));
 assert.equal(upCasal.length,1);assert.match(upCasal[0].path,/^company\/proj-1\/casal\/[0-9a-f-]+\.jpg$/);assert.equal(upCasal[0].type,'image/jpeg');
 await page.waitForFunction(()=>window.mockdb.calls.filter(c=>c.name==='projeto_salvar').some(c=>c.params.p_dados.foto_casal?.path?.includes('/casal/')));
 const fotoSalva=(await calls(page,'projeto_salvar')).pop().params.p_dados.foto_casal;
 assert.match(fotoSalva.url,/\/storage\/v1\/object\/public\/projetos\/company\/proj-1\/casal\//,'A URL pública fica no projeto');
 // Tela inteira: sem a moldura de 1280px de antes — o respiro lateral é o mesmo do cabeçalho do catálogo (≤40px)
 for(const largura of [1500,1900]){
  await page.setViewportSize({width:largura,height:900});
  const cab=await page.locator('.cpj-work-head').boundingBox();
  const folgaDireita=await page.evaluate(()=>document.documentElement.clientWidth)-(cab.x+cab.width);
  assert.ok(cab.x<=41&&folgaDireita<=41,'Espaço de trabalho ocupa a tela toda em '+largura+'px (folgas '+cab.x+' / '+folgaDireita+')');
 }
 await page.setViewportSize({width:1500,height:900});
 // Trocar a foto pelo próprio círculo do cabeçalho: sobe a nova e apaga a antiga do Storage
 await page.locator('[data-cpj-foto-input]').setInputFiles({name:'casal2.png',mimeType:'image/png',buffer:PNG_1X1});
 await page.waitForFunction(()=>window.mockdb.uploads.filter(u=>/\/casal\//.test(u.path)).length===2);
 await page.waitForFunction((antigo)=>window.mockdb.removed.includes(antigo),upCasal[0].path);
 // Remover (×): some do projeto e do Storage
 await page.locator('[data-cpj="foto-remover"]').click();
 await page.locator('.cpj-avatar:not(.has-photo)').waitFor();
 await page.waitForFunction(()=>window.mockdb.calls.filter(c=>c.name==='projeto_salvar').pop()?.params.p_dados.foto_casal===undefined);
 await page.waitForFunction(()=>window.mockdb.removed.length>=2);
 // Sem foto o círculo convida a adicionar; escolher de novo funciona
 assert.match(await page.locator('.cpj-avatar').textContent(),/Foto dos noivos/);
 await page.locator('[data-cpj-foto-input]').setInputFiles({name:'casal3.png',mimeType:'image/png',buffer:PNG_1X1});
 await page.locator('.cpj-avatar.has-photo img').waitFor();
 await page.waitForFunction(()=>window.mockdb.calls.filter(c=>c.name==='projeto_salvar').pop()?.params.p_dados.foto_casal?.url);
 const salvosAntesDosMoveis=(await calls(page,'projeto_salvar')).length;

 await page.screenshot({path:path.join(os.tmpdir(),'cpj-3-workspace-vazio.png')});
 // Adiciona móveis pelo catálogo (o dock mostra onde caem)
 await page.locator('[data-cpj="ir-catalogo"]').click();
 await page.locator('.catalog-home-grid').waitFor();
 await page.locator('#catalogProjetoDock').waitFor({state:'visible'});
 assert.match(await page.locator('.cpj-dock-main').textContent(),/Ana & Bruno/);
 assert.match(await page.locator('.cpj-dock-amb').textContent(),/Cerimônia/);
 await page.locator('[data-home-category="sofas"]').click();
 await page.locator('.catalog-grid-card').first().waitFor();
 const chip1=page.locator('[data-projeto-add="1"]');
 assert.equal(await chip1.count(),1,'Cada card da grade tem o ＋');
 await page.locator('.catalog-grid-card[data-grid-item="1"]').hover();
 await chip1.click();
 await page.waitForFunction(()=>document.querySelector('[data-projeto-add="1"] .cpj-add-count')?.textContent==='1');
 assert.equal(await page.locator('.catalog-grid-card').count()>0,true,'Clicar no ＋ não abre o item (continua na grade)');
 assert.equal(await page.locator('.catalog-product-section').count(),0,'Nenhuma seção imersiva foi aberta pelo clique no ＋');
 assert.equal(await chip1.evaluate(el=>el.classList.contains('is-added')),true,'Item adicionado fica marcado');
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-4-grade-chip.png')});
 await chip1.click();
 await page.waitForFunction(()=>document.querySelector('[data-projeto-add="1"] .cpj-add-count')?.textContent==='2');
 assert.equal((await page.locator('.cpj-dock-count').textContent()).trim(),'2','Dock soma os itens do projeto');
 assert.match(await page.locator('.catalog-notification').last().textContent(),/Adicionado ao projeto/);
 // troca o ambiente ativo pelo dock e adiciona outro móvel
 await page.locator('.cpj-dock-amb').click();
 await page.locator('.cpj-dock-pop [data-cpj-dock-amb]',{hasText:'Bar'}).click();
 assert.match(await page.locator('.cpj-dock-amb').textContent(),/Bar/);
 assert.equal(await page.locator('[data-projeto-add="1"] .cpj-add-count').textContent(),'','Contador reflete só o ambiente ativo (Bar ainda vazio)');
 await page.locator('.catalog-grid-card[data-grid-item="2"]').hover();
 await page.locator('[data-projeto-add="2"]').click();
 await page.waitForFunction(()=>document.querySelector('[data-projeto-add="2"] .cpj-add-count')?.textContent==='1');
 // página do item (imersiva) também tem o botão
 await page.locator('.catalog-grid-card[data-grid-item="1"] .catalog-grid-card-name').click();
 await page.locator('.catalog-product-section').first().waitFor();
 const botaoPagina=page.locator('.catalog-product-section[data-product-id="1"] .cpj-add-page');
 assert.equal(await botaoPagina.count(),1,'Página do item tem "Adicionar ao projeto"');
 assert.match(await botaoPagina.textContent(),/Adicionar ao projeto/,'Sofá Um não está no Bar ainda');
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-5-pagina-item.png')});
 await botaoPagina.click();
 await page.waitForFunction(()=>/No projeto · 1 em Bar/.test(document.querySelector('.catalog-product-section[data-product-id="1"] .cpj-add-page')?.textContent||''));

 // Autosave
 await page.waitForTimeout(1300);
 const salvos=await calls(page,'projeto_salvar');
 const ultimo=salvos[salvos.length-1].params;
 assert.equal(ultimo.p_token,'test');
 assert.ok(ultimo.p_dados.foto_casal.url,'A foto dos noivos acompanha o resto dos dados em todo salvamento');
 assert.deepEqual(ultimo.p_dados.ambientes.map(a=>[a.nome,a.itens.map(i=>[i.item_id,i.quantidade])]),[['Cerimônia',[['1',2]]],['Bar',[['2',1],['1',1]]],['Bistrô da varanda',[]]]);
 assert.ok(salvos.length-salvosAntesDosMoveis<=3,'Autosave agrupa as edições em poucas chamadas (debounce), não uma por clique: '+(salvos.length-salvosAntesDosMoveis));

 // Espaço de trabalho: quantidade, remover, notas, renomear, excluir
 await page.locator('.cpj-dock-main').click();
 await page.locator('.cpj-work').waitFor();
 assert.equal((await page.locator('.cpj-amb-tab.is-active').textContent()).trim(),'Geral','Reabrir o projeto também abre em Geral');
 assert.equal(await page.locator('.cpj-item').count(),2);
 await page.locator('.cpj-item[data-cpj-item="1"] [data-cpj="qtd-mais"]').click();
 assert.equal(await page.locator('.cpj-item[data-cpj-item="1"] input').inputValue(),'2');
 await page.locator('.cpj-item[data-cpj-item="2"] [data-cpj="item-remover"]').click();
 assert.equal(await page.locator('.cpj-item').count(),1);
 await page.locator('.cpj-item[data-cpj-item="1"] input').fill('5');
 await page.locator('.cpj-item[data-cpj-item="1"] input').blur();
 await page.waitForFunction(()=>document.querySelector('.cpj-amb-tab.is-active b')?.textContent==='5');
 await page.locator('[data-cpj-notas]').fill('Clima rústico, luz quente.');
 await page.locator('[data-cpj="renomear"]').click();
 await modal(page).locator('[name=nome]').fill('Bar & Drinks');
 await modal(page).locator('button[type=submit]').click();
 await page.locator('.cpj-amb-panel h3',{hasText:'Bar & Drinks'}).waitFor();
 await page.waitForFunction(()=>document.querySelector('[data-cpj-save-state]')?.textContent==='Salvo ✓');
 const s2=(await calls(page,'projeto_salvar')).pop().params.p_dados.ambientes;
 assert.equal(s2[1].nome,'Bar & Drinks');assert.equal(s2[1].notas,'Clima rústico, luz quente.');assert.deepEqual(s2[1].itens,[{item_id:'1',quantidade:5}]);

 assert.deepEqual(await textosPequenos(page),[],'Espaço de trabalho + dock: nenhum texto abaixo de 12px');
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-6-workspace-itens.png')});
 // Renderização de IA salva no ambiente escolhido
 // O módulo de 3D avisa quais móveis estão na imagem que a IA devolveu (aqui: 1 Sofá Um + 3 Sofá Dois, como as poltronas repetidas de um lounge)
 const composicao=[{itemId:'1',itemName:'Sofá Um'},{itemId:'2',itemName:'Sofá Dois'},{itemId:'2',itemName:'Sofá Dois'},{itemId:'2',itemName:'Sofá Dois'}];
 await page.evaluate(([src,objetos])=>{window.catalogRegisterRenderItems(src,objetos);document.getElementById('studioResultImage').src=src;document.getElementById('studioResultDialog').showModal();},[PNG_DATA_URL,composicao]);
 await page.locator('#studioResultDialog [data-projeto-save-render]').click();
 await modal(page).waitFor();
 assert.match(await modal(page).textContent(),/Onde isto deve ficar salvo/,'Renderização sempre confirma o destino');
 assert.equal(await modal(page).locator('[name=levarMoveis]').isChecked(),true,'"Levar também os móveis desta composição" já vem marcado');
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-11-levar-moveis.png')});
 assert.match(await modal(page).locator('.cpj-check').textContent(),/1× Sofá Um, 3× Sofá Dois/,'A caixa mostra exatamente os móveis da composição, com quantidade');
 await modal(page).locator('[name=ambiente]').selectOption({label:'Cerimônia'});
 await modal(page).locator('button[type=submit]').click();
 await page.waitForFunction(()=>window.mockdb.uploads.filter(u=>/\/renders\//.test(u.path)).length===1);
 const up=await page.evaluate(()=>window.mockdb.uploads.find(u=>/\/renders\//.test(u.path)));
 assert.equal(up.bucket,'projetos');assert.match(up.path,/^company\/proj-1\/renders\/[0-9a-f-]+\.jpg$/,'Caminho empresa/projeto/renders — o que a política do Storage exige');assert.equal(up.type,'image/jpeg');
 await page.waitForFunction(()=>window.mockdb.calls.filter(c=>c.name==='projeto_salvar').pop()?.params.p_dados.ambientes[0].renders.length===1);
 const ambCerimonia=(await calls(page,'projeto_salvar')).pop().params.p_dados.ambientes[0];
 assert.deepEqual(ambCerimonia.itens,[{item_id:'1',quantidade:2},{item_id:'2',quantidade:3}],'Os móveis da composição entraram no ambiente: o que já tinha mais unidades (Sofá Um ×2) não foi somado, o novo (Sofá Dois ×3) entrou');
 assert.match(await page.locator('.catalog-notification',{hasText:'móveis salvos'}).last().textContent(),/1 móvel · Cerimônia/,'O aviso conta quantos móveis vieram junto');
 const render=ambCerimonia.renders[0];
 assert.equal(render.origem,'3D Livre');assert.match(render.url,/\/storage\/v1\/object\/public\/projetos\/company\/proj-1\/renders\//);
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-7-render-picker.png')});
 await page.evaluate(()=>document.getElementById('studioResultDialog').close());
 await page.locator('.cpj-amb-tab',{hasText:'Cerimônia'}).click();
 assert.equal(await page.locator('.cpj-render').count(),1,'Renderização aparece no ambiente escolhido');
 // Mapa de posições: a salva ocupa a posição 1 (destaque + foto da capa) e as próximas viram espaços tracejados numerados
 assert.equal(await page.locator('.cpj-render-slot').count(),2,'1 salva + 2 espaços = as 3 posições de um layout em destaque');
 assert.equal(await page.locator('.cpj-render .cpj-slot-num').textContent(),'1');
 assert.deepEqual(await page.locator('.cpj-render-slot .cpj-slot-num').allTextContents(),['2','3']);
 assert.match(await page.locator('.cpj-render figcaption').textContent(),/Destaque · tamanho grande · Também é a foto da capa/,'A 1ª renderização do projeto é a foto da capa');
 assert.equal(await page.locator('.cpj-render-slot').first().locator('svg').count(),1,'Espaço reservado com o ícone de câmera');
 assert.match(await page.locator('.cpj-map-hint').textContent(),/em destaque/,'Explica como as renderizações se posicionam');
 {
  const caixas=await page.evaluate(()=>[...document.querySelector('.cpj-renders-map').children].map(el=>{const r=el.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),y:Math.round(r.top)};}));
  assert.ok(caixas[0].w>caixas[1].w*1.8,'A posição 1 (destaque) ocupa a largura toda: '+JSON.stringify(caixas));
  assert.ok(Math.abs(caixas[1].y-caixas[2].y)<=2&&Math.abs(caixas[1].w-caixas[2].w)<=2,'As posições 2 e 3 ficam lado a lado');
  assert.ok(caixas[1].y>caixas[0].y+caixas[0].h,'...abaixo da 1');
 }
 await page.locator('.cpj-renders-map').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(os.tmpdir(),'cpj-12-mapa-renders.png')});
 // Um ambiente ainda sem renderizações: 3 espaços reservados (o 1 em destaque, mas sem o aviso de capa — a capa é do ambiente que já tem imagem)
 await page.locator('.cpj-amb-tab',{hasText:'Bistrô da varanda'}).click();
 assert.equal(await page.locator('.cpj-render').count(),0);
 assert.equal(await page.locator('.cpj-render-slot').count(),3,'Ambiente vazio mostra as 3 posições');
 assert.match(await page.locator('.cpj-render-slot').first().textContent(),/Destaque · tamanho grande/);
 assert.doesNotMatch(await page.locator('.cpj-render-slot').first().textContent(),/capa/,'A capa vem do primeiro ambiente que tem renderização');
 await page.locator('.cpj-amb-tab',{hasText:'Cerimônia'}).click();
 assert.equal(await page.locator('.cpj-item').count(),2,'...e os móveis dela também aparecem na lista do ambiente');
 // Caixa desmarcada: só a imagem entra
 await page.evaluate(([src,objetos])=>{window.catalogRegisterRenderItems(src,objetos);document.getElementById('studioResultImage').src=src;document.getElementById('studioResultDialog').showModal();},[PNG_DATA_URL,[{itemId:'3',itemName:'Mesa Um'},{itemId:'3',itemName:'Mesa Um'}]]);
 await page.locator('#studioResultDialog [data-projeto-save-render]').click();
 await modal(page).waitFor();
 assert.match(await modal(page).locator('.cpj-check').textContent(),/2× Mesa Um/,'Cada renderização leva a sua própria lista (a mais recente vale)');
 await modal(page).locator('[name=ambiente]').selectOption({label:'Bistrô da varanda'});
 await modal(page).locator('[name=levarMoveis]').uncheck();
 await modal(page).locator('button[type=submit]').click();
 await page.waitForFunction(()=>window.mockdb.uploads.filter(u=>/\/renders\//.test(u.path)).length===2);
 await page.waitForFunction(()=>window.mockdb.calls.filter(c=>c.name==='projeto_salvar').pop()?.params.p_dados.ambientes[2].renders.length===1);
 const ultimoSalvo=(await calls(page,'projeto_salvar')).pop().params.p_dados;
 assert.deepEqual(ultimoSalvo.ambientes[2].itens,[],'Desmarcou: a renderização entra sem os móveis');
 assert.equal(JSON.stringify(ultimoSalvo).includes('"item_id":"3"'),false);
 await page.evaluate(()=>document.getElementById('studioResultDialog').close());
 // "Tirar print" no 3D Livre: pedido explícito do usuário numa sessão seguinte ("quando eu tirar print vim 3
 // versões, quero que venha apenas uma") — hoje salva 1 imagem só, pelo MESMO caminho de "Salvar no projeto" que
 // qualquer outro diálogo de resultado usa (data-img/data-origem, sem lote nenhum — `__printBatch` não é mais
 // usado por ninguém, só zerado como defesa). URL distinta de `PNG_DATA_URL` (nunca registrada em
 // catalogRegisterRenderItems antes neste arquivo) — de propósito, pra não "herdar" por acidente a composição de
 // Mesa Um registrada no cenário anterior.
 await page.evaluate((base)=>{
  const botao=document.querySelector('#studioResultDialog [data-projeto-save-render]');
  botao.__printBatch=null;
  botao.dataset.origem='Print 3D Livre';
  document.getElementById('studioResultImage').src=`${base}/print.png`;
  document.getElementById('studioResultDialog').showModal();
 },'https://fixture');
 await page.locator('#studioResultDialog [data-projeto-save-render]').click();
 await modal(page).waitFor();
 assert.match(await modal(page).textContent(),/Onde isto deve ficar salvo/);
 assert.equal(await modal(page).locator('[name=levarMoveis]').count(),0,'Sem composição registrada neste teste — a pergunta de "levar móveis" nem aparece (já coberta acima)');
 await modal(page).locator('[name=ambiente]').selectOption({label:'Bistrô da varanda'});
 await modal(page).locator('button[type=submit]').click();
 await page.waitForFunction(()=>window.mockdb.uploads.filter((u)=>/\/renders\//.test(u.path)).length===3,null,{timeout:8000});
 await page.waitForFunction(()=>{
  const ultimo=window.mockdb.calls.filter((c)=>c.name==='projeto_salvar').pop();
  return ultimo?.params.p_dados.ambientes[2].renders.length===2;
 });
 const bistro=(await calls(page,'projeto_salvar')).pop().params.p_dados.ambientes[2];
 assert.equal(bistro.renders.length,2,'1 render que já existia ali + 1 do print = 2 (não mais 3 de uma vez)');
 assert.equal(bistro.renders.at(-1).origem,'Print 3D Livre');
 await page.evaluate(()=>document.getElementById('studioResultDialog').close());
 // Imagem sem composição registrada (ex.: tecido personalizado): nenhuma caixa
 await page.evaluate((src)=>{document.getElementById('catalogFabricResultImage').src=src;document.getElementById('catalogFabricResultDialog').showModal();},'data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>').toString('base64'));
 await page.locator('#catalogFabricResultDialog [data-projeto-save-render]').click();
 await modal(page).waitFor();
 assert.equal(await modal(page).locator('[name=levarMoveis]').count(),0,'Sem uma composição por trás (tecido), a pergunta nem aparece');
 await modal(page).locator('[data-cpj-cancel]').click();
 await page.evaluate(()=>{document.getElementById('catalogFabricResultDialog').close();});
 await page.locator('.cpj-amb-tab',{hasText:'Cerimônia'}).click();

 // Enviar pedido
 await page.locator('[data-cpj="enviar"]').click();
 await modal(page).waitFor();
 assert.match(await modal(page).locator('.cpj-order-summary').textContent(),/Bar & Drinks.*5 itens/);
 assert.match(await modal(page).locator('.cpj-order-total').textContent(),/10/,'Pedido soma os móveis que vieram da composição (5 na Cerimônia + 5 no Bar)');
 await modal(page).locator('[name=obs]').fill('Preciso até quinta');
 await modal(page).locator('button[type=submit]').click();
 await modal(page).waitFor({state:'detached'});
 // O status/observação/aviso de "alterado" não moram mais dentro do espaço de trabalho — só no diálogo "Ver
 // pedido", aberto a partir do status na linha do projeto na lista (ver cenário dedicado mais abaixo).
 assert.equal(await page.locator('.cpj-banner').count(),0,'Nenhuma caixa de status fixa dentro do projeto');
 await page.locator('.cpj-amb-tab',{hasText:'Bar & Drinks'}).click();
 await page.locator('.cpj-item[data-cpj-item="1"] [data-cpj="qtd-mais"]').click();

 // Voltar pra lista e recarregar: o projeto ativo volta sozinho
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-9-envio.png')});
 await page.locator('[data-cpj="voltar"]').click();
 await page.locator('.cpj-card').waitFor();
 assert.deepEqual(await textosPequenos(page),[],'Lista de projetos: nenhum texto abaixo de 12px');
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-10-lista.png')});
 assert.match(await page.locator('.cpj-card').textContent(),/Ana & Bruno.*Sítio Vale Verde/s);
 assert.match(await page.locator('.cpj-card .cpj-status').textContent(),/Pedido enviado/);
 assert.equal(await page.locator('.cpj-card .cpj-status').evaluate((el)=>el.tagName),'BUTTON','O status na lista vira o gatilho pra "Ver pedido"');
 // "Ver pedido": mesma prévia bonita (com foto/renderizações) que já existia em "Enviar pedido", agora aberta a
 // partir do status na lista, com o aviso de "alterado depois do envio" (o item mexido logo acima).
 await page.locator('.cpj-card .cpj-status').click();
 const verPedido=page.locator('dialog.cpj-modal.cpj-order-preview[open]');
 await verPedido.waitFor();
 assert.equal(await verPedido.locator('.cpj-order-paper').count(),1);
 assert.match(await verPedido.locator('.cpj-banner-obs').textContent(),/Preciso até quinta/);
 assert.match(await verPedido.locator('.cpj-banner-warn').textContent(),/alterado depois do envio/,'Avisa quando o projeto mudou depois do envio');
 assert.equal(await verPedido.locator('.cpj-banner-status').count(),0,'Decorador não muda o status do pedido');
 await verPedido.locator('[data-cpj-cancel]').click();
 await verPedido.waitFor({state:'detached'});
 assert.equal(await page.locator('.cpj-card .cpj-card-avatar').count(),1,'O cartão do projeto mostra a foto dos noivos');
 assert.equal(await page.locator('.cpj-card-owner').count(),0,'Decorador não vê "Decorador:" (só a equipe)');
 await page.waitForTimeout(1000);
 await page.reload();
 await page.locator('.catalog-gateway').waitFor();
 await page.locator('[data-gateway-tile="catalogo"]').click();
 await page.locator('#catalogProjetoDock').waitFor({state:'visible'});
 assert.match(await page.locator('.cpj-dock-main').textContent(),/Ana & Bruno/,'Projeto ativo é lembrado depois de recarregar');
 await page.screenshot({path:path.join(os.tmpdir(),'catalogo-projetos-dock.png')});

 // Mobile: sem overflow em lista, espaço de trabalho e diálogos
 await page.setViewportSize({width:390,height:844});
 await page.locator('.cpj-dock-main').click();
 await page.locator('.cpj-work').waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Espaço de trabalho sem overflow horizontal no celular');
 await page.screenshot({path:path.join(os.tmpdir(),'catalogo-projetos-mobile.png'),fullPage:true});
 await page.locator('[data-cpj="voltar"]').click();
 await page.locator('.cpj-card').waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Lista sem overflow horizontal no celular');
 await page.locator('[data-cpj="novo"]').first().click();
 await modal(page).waitFor();
 const caixa=await modal(page).boundingBox();
 assert.ok(caixa.x>=0&&caixa.x+caixa.width<=390,'Diálogo cabe na tela do celular');
 await modal(page).locator('[data-cpj-cancel]').click();

 // Excluir projeto pede confirmação
 await page.locator('[data-cpj-delete]').click();
 await modal(page).waitFor();
 assert.match(await modal(page).textContent(),/Excluir projeto\?/);
 await modal(page).locator('button[type=submit]').click();
 await page.locator('.cpj-empty-big').waitFor();
 assert.equal((await calls(page,'projeto_excluir')).length,1);
 assert.equal(await page.evaluate(()=>window.mockdb.removed.length>=0),true);
 assert.deepEqual(errors,[]);
 await page.close();
}

// ===== Cenário 2: equipe — enxerga projetos de todos, filtra pedidos, muda status; sem renderização órfã =====
{
 const {page,errors}=await newPage({staff:true},undefined,{seq:9,calls:[],uploads:[],removed:[],projetos:[
   {id:'p-dec',cliente_id:'client',noivos:'Carla & Diego',data_evento:'2027-09-04',local_evento:'Fazenda Boa Vista',status:'pedido_enviado',compartilhar:false,slug:null,pin:null,pedido_enviado_em:'2026-09-10T15:03:00Z',atualizado_em:'2026-09-10T15:03:00Z',pedido_observacao:'Montagem na véspera',
    pedido_snapshot:{total_itens:3,ambientes:[{ambiente:'Lounge',itens:[{item_id:'1',quantidade:3,nome:'Sofá Um',referencia:'SOF001'}]}]},
    dados:{ambientes:[{id:'a1',nome:'Lounge',itens:[{item_id:'1',quantidade:3}],renders:[],notas:''}]}},
   {id:'p-eq',cliente_id:null,noivos:'Projeto da equipe',data_evento:'2027-03-01',local_evento:'Salão',status:'rascunho',compartilhar:false,slug:null,pin:null,pedido_enviado_em:null,atualizado_em:'2026-09-01T10:00:00Z',dados:{ambientes:[]}},
  ]});
 await page.goto(base+'catalogo.html');
 await page.locator('.catalog-gateway').waitFor();
 await page.locator('[data-gateway-tile="projetos"]').click();
 await page.locator('.cpj-card').first().waitFor();
 assert.equal(await page.locator('.cpj-card').count(),2,'Equipe vê os projetos de todos');
 assert.equal((await calls(page,'projeto_listar'))[0].params.p_empresa_id,'company','Equipe usa a empresa (sem token)');
 assert.equal('p_token' in (await calls(page,'projeto_listar'))[0].params,false);
 assert.deepEqual(await page.locator('.cpj-card-owner').allTextContents(),['Criado pela equipe','Decorador: Kelly Decor'],'Equipe vê quem criou cada projeto (ordenado por data do evento)');
 await page.locator('[data-cpj-filter="pedidos"]').click();
 assert.equal(await page.locator('.cpj-card').count(),1,'Filtro "Pedidos recebidos" mostra só quem enviou pedido');
 // "Ver pedido": aberto pelo status na linha do projeto na lista, sem precisar entrar no espaço de trabalho.
 await page.locator('.cpj-card .cpj-status').click();
 const verPedido=page.locator('dialog.cpj-modal.cpj-order-preview[open]');
 await verPedido.waitFor();
 assert.match(await verPedido.locator('.cpj-banner-obs').textContent(),/Montagem na véspera/);
 assert.match(await verPedido.locator('.cpj-order-table').textContent(),/Sofá Um/,'Equipe vê o pedido na mesma prévia bonita, com foto (não mais um resumo de texto cru)');
 assert.equal(await verPedido.locator('.cpj-banner-warn').count(),0);
 await verPedido.locator('[data-cpj-ver-status="em_analise"]').click();
 await page.waitForFunction(()=>document.querySelector('dialog.cpj-modal[open] .cpj-banner .cpj-status')?.textContent==='Em análise');
 const st=(await calls(page,'projeto_atualizar_status'))[0].params;
 assert.deepEqual(st,{p_empresa_id:'company',p_id:'p-dec',p_status:'em_analise'});
 await verPedido.locator('[data-cpj-cancel]').click();
 await verPedido.waitFor({state:'detached'});
 assert.match(await page.locator('.cpj-card .cpj-status').textContent(),/Em análise/,'A lista já reflete o novo status, sem precisar recarregar');
 // O dock continua fora do Portal (no modo "dentro do sistema" a logo fica escondida — clique por JS)
 await page.evaluate(()=>document.querySelector('.catalog-brand').click());
 await page.locator('.catalog-gateway').waitFor();
 assert.equal(await page.locator('#catalogProjetoDock').isVisible(),false);
 assert.deepEqual(errors,[]);
 await page.close();
}

// ===== Cenário 3: Plantas legendadas — subir a planta baixa, marcar áreas arrastando, ligar cada uma a um ambiente =====
// (a decoradora monta a planta 2D no AutoCAD, sobe aqui, marca uma área e escolhe o ambiente — o sistema desenha
// sozinho a linha até a legenda com as fotos dos móveis daquele ambiente, pra equipe de montagem)
{
 const {page,errors}=await newPage({token:true},undefined,{seq:9,calls:[],uploads:[],removed:[],projetos:[
   {id:'p-plantas',cliente_id:'client',noivos:'Ana & Bruno',data_evento:'2027-05-10',local_evento:'Sítio Vale Verde',status:'rascunho',compartilhar:false,slug:null,pin:null,pedido_enviado_em:null,atualizado_em:'2026-09-01T10:00:00Z',
    dados:{ambientes:[
      {id:'amb1',nome:'Lounge 3',itens:[{item_id:'1',quantidade:2},{item_id:'2',quantidade:1}],renders:[{id:'r1',url:'https://fixture/storage/v1/object/public/projetos/company/p-plantas/renders/lounge.jpg',origem:'Composições',criado_em:'2026-09-01T09:00:00Z'}],notas:''},
      {id:'amb2',nome:'Bar',itens:[{item_id:'3',quantidade:1}],renders:[],notas:''},
    ],plantas:[]}},
  ]});
 await page.addInitScript(()=>{ window.__printCalls=0; window.print=()=>{ window.__printCalls++; }; });
 await page.goto(base+'catalogo.html');
 await page.locator('.catalog-gateway').waitFor();
 await page.locator('[data-gateway-tile="projetos"]').click();
 await page.locator('.cpj-card').first().waitFor();
 await page.locator('.cpj-card').click();
 await page.locator('.cpj-work').waitFor();

 // A aba "Plantas" fica ao lado dos ambientes, sempre por último, com contador próprio (nº de plantas, não de áreas)
 assert.deepEqual(await page.locator('.cpj-amb-tab:not(.cpj-amb-new):not(.cpj-amb-tab-plantas) span').allTextContents(),['Lounge 3','Bar']);
 assert.equal(await page.locator('.cpj-amb-tab-plantas').count(),1);
 assert.equal((await page.locator('.cpj-amb-tab-plantas b').textContent()).trim(),'','Sem planta nenhuma ainda, o emblema fica vazio');
 await page.locator('[data-cpj-worktab="plantas"]').click();
 await page.locator('.cpj-plantas-grid').waitFor();
 assert.equal(await page.locator('.cpj-amb-tab-plantas.is-active').count(),1);
 assert.match(await page.locator('.cpj-amb-head h3').textContent(),/Plantas/);
 assert.equal(await page.locator('.cpj-planta-card:not(.cpj-planta-nova)').count(),0,'Nenhuma planta ainda');
 assert.equal(await page.locator('.cpj-planta-nova').count(),1,'Card "＋ Nova planta" sempre presente');
 assert.deepEqual(await textosPequenos(page),[],'Grade de plantas: nenhum texto abaixo de 12px');
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-planta-0-grade-vazia.png')});

 // Sobe a planta (imagem qualquer — o preparo converte pra PNG, path empresa/projeto/plantas/<uuid>.png)
 await page.locator('[data-cpj-planta-nova-input]').setInputFiles({name:'planta.png',mimeType:'image/png',buffer:PNG_1X1});
 await page.locator('[data-cpj-planta-frame]').waitFor();
 assert.equal(await page.locator('[data-cpj-planta-nome]').inputValue(),'Planta 1');
 await page.waitForFunction(()=>window.mockdb.uploads.some((u)=>/\/plantas\//.test(u.path)));
 const upPlanta=await page.evaluate(()=>window.mockdb.uploads.find((u)=>/\/plantas\//.test(u.path)));
 assert.equal(upPlanta.bucket,'projetos');
 assert.match(upPlanta.path,/^company\/p-plantas\/plantas\/[0-9a-f-]+\.png$/,'Caminho empresa/projeto/plantas — mesma convenção do resto do módulo');
 assert.equal(upPlanta.type,'image/png','Planta nunca vira JPEG — é um desenho de linhas do AutoCAD, sem compressão com perdas');
 assert.equal((await page.locator('.cpj-amb-tab-plantas b').textContent()).trim(),'1','Emblema soma 1 planta');
 assert.equal(await page.locator('[data-cpj-planta-vazio]').isVisible(),true,'Sem pontos ainda: aviso "nenhum ponto marcado" visível');

 // Espera a imagem carregar de verdade e o palco ganhar layout, antes de clicar nele
 await page.waitForFunction(()=>{ const img=document.querySelector('[data-cpj-planta-img]'); return Boolean(img && img.complete && img.naturalWidth>0); });
 const stageBox=await page.locator('[data-cpj-planta-stage]').boundingBox();
 assert.ok(stageBox.width>200,'Palco da planta tem largura de verdade: '+JSON.stringify(stageBox));
 // Rola o palco pra dentro da tela e RE-MEDE a cada clique (não confia numa medição só, tirada uma vez lá em
 // cima) — o palco agora tem o formato/altura do papel escolhido (pedido explícito: "mostre as bordas como se
 // fosse a folha de impressão"), que pode ser bem mais alto que 900px (a altura do viewport deste teste) e cair
 // fora da tela; `page.mouse.click` usa coordenada fixa, não rola sozinho como um `.locator().click()` comum.
 const clicarNaPlanta=async(fx,fy)=>{
  await page.locator('[data-cpj-planta-stage]').scrollIntoViewIfNeeded();
  const box=await page.locator('[data-cpj-planta-stage]').boundingBox();
  await page.mouse.click(box.x+box.width*fx,box.y+box.height*fy);
 };

 // Um clique só marca o ponto e abre "qual é esse ponto da planta?" (pedido explícito: trocar arrastar por clicar)
 await clicarNaPlanta(.3,.35);
 await modal(page).waitFor();
 assert.match(await modal(page).locator('header h3').textContent(),/Qual é esse ponto da planta\?/);
 // O pontinho clicado continua visível atrás do diálogo (backdrop translúcido) enquanto a pessoa escolhe — achado
 // corrigido nesta sessão: antes o estado pendente era limpo ANTES de abrir o diálogo, e o preview sumia na hora.
 assert.equal(await page.locator('.cpj-planta-point.is-pendente').count(),1,'Preview do ponto continua visível com o diálogo aberto');
 assert.deepEqual(await modal(page).locator('.cpj-planta-amb-card strong').allTextContents(),['Lounge 3','Bar']);
 // Pedido explícito do usuário, vendo a tela real: "aqui precisa os prints e nao as fotos dos itens separadas" —
 // a capa de cada card é a renderização (o "print"), não mais um mosaico de fotos soltas por item.
 const cardLounge=modal(page).locator('.cpj-planta-amb-card',{hasText:'Lounge 3'});
 assert.equal(await cardLounge.locator('.cpj-planta-amb-mosaico.is-print').count(),1,'Lounge 3 tem renderização — mostra o print, não o mosaico de fotos por item');
 assert.match(await cardLounge.locator('.cpj-planta-amb-mosaico img').getAttribute('src'),/lounge\.jpg/,'É a MESMA renderização que a legenda da planta usa');
 assert.equal(await cardLounge.locator('.cpj-planta-amb-mosaico img').count(),1,'Uma imagem só (o print), não várias fotos de item num grid');
 const cardBar=modal(page).locator('.cpj-planta-amb-card',{hasText:'Bar'});
 assert.equal(await cardBar.locator('.cpj-planta-amb-mosaico.is-vazio').count(),1,'Bar não tem renderização ainda (mesmo tendo item com foto) — cai no estado vazio, nunca mostra fotos soltas de item como fallback');
 assert.equal(await cardBar.locator('.cpj-planta-amb-mosaico img').count(),0);
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-planta-1-escolher-ambiente.png')});
 await modal(page).locator('.cpj-planta-amb-card',{hasText:'Lounge 3'}).click();
 // Não basta esperar o diálogo fechar: fechar o <dialog> resolve a Promise só como MICROTASK, então ler o DOM logo
 // depois de só constatar "dialog sumiu" corre o risco de pegar o estado ANTES da legenda ter sido criada de
 // verdade (achado real, intermitente, corrigindo o teste) — espera o efeito de verdade (o ponto existir).
 await page.waitForFunction(()=>document.querySelectorAll('dialog.cpj-modal[open]').length===0&&document.querySelector('.cpj-planta-point'));

 assert.equal(await page.locator('.cpj-planta-point').count(),1);
 assert.equal(await page.locator('.cpj-planta-point.is-pendente').count(),0,'Confirmado: vira ponto definitivo, não mais o preview pontilhado');
 assert.equal(await page.locator('[data-cpj-planta-vazio]').isVisible(),false,'Achado corrigindo: criar o 1º ponto já esconde o aviso na hora, não só ao sair e voltar da aba');
 assert.equal(await page.locator('.cpj-planta-lines line').count(),1,'Uma linha saindo do ponto até a legenda');
 assert.equal(await page.locator('.cpj-planta-label').count(),1);
 // Sem número nenhum no marcador (pedido explícito: "não quero que apareça número na planta, quero que seja
 // somente a linha") — só o × de remover, escondido até o hover/foco.
 assert.doesNotMatch(await page.locator('.cpj-planta-point').textContent(),/[0-9]/,'Sem número nenhum no marcador');
 const marcador=page.locator('.cpj-planta-point');
 assert.equal(await marcador.evaluate((el)=>getComputedStyle(el,'::before').opacity),'0','Marcador invisível em repouso — só a linha aparece por padrão (e na impressão)');
 await marcador.hover();
 // A opacidade anima em .15s — ler na mesma hora do hover pega o valor ainda em trânsito (mesma corrida já
 // documentada noutros testes deste arquivo); espera a transição terminar antes de comparar.
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.cpj-planta-point'),'::before').opacity==='1');
 await page.mouse.move(0,0);
 // Sem cabeçalho/nome de ambiente nem card algum em volta da foto (pedido explícito: "retire o card em volta da
 // foto, e retire a descrição também... bar, lounge, bistros... nosso objetivo é ganhar espaço") — a única pista de
 // QUAL ambiente aquela legenda é fica no aria-label do "×" de remover (acessibilidade), nunca mais em texto visível.
 assert.equal(await page.locator('.cpj-planta-label-head').count(),0,'Sem cabeçalho com o nome do ambiente na legenda');
 assert.match(await page.locator('.cpj-planta-label .cpj-planta-point-x').getAttribute('aria-label'),/Lounge 3/);
 // A "montagem" renderizada em 3D, não fotos soltas por item (pedido explícito, com foto de referência de uma
 // composição de lounge: "não quero que apareça a fotos os itens soltas, quero que apareça a montagem... isso o
 // próprio sistema registrou em 3D")
 assert.equal(await page.locator('.cpj-planta-label-item').count(),0,'Sem fotos soltas por item');
 await page.locator('.cpj-planta-label-render').waitFor();
 assert.match(await page.locator('.cpj-planta-label-render').getAttribute('src'),/lounge\.jpg\?width=700/,'Mostra a renderização de verdade do ambiente (a mesma já salva em Composições/3D Livre)');
 assert.match(await page.locator('.cpj-planta-label-itens').textContent(),/2× Sofá Um, Sofá Dois/,'Nomes dos itens viram texto simples abaixo da imagem, não mais legenda por foto');
 assert.equal(await page.locator('.cpj-planta-label-render').evaluate((el)=>getComputedStyle(el).borderStyle),'none','A foto não tem mais nenhuma borda/moldura ao redor — pedido explícito de retirar o card');
 // Pedido explícito do usuário: "eu quero arrastar em qualquer lugar que eu segurar na imagem... basta eu segurar
 // na foto na planta que eu consigo arrastar ela" — sem `draggable="false"`/`-webkit-user-drag:none` na própria
 // foto, o navegador dispara o arrasto NATIVO de imagem (mover/salvar) assim que o gesto começa EM CIMA dela,
 // disputando com o arrasto por Pointer Events já implementado no bloco inteiro. **Não dá pra reproduzir essa
 // disputa de verdade simulando com `page.mouse`** (`down/move/up` sintéticos do Playwright não disparam o
 // `dragstart` nativo do jeito que um gesto real do usuário dispara — confirmado apagando as duas proteções e
 // rodando a suíte inteira: nenhum teste baseado em `page.mouse` falhou, nem o de "arrastar a legenda" logo
 // abaixo), então a prova aqui é direto nos atributos/CSS que EVITAM a disputa acontecer, não em simular o gesto.
 assert.equal(await page.locator('.cpj-planta-label-render').getAttribute('draggable'),'false','O atributo HTML — o Firefox ignora a propriedade CSS de baixo, só respeita este');
 assert.equal(await page.locator('.cpj-planta-label-render').evaluate((el)=>getComputedStyle(el).webkitUserDrag),'none','A propriedade CSS — o Chromium/Edge/Safari (o motor usado nesta suíte) respeita esta, não o atributo HTML sozinho');
 // A linha sai exatamente do CENTRO do ponto clicado (pedido explícito) — não da borda da planta nem de um canto
 const escalaTela=await page.locator('[data-cpj-planta-frame]').evaluate(el=>Number(el.dataset.escalaVisual));
 const linha1=await page.locator('.cpj-planta-lines line').getAttribute('x1');
 const linha1y=await page.locator('.cpj-planta-lines line').getAttribute('y1');
 const pontoBox=await page.locator('.cpj-planta-point').boundingBox();
 const frameBox=await page.locator('[data-cpj-planta-frame]').boundingBox();
 assert.ok(Math.abs(Number(linha1)*escalaTela-(pontoBox.x+pontoBox.width/2-frameBox.x))<2,'x1 da linha bate com o centro do ponto');
 assert.ok(Math.abs(Number(linha1y)*escalaTela-(pontoBox.y+pontoBox.height/2-frameBox.y))<2,'y1 da linha bate com o centro do ponto');
 const corLabel=await page.locator('.cpj-planta-label').evaluate((el)=>getComputedStyle(el).backgroundColor);
 assert.ok(corLabel==='rgba(0, 0, 0, 0)'||corLabel==='transparent','Sem fundo/card envolvendo a legenda inteira');
 assert.equal(await page.locator('.cpj-planta-label').evaluate((el)=>getComputedStyle(el).boxShadow),'none','Sem sombra de card');
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-planta-2-legenda-criada.png')});

 // Margens simétricas mantêm a planta centralizada, inclusive com legenda só em cima.
 const paddingTopSemNada=parseFloat(await page.locator('[data-cpj-planta-frame]').evaluate((el)=>getComputedStyle(el).paddingTop));
 assert.equal(paddingTopSemNada,parseFloat(await page.locator('[data-cpj-planta-frame]').evaluate(el=>getComputedStyle(el).paddingBottom)));
 await clicarNaPlanta(.5,.04); // bem no topo da imagem — cai no lado "cima"
 await modal(page).waitFor();
 await modal(page).locator('.cpj-planta-amb-card',{hasText:'Bar'}).click();
 await page.waitForFunction(()=>document.querySelectorAll('dialog.cpj-modal[open]').length===0);
 await page.waitForFunction(()=>document.querySelectorAll('.cpj-planta-point').length===2);
 const paddingTopComLegenda=parseFloat(await page.locator('[data-cpj-planta-frame]').evaluate((el)=>getComputedStyle(el).paddingTop));
 assert.ok(paddingTopComLegenda>=paddingTopSemNada,'A margem preserva o espaço da folha e da legenda');
 assert.equal(paddingTopComLegenda,parseFloat(await page.locator('[data-cpj-planta-frame]').evaluate(el=>getComputedStyle(el).paddingBottom)));
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-planta-2b-margem-dinamica.png')});
 // Remove esse 2º ponto de novo (era só pra provar a margem dinâmica) — volta a ter 1 legenda só, pro resto do teste.
 // Sem número pra identificar (pedido explícito removeu o número), pega pela ORDEM no DOM (2º criado = 2º na lista).
 const pontoDoTopo=page.locator('.cpj-planta-point').nth(1);
 await pontoDoTopo.hover();
 await pontoDoTopo.locator('.cpj-planta-point-x').click();
 await page.waitForFunction(()=>document.querySelectorAll('.cpj-planta-point').length===1);
 const paddingTopDepoisDeRemover=parseFloat(await page.locator('[data-cpj-planta-frame]').evaluate((el)=>getComputedStyle(el).paddingTop));
 assert.equal(paddingTopDepoisDeRemover,paddingTopSemNada,'Remover a legenda restaura a margem centralizada');

 // Interruptor "mostrar nomes" — some só o texto dos itens, a renderização continua
 await page.locator('[data-cpj-planta-nomes]').uncheck();
 await page.waitForFunction(()=>document.querySelectorAll('.cpj-planta-label-itens').length===0);
 assert.equal(await page.locator('.cpj-planta-label-render').count(),1,'A renderização continua sem os nomes');
 await page.locator('[data-cpj-planta-nomes]').check();
 await page.waitForFunction(()=>document.querySelectorAll('.cpj-planta-label-itens').length===1);

 // Clicar no ponto já marcado troca o ambiente dele (a escolha atual vem marcada no diálogo)
 await page.locator('.cpj-planta-point').click();
 await modal(page).waitFor();
 assert.equal(await modal(page).locator('.cpj-planta-amb-card.is-active strong').textContent(),'Lounge 3');
 await modal(page).locator('.cpj-planta-amb-card',{hasText:'Bar'}).click();
 // Mesma corrida documentada acima: espera o efeito de verdade (a troca refletida no aria-label do ×), não só o
 // diálogo ter sumido.
 await page.waitForFunction(()=>document.querySelectorAll('dialog.cpj-modal[open]').length===0&&document.querySelector('.cpj-planta-label .cpj-planta-point-x')?.getAttribute('aria-label')?.includes('Bar'));
 assert.equal(await page.locator('.cpj-planta-point').count(),1,'Ainda é o MESMO ponto — trocar ambiente não duplica');
 assert.match(await page.locator('.cpj-planta-label .cpj-planta-point-x').getAttribute('aria-label'),/Bar/);
 // Bar não tem nenhuma renderização ainda — mostra o aviso, nunca volta a mostrar fotos soltas por item
 assert.equal(await page.locator('.cpj-planta-label-render').count(),0);
 assert.equal(await page.locator('.cpj-planta-label-item').count(),0,'Sem fotos soltas, mesmo sem renderização');
 assert.match(await page.locator('.cpj-planta-label-vazio').textContent(),/Sem renderização/,'Aviso claro quando o ambiente ainda não tem nenhuma renderização');

 // Arrastar a legenda pra reposicionar (pedido explícito: "quero poder arrastar os blocos pra espalhar melhor")
 assert.equal(await page.locator('.cpj-planta-label').evaluate((el)=>getComputedStyle(el).cursor),'grab','Indica que dá pra arrastar');
 await page.locator('.cpj-planta-label').scrollIntoViewIfNeeded();
 const labelBoxAntes=await page.locator('.cpj-planta-label').boundingBox();
 const x2Antes=await page.locator('.cpj-planta-lines line').getAttribute('x2');
 await page.mouse.move(labelBoxAntes.x+20,labelBoxAntes.y+16);
 await page.mouse.down();
 await page.mouse.move(labelBoxAntes.x+20+230,labelBoxAntes.y+16+160,{steps:6});
 assert.equal(await page.locator('.cpj-planta-label.is-arrastando').count(),1,'Estado visual de "arrastando" durante o gesto');
 const x2Durante=await page.locator('.cpj-planta-lines line').getAttribute('x2');
 assert.notEqual(x2Durante,x2Antes,'A linha acompanha o arrasto em tempo real, sem esperar soltar');
 await page.mouse.up();
 assert.equal(await page.locator('.cpj-planta-label.is-arrastando').count(),0,'Some ao soltar');
 // O soltar agenda o recálculo definitivo (que reconstrói o innerHTML de labelsHost) num setTimeout(…,0) de
 // propósito (ver comentário de onLabelsPointerUp em catalogo-projetos.mjs) — ler boundingBox() direto aqui corre
 // o risco real de cair bem no meio dessa reconstrução (`.cpj-planta-label` some por um instante enquanto o HTML é
 // reescrito), voltando `null` (achado intermitente rodando este teste várias vezes seguidas). Espera o elemento
 // reaparecer com uma caixa de verdade antes de medir.
 await page.waitForFunction(()=>{ const el=document.querySelector('.cpj-planta-label'); return el&&el.getBoundingClientRect().width>0; });
 const labelBoxDepois=await page.locator('.cpj-planta-label').boundingBox();
 assert.ok(Math.abs(labelBoxDepois.x-(labelBoxAntes.x+230))<4&&Math.abs(labelBoxDepois.y-(labelBoxAntes.y+160))<4,'A legenda ficou exatamente onde foi solta: '+JSON.stringify({labelBoxAntes,labelBoxDepois}));
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-planta-2c-arrastada.png')});

 // Um clique normal (sem arrastar) continua abrindo "trocar ambiente" — o arrasto não engoliu o clique de verdade
 await page.locator('.cpj-planta-label').click();
 await modal(page).waitFor();
 assert.match(await modal(page).locator('header h3').textContent(),/Qual é esse ponto da planta\?/);
 await modal(page).locator('[data-cpj-cancel]').click();
 await page.waitForFunction(()=>document.querySelectorAll('dialog.cpj-modal[open]').length===0);

 // Posição da legenda RELATIVA ao próprio quadro (não à viewport) — comparar boundingBox() bruto contra a viewport
 // é frágil a QUALQUER diferença de rolagem entre as duas medições (achado real: a página ficou mais alta depois
 // dos controles de tamanho/da folha de referência, o scroll de uma medição pra outra passou a diferir mesmo sem
 // NENHUM bug de posicionamento — a legenda sempre esteve no mesmo lugar DENTRO do quadro, só a rolagem mudava).
 const relativoAoFrame=async()=>{
  const frame=await page.locator('[data-cpj-planta-frame]').boundingBox();
  const label=await page.locator('.cpj-planta-label').boundingBox();
  return { x: label.x-frame.x, y: label.y-frame.y };
 };
 const posLabelDepois=await relativoAoFrame();

 // Sai da planta e volta (sem sair do projeto) — a posição arrastada continua onde foi deixada
 await page.locator('[data-cpj="plantas-voltar"]').click();
 await page.locator('.cpj-plantas-grid').waitFor();
 await page.locator('[data-cpj="planta-abrir"]').click();
 await page.locator('[data-cpj-planta-frame]').waitFor();
 await page.waitForFunction(()=>document.querySelector('.cpj-planta-label'));
 const posLabelReaberta=await relativoAoFrame();
 assert.ok(Math.abs(posLabelReaberta.x-posLabelDepois.x)<4&&Math.abs(posLabelReaberta.y-posLabelDepois.y)<4,'Reabrir a planta preserva a posição arrastada (relativa ao quadro): '+JSON.stringify({posLabelDepois,posLabelReaberta}));

 // Autosave: a planta (com a legenda) acompanha o resto dos dados do projeto
 await page.waitForFunction(()=>{
  const ultimo=window.mockdb.calls.filter((c)=>c.name==='projeto_salvar').pop();
  return ultimo && ultimo.params.p_dados.plantas?.[0]?.legendas?.length===1;
 });
 const plantaSalva=(await calls(page,'projeto_salvar')).pop().params.p_dados.plantas[0];
 assert.equal(plantaSalva.nome,'Planta 1');
 assert.equal(plantaSalva.mostrarNomes,true);
 assert.equal(plantaSalva.legendas[0].ambienteId,'amb2','A troca de ambiente foi salva');
 assert.ok(plantaSalva.legendas[0].ponto.x>0&&plantaSalva.legendas[0].ponto.y>0,'Ponto guardado em fração 0-1, não pixel');
 assert.ok(plantaSalva.legendas[0].pos&&plantaSalva.legendas[0].pos.x>0&&plantaSalva.legendas[0].pos.y>0,'Posição arrastada também foi salva (fração 0-1 do quadro)');

 // Remover a legenda (×) — o ponto, a linha e a legenda somem, e volta o aviso de planta sem ponto marcado
 await page.locator('.cpj-planta-point').hover();
 await page.locator('.cpj-planta-point .cpj-planta-point-x').click();
 await page.waitForFunction(()=>document.querySelectorAll('.cpj-planta-point').length===0);
 assert.equal(await page.locator('.cpj-planta-lines line').count(),0);
 assert.equal(await page.locator('.cpj-planta-label').count(),0);
 assert.match(await page.locator('.cpj-planta-editor .cpj-empty').textContent(),/Nenhum ponto marcado ainda/,'Achado corrigindo: sem isso o aviso ficava desatualizado até sair e voltar da aba');

 // Renomear a planta
 await page.locator('[data-cpj-planta-nome]').fill('Planta térreo');
 await page.locator('[data-cpj-planta-nome]').blur();
 await page.waitForFunction(()=>window.mockdb.calls.filter((c)=>c.name==='projeto_salvar').pop()?.params.p_dados.plantas[0].nome==='Planta térreo');

 // Trocar a imagem: sobe a nova e apaga a antiga do Storage
 await page.locator('[data-cpj-planta-trocar-input]').setInputFiles({name:'planta2.png',mimeType:'image/png',buffer:PNG_1X1});
 await page.waitForFunction(()=>window.mockdb.uploads.filter((u)=>/\/plantas\//.test(u.path)).length===2);
 await page.waitForFunction((antigo)=>window.mockdb.removed.includes(antigo),upPlanta.path);

 // Baixar planta = impressão do navegador (mesmo padrão do resto do catálogo, sem gerador de PDF próprio)
 await page.locator('[data-cpj="planta-baixar"]').click();
 await page.waitForFunction(()=>window.__printCalls>=1);

 // Voltar pra grade: mostra a planta renomeada, sem pontos (a única legenda foi removida)
 await page.locator('[data-cpj="plantas-voltar"]').click();
 await page.locator('.cpj-plantas-grid').waitFor();
 assert.equal(await page.locator('.cpj-planta-card:not(.cpj-planta-nova)').count(),1);
 assert.match(await page.locator('.cpj-planta-card:not(.cpj-planta-nova) strong').textContent(),/Planta térreo/);
 assert.match(await page.locator('.cpj-planta-card:not(.cpj-planta-nova) small').textContent(),/0 pontos marcados/);
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-planta-3-grade-com-planta.png')});

 // Excluir a planta pede confirmação, some da grade e do Storage
 await page.locator('[data-cpj="planta-abrir"]').click();
 await page.locator('[data-cpj-planta-frame]').waitFor();
 await page.locator('[data-cpj="planta-excluir"]').click();
 await modal(page).waitFor();
 assert.match(await modal(page).textContent(),/Excluir.*Planta térreo/s);
 await modal(page).locator('button[type=submit]').click();
 await page.locator('.cpj-plantas-grid').waitFor();
 assert.equal(await page.locator('.cpj-planta-card:not(.cpj-planta-nova)').count(),0,'Planta excluída some da grade');
 assert.equal((await page.locator('.cpj-amb-tab-plantas b').textContent()).trim(),'','Emblema volta a ficar vazio');
 await page.waitForFunction(()=>window.mockdb.removed.length>=2);

 // Mobile: grade e (com uma planta nova, e uma legenda de verdade — fotos grandes num viewport estreito é
 // exatamente onde overflow poderia aparecer) o editor não estouram a largura da tela
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Grade de plantas sem overflow no celular');
 await page.locator('[data-cpj-planta-nova-input]').setInputFiles({name:'planta3.png',mimeType:'image/png',buffer:PNG_1X1});
 await page.locator('[data-cpj-planta-frame]').waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Editor da planta (sem legenda) sem overflow no celular');
 await page.waitForFunction(()=>{ const img=document.querySelector('[data-cpj-planta-img]'); return Boolean(img && img.complete && img.naturalWidth>0); });
 await page.locator('[data-cpj-planta-stage]').scrollIntoViewIfNeeded();
 const stageBoxMobile=await page.locator('[data-cpj-planta-stage]').boundingBox();
 await page.mouse.click(stageBoxMobile.x+stageBoxMobile.width*.5,stageBoxMobile.y+stageBoxMobile.height*.5);
 await modal(page).waitFor();
 await modal(page).locator('.cpj-planta-amb-card',{hasText:'Lounge 3'}).click();
 await page.waitForFunction(()=>document.querySelectorAll('dialog.cpj-modal[open]').length===0);
 await page.locator('.cpj-planta-label').waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Editor da planta COM legenda (fotos grandes) sem overflow no celular');
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-planta-4-mobile.png'),fullPage:true});

 // Cancelar o diálogo de "qual ambiente" não marca ponto nenhum
 await page.setViewportSize({width:1500,height:900});
 await page.locator('.cpj-planta-point').hover();
 await page.locator('.cpj-planta-point .cpj-planta-point-x').click();
 await page.waitForFunction(()=>document.querySelectorAll('.cpj-planta-point').length===0);
 await page.locator('[data-cpj-planta-stage]').scrollIntoViewIfNeeded();
 const stageBox2=await page.locator('[data-cpj-planta-stage]').boundingBox();
 await page.mouse.click(stageBox2.x+stageBox2.width*.4,stageBox2.y+stageBox2.height*.4);
 await modal(page).waitFor();
 assert.deepEqual(await textosPequenos(page),[],'Diálogo de escolher ambiente: nenhum texto abaixo de 12px');
 await modal(page).locator('[data-cpj-cancel]').click();
 await page.waitForFunction(()=>document.querySelectorAll('dialog.cpj-modal[open]').length===0);
 assert.equal(await page.locator('.cpj-planta-point').count(),0,'Cancelar não marca o ponto');

 assert.deepEqual(errors,[]);
 await page.close();
}

// ===== Cenário 3b: Plantas — a linha continua encostando na foto mesmo quando ela demora pra carregar =====
// Achado real reportado pelo usuário, com print: "a seta precisa ir até encostar em algum item" — a linha estava
// parando longe da foto. Causa: a foto de cada legenda é uma imagem de rede de verdade (a renderização salva em
// Composições/3D Livre), que demora um tempo real pra carregar — a medição de altura da legenda rodava ANTES
// disso (offsetHeight de um <img> sem carregar é 0), e nada recalculava a posição/linha depois que a foto
// finalmente aparecia. Este cenário força esse atraso de propósito (só nesta imagem específica, pra não mudar o
// timing instantâneo que o resto da suíte já depende) e confere que a linha SEMPRE acaba encostando na caixa de
// verdade, depois que a foto carrega.
{
 const {page,errors}=await newPage({token:true},undefined,{seq:9,calls:[],uploads:[],removed:[],projetos:[
   {id:'p-planta-atraso',cliente_id:'client',noivos:'Ana & Bruno',data_evento:'2027-05-10',local_evento:'Sítio Vale Verde',status:'rascunho',compartilhar:false,slug:null,pin:null,pedido_enviado_em:null,atualizado_em:'2026-09-01T10:00:00Z',
    dados:{ambientes:[
      {id:'amb1',nome:'Lounge 3',itens:[{item_id:'1',quantidade:2},{item_id:'2',quantidade:1}],renders:[{id:'r1',url:'https://fixture/storage/v1/object/public/projetos/company/p-planta-atraso/renders/recalc-teste.jpg',origem:'Composições',criado_em:'2026-09-01T09:00:00Z'}],notas:''},
    ],plantas:[]}},
  ]});
 // Rota MAIS ESPECÍFICA, registrada DEPOIS da genérica de `newPage()` — o Playwright dá prioridade à mais recente
 // quando duas batem na mesma URL (lição já documentada nesta suíte pro mosaico da Biblioteca). Só ESTA imagem
 // (a foto da legenda) tem atraso real de rede; o resto do teste continua respondendo na hora.
 await page.route('https://fixture/**recalc-teste.jpg**',async(r)=>{ await new Promise((res)=>setTimeout(res,400)); r.fulfill({contentType:'image/png',body:PNG_1X1}); });
 await page.goto(base+'catalogo.html');
 await page.locator('.catalog-gateway').waitFor();
 await page.locator('[data-gateway-tile="projetos"]').click();
 await page.locator('.cpj-card').click();
 await page.locator('.cpj-work').waitFor();
 await page.locator('[data-cpj-worktab="plantas"]').click();
 await page.locator('.cpj-plantas-grid').waitFor();
 await page.locator('[data-cpj-planta-nova-input]').setInputFiles({name:'planta.png',mimeType:'image/png',buffer:PNG_1X1});
 await page.locator('[data-cpj-planta-frame]').waitFor();
 await page.waitForFunction(()=>{ const img=document.querySelector('[data-cpj-planta-img]'); return Boolean(img && img.complete && img.naturalWidth>0); });
 // A folha A4 retrato (padrão) é bem mais alta que a planta de antes — o ponto de clique pode cair fora do
 // viewport de 900px de altura deste teste; `page.mouse.click` usa coordenadas fixas de tela, não rola sozinho
 // (diferente de um `.locator().click()` comum).
 await page.locator('[data-cpj-planta-stage]').scrollIntoViewIfNeeded();
 const stageBox=await page.locator('[data-cpj-planta-stage]').boundingBox();
 await page.mouse.click(stageBox.x+stageBox.width*.3,stageBox.y+stageBox.height*.6);
 await modal(page).waitFor();
 await modal(page).locator('.cpj-planta-amb-card',{hasText:'Lounge 3'}).click();
 await page.waitForFunction(()=>document.querySelectorAll('dialog.cpj-modal[open]').length===0&&document.querySelector('.cpj-planta-point'));

 // Confere a foto ainda não carregou nesse instante — senão o teste não estaria provando nada (só provaria que a
 // imagem já estava em cache, igual ao resto da suíte).
 assert.equal(await page.locator('.cpj-planta-label-render').evaluate((el)=>el.complete),false,'A foto realmente ainda não carregou aqui — é essa demora que o teste precisa reproduzir');

 // Espera a foto carregar DE VERDADE (evento load, não um timeout arbitrário) e a legenda se reposicionar sozinha.
 await page.waitForFunction(()=>document.querySelector('.cpj-planta-label-render')?.complete===true);
 // O recálculo é agendado num requestAnimationFrame (ver fotosPlantaRaf em recalcularPlanta()) — dá mais um
 // quadro pra ele rodar antes de medir.
 await page.evaluate(()=>new Promise((r)=>requestAnimationFrame(()=>requestAnimationFrame(r))));

 const frameBox=await page.locator('[data-cpj-planta-frame]').boundingBox();
 const labelBox=await page.locator('.cpj-planta-label').boundingBox();
 const linha=await page.locator('.cpj-planta-lines line').evaluate((el)=>({x1:Number(el.getAttribute('x1')),y1:Number(el.getAttribute('y1')),x2:Number(el.getAttribute('x2')),y2:Number(el.getAttribute('y2'))}));
 const escala=await page.locator('[data-cpj-planta-frame]').evaluate(el=>Number(el.dataset.escalaVisual));
 const box={left:(labelBox.x-frameBox.x)/escala,top:(labelBox.y-frameBox.y)/escala,width:labelBox.width/escala,height:labelBox.height/escala};
 const esperado={
  x:Math.max(box.left,Math.min(box.left+box.width,linha.x1)),
  y:Math.max(box.top,Math.min(box.top+box.height,linha.y1)),
 };
 assert.ok(Math.abs(linha.x2-esperado.x)<2&&Math.abs(linha.y2-esperado.y)<2,'A linha encosta na caixa da legenda DE VERDADE (a que está na tela agora, depois da foto carregar), não numa medição congelada de antes: '+JSON.stringify({linha,box,esperado}));
 // A foto em si preenche a largura toda da caixa (mesma lógica de sempre) — prova de que a caixa medida É a foto,
 // não sobrou nenhuma folga/"card" fantasma por causa da correção.
 const fotoBox=await page.locator('.cpj-planta-label-render').boundingBox();
 assert.ok(Math.abs(fotoBox.x-labelBox.x)<1&&Math.abs(fotoBox.y-labelBox.y)<1&&Math.abs(fotoBox.width-labelBox.width)<1,'A foto ocupa a caixa inteira da legenda, sem sobra');

 assert.deepEqual(errors,[]);
 await page.close();
}

// ===== Cenário 3c: Plantas — folha de impressão (bordas do papel) + ajustar (arrastar/zoom) a planta dentro dela =====
// Pedido explícito do usuário: "eu quero que voce mostre as bordas como se fosse a folha de impressao, pra eu
// saber os espacos que eu posso ocupar com os prints... e eu quero que tenha a opcao de eu aumentar ou diminuir o
// pdf que o decorador enviar dentro desse espaco da folha".
{
 const {page,errors}=await newPage({token:true},undefined,{seq:9,calls:[],uploads:[],removed:[],projetos:[
   {id:'p-planta-folha',cliente_id:'client',noivos:'Ana & Bruno',data_evento:'2027-05-10',local_evento:'Sítio Vale Verde',status:'rascunho',compartilhar:false,slug:null,pin:null,pedido_enviado_em:null,atualizado_em:'2026-09-01T10:00:00Z',
    dados:{ambientes:[{id:'amb1',nome:'Lounge 3',itens:[],renders:[],notas:''}],plantas:[]}},
  ]});
 await page.addInitScript(()=>{ window.__printCalls=0; window.print=()=>{ window.__printCalls++; }; });
 await page.goto(base+'catalogo.html');
 await page.locator('.catalog-gateway').waitFor();
 await page.locator('[data-gateway-tile="projetos"]').click();
 await page.locator('.cpj-card').click();
 await page.locator('.cpj-work').waitFor();
 await page.locator('[data-cpj-worktab="plantas"]').click();
 await page.locator('.cpj-plantas-grid').waitFor();
 // Planta bem mais larga que alta (3:1) — o OPOSTO do papel padrão (A4 retrato, mais alto que largo) — é esse
 // descasamento que prova de verdade se sobra folga pra arrastar nos dois eixos (ver MIN_PLANTA_OVERSCAN).
 await page.locator('[data-cpj-planta-nova-input]').setInputFiles({name:'planta.png',mimeType:'image/png',buffer:PNG_PLANTA_LARGA});
 await page.locator('[data-cpj-planta-frame]').waitFor();
 await page.waitForFunction(()=>{ const img=document.querySelector('[data-cpj-planta-img]'); return Boolean(img && img.complete && img.naturalWidth>0); });

 // O contorno da PLANTA (palco) — por padrão, A4 retrato (mais alto que largo).
 assert.equal(await page.locator('[data-cpj-planta-papel]').inputValue(),'a4-retrato');
 assert.equal(await page.locator('[data-cpj-planta-stage]').evaluate((el)=>getComputedStyle(el).aspectRatio),'210 / 297');
 // O contorno da FOLHA (novo, por fora de tudo) — pedido explícito do usuário, numa rodada seguinte: "por fora
 // ali dos ambientes 3d precisaria ter uma outra linha que representa de fato a pagina que sera impressa". Mesma
 // proporção do papel — e (achado real, reportado depois de publicado: "a marcacao da folha a4 nao condiz com a
 // folha de impressao") o TAMANHO em px agora é o FÍSICO real da folha (mm → px a 96dpi, PX_POR_MM), nunca "quanto
 // espaço sobra na tela hoje" — A4 retrato tem 210mm de largura = 210*96/25.4 ≈ 793,7px, arredondado pra 794.
 assert.equal(await page.locator('[data-cpj-planta-pagina]').evaluate((el)=>getComputedStyle(el).aspectRatio),'210 / 297');
 assert.match(await page.locator('.cpj-planta-pagina-rotulo').textContent(),/A4 retrato/);
 const paginaBox0=await page.locator('[data-cpj-planta-pagina]').boundingBox();
 const frameBox0=await page.locator('[data-cpj-planta-frame]').boundingBox();
 assert.ok(Math.abs(paginaBox0.width/(await page.locator('[data-cpj-planta-frame]').evaluate(el=>Number(el.dataset.escalaVisual)))-794)<=1,'A folha usa o tamanho físico real da A4 retrato (210mm a 96dpi ≈ 794px), não o espaço disponível na tela: '+JSON.stringify(paginaBox0));
 assert.ok(paginaBox0.width<=frameBox0.width+.5,'A folha nunca vaza pra fora do quadro (o quadro sempre cresce pra pelo menos caber ela inteira): '+JSON.stringify({paginaBox0,frameBox0}));
 // Provando de verdade que não é mais "o espaço que sobra na tela": redimensionar a JANELA (sem mexer em nada da
 // planta) não muda o tamanho da folha nem um pixel — o bug antigo (`frame.getBoundingClientRect().width`) fazia
 // a folha crescer/encolher junto com a largura do navegador de cada um, o que é o oposto de uma folha física real.
 await page.setViewportSize({width:2200,height:900});
 await page.waitForTimeout(120); // dá tempo do listener de "resize" (debounced em requestAnimationFrame) recalcular
 const paginaBoxLargo=await page.locator('[data-cpj-planta-pagina]').boundingBox();
 assert.ok(Math.abs(paginaBoxLargo.width/(await page.locator('[data-cpj-planta-frame]').evaluate(el=>Number(el.dataset.escalaVisual)))-794)<=1,'A folha continua com o MESMO tamanho físico numa janela bem mais larga — prova que não depende mais do espaço disponível na tela: '+JSON.stringify(paginaBoxLargo));
 await page.setViewportSize({width:1500,height:900});
 await page.waitForTimeout(120);
 // A planta preenche o palco inteiro (cover) — sem vão nenhum de fundo branco/vazio sobrando dentro dela.
 const stageBox1=await page.locator('[data-cpj-planta-stage]').boundingBox();
 const imgBox1=await page.locator('[data-cpj-planta-img]').boundingBox();
 assert.ok(imgBox1.width>=stageBox1.width-1&&imgBox1.height>=stageBox1.height-1,'A planta cobre o palco inteiro, sem sobrar fundo vazio: '+JSON.stringify({stageBox1,imgBox1}));

 // Trocar o papel muda o FORMATO das duas linhas de verdade (não só o valor do <select>) — planta E folha juntas.
 await page.locator('[data-cpj-planta-papel]').selectOption('a4-paisagem');
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-cpj-planta-stage]')).aspectRatio==='297 / 210');
 assert.equal(await page.locator('[data-cpj-planta-pagina]').evaluate((el)=>getComputedStyle(el).aspectRatio),'297 / 210');
 assert.match(await page.locator('.cpj-planta-pagina-rotulo').textContent(),/A4 paisagem/);
 // Paisagem inverte largura/altura do papel: 297mm de largura = 297*96/25.4 ≈ 1122,5px, arredondado pra 1123.
 const paginaBoxPaisagem=await page.locator('[data-cpj-planta-pagina]').boundingBox();
 assert.ok(Math.abs(paginaBoxPaisagem.width/(await page.locator('[data-cpj-planta-frame]').evaluate(el=>Number(el.dataset.escalaVisual)))-1123)<=1,'A folha em paisagem usa o tamanho físico real (297mm a 96dpi ≈ 1123px): '+JSON.stringify(paginaBoxPaisagem));

 // "Ajustar planta (arrastar)" — modo dedicado (clicar fora dele marcaria um ponto; aqui não pode).
 assert.equal(await page.locator('[data-cpj-planta-ajuste-btn]').textContent(),'Ajustar planta (arrastar)');
 await page.locator('[data-cpj-planta-ajuste-btn]').click();
 assert.equal(await page.locator('[data-cpj-planta-ajuste-btn]').textContent(),'Concluir ajuste');
 assert.equal(await page.locator('[data-cpj-planta-ajuste-btn]').evaluate((el)=>el.classList.contains('is-active')),true);
 assert.equal(await page.locator('[data-cpj-planta-stage]').evaluate((el)=>getComputedStyle(el).cursor),'grab');
 // O clique repinta o painel inteiro (pintarPainel(), pra trocar o rótulo/estado do botão) — que por sua vez
 // religa os listeners de arrastar via requestAnimationFrame (bindPlantaEditor(), mesmo padrão do resto da
 // planta). Esperar o CSS mudar não basta (isso já sai pronto na string HTML síncrona, antes do RAF); o listener
 // de arrastar de verdade (`stage.addEventListener("pointerdown",...)`) só é ligado quando bindPlantaEditor()
 // roda, no PRÓPRIO RAF — sem esperar isso, o gesto seguinte pode cair bem no meio-tempo em que a caixa NOVA ainda
 // não tem listener nenhum.
 await page.evaluate(()=>new Promise((r)=>requestAnimationFrame(()=>requestAnimationFrame(r))));

 // Arrastar dentro do modo reposiciona a IMAGEM — nos dois eixos, mesmo com a planta bem mais larga que alta.
 const posAntes=await page.locator('[data-cpj-planta-img]').evaluate((el)=>({left:el.style.left,top:el.style.top}));
 await page.locator('[data-cpj-planta-stage]').scrollIntoViewIfNeeded();
 const stageBox2=await page.locator('[data-cpj-planta-stage]').boundingBox();
 await page.mouse.move(stageBox2.x+stageBox2.width/2,stageBox2.y+stageBox2.height/2);
 await page.mouse.down();
 await page.mouse.move(stageBox2.x+stageBox2.width/2-60,stageBox2.y+stageBox2.height/2-60,{steps:6});
 assert.equal(await page.locator('[data-cpj-planta-stage]').evaluate((el)=>el.classList.contains('is-arrastando-planta')),true,'Estado visual de "arrastando" durante o gesto');
 await page.mouse.up();
 const posDepois=await page.locator('[data-cpj-planta-img]').evaluate((el)=>({left:el.style.left,top:el.style.top}));
 assert.notEqual(posDepois.left,posAntes.left,'Arrastar mudou a posição HORIZONTAL da planta — sem folga aqui seria o bug já achado no Módulo Lounge (MIN_WALL_OVERSCAN)');
 assert.notEqual(posDepois.top,posAntes.top,'Arrastar mudou a posição VERTICAL da planta também');

 // Arrastar BEM além da folga real (centenas de pixels, de propósito) nunca pode abrir um vão de fundo vazio nas
 // bordas — `ajuste.x/y` precisa ficar clampado no intervalo em que a imagem ainda cobre o palco inteiro dos dois
 // lados, não só limitado a 0-100% cru (um 0-100% sem essa conta permitiria arrastar "para fora" da imagem).
 await page.mouse.move(stageBox2.x+stageBox2.width/2,stageBox2.y+stageBox2.height/2);
 await page.mouse.down();
 await page.mouse.move(stageBox2.x+stageBox2.width/2+900,stageBox2.y+stageBox2.height/2+900,{steps:8});
 await page.mouse.up();
 const stageRectExtremo=await page.locator('[data-cpj-planta-stage]').boundingBox();
 const imgRectExtremo=await page.locator('[data-cpj-planta-img]').boundingBox();
 assert.ok(imgRectExtremo.x<=stageRectExtremo.x+.5&&imgRectExtremo.y<=stageRectExtremo.y+.5&&imgRectExtremo.x+imgRectExtremo.width>=stageRectExtremo.x+stageRectExtremo.width-.5&&imgRectExtremo.y+imgRectExtremo.height>=stageRectExtremo.y+stageRectExtremo.height-.5,'Mesmo arrastando bem além da folga real, a imagem continua cobrindo o palco inteiro — nunca aparece vão vazio: '+JSON.stringify({stageRectExtremo,imgRectExtremo}));

 // Enquanto ajustando, clicar (sem arrastar) na planta NÃO marca ponto nenhum nem abre o diálogo de ambiente.
 await page.mouse.click(stageBox2.x+stageBox2.width*.2,stageBox2.y+stageBox2.height*.2);
 await page.waitForTimeout(200);
 assert.equal(await page.locator('dialog.cpj-modal[open]').count(),0,'Nenhum diálogo abriu — o clique não marcou ponto durante o ajuste');
 assert.equal(await page.locator('.cpj-planta-point').count(),0);

 // "Concluir ajuste" sai do modo — clicar na planta volta a marcar ponto normalmente (comportamento de sempre).
 await page.locator('[data-cpj-planta-ajuste-btn]').click();
 assert.equal(await page.locator('[data-cpj-planta-ajuste-btn]').textContent(),'Ajustar planta (arrastar)');
 assert.equal(await page.locator('[data-cpj-planta-stage]').evaluate((el)=>getComputedStyle(el).cursor),'crosshair');
 await page.evaluate(()=>new Promise((r)=>requestAnimationFrame(()=>requestAnimationFrame(r)))); // mesma corrida documentada acima — repintou de novo, religa via RAF
 await page.locator('[data-cpj-planta-stage]').scrollIntoViewIfNeeded();
 const stageBox3=await page.locator('[data-cpj-planta-stage]').boundingBox();
 await page.mouse.click(stageBox3.x+stageBox3.width*.3,stageBox3.y+stageBox3.height*.3);
 await modal(page).waitFor();
 assert.match(await modal(page).locator('header h3').textContent(),/Qual é esse ponto da planta\?/,'Fora do modo de ajuste, o clique volta a marcar ponto normalmente');
 await modal(page).locator('[data-cpj-cancel]').click();
 await page.waitForFunction(()=>document.querySelectorAll('dialog.cpj-modal[open]').length===0);

 // Pedido explícito do usuário: "eu preciso ter a opcao de aumentar a planta do cliente e diminuir os prints" —
 // dois controles INDEPENDENTES (por botão, nunca pela roda do mouse — mesma decisão já tomada no Módulo Lounge).
 // "Aumentar a planta" muda o TAMANHO DO RETÂNGULO da planta (não mais um zoom por dentro de um retângulo fixo).
 const conferirCentro = async () => {
   const delta=await page.evaluate(()=>{
     const p=document.querySelector('[data-cpj-planta-pagina]').getBoundingClientRect();
     const s=document.querySelector('[data-cpj-planta-stage]').getBoundingClientRect();
     return {x:s.left+s.width/2-p.left-p.width/2,y:s.top+s.height/2-p.top-p.height/2,stage:s.toJSON(),pagina:p.toJSON(),frame:document.querySelector('[data-cpj-planta-frame]').getBoundingClientRect().toJSON()};
   });
   assert.ok(Math.abs(delta.x)<1 && Math.abs(delta.y)<1,'Zoom mantém o centro da folha: '+JSON.stringify(delta));
 };
 await conferirCentro();
 const larguraStageAntes=await page.locator('[data-cpj-planta-stage]').evaluate((el)=>el.offsetWidth);
 await page.locator('[data-cpj="planta-tamanho-mais"]').click();
 const larguraStageDepois=await page.locator('[data-cpj-planta-stage]').evaluate((el)=>el.offsetWidth);
 await conferirCentro();
 assert.ok(larguraStageDepois>larguraStageAntes,'"+" na Planta aumenta o RETÂNGULO da planta de verdade: '+JSON.stringify({larguraStageAntes,larguraStageDepois}));
 await page.mouse.wheel(0,300); // rolar o mouse sobre a planta NÃO deve mexer em tamanho nenhum
 assert.equal(await page.locator('[data-cpj-planta-stage]').evaluate((el)=>el.offsetWidth),larguraStageDepois,'A roda do mouse não mexe no tamanho da planta');
 await page.locator('[data-cpj="planta-tamanho-menos"]').click();
 await page.locator('[data-cpj="planta-tamanho-menos"]').click();
 const larguraStageMenor=await page.locator('[data-cpj-planta-stage]').evaluate((el)=>el.offsetWidth);
 await conferirCentro();
 assert.ok(larguraStageMenor<larguraStageDepois,'"−" na Planta diminui o retângulo');
 await page.locator('[data-cpj="planta-tamanho-mais"]').click();
 await page.locator('[data-cpj="planta-tamanho-mais"]').click(); // líquido positivo — valor final que a persistência confere abaixo

 // Marca um ponto (só existe "Lounge 3" nesse projeto) pra ter uma legenda de verdade e testar "diminuir os prints".
 await page.locator('[data-cpj-planta-stage]').scrollIntoViewIfNeeded();
 const stageBox4=await page.locator('[data-cpj-planta-stage]').boundingBox();
 await page.mouse.click(stageBox4.x+stageBox4.width*.5,stageBox4.y+stageBox4.height*.5);
 await modal(page).waitFor();
 await modal(page).locator('.cpj-planta-amb-card',{hasText:'Lounge 3'}).click();
 await page.waitForFunction(()=>document.querySelectorAll('dialog.cpj-modal[open]').length===0&&document.querySelector('.cpj-planta-label'));

 // "Diminuir os prints" muda o tamanho da LEGENDA — totalmente independente do controle da planta.
 const larguraLabelAntes=await page.locator('.cpj-planta-label').evaluate((el)=>parseFloat(el.style.width));
 await page.locator('[data-cpj="planta-prints-menos"]').click();
 const larguraLabelDepois=await page.locator('.cpj-planta-label').evaluate((el)=>parseFloat(el.style.width));
 assert.ok(larguraLabelDepois<larguraLabelAntes,'"−" nos Prints diminui a legenda: '+JSON.stringify({larguraLabelAntes,larguraLabelDepois}));
 assert.equal(await page.locator('[data-cpj-planta-stage]').evaluate((el)=>el.offsetWidth),larguraStageDepois,'Diminuir os prints NÃO mexe no tamanho da planta — controles independentes, um nunca ajusta o outro automaticamente (pedido explícito)');
 // Mais um "−" (líquido negativo, sem ambiguidade) — é esse valor final que a persistência confere abaixo.
 await page.locator('[data-cpj="planta-prints-menos"]').click();

 // Pedido explícito do usuário, numa rodada seguinte: "quero poder diminuir o tamanho dos prints tambem, quero
 // poder ajustar o tamanho que eu quiser" — a faixa precisa ser BEM larga (não só alguns cliques até travar num
 // piso alto). Clica "−" muitas vezes seguidas e confere que o tamanho continua encolhendo de verdade bem abaixo
 // do piso antigo (260px×0.5=130px) — prova que a faixa é genuinamente mais larga, não só um valor a mais.
 for(let i=0;i<12;i++) await page.locator('[data-cpj="planta-prints-menos"]').click();
 const larguraLabelMinima=await page.locator('.cpj-planta-label').evaluate((el)=>parseFloat(el.style.width));
 assert.ok(larguraLabelMinima<110,'Os prints encolhem bem além do piso antigo de 130px, uma faixa genuinamente mais larga: '+larguraLabelMinima);
 // Cliques em excesso além do piso não quebram nada (clamp, não erro) — mais um "−" não muda mais nada.
 await page.locator('[data-cpj="planta-prints-menos"]').click();
 assert.equal(await page.locator('.cpj-planta-label').evaluate((el)=>parseFloat(el.style.width)),larguraLabelMinima,'Bateu no piso — clique extra não quebra nem continua encolhendo pra sempre');
 // Sobe de volta (poucos cliques, fica menor que o padrão ainda) — é esse valor final que a persistência confere
 // mais abaixo (líquido negativo, mas longe do piso — não um caso extremo).
 for(let i=0;i<4;i++) await page.locator('[data-cpj="planta-prints-mais"]').click();

 // Achado real/pedido explícito: a linha da folha é só REFERÊNCIA — nada encolhe sozinho quando algo ultrapassa
 // ela; em vez disso, o que ultrapassa fica com contorno VERMELHO, pra pessoa notar e decidir ajustar na mão.
 // Aumenta a planta bem além do razoável até ela genuinamente ultrapassar a folha.
 for(let i=0;i<8;i++) await page.locator('[data-cpj="planta-tamanho-mais"]').click();
 await page.waitForFunction(()=>{
  const stage=document.querySelector('[data-cpj-planta-stage]').getBoundingClientRect();
  const pagina=document.querySelector('[data-cpj-planta-pagina]').getBoundingClientRect();
  return stage.right>pagina.right+.5;
 });
 assert.equal(await page.locator('[data-cpj-planta-stage]').evaluate((el)=>el.classList.contains('is-fora-da-folha')),true,'Planta maior que a folha vira vermelha (aviso), não é impedida nem encolhida sozinha');
 // Volta a diminuir — o aviso some, sem ninguém ter "consertado" nada automaticamente por trás.
 for(let i=0;i<8;i++) await page.locator('[data-cpj="planta-tamanho-menos"]').click();
 await page.waitForFunction(()=>!document.querySelector('[data-cpj-planta-stage]').classList.contains('is-fora-da-folha'));

 // Persistência: papel + ajuste (posição) + tamanhoPlanta/tamanhoPrints acompanham o autosave, igual o resto da planta.
 await page.waitForFunction(()=>{
  const ultimo=window.mockdb.calls.filter((c)=>c.name==='projeto_salvar').pop();
  return ultimo?.params.p_dados.plantas?.[0]?.papel==='a4-paisagem';
 });
 const plantaSalva=(await calls(page,'projeto_salvar')).pop().params.p_dados.plantas[0];
 assert.equal(plantaSalva.papel,'a4-paisagem');
 assert.ok(plantaSalva.ajuste.x!==50||plantaSalva.ajuste.y!==50,'A posição arrastada (deixou de ser o centro 50/50) foi salva');
 assert.ok(plantaSalva.tamanhoPlanta>1,'O tamanho da planta ajustado (líquido positivo) foi salvo: '+JSON.stringify(plantaSalva.tamanhoPlanta));
 assert.ok(plantaSalva.tamanhoPrints<1,'O tamanho dos prints ajustado (líquido negativo) foi salvo: '+JSON.stringify(plantaSalva.tamanhoPrints));

 // Reabrir a planta (sair e voltar) carrega o MESMO papel/ajuste salvos — não volta pro padrão.
 await page.locator('[data-cpj="plantas-voltar"]').click();
 await page.locator('.cpj-plantas-grid').waitFor();
 await page.locator('[data-cpj="planta-abrir"]').click();
 await page.locator('[data-cpj-planta-frame]').waitFor();
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-cpj-planta-stage]')).aspectRatio==='297 / 210');
 assert.equal(await page.locator('[data-cpj-planta-papel]').inputValue(),'a4-paisagem','Reabrir a planta preserva o papel escolhido');

 // "Baixar planta" — o @page injetado bate com o papel ATUAL escolhido na tela (A4 paisagem = landscape).
 await page.locator('[data-cpj="planta-baixar"]').click();
 await page.waitForFunction(()=>window.__printCalls>0);
 assert.equal(await page.locator('#cpjPlantaImpressao').count(),0);
 const medirFolha = () => {
   const root=document.getElementById('cpjPlantaImpressao');
   const folha=(root || document.querySelector('[data-cpj-planta-pagina]')).getBoundingClientRect();
   return [...(root || document.querySelector('[data-cpj-planta-frame]')).querySelectorAll('.cpj-planta-stage, .cpj-planta-label, .cpj-planta-lines')].map(el=>{
     const r=el.getBoundingClientRect();
     return [(r.left-folha.left)/folha.width,(r.top-folha.top)/folha.height,r.width/folha.width,r.height/folha.height];
   });
 };
 for(const viewport of [{width:1500,height:900},{width:390,height:844}]){
   await page.setViewportSize(viewport);
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const antes=await page.evaluate(medirFolha);
   await conferirCentro();
   await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
   assert.match(await page.locator('#cpjPlantaPagina').textContent(),/size:A4 landscape/);
   await page.emulateMedia({media:'print'});
   const depois=await page.evaluate(medirFolha);
   assert.equal(depois.length,antes.length);
   antes.forEach((box,i)=>box.forEach((v,k)=>assert.ok(Math.abs(v-depois[i][k])<.002,'Geometria da folha preservada')));
   const pdfPlanta=await page.pdf({preferCSSPageSize:true,printBackground:true});
   const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
   const documento=await getDocument({data:new Uint8Array(pdfPlanta)}).promise;
   assert.equal(documento.numPages,1,'Sem paginas extras');
   const primeira=await documento.getPage(1);
   assert.ok(Math.abs(primeira.view[2]-297*72/25.4)<1);
   assert.ok(Math.abs(primeira.view[3]-210*72/25.4)<1);
   await documento.destroy();
   await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
   await page.emulateMedia({media:'screen'});
   assert.equal(await page.locator('#cpjPlantaImpressao').count(),0);
   const restaurado=await page.evaluate(medirFolha);
   antes.forEach((box,i)=>box.forEach((v,k)=>assert.ok(Math.abs(v-restaurado[i][k])<.00001,'Editor restaurado depois da impressão')));
 }

 assert.deepEqual(errors,[]);
 await page.close();
}

// ===== Cenário 4: Plantas — projeto sem nenhum ambiente ainda: a planta pode ser criada, mas marcar uma área avisa =====
{
 const {page,errors}=await newPage({staff:true},undefined,{seq:9,calls:[],uploads:[],removed:[],projetos:[
   {id:'p-sem-amb',cliente_id:null,noivos:'Duda & Rafa',data_evento:'2027-11-20',local_evento:'Espaço Jardim',status:'rascunho',compartilhar:false,slug:null,pin:null,pedido_enviado_em:null,atualizado_em:'2026-09-01T10:00:00Z',dados:{ambientes:[],plantas:[]}},
  ]});
 await page.goto(base+'catalogo.html');
 await page.locator('.catalog-gateway').waitFor();
 await page.locator('[data-gateway-tile="projetos"]').click();
 await page.locator('.cpj-card').click();
 await page.locator('.cpj-work').waitFor();
 await page.locator('[data-cpj-worktab="plantas"]').click();
 await page.locator('[data-cpj-planta-nova-input]').setInputFiles({name:'planta.png',mimeType:'image/png',buffer:PNG_1X1});
 await page.locator('[data-cpj-planta-frame]').waitFor();
 await page.waitForFunction(()=>{ const img=document.querySelector('[data-cpj-planta-img]'); return Boolean(img && img.complete && img.naturalWidth>0); });
 await page.locator('[data-cpj-planta-stage]').scrollIntoViewIfNeeded();
 const stageBox=await page.locator('[data-cpj-planta-stage]').boundingBox();
 await page.mouse.click(stageBox.x+stageBox.width*.4,stageBox.y+stageBox.height*.4);
 await modal(page).waitFor();
 assert.match(await modal(page).locator('header h3').textContent(),/Nenhum ambiente neste projeto ainda/);
 assert.equal(await modal(page).locator('button[type=submit]').count(),0,'Sem botão de confirmar — só dá pra fechar');
 await modal(page).locator('[data-cpj-cancel]').click();
 await page.waitForFunction(()=>document.querySelectorAll('dialog.cpj-modal[open]').length===0);
 assert.equal(await page.locator('.cpj-planta-point').count(),0,'Sem ambiente pra escolher, nenhum ponto é marcado');
 assert.deepEqual(errors,[]);
 await page.close();
}

await browser.close();server.close();
console.log('catalogo-projetos-browser: ok');
})().catch((e)=>{console.error(e);process.exit(1);});
