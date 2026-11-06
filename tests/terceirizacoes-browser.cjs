// Nov/2026 — Comercial > Terceirizações: empresas (fornecedores marcados como terceirização) e os itens de cada uma.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const raiz = path.resolve(__dirname, "..");
const BASE = "http://acervo.teste/";

const mock = `
(() => {
  const banco = {
    fornecedores: [
      { id: "f1", empresa_id: "e1", nome_fantasia: "Lounge Parceira", nome_razao_social: "Lounge Parceira Ltda", terceirizacao: true },
      { id: "f2", empresa_id: "e1", nome_fantasia: "", nome_razao_social: "Tendas Brasil SA", terceirizacao: false, categoria: "locacao_moveis" } ],
    terceirizacao_itens: [
      { id: "t1", empresa_id: "e1", fornecedor_id: "f1", produto: "Sofá Veludo Rosa", categoria: "Sofás", largura: 2.2, altura: 0.8, profundidade: 0.9, codigo: "LP01", quantidade: 6, custo: 200, valor_locacao: 500, ativo: true, foto_url: "" } ]
  };
  window.__gravados = [];
  let seq = 1;
  function consulta(tabela){
    let linhas = (banco[tabela] || []).slice(), unico = false, acao = null, payload = null, filtros = [];
    const q = {
      select(){ return q; }, order(){ return q; },
      eq(c, v){ filtros.push([c, v]); linhas = linhas.filter((l) => !(c in l) || String(l[c]) === String(v)); return q; },
      single(){ unico = true; return q; },
      insert(p){ acao = "insert"; payload = p; return q; },
      update(p){ acao = "update"; payload = p; return q; },
      delete(){ acao = "delete"; return q; },
      then(ok, erro){
        if(acao === "insert"){ const n = { id: "novo" + (seq++), ...payload }; banco[tabela].push(n); window.__gravados.push({ tabela, acao, payload }); return Promise.resolve({ data: unico ? n : [n], error: null }).then(ok, erro); }
        if(acao === "update"){ const id = filtros.find((f) => f[0] === "id")?.[1]; banco[tabela].forEach((l) => { if(l.id === id) Object.assign(l, payload); }); window.__gravados.push({ tabela, acao, payload, id }); return Promise.resolve({ data: null, error: null }).then(ok, erro); }
        if(acao === "delete"){ const id = filtros.find((f) => f[0] === "id")?.[1]; banco[tabela] = banco[tabela].filter((l) => l.id !== id); window.__gravados.push({ tabela, acao, id }); return Promise.resolve({ data: null, error: null }).then(ok, erro); }
        return Promise.resolve({ data: unico ? (linhas[0] || null) : linhas, error: null }).then(ok, erro);
      }
    };
    return q;
  }
  const empresas = () => banco.fornecedores.map((f) => ({ id: f.id, nome: f.nome_fantasia || f.nome_razao_social, razao: f.nome_razao_social, terceirizacao: f.terceirizacao, categoria: f.categoria || null, foto_url: f.foto_url || null, foto_path: f.foto_path || null, itens: banco.terceirizacao_itens.filter((i) => i.fornecedor_id === f.id && i.ativo).length }));
  const cliente = {
    auth: { getSession: async () => ({ data: { session: { access_token: "t", user: { id: "u1" } } } }), getUser: async () => ({ data: { user: { id: "u1", email: "a@b" } } }), signOut: async () => {}, onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: consulta,
    rpc: (nome, args) => ({ then: (ok, erro) => {
      window.__gravados.push({ rpc: nome, args });
      if(nome === "terceirizacao_empresas") return Promise.resolve({ data: empresas(), error: null }).then(ok, erro);
      if(nome === "terceirizacao_empresa_marcar"){ const f = banco.fornecedores.find((x) => x.id === args.p_fornecedor); if(f) f.terceirizacao = args.p_sim; return Promise.resolve({ data: null, error: null }).then(ok, erro); }
      if(nome === "terceirizacao_empresa_foto"){ const f = banco.fornecedores.find((x) => x.id === args.p_fornecedor); if(f){ f.foto_url = args.p_url; f.foto_path = args.p_path; } return Promise.resolve({ data: null, error: null }).then(ok, erro); }
      if(nome === "funcionario_contexto") return Promise.resolve({ data: { ativo: true, administrador_legado: true }, error: null }).then(ok, erro);
      return Promise.resolve({ data: [], error: null }).then(ok, erro);
    } }),
    storage: { from: () => ({ upload: async (p) => { window.__gravados.push({ upload: p }); return { error: null }; }, getPublicUrl: (p) => ({ data: { publicUrl: "https://fixture/" + p } }), remove: async () => ({ error: null }) }) }
  };
  window.supabase = { createClient: () => cliente };
})();`;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erros = []; page.on("pageerror", (e) => { if (!/lucide/.test(e.message)) erros.push(e.message); });
  await page.addInitScript(() => { sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", "e1"); });
  await page.route("**/*", (rota) => {
    const url = rota.request().url();
    if (url.includes("supabase-js")) return rota.fulfill({ contentType: "text/javascript", body: mock });
    if (url.startsWith(BASE)) {
      const f = path.join(raiz, decodeURIComponent(new URL(url).pathname));
      if (!fs.existsSync(f)) return rota.fulfill({ status: 404, body: "" });
      return rota.fulfill({ contentType: ({ ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css" })[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
    }
    if (url.startsWith("https://fixture/")) return rota.fulfill({ status: 404, body: "" });
    return rota.abort();
  });
  await page.goto(BASE + "Modulos/Comercial/Terceirizacoes/terceirizacoes.html");
  await page.waitForSelector(".tz-empresa", { timeout: 15000 });
  assert.equal(await page.locator(".tz-empresa").count(), 1, "só as empresas marcadas como terceirização");
  assert.match(await page.textContent(".tz-empresa"), /Lounge Parceira[\s\S]*1 item/);
  assert.match(await page.textContent("#tzListaItens"), /Sofá Veludo Rosa/);
  assert.match(await page.textContent("#tzListaItens"), /60%/, "margem (500 - 200) / 500");
  const cab = await page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const h = r("#tzCabecalho h2"), b = r("#tzBusca"), e = r("#tzNovaEmpresa"), i = r("#tzNovoItem"); return { h, b, e, i }; });
  assert.ok(cab.b.right < cab.h.left && cab.e.left > cab.h.right && cab.i.left > cab.h.right, "pesquisa à esquerda e botões à direita do título");
  assert.ok(Math.abs((cab.b.top + cab.b.height / 2) - (cab.h.top + cab.h.height / 2)) < 12 && Math.abs((cab.i.top + cab.i.height / 2) - (cab.h.top + cab.h.height / 2)) < 12, "na mesma linha do título");
  assert.equal(await page.locator(".tz-empresa .tz-avatar").count(), 1, "avatar da empresa na lista");
  console.log("ok 1 - empresas de terceirização e os itens com custo, valor e margem");

  await page.click("#tzNovaEmpresa");
  await page.waitForSelector("[data-marcar='f2']");
  await page.click("[data-marcar='f2']");
  await page.waitForFunction(() => document.querySelectorAll(".tz-empresa").length === 2);
  assert.ok(await page.evaluate(() => window.__gravados.some((g) => g.rpc === "terceirizacao_empresa_marcar" && g.args.p_fornecedor === "f2" && g.args.p_sim === true)));
  assert.match(await page.textContent("#tzEmpresaNome"), /Tendas Brasil SA/, "a empresa nova fica escolhida");
  await page.waitForSelector("#tzDialog[open] #tzFotoEmp", { state: "attached" });
  assert.match(await page.textContent("#tzDialog"), /precisa de foto/, "empresa de locação de móveis sem foto pede a foto");
  await page.setInputFiles("#tzFotoEmp", { name: "logo.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });
  await page.click("#tzDialogRodape [data-bt='1']");
  await page.waitForFunction(() => window.__gravados.some((g) => g.rpc === "terceirizacao_empresa_foto" && g.args.p_fornecedor === "f2" && /^e1\/fornecedores\/f2-/.test(g.args.p_path)));
  await page.waitForFunction(() => document.querySelector("#tzEmpresaFoto [data-trocar-foto]")?.textContent === "Trocar foto");
  console.log("ok 2 - fornecedor do cadastro vira empresa de terceirização");

  await page.click("#tzNovoItem");
  await page.waitForURL(/sublocacao-item\.html\?novo=1&empresa=f2/);
  await page.waitForFunction(() => document.querySelector("[name=fornecedor_id]")?.value === "f2");
  assert.equal(await page.locator(".item-tab").count(), 2, "abas Dados Gerais e Galeria");
  assert.equal(await page.locator("[name=exibir_site]").count(), 1, "campo exibir no catálogo/site");
  for (const interno of ["setor_estoque", "grupo_separacao", "referencia"]) assert.equal(await page.locator("[name=" + interno + "]").count(), 0, interno + " fica de fora");
  await page.click("#btnSalvarItemDetalhes");
  await page.waitForFunction(() => /especificação/i.test(document.body.innerText));
  await page.fill("[name=produto]", "Tenda Cristal 10x10");
  await page.fill("[name=quantidade]", "3");
  await page.fill("[name=custo]", "1.500,00");
  await page.fill("[name=valor_locacao]", "3000");
  await page.fill("[name=largura]", "10"); await page.fill("[name=altura]", "3"); await page.fill("[name=profundidade]", "10");
  assert.equal(await page.inputValue("#subVolume"), "300,000"); assert.equal(await page.textContent("#subMargem"), "50%");
  await page.selectOption("[name=exibir_site]", "true");
  await page.click("#btnSalvarItemDetalhes");
  await page.waitForFunction(() => window.__gravados.some((g) => g.tabela === "terceirizacao_itens" && g.acao === "insert"));
  const ins = await page.evaluate(() => window.__gravados.find((g) => g.tabela === "terceirizacao_itens" && g.acao === "insert").payload);
  assert.equal(ins.fornecedor_id, "f2"); assert.equal(ins.quantidade, 3); assert.equal(ins.custo, 1500); assert.equal(ins.valor_locacao, 3000); assert.equal(ins.largura, 10); assert.equal(ins.exibir_site, true);
  await page.waitForURL(/sublocacao-item\.html\?id=novo/);
  console.log("ok 3 - item novo na página do item: nome obrigatório, valores com vírgula, volume, margem, exibir no site");

  await page.click("#btnVoltarItens");
  await page.waitForURL(/terceirizacoes\.html\?empresa=f2/);
  await page.waitForSelector(".tz-empresa");
  await page.click("[data-empresa='f1']");
  await page.click("[data-item='t1']");
  await page.waitForURL(/sublocacao-item\.html\?id=t1/);
  await page.waitForFunction(() => /Sofá Veludo Rosa/.test(document.getElementById("itemDetailTitle").textContent));
  assert.equal(await page.inputValue("[name=largura]"), "2,2");
  if (process.env.SHOT_ITEM) await page.screenshot({ path: process.env.SHOT_ITEM, fullPage: true });
  await page.fill("[name=valor_locacao]", "550");
  await page.click("[data-item-tab=galeria]");
  assert.equal(await page.locator("[data-item-panel=galeria] .item-gallery-photo-card").count(), 5, "2 de detalhe + 3 ambientadas");
  await page.setInputFiles("[data-slot-input=galeria_01]", { name: "evento.jpg", mimeType: "image/jpeg", buffer: Buffer.from("ffd8ffe0", "hex") });
  await page.setInputFiles("#sub3DInput", { name: "sofa.glb", mimeType: "model/gltf-binary", buffer: Buffer.from("676c544602000000", "hex") });
  assert.match(await page.textContent("#sub3DStatus"), /Novo/);
  if (process.env.SHOT_GAL) await page.screenshot({ path: process.env.SHOT_GAL, fullPage: true });
  await page.click("#btnSalvarItemDetalhes");
  await page.waitForFunction(() => window.__gravados.some((g) => g.tabela === "terceirizacao_itens" && g.acao === "update" && g.payload.modelo_3d_url), null, { timeout: 30000 });
  const g = await page.evaluate(() => ({ dados: window.__gravados.find((x) => x.acao === "update" && x.payload.valor_locacao === 550), extra: window.__gravados.find((x) => x.acao === "update" && x.payload.modelo_3d_url), ups: window.__gravados.filter((x) => x.upload).map((x) => x.upload) }));
  assert.ok(g.dados, "dados gravados");
  assert.ok(g.extra.payload.fotos.galeria_01.path.startsWith("e1/terceirizados/t1/galeria_01-"), "foto da galeria na pasta do item");
  assert.ok(g.ups.some((p) => /^e1\/terceirizados\/t1\/modelo-\d+\.glb$/.test(p)), "GLB na pasta do item");
  console.log("ok 4 - item existente: galeria (5 fotos) e modelo 3D gravados na pasta do item");

  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 392), "celular sem rolagem lateral da página");
  await page.goto(BASE + "Modulos/Comercial/Terceirizacoes/terceirizacoes.html"); await page.waitForSelector(".tz-empresa");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 392), "lista sem rolagem lateral no celular");
  assert.deepStrictEqual(erros, []);
  await browser.close();
  console.log("todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });
