const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const raiz=path.resolve(__dirname,'..');
const apps=[['Modulos/Chiavari/Cronograma/montador.html','App do Montador'],['Modulos/Chiavari/Cronograma/free.html','Vagas Free'],['Modulos/Chiavari/Uber/motorista.html','App do Motorista'],['Modulos/Chiavari/Fretes/freteiro.html','App do Freteiro'],['Modulos/Estoque/TriagemApp/triagem.html','App da Triagem'],['Modulos/Chiavari/CentralMetas/equipe.html','Meu Bônus']];
(async()=>{
 const servidor=http.createServer((req,res)=>{
  const rota=decodeURIComponent(req.url.split('?')[0]).replace(/^\/easyloc\//,'/');
  res.setHeader('Content-Type',rota.endsWith('.css')?'text/css':rota.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');
  if(rota==='/dashboard.html')return res.end('<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles/portal-shell.css"><link rel="stylesheet" href="styles/menu-topo.css"><link rel="stylesheet" href="styles/apps-links.css"></head><body class="portal-shell"><main class="main"><div id="main-content" style="display:none"></div><iframe id="appModuleFrame" class="app-module-frame hidden" title="App" src="about:blank"></iframe></main><script src="js/ui/apps-links.js"></script></body></html>');
  if(rota.startsWith('/Modulos/'))return res.end('<!doctype html><title>App de teste</title><body style="margin:0">Tela do aplicativo</body>');
  const f=path.resolve(raiz,'.'+rota);if(!f.startsWith(raiz+path.sep)||!fs.existsSync(f)){res.writeHead(404);return res.end();}res.end(fs.readFileSync(f));
 });
 await new Promise(r=>servidor.listen(0,'127.0.0.1',r));const origem=`http://127.0.0.1:${servidor.address().port}`;
 const navegador=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const prefixo of ['','/easyloc'])for(const width of [390,1280]){
   const contexto=await navegador.newContext({viewport:{width,height:900},permissions:['clipboard-read','clipboard-write']});const pagina=await contexto.newPage();const erros=[];pagina.on('pageerror',e=>erros.push(e.message));
   await pagina.goto(origem+prefixo+'/dashboard.html');assert.equal(await pagina.locator('#appLinkToolbar').isVisible(),false);
   for(const [arquivo,nome]of apps){
    const caminho=prefixo+'/'+arquivo;
    await pagina.evaluate(url=>{const f=document.getElementById('appModuleFrame');f.classList.remove('hidden');f.src=url;},caminho+'?empresa=empresa-teste&c=codigo-presenca&token=nao-compartilhar#evento');
    await pagina.waitForFunction(n=>document.getElementById('appLinkNome').textContent===n,nome);
    const esperado=origem+caminho+'?empresa=empresa-teste';
    assert.equal(await pagina.locator('#appLinkUrl').getAttribute('href'),esperado);assert.equal(await pagina.locator('#appLinkAbrir').getAttribute('target'),'_blank');
    await pagina.getByRole('button',{name:'Copiar link',exact:true}).click();await pagina.getByRole('status').filter({hasText:'Link copiado'}).waitFor();assert.equal(await pagina.evaluate(()=>navigator.clipboard.readText()),esperado);
    assert.equal(await pagina.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await pagina.evaluate(()=>{const frame=document.getElementById('appModuleFrame').getBoundingClientRect(),bar=document.getElementById('appLinkToolbar').getBoundingClientRect(),main=document.querySelector('.main').getBoundingClientRect();return frame.top>=bar.bottom-1&&frame.bottom<=main.bottom+1&&frame.height>300;}),true);
   }
   const nova=pagina.waitForEvent('popup');await pagina.getByRole('link',{name:'Abrir aplicativo',exact:true}).click();const popup=await nova;await popup.waitForLoadState();assert.equal(popup.url(),origem+prefixo+'/Modulos/Chiavari/CentralMetas/equipe.html?empresa=empresa-teste');assert.equal(await popup.evaluate(()=>window.opener===null),true);await popup.close();
   await pagina.screenshot({path:path.join(os.tmpdir(),`apps-links-${prefixo?'pages':'vercel'}-${width}.png`)});
   await pagina.evaluate(()=>document.getElementById('appModuleFrame').classList.add('hidden'));await pagina.locator('#appLinkToolbar').waitFor({state:'hidden'});
   await pagina.evaluate(()=>document.getElementById('appModuleFrame').classList.remove('hidden'));await pagina.locator('#appLinkToolbar').waitFor({state:'visible'});
   await pagina.evaluate(prefixo=>document.getElementById('appModuleFrame').src=prefixo+'/Modulos/Outro/index.html',prefixo);await pagina.locator('#appLinkToolbar').waitFor({state:'hidden'});
   assert.deepEqual(erros,[]);await contexto.close();console.log(`Links dos seis apps: cópia, nova aba, navegação e layout ${prefixo||'/'} em ${width}px OK.`);
  }
 }finally{await navegador.close();await new Promise(r=>servidor.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
