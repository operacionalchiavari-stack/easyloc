const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const raiz=path.resolve(__dirname,'..'),BASE='http://localhost:5637/';
function mock(){
 const hoje=new Date().toISOString().slice(0,10);window.__gravados=[];window.__capasWrites=[];window.__avisos=[];
 const banco={separacoes_pedidos:[{id:'p1',empresa_id:'e1',numero_pedido:'12',cliente_nome:'Cliente',local_nome:'Local',modo_separacao:'manual',status:'pendente',status_comercial:'aprovado',data_evento:hoje,data_entrega:hoje,operacao:{carregamento_caminhoes:[{id:'c1',codigo:'G'}]}}],
 separacoes_itens:[{id:'s1',empresa_id:'e1',separacao_pedido_id:'p1',item_id:'i1',item_nome:'Cadeira',quantidade_solicitada:5,quantidade_separada:5,itens:{id:'i1',produto:'Cadeira',tipo:'item'}},{id:'s2',empresa_id:'e1',separacao_pedido_id:'p1',item_id:'i2',item_nome:'Mesa',quantidade_solicitada:1,quantidade_separada:1,itens:{id:'i2',produto:'Mesa',tipo:'item'}}],
 itens:[{id:'i1',empresa_id:'e1',produto:'Cadeira',descricao_total:'Cadeira',tipo:'item'},{id:'i2',empresa_id:'e1',produto:'Mesa',descricao_total:'Mesa',tipo:'item'}],separacoes_etiquetas:[],separacoes_leituras:[],kit_itens:[],empresa_logistica_regras:[{empresa_id:'e1',descarregamento_conferencia:'quantidade'}]};
 window.__banco=banco;const modelos=[{id:'m1',item_id:'i1',nome:'Capa de cadeira',item_nome:'Cadeira',usa_capa:true,unidades_por_capa:2,estoque_conferido_em:null,saldo:{disponivel:0,manutencao:0,em_pedidos:0,ultima_fabricacao:null}}];
 function consulta(t){let rows=(banco[t]||[]).slice(),single=false,update=null;const q={select(){return q;},order(){return q;},limit(){return q;},ilike(){return q;},or(){return q;},eq(k,v){rows=rows.filter(r=>r[k]===undefined||String(r[k])===String(v));return q;},in(k,vs){rows=rows.filter(r=>r[k]===undefined||vs.includes(r[k]));return q;},single(){single=true;return q;},maybeSingle(){single=true;return q;},update(v){update=v;return q;},insert(v){window.__gravados.push({t,p:v});return q;},then(ok,no){if(update)rows.forEach(r=>Object.assign(r,update));return Promise.resolve({data:single?rows[0]||null:rows,error:null}).then(ok,no);}};return q;}
 const caps={};const paramEtapa=new URLSearchParams(location.search).get('etapa');const etapa=['carregamento','descarregamento','retorno'].includes(paramEtapa)?paramEtapa:'triagem';
 function lista(e){if(!caps[e])caps[e]=[{chave:'p1|i1',pedido_id:'p1',item_id:'i1',nome:'Cadeira',usa_capa:true,configurado:true,modelo_id:'m1',capacidade:2,pecas:5,esperado:e==='retorno'||e==='descarregamento'?2:3,enviadas:e==='retorno'||e==='descarregamento'?2:null,previsto_saida:3,quantidade:null,danificadas:0,observacao:'',versao:0,concluida:false},{chave:'p1|i2',pedido_id:'p1',item_id:'i2',nome:'Mesa',usa_capa:false,configurado:true,quantidade:null,danificadas:0}];return structuredClone(caps[e]);}
 window.supabaseClient={from:consulta,auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}})},rpc:async(n,args)=>{
  if(n==='operacao_conferencia_pecas')return {data:banco.separacoes_itens.map(i=>({chave:i.id+'|'+i.item_id,linha:i.id,item_id:i.item_id,nome:i.item_nome,esperado:i.quantidade_solicitada,pedido_id:'p1'})),error:null};
  if(n==='operacao_concluir_conferencia'&&args.p_quantidades){const itens=banco.separacoes_itens.map(i=>({chave:i.id+'|'+i.item_id,item_id:i.item_id,esperado:i.quantidade_solicitada,conferido:args.p_quantidades[i.id+'|'+i.item_id]}));const reg={concluido_em:new Date().toISOString(),itens,total:6,lidas:6,sem_etiquetas:true,faltando:[]};banco.separacoes_pedidos[0].operacao[args.p_etapa]=reg;for(const row of caps[args.p_etapa]||[])row.concluida=true;return {data:reg,error:null};}
  if(n==='capas_pode')return {data:true,error:null};
  if(n==='capas_estoque')return {data:structuredClone(modelos),error:null};
  if(n==='capas_configurar'){window.__capasWrites.push({n,args});Object.assign(modelos[0],{usa_capa:args.p_usa_capa,unidades_por_capa:args.p_capacidade});return {data:modelos[0],error:null};}
  if(n==='material_movimentar'){window.__capasWrites.push({n,args});modelos[0].estoque_conferido_em=new Date().toISOString();return {data:{},error:null};}
  if(n==='capas_historico_listar')return {data:{movimentos:[],conferencias:[],alteracoes:[]},error:null};
  if(n==='capas_pedido')return {data:lista(args.p_etapa),error:null};
  if(n==='capas_contagem_salvar'){window.__capasWrites.push({n,args});lista(args.p_etapa);for(const x of args.p_contagens){const r=caps[args.p_etapa].find(r=>r.chave===x.chave);Object.assign(r,x,{versao:r.versao+1});}return {data:lista(args.p_etapa),error:null};}
  const r=await window.__rpcOperacao(banco,n,args);
  if(n==='operacao_concluir_conferencia'||n==='operacao_concluir_com_pendencia')for(const row of caps[args.p_etapa]||[])row.concluida=true;
  return r;
 }};
 if(etapa!=='triagem'){banco.separacoes_pedidos[0].status='separado';if(etapa!=='carregamento')banco.separacoes_pedidos[0].operacao.carregamento={concluido_em:new Date().toISOString(),itens:[{chave:'s1|i1',item_id:'i1',conferido:5},{chave:'s2|i2',item_id:'i2',conferido:1}]};}
 
 if(new URLSearchParams(location.search).has('qr')){banco.separacoes_pedidos[0].modo_separacao='qr';banco.separacoes_etiquetas=Array.from({length:6},(_,i)=>({id:'e'+i,empresa_id:'e1',separacao_pedido_id:'p1',separacao_item_id:i<5?'s1':'s2',item_id:i<5?'i1':'i2',codigo:'12-00'+(i+1)}));}
 window.__CONTEXT={empresa_id:'e1',usuario_id:'u1',usuario_nome:'Operador'};window.aguardarContexto=async()=>window.__CONTEXT;window.hasPermission=()=>true;window.EasyLocPermissions={can:()=>true,hasPermission:()=>true,load:async()=>{}};window.lucide={createIcons(){}};window.alerta=(m)=>window.__avisos.push(m);window.confirmarGlobal=async()=>true;window.supabase={createClient:()=>window.supabaseClient};
}
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const width of [390,1360]){
  const page=await browser.newPage({viewport:{width,height:980}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
  await page.addInitScript({content:'window.__rpcOperacao='+require('./operacao-rpc-fixture.cjs').toString()+';('+mock.toString()+')();'});
  await page.route('**/*',r=>{const u=r.request().url();if(/\/js\/core\/(supabase|context|permissions|companyTheme|alerta)\.js/.test(u))return r.fulfill({body:''});if(!u.startsWith(BASE))return r.fulfill({body:''});const f=path.join(raiz,decodeURIComponent(new URL(u).pathname));if(!fs.existsSync(f))return r.fulfill({status:404,body:''});return r.fulfill({body:fs.readFileSync(f),contentType:{'.css':'text/css','.html':'text/html'}[path.extname(f)]||'text/javascript'});});
  await page.goto(BASE+'Modulos/Estoque/SeparacaoMateriais/separacao-materiais.html?pedido=p1&etapa=ida');
  await page.locator('#separacaoManualItens [data-capas-campo=quantidade]').waitFor({timeout:10000}).catch(async e=>{console.error({triagem:true,erros,avisos:await page.evaluate(()=>__avisos),texto:(await page.locator('body').innerText()).slice(0,1600)});throw e;});
  await page.locator('#separacaoManualItens [data-capas-campo=quantidade]').fill('2');await page.locator('#separacaoManualItens .manual-qty-input').first().click();
  await page.waitForFunction(()=>__capasWrites.some(x=>x.n==='capas_contagem_salvar'));
  assert.equal((await page.evaluate(()=>__capasWrites.find(x=>x.n==='capas_contagem_salvar'))).args.p_etapa,'triagem');
  assert.equal(await page.locator('#separacaoManualItens [data-capas-campo=quantidade]').inputValue(),'2');await page.screenshot({path:path.join(os.tmpdir(),`capas-triagem-${width}.png`)});
  await page.goto(BASE+'Modulos/Logistica/Conferencia/conferencia.html?pedido=p1&etapa=carregamento&qr=1');
  await page.locator('#cfItens .cf-item-capa [data-capas-campo=quantidade]').waitFor();
  await page.locator('#cfEntrada').fill('ACERVO:ENV:12-001');await page.locator('#cfEntrada').press('Enter');await page.waitForFunction(()=>document.getElementById('cfContagem').textContent.startsWith('1 de'));
  assert.equal(await page.locator('#cfItens .cf-item-capa [data-capas-campo=quantidade]').inputValue(),'');
  await page.locator('#cfItens .cf-item-capa [data-capas-campo=quantidade]').fill('2');await page.locator('#cfEntrada').click();await page.waitForFunction(()=>__capasWrites.some(x=>x.n==='capas_contagem_salvar'));assert.equal((await page.evaluate(()=>__capasWrites.find(x=>x.n==='capas_contagem_salvar'))).args.p_contagens[0].quantidade,2);
  for(const etapa of ['carregamento','descarregamento','retorno']){
   await page.goto(BASE+'Modulos/Logistica/Conferencia/conferencia.html?pedido=p1&etapa='+etapa);await page.locator('#cfQtd .cp-cell input[data-capas-campo=quantidade]').waitFor({timeout:10000}).catch(async e=>{console.error({etapa,width,erros,conteudo:(await page.locator('body').innerText()).slice(0,1800)});throw e;});
   assert.equal(await page.locator('#cfQtd .cp-sem').textContent().then(t=>t.includes('Sem material')),true);
   await page.locator('#cfQtd .cf-qtd-input').nth(0).fill('5');await page.locator('#cfQtd .cf-qtd-input').nth(1).fill('1');
   if(etapa==='retorno')assert.doesNotMatch(await page.locator('#cfQtd [data-capas-resumo]').textContent(),/Saíram|Previstas/);
   await page.locator('#cfQtd [data-capas-campo=quantidade]').fill(etapa==='carregamento'?'2':'1');
   if(etapa==='retorno'){await page.locator('#cfQtd .cp-cell summary').click();await page.locator('#cfQtd [data-capas-campo=danificadas]').fill('1');}
   await page.locator('#cfQtdConfirmar').click();
   if(etapa==='carregamento'){await page.locator('dialog.cf-escolha-caminhao[open]').waitFor();await page.locator('dialog.cf-escolha-caminhao input[value=c1]').check();await page.locator('dialog.cf-escolha-caminhao [data-ok]').click();}
   if(etapa!=='carregamento')await page.locator('dialog.cf-confirmacao[open] [type=submit]').click(); // nov/2026: o carregamento conclui na escolha do caminhão
   await page.waitForFunction(()=>!document.getElementById('cfQtdConfirmar'));
   assert.equal(await page.locator('#cfQtd [data-capas-campo=quantidade]').isDisabled(),true);
   const gravado=await page.evaluate(()=>__capasWrites.find(x=>x.n==='capas_contagem_salvar'));assert.equal(gravado.args.p_etapa,etapa);assert.equal(gravado.args.p_contagens[0].quantidade,etapa==='carregamento'?2:1);
   if(etapa==='retorno')assert.match(await page.locator('#cfQtd [data-capas-resumo]').textContent(),/Sairam 2.*1 nao devolvido.*1 danificado/);
   await page.screenshot({path:path.join(os.tmpdir(),`capas-${etapa}-${width}.png`)});
  }
  await page.goto(BASE+'Modulos/Estoque/CapasProtecao/capas.html');await page.locator('[data-cp-aba="fabricacoes"]').click();await page.locator('[data-modelo="m1"]').click();await page.locator('#cpNovaMovimentacao').click();await page.locator('[name=tipo]').selectOption('inventario');await page.locator('[name=quantidade]').fill('20');await page.locator('[name=observacao]').fill('Contagem fisica inicial no galpao');await page.locator('#cpDialogo [type=submit]').click();await page.waitForFunction(()=>!document.getElementById('cpDialogo').open);
  assert.equal((await page.evaluate(()=>__capasWrites.find(x=>x.n==='material_movimentar'))).args.p_quantidade,20);
  assert.deepEqual(erros,[]);await page.close();console.log(`Capas ${width}px: contagem na ida e volta, ausência na saída, danos, configuração e estoque OK.`);
 }
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
