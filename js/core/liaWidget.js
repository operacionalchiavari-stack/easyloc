(function () {
  const button = document.getElementById("liaGlobalButton");
  const panel = document.getElementById("liaGlobalPanel");
  const frame = document.getElementById("liaGlobalFrame");
  const close = document.getElementById("liaGlobalClose");
  const minimize = document.getElementById("liaGlobalMinimize");

  if (!button || !panel || !frame) return;

  const LIA_URL = "inteligencia-artificial/assistente-ia.html?widget=1";

  function syncFrameContext() {
    try {
      const win = frame.contentWindow;
      const doc = frame.contentDocument;
      if (!win || !doc) return;

      win.__CONTEXT = window.__CONTEXT || win.__CONTEXT;
      win.__COMPANY_THEME = window.__COMPANY_THEME || win.__COMPANY_THEME;

      const parentStyles = getComputedStyle(document.documentElement);
      ["--color-sidebar", "--color-primary", "--color-bg", "--el-color-primary", "--el-color-accent"].forEach((token) => {
        const value = parentStyles.getPropertyValue(token);
        if (value) doc.documentElement.style.setProperty(token, value.trim());
      });
    } catch (error) {
      console.warn("[Lia Widget] nao foi possivel sincronizar contexto.", error);
    }
  }

  function ensureFrameLoaded() {
    if (frame.getAttribute("src") === "about:blank") {
      frame.setAttribute("src", LIA_URL);
    } else {
      syncFrameContext();
    }
  }

  function openLia() {
    ensureFrameLoaded();
    panel.classList.remove("hidden");
    panel.setAttribute("aria-hidden", "false");
    document.body.classList.add("lia-global-open");
  }

  function hideLia() {
    panel.classList.add("hidden");
    panel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lia-global-open");
  }

  button.addEventListener("click", openLia);
  frame.addEventListener("load", syncFrameContext);
  close?.addEventListener("click", hideLia);
  minimize?.addEventListener("click", hideLia);

  window.openLiaGlobal = openLia;
  window.closeLiaGlobal = hideLia;
})();
