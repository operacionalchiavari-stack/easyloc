const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
test('BV: percentual individual, aprovação, pagamentos, estorno, histórico e isolamento', async () => {
  const db = new PGlite();
  const emp = '10000000-0000-0000-0000-000000000001', outro = '10000000-0000-0000-0000-000000000002';
  const cli = '20000000-0000-0000-0000-000000000001', pedido = '30000000-0000-0000-0000-000000000001';
  try {
    await db.exec(`create schema auth;create role anon;create role authenticated;
      create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
      create function eh_membro_empresa(uuid) returns boolean language sql as $$select $1='${emp}'::uuid$$;
      create function funcionario_pode(uuid,uuid,text) returns boolean language sql as $$select $1='${emp}'::uuid and coalesce(current_setting('test.negar',true),'')<>'sim'$$;
      create table empresas(id uuid primary key);
      create table clientes_empresas(id uuid primary key,empresa_id uuid,nome_razao text,catalogo_logo_url text);
      create table separacoes_pedidos(id uuid primary key,empresa_id uuid,cliente_id uuid,cliente_nome text,numero_pedido text,
        data_evento date,valor_total numeric,status_comercial text,observacoes jsonb,criado_em timestamptz default clock_timestamp());
      insert into empresas values('${emp}'),('${outro}');
      insert into clientes_empresas values('${cli}','${emp}','Decoradora Um');`);
    await db.exec(fs.readFileSync('supabase/migrations/20261018000100_financeiro.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20261021001700_decorador_bv.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20261021001800_bv_vigencia_cadastro.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20261021001900_bv_foto_decorador.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20261021002000_conta_cliente_creditos.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20261021002100_saldo_cliente_comercial.sql','utf8'));
    await assert.rejects(db.exec(`update clientes_empresas set bv_recebe=true,bv_percentual=101`), /check constraint/);
    await db.exec(`update clientes_empresas set bv_recebe=true,bv_percentual=10;
      insert into separacoes_pedidos values('${pedido}','${emp}','${cli}','Decoradora Um','2123','2026-10-25',11500,'orcamento',
        '{"valores":{"locacao_bv":10000,"locacao":10500,"frete":500,"montagem":500}}');`);
    assert.equal((await db.query('select count(*)::int n from fin_bv_comissoes')).rows[0].n,0);
    await db.exec(`update separacoes_pedidos set status_comercial='aprovado'`);
    let b=(await db.query('select * from fin_bv_comissoes')).rows[0];
    assert.equal(Number(b.base_locacao),10000);assert.equal(Number(b.valor),1000);
    const titulo=b.pagar_id;
    await db.exec(`update clientes_empresas set bv_percentual=20;update separacoes_pedidos set valor_total=valor_total;`);
    b=(await db.query('select * from fin_bv_comissoes')).rows[0];
    assert.equal(Number(b.percentual),10);assert.equal(b.pagar_id,titulo);
    assert.equal((await db.query("select count(*)::int n from fin_pagar where origem='bv'")).rows[0].n,1);
    const conta=(await db.query(`insert into fin_contas(empresa_id,nome) values($1,'Conta teste') returning id`,[emp])).rows[0].id;
    const pagar=valor=>db.query(`select fin_baixar($1,'pagar',$2,'2026-10-21',$3,0,0,0,0,$4,'PIX','Pagamento BV') id`,[emp,titulo,valor,conta]);
    const baixa=(await pagar(400)).rows[0].id;
    let ext=(await db.query('select fin_bv_extrato($1,$2) e',[emp,cli])).rows[0].e;
    assert.ok(Object.hasOwn(ext.clientes[0],'catalogo_logo_url'));
    assert.equal(Number(ext.pedidos[0].pago),400);assert.equal(Number(ext.pedidos[0].saldo),600);assert.equal(ext.pagamentos.length,1);
    await assert.rejects(db.query("select fin_cliente_registrar_credito($1,$2,'pagamento_maior',0,'2026-10-21','Teste')",[emp,cli]),/válido/);
    await assert.rejects(db.query("select fin_cliente_registrar_credito($1,$2,'pagamento_maior',250,'2026-10-21',' ')",[emp,cli]),/motivo/);
    await assert.rejects(db.query("select fin_cliente_registrar_credito($1,$2,'pagamento_maior',250,'2026-10-21','Teste')",[outro,cli]),/Sem permissão/);
    const credito=(await db.query("select fin_cliente_registrar_credito($1,$2,'pagamento_maior',250,'2026-10-21','Pagamento excedente no pedido 2123') id",[emp,cli])).rows[0].id;
    let cc=(await db.query('select fin_conta_cliente_extrato($1,$2) e',[emp,cli])).rows[0].e;
    assert.equal(Number(cc.creditos[0].aberto),250);
    assert.equal(Number(cc.pedidos[0].saldo)+Number(cc.creditos[0].aberto),850);
    const devolucao=(await db.query("select fin_baixar($1,'pagar',$2,'2026-10-21',100,0,0,0,0,$3,'PIX','Devolução parcial') id",[emp,credito,conta])).rows[0].id;
    cc=(await db.query('select fin_conta_cliente_extrato($1,$2) e',[emp,cli])).rows[0].e;
    assert.equal(Number(cc.creditos[0].aberto),150);assert.equal(cc.pagamentos.length,2);
    const saldoComercial=(await db.query('select pedido_saldo_conta_cliente($1,$2) e',[emp,cli])).rows[0].e;
    assert.equal(Number(saldoComercial.bv),600);assert.equal(Number(saldoComercial.credito),150);assert.equal(Number(saldoComercial.total),750);
    await assert.rejects(db.query('select pedido_saldo_conta_cliente($1,$2)',[outro,cli]),/Sem permissão/);
    await db.query('select fin_estornar_baixa($1,$2,$3)',[emp,devolucao,'Revisar devolução']);
    cc=(await db.query('select fin_conta_cliente_extrato($1,$2) e',[emp,cli])).rows[0].e;
    assert.equal(Number(cc.creditos[0].aberto),250);
    await assert.rejects(db.query('select fin_conta_cliente_extrato($1,null)',[outro]),/Sem permissão/);
    await assert.rejects(pagar(601),/aberto|excede|maior|saldo/i);
    await assert.rejects(db.exec(`update separacoes_pedidos set status_comercial='cancelado'`),/Estorne/);
    await assert.rejects(db.exec(`update separacoes_pedidos set observacoes='{"valores":{"locacao_bv":100}}'`),/menor/);
    await assert.rejects(db.query('update fin_pagar set valor=9 where id=$1',[titulo]),/controlados/);
    await db.query('select fin_estornar_baixa($1,$2,$3)',[emp,baixa,'Revisão do pagamento']);
    ext=(await db.query('select fin_bv_extrato($1,$2) e',[emp,cli])).rows[0].e;
    assert.equal(Number(ext.pedidos[0].pago),0);assert.ok(ext.pagamentos[0].estornado_em);
    await db.exec(`update separacoes_pedidos set status_comercial='cancelado'`);
    assert.equal((await db.query('select fin_bv_extrato($1,$2) e',[emp,cli])).rows[0].e.pedidos[0].saldo,0);
    await db.exec(`update separacoes_pedidos set status_comercial='aprovado';
      update separacoes_pedidos set observacoes=jsonb_set(observacoes,'{pagamento_config}','{"descontoComercial":"1.000,00"}');`);
    assert.equal(Number((await db.query('select valor from fin_bv_comissoes')).rows[0].valor),900);
    await assert.rejects(db.query('select fin_bv_extrato($1,null)',[outro]),/Sem permissão/);
    await db.exec(`select set_config('test.negar','sim',false)`);
    await assert.rejects(db.query('select fin_bv_extrato($1,null)',[emp]),/Sem permissão/);
    await db.exec(`select set_config('test.negar','',false)`);
    await db.exec(`update clientes_empresas set bv_recebe=false,bv_percentual=0;
      insert into separacoes_pedidos select '30000000-0000-0000-0000-000000000002',empresa_id,cliente_id,cliente_nome,'2124',data_evento,valor_total,status_comercial,observacoes from separacoes_pedidos where id='${pedido}';
      update clientes_empresas set bv_recebe=true,bv_percentual=15;
      update separacoes_pedidos set valor_total=valor_total where numero_pedido='2124';`);
    assert.equal(Number((await db.query("select percentual from fin_bv_comissoes where pedido_id='30000000-0000-0000-0000-000000000002'")).rows[0].percentual),0);
    // Ativar BV não alcança orçamentos criados antes, nem que sejam do mesmo dia.
    await db.exec(`update clientes_empresas set bv_recebe=false,bv_percentual=0`);
    const criar=async(numero,antes=false)=>{
      const id='30000000-0000-0000-0000-'+String(numero).padStart(12,'0');
      await db.query(`insert into separacoes_pedidos(id,empresa_id,cliente_id,cliente_nome,numero_pedido,data_evento,valor_total,status_comercial,observacoes,criado_em)
        select $1,empresa_id,cliente_id,cliente_nome,$2,data_evento,valor_total,'orcamento',observacoes,
        case when $3 then clock_timestamp()-interval '1 day' else clock_timestamp() end from separacoes_pedidos where id=$4`,[id,String(numero),antes,pedido]);
      return id;
    };
    const antigo=await criar(3,true);
    const hojeAntes=await criar(4);
    await db.exec(`update clientes_empresas set bv_recebe=true,bv_percentual=7.5`);
    const corte=(await db.query('select bv_vigente_desde from clientes_empresas')).rows[0].bv_vigente_desde;
    await db.query(`update separacoes_pedidos set status_comercial='aprovado' where id=any($1::uuid[])`,[[antigo,hojeAntes]]);
    for(const id of [antigo,hojeAntes])assert.equal(Number((await db.query('select percentual from fin_bv_comissoes where pedido_id=$1',[id])).rows[0].percentual),0);
    const novo=await criar(5);
    // Aprovação posterior usa a regra da criação, mesmo que o cadastro tenha outro percentual agora.
    await db.exec(`update clientes_empresas set bv_percentual=12`);
    await db.query(`update separacoes_pedidos set status_comercial='aprovado' where id=$1`,[novo]);
    assert.equal(Number((await db.query('select percentual from fin_bv_comissoes where pedido_id=$1',[novo])).rows[0].percentual),7.5);
    // Salvar outros dados não reinicia o início da vigência, e a data não pode ser adulterada.
    const antes=(await db.query('select bv_vigente_desde from clientes_empresas')).rows[0].bv_vigente_desde;
    await db.exec(`update clientes_empresas set nome_razao='Decoradora atualizada',bv_vigente_desde='2000-01-01'`);
    assert.equal(String((await db.query('select bv_vigente_desde from clientes_empresas')).rows[0].bv_vigente_desde),String(antes));
    assert.ok(corte);
    await db.exec(`update clientes_empresas set bv_recebe=false`);
    const desativado=await criar(6);
    await db.exec(`update clientes_empresas set bv_recebe=true,bv_percentual=20`);
    await db.query(`update separacoes_pedidos set status_comercial='aprovado' where id=$1`,[desativado]);
    assert.equal(Number((await db.query('select percentual from fin_bv_comissoes where pedido_id=$1',[desativado])).rows[0].percentual),0);
    const reativado=await criar(7);
    await db.query(`update separacoes_pedidos set status_comercial='aprovado' where id=$1`,[reativado]);
    assert.equal(Number((await db.query('select percentual from fin_bv_comissoes where pedido_id=$1',[reativado])).rows[0].percentual),20);
  } finally { await db.close(); }
});
