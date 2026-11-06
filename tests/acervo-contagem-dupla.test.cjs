const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{fixture,empresa,item}=require('./helpers/ciclo-fixture.cjs');
test('duas contagens: primeira completa antes da segunda, histórico preservado e estoque só na aprovação',async()=>{
 const db=await fixture(),outro='20000000-0000-0000-0000-000000000002';try{
  await db.exec('create function seguranca_2fa_ok() returns boolean language sql as $$select true$$');
  for(const nome of ['20261105001100_inventario_geral_continuo.sql','20261105001300_inventario_contagem_cega.sql','20261105001400_inventario_duas_contagens.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+nome,'utf8'));
  await db.query('update itens set estoque_total=100 where id=$1',[item]);await db.query("insert into itens(id,empresa_id,produto,estoque_total,tipo) values($1,$2,'Outra peça',10,'item')",[outro,empresa]);
  const id=(await db.query('select acervo_inventario_geral($1) id',[empresa])).rows[0].id;
  const salvar=(alvo,q,rodada,versao=1)=>db.query('select acervo_inventario_contar_cegas($1,$2,$3,$4,$5,$6)',[empresa,id,alvo,versao,{qtd:q,revisao:0,capa:0,fazer_capa:0},rodada]);
  await salvar(item,100,1);await assert.rejects(salvar(outro,10,2),/primeira contagem/);
  assert.equal((await db.query('select contado from acervo_inventario_itens where inventario_id=$1 and item_id=$2',[id,item])).rows[0].contado,null);
  await salvar(outro,10,1);await assert.rejects(salvar(item,100,1,2),/primeira contagem já/);
  await salvar(outro,9,2,2);await assert.rejects(db.query('select acervo_inventario_aprovar($1,$2)',[empresa,id]),/contagens|segunda contagem/);
  assert.equal(Number((await db.query('select estoque_total from itens where id=$1',[outro])).rows[0].estoque_total),10);
  await salvar(item,100,2,2);
  const c=(await db.query('select primeira_contagens,segunda_contagens,primeira_contado_em,segunda_contado_em from acervo_inventario_itens where inventario_id=$1 and item_id=$2',[id,outro])).rows[0];assert.equal(c.primeira_contagens.qtd,10);assert.equal(c.segunda_contagens.qtd,9);assert.ok(c.primeira_contado_em);assert.ok(c.segunda_contado_em);
  await assert.rejects(salvar(item,100,2,3),/já foi registrada/);
  await db.query('select acervo_inventario_aprovar($1,$2)',[empresa,id]);assert.equal(Number((await db.query('select estoque_total from itens where id=$1',[outro])).rows[0].estoque_total),9);
 }finally{await db.close();}
});
