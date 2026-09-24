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

  const trailKey = 'chiavari:navegacao:' + location.pathname;
  const base = new URL('.', location.href);
  function safeModule(href) {
    try {
      const url = new URL(href, base);
      const prefix = new URL('Modulos/', base).pathname;
      return url.origin === location.origin && url.pathname.startsWith(prefix) && /\.html$/i.test(url.pathname)
        && !/\/(login|logout|recuperar-senha)\.html$/i.test(url.pathname) ? url.pathname + url.search + url.hash : null;
    } catch { return null; }
  }
  let trail = [];
  try { trail = JSON.parse(sessionStorage.getItem(trailKey) || '[]').filter(entry => safeModule(entry.href)).slice(-60); } catch {}
  function persistTrail() { try { sessionStorage.setItem(trailKey, JSON.stringify(trail)); } catch {} }
  function record(entry) {
    entry.href = safeModule(entry.href);
    if(!entry.href) return;
    if(trail.at(-1)?.href !== entry.href) trail.push(entry);
    trail = trail.slice(-60); persistTrail();
  }
  window.shellRecordLegacy = (href, js, css) => record({href, js, css, legacy:true});
  let goingBack = false;
  window.shellGoBack = async function() {
    if(goingBack) return;
    goingBack = true;
    try {
      if(!frame.classList.contains('hidden')) {
        try { if(await frame.contentWindow.appGoBack?.()) return; } catch {}
        try { if(await frame.contentWindow.appBeforeLeave?.() === false) return; } catch { return; }
      }
      trail.pop();
      await window.EasyLocPermissions?.load();
      while(trail.length && !window.EasyLocPermissions?.canNavigate(trail.at(-1).href)) trail.pop();
      persistTrail();
      const previous = trail.at(-1);
      if(!previous) { location.replace(new URL('dashboard.html',base).href); return; }
      if(previous.legacy) await window.carregarNaMain(previous.href, previous.js, null, previous.css);
      else await window.shellNavigate(previous.href, {replace:true});
    } finally { goingBack = false; }
  };
  const nav = document.getElementById('sidebar');
  if(nav && !document.getElementById('appGlobalBack')) {
    const button=document.createElement('button');
    button.id='appGlobalBack'; button.type='button'; button.className='app-global-back';
    button.textContent='← Voltar'; button.addEventListener('click',()=>window.shellGoBack());
    const menu=nav.querySelector(':scope > .menu');
    if(menu) menu.after(button); else nav.append(button);
  }

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

    const modulePath = safeModule(href);
    if(modulePath) {
      record({href:modulePath});
      history.replaceState({page:modulePath}, '', 'dashboard.html?page=' + encodeURIComponent(modulePath));
    }

    syncActiveMenu();
    syncTitle();
    hideLoader();
  });

  window.shellNavigate = async function (href, {replace = false} = {}) {
    href = safeModule(href);
    if(!href) return;
    await window.EasyLocPermissions?.load();
    if (!window.EasyLocPermissions?.canNavigate(href)) {
      window.alerta?.("Você não possui acesso a esta parte do sistema.");
      hideLoader();
      return;
    }
    try { if(await frame.contentWindow.appBeforeLeave?.() === false) return; } catch { return; }
    showLoader();
    activateFrame();
    clearActiveMenu();
    record({href});
    try { frame.contentWindow.location.replace(href); } catch { frame.src = href; }

    try {
      history[replace ? 'replaceState' : 'pushState']({ page: href }, "", "dashboard.html?page=" + encodeURIComponent(href));
    } catch (e) {}
  };

  window.addEventListener("popstate", async () => {
    const page = new URLSearchParams(location.search).get("page");
    if (!page || !safeModule(page)) { frame.classList.add('hidden'); mainContent?.classList.remove('hidden'); return; }
    await window.EasyLocPermissions?.load();
    if (!window.EasyLocPermissions?.canNavigate(page)) { hideLoader(); return; }

    showLoader();
    activateFrame();
    const at = trail.findLastIndex(entry=>entry.href===safeModule(page));
    if(at>=0) { trail=trail.slice(0,at+1); persistTrail(); }
    frame.contentWindow.location.replace(page);
  });
  const initialPage = new URLSearchParams(location.search).get('page');
  if(initialPage && safeModule(initialPage)) window.shellNavigate(initialPage, {replace:true});
})();
