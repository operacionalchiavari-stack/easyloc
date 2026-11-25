const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const empresa = '10000000-0000-0000-0000-000000000001';
const outra = '10000000-0000-0000-0000-000000000002';
const pedido = '20000000-0000-0000-0000-000000000001';
const datas = { data_entrega: '2026-11-30', data_evento: '2026-12-01', data_evento_fim: null, data_coleta: '2026-12-02' };
const novas = { data_entrega: '2026-12-03', data_evento: '2026-12-04', data_evento_fim: null, data_coleta: '2026-12-05' };

test('editar datas confirma a mesma gravação, mantém os itens, valida período, concorrência e permissões', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function eh_membro_empresa(uuid) returns boolean language sql as $$select $1='${empresa}'::uuid$$;
      create function seguranca_2fa_ok() returns boolean language sql as $$select current_setting('test.segundo_fator',true) is distinct from 'nao'$$;
      create function operacao_pode(uuid,text) returns boolean language sql as $$select $2=any(string_to_array(current_setting('test.permissoes',true),','))$$;
      create function comercial_followup_nome() returns text language sql as $$select 'Ana Comercial'::text$$;
      create table empresas(id uuid primary key);
      create table comercial_prod_config(empresa_id uuid primary key,config jsonb default '{}');
      create table separacoes_pedidos(id uuid primary key,empresa_id uuid,pedido_origem_id uuid,revisao bigint default 1,status_comercial text,data_entrega date,data_evento date,data_evento_fim date,data_coleta date,data_hora timestamptz,observacoes jsonb,valor_total numeric);
      create table separacoes_itens(id uuid,empresa_id uuid,separacao_pedido_id uuid,item_id uuid,quantidade_solicitada numeric,quantidade_separada numeric);
      create table chamadas(tipo text,dados jsonb);
      insert into empresas values('${empresa}'),('${outra}');
      insert into separacoes_pedidos values('${pedido}','${empresa}',null,1,'aprovado','2026-11-30','2026-12-01',null,'2026-12-02','2026-12-01T12:00:00Z','{"contrato":"preservar","financeiro":{"valor":500}}',500);
      insert into separacoes_itens values('${pedido}','${empresa}','${pedido}','${pedido}',4,2);
      create function operacao_validar_reserva(uuid,uuid,jsonb,date,date) returns void language plpgsql as $$begin
        if current_setting('test.estoque',true)='insuficiente' then raise exception 'Estoque insuficiente';end if;
        insert into chamadas values('reserva',jsonb_build_object('inicio',$4,'fim',$5));end$$;
      create function pedido_salvar_integrado(p_id uuid,p_pedido jsonb,p_itens jsonb,p_revisao bigint) returns jsonb language plpgsql as $$begin
        if current_setting('test.salvar',true)='falhar' then raise exception 'Falha ao salvar pedido';end if;
        insert into chamadas values('salvar',jsonb_build_object('pedido',p_pedido,'itens',p_itens,'revisao',p_revisao));
        update separacoes_pedidos set data_entrega=(p_pedido->>'data_entrega')::date,data_evento=(p_pedido->>'data_evento')::date,
          data_evento_fim=(p_pedido->>'data_evento_fim')::date,data_coleta=(p_pedido->>'data_coleta')::date,data_hora=(p_pedido->>'data_hora')::timestamptz,revisao=revisao+1 where id=p_id;
        return jsonb_build_object('id',p_id);end$$;
      select set_config('test.uid','${pedido}',false);select set_config('test.permissoes','comercial.pedidos.editar',false);`);
    await db.exec(fs.readFileSync('supabase/migrations/20261118001100_confirmar_datas.sql', 'utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20261122001200_confirmar_datas_editar_modal.sql', 'utf8'));
    const salvar = async (de = datas, para = novas, emp = empresa, obs = 'Confirmado por telefone') => (await db.query(
      'select comercial_confirmar_datas_atualizar($1,$2,$3,$4,$5) r', [emp, pedido, JSON.stringify(para), JSON.stringify(de), obs])).rows[0].r;
    const estado = async () => (await db.query("select to_jsonb(p) || jsonb_build_object('data_entrega',to_char(data_entrega,'YYYY-MM-DD'),'data_evento',to_char(data_evento,'YYYY-MM-DD'),'data_coleta',to_char(data_coleta,'YYYY-MM-DD')) p from separacoes_pedidos p where id=$1", [pedido])).rows[0].p;
    await salvar(datas, datas);
    assert.equal((await db.query('select count(*)::int n from chamadas')).rows[0].n, 0, 'confirmar sem editar não regrava o pedido');
    assert.equal((await salvar()).ok, true);
    const p = await estado();
    assert.equal(p.data_entrega, novas.data_entrega); assert.equal(p.data_evento, novas.data_evento); assert.equal(p.data_coleta, novas.data_coleta);
    assert.equal(p.revisao, 2); assert.equal(p.valor_total, 500); assert.deepEqual(p.observacoes, { contrato: 'preservar', financeiro: { valor: 500 } });
    const chamadas = (await db.query('select * from chamadas')).rows;
    assert.deepEqual(chamadas.map(c => c.tipo), ['reserva', 'salvar']);
    assert.equal(chamadas[1].dados.itens[0].quantidade_solicitada, 4);
    assert.equal(chamadas[1].dados.itens[0].quantidade_separada, 2);
    const confirmado = (await db.query('select to_jsonb(c) c from comercial_confirmacoes_datas c')).rows[0].c;
    assert.equal(confirmado.data_entrega, novas.data_entrega);assert.equal(confirmado.data_evento, novas.data_evento);assert.equal(confirmado.data_coleta, novas.data_coleta);
    assert.equal(confirmado.observacao, 'Confirmado por telefone');assert.equal(confirmado.confirmado_por_nome, 'Ana Comercial');
    await assert.rejects(salvar(datas), /mudaram em outro aparelho/);
    await assert.rejects(salvar(novas, { ...novas, data_entrega: '2026-12-06' }), /entrega precisa/);
    await assert.rejects(salvar(novas, { ...novas, data_evento_fim: '2026-12-03' }), /fim do evento/);
    await assert.rejects(salvar(novas, { ...novas, data_coleta: '2026-12-03' }), /coleta precisa/);
    await assert.rejects(salvar(novas, { ...novas, data_evento: null }), /Informe as datas/);
    await assert.rejects(salvar(novas, novas, empresa, 'a'.repeat(1001)), /1000 caracteres/);
    await db.exec("select set_config('test.estoque','insuficiente',false)");
    await assert.rejects(salvar(novas, datas), /Estoque insuficiente/);
    assert.deepEqual(await estado(), p);
    await db.exec("select set_config('test.estoque','ok',false);select set_config('test.salvar','falhar',false)");
    await assert.rejects(salvar(novas, datas), /Falha ao salvar pedido/);
    assert.deepEqual(await estado(), p);
    await db.exec(`select set_config('test.salvar','ok',false);
      create function falha_confirmar() returns trigger language plpgsql as $$begin raise exception 'Falha na confirmação';end$$;
      create trigger falha_confirmar before insert on comercial_confirmacoes_datas for each row execute function falha_confirmar();`);
    await assert.rejects(salvar(novas, datas), /Falha na confirmação/);
    assert.deepEqual(await estado(), p, 'falha de confirmação desfaz as novas datas');
    await db.exec('drop trigger falha_confirmar on comercial_confirmacoes_datas');
    const periodo = { ...novas, data_evento_fim: '2026-12-05', data_coleta: '2026-12-06' };
    await salvar(novas, periodo);
    assert.equal((await estado()).data_evento_fim, '2026-12-05');
    await db.exec(`update separacoes_pedidos set pedido_origem_id='${pedido}'`);
    await assert.rejects(salvar(periodo, { ...periodo, data_coleta: '2026-12-07' }), /pedido principal/);
    await salvar(periodo, { ...periodo, data_entrega: '2026-12-05' });
    await assert.rejects(salvar(periodo, periodo, outra), /Sem permissão/);
    await db.exec("select set_config('test.segundo_fator','nao',false)");
    await assert.rejects(salvar(), /Sem permissão/);
    await db.exec("select set_config('test.segundo_fator','sim',false);select set_config('test.permissoes','comercial.pedidos.visualizar',false)");
    await assert.rejects(salvar(), /Sem permissão/);
    await db.exec("select set_config('test.permissoes','comercial.pedidos.editar',false);select set_config('test.uid','',false)");
    await assert.rejects(salvar(), /Sem permissão/);
    assert.equal((await db.query("select has_function_privilege('anon','comercial_confirmar_datas_atualizar(uuid,uuid,jsonb,jsonb,text)','execute') v")).rows[0].v, false);
  } finally { await db.close(); }
});
