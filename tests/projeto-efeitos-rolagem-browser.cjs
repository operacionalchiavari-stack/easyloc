const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
// Efeitos de rolagem na apresentação pública do projeto (pedido explícito: "quero que a landing page do projeto faça efeitos quando
// estiver descendo, como se fosse um site premium mesmo"): revelação em cascata (fade+leve subida) por seção/foto/móvel, parallax
// sutil na foto da capa e a barra de ambientes ganhando sombra ao rolar. Cobre o requisito mais crítico: o PDF SEMPRE sai completo,
// mesmo que a pessoa nunca tenha rolado a página (ver `.pj-reveal` no `@media print` de projeto.css).
const PNG_1X1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
(async()=>{
const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const base='http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/';
const browser=await chromium.launch({channel:'msedge',headless:true});
const itens=[1,2,3,4,5,6].map(n=>({id:String(n),nome:'Item '+n,categoria:'Móveis',material:'Madeira',cor:'Natural',largura:.45,altura:.9,profundidade:.5,foto_url:'https://fixture/storage/v1/object/public/itens/'+n+'.png'}));
const payload={ok:true,projeto:{noivos:'Ana & Bruno',data_evento:'2027-05-10',local_evento:'Sítio Vale Verde',foto_casal:null,ambientes:[
 {id:'a1',nome:'Cerimônia',notas:'Clima leve.',itens:itens.slice(0,3).map(i=>({item_id:i.id,quantidade:2})),renders:[{id:'r1',url:'https://fixture/storage/v1/object/public/projetos/x/1.png'},{id:'r2',url:'https://fixture/storage/v1/object/public/projetos/x/2.png'}]},
 {id:'a2',nome:'Lounge',notas:'',itens:itens.slice(3,6).map(i=>({item_id:i.id,quantidade:1})),renders:[]},
]},itens,decorador:{nome:'Kelly Decor',logo_url:null,telefone:'(11) 99999-0000',email:'kelly@decor.com'},empresa:{nome:'Chiavari',logo_url:null},layout:null};
const abrir=async(viewport={width:1400,height:900},opts={})=>{
 const context=await browser.newContext({viewport,reducedMotion:opts.reducedMotion?'reduce':'no-preference'});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await context.route('https://fixture/**',r=>r.fulfill({contentType:'image/png',body:PNG_1X1}));
 await page.addInitScript((p)=>{window.supabaseClient={rpc:async(name,a)=>name==='projeto_publico'?{data:a.p_pin==='482913'?p:{ok:false},error:null}:{data:null,error:null}};window.print=()=>{window.__imprimiu=(window.__imprimiu||0)+1;};},payload);
 await page.goto(base+'projeto.html?p=x#pin=482913');
 await page.locator('.pj-cover').waitFor();
 return {context,page,errors};
};

// 1) No carregamento (capa em tela cheia, layout padrão): nada abaixo da dobra já nasce revelado — é o próprio efeito "ao descer".
{
 const {context,page,errors}=await abrir();
 const antes=await page.evaluate(()=>({visiveis:document.querySelectorAll('.pj-reveal.is-visible').length,total:document.querySelectorAll('.pj-reveal').length,parallax:getComputedStyle(document.documentElement).getPropertyValue('--pj-parallax').trim(),navSombra:document.querySelector('.pj-nav').classList.contains('is-scrolled')}));
 assert.ok(antes.total>=10,'Várias seções marcadas pra revelar (ambientes, fotos, móveis, rodapé): '+antes.total);
 assert.equal(antes.visiveis,0,'Com a capa em tela cheia, nada abaixo dela está visível ainda');
 assert.equal(antes.navSombra,false);

 // 2) Rolar até o meio: o parallax da foto da capa muda (sem exceder a margem de segurança do scale) e a barra solidifica.
 await page.evaluate(()=>window.scrollTo({top:500}));
 await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--pj-parallax').trim()!=='');
 const meio=await page.evaluate(()=>({parallax:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pj-parallax')),navSombra:document.querySelector('.pj-nav').classList.contains('is-scrolled'),alturaCapa:document.querySelector('.pj-cover').getBoundingClientRect().height}));
 assert.ok(meio.parallax>0,'A foto da capa se move com a rolagem: '+meio.parallax);
 assert.ok(meio.parallax<=meio.alturaCapa*0.1+1,'Nunca mais que ~10% da altura da capa (a margem que o scale(1.12) permite sem mostrar borda): '+JSON.stringify(meio));
 assert.equal(meio.navSombra,true,'A barra de ambientes ganha sombra depois que a capa fica pra trás');

 // 3) Rolar até o fim: tudo revelado.
 await page.evaluate(()=>window.scrollTo({top:document.body.scrollHeight}));
 await page.waitForFunction(()=>document.querySelectorAll('.pj-reveal:not(.is-visible)').length===0);
 assert.deepEqual(errors,[]);
 await context.close();
}

// 4) O mais importante: baixar o PDF SEM ter rolado nada continua saindo completo — o @media print força tudo visível (e sem
// transição, senão o teste — e em tese qualquer impressão disparada bem na hora da troca de mídia — pegaria o valor ainda "em
// trânsito"). Confirmado com um page.pdf() de verdade, não só o computed style.
{
 const {context,page,errors}=await abrir();
 await page.emulateMedia({media:'print'});
 const opacidades=await page.evaluate(()=>[...document.querySelectorAll('.pj-reveal')].map(el=>getComputedStyle(el).opacity));
 assert.ok(opacidades.length>=10);
 assert.ok(opacidades.every(o=>o==='1'),'Toda seção sai opaca no PDF mesmo sem ter sido rolada até a vista: '+opacidades.join(','));
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.pj-cover-photo')).transform),'none','Parallax nunca aparece impresso');
 const pdf=await page.pdf({printBackground:true,preferCSSPageSize:true});
 const paginas=(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)||[]).length;
 assert.equal(paginas,4,'Capa + 2 ambientes (cada um em página própria) + rodapé = 4 páginas, nenhuma em branco');
 assert.deepEqual(errors,[]);
 await context.close();
}

// 5) prefers-reduced-motion: tudo aparece de cara, sem esperar rolagem nem transição — e o parallax nem mexe.
{
 const {context,page,errors}=await abrir({width:1400,height:900},{reducedMotion:true});
 const estado=await page.evaluate(()=>({visiveisJaAoCarregar:document.querySelectorAll('.pj-reveal').length,opacidades:[...document.querySelectorAll('.pj-reveal')].map(el=>getComputedStyle(el).opacity)}));
 assert.ok(estado.opacidades.every(o=>o==='1'),'Com menos movimento, tudo já nasce visível, mesmo fora da tela: '+estado.opacidades.join(','));
 await page.evaluate(()=>window.scrollTo({top:500}));
 await page.waitForTimeout(200);
 const parallax=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--pj-parallax').trim());
 assert.ok(parallax===''||parallax==='0px','Sem parallax pra quem pediu menos movimento: '+JSON.stringify(parallax));
 assert.deepEqual(errors,[]);
 await context.close();
}

// 6) ?modo=editor: tudo já nasce revelado, sem observer nem replay de fade a cada opção mexida (o preview troca de conteúdo o
// tempo todo enquanto a pessoa ajusta o layout). Precisa de um iframe de verdade (a página só ouve postMessage quando
// window.parent !== window) — mesmo desenho que catalogo-layouts.mjs usa pra hospedar esta mesma página.
{
 const context=await browser.newContext({viewport:{width:1000,height:900}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await context.route('https://fixture/**',r=>r.fulfill({contentType:'image/png',body:PNG_1X1}));
 // js/core/supabase.js só entra em ação se window.supabaseClient ainda não existir — modo=editor nunca chama o Supabase de
 // verdade (só postMessage), mas o <script> dele carrega igual (é incondicional no HTML); sem isso, cai no createClient()
 // de verdade e explode porque o CDN foi bloqueado acima.
 await context.addInitScript(()=>{window.supabaseClient={};});
 // O host precisa ser da MESMA origem que projeto.html (a checagem de postMessage em iniciarPrevia é estrita) — um
 // page.setContent() comum tem origem opaca (about:blank) e a mensagem de volta seria rejeitada.
 await context.route(base+'host-editor-teste.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 await page.goto(base+'host-editor-teste.html');
 await page.evaluate((p)=>{
  window.__payload=p;
  window.addEventListener('message',(e)=>{ if(e.data?.tipo==='pj-pronto') e.source.postMessage({tipo:'pj-dados',payload:window.__payload,layoutId:''},location.origin); });
 },payload);
 await page.evaluate(()=>{document.body.innerHTML='<iframe id="f" style="width:1000px;height:900px;border:0"></iframe>';});
 await page.locator('#f').evaluate((el,src)=>{el.src=src;},base+'projeto.html?modo=editor');
 const frame=await (await page.locator('#f').elementHandle()).contentFrame();
 await frame.waitForSelector('.pj-reveal');
 await frame.waitForFunction(()=>document.querySelectorAll('.pj-reveal:not(.is-visible)').length===0);
 const opacidades=await frame.evaluate(()=>[...document.querySelectorAll('.pj-reveal')].map(el=>getComputedStyle(el).opacity));
 assert.ok(opacidades.every(o=>o==='1'),'No editor tudo já nasce revelado, sem precisar rolar: '+opacidades.join(','));
 assert.deepEqual(errors,[]);
 await context.close();
}

await browser.close();server.close();
console.log('projeto-efeitos-rolagem-browser: ok');
})().catch((e)=>{console.error(e);process.exit(1);});
