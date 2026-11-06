const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const BASE='http://localhost:9914/';
(async()=>{const browser=await chromium.launch({channel:'msedge'});try{
 const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());if(!url.href.startsWith(BASE))return route.abort();
  if(url.pathname.endsWith('/cadastro-itens.html'))return route.fulfill({contentType:'text/html',body:'<p>Lista de itens</p>'});
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:fs.readFileSync('Modulos/Estoque/CadastroItens/item-detalhes.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'')});
  if(url.pathname.endsWith('/itens.3d.mjs'))return route.fulfill({contentType:'text/javascript',body:'export {};'});
  if(url.pathname.endsWith('/itens.patrimonios.mjs'))return route.fulfill({contentType:'text/javascript',body:'export function initPatrimonios(){}'});
  if(url.pathname.endsWith('/itens.foto.mjs'))return route.fulfill({contentType:'text/javascript',body:'window.itens_processarFoto=async()=>null;window.itens_salvarFotosAdicionais=async()=>true;export {};'});
  const file=path.join(process.cwd(),decodeURIComponent(url.pathname));if(!fs.existsSync(file))return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(file),contentType:{'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css'}[path.extname(file)]||'text/plain'});
 });
 async function preparar(query){
  await page.goto(BASE+query);
  for(const file of ['styles/design-system.css','Modulos/Estoque/CadastroItens/item-detalhes.css','styles/tema-chiavari.css'])await page.addStyleTag({content:fs.readFileSync(file,'utf8').replace(/@import[^;]+;/g,'')});
  await page.evaluate(()=>{
   window.__avisos=[];window.alerta=(texto,titulo,tipo)=>__avisos.push({texto,titulo,tipo});window.__falharDelete=false;window.__gravacoes=[];
   const item=(id,nome,tipo,custo=1)=>({id,produto:nome,descricao_total:nome,tipo,empresa_id:'e1',codigo:'REF-'+id,material:'Madeira',cor:'Castanho',largura:1,altura:1,profundidade:1,categoria:'Mesas',setor_estoque:'Estoque Geral',valor_locacao:custo*2,valor_reposicao:custo*10,custo,ativo:true});
   window.__db={itens:[{...item('kit1','Mesa Nice','Kit'),valor_locacao:99},item('a','Base Nice','Componente',10),item('b','Tampo Nice','Componente',20),item('c','Cadeira','Item',30)],kit_itens:[{kit_id:'kit1',item_id:'a',empresa_id:'e1',quantidade:1},{kit_id:'kit1',item_id:'b',empresa_id:'e1',quantidade:2}],usuarios_empresas:[{empresa_id:'e1',user_id:'u1'}]};
   window.__historicoErro=false;window.__histCalls=[];
   window.supabaseClient={rpc:async(nome,args)=>{
    __histCalls.push(args);if(__historicoErro)return {error:{code:'PGRST202',message:'schema cache'}};
    return {data:{item:{id:args.p_item,estoque_total:20},inclui_componentes:args.p_item==='kit1',registros:args.p_antes?[{id:1,tipo:'entrada_estoque',quantidade:3,variacao:3,saldo_antes:17,saldo_depois:20,origem:'cadastro_estoque',responsavel:'Estoque',registrado_em:'2026-10-01T12:00:00Z'},{id:0,tipo:'contagem_geral',quantidade:4,esperado:22,contado:4,diferenca:-18,origem:'inventario',registrado_em:'2026-10-01T11:00:00Z'},{id:-1,tipo:'saida_evento',quantidade:10,variacao:-10,origem:'carregamento',registrado_em:'2026-10-01T10:00:00Z'}]:[{id:2,tipo:'conferencia_retorno',quantidade:8,esperado:10,contado:8,diferenca:-2,item_nome:'Base Nice',pedido_numero:'5',origem:'retorno',responsavel:'Triagem',registrado_em:'2026-11-01T12:00:00Z',detalhes:{}}],proximo:args.p_antes?1:2,tem_mais:!args.p_antes}};
   },auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}})},from:t=>{
    let acao='select',valores,unico=false;const filtros=[];
    const q={select:()=>q,eq:(k,v)=>(filtros.push(r=>r[k]===v),q),neq:(k,v)=>(filtros.push(r=>r[k]!==v),q),in:(k,v)=>(filtros.push(r=>v.includes(r[k])),q),order:()=>q,range:()=>q,single:()=>{unico=true;return q;},update:v=>{acao='update';valores=v;return q;},insert:v=>{acao='insert';valores=v;return q;},upsert:v=>{acao='upsert';valores=v;return q;},delete:()=>{acao='delete';return q;},then:(ok,falha)=>{
     const tabela=__db[t]||[],selecionados=tabela.filter(r=>filtros.every(f=>f(r)));let resposta={data:unico?selecionados[0]:selecionados,error:null};
     if(acao!=='select'){
      if(acao==='delete'&&__falharDelete){__falharDelete=false;resposta={error:{message:'Falha simulada'}};}
      else {if(acao==='update')selecionados.forEach(r=>Object.assign(r,valores));if(acao==='insert')tabela.push(...(Array.isArray(valores)?valores:[valores]));if(acao==='upsert')for(const linha of valores){const atual=tabela.find(r=>r.kit_id===linha.kit_id&&r.item_id===linha.item_id);if(atual)Object.assign(atual,linha);else tabela.push({...linha});}if(acao==='delete')__db[t]=tabela.filter(r=>!selecionados.includes(r));__db[t]||=tabela;__gravacoes.push({t,acao,valores});sessionStorage.setItem('estadoSalvo',JSON.stringify(__db));}
     }
     return Promise.resolve(structuredClone(resposta)).then(ok,falha);
    }};return q;
   }};
  });
  await page.addScriptTag({type:'module',url:BASE+'Modulos/Estoque/CadastroItens/item-detalhes.mjs'});
  await page.waitForFunction(()=>{const p=new URLSearchParams(location.search);return p.get('id')?document.querySelector('#itensId').value===p.get('id')&&document.querySelector('#itemDetailTitle').textContent!=='Detalhes do Item':p.has('novo')&&document.querySelector('[data-item-tab=componentes]').hidden===false;});
 }
 await preparar('?id=kit1&tipo=Kit');
 assert.equal(await page.locator('#itemTipoKit.active').isVisible(),true);assert.equal(await page.locator('.item-tab:visible').count(),5);
 assert.equal(await page.locator('#itensValorLocacao').inputValue(),'99','abrir o kit preserva o valor cadastrado');
 assert.equal(await page.locator('[data-item-tab=kits]').isVisible(),false,'kit nao mostra aba de kits vinculados');
 await page.locator('[data-item-tab=historico]').click();await page.locator('#itemHistoricoLinhas tr').waitFor();
 assert.match(await page.locator('#itemHistoricoLinhas').innerText(),/2 faltante/);assert.match(await page.locator('#itemHistoricoLinhas').innerText(),/Pedido #5/);
 await page.locator('#itemHistoricoMais').click();await page.waitForFunction(()=>document.querySelectorAll('#itemHistoricoLinhas tr').length===4);
 const cores=await page.locator('#itemHistoricoLinhas .item-historico-quantidade').evaluateAll(els=>els.map(el=>getComputedStyle(el).color));
 assert.deepEqual(cores,['rgb(35, 132, 81)','rgb(35, 132, 81)','rgb(198, 57, 57)','rgb(198, 57, 57)'],'retorno e entrada verdes; contagem com falta e saida vermelhas, com tema global');
 assert.equal(await page.evaluate(()=>__histCalls[1].p_antes),2);await page.evaluate(()=>__historicoErro=true);await page.locator('#itemHistoricoAtualizar').click();await page.waitForFunction(()=>__avisos.some(a=>a.titulo==='Hist\u00f3rico'&&a.tipo==='erro'));assert.equal(await page.locator('#itemHistoricoAviso').innerText(),'');assert.equal(await page.locator('.item-historico-nota').count(),0);assert.equal(await page.locator('#itemHistoricoLinhas tr').count(),0,'banco pendente nao apresenta historico falso');await page.evaluate(()=>__historicoErro=false);
 await page.locator('[data-item-tab=componentes]').click();await page.locator('[data-componente=a]').waitFor();assert.equal(await page.locator('[data-componente]').count(),2);
 await page.locator('#btnSalvarItemDetalhes').click();await page.waitForFunction(()=>__avisos.some(a=>a.texto==='Kit salvo com sucesso.'));
 assert.equal(await page.evaluate(()=>__db.itens[0].tipo),'Kit');assert.equal(await page.evaluate(()=>__db.itens[0].valor_locacao),99);
 await page.locator('#kitDetalheBusca').fill('Cadeira');await page.locator('[data-adicionar=c]').click();await page.locator('[data-quantidade=b]').fill('3');await page.locator('[data-quantidade=b]').dispatchEvent('change');await page.locator('[data-remover=a]').click();
 await page.locator('#btnSalvarItemDetalhes').click();await page.waitForFunction(()=>__avisos.filter(a=>a.texto==='Kit salvo com sucesso.').length===2);
 assert.deepEqual(await page.evaluate(()=>__db.kit_itens.map(r=>[r.item_id,r.quantidade]).sort()),[['b',3],['c',1]]);
 await page.locator('#btnSalvarItemDetalhes').click();await page.waitForFunction(()=>__avisos.filter(a=>a.texto==='Kit salvo com sucesso.').length===3);assert.equal(await page.evaluate(()=>__db.kit_itens.length),2,'salvar novamente nao duplica componentes');
 await page.locator('#kitDetalheBusca').fill('Base');await page.locator('[data-adicionar=a]').click();await page.locator('[data-remover=b]').click();await page.evaluate(()=>__falharDelete=true);await page.locator('#btnSalvarItemDetalhes').click();await page.waitForFunction(()=>__avisos.some(a=>a.tipo==='erro'));
 assert.deepEqual(await page.evaluate(()=>__db.kit_itens.map(r=>[r.item_id,r.quantidade]).sort()),[['b',3],['c',1]],'falha restaura a composicao anterior');
 await page.locator('[data-item-tab=dados]').click();await page.screenshot({path:'.tmp/kit-detalhes-unificado.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('OK - kit usa a pagina de item, aba de componentes e historico, tipo e valores preservados, componentes editaveis, gravacao sem duplicacao e recuperacao em falha.');
 await preparar('?id=a');assert.equal(await page.locator('[data-item-tab=componentes]').isVisible(),false);assert.equal(await page.locator('.item-tab:visible').count(),5);await page.locator('#btnSalvarItemDetalhes').click();await page.waitForFunction(()=>__avisos.some(a=>a.texto==='Item salvo com sucesso.'));assert.equal(await page.evaluate(()=>__db.itens.find(i=>i.id==='a').tipo),'Componente');assert.equal(await page.evaluate(()=>__db.kit_itens.length),2);console.log('OK - pagina de item/componente conserva abas e salvamento originais.');
 await preparar('?novo=1&tipo=Kit');await page.locator('#itensProduto').fill('Kit novo');await page.locator('[data-item-tab=componentes]').click();await page.locator('#kitDetalheBusca').fill('Cadeira');await page.locator('[data-adicionar=c]').click();await page.locator('#btnSalvarItemDetalhes').click();await page.waitForURL('**/cadastro-itens.html').catch(async e=>{console.error('URL final:',page.url());console.error(await page.evaluate(()=>({avisos:window.__avisos,gravacoes:window.__gravacoes,tipo:document.querySelector('.tipo-btn.active')?.textContent,id:window.itemAtualId})));throw e;});const novo=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('estadoSalvo')));const novoKit=novo.itens.find(i=>i.produto==='Kit novo');assert.equal(novoKit.tipo,'Kit');assert.ok(novo.kit_itens.some(i=>i.kit_id===novoKit.id&&i.item_id==='c'));console.log('OK - criar kit usa a mesma pagina e retorna a lista depois de salvar.');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
