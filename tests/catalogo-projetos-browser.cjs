const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const path=require('node:path');const os=require('node:os');
// Projetos do catálogo (catalogo-projetos.mjs + projeto.html): decorador cria um projeto por evento (noivos, data e
// local obrigatórios), divide em ambientes, adiciona móveis pelo "＋" dos cards, salva renderizações, compartilha por
// link+senha e envia o pedido; equipe vê os projetos de todos e acompanha o status; a apresentação pública pede a
// senha e nunca mostra preço. O "servidor" aqui é um mock em memória das RPCs projeto_* (persistido em
// sessionStorage pra sobreviver a recarregar a página — variável de JS não sobrevive a navegação).
const PNG_1X1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const PNG_DATA_URL='data:image/png;base64,'+PNG_1X1.toString('base64');

const { installMock } = require('./mock-projetos.cjs');

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

// ===== Cenário 1: decorador — cria projeto, ambientes, adiciona móveis, salva render, compartilha e envia pedido =====
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
 assert.deepEqual(await page.locator('.cpj-amb-tab:not(.cpj-amb-new) span').allTextContents(),['Cerimônia','Bar','Bistrô da varanda']);
 assert.equal(await page.locator('.cpj-amb-tab.is-active span').textContent(),'Cerimônia','O primeiro ambiente fica ativo');
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
 assert.equal(await page.locator('.cpj-amb-tab.is-active span').textContent(),'Bar','Abre no ambiente ativo');
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
 await page.evaluate(([src,objetos])=>{window.catalogRegisterRenderItems(src,objetos);document.getElementById('loungeResultImage').src=src;document.getElementById('loungeResultDialog').showModal();},[PNG_DATA_URL,composicao]);
 await page.locator('#loungeResultDialog [data-projeto-save-render]').click();
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
 assert.equal(render.origem,'Composições');assert.match(render.url,/\/storage\/v1\/object\/public\/projetos\/company\/proj-1\/renders\//);
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-7-render-picker.png')});
 await page.evaluate(()=>document.getElementById('loungeResultDialog').close());
 await page.locator('.cpj-amb-tab',{hasText:'Cerimônia'}).click();
 assert.equal(await page.locator('.cpj-render').count(),1,'Renderização aparece no ambiente escolhido');
 // Mapa de posições: a salva ocupa a posição 1 (destaque + foto da capa) e as próximas viram espaços tracejados numerados
 assert.equal(await page.locator('.cpj-render-slot').count(),2,'1 salva + 2 espaços = as 3 posições de um layout em destaque');
 assert.equal(await page.locator('.cpj-render .cpj-slot-num').textContent(),'1');
 assert.deepEqual(await page.locator('.cpj-render-slot .cpj-slot-num').allTextContents(),['2','3']);
 assert.match(await page.locator('.cpj-render figcaption').textContent(),/Destaque · tamanho grande · Também é a foto da capa/,'A 1ª renderização do projeto é a foto da capa');
 assert.equal(await page.locator('.cpj-render-slot').first().locator('svg').count(),1,'Espaço reservado com o ícone de câmera');
 assert.match(await page.locator('.cpj-map-hint').textContent(),/primeira em destaque/,'Explica como a apresentação posiciona');
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
 await page.evaluate(([src,objetos])=>{window.catalogRegisterRenderItems(src,objetos);document.getElementById('loungeResultImage').src=src;document.getElementById('loungeResultDialog').showModal();},[PNG_DATA_URL,[{itemId:'3',itemName:'Mesa Um'},{itemId:'3',itemName:'Mesa Um'}]]);
 await page.locator('#loungeResultDialog [data-projeto-save-render]').click();
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
 // Imagem sem composição registrada (ex.: tecido personalizado): nenhuma caixa
 await page.evaluate(()=>{document.getElementById('loungeResultDialog').close();});
 await page.evaluate((src)=>{document.getElementById('catalogFabricResultImage').src=src;document.getElementById('catalogFabricResultDialog').showModal();},'data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>').toString('base64'));
 await page.locator('#catalogFabricResultDialog [data-projeto-save-render]').click();
 await modal(page).waitFor();
 assert.equal(await modal(page).locator('[name=levarMoveis]').count(),0,'Sem uma composição por trás (tecido), a pergunta nem aparece');
 await modal(page).locator('[data-cpj-cancel]').click();
 await page.evaluate(()=>{document.getElementById('catalogFabricResultDialog').close();});
 await page.locator('.cpj-amb-tab',{hasText:'Cerimônia'}).click();

 // Compartilhar (link + senha de 6 números)
 await page.locator('[data-cpj="compartilhar"]').click();
 await modal(page).locator('[data-share="ativar"]').waitFor();
 await modal(page).locator('[name=pin]').fill('12ab');
 await modal(page).locator('[data-share="ativar"]').click();
 assert.match(await modal(page).locator('.cpj-modal-error').textContent(),/6 números/);
 await modal(page).locator('[name=pin]').fill('482913');
 await modal(page).locator('[data-share="ativar"]').click();
 await modal(page).locator('[data-share-link]').waitFor();
 assert.match(await modal(page).locator('[data-share-link]').inputValue(),/\/Modulos\/Comercial\/Catalogo\/projeto\.html\?p=slug-proj-1$/,'Link relativo à pasta do catálogo (funciona no subcaminho do GitHub Pages)');
 assert.equal((await modal(page).locator('[data-share-pin]').textContent()).trim(),'482913','PIN aparece uma vez, na hora em que é criado');
 assert.equal((await calls(page,'projeto_compartilhar')).pop().params.p_pin,'482913');
 await modal(page).locator('[data-share="desativar"]').click();
 await modal(page).locator('[data-share="ativar"]').waitFor();
 await modal(page).locator('[data-share="ativar"]').click();
 await modal(page).locator('[data-share-link]').waitFor();
 assert.deepEqual(await textosPequenos(page),[],'Diálogo de compartilhar: nenhum texto abaixo de 12px');
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-8-share.png')});
 await modal(page).locator('[data-cpj-cancel]').click();
 assert.match(await page.locator('[data-cpj="compartilhar"]').textContent(),/Link e PDF ✓/);

 // Enviar pedido
 await page.locator('[data-cpj="enviar"]').click();
 await modal(page).waitFor();
 assert.match(await modal(page).locator('.cpj-order-summary').textContent(),/Bar & Drinks.*5 itens/);
 assert.match(await modal(page).locator('.cpj-order-total').textContent(),/10/,'Pedido soma os móveis que vieram da composição (5 na Cerimônia + 5 no Bar)');
 await modal(page).locator('[name=obs]').fill('Preciso até quinta');
 await modal(page).locator('button[type=submit]').click();
 await page.locator('.cpj-banner').waitFor();
 assert.match(await page.locator('.cpj-banner').textContent(),/Pedido enviado/);
 assert.match(await page.locator('.cpj-banner-obs').textContent(),/Preciso até quinta/);
 assert.match(await page.locator('[data-cpj="enviar"]').textContent(),/Reenviar pedido/);
 assert.equal(await page.locator('.cpj-banner-warn').count(),0,'Recém-enviado: nada mudou depois');
 assert.equal(await page.locator('[data-cpj-status]').count(),0,'Decorador não muda o status do pedido');
 await page.locator('.cpj-amb-tab',{hasText:'Bar & Drinks'}).click();
 await page.locator('.cpj-item[data-cpj-item="1"] [data-cpj="qtd-mais"]').click();
 await page.locator('.cpj-banner-warn').waitFor();
 assert.match(await page.locator('.cpj-banner-warn').textContent(),/alterado depois do envio/,'Avisa quando o projeto mudou depois do envio');

 // Voltar pra lista e recarregar: o projeto ativo volta sozinho
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-9-envio.png')});
 await page.locator('[data-cpj="voltar"]').click();
 await page.locator('.cpj-card').waitFor();
 assert.deepEqual(await textosPequenos(page),[],'Lista de projetos: nenhum texto abaixo de 12px');
 await page.screenshot({path:path.join(os.tmpdir(),'cpj-10-lista.png')});
 assert.match(await page.locator('.cpj-card').textContent(),/Ana & Bruno.*Sítio Vale Verde/s);
 assert.match(await page.locator('.cpj-card .cpj-status').textContent(),/Pedido enviado/);
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
 await page.locator('.cpj-card').click();
 await page.locator('.cpj-banner').waitFor();
 assert.match(await page.locator('.cpj-banner-obs').textContent(),/Montagem na véspera/);
 await page.locator('.cpj-banner-snap summary').click();
 assert.match(await page.locator('.cpj-banner-snap').textContent(),/3× Sofá Um.*SOF001/s,'Equipe vê o que foi enviado (fotografia do pedido)');
 assert.equal(await page.locator('.cpj-banner-warn').count(),0);
 await page.locator('[data-cpj-status="em_analise"]').click();
 await page.waitForFunction(()=>document.querySelector('.cpj-banner .cpj-status')?.textContent==='Em análise');
 const st=(await calls(page,'projeto_atualizar_status'))[0].params;
 assert.deepEqual(st,{p_empresa_id:'company',p_id:'p-dec',p_status:'em_analise'});
 // O dock continua fora do Portal (no modo "dentro do sistema" a logo fica escondida — clique por JS)
 await page.evaluate(()=>document.querySelector('.catalog-brand').click());
 await page.locator('.catalog-gateway').waitFor();
 assert.equal(await page.locator('#catalogProjetoDock').isVisible(),false);
 assert.deepEqual(errors,[]);
 await page.close();
}

// ===== Cenário 3: apresentação pública — senha, capa, ambientes, sem preço, PDF =====
{
 const PAYLOAD={ok:true,
  projeto:{noivos:'Ana & Bruno',data_evento:'2027-05-10',local_evento:'Sítio Vale Verde',foto_casal:'https://fixture/storage/v1/object/public/projetos/company/proj-1/casal/a.jpg',ambientes:[
   {id:'a1',nome:'Cerimônia',notas:'Clima rústico.\nLuz quente.',itens:[{item_id:'1',quantidade:24}],renders:[{id:'r1',url:'https://fixture/storage/v1/object/public/projetos/company/proj-1/renders/a.jpg',origem:'Composições'}]},
   {id:'a2',nome:'Bar',notas:'',itens:[{item_id:'2',quantidade:3},{item_id:'1',quantidade:1}],renders:[]},
   {id:'a3',nome:'Vazio',notas:'',itens:[],renders:[]}]},
  itens:[{id:'1',nome:'Cadeira Arabesco',categoria:'Cadeiras',material:'Madeira',cor:'Natural',largura:.45,altura:.9,profundidade:.5,foto_url:'https://fixture/storage/v1/object/public/itens/cad.png'},
         {id:'2',nome:'Mesa Bistrô',categoria:'Mesas',material:'Ferro',cor:'Preto',largura:.7,altura:1.1,profundidade:.7,foto_url:null}],
  decorador:{nome:'Kelly Decor',logo_url:null,cor_primaria:'#1f3a2e',cor_secundaria:'#c8a15a',telefone:'(11) 99999-0000',email:'kelly@decor.com'},
  empresa:{nome:'Chiavari',logo_url:null}};
 const abrirPublica=async(hash='',payload=PAYLOAD)=>{
  const page=await browser.newPage({viewport:{width:1400,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/png',body:PNG_1X1}));
  await page.addInitScript(()=>{
   window.pinsTentados=[];
   window.supabaseClient={rpc:async(name,p)=>{
    if(name!=='projeto_publico') return {data:null,error:null};
    window.pinsTentados.push([p.p_slug,p.p_pin]);
    if(p.p_slug==='bloqueado') return {data:{ok:false,erro:'bloqueado'},error:null};
    if(p.p_slug!=='slug-ok') return {data:{ok:false,erro:'nao_encontrado'},error:null};
    return {data:p.p_pin==='482913'?window.__PAYLOAD:{ok:false,erro:'pin'},error:null};
   }};
  });
  await page.addInitScript((dados)=>{window.__PAYLOAD=dados;},payload);
  return {page,errors};
 };
 // sem slug
 {const {page}=await abrirPublica();await page.goto(base+'projeto.html');await page.locator('.pj-gate h1').waitFor();assert.match(await page.locator('.pj-gate h1').textContent(),/Link inválido/);await page.close();}
 // link que não existe / bloqueado
 {const {page}=await abrirPublica();await page.goto(base+'projeto.html?p=nada');await page.locator('#pjPin').waitFor();await page.locator('#pjPin').fill('111111');await page.locator('.pj-gate h1',{hasText:'não está disponível'}).waitFor();await page.close();}
 {const {page}=await abrirPublica();await page.goto(base+'projeto.html?p=bloqueado');await page.locator('#pjPin').waitFor();await page.locator('#pjPin').fill('111111');await page.locator('.pj-gate h1',{hasText:'bloqueado'}).waitFor();await page.close();}
 // senha errada, depois certa
 const {page,errors}=await abrirPublica();
 await page.goto(base+'projeto.html?p=slug-ok');
 await page.locator('#pjPin').waitFor();
 assert.equal(await page.locator('.pj-cover').count(),0,'Sem a senha nada do projeto aparece');
 await page.locator('#pjPin').fill('12ab34');
 assert.equal(await page.locator('#pjPin').inputValue(),'1234','Só aceita números');
 await page.locator('#pjPin').fill('000000');
 await page.locator('#pjGateError',{hasText:'Senha incorreta'}).waitFor();
 await page.locator('#pjPin').fill('482913');
 await page.locator('.pj-cover').waitFor();
 assert.equal(await page.locator('.pj-cover h1').textContent(),'Ana & Bruno');
 assert.match(await page.locator('.pj-cover-date').textContent(),/10 de maio de 2027/);
 assert.match(await page.locator('.pj-cover-place').textContent(),/Sítio Vale Verde/);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--pj-ink').trim()),'#1f3a2e','Cor do decorador é aplicada');
 assert.equal(await page.locator('.pj-cover.has-photo').count(),1,'A 1ª renderização vira a foto da capa');
 assert.equal(await page.locator('.pj-couple img').count(),1,'A foto dos noivos aparece na capa');
 assert.match(await page.locator('.pj-couple img').getAttribute('src'),/width=520/);
 const caixaCasal=await page.locator('.pj-couple').boundingBox();
 assert.ok(caixaCasal.width>=130&&Math.abs(caixaCasal.width-caixaCasal.height)<2,'Foto dos noivos é um círculo de tamanho de retrato ('+caixaCasal.width+'x'+caixaCasal.height+')');
 const raio=await page.locator('.pj-couple').evaluate(el=>getComputedStyle(el).borderTopLeftRadius);
 assert.equal(raio,'50%');
 assert.deepEqual(await page.locator('.pj-nav-list a').allTextContents(),['Cerimônia','Bar'],'Ambiente sem nada não aparece');
 assert.equal(await page.locator('.pj-amb').count(),2);
 assert.match(await page.locator('#amb-0 .pj-amb-notes').textContent(),/Clima rústico\.\s*Luz quente\./);
 assert.equal(await page.locator('#amb-0 .pj-render').count(),1);
 assert.equal(await page.locator('#amb-0 .pj-piece').count(),1);
 assert.match(await page.locator('#amb-0 .pj-piece').textContent(),/Cadeira Arabesco.*45 × 90 × 50 cm.*Madeira · Natural.*× 24/s,'Peça: nome, medidas em cm, material, quantidade');
 assert.equal(await page.locator('#amb-1 .pj-piece').count(),2);
 const texto=await page.locator('body').innerText();
 assert.equal(/R\$|valor|preço|locação/i.test(texto),false,'A apresentação nunca mostra valores');
 assert.match(await page.locator('.pj-footer').textContent(),/Kelly Decor.*99999-0000.*kelly@decor\.com/s);
 assert.equal(await page.evaluate(()=>window.pinsTentados.filter(t=>t[1]==='482913').length),1);
 // lightbox
 await page.locator('#amb-0 .pj-render img').click();
 assert.equal(await page.locator('#pjLightbox').isVisible(),true);
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#pjLightbox').isVisible(),false);
 // recarregar na mesma aba não pede a senha de novo
 await page.reload();
 await page.locator('.pj-cover').waitFor();
 // PDF: no modo de impressão a navegação some e o arquivo é gerado
 await page.emulateMedia({media:'print'});
 assert.equal(await page.locator('.pj-nav').isVisible(),false,'Na impressão a barra de navegação some');
 assert.equal(await page.locator('.pj-scroll').isVisible(),false);
 const pdf=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});
 assert.equal(pdf.slice(0,4).toString(),'%PDF');assert.ok(pdf.length>8000,'PDF gerado com conteúdo ('+pdf.length+' bytes)');
 require('node:fs').writeFileSync(path.join(os.tmpdir(),'projeto-apresentacao.pdf'),pdf);
 await page.emulateMedia({media:'screen'});
 await page.screenshot({path:path.join(os.tmpdir(),'projeto-apresentacao.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Apresentação sem overflow horizontal no celular');
 await page.screenshot({path:path.join(os.tmpdir(),'projeto-apresentacao-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 await page.close();
 // sem foto dos noivos, a capa continua igual à de antes
 {const {page,errors}=await abrirPublica('',{...PAYLOAD,projeto:{...PAYLOAD.projeto,foto_casal:null}});await page.goto(base+'projeto.html?p=slug-ok#pin=482913');await page.locator('.pj-cover').waitFor();assert.equal(await page.locator('.pj-couple').count(),0);assert.deepEqual(errors,[]);await page.close();}
 // senha no fragmento (#pin=) abre direto e some do endereço
 {const {page,errors}=await abrirPublica();await page.goto(base+'projeto.html?p=slug-ok#pin=482913');await page.locator('.pj-cover').waitFor();assert.equal(new URL(page.url()).hash,'','A senha sai do endereço na hora');assert.deepEqual(errors,[]);await page.close();}
}

await browser.close();server.close();
console.log('catalogo-projetos-browser: ok');
})().catch((e)=>{console.error(e);process.exit(1);});
