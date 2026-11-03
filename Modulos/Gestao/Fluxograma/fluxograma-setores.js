(function(){
 'use strict';
 const ordem=['comercial','financeiro','logistica','estoque','campo','cliente','sistema'];
 const fases=['venda','reserva','planejamento','ida','volta','qualidade','fechamento','posvenda'];
 const nomes={venda:'Atendimento e proposta',reserva:'Reserva e formalização',planejamento:'Planejamento e produção',ida:'Preparação e execução do evento',volta:'Coleta e conferência da volta',qualidade:'Qualidade e recuperação',fechamento:'Apuração e fechamento',posvenda:'Pós-venda e conclusão'};
 const titulos={
  comercial:{venda:'Atender e preparar a proposta',reserva:'Conferir e formalizar a reserva',planejamento:'Negociar prazos e condições',ida:'Resolver mudanças e alternativas',fechamento:'Apoiar o fechamento',posvenda:'Atender o pós-venda'},
  financeiro:{planejamento:'Conferir pagamento da produção',ida:'Conferir pagamento da Triagem e saída',fechamento:'Apurar valores e resolver saldos',posvenda:'Conferir pendências finais'},
  logistica:{planejamento:'Programar equipes, Uber e caminhões',ida:'Revalidar transporte e apoiar o evento',volta:'Definir a programação da volta'},
  estoque:{venda:'Consultar disponibilidade do acervo',planejamento:'Produzir e conferir personalizações',ida:'Separar peças e conferir carregamento',volta:'Conferir descarregamento e retorno',qualidade:'Tratar peças próprias e de terceiros'},
  campo:{ida:'Entregar e executar o evento',volta:'Desmontar e conferir a coleta'},
  cliente:{venda:'Avaliar a proposta',reserva:'Confirmar o aceite da reserva',ida:'Decidir sobre alterações e alternativas',posvenda:'Responder ao pós-venda'},
  sistema:{venda:'Registrar encerramento da negociação',reserva:'Controlar validade e salvar a reserva',posvenda:'Conferir e registrar a conclusão'}
 };
 const equipe=new Set(['equipe_free','qr_free','qr_free_validado','regularizar_qr_free','equipe_completa','uber_free','qr_uber','qr_uber_validado','regularizar_uber','foto_equipe','foto_confirmada','regularizar_envio']);
 const entrega=new Set(['entrega_ok','divergencia_entrega','divergencia_encaminhada','solucionar_entrega','montagem_contratada']);
 function resumir(setor,nos){
  const grupos=new Map();
  for(const n of nos.filter(n=>n.setor===setor)){
   let chave=n.fase,titulo=titulos[setor]?.[n.fase]||nomes[n.fase];
   if(setor==='campo'&&n.fase==='ida'){
    if(entrega.has(n.id)){chave+='-entrega';titulo='Conferir a entrega e as divergências';}
    else if(equipe.has(n.id)){chave+='-equipe';titulo='Conferir equipe, QR e chegada';}
    else if(n.id.startsWith('aguardar_')||n.id==='coleta_autorizada'){chave+='-agenda';titulo='Aguardar o evento e o horário da coleta';}
    else{chave+='-montagem';titulo='Montar e registrar o evento';}
   }
   if(!grupos.has(chave))grupos.set(chave,{chave,fase:n.fase,titulo,etapas:[]});
   grupos.get(chave).etapas.push(n);
  }
  const gruposCampo=['ida-entrega','ida-equipe','ida-montagem','ida-agenda','volta'];
  const lista=[...grupos.values()].sort((a,b)=>setor==='campo'?gruposCampo.indexOf(a.chave)-gruposCampo.indexOf(b.chave):fases.indexOf(a.fase)-fases.indexOf(b.fase));
  return lista.map((g,i)=>({
   id:'resumo-'+setor+'-'+g.chave,setor,fase:g.fase,tipo:'resumo',titulo:g.titulo,
   detalhe:'Resumo das responsabilidades deste setor neste momento do atendimento. Consulte as etapas abaixo para ver as perguntas, respostas e exceções do fluxo completo.',
   membros:g.etapas.map(n=>n.id),decisoes:g.etapas.filter(n=>n.tipo==='decisao').length,
   encaminhamentos:[...new Set(g.etapas.flatMap(n=>n.saidas.map(s=>nos.find(x=>x.id===s.destino)?.setor)).filter(s=>s&&s!==setor))],
   guia:{quem:g.etapas[0].guia.quem,onde:g.etapas[0].guia.onde,concluir:'Consulte as etapas deste grupo e confirme os critérios de cada decisão. A ordem do resumo mostra os momentos de atuação; não elimina condições nem obriga etapas que não se aplicam.',impedimento:g.etapas[0].guia.impedimento},
   saidas:i+1<lista.length?[{rotulo:'Próximo momento',destino:'resumo-'+setor+'-'+lista[i+1].chave}]:[]
  }));
 }
 function planejar(setor,nos,larguraVisivel=1440){
  const grupos=resumir(setor,nos),colunas=larguraVisivel>=1120?3:larguraVisivel>=740?2:1;
  const caixas=grupos.map((g,i)=>{const linha=Math.floor(i/colunas),coluna=linha%2?colunas-1-i%colunas:i%colunas;return {...g,_fx:{x:40+coluna*340,y:60+linha*220,w:240,h:120}};});
  const rotas=caixas.slice(0,-1).map((n,i)=>{
   const a=n._fx,b=caixas[i+1]._fx;let pontos;
   if(a.y===b.y){const direita=b.x>a.x;pontos=[{x:a.x+(direita?a.w:0),y:a.y+a.h/2},{x:b.x+(direita?0:b.w),y:b.y+b.h/2}];}
   else pontos=[{x:a.x+a.w/2,y:a.y+a.h},{x:b.x+b.w/2,y:b.y}];
   return {origem:n.id,destino:caixas[i+1].id,pontos,d:pontos.map((p,j)=>(j?'L':'M')+p.x+','+p.y).join(' ')};
  });
  return {nos:caixas,rotas,largura:Math.max(320,...caixas.map(n=>n._fx.x+n._fx.w+40)),altura:Math.max(240,...caixas.map(n=>n._fx.y+n._fx.h+60))};
 }
 const api={ordem,resumir,planejar};if(typeof module!=='undefined')module.exports=api;else window.AcervoFluxoSetores=api;
})();
