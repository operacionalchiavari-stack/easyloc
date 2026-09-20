// Reportado pelo usuário, com print da tela de um item: "verifique se tem sombras por trás da foto do item
// principal que causa dessa marcação em volta". Tinha: .product-main-image levava
// filter:drop-shadow(0 16px 12px rgba(50,38,28,.07)). drop-shadow desenha a sombra do FORMATO da imagem — numa
// foto opaca (fundo de estúdio, sem transparência) o formato é um retângulo, então saía uma sombra retangular:
// uma faixa mais escura logo abaixo da foto (rgb 243 contra 255 da página) e um halo nas laterais quando a
// foto é mais estreita que o quadro. Aqui o que é medido são os PIXELS que o navegador desenha em volta da foto
// (screenshot → cor de cada ponto), não o CSS: em volta da foto tem que ser o branco da página, sem sombra.
const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
// Fundo de estúdio quase branco (#fbfbfb, como as fotos reais) com um objeto escuro no meio.
const svg=(w,h)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#fbfbfb"/><rect x="${w*0.2}" y="${h*0.3}" width="${w*0.6}" height="${h*0.4}" fill="#7a5a3a"/></svg>`);
const ST='https://fixture/storage/v1/object/public/itens/';
(async()=>{
const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
const dec=await browser.newPage();await dec.setContent('<canvas id=c></canvas>');
const cores=(buf,pts)=>dec.evaluate(async ({b64,pts})=>{const im=new Image();im.src='data:image/png;base64,'+b64;await im.decode();const c=document.getElementById('c');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);return pts.map(([X,Y])=>{const d=x.getImageData(X,Y,1,1).data;return [d[0],d[1],d[2]];});},{b64:buf.toString('base64'),pts});

// [nome, largura, altura, onde a sombra apareceria]: a larga deixa folga em cima e embaixo; a alta, nas laterais.
for(const [nome,w,h] of [['foto larga (sobra espaço embaixo)',900,500],['foto alta e estreita (sobra espaço nas laterais)',400,800]]){
  const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await page.route('https://fixture/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg(w,h)}));
  await page.addInitScript(({ST})=>{sessionStorage.setItem('catalogo_token','test');window.supabaseClient={rpc:async n=>{
    if(n==='catalogo_validar_sessao')return {data:{valido:true,empresa_id:'company',cliente_id:'client'}};
    if(n==='catalogo_carregar')return {data:{empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},itens:[{id:'1',tipo:'Item',produto:'Poltrona',categoria:'Estofados',material:'Madeira',cor:'Natural',referencia:'R1',largura:1,altura:1,profundidade:1,foto_url:ST+'a.png',itens_fotos:[],itens_modelos_3d:[]}]}};
    if(n==='catalogo_capas_carregar')return {data:{}};return {data:null};}};},{ST});
  await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
  await page.locator('.catalog-gateway').waitFor();
  await page.locator('[data-gateway-tile="catalogo"]').click();await page.locator('#catalogGrid .catalog-home-grid').waitFor();
  await page.locator('[data-home-category="estofados"]').click();await page.locator('[data-grid-item]').first().click();
  await page.locator('.product-main-image').waitFor();
  await page.waitForFunction(()=>document.querySelector('.product-main-image').complete&&document.querySelector('.product-main-image').naturalWidth>0);
  await page.mouse.move(5,600);await page.waitForTimeout(900);
  assert.equal(await page.locator('.product-main-image').evaluate(el=>getComputedStyle(el).filter),'none','A foto principal não tem nenhum filter (drop-shadow) — numa foto opaca ele vira uma sombra retangular');
  // Retângulo REAL dos pixels da foto dentro do <img> (object-fit:contain deixa folga num dos eixos).
  const g=await page.evaluate(()=>{const media=document.querySelector('.product-main-media').getBoundingClientRect();const img=document.querySelector('.product-main-image');const ir=img.getBoundingClientRect();const s=Math.min(ir.width/img.naturalWidth,ir.height/img.naturalHeight);const fw=img.naturalWidth*s,fh=img.naturalHeight*s;const l=ir.left+(ir.width-fw)/2,t=ir.top+(ir.height-fh)/2;return {media:{l:media.left,t:media.top,r:media.right,b:media.bottom},foto:{l,t,r:l+fw,b:t+fh}};});
  const mx=(g.foto.l+g.foto.r)/2,my=(g.foto.t+g.foto.b)/2;
  const pts=[];const nomes=[];
  const add=(n,x,y)=>{if(x>=g.media.l+1&&x<=g.media.r-1&&y>=g.media.t+1&&y<=g.media.b-1&&x<1440&&y<900){pts.push([Math.round(x),Math.round(y)]);nomes.push(n);}};
  [2,6,12,20].forEach(d=>{add(`${d}px abaixo da foto`,mx,g.foto.b+d);add(`${d}px acima da foto`,mx,g.foto.t-d);add(`${d}px à esquerda da foto`,g.foto.l-d,my);add(`${d}px à direita da foto`,g.foto.r+d,my);});
  assert.ok(pts.length>=8,`${nome}: há folga em volta da foto pra medir (${pts.length} pontos)`);
  const lidos=await cores(await page.screenshot(),pts);
  const escuros=lidos.map((c,i)=>({n:nomes[i],c})).filter(({c})=>c.some(v=>v<255));
  assert.deepEqual(escuros,[],`${nome}: em volta da foto só o branco da página — sem sombra (pixels fora do branco puro: ${JSON.stringify(escuros)})`);
  assert.deepEqual(errors,[],'nenhum erro de página');
  await page.close();
}
await browser.close();server.close();
console.log('PASS: a foto principal do item não tem sombra em volta — sem filter/drop-shadow e, medido nos pixels da tela, o entorno da foto (embaixo, em cima, nas laterais, em 4 distâncias) é o branco puro da página, tanto com foto larga quanto com foto alta e estreita');
})().catch(e=>{console.error(e);process.exit(1);});
