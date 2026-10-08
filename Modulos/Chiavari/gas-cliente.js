/* =====================================================================
   google.script.* para as telas que vieram do Google Apps Script.

   As telas continuam chamando google.script.run.withSuccessHandler(...)
   .funcao(args) exatamente como antes; aqui isso vira um POST para
   /api/gs, que roda o código original do sistema (api/_gas/motor.js).

   Uso (primeiro script do <head>):
     <script src="../gas-cliente.js" data-projeto="cronograma"></script>
   ===================================================================== */
(function () {
  var script = document.currentScript;
  var PROJETO = script && script.getAttribute("data-projeto");
  // O servidor (/api/gs) só existe na Vercel. Aberta em outro lugar (GitHub
  // Pages, servidor local) a tela chama a Vercel direto — antes dava
  // "Falha de conexão (405)", porque o GitHub Pages não roda servidor.
  var SERVIDOR = /\.vercel\.app$/i.test(location.hostname) ? "" : "https://easyloc-zeta.vercel.app";
  var API = (script && script.getAttribute("data-api")) || (SERVIDOR + "/api/gs");
  var STORAGE = "https://awemuohtvwvrdzfxwrmd.supabase.co/storage/v1/object/public/gs-arquivos/";

  function chamar(nome, args, ok, falha, usuario) {
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projeto: PROJETO, fn: nome, args: args })
    })
      .then(function (r) {
        if (!r.ok && r.status !== 200) { throw new Error("Falha de conexão (" + r.status + ")."); }
        return r.json();
      })
      .then(function (j) {
        if (j && j.ok) { if (ok) { ok(j.resultado, usuario); } }
        else {
          var e = new Error((j && j.erro) || "Erro desconhecido.");
          if (falha) { falha(e, usuario); } else { console.error(nome + ":", e.message); }
        }
      })
      .catch(function (e) {
        var erro = e instanceof Error ? e : new Error(String(e));
        if (/Failed to fetch|NetworkError|Load failed/i.test(erro.message)) { erro = new Error("Sem conexão com o servidor. Verifique a internet e tente de novo."); }
        if (falha) { falha(erro, usuario); } else { console.error(nome + ":", erro.message); }
      });
  }

  function executor(ok, falha, usuario) {
    return new Proxy({}, {
      get: function (alvo, nome) {
        if (nome === "withSuccessHandler") { return function (f) { return executor(f, falha, usuario); }; }
        if (nome === "withFailureHandler") { return function (f) { return executor(ok, f, usuario); }; }
        if (nome === "withUserObject") { return function (u) { return executor(ok, falha, u); }; }
        if (typeof nome !== "string" || nome === "then") { return undefined; }
        return function () { chamar(nome, Array.prototype.slice.call(arguments), ok, falha, usuario); };
      }
    });
  }

  function localizacao() {
    var parametro = {}, parametros = {};
    new URLSearchParams(location.search).forEach(function (v, k) {
      if (!(k in parametro)) { parametro[k] = v; }
      (parametros[k] = parametros[k] || []).push(v);
    });
    return { hash: location.hash.replace(/^#/, ""), parameter: parametro, parameters: parametros };
  }

  window.google = window.google || {};
  window.google.script = {
    run: executor(null, null, undefined),
    url: { getLocation: function (cb) { setTimeout(function () { cb(localizacao()); }, 0); } },
    host: {
      close: function () { window.close(); }, setHeight: function () {}, setWidth: function () {},
      origin: location.origin, editor: { focus: function () {} }
    },
    history: { push: function () {}, replace: function () {}, setChangeHandler: function () {} }
  };

  /* Fotos novas ficam no Storage: links montados no formato do Drive com
     id "sb:..." são trocados pelo endereço certo. */
  var RE = /^https:\/\/(?:drive|lh\d)\.google(?:usercontent)?\.com\/.*?[?&]id=sb:([^&#]+)/;
  function corrigir(el) {
    if (!el || el.nodeType !== 1) { return; }
    ["src", "href"].forEach(function (a) {
      var v = el.getAttribute && el.getAttribute(a);
      var m = v && v.indexOf("sb:") >= 0 && v.match(RE);
      if (m) { el.setAttribute(a, STORAGE + decodeURIComponent(m[1])); }
    });
    if (el.querySelectorAll) { Array.prototype.forEach.call(el.querySelectorAll("img[src*='sb:'],a[href*='sb:'],source[src*='sb:']"), corrigir); }
  }
  new MutationObserver(function (lista) {
    lista.forEach(function (m) {
      if (m.type === "attributes") { corrigir(m.target); }
      else { Array.prototype.forEach.call(m.addedNodes, corrigir); }
    });
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "href"] });
})();
