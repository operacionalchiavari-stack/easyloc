window.alerta = function(mensagem, titulo="Atenção"){

  const modal = document.getElementById("alertaGlobal");
  const msg   = document.getElementById("alertaGlobalMsg");
  const tit   = document.getElementById("alertaGlobalTitulo");

  if(!modal) return;

  msg.innerText = mensagem;
  tit.innerText = titulo;

  modal.style.display="flex";

};

window.fecharAlertaGlobal = function(){

  const modal = document.getElementById("alertaGlobal");

  if(modal){
    modal.style.display="none";
  }

};