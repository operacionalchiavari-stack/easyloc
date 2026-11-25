const {chromium}=require('playwright'),express=require('express'),assert=require('node:assert/strict');
(async()=>{
 const app=express();app.use(express.static(process.cwd()));
 const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));}),base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-23T15:00:00Z'));
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base||u.pathname.includes('/js/core/'))return r.fulfill({contentType:'text/javascript',body:''});return r.continue();});
  await page.addInitScript(()=>{
   window.__CONTEXT={empresa_id:'empresa',usuario_id:'gestor'};window.aguardarContexto=async()=>window.__CONTEXT;window.chamadas=[];window.falharCheck=false;window.atrasarCheck=false;
   window.EasyLocPermissions={load:async()=>{},hasPermission:k=>!k.endsWith('.editar')||!localStorage.getItem('mov-somente-leitura')};
   window.alerta=msg=>{window.ultimoAviso=msg;};window.confirmarGlobal=async()=>true;
   const pessoas=[{id:'ana',nome:'Ana Souza',setor:'Montagem',cargo:'Montadora',data_admissao:'2026-11-20',ativo:true},{id:'bruno',nome:'Bruno Lima',setor:'Logística',cargo:'Motorista',ativo:false,ficha:{status:'desligado',desligamento_data:'2026-11-21'}},{id:'clara',nome:'Clara Dias',setor:'Comercial',cargo:'Vendedora',data_admissao:'2026-11-21',ativo:true},{id:'dora',nome:'Dora Gomes',setor:'Produção',data_admissao:'2020-01-01',ativo:true}];
   const checks=[{id:'admissao',funcionario_id:'ana',tipo:'admissao',itens:[{texto:'Documentos pessoais recebidos',feito:false},{texto:'Contrato assinado',feito:false},{texto:'Integração realizada',feito:true}]},{id:'desligamento',funcionario_id:'bruno',tipo:'desligamento',itens:[{texto:'Exame demissional',feito:false},{texto:'Devolução de EPI',feito:true}]},{id:'concluido',funcionario_id:'dora',tipo:'admissao',concluido_em:'2026-11-20T15:00:00Z',itens:[{texto:'Acesso configurado',feito:true}]}];
   window.supabaseClient={storage:{from:()=>({getPublicUrl:()=>({data:{}})})},rpc:async(n,a)=>{window.chamadas.push({n,a});return{data:n==='rh_pessoas'?pessoas:null};},from:t=>{
    let acao,dados;const filtros={};const q={select:()=>q,order:()=>q,range:()=>q,eq:(c,v)=>{filtros[c]=v;return q;},update:v=>{acao='update';dados=v;return q;},insert:v=>{acao='insert';dados=v;return q;},then:(ok,erro)=>(async()=>{
     if(acao){window.chamadas.push({n:acao+':'+t,dados,filtros});if(acao==='update'){
       await new Promise(r=>setTimeout(r,80));
       if(window.atrasarCheck){window.atrasarCheck=false;await new Promise(r=>setTimeout(r,300));}
       if(window.falharCheck){window.falharCheck=false;return{error:{message:'Falha simulada ao salvar'}};}
       Object.assign(checks.find(c=>c.id===filtros.id),dados);
      }else checks.unshift({...dados,id:'nova-clara'});
     }
     return{data:t==='rh_checklists'?JSON.parse(JSON.stringify(checks)):[]};
    })().then(ok,erro)};return q;
   }};
  });
  const url=base+'/Modulos/RH/Pessoas/pessoas.html?aba=movimentacoes';
  await page.goto(url);await page.waitForSelector('[data-check="admissao"]');
  const selecionada=()=>page.locator('[data-movimentacao][aria-pressed="true"]');
  assert.equal(await selecionada().getAttribute('data-movimentacao'),'check:admissao');
  assert.equal(await page.locator('#rhMovAcoes button:visible').count(),2);
  assert.ok(await page.locator('#rhFerramentas').isHidden(),'ações saíram da faixa acima do conteúdo');
  assert.ok(await page.evaluate(()=>{const t=document.querySelector('#rhMovPessoasTitulo').getBoundingClientRect();return [...document.querySelectorAll('#rhMovAcoes button')].every(b=>{const r=b.getBoundingClientRect();return r.top<t.bottom&&r.bottom>t.top;});}),'os dois botões na mesma linha de Pessoas');
  assert.ok(await page.evaluate(()=>{const a=document.querySelector('.rh-mov-lista').getBoundingClientRect(),b=document.querySelector('#rhMovChecklist').getBoundingClientRect();return a.right<b.left&&Math.abs(a.top-b.top)<2;}),'pessoas à esquerda e checklist à direita');
  assert.equal(await page.locator('#rhMovChecklist article').count(),1);
  const cores=await page.evaluate(()=>['.rh-mov-pessoa.admissao','.rh-mov-pessoa.desligamento'].map(s=>getComputedStyle(document.querySelector(s)).backgroundColor));assert.notEqual(cores[0],cores[1]);
  const item=i=>page.locator('#rhMovChecklist [data-i="'+i+'"]');
  await item(0).check();await page.waitForFunction(()=>document.querySelector('[data-check="admissao"][data-i="0"]').closest('li').classList.contains('feito'));
  assert.equal(await item(0).locator('..').locator('span').evaluate(el=>getComputedStyle(el).textDecorationLine),'none');
  assert.equal(await item(0).evaluate(el=>getComputedStyle(el.closest('li')).backgroundColor),'rgb(232, 246, 238)');
  assert.match(await selecionada().innerText(),/2 de 3 concluídos/);
  assert.equal(await page.evaluate(()=>chamadas.find(c=>c.n==='update:rh_checklists').filtros.empresa_id),'empresa');
  await item(0).uncheck();await page.waitForFunction(()=>!document.querySelector('[data-check="admissao"][data-i="0"]').closest('li').classList.contains('feito'));
  await page.click('[data-movimentacao="check:desligamento"]');assert.equal(await page.locator('[data-check="admissao"]').count(),0);
  await page.evaluate(()=>window.falharCheck=true);await item(0).check();
  await page.waitForFunction(()=>window.ultimoAviso==='Falha simulada ao salvar'&&!document.querySelector('[data-check="desligamento"][data-i="0"]').checked);
  await page.evaluate(()=>window.atrasarCheck=true);await item(0).check();
  assert.ok(await item(1).isDisabled(),'aguarda a gravação antes de editar outro item do mesmo checklist');
  await page.click('[data-movimentacao="check:admissao"]');
  await page.waitForFunction(()=>document.querySelector('[data-movimentacao="check:desligamento"]')?.textContent.includes('2 de 2 concluídos'));
  assert.equal(await selecionada().getAttribute('data-movimentacao'),'check:admissao','salvar não muda a pessoa selecionada');
  await page.click('[data-movimentacao="novo:clara"]');await page.click('[data-iniciar-check="clara"]');await page.waitForSelector('[data-check="nova-clara"]');
  assert.equal(await selecionada().getAttribute('data-movimentacao'),'check:nova-clara','iniciar mantém a pessoa selecionada');
  assert.match(await page.locator('#rhMovChecklist').innerText(),/Clara Dias/);
  await page.click('[data-movimentacao="check:desligamento"]');await page.click('[data-concluir-check="desligamento"]');
  await page.waitForFunction(()=>document.querySelector('#rhMovChecklist').textContent.includes('Concluído em'));
  assert.equal(await page.locator('[data-concluir-check]').count(),0);assert.equal(await page.locator('#rhMovChecklist input:not(:disabled)').count(),0);
  await page.click('[data-movimentacao="check:admissao"]');await item(0).check();await page.waitForFunction(()=>document.querySelector('[data-check="admissao"][data-i="0"]').closest('li').classList.contains('feito'));
  await page.reload();await page.waitForSelector('[data-check="admissao"]');
  await page.click('#rhMovAcoes [data-topo-acao="desligar-escolher"]');
  await page.waitForSelector('#rhModal[open]');assert.match(await page.locator('#rhModalTitulo').innerText(),/Registrar desligamento/);await page.locator('#rhModal [data-fechar]').click();
  // O mock é reiniciado no reload; a gravação foi conferida pelos payloads e pelas mudanças de seleção acima.
  await page.screenshot({path:'.tmp/rh-movimentacoes-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'sem alargar a página no celular');
  assert.ok(await page.evaluate(()=>document.querySelector('.rh-mov-lista').getBoundingClientRect().bottom<=document.querySelector('#rhMovChecklist').getBoundingClientRect().top),'colunas empilhadas no celular');
  await page.screenshot({path:'.tmp/rh-movimentacoes-mobile.png',fullPage:true});
  await page.evaluate(()=>localStorage.setItem('mov-somente-leitura','1'));await page.reload();await page.waitForSelector('[data-check="admissao"]');
  assert.equal(await page.locator('#rhMovChecklist input:not(:disabled)').count(),0);assert.equal(await page.locator('[data-concluir-check]').count(),0);
  assert.equal(await page.locator('#rhMovAcoes button:visible').count(),0,'ações continuam restritas a quem edita');
  await page.click('[data-movimentacao="check:desligamento"]');assert.match(await page.locator('#rhMovChecklist').innerText(),/Bruno Lima/);
  assert.deepEqual(errors,[]);console.log('OK - movimentações em duas colunas, cores por tipo, checklist verde sem risco, gravação, erro, seleção durante gravação, conclusão, leitura e celular');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
