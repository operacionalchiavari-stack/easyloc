// Abre todas as telas do menu como a vendedora da demonstração (dashboard + cada item), tira uma foto de cada uma e
// anota o que parece vazio ("Nenhum...", "Carregando..." que não sumiu, tabelas sem linhas) e os erros de JavaScript.
// Fotos em outputs/demo-diretoria/telas/. Uso: node Scripts/demo-diretoria/auditar-telas.cjs [filtro]
const C = require("./comum.cjs");
const { abrirNavegador } = require("./navegador.cjs");
const fs = require("fs"), path = require("path");

(async () => {
  const E = C.lerEstado();
  const filtro = (process.argv[2] || "").toLowerCase();
  const pasta = path.join(C.raiz, "outputs", "demo-diretoria", "telas");
  fs.mkdirSync(pasta, { recursive: true });
  const { sessao } = await C.sessaoDe(E.usuario.email, E.usuario.senha);
  const nav = await abrirNavegador(sessao);
  const dash = await nav.abrir("dashboard.html");
  await dash.waitForFunction(() => window.ACERVO_MENU && window.shellNavigate && window.carregarNaMain, null, { timeout: 60000 });
  await dash.waitForTimeout(3000);
  const itens = await dash.evaluate(() => {
    const out = [];
    const andar = (lista, cat) => (lista || []).forEach((i) => {
      if (i.oculto) return;
      if (i.grupo) return andar(i.grupo, cat + " > " + i.rotulo);
      if (i.itens) return andar(i.itens, cat + " > " + i.rotulo);
      if (i.href || i.legado) out.push({ nome: cat + " > " + i.rotulo, href: i.href || null, legado: i.legado || null });
    });
    for (const c of window.ACERVO_MENU.categorias) { if (c.href) out.push({ nome: c.rotulo, href: c.href }); andar(c.itens, c.rotulo); }
    return out;
  });
  const vistos = new Set(), relatorio = [];
  let n = 0;
  for (const it of itens) {
    const chave = it.href || it.legado?.html;
    if (vistos.has(chave) || (filtro && !it.nome.toLowerCase().includes(filtro))) continue;
    vistos.add(chave); n++;
    const errosAntes = nav.erros.length;
    const pageErros = [];
    const ouvir = (e) => pageErros.push(e.message);
    dash.on("pageerror", ouvir);
    try {
      if (it.href) await dash.evaluate((h) => window.shellNavigate(h), it.href);
      else await dash.evaluate((l) => window.carregarNaMain(l.html, l.js, l.css), it.legado);
    } catch (e) { pageErros.push("abrir: " + e.message); }
    await dash.waitForTimeout(9000);
    const info = await dash.evaluate(() => {
      const fr = document.getElementById("appModuleFrame");
      const doc = fr && !fr.hidden && fr.offsetParent !== null && fr.contentDocument ? fr.contentDocument : document.getElementById("main-content");
      const txt = (doc?.body || doc)?.innerText || "";
      const vazios = (txt.match(/(Nenhum[^\n.]{0,60}|Nenhuma[^\n.]{0,60}|Sem dados[^\n.]{0,40}|ainda não[^\n.]{0,50}|Carregando[^\n.]{0,30})/gi) || []).slice(0, 6);
      const linhas = (doc?.querySelectorAll ? doc.querySelectorAll("tbody tr").length : 0);
      return { vazios, linhas, tamanho: txt.length };
    }).catch(() => ({ vazios: ["(não foi possível ler)"], linhas: 0, tamanho: 0 }));
    // erros de dentro do quadro (iframe) entram pelo ctx
    const arquivo = String(n).padStart(2, "0") + "-" + it.nome.replace(/[^\wÀ-ú]+/g, "-").slice(0, 60) + ".png";
    await dash.screenshot({ path: path.join(pasta, arquivo) });
    dash.off("pageerror", ouvir);
    relatorio.push({ tela: it.nome, arquivo, linhas: info.linhas, vazios: info.vazios, erros: [...pageErros, ...nav.erros.slice(errosAntes)].slice(0, 3) });
    console.log(`${String(n).padStart(2)} ${it.nome} · ${info.linhas} linhas${info.vazios.length ? " · " + info.vazios.join(" / ") : ""}${pageErros.length ? " · ERRO: " + pageErros[0] : ""}`);
  }
  fs.writeFileSync(path.join(pasta, "relatorio.json"), JSON.stringify(relatorio, null, 2));
  await nav.browser.close();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
