const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('finalização informa nomes, códigos e quantidades reais e mantém as proteções anteriores',async()=>{
 const db=new PGlite();try{
  await db.exec(`create table itens(id text,empresa_id text,produto text,descricao_total text,codigo text,setor_estoque text);
  create table separacoes_pedidos(id text,empresa_id text,status text,operacao jsonb,status_operacional text,reducao_liberada_em timestamptz);
  create table separacoes_itens(id text,separacao_pedido_id text,item_id text,quantidade_separada numeric,quantidade_solicitada numeric);
  insert into itens values('i1','e1','Mesa','Mesa de apoio','MES-01','Estoque'),('i2','e1','Poltrona',null,'POL-02','Estofados');
  insert into separacoes_pedidos values('p1','e1','em_separacao','{}',null,null);
  insert into separacoes_itens values('s1','p1','i1',1,4),('s2','p1','i2',0,2);`);
  const origem=fs.readFileSync('supabase/migrations/20261018000600_operacao_integrada.sql','utf8'),inicio=origem.indexOf('create or replace function public.operacao_validar_pedido_update()'),fim=origem.indexOf('create or replace function public.pedido_liberar_reducao',inicio);
  await db.exec(origem.slice(inicio,fim));await db.exec(fs.readFileSync('supabase/migrations/20261103000200_separacao_pendencias_detalhadas.sql','utf8'));
  await db.exec(`create table producao_teste(item_id text,unidades numeric,prontas numeric,confirmadas numeric);
  create function separacao_producao_calc(text) returns table(item_id text,unidades numeric,prontas numeric,confirmadas numeric) language sql as $$select * from producao_teste$$;`);
  await db.exec(fs.readFileSync('supabase/migrations/20261103000300_separacao_contar_recebimento_producao.sql','utf8'));
  await db.exec("insert into producao_teste values('i1',3,3,3),('i2',2,2,1)");
  await assert.rejects(db.exec("update separacoes_pedidos set status='separado'"),e=>{const items=JSON.parse(e.detail);assert.equal(items.length,1);assert.equal(items[0].item_id,'i2');assert.equal(items[0].faltante,1);return true;});
  // A confirmation cannot replace unfinished production.
  await db.exec("update producao_teste set confirmadas=2,prontas=1 where item_id='i2'");
  await assert.rejects(db.exec("update separacoes_pedidos set status='separado'"));
  // Repeated order rows must not multiply the production receipt.
  await db.exec("insert into separacoes_itens values('s3','p1','i2',0,1);update producao_teste set prontas=2 where item_id='i2'");
  await assert.rejects(db.exec("update separacoes_pedidos set status='separado'"));
  await db.exec(`create role authenticated;
  grant usage on schema public to authenticated;
  grant select,update on separacoes_pedidos to authenticated;
  grant select on separacoes_itens,itens to authenticated;
  revoke all on function separacao_producao_calc(text) from public,authenticated;
  alter table separacoes_pedidos enable row level security;
  create policy membro on separacoes_pedidos to authenticated using(empresa_id='e1') with check(empresa_id='e1');
  insert into separacoes_pedidos values('p2','e2','em_separacao','{}',null,null);
  set role authenticated;`);
  await assert.rejects(db.exec("update separacoes_pedidos set status='separado' where id='p1'"),/permission denied for function separacao_producao_calc/);
  await db.exec('reset role');
  await db.exec(fs.readFileSync('supabase/migrations/20261103000400_separacao_validacao_permissao_producao.sql','utf8'));
  await db.exec('set role authenticated');
  await assert.rejects(db.exec('select * from separacao_producao_calc(\'p1\')'),/permission denied/);
  await assert.rejects(db.exec("update separacoes_pedidos set status='separado' where id='p1'"),e=>JSON.parse(e.detail)[0].faltante===1);
  await db.exec("update separacoes_pedidos set status='separado' where id='p2'");
  await db.exec("reset role;update separacoes_itens set quantidade_separada=1 where id='s3';set role authenticated;update separacoes_pedidos set status='separado' where id='p1'");
  await db.exec('reset role');
  assert.equal((await db.query("select status from separacoes_pedidos where id='p2'")).rows[0].status,'em_separacao');
  await db.exec('set role authenticated');
  await assert.rejects(db.exec("update separacoes_pedidos set status='pendente'"),/finalizada/);
 }finally{await db.close();}
});
