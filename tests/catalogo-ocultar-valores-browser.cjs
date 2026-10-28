// Out/2026 — Catálogo do decorador (acesso exclusivo): botão do olho no cabeçalho esconde/mostra os valores na tela
// (reunião com o cliente final). Só visual (html.catalogo-sem-valores), lembrado por decorador; não aparece quando o
// preço está desligado para ele em Parâmetros > Catálogo (exibir.preco=false).
const {chromium}=require('playwright');const express=require('express');const assert=require('node:assert/strict');
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  async function abrir(exibirPreco){
    const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://**/*',r=>r.fulfill({body:'',contentType:'text/javascript'}));
    await page.addInitScript((exibirPreco)=>{
      sessionStorage.setItem('catalogo_token','test');
      window.supabaseClient={rpc:async name=>({data:name==='personalizacao_lista'?[]:name==='catalogo_validar_sessao'?{valido:true,empresa_id:'company',cliente_id:'client'}:name==='catalogo_capas_carregar'?{}:name==='catalogo_estoque'?{}:
        {empresa:{nome:'Chiavari'},decorador:{nome:'Kelly'},exibir:{preco:exibirPreco,estoque:true,disponivel:true},itens:[
          {id:'1',tipo:'Item',produto:'Sofá Um',categoria:'Estofados',foto_url:'',valor_locacao:exibirPreco?300:undefined,capa_categoria:false,itens_fotos:[],itens_modelos_3d:[]}]},error:null}),
        functions:{invoke:async()=>({data:{},error:null})},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}})})},
        auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
        from:()=>{const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:null,error:null}),single:async()=>({data:null,error:null}),then:(ok)=>Promise.resolve({data:[],error:null}).then(ok)};return q;}};
    },exibirPreco);
    await page.goto('http://127.0.0.1:'+server.address().port+'/Modulos/Comercial/Catalogo/catalogo.html');
    await page.locator('[data-gateway-tile="catalogo"]').waitFor();
    return {page,errors};
  }

  const {page,errors}=await abrir(true);
  const botao=page.locator('#catalogValoresToggle');
  await botao.waitFor();
  assert.equal(await botao.getAttribute('aria-pressed'),'false');
  assert.equal(await botao.getAttribute('title'),'Ocultar valores');
  // um preço na tela (como o do card) pra conferir que some de verdade
  await page.evaluate(()=>{const s=document.createElement('span');s.className='catalog-rental-price';s.id='precoTeste';s.textContent='R$ 300,00';document.body.appendChild(s);
    const t=document.createElement('table');t.innerHTML='<tr><td class="pa-valor" id="valorTeste">R$ 1,00</td></tr>';document.body.appendChild(t);});
  assert.ok(await page.isVisible('#precoTeste'));
  if(process.env.FOTO){await page.waitForTimeout(500);await page.screenshot({path:process.env.FOTO,clip:{x:0,y:0,width:1440,height:110}});}
  console.log('ok 1 - decorador com preço liberado vê o botão do olho no cabeçalho');

  await botao.click();
  assert.equal(await botao.getAttribute('aria-pressed'),'true');
  assert.equal(await botao.getAttribute('title'),'Mostrar valores');
  assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('catalogo-sem-valores')));
  assert.ok(await page.isHidden('#precoTeste'),'preço do card some');
  assert.ok(await page.isHidden('#valorTeste'),'colunas de valores do projeto/pedido somem');
  console.log('ok 2 - clicar esconde os valores (cards e colunas do projeto/pedido)');

  await page.reload();
  await botao.waitFor();
  assert.equal(await botao.getAttribute('aria-pressed'),'true','lembra a escolha ao recarregar');
  await botao.click();
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('catalogo-sem-valores')),false);
  console.log('ok 3 - lembra ao recarregar e clicar de novo mostra os valores');
  assert.deepEqual(errors,[]);
  await page.close();

  const sem=await abrir(false);
  await sem.page.waitForTimeout(800);
  assert.equal(await sem.page.isHidden('#catalogValoresToggle'),true,'sem preço liberado o botão não aparece');
  assert.deepEqual(sem.errors,[]);
  console.log('ok 4 - sem preço liberado (Parâmetros), o botão não aparece');
  console.log('todos os testes passaram');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
