// Etiquetas de Clientes/Locais vindas de Parâmetros > Comercial, foto na linha de clientes e lista em blocos ao rolar.
// Uso: node tests/cadastro-etiquetas-browser.cjs
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const base = 'http://localhost:5599/';
const GRUPOS_CLI = [
  { chave: 'estilo', titulo: 'Estilo', cor: 'azul', unica: false, obrigatoria: true, opcoes: ['Clássico', 'Industrial'] },
  { chave: 'canal', titulo: 'Canal', cor: 'verde', unica: true, obrigatoria: false, opcoes: ['WhatsApp'] },
  { chave: 'orcamento', titulo: 'Orçamento', cor: 'laranja', unica: true, obrigatoria: true, opcoes: ['Econômico', 'Premium'] }
];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

function mock(banco) {
  window.__CONTEXT = { empresa_id: 'e1' };
  window.aguardarContexto = async () => window.__CONTEXT;
  window.hasPermission = () => true;
  window.lucide = { createIcons() {} };
  window.__banco = banco; window.__gravados = [];
  window.supabaseClient = {
    from(t) {
      let linhas = (window.__banco[t] || []).slice(), single = false;
      const q = {
        select() { return q; }, eq(k, v) { linhas = linhas.filter(l => l[k] === undefined || String(l[k]) === String(v)); return q; },
        order() { return q; }, range(a, b) { linhas = linhas.slice(a, b + 1); return q; }, limit() { return q; }, in() { return q; },
        ilike() { return q; }, or() { return q; }, gte() { return q; }, lte() { return q; }, neq() { return q; }, is() { return q; },
        single() { single = true; return q; }, maybeSingle() { single = true; return q; },
        upsert(row) { window.__gravados.push({ t, row }); return Promise.resolve({ error: null }); },
        then(o, f) { return Promise.resolve({ data: single ? linhas[0] || null : linhas, error: null }).then(o, f); }
      };
      return q;
    },
    async rpc() { return { data: [], error: null }; }
  };
}

async function abrir(b, pagina, banco) {
  const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(mock, banco);
  await p.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith('https://fixture/')) return r.fulfill({ contentType: 'image/png', body: PNG });
    if (!u.startsWith(base)) return r.fulfill({ body: '', contentType: 'text/javascript' });
    const f = path.join(process.cwd(), decodeURIComponent(new URL(u).pathname));
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    if (/(supabase|context|google|permissions|doisFatores)\.js/.test(u)) return r.fulfill({ body: '', contentType: 'text/javascript' });
    r.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.html') ? 'text/html' : f.endsWith('.css') ? 'text/css' : 'text/javascript' });
  });
  await p.goto(base + pagina);
  return { p, errs };
}

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    // ---------- Clientes ----------
    const clientes = Array.from({ length: 45 }, (_, i) => ({ id: 'c' + i, empresa_id: 'e1', nome_razao: 'Cliente ' + String(i).padStart(2, '0'), telefone: '24992842746', email: 'c@x.com', status: 'Ativo', tags: { estilo: i === 0 ? ['Boho'] : ['Clássico'], orcamento: i < 30 ? 'Premium' : 'Econômico' }, catalogo_logo_url: i === 0 ? 'https://fixture/f.png' : null }));
    let { p, errs } = await abrir(b, 'Modulos/Comercial/CadastroClientes/cadastro-clientes.html', { clientes_empresas: clientes, cadastro_etiquetas: [{ empresa_id: 'e1', cadastro: 'cliente', grupos: GRUPOS_CLI }] });
    await p.waitForSelector('#clientTable tr');
    await p.waitForFunction(() => document.querySelectorAll('.tag-group').length === 3);
    assert.equal(await p.locator('#clientesStats').count(), 0, 'cartões de resumo saíram');
    assert.equal(await p.locator('#clientTable tr').count(), 20, 'primeiro bloco de 20');
    assert.equal(await p.locator('#clientTable tr').first().locator('.cliente-linha-foto img').count(), 1, 'foto na linha');
    assert.equal(await p.locator('#clientTable tr').nth(1).locator('.cliente-linha-foto > span').innerText(), 'C0', 'iniciais sem foto');
    await p.locator('.easyloc-list-pager').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => document.querySelectorAll('#clientTable tr').length === 40);
    await p.locator('.easyloc-list-pager').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => document.querySelectorAll('#clientTable tr').length === 45);
    assert.match(await p.locator('.easyloc-list-pager').innerText(), /45 cadastro/);
    assert.deepEqual(await p.$$eval('#styleFilter option', o => o.map(x => x.textContent)), ['Todos os estilos', 'Clássico', 'Industrial']);
    await p.selectOption('#budgetFilter', 'Econômico');
    assert.equal(await p.locator('#clientTable tr').count(), 15, 'filtro de orçamento (valor único) funciona');
    await p.selectOption('#budgetFilter', '');
    await p.locator('#clientTable tr').first().click();
    await p.waitForSelector('#modal:not(.hidden)');
    assert.deepEqual(await p.$$eval('.tag-group[data-group="estilo"] .tag', t => t.map(x => x.textContent)), ['Clássico', 'Industrial', 'Boho'], 'opção antiga continua aparecendo');
    assert.equal(await p.locator('.tag-group[data-group="estilo"] .tag.fora-da-lista.selected').count(), 1);
    assert.equal(await p.getAttribute('.tag-group[data-group="canal"]', 'data-obrigatoria'), 'false');
    await p.screenshot({ path: path.join(process.env.TMP || '.', 'clientes-etiquetas.png') });
    assert.deepEqual(errs, []);
    console.log('ok 1 - clientes: etiquetas do parâmetro, foto, blocos ao rolar, filtros');
    await p.close();

    // ---------- Parâmetros ----------
    ({ p, errs } = await abrir(b, 'Modulos/Configuracoes/Parametros/parametros.html', { cadastro_etiquetas: [{ empresa_id: 'e1', cadastro: 'cliente', grupos: GRUPOS_CLI }, { empresa_id: 'e1', cadastro: 'local', grupos: [{ chave: 'tipo', titulo: 'Tipo', cor: 'azul', unica: true, obrigatoria: true, opcoes: ['Hotel'] }] }], empresas: [{ id: 'e1', nome: 'Teste' }] }));
    await p.waitForFunction(() => !document.getElementById('salvarEmpresaParametros').disabled, null, { timeout: 15000 });
    await p.click('#pr-tab-comercial');
    await p.waitForSelector('[data-etiquetas-cadastro="cliente"] .pe-grupo');
    const cli = p.locator('[data-etiquetas-cadastro="cliente"]');
    await cli.locator('.pe-grupo[data-i="0"] .pe-nova').fill('Rústico');
    await cli.locator('.pe-grupo[data-i="0"] .pe-nova').press('Enter');
    assert.equal(await cli.locator('.pe-grupo[data-i="0"] .pe-opcao').count(), 3);
    await cli.locator('.pe-grupo[data-i="0"] [data-acao="remover-opcao"][data-j="1"]').click();
    await cli.locator('[data-acao="novo-grupo"]').click();
    await cli.locator('.pe-grupo[data-i="3"] .pe-titulo').fill('Tamanho do evento');
    await cli.locator('.pe-grupo[data-i="3"] .pe-nova').fill('Até 100 pessoas');
    await p.screenshot({ path: path.join(process.env.TMP || '.', 'parametros-etiquetas.png'), fullPage: true });
    await p.click('#salvarEmpresaParametros');
    await p.waitForFunction(() => window.__gravados.filter(x => x.t === 'cadastro_etiquetas').length >= 2);
    const g = await p.evaluate(() => window.__gravados);
    const gc = g.find(x => x.t === 'cadastro_etiquetas' && x.row.cadastro === 'cliente').row.grupos;
    assert.deepEqual(gc[0].opcoes, ['Clássico', 'Rústico']);
    assert.equal(gc[3].chave, 'tamanho_do_evento');
    assert.deepEqual(gc[3].opcoes, ['Até 100 pessoas']);
    assert.ok(g.some(x => x.row.cadastro === 'local'));
    console.log('ok 2 - parâmetros: incluir/tirar opção, novo grupo, salvar', errs.length ? errs : '');
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
