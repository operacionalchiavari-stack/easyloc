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
    console.log('OK: upload, preview, stored photo, readonly detail, edit, remove and reset.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
