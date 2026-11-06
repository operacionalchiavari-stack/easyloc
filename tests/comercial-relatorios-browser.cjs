// Out/2026 — Comercial: relatório de Cancelamentos (motivo, decorador, cidade, distância, mês) e Contas a receber
// só leitura (por cliente, por pedido, por data; quando foi recebido e se foi no prazo).
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const H = new Date().toLocaleDateString("sv-SE");
const ANO = H.slice(0, 4);
const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };
const mock = `(() => {
  const H = "${H}", A = "${ANO}";
  const canc = (motivo, obs, data, usuario) => ({ motivo, observacao: obs, data: data + "T15:00:00Z", usuario });
  const banco = {
    separacoes_pedidos: [
      { id: "p1", empresa_id: "e1", numero_pedido: "10", cliente_id: "c1", cliente_nome: "Lis Decor", equipe_nome: "Equipe Rosa", tipo_evento: "Casamento", data_evento: "${dia(40)}", valor_total: 5000, status_comercial: "cancelado", local_id: "l1", local_nome: "Villa Bisutti", criado_em: A + "-02-01T10:00:00Z", atualizado_em: H, cancelamento: canc("Concorrência mais barata", "Fechou com outro", "${dia(-3)}", "Carol") },
      { id: "p2", empresa_id: "e1", numero_pedido: "11", cliente_id: "c1", cliente_nome: "Lis Decor", tipo_evento: "Festa", data_evento: "${dia(20)}", valor_total: 3000, status_comercial: "cancelado", local_id: "l2", local_nome: "Sítio", criado_em: A + "-02-02T10:00:00Z", atualizado_em: H, cancelamento: canc("Concorrência mais barata", "", "${dia(-2)}", "Carol") },
      { id: "p3", empresa_id: "e1", numero_pedido: "12", cliente_id: "c2", cliente_nome: "Ana Eventos", equipe_nome: "Equipe Rosa", tipo_evento: "Formatura", data_evento: "${dia(10)}", valor_total: 2000, status_comercial: "cancelado", local_id: "l1", local_nome: "Villa Bisutti", criado_em: A + "-02-03T10:00:00Z", atualizado_em: H, cancelamento: canc("Evento remarcado", "Mudou para 2027", "${dia(-1)}", "Jonatan") },
      { id: "p4", empresa_id: "e1", numero_pedido: "13", cliente_id: "c1", cliente_nome: "Lis Decor", tipo_evento: "Casamento", data_evento: "${dia(5)}", valor_total: 9000, status_comercial: "aprovado", local_id: "l1", local_nome: "Villa Bisutti", criado_em: A + "-02-04T10:00:00Z", atualizado_em: H, cancelamento: null }],
    locais_empresas: [
      { id: "l1", empresa_id: "e1", endereco: "Estr. Teresópolis, 1000 - Itaipava, Petrópolis - RJ, 25730-000, Brasil", distancia_galpao_km: 12 },
      { id: "l2", empresa_id: "e1", endereco: "Rua das Flores, 50 - Centro, Teresópolis - RJ, 25953-000, Brasil", distancia_galpao_km: 64 }]
  };
  const receber = [
    { id: "t1", pedido_id: "p4", numero_pedido: "13", cliente_id: "c1", cliente_nome: "Lis Decor", tipo_evento: "Casamento", data_evento: "${dia(5)}", local_nome: "Villa Bisutti", componente: "locacao", parcela: 1, parcelas: 2, vencimento: "${dia(-10)}", valor: 4000, recebido: 4000, aberto: 0, status: "recebido", recebido_em: "${dia(-7)}" },
    { id: "t2", pedido_id: "p4", numero_pedido: "13", cliente_id: "c1", cliente_nome: "Lis Decor", tipo_evento: "Casamento", data_evento: "${dia(5)}", local_nome: "Villa Bisutti", componente: "locacao", parcela: 2, parcelas: 2, vencimento: "${dia(-2)}", valor: 4000, recebido: 0, aberto: 4000, status: "aberto", recebido_em: null },
    { id: "t3", pedido_id: "p4", numero_pedido: "13", cliente_id: "c1", cliente_nome: "Lis Decor", tipo_evento: "Casamento", data_evento: "${dia(5)}", local_nome: "Villa Bisutti", componente: "frete", parcela: 1, parcelas: 1, vencimento: H, valor: 1000, recebido: 0, aberto: 1000, status: "aberto", recebido_em: null },
    { id: "t4", pedido_id: "p9", numero_pedido: "20", cliente_id: "c2", cliente_nome: "Ana Eventos", equipe_id: "eq1", equipe_nome: "Equipe Rosa", tipo_evento: "Festa", data_evento: "${dia(30)}", local_nome: "Sítio", componente: "locacao", parcela: 1, parcelas: 1, vencimento: "${dia(5)}", valor: 2500, recebido: 0, aberto: 2500, status: "aberto", recebido_em: null }];
  function consulta(t){
    let linhas = (banco[t] || []).slice(), unico = false;
    const q = { select(){ return q; }, order(){ return q; }, limit(){ return q; }, range(){ return q; }, not(){ return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      in(c, vs){ linhas = linhas.filter((l) => vs.map(String).includes(String(l[c]))); return q; },
      single(){ unico = true; return q; }, maybeSingle(){ unico = true; return q; },
      then(ok, erro){ return Promise.resolve({ data: unico ? (linhas[0] || null) : linhas, error: null }).then(ok, erro); } };
    return q;
  }
  const respostas = { funcionario_contexto: () => ({ ativo: true, administrador_legado: true }), comercial_contas_receber: () => receber };
  const cliente = {
    auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }), getUser: async () => ({ data: { user: { id: "u1" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: consulta, functions: { invoke: async () => ({ data: null, error: null }) },
    rpc: (n, a) => ({ then: (ok, erro) => Promise.resolve({ data: respostas[n] ? respostas[n](a) : null, error: null }).then(ok, erro) })
  };
  window.supabase = { createClient: () => cliente };
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide/.test(e.message)) erros.push(e.message); });
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); });
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("supabase-js")) return r.fulfill({ contentType: "text/javascript", body: mock });
    if (u.includes("xlsx")) return r.continue();
    if (u.startsWith(BASE)) {
      const f = path.join(raiz, decodeURIComponent(new URL(u).pathname).replace(/\?.*$/, ""));
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
      return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" });
    }
    return r.abort();
  });

  // ---------------- Cancelamentos
  await page.goto(BASE + "Modulos/Comercial/Cancelamentos/cancelamentos.html");
  await page.waitForSelector(".cr-bloco");
  const txt = await page.textContent("#cConteudo");
  assert.match(txt, /Pedidos cancelados3/); assert.match(txt, /Concorrência mais barata \(2\)/); assert.match(txt, /Lis Decor \(2\)/); assert.match(txt, /Petrópolis\/RJ \(2\)/);
  const blocos = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".cr-bloco")].map((b) => [b.querySelector("h3").firstChild.textContent.trim(), b.textContent.replace(/\s+/g, " ")])));
  assert.match(blocos["Por decorador"], /Lis Decor2366,7%/, "2 cancelados de 3 pedidos criados");
  assert.match(blocos["Por distância do galpão"], /Até 20 km2/); assert.match(blocos["Por distância do galpão"], /De 50 a 100 km1/);
  assert.match(blocos["Por cidade"], /Itaipava/);
  assert.match(blocos["Por equipe"], /Equipe Rosa2/, "Lis e Ana na mesma equipe somam 2 cancelados");
  assert.match(blocos["Por equipe"], /Sem equipe1/);
  // clicar num motivo filtra a lista
  await page.click('tr[data-filtro="motivo"][data-valor="Evento remarcado"]');
  await page.waitForSelector(".cr-filtro-ativo");
  const lista = await page.evaluate(() => [...document.querySelectorAll("#cLista tbody tr")].map((tr) => tr.textContent.replace(/\s+/g, " ")));
  assert.equal(lista.length, 1); assert.match(lista[0], /12/); assert.match(lista[0], /Mudou para 2027/); assert.match(lista[0], /Jonatan/);
  await page.click("[data-tirar-foco]");
  await page.selectOption("#cDecorador", "Ana Eventos");
  await page.waitForFunction(() => /Pedidos cancelados1/.test(document.getElementById("cConteudo").textContent));
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#cExcel")]);
  assert.match(dl.suggestedFilename(), /Cancelamentos\.xlsx$/);
  console.log("ok 1 - cancelamentos: resumo, por motivo, decorador (taxa), cidade, distância, filtro e Excel");

  // Contas a receber saiu da Central (voltou a ter tela própria em Comercial > Contas a receber): coberto por tests/comercial-contas-receber-browser.cjs
  if (process.env.SP) {
    await page.click("[data-central-visao=receber]"); await page.click('[data-modo="cliente"]'); await page.click('[data-prazo="abertos"]');
    await page.screenshot({ path: process.env.SP + "/cr-receber.png", fullPage: true });
    await page.goto(BASE + "Modulos/Comercial/Cancelamentos/cancelamentos.html"); await page.waitForSelector(".cr-bloco");
    await page.screenshot({ path: process.env.SP + "/cr-canc.png", fullPage: true });
  }
  assert.deepStrictEqual(erros, []);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
