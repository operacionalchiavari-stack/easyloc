const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,empresa,cliente,item}=require('./helpers/ciclo-fixture.cjs');
for(const simultaneo of [true,false])test('pedido do inicio ao fim com banco atualizado e pagamento: retorno '+(simultaneo?'simultaneo':'sequencial'),async()=>{
 const db=await fixture();try{
  await db.query('select pedido_fluxo_configurar($1,false,$2)',[empresa,simultaneo]);
  const payload={empresa_id:empresa,cliente_id:cliente,numero_pedido:'TOTAL-TESTE',cliente_nome:'Cliente isolado',status_comercial:'aprovado',data_evento:'2026-10-24',data_entrega:'2026-10-24',valor_total:1000,observacoes:{itens_comerciais:[{item_id:item,quantidade_solicitada:10,valor_locacao:100,valor_reposicao:500}]}};
  const p=(await db.query('select pedido_salvar_integrado(null,$1,$2,null) p',[payload,[{item_id:item,item_nome:'Cadeira',quantidade_solicitada:10}]])).rows[0].p;
  const fila=async s=>(await db.query('select pedido_fluxo_fila($1,$2) f',[empresa,s])).rows[0].f;
  const presente=async s=>(await fila(s)).some(x=>x.id===p.id);
  const conferir=async etapa=>{const pcs=(await db.query('select * from operacao_conferencia_pecas($1)',[p.id])).rows;await db.query('select operacao_concluir_conferencia($1,$2,false,$3)',[p.id,etapa,Object.fromEntries(pcs.map(c=>[c.chave,c.esperado]))]);};
  const confirmar=async etapa=>{const b=(await db.query('select logistica_confirmacao_base($1,$2) b',[p.id,etapa])).rows[0].b;await db.query('select logistica_confirmacao_salvar($1,$2,$3,$4,$5,$6)',[p.id,etapa,b.token,b.itens.map(i=>({chave:i.chave,retirado_lista:0,...(etapa==='entrega'?{entregue:i.previsto,voltou_antes:0}:{coletado:i.previsto,danificado:0})})), 'Equipe isolada','']);};
  assert.equal(await presente('triagem'),true);assert.equal(await presente('entrega'),false);
  await assert.rejects(confirmar('entrega'),/Etapa atual: triagem/);
  await db.query('update separacoes_itens set quantidade_separada=10 where separacao_pedido_id=$1',[p.id]);await db.query("update separacoes_pedidos set status='separado' where id=$1",[p.id]);
  assert.equal(await presente('triagem'),false);assert.equal(await presente('expedicao'),true);
  await conferir('carregamento');assert.equal(await presente('expedicao'),false);assert.equal(await presente('entrega'),true);
  await confirmar('entrega');assert.equal(await presente('entrega'),false);assert.equal(await presente('coleta'),true);
  await confirmar('coleta');assert.equal(await presente('coleta'),false);assert.equal(await presente('expedicao'),true);assert.equal(await presente('triagem'),simultaneo);
  if(simultaneo){await conferir('retorno');assert.equal(await presente('posicao_final'),false);await conferir('descarregamento');}
  else{await assert.rejects(conferir('retorno'),/modo sequencial/);await conferir('descarregamento');assert.equal(await presente('triagem'),true);await conferir('retorno');}
  assert.equal(await presente('triagem'),false);assert.equal(await presente('expedicao'),false);assert.equal(await presente('posicao_final'),true);
  let titulo=(await db.query('select id from fin_receber where pedido_id=$1 limit 1',[p.id])).rows[0];
  if(!titulo)titulo=(await db.query("insert into fin_receber(empresa_id,cliente_id,pedido_id,descricao,vencimento,valor) values($1,$2,$3,'Locacao do teste',current_date,1000) returning id",[empresa,cliente,p.id])).rows[0];
  const conta=(await db.query("insert into fin_contas(empresa_id,nome) values($1,'Conta isolada') returning id",[empresa])).rows[0].id;
  await db.query("select fin_baixar($1,'receber',$2,'2026-10-24',1000,0,0,0,0,$3,'PIX','Pagamento isolado')",[empresa,titulo.id,conta]);
  const recebido=(await db.query('select recebido,aberto from fin_receber where id=$1',[titulo.id])).rows[0];assert.equal(Number(recebido.recebido),1000);assert.equal(Number(recebido.aberto),0);
  const f=(await db.query('select fin_posicao_final_base($1,$2) b',[empresa,p.id])).rows[0].b;
  const final=(await db.query('select fin_posicao_final_salvar($1,$2,$3,0,$4,true) b',[empresa,p.id,f.fonte,[]])).rows[0].b;assert.equal(final.salvo.status,'confirmado');
  const fluxo=(await db.query('select comercial_fluxo_pedidos($1,$2) f',[empresa,[p.id]])).rows[0].f;assert.equal(fluxo[0].finalizado,true);
  for(const setor of ['triagem','expedicao','entrega','coleta'])assert.equal(await presente(setor),false);
  await assert.rejects(db.query('select fin_posicao_final_salvar($1,$2,$3,0,$4,true)',[empresa,p.id,f.fonte,[]]),/confirmada|mudou/);
 }finally{await db.close();}
});
test('pedido completo: entrega parcial, volta antecipada, avaria, falta e posição final sem duplicação',async()=>{
 const db=await fixture();try{
  await db.query("update itens set produto='Cadeira',codigo='C01',valor_reposicao=500 where id=$1",[item]);
  const payload={empresa_id:empresa,cliente_id:cliente,numero_pedido:'PILOTO-TESTE',cliente_nome:'Cliente de teste isolado',status_comercial:'aprovado',data_evento:'2026-10-24',data_entrega:'2026-10-24',valor_total:1000,observacoes:{itens_comerciais:[{item_id:item,quantidade_solicitada:10,valor_locacao:100,valor_reposicao:500}]}};
  const p=(await db.query('select pedido_salvar_integrado(null,$1,$2,null) p',[payload,[{item_id:item,item_nome:'Cadeira',quantidade_solicitada:10}]])).rows[0].p;
  const fila=async s=>(await db.query('select pedido_fluxo_fila($1,$2) f',[empresa,s])).rows[0].f;
  const conferir=async etapa=>{const pcs=(await db.query('select * from operacao_conferencia_pecas($1)',[p.id])).rows;await db.query('select operacao_concluir_conferencia($1,$2,false,$3)',[p.id,etapa,Object.fromEntries(pcs.map(c=>[c.chave,c.esperado]))]);};
  assert.ok((await fila('triagem')).some(x=>x.id===p.id));
  await db.query('update separacoes_itens set quantidade_separada=10 where separacao_pedido_id=$1',[p.id]);await db.query("update separacoes_pedidos set status='separado' where id=$1",[p.id]);await conferir('carregamento');
  let b=(await db.query("select logistica_confirmacao_base($1,'entrega') b",[p.id])).rows[0].b;
  const motivos=(await db.query('select id,etapa from logistica_motivos where empresa_id=$1',[empresa])).rows;
  await db.query("select logistica_confirmacao_salvar($1,'entrega',$2,$3,'Equipe de teste','')",[p.id,b.token,b.itens.map(i=>({chave:i.chave,entregue:8,voltou_antes:2,retirado_lista:0,motivo_id:motivos.find(m=>m.etapa==='entrega').id}))]);
  assert.equal((await fila('entrega')).length,0);assert.ok((await fila('coleta')).some(x=>x.id===p.id));
  b=(await db.query("select logistica_confirmacao_base($1,'coleta') b",[p.id])).rows[0].b;assert.equal(b.itens[0].previsto,6);assert.equal(b.itens[0].ja_no_deposito,4);
  await db.query("select logistica_confirmacao_salvar($1,'coleta',$2,$3,'Equipe de teste','')",[p.id,b.token,b.itens.map(i=>({chave:i.chave,coletado:5,danificado:2,retirado_lista:0,motivo_id:motivos.find(m=>m.etapa==='coleta').id}))]);
  await conferir('retorno');await conferir('descarregamento');
  const f=(await db.query('select fin_posicao_final_base($1,$2) b',[empresa,p.id])).rows[0].b;
  assert.equal(f.itens.find(i=>i.tipo==='credito').valor,200);assert.equal(f.itens.find(i=>i.tipo==='avaria').valor,1000);assert.equal(f.itens.find(i=>i.tipo==='desaparecido').valor,500);
  const decisoes=f.itens.map(i=>({chave:i.chave,decisao:'cobrar'}));
  const final=(await db.query('select fin_posicao_final_salvar($1,$2,$3,0,$4,true) b',[empresa,p.id,f.fonte,decisoes])).rows[0].b;
  assert.equal(final.salvo.credito,200);assert.equal(final.salvo.cobranca,1500);
  await assert.rejects(db.query('select fin_posicao_final_salvar($1,$2,$3,0,$4,true)',[empresa,p.id,f.fonte,decisoes]),/confirmada|mudou/);
  assert.equal((await db.query("select count(*)::int n from fin_pagar where origem='credito_cliente'")).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int n from acervo_retornos where pedido_id=$1 and tipo='avaria'",[p.id])).rows[0].n,1);
 }finally{await db.close();}
});
