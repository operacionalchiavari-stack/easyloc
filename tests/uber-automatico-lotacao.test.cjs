const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('Uber cobre excedente de pessoas, desconta pedidos manuais e nao duplica nem presume lotacao',async()=>{
 const db=new PGlite(),emp='10000000-0000-0000-0000-000000000001',cam='20000000-0000-0000-0000-000000000001',ped='30000000-0000-0000-0000-000000000001',loc='40000000-0000-0000-0000-000000000001',et='50000000-0000-0000-0000-000000000001';
 try{
 await db.exec(`create role anon;create role authenticated;
 create table empresas(id uuid primary key);insert into empresas values('${emp}');
 create function operacao_pode(uuid,text) returns boolean language sql as $$select true$$;
 create function seguranca_2fa_ok() returns boolean language sql as $$select true$$;
 create function escala_controle_pode(uuid) returns boolean language sql as $$select coalesce(current_setting('test.negar',true),'')<>'sim'$$;
 create table caminhoes(id uuid primary key,empresa_id uuid);insert into caminhoes values('${cam}','${emp}');
 create table separacoes_pedidos(id uuid primary key,empresa_id uuid,local_id uuid,status_comercial text,status text);
 insert into separacoes_pedidos values('${ped}','${emp}','${loc}','aprovado','pendente');
 create table operacao_etapas(id uuid primary key,empresa_id uuid,pedido_id uuid,tipo text,data date,hora time);
 insert into operacao_etapas values('${et}','${emp}','${ped}','montagem',(now() at time zone 'America/Sao_Paulo'+interval '2 hours')::date,(now() at time zone 'America/Sao_Paulo'+interval '2 hours')::time);
 create table operacao_etapa_pessoas(etapa_id uuid,nome text);insert into operacao_etapa_pessoas select '${et}', 'Pessoa '||i from generate_series(1,6)i;
 create table operacao_etapa_caminhoes(etapa_id uuid,caminhao_id uuid);insert into operacao_etapa_caminhoes values('${et}','${cam}');
 create table locais_empresas(id uuid,empresa_id uuid,endereco text,numero_endereco text,distancia_galpao_km numeric);
 insert into locais_empresas values('${loc}','${emp}','Rua do Evento','10',15);
 create table uber_vagas(id uuid default gen_random_uuid(),empresa_id uuid,etapa_id uuid,pedido_id uuid,quantidade int,ida_volta boolean,ponto_encontro text,destino text,km numeric,valor numeric,data date,hora time,obs text,status text default 'aberta');
 create function uber_valor_trecho(uuid,numeric) returns numeric language sql as $$select case when coalesce(current_setting('test.sem_tarifa',true),'')='sim' then 0 else 40 end$$;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261103001000_uber_automatico_lotacao.sql','utf8'));
 const cfg={ativa:true,montagem:true,desmontagem:true,passageiros_carro:4,antecedencia_horas:24,ponto_encontro:'Galpao',ida_volta:false,lugares_caminhoes:{[cam]:2}};
 const salvar=c=>db.query('select uber_automacao_salvar($1,$2)',[emp,JSON.stringify(c)]);
 const processar=async()=>Number((await db.query('select uber_automacao_processar() n')).rows[0].n);
 await salvar({...cfg,ativa:false});assert.equal(await processar(),0);
 await salvar(cfg);assert.equal(await processar(),1);
 assert.equal((await db.query('select quantidade from uber_vagas')).rows[0].quantidade,1);
 assert.equal(await processar(),0);
 await db.exec("update uber_vagas set status='cancelada'");assert.equal(await processar(),0,'cancelamento manual nao deve ser revertido');
 await db.exec('delete from uber_vagas');await salvar({...cfg,lugares_caminhoes:{}});assert.equal(await processar(),0);
 await salvar({...cfg,lugares_caminhoes:{[cam]:6}});assert.equal(await processar(),0);
 await salvar(cfg);await db.exec("set test.sem_tarifa='sim'");assert.equal(await processar(),0);await db.exec("set test.sem_tarifa='nao'");
 await db.exec(`insert into uber_vagas(etapa_id,quantidade) values('${et}',1)`);assert.equal(await processar(),0,'solicitacao manual ja cobre excedente');
 await db.exec('delete from uber_vagas');await salvar({...cfg,passageiros_carro:3});assert.equal(await processar(),1);
 assert.equal((await db.query('select quantidade from uber_vagas')).rows[0].quantidade,2);
 await assert.rejects(salvar({...cfg,lugares_caminhoes:{[cam]:-1}}),/lugares/);
 await db.exec("set test.negar='sim'");await assert.rejects(salvar(cfg),/permissao/);
 }finally{await db.close();}
});
