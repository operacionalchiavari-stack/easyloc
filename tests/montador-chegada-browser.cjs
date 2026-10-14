const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{const f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',f.endsWith('.html')?'text/html':f.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(f));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const width of [390,1280]){
   const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://**/*',r=>r.fulfill({body:''}));await page.route('**/gas-cliente.js*',r=>r.fulfill({body:''}));
   await page.addInitScript(()=>{
    localStorage.setItem('montadorToken','fixture');window.saved=[];window.savedAvarias=[];window.denyGps=false;window.gpsEncerrado=0;
    Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,no){window.denyGps?no({code:1}):ok({coords:{latitude:-23,longitude:-46,accuracy:12}});},watchPosition(){return 7;},clearWatch(id){if(id===7)window.gpsEncerrado++;}}});
    const etapa={id:'etapa',pedido:'1234',cliente:'Evento de teste',local:'Local do evento',etapa:'montagem',operacao:'montagem',dataISO:new Date().toLocaleDateString('en-CA'),horario:'08:00',responsavel:'Ana Silva',equipe:['Ana Silva'],lat:-23,lng:-46,registros:0,free:{quantidade:2,horario:'08:00',pontoEncontro:'Local do evento',pessoas:[{nome:'Carlos Free',miniatura:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XQAAAAASUVORK5CYII=',telefone:'',fase:'CHECKIN',nota:5},{nome:'Free sem foto',telefone:'',nota:5}]},trocas:[],sacolasMontagem:[],info:{},outrasEtapas:[]};
    function result(fn,args){
     const atual=JSON.parse(localStorage.getItem('fixtureApontamento')||'null');
     if(fn==='MONT_appCarregar')return {nome:'Ana Silva',perfil:'RESPONSAVEL',etapas:[etapa],apontamento:atual};
     if(fn==='MONT_iniciarApontamento'){const p=atual||{id:'apontamento-1',idEtapa:args[1],pedido:'1234',inicio:new Date(Date.now()-65000).toISOString(),status:'ATIVO'};localStorage.setItem('fixtureApontamento',JSON.stringify(p));return p;}
     if(fn==='MONT_finalizarApontamento'){localStorage.removeItem('fixtureApontamento');return {status:'ENCERRADO'};}
     if(fn==='MONT_solicitarTroca'){window.savedAvarias.push(args[1]);return [];}
     if(fn==='buscarItensOperacao')return [];
     if(fn==='buscarEmpresasTerceirizadas')return ['Equipe Parceira'];
     if(fn==='salvarEquipeTerceirizada'){window.saved.push(args[0]);return {sucesso:true,chegada:{atraso:20,localStatus:'NO_LOCAL'}};}
     return {};
    }
    function runner(ok,no){return new Proxy({},{get:(_,fn)=>fn==='withSuccessHandler'?f=>runner(f,no):fn==='withFailureHandler'?f=>runner(ok,f):(...args)=>Promise.resolve().then(()=>result(fn,args)).then(r=>ok&&ok(r)).catch(e=>no&&no(e))});}
    const m={Map:class{constructor(el){el.textContent='Mapa do evento';}setCenter(){}panTo(){}setZoom(){}},Marker:class{setPosition(){}},DirectionsRenderer:class{setMap(){}setDirections(){window.rotaDesenhada=true;}},DirectionsService:class{route(req,cb){window.pedidoRota=req;cb({routes:[{legs:[{duration:{text:'12 min'},distance:{text:'5 km'},steps:[{instructions:'Vire <b>à direita</b>',distance:{text:'100 m'}}]}]}]},'OK');}},Geocoder:class{geocode(req,cb){cb([{geometry:{location:{lat:-23,lng:-46}}}],'OK');}},SymbolPath:{CIRCLE:0}};
    window.google={script:{run:runner()},maps:m};
   });
   await page.goto(`http://127.0.0.1:${server.address().port}/Modulos/Chiavari/Cronograma/montador.html`);
   await page.waitForSelector('.etapa');await page.screenshot({path:path.join(os.tmpdir(),`montador-agenda-${width}.png`),fullPage:true});
   assert.equal(await page.locator('#agendaBusca').count(),0);assert.equal(await page.locator('[data-periodo]').count(),0);
   await page.locator('[data-acesso="equipe"]').click();await page.waitForSelector('#telaSemEvento.ativa');assert.equal(await page.locator('#telaInicio').isVisible(),false);
   await page.locator('[data-acesso="agenda"]').click();await page.locator('.etapa').first().click();
   assert.equal(await page.locator('#etapaEquipe').isVisible(),true);assert.equal(await page.locator('img[alt="Foto de Carlos Free"]').count(),1);assert.ok(await page.locator('#etapaEquipe').textContent().then(t=>t.includes('Foto não cadastrada')));
   await page.screenshot({path:path.join(os.tmpdir(),`montador-pedido-${width}.png`),fullPage:true});
   await page.getByRole('button',{name:'Ver foto de Carlos Free',exact:true}).click();await page.waitForSelector('.foto-free-ampliada');await page.getByRole('button',{name:'Fechar foto',exact:true}).click();
   await page.getByRole('button',{name:'Abrir mapa no app',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('mapaRota').disabled);
   await page.evaluate(()=>denyGps=true);await page.locator('#mapaRota').click();assert.match(await page.locator('#mapaStatus').textContent(),/Permita a localização/);
   await page.evaluate(()=>denyGps=false);await page.locator('#mapaRota').click();await page.waitForSelector('.mapa-resumo');assert.equal(await page.locator('#mapaResumo strong').textContent(),'12 min');assert.equal(await page.evaluate(()=>pedidoRota.destination),'-23,-46');assert.equal(await page.locator('#folha a[target="_blank"]').count(),0);
   await page.getByRole('button',{name:'Fechar mapa',exact:true}).click();assert.equal(await page.evaluate(()=>gpsEncerrado),1);
   await page.getByRole('button',{name:'▶ Iniciar evento',exact:true}).click();
   await page.waitForSelector('#etapaFotoEquipe:not([hidden])');
   assert.equal(await page.locator('#passo_equipe').count(),1);assert.equal(await page.locator('#etapaCabeca').isVisible(),false);assert.equal(await page.locator('#etapaTituloPagina').textContent(),'Foto da equipe');assert.match(await page.locator('#apontamentoEtapa .apontamento-tempo').textContent(),/^00:01:/);
   await page.getByText('Equipe própria',{exact:true}).click();await page.locator('#regQtd .opcao').first().click();
   await page.locator('[data-acesso="avarias"]').click();await page.getByRole('button',{name:'Informar avaria ou falta',exact:true}).click();await page.waitForSelector('#trocaItem');await page.locator('#trocaItem').fill('Mesa');await page.locator('#trocaMotivos .opcao').first().click();
   await page.locator('#trocaFoto input').setInputFiles({name:'avaria.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XQAAAAASUVORK5CYII=','base64')});
   await page.waitForFunction(()=>document.querySelector('#trocaFoto').classList.contains('tem'));await page.locator('#btnTroca').click();await page.waitForFunction(()=>savedAvarias.length===1);const avaria=await page.evaluate(()=>savedAvarias[0]);assert.equal(avaria.idEtapa,'etapa');assert.equal(avaria.apontamentoId,'apontamento-1');
   await page.locator('[data-acesso="equipe"]').click();assert.equal(await page.locator('#regEmpresas .ativa').textContent(),'Equipe própria');
   const button=page.locator('button').filter({hasText:/^Enviar equipe$/});
   await button.click();assert.equal(await page.evaluate(()=>saved.length),0);
   await page.locator('#regFotoEquipe input').setInputFiles({name:'equipe.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XQAAAAASUVORK5CYII=','base64')});
   await page.waitForFunction(()=>document.querySelector('#regFotoEquipe').classList.contains('tem'));
   await page.locator('[data-acesso="registros"]').click();await page.locator('[data-acesso="equipe"]').click();assert.equal(await page.locator('#regFotoEquipe').evaluate(e=>e.classList.contains('tem')),true);
   await page.evaluate(()=>denyGps=true);await button.click();await page.waitForFunction(()=>!document.querySelector('[onclick="enviarEquipe(this)"]').disabled);assert.equal(await page.evaluate(()=>saved.length),0);
   await page.evaluate(()=>denyGps=false);await button.click();await page.waitForFunction(()=>saved.length===1);
   const sent=await page.evaluate(()=>saved[0]);assert.equal(sent.apontamentoId,'apontamento-1');assert.equal(sent.token,'fixture');assert.equal(sent.latitude,-23);assert.equal(sent.precisaoGPS,12);assert.ok(sent.foto.startsWith('data:image/'));assert.equal('uniformizada' in sent,false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
   await page.screenshot({path:path.join(os.tmpdir(),`montador-chegada-${width}.png`),fullPage:true});
   const inicio=await page.evaluate(()=>JSON.parse(localStorage.getItem('fixtureApontamento')).inicio);await page.reload();await page.waitForSelector('.etapa');await page.locator('[data-acesso="equipe"]').click();await page.waitForSelector('#etapaFotoEquipe:not([hidden])');assert.equal(await page.evaluate(()=>estado.apontamento.inicio),inicio);
   await page.locator('#apontamentoEtapa .encerrar-evento').click();await page.getByRole('button',{name:'Encerrar',exact:true}).click();await page.waitForSelector('#telaInicio.ativa');assert.equal(await page.evaluate(()=>localStorage.getItem('fixtureApontamento')),null);
   await page.locator('[data-acesso="avarias"]').click();await page.waitForSelector('#telaSemEvento.ativa');await page.close();
  }
  console.log('App: início, cronômetro, vínculo da foto, abas completas, restauração e encerramento validados em celular/desktop.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
