(function initTecnoweldAlert() {
  const typeLabels = {
    info: "Aviso",
    success: "Tudo certo",
    warning: "Atenção",
    error: "Atenção",
  };
  const severityRank = { info: 1, success: 1, warning: 2, error: 3 };
  const iconByType = { success: "check", error: "x", warning: "triangle-alert", info: "info" };

  let confirmModal = null;
  let confirmResolve = null;

  // Avisos (info/sucesso/atenção/erro) sempre passam por aqui: um unico
  // overlay nao-bloqueante (nunca trava o resto da tela) que junta varios
  // avisos que cheguem em sequencia num so bloco, em vez de empilhar um
  // atras do outro.
  let alertOverlay = null;
  let alertQueue = [];
  let alertCloseTimer = 0;

  const nativeAlert = window.alert?.bind(window);
  const nativeConfirm = window.confirm?.bind(window);

  // Um overlay comum preserva o repaint da página quando o módulo está
  // aberto dentro do iframe do app shell. <dialog> no top layer pode fazer
  // o conteúdo do iframe desaparecer em alguns navegadores.
  function ensureAlertOverlay() {
    if (alertOverlay) return alertOverlay;
    const overlay = document.createElement("div");
    overlay.className = "tw-alert-overlay tw-alert-overlay-toast";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.innerHTML = `
      <section class="tw-alert-modal">
        <div class="tw-alert-icon"><i data-lucide="info"></i></div>
        <div class="tw-alert-content">
          <h2 id="twAlertTitle">Aviso</h2>
          <div id="twAlertMessage"></div>
        </div>
        <div class="tw-alert-actions">
          <button class="tw-alert-close" type="button">OK</button>
        </div>
      </section>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector(".tw-alert-close").addEventListener("click", closeAlert);
    alertOverlay = overlay;
    return overlay;
  }

  function closeAlert() {
    window.clearTimeout(alertCloseTimer);
    alertCloseTimer = 0;
    alertQueue = [];
    alertOverlay?.classList.remove("is-visible");
  }

  function renderAlertQueue() {
    const overlay = ensureAlertOverlay();
    const worst = alertQueue.reduce((acc, item) =>
      severityRank[item.type] > severityRank[acc.type] ? item : acc,
    );
    const needsManual = alertQueue.some((item) => !item.transient);

    overlay.className = `tw-alert-overlay tw-alert-overlay-toast is-visible is-${worst.type}${needsManual ? "" : " is-transient"}`;
    overlay.querySelector(".tw-alert-icon").innerHTML =
      `<i data-lucide="${iconByType[worst.type] || "info"}"></i>`;

    const titleEl = overlay.querySelector("#twAlertTitle");
    const msgEl = overlay.querySelector("#twAlertMessage");
    msgEl.innerHTML = "";
    if (alertQueue.length === 1) {
      titleEl.textContent = alertQueue[0].title || typeLabels[alertQueue[0].type] || "Aviso";
      const p = document.createElement("p");
      p.textContent = alertQueue[0].message || "";
      msgEl.appendChild(p);
    } else {
      titleEl.textContent = typeLabels[worst.type] || "Avisos";
      const list = document.createElement("ul");
      list.className = "tw-alert-list";
      alertQueue.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item.message || "";
        list.appendChild(li);
      });
      msgEl.appendChild(list);
    }

    overlay.querySelector(".tw-alert-actions").hidden = !needsManual;
    window.lucide?.createIcons();

    window.clearTimeout(alertCloseTimer);
    if (!needsManual) {
      const words = alertQueue.reduce(
        (sum, item) => sum + String(item.message || "").trim().split(/\s+/).filter(Boolean).length,
        0,
      );
      const duration = Math.min(9000, Math.max(4000, 2200 + words * 260));
      overlay.style.setProperty("--tw-alert-duration", `${duration}ms`);
      alertCloseTimer = window.setTimeout(closeAlert, duration);
    }
  }

  function ensureConfirmModal() {
    if (confirmModal) return confirmModal;
    const overlay = document.createElement("div");
    overlay.className = "tw-alert-overlay tw-alert-overlay-confirm";
    overlay.setAttribute("role", "presentation");
    overlay.innerHTML = `
      <section class="tw-alert-modal" role="dialog" aria-modal="true" aria-labelledby="twConfirmTitle">
        <div class="tw-alert-icon"><i data-lucide="triangle-alert"></i></div>
        <div class="tw-alert-content">
          <h2 id="twConfirmTitle">Confirmar</h2>
          <p id="twConfirmMessage"></p>
        </div>
        <div class="tw-alert-actions">
          <button class="tw-alert-cancel" type="button">Cancelar</button>
          <button class="tw-alert-close" type="button">Confirmar</button>
        </div>
      </section>
    `;
    document.body.appendChild(overlay);

    const closeButton = overlay.querySelector(".tw-alert-close");
    const cancelButton = overlay.querySelector(".tw-alert-cancel");
    closeButton.addEventListener("click", () => closeConfirm(true));
    cancelButton.addEventListener("click", () => closeConfirm(false));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeConfirm(false);
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeConfirm(false);
      }
    });

    confirmModal = overlay;
    return confirmModal;
  }

  function closeConfirm(result = false) {
    if (!confirmModal) return;
    confirmModal.classList.remove("is-visible");
    if (confirmResolve) {
      confirmResolve(Boolean(result));
      confirmResolve = null;
    }
  }

  // Mensagem tecnica do banco/navegador -> o que aconteceu e o que fazer (2026-09-30). A mensagem original fica no fim
  // entre colchetes quando ajuda o suporte; mensagens ja escritas para o usuario (regras do sistema) passam direto.
  function friendlyMessage(raw) {
    const text = String(raw || "").trim();
    if (!text) return text;
    const tech = (msg) => `${msg} [${text.slice(0, 160)}]`;
    if (/failed to fetch|networkerror|load failed|network request failed|err_internet|err_network/i.test(text)) return "Sem conexão com o servidor. Confira a internet (Wi-Fi) e tente de novo.";
    if (/o servidor não respondeu/i.test(text)) return text;
    if (/jwt expired|invalid jwt|jwt|refresh token|not authenticated|auth session missing/i.test(text)) return "Sua sessão expirou. Saia do sistema e entre de novo com seu e-mail e senha.";
    if (/statement timeout|canceling statement|timeout|timed out|gateway/i.test(text)) return "O servidor demorou para responder. Espere alguns segundos e tente de novo. Se continuar, abra um chamado (menu Chamados).";
    if (/permission denied|42501|row-level security|violates row-level/i.test(text)) return "Você não tem permissão para fazer isso. Peça ao administrador para liberar a permissão no seu cadastro.";
    if (/^sem permiss/i.test(text) && !/administrador/i.test(text)) return `${text.replace(/.?$/, ".")} Peça ao administrador para liberar a permissão no seu cadastro.`;
    if (/duplicate key|violates unique/i.test(text)) return tech("Já existe um registro igual a este. Confira se ele já foi cadastrado.");
    if (/violates foreign key|still referenced/i.test(text)) return tech("Não foi possível: este registro está ligado a outros dados do sistema.");
    if (/null value in column|violates not-null/i.test(text)) return tech("Faltou preencher uma informação obrigatória.");
    if (/violates check constraint|invalid input syntax|out of range|22p02|22003/i.test(text)) return tech("Algum valor informado não é válido. Confira os campos e tente de novo.");
    if (/could not embed|pgrstd+|does not exist|42703|42883|42p01|syntax error/i.test(text)) return tech("Erro interno do sistema. Abra um chamado (menu Chamados) com um print desta mensagem.");
    return text;
  }

  function show(options = {}) {
    if (!document.body) {
      nativeAlert?.(String(options.message || options || ""));
      return;
    }

    const normalized = { ...(typeof options === "string" ? { message: options } : options) };
    const type = normalized.type || "info";
    if (type === "error" || type === "warning") normalized.message = friendlyMessage(normalized.message);
    const transient = normalized.autoClose ?? ["info", "success"].includes(type);
    if (type === "error" || type === "warning") {
      try {
        const key = "for106_ultimos_erros";
        const list = JSON.parse(localStorage.getItem(key) || "[]");
        list.push({ mensagem: String(normalized.message || "").slice(0, 400), tela: document.title.replace(/^For106 \| /, ""), em: new Date().toISOString() });
        localStorage.setItem(key, JSON.stringify(list.slice(-8)));
      } catch (_) { /* armazenamento indisponivel: segue sem contexto */ }
    }

    // Ja tem aviso na tela? Junta a mensagem nova no mesmo bloco em vez de
    // empilhar um overlay atras do outro.
    if (!alertOverlay?.classList.contains("is-visible")) alertQueue = [];
    // a mesma mensagem duas vezes (ex.: dois salvamentos seguidos) aparece uma vez so
    if (alertQueue.some((item) => item.type === type && item.message === (normalized.message || ""))) return;
    alertQueue.push({ type, title: normalized.title, message: normalized.message || "", transient });
    renderAlertQueue();
  }

  function confirm(options = {}) {
    if (!document.body) {
      return Promise.resolve(
        nativeConfirm
          ? nativeConfirm(String(options.message || options || ""))
          : false,
      );
    }

    const normalized =
      typeof options === "string" ? { message: options } : options;
    const type = normalized.type || "warning";
    const modal = ensureConfirmModal();
    const icon = modal.querySelector(".tw-alert-icon");
    const cancelButton = modal.querySelector(".tw-alert-cancel");
    const closeButton = modal.querySelector(".tw-alert-close");
    const iconName =
      type === "error" ? "x" : type === "success" ? "check" : "triangle-alert";

    modal.className = `tw-alert-overlay tw-alert-overlay-confirm is-visible is-${type} is-confirm`;
    modal.querySelector("#twConfirmTitle").textContent =
      normalized.title || typeLabels[type] || "Confirmar";
    modal.querySelector("#twConfirmMessage").textContent =
      normalized.message || "";
    cancelButton.hidden = false;
    closeButton.hidden = false;
    cancelButton.textContent = normalized.cancelText || "Cancelar";
    closeButton.textContent = normalized.confirmText || "Confirmar";
    icon.innerHTML = `<i data-lucide="${iconName}"></i>`;
    window.lucide?.createIcons();
    return new Promise((resolve) => {
      confirmResolve = resolve;
      cancelButton.focus();
    });
  }

  function close(result = false) {
    closeAlert();
    closeConfirm(result);
  }

  window.TecnoAlert = {
    show,
    confirm,
    close,
    info: (message, title) => show({ type: "info", title, message }),
    success: (message, title) => show({ type: "success", title, message }),
    warning: (message, title) => show({ type: "warning", title, message }),
    error: (message, title) => show({ type: "error", title, message: message?.message || message }),
    friendly: friendlyMessage,
  };

  window.alert = (message) =>
    show({ type: "info", message: String(message || "") });

  function fieldLabel(field) {
    const label = field.closest?.("label");
    const text = label?.childNodes?.[0]?.textContent?.replace(/\*/g, "").trim();
    return text || field.getAttribute("aria-label") || field.name || "campo obrigatório";
  }

  function validateForm(form, options = {}) {
    if (!form) return true;
    const fields = [...form.querySelectorAll("input, select, textarea")]
      .filter((field) => !field.disabled && field.type !== "hidden");
    fields.forEach((field) => field.classList.remove("tw-field-invalid"));
    const invalid = fields.find((field) => !field.checkValidity());
    if (!invalid) return true;
    invalid.classList.add("tw-field-invalid");
    invalid.closest("details")?.setAttribute("open", "");
    invalid.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => invalid.focus({ preventScroll: true }), 220);
    const message = invalid.validity.valueMissing
      ? `Preencha o campo ${fieldLabel(invalid)} para continuar.`
      : `Revise o campo ${fieldLabel(invalid)} antes de continuar.`;
    show({ type: "warning", title: options.title || "Informações obrigatórias", message });
    return false;
  }

  window.TecnoValidate = { form: validateForm };
  document.addEventListener("input", (event) => event.target?.classList?.remove("tw-field-invalid"));
  document.addEventListener("change", (event) => event.target?.classList?.remove("tw-field-invalid"));
  document.addEventListener("submit", (event) => {
    if (event.submitter?.formNoValidate) return;
    if (!validateForm(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.('button[type="submit"], input[type="submit"]');
    if (button?.formNoValidate) return;
    const form = button?.form;
    if (form && !validateForm(form)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();
