const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite'),cx=require('../js/shared/complexidade');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
async function fixture(){
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function eh_membro_empresa(uuid) returns boolean language sql stable as $$select $1='${id(1)}'::uuid and auth.uid() in ('${id(10)}','${id(11)}')$$;
 create function seguranca_2fa_ok() returns boolean language sql stable as $$select coalesce(current_setting('test.twofa',true),'on')<>'off'$$;
 create function operacao_pode(uuid,text) returns boolean language sql stable as $$select eh_membro_empresa($1) and (auth.uid()='${id(10)}'::uuid or $2 like '%.visualizar')$$;
 create table empresas(id uuid primary key);insert into empresas values('${id(1)}'),('${id(2)}');
 create table clientes_empresas(id uuid primary key,empresa_id uuid,tags jsonb);
 create table locais_empresas(id uuid primary key,empresa_id uuid,tags jsonb);
 create table itens(id uuid primary key,empresa_id uuid,familia text,categoria text,produto_base text,material text);
 create table separacoes_pedidos(id uuid primary key,empresa_id uuid,numero_pedido text,cliente_nome text,local_nome text,cliente_id uuid,local_id uuid,data_evento date,tipo_evento text,status_comercial text,observacoes jsonb,pedido_origem_id uuid,criado_em timestamptz default now(),encerrado_operacional_em timestamptz);
 create table separacoes_itens(separacao_pedido_id uuid,item_id uuid,quantidade_solicitada numeric);
 create table operacao_etapas(id uuid,empresa_id uuid,pedido_id uuid,tipo text,data date,hora time);
 create table operacao_etapa_caminhoes(etapa_id uuid,empresa_id uuid,caminhao_id uuid);
 create table fin_receber(id uuid,empresa_id uuid,pedido_id uuid);
 create table fin_baixas(id uuid,empresa_id uuid,receber_id uuid,valor numeric,created_at timestamptz,estornado_em timestamptz);
 create table personalizacoes(id uuid,empresa_id uuid,tipo text,producao_etapas jsonb);
 create table producao_itens(id uuid,empresa_id uuid,pedido_id uuid,origem jsonb,revisao boolean,cancelado boolean);
 create table producao_etapas(producao_item_id uuid,empresa_id uuid,setor text,estado text);
 create function operacao_conferencia_pecas(uuid,boolean) returns table(item_id uuid,esperado numeric) language sql as $$select item_id,quantidade_solicitada from separacoes_itens where separacao_pedido_id=$1$$;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261031007000_complexidade_automatica.sql','utf8'));
 await db.exec(`insert into clientes_empresas values('${id(20)}','${id(1)}','{}','{"reclamacao":false}');
 insert into locais_empresas values('${id(21)}','${id(1)}','{"observacoes":["Tem escadas"]}','{"baldeacao":false,"escada":false,"distancia_manual_m":0}');
 insert into itens values('${id(22)}','${id(1)}','Mesas','Mesas','Mesa','Madeira','{"fragil":false,"sob_medida":false,"volumoso":false}');
 insert into separacoes_pedidos(id,empresa_id,numero_pedido,cliente_nome,local_nome,cliente_id,local_id,data_evento,tipo_evento,status_comercial,observacoes) values
 ('${id(30)}','${id(1)}','101','Cliente','Local','${id(20)}','${id(21)}','2026-11-04','Casamento','aprovado','{"valores":{"locacao_bv":1000}}'),
 ('${id(31)}','${id(2)}','102','Outro cliente','Outro local',null,null,'2026-11-04','Feira','aprovado','{}');
 insert into separacoes_itens values('${id(30)}','${id(22)}',10);
 insert into operacao_etapas values('${id(40)}','${id(1)}','${id(30)}','carregamento','2026-11-02','08:00'),('${id(41)}','${id(1)}','${id(30)}','montagem','2026-11-04','10:00');
 insert into operacao_etapa_caminhoes values('${id(40)}','${id(1)}','${id(50)}');
 select set_config('test.uid','${id(10)}',false);`);
 return db;
}
const contexto=async db=>(await db.query('select complexidade_contexto($1,$2) c',[id(1),id(30)])).rows[0].c;
test('banco: contextos isolados por empresa, pesos iguais ao motor e dados sensíveis fora da resposta',async()=>{
 const db=await fixture();try{
 const c=await contexto(db);assert.deepEqual(c.config,cx.padrao());assert.equal(c.pecas[0].quantidade,10);assert.equal(c.caminhoes,1);assert.equal(c.cliente.complexidade.reclamacao,false);
 await db.exec('set role anon');await assert.rejects(db.query('select complexidade_contextos($1)',[id(1)]),/permission denied/);
 await db.exec('reset role;set role authenticated');await assert.rejects(db.query('select complexidade_contexto($1,$2)',[id(1),id(30)]),/permission denied/);
 await db.exec('reset role;set role service_role');const l=(await db.query('select complexidade_contextos($1) c',[id(1)])).rows[0].c;assert.equal(l.length,1);assert.equal(l[0].id,id(30));assert.doesNotMatch(JSON.stringify(l),/cpf|telefone|email/);
 }finally{await db.close();}
});
test('banco: exceções exigem permissão, motivo, empresa e 2FA; ajustes e volta ao automático ficam auditados',async()=>{
 const db=await fixture();try{
 await db.exec('set role authenticated');
 const save=d=>db.query('select complexidade_salvar_excecoes($1,$2,$3,$4)',[id(1),id(30),d,'Acesso especial do evento']);
 await save({respostas:{16:true},viagens:2,montagem_aplica:true});
 await db.exec('reset role');let c=await contexto(db);assert.equal(cx.avaliar(c).respostas[16].valor,true);assert.equal(c.local.complexidade.escada,false);
 await db.exec(`set role authenticated;select set_config('test.uid','${id(11)}',false);`);await assert.rejects(save({respostas:{16:false}}),/permiss/);
 await db.exec(`select set_config('test.uid','${id(10)}',false);select set_config('test.twofa','off',false);`);await assert.rejects(save({respostas:{}}),/permiss/);
 await db.exec("select set_config('test.twofa','on',false)");
 await assert.rejects(db.query('select complexidade_salvar_excecoes($1,$2,$3,$4)',[id(2),id(31),{},'Motivo válido']),/permiss/);
 await assert.rejects(save({respostas:{27:true}}),/inv/);await assert.rejects(save({respostas:{16:'false'}}),/inv/);await assert.rejects(save({viagens:0}),/viagens/);
 await save({respostas:{},viagens:1});await db.exec('reset role');c=await contexto(db);assert.equal(cx.avaliar(c).respostas[16].valor,false);assert.equal((await db.query('select count(*)::int n from complexidade_historico')).rows[0].n,2);
 }finally{await db.close();}
});
test('banco: encerramento congela fontes, exceções e parâmetros; mudanças futuras não alteram o histórico',async()=>{
 const db=await fixture();try{
 await db.exec(`update separacoes_pedidos set status_comercial='finalizado' where id='${id(30)}'`);
 const antes=await contexto(db);assert.ok(antes.congelado_em);
 await db.exec(`update locais_empresas set complexidade='{"escada":true}';update clientes_empresas set complexidade='{"reclamacao":true}';update itens set complexidade='{"fragil":true}';`);
 await db.query('select complexidade_config_salvar($1,$2)',[id(1),{...cx.padrao(),limite_pecas:1}]);
 const depois=await contexto(db);assert.deepEqual(depois,antes);assert.deepEqual(cx.avaliar(depois),cx.avaliar(antes));
 await assert.rejects(db.query('select complexidade_salvar_excecoes($1,$2,$3,$4)',[id(1),id(30),{respostas:{16:true}},'Mudar avaliação encerrada']),/encerrada/);
 assert.equal((await db.query('select count(*)::int n from complexidade_fechamentos')).rows[0].n,1);
 }finally{await db.close();}
});
test('banco: valida dados reutilizáveis e parâmetros, preservando falso e desconhecido',async()=>{
 const db=await fixture();try{
 await assert.rejects(db.exec("update locais_empresas set complexidade='{\"escada\":\"false\"}'"),/Informe/);
 await assert.rejects(db.exec("update locais_empresas set complexidade='{\"distancia_manual_m\":-1}'"),/Dist/);
 await db.exec("update locais_empresas set complexidade='{\"escada\":null}'");assert.equal((await contexto(db)).local.complexidade.escada,null);
 const save=c=>db.query('select complexidade_config_salvar($1,$2)',[id(1),c]);
 await assert.rejects(save({...cx.padrao(),limite_pecas:-1}),/Limite/);await assert.rejects(save({...cx.padrao(),dias_expediente:[8]}),/dias/);
 await assert.rejects(save({...cx.padrao(),pesos:{1:{sim:-2,nao:0}}}),/Pesos/);
 await save({...cx.padrao(),limite_pecas:5});assert.equal((await contexto(db)).config.limite_pecas,5);
 }finally{await db.close();}
});
