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
    await page.evaluate(() => localStorage.removeItem('gd_periodo'));
    await page.click('.ap-modulo[href="#gerencial"]');
    // 20/11/2026: Gerencial nativo, com gráficos (sem abrir as telas do computador)
    const pronto = () => page.waitForFunction(() => document.querySelector('#gdCorpo .gd-hero') && !document.querySelector('#gdCorpo .gd-esq'), null, { timeout: 30000 });
    await pronto();
    const info = async () => page.evaluate(() => ({ largo: document.documentElement.scrollWidth - innerWidth, tabelas: document.querySelectorAll('#apGerencial table').length,
      graficos: document.querySelectorAll('#apGerencial .gd-graf svg').length, cards: document.querySelectorAll('#apGerencial .gd-card').length, hero: document.querySelector('.gd-hero b').textContent }));
    let a = await info();
    assert.equal(a.tabelas, 0, 'sem tabelas'); assert.ok(a.graficos >= 2 && a.cards >= 5, 'comercial com gráficos: ' + JSON.stringify(a)); assert.ok(a.largo <= 1, 'não rola de lado');
    await page.waitForTimeout(700); await page.screenshot({ path: path.join(saida, '01-comercial.png'), fullPage: true });
    // toque numa coluna muda a leitura
    const leit = page.locator('#gdFat .gd-leitura'); const antes = await leit.innerText();
    await page.locator('#gdFat').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, 120)); const bb = await page.locator('#gdFat svg').boundingBox(); await page.mouse.click(bb.x + 60, bb.y + bb.height / 2);
    assert.notEqual(await leit.innerText(), antes, 'tocar numa coluna mostra o mês');
    for (const per of ['3m', '12m']) { await page.click('[data-gd-per="' + per + '"]'); await pronto(); assert.ok((await info()).largo <= 1); }
    await page.screenshot({ path: path.join(saida, '02-comercial-12m.png'), fullPage: true });
    console.log('ok 1 - Comercial: número principal ' + a.hero + ', ' + a.graficos + ' gráficos, ' + a.cards + ' quadros, sem tabela; toque e períodos funcionam');
    await page.click('[data-gd-aba="financeiro"]'); await pronto();
    a = await info();
    assert.equal(a.tabelas, 0); assert.ok(a.graficos >= 2, 'financeiro com gráficos'); assert.ok(a.largo <= 1);
    await page.waitForTimeout(700); await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: path.join(saida, '03-financeiro.png') }); await page.evaluate(() => scrollTo(0, 700)); await page.waitForTimeout(300); await page.screenshot({ path: path.join(saida, '04-financeiro-b.png') });
    console.log('ok 2 - Financeiro: saldo ' + a.hero + ', ' + a.graficos + ' gráficos, sem tabela');
    await page.click('#apTopoVoltar');
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
