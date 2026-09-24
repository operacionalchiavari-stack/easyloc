const { chromium } = require('playwright');
const express = require('express');
const fs = require('node:fs');
const assert = require('node:assert/strict');

// GLB mínimo mas com UM TRIÂNGULO de verdade (mesmo padrão de fixture já usado noutros testes de 3D desta
// suíte) — usado só no cenário de prévias (6 formatos): o siteglb.glb real (10,6MB) usado pelos outros cenários
// deste arquivo é ótimo pra testar o fluxo normal (1-2 cargas), mas aqui seria recarregado do zero 6 VEZES
// seguidas (renderFormatPreview() não tem cache entre chamadas, e THREE.Cache só liga quando o estúdio
// principal abre, o que este cenário evita de propósito) — lento o bastante pra estourar timeout de teste sem
// nenhuma relação com o que está sendo verificado (reaproveitar o contexto WebGL, não a velocidade de rede).
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

// Mock de `supabase.storage` — mesmo desenho de tests/mock-projetos.cjs (upload registra em window.uploads,
// getPublicUrl devolve uma URL fixture previsível). Precisa existir a partir desta sessão: "Salvar formato"
// agora sobe uma foto de capa pro bucket lounge-formatos (ver anexarFotoDoFormato/salvarCapaDoFormato em
// catalogo-studio3d.mjs) — sem isso o mock antigo (só .rpc) faria essa etapa falhar (silenciosamente, mas sem
// provar que o upload de verdade acontece).
const STORAGE_MOCK_SNIPPET = `
  window.uploads = window.uploads || [];
  const __storage = { from: (bucket) => ({
    upload: async (path, blob, options) => { window.uploads.push({ bucket, path, type: options && options.contentType, size: blob.size }); return { data: { path }, error: null }; },
    getPublicUrl: (path) => ({ data: { publicUrl: 'https://fixture/storage/v1/object/public/' + bucket + '/' + path } }),
  }) };
`;

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
    await page.route('**/catalogo-formatos.mjs*', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(base + 'catalogo-formatos.mjs', 'utf8') + '\nwindow.formatosTest={toRuntimeFormat};' }));
    await page.route('**/catalogo.html', route => {
      let html = fs.readFileSync(base + 'catalogo.html', 'utf8').replace(/<script(?! type="importmap")[\s\S]*?<\/script>/g, '');
      html += `<script type="module">
        import {initCatalogStudio3D} from './catalogo-studio3d.mjs';
        window.items=[1,2,3].map(id=>({id:String(id),name:'Mesa '+id,cat:'mesas',subcat:'centro',catLabel:'Mesas',subcatLabel:'Centro',glb:'/siteglb.glb',photo:'',dimensions:{width:1,height:1,depth:1}}));
        window.saved=[];window.calls=[];window.failSave=true;
        ${STORAGE_MOCK_SNIPPET}
        const supabase={storage:__storage,rpc:async(name,args)=>{window.calls.push({name,args});if(name==='lounge_formato_salvar'){if(window.failSave)return {error:{message:'Falha de teste'}};const existente=window.saved.find(f=>f.id===args.p_id);if(existente){Object.assign(existente,{nome:args.p_nome,papeis:args.p_papeis,capa_url:args.p_capa_url||existente.capa_url,capa_path:args.p_capa_path||existente.capa_path,categoria:args.p_categoria||existente.categoria});return {data:existente};}const novo={id:'saved',nome:args.p_nome,papeis:args.p_papeis,cliente_id:'owner',capa_url:args.p_capa_url||null,categoria:args.p_categoria||null,favorito:false};window.saved.push(novo);return {data:novo};}if(name==='lounge_formato_favoritar'){const alvo=window.saved.find(f=>f.id===args.p_id);if(alvo)alvo.favorito=args.p_favorito;return {data:alvo};}return {data:window.saved};}};
        initCatalogStudio3D({items:window.items,supabase,empresaId:'company',ownerId:'owner',token:'external-token'});
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
    // compacto" — só tem kicker+título+descrição+1 campo+categoria+botão, não precisa
    // dos mesmos min(1040px,...) que Montagem automática/Trocar item usam.
    const formatDialogBox = await page.locator('#studioFormatDialog').boundingBox();
    assert.ok(formatDialogBox.width < 500, `Diálogo "Salvar formato" ficou compacto (largura=${formatDialogBox.width}px, chegava a ~1040px antes)`);
    await page.locator('#studioFormatName').fill('Bloco de teste');
    // Categoria é obrigatória em formato NOVO (pedido explícito do usuário) — submeter sem escolher nenhuma
    // bloqueia com uma mensagem clara, sem chamar a RPC de salvar.
    const callsBeforeBlockedSubmit = await page.evaluate(() => window.calls.length);
    await page.locator('#studioFormatForm [type=submit]').click();
    await page.waitForFunction(() => document.getElementById('studioFormatStatus').textContent === 'Escolha uma categoria pro formato.');
    assert.equal(await page.evaluate(() => window.calls.length), callsBeforeBlockedSubmit, 'Submeter sem categoria não chega a chamar a RPC');
    // Digitar uma categoria própria desmarca qualquer chip de sugestão ativo.
    await page.locator('#studioFormatCategoryCustom').fill('Bolo personalizado');
    assert.equal(await page.locator('#studioFormatCategoryChips .is-active').count(), 0, 'Categoria digitada à mão desativa os chips de sugestão');
    await page.locator('#studioFormatCategoryCustom').fill('');
    // Escolhe a categoria por chip de sugestão.
    await page.locator('#studioFormatCategoryChips [data-format-category-chip="Lounge"]').click();
    assert.equal(await page.locator('#studioFormatCategoryChips [data-format-category-chip="Lounge"]').evaluate(el => el.classList.contains('is-active')), true);
    await page.screenshot({path:'outputs/studio-salvar-formato.png'});
    await page.locator('#studioFormatForm [type=submit]').click();
    await page.waitForFunction(() => document.getElementById('studioFormatStatus').textContent === 'Falha de teste');
    await page.evaluate(() => { window.failSave = false; });
    await page.locator('#studioFormatForm [type=submit]').click();
    // Pedido explícito do usuário: "a forma de criar os formatos permanece a mesma isso nao deve ser alterado" —
    // o diálogo fecha e a notificação de sucesso aparece EXATAMENTE como antes, sem nenhum passo novo visível.
    await page.waitForFunction(() => !document.getElementById('studioFormatDialog').open);
    const saved = await page.evaluate(() => window.saved[0]);
    assert.equal(saved.papeis.length, 2);
    assert.deepEqual(saved.papeis.map(p => p.item_id), ['1', '2']);
    assert.equal(saved.papeis[1].position[0] - saved.papeis[0].position[0], 2);
    assert.equal(saved.papeis[1].position[2] - saved.papeis[0].position[2], 1);
    assert.ok(Math.abs(saved.papeis[1].position[1] - .5) < .00001);
    assert.ok(Math.abs(saved.papeis[0].rotation - 60) < .00001);
    assert.equal(saved.categoria, 'Lounge', 'Categoria escolhida por chip foi persistida na 1ª chamada de salvar');
    assert.equal(await page.evaluate(() => window.studioTest.studio.objects.length), 3);
    const saveCall = await page.evaluate(() => window.calls.find(c => c.name === 'lounge_formato_salvar' && !c.args.p_id));
    assert.equal(saveCall.args.p_token, 'external-token');
    assert.equal(saveCall.args.p_categoria, 'Lounge');
    assert.equal(await page.locator('.studio-project-panel,#studioDesignBuild,#studioProjectSave').count(), 0);

    // Pedido explícito do usuário: em vez da lista renderizar o 3D de cada formato ao vivo (pesado, "isso esta
    // pesando o sistema"), uma FOTO da composição é capturada em SILÊNCIO logo depois de "Salvar formato" —
    // sem nenhum passo/espera nova visível (já provado acima: o diálogo fechou e a pessoa já pôde seguir em
    // frente). O upload e a 2ª chamada a lounge_formato_salvar (anexando a foto) acontecem em segundo plano.
    await page.waitForFunction(() => window.saved[0] && window.saved[0].capa_url, null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => window.uploads.length), 1);
    const upload = await page.evaluate(() => window.uploads[0]);
    assert.equal(upload.bucket, 'lounge-formatos');
    assert.equal(upload.path, 'company/saved/capa.jpg', 'Caminho fixo por formato — trocar a foto no futuro sobrescreve, não acumula');
    assert.equal(upload.type, 'image/jpeg', 'JPEG comprimido, não PNG — mesmo padrão de todo upload de foto desta sessão');
    const capaCall = await page.evaluate(() => window.calls.filter(c => c.name === 'lounge_formato_salvar').at(-1));
    assert.equal(capaCall.args.p_id, 'saved', 'A foto é anexada numa 2ª chamada, com o id que a 1ª chamada devolveu');
    assert.equal(capaCall.args.p_capa_path, 'company/saved/capa.jpg');
    assert.match(await page.evaluate(() => window.saved[0].capa_url), /^https:\/\/fixture\/storage\/v1\/object\/public\/lounge-formatos\//);

    // Pedido explícito do usuário: "Formatos" abre um MODAL grande (não mais um painel na barra lateral
    // estreita), com todos os formatos agrupados por categoria.
    await page.locator('#studioFormatsTab').click();
    await page.locator('#studioFormatsBrowseDialog[open]').waitFor();
    await page.locator('[data-studio-format="custom:saved"]').waitFor();
    // Formato JÁ tem foto — mostra ela direto, sem o indicador de carregamento (não precisa renderizar 3D).
    assert.equal(await page.locator('[data-studio-format="custom:saved"] .studio-format-preview[aria-busy]').count(), 0, 'Sem foto ainda seria "aria-busy" — com foto, nem existe esse estado');
    assert.match(await page.locator('[data-studio-format="custom:saved"] img').getAttribute('src'), /lounge-formatos\/company\/saved\/capa\.jpg/);
    // "Itens" continua sempre visível por trás do modal — não é mais escondida ao ver Formatos (só existe um
    // painel de verdade agora, ver comentário no HTML).
    assert.equal(await page.locator('#studioItemsPanel').isVisible(), true);
    assert.equal(await page.locator('[data-studio-format="lounge-compacto"]').count(), 1, 'Formato embutido continua sempre disponível');
    // Agrupado pela categoria escolhida ao salvar ("Lounge") — cada grupo tem um título.
    assert.match(await page.locator('.studio-formats-browse-group:has([data-studio-format="custom:saved"]) h3').textContent(), /Lounge/);
    // "Lounge compacto" (embutido) tem categoria "Lounge" fixa no código — cai no MESMO grupo.
    assert.match(await page.locator('.studio-formats-browse-group:has([data-studio-format="lounge-compacto"]) h3').textContent(), /Lounge/);

    // Favoritar direto do modal, sem editar o formato (pedido explícito: "dentro desse modal nós poderemos
    // selecionar quais são nossos formatos favoritos"). Sem estrela pro embutido (sem recordId).
    assert.equal(await page.locator('.studio-format-browse-card:has([data-studio-format="lounge-compacto"]) [data-format-favorite]').count(), 0, 'Formato embutido não tem onde persistir um favorito');
    const favoriteButton = page.locator('.studio-format-browse-card:has([data-studio-format="custom:saved"]) [data-format-favorite]');
    assert.equal(await favoriteButton.getAttribute('aria-pressed'), 'false');
    assert.equal(await favoriteButton.textContent(), '☆');
    await favoriteButton.click();
    await page.waitForFunction(() => window.calls.some(c => c.name === 'lounge_formato_favoritar' && c.args.p_id === 'saved' && c.args.p_favorito === true));
    assert.equal(await favoriteButton.getAttribute('aria-pressed'), 'true');
    assert.equal(await favoriteButton.textContent(), '★');
    assert.equal(await page.evaluate(() => window.saved.find(f => f.id === 'saved').favorito), true);

    // Fecha o modal — o formato favoritado agora aparece na prateleira, sempre visível ao lado de "Itens"
    // (pedido explícito: "na barra lateral que já existe hoje onde ficam os formatos, ali eu quero que fique
    // somente os formatos favoritos").
    await page.locator('#studioFormatsBrowseClose').click();
    assert.equal(await page.locator('#studioFormatsBrowseDialog[open]').count(), 0);
    assert.equal(await page.locator('#studioFavorites').evaluate(el => el.classList.contains('hidden')), false);
    assert.equal(await page.locator('#studioFavoritesList [data-studio-format="custom:saved"]').count(), 1);
    assert.equal(await page.locator('#studioFavoritesList [data-studio-format="lounge-compacto"]').count(), 0, 'Embutido nunca aparece na prateleira (não pode ser favoritado)');

    // Pedido explícito do usuário: clicar na foto abre um modal pra ESCOLHER os móveis, não insere direto mais
    // — testado aqui clicando a partir da PRATELEIRA de favoritos, o 1º dos 2 pontos de entrada.
    await page.locator('#studioFavoritesList [data-studio-format="custom:saved"]').click();
    await page.locator('#studioFormatApplyDialog[open]').waitFor();
    assert.equal(await page.evaluate(() => window.studioTest.studio.objects.length), 3, 'Só abriu o diálogo — nada foi inserido ainda');
    assert.equal(await page.locator('#studioFormatApplyCurrentList .studio-library-item').count(), 2, 'Uma linha por papel do formato');
    // Seleção padrão reproduz o comportamento de ANTES desta mudança: o item que originalmente foi salvo em
    // cada papel (Mesa 1 no papel 0, Mesa 2 no papel 1) — clicar "Inserir" sem mexer em nada dá o mesmo
    // resultado de sempre.
    assert.match(await page.locator('#studioFormatApplyCurrentList').textContent(), /Mesa 1/);
    assert.match(await page.locator('#studioFormatApplyCurrentList').textContent(), /Mesa 2/);
    // Ativa o 2º papel e confirma que a coluna direita é FILTRADA pelo papel ativo (os 3 fixtures — Mesa 1/2/3
    // — são todos "mesas"/"centro", então os 3 aparecem como opção pra qualquer um dos 2 papéis).
    await page.locator('#studioFormatApplyCurrentList [data-format-apply-target-index="1"]').click();
    assert.equal(await page.locator('#studioFormatApplyList [data-format-apply-choice]').count(), 3);
    assert.equal(await page.locator('#studioFormatApplyList [data-format-apply-choice="2"]').getAttribute('aria-pressed'), null);
    await page.locator('#studioFormatApplyList [data-format-apply-choice="3"]').click();
    // O RÓTULO do papel continua "Mesa 2" (nome de quando o formato foi salvo, não muda) — o que precisa
    // mudar é o item ESCOLHIDO pra esse papel, mostrado depois do " · ".
    assert.match(await page.locator('#studioFormatApplyCurrentList [data-format-apply-target-index="1"]').textContent(), /· Mesa 3/, 'Item escolhido pro papel virou Mesa 3');
    // Fecha e reabre: a escolha feita acima NÃO deveria vazar pra próxima abertura — cada abertura começa do
    // zero, com a seleção padrão de novo (evita "herdar" uma escolha de uma sessão anterior do diálogo). Desta
    // vez reabre pelo MODAL "Todos os formatos" — o 2º ponto de entrada — confirmando que clicar no card
    // fecha o modal de navegação e abre "Escolher os móveis" direto, sem precisar da prateleira.
    await page.locator('#studioFormatApplyClose').click();
    assert.equal(await page.locator('#studioFormatApplyDialog[open]').count(), 0);
    await page.locator('#studioFormatsTab').click();
    await page.locator('#studioFormatsBrowseDialog[open]').waitFor();
    // Escopado ao modal (não à prateleira, que já mostra o mesmo formato favoritado — os dois convivem na tela).
    await page.locator('#studioFormatsBrowseList [data-studio-format="custom:saved"]').click();
    assert.equal(await page.locator('#studioFormatsBrowseDialog[open]').count(), 0, 'Clicar no card fecha o modal de navegação');
    await page.locator('#studioFormatApplyDialog[open]').waitFor();
    assert.match(await page.locator('#studioFormatApplyCurrentList [data-format-apply-target-index="1"]').textContent(), /· Mesa 2/, 'Reabrir volta pra seleção padrão (Mesa 2) — nada ficou "preso" da tentativa anterior (Mesa 3)');
    await page.locator('#studioFormatApplyForm [type=submit]').click();
    await page.waitForFunction(() => window.studioTest.studio.objects.length === 5 && !document.getElementById('studioFormatApplyDialog').open);
    const inserted = await page.evaluate(() => window.studioTest.studio.objects.slice(3).map(object => ({id:object.userData.item.id, group:object.userData.catalogGroupId,position:object.position.toArray(),rotation:object.rotation.y})));
    assert.deepEqual(inserted.map(object => object.id), ['1','2']);
    assert.equal(inserted[0].group, inserted[1].group);
    assert.ok(Math.abs(inserted[1].position[0] - inserted[0].position[0] - 2) < .00001);
    assert.ok(Math.abs(inserted[0].rotation - Math.PI / 3) < .00001);
    await page.screenshot({path:'outputs/studio-aba-formatos.png'});
    // "Itens" nunca fica escondida (só existe um painel de verdade agora) — não precisa clicar em nada pra
    // "voltar" pra ela; o botão inclusive é `disabled` (nada pra alternar).
    assert.equal(await page.locator('#studioLibraryList').isVisible(), true);
    assert.equal(await page.locator('#studioItemsTab').isDisabled(), true);

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
    // (a peça nova sempre entra no FIM da lista). NADA disto tem relação com
    // o diálogo "Escolher os móveis" acima — é a troca de um item JÁ NO CANVAS.
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

    // Formatos extras herdam a MESMA capa_url do original (spread) — todos aparecem como foto direto, sem
    // depender de renderização ao vivo pra este teste de agrupamento/busca (o cenário dedicado a isso é o page3
    // logo abaixo, justamente com formatos SEM foto). Categorias variadas pra provar o agrupamento de verdade —
    // "Outros" pro formato SEM categoria (salvo antes desta feature existir).
    await page.evaluate(() => {
      const original = window.saved.find((format) => format.id === 'saved');
      for(let index=0; index<3; index++) window.saved.push({...original,id:'extra-'+index,nome:'Formato extra '+index,categoria:'Lounge',favorito:false});
      window.saved.push({...original,id:'bar-1',nome:'Estação de drinks',categoria:'Bar',favorito:false});
      window.saved.push({...original,id:'sem-categoria',nome:'Formato antigo',categoria:null,favorito:false});
    });
    await page.locator('#studioFormatsTab').click();
    await page.locator('#studioFormatsBrowseDialog[open]').waitFor();
    // Escopado a #studioFormatsBrowseList em toda esta seção — a prateleira de favoritos (que já mostra
    // "custom:saved") continua visível atrás do modal, então um seletor sem escopo contaria 1 elemento a mais.
    const browseFormats = () => page.locator('#studioFormatsBrowseList [data-studio-format]');
    // saved(1) + extra-0/1/2(3) + bar-1(1) + sem-categoria(1) + lounge-compacto(1) = 7
    await page.waitForFunction(() => document.querySelectorAll('#studioFormatsBrowseList [data-studio-format]').length === 7);
    // Sem paginação — o modal (maior, com scroll próprio) mostra tudo de uma vez, dividido por categoria.
    assert.equal(await page.locator('.studio-formats-pages,#studioFormatsPage,#studioFormatsNext,#studioFormatsPrevious').count(), 0);
    const groupTitles = await page.locator('.studio-formats-browse-group h3').allTextContents();
    // Alfabética, com "Outros" sempre por último (pro formato salvo antes de existir categoria).
    assert.deepEqual(groupTitles.map((title) => title.replace(/\s*\d+$/, '').trim()), ['Bar', 'Lounge', 'Outros']);
    assert.equal(await page.locator('.studio-formats-browse-group:has([data-studio-format="custom:sem-categoria"]) h3').textContent(), 'Outros 1');
    assert.equal(await page.locator('.studio-formats-browse-group:has([data-studio-format="custom:bar-1"]) h3').textContent(), 'Bar 1');
    // Grupo "Lounge" tem 5: saved + extra-0/1/2 + lounge-compacto (embutido).
    assert.equal(await page.locator('.studio-formats-browse-group:has([data-studio-format="custom:extra-0"]) [data-studio-format]').count(), 5);
    // Pesquisa por NOME do formato.
    await page.locator('#studioFormatsBrowseSearch').fill('extra 2');
    assert.equal(await browseFormats().count(), 1);
    assert.equal(await page.locator('#studioFormatsBrowseList [data-studio-format="custom:extra-2"]').count(), 1);
    // Pesquisa por CATEGORIA (não só pelo nome do formato).
    await page.locator('#studioFormatsBrowseSearch').fill('bar');
    assert.equal(await browseFormats().count(), 1);
    assert.equal(await page.locator('#studioFormatsBrowseList [data-studio-format="custom:bar-1"]').count(), 1);
    await page.locator('#studioFormatsBrowseSearch').fill('inexistente');
    assert.equal(await browseFormats().count(), 0);
    assert.match(await page.locator('#studioFormatsBrowseStatus').textContent(), /Nenhum formato encontrado/);
    await page.locator('#studioFormatsBrowseSearch').fill('');
    assert.equal(await browseFormats().count(), 7);
    await page.locator('#studioFormatsBrowseClose').click();
    // toRuntimeFormat() (catalogo-formatos.mjs) precisa continuar convertendo formatos "legados" (salvos antes da
    // versão 2, com posição normalizada 0-1 num diagrama 2D em vez de metros direto) — checado aqui direto na
    // função pura, já que a conversão em si não depende de nenhuma tela específica.
    const legacy = await page.evaluate(() => window.formatosTest.toRuntimeFormat({id:'legacy',papeis:[{role:'sub:mesas:centro',x:.5,z:.23,rotation:90}]}, window.items).layout());
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
    // `JSON.parse(JSON.stringify(...))` por baixo dos panos (ver
    // Object3D.prototype.copy), que nunca serializa uma estrutura
    // circular. A exceção, sem try/catch em volta, cancelava o clique
    // inteiro ANTES do diálogo sequer abrir — sintoma relatado
    // literalmente: "eu clico e não acontece nada". Corrigido medindo o
    // objeto REAL (zera posição/rotação, mede, restaura) em vez de
    // cloná-lo — nunca passa por clone()/copy(), então o problema do
    // userData circular nem chega a existir. Página isolada só pra este
    // cenário, com 2 itens que compartilham o MESMO `variantGroup`
    // circular, exatamente como agruparVariantes() produz de verdade.
    // Não chega a submeter o formulário — não precisa do mock de storage.
    {
      const page2 = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors2 = [];
      page2.on('pageerror', error => errors2.push(error.message));
      await page2.route('**/catalogo-studio3d.mjs*', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(base + 'catalogo-studio3d.mjs', 'utf8') + '\nwindow.studioTest={studio,addItem,selectObject};' }));
      await page2.route('**/catalogo-formatos.mjs*', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(base + 'catalogo-formatos.mjs', 'utf8') }));
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
    // "Lounge compacto"), NENHUM deles com foto ainda (justamente o caso
    // que ainda precisa do fallback ao vivo — ver formatCardMarkup):
    // NENHUM formato custom fica com "prévia indisponível" e o número de
    // contextos WebGL criados fica bem menor que o número de formatos
    // (nunca escala 1-pra-1 com eles). Também prova o AUTO-CURA: depois da
    // prévia renderizar uma vez, a MESMA imagem é subida pro Storage e
    // gravada no formato — pra nunca mais precisar renderizar de novo.
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
      await page3.route('**/catalogo-formatos.mjs*', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(base + 'catalogo-formatos.mjs', 'utf8') }));
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
          window.calls = [];
          ${STORAGE_MOCK_SNIPPET}
          const supabase = { storage: __storage, rpc: async (name, args) => {
            window.calls.push({name, args});
            if(name === 'lounge_formatos_listar') return { data: window.saved.map(r => ({id:r.id,nome:r.nome,papeis:r.papeis,cliente_id:r.cliente_id,equipe:true,capa_url:r.capa_url||null,atualizado_em:r.criado_em})), error: null };
            if(name === 'lounge_formato_salvar'){ const alvo = window.saved.find(f => f.id === args.p_id); if(alvo && args.p_capa_url) alvo.capa_url = args.p_capa_url; return { data: alvo || null, error: null }; }
            return { data: null, error: null };
          } };
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
      await page3.locator('#studioFormatsBrowseDialog[open]').waitFor();
      // 5 formatos custom + o embutido "Lounge compacto" (sempre presente,
      // via BUILTIN_FORMATS) = 6 cartões, todos no modal (sem paginação, mostra tudo de uma vez). "Lounge
      // compacto" É esperado ficar "indisponível" nesta página (fixture só tem "Cadeira", nada que
      // bata com os papéis fixos sofá/poltrona do preset embutido) — as
      // checagens abaixo miram só nos formatos CUSTOM (`custom:`), que são
      // os que de fato usam renderFormatPreview() com itens reais daqui.
      await page3.waitForFunction(() => document.querySelectorAll('[data-studio-format]').length === 6);
      // Nenhum card tem foto ainda — os 6 passam pelo indicador de carregamento (aria-busy fica "false" quando
      // termina, nunca é removido — por isso checar a PRESENÇA do atributo, não o valor "true" específico, que
      // seria uma corrida: o 1º card pode já ter terminado de renderizar antes desta linha rodar).
      assert.equal(await page3.locator('.studio-format-preview[aria-busy]').count(), 6);
      // A lista é rolável e o IntersectionObserver só dispara a prévia de um
      // cartão quando ele entra na tela (rootMargin:120px) — sem rolar, os
      // últimos cartões nunca chegam a pedir a prévia (fica "carregando"
      // pra sempre, não é bug, é lazy-load funcionando). Rola até o fim
      // pra garantir que TODOS os 5 formatos custom peçam a prévia.
      await page3.evaluate(() => { const list = document.getElementById('studioFormatsBrowseList'); list.scrollTop = list.scrollHeight; });
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
      // Auto-cura: a prévia ao vivo que acabou de rodar pros 5 formatos CUSTOM é subida em silêncio pro
      // Storage e gravada de volta no registro (lounge_formato_salvar, 2ª chamada por formato) — pra NUNCA
      // MAIS precisar renderizar o 3D desses formatos ao vivo. "Lounge compacto" (embutido, sem `recordId`
      // — não tem onde persistir) fica de fora de propósito, mesmo tendo tentado renderizar (e falhado, sem
      // móvel compatível) — não pode gerar upload nenhum.
      await page3.waitForFunction(() => window.uploads.length === 5, null, { timeout: 15000 });
      const uploads = await page3.evaluate(() => window.uploads.map(u => u.path).sort());
      assert.deepEqual(uploads, ['company/fmt1/capa.jpg','company/fmt2/capa.jpg','company/fmt3/capa.jpg','company/fmt4/capa.jpg','company/fmt5/capa.jpg']);
      await page3.waitForFunction(() => window.saved.every(f => f.capa_url), null, { timeout: 5000 });
      assert.deepEqual(errors3, []);
      await page3.close();
    }

    console.log('PASS: format cards show a captured cover photo instead of a live 3D preview (captured in silence right after "Salvar formato", same visible steps as before); saving a format now requires a category (chips or free text, blocks submit until chosen, persisted on save); "Formatos" opens a big modal grouped by category with search (name or category) instead of a paginated sidebar panel; a star toggles favorite right from the modal (persisted via lounge_formato_favoritar) and favorited formats show up in an always-visible shelf next to "Itens"; clicking a card — from the shelf or from the modal — closes the modal and opens an "Escolher os móveis" picker (default selection reproduces the old auto-pick, choosing a different model per role changes what gets inserted, reopening resets the draft); legacy formats still convert correctly; a color-variant item with a circular variantGroup no longer crashes the save dialog; "Salvar formato" stays compact; formats without a photo yet fall back to the single-shared-WebGL-context live render and self-heal by uploading that same render back to storage.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
