// 21/11/2026 — App do Freteiro › Meus fretes contra o banco REAL (RUN_FRETEIRO_LIVE=1), no celular:
// freteiro aprovado (temporário) lança um frete às cegas (data fora do período bloqueia), envia o relatório,
// o sistema não acha o frete → divergência; ele explica por texto; a Logística aceita (frete_div_resolver)
// e o frete vira conta a pagar "aguardando fechamento" + linha no fechamento de parceiro. Tudo é apagado no fim.
if (process.env.RUN_FRETEIRO_LIVE !== "1") { console.log("pulado (RUN_FRETEIRO_LIVE=1 para rodar)"); process.exit(0); }
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os"), assert = require("assert");
const raiz = path.resolve(__dirname, ".."), BASE = "http://localhost:5521/";
const FONE = "24999880022";

function sql(q) {
  const arq = path.join(os.tmpdir(), "fl-" + Date.now() + Math.random().toString(36).slice(2) + ".sql");
  fs.writeFileSync(arq, "set role postgres;\n" + q);
  try {
    const out = execSync('npx supabase db query --linked -f "' + arq + '"', { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const j = JSON.parse(out.slice(out.indexOf("{")));
    return j.rows || [];
  } finally { fs.unlinkSync(arq); }
}
function servidor() {
  const http = require("http");
  const tipos = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg" };
  return http.createServer((req, res) => {
    const f = path.join(raiz, decodeURIComponent(new URL(req.url, BASE).pathname));
    if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": tipos[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
  }).listen(5521);
}
const ADM = `select user_id into adm from usuarios_empresas where empresa_id = gs_empresa_dona() and lower(coalesce(role,'')) in ('admin','owner') limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);`;
function limpar() {
  sql(`create temp table _f on commit drop as select id, fornecedor_id, caminhao_id from frete_freteiros where telefone = '${FONE}';
       create temp table _p on commit drop as select pagar_id id from frete_lancamentos where freteiro_id in (select id from _f) and pagar_id is not null;
       create temp table _fe on commit drop as select distinct fechamento_id id from frete_relatorios where freteiro_id in (select id from _f) and fechamento_id is not null;
       delete from fin_fechamento_linhas where titulo_id in (select id from _p) or fechamento_id in (select id from _fe);
       delete from fin_fechamentos where id in (select id from _fe) and not exists (select 1 from fin_fechamento_linhas l where l.fechamento_id = fin_fechamentos.id);
       delete from fin_custos_evento where pagar_id in (select id from _p);
       update frete_lancamentos set pagar_id = null where freteiro_id in (select id from _f);
       delete from fin_pagar where id in (select id from _p);
       delete from frete_lancamentos where freteiro_id in (select id from _f);
       delete from frete_veiculos where freteiro_id in (select id from _f);
       delete from frete_relatorios where freteiro_id in (select id from _f);
       delete from app_sessoes where freteiro_id in (select id from _f);
       update frete_freteiros set caminhao_id = null, fornecedor_id = null where id in (select id from _f);
       delete from caminhoes where id in (select caminhao_id from _f);
       delete from fornecedores where id in (select fornecedor_id from _f);
       delete from frete_freteiros where id in (select id from _f);`);
}

(async () => {
  limpar();
  // freteiro aprovado pela mesma função da tela Freteiros (cria fornecedor e caminhão)
  sql(`insert into frete_freteiros (empresa_id, nome, telefone, senha_hash, veiculo_modelo, capacidade_m3)
       values (gs_empresa_dona(), 'Freteiro Lançamentos Teste', '${FONE}', crypt('123456', gen_salt('bf')), 'Fiorino', 3);
       do $$ declare adm uuid; fid uuid; begin ${ADM}
         select id into fid from frete_freteiros where telefone = '${FONE}';
         perform frete_freteiro_status(gs_empresa_dona(), fid, 'aprovado', null);
       end $$;`);
  const [{ token }] = sql(`select (frete_nova_sessao(f))->>'token' token from frete_freteiros f where telefone = '${FONE}';`);
  const [per] = sql(`select (frete_lanc_app('${token}'))->'periodo' p;`);
  const periodo = per.p;
  assert.ok(periodo.ini && periodo.fim, "período aberto");

  const srv = servidor();
  const browser = await chromium.launch({ channel: "msedge" });
  const erros = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript((t) => localStorage.setItem("frete_freteiro_token", t), token);
    const m = await ctx.newPage();
    m.on("pageerror", (e) => erros.push(e.message));
    m.on("dialog", (d) => d.accept());
    await m.goto(BASE + "Modulos/Chiavari/Fretes/freteiro.html");
    await m.waitForFunction(() => window.App && window.FreteiroBase && window.FreteiroBase.estado.token, null, { timeout: 20000 });
    await m.evaluate(() => App.ir("lancamentos"));
    await m.waitForSelector('[data-fl="novo"]', { timeout: 20000 });
    assert.ok(/Período aberto/i.test(await m.innerText("body")), "mostra o período aberto");
    console.log("ok 1 - Meus fretes abre com o período aberto (" + periodo.ini + " a " + periodo.fim + ")");

    await m.click('[data-fl="novo"]');
    await m.waitForSelector("#flData");
    const fora = new Date(new Date(periodo.fim + "T12:00:00").getTime() + 40 * 864e5).toISOString().slice(0, 10);
    await m.fill("#flData", fora);
    assert.ok(await m.isVisible("#flDataErro"), "data fora mostra o erro");
    assert.ok(await m.isDisabled("#flSalvar"), "data fora trava o Salvar");
    console.log("ok 2 - data fora do período bloqueia enquanto digita");

    await m.fill("#flData", periodo.ini);
    assert.ok(!(await m.isDisabled("#flSalvar")), "data no período libera");
    await m.fill("#flOrigem", "Galpão"); await m.fill("#flDestino", "Local de Teste Inexistente");
    await m.fill("#flValor", "192,50");
    await m.selectOption("#flCaminhao", { index: 1 });
    await m.click("#flSalvar");
    await m.waitForFunction(() => /Lançados neste período/i.test(document.body.innerText), null, { timeout: 15000 }).catch(async (e) => { console.log(await m.innerText('body')); throw e; });
    assert.ok(/192,50/.test(await m.innerText("body")), "total com o extra");
    console.log("ok 3 - lançar frete com caminhão (total R$ 192,50)");

    // enviar só é liberado no fim do período: se ainda não chegou, envia pelo banco com a mesma função
    if (await m.locator('[data-fl="enviar"]').count()) await m.click('[data-fl="enviar"]');
    else { // ainda não é o fim do período: passa o frete para o período anterior (que fica aberto por ter frete lançado) e envia
      sql(`update frete_lancamentos l set data = date '${periodo.ini}' - 1 from frete_freteiros f where f.id = l.freteiro_id and f.telefone = '${FONE}';`);
      sql(`select frete_lanc_enviar('${token}');`); await m.evaluate(() => App.ir("relatorios")); }
    await m.waitForFunction(() => /Relatórios enviados|Você ainda não enviou/i.test(document.body.innerText), null, { timeout: 20000 });
    const [l1] = sql(`select l.situacao, l.divergencia, l.id from frete_lancamentos l join frete_freteiros f on f.id = l.freteiro_id where f.telefone = '${FONE}';`);
    assert.strictEqual(l1.situacao, "divergente"); assert.strictEqual(l1.divergencia, "sem_frete");
    assert.strictEqual(await m.locator('[data-fl="novo"]').count(), 0, "relatórios ficam numa tela separada de Meus fretes");
    console.log("ok 4 - relatório enviado, travado e conferido: frete sem correspondência vira divergência");

    if (!(await m.locator('[data-fl="explicar"]').count())) await m.click('[data-fl="rel"]');
    await m.click('[data-fl="explicar"]');
    await m.waitForSelector("#flSoTexto");
    await m.click("#flSoTexto");
    await m.waitForSelector("#flExplicacao");
    await m.fill("#flExplicacao", "Fiz uma entrega avulsa a pedido do supervisor, combinada por telefone.");
    await m.click("#flEnviarExp");
    await m.waitForFunction(() => /Relatórios enviados|Você ainda não enviou/i.test(document.body.innerText), null, { timeout: 15000 });
    const [l2] = sql(`select explicacao from frete_lancamentos where id = '${l1.id}';`);
    assert.ok(/avulsa/.test(l2.explicacao || ""), "explicação gravada");
    console.log("ok 5 - freteiro explica a divergência");

    const [res] = sql(`do $$ declare adm uuid; r jsonb; begin ${ADM}
        r := frete_div_lista(gs_empresa_dona());
        if not exists (select 1 from jsonb_array_elements(r->'abertas') e where e->>'id' = '${l1.id}') then raise exception 'não está nas divergências abertas'; end if;
        perform frete_div_resolver(gs_empresa_dona(), '${l1.id}', 'aceitar', null, 'Entrega avulsa confirmada pelo supervisor');
      end $$;
      select l.situacao, l.valor_final, p.valor, p.aguardando_fechamento, p.origem,
             (select count(*) from fin_fechamento_linhas fl where fl.titulo_id = p.id) linhas,
             r.status rel
        from frete_lancamentos l left join fin_pagar p on p.id = l.pagar_id join frete_relatorios r on r.id = l.relatorio_id where l.id = '${l1.id}';`);
    assert.strictEqual(res.situacao, "aceito");
    assert.strictEqual(Number(res.valor), 192.5);
    assert.strictEqual(res.origem, "frete");
    assert.strictEqual(res.aguardando_fechamento, true, "conta espera o fechamento do parceiro");
    assert.ok(Number(res.linhas) >= 1, "linha no fechamento de parceiro");
    assert.strictEqual(res.rel, "no_financeiro");
    console.log("ok 6 - Logística aceita → conta a pagar aguardando fechamento + linha em Fechamentos de parceiros");

    await m.evaluate(() => App.ir("relatorios"));
    await m.waitForSelector('[data-fl="rel"]'); if (!/Aceito pela logística/i.test(await m.innerText("body"))) await m.click('[data-fl="rel"]');
    await m.waitForFunction(() => /Aceito pela logística/i.test(document.body.innerText), null, { timeout: 15000 }).catch(async (e) => { console.log(await m.innerText("body")); throw e; });
    console.log("ok 7 - o app mostra o frete aceito");
    assert.deepStrictEqual(erros, [], "sem erro de JavaScript: " + erros.join(" | "));
    console.log("todos os testes passaram");
  } finally {
    await browser.close(); srv.close(); limpar();
  }
})().catch((e) => { console.error(e); try { limpar(); } catch (_) {} process.exit(1); });
