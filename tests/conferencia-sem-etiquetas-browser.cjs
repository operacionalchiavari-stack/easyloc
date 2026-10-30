// Out/2026 — Pedido separado em "1 clique" não tem etiquetas de envio: sem bipe, a conferência é por QUANTIDADE.
// Lista os itens (Kit aberto nos componentes, via operacao_conferencia_pecas), a pessoa digita quanto foi carregado,
// conclui pelo operacao_concluir_conferencia com p_quantidades, e pode imprimir a lista de carregamento.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const mock = `(() => {
  window.__inseridas = [];
  const banco = {
    separacoes_pedidos: [{ id: "p1", empresa_id: "e1", numero_pedido: "2279", cliente_nome: "Feira Casa & Estilo", local_nome: "Casa de Festa", data_entrega: "2026-10-18", status: "separado", operacao: {} }],
    separacoes_itens: [
      { id: "s1", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i1", item_nome: "Cadeira Tiffany", quantidade_solicitada: 2, itens: { id: "i1", produto: "Cadeira Tiffany", tipo: "Item" } },
      { id: "s2", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "k1", item_nome: "Mesa Bistrô (kit)", quantidade_solicitada: 1, itens: { id: "k1", produto: "Mesa Bistrô", tipo: "Kit" } }],
    kit_itens: [
      { empresa_id: "e1", kit_id: "k1", item_id: "c1", quantidade: 1, itens: { id: "c1", produto: "Tampo" } },
      { empresa_id: "e1", kit_id: "k1", item_id: "c2", quantidade: 2, itens: { id: "c2", produto: "Pé" } }],
    separacoes_etiquetas: [],
    itens: [{ id: "i1", empresa_id: "e1", produto: "Cadeira Tiffany" }],
    logistica_motivos: [{ id: "m1", empresa_id: "e1", etapa: "carregamento", nome: "Item não separado a tempo", ativo: true }]
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
      if (n === "operacao_conferencia_pecas") return Promise.resolve({ data: [
        { chave: "s1|i1", linha: "s1", item_id: "i1", nome: "Cadeira Tiffany", esperado: 2 },
        { chave: "s2|c1", linha: "s2", item_id: "c1", nome: "Tampo", esperado: 1, kit_nome: "Mesa Nice   (L) 3 m", por_kit: 1 },
        { chave: "s2|c2", linha: "s2", item_id: "c2", nome: "Pé", esperado: 2 }], error: null });
      if (n === "operacao_concluir_conferencia" || n === "operacao_concluir_com_pendencia") {
        if (n === "operacao_concluir_com_pendencia") window.__pendencia = args.p_pendencia;
        const pecas = { "s1|i1": ["Cadeira Tiffany", 2], "s2|c1": ["Tampo", 1], "s2|c2": ["Pé", 2] };
        const itens = Object.entries(pecas).map(([k, [nome, esp]]) => ({ chave: k, item: nome, esperado: esp, conferido: args.p_quantidades[k], obs: (args.p_observacoes || {})[k] || null }));
        const faltando = itens.filter((x) => x.conferido < x.esperado);
        const r = { concluido_em: new Date().toISOString(), por: "Igor", total: 5, lidas: itens.reduce((t, x) => t + Math.min(x.conferido, x.esperado), 0), faltando, sem_etiquetas: true, itens, ...(args.p_pendencia ? { pendencia: { ...args.p_pendencia, caminhoes: [{ codigo: "G", placa: "ABC1D23" }] } } : {}) };
        return Promise.resolve({ data: r, error: null }); }
      return rpcOperacao(banco, n, args); }
  };
  window.confirmarGlobal = async () => true;
  window.supabase = { createClient: () => cliente };
  window.__CONTEXT = { empresa_id: "e1", usuario_id: "u1", usuario_nome: "Igor", empresa_nome: "Chiavari" };
  window.aguardarContexto = async () => window.__CONTEXT;
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const erros = [];
  page.on("pageerror", (e) => { if (!/lucide|single is not a function/.test(e.message)) erros.push(e.message); });
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); });
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("supabase-js")) return r.fulfill({ contentType: "text/javascript", body: mock });
    if (u.startsWith(BASE)) {
      const f = path.join(raiz, decodeURIComponent(new URL(u).pathname));
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
      return r.fulfill({ body: fs.readFileSync(f), contentType: { ".html": "text/html", ".css": "text/css" }[path.extname(f)] || "text/javascript" });
    }
    return r.abort();
  });
  await page.goto(BASE + "Modulos/Logistica/Conferencia/conferencia.html?pedido=p1&etapa=carregamento");
  await page.waitForSelector(".cf-qtd-input", { timeout: 15000 });
  const linhas = await page.$$eval(".cf-qtd-linha:not(.cf-qtd-cabeca)", (l) => l.map((x) => [x.querySelector("strong").firstChild.textContent, x.querySelector("strong + span").textContent]));
  assert.deepStrictEqual(linhas, [["Cadeira Tiffany", "2"], ["Pé", "2"], ["Tampo", "1"]]);
  assert.ok(await page.isHidden("#cfCorpo"), "sem área de bipagem");
  // Topo numa linha (out/2026): sem o texto explicativo; Pedido, decorador e progresso na mesma linha.
  const topo = await page.evaluate(() => { const c = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.top + r.height / 2; }; return { nota: document.getElementById("cfPedidoNota").hidden, pedidoXprogresso: Math.abs(c("cfPedidoNumero") - c("cfPercent")) }; });
  assert.ok(topo.nota && topo.pedidoXprogresso <= 6, "topo numa linha, sem a explicação: " + JSON.stringify(topo));
  assert.strictEqual(await page.textContent("#cfContagem"), "0 de 5 peças");
  if (process.env.FOTO) await page.screenshot({ path: process.env.FOTO, fullPage: true });
  console.log("ok 1 - sem etiquetas: lista os itens (kit aberto) com a quantidade do pedido e um campo cada");

  await page.evaluate(() => { window.confirmarGlobal = async () => true; window.__alertas = []; window.alerta = (m) => window.__alertas.push(m); });
  await page.click("#cfQtdConfirmar");
  assert.strictEqual(await page.evaluate(() => (window.__rpc || []).filter((r) => r[0] === "operacao_concluir_conferencia").length), 0, "não conclui com campo vazio");
  console.log("ok 2 - não deixa concluir com quantidade em branco");

  const pos = await page.evaluate(() => { const b = document.getElementById("cfImprimir").getBoundingClientRect(), t = document.getElementById("cfPedidoNumero").getBoundingClientRect(), c = document.getElementById("cfPedido").getBoundingClientRect(); return { txt: document.getElementById("cfImprimir").textContent.trim(), meio: Math.abs((b.top + b.height / 2) - (t.top + t.height / 2)), dir: Math.abs(b.right - c.right) }; });
  assert.strictEqual(pos.txt, "Imprimir lista");
  assert.ok(pos.meio <= 4 && pos.dir <= 2, "Imprimir lista na linha do Pedido, à direita: " + JSON.stringify(pos));
  assert.strictEqual(await page.locator("text=Preencher com o pedido").count(), 0, "sem o botão Preencher");
  await page.click("#cfImprimir");
  const impressa = await page.evaluate(() => window.__ultimaListaImpressa || "");
  assert.ok(impressa.includes("Lista de carregamento · Pedido 2279") && impressa.includes("Tampo") && impressa.includes("Motorista"), "lista impressa");
  console.log("ok 3 - Imprimir lista na linha do título (sem Preencher com o pedido) imprime a lista (itens, quantidades, caixas e assinaturas)");

  await page.waitForTimeout(600); // Aguarda a abertura da impressao antes de editar.
  await page.fill(".cf-qtd-input[data-chave=\"s1|i1\"]", "2");
  await page.fill(".cf-qtd-input[data-chave=\"s2|c1\"]", "1");
  await page.fill(".cf-qtd-input[data-chave=\"s2|c2\"]", "1");
  await page.fill(".cf-qtd-obs[data-chave=\"s2|c2\"]", "  um pé quebrado ");
  const tam = await page.evaluate(() => { const l = document.querySelector(".cf-qtd-linha:not(.cf-qtd-cabeca)"); const f = l.querySelector(".cf-qtd-sem-foto, img").getBoundingClientRect(); return { foto: Math.round(f.width), qtd: getComputedStyle(l.querySelector("strong + span")).fontSize, campo: Math.round(l.querySelector(".cf-qtd-input").getBoundingClientRect().height), obsMesmaLinha: Math.abs(l.querySelector(".cf-qtd-obs").getBoundingClientRect().top - l.querySelector(".cf-qtd-input").getBoundingClientRect().top) < 2 }; });
  assert.deepStrictEqual(tam, { foto: 72, qtd: "24px", campo: 52, obsMesmaLinha: true }, "tamanhos iguais aos da Triagem");
  assert.strictEqual(await page.textContent("#cfContagem"), "4 de 5 peças");
  assert.ok(await page.$eval(".cf-qtd-input[data-chave=\"s2|c2\"]", (i) => i.closest(".cf-qtd-linha").classList.contains("is-falta")));
  assert.equal(await page.$eval(".cf-qtd-input[data-chave=\"s2|c2\"]", (i) => getComputedStyle(i.closest(".cf-qtd-linha")).backgroundColor), "rgb(253, 246, 221)", "linha amarela com quantidade menor");
  // Componente de Kit mostra o Kit embaixo do nome (igual à Triagem); item comum não mostra nada.
  const kitTampo = await page.$eval('.cf-qtd-input[data-chave="s2|c1"]', (i) => i.closest(".cf-qtd-linha").querySelector(".cf-qtd-kit")?.textContent);
  assert.strictEqual(kitTampo, "Parte do kit: Mesa Nice (L) 3 m (1 por kit)");
  assert.strictEqual(await page.$eval('.cf-qtd-input[data-chave="s1|i1"]', (i) => i.closest(".cf-qtd-linha").querySelectorAll(".cf-qtd-kit").length), 0);
  // A mais também é conferência errada: amarelo, nunca verde. Só a quantidade exata fica verde.
  const linha1 = ".cf-qtd-input[data-chave=\"s1|i1\"]";
  const valorOriginal = await page.inputValue(linha1);
  await page.fill(linha1, String(Number(valorOriginal) + 3));
  const aMais = await page.$eval(linha1, (i) => { const l = i.closest(".cf-qtd-linha"); return { ok: l.classList.contains("is-ok"), aMais: l.classList.contains("is-a-mais"), fundo: getComputedStyle(l).backgroundColor }; });
  assert.deepStrictEqual(aMais, { ok: false, aMais: true, fundo: "rgb(253, 246, 221)" }, "quantidade a mais fica amarela");
  await page.fill(linha1, valorOriginal);
  assert.ok(await page.$eval(linha1, (i) => i.closest(".cf-qtd-linha").classList.contains("is-ok")), "quantidade exata volta a verde");
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await page.click("#cfQtdConfirmar");
  await page.evaluate(() => { window.__avisos = []; const o = window.alerta; window.alerta = (m, ...r) => { window.__avisos.push(String(m)); return o?.(m, ...r); }; });
  await page.locator("dialog.cf-escolha-caminhao[open]").waitFor();await page.check("dialog.cf-escolha-caminhao input[value=c1]");await page.click("dialog.cf-escolha-caminhao [data-ok]");await page.locator('dialog.cf-pendencias[open]').waitFor();assert.match(await page.locator('dialog.cf-pendencias').innerText(),/Pendências/i);assert.match(await page.locator('.cf-pend-itens').innerText(),/Pé[\s\S]*1 faltante/);await page.locator('dialog.cf-pendencias [data-voltar]').click();assert.equal(await page.evaluate(()=>(window.__rpc||[]).filter(r=>/^operacao_concluir/.test(r[0])).length),0);await page.click('#cfQtdConfirmar');await page.locator("dialog.cf-escolha-caminhao[open]").waitFor();await page.check("dialog.cf-escolha-caminhao input[value=c1]");await page.click("dialog.cf-escolha-caminhao [data-ok]");await page.locator('dialog.cf-pendencias[open]').waitFor();await page.screenshot({path:'.tmp/conferencia-confirmacao-pendencias.png'});await page.selectOption('dialog.cf-pendencias select[name=motivo]','m1');await page.fill('dialog.cf-pendencias input[name=data]','2099-12-01');await page.fill('dialog.cf-pendencias input[name=hora]','09:00');await page.locator('dialog.cf-pendencias [type=submit]').click();
  await page.waitForSelector(".cf-qtd-valor", { timeout: 10000 });
  const rpc = await page.evaluate(() => window.__rpc.filter((r) => r[0] === "operacao_concluir_com_pendencia").map((r) => r[1]));
  assert.deepStrictEqual(rpc, [{ p_pedido: "p1", p_etapa: "carregamento", p_aceitar_faltas: true, p_quantidades: { "s1|i1": 2, "s2|c1": 1, "s2|c2": 1 }, p_observacoes: { "s2|c2": "um pé quebrado" }, p_pendencia: { motivo_id: "m1", data: "2099-12-01", hora: "09:00" } }]);
  assert.ok((await page.textContent(".cf-qtd-linha.is-div-falta .cf-qtd-obs-texto")).includes("um pé quebrado"), "observação aparece no resultado");
  // o resumo vai para o alerta global (a faixa #cfAviso saiu a pedido do usuário)
  assert.ok((await page.evaluate(() => window.__avisos || [])).some((m) => /1 item\(ns\) faltando/.test(m)), "aviso de conclusão com a falta: " + JSON.stringify(await page.evaluate(() => window.__avisos)));
  assert.ok((await page.textContent(".cf-qtd-linha.is-div-falta")).includes("faltam 1"));
  assert.strictEqual(await page.evaluate(() => window.__inseridas.length), 0, "nenhuma etiqueta criada");
  console.log("ok 4 - foto/quantidade no tamanho da Triagem, observação por item; concluir manda as quantidades, aceita a falta com confirmação e mostra o resultado");

  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(400);
  const largos = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > 392 || e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== "visible").slice(0, 6).map((e) => e.tagName + "." + e.className + " " + Math.round(e.getBoundingClientRect().right)));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 391), "celular sem rolagem lateral: " + largos.join(" | ") + " sw=" + await page.evaluate(() => document.documentElement.scrollWidth));
  console.log("ok 5 - celular sem rolagem lateral");
  assert.deepStrictEqual(erros, []);
  await browser.close();
  console.log("todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });
