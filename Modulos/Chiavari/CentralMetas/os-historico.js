(function(){
 'use strict';
 let ordens;
 window.enriquecerOSConcluidas=async function(dados){
  if(!dados.length)return dados;
  const contexto=await window.aguardarContexto(),sb=window.supabaseClient;
  if(!ordens)ordens=sb.rpc('acervo_ordens',{p_empresa:contexto.empresa_id}).then(({data,error})=>{if(error)throw error;return data||[];}).catch(e=>{ordens=null;throw e;});
  const lista=await ordens;
  const porNumero=new Map();
  for(const o of lista.filter(o=>o.fonte!=='sistema')){const numero=String(o.numero);porNumero.set(numero,porNumero.has(numero)?null:o);}
  const codigos=[...new Set(dados.map(o=>porNumero.get(String(o.os))?.codigo).filter(Boolean))];
  let itens=[];
  if(codigos.length){const {data,error}=await sb.from('itens').select('codigo,produto,descricao_total,descricao_complementar,foto_url').eq('empresa_id',contexto.empresa_id).in('codigo',codigos);if(error)throw error;itens=data||[];}
  const pessoas=await sb.from('funcionarios_acesso').select('nome,foto_url').eq('empresa_id',contexto.empresa_id).in('nome',[...new Set(dados.map(o=>o.nome).filter(Boolean))]);
  return dados.map(o=>{
   if(o.fonte==='sistema')return {...o,solicitante_foto:(pessoas.data||[]).find(p=>p.nome===o.nome)?.foto_url||o.solicitante_foto||''};
   const ordem=porNumero.get(String(o.os)),item=itens.find(i=>String(i.codigo)===String(ordem?.codigo));
   const completo=String(item?.descricao_total||item?.produto||o.item||''),complemento=String(item?.descricao_complementar||'').trim();
   return {...o,id:ordem?.id||'',foto_url:item?.foto_url||'',item:(complemento?completo.replace(complemento,''):completo).replace(/\s+/g,' ').trim(),solicitante_foto:(pessoas.data||[]).find(p=>p.nome===o.nome)?.foto_url||'',horaEnvio:String(o.data||'').slice(11,16),onde:ordem?.onde||o.onde||'',pedido:ordem?.pedido||o.pedido||'',detalhes:ordem?.motivo||o.detalhes||'',dataU:ordem?.prazo||o.dataU||'',fluxo:[o.coluna7,o.coluna8,o.coluna9,o.coluna10].map(v=>String(v||'').trim()).filter(Boolean)};
  });
 };
})();
