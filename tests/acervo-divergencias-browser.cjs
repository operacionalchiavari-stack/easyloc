// Aba Divergências da Gestão do acervo: contagem geral às cegas, comparação, sugestão e confirmação com motivo.
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage();
  const erros = []; page.on('pageerror', e => erros.push(e.message));
  await page.setContent('<!doctype html><meta charset="utf-8"><nav><button data-aba="divergencias">Divergências <span class="tab-badge"></span></button></nav><div id="host"></div>');
  await page.addScriptTag({ path: path.join(__dirname, '../Modulos/Estoque/Acervo/acervo-divergencias.js') });
  await page.evaluate(() => {
    const div = (id, tipo, extra) => Object.assign({ id, item_id: 'it1', tipo, etapa: 'retorno', criado_em: '2026-10-2' + id.slice(-1), resolvida_em: null,
      pedido: { numero: id === 'd1' ? '10' : '11', cliente: 'Ana', local: id === 'd1' ? 'Villa Bisutti' : 'Casa Verde', data: '2026-10-20' },
      historico: { saiu: 10, carregamento: 10, desmontagem: 9, desmontagem_por: 'Igor', descarregamento_1: 8, descarregamento: 9, triagem_1: 8, triagem: 9 } }, extra);
    window.db = { contado: null, chamadas: [],
      divs: [div('d1', 'falta', { quantidade: 1, esperado: 10, conferido: 9 }), div('d2', 'falta', { quantidade: 2, esperado: 6, conferido: 4 })] };
    const rpc = async (n, a) => { db.chamadas.push([n, a]);
      if (n === 'acervo_divergencias') return { data: { bloqueia: true, contagens: [{ id: 'g1', item_id: 'it1', status: 'pendente', contado: db.contado, estoque: 30, manutencao: 1, fora: 4, esperado: 25, contado_por: 'Jonatan', contado_em: '2026-10-29T10:00:00Z', item: { nome: 'Cadeira Tiffany', codigo: 'CT1' } }], divergencias: db.divs } };
      if (n === 'acervo_contagem_registrar') { db.contado = a.p_contado; return { data: {} }; }
      if (n === 'acervo_divergencia_fechar') { db.divs = db.divs.map(d => d.id === a.p_id ? { ...d, resolvida_em: '2026-10-29T11:00:00Z', resolucao: 'perda' } : d); return { data: {} }; }
    };
    const motivos = [{ id: 'm1', nome: 'Erro de contagem', etapa: 'divergencia_falta', situacao: 'bateu' }, { id: 'm2', nome: 'Peça extraviada', etapa: 'divergencia_falta', situacao: 'continua' }, { id: 'm3', nome: 'Sobra ok', etapa: 'divergencia_sobra', situacao: 'bateu' }];
    const q = { select() { return q; }, eq() { return q; }, in() { return q; }, order() { return Promise.resolve({ data: motivos }); } };
    window.sb = { rpc: (n, a) => rpc(n, a).then(r => ({ data: r.data, error: null })), from: () => q };
    window.msgs = []; window.confirmarGlobal = async () => true;
    window.esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    window.go = () => AcervoDivergencias.render({ host: document.getElementById('host'), sb, empresa: 'e1', esc, msg: (t, e) => msgs.push([t, !!e]) });
  });
  await page.evaluate(() => go());
  await page.waitForSelector('.dv-item');
  // às cegas: não mostra o esperado nem a comparação antes de contar
  assert.ok(await page.locator('form.dv-contar').count() === 1, 'form de contagem');
  assert.ok(!(await page.textContent('.dv-item')).includes('Deveria ter'), 'não revela o esperado antes da contagem');
  assert.ok((await page.textContent('.dv-status')).includes('Bloqueado'), 'mostra bloqueado');
  assert.strictEqual(await page.textContent('.tab-badge'), '1');
  assert.strictEqual(await page.locator('[data-resolver]').count(), 0, 'sem resolver antes da contagem');
  const hist = await page.textContent('.dv-c-hist');
  assert.ok(hist.includes('Igor') && hist.includes('Carregamento') && hist.includes('Triagem da volta'), 'histórico: ' + hist);
  console.log('ok 1 contagem às cegas e histórico');
  await page.fill('form.dv-contar input', '22');
  await page.click('form.dv-contar button');
  await page.waitForSelector('.dv-conta');
  const reg = await page.evaluate(() => db.chamadas.find(c => c[0] === 'acervo_contagem_registrar')[1]);
  assert.deepStrictEqual([reg.p_contagem, reg.p_contado], ['g1', 22]);
  const sug = await page.textContent('.dv-sugestao');
  assert.ok(sug.includes('Faltam 3') && sug.includes('Villa Bisutti') && sug.includes('Casa Verde'), sug);
  // 22 contado − 25 esperado = 3 perdidas: d1 (mais antiga) perde 1 → final 9; d2 perde 2 → final 4. Sem coluna Resolução:
  // o resultado aparece no pedido e a confirmação (motivo por situação) fica na célula da contagem.
  assert.strictEqual(await page.locator('th').filter({ hasText: 'Resolução' }).count(), 0, 'sem a coluna Resolução');
  assert.match(await page.textContent('tr[data-div="d1"] .dv-resultado'), /Perda de 1/);
  assert.match(await page.textContent('tr[data-div="d2"] .dv-resultado'), /Perda de 2/);
  const grupos = page.locator('[data-confirmar-item] [data-motivo-grupo]');
  assert.strictEqual(await grupos.count(), 1, 'as duas perdas usam a mesma lista de motivo');
  assert.deepStrictEqual(await grupos.locator('option').allTextContents(), ['Escolha o motivo', 'Peça extraviada'], 'só motivos de perda');
  assert.match(await page.textContent('[data-confirmar-item] button'), /Confirmar as 2/);
  console.log('ok 2 comparação, onde pode ter ficado, resultado sugerido e motivo por situação');
  await page.click('[data-confirmar-item] button');
  assert.ok(await page.evaluate(() => msgs.some(m => m[1] && /motivo/.test(m[0]))), 'exige motivo');
  await grupos.selectOption('m2');
  await page.click('[data-confirmar-item] button');
  await page.waitForFunction(() => !document.querySelector('tr[data-div]'));
  const f = await page.evaluate(() => db.chamadas.filter(c => c[0] === 'acervo_divergencia_fechar').map(c => [c[1].p_id, c[1].p_contagem, c[1].p_motivo]));
  assert.deepStrictEqual(f, [['d1', 9, 'm2'], ['d2', 4, 'm2']]);
  console.log('ok 3 um Confirmar fecha todas as divergências do item com o resultado sugerido');
  assert.deepStrictEqual(erros, []);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
