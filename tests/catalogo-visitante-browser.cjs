const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
const { installMock } = require('./mock-projetos.cjs');
// Acesso de VISITANTE (pedido do usuário): na tela de entrada, "Explorar o catálogo" entra sem e-mail/senha e vê o mesmo
// catálogo padrão da equipe e a Biblioteca — sem preços, sem edição, sem Módulo 3D e sem Projetos. "Tenho acesso exclusivo"
// mostra e-mail e senha.
const PNG_1X1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
(async()=>{
const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/png',body:PNG_1X1}));
await page.addInitScript(installMock,{});
// Leituras públicas do visitante, como o banco devolve: itens SEM os campos de preço.
await page.addInitScript(()=>{
  const o=window.supabaseClient.rpc;window.__rpcs=[];
  window.supabaseClient.auth.signInWithPassword=async()=>({data:{user:null},error:{message:'x'}});window.supabaseClient.auth.signOut=async()=>({error:null});
  window.supabaseClient.rpc=async(nome,par)=>{
    window.__rpcs.push(nome);
    if(nome==='catalogo_vitrine_login') return {data:null,error:null};
    if(nome==='catalogo_publico_carregar'){
      const base=(await o('catalogo_carregar_interno',{})).data;
      return {data:{empresa:{nome:'Chiavari'},empresa_id:'company',decorador:null,itens:base.itens.map(({valor_locacao,valor_reposicao,...i})=>({...i,personalizable:true}))},error:null};
    }
    if(nome==='catalogo_capas_publico') return {data:{portal:'https://fixture/capa.png'},error:null};
    if(nome==='biblioteca_publico_carregar') return {data:{fotos:[{id:'f1',categoria:'Sofás',titulo:'Evento',url:'https://fixture/storage/v1/object/public/biblioteca/e1.png',ordem:1,cliente_id:null},{id:'f2',categoria:'Sofás',titulo:'Evento 2',url:'https://fixture/storage/v1/object/public/biblioteca/e2.png',ordem:2,cliente_id:null}]},error:null};
    return o(nome,par);
  };
});
await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');

// Entrada: por padrão só "Explorar o catálogo" + "Tenho acesso exclusivo"; o link mostra e-mail/senha e dá pra voltar
await page.locator('[data-login-visitante]').waitFor();
assert.equal(await page.locator('#catalogLoginForm').isVisible(),false,'E-mail e senha escondidos por padrão');
await page.locator('[data-login-exclusivo]').click();
assert.equal(await page.locator('#catalogLoginEmail').isVisible(),true,'Acesso exclusivo mostra e-mail e senha');
assert.equal(await page.locator('[data-login-visitante]').isVisible(),false);
assert.equal(await page.locator('[data-login-exclusivo]').getAttribute('aria-expanded'),'true');
await page.locator('[data-login-voltar]').click();
assert.equal(await page.locator('[data-login-visitante]').isVisible(),true,'Voltar mostra a escolha de novo');
assert.equal(await page.locator('#catalogLoginForm').isVisible(),false);

// Explorar o catálogo
await page.locator('[data-login-visitante]').click();
await page.locator('.catalog-gateway').waitFor();
assert.equal(await page.locator('#catalogLogin.hidden').count(),1);
assert.deepEqual(await page.locator('[data-gateway-tile]').evaluateAll(z=>z.map(e=>e.dataset.gatewayTile+(e.classList.contains('is-bloqueado')?':cadeado':''))),
  ['catalogo','biblioteca','modulo3d:cadeado','projetos:cadeado'],'Módulo 3D e Projetos aparecem, com cadeado');
assert.equal(await page.locator('.catalog-gateway-zone.is-bloqueado .catalog-gateway-cadeado').count(),2);
assert.deepEqual(await page.locator('.catalog-gateway-exclusivo').allTextContents(),['Acesso exclusivo','Acesso exclusivo']);
// Clicar num bloco com cadeado não abre o módulo: avisa e oferece entrar com acesso exclusivo
await page.locator('[data-gateway-tile="modulo3d"]').click();
await page.locator('.catalog-notification',{hasText:'Módulo 3D é exclusivo'}).waitFor();
assert.equal(await page.locator('#catalogStudio:not(.hidden)').count(),0,'Módulo 3D não abre');
await page.locator('[data-gateway-tile="projetos"]').click();
await page.locator('.catalog-notification',{hasText:'Projetos é exclusivo'}).waitFor();
assert.equal(await page.locator('#catalogProjetos:not(.hidden)').count(),0,'Projetos não abre');
assert.equal(await page.locator('[data-gateway-edit],[data-gateway-adjust],[data-gateway-client]').count(),0,'Sem edição da capa');
// Catálogo vai direto pras categorias (sem escolher projeto)
await page.locator('[data-gateway-tile="catalogo"]').click();
await page.locator('[data-home-category="sofas"]').waitFor();
await page.locator('[data-home-category="sofas"]').click();
await page.locator('[data-grid-item]').first().waitFor();
const grade=await page.evaluate(()=>({preco:document.querySelectorAll('.catalog-rental-price').length,projeto:document.querySelectorAll('[data-projeto-add],[data-projeto-qty]').length,alca:document.querySelectorAll('[draggable="true"]').length,texto:document.getElementById('catalogGrid').textContent}));
assert.ok(grade.preco>0,'Preço como "Sob consulta" na grade');assert.equal(grade.projeto,0,'Sem adicionar ao projeto');assert.equal(grade.alca,0,'Sem arrastar pra ordenar');
assert.doesNotMatch(grade.texto,/R\$/,'Nenhum valor em reais');assert.match(grade.texto,/Sob consulta/);
// Página do item: sem preço, sem "experimente outro tecido", sem edição de fotos/capa, sem projeto
await page.locator('[data-grid-item]').first().click();
await page.locator('.catalog-product-section').first().waitFor();
const item=await page.evaluate(()=>{const s=document.querySelector('.catalog-product-section');return {preco:s.querySelectorAll('.catalog-rental-price').length,tecido:s.querySelectorAll('.product-bespoke-card').length,editar:s.querySelectorAll('[data-inline-edit],[data-capa-toggle]').length,projeto:s.querySelectorAll('[data-projeto-add]').length,texto:s.textContent};});
assert.deepEqual({p:item.preco,t:item.tecido,e:item.editar,j:item.projeto},{p:1,t:0,e:0,j:0},'Item com "Sob consulta", sem tecido, edição ou projeto');
assert.doesNotMatch(item.texto,/R\$/);assert.match(item.texto,/Sob consulta/);
// Biblioteca: fotos da empresa, só visualizar
await page.locator('.catalog-brand').click();
await page.locator('[data-gateway-tile="biblioteca"]').click();
await page.locator('[data-library-folder="sofas"]').click();
await page.locator('.catalog-biblioteca-photo').first().waitFor();
const bib=await page.evaluate(()=>({fotos:document.querySelectorAll('.catalog-biblioteca-photo').length,controles:document.querySelectorAll('[data-move-photo],[data-remove-photo]').length,upload:!document.getElementById('catalogBibliotecaUpload')?.classList.contains('hidden')}));
assert.deepEqual(bib,{fotos:2,controles:0,upload:false},'Biblioteca só de visualização');
// Nada de dados de conta: nenhuma leitura com token, da equipe ou de projetos/formatos
const rpcs=await page.evaluate(()=>window.__rpcs);
assert.ok(rpcs.includes('catalogo_publico_carregar')&&rpcs.includes('catalogo_capas_publico')&&rpcs.includes('biblioteca_publico_carregar'));
assert.deepEqual(rpcs.filter(n=>/^(catalogo_carregar|catalogo_capas_carregar|biblioteca_carregar|projeto_|lounge_formatos|catalogo_creditos)/.test(n)),[],'Só leituras públicas: '+rpcs.join(','));
// Recarregar: continua como visitante (sem passar pela entrada)
await page.reload();
await page.locator('.catalog-gateway').waitFor();
assert.equal(await page.locator('#catalogLogin:not(.hidden)').count(),0,'Recarregar não pede a entrada de novo');
assert.equal(await page.locator('[data-gateway-tile].is-bloqueado').count(),2);
// "Entrar com acesso exclusivo" (do aviso do cadeado) leva direto ao e-mail e senha
await page.locator('[data-gateway-tile="projetos"]').click();
await page.locator('.catalog-notification',{hasText:'Projetos é exclusivo'}).getByRole('button',{name:'Entrar com acesso exclusivo'}).click();
await page.locator('#catalogLoginEmail').waitFor();
assert.equal(await page.locator('[data-login-visitante]').isVisible(),false,'Abre já no formulário');
assert.equal(await page.evaluate(()=>sessionStorage.getItem('catalogo_visitante')),null);
// Voltar e entrar como visitante de novo, pra testar o Sair
await page.locator('[data-login-voltar]').click();await page.locator('[data-login-visitante]').click();
await page.locator('.catalog-gateway').waitFor();
// Sair volta pra tela de entrada
await page.locator('#catalogLogout').click();
await page.locator('[data-login-visitante]').waitFor();
assert.equal(await page.evaluate(()=>sessionStorage.getItem('catalogo_visitante')),null);
// Celular
await page.setViewportSize({width:390,height:844});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
assert.deepEqual(errors,[]);
await browser.close();server.close();
console.log('PASS: visitante — entrada com "Explorar o catálogo"/"Tenho acesso exclusivo", catálogo e Biblioteca sem preço nem edição, sem Módulo 3D e Projetos, só leituras públicas, recarregar mantém, sair volta pra entrada');
})().catch(e=>{console.error(e);process.exit(1)});
