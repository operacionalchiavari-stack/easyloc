/* =====================================================================
   google.script.* para as telas que vieram do Google Apps Script.

   As telas continuam chamando google.script.run.withSuccessHandler(...)
   .funcao(args) exatamente como antes; aqui a chamada vai para a função de
   mesmo nome em window.ACERVO_LOCAL (operacao-sem-motor.js, central-dados.js,
   costura-dados.js, controle-rh-dados.js...), que lê e grava no Supabase.
   O servidor antigo das planilhas (/api/gs na Vercel) foi apagado em nov/2026:
   nada daqui sai para lá. O atributo data-sem-motor ficou nas telas só por histórico.

   Uso (primeiro script do <head>):
     <script src="../gas-cliente.js" data-projeto="cronograma" data-sem-motor></script>
   ===================================================================== */
(function () {
  var STORAGE = "https://awemuohtvwvrdzfxwrmd.supabase.co/storage/v1/object/public/gs-arquivos/";
  window.supabaseArquivoUrl = function(valor){
    var v=String(valor||'');
    if(v.indexOf('sb:')===0)return STORAGE+v.slice(3).split('/').map(encodeURIComponent).join('/');
    if(/^https:\/\/awemuohtvwvrdzfxwrmd\.supabase\.co\/storage\//.test(v))return v;
    return '';
  };

  function chamar(nome, args, ok, falha, usuario) {
    var f = window.ACERVO_LOCAL && window.ACERVO_LOCAL[nome];
    Promise.resolve().then(function () {
      if (typeof f !== "function") { throw new Error("Função não disponível nesta tela: " + nome); }
      return f.apply(null, args);
    }).then(function (res) { if (ok) { ok(res, usuario); } }, function (e) {
      var erro = e instanceof Error ? e : new Error(String((e && e.message) || e));
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
