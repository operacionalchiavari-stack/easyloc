const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,empresa,cliente,item}=require('./helpers/ciclo-fixture.cjs');
async function pedido(db){return (await db.query(`insert into separacoes_pedidos(empresa_id,numero_pedido,cliente_id,cliente_nome,status_comercial,status,valor_total,data_evento,data_coleta) values($1,'90001',$2,'Decoradora','aprovado','pendente',1000,'2026-10-24','2026-10-24') returning id`,[empresa,cliente])).rows[0].id;}
test('crédito: compensação sem caixa fictício, idempotência, saldo e estorno',async()=>{const db=await fixture();try{
 const p=await pedido(db),r=(await db.query("insert into fin_receber(empresa_id,cliente_id,pedido_id,descricao,vencimento,valor) values($1,$2,$3,'Locação',current_date,1000) returning id",[empresa,cliente,p])).rows[0].id;
 const c=(await db.query("select fin_cliente_registrar_credito($1,$2,'ajuste',200,current_date,'Não entregue no evento') id",[empresa,cliente])).rows[0].id;
 const id='60000000-0000-0000-0000-000000000001',comp=()=>db.query('select fin_credito_compensar($1,$2,$3,$4,200,$5)',[empresa,id,c,r,'Abater locação não entregue']);await comp();await comp();
 let t=(await db.query('select * from fin_receber where id=$1',[r])).rows[0];assert.equal(Number(t.aberto),800);assert.equal(Number(t.recebido),0);assert.equal(Number(t.compensado),200);
 assert.equal((await db.query('select count(*)::int n from fin_movimentos')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from fin_compensacoes')).rows[0].n,1);
 await assert.rejects(db.query("update fin_receber set status='cancelado' where id=$1",[r]),/Estorne/);
 await assert.rejects(db.query('select fin_credito_compensar($1,gen_random_uuid(),$2,$3,1,$4)',[empresa,c,r,'Saldo já utilizado']),/supera/);
 await db.query('select fin_credito_compensacao_estornar($1,$2,$3)',[empresa,id,'Revisão da compensação']);t=(await db.query('select * from fin_receber where id=$1',[r])).rows[0];assert.equal(Number(t.aberto),1000);assert.equal(t.status,'aberto');
}finally{await db.close();}});

test('custos e resultados: reenvio nao duplica, valores e revisao conferem',async()=>{const db=await fixture();try{
 const p=await pedido(db),id='60000000-0000-0000-0000-000000000009';
 const custo=()=>db.query('select fin_custo_evento($1,$2,$3,$4,120.50,null,$5)',[empresa,p,'frete','Frete do evento',id]);await custo();await custo();
 assert.equal((await db.query('select count(*)::int n from fin_custos_evento')).rows[0].n,1);
 await assert.rejects(db.query('select fin_custo_evento($1,$2,$3,$4,121,null,$5)',[empresa,p,'frete','Frete do evento',id]),/Identificador/);
 await db.query('select fin_custos_revisar($1,$2)',[empresa,p]);
 let dados=(await db.query("select fin_resultado_eventos($1,'2026-10-01','2026-10-31') b",[empresa])).rows[0].b;
 assert.equal(Number(dados.eventos[0].custos),120.50);assert.equal(dados.eventos[0].custos_revisados,true);
 await db.query("select fin_custo_evento($1,$2,'equipe','Equipe de montagem',80)",[empresa,p]);
 dados=(await db.query("select fin_resultado_eventos($1,'2026-10-01','2026-10-31') b",[empresa])).rows[0].b;assert.equal(dados.eventos[0].custos_revisados,false);assert.equal(Number(dados.eventos[0].custos),200.50);
 await db.exec("set test.negar='sim'");await assert.rejects(custo(),/permiss/);await db.exec("set test.negar=''");
 await assert.rejects(db.query("select fin_resultado_eventos('10000000-0000-0000-0000-000000000002','2026-10-01','2026-10-31')"),/permiss/);
}finally{await db.close();}});
test('acervo: coleta bloqueia peças, inspeção libera, custo entra no evento',async()=>{const db=await fixture();try{
 const p=await pedido(db),itens=[{chave:'linha|'+item,item_id:item,previsto:10,coletado:8,danificado:2,nao_coletado:2}];
 await db.query("insert into logistica_confirmacoes(empresa_id,pedido_id,etapa,versao,criado_por,responsavel,itens) values($1,$2,'coleta',1,$1,'Equipe',$3)",[empresa,p,itens]);
 const rows=(await db.query('select * from acervo_retornos order by tipo')).rows;assert.equal(rows.length,3);assert.equal((await db.query('select sum(quantidade)::int n from operacao_indisponiveis($1,current_date)',[empresa])).rows[0].n,10);
 await db.query("update separacoes_pedidos set operacao='{"+'"retorno":{"concluido_em":"2026-10-24"},"descarregamento":{"concluido_em":"2026-10-24"}}'+"' where id=$1",[p]);
 let a=(await db.query("select * from acervo_retornos where tipo='avaria'")).rows[0];assert.equal(a.estado,'triagem');
 const mover=async(dest,custo=0)=>{a=(await db.query('select acervo_movimentar($1,$2,$3,$4,$5,$6) a',[empresa,a.id,a.versao,dest,'Conferido pela equipe de qualidade',custo])).rows[0].a;};
 await assert.rejects(mover('liberado'),/Transição/);await mover('reparo',50);await mover('inspecao');await mover('liberado');
 assert.equal((await db.query('select count(*)::int n from qualidade_inspecoes')).rows[0].n,1);assert.equal(Number((await db.query('select sum(valor) n from fin_custos_evento')).rows[0].n),50);
 assert.equal((await db.query('select sum(quantidade)::int n from operacao_indisponiveis($1,current_date)',[empresa])).rows[0].n,8);
}finally{await db.close();}});
test('inventário: divergência justificada, saldo concorrente e aprovação única',async()=>{const db=await fixture();try{
 const id=(await db.query('select acervo_inventario_criar($1,$2,$3) id',[empresa,'Contagem de cadeiras',[item]])).rows[0].id;
 await assert.rejects(db.query('select acervo_inventario_aprovar($1,$2)',[empresa,id]),/contagens/);
 await assert.rejects(db.query('select acervo_inventario_contar($1,$2,$3,1,90,$4)',[empresa,id,item,'']),/Justifique/);
 const qualidade=(await db.query("select jsonb_object_agg(c->>'id',jsonb_build_object('resultado','conforme','observacao','')) q from acervo_inventarios, jsonb_array_elements(qualidade_criterios) c where id=$1",[id])).rows[0].q;await db.query('select acervo_inventario_conferir($1,$2,$3,1,90,$4,$5)',[empresa,id,item,'Ajuste de cadastro inicial',qualidade]);await db.query('select acervo_inventario_aprovar($1,$2)',[empresa,id]);assert.equal(Number((await db.query('select estoque_total from itens where id=$1',[item])).rows[0].estoque_total),90);
 await assert.rejects(db.query('select acervo_inventario_aprovar($1,$2)',[empresa,id]),/encerrado/);
 const novo=(await db.query('select acervo_inventario_criar($1,$2,$3) id',[empresa,'Nova contagem',[item]])).rows[0].id;await db.query('select acervo_inventario_conferir($1,$2,$3,1,95,$4,$5)',[empresa,novo,item,'Cinco pe\u00e7as n\u00e3o cadastradas',qualidade]);await db.query('update itens set estoque_total=91 where id=$1',[item]);await assert.rejects(db.query('select acervo_inventario_aprovar($1,$2)',[empresa,novo]),/estoque mudou/);
}finally{await db.close();}});
