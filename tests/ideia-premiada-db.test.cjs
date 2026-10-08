// Run with IDEIA_PGLITE_MODULE pointing to an installed @electric-sql/pglite.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.IDEIA_PGLITE_MODULE || '@electric-sql/pglite');
const uuid = n => '00000000-0000-0000-0000-' + String(n).padStart(12,'0');

test('ideas: tenant boundaries, authorship, reviewer permissions, history and conflicts', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      create table empresas(id uuid primary key);
      create table usuarios(id uuid primary key,nome text);
      create table funcionarios_acesso(id uuid primary key,nome text);
      create table permissoes_catalogo(chave text primary key,modulo text,submodulo text,acao text,descricao text,ordem integer);
      create table test_members(empresa uuid,usuario uuid,avaliador boolean default false,leitor boolean default false);
      create function funcionario_contexto(p_empresa_id uuid) returns jsonb language sql as $$
        select jsonb_build_object('ativo',exists(select 1 from test_members where empresa=p_empresa_id and usuario=auth.uid())) $$;
      create function funcionario_pode(p_empresa uuid,p_usuario uuid,p_chave text) returns boolean language sql as $$
        select exists(select 1 from test_members where empresa=p_empresa and usuario=p_usuario and
        case p_chave when 'rh.ideias.avaliar' then avaliador when 'rh.ideias.visualizar' then leitor else false end) $$;
      grant usage on schema public,auth to authenticated;
      insert into empresas values ('${uuid(1)}'),('${uuid(2)}');
      insert into auth.users values ('${uuid(11)}','author@test'),('${uuid(12)}','rh@test'),('${uuid(13)}','other@test'),('${uuid(14)}','reader@test');
      insert into usuarios values ('${uuid(11)}','Real author');
      insert into test_members values ('${uuid(1)}','${uuid(11)}',false,false),('${uuid(1)}','${uuid(12)}',true,true),('${uuid(2)}','${uuid(13)}',true,true),('${uuid(1)}','${uuid(14)}',false,true);
    `);
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261008000600_ideia_premiada.sql'),'utf8'));
    const login = n => db.query("select set_config('test.uid',$1,false)",[uuid(n)]);
    const dados = {titulo:'Useful improvement',area:'Operations',problema:'A recurring difficulty',proposta:'A practical improvement',beneficio:'Save time for the team',autor_nome:'Forged name',status:'premiada'};
    const list = async (all=false,company=1) => (await db.query('select ideias_premiadas_listar($1,$2) as ideias',[uuid(company),all])).rows[0].ideias;
    const evaluate = (id,stamp,status='selecionada',feedback='We will test it') => db.query('select ideias_premiadas_avaliar($1,$2,$3,$4,$5,$6) as ideia',[uuid(1),id,status,feedback,'',stamp]);
    await login(11);
    const id=(await db.query('select ideias_premiadas_enviar($1,$2) as id',[uuid(1),dados])).rows[0].id;
    let ideas=await list();const stamp=ideas[0].updated_at;
    assert.equal(ideas.length,1);assert.equal(ideas[0].autor_nome,'Real author');assert.equal(ideas[0].status,'recebida');
    await assert.rejects(list(true),/Sem perm/);await assert.rejects(evaluate(id,stamp),/Sem perm/);
    await assert.rejects(db.query('select ideias_premiadas_enviar($1,$2)',[uuid(1),{...dados,titulo:'   '}]),/check constraint/);
    await login(13);await assert.rejects(list(),/Acesso inativo/);await assert.rejects(db.query('select ideias_premiadas_enviar($1,$2)',[uuid(1),dados]),/Acesso inativo/);
    await login(14);assert.equal((await list(true)).length,1);await assert.rejects(evaluate(id,stamp),/Sem perm/);
    await login(12);assert.equal((await list()).length,0);
    await assert.rejects(evaluate(id,stamp,'premiada',''),/retorno/);
    const updated=(await evaluate(id,stamp)).rows[0].ideia;assert.equal(updated.status,'selecionada');
    await assert.rejects(evaluate(id,stamp),/outra pessoa/);
    assert.equal((await db.query('select count(*)::int as n from ideias_premiadas_historico')).rows[0].n,1);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from ideias_premiadas'),/permission denied/);
    await assert.rejects(db.query("update ideias_premiadas set status='premiada'"),/permission denied/);
    await db.exec('reset role');await login(11);ideas=await list();assert.equal(ideas[0].retorno,'We will test it');
    await db.query("select set_config('test.uid','',false)");await assert.rejects(list(),/Acesso inativo/);
  } finally { await db.close(); }
});
