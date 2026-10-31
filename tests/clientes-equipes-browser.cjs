// Equipes de clientes (out/2026): criar equipe no Cadastro de Clientes (titular, pessoas, papéis), ver as equipes no
// cadastro do cliente e, no pedido, escolher de qual equipe ele é (0 equipes = nada; 1 = sozinha; 2+ = obrigatório).
// Uso: node tests/clientes-equipes-browser.cjs
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("node:assert/strict");
const base = "http://localhost:5599/";

function mock(banco) {
  window.__CONTEXT = { empresa_id: "e1" };
  window.aguardarContexto = async () => window.__CONTEXT;
  window.hasPermission = () => true;
  window.lucide = { createIcons() {} };
  window.__banco = banco; window.__gravados = [];
  let seq = 0;
  window.supabaseClient = {
    from(t) {
      let linhas = (window.__banco[t] || []).slice(), single = false, op = null, row = null;
      const filtros = [];
      const q = {
        select() { return q; },
        eq(k, v) { filtros.push([k, v]); linhas = linhas.filter((l) => l[k] === undefined || String(l[k]) === String(v)); return q; },
        in(k, vs) { filtros.push([k, vs]); linhas = linhas.filter((l) => vs.includes(l[k])); return q; },
        order() { return q; }, range(a, b) { linhas = linhas.slice(a, b + 1); return q; }, limit() { return q; },
        ilike() { return q; }, or() { return q; }, gte() { return q; }, lte() { return q; }, neq() { return q; }, is() { return q; },
        single() { single = true; return q; }, maybeSingle() { single = true; return q; },
        insert(r) { op = "insert"; row = r; return q; }, update(r) { op = "update"; row = r; return q; },
        upsert(r) { op = "upsert"; row = r; return q; }, delete() { op = "delete"; return q; },
        then(o, f) {
          let data = single ? linhas[0] || null : linhas;
          if (op) {
            window.__gravados.push({ t, op, row, filtros });
            const b = (window.__banco[t] = window.__banco[t] || []);
            if (op === "insert") { const nova = { ...row, id: row.id || t + "-" + (++seq) }; b.push(nova); data = single ? nova : [nova]; }
            if (op === "upsert") (Array.isArray(row) ? row : [row]).forEach((r) => { const i = b.findIndex((x) => x.equipe_id === r.equipe_id && x.cliente_id === r.cliente_id); if (i >= 0) b[i] = { ...b[i], ...r }; else b.push(r); });
            if (op === "update") linhas.forEach((l) => Object.assign(l, row));
            if (op === "delete") window.__banco[t] = b.filter((x) => !linhas.includes(x));
          }
          return Promise.resolve({ data, error: null }).then(o, f);
        }
      };
      return q;
    },
    async rpc(n, args) { (window.__rpcs = window.__rpcs || []).push([n, args]); const r = window.__banco["rpc:" + n]; return { data: r ? (args.p_equipe ? r.com : r.sem) : [], error: null }; }
  };
}

async function abrir(b, pagina, banco, html) {
  const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept());
  await p.addInitScript(mock, banco);
  await p.route("**/*", (r) => {
    const u = r.request().url();
    if (!u.startsWith(base)) return r.fulfill({ body: "", contentType: "text/javascript" });
    if (html && u === base + pagina) return r.fulfill({ body: html, contentType: "text/html" });
    const f = path.join(process.cwd(), decodeURIComponent(new URL(u).pathname));
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
    if (/(supabase|context|google|permissions|doisFatores)\.js/.test(u)) return r.fulfill({ body: "", contentType: "text/javascript" });
    r.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith(".html") ? "text/html" : f.endsWith(".css") ? "text/css" : "text/javascript" });
  });
  await p.goto(base + pagina);
  return { p, errs };
}

(async () => {
  const b = await chromium.launch({ channel: "msedge", headless: true });
  try {
    // ---------- Cadastro de Clientes > Equipes ----------
    const cli = (id, nome) => ({ id, empresa_id: "e1", nome_razao: nome, telefone: "24992842746", email: "c@x.com", status: "Ativo", tags: {} });
    const banco = {
      clientes_empresas: [cli("c1", "Kelly Khawam"), cli("c2", "Ana Assistente"), cli("c3", "Bia Sócia")],
      clientes_equipe_papeis: [{ id: "p1", empresa_id: "e1", nome: "Titular", ativo: true, ordem: 1 }, { id: "p2", empresa_id: "e1", nome: "Assistente", ativo: true, ordem: 2 }, { id: "p3", empresa_id: "e1", nome: "Sócio(a)", ativo: true, ordem: 3 }],
      clientes_equipes: [], clientes_equipe_membros: []
    };
    let { p, errs } = await abrir(b, "Modulos/Comercial/CadastroClientes/cadastro-clientes.html", banco);
    await p.waitForSelector("#clientTable tr");
    await p.click("#btnEquipesClientes");
    await p.waitForSelector("#clientesEquipesDialog[open] .ceq-vazio");
    await p.click("[data-ceq=nova]");
    await p.fill("#ceqNome", "Equipe Kelly");
    await p.fill("#ceqBuscaCliente", "Kelly Khawam"); await p.press("#ceqBuscaCliente", "Enter");
    await p.fill("#ceqBuscaCliente", "Ana Assistente"); await p.click("[data-ceq=add]");
    assert.equal(await p.locator(".ceq-membros li").count(), 2);
    assert.ok(await p.isChecked('input[name="ceqTitular"][value="c1"]'), "a primeira pessoa vira a titular");
    assert.equal(await p.inputValue("[data-ceq-papel='0']"), "p1", "titular com papel Titular");
    assert.equal(await p.inputValue("[data-ceq-papel='1']"), "p2", "as seguintes como Assistente");
    await p.selectOption("[data-ceq-papel='1']", "p3");
    await p.screenshot({ path: path.join(process.env.TMP || ".", "clientes-equipes.png") });
    await p.click("[data-ceq=salvar]");
    await p.waitForSelector(".ceq-tabela tbody tr");
    const g = await p.evaluate(() => window.__gravados);
    const eq = g.find((x) => x.t === "clientes_equipes" && x.op === "insert").row;
    assert.equal(eq.nome, "Equipe Kelly"); assert.equal(eq.titular_id, "c1");
    const ms = g.find((x) => x.t === "clientes_equipe_membros" && x.op === "upsert").row;
    assert.deepEqual(ms.map((m) => [m.cliente_id, m.papel_id]), [["c1", "p1"], ["c2", "p3"]]);
    assert.match(await p.textContent(".ceq-tabela tbody tr"), /Equipe Kelly[\s\S]*Kelly Khawam[\s\S]*2 pessoas/);
    console.log("ok 1 - criar equipe: titular, pessoas e papéis");

    // editar: tirar uma pessoa
    await p.click(".ceq-tabela tbody tr");
    await p.click("[data-ceq-rem='1']");
    await p.click("[data-ceq=salvar]");
    await p.waitForFunction(() => window.__gravados.some((x) => x.t === "clientes_equipe_membros" && x.op === "delete"));
    const del = await p.evaluate(() => window.__gravados.find((x) => x.t === "clientes_equipe_membros" && x.op === "delete").filtros);
    assert.deepEqual(del.find((f) => f[0] === "cliente_id")[1], ["c2"]);
    // sem titular / sem nome não salva
    await p.click("[data-ceq=nova]");
    await p.click("[data-ceq=salvar]");
    assert.equal(await p.locator("#ceqNome").count(), 1, "continua na edição (sem nome)");
    await p.click("[data-ceq=fechar]");
    console.log("ok 2 - editar equipe: tirar pessoa; sem nome não salva");

    // detalhes do cliente mostram as equipes
    await p.locator("#clientTable tr", { hasText: "Kelly Khawam" }).click();
    await p.waitForSelector("#clienteEquipesBloco .ceq-do-cliente li");
    assert.match(await p.textContent("#clienteEquipesBloco"), /Equipe Kelly[\s\S]*Titular · titular/);
    console.log("ok 3 - cadastro do cliente mostra as equipes dele", errs.length ? errs : "");
    await p.close();

    // ---------- Pedido: escolher a equipe ----------
    const htmlPedido = `<!doctype html><meta charset="utf-8"><div class="meta-item"><div class="autocomplete-wrapper"><input id="clienteInput"><input type="hidden" id="clienteIdHidden"></div></div>
      <script type="module">import { initEquipePedido } from "./js/pedido/pedido.equipe.mjs"; initEquipePedido({ supabase: window.supabaseClient }); window.__pronto = true;</script>`;
    const eqs = { e1: { id: "e1x", nome: "Equipe Kelly", ativo: true }, e2: { id: "e2x", nome: "Equipe Bia", ativo: true } };
    ({ p, errs } = await abrir(b, "teste-equipe.html", {
      clientes_equipe_membros: [
        { empresa_id: "e1", cliente_id: "c1", equipe_id: "e1x", papel: { nome: "Titular" }, equipe: eqs.e1 },
        { empresa_id: "e1", cliente_id: "c2", equipe_id: "e1x", papel: { nome: "Assistente" }, equipe: eqs.e1 },
        { empresa_id: "e1", cliente_id: "c2", equipe_id: "e2x", papel: { nome: "Assistente" }, equipe: eqs.e2 }
      ]
    }, htmlPedido));
    await p.waitForFunction(() => window.__pronto);
    const escolher = (id) => p.evaluate((id) => { document.getElementById("clienteIdHidden").value = id; document.getElementById("clienteInput").dispatchEvent(new CustomEvent("cliente-selecionado", { detail: { id } })); }, id);
    await escolher("c3");
    await p.waitForTimeout(200);
    assert.ok(await p.locator(".pedido-equipe").isHidden(), "sem equipe: nada aparece");
    assert.deepEqual(await p.evaluate(() => window.__pedidoEquipe()), { equipe_id: null, equipe_nome: null });
    assert.equal(await p.evaluate(() => window.__pedidoValidarEquipe()), "");
    await escolher("c1");
    await p.waitForSelector(".pedido-equipe:not([hidden])");
    assert.deepEqual(await p.evaluate(() => window.__pedidoEquipe()), { equipe_id: "e1x", equipe_nome: "Equipe Kelly" }, "uma equipe: escolhida sozinha");
    await escolher("c2");
    await p.waitForFunction(() => document.querySelectorAll("#pedidoEquipe option").length === 3);
    assert.match(await p.evaluate(() => window.__pedidoValidarEquipe()), /Escolha de qual equipe/);
    assert.ok(await p.locator(".pedido-equipe.is-invalido").count());
    await p.selectOption("#pedidoEquipe", "e2x");
    assert.equal(await p.evaluate(() => window.__pedidoValidarEquipe()), "");
    assert.deepEqual(await p.evaluate(() => window.__pedidoEquipe()), { equipe_id: "e2x", equipe_nome: "Equipe Bia" });
    // pedido salvo abre com a equipe que estava gravada
    await p.evaluate(() => { window.__PEDIDO_DADOS_ATUAL = { cliente_id: "c2", observacoes: { equipe_id: "e1x", equipe_nome: "Equipe Kelly" } }; });
    await escolher("c3"); await p.waitForTimeout(100); await escolher("c2");
    await p.waitForFunction(() => document.getElementById("pedidoEquipe")?.value === "e1x");
    console.log("ok 4 - pedido: sem equipe, uma equipe (sozinha), duas (obrigatório escolher), salva volta escolhida", errs.length ? errs : "");
    await p.close();

    // ---------- Pedido: BV da titular, dividir, negociar ----------
    const htmlBv = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="Modulos/Comercial/Pedidos/pedido.css">
      <div class="meta-item"><div class="autocomplete-wrapper"><input id="clienteInput" value="Ana Assistente"><input type="hidden" id="clienteIdHidden" value="c2"></div></div>
      <aside class="pedido-financeiro" style="width:380px"><section class="finance-card resumo-card"><h2>Resumo</h2></section></aside>
      <script type="module">import { initEquipePedido } from "./js/pedido/pedido.equipe.mjs"; import { initBvPedido } from "./js/pedido/pedido.bv.mjs";
        window.__PEDIDO_VALORES = { locacao_bv: 10000 };
        initEquipePedido({ supabase: window.supabaseClient }); initBvPedido({ supabase: window.supabaseClient });
        document.getElementById("clienteInput").dispatchEvent(new CustomEvent("cliente-selecionado", { detail: { id: "c2" } })); window.__pronto = true;</script>`;
    ({ p, errs } = await abrir(b, "teste-bv.html", {
      clientes_equipe_membros: [{ empresa_id: "e1", cliente_id: "c2", equipe_id: "e1x", papel: { nome: "Assistente" }, equipe: eqs.e1 }],
      "rpc:pedido_bv_regra": {
        com: { regra: { beneficiario_id: "c1", beneficiario_nome: "Kelly Khawam", pela_titular: true, equipe_nome: "Equipe Kelly", percentual: 15 }, registrado: null, membros: [{ cliente_id: "c1", nome: "Kelly Khawam" }, { cliente_id: "c2", nome: "Ana Assistente" }] },
        sem: { regra: { beneficiario_id: "c2", beneficiario_nome: "Ana Assistente", pela_titular: false, percentual: 5 }, registrado: null, membros: [] } }
    }, htmlBv));
    await p.waitForFunction(() => window.__pronto);
    await p.waitForSelector(".pedido-bv-card:not([hidden]) .pbv-div li");
    assert.match(await p.textContent(".pbv-regra"), /15%[\s\S]*titular[\s\S]*Kelly Khawam/);
    assert.match(await p.textContent(".pbv-total"), /15%.*1\.500,00/);
    const linhas = async () => p.$$eval(".pbv-div li", (l) => l.map((x) => x.textContent.replace(/\s+/g, " ").trim()));
    assert.match((await linhas())[0], /Kelly Khawam titular.*R\$\s1\.500,00/); assert.match((await linhas())[1], /Ana Assistente fez o pedido.*R\$\s0,00/);
    assert.equal(await p.evaluate(() => window.__pedidoBV()), null, "padrão: nada a gravar (o banco manda 100% para a titular)");
    // dividir 10 + 5
    await p.fill("[data-pbv-parte='0']", "10"); await p.dispatchEvent("[data-pbv-parte='0']", "change");
    assert.match(await p.textContent(".pbv-soma"), /Falta distribuir 5%/);
    assert.match(await p.evaluate(() => window.__pedidoValidarBV()), /soma 10%.*15%/);
    await p.fill("[data-pbv-parte='1']", "5"); await p.dispatchEvent("[data-pbv-parte='1']", "change");
    assert.match(await p.textContent(".pbv-soma"), /Divisão completa/);
    assert.equal(await p.evaluate(() => window.__pedidoValidarBV()), "");
    assert.deepEqual(await p.evaluate(() => window.__pedidoBV().partes.map((x) => [x.cliente_id, x.percentual])), [["c1", 10], ["c2", 5]]);
    assert.match((await linhas())[1], /R\$\s500,00/);
    await p.screenshot({ path: path.join(process.env.TMP || ".", "pedido-bv.png"), fullPage: true });
    // negociado neste pedido: 12%, volta tudo para a titular
    await p.check("[data-pbv=manual]");
    await p.fill("[data-pbv=pct]", "12"); await p.dispatchEvent("[data-pbv=pct]", "change");
    await p.fill("[data-pbv=obs]", "Negociado na reunião"); await p.dispatchEvent("[data-pbv=obs]", "change");
    assert.match(await p.textContent(".pbv-total"), /12%.*1\.200,00/);
    assert.deepEqual(await p.evaluate(() => window.__pedidoBV()), { manual: true, percentual: 12, observacao: "Negociado na reunião", partes: null });
    await p.fill("[data-pbv=pct]", ""); await p.dispatchEvent("[data-pbv=pct]", "change");
    await p.fill("[data-pbv=pct]", "150"); await p.dispatchEvent("[data-pbv=pct]", "change");
    assert.match(await p.evaluate(() => window.__pedidoValidarBV()), /entre 0 e 100/);
    await p.click("[data-pbv=padrao]");
    assert.equal(await p.evaluate(() => window.__pedidoBV()), null);
    console.log("ok 5 - BV: % da titular por padrão, dividir com quem fez, negociado no pedido, validações", errs.length ? errs : "");
  } finally { await b.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
