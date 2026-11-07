// Out/2026 — Conferência do descarregamento: com quantidade ou às cegas, conforme Parâmetros > Operação (empresa_logistica_regras.descarregamento_conferencia).
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const mock = `(() => {
  window.__inseridas = [];
  const banco = {
    separacoes_pedidos: [{ id: "p1", empresa_id: "e1", numero_pedido: "2279", cliente_nome: "Feira Casa & Estilo", local_nome: "Casa de Festa", data_entrega: "2026-10-18", status: "separado", operacao: { carregamento: { concluido_em: "2026-10-18T10:00:00Z", itens: [{ chave: "s1|i1", conferido: 2 }, { chave: "s2|c1", conferido: 1 }, { chave: "s2|c2", conferido: 2 }] } } }],
    separacoes_itens: [
      { id: "s1", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i1", item_nome: "Cadeira Tiffany", quantidade_solicitada: 2, itens: { id: "i1", produto: "Cadeira Tiffany", tipo: "Item" } },
      { id: "s2", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "k1", item_nome: "Mesa Bistrô (kit)", quantidade_solicitada: 1, itens: { id: "k1", produto: "Mesa Bistrô", tipo: "Kit" } }],
    kit_itens: [
      { empresa_id: "e1", kit_id: "k1", item_id: "c1", quantidade: 1, itens: { id: "c1", produto: "Tampo" } },
      { empresa_id: "e1", kit_id: "k1", item_id: "c2", quantidade: 2, itens: { id: "c2", produto: "Pé" } }],
    separacoes_etiquetas: [],
    itens: [{ id: "i1", empresa_id: "e1", produto: "Cadeira Tiffany" }],
    operacao_ocorrencias: [
      { id: "o1", codigo: "descarregamento:s1|i1", empresa_id: "e1", pedido_id: "p1", tipo: "falta", etapa: "descarregamento", quantidade: 1, esperado: 2, conferido: 1, descricao: "Peça não descarregada: Cadeira Tiffany (1)", resolvida_em: null, criado_em: "2026-10-28T10:00:00Z" },
      { id: "o2", codigo: "descarregamento:s2|c2", empresa_id: "e1", pedido_id: "p1", tipo: "sobra", etapa: "descarregamento", quantidade: 1, esperado: 2, conferido: 3, descricao: "Veio a mais: Pé (1)", resolvida_em: null, criado_em: "2026-10-28T10:00:01Z" },
      { id: "o3", codigo: "s1|i1", empresa_id: "e1", pedido_id: "p1", tipo: "falta", etapa: "retorno", quantidade: 1, descricao: "Peça não devolvida: Outra (1)", resolvida_em: null, criado_em: "2026-10-28T10:00:02Z" }],
    empresa_logistica_regras: [{ empresa_id: "e1", descarregamento_conferencia: window.__REGRA || "quantidade" }],
    logistica_motivos: [{ id: "mf", empresa_id: "e1", etapa: "divergencia_falta", nome: "Peça encontrada no galpão", situacao: "bateu", ativo: true },
      { id: "mf2", empresa_id: "e1", etapa: "divergencia_falta", nome: "Peça extraviada", situacao: "continua", ativo: true },
      { id: "ms", empresa_id: "e1", etapa: "divergencia_sobra", nome: "Peça de outro pedido", situacao: "continua", ativo: true },
      { id: "ms2", empresa_id: "e1", etapa: "divergencia_sobra", nome: "Erro de contagem", situacao: "bateu", ativo: true },{ id: "m1", empresa_id: "e1", etapa: "carregamento", nome: "Item não separado a tempo", ativo: true }]
  };
  function consulta(t){
    let linhas = (banco[t] || []).slice(), unico = false, novas = null;
    const q = {
      select(){ return q; }, order(){ return q; }, limit(){ return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      in(c, vs){ linhas = linhas.filter((l) => !(c in l) || vs.map(String).includes(String(l[c]))); return q; },
      maybeSingle(){ unico = true; return q; }, single(){ unico = true; return q; },
      insert(p){ novas = (Array.isArray(p) ? p : [p]).map((r, i) => ({ id: "n" + (banco[t].length + i), ...r })); banco[t].push(...novas); window.__inseridas.push(...novas); return q; },
      update(){ return q; },
      then(ok, erro){ return Promise.resolve({ data: novas || (unico ? (linhas[0] || null) : linhas), error: null }).then(ok, erro); }
    };
    return q;
  }
  const rpcOperacao = ${require("./operacao-rpc-fixture.cjs").toString()};
  const cliente = {
    auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }), getUser: async () => ({ data: { user: { id: "u1" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: consulta,
    rpc: (n, args) => { window.__rpc = window.__rpc || []; window.__rpc.push([n, args]);
      if (n === "operacao_fechar_divergencia") { const o = banco.operacao_ocorrencias.find((x) => x.id === args.p_id); o.resolvida_em = "2026-10-28T11:00:00Z"; o.segunda_contagem = args.p_contagem; o.motivo_id = args.p_motivo_id; o.resolvido_por = "u1"; o.resolvido_por_nome = "Ana Souza"; o.resolucao = "2ª conferência: " + args.p_contagem + " de 2 — Peça de outro pedido — teste@x"; return Promise.resolve({ data: { resolvida: true }, error: null }); }
      if (n === "operacao_conferencia_pecas") return Promise.resolve({ data: [
        { chave: "s1|i1", linha: "s1", item_id: "i1", nome: "Cadeira Tiffany", esperado: 2 },
        { chave: "s2|c1", linha: "s2", item_id: "c1", nome: "Tampo", esperado: 1 },
        { chave: "s2|c2", linha: "s2", item_id: "c2", nome: "Pé", esperado: 2 }], error: null });
      if (n === "operacao_concluir_conferencia") {
        const pecas = { "s1|i1": ["Cadeira Tiffany", 2], "s2|c1": ["Tampo", 1], "s2|c2": ["Pé", 2] };
        const itens = Object.entries(pecas).map(([k, [nome, esp]]) => ({ chave: k, item: nome, esperado: esp, conferido: args.p_quantidades[k], obs: (args.p_observacoes || {})[k] || null }));
        const faltando = itens.filter((x) => x.conferido < x.esperado);
        const r = { concluido_em: new Date().toISOString(), por: "Igor", total: 5, lidas: itens.reduce((t, x) => t + Math.min(x.conferido, x.esperado), 0), faltando, sem_etiquetas: true, itens };
        return Promise.resolve({ data: r, error: null }); }
      return rpcOperacao(banco, n, args); }
  };
  window.confirmarGlobal = async () => true;
  window.supabase = { createClient: () => cliente };
  window.__CONTEXT = { empresa_id: "e1", usuario_id: "u1", usuario_nome: "Igor", empresa_nome: "Chiavari" };
  window.aguardarContexto = async () => window.__CONTEXT;
})();`;


async function abrir(browser, regra){
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const erros = []; page.on("pageerror", (e) => { if (!/lucide|single is not a function/.test(e.message)) erros.push(e.message); });
  await page.addInitScript((r) => { window.__REGRA = r; sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); }, regra);
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("supabase-js")) return r.fulfill({ contentType: "text/javascript", body: mock });
    if (u.startsWith(BASE)) { const f = path.join(raiz, decodeURIComponent(new URL(u).pathname)); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
      return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" }); }
    return r.abort();
  });
  await page.goto(BASE + "Modulos/Logistica/Conferencia/conferencia.html?pedido=p1&etapa=descarregamento");
  await page.waitForSelector(".cf-qtd-input", { timeout: 15000 });
  const esperado = await page.$$eval(".cf-qtd-linha:not(.cf-qtd-cabeca)", (l) => l.map((x) => x.querySelector("strong + span").textContent));
  const contagem = await page.textContent("#cfContagem");
  return { page, esperado, contagem, erros };
}
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  let r = await abrir(browser, "quantidade");
  assert.deepStrictEqual(r.esperado, ["2", "2", "1"]); assert.match(r.contagem, /de 5/);
  console.log("ok 1 - descarregamento com quantidade mostra o esperado");
  r = await abrir(browser, "cegas");
  assert.deepStrictEqual(r.esperado, ["", "", ""], "às cegas não mostra o esperado"); assert.equal(r.contagem, "Conferência às cegas");
  for (const i of await r.page.$$(".cf-qtd-input")) await i.fill("1");
  assert.equal(await r.page.locator(".cf-qtd-linha.is-falta").count(), 0, "não pinta falta às cegas");
  console.log("ok 2 - descarregamento às cegas esconde o esperado e não pinta falta");
  const campos = await r.page.locator(".cf-qtd-input").all(); await campos[0].fill("1"); await campos[1].fill("3"); await campos[2].fill("1");
  await r.page.click("#cfQtdConfirmar");
  // Segunda contagem: só os itens que não bateram ficam para recontar (Cadeira e Pé); o Tampo fica travado.
  assert.match(await r.page.textContent("dialog.cf-confirmacao[open] h2"), /Segunda contagem/);
  await r.page.click("dialog.cf-confirmacao[open] button[type=submit]");
  const estado = await r.page.$$eval(".cf-qtd-linha:not(.cf-qtd-cabeca)", (l) => l.map((x) => [x.classList.contains("is-recontar") ? "recontar" : x.classList.contains("is-travada") ? "travada" : "-", x.querySelector(".cf-qtd-input").value]));
  assert.deepStrictEqual(estado, [["recontar", ""], ["recontar", ""], ["travada", "1"]]);
  assert.equal(await r.page.evaluate(() => (window.__rpc || []).filter((c) => c[0] === "operacao_concluir_conferencia").length), 0, "não conclui antes da segunda contagem");
  assert.equal(await r.page.textContent("#cfQtdConfirmar"), "Confirmar segunda contagem");
  const novos = await r.page.locator(".cf-qtd-input").all(); await novos[0].fill("1"); await novos[1].fill("3");
  await r.page.click("#cfQtdConfirmar");
  await r.page.click("dialog.cf-confirmacao[open] button[type=submit]");
  await r.page.waitForSelector(".cf-qtd-linha.is-div-falta");
  const chamada = await r.page.evaluate(() => window.__rpc.find((c) => c[0] === "operacao_concluir_conferencia")[1]);
  assert.deepStrictEqual(chamada.p_primeira, { "s1|i1": 1, "s2|c2": 3, "s2|c1": 1 }, "primeira contagem vai junto");
  const res = await r.page.$$eval(".cf-qtd-linha:not(.cf-qtd-cabeca)", (l) => l.map((x) => [x.querySelector("strong").textContent, x.className.includes("is-div-falta") ? "falta" : x.className.includes("is-div-sobra") ? "sobra" : "ok", getComputedStyle(x).backgroundColor]));
  assert.deepStrictEqual(res.map((x) => x.slice(0, 2)), [["Cadeira Tiffany", "falta"], ["Pé", "sobra"], ["Tampo", "ok"]]);
  assert.equal(res[0][2], "rgb(251, 236, 235)", "falta em vermelho"); assert.equal(res[1][2], "rgb(253, 246, 221)", "a mais em amarelo");
  assert.ok(await r.page.locator("#cfAviso").isHidden(), "sem a faixa de conferido/divergência");
  assert.match(await r.page.textContent(".cf-qtd-linha:nth-child(3) .cf-qtd-valor"), /1 a mais/);
  console.log("ok 3 - segunda contagem dos itens divergentes; ao concluir: faltou em vermelho, veio a mais em amarelo");
  // Out/2026: a Expedição vê que não bateu, mas não resolve: a divergência vai para a Gestão do acervo.
  // Nov/2026: a mensagem fica só no alerta global, nada na tela.
  assert.equal(await r.page.locator('#cfDivergencias .cf-div-enviada').count(), 0, 'sem mensagem na tela');
  assert.equal(await r.page.locator('.cf-qtd-tabela.com-resolver, .cf-div-segunda, .cf-div-salvar').count(), 0, 'sem colunas nem botão de resolver');
  // Nov/2026: o resultado vai para o alerta global e volta a cada clique na tela (um alerta só, nunca empilhado).
  await r.page.waitForSelector('.el-alert-stack .el-alert');
  assert.match(await r.page.textContent('.el-alert-stack'), /A contagem não bateu: .*Gestão do acervo/);
  await r.page.evaluate(() => window.fecharAlertaGlobal());
  await r.page.mouse.click(20, 300);
  await r.page.click('.el-alert-stack .el-alert:has(h4:text-is("Divergência na contagem"))' + ' button');
  assert.equal(await r.page.locator('.el-alert-stack .el-alert:has(h4:text-is("Divergência na contagem"))').count(), 0, 'Fechar não traz o alerta de volta');
  await r.page.mouse.click(20, 300);
  await r.page.waitForSelector('.el-alert-stack .el-alert');
  await r.page.mouse.click(30, 320);
  assert.equal(await r.page.locator('.el-alert-stack .el-alert:has(h4:text-is("Divergência na contagem"))').count(), 1, 'um alerta só');
  console.log("ok 4 - divergência enviada para a Gestão do acervo, sem resolver na conferência; alerta volta a cada clique");
  assert.deepStrictEqual([...r.erros], []);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
