const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
  await page.route('https://foto.teste/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#bbcfdd"/></svg>'}));
  await page.setContent('<html lang="pt-BR"><body><main class="el-page"><div id="inventario"></div></main></body></html>');
  await page.addStyleTag({content:fs.readFileSync('Modulos/Estoque/Acervo/acervo.css','utf8')});await page.addStyleTag({content:fs.readFileSync('Modulos/Estoque/Acervo/acervo-tabela.css','utf8')});
  for(const arquivo of ['acervo-contagens.js','acervo-inventario-qualidade.js'])await page.addScriptTag({content:fs.readFileSync('Modulos/Estoque/Acervo/'+arquivo,'utf8')});
  await page.evaluate(()=>{
   window.salvos=[];window.aprovados=0;
   const catalogo=[{id:'c1',produto:'Cadeira um',categoria:'Cadeiras',foto_url:'https://foto.teste/primeira.jpg'},{id:'c2',produto:'Cadeira capa',categoria:'Cadeiras',foto_url:'https://foto.teste/capa.jpg',capa_categoria:true},{id:'kit',produto:'Mesa completa',tipo:'kit',categoria:'Mesas',foto_url:'https://foto.teste/mesa.jpg',capa_categoria:true},{id:'tampo',produto:'Tampo',categoria:'Peças'}];
   const componentes=[{kit_id:'kit',item_id:'tampo',quantidade:1}];
   const organizadas=AcervoContagens.organizar(catalogo,componentes);window.__categorias=organizadas.categorias.map(c=>({nome:c.nome,foto:c.foto,itens:Array.from(c.itens)}));
   const atual={id:'inv1',nome:'Contagem geral',status:'contagem',qualidade_criterios:[{id:'geral',nome:'Condição geral'}],itens:[{item_id:'c1',nome:'Cadeira um',saldo_base:2,contado:null,versao:1},{item_id:'c2',nome:'Cadeira capa',saldo_base:5,contado:null,versao:1},{item_id:'tampo',nome:'Tampo',saldo_base:3,contado:null,versao:1}]};
   window.__recriar=()=>AcervoInventarioQualidade.render({host:document.querySelector('#inventario'),atual,catalogo,componentes,esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),salvar:(b,d)=>salvos.push(d),aprovar:()=>aprovados++,cancelar:()=>{}});window.__itens=atual.itens;window.__recriar();
  });
  assert.equal(await page.locator('[data-inv-categoria=cadeiras] img').getAttribute('src'),'https://foto.teste/capa.jpg');
  const mesas=await page.evaluate(()=>__categorias.find(c=>c.nome==='Mesas'));assert.deepEqual(mesas.itens,['tampo']);assert.equal(mesas.foto,'https://foto.teste/mesa.jpg');
  assert.equal(await page.locator('[data-item]:visible').count(),2);assert.equal(await page.locator('[data-item=kit]').count(),0);
  await page.locator('[data-item=c1] [data-q]').fill('2');
  await page.locator('[data-inv-categoria=mesas]').click();assert.equal(await page.locator('[data-item]:visible').count(),1);assert.ok(await page.locator('[data-item=tampo]').isVisible());
  assert.doesNotMatch(await page.locator('#inventario').innerText(),/No cadastro|Diferen\u00e7a|Condi\u00e7\u00e3o geral|Motivo/);
  assert.equal(await page.locator('.ac-inv-tabela thead th').count(),6);
  assert.equal(await page.locator('[data-item=tampo] .ac-inv-foto-item').innerText(),'Sem foto');
  assert.equal(await page.locator('[data-item=tampo] .ac-inv-foto-item').evaluate(el=>el.getBoundingClientRect().width),await page.locator('.ac-inv-categoria-foto').first().evaluate(el=>el.getBoundingClientRect().width));
  for(const coluna of ['qtd','revisao','capa','fazer_capa'])await page.locator('[data-item=tampo] [data-quantidade='+coluna+']').fill('0');await page.locator('[data-item=tampo] [data-contar]').click();
  assert.deepEqual((await page.evaluate(()=>salvos))[0].p_quantidades,{qtd:0,revisao:0,capa:0,fazer_capa:0});assert.equal((await page.evaluate(()=>salvos))[0].p_item,'tampo');
  await page.locator('[data-inv-categoria=cadeiras]').click();assert.equal(await page.locator('[data-item=c1] [data-q]').inputValue(),'2');
  for(const [coluna,valor] of Object.entries({revisao:'1',capa:'2',fazer_capa:'0'}))await page.locator('[data-item=c1] [data-quantidade='+coluna+']').fill(valor);await page.locator('[data-item=c1] [data-contar]').click();
  assert.deepEqual((await page.evaluate(()=>salvos))[1].p_quantidades,{qtd:2,revisao:1,capa:2,fazer_capa:0});
  assert.equal(await page.locator('.ac-inv-status').count(),0);
  await page.evaluate(()=>{__itens.forEach(i=>i.primeira_contagens={qtd:i.saldo_base,revisao:0,capa:0,fazer_capa:0});__itens[0].primeira_contagens.qtd=1234;__recriar();});
  assert.match(await page.locator('.ac-inv-progresso').innerText(),/^2/);assert.equal(await page.locator('[data-item=c1] [data-q]').inputValue(),'');assert.doesNotMatch(await page.locator('#inventario').innerText(),/1234|Dif\./);assert.ok(await page.locator('#acAprovar').isDisabled());
  await page.evaluate(()=>{__itens[0].primeira_contagens.qtd=2;__itens.forEach(i=>i.segunda_contagens={qtd:i.saldo_base,revisao:0,capa:0,fazer_capa:0});__itens[1].segunda_contagens.qtd=6;__itens[2].segunda_contagens.qtd=2;__recriar();});
  assert.equal(await page.locator('.ac-contagem-bateu').count(),1);assert.equal(await page.locator('.ac-contagem-atencao').count(),1);assert.equal(await page.locator('.ac-contagem-falta').count(),1);assert.equal(await page.locator('[data-quantidade]').count(),0);assert.ok(await page.locator('#acAprovar').isEnabled());assert.match(await page.locator('#inventario').innerText(),/Dif\. estoque/);
  assert.equal(await page.locator('.ac-contagem-bateu td').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(234, 245, 237)');
  fs.mkdirSync('.tmp',{recursive:true});await page.screenshot({path:'.tmp/acervo-contagens-categorias.png',fullPage:true});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(erros,[]);
  console.log('OK: capas do catálogo, componentes de kits, troca de categoria sem perder quantidades, zero, qualidade e celular.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
