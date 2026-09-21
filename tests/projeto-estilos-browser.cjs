const { chromium } = require('playwright');
const express = require('express');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

(async () => {
  const { MODELOS, layoutDoModelo } = await import('../Modulos/Comercial/Catalogo/projeto-layout.mjs');
  const app = express();
  app.use(express.static(process.cwd()));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.on('listening', r));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const base = `http://127.0.0.1:${server.address().port}/Modulos/Comercial/Catalogo/`;
    for (const modelo of MODELOS) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await context.route('https://**/*', r => r.fulfill({ body: '', contentType: 'text/javascript' }));
        const payload = {
          ok: true, layout: layoutDoModelo(modelo.chave),
          decorador: { nome: 'Atelier de eventos', email: 'contato@example.com' }, empresa: { nome: 'Acervo' },
          projeto: { noivos: 'Helena & Rafael', data_evento: '2027-05-10', local_evento: 'Jardim da Serra',
            ambientes: [{ nome: 'Cerimônia no jardim', notas: 'Texturas naturais e uma composição delicada para receber os convidados.', renders: [], itens: [{ item_id: '1', quantidade: 24 }] }, { nome: 'Lounge', notas: 'Um espaço para conversar.', renders: [], itens: [{ item_id: '1', quantidade: 2 }] }] },
          itens: [{ id: '1', nome: 'Poltrona de linho', material: 'Madeira', cor: 'Areia', largura: .7 }],
        };
        await page.addInitScript(p => { window.supabaseClient = { rpc: async () => ({ data: p }) }; }, payload);
        await page.goto(base + 'projeto.html?p=teste#pin=123456');
        await page.locator('.pj-root').waitFor();
        assert.equal(await page.locator('.pj-root').getAttribute('data-identidade'), modelo.chave);
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 960 });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${modelo.chave}: sem overflow em ${width}px`);
          assert.ok(await page.locator('.pj-cover h1').isVisible());
          if (payload.layout.resumo) {
            await page.locator('.pj-chapters a').first().click();
            assert.equal(new URL(page.url()).hash, '#amb-0');
            assert.ok(await page.locator('#amb-0').isVisible());
            assert.equal(await page.locator('.pj-cover').isVisible(), false);
            assert.equal(await page.locator('#amb-1').isVisible(), false);
            await page.locator('.pj-nav-list a[href="#amb-1"]').click();
            assert.ok(await page.locator('#amb-1').isVisible());
            assert.equal(await page.locator('#amb-0').isVisible(), false);
            await page.goBack();
            await page.waitForFunction(()=>document.querySelector('#amb-0').getBoundingClientRect().height > 0);
            await page.locator('.pj-nav-list a[href="#inicio"]').click();
          }
        }
        await page.setViewportSize({ width: 1440, height: 960 });
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        if (['classico','romantico','vibrante'].includes(modelo.chave)) await page.screenshot({ path: path.join(os.tmpdir(), `projeto-${modelo.chave}.png`), fullPage: true });
        await page.emulateMedia({ media: 'print' });
        assert.ok(await page.locator('#amb-0').isVisible());
        assert.ok(await page.locator('#amb-1').isVisible());
        assert.ok(await page.evaluate(() => [...document.querySelectorAll('.pj-reveal')].every(e => getComputedStyle(e).opacity === '1')));
        assert.deepEqual(errors, []);
        await page.emulateMedia({ media: 'screen' });
        const photo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#a48b73"/></svg>');
        payload.projeto.ambientes[0].renders = [1,2,3].map(id => ({ id, url: photo }));
        payload.itens[0].foto_url = photo;
        await page.addInitScript(p => { window.supabaseClient = { rpc: async () => ({ data: p }) }; }, payload);
        await page.reload();
        await page.locator('.pj-render img').first().waitFor({state:'attached'});
        assert.equal(await page.locator('.pj-render img').count(), 3);
        for (const width of [1440,390]) {
          await page.setViewportSize({width,height:960});
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${modelo.chave}: fotos sem overflow`);
          if (payload.layout.capa.estilo === 'lateral') assert.ok(await page.locator('.pj-cover-media img').isVisible());
        }
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log('OK: sete estilos, desktop, celular, navegação e impressão.');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
