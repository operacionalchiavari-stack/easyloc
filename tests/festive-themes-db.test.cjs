const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');

test('migração mantém a identidade existente, inicia sem tema e restringe a seleção',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create table configuracoes_empresa(empresa_id text primary key, cor_sidebar text, cor_destaque text);
      insert into configuracoes_empresa values ('e1','#123456','#246b48');
      alter table configuracoes_empresa enable row level security;`);
    const migration=fs.readFileSync('supabase/migrations/20261115001700_temas_festivos_sistema.sql','utf8');
    await db.exec(migration);await db.exec(migration);
    assert.deepEqual((await db.query('select * from configuracoes_empresa')).rows,[{empresa_id:'e1',cor_sidebar:'#123456',cor_destaque:'#246b48',tema_festivo:''}]);
    for(const theme of ['carnaval','natal','pascoa','ano_novo','']){
      await db.query('update configuracoes_empresa set tema_festivo=$1 where empresa_id=$2',[theme,'e1']);
      assert.equal((await db.query('select tema_festivo from configuracoes_empresa')).rows[0].tema_festivo,theme);
    }
    await assert.rejects(()=>db.query("update configuracoes_empresa set tema_festivo='outro'"),/configuracoes_empresa_tema_festivo_check/);
    await assert.rejects(()=>db.query('update configuracoes_empresa set tema_festivo=null'),/not-null constraint/);
    const period=fs.readFileSync('supabase/migrations/20261115001800_temas_festivos_periodo.sql','utf8');
    await db.exec(period);await db.exec(period);
    assert.equal((await db.query('select tema_festivo_inicio from configuracoes_empresa')).rows[0].tema_festivo_inicio,null);
    await db.query("update configuracoes_empresa set tema_festivo_inicio='2026-12-20',tema_festivo_fim='2026-12-25'");
    await assert.rejects(()=>db.query("update configuracoes_empresa set tema_festivo_fim='2026-12-19'"),/configuracoes_empresa_tema_periodo_check/);
    await assert.rejects(()=>db.query('update configuracoes_empresa set tema_festivo_fim=null'),/configuracoes_empresa_tema_periodo_check/);
    await db.query("update configuracoes_empresa set tema_festivo_fim='2026-12-20'");
    assert.equal((await db.query('select cor_sidebar from configuracoes_empresa')).rows[0].cor_sidebar,'#123456');
    assert.equal((await db.query("select relrowsecurity from pg_class where relname='configuracoes_empresa'")).rows[0].relrowsecurity,true);
  } finally {await db.close();}
});
