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

  const foto = item.foto_url
    ? `<img src="${item.foto_url}" class="itens-foto" />`
    : `<img src="${FOTO_SEM_FOTO_PLACEHOLDER}" class="itens-foto placeholder" alt="Sem foto" />`;

  const tipoClasse = item.tipo === "Kit" ? "kit" : item.tipo === "Componente" ? "componente" : "item";
  const tipoBadge = item.tipo ? `<span class="tipo-badge ${tipoClasse}">${item.tipo}</span>` : "-";

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
      <span class="status ${item.ativo === false ? "inativo" : "ativo"}">
        ${item.ativo === false ? "Inativo" : "Ativo"}
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

  const paginaItens = window.EasyLocListPager?.slice(
    "cadastro-itens",
    itens,
    window.renderTabelaItens
  ) || itens;

  paginaItens.forEach(item => {
    window.inserirItemNaTabela(item);
  });

  window.EasyLocListPager?.render(
    "cadastro-itens",
    tbody,
    itens,
    window.renderTabelaItens
  );

};
