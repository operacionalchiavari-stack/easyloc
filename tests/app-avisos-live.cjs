// Teste opt-in (RUN_AVISOS_LIVE=1): abas do app, caixa de Avisos e Ajustes (o que avisar e horário de silêncio), com um
// usuário administrador temporário na empresa dona (apagado no fim, junto com os avisos e as preferências dele).
require('dotenv').config({ quiet: true });
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', tipos[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f)); });
const PORTA = 5622, BASE = `http://localhost:${PORTA}/`;
const saida = path.join(root, 'outputs', 'app-avisos'); fs.mkdirSync(saida, { recursive: true });

(async () => {
  if (process.env.RUN_AVISOS_LIVE !== '1') throw new Error('Defina RUN_AVISOS_LIVE=1');
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const empresa = ok(await admin.rpc('gs_empresa_dona'));
  const senha = `Test-${crypto.randomUUID()}!`;
  let usuario, browser;
  await new Promise((r) => srv.listen(PORTA, r));
  try {
    const u = ok(await admin.auth.admin.createUser({ email: `teste-avisos-${crypto.randomUUID().slice(0, 8)}@example.invalid`, password: senha, email_confirm: true })).user; usuario = u.id;
    ok(await admin.from('usuarios').insert({ id: u.id, empresa_id: empresa, nome: 'Gestor Avisos' }));
    ok(await admin.from('usuarios_empresas').insert({ user_id: u.id, empresa_id: empresa, role: 'admin' }));
    // três avisos na caixa (um já lido)
    ok(await admin.from('app_push_fila').insert([
      { user_id: u.id, empresa_id: empresa, tipo: 'pagamento_recebido', titulo: 'Pagamento recebido · R$ 1.200,00', corpo: 'Ana Decorações · Pedido 12\nPIX pelo link do pedido', url: 'app.html#avisos', chave: 'teste-a:' + u.id, enviado_em: new Date().toISOString() },
      { user_id: u.id, empresa_id: empresa, tipo: 'escala', titulo: 'Você foi escalado', corpo: 'Montagem · Pedido 12 · amanhã às 08:00', url: 'app.html#avisos', chave: 'teste-b:' + u.id, enviado_em: new Date().toISOString() },
      { user_id: u.id, empresa_id: empresa, tipo: 'comunicado', titulo: 'Novo comunicado', corpo: 'Reunião geral na sexta', url: 'app.html#avisos', chave: 'teste-c:' + u.id, enviado_em: new Date().toISOString(), lida_em: new Date().toISOString() },
    ]));
    const sessao = ok(await createClient(process.env.SUPABASE_URL, 'sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ', { auth: { persistSession: false } }).auth.signInWithPassword({ email: u.email, password: senha })).session;

    browser = await chromium.launch({ channel: 'msedge' });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([s]) => { try { if (!localStorage.getItem('easyloc-auth')) localStorage.setItem('easyloc-auth', JSON.stringify(s)); } catch (e) {} }, [sessao]);
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', (e) => erros.push(e.message));
    await page.goto(BASE + 'app.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#apInicio:not([hidden])', { timeout: 30000 });
    await page.waitForFunction(() => document.getElementById('apAbasBadge').textContent === '2', null, { timeout: 15000 });
    assert.ok(await page.isVisible('#apAbas'), 'barra de abas visível');
    assert.ok(await page.isVisible('#apNovos'), 'atalho "2 avisos novos" na Início');
    assert.equal(await page.locator('.ap-modulo[href="#config"]').count(), 0, 'Configurações saiu da lista de módulos (virou aba)');
    console.log('ok 1 - abas embaixo, contador de avisos e atalho na Início');

    await page.click('#apAbas [data-aba="avisos"]');
    await page.waitForSelector('#apAvisosTela:not([hidden]) .ap-aviso');
    assert.equal(await page.locator('.ap-aviso').count(), 3);
    assert.equal(await page.locator('.ap-aviso.nao-lido').count(), 2);
    await page.screenshot({ path: path.join(saida, '01-avisos.png') });
    await page.locator('.ap-aviso.nao-lido').first().click();
    await page.waitForFunction(() => document.getElementById('apAbasBadge').textContent === '1');
    await page.click('#apLerTodos');
    await page.waitForFunction(() => document.getElementById('apAbasBadge').hidden);
    await page.waitForTimeout(800);
    const naoLidas = ok(await admin.from('app_push_fila').select('id', { count: 'exact' }).eq('user_id', u.id).is('lida_em', null));
    assert.equal(naoLidas.length, 0, 'marcados como lidos no banco');
    console.log('ok 2 - caixa de avisos: lista por dia, marcar um e todos como lidos (grava no banco)');

    await page.click('#apAbas [data-aba="ajustes"]');
    await page.waitForSelector('#apConfig:not([hidden]) [data-notif-tipo]');
    const n = await page.locator('[data-notif-tipo]').count();
    assert.ok(n >= 20, 'administrador vê todos os tipos de aviso: ' + n);
    await page.click('[data-notif-tipo="pagamento_recebido"]');
    await page.waitForSelector('.ap-toast.on');
    await page.click('[data-silencio]');
    await page.waitForSelector('[data-silencio-inicio]');
    await page.fill('[data-silencio-inicio]', '21:30'); await page.locator('[data-silencio-inicio]').dispatchEvent('change');
    await page.waitForTimeout(1200);
    const pr = ok(await admin.from('app_notif_prefs').select('*').eq('user_id', u.id).single());
    assert.equal(pr.tipos.pagamento_recebido, false); assert.equal(pr.silencio, true); assert.equal(pr.silencio_inicio.slice(0, 5), '21:30');
    await page.screenshot({ path: path.join(saida, '02-ajustes.png') });
    await page.screenshot({ path: path.join(saida, '02-ajustes-inteiro.png'), fullPage: true });
    console.log(`ok 3 - Ajustes: ${n} tipos de aviso, desligar um e o horário de silêncio gravam no banco`);

    // o aviso desligado não entra mais na fila; o teste passa pela fila (e cai na caixa, guardado pelo silêncio)
    ok(await admin.rpc('app_notif_enviar', { p_empresa: empresa, p_user: u.id, p_tipo: 'pagamento_recebido', p_titulo: 'x', p_corpo: 'x', p_url: null, p_chave: 'teste-d:' + u.id }));
    const desligado = ok(await admin.from('app_push_fila').select('id').eq('chave', 'teste-d:' + u.id));
    assert.equal(desligado.length, 0, 'tipo desligado não entra na fila');
    console.log('ok 4 - tipo desligado não chega');

    await page.click('#apAbas [data-aba="inicio"]');
    await page.click('.ap-modulo[href="#gerencial"]');
    await page.waitForSelector('#apGerencial:not([hidden])');
    assert.ok(await page.isVisible('#apTopoVoltar'), 'seta de voltar na faixa de cima');
    await page.click('#apTopoVoltar');
    await page.waitForSelector('#apInicio:not([hidden])');
    assert.deepEqual(erros, []);
    console.log('ok 5 - Gerencial empilhado com a seta de voltar; sem erros de JavaScript');
  } finally {
    if (browser) await browser.close();
    srv.close();
    if (usuario) {
      await admin.from('app_push_fila').delete().eq('user_id', usuario);
      await admin.from('app_notif_prefs').delete().eq('user_id', usuario);
      await admin.from('usuarios_empresas').delete().eq('user_id', usuario);
      await admin.from('usuarios').delete().eq('id', usuario);
      await admin.auth.admin.deleteUser(usuario);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
