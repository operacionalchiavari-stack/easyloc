const {chromium}=require('playwright');
const fs=require('fs'),assert=require('assert');
(async()=>{
  const browser=await chromium.launch({channel:'msedge'});
  try{
    const page=await browser.newPage();
    await page.setContent(fs.readFileSync('Modulos/Logistica/cadastro-caminhoes.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link[^>]*>/gi,''));
    await page.evaluate(()=>{
      crypto.randomUUID=()=> 'foto-teste';window.requestAnimationFrame=()=>0;window.uploads=[];
      window.supabaseClient={storage:{from:bucket=>({upload:async(path,file)=>{window.uploads.push({bucket,path,type:file.type});return {error:null};},getPublicUrl:path=>({data:{publicUrl:'https://fotos.test/'+path}})})}};
    });
    await page.addScriptTag({path:'Modulos/Logistica/cadastro-caminhoes.js'});
    await page.evaluate(()=>abrirModalCaminhao());
    const file=page.locator('#caminhaoFotoArquivo');
    await file.setInputFiles({name:'caminhao.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
    assert.equal(await page.locator('#caminhaoFotoPreview').getAttribute('hidden'),null);
    const url=await page.evaluate(()=>enviarFotoCaminhao('empresa-teste'));
    assert.ok(url.startsWith('https://fotos.test/empresa-teste/'));
    assert.equal(await page.locator('#caminhaoFotoUrl').inputValue(),url);
    assert.equal(await page.evaluate(()=>uploads[0].bucket),'caminhoes-fotos');
    await page.evaluate(url=>abrirModalDetalheCaminhao({id:'1',modelo:'Teste',foto_url:url}),url);
    assert.equal(await file.isDisabled(),true);
    assert.equal(await page.locator('#caminhaoRemoverFoto').isDisabled(),true);
    await page.evaluate(()=>prepararEdicaoCaminhao());
    assert.equal(await file.isDisabled(),false);
    await page.locator('#caminhaoRemoverFoto').click();
    assert.equal(await page.evaluate(()=>enviarFotoCaminhao('empresa-teste')),null);
    await page.evaluate(()=>abrirModalCaminhao());
    assert.equal(await page.locator('#caminhaoFotoUrl').inputValue(),'');
    await page.evaluate(()=>{
      window.aguardarContexto=async()=>({empresa_id:'e1'});window.__salvos=[];window.__avisos=[];
      window.mostrarAlerta=t=>__avisos.push(t);window.carregarCaminhoes=()=>{};
      window.supabaseClient.from=()=>({insert:async r=>{__salvos.push(r[0]);return {};}});
    });
    await page.locator('#modeloInput').fill('Mercedes');await page.locator('#codigoInput').fill('M');
    for(const id of ['larguraInput','alturaInput','comprimentoInput'])await page.locator('#'+id).fill('2');
    await page.locator('#tipoInput').selectOption('terceirizado');
    assert.equal(await page.locator('#empresaInput').getAttribute('required'),'');
    for(const [id,valor] of [['cnpjInput','11222333000181'],['empresaInput','Transportadora Teste'],['telefoneInput','(21) 99999-9999']]){
      await page.evaluate(()=>salvarCaminhao());assert.equal(await page.evaluate(()=>__salvos.length),0,'terceirizado incompleto nao salva');
      assert.equal(await page.evaluate(()=>document.activeElement.id),id);
      await page.locator('#'+id).fill(valor);
    }
    await page.evaluate(()=>salvarCaminhao());assert.equal(await page.evaluate(()=>__salvos.length),1);
    await page.evaluate(()=>abrirModalCaminhao());await page.locator('#tipoInput').selectOption('proprio');
    assert.equal(await page.locator('#empresaInput').getAttribute('required'),null);
    await page.locator('#modeloInput').fill('Frota propria');await page.locator('#codigoInput').fill('P');
    for(const id of ['larguraInput','alturaInput','comprimentoInput'])await page.locator('#'+id).fill('2');
    await page.evaluate(()=>salvarCaminhao());assert.equal(await page.evaluate(()=>__salvos.length),2,'proprio continua sem obrigacao dos dados da proprietaria');
    console.log('OK: empresa proprietaria obrigatoria para terceirizado e opcional para proprio.');
    console.log('OK: upload, preview, stored photo, readonly detail, edit, remove and reset.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
