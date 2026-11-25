const {chromium}=require('playwright'),express=require('express'),assert=require('node:assert/strict');
(async()=>{
 const app=express();app.use(express.static(process.cwd()));const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));}),base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1700,height:1000}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base||u.pathname.includes('/js/core/'))return r.fulfill({contentType:'text/javascript',body:''});return r.continue();});
  await page.addInitScript(()=>{
   sessionStorage.setItem('empresa_id','empresa');window.__CONTEXT={empresa_id:'empresa',usuario_id:'gestor'};window.aguardarContexto=async()=>window.__CONTEXT;
   window.EasyLocPermissions={load:async()=>{},hasPermission:()=>true};window.chamadas=[];
   const pessoas=[{id:'ana',nome:'Ana Souza',setor:'Montagem',cargo:'Montadora',ativo:true},{id:'bruno',nome:'Bruno Lima',setor:'Logística',cargo:'Motorista',ativo:true},{id:'clara',nome:'Clara Dias',setor:'Comercial',ativo:true},{id:'outra-ana',nome:'Ana Souza',setor:'Produção',ativo:true},{id:'dora',nome:'Dora Gomes',setor:'Estoque',ativo:false}].map(p=>({...p,empresa_id:'empresa'}));
   const ocorrencias=[{id:'a1',funcionario_id:'ana',funcionario_nome:'Ana Souza',setor:'Montagem',tipo:'Atraso',data_ocorrencia:'2026-10-10',observacao:'Trânsito'},{id:'a2',funcionario_id:'ana',funcionario_nome:'Ana Souza',setor:'Montagem',tipo:'Falta',data_ocorrencia:'2026-11-20',observacao:'Sem aviso'},{id:'b1',funcionario_id:'bruno',funcionario_nome:'Bruno Lima',setor:'Logística',tipo:'Atestado',data_ocorrencia:'2026-11-21',observacao:'Documento recebido'},{id:'d1',funcionario_id:'dora',funcionario_nome:'Dora Gomes',setor:'Estoque',tipo:'Atraso',data_ocorrencia:'2026-10-11'},{id:'legado',funcionario_id:null,funcionario_nome:'Ana Souza',setor:'Produção',tipo:'Falta',data_ocorrencia:'2026-11-10'},{id:'antigo',funcionario_id:null,funcionario_nome:'Jaime Dias',setor:'Triagem',tipo:'Falta',data_ocorrencia:'2026-10-09',observacao:'<img src=x onerror="window.injetado=true">'}].map(o=>({...o,empresa_id:'empresa',responsavel:'Lia',hora_ocorrencia:'08:10:00',registrado_em:'2026-11-22T12:00:00Z'}));
   window.supabaseClient={storage:{from:()=>({getPublicUrl:()=>({data:{}})})},rpc:async n=>({data:n==='rh_pessoas'?pessoas:[]}),from:t=>{
    let linhas=t==='funcionarios_acesso'?pessoas:t==='controle_rh_ocorrencias'?ocorrencias:[];
    const q={select:()=>q,eq:(c,v)=>{linhas=linhas.filter(l=>!(c in l)||l[c]===v);window.chamadas.push({t,c,v});return q;},order:()=>q,limit:()=>q,range:()=>q,then:(ok,erro)=>Promise.resolve({data:linhas}).then(ok,erro)};return q;
   }};
  });
  const url=base+'/Modulos/Chiavari/ControleRH/rh.html';await page.goto(url);
  await page.waitForFunction(()=>document.querySelectorAll('#tbody tr').length===6&&document.querySelector('[data-ocor-pessoa="id:clara"]'));
  assert.equal(await page.locator('[data-ocor-pessoa="id:ana"]').count(),1);
  assert.equal(await page.locator('[data-ocor-pessoa="id:outra-ana"]').count(),1,'homônimos em setores distintos');
  assert.equal(await page.locator('[data-ocor-pessoa="id:dora"]').count(),1,'histórico de funcionários inativos preservado');
  assert.match(await page.locator('[data-ocor-pessoa="id:dora"]').innerText(),/Somente no histórico/);
  assert.ok(await page.evaluate(()=>document.querySelector('.rh-ocorrencias-pessoas').getBoundingClientRect().right<document.querySelector('#rhOcorTabela').getBoundingClientRect().left));
  await page.click('[data-ocor-pessoa="id:ana"]');assert.equal(await page.locator('#tbody tr').count(),2);assert.match(await page.locator('#rhContagem').innerText(),/2 ocorrências/);
  await page.selectOption('#filtroTipo','Falta');assert.equal(await page.locator('#tbody tr').count(),1);
  await page.locator('#filtroMes').fill('2026-10');assert.equal(await page.locator('#tbody tr').count(),0);assert.ok(await page.locator('#rhOcorVazio').isVisible());
  await page.selectOption('#filtroTipo','');assert.equal(await page.locator('#tbody tr').count(),1);
  await page.locator('#filtroMes').fill('');await page.click('[data-ocor-pessoa="id:outra-ana"]');assert.equal(await page.locator('#tbody tr').count(),1);assert.match(await page.locator('#tbody').innerText(),/Produção/);
  await page.click('[data-ocor-pessoa="id:clara"]');assert.equal(await page.locator('#tbody tr').count(),0);assert.match(await page.locator('#rhOcorVazio').innerText(),/este funcionário/);
  await page.click('[data-ocor-pessoa="todos"]');await page.locator('#pesquisa').fill('transito');assert.equal(await page.locator('#tbody tr').count(),1,'pesquisa ignora acentos');
  await page.locator('#pesquisa').fill('');assert.equal(await page.locator('#tbody tr').count(),6);
  assert.equal(await page.evaluate(()=>window.injetado),undefined);assert.equal(await page.locator('#tbody img').count(),0,'observação permanece como texto');
  assert.equal(await page.locator('[onclick="PainelRH.abrir()"]').count(),0);
  assert.ok(await page.evaluate(()=>{const t=document.querySelector('#rhOcorPessoaTitulo').getBoundingClientRect(),p=document.querySelector('#pesquisa').getBoundingClientRect(),b=document.querySelector('#rhNovaOcorrencia').getBoundingClientRect();return t.right<p.left&&p.right<b.left&&t.top<p.bottom&&t.bottom>p.top&&t.top<b.bottom&&t.bottom>b.top;}),'título, pesquisa e registro na mesma linha');
  await page.click('#rhNovaOcorrencia');await page.waitForSelector('#modal',{state:'visible'});await page.click('#modal .btnCancelar');
  await page.screenshot({path:'.tmp/rh-ocorrencias-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'.tmp/rh-ocorrencias-mobile.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),JSON.stringify(await page.locator('.container,.topo,.filtros,.rh-ocorrencias-layout,#rhOcorTabela,.rh-ocorrencias-rolar').evaluateAll(es=>es.map(e=>({classe:e.className,id:e.id,largura:e.getBoundingClientRect().width,direita:e.getBoundingClientRect().right})))));
  await page.setViewportSize({width:1700,height:1000});await page.goto(base+'/Modulos/RH/Pessoas/pessoas.html?aba=controle');
  const quadro=page.frameLocator('iframe[title="Ocorrências"]');await quadro.locator('[data-ocor-pessoa="id:ana"]').waitFor();
  await quadro.locator('[data-ocor-pessoa="id:ana"]').click();assert.equal(await quadro.locator('#tbody tr').count(),2);
  assert.ok(await page.locator('#rhFerramentas').isHidden());
  await quadro.locator('#pesquisa').fill('falta');assert.equal(await quadro.locator('#tbody tr').count(),1);await quadro.locator('#pesquisa').fill('');
  await page.screenshot({path:'.tmp/rh-ocorrencias-gestao.png',fullPage:true});
  await quadro.locator('#rhNovaOcorrencia').click();await quadro.locator('#modal').waitFor({state:'visible'});await quadro.locator('#modal .btnCancelar').click();
  assert.equal(await quadro.locator('[onclick="PainelRH.abrir()"]').count(),0);
  assert.deepEqual(errors,[]);console.log('OK - ocorrências em duas colunas, pesquisa e registro no cabeçalho, filtros, homônimos, histórico antigo, funcionário sem ocorrência, integração com Gestão de Pessoas e celular');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
