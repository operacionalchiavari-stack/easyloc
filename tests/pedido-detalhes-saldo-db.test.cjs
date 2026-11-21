const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('detalhamento soma os títulos do indicador, exclui cancelados/quitados e isola empresa/cliente',async()=>{
 const db=new PGlite(),emp='10000000-0000-0000-0000-000000000001',cli='20000000-0000-0000-0000-000000000001',pedido='30000000-0000-0000-0000-000000000001';
 try{
  await db.exec(`create schema auth;create role anon;create role authenticated;
   create function auth.uid() returns uuid language sql as $$select '${cli}'::uuid$$;
   create function eh_membro_empresa(uuid) returns boolean language sql as $$select $1='${emp}'::uuid$$;
   create function funcionario_pode(uuid,uuid,text) returns boolean language sql as $$select coalesce(current_setting('test.negar',true),'')<>'sim'$$;
   create function fin_pode(uuid,text) returns boolean language sql as $$select false$$;
   create table clientes_empresas(id uuid,empresa_id uuid);insert into clientes_empresas values('${cli}','${emp}');
   create table fin_pagar(id uuid default gen_random_uuid(),empresa_id uuid,fornecedor_id uuid,origem text,status text,aberto numeric,valor numeric,pago numeric,descricao text,observacoes text,emissao date,created_at timestamptz default now());
   create table fin_bv_partes(pagar_id uuid,empresa_id uuid,cliente_id uuid,pedido_id uuid,ativo boolean);
   create table separacoes_pedidos(id uuid,empresa_id uuid,numero_pedido text);insert into separacoes_pedidos values('${pedido}','${emp}','123');`);
  const sql=fs.readFileSync('supabase/migrations/20261031000200_bv_divisao_equipe.sql','utf8');const inicio=sql.indexOf('create or replace function public.pedido_saldo_conta_cliente(');await db.exec(sql.slice(inicio,sql.indexOf('end $$;',inicio)+7));
  await db.exec(fs.readFileSync('supabase/migrations/20261117000100_pedido_saldo_cliente_detalhes.sql','utf8'));
  for(const [origem,status,valor,ativo] of [['bv','aberto',100,true],['bv','aberto',500,false],['bv','cancelado',900,true],['bv','pago',0,true],['credito_cliente','aberto',25,true],['credito_cliente','cancelado',999,true]]){
   const t=(await db.query(`insert into fin_pagar(empresa_id,fornecedor_id,origem,status,aberto,valor,pago,descricao,emissao) values($1,$2,$3,$4,$5,$5,0,'Lançamento','2026-11-17') returning id`,[emp,cli,origem,status,valor])).rows[0].id;
   if(origem==='bv')await db.query('insert into fin_bv_partes values($1,$2,$3,$4,$5)',[t,emp,cli,pedido,ativo]);
  }
  const d=(await db.query('select pedido_saldo_conta_cliente_detalhes($1,$2) d',[emp,cli])).rows[0].d;
  assert.equal(d.bv,100);assert.equal(d.credito,25);assert.equal(d.lancamentos.length,2);assert.equal(d.lancamentos.find(l=>l.origem==='bv').numero_pedido,'123');assert.equal(d.lancamentos.reduce((s,l)=>s+l.aberto,0),d.total);
  await assert.rejects(db.query('select pedido_saldo_conta_cliente_detalhes($1,$2)',[cli,cli]),/permissão/);
  await assert.rejects(db.query('select pedido_saldo_conta_cliente_detalhes($1,$2)',[emp,pedido]),/Cliente não encontrado/);
  await db.exec("set test.negar='sim'");await assert.rejects(db.query('select pedido_saldo_conta_cliente_detalhes($1,$2)',[emp,cli]),/permissão/);
 }finally{await db.close()}
});
