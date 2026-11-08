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
    localStorage.setItem('easyloc:limpeza-dados','20261026-zerado');if(!sessionStorage.getItem('fixture:inicializado')){localStorage.removeItem('montadorToken');sessionStorage.setItem('fixture:inicializado','1');}window.chamadas=[];window.falhaItens=!localStorage.getItem('fixture:falhaTestada');window.falhaUber=!localStorage.getItem('fixture:uberTestado');
    Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){ok({coords:{latitude:-23,longitude:-46,accuracy:10}});}}});
    const data=new Date().toLocaleDateString('en-CA');
    const etapas=[{id:'montagem',pedido:'123',cliente:'Evento Jardim',local:'Espaço Jardim',caminhao:'Caminhão 01',dataEvento:'01/11/2026',confirmadoDecorador:true,etapa:'montagem',operacao:'montagem',dataISO:data,horario:'08:00',responsavel:'Ana Silva',equipe:['Ana Silva','Bruno'],free:{quantidade:1,pessoas:[{nome:'Carlos Free',miniatura:location.origin+'/fixture.png'}]},trocas:[],info:{},outrasEtapas:[{etapa:'Carregamento',dataISO:data,horario:'06:00'}]},{id:'volta',pedido:'124',cliente:'Outro evento',etapa:'desmontagem',operacao:'desmontagem',dataISO:data,horario:'18:00',responsavel:'Ana Silva',equipe:[],trocas:[],sacolasMontagem:[],info:{},outrasEtapas:[]}];
    const amanha=new Date();amanha.setDate(amanha.getDate()+1);etapas.push({...etapas[0],id:'amanha',cliente:'Evento Amanhã',dataISO:amanha.toLocaleDateString('en-CA')});
    const lista=[{chave:'a',nome:'Cadeira natural de madeira com assento estofado em linho bege e acabamento especial para composição de ambientes (L) 0.60 m (A) 0.90 m '.repeat(2),esperado:3,foto:location.origin+'/fixture.png'},{chave:'kit/b',nome:'Mesa do kit',kit_nome:'Composição Jardim',esperado:2,foto:location.origin+'/fixture.png'}];
    lista.forEach((it,i)=>Object.assign(it,{ambiente_id:'amb'+i,ambiente:i?'Recepção':'Cerimônia',ambiente_ordem:i+1}));
    function registro(tipo){return JSON.parse(localStorage.getItem('fixture:'+tipo)||'null');}
    function guardar(tipo,d){localStorage.setItem('fixture:'+tipo,JSON.stringify(d));return d;}
    function result(fn,args){
     window.chamadas.push({fn,args});
     if(fn==='MONT_usuarioSistema')return 'u1';if(fn==='MONT_bonusOpcoes')return window.bonusAdmin?{proprio:false,administrador:true,funcionarios:[{id:'f1',nome:'Bruno Silva',setor:'Montagem'},{id:'f2',nome:'Aline Pereira',setor:''}]}:{proprio:true};if(fn==='MONT_bonusVer'){window.bonusVisto=args[0];return {token:'fixture',nome:'Bruno Silva',perfil:'RESPONSAVEL'};}if(fn==='MONT_loginConta')return {token:'fixture',nome:'Ana Silva',perfil:'RESPONSAVEL'};
     if(fn==='MONT_login'){if(args[2]===true&&args[3]===true)return {token:'fixture-sistema',nome:'Supervisor',perfil:'SUPERVISOR'};if(args[1]!=='1234')throw Error('CPF ou PIN incorretos.');return {token:'fixture',nome:'Ana Silva',perfil:'RESPONSAVEL'};}
     if(fn==='MONT_appCarregar')return {nome:'Ana Silva',perfil:'RESPONSAVEL',etapas,apontamento:registro('apontamento')?.status==='ATIVO'?registro('apontamento'):null};
     if(fn==='MONT_bonusExtrato'){
      if(!window.bonusTentado){window.bonusTentado=true;throw Error('Sem conexão para carregar o bônus.');}
      return {pessoa:{nome:'Ana Silva',cargo:'Montadora',setor:'Montagem'},meses:[{mes:'2026-10',abastecido:300,pago:100,premiacao:false}],saldoPremiacao:0,atualizadoEm:'31/10/2026'};
     }
     if(fn==='MONT_fotosEtapa')return {pessoas:[{nome:'Ana Silva',papel:'responsavel',foto:location.origin+'/fixture.png'},{nome:'Bruno',papel:'equipe',foto:location.origin+'/fixture.png'}],caminhoes:[{nome:'Caminhão 01',foto:location.origin+'/fixture.png'}],solicitante:{nome:etapas.find(e=>e.id===args[1]).cliente,foto:location.origin+'/fixture.png'}};
     if(fn==='MONT_sincronizarCheckin')return registro('apontamento');
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
     if(fn==='MONT_fotoEquipe'){
      const apontamento=guardar('apontamento',{id:'apontamento',idEtapa:args[0].idCronograma,pedido:'123',inicio:new Date().toISOString(),status:'ATIVO'});
      return guardar('equipe',{enviado:true,chegada:{localStatus:'NO_LOCAL'},apontamento});
     }
     if(fn==='verificarEquipeTerceirizadaJaEnviada')return registro('equipe')||{};
     if(fn==='salvarSacolasProtecao')return guardar('sacolas',{enviado:true,sacolas:args[0].sacolas.map(s=>({codigo:s.codigo,fotos:['https://fixture.test/sacola.jpg']}))});
     if(fn==='verificarSacolasJaEnviadas')return registro('sacolas')||{};
     if(fn==='salvarListaAssinada')return guardar('lista',{enviado:true});
     if(fn==='verificarListaAssinadaJaEnviada')return registro('lista')||{};
     if(fn==='MONT_contagemItens')return {itens:lista};
     return {};
    }
    function runner(ok,no){return new Proxy({},{get:(_,fn)=>fn==='withSuccessHandler'?f=>runner(f,no):fn==='withFailureHandler'?f=>runner(ok,f):(...args)=>Promise.resolve().then(()=>result(fn,args)).then(r=>ok&&ok(r)).catch(e=>no&&no(e))});}
    window.google={script:{run:runner(),url:{getLocation(cb){cb({parameter:Object.fromEntries(new URLSearchParams(location.search))});}}}};
   });
   await page.goto(`http://127.0.0.1:${server.address().port}/Modulos/Chiavari/Cronograma/montador.html`);
   // Nov/2026: sem login próprio; entra sozinho pela conta do sistema (MONT_loginConta).
   await page.locator('#telaInicio.ativa').waitFor();assert.equal(await page.locator('#loginCpf').count(),0,'sem CPF/PIN');
   await page.screenshot({path:path.join(os.tmpdir(),`montador-cpf-login-${width}.png`)});
   assert.ok(await page.locator('#telaInicio .topo').evaluate(e=>e.getBoundingClientRect().height<190));
   await page.screenshot({path:path.join(os.tmpdir(),`montador-cpf-inicio-${width}.png`)});
   assert.equal(await page.evaluate(()=>chamadas.some(c=>c.fn==='MONT_listarResponsaveis')),false);
   assert.equal(await page.evaluate(()=>chamadas.filter(c=>c.fn==='MONT_loginConta').length),1,'entrou pela conta do sistema');
   // Nov/2026: a barra "Cronograma | Meu bônus" saiu; o bônus abre pelo menu do app (?tela=bonus).
   assert.equal(await page.locator('#appNavegacao').isVisible(),false,'sem a barra de baixo');
   await page.goto(`http://127.0.0.1:${server.address().port}/Modulos/Chiavari/Cronograma/montador.html?app=1&tela=bonus`);
   await page.locator('#telaBonus.ativa').waitFor();assert.equal(await page.locator('.bonus-inicio').isVisible(),true,'botão de voltar ao início');
   const bonus=page.frameLocator('#bonusConteudo iframe');await bonus.getByRole('button',{name:'Tentar novamente',exact:true}).click();
   await bonus.locator('#telaExtrato:not(.oculto)').waitFor();assert.match(await bonus.locator('#valorTotal').textContent(),/300/);
   assert.equal(await bonus.locator('#telaEntrada').isVisible(),false);assert.equal(await bonus.locator('.equipe-navegacao').count(),0);
   assert.equal(await bonus.locator('.btn-sair').isVisible(),false);
   assert.equal(await page.locator('#bonusConteudo iframe').getAttribute('src').then(v=>v.includes('token')),false);
   await page.evaluate(()=>carregar());assert.equal(await page.locator('#telaBonus').isVisible(),true,'atualizar não sai do bônus');
   await page.screenshot({path:path.join(os.tmpdir(),`montador-bonus-${width}.png`)});
   await page.goto(`http://127.0.0.1:${server.address().port}/Modulos/Chiavari/Cronograma/montador.html`);await page.locator('#telaInicio.ativa').waitFor();
   const cartao=page.locator('#telaInicio .etapa').filter({hasText:'Evento Jardim'});assert.equal(await cartao.locator('.etapa-cliente-foto').count(),1,'foto do cliente no cartão');assert.equal(await cartao.locator('a.etapa-endereco').count(),1,'endereço como link');
   await cartao.click();
   for(const nome of ['Ana Silva','Bruno','Caminhão 01']){
    await page.getByRole('button',{name:'Ver foto de '+nome,exact:true}).click();
    await page.locator('#folha .foto-free-ampliada').waitFor();assert.equal(await page.locator('#folha h3').textContent(),nome);
    await page.getByRole('button',{name:'Fechar foto',exact:true}).click();
   }
   assert.equal(await page.locator('#etapaCabeca .cabeca,#etapaCabeca .evento-cliente,#etapaCabeca .evento-endereco').count(),0,'sem cliente/endereço dentro da etapa');
   await page.getByRole('button',{name:'Consultar Uber novamente',exact:true}).click();
   await page.locator('#etapaUber').filter({hasText:'Pedro Motorista'}).waitFor();
   // Nov/2026: aba Equipe com Equipe · Caminhões · Uber lado a lado e a foto da equipe embaixo; o resto na aba Lista.
   const col=await page.evaluate(()=>['#etapaEquipe .evento-equipe','#etapaEquipe .evento-caminhoes','#etapaUber .secao','#etapaFotoEquipe'].map(q=>{const r=document.querySelector(q).getBoundingClientRect();return {top:Math.round(r.top),left:Math.round(r.left)};}));
   assert.ok(col[0].top===col[1].top&&col[1].top===col[2].top,'três colunas na mesma linha');assert.ok(col[0].left<col[1].left&&col[1].left<col[2].left,'equipe, caminhões e uber lado a lado');
   assert.ok(col[3].top>col[0].top,'foto da equipe abaixo das colunas');
   assert.equal(await page.locator('#etapaEquipe .evento-equipe .pessoa-responsavel').count(),1,'responsável na lista da equipe');
   assert.equal(await page.getByText('O check-in da equipe registra o início').count(),0,'sem a frase do check-in');
   assert.ok(await page.locator('#etapaAba_lista').isHidden(),'aba Lista começa fechada');
   await page.click('[data-etapa-aba="lista"]');
   const ordem=await page.evaluate(()=>['etapaConferencia','passo_sacolas','passo_lista'].map(id=>document.getElementById(id).getBoundingClientRect().top));
   assert.ok(ordem.every((n,i)=>!i||n>ordem[i-1]),'ordem do roteiro na aba Lista');
   await page.click('[data-etapa-aba="info"]');await page.locator('#etapaAssistente').waitFor();
   await page.click('[data-etapa-aba="equipe"]');assert.equal(await page.locator('#passo_posicionamento').count(),0);
   assert.equal(await page.getByText('Outras etapas do pedido',{exact:true}).count(),0);assert.equal(await page.getByText('Decorador confirmou',{exact:true}).count(),0);
   assert.ok(await page.evaluate(()=>{const b=document.getElementById('btnVoltar').getBoundingClientRect(),c=document.getElementById('etapaEtiquetas').getBoundingClientRect();return Math.abs(b.top+b.height/2-c.top-c.height/2)<3;}));
   assert.equal(await page.locator('#btnVoltar').textContent(),'Voltar');
   assert.ok(await page.locator('#etapaEquipe .evento-caminhoes').isVisible());assert.match(await page.locator('#etapaEquipe').textContent(),/Caminhão 01/);
   assert.equal(await page.locator('#regFotoEquipe input').isDisabled(),false);
   assert.equal(await page.getByRole('button',{name:'Iniciar evento'}).count(),0);
   assert.equal(await page.locator('#regEmpresas,#regQtd,#eventoDetalhes').count(),0);
   await page.getByRole('button',{name:'QR code da equipe',exact:true}).click();await page.getByText('123456',{exact:true}).waitFor();await page.locator('#folha').getByRole('button',{name:'Fechar',exact:true}).click();
   await page.getByRole('button',{name:'QR para o motorista',exact:true}).click();await page.getByText('654321',{exact:true}).waitFor();await page.locator('#folha').getByRole('button',{name:'Fechar',exact:true}).click();
   await page.click('[data-etapa-aba="lista"]');await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await page.locator('.entrega-item').first().waitFor();
   assert.deepEqual(await page.locator('.entrega-ambiente>h3').allTextContents(),['Cerimônia','Recepção']);
   assert.equal(await page.getByText(/Parte do kit:/).count(),0);assert.ok(await page.locator('.entrega-item h3').first().evaluate(e=>e.scrollHeight>e.clientHeight&&getComputedStyle(e).webkitLineClamp==='2'));
   await page.screenshot({path:path.join(os.tmpdir(),`montador-fluxo-inicial-${width}.png`),fullPage:true});
   await page.click('[data-etapa-aba="equipe"]');await page.locator('#regFotoEquipe input').setInputFiles({name:'equipe.png',mimeType:'image/png',buffer:png});await page.waitForSelector('#regFotoEquipe.tem');await page.getByRole('button',{name:'Enviar foto da equipe',exact:true}).click();await page.waitForSelector('#passo_equipe.concluido');
   assert.equal(await page.evaluate(()=>('quantidade' in chamadas.find(c=>c.fn==='MONT_fotoEquipe').args[0])),false);
   assert.equal(await page.locator('#regProgressoPct').textContent(),'25%');
   await page.click('[data-etapa-aba="lista"]');await page.getByRole('button',{name:'Salvar conferência',exact:true}).click();assert.equal(await page.evaluate(()=>chamadas.some(c=>c.fn==='MONT_entregaSalvar')),false);
   const linhas=page.locator('.entrega-item');await linhas.nth(0).getByRole('button',{name:'Tudo entregue, sem danos'}).click();
   assert.equal(await linhas.nth(0).locator('.entrega-quantidades').isVisible(),false);
   await linhas.nth(0).getByRole('button',{name:'Corrigir quantidades ou informar dano',exact:true}).click();
   assert.equal(await linhas.nth(0).locator('.entrega-quantidades').isVisible(),true);
   await linhas.nth(0).getByRole('button',{name:'Tudo entregue, sem danos'}).click();
   await linhas.nth(1).locator('[data-entregue]').fill('1');await linhas.nth(1).locator('[data-dano]').fill('1');
   await linhas.nth(1).locator('[data-obs]').fill('Pé da mesa danificado no transporte');
   await linhas.nth(1).locator('input[type=file]').setInputFiles({name:'dano.png',mimeType:'image/png',buffer:png});await page.waitForSelector('.entrega-foto-dano:not([hidden])');
   await page.locator('#btnVoltar').click();await page.locator('#telaInicio.ativa').waitFor();await page.locator('#telaInicio .etapa').filter({hasText:'Evento Jardim'}).click();assert.equal(await linhas.nth(1).locator('[data-entregue]').inputValue(),'1');
   await page.click('[data-etapa-aba="lista"]');await page.getByRole('button',{name:'Salvar conferência',exact:true}).click();await page.waitForSelector('.conferencia-enviada');assert.equal(await page.locator('#regProgressoPct').textContent(),'50%');
   const enviado=await page.evaluate(()=>chamadas.find(c=>c.fn==='MONT_entregaSalvar').args);assert.equal(enviado[0],'fixture');assert.equal(enviado[1],'montagem');assert.equal(enviado[2]['kit/b'].danificados,1);assert.match(enviado[2]['kit/b'].foto,/^data:image/);
   assert.equal(await linhas.nth(1).locator('[data-entregue]').isDisabled(),true);
   assert.equal(await linhas.nth(0).locator('.entrega-quantidades').isVisible(),false);assert.match(await linhas.nth(0).locator('.entrega-confirmado').textContent(),/3 entregues/);
   await page.locator('.codigo-sacola').fill('SC-001');await page.locator('#regSacolas input[type=file]').setInputFiles({name:'sacola.png',mimeType:'image/png',buffer:png});await page.waitForSelector('#regSacolas .foto.tem');await page.getByRole('button',{name:'Enviar sacolas',exact:true}).click();await page.waitForSelector('#passo_sacolas.concluido');
   await page.locator('#regRecebedor').fill('Maria Cliente');await page.locator('#regFotoLista input').setInputFiles({name:'lista.png',mimeType:'image/png',buffer:png});await page.waitForSelector('#regFotoLista.tem');await page.getByRole('button',{name:'Enviar lista assinada',exact:true}).click();await page.waitForSelector('#passo_lista.concluido');assert.equal(await page.locator('#regProgressoPct').textContent(),'100%');assert.equal(await page.locator('.tudo-pronto').isVisible(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:path.join(os.tmpdir(),`montador-fluxo-completo-${width}.png`),fullPage:true});
   await page.reload();await page.locator('#telaInicio .etapa').filter({hasText:'Evento Jardim'}).click();await page.click('[data-etapa-aba="lista"]');await page.waitForSelector('.conferencia-enviada');await page.waitForFunction(()=>document.getElementById('regProgressoPct').textContent==='100%');assert.equal(await page.locator('#regProgresso').count(),1);
   assert.equal(await page.getByRole('button',{name:/Encerrar apontamento/}).count(),0);
   await page.evaluate(async()=>{const p=JSON.parse(localStorage.getItem('fixture:apontamento'));p.status='ENCERRADO';p.fim=new Date().toISOString();localStorage.setItem('fixture:apontamento',JSON.stringify(p));await carregar();});
   await page.locator('.apontamento-tempo-final').waitFor();assert.equal(await page.evaluate(()=>estado.apontamento),null);
   await page.locator('#btnVoltar').click();await page.locator('#telaInicio.ativa').waitFor();
   await page.locator('#telaInicio .etapa').filter({hasText:'Evento Amanhã'}).click();
   await page.getByRole('button',{name:'Ver foto de Evento Amanhã',exact:true}).waitFor();
   const cabecaAmanha=await page.locator('#etapaCabeca .cabeca').evaluate(e=>({cor:getComputedStyle(e).backgroundColor,borda:getComputedStyle(e).borderTopWidth,raio:getComputedStyle(e).borderRadius}));
   assert.equal(cabecaAmanha.cor,cabeca.cor);assert.equal(cabecaAmanha.borda,cabeca.borda);assert.equal(cabecaAmanha.raio,'20px');
   await page.screenshot({path:path.join(os.tmpdir(),`montador-cabeca-amanha-${width}.png`)});
   await page.locator('#btnVoltar').click();
   await page.locator('#telaInicio .etapa').filter({hasText:'Outro evento'}).click();assert.equal(await page.locator('#etapaInfo').count(),1);assert.equal(await page.locator('#regProgresso').count(),1);assert.equal(await page.locator('#etapaConferencia').count(),0);assert.equal(await page.locator('#telaEtapa').evaluate(e=>e.classList.contains('evento-linear')),false);
   assert.equal(await page.locator('#etapaCabeca .cabeca').evaluate(e=>getComputedStyle(e).backgroundColor),cabeca.cor);
   await page.goto(`http://127.0.0.1:${server.address().port}/Modulos/Chiavari/Cronograma/montador.html?sistema=1&etapa=montagem`);
   await page.waitForFunction(()=>estado.token==='fixture-sistema'&&estado.etapaAberta==='montagem');
   assert.equal(await page.evaluate(()=>localStorage.getItem('montadorToken')),'fixture');
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('montadorSistemaToken')),'fixture-sistema');
   assert.equal(await page.evaluate(()=>estado.supervisor),true);
   assert.deepEqual(errors,[]);await page.close();console.log(`Montagem ${width}px: QR, foto, conferência com dano, sacolas, assinatura, restauração e troca de etapa OK.`);
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
