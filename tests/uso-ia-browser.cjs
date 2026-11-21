// Geral › Uso de IA (21/11/2026): franquia do mês, projeção, excedente, por agente, por dia, equipe × decoradores,
// meses anteriores e a franquia que só o responsável pelo sistema muda. Banco simulado (RPC ia_uso_painel).
const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), assert = require('assert/strict');
const FOTO = process.env.FOTO;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), erros = [];
    page.on('pageerror', (e) => erros.push(e.message));
    const BASE = 'http://localhost:9931/';
    const bloqueia = /(supabase-js|js\/core\/(supabase|context|permissions|companyTheme|moduleTheme|limpezaDados)\.js)/;
    await page.route(/^https:\/\/cdn\.jsdelivr\.net\//, (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await page.route(BASE + '**', (route) => {
      const u = new URL(route.request().url()), f = path.join(process.cwd(), decodeURIComponent(u.pathname));
      if (bloqueia.test(u.pathname)) return route.fulfill({ contentType: 'application/javascript', body: '' });
      if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
      const tipo = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream';
      return route.fulfill({ contentType: tipo, body: fs.readFileSync(f) });
    });
    await page.addInitScript(() => {
      const hoje = new Date(), mes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
      const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
      const dia = (n) => `${mes}-${String(n).padStart(2, '0')}`;
      window.__CONTEXT = { empresa_id: 'e1' }; window.aguardarContexto = async () => {}; window.__rpc = [];
      const painel = (dono) => ({
        mes: dia(1), fim: dia(fimMes), hoje: dia(Math.min(hoje.getDate(), fimMes)), dias_mes: fimMes, dias_passados: Math.max(1, hoje.getDate() - 0.5),
        franquia: 2000, valor_excedente: 0.1, tem_plano: true, avisos: [80, 100], usado: 1720, restante: 280, excedente: 0, valor_excedente_total: 0,
        projecao: 2450, chamadas: 412, eh_dono: dono, custo_usd: dono ? 17.2 : null,
        por_origem: [
          { origem: 'helena', creditos: 820, chamadas: 160, equipe: 220, decoradores: 600 },
          { origem: 'studio3d', creditos: 510, chamadas: 22, equipe: 300, decoradores: 210 },
          { origem: 'clara', creditos: 240, chamadas: 120, equipe: 240, decoradores: 0 },
          { origem: 'reunioes', creditos: 150, chamadas: 110, equipe: 150, decoradores: 0 },
        ],
        por_pessoa: [
          { tipo: 'decorador', cliente_id: 'c1', nome: 'Kelly Khawam', foto: null, creditos: 640, chamadas: 90, origens: { helena: 500, studio3d: 140 } },
          { tipo: 'equipe', usuario_id: 'u1', nome: 'Larissa Mendes', foto: null, creditos: 520, chamadas: 150, origens: { helena: 220, studio3d: 300 } },
          { tipo: 'equipe', usuario_id: 'u2', nome: 'Jonatan Falck', foto: null, creditos: 390, chamadas: 230, origens: { clara: 240, reunioes: 150 } },
          { tipo: 'decorador', cliente_id: 'c2', nome: 'Fabiane Gabrich', foto: null, creditos: 170, chamadas: 30, origens: { helena: 100, studio3d: 70 } },
        ],
        por_dia: Array.from({ length: Math.min(hoje.getDate(), fimMes) }, (_, i) => ({ dia: dia(i + 1), creditos: 40 + ((i * 37) % 90), equipe: 30 + ((i * 13) % 40), decoradores: 10 + ((i * 24) % 50) })),
        historico: [{ mes: dia(1), usado: 1720, excedente: 0, valor: 0 }, { mes: '2026-10-01', usado: 2380, excedente: 380, valor: 38 }],
        recentes: [{ criado_em: new Date().toISOString(), origem: 'helena', acao: 'conversar', creditos: 3.2, nome: 'Kelly Khawam', decorador: true }],
      });
      window.supabaseClient = {
        storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
        rpc: async (nome, args) => { window.__rpc.push({ nome, args }); if (nome === 'ia_uso_painel') return { data: painel(window.__dono === true), error: null }; return { data: { ok: true }, error: null }; },
      };
    });
    await page.goto(BASE + 'Modulos/Geral/UsoIA/uso-ia.html');
    await page.locator('.ia-hero').waitFor();
    const hero = await page.locator('.ia-hero').innerText();
    assert.match(hero, /1\.720/); assert.match(hero, /de 2\.000/); assert.match(hero, /86%/);
    assert.match(hero, /2\.450/, 'projeção'); assert.match(hero, /acima da franquia/i, 'frase da projeção acima');
    assert.ok(await page.locator('.ia-hero.is-alerta').count(), 'acima de 80% fica em alerta');
    assert.equal(await page.locator('#iaPlanoBtn').isHidden(), true, 'a empresa não muda a franquia');
    assert.doesNotMatch(hero, /Custo real/, 'custo real só para o dono');
    assert.equal(await page.locator('.ia-agente').count(), 6, 'os 6 agentes do time aparecem sempre');
    assert.equal(await page.locator('.ia-agente img').count(), 6, 'com a foto de cada um');
    assert.ok((await page.locator('.ia-agente-foto').first().boundingBox()).width >= 120, 'foto grande');
    assert.match(await page.locator('#iaOrigens').innerText(), /Helena[\s\S]*decoradores 600/);
    assert.match(await page.locator('#iaOrigens').innerText(), /Outras funções com IA[\s\S]*3D e renderizações/);
    assert.match(await page.locator('h1').innerText(), /Time de agentes/i);
    assert.ok(await page.locator('.ia-dia').count() >= 28, 'um dia por coluna no gráfico');
    await page.locator('.ia-dia').nth(1).hover();
    assert.match(await page.locator('#iaDiaLeitura').innerText(), /^2 de .* créditos/);
    assert.equal(await page.locator('#iaPEquipe .ia-pz-leg li').count(), 2, 'pizza da equipe');
    assert.match(await page.locator('#iaPDecoradores').innerText(), /Kelly Khawam[\s\S]*Fabiane Gabrich/);
    assert.equal(await page.locator('#iaPDecoradores svg circle').count(), 2, 'uma fatia por decorador');
    assert.match(await page.locator('#iaHistorico').innerText(), /R\$\s*38,00/);
    if (FOTO) await page.screenshot({ path: FOTO, fullPage: true });
    // responsável pelo sistema: vê o custo real e muda a franquia
    await page.evaluate(() => { window.__dono = true; return window.UsoIA.carregar(); });
    await page.locator('#iaPlanoBtn').waitFor();
    assert.equal(await page.locator('.ia-so-dono').count(), 0, 'sem o cartão do custo real');
    await page.locator('#iaPlanoBtn').click();
    await page.locator('#iaPlFranquia').fill('3000'); await page.locator('#iaPlValor').fill('0.12');
    await page.locator('#iaPlSalvar').click();
    const salvo = await page.evaluate(() => window.__rpc.find((r) => r.nome === 'ia_plano_salvar'));
    assert.deepEqual(salvo.args, { p_empresa: 'e1', p_franquia: 3000, p_valor: 0.12, p_obs: '' });
    await page.locator('#iaMesAnt').click();
    assert.equal(await page.evaluate(() => window.__rpc.filter((r) => r.nome === 'ia_uso_painel').length) >= 3, true);
    assert.deepEqual(erros, []);
    const menu = fs.readFileSync('js/ui/sidebarMenu.js', 'utf8');
    assert.match(menu, /rotulo: "Time de agentes", href: "Modulos\/Geral\/UsoIA\/uso-ia.html"/);
    console.log('OK - Uso de IA: franquia, projeção, por agente, por dia, equipe × decoradores, meses e franquia do responsável.');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
