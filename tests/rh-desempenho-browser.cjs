const {chromium}=require('playwright'),express=require('express'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const app=express();app.use(express.static(process.cwd()));const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));}),base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1580,height:1050}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base||u.pathname.includes('/js/core/'))return r.fulfill({contentType:'text/javascript',body:''});return r.continue();});
  const regras=[...fs.readFileSync('supabase/migrations/20261123000300_rh_avaliacao_desempenho.sql','utf8').matchAll(/\(p_empresa,'(automatica|rh)','([^']+)','([^']+)'\)/g)].map((m,i)=>({id:'r'+i,origem:m[1],chave:m[2],nome:m[3],pontos:0,ativa:true,versao:1,responsabilidade_modo:m[1]==='rh'?'origem':'setor',responsabilidade_setor:'Logística',responsabilidade_funcionario:null,responsabilidade_suplente:null,responsabilidade_pontua:false}));
  await page.addInitScript(regras=>{
   window.__CONTEXT={empresa_id:'empresa',usuario_id:'gestor'};window.aguardarContexto=async()=>window.__CONTEXT;sessionStorage.setItem('empresa_id','empresa');
   window.EasyLocPermissions={load:async()=>{},hasPermission:()=>!localStorage.getItem('somente-leitura')};window.chamadas=[];window.falhar=false;window.vinculado=false;window.google={maps:{places:{Autocomplete:class{addListener(){} unbindAll(){}}}}};
   const pessoas=[{id:'ana',nome:'Ana Souza',cargo:'Montadora',setor:'Montagem',ativo:true},{id:'bruno',nome:'Bruno Lima',cargo:'Motorista',setor:'Logística',ativo:true},{id:'dora',nome:'Dora Gomes',setor:'Estoque',ativo:false}];
   const config={periodo:'acumulado',teto:10,versao:1,responsabilidade_ativa:false,responsavel_geral:null,substituto_geral:null};
   const setores=[{chave:'logistica',setor:'Logística',responsavel_id:null,substituto_id:null,versao:1}];
   const parametros=()=>({config:{...config},regras:JSON.parse(JSON.stringify(regras)),setores:JSON.parse(JSON.stringify(setores)),pessoas});
   window.supabaseClient={storage:{from:()=>({getPublicUrl:()=>({data:{}})})},rpc:async(n,a)=>{
    window.chamadas.push({n,a});
    if(n==='rh_pessoas')return{data:pessoas};
    if(n==='rh_desempenho_contexto'){
     if(window.falhar)return{error:{message:'Conexão indisponível'}};
     return{data:{inicio:a.p_inicio,fim:a.p_fim||'2026-11-23',config,regras_com_pontos:window.neutro?0:2,pessoas:pessoas.map((p,i)=>({...p,nota:i===0?(window.vinculado?7.5:8.5):10,ganhos:i===0?1:0,descontos:i===0?2.5:0,quantidade:i===0?51:0,pendentes:0,evolucao:['2026-08-01','2026-09-01','2026-10-01','2026-11-01'].map((mes,j)=>({mes,nota:i===0?[10,9,7.5,8.5][j]:10}))})),sem_funcionario:window.vinculado?[]:[{id:'sem',nome:'Uniformização reprovada',data_ocorrencia:'2026-11-22',pontos:-1,elegivel:true,observacao:'Conferir responsável'}],sem_funcionario_total:window.vinculado?0:1}};
    }
    if(n==='rh_desempenho_detalhe'){
     if(window.atrasar){window.atrasar=false;await new Promise(r=>setTimeout(r,350));}
     return{data:{total:a.p_funcionario==='ana'?51:0,pagina:a.p_pagina,itens:a.p_funcionario==='ana'?(a.p_pagina?[{id:'mais',nome:'Registro antigo',data_ocorrencia:'2026-08-01',origem:'rh',pontos:-0.5,impacto:-0.5,estado:'aplicada',regra_versao:1}]:[{id:'e1',nome:'Atraso',data_ocorrencia:'2026-11-21',origem:'rh',pontos:-0.5,impacto:-0.5,estado:'aplicada',regra_versao:1,observacao:'<img src=x onerror="window.injetado=true">'},{id:'e2',nome:'Reconhecimento',data_ocorrencia:'2026-11-22',origem:'rh',pontos:1,impacto:1,estado:'aplicada',regra_versao:2},{id:'e3',nome:'Em investigação',data_ocorrencia:'2026-11-22',origem:'automatica',pontos:-2,impacto:0,estado:'em_apuracao',regra_versao:1}]):[]}};
    }
        if(n==='rh_desempenho_responsabilidades_ler')return{data:parametros()};
    if(n==='rh_desempenho_responsabilidades_salvar'){
     if(window.conflito)return{error:{message:'Uma regra mudou. Atualize a página antes de salvar.'}};
     a.p_regras.forEach(v=>Object.assign(regras.find(r=>r.id===v.id),v,{versao:v.versao+1}));a.p_setores.forEach(v=>Object.assign(setores.find(s=>s.chave===v.chave),v,{versao:v.versao+1}));Object.assign(config,a.p_config,{versao:config.versao+1,responsabilidade_ativa:true});return{data:parametros()};
    }
    return{data:[]};
   },from:t=>{const q={select:()=>q,eq:()=>q,order:()=>q,range:()=>q,single:()=>q,maybeSingle:()=>q,then:(ok,erro)=>Promise.resolve({data:t==='operacao_ocorrencias_regras'?null:t==='empresas'?{id:'empresa',nome:'Empresa teste'}:[]}).then(ok,erro)};return q;}};
  },regras);
  const url=base+'/Modulos/RH/Pessoas/pessoas.html?aba=desempenho';await page.goto(url);
  await page.locator('[data-avaliar="ana"]').waitFor();await page.locator('.rhd-historico table').waitFor();
  assert.match(await page.locator('[data-inicio]').locator('..').innerText(),/Histórico desde/i);
  assert.match(await page.locator('[data-detalhe]').innerText(),/8,5/);assert.equal(await page.locator('.rhd-periodo,.rhd-metricas,[data-detalhe]>.rhd-explica').count(),0);
  assert.equal(await page.locator('[data-avaliar]').count(),2);assert.ok(await page.locator('#rhFerramentas').isHidden());
  assert.equal(await page.locator('.rhd-historico img').count(),0);assert.equal(await page.evaluate(()=>window.injetado),undefined);
  assert.ok(await page.evaluate(()=>document.querySelector('.rhd-pessoas').getBoundingClientRect().right<document.querySelector('.rhd-detalhe').getBoundingClientRect().left));
  await page.click('[data-pagina="1"]');await page.getByText('Registro antigo',{exact:true}).waitFor();assert.match(await page.locator('.rhd-paginacao').innerText(),/Página 2 de 2/);
  await page.click('[data-avaliar="bruno"]');await page.getByText('Nenhuma ocorrência neste período do histórico.').waitFor();
  await page.locator('[data-busca]').fill('montagem');assert.equal(await page.locator('[data-avaliar]').count(),1);assert.match(await page.locator('[data-avaliar]').innerText(),/Ana/);
  await page.locator('[data-busca]').fill('');await page.selectOption('[data-setor]','Logística');assert.equal(await page.locator('[data-avaliar]').count(),1);await page.selectOption('[data-setor]','');
  await page.selectOption('[data-status]','todos');assert.equal(await page.locator('[data-avaliar]').count(),3);await page.selectOption('[data-status]','ativos');await page.click('[data-avaliar="ana"]');
  assert.equal(await page.locator('.rhd-sem-pessoa,[data-vincular]').count(),0,'sem fluxo de preenchimento manual');
  await page.locator('[data-inicio]').fill('2026-10-01');await page.locator('[data-fim]').fill('2026-11-20');await page.click('[data-atualizar]');await page.waitForFunction(()=>!document.querySelector('[data-atualizar]').disabled&&document.querySelector('.rhd-nota-total'));assert.ok(await page.evaluate(()=>chamadas.some(c=>c.n==='rh_desempenho_contexto'&&c.a.p_inicio==='2026-10-01'&&c.a.p_fim==='2026-11-20'&&!c.a.p_todos)));
  await page.screenshot({path:'.tmp/rh-desempenho-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.tmp/rh-desempenho-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.evaluate(()=>window.falhar=true);await page.click('[data-atualizar]');await page.getByText('Avaliações indisponíveis. Use Atualizar para tentar novamente.').waitFor();assert.equal(await page.locator('.rhd-nota').count(),0,'erro não apresenta notas fictícias');
  await page.evaluate(()=>{window.falhar=false;window.neutro=true;});await page.click('[data-atualizar]');await page.locator('.rhd-nota-total').waitFor();assert.equal(await page.locator('.rhd-aviso').count(),0);
  await page.evaluate(()=>{localStorage.setItem('somente-leitura','1');});await page.reload();await page.locator('.rhd-nota-total').waitFor();assert.equal(await page.locator('[data-vincular]').count(),0);
  // Exercita o painel real de parâmetros, com seus tempos e todos os tipos do catálogo.
  await page.evaluate(()=>localStorage.removeItem('somente-leitura'));await page.setViewportSize({width:1500,height:1000});
  await page.goto(base+'/Modulos/Configuracoes/Parametros/parametros.html?aba=ocorrencias');
  await page.locator('#pr-painel-ocorrencias .pd-acoes [type=submit]').waitFor().catch(async()=>{throw Error('Parâmetros: '+JSON.stringify(await page.evaluate(()=>({status:document.querySelector('#empresaParametrosStatus')?.textContent,abas:[...document.querySelectorAll('[aria-selected=true]')].map(e=>e.id),conteudo:document.querySelector('#pr-painel-ocorrencias')?.textContent.slice(0,400),chamadas:chamadas.map(c=>c.n),carregador:typeof carregarParametrosDesempenho})))+' | '+errors.join('; '));});
  assert.equal(await page.locator('[data-parametro-aba=ocorrencias]').getAttribute('aria-selected'),'true','acesso direto abre a aba dos pesos');
  assert.equal(await page.locator('[data-pd-id]').count(),47);assert.equal(await page.locator('[data-oc-tipo]').count(),39);assert.equal(await page.locator('[data-oc-tipo="sobra"]').count(),1);
  const atraso=page.locator('.pd-regra').filter({has:page.locator('b',{hasText:/^Atraso$/})}),reconhecimento=page.locator('.pd-regra').filter({has:page.locator('b',{hasText:/^Reconhecimento$/})});
  await page.click('.pd-acoes [type=submit]');assert.equal(await page.evaluate(()=>chamadas.filter(c=>c.n==='rh_desempenho_responsabilidades_salvar').length),0,'supervisor obrigatorio');
  await page.selectOption('[data-pd-geral]','bruno');await page.selectOption('[data-pd-substituto]','ana');
  await page.locator('.pd-setores summary').click();await page.selectOption('[data-pd-setor-responsavel]','ana');await page.selectOption('[data-pd-setor-substituto]','bruno');
  await atraso.locator('input[type=number]').fill('-0.75');await reconhecimento.locator('input[type=number]').fill('1.25');
  const uniforme=page.locator('.pd-regra').filter({has:page.locator('b',{hasText:/^Uniformiza\u00e7\u00e3o reprovada$/})});
  await uniforme.locator('[data-pd-destino]').selectOption(JSON.stringify(['fixo','bruno']));
  await page.click('.pd-acoes [type=submit]');await page.getByText('Par\u00e2metros salvos. Encaminhamento autom\u00e1tico ativo.').waitFor();
  assert.ok(await page.evaluate(()=>{const a=chamadas.find(c=>c.n==='rh_desempenho_responsabilidades_salvar')?.a;return a?.p_regras.length===3&&a.p_config.responsavel_geral==='bruno'&&a.p_config.substituto_geral==='ana'&&a.p_regras.some(r=>r.pontos===-0.75)&&a.p_regras.some(r=>r.pontos===1.25)&&a.p_regras.some(r=>r.responsabilidade_funcionario==='bruno')&&a.p_setores.some(s=>s.responsavel_id==='ana'&&s.substituto_id==='bruno');}));
  await page.locator('[data-pd-busca]').fill('uniformizacao');assert.equal(await page.locator('.pd-regra:visible').count(),1);await page.locator('[data-pd-busca]').fill('');
  await page.evaluate(()=>window.conflito=true);await atraso.locator('input[type=number]').fill('-1');await page.click('.pd-acoes [type=submit]');await page.getByText(/Não foi possível salvar: Uma regra mudou/).waitFor();
  await page.screenshot({path:'.tmp/rh-desempenho-parametros.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'.tmp/rh-responsabilidade-parametros-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('OK - avaliação: duas colunas, notas do servidor, filtros, histórico, paginação, vínculo, falha, leitura, celular e parâmetros com 47 regras');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
