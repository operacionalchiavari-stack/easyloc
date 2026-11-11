const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const BASE='http://localhost:9902/';
const mock=`(()=>{
 const pessoa={id:'u1',email:'equipe@teste.local'};window.__chamadas=[];window.__enviados=[];window.__cameraParou=0;
 const itens=()=>[{chave:'s1|i1',linha:'s1',item_id:'i1',item_origem:'i1',nome:'Cadeira Tiffany',codigo:'CAD1',setor:'Estoque Geral',esperado:2,separado:0,necessario:2,producao:0,confirmadas:0,prontas:0},{chave:'s2|i2',linha:'s2',item_id:'i2',item_origem:'kit',nome:'Tampo de mesa',codigo:'TAM1',kit:'Mesa Nice',setor:'Estoque Geral',esperado:1,separado:0,necessario:1,producao:0,confirmadas:0,prontas:0}];
 window.__bases={ida:{pedido:{id:'p1',numero:'8',cliente:'Kelly Khawam',local:'Vale dos Desejos',data:'2026-11-03'},itens:itens(),etapa:'ida',token:'1',pode_editar:true,concluido:false,avarias:[]},volta:{pedido:{id:'p2',numero:'9',cliente:'Kelly Khawam',local:'Vale dos Desejos',data:'2026-11-03'},itens:itens(),etapa:'volta',token:'1',pode_editar:true,concluido:false,avarias:[]}};
 window.__capas=[{chave:'cap1',item_id:'i1',pedido_id:'p1',nome:'Capa de cadeira',usa_capa:true,configurado:true,quantidade:null,danificadas:0,capacidade:1,versao:0,concluida:false}];
 const vistos=new Set();
 const sb={auth:{getSession:async()=>({data:{session:sessionStorage.getItem('testlogged:'+window.__authKey)?{user:pessoa}:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signInWithPassword:async()=>{sessionStorage.setItem('testlogged:'+window.__authKey,'1');return {data:{user:pessoa}};},signOut:async(options)=>{if(options.scope!=='local')throw Error('Sair deve encerrar apenas a sessao da Triagem');sessionStorage.removeItem('testlogged:'+window.__authKey);}},
 functions:{invoke:async()=>({data:{obrigatorio:false}})},storage:{from:()=>({upload:async(path)=>{window.__enviados.push(path);return {};}})},
 from:t=>{const q={select:()=>q,eq:()=>q,in:()=>q,then:f=>f({data:t==='usuarios_empresas'?[{empresa_id:'e1'}]:t==='empresas'?[{id:'e1',nome:'Chiavari'}]:[]})};return q;},
 rpc:async(n,a)=>{window.__chamadas.push([n,a]);const b=window.__bases[a.p_etapa||'ida'];
  if(n==='funcionario_contexto')return {data:{ativo:true,nome:'Joao da Triagem'}};
  if(n==='catalogo_capas_publico')return {data:{portal:'http://localhost:9902/capa-empresa.svg'}};
  if(n==='catalogo_vitrine_login')return {data:{nome:'Chiavari',logo_url:'http://localhost:9902/logo-empresa.svg'}};
  if(n==='pedido_fluxo_fila')return {data:Object.values(window.__bases).filter(b=>!b.concluido).map(b=>({id:b.pedido.id,numero_pedido:b.pedido.numero,cliente_nome:b.pedido.cliente,local_nome:b.pedido.local,data_entrega:'2026-11-03',data_coleta:'2026-11-03',fluxo_etapa:b.etapa==='ida'?'triagem':'triagem_retorno'}))};
  if(n==='triagem_app_base')return {data:structuredClone(b)};
  if(n==='capas_pedido')return {data:a.p_etapa==='triagem'?structuredClone(window.__capas.map(r=>({...r,concluida:window.__bases.ida.concluido}))):[]};
  if(n==='capas_contagem_salvar'){window.__capas=window.__capas.map(r=>({...r,...a.p_contagens.find(c=>c.chave===r.chave),versao:r.versao+1}));return {data:structuredClone(window.__capas)};}
  if(n==='triagem_app_ler'){
   if(a.p_codigo==='OUTRO')return {error:{message:'Esta etiqueta pertence a outro pedido'}};
   const codigo=a.p_codigo.replace(/^ACERVO:(ENV|ITEM|PAT):/,'');
   const p=b.itens.find(i=>i.codigo===codigo)||b.itens[0],env=a.p_codigo.includes(':ENV:');
   if(a.p_etapa==='volta')return {data:{chave:p.chave,tipo:env?'ENV':'ITEM',codigo,unico:env}};
   if(env&&vistos.has(codigo))return {error:{message:'Esta etiqueta ja foi conferida'}};
   if(p.separado>=p.esperado)return {error:{message:'Quantidade completa'}};
   p.separado++;if(env)vistos.add(codigo);b.token=String(Number(b.token)+1);
   return {data:{base:structuredClone(b),chave:p.chave}};
  }
  if(n==='triagem_app_finalizar'){
   b.concluido=true;if(a.p_etapa==='volta')b.registro={danificados:a.p_danificados,primeira_contagem:a.p_primeira,itens:b.itens.map(p=>({chave:p.chave,conferido:a.p_quantidades[p.chave]}))};
   return {data:structuredClone(b)};
  }
  return {data:[]};
 }};
 window.supabase={createClient:(_url,_key,options)=>{window.__authKey=options.auth.storageKey;return sb;}};
 window.BarcodeDetector=class{static async getSupportedFormats(){return ['qr_code'];}async detect(){const qr=window.__qr;return qr?[{rawValue:qr,cornerPoints:[{x:10,y:10},{x:50,y:10},{x:50,y:50},{x:10,y:50}]}]:[];}};
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{const c=document.createElement('canvas');c.width=64;c.height=64;const g=c.getContext('2d');const timer=setInterval(()=>{g.fillStyle='#fff';g.fillRect(0,0,64,64);},50);const stream=c.captureStream(10);for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{window.__cameraParou++;clearInterval(timer);stop();};}return stream;}}});
})();`;
(async()=>{const browser=await chromium.launch({channel:'msedge'});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
 await page.route('**/*',r=>{const u=r.request().url();if(u.includes('supabase-js'))return r.fulfill({body:mock,contentType:'text/javascript'});if(u.endsWith('/logo-empresa.svg'))return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="100"><text x="2" y="58" fill="white" font-family="Georgia" font-size="43">Chiavari</text><text x="5" y="80" fill="white" font-family="Georgia" font-size="13">MOVEIS PARA EVENTOS</text></svg>'});if(u.endsWith('/capa-empresa.svg'))return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="350"><defs><linearGradient id="b"><stop stop-color="#c1b19b"/><stop offset="1" stop-color="#8e8274"/></linearGradient></defs><path fill="url(#b)" d="M0 0h1000v350H0z"/></svg>'});if(u.startsWith(BASE)){const file=path.join(process.cwd(),decodeURIComponent(new URL(u).pathname));if(!fs.existsSync(file))return r.fulfill({status:404,body:''});return r.fulfill({body:fs.readFileSync(file),contentType:{'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.webmanifest':'application/manifest+json'}[path.extname(file)]||'application/octet-stream'});}return r.abort();});
 await page.addInitScript(()=>{sessionStorage.setItem('testlogged:easyloc-auth','1');sessionStorage.setItem('login_ok','1');sessionStorage.setItem('empresa_id','portal-e');sessionStorage.setItem('usuario_nome','Usuario do portal');});
 // Nov/2026: sem login próprio; usa a mesma sessão do sistema (easyloc-auth), que o app de celular (app.html) abre.
 await page.goto(BASE+'Modulos/Estoque/TriagemApp/triagem.html?app=1');await page.locator('[data-pedido=p1]').waitFor();assert.equal(await page.evaluate(()=>window.__authKey),'easyloc-auth');
 assert.equal(await page.locator('#taLogoEmpresa').getAttribute('src'),BASE+'logo-empresa.svg');assert.equal(await page.locator('.marca').evaluate(el=>el.classList.contains('tem-capa')),true);assert.doesNotMatch(await page.locator('.marca').innerText(),/APP DA TRIAGEM|ACERVO/i);assert.equal(await page.locator('#taNomeTopo').innerText(),'Joao');
 await page.screenshot({path:'.tmp/app-triagem-fila.png',fullPage:true});await page.locator('[data-pedido=p1]').click();await page.locator('#taCodigo').fill('ACERVO:ENV:8-001');await page.locator('#taFormCodigo').evaluate(f=>f.requestSubmit());
 await page.waitForFunction(()=>__bases.ida.itens[0].separado===1);
 // Nov/2026: sinal em tela cheia — verde com a foto/nome/contagem; repetido em amarelo; toque fecha.
 await page.locator('#taSinal.sinal-ok.ver').waitFor();assert.match(await page.locator('#taSinal').innerText(),/Leu!|completo/i);assert.match(await page.locator('#taSinal .sinal-contagem').innerText(),/1 de \d+ separados/);await page.screenshot({path:'.tmp/app-triagem-sinal-ok.png'});
 await page.locator('#taCodigo').fill('ACERVO:ENV:8-001');await page.locator('#taFormCodigo').evaluate(f=>f.requestSubmit());
 await page.locator('#taSinal.sinal-aviso.ver').waitFor();assert.equal(await page.locator('#taSinal .sinal-titulo').innerText(),'Já conferido');assert.match(await page.locator('#taMensagem').innerText(),/Esta etiqueta ja foi conferida/);await page.screenshot({path:'.tmp/app-triagem-sinal-aviso.png'});
 await page.locator('#taSinal').click();await page.locator('#taSinal.ver').waitFor({state:'detached'}).catch(()=>{});await page.waitForFunction(()=>!document.querySelector('#taSinal.ver'));
 // Nov/2026: leitor USB com teclado americano (":" chega como "ç") bipando sem tocar na caixa: o código vai para a caixa sozinho, que fica marcada sem abrir o teclado do celular.
 await page.waitForFunction(()=>document.activeElement?.id==='taCodigo');assert.equal(await page.locator('#taCodigo').getAttribute('inputmode'),'none');await page.evaluate(()=>document.activeElement.blur());await page.keyboard.type('acervo;env;8-001');await page.keyboard.press('Enter');await page.locator('#taSinal.sinal-aviso.ver').waitFor();assert.equal(await page.locator('#taSinal .sinal-titulo').innerText(),'Já conferido');await page.locator('#taSinal').click();await page.waitForFunction(()=>!document.querySelector('#taSinal.ver'));await page.waitForFunction(()=>document.activeElement?.id==='taCodigo');
 await page.locator('[data-camera]').click();await page.evaluate(()=>window.__qr='ACERVO:ITEM:CAD1');await page.waitForFunction(()=>__bases.ida.itens[0].separado===2);await page.locator('#taQrMarcador').waitFor({state:'visible'});assert.equal(await page.locator('#taQrCodigo').innerText(),'ACERVO:ITEM:CAD1');assert.equal(await page.locator('#taQrContorno').getAttribute('points'),'10,10 50,10 50,50 10,50');await page.screenshot({path:'.tmp/app-triagem-qr-destaque.png',fullPage:true});
 await new Promise(r=>setTimeout(r,2300));assert.equal(await page.evaluate(()=>__bases.ida.itens[0].separado),2,'camera nao repete a leitura da mesma peca');
 await page.evaluate(()=>{__bases.ida.itens[0].esperado=3;window.__qr='';});await new Promise(r=>setTimeout(r,850));assert.equal(await page.locator('#taQrMarcador').isVisible(),false);assert.equal(await page.locator('#taQrCodigo').innerText(),'Aponte para o QR Code');await page.evaluate(()=>window.__qr='ACERVO:ITEM:CAD1');await page.waitForFunction(()=>__bases.ida.itens[0].separado===3);assert.equal(await page.evaluate(()=>__cameraParou),0,'camera permanece aberta entre pecas');
 await page.evaluate(()=>window.__qr='ACERVO:ITEM:TAM1');await page.waitForFunction(()=>__bases.ida.itens[1].separado===1);assert.equal(await page.locator('#taQrCodigo').innerText(),'ACERVO:ITEM:TAM1');
 await page.screenshot({path:'.tmp/app-triagem-ida.png',fullPage:true});await page.locator('#taFinalizar').click();await page.locator('#taConfirmacao [value=confirmar]').click();await page.getByText('Informe a quantidade de materiais de Capa de cadeira (0 quando não houver).',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>__bases.ida.concluido),false);
 await page.locator('[data-capas-campo=quantidade]').fill('2');await page.locator('#taCapas .cp-cell details summary').click();await page.locator('[data-capas-campo=protecao_aplicada]').selectOption('true');await page.locator('#taFinalizar').click();await page.locator('#taConfirmacao [value=confirmar]').click();await page.getByText('Conferência concluída',{exact:false}).first().waitFor();
 assert.ok(await page.evaluate(()=>__cameraParou>0));await page.locator('[data-voltar]').click();await page.locator('[data-pedido=p2]').click();
 await page.locator('#taCodigo').fill('OUTRO');await page.locator('#taFormCodigo').evaluate(f=>f.requestSubmit());await page.locator('#taSinal.sinal-erro.ver').waitFor();assert.equal(await page.locator('#taSinal .sinal-titulo').innerText(),'Não é deste pedido');assert.match(await page.locator('#taMensagem').innerText(),/Esta etiqueta pertence a outro pedido/);await page.screenshot({path:'.tmp/app-triagem-sinal-erro.png'});await page.locator('#taSinal').click();await page.waitForFunction(()=>!document.querySelector('#taSinal.ver'));
 await page.locator('#taCodigo').fill('ACERVO:ENV:V-001');await page.locator('#taFormCodigo').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>document.querySelector('[data-contagem="s1|i1"]').value==='1');
 await page.locator('#taCodigo').fill('ACERVO:ENV:V-001');await page.locator('#taFormCodigo').evaluate(f=>f.requestSubmit());await page.locator('#taSinal.sinal-aviso.ver').waitFor();assert.match(await page.locator('#taMensagem').innerText(),/Este QR já foi contado nesta rodada/);await page.locator('#taSinal').click();await page.waitForFunction(()=>!document.querySelector('#taSinal.ver'));
 await page.locator('[data-contagem="s2|i2"]').fill('1');await page.locator('[data-danos="s1|i1"]').fill('1');
 await page.reload();await page.locator('[data-pedido=p2]').click();assert.equal(await page.locator('[data-contagem="s1|i1"]').inputValue(),'1','rascunho persiste no aparelho');
 const foto=await page.screenshot({clip:{x:0,y:0,width:20,height:20}});await page.locator('[data-foto="s1|i1"]').setInputFiles({name:'dano.png',mimeType:'image/png',buffer:foto});await page.locator('.fotos-novas img').waitFor();
 await page.locator('#taFinalizar').click();assert.equal(await page.locator('#taRodada').innerText(),'2ª contagem');assert.equal(await page.locator('[data-contagem="s2|i2"]').isDisabled(),true);
 await page.locator('[data-contagem="s1|i1"]').fill('2');await page.screenshot({path:'.tmp/app-triagem-volta.png',fullPage:true});await page.locator('#taFinalizar').click();await page.locator('#taConfirmacao [value=confirmar]').click();await page.waitForFunction(()=>__bases.volta.concluido);
 const args=await page.evaluate(()=>__chamadas.find(([n])=>n==='triagem_app_finalizar')[1]);assert.equal(args.p_primeira['s1|i1'],1);assert.equal(args.p_quantidades['s1|i1'],2);assert.equal(args.p_danificados['s1|i1'],1);assert.equal(await page.evaluate(()=>__enviados.length),1);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'sem rolagem horizontal');assert.deepEqual(erros,[]);
 // O botão do topo volta ao Início do app (app.html) sem sair do sistema.
 await page.locator('[data-voltar]').click();await page.locator('#taVoltarApp').click();await page.waitForURL(/\/app\.html/);assert.equal(await page.evaluate(()=>sessionStorage.getItem('testlogged:easyloc-auth')),'1','continua logado no sistema');
 console.log('OK - app: login, ida, QR sem duplicar, camera, volta, rascunho, recontagem, dano com foto e celular.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
