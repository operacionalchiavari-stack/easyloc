// Reparte apenas o saldo programado. Recebimentos já registrados ficam intactos.
export function redistribuirParcelas(total, parcelas){
  const centavos=v=>Math.round((Number(v)||0)*100);
  const alvo=Math.max(0,centavos(total));
  const fixo=parcelas.filter(p=>p.travada).reduce((s,p)=>s+centavos(p.valor),0);
  const editaveis=parcelas.map((p,i)=>p.travada?-1:i).filter(i=>i>=0);
  if(alvo<fixo||!editaveis.length)return parcelas.map(p=>p.valor);
  let restante=alvo-fixo;
  const resultado=parcelas.map(p=>Number(p.valor)||0);
  // Preserva a entrada combinada, ajustando as demais parcelas ao novo saldo.
  const entrada=editaveis.find(i=>parcelas[i].tipo==='Entrada');
  if(entrada!=null&&editaveis.length>1){
    const valor=Math.min(restante,Math.max(0,centavos(parcelas[entrada].valor)));
    resultado[entrada]=valor/100;restante-=valor;editaveis.splice(editaveis.indexOf(entrada),1);
  }
  const base=Math.floor(restante/editaveis.length);
  editaveis.forEach((i,k)=>{resultado[i]=(base+(k===editaveis.length-1?restante-base*editaveis.length:0))/100;});
  return resultado;
}
