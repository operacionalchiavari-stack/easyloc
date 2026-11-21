/* Central de Metas, Meu Bônus e ciência de danos sem o servidor antigo (nov/2026).
   Toda função que a tela chamava pelo google.script.run vai para a Edge Function central-metas do Supabase,
   com o mesmo nome e os mesmos argumentos (o gas-cliente.js entrega a chamada aqui por causa do data-sem-motor).
   centralEntrar/centralChamar (a antiga chave de acesso da Central) viram só repasse: quem barra é o login do
   sistema (rh.colaboradores.visualizar), conferido no servidor. */
(function () {
  "use strict";
  var URL_FN = "https://awemuohtvwvrdzfxwrmd.supabase.co/functions/v1/central-metas";
  var ANON = "sb_publishable_tlm-v5vvX9jgChODJmDCtw_JqMxLtpZ";

  function tokenGuardado() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k === "easyloc-auth" || /^sb-.*-auth-token$/.test(k)) {
          var s = JSON.parse(localStorage.getItem(k) || "null");
          if (s && s.access_token) { return s.access_token; }
        }
      }
    } catch (e) {}
    return "";
  }
  function token() {
    try {
      var topo = window.top && window.top !== window ? window.top : null;
      var cliente = (topo && topo.supabaseClient) || window.supabaseClient;
      if (cliente && cliente.auth && cliente.auth.getSession) {
        return cliente.auth.getSession().then(function (r) { return (r && r.data && r.data.session && r.data.session.access_token) || tokenGuardado(); }).catch(tokenGuardado);
      }
    } catch (e) {}
    return Promise.resolve(tokenGuardado());
  }
  function empresa() {
    try { return (window.top.__CONTEXT && window.top.__CONTEXT.empresa_id) || sessionStorage.getItem("empresa_id") || ""; } catch (e) { return sessionStorage.getItem("empresa_id") || ""; }
  }
  function chamar(fn, args) {
    return token().then(function (t) {
      var cab = { "Content-Type": "application/json", apikey: ANON };
      if (t) { cab.Authorization = "Bearer " + t; }
      return fetch(URL_FN, { method: "POST", headers: cab, body: JSON.stringify({ fn: fn, args: args || [], empresa_id: empresa() }) });
    }).then(function (r) {
      return r.json().catch(function () { return { error: "Falha de conexão (" + r.status + ")." }; });
    }).then(function (j) {
      if (j && j.error) { throw new Error(j.error); }
      return j ? j.resultado : null;
    });
  }
  window.CentralDados = { chamar: chamar };
  var proprias = {
    centralEntrar: function () { return Promise.resolve({ ok: true, chave: "acervo" }); },
    centralChamar: function (chave, nome, args) { return chamar(nome, args); }
  };
  window.ACERVO_LOCAL = new Proxy(window.ACERVO_LOCAL || {}, {
    get: function (alvo, nome) {
      if (typeof nome !== "string") { return alvo[nome]; }
      if (alvo[nome]) { return alvo[nome]; }
      if (proprias[nome]) { return proprias[nome]; }
      return function () { return chamar(nome, Array.prototype.slice.call(arguments)); };
    }
  });
})();
