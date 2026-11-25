const fs=require('node:fs'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite');
(async()=>{const db=new PGlite(),a='10000000-0000-0000-0000-000000000001',b='10000000-0000-0000-0000-000000000002';try{
 await db.exec(`create role anon;create role authenticated;create table empresas(id uuid primary key);insert into empresas values('${a}'),('${b}');
 create function eh_membro_empresa(uuid) returns boolean language sql as $$select $1=current_setting('test.empresa',true)::uuid$$;
 create function seguranca_2fa_ok() returns boolean language sql as $$select current_setting('test.segundo_fator',true)='sim'$$;
 create function operacao_pode(uuid,text) returns boolean language sql as $$select current_setting('test.editar',true)='sim' and $2='configuracoes.empresa.editar'$$;
 grant usage on schema public to authenticated;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261116102201_acervo_sinalizacoes.sql','utf8'));
 await db.exec(`set role authenticated;set test.empresa='${a}';set test.segundo_fator='sim';set test.editar='sim';`);
 await db.query('insert into acervo_sinalizacoes_config(empresa_id,regras) values($1,$2)',[a,JSON.stringify({manutencao:{mostrar:true,dias:7}})]);
 await assert.rejects(db.query('insert into acervo_sinalizacoes_config(empresa_id) values($1)',[b]),/row-level security/);
 assert.equal((await db.query('select * from acervo_sinalizacoes_config')).rows.length,1);
 await db.exec("set test.editar='nao';");assert.equal((await db.query("update acervo_sinalizacoes_config set regras='{}' returning *")).rows.length,0);
 assert.equal((await db.query('select regras from acervo_sinalizacoes_config')).rows[0].regras.manutencao.dias,7);
 await db.exec("set test.segundo_fator='nao';");assert.equal((await db.query('select * from acervo_sinalizacoes_config')).rows.length,0);
 await db.exec(`set test.segundo_fator='sim';set test.empresa='${b}';`);assert.equal((await db.query('select * from acervo_sinalizacoes_config')).rows.length,0);
 console.log('OK: migração, configuração persistida por empresa, isolamento, permissão de edição e 2FA.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
