// Out/2026 — Central de Pedidos: as janelas de cadastro do cliente e do local ficam largas (duas colunas em tela larga)
// e cabem sem barra de rolagem.
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
    separacoes_pedidos: [{ id: "p1", empresa_id: "e1", numero_pedido: "003", cliente_nome: "Lis Baêtas", status: "orcamento",
      data_evento: "2026-11-11", data_evento_fim: "2026-11-13", local_nome: "Vale dos Desejos", valor_total: 900,
      created_at: "2026-10-09T10:00:00Z", data_hora: "2026-10-09T10:00:00Z",
      observacoes: { projeto_comercial: { noivos: "Lis Baêtas", dados: { ambientes: [
        { id: "a1", nome: "Lounge", itens: [{ item_id: "i1", quantidade: 2 }], renders: [{ url: "https://fixture/render.png", origem: "3D Livre" }] },
        { id: "a2", nome: "Bar", itens: [{ item_id: "i2", quantidade: 1 }], renders: [] } ] } } } }],
    separacoes_itens: [
      { item_id: "i1", item_nome: "Sofá Berlim", quantidade_solicitada: 2, empresa_id: "e1", separacao_pedido_id: "p1" },
      { item_id: "i2", item_nome: "Bar Bistrol", quantidade_solicitada: 1, empresa_id: "e1", separacao_pedido_id: "p1" },
      { item_id: "i3", item_nome: "Mesa Goa", quantidade_solicitada: 4, empresa_id: "e1", separacao_pedido_id: "p1" } ],
    itens: [
      { id: "i1", empresa_id: "e1", produto: "Berlim", produto_base: "Sofá", descricao_total: "Sofá Berlim Linho (L) 2.58 m (A) 0.73 m (P) 0.89 m", foto_url: "https://fixture/sofa.png", referencia: "SOF001", categoria: "Sofás", largura: 2.58, altura: 0.73, profundidade: 0.89, valor_locacao: 300, valor_reposicao: 5000 },
      { id: "i2", empresa_id: "e1", produto: "Bistrol", produto_base: "Bar", descricao_total: "Bar Bistrol", foto_url: "https://fixture/bar.png", referencia: "BAR002", categoria: "Bares", valor_locacao: 200, valor_reposicao: 3000 },
      { id: "i3", empresa_id: "e1", produto: "Goa", produto_base: "Mesa", descricao_total: "Mesa Goa", foto_url: "", referencia: "MES003", categoria: "Mesas", valor_locacao: null, valor_reposicao: null } ],
    empresas: [{ id: "e1", nome: "Chiavari", logo_url: "https://fixture/logo.png" }],
    clientes_empresas: [{ id: "c1", empresa_id: "e1", nome_razao: "Lis Baêtas", catalogo_logo_url: "https://fixture/lis.png", telefone: "11999998888", email: "lis@exemplo.com", cpf_cnpj: "12.345.678/0001-90", status: "Ativo", endereco: "Rua das Flores, 120 — São Paulo", observacoes: "Prefere atendimento por WhatsApp", tags: ["Decoradora", "VIP"] }],
    locais_empresas: [{ id: "l1", empresa_id: "e1", nome: "Vale dos Desejos", endereco: "Estrada do Vale, 2000 — Itu", ponto_referencia: "Após o posto", responsavel: "Marcos", telefone: "11988887777", latitude: -23.2, longitude: -47.3, observacoes: "Portão largo" }]
  };
  function consulta(tabela){
    let linhas = (banco[tabela] || []).slice(), unico = false;
    const q = {
      select(){ return q; }, order(){ return q; }, limit(){ return q; }, range(){ return q; }, gte(){ return q; }, lte(){ return q; },
      neq(){ return q; }, or(){ return q; }, ilike(){ return q; }, not(){ return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      in(c, vs){ linhas = linhas.filter((l) => vs.map(String).includes(String(l[c]))); return q; },
      single(){ unico = true; return q; }, maybeSingle(){ unico = true; return q; },
      update(){ return q; }, insert(){ return q; }, upsert(){ return q; }, delete(){ return q; },
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
    rpc: (nome) => ({ then: (ok, erro) => Promise.resolve(nome === "funcionario_contexto"
      ? { data: { ativo: true, administrador_legado: true }, error: null } : { data: [], error: null }).then(ok, erro) }),
    channel: () => canal, removeChannel(){},
    storage: { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: "https://fixture/" + p } }) }) }
  };
  window.supabase = { createClient: () => cliente };
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide|sessionStorage/.test(e.message)) erros.push(e.message); });
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); sessionStorage.setItem("usuario_nome", "Teste"); });
  await page.route("**/*", (rota) => {
    const url = rota.request().url();
    if (url.startsWith("https://fixture/")) return rota.fulfill({ contentType: "image/png", body: PNG });
    if (url.includes("supabase-js")) return rota.fulfill({ contentType: "text/javascript", body: mockSupabase });
    if (url.startsWith(BASE)) {
      const arquivo = path.join(raiz, decodeURIComponent(new URL(url).pathname));
      if (!fs.existsSync(arquivo)) return rota.fulfill({ status: 404, body: "" });
      const tipo = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[path.extname(arquivo)] || "application/octet-stream";
      return rota.fulfill({ contentType: tipo, body: fs.readFileSync(arquivo) });
    }
    return rota.abort();
  });
  await page.goto(BASE + "Modulos/Comercial/Pedidos/CentralPedidos.html");
  await page.waitForSelector('[data-pedido-id="p1"] [data-action="abrir-cliente"]', { timeout: 15000 });
  const medir = () => page.evaluate(() => { const d = document.querySelector(".central-cadastro-dialog"), b = document.querySelector(".central-cadastro-body");
    return { largura: Math.round(d.getBoundingClientRect().width), rola: b.scrollHeight > b.clientHeight + 1, alturaJanela: Math.round(d.getBoundingClientRect().height) }; });
  for (const tipo of ["cliente", "local"]) {
    await page.click('[data-pedido-id="p1"] [data-action="abrir-' + tipo + '"]');
    await page.waitForSelector(tipo === "cliente" ? ".cad-hero" : ".cad-local");
    await page.waitForTimeout(300);
    const m = await medir();
    if (process.env.FOTO) await page.screenshot({ path: process.env.FOTO.replace(".png", "-" + tipo + ".png") });
    assert.ok(m.largura >= 1100, tipo + ": janela larga (" + m.largura + "px)");
    assert.ok(!m.rola, tipo + ": sem barra de rolagem (" + JSON.stringify(m) + ")");
    console.log("ok - " + tipo + ": " + m.largura + "px de largura, sem barra de rolagem");
    await page.click("#btnFecharCadastroRelacionado");
  }
  assert.deepStrictEqual(erros, []);
  await browser.close();
  console.log("todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });
