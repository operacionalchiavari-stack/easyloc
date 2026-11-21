// Controle RH sem o servidor antigo (nov/2026): a tela lê e grava em controle_rh_ocorrencias, nada vai para /api/gs.
const { chromium } = require("playwright"); const http = require("http"), fs = require("fs"), path = require("path"), assert = require("assert");
const root = path.join(__dirname, "..");
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split("?")[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader("content-type", f.endsWith(".html") ? "text/html" : f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "application/octet-stream"); r.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => srv.listen(0, r)); const porta = srv.address().port;
  const b = await chromium.launch({ channel: "msedge" }); const pg = await b.newPage(); const erros = [], gs = [];
  pg.on("pageerror", e => erros.push(e.message));
  await pg.route("**/api/gs", r => { gs.push(r.request().url()); r.fulfill({ status: 500, body: "{}" }); });
  await pg.route("**/supabase-js@*", r => r.fulfill({ contentType: "text/javascript", body: "window.supabase={createClient:()=>window.__mock}" }));
  await pg.route("**/js/core/supabase.js", r => r.fulfill({ contentType: "text/javascript", body: "window.supabaseClient=window.__mock" }));
  await pg.addInitScript(() => {
    sessionStorage.setItem("empresa_id", "e1");
    const banco = { funcionarios_acesso: [{ id: "f1", empresa_id: "e1", nome: "Ana Souza", setor: "Montagem", cargo: "Montadora", ativo: true }, { id: "f2", empresa_id: "e1", nome: "Caio Lima", setor: "Estoque", ativo: false }],
      controle_rh_ocorrencias: [{ id: "o1", empresa_id: "e1", data_ocorrencia: "2026-10-10", hora_ocorrencia: "07:40:00", funcionario_id: "f1", funcionario_nome: "Ana Souza", setor: "Montagem", tipo: "Atraso", observacao: "Trânsito", responsavel: "Lia", registrado_em: "2026-10-10T11:00:00Z" }] };
    window.__inseridos = [];
    const q = (t) => { let rows = banco[t] || []; const o = { select: () => o, eq: (c, v) => { rows = rows.filter(x => x[c] === v); return o; }, order: () => o, limit: () => o, single: () => o,
      insert: (l) => { window.__inseridos.push(...l); banco[t].unshift(...l.map((x, i) => ({ id: "n" + i, registrado_em: new Date().toISOString(), ...x }))); return Promise.resolve({ error: null }); },
      then: (ok, no) => Promise.resolve({ data: rows, error: null }).then(ok, no) }; return o; };
    window.__mock = { from: q, auth: { getSession: async () => ({ data: { session: { user: { id: "u" }, access_token: "x" } } }) } };
  });
  await pg.goto(`http://localhost:${porta}/Modulos/Chiavari/ControleRH/rh.html`);
  await pg.waitForFunction(() => document.querySelectorAll("#funcionario option").length > 1);
  const opcoes = await pg.$$eval("#funcionario option", l => l.map(o => o.value.trim()).filter(Boolean));
  assert.deepEqual(opcoes, ["Ana Souza"], "só funcionários ativos do cadastro");
  await pg.waitForFunction(() => /Trânsito|Atraso/.test(document.body.textContent));
  // grava pelo mesmo caminho que a tela usa
  await pg.evaluate(() => new Promise((ok, no) => google.script.run.withSuccessHandler(ok).withFailureHandler(no).salvarLoteRH([{ funcionario: "Ana Souza", dataOcorrencia: "2026-11-19", horaOcorrencia: "08:10", setor: "Montagem", tipo: "Falta", observacao: "Sem aviso", responsavel: "Lia" }])));
  const ins = await pg.evaluate(() => window.__inseridos[0]);
  assert.equal(ins.funcionario_id, "f1"); assert.equal(ins.data_ocorrencia, "2026-11-19"); assert.equal(ins.hora_ocorrencia, "08:10");
  const hist = await pg.evaluate(() => new Promise(ok => google.script.run.withSuccessHandler(ok).getHistoricoRH()));
  assert.equal(hist[0].dataOcorrencia, "19/11/2026"); assert.equal(hist.length, 2);
  assert.deepEqual(gs, [], "nada vai para o servidor antigo"); assert.deepEqual(erros, []);
  console.log("ok - Controle RH lê e grava no Supabase, sem o servidor antigo");
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
