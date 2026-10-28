const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,empresa,item}=require('./helpers/ciclo-fixture.cjs');
test('inventario: checklist configuravel, historico, validacao e aprovacao conjunta',async()=>{
 const db=await fixture();try{
  const inv=(await db.query("select acervo_inventario_criar($1,'Conferencia geral',$2) id",[empresa,[item]])).rows[0].id;
  const original=(await db.query('select qualidade_criterios from acervo_inventarios where id=$1',[inv])).rows[0].qualidade_criterios;
  assert.equal(original.length,3);assert.ok(original.some(c=>c.nome==='Capa de proteção'));
  const capa=original.find(c=>c.nome==='Capa de proteção');
  await db.query("select acervo_qualidade_configurar($1,$2,'Protecao revisada',false)",[empresa,capa.id]);
  const novo=(await db.query("select acervo_qualidade_configurar($1,null,'Etiqueta de patrimonio',true) id",[empresa])).rows[0].id;
  assert.deepEqual((await db.query('select qualidade_criterios from acervo_inventarios where id=$1',[inv])).rows[0].qualidade_criterios,original);
  await assert.rejects(db.query("select acervo_qualidade_configurar($1,$2,'Outro nome',true)",['10000000-0000-0000-0000-000000000002',capa.id]),/permissão/);
  await db.exec("set test.negar='sim'");await assert.rejects(db.query("select acervo_qualidade_configurar($1,null,'Sem permissao',true)",[empresa]),/permissão/);await db.exec("set test.negar=''");
  await assert.rejects(db.query("select acervo_inventario_conferir($1,$2,$3,1,100,'',$4)",[empresa,inv,item,{}]),/verificações/);
  assert.equal((await db.query('select contado from acervo_inventario_itens where inventario_id=$1',[inv])).rows[0].contado,null);
  const respostas=Object.fromEntries(original.map(c=>[c.id,{resultado:'conforme',observacao:''}]));
  respostas[capa.id]={resultado:'nao_conforme',observacao:''};
  await assert.rejects(db.query("select acervo_inventario_conferir($1,$2,$3,1,100,'',$4)",[empresa,inv,item,respostas]),/Descreva/);
  respostas[capa.id].observacao='Capa com rasgo na lateral';
  await assert.rejects(db.query("select acervo_inventario_conferir($1,$2,$3,1,100,'',$4)",[empresa,inv,item,respostas]),/quantidade afetada/);
  await db.query("select acervo_inventario_conferir($1,$2,$3,1,100,'',$4,$5)",[empresa,inv,item,respostas,{quantidade:2,destino:'reparo'}]);
  await assert.rejects(db.query("select acervo_inventario_conferir($1,$2,$3,1,100,'',$4)",[empresa,inv,item,respostas]),/outro usuário/);
  assert.equal((await db.query('select count(*)::int n from acervo_inventario_qualidade_historico')).rows[0].n,1);
  await db.query("select acervo_inventario_contar($1,$2,$3,2,100,'')",[empresa,inv,item]);
  await assert.rejects(db.query('select acervo_inventario_aprovar($1,$2)',[empresa,inv]),/verificações/);
  await db.query("select acervo_inventario_conferir($1,$2,$3,3,100,'',$4,$5)",[empresa,inv,item,respostas,{quantidade:2,destino:'reparo'}]);
  await db.query('select acervo_inventario_aprovar($1,$2)',[empresa,inv]);
  assert.equal((await db.query('select status from acervo_inventarios where id=$1',[inv])).rows[0].status,'aprovado');
  const painel=(await db.query('select acervo_painel($1) b',[empresa])).rows[0].b;
  assert.equal(painel.inventarios[0].itens[0].qualidade[capa.id].observacao,'Capa com rasgo na lateral');
  const inv2=(await db.query("select acervo_inventario_criar($1,'Nova conferencia',$2) id",[empresa,[item]])).rows[0].id;
  const criterios=(await db.query('select qualidade_criterios from acervo_inventarios where id=$1',[inv2])).rows[0].qualidade_criterios;
  assert.ok(!criterios.some(c=>c.id===capa.id));assert.ok(criterios.some(c=>c.id===novo));
 }finally{await db.close();}
});
