/* =====================================================
   FILTROS DE ITENS
===================================================== */

window.itens_aplicarFiltros = function(){

  const texto =
    document.getElementById("itensSearchInput")?.value.toLowerCase() || "";

  const tipo =
    document.getElementById("itensTipoFilter")?.value || "";

  const categoria =
    document.getElementById("itensCategoriaFilter")?.value || "";

  const status =
    document.getElementById("itensStatusFilter")?.value || "";

  const base = window.itensCache || [];

  let filtrados = [...base];

  if(texto){
    filtrados = filtrados.filter(i =>
      i.produto?.toLowerCase().includes(texto)
    );
  }

  if(tipo){
    filtrados = filtrados.filter(i => i.tipo === tipo);
  }

  if(categoria){
    filtrados = filtrados.filter(i => i.categoria === categoria);
  }

  if(status){
    filtrados = filtrados.filter(i => i.status === status);
  }

  window.itensFiltrados = filtrados;

  window.renderTabelaItens(filtrados);

};