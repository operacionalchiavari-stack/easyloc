export const AREAS_DESCONTO={locacao:'Locação',frete:'Frete',montagem:'Montagem',customizacao:'Customização'};
const positivo=v=>Math.max(0,Number(v)||0);
export const areaDesconto=config=>Object.hasOwn(AREAS_DESCONTO,config?.descontoComercialArea)?config.descontoComercialArea:'locacao';
export const rotuloDescontoComercial=config=>!config?.descontoComercialArea?'Desconto comercial':({locacao:'Desconto na locação',frete:'Desconto no frete',montagem:'Desconto na montagem',customizacao:'Desconto em customizações'}[areaDesconto(config)]);
export function descontosPorArea(config={}){
  const mapa=config?.descontosAreas;
  return Object.fromEntries(Object.keys(AREAS_DESCONTO).map(area=>[area,positivo(mapa&&typeof mapa==='object'&&!Array.isArray(mapa)?mapa[area]:area===areaDesconto(config)?config?.descontoComercial:0)]));
}
export const totalDescontoComercial=config=>Math.round(Object.values(descontosPorArea(config)).reduce((s,v)=>s+v,0)*100)/100;
export function linhasDescontoComercial(config={}){
  if(!config?.descontosAreas)return positivo(config?.descontoComercial)?[{rotulo:rotuloDescontoComercial(config),valor:-positivo(config.descontoComercial)}]:[];
  return Object.entries(descontosPorArea(config)).filter(([,valor])=>valor>0).map(([area,valor])=>({rotulo:rotuloDescontoComercial({descontoComercialArea:area}),valor:-valor}));
}
// Cada área tem uma única linha de desconto, imediatamente após seu valor bruto.
export function agruparDescontosResumo(linhas=[]){
  const areas={Desconto:'locacao','Desconto comercial':'locacao','Desconto na locação':'locacao',
    'Desconto em customizações':'customizacao','Desconto frete':'frete','Desconto de frete':'frete','Desconto no frete':'frete',
    'Desconto montagem':'montagem','Desconto de montagem':'montagem','Desconto na montagem':'montagem'};
  const alvos={'Valor de locação':'locacao',Locação:'locacao',Customizações:'customizacao',Frete:'frete',Montagem:'montagem'};
  const rotulos={locacao:'Desconto',customizacao:'Desconto em customizações',frete:'Desconto de frete',montagem:'Desconto de montagem'};
  const areaDaLinha=linha=>linha.tipo!=='bv_convertido'&&Object.hasOwn(areas,linha.rotulo)?areas[linha.rotulo]:null;
  const totais=new Map();
  for(const linha of linhas){const area=areaDaLinha(linha);if(area)totais.set(area,(totais.get(area)||0)+(Number(linha.valor)||0));}
  const resumo=[];
  for(const linha of linhas){
    if(areaDaLinha(linha))continue;
    resumo.push({...linha});const area=alvos[linha.rotulo];
    if(totais.has(area)){resumo.push({rotulo:rotulos[area],valor:Math.round(totais.get(area)*100)/100});totais.delete(area);}
  }
  for(const [area,valor] of totais)resumo.push({rotulo:rotulos[area],valor:Math.round(valor*100)/100});
  return resumo;
}
export function baseAreaDesconto(valores={},area='locacao'){
  if(area==='locacao')return positivo(valores.locacao_bv??(positivo(valores.locacao)-positivo(valores.customizacoes)-positivo(valores.servicos)-positivo(valores.terceirizados)));
  if(area==='customizacao')return positivo(valores.customizacoes);
  return positivo(valores[area]);
}
export const descontoNaBaseBV=config=>descontosPorArea(config).locacao;
export function descontarComponente(valores,config){
  const resultado={...valores},d=descontosPorArea(config);
  for(const [comp,valor] of Object.entries({locacao:d.locacao+d.customizacao,frete:d.frete,montagem:d.montagem}))resultado[comp]=Math.max(0,positivo(resultado[comp])-valor);
  return resultado;
}
