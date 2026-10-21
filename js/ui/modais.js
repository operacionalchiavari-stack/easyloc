/**
 * MODAL SYSTEM MODULE — UI Dialog Management
 * 
 * Exports:
 * - window.abrirPerfil()
 * - window.abrirEmpresa()
 */

window.abrirPerfil = function () {
  criarModalPerfil();
};

window.abrirEmpresa = function () {
  const destino='Modulos/Configuracoes/Parametros/parametros.html';
  if(typeof window.shellNavigate==='function')window.shellNavigate(destino);
  else window.location.href=destino;
};
