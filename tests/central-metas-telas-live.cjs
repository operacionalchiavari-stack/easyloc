// Teste opt-in (RUN_CENTRAL_LIVE=1): abre a Central de Metas e o Meu Bônus no navegador com um usuário temporário,
// contra a Edge Function central-metas real, e confere que nenhuma aba chama o servidor antigo nem mostra erro.
require('dotenv').config({ quiet: true });
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', tipos[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f)); });

(async () => {
  if (process.env.RUN_CENTRAL_LIVE !== '1') throw new Error('Defina RUN_CENTRAL_LIVE=1');
  const url = process.env.SUPABASE_URL;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonKey = 'sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ';
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const sufixo = crypto.randomUUID().slice(0, 8), senha = `Test-${crypto.randomUUID()}!`;
  let empresa, usuario, browser;
  await new Promise((r) => srv.listen(5613, r));
  try {
    empresa = ok(await admin.from('empresas').insert({ nome: `TESTE CENTRAL TELA ${sufixo}` }).select('id').single()).id;
    const u = ok(await admin.auth.admin.createUser({ email: `teste-central-tela-${sufixo}@example.invalid`, password: senha, email_confirm: true })).user;
    usuario = u.id;
    ok(await admin.from('usuarios').insert({ id: u.id, empresa_id: empresa, nome: 'Gestor Tela' }));
    ok(await admin.from('usuarios_empresas').insert({ user_id: u.id, empresa_id: empresa, role: 'admin' }));
    const cli = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const sessao = ok(await cli.auth.signInWithPassword({ email: u.email, password: senha })).session;

    browser = await chromium.launch({ channel: 'msedge' });
    const page = await browser.newPage();
    const erros = [], antigos = [];
    page.on('pageerror', (e) => erros.push(e.message));
    page.on('request', (q) => { if (/\/api\/gs/.test(q.url())) antigos.push(q.url()); });
    await page.addInitScript(([s, emp]) => { localStorage.setItem('easyloc-auth', JSON.stringify(s)); sessionStorage.setItem('empresa_id', emp); sessionStorage.setItem('login_ok', '1'); }, [sessao, empresa]);
    await page.goto('http://localhost:5613/Modulos/Chiavari/CentralMetas/central.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    for (const aba of ['operacao', 'pagamentos', 'premiacoes', 'equipe', 'manutencao']) {
      await page.evaluate((a) => window.abrirAbaCentral(a), aba);
      await page.waitForTimeout(4500);
    }
    const textoErro = await page.evaluate(() => [...document.querySelectorAll('td,div,span,p')].map((e) => e.textContent).filter((t) => /Erro ao carregar|não disponível sem o servidor|Função não encontrada/i.test(t || '')).slice(0, 5));
    assert.deepEqual(antigos, [], 'nenhuma chamada ao servidor antigo');
    assert.deepEqual(textoErro, [], 'nenhuma mensagem de erro na tela');
    assert.deepEqual(erros, [], 'sem erro de JavaScript');
    await page.screenshot({ path: path.join(root, 'outputs', 'central-metas-supabase.png'), fullPage: false });
    console.log('ok central.html: 5 abas carregam pela Edge Function, sem /api/gs e sem erro');

    const p2 = await browser.newPage(); const erros2 = [], antigos2 = [];
    p2.on('pageerror', (e) => erros2.push(e.message)); p2.on('request', (q) => { if (/\/api\/gs/.test(q.url())) antigos2.push(q.url()); });
    await p2.goto('http://localhost:5613/Modulos/Chiavari/CentralMetas/equipe.html', { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(2500);
    assert.deepEqual(antigos2, []); assert.deepEqual(erros2, []);
    console.log('ok equipe.html (Meu Bônus) abre sem o servidor antigo');
  } finally {
    if (browser) await browser.close();
    srv.close();
    if (empresa) {
      for (const t of ['central_config', 'central_metas']) await admin.from(t).delete().eq('empresa_id', empresa);
      await admin.from('usuarios_empresas').delete().eq('empresa_id', empresa);
      if (usuario) { await admin.from('usuarios').delete().eq('id', usuario); await admin.auth.admin.deleteUser(usuario); }
      await admin.from('empresas').delete().eq('id', empresa);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
