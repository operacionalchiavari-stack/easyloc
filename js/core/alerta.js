(function () {
  const nativeAlert = window.alert?.bind(window);

  const VARIANT_MAP = {
    sucesso: "success",
    success: "success",
    erro: "error",
    error: "error",
    perigo: "error",
    danger: "error",
    aviso: "warning",
    warning: "warning",
    atencao: "warning",
    info: "info",
    informacao: "info"
  };

  const ICONS = {
    success: "✓",
    error: "!",
    warning: "!",
    info: "i"
  };

  function normalizeVariant(value) {
    if (!value) return "warning";

    const key = String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    return VARIANT_MAP[key] || "warning";
  }

  function ensureAlertModal() {
    let modal = document.getElementById("alertaGlobal");

    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "alertaGlobal";
    modal.className = "modal-alert-global";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "alertaGlobalTitulo");
    modal.setAttribute("aria-describedby", "alertaGlobalMsg");

    modal.innerHTML = `
      <div class="modal-alert-box">
        <div class="alert-icon" id="alertaGlobalIcon">!</div>
        <h4 id="alertaGlobalTitulo">Atenção</h4>
        <p id="alertaGlobalMsg"></p>
        <button class="btn danger btn-fechar" type="button" onclick="fecharAlertaGlobal()">Fechar</button>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  window.alerta = function (mensagem, titulo = "Atenção", tipo = "warning") {
    if (typeof titulo === "object" && titulo !== null) {
      tipo = titulo.tipo || titulo.variant || tipo;
      titulo = titulo.titulo || titulo.title || "Atenção";
    }

    const modal = ensureAlertModal();
    const msg = document.getElementById("alertaGlobalMsg");
    const tit = document.getElementById("alertaGlobalTitulo");
    const icon = document.getElementById("alertaGlobalIcon") || modal.querySelector(".alert-icon");
    const variant = normalizeVariant(tipo);

    if (!msg || !tit) return;

    msg.textContent = mensagem || "";
    tit.textContent = titulo || "Atenção";
    modal.dataset.variant = variant;

    if (icon) {
      icon.textContent = ICONS[variant] || "!";
    }

    modal.classList.add("is-open");
    modal.style.display = "flex";

    modal.querySelector("button")?.focus();
  };

  window.alert = function (mensagem) {
    if (typeof window.alerta === "function") {
      window.alerta(String(mensagem || ""), "Atenção", "aviso");
      return;
    }

    nativeAlert?.(mensagem);
  };

  window.fecharAlertaGlobal = function () {
    const modal = document.getElementById("alertaGlobal");

    if (!modal) return;

    modal.classList.remove("is-open");
    modal.style.display = "none";
  };

  window.confirmarGlobal = function (mensagem, titulo = "Confirmação", opcoes = {}) {
    return new Promise((resolve) => {
      const modal = document.createElement("div");
      modal.className = "modal-alert-global is-open";
      modal.style.display = "flex";
      modal.dataset.variant = opcoes.tipo || "warning";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");

      modal.innerHTML = `
        <div class="modal-alert-box">
          <div class="alert-icon">?</div>
          <h4>${titulo}</h4>
          <p>${mensagem}</p>
          <div class="el-modal__footer" style="padding:0; border:0; margin-top:20px;">
            <button class="btn secondary" type="button" data-action="cancelar">${opcoes.cancelarTexto || "Cancelar"}</button>
            <button class="btn primary" type="button" data-action="confirmar">${opcoes.confirmarTexto || "Confirmar"}</button>
          </div>
        </div>
      `;

      function close(value) {
        modal.remove();
        resolve(value);
      }

      modal.addEventListener("click", (event) => {
        const action = event.target?.dataset?.action;
        if (action === "confirmar") close(true);
        if (action === "cancelar") close(false);
        if (event.target === modal) close(false);
      });

      document.body.appendChild(modal);
      modal.querySelector("[data-action='confirmar']")?.focus();
    });
  };

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      fecharAlertaGlobal();
    }
  });
})();
