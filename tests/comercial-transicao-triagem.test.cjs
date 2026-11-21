const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('liberacao aguarda edicao; pode cancelar antes, e protege concorrencia e permissoes',async()=>{
 const fonte=fs.readFileSync('tests/fluxo-unico-pedidos.test.cjs','utf8');
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const {fixture,criar,fila}=await new AsyncFunction('require','__dirname',fonte.slice(0,fonte.indexOf("test('fluxo"))+'return {fixture,criar,fila};')(require,__dirname);
 const db=await fixture();
 try{
  await db.exec(`create or replace function seguranca_2fa_ok() returns boolean language sql as $$select true$$;
   create or replace function operacao_pode(uuid,text) returns boolean language sql as $$select coalesce(current_setting('test.negar',true),'')<>'sim'$$;`);
  await db.exec(fs.readFileSync('supabase/migrations/20261109000100_comercial_transicao_triagem.sql','utf8'));
  const p=await criar(db);
  await db.query("update separacoes_pedidos set status='em_separacao' where id=$1",[p.id]);
  await db.query('select pedido_liberar_reducao($1,true)',[p.id]);
  assert.ok((await fila(db,'triagem')).some(x=>x.id===p.id));
  await db.query('select pedido_liberar_reducao($1,false)',[p.id]);
  assert.equal((await db.query('select status from separacoes_pedidos where id=$1',[p.id])).rows[0].status,'em_separacao');
  await db.query('select pedido_liberar_reducao($1,true)',[p.id]);
  await db.exec("select set_config('test.negar','sim',false)");
  await assert.rejects(db.query('select pedido_assumir_revisao($1)',[p.id]),/permiss/);
  await db.exec("select set_config('test.negar','nao',false)");
  const antes=(await db.query('select revisao from separacoes_pedidos where id=$1',[p.id])).rows[0].revisao;
  await Promise.all([db.query('select pedido_assumir_revisao($1)',[p.id]),db.query('select pedido_assumir_revisao($1)',[p.id])]);
  assert.equal((await db.query('select revisao from separacoes_pedidos where id=$1',[p.id])).rows[0].revisao,Number(antes)+1);
  assert.ok(!(await fila(db,'triagem')).some(x=>x.id===p.id));
  await assert.rejects(db.query('select pedido_liberar_reducao($1,false)',[p.id]),/Comercial/);
 }finally{await db.close();}
});
