// Out/2026 — projeto que o decorador montou no catálogo abre na tela do pedido (pedido.html?projeto=<id>) já
// preenchido; salvar cria o pedido (orçamento, ligado ao projeto) e marca o projeto como "convertido".
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const raiz = path.resolve(__dirname, "..");
const BASE = "http://acervo.teste/";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64");

const mockSupabase = `
(() => {
  window.__gravados = []; window.__rpcs = [];
  const banco = {
    projetos: [{ id: "pj1", empresa_id: "e1", cliente_id: "c1", noivos: "Ana e Bruno", data_evento: "2026-11-20",
      local_evento: "Villa Teste", status: "pedido_enviado",
      dados: { evento: { tipo: "Casamento", data_entrega: "2026-11-19", hora_entrega: "09:00", data_coleta: "2026-11-21",
        obs_entrega: "Portão lateral" },
        ambientes: [
          { id: "a1", nome: "Lounge", itens: [{ item_id: "i1", quantidade: 2 }], renders: [], notas: "" },
          { id: "a2", nome: "Bar", itens: [{ item_id: "i1", quantidade: 1 }, { item_id: "i2", quantidade: 3 }], renders: [], notas: "" } ] } }],
    clientes_empresas: [{ id: "c1", empresa_id: "e1", nome_razao: "Lis Baêtas", telefone: "11999990000" }],
    itens: [
      { id: "i1", empresa_id: "e1", codigo: "SOF1", produto: "Sofá Berlim", descricao_total: "Sofá Berlim", valor_locacao: 300, valor_reposicao: 5000 },
      { id: "i2", empresa_id: "e1", codigo: "BAR1", produto: "Bar Bistrol", descricao_total: "Bar Bistrol", valor_locacao: 200, valor_reposicao: 3000 } ],
    separacoes_pedidos: [], separacoes_itens: []
  };
  function consulta(tabela){
    let linhas = (banco[tabela] || []).slice(), unico = false;
    const q = {
      select(){ return q; }, order(){ return q; }, limit(){ return q; }, range(){ return q; }, gte(){ return q; }, lte(){ return q; },
      neq(){ return q; }, or(){ return q; }, ilike(){ return q; }, not(){ return q; }, is(){ return q; }, gt(){ return q; }, lt(){ return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      in(c, vs){ linhas = linhas.filter((l) => vs.map(String).includes(String(l[c]))); return q; },
      single(){ unico = true; return q; }, maybeSingle(){ unico = true; return q; },
      insert(p){ window.__gravados.push({ tabela, tipo: "insert", p }); linhas = [{ id: "novo-" + tabela, ...(Array.isArray(p) ? p[0] : p) }]; return q; },
      update(p){ window.__gravados.push({ tabela, tipo: "update", p }); return q; }, upsert(){ return q; }, delete(){ return q; },
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
    rpc: (nome, args) => { window.__rpcs.push({ nome, args }); return { then: (ok, erro) => Promise.resolve(nome === "funcionario_contexto"
      ? { data: { ativo: true, administrador_legado: true }, error: null } : { data: [], error: null }).then(ok, erro) }; },
    channel: () => canal, removeChannel(){},
    functions: { invoke: async () => ({ data: null, error: null }) },
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

  await page.goto(BASE + "Modulos/Comercial/Pedidos/pedido.html?projeto=pj1&modo=editar");
  await page.waitForFunction(() => document.getElementById("clienteInput")?.value === "Lis Baêtas", null, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll("tr.item-row[data-item-id]").length === 2, null, { timeout: 10000 });
  const tela = await page.evaluate(() => ({
    intro: document.querySelector(".entrada-intro")?.hidden,
    cliente: document.getElementById("clienteIdHidden").value,
    evento: document.getElementById("dataEvento").value,
    entrega: document.getElementById("dataEntrega").value,
    hora: document.getElementById("horaEntrega").value,
    coleta: document.getElementById("dataColeta").value,
    local: document.getElementById("localInput").value,
    obs: document.getElementById("observacoesEntrega").value,
    linhas: [...document.querySelectorAll("tr.item-row[data-item-id]")].map((tr) => [tr.dataset.itemId, tr.querySelector(".qtd").innerText]),
    projeto: window.__pedidoProjetoComercial?.dados?.ambientes?.map((a) => a.nome)
  }));
  console.log(tela);
  assert.strictEqual(tela.intro, true, "pula a tela de abertura");
  assert.strictEqual(tela.cliente, "c1");
  assert.strictEqual(tela.evento, "2026-11-20");
  assert.strictEqual(tela.entrega, "2026-11-19");
  assert.strictEqual(tela.hora, "09:00");
  assert.strictEqual(tela.coleta, "2026-11-21");
  assert.strictEqual(tela.local, "Villa Teste");
  assert.strictEqual(tela.obs, "Portão lateral");
  assert.deepStrictEqual(tela.linhas.sort(), [["i1", "3"], ["i2", "3"]], "mesma peça em 2 ambientes vira uma linha com a soma");
  assert.deepStrictEqual(tela.projeto, ["Lounge", "Bar"], "ambientes vão para o catálogo do pedido");

  await page.evaluate(() => window.__salvarPedidoOperacional());
  await page.waitForFunction(() => window.__rpcs.some((r) => r.nome === "projeto_atualizar_status"), null, { timeout: 10000 });
  const salvo = await page.evaluate(() => ({
    insert: window.__gravados.find((g) => g.tabela === "separacoes_pedidos" && g.tipo === "insert")?.p,
    rpc: window.__rpcs.find((r) => r.nome === "projeto_atualizar_status")?.args, url: location.search
  }));
  assert.strictEqual(salvo.insert.observacoes.projeto_catalogo_id, "pj1", "pedido fica ligado ao projeto");
  assert.strictEqual(salvo.insert.status_comercial, "orcamento", "entra como orçamento, sem reservar");
  assert.deepStrictEqual(salvo.insert.observacoes.projeto_comercial.dados.ambientes.map((a) => a.nome), ["Lounge", "Bar"]);
  assert.deepStrictEqual(salvo.rpc, { p_empresa_id: "e1", p_id: "pj1", p_status: "convertido" });
  assert.ok(/pedido=novo-separacoes_pedidos/.test(salvo.url), "endereço passa a ser o do pedido");
  assert.deepStrictEqual(erros, [], erros.join("\n"));
  console.log("OK — projeto do catálogo abre e salva como pedido");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
