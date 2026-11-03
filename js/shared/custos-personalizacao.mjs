export const padraoCustos = { custo_hora: 0, margem: 0, complexidades: { simples: 0, media: 15, alta: 30 } };
export function numeroMoeda(v){
  if(typeof v==='number')return Number.isFinite(v)?v:0;
  const s=String(v??'').replace(/[^\d,.-]/g,'');
  return Number(s.includes(',')?s.replace(/\./g,'').replace(',','.'):s)||0;
}
export const moedaBR=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function ligarMoeda(el){
  if(!el)return;el.type='text';el.inputMode='decimal';el.removeAttribute('step');el.removeAttribute('min');
  el.placeholder='R$ 0,00';
  el.addEventListener('focus',()=>el.select());
  el.addEventListener('blur',()=>{el.value=moedaBR(numeroMoeda(el.value));});
}
export function nivelComplexidade(v){const n=Number(v)||1;return n>=1.3?'alta':n>=1.15?'media':'simples';}
export function fatorComplexidade(v,config=padraoCustos){return 1+Number(config.complexidades[nivelComplexidade(v)]||0)/100;}
export function calcularPreco(custo,margem,fator){return Math.round(Number(custo)*(1+Number(margem)/100)*Number(fator)*100)/100;}
export async function carregarCadastros(sb,empresa){const r=await sb.rpc('operacao_cadastros_config',{p_empresa:empresa});if(r.error)throw r.error;return r.data;}
