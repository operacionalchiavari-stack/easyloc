const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('rotas e equipes: persistencia, consulta sem escrita e isolamento entre empresas',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table empresas(id uuid primary key);create table acessos(usuario uuid,empresa uuid,editar boolean);
 grant usage on schema public,auth to authenticated;grant select on acessos to authenticated;
 create function funcionario_contexto(e uuid) returns jsonb language sql stable security definer as $$select jsonb_build_object('ativo',exists(select 1 from acessos where empresa=e and usuario=auth.uid()))$$;
 create function has_permission(e uuid,u uuid,k text) returns boolean language sql stable security definer as $$select exists(select 1 from acessos where empresa=e and usuario=u and (k like '%.visualizar' or editar))$$;
 insert into empresas values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
 insert into acessos values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',true),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111',false),('cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222',true);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261026000100_rotas_persistencia_supabase.sql','utf8'));
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
 insert into logistica_rotas(empresa_id,id,dados) values('11111111-1111-4111-8111-111111111111','r1','{"name":"Rota"}');
 insert into logistica_equipes_rotas(empresa_id,rota_id,dados) values('11111111-1111-4111-8111-111111111111','r1','{"roles":[{"employeeId":"p1"}]}');`);
 assert.equal((await db.query('select dados from logistica_equipes_rotas')).rows[0].dados.roles[0].employeeId,'p1');
 await db.exec(`select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false)`);
 assert.equal((await db.query('select * from logistica_rotas')).rows.length,1);
 await assert.rejects(db.exec(`insert into logistica_rotas(empresa_id,id) values('11111111-1111-4111-8111-111111111111','r2')`),/row.level security/i);
 await db.exec(`select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false)`);
 assert.equal((await db.query('select * from logistica_rotas')).rows.length,0);
 assert.equal((await db.query('select * from logistica_equipes_rotas')).rows.length,0);
 await assert.rejects(db.exec(`insert into logistica_equipes_rotas(empresa_id,rota_id) values('11111111-1111-4111-8111-111111111111','r1')`),/row.level security/i);
 }finally{await db.close();}
});
