// Teste opt-in (RUN_SUBLOC_LIVE=1): aba Relatórios de Sublocações com empresa, usuário, parceiras e itens temporários.
// Sem pedido com sublocação mostra o aviso; "Ver com exemplo" monta os 10 quadros (tabela + pizza) sem gravar nada.
require('dotenv').config({ quiet: true });
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', tipos[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f)); });

(async () => {
  if (process.env.RUN_SUBLOC_LIVE !== '1') throw new Error('Defina RUN_SUBLOC_LIVE=1');
  const url = process.env.SUPABASE_URL;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const sufixo = crypto.randomUUID().slice(0, 8), senha = `Test-${crypto.randomUUID()}!`;
  let empresa, usuario, browser;
  await new Promise((r) => srv.listen(5614, r));
  try {
    empresa = ok(await admin.from('empresas').insert({ nome: `TESTE SUBLOC ${sufixo}` }).select('id').single()).id;
    const u = ok(await admin.auth.admin.createUser({ email: `teste-subloc-${sufixo}@example.invalid`, password: senha, email_confirm: true })).user; usuario = u.id;
    ok(await admin.from('usuarios').insert({ id: u.id, empresa_id: empresa, nome: 'Gestor Subloc' }));
    ok(await admin.from('usuarios_empresas').insert({ user_id: u.id, empresa_id: empresa, role: 'admin' }));
    const f1 = ok(await admin.from('fornecedores').insert({ empresa_id: empresa, nome_razao_social: 'Lounge Parceiro', nome_fantasia: 'Lounge Parceiro', tipo: 'servicos', documento: '', terceirizacao: true }).select('id').single()).id;
    const f2 = ok(await admin.from('fornecedores').insert({ empresa_id: empresa, nome_razao_social: 'Tendas Parceiro', nome_fantasia: 'Tendas Parceiro', tipo: 'servicos', documento: '', terceirizacao: true }).select('id').single()).id;
    ok(await admin.from('terceirizacao_itens').insert([
      { empresa_id: empresa, fornecedor_id: f1, produto: 'Sofá Branco', categoria: 'Sofás', quantidade: 20, custo: 150, valor_locacao: 260, valor_reposicao: 2500 },
      { empresa_id: empresa, fornecedor_id: f1, produto: 'Puff Dourado', categoria: 'Puffs', quantidade: 50, custo: 40, valor_locacao: 45, valor_reposicao: 300 },
      { empresa_id: empresa, fornecedor_id: f2, produto: 'Tenda 10x10', categoria: 'Tendas', quantidade: 5, custo: 900, valor_locacao: 1500, valor_reposicao: 12000 },
    ]));
    const cli = createClient(url, 'sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ', { auth: { persistSession: false, autoRefreshToken: false } });
    const sessao = ok(await cli.auth.signInWithPassword({ email: u.email, password: senha })).session;

    browser = await chromium.launch({ channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const erros = []; page.on('pageerror', (e) => erros.push(e.message));
    await page.addInitScript(([s, emp]) => { localStorage.setItem('easyloc-auth', JSON.stringify(s)); sessionStorage.setItem('empresa_id', emp); sessionStorage.setItem('login_ok', '1'); }, [sessao, empresa]);
    await page.goto('http://localhost:5614/Modulos/Comercial/Terceirizacoes/terceirizacoes.html?aba=relatorios', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.querySelector('#srAviso').hidden, null, { timeout: 30000 });
    assert.equal(await page.locator('.tz-layout').isHidden(), true, 'aba Relatórios esconde o cadastro');
    console.log('ok 1 - sem pedido com sublocação: aviso e quadros vazios');
    await page.click('#srExemplo');
    await page.waitForFunction(() => document.querySelectorAll('#srConteudo .sr-quadro').length === 10);
    const info = await page.evaluate(() => ({
      quadros: [...document.querySelectorAll('#srConteudo .sr-quadro h3')].map((h) => h.firstChild.textContent.trim()),
      pizzas: document.querySelectorAll('#srConteudo .sr-graf svg').length,
      itens: [...document.querySelectorAll('#srConteudo .sr-quadro:nth-child(2) tbody tr')].length,
      exemploVisivel: !document.querySelector('#srAvisoExemplo').hidden,
      larguraOk: document.documentElement.scrollWidth <= innerWidth + 1,
    }));
    assert.deepEqual(info.quadros, ['Resumo', 'Itens mais alugados', 'Quanto pagamos por mês', 'Empresas parceiras', 'Compensa comprar?', 'Margem', 'Clientes que mais pedem sublocação', 'Por categoria do item', 'Por tipo de evento', 'Pedidos com sublocação']);
    assert.equal(info.pizzas, 10); assert.ok(info.itens >= 1); assert.ok(info.exemploVisivel); assert.ok(info.larguraOk, 'sem rolagem lateral');
    await page.screenshot({ path: path.join(root, 'outputs', 'sublocacoes-relatorios.png'), fullPage: true });
    await page.click('[data-tz-aba="cadastro"]');
    assert.equal(await page.locator('.tz-layout').isVisible(), true);
    const topo = await page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); return { abas: r('.tz-abas'), titulo: r('#tzCabecalho h2'), busca: r('#tzBusca') }; });
    assert.ok(Math.abs(topo.abas.top - topo.titulo.top) < 30, 'abas na linha do título');
    assert.ok(topo.abas.right < topo.titulo.left && topo.busca.left > topo.titulo.right, 'abas à esquerda e pesquisa à direita do título');
    await page.screenshot({ path: path.join(root, 'outputs', 'sublocacoes-cadastro-topo.png'), clip: { x: 0, y: 0, width: 1440, height: 220 } });
    assert.deepEqual(erros, []);
    console.log('ok 2 - "Ver com exemplo": 10 quadros com tabela e pizza, sem rolagem lateral; voltar ao cadastro');
  } finally {
    if (browser) await browser.close();
    srv.close();
    if (empresa) {
      await admin.from('terceirizacao_itens').delete().eq('empresa_id', empresa);
      await admin.from('fornecedores').delete().eq('empresa_id', empresa);
      await admin.from('usuarios_empresas').delete().eq('empresa_id', empresa);
      if (usuario) { await admin.from('usuarios').delete().eq('id', usuario); await admin.auth.admin.deleteUser(usuario); }
      await admin.from('empresas').delete().eq('id', empresa);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
