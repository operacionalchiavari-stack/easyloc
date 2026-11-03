// Out/2026 — Almoxarifado: aba "Estoque atual" inteira com Em estoque / Reservado / Pré-reserva (material de itens
// personalizados em pedidos), status "Vai faltar", lista de pedidos ao clicar, e o histórico de movimentações em aba
// própria (as "Últimas movimentações" saíram do Estoque atual).
const { chromium } = require('playwright'); const express = require('express'); const assert = require('node:assert/strict');
(async () => {
  const app = express(); app.use(express.static(process.cwd()));
  const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.on('listening', r));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
    const page = await context.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    const produtos = [
      { ID: 'P1', Codigo: 'INS001', Produto: 'TINTA LACA CAQUI', Categoria: 'Pintura', Setor: 'Almoxarifado', Unidade: 'LT', EstoqueAtual: 4, EstoqueMinimo: 2, EstoqueIdeal: 10, ValorCusto: 35.9 },
      { ID: 'P2', Codigo: 'INS002', Produto: 'COLA SPRAY', Categoria: 'Costura', Setor: 'Almoxarifado', Unidade: 'UN', EstoqueAtual: 10, EstoqueMinimo: 1 },
      { ID: 'P3', Codigo: 'INS003', Produto: 'LIXA 120', Categoria: 'Pintura', Setor: 'Almoxarifado', Unidade: 'UN', EstoqueAtual: 30, EstoqueMinimo: 5 },
    ];
    const movs = (n) => Array.from({ length: n }, (_, i) => ({ DataHora: `${String((i % 28) + 1).padStart(2, '0')}/10/2026 10:00:00`, Tipo: i % 3 ? 'saida' : 'entrada', Codigo: 'INS00' + ((i % 3) + 1), Produto: produtos[i % 3].Produto, Unidade: 'UN', Quantidade: i + 1, Responsavel: i % 2 ? 'Ana' : 'Bruno', Solicitante: 'Costura', EstoqueAnterior: 10, EstoqueAtual: 9, Observacoes: '' }));
    await context.route('https://easyloc-zeta.vercel.app/api/gs', async (route) => {
      const { fn, args } = JSON.parse(route.request().postData());
      let resultado = null;
      if (fn === 'getDashboardAlmoxarifadoJSON') resultado = JSON.stringify({ ok: true, totalItens: 466, abaixoMinimo: 2, emprestimosAbertos: 3, produtos, movimentacoes: movs(20), emprestimos: [], contagens: [], metas: [] });
      else if (fn === 'listarMovimentacoes') { assert.ok(args[0] >= 1000); resultado = movs(60); }
      else resultado = [];
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, resultado }) });
    });
    await context.route(/cdn\.jsdelivr|fonts\.g|unpkg|cdnjs/, (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
    await context.addInitScript(() => {
      sessionStorage.setItem('empresa_id', 'emp-1');
      window.__rpc = [];
      window.__solicitacoes = [
        { id: 's1', numero: 1, criado_em: '2026-10-22T13:00:00Z', codigo: 'INS001', produto: 'TINTA LACA CAQUI', unidade: 'LT', estoque_no_pedido: 2, estoque_minimo: 2, estoque_ideal: 10, quantidade: 8, status: 'aberta', origem: 'automatica', fase: 'aguardando', rotulo: 'Aguardando Compras', pode_cancelar: true },
        { id: 's2', numero: 2, criado_em: '2026-10-20T13:00:00Z', codigo: 'INS002', produto: 'COLA SPRAY', unidade: 'UN', estoque_no_pedido: 1, estoque_minimo: 1, estoque_ideal: 6, quantidade: 5, status: 'comprada', origem: 'automatica', fase: 'concluida', rotulo: 'Recebido · PC-000003', pode_cancelar: false },
        { id: 's3', numero: 3, criado_em: '2026-10-19T13:00:00Z', codigo: 'INS003', produto: 'LIXA 120', unidade: 'UN', estoque_no_pedido: 5, estoque_minimo: 5, estoque_ideal: 20, quantidade: 15, status: 'aberta', origem: 'automatica', fase: 'andamento', rotulo: 'Em cotação · SC-000002', pode_cancelar: false },
      ];
      window.supabaseClient = {
        rpc: async (nome, args) => { window.__rpc.push([nome, args]); return { data: nome === 'almox_reservas_personalizacao' ? [
          { produto_id: 'P1', reservado: 6, pre_reserva: 0, pedidos: [{ numero: '2104', cliente: 'Ana Lima', data_evento: '2026-11-02', tipo: 'res', quantidade: 6 }] },
          { produto_id: 'P2', reservado: 4, pre_reserva: 9, pedidos: [{ numero: '2117', cliente: 'Bia', data_evento: '2026-11-05', tipo: 'res', quantidade: 4 }, { numero: '2123', cliente: 'Caio', data_evento: '2026-11-09', tipo: 'pre', quantidade: 9 }] },
        ] : nome === 'operacao_cadastros_config' ? {categorias:['Pintura','Costura','Tecidos'],setores:['Almoxarifado','Forracao','Costura'],custos:{custo_hora:30,margem:40,complexidades:{simples:0,media:20,alta:50}}} : nome === 'almox_compra_config' ? { automatica: true } : nome === 'almox_solicitacoes_lista' ? JSON.parse(JSON.stringify(window.__solicitacoes))
          : nome === 'almox_solicitacao_cancelar' ? (Object.assign(window.__solicitacoes.find((x) => x.id === args.p_id), { status: 'cancelada', fase: 'cancelada', rotulo: 'Cancelada', pode_cancelar: false, observacao: args.p_motivo, concluida_por_nome: 'Ana' }), { ok: true })
          : nome === 'almox_produto_editar' ? { ok: true } : [], error: null }; },
        from: (tabela) => { const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, then: (ok) => Promise.resolve({ data: tabela === 'almox_solicitacoes_compra' ? JSON.parse(JSON.stringify(window.__solicitacoes)) : [], error: null }).then(ok) }; return q; },
        auth: { getSession: async () => ({ data: { session: null } }) },
      };
    });
    await page.goto(`http://localhost:${server.address().port}/Modulos/Chiavari/Almoxarifado/almoxarifado.html`);
    await page.waitForFunction(() => document.querySelectorAll('#tbodyProdutos tr').length === 3, null, { timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('#tbodyProdutos .almox-reserva-link'), null, { timeout: 8000 });

    const abas = await page.locator('.tabs .tab-btn').allTextContents();
    const nomes = abas.map((t) => t.replace(/\d+/g, '').trim());
    assert.ok(nomes.includes('Estoque atual') && nomes.includes('Histórico'));
    assert.ok(!nomes.includes('Enviar comunicado') && !nomes.includes('Cadastro de insumos') && !nomes.includes('Usuários'), 'abas removidas: ' + nomes);
    assert.equal((await page.locator('.tab-btn[data-tab="dashboard"] .tab-badge').innerText()).trim(), '2');
    assert.equal(await page.locator('#tab-dashboard').getByText('Últimas movimentações').count(), 0, 'Últimas movimentações saiu do Estoque atual');
    const cab = (await page.locator('#tab-dashboard thead th').allTextContents()).map((t) => t.trim());
    assert.deepEqual(cab.slice(5), ['Em estoque', 'Reservado', 'Pré-reserva', 'Mínimo', 'Ideal', 'Custo', 'Reposi\u00e7\u00e3o', 'Status']);
    const larg = await page.evaluate(() => { const p = document.querySelector('#tab-dashboard .panel').getBoundingClientRect().width; return p / document.querySelector('#tab-dashboard').getBoundingClientRect().width; });
    assert.ok(larg > 0.95, 'Estoque atual ocupa a aba inteira: ' + larg);
    assert.deepEqual(await page.evaluate(() => window.__rpc.find((x) => x[0] === 'almox_reservas_personalizacao')), ['almox_reservas_personalizacao', { p_empresa_id: 'emp-1' }]);
    const linha = (cod) => page.locator('#tbodyProdutos tr', { hasText: cod }).locator('td').allTextContents();
    const l1 = (await linha('INS001')).map((t) => t.trim()); const l2 = (await linha('INS002')).map((t) => t.trim()); const l3 = (await linha('INS003')).map((t) => t.trim());
    assert.deepEqual(l1.slice(5), ['4', '6', '0', '2', '10', 'R$ 35,90', 'definir', 'Vai faltar']);
    assert.deepEqual(l2.slice(5), ['10', '4', '9', '1', 'definir', 'definir', 'definir', 'Falta se fechar']);
    assert.deepEqual(l3.slice(5), ['30', '0', '0', '5', 'definir', 'definir', 'definir', 'OK']);
    assert.equal((await page.locator('#cardTotalItens').innerText()).trim(), '466 itens cadastrados');
    assert.equal((await page.locator('.tab-btn[data-tab="emprestimos"] .tab-badge').innerText()).trim(), '3');
    assert.equal(await page.locator('.topbar .card').count(),0);
    assert.equal(await page.locator('#cardMeta,#cardAssertividade,#cardEstoqueTotal,#cardTetoGastos').count(),0);
    const topo=await page.locator('.topbar').boundingBox();assert.ok(topo.height<=70);
    assert.ok((await page.locator('.tab-btn[data-tab="dashboard"]').boundingBox()).height<=38);
    assert.ok((await page.locator('.almox-btn-cadastrar').boundingBox()).height<=38);
    await page.screenshot({ path: process.env.SHOT || require('os').tmpdir() + '/almox.png' });
    console.log('ok 1 - Estoque atual: aba inteira, colunas Em estoque / Reservado / Pré-reserva e status pelo que vai faltar');

    await page.locator('#tbodyProdutos tr', { hasText: 'INS002' }).locator('.almox-reserva-link.is-pre').click();
    const dlg = page.locator('#almoxReservasDialog');
    await dlg.waitFor();
    const txt = await dlg.innerText();
    assert.match(txt, /COLA SPRAY/); assert.match(txt, /2117[\s\S]*Bia[\s\S]*Reservado/); assert.match(txt, /2123[\s\S]*Caio[\s\S]*Pré-reserva/);
    await dlg.getByRole('button', { name: 'Fechar' }).click();
    await page.locator('.tab-btn[data-tab="dashboard"] .tab-badge').click({ force: true });
    await page.locator('#modalAbaixoMinimo:not(.hidden)').waitFor();
    await page.evaluate(() => fecharModalAbaixoMinimo());
    await page.click('.almox-btn-cadastrar');
    await page.locator('#tab-cadastro.active').waitFor();
    assert.ok(await page.locator('.tab-btn[data-tab="dashboard"].active').count(), 'Estoque atual continua marcado no cadastro');
    await page.waitForFunction(()=>window.__almoxCadastros?.setores.length>0);
    await page.evaluate(()=>abrirTab('dashboard'));await page.locator('#filtroSetorArmazenamento').selectOption('Costura');assert.equal(await page.locator('#tbodyProdutos tr').count(),0);await page.locator('#filtroSetorArmazenamento').selectOption('');assert.equal(await page.locator('#tbodyProdutos tr').count(),3);await page.screenshot({path:'.tmp/almox-lista-insumos.png',fullPage:true});await page.evaluate(()=>abrirTab('cadastro'));
    await page.locator('#prodNome').fill('Tecido do setor');
    await page.locator('#cadCategoria').selectOption('Tecidos');
    await page.locator('#prodSetor').selectOption('Forracao');
    await page.locator('#prodValorCusto').fill('1.234,56');
    await page.locator('#prodReposicaoPercentual').fill('25');
    assert.match(await page.locator('#prodValorReposicao').inputValue(),/1\.543,20/);
    await page.evaluate(()=>limparFormProduto());
    assert.equal(await page.locator('#cadCategoria').inputValue(),'');
    assert.equal(await page.locator('#cadUnidade').inputValue(),'');
    await page.getByRole('button', { name: '← Voltar ao estoque' }).click();
    await page.locator('#tab-dashboard.active').waitFor();
    console.log('ok 2 - clicar no reservado mostra os pedidos');

    await page.locator('.tab-btn[data-tab="historico"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#tbodyMovRecentes tr').length === 60, null, { timeout: 8000 });
    await page.selectOption('#histTipo', 'entrada');
    assert.equal(await page.locator('#tbodyMovRecentes tr').count(), 20);
    await page.selectOption('#histTipo', '');
    await page.click('#histBusca'); await page.fill('#histBusca', 'ana');
    assert.equal(await page.locator('#tbodyMovRecentes tr').count(), 30);
    await page.fill('#histBusca', '');
    await page.fill('#histDe', '2026-10-01'); await page.fill('#histAte', '2026-10-02');
    await page.locator('#histAte').dispatchEvent('change');
    const nDatas = await page.locator('#tbodyMovRecentes tr').count();
    assert.ok(nDatas > 0 && nDatas < 10, 'filtro por período: ' + nDatas);
    console.log('ok 3 - Histórico de movimentações: aba própria, completo, com busca, tipo e período');

    await page.evaluate(() => abrirTab('dashboard'));
    const cel = (cod, campo) => page.locator(`#tbodyProdutos tr:has-text("${cod}") td[data-campo="${campo}"]`);
    const ultimaEdicao = () => page.evaluate(() => window.__rpc.filter((x) => x[0] === 'almox_produto_editar').pop());
    // Ideal menor que o mínimo: recusado na tela, nada vai pro banco
    await cel('INS003', 'ideal').click();
    await cel('INS003', 'ideal').locator('input').fill('3');
    page.once('dialog', (d) => d.accept());
    await cel('INS003', 'ideal').locator('input').press('Enter');
    assert.equal(await ultimaEdicao(), undefined);
    await cel('INS003', 'ideal').locator('input').fill('40');
    await cel('INS003', 'ideal').locator('input').press('Enter');
    await page.waitForFunction(() => window.__rpc.some((x) => x[0] === 'almox_produto_editar'));
    assert.deepEqual(await ultimaEdicao(), ['almox_produto_editar', { p_empresa: 'emp-1', p_produto_id: 'P3', p_dados: { ideal: 40 } }]);
    await page.waitForFunction(() => document.querySelector('#tbodyProdutos tr:nth-child(3) td[data-campo="ideal"]')?.textContent.trim() === '40');
    // Custo com vírgula e Tab vai pro próximo campo
    await cel('INS003', 'custo').click();
    await cel('INS003', 'custo').locator('input').fill('12,50');
    await cel('INS003', 'custo').locator('input').press('Enter');
    await page.waitForFunction(() => /12,50/.test(document.querySelector('#tbodyProdutos tr:nth-child(3) td[data-campo="custo"]')?.textContent || ''));
    assert.deepEqual((await ultimaEdicao())[1].p_dados, { custo: 12.5, reposicao:25 });
    await cel('INS002', 'categoria').click();
    await cel('INS002', 'categoria').locator('select').selectOption('Tecidos');
    await cel('INS002', 'categoria').locator('select').press('Tab');
    await page.waitForFunction(() => document.querySelector('#tbodyProdutos tr:nth-child(2) td[data-campo="setor"] select'));
    assert.deepEqual((await ultimaEdicao())[1].p_dados, { categoria: 'Tecidos' });
    await cel('INS002', 'setor').locator('select').press('Escape');
    assert.equal((await cel('INS002', 'categoria').innerText()).trim(), 'Tecidos');
    assert.equal(await page.locator('#tbodyProdutos input').count(), 0);
    // Código, produto, unidade e estoque não viram campo
    await page.locator('#tbodyProdutos tr:has-text("INS002") td').nth(1).click();
    assert.equal(await page.locator('#tbodyProdutos input').count(), 0);
    console.log('ok 4 - categoria, setor, mínimo, ideal e custo editáveis na própria tabela');

    assert.equal((await page.locator('#badgeCompras').innerText()).trim(), '2', 'badge = aguardando + em andamento');
    await page.locator('.tab-btn[data-tab="compras"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#tbodyCompras tr[data-solicitacao]').length === 2);
    assert.ok(await page.isHidden('#comprasAviso'), 'com a compra automática ligada não há aviso');
    assert.match(await page.locator('#tbodyCompras tr').first().innerText(), /TINTA LACA CAQUI[\s\S]*8 LT[\s\S]*Aguardando Compras/);
    assert.match(await page.locator('#tbodyCompras tr[data-solicitacao="s3"]').innerText(), /Em cotação · SC-000002/);
    assert.equal(await page.locator('#tab-compras').getByRole('button', { name: 'Comprada' }).count(), 0, 'o Almoxarifado não marca comprado');
    assert.equal(await page.locator('#tbodyCompras tr[data-solicitacao="s3"] button').count(), 0, 'em cotação não cancela por aqui');
    await page.selectOption('#comprasFiltro', '');
    assert.equal(await page.locator('#tbodyCompras tr[data-solicitacao]').count(), 3);
    await page.selectOption('#comprasFiltro', 'concluida');
    assert.match(await page.locator('#tbodyCompras').innerText(), /COLA SPRAY[\s\S]*Recebido · PC-000003/);
    await page.selectOption('#comprasFiltro', 'andamento');
    await page.locator('#tbodyCompras tr[data-solicitacao="s1"]').getByRole('button', { name: 'Cancelar' }).click();
    await page.waitForSelector('#almoxCancelarDialog[open]');
    await page.locator('#almoxCancelarOk').click();
    assert.match(await page.locator('#almoxCancelarErro').innerText(), /motivo/);
    assert.equal(await page.evaluate(() => window.__rpc.filter((x) => x[0] === 'almox_solicitacao_cancelar').length), 0, 'sem motivo não cancela');
    await page.fill('#almoxCancelarMotivo', 'Compramos por outro fornecedor');
    await page.locator('#almoxCancelarOk').click();
    await page.waitForFunction(() => !document.querySelector('#almoxCancelarDialog[open]') && document.querySelectorAll('#tbodyCompras tr[data-solicitacao]').length === 1);
    assert.deepEqual(await page.evaluate(() => window.__rpc.find((x) => x[0] === 'almox_solicitacao_cancelar')), ['almox_solicitacao_cancelar', { p_empresa: 'emp-1', p_id: 's1', p_motivo: 'Compramos por outro fornecedor' }]);
    assert.equal((await page.locator('#badgeCompras').innerText()).trim(), '1');
    await page.selectOption('#comprasFiltro', 'cancelada');
    assert.match(await page.locator('#tbodyCompras').innerText(), /Cancelada[\s\S]*Motivo: Compramos por outro fornecedor/);
    await page.screenshot({ path: (process.env.SHOT || require('os').tmpdir() + '/almox.png').replace('.png', '-compras.png') });
    console.log('ok 5 - Solicitações de compra: só a situação vinda de Compras e cancelar com motivo obrigatório');
    assert.deepEqual(errors, []);
    console.log('todos os testes passaram');
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
