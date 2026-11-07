/* Carregamento padrão do app da equipe (nov/2026): fundo branco, logo da empresa e uma linha dourada correndo embaixo.
   Mesmo para todos os módulos (Triagem, Montagem, Catálogo, Meu bônus). Pedido do usuário: "um carregamento padrão pra
   todos… fundo branco… premium… com a logo da empresa".
   Uso: <script src="…/js/app/carregamento-app.js" data-auto></script> no <head> do módulo: com ?app=1 (aberto pelo app)
   ele já aparece antes de a página desenhar. O módulo chama AppCarregamento.pronto() quando a tela dele está pronta
   (e AppCarregamento.mostrar() quando volta a carregar). Sem chamada, some sozinho em 15 s.
   A logo vem do que o app (app.html) guardou em localStorage "app_logo_url"; sem ela, do tema da empresa. */
(function () {
  "use strict";
  if (window.AppCarregamento) return;
  const atual = document.currentScript;
  const params = new URLSearchParams(location.search);
  let doApp = params.get("app") === "1";
  try { if (!doApp && atual && atual.dataset.cond === "catalogo") doApp = sessionStorage.getItem("catalogo_do_app") === "1"; } catch (e) {}
  const automatico = !!(atual && atual.hasAttribute("data-auto") && doApp);

  function logo() {
    try {
      const salva = localStorage.getItem("app_logo_url");
      if (salva) return salva;
      const emp = sessionStorage.getItem("empresa_id");
      const tema = emp && JSON.parse(localStorage.getItem("easyloc_theme_" + emp) || "null");
      return (tema && (tema.logo_url || tema.logoUrl)) || "";
    } catch (e) { return ""; }
  }
  function nome() { try { return localStorage.getItem("app_empresa_nome") || "Acervo"; } catch (e) { return "Acervo"; } }

  const CSS = `
#appCarregamento{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:#fff;opacity:1;transition:opacity .45s ease,visibility 0s linear 0s}
#appCarregamento.saindo{opacity:0;visibility:hidden;transition:opacity .45s ease,visibility 0s linear .45s}
#appCarregamento .acg-centro{display:flex;flex-direction:column;align-items:center;gap:26px;animation:acg-entra .7s cubic-bezier(.22,1,.36,1) both}
#appCarregamento .acg-logo{display:block;width:min(210px,58vw);height:auto;max-height:120px;object-fit:contain;animation:acg-respira 2.6s ease-in-out infinite}
#appCarregamento .acg-logo.is-quadrada{height:min(62px,17vw);max-height:none;object-fit:cover;object-position:center 49%}
#appCarregamento .acg-nome{font:500 28px "Cormorant Garamond",Georgia,serif;letter-spacing:.18em;text-transform:uppercase;color:#2b2b28}
#appCarregamento .acg-linha{position:relative;width:min(150px,40vw);height:2px;overflow:hidden;border-radius:2px;background:#efebe4}
#appCarregamento .acg-linha::after{content:"";position:absolute;top:0;bottom:0;left:0;width:42%;border-radius:2px;background:linear-gradient(90deg,transparent,#b18a5a,transparent);animation:acg-corre 1.35s cubic-bezier(.65,0,.35,1) infinite}
@keyframes acg-entra{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
@keyframes acg-respira{0%,100%{opacity:1}50%{opacity:.72}}
@keyframes acg-corre{from{transform:translateX(-110%)}to{transform:translateX(260%)}}
@media (prefers-reduced-motion:reduce){#appCarregamento .acg-centro,#appCarregamento .acg-logo,#appCarregamento .acg-linha::after{animation:none}#appCarregamento .acg-linha::after{left:29%}}
html.app-carregamento-ativo #appAbertura{display:none!important}`;

  let el = null, timer = 0;
  function montar() {
    if (el) return el;
    const st = document.createElement("style"); st.id = "appCarregamentoCss"; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
    el = document.createElement("div");
    el.id = "appCarregamento"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); el.setAttribute("aria-label", "Carregando");
    const url = logo();
    el.innerHTML = '<div class="acg-centro">' + (url ? '<img class="acg-logo" alt="" src="' + String(url).replace(/"/g, "&quot;") + '">' : '<span class="acg-nome"></span>') + '<span class="acg-linha" aria-hidden="true"></span></div>';
    if (!url) el.querySelector(".acg-nome").textContent = nome();
    const img = el.querySelector(".acg-logo");
    if (img) {
      const ajusta = () => { if (img.naturalWidth && img.naturalWidth / img.naturalHeight < 1.6) img.classList.add("is-quadrada"); };
      img.complete ? ajusta() : img.addEventListener("load", ajusta);
      img.addEventListener("error", () => { img.replaceWith(Object.assign(document.createElement("span"), { className: "acg-nome", textContent: nome() })); });
    }
    (document.body || document.documentElement).appendChild(el);
    if (!document.body) document.addEventListener("DOMContentLoaded", () => { if (el && el.parentNode !== document.body) document.body.appendChild(el); });
    return el;
  }
  function mostrar() {
    montar();
    document.documentElement.classList.add("app-carregamento-ativo");
    el.classList.remove("saindo");
    clearTimeout(timer); timer = setTimeout(pronto, 15000);
  }
  function pronto() {
    clearTimeout(timer);
    document.documentElement.classList.remove("app-carregamento-ativo");
    if (el) el.classList.add("saindo");
  }
  window.AppCarregamento = { mostrar, pronto, ativo: () => !!(el && !el.classList.contains("saindo")) };
  // Voltar pelo navegador para uma página guardada (bfcache): nada a carregar.
  window.addEventListener("pageshow", (e) => { if (e.persisted) pronto(); });
  if (automatico) mostrar();
})();
