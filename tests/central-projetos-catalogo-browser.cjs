// Out/2026 — projetos que os decoradores montam no catálogo aparecem na Central de Pedidos com o selo "Veio do catálogo"
// (pedido do usuário: "a central de pedidos do comercial é a base principal do sistema"). Só os de decorador (cliente_id);
// sem contrato nem PIX; presença do decorador ("Montando agora"/"Visto há N min"); "Visualizar" e o duplo clique abrem a mesma prévia do pedido; valor = quantidade × locação.
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
    projetos: [
      { id: "pr1", empresa_id: "e1", cliente_id: "c1", noivos: "Ana e Bruno", data_evento: "2026-12-05", local_evento: "Fazenda Vila Rica", status: "pedido_enviado",
        created_at: "2026-10-10T10:00:00Z", updated_at: "2026-10-14T10:00:00Z",
        dados: { ambientes: [{ id: "a1", nome: "Lounge", itens: [{ item_id: "i1", quantidade: 2 }, { item_id: "i2", quantidade: 1 }], renders: [] }] } },
      { id: "pr3", empresa_id: "e1", cliente_id: "c1", noivos: "Carla e Davi", data_evento: "2026-12-20", local_evento: "Casa Rosa", status: "rascunho",
        created_at: "2026-10-11T10:00:00Z", updated_at: "2026-10-12T10:00:00Z", dados: { ambientes: [] } },
      { id: "pr2", empresa_id: "e1", cliente_id: null, noivos: "Projeto da equipe", data_evento: "2026-12-06", local_evento: "X", status: "rascunho", dados: { ambientes: [] } } ],
    projetos_presenca: [
      { projeto_id: "pr3", empresa_id: "e1", visto_em: new Date(Date.now() - 30000).toISOString(), detalhe: "No 3D Livre · Lounge" },
      { projeto_id: "pr1", empresa_id: "e1", visto_em: new Date(Date.now() - 10 * 60000).toISOString(), detalhe: "No catálogo" } ],
    empresas: [{ id: "e1", nome: "Chiavari", logo_url: "https://fixture/logo.png" }],
    clientes_empresas: [{ id: "c1", empresa_id: "e1", nome_razao: "Lis Baêtas", catalogo_logo_url: "https://fixture/lis.png" }]
  };
  function consulta(tabela){
    let linhas = (banco[tabela] || []).slice(), unico = false;
    const q = {
      select(){ return q; }, order(){ return q; }, limit(){ return q; }, range(){ return q; }, gte(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) >= String(v)); return q; }, lte(){ return q; },
      neq(){ return q; }, or(){ return q; }, ilike(){ return q; },
      not(c, op, v){ if(op === "is" && v === null) linhas = linhas.filter((l) => l[c] !== null && l[c] !== undefined); return q; },
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
  page.on("pageerror", (e) => { if (!/lucide is not defined/.test(e.message)) erros.push(e.message); });
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); sessionStorage.setItem("usuario_nome", "Teste"); });
  await page.route("**/*", (rota) => {
    const url = rota.request().url();
    if (url.startsWith("https://fixture/")) return rota.fulfill({ contentType: "image/png", body: PNG });
    if (url.includes("supabase-js")) return rota.fulfill({ contentType: "text/javascript", body: mockSupabase });
    if (url.startsWith(BASE)) {
      const arquivo = path.join(raiz, decodeURIComponent(new URL(url).pathname));
      if (!fs.existsSync(arquivo)) return rota.fulfill({ status: 404, body: "" });
      const tipo = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png" }[path.extname(arquivo)] || "application/octet-stream";
      return rota.fulfill({ contentType: tipo, body: fs.readFileSync(arquivo) });
    }
    return rota.abort();
  });
  await page.goto(BASE + "Modulos/Comercial/Pedidos/CentralPedidos.html");
  const linha = page.locator('[data-pedido-id="projeto:pr1"]');
  await linha.waitFor({ timeout: 15000 });
  const r = await linha.evaluate((tr) => ({
    selo: tr.querySelector(".pedido-selo-catalogo")?.textContent, cliente: tr.cells[1].innerText.trim(), evento: tr.cells[3].innerText.trim(),
    status: tr.querySelector(".status-pill")?.textContent, valor: tr.querySelector(".central-finance-value")?.textContent,
    acoes: [...tr.querySelectorAll("[data-action]")].map((b) => b.dataset.action).filter((a) => !a.startsWith("abrir-")),
  }));
  assert.strictEqual(r.selo, "Veio do catálogo");
  assert.strictEqual(r.cliente, "Lis Baêtas", "decorador como cliente");
  assert.strictEqual(r.evento, "Ana e Bruno");
  assert.strictEqual(r.status, "Pedido enviado");
  assert.ok(r.valor.includes("800,00"), "2×300 + 1×200: " + r.valor);
  assert.deepStrictEqual(r.acoes, ["visualizar", "whatsapp"], "sem contrato nem PIX");
  assert.strictEqual(await page.locator('[data-pedido-id="projeto:pr2"]').count(), 0, "projeto da equipe não entra");
  assert.strictEqual(await page.locator('[data-pedido-id="p1"] .pedido-numero-card').textContent(), "003", "pedidos de sempre continuam");
  const pres = await page.evaluate(() => ({
    primeira: document.querySelector("#centralPedidosTbody tr[data-pedido-id]")?.dataset.pedidoId,
    ativa: document.querySelector('[data-pedido-id="projeto:pr3"] .pedido-presenca.is-ativa')?.textContent,
    linhaVerde: document.querySelector('[data-pedido-id="projeto:pr3"]')?.classList.contains("is-montando"),
    vista: document.querySelector('[data-pedido-id="projeto:pr1"] .pedido-presenca')?.textContent,
  }));
  assert.strictEqual(pres.primeira, "projeto:pr3", "quem está montando sobe pro topo");
  assert.strictEqual(pres.ativa, "Montando agora · No 3D Livre · Lounge");
  assert.ok(pres.linhaVerde);
  assert.strictEqual(pres.vista, "Visto há 10 min");
  console.log("ok 0 - presença: montando agora (no topo, com onde está) e visto há 10 min");
  console.log("ok 1 - projeto do decorador aparece com selo, status, valor e sem contrato/PIX; o da equipe não");

  await linha.locator('[data-action="visualizar"]').click();
  const dialogo = page.locator("dialog.cpj-order-preview[open]");
  await dialogo.waitFor({ timeout: 10000 });
  const d = await dialogo.evaluate((x) => ({ titulo: x.querySelector("header h3")?.textContent, solicitante: x.querySelector(".cpj-order-requester strong")?.textContent,
    ambientes: [...x.querySelectorAll(".cpj-order-environment th")].map((t) => t.textContent) }));
  assert.ok(d.titulo.includes("Ana e Bruno"), d.titulo);
  assert.strictEqual(d.solicitante, "Lis Baêtas");
  assert.deepStrictEqual(d.ambientes, ["Lounge"]);
  await dialogo.locator("[data-pedido-fechar]").click();
  await page.waitForFunction(() => !document.querySelector("dialog.cpj-order-preview"));
  console.log("ok 2 - Visualizar abre a prévia do projeto");

  await page.click("#btnFiltrosPedidos");
  await page.selectOption("#filtroStatusPedido", "catalogo_pedido_enviado");
  assert.strictEqual(await page.locator("#centralPedidosTbody tr[data-pedido-id]").count(), 1, "filtro por status do catálogo");
  await page.screenshot({ path: process.env.PRINT || require("os").tmpdir() + "/central-presenca.png" });
  console.log("ok 3 - filtro de status do catálogo");
  assert.deepStrictEqual(erros, [], erros.join("\n"));
  // Duplo clique abre o projeto na tela do pedido, igual a um pedido feito pelo sistema (out/2026).
  await Promise.all([page.waitForURL(/pedido\.html\?projeto=/), page.locator("#centralPedidosTbody tr[data-pedido-id]").first().locator("td").nth(3).dblclick()]);
  console.log("ok 4 - duplo clique abre o projeto na tela do pedido");
  await browser.close();
  console.log("todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });
