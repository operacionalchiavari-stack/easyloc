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

    <!-- QR -->
    <td class="td-qr">
      <button type="button" class="qr-action-btn" title="Ver QR Code">QR</button>
    </td>

    <!-- STATUS -->
    <td class="td-status">
      <span class="status ${item.status === "Inativo" ? "inativo" : "ativo"}">
        ${item.status || "Ativo"}
      </span>
    </td>

  `;

const qrBtn = tr.querySelector(".qr-action-btn");
if(qrBtn){
  qrBtn.onclick = async (event) => {
    event.stopPropagation();

    if(!item.qr_code){
      item.qr_code = window.EasyLocQR?.generateValue?.() || crypto.randomUUID();

      try{
        const { error } = await window.supabaseClient
          ?.from("itens")
          .update({ qr_code: item.qr_code })
          .eq("id", item.id);

        if(error?.code === "42703" || String(error?.message || "").includes("qr_code does not exist")){
          item.qr_code = "";
          window.alerta?.("A coluna qr_code ainda precisa ser aplicada no banco para gerar etiquetas.", "QR Code", "aviso");
          return;
        }
      }catch(error){
        console.warn("Nao foi possivel salvar QR Code do item:", error);
      }
    }

    window.EasyLocQR?.openQuickModal?.({
      qr_code: item.qr_code,
      codigo: item.codigo,
      nome: item.descricao_total || item.produto
    });
  };
}

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
