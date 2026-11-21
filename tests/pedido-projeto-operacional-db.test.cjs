const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const empresa = '10000000-0000-0000-0000-000000000001';
const item = '20000000-0000-0000-0000-000000000001';

test('pedido operacional: atualiza imagens sem liberar ou modificar itens, valores e operação', async () => {
  const fonte = fs.readFileSync('tests/fluxo-unico-pedidos.test.cjs', 'utf8');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const { fixture, criar } = await new AsyncFunction('require', '__dirname',
    fonte.slice(0, fonte.indexOf("test('fluxo")) + 'return {fixture,criar};')(require, __dirname);
  const db = await fixture();
  try {
    await db.exec(`create function seguranca_2fa_ok() returns boolean language sql as $$select coalesce(current_setting('test.segundo_fator',true),'')<>'nao'$$;
      create function operacao_pode(p_empresa uuid,p_chave text) returns boolean language sql security definer set search_path=public
        as $$select auth.uid() is not null and funcionario_pode(p_empresa,auth.uid(),p_chave)$$;
      revoke all on function funcionario_pode(uuid,uuid,text) from public,authenticated;
      grant usage on schema auth to authenticated;
      grant select,update on separacoes_pedidos to authenticated;
      grant select on separacoes_itens to authenticated;`);
    await db.exec(fs.readFileSync('supabase/migrations/20261026000200_pedido_salvar_projeto_comercial.sql', 'utf8'));
    const p = await criar(db);
    const projeto = { id: 'projeto', dados: { ambientes: [
      { id: 'a1', nome: 'Lounge', itens: [{ item_id: item, quantidade: 10 }], renders: [{ id: 'r1', url: 'antiga.jpg' }] },
      { id: 'a2', nome: 'Evento', itens: [], renders: [] }
    ], plantas: [], servicos: [{ id: 's1', valor: 100 }] } };
    const salvar = (v = projeto, emp = empresa) => db.query('select pedido_salvar_projeto_comercial($1,$2,$3) ok', [emp, p.id, v]);
    const ler = async () => (await db.query('select to_jsonb(p) p from separacoes_pedidos p where id=$1', [p.id])).rows[0].p;
    await salvar();
    await db.query("update separacoes_pedidos set status='em_separacao' where id=$1", [p.id]);
    const antes = await ler();
    const itensAntes = (await db.query('select * from separacoes_itens where separacao_pedido_id=$1', [p.id])).rows;
    const novo = structuredClone(projeto);
    novo.dados.ambientes[0].renders = [{ id: 'r2', url: 'nova.jpg', cena: { tipo: 'ia' } }];
    novo.dados.plantas = [{ id: 'p1', url: 'planta-nova.jpg' }];
    await assert.rejects(salvar(novo), /Pedido com o operacional/); // reproduz o erro da tela
    await db.exec(fs.readFileSync('supabase/migrations/20261117000300_pedido_projeto_visual_operacional.sql', 'utf8'));
    await db.exec('set role authenticated');
    assert.equal((await salvar(novo)).rows[0].ok, true);
    const depois = await ler();
    const esperado = structuredClone(antes);
    esperado.observacoes.projeto_comercial = novo;
    assert.deepEqual(depois, esperado, 'nenhum outro campo, revisão, valor ou status é modificado');
    assert.deepEqual((await db.query('select * from separacoes_itens where separacao_pedido_id=$1', [p.id])).rows, itensAntes);
    assert.equal((await salvar(novo)).rows[0].ok, true, 'consultar o mesmo projeto funciona');
    assert.notEqual((await db.query("select current_setting('app.fluxo_transferencia',true) v")).rows[0].v, 'sim');
    await assert.rejects(db.query("update separacoes_pedidos set valor_total=1 where id=$1", [p.id]), /Pedido com o operacional/);
    for (const alterar of [v => v.dados.ambientes[0].itens[0].quantidade++, v => v.dados.ambientes.pop(),
      v => v.dados.ambientes.push(structuredClone(v.dados.ambientes[0])), v => v.dados.ambientes[0].itens[0].item_id = empresa]) {
      const invalido = structuredClone(novo); alterar(invalido);
      await assert.rejects(salvar(invalido), /itens deste pedido/);
    }
    const paralelo = structuredClone(novo);
    paralelo.id = 'outro'; paralelo.dados.servicos[0].valor = 0; paralelo.dados.ambientes[0].nome = 'Não gravar';
    paralelo.dados.ambientes[0].renders = [];
    assert.equal((await salvar(paralelo)).rows[0].ok, true);
    const visual = structuredClone(novo); visual.dados.ambientes[0].renders = [];
    assert.deepEqual((await ler()).observacoes.projeto_comercial, visual, 'mescla somente imagens; preserva alterações comerciais');
    await db.exec("set test.negar='sim'");
    await assert.rejects(salvar(novo), /permissão/);
    await db.exec("set test.negar='';set test.segundo_fator='nao'");
    await assert.rejects(salvar(novo), /acesso/);
    await db.exec("set test.segundo_fator=''");
    assert.equal((await salvar(novo, '10000000-0000-0000-0000-000000000002')).rows[0].ok, false);
  } finally { await db.close(); }
});

