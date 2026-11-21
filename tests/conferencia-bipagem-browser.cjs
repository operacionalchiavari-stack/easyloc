// Out/2026 — Conferência por bipagem (carregamento e volta): conferencia.html?pedido=<id>&etapa=carregamento|retorno.
// Só bipando: etiqueta de envio marca a unidade; repetida/outro pedido recusada; QR fixo marca a próxima etiqueta
// do item; QR do item é recusado; concluir com pendência grava status_operacional e operacao.<etapa>.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://acervo.teste/";
const mock = `(() => {
  window.__gravados = [];
  const banco = {
    separacoes_pedidos: [{ id: "p1", empresa_id: "e1", numero_pedido: "12", cliente_nome: "Lis", local_nome: "Villa", data_entrega: "2026-10-24", status: "separado", operacao: {} }],
    separacoes_itens: [{ id: "s1", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i1", item_nome: "Cadeira Tiffany" }, { id: "s2", empresa_id: "e1", separacao_pedido_id: "p1", item_id: "i2", item_nome: "Mesa Goa" }],
    separacoes_etiquetas: [
      { id: "e1a", empresa_id: "e1", separacao_pedido_id: "p1", separacao_item_id: "s1", item_id: "i1", codigo: "12-001", sequencia: 1, total_item: 2 },
      { id: "e1b", empresa_id: "e1", separacao_pedido_id: "p1", separacao_item_id: "s1", item_id: "i1", codigo: "12-002", sequencia: 2, total_item: 2 },
      { id: "e2a", empresa_id: "e1", separacao_pedido_id: "p1", separacao_item_id: "s2", item_id: "i2", codigo: "12-003", sequencia: 1, total_item: 1 },
      { id: "x9", empresa_id: "e1", separacao_pedido_id: "outro", separacao_item_id: "zz", item_id: "i9", codigo: "99-001", sequencia: 1, total_item: 1 }],
    itens: [{ id: "i1", empresa_id: "e1", produto: "Cadeira Tiffany", foto_url: "https://foto.teste/cadeira.png", volume_cubico: 0.2 }, { id: "i2", empresa_id: "e1", produto: "Mesa Goa" }],
    itens_patrimonios: [{ empresa_id: "e1", item_id: "i1", codigo_patrimonio: "CAD-001" }],
    separacoes_leituras: [],
    logistica_motivos: [{ id: "m1", empresa_id: "e1", etapa: "carregamento", nome: "Falta de espaço no caminhão", ativo: true }]
  };
  if(location.search.includes('etapa=descarregamento')){
    banco.separacoes_pedidos[0].operacao={carregamento:{concluido_em:'2026-11-01'},carregamento_caminhoes:[{id:'c1',codigo:'IDA',placa:'IDA0001'}]};
    banco.separacoes_etiquetas.filter(e=>e.separacao_pedido_id==='p1').forEach(e=>e.lida_carregamento_em='2026-11-01');
  }
  if(location.search.includes('manual=1')){banco.conferenciaManual=true;banco.separacoes_pedidos[0].modo_separacao='manual';}
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
    rpc: (n, args) => rpcOperacao(banco, n, args)
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
  await page.waitForSelector("#cfCorpo:not([hidden])", { timeout: 15000 });
  assert.strictEqual(await page.textContent("#cfTitulo"), "Conferência do carregamento");
  assert.strictEqual(await page.textContent("#cfContagem"), "0 de 3 volumes");
  console.log("ok 1 - abre o pedido com os 3 volumes (etiquetas) a conferir");

  const bipar = async (c) => { await page.fill("#cfEntrada", c); await page.press("#cfEntrada", "Enter"); await page.waitForTimeout(200); };
  const ultima = () => page.textContent("#cfUltimaTexto");
  await bipar("ACERVO:ENV:12-003");
  assert.strictEqual(await page.textContent("#cfContagem"), "1 de 3 volumes");
  assert.strictEqual(await ultima(), "Mesa Goa");
  await bipar("ACERVO:ENV:12-003");
  assert.strictEqual(await ultima(), "Já conferida");
  await bipar("ACERVO:ENV:99-001");
  assert.strictEqual(await ultima(), "Etiqueta de outro pedido");
  console.log("ok 2 - etiqueta conta uma vez; repetida e de outro pedido são recusadas");

  await bipar("ACERVO:PAT:CAD-001");
  assert.strictEqual(await page.textContent("#cfContagem"), "2 de 3 volumes");
  await bipar("ACERVO:PAT:CAD-001");
  assert.strictEqual(await ultima(), "Este móvel já foi conferido");
  await bipar("ACERVO:ITEM:CAD1");
  assert.ok((await ultima()).includes("etiqueta de envio"));
  assert.strictEqual(await page.textContent("#cfContagem"), "2 de 3 volumes");
  console.log("ok 3 - QR fixo marca a próxima unidade do item (uma vez); QR do item não conta");

  const marcadas = await page.evaluate(() => window.__gravados.filter((g) => g.t === "separacoes_etiquetas").map((g) => Object.keys(g.p)[0]));
  assert.ok(marcadas.every((k) => k === "lida_carregamento_em"), "carregamento marca lida_carregamento_em");
  await page.check("#cfSoFaltando");
  assert.deepStrictEqual(await page.$$eval(".cf-etq:not(.is-ok)", (e) => e.map((x) => x.textContent)), ["12-002"]);
  console.log("ok 4 - 'só o que falta' mostra a etiqueta 12-002");

  await page.evaluate(() => { window.confirmarGlobal = async () => true; });
  await page.click("#cfConcluir");
  await page.locator('dialog.cf-escolha-caminhao[open]').waitFor();await page.check('dialog.cf-escolha-caminhao input[value=c1]');await page.click('dialog.cf-escolha-caminhao [data-ok]');
  await page.waitForFunction(()=>window.__cargasTeste?.carga_por_veiculo?.length===1);assert.ok(!await page.evaluate(()=>window.__cargasTeste.carregamento?.concluido_em));assert.ok(!await page.locator('#cfEntrada').isDisabled(),'Leitor segue ativo depois do primeiro caminhao');
  await bipar('ACERVO:ENV:12-002');assert.equal(await page.textContent('#cfContagem'),'3 de 3 volumes');
  await page.click('#cfConcluir');await page.locator('dialog.cf-escolha-caminhao[open]').waitFor();assert.ok(await page.locator('dialog.cf-escolha-caminhao input[value=c1]').isDisabled());await page.check('dialog.cf-escolha-caminhao input[value=c2]');assert.equal(await page.locator('.cf-escolha-item input:checked').count(),1);await page.click('dialog.cf-escolha-caminhao [data-ok]');
  await page.waitForFunction(()=>!!window.__cargasTeste?.carregamento?.concluido_em);const fim=await page.evaluate(()=>window.__cargasTeste);assert.equal(fim.carga_por_veiculo.length,2);assert.equal(fim.carregamento.lidas,3);assert.equal(fim.carregamento.total,3);assert.equal(fim.carregamento.faltando.length,0);
  assert.ok(await page.locator('#cfConcluir').isDisabled());assert.ok(await page.locator('#cfEntrada').isDisabled());
  console.log('ok 5 - bipagem distribui somente leituras novas no segundo caminhao e conclui quando toda carga esta atribuida');

  await page.goto(BASE + "Modulos/Logistica/Conferencia/conferencia.html?pedido=p1&etapa=descarregamento");
  await page.waitForSelector('#cfCorpo:not([hidden])');
  await page.waitForFunction(()=>document.getElementById('cfCaminhoes').textContent.includes('XYZ9K87'));
  assert.ok(!(await page.locator('#cfCaminhoes').innerText()).includes('IDA0001'),'usa planejamento da volta e nao caminhao da ida');
  await bipar('ACERVO:ENV:12-001');await bipar('ACERVO:ENV:12-003');
  await page.click('#cfConcluir');await page.locator('dialog.cf-escolha-caminhao[open]').waitFor();
  assert.match(await page.locator('dialog.cf-escolha-caminhao h3').innerText(),/descarregados/);
  await page.check('dialog.cf-escolha-caminhao input[value=c2]');await page.click('dialog.cf-escolha-caminhao [data-ok]');
  await page.waitForFunction(()=>window.__cargasTeste?.descarga_por_veiculo?.length===1);
  assert.ok(!await page.locator('#cfEntrada').isDisabled());assert.equal(await page.locator('.cf-carga-item').count(),2);
  await bipar('ACERVO:ENV:12-002');await page.click('#cfConcluir');await page.locator('dialog.cf-escolha-caminhao[open]').waitFor();
  assert.ok(await page.locator('dialog.cf-escolha-caminhao input[value=c2]').isDisabled());
  await page.check('dialog.cf-escolha-caminhao input[value=c1]');await page.click('dialog.cf-escolha-caminhao [data-ok]');
  await page.waitForFunction(()=>!!window.__cargasTeste?.descarregamento?.concluido_em);
  const volta=await page.evaluate(()=>window.__cargasTeste);assert.equal(volta.descarga_por_veiculo.length,2);assert.equal(volta.descarregamento.lidas,3);assert.equal(volta.carregamento_caminhoes[0].placa,'IDA0001');
  assert.ok(await page.locator('#cfEntrada').isDisabled());
  console.log('ok - descarregamento sequencial, planejamento da coleta, colunas independentes e um caminhao por vez');
  await page.goto(BASE + "Modulos/Logistica/Conferencia/conferencia.html?pedido=p1&etapa=descarregamento&manual=1");
  await page.waitForSelector('#cfQtd:not([hidden]) .cf-qtd-input');
  await page.locator('.cf-qtd-input[data-i="0"]').fill('1');
  await page.click('#cfQtdConfirmar');await page.locator('dialog.cf-escolha-caminhao[open]').waitFor();await page.check('dialog.cf-escolha-caminhao input[value=c2]');await page.click('dialog.cf-escolha-caminhao [data-ok]');
  await page.waitForFunction(()=>window.__cargasTeste?.descarga_por_veiculo?.length===1);
  assert.equal(await page.locator('.cf-carga-item').count(),1);assert.ok(!await page.locator('#cfQtdConfirmar').isDisabled());
  await page.locator('.cf-qtd-input[data-i="0"]').fill('1');await page.locator('.cf-qtd-input[data-i="1"]').fill('1');
  await page.click('#cfQtdConfirmar');await page.locator('dialog.cf-escolha-caminhao[open]').waitFor();await page.check('dialog.cf-escolha-caminhao input[value=c1]');await page.click('dialog.cf-escolha-caminhao [data-ok]');
  await page.waitForFunction(()=>!!window.__cargasTeste?.descarregamento?.concluido_em);
  assert.equal(await page.locator('.cf-carga-item').count(),3);
  console.log('ok - descarregamento por quantidade em dois caminhoes, mantendo colunas e saldo');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "Modulos/Logistica/Conferencia/conferencia.html?pedido=p1&etapa=retorno");
  // Desde 03/11 a volta é sempre por quantidade (sem bipe): o quadro de bipagem não aparece.
  await page.waitForFunction(() => document.getElementById("cfCorpo")?.hidden !== false || /conferir/i.test(document.body.innerText), null, { timeout: 15000 });
  assert.strictEqual(await page.textContent("#cfTitulo"), "Conferência da volta");
  assert.ok(await page.evaluate(() => document.getElementById("cfCorpo").hidden), "volta sem o quadro de bipagem");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "sem rolagem lateral no celular");
  console.log("ok 6 - volta por quantidade (sem bipe); celular sem rolagem lateral");
  await page.goto(BASE + "Modulos/Logistica/Conferencia/conferencia.html?pedido=p1&etapa=carregamento");
  await page.waitForSelector("#cfCorpo:not([hidden])");
  await page.evaluate(()=>{window.__falhaRede=true;});
  await bipar("ACERVO:ENV:12-001");
  assert.strictEqual(await page.textContent("#cfContagem"), "0 de 3 volumes");
  assert.ok(await page.isVisible("#cfPendenciasRede"));
  await page.reload();
  await page.waitForSelector("#cfReenviarLeituras");
  await page.click("#cfReenviarLeituras");
  await page.waitForFunction(()=>document.getElementById("cfContagem").textContent==="1 de 3 volumes");
  assert.ok(await page.isHidden("#cfPendenciasRede"));
  console.log("ok 7 - falha de rede preserva a leitura após recarregar e só confirma depois de enviar");
  assert.deepStrictEqual(erros, [], erros.join("\n"));
  console.log("todos os testes passaram");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
