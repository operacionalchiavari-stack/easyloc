// Compras: foto ao lado do fornecedor e do solicitante (16/11/2026, pedido do usuário: "é uma característica do meu sistema").
// ComprasFoto.fornecedor(id, nome) e ComprasFoto.pessoa(id, nome) devolvem um círculo com as iniciais; a foto entra sozinha
// quando chega (fornecedor: fornecedores.foto_url, procurado pelo id ou pelo nome; pessoa: foto da conta em
// avatares/<empresa>/<usuário>.jpg — se não existir, ficam as iniciais).
(function () {
  "use strict";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const iniciais = (n) => String(n || "?").trim().split(/\s+/).filter((p) => !/^(de|da|do|dos|das|e|ltda|me|eireli|s\/a|sa)$/i.test(p)).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
  const norm = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  let fornecedores = null; // Map id -> url ; Map nome -> url
  async function carregarFornecedores() {
    if (fornecedores) return fornecedores;
    fornecedores = { id: new Map(), nome: new Map() };
    try {
      await window.aguardarContexto?.();
      const emp = window.__CONTEXT?.empresa_id;
      const db=window.AlmoxDemo?.enabled?window.TecnoweldAPI.getClient():window.supabaseClient;
      const { data } = await db.from("fornecedores").select("id,nome_razao_social,nome_fantasia,foto_url").eq("empresa_id", emp);
      (data || []).forEach((f) => {
        if (!f.foto_url) return;
        fornecedores.id.set(f.id, f.foto_url);
        [f.nome_fantasia, f.nome_razao_social].forEach((n) => n && fornecedores.nome.set(norm(n), f.foto_url));
      });
    } catch { /* sem foto: ficam as iniciais */ }
    return fornecedores;
  }
  function urlPessoa(id) {
    if(window.AlmoxDemo?.enabled)return window.AlmoxDemo.photoForUser?.(id)||'';
    const emp = window.__CONTEXT?.empresa_id;
    if (!id || !emp) return "";
    try { return window.supabaseClient.storage.from("avatares").getPublicUrl(`${emp}/${id}.jpg`).data.publicUrl; } catch { return ""; }
  }
  const circulo = (tipo, id, nome, tam) => (!nome || /não informado|^—$/i.test(nome)) ? "" : `<span class="cs-foto cs-foto-${tipo}" data-cs-foto="${tipo}" data-cs-id="${esc(id || "")}" data-cs-nome="${esc(nome || "")}" style="--cs-tam:${tam || 28}px" aria-hidden="true">${esc(iniciais(nome))}</span>`;
  async function preencher(raiz) {
    const alvos = [...(raiz || document).querySelectorAll("[data-cs-foto]:not([data-cs-ok])")];
    if (!alvos.length) return;
    const fz = alvos.some((a) => a.dataset.csFoto === "fornecedor") ? await carregarFornecedores() : null;
    alvos.forEach((a) => {
      a.dataset.csOk = "1";
      const url = a.dataset.csFoto === "fornecedor" ? (fz.id.get(a.dataset.csId) || fz.nome.get(norm(a.dataset.csNome)) || "") : urlPessoa(a.dataset.csId);
      if (!url) return;
      const img = new Image();
      img.alt = "";
      img.onload = () => { a.textContent = ""; a.append(img); a.classList.add("tem-foto"); };
      img.src = url;
    });
  }
  let agendado = false;
  new MutationObserver(() => { if (agendado) return; agendado = true; requestAnimationFrame(() => { agendado = false; primeiraColuna(); prepararDicas(); preencher(); }); })
    .observe(document.documentElement, { childList: true, subtree: true });
  // (16/11/2026) Solicitante e Fornecedor sempre na primeira coluna das listas do Compras (pedido do usuário).
  // Mexe só no que a tela já desenhou: acha a coluna pelo título e a leva para o começo (cabeçalho, <col> e cada linha).
  const COL_PRIMEIRA = /^(solicitante|fornecedor)$/i;
  function primeiraColuna() {
    document.querySelectorAll(".compras-main table.pv-table").forEach((t) => {
      const head = t.tHead?.rows[0];
      if (!head) return;
      if (t.dataset.csCol === undefined) {
        const idx = [...head.cells].findIndex((c) => COL_PRIMEIRA.test(c.textContent.trim()));
        t.dataset.csCol = String(idx);
        t.dataset.csTotal = String(head.cells.length);
        if (idx > 0) {
          head.insertBefore(head.cells[idx], head.cells[0]);
          const cols = t.querySelectorAll(":scope > colgroup > col");
          if (cols.length === head.cells.length) cols[0].parentNode.insertBefore(cols[idx], cols[0]);
        }
      }
      const idx = Number(t.dataset.csCol), total = Number(t.dataset.csTotal);
      if (!(idx > 0)) return;
      [...t.tBodies].forEach((tb) => [...tb.rows].forEach((tr) => {
        if (tr.dataset.csCol || tr.cells.length !== total) return;
        tr.dataset.csCol = "1";
        tr.insertBefore(tr.cells[idx], tr.cells[0]);
      }));
    });
  }
  // (16/11/2026) Cartão branco ao passar o mouse sobre o que a pessoa escreveu (Serviços e Solicitações): o texto completo,
  // no lugar da dica cinza do navegador. Vale para todo .cs-clamp das listas (o title vira data-cs-dica).
  let cartao = null;
  function mostrarDica(el) {
    const txt = el.dataset.csDica; if (!txt) return;
    if (!cartao) { cartao = document.createElement("div"); cartao.className = "cs-dica"; cartao.setAttribute("role", "tooltip"); document.body.append(cartao); }
    const rot = el.closest("td") && el.closest("table")?.tHead?.rows[0]?.cells[el.closest("td").cellIndex]?.textContent.trim();
    cartao.innerHTML = (rot ? `<span class="cs-dica-rot">${esc(rot)}</span>` : "") + `<p>${esc(txt)}</p>`;
    cartao.hidden = false;
    const r = el.getBoundingClientRect(), w = Math.min(380, innerWidth - 24);
    cartao.style.maxWidth = w + "px";
    const cw = cartao.getBoundingClientRect().width;
    const left = Math.max(12, Math.min(r.left, innerWidth - cw - 12));
    let top = r.bottom + 8;
    cartao.style.left = left + "px"; cartao.style.top = top + "px";
    const h = cartao.getBoundingClientRect().height;
    if (top + h > innerHeight - 12) cartao.style.top = Math.max(12, r.top - h - 8) + "px";
  }
  function esconderDica() { if (cartao) cartao.hidden = true; }
  function prepararDicas() {
    document.querySelectorAll(".compras-main .cs-clamp[title]").forEach((el) => { el.dataset.csDica = el.title; el.removeAttribute("title"); el.tabIndex = 0; });
  }
  document.addEventListener("mouseover", (e) => { const el = e.target.closest?.("[data-cs-dica]"); if (el) mostrarDica(el); });
  document.addEventListener("mouseout", (e) => { const el = e.target.closest?.("[data-cs-dica]"); if (el && !el.contains(e.relatedTarget)) esconderDica(); });
  document.addEventListener("focusin", (e) => { const el = e.target.closest?.("[data-cs-dica]"); if (el) mostrarDica(el); });
  document.addEventListener("focusout", esconderDica);
  addEventListener("scroll", esconderDica, true);
  // (16/11/2026) Foto da solicitação abre em prévia na própria tela (não em outra aba); setas quando há mais de uma.
  let visor = null, lista = [], pos = 0;
  function pintarVisor() {
    visor.querySelector("img").src = lista[pos];
    visor.querySelector(".cs-visor-cont").textContent = lista.length > 1 ? `${pos + 1} / ${lista.length}` : "";
    visor.querySelectorAll("[data-cs-visor-nav]").forEach((b) => (b.hidden = lista.length < 2));
  }
  function abrirVisor(fotos, i) {
    if (!visor) {
      visor = document.createElement("dialog"); visor.className = "cs-visor"; visor.setAttribute("aria-label", "Foto");
      visor.innerHTML = '<button type="button" class="cs-visor-fechar" aria-label="Fechar">×</button><button type="button" class="cs-visor-seta is-ant" data-cs-visor-nav="-1" aria-label="Foto anterior">‹</button><img alt=""><button type="button" class="cs-visor-seta is-prox" data-cs-visor-nav="1" aria-label="Próxima foto">›</button><span class="cs-visor-cont"></span>';
      document.body.append(visor);
      visor.addEventListener("click", (e) => {
        const nav = e.target.closest("[data-cs-visor-nav]");
        if (nav) { pos = (pos + Number(nav.dataset.csVisorNav) + lista.length) % lista.length; pintarVisor(); return; }
        if (e.target === visor || e.target.closest(".cs-visor-fechar")) visor.close();
      });
      visor.addEventListener("keydown", (e) => { if (lista.length > 1 && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { pos = (pos + (e.key === "ArrowRight" ? 1 : -1) + lista.length) % lista.length; pintarVisor(); } });
    }
    lista = fotos; pos = i; pintarVisor(); visor.showModal();
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("[data-cs-foto-ver]"); if (!a) return;
    e.preventDefault(); e.stopPropagation();
    const todas = [...a.closest(".cs-fotos").querySelectorAll("[data-cs-foto-ver]")].map((x) => x.getAttribute("href"));
    const extra = (a.closest(".cs-fotos").dataset.csTodas || "").split("|").filter(Boolean);
    const fotos = extra.length ? extra : todas;
    abrirVisor(fotos, Math.max(0, fotos.indexOf(a.getAttribute("href"))));
  }, true);
  window.ComprasFoto = {
    fornecedor: (id, nome, tam) => circulo("fornecedor", id, nome, tam),
    pessoa: (id, nome, tam) => circulo("pessoa", id, nome, tam),
    // nome + foto numa linha só
    comNome: (html, nome, extra = "") => `<span class="cs-com-foto">${html}<span class="cs-com-foto-txt">${nome}${extra}</span></span>`,
    preencher,
  };
})();
