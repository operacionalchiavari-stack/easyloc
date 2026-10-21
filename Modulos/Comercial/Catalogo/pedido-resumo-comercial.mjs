// Espelha os cálculos do pedido na lista incorporada, mantendo uma única fonte de valores.
let observer;
let frame;
export function montarResumoComercial(host){
  observer?.disconnect();
  if(frame) cancelAnimationFrame(frame);
  const origem=window.parent.document.querySelector('#pedidoCalculosLogistica');
  if(!origem || !host)return;
  const pintar=()=>{
    frame=null;
    if(!host.isConnected){observer?.disconnect();return;}
    const ativo=host.querySelector('input')===document.activeElement;
    if(ativo)return;
    const frete=origem.querySelector('#cardLogisticaPedido');
    const montagem=origem.querySelector('#cardMontagemPedido');
    host.replaceChildren();
    for(const card of [frete,montagem]){
      if(!card)continue;
      const copia=card.cloneNode(true);
      copia.querySelectorAll('.sr-only, .subtotal').forEach(el=>el.remove());
      copia.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
      copia.removeAttribute('id');
      host.appendChild(copia);
    }
    const input=host.querySelector('input');
    if(input){
      input.id='lista-distancia-km';
      host.querySelector('label')?.setAttribute('for',input.id);
      const original=origem.querySelector('#freteKmManual');
      input.value=original?.value || window.parent.kmPedido || '';
      input.addEventListener('blur',()=>{if(!frame)frame=requestAnimationFrame(pintar);});
      input.addEventListener('change',()=>{
        if(original){original.value=input.value;original.dispatchEvent(new window.parent.Event('change',{bubbles:true}));}
      });
    }
  };
  observer=new MutationObserver(()=>{if(!frame)frame=requestAnimationFrame(pintar);});
  observer.observe(origem,{subtree:true,childList:true,characterData:true});
  pintar();
}
