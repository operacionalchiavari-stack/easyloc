const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('reabertura respeita triagem, acesso, conclusão e invalida recebimento sem baixar estoque',async()=>{
 const db=new PGlite(),emp='10000000-0000-0000-0000-000000000001',ped='20000000-0000-0000-0000-000000000001';
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select '${emp}'::uuid$$;
 create function eh_membro_empresa(uuid) returns boolean language sql as $$select $1='${emp}'::uuid$$;
 create function producao_permite(uuid,text) returns boolean language sql as $$select coalesce(current_setting('test.permitir',true),'sim')<>'nao'$$;
 create table separacoes_pedidos(id uuid,empresa_id uuid,status text,status_operacional text);
 create table producao_itens(id int,pedido_id uuid,empresa_id uuid,cancelado boolean,revisao boolean,origem jsonb);
 create table producao_etapas(id int,producao_item_id int,estado text,quantidade_feita numeric,iniciada_em timestamptz,concluida_em timestamptz,responsavel uuid);
 create table producao_historico(empresa_id uuid,pedido_id uuid,etapa_id int,acao text,usuario_id uuid,detalhes jsonb);
 create table separacao_producao_confirmacoes(empresa_id uuid,pedido_id uuid,item_id text);
 insert into separacoes_pedidos values('${ped}','${emp}','em_separacao',null);
 insert into producao_itens values(1,'${ped}','${emp}',false,false,'{"item_id":"torre"}');
 insert into producao_etapas values(1,1,'concluida',2,now(),now(),'${emp}');
 insert into separacao_producao_confirmacoes values('${emp}','${ped}','torre');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261103000600_producao_reabrir_antes_triagem.sql','utf8'));
 const reabrir=()=>db.query('select producao_reabrir($1,$2)',[emp,ped]);
 await db.exec("set test.permitir='nao'");await assert.rejects(reabrir(),/permissão/);await db.exec("set test.permitir='sim'");
 for(const status of ['separado','separado_com_divergencia']){
  await db.query('update separacoes_pedidos set status=$1',[status]);await assert.rejects(reabrir(),/triagem já finalizou/);
 }
 await db.exec("update separacoes_pedidos set status='em_separacao';update producao_etapas set estado='execucao'");
 await assert.rejects(reabrir(),/precisa estar concluída/);
 assert.equal((await db.query('select * from separacao_producao_confirmacoes')).rows.length,1);
 await db.exec("update producao_etapas set estado='concluida'");await reabrir();
 const e=(await db.query('select * from producao_etapas')).rows[0];assert.equal(e.estado,'pendente');assert.equal(Number(e.quantidade_feita),0);assert.equal(e.concluida_em,null);
 assert.equal((await db.query('select * from separacao_producao_confirmacoes')).rows.length,0);
 const h=(await db.query('select * from producao_historico')).rows;assert.equal(h.length,1);assert.equal(h[0].detalhes.quantidade_anterior,2);
 await assert.rejects(reabrir(),/precisa estar concluída/);
 }finally{await db.close();}
});
