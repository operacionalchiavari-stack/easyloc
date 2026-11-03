// "Personalizar" na página do item (pedido do usuário, out/2026): em item personalizável com personalização cadastrada,
// o botão abre a cartela (tintas/tecidos com código) em vez do envio de foto; dali põe no projeto já personalizado ou
// vê como fica com IA usando a amostra escolhida. Só para item personalizável.
const { chromium } = require('playwright'); const express = require('express'); const assert = require('node:assert/strict');
const { installMock } = require('./mock-projetos.cjs');
(async () => {
  const app = express(); app.use(express.static(process.cwd())); const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.on('listening', r));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://**/*', (r) => r.fulfill({ body: '', contentType: 'text/javascript' }));
    await page.route('https://fixture/**', (r) => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c9b9a6"/></svg>' }));
    await page.addInitScript(() => { if (!sessionStorage.getItem('mockdb')) sessionStorage.setItem('mockdb', JSON.stringify({ projetos: [{ id: 'p1', cliente_id: 'client', noivos: 'Ana & Bruno', data_evento: '2027-05-22', local_evento: 'Jardim', status: 'rascunho', dados: { ambientes: [{ id: 'a1', nome: 'Lounge', itens: [], renders: [] }] } }], calls: [], uploads: [], removed: [], seq: 3 })); });
    await page.addInitScript(installMock, { token: true, cartela: true, pinturaSemCartela:true });
    const base = 'http://127.0.0.1:' + server.address().port + '/Modulos/Comercial/Catalogo/catalogo.html';
    await page.goto(base);
    await page.locator('[data-gateway-tile="catalogo"]').click();
    await page.locator('[data-entry-project="p1"]').click();
    await page.locator('.cpj-entry').waitFor({ state: 'detached' });
    assert.match(await page.locator('#catalogSearch').getAttribute('placeholder'),/Esc/);await page.locator('#catalogSearch').fill('teste');await page.locator('#catalogSearch').press('Escape');assert.equal(await page.locator('#catalogSearch').inputValue(),'');
    const abrirItem = async (cat, id) => {
      await page.locator('#catalogGlobalBack').isVisible().catch(() => false);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator(`[data-home-category="${cat}"]`).click();
      await page.locator(`[data-grid-item="${id}"]`).click();
      const sec = page.locator(`.catalog-product-section[data-product-id="${id}"]`); await sec.waitFor(); await page.waitForTimeout(2400);
      return sec;
    };
    const voltarHome = async () => { await page.locator('#catalogGlobalBack').click(); await page.locator('#catalogGlobalBack').click(); await page.locator('[data-home-category]').first().waitFor(); };

    // 1. Sofá Um: personalizável e com cartela → "Personalizar", abre a cartela com os códigos
    let sec = await abrirItem('sofas', '1');
    const botao = sec.locator('.product-bespoke-icon');
    await page.waitForFunction(() => document.querySelector('.catalog-product-section[data-product-id="1"] .product-bespoke-icon span')?.textContent === 'Personalizar');
    assert.equal(await botao.isVisible(), true);
    await botao.click();
    const dlg = page.locator('dialog.cpj-pers-dialog[open]'); await dlg.waitFor();
    await dlg.locator('[data-pers-opcao="o1"]').waitFor();
    assert.match(await dlg.textContent(), /SV-101/); assert.match(await dlg.textContent(), /SV-202/);
    assert.equal(await page.locator('#catalogCustomizeDialog[open]').count(), 0, 'não abre o envio de foto do tecido');
    await page.waitForFunction(() => /3 créditos/.test(document.querySelector('[data-pers-ia-info]')?.textContent || ''));
    console.log('ok 1 - item personalizável com cartela: "Personalizar" abre a cartela com os códigos (e o custo da IA)');

    // 2. Ver com IA sem escolher: pede a escolha; escolhendo, manda a amostra e o código para a IA
    await dlg.locator('[data-pers-ia]').click();
    assert.match(await dlg.locator('.cpj-modal-error').textContent(), /Escolha o tinta/);
    await dlg.locator('[data-pers-opcao="o2"]').click();
    await dlg.locator('[data-pers-ia]').click();
    await dlg.waitFor({ state: 'detached' });
    await page.waitForFunction(() => (JSON.parse(sessionStorage.getItem('mockdb')).invokes || []).length === 1);
    const inv = (await page.evaluate(() => JSON.parse(sessionStorage.getItem('mockdb')).invokes))[0];
    assert.equal(inv.name, 'studio-ai-engine');
    assert.equal(inv.body.scene.referencePolicy, 'fabric_customization');
    assert.match(inv.body.scene.fabricReference, /^data:image\/png;base64,/);
    assert.match(inv.body.prompt, /pintura/); assert.match(inv.body.prompt, /SV-202 Azul Petróleo/);
    await page.locator('.catalog-notification.has-photo').waitFor({ timeout: 10000 });
    console.log('ok 2 - "Ver como fica com IA" usa a cor escolhida (código no pedido para a IA) e mostra o resultado');

    // 3. Adicionar ao projeto: a escolha anterior volta marcada; entra no ambiente já personalizado
    await botao.click(); await dlg.waitFor();
    await dlg.locator('[data-pers-opcao="o2"][aria-pressed="true"]').waitFor();
    await dlg.locator('button[type="submit"]').click();
    await dlg.waitFor({ state: 'detached' });
    await page.waitForFunction(() => { const db = JSON.parse(sessionStorage.getItem('mockdb')); const l = db.projetos[0].dados.ambientes[0].itens[0]; return l && l.personalizacao_id === 'pers1'; }, null, { timeout: 8000 });
    const linha = await page.evaluate(() => JSON.parse(sessionStorage.getItem('mockdb')).projetos[0].dados.ambientes[0].itens[0]);
    assert.equal(linha.item_id, '1'); assert.equal(linha.quantidade, 1);
    assert.equal(linha.personalizacao_escolhas.Tinta.codigo, 'SV-202');
    assert.equal(linha.personalizacao_valor, 80);
    console.log('ok 3 - "Adicionar ao projeto" põe o item no ambiente com a tinta escolhida e o valor');

    // 4. Sofá Dois: personalizável sem cartela → continua "Experimente outro tecido"
    await voltarHome();
    sec = await abrirItem('sofas', '2');
    assert.equal(await sec.locator('.product-bespoke-icon span').textContent(), 'Experimente sua cor');
    await sec.locator('.product-bespoke-icon').click(); await page.locator('#catalogCustomizeDialog[open]').waitFor();assert.equal(await page.locator('#catalogCustomizeDialog h2').innerText(),'Experimente sua cor');assert.match(await page.locator('#catalogFabricUpload span').innerText(),/cor/);
    await page.keyboard.press('Escape');
    console.log('ok 4 - personalizável sem cartela continua com o envio da foto do tecido');

    // 5. Mesa Um: tem cartela mas não é personalizável → sem botão
    await voltarHome();
    sec = await abrirItem('mesas', '3');
    assert.equal(await sec.locator('.product-bespoke-icon:visible').count(), 0);
    console.log('ok 5 - item não personalizável não mostra o botão, mesmo com cartela');

    assert.deepEqual(errors, []);
    console.log('PASS');
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
