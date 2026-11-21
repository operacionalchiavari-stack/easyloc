const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),{PGlite}=require('@electric-sql/pglite');
test('parâmetros: políticas acessíveis, autorização preservada e ordenação atômica',async()=>{
 const db=new PGlite(),emp='10000000-0000-0000-0000-000000000001',outra='10000000-0000-0000-0000-000000000002',a='20000000-0000-0000-0000-000000000001',b='20000000-0000-0000-0000-000000000002';
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated;
 create function auth.uid() returns uuid language sql as $$select '${emp}'::uuid$$;
 create function eh_membro_empresa(uuid) returns boolean language sql as $$select $1='${emp}'::uuid$$;
 create function seguranca_2fa_ok() returns boolean language sql as $$select current_setting('test.fator',true) is distinct from 'nao'$$;
 create function funcionario_pode(uuid,uuid,text) returns boolean language sql security definer as $$select eh_membro_empresa($1) and current_setting('test.editar',true) is distinct from 'nao'$$;
 revoke all on function funcionario_pode(uuid,uuid,text) from public,authenticated;
 create function operacao_pode(uuid,text) returns boolean language sql security definer set search_path=public as $$select funcionario_pode($1,auth.uid(),$2)$$;
 create table empresas(id uuid primary key);insert into empresas values('${emp}'),('${outra}');
 create table logistica_motivos(id uuid default gen_random_uuid(),empresa_id uuid,nome text);create table fin_posicao_motivos(like logistica_motivos including defaults);
 create table sistema_backups(empresa_id uuid);insert into sistema_backups values('${emp}'),('${outra}');create table sistema_erros_operacionais(like sistema_backups);insert into sistema_erros_operacionais values('${emp}');
 create table comercial_condicoes_pagamento(id uuid primary key,empresa_id uuid,ordem integer);insert into comercial_condicoes_pagamento values('${a}','${emp}',1),('${b}','${emp}',2);
 alter table logistica_motivos enable row level security;alter table fin_posicao_motivos enable row level security;alter table sistema_backups enable row level security;alter table sistema_erros_operacionais enable row level security;
 grant select,insert,update on logistica_motivos,fin_posicao_motivos to authenticated;grant select on sistema_backups,sistema_erros_operacionais to authenticated;
 create policy ler on logistica_motivos for select to authenticated using(eh_membro_empresa(empresa_id));create policy ler on fin_posicao_motivos for select to authenticated using(eh_membro_empresa(empresa_id));
 create policy motivos_criar on logistica_motivos for insert to authenticated with check(funcionario_pode(empresa_id,auth.uid(),'editar'));create policy motivos_editar on logistica_motivos for update to authenticated using(funcionario_pode(empresa_id,auth.uid(),'editar'));
 create policy fin_posicao_motivos_criar on fin_posicao_motivos for insert to authenticated with check(funcionario_pode(empresa_id,auth.uid(),'editar'));create policy fin_posicao_motivos_editar on fin_posicao_motivos for update to authenticated using(funcionario_pode(empresa_id,auth.uid(),'editar'));
 create policy backup_ler on sistema_backups for select to authenticated using(funcionario_pode(empresa_id,auth.uid(),'editar'));create policy sistema_erros_ler on sistema_erros_operacionais for select to authenticated using(funcionario_pode(empresa_id,auth.uid(),'editar'));`);
 await db.exec("set role authenticated");await assert.rejects(db.query('select * from sistema_backups'),/permission denied for function funcionario_pode/);await db.exec('reset role');
 await db.exec(fs.readFileSync('supabase/migrations/20261108001500_parametros_permissoes_reordenacao.sql','utf8'));await db.exec('set role authenticated');
 assert.equal((await db.query('select * from sistema_backups')).rows.length,1);assert.equal((await db.query('select * from sistema_erros_operacionais')).rows.length,1);
 for(const t of ['logistica_motivos','fin_posicao_motivos']){await db.query(`insert into ${t}(empresa_id,nome) values($1,$2)`,[emp,'Motivo de teste']);await assert.rejects(db.query(`insert into ${t}(empresa_id,nome) values($1,$2)`,[outra,'Outro']),/row-level security/);}
 await db.query('select comercial_condicoes_reordenar($1,$2)',[emp,[b,a]]);
 await assert.rejects(db.query('select comercial_condicoes_reordenar($1,$2)',[emp,[a,a]]),/inválida/);await assert.rejects(db.query('select comercial_condicoes_reordenar($1,$2)',[emp,[a]]),/lista mudou/);
 await db.exec("set test.editar='nao'");assert.equal((await db.query('select * from sistema_backups')).rows.length,0);await assert.rejects(db.query("insert into logistica_motivos(empresa_id,nome) values($1,'Sem acesso')",[emp]),/row-level security/);await assert.rejects(db.query('select comercial_condicoes_reordenar($1,$2)',[emp,[a,b]]),/permissão/);
 await db.exec("set test.editar='sim';set test.fator='nao'");assert.equal((await db.query('select * from sistema_backups')).rows.length,0);await assert.rejects(db.query('select comercial_condicoes_reordenar($1,$2)',[emp,[a,b]]),/permissão/);
 await db.exec('reset role');assert.deepEqual((await db.query('select id from comercial_condicoes_pagamento order by ordem')).rows.map(r=>r.id),[b,a]);
 }finally{await db.close();}
});
