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
  const decisoes=b.itens.map(x=>({chave:x.chave,decisao:x.tipo==='avaria'?'dispensar':'cobrar',justificativa:x.tipo==='avaria'?'Avaria já existia antes do evento':''}));
  await assert.rejects(salvar(db,b,decisoes.map(x=>({...x,justificativa:''})),true),/motivo/);
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
  app.get('/__pf',(_req,res)=>res.send('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/Modulos/Financeiro/financeiro.css"><link rel="stylesheet" href="/Modulos/Financeiro/financeiro-posicao-final.css"></head><body style="margin:20px;background:#f3f5f6;font-family:Arial"><main id="finConteudo"></main><script src="/js/core/pedidoFluxo.js"></script><script src="/Modulos/Financeiro/financeiro-posicao-final.js"></script></body></html>'));
  app.post('/__pf',async(req,res)=>{try{
   const {table,fn,args}=req.body;let data;
   if(table==='separacoes_pedidos')data=(await db.query('select * from separacoes_pedidos where empresa_id=$1',[emp])).rows;
   else if(table==='fin_posicoes_finais')data=(await db.query('select * from fin_posicoes_finais where empresa_id=$1',[emp])).rows;
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
   const sb={rpc:(fn,args)=>post({fn,args}),from:table=>{const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,range:()=>q,then:fn=>post({table}).then(fn)};return q;}};
   const brl=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
   const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   window.ctx={S:{sb,emp,aba:'posicao'},rpc:async(fn,args)=>{const r=await post({fn,args});if(r.error)throw Error(r.error.message);return r.data;},brl,esc,dataBr:d=>d?new Date(d.slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—'};
   await FinanceiroPosicaoFinal.render(ctx);
  },emp);
  await page.locator('.pf-pedido').click();await page.getByRole('heading',{name:'Pedido #2233'}).waitFor();
  const avaria=page.locator('tr[data-linha]').filter({hasText:'Avaria encontrada no evento'}),falta=page.locator('tr[data-linha]').filter({hasText:'Não encontrado no evento'});
  await avaria.locator('select').selectOption('dispensar');await avaria.locator('input').fill('Avaria anterior à locação');await falta.locator('select').selectOption('cobrar');
  assert.match(await page.locator('.pf-resumo').innerText(),/1\.200,00/);
  await page.getByRole('button',{name:'Salvar análise'}).click();await page.waitForFunction(()=>document.querySelector('.pf-pedido').textContent.includes('Em análise'));
  await page.screenshot({path:'.tmp/posicao-final-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Confirmar posição final'}).click();await page.locator('.pf-status.ok').waitFor();
  assert.match(await page.locator('.pf-resumo').innerText(),/1\.200,00/);assert.equal(await page.locator('[data-confirmar]').count(),0);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.tmp/posicao-final-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await db.close();}
});
