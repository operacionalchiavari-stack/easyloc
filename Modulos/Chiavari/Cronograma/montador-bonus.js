/* O extrato original da Central usa a sessão individual do Montador. */
(function(){
 'use strict';
 let frame=null,token='';
 function limpar(){frame?.remove();frame=null;token='';}
 function abrir(){
  if(frame&&token===estado.token)return;
  limpar();token=estado.token;
  frame=document.createElement('iframe');frame.title='Meu bônus';
  frame.src=new URL('../CentralMetas/equipe.html?montador=1',location.href).href;
  document.getElementById('bonusConteudo').replaceChildren(frame);
 }
 async function extrato(){
  const atual=estado.token;if(!atual)throw new Error('SESSAO_EXPIRADA');
  try{
   const dados=await chamar('MONT_bonusExtrato',atual);
   if(estado.token!==atual)throw new Error('SESSAO_EXPIRADA');
   return dados;
  }catch(e){
   if(sessaoExpirou(e)&&estado.token===atual){salvarToken('');limpar();mostrarLogin('Sua sessão expirou. Entre de novo.');}
   throw e;
  }
 }
 window.MontadorBonus={abrir,extrato,limpar,atualizar(){limpar();abrir();}};
})();
