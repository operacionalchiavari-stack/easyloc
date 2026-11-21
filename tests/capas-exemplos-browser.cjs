const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE='http://localhost:5638/';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),erros=[];
  page.on('pageerror',e=>erros.push(e.message));
  await page.addInitScript(()=>{
   window.__CONTEXT={empresa_id:'empresa-exemplos',usuario_id:'usuario'};window.aguardarContexto=async()=>__CONTEXT;window.__chamadas=[];
   window.supabaseClient={rpc:async(n,a)=>{
    __chamadas.push({n,a});
    if(n==='capas_pode')return {data:false};
    if(n==='capas_estoque')return {data:[{id:'material-real',usa_capa:true,nome:'Capa Produto real',item_nome:'Produto real',unidades_por_capa:1,custo:10,estoque_conferido_em:'2026-11-16',saldo:{disponivel:7,em_pedidos:0,manutencao:0,ultima_fabricacao:null}}]};
    if(n==='capas_historico_listar')return {data:{movimentos:[],conferencias:[]}};
    if(n==='capas_perdas_equipe')return {data:[]};
    throw Error('Requisição não esperada: '+n);
   }};
  });
  await page.route('**/*',r=>{
   const u=r.request().url();
   if(/\/js\/core\/(supabase|context|permissions|moduleTheme|systemZoom|themePrepaint)\.js/.test(u))return r.fulfill({body:'',contentType:'text/javascript'});
   if(!u.startsWith(BASE))return r.abort();
   const f=path.join(process.cwd(),decodeURIComponent(new URL(u).pathname));
   if(!fs.existsSync(f)||!fs.statSync(f).isFile())return r.fulfill({status:404,body:''});
   return r.fulfill({body:fs.readFileSync(f),contentType:{'.css':'text/css','.html':'text/html','.js':'text/javascript'}[path.extname(f)]||'application/octet-stream'});
  });
  await page.goto(BASE+'Modulos/Estoque/CapasProtecao/capas.html');
  await page.waitForFunction(()=>document.querySelectorAll('#cpLista tr').length===6);
  assert.equal(await page.locator('#cpExemplos, #cpReiniciarExemplos, #cpModoExemplos').count(),0,'aviso e botões removidos');
  assert.deepEqual(await page.locator('[data-cp-aba]').allTextContents(),['Materiais','Histórico','Perdas da equipe']);
  assert.deepEqual(await page.evaluate(()=>__chamadas),[],'demonstração não consulta nem grava o estoque real');
  const linha=nome=>page.locator('#cpLista tr').filter({hasText:nome});
  const qtd=async(nome,i)=>Number((await linha(nome).locator('td').nth(i).innerText()).trim());
  assert.equal(await qtd('Capa Cadeira Chiavari',2),67);
  assert.match(await linha('Capa Poltrona').innerText(),/Não conferido/);
  await page.locator('#cpBusca').fill('taças');assert.equal(await page.locator('#cpLista tr').count(),1);await page.locator('#cpBusca').fill('');
  for(const width of [1500,1024,390]){
   await page.setViewportSize({width,height:1000});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'sem rolagem lateral da página em '+width);
   if(width===1500||width===390)await page.locator('.cp-page').screenshot({path:'.tmp/capas-exemplos-materiais-'+width+'.png'});
  }
  await page.setViewportSize({width:1500,height:1000});
  await page.locator('[data-cp-aba="historico"]').click();
  await page.waitForFunction(()=>document.getElementById('cpItemSelecionado').textContent==='Cadeira Chiavari');
  assert.match(await page.locator('#cpHistoricoConteudo').innerText(),/Fabricação.*Lote novo/s);
  assert.deepEqual(await page.locator('#cpHistoricoConteudo h3').allTextContents(),['Fabricações e movimentações','Conferências por pedido']);
  assert.equal(await page.locator('#cpHistoricoConteudo table').count(),2,'ambos os registros no mesmo histórico');
  await page.locator('#cpHistoricoPainel').screenshot({path:'.tmp/capas-historico-1500.png'});
  async function movimentar(tipo,q,observacao){
   await page.locator('#cpNovaMovimentacao').click();await page.locator('#cpDialogo [name=tipo]').selectOption(tipo);
   await page.locator('#cpDialogo [name=quantidade]').fill(String(q));await page.locator('#cpDialogo [name=observacao]').fill(observacao);
   await page.locator('#cpDialogo [type=submit]').click();await page.waitForFunction(()=>!document.getElementById('cpDialogo').open);
   await page.waitForFunction(obs=>document.getElementById('cpHistoricoConteudo').textContent.includes(obs)&&document.getElementById('cpStatus').textContent.includes('exemplo registrada'),observacao);
  }
  await movimentar('fabricacao',5,'Cinco capas produzidas no teste');
  assert.match(await page.locator('#cpStatus').innerText(),/exemplo registrada/);
  await page.locator('[data-cp-aba="capas"]').click();assert.equal(await qtd('Capa Cadeira Chiavari',2),72);
  await page.locator('[data-cp-aba="historico"]').click();await movimentar('manutencao',3,'Três capas enviadas para reparo');
  await page.locator('[data-cp-aba="capas"]').click();assert.equal(await qtd('Capa Cadeira Chiavari',2),69);assert.equal(await qtd('Capa Cadeira Chiavari',4),4);
  await page.locator('[data-cp-aba="historico"]').click();await movimentar('reparo',1,'Uma capa reparada e liberada');
  await page.locator('[data-cp-aba="capas"]').click();assert.equal(await qtd('Capa Cadeira Chiavari',2),70);
  await page.locator('[data-cp-aba="historico"]').click();
  assert.match(await page.locator('#cpHistoricoConteudo').innerText(),/Pedido 1801.*Triagem da ida.*Carregamento.*Descarregamento.*Triagem da volta/s);
  await page.locator('[data-modelo="exemplo-tacas"]').click();await page.getByRole('button',{name:'Registrar perda · Pedido 1803'}).click();
  await page.locator('#cpDialogo [name=quantidade]').fill('1');await page.locator('#cpDialogo [name=observacao]').fill('Uma caixa não devolvida no teste');
  await page.locator('#cpDialogo [type=submit]').click();await page.waitForFunction(()=>!document.getElementById('cpDialogo').open);
  await page.getByRole('button',{name:'Registrar perda · Pedido 1803'}).waitFor({state:'hidden'});
  await page.locator('[data-cp-aba="capas"]').click();assert.equal(await qtd('Caixa Taças de vidro',2),29);assert.equal(await qtd('Caixa Taças de vidro',3),0);
  await page.locator('[data-cp-aba="perdas"]').click();await page.waitForSelector('.cp-perdas-resumo');
  assert.match(await page.locator('#cpPerdasPainel').innerText(),/João Pereira.*Bruno Silva/s);
  assert.equal(await page.locator('[data-perdas-total]').innerText(),'4');
  assert.match(await page.locator('[data-perdas-valor]').innerText(),/182,50/);
  assert.equal(await page.locator('.cp-perdas-grafico svg').count(),2);
  assert.match(await page.locator('.cp-perdas-grafico').first().innerText(),/No evento\s*3\s*75%.*No galpão\s*1\s*25%/s);
  assert.match(await page.locator('.cp-perdas-grafico').nth(1).innerText(),/João Pereira.*60,83.*41%.*Bruno Silva.*60,83.*41%.*Lucas Alves.*28,33.*19%/s);
  assert.equal(await page.locator('.cp-perdas-pessoas tbody tr').count(),3);
  const dados=await page.locator('.cp-perdas-dados').boundingBox(),graficos=await page.locator('.cp-perdas-graficos').boundingBox();
  assert.ok(graficos.x>=dados.x+dados.width-1,'gráficos ficam à direita da coluna gerencial');
  const de=await page.locator('[data-perdas-de]').inputValue(),ate=await page.locator('[data-perdas-ate]').inputValue();
  await page.locator('[data-perdas-de]').fill(ate);await page.locator('[data-perdas-ate]').fill(de);await page.getByRole('button',{name:'Consultar',exact:true}).click();
  assert.match(await page.locator('.cp-perdas-erro').innerText(),/data inicial/);
  assert.equal(await page.locator('[data-perdas-total]').innerText(),'4','filtro inválido preserva resultados');
  await page.locator('[data-perdas-ate]').fill(ate);await page.getByRole('button',{name:'Consultar',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-perdas-total]')?.textContent==='0');
  assert.equal(await page.locator('.cp-perdas-vazio').count(),2,'gráficos vazios sem fatias artificiais');
  assert.equal(await page.locator('.cp-perdas-grafico circle[stroke-dasharray]').count(),0);
  assert.doesNotMatch(await page.locator('#cpPerdasPainel').innerHTML(),/NaN|Infinity/);
  await page.locator('[data-perdas-de]').fill(de);await page.getByRole('button',{name:'Consultar',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-perdas-total]')?.textContent==='4');
  for(const width of [1500,1024,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'perdas sem rolagem lateral da página em '+width);await page.locator('#cpPerdasPainel').screenshot({path:'.tmp/capas-exemplos-perdas-'+width+'.png'});}
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#cpLista tr').length===6);
  await page.locator('[data-cp-aba="capas"]').click();assert.equal(await qtd('Capa Cadeira Chiavari',2),67);assert.equal(await qtd('Caixa Taças de vidro',3),1);
  assert.deepEqual(await page.evaluate(()=>__chamadas),[],'movimentações e reinício continuam locais');
  await page.evaluate(()=>sessionStorage.setItem('capas_exemplos:empresa-exemplos','false'));await page.reload();await page.waitForSelector('#cpLista tr:has-text("Produto real")');
  assert.equal(await page.locator('#cpLista tr').count(),1);assert.equal(await qtd('Produto real',2),7);
  await page.locator('[data-cp-aba="historico"]').click();await page.locator('[data-modelo="material-real"]').click();assert.equal(await page.locator('#cpNovaMovimentacao').isVisible(),false,'dados reais respeitam a permissão de edição');
  await page.waitForFunction(()=>document.querySelectorAll('#cpHistoricoConteudo .cp-sem-registros').length===2);
  await page.locator('[data-cp-aba="perdas"]').click();await page.waitForSelector('.cp-perdas-resumo');
  assert.equal(await page.locator('[data-perdas-total]').innerText(),'0');
  assert.equal(await page.locator('.cp-perdas-vazio').count(),2);
  await page.reload();await page.waitForSelector('#cpLista tr:has-text("Produto real")');assert.equal(await page.locator('#cpModoExemplos').count(),0,'não reexibe controles nos dados reais');
  await page.evaluate(()=>sessionStorage.setItem('capas_exemplos:empresa-exemplos','true'));await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#cpLista tr').length===6);
  assert.equal(await page.evaluate(()=>__chamadas.some(c=>c.n==='material_movimentar')),false);
  assert.deepEqual(erros,[]);
  console.log('OK: histórico unificado, movimentações e conferências, painel gerencial com gráficos conciliados, filtros, estados vazios, celular e permissões.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
