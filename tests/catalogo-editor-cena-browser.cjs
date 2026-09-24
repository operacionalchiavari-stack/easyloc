const {chromium}=require('playwright');const express=require('express');const fs=require('node:fs');const assert=require('node:assert/strict');
const { installMock } = require('./mock-projetos.cjs');
// Editor de cena do projeto (pedido do usuário): clicar num print/renderização salvo num ambiente abre um modal com o 3D
// daquela composição; trocar um móvel ali tira 1 unidade do que saiu e põe 1 do que entrou no pedido do ambiente; ao
// concluir, a imagem é substituída (print novo; se era de IA, depois vem uma renderização de IA nova). Imagem antiga
// (sem cena guardada) só mostra o aviso. O 3D Livre volta ao estado que tinha.
const PNG_1X1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
function fakeGlbTriangle(){
  const json=JSON.stringify({asset:{version:"2.0"},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1,mode:4}]}],
    buffers:[{byteLength:42}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36,target:34962},{buffer:0,byteOffset:36,byteLength:6,target:34963}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:"VEC3",max:[1,1,0],min:[0,0,0]},{bufferView:1,componentType:5123,count:3,type:"SCALAR",max:[2],min:[0]}]});
  const jb=Buffer.from(json,'utf8');const jp=Buffer.concat([jb,Buffer.alloc((4-(jb.length%4))%4,0x20)]);
  const pos=Buffer.alloc(36);[0,0,0,1,0,0,0,1,0].forEach((v,i)=>pos.writeFloatLE(v,i*4));
  const idx=Buffer.alloc(6);[0,1,2].forEach((v,i)=>idx.writeUInt16LE(v,i*2));
  const bin=Buffer.concat([pos,idx]);const bp=Buffer.concat([bin,Buffer.alloc((4-(bin.length%4))%4,0)]);
  const jh=Buffer.alloc(8);jh.writeUInt32LE(jp.length,0);jh.writeUInt32LE(0x4E4F534A,4);
  const bh=Buffer.alloc(8);bh.writeUInt32LE(bp.length,0);bh.writeUInt32LE(0x004E4942,4);
  const h=Buffer.alloc(12);h.writeUInt32LE(0x46546C67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+jp.length+8+bp.length,8);
  return Buffer.concat([h,jh,jp,bh,bp]);
}
const CENA={version:1,roomWidth:10,roomDepth:10,wallHeight:4,floorFinish:'neutral',gridVisible:true,walls:{},customWalls:[],
  objects:[{itemId:'1',position:[-1.5,0,0],rotation:[0,0,0],scale:[1,1,1]},{itemId:'3',position:[1.5,0,0],rotation:[0,0,0],scale:[1,1,1]}],
  camera:{position:[0,1.2,7],target:[0,.5,0],topView:false}};
const ANTIGOS={render:'company/proj-1/renders/antigo.jpg',cena:'company/proj-1/cenas/antiga.json'};
const seed=(tipo)=>({projetos:[{id:'proj-1',cliente_id:'client',noivos:'Ana e Bruno',data_evento:'2026-09-25',local_evento:'Sítio Vale Verde',status:'pedido_enviado',pedido_enviado_em:'2026-09-20T10:00:00Z',
  pedido_snapshot:{ambientes:[{ambiente:'Lounge',itens:[{item_id:'1',quantidade:2},{item_id:'3',quantidade:1}]}]},
  dados:{ambientes:[{id:'amb1',nome:'Lounge',itens:[{item_id:'1',quantidade:2},{item_id:'3',quantidade:1}],notas:'',renders:[
    {id:'r1',url:'https://fixture/storage/v1/object/public/projetos/'+ANTIGOS.render,path:ANTIGOS.render,origem:tipo==='ia'?'3D Livre':'Print 3D Livre',cena:{url:'https://fixture/cenas/cena1.json',path:ANTIGOS.cena,tipo}},
    {id:'r2',url:'https://fixture/storage/v1/object/public/projetos/company/proj-1/renders/velha.jpg',path:'company/proj-1/renders/velha.jpg',origem:'Print 3D Livre'}]}],
  plantas:[{id:'pl1',nome:'Planta 1',url:'https://fixture/planta.png',path:'company/proj-1/plantas/p.png',mostrarNomes:true,legendas:[{id:'lg1',ambienteId:'amb1',ponto:{x:.5,y:.5}}]}]}}],calls:[],uploads:[],removed:[],seq:2});

// Acha, na tela, um ponto que acerta o móvel (o modelo de teste é um triângulo) e clica de verdade no canvas.
async function clicarNoMovel(page,itemId){
  const pt=await page.evaluate((id)=>{const st=window.studioTest.studio;const {THREE}=st.three;const obj=st.objects.find(o=>String(o.userData.item.id)===id);
    const r=st.renderer.domElement.getBoundingClientRect();const box=new THREE.Box3().setFromObject(obj);const ray=new THREE.Raycaster();
    for(let fx=.1;fx<1;fx+=.1) for(let fy=.1;fy<1;fy+=.1){
      const p=new THREE.Vector3(box.min.x+(box.max.x-box.min.x)*fx,box.min.y+(box.max.y-box.min.y)*fy,(box.min.z+box.max.z)/2).project(st.camera);
      ray.setFromCamera(new THREE.Vector2(p.x,p.y),st.camera);const hit=ray.intersectObjects(st.objects,true)[0];
      let root=hit?.object;while(root&&root.parent&&!st.objects.includes(root)) root=root.parent;
      if(root===obj) return {x:r.left+(p.x*.5+.5)*r.width,y:r.top+(1-(p.y*.5+.5))*r.height};
    }
    return null;},itemId);
  assert.ok(pt,'ponto do móvel '+itemId+' na tela');
  await page.mouse.click(pt.x,pt.y);
}

async function legendaDaPlanta(page){
  await page.locator('[data-cpj-worktab="plantas"]').click();
  await page.locator('[data-cpj="planta-abrir"][data-planta="pl1"]').click();
  await page.locator('.cpj-planta-label[data-legenda="lg1"]').waitFor();
  const r=await page.evaluate(()=>{const l=document.querySelector('.cpj-planta-label[data-legenda="lg1"]');return {src:l.querySelector('img.cpj-planta-label-render')?.getAttribute('src')||'',itens:l.querySelector('.cpj-planta-label-itens')?.textContent||''};});
  // Clique de verdade: com a planta aberta o 'Voltar' global some e não cobre mais o '← Plantas'.
  assert.equal(await page.locator('#catalogGlobalBack').isVisible(),false,'Voltar global escondido com a planta aberta');
  await page.locator('[data-cpj="plantas-voltar"]').click();
  await page.locator('[data-cpj="planta-abrir"]').first().waitFor();
  await page.locator('.cpj-amb-tab',{hasText:'Lounge'}).click();
  await page.locator('[data-cpj-renders]').waitFor();
  return r;
}
(async()=>{
const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
async function abrir(tipo,{staff=false}={}){
  const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/png',body:PNG_1X1}));
  await page.route('https://fixture/modelos/**',r=>r.fulfill({contentType:'model/gltf-binary',body:fakeGlbTriangle()}));
  await page.route('https://fixture/cenas/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(CENA)}));
  await page.route('**/catalogo-studio3d.mjs*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('Modulos/Comercial/Catalogo/catalogo-studio3d.mjs','utf8')+'\nwindow.studioTest={studio,addItem,ensureScene,tirarPrintComposicao,renderWithAI};'}));
  await page.addInitScript((db)=>{ if(!sessionStorage.getItem('mockdb')) sessionStorage.setItem('mockdb',JSON.stringify(db)); },seed(tipo));
  await page.addInitScript(()=>{ try{ localStorage.clear(); }catch{} });
  await page.addInitScript(installMock,{token:!staff,staff,modelos:true});
  // Guarda o conteúdo das cenas enviadas pro Storage e simula a IA.
  await page.addInitScript(()=>{
    const orig=window.supabaseClient.storage.from;window.__cenas=[];
    window.supabaseClient.storage.from=(b)=>{const x=orig(b);const up=x.upload;x.upload=async(p,blob,o)=>{if(o&&o.contentType==='application/json') window.__cenas.push({path:p,cena:JSON.parse(await blob.text())});return up(p,blob,o);};return x;};
    window.__ia=[];
    window.supabaseClient.functions={invoke:async(name,opt)=>{window.__ia.push({name,body:opt.body});await new Promise(r=>setTimeout(r,300));return {data:{providerStatus:'ok',images:[{base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='}]},error:null};}};
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
  await page.locator('[data-gateway-tile="projetos"]').click();
  await page.locator('[data-cpj-open]').first().click();
  await page.locator('.cpj-amb-tab',{hasText:'Lounge'}).click();
  await page.locator('[data-cpj-renders]').waitFor();
  return {page,errors};
}

// --- 1) Print: trocar móveis atualiza o pedido e a imagem ---------------------------------------------------------
{
  const {page,errors}=await abrir('print');
  const figuras=page.locator('.cpj-render');
  const legAntes=await legendaDaPlanta(page);
  assert.match(legAntes.src,/renders%2Fvelha\.jpg|renders\/velha\.jpg/,'Antes: legenda com a última imagem do ambiente');
  assert.match(legAntes.itens,/2× Sofá Um.*Mesa Um/);
  assert.equal(await figuras.nth(0).locator('.cpj-render-3d').textContent(),'Trocar móveis no 3D','Selo na imagem com cena');
  assert.equal(await figuras.nth(1).locator('.cpj-render-3d').count(),0,'Imagem antiga sem selo');
  // Imagem antiga: só o aviso
  await figuras.nth(1).locator('img').click();
  await page.locator('dialog.cpj-modal[open] .cpj-cena-aviso').waitFor();
  assert.match(await page.locator('dialog.cpj-modal[open] .cpj-cena-aviso').textContent(),/gere a imagem de novo no 3D Livre/);
  assert.equal(await page.locator('.cpj-cena-modal').count(),0);
  await page.locator('dialog.cpj-modal[open] [data-cpj-cancel]').click();

  // Abre o 3D da imagem
  await figuras.nth(0).locator('img').click();
  const modal=page.locator('dialog.cpj-cena-modal[open]');await modal.waitFor();
  await page.waitForFunction(()=>!document.querySelector('[data-cena-carregando]')&&window.studioTest.studio.objects.length===2);
  const onde=await page.evaluate(()=>({noModal:Boolean(document.querySelector('.cpj-cena-palco canvas')),noEstudio:Boolean(document.querySelector('#studioCanvasHost canvas')),
    itens:window.studioTest.studio.objects.map(o=>String(o.userData.item.id)).sort(),grade:window.studioTest.studio.grid.visible}));
  assert.deepEqual(onde,{noModal:true,noEstudio:false,itens:['1','3'],grade:false},'Canvas no modal, cena do print carregada, sem grade');
  const caixa=await modal.boundingBox();assert.ok(caixa.width>1200&&caixa.height>800,'Modal grande '+JSON.stringify(caixa)+' '+await page.evaluate(()=>getComputedStyle(document.querySelector('.cpj-cena-modal')).width));
  assert.equal(await page.locator('[data-cena-busca]').isVisible(),false,'Busca só depois de selecionar');
  assert.match(await page.locator('.cpj-cena-trocas').textContent(),/Alterações no pedido.*Nenhuma alteração ainda/s,'Card sempre visível, vazio no começo');

  // Seleciona o Sofá Um (clique de verdade no 3D) e troca pelo Sofá Dois
  await clicarNoMovel(page,'1');
  await page.locator('.cpj-cena-sel-item strong',{hasText:'Sofá Um'}).waitFor();
  assert.equal(await page.locator('.cpj-cena-item.is-atual').textContent().then(t=>t.includes('Sofá Um')),true);
  await page.locator('[data-cena-busca]').fill('dois');
  assert.equal(await page.locator('.cpj-cena-item').count(),1,'Busca filtra o catálogo');
  await page.locator('.cpj-cena-item',{hasText:'Sofá Dois'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.cpj-cena-trocas li').length===1);
  await page.waitForFunction(()=>window.studioTest.studio.objects.map(o=>String(o.userData.item.id)).sort().join()==='2,3');
  // Troca a Mesa Um pelo Sofá Dois: a mesa (1 unidade) sai do pedido
  await clicarNoMovel(page,'3');
  await page.locator('.cpj-cena-sel-item strong',{hasText:'Mesa Um'}).waitFor();
  await page.locator('.cpj-cena-item',{hasText:'Sofá Dois'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.cpj-cena-trocas li').length===2);
  const resumo=await page.evaluate(()=>[...document.querySelectorAll('.cpj-cena-trocas li')].map(li=>[...li.querySelectorAll('.cpj-cena-troca')].map(x=>x.className.replace('cpj-cena-troca ','')+' '+x.querySelector('b').textContent+' '+x.lastElementChild.lastChild.textContent)));
  assert.deepEqual(resumo,[['is-sai − 1 Sofá Um','is-entra + 1 Sofá Dois'],['is-sai − 1 Mesa Um','is-entra + 1 Sofá Dois']],'Alterações no pedido, em ordem');
  assert.equal(await page.locator('.cpj-cena-trocas header span').textContent(),'2 trocas');
  // Em destaque: no topo da coluna, acima do selecionado e da lista, e a lista de móveis continua com espaço
  const pos=await page.evaluate(()=>{const r=e=>document.querySelector(e).getBoundingClientRect();return {t:r('.cpj-cena-trocas'),s:r('.cpj-cena-sel'),l:r('.cpj-cena-lista')};});
  assert.ok(pos.t.bottom<=pos.s.top+1&&pos.s.top<pos.l.top&&pos.l.height>120,'Alterações no topo, lista ainda com espaço '+JSON.stringify(pos));
  assert.ok(pos.t.width>=380,'Coluna mais larga');
  // Pedido na tela por trás (lista de móveis do ambiente) já mudou
  const naTela=await page.evaluate(()=>[...document.querySelectorAll('[data-cpj-panel] [data-pa-item]')].map(tr=>tr.dataset.paItem+':'+(tr.querySelector('[data-cpj-qtd-input]')?.value||tr.querySelector('.pa-quantidade b')?.textContent)));
  assert.deepEqual(naTela.sort(),['1:1','2:2'],'Pedido do ambiente: 1 Sofá Um, 2 Sofá Dois, Mesa Um removida');

  // Concluir: imagem e cena novas no lugar das antigas, 3D Livre de volta
  await page.locator('[data-cena-concluir]').click();
  await page.waitForFunction(()=>!document.querySelector('.cpj-cena-modal'));
  await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('mockdb')).projetos[0].dados.ambientes[0].renders[0].path!=='company/proj-1/renders/antigo.jpg');
  await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('mockdb')).removed.length>=2);
  const depois=await page.evaluate(()=>{const db=JSON.parse(sessionStorage.getItem('mockdb'));const amb=db.projetos[0].dados.ambientes[0];
    return {itens:Object.fromEntries(amb.itens.map(i=>[i.item_id,i.quantidade])),r1:amb.renders[0],ordem:amb.renders.map(r=>r.id),uploads:db.uploads.map(u=>u.path+'|'+u.type),removed:db.removed,
      cenas:window.__cenas,canvasEstudio:Boolean(document.querySelector('#studioCanvasHost canvas')),objetosEstudio:window.studioTest.studio.objects.length};});
  assert.deepEqual(depois.itens,{'1':1,'2':2},'Pedido salvo');
  assert.deepEqual(depois.ordem,['r1','r2'],'Imagem continua na mesma posição');
  assert.match(depois.r1.path,/^company\/proj-1\/renders\/.+\.jpg$/);assert.match(depois.r1.url,new RegExp(depois.r1.path.replace(/\//g,'\\/')));
  assert.match(depois.r1.cena.path,/^company\/proj-1\/cenas\/.+\.json$/);assert.equal(depois.r1.cena.tipo,'print');
  assert.ok(depois.uploads.some(u=>/renders\/.+\.jpg\|image\/jpeg$/.test(u))&&depois.uploads.some(u=>/cenas\/.+\.json\|application\/json$/.test(u)),'Sobe imagem e cena');
  assert.deepEqual(depois.removed.sort(),[ANTIGOS.cena,ANTIGOS.render].sort(),'Arquivos antigos removidos');
  const cenaNova=depois.cenas.find(c=>c.path===depois.r1.cena.path).cena;
  assert.deepEqual(cenaNova.objects.map(o=>o.itemId).sort(),['2','2'],'Cena nova guardada com os móveis trocados');
  assert.ok(depois.canvasEstudio,'Canvas voltou pro 3D Livre');assert.equal(depois.objetosEstudio,0,'3D Livre voltou ao estado de antes (vazio)');
  await page.locator('.catalog-notification',{hasText:'Pedido e imagem atualizados'}).waitFor();
  // Planta: a legenda do ambiente passa a mostrar o print editado e os móveis novos (pedido do usuário)
  const legDepois=await legendaDaPlanta(page);
  assert.ok(legDepois.src.includes(depois.r1.path),'Legenda com o print editado: '+legDepois.src);
  assert.match(legDepois.itens,/Sofá Um.*2× Sofá Dois/);assert.doesNotMatch(legDepois.itens,/Mesa Um/);
  // Pedido já enviado: aviso de alteração depois do envio
  await page.locator('button.cpj-status[data-cpj-ver-pedido]').first().click();
  await page.locator('dialog.cpj-modal[open] .cpj-banner-warn',{hasText:'alterado depois do envio'}).waitFor();
  await page.locator('dialog.cpj-modal[open] [data-cpj-cancel]').click();
  assert.deepEqual(errors,[]);
  await page.close();
}

// --- 2) Renderização de IA: print na hora, IA nova em seguida ---------------------------------------------------------
{
  const {page,errors}=await abrir('ia',{staff:true});
  await page.locator('.cpj-render').nth(0).locator('img').click();
  await page.locator('dialog.cpj-cena-modal[open]').waitFor();
  await page.waitForFunction(()=>!document.querySelector('[data-cena-carregando]')&&window.studioTest.studio.objects.length===2);
  await clicarNoMovel(page,'1');
  await page.locator('.cpj-cena-sel-item strong',{hasText:'Sofá Um'}).waitFor();
  await page.locator('.cpj-cena-item',{hasText:'Sofá Dois'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.cpj-cena-trocas li').length===1);
  await page.keyboard.press('Escape'); // Esc também conclui (a troca já foi feita no pedido)
  await page.waitForFunction(()=>!document.querySelector('.cpj-cena-modal'));
  await page.waitForFunction(()=>window.__ia.length===1);
  const ia=await page.evaluate(()=>window.__ia[0]);
  assert.equal(ia.name,'studio-ai-engine');
  assert.deepEqual(ia.body.scene.objects.map(o=>String(o.itemId)).sort(),['2','3'],'IA recebe a cena editada');
  assert.match(ia.body.scene.preview,/^data:image\/png/);
  await page.locator('.catalog-notification',{hasText:'Renderização atualizada'}).waitFor();
  const fim=await page.evaluate(()=>{const db=JSON.parse(sessionStorage.getItem('mockdb'));const amb=db.projetos[0].dados.ambientes[0];
    return {itens:Object.fromEntries(amb.itens.map(i=>[i.item_id,i.quantidade])),r1:amb.renders[0],uploads:db.uploads.filter(u=>u.path.includes('/renders/')).length,removed:db.removed};});
  assert.deepEqual(fim.itens,{'1':1,'3':1,'2':1},'1 Sofá Um sai, 1 Sofá Dois entra');
  assert.equal(fim.r1.cena.tipo,'ia','Continua sendo uma imagem de IA');assert.equal(fim.r1.origem,'3D Livre');
  assert.equal(fim.uploads,2,'Print provisório + imagem da IA');
  assert.ok(fim.removed.some(p=>/renders\/.+\.jpg$/.test(p)&&p!==ANTIGOS.render),'Print provisório removido quando a IA chegou');
  assert.deepEqual(errors,[]);
  await page.close();
}

// --- 3) Celular: modal ocupa a tela, 3D em cima e lista embaixo ------------------------------------------------------
{
  const {page,errors}=await abrir('print');
  await page.setViewportSize({width:390,height:844});
  await page.locator('.cpj-render').nth(0).locator('img').click();
  await page.waitForFunction(()=>!document.querySelector('[data-cena-carregando]')&&window.studioTest.studio.objects.length===2);
  const g=await page.evaluate(()=>{const r=e=>document.querySelector(e).getBoundingClientRect();return {m:r('.cpj-cena-modal'),p:r('.cpj-cena-palco'),l:r('.cpj-cena-lado'),sw:document.documentElement.scrollWidth};});
  assert.ok(g.m.width<=390&&g.p.height>200&&g.l.top>=g.p.bottom-1,'3D em cima, lista embaixo');
  await page.locator('[data-cena-concluir]').click();
  await page.waitForFunction(()=>!document.querySelector('.cpj-cena-modal'));
  assert.deepEqual(errors,[]);
  await page.close();
}
// --- 4) 3D Livre com móveis: volta intacto depois do modal ------------------------------------------------------------
// --- 5) Salvar um print no projeto guarda a cena junto ------------------------------------------------------------------
{
  const {page,errors}=await abrir('print');
  await page.evaluate(async()=>{const st=window.studioTest.studio;await window.studioTest.ensureScene();
    const o=await window.studioTest.addItem(st.items.find(i=>String(i.id)==='3'));o.position.set(.7,o.position.y,-.4);o.rotation.y=.5;});
  const antes=await page.evaluate(()=>window.studioTest.studio.objects.map(o=>[String(o.userData.item.id),+o.position.x.toFixed(2),+o.rotation.y.toFixed(2)]));
  await page.locator('.cpj-render').nth(0).locator('img').click();
  await page.waitForFunction(()=>!document.querySelector('[data-cena-carregando]')&&window.studioTest.studio.objects.length===2);
  await page.locator('[data-cena-concluir]').click(); // sem trocas: nada é enviado
  await page.waitForFunction(()=>!document.querySelector('.cpj-cena-modal')&&document.querySelector('#studioCanvasHost canvas'));
  await page.waitForFunction(()=>window.studioTest.studio.objects.length===1);
  const depois=await page.evaluate(()=>({objs:window.studioTest.studio.objects.map(o=>[String(o.userData.item.id),+o.position.x.toFixed(2),+o.rotation.y.toFixed(2)]),uploads:JSON.parse(sessionStorage.getItem('mockdb')).uploads.length}));
  assert.deepEqual(depois.objs,antes,'3D Livre volta com os móveis, posição e giro de antes');
  assert.equal(depois.uploads,0,'Fechar sem trocar não envia nada');
  // Print salvo no projeto leva a cena
  await page.evaluate((cena)=>{const img=document.getElementById('studioResultImage');img.src='https://fixture/novo-print.png';
    window.catalogRegisterRenderItems(img.src,[{itemId:'1',itemName:'Sofá Um'}],{tipo:'print',snapshot:cena});
    document.getElementById('studioResultDialog').showModal();},CENA);
  await page.locator('#studioResultDialog [data-projeto-save-render]').click();
  await page.locator('dialog.cpj-modal[open] button[type="submit"]').click();
  await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('mockdb')).projetos[0].dados.ambientes[0].renders.length===3);
  const salvo=await page.evaluate(()=>({r:JSON.parse(sessionStorage.getItem('mockdb')).projetos[0].dados.ambientes[0].renders[2],cenas:window.__cenas}));
  assert.match(salvo.r.cena.path,/^company\/proj-1\/cenas\/.+\.json$/);assert.equal(salvo.r.cena.tipo,'print');
  assert.deepEqual(salvo.cenas.find(c=>c.path===salvo.r.cena.path).cena.objects.map(o=>o.itemId),['1','3'],'Cena do print enviada ao Storage');
  assert.deepEqual(errors,[]);
  await page.close();
}
// --- 6) 3D Livre de verdade: "Tirar print" e "Renderizar com IA" registram a cena, e ela chega ao projeto -------------
{
  const {page,errors}=await abrir('print',{staff:true});
  await page.evaluate(async()=>{const st=window.studioTest.studio;await window.studioTest.ensureScene();await window.studioTest.addItem(st.items.find(i=>String(i.id)==='2'));});
  // Tirar print → Salvar no projeto
  await page.evaluate(()=>window.studioTest.tirarPrintComposicao());
  await page.locator('#studioResultDialog[open]').waitFor();
  assert.equal(await page.locator('#studioResultKicker').textContent(),'Print 3D Livre');
  await page.locator('#studioResultDialog [data-projeto-save-render]').click();
  await page.locator('dialog.cpj-modal[open] button[type="submit"]').click();
  await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('mockdb')).projetos[0].dados.ambientes[0].renders.length===3);
  await page.evaluate(()=>document.getElementById('studioResultDialog').close());
  // Renderizar com IA → Ver resultado → Salvar no projeto
  await page.evaluate(()=>window.studioTest.renderWithAI());
  await page.waitForFunction(()=>window.__ia.length===1);
  await page.locator('.catalog-notification',{hasText:'Sua renderização ficou pronta'}).getByRole('button',{name:'Ver resultado'}).click();
  await page.locator('#studioResultDialog[open]').waitFor();
  await page.locator('#studioResultDialog [data-projeto-save-render]').click();
  await page.locator('dialog.cpj-modal[open] button[type="submit"]').click();
  await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('mockdb')).projetos[0].dados.ambientes[0].renders.length===4);
  const r=await page.evaluate(()=>{const rs=JSON.parse(sessionStorage.getItem('mockdb')).projetos[0].dados.ambientes[0].renders;return {print:rs[2],ia:rs[3],cenas:window.__cenas,ia0:window.__ia[0]};});
  assert.equal(r.print.cena.tipo,'print');assert.equal(r.ia.cena.tipo,'ia');assert.equal(r.ia.origem,'3D Livre');
  for(const x of [r.print,r.ia]) assert.deepEqual(r.cenas.find(c=>c.path===x.cena.path).cena.objects.map(o=>o.itemId),['2'],'Cena com o móvel do 3D Livre');
  assert.equal(r.ia0.name,'studio-ai-engine');assert.equal(r.ia0.body.scene.referencePolicy,'furniture_strict_architecture_adaptive','Pedido da IA igual ao de antes');
  assert.match(r.ia0.body.prompt,/fotografia arquitetônica ultrarrealista/);
  assert.deepEqual(errors,[]);
  await page.close();
}
await browser.close();server.close();
console.log('PASS: editor de cena — abre o 3D do print no projeto, troca móveis (−1 sai/+1 entra no pedido), substitui imagem e cena, IA refeita, imagem antiga só com aviso, 3D Livre restaurado');
})().catch(e=>{console.error(e);process.exit(1)});
