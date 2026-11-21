const assert=require('node:assert/strict'),fs=require('node:fs'),express=require('express'),{chromium}=require('playwright');
(async()=>{
 const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1887,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-20T12:00:00-03:00'));
  await page.route('**/js/core/**',r=>r.fulfill({contentType:'text/javascript',body:''}));await page.route('https://**/*',r=>r.abort());
  await page.addInitScript(()=>{
   window.aguardarContexto=async()=>({empresa_id:'empresa-a',usuario_id:'u1'});
   const pedido=(numero,cliente,pre_reserva=false)=>({numero,cliente,pre_reserva,pedido_id:'p'+numero,data:'2026-11-20',quantidade:1,local:'Pousada Bosque das Hortênsias'});
   const item={id:'i1',item_id:'i1',categoria:'Armários e estantes',nome:'Andar Estante Lotus Madeira Verde (Tampo, Prateleiras e Fundo Castanho Médio)',largura:2.84,altura:1.42,profundidade:.6,total:4,manutencao:1,pedidos:[pedido('12','Kelly Khawam')],livre_dia:{'2026-11-20':{total:4,manutencao:1,reservado:2}}};
   window.supabaseClient={rpc:async(n)=>{
    if(n==='acervo_painel')return {data:{retornos:[],ordens:[],inventarios:[],eventos:[]}};
    if(n==='acervo_proximas_saidas')return {data:[item,{...item,id:'i2',item_id:'i2',nome:'Base Estante Lotus Madeira Verde (Tampo, Prateleiras e Fundo Castanho Médio)',pedidos:[pedido('13','Maria de Oliveira e Silva'),pedido('14','Cliente com nome extenso para evento',true)]}]};
    return {data:[]};
   },from:()=>{const q={};for(const n of ['select','eq','in','order','limit','range'])q[n]=()=>q;q.then=(ok,no)=>Promise.resolve({data:[],count:0}).then(ok,no);return q;}};
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Estoque/Acervo/acervo.html');
  await page.locator('.sa-item').first().waitFor();
  await page.addScriptTag({content:fs.readFileSync('js/core/companyTheme.js','utf8')});await page.evaluate(()=>EasyLocTheme.applyTheme(EasyLocTheme.DEFAULT_THEME));
  await page.addStyleTag({content:fs.readFileSync('styles/fundo-claro.css','utf8').replace(/@import[^;]+;/g,'')});await page.addStyleTag({content:fs.readFileSync('styles/table-text.css','utf8')});
  assert.equal(await page.locator('.sa-tabela thead th').count(),10);assert.equal(await page.locator('.sa-cat small').count(),0);
  const cliente=page.locator('.sa-pedido-cliente').filter({hasText:'Kelly Khawam'});assert.match(await cliente.innerText(),/Pedido 12/);
  const medidas=[];fs.mkdirSync('.tmp/acervo-legibilidade',{recursive:true});
  for(const width of [1887,1440,1280,1024,390]){
   await page.setViewportSize({width,height:1000});
   const layout=await page.evaluate(()=>{
    const table=document.querySelector('.sa-tabela'),item=document.querySelector('.sa-item strong'),categoria=document.querySelector('.sa-categoria-titulo'),sinal=document.querySelector('.sa-sinalizacoes');
    return {width:innerWidth,tabela:table.clientWidth,item:document.querySelector('.sa-col-item').clientWidth,sinais:sinal.clientWidth,nomeFonte:parseFloat(getComputedStyle(item).fontSize),nomeCompleto:item.scrollHeight<=item.clientHeight+1,categoriaFonte:getComputedStyle(categoria).fontFamily,tituloFonte:getComputedStyle(document.querySelector('#acTitulo')).fontFamily,centralizado:getComputedStyle(categoria).textAlign,avisosInteiros:[...document.querySelectorAll('.sa-sinal')].every(e=>e.scrollWidth<=e.clientWidth+1),paginaCabe:document.documentElement.scrollWidth<=innerWidth+2};
   });medidas.push(layout);
   assert.ok(layout.item/layout.tabela>=.30,'nome recebe pelo menos 30% da tabela');assert.ok(layout.sinais<=200,'avisos não alargam a coluna');assert.ok(layout.nomeFonte>=16);assert.ok(layout.nomeCompleto);assert.equal(layout.categoriaFonte,layout.tituloFonte);assert.equal(layout.centralizado,'center');assert.ok(layout.avisosInteiros);assert.ok(layout.paginaCabe,'página cabe em '+width);
   if(width===1887||width===1440||width===390)await page.screenshot({path:'.tmp/acervo-legibilidade/desktop-'+width+'.png',fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1000});await page.locator('.sa-pedidos-clientes button').hover();await page.locator('#acervoSaidasDetalhe').waitFor({state:'visible'});assert.match(await page.locator('#acervoSaidasDetalhe').innerText(),/Maria de Oliveira e Silva/);await page.keyboard.press('Escape');
  await page.locator('[data-sa-modo=pedido]').click();assert.equal(await page.locator('.sa-item').count(),3);assert.equal(await page.locator('.sa-pedido-cliente').count(),3);assert.match(await page.locator('.sa-pedido-meta.is-pre').innerText(),/Pedido 14/);assert.match(await page.locator('.sa-pedido-meta.is-pre').innerText(),/Pré-reserva/);
  await page.screenshot({path:'.tmp/acervo-legibilidade/por-pedido.png',fullPage:true});assert.deepEqual(errors,[]);fs.writeFileSync('.tmp/acervo-legibilidade/medidas.json',JSON.stringify(medidas,null,2));console.log('OK: 10 colunas, pedido e cliente juntos, categorias sem totais e com fonte do título, nomes inteiros maiores, avisos com quebra, vários pedidos e telas de 390 a 1887 px.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
