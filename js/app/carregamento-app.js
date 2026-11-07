/* Carregamento padrão do app da equipe (nov/2026): fundo branco e uma animação discreta (poltrona desenhada em dourado).
   Mesmo para todos os módulos (Triagem, Montagem, Catálogo, Meu bônus). Pedido do usuário: "um carregamento padrão pra
   todos… fundo branco… premium… com a logo da empresa".
   Uso: <script src="…/js/app/carregamento-app.js" data-auto></script> no <head> do módulo: com ?app=1 (aberto pelo app)
   ele já aparece antes de a página desenhar. O módulo chama AppCarregamento.pronto() quando a tela dele está pronta
   (e AppCarregamento.mostrar() quando volta a carregar). Sem chamada, some sozinho em 15 s.
   Desenho: uma poltrona em traço dourado que se desenha e some, em loop (a logo da empresa é branca e não aparecia). */
(function () {
  "use strict";
  if (window.AppCarregamento) return;
  const atual = document.currentScript;
  const params = new URLSearchParams(location.search);
  let doApp = params.get("app") === "1";
  try { if (!doApp && atual && atual.dataset.cond === "catalogo") doApp = sessionStorage.getItem("catalogo_do_app") === "1"; } catch (e) {}
  const automatico = !!(atual && atual.hasAttribute("data-auto") && doApp);

  const CSS = `
#appCarregamento{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:#fff;opacity:1;transition:opacity .45s ease,visibility 0s linear 0s}
#appCarregamento.saindo{opacity:0;visibility:hidden;transition:opacity .45s ease,visibility 0s linear .45s}
#appCarregamento .acg-centro{display:flex;flex-direction:column;align-items:center;gap:18px;animation:acg-entra .7s cubic-bezier(.22,1,.36,1) both}
#appCarregamento svg{width:min(132px,36vw);height:auto;overflow:visible}
#appCarregamento .acg-traco{fill:none;stroke:#b18a5a;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1;animation:acg-desenha 2.8s cubic-bezier(.65,0,.35,1) infinite}
#appCarregamento .acg-traco:nth-child(2){animation-delay:.12s}#appCarregamento .acg-traco:nth-child(3){animation-delay:.24s}
#appCarregamento .acg-traco:nth-child(4){animation-delay:.36s}#appCarregamento .acg-traco:nth-child(5){animation-delay:.48s}#appCarregamento .acg-traco:nth-child(6){animation-delay:.6s}
#appCarregamento .acg-sombra{fill:#efe7da;transform-origin:60px 92px;animation:acg-sombra 2.8s ease-in-out infinite}
#appCarregamento .acg-texto{font:600 11px "Manrope","Inter",system-ui,sans-serif;letter-spacing:.34em;text-transform:uppercase;color:#a0927f;animation:acg-texto 2.8s ease-in-out infinite}
@keyframes acg-entra{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
@keyframes acg-desenha{0%{stroke-dashoffset:1;opacity:1}45%{stroke-dashoffset:0;opacity:1}78%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}
@keyframes acg-sombra{0%,100%{opacity:0;transform:scaleX(.4)}45%,78%{opacity:1;transform:scaleX(1)}}
@keyframes acg-texto{0%,100%{opacity:.45}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){#appCarregamento .acg-centro,#appCarregamento .acg-traco,#appCarregamento .acg-sombra,#appCarregamento .acg-texto{animation:none}#appCarregamento .acg-traco{stroke-dashoffset:0}}
html.app-carregamento-ativo #appAbertura{display:none!important}`;

  let el = null, timer = 0;
  function montar() {
    if (el) return el;
    const st = document.createElement("style"); st.id = "appCarregamentoCss"; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
    el = document.createElement("div");
    el.id = "appCarregamento"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); el.setAttribute("aria-label", "Carregando");
    // Poltrona em traço dourado que se desenha sozinha (a logo da empresa é branca e sumia no fundo branco).
    el.innerHTML = '<div class="acg-centro"><svg viewBox="0 0 120 100" aria-hidden="true">' +
      '<ellipse class="acg-sombra" cx="60" cy="92" rx="44" ry="3.2"></ellipse>' +
      '<path class="acg-traco" pathLength="1" d="M30 58V31c0-8 5-13 13-13h34c8 0 13 5 13 13v27"/>' +
      '<path class="acg-traco" pathLength="1" d="M34 58h52c4 0 7 3 7 7v5H27v-5c0-4 3-7 7-7z"/>' +
      '<path class="acg-traco" pathLength="1" d="M17 70V50c0-5 4-8 8-8s8 3 8 8v20"/>' +
      '<path class="acg-traco" pathLength="1" d="M103 70V50c0-5-4-8-8-8s-8 3-8 8v20"/>' +
      '<path class="acg-traco" pathLength="1" d="M17 70h86M24 70l-3 16M96 70l3 16"/>' +
      '</svg><span class="acg-texto">Carregando</span></div>';
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
