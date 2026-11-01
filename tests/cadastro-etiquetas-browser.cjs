// Etiquetas de Clientes/Locais vindas de Parâmetros > Comercial, foto na linha de clientes e lista em blocos ao rolar.
// Uso: node tests/cadastro-etiquetas-browser.cjs
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const base = 'http://localhost:5599/';
const GRUPOS_CLI = [
  { chave: 'estilo', titulo: 'Estilo', cor: 'azul', unica: false, obrigatoria: true, opcoes: ['Clássico', 'Industrial'] },
  { chave: 'canal', titulo: 'Canal', cor: 'verde', unica: true, obrigatoria: false, opcoes: ['WhatsApp'] },
  { chave: 'orcamento', titulo: 'Orçamento', cor: 'laranja', unica: true, obrigatoria: true, opcoes: ['Econômico', 'Premium'] }
];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

function mock(banco) {
  window.__CONTEXT = { empresa_id: 'e1' };
  window.aguardarContexto = async () => window.__CONTEXT;
  window.hasPermission = () => true;
  window.lucide = { createIcons() {} };
  window.__banco = banco; window.__gravados = [];
  window.supabaseClient = {
    from(t) {
      let linhas = (window.__banco[t] || []).slice(), single = false;
      const q = {
        select() { return q; }, eq(k, v) { linhas = linhas.filter(l => l[k] === undefined || String(l[k]) === String(v)); return q; },
        order() { return q; }, range(a, b) { linhas = linhas.slice(a, b + 1); return q; }, limit() { return q; }, in() { return q; },
        ilike() { return q; }, or() { return q; }, gte() { return q; }, lte() { return q; }, neq() { return q; }, is() { return q; },
        single() { single = true; return q; }, maybeSingle() { single = true; return q; },
        upsert(row) { window.__gravados.push({ t, row }); return Promise.resolve({ error: null }); },
        update(row) { window.__gravados.push({ t, row, op: "update" }); return q; }, insert(row) { window.__gravados.push({ t, row, op: "insert" }); return q; },
        then(o, f) { return Promise.resolve({ data: single ? linhas[0] || null : linhas, error: null }).then(o, f); }
      };
      return q;
    },
    async rpc(nome,args) { window.__gravados.push({t:'rpc:'+nome,row:args});return { data: [], error: null }; }
  };
}

async function abrir(b, pagina, banco) {
  const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(mock, banco);
  await p.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith('https://fixture/')) return r.fulfill({ contentType: 'image/png', body: PNG });
    if (!u.startsWith(base)) return r.fulfill({ body: '', contentType: 'text/javascript' });
    const f = path.join(process.cwd(), decodeURIComponent(new URL(u).pathname));
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    if (/(supabase|context|google|permissions|doisFatores)\.js/.test(u)) return r.fulfill({ body: '', contentType: 'text/javascript' });
    r.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.html') ? 'text/html' : f.endsWith('.css') ? 'text/css' : 'text/javascript' });
  });
  await p.goto(base + pagina);
  return { p, errs };
}

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    // ---------- Clientes ----------
    const clientes = Array.from({ length: 45 }, (_, i) => ({ id: 'c' + i, empresa_id: 'e1', nome_razao: 'Cliente ' + String(i).padStart(2, '0'), telefone: '24992842746', email: 'c@x.com', status: 'Ativo', tags: { estilo: i === 0 ? ['Boho'] : ['Clássico'], orcamento: i < 30 ? 'Premium' : 'Econômico' }, catalogo_logo_url: i === 0 ? 'https://fixture/f.png' : null }));
    let { p, errs } = await abrir(b, 'Modulos/Comercial/CadastroClientes/cadastro-clientes.html', { clientes_empresas: clientes, cadastro_etiquetas: [{ empresa_id: 'e1', cadastro: 'cliente', grupos: GRUPOS_CLI }] });
    await p.waitForSelector('#clientTable tr');
    await p.waitForFunction(() => document.querySelectorAll('.tag-group').length === 3);
    assert.equal(await p.locator('#clientesStats').count(), 0, 'cartões de resumo saíram');
    assert.equal(await p.locator('#clientTable tr').count(), 20, 'primeiro bloco de 20');
    assert.equal(await p.locator('#clientTable tr').first().locator('.cliente-linha-foto img').count(), 1, 'foto na linha');
    assert.equal(await p.locator('#clientTable tr').nth(1).locator('.cliente-linha-foto > span').innerText(), 'C0', 'iniciais sem foto');
    await p.locator('.easyloc-list-pager').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => document.querySelectorAll('#clientTable tr').length === 40);
    await p.locator('.easyloc-list-pager').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => document.querySelectorAll('#clientTable tr').length === 45);
    assert.match(await p.locator('.easyloc-list-pager').innerText(), /45 cadastro/);
    assert.deepEqual(await p.$$eval('#styleFilter option', o => o.map(x => x.textContent)), ['Todos os estilos', 'Clássico', 'Industrial']);
    await p.selectOption('#budgetFilter', 'Econômico');
    assert.equal(await p.locator('#clientTable tr').count(), 15, 'filtro de orçamento (valor único) funciona');
    await p.selectOption('#budgetFilter', '');
    await p.locator('#clientTable tr').first().click();
    await p.waitForSelector('#modal:not(.hidden)');
    assert.deepEqual(await p.$$eval('.tag-group[data-group="estilo"] .tag', t => t.map(x => x.textContent)), ['Clássico', 'Industrial', 'Boho'], 'opção antiga continua aparecendo');
    assert.equal(await p.locator('.tag-group[data-group="estilo"] .tag.fora-da-lista.selected').count(), 1);
    assert.equal(await p.getAttribute('.tag-group[data-group="canal"]', 'data-obrigatoria'), 'false');
    assert.equal(await p.locator('#cx-cliente-reclamacao').inputValue(),'');
    assert.deepEqual(await p.evaluate(()=>{CXCadastro.preencher('cliente',{reclamacao:false,exclusivo:true,anterior:'preservar'});const r=CXCadastro.ler('cliente');CXCadastro.preencher('cliente',{});return r;}),{reclamacao:false,exclusivo:true,anterior:'preservar'});
    await p.screenshot({ path: path.join(process.env.TMP || '.', 'clientes-etiquetas.png') });
    // BV com explicação: campos existem, ficam travados fora da edição e são obrigatórios para dar BV
    for (const id of ["clienteBvObservacao", "clienteBvNegociadoPor", "clienteBvAprovadoPor"]) assert.equal(await p.locator("#" + id).count(), 1, id);
    assert.equal(await p.locator("#clienteBvObservacao").evaluate((e) => e.readOnly), true);
    const dialogos = []; p.on("dialog", (d) => dialogos.push(d.message()));
    await p.evaluate(async () => {
      document.getElementById("clienteBvRecebe").disabled = false; document.getElementById("clienteBvRecebe").value = "true";
      const pc = document.getElementById("clienteBvPercentual"); pc.readOnly = false; pc.value = "10";
      document.getElementById("clienteBvObservacao").value = "";
      window.__msgs = []; const orig = window.alerta; window.alerta = (m) => window.__msgs.push(m);
      try { await window.clientes_salvar(); } finally { window.alerta = orig; }
    });
    const alerta = dialogos.concat(await p.evaluate(() => window.__msgs)).join(" | ");
    assert.match(alerta, /por que o cliente recebe esse BV/);
    assert.equal(await p.evaluate(() => window.__gravados.filter((g) => g.t === "clientes_empresas").length), 0, "não salvou sem a explicação");
    assert.deepEqual(errs, []);
    console.log('ok 1 - clientes: etiquetas do parâmetro, foto, blocos ao rolar, filtros');
    await p.close();

    // ---------- Parâmetros ----------
    ({ p, errs } = await abrir(b, 'Modulos/Configuracoes/Parametros/parametros.html', { cadastro_etiquetas: [{ empresa_id: 'e1', cadastro: 'cliente', grupos: GRUPOS_CLI }, { empresa_id: 'e1', cadastro: 'local', grupos: [{ chave: 'tipo', titulo: 'Tipo', cor: 'azul', unica: true, obrigatoria: true, opcoes: ['Hotel'] }] }], empresas: [{ id: 'e1', nome: 'Teste' }], comercial_motivos_cancelamento: [{ id: "m1", empresa_id: "e1", nome: "Evento remarcado", descricao: "Mudou a data", ativo: true, ordem: 1 }, { id: "m2", empresa_id: "e1", nome: "Outro motivo", descricao: "", ativo: true, ordem: 99 }], clientes_equipe_papeis: [{ id: "pp1", empresa_id: "e1", nome: "Titular", ativo: true, ordem: 1 }, { id: "pp2", empresa_id: "e1", nome: "Assistente", ativo: true, ordem: 2 }] }));
    await p.waitForFunction(() => !document.getElementById('salvarEmpresaParametros').disabled, null, { timeout: 15000 });
    await p.click('#pr-tab-comercial');
    await p.waitForSelector('[data-etiquetas-cadastro="cliente"] .pe-grupo');
    await p.waitForSelector('#parametrosComplexidade');assert.equal(await p.locator('[data-cx-peso]').count(),52);
    await p.locator('[data-cx-param="limite_pecas"]').fill('60');
    const cli = p.locator('[data-etiquetas-cadastro="cliente"]');
    await cli.locator('.pe-grupo[data-i="0"] .pe-nova').fill('Rústico');
    await cli.locator('.pe-grupo[data-i="0"] .pe-nova').press('Enter');
    assert.equal(await cli.locator('.pe-grupo[data-i="0"] .pe-opcao').count(), 3);
    await cli.locator('.pe-grupo[data-i="0"] [data-acao="remover-opcao"][data-j="1"]').click();
    await cli.locator('[data-acao="novo-grupo"]').click();
    await cli.locator('.pe-grupo[data-i="3"] .pe-titulo').fill('Tamanho do evento');
    await cli.locator('.pe-grupo[data-i="3"] .pe-nova').fill('Até 100 pessoas');
    await p.screenshot({ path: path.join(process.env.TMP || '.', 'parametros-etiquetas.png'), fullPage: true });
    await p.click('#salvarEmpresaParametros');
    await p.waitForFunction(() => window.__gravados.filter(x => x.t === 'cadastro_etiquetas').length >= 2);
    const g = await p.evaluate(() => window.__gravados);
    const cx=g.find(x=>x.t==='rpc:complexidade_config_salvar');assert.equal(cx.row.p_config.limite_pecas,60);assert.equal(Object.keys(cx.row.p_config.pesos).length,26);
    const gc = g.find(x => x.t === 'cadastro_etiquetas' && x.row.cadastro === 'cliente').row.grupos;
    assert.deepEqual(gc[0].opcoes, ['Clássico', 'Rústico']);
    assert.equal(gc[3].chave, 'tamanho_do_evento');
    assert.deepEqual(gc[3].opcoes, ['Até 100 pessoas']);
    assert.ok(g.some(x => x.row.cadastro === 'local'));
    // motivos de cancelamento
    await p.waitForSelector(".pr-motivos-cancel .pr-mc-lista li");
    assert.deepEqual(await p.$$eval(".pr-motivos-cancel [data-nome]", (l) => l.map((x) => x.value)), ["Evento remarcado", "Outro motivo"]);
    await p.fill(".pr-motivos-cancel [data-novo] [name=nome]", "Orçamento acima do previsto");
    await p.click(".pr-motivos-cancel [data-novo] button");
    await p.waitForFunction(() => window.__gravados.some((g) => g.t === "comercial_motivos_cancelamento" && g.op === "insert"));
    assert.equal((await p.evaluate(() => window.__gravados.find((g) => g.t === "comercial_motivos_cancelamento" && g.op === "insert").row)).nome, "Orçamento acima do previsto");
    await p.locator(".pr-motivos-cancel [data-ativo]").first().uncheck();
    await p.waitForFunction(() => window.__gravados.some((g) => g.t === "comercial_motivos_cancelamento" && g.op === "update" && g.row.ativo === false));
    // papéis das equipes de clientes
    await p.waitForSelector(".pr-papeis-equipe .pr-mc-lista li");
    assert.deepEqual(await p.$$eval(".pr-papeis-equipe [data-nome]", (l) => l.map((x) => x.value)), ["Titular", "Assistente"]);
    assert.equal(await p.locator(".pr-papeis-equipe [data-descricao]").count(), 0, "papel sem explicação");
    await p.fill(".pr-papeis-equipe [data-novo] [name=nome]", "Produtora");
    await p.click(".pr-papeis-equipe [data-novo] button");
    await p.waitForFunction(() => window.__gravados.some((g) => g.t === "clientes_equipe_papeis" && g.op === "insert"));
    assert.deepEqual(await p.evaluate(() => { const r = window.__gravados.find((g) => g.t === "clientes_equipe_papeis" && g.op === "insert").row; return [r.nome, "descricao" in r]; }), ["Produtora", false]);
    console.log('ok 2 - parâmetros: incluir/tirar opção, novo grupo, salvar; motivos de cancelamento; papéis das equipes', errs.length ? errs : '');
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
