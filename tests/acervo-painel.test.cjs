const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,empresa,cliente,item}=require('./helpers/ciclo-fixture.cjs');
test('painel: O.S existente, mesmo item, quantidade, eventos sobrepostos e conclusao',async()=>{
 const db=await fixture();try{
  await db.query("update itens set codigo='001',produto='Cadeira',estoque_total=10 where id=$1",[item]);
  const p=(await db.query("insert into separacoes_pedidos(empresa_id,cliente_id,cliente_nome,numero_pedido,status_comercial,status,data_evento,data_entrega,data_coleta) values($1,$2,'Cliente','123','aprovado','pendente',current_date+3,current_date+3,current_date+4) returning id",[empresa,cliente])).rows[0].id;
  await db.query("select set_config('app.pedido_salvar','sim',false)");await db.query("insert into separacoes_itens(empresa_id,separacao_pedido_id,item_id,item_nome,quantidade_solicitada) values($1,$2,$3,'Cadeira',8)",[empresa,p,item]);
  const r=(await db.query("insert into acervo_retornos(empresa_id,pedido_id,chave,item_id,tipo,quantidade,estado) values($1,$2,'linha',$3,'avaria',4,'triagem') returning id",[empresa,p,item])).rows[0].id;
  const valores=['os-a','','','','501','Cadeira',4,'Marcenaria','','','','','','','Arranhado','','','001'];
  valores[13]='123';
  await db.query("insert into gs_linhas values('1EvCBsoDsB0svzEyrGvH46oHHCH3lCTPJMU4If8-LZgE','Itens Danificados',2,$1)",[JSON.stringify(valores)]);
  let b=(await db.query('select acervo_painel($1) b',[empresa])).rows[0].b;assert.equal(b.ordens[0].numero,'501');assert.equal(b.ordens[0].pedido,'123');assert.equal(b.eventos.length,1);assert.equal(b.eventos[0].risco,true);assert.equal(b.eventos[0].itens[0].faltante,2);
  assert.equal(b.acervo_antecedencia_horas,24);assert.equal(b.eventos[0].carregamento_em,null);
  await db.query("select pedido_fluxo_configurar($1,false,true,48)",[empresa]);
  await db.query("insert into operacao_etapas(empresa_id,pedido_id,tipo,data,hora) values($1,$2,'carregamento',current_date+2,'08:00')",[empresa,p]);
  const prazoPainel=(await db.query('select acervo_painel($1) b',[empresa])).rows[0].b;assert.equal(prazoPainel.acervo_antecedencia_horas,48);assert.ok(prazoPainel.eventos[0].carregamento_em);await assert.rejects(db.query('select pedido_fluxo_configurar($1,false,true,-1)',[empresa]),/Antecedencia/);
  await assert.rejects(db.query("select acervo_os_vincular($1,$2,null,'os-a')",[empresa,r]),/card mudou/);
  await db.query("select acervo_os_vincular($1,$2,1,'os-a')",[empresa,r]);b=(await db.query('select acervo_painel($1) b',[empresa])).rows[0].b;assert.equal(b.retornos[0].os_numero,'501');assert.equal(b.retornos[0].estado,'reparo');
  await assert.rejects(db.query("select acervo_movimentar($1,$2,2,'inspecao','Conferir o reparo',0)",[empresa,r]),/Conclua a O.S/);
  valores[11]='Concluído';await db.query("update gs_linhas set valores=$1 where aba='Itens Danificados'",[JSON.stringify(valores)]);await db.query("select acervo_movimentar($1,$2,2,'inspecao','Conferir o reparo',0)",[empresa,r]);
  await assert.rejects(db.query("select acervo_painel('10000000-0000-0000-0000-000000000002')"),/permiss/);
  // Outra reserva na mesma data tambem disputa o saldo do item.
  const p2=(await db.query("insert into separacoes_pedidos(empresa_id,numero_pedido,cliente_nome,status_comercial,status,data_evento,data_entrega,data_coleta) values($1,'124','Outro evento','aprovado','pendente',current_date+3,current_date+3,current_date+3) returning id",[empresa])).rows[0].id;
  await db.query("insert into separacoes_itens(empresa_id,separacao_pedido_id,item_id,item_nome,quantidade_solicitada) values($1,$2,$3,'Cadeira',2)",[empresa,p2,item]);b=(await db.query('select acervo_painel($1) b',[empresa])).rows[0].b;assert.equal(b.eventos[0].itens[0].faltante,4);
 }finally{await db.close();}
});
