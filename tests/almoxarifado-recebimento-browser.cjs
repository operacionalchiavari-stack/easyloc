// Out/2026 — Almoxarifado > Recebimento: pedido de compra de Compras chega; receber com XML (5 etapas: nota, vínculo
// com memória do fornecedor, conferência, divergência com foto, revisão com valores/pagamento quando o parâmetro deixa)
// e sem XML (começa na conferência; valores ficam com Compras). Banco simulado no navegador (almox_receb_*).
const { chromium } = require('playwright'); const express = require('express'); const assert = require('node:assert/strict');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
const XML = `<?xml version="1.0" encoding="UTF-8"?><nfeProc><NFe><infNFe Id="NFe35261011222333000181550010000123451000012345">
<ide><nNF>12345</nNF><serie>1</serie><dhEmi>2026-10-21T10:00:00-03:00</dhEmi></ide>
<emit><CNPJ>11222333000181</CNPJ><xNome>Tintas Sul Ltda</xNome></emit>
<det nItem="1"><prod><cProd>FOR-1</cProd><cEAN>SEM GTIN</cEAN><xProd>TINTA LACA CAQUI 3,6L</xProd><uCom>LT</uCom><qCom>10</qCom><vUnCom>30</vUnCom><vProd>300</vProd></prod></det>
<det nItem="2"><prod><cProd>FOR-2</cProd><cEAN></cEAN><xProd>COLA SPRAY 500ML</xProd><uCom>UN</uCom><qCom>4</qCom><vUnCom>12</vUnCom><vProd>48</vProd></prod></det>
<total><ICMSTot><vProd>348</vProd><vNF>348</vNF></ICMSTot></total>
<cobr><dup><nDup>001</nDup><dVenc>2026-11-20</dVenc><vDup>174</vDup></dup><dup><nDup>002</nDup><dVenc>2026-12-20</dVenc><vDup>174</vDup></dup></cobr>
</infNFe></NFe></nfeProc>`;

(async () => {
  const app = express(); app.use(express.static(process.cwd()));
  const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.on('listening', r));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
    const page = await context.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    const produtos = [
      { ID: 'P1', Codigo: 'INS001', Produto: 'TINTA LACA CAQUI', Categoria: 'Pintura', Setor: 'Almoxarifado', Unidade: 'LT', EstoqueAtual: 4, EstoqueMinimo: 2, EstoqueIdeal: 10 },
      { ID: 'P2', Codigo: 'INS002', Produto: 'COLA SPRAY', Categoria: 'Costura', Setor: 'Almoxarifado', Unidade: 'UN', EstoqueAtual: 10, EstoqueMinimo: 1 },
    ];
    await context.route('https://easyloc-zeta.vercel.app/api/gs', async (route) => {
      const { fn } = JSON.parse(route.request().postData());
      const resultado = fn === 'getDashboardAlmoxarifadoJSON' ? JSON.stringify({ ok: true, totalItens: 2, abaixoMinimo: 0, emprestimosAbertos: 0, produtos, movimentacoes: [], emprestimos: [], contagens: [], metas: [] }) : [];
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, resultado }) });
    });
    await context.route(/cdn\.jsdelivr|fonts\.g|unpkg|cdnjs/, (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
    await context.addInitScript((produtos) => {
      sessionStorage.setItem('empresa_id', 'emp-1');
      const nomes = Object.fromEntries(produtos.map((p) => [p.ID, p]));
      window.__rpc = []; window.__editaFin = true;
      const db = window.__db = {
        pedidos: [
          { id: 'ped-7', numero: 7, status: 'aguardando_recebimento', fornecedor: 'Tintas Sul Ltda', fornecedor_cnpj: '11.222.333/0001-81', prazo: '2026-10-25', valor_total: 348,
            itens: [{ id: 'it-a', material_id: 'P1', nome: 'TINTA LACA CAQUI', unidade: 'LT', quantidade: 10, quantidade_recebida: 0, valor_unitario: 30 },
                    { id: 'it-b', material_id: 'P2', nome: 'COLA SPRAY', unidade: 'UN', quantidade: 4, quantidade_recebida: 0, valor_unitario: 12 }] },
          { id: 'ped-8', numero: 8, status: 'aguardando_recebimento', fornecedor: 'Papelaria X', fornecedor_cnpj: '', prazo: '2026-10-28', valor_total: 60,
            itens: [{ id: 'it-c', material_id: 'P2', nome: 'COLA SPRAY', unidade: 'UN', quantidade: 5, quantidade_recebida: 0, valor_unitario: 12 }] },
        ],
        recs: [], memoria: { 'FOR-1': 'P1' },
      };
      const saldo = (p) => p.itens.map((i) => ({ ...i, saldo: i.quantidade - i.quantidade_recebida }));
      const obter = (id) => {
        const r = db.recs.find((x) => x.id === id); const p = db.pedidos.find((x) => x.id === r.pedido_id);
        return JSON.parse(JSON.stringify({ ...r, pedido: { id: p.id, numero: p.numero, status: p.status, itens: saldo(p), parcelas: p.parcelas || null }, edita_financeiro: window.__editaFin, divergencias: [] }));
      };
      const completar = (i) => { const p = nomes[i.produto_id]; Object.assign(i, p ? { produto_nome: p.Produto, produto_codigo: p.Codigo, unidade_interna: p.Unidade } : { produto_nome: null }); };
      const fn = {
        almox_compra_config: () => ({ automatica: true, edita_financeiro: window.__editaFin }),
        almox_solicitacoes_lista: () => [],
        almox_reservas_personalizacao: () => [],
        almox_receb_pedidos: () => db.pedidos.filter((p) => p.status !== 'recebido').map((p) => { const r = db.recs.find((x) => x.pedido_id === p.id && x.status === 'rascunho'); return { ...p, itens: saldo(p), rascunho: r ? { id: r.id, numero: r.numero, etapa: r.etapa, origem: r.origem } : null }; }),
        almox_receb_listar: () => db.recs.map((r) => ({ ...r, pedido_numero: db.pedidos.find((p) => p.id === r.pedido_id).numero, itens_count: r.itens.length, divergencias: 0 })),
        almox_receb_criar: ({ p_dados: d }) => {
          const p = db.pedidos.find((x) => x.id === d.pedido_id); const n = db.recs.length + 1;
          const base = { id: 'rec-' + n, numero: n, pedido_id: p.id, origem: d.origem, status: 'rascunho', etapa: d.origem === 'manual' ? 3 : 2, numero_nf: d.nota.numero, serie: d.nota.serie || null,
            emissao: d.nota.emissao, chave_nfe: d.nota.chave || null, fornecedor_nome: d.nota.fornecedor || p.fornecedor, fornecedor_cnpj: d.nota.cnpj || null, valor_total: d.nota.valor_total || p.valor_total, duplicatas: d.nota.duplicatas || [], created_at: '2026-10-22T12:00:00Z' };
          base.itens = d.origem === 'manual'
            ? saldo(p).map((i, k) => ({ id: base.id + '-i' + k, descricao_nf: i.nome, unidade_nf: i.unidade, quantidade_nf: i.saldo, valor_unitario_nf: i.valor_unitario, valor_unitario: i.valor_unitario, produto_id: i.material_id, pedido_item_id: i.id, fator_conversao: 1, controla_estoque: true, quantidade_recebida: 0, quantidade_avariada: 0, divergencia_fotos: [] }))
            : d.itens.map((i, k) => { const pid = db.memoria[i.codigo_fornecedor] || null; return { id: base.id + '-i' + k, descricao_nf: i.descricao, codigo_fornecedor: i.codigo_fornecedor, unidade_nf: i.unidade, quantidade_nf: i.quantidade, valor_unitario_nf: i.valor_unitario, valor_unitario: i.valor_unitario, produto_id: pid, pedido_item_id: pid ? p.itens.find((x) => x.material_id === pid).id : null, fator_conversao: 1, controla_estoque: true, quantidade_recebida: 0, quantidade_avariada: 0, divergencia_fotos: [] }; });
          base.itens.forEach(completar);
          db.recs.push(base); return base.id;
        },
        almox_receb_obter: ({ p_id }) => obter(p_id),
        almox_receb_salvar: ({ p_id, p_dados }) => {
          const r = db.recs.find((x) => x.id === p_id);
          (p_dados.itens || []).forEach((it) => { const i = r.itens.find((x) => x.id === it.id); Object.assign(i, it); i.produto_id = it.produto_id || null; i.pedido_item_id = it.pedido_item_id || null; completar(i); });
          if (p_dados.observacao != null) r.observacao = p_dados.observacao;
          r.etapa = Math.max(r.etapa, Math.min(5, p_dados.etapa || r.etapa));
          return obter(p_id);
        },
        almox_receb_concluir: ({ p_id }) => { const r = db.recs.find((x) => x.id === p_id); r.status = 'concluido'; r.concluido_em = '2026-10-22T13:00:00Z'; r.concluido_por_nome = 'Ana'; const p = db.pedidos.find((x) => x.id === r.pedido_id); p.status = 'recebido'; return { ok: true, divergencias: r.itens.filter((i) => i.quantidade_avariada > 0).length }; },
        almox_receb_excluir: () => null,
      };
      window.supabaseClient = {
        rpc: async (nome, args) => { window.__rpc.push([nome, JSON.parse(JSON.stringify(args))]); try { return { data: fn[nome] ? fn[nome](args) : [], error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } },
        from: () => { const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, then: (ok) => Promise.resolve({ data: [], error: null }).then(ok) }; return q; },
        auth: { getSession: async () => ({ data: { session: null } }) },
      };
    }, produtos);
    const chamadas = (nome) => page.evaluate((n) => window.__rpc.filter((x) => x[0] === n).map((x) => x[1]), nome);
    const fluxo = page.locator('#recebFluxoView');

    await page.goto(`http://localhost:${server.address().port}/Modulos/Chiavari/Almoxarifado/almoxarifado.html?aba=recebimento`);
    await page.waitForFunction(() => document.querySelectorAll('#tbodyRecebPedidos tr').length === 2 && document.querySelector('#tab-recebimento.active'), null, { timeout: 15000 });
    assert.equal((await page.locator('#badgeRecebimento').innerText()).trim(), '2');
    assert.match(await page.locator('#tbodyRecebPedidos tr').first().innerText(), /PC-000007[\s\S]*Tintas Sul[\s\S]*TINTA LACA CAQUI \(10 LT\)/);
    console.log('ok 1 - aba Recebimento: pedidos de Compras a receber, com badge e link direto (?aba=recebimento)');

    // ---------- com XML
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-receb-nova-xml]').click()]);
    await chooser.setFiles({ name: 'nota.xml', mimeType: 'application/xml', buffer: Buffer.from(XML) });
    await page.waitForSelector('#recebPreviaIniciar');
    assert.equal(await page.inputValue('#recebPreviaPedido'), 'ped-7', 'pedido achado pelo CNPJ da nota');
    assert.match(await fluxo.innerText(), /12345 \/ série 1[\s\S]*Tintas Sul[\s\S]*20\/11\/2026: R\$\s174,00/);
    await page.locator('#recebPreviaIniciar').click();
    await page.waitForSelector('.receb-step.is-ativo:has-text("Vincular produtos")');
    const criar = (await chamadas('almox_receb_criar'))[0].p_dados;
    assert.equal(criar.origem, 'xml'); assert.equal(criar.nota.chave, '35261011222333000181550010000123451000012345');
    assert.equal(criar.nota.duplicatas.length, 2); assert.equal(criar.itens[1].codigo_fornecedor, 'FOR-2'); assert.equal(criar.itens[0].gtin, null);
    assert.equal(await page.inputValue('tr[data-item="rec-1-i0"] [data-campo="material"]'), 'INS001 · TINTA LACA CAQUI', 'memória do fornecedor já vinculou');
    await fluxo.getByRole('button', { name: 'Salvar e avançar →' }).click();
    assert.match(await page.locator('#recebAviso').innerText(), /Vincule "COLA SPRAY 500ML"/);
    await page.fill('tr[data-item="rec-1-i1"] [data-campo="material"]', 'INS002 · COLA SPRAY');
    await page.locator('tr[data-item="rec-1-i1"] [data-campo="material"]').dispatchEvent('change');
    assert.equal(await page.inputValue('tr[data-item="rec-1-i1"] [data-campo="pedido_item_id"]'), 'it-b', 'item do pedido sugerido pelo material');
    await fluxo.getByRole('button', { name: 'Salvar e avançar →' }).click();
    await page.waitForSelector('.receb-step.is-ativo:has-text("Conferir mercadorias")');
    const salvo = (await chamadas('almox_receb_salvar')).pop().p_dados;
    assert.equal(salvo.etapa, 3); assert.deepEqual(salvo.itens.map((i) => [i.id, i.produto_id, i.pedido_item_id]), [['rec-1-i1', 'P2', 'it-b']]);
    console.log('ok 2 - com XML: lê a nota (itens, chave, parcelas), acha o pedido pelo CNPJ, vincula com memória e sugere o item do pedido');

    await fluxo.getByRole('button', { name: 'Tudo conferido igual à nota' }).click();
    await page.fill('tr[data-item="rec-1-i0"] [data-campo="quantidade_avariada"]', '1');
    assert.equal((await page.locator('tr[data-item="rec-1-i0"] [data-entra]').innerText()).trim(), '9 LT');
    await fluxo.getByRole('button', { name: 'Salvar e avançar →' }).click();
    await page.waitForSelector('.receb-step.is-ativo:has-text("Divergências")');
    assert.equal(await page.locator('.receb-div').count(), 1);
    await fluxo.getByRole('button', { name: 'Salvar e avançar →' }).click();
    assert.match(await page.locator('#recebAviso').innerText(), /Descreva a divergência/);
    await page.fill('.receb-div [data-campo="divergencia_descricao"]', '1 lata amassada');
    await fluxo.getByRole('button', { name: 'Salvar e avançar →' }).click();
    assert.match(await page.locator('#recebAviso').innerText(), /foto/);
    await page.setInputFiles('.receb-div [data-foto-add]', { name: 'lata.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForSelector('.receb-fotos figure img');
    await fluxo.getByRole('button', { name: 'Salvar e avançar →' }).click();
    await page.waitForSelector('.receb-step.is-ativo:has-text("Revisar e concluir")');
    const div = (await chamadas('almox_receb_salvar')).pop().p_dados.itens.find((i) => i.id === 'rec-1-i0');
    assert.equal(div.quantidade_avariada, 1); assert.equal(div.quantidade_recebida, 10); assert.match(div.divergencia_fotos[0].conteudo, /^data:image\/jpeg;base64,/);
    console.log('ok 3 - conferência (tudo igual à nota + avaria) e divergência com descrição e foto obrigatórias');

    assert.equal(await page.locator('[data-parc]').count(), 2, 'parcelas vêm do XML');
    assert.equal(await page.inputValue('[data-parc="1"] [data-parc-campo="vencimento"]'), '2026-12-20');
    await page.fill('[data-parc="1"] [data-parc-campo="valor"]', '100');
    assert.match(await page.locator('[data-fin-soma]').innerText(), /diferente do total/);
    await page.fill('[data-parc="1"] [data-parc-campo="valor"]', '174');
    await page.selectOption('[data-fin="forma"]', 'pix');
    await fluxo.getByRole('button', { name: 'Concluir recebimento' }).click();
    await page.waitForSelector('#recebFluxoView .badge-ok:has-text("Concluído")');
    const concl = (await chamadas('almox_receb_concluir'))[0];
    assert.deepEqual(concl.p_financeiro.parcelas, [{ vencimento: '2026-11-20', valor: 174 }, { vencimento: '2026-12-20', valor: 174 }]);
    assert.equal(concl.p_financeiro.forma, 'pix'); assert.equal(concl.p_financeiro.total, 348);
    assert.match(await page.locator('#recebAviso').innerText(), /concluído[\s\S]*1 divergência/);
    assert.equal(await fluxo.locator('.receb-corpo input:not([disabled]), .receb-corpo textarea:not([disabled])').count(), 0, 'concluído fica só de leitura');
    await page.screenshot({ path: (process.env.SHOT || require('os').tmpdir() + '/almox.png').replace('.png', '-recebimento.png'), fullPage: true });
    console.log('ok 4 - revisar e concluir: parcelas da nota, soma conferida, envio ao Contas a Pagar (parâmetro ligado)');

    // ---------- sem XML, parâmetro desligado
    await page.evaluate(() => { window.__editaFin = false; });
    await fluxo.getByRole('button', { name: 'Fechar' }).click();
    await page.waitForFunction(() => document.querySelectorAll('#tbodyRecebPedidos tr').length === 1);
    assert.equal((await page.locator('#badgeRecebimento').innerText()).trim(), '1');
    assert.match(await page.locator('#tbodyRecebLista').innerText(), /R-00001[\s\S]*NF 12345\/1[\s\S]*Concluído/);
    await page.locator('#tbodyRecebPedidos').getByRole('button', { name: 'Sem XML' }).click();
    await page.waitForSelector('#recebManualDialog[open]');
    await page.locator('#recebManualDialog').getByRole('button', { name: 'Iniciar recebimento' }).click();
    assert.ok(await page.locator('#recebManualDialog[open]').count(), 'sem número da nota não inicia');
    await page.fill('#recebManualDialog [name="numero"]', '889');
    await page.locator('#recebManualDialog').getByRole('button', { name: 'Iniciar recebimento' }).click();
    await page.waitForSelector('.receb-step.is-ativo:has-text("Conferir mercadorias")');
    assert.equal((await chamadas('almox_receb_criar'))[1].p_dados.origem, 'manual');
    assert.ok(await page.locator('.receb-step:has-text("Vincular produtos")').isDisabled(), 'sem XML pula o vínculo');
    await page.fill('tr[data-item="rec-2-i0"] [data-campo="quantidade_recebida"]', '5');
    await fluxo.getByRole('button', { name: 'Salvar e avançar →' }).click();
    await page.waitForSelector('.receb-ok');
    await fluxo.getByRole('button', { name: 'Salvar e avançar →' }).click();
    await page.waitForSelector('.receb-step.is-ativo:has-text("Revisar e concluir")');
    assert.match(await page.locator('.receb-fin').innerText(), /Ficam com Compras/);
    assert.equal(await page.locator('[data-fin]').count(), 0);
    await fluxo.getByRole('button', { name: 'Concluir recebimento' }).click();
    await page.waitForSelector('#recebFluxoView .badge-ok:has-text("Concluído")');
    assert.equal((await chamadas('almox_receb_concluir'))[1].p_financeiro, null);
    console.log('ok 5 - sem XML: começa na conferência e, sem o parâmetro, valores e pagamento ficam com Compras');

    await page.setViewportSize({ width: 420, height: 900 });
    // a barra de abas do Almoxarifado já rola de lado no celular; aqui vale só a tela do recebimento
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#tab-recebimento *')].filter((e) => !e.closest('.table-wrap, .receb-steps') && e.getBoundingClientRect().right > innerWidth + 1).map((e) => e.className)), [], 'recebimento sem nada saindo da tela no celular');
    assert.deepEqual(errors, []);
    console.log('todos os testes passaram');
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
