const {chromium}=require('playwright'),express=require('express'),assert=require('node:assert/strict');
(async()=>{
 const app=express();app.use(express.static(process.cwd()));
 const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));}),base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1860,height:1000},timezoneId:'UTC'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-23T15:00:00Z'));
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base||u.pathname.includes('/js/core/')||u.pathname.includes('/js/ui/vozReuniao'))return r.fulfill({contentType:'text/javascript',body:''});return r.continue();});
  await page.addInitScript(()=>{
   window.__CONTEXT={empresa_id:'empresa',usuario_id:'gestor'};window.aguardarContexto=async()=>window.__CONTEXT;
   window.EasyLocPermissions={load:async()=>{},hasPermission:key=>key!=='rh.colaboradores.visualizar'||!localStorage.getItem('teste-sem-rh')};
   window.EasyLocCofre={preparar:()=>{},mudou:()=>false};window.alerta=()=>{};window.chamadas=[];
   const pessoas=[
    {id:'ana',nome:'Ana Souza',setor:'Montagem',cargo:'Montadora',data_admissao:'2023-03-12',ativo:true,tem_pin:true,gerenciado:true,acesso_sistema:false,dados_rh:{whatsapp:'(21) 99999-0000'},email:'ana@empresa.com',ficha:{tipo_contrato:'clt'},equipe_operacional:'montagem',lider_operacao:true},
    {id:'bruno',nome:'Bruno Lima',setor:'Logística',cargo:'Motorista',data_admissao:'2025-05-10',ativo:true,tem_pin:true,gerenciado:true,dados_rh:{whatsapp:'21988887777'},ficha:{tipo_contrato:'clt'}},
    {id:'clara',nome:'Clara Dias',setor:'Administrativo',cargo:'Analista',data_admissao:'2024-01-15',ativo:true,tem_pin:true,gerenciado:true,dados_rh:{whatsapp:'21977776666'},ficha:{tipo_contrato:'pj'}},
    {id:'dora',nome:'Dora Gomes',setor:'Montagem',cargo:'Ajudante',ativo:true,tem_pin:false,gerenciado:true,dados_rh:{},ficha:{tipo_contrato:'clt'}},
    {id:'eva',nome:'Eva Santos',setor:'Montagem',cargo:'Montadora',ativo:false,tem_pin:true,gerenciado:true,data_admissao:'2020-01-01',dados_rh:{},ficha:{status:'desligado',desligamento_data:'2022-03-01'}}
   ];
   const cfg={tipo:'semanal',dias:[1,2,3,4,5],carga_semanal:44,horarios:Object.fromEntries([1,2,3,4,5].map(d=>[d,{inicio:'08:00',fim:d===5?'17:00':'18:00',intervalo:60}]))};
   const regras=[{id:'setor',setor:'Montagem',vigencia:'2025-01-01',configuracao:cfg},{id:'individual',funcionario_id:'ana',vigencia:'2024-01-01',configuracao:{...cfg,dias:[1,2,3],horarios:{1:{inicio:'09:00',fim:'17:00',intervalo:60},2:{inicio:'09:00',fim:'17:00',intervalo:60},3:{inicio:'09:00',fim:'17:00',intervalo:60}}}}];
   const banco={
    rh_documentos:[{id:'treino',funcionario_id:'ana',nome:'NR-35',treinamento_id:'nr35',emissao:'2026-01-01',validade:'2027-01-01'}],
    rh_exames:[{id:'x',funcionario_id:'ana',nome:'ASO periódico',exame_cadastro_id:'aso',data_realizacao:'2025-11-22',validade:'2026-11-22'}],
    rh_exames_cadastro:[{id:'aso',nome:'ASO periódico',ativo:true,validade_meses:12,setores_obrigatorios:[]}],
    rh_treinamentos:[{id:'nr35',nome:'NR-35',ativo:true,setores_obrigatorios:['Montagem']}],
    rh_ferias:[{funcionario_id:'bruno',inicio:'2026-11-20',fim:'2026-11-30',status:'aprovada'}],
    rh_cadastro_opcoes:[{tipo:'setor',nome:'Montagem'},{tipo:'cargo',nome:'Montadora'}]
   };
   window.supabaseClient={
    storage:{from:()=>({getPublicUrl:()=>({data:{}})})},functions:{invoke:async()=>({data:{urls:[]}})},
    from:t=>{const q={select:()=>q,eq:()=>q,range:()=>q,order:()=>q,then:(ok,erro)=>{window.chamadas.push({n:'tabela',t});return Promise.resolve(localStorage.getItem('teste-falha-rh')&&t==='rh_documentos'?{error:{message:'Consulta indisponível'}}:{data:banco[t]||[]}).then(ok,erro);}};return q;},
    rpc:async(n,a)=>{window.chamadas.push({n,a});
     if(n==='funcionarios_listar'||n==='rh_pessoas')return {data:pessoas};
     if(n==='rh_escala_contexto')return {data:{regras,ausencias:[],dias:pessoas.filter(p=>p.ativo).map(p=>({funcionario_id:p.id,data:a.p_inicio,motivo:p.id==='bruno'?'Férias':null}))}};
     return {data:[]};
    }
   };
  });
  const url=base+'/Modulos/RH/CadastroFuncionarios/cadastro-funcionarios.html';
  await page.goto(url);
  const linha=id=>page.locator('[data-funcionario-id="'+id+'"]');
  await page.waitForFunction(()=>document.querySelector('[data-funcionario-id="ana"] [data-coluna="hoje"]')?.textContent.includes('Trabalho previsto'));
  assert.equal(await linha('ana').locator('td').count(),9);
  assert.match(await linha('ana').locator('[data-coluna="jornada"]').innerText(),/Seg a Qua.*09:00–17:00.*21 h\/sem/s,'regra individual prevalece sobre a do setor mais recente');
  assert.match(await linha('dora').locator('[data-coluna="jornada"]').innerText(),/44 h\/sem/);
  assert.match(await linha('ana').locator('[data-coluna="admissao"]').innerText(),/12\/03\/2023.*3 anos e 8 meses/s);
  assert.match(await linha('bruno').locator('[data-coluna="hoje"]').innerText(),/Férias.*Até 30\/11\/2026/s);
  assert.match(await linha('clara').locator('[data-coluna="hoje"]').innerText(),/Sem escala definida/);
  assert.match(await linha('clara').locator('[data-coluna="pendencias"]').innerText(),/Sem pendências/,'PJ sem ASO obrigatório');
  assert.match(await linha('eva').locator('[data-coluna="hoje"]').innerText(),/Inativo/);
  assert.match(await linha('eva').locator('[data-coluna="admissao"]').innerText(),/2 anos e 2 meses até o desligamento/);
  await linha('ana').locator('summary').click();
  assert.match(await linha('ana').locator('.func-pendencias ul').innerText(),/ASO periódico vencido em 22\/11\/2026/);
  assert.ok(await page.locator('#funcionarioFormCard').isHidden(),'detalhar pendências não abre o cadastro');
  assert.equal(await linha('ana').locator('a').getAttribute('href'),'https://wa.me/5521999990000');
  await page.route('https://wa.me/**',r=>r.fulfill({body:'WhatsApp simulado'}));
  const popup=page.waitForEvent('popup');await linha('ana').locator('a').click();await (await popup).close();
  assert.ok(await page.locator('#funcionarioFormCard').isHidden(),'atalho de contato não abre o cadastro');
  await linha('ana').locator('summary').click();
  await page.click('#funcColunasBtn');
  await page.locator('#funcColunasOpcoes [data-coluna="ultimo"]').check();
  await page.locator('#funcColunasOpcoes [data-coluna="vinculo"]').check();
  await page.locator('#funcColunasOpcoes [data-coluna="acesso"]').uncheck();
  await page.locator('#funcColunasDialog [value="concluir"]').click();
  assert.match(await linha('clara').locator('[data-coluna="vinculo"]').innerText(),/PJ/);
  assert.equal(await linha('ana').locator('[data-coluna="acesso"]').count(),0);
  await page.reload();await linha('ana').waitFor();assert.equal(await linha('ana').locator('[data-coluna="ultimo"]').count(),1);
  await page.click('#funcColunasBtn');await page.click('#funcColunasPadrao');await page.locator('#funcColunasDialog [value="concluir"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-funcionario-id="ana"] [data-coluna="hoje"]')?.textContent.includes('Trabalho previsto'));
  await page.screenshot({path:'.tmp/funcionarios-tabela-desktop.png',fullPage:true});
  await page.locator('#funcBusca').fill('ninguém');assert.equal(await page.locator('.empty-state').getAttribute('colspan'),'9');await page.locator('#funcBusca').fill('');
  await linha('ana').focus();await page.keyboard.press('Enter');await page.locator('#funcNome').waitFor({state:'visible'});assert.equal(await page.locator('#funcNome').inputValue(),'Ana Souza');await page.click('#closeFuncionarioForm');
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'rolagem horizontal contida na tabela');
  await page.locator('.table-wrap').evaluate(el=>el.scrollLeft=450);
  assert.ok(await linha('ana').locator('[data-coluna="pessoa"]').evaluate(el=>el.getBoundingClientRect().left>=0),'nome fixo durante rolagem');
  await page.locator('.table-wrap').evaluate(el=>el.scrollLeft=0);
  await page.screenshot({path:'.tmp/funcionarios-tabela-mobile.png',fullPage:true});
  await page.evaluate(()=>localStorage.setItem('teste-falha-rh','1'));await page.reload();
  await page.waitForFunction(()=>document.querySelector('[data-funcionario-id="clara"] [data-coluna="pendencias"]')?.textContent.includes('Consulta do RH incompleta'));
  assert.doesNotMatch(await linha('clara').locator('[data-coluna="pendencias"]').innerText(),/Sem pendências/,'falha de consulta não gera falso positivo');
  await page.evaluate(()=>{localStorage.removeItem('teste-falha-rh');localStorage.setItem('teste-sem-rh','1');});await page.reload();await linha('ana').waitFor();
  assert.equal(await linha('ana').locator('[data-coluna="hoje"]').count(),0);
  assert.equal(await page.evaluate(()=>chamadas.filter(c=>c.n==='rh_pessoas'||c.n==='rh_escala_contexto'||c.n==='tabela'&&c.t.startsWith('rh_')).length),0,'não consulta RH sem permissão');
  assert.match(await linha('ana').locator('[data-coluna="pendencias"]').innerText(),/Cadastro em dia/);
  await page.evaluate(()=>localStorage.removeItem('teste-sem-rh'));
  await page.setViewportSize({width:1860,height:1000});await page.goto(base+'/Modulos/RH/Pessoas/pessoas.html');
  await page.waitForSelector('#rhColunasFunc:not([hidden])');
  const quadro=page.frameLocator('iframe[title="Funcionários"]');await quadro.locator('[data-funcionario-id="ana"]').waitFor();
  await page.click('#rhColunasFunc');await quadro.locator('#funcColunasDialog[open]').waitFor();await quadro.locator('#funcColunasDialog [value="concluir"]').click();
  await page.screenshot({path:'.tmp/funcionarios-gestao-pessoas.png',fullPage:true});
  await page.click('[data-aba="folgas"]');assert.ok(await page.locator('#rhColunasFunc').isHidden());
  await page.click('[data-aba="cadastro"]');assert.ok(await page.locator('#rhColunasFunc').isVisible());
  await quadro.locator('[data-funcionario-id="ana"]').focus();await page.keyboard.press('Enter');await quadro.locator('#funcNome').waitFor({state:'visible'});await page.locator('#rhColunasFunc').waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);
  console.log('OK - tabela de funcionários: situação, jornada, pendências, contato, admissão, colunas persistidas, permissões, consulta incompleta, integração com RH e celular');
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
