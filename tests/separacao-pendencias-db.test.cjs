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
  await assert.rejects(db.exec("update separacoes_pedidos set status='separado' where id='p1'"),e=>{assert.match(e.message,/Mesa de apoio.*MES-01.*3.*Poltrona.*POL-02.*2/);const itens=JSON.parse(e.detail);assert.equal(itens.length,2);assert.deepEqual(itens.map(i=>[i.nome,i.faltante]),[['Mesa de apoio',3],['Poltrona',2]]);return true;});
  assert.equal((await db.query('select status from separacoes_pedidos')).rows[0].status,'em_separacao');
  await db.exec("update separacoes_itens set quantidade_separada=quantidade_solicitada;update separacoes_pedidos set status='separado';");
  await assert.rejects(db.exec("update separacoes_pedidos set status='pendente'"),/finalizada/);
 }finally{await db.close();}
});
