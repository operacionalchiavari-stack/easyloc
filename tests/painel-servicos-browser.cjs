const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE='http://painel-servicos.teste/';
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),erros=[];page.on('pageerror',e=>erros.push(e.message));
 await page.addInitScript(()=>{
  if(window===window.top){
   window.__calls=[];window.__falha=false;window.__editar=true;window.__confirmou=false;window.__listeners=[];
   window.__div={abertas:[
    {chave:'frete:f1',referencia:'f1',origem:'frete',tipo:'valor',nome:'Freteiro Teste',data:'2026-11-22',local:'Salão Azul',titulo:'Valor diferente do combinado',valor_previsto:100,valor_informado:150,registro:{explicacao:'Pedágio extra'}},
    {chave:'free:f2:valor',versao:'v1',origem:'free',tipo:'valor',nome:'Free Teste',data:'2026-11-22',local:'Salão Azul',titulo:'Diária com ajuste de valor',valor_previsto:200,valor_informado:250},
    {chave:'free:f3:entrada',versao:'v2',origem:'free',tipo:'presenca',nome:'Outro Free',data:'2026-11-21',titulo:'Entrada não registrada'},
    {chave:'uber:u1:horario',versao:'v3',origem:'uber',tipo:'horario',nome:'Motorista Teste',data:'2026-11-22',titulo:'Horários inconsistentes'}
   ],resolvidas:[]};
  }
  window.aguardarContexto=async()=>{if(window!==top&&top.__reterFretes)await new Promise(r=>top.__soltarFretes=r);return {empresa_id:'e1'};};
  window.EasyLocPermissions={load:async()=>{},hasPermission:k=>top.__editar||!k.endsWith('.editar')};
  window.PainelLogisticoDias={definirModulo(){}};window.PainelLogisticoEquipe={iniciar:async()=>{}};window.PainelLuisa={iniciar:async()=>{}};
  window.EntregasColetas={podeSelecionarOperacao:()=>true,definirOperacao(){},iniciar:async()=>{}};
  window.supabaseClient={channel(){return {on(evento,filtro,callback){top.__listeners.push({tabela:filtro.table,callback});return this;},subscribe(){return this;}};},rpc:async(n,a)=>{
   top.__calls.push({n,a});
   if(top.__falha&&n==='logistica_acompanhamento_lista')return {error:{message:'Falha ao consultar confirmações'}};
   if(n==='logistica_acompanhamento_lista'){
    const confirmado=a.p_tipo==='uber'||top.__confirmou;
    return {data:[{id:a.p_tipo+'1',data:'2026-11-22',hora:'09:00',pedido:'20',cliente:'Decoradora Teste',local:'Salão Azul',ponto_encontro:'Galpão',etapa:'Montagem',quantidade:1,publicado:confirmado,valor:a.p_tipo==='free'?200:80,status:confirmado?'ABERTA':'SEM_CONVITE',participantes:[{id:'p1',nome:a.p_tipo==='free'?'Free Escalado':'Motorista Confirmado',escalado:a.p_tipo==='free',status_app:confirmado?'confirmado':'nao_enviado',confirmado_em:confirmado?'2026-11-22T12:00:00Z':null}]},{id:a.p_tipo+'2',data:'2026-11-23',hora:'10:00',pedido:'21',cliente:'Outra Decoradora',local:'Salão Verde',quantidade:1,publicado:true,valor:100,status:'ABERTA',participantes:[{id:'p2',nome:'Pessoa Confirmada',status_app:'confirmado',confirmado_em:'2026-11-22T12:00:00Z'}]}]};
   }
   if(n==='logistica_divergencias_lista')return {data:structuredClone(top.__div)};
   if(n==='operacao_pessoas')return {data:[{id:'lider1',nome:'Ana Responsável',lider:true,free:false},{id:'func1',nome:'Bruno Interno',lider:false,free:false},{id:'free1',nome:'Carla Free',lider:false,free:true}]};
   if(n==='escala_equipes_fixas_listar')return {data:[{responsavel_id:'lider1',pessoa_tipo:'func',pessoa_id:'func1',ordem:0}]};
   if(n==='escala_equipes_fixas_salvar'||n==='escala_equipes_fixas_excluir')return {data:1};
   if(n==='escala_controle_pode')return {data:true};
   if(n==='logistica_anuncios_parametros')return {data:{anunciar_sem_confirmacao:false}};
   if(n==='logistica_divergencia_tratar'||n==='frete_div_resolver'){
    const key=n==='frete_div_resolver'?'frete:'+a.p_id:a.p_chave,item=top.__div.abertas.find(x=>x.chave===key);
    top.__div.abertas=top.__div.abertas.filter(x=>x!==item);top.__div.resolvidas.push({...item,motivo:a.p_motivo,tratado_por:'Supervisora',tratado_em:'2026-11-22T12:00:00Z'});return {data:structuredClone(top.__div)};
   }
   if(n==='frete_adm_lista')return {data:{freteiros:[{id:'cadastro',nome:'Cadastro que não aparece',status:'pendente'}],anuncios:[{id:'anuncio',pedido:'20',cliente:'Decoradora Teste',destino:'Salão Azul',data:'2026-11-22',direcao:'entrega',km:20,m3:5,valor:100,status_anuncio:'aberto'}]}};
   return {data:[]};
  },from(){const q={select:()=>q,eq:()=>q,order:()=>q,then:r=>r({data:[],error:null})};return q;}};
 });
 await page.route('**/*',r=>{
  if(!r.request().url().startsWith(BASE))return r.abort();const u=new URL(r.request().url()),p=decodeURIComponent(u.pathname);
  const permitido=/\/(painel-servicos|painel-modulos|freteiros|fretes-exemplos|escala-parametros|uber-parametros)\.js$/.test(p);
  if(/\.(js|mjs)$/.test(p)&&!permitido)return r.fulfill({contentType:'text/javascript',body:''});
  const f=path.join(process.cwd(),p);if(!fs.existsSync(f))return r.fulfill({status:404,body:''});
  return r.fulfill({body:fs.readFileSync(f),contentType:{'.js':'text/javascript','.html':'text/html','.css':'text/css'}[path.extname(f)]||'application/octet-stream'});
 });
 await page.goto(BASE+'Modulos/Logistica/PainelLogistico/painel-logistico.html');
 const aba=nome=>page.getByRole('tab',{name:nome,exact:true});
 assert.equal(await page.locator('#plModuloAbas #plTabParametros').count(),1,'Parâmetros junto das abas principais');
 assert.equal(await page.locator('#plModuloAbas [role=tab]').last().textContent(),'Luísa · IA','Luísa continua por último');
 assert.equal(await aba('Freteiros').count(),0);
 await page.evaluate(()=>__reterFretes=true);await aba('Fretes anunciados').click();
 const fretes=page.frameLocator('#plFretesFrame');await fretes.locator('#frConteudo').waitFor({state:'attached'});
 assert.equal(await fretes.locator('.header-list').count(),0,'título ausente antes do contexto e dos dados carregarem');
 assert.equal(await fretes.locator('.fr-abas').isVisible(),false,'abas internas ocultas desde o primeiro carregamento');
 await page.waitForFunction(()=>typeof __soltarFretes==='function');await page.evaluate(()=>{__reterFretes=false;__soltarFretes();});
 await fretes.locator('#frConteudo table').waitFor();assert.equal(await fretes.locator('.header-list').count(),0,'título duplicado removido');
 assert.equal(await fretes.locator('.fr-abas').isVisible(),false);assert.doesNotMatch(await fretes.locator('body').innerText(),/Cadastro que não aparece|Aprovar|Divergências/);
 assert.match(await fretes.locator('#frConteudo').innerText(),/Salão Azul/);
 assert.equal(await page.evaluate(()=>__calls.some(c=>c.n==='frete_div_lista')),false,'anúncios não carregam a antiga área de divergências');
 await aba('Free anunciados').click();await page.locator('#plModuloFree .pls-anuncio').first().waitFor();
 assert.equal(await page.locator('#plModuloFree .pls-anuncio').count(),2);
 assert.equal(await page.locator('#plModuloFree [data-confirmacao-app=nao_enviado]').isVisible(),true);
 assert.match(await page.locator('#plModuloFree').innerText(),/Free Escalado/);
 assert.match(await page.locator('#plModuloFree .pls-resumo').innerText(),/1 confirmaram no aplicativo/,'estar escalado não conta como aceite');
 await page.locator('#plModuloFree [data-vagas]').selectOption('pendentes');assert.equal(await page.locator('#plModuloFree .pls-anuncio').count(),1);
 await page.locator('#plModuloFree [data-vagas]').selectOption('nao_enviado');assert.equal(await page.locator('#plModuloFree .pls-anuncio').count(),1);
 await page.locator('#plModuloFree [data-busca]').fill('inexistente');assert.equal(await page.locator('#plModuloFree .pls-vazio').count(),1);await page.locator('#plModuloFree [data-busca]').fill('');
 await aba('Uber anunciados').click();await page.locator('#plModuloUber .pls-anuncio').first().waitFor();assert.equal(await page.locator('#plModuloFree').isVisible(),false);
 assert.match(await page.locator('#plModuloUber').innerText(),/Motorista Confirmado/);
 await page.evaluate(()=>__falha=true);await page.locator('#plModuloUber [data-atualizar]').click();await page.getByText('Falha ao consultar confirmações',{exact:true}).waitFor();assert.equal(await page.locator('#plModuloUber .pls-anuncio').count(),2,'erro preserva dados anteriores');await page.evaluate(()=>__falha=false);
 await aba('Free anunciados').click();await page.locator('#plModuloFree [data-vagas]').selectOption('');
 await page.evaluate(()=>{__confirmou=true;__listeners.find(x=>x.tabela==='free_inscricoes').callback();});
 await page.locator('#plModuloFree [data-anuncio=free1] [data-confirmacao-app=confirmado]').waitFor();
 assert.match(await page.locator('#plModuloFree .pls-resumo').innerText(),/2 confirmaram no aplicativo/,'aceite no app atualiza o painel');
 await page.locator('#plModuloFree [data-vagas]').selectOption('confirmadas');assert.equal(await page.locator('#plModuloFree .pls-anuncio').count(),2);
 await page.locator('#plModuloFree [data-vagas]').selectOption('');await page.evaluate(()=>__confirmou=false);await page.locator('#plModuloFree [data-atualizar]').click();await page.locator('#plModuloFree [data-confirmacao-app=nao_enviado]').waitFor();
 await aba('Divergências').click();await page.locator('.pls-div').first().waitFor();assert.equal(await page.locator('.pls-div').count(),4);
 assert.equal(await page.locator('#plTabDivergencias .pl-alerta-aba').textContent(),'4');
 const div=page.locator('#plModuloDivergencias');await div.locator('[data-origem]').selectOption('free');assert.equal(await div.locator('.pls-div').count(),2);
 await div.locator('[data-tipo]').selectOption('presenca');assert.equal(await div.locator('.pls-div').count(),1);
 await div.getByRole('button',{name:'Registrar tratamento',exact:true}).click();await page.locator('.pls-dialogo textarea').fill('Presença conferida com o responsável');await page.locator('.pls-dialogo button[type=submit]').click();await page.locator('.pls-dialogo').waitFor({state:'detached'});
 assert.equal(await page.locator('#plTabDivergencias .pl-alerta-aba').textContent(),'3');assert.equal(await div.locator('.pls-div').count(),0);
 await div.locator('[data-situacao]').selectOption('resolvidas');assert.match(await div.innerText(),/Presença conferida com o responsável/);assert.match(await div.innerText(),/Supervisora/);
 await div.locator('[data-origem]').selectOption('');await div.locator('[data-tipo]').selectOption('');await div.locator('[data-situacao]').selectOption('abertas');
 await div.locator('[data-divergencia="frete:f1"] button[data-acao=corrigir]').click();await page.locator('.pls-dialogo [name=valor]').fill('125.50');await page.locator('.pls-dialogo textarea').fill('Pedágio conferido');await page.locator('.pls-dialogo button[type=submit]').click();await page.locator('.pls-dialogo').waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>__calls.findLast(c=>c.n==='frete_div_resolver').a.p_valor),125.5);
 for(const width of [1440,1024,390]){
  await page.setViewportSize({width,height:1000});
  for(const nome of ['Fretes anunciados','Free anunciados','Uber anunciados','Divergências'])assert.equal(await aba(nome).isVisible(),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sem overflow em '+width);
  fs.mkdirSync('.tmp',{recursive:true});await page.screenshot({path:'.tmp/painel-divergencias-'+width+'.png'});
  await aba('Free anunciados').click();await page.locator('#plModuloFree .pls-anuncio').first().waitFor();await page.screenshot({path:'.tmp/painel-free-anuncios-'+width+'.png'});
  await aba('Parâmetros').click();await page.locator('[data-anuncios-datas]').waitFor();assert.equal(await page.locator('[data-anuncios-datas] select').inputValue(),'nao');
  const layout=page.locator('.escala-parametros-layout'),menu=layout.locator('[role=tablist]');
  const categoria=async nome=>{if(width<=800)await layout.locator('summary').click();await menu.getByRole('tab',{name:nome,exact:true}).click();};
  assert.deepEqual(await menu.locator('[role=tab]').allTextContents(),['Publicação dos anúncios','Equipes fixas','Restrições de equipe','Uber automático']);
  const colunaMenu=await layout.locator('aside').boundingBox(),colunaConteudo=await layout.locator('.escala-parametros-conteudo').boundingBox();
  if(width>800)assert.ok(colunaMenu.x+colunaMenu.width<colunaConteudo.x,'categorias à esquerda e conteúdo à direita');
  await page.locator('[data-anuncios-datas] select').selectOption('sim');
  await categoria('Equipes fixas');assert.match(await page.locator('[data-equipes-fixas]').innerText(),/Ana Responsável[\s\S]*Bruno Interno/);assert.equal(await page.locator('[data-equipes-fixas] [type=checkbox]').count(),0,'candidatos não ficam misturados com a equipe fixa');assert.equal(await page.locator('.equipe-fixa-responsavel button').count(),0,'responsável é fixo e não pode ser trocado');assert.ok(await page.locator('[data-equipes-fixas] .equipe-fixa-foto').count()>=2,'responsável e equipe têm fotos ou iniciais');await page.locator('[data-editar-equipe=lider1]').click();await page.locator('.equipe-fixa-modal').waitFor();assert.equal(await page.locator('.equipe-fixa-modal [data-candidato]:visible').count(),1);await page.locator('.equipe-fixa-modal [role=tab][data-tipo=free]').click();assert.equal(await page.locator('.equipe-fixa-modal [data-candidato]:visible').count(),1);await page.locator('.equipe-fixa-modal [data-fechar]').click();
  await categoria('Restrições de equipe');assert.equal(await page.locator('[data-restricao]').isVisible(),true);assert.equal(await page.locator('[data-anuncios-datas]').isVisible(),false);
  await categoria('Uber automático');assert.equal(await page.locator('[data-uber-automacao]').isVisible(),true);assert.equal(await page.locator('[data-restricao]').isVisible(),false);
  if(width>800){await menu.getByRole('tab',{name:'Uber automático',exact:true}).press('Home');assert.equal(await menu.getByRole('tab',{name:'Publicação dos anúncios',exact:true}).getAttribute('aria-selected'),'true');}
  else await categoria('Publicação dos anúncios');
  assert.equal(await page.locator('[data-anuncios-datas] select').inputValue(),'sim','trocar categoria preserva campos em edição');
  await page.locator('[data-anuncios-datas] select').selectOption('nao');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'parâmetros sem overflow em '+width);
  await page.screenshot({path:'.tmp/painel-parametros-anuncios-'+width+'.png'});
  await categoria('Uber automático');await page.screenshot({path:'.tmp/painel-parametros-uber-'+width+'.png'});await categoria('Publicação dos anúncios');await aba('Divergências').click();
 }
 await page.evaluate(()=>__editar=false);await aba('Free anunciados').click();await aba('Divergências').click();assert.equal(await div.locator('[data-tratar]').count(),0,'consulta sem botões de decisão');
 assert.deepEqual(erros,[]);console.log('OK: abas de anúncios, frete sem cadastros, Free/Uber com vagas e participantes, divergências dos três serviços, filtros, decisão e histórico, erros de consulta e permissões; desktop e celular. APIs simuladas.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
