// Filtros da tela "Categorias" (pedido do usuário: "quero colocar alguns filtros dentro do módulo de categorias,
// exemplos de filtro... Material, Estilo e customizáveis, quando fizermos isso aparece todos os itens com esse
// filtro e separados por categoria, então imagina que aparece aparadores, aí em baixo os móveis, aí depois
// armários e por aí vai").
const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c9b79c"/></svg>');
const ST='https://fixture/storage/v1/object/public/itens/';
const mk=(id,produto,categoria,material,extra={})=>({id:String(id),tipo:'Item',produto,categoria,material,cor:'Natural',referencia:'R'+id,largura:1.2,altura:.8,profundidade:.4,foto_url:ST+id+'.png',personalizable:false,itens_fotos:[],itens_modelos_3d:[],...extra});
// Nenhum item com estilo cadastrado (é o retrato do banco hoje): o filtro Estilo NÃO aparece.
const SEM_ESTILO=[
 mk(1,'Aparador Bossa','Aparadores','Madeira'),mk(2,'Aparador Reto','Aparadores','Ferro'),mk(3,'Aparador Alto','Aparadores','Madeira',{personalizable:true}),
 mk(4,'Armário Duplo','Armários','Madeira'),mk(5,'Armário Vidro','Armários','Vidro'),
 mk(6,'Sofá Alex','Móveis','Estofado Tecido',{personalizable:true}),mk(7,'Mesa Jantar','Móveis','Madeira'),
 mk(8,'Cadeira Dora','Cadeiras','MADEIRA',{personalizable:true}),   // outra grafia do mesmo valor: conta junto
];
// Com estilo: um aparador Moderno, uma poltrona em 2 cores (variantes) com estilos diferentes.
const COM_ESTILO=[
 mk(1,'Aparador Bossa','Aparadores','Madeira',{estilo:'Moderno'}),mk(2,'Aparador Reto','Aparadores','Ferro',{estilo:'Clássico'}),
 mk(20,'Poltrona Zeta','Poltronas','Madeira',{cor:'Verde',estilo:'Clássico'}),mk(21,'Poltrona Zeta','Poltronas','Madeira',{cor:'Azul',estilo:'Moderno'}),
 mk(3,'Mesa Jantar','Mesas','Madeira'),
];

(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
async function abrir(itens,vw=1440,vh=900){
  const page=await browser.newPage({viewport:{width:vw,height:vh}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page._errors=errors;
  await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
  await page.addInitScript(({itens})=>{sessionStorage.setItem('catalogo_token','test');window.supabaseClient={rpc:async n=>{
    if(n==='catalogo_validar_sessao')return {data:{valido:true,empresa_id:'company',cliente_id:'client'}};
    if(n==='catalogo_carregar')return {data:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens}};
    if(n==='catalogo_capas_carregar')return {data:{}};
    return {data:null};}};},{itens});
  await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
  await page.locator('.catalog-gateway').waitFor();
  await page.locator('[data-gateway-tile="catalogo"]').click();await page.locator('#catalogGrid .catalog-home-grid').waitFor();
  return page;
}
const titulos=(page)=>page.locator('.catalog-filter-group-title').evaluateAll(els=>els.map(el=>({categoria:el.querySelector('span').textContent.trim(),n:el.querySelector('em').textContent.trim()})));
const nomes=(page)=>page.locator('.catalog-filter-group .catalog-grid-card-name').allTextContents();
const marcar=(page,campo,valor)=>page.locator(`input[data-home-filter-option="${campo}"][value="${valor}"]`).check();

// ===== 1. Material + Personalizáveis (sem nenhum item com estilo) =====
{
  const page=await abrir(SEM_ESTILO);
  const barra=page.locator('.catalog-home-filters');
  assert.equal(await barra.count(),1,'A tela "Categorias" tem a barra de filtros');
  assert.equal(await page.locator('[data-home-filter-trigger="material"]').count(),1,'Filtro Material');
  assert.equal(await page.locator('[data-home-filter-toggle="personalizable"]').count(),1,'Filtro Personalizáveis');
  assert.equal(await page.locator('[data-home-filter-trigger="estilo"]').count(),0,'Estilo não aparece enquanto nenhum item tiver estilo cadastrado (filtro sem opção não vira botão vazio)');
  assert.equal(await page.locator('#catalogGrid .catalog-home-card').count(),4,'Sem filtro: a grade de categorias de sempre (4 categorias)');
  assert.equal(await page.locator('.catalog-filter-group').count(),0,'Sem filtro não há grupos de itens');
  assert.equal(await page.locator('#catalogHomeFilterClear').isVisible(),false,'"Limpar filtros" só aparece com filtro ativo');

  // Painel do Material: opções em ordem alfabética, contagem por opção, grafias diferentes do mesmo valor somadas.
  await page.locator('[data-home-filter-trigger="material"]').click();
  assert.equal(await page.locator('[data-home-filter-trigger="material"]').getAttribute('aria-expanded'),'true');
  const opcoes=await page.locator('[data-home-filter-field="material"] .catalog-filter-option').evaluateAll(els=>els.map(el=>[el.querySelector('.catalog-filter-option-label').textContent.trim(),el.querySelector('.catalog-filter-option-count').textContent.trim()]));
  assert.deepEqual(opcoes,[['Estofado Tecido','1'],['Ferro','1'],['Madeira','5'],['Vidro','1']],'Opções em ordem alfabética com a contagem de itens; "MADEIRA" e "Madeira" são o mesmo valor (5)');

  // Marcar Madeira: itens agrupados por categoria (título + contagem), só as categorias que têm item.
  await marcar(page,'material','madeira');
  assert.equal(await page.locator('#catalogGrid .catalog-home-card').count(),0,'Com filtro, a grade de categorias dá lugar aos itens');
  assert.deepEqual(await titulos(page),[{categoria:'Aparadores',n:'2'},{categoria:'Armários',n:'1'},{categoria:'Móveis',n:'1'},{categoria:'Cadeiras',n:'1'}],'Um título por categoria, com a contagem, só das categorias com itens filtrados (Vidro/Ferro/Estofado ficam de fora)');
  assert.deepEqual((await nomes(page)).map(n=>n.trim().toUpperCase()),['APARADOR BOSSA','APARADOR ALTO','ARMÁRIO DUPLO','MESA JANTAR','CADEIRA DORA'].map(n=>n.trim()),'Os cards de cada categoria vêm logo abaixo do título dela');
  assert.equal(await page.locator('[data-home-filter-trigger="material"]').getAttribute('aria-expanded'),'true','O painel continua aberto pra marcar mais valores');
  assert.equal((await page.locator('#catalogHomeFilterSummary').textContent()).trim(),'5 itens em 4 categorias');
  assert.equal(await page.locator('#catalogHomeFilterClear').isVisible(),true);
  assert.equal((await page.locator('[data-home-filter-trigger="material"] .catalog-filter-count').textContent()).trim(),'1','O botão mostra quantos valores estão marcados');

  // Vários valores do mesmo filtro SOMAM (Madeira OU Ferro).
  await marcar(page,'material','ferro');
  assert.deepEqual((await titulos(page)).find(t=>t.categoria==='Aparadores'),{categoria:'Aparadores',n:'3'},'Madeira OU Ferro: o aparador de ferro entra');

  // Filtros diferentes se COMBINAM (E): Personalizáveis restringe o que sobrou.
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-home-filter-trigger="material"]').getAttribute('aria-expanded'),'false','Esc fecha o painel');
  await page.locator('[data-home-filter-toggle="personalizable"]').click();
  assert.equal(await page.locator('[data-home-filter-toggle="personalizable"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual((await nomes(page)).map(n=>n.trim().toUpperCase()),['APARADOR ALTO','CADEIRA DORA'],'(Madeira OU Ferro) E personalizável');
  assert.deepEqual(await titulos(page),[{categoria:'Aparadores',n:'1'},{categoria:'Cadeiras',n:'1'}]);
  // Contagens respeitam os OUTROS filtros ativos: com "personalizáveis" ligado, Vidro (não personalizável) zera e apaga.
  await page.locator('[data-home-filter-trigger="material"]').click();
  const vidro=page.locator('input[data-home-filter-option="material"][value="vidro"]');
  assert.equal(await vidro.isDisabled(),true,'Opção que zeraria o resultado fica apagada (Vidro não tem item personalizável)');
  assert.equal((await page.locator('input[data-home-filter-option="material"][value="madeira"]').locator('xpath=..').locator('.catalog-filter-option-count').textContent()).trim(),'2','Madeira mostra 2 (os personalizáveis de madeira)');
  // Clicar fora fecha o painel.
  await page.mouse.click(700,700);
  assert.equal(await page.locator('[data-home-filter-trigger="material"]').getAttribute('aria-expanded'),'false','Clicar fora fecha o painel');

  // Abrir um item dos resultados: só os itens FILTRADOS, na ordem das categorias, como uma tela nova ("Resultados").
  await page.locator('[data-grid-item="3"]').click();
  await page.locator('.catalog-product-section').first().waitFor();
  assert.equal((await page.locator('#catalogPageLabel').textContent()).trim(),'Resultados','A tela do item aberto dos filtros se chama "Resultados"');
  assert.deepEqual(await page.locator('.catalog-product-section').evaluateAll(els=>els.map(el=>el.dataset.productId)),['3','8'],'A imersiva tem só os itens filtrados (não a categoria inteira), na ordem das categorias');
  assert.equal(await page.locator('#catalogViewSwitcher').isVisible(),false,'Sem seletor de visualização nos resultados');
  await page.waitForFunction(()=>Math.abs(document.getElementById('produto-3').getBoundingClientRect().top-document.querySelector('.catalog-header').getBoundingClientRect().bottom)<4);
  // Voltar pela linha do tempo: os filtros continuam marcados.
  await page.locator('#catalogTimelinePast [data-timeline-entry]').filter({hasText:/categorias/i}).last().click();
  await page.locator('.catalog-filter-group').first().waitFor();
  assert.deepEqual(await titulos(page),[{categoria:'Aparadores',n:'1'},{categoria:'Cadeiras',n:'1'}],'Voltar de um item mantém os filtros');
  assert.equal(await page.locator('[data-home-filter-toggle="personalizable"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-home-filter-trigger="material"]').getAttribute('aria-expanded'),'false','...e o painel volta fechado');

  // Sem resultado: mensagem + atalho pra limpar.
  await page.locator('[data-home-filter-trigger="material"]').click();
  await page.locator('input[data-home-filter-option="material"][value="madeira"]').uncheck();
  await page.locator('input[data-home-filter-option="material"][value="ferro"]').uncheck();
  await page.keyboard.press('Escape');
  await page.locator('[data-home-filter-toggle="personalizable"]').click();   // desliga: Vidro precisa estar habilitado pra ser marcado
  await page.locator('[data-home-filter-trigger="material"]').click();
  await marcar(page,'material','vidro');
  await page.keyboard.press('Escape');
  await page.locator('[data-home-filter-toggle="personalizable"]').click();   // Vidro E personalizável: nenhum item
  assert.match(await page.locator('#catalogHomeResults').innerText(),/Nenhum item com esses filtros/,'Combinação sem item: mensagem clara');
  await page.locator('.catalog-filter-clear-inline').click();
  assert.equal(await page.locator('#catalogGrid .catalog-home-card').count(),4,'"Limpar filtros" volta pra grade de categorias');
  assert.equal(await page.locator('[data-home-filter-toggle="personalizable"]').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('input[data-home-filter-option="material"]:checked').count(),0,'Nenhuma caixinha fica marcada depois de limpar');

  // Voltar pro Portal recomeça: filtro aplicado não sobrevive.
  await page.locator('[data-home-filter-toggle="personalizable"]').click();
  await page.locator('.catalog-brand').click();
  await page.locator('[data-gateway-tile="catalogo"]').click();
  await page.locator('#catalogGrid .catalog-home-grid').waitFor();
  assert.equal(await page.locator('#catalogGrid .catalog-home-card').count(),4,'Voltar ao Portal zera os filtros');
  assert.deepEqual(page._errors,[],'nenhum erro de página');
  await page.close();
}

// ===== 2. Com estilo cadastrado: o filtro Estilo aparece; variantes (mesma poltrona em 2 cores) contam pelo grupo =====
{
  const page=await abrir(COM_ESTILO);
  assert.equal(await page.locator('[data-home-filter-trigger="estilo"]').count(),1,'Estilo aparece quando algum item tem estilo');
  assert.equal(await page.locator('[data-home-filter-toggle="personalizable"]').count(),0,'Personalizáveis não aparece se nenhum item é personalizável');
  await page.locator('[data-home-filter-trigger="estilo"]').click();
  const opcoes=await page.locator('[data-home-filter-field="estilo"] .catalog-filter-option').evaluateAll(els=>els.map(el=>[el.querySelector('.catalog-filter-option-label').textContent.trim(),el.querySelector('.catalog-filter-option-count').textContent.trim()]));
  assert.deepEqual(opcoes,[['Clássico','2'],['Moderno','2']],'A poltrona em 2 cores é UM item, e aparece nos dois estilos (Clássico e Moderno)');
  await marcar(page,'estilo','moderno');
  assert.deepEqual((await nomes(page)).map(n=>n.trim().toUpperCase()).sort(),['APARADOR BOSSA','POLTRONA ZETA'],'Moderno: o aparador e a poltrona (que tem uma cor de estilo moderno)');
  // Estilo E Material
  await page.keyboard.press('Escape');
  await page.locator('[data-home-filter-trigger="material"]').click();
  assert.equal(await page.locator('input[data-home-filter-option="material"][value="ferro"]').isDisabled(),true,'Moderno E Ferro daria zero itens: a opção Ferro fica apagada');
  assert.equal((await page.locator('input[data-home-filter-option="material"][value="madeira"]').locator('xpath=..').locator('.catalog-filter-option-count').textContent()).trim(),'2','Moderno E Madeira: 2 itens (aparador e poltrona)');
  await marcar(page,'material','madeira');
  assert.deepEqual((await nomes(page)).map(n=>n.trim().toUpperCase()).sort(),['APARADOR BOSSA','POLTRONA ZETA'],'Estilo E Material se combinam');
  await page.close();
}

// ===== 3. Celular: sem rolagem horizontal, painel dentro da tela =====
{
  const page=await abrir(SEM_ESTILO,390,844);
  await page.locator('[data-home-filter-trigger="material"]').click();
  const painel=await page.locator('[data-home-filter-field="material"] .catalog-filter-panel').boundingBox();
  assert.ok(painel.x>=0&&painel.x+painel.width<=390,`celular: o painel cabe na tela (x=${Math.round(painel.x)}, largura=${Math.round(painel.width)})`);
  await marcar(page,'material','madeira');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'celular: sem rolagem horizontal com os resultados filtrados');
  await page.close();
}
await browser.close();server.close();
console.log('PASS: filtros da tela "Categorias" — Material e Personalizáveis (Estilo só aparece com dado), itens filtrados agrupados por categoria (título + contagem), várias opções do mesmo filtro somam e filtros diferentes se combinam, contagens respeitam os outros filtros, "MADEIRA"/"Madeira" contam junto, variantes contam como um item, painel aberto entre marcações e fecha com Esc/clique fora, abrir item mostra só os filtrados ("Resultados") e voltar mantém os filtros, sem resultado tem mensagem, Portal zera, celular sem overflow');
})().catch(e=>{console.error(e);process.exit(1);});
