// Pedido do cliente (reunião): "a fonte do catálogo inteiro precisa aumentar pra ficar
// confortável a leitura". Este teste percorre as telas do catálogo num navegador de verdade e
// falha se QUALQUER texto visível ficar abaixo do piso de leitura (12px, medido pelo
// getComputedStyle — o que o navegador realmente desenha, não o que está escrito no CSS).
const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
const PISO=12;
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#b9a58c"/></svg>');
const ST='https://fixture/storage/v1/object/public/itens/';
const itens=[
 {id:'1',tipo:'Item',produto:'Bossa Nova',produto_base:'Bar',categoria:'Bares',subcategoria:'Bares Curvos',familia:'Bossa',material:'Madeira',cor:'Castanho Claro',estilo:'Contemporâneo',marca_modelo:'Chiavari',referencia:'BAR032',largura:3.8,altura:1.1,profundidade:.55,foto_url:ST+'bar1.png',descricao_complementar:'Acabamento em madeira maciça.',personalizable:true,capa_categoria:true,itens_fotos:[{slot:'detalhe_01',tipo:'detalhe',titulo:'Detalhe 01',url:ST+'d1.png',path:'c/1/geral/d1.png',ordem:1,cliente_id:null}],itens_modelos_3d:[]},
 {id:'2',tipo:'Item',produto:'Bossa Nova',produto_base:'Bar',categoria:'Bares',subcategoria:'Bares Curvos',material:'Madeira',cor:'Ébano',referencia:'BAR033',largura:3.8,altura:1.1,profundidade:.55,foto_url:ST+'bar2.png',itens_fotos:[],itens_modelos_3d:[]},
 {id:'3',tipo:'Item',produto:'Reto',produto_base:'Bar',categoria:'Bares',subcategoria:'Bares Curvos',material:'Madeira',cor:'Natural',referencia:'BAR040',largura:3,altura:1.1,profundidade:.5,foto_url:ST+'bar3.png',itens_fotos:[],itens_modelos_3d:[]},
 {id:'4',tipo:'Item',produto:'Alto',produto_base:'Bar',categoria:'Bares',subcategoria:'Bares Retos',material:'Aço',cor:'Preto',referencia:'BAR050',largura:2,altura:1.2,profundidade:.5,foto_url:ST+'bar4.png',itens_fotos:[],itens_modelos_3d:[]},
 {id:'5',tipo:'Item',produto:'Cadeira Dora',categoria:'Cadeiras',material:'Vime',cor:'Natural',referencia:'CAD001',largura:.45,altura:.9,profundidade:.45,foto_url:ST+'cad1.png',itens_fotos:[],itens_modelos_3d:[]},
];
// Devolve, pra cada texto visível abaixo do piso, um seletor curto + o tamanho computado.
const SCAN=(piso)=>{
  const out=[];
  const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
  while((n=w.nextNode())){
    if(!n.nodeValue.trim())continue;const el=n.parentElement;
    if(!el||['SCRIPT','STYLE','NOSCRIPT'].includes(el.tagName))continue;
    const b=el.getBoundingClientRect();if(!b.width||!b.height)continue;
    let oculto=false;for(let p=el;p&&p!==document.body;p=p.parentElement){const c=getComputedStyle(p);if(c.visibility==='hidden'||c.display==='none'||c.opacity==='0'){oculto=true;break;}}
    if(oculto)continue;
    const px=parseFloat(getComputedStyle(el).fontSize);
    if(px<piso-0.01)out.push(`${el.tagName.toLowerCase()}${el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\s+/)[0]:''}${el.id?'#'+el.id:''} ${Math.round(px*10)/10}px "${n.nodeValue.trim().slice(0,30)}"`);
  }
  return [...new Set(out)];
};
(async()=>{
const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
const problemas=[];
async function abrir(interno,vw=1440,vh=900){
  const page=await browser.newPage({viewport:{width:vw,height:vh}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page._errors=errors;
  await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
  await page.addInitScript(({itens,interno})=>{
    const fotos=[{id:'f1',categoria:'Bares',titulo:'Bar 1',url:'https://fixture/b1.png',path:'x',ordem:1}];
    if(interno){
      sessionStorage.setItem('login_ok','1');
      const builder=v=>new Proxy({},{get(_t,p){if(p==='then')return res=>res(v());return ()=>builder(v);}});
      window.supabaseClient={
        auth:{getSession:async()=>({data:{session:{user:{id:'u'}}},error:null}),getUser:async()=>({data:{user:{id:'u'}},error:null})},
        from(t){if(t==='usuarios_empresas')return builder(()=>({data:{empresa_id:'company'},error:null}));return builder(()=>({data:[],error:null}));},
        rpc:async n=>{
          if(n==='funcionario_contexto')return {data:{ativo:true,administrador_legado:true},error:null};
          if(n==='catalogo_carregar_interno')return {data:{empresa:{nome:'Chiavari'},decorador:null,itens},error:null};
          if(n==='catalogo_capas_carregar_interno')return {data:{portal:'https://fixture/capa.png'}};
          if(n==='biblioteca_carregar_interno')return {data:{fotos}};
          return {data:null,error:null};
        },
        functions:{invoke:async()=>({data:null,error:null})},
        storage:{from(){return {upload:async()=>({error:null}),remove:async()=>({error:null}),getPublicUrl:p=>({data:{publicUrl:'https://fixture/'+p}})};}},
      };
    }else{
      sessionStorage.setItem('catalogo_token','test');
      window.supabaseClient={rpc:async n=>{
        if(n==='catalogo_validar_sessao')return {data:{valido:true,empresa_id:'company',cliente_id:'client'}};
        if(n==='catalogo_carregar')return {data:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly Cristina'},itens}};
        if(n==='catalogo_capas_carregar')return {data:{portal:'https://fixture/capa.png'}};
        if(n==='biblioteca_carregar')return {data:{fotos}};
        if(n==='catalogo_creditos_saldo')return {data:{saldo:120,custos:{tecido:10,render:20}}};
        return {data:null};
      },functions:{invoke:async()=>({data:null,error:null})}};
    }
  },{itens,interno});
  await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
  await page.locator('.catalog-gateway').waitFor();
  return page;
}
async function tela(page,nome,acao){
  await acao();await page.waitForTimeout(700);
  const pequenos=await page.evaluate(SCAN,PISO);
  if(pequenos.length)problemas.push(`[${nome}] ${pequenos.join(' | ')}`);
  const alturaHeader=await page.locator('.catalog-header').evaluate(el=>Math.round(el.getBoundingClientRect().height));
  assert.ok(alturaHeader<=76,`[${nome}] o cabeçalho tem altura FIXA (72/76px) — a fonte maior não pode fazê-lo crescer (achou ${alturaHeader}px)`);
}
// ----- decorador externo -----
{
  const page=await abrir(false);
  await tela(page,'Portal',async()=>{});
  await tela(page,'Categorias',async()=>{await page.locator('[data-gateway-tile="catalogo"]').click();await page.locator('#catalogGrid .catalog-home-grid').waitFor();});
  await tela(page,'Categoria em grade',async()=>{await page.locator('[data-home-category="bares"]').click();await page.locator('[data-grid-item]').first().waitFor();});
  await tela(page,'Categoria em mosaico',async()=>{await page.locator('[data-view-mode="mosaic"]').click();await page.locator('.catalog-mosaic-tile').first().hover();});
  await tela(page,'Item imersivo',async()=>{await page.locator('[data-view-mode="grid"]').click();await page.locator('[data-grid-item] .catalog-grid-card-name').first().click();await page.locator('.catalog-product-section').first().waitFor();});
  await tela(page,'Experimente seu tecido',async()=>{await page.locator('[data-customize-item]').first().click();await page.locator('#catalogCustomizeDialog[open]').waitFor();});
  await page.evaluate(()=>document.getElementById('catalogCustomizeDialog').close());
  await tela(page,'Biblioteca',async()=>{await page.locator('.catalog-brand').click();await page.locator('[data-gateway-tile="biblioteca"]').click();await page.locator('#catalogBiblioteca:not(.hidden)').waitFor();});
  await tela(page,'3D Livre',async()=>{await page.locator('.catalog-brand').click();await page.locator('[data-gateway-tile="modulo3d"]').click();await page.locator('#catalogStudio:not(.hidden)').waitFor();});
  assert.deepEqual(page._errors,[],'nenhum erro de página');
  await page.close();
}
// ----- equipe interna (controles de edição, botão de capa etc.) -----
{
  const page=await abrir(true);
  await tela(page,'Equipe · Categorias',async()=>{await page.locator('[data-gateway-tile="catalogo"]').click();await page.locator('#catalogGrid .catalog-home-grid').waitFor();});
  await tela(page,'Equipe · Item imersivo',async()=>{await page.locator('[data-home-category="bares"]').click();await page.locator('[data-grid-item] .catalog-grid-card-name').first().click();await page.locator('.catalog-product-section').first().waitFor();});
  assert.ok(await page.locator('.catalog-capa-toggle').count()>0,'equipe vê o botão de capa (mesmo cenário do print do cliente)');
  assert.deepEqual(page._errors,[],'nenhum erro de página (equipe)');
  await page.close();
}
// ----- login do cliente -----
{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await page.addInitScript(()=>{window.supabaseClient={rpc:async()=>({data:null})};});
  await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
  await page.locator('#catalogLogin').waitFor();await page.waitForTimeout(500);
  const pequenos=await page.evaluate(SCAN,PISO);
  if(pequenos.length)problemas.push(`[Login do cliente] ${pequenos.join(' | ')}`);
  await page.close();
}
// ----- celular: texto grande não pode gerar rolagem horizontal -----
{
  const page=await abrir(false,390,800);
  await page.locator('[data-gateway-tile="catalogo"]').click();await page.locator('#catalogGrid .catalog-home-grid').waitFor();
  await page.locator('[data-home-category="bares"]').click();await page.locator('[data-grid-item] .catalog-grid-card-name').first().click();await page.locator('.catalog-product-section').first().waitFor();
  await page.waitForTimeout(600);
  const sobra=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(sobra<=1,`celular: sem rolagem horizontal na tela do item (sobrou ${sobra}px)`);
  // (A trilha "Catálogo / Categoria / Item" que passava por baixo dos ícones de visualização foi apagada.)
  assert.equal(await page.locator('#catalogBreadcrumb').count(),0,'a trilha abaixo do cabeçalho não existe mais');
  await page.close();
}
await browser.close();server.close();
assert.deepEqual(problemas,[],`Texto visível abaixo de ${PISO}px:\n`+problemas.join('\n'));
console.log('PASS: fonte do catálogo confortável — nenhum texto visível abaixo de '+PISO+'px em Portal, Categorias, grade, mosaico, item, tecido, Biblioteca, 3D Livre e login; cabeçalho continua com altura fixa; celular sem rolagem horizontal');
})().catch(e=>{console.error(e);process.exit(1);});
