const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
const { installMock } = require('./mock-projetos.cjs');
// Tela de login do catálogo (pedido do usuário, com referência): faixa escura com a logo em branco, frase no centro, cartão
// só com e-mail/senha/Entrar, e peças do PRÓPRIO acervo (RPC pública catalogo_vitrine_login) ao redor — umas nítidas, outras
// desfocadas — trocando devagar com fade, sem repetir peça na tela.
const PNG_1X1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const VITRINE={empresa:{nome:'Chiavari',logo_url:'https://fixture/storage/v1/object/public/logos/chiavari.png'},
  fotos:Array.from({length:18},(_,i)=>({url:'https://fixture/storage/v1/object/public/itens/peca'+i+'.png',categoria:'Cat '+(i%6),nome:'Peça '+i}))};
(async()=>{
const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
async function abrir({width=1440,height=900,reduced=false,vitrine=VITRINE}={}){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:reduced?'reduce':'no-preference'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/png',body:PNG_1X1}));
  await page.addInitScript(installMock,{});
  await page.addInitScript((vit)=>{window.__vitrineChamadas=[];window.supabaseClient.auth.signInWithPassword=async()=>({data:{user:null,session:null},error:{message:'Invalid login credentials'}});window.supabaseClient.auth.signOut=async()=>({error:null});const o=window.supabaseClient.rpc;window.supabaseClient.rpc=async(nome,par)=>{if(nome==='catalogo_vitrine_login'){window.__vitrineChamadas.push(par);return {data:vit,error:null};}return o(nome,par);};},vitrine);
  await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html'+(vitrine===VITRINE?'':'?empresa=abc'));
  await page.locator('#catalogLogin:not(.hidden)').waitFor();
  return {page,errors};
}
const naTela=(page)=>page.evaluate(()=>[...document.querySelectorAll('.catalog-login-peca')].map(p=>p.dataset.url));

// --- Desktop ---
{
  const {page,errors}=await abrir();
  await page.waitForFunction(()=>document.querySelectorAll('.catalog-login-peca.is-visivel').length===15);
  // Entrada padrão: "Explorar o catálogo" (visitante); o formulário aparece em "Tenho acesso exclusivo"
  assert.equal(await page.locator('[data-login-visitante]').isVisible(),true);
  await page.locator('[data-login-exclusivo]').click();
  await page.locator('#catalogLoginEmail').waitFor();
  const g=await page.evaluate(()=>{const r=e=>document.querySelector(e).getBoundingClientRect();const bar=document.querySelector('.catalog-login-bar');
    return {bar:getComputedStyle(bar).backgroundColor,logoFiltro:getComputedStyle(document.querySelector('.catalog-login-logo')).filter,quadrada:document.querySelector('.catalog-login-logo').classList.contains('is-quadrada'),
      titulo:document.getElementById('catalogLoginTitle').textContent,em:document.querySelector('#catalogLoginTitle em').textContent,
      card:r('.catalog-login-card'),centroBox:r('.catalog-login-centro'),centro:innerWidth/2,fundo:document.querySelectorAll('.catalog-login-peca.is-fundo').length,
      pecas:[...document.querySelectorAll('.catalog-login-peca:not(.is-fora)')].map(p=>p.getBoundingClientRect()),
      cartao:(()=>{const c=getComputedStyle(document.querySelector('.catalog-login-card'));return c.borderTopWidth+'|'+c.backgroundColor+'|'+c.boxShadow;})(),
      convite:document.querySelector('.catalog-login-convite').textContent,rotulos:[...document.querySelectorAll('.catalog-login-campo')].map(l=>l.firstChild.textContent.trim()),
      campos:[...document.querySelectorAll('#catalogLoginForm input')].map(i=>i.id),botoes:[...document.querySelectorAll('#catalogLoginForm button')].map(b=>b.textContent.trim()),
      texto:document.getElementById('catalogLogin').textContent,sw:document.documentElement.scrollWidth-innerWidth};});
  assert.equal(g.bar,'rgb(90, 90, 85)','Faixa na cor do cabeçalho do catálogo');
  assert.match(g.logoFiltro,/brightness\(0\).*invert\(1\)/,'Logo em branco');
  assert.equal(g.titulo,'Transite por vários estilos e encontre o seu');assert.equal(g.em,'o seu');
  assert.ok(Math.abs((g.card.left+g.card.right)/2-g.centro)<2,'Cartão centralizado');
  assert.deepEqual(g.campos,['catalogLoginEmail','catalogLoginPassword']);assert.deepEqual(g.botoes,['Entrar','← Entrar sem acesso exclusivo']);
  assert.doesNotMatch(g.texto,/Google|Apple|Microsoft|Mobiliário e decoração|Esqueceu/i,'Nada além de e-mail, senha e Entrar');
  assert.equal(g.fundo,9,'Peças desfocadas ao fundo');
  const toca=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  assert.ok(g.pecas.every(p=>!toca(p,g.centroBox)),'Nenhuma peça em cima da frase ou do cartão');
  // Embaralhado: as peças não se alinham em colunas (muitas posições horizontais diferentes)
  assert.ok(new Set(g.pecas.map(p=>Math.round(p.left/40))).size>=10,'Posições horizontais variadas');
  assert.equal(g.sw,0);
  // Sem cartão: formulário solto, convite em cima e os nomes dos campos escritos acima de cada um
  assert.equal(g.cartao,'0px|rgba(0, 0, 0, 0)|none','Sem cartão em volta do formulário');
  assert.equal(g.convite,'Acesse seu catálogo exclusivo');assert.deepEqual(g.rotulos,['E-mail','Senha']);
  // Nome ao passar o mouse numa peça nítida: só o nome, com a seta
  const nitida=page.locator('.catalog-login-peca:not(.is-fundo):not(.is-fora) img').first();const bx=await nitida.boundingBox();
  await page.mouse.move(bx.x+bx.width/2,bx.y+bx.height/2);await page.waitForTimeout(900);
  const nome=await page.evaluate(()=>{const e=document.querySelector('.catalog-login-peca:hover');const n=e.querySelector('.catalog-login-nome');return {txt:n.textContent,op:getComputedStyle(n).opacity,seta:!!n.querySelector('svg.catalog-login-seta'),url:e.dataset.url};});
  assert.equal(nome.op,'1');assert.ok(nome.seta);assert.equal(nome.txt,'Peça '+nome.url.match(/peca([0-9]+)/)[1],'Nome certo da peça, e só o nome');
  assert.equal(await page.locator('.catalog-login-peca.is-fundo .catalog-login-nome').count(),0,'Peças desfocadas não têm nome');
  await page.mouse.move(2,300);
  assert.deepEqual(await page.evaluate(()=>window.__vitrineChamadas),[{}],'Sem ?empresa=, a RPC escolhe a empresa');
  // Troca devagar, uma peça por vez, sem repetir na tela
  const antes=await naTela(page);assert.equal(new Set(antes).size,15,'Sem peça repetida');
  await page.waitForTimeout(9000);
  const depois=await naTela(page);
  assert.ok(depois.filter((u,i)=>u!==antes[i]).length>=1,'Alguma peça trocou');
  assert.equal(new Set(depois).size,15,'Continua sem repetir');
  // Formulário continua sendo o de sempre (erro aparece)
  await page.locator('#catalogLoginEmail').fill('x@x.com');await page.locator('#catalogLoginPassword').fill('errada');
  await page.locator('#catalogLoginForm button[type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('catalogLoginStatus').textContent.length>0);
  assert.deepEqual(errors,[],JSON.stringify(errors));
  await page.close();
}
// --- Celular: 4 peças apagadas, sem rolagem lateral ---
{
  const {page,errors}=await abrir({width:390,height:844});
  await page.waitForFunction(()=>document.querySelectorAll('.catalog-login-peca.is-visivel').length===5);
  const m=await page.evaluate(()=>({sw:document.documentElement.scrollWidth-innerWidth,op:getComputedStyle(document.querySelector('.catalog-login-peca')).opacity,card:document.querySelector('.catalog-login-explorar').getBoundingClientRect().width}));
  assert.equal(m.sw,0);assert.ok(+m.op<=.4,'Peças apagadas no celular');assert.ok(m.card>300);
  assert.deepEqual(errors,[]);await page.close();
}
// --- Movimento reduzido: nada troca; ?empresa= vai pra RPC ---
{
  const {page,errors}=await abrir({reduced:true,vitrine:{...VITRINE}});
  await page.waitForFunction(()=>document.querySelectorAll('.catalog-login-peca.is-visivel').length===15);
  assert.deepEqual(await page.evaluate(()=>window.__vitrineChamadas),[{p_empresa_id:'abc'}]);
  const antes=await naTela(page);await page.waitForTimeout(8000);assert.deepEqual(await naTela(page),antes,'Sem trocas com movimento reduzido');
  assert.deepEqual(errors,[]);await page.close();
}
// --- Sem vitrine (RPC sem empresa): a tela funciona sem peças nem logo ---
{
  const {page,errors}=await abrir({vitrine:null});
  await page.waitForTimeout(800);
  assert.equal(await page.locator('.catalog-login-peca').count(),0);
  assert.equal(await page.locator('[data-login-visitante]').isVisible(),true);
  assert.deepEqual(errors,[]);await page.close();
}
await browser.close();server.close();
console.log('PASS: login do catálogo — faixa com logo branca, frase, cartão só com e-mail/senha/Entrar, vitrine do acervo trocando sem repetir, celular, movimento reduzido, sem vitrine');
})().catch(e=>{console.error(e);process.exit(1)});
