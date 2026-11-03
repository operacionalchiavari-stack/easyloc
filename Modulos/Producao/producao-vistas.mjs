const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dia=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
const quando=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'Sem prazo';
const setores={pintura:'Pintura',forracao:'Forração',personalizacao:'Personalização'};
const etapasDaFila=(lista,setor)=>lista.flatMap(t=>t.etapas.filter(e=>['todos','almoxarifado'].includes(setor)||e.setor===setor));
function coluna(lista,etapas){
 if(lista.every(t=>t.cancelado)||etapas.length&&etapas.every(e=>['concluida','cancelada'].includes(e.estado)))return 'concluido';
 if(lista[0].pedido.status==='pre_reserva')return 'aguardando';
 return etapas.some(e=>e.iniciada_em||['execucao','pausada','conferencia','concluida'].includes(e.estado))?'andamento':'aguardando';
}
function avisos(lista){
 return `${lista[0].pedido.status==='pre_reserva'?'<span class="producao-pre">Pré-reserva · aguardar confirmação</span>':''}
 ${lista.some(t=>t.urgente)?'<span class="producao-alerta">Urgente</span>':''}
 ${lista.some(t=>t.revisao)?'<span class="producao-alerta">Alteração para revisar</span>':''}`;
}
export function renderizarFila(itens,{setor='todos',situacao='todas',busca='',executar=false}){
 const grupos=new Map();for(const t of itens){if(!grupos.has(t.pedido_id))grupos.set(t.pedido_id,[]);grupos.get(t.pedido_id).push(t);}
 const filas={aguardando:[],andamento:[],concluido:[]};
 for(const [id,lista] of grupos){
  const p=lista[0].pedido;const etapas=etapasDaFila(lista,setor);if(!etapas.length)continue;
  const lane=coluna(lista,etapas);
  if(lane==='concluido'&&['separado','separado_com_divergencia'].includes(p.triagem_status))continue;
  if(situacao==='abertas'&&lane==='concluido'||situacao==='concluidas'&&lane!=='concluido'||situacao==='pre'&&p.status!=='pre_reserva'||situacao==='revisao'&&!lista.some(t=>t.revisao))continue;
  if(busca&&!JSON.stringify(lista.map(t=>[t.pedido,t.origem])).toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR')))continue;
  const feitas=etapas.filter(e=>e.estado==='concluida').length;const percent=Math.round(feitas/etapas.length*100);
  const nomes=[...new Set(etapas.map(e=>setores[e.setor]))].join(' · ');
  const pecas=lista.reduce((s,t)=>s+Number(t.origem.quantidade||0),0).toLocaleString('pt-BR');
  const temFalta=etapas.some(e=>e.materiais.some(m=>Number(m.recebido)-Number(m.devolvido)<Number(m.necessario)));
  const query=new URLSearchParams({pedido:id,origem_setor:setor,situacao,busca});
  const reabrir=executar&&lane==='concluido'&&lista.some(t=>!t.cancelado)&&lista.every(t=>t.cancelado||!t.revisao&&t.etapas.every(e=>['concluida','cancelada'].includes(e.estado)));
  filas[lane].push(`${reabrir?'<div class="producao-card-concluido">':''}<a class="producao-order-card separacao-order-card" data-pedido="${esc(id)}" data-coluna="${lane}" href="pedido.html?${esc(query.toString())}" aria-label="Abrir produção do pedido ${esc(p.numero)} de ${esc(p.cliente)}">
   <div class="separacao-card-top"><span class="separacao-order-number">Pedido #${esc(p.numero)}</span><span class="card-tipo-ida">OP</span>${lane==='concluido'?'<span class="separacao-done-mark" aria-label="Concluído">✓</span>':''}</div>
   <div class="separacao-card-mainline"><strong>${esc(p.cliente)}</strong><span>${esc(p.local||'Local não informado')}</span></div>
   <div class="separacao-card-meta-line">${dia(p.entrega)} · ${esc(nomes)} · ${pecas} peça(s)</div>
   ${lane==='andamento'?`<div class="separacao-card-progress"><span>${percent}%</span><div class="mini-progress"><span style="width:${percent}%"></span></div><strong>${feitas} / ${etapas.length}</strong></div>`:''}
   ${p.status==='pre_reserva'?'<div class="separacao-lock-note">Pedido em pré-reserva · aguardar confirmação comercial para iniciar a produção.</div>':lista.some(t=>t.revisao)?'<div class="separacao-lock-note">Alteração no pedido: revisar antes de continuar.</div>':lista.some(t=>t.urgente)?'<div class="separacao-lock-note">Urgente · priorizar execução.</div>':temFalta&&lane==='aguardando'?'<div class="separacao-lock-note">Aguardando materiais.</div>':''}
  </a>${reabrir?`<button type="button" class="producao-reabrir" data-reabrir-producao="${esc(id)}">Reabrir produção</button></div>`:''}`);
 }
 const labels={aguardando:['Fila','Aguardando produção'],andamento:['Operação','Em produção'],concluido:['Concluídos','Concluído']};
 const classes={aguardando:'pendente',andamento:'andamento',concluido:'separado'};
 return {total:Object.values(filas).reduce((s,a)=>s+a.length,0),html:`<section class="separacao-board-card"><div class="producao-kanban separacao-kanban">${Object.entries(labels).map(([k,[sub,titulo]])=>`<section class="producao-lane separacao-lane separacao-lane-${classes[k]}" aria-labelledby="lane-${k}"><header><div><span>${sub}</span><h2 id="lane-${k}">${titulo}</h2></div><strong>${filas[k].length}</strong></header><div class="producao-lane-list separacao-lane-list">${filas[k].join('')||'<p class="producao-fila-vazia">Nenhum pedido nesta coluna.</p>'}</div></section>`).join('')}</div></section>`};
}
export function renderizarPedido(lista){
 if(!lista.length)return '<p class="producao-sem-pedido">Pedido não encontrado ou sem ordem de produção disponível.</p>';
 const p=lista[0].pedido;
 const etapas=lista.flatMap(t=>t.etapas);const feitas=etapas.filter(e=>e.estado==='concluida').length;
 const pct=etapas.length?Math.round(feitas/etapas.length*100):0;
 const pecas=lista.reduce((s,t)=>s+Number(t.origem.quantidade||0),0).toLocaleString('pt-BR');
 const fim=lista.map(t=>t.fim_previsto).filter(Boolean).sort().at(-1);
 return `<section class="producao-detalhe-resumo op-resumo">
  <div class="op-resumo-nome"><h2>Pedido #${esc(p.numero)}</h2><strong>${esc(p.cliente)}</strong><div class="producao-card-avisos">${avisos(lista)}</div></div>
  <dl class="op-resumo-dados"><div><dt>Evento</dt><dd>${dia(p.evento)}</dd></div><div><dt>Entrega</dt><dd>${dia(p.entrega)}</dd></div><div><dt>Concluir até</dt><dd>${quando(fim)}</dd></div><div><dt>Itens</dt><dd>${lista.length} · ${pecas} peça(s)</dd></div><div class="op-resumo-local"><dt>Local</dt><dd>${esc(p.local||'Não informado')}</dd></div></dl>
  <div class="op-progresso" style="--pct:${pct}" role="img" aria-label="${pct}% concluído · ${feitas}/${etapas.length} etapas"><b>${pct}%</b></div>
 </section>
`;
}
