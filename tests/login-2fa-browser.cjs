// Login com verificação em duas etapas (banco e Edge Function simulados).
const { chromium } = require('playwright'), express = require('express'), assert = require('node:assert/strict');
(async () => {
  const app = express(); app.use(express.static(process.cwd()));
  const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.on('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const nova = async (cenario) => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
      const erros = []; page.on('pageerror', (e) => erros.push(e.message));
      await page.route('**/*', (r) => {
        const u = new URL(r.request().url());
        if (u.origin !== base) return r.fulfill({ body: '', contentType: 'text/javascript' });
        if (u.pathname.endsWith('/dashboard.html')) return r.fulfill({ body: '<p>painel</p>', contentType: 'text/html' });
        return r.continue();
      });
      await page.addInitScript((cen) => {
        window.chamadas = []; window.signOut = 0;
        const estado = { verificado: false };
        const funcao = async (nome, { body }) => {
          window.chamadas.push(body.action); sessionStorage.setItem('chamadas', window.chamadas.join(','));
          const erro = (msg, status = 400) => ({ data: null, error: { context: { status, json: async () => ({ error: msg }) } } });
          if (body.action === 'status') return { data: { obrigatorio: cen.obrigatorio, verificado: estado.verificado, tem_whatsapp: cen.whatsapp !== false, whatsapp: '(**) *****-2746', recuperacao_restantes: 0 } };
          if (body.action === 'enviar') return { data: { ok: true, whatsapp: '(**) *****-2746', validade_min: 5 } };
          if (body.action === 'verificar') {
            if (body.codigo !== '482913') return erro('Código incorreto. Restam 4 tentativa(s).');
            estado.verificado = true; return { data: { ok: true, recuperacao: ['ABCD-EFGH', 'JKLM-NPQR', 'STUV-WXYZ', '2345-6789', 'AB23-CD45', 'EF67-GH89', 'JK23-LM45', 'NP67-QR89'] } };
          }
          if (body.action === 'recuperar') { if (body.codigo !== 'ABCD-EFGH') return erro('Código de recuperação inválido ou já usado.'); estado.verificado = true; return { data: { ok: true, recuperacao_restantes: 7 } }; }
          return erro('?');
        };
        const tabela = () => {
          const q = { select: () => q, eq: () => q, limit: () => q, single: () => q, maybeSingle: () => q,
            then: (ok) => Promise.resolve(window.__tabela || { data: [{ empresa_id: 'emp' }], error: null }).then(ok) };
          return q;
        };
        window.supabase = { createClient: () => ({
          auth: {
            signInWithPassword: async () => ({ data: { user: { id: 'u1' }, session: {} }, error: null }),
            signOut: async () => { window.signOut++; return {}; },
            getSession: async () => ({ data: { session: null } }),
          },
          functions: { invoke: funcao },
          rpc: async (nome) => ({ data: nome === 'funcionario_contexto' ? { ativo: !cen.obrigatorio || estado.verificado, dois_fatores_pendente: cen.obrigatorio && !estado.verificado } : null, error: null }),
          from: (t) => { const q = tabela(); const orig = q.then; q.then = (ok) => Promise.resolve(t === 'assinaturas' ? { data: { status: 'ativo', vencimento: '2099-01-01' }, error: null } : t === 'usuarios' ? { data: { nome: 'Pessoa' }, error: null } : { data: [{ empresa_id: 'emp' }], error: null }).then(ok); return q; },
        }) };
      }, cenario);
      await page.goto(base + '/login.html');
      await page.fill('#email', 'pessoa@empresa.com'); await page.fill('#senha', 'segredo');
      return { page, erros };
    };

    // 1. Exigência desligada: entra direto, sem a tela do código
    {
      const { page, erros } = await nova({ obrigatorio: false });
      await page.click('#loginBtn'); await page.waitForURL(/dashboard\.html/);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('chamadas')), 'status');
      assert.deepEqual(erros, []); console.log('ok 1 - desligado entra direto'); await page.close();
    }
    // 2. Ligada: envia sozinho, erra, acerta, mostra os códigos de recuperação uma vez e entra
    {
      const { page, erros } = await nova({ obrigatorio: true });
      await page.click('#loginBtn');
      await page.locator('.e2f').waitFor();
      assert.match(await page.locator('.e2f').innerText(), /\(\*\*\) \*\*\*\*\*-2746/);
      await page.waitForFunction(() => window.chamadas.includes('enviar'));
      assert.match(await page.locator('[data-reenviar]').innerText(), /Reenviar em \d+s/);
      await page.fill('.e2f-codigo', '111111');
      await page.waitForFunction(() => /Restam 4/.test(document.querySelector('.e2f-erro')?.textContent));
      assert.ok(!page.url().includes('dashboard'));
      await page.fill('.e2f-codigo', '482913');
      await page.locator('.e2f-lista span').first().waitFor();
      assert.equal(await page.locator('.e2f-lista span').count(), 8, '8 códigos de recuperação');
      await page.screenshot({ path: '.tmp/login-2fa-codigos.png' });
      await page.click('.e2f-btn'); await page.waitForURL(/dashboard\.html/);
      assert.deepEqual(erros, []); console.log('ok 2 - código do WhatsApp, erro, acerto, códigos de recuperação'); await page.close();
    }
    // 3. Perdi o celular: código de recuperação
    {
      const { page } = await nova({ obrigatorio: true });
      await page.click('#loginBtn'); await page.locator('.e2f').waitFor();
      await page.click('[data-rec]'); await page.fill('.e2f-codigo', 'zzzz-zzzz'); await page.click('.e2f-btn');
      await page.waitForFunction(() => /inválido/.test(document.querySelector('.e2f-erro')?.textContent));
      await page.fill('.e2f-codigo', 'ABCD-EFGH'); await page.click('.e2f-btn');
      await page.waitForURL(/dashboard\.html/); console.log('ok 3 - código de recuperação'); await page.close();
    }
    // 4. Sair na tela do código: desloga e não entra
    {
      const { page } = await nova({ obrigatorio: true });
      await page.click('#loginBtn'); await page.locator('.e2f').waitFor();
      await page.click('[data-sair]');
      await page.waitForFunction(() => /cancelada/.test(document.getElementById('msg').textContent));
      assert.equal(await page.evaluate(() => window.signOut), 1); assert.ok(!page.url().includes('dashboard'));
      console.log('ok 4 - sair desloga'); await page.close();
    }
    // 5. Sem WhatsApp cadastrado: avisa e só deixa recuperação ou sair (celular)
    {
      const { page } = await nova({ obrigatorio: true, whatsapp: false });
      await page.setViewportSize({ width: 390, height: 800 });
      await page.click('#loginBtn'); await page.locator('.e2f').waitFor();
      assert.match(await page.locator('.e2f').innerText(), /não está cadastrado/);
      assert.equal(await page.evaluate(() => window.chamadas.includes('enviar')), false);
      const box = await page.locator('.e2f').boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 390);
      console.log('ok 5 - sem WhatsApp não envia nada'); await page.close();
    }
    console.log('OK - login com verificação em duas etapas');
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
