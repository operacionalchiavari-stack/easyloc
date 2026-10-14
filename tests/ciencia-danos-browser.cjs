const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const os=require('node:os');
(async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/' || req.url==='/fixture'){
   res.setHeader('Content-Type','text/html; charset=utf-8');
   return res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ciencia-danos.css"></head><body>
    <div style="overflow:auto"><table><tbody><tr><td>01/10/2026</td><td>5479</td><td>Mesa</td><td>1</td><td>Marcenaria</td><td>Montagem</td><td>1310</td><td>Pé quebrado</td><td id="ciencia"></td></tr></tbody></table></div>
    <script>window.calls=[];window.status='pendente';window.google={script:{run:new Proxy({}, {get(_,fn){if(fn==='withSuccessHandler')return function(ok){return {withFailureHandler(){return new Proxy({}, {get(_,method){return (...args)=>{window.calls.push({method,args});if(method==='danoCienciaFuncionarios')return ok([{id:'m',nome:'Maria Montagem',temPin:true},{id:'n',nome:'Sem PIN',temPin:false}]);if(args[2]!=='4567')return ok({ok:false,msg:'PIN inválido'});window.status=args[3]==='confirmar'?'confirmado':'contestado';ok({ok:true});};}})}};};}})}};
    window.carregar=()=>{document.getElementById('ciencia').innerHTML=window.danoCienciaHtml('OS_1',{status:window.status,equipe:'montagem',nome:'Maria Montagem'});};</script>
    <script src="/ciencia-danos.js"></script><script>carregar();</script></body></html>`);
  }
  const file=path.join(__dirname,'..','Modulos','Chiavari','CentralMetas',path.basename(req.url));
  if(!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/css');fs.createReadStream(file).pipe(res);
 }).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
  await page.getByRole('button',{name:'Conferir dano'}).click();
  await page.getByRole('heading',{name:'Ciência do dano'}).waitFor();
  assert.match(await page.locator('.ciencia-resumo').innerText(),/5479.*Pé quebrado/);
  assert.equal(await page.locator('option[value=n]').getAttribute('disabled'),'');
  await page.getByLabel('Funcionário responsável pela ciência').selectOption('m');
  await page.getByLabel('Seu PIN individual').fill('0000');
  await page.getByRole('button',{name:'Registrar resposta'}).click();
  await page.getByText('PIN inválido',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Seu PIN individual').inputValue(),'');
  await page.getByLabel('Seu PIN individual').fill('4567');
  await page.screenshot({path:path.join(os.tmpdir(),'rh-ciencia-dano-desktop.png')});
  await page.getByRole('button',{name:'Registrar resposta'}).click();
  await page.getByText('Ciência confirmada',{exact:true}).waitFor();
  await page.reload();await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Conferir dano'}).click();
  await page.getByLabel('Resposta').selectOption('contestar');
  await page.getByLabel('Justificativa').fill('Não foi ocasionado na montagem.');
  await page.getByLabel('Funcionário responsável pela ciência').selectOption('m');
  await page.getByLabel('Seu PIN individual').fill('4567');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(os.tmpdir(),'rh-ciencia-dano-mobile.png')});
  await page.getByRole('button',{name:'Registrar resposta'}).click();
  await page.getByText('Atribuição contestada',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: ciência com PIN, erro e nova tentativa, confirmação, contestação e layout mobile.');
 }finally{await browser.close();server.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
