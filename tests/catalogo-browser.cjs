const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const express = require('express');

function pdfFixture(pages = 1, size = 300) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({length:pages}, (_,i)=>`${3+i} 0 R`).join(' ')}] /Count ${pages} >>`];
  for(let i=0;i<pages;i++) objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size} ${size}] /Resources << >> /Contents ${3+pages} 0 R >>`);
  const stream='0 0 0 RG 30 30 200 200 re S';
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let text='%PDF-1.4\n', offsets=[0];
  objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${o}\nendobj\n`;});
  const xref=Buffer.byteLength(text);
  text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('');
  return Buffer.from(text+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
}

(async()=>{
  const app=express(); app.use(express.static(process.cwd()));
  const server=app.listen(5520,'127.0.0.1');
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[], requests=[];
    await page.addLocatorHandler(page.locator('.catalog-credit-dialog[open]'),async dialog=>{await dialog.locator('[value=confirm]').click();},{noWaitAfter:true});
    page.on('pageerror',e=>errors.push(e.message));
    // Simulate static hosts which cannot serve the old worker module.
    await page.route('**/node_modules/pdfjs-dist/**',r=>r.abort());
    await page.route('**/catalogo-studio3d.mjs*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('Modulos/Comercial/Catalogo/catalogo-studio3d.mjs','utf8')+'\nwindow.studioTest={studio,ensureScene,snapshotProject,selectObject,applyEasyAction,showTopView,showPerspectiveView,toggleGrid};'}));
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    await page.route('**/rest/v1/rpc/*',async r=>{
      const name=r.request().url().split('/').pop();
      const response=name==='catalogo_creditos_saldo'?{saldo:100,custos:{tecido:1,render:1,planta:1,layout:1},historico:[]}:name==='catalogo_login'?{token:'test-session',empresa_id:'company',cliente_id:'decorator'}:name==='catalogo_validar_sessao'?{valido:true,empresa_id:'company',cliente_id:'decorator'}:name==='catalogo_capas_carregar'?{}:{empresa:{nome:'Empresa teste'},decorador:{id:'decorator',nome:'Decoradora teste'},itens:[{id:'fixture',tipo:'Item',produto:'Mesa teste',categoria:'Mesas',largura:1,altura:1,profundidade:1,foto_url:png,personalizable:true,itens_modelos_3d:[{url:'/siteglb.glb',status:'ativo'}],itens_fotos:[]}]};
      await r.fulfill({json:response});
    });
    await page.route('**/functions/v1/studio-ai-engine',async r=>{
      const body=r.request().postDataJSON();requests.push(body);assert.equal(body.expected_cost,1);assert.match(body.request_id,/^[0-9a-f-]{36}$/);
      if(body.scene?.referencePolicy==='fabric_customization') await new Promise(resolve=>setTimeout(resolve,1500));
      assert.equal(body.catalog_token,'test-session');assert.equal(body.empresa_id,'company');
      const response=body.action==='analyze_floor_plan'?{ok:true,analysis:{width_m:10,depth_m:10,bounds:{left:0,top:0,right:1,bottom:1},confidence:1}}:body.action==='plan_layout'?{ok:true,plan:{items:[{itemId:'fixture',zone:'back'}]}}:{ok:true,providerStatus:'ok',images:[{url:png}]};
      await r.fulfill({json:response});
    });
    await page.goto('http://127.0.0.1:5520/Modulos/Comercial/Catalogo/catalogo.html');
    await page.locator('[data-login-exclusivo]').click();await page.locator('#catalogLoginEmail').fill('teste@example.com');
    await page.locator('#catalogLoginPassword').fill('test-password');
    await page.locator('#catalogLoginForm button[type=submit]').click();
    // Primeira tela agora é o Portal (Catálogo/Biblioteca/Módulo 3D) —
    // entra pelo bloco "Catálogo" antes de seguir com o resto do teste.
    await page.locator('[data-gateway-tile="catalogo"]').waitFor();
    await page.locator('[data-gateway-tile="catalogo"]').click();
    // Título "Categorias" da Home foi removido (duplicava o rótulo do
    // cabeçalho, #catalogPageLabel) — espera pela grade de cards em vez
    // dele.
    await page.locator('.catalog-home-grid').waitFor();
    await page.locator('#catalogSearch').fill('inexistente');assert.equal(await page.locator('#catalogEmpty').isVisible(),true);
    await page.locator('#catalogSearch').fill('mesa');assert.equal(await page.locator('.catalog-product-section').isVisible(),true);
    await page.locator('[data-customize-item]').click();
    await page.locator('#catalogFabricInput').setInputFiles({name:'tecido.png',mimeType:'image/png',buffer:Buffer.from(png.split(',')[1],'base64')});
    await page.locator('#catalogFabricCredits strong').first().waitFor();assert.match(await page.locator('#catalogFabricCredits').innerText(),/100/);await page.locator('#catalogCustomizeGenerate').click();assert.equal(await page.locator('.catalog-credit-dialog').count(),0);
    // Pedido explícito do usuário: ao mandar aplicar, o diálogo fecha
    // sozinho (não fica parado mostrando "Criando sua versão…") — quem
    // avisa do andamento agora é só a notificação no canto da tela.
    await page.getByText('Personalização em andamento',{exact:true}).waitFor();
    assert.equal(await page.locator('#catalogCustomizeDialog').isVisible(),false,'Diálogo fecha sozinho ao mandar aplicar');
    assert.equal(await page.locator('#catalogFabricInput').isDisabled(),true);
    // Quarto pedido explícito: "no lugar do círculo girando quero que
    // coloque porcentagem... ele deve ser fiel ao tempo que de fato
    // demora" — sem spinner girando, com um percentual que sobe de
    // verdade com o tempo decorrido. Marca o elemento pra confirmar
    // depois que é o MESMO toast que vira o resultado (não um novo).
    const workingNotification=page.locator('.catalog-notification.is-working');
    await workingNotification.evaluate(el=>{el.dataset.mesmoToast='1';});
    assert.equal(await page.locator('.catalog-notification.is-working .catalog-notification-icon.is-progress').count(),1,'Ícone do toast "working" é o de percentual, não o spinner girando');
    const percentBefore=Number((await page.locator('.catalog-notification-percent').innerText()).replace('%',''));
    await page.waitForTimeout(900);
    const percentAfter=Number((await page.locator('.catalog-notification-percent').innerText()).replace('%',''));
    assert.ok(percentAfter>percentBefore,`Percentual devia subir com o tempo real decorrido (${percentBefore}% -> ${percentAfter}%)`);
    assert.ok(percentAfter<100,'Percentual nunca deve bater 100% sozinho, só quando a foto realmente ficar pronta');
    await page.getByText('Sua personalização ficou pronta',{exact:true}).waitFor();
    // Segundo pedido explícito: a notificação de "pronto" mostra a
    // própria foto do resultado, não só texto.
    const notificationPhoto=page.locator('.catalog-notification.has-photo img.catalog-notification-photo');
    await notificationPhoto.waitFor();
    assert.match(await notificationPhoto.getAttribute('src'),/^data:image\/png/);
    assert.equal(await page.locator('#catalogAiLoading').isVisible(),false);
    assert.equal(await page.locator('.catalog-notification[data-mesmo-toast="1"].has-photo').count(),1,'O MESMO toast que mostrava o percentual vira o resultado com a foto, não um toast novo criado do zero');
    // Terceiro pedido explícito: "Ver resultado" NÃO reabre o diálogo
    // inteiro de "Experimente seu tecido" (upload/dropzone/aplicar não
    // fazem sentido só pra olhar o resultado já pronto) — abre uma
    // prévia minimalista só com a foto grande + link de salvar.
    await page.locator('.catalog-notification-action').click();
    await page.locator('#catalogFabricResultDialog[open]').waitFor();
    assert.equal(await page.locator('#catalogCustomizeDialog').isVisible(),false,'"Ver resultado" não reabre o diálogo de upload');
    assert.equal(await page.locator('#catalogFabricResultTitle').innerText(),'Mesa teste');
    assert.equal(await page.locator('#catalogFabricResultImage').getAttribute('src'),await page.locator('.product-main-image').getAttribute('src'));
    assert.match(await page.locator('#catalogFabricResultDownload').getAttribute('href'),/^data:image\/png/);
    assert.match(await page.locator('#catalogFabricResultDownload').getAttribute('download'),/tecido-personalizado\.png$/);
    await page.locator('#catalogFabricResultClose').click();
    assert.equal(await page.locator('#catalogFabricResultDialog').isVisible(),false);
    assert.equal(requests.at(-1).scene.fabricReference,png);
    // Botão "Painel 3D" do cabeçalho foi removido (pedido explícito do
    // usuário — a única porta de entrada agora é o bloco do Portal);
    // volta pra lá pela logo antes de abrir o Painel 3D. "Módulo 3D" abre
    // o Estúdio de Ambientes ("3D Livre") direto — o mini-menu que existiu
    // entre esta sessão e a anterior (3D Livre/Composições/Em
    // desenvolvimento) foi removido por pedido explícito do usuário
    // (ver CLAUDE.md).
    await page.locator('.catalog-brand').click();
    await page.locator('[data-gateway-tile="modulo3d"]').click();
    await page.waitForFunction(()=>window.studioTest?.studio.renderer);
    await page.locator('#studioPlanInput').setInputFiles({name:'planta.pdf',mimeType:'application/pdf',buffer:pdfFixture()});
    await page.getByText('Planta inteira dimensionada',{exact:true}).waitFor({timeout:30000});
    assert.match(requests.at(-1).plan_image,/^data:image\/jpeg/);
    assert.equal(await page.locator('#studioRoomWidth').inputValue(),'10');
    const pdfChecks=await page.evaluate(async({multi,large})=>{
      const {renderPdfPage}=await import('./catalogo-pdf.mjs');
      const file=bytes=>new File([new Uint8Array(bytes)],'teste.pdf',{type:'application/pdf'});
      const cancelled=await renderPdfPage(file(multi),()=>null);
      let rejected=false;try{await renderPdfPage(file(multi),()=>1.5);}catch{rejected=true;}
      const second=await renderPdfPage(file(multi),()=>2);
      const result=await renderPdfPage(file(large));const bitmap=await createImageBitmap(result);
      return {cancelled,rejected,name:second.name,width:bitmap.width,height:bitmap.height};
    },{multi:[...pdfFixture(2)],large:[...pdfFixture(1,10000)]});
    assert.equal(pdfChecks.cancelled,null);assert.equal(pdfChecks.rejected,true);assert.match(pdfChecks.name,/pagina-2/);assert.ok(Math.max(pdfChecks.width,pdfChecks.height)<=2600);
    await page.locator('[data-studio-add]').click();
    await page.waitForFunction(()=>window.studioTest.studio.objects.length===1);
    await page.evaluate(()=>{const t=window.studioTest;t.showPerspectiveView();t.showTopView();t.toggleGrid();t.toggleGrid();});
    const rendersBefore = requests.length;
    const cameraBefore = await page.evaluate(()=>window.studioTest.studio.camera.position.toArray());
    await page.locator('#studioRenderButton').click();
    await page.locator('#studioRenderOptions').waitFor();
    assert.equal(requests.length, rendersBefore);
    await page.locator('#studioRenderCancel').click();
    assert.equal(requests.length, rendersBefore);
    await page.locator('#studioRenderButton').click();
    await page.locator('[name="periodo"][value="noite"]').check();
    await page.locator('[name="convidados"]').selectOption('poucos');
    await page.locator('[name="iluminacao"]').selectOption('cenica');
    await page.evaluate(()=>{const original=window.catalogRegisterRenderItems;window.__registrados=[];window.catalogRegisterRenderItems=(src,objetos)=>{window.__registrados.push({src,objetos});original?.(src,objetos);};});
    await page.locator('.studio-render-confirm').click();
    await page.getByText('Sua renderização ficou pronta',{exact:true}).waitFor();
    // O projeto leva os mesmos móveis da composição junto com a renderização — o 3D Livre registra a lista quando a imagem chega.
    const registrado3d=await page.evaluate(()=>window.__registrados);
    assert.equal(registrado3d.length,1);
    assert.equal(registrado3d[0].objetos.length,1,'Um móvel na cena, um móvel registrado');
    assert.ok(registrado3d[0].objetos[0].itemId&&registrado3d[0].objetos[0].itemName);
    assert.match(registrado3d[0].src,/^data:image\/png;base64,/);
    // Pedido explícito do usuário: "quero que a notificação de todos os
    // módulos apareça a imagem, igual é em troca de tecido" — a
    // notificação de sucesso do Estúdio de Ambientes também mostra a foto
    // direto, mesmo padrão de `.catalog-notification-photo` já usado no
    // tecido.
    assert.match(await page.locator('.catalog-notification-photo').getAttribute('src'),/^data:image\/png;base64,/,'Notificação de sucesso do Estúdio já mostra a foto, igual ao tecido');
    assert.equal(requests.at(-1).scene.options.periodo,'noite');
    assert.equal(requests.at(-1).scene.options.convidados,'poucos');
    assert.equal(requests.at(-1).scene.options.iluminacao,'cenica');
    assert.deepEqual(requests.at(-1).scene.camera.position,cameraBefore);
    assert.match(requests.at(-1).prompt,/Cena noturna/);
    assert.match(requests.at(-1).prompt,/Preserve rigidamente/);
    assert.doesNotMatch(requests.at(-1).prompt,/ou pessoas/);
    await page.getByRole('button',{name:'Ver resultado',exact:true}).last().click();
    assert.equal(await page.locator('#studioResultDialog').isVisible(),true);
    assert.equal(await page.locator('#studioResultKicker').textContent(),'Renderização IA');
    assert.equal(await page.locator('#studioResultTitle').innerText(),'Sua composição em uma cena realista');
    assert.equal(await page.locator('#studioResultDialog [data-projeto-save-render]').getAttribute('data-origem'),'3D Livre');
    assert.match(await page.locator('#studioResultDownload').getAttribute('download'),/^composicao-acervo\.png$/);
    await page.evaluate(()=>document.getElementById('studioResultDialog').close());

    // "Tirar print" — pedido explícito do usuário: captura instantânea da composição 3D (sem IA, sem espera), com o
    // piso forçado a branco na captura, pra usar como foto da legenda na planta baixa no lugar da renderização por
    // IA. Espiona a troca do material do piso (não confia em amostrar cor de pixel do canvas — frágil sob WebGL/
    // anti-aliasing headless) pra provar de verdade que o piso vira branco DURANTE a captura e volta ao MESMO objeto
    // de material de antes logo depois — sem assumir QUAL material é esse (o teste já subiu uma planta baixa em PDF
    // antes, o que troca o piso pra "plan"; comparar contra uma cor/objeto fixo — ex. o material "neutral" — seria
    // um teste errado aqui, não um bug real: já achado testando, a planta de teste é quase em branco, então o
    // material "plan" também lê como branco por coincidência do fixture, não por causa da captura).
    // Pedido explícito do usuário numa sessão seguinte: "quando eu tirar print vim 3 versões, quero que venha
    // apenas uma" — a versão anterior reposicionava a câmera em 3 ângulos padronizados (frente/fundo/diagonal) e
    // salvava um LOTE de 3 imagens; hoje captura só o que a câmera já está mostrando, sem mover nada, e salva 1
    // imagem só pelo MESMO caminho de qualquer outro diálogo de resultado (data-img/data-origem, sem lote).
    await page.evaluate(()=>{
      const floor=window.studioTest.studio.floor;
      window.__materialAntes=floor.material;
      window.__floorLog=[];
      let atual=floor.material;
      Object.defineProperty(floor,'material',{configurable:true,get:()=>atual,set:(v)=>{atual=v;window.__floorLog.push(v);}});
    });
    const requestsAntesDoPrint=requests.length;
    const cameraAntesDoPrint=await page.evaluate(()=>window.studioTest.studio.camera.position.toArray());
    await page.locator('#studioPrintButton').click();
    await page.waitForFunction(()=>document.getElementById('studioResultKicker')?.textContent==='Print 3D Livre');
    assert.equal(requests.length,requestsAntesDoPrint,'"Tirar print" não chama a IA — é instantâneo');
    assert.equal(await page.locator('#studioResultDialog').isVisible(),true);
    assert.doesNotMatch(await page.locator('#studioResultTitle').innerText(),/diagonal/i,'Sem menção a "diagonal" — não há mais múltiplos ângulos pra distinguir');
    assert.match(await page.locator('#studioResultDownload').getAttribute('download'),/^print-acervo\.png$/);
    // A câmera do usuário nunca é movida (a captura usa o ângulo em que ela já estava) — continua exatamente onde
    // a pessoa deixou, sem precisar de nenhum "voltar pro lugar" depois.
    const cameraDepoisDoPrint=await page.evaluate(()=>window.studioTest.studio.camera.position.toArray());
    assert.deepEqual(cameraDepoisDoPrint,cameraAntesDoPrint,'A câmera continua exatamente onde estava — o print não move nada');
    // Sem lote: o botão "Salvar no projeto" usa o MESMO caminho de imagem única (data-img/data-origem) que
    // qualquer outro diálogo de resultado.
    const printBatch=await page.evaluate(()=>document.querySelector('#studioResultDialog [data-projeto-save-render]').__printBatch);
    assert.equal(printBatch,null,'Sem lote nenhum — só a imagem única em #studioResultImage');
    assert.equal(await page.locator('#studioResultDialog [data-projeto-save-render]').getAttribute('data-origem'),'Print 3D Livre');
    const printSrc=await page.locator('#studioResultImage').getAttribute('src');
    assert.match(printSrc,/^data:image\/png;base64,/);
    // "o print está ficando muito longe... precisa ficar recortado exatamente no tamanho que precisamos dele, bem
    // rente mesmo ao formato do 3d" — o quadro fixo de 1536×1024 (a sala inteira que a câmera enxerga) precisa ter
    // dado lugar a um recorte de verdade em volta só da composição. Não decodifica pixel nenhum (frágil sob
    // anti-aliasing/WebGL headless) — só confirma que a imagem NÃO é mais aquele tamanho fixo.
    const printDims=await page.evaluate(async()=>{
      const img=document.getElementById('studioResultImage');
      const bitmap=await createImageBitmap(await (await fetch(img.src)).blob());
      const dims={width:bitmap.width,height:bitmap.height};
      bitmap.close();
      return dims;
    });
    assert.notEqual(printDims.width,1536,'Não é mais o quadro fixo do estúdio inteiro — recortado rente à composição: '+JSON.stringify(printDims));
    assert.notEqual(printDims.height,1024,'Idem, altura');
    assert.ok(printDims.width>20&&printDims.height>20,'Recorte tem tamanho de verdade, não degenerado: '+JSON.stringify(printDims));
    // Achado real, reportado pelo usuário com print: mesmo "não sendo mais o quadro fixo" (a checagem acima), o
    // recorte ainda podia sair com bastante fundo branco sobrando — "tem que ser o formato perfeito mesmo no
    // limite pra funcionar". A checagem de cima nunca teria pego essa regressão (qualquer margem, por mais
    // generosa, já não é mais 1536×1024). Esta aqui mede de verdade: decodifica os pixels e confere que a caixa do
    // que NÃO é fundo branco preenche a maior parte do quadro — prova de que "bem rente" é rente de verdade, não só
    // "diferente do tamanho fixo antigo".
    const preenchimento=await page.evaluate(async()=>{
      const img=document.getElementById('studioResultImage');
      const bitmap=await createImageBitmap(await (await fetch(img.src)).blob());
      const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
      const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let minX=canvas.width,minY=canvas.height,maxX=0,maxY=0;
      for(let y=0;y<canvas.height;y+=2){
        for(let x=0;x<canvas.width;x+=2){
          const i=(y*canvas.width+x)*4;
          if(data[i]>248&&data[i+1]>248&&data[i+2]>248) continue;
          if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y;
        }
      }
      return {fracaoLargura:(maxX-minX)/canvas.width,fracaoAltura:(maxY-minY)/canvas.height};
    });
    assert.ok(preenchimento.fracaoLargura>.6,'A composição preenche a maior parte da largura do print, não sobra fundo branco enorme: '+JSON.stringify(preenchimento));
    assert.ok(preenchimento.fracaoAltura>.6,'Idem, altura: '+JSON.stringify(preenchimento));
    const floorCheck=await page.evaluate(()=>{
      const s=window.studioTest.studio;
      return {
        logLength: window.__floorLog.length,
        primeiroEhBranco: window.__floorLog[0]?.color?.getHexString()==='ffffff',
        primeiroEhDiferenteDoOriginal: window.__floorLog[0]!==window.__materialAntes,
        restauradoEhOMesmoObjeto: s.floor.material===window.__materialAntes,
      };
    });
    // O piso troca de material só DUAS vezes no total (branco antes da captura, de volta ao real depois dela).
    assert.equal(floorCheck.logLength,2,'O piso troca de material exatamente duas vezes: branco pra capturar, de volta pro real');
    assert.equal(floorCheck.primeiroEhBranco,true,'Piso vira branco puro durante a captura');
    assert.equal(floorCheck.primeiroEhDiferenteDoOriginal,true,'O material branco é um objeto novo, não reaproveita/muta o original');
    assert.equal(floorCheck.restauradoEhOMesmoObjeto,true,'Restaura exatamente o MESMO objeto de material que estava antes de "Tirar print" — não uma cópia parecida');
    // O print registra os móveis da composição pra sua única imagem (uma renderização de IA antes + 1 do print = 2).
    const registrados=await page.evaluate(()=>window.__registrados);
    assert.equal(registrados.length,2,'1 registro da renderização por IA + 1 do print (não mais 3)');
    assert.equal(registrados.at(-1).objetos.length,1,'Registro do print com o móvel certo');
    assert.equal(registrados.at(-1).src,printSrc,'...e é a MESMA imagem que está em destaque no diálogo');
    await page.evaluate(()=>document.getElementById('studioResultDialog').close());

    await page.locator('#studioProjectSave').click();
    await page.waitForFunction(()=>document.getElementById('studioProjectStatus').textContent.startsWith('Salvo'));
    const download=page.waitForEvent('download');await page.locator('#studioProjectExport').click();assert.equal((await download).suggestedFilename(),'projeto-acervo.json');
    const backup=await page.evaluate(()=>window.studioTest.snapshotProject());
    await page.locator('#studioProjectNew').click();await page.waitForFunction(()=>window.studioTest.studio.objects.length===0);
    await page.locator('#studioProjectImport').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    await page.waitForFunction(()=>window.studioTest.studio.objects.length===1);
    await page.locator('#studioProjectImport').setInputFiles({name:'invalido.json',mimeType:'application/json',buffer:Buffer.from('{}')});
    await page.waitForFunction(()=>document.getElementById('studioProjectStatus').textContent.includes('inválido'));
    await page.locator('#studioProjectNew').click();await page.waitForFunction(()=>window.studioTest.studio.objects.length===0);
    await page.locator('.studio-project-panel details:nth-child(2) summary').click();
    await page.locator('#studioDesignItems input').check();await page.locator('#design-quantity').fill('2');await page.locator('#design-brief').fill('Mesas no fundo');
    await page.removeLocatorHandler(page.locator('.catalog-credit-dialog[open]'));await page.locator('#studioDesignBuild').click();await page.locator('.catalog-credit-dialog [value=confirm]').click();await page.waitForFunction(()=>document.getElementById('studioDesignStatus').textContent.includes('2 itens adicionados'));
    assert.ok(requests.some(r=>r.action==='plan_layout'));
    await page.locator('#catalogLogout').click();await page.locator('#catalogLoginEmail').waitFor();
    assert.deepEqual(errors,[]);
    console.log('PASS: login, busca, tecido, PDF real/worker, páginas/cancelamento/limite, modelo 3D, câmera, renderização, backup, projetos, layout IA e logout. Respostas da IA simuladas.');
  } finally { await browser.close();server.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
