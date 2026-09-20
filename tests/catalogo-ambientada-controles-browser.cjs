// Pedido do usuário, com print da tela de um item: "na foto do item ambientado eu quero que tenha uma seta de
// avançar ou voltar e um pause também, bem discreto, pra parar de alterar". A foto ambientada troca sozinha a
// cada 10s (startEventRotation → rotateActiveEvent); agora tem setas anterior/próxima e um botão de pausar.
const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#8fae9b"/></svg>');
const ST='https://fixture/storage/v1/object/public/itens/';
const galeria=(id,n)=>Array.from({length:n},(_,i)=>({slot:'galeria_0'+(i+1),tipo:'galeria',titulo:`Ambientada ${i+1}`,url:`${ST}amb-${id}-${i+1}.png`,path:`company/${id}/geral/galeria-0${i+1}.png`,ordem:i+1,cliente_id:null}));
const ITENS=[
 {id:'1',tipo:'Item',produto:'Sofá Um',categoria:'Sofás',foto_url:ST+'sofa1.png',itens_fotos:galeria(1,3),itens_modelos_3d:[]},
 {id:'2',tipo:'Item',produto:'Sofá Dois',categoria:'Sofás',foto_url:ST+'sofa2.png',itens_fotos:galeria(2,2),itens_modelos_3d:[]},
 {id:'3',tipo:'Item',produto:'Sofá Três',categoria:'Sofás',foto_url:ST+'sofa3.png',itens_fotos:galeria(3,1),itens_modelos_3d:[]},   // 1 ambientada só: nada pra trocar
];
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
async function abrir(interno,vw=1440,vh=900){
  const page=await browser.newPage({viewport:{width:vw,height:vh}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page._errors=errors;
  await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
  await page.addInitScript(({itens,interno})=>{
    // Captura o relógio de 10s da troca automática pra o teste "dar o tick" sem esperar 10 segundos de verdade.
    window.__ticks=[];window.__cleared=0;
    const si=window.setInterval.bind(window),ci=window.clearInterval.bind(window);
    window.setInterval=(fn,ms,...a)=>{if(ms===10000)window.__ticks.push(fn);return si(fn,ms,...a);};
    window.clearInterval=(id)=>{window.__cleared++;return ci(id);};
    if(interno){
      sessionStorage.setItem('login_ok','1');
      const builder=v=>new Proxy({},{get(_t,p){if(p==='then')return res=>res(v());return ()=>builder(v);}});
      window.supabaseClient={
        auth:{getSession:async()=>({data:{session:{user:{id:'u'}}},error:null}),getUser:async()=>({data:{user:{id:'u'}},error:null})},
        from(t){if(t==='usuarios_empresas')return builder(()=>({data:{empresa_id:'company'},error:null}));return builder(()=>({data:[],error:null}));},
        rpc:async n=>{
          if(n==='funcionario_contexto')return {data:{ativo:true,administrador_legado:true},error:null};
          if(n==='catalogo_carregar_interno')return {data:{empresa:{nome:'Chiavari'},decorador:null,itens},error:null};
          if(n==='catalogo_capas_carregar_interno')return {data:{}};
          return {data:null,error:null};},
        functions:{invoke:async()=>({data:null,error:null})},
        storage:{from(){return {upload:async()=>({error:null}),remove:async()=>({error:null}),getPublicUrl:p=>({data:{publicUrl:'https://fixture/'+p}})};}},
      };
    }else{
      sessionStorage.setItem('catalogo_token','test');
      window.supabaseClient={rpc:async n=>{
        if(n==='catalogo_validar_sessao')return {data:{valido:true,empresa_id:'company',cliente_id:'client'}};
        if(n==='catalogo_carregar')return {data:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens}};
        if(n==='catalogo_capas_carregar')return {data:{}};
        return {data:null};},functions:{invoke:async()=>({data:null,error:null})}};
    }
  },{itens:ITENS,interno});
  await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
  await page.locator('.catalog-gateway').waitFor();
  await page.locator('[data-gateway-tile="catalogo"]').click();await page.locator('#catalogGrid .catalog-home-grid').waitFor();
  await page.locator('[data-home-category="sofas"]').click();await page.locator('[data-grid-item="1"]').click();
  await page.locator('#produto-1').waitFor();
  await page.waitForFunction(()=>window.__ticks.length>0);
  return page;
}
// Espera a troca terminar e a foto ambientada de um item estar no índice pedido.
const noIndice=(page,id,n)=>page.waitForFunction(({id,n})=>{const p=document.querySelector(`#produto-${id} .product-event-panel`);const imgs=p.querySelectorAll('.product-event-image');return imgs.length===1&&imgs[0].dataset.eventIndex===String(n)&&p.dataset.transitioning!=='true';},{id,n});
const indice=(page,id)=>page.locator(`#produto-${id} .product-event-image`).first().getAttribute('data-event-index');
const tick=(page)=>page.evaluate(()=>window.__ticks.at(-1)());

// ===== 1. Decorador: setas + pausar, discretos, e funcionando =====
{
  const page=await abrir(false);
  const painel='#produto-1 .product-event-panel';
  assert.equal(await page.locator(`${painel} .catalog-event-nav`).count(),2,'Setas anterior e próxima no painel da foto ambientada');
  assert.equal(await page.locator(`${painel} .catalog-event-pause`).count(),1,'Botão de pausar');
  // "Bem discreto": pequenos e meio apagados em repouso.
  const disc=await page.evaluate((sel)=>{const p=document.querySelector(sel);const q=(s)=>{const e=p.querySelector(s);const cs=getComputedStyle(e);const b=e.getBoundingClientRect();return {w:Math.round(b.width),h:Math.round(b.height),op:+cs.opacity};};return {nav:q('.catalog-event-nav'),pause:q('.catalog-event-pause')};},painel);
  assert.ok(disc.nav.w<=36&&disc.nav.h<=36,`Setas pequenas (${disc.nav.w}px)`);
  assert.ok(disc.pause.w<=30&&disc.pause.h<=30,`Botão de pausar ainda menor (${disc.pause.w}px)`);
  assert.ok(disc.nav.op<=0.6&&disc.pause.op<=0.6,`Apagados em repouso (opacidade ${disc.nav.op}/${disc.pause.op})`);
  assert.equal(await indice(page,1),'0');

  // Próxima / anterior, e a volta ao redor (do 1º pro último).
  await page.locator(`${painel} .catalog-event-nav.is-next`).click();await noIndice(page,1,1);
  assert.match(await page.locator(`${painel} .product-event-image`).getAttribute('alt'),/Ambientada 2/,'Próxima mostra a 2ª ambientada');
  await page.locator(`${painel} .catalog-event-nav.is-prev`).click();await noIndice(page,1,0);
  await page.locator(`${painel} .catalog-event-nav.is-prev`).click();await noIndice(page,1,2);
  assert.match(await page.locator(`${painel} .product-event-image`).getAttribute('alt'),/Ambientada 3/,'Anterior do 1º volta pro último');
  await page.locator(`${painel} .catalog-event-nav.is-next`).click();await noIndice(page,1,0);
  assert.equal(await page.locator('#catalogPhotoZoomDialog[open]').count(),0,'Clicar nas setas não abre o zoom da foto');

  // Dois cliques seguidos, durante a troca (900ms): nenhum se perde.
  await page.locator(`${painel} .catalog-event-nav.is-next`).click();
  await page.locator(`${painel} .catalog-event-nav.is-next`).click({force:true});
  await noIndice(page,1,2);
  await page.locator(`${painel} .catalog-event-nav.is-next`).click();await noIndice(page,1,0);

  // Clicar numa seta recomeça os 10s da troca automática (não dispara logo depois).
  const antes=await page.evaluate(()=>({t:window.__ticks.length,c:window.__cleared}));
  await page.locator(`${painel} .catalog-event-nav.is-next`).click();await noIndice(page,1,1);
  const depois=await page.evaluate(()=>({t:window.__ticks.length,c:window.__cleared}));
  assert.ok(depois.t>antes.t&&depois.c>antes.c,'Clicar numa seta reinicia o relógio da troca automática');

  // Troca automática (o "tick" de 10s) funciona; pausada, NÃO troca; as setas seguem funcionando pausado.
  await tick(page);await noIndice(page,1,2);
  const pausar=page.locator(`${painel} .catalog-event-pause`);
  assert.equal(await pausar.getAttribute('aria-pressed'),'false');
  const iconeRodando=await pausar.innerHTML();
  await pausar.click();
  assert.equal(await pausar.getAttribute('aria-pressed'),'true','Pausar marca o botão como pressionado');
  assert.match(await pausar.getAttribute('aria-label'),/Retomar/,'Pausado, o botão oferece retomar');
  assert.notEqual(await pausar.innerHTML(),iconeRodando,'O ícone muda (pausar → tocar)');
  await tick(page);await page.waitForTimeout(1300);
  assert.equal(await indice(page,1),'2','Pausado: o tick de 10s não troca a foto');
  assert.equal(await page.locator(`${painel}`).evaluate(el=>el.dataset.transitioning||''),'');
  await page.locator(`${painel} .catalog-event-nav.is-prev`).click();await noIndice(page,1,1);
  assert.equal(await pausar.getAttribute('aria-pressed'),'true','Passar de foto na mão não retoma a troca automática');
  await tick(page);await page.waitForTimeout(1300);
  assert.equal(await indice(page,1),'1','...e continua pausada');
  // O estado vale pros OUTROS itens da página (o botão do Sofá Dois já nasce pausado).
  assert.equal(await page.locator('#produto-2 .catalog-event-pause').getAttribute('aria-pressed'),'true','Pausar vale pra todos os itens');
  // Retomar.
  await pausar.click();
  assert.equal(await pausar.getAttribute('aria-pressed'),'false');
  await tick(page);await noIndice(page,1,2);
  // Item com UMA ambientada só: sem setas nem pausar.
  assert.equal(await page.locator('#produto-3 .catalog-event-nav, #produto-3 .catalog-event-pause').count(),0,'Com uma foto ambientada só não há o que trocar: sem controles');
  assert.deepEqual(page._errors,[],'nenhum erro de página');
  await page.close();
}

// ===== 2. Equipe interna: controles convivem com os pontinhos de edição (sem sobrepor) =====
{
  const page=await abrir(true);
  const painel='#produto-1 .product-event-panel';
  assert.equal(await page.locator(`${painel} .catalog-event-nav`).count(),2);
  assert.equal(await page.locator(`${painel} .catalog-event-slot-dot`).count(),3,'Os 3 pontinhos de edição continuam lá');
  const caixa=async(sel)=>page.locator(sel).first().boundingBox();
  const pause=await caixa(`${painel} .catalog-event-pause`),pontos=await caixa(`${painel} .catalog-event-slot-picker`);
  const cruza=!(pause.x+pause.width<=pontos.x||pontos.x+pontos.width<=pause.x||pause.y+pause.height<=pontos.y||pontos.y+pontos.height<=pause.y);
  assert.equal(cruza,false,'Pausar não fica em cima dos pontinhos de edição');
  await page.locator(`${painel} .catalog-event-nav.is-next`).click();await noIndice(page,1,1);
  assert.equal(await page.locator('.catalog-inline-crop-overlay').count(),0,'Clicar na seta não abre a edição da foto');
  assert.deepEqual(page._errors,[]);
  await page.close();
}

// ===== 3. Celular =====
{
  const page=await abrir(false,390,844);
  await page.locator('#produto-1 .catalog-event-nav.is-next').scrollIntoViewIfNeeded();
  const box=await page.locator('#produto-1 .catalog-event-nav.is-next').boundingBox();
  assert.ok(box.x>=0&&box.x+box.width<=390,'celular: a seta cabe na tela');
  await page.locator('#produto-1 .catalog-event-nav.is-next').click();await noIndice(page,1,1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'celular: sem rolagem horizontal');
  await page.close();
}
await browser.close();server.close();
console.log('PASS: foto ambientada com setas (anterior/próxima, com volta ao redor e sem perder cliques rápidos), botão de pausar que para a troca automática de todos os itens (as setas seguem funcionando, retomar volta ao normal), tudo pequeno e apagado em repouso, sem controles com uma foto só, convivendo com os pontinhos de edição da equipe, celular sem overflow');
})().catch(e=>{console.error(e);process.exit(1);});
