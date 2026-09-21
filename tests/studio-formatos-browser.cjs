const { chromium } = require('playwright');
const express = require('express');
const fs = require('node:fs');
const assert = require('node:assert/strict');

// GLB mínimo mas com UM TRIÂNGULO de verdade (mesmo fixture já usado em
// tests/catalogo-lounge-browser.cjs) — usado só no cenário de prévias
// (6 formatos): o siteglb.glb real (10,6MB) usado pelos outros cenários
// deste arquivo é ótimo pra testar o fluxo normal (1-2 cargas), mas aqui
// seria recarregado do zero 6 VEZES seguidas (renderFormatPreview() não
// tem cache entre chamadas, e THREE.Cache só liga quando o estúdio
// principal abre, o que este cenário evita de propósito) — lento o
// bastante pra estourar timeout de teste sem nenhuma relação com o que
// está sendo verificado (reaproveitar o contexto WebGL, não a velocidade
// de rede).
function fakeGlbTriangle(){
  const json=JSON.stringify({
    asset:{version:"2.0"}, scene:0, scenes:[{nodes:[0]}], nodes:[{mesh:0}],
    meshes:[{primitives:[{attributes:{POSITION:0},indices:1,mode:4}]}],
    buffers:[{byteLength:42}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:36,target:34962},{buffer:0,byteOffset:36,byteLength:6,target:34963}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:"VEC3",max:[1,1,0],min:[0,0,0]},{bufferView:1,componentType:5123,count:3,type:"SCALAR",max:[2],min:[0]}],
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
  jsonChunkHeader.writeUInt32LE(0x4E4F534A,4);
  const binChunkHeader=Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binPadded.length,0);
  binChunkHeader.writeUInt32LE(0x004E4942,4);
  const totalLength=12+8+jsonPadded.length+8+binPadded.length;
  const header=Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67,0);
  header.writeUInt32LE(2,4);
  header.writeUInt32LE(totalLength,8);
  return Buffer.concat([header,jsonChunkHeader,jsonPadded,binChunkHeader,binPadded]);
}

(async () => {
  const app = express();
  app.use(express.static(process.cwd()));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = 'Modulos/Comercial/Catalogo/';
    await page.route('**/catalogo-studio3d.mjs*', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(base + 'catalogo-studio3d.mjs', 'utf8') + '\nwindow.studioTest={studio,addItem,selectObject,toggleGrouping};' }));
    await page.route('**/catalogo-lounge.mjs*', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(base + 'catalogo-lounge.mjs', 'utf8') + '\nwindow.loungeTest={toRuntimeFormat,ensureDefaultSelection,getUI:()=>ui,getScene:()=>lounge};' }));
    await page.route('**/catalogo.html', route => {
      let html = fs.readFileSync(base + 'catalogo.html', 'utf8').replace(/<script(?! type="importmap")[\s\S]*?<\/script>/g, '');
      html += `<script type="module">
        import {initCatalogStudio3D} from './catalogo-studio3d.mjs';
        import {initCatalogLounge,openCatalogLounge} from './catalogo-lounge.mjs';
        window.items=[1,2,3].map(id=>({id:String(id),name:'Mesa '+id,cat:'mesas',subcat:'centro',catLabel:'Mesas',subcatLabel:'Centro',glb:'/siteglb.glb',photo:'',dimensions:{width:1,height:1,depth:1}}));
        window.saved=[];window.calls=[];window.failSave=true;
        const supabase={rpc:async(name,args)=>{window.calls.push({name,args});if(name==='lounge_formato_salvar'){if(window.failSave)return {error:{message:'Falha de teste'}};window.saved.push({id:'saved',nome:args.p_nome,papeis:args.p_papeis,cliente_id:'owner'});return {data:window.saved[0]};}return {data:window.saved};}};
        initCatalogStudio3D({items:window.items,supabase,empresaId:'company',ownerId:'owner',token:'external-token'});
        initCatalogLounge({items:window.items,supabase,empresaId:'company',clienteId:'owner',token:'external-token'});
        window.openLounge=openCatalogLounge;
        document.getElementById('catalogLogin').remove();document.getElementById('catalogStudio').classList.remove('hidden');
      </script>`;
      return route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/${base}catalogo.html`);
    await page.waitForFunction(() => window.studioTest && window.items);
    await page.evaluate(async () => {
      const t = window.studioTest;
      await t.addItem(window.items[0], 0, {position:[2,0,1],rotation:Math.PI/3});
      await t.addItem(window.items[1], 0, {position:[4,.5,2],rotation:-Math.PI/2});
      await t.addItem(window.items[2], 0, {position:[-4,0,-4],rotation:0});
      t.selectObject(t.studio.objects[0]);
    });
    assert.equal(await page.locator('#studioSaveFormatButton').isVisible(), false);
    await page.locator('#studioGroupButton').click();
    await page.evaluate(() => window.studioTest.studio.groupSelection.add(window.studioTest.studio.objects[1]));
    await page.locator('#studioGroupingFinish').click();
    await page.locator('#studioSaveFormatButton').click();
    // Pedido explícito do usuário, com print: "esse modal pode ser bem mais
    // compacto" — só tem kicker+título+descrição+1 campo+botão, não precisa
    // dos mesmos min(1040px,...) que Montagem automática/Trocar item usam.
    const formatDialogBox = await page.locator('#studioFormatDialog').boundingBox();
    assert.ok(formatDialogBox.width < 500, `Diálogo "Salvar formato" ficou compacto (largura=${formatDialogBox.width}px, chegava a ~1040px antes)`);
    await page.locator('#studioFormatName').fill('Bloco de teste');
    await page.screenshot({path:'outputs/studio-salvar-formato.png'});
    await page.locator('#studioFormatForm [type=submit]').click();
    await page.waitForFunction(() => document.getElementById('studioFormatStatus').textContent === 'Falha de teste');
    await page.evaluate(() => { window.failSave = false; });
    await page.locator('#studioFormatForm [type=submit]').click();
    await page.waitForFunction(() => !document.getElementById('studioFormatDialog').open);
    const saved = await page.evaluate(() => window.saved[0]);
    assert.equal(saved.papeis.length, 2);
    assert.deepEqual(saved.papeis.map(p => p.item_id), ['1', '2']);
    assert.equal(saved.papeis[1].position[0] - saved.papeis[0].position[0], 2);
    assert.equal(saved.papeis[1].position[2] - saved.papeis[0].position[2], 1);
    assert.ok(Math.abs(saved.papeis[1].position[1] - .5) < .00001);
    assert.ok(Math.abs(saved.papeis[0].rotation - 60) < .00001);
    assert.equal(await page.evaluate(() => window.studioTest.studio.objects.length), 3);
    assert.equal(await page.evaluate(() => window.calls[0].args.p_token), 'external-token');
    assert.equal(await page.locator('.studio-project-panel,#studioDesignBuild,#studioProjectSave').count(), 0);
    await page.locator('#studioFormatsTab').click();
    await page.locator('[data-studio-format="custom:saved"]').waitFor();
    await page.waitForFunction(() => {
      const image = document.querySelector('[data-studio-format="custom:saved"] img');
      return image?.complete && image.naturalWidth === 480;
    });
    assert.equal(await page.locator('#studioFormatsPanel .studio-library-heading,#studioFormatsList small,#studioFormatsList em').count(), 0);
    assert.equal(await page.locator('#studioItemsPanel').isVisible(), false);
    assert.equal(await page.locator('[data-studio-format="lounge-compacto"]').count(), 1);
    await page.locator('[data-studio-format="custom:saved"]').click();
    await page.waitForFunction(() => window.studioTest.studio.objects.length === 5 && document.getElementById('studioFormatsStatus').textContent.includes('inserido'));
    const inserted = await page.evaluate(() => window.studioTest.studio.objects.slice(3).map(object => ({id:object.userData.item.id, group:object.userData.catalogGroupId,position:object.position.toArray(),rotation:object.rotation.y})));
    assert.deepEqual(inserted.map(object => object.id), ['1','2']);
    assert.equal(inserted[0].group, inserted[1].group);
    assert.ok(Math.abs(inserted[1].position[0] - inserted[0].position[0] - 2) < .00001);
    assert.ok(Math.abs(inserted[0].rotation - Math.PI / 3) < .00001);
    await page.screenshot({path:'outputs/studio-aba-formatos.png'});
    await page.locator('#studioItemsTab').click();
    assert.equal(await page.locator('#studioLibraryList').isVisible(), true);

    // Pedido explícito do usuário: "trocar um item de um formato pronto...
    // alterar esse modelo de sofa por outro sem desfazer o formato" —
    // reforçado depois de ver a 1ª versão (só a peça que estava selecionada
    // no canvas): "eu posso trocar qualquer peça de qualquer lugar do
    // formato, não só o sofá". O diálogo tem 2 colunas: a esquerda lista as
    // 2 peças do bloco inserido acima (item '1' e item '2', ainda agrupadas
    // por catalogGroupId); o teste abre o diálogo pela peça '1' (a que foi
    // clicada no canvas) mas troca a peça '2' — a OUTRA, escolhida só pela
    // coluna da esquerda — provando que o alvo não fica preso à peça que
    // abriu o diálogo. Identifica o bloco pelo `catalogGroupId` (não por
    // índice do array) porque trocarItemSelecionado() reordena studio.objects
    // (a peça nova sempre entra no FIM da lista).
    const groupId = await page.evaluate(() => window.studioTest.studio.objects[3].userData.catalogGroupId);
    await page.evaluate((gid) => {
      const t = window.studioTest;
      t.selectObject(t.studio.objects.find((o) => o.userData.catalogGroupId === gid && o.userData.item.id === '1'));
    }, groupId);
    assert.equal(await page.locator('#studioSwapItemButton').isVisible(), true);
    const beforeSwap = await page.evaluate((gid) => {
      const target = window.studioTest.studio.objects.find((o) => o.userData.catalogGroupId === gid && o.userData.item.id === '2');
      return { x: target.position.x, z: target.position.z, rotation: target.rotation.y };
    }, groupId);
    await page.locator('#studioSwapItemButton').click();
    await page.locator('#studioSwapDialog[open]').waitFor();
    // Coluna da esquerda: as 2 peças do bloco, a que abriu o diálogo (item 1) ativa por padrão.
    assert.equal(await page.locator('#studioSwapCurrentList .studio-library-item').count(), 2, 'Coluna esquerda lista as 2 peças do formato');
    assert.match(await page.locator('#studioSwapDescription').textContent(), /Mesa 1/);
    assert.equal(await page.locator('#studioSwapCurrentList [data-swap-target-index="0"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#studioSwapCurrentList [data-swap-target-index="1"]').getAttribute('aria-pressed'), 'false');
    // Clica na OUTRA peça (item 2) na coluna esquerda — muda o alvo sem trocar nada ainda.
    await page.locator('#studioSwapCurrentList [data-swap-target-index="1"]').click();
    assert.match(await page.locator('#studioSwapDescription').textContent(), /Mesa 2/);
    assert.equal(await page.locator('#studioSwapCurrentList [data-swap-target-index="0"]').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#studioSwapCurrentList [data-swap-target-index="1"]').getAttribute('aria-pressed'), 'true');
    // Agora troca de verdade, pela coluna direita — o diálogo NÃO fecha sozinho (dá pra trocar mais de uma peça na mesma sessão).
    await page.locator('#studioSwapList [data-studio-add="3"]').click();
    await page.waitForFunction((gid) => {
      const members = window.studioTest.studio.objects.filter((o) => o.userData.catalogGroupId === gid);
      return members.some((o) => o.userData.item.id === '3');
    }, groupId);
    assert.equal(await page.locator('#studioSwapDialog[open]').count(), 1, 'Diálogo continua aberto depois da troca');
    // Coluna esquerda já reflete a peça nova no lugar da antiga, ainda marcada como alvo ativo.
    assert.match(await page.locator('#studioSwapCurrentList [data-swap-target-index="1"]').getAttribute('title'), /Mesa 3/);
    assert.equal(await page.locator('#studioSwapCurrentList [data-swap-target-index="1"]').getAttribute('aria-pressed'), 'true');
    await page.locator('#studioSwapClose').click();
    assert.equal(await page.locator('#studioSwapDialog[open]').count(), 0);
    const afterSwap = await page.evaluate((gid) => {
      const t = window.studioTest;
      const members = t.studio.objects.filter((o) => o.userData.catalogGroupId === gid);
      const swapped = members.find((o) => o.userData.item.id === '3');
      const untouched = members.find((o) => o.userData.item.id === '1');
      return {
        total: t.studio.objects.length, memberIds: members.map((o) => o.userData.item.id).sort(),
        x: swapped?.position.x, z: swapped?.position.z, rotation: swapped?.rotation.y,
        untouchedPresent: Boolean(untouched),
      };
    }, groupId);
    assert.equal(afterSwap.total, 5, 'Nenhuma peça a mais/a menos na cena — troca, não adição');
    assert.deepEqual(afterSwap.memberIds, ['1', '3'], 'O bloco continua com 2 peças: a que NUNCA foi tocada (1) e a nova (3) no lugar da 2, escolhida só pela coluna esquerda');
    assert.ok(afterSwap.untouchedPresent, 'A peça que abriu o diálogo (item 1) nunca foi trocada — só a peça escolhida na coluna esquerda foi');
    assert.ok(Math.abs(afterSwap.x - beforeSwap.x) < .00001, 'Posição X preservada');
    assert.ok(Math.abs(afterSwap.z - beforeSwap.z) < .00001, 'Posição Z preservada');
    assert.ok(Math.abs(afterSwap.rotation - beforeSwap.rotation) < .00001, 'Giro preservado');

    await page.evaluate(() => {
      const original = window.saved[0];
      for(let index=0; index<14; index++) window.saved.push({...original,id:'extra-'+index,nome:'Formato extra '+index});
    });
    await page.locator('#studioFormatsTab').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-studio-format]').length === 6);
    assert.equal(await page.locator('#studioFormatsPage').innerText(), '1 de 3');
    const layout = await page.evaluate(() => {
      const sidebar = document.querySelector('.studio-library').getBoundingClientRect();
      const canvas = document.querySelector('.studio-canvas-host').getBoundingClientRect();
      const tabs = document.querySelector('.studio-library-tabs').getBoundingClientRect();
      const toolbar = document.querySelector('.studio-toolbar').getBoundingClientRect();
      const list = document.getElementById('studioFormatsList');
      return {top:(tabs.top+tabs.height/2)-(toolbar.top+toolbar.height/2),bottom:sidebar.bottom-canvas.bottom,overflow:list.scrollHeight>list.clientHeight};
    });
    assert.ok(Math.abs(layout.top)<2 && Math.abs(layout.bottom)<2, JSON.stringify(layout));
    assert.equal(layout.overflow,true);
    await page.locator('#studioFormatsSearch').fill('extra 13');
    assert.equal(await page.locator('[data-studio-format]').count(), 1);
    assert.equal(await page.locator('[data-studio-format="custom:extra-13"]').count(), 1);
    await page.locator('#studioFormatsSearch').fill('inexistente');
    assert.equal(await page.locator('[data-studio-format]').count(), 0);
    await page.locator('#studioFormatsSearch').fill('');
    await page.locator('#studioFormatsNext').click();
    assert.equal(await page.locator('#studioFormatsPage').innerText(), '2 de 3');
    assert.equal(await page.locator('[data-studio-format]').count(), 6);
    await page.evaluate(() => { window.saved = window.saved.slice(0,1); });
    await page.evaluate(async () => {
      document.getElementById('catalogStudio').classList.add('hidden');
      document.getElementById('catalogLounge').classList.remove('hidden');
      await window.openLounge();
    });
    assert.equal(await page.locator('#loungeFormatEditorDialog,[data-lounge-format-new],[data-lounge-format-edit]').count(), 0);
    await page.locator('[data-lounge-format="custom:saved"]').click();
    await page.waitForFunction(() => window.loungeTest.getScene()?.pieces.get('slot:1')?.length === 1);
    const result = await page.evaluate(() => ({selection:window.loungeTest.getUI().selection,positions:[...window.loungeTest.getScene().pieces.entries()].filter(([key])=>key.startsWith('slot:')).map(([,pieces])=>pieces[0].position.toArray())}));
    assert.deepEqual(result.selection, {'slot:0':'1','slot:1':'2'});
    assert.ok(Math.abs(result.positions[1][0] - result.positions[0][0] - 2) < .00001);
    const legacy = await page.evaluate(() => window.loungeTest.toRuntimeFormat({id:'legacy',papeis:[{role:'sub:mesas:centro',x:.5,z:.23,rotation:90}]}).layout());
    assert.deepEqual(legacy['sub:mesas:centro'][0].position, [0,0,0]);
    assert.deepEqual(errors, []);

    // Bug real reportado pelo usuário, com print do erro do console:
    // "Uncaught TypeError: Converting circular structure to JSON ...
    // property 'variantGroup' closes the circle ... at Group.copy
    // (three.module.js) ... at HTMLButtonElement.openSaveFormat" — item
    // com variantes de cor (agruparVariantes() em catalogo.mjs faz
    // `variante.variantGroup = ordenadas`, o PRÓPRIO array que já contém
    // a variante — uma referência circular de propósito, útil em tempo
    // de execução) travava `object.clone(true)` dentro de
    // openSaveFormat() — Three.js clona `userData` via
    // `JSON.parse(JSON.stringify(...))` por baixo dos panos
    // (Object3D.prototype.copy), que nunca serializa uma estrutura
    // circular. A exceção, sem try/catch em volta, cancelava o clique
    // inteiro ANTES do diálogo sequer abrir — sintoma relatado
    // literalmente: "eu clico e não acontece nada". Corrigido medindo o
    // objeto REAL (zera posição/rotação, mede, restaura) em vez de
    // cloná-lo — nunca passa por clone()/copy(), então o problema do
    // userData circular nem chega a existir. Página isolada só pra este
    // cenário, com 2 itens que compartilham o MESMO `variantGroup`
    // circular, exatamente como agruparVariantes() produz de verdade.
    {
      const page2 = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors2 = [];
      page2.on('pageerror', error => errors2.push(error.message));
      await page2.route('**/catalogo-studio3d.mjs*', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(base + 'catalogo-studio3d.mjs', 'utf8') + '\nwindow.studioTest={studio,addItem,selectObject};' }));
      await page2.route('**/catalogo-lounge.mjs*', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(base + 'catalogo-lounge.mjs', 'utf8') }));
      await page2.route('**/catalogo.html', route => {
        let html = fs.readFileSync(base + 'catalogo.html', 'utf8').replace(/<script(?! type="importmap")[\s\S]*?<\/script>/g, '');
        html += `<script type="module">
          import {initCatalogStudio3D} from './catalogo-studio3d.mjs';
          const variantGroup = [];
          const itemA = {id:'va',name:'Sofá Orka Bege',cat:'estofados',subcat:'sofas',catLabel:'Estofados',subcatLabel:'Sofás',glb:'/siteglb.glb',photo:'',dimensions:{width:1,height:1,depth:1},variantGroup};
          const itemB = {id:'vb',name:'Sofá Orka Verde',cat:'estofados',subcat:'sofas',catLabel:'Estofados',subcatLabel:'Sofás',glb:'/siteglb.glb',photo:'',dimensions:{width:1,height:1,depth:1},variantGroup};
          variantGroup.push(itemA, itemB);
          window.items = [itemA, itemB];
          const supabase = { rpc: async () => ({ data: null }) };
          initCatalogStudio3D({ items: window.items, supabase, empresaId: 'company', ownerId: 'owner', token: 'external-token' });
          document.getElementById('catalogLogin').remove();
          document.getElementById('catalogStudio').classList.remove('hidden');
        </script>`;
        return route.fulfill({ contentType: 'text/html', body: html });
      });
      await page2.goto(`http://127.0.0.1:${server.address().port}/${base}catalogo.html`);
      await page2.waitForFunction(() => window.studioTest && window.items);
      await page2.evaluate(async () => {
        const t = window.studioTest;
        await t.addItem(window.items[0], 0, { position: [0, 0, 0], rotation: 0 });
        await t.addItem(window.items[1], 0, { position: [2, 0, 0], rotation: 0 });
        t.selectObject(t.studio.objects[0]);
      });
      await page2.locator('#studioGroupButton').click();
      await page2.evaluate(() => window.studioTest.studio.groupSelection.add(window.studioTest.studio.objects[1]));
      await page2.locator('#studioGroupingFinish').click();
      await page2.locator('#studioSaveFormatButton').click();
      await page2.locator('#studioFormatDialog[open]').waitFor({ timeout: 3000 });
      assert.match(await page2.locator('#studioFormatDescription').textContent(), /2 móveis/, 'Diálogo abre normalmente com itens que têm variantGroup circular');
      assert.deepEqual(errors2, [], 'Nenhum erro no console — object.clone(true) não é mais chamado com userData circular');
      await page2.close();
    }

    // Bug real reportado pelo usuário: "alguns formatos estão aparecendo
    // prévia indisponível, inclusive essa que criei agora" + "esse painel
    // 3d está ficando um painel lento, quando eu movo o 3d ele está indo
    // muito devagar... conseguir rodar em qualquer máquina facilmente".
    // Causa: renderFormatPreview() criava (`new THREE.WebGLRenderer`) e
    // destruía um contexto WebGL NOVO a cada prévia — o navegador tem um
    // teto de contextos simultâneos, e o driver não libera o contexto
    // antigo instantaneamente só por chamar forceContextLoss(); rolar a
    // lista de formatos (o IntersectionObserver dispara uma prévia por
    // cartão) estourava esse teto rápido, fazendo o PRÓXIMO
    // `new THREE.WebGLRenderer` falhar (cai no catch → "Prévia
    // indisponível") e a pressão de memória de vídeo acumulada degradar o
    // resto do WebGL da página, inclusive o renderer principal do estúdio.
    // Corrigido reaproveitando UM contexto só pra todas as prévias — este
    // teste prova isso com 5 formatos custom distintos (+ o embutido
    // "Lounge compacto"): NENHUM formato custom fica com "prévia
    // indisponível" e o número de contextos WebGL criados fica bem menor
    // que o número de formatos (nunca escala 1-pra-1 com eles).
    {
      const page3 = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors3 = [];
      page3.on('pageerror', error => errors3.push(error.message));
      await page3.addInitScript(() => {
        window.__webglContextCreations = 0;
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
          if (typeof type === 'string' && type.toLowerCase().includes('webgl')) window.__webglContextCreations++;
          return original.call(this, type, ...rest);
        };
      });
      await page3.route('**/siteglb.glb', route => route.fulfill({ contentType: 'model/gltf-binary', body: fakeGlbTriangle() }));
      await page3.route('**/catalogo-studio3d.mjs*', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(base + 'catalogo-studio3d.mjs', 'utf8') + '\nwindow.studioTest={studio};' }));
      await page3.route('**/catalogo-lounge.mjs*', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(base + 'catalogo-lounge.mjs', 'utf8') }));
      await page3.route('**/catalogo.html', route => {
        let html = fs.readFileSync(base + 'catalogo.html', 'utf8').replace(/<script(?! type="importmap")[\s\S]*?<\/script>/g, '');
        html += `<script type="module">
          import {initCatalogStudio3D} from './catalogo-studio3d.mjs';
          window.items = [1, 2].map(id => ({id:String(id),name:'Cadeira '+id,cat:'cadeiras',subcat:'auxiliares',catLabel:'Cadeiras',subcatLabel:'Auxiliares',glb:'/siteglb.glb',photo:'',dimensions:{width:1,height:1,depth:1}}));
          window.saved = [1,2,3,4,5].map(n => ({
            id: 'fmt' + n, nome: 'Formato ' + n, cliente_id: null,
            papeis: [
              {version:2, role:'slot:0', item_id:'1', cat:'cadeiras', subcat:'auxiliares', label:'Cadeira 1', position:[0,0,0], rotation:0},
              {version:2, role:'slot:1', item_id:'2', cat:'cadeiras', subcat:'auxiliares', label:'Cadeira 2', position:[1.2,0,0], rotation:0},
            ],
            criado_em: new Date().toISOString(),
          }));
          const supabase = { rpc: async (name) => name === 'lounge_formatos_listar'
            ? { data: window.saved.map(r => ({id:r.id,nome:r.nome,papeis:r.papeis,cliente_id:r.cliente_id,equipe:true,atualizado_em:r.criado_em})), error: null }
            : { data: null, error: null } };
          initCatalogStudio3D({ items: window.items, supabase, empresaId: 'company', ownerId: 'owner', token: 'external-token' });
          document.getElementById('catalogLogin').remove();
          document.getElementById('catalogStudio').classList.remove('hidden');
        </script>`;
        return route.fulfill({ contentType: 'text/html', body: html });
      });
      await page3.goto(`http://127.0.0.1:${server.address().port}/${base}catalogo.html`);
      await page3.waitForFunction(() => window.studioTest && window.items);
      // Nunca abre o painel 3D principal (nenhum addItem chamado) — o único
      // contexto WebGL possível nesta página inteira vem das prévias.
      await page3.locator('#studioFormatsTab').click();
      // 5 formatos custom + o embutido "Lounge compacto" (sempre presente,
      // via BUILTIN_FORMATS) = 6 cartões, cabendo numa página só
      // (FORMATS_PAGE_SIZE=6) sem precisar mexer em paginação aqui — não é
      // o que este teste quer cobrir. "Lounge compacto" É esperado ficar
      // "indisponível" nesta página (fixture só tem "Cadeira", nada que
      // bata com os papéis fixos sofá/poltrona do preset embutido) — as
      // checagens abaixo miram só nos formatos CUSTOM (`custom:`), que são
      // os que de fato usam renderFormatPreview() com itens reais daqui.
      await page3.waitForFunction(() => document.querySelectorAll('[data-studio-format]').length === 6);
      // A lista é rolável e o IntersectionObserver só dispara a prévia de um
      // cartão quando ele entra na tela (rootMargin:120px) — sem rolar, os
      // últimos cartões nunca chegam a pedir a prévia (fica "carregando"
      // pra sempre, não é bug, é lazy-load funcionando). Rola até o fim
      // pra garantir que TODOS os 5 formatos custom peçam a prévia.
      await page3.evaluate(() => { const list = document.getElementById('studioFormatsList'); list.scrollTop = list.scrollHeight; });
      await page3.waitForFunction(() => document.querySelectorAll('.studio-format-preview[aria-busy="true"]').length === 0, null, { timeout: 15000 });
      const previewResult = await page3.evaluate(() => ({
        unavailable: document.querySelectorAll('[data-studio-format^="custom:"] img[alt="Prévia indisponível"]').length,
        loaded: [...document.querySelectorAll('[data-studio-format^="custom:"] .studio-format-preview img:not([hidden])')].map(img => img.naturalWidth > 0),
        contextCreations: window.__webglContextCreations,
      }));
      assert.equal(previewResult.unavailable, 0, 'Nenhuma prévia CUSTOM ficou "indisponível" entre os 5 formatos');
      assert.equal(previewResult.loaded.length, 5, 'As 5 prévias custom carregaram uma imagem de verdade');
      assert.ok(previewResult.loaded.every(Boolean), 'Todas as 5 imagens decodificaram com largura real (nenhuma quebrada)');
      assert.ok(previewResult.contextCreations <= 2, `Só 1 contexto WebGL reaproveitado pras 6 prévias (5 custom + o embutido), não 1 por formato (criados: ${previewResult.contextCreations})`);
      assert.deepEqual(errors3, []);
      await page3.close();
    }

    console.log('PASS: selected block saved with retry, exact furniture and relative transforms restored in compositions, legacy formats supported, saving a block with color-variant items (circular variantGroup) no longer crashes, "Salvar formato" dialog is compact, and format previews reuse a single WebGL context (no more "Prévia indisponível", no per-card context churn).');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
