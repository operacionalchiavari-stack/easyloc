// Teste opt-in (RUN_COFRE_LIVE=1) das telas Cadastro de Clientes e Cadastro de Locais com o cofre, no navegador,
// contra o banco e a Edge Function reais. Empresa e usuário temporários, apagados no fim.
// Confere: salvar grava o CPF/CNPJ cifrado; a lista mostra só a máscara; o campo abre vazio com a máscara de dica;
// "Ver" mostra o número; editar outro campo não mexe no documento; buscar pelo CPF inteiro acha o cadastro;
// CPF repetido é recusado.
require("dotenv").config({ quiet: true });
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");
const { randomUUID } = require("node:crypto");
const fs = require("fs"), path = require("path"), assert = require("node:assert/strict");
const raiz = path.resolve(__dirname, ".."), BASE = "http://localhost:5599/";
const tipos = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".jpg": "image/jpeg", ".webp": "image/webp" };

(async () => {
  if (process.env.RUN_COFRE_LIVE !== "1") throw Error("Defina RUN_COFRE_LIVE=1");
  const url = process.env.SUPABASE_URL;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const client = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const check = (r) => { if (r.error) throw Error(r.error.message); return r.data; };
  const sfx = randomUUID().slice(0, 8), senha = "Temp-" + randomUUID() + "!";
  let empresa, user, browser;
  const erros = [];
  try {
    empresa = check(await admin.from("empresas").insert({ nome: "TESTE TELAS COFRE " + sfx }).select("id").single()).id;
    user = check(await admin.auth.admin.createUser({ email: "cofretelas-" + sfx + "@example.invalid", password: senha, email_confirm: true })).user;
    check(await admin.from("usuarios").insert({ id: user.id, empresa_id: empresa, nome: "Equipe Cofre" }));
    check(await admin.from("usuarios_empresas").insert({ user_id: user.id, empresa_id: empresa, role: "admin" }));
    const sessao = check(await client.auth.signInWithPassword({ email: user.email, password: senha })).session;

    browser = await chromium.launch({ channel: "msedge" });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route("**/*", (rota) => {
      const u = new URL(rota.request().url());
      if (u.origin + "/" !== BASE) return rota.continue();
      const arq = path.join(raiz, decodeURIComponent(u.pathname));
      if (!fs.existsSync(arq) || fs.statSync(arq).isDirectory()) return rota.fulfill({ status: 404, body: "" });
      return rota.fulfill({ contentType: tipos[path.extname(arq)] || "application/octet-stream", body: fs.readFileSync(arq) });
    });
    await ctx.addInitScript(() => { const guardar = (m) => { (window.__alertas = window.__alertas || []).push(String(m)); }; Object.defineProperty(window, "alerta", { configurable: true, get(){ return guardar; }, set(){} }); });
    await ctx.addInitScript(([s, e]) => { localStorage.setItem("easyloc-auth", s); sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", e); }, [JSON.stringify(sessao), empresa]);
    const abrir = async (rota) => {
      const page = await ctx.newPage();
      page.on("pageerror", (e) => erros.push(rota + ": " + e.message));
      page.on("dialog", (d) => d.accept());
      await page.goto(BASE + rota, { waitUntil: "domcontentloaded" });
      return page;
    };

    /* ---------- Clientes ---------- */
    const pc = await abrir("Modulos/Comercial/CadastroClientes/cadastro-clientes.html");
    await pc.waitForFunction(() => typeof window.clientes_openAdd === "function" && window.EasyLocCofre && window.EasyLocPermissions?.hasPermission);
    await pc.waitForTimeout(1200);
    const preencherCliente = async (nome, cpf, email) => {
      await pc.evaluate(() => window.clientes_openAdd());
      await pc.fill("#nome", nome);
      await pc.selectOption("#tipoPessoa", { label: "Pessoa Física" }).catch(() => {});
      await pc.fill("#cpfCnpj", cpf);
      await pc.fill("#telefone", "(24) 99999-9999");
      await pc.fill("#email", email);
      await pc.evaluate(() => { const e = document.getElementById("endereco"); if (e) e.value = "Rua Teste, 10"; window.enderecoSelecionadoGoogle = true; });
      await pc.fill("#numeroEndereco", "10").catch(() => {});
      await pc.fill("#pontoReferencia", "Perto").catch(() => {});
      await pc.evaluate(() => document.querySelectorAll(".tag-group").forEach((g) => g.querySelector(".tag")?.classList.add("selected")));
    };
    await preencherCliente("Cliente Tela " + sfx, "529.982.247-25", "cli-" + sfx + "@example.invalid");
    await pc.evaluate(() => window.clientes_salvar());
    await pc.waitForFunction(() => document.body.innerText.includes("•••.•••.•••-25"), null, { timeout: 20000 }).catch(() => {});
    const linha = check(await admin.from("clientes_empresas").select("id,cpf_cnpj,cpf_cnpj_hash,cofre_mascaras").eq("empresa_id", empresa).maybeSingle());
    assert.ok(linha, "cliente não foi salvo: " + JSON.stringify(await pc.evaluate(() => window.__alertas)) + " " + erros.join(" | "));
    assert.match(linha.cpf_cnpj, /^cofre:v1:/); assert.match(linha.cpf_cnpj_hash, /^[0-9a-f]{64}$/); assert.equal(linha.cofre_mascaras.cpf_cnpj, "•••.•••.•••-25");
    const tabela = await pc.textContent("#clientTable, table");
    assert.ok(tabela.includes("•••.•••.•••-25") && !tabela.includes("52998224725") && !tabela.includes("cofre:"), "lista mostra só a máscara");
    console.log("ok 1 - Clientes: salvar grava o CPF cifrado e a lista mostra só a máscara");

    // abrir: campo vazio com a máscara de dica, "Ver" mostra o número
    await pc.evaluate((id) => window.clientes_abrirDetalhesPorIdOuNome({ id }), linha.id);
    await pc.waitForFunction(() => document.querySelector("#cpfCnpj")?.dataset.cofreProtegido === "1");
    assert.equal(await pc.inputValue("#cpfCnpj"), "");
    assert.match(await pc.getAttribute("#cpfCnpj", "placeholder"), /•••\.•••\.•••-25.*protegido/);
    await pc.click(".cofre-ver");
    await pc.waitForFunction(() => document.querySelector("#cpfCnpj").value === "52998224725");
    console.log("ok 2 - Clientes: o campo abre com a máscara e \"Ver\" mostra o CPF");

    // editar outro campo sem tocar no CPF mantém o documento
    await pc.evaluate((id) => window.clientes_abrirDetalhesPorIdOuNome({ id }), linha.id);
    await pc.waitForFunction(() => document.querySelector("#cpfCnpj")?.dataset.cofreProtegido === "1");
    await pc.waitForTimeout(1500);
    await pc.evaluate(() => window.clientes_enableEdit());
    await pc.waitForFunction(() => !document.getElementById("telefone").readOnly);
    await pc.fill("#telefone", "(24) 98888-7777");
    await pc.evaluate(() => window.clientes_salvar());
    await pc.waitForTimeout(2500);
    const depois = check(await admin.from("clientes_empresas").select("cpf_cnpj,telefone").eq("id", linha.id).single());
    assert.equal(depois.cpf_cnpj, linha.cpf_cnpj); assert.match(depois.telefone, /98888/);
    console.log("ok 3 - Clientes: editar outro campo não mexe no CPF");

    // buscar pelo CPF inteiro
    await pc.evaluate(() => window.clientes_closeModal?.());
    await pc.click("#searchInput");
    await pc.fill("#searchInput", "52998224725");
    await pc.evaluate(() => window.aplicarFiltros());
    await pc.waitForTimeout(4000); if (process.env.DEBUG_COFRE) console.log(await pc.evaluate(() => JSON.stringify({ b: buscaDocHash, cache: (window.clientesCache||[]).map(c=>[c.nome_razao,c.cpf_cnpj_hash&&c.cpf_cnpj_hash.slice(0,8)]), t: document.querySelector("#clientTable, table").innerText.slice(0,300) })));
    await pc.waitForFunction(() => document.querySelector("#clientTable, table").innerText.includes("Cliente Tela"), null, { timeout: 10000 });
    await pc.fill("#searchInput", "11144477735");
    await pc.evaluate(() => window.aplicarFiltros());
    await pc.waitForTimeout(1500);
    assert.ok(!(await pc.textContent("#clientTable, table")).includes("Cliente Tela"));
    await pc.fill("#searchInput", ""); await pc.evaluate(() => window.aplicarFiltros());
    console.log("ok 4 - Clientes: buscar pelo CPF inteiro acha o cadastro (e outro CPF não)");

    // CPF repetido
    await preencherCliente("Outro Cliente " + sfx, "529.982.247-25", "outro-" + sfx + "@example.invalid");
    await pc.evaluate(() => window.clientes_salvar());
    await pc.waitForTimeout(2500);
    assert.equal(check(await admin.from("clientes_empresas").select("id").eq("empresa_id", empresa)).length, 1, "CPF repetido não pode salvar");
    console.log("ok 5 - Clientes: CPF repetido é recusado pelo índice");

    /* ---------- Locais ---------- */
    // Local novo pede a distância do galpão (Google), que a empresa temporária não tem: o local nasce já cifrado,
    // pela mesma função que a tela usa, e a tela é testada nele.
    const prot = async (doc) => { const r = await client.functions.invoke("cadastro-protegido", { body: { action: "proteger", tabela: "local", empresa_id: empresa, documento: doc } }); if (r.error) throw Error("proteger falhou"); return r.data; };
    const d1 = await prot("11222333000181");
    const locId = check(await admin.from("locais_empresas").insert({ empresa_id: empresa, nome_razao: "Espaço Tela " + sfx, tipo_pessoa: "PJ", status: "Ativo",
      telefone: "24999999999", email: "loc-" + sfx + "@example.invalid", endereco: "Rua Teste, 20", numero_endereco: "20", ponto_referencia: "Perto",
      latitude: -22.5, longitude: -44.1, distancia_galpao_km: 10, distancia_galpao_texto: "10 km", distancia_calculada_em: new Date().toISOString(),
      tags: { tipo: "Casa de Festa" }, cpf_cnpj: d1.cpf_cnpj, cpf_cnpj_hash: d1.cpf_cnpj_hash, cofre_mascaras: { cpf_cnpj: d1.mascara } }).select("id").single()).id;
    const pl = await abrir("Modulos/Comercial/CadastroLocais/cadastro-locais.html");
    await pl.waitForFunction(() => typeof window.Locais_openAdd === "function" && window.EasyLocCofre);
    await pl.waitForFunction(() => document.querySelector("table")?.innerText.includes("Espaço Tela"), null, { timeout: 20000 });
    const tabelaL = await pl.textContent("table");
    assert.ok(tabelaL.includes("••.•••.•••/••••-81") && !tabelaL.includes("11222333000181") && !tabelaL.includes("cofre:"), "lista de locais mostra só a máscara");
    await pl.evaluate((id) => window.Locais_abrirDetalhesPorIdOuNome({ id }), locId);
    await pl.waitForFunction(() => document.querySelector("#locaisCpfCnpj")?.dataset.cofreProtegido === "1");
    assert.equal(await pl.inputValue("#locaisCpfCnpj"), "");
    await pl.click(".cofre-ver");
    await pl.waitForFunction(() => document.querySelector("#locaisCpfCnpj").value === "11222333000181");
    console.log("ok 6 - Locais: a lista mostra só a máscara e \"Ver\" mostra o CNPJ");
    // trocar o CNPJ pela tela grava o novo cifrado
    await pl.evaluate((id) => window.Locais_abrirDetalhesPorIdOuNome({ id }), locId);
    await pl.waitForTimeout(1500);
    await pl.evaluate(() => window.Locais_enableEdit());
    await pl.waitForFunction(() => !document.getElementById("locaisTelefone").readOnly);
    await pl.fill("#locaisCpfCnpj", "45.997.418/0001-53");
    await pl.evaluate(() => { window.enderecoSelecionadoGoogle = true; document.querySelectorAll(".tag-group").forEach((g) => { if (!g.querySelector(".tag.selected")) g.querySelector(".tag")?.classList.add("selected"); }); });
    await pl.evaluate(() => window.Locais_salvar());
    await pl.waitForTimeout(3000);
    const loc = check(await admin.from("locais_empresas").select("cpf_cnpj,cpf_cnpj_hash,cofre_mascaras").eq("id", locId).single());
    assert.notEqual(loc.cpf_cnpj, d1.cpf_cnpj, "CNPJ novo não foi gravado: " + JSON.stringify(await pl.evaluate(() => window.__alertas)));
    assert.match(loc.cpf_cnpj, /^cofre:v1:/); assert.equal(loc.cofre_mascaras.cpf_cnpj, "••.•••.•••/••••-53");
    assert.equal(loc.cpf_cnpj_hash, (await prot("45997418000153")).cpf_cnpj_hash);
    console.log("ok 7 - Locais: trocar o CNPJ pela tela grava o novo, cifrado, com máscara e índice");

    assert.deepEqual(erros, []);
    console.log("OK - telas de clientes e locais com o cofre");
  } finally {
    if (browser) await browser.close();
    if (empresa) { await admin.from("seguranca_eventos").delete().eq("empresa_id", empresa); await admin.from("clientes_empresas").delete().eq("empresa_id", empresa); await admin.from("locais_empresas").delete().eq("empresa_id", empresa); }
    if (user) { await admin.from("usuarios_empresas").delete().eq("user_id", user.id); await admin.from("usuarios").delete().eq("id", user.id); await admin.auth.admin.deleteUser(user.id); }
    if (empresa) await admin.from("empresas").delete().eq("id", empresa);
  }
})().catch((e) => { console.error(e); process.exit(1); });
