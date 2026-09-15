(function () {
  "use strict";
  const variants = { sucesso:"success", success:"success", erro:"error", error:"error", perigo:"error", danger:"error", aviso:"warning", warning:"warning", atencao:"warning", info:"info", informacao:"info" };
  const normalize = value => variants[String(value || "warning").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()] || "warning";
  const paths = { success:'<path d="m4 9 3 3 7-7"/>', error:'<path d="m5 5 8 8m0-8-8 8"/>', warning:'<path d="M9 4v6m0 3h.01"/>', info:'<path d="M9 8v6m0-10h.01"/>' };
  let queue = Promise.resolve();
  const toasts = new Map();
  function card(message, title, variant) {
    const el = document.createElement("section");
    el.className = "el-alert";
    el.dataset.variant = normalize(variant);
    el.innerHTML = '<span class="el-alert__icon" aria-hidden="true"><svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">'+paths[el.dataset.variant]+'</svg></span><div><h4></h4><p></p></div>';
    el.querySelector("h4").textContent = title;
    el.querySelector("p").textContent = String(message ?? "");
    return el;
  }
  function button(text, variant, action) {
    const el = document.createElement("button");
    el.type = "button"; el.className = "btn " + variant; el.textContent = text;
    el.addEventListener("click", action); return el;
  }
  window.fecharAlertaGlobal = function () { for (const close of toasts.values()) close(); document.getElementById("alertaGlobal")?.remove(); };
  window.alerta = function (message, title = "Atenção", variant = "warning") {
    let duration = 4000;
    if (title && typeof title === "object") {
      const options = title; title = options.titulo || options.title || "Atenção";
      variant = options.tipo || options.variant || variant;
      duration = Math.max(1000, Number(options.duracao || options.duration) || 4000);
    }
    document.getElementById("alertaGlobal")?.remove();
    let stack = document.querySelector(".el-alert-stack");
    if (!stack) { stack = document.createElement("div"); stack.className = "el-alert-stack"; document.body.appendChild(stack); }
    const el = card(message, title, variant);
    el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
    const close = () => { clearTimeout(toasts.get(el)?.timer); toasts.delete(el); el.remove(); if (!stack.children.length) stack.remove(); };
    el.appendChild(button("Fechar", "secondary", close));
    const progress = document.createElement("span"); progress.className = "el-alert__progress"; progress.setAttribute("aria-hidden", "true");
    el.style.setProperty("--alert-duration", duration+"ms"); el.appendChild(progress);
    toasts.set(el, close); close.timer = setTimeout(close, duration); stack.appendChild(el);
  };
  window.alert = message => window.alerta(message);
  // A native synchronous confirm cannot safely be replaced by a Promise.
  // Callers explicitly await this API; concurrent requests are serialized.
  window.confirmarGlobal = function (message, title = "Confirmação", options = {}) {
    const result = queue.then(() => new Promise(resolve => {
      const previous = document.activeElement;
      const overlay = document.createElement("div"); overlay.className = "el-alert-confirm";
      const el = card(message, title, options.tipo || "warning");
      el.setAttribute("role", "alertdialog"); el.setAttribute("aria-modal", "true");
      el.querySelector("h4").id = "el-confirm-title"; el.querySelector("p").id = "el-confirm-message";
      el.setAttribute("aria-labelledby", "el-confirm-title"); el.setAttribute("aria-describedby", "el-confirm-message");
      const inertStates = [...document.body.children].map(node => [node, node.inert]);
      inertStates.forEach(([node]) => { node.inert = true; });
      const close = value => { overlay.remove(); inertStates.forEach(([node,inert]) => { node.inert = inert; }); if(previous?.isConnected) previous.focus(); resolve(value); };
      const actions = document.createElement("div"); actions.className = "el-alert__actions";
      const cancel = button(options.cancelarTexto || "Não", "secondary", () => close(false));
      const accept = button(options.confirmarTexto || "Sim", "primary", () => close(true));
      actions.append(cancel, accept); el.appendChild(actions); overlay.appendChild(el); document.body.appendChild(overlay);
      overlay.addEventListener("keydown", event => {
        if(event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(false); }
        if(event.key === "Tab") { event.preventDefault(); (document.activeElement === cancel ? accept : cancel).focus(); }
      });
      cancel.focus();
    }));
    queue = result.catch(() => false); return result;
  };
})();
