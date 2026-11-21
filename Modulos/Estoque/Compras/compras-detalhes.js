(function(){
 'use strict';
 let card,alvo,timer;
 const manter=()=>clearTimeout(timer);
 function fechar(){manter();if(card)card.hidden=true;alvo?.removeAttribute('aria-describedby');alvo=null;}
 function sair(){manter();timer=setTimeout(fechar,140);}
 function abrir(el){
  manter();if(alvo===el&&card&&!card.hidden)return;
  if(!card){card=document.createElement('div');card.id='comprasDetalheCelula';card.className='pv-cell-card';card.setAttribute('role','tooltip');card.addEventListener('mouseenter',manter);card.addEventListener('mouseleave',sair);document.body.append(card);}
  alvo?.removeAttribute('aria-describedby');alvo=el;alvo.setAttribute('aria-describedby',card.id);
  const conteudo=el.cloneNode(true);conteudo.className='pv-cell-card-content';conteudo.removeAttribute('tabindex');conteudo.removeAttribute('aria-describedby');
  conteudo.querySelectorAll('.pv-cell-more,input').forEach(n=>n.remove());
  conteudo.querySelectorAll('[id],[tabindex]').forEach(n=>{n.removeAttribute('id');n.removeAttribute('tabindex');});
  conteudo.querySelectorAll('details').forEach(n=>n.open=true);
  conteudo.querySelectorAll('button,a,summary').forEach(n=>{const span=document.createElement('span');span.className=n.className;span.textContent=n.textContent;n.replaceWith(span);});
  const titulo=document.createElement('strong');titulo.className='pv-cell-card-title';titulo.textContent=el.closest('td').dataset.colLabel||'Detalhes';card.replaceChildren(titulo,conteudo);card.hidden=false;
  const r=el.getBoundingClientRect(),w=card.offsetWidth,h=card.offsetHeight;
  let left=Math.max(12,Math.min(r.left,innerWidth-w-12)),top;
  if(r.bottom+8+h<=innerHeight-12)top=r.bottom+8;
  else if(r.top-h-8>=12)top=r.top-h-8;
  else{top=Math.max(12,Math.min(r.top,innerHeight-h-12));if(r.left>=w+20)left=r.left-w-8;else if(innerWidth-r.right>=w+20)left=r.right+8;}
  card.style.left=left+'px';card.style.top=top+'px';
 }
 document.addEventListener('mouseover',e=>{const el=e.target.closest?.('.pv-cell-preview');if(el&&!el.contains(e.relatedTarget))abrir(el);});
 document.addEventListener('mouseout',e=>{const el=e.target.closest?.('.pv-cell-preview');if(el&&!el.contains(e.relatedTarget)){if(card?.contains(e.relatedTarget))manter();else sair();}});
 document.addEventListener('focusin',e=>{const el=e.target.closest?.('.pv-cell-preview');if(el)abrir(el);});
 document.addEventListener('focusout',e=>{if(e.target.closest?.('.pv-cell-preview'))sair();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')fechar();});
 document.addEventListener('click',e=>{if(!card?.contains(e.target))fechar();});
 addEventListener('scroll',e=>{if(!card?.contains(e.target))fechar();},true);addEventListener('resize',fechar);
 window.ComprasDetalhes={preparar(body){fechar();for(const tr of body.rows)for(const td of tr.cells){const preview=document.createElement('div');preview.className='pv-cell-preview';preview.tabIndex=0;preview.append(...td.childNodes);const itens=[...preview.children].filter(n=>n.classList.contains('pv-list-item'));if(itens.length>1){const more=document.createElement('span');more.className='pv-cell-more';more.textContent='+'+(itens.length-1);more.setAttribute('aria-label',(itens.length-1)+' registros adicionais');preview.append(more);}td.append(preview);}}};
})();
