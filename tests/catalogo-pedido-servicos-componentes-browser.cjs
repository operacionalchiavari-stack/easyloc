// Out/2026 — Pedido comercial (catálogo dentro do pedido): "＋ Serviço" na Lista Completa (serviços adicionais em
// dados.servicos, com quantidade e valor editáveis) e "＋ Componente" em cada ambiente (peça que não aparece no
// catálogo; entra em amb.itens como os móveis). Os dois vão pro pedido (sincronização) e aparecem na prévia/PDF.
const { chromium } = require('playwright'); const express = require('express'); const assert = require('node:assert/strict');
const { installMock } = require('./mock-projetos.cjs');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
(async () => {
  const app = express();
  app.get('/host-pedido.html', (req, res) => {
    res.type('html').send(`<!doctype html><html><body style="margin:0">
<script>
  window.__pedidoClienteAtual = { nome: 'Lis Baêtas', foto: '' };
  const projeto = { id: 'ped-1', noivos: 'Lis Baêtas', data_evento: '2026-11-11', local_evento: 'Vale dos Desejos', status: 'rascunho',
    dados: { ambientes: [{ id: 'a1', nome: 'Lounge', itens: [{ item_id: '1', quantidade: 2 }], renders: [{ id: 'r9', url: 'https://fixture/r9.png', origem: '3D Livre', cena: { url: 'https://fixture/sem-cena.json', path: 'x/sem.json', tipo: 'print' } }], notas: '' }, { id: 'a2', nome: 'Bar', itens: [], renders: [{ id: 'r1', url: 'https://fixture/render.png', origem: '3D Livre', cena: { url: 'https://fixture/cena.json', path: 'x/cena.json', tipo: 'print' } }], notas: '' }], plantas: [] } };
  window.__sincronizados = [];
  window.pedidoProjetoCatalogo = () => structuredClone(projeto);
  window.pedidoMetadadosCatalogo = () => ({ noivos: projeto.noivos, data_evento: projeto.data_evento, data_evento_fim: null, local_evento: projeto.local_evento });
  window.pedidoSincronizarProjetoCatalogo = async (p) => { window.__sincronizados.push(structuredClone(p)); };
  window.__pedidoIrPara = (d) => { if (d === 'pedido') document.getElementById('cat').contentWindow.abrirPedidoComercialPedido(); }; window.__pedidoSincronizarEtapa = () => {}; window.__salvarPedidoOperacional = async () => {};
</script>
<iframe id="cat" src="/Modulos/Comercial/Catalogo/catalogo.html?comercial=pedido" style="width:100vw;height:100vh;border:0"></iframe></body></html>`);
  });
  app.use(express.static(process.cwd()));
  const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.on('listening', r));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await context.route('https://**/*', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
    await context.route('https://fixture/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
    await context.addInitScript(() => { sessionStorage.setItem('login_ok', '1'); try { localStorage.clear(); } catch {} });
    await context.addInitScript(installMock, { staff: true, cartela: true });
    // Tabelas que o mock geral não tem: serviços adicionais e componentes.
    await context.addInitScript(() => {
      const SERVICOS = [{ id: 's1', nome: 'Limpeza', valor_fixo: 150, valor_mao_obra: 0 }, { id: 's2', nome: 'Montagem especial', valor_fixo: 300, valor_mao_obra: 100 }];
      const COMP = [{ id: 'c1', tipo: 'Componente', produto: 'Tampo Redondo', descricao_total: 'Tampo Redondo Madeira (L) 0.90 m (A) 0.03 m (P) 0.90 m', foto_url: 'https://fixture/tampo.png', largura: 0.9, altura: 0.03, profundidade: 0.9, valor_locacao: 45, valor_reposicao: 600, referencia: 'TAM01', categoria: 'Componentes', ativo: true }];
      const builder = (dados) => new Proxy({}, { get(_t, prop) { if (prop === 'then') return (ok) => ok({ data: dados, error: null }); return () => builder(dados); } });
      const orig = window.supabaseClient.from.bind(window.supabaseClient);
      const PERS = [{ id: '11111111-1111-4111-8111-111111111111', tipo: 'Pintura', vinculo_id: '1', status: 'ATIVO', preco_sugerido: 0 }];
      window.supabaseClient.from = (t) => t === 'servicos_adicionais' ? builder(SERVICOS) : t === 'itens' ? builder(COMP) : t === 'personalizacoes' ? builder(PERS) : orig(t);
    });
    await page.goto('http://127.0.0.1:' + server.address().port + '/host-pedido.html');
    await page.waitForFunction(() => typeof document.getElementById('cat').contentWindow.abrirProjetoComercialPedido === 'function', null, { timeout: 20000 });
    const frame = () => page.frames().find((f) => f.url().includes('catalogo.html'));
    await frame().evaluate(() => window.abrirProjetoComercialPedido());
    const cat = page.frameLocator('#cat');
    await cat.locator('.cpj-geral-title').waitFor({ timeout: 15000 });
    const ultimo = () => page.evaluate(() => window.__sincronizados.at(-1));

    // Serviço
    await cat.locator('[data-cpj="add-servico"]').click();
    const dlg = cat.locator('dialog.cpj-modal');
    await dlg.locator('.cpj-escolha').nth(1).click();
    await dlg.locator('input[name=quantidade]').fill('2');
    await dlg.locator('button[type=submit]').click();
    await cat.locator('[data-servico-id]').waitFor();
    assert.match(await cat.locator('.cpj-servicos').innerText(), /Montagem especial[\s\S]*R\$\s?800,00/);
    await page.waitForFunction(() => (window.__sincronizados.at(-1)?.dados?.servicos || []).length === 1, null, { timeout: 8000 });
    let s = (await ultimo()).dados.servicos[0];
    assert.deepEqual({ nome: s.nome, q: s.quantidade, v: s.valor }, { nome: 'Montagem especial', q: 2, v: 400 });
    await cat.locator('[data-servico-campo="valor"]').fill('350');
    await cat.locator('[data-servico-campo="valor"]').press('Enter');
    await page.waitForFunction(() => window.__sincronizados.at(-1)?.dados?.servicos?.[0]?.valor === 350, null, { timeout: 8000 });
    assert.match(await cat.locator('.cpj-servicos tfoot').innerText(), /R\$\s?700,00/);
    assert.equal(await frame().evaluate(() => getComputedStyle(document.querySelector('[data-servico-id] td')).backgroundColor), 'rgb(227, 237, 251)', 'serviço em azul');
    console.log('ok 1 - ＋ Serviço na Lista Completa: escolhe, quantidade e valor editáveis, total, vai pro pedido');

    // Componente
    // Sem abas no pedido comercial: só os botões, com Ambiente ao lado do Catálogo; tudo na Lista Completa
    const barra = await frame().evaluate(() => [...document.querySelector('.cpj-geral-botoes').querySelectorAll('button')].map((b) => b.textContent.trim()));
    assert.deepEqual(barra, ['＋ Ambiente', '＋ Componente', '＋ Serviço'], 'barra só com os botões (Catálogo virou etapa do pedido)');
    const linha = await frame().evaluate(() => { const meio = (q) => { const r = document.querySelector(q).getBoundingClientRect(); return (r.top + r.bottom) / 2; }; const a = meio('.cpj-geral-topo .cpj-solicitante'), b = meio('.cpj-geral-title h2'), c = meio('.cpj-geral-botoes'); return Math.abs(a - b) < 24 && Math.abs(b - c) < 24; });
    assert.equal(linha, true, 'solicitante, Lista Completa e botões na mesma linha');
    assert.equal(await cat.locator('[data-cpj-amb], [data-cpj-worktab]').count(), 0, 'sem abas de ambiente');
    assert.equal(await cat.locator('[data-pa-grupo="a2"] .pa-ambiente-vazio').count(), 1, 'ambiente vazio aparece na lista');
    assert.equal(await cat.locator('[data-pa-grupo="a2"] .pa-ambiente-renders [data-cpj-render="r1"]').count(), 1, 'renderização dentro da lista, no ambiente');
    assert.equal(await cat.locator('[data-pa-grupo="a1"] [data-cpj="renomear"]').count(), 1, 'renomear no título do ambiente');
    if (process.env.FOTO) { await page.setViewportSize({ width: 1900, height: 900 }); await page.waitForTimeout(400); await page.screenshot({ path: process.env.FOTO }); await page.setViewportSize({ width: 1440, height: 900 }); }
    const selos = await frame().evaluate(() => ['.cpj-jogos span', '.cpj-render-3d'].map((q) => getComputedStyle(document.querySelector('.pa-ambiente-renders ' + q)).color));
    assert.deepEqual(selos, ['rgb(255, 255, 255)', 'rgb(255, 255, 255)'], 'jogos e Trocar móveis no 3D em branco no fundo escuro');
    // Jogos da composição: 1 → 3 soma 2× cada móvel da foto (lidos da cena 3D guardada); 3 → 2 devolve 1×.
    await page.route('https://fixture/cena.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 1, objects: [{ itemId: '3' }, { itemId: '3' }] }) }));
    const jogos = cat.locator('[data-pa-grupo="a2"] [data-cpj-jogos]');
    assert.equal(await jogos.inputValue(), '1');
    await jogos.fill('3'); await jogos.press('Enter');
    await page.waitForFunction(() => { const a2 = (window.__sincronizados.at(-1)?.dados?.ambientes || []).find((a) => a.id === 'a2'); return a2?.renders?.[0]?.jogos === 3; }, null, { timeout: 8000 });
    const a2 = await page.evaluate(() => (window.__sincronizados.at(-1).dados.ambientes).find((a) => a.id === 'a2'));
    assert.deepEqual(a2.itens.map((i) => [i.item_id, i.quantidade]).sort(), [['3', 4]], '3 jogos = 2 jogos a mais de cada móvel da foto');
    assert.deepEqual(a2.renders[0].moveis, [{ id: '3', quantidade: 2 }]);
    await cat.locator('[data-pa-grupo="a2"] [data-cpj-jogos]').fill('2'); await cat.locator('[data-pa-grupo="a2"] [data-cpj-jogos]').press('Enter');
    await page.waitForFunction(() => (window.__sincronizados.at(-1)?.dados?.ambientes || []).find((a) => a.id === 'a2')?.renders?.[0]?.jogos === 2, null, { timeout: 8000 });
    assert.deepEqual((await page.evaluate(() => (window.__sincronizados.at(-1).dados.ambientes).find((a) => a.id === 'a2'))).itens.map((i) => [i.item_id, i.quantidade]).sort(), [['3', 2]]);
    const centro = await frame().evaluate(() => { const g = document.querySelector('[data-pa-grupo]'); const h = g.querySelector('.pa-ambiente-titulo h3').getBoundingClientRect(); const linha = g.querySelector('[data-pa-item]').getBoundingClientRect(); const fotoCol = g.querySelector('.pa-foto-ambiente').getBoundingClientRect(); return { dif: Math.abs((h.left + h.right) / 2 - (linha.left + linha.right - (linha.right - fotoCol.left)) / 2), tam: parseFloat(getComputedStyle(g.querySelector('.pa-ambiente-titulo h3')).fontSize) }; });
    assert.ok(centro.dif < 3, 'nome do ambiente no centro dos itens: ' + JSON.stringify(centro)); assert.ok(centro.tam >= 26, 'nome do ambiente maior');
    console.log('ok 1c - jogos da composição multiplicam os móveis da foto na lista');
    // Cena 3D que não existe mais no Storage: pergunta se usa os móveis do ambiente como 1 jogo.
    await page.route('https://fixture/sem-cena.json', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
    await cat.locator('[data-pa-grupo="a1"] [data-cpj-jogos]').fill('2'); await cat.locator('[data-pa-grupo="a1"] [data-cpj-jogos]').press('Enter');
    await dlg.waitFor(); assert.match(await dlg.innerText(), /Não encontrei a composição desta foto/); assert.match(await dlg.innerText(), /2× Sofá/);
    await dlg.locator('button[type=submit]').click();
    await page.waitForFunction(() => (window.__sincronizados.at(-1)?.dados?.ambientes || []).find((a) => a.id === 'a1')?.renders?.[0]?.jogos === 2, null, { timeout: 8000 });
    assert.equal((await page.evaluate(() => window.__sincronizados.at(-1).dados.ambientes.find((a) => a.id === 'a1'))).itens.find((i) => i.item_id === '1').quantidade, 4, 'sem cena: os móveis do ambiente viram 1 jogo');
    await cat.locator('[data-pa-grupo="a1"] [data-cpj-jogos]').fill('1'); await cat.locator('[data-pa-grupo="a1"] [data-cpj-jogos]').press('Enter');
    await page.waitForFunction(() => (window.__sincronizados.at(-1)?.dados?.ambientes || []).find((a) => a.id === 'a1')?.itens?.find((i) => i.item_id === '1')?.quantidade === 2, null, { timeout: 8000 });
    console.log('ok 1d - foto sem cena: pergunta e usa os móveis do ambiente como 1 jogo');
    await cat.locator('[data-pa-grupo="a2"] [data-cpj="render-remover"]').click();
    await page.waitForFunction(() => (window.__sincronizados.at(-1)?.dados?.ambientes || []).find((a) => a.id === 'a2')?.renders?.length === 0, null, { timeout: 8000 });
    console.log('ok 1b - sem abas: Catálogo, Ambiente, Componente e Serviço; ambiente vazio e renderizações na Lista Completa');
    await cat.locator('[data-cpj="add-componente"]').click();
    await dlg.locator('[data-comp-id="c1"]').click();
    await dlg.locator('select[name=ambiente]').selectOption('a1');
    await dlg.locator('input[name=quantidade]').fill('3');
    await dlg.locator('button[type=submit]').click();
    await page.waitForFunction(() => (window.__sincronizados.at(-1)?.dados?.ambientes?.[0]?.itens || []).some((i) => i.item_id === 'c1' && i.quantidade === 3), null, { timeout: 8000 });
    assert.match(await cat.locator('[data-cpj-panel]').innerText(), /Tampo Redondo Madeira/);
    const cores = await frame().evaluate(() => { const bg = (el) => el && getComputedStyle(el.querySelector('td')).backgroundColor; return { comp: bg(document.querySelector('[data-pa-item="c1"]')), normal: bg(document.querySelector('[data-pa-item="1"]')) }; });
    assert.equal(cores.comp, 'rgb(255, 244, 204)', 'componente em amarelo'); assert.notEqual(cores.normal, cores.comp);
    console.log('ok 2 - ＋ Componente no ambiente: busca só componentes, entra na lista com nome e quantidade, vai pro pedido');

    // Personalização na linha do item (só item com personalização cadastrada)
    const sel = cat.locator('[data-pa-item="1"] [data-cpj-personalizar]');
    await sel.waitFor({ timeout: 8000 });
    assert.equal(await cat.locator('[data-pa-item="c1"] [data-cpj-personalizar]').count(), 0, 'componente sem personalização não tem seletor');
    await sel.click();await dlg.locator('[data-pers-opcao="o1"]').click();await dlg.locator('[type=submit]').click();
    await page.waitForFunction(() => (window.__sincronizados.at(-1)?.dados?.ambientes?.[0]?.itens || []).some((i) => i.item_id === '1' && i.personalizacao_id === 'pers1'), null, { timeout: 8000 });
    console.log('ok 2b - personalização escolhida na linha do item vai pro pedido');

    assert.equal(await frame().evaluate(()=>getComputedStyle(document.querySelector('.pa-pers-chip')).backgroundColor),'rgb(240, 233, 250)');
    // Prévia/PDF
    await frame().evaluate(() => window.abrirPedidoComercialPedido());
    const previa = cat.locator('.cpj-aba-pedido');
    await previa.waitFor();
    const texto = await previa.innerText();
    assert.match(texto, /Serviços adicionais[\s\S]*Montagem especial[\s\S]*R\$\s?700,00/);
    assert.match(texto, /Tampo Redondo Madeira/);
    assert.match(texto, /Personalização: Pintura/);
    console.log('ok 3 - prévia do pedido mostra os serviços (com total) e o componente');
    assert.deepEqual(errors, []);
    console.log('todos os testes passaram');
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
