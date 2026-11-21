/* =====================================================
   TABELA DE ITENS
===================================================== */

// Mesmo placeholder neutro "Sem foto" usado em item-detalhes.html,
// cadastro-itens.html, itens.foto.mjs, kits.modal.mjs e no Catálogo — sem
// dependência externa, sem a marca "EasyLoc" (pedido explícito do usuário
// em outra parte desta sessão). Se precisar trocar o visual, gerar um novo
// data URI e substituir a mesma string nesses 6 lugares.
const FOTO_SEM_FOTO_PLACEHOLDER = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNDAgMjQwIj48cmVjdCB3aWR0aD0iMjQwIiBoZWlnaHQ9IjI0MCIgZmlsbD0iI2YxZjJmNCIvPjxnIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2M3Y2JkMSIgc3Ryb2tlLXdpZHRoPSI2IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxyZWN0IHg9IjYwIiB5PSI2OCIgd2lkdGg9IjEyMCIgaGVpZ2h0PSI5MCIgcng9IjgiLz48Y2lyY2xlIGN4PSI5MCIgY3k9Ijk2IiByPSIxMCIvPjxwYXRoIGQ9Ik02MCAxNDMgTDEwMCAxMTMgTDEzMCAxMzggTDE1NSAxMTYgTDE4MCAxNDMiLz48L2c+PHRleHQgeD0iMTIwIiB5PSIxODIiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgSGVsdmV0aWNhLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE2IiBmaWxsPSIjOWFhMGE4Ij5TZW0gZm90bzwvdGV4dD48L3N2Zz4=";

window.inserirItemNaTabela = function (item) {

  const tbody = document.getElementById("itensTableBody");
  if (!tbody) return;

  const tr = document.createElement("tr");
  tr.style.cursor = "pointer";
  tr.dataset.id = item.id;

  // Mesmo formato da Disponibilidade de Itens: caixa de 100x80; sem foto, a caixa fica vazia.
  const foto = `<div class="itens-foto-caixa">${item.foto_url ? `<img src="${item.foto_url}" class="itens-foto" alt="" loading="lazy" />` : ""}</div>`;

  const tipoClasse = item.tipo === "Kit" ? "kit" : item.tipo === "Componente" ? "componente" : "item";
  const tipoBadge = item.tipo ? `<span class="tipo-badge ${tipoClasse}">${item.tipo}</span>` : "-";

  // 15/11/2026: nome na 1ª linha e as medidas "(L) … (A) … (P) …" embaixo (como na Disponibilidade); sem coluna QR.
  const escItem = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const nomeCompleto = String(item.descricao_total || item.produto || "-");
  const partesNome = nomeCompleto.match(/^(.*?)\s*(\(L\)[\s\S]*)$/);
  const nomeSemMedidas = partesNome && partesNome[1] ? partesNome[1] : nomeCompleto;
  const medidasItem = partesNome && partesNome[1] ? partesNome[2] : "";

  tr.innerHTML = `

    <!-- FOTO -->
    <td class="td-foto">
      ${foto}
    </td>

    <!-- CÓDIGO -->
    <td class="td-codigo">
      ${item.codigo || "-"}
    </td>

    <!-- TIPO -->
    <td class="td-tipo">
      ${tipoBadge}
    </td>

    <!-- ITEM -->
    <td class="td-item">
      <div class="item-principal">${escItem(nomeSemMedidas)}</div>
      ${medidasItem ? `<div class="item-medidas">${escItem(medidasItem)}</div>` : ""}
    </td>

    <!-- SUBCATEGORIA e ESTILO (15/11/2026) -->
    <td class="td-subcategoria">${escItem(item.subcategoria || "-")}</td>
    <td class="td-estilo">${escItem(item.estilo || "-")}</td>

    <!-- SETOR -->
    <td class="td-setor">
      ${item.setor_estoque || "-"}
    </td>

    <!-- VALOR -->
    <td class="td-valor">
      R$ ${Number(item.valor_locacao || 0).toFixed(2)}
    </td>

    <!-- VALOR DE COMPRA (custo do cadastro, 15/11/2026) -->
    <td class="td-valor td-custo">
      ${item.custo == null || item.custo === "" ? "-" : "R$ " + Number(item.custo || 0).toFixed(2)}
    </td>

    <!-- ESTOQUE -->
    <td class="td-estoque">
      ${item.tipo === "Kit"
        ? '<span class="estoque-kit" title="O estoque de um kit vem das peças que o compõem (veja a Disponibilidade de Itens).">pelas peças</span>'
        : (item.estoque_total == null ? "—" : Number(item.estoque_total).toLocaleString("pt-BR", { maximumFractionDigits: 0 }))}
    </td>

    <!-- STATUS -->
    <td class="td-status">
      <span class="status ${item.ativo === false ? "inativo" : "ativo"}">
        ${item.ativo === false ? "Inativo" : "Ativo"}
      </span>
    </td>

  `;

// A coluna QR saiu da lista (15/11/2026); o QR do item continua na aba "QR Code" da página do item.

/* abrir modal ao clicar */

tr.onclick = () => {

  if(item.tipo === "Kit"){

    if(window.kits_openEdit){
      window.kits_openEdit(item.id);
    }

  }else{

    if(window.abrirDetalhesItem){
      window.abrirDetalhesItem(item);
    }

  }

};

  tbody.appendChild(tr);
};


/* =====================================================
   RENDER DA TABELA
===================================================== */

// Carregamento igual à Disponibilidade de Itens: 20 linhas de cada vez e mais 20 ao rolar até o fim
// ("Carregando mais itens..."), no lugar das páginas numeradas.
const ITENS_POR_LOTE = 20;
let itensLista = [];
let itensMostrados = 0;
let itensObservador = null;

function itensSentinela() {
  let el = document.getElementById("itensMais");
  if (!el) {
    el = document.createElement("div");
    el.id = "itensMais";
    el.className = "itens-mais";
    el.setAttribute("role", "status");
    el.textContent = "Carregando mais itens...";
    el.addEventListener("click", () => mostrarMaisItens());
    document.querySelector(".itens-table-card")?.appendChild(el);
  }
  return el;
}

function mostrarMaisItens() {
  const tbody = document.getElementById("itensTableBody");
  if (!tbody) return;
  const fim = Math.min(itensLista.length, itensMostrados + ITENS_POR_LOTE);
  for (let k = itensMostrados; k < fim; k++) window.inserirItemNaTabela(itensLista[k]);
  itensMostrados = fim;
  const sentinela = itensSentinela();
  sentinela.hidden = itensMostrados >= itensLista.length;
  // O observador só avisa quando a visibilidade muda: se o fim da lista continua à vista, carrega mais.
  if (!sentinela.hidden) requestAnimationFrame(() => {
    if (!sentinela.hidden && sentinela.isConnected && sentinela.getBoundingClientRect().top < innerHeight + 300) mostrarMaisItens();
  });
}

window.renderTabelaItens = function (itens) {
  const tbody = document.getElementById("itensTableBody");
  if (!tbody) return;
  itensLista = Array.isArray(itens) ? itens : [];
  itensMostrados = 0;
  tbody.innerHTML = itensLista.length ? "" : '<tr class="itens-vazio"><td colspan="11">Nenhum item encontrado.</td></tr>';
  document.querySelector(".itens-table-card .easyloc-list-pager")?.remove();
  mostrarMaisItens();
  const sentinela = itensSentinela();
  if (!itensObservador && "IntersectionObserver" in window) {
    itensObservador = new IntersectionObserver((entradas) => {
      if (entradas.some(e => e.isIntersecting) && !sentinela.hidden) mostrarMaisItens();
    }, { rootMargin: "300px 0px" });
    itensObservador.observe(sentinela);
  }
};
