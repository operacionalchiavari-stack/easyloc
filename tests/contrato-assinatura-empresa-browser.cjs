const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base='http://acervo.teste/';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();
  await page.route('**/*',r=>{
   const file=path.join(root,decodeURIComponent(new URL(r.request().url()).pathname));
   if(fs.existsSync(file)&&fs.statSync(file).isFile())return r.fulfill({body:fs.readFileSync(file),contentType:{'.mjs':'text/javascript','.css':'text/css','.html':'text/html'}[path.extname(file)]||'text/plain'});
   return r.fulfill({body:'',contentType:'text/html'});
  });
  await page.goto(base);
  // 15/11/2026: a assinatura saiu de Modelos de contrato e foi para Parâmetros › Comercial (parametros-assinatura.js)
  await page.setContent('<div id="host"></div>');
  await page.evaluate(async()=>{
   window.__CONTEXT={empresa_id:'e1'};window.alerta=()=>{};window.__assinatura=null;
   window.supabaseClient={from(t){let payload;const q={select:()=>q,eq:()=>q,order:()=>q,maybeSingle:()=>q,upsert:p=>{payload=p;return q;},then(resolve){if(payload)window.__assinatura=payload;return Promise.resolve({data:t==='contratos_assinaturas_empresa'?window.__assinatura:[],error:null}).then(resolve);}};return q;}};
   await new Promise((ok)=>{const sc=document.createElement('script');sc.src='/Modulos/Configuracoes/Parametros/parametros-assinatura.js';sc.onload=ok;document.head.append(sc);});
   window.__montar=async()=>{document.getElementById('host').innerHTML='';await window.carregarParametrosAssinatura(document.getElementById('host'),'e1');};await window.__montar();
  });
  await page.locator('#prAssNome').fill('Representante Chiavari');
  await page.locator('#prAssArquivo').setInputFiles({name:'assinatura.png',mimeType:'image/png',buffer:Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=300;c.height=100;const ctx=c.getContext('2d');ctx.font='30px cursive';ctx.fillText('Empresa',10,50);return c.toDataURL('image/png').split(',')[1];}),'base64')});
  await page.waitForFunction(()=>document.querySelector('#prAssPreview').naturalWidth>0);
  await page.locator('#prAssSalvar').click();
  await page.waitForFunction(()=>window.__assinatura?.imagem.startsWith('data:image/png;base64,'));
  await page.evaluate(()=>window.__montar());
  assert.equal(await page.locator('#prAssNome').inputValue(),'Representante Chiavari');
  const resultado=await page.evaluate(async()=>{
   const m=await import('/js/core/contracts.mjs');
   const html=m.textoParaHtml(m.blocoAssinaturasContrato({assinatura_empresa:window.__assinatura,cliente:{nome:'Kelly Khawam'}}));
   const div=document.createElement('div');div.innerHTML=html;document.body.append(div);
   return {texto:div.textContent,img:div.querySelector('img')?.src,classe:div.querySelector('table')?.className};
  });
  assert.match(resultado.texto,/Assinatura do cliente/);assert.match(resultado.texto,/Kelly Khawam/);
  assert.match(resultado.texto,/Representante Chiavari/);assert.match(resultado.img,/^data:image\/png;base64,/);
  assert.equal(resultado.classe,'contrato-assinaturas');
  await page.locator('#prAssRemover').click();
  await page.waitForFunction(()=>window.__assinatura.imagem==='');
  assert.equal(fs.readFileSync(path.join(root,'Modulos/Comercial/Contratos/contratos.html'),'utf8').includes('Assinatura da empresa'),false,'saiu de Modelos de contrato');
  console.log('OK (Parâmetros): cadastro, persistência, reutilização, assinatura do cliente e remoção.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
