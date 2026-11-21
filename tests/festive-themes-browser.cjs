const {chromium}=require('playwright');
const express=require('express');
const assert=require('node:assert/strict');
const fs=require('node:fs');

(async()=>{
  fs.mkdirSync('.tmp',{recursive:true});
  const app=express();
  app.get('/festive-home-test',(_,res)=>res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="styles/global.css"><link rel="stylesheet" href="styles/portal-shell.css"><link rel="stylesheet" href="styles/menu-topo.css"><link rel="stylesheet" href="styles/festive-themes.css">
    <style>body{margin:0}#portalInicio{display:block!important;position:relative;inset:auto!important;margin:0!important;width:100%!important}.revelar{opacity:1!important;transform:none!important}*{box-sizing:border-box}</style></head>
    <body class="portal-shell portal-em-inicio"><div id="portalInicio"></div><script src="js/core/companyTheme.js"></script><script src="js/ui/festiveScene.js"></script><script src="js/ui/portalMural.js"></script><script>EasyLocTheme.applyForEmpresa('e1');</script></body></html>`));
  app.use(express.static(process.cwd()));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1050}});
    await page.clock.install({time:new Date('2026-11-15T15:00:00-03:00')});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      window.__writes=[];window.__alerts=[];
      const bank={empresas:[{id:'e1',nome:'Empresa teste'}],empresas_configuracoes:[],empresa_financeiro:[],
        configuracoes_empresa:[JSON.parse(localStorage.getItem('fixture_identity')||'{"empresa_id":"e1","cor_sidebar":"#123456","cor_destaque":"#246b48","tema_festivo":""}') ]};
      window.__CONTEXT={empresa_id:'e1'};window.aguardarContexto=async()=>__CONTEXT;
      window.alerta=(...args)=>__alerts.push(args);
      window.supabaseClient={from(table){
        let rows=bank[table]||[],single=false,write,error=null;
        const q={select(){return q},eq(key,value){rows=rows.filter(row=>row[key]===value);return q},single(){single=true;return q},maybeSingle(){single=true;return q},order(){return q},limit(){return q},in(){return q},
          upsert(payload){write=payload;__writes.push({table,payload});if(table==='configuracoes_empresa'){
            if(window.__failIdentity)error={code:'PGRST204',message:'tema_festivo not found in configuracoes_empresa'};
            else{bank[table]=rows=[payload];localStorage.setItem('fixture_identity',JSON.stringify(payload));}
          }return q},update(payload){write=payload;__writes.push({table,payload});return q},
          then(ok,fail){return Promise.resolve({data:error?null:single?(rows[0]||write||null):rows,error}).then(ok,fail)}};return q;
      },rpc:async name=>({data:name==='get_dashboard_empresa'?{}:null,error:null}),auth:{getSession:async()=>({data:{session:null}})},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}})})}};
      window.google={maps:{places:{Autocomplete:class{addListener(){} unbindAll(){}}}}};
    });
    await page.route('https://**/*',route=>route.fulfill({contentType:'text/javascript',body:''}));
    for(const script of ['context.js','permissions.js','alerta.js'])await page.route(`**/js/core/${script}*`,route=>route.fulfill({contentType:'text/javascript',body:''}));
    const base=`http://127.0.0.1:${server.address().port}`;
    const openIdentity=async()=>{
      await page.goto(base+'/Modulos/Configuracoes/Parametros/parametros.html');
      await page.waitForFunction(()=>!document.getElementById('salvarEmpresaParametros').disabled);
      await page.locator('[data-parametro-aba="identidade"]').click();
      await page.locator('.festive-options').waitFor();
    };
    await openIdentity();
    assert.equal(await page.locator('[data-festive-theme]').count(),5);
    const settings=page.locator('.festive-settings');
    await settings.scrollIntoViewIfNeeded();
    await page.locator('[data-festive-theme="natal"]').click();
    assert.equal(await page.locator('.festive-preview-frame .festive-santa').count(),1);
    assert.equal(await page.locator('.festive-preview-frame .festive-tree').count(),1);
    assert.equal(await page.locator('#festivePreviewFrame h4').evaluate(el=>getComputedStyle(el).color),'rgb(255, 247, 234)','título da prévia legível sobre a cena');
    assert.equal(await page.locator('#festivePreviewFrame h4').evaluate(el=>getComputedStyle(el).textTransform),'none');
    assert.equal(await page.locator('.festive-preview-frame .festive-particles i').count(),36);
    assert.equal(await page.locator('#identidadeCorMenu').inputValue(),'#123456','original não é substituído ao escolher o tema');
    assert.equal(await page.locator('[data-preview-sidebar]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(23, 63, 55)');
    assert.equal(await page.evaluate(()=>localStorage.getItem('fixture_identity')),null,'prévia não salva');
    await page.locator('#festivePreviewToggle').click();
    assert.equal(await page.locator('.festive-preview-frame .festive-santa').evaluate(el=>getComputedStyle(el).animationPlayState),'paused');
    await page.locator('#festivePreviewToggle').click();
    await page.locator('#festiveSaveBtn').click();
    assert.equal(await page.evaluate(()=>__writes.filter(write=>write.table==='configuracoes_empresa').length),0,'não salva tema sem período');
    await page.locator('#festivePeriodStart').fill('2026-11-16');
    await page.locator('#festivePeriodEnd').fill('2026-11-15');
    await page.locator('#festiveSaveBtn').click();
    assert.equal(await page.evaluate(()=>__writes.filter(write=>write.table==='configuracoes_empresa').length),0,'não salva período invertido');
    assert.match(await page.locator('#identidadeContrastAlert').textContent(),/data final/);
    await page.locator('#festivePeriodStart').fill('2026-11-15');
    await page.locator('#festivePeriodEnd').fill('2026-11-16');
    await page.screenshot({path:'.tmp/festive-parameters.png',fullPage:true});
    await page.locator('#festiveSaveBtn').click();
    await page.waitForFunction(()=>document.getElementById('identidadeStatus').textContent==='Salvo');
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('fixture_identity')));
    assert.equal(saved.tema_festivo,'natal');assert.equal(saved.cor_sidebar,'#123456');assert.equal(saved.cor_destaque,'#246b48');
    assert.equal(saved.tema_festivo_inicio,'2026-11-15');assert.equal(saved.tema_festivo_fim,'2026-11-16');
    await openIdentity();
    assert.equal(await page.locator('[data-festive-theme="natal"]').getAttribute('aria-checked'),'true','tema restaura após recarregar');
    assert.equal(await page.locator('#festivePeriodStart').inputValue(),'2026-11-15');
    assert.equal(await page.locator('#festivePeriodEnd').inputValue(),'2026-11-16');
    // Teclado e falha no banco: nenhuma indicação falsa de salvamento.
    await page.locator('[data-festive-theme="natal"]').focus();await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-festive-theme="pascoa"]').getAttribute('aria-checked'),'true');
    await page.evaluate(()=>{window.__failIdentity=true;});
    await page.locator('#festiveSaveBtn').click();
    await page.waitForFunction(()=>document.getElementById('identidadeStatus').textContent==='Erro ao salvar');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('fixture_identity')).tema_festivo),'natal');
    assert.equal(await page.locator('#festiveSaveBtn').isDisabled(),false);
    await page.evaluate(()=>{window.__failIdentity=false;});
    await page.setViewportSize({width:390,height:844});
    await page.locator('.festive-settings').scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Parâmetros sem rolagem horizontal');
    await page.screenshot({path:'.tmp/festive-parameters-mobile.png',fullPage:true});

    await page.setViewportSize({width:1440,height:1000});
    await page.goto(base+'/festive-home-test');
    await page.locator('.hero-festivo').waitFor();
    // A mesma seleção muda de estado na virada do período sem recarregar a página.
    for(const [time,active] of [['2026-11-14T23:59:59-03:00',false],['2026-11-15T00:00:00-03:00',true],['2026-11-16T23:59:59-03:00',true],['2026-11-17T00:00:00-03:00',false]]){
      await page.clock.setFixedTime(new Date(time));
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      assert.equal(await page.locator('.hero-festivo').count(),active?1:0,time);
      assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--color-sidebar').trim()),active?'#173f37':'#123456');
    }
    await page.clock.setFixedTime(new Date('2026-11-15T15:00:00-03:00'));
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.evaluate(()=>EasyLocTheme.applyTheme({...__COMPANY_THEME,tema_festivo_inicio:'2026-12-01',tema_festivo_fim:'2026-12-25'}));
    assert.equal(await page.locator('.hero-festivo').count(),0,'agendamento futuro mantém o destaque normal');
    await page.evaluate(()=>EasyLocTheme.applyTheme({...__COMPANY_THEME,tema_festivo_inicio:'2026-11-15',tema_festivo_fim:'2026-11-16'}));
    const allThemes=['natal','ano_novo','pascoa','carnaval'];
    for(const id of allThemes){
      await page.evaluate(id=>EasyLocTheme.applyTheme({...__COMPANY_THEME,tema_festivo:id}),id);
      await page.waitForFunction(id=>document.querySelector('.hero-festivo')?.classList.contains('festive-'+id),id);
      assert.equal(await page.locator('.hero-convite').count(),0,'tema substitui a Ideia Premiada');
      assert.equal(await page.locator('.hero-festivo .festive-art').count(),1);
      assert.ok(await page.locator('.hero-festivo h1').isVisible());
      assert.equal(await page.locator('.hero-festivo h1').evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)','estilos globais preservam contraste do título');
      await page.screenshot({path:`.tmp/festive-home-${id}.png`});
    }
    await page.locator('.hero-pausa').click();
    assert.equal(await page.locator('.hero-festivo .festive-mask').evaluate(el=>getComputedStyle(el).animationPlayState),'paused');
    await page.locator('.hero-pausa').click();
    await page.locator('.hero-proximo').click();
    assert.equal(await page.locator('.hero-festivo').getAttribute('aria-hidden'),'true');
    assert.equal(await page.locator('.hero-festivo .festive-mask').evaluate(el=>getComputedStyle(el).animationPlayState),'paused','cena inativa pausa');
    await page.locator('.hero-anterior').click();
    await page.emulateMedia({media:'print'});
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--color-sidebar').trim()),'#123456','impressão preserva menu original');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--el-button-primary-bg').trim()),'#246b48','impressão preserva destaque original');
    assert.equal(await page.locator('.festive-welcome').isVisible(),false);
    await page.emulateMedia({media:'screen',reducedMotion:'reduce'});
    assert.equal(await page.locator('.festive-mask').evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.setViewportSize({width:390,height:844});
    for(const id of allThemes){
      await page.evaluate(id=>EasyLocTheme.applyTheme({...__COMPANY_THEME,tema_festivo:id}),id);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Início sem rolagem horizontal');
      const fit=await page.locator('.hero-festivo').evaluate(el=>{
        const slide=el.getBoundingClientRect(),text=el.querySelector('.festive-copy').getBoundingClientRect();
        return text.bottom<=slide.bottom && text.left>=slide.left && text.right<=slide.right;
      });
      assert.ok(fit,'mensagem cabe no celular: '+id);
      await page.screenshot({path:`.tmp/festive-home-${id}-mobile.png`});
    }
    await page.evaluate(()=>EasyLocTheme.applyTheme({...__COMPANY_THEME,tema_festivo:''}));
    assert.equal(await page.locator('.hero-festivo').count(),0);
    assert.equal(await page.locator('.hero-convite').count(),1,'retirar tema restaura Ideia Premiada');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--color-sidebar').trim()),'#123456');
    // Salvar no módulo real dentro do shell atualiza as cores e o destaque do pai.
    await page.setViewportSize({width:1440,height:1000});
    await page.evaluate(()=>{
      const frame=document.createElement('iframe');frame.id='testParametersFrame';
      frame.src='Modulos/Configuracoes/Parametros/parametros.html';
      frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:10000;background:white';document.body.appendChild(frame);
    });
    const parameters=page.frameLocator('#testParametersFrame');
    await parameters.locator('#salvarEmpresaParametros:not([disabled])').waitFor();
    await parameters.locator('[data-parametro-aba="identidade"]').click();
    await parameters.locator('[data-festive-theme="pascoa"]').click();
    await parameters.locator('#festiveSaveBtn').click();
    await page.waitForFunction(()=>window.__COMPANY_THEME?.tema_festivo==='pascoa');
    assert.equal(await page.locator('.hero-festivo.festive-pascoa').count(),1);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--color-sidebar').trim()),'#53416a');
    assert.equal(await parameters.locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--color-sidebar').trim()),'#53416a');
    assert.deepEqual(errors,[]);
    console.log('OK — quatro temas, período obrigatório e persistido, datas inclusivas, ativação e encerramento sem recarregar, prévia, celular, iframe e impressão original.');
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
