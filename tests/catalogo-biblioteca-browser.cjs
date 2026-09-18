const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');const path=require('node:path');const os=require('node:os');
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});try{

// ===== Cenário 1: decorador (externo) — só visualiza, sem upload/remoção =====
{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#8fae9b"/></svg>');
 await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 await page.addInitScript(()=>{
  sessionStorage.setItem('catalogo_token','test');
  window.supabaseClient={rpc:async(name)=>{
   if(name==='catalogo_validar_sessao') return {data:{valido:true,empresa_id:'company',cliente_id:'client'}};
   if(name==='catalogo_carregar') return {data:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:[
     {id:'1',tipo:'Item',produto:'Sofá Um',categoria:'Sofás',foto_url:'https://fixture/sofa.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
     {id:'2',tipo:'Item',produto:'Bar Um',categoria:'Bares',foto_url:'https://fixture/bar.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
   ]}};
   if(name==='biblioteca_carregar') return {data:{fotos:[
     {id:'f1',categoria:'Sofás',titulo:null,url:'https://fixture/biblioteca/sofa-1.png',path:'company/sofas/1.png',ordem:null},
     {id:'f2',categoria:'Sofás',titulo:null,url:'https://fixture/biblioteca/sofa-2.png',path:'company/sofas/2.png',ordem:null},
   ]}};
   return {data:null};
  }};
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 // Primeira tela agora é o Portal — o bloco "Biblioteca" leva direto pra
 // lá (o botão homônimo que existia no cabeçalho foi removido a pedido
 // do usuário, ver .catalog-page-label em catalogo.css/mjs).
 await page.locator('.catalog-gateway').waitFor();
 await page.locator('[data-gateway-tile="biblioteca"]').click();
 await page.locator('#catalogBiblioteca:not(.hidden)').waitFor();
 assert.equal(await page.locator('#catalogGrid').isVisible(),false,'Grade de produtos some quando a Biblioteca abre');
 assert.equal(await page.locator('[data-library-folder]').count(),2,'Uma pasta por categoria existente (Sofás, Bares)');
 const sofaMeta=await page.locator('[data-library-folder="sofas"] .catalog-grid-card-meta').textContent();
 assert.equal(sofaMeta.trim(),'2 fotos','Contagem de fotos da pasta Sofás bate com as fotos carregadas');
 const barMeta=await page.locator('[data-library-folder="bares"] .catalog-grid-card-meta').textContent();
 assert.equal(barMeta.trim(),'0 fotos','Pasta sem fotos ainda mostra 0, não fica escondida');
 await page.locator('[data-library-folder="sofas"]').click();
 await page.locator('#catalogBibliotecaDetail:not(.hidden)').waitFor();
 assert.equal(await page.locator('#catalogBibliotecaDetailTitle').textContent(),'Sofás');
 assert.equal(await page.locator('.catalog-biblioteca-photo').count(),2,'As 2 fotos da categoria aparecem na tela de detalhe');
 assert.equal(await page.locator('#catalogBibliotecaUpload').isVisible(),false,'Decorador não vê o botão de adicionar fotos');
 assert.equal(await page.locator('.catalog-biblioteca-photo-remove').count(),0,'Decorador não vê botão de remover foto');
 await page.locator('#catalogBibliotecaBack').click();
 await page.locator('#catalogBibliotecaFolders:not(.hidden)').waitFor();
 // Painel 3D e Biblioteca são mutuamente exclusivos (Biblioteca já está
 // aberta neste ponto — nunca foi fechada, só navegou pasta<->lista).
 // Sem o botão "Painel 3D" solto no cabeçalho (removido), o único jeito
 // de chegar lá agora é voltar pro Portal (a logo já fecha a Biblioteca
 // sozinha) e entrar pelo bloco "Módulo 3D".
 assert.equal(await page.locator('#catalogBiblioteca').isVisible(),true);
 await page.locator('.catalog-brand').click();
 await page.locator('.catalog-gateway').waitFor();
 assert.equal(await page.locator('#catalogBiblioteca').isVisible(),false,'Voltar pro Portal fecha a Biblioteca');
 await page.locator('[data-gateway-tile="modulo3d"]').click();
 await page.locator('[data-modulo3d-card="estudio"]').click();
 assert.equal(await page.locator('#catalogBiblioteca').isVisible(),false,'Painel 3D e Biblioteca continuam mutuamente exclusivos');
 assert.equal(await page.locator('#catalogStudio').isVisible(),true);
 await page.locator('.catalog-brand').click();
 assert.equal(await page.locator('#catalogGrid').isVisible(),true,'Logo fecha qualquer painel aberto e volta pro Portal');
 assert.equal(await page.locator('.catalog-gateway').isVisible(),true,'Portal é o que aparece de volta ao clicar na logo');
 await page.screenshot({path:path.join(os.tmpdir(),'catalogo-biblioteca-decorador.png')});
 assert.deepEqual(errors,[]);
 await page.close();
}

// ===== Cenário 2: equipe interna — upload e remoção de foto =====
{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await page.addInitScript(()=>{
  sessionStorage.setItem('login_ok','1');
  function builder(resolveValue){
   return new Proxy({},{get(_t,prop){
    if(prop==='then') return (resolve)=>resolve(resolveValue());
    return ()=>builder(resolveValue);
   }});
  }
  window.testInserted=[];window.testDeleted=[];window.testUploaded=[];
  window.supabaseClient={
   auth:{
    getSession:async()=>({data:{session:{user:{id:'user-1'}}},error:null}),
    getUser:async()=>({data:{user:{id:'user-1'}},error:null}),
   },
   from(table){
    if(table==='usuarios_empresas') return builder(()=>({data:{empresa_id:'company'},error:null}));
    if(table==='biblioteca_fotos'){
     const b=builder(()=>({data:[],error:null}));
     return {
      insert(row){
       window.testInserted.push(row);
       const saved={id:'novo-1',categoria:row.categoria,titulo:null,url:row.url,path:row.path,ordem:null};
       return {select:()=>({single:async()=>({data:saved,error:null})})};
      },
      delete(){
       return {eq:async(_col,id)=>{window.testDeleted.push(id);return {error:null};}};
      },
     };
    }
    return b_default();
    function b_default(){return builder(()=>({data:[],error:null}));}
   },
   rpc:async(name,params)=>{
    if(name==='funcionario_contexto') return {data:{ativo:true,administrador_legado:true},error:null};
    if(name==='catalogo_carregar_interno') return {data:{empresa:{nome:'Chiavari'},decorador:null,itens:[
     {id:'1',tipo:'Item',produto:'Sofá Um',categoria:'Sofás',foto_url:'https://fixture/sofa.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]},
    ]}};
    if(name==='biblioteca_carregar_interno') return {data:{fotos:[]}};
    return {data:null,error:null};
   },
   storage:{from(bucket){return {
    upload:async(path,file,opts)=>{window.testUploaded.push({bucket,path,type:opts?.contentType});return {error:null};},
    getPublicUrl:(path)=>({data:{publicUrl:'https://fixture/biblioteca/'+path}}),
    remove:async(paths)=>{window.testDeleted.push(...paths);return {error:null};},
   };}},
  };
  window.confirm=()=>true;
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('.catalog-gateway').waitFor();
 await page.locator('[data-gateway-tile="biblioteca"]').click();
 await page.locator('[data-library-folder="sofas"]').click();
 await page.locator('#catalogBibliotecaDetail:not(.hidden)').waitFor();
 assert.equal(await page.locator('#catalogBibliotecaUpload').isVisible(),true,'Equipe interna vê o botão de adicionar fotos');
 assert.equal(await page.locator('.catalog-biblioteca-empty').textContent(),'Nenhuma foto nesta categoria ainda.');
 await page.locator('#catalogBibliotecaUploadInput').setInputFiles({name:'foto.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a','hex')});
 await page.waitForFunction(()=>document.querySelectorAll('.catalog-biblioteca-photo').length===1);
 assert.equal(await page.evaluate(()=>window.testUploaded.length),1,'Upload chamado no bucket biblioteca');
 assert.equal(await page.evaluate(()=>window.testUploaded[0].bucket),'biblioteca');
 assert.match(await page.evaluate(()=>window.testUploaded[0].path),/^company\/sofas\//,'Caminho do arquivo começa com empresa/categoria');
 assert.equal(await page.evaluate(()=>window.testInserted[0].categoria),'Sofás','Linha gravada usa o rótulo da categoria, não o slug');
 assert.equal(await page.locator('.catalog-biblioteca-photo-remove').count(),1,'Equipe interna vê botão de remover foto');
 await page.locator('.catalog-biblioteca-photo-remove').click();
 await page.waitForFunction(()=>document.querySelectorAll('.catalog-biblioteca-photo').length===0);
 assert.equal(await page.evaluate(()=>window.testDeleted.includes('novo-1')),true,'Linha removida da tabela');
 assert.match(await page.evaluate(()=>window.testDeleted[window.testDeleted.length-1]),/^company\/sofas\//,'Arquivo removido do storage também');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Sem overflow horizontal no mobile');
 await page.screenshot({path:path.join(os.tmpdir(),'catalogo-biblioteca-interno-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 await page.close();
}

console.log('PASS: pastas por categoria, contagem de fotos, decorador só visualiza, equipe faz upload/remoção, exclusividade com Painel 3D, logo fecha overlays, mobile sem overflow');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
