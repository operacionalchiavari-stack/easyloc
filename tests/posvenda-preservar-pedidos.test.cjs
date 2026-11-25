const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('excluir pedido não apaga o vínculo nem a ligação de pós-venda',async()=>{
 const db=new PGlite();try{
  await db.exec(`create table separacoes_pedidos(id uuid primary key);create table posvenda_contatos(id uuid primary key);create table posvenda_contato_pedidos(contato_id uuid references posvenda_contatos on delete cascade,pedido_id uuid primary key references separacoes_pedidos on delete cascade);
   insert into separacoes_pedidos values('00000000-0000-0000-0000-000000000001');insert into posvenda_contatos values('00000000-0000-0000-0000-000000000002');insert into posvenda_contato_pedidos values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001');`);
  await db.exec(fs.readFileSync('supabase/migrations/20261120000101_posvenda_preservar_pedidos.sql','utf8'));
  await assert.rejects(db.exec('delete from separacoes_pedidos'),e=>/posvenda_contato_pedidos_pedido_id_fkey/.test(e.message));
  assert.equal((await db.query('select count(*)::int n from posvenda_contato_pedidos')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from posvenda_contatos')).rows[0].n,1);
  await db.exec('delete from posvenda_contatos;delete from separacoes_pedidos');
 }finally{await db.close();}
});
