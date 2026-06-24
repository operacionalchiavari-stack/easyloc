(function () {
  "use strict";

  const DEFAULT_PER_PAGE = 20;
  const state = new Map();

  function ensureStyle() {
    if (document.getElementById("easyloc-list-pager-style")) return;

    const style = document.createElement("style");
    style.id = "easyloc-list-pager-style";
    style.textContent = `
      .easyloc-list-pager {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px;
        border-top: 1px solid var(--borda, #e5e7eb);
        background: #fff;
        color: var(--texto-suave, #64748b);
        font-size: 14px;
      }
      .easyloc-list-pager-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .easyloc-list-pager button {
        min-width: 36px;
        height: 36px;
        border: 1px solid var(--borda, #e5e7eb);
        border-radius: 10px;
        background: #fff;
        color: var(--azul, #0f2a44);
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .easyloc-list-pager button.active {
        border-color: var(--color-primary, var(--laranja, #ff6a00));
        color: var(--color-primary, var(--laranja, #ff6a00));
      }
      .easyloc-list-pager button:disabled {
        opacity: .45;
        cursor: not-allowed;
      }
    `;
    document.head.appendChild(style);
  }

  function getState(key) {
    if (!state.has(key)) state.set(key, { page: 1, perPage: DEFAULT_PER_PAGE });
    return state.get(key);
  }

  function slice(key, rows, renderFn, perPage = DEFAULT_PER_PAGE) {
    const data = Array.isArray(rows) ? rows : [];
    const current = getState(key);
    current.perPage = perPage;
    current.lastRows = data;
    current.renderFn = renderFn;

    const totalPages = Math.max(1, Math.ceil(data.length / perPage));
    if (current.page > totalPages) current.page = totalPages;

    const start = (current.page - 1) * perPage;
    return data.slice(start, start + perPage);
  }

  function render(key, anchor, rows, renderFn, perPage = DEFAULT_PER_PAGE) {
    ensureStyle();

    const data = Array.isArray(rows) ? rows : [];
    const current = getState(key);
    const totalPages = Math.max(1, Math.ceil(data.length / perPage));
    const start = data.length ? ((current.page - 1) * perPage) + 1 : 0;
    const end = Math.min(current.page * perPage, data.length);

    const table = anchor?.closest?.("table");
    const host = table?.closest?.(".table-wrapper") || table?.parentElement || anchor?.parentElement;
    if (!host) return;

    let pager = host.nextElementSibling?.classList?.contains("easyloc-list-pager")
      ? host.nextElementSibling
      : null;

    if (!pager) {
      pager = document.createElement("div");
      pager.className = "easyloc-list-pager";
      host.insertAdjacentElement("afterend", pager);
    }

    if (data.length <= perPage) {
      pager.innerHTML = `<span>Mostrando ${data.length} de ${data.length} cadastro(s)</span>`;
      return;
    }

    const pageButtons = [];
    const first = Math.max(1, current.page - 2);
    const last = Math.min(totalPages, first + 4);

    for (let page = first; page <= last; page += 1) {
      pageButtons.push(`
        <button type="button" class="${page === current.page ? "active" : ""}" data-page="${page}">
          ${page}
        </button>
      `);
    }

    pager.innerHTML = `
      <span>Mostrando ${start}-${end} de ${data.length} cadastro(s)</span>
      <div class="easyloc-list-pager-actions">
        <button type="button" data-page="${current.page - 1}" ${current.page <= 1 ? "disabled" : ""}>‹</button>
        ${pageButtons.join("")}
        <button type="button" data-page="${current.page + 1}" ${current.page >= totalPages ? "disabled" : ""}>›</button>
      </div>
    `;

    pager.querySelectorAll("button[data-page]").forEach(button => {
      button.addEventListener("click", () => {
        const next = Number(button.dataset.page || current.page);
        if (!Number.isFinite(next) || next < 1 || next > totalPages) return;
        current.page = next;
        renderFn(data);
      });
    });
  }

  function reset(key) {
    getState(key).page = 1;
  }

  window.EasyLocListPager = { slice, render, reset };
})();
