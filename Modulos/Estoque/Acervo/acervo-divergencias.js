/* Divergências de contagem (out/2026): Triagem e Expedição só registram as contagens; aqui o sistema pede a CONTAGEM GERAL
   do item no galpão (uma contagem vale para todas as divergências abertas do item), compara com o que deveria estar lá
   (estoque − manutenção − peças fora em outros eventos), sugere o resultado de cada divergência e o gestor confirma com o
   motivo (Parâmetros). Faltou de verdade: mostra em quais eventos a peça pode ter ficado. */
(function(){
 'use strict';
 const num=v=>v==null||v===''?null:Number(v);
 const fmt=v=>v==null?'—':Number(v).toLocaleString('pt-BR');
 const dataBr=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'-';
 const dataHora=v=>v?new Date(v).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
 let motivos=null;

 // distribui o que a contagem geral mostrou entre as divergências abertas do item
 function sugestoes(g,divs){
  const D=g.contado==null?null:Number(g.contado)-Number(g.esperado);
  const res=new Map();if(D==null)return {D,res};
  let perda=Math.max(0,-D),extra=Math.max(0,D);
  divs.filter(d=>d.tipo==='falta').sort((a,b)=>String(a.criado_em).localeCompare(String(b.criado_em))).forEach(d=>{const p=Math.min(Number(d.quantidade||0),perda);perda-=p;res.set(d.id,{final:Number(d.esperado)-p,perda:p});});
  divs.filter(d=>d.tipo==='sobra').forEach(d=>{const a=Number(d.conferido)-Number(d.esperado),e=Math.min(a,extra);extra-=e;res.set(d.id,{final:Number(d.esperado)+e});});
  return {D,res,perdaSobrando:perda};
 }
 function situacao(d,final){return Number(final)===Number(d.esperado)?'bateu':'continua';}
 // Sem a coluna "Resolução" (pedido do usuário): o resultado de cada divergência é o que a contagem geral sugere; o gestor
 // escolhe um motivo por situação (faltou de verdade / erro de contagem / veio a mais…) e confirma todas do item juntas.
 function gruposMotivo(divs,res){
  const grupos=new Map();
  divs.forEach(d=>{const fin=res.get(d.id)?.final;const sit=situacao(d,fin);const chave=d.tipo+'|'+sit;
   const g=grupos.get(chave)||{chave,d,fin,sit,divs:[],rotulo:d.tipo==='falta'?(sit==='bateu'?'Faltou na contagem, mas as peças estão no galpão':'Faltou de verdade (vira perda)'):(sit==='bateu'?'Veio a mais por erro de contagem':'Veio a mais de verdade')};
   g.divs.push(d);grupos.set(chave,g);});
  return [...grupos.values()];
 }
 function resultadoTexto(d,s){if(!s)return '';const fin=Number(s.final);
  if(d.tipo==='falta'){const perda=Number(d.esperado)-fin;return perda>0?'Perda de '+fmt(perda):'Peças no galpão';}
  const a=fin-Number(d.esperado);return a>0?fmt(a)+' a mais confirmada(s)':'Erro de contagem';}
 function opcoesMotivo(d,final,esc){const sit=situacao(d,final);return '<option value="">Escolha o motivo</option>'+(motivos||[]).filter(m=>m.etapa==='divergencia_'+d.tipo&&(!m.situacao||m.situacao===sit)).map(m=>'<option value="'+esc(m.id)+'">'+esc(m.nome)+'</option>').join('');}

 // histórico compacto numa linha só (rótulo pequeno em cima do número); diferente do que saiu fica destacado
 function historico(d,esc){
  const h=d.historico||{};
  const par=(a,b)=>b!=null&&a!=null&&Number(a)!==Number(b)?'<span class="dv-h-v"><s>'+fmt(a)+'</s>→<b>'+fmt(b)+'</b></span>':'<b>'+fmt(b??a)+'</b>';
  const difere=v=>v!=null&&Number(v)!==Number(h.saiu)?' is-dif':'';
  const cel=(rot,html,cls,title)=>'<span class="dv-h'+(cls||'')+'" title="'+esc(title||rot)+'"><small>'+rot+'</small>'+html+'</span>';
  return '<div class="dv-hist">'+cel('Saiu','<b>'+fmt(h.saiu)+'</b>','','Saiu (pedido)')+cel('Carregamento','<b>'+fmt(h.carregamento)+'</b>',difere(h.carregamento))+
   cel('Desmontagem','<b>'+fmt(h.desmontagem)+'</b>',difere(h.desmontagem),'Desmontagem'+(h.desmontagem_por?' · contado por '+h.desmontagem_por:''))+
   cel('Descarregamento',par(h.descarregamento_1,h.descarregamento),difere(h.descarregamento))+cel('Triagem da volta',par(h.triagem_1,h.triagem),difere(h.triagem))+'</div>'+
   (h.desmontagem_por?'<small class="dv-h-por">Desmontagem contada por '+esc(h.desmontagem_por)+'</small>':'');
 }

 window.AcervoDivergencias={
  async render({host,sb,empresa,esc,msg}){
   host.innerHTML='<div class="ac-card">Carregando divergências…</div>';
   const rpc=async(n,a)=>{const {data,error}=await sb.rpc(n,{p_empresa:empresa,...a});if(error)throw Error(error.message);return data;};
   if(!motivos){const {data}=await sb.from('logistica_motivos').select('id,nome,etapa,situacao,ativo').eq('empresa_id',empresa).in('etapa',['divergencia_falta','divergencia_sobra']).eq('ativo',true).order('nome');motivos=data||[];}
   let dados;
   try{dados=await rpc('acervo_divergencias',{});}catch(e){host.innerHTML='<div class="ac-card">'+esc(e.message)+'</div>';return;}
   const pend=dados.contagens.filter(g=>g.status==='pendente');
   const badge=document.querySelector('[data-aba="divergencias"] .tab-badge');if(badge)badge.textContent=pend.length||'';
   const abertas=dados.divergencias.filter(d=>!d.resolvida_em),resolvidas=dados.divergencias.filter(d=>d.resolvida_em).sort((a,b)=>String(b.resolvida_em).localeCompare(String(a.resolvida_em)));
   // Tabela (pedido do usuário: "não quero em formato de card... podem ser muitos itens"; depois "esteticamente mais bonita,
   // melhor distribuída... histórico de contagem como um ícone"): uma linha por divergência. Item, contagem geral e
   // confirmação ocupam as linhas do mesmo item (rowspan): uma contagem e um Confirmar valem para todas elas.
   const ICONE_HIST='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/><path d="M12 7v5l3 2"/></svg>';
   const linhasItem=g=>{
    const it=g.item||{},divs=abertas.filter(d=>d.item_id===g.item_id),{D,res,perdaSobrando}=sugestoes(g,divs);
    const foto=/^https?:/.test(it.foto||'')?'<img src="'+esc(it.foto)+'" alt="">':'';
    const span=Math.max(1,divs.length),contado=g.contado!=null;
    const itemTd='<td class="dv-c-item" rowspan="'+span+'"><div class="dv-item-id"><span class="dv-foto">'+foto+'</span><div><b class="dv-item-nome" title="'+esc(it.nome||'Item')+'">'+esc(it.nome||'Item')+'</b><small>'+esc(it.codigo||'')+'</small><span class="dv-status '+(contado?'contada':'pend')+'">'+(contado?'Contado · falta confirmar':(dados.bloqueia?'Bloqueado · aguardando contagem':'Aguardando contagem'))+'</span></div></div></td>';
    const contagemTd='<td class="dv-c-contagem" rowspan="'+span+'">'+(!contado
     ?'<form class="dv-contar" data-contar="'+esc(g.id)+'"><label><span>Quantas há no galpão?</span><input type="number" min="0" step="1" inputmode="numeric" required title="Conte tudo que está no galpão, inclusive o que acabou de voltar" aria-label="Quantas unidades deste item há no galpão agora"></label><button class="btn primary">Registrar</button></form>'
     :'<div class="dv-conta"><div class="dv-conta-num"><span><small>Deveria ter</small><b class="dv-deveria">'+fmt(g.esperado)+'</b></span><span><small>Contado</small><b class="dv-contado'+(D<0?' is-perda':D>0?' is-sobra':' is-ok')+'">'+fmt(g.contado)+'</b></span></div><small class="dv-conta-conta">Estoque '+fmt(g.estoque)+' − manutenção '+fmt(g.manutencao)+' − fora '+fmt(g.fora)+(g.contado_por?' · contado por '+esc(g.contado_por):'')+'</small></div>'+
      '<p class="dv-sugestao '+(D<0?'is-perda':'is-ok')+'">'+(D===0?'Bateu: as peças estão no galpão.':D<0?'Faltam <b>'+fmt(-D)+'</b> no galpão.':'<b>'+fmt(D)+'</b> a mais no galpão.')+
      (D<0&&divs.some(d=>d.tipo==='falta')?' Pode ter ficado em: '+divs.filter(d=>d.tipo==='falta').map(d=>'<b>'+esc(d.pedido.local||'local não informado')+'</b> (Pedido '+esc(d.pedido.numero)+')').join(', ')+'.':'')+
      (perdaSobrando>0?' '+fmt(perdaSobrando)+' sem divergência que explique: confira o estoque.':'')+'</p>')+'</td>';
    const confirmarTd='<td class="dv-c-confirmar" rowspan="'+span+'">'+(!contado?'<small class="dv-espera">Faça a contagem geral primeiro</small>':!divs.length?'':
     '<form class="dv-confirmar" data-confirmar-item="'+esc(g.item_id)+'">'+gruposMotivo(divs,res).map(gr=>'<label><span>'+esc(gr.rotulo)+(gr.divs.length>1?' · '+gr.divs.length+' pedidos':'')+'</span><select data-motivo-grupo="'+esc(gr.chave)+'">'+opcoesMotivo(gr.d,gr.fin,esc)+'</select></label>').join('')+'<button class="btn primary">Confirmar'+(divs.length>1?' as '+divs.length:'')+'</button></form>')+'</td>';
    if(!divs.length)return '<tr class="dv-item dv-primeira">'+itemTd+'<td colspan="2" class="dv-sem">Sem divergência aberta.</td>'+contagemTd+confirmarTd+'</tr>';
    return divs.map((d,i)=>{const sug=res.get(d.id),fin=sug?sug.final:'',h=d.historico||{};
     const volta=h.triagem??h.descarregamento;
     const hist='<details class="dv-hist-pop"><summary title="Histórico das contagens" aria-label="Ver o histórico das contagens do Pedido '+esc(d.pedido.numero)+'">'+ICONE_HIST+'<span>'+fmt(h.saiu)+' → '+fmt(volta)+'</span></summary><div class="dv-hist-box"><strong>Histórico das contagens · Pedido '+esc(d.pedido.numero)+'</strong>'+historico(d,esc)+'</div></details>';
     return '<tr data-div="'+esc(d.id)+'"'+(i===0?' class="dv-item dv-primeira"':'')+'>'+(i===0?itemTd:'')+
      '<td class="dv-c-pedido"><div class="dv-ped-topo"><b>Pedido '+esc(d.pedido.numero)+'</b><span class="dv-tipo '+(d.tipo==='falta'?'falta':'sobra')+'">'+(d.tipo==='falta'?'Faltou '+fmt(d.quantidade):fmt(Number(d.conferido)-Number(d.esperado))+' a mais')+' · '+(d.etapa==='descarregamento'?'descarregamento':'triagem')+'</span></div><small>'+esc(d.pedido.cliente||'')+' · '+esc(d.pedido.local||'')+' · '+dataBr(d.pedido.data)+'</small>'+(sug?'<span class="dv-resultado'+(d.tipo==='falta'&&Number(d.esperado)-Number(fin)>0?' is-perda':'')+'">'+esc(resultadoTexto(d,sug))+'</span>':'')+'</td>'+
      '<td class="dv-c-hist">'+hist+'</td>'+(i===0?contagemTd+confirmarTd:'')+'</tr>';}).join('');
   };
   host.innerHTML=
    (pend.length?'<div class="ac-card dv-card-tabela"><div class="dv-rolar"><table class="dv-tabela"><thead><tr><th>Item</th><th>Pedido</th><th class="dv-th-hist" title="Histórico das contagens">Histórico</th><th>Contagem geral</th><th>Confirmar</th></tr></thead><tbody>'+pend.map(linhasItem).join('')+'</tbody></table></div></div>':'<div class="ac-card dv-sem">Nenhuma divergência de contagem pendente.</div>')+
    (resolvidas.length?'<details class="ac-card dv-resolvidas"><summary>Resolvidas nos últimos 60 dias ('+resolvidas.length+')</summary><ul>'+resolvidas.map(d=>'<li><b>Pedido '+esc(d.pedido.numero)+'</b> · '+esc(d.tipo==='falta'?'faltou':'veio a mais')+' · '+esc(d.resolucao||'')+' <small>'+esc(d.resolvido_por||'')+' · '+dataHora(d.resolvida_em)+'</small></li>').join('')+'</ul></details>':'');
   host.querySelectorAll('.dv-hist-pop').forEach(p=>p.addEventListener('toggle',()=>{if(p.open)host.querySelectorAll('.dv-hist-pop[open]').forEach(o=>{if(o!==p)o.open=false;});}));
   if(!host.__dvFora){host.__dvFora=true;document.addEventListener('click',e=>{if(!e.target.closest('.dv-hist-pop'))host.querySelectorAll('.dv-hist-pop[open]').forEach(o=>o.open=false);});}
   const recarregar=()=>window.AcervoDivergencias.render({host,sb,empresa,esc,msg});
   host.querySelectorAll('[data-contar]').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;try{await rpc('acervo_contagem_registrar',{p_contagem:f.dataset.contar,p_contado:Number(f.querySelector('input').value)});msg('Contagem geral registrada.');await recarregar();}catch(err){msg(err.message,true);b.disabled=false;}});
   host.querySelectorAll('[data-confirmar-item]').forEach(form=>form.onsubmit=async e=>{e.preventDefault();
    const g=pend.find(x=>x.item_id===form.dataset.confirmarItem);const divs=abertas.filter(d=>d.item_id===g.item_id);const {res}=sugestoes(g,divs);
    const grupos=gruposMotivo(divs,res),motivo=new Map();
    for(const gr of grupos){const v=form.querySelector('[data-motivo-grupo="'+CSS.escape(gr.chave)+'"]').value;if(!v){msg('Escolha o motivo: '+gr.rotulo+'.',true);return;}gr.divs.forEach(d=>motivo.set(d.id,v));}
    const perdas=divs.filter(d=>d.tipo==='falta').map(d=>({d,p:Number(d.esperado)-Number(res.get(d.id)?.final)})).filter(x=>x.p>0);
    if(perdas.length&&window.confirmarGlobal&&!(await window.confirmarGlobal('Confirmar a perda de '+perdas.map(x=>x.p+' peça(s) no Pedido '+x.d.pedido.numero).join(', ')+'? Dá baixa no estoque.','Confirmar perda')))return;
    const btn=form.querySelector('button');btn.disabled=true;
    try{for(const d of divs)await rpc('acervo_divergencia_fechar',{p_id:d.id,p_contagem:Number(res.get(d.id)?.final),p_motivo:motivo.get(d.id)});msg(divs.length>1?'Divergências resolvidas.':'Divergência resolvida.');await recarregar();}
    catch(err){msg(err.message,true);btn.disabled=false;await recarregar();}});
  }
 };
})();
