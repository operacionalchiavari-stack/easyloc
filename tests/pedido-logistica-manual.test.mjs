import { validarObservacoesLogisticaManual } from '../js/pedido/pedido.logistica-manual.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { renderizarFreteCard } from '../js/pedido/pedido.ui-frete.mjs';
import { renderMontagemSugerida } from '../js/pedido/pedido.ui-montagem.mjs';

test('valores manuais sobrevivem ao recálculo e voltam ao automático', async () => {
  const elementos = new Map();
  globalThis.window = { __PEDIDO_LOGISTICA_MANUAL: { frete: { valor: 123.45 }, montagem: { valor: 0 } } };
  globalThis.document = { getElementById(id) {
    if (id.startsWith('card')) return null;
    if (!elementos.has(id)) elementos.set(id, { dataset: {}, style: {}, classList: { remove() {} } });
    return elementos.get(id);
  } };
  assert.match(validarObservacoesLogisticaManual(), /frete/);
  window.__PEDIDO_LOGISTICA_MANUAL.frete.observacao = '  ';
  assert.match(validarObservacoesLogisticaManual(), /frete/);
  window.__PEDIDO_LOGISTICA_MANUAL.frete.observacao = 'Negociado com o cliente';
  assert.match(validarObservacoesLogisticaManual(), /montagem/);
  window.__PEDIDO_LOGISTICA_MANUAL.montagem.observacao = 'Equipe do cliente';
  assert.equal(validarObservacoesLogisticaManual(), '');
  const frete = { totalFrete: 800, freteBruto: 1000, freteAbsorcao: 200, fretePercent: 20, caminhoes: [] };
  await renderizarFreteCard(frete);
  renderMontagemSugerida({ qtd: 2, custoBruto: 500, valorAbsorcao: 50 });
  assert.equal(window.__FRETE_FINAL, 123.45);
  assert.equal(window.__MONTAGEM_FINAL, 0);
  assert.equal(window.__MONTAGEM_DESCONTO, 0);
  await renderizarFreteCard({ ...frete, totalFrete: 900 });
  assert.equal(window.__FRETE_FINAL, 123.45);
  window.__PEDIDO_LOGISTICA_MANUAL = {};
  await renderizarFreteCard(frete);
  renderMontagemSugerida({ qtd: 2, custoBruto: 500, valorAbsorcao: 50 });
  assert.equal(window.__FRETE_FINAL, 800);
  assert.equal(window.__MONTAGEM_FINAL, 450);
});

test('banco confere usuários escolhidos, bloqueio, valor inválido e preservação de ajuste', async () => {
  delete globalThis.window; delete globalThis.document;
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create role authenticated;
      create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
      create table empresas(id uuid primary key);
      create table separacoes_pedidos(id int primary key, empresa_id uuid, observacoes jsonb);
      create function eh_membro_empresa(uuid) returns boolean language sql as $$select true$$;
      create function operacao_pode(uuid,text) returns boolean language sql as $$select true$$;
      insert into empresas values ('00000000-0000-0000-0000-000000000002');`);
    await db.exec(readFileSync('supabase/migrations/20261021001500_pedido_logistica_manual.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261021001600_logistica_manual_observacao.sql', 'utf8'));
    const empresa = '00000000-0000-0000-0000-000000000002';
    const obs = JSON.stringify({ logistica_manual: { frete: { valor: 100, observacao: 'Frete negociado' } } });
    await assert.rejects(db.query('insert into separacoes_pedidos values (1,$1,$2)', [empresa, obs]), /Sem permissão/);
    await db.query('insert into pedido_logistica_parametros(empresa_id,config) values ($1,$2)', [empresa, JSON.stringify({ frete: { modo: 'escolhidos', usuarios: ['00000000-0000-0000-0000-000000000001'] } })]);
    await db.query('insert into separacoes_pedidos values (1,$1,$2)', [empresa, obs]);
    for (const tipo of ['frete', 'montagem']) {
      const invalido = JSON.stringify({ logistica_manual: { [tipo]: { valor: 100, observacao: ' \n\t ' } } });
      await assert.rejects(db.query('insert into separacoes_pedidos values (2,$1,$2)', [empresa, invalido]), /Informe a observa/);
    }
    await assert.rejects(db.query(`update separacoes_pedidos set observacoes='{"logistica_manual":{"frete":{"valor":-1}}}'`), /fora do limite/);
    await db.exec(`update pedido_logistica_parametros set config='{}';`);
    await db.exec('update separacoes_pedidos set observacoes=observacoes');
    await assert.rejects(db.exec(`update separacoes_pedidos set observacoes='{}'`), /Sem permissão/);
  } finally { await db.close(); }
});
