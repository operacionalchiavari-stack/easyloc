(function(){
 'use strict';
 const origem=document.currentScript.src;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const moeda=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const data=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
 const nomes={cotacao:'Em cotação',confirmada:'Confirmada com fornecedor',recebida_parcial:'Recebida parcialmente',recebida:'Recebida',devolvida_parcial:'Devolvida parcialmente',devolvida:'Devolvida ao fornecedor',cancelada:'Cotação/contratação cancelada'};
 const mudancas={cotacao:['cotacao','confirmada','cancelada'],confirmada:['confirmada','recebida_parcial','recebida','cancelada'],recebida_parcial:['recebida_parcial','recebida','devolvida_parcial'],recebida:['recebida','devolvida_parcial','devolvida'],devolvida_parcial:['devolvida_parcial','devolvida'],devolvida:['devolvida'],cancelada:['cancelada']};
 const recebido=s=>Number(s.quantidade_recebida??(['recebida','devolvida'].includes(s.status)?s.quantidade:0));
 const devolvido=s=>Number(s.quantidade_devolvida??(s.status==='devolvida'?s.quantidade:0));
 const urlPedido=id=>new URL('../../Modulos/Comercial/Pedidos/pedido.html?pedido='+encodeURIComponent(id),origem).href;
 async function rpc(nome,args){const r=await window.supabaseClient.rpc(nome,args);if(r.error)throw Error(r.error.message);return r.data;}
 const empresa=()=>window.__CONTEXT?.empresa_id;
 function tabela(lista,acao='editar'){
  if(!lista.length)return '<p class="sl-vazio">Nenhuma sublocação registrada.</p>';
  return '<div class="sl-tabela"><table><thead><tr><th>Pedido / cliente</th><th>Item / fornecedor</th><th>Quantidades</th><th>Custo total</th><th>Retirada / devolução</th><th>Situação</th><th></th></tr></thead><tbody>'+lista.map(s=>'<tr><td>'+esc(s.numero_pedido)+'<small>'+esc(s.cliente)+'</small></td><td>'+esc(s.item_nome)+'<small>'+esc(s.fornecedor_nome)+'</small></td><td>'+esc(s.quantidade)+' contratadas<small>'+recebido(s)+' recebidas · '+devolvido(s)+' devolvidas</small><small>'+Math.max(0,s.quantidade-recebido(s))+' aguardando chegada · '+Math.max(0,recebido(s)-devolvido(s))+' a devolver</small></td><td>'+moeda(s.quantidade*s.custo_unitario)+'</td><td>'+data(s.retirada)+'<small>'+data(s.devolucao)+'</small></td><td>'+esc(nomes[s.status])+'</td><td><button type="button" data-sl-'+acao+'="'+esc(acao==='pedido'?s.pedido_id:s.id)+'">'+(acao==='pedido'?'Gerir pedido':'Consultar / editar')+'</button></td></tr>').join('')+'</tbody></table></div>';
 }
 async function abrir(pedido){
  if(document.querySelector('.sl-dialog[open]'))return;
  const d=document.createElement('dialog');d.className='sl-dialog';d.setAttribute('aria-label','Sublocações');
  d.innerHTML='<header class="sl-cab"><h2>Sublocações</h2><button type="button" data-fechar>Fechar</button></header><p data-status role="status">Carregando…</p><div data-conteudo></div>';
  const status=d.querySelector('[data-status]'),host=d.querySelector('[data-conteudo]');
  let base=null,edicao=null,ocupado=false,seq=0;
  d.querySelector('[data-fechar]').onclick=()=>d.close();d.onclose=()=>{seq++;d.remove();};document.body.append(d);d.showModal();
  async function carregarPedido(id){
   const atual=++seq;status.textContent='Carregando pedido…';
   try{const b=await rpc('pedido_sublocacao_base',{p_pedido:id});if(atual!==seq||!d.open)return;base=b;edicao=null;renderPedido();status.textContent='';}
   catch(e){if(atual===seq)status.textContent=e.message;}
  }
  function renderPedido(){
   const b=base;
   host.innerHTML='<h3>Pedido '+esc(b.pedido.numero)+' · '+esc(b.pedido.cliente)+'</h3><p class="sl-alerta">As peças de outra empresa ficam vinculadas a este pedido. Apenas sublocações confirmadas cobrem a reserva. Registre o recebimento antes de concluir a Triagem e acompanhe a devolução ao fornecedor.</p>'+tabela(b.sublocacoes)+
    '<form class="sl-form"><h3 class="sl-largo" data-titulo>Nova sublocação</h3><label class="sl-item">Item do pedido<select name="item_id" required><option value="">Selecione</option>'+b.itens.map(i=>'<option value="'+esc(i.item_id)+'">'+esc(i.nome)+' · '+esc(i.quantidade)+' no pedido · '+esc(i.sublocada)+' sublocado(s)</option>').join('')+'</select></label><div class="sl-acoes"><button type="button" data-outros>Consultar outros pedidos</button></div><div class="sl-largo" data-alternativas hidden></div>'+
    '<label class="sl-largo">Empresa fornecedora<select name="fornecedor_id" required><option value="">Selecione</option>'+b.fornecedores.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.nome)+'</option>').join('')+'</select><small><a href="'+new URL('../../Modulos/Estoque/CadastroFornecedores/fornecedores.html',origem).href+'" target="_blank" rel="noopener">Cadastrar fornecedor</a> · Salve e reabra este painel para atualizar a lista.</small></label>'+
    '<label>Quantidade<input name="quantidade" type="number" min="1" step="1" required></label><label>Custo unitário da sublocação<input name="custo_unitario" type="number" min="0" step="0.01" required><small>Custo interno. Não altera o preço cobrado do cliente.</small></label><label>Situação<select name="status"></select></label><label>Retirada no fornecedor<input name="retirada" type="date" required></label><label>Devolução ao fornecedor<input name="devolucao" type="date" required></label><div class="sl-total" data-total></div><label class="sl-largo">Referência do fornecedor e observações<textarea name="observacao" maxlength="2000" rows="2"></textarea></label><div class="sl-acoes sl-largo"><button type="submit">Salvar sublocação</button><button type="button" data-novo>Nova sublocação</button><small>O custo fica registrado neste controle; a contratação não gera pagamento automático.</small></div></form>';
   const f=host.querySelector('form');
   f.querySelector('[name=observacao]').closest('label').insertAdjacentHTML('beforebegin','<label>Recebidas acumuladas<input name="quantidade_recebida" type="number" min="0" step="1" value="0" required><small>Total já recebido, incluindo as remessas anteriores.</small></label><label>Devolvidas acumuladas<input name="quantidade_devolvida" type="number" min="0" step="1" value="0" required><small>Total devolvido ao fornecedor, incluindo remessas anteriores.</small></label><div class="sl-largo" data-saldos aria-live="polite"></div>');
   f.querySelector('.sl-acoes.sl-largo').insertAdjacentHTML('beforeend','<button type="button" data-transferir hidden>Transferir saldo a outro fornecedor</button><a target="_blank" rel="noopener" href="'+new URL('../../Modulos/Financeiro/financeiro.html?aba=pagar',origem).href+'">Abrir Contas a pagar</a>');
   function preencher(s){
    edicao=s||null;f.reset();f.querySelector('[data-titulo]').textContent=s?'Sublocação · '+nomes[s.status]:'Nova sublocação';
    const opcoes=s?mudancas[s.status]:['cotacao','confirmada'];f.elements.status.innerHTML=opcoes.map(k=>'<option value="'+k+'">'+nomes[k]+'</option>').join('');
    if(s&&!b.fornecedores.some(x=>x.id===s.fornecedor_id)){const o=document.createElement('option');o.value=s.fornecedor_id;o.textContent=s.fornecedor_nome;f.elements.fornecedor_id.append(o);}
    for(const k of ['item_id','fornecedor_id','quantidade','custo_unitario','retirada','devolucao','status','observacao'])if(s&&s[k]!=null)f.elements[k].value=s[k];
    if(!s){f.elements.retirada.value=b.pedido.entrega||'';f.elements.devolucao.value=b.pedido.coleta||'';}
    f.elements.quantidade_recebida.value=s?recebido(s):0;f.elements.quantidade_devolvida.value=s?devolvido(s):0;
    const travado=!!s&&recebido(s)>0||['devolvida','cancelada'].includes(s?.status);
    for(const k of ['item_id','fornecedor_id','quantidade'])f.elements[k].disabled=travado;
    f.querySelector('[type=submit]').disabled=['devolvida','cancelada'].includes(s?.status);
    f.querySelector('[data-transferir]').hidden=!(s&&recebido(s)>0&&recebido(s)<s.quantidade);
    const detalhe=host.querySelector('[data-alternativas]');detalhe.hidden=true;detalhe.replaceChildren();total();
   }
   function total(){
    const q=Number(f.elements.quantidade.value),r=Number(f.elements.quantidade_recebida.value),v=Number(f.elements.quantidade_devolvida.value),semMovimento=['cotacao','cancelada'].includes(f.elements.status.value),encerrado=['devolvida','cancelada'].includes(edicao?.status);
    f.querySelector('[data-total]').textContent='Custo total: '+moeda(q*Number(f.elements.custo_unitario.value));
    for(const k of ['quantidade_recebida','quantidade_devolvida']){f.elements[k].max=q;f.elements[k].disabled=semMovimento||encerrado;}
    f.elements.quantidade_devolvida.max=r;
    f.querySelector('[data-saldos]').textContent='Aguardando chegada: '+Math.max(0,q-r)+' · A devolver ao fornecedor: '+Math.max(0,r-v)+'. A situação será calculada pelas quantidades conferidas.';
   }
   f.elements.status.addEventListener('change',()=>{
    if(f.elements.status.value==='recebida')f.elements.quantidade_recebida.value=f.elements.quantidade.value;
    if(f.elements.status.value==='devolvida')f.elements.quantidade_devolvida.value=f.elements.quantidade_recebida.value;
    if(['cotacao','cancelada'].includes(f.elements.status.value)){f.elements.quantidade_recebida.value=0;f.elements.quantidade_devolvida.value=0;}
    total();
   });
   f.querySelector('[data-transferir]').onclick=()=>{
    if(!edicao)return;const s=edicao,t=document.createElement('dialog');t.className='sl-dialog';t.setAttribute('aria-label','Transferir saldo de sublocação');
    t.innerHTML='<form><h3>Transferir '+(s.quantidade-recebido(s))+' unidade(s) ainda não recebidas</h3><p>Use depois de confirmar a mudança com os dois fornecedores. As peças já recebidas continuam no fornecedor original. Confira os novos custos e compromissos em Contas a pagar.</p><label>Novo fornecedor<select name="fornecedor_id" required><option value="">Selecione</option>'+b.fornecedores.filter(x=>x.id!==s.fornecedor_id).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nome)+'</option>').join('')+'</select></label><label>Novo custo unitário<input type="number" name="custo_unitario" min="0" step="0.01" required></label><label>Retirada<input type="date" name="retirada" required value="'+esc(s.retirada)+'"></label><label>Devolução<input type="date" name="devolucao" required value="'+esc(s.devolucao)+'"></label><label>Acordo com os fornecedores<textarea name="observacao" minlength="5" maxlength="1800" required></textarea></label><p role="status"></p><button type="button" data-voltar>Voltar</button><button type="submit">Confirmar transferência do saldo</button></form>';
    t.querySelector('[data-voltar]').onclick=()=>t.close();t.onclose=()=>t.remove();document.body.append(t);t.showModal();
    t.querySelector('form').onsubmit=async ev=>{ev.preventDefault();const tf=ev.target,botao=tf.querySelector('[type=submit]');botao.disabled=true;
     try{const payload=Object.fromEntries(new FormData(tf));payload.custo_unitario=Number(payload.custo_unitario);const salvo=await rpc('pedido_sublocacao_transferir_saldo',{p_id:s.id,p_revisao:s.revisao,p_dados:payload});if(!d.open){t.close();return;}base=salvo;renderPedido();status.textContent='Saldo transferido. Confira os recebimentos por fornecedor.';t.close();}
     catch(e){tf.querySelector('[role=status]').textContent=e.message;botao.disabled=false;}
    };
   };
   f.addEventListener('input',total);f.querySelector('[data-novo]').onclick=()=>preencher(null);
   host.querySelectorAll('[data-sl-editar]').forEach(botao=>botao.onclick=()=>{preencher(b.sublocacoes.find(s=>s.id===botao.dataset.slEditar));f.scrollIntoView({block:'start',behavior:'smooth'});});
   f.querySelector('[data-outros]').onclick=async()=>{
    const item=f.elements.item_id.value;if(!item){status.textContent='Selecione o item para consultar as reservas dos outros clientes.';return;}
    const botao=f.querySelector('[data-outros]'),painel=f.querySelector('[data-alternativas]');botao.disabled=true;status.textContent='Consultando reservas…';
    try{const lista=await rpc('pedido_item_outros_pedidos',{p_pedido:b.pedido.id,p_item:item});if(!d.open||base!==b||item!==f.elements.item_id.value)return;
     painel.hidden=false;painel.innerHTML='<p>Negocie com os clientes abaixo. Só remaneje depois do aceite e da atualização do pedido de origem. Se as quantidades liberadas não forem suficientes, continue a busca ou complemente com sublocação.</p>'+(lista.length?'<div class="sl-tabela"><table><thead><tr><th>Pedido</th><th>Cliente / contato</th><th>Reservado do acervo</th><th>Evento</th><th>Etapa</th></tr></thead><tbody>'+lista.map(p=>'<tr><td><a href="'+esc(urlPedido(p.id))+'" target="_blank" rel="noopener">'+esc(p.numero)+'</a></td><td>'+esc(p.cliente)+'<small>'+esc(p.contato)+'</small></td><td>'+esc(p.quantidade)+'</td><td>'+data(p.evento)+'</td><td>'+esc(p.etapa||p.status)+'</td></tr>').join('')+'</tbody></table></div>':'<p>Nenhuma reserva do mesmo item em outro pedido neste período. Consulte fornecedores para sublocação.</p>');status.textContent='';
    }catch(e){status.textContent=e.message;}finally{botao.disabled=false;}
   };
   f.onsubmit=async ev=>{
    ev.preventDefault();if(ocupado)return;const dados=Object.fromEntries(['item_id','fornecedor_id','retirada','devolucao','status','observacao'].map(k=>[k,f.elements[k].value]));
    dados.quantidade=Number(f.elements.quantidade.value);dados.custo_unitario=Number(f.elements.custo_unitario.value);
    dados.quantidade_recebida=Number(f.elements.quantidade_recebida.value);dados.quantidade_devolvida=Number(f.elements.quantidade_devolvida.value);
    if(!Number.isInteger(dados.quantidade)||dados.quantidade<1||!Number.isFinite(dados.custo_unitario)||dados.custo_unitario<0){status.textContent='Informe quantidade inteira e custo válido.';return;}
    if(dados.devolucao<dados.retirada){status.textContent='A devolução precisa ser na retirada ou depois.';return;}
    if(!Number.isInteger(dados.quantidade_recebida)||!Number.isInteger(dados.quantidade_devolvida)||dados.quantidade_devolvida<0||dados.quantidade_recebida<dados.quantidade_devolvida||dados.quantidade_recebida>dados.quantidade){status.textContent='Confira os totais: devolvido não pode superar o recebido, e recebido não pode superar o contratado.';return;}
    ocupado=true;const botao=f.querySelector('[type=submit]');botao.disabled=true;status.textContent='Salvando…';
    try{const salvo=await rpc('pedido_sublocacao_salvar',{p_pedido:b.pedido.id,p_dados:dados,p_id:edicao?.id||null,p_revisao:edicao?.revisao??null});if(!d.open)return;base=salvo;renderPedido();status.textContent='Sublocação salva. A lista comercial e o preço do cliente foram preservados.';window.dispatchEvent(new CustomEvent('pedido-sublocacao-salva',{detail:{pedidoId:b.pedido.id}}));}
    catch(e){status.textContent=e.message;botao.disabled=false;}finally{ocupado=false;}
   };preencher(null);
  }
  async function carregarCentral(){
   const todas=await rpc('pedido_sublocacoes_listar',{p_empresa:empresa(),p_pedido:null});if(!d.open)return;
   host.innerHTML='<div class="sl-filtros"><label>Buscar pedido para sublocar<input type="search" data-busca placeholder="Número do pedido ou cliente"></label><button type="button" data-buscar>Buscar pedidos</button><label>Filtrar sublocações<select data-situacao><option value="">Todas</option>'+Object.entries(nomes).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label></div><div data-pedidos></div><div data-lista></div>';
   const lista=host.querySelector('[data-lista]'),filtro=host.querySelector('[data-situacao]');
   const render=()=>{lista.innerHTML=tabela(todas.filter(s=>!filtro.value||s.status===filtro.value),'pedido');lista.querySelectorAll('[data-sl-pedido]').forEach(b=>b.onclick=()=>carregarPedido(b.dataset.slPedido));};filtro.onchange=render;render();
   const buscar=async()=>{const n=++seq;try{const l=await rpc('pedido_sublocacao_pedidos_buscar',{p_empresa:empresa(),p_busca:host.querySelector('[data-busca]').value.trim()});if(n!==seq||!d.open)return;const box=host.querySelector('[data-pedidos]');box.innerHTML=l.length?'<div class="sl-acoes">'+l.map(p=>'<button type="button" data-id="'+esc(p.id)+'">Pedido '+esc(p.numero_pedido)+' · '+esc(p.cliente_nome)+'</button>').join('')+'</div>':'<p>Nenhum pedido encontrado.</p>';box.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>carregarPedido(b.dataset.id));}catch(e){status.textContent=e.message;}};
   host.querySelector('[data-buscar]').onclick=buscar;host.querySelector('[data-busca]').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();buscar();}};status.textContent='';
  }
  try{
   await window.aguardarContexto?.();if(!empresa())throw Error('Entre novamente para identificar a empresa.');
   if(pedido==='atual')pedido=window.__PEDIDO_ATUAL_ID||new URLSearchParams(location.search).get('pedido');
   if(pedido)await carregarPedido(pedido);else if(document.getElementById('btnSalvarPedido')){status.textContent='Salve o orçamento antes de vincular uma sublocação. Depois reabra este controle para selecionar os itens do pedido.';}else await carregarCentral();
  }catch(e){status.textContent=e.message;}
 }
 window.Sublocacoes={abrir};
 const iniciar=()=>{
  document.querySelectorAll('[data-sublocacoes]').forEach(b=>b.onclick=()=>abrir(b.dataset.sublocacoes||null));
  if(new URLSearchParams(location.search).get('sublocacoes')==='1')abrir(document.getElementById('btnSalvarPedido')?'atual':null);
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();
