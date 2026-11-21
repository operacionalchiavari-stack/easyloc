const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('uso de BV e crédito é persistente, não duplica, valida saldo e estorna ao remover ou cancelar',async()=>{
 const db=new PGlite(),emp='10000000-0000-0000-0000-000000000001',cli='20000000-0000-0000-0000-000000000001';
 try{
  await db.exec(`create schema auth;create role anon;create role authenticated;
   create function auth.uid() returns uuid language sql as $$select '${cli}'::uuid$$;
   create function eh_membro_empresa(uuid) returns boolean language sql as $$select $1='${emp}'::uuid$$;
   create function funcionario_pode(uuid,uuid,text) returns boolean language sql as $$select coalesce(current_setting('test.negar',true),'')<>'sim'$$;
   create function operacao_pode(uuid,text) returns boolean language sql security definer as $$select funcionario_pode($1,auth.uid(),$2)$$;
   create table empresas(id uuid primary key);insert into empresas values('${emp}');
   create table clientes_empresas(id uuid primary key,empresa_id uuid,nome_razao text);insert into clientes_empresas values('${cli}','${emp}','Cliente');
   create table separacoes_pedidos(id uuid primary key default gen_random_uuid(),empresa_id uuid,cliente_id uuid,cliente_nome text,numero_pedido text,
    data_evento date,valor_total numeric,status text default 'pendente',status_comercial text default 'orcamento',observacoes jsonb,criado_em timestamptz default now());
   create table fin_bv_partes(pagar_id uuid,empresa_id uuid,cliente_id uuid,ativo boolean);`);
  await db.exec(fs.readFileSync('supabase/migrations/20261018000100_financeiro.sql','utf8'));
  const compensacoes=fs.readFileSync('supabase/migrations/20261024001000_compensacoes_resultados.sql','utf8');
  await db.exec(compensacoes.slice(0,compensacoes.indexOf('create function public.fin_credito_compensar(')));
  await db.exec(fs.readFileSync('supabase/migrations/20261117000400_pedido_uso_saldo_cliente.sql','utf8'));
  const fonte=async(origem,valor)=>{
   const id=(await db.query(`insert into fin_pagar(empresa_id,fornecedor_id,origem,valor,descricao,emissao,vencimento) values($1,$2,$3,$4,'Saldo','2026-11-01','2026-11-17') returning id`,[emp,cli,origem,valor])).rows[0].id;
   if(origem==='bv')await db.query('insert into fin_bv_partes values($1,$2,$3,true)',[id,emp,cli]);return id;
  };
  const b1=await fonte('bv',3000),b2=await fonte('bv',3060.94),c1=await fonte('credito_cliente',200.25);
  const saldo=async()=> (await db.query('select pedido_saldo_conta_cliente($1,$2) s',[emp,cli])).rows[0].s;
  const cfg=(bv,credito)=>({pagamento_config:{usoSaldoConta:true,descontoBV:0,abatidoBV:bv,creditoCliente:credito}});
  const criar=async(obs)=> (await db.query(`insert into separacoes_pedidos(empresa_id,cliente_id,numero_pedido,valor_total,observacoes) values($1,$2,'19',10000,$3) returning id`,[emp,cli,obs])).rows[0].id;
  const salvar=(id,obs)=>db.query('update separacoes_pedidos set observacoes=$2 where id=$1',[id,obs]);
  const p=await criar(cfg(5000,100.25));
  let s=await saldo();assert.equal(s.bv,1060.94);assert.equal(s.credito,100);assert.deepEqual(s.aplicacoes,[{pedido_id:p,bv:5000,credito:100.25}]);
  const contar=async()=>Number((await db.query('select count(*) n from fin_pedido_abatimentos')).rows[0].n);
  const registros=await contar();await salvar(p,cfg(5000,100.25));assert.equal(await contar(),registros,'salvar duas vezes não duplica');
  await assert.rejects(criar(cfg(1061,0)),/BV insuficiente/);
  await assert.rejects(criar(cfg(0,100.01)),/Crédito insuficiente/);
  await assert.rejects(criar(cfg(-1,0)),/inválidos/);
  await assert.rejects(criar(cfg(.001,0)),/inválidos/);
  await assert.rejects(criar(cfg('NaN',0)),/inválidos/);
  assert.equal((await saldo()).bv,1060.94,'transação rejeitada não consome saldo');
  await assert.rejects(salvar(p,cfg(5000,201)),/Crédito insuficiente/);assert.equal((await saldo()).bv,1060.94);
  await db.exec("set test.negar='sim'");await assert.rejects(salvar(p,cfg(5001,0)),/permissão/);await db.exec("set test.negar=''");
  await salvar(p,cfg(3000,0));s=await saldo();assert.equal(s.bv,3060.94);assert.equal(s.credito,200.25);
  const usado=(await db.query('select pagar_id from fin_pedido_abatimentos where pedido_id=$1 and estornado_em is null limit 1',[p])).rows[0].pagar_id;
  await assert.rejects(db.query("update fin_pagar set status='cancelado' where id=$1",[usado]),/saldo já foi usado/);
  await db.query("update separacoes_pedidos set status_comercial='cancelado' where id=$1",[p]);
  s=await saldo();assert.equal(s.bv,6060.94);assert.equal(s.credito,200.25);assert.equal(s.aplicacoes.length,0);
  await assert.rejects(criar(cfg(0,201)),/Crédito insuficiente/);
  const legado=await criar({pagamento_config:{descontoBV:5000,creditoCliente:100}});
  assert.equal((await saldo()).bv,6060.94,'nenhum débito retroativo em pedidos antigos');
  await salvar(legado,cfg(0,200.25));assert.equal((await saldo()).credito,0);
  await assert.rejects(criar(cfg(0,.01)),/Crédito insuficiente/);
  await salvar(legado,cfg(0,0));assert.equal((await saldo()).credito,200.25);
  assert.equal(Number((await db.query('select count(*) n from fin_baixas')).rows[0].n),0,'nenhum pagamento bancário fictício');
  assert.equal((await db.query('select count(*) n from fin_pedido_abatimentos where estornado_em is not null')).rows[0].n>0,true,'histórico preservado');
 }finally{await db.close();}
});
