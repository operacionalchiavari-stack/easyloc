// Out/2026 — pedido separado no modo manual é conferido na Expedição por quantidade, mesmo com etiquetas impressas;
// "Liberar para a Triagem" só pergunta se tem certeza (sem pedir motivo).
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const mock = `(() => {
  window.__gravados = [];
  const banco = {
    separacoes_pedidos: [{ id: "p1", empresa_id: "e1", numero_pedido: "12", cliente_nome: "Lis", local_nome: "Villa", data_entrega: "2026-10-24", status: "separado", modo_separacao: "manual", operacao: {} }],
    separacoes_itens: [{ id: "s1", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i1", item_nome: "Cadeira Tiffany" }, { id: "s2", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i2", item_nome: "Mesa Goa" }],
    separacoes_etiquetas: [
      { id: "e1a", empresa_id: "e1", separacao_pedido_id: "p1", separacao_item_id: "s1", item_id: "i1", codigo: "12-001", sequencia: 1, total_item: 2 },
      { id: "e1b", empresa_id: "e1", separacao_pedido_id: "p1", separacao_item_id: "s1", item_id: "i1", codigo: "12-002", sequencia: 2, total_item: 2 },
      { id: "e2a", empresa_id: "e1", separacao_pedido_id: "p1", separacao_item_id: "s2", item_id: "i2", codigo: "12-003", sequencia: 1, total_item: 1 },
      { id: "x9", empresa_id: "e1", separacao_pedido_id: "outro", separacao_item_id: "zz", item_id: "i9", codigo: "99-001", sequencia: 1, total_item: 1 }],
    itens: [{ id: "i1", empresa_id: "e1", produto: "Cadeira Tiffany" }, { id: "i2", empresa_id: "e1", produto: "Mesa Goa" }],
    itens_patrimonios: [{ empresa_id: "e1", item_id: "i1", codigo_patrimonio: "CAD-001" }],
    separacoes_leituras: [],
    caminhoes:sessionStorage.getItem('multi-carga')?[{id:'c1',codigo:'G',placa:'ABC1D23',modelo:'Bau grande',foto_url:'http://acervo.teste/logo%20nova%20-%20com%20fundo%20branco.png'},{id:'c2',codigo:'M2',placa:'XYZ9K87',modelo:'Bau medio'},{id:'c3',codigo:'P3',placa:'PQR1A23',modelo:'Bau pequeno'}]:undefined,
    caminhoesProgramados: { p1: ["c2"] }
  };
  if(sessionStorage.getItem('multi-carga')&&sessionStorage.getItem('carga-teste'))banco.separacoes_pedidos[0].operacao=JSON.parse(sessionStorage.getItem('carga-teste'));
  function consulta(t){
    let linhas = (banco[t] || []).slice(), unico = false, acao = null, dados = null;
    const q = {
      select(){ return q; }, order(){ return q; }, limit(){ return q; },
      eq(c, v){ linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      in(c, vs){ linhas = linhas.filter((l) => !(c in l) || vs.map(String).includes(String(l[c]))); return q; },
      maybeSingle(){ unico = true; return q; }, single(){ unico = true; return q; },
      insert(p){ window.__gravados.push({ t, tipo: "insert", p }); return q; },
      update(p){ acao = "update"; dados = p; return q; },
      then(ok, erro){
        if(acao === "update"){ linhas.forEach((l) => Object.assign(l, dados)); window.__gravados.push({ t, tipo: "update", p: dados }); }
        return Promise.resolve({ data: unico ? (linhas[0] || null) : linhas, error: null }).then(ok, erro);
      }
    };
    return q;
  }
  const rpcOperacao = ${require("./operacao-rpc-fixture.cjs").toString()};
  const cliente = {
    auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }), getUser: async () => ({ data: { user: { id: "u1" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: consulta,
    rpc: (n, args) => n === "operacao_conferencia_pecas" ? Promise.resolve({ data: [{ chave: "s1|i1", linha: "s1", item_id: "i1", nome: "Cadeira Tiffany", esperado: 2 }, { chave: "s2|i2", linha: "s2", item_id: "i2", nome: "Mesa Goa", esperado: 1 }], error: null }) : rpcOperacao(banco, n, args).then(r=>{if(sessionStorage.getItem('multi-carga')&&n==='operacao_carregamento_lote'&&!r.error)sessionStorage.setItem('carga-teste',JSON.stringify(r.data.operacao));return r;})
  };
  window.supabase = { createClient: () => cliente };
  window.__CONTEXT = { empresa_id: "e1", usuario_id: "u1", usuario_nome: "Igor" };
  window.aguardarContexto = async () => window.__CONTEXT;
  window.confirmarGlobal = async () => true;
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
  assert.ok(await page.isHidden("#cfCorpo"), "sem a área de bipagem");
  assert.strictEqual(await page.locator(".cf-qtd-input").count(), 2);
  console.log("ok 1 - separado no manual: conferência por quantidade, sem bipe, mesmo com etiquetas");
  await page.setViewportSize({ width: 1280, height: 300 });
  await page.waitForTimeout(200);
  const rodape = await page.evaluate(() => { const r = document.querySelector(".cf-qtd-rodape").getBoundingClientRect(); return { fundo: Math.round(r.bottom), tela: innerHeight }; });
  assert.ok(Math.abs(rodape.fundo - rodape.tela) <= 2, "Confirmar fica fixo embaixo da tela: " + JSON.stringify(rodape));
  await page.setViewportSize({ width: 1280, height: 860 });
  console.log("ok 1b - botão de confirmar fixo embaixo, como na Triagem");
  let prompts = 0;
  page.on("dialog", (d) => { prompts++; d.dismiss(); });
  await page.click("#cfLiberarTriagem");
  await page.waitForTimeout(400);
  assert.strictEqual(prompts, 0, "não pede motivo em caixa do navegador");
  const texto = await page.evaluate(() => document.body.innerText);
  assert.ok(/Tem certeza/.test(texto), "pergunta se tem certeza");
  assert.ok(!/Informe o motivo/.test(texto), "não pede o motivo");
  console.log("ok 2 - Liberar para a Triagem só pergunta se tem certeza");
  const p2 = page;
  await p2.setViewportSize({ width: 1280, height: 860 });
  await p2.goto(BASE + "Modulos/Logistica/Conferencia/conferencia.html?pedido=p1&etapa=carregamento");
  await p2.waitForSelector(".cf-caminhao", { timeout: 15000 });
  const faixa = await p2.evaluate(() => ({ texto: document.querySelector("#cfCaminhoes").innerText, fundo: getComputedStyle(document.querySelector("#cfCaminhoes")).backgroundColor }));
  assert.ok(/programados/i.test(faixa.texto) && /M2/.test(faixa.texto), "faixa com o caminhão programado: " + faixa.texto);
  console.log("ok 3 - caminhão programado em destaque no topo da conferência");
  for (const inp of await p2.locator(".cf-qtd-input").all()) { const max = await inp.evaluate((e) => e.closest("[data-esperado]")?.dataset.esperado || e.getAttribute("max") || ""); await inp.fill(max || "2"); }
  // tudo carregado (a falta no carregamento abre a janela de pendências, testada em conferencia-sem-etiquetas)
  await p2.click("#cfQtdConfirmar");
  await p2.waitForSelector("dialog.cf-escolha-caminhao[open]");
  assert.ok(!(await p2.locator('dialog.cf-escolha-caminhao').innerText()).includes('Marque o caminhão'));
  assert.equal(await p2.locator('dialog.cf-escolha-caminhao .cf-escolha-foto').count(),2);
  const circulos=await p2.locator('.cf-escolha-foto').evaluateAll(els=>els.map(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height,r:getComputedStyle(el).borderRadius})));
  assert.ok(circulos.every(c=>c.w===c.h&&c.r==='50%'),'fotos circulares');
  assert.ok(circulos.every(c=>c.w<=80),'fotos menores');assert.ok((await p2.locator('dialog.cf-escolha-caminhao').boundingBox()).width>800,'modal ampliado');
  const pesquisa=p2.locator('.cf-escolha-pesquisa');await pesquisa.fill('inexistente');assert.equal(await p2.locator('.cf-escolha-item:visible').count(),0);assert.ok(await p2.locator('.cf-escolha-vazio').isVisible());
  const nomeBusca=await p2.locator('.cf-escolha-item').first().locator('.cf-escolha-nome strong').innerText();await pesquisa.fill(nomeBusca);assert.ok(await p2.locator('.cf-escolha-item:visible').count()>0);assert.ok(await p2.locator('input[value=c2]').isChecked());await pesquisa.fill('');
  const posicoes=await p2.locator('.cf-escolha-item').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().top));assert.equal(posicoes[0],posicoes[1],'caminhoes lado a lado');
  await p2.locator('.cf-escolha-item').first().hover();await p2.waitForTimeout(280);
  assert.notEqual(await p2.locator('.cf-escolha-foto').first().evaluate(el=>getComputedStyle(el).transform),'none','zoom ao passar o mouse');
  await p2.locator('dialog.cf-escolha-caminhao').screenshot({path:'.tmp/escolha-caminhoes-circular.png'});
  await p2.setViewportSize({width:390,height:844});
  const caixa=await p2.locator('dialog.cf-escolha-caminhao').boundingBox();assert.ok(caixa.x>=0&&caixa.x+caixa.width<=390);
  await p2.setViewportSize({width:1280,height:900});


  const marcados = await p2.evaluate(() => [...document.querySelectorAll("dialog.cf-escolha-caminhao input[type=radio]")].map((i) => i.value + ":" + i.checked));
  assert.deepStrictEqual(marcados, ["c2:true", "c1:false"], "programado primeiro e já marcado: " + marcados);
  await p2.locator("dialog.cf-escolha-caminhao input[value=c2]").evaluate(i=>i.checked=false);
  await p2.click("dialog.cf-escolha-caminhao [data-ok]");
  await p2.waitForTimeout(300);
  assert.ok(await p2.isVisible("dialog.cf-escolha-caminhao[open]"), "sem caminhão marcado não conclui");
  await p2.check("dialog.cf-escolha-caminhao input[value=c1]");
  await p2.click("dialog.cf-escolha-caminhao [data-ok]");
  if (await p2.locator("dialog.cf-confirmacao[open]").isVisible({ timeout: 1500 }).catch(() => false)) await p2.click("dialog.cf-confirmacao [type=submit]");
  await p2.waitForFunction(() => window.__gravados.some((g) => g.t === "separacoes_pedidos" && g.p?.operacao?.carregamento?.concluido_em));
  const reg = await p2.evaluate(() => window.__gravados.find((g) => g.t === "separacoes_pedidos" && g.p?.operacao?.carregamento?.concluido_em).p.operacao.carregamento.caminhoes.map((c) => c.codigo));
  assert.deepStrictEqual(reg, ["G"], "registro do carregamento leva o caminhão escolhido");
  console.log("ok 4 - no fim do carregamento escolhe o caminhão (obrigatório) e ele fica no registro");
  await page.evaluate(()=>sessionStorage.setItem('multi-carga','1'));
  await page.reload();await page.locator('.cf-qtd-input').first().waitFor();
  await page.locator('.cf-qtd-input[data-chave="s1|i1"]').fill('1');await page.locator('.cf-qtd-obs[data-chave="s1|i1"]').fill('Primeiro lote conferido');
  await page.click('#cfQtdConfirmar');await page.locator('.cf-escolha-caminhao[open]').waitFor();await page.check('.cf-escolha-caminhao input[value=c1]');assert.equal(await page.locator('.cf-escolha-caminhao input[type=radio]:checked').count(),1);await page.click('.cf-escolha-caminhao [data-ok]');
  await page.waitForFunction(()=>window.__cargasTeste?.carga_por_veiculo?.length===1);assert.ok(!await page.evaluate(()=>window.__cargasTeste.carregamento?.concluido_em));assert.equal(await page.locator('.cf-carga-placa').first().innerText(),'ABC1D23');assert.equal(await page.locator('.cf-carga-coluna img').count(),1);const imagem=await page.locator('.cf-carga-foto').first().boundingBox(),placa=await page.locator('.cf-carga-placa').first().boundingBox();assert.ok(placa.y>=imagem.y+imagem.height,'placa embaixo da foto');assert.equal(await page.locator('.cf-qtd-cabeca .cf-carga-cabeca').innerText(),'G');assert.match(await page.locator('#cfQtdConfirmar').innerText(),/2.*caminh/i);
  await page.reload();await page.locator('.cf-carga-item').first().waitFor();assert.equal(await page.locator('.cf-qtd-input[data-chave="s1|i1"]').getAttribute('max'),'1');
  await page.locator('.cf-qtd-input[data-chave="s2|i2"]').fill('1');await page.click('#cfQtdConfirmar');await page.locator('.cf-escolha-caminhao[open]').waitFor();assert.ok(await page.locator('.cf-escolha-caminhao input[value=c1]').isDisabled());await page.check('.cf-escolha-caminhao input[value=c2]');await page.click('.cf-escolha-caminhao [data-ok]');
  await page.waitForFunction(()=>window.__cargasTeste?.carga_por_veiculo?.length===2);assert.ok(!await page.evaluate(()=>window.__cargasTeste.carregamento?.concluido_em));assert.ok(await page.locator('.cf-qtd-input[data-chave="s2|i2"]').isDisabled());
  await page.locator('.cf-qtd-input[data-chave="s1|i1"]').fill('1');await page.click('#cfQtdConfirmar');await page.locator('.cf-escolha-caminhao[open]').waitFor();assert.ok(await page.locator('.cf-escolha-caminhao input[value=c2]').isDisabled());await page.check('.cf-escolha-caminhao input[value=c3]');await page.click('.cf-escolha-caminhao [data-ok]');
  await page.waitForFunction(()=>!!window.__cargasTeste?.carregamento?.concluido_em);const cargas=await page.evaluate(()=>window.__cargasTeste);assert.equal(cargas.carga_por_veiculo.length,3);assert.equal(cargas.carregamento.itens.find(i=>i.chave==='s1|i1').conferido,2);assert.equal(cargas.carregamento.itens.find(i=>i.chave==='s1|i1').obs,'Primeiro lote conferido');assert.equal(await page.locator('.cf-carga-item').count(),3);const colunas=await page.locator('.cf-qtd-linha:not(.cf-qtd-cabeca)').evaluateAll(rs=>rs.map(r=>[...r.querySelectorAll('[data-coluna-caminhao]')].map(c=>({x:c.getBoundingClientRect().x,y:c.getBoundingClientRect().y}))));assert.equal(colunas[0].length,3);assert.equal(colunas[1].length,3);for(let i=0;i<3;i++)assert.ok(Math.abs(colunas[0][i].x-colunas[1][i].x)<2);assert.ok(colunas[0].every(c=>Math.abs(c.y-colunas[0][0].y)<2));assert.ok(await page.locator('.cf-carga-foto').first().evaluate(e=>e.getBoundingClientRect().width<=44));
  console.log('ok 5 - tres cargas sequenciais, uma escolha por vez, saldo, identificacao por caminhao, retomada e conclusao somente no ultimo');
  assert.ok(erros.length === 0, erros.join(" | "));
  await browser.close();
  console.log("todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });
