// Out/2026 — Pedido comercial: Plantas é etapa depois de Ambientes e lista. Clicar num ponto da planta abre a escolha do
// FORMATO (foto renderizada) daquele lugar; a legenda mostra a foto escolhida e o renderId vai pro pedido.
const { chromium } = require('playwright'); const express = require('express'); const assert = require('node:assert/strict');
const { installMock } = require('./mock-projetos.cjs');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const { createCanvas } = require('@napi-rs/canvas');
function fotoTeste(cor) {
  const canvas = createCanvas(600, 300), ctx = canvas.getContext('2d');
  ctx.fillStyle = cor; ctx.fillRect(0, 0, 600, 300);
  return canvas.toBuffer('image/png');
}
const FOTO_RENDER = fotoTeste('#ec3060'), FOTO_PLANTA = fotoTeste('#d8e2e8');
(async () => {
  const app = express();
  app.get('/host-pedido.html', (req, res) => {
    res.type('html').send(`<!doctype html><html><body style="margin:0">
<script>
  window.__pedidoClienteAtual = { nome: 'Lis Baêtas', foto: '' };
  const projeto = { id: 'ped-1', noivos: 'Lis Baêtas', data_evento: '2026-11-11', local_evento: 'Vale dos Desejos', status: 'rascunho',
    dados: { ambientes: [{ id: 'a1', nome: 'Lounge', itens: [{ item_id: '1', quantidade: 2 }], renders: [{ id: 'r9', url: 'https://fixture/r9.png', origem: '3D Livre', cena: { url: 'https://fixture/sem-cena.json', path: 'x/sem.json', tipo: 'print' } }], notas: '' }, { id: 'a2', nome: 'Bar', itens: [], renders: [{ id: 'r1', url: 'https://fixture/render.png', origem: '3D Livre', cena: { url: 'https://fixture/cena.json', path: 'x/cena.json', tipo: 'print' } }], notas: '' }], plantas: [{ id: 'p1', nome: 'Planta 1', url: 'https://fixture/planta.png', path: 'x/planta.png', legendas: [] }] } };
  window.__sincronizados = [];
  window.pedidoProjetoCatalogo = () => structuredClone(projeto);
  window.pedidoMetadadosCatalogo = () => ({ noivos: projeto.noivos, data_evento: projeto.data_evento, data_evento_fim: null, local_evento: projeto.local_evento });
  window.pedidoSincronizarProjetoCatalogo = async (p) => { window.__sincronizados.push(structuredClone(p)); };
  window.__pedidoIrPara = (d) => { window.__irPara = d; }; window.__pedidoFinanceiroResumo = () => ({ resumo: [{ rotulo: 'Locação', valor: 500 }], total: 500, parcelas: [{ componente: 'locacao', numero: 1, vencimento: '2026-11-01', valor: 500, metodo: 'PIX' }] }); window.__pedidoSincronizarEtapa = () => {}; window.__salvarPedidoOperacional = async () => {};
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
    await context.route('https://fixture/planta.png', r => r.fulfill({ contentType: 'image/png', body: FOTO_PLANTA }));
    await context.route('https://fixture/r9.png', r => r.fulfill({ contentType: 'image/png', body: FOTO_RENDER }));
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
    await frame().evaluate(() => window.abrirPlantasComercialPedido());
    const cat = page.frameLocator('#cat');
    await cat.locator('[data-cpj="planta-abrir"]').waitFor({ timeout: 15000 });
        assert.equal(await cat.locator('.pa-ferramentas [data-cpj="apresentacao"]').count(), 0, 'sem botão de apresentação no pedido');
    assert.match(await cat.locator('.cpj-amb-head p').innerText(), /formato/);
    console.log('ok 1 - Plantas abre na aba do pedido (não volta para a Lista Completa)');
    await cat.locator('[data-cpj="planta-abrir"]').click();
    const stage = cat.locator('[data-cpj-planta-stage]');
    await stage.waitFor();
    await page.waitForTimeout(500);
    const box = await stage.boundingBox();
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
    const dlg = cat.locator('dialog.cpj-modal[open]');
    await dlg.locator('.cpj-planta-formato').first().waitFor();
    assert.match(await dlg.innerText(), /formato desse ponto/i);
    assert.equal(await dlg.locator('.cpj-planta-formato[data-render]:not([data-render=""])').count(), 2, 'as duas fotos renderizadas aparecem');
    assert.deepEqual(await dlg.locator('.cpj-planta-formatos-amb h4').allInnerTexts(), ['LOUNGE', 'BAR']);
    if (process.env.FOTO) await page.screenshot({ path: process.env.FOTO });
    await dlg.locator('.cpj-planta-formato[data-render="r1"]').click();
    await cat.locator('.cpj-planta-label-render').first().waitFor();
    assert.match(await cat.locator('.cpj-planta-label-render').first().getAttribute('src'), /render\.png/);
    await page.waitForFunction(() => window.__sincronizados.at(-1)?.dados?.plantas?.[0]?.legendas?.[0]?.renderId === 'r1', null, { timeout: 8000 });
    const lg = (await page.evaluate(() => window.__sincronizados.at(-1))).dados.plantas[0].legendas[0];
    assert.equal(lg.ambienteId, 'a2');
    if (process.env.FOTO2) await page.screenshot({ path: process.env.FOTO2 });
    console.log('ok 2 - clicar no ponto escolhe o formato; legenda com a foto e renderId no pedido');
    // trocar o formato pela própria legenda
    await cat.locator('.cpj-planta-label').first().click({ position: { x: 20, y: 40 } });
    await dlg.locator('.cpj-planta-formato.is-active[data-render="r1"]').waitFor();
    await dlg.locator('.cpj-planta-formato[data-render="r9"]').click();
    await page.waitForFunction(() => window.__sincronizados.at(-1)?.dados?.plantas?.[0]?.legendas?.[0]?.renderId === 'r9', null, { timeout: 8000 });
    assert.match(await cat.locator('.cpj-planta-label-render').first().getAttribute('src'), /r9\.png/);
    console.log('ok 3 - clicar na legenda troca o formato (o atual vem marcado)');
    // Foto na área branca da folha, inteiramente fora do retângulo central da planta.
    for (let i = 0; i < 5; i++) await cat.locator('[data-cpj="planta-tamanho-menos"]').click();
    const papelEditor = await cat.locator('[data-cpj-planta-pagina]').boundingBox();
    const fotoEditor = await cat.locator('.cpj-planta-label-render').boundingBox();
    await page.mouse.move(fotoEditor.x + fotoEditor.width / 2, fotoEditor.y + fotoEditor.height / 2);
    await page.mouse.down();
    await page.mouse.move(papelEditor.x + papelEditor.width * .4 + fotoEditor.width / 2,
      papelEditor.y + 12 + fotoEditor.height / 2, { steps: 15 });
    await page.mouse.up();
    await page.waitForFunction(() => window.__sincronizados.at(-1)?.dados?.plantas?.[0]?.legendas?.[0]?.pos);
    const posicaoEditor = await frame().evaluate(() => {
      const folha = document.querySelector('[data-cpj-planta-pagina]').getBoundingClientRect();
      const foto = document.querySelector('.cpj-planta-label-render').getBoundingClientRect();
      const planta = document.querySelector('[data-cpj-planta-stage]').getBoundingClientRect();
      return { x: (foto.left - folha.left) / folha.width, y: (foto.top - folha.top) / folha.height,
        w: foto.width / folha.width, h: foto.height / folha.height,
        naAreaBranca: foto.bottom < planta.top && foto.top >= folha.top && foto.right <= folha.right };
    });
    assert.ok(posicaoEditor.naAreaBranca, 'foto inteira na área branca acima da planta');
    // Aba "Pedido": prévia com a planta antes do resumo e das parcelas, e o PDF com a planta também.
    await frame().evaluate(() => window.abrirPedidoComercialPedido());
    await cat.locator('.cpj-aba-pedido .cpj-order-planta-folha').waitFor({ timeout: 20000 });
    const ordem = await frame().evaluate(() => {
      const papel = document.querySelector('.cpj-aba-pedido .cpj-order-paper');
      const pl = papel.querySelector('.cpj-order-plantas'), fin = papel.querySelector('.cpj-order-financeiro');
      const folha = papel.querySelector('.cpj-order-planta-folha');
      return { plantaAntes: !!(pl && fin && (pl.compareDocumentPosition(fin) & Node.DOCUMENT_POSITION_FOLLOWING)),
        imgs: [...folha.querySelectorAll('img')].map(i => i.getAttribute('src')), alto: folha.getBoundingClientRect().height,
        botoes: [...document.querySelectorAll('.cpj-aba-pedido-acoes button')].map(b => b.textContent.trim()) };
    });
    assert.ok(ordem.plantaAntes, 'planta antes do resumo e das parcelas');
    assert.ok(ordem.imgs.some(u => /planta\.png/.test(u)) && ordem.imgs.some(u => /r9\.png/.test(u)), 'planta e a foto da legenda na cópia');
    assert.ok(ordem.alto > 200, 'planta com tamanho de verdade');
    const posicaoPedido = await frame().evaluate(() => {
      const conteudo = document.querySelector('.cpj-order-planta-conteudo');
      const transform = conteudo.style.transform; conteudo.style.transform = 'none';
      const folha = conteudo.querySelector('.cpj-order-planta-folha').getBoundingClientRect();
      const foto = conteudo.querySelector('.cpj-planta-label-render').getBoundingClientRect();
      const posicao = { x: (foto.left - folha.left) / folha.width, y: (foto.top - folha.top) / folha.height,
        w: foto.width / folha.width, h: foto.height / folha.height };
      conteudo.style.transform = transform;
      return posicao;
    });
    for (const chave of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(posicaoEditor[chave] - posicaoPedido[chave]) < .005,
      'posição e tamanho da foto na folha preservados no pedido: ' + chave);
    assert.ok(ordem.botoes.includes('Imprimir') && ordem.botoes.includes('Gerar PDF'));
    assert.ok(ordem.botoes.at(-1).startsWith('Renderizar com IA'));
    assert.equal(await cat.locator('.cpj-layout-mini').count(),2);
    const acoesFit=await cat.locator('.cpj-aba-pedido-topo').evaluate(el=>{const r=el.getBoundingClientRect();return [...el.querySelectorAll('.cpj-aba-pedido-acoes button')].every(b=>b.getBoundingClientRect().right<=r.right+1);});
    assert.ok(acoesFit,'Acoes cabem na lateral do pedido');
    if(process.env.FOTOPEDIDO)await page.screenshot({path:process.env.FOTOPEDIDO,fullPage:true});
    if (process.env.FOTO3) await cat.locator('.cpj-aba-pedido .cpj-order-plantas').screenshot({ path: process.env.FOTO3 });
    await frame().evaluate(() => { window.__impresso = null; const orig = HTMLIFrameElement.prototype; window.__printDoc = null;
      new MutationObserver(() => { document.querySelectorAll('iframe[title="Impressão do documento"]').forEach(f => { if (f.__espiao) return; f.__espiao = 1; f.addEventListener('load', () => { f.contentWindow.print = () => { window.__impresso = f.contentDocument.documentElement.outerHTML; }; }); }); }).observe(document.body, { childList: true }); });
    await cat.locator('[data-pedido-pdf]').click();
    await page.waitForFunction(() => document.getElementById('cat').contentWindow.__impresso, null, { timeout: 30000 });
    const htmlImpressao = await frame().evaluate(() => window.__impresso);
    const doc = htmlImpressao.split('<body')[1] || '';
    assert.ok(doc.indexOf('cpj-order-planta-folha') > 0 && doc.indexOf('cpj-order-planta-folha') < doc.indexOf('cpj-order-financeiro'), 'PDF com a planta antes do financeiro');
    const impressao = await context.newPage();
    await impressao.setContent(htmlImpressao);
    await impressao.waitForFunction(() => [...document.images].every(i => i.complete));
    const buffer = await impressao.pdf({ path: '.tmp/pedido-foto-fora-planta.pdf', preferCSSPageSize: true, printBackground: true });
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
    let fotoImpressa = false;
    for (let i = 1; i <= pdf.numPages; i++) {
      const pagina = await pdf.getPage(i), texto = await pagina.getTextContent();
      if (!texto.items.some(t => /planta do evento/i.test(t.str))) continue;
      const viewport = pagina.getViewport({ scale: 1 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      await pagina.render({ canvasContext: ctx, viewport, canvas }).promise;
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let rosa = 0;
      for (let p = 0; p < pixels.length; p += 4) if (pixels[p] > 220 && pixels[p + 1] < 75 && pixels[p + 2] > 75 && pixels[p + 2] < 120) rosa++;
      const escalaFolha = Math.floor(Math.min(269 / 297, 172 / 210) * 10000) / 10000;
      const areaEsperada = 297 * 210 * ((72 / 25.4 * escalaFolha) ** 2) * posicaoEditor.w * posicaoEditor.h;
      assert.ok(rosa > areaEsperada * .96 && rosa < areaEsperada * 1.04, 'a foto na área branca aparece inteira no PDF');
      require('node:fs').writeFileSync('.tmp/pedido-foto-fora-planta.png', canvas.toBuffer('image/png'));
      fotoImpressa = true;
    }
    assert.ok(fotoImpressa, 'página da planta encontrada no PDF');
    await pdf.destroy(); await impressao.close();
    console.log('ok 4 - prévia e PDF preservam a folha inteira, inclusive foto na área branca fora da planta');
    // botão da Lista Completa leva pra aba
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
