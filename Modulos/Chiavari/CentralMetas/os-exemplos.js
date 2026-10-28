(function(){
 'use strict';
 let carga;
 window.carregarExemplosManutencao=function(){
  if(carga)return carga;
  carga=(async()=>{
   const contexto=await window.aguardarContexto();
   const {data,error}=await window.supabaseClient.from('itens').select('id,codigo,produto,descricao_total,descricao_complementar,foto_url').eq('empresa_id',contexto.empresa_id).order('foto_url',{ascending:false,nullsFirst:false}).order('produto').limit(100);
   if(error)throw error;
   const itens=(data||[]).filter(i=>i.produto).sort((a,b)=>Number(/^https?:/.test(b.foto_url||''))-Number(/^https?:/.test(a.foto_url||''))).slice(0,24);
   const setores=['Marcenaria','Solda','Acabamento e Pintura','Costura','Forração','Limpeza de Estofados'];
   const danos=['Estrutura com folga; revisar encaixes e fixações.','Junção metálica trincada; refazer solda e conferir estabilidade.','Acabamento riscado; lixar e retocar a pintura.','Costura aberta na lateral; reforçar e revisar o tecido.','Revestimento desgastado; substituir a parte danificada.','Manchas no tecido; higienizar e conferir a secagem.'];
   let solicitantes=[];
   try{const {data,error}=await window.supabaseClient.from('funcionarios_acesso').select('id,nome,foto_url').eq('empresa_id',contexto.empresa_id).order('foto_url',{ascending:false,nullsFirst:false}).limit(12);if(!error)solicitantes=(data||[]).filter(p=>p.nome).sort((a,b)=>Number(/^https?:/.test(b.foto_url||''))-Number(/^https?:/.test(a.foto_url||'')));}catch{}
   const pessoas=['Ana Souza','Bruno Lima','Carla Mendes','Diego Santos'];
   const hoje=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
   const dia=delta=>{const d=new Date(hoje+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);};
   return {sucesso:true,atualizadoEm:new Date().toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo'}),lista:itens.map((item,n)=>{
    const setor=n%setores.length,entrada=dia(-1-n%8);
    const complemento=String(item.descricao_complementar||'').trim();
    const completo=String(item.descricao_total||item.produto);
    const nome=(complemento?completo.replace(complemento,''):completo).replace(/\s+/g,' ').trim();
    return {id:'exemplo-os:'+item.id,exemplo:true,item_id:item.id,codigo:item.codigo,foto_url:item.foto_url,item:nome,os:String(9001+n),data:entrada.split('-').reverse().join('/'),dataOrdem:entrada,horaEnvio:String(8+n%9).padStart(2,'0')+':'+String(n%4*15).padStart(2,'0'),setor:'Retorno do evento',nome:solicitantes.length?solicitantes[n%solicitantes.length].nome:pessoas[n%pessoas.length],solicitante_foto:solicitantes.length?solicitantes[n%solicitantes.length].foto_url:'',qtd:n%3+1,fluxo:n%2?['Limpeza de Estofados',setores[setor]].filter((v,i,a)=>a.indexOf(v)===i):[setores[setor]],onde:['Triagem','Carregamento','Montagem'][n%3],pedido:String(2401+n),detalhes:danos[setor],dataU:dia(2+n%10),ciencia:n%3===0?{status:'confirmado',nome:pessoas[(n+1)%pessoas.length],em:entrada+'T14:00:00-03:00'}:n%3===1?{status:'pendente',equipe:'triagem'}:{status:'contestado',justificativa:'Exemplo: aguardando conferência das fotos.',podeRevisar:false}};
   })};
  })().catch(e=>{carga=null;throw e;});
  return carga;
 };
})();
