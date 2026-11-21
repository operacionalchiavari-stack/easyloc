const assert=require('node:assert/strict'),express=require('express'),{chromium}=require('playwright');
(async()=>{
 const app=express();app.get('/hover',(req,res)=>res.send('<html><head><link rel="stylesheet" href="/styles/global.css"><link rel="stylesheet" href="/Modulos/Estoque/Acervo/acervo-tabela.css"></head><body><main><section id="items"></section></main></body></html>'));app.use(express.static(process.cwd()));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:760}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/hover');
  await page.evaluate(()=>{window.IntersectionObserver=class{observe(){}disconnect(){}};window.fixture=[{nome:'Mesa',total:100,manutencao:2,reservado:30,capa:{usa:false},pedidos:Array.from({length:16},(_,i)=>({data:'2026-11-20',numero:100+i,cliente:'Cliente '+i,local:'Espaço de eventos',quantidade:2})),livre_dia:{'2026-11-20':{total:100,manutencao:2,reservado:30,reservas:Array.from({length:16},(_,i)=>({numero:100+i,cliente:'Cliente '+i,local:'Espaço de eventos',quantidade:2,entrega:'2026-11-20',coleta:'2026-11-21'}))}}}];});
  await page.addScriptTag({url:'/Modulos/Estoque/Acervo/acervo-saidas.js'});
  await page.evaluate(()=>AcervoSaidas.render({host:document.getElementById('items'),empresa:'test',esc:v=>String(v??''),sb:{rpc:async()=>({data:fixture})}}));
  const trigger=page.locator('[aria-label="Ver reservas do dia"]');
  await trigger.evaluate(e=>{e.style.position='fixed';e.style.left='850px';e.style.top='350px';e.style.zIndex='2';});
  await trigger.hover();const tooltip=page.locator('#acervoSaidasDetalhe');await tooltip.waitFor({state:'visible'});
  const [anchor,box]=await Promise.all([trigger.boundingBox(),tooltip.boundingBox()]);assert.ok(box.x+box.width<anchor.x,'card alto fica ao lado do alvo');assert.ok(box.y>=12&&box.y+box.height<=748);
  await page.evaluate(()=>{window.changes=0;new MutationObserver(rs=>{changes+=rs.filter(r=>r.attributeName==='hidden').length;}).observe(document.querySelector('.sa-card'),{attributes:true});});
  for(let i=0;i<20;i++)await page.mouse.move(anchor.x+anchor.width/2+(i%3),anchor.y+anchor.height/2+(i%2));
  await page.waitForTimeout(250);assert.ok(await tooltip.isVisible());assert.equal(await page.evaluate(()=>changes),0,'sem abrir e fechar ao mover dentro do campo');
  await page.mouse.move(box.x+box.width-15,anchor.y+10,{steps:4});await page.waitForTimeout(200);assert.ok(await tooltip.isVisible(),'mouse pode entrar no card');
  await page.mouse.wheel(0,220);await page.waitForTimeout(200);assert.ok(await tooltip.isVisible(),'rolagem do card não fecha');assert.ok(await tooltip.evaluate(e=>e.scrollTop>0));
  await page.mouse.move(20,20);await page.waitForTimeout(220);assert.ok(await tooltip.isHidden(),'fecha ao sair do card');
  await trigger.focus();await tooltip.waitFor({state:'visible'});assert.equal(await trigger.getAttribute('aria-describedby'),'acervoSaidasDetalhe');await page.keyboard.press('Escape');assert.ok(await tooltip.isHidden());
  await page.mouse.move(anchor.x+anchor.width/2,anchor.y+anchor.height/2);await tooltip.waitFor({state:'visible'});await page.evaluate(()=>window.dispatchEvent(new Event('resize')));assert.ok(await tooltip.isHidden());
  await page.setViewportSize({width:390,height:640});await trigger.evaluate(e=>{e.style.left='150px';e.style.top='280px';});await page.mouse.move(20,20);await page.waitForTimeout(180);const alvoMobile=await trigger.boundingBox();await page.mouse.move(alvoMobile.x+alvoMobile.width/2,alvoMobile.y+alvoMobile.height/2);await tooltip.waitFor({state:'visible'});const mobile=await tooltip.boundingBox();assert.ok(mobile.x>=12&&mobile.x+mobile.width<=378);assert.ok(mobile.y>=12&&mobile.y+mobile.height<=628);
  await page.waitForTimeout(300);assert.ok(await tooltip.isVisible(),'sem oscilação mesmo quando o espaço exige sobreposição');assert.deepEqual(errors,[]);
  console.log('OK: hover estável, card alto ao lado, passagem do mouse, rolagem interna, fechamento ao sair/Escape/resize e limites no celular.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
