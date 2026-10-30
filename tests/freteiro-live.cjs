// Out/2026 — App do Freteiro contra o banco REAL (RUN_FRETEIRO_LIVE=1), no celular:
// cadastro pelo app → "Cadastro em análise" sem nenhum frete → a logística aprova na tela Freteiros → o frete anunciado
// sozinho aparece com o valor total → aceitar vira o caminhão programado das etapas (o carregamento libera) →
// desistir devolve o frete ao app. Precisa de um frete anunciado em aberto (pedido sem caminhão próprio).
// Tudo o que o teste cria é apagado no fim.
if (process.env.RUN_FRETEIRO_LIVE !== "1") { console.log("pulado (RUN_FRETEIRO_LIVE=1 para rodar)"); process.exit(0); }
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://localhost:5519/";
const FONE = "24999880011";

function sql(q) {
  const arq = path.join(os.tmpdir(), "fr-" + Date.now() + Math.random().toString(36).slice(2) + ".sql");
  fs.writeFileSync(arq, "set role postgres;\n" + q);
  try {
    const out = execSync('npx supabase db query --linked -f "' + arq + '"', { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const j = JSON.parse(out.slice(out.indexOf("{")));
    return j.rows || [];
  } finally { fs.unlinkSync(arq); }
}
function servidor() {
  const http = require("http");
  const tipos = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".png": "image/png" };
  return http.createServer((req, res) => {
    const f = path.join(raiz, decodeURIComponent(new URL(req.url, BASE).pathname));
    if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": tipos[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
  }).listen(5519);
}
function limpar() {
  sql(`delete from operacao_etapa_caminhoes where caminhao_id in (select id from caminhoes where freteiro_id in (select id from frete_freteiros where telefone = '${FONE}'));
       update frete_anuncios set status = 'aberto', freteiro_id = null, aceito_em = null where freteiro_id in (select id from frete_freteiros where telefone = '${FONE}') and status = 'aceito';
       update frete_anuncios set freteiro_id = null where freteiro_id in (select id from frete_freteiros where telefone = '${FONE}');
       delete from frete_viagens where caminhao_id in (select id from caminhoes where freteiro_id in (select id from frete_freteiros where telefone = '${FONE}'));
       create temp table _f on commit drop as select fornecedor_id, caminhao_id from frete_freteiros where telefone = '${FONE}';
       delete from app_sessoes where freteiro_id in (select id from frete_freteiros where telefone = '${FONE}');
       update frete_freteiros set caminhao_id = null, fornecedor_id = null where telefone = '${FONE}';
       delete from caminhoes where id in (select caminhao_id from _f);
       delete from fornecedores where id in (select fornecedor_id from _f);
       delete from frete_freteiros where telefone = '${FONE}';`);
}

(async () => {
  limpar();
  sql(`select frete_anuncios_sincronizar(id) from empresas where id = gs_empresa_dona();`);
  const [an] = sql(`select a.id, a.valor, a.m3 from frete_anuncios a where a.status = 'aberto' and a.empresa_id = gs_empresa_dona() order by a.data limit 1;`);
  assert.ok(an, "precisa de um frete anunciado em aberto (pedido sem caminhão próprio)");
  const srv = servidor();
  const browser = await chromium.launch({ channel: "msedge" });
  const erros = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const m = await ctx.newPage();
    m.on("pageerror", (e) => erros.push(e.message));
    await m.goto(BASE + "Modulos/Chiavari/Fretes/freteiro.html");
    await m.waitForSelector("#eCriar");
    assert.ok(/Bem-vindo, freteiro/.test(await m.innerText("body")), "tela de entrada do freteiro");
    await m.click("#eCriar");
    await m.fill("#cNome", "Freteiro Teste Auto"); await m.fill("#cFone", "(24) 99988-0011");
    await m.fill("#cSenha", "123456"); await m.fill("#cPix", "teste@pix");
    await m.fill("#cModelo", "Iveco Daily"); await m.fill("#cPlaca", "FRT1E23"); await m.fill("#cCor", "baú");
    await m.click("#cSalvar");
    await m.waitForFunction(() => /Informe quantos m³/.test(document.body.innerText), null, { timeout: 8000 });
    await m.fill("#cCap", String(Math.max(30, Math.ceil(Number(an.m3) + 1))));
    await m.click("#cSalvar");
    await m.waitForFunction(() => /Cadastro em análise/.test(document.body.innerText), null, { timeout: 20000 });
    assert.strictEqual(await m.locator("[data-i]").count(), 0, "em análise não vê frete");
    console.log("ok 1 - cadastro pelo app (capacidade obrigatória) e 'Cadastro em análise' sem nenhum frete");

    // a logística aprova (mesma função da tela Freteiros), como o administrador da empresa
    sql(`do $$ declare adm uuid; fid uuid; begin
           select user_id into adm from usuarios_empresas where empresa_id = gs_empresa_dona() and lower(coalesce(role,'')) in ('admin','owner') limit 1;
           perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
           select id into fid from frete_freteiros where telefone = '${FONE}';
           perform frete_freteiro_status(gs_empresa_dona(), fid, 'aprovado', null);
         end $$;`);
    const [cam] = sql(`select k.codigo, k.capacidade_m3 from caminhoes k join frete_freteiros f on f.caminhao_id = k.id where f.telefone = '${FONE}';`);
    assert.ok(/^FR\d+$/.test(cam.codigo), "aprovar cria o caminhão do freteiro: " + cam.codigo);
    await m.reload();
    const valorTxt = Number(an.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");
    const cartao = m.locator("[data-i]").filter({ hasText: valorTxt.replace("R$", "").trim() }).first();
    await cartao.waitFor({ timeout: 20000 });
    console.log("ok 2 - aprovado: o frete anunciado aparece com o valor total (" + valorTxt + "), caminhão " + cam.codigo);
    await cartao.click();
    const det = await m.innerText("body");
    assert.ok(/Valor total do frete/.test(det) && /no total/.test(det) && !/por trecho/.test(det), "detalhe mostra o total, sem km por trecho");
    await m.click("#btnAceitar");
    await m.waitForFunction(() => /Frete aceito!/.test(document.body.innerText), null, { timeout: 15000 });
    const [ac] = sql(`select a.status, (select count(*) from operacao_etapa_caminhoes ec where ec.caminhao_id = f.caminhao_id and ec.etapa_id = any(a.etapas)) n,
                             operacao_tem_caminhao_programado(a.pedido_id) prog
                        from frete_anuncios a join frete_freteiros f on f.id = a.freteiro_id where a.id = '${an.id}';`);
    assert.strictEqual(ac.status, "aceito"); assert.ok(Number(ac.n) >= 1, "caminhão do freteiro nas etapas"); assert.strictEqual(ac.prog, true);
    console.log("ok 3 - aceitou: o caminhão dele vira o caminhão programado das etapas (carregamento liberado)");
    await m.click("text=Ver meus fretes");
    await m.locator("[data-a]").first().waitFor({ timeout: 10000 }); await m.locator("[data-a]").first().click();
    m.once("dialog", (d) => d.accept());
    await m.click("#btnDesistir");
    await m.waitForFunction(() => /desistiu do frete/i.test(document.body.innerText) || /Fretes anunciados/.test(document.body.innerText), null, { timeout: 15000 });
    const [ds] = sql(`select status, freteiro_id from frete_anuncios where id = '${an.id}';`);
    assert.strictEqual(ds.status, "aberto"); assert.strictEqual(ds.freteiro_id, null);
    const larg = await m.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(larg <= 391, "sem rolagem lateral no celular: " + larg);
    console.log("ok 4 - desistir devolve o frete ao app; celular sem rolagem lateral");
    assert.deepStrictEqual(erros.filter((e) => !/getUserMedia|NotAllowed|camera|Permission|google/i.test(e)), []);
    console.log("todos os testes passaram");
  } finally {
    await browser.close(); srv.close(); limpar();
  }
})().catch((e) => { console.error(e); try { limpar(); } catch (_) {} process.exit(1); });
