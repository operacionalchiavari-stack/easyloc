const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,empresa,item}=require('./helpers/ciclo-fixture.cjs');
test('qualidade → bloqueio → O.S → inspeção → disponibilidade, com concorrência e isolamento',async()=>{
 const db=await fixture();try{
  await db.exec("create or replace function funcionario_tabela_permitida(uuid,text,text) returns boolean language sql as $$select coalesce(current_setting('test.negar',true),'')<>'sim'$$");
  await db.query("update itens set codigo='C01',produto='Cadeira',estoque_total=100 where id=$1",[item]);
  const inv=(await db.query("select acervo_inventario_criar($1,'Inspecao do deposito',$2) id",[empresa,[item]])).rows[0].id;
  const criterios=(await db.query('select qualidade_criterios from acervo_inventarios where id=$1',[inv])).rows[0].qualidade_criterios;
  const respostas=Object.fromEntries(criterios.map(c=>[c.id,{resultado:c.id==='geral'?'nao_conforme':'conforme',observacao:c.id==='geral'?'Estrutura com folga na base':''}]));
  await db.query("select acervo_inventario_conferir($1,$2,$3,1,100,'',$4,$5)",[empresa,inv,item,respostas,{quantidade:3,destino:'reparo'}]);
  const bloqueio=async()=>Number((await db.query('select coalesce(sum(quantidade),0) n from operacao_indisponiveis($1,current_date) where item_id=$2',[empresa,item])).rows[0].n);
  assert.equal(await bloqueio(),3);
  let painel=(await db.query('select acervo_painel($1) b',[empresa])).rows[0].b,r=painel.retornos.find(r=>r.inventario_id===inv);
  assert.ok(r);assert.equal(r.pedido_id,null);assert.equal(r.origem,'inventario');assert.equal(r.estado,'reparo');
  await assert.rejects(db.query("select acervo_inventario_conferir($1,$2,$3,1,100,'',$4,$5)",[empresa,inv,item,respostas,{quantidade:3,destino:'reparo'}]),/outro usuário/);
  await assert.rejects(db.query("select acervo_os_criar($1,$2,1,'Marcenaria',current_date+2,'Ana')",['10000000-0000-0000-0000-000000000002',r.id]),/permissão/);
  await db.exec("set test.negar='sim'");await assert.rejects(db.query("select acervo_os_criar($1,$2,1,'Marcenaria',current_date+2,'Ana')",[empresa,r.id]),/permissão/);await db.exec("set test.negar=''");
  const os=(await db.query("select acervo_os_criar($1,$2,1,'Marcenaria',current_date+2,'Ana') id",[empresa,r.id])).rows[0].id;
  await assert.rejects(db.query("select acervo_os_criar($1,$2,1,'Marcenaria',current_date+2,'Ana')",[empresa,r.id]),/atualizou/);
  await assert.rejects(db.query("select acervo_movimentar($1,$2,2,'inspecao','Inspecionar reparo',0)",[empresa,r.id]),/Conclua a O.S/);
  await db.query("select acervo_os_atualizar($1,$2,1,'encaminhar','Acabamento e Pintura',current_date+3,'Bruno','Preparar novo acabamento')",[empresa,os]);
  await assert.rejects(db.query("select acervo_os_atualizar($1,$2,1,'concluir',null,null,'','Tentativa com versao antiga')",[empresa,os]),/atualizou/);
  await db.query("select acervo_os_atualizar($1,$2,2,'concluir',null,null,'','Reparo e acabamento concluidos')",[empresa,os]);
  assert.equal(await bloqueio(),3);
  const ordens=(await db.query('select acervo_ordens($1) o',[empresa])).rows[0].o,o=ordens.find(o=>o.id===os);
  assert.equal(o.fonte,'sistema');assert.equal(o.concluida,true);assert.deepEqual(o.fluxo,['Marcenaria','Acabamento e Pintura']);
  await db.query("select acervo_movimentar($1,$2,2,'inspecao','Conferencia final do reparo',0)",[empresa,r.id]);
  await db.query("select acervo_movimentar($1,$2,3,'liberado','Pecas aprovadas na inspecao',0)",[empresa,r.id]);
  assert.equal(await bloqueio(),0);
  await assert.rejects(db.query("select acervo_movimentar($1,$2,3,'baixado','Tentativa duplicada',0)",[empresa,r.id]),/atualizou/);
  assert.equal(Number((await db.query('select estoque_total from itens where id=$1',[item])).rows[0].estoque_total),100);
  await db.query('select acervo_inventario_aprovar($1,$2)',[empresa,inv]);
  assert.equal((await db.query('select count(*)::int n from qualidade_inspecoes')).rows[0].n,1);
 }finally{await db.close();}
});
