const assert = require('node:assert/strict');
const fs = require('node:fs');
const express = require('express');
const { chromium } = require('playwright');

(async () => {
  const app = express();
  app.use(express.static(process.cwd()));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.route('**/js/core/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.addInitScript(() => {
      sessionStorage.setItem('empresa_id', 'e1');
      sessionStorage.setItem('usuario_nome', 'Pessoa Teste');
      window.__calls = [];
      window.aguardarContexto = async () => ({ empresa_id: 'e1' });
      window.EasyLocPermissions = {
        load: async () => {}, hasPermission: () => false,
        canNavigate: href => !href.includes('AgentesApp')
      };
      const query = {
        select() { return this; }, eq() { return this; }, range() { return this; }, order() { return this; },
        then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); }
      };
      window.supabaseClient = {
        from: () => Object.create(query),
        rpc: async () => ({ data: [], error: null }),
        auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
        functions: { invoke: async (fn, args) => {
          window.__calls.push({ fn, body: args.body });
          if (window.__hold) return new Promise(resolve => { window.__reply = () => resolve({ data: { resposta: 'Relatório de RH preparado com os registros autorizados.', pronto: false }, error: null }); });
          return { data: { resposta: 'Consulte a aba Férias para acompanhar as programações.', pronto: false }, error: null };
        } }
      };
    });
    await page.goto(base + '/Modulos/RH/Pessoas/pessoas.html');
    const tab = page.locator('#rhAbas [data-aba="sofia"]');
    await page.locator('iframe[title="Funcionários"]').waitFor();
    assert.ok(await tab.isVisible(), 'Sofia disponível para membro de RH sem acesso de administrador');
    await tab.click();
    const chat = page.frameLocator('iframe[title="Sofia · RH"]');
    await chat.locator('.ag-boas h2').waitFor();
    assert.equal(await chat.locator('#agNome').innerText(), 'Sofia');
    assert.ok(await chat.getByRole('complementary', { name: 'Relatórios da Sofia' }).isVisible());
    assert.equal(await chat.locator('#agRelatoriosLado [data-ag-rel]').count(), 8);
    assert.equal(await chat.locator('#agVoltar').isVisible(), false, 'navegação permanece nas abas de RH');
    assert.equal(await page.locator('#rhConteudo').isVisible(), false);
    assert.match(await page.locator('iframe.rh-sofia').getAttribute('allow'), /microphone/);

    await chat.locator('#agTexto').fill('Quais férias estão programadas?');
    await chat.locator('#agEnviar').click();
    await chat.getByText('Consulte a aba Férias para acompanhar as programações.').waitFor();
    const frame = page.frames().find(frame => frame.url().includes('agente.html?ag=rh'));
    const calls = await frame.evaluate(() => window.__calls);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].fn, 'ideia-assistente');
    assert.equal(calls[0].body.acao, 'consultar_rh');
    assert.equal(calls[0].body.empresa_id, 'e1');
    assert.ok(JSON.stringify(calls[0].body).includes('Quais férias estão programadas?'));

    await chat.locator('#agTexto').fill('Rascunho para a Sofia');
    await page.locator('#rhAbas [data-aba="ferias"]').click();
    assert.equal(await page.locator('iframe.rh-sofia').isVisible(), false);
    await tab.click();
    assert.equal(await chat.locator('#agTexto').inputValue(), 'Rascunho para a Sofia');
    assert.equal(await chat.locator('.ag-msg.eu').count(), 1, 'conversa preservada ao trocar de aba');
    assert.equal(await page.locator('iframe.rh-sofia').count(), 1, 'reutiliza o mesmo chat');
    assert.equal(await frame.evaluate(() => window.__calls.length), 1);

    fs.mkdirSync('.tmp/rh-sofia', { recursive: true });
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1200, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      const box = await page.locator('iframe.rh-sofia').boundingBox();
      const input = await chat.locator('#agTexto').boundingBox();
      const send = await chat.locator('#agEnviar').boundingBox();
      for (const rect of [box, input, send]) {
        assert.ok(rect && rect.y >= 0 && rect.y + rect.height <= viewport.height + 1, 'chat e envio cabem na tela ' + viewport.width);
        assert.ok(rect.x >= 0 && rect.x + rect.width <= viewport.width + 1, 'sem corte lateral ' + viewport.width);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.equal(await chat.locator('#agRelatoriosLado').isVisible(), viewport.width > 900);
      if (viewport.width > 900) {
        const side = await chat.locator('#agRelatoriosLado').boundingBox();
        const messages = await chat.locator('#agMsgs').boundingBox();
        assert.ok(side.x >= messages.x + messages.width - 1, 'relatórios em uma coluna à direita da conversa');
        assert.ok(send.x + send.width <= side.x + 1, 'campo de mensagem fica na coluna da conversa');
      }
      await page.screenshot({ path: '.tmp/rh-sofia/' + viewport.width + '.png' });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await frame.evaluate(() => { window.__hold = true; });
    await chat.locator('#agRelatoriosLado [data-ag-rel="0"]').click();
    await frame.waitForFunction(() => window.__calls.length === 2);
    assert.equal(await chat.locator('#agRelatoriosLado button:disabled').count(), 9, 'bloqueia novos relatórios enquanto aguarda resposta');
    assert.equal(await chat.locator('#agTexto').inputValue(), 'Rascunho para a Sofia', 'atalho não apaga o rascunho');
    const pending = await frame.evaluate(() => window.__calls.at(-1));
    assert.equal(pending.fn, 'ideia-assistente');
    assert.equal(pending.body.acao, 'consultar_rh');
    assert.equal(pending.body.empresa_id, 'e1');
    assert.match(pending.body.mensagens.at(-1).texto, /relatório geral do RH/);
    await frame.evaluate(() => { window.__hold = false; window.__reply(); });
    await chat.getByText('Relatório de RH preparado com os registros autorizados.').waitFor();
    await chat.locator('#agRelatoriosLado button:enabled').first().waitFor();
    for (const [index, topic] of [[1, /relatório de férias/], [2, /exames e certificados/], [3, /benefícios ativos/], [4, /checklists de admissão/], [5, /ocorrências do mês/], [6, /relatório dos freelancers/], [7, /ideias de melhoria/]]) {
      await chat.locator('#agRelatoriosLado [data-ag-rel="' + index + '"]').click();
      await frame.waitForFunction(total => window.__calls.length === total, index + 2);
      const call = await frame.evaluate(() => window.__calls.at(-1));
      assert.match(call.body.mensagens.at(-1).texto, topic);
      await chat.locator('#agRelatoriosLado button:enabled').first().waitFor();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await chat.getByRole('button', { name: 'Relatórios que posso pedir' }).click();
    await chat.locator('#agSheet.on').waitFor();
    assert.equal(await chat.locator('#agSheet [data-ag-rel]').count(), 8);
    await chat.locator('#agSheet [data-ag-rel="1"]').click();
    await frame.waitForFunction(() => window.__calls.length === 10);
    await chat.locator('#agSheet').waitFor({ state: 'hidden' });
    assert.equal(await chat.locator('#agTexto').inputValue(), 'Rascunho para a Sofia');
    assert.match((await frame.evaluate(() => window.__calls.at(-1))).body.mensagens.at(-1).texto, /relatório de férias/);
    await page.goto(base + '/Modulos/RH/Pessoas/pessoas.html?aba=sofia');
    await chat.getByText('Relatório de RH preparado com os registros autorizados.').waitFor();
    assert.match(await tab.getAttribute('class'), /ativa/);
    assert.deepEqual(errors, []);
    console.log('OK: Sofia no RH, coluna com oito relatórios, envio autorizado, bloqueio de duplicidade, rascunho preservado, relatórios no celular e layout responsivo.');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
