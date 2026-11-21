const {chromium}=require('playwright'),express=require('express'),assert=require('node:assert/strict'),fs=require('node:fs');
const {installMock}=require('./mock-projetos.cjs');
(async()=>{
 const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const material of ['Tinta','Tecido']){
   const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
   await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect x="45" y="100" width="510" height="200" rx="35" fill="#356c77"/></svg>'}));
   await page.addInitScript(material=>{
    const tipo=material==='Tinta'?'tinta':'tecido';
    if(!sessionStorage.getItem('mockdb'))sessionStorage.setItem('mockdb',JSON.stringify({projetos:[{id:'p1',cliente_id:'client',noivos:'Ana & Bruno',data_evento:'2027-05-22',local_evento:'Jardim',status:'rascunho',dados:{ambientes:[{id:'a1',nome:'Lounge',itens:[{item_id:'1',quantidade:4}],renders:[]}]}}],calls:[],uploads:[],removed:[],seq:3,saldo:0,
      fotos:[{id:'foto-azul',url:'https://fixture/pronta-azul.png',tipo,titulo:material+' SV-202 Azul Petróleo',personalizacao:{item_id:'1',tipo,escolha:{persId:'pers1',nome:'Personalização',escolhas:{[material]:{opcao_id:'o2',codigo:'SV-202',nome:'Azul Petróleo'}},valor:999}}}]}));
   },material);
   await page.addInitScript(installMock,{token:true,cartela:true});
   await page.addInitScript(material=>{
    const sb=window.supabaseClient,rpc=sb.rpc.bind(sb),invoke=sb.functions.invoke.bind(sb.functions),db=window.mockdb;
    sb.rpc=async(name,args)=>{
     if(name==='catalogo_creditos_saldo')return{data:{saldo:db.saldo,custos:{tecido:3,render:5,planta:2,layout:4}},error:null};
     const resposta=await rpc(name,args);
     if(name==='personalizacao_lista')for(const p of resposta.data || []){if(p.vinculo_id==='1'){p.tipo=material==='Tinta'?'Pintura':'Forração';p.tipos_cartela=[material];}}
     if(name==='personalizacao_cartelas')resposta.data.variaveis[0].tipo=material;
     return resposta;
    };
    sb.functions.invoke=async(name,args)=>{
     if(name!=='studio-ai-engine')return invoke(name,args);
     const meta=args.body.scene.personalizacao;
     const foto={id:'foto-verde',url:'https://fixture/pronta-verde.png',titulo:meta.descricao,tipo:meta.tipo,personalizacao:meta};
     db.fotos.push(foto);db.invokes=(db.invokes || []).concat({name,body:args.body});sessionStorage.setItem('mockdb',JSON.stringify(db));
     return{data:{providerStatus:'ok',images:[{url:foto.url}],personalizacaoSalva:foto},error:null};
    };
   },material);
   const url='http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html';
   const abrir=async()=>{
    await page.goto(url);await page.locator('[data-gateway-tile="catalogo"]').click();
    if(await page.locator('[data-entry-project="p1"]').count())await page.locator('[data-entry-project="p1"]').click();
    await page.locator('.cpj-entry').waitFor({state:'detached'});await page.locator('[data-home-category="sofas"]').click();await page.locator('[data-grid-item="1"]').click();
    await page.locator('.catalog-product-section[data-product-id="1"] .product-bespoke-icon').click();
   };
   await abrir();let dlg=page.locator('dialog.cpj-pers-dialog[open]');
   await dlg.locator('[data-pers-render="foto-azul"]').waitFor();
   assert.equal(await dlg.locator('[data-pers-aba="renderizadas"]').getAttribute('aria-selected'),'true');
   assert.match(await dlg.locator('[data-pers-render="foto-azul"]').innerText(),/SV-202.*Azul Petróleo/);
   assert.equal(await dlg.locator('[data-pers-ia]').isVisible(),false,'versões prontas não oferecem nova IA');
   await dlg.locator('[data-pers-aba="novas"]').click();
   assert.match(await dlg.locator('[data-pers-aba="novas"]').innerText(),new RegExp(material==='Tinta'?'Tintas sem renderização':'Tecidos sem renderização','i'));
   assert.equal(await dlg.locator('[data-pers-opcao="o2"]').count(),0,'a opção já renderizada sai da cartela de novas versões');
   assert.equal(await dlg.locator('[data-pers-opcao="o1"]').count(),1);
   await dlg.locator('[data-pers-aba="renderizadas"]').click();await dlg.locator('[data-pers-render="foto-azul"]').click();
   assert.match(await dlg.locator('.cpj-pers-total').innerText(),/80,00/,'reutilização calcula preço atual em vez do preço antigo da imagem');
   fs.mkdirSync('.tmp/personalizacao-renderizadas',{recursive:true});await dlg.screenshot({path:'.tmp/personalizacao-renderizadas/'+material+'.png'});
   await dlg.locator('[type="submit"]').click();await dlg.waitFor({state:'detached'});
   await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('mockdb')).projetos[0].dados.ambientes[0].itens[0].personalizacao_imagem_id==='foto-azul');
   let db=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mockdb')));
   assert.equal((db.invokes || []).length,0,'reutilização com saldo zero não chama IA');assert.equal(db.projetos[0].dados.ambientes[0].itens[0].quantidade,4);
   assert.equal(db.projetos[0].dados.ambientes[0].itens[0].personalizacao_valor,80);
   // Uma nova escolha ainda pode ser renderizada, e passa a integrar a galeria.
   await page.evaluate(()=>{window.mockdb.saldo=100;sessionStorage.setItem('mockdb',JSON.stringify(window.mockdb));});
   await page.locator('.catalog-product-section[data-product-id="1"] .product-bespoke-icon').click();
   await dlg.locator('[data-pers-render="foto-azul"]').waitFor();await dlg.locator('[data-pers-aba="novas"]').click();await dlg.locator('[data-pers-opcao="o1"]').click();await dlg.locator('[data-pers-ia]').click();
   await page.locator('.catalog-notification.has-photo').waitFor();
   await page.locator('.catalog-product-section[data-product-id="1"] .product-bespoke-icon').click();await dlg.locator('[data-pers-render="foto-verde"]').waitFor();
   assert.equal(await dlg.locator('[data-pers-render]').count(),2);
   await dlg.locator('[data-pers-render="foto-verde"]').click();await dlg.locator('[type="submit"]').click();await dlg.waitFor({state:'detached'});
   await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('mockdb')).projetos[0].dados.ambientes[0].itens[0].personalizacao_imagem_id==='foto-verde');
   db=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mockdb')));assert.equal(db.invokes.length,1,'usar a imagem recém criada não gera novamente');
   // A imagem continua disponível numa nova carga da página.
   await abrir();await dlg.locator('[data-pers-render="foto-verde"]').waitFor();assert.equal(await dlg.locator('[data-pers-render]').count(),2);
   await dlg.locator('[data-pers-aba="novas"]').click();assert.equal(await dlg.locator('[data-pers-opcao]').count(),0,'todas as opções já prontas ficam fora das novas');
   assert.deepEqual(errors,[]);console.log('PASS '+material+': galeria inicial, código e nome, preço atual, reutilização sem saldo nem nova IA, novas combinações e persistência');
   await page.close();
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
