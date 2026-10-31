/* Fluxos reais da interface com backend isolado: nenhuma gravação na empresa. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const root=path.resolve(__dirname,'..');
const foto='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XQAAAAASUVORK5CYII=';
async function main(){
 const server=http.createServer((req,res)=>{
  const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!f.startsWith(root+path.sep)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg'})[path.extname(f)]||'application/octet-stream');
  res.end(fs.readFileSync(f));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const width of [320,390,1280]){
   for(const tipo of ['free','bonus']){
    const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce',colorScheme:'dark'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://**/*',r=>r.fulfill({body:''}));
    await page.route('**/gas-cliente.js*',r=>r.fulfill({body:''}));
    await page.route('**/operacao-sem-motor.js*',r=>r.fulfill({body:''}));
    await page.addInitScript(({foto})=>{
     localStorage.setItem('easyloc:limpeza-dados','20261026-zerado');
     window.chamadas=[];
     window.supabaseClient={rpc:async nome=>({data:nome==='catalogo_capas_publico'?{portal:location.origin+'/slide2.jpg'}:{empresa:{nome:'Chiavari',logo_url:location.origin+'/logo%20nova%20branca%20-%20sem%20fundo.png'}}})};
     const vaga={idVaga:'vaga-1',etapa:'Montagem',dataISO:'2026-11-05',horario:'08:00',valor:180,pontoEncontro:'Espaço Jardim',lider:'Ana Silva',quantidade:3,confirmados:1,restantes:2,status:'ABERTA',fase:'AGUARDANDO',podeCancelar:true};
     const dadosFree={token:'sessao-free',perfil:{nome:'Carlos Oliveira',status:'APROVADO',pix:'free@example.test',miniatura:foto,pontuacao:{nota:5}},vagas:[vaga],minhas:[]};
     const meses=[{mes:'2025-12',abastecido:150,pago:150,premiacao:false},{mes:'2026-09',abastecido:300,pago:300,premiacao:false},{mes:'2026-10',abastecido:450,pago:null,premiacao:true,setorAtingiuMeta:true,rhAtingiuMeta:true,itensPremiacao:{saldoAnterior:0,disponivel:450,usado:200,saldo:250,itens:[{descricao:'Fone de ouvido',valor:200,dataCompra:'2026-10-25',fotoId:'foto-premio'}]}}];
     window.supabaseArquivoUrl=()=>foto;
     function result(fn,args){
      window.chamadas.push({fn,args});
      if(fn==='FREE_appLogin'||fn==='FREE_appCarregar')return structuredClone(dadosFree);
      if(fn==='FREE_appConfirmar'){
       vaga.minhaStatus='CONFIRMADO';dadosFree.minhas=[vaga];dadosFree.vagas=[];return structuredClone(dadosFree);
      }
      if(fn==='FREE_appSalvarPix'){dadosFree.perfil.pix=args[1];return structuredClone(dadosFree);}
      if(fn==='equipeEntrar')return {token:'sessao-bonus'};
      if(fn==='equipeExtrato')return {pessoa:{nome:'Ana Silva',cargo:'Montadora',setor:'Montagem',fotoUrl:foto},meses,saldoPremiacao:250,atualizadoEm:'31/10/2026 às 15:00'};
      return {};
     }
     function runner(ok,no){return new Proxy({},{get:(_,fn)=>fn==='withSuccessHandler'?f=>runner(f,no):fn==='withFailureHandler'?f=>runner(ok,f):(...args)=>Promise.resolve().then(()=>result(fn,args)).then(r=>ok&&ok(r)).catch(e=>no&&no(e))});}
     window.google={script:{run:runner(),url:{getLocation(cb){cb({parameter:{}});}}}};
    },{foto});
    const url=tipo==='free'?'/Modulos/Chiavari/Cronograma/free.html':'/Modulos/Chiavari/CentralMetas/equipe.html';
    await page.goto(base+url);
    const login=page.locator(tipo==='free'?'#telaLogin':'#telaEntrada');
    await login.waitFor({state:'visible'});
    assert.equal(await page.locator('.equipe-navegacao').isVisible(),false);
    await page.waitForFunction(()=>document.body.style.getPropertyValue('--equipe-capa').includes('slide2.jpg'));
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('.equipe-logo')).every(el=>el.complete&&el.naturalWidth>0));
    await page.screenshot({path:path.join(os.tmpdir(),`app-${tipo}-login-${width}.png`),fullPage:true});
    if(tipo==='free'){
     await page.getByRole('button',{name:'Fazer cadastro',exact:true}).click();await page.locator('#telaCadastro.ativa').waitFor();
     assert.equal(await page.locator('#cadAceite').count(),1);assert.equal(await page.locator('#fotoInput').count(),1);
     await page.getByRole('button',{name:'Entrar',exact:true}).last().click();
     await page.locator('#loginCpf').fill('12345678901');await page.locator('#loginSenha').fill('1234');
    }else{
     await page.locator('#cpf').fill('12345678901');await page.locator('#pin').fill('1234');
    }
    await page.locator('#btnEntrar').click();
    await page.locator(tipo==='free'?'#telaApp.ativa':'#telaExtrato:not(.oculto)').waitFor();
    const nav=page.getByRole('navigation',{name:'Navegação principal'});
    await nav.waitFor({state:'visible'});
    if(tipo==='free'){
     const abas=await page.locator('#telaApp .aba').evaluateAll(els=>els.map(el=>({top:el.getBoundingClientRect().top,raio:getComputedStyle(el).borderRadius})));
     assert.equal(abas[0].top,abas[1].top);assert.equal(abas[0].raio,'12px');
    }else await page.waitForFunction(()=>document.querySelector('[data-equipe-aba="inicio"]').getAttribute('aria-current')==='page');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${tipo} ${width}: largura`);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(244, 241, 236)');
    await page.screenshot({path:path.join(os.tmpdir(),`app-${tipo}-inicio-${width}.png`),fullPage:true});
    if(tipo==='free'){
     assert.equal(await nav.locator('[aria-current="page"]').textContent(),'Início');
     await page.getByRole('button',{name:'Confirmar presença',exact:true}).click();
     await page.getByRole('button',{name:'Sim, eu vou',exact:true}).click();
     await page.waitForFunction(()=>document.getElementById('abaMinhas').classList.contains('ativa'));
     assert.equal(await page.locator('#contMinhas').textContent(),'1');
     assert.equal(await nav.locator('[aria-current="page"]').textContent(),'Minhas vagas');
     assert.equal(await page.evaluate(()=>chamadas.find(c=>c.fn==='FREE_appConfirmar').args.join('|')),'sessao-free|vaga-1');
     await nav.getByRole('button',{name:'Conta',exact:true}).click();
     await page.getByRole('button',{name:'Minha chave PIX',exact:true}).click();
     await page.locator('#pixNovo').fill('novo@example.test');await page.getByRole('button',{name:'Salvar chave PIX',exact:true}).click();
     await page.waitForFunction(()=>chamadas.some(c=>c.fn==='FREE_appSalvarPix'));
     assert.equal(await page.locator('.equipe-conta').isVisible(),false);
     await nav.getByRole('button',{name:'Início',exact:true}).click();
     await page.getByText('Nenhuma vaga aberta agora',{exact:true}).waitFor();
    }else{
     assert.match(await page.locator('#valorTotal').textContent(),/750/);
     await page.locator('.ano-chip').getByText('2025',{exact:true}).click();
     assert.match(await page.locator('#valorTotal').textContent(),/150/);
     await page.locator('.ano-chip').getByText('2026',{exact:true}).click();
     await nav.getByRole('button',{name:'Extrato',exact:true}).click();
     await page.waitForFunction(()=>document.getElementById('extrato').getBoundingClientRect().top<innerHeight);
     await page.locator('#mov-2026-09 .mov-topo').click();
     assert.equal(await page.locator('#mov-2026-09').evaluate(e=>e.classList.contains('aberto')),true);
     await nav.getByRole('button',{name:'Prêmios',exact:true}).click();
     await page.locator('.premio').click();await page.locator('#visor:not(.oculto)').waitFor();
     assert.match(await page.locator('#visorTitulo').textContent(),/Fone de ouvido/);
     await page.getByRole('button',{name:'Fechar',exact:true}).click();
    }
    await page.getByRole('button',{name:'Minha conta',exact:true}).click();
    await page.getByRole('dialog').waitFor();
    await page.screenshot({path:path.join(os.tmpdir(),`app-${tipo}-conta-${width}.png`),fullPage:true});
    await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').isVisible(),false);
    await nav.getByRole('button',{name:'Conta',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Sair da conta',exact:true}).click();
    if(tipo==='free')await page.locator('#folha').getByRole('button',{name:'Sair',exact:true}).click();
    await login.waitFor({state:'visible'});assert.equal(await nav.isVisible(),false);
    assert.deepEqual(errors,[]);await page.close();
    console.log(`${tipo}: entrada, identidade, navegação, operação e saída em ${width}px OK.`);
   }
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
