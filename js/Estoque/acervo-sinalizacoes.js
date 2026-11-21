(function(){
 'use strict';
 const tipos=[['falta','Falta de peças',true],['sem_livre','Nenhuma peça livre',true],['pouca_folga','Poucas peças livres'],['manutencao','Peças em manutenção'],['fora','Peças fora do galpão'],['contagem','Contagem pendente',true],['sem_protecao','Sem proteção cadastrada'],['protecao_contagem','Proteções nunca contadas'],['protecao_falta','Falta de capas ou caixas',true],['pre_reserva','Pedidos em pré-reserva']];
 function normalizar(valor){return Object.fromEntries(tipos.map(([k,,erro])=>{const r=valor?.[k];return [k,{mostrar:typeof r?.mostrar==='boolean'?r.mostrar:true,dias:r?.dias===null?null:Number.isInteger(r?.dias)&&r.dias>=0&&r.dias<=365?r.dias:erro?30:null}];}));}
 async function carregar(sb,empresa){const {data,error}=await sb.from('acervo_sinalizacoes_config').select('regras').eq('empresa_id',empresa).maybeSingle();if(error)throw error;return normalizar(data?.regras);}
 function diasAte(data,hoje=new Date()){const a=new Date(hoje);a.setHours(0,0,0,0);const b=new Date(String(data).slice(0,10)+'T00:00:00');return Math.round((b-a)/86400000);}
 function contar(lista,regras,avaliar,hoje){return lista.filter(i=>[...new Set((i.pedidos||[]).map(p=>String(p.data||'').slice(0,10)).filter(Boolean))].some(dia=>{const dias=diasAte(dia,hoje);return dias>=0&&avaliar(i,dia).some(s=>regras[s.chave]?.mostrar&&regras[s.chave].dias!==null&&dias<=regras[s.chave].dias);})).length;}
 window.AcervoSinalizacoes={tipos,normalizar,carregar,contar};
})();
