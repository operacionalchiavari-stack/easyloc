const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

async function painel({ confirmacao = true, entrega = '2026-11-22', coleta = '2026-11-24', evento = '2026-11-23', etapa = '2026-11-22', falha = false } = {}) {
  const pedido = { id: 'p1', numero_pedido: '123', data_entrega: entrega, data_coleta: coleta, data_evento: evento };
  const etapas = ['montagem', 'desmontagem'].map(tipo => ({ id: tipo, pedido_id: 'p1', pedido,
    tipo, data: tipo === 'montagem' ? etapa : coleta, pessoas: [], cams: [] }));
  etapas.push({ id: 'avulsa', tipo: 'montagem', data: etapa, pessoas: [], cams: [] });
  const chamadas = [];
  const client = {
    rpc: async (nome, args) => {
      chamadas.push({ nome, args });
      if (nome === 'logistica_confirmacoes_datas' && falha) return { error: { message: 'Indisponível' } };
      return { data: nome === 'operacao_empresa' ? 'emp' : nome === 'operacao_minhas_permissoes' ? { 'logistica.planejamento.visualizar': true }
        : nome === 'pedido_fluxo_fila' ? [pedido] : nome === 'operacao_regras_escala' ? { etapas: {} }
        : nome === 'logistica_confirmacoes_datas' ? confirmacao ? [{ pedido_id: 'p1', data_entrega: '2026-11-22', data_evento: '2026-11-23', data_coleta: '2026-11-24', por: 'Ana Comercial', em: '2026-11-20T12:00:00Z' }] : [] : [], error: null };
    },
    from: tabela => {
      const q = { select: () => q, eq: () => q, gte: () => q, lte: () => q, order: () => q, in: () => q, neq: () => q, range: () => q,
        then: (ok, erro) => Promise.resolve({ data: tabela === 'operacao_etapas' ? etapas : tabela === 'separacoes_pedidos' ? [pedido] : [], error: null }).then(ok, erro) };
      return q;
    }
  };
  const window = { supabaseClient: client }; window.top = window;
  const ctx = { window, document: { currentScript: { src: 'http://teste/Modulos/Chiavari/operacao-sem-motor.js' } }, URL, Date, Intl, console: { warn() {} } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('Modulos/Chiavari/operacao-sem-motor.js', 'utf8'), ctx);
  return { dados: await window.ACERVO_LOCAL.ESC_painel('2026-11-22', 5, false), chamadas };
}

test('painel usa a confirmação real e invalida datas do pedido ou etapa alteradas', async () => {
  const { dados, chamadas } = await painel();
  assert.equal(dados.etapas[0].confirmacao_comercial.status, 'confirmado');
  assert.equal(dados.etapas[1].confirmacao_comercial.status, 'confirmado');
  assert.equal(dados.etapas[0].confirmacao_comercial.por, 'Ana Comercial');
  assert.equal(dados.etapas[2].confirmacao_comercial, null, 'escala avulsa não recebe confirmação de pedido');
  assert.deepEqual(JSON.parse(JSON.stringify(chamadas.find(c => c.nome === 'logistica_confirmacoes_datas').args)), { p_empresa: 'emp', p_pedidos: ['p1'] });
  for (const alteracao of [{ entrega: '2026-11-21' }, { coleta: '2026-11-25' }, { evento: '2026-11-24' }, { etapa: '2026-11-23' }]) {
    assert.equal((await painel(alteracao)).dados.etapas[0].confirmacao_comercial.status, 'alterado');
  }
  assert.equal((await painel({ etapa: '2026-11-23' })).dados.etapas[1].confirmacao_comercial.status, 'confirmado', 'data de montagem alterada não muda o dia da desmontagem');
  assert.equal((await painel({ confirmacao: false })).dados.etapas[0].confirmacao_comercial.status, 'pendente');
  assert.equal((await painel({ falha: true })).dados.etapas[0].confirmacao_comercial.status, 'indisponivel', 'erro de leitura não indica falta de confirmação');
});

test('consulta de confirmação limita dados por empresa, pedido, permissão e 2FA', async () => {
  const db = new PGlite();
  const emp = '10000000-0000-0000-0000-000000000001', outra = '10000000-0000-0000-0000-000000000002';
  const p1 = '20000000-0000-0000-0000-000000000001', p2 = '20000000-0000-0000-0000-000000000002';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function eh_membro_empresa(uuid) returns boolean language sql as $$select $1='${emp}'::uuid$$;
      create function seguranca_2fa_ok() returns boolean language sql as $$select current_setting('test.segundo_fator',true) is distinct from 'nao'$$;
      create function operacao_pode(uuid,text) returns boolean language sql as $$select $2=any(string_to_array(current_setting('test.permissoes',true),','))$$;
      create table comercial_confirmacoes_datas(pedido_id uuid,empresa_id uuid,data_entrega date,data_evento date,data_coleta date,confirmado_por_nome text,confirmado_em timestamptz,observacao text);
      insert into comercial_confirmacoes_datas values
      ('${p1}','${emp}','2026-11-22','2026-11-23','2026-11-24','Ana',now(),'Observação interna'),
      ('${p2}','${outra}','2026-11-22','2026-11-23','2026-11-24','Outra empresa',now(),'Privado');
      select set_config('test.uid','${p1}',false);`);
    await db.exec(fs.readFileSync('supabase/migrations/20261122001100_logistica_confirmacao_datas.sql', 'utf8'));
    const consulta = async (empresa = emp, ids = [p1, p2]) => (await db.query('select logistica_confirmacoes_datas($1,$2) r', [empresa, ids])).rows[0].r;
    for (const permissao of ['logistica.planejamento.visualizar', 'logistica.cronograma.visualizar']) {
      await db.query("select set_config('test.permissoes',$1,false)", [permissao]);
      const lista = await consulta();
      assert.equal(lista.length, 1); assert.equal(lista[0].pedido_id, p1);
      assert.equal('observacao' in lista[0], false);
      assert.deepEqual(await consulta(emp, [p2]), []);
      await assert.rejects(consulta(outra), /Sem permissão/);
    }
    await db.exec("select set_config('test.segundo_fator','nao',false)");
    await assert.rejects(consulta(), /Sem permissão/);
    await db.exec("select set_config('test.segundo_fator','sim',false);select set_config('test.permissoes','',false)");
    await assert.rejects(consulta(), /Sem permissão/);
    await db.exec("select set_config('test.permissoes','logistica.planejamento.visualizar',false);select set_config('test.uid','',false)");
    await assert.rejects(consulta(), /Sem permissão/);
    assert.equal((await db.query("select has_function_privilege('anon','logistica_confirmacoes_datas(uuid,uuid[])','execute') v")).rows[0].v, false);
    assert.equal((await db.query("select has_function_privilege('authenticated','logistica_confirmacoes_datas(uuid,uuid[])','execute') v")).rows[0].v, true);
  } finally { await db.close(); }
});
