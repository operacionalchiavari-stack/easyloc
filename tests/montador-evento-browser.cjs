const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),assert=require('node:assert/strict');
const raiz=path.resolve(__dirname,'..');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XQAAAAASUVORK5CYII=','base64');
async function main(){
 const server=http.createServer((req,res)=>{
  if(req.url==='/fixture.png'){res.setHeader('Content-Type','image/png');res.end(png);return;}
  const f=path.resolve(raiz,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(raiz+path.sep)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.css')?'text/css':f.endsWith('.png')?'image/png':'text/javascript');res.end(fs.readFileSync(f));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const width of [320,390,1280]){
   const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://**/*',r=>r.fulfill({body:''}));await page.route('**/gas-cliente.js*',r=>r.fulfill({body:''}));await page.route('**/operacao-sem-motor.js*',r=>r.fulfill({body:''}));
   await page.addInitScript(()=>{
    localStorage.setItem('easyloc:limpeza-dados','20261026-zerado');localStorage.setItem('montadorToken','fixture');window.chamadas=[];window.falhaItens=!localStorage.getItem('fixture:falhaTestada');window.falhaUber=!localStorage.getItem('fixture:uberTestado');
    Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){ok({coords:{latitude:-23,longitude:-46,accuracy:10}});}}});
    const data=new Date().toLocaleDateString('en-CA');
    const etapas=[{id:'montagem',pedido:'123',cliente:'Evento Jardim',local:'Espaço Jardim',etapa:'montagem',operacao:'montagem',dataISO:data,horario:'08:00',responsavel:'Ana Silva',equipe:['Ana Silva','Bruno'],free:{quantidade:1,pessoas:[{nome:'Carlos Free',miniatura:location.origin+'/fixture.png'}]},trocas:[],info:{},outrasEtapas:[]},{id:'volta',pedido:'124',cliente:'Outro evento',etapa:'desmontagem',operacao:'desmontagem',dataISO:data,horario:'18:00',responsavel:'Ana Silva',equipe:[],trocas:[],sacolasMontagem:[],info:{},outrasEtapas:[]}];
    const lista=[{chave:'a',nome:'Cadeira natural',esperado:3,foto:location.origin+'/fixture.png'},{chave:'kit/b',nome:'Mesa do kit',kit_nome:'Composição Jardim',esperado:2,foto:location.origin+'/fixture.png'}];
    function registro(tipo){return JSON.parse(localStorage.getItem('fixture:'+tipo)||'null');}
    function guardar(tipo,d){localStorage.setItem('fixture:'+tipo,JSON.stringify(d));return d;}
    function result(fn,args){
     window.chamadas.push({fn,args});
     if(fn==='MONT_appCarregar')return {nome:'Ana Silva',perfil:'RESPONSAVEL',etapas,apontamento:registro('apontamento')};
     if(fn==='MONT_iniciarApontamento')return guardar('apontamento',{id:'apontamento',idEtapa:args[1],pedido:'123',inicio:new Date().toISOString(),status:'ATIVO'});
     if(fn==='MONT_finalizarApontamento'){localStorage.removeItem('fixture:apontamento');return {};}
     if(fn==='MONT_uberQr'){
      if(window.falhaUber){window.falhaUber=false;localStorage.setItem('fixture:uberTestado','1');throw Error('Conexão interrompida');}
      return args[1]==='montagem'?{trocaEm:60000,vagas:[{id:'uber',codigo:'654321',quantidade:1,ponto_encontro:'Galpão',destino:'Espaço Jardim',hora:'07:00',corridas:[{motorista:'Pedro Motorista',carro:'Carro branco',checkin_em:null}]}]}:{vagas:[]};
     }
     if(fn==='MONT_qrVaga')return {codigo:'123456',trocaEm:60000,urlQr:'https://fixture.test/free?c=equipe.123456',equipe:[{nome:'Carlos Free'}]};
     if(fn==='MONT_freteQr')return {fretes:[]};
     if(fn==='MONT_entregaItens'){
      if(window.falhaItens){window.falhaItens=false;localStorage.setItem('fixture:falhaTestada','1');throw Error('Conexão interrompida');}
      return registro('conferencia')||{itens:lista,conferencia:{},enviado:false};
     }
     if(fn==='MONT_entregaSalvar')return guardar('conferencia',{itens:lista,conferencia:args[2],enviado:true,autor:'Ana Silva'});
     if(fn==='buscarEmpresasTerceirizadas')return [];
     if(fn==='salvarEquipeTerceirizada')return guardar('equipe',{enviado:true,chegada:{localStatus:'NO_LOCAL'}});
     if(fn==='verificarEquipeTerceirizadaJaEnviada')return registro('equipe')||{};
     if(fn==='salvarSacolasProtecao')return guardar('sacolas',{enviado:true,sacolas:args[0].sacolas.map(s=>({codigo:s.codigo,fotos:['https://fixture.test/sacola.jpg']}))});
     if(fn==='verificarSacolasJaEnviadas')return registro('sacolas')||{};
     if(fn==='salvarListaAssinada')return guardar('lista',{enviado:true});
     if(fn==='verificarListaAssinadaJaEnviada')return registro('lista')||{};
     if(fn==='MONT_contagemItens')return {itens:lista};
     return {};
    }
    function runner(ok,no){return new Proxy({},{get:(_,fn)=>fn==='withSuccessHandler'?f=>runner(f,no):fn==='withFailureHandler'?f=>runner(ok,f):(...args)=>Promise.resolve().then(()=>result(fn,args)).then(r=>ok&&ok(r)).catch(e=>no&&no(e))});}
    window.google={script:{run:runner()}};
   });
   await page.goto(`http://127.0.0.1:${server.address().port}/Modulos/Chiavari/Cronograma/montador.html`);await page.locator('#telaInicio .etapa').filter({hasText:'Evento Jardim'}).click();
   await page.getByRole('button',{name:'Consultar Uber novamente',exact:true}).click();
   await page.locator('#etapaUber').filter({hasText:'Pedro Motorista'}).waitFor();
   const ordem=await page.evaluate(()=>['etapaEquipe','etapaUber','etapaFotoEquipe','etapaConferencia','passo_sacolas','passo_lista'].map(id=>document.getElementById(id).getBoundingClientRect().top));
   assert.ok(ordem.every((n,i)=>!i||n>ordem[i-1]),'ordem do roteiro');assert.equal(await page.locator('#passo_posicionamento').count(),0);
   assert.equal(await page.locator('#regFotoEquipe input').isDisabled(),true);
   await page.getByRole('button',{name:'QR code da equipe',exact:true}).click();await page.getByText('123456',{exact:true}).waitFor();await page.locator('#folha').getByRole('button',{name:'Fechar',exact:true}).click();
   await page.getByRole('button',{name:'QR para o motorista',exact:true}).click();await page.getByText('654321',{exact:true}).waitFor();await page.locator('#folha').getByRole('button',{name:'Fechar',exact:true}).click();
   await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await page.locator('.entrega-item').first().waitFor();
   await page.screenshot({path:path.join(os.tmpdir(),`montador-fluxo-inicial-${width}.png`),fullPage:true});
   await page.getByRole('button',{name:'▶ Iniciar evento',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#regFotoEquipe input').disabled&&!document.querySelector('#regFotoEquipe input').closest('fieldset').disabled);
   await page.locator('#regFotoEquipe input').setInputFiles({name:'equipe.png',mimeType:'image/png',buffer:png});await page.waitForSelector('#regFotoEquipe.tem');await page.getByRole('button',{name:'Enviar equipe',exact:true}).click();await page.waitForSelector('#passo_equipe.concluido');
   assert.equal(await page.evaluate(()=>chamadas.find(c=>c.fn==='salvarEquipeTerceirizada').args[0].quantidade),'3');
   assert.equal(await page.locator('#regProgressoPct').textContent(),'25%');
   await page.getByRole('button',{name:'Salvar conferência',exact:true}).click();assert.equal(await page.evaluate(()=>chamadas.some(c=>c.fn==='MONT_entregaSalvar')),false);
   const linhas=page.locator('.entrega-item');await linhas.nth(0).getByRole('button',{name:'Tudo entregue, sem danos'}).click();
   await linhas.nth(1).locator('[data-entregue]').fill('1');await linhas.nth(1).locator('[data-dano]').fill('1');
   await linhas.nth(1).locator('[data-obs]').fill('Pé da mesa danificado no transporte');
   await linhas.nth(1).locator('input[type=file]').setInputFiles({name:'dano.png',mimeType:'image/png',buffer:png});await page.waitForSelector('.entrega-foto-dano:not([hidden])');
   await page.locator('[data-acesso=agenda]').click();await page.locator('#telaInicio .etapa').filter({hasText:'Evento Jardim'}).click();assert.equal(await linhas.nth(1).locator('[data-entregue]').inputValue(),'1');
   await page.getByRole('button',{name:'Salvar conferência',exact:true}).click();await page.waitForSelector('.conferencia-enviada');assert.equal(await page.locator('#regProgressoPct').textContent(),'50%');
   const enviado=await page.evaluate(()=>chamadas.find(c=>c.fn==='MONT_entregaSalvar').args);assert.equal(enviado[0],'fixture');assert.equal(enviado[1],'montagem');assert.equal(enviado[2]['kit/b'].danificados,1);assert.match(enviado[2]['kit/b'].foto,/^data:image/);
   assert.equal(await linhas.nth(1).locator('[data-entregue]').isDisabled(),true);
   await page.locator('.codigo-sacola').fill('SC-001');await page.locator('#regSacolas input[type=file]').setInputFiles({name:'sacola.png',mimeType:'image/png',buffer:png});await page.waitForSelector('#regSacolas .foto.tem');await page.getByRole('button',{name:'Enviar sacolas',exact:true}).click();await page.waitForSelector('#passo_sacolas.concluido');
   await page.locator('#regRecebedor').fill('Maria Cliente');await page.locator('#regFotoLista input').setInputFiles({name:'lista.png',mimeType:'image/png',buffer:png});await page.waitForSelector('#regFotoLista.tem');await page.getByRole('button',{name:'Enviar lista assinada',exact:true}).click();await page.waitForSelector('#passo_lista.concluido');assert.equal(await page.locator('#regProgressoPct').textContent(),'100%');assert.equal(await page.locator('.tudo-pronto').isVisible(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:path.join(os.tmpdir(),`montador-fluxo-completo-${width}.png`),fullPage:true});
   await page.reload();await page.locator('#telaInicio .etapa').filter({hasText:'Evento Jardim'}).click();await page.waitForSelector('.conferencia-enviada');await page.waitForFunction(()=>document.getElementById('regProgressoPct').textContent==='100%');assert.equal(await page.locator('#regProgresso').count(),1);
   await page.locator('#apontamentoEtapa .encerrar-evento').click();await page.getByRole('button',{name:'Encerrar',exact:true}).click();await page.locator('#telaInicio.ativa').waitFor();
   await page.locator('#telaInicio .etapa').filter({hasText:'Outro evento'}).click();assert.equal(await page.locator('#etapaInfo').count(),1);assert.equal(await page.locator('#regProgresso').count(),1);assert.equal(await page.locator('#etapaConferencia').count(),0);assert.equal(await page.locator('#telaEtapa').evaluate(e=>e.classList.contains('evento-linear')),false);
   assert.deepEqual(errors,[]);await page.close();console.log(`Montagem ${width}px: QR, foto, conferência com dano, sacolas, assinatura, restauração e troca de etapa OK.`);
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
