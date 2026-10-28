const express=require('express'),{chromium}=require('playwright'),{installMock}=require('../mock-projetos.cjs');
module.exports=async function iniciar(){
 const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 async function pagina(viewport={width:1440,height:900}){const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.fulfill({contentType:'text/javascript',body:''}));await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#eee"/></svg>'}));
  await page.addInitScript(installMock,{token:true});await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');await page.locator('[data-gateway-tile="catalogo"]').waitFor();return {page,errors};
 }
 return {pagina,fechar:async()=>{await browser.close();await new Promise(r=>server.close(r));}};
};
