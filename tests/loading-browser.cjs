const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage();
    await page.setContent('<main><div id="painel">Carregando...</div><button id="acao">Carregando dados…</button><div class="pa-carregando"><i class="spinner"></i>Carregando painel...</div><select><option>Carregando...</option></select><div contenteditable="true">Carregando meu texto</div><div id="dinamico"></div></main>');
    await page.addScriptTag({path:path.resolve('js/core/loading.js')});
    await page.evaluate(()=>{
      const div=document.createElement('div');
      div.id='loaderLegado';div.innerHTML='<div class="loader-circle"></div><span class="loader-text">Carregando...</span>';
      document.body.appendChild(div);
      const perfil=document.createElement('div');perfil.className='usuario-dados';perfil.innerHTML='<b id="usuarioNome">Carregando...</b>';document.body.appendChild(perfil);
    });
    await page.waitForFunction(()=>document.querySelector('#loaderLegado .loader-text').textContent==='');
    assert.equal(await page.locator('#loaderLegado .el-loading-ring').count(),0,'rótulo separado não cria outro círculo');
    assert.equal(await page.locator('.usuario-dados .el-loading-ring').count(),0,'nome do usuário não vira círculo');
    assert.equal(await page.locator('#painel').innerText(),'');
    assert.equal(await page.locator('#painel [role="status"]').getAttribute('aria-label'),'Carregando...');
    assert.equal(await page.locator('#painel .el-loading-ring').evaluate(el=>getComputedStyle(el).animationName),'elLoadingSpin');
    assert.equal(await page.locator('#acao .el-loading-ring').evaluate(el=>el.getBoundingClientRect().width),16);
    assert.equal(await page.locator('.pa-carregando .el-loading-ring').count(),0,'não duplica círculo existente');
    assert.equal(await page.locator('.pa-carregando').innerText(),'');
    assert.equal(await page.locator('option').innerText(),'');
    assert.equal(await page.locator('[contenteditable]').innerText(),'Carregando meu texto');
    await page.evaluate(()=>document.getElementById('dinamico').textContent='Carregando pedidos...');
    await page.locator('#dinamico .el-loading-ring').waitFor();
    await page.evaluate(()=>document.getElementById('dinamico').textContent='Pronto');
    assert.equal(await page.locator('#dinamico').innerText(),'Pronto');
    await page.evaluate(()=>{
      const form=document.createElement('div');
      form.innerHTML='<input id="filtroBusca" value="busca intencional"><input id="filtroLoginAutomatico" value="usuario@teste.com"><input id="email" autocomplete="username"><input type="password" id="senha">';
      window.supabaseClient={auth:{getSession:async()=>({data:{session:{user:{email:'usuario@teste.com'}}}})}};
      document.body.appendChild(form);
    });
    await page.addScriptTag({path:path.resolve('js/core/filterInputs.js')});
    assert.equal(await page.locator('#filtroBusca').getAttribute('type'),'search');
    assert.equal(await page.locator('#filtroBusca').getAttribute('autocomplete'),'off');
    assert.equal(await page.locator('#filtroBusca').inputValue(),'busca intencional');
    assert.equal(await page.locator('#email').getAttribute('autocomplete'),'username');
    assert.equal(await page.locator('#senha').getAttribute('type'),'password');
    await page.waitForFunction(()=>document.getElementById('filtroLoginAutomatico').value==='');
    await page.locator('#filtroLoginAutomatico').fill('usuario@teste.com');
    assert.equal(await page.locator('#filtroLoginAutomatico').inputValue(),'usuario@teste.com','busca manual por email permanece permitida');
    await page.evaluate(()=>document.body.insertAdjacentHTML('beforeend','<div class="filters"><input id="consultaNova"></div>'));
    await page.waitForFunction(()=>document.querySelector('#consultaNova').type==='search');
    assert.equal(await page.locator('#consultaNova').getAttribute('readonly'),'');
    await page.locator('#consultaNova').focus();
    assert.equal(await page.locator('#consultaNova').getAttribute('readonly'),null);
    await page.evaluate(()=>{
      const campo=document.getElementById('consultaNova');campo.value='usuario@teste.com';
      campo.dispatchEvent(new AnimationEvent('animationstart',{animationName:'elFilterAutofill'}));
    });
    assert.equal(await page.locator('#consultaNova').inputValue(),'','preenchimento automático tardio removido');
    console.log('OK - círculo sem texto, conteúdo dinâmico, botão, acessibilidade e spinner existente');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
