// Teste opt-in (RUN_OCORR_LIVE=1): Ocorrências operacionais com um usuário temporário na empresa dona (só leitura).
// Clicar numa linha abre a tela inteira com a ocorrência e as provas; Voltar fecha; sem o botão "Ver evidências".
require('dotenv').config({ quiet: true });
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const root = path.join(__dirname, '..'), saida = process.env.OCORR_SAIDA || path.join(root, 'outputs');
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', tipos[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f)); });
(async () => {
  if (process.env.RUN_OCORR_LIVE !== '1') throw new Error('Defina RUN_OCORR_LIVE=1');
  const url = process.env.SUPABASE_URL, admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const empresa = ok(await admin.rpc('gs_empresa_dona')), sufixo = crypto.randomUUID().slice(0, 8), senha = `Test-${crypto.randomUUID()}!`;
  let usuario, browser; await new Promise((r) => srv.listen(5615, r));
  try {
    const u = ok(await admin.auth.admin.createUser({ email: `teste-ocorr-${sufixo}@example.invalid`, password: senha, email_confirm: true })).user; usuario = u.id;
    ok(await admin.from('usuarios').insert({ id: u.id, empresa_id: empresa, nome: 'Teste Ocorrências' }));
    ok(await admin.from('usuarios_empresas').insert({ user_id: u.id, empresa_id: empresa, role: 'admin' }));
    const cli = createClient(url, 'sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ', { auth: { persistSession: false } });
    const sessao = ok(await cli.auth.signInWithPassword({ email: u.email, password: senha })).session;
    browser = await chromium.launch({ channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const erros = []; page.on('pageerror', (e) => erros.push(e.message));
    await page.addInitScript(([s, emp]) => { localStorage.setItem('easyloc-auth', JSON.stringify(s)); sessionStorage.setItem('empresa_id', emp); sessionStorage.setItem('login_ok', '1'); }, [sessao, empresa]);
    await page.goto('http://localhost:5615/Modulos/Chiavari/Ocorrencias/OcorrenciasOperacionais.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#opLinhas tr[data-caso]', { timeout: 40000 });
    assert.equal(await page.locator('[data-detalhe], #opDetalhe').count(), 0, 'sem botão Ver evidências');
    assert.equal(await page.locator('thead th').count(), 7);
    const linhas = await page.locator('#opLinhas tr[data-caso]').count();
    console.log('ok 1 - lista sem a coluna Evidências,', linhas, 'linhas');
    const vistos = new Set(); let n = 0;
    for (let i = 0; i < linhas && n < 6; i++) {
      const tipo = await page.locator('#opLinhas tr[data-caso]').nth(i).locator('td').nth(4).evaluate((td) => td.firstChild.textContent);
      if (vistos.has(tipo)) continue; vistos.add(tipo); n++;
      await page.locator('#opLinhas tr[data-caso]').nth(i).click();
      await page.waitForFunction(() => !document.querySelector('.ot').hidden && !document.querySelector('[data-ot-provas] .ot-carregando'), null, { timeout: 30000 });
      const info = await page.evaluate(() => ({ h2: document.querySelector('.ot-titulo h2').textContent, blocos: [...document.querySelectorAll('.ot-bloco h4')].map((h) => h.textContent), tempo: document.querySelectorAll('[data-ot-tempo] li').length, larg: (() => { const o = document.querySelector(".ot"); window.__l = [o.scrollWidth, o.clientWidth]; return o.scrollWidth <= o.clientWidth + 1; })() }));
      if (!info.larg) console.log("LARGO", await page.evaluate(() => window.__l), await page.evaluate(() => [...document.querySelectorAll(".ot *")].filter((e) => e.getBoundingClientRect().right > document.querySelector(".ot").clientWidth + 1).slice(0, 5).map((e) => e.className + ":" + Math.round(e.getBoundingClientRect().right))));
      assert.ok(info.blocos.length >= 1 && info.tempo >= 1 && info.larg, JSON.stringify(info));
      console.log('   ', info.h2, '→', info.blocos.join(' | '));
      await page.waitForTimeout(2500); console.log("    imgs", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll(".ot-provas img")].map((i) => [i.naturalWidth, i.src.slice(0, 90)]))));
      await page.screenshot({ path: path.join(saida, `ocorrencia-tela-${n}.png`) });
      await page.click('[data-ot-voltar]'); assert.equal(await page.locator('.ot').isHidden(), true);
    }
    await page.locator('#opLinhas tr[data-caso]').first().focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('.ot').hidden); await page.keyboard.press('Escape');
    assert.equal(await page.locator('.ot').isHidden(), true);
    assert.deepEqual(erros, []);
    console.log('ok 2 - clicar/Enter abre a tela com as provas; Voltar e Esc fecham');
  } finally {
    if (browser) await browser.close(); srv.close();
    if (usuario) { await admin.from('usuarios_empresas').delete().eq('user_id', usuario); await admin.from('usuarios').delete().eq('id', usuario); await admin.auth.admin.deleteUser(usuario); }
  }
})().catch((e) => { console.error(e); process.exit(1); });
