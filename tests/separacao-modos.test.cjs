const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('modos de separacao: ativacao, acesso por funcionario e bloqueio na gravacao',async()=>{
 const db=new PGlite(),empresa='10000000-0000-0000-0000-000000000001',ator='20000000-0000-0000-0000-000000000001',outro='20000000-0000-0000-0000-000000000002',item='30000000-0000-0000-0000-000000000001';
 try{
 await db.exec(`create role authenticated;create role anon;create schema auth;grant usage on schema auth to authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.usuario',true),'')::uuid$$;
 create table empresas(id uuid primary key);insert into empresas values('${empresa}');
 create function eh_membro_empresa(uuid) returns boolean language sql as $$select auth.uid() is not null and $1='${empresa}'::uuid$$;
 create function operacao_pode(uuid,text) returns boolean language sql as $$select coalesce(current_setting('test.admin',true),'')='sim'$$;
 create table funcionarios_acesso(id uuid,empresa_id uuid,nome text,ativo boolean,acesso_sistema boolean);
 create table separacoes_pedidos(id uuid,empresa_id uuid);insert into separacoes_pedidos values('${item}','${empresa}');
 create table separacoes_itens(id uuid,separacao_pedido_id uuid);insert into separacoes_itens values('${item}','${item}');
 create table execucoes(modo text);
 create function operacao_atualizar_separacao(p_item uuid,p_dados jsonb,p_quantidade_anterior numeric,p_componentes_anteriores jsonb default '{}',p_etiqueta uuid default null) returns void language plpgsql security definer set search_path=public as $$declare i separacoes_itens;p separacoes_pedidos;begin
 select * into strict i from public.separacoes_itens where id=p_item;
  select * into strict p from public.separacoes_pedidos where id=i.separacao_pedido_id for update;
 insert into execucoes values(p_dados->>'modo_separacao');end$$;
 set test.usuario='${ator}';set test.admin='sim';`);
 await db.exec(fs.readFileSync('supabase/migrations/20261027000800_separacao_modos_permissoes.sql','utf8').replace(/^\uFEFF/,''));
 const modos=async()=>(await db.query('select separacao_modos_disponiveis($1) r',[empresa])).rows[0].r;
 assert.deepEqual(await modos(),{manual:true,qr:true,'um-clique':true});
 await db.query("insert into empresa_separacao_modos values($1,'manual',true,false,$2),($1,'qr',true,true,'{}'),($1,'um-clique',false,true,'{}')",[empresa,[ator]]);
 assert.deepEqual(await modos(),{manual:true,qr:true,'um-clique':false});
 const gravar=modo=>db.query('select operacao_atualizar_separacao($1,$2,0)',[item,{modo_separacao:modo}]);
 await gravar('manual');await gravar('qr');await assert.rejects(gravar('um-clique'),/nao esta liberado/);await assert.rejects(gravar('invalido'),/nao esta liberado/);
 await db.exec(`set test.usuario='${outro}';set test.admin='nao';set role authenticated;`);
 assert.equal((await modos()).manual,false);await assert.rejects(gravar('manual'),/nao esta liberado/);
 const alteracao=await db.query("update empresa_separacao_modos set ativo=true where empresa_id=$1 returning modo",[empresa]);assert.equal(alteracao.rows.length,0);assert.equal((await modos())['um-clique'],false);
 await db.exec('reset role');await db.exec("set test.usuario=''");await assert.rejects(modos(),/Sem acesso/);
 console.log('Sem dados de teste criados no Supabase.');
 }finally{await db.close();}
});
