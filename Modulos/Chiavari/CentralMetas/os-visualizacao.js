(function(){'use strict';
 const params=new URLSearchParams(location.search);let painel=false;
 try{painel=window.parent!==window&&/\/Estoque\/Acervo\/acervo\.html$/i.test(window.parent.location.pathname);}catch{}
 window.OSGestaoAcervo=false;
 if(!window.OSGestaoAcervo){
  const style=document.createElement('style');style.textContent='#acoesTopo button[onclick="abrirNovaOS()"],#acoesTopo button[onclick="abrirAddItem()"],#barraSelecao,#marcarTodas,#tabela input[type=checkbox],.col-check,[data-ciencia-id],[data-ciencia-revisar]{display:none!important}.data-urgencia-input{display:none!important}';document.head.append(style);
  document.addEventListener('click',e=>{if(e.target.closest('[data-ciencia-id],[data-ciencia-revisar],#barraSelecao')){e.preventDefault();e.stopImmediatePropagation();}},true);
 }
 window.acervoSelecionarOrdem=function(lista){if(!window.OSGestaoAcervo||!params.get('os_id'))return;const os=lista.find(o=>o.id===params.get('os_id'));if(os){estado.buscaOS=os.os;estado.selecionadas.add(os.id);}};
 document.addEventListener('DOMContentLoaded',async()=>{
  if(params.get('concluidas')==='1'){
   const style=document.createElement('style');style.textContent='body{padding:0!important}body>*:not(#modalConcluidas):not(script):not(style){display:none!important}#modalConcluidas{display:flex!important;position:static!important;padding:0!important;background:transparent!important;align-items:flex-start!important}#modalConcluidas .modal-caixa{width:100%!important;max-width:none!important;max-height:none!important;margin:0!important;box-shadow:none!important}#modalConcluidas .modal-topo,#modalConcluidas .modal-fechar{display:none!important}#modalConcluidas .modal-corpo{padding:0!important}#modalConcluidas .filtros-concluidas{padding:14px 0}#modalConcluidas .modal-caixa{border:0!important;background:transparent!important}';document.head.append(style);abrirOSConcluidas();return;
  }
  if(!window.OSGestaoAcervo){const h=document.querySelector('h1');if(h?.firstChild?.nodeType===3)h.firstChild.textContent='Cronograma da manutenção ';return;}
  if(params.get('acao')!=='nova')return;
  abrirNovaOS();
  try{const catalogo=await carregarCatalogo(),item=catalogo.itens.find(i=>String(i.codigo).trim()===String(params.get('codigo')).trim());
   if(item){document.getElementById('osCategoria').value=item.categoria;trocarCategoriaOS();document.getElementById('osItem').value=item.nome;conferirItemOS();}
   document.getElementById('osQuantidade').value=params.get('quantidade')||'';document.getElementById('osPedido').value=params.get('pedido')||'';document.getElementById('osDetalhes').value=params.get('detalhes')||'';
   document.querySelector('#modalNovaOS [data-grupo="ondeDano"] [data-valor="Triagem"]')?.click();
  }catch(e){document.getElementById('erroNovaOS').textContent=e.message;}
 });
})();
