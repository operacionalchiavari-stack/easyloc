const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('reabre conferência antes da entrega; mantém contagens e histórico; bloqueia app, check-in e entrega',async()=>{
 const db=new PGlite(),emp='10000000-0000-0000-0000-000000000001',ped='20000000-0000-0000-0000-000000000001';
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select '${emp}'::uuid$$;
 create function eh_membro_empresa(uuid) returns boolean language sql as $$select $1='${emp}'::uuid$$;
 create function seguranca_2fa_ok() returns boolean language sql as $$select true$$;
 create function funcionario_tabela_permitida(uuid,text,text) returns boolean language sql as $$select coalesce(current_setting('test.permitir',true),'sim')<>'nao'$$;
 create table separacoes_pedidos(id uuid,empresa_id uuid,status text,status_comercial text,status_operacional text,encerrado_operacional_em timestamptz,operacao jsonb,revisao int default 0,atualizado_em timestamptz);
 create table logistica_confirmacoes(pedido_id uuid,etapa text);
 create table operacao_etapas(id int,empresa_id uuid,pedido_id uuid,tipo text);
 create table operacao_apontamentos(etapa_id int,empresa_id uuid,inicio timestamptz);
 create table free_vagas(id int,etapa_id int,empresa_id uuid,status text);
 create table free_inscricoes(vaga_id int,empresa_id uuid,status text,checkin_em timestamptz);
 insert into separacoes_pedidos(id,empresa_id,status,status_comercial,status_operacional,operacao) values('${ped}','${emp}','separado','aprovado','carregado','{"carregamento":{"concluido_em":"2026-11-02","por":"Pessoa","quantidades":{"i1":4},"caminhoes":[{"id":"c1"}]}}');
 insert into operacao_etapas values(1,'${emp}','${ped}','montagem');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261103000900_expedicao_reabrir_conferencia.sql','utf8'));
 const reabrir=()=>db.query('select expedicao_reabrir_conferencia($1)',[ped]);
 const disponiveis=async()=>(await db.query('select expedicao_reaberturas_disponiveis($1) ids',[[ped]])).rows[0].ids;
 assert.deepEqual(await disponiveis(),[ped]);
 await db.exec("set test.permitir='nao'");await assert.rejects(reabrir(),/permissão/);assert.deepEqual(await disponiveis(),[]);await db.exec("set test.permitir='sim'");
 await db.query("insert into logistica_confirmacoes values($1,'entrega')",[ped]);await assert.rejects(reabrir(),/entrega já iniciou/);await db.exec('delete from logistica_confirmacoes');
 await db.query('insert into operacao_apontamentos values(1,$1,now())',[emp]);assert.deepEqual(await disponiveis(),[]);await assert.rejects(reabrir(),/entrega já iniciou/);await db.exec('delete from operacao_apontamentos');
 await db.query("insert into free_vagas values(1,1,$1,'ABERTA');",[emp]);await db.query("insert into free_inscricoes values(1,$1,'CONFIRMADO',now())",[emp]);await assert.rejects(reabrir(),/entrega já iniciou/);await db.exec('delete from free_inscricoes');
 await db.query("update separacoes_pedidos set operacao=jsonb_set(operacao,'{entrega}','{\"iniciado_em\":\"2026-11-02\"}')");await assert.rejects(reabrir(),/entrega já iniciou/);await db.exec("update separacoes_pedidos set operacao=operacao-'entrega'");
 await reabrir();const p=(await db.query('select * from separacoes_pedidos')).rows[0];
 assert.equal(p.status,'separado');assert.equal(p.status_operacional,null);assert.equal(p.operacao.carregamento.concluido_em,undefined);assert.equal(p.operacao.carregamento.quantidades.i1,4);assert.equal(p.operacao.carregamento.caminhoes[0].id,'c1');assert.ok(p.operacao.carregamento.iniciado_em);
 assert.equal(p.operacao.transferencias[0].conferencia_anterior.por,'Pessoa');assert.equal(p.revisao,1);await assert.rejects(reabrir(),/carregamento não está concluído/);
 }finally{await db.close();}
});
