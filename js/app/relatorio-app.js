/* Relatórios do sistema abertos pelo app do celular (módulo Gerencial, 20/11/2026).
   Uso, no <head> do relatório:
     <script src="…/js/app/relatorio-app.js" data-titulo="Panorama dos Eventos" data-esconder="#gVoltar, h2"></script>
   Só age com ?app=1 (aberto pelo app.html): põe a faixa do app em cima (← Gerencial + nome do relatório), esconde o que
   for só do computador (data-esconder), deixa tabelas largas rolarem de lado dentro do próprio quadro e mostra o
   carregamento padrão do app até a página carregar. Sem ?app=1 não faz nada (o relatório continua igual no sistema). */
(function () {
  "use strict";
  const atual = document.currentScript;
  const params = new URLSearchParams(location.search);
  if (params.get("app") !== "1" || !atual) return;
  const raiz = new URL("../../", atual.src);
  // 20/11/2026: a mesma página pode ser aberta pelo módulo "Agentes de IA" (?grupo=agentes&titulo=Clara): a faixa diz
  // "Agentes de IA" e o voltar leva para a lista dos agentes.
  const GRUPOS = { gerencial: { rotulo: "Gerencial", hash: "#gerencial" }, agentes: { rotulo: "Agentes de IA", hash: "#agentes" } };
  const grupo = GRUPOS[params.get("grupo")] || GRUPOS.gerencial;
  const titulo = params.get("titulo") || atual.dataset.titulo || document.title.replace(/^Acervo\s*[-·]\s*/, "");
  if (params.get("grupo") === "agentes") document.documentElement.classList.add("app-agente");
  const esconder = atual.dataset.esconder || "";
  const html = document.documentElement;
  html.classList.add("app-relatorio");
  // Aberta numa janela nova (ex.: tocando numa notificação com o app fechado) a aba não tem o login_ok do app; com a
  // sessão do Supabase já salva neste aparelho, marca a empresa de sempre. O context.js confere tudo no servidor
  // (vínculo, acesso ativo e verificação em duas etapas) antes de mostrar qualquer dado (mesmo jeito do Painel do CFO).
  try {
    const emp = localStorage.getItem("acervo_ultima_empresa");
    if (!sessionStorage.getItem("login_ok") && localStorage.getItem("easyloc-auth") && /^[0-9a-f-]{36}$/i.test(emp || "")) {
      sessionStorage.setItem("login_ok", "1"); sessionStorage.setItem("empresa_id", emp);
    }
  } catch (e) {}

  const css = document.createElement("link");
  css.rel = "stylesheet"; css.href = new URL("styles/app-relatorio.css?v=20261120-app2", raiz).href;
  document.head.appendChild(css);
  if (esconder) {
    const st = document.createElement("style");
    st.textContent = "html.app-relatorio:is(#ar1#ar2#ar3#ar4#ar5#ar6#ar7#ar8,html) :is(" + esconder + "){display:none!important}";
    document.head.appendChild(st);
  }
  if (!document.querySelector('meta[name="theme-color"]')) {
    const m = document.createElement("meta"); m.name = "theme-color"; m.content = "#5a5a55"; document.head.appendChild(m);
  }
  // Carregamento padrão do app (o mesmo dos outros módulos) até a página terminar de carregar.
  const carg = document.createElement("script");
  carg.src = new URL("js/app/carregamento-app.js?v=20261106-abertura", raiz).href;
  carg.onload = () => { if (document.readyState !== "complete") window.AppCarregamento?.mostrar(); else window.AppCarregamento?.pronto(); };
  document.head.appendChild(carg);
  window.addEventListener("load", () => setTimeout(() => window.AppCarregamento?.pronto(), 350));

  // Veio do app: volta pelo histórico (a lista do Gerencial continua onde estava); senão abre a lista do Gerencial.
  const voltar = () => {
    let doApp = false; try { doApp = new URL(document.referrer).pathname.endsWith("/app.html"); } catch (e) {}
    if (doApp && history.length > 1) history.back(); else location.replace(new URL("app.html" + grupo.hash, raiz).href);
  };

  function montarBarra() {
    if (document.getElementById("arBarra")) return;
    const barra = document.createElement("header");
    barra.id = "arBarra"; barra.className = "ar-barra";
    barra.innerHTML = '<button type="button" class="ar-voltar" aria-label="Voltar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>' +
      '<div class="ar-titulo"><small></small><b></b></div>';
    barra.querySelector("small").textContent = grupo.rotulo;
    barra.querySelector("b").textContent = titulo;
    barra.querySelector("button").addEventListener("click", voltar);
    document.body.prepend(barra);
  }

  // Tabela mais larga que o quadro: vai para dentro de uma caixa que rola de lado (a página nunca rola de lado).
  function rolagemTabelas() {
    document.querySelectorAll("table").forEach((t) => {
      if (t.closest(".ar-rolagem") || t.closest("#arBarra") || t.closest("dialog:not([open])")) return;
      const pai = t.parentElement; if (!pai) return;
      if (t.scrollWidth <= pai.clientWidth + 1) return;
      const caixa = document.createElement("div"); caixa.className = "ar-rolagem";
      pai.insertBefore(caixa, t); caixa.appendChild(t);
    });
  }
  let agendado = 0;
  const agendar = () => { if (agendado) return; agendado = requestAnimationFrame(() => { agendado = 0; rolagemTabelas(); }); };

  function iniciar() {
    montarBarra();
    // Elemento com display escrito no próprio HTML (style="…!important") não obedece a folha de estilo: esconde direto.
    if (esconder) { try { document.querySelectorAll(esconder).forEach((el) => el.style.setProperty("display", "none", "important")); } catch (e) {} }
    rolagemTabelas();
    new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true });
    addEventListener("resize", agendar);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
