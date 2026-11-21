const {chromium}=require('playwright'),express=require('express'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const regras=require('../js/shared/complexidade');
const contexto={id:'00000000-0000-0000-0000-000000000030',numero:'101',data_evento:'2026-11-04',cliente_nome:'Cliente de teste',local_nome:'Local de teste',tipo_evento:'Casamento',config:regras.padrao(),cliente:{complexidade:{reclamacao:false}},pedidos_anteriores:1,local:{complexidade:{baldeacao:false,escada:true,distancia_manual_m:20}},caminhoes:1,carregamento:{data:'2026-11-02',hora:'09:00:00'},montagem:{data:'2026-11-04',hora:'10:00:00'},confirmado_em:'2026-10-30T10:00:00-03:00',excecoes:{viagens:1},itens:[{item_id:'a',familia:'Sofás',complexidade:{sob_medida:false,volumoso:true}}],pecas:[{item_id:'a',quantidade:5,complexidade:{fragil:false}}],servicos:[]};
contexto.cliente={complexidade:{},reclamacao_historico:{valor:false,fonte:'Histórico de feedbacks',detalhe:'Nenhuma reclamação registrada para este cliente no histórico de feedbacks'}};
(async()=>{
 const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const width of [390,1360]){
  const page=await browser.newPage({viewport:{width,height:950},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.fulfill({body:''}));await page.route('**/gas-cliente.js*',r=>r.fulfill({body:''}));await page.route('**/js/core/supabase.js*',r=>r.fulfill({body:''}));
  await page.addInitScript(c=>{
   localStorage.setItem('easyloc:limpeza-dados','20261026-zerado');sessionStorage.setItem('painel_complexidade_acesso_ate',String(Date.now()+600000));
   window.__CONTEXT={empresa_id:'empresa'};window.__contexto=c;window.__writes=[];window.__lista=[];
   function runner(ok,no){return new Proxy({},{get:(_,fn)=>fn==='withSuccessHandler'?f=>runner(f,no):fn==='withFailureHandler'?f=>runner(ok,f):(...args)=>Promise.resolve().then(()=>{
    if(fn==='listarPedidos'){const p=CXRegras.paraPainel(window.__contexto);p.planejamento=window.__contexto.excecoes;window.__lista=[p];return [p];}
    if(fn==='validarSenhaPlanilha')return true;return [];
   }).then(r=>ok?.(r)).catch(e=>no?.(e))});}
   window.google={script:{run:runner()}};
   const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
   window.supabaseClient={from:t=>{const dado=t==='clientes_empresas'?[{nome_razao:'Cliente de teste',catalogo_logo_url:PNG}]:{config:{faixas_cor:{azul_ate:10,amarelo_ate:20}}};const q={select:()=>q,eq:()=>q,maybeSingle:()=>q,then:(ok,no)=>Promise.resolve({data:dado,error:null}).then(ok,no)};return q;},auth:{getSession:async()=>({data:{session:{user:{id:'gestor'}}}})},rpc:async(nome,args)=>{
    if(nome==='complexidade_salvar_excecoes'){window.__writes.push({nome,args});window.__contexto.excecoes={...args.p_dados,respostas:Object.fromEntries(Object.entries(args.p_dados.respostas).map(([k,v])=>[k,{valor:v,motivo:args.p_motivo}]))};}
    if(nome==='complexidade_contextos_tela')return {data:[{...window.__contexto,id:window.__contexto.id}],error:null};
    return {data:null,error:null};
   }};
  },contexto);
  await page.goto(`http://127.0.0.1:${server.address().port}/Modulos/Chiavari/Costura/costura.html`);
  await page.locator('#listaPedidos tbody tr').waitFor();
  // nov/2026: sem abas nem botão Painel; uma tabela com todos os setores, foto do cliente, número em card azul e a cor da nota pela faixa
  assert.equal(await page.locator('.btn-setor').count(),0);assert.equal(await page.getByRole('button',{name:'Painel',exact:true}).count(),0);
  assert.deepEqual((await page.locator('#listaPedidos thead th').allTextContents()).map(t=>t.trim()),['Data','Pedido','Cliente','Local','Estofados','Pintura','Montagem','Triagem','Carregamento']);
  assert.equal(await page.locator('#listaPedidos').evaluate(e=>getComputedStyle(e,'::before').content),'none','sem o título Pedidos');
  assert.equal(await page.locator('#listaPedidos .pedido-destaque').evaluate(e=>getComputedStyle(e).color),'rgb(185, 28, 28)','número em vermelho');
  await page.waitForFunction(()=>document.querySelector('#listaPedidos .cx-foto img'));
  assert.deepEqual(await page.$$eval('#listaPedidos .cx-esq',l=>[...new Set(l.map(e=>getComputedStyle(e).textAlign))]),['left'],'Cliente e Local alinhados à esquerda');
  assert.ok(await page.$eval('#listaPedidos tbody td.cx-esq .cx-cliente',e=>e.getBoundingClientRect().left-e.closest('td').getBoundingClientRect().left<20),'cliente encostado à esquerda da coluna');
  const setor=n=>page.locator('#listaPedidos tbody tr td.cx-td-setor').nth(n);
  assert.equal(await page.locator('#listaPedidos tbody tr .score').count(),5);
  assert.match(await setor(0).locator('.score').textContent(),/\d+(,\d+)?%/);assert.equal(await setor(0).locator('.cx-score-legenda').textContent(),'Dificuldade mínima');
  assert.equal(await setor(1).locator('.cx-score-legenda').textContent(),'Dificuldade mínima');assert.doesNotMatch(await page.locator('#listaPedidos').textContent(),/Não se aplica/);
  assert.match(await setor(2).locator('.score').textContent(),/\d+(,\d+)?%/);assert.equal(await setor(2).locator('.cx-score-legenda').count(),0);
  assert.equal(await page.locator('#listaPedidos .score.cx-cor-vermelho').count(),5,'faixas do teste: azul até 10%, amarelo até 20%');
  await page.evaluate(()=>{window.__cxFaixas={azul_ate:90,amarelo_ate:95};render();});assert.equal(await page.locator('#listaPedidos .score.cx-cor-azul').count(),5);
  await page.locator('#listaPedidos tbody tr').click();await page.locator('.cxt:not([hidden]) .cxt-q').first().waitFor();assert.match(await page.locator('.cxt-setores').textContent(),/Estofados/);assert.doesNotMatch(await page.locator('.cxt').textContent(),/Não se aplica/);await page.locator('[data-cxt-q="5"]').click();await page.waitForFunction(()=>/Histórico de feedbacks/.test(document.querySelector('[data-cxt-provas]').textContent));await page.getByRole('button',{name:'← Voltar',exact:true}).click();
  await page.getByRole('searchbox',{name:'Filtrar cliente ou local',exact:true}).click();await page.getByRole('searchbox',{name:'Filtrar cliente ou local',exact:true}).fill('Local de teste');assert.equal(await page.locator('#listaPedidos tbody tr').count(),1);
  await page.getByRole('searchbox',{name:'Filtrar cliente ou local',exact:true}).fill('Cliente de teste');assert.equal(await page.locator('#listaPedidos tbody tr').count(),1);
  await page.getByRole('searchbox',{name:'Filtrar cliente ou local',exact:true}).fill('');
  if(width>1100){assert.ok(await page.locator('.cx-cabecalho-linha').evaluate(e=>{const [a,b,c]=[...e.children].map(x=>x.getBoundingClientRect());return a.right<b.left&&b.right<c.left&&Math.abs((b.left+b.right)/2-innerWidth/2)<3;}));}
  assert.equal(await page.getByRole('button',{name:'Limpar',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Atualizar dados',exact:true}).count(),0);assert.equal(await page.locator('.cx-automacao-ajuda').count(),0);
  await page.screenshot({path:path.join(os.tmpdir(),`complexidade-cabecalho-${width}.png`)});
  await page.evaluate(async()=>{__contexto.cliente={};pedidos=await new Promise(ok=>google.script.run.withSuccessHandler(ok).listarPedidos());render();});
  const montagemParcial=page.locator('#listaPedidos tbody tr td.cx-td-setor').nth(2);
  assert.match(await montagemParcial.locator('.score').textContent(),/%.*%/);assert.match(await montagemParcial.locator('.cx-score-legenda').textContent(),/Parcial/);
  assert.match(await montagemParcial.locator('.score').getAttribute('title'),/Faixa possível/);
  await page.locator('#listaPedidos tbody tr').click();await page.locator('.cxt:not([hidden]) .cxt-q').first().waitFor();
  assert.equal(await page.locator('.cxt-q-resp.sem').count(),1,'a resposta sem dado aparece');await page.getByRole('button',{name:'← Voltar',exact:true}).click();
  await page.screenshot({path:path.join(os.tmpdir(),`complexidade-score-parcial-${width}.png`)});
  await page.evaluate(async()=>{__contexto.cliente={complexidade:{reclamacao:false}};pedidos=await new Promise(ok=>google.script.run.withSuccessHandler(ok).listarPedidos());render();});
  await page.locator('#listaPedidos tbody tr').click();await page.locator('.cxt:not([hidden]) .cxt-q').first().waitFor();
  // nov/2026: tela de consulta com provas. Cada setor mostra as suas perguntas + os fatores gerais, sem nada para editar.
  assert.equal(await page.locator('.cxt-setor').count(),5);
  for(const s of ['personalizacao','pintura','montagem','triagem','carregamento']){await page.locator(`[data-cxt-setor="${s}"]`).click();const ids=await page.$$eval('[data-cxt-q]',l=>l.map(e=>+e.dataset.cxtQ));const esperado={personalizacao:[1,2,3,4],pintura:[11,12,13,14],montagem:[15,16,18],triagem:[19,20,21,22],carregamento:[23,24,26]}[s];assert.deepEqual(ids,[...esperado,5,6,7,9,10],s);}
  for(const sel of ['select','textarea','input','[data-cx-resposta]'])assert.equal(await page.locator('.cxt '+sel).count(),0,sel);
  assert.doesNotMatch(await page.locator('.cxt').textContent(),/Planejamento do pedido|Confirmação autorizada|Exibir também|Salvar/);
  assert.equal(await page.locator('.cxt-q-resp.sem').count(),0,'tudo automático');
  // provas: a pergunta escolhida mostra, à direita, de onde veio e os pontos
  await page.locator('[data-cxt-setor="montagem"]').click();await page.locator('[data-cxt-q="16"]').click();
  await page.waitForFunction(()=>/Cadastro do local/.test(document.querySelector('[data-cxt-provas]').textContent)&&/pontos/.test(document.querySelector('[data-cxt-provas]').textContent));
  assert.match(await page.locator('.cxt-conta').textContent(),/Somou \d+ de \d+ pontos/);
  if(width>1000)assert.ok(await page.evaluate(()=>document.querySelector('[data-cxt-provas]').getBoundingClientRect().left>document.querySelector('[data-cxt-perguntas]').getBoundingClientRect().right),'provas na coluna da direita');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sem rolagem lateral');
  await page.screenshot({path:path.join(os.tmpdir(),`complexidade-automatica-${width}.png`)});
  await page.getByRole('button',{name:'← Voltar',exact:true}).click();
  // A conta é refeita na tela com a regra atual, mesmo que o servidor devolva outra coisa
  await page.evaluate(async()=>{__contexto.caminhoes=9;pedidos=await new Promise(ok=>google.script.run.withSuccessHandler(ok).listarPedidos());render();});
  await page.locator('#listaPedidos tbody tr').click();await page.locator('.cxt:not([hidden]) .cxt-q').first().waitFor();await page.locator('[data-cxt-setor="montagem"]').click();await page.locator('[data-cxt-q="18"]').click();
  await page.waitForFunction(()=>/Caminhões escalados no carregamento\s*9/.test(document.querySelector('[data-cxt-provas]').textContent));
  await page.getByRole('button',{name:'← Voltar',exact:true}).click();
  assert.deepEqual(errors,[]);await page.close();console.log(`Complexidade ${width}px: fontes, exceções, gráficos e histórico congelado OK.`);
 }}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
