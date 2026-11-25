const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const BASE = 'http://painel-abas.teste/';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-11-22T15:00:00Z'));
    await page.addInitScript(() => {
      window.__CONTEXT = { empresa_id: 'test-company' };
      window.aguardarContexto = async () => window.__CONTEXT;
      window.EasyLocPermissions = { load: async () => {}, hasPermission: () => true };
      window.saved = null;
      window.__confirmacao = { status: 'confirmado', por: 'Ana Comercial', em: '2026-11-20T12:00:00Z' };
      const pessoas = [
        { nome: 'Ana Responsável', lider: true, equipe: 'montagem' },
        { nome: 'Bruno Líder', lider: true, equipe: 'montagem' },
        { nome: 'Carlos Interno', lider: false, equipe: 'montagem' },
        { nome: 'João Interno', lider: false, equipe: 'montagem' },
        { nome: 'Daniel Free', lider: false, free: true },
        { nome: 'João Free', lider: false, free: true },
        { nome: 'Líder Free', lider: true, free: true }
      ];
      pessoas.forEach((p,i)=>p.id='p'+i);
      window.__rhBloqueio=false;
      const etapa = { id: 'montagem-teste', pedido: 123, cliente: 'Cliente', local: 'Salão',
        tipo: 'montagem', data: '2026-11-22', hora: '09:00', responsavel: 'Ana Responsável',
        equipe: ['Carlos Interno'], caminhoes: ['C1'], sugerido: 4, avisos: [], conflitos: [], confirmacao_comercial: window.__confirmacao };
      const chamar = async (fn, args) => {
        if (fn === 'ESC_painel') return { inicio: args[0], hoje: '2026-11-22',
          regras: { automatica: false, etapas: {} }, etapas: [{ ...etapa, ...(window.saved || {}) }],
          pessoas, caminhoes: [{ codigo: 'C1' }, { codigo: 'C2', modelo: 'Caminhão reserva' }], ocupacoes: [] };
        if (fn === 'ESC_salvarEtapa') { window.saved = structuredClone(args[1]); return { ok: true, conflitos: [] }; }
        return [];
      };
      const run = (ok, fail) => new Proxy({}, { get(_, fn) {
        if (fn === 'withSuccessHandler') return cb => run(cb, fail);
        if (fn === 'withFailureHandler') return cb => run(ok, cb);
        return (...args) => chamar(fn, args).then(ok, fail);
      } });
      window.google = { script: { run: run(() => {}, () => {}) } };
      window.supabaseClient = {
        from: () => { const q = { select: () => q, eq: () => q, limit: async () => ({ data: [] }) }; return q; },
        rpc: async n => ({ data: n==='rh_disponibilidade_logistica'&&window.__rhBloqueio?[{etapa_id:'montagem-teste',funcionario_id:'p3',motivo:'Folga da escala'},{etapa_id:'montagem-teste',funcionario_id:'p1',motivo:'Férias'},{etapa_id:'montagem-teste',funcionario_id:'p0',motivo:'Atestado'}]:[] })
      };
      window.EntregasColetas = { podeSelecionarOperacao: () => true, definirOperacao() {}, definirDia() {}, iniciar: async () => {} };
    });
    await page.route('**/*', r => {
      const url = new URL(r.request().url());
      if (!r.request().url().startsWith(BASE)) return r.abort();
      const name = decodeURIComponent(url.pathname);
      if (/\.(js|mjs)$/.test(name) && !name.includes('/PainelLogistico/')) return r.fulfill({ contentType: 'text/javascript', body: '' });
      const file = path.join(process.cwd(), name);
      if (!fs.existsSync(file)) return r.fulfill({ status: 404, body: '' });
      return r.fulfill({ body: fs.readFileSync(file), contentType: { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto(BASE + 'Modulos/Logistica/PainelLogistico/painel-logistico.html');
    const row = page.locator('[data-etapa-id="montagem-teste"]');
    const abrir = async (papel = 'equipe', sub = '') => {
      await row.locator('[data-abrir-escolha="' + papel + '"][data-substituir="' + sub + '"]').first().click();
      await page.locator('#plEscolhaFlutuante[open]').waitFor();
    };
    const visiveis = () => page.locator('.pl-escolha-card:visible').evaluateAll(es => es.map(e => e.dataset.valor));
    const aba = nome => page.locator('#plEscolhaFlutuante').getByRole('tab', { name: nome, exact: true });
    await row.waitFor();
    const confirmacao = row.locator('[data-col="Data"] [data-confirmacao-comercial]');
    assert.match(await confirmacao.innerText(), /Confirmado pelo Comercial/);
    assert.match(await confirmacao.getAttribute('title'), /Ana Comercial/);
    for (const [status, texto] of [['pendente', 'Aguardando Comercial'], ['alterado', 'Reconfirmar com Comercial'], ['indisponivel', 'Confirmação indisponível'], ['confirmado', 'Confirmado pelo Comercial']]) {
      await page.evaluate(status => { __confirmacao.status = status; PainelLogisticoEquipe.definirDia('2026-11-22'); }, status);
      assert.ok((await confirmacao.innerText()).includes(texto));
      assert.equal(await confirmacao.getAttribute('data-confirmacao-comercial'), status);
    }
    await abrir();
    assert.deepEqual(await page.locator('.pl-escolha-abas [role=tab]').allTextContents(), ['Responsáveis', 'Equipe interna', 'Free']);
    assert.deepEqual(await visiveis(), ['João Interno']);
    await aba('Responsáveis').click();
    assert.deepEqual(await visiveis(), ['Bruno Líder', 'Líder Free']);
    await aba('Free').click();
    assert.deepEqual(await visiveis(), ['Daniel Free', 'João Free']);
    assert.equal(await page.locator('.pl-escolha-card[data-valor="Líder Free"]').isVisible(), false, 'líder aparece apenas em Responsáveis');
    const busca = page.locator('[data-buscar-escolha]');
    await busca.fill('joao');
    assert.deepEqual(await visiveis(), ['João Free']);
    await aba('Equipe interna').click();
    assert.deepEqual(await visiveis(), ['João Interno'], 'busca acompanha a aba sem misturar categorias');
    await busca.fill('Daniel');
    assert.deepEqual(await visiveis(), []);
    assert.equal(await page.locator('.pl-escolha-vazia').isVisible(), true);
    await aba('Free').click();
    assert.deepEqual(await visiveis(), ['Daniel Free']);
    await busca.fill('');
    await aba('Free').focus();
    await page.keyboard.press('Home');
    assert.equal(await aba('Responsáveis').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowRight');
    assert.equal(await aba('Equipe interna').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Escape');
    await abrir('equipe', 'Carlos Interno');
    assert.equal(await aba('Equipe interna').getAttribute('aria-selected'), 'true');
    await aba('Free').click();
    await page.locator('.pl-escolha-card[data-valor="Daniel Free"]').click();
    await page.waitForFunction(() => saved?.equipe.includes('Daniel Free'));
    assert.deepEqual(await page.evaluate(() => saved.equipe), ['Daniel Free']);
    await abrir('equipe', 'Daniel Free');
    assert.equal(await aba('Free').getAttribute('aria-selected'), 'true', 'troca abre na categoria atual');
    assert.equal(await page.locator('[data-acao=tirar]').innerText(), 'Remover Daniel Free');
    await page.keyboard.press('Escape');
    await abrir('resp', 'Ana Responsável');
    assert.equal(await page.locator('.pl-escolha-abas').count(), 0);
    assert.deepEqual(await visiveis(), ['Bruno Líder', 'Líder Free'], 'responsável continua restrito a líderes');
    await page.keyboard.press('Escape');
    await abrir('cam');
    assert.equal(await page.locator('.pl-escolha-abas').count(), 0);
    assert.deepEqual(await visiveis(), ['C2']);
    await page.keyboard.press('Escape');
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await abrir();
      await aba('Responsáveis').click();
      for (const tab of await page.locator('.pl-escolha-abas [role=tab]').all()) assert.equal(await tab.isVisible(), true);
      assert.ok(await page.locator('#plEscolhaFlutuante').evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'modal sem corte horizontal');
      await aba('Free').click();
      assert.deepEqual(await visiveis(), ['João Free']);
      fs.mkdirSync('.tmp', { recursive: true });
      await page.screenshot({ path: '.tmp/painel-equipe-abas-' + width + '.png' });
      await page.keyboard.press('Escape');
      assert.ok(await confirmacao.evaluate(el => {
        const r = el.getBoundingClientRect(), td = el.closest('td').getBoundingClientRect();
        return r.left >= td.left - 1 && r.right <= td.right + 1 && r.bottom <= td.bottom + 1;
      }), 'confirmação cabe na coluna de data e horário');
      await page.screenshot({ path: '.tmp/painel-confirmacao-comercial-' + width + '.png' });
    }
    await page.evaluate(async()=>{__rhBloqueio=true;await PainelLogisticoEquipe.iniciar();});
    assert.match(await row.innerText(),/Atestado.*substituir pessoa/s,'pessoa já escalada é sinalizada para substituição');
    await abrir();
    await aba('Equipe interna').click();
    const folga=page.locator('.pl-escolha-card[data-valor="João Interno"]');
    assert.ok(await folga.isDisabled());assert.match(await folga.innerText(),/Folga da escala/);
    await aba('Responsáveis').click();
    const ferias=page.locator('.pl-escolha-card[data-valor="Bruno Líder"]');
    assert.ok(await ferias.isDisabled());assert.match(await ferias.innerText(),/Férias/);
    await page.screenshot({path:'.tmp/painel-rh-bloqueios.png'});
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    console.log('OK: categorias exclusivas, busca por aba, teclado, troca, responsável e caminhão preservados; confirmação comercial válida, pendente, alterada e indisponível na coluna de data; desktop e celular. APIs simuladas.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
