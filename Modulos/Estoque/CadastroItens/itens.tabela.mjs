/* =====================================================
   TABELA DE ITENS
===================================================== */

window.inserirItemNaTabela = function (item) {

  const tbody = document.getElementById("itensTableBody");
  if (!tbody) return;

  const tr = document.createElement("tr");
  tr.style.cursor = "pointer";
  tr.dataset.id = item.id;

  const foto = item.foto_url
    ? `<img src="${item.foto_url}" class="itens-foto" />`
    : `<div class="itens-foto placeholder">📦</div>`;

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
      ${item.tipo || "-"}
    </td>

    <!-- ITEM -->
    <td class="td-item">
      <div class="item-principal">
        ${item.descricao_total || item.produto || "-"}
      </div>
    </td>

    <!-- SETOR -->
    <td class="td-setor">
      ${item.setor_estoque || "-"}
    </td>

    <!-- VALOR -->
    <td class="td-valor">
      R$ ${Number(item.valor_locacao || 0).toFixed(2)}
    </td>

    <!-- ESTOQUE -->
    <td class="td-estoque">
      —
    </td>

    <!-- STATUS -->
    <td class="td-status">
      <span class="status ${item.status === "Inativo" ? "inativo" : "ativo"}">
        ${item.status || "Ativo"}
      </span>
    </td>

  `;

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

window.renderTabelaItens = function (itens) {

  const tbody = document.getElementById("itensTableBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  itens.forEach(item => {
    window.inserirItemNaTabela(item);
  });

};