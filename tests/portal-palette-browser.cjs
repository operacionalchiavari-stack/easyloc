const {chromium}=require('playwright'),express=require('express'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 fs.mkdirSync('.tmp',{recursive:true});
 const app=express();
 app.get('/palette-test',(_,res)=>res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="stylesheet" href="styles/global.css"><link rel="stylesheet" href="styles/portal-shell.css"><link rel="stylesheet" href="styles/menu-topo.css"><link rel="stylesheet" href="styles/festive-themes.css">
  <style>#portalInicio{display:block!important}.revelar{opacity:1!important;transform:none!important}#sidebar{color:white;justify-content:center}#sidebar b{padding:20px}body{margin:0}</style></head>
  <body class="portal-shell"><aside id="sidebar" class="portal-menu"><b>CHIAVARI · Portal da equipe</b></aside><main id="portalInicio"></main></body></html>`));
 app.use(express.static(process.cwd()));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://**/*',route=>route.fulfill({body:''}));
  await page.goto(`http://127.0.0.1:${server.address().port}/palette-test`);
  await page.evaluate(()=>{window.__CONTEXT={empresa_id:'e1'};window.supabaseClient={auth:{getSession:async()=>({data:{session:null}})},rpc:async()=>({data:null})};});
  await page.addScriptTag({path:'js/core/companyTheme.js'});
  await page.addScriptTag({path:'js/ui/festiveScene.js'});
  await page.addScriptTag({content:fs.readFileSync('js/ui/portalMural.js','utf8').replace('window.portalMural = { mostrar: mostrar };','window.portalMural = { mostrar: mostrar, montarTeste: function(data){ estado.mural=data; montarMural(); } };')});
  const mural={aniversariantes:[{id:'u1',nome:'Ana Silva',dia:15,hoje:true,setor:'Logística',mensagens:[]}],
   avisos:[{id:'a1',titulo:'Juntos fazemos a diferença',texto:'Obrigado pelo cuidado e dedicação de cada um.',publicadoEm:'2026-11-15',cor:'neutro'},
    {id:'a2',titulo:'Nossa reunião',texto:'Encontro da equipe na segunda-feira.',publicadoEm:'2026-11-15',cor:'lavanda',prioridade:'IMPORTANTE'}],numeros:{mes:'2026-11',eventos:120}};
  await page.evaluate(data=>{window.__fixtureMural=data;portalMural.montarTeste(data);},mural);
  const color=selector=>page.locator(selector).evaluate(el=>getComputedStyle(el).backgroundColor);
  const inspect=async()=>{
   const result=await page.evaluate(()=>{
    const hero=document.querySelector('.hero'),slide=hero.querySelector('.hero-slide.ativo'),image=hero.querySelector('.hero-img.ativo');
    const computed=el=>getComputedStyle(el),api=EasyLocTheme;
    const bg=computed(document.documentElement).getPropertyValue('--color-sidebar').trim();
    const hex=rgb=>'#'+rgb.match(/[\d.]+/g).slice(0,3).map(value=>Number(value).toString(16).padStart(2,'0')).join('');
    const heading=slide.querySelector('h1')||slide.querySelector('.qa-placa');
    const headingBg=heading.classList.contains('qa-placa')?hex(computed(heading).backgroundColor):bg;
    return {menu:computed(document.getElementById('sidebar')).backgroundColor,bg:computed(image).backgroundColor,
      headingRatio:api.contrast(headingBg,hex(computed(heading).color)),
      controlsRatio:api.contrast(bg,hex(computed(hero.querySelector('.hero-pausa')).color)),
      selected:slide.className};
   });
   assert.equal(result.bg,result.menu,'fundo do destaque tem a cor do menu: '+result.selected);
   assert.ok(result.headingRatio>=4.5,'título legível: '+JSON.stringify(result));
   assert.ok(result.controlsRatio>=4.5,'controles legíveis');
  };
  for(const [name,menu] of [['azul','#1e2c46'],['verde','#173f37'],['roxo','#46206b'],['cinza','#5a5a55'],['claro','#f5ecd8']]){
   await page.evaluate(menu=>EasyLocTheme.applyTheme({cor_sidebar:menu,cor_destaque:'#8a652c'}),menu);
   // A troca de cor conserva o slide selecionado, seus dados e as animações.
   const slides=await page.locator('.hero-ponto').count();
   for(let i=0;i<slides;i++){
    await page.locator('.hero-ponto').nth(i).click();
    await inspect();
    if(i===2){
     assert.equal(await page.locator('.qa-nota:not(.qa-nova)').count(),2);
     assert.match(await page.locator('.qa-nota.is-importante .qa-selo').innerText(),/Importante/i);
    }
    if(name==='azul')await page.screenshot({animations:'disabled',path:`.tmp/portal-palette-${name}-${i}.png`});
   }
   const active=await page.locator('.hero-slide.ativo').getAttribute('aria-label');
   await page.evaluate(menu=>EasyLocTheme.applyTheme({...__COMPANY_THEME,cor_sidebar:menu}),menu);
   assert.equal(await page.locator('.hero-slide.ativo').getAttribute('aria-label'),active);
   await page.screenshot({animations:'disabled',path:`.tmp/portal-palette-${name}.png`});
  }
  await page.evaluate(()=>{
   EasyLocTheme.applyTheme({cor_sidebar:'#1e2c46'});
   portalMural.montarTeste({...__fixtureMural,celebracao:{ideias:[{id:'i1',titulo:'Cuidar de cada detalhe',autor:'Ana Silva',premio:'Um dia especial',proposta:'Uma melhoria feita em equipe.'}]}});
  });
  await inspect();
  assert.equal(await page.locator('.cel-confete').count(),28);
  await page.screenshot({animations:'disabled',path:'.tmp/portal-palette-celebracao.png'});
  await page.locator('.hero-ponto').nth(2).click();
  const paperBefore=await color('.qa-nota:not(.is-importante)');
  await page.evaluate(()=>EasyLocTheme.applyTheme({...__COMPANY_THEME,cor_sidebar:'#46206b'}));
  assert.notEqual(await color('.qa-nota:not(.is-importante)'),paperBefore,'papel acompanha nova paleta');
  await inspect();
  // Todos os temas festivos continuam combinando com o menu efetivamente aplicado.
  for(const id of ['natal','ano_novo','pascoa','carnaval']){
   await page.evaluate(id=>EasyLocTheme.applyTheme({...__COMPANY_THEME,tema_festivo:id,tema_festivo_inicio:'2020-01-01',tema_festivo_fim:'2099-12-31'}),id);
   await page.locator('.hero-ponto').first().click();
   await inspect();
   assert.equal(await page.locator('.hero-festivo .festive-scene').evaluate(el=>getComputedStyle(el).backgroundColor),await color('#sidebar'));
  }
  await page.evaluate(()=>EasyLocTheme.applyTheme({cor_sidebar:'#1e2c46'}));
  await page.setViewportSize({width:390,height:844});
  for(let i=0;i<await page.locator('.hero-ponto').count();i++){
   await page.locator('.hero-ponto').nth(i).click();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'sem rolagem horizontal no celular');
   if(i===2)await page.screenshot({animations:'disabled',path:'.tmp/portal-palette-avisos-mobile.png'});
  }
  assert.deepEqual(errors,[]);
  console.log('OK — destaques, aniversários, resultados, premiação, quadro e quatro temas seguem o menu; contraste, troca imediata e celular verificados.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
