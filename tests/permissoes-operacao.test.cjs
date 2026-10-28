const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,empresa,item}=require('./helpers/ciclo-fixture.cjs');
test('consulta, operação e administração têm permissões distintas; tabelas operacionais não aceitam escrita direta',async()=>{
 const db=await fixture();try{
  await db.exec("create or replace function funcionario_tabela_permitida(uuid,text,text) returns boolean language sql as $$select $3='select' or coalesce(current_setting('test.perfil',true),'') in ('operador','admin')$$;create or replace function funcionario_pode(uuid,uuid,text) returns boolean language sql as $$select coalesce(current_setting('test.perfil',true),'')='admin'$$;");
  assert.ok(Array.isArray((await db.query('select acervo_ordens($1) o',[empresa])).rows[0].o));
  await assert.rejects(db.query("select acervo_inventario_criar($1,'Sem permissao',$2)",[empresa,[item]]),/permissão/);
  await assert.rejects(db.query("select acervo_qualidade_configurar($1,null,'Sem permissao',true)",[empresa]),/permissão/);
  await db.exec("set test.perfil='operador'");
  const inv=(await db.query("select acervo_inventario_criar($1,'Conferencia autorizada',$2) id",[empresa,[item]])).rows[0].id;assert.ok(inv);
  await assert.rejects(db.query("select acervo_qualidade_configurar($1,null,'Somente administrador',true)",[empresa]),/permissão/);
  await db.exec("set test.perfil='admin'");assert.ok((await db.query("select acervo_qualidade_configurar($1,null,'Verificacao autorizada',true) id",[empresa])).rows[0].id);
  for(const tabela of ['acervo_os','acervo_retornos','acervo_inventario_itens','acervo_inventario_qualidade_historico','sistema_erros_operacionais']){
   const p=(await db.query("select has_table_privilege('authenticated',$1,'INSERT') i,has_table_privilege('authenticated',$1,'UPDATE') u",[tabela])).rows[0];assert.equal(p.i,false,tabela);assert.equal(p.u,false,tabela);
  }
  assert.equal((await db.query("select has_function_privilege('anon','acervo_ordens(uuid)','EXECUTE') e")).rows[0].e,false);
  assert.equal((await db.query("select has_function_privilege('authenticated','sistema_backup_exportar()','EXECUTE') e")).rows[0].e,false);
  await assert.rejects(db.query('select acervo_painel($1)',['10000000-0000-0000-0000-000000000002']),/permiss/);
 }finally{await db.close();}
});
test('diagnósticos: restrição de empresa, deduplicação e limitação de volume',async()=>{
 const db=await fixture();try{
  await assert.rejects(db.query("select sistema_erro_registrar($1,'/teste','Falha de teste')",['10000000-0000-0000-0000-000000000002']),/acesso/);
  await db.query("select sistema_erro_registrar($1,'/teste?token=proibido','Nao registrar caminho com segredo')",[empresa]);
  for(let n=0;n<2;n++)await db.query("select sistema_erro_registrar($1,'/teste','Mesma falha')",[empresa]);
  assert.equal((await db.query('select count(*)::int n from sistema_erros_operacionais')).rows[0].n,1);
  for(let n=0;n<30;n++)await db.query("select sistema_erro_registrar($1,'/teste',$2)",[empresa,'Falha distinta '+n]);
  assert.equal((await db.query('select count(*)::int n from sistema_erros_operacionais')).rows[0].n,20);
 }finally{await db.close();}
});
