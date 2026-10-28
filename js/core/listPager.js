(function () {
  "use strict";

  /* Out/2026: as listas carregam em blocos ao rolar (igual a de Itens Cadastrados), no lugar das páginas
     numeradas. Mesma interface de antes: o módulo chama slice() para saber quais linhas desenhar e render()
     depois de desenhar. Uma lista nova (filtro, busca, recarga) volta para o primeiro bloco; chegar perto do
     fim da tabela desenha o próximo bloco. */
  const BLOCO = 20;
  const state = new Map();

  function ensureStyle() {
    if (document.getElementById("easyloc-list-pager-style")) return;
    const style = document.createElement("style");
    style.id = "easyloc-list-pager-style";
    style.textContent = `
      .easyloc-list-pager{display:flex;align-items:center;justify-content:center;gap:10px;padding:14px 16px;border-top:1px solid var(--borda,#e5e7eb);background:#fff;color:var(--texto-suave,#64748b);font-size:13px}
      .easyloc-list-pager[data-fim="1"]{color:#8a8f96}
      .easyloc-list-pager .easyloc-list-pager-gira{width:14px;height:14px;border:2px solid #d6dbe1;border-top-color:#7d603d;border-radius:50%;animation:easylocPagerGira .8s linear infinite}
      @keyframes easylocPagerGira{to{transform:rotate(360deg)}}
      @media (prefers-reduced-motion:reduce){.easyloc-list-pager .easyloc-list-pager-gira{animation:none}}
    `;
    document.head.appendChild(style);
  }

  function getState(key) {
    if (!state.has(key)) state.set(key, { mostrando: BLOCO });
    return state.get(key);
  }

  function slice(key, rows, renderFn) {
    const data = Array.isArray(rows) ? rows : [];
    const current = getState(key);
    // Lista nova (filtro, busca) volta ao primeiro bloco. Se quem pediu foi o "carregar mais", mantém —
    // há módulo (Caminhões) que busca a lista de novo no banco a cada desenho.
    if (data !== current.lastRows && !current.continuar) current.mostrando = BLOCO;
    current.continuar = false;
    current.lastRows = data;
    current.renderFn = renderFn;
    return data.slice(0, current.mostrando);
  }

  function render(key, anchor, rows, renderFn) {
    ensureStyle();
    const data = Array.isArray(rows) ? rows : [];
    const current = getState(key);
    const table = anchor?.closest?.("table");
    const host = table?.closest?.(".table-wrapper") || table?.parentElement || anchor?.parentElement;
    if (!host) return;

    let pager = host.nextElementSibling?.classList?.contains("easyloc-list-pager") ? host.nextElementSibling : null;
    if (!pager) {
      pager = document.createElement("div");
      pager.className = "easyloc-list-pager";
      host.insertAdjacentElement("afterend", pager);
    }
    const mostrados = Math.min(current.mostrando, data.length);
    const temMais = mostrados < data.length;
    pager.dataset.fim = temMais ? "" : "1";
    pager.setAttribute("role", "status");
    pager.innerHTML = temMais
      ? '<span class="easyloc-list-pager-gira" aria-hidden="true"></span><span>Carregando mais... (' + mostrados + " de " + data.length + ")</span>"
      : "<span>" + (data.length ? data.length + " cadastro(s)" : "Nenhum cadastro") + "</span>";

    current.observer?.disconnect();
    current.observer = null;
    if (!temMais) return;
    const carregarMais = () => {
      if (current.lastRows !== data || current.mostrando >= data.length) return;
      current.mostrando += BLOCO;
      current.continuar = true;
      (current.renderFn || renderFn)(data);
    };
    if ("IntersectionObserver" in window) {
      current.observer = new IntersectionObserver((entradas) => {
        if (entradas.some((e) => e.isIntersecting)) carregarMais();
      }, { rootMargin: "300px 0px" });
      current.observer.observe(pager);
    } else {
      pager.addEventListener("click", carregarMais, { once: true });
    }
  }

  function reset(key) {
    const current = getState(key);
    current.mostrando = BLOCO;
    current.lastRows = null;
  }

  window.EasyLocListPager = { slice, render, reset };
})();
