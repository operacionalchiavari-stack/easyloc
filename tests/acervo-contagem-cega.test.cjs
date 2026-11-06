const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{fixture,empresa,item}=require('./helpers/ciclo-fixture.cjs');
test('contagem cega: parâmetros, quatro quantidades, revisão e finalização completa',async()=>{
 const db=await fixture();try{
  await db.exec('create function seguranca_2fa_ok() returns boolean language sql as $$select true$$');
  for(const nome of ['20261105001100_inventario_geral_continuo.sql','20261105001300_inventario_contagem_cega.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+nome,'utf8'));
  await db.query('update itens set estoque_total=100 where id=$1',[item]);
  const obter=async()=>(await db.query('select acervo_inventario_geral($1) id',[empresa])).rows[0].id;
  const id=await obter(),colunas=(await db.query('select acervo_inventario_colunas_listar($1) c',[empresa])).rows[0].c;assert.equal(colunas.length,4);assert.deepEqual(colunas.map(c=>c.chave),['qtd','revisao','capa','fazer_capa']);
  const salvar=(valores,versao=1)=>db.query('select acervo_inventario_contar_cegas($1,$2,$3,$4,$5)',[empresa,id,item,versao,valores]);
  await assert.rejects(salvar({qtd:100}),/todas as colunas/);await assert.rejects(salvar({qtd:100,revisao:-1,capa:0,fazer_capa:0}),/inválida/);await assert.rejects(salvar({qtd:1,revisao:2,capa:0,fazer_capa:0}),/superar/);
  await db.query("select acervo_inventario_coluna_configurar($1,'capa','Qtd. capas existentes',false,3)",[empresa]);
  assert.equal((await db.query('select colunas_contagem from acervo_inventarios where id=$1',[id])).rows[0].colunas_contagem.filter(c=>c.ativa).length,4,'parâmetros preservam o inventário em andamento');
  await assert.rejects(db.query("select acervo_inventario_coluna_configurar($1,'qtd','Quantidade',false,1)",[empresa]),/obrigatória/);
  await salvar({qtd:100,revisao:2,capa:90,fazer_capa:1});
  const contado=(await db.query('select * from acervo_inventario_itens where inventario_id=$1',[id])).rows[0];assert.equal(Number(contado.contado),100);assert.equal(contado.contagens.revisao,2);assert.equal(contado.qualidade.geral.resultado,'nao_conforme');
  const tratamento=(await db.query('select quantidade,estado from acervo_retornos where inventario_id=$1',[id])).rows[0];assert.equal(Number(tratamento.quantidade),2);assert.equal(tratamento.estado,'reparo');
  await assert.rejects(salvar({qtd:100,revisao:2,capa:90,fazer_capa:1}),/outro usuário/i);
  await db.query('select acervo_inventario_aprovar($1,$2)',[empresa,id]);
  const proximo=await obter();assert.notEqual(proximo,id);assert.equal((await db.query('select colunas_contagem from acervo_inventarios where id=$1',[proximo])).rows[0].colunas_contagem.filter(c=>c.ativa).length,3);
  const criterios=(await db.query('select qualidade_criterios from acervo_inventarios where id=$1',[proximo])).rows[0].qualidade_criterios,respostas=Object.fromEntries(criterios.map(c=>[c.id,{resultado:'conforme',observacao:''}]));
  await db.query('update acervo_inventario_itens set contado=saldo_base,qualidade=$2 where inventario_id=$1',[proximo,respostas]);await assert.rejects(db.query('select acervo_inventario_aprovar($1,$2)',[empresa,proximo]),/todas as colunas/);
  await assert.rejects(db.query('select acervo_inventario_contar_cegas($1,$2,$3,1,$4)',['10000000-0000-0000-0000-000000000099',proximo,item,{qtd:100,revisao:0,fazer_capa:0}]),/permissão/);
 }finally{await db.close();}
});
