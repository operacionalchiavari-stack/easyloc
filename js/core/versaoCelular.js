/* Versão de celular (nov/2026): no celular, o link do sistema abre o app (app.html) em vez do sistema completo.
   Celular = tela de até 820px com toque, fora de iframe. "Abrir a versão completa" (no app) grava a escolha só nesta
   aba (sessionStorage acervo_versao=completa); ?versao=app desfaz. Com data-ir-para-app no <script>, a página
   (index, login, dashboard) já troca para o app aqui mesmo, antes de desenhar. */
(function(){
  "use strict";
  function ehCelular(){
    try{
      if(window.top !== window){ return false; }
      const toque = (navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;
      return toque && window.matchMedia("(max-width: 820px)").matches;
    }catch(e){ return false; }
  }
  function usarApp(){
    try{
      const v = new URLSearchParams(location.search).get("versao");
      if(v === "app"){ sessionStorage.removeItem("acervo_versao"); }
      if(v === "completa"){ sessionStorage.setItem("acervo_versao", "completa"); }
      if(sessionStorage.getItem("acervo_versao") === "completa"){ return false; }
    }catch(e){}
    return ehCelular();
  }
  window.EasyLocCelular = { ehCelular: ehCelular, usarApp: usarApp,
    abrirVersaoCompleta: function(){ try{ sessionStorage.setItem("acervo_versao", "completa"); }catch(e){} location.href = "dashboard.html"; } };
  const script = document.currentScript;
  if(script && script.hasAttribute("data-ir-para-app") && usarApp()){
    const destino = new URL(script.getAttribute("data-ir-para-app") || "app.html", location.href);
    const empresa = new URLSearchParams(location.search).get("empresa");
    if(empresa){ destino.searchParams.set("empresa", empresa); }
    location.replace(destino.href);
  }
})();
