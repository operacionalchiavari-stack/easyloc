// Teste opt-in (RUN_AGENTES_LIVE=1): módulo Agentes de IA do app do celular, com um usuário administrador temporário na
// empresa dona (só leitura; apagado no fim). Abre a lista e cada relatório com ?app=1 no tamanho de celular: faixa do
// app em cima, sem rolagem lateral da página, sem erro de JavaScript, e o "voltar" retorna à lista do Gerencial.
require('dotenv').config({ quiet: true });
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', tipos[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f)); });
const PORTA = 5619, BASE = `http://localhost:${PORTA}/`;
const saida = path.join(root, 'outputs', 'app-agentes'); fs.mkdirSync(saida, { recursive: true });

(async () => {
  if (process.env.RUN_AGENTES_LIVE !== '1') throw new Error('Defina RUN_AGENTES_LIVE=1');
  const url = process.env.SUPABASE_URL;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const empresa = ok(await admin.rpc('gs_empresa_dona'));
  const sufixo = crypto.randomUUID().slice(0, 8), senha = `Test-${crypto.randomUUID()}!`;
  let usuario, browser;
  await new Promise((r) => srv.listen(PORTA, r));
  try {
    const u = ok(await admin.auth.admin.createUser({ email: `teste-agentes-${sufixo}@example.invalid`, password: senha, email_confirm: true })).user; usuario = u.id;
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
    await page.waitForSelector('#apInicio:not([hidden])', { timeout: 30000 });
    await page.click('#apAbas [data-aba="agentes"]');
    await page.waitForSelector('#apAgentes:not([hidden]) .ap-agente');
    const nomes = await page.$$eval('.ap-agente .ap-modulo-titulo', (l) => l.map((x) => x.textContent));
    assert.equal(nomes.length, 6, 'admin vê os 6 agentes: ' + nomes.join(', '));
    await page.screenshot({ path: path.join(saida, '00-lista.png'), fullPage: true });
    console.log('ok 1 - módulo Agentes de IA:', nomes.join(' · '));

    const n = nomes.length;
    for (let i = 0; i < n; i++) {
      const link = page.locator('.ap-agente').nth(i);
      const nome = await link.locator('.ap-modulo-titulo').textContent();
      await link.click();
      if (nome === 'Helena') await page.waitForSelector('body.assistente-aberta [data-cas-input]', { timeout: 40000 });
      else await page.waitForSelector('#agNome', { timeout: 30000 });
      await page.waitForFunction(() => !document.getElementById('appCarregamento') || document.getElementById('appCarregamento').classList.contains('saindo'), null, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(6000);
      const info = await page.evaluate(() => ({
        titulo: document.querySelector('#agNome')?.textContent || 'Helena',
        mesmoVisual: !!document.querySelector('.ag-cab') || document.body.classList.contains('catalogo-equipe-helena'),
        campo: [...document.querySelectorAll('textarea,[data-cas-input]')].some((t) => t.getBoundingClientRect().width > 0),
        largo: document.documentElement.scrollWidth - innerWidth,
      }));
      await page.screenshot({ path: path.join(saida, String(i + 1).padStart(2, '0') + '-' + nome.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase() + '.png'), fullPage: true });
      assert.ok(info.titulo.startsWith(nome.split(' ')[0] === 'Assistente' ? 'Ideia' : nome), info.titulo + ' x ' + nome);
      assert.ok(info.campo, nome + ': campo para conversar visível');
      assert.ok(info.largo <= 1, `${nome}: página rola de lado (${info.largo}px)`);
      assert.ok(info.mesmoVisual, nome + ': mesmo visual de conversa');
      if (process.env.CONVERSA === '1' && nome === 'Cora') { // conversa de verdade (gasta IA): mensagem, resposta e relatório pelo botão discreto
        await page.click('[data-ag-sugestao]'); await page.waitForSelector('.ag-msg.ia .ag-balao:not(.ag-digitando)', { timeout: 120000 });
        await page.screenshot({ path: path.join(saida, 'cora-conversa.png') });
        await page.click('#agRelatorios'); await page.waitForSelector('#agSheet.on'); await page.screenshot({ path: path.join(saida, 'cora-relatorios.png') });
        await page.click('[data-ag-rel="1"]'); await page.waitForSelector('.ag-relatorio, .ag-balao.erro', { timeout: 180000 }); await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(saida, 'cora-relatorio.png') });
        console.log('ok - Cora respondeu e gerou o relatório');
      }
      // voltar sai direto para a lista de agentes (a Helena nunca cai no catálogo)
      if (nome === 'Helena') await page.locator('[data-cas-fechar]').first().click();
      else await page.click('#agVoltar');
      await page.waitForSelector('#apAgentes:not([hidden]) .ap-agente', { timeout: 20000 });
      console.log(`ok - ${nome}: abre com o campo de conversa, sem rolagem lateral, voltar leva aos agentes`);
    }
    await page.click('#apAbas [data-aba="inicio"]');
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
