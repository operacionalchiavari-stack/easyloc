const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
// Campo de busca do cabeçalho mais visível (pedido explícito do usuário: "no canto superior direito da
// tela existe um campo de pesquisa, quero deixar ele mais visível, do jeito que está hoje a pessoa quase
// não vê"). Antes era só uma linha fininha translúcida embaixo do texto, sem fundo — virou uma pílula com
// fundo e contorno sempre visíveis (não só no foco). Cobre: contraste real contra o cabeçalho, o texto
// "Pesquisar" cabendo inteiro na coluna mais estreita (110px, de 768 a 1450px de largura), os dois temas
// (externo escuro / interno claro) e o foco.
(async()=>{
const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c9a874"/></svg>');
const itens=[{id:'1',tipo:'Item',produto:'Poltrona Um',categoria:'Estofados',foto_url:'https://fixture/a.png',capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]}];
const abrir=async(viewport)=>{
 const context=await browser.newContext({viewport});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await context.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 await page.addInitScript((its)=>{
  sessionStorage.setItem('catalogo_token','test');
  window.supabaseClient={rpc:async(name)=>({data:name==='catalogo_validar_sessao'?{valido:true,empresa_id:'company',cliente_id:'client'}:name==='catalogo_capas_carregar'?{}:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:its}})};
 },itens);
 await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
 await page.locator('.catalog-header').waitFor();
 await page.locator('.catalog-search').waitFor({state:'attached'});
 return {context,page,errors};
};
const rgb=(t)=>t.match(/[\d.]+/g).slice(0,3).map(Number);
const dist=(a,b)=>Math.hypot(...rgb(a).map((v,i)=>v-rgb(b)[i]));

// 1) Externo (decorador), cabeçalho escuro: fundo/contorno da pílula precisam se destacar de verdade do
// cabeçalho — não só um texto/ícone translúcido em cima da mesma cor.
{
 const {context,page,errors}=await abrir({width:1920,height:900});
 const cores=await page.evaluate(()=>{
  const cs=(s)=>getComputedStyle(document.querySelector(s));
  return {header:cs('.catalog-header').backgroundColor,pilula:cs('.catalog-search').backgroundColor,borda:cs('.catalog-search').borderColor,radius:cs('.catalog-search').borderRadius,texto:cs('#catalogSearch').color,placeholder:cs('.catalog-search').getPropertyValue('--x')};
 });
 assert.ok(dist(cores.pilula,cores.header)>15,'O fundo da pílula precisa se distinguir do cabeçalho: '+JSON.stringify(cores));
 assert.notEqual(cores.borda,'rgba(0, 0, 0, 0)','Tem contorno visível, não só o texto');
 assert.match(cores.radius,/^(999|1000|500)px|50%/,'Formato de pílula: '+cores.radius);
 // ícone e placeholder mais opacos que antes (eram .72/.55 de opacidade branca)
 const opacidades=await page.evaluate(()=>{
  const svgColor=getComputedStyle(document.querySelector('.catalog-search svg')).color;
  return svgColor;
 });
 assert.match(opacidades,/rgba\(255, 255, 255, 0\.9/,'Ícone bem mais opaco que antes: '+opacidades);
 assert.deepEqual(errors,[]);
 await context.close();
}

// 2) A pior largura pra caber o texto: coluna de busca de 110px (768–1450px). "Pesquisar" tem que
// aparecer inteiro, sem cortar — é exatamente o cenário que quebrou na primeira tentativa desta mudança
// (aumentar o preenchimento sem tirar a decoração nativa do input[type=search] cortava o texto).
for(const width of [768,900,1300,1450]){
 const {context,page,errors}=await abrir({width,height:900});
 const info=await page.evaluate(()=>{
  const inp=document.getElementById('catalogSearch');
  const antes=inp.value;
  inp.value='Pesquisar';
  const r1=inp.getBoundingClientRect();
  // um "clone" invisível mede o texto de verdade no mesmo font, sem o recorte do input
  const clone=document.createElement('span');
  const cs=getComputedStyle(inp);
  clone.style.cssText='position:absolute;visibility:hidden;white-space:pre;font:'+cs.font+';letter-spacing:'+cs.letterSpacing;
  clone.textContent='Pesquisar';
  document.body.appendChild(clone);
  const precisa=clone.getBoundingClientRect().width;
  clone.remove();
  inp.value=antes;
  return {disponivel:r1.width,precisa};
 });
 assert.ok(info.disponivel>=info.precisa,`largura ${width}: precisa de ${info.precisa}px, o input tem ${info.disponivel}px`);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('catalogSearch')).appearance),'none','appearance:none tira a decoração nativa (era ela que reservava espaço e cortava o texto)');
 assert.deepEqual(errors,[]);
 await context.close();
}

// 3) Interno (aberto de dentro do sistema, cabeçalho claro): também precisa de contraste de verdade
// contra o branco da faixa, não só contra o cinza escuro do modo externo.
{
 const {context,page,errors}=await abrir({width:1300,height:900});
 await page.evaluate(()=>document.body.classList.add('catalog-modo-sistema'));
 // background/border têm transition (.2s) — ler o computed style na mesma tick pega o valor ainda em
 // trânsito (praticamente o antigo). Espera a transição terminar antes de comparar.
 await page.waitForTimeout(300);
 const cores=await page.evaluate(()=>{
  const cs=(s)=>getComputedStyle(document.querySelector(s));
  return {header:cs('.catalog-header').backgroundColor,pilula:cs('.catalog-search').backgroundColor,borda:cs('.catalog-search').borderColor};
 });
 assert.equal(cores.header,'rgb(255, 255, 255)');
 assert.ok(dist(cores.pilula,cores.header)>3,'Fundo levemente diferente do branco: '+JSON.stringify(cores));
 assert.notEqual(cores.borda,'rgba(0, 0, 0, 0)');
 // foco: fica ainda mais evidente (fundo branco puro + contorno na cor de destaque)
 await page.locator('#catalogSearch').focus();
 await page.waitForTimeout(300);
 const foco=await page.evaluate(()=>getComputedStyle(document.querySelector('.catalog-search')).borderColor);
 assert.notEqual(foco,cores.borda,'O contorno muda no foco');
 assert.deepEqual(errors,[]);
 await context.close();
}

// 4) Continua escondido no celular (decisão de espaço já existente, não mexida aqui) — a pílula não faz
// o campo aparecer onde antes não cabia.
{
 const {context,page,errors}=await abrir({width:390,height:844});
 assert.equal(await page.locator('.catalog-search').isVisible(),false,'Continua escondido no celular (sem espaço no cabeçalho)');
 assert.deepEqual(errors,[]);
 await context.close();
}

await browser.close();server.close();
console.log('catalogo-busca-visivel-browser: ok');
})().catch((e)=>{console.error(e);process.exit(1);});
