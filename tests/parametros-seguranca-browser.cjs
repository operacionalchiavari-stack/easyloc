// Out/2026 — Parâmetros > Segurança: verificação em duas etapas (painel, testar, ligar só depois de testar).
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const raiz = path.resolve(__dirname, "..");
const BASE = "http://acervo.teste/";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64");

// Supabase simulado: from(tabela) devolve um construtor encadeável que só tem "then" (igual ao real).
const mockSupabase = `
(() => {
  const banco = {
    empresas: [{ id: "e1", nome: "Chiavari", razao_social: "Chiavari", cnpj: "" }],
    catalogo_parametros: [{ empresa_id: "e1", config: { preco: { equipe: true, decoradores: "escolhidos", decoradores_ids: ["c2"], visitantes: false } } }]
  };
  window.__gravado = null;
  function consulta(tabela){
    let linhas = (banco[tabela] || []).slice(), unico = false;
    const q = {
      select(){ return q; }, order(){ return q; }, limit(){ return q; }, range(){ return q; }, gte(){ return q; }, lte(){ return q; },
      neq(){ return q; }, or(){ return q; }, ilike(){ return q; }, not(){ return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      in(c, vs){ linhas = linhas.filter((l) => vs.map(String).includes(String(l[c]))); return q; },
      single(){ unico = true; return q; }, maybeSingle(){ unico = true; return q; },
      update(){ return q; }, insert(){ return q; }, upsert(p){ window.__gravado = p; return q; }, delete(){ return q; },
      then(ok, erro){ return Promise.resolve({ data: unico ? (linhas[0] || null) : linhas, error: null }).then(ok, erro); }
    };
    return q;
  }
  const canal = { on(){ return canal; }, subscribe(){ return canal; } };
  const cliente = {
    auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }),
      getUser: async () => ({ data: { user: { id: "u1", email: "a@b" } } }), signOut: async () => {},
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: consulta,
    rpc: (nome, args) => ({ then: (ok, erro) => Promise.resolve(nome === "funcionario_contexto"
      ? { data: { ativo: true, administrador_legado: true }, error: null }
      : nome === "seguranca_2fa_painel" ? { data: { obrigatorio: window.__ligado || false, sessao_verificada: window.__testado || false, usuarios: [{ nome: "Jonatan", tem_whatsapp: true, whatsapp: "(**) *****-2746", eu: true, ultima_verificacao: null }, { nome: "Carol", tem_whatsapp: true, whatsapp: "(**) *****-1111" }], eventos: window.__testado ? [{ tipo: "verificado", criado_em: "2026-10-23T12:00:00Z", nome: "Jonatan", detalhes: { metodo: "whatsapp" } }] : [{ tipo: "envio_falhou", criado_em: "2026-10-23T11:00:00Z", nome: "Jonatan", detalhes: { motivo: "O WhatsApp da empresa está sem o token de segurança da Z-API." } }] }, error: null }
      : nome === "seguranca_2fa_config_salvar" ? (window.__salvo = args, window.__ligado = args.p_obrigatorio, { data: { obrigatorio: args.p_obrigatorio }, error: null })
      : nome === "almox_compra_config_salvar" ? (window.__salvo = args, { data: { automatica: args.p_automatica, abertas: 3 }, error: null })
      : nome === "catalogo_decoradores_lista" ? { data: [{ id: "c1", nome: "Lis Baêtas", ativo: true }, { id: "c2", nome: "Kelly Khawam", ativo: true }, { id: "c3", nome: "Fabiane", ativo: false }], error: null }
      : { data: [], error: null }).then(ok, erro) }),
    functions: { invoke: async (n, { body }) => { (window.__acoes = window.__acoes || []).push(body.action); if (body.action === "status") return { data: { obrigatorio: false, verificado: !!window.__testado, tem_whatsapp: true, whatsapp: "(**) *****-2746" } }; if (body.action === "enviar") return { data: { ok: true, validade_min: 5 } }; if (body.action === "verificar") { window.__testado = true; return { data: { ok: true, recuperacao: null } }; } return { data: {} }; } },
    channel: () => canal, removeChannel(){},
    storage: { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: "https://fixture/" + p } }) }) }
  };
  window.supabase = { createClient: () => cliente };
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide|google/i.test(e.message)) erros.push(e.message); });
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); sessionStorage.setItem("usuario_nome", "Teste"); });
  await page.route("**/*", (rota) => {
    const url = rota.request().url();
    if (url.includes("supabase-js")) return rota.fulfill({ contentType: "text/javascript", body: mockSupabase });
    if (url.startsWith(BASE)) {
      const arquivo = path.join(raiz, decodeURIComponent(new URL(url).pathname));
      if (!fs.existsSync(arquivo)) return rota.fulfill({ status: 404, body: "" });
      const tipo = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[path.extname(arquivo)] || "application/octet-stream";
      return rota.fulfill({ contentType: tipo, body: fs.readFileSync(arquivo) });
    }
    return rota.abort();
  });
  await page.goto(BASE + "Modulos/Configuracoes/Parametros/parametros.html");
  await page.waitForFunction(() => !document.getElementById("salvarEmpresaParametros").disabled, null, { timeout: 15000 }).catch(() => {});
  page.on('dialog', (d) => d.accept());
  await page.click('#pr-tab-seguranca');
  await page.waitForSelector('#pr-painel-seguranca:not([hidden]) .ps-selo');
  assert.ok(await page.isHidden('#parametrosEmpresa'), 'o bloco da empresa some na aba Segurança');
  assert.strictEqual(await page.textContent('.ps-selo'), 'Desligada');
  assert.match(await page.textContent('#pr-painel-seguranca'), /token de segurança da Z-API/);
  assert.ok(await page.isDisabled('[data-ps=ligar]'), 'só liga depois de testar');
  assert.strictEqual(await page.locator('.pr-tabela tbody tr').first().locator('td').nth(1).textContent(), '(**) *****-2746');
  console.log('ok 1 - painel: desligada, aviso do Z-API, pessoas com WhatsApp mascarado, ligar travado');
  await page.click('[data-ps=testar]');
  await page.locator('.e2f-codigo').fill('482913');
  await page.waitForFunction(() => document.querySelector('[data-ps=testar]')?.textContent.includes('confirmou'));
  assert.deepStrictEqual(await page.evaluate(() => window.__acoes), ['status', 'enviar', 'verificar']);
  assert.ok(!(await page.isDisabled('[data-ps=ligar]')));
  console.log('ok 2 - testar agora envia o código e libera o botão de ligar');
  await page.click('[data-ps=ligar]');
  await page.waitForFunction(() => document.querySelector('.ps-selo')?.textContent === 'Ligada');
  assert.deepStrictEqual(await page.evaluate(() => window.__salvo), { p_empresa: 'e1', p_obrigatorio: true });
  await page.screenshot({ path: '.tmp/parametros-seguranca.png', fullPage: true });
  console.log('ok 3 - ligar chama seguranca_2fa_config_salvar');
  assert.deepStrictEqual(erros, []);
  console.log("todos os testes passaram");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
