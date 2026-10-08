/**
 * MENU NO ESTILO DO PORTAL INTERNO — comportamento
 *
 * O dashboard copia o Portal Interno da Chiavari (Modulos/Chiavari/Portal/
 * portal.html): trilho escuro à esquerda que abre ao passar o mouse,
 * "Início" com o mural (js/ui/portalMural.js) e cada sistema aberto na
 * área da direita. Os itens vêm de js/ui/sidebarMenu.js; abrir um sistema
 * continua sendo shellNavigate (iframe) ou carregarNaMain (módulo antigo).
 *
 * Três telas possíveis na área da direita, só uma por vez:
 *   - Início (mural): body.portal-em-inicio, #portalInicio visível;
 *   - sistema novo: #appModuleFrame (appShell.js);
 *   - sistema antigo: #main-content (moduleLoader.js).
 */
(function () {
  "use strict";

  const menu = document.getElementById("sidebar");
  if (!menu) return;

  // O "← Voltar" é criado por appShell.js dentro do menu; aqui ele vira uma
  // faixa fina no topo da área dos sistemas, fora do menu (senão, com o menu
  // aberto, ficaria pintado por cima do nome "CHIAVARI").
  const voltar = document.getElementById("appGlobalBack");
  if (voltar) document.body.appendChild(voltar);

  /* ---------- abrir/fechar ---------- */
  window.portalAlternarGrupo = function (id) {
    const grupo = document.getElementById("grupo-" + id);
    if (!grupo) return;
    document.querySelectorAll("#sidebar .grupo.aberto").forEach((g) => {
      if (g !== grupo) { g.classList.remove("aberto"); g.querySelector(":scope > .menu-item")?.setAttribute("aria-expanded", "false"); }
    });
    fecharFlyouts();
    const aberto = grupo.classList.toggle("aberto");
    grupo.querySelector(":scope > .menu-item")?.setAttribute("aria-expanded", String(aberto));
  };

  /* ---------- extensão do menu para a direita (grupo com flyout:true) ----------
     No computador o painel fica ao lado do menu, na altura do botão que o abriu
     (position:fixed — o menu tem overflow:hidden, mas não corta elementos fixos).
     O painel é filho do menu no HTML, então passar o mouse por ele mantém o menu
     aberto. No celular (≤860px) não há espaço à direita: abre logo abaixo. */
  const celular = () => window.matchMedia("(max-width: 860px)").matches;

  // Fecha as extensões abertas, menos a indicada e as que estão "por fora" dela
  // (a categoria que contém um subgrupo continua aberta enquanto ele está aberto).
  function fecharFlyouts(exceto) {
    document.querySelectorAll("#sidebar .flyout.aberto").forEach((f) => {
      if (exceto && (f === exceto || f.contains(exceto))) return;
      f.classList.remove("aberto");
      f.querySelector(":scope > button")?.setAttribute("aria-expanded", "false");
    });
  }
  window.portalFecharFlyouts = fecharFlyouts;

  function posicionarFlyout(flyout) {
    const painel = flyout.querySelector(":scope > .flyout-painel");
    const botao = flyout.querySelector(":scope > button");
    if (!painel || !botao) return;
    if (celular()) { painel.style.left = painel.style.top = ""; return; }
    // Categoria: ao lado do menu. Subgrupo: ao lado do painel da categoria.
    const painelPai = flyout.parentElement?.closest(".flyout-painel");
    const borda = (painelPai || menu).getBoundingClientRect().right;
    const b = botao.getBoundingClientRect();
    const altura = painel.offsetHeight || 0;
    painel.style.left = Math.round(borda + 8) + "px";
    painel.style.top = Math.round(Math.max(12, Math.min(b.top - 10, window.innerHeight - altura - 12))) + "px";
    // reposiciona subgrupos abertos dentro dele
    painel.querySelectorAll(":scope > .flyout.aberto").forEach(posicionarFlyout);
  }

  window.portalAlternarFlyout = function (id) {
    const flyout = document.getElementById(id);
    if (!flyout) return;
    fecharFlyouts(flyout);
    // abrir uma categoria fecha os subgrupos dela que tinham ficado abertos
    flyout.querySelectorAll(".flyout.aberto").forEach((f) => f.classList.remove("aberto"));
    const aberto = flyout.classList.toggle("aberto");
    flyout.querySelector(":scope > button")?.setAttribute("aria-expanded", String(aberto));
    if (aberto) posicionarFlyout(flyout);
  };

  // O menu muda de largura ao abrir (transição): reposiciona quando termina.
  menu.addEventListener("transitionend", (e) => { if (e.target === menu) document.querySelectorAll("#sidebar .flyout-categoria.aberto").forEach(posicionarFlyout); });
  window.addEventListener("resize", () => document.querySelectorAll("#sidebar .flyout-categoria.aberto").forEach(posicionarFlyout));
  // Tirar o mouse do menu (e do painel, que é filho dele) fecha a extensão.
  menu.addEventListener("mouseleave", () => { if (!celular()) fecharFlyouts(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharFlyouts(); });

  // Nome mantido: o botão do celular e outros pontos antigos chamam toggleMenu().
  window.toggleMenu = function () { menu.classList.toggle("aberto"); };
  window.portalFecharMenu = function () { menu.classList.remove("aberto"); };

  window.toggleUserMenu = function (event) {
    event?.stopPropagation();
    const dd = document.getElementById("userDropdown");
    if (dd) dd.classList.toggle("ver");
  };

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".usuario, .user-dropdown-modern")) document.getElementById("userDropdown")?.classList.remove("ver");
    if (menu.classList.contains("aberto") && !menu.contains(e.target) && !e.target.closest(".abrir-menu")) menu.classList.remove("aberto");
  });

  /* ---------- item ativo ---------- */
  function limparAtivos() {
    document.querySelectorAll("#sidebar .ativo, #sidebar .active").forEach((el) => el.classList.remove("ativo", "active"));
  }

  /* ---------- telas ---------- */
  function mostrarInicio(sim) {
    document.body.classList.toggle("portal-em-inicio", sim);
  }

  window.portalIrInicio = function (semHistorico) {
    mostrarInicio(true);
    limparAtivos();
    document.getElementById("itemInicio")?.classList.add("ativo");
    const frame = document.getElementById("appModuleFrame");
    if (frame && !frame.classList.contains("hidden")) {
      try { frame.contentWindow.location.replace("about:blank"); } catch (e) { frame.src = "about:blank"; }
      frame.classList.add("hidden");
    }
    document.getElementById("global-loader")?.classList.add("hidden");
    document.title = "Portal Interno • Chiavari Eventos";
    if (semHistorico !== true) { try { history.pushState({ page: null }, "", "dashboard.html"); } catch (e) {} }
    menu.classList.remove("aberto");
    window.portalMural?.mostrar();
  };

  function saindoDoInicio(el) {
    mostrarInicio(false);
    limparAtivos();
    if (el && el.classList) el.classList.add("active");
    fecharFlyouts();
    menu.classList.remove("aberto");
  }

  // Envolve os dois motores de navegação: abrir qualquer sistema sai do Início.
  function envolver(nome, pegarEl) {
    const original = window[nome];
    if (typeof original !== "function" || original.__portal) return;
    const novo = async function () {
      saindoDoInicio(pegarEl(arguments));
      return original.apply(this, arguments);
    };
    novo.__portal = true;
    window[nome] = novo;
  }
  envolver("shellNavigate", () => null);
  envolver("carregarNaMain", (args) => args[2]);

  window.addEventListener("popstate", () => {
    const page = new URLSearchParams(location.search).get("page");
    if (!page) window.portalIrInicio(true);
    else mostrarInicio(false);
  });

  /* ---------- estado inicial ---------- */
  const paginaInicial = new URLSearchParams(location.search).get("page");
  if (paginaInicial) {
    mostrarInicio(false);
    document.getElementById("itemInicio")?.classList.remove("ativo");
  } else {
    mostrarInicio(true);
  }

  if (window.lucide) window.lucide.createIcons();
})();
