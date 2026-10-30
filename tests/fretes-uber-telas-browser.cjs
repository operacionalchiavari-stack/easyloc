// Out/2026 — telas internas de Fretes e Uber com o banco simulado: Conciliação de Fretes (valor final, seleção e
// fechamento), Controle de Uber (conferir e fechar), bloco Uber no Painel Logístico e faixas em Parâmetros.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const mock = `(() => {
  window.__rpc = [];
  const viagens = [
    { id: "v1", pedido_id: "p1", pedido: "1", cliente: "Lis", caminhao: "G", categoria: "G", fornecedor_id: "f1", fornecedor: "Transp A", direcao: "entrega", data: "2026-10-30", origem: "Galpão", destino: "Villa", km: 33.7, extra: false, fora_escala: false, valor_sistema: 505.5, valor_transportadora: 490, transp_obs: null, valor_final: null, obs: null, status: "aberto" },
    { id: "v2", pedido_id: "p1", pedido: "1", cliente: "Lis", caminhao: "G", categoria: "G", fornecedor_id: "f1", fornecedor: "Transp A", direcao: "coleta", data: "2026-11-03", origem: "Villa", destino: "Galpão", km: 33.7, extra: false, fora_escala: false, valor_sistema: 505.5, valor_transportadora: null, valor_final: null, status: "aberto" },
    { id: "v3", pedido_id: "p2", pedido: "2", cliente: "Ana", caminhao: "M", categoria: "M", fornecedor_id: "f2", fornecedor: "Transp B", direcao: "entrega", data: "2026-11-01", km: 10, extra: false, valor_sistema: 110, valor_transportadora: 120, valor_final: null, status: "aberto" }];
  const corridas = [
    { id: "c1", status: "concluida", valor: 80, valor_final: null, conferido_em: null, fechamento_id: null, checkin_em: "2026-10-30T10:00:00Z", checkout_em: "2026-10-30T18:00:00Z", motorista_id: "m1", motorista: "João Silva", telefone: "24999990001", pix: "joao@pix", carro: "Onix · ABC1D23", data: "2026-10-30", hora: "07:00", ponto_encontro: "Galpão", destino: "Villa", km: 15, ida_volta: true, etapa: "Montagem", pedido_id: "p1", pedido: "1", cliente: "Lis" },
    { id: "c2", status: "em_andamento", valor: 80, motorista_id: "m1", motorista: "João Silva", telefone: "24999990001", data: "2026-10-31", ponto_encontro: "Galpão", destino: "Villa", km: 15, checkin_em: "2026-10-31T10:00:00Z" }];
  const vagas = [{ id: "u1", etapa_id: "e1", quantidade: 2, ida_volta: true, ponto_encontro: "Galpão Chiavari", destino: "Villa Real", km: 15, valor: 80, hora: "07:00", confirmadas: 1, corridas: [{ id: "c1", status: "confirmada", motorista: "João Silva", telefone: "24999990001", carro: "Onix · ABC1D23" }] }];
  window.__fr = { freteiros: [{ id: "fr1", nome: "Pedro Frete", telefone: "24999990002", pix: "p@pix", veiculo_modelo: "Iveco Daily", veiculo_tipo: "baú", veiculo_placa: "ABC1D23", capacidade_m3: 20, status: "pendente", created_at: "2026-10-29T10:00:00Z", fretes: 0 }],
    anuncios: [{ id: "a1", status_anuncio: "aberto", direcao: "entrega", pedido: "5", cliente: "Kelly", destino: "Vale dos Desejos", km: 33.7, m3: 2.6, valor: 202.2, data: "2026-10-30", hora: "08:00" }] };
  const r = (data) => Promise.resolve({ data, error: null });
  const rpc = (n, a) => {
    window.__rpc.push({ n, a });
    if (n === "frete_conciliacao") return r({ viagens, fechamentos: [], sem_fornecedor: 1 });
    if (n === "frete_definir_final") { const v = viagens.find((x) => x.id === a.p_viagem); v.valor_final = a.p_valor; v.obs = a.p_obs; return r(v); }
    if (n === "frete_fechar") { a.p_viagens.forEach((id) => { viagens.find((x) => x.id === id).status = "fechado"; }); return r({ documento: "FR-0001", total: 980 }); }
    if (n === "uber_controle") return r({ corridas, fechamentos: [] });
    if (n === "uber_conferir") { const c = corridas.find((x) => x.id === a.p_corrida); c.valor_final = a.p_valor; c.conferido_em = "2026-10-30T20:00:00Z"; return r(null); }
    if (n === "uber_fechar") { a.p_corridas.forEach((id) => { corridas.find((x) => x.id === id).fechamento_id = "fx"; }); return r({ documento: "UB-0001", total: 80 }); }
    if (n === "uber_painel") return r({ vagas, faixas: [{ de: 0, ate: 20, valor: 40 }, { de: 20, ate: null, valor: 70 }] });
    if (n === "uber_vaga_salvar") return r({});
    if (n === "uber_faixas_salvar") return r({ faixas: a.p_faixas.map((f) => ({ de: Number(f.de), ate: f.ate === "" ? null : Number(f.ate), valor: Number(f.valor) })) });
    if (n === "frete_adm_lista" || n === "frete_freteiro_status") { if (n === "frete_freteiro_status") window.__fr.freteiros[0].status = a.p_status; return r(window.__fr); }
    return r(null);
  };
  const consulta = () => { const q = { select(){return q}, eq(){return q}, order(){return q}, maybeSingle(){return q}, then(ok){ return Promise.resolve({ data: { uber: { faixas: [{ de: 0, ate: 10, valor: 30 }] } }, error: null }).then(ok); } }; return q; };
  const cliente = { auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }), getUser: async () => ({ data: { user: { id: "u1" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: consulta, rpc, functions: { invoke: async (n, o) => { (window.__invoke = window.__invoke || []).push(o.body); return { data: { km: 18.4 }, error: null }; } } };
    // Google Places simulado: sugestões do ponto de encontro e coordenadas pelo placeId
    window.google = { maps: { places: {
      AutocompleteService: class { getPlacePredictions(q, cb) { cb([{ description: "Galpão Chiavari, Itaipava - RJ", place_id: "p1", structured_formatting: { main_text: "Galpão Chiavari", secondary_text: "Itaipava - RJ" } }]); } },
      AutocompleteSessionToken: class {} },
      Geocoder: class { geocode(q, cb) { cb([{ geometry: { location: { lat: () => -22.41, lng: () => -43.13 } } }], "OK"); } } } };
  window.supabase = { createClient: () => cliente };
  window.__CONTEXT = { empresa_id: "e1", usuario_id: "u1", usuario_nome: "Igor" };
  window.aguardarContexto = async () => window.__CONTEXT;
  window.confirmarGlobal = async () => true;
  window.EasyLocPermissions = { load: async () => {}, hasPermission: () => true, canNavigate: () => true, applyVisibility(){}, guardPage(){} };
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide/.test(e.message)) erros.push(e.message); });
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); });
  await page.route("**/*", (rt) => {
    const u = rt.request().url();
    if (u.includes("supabase-js")) return rt.fulfill({ contentType: "text/javascript", body: mock });
    if (/permissions\.js|context\.js|alerta\.js/.test(u)) return rt.fulfill({ contentType: "text/javascript", body: "" });
    if (u.startsWith(BASE)) {
      const f = path.join(raiz, decodeURIComponent(new URL(u).pathname));
      if (u.includes("teste-painel.html")) return rt.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/Modulos/Logistica/PainelLogistico/painel-logistico.css"></head><body><div id="plDias"><button class="pl-servico" data-selecionar="e1"><b class="pl-hora">07:00</b><span class="pl-local">Villa Real</span></button><article class="pl-etapa pl-painel" data-id="e1"><header>Montagem da equipe</header></article></div><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script src="/js/core/supabase.js"></script><script src="/Modulos/Logistica/PainelLogistico/painel-uber.js"></script></body></html>' });
      if (!fs.existsSync(f)) return rt.fulfill({ status: 404, body: "" });
      return rt.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" });
    }
    return rt.abort();
  });

  // ---------------- Conciliação de Fretes
  await page.goto(BASE + "Modulos/Chiavari/Fretes/conciliacao.html");
  await page.waitForSelector(".cf-grupo");
  assert.strictEqual(await page.locator(".cf-grupo").count(), 2, "um bloco por transportadora");
  const t1 = await page.locator(".cf-grupo").first().innerText();
  assert.ok(/Transp A/.test(t1) && /Entrega/.test(t1) && /Coleta/.test(t1) && /505,50/.test(t1) && /490,00/.test(t1), t1);
  assert.ok(/aguardando/.test(t1), "coleta sem valor da transportadora");
  assert.ok(!(await page.isHidden("#cfAvisoForn")), "aviso de caminhão sem fornecedor");
  console.log("ok 1 - viagens por transportadora, sistema x transportadora, entrega e coleta");
  await page.check('[data-sel="v1"]').catch(() => {});
  assert.ok(!(await page.isChecked('[data-sel="v1"]')), "sem valor final não seleciona");
  await page.click('[data-usar="transp"][data-id="v1"]');
  await page.waitForFunction(() => document.querySelector('[data-final="v1"]').value === "490");
  await page.fill('[data-final="v2"]', "490"); await page.press('[data-final="v2"]', "Enter");
  await page.waitForFunction(() => window.__rpc.filter((x) => x.n === "frete_definir_final").length === 2);
  await page.check('[data-sel-todos="f1"]');
  await page.waitForFunction(() => /2<\/b> selecionada/.test(document.querySelector('.cf-grupo .cf-rodape').innerHTML));
  assert.ok(/980,00/.test(await page.locator(".cf-grupo .cf-rodape").first().innerText()), "total final");
  await page.click('[data-fechar="f1"]');
  await page.waitForFunction(() => window.__rpc.some((x) => x.n === "frete_fechar"));
  const fech = await page.evaluate(() => window.__rpc.find((x) => x.n === "frete_fechar").a);
  assert.deepStrictEqual(fech.p_viagens.sort(), ["v1", "v2"]);
  assert.ok(fech.p_vencimento, "com vencimento");
  console.log("ok 2 - valor final (= transportadora e Enter), selecionar a transportadora e fechar → Contas a Pagar");

  // ---------------- Controle de Uber
  await page.goto(BASE + "Modulos/Chiavari/Uber/corridas.html");
  await page.waitForSelector(".cf-grupo");
  const tu = await page.locator(".cf-grupo").innerText();
  assert.ok(/João Silva/.test(tu) && /joao@pix/.test(tu) && /Em andamento/.test(tu) && /A conferir/.test(tu), tu);
  assert.strictEqual(await page.locator('[data-sel="c2"]').count(), 0, "corrida em andamento não seleciona");
  await page.click('[data-usar="c1"]');
  await page.waitForFunction(() => window.__rpc.some((x) => x.n === "uber_conferir"));
  await page.waitForSelector('[data-sel="c1"]');
  await page.check('[data-sel="c1"]');
  await page.click('[data-fechar="m1"]');
  await page.waitForFunction(() => window.__rpc.some((x) => x.n === "uber_fechar"));
  console.log("ok 3 - Controle de Uber: em andamento só acompanha; conferir e fechar o motorista");

  // ---------------- Painel Logístico: bloco Uber
  await page.goto(BASE + "teste-painel.html");
  await page.waitForSelector(".pl-uber");
  const tp = await page.locator(".pl-uber").innerText();
  assert.ok(/Uber/.test(tp) && /1\/2/.test(tp) && /João Silva/.test(tp) && /Aguardando motorista/.test(tp) && /80,00 por carro/.test(tp), tp);
  await page.click("[data-uber-novo]");
  await page.waitForSelector("#plUberDialog[open]");
  assert.strictEqual(await page.inputValue("#plUberDialog [name=destino]"), "Villa Real", "destino = local da etapa");
  // autocomplete do Google: digita, escolhe na lista (dentro da janela) e o km sai sozinho
  await page.locator("#plUberDialog [name=ponto_encontro]").pressSequentially("Galp");
  await page.waitForSelector("#plUberSugestoes:not([hidden]) li");
  assert.match(await page.locator("#plUberSugestoes li").first().innerText(), /Galpão Chiavari/);
  await page.locator("#plUberSugestoes li").first().dispatchEvent("mousedown");
  await page.waitForFunction(() => document.querySelector("#plUberDialog [name=km]").value === "18.4");
  assert.strictEqual(await page.inputValue("#plUberDialog [name=ponto_encontro]"), "Galpão Chiavari, Itaipava - RJ");
  const corpo = await page.evaluate(() => window.__invoke.at(-1));
  assert.strictEqual(corpo.origem, "-22.41,-43.13", "km calculado pelas coordenadas do endereço escolhido");
  assert.match(await page.locator("[data-uber-km-status]").innerText(), /pode alterar/);
  await page.fill("#plUberDialog [name=km]", "20");
  assert.match(await page.locator("[data-uber-km-status]").innerText(), /alterado à mão/);
  await page.fill("#plUberDialog [name=km]", "18.4");
  await page.selectOption("#plUberDialog [name=ida_volta]", "true");
  assert.ok(/80,00/.test(await page.locator("[data-uber-valor]").innerText()), "valor pela faixa × 2 trechos");
  await page.click('#plUberDialog button[type=submit]');
  await page.waitForFunction(() => window.__rpc.some((x) => x.n === "uber_vaga_salvar"));
  const sv = await page.evaluate(() => window.__rpc.find((x) => x.n === "uber_vaga_salvar").a.p_dados);
  assert.ok(sv.etapa_id === "e1" && sv.ida_volta === true && sv.km === "18.4" && sv.ponto_lat === "-22.41" && sv.ponto_lng === "-43.13", JSON.stringify(sv));
  console.log("ok 4 - Painel: bloco Uber; ponto de encontro pelo autocomplete do Google, km automático e editável, valor da faixa");

  await page.goto(BASE + "Modulos/Chiavari/Fretes/freteiros.html");
  await page.waitForSelector("[data-aprovar=fr1]");
  assert.strictEqual((await page.textContent("#frPendentes")).trim(), "1");
  await page.click("[data-aprovar=fr1]");
  await page.waitForFunction(() => window.__rpc.some((x) => x.n === "frete_freteiro_status" && x.a.p_status === "aprovado"));
  await page.waitForSelector("[data-bloquear=fr1]");
  await page.click("[data-aba=fretes]");
  const tx = await page.innerText("#frConteudo");
  assert.ok(/202,20/.test(tx) && /Aguardando um freteiro/.test(tx) && /67,4 km ida e volta/.test(tx), tx);
  console.log("ok 5 - Freteiros: aprovar o cadastro; fretes anunciados com o valor total");

  assert.deepStrictEqual(erros, []);
  console.log("todos os testes passaram");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
