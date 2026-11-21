const {chromium}=require('playwright'),express=require('express'),assert=require('node:assert/strict');
(async()=>{const app=express();app.use(express.static(process.cwd()));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const base='http://127.0.0.1:'+server.address().port;const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}});const erros=[];page.on('pageerror',e=>erros.push(e.message));
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base)return r.fulfill({body:'',contentType:'text/javascript'});if(u.pathname.includes('/js/core/')||u.pathname.includes('/js/empresa/')||/parametros(-empresa|-catalogo|-almoxarifado)?\.js$/.test(u.pathname))return r.fulfill({body:'',contentType:'text/javascript'});return r.continue();});
 await page.addInitScript(()=>{
  const config={dias:[1,2,3,4,5],inicio:'08:00',fim:'18:00',pausa_inicio:'12:00',pausa_fim:'13:00',feriados:[],antecedencia_horas:8,material_incompleto:false,exige_conferencia:true,responsaveis:{pintura:[],forracao:[],personalizacao:[]}};
  window.fixture={itens:[{id:'t1',pedido_id:'p1',origem:{quantidade:20,ambiente:'Salão',observacao:'Acabamento fosco',personalizacao_escolhas:{Tinta:{codigo:'AZ01',nome:'Azul',cartela:'Cores',fornecedor:'Fornecedor',cor:'#2244aa',foto_url:location.origin+'/slide2.jpg'}}},foto:location.origin+'/slide1.jpg',item_nome:'Cadeira Noir Madeira (L) 0.45 m (A) 0.90 m (P) 0.50 m',fotos:[{url:location.origin+'/slide3.jpg',slot:'galeria_01'}],renders:[{url:location.origin+'/Modulos/Comercial/Catalogo/app-icone-512.png'}],snapshot:{personalizacao:{tipo:'Pintura',vinculo_nome:'Cadeira Noir',observacoes:'Aplicar duas demãos'}},inicio_previsto:'2099-11-01T11:00:00Z',fim_previsto:'2099-11-03T20:00:00Z',pedido:{numero:'2150',cliente:'Decoradora Teste',evento:'2099-11-05',entrega:'2099-11-04',local:'Espaço Jardim',status:'pre_reserva'},etapas:[{id:'e1',ordem:1,grupo:1,nome:'Pintura final',setor:'pintura',horas:10,inicio_previsto:'2099-11-01T11:00:00Z',fim_previsto:'2099-11-03T20:00:00Z',estado:'pendente',materiais:[{id:'m1',nome:'Tinta Azul',produto_id:'TINTA',unidade:'L',necessario:5,recebido:0,devolvido:0}],pacotes:[]}]}],config,executar:true,almox:true,responsavel:{pintura:true,forracao:true,personalizacao:true}};
  window.calls=[];window.aguardarContexto=async()=>({empresa_id:'emp'});window.EasyLocQR={render:async el=>{el.textContent='QR DE TESTE';}};
  const segundo=structuredClone(window.fixture.itens[0]);Object.assign(segundo,{id:'t2',item_nome:'Poltrona Lis',foto:null,fotos:[],renders:[],origem:{quantidade:4,ambiente:'Lounge',personalizacao_escolhas:{}}});segundo.etapas=[{...segundo.etapas[0],id:'e2',nome:'Forrar',setor:'pintura',materiais:[],pacotes:[]}];window.fixture.itens.push(segundo);
  window.fixtureHist=[{id:'h1',etapa_id:'e1',acao:'separar',usuario_id:'u1',detalhes:{},created_at:'2099-10-30T12:00:00Z'}];
  const consulta=tabela=>{const q={select:()=>q,eq:()=>q,in:()=>q,then:ok=>Promise.resolve({data:tabela==='producao_historico'?window.fixtureHist:[{user_id:'u1',id:'u1',nome:'Responsável Teste'}],error:null}).then(ok)};return q;};
  window.supabaseClient={from:consulta,rpc:async(name,args)=>{window.calls.push({name,args});if(name==='producao_quadro')return {data:structuredClone(window.fixture),error:null};if(name==='producao_acao')window.fixture.itens[0].etapas[0].estado=args.p_acao==='iniciar'?'execucao':args.p_acao==='conferir'?'concluida':'conferencia';if(name==='producao_separar_modo'){window.fixture.itens[0].etapas[0].pacotes.push({id:'pack1',qr:'PROD:MAT:teste',estado:'separado',modo_separacao:args.p_modo,materiais:args.p_materiais});return {data:'pack1',error:null};}if(name==='producao_quantidade_salvar'){const e=window.fixture.itens[0].etapas[0];e.quantidade_feita=args.p_quantidade;e.estado=args.p_quantidade===20?'conferencia':'execucao';}if(name==='producao_receber_manual'){const e=window.fixture.itens[0].etapas[0],p=e.pacotes.find(p=>p.id===args.p_pacote);if(p.estado!=='recebido'){p.estado='recebido';e.materiais[0].recebido+=p.materiais[0].quantidade;}}if(name==='producao_receber'){window.fixture.itens[0].etapas[0].pacotes[0].estado='recebido';window.fixture.itens[0].etapas[0].materiais[0].recebido=5;}return {data:null,error:null};}};
  for(let i=0;i<18;i++){
    const item=structuredClone(window.fixture.itens[0]);item.id='item-'+i;item.pedido_id='pedido-'+i;item.pedido.numero=3000+i;item.pedido.cliente='Equipe '+i;
    item.etapas.forEach((e,k)=>e.id='etapa-'+i+'-'+k);window.fixture.itens.push(item);
  }
  window.EasyLocPermissions={load:async()=>{},_cache:{active:sessionStorage.getItem('ord-access')!=='none',permissions:new Map([['producao.ordens.visualizar',sessionStorage.getItem('ord-access')!=='none'],['estoque.almoxarifado.visualizar',!['op','none'].includes(sessionStorage.getItem('ord-access'))]])}};
  const original=window.supabaseClient.rpc;
  window.supabaseClient.rpc=async(name,args)=>name==='acervo_ordens'?{data:Array.from({length:28},(_,i)=>({id:'os-'+i,fonte:'sistema',numero:501+i,solicitante:'Jonatan Falck Nome Completo Muito Longo Para Esta Coluna',solicitante_foto:location.origin+'/slide1.jpg',item:'Cadeira de exemplo '+i,quantidade:2,setor:'Marcenaria',fluxo:['Marcenaria'],data:'2026-11-16T13:00:00Z',prazo:'2026-11-30',concluida:false})),error:null}:original(name,args);

 });

 await page.setViewportSize({width:1905,height:900});
 await page.goto(base+'/Modulos/Producao/ordens-painel.html');
 await page.waitForURL('**/ordens.html?painel_ordens=1');await page.locator('.producao-order-card').first().waitFor();
 assert.equal(await page.locator('iframe').count(),0);
 assert.equal(await page.locator('.ord-native-tabs a').count(),2);
 assert.equal(await page.locator('.producao-order-card').count(),19);
 await page.waitForFunction(()=>document.querySelector('[data-ord-tab=servico] .ord-native-badge').textContent==='28');
 const verificar=async()=>{
  const measure=await page.evaluate(()=>{
   const main=document.querySelector('main.producao-page')||document.querySelector('#telaTabela'),r=main.getBoundingClientRect();
   const scrolls=[...document.querySelectorAll('body *')].filter(e=>e.getClientRects().length&&['auto','scroll'].includes(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+2&&!e.closest('dialog,.modal')).map(e=>e.className);
   return {left:r.left,right:innerWidth-r.right,scrolls,overflow:document.documentElement.scrollWidth>innerWidth+1,height:document.documentElement.scrollHeight,viewport:innerHeight};
  });
  assert.ok(measure.left<=18&&measure.right<=30,JSON.stringify(measure));
  assert.deepEqual(measure.scrolls,[],'sem rolagem vertical dentro do conteudo');assert.equal(measure.overflow,false);
  assert.ok(measure.height>measure.viewport,'rolagem natural do documento');
 };
 await verificar();
 assert.ok(await page.locator('.ord-native-tabs').evaluate(e=>e.getBoundingClientRect().left)<=18,'abas alinhadas a esquerda');
 await page.screenshot({path:'.tmp/ordens-op-nativa.png'});
 await page.locator('#busca').fill('Equipe 1');assert.equal(await page.locator('.producao-order-card').count(),9);
 const href=await page.locator('.producao-order-card').first().getAttribute('href');assert.match(href,/painel_ordens=1/);
 await page.locator('.producao-order-card').first().click();await page.locator('.op-triagem-layout').waitFor();
 assert.equal(await page.locator('.ord-native-tabs').count(),1);assert.match(await page.locator('#voltarFila').getAttribute('href'),/painel_ordens=1/);
 await page.locator('#voltarFila').click();await page.locator('.producao-order-card').first().waitFor();assert.equal(await page.locator('#busca').inputValue(),'Equipe 1');
 await page.locator('[data-ord-tab=servico]').click();await page.locator('#tabela tr[data-id="os-0"]').waitFor();
 assert.equal(await page.locator('iframe').count(),0);assert.equal(await page.locator('#tabela tr[data-id]').count(),28);
 const pessoa=page.locator('#tabela tr[data-id="os-0"] .os-solicitante');assert.match(await pessoa.innerText(),/Jonatan Falck/);assert.equal(await pessoa.locator('img').count(),1);assert.equal(await pessoa.locator('strong').evaluate(e=>getComputedStyle(e).textOverflow),'ellipsis');assert.ok(await pessoa.evaluate(e=>e.getBoundingClientRect().right<=e.closest('td').getBoundingClientRect().right));
 assert.equal(await page.getByRole('button',{name:'+ Nova O.S',exact:true}).isVisible(),false);
 assert.equal(await page.locator('.ord-native-tabs a[aria-current=page]').getAttribute('data-ord-tab'),'servico');
 await verificar();await page.screenshot({path:'.tmp/ordens-os-nativa.png'});
 for(const width of [1366,390]){
  await page.setViewportSize({width,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'OS sem transbordar '+width);
  await page.locator('[data-ord-tab=producao]').click();await page.locator('.producao-order-card').first().waitFor();
  await verificar();await page.screenshot({path:'.tmp/ordens-op-nativa-'+width+'.png'});
  await page.locator('[data-ord-tab=servico]').click();await page.locator('#tabela tr[data-id="os-0"]').waitFor();
 }
 await page.evaluate(()=>sessionStorage.setItem('ord-access','op'));
 await page.goto(base+'/Modulos/Producao/ordens-painel.html?aba=servico');await page.waitForURL('**/ordens.html?painel_ordens=1');
 await page.locator('.producao-order-card').first().waitFor();assert.equal(await page.locator('[data-ord-tab=servico]').isVisible(),false);
 await page.evaluate(()=>sessionStorage.setItem('ord-access','none'));
 await page.goto(base+'/Modulos/Producao/ordens-painel.html');assert.match(await page.locator('#ordCarregando').innerText(),/Sem acesso/);
 assert.deepEqual(erros,[]);console.log('OK: OP/OS sem iframe interno, margens compactas, rolagem unica, abas/filtros/detalhes/permissoes preservados em 1905/1366/390.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1);});
