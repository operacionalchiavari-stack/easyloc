// Teste opt-in (RUN_GERENCIAL_LIVE=1): módulo Gerencial do app do celular, com um usuário administrador temporário na
// empresa dona (só leitura; apagado no fim). Abre a lista e cada relatório com ?app=1 no tamanho de celular: faixa do
// app em cima, sem rolagem lateral da página, sem erro de JavaScript, e o "voltar" retorna à lista do Gerencial.
require('dotenv').config({ quiet: true });
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', tipos[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f)); });
const PORTA = 5618, BASE = `http://localhost:${PORTA}/`;
const saida = path.join(root, 'outputs', 'app-gerencial'); fs.mkdirSync(saida, { recursive: true });

(async () => {
  if (process.env.RUN_GERENCIAL_LIVE !== '1') throw new Error('Defina RUN_GERENCIAL_LIVE=1');
  const url = process.env.SUPABASE_URL;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const empresa = ok(await admin.rpc('gs_empresa_dona'));
  const sufixo = crypto.randomUUID().slice(0, 8), senha = `Test-${crypto.randomUUID()}!`;
  let usuario, browser;
  await new Promise((r) => srv.listen(PORTA, r));
  try {
    const u = ok(await admin.auth.admin.createUser({ email: `teste-gerencial-${sufixo}@example.invalid`, password: senha, email_confirm: true })).user; usuario = u.id;
    ok(await admin.from('usuarios').insert({ id: u.id, empresa_id: empresa, nome: 'Gestor Teste' }));
    ok(await admin.from('usuarios_empresas').insert({ user_id: u.id, empresa_id: empresa, role: 'admin' }));
    const cli = createClient(url, 'sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ', { auth: { persistSession: false, autoRefreshToken: false } });
    const sessao = ok(await cli.auth.signInWithPassword({ email: u.email, password: senha })).session;

    browser = await chromium.launch({ channel: 'msedge' });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([s]) => { try { if (!localStorage.getItem('easyloc-auth')) localStorage.setItem('easyloc-auth', JSON.stringify(s)); } catch (e) {} }, [sessao]);
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', (e) => erros.push(page.url().split('?')[0].split('/').pop() + ': ' + e.message));

    await page.goto(BASE + 'app.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#apInicio:not([hidden]) .ap-modulo[href="#gerencial"]', { timeout: 30000 });
    await page.click('.ap-modulo[href="#gerencial"]');
    await page.waitForSelector('#apGerencial:not([hidden]) .ap-rel');
    const nomes = await page.$$eval('#apGerencial .ap-rel .ap-modulo-titulo', (l) => l.map((x) => x.textContent));
    assert.equal(nomes.length, 7, 'admin vê os 7 relatórios: ' + nomes.join(', '));
    await page.screenshot({ path: path.join(saida, '00-lista.png'), fullPage: true });
    console.log('ok 1 - módulo Gerencial com os relatórios:', nomes.join(' · '));

    const n = nomes.length;
    for (let i = 0; i < n; i++) {
      const link = page.locator('#apGerencial .ap-rel').nth(i);
      const nome = await link.locator('.ap-modulo-titulo').textContent();
      await link.click();
      await page.waitForSelector('#arBarra', { timeout: 30000 });
      await page.waitForFunction(() => !document.getElementById('appCarregamento') || document.getElementById('appCarregamento').classList.contains('saindo'), null, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(6000);
      const info = await page.evaluate(() => ({
        titulo: document.querySelector('#arBarra b').textContent,
        largo: document.documentElement.scrollWidth - innerWidth,
        barraTopo: document.getElementById('arBarra').getBoundingClientRect().top,
      }));
      await page.screenshot({ path: path.join(saida, String(i + 1).padStart(2, '0') + '-' + nome.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase() + '.png'), fullPage: true });
      assert.equal(info.titulo, nome);
      assert.ok(info.largo <= 1, `${nome}: página rola de lado (${info.largo}px)`);
      await page.click('#arBarra .ar-voltar');
      await page.waitForSelector('#apGerencial:not([hidden]) .ap-rel', { timeout: 20000 });
      console.log(`ok - ${nome}: faixa do app, sem rolagem lateral, voltar leva ao Gerencial`);
    }
    await page.click('#apGerencialVoltar');
    await page.waitForSelector('#apInicio:not([hidden])');
    assert.deepEqual(erros, []);
    console.log('ok - Início de volta, sem erros de JavaScript');
  } finally {
    if (browser) await browser.close();
    srv.close();
    if (usuario) {
      await admin.from('usuarios_empresas').delete().eq('user_id', usuario);
      await admin.from('usuarios').delete().eq('id', usuario);
      await admin.auth.admin.deleteUser(usuario);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
