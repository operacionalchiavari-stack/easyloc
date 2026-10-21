export function corDoValor(valor){
  return Number(valor)>0 ? '#15803d' : Number(valor)<0 ? '#b91c1c' : '#6b6b6b';
}
export function colorirValor(el,valor){
  if(el){el.dataset.moneySign=Number(valor)>0?'positive':Number(valor)<0?'negative':'zero';el.style.color=corDoValor(valor);}
}
