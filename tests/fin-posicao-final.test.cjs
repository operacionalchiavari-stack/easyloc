const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const emp='10000000-0000-0000-0000-000000000001',outro='10000000-0000-0000-0000-000000000002',cli='20000000-0000-0000-0000-000000000001',pedido='30000000-0000-0000-0000-000000000001',item='40000000-0000-0000-0000-000000000001';
async function fixture(){
 const db=new PGlite();
 await db.exec(`create schema auth;create role anon;create role authenticated;
 create function auth.uid() returns uuid language sql as $$select '${emp}'::uuid$$;
 create function eh_membro_empresa(uuid) returns boolean language sql as $$select $1='${emp}'::uuid$$;
 create function funcionario_pode(uuid,uuid,text) returns boolean language sql as $$select $1='${emp}'::uuid and coalesce(current_setting('test.negar',true),'')<>'sim'$$;
 create table empresas(id uuid primary key);insert into empresas values('${emp}'),('${outro}');
 create table clientes_empresas(id uuid primary key,empresa_id uuid,nome_razao text);insert into clientes_empresas values('${cli}','${emp}','Decoradora Teste');
 create table separacoes_pedidos(id uuid primary key,empresa_id uuid,cliente_id uuid,cliente_nome text,numero_pedido text,local_nome text,data_evento date,valor_total numeric,status_comercial text,status text,observacoes jsonb);
 create table logistica_confirmacoes(id uuid primary key default gen_random_uuid(),empresa_id uuid,pedido_id uuid,etapa text,versao integer,itens jsonb);
 create table itens(id uuid primary key,empresa_id uuid,valor_reposicao numeric,foto_url text);
 insert into separacoes_pedidos values('${pedido}','${emp}','${cli}','Decoradora Teste','2233','Casa Encanto Azul','2026-10-24',1000,'orcamento','separado','{"itens_comerciais":[{"item_id":"${item}","valor_locacao":100,"valor_reposicao":500,"quantidade_solicitada":10}]}');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261018000100_financeiro.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261021002000_conta_cliente_creditos.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261024000600_fin_posicao_final.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261108000700_posicao_final_desconto.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261108000800_posicao_final_motivos.sql','utf8'));
 await db.exec(`insert into fin_posicao_motivos(id,empresa_id,nome) values('50000000-0000-0000-0000-000000000001','${emp}','Avaria anterior à locação')`);
 await db.exec(`update separacoes_pedidos set status_comercial='aprovado';
 insert into fin_receber(empresa_id,origem,pedido_id,pedido_numero,cliente_id,cliente_nome,componente,descricao,vencimento,valor)
 select '${emp}','pedido','${pedido}','2233','${cli}','Decoradora Teste','locacao','Locação do pedido #2233','2026-10-24',1000
 where not exists(select 1 from fin_receber where pedido_id='${pedido}');
 insert into logistica_confirmacoes(empresa_id,pedido_id,etapa,versao,itens) values('${emp}','${pedido}','entrega',1,'[{"chave":"linha|${item}","item_id":"${item}","nome":"Cadeira Tiffany","previsto":10,"entregue":8,"voltou_antes":2,"nao_entregue":2}]'),
 ('${emp}','${pedido}','coleta',1,'[{"chave":"linha|${item}","item_id":"${item}","nome":"Cadeira Tiffany","previsto":6,"coletado":5,"danificado":2,"nao_coletado":1,"ja_no_deposito":4}]');`);
 return db;
}
const base=async db=>(await db.query('select fin_posicao_final_base($1,$2) b',[emp,pedido])).rows[0].b;
const salvar=async(db,b,decisoes,confirmar=false)=>(await db.query('select fin_posicao_final_salvar($1,$2,$3,$4,$5,$6) b',[emp,pedido,b.fonte,b.salvo?.versao||0,JSON.stringify(decisoes),confirmar])).rows[0].b;
test('posição final: preços, decisões, concorrência, isolamento e lançamentos sem duplicação',async()=>{
 const db=await fixture();try{
  let b=await base(db);assert.equal(b.itens.length,3);
  assert.equal(b.itens.find(x=>x.tipo==='credito').valor,200); // só não entregue, não retorno antecipado
  assert.equal(b.itens.find(x=>x.tipo==='avaria').valor,1000);
  assert.equal(b.itens.find(x=>x.tipo==='desaparecido').valor,500); // quatro no depósito não são falta
  const decisoes=b.itens.map(x=>({chave:x.chave,decisao:x.tipo==='avaria'?'dispensar':'cobrar',justificativa:x.tipo==='avaria'?'Avaria anterior à locação':'',justificativa_id:x.tipo==='avaria'?'50000000-0000-0000-0000-000000000001':null}));
  await assert.rejects(salvar(db,b,decisoes.map(x=>({...x,justificativa:'',justificativa_id:null})),true),/motivo/);
  await assert.rejects(salvar(db,b,[],true),/Decida/);
  const antes=b;b=await salvar(db,b,decisoes);assert.equal(b.salvo.status,'rascunho');
  assert.equal((await db.query("select count(*)::int n from fin_pagar where origem='credito_cliente'")).rows[0].n,0);
  await assert.rejects(salvar(db,antes,decisoes),/mudou/);
  await db.exec("set test.negar='sim'");await assert.rejects(base(db),/permissão/);await assert.rejects(salvar(db,b,decisoes),/permissão/);await db.exec("set test.negar=''");
  await assert.rejects(db.query('select fin_posicao_final_base($1,$2)',[outro,pedido]),/permissão/);
  b=await salvar(db,b,decisoes,true);assert.equal(b.salvo.credito,200);assert.equal(b.salvo.cobranca,500);
  assert.equal(Number(b.credito_titulo.valor),200);assert.equal(b.titulos.find(t=>t.id===b.salvo.receber_id).valor,500);
  await assert.rejects(salvar(db,b,decisoes,true),/já foi confirmada/);
  assert.equal((await db.query("select count(*)::int n from fin_pagar where origem='credito_cliente'")).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int n from fin_receber where origem='manual'")).rows[0].n,1);
  assert.equal((await db.query("select has_table_privilege('authenticated','fin_posicoes_finais','INSERT') p")).rows[0].p,false);
 }finally{await db.close();}
});
test('posição final: fontes alteradas, preços ausentes e coleta pendente impedem fechamento',async()=>{
 const db=await fixture();try{
  let b=await base(db);const decidir=b=>b.itens.map(x=>({chave:x.chave,decisao:'cobrar'}));
  await db.exec(`update separacoes_pedidos set observacoes=jsonb_set(observacoes,'{itens_comerciais,0,valor_reposicao}','750')`);
  await assert.rejects(salvar(db,b,decidir(b),true),/preços mudaram/);
  await db.exec(`update separacoes_pedidos set observacoes=observacoes#-'{itens_comerciais,0,valor_locacao}'`);
  b=await base(db);await assert.rejects(salvar(db,b,decidir(b),true),/sem preço/);
  await db.exec(`update separacoes_pedidos set observacoes=jsonb_set(observacoes,'{itens_comerciais,0,valor_locacao}','100');delete from logistica_confirmacoes where etapa='coleta'`);
  b=await base(db);await assert.rejects(salvar(db,b,decidir(b),true),/Confirme a entrega e a coleta/);
  await db.exec(`update separacoes_pedidos set observacoes=jsonb_set(observacoes,'{pagamento_config}','{"descontoComercial":"100,00"}');`);
  b=await base(db);assert.equal(b.itens.find(x=>x.tipo==='credito').valor,180);
  await db.exec(`insert into itens values('${item}','${emp}',800,null);
   insert into logistica_confirmacoes(empresa_id,pedido_id,etapa,versao,itens) values('${emp}','${pedido}','coleta',2,'[{"chave":"linha|${item}","item_id":"${item}","nome":"Cadeira Tiffany","danificado":1,"nao_coletado":0}]');
   update separacoes_pedidos set observacoes=observacoes#-'{itens_comerciais,0,valor_reposicao}';`);
  b=await base(db);assert.equal(b.itens.find(x=>x.tipo==='avaria').valor,800);
 }finally{await db.close();}
});
module.exports={fixture,base,salvar,emp,pedido};

test('posição final: interface integrada, decisão, confirmação, pagamentos e celular',async()=>{
 const express=require('express'),{chromium}=require('playwright'),db=await fixture(),app=express();let server,browser;
 try{
  await db.exec(`insert into fin_contas(empresa_id,nome) values('${emp}','Conta teste');
   select fin_baixar('${emp}','receber',(select id from fin_receber limit 1),'2026-10-24',100,0,0,0,0,(select id from fin_contas limit 1),'PIX','Entrada');`);
  app.use(express.json());
  app.get('/__pf',(_req,res)=>res.send('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/Modulos/Financeiro/financeiro.css"><link rel="stylesheet" href="/Modulos/Financeiro/financeiro-posicao-final.css"></head><body style="margin:20px;background:#f3f5f6;font-family:Arial"><nav id="finAbas"><button data-aba="posicao">Posição final</button></nav><main id="finConteudo"></main><script src="/js/core/pedidoFluxo.js"></script><script src="/js/core/evidenciasOperacao.js"></script><script src="/Modulos/Financeiro/financeiro-posicao-final.js"></script></body></html>'));
  app.post('/__pf',async(req,res)=>{try{
   const {table,fn,args,action,fields,id}=req.body;let data;
   if(table==='separacoes_pedidos')data=(await db.query('select * from separacoes_pedidos where empresa_id=$1',[emp])).rows;
   else if(table==='fin_posicoes_finais')data=(await db.query('select * from fin_posicoes_finais where empresa_id=$1',[emp])).rows;
   else if(table==='fin_posicao_motivos'){
    if(action==='insert')await db.query('insert into fin_posicao_motivos(empresa_id,nome,ordem) values($1,$2,$3)',[emp,fields.nome,fields.ordem]);
    if(action==='update'){for(const campo of ['nome','ativo','ordem'])if(campo in fields)await db.query('update fin_posicao_motivos set '+campo+'=$1 where id=$2 and empresa_id=$3',[fields[campo],id,emp]);}
    data=(await db.query('select * from fin_posicao_motivos where empresa_id=$1 order by ordem,nome',[emp])).rows;
   }
   else if(table==='empresas')data=[{nome:'Chiavari Teste',logo_url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="60"><text x="5" y="40">Chiavari</text></svg>')}];
   else if(table==='logistica_evidencias')data=[{chave:'linha|'+item,etapa:'coleta',descricao:'danificado',path:'dano'},{chave:'linha|'+item,etapa:'coleta',descricao:'nao_encontrado',path:'falta'},{chave:'outro|item',etapa:'coleta',descricao:'danificado',path:'outra-foto'}];
   else if(fn==='pedido_fluxo_fila')data=(await db.query('select * from separacoes_pedidos where empresa_id=$1',[emp])).rows;
   else if(fn==='fin_posicao_final_base')data=(await db.query('select fin_posicao_final_base($1,$2) b',[args.p_empresa,args.p_pedido])).rows[0].b;
   else if(fn==='fin_posicao_final_salvar')data=(await db.query('select fin_posicao_final_salvar($1,$2,$3,$4,$5,$6) b',[args.p_empresa,args.p_pedido,args.p_fonte,args.p_versao,JSON.stringify(args.p_decisoes),args.p_confirmar])).rows[0].b;
   else throw new Error('Chamada inesperada');res.json({data,error:null});
  }catch(e){res.json({data:null,error:{message:e.message}});}});
  app.use(express.static(process.cwd()));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1906,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/__pf');
  await page.evaluate(async emp=>{
   const post=async body=>(await fetch('/__pf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
   const sb={storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="green"/></svg>')},error:null})})},rpc:(fn,args)=>post({fn,args}),from:table=>{const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,range:()=>q,then:fn=>post({table}).then(fn)};return q;}};
   const brl=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
   const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   window.ctx={S:{sb,emp,aba:'posicao'},rpc:async(fn,args)=>{const r=await post({fn,args});if(r.error)throw Error(r.error.message);return r.data;},brl,esc,dataBr:d=>d?new Date(d.slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—'};
   await FinanceiroPosicaoFinal.atualizarIndicador(sb,emp);
   await FinanceiroPosicaoFinal.render(ctx);
  },emp);
  const cadastro=await browser.newPage();await cadastro.goto('http://127.0.0.1:'+server.address().port+'/__pf');
  await cadastro.addScriptTag({url:'http://127.0.0.1:'+server.address().port+'/Modulos/Configuracoes/Parametros/parametros-motivos-cancelamento.js'});
  await cadastro.evaluate(async emp=>{
   window.supabaseClient={from:table=>{let action=null,fields=null,id=null;const q={select:()=>q,order:()=>q,eq:(k,v)=>{if(k==='id')id=v;return q;},insert:v=>{action='insert';fields=v;return q;},update:v=>{action='update';fields=v;return q;},then:fn=>fetch('/__pf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table,action,fields,id})}).then(r=>r.json()).then(fn)};return q;}};
   await carregarMotivosPosicaoFinal(document.getElementById('finConteudo'),emp);
  },emp);
  await cadastro.locator('.pr-posicao-motivos [name=nome]').fill('Acordo de cortesia');await cadastro.locator('.pr-posicao-motivos [data-novo] button').click();
  await cadastro.waitForFunction(()=>[...document.querySelectorAll('.pr-posicao-motivos [data-nome]')].some(x=>x.value==='Acordo de cortesia'));
  const novo=cadastro.locator('.pr-posicao-motivos li').filter({has:cadastro.locator('input[data-nome][value="Acordo de cortesia"]')});
  await novo.locator('[data-ativo]').uncheck();await cadastro.waitForFunction(()=>document.querySelector('.pr-posicao-motivos [role=status]').textContent.includes('aparece mais'));await cadastro.close();
  assert.equal(await page.locator('[data-cont=posicao]').innerText(),'1');assert.ok(await page.locator('[data-cont=posicao]').evaluate(el=>el.getBoundingClientRect().top<el.parentElement.getBoundingClientRect().top),'contador acima da aba');assert.ok(await page.locator('[data-aba=posicao]').evaluate(el=>el.classList.contains('fin-posicao-pendente')));assert.equal(await page.locator('[data-cont=posicao]').evaluate(el=>getComputedStyle(el).animationName),'finPosicaoPiscar');
  await page.locator('.pf-pedido').click();await page.getByRole('heading',{name:'Pedido #2233'}).waitFor();
  const avaria=page.locator('tr[data-linha]').filter({hasText:'Avaria encontrada no evento'}),falta=page.locator('tr[data-linha]').filter({hasText:'Não encontrado no evento'});
  assert.equal(await avaria.locator('.pf-evidencias-item img[alt=danificado]').count(),1);
  assert.equal(await avaria.locator('.pf-evidencias-item img[alt=nao_encontrado]').count(),0);
  assert.equal(await falta.locator('.pf-evidencias-item img[alt=nao_encontrado]').count(),1);
  assert.equal(await page.locator('.pf-evidencias-item img').count(),2,'evidencia de outro item nao aparece');
  const abasAntes=browser.contexts()[0].pages().length;
  await avaria.locator('.pf-evidencias-item a').click();await page.locator('dialog.pf-preview-evidencia[open] img').waitFor({state:'visible'});
  assert.equal(browser.contexts()[0].pages().length,abasAntes,'foto abre dentro do sistema');
  await page.keyboard.press('Escape');await page.locator('dialog.pf-preview-evidencia').waitFor({state:'detached'});
  await falta.locator('.pf-evidencias-item a').click();await page.getByRole('button',{name:'Fechar prévia',exact:true}).click();await page.locator('dialog.pf-preview-evidencia').waitFor({state:'detached'});assert.equal(await page.locator('dialog.pf-preview-evidencia').count(),0);

  assert.equal(await page.locator('#pfEvidencias').count(),0,'sem galeria separada');
  assert.equal(await page.locator('.pf-financeiro-unificado').count(),1);
  const financeiro=await page.locator('.pf-financeiro-unificado').innerText();
  assert.match(financeiro,/PIX/);assert.match(financeiro,/100,00/);assert.match(financeiro,/900,00/);
  const alturaPrincipal=(await avaria.boundingBox()).height;
  await avaria.getByRole('button',{name:'Não',exact:true}).click();await avaria.locator('xpath=following-sibling::tr[1]').locator('[data-justificativa]').selectOption('50000000-0000-0000-0000-000000000001');assert.ok(Math.abs((await avaria.boundingBox()).height-alturaPrincipal)<2,'motivo em linha independente sem alterar altura principal');assert.equal(await avaria.locator('xpath=following-sibling::tr[1]').locator('td').getAttribute('colspan'),'8');await falta.getByRole('button',{name:'Sim',exact:true}).click();
  const alturaAntesDesconto=(await falta.boundingBox()).height;
  await falta.locator('[data-desconto]').fill('10000');await page.locator('[data-motivo-desconto="'+await falta.getAttribute('data-linha')+'"]').fill('Acordo com a decoradora');
  assert.match(await falta.locator('[data-valor-cobrar]').innerText(),/400,00/);
  assert.ok(Math.abs((await falta.boundingBox()).height-alturaAntesDesconto)<2,'motivo do desconto nao altera linha principal');assert.equal(await page.locator('[data-motivo-desconto-linha="'+await falta.getAttribute('data-linha')+'"] td').getAttribute('colspan'),'8');
  for(const width of [1906,1280,900,390]){await page.setViewportSize({width,height:1000});assert.ok(await page.locator('.pf-ocorrencias').evaluate(t=>{const wrap=t.parentElement;return wrap.scrollWidth<=wrap.clientWidth+1;}),'ocorrencias sem rolagem lateral em '+width);}
  await page.setViewportSize({width:1906,height:1000});
  assert.match(await page.locator('.pf-resumo').innerText(),/1\.100,00/);
  await page.getByRole('button',{name:'Salvar análise'}).click();await page.waitForFunction(()=>document.querySelector('.pf-pedido').textContent.includes('Em análise'));
  const faltaSalva=page.locator('tr[data-linha]').filter({hasText:'N\u00e3o encontrado no evento'});
  assert.match(await faltaSalva.locator('[data-desconto]').inputValue(),/100,00/);
  await page.getByRole('button',{name:'Gerar documento'}).click();await page.locator('dialog.pf-documento-modal[open]').waitFor();
  let doc=page.frameLocator('dialog.pf-documento-modal iframe');await doc.getByRole('heading',{name:'Posi\u00e7\u00e3o final do evento'}).waitFor();
  assert.match(await doc.locator('body').innerText(),/Pr\u00e9via/);assert.equal(await doc.locator('.pfd-fotos img').count(),2);
  await page.locator('dialog.pf-documento-modal [data-fechar]').click();
  await page.screenshot({path:'.tmp/posicao-final-desktop.png',fullPage:true});
  // nov/2026: confirmar pergunta antes (janela global ou confirm do navegador)
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Confirmar posição final'}).click();
  const conf=page.getByRole('button',{name:'Confirmar',exact:true});if(await conf.isVisible().catch(()=>false))await conf.click();
  await page.locator('.pf-status.ok').waitFor();
  assert.ok(await page.locator('[data-cont=posicao]').isHidden());assert.ok(await page.locator('[data-aba=posicao]').evaluate(el=>!el.classList.contains('fin-posicao-pendente')));
  assert.match(await page.locator('.pf-resumo').innerText(),/1\.100,00/);assert.equal(await page.locator('[data-confirmar]').count(),0);
  await page.getByRole('button',{name:'Gerar documento'}).click();await page.locator('dialog.pf-documento-modal[open]').waitFor();
  doc=page.frameLocator('dialog.pf-documento-modal iframe');await doc.getByRole('heading',{name:'Posi\u00e7\u00e3o final do evento'}).waitFor();
  const documento=await doc.locator('body').innerText();assert.match(documento,/Confirmada em/);assert.match(documento,/Acordo com a decoradora/);assert.match(documento,/400,00/);assert.match(documento,/1\.100,00/);assert.equal(await doc.locator('.pfd-fotos img').count(),2);
  const html=await page.locator('dialog.pf-documento-modal iframe').getAttribute('srcdoc');
  const impressao=await browser.newPage();await impressao.setContent(html,{waitUntil:'networkidle'});
  const pdf=await impressao.pdf({preferCSSPageSize:true,printBackground:true});fs.writeFileSync('.tmp/posicao-final-resumo.pdf',pdf);
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),leitor=await pdfjs.getDocument({data:new Uint8Array(pdf),useSystemFonts:true}).promise;
  let texto='';for(let i=1;i<=leitor.numPages;i++)texto+=(await (await leitor.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ');
  assert.match(texto,/400,00/);assert.match(texto,/Acordo com a decoradora/);await leitor.destroy();await impressao.close();
  await page.locator('dialog.pf-documento-modal [data-fechar]').click();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.tmp/posicao-final-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await db.close();}
});


test('posicao final: desconto validado, persistido e lancado pelo valor liquido',async()=>{
 const db=await fixture();try{
  let b=await base(db);
  const decisoes=b.itens.map(x=>({chave:x.chave,decisao:x.tipo==='credito'?'credito':'cobrar',desconto:x.tipo==='avaria'?100:0,motivo_desconto:x.tipo==='avaria'?'Acordo com cliente':''}));
  for(const desconto of [-1,1001,0.001,'100']){const invalidos=decisoes.map(x=>({...x,...(x.chave.startsWith('avaria:')?{desconto}:{})}));await assert.rejects(salvar(db,b,invalidos,true),/Desconto|desconto/);}
  await assert.rejects(salvar(db,b,decisoes.map(x=>({...x,motivo_desconto:''})),true),/motivo do desconto/);
  b=await salvar(db,b,decisoes.map(x=>({...x,...(x.chave.startsWith('avaria:')?{desconto:1000}:{})})));assert.equal(b.salvo.cobranca,500);
  b=await salvar(db,b,decisoes);const avaria=b.salvo.itens.find(x=>x.tipo==='avaria');assert.equal(avaria.valor,1000);assert.equal(avaria.desconto,100);assert.equal(avaria.valor_cobrar,900);assert.equal(b.salvo.cobranca,1400);
  b=await salvar(db,b,decisoes,true);assert.equal(b.titulos.find(t=>t.id===b.salvo.receber_id).valor,1400);
  await assert.rejects(salvar(db,b,decisoes,true),/confirmada/);
 }finally{await db.close();}
});


test('motivos para nao cobrar: cadastro, validacao por empresa e historico preservado',async()=>{
 const db=await fixture();try{
  let b=await base(db);
  let decisoes=b.itens.map(x=>({chave:x.chave,decisao:x.tipo==='credito'?'credito':'dispensar',justificativa:'Texto livre nao cadastrado'}));
  await assert.rejects(salvar(db,b,decisoes),/Selecione um motivo/);
  await db.exec(`insert into fin_posicao_motivos(id,empresa_id,nome) values('50000000-0000-0000-0000-000000000002','${outro}','Motivo de outra empresa')`);
  await assert.rejects(salvar(db,b,decisoes.map(x=>({...x,justificativa_id:'50000000-0000-0000-0000-000000000002'}))),/Selecione um motivo/);
  decisoes=decisoes.map(x=>({...x,justificativa_id:x.decisao==='dispensar'?'50000000-0000-0000-0000-000000000001':null}));
  b=await salvar(db,b,decisoes);const avaria=b.salvo.itens.find(x=>x.tipo==='avaria');assert.equal(avaria.justificativa,'Avaria anterior \u00e0 loca\u00e7\u00e3o');
  await db.exec(`update fin_posicao_motivos set nome='Nome alterado',ativo=false where id='50000000-0000-0000-0000-000000000001'`);
  const repetidas=b.salvo.itens.map(x=>({chave:x.chave,decisao:x.decisao,justificativa:x.justificativa,justificativa_id:x.justificativa_id}));
  b=await salvar(db,b,repetidas);assert.equal(b.salvo.itens.find(x=>x.tipo==='avaria').justificativa,avaria.justificativa);
  await assert.rejects(salvar(db,b,repetidas.map(x=>({...x,justificativa:'Motivo adulterado'}))),/Selecione um motivo/);
  assert.equal((await db.query("select has_table_privilege('authenticated','fin_posicao_motivos','DELETE') p")).rows[0].p,false);
 }finally{await db.close();}
});
