(function(){
 'use strict';
 const menu=document.getElementById('prMenuNavegacao');if(!menu)return;
 const mobile=matchMedia('(max-width:800px)'),botoes=[...menu.querySelectorAll('[role=tab]')];
 function responsivo(){menu.open=!mobile.matches;}
 responsivo();mobile.addEventListener('change',responsivo);
 function atualizar(nome){
  const ativo=botoes.find(b=>b.dataset.parametroAba===nome);if(!ativo)return;
  document.getElementById('prMenuAtual').textContent=ativo.textContent;
  botoes.forEach(b=>b.tabIndex=b===ativo?0:-1);
  if(mobile.matches){menu.open=false;menu.querySelector('summary').focus();}
 }
 botoes.forEach(b=>b.tabIndex=b.getAttribute('aria-selected')==='true'?0:-1);
 document.addEventListener('parametros-secao-aberta',e=>atualizar(e.detail.nome));
 menu.addEventListener('keydown',e=>{
  const indice=botoes.indexOf(e.target);if(indice<0)return;
  let alvo;if(e.key==='ArrowDown')alvo=(indice+1)%botoes.length;else if(e.key==='ArrowUp')alvo=(indice-1+botoes.length)%botoes.length;else if(e.key==='Home')alvo=0;else if(e.key==='End')alvo=botoes.length-1;else return;
  e.preventDefault();botoes[alvo].focus();
 });
})();
