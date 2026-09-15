/**
 * APP SHELL — navegacao do shell para modulos que sao documentos
 * proprios, carregados em <iframe id="appModuleFrame">.
 *
 * Convive em modo dual com js/core/moduleLoader.js (que ainda injeta
 * fragmentos antigos em #main-content) ate que todos os modulos em
 * escopo tenham sido convertidos.
 */
(function () {
  const frame = document.getElementById("appModuleFrame");
  const mainContent = document.getElementById("main-content");
  const loader = document.getElementById("global-loader");

  if (!frame) return;

  function showLoader() {
    loader?.classList.remove("hidden");
  }

  function hideLoader() {
    loader?.classList.add("hidden");
  }

  function activateFrame() {
    mainContent?.classList.add("hidden");
    frame.classList.remove("hidden");
  }

  // Chamado pelo moduleLoader.js legado antes de injetar um fragmento
  // antigo em #main-content, garantindo que só um dos dois apareça.
  window.__activarMainContentLegado = function () {
    frame.classList.add("hidden");
    mainContent?.classList.remove("hidden");
  };

  function clearActiveMenu() {
    document
      .querySelectorAll(".submenu-item.active, [data-module-href].active")
      .forEach((el) => el.classList.remove("active"));
  }

  function syncActiveMenu() {
    let current;
    try {
      current = frame.contentWindow.location.pathname;
    } catch (e) {
      return;
    }

    clearActiveMenu();
    document.querySelectorAll("[data-module-href]").forEach((el) => {
      const target = new URL(el.getAttribute("data-module-href"), location.href).pathname;
      if (target === current) el.classList.add("active");
    });
  }

  function syncTitle() {
    try {
      const t = frame.contentDocument?.title;
      if (t) document.title = t;
    } catch (e) {}
  }

  frame.addEventListener("load", () => {
    let href;
    try {
      href = frame.contentWindow.location.href;
    } catch (e) {
      return;
    }
    if (href === "about:blank") return;

    syncActiveMenu();
    syncTitle();
    hideLoader();
  });

  window.shellNavigate = async function (href) {
    await window.EasyLocPermissions?.load();
    if (!window.EasyLocPermissions?.canNavigate(href)) {
      window.alerta?.("Você não possui acesso a esta parte do sistema.");
      hideLoader();
      return;
    }
    showLoader();
    activateFrame();
    clearActiveMenu();
    frame.src = href;

    try {
      history.pushState({ page: href }, "", "dashboard.html?page=" + encodeURIComponent(href));
    } catch (e) {}
  };

  window.addEventListener("popstate", async () => {
    const page = new URLSearchParams(location.search).get("page");
    if (!page) return;
    await window.EasyLocPermissions?.load();
    if (!window.EasyLocPermissions?.canNavigate(page)) { hideLoader(); return; }

    showLoader();
    activateFrame();
    frame.src = page;
  });
})();
