// Out/2026 — "às vezes aparece 'Você não possui acesso', o menu some, os ícones, tudo".
// Simula o banco falhando por instantes (rede/sessão) e confere que:
// 1) uma falha na revalidação NÃO tira o acesso nem esconde a tela;
// 2) uma falha na abertura é tentada de novo antes de negar;
// 3) se a abertura negou por instabilidade, a tela volta sozinha quando o banco responde;
// 4) acesso inativo de verdade continua bloqueando;
// 5) context.js não desloga ninguém quando o getUser falha por rede.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const raiz = path.resolve(__dirname, "..");
const permissoes = fs.readFileSync(path.join(raiz, "js/core/permissions.js"), "utf8");
const contexto = fs.readFileSync(path.join(raiz, "js/core/context.js"), "utf8");
const BASE = "http://acervo.teste/Modulos/Comercial/CadastroClientes/cadastro-clientes.html";

// Banco simulado: window.__falhar = quantas chamadas seguidas falham; window.__ativo = resposta do banco.
const mock = `
window.__falhar = window.__falhar ?? 0; window.__ativo = window.__ativo ?? true; window.__chamadas = 0; window.__saiu = false;
window.__falharUser = window.__falharUser ?? 0;
window.supabaseClient = {
  auth: {
    getSession: async () => ({ data: { session: { access_token: "t" } } }),
    getUser: async () => { if (window.__falharUser > 0) { window.__falharUser--; return { data: { user: null }, error: new Error("rede") }; } return { data: { user: { id: "u1", email: "a@b" } } }; },
    signOut: async () => { window.__saiu = true; },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
  },
  // Igual ao supabase-js: o rpc devolve um objeto que só tem "then" (sem .catch).
  rpc: (nome) => ({ then: (ok, erro) => rpcReal(nome).then(ok, erro) })
};
async function rpcReal(nome) {
  {
    window.__chamadas++;
    if (window.__falhar > 0) { window.__falhar--; return { data: null, error: { message: "Failed to fetch" } }; }
    if (nome === "funcionario_contexto") return { data: { ativo: window.__ativo, administrador_legado: false }, error: null };
    if (nome === "get_permissoes_usuario_resolvidas") return { data: [{ chave: "comercial.clientes.visualizar", permitido: true }], error: null };
    return { data: null, error: null };
  }
}`;

function pagina(antes, comContexto = true) {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
<main id="tela">Clientes</main>
<script>${antes}</script><script>${mock}</script>
${comContexto ? `<script>window.__CONTEXT = { empresa_id: "e1", usuario_id: "u1" };</script>` : ""}
<script>${permissoes}</script></body></html>`;
}

async function abrir(browser, antes, comContexto) {
  const page = await browser.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.route("http://acervo.teste/**", (r) => r.fulfill({ contentType: "text/html", body: pagina(antes, comContexto) }));
  await page.goto(BASE);
  return { page, erros };
}
const estado = (page) => page.evaluate(() => ({
  telaVisivel: !document.getElementById("tela").hidden,
  aviso: Boolean(document.getElementById("permissionDeniedNotice")),
  pode: window.EasyLocPermissions.canNavigate(location.href)
}));

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });

  // 1) Falha passageira na revalidação: mantém o acesso.
  {
    const { page, erros } = await abrir(browser, "");
    await page.waitForFunction(() => window.EasyLocPermissions?._cache.loaded);
    assert.deepStrictEqual(await estado(page), { telaVisivel: true, aviso: false, pode: true }, "abre normal");
    await page.evaluate(() => { window.__falhar = 99; document.dispatchEvent(new Event("visibilitychange")); });
    await page.waitForTimeout(400);
    assert.deepStrictEqual(await estado(page), { telaVisivel: true, aviso: false, pode: true }, "falha na revalidação não tira o acesso");
    assert.strictEqual(erros.length, 0, erros.join("\n"));
    await page.close();
    console.log("ok 1 - revalidação com falha mantém a tela e o acesso");
  }

  // 2) Abertura com 2 falhas seguidas: tenta de novo e libera.
  {
    const { page } = await abrir(browser, "window.__falhar = 2;");
    await page.waitForFunction(() => window.EasyLocPermissions?._cache.loaded, null, { timeout: 15000 });
    assert.deepStrictEqual(await estado(page), { telaVisivel: true, aviso: false, pode: true }, "abertura com falha passageira libera");
    await page.close();
    console.log("ok 2 - abertura tenta de novo antes de negar");
  }

  // 3) Abertura negada por instabilidade longa: volta sozinha quando o banco responde.
  {
    const { page } = await abrir(browser, "window.__falhar = 99;");
    await page.waitForFunction(() => window.EasyLocPermissions?._cache.loaded, null, { timeout: 20000 });
    let s = await estado(page);
    assert.strictEqual(s.aviso, true, "sem resposta do banco, nega"); assert.strictEqual(s.telaVisivel, false);
    await page.evaluate(() => { window.__falhar = 0; });
    await page.waitForFunction(() => !document.getElementById("permissionDeniedNotice"), null, { timeout: 15000 });
    s = await estado(page);
    assert.deepStrictEqual(s, { telaVisivel: true, aviso: false, pode: true }, "tela volta sozinha");
    await page.close();
    console.log("ok 3 - tela volta sozinha depois da instabilidade");
  }

  // 4) Inativo de verdade continua bloqueando, e a revalidação aplica a mudança.
  {
    const { page } = await abrir(browser, "window.__ativo = false;");
    await page.waitForFunction(() => window.EasyLocPermissions?._cache.loaded);
    assert.strictEqual((await estado(page)).aviso, true, "inativo bloqueia");
    await page.close();
    const b = await abrir(browser, "");
    await b.page.waitForFunction(() => window.EasyLocPermissions?._cache.loaded);
    await b.page.evaluate(() => { window.__ativo = false; document.dispatchEvent(new Event("visibilitychange")); });
    await b.page.waitForFunction(() => document.getElementById("permissionDeniedNotice"));
    await b.page.close();
    console.log("ok 4 - acesso inativo de verdade continua bloqueando (inclusive na revalidação)");
  }

  // 5) context.js: getUser falhando 2x por rede não desloga e monta o contexto.
  {
    const page = await browser.newPage();
    const html = `<!doctype html><html><body><main id="tela">x</main>
<script>sessionStorage.setItem("login_ok","1");sessionStorage.setItem("empresa_id","e1");window.__falharUser=2;</script>
<script>${mock}</script><script>${contexto}</script></body></html>`;
    await page.route("http://acervo.teste/**", (r) => r.fulfill({ contentType: "text/html", body: html }));
    await page.goto(BASE);
    await page.waitForTimeout(5000);
    const r = await page.evaluate(() => ({ saiu: window.__saiu, tela: !document.getElementById("tela").hidden, ctx: window.__CONTEXT?.usuario_id }));
    assert.strictEqual(r.ctx, "u1", "contexto montado com o usuário");
    assert.strictEqual(r.saiu, false, "não deslogou por falha de rede");
    assert.strictEqual(r.tela, true, "tela continua visível");
    await page.close();
    console.log("ok 5 - context.js não desloga nem esconde a tela por falha de rede");
  }

  await browser.close();
  console.log("todos os testes passaram");
})().catch((e) => { console.error(e); process.exit(1); });
