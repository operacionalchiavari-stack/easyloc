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
      i.produto?.toLowerCase().includes(texto) ||
      i.produto_base?.toLowerCase().includes(texto) ||
      i.descricao_total?.toLowerCase().includes(texto) ||
      i.referencia?.toLowerCase().includes(texto) ||
      i.categoria?.toLowerCase().includes(texto) ||
      i.subcategoria?.toLowerCase().includes(texto)
    );
  }

  if(tipo){
    filtrados = filtrados.filter(i => i.tipo === tipo);
  }

  if(categoria){
    filtrados = filtrados.filter(i => i.categoria === categoria);
  }

  if(status){
    // "itens" não tem coluna status — o cadastro usa o booleano "ativo".
    filtrados = filtrados.filter(i => (i.ativo !== false) === (status === "Ativo"));
  }

  window.itensFiltrados = filtrados;

  window.renderTabelaItens(filtrados);

};