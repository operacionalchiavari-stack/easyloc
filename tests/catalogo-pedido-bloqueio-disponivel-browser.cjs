// Out/2026 — pedido do usuário: "hoje eu consigo selecionar 30 estantes... eu quero que isso nem chegue a entrar no
// pedido". Dentro do pedido comercial, aumentar a quantidade acima do disponível no período é recusado ANTES de entrar
// na lista (campo de quantidade da Lista Completa e "＋ Componente"), com a mesma conta do salvar.
const { chromium } = require('playwright'); const express = require('express'); const assert = require('node:assert/strict');
const { installMock } = require('./mock-projetos.cjs');
(async () => {
  const app = express();
  app.get('/host-pedido.html', (req, res) => res.type('html').send(`<!doctype html><html><body style="margin:0">
<input id="dataEntrega" value="2026-11-10"><input id="dataEvento" value="2026-11-11"><input id="dataColeta" value="2026-11-12">
<script>
  window.__pedidoClienteAtual = { nome: 'Lis', foto: '' }; window.__PEDIDO_ATUAL_ID = 'ped-1';
  const projeto = { id: 'ped-1', noivos: 'Lis', data_evento: '2026-11-11', local_evento: 'Vale', status: 'rascunho',
    dados: { ambientes: [{ id: 'a1', nome: 'Lounge', itens: [{ item_id: '1', quantidade: 2 }], renders: [], notas: '' }, { id: 'a2', nome: 'Bar', itens: [{ item_id: '1', quantidade: 1 }], renders: [], notas: '' }], plantas: [] } };
  window.__sincronizados = [];
  window.pedidoProjetoCatalogo = () => structuredClone(projeto);
  window.pedidoMetadadosCatalogo = () => ({ noivos: 'Lis', data_evento: '2026-11-11', data_evento_fim: null, local_evento: 'Vale' });
  window.pedidoSincronizarProjetoCatalogo = async (p) => { window.__sincronizados.push(structuredClone(p)); };
  window.__pedidoIrPara = () => {}; window.__pedidoSincronizarEtapa = () => {}; window.__salvarPedidoOperacional = async () => {};
</script>
<iframe id="cat" src="/Modulos/Comercial/Catalogo/catalogo.html?comercial=pedido" style="width:100vw;height:90vh;border:0"></iframe></body></html>`));
  app.use(express.static(process.cwd()));
  const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.on('listening', r));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await context.route('https://**/*', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
    await context.addInitScript(() => { sessionStorage.setItem('login_ok', '1'); try { localStorage.clear(); } catch {} });
    await context.addInitScript(installMock, { staff: true });
    // 4 livres do item 1 no período: soma dos ambientes acima de 4 é recusada
    await context.addInitScript(() => {
      const orig = window.supabaseClient.rpc.bind(window.supabaseClient);
      window.__consultas = [];
      window.supabaseClient.rpc = (nome, args) => {
        if (nome !== 'pedido_disponibilidade_comercial') return orig(nome, args);
        window.__consultas.push(args);
        const total = args.p_itens.filter((i) => i.item_id === '1').reduce((s, i) => s + i.quantidade_solicitada, 0);
        return Promise.resolve({ data: total > 4 ? [{ descricao: 'Sofá Um', necessario: total, disponivel: 4, faltante: total - 4, origens: ['1'] }] : [], error: null });
      };
    });
    await page.goto('http://127.0.0.1:' + server.address().port + '/host-pedido.html');
    await page.waitForFunction(() => typeof document.getElementById('cat').contentWindow.abrirProjetoComercialPedido === 'function', null, { timeout: 20000 });
    const frame = () => page.frames().find((f) => f.url().includes('catalogo.html'));
    await frame().evaluate(() => window.abrirProjetoComercialPedido());
    const cat = page.frameLocator('#cat');
    await cat.locator('.cpj-geral-title').waitFor({ timeout: 15000 });
    const campo = cat.locator('[data-pa-amb="a1"] [data-cpj-qtd-input], [data-pa-grupo="a1"] [data-cpj-qtd-input]').first();
    await campo.fill('30'); await campo.press('Enter'); await campo.blur();
    await cat.locator('.catalog-notification').filter({ hasText: 'Sem disponibilidade' }).waitFor({ timeout: 8000 });
    assert.match(await cat.locator('.catalog-notification').filter({ hasText: 'Sem disponibilidade' }).innerText(), /disponível 4 no período, você pediu 31/);
    await page.waitForTimeout(400);
    assert.equal(await campo.inputValue(), '2', 'volta para a quantidade de antes');
    const q = await frame().evaluate(() => window.__consultas.at(-1));
    assert.deepEqual([q.p_pedido, q.p_inicio, q.p_fim], ['ped-1', '2026-11-10', '2026-11-12']);
    const a1 = await page.evaluate(() => (window.__sincronizados.at(-1)?.dados?.ambientes || []).find((a) => a.id === 'a1'));
    assert.ok(!a1 || a1.itens.find((i) => i.item_id === '1').quantidade === 2, 'o 30 nunca entrou no pedido');
    console.log('ok 1 - quantidade acima do disponível (somando os ambientes) é recusada antes de entrar no pedido');
    await campo.fill('3'); await campo.press('Enter'); await campo.blur();
    await page.waitForFunction(() => (window.__sincronizados.at(-1)?.dados?.ambientes || []).find((a) => a.id === 'a1')?.itens?.[0]?.quantidade === 3, null, { timeout: 8000 });
    console.log('ok 2 - dentro do disponível entra normalmente');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
