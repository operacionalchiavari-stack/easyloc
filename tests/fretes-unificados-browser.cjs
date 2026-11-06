const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge'});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),base='http://fretes.teste/',errors=[],loads={},records={fornecedores:[],caminhoes:[]};let approved=false;
 page.on('pageerror',e=>errors.push(e.message));
 const mock=`window.__rpc=[];window.__CONTEXT={empresa_id:'e1'};window.aguardarContexto=async()=>window.__CONTEXT;window.EasyLocPermissions={load:async()=>{},hasPermission:()=>true};window.alerta=()=>{};window.supabaseClient={from:()=>{const q={select:()=>q,eq:()=>q,in:async()=>({data:[{nome_razao:'Kelly Khawam',catalogo_logo_url:'https://images.test/kelly.jpg'}],error:null})};return q;},rpc:async(n,a)=>{window.__rpc.push(n);if(n==='frete_freteiro_status'){await fetch('/aprovar',{method:'POST'});}const d=await(await fetch('/dados')).json();return {data:d,error:null};}};`;
 await page.route(base+'**',async route=>{const u=new URL(route.request().url());
  if(u.pathname==='/aprovar'){approved=true;records.fornecedores=['Pedro'];records.caminhoes=['ABC1D23'];return route.fulfill({body:'OK'});}
  if(u.pathname==='/dados')return route.fulfill({json:{freteiros:[{id:'fr1',nome:'Pedro',telefone:'24999999999',status:approved?'aprovado':'pendente',veiculo_modelo:'Iveco',veiculo_placa:'ABC1D23',capacidade_m3:20}],anuncios:[]}});
  if(u.pathname.endsWith('fornecedores.html')||u.pathname.endsWith('cadastro-caminhoes.html')){const k=u.pathname.endsWith('fornecedores.html')?'fornecedores':'caminhoes';loads[k]=(loads[k]||0)+1;return route.fulfill({contentType:'text/html',body:k==='fornecedores'?'<div class="container-fornecedores"><section class="table-wrapper"></section></div><script>'+mock+'window.addEventListener("fornecedores-atualizar",()=>document.body.dataset.atualizado="1");</script><script src="fornecedores-app.js"></script>':'<div class="cadastro-caminhoes-page"><header id="caminhoesCabecalho"><h1>'+k+'</h1><input id="filtroTexto" oninput="document.body.dataset.busca=this.value"><div class="header-actions"><button onclick="document.body.dataset.novo=1">Novo</button></div></header><p>'+records[k].join(',')+'</p></div>'});}
  const file=path.join(process.cwd(),decodeURIComponent(u.pathname));if(!fs.existsSync(file))return route.fulfill({status:404,body:''});let body=fs.readFileSync(file),ext=path.extname(file);
  if(ext==='.html'){body=body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');if(u.pathname.endsWith('gestao-fretes.html'))body=body.replace('</body>','<script>'+mock+'</script><script src="gestao-fretes.js"></script></body>');else if(u.pathname.endsWith('conciliacao.html'))body=body.replace('</body>','<script>'+mock+'</script><script src="fretes-exemplos.js"></script><script src="conciliacao.js"></script></body>');else if(u.pathname.endsWith('freteiros.html'))body=body.replace('</body>','<script>'+mock+'</script><script src="fretes-exemplos.js"></script><script src="freteiros.js"></script></body>');}
  return route.fulfill({body,contentType:ext==='.html'?'text/html':ext==='.js'?'text/javascript':ext==='.css'?'text/css':'text/plain'});
 });
 await page.route('https://**',route=>route.abort());await page.route('https://images.test/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52"><circle cx="26" cy="26" r="26" fill="tan"/></svg>'}));
 await page.goto(base+'Modulos/Chiavari/Fretes/gestao-fretes.html?aba=fornecedores&exemplo=0');
 const tabs=page.locator('#gfAbas [data-aba]');assert.equal(await tabs.count(),4);assert.doesNotMatch(await page.locator('#gfAbas').innerText(),/Freteiros|Fornecedores/);
 assert.equal(await page.locator('[data-aba=conciliacao]').getAttribute('aria-selected'),'true');
 await page.locator('[data-aba=caminhoes]').click();await page.frameLocator('#gf-caminhoes .gf-quadro').locator('h1').waitFor({state:'attached'});
 await page.locator('#gfBuscaCaminhao').fill('ABC');assert.equal(await page.frameLocator('#gf-caminhoes .gf-quadro').locator('body').getAttribute('data-busca'),'ABC');
 await page.locator('#gfNovoCaminhao').click();assert.equal(await page.frameLocator('#gf-caminhoes .gf-quadro').locator('body').getAttribute('data-novo'),'1');
 assert.equal(await page.frameLocator('#gf-caminhoes .gf-quadro').locator('#caminhoesCabecalho').isVisible(),false);
 const titulo=await page.locator('.gf-topo h2').boundingBox(),busca=await page.locator('#gfBuscaCaminhao').boundingBox(),novo=await page.locator('#gfNovoCaminhao').boundingBox();assert.ok(Math.abs((titulo.y+titulo.height/2)-(busca.y+busca.height/2))<3);assert.ok(Math.abs((titulo.y+titulo.height/2)-(novo.y+novo.height/2))<3);

 await page.locator('[data-aba=anuncios]').click();assert.equal(await page.locator('#gfBuscaCaminhao').isVisible(),false);assert.equal(await page.locator('#gfNovoCaminhao').isVisible(),false);await page.frameLocator('#gf-anuncios .gf-quadro').getByText(/Nenhum frete anunciado/).waitFor();
 await page.locator('[data-aba=caminhoes]').click();assert.equal(loads.caminhoes,1,'Trocar abas preserva a tela');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(base+'Modulos/Chiavari/Fretes/gestao-fretes.html');assert.equal(await page.locator('#gfExemplos').count(),0);
 const cf=page.frameLocator('#gf-conciliacao .gf-quadro');await cf.locator('.cf-evento').first().waitFor();assert.equal(await cf.locator('.cf-evento').count(),7);
 assert.deepEqual(await cf.locator('.cf-evento-topo').first().evaluate(el=>[...el.children].slice(0,4).map(n=>n.className)),['cf-evento-data','cf-evento-foto','cf-evento-pedido','cf-evento-identidade']);
 assert.equal(await cf.locator('.cf-evento-foto img').first().getAttribute('src'),'https://images.test/kelly.jpg');
assert.equal(await cf.locator('.cf-viagens tbody tr').count(),14);assert.equal(await cf.locator('#cfAtualizar').count(),0);assert.equal(await cf.locator('.cf-barra').isVisible(),false);await page.locator('#gfBuscaConciliacao').fill('Kelly');assert.equal(await cf.locator('.cf-evento').count(),4);await page.locator('#gfBuscaConciliacao').fill('');
 assert.equal(await page.locator('#gf-conciliacao iframe').evaluate(f=>f.contentWindow.__rpc.length),0,'Exemplos nao consultam ou escrevem no banco');
 assert.ok(await cf.locator('[data-final]').count()>0,'Previa deixa testar o valor final e o envio (so na memoria da pagina)');assert.equal(await cf.locator('[data-fechar]').count(),0);
 const colunas=await cf.locator('.cf-viagens').evaluateAll(ts=>ts.map(t=>[...t.querySelectorAll('thead th')].map(th=>({x:th.getBoundingClientRect().x,w:th.getBoundingClientRect().width}))));for(const cols of colunas)for(let i=0;i<cols.length;i++){assert.ok(Math.abs(cols[i].x-colunas[0][i].x)<2);assert.ok(Math.abs(cols[i].w-colunas[0][i].w)<2);}
 assert.ok(await cf.locator('.cf-obs-icone.com-nota').count()>0);assert.match(await cf.locator('[data-nota="ex-viagem-4"]').getAttribute('title'),/retirada antecipada/);assert.equal(await cf.locator('.cf-observacao input,.cf-observacao textarea').count(),0);

 await page.waitForFunction(()=>{const f=document.querySelector('#gf-conciliacao iframe');return f&&f.clientHeight>1000&&f.contentDocument.documentElement.scrollHeight<=f.clientHeight+2;});
 assert.ok((await page.locator('#gf-conciliacao').boundingBox()).x<=14,'Conteudo aproveita as bordas');
 await page.evaluate(()=>window.scrollTo(0,400));assert.ok((await page.locator('#gfAbas').boundingBox()).y<0,'Abas rolam junto com a pagina');await page.evaluate(()=>window.scrollTo(0,0));

 await page.locator('#gfAgrupar').selectOption('pessoas');assert.equal(await cf.locator('.cf-evento').count(),3);assert.equal(await cf.locator('.cf-viagens tbody tr').count(),14);
 await page.locator('#gfAgrupar').selectOption('dias');assert.ok(await cf.locator('.cf-dia').count()>3);assert.equal(await cf.locator('.cf-viagens tbody tr').count(),14);
 await page.locator('#gfAgrupar').selectOption('eventos');assert.equal(await cf.locator('.cf-evento').count(),7);
 await page.locator('#gfSituacao').selectOption('fechado');assert.equal(await cf.locator('.cf-viagens tbody tr').count(),4);
 await page.locator('[data-aba=anuncios]').click();const fr=page.frameLocator('#gf-anuncios .gf-quadro');await fr.locator('.fr-tabela tbody tr').first().waitFor();assert.equal(await fr.locator('.fr-tabela tbody tr').count(),12);assert.equal(await fr.locator('#frAtualizar,[data-liberar]').count(),0);
 assert.equal(await page.locator('#gf-anuncios iframe').evaluate(f=>f.contentWindow.__rpc.length),0);
 await page.goto(base+'Modulos/Chiavari/Fretes/gestao-fretes.html?aba=anuncios&exemplo=0');await page.frameLocator('#gf-anuncios .gf-quadro').getByText(/Nenhum frete anunciado/).waitFor();
 await page.goto(base+'Modulos/Estoque/CadastroFornecedores/fornecedores.html');
 await page.locator('.fornecedores-app summary').click();
 const review=page.frameLocator('#fornecedoresCadastrosApp');await review.locator('[data-aprovar=fr1]').waitFor();assert.match(await review.locator('#frConteudo').innerText(),/Pedro/);
 await review.locator('[data-aprovar=fr1]').click();await page.waitForFunction(()=>document.body.dataset.atualizado==='1');
 assert.match(await review.locator('#frConteudo').innerText(),/Nenhum cadastro/);assert.equal(await review.locator('.fr-abas').isVisible(),false);
 assert.deepEqual(records,{fornecedores:['Pedro'],caminhoes:['ABC1D23']});
 assert.deepEqual(errors,[]);
 const menu=fs.readFileSync('js/ui/sidebarMenu.js','utf8');assert.match(menu,/rotulo: "Fretes", href: "Modulos\/Chiavari\/Fretes\/gestao-fretes.html"/);assert.doesNotMatch(menu,/rotulo: "Freteiros"/);
 console.log('OK - Fretes sem aba Fornecedores; cadastros do app em Estoque, aprovacao e atualizacao da lista; anuncios, caminhoes e celular.');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
