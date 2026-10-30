// Out/2026 — Fretes e Uber no banco, telas públicas contra o banco REAL (RUN_FRETES_LIVE=1):
// 1) a transportadora entra no Cadastro de Fretes, vê as viagens do caminhão dela (entrega e coleta, sem o valor do
//    sistema) e informa o valor; 2) um motorista se cadastra no App do Motorista, aceita a corrida, faz check-in e
//    check-out pelo link do QR. Tudo temporário é apagado no fim.
if (process.env.RUN_FRETES_LIVE !== "1") { console.log("pulado (RUN_FRETES_LIVE=1 para rodar)"); process.exit(0); }
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://localhost:5517/";
const EMP = "bb1260f0-99cd-4d17-ab9b-23c299b4c50b", FONE = "24999887766", LOGIN = "transp.teste.auto";

function sql(q) {
  const arq = path.join(os.tmpdir(), "fu-" + Date.now() + Math.random().toString(36).slice(2) + ".sql");
  fs.writeFileSync(arq, q);
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
  }).listen(5517);
}

function limpar() {
  sql(`delete from uber_vagas where obs = 'TESTE-AUTO';
       delete from uber_motoristas where telefone = '${FONE}';
       update caminhoes set fornecedor_id = null where fornecedor_id in (select id from fornecedores where portal_login = '${LOGIN}');
       delete from frete_viagens where fornecedor_id in (select id from fornecedores where portal_login = '${LOGIN}');
       delete from fornecedores where portal_login = '${LOGIN}';
       update empresa_logistica_regras set uber = coalesce(uber, '{}') - 'faixas' || jsonb_build_object('faixas', coalesce(uber->'faixas_antes_teste', uber->'faixas')) - 'faixas_antes_teste'
        where empresa_id = '${EMP}' and uber ? 'faixas_antes_teste';`);
}

(async () => {
  limpar();
  const [f] = sql(`insert into fornecedores (empresa_id, nome_razao_social, nome_fantasia, tipo, status, documento, portal_login, portal_ativo)
                   values ('${EMP}', 'Transportes Teste Automático LTDA', 'Transp Teste Auto', 'servicos', 'ativo', '', '${LOGIN}', true) returning id;`);
  sql(`insert into fornecedores_portal_senha values ('${f.id}', extensions.crypt('senha123', extensions.gen_salt('bf')));
       update caminhoes set fornecedor_id = '${f.id}' where empresa_id = '${EMP}' and fornecedor_id is null;
       insert into empresa_logistica_regras (empresa_id) values ('${EMP}') on conflict do nothing;
       update empresa_logistica_regras set uber = coalesce(uber, '{}') || jsonb_build_object('faixas_antes_teste', coalesce(uber->'faixas', '[]'), 'faixas', '[{"de":0,"ate":20,"valor":40},{"de":20,"ate":null,"valor":70}]'::jsonb) where empresa_id = '${EMP}';`);
  const [et] = sql(`select e.id from operacao_etapas e join operacao_etapa_caminhoes ec on ec.etapa_id = e.id where e.empresa_id = '${EMP}' and e.tipo = 'montagem' limit 1;`);
  const [vg] = sql(`insert into uber_vagas (empresa_id, etapa_id, pedido_id, quantidade, ida_volta, ponto_encontro, destino, km, valor, data, hora, obs)
                    select '${EMP}', e.id, e.pedido_id, 1, true, 'Galpão Chiavari', 'Local Teste', 15, 80, (now() at time zone 'America/Sao_Paulo')::date,
                           ((now() at time zone 'America/Sao_Paulo') + interval '30 minutes')::time, 'TESTE-AUTO' from operacao_etapas e where e.id = '${et.id}' returning id;`);
  const srv = servidor();
  const browser = await chromium.launch({ channel: "msedge" });
  const erros = [];
  try {
    // ---------------- transportadora
    const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    p.on("pageerror", (e) => erros.push(e.message));
    await p.goto(BASE + "Modulos/Chiavari/Fretes/fretes.html");
    await p.waitForSelector("#fpFormLogin");
    await p.fill("#fpUsuario", LOGIN); await p.fill("#fpSenha", "errada"); await p.click("#fpFormLogin button");
    await p.waitForFunction(() => /incorretos/.test(document.getElementById("fpErroLogin").textContent));
    console.log("ok 1 - senha errada recusada");
    await p.fill("#fpSenha", "senha123"); await p.click("#fpFormLogin button");
    await p.waitForSelector(".fp-viagem", { timeout: 20000 });
    const nViagens = await p.locator(".fp-viagem").count();
    const texto = await p.evaluate(() => document.body.innerText);
    assert.ok(nViagens >= 2 && /Entrega/.test(texto) && /Coleta/.test(texto), "viagens de entrega e coleta: " + nViagens);
    assert.ok(!/505,50/.test(texto), "não mostra o valor do sistema");
    console.log("ok 2 - transportadora vê " + nViagens + " viagens (entrega e coleta), sem o valor do sistema");
    const primeiro = p.locator("[data-valor]").first(), id = await primeiro.getAttribute("data-valor");
    await primeiro.fill("490"); await primeiro.press("Enter");
    await p.waitForFunction((n) => document.querySelectorAll(".fp-viagem").length === n - 1, nViagens);
    const [vf] = sql(`select valor_transportadora from frete_viagens where id = '${id}';`);
    assert.strictEqual(Number(vf.valor_transportadora), 490);
    await p.click('[data-aba="informadas"]');
    const informadas = await p.evaluate(() => document.body.innerText);
    assert.ok(/Informado R\$\s490,00/.test(informadas), "aba Informadas: " + informadas.slice(0, 400));
    console.log("ok 3 - valor informado (Enter) grava no banco e vai para Informadas");
    await p.reload(); await p.waitForSelector(".fp-viagem");
    console.log("ok 4 - recarregar mantém a sessão");
    await p.close();

    // ---------------- motorista (celular)
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const m = await ctx.newPage();
    m.on("pageerror", (e) => erros.push(e.message));
    // App do Motorista com o visual de sempre (mapa e rota); só o cadastro e o check-in/out pelo QR são novos
    await m.goto(BASE + "Modulos/Chiavari/Uber/motorista.html");
    await m.click("#eCriar");
    await m.fill("#cNome", "Motorista Teste Auto"); await m.fill("#cFone", "(24) 99988-7766");
    await m.fill("#cSenha", "123456"); await m.fill("#cPix", "teste@pix");
    await m.fill("#cModelo", "Onix"); await m.fill("#cPlaca", "ABC1D23");
    await m.click("#cSalvar");
    const cartao = m.locator("[data-i]").filter({ hasText: /80,00/ }).first();
    await cartao.waitFor({ timeout: 20000 });
    assert.ok(await m.locator("#mapa").count(), "o mapa continua na tela");
    console.log("ok 5 - cadastro próprio e corrida disponível (R$ 80,00 = 2 trechos de R$ 40)");
    await cartao.click();
    await m.click("#btnAceitar");
    await m.waitForFunction(() => /Corrida aceita!/.test(document.body.innerText), null, { timeout: 15000 });
    const [cor] = sql(`select id, status from uber_corridas where vaga_id = '${vg.id}';`);
    assert.strictEqual(cor.status, "confirmada");
    console.log("ok 6 - aceitou: corrida confirmada");
    const [cod1] = sql(`select uber_codigo_qr('${vg.id}', floor(extract(epoch from now())/60)::bigint) c;`);
    await m.goto(BASE + "Modulos/Chiavari/Uber/motorista.html?c=" + vg.id + "." + cod1.c);
    await m.waitForFunction(() => /Em andamento/.test(document.body.innerText), null, { timeout: 20000 });
    console.log("ok 7 - check-in pelo link do QR");
    sql(`update uber_corridas set checkin_em = now() - interval '2 hours' where id = '${cor.id}';`);
    await m.reload();
    await m.locator("[data-a]").first().waitFor({ timeout: 15000 }); await m.locator("[data-a]").first().click();
    await m.click("#btnCheck");
    const [cod2] = sql(`select uber_codigo_qr('${vg.id}', floor(extract(epoch from now())/60)::bigint) c;`);
    await m.fill("#qrCodigo", cod2.c); await m.click("#qrForm button");
    await m.waitForFunction(() => /aguardando pagamento/i.test(document.body.innerText), null, { timeout: 15000 });
    const [cor2] = sql(`select status from uber_corridas where id = '${cor.id}';`);
    assert.strictEqual(cor2.status, "concluida");
    const larg = await m.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(larg <= 391, "sem rolagem lateral no celular: " + larg);
    console.log("ok 8 - check-out pelo código digitado; corrida concluída; celular sem rolagem lateral");
    assert.deepStrictEqual(erros.filter((e) => !/getUserMedia|NotAllowed|camera|Permission/i.test(e)), []);
    console.log("todos os testes passaram");
  } finally {
    await browser.close(); srv.close(); limpar();
  }
})().catch((e) => { console.error(e); try { limpar(); } catch (_) {} process.exit(1); });
