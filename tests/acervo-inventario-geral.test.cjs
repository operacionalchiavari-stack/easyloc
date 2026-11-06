const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{fixture,empresa,item}=require('./helpers/ciclo-fixture.cjs');
test('inventário geral: retoma a mesma contagem, inclui todas as peças e exige conclusão completa',async()=>{
 const db=await fixture(),outro='20000000-0000-0000-0000-000000000002',kit='20000000-0000-0000-0000-000000000003',novo='20000000-0000-0000-0000-000000000004';try{
  await db.exec('create function seguranca_2fa_ok() returns boolean language sql as $$select true$$');
  await db.exec(fs.readFileSync('supabase/migrations/20261105001100_inventario_geral_continuo.sql','utf8'));
  await db.exec(`create table teste_sincronizacoes(empresa_id uuid);create function ocorrencias_sincronizar(uuid) returns void language sql as $$insert into teste_sincronizacoes values($1)$$;
  create function ocorrencias_fonte_mudou() returns trigger language plpgsql as $$begin perform ocorrencias_sincronizar(new.empresa_id);return new;end$$;
  create trigger ocorrencias_automaticas after insert on acervo_inventario_itens for each row execute function ocorrencias_fonte_mudou();`);
  await db.exec(fs.readFileSync('supabase/migrations/20261105001200_inventario_abertura_em_lote.sql','utf8'));
  await db.query("insert into itens(id,empresa_id,produto,estoque_total,tipo) values($1,$3,'Componente',4,'item'),($2,$3,'Kit',0,'kit')",[outro,kit,empresa]);
  const obter=async()=>(await db.query('select acervo_inventario_geral($1) id',[empresa])).rows[0].id;
  const id=await obter();assert.equal(await obter(),id);
  assert.equal((await db.query('select count(*)::int n from teste_sincronizacoes')).rows[0].n,1,'abertura sincroniza uma vez por lote, e não para cada item');
  let itens=(await db.query('select item_id from acervo_inventario_itens where inventario_id=$1',[id])).rows;assert.ok(itens.some(i=>i.item_id===item));assert.ok(itens.some(i=>i.item_id===outro));assert.ok(!itens.some(i=>i.item_id===kit));
  await assert.rejects(db.query('select acervo_inventario_aprovar($1,$2)',[empresa,id]),/contagen/);
  const criterios=(await db.query('select qualidade_criterios from acervo_inventarios where id=$1',[id])).rows[0].qualidade_criterios,qualidade=Object.fromEntries(criterios.map(c=>[c.id,{resultado:'conforme',observacao:''}]));
  for(const i of itens)await db.query('update acervo_inventario_itens set contado=saldo_base,qualidade=$2 where inventario_id=$1 and item_id=$3',[id,qualidade,i.item_id]);
  await db.query("insert into itens(id,empresa_id,produto,estoque_total,tipo) values($1,$2,'Peça cadastrada durante a contagem',2,'item')",[novo,empresa]);
  await assert.rejects(db.query('select acervo_inventario_aprovar($1,$2)',[empresa,id]),/todos os itens/);
  assert.equal(await obter(),id);
  assert.equal((await db.query('select contado from acervo_inventario_itens where inventario_id=$1 and item_id=$2',[id,item])).rows[0].contado!==null,true);
  await db.query('update acervo_inventario_itens set contado=saldo_base,qualidade=$2 where inventario_id=$1 and item_id=$3',[id,qualidade,novo]);
  await db.query('select acervo_inventario_aprovar($1,$2)',[empresa,id]);assert.equal((await db.query('select status from acervo_inventarios where id=$1',[id])).rows[0].status,'aprovado');assert.notEqual(await obter(),id);
  await assert.rejects(db.query('select acervo_inventario_geral($1)',['10000000-0000-0000-0000-000000000099']),/permissão/);
 }finally{await db.close();}
});
