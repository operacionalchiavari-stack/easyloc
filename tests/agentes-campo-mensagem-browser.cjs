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
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**/*', route => route.abort());
    await page.route('**/js/core/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.addInitScript(() => {
      sessionStorage.setItem('empresa_id', 'e1');
      sessionStorage.setItem('usuario_nome', 'Pessoa Teste');
      window.chamadas = [];
      window.supabaseClient = {
        auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
        functions: { invoke: async (fn, args) => {
          window.chamadas.push({ fn, body: args.body });
          return await new Promise(resolve => { window.responder = () => resolve({ data: { resposta: 'Entendi sua mensagem. Como posso ajudar mais?', pronto: false } }); });
        } }
      };
    });
    const conferirCampo = async etapa => {
      const campo = await page.locator('#agForm').boundingBox();
      const texto = await page.locator('#agTexto').boundingBox();
      const enviar = await page.locator('#agEnviar').boundingBox();
      const { width, height } = page.viewportSize();
      assert.ok(campo && texto && enviar, etapa + ': campo e botão de enviar visíveis');
      for (const box of [campo, texto, enviar]) {
        assert.ok(box.y >= 0 && box.y + box.height <= height + 1, etapa + ': controles dentro da tela');
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1, etapa + ': controles sem corte lateral');
      }
      assert.ok(texto.width >= 130 && texto.height >= 44, etapa + ': espaço para digitar');
      assert.ok(await page.locator('#agTexto').evaluate(el => {
        const r = el.getBoundingClientRect();
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el;
      }), etapa + ': campo livre para toque');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), etapa + ': sem rolagem horizontal');
    };
    fs.mkdirSync('.tmp/agentes-campo', { recursive: true });
    for (const [id, fn, tipo] of [
      ['clara', 'financeiro-assistente'], ['miguel', 'estoque-assistente'],
      ['carla', 'solicitacao-assistente', 'compra'], ['marcos', 'solicitacao-assistente', 'manutencao'],
      ['ideia', 'ideia-assistente']
    ]) {
      await page.goto(base + '/Modulos/Gestao/AgentesApp/agente.html?ag=' + id);
      await page.locator('.ag-boas h2').waitFor();
      for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 1440, height: 900 }]) {
        await page.setViewportSize(viewport);
        await conferirCampo(id + ' ao abrir ' + viewport.width);
      }
      assert.ok(await page.locator('#agEnviar').isDisabled(), 'enviar vazio desabilitado');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#agTexto').fill('Pode conferir as prioridades de hoje?');
      assert.ok(await page.locator('#agEnviar').isEnabled());
      await page.locator('#agEnviar').click();
      await page.waitForFunction(() => window.chamadas.length === 1);
      assert.equal(await page.locator('#agTexto').inputValue(), '');
      assert.ok(await page.locator('#agEnviar').isDisabled());
      assert.ok(await page.locator('#agMic').isDisabled());
      await page.locator('#agTexto').fill('Próxima mensagem em rascunho');
      await page.locator('#agTexto').press('Enter');
      assert.equal(await page.locator('#agTexto').inputValue(), 'Próxima mensagem em rascunho', 'não perder rascunho enquanto aguarda resposta');
      assert.equal(await page.evaluate(() => window.chamadas.length), 1, 'sem envio duplicado');
      const chamada = await page.evaluate(() => window.chamadas[0]);
      assert.equal(chamada.fn, fn);
      if(id==='ideia'){
        assert.equal(await page.locator('#agNome').innerText(),'Sofia');
        assert.equal(chamada.body.acao,'consultar_rh','consulta os módulos de RH, além das ideias');
      }
      if (tipo) assert.equal(chamada.body.tipo, tipo);
      assert.ok(JSON.stringify(chamada.body).includes('Pode conferir as prioridades de hoje?'), 'mensagem chega ao agente certo');
      await conferirCampo(id + ' aguardando resposta');
      await page.evaluate(() => window.responder());
      await page.locator('.ag-msg.ia:not(:has(.ag-digitando))').waitFor();
      assert.ok(await page.locator('#agEnviar').isEnabled());
      await page.locator('#agTexto').fill('');
      assert.ok(await page.locator('#agEnviar').isDisabled());
      assert.ok(await page.locator('#agMic').isVisible());
      await page.screenshot({ path: '.tmp/agentes-campo/' + id + '.png' });

      // Reabrir histórico extenso: somente a conversa deve rolar, nunca esconder o campo.
      await page.evaluate(id => {
        const msgs = Array.from({ length: 40 }, (_, i) => ({ papel: i % 2 ? 'ia' : 'pessoa', texto: ('Mensagem longa para conferir o histórico e continuar a conversa. ').repeat(12), em: new Date().toISOString() }));
        sessionStorage.setItem('agente_chat:' + (id === 'miguel' ? 'cora' : id) + ':e1:u1', JSON.stringify(msgs));
      }, id);
      await page.reload();
      await page.waitForFunction(() => document.querySelectorAll('.ag-msg').length === 40);
      await conferirCampo(id + ' com histórico');
      await page.locator('#agTexto').fill(('Mensagem com várias linhas\n').repeat(12));
      await page.locator('#agTexto').focus();
      // Simula a redução do espaço disponível quando o teclado abre.
      await page.setViewportSize({ width: 390, height: 400 });
      await conferirCampo(id + ' com teclado e texto longo');
      await page.locator('#agMsgs').evaluate(el => { el.scrollTop = 0; });
      await conferirCampo(id + ' após rolar histórico');
      await page.setViewportSize({ width: 390, height: 844 });
    }
    assert.deepEqual(errors, []);
    console.log('OK: campo e envio visíveis nos cinco agentes; clique envia ao servidor correto; vazio e duplicidade bloqueados; rascunho preservado; histórico extenso e espaço de teclado; celular e computador.');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
