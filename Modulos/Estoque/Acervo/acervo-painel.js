(function(){'use strict';
 const data=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
 window.AcervoPainel={render({host,s,esc,nomes,abrir,abrirPedido}){
  const d=s.dados,ordens=d.ordens||[],eventos=[...(d.eventos||[])].sort((a,b)=>String(a.inicio).localeCompare(String(b.inicio)));
  const foto=(url,nome)=>url&&/^https?:/.test(url)?'<img src="'+esc(url)+'" alt="'+esc(nome)+'" loading="lazy">':'<span class="ac-sem-foto" aria-hidden="true">◇</span>';
  let linhas=d.retornos.filter(r=>!['liberado','baixado'].includes(r.estado)).map(r=>{const os=ordens.find(o=>o.id===r.os_id);return {id:r.id,retorno:r.id,item_id:r.item_id,codigo:r.codigo,nome:r.nome,foto_url:r.foto_url,quantidade:r.quantidade,os_id:os?.id,numero:r.os_numero,pedido:r.numero_pedido,setor:os?.setor||'A conferir',prazo:os?.prazo,detalhes:r.motivo,evidencias:r.evidencias||[],situacao:nomes[r.estado]};});
  linhas.push(...(d.exemplos||[]));
  linhas=linhas.filter(r=>s.aba==='conferir'?!r.os_id:!!r.os_id);
  linhas.sort((a,b)=>String(a.prazo||'9999').localeCompare(String(b.prazo||'9999'))||String(a.numero||'').localeCompare(String(b.numero||''),'pt-BR',{numeric:true}));
  const setores=[...new Set(['Todos','Marcenaria','Solda','Acabamento e Pintura','Costura','Forra\u00e7\u00e3o','Limpeza de Estofados',...linhas.map(r=>r.setor)])];
  if(!setores.includes(s.setorAcervo))s.setorAcervo='Todos';
  host.innerHTML='<div class="ac-duas-colunas"><nav id="acSetores" style="max-width:100%;min-width:0;overflow:visible!important;flex-wrap:wrap!important;box-sizing:border-box" class="fin-abas ac-setores" role="tablist" aria-label="Setores da manuten&#231;&#227;o"></nav><div class="ac-coluna-itens"><section class="ac-listagem"><div class="ac-tabela-topo"><h3>Itens danificados <span id="acTotalItens"></span></h3><input id="acBusca" type="search" aria-label="Buscar item, pedido ou O.S" placeholder="Buscar item, pedido ou O.S" value="'+esc(s.busca)+'"></div><div class="ac-lista-scroll"><table class="ac-danos-tabela"><thead><tr><th>O.S</th><th>Item</th><th>Qtd.</th><th>Setor / situação</th><th>Pedido</th><th>Prazo</th><th></th></tr></thead><tbody id="acLinhas"></tbody></table></div><div id="acMaisItens"></div></section></div><aside id="acProximoEvento" class="ac-proximo-evento" aria-live="polite"></aside></div>';
  document.getElementById('acSetores').hidden=s.aba==='conferir';
  if(s.aba==='conferir'){s.setorAcervo='Todos';host.querySelector('.ac-tabela-topo h3').firstChild.textContent='A conferir ';}
  document.getElementById('acBusca').oninput=e=>{s.busca=e.target.value;s.limiteAcervo=60;draw();};
  function draw(){
   const termo=s.busca.trim().toLocaleLowerCase('pt-BR').replace(/#/g,'');
   const buscadas=linhas.filter(r=>!termo||[r.nome,r.numero,r.pedido,r.setor,r.detalhes].join(' ').toLocaleLowerCase('pt-BR').includes(termo));
   document.getElementById('acSetores').innerHTML=setores.map(setor=>'<button type="button" role="tab" data-setor="'+esc(setor)+'" aria-selected="'+(s.setorAcervo===setor)+'">'+esc(setor)+' <span>'+buscadas.filter(r=>setor==='Todos'||r.setor===setor).length+'</span></button>').join('');
   host.querySelectorAll('[data-setor]').forEach(b=>b.onclick=()=>{s.setorAcervo=b.dataset.setor;s.limiteAcervo=60;draw();});
   const lista=buscadas.filter(r=>s.setorAcervo==='Todos'||r.setor===s.setorAcervo);
   if(!lista.some(r=>r.id===s.itemSelecionado))s.itemSelecionado=lista[0]?.id||null;
   const indice=lista.findIndex(r=>r.id===s.itemSelecionado),limite=lista.length;
   document.getElementById('acTotalItens').textContent='('+lista.length+')';
   document.getElementById('acLinhas').innerHTML=lista.slice(0,limite).map(r=>'<tr data-ac-linha="'+esc(r.id)+'" tabindex="0" aria-selected="'+(r.id===s.itemSelecionado)+'"><td><b class="ac-os-numero">'+esc(r.numero?'#'+r.numero:'—')+'</b></td><td><div class="ac-item-tabela">'+foto(r.foto_url,r.nome)+'<strong title="'+esc(r.nome)+'">'+esc(r.nome)+'</strong></div></td><td class="ac-qtd">'+(r.quantidade??'—')+'</td><td><b>'+esc(r.setor)+'</b><small>'+esc(r.situacao)+'</small></td><td>'+esc(r.pedido?'#'+r.pedido:'—')+'</td><td class="ac-prazo">'+data(r.prazo)+'</td><td>'+(r.retorno?'<button type="button" class="ac-abrir-item" data-ac-abrir="'+esc(r.id)+'">Conferir</button>':'')+'</td></tr>').join('')||'<tr><td colspan="7" class="ac-coluna-vazia">Nenhum item neste setor.</td></tr>';
   host.querySelectorAll('tr[data-ac-linha][aria-selected="true"] > td').forEach((td,n,celulas)=>{
    td.style.setProperty('border-top','2px solid #1683ff','important');
    td.style.setProperty('border-bottom','2px solid #1683ff','important');
    td.style.setProperty('border-left',n===0?'2px solid #1683ff':'0','important');
    td.style.setProperty('border-right',n===celulas.length-1?'2px solid #1683ff':'0','important');
    td.style.setProperty('background','#fff','important');
    td.style.setProperty('box-shadow','none','important');
   });
   document.getElementById('acMaisItens').innerHTML=lista.length>limite?'<button type="button" id="acCarregarMais">Mostrar mais itens ('+(lista.length-limite)+')</button>':'';
   document.getElementById('acCarregarMais')?.addEventListener('click',()=>{s.limiteAcervo=limite+60;draw();});
   host.querySelectorAll('[data-ac-linha]').forEach(tr=>{const selecionar=()=>{s.itemSelecionado=tr.dataset.acLinha;draw();};tr.onclick=e=>{if(!e.target.closest('button'))selecionar();};tr.onkeydown=e=>{if(e.target!==tr||!['Enter',' '].includes(e.key))return;e.preventDefault();selecionar();document.querySelector('[data-ac-linha="'+CSS.escape(s.itemSelecionado)+'"]')?.focus();};});
   host.querySelectorAll('[data-ac-abrir]').forEach(b=>b.onclick=()=>{const r=linhas.find(r=>r.id===b.dataset.acAbrir);s.itemSelecionado=r.id;draw();abrir(r.retorno);});
   proximo(lista.find(r=>r.id===s.itemSelecionado));
  }
  function proximo(r){
   const aside=document.getElementById('acProximoEvento');
   if(!r){aside.innerHTML='<h3>Resumo do item</h3><p class="ac-proximo-vazio">Selecione um item na tabela.</p>';return;}
   const eventosItem=eventos.filter(e=>e.itens.some(i=>r.item_id&&i.item_id===r.item_id||r.codigo&&i.codigo===r.codigo));
   if(r.exemplo&&!eventosItem.length){const dia=new Date();dia.setDate(dia.getDate()+7);eventosItem.push({simulado:true,inicio:dia.toISOString().slice(0,10),carregamento_em:dia.toISOString().slice(0,10)+'T08:00:00-03:00',numero_pedido:'9001',cliente_nome:'Casamento de exemplo',local_nome:'Espaço de eventos \u2014 simulação',itens:[{item_id:r.item_id,codigo:r.codigo,quantidade:6,indisponivel:r.quantidade,disponivel:4,faltante:2}]});}
   const e=eventosItem[0],i=e?.itens.find(i=>r.item_id&&i.item_id===r.item_id||r.codigo&&i.codigo===r.codigo),catalogo=(d.catalogo||[]).find(c=>c.id===r.item_id);
   const bloco=(titulo,conteudo)=>'<section class="ac-resumo-bloco"><h4>'+titulo+'</h4>'+conteudo+'</section>';
   const linha=(titulo,valor)=>'<div><dt>'+titulo+'</dt><dd>'+esc(valor??'\u2014')+'</dd></div>';
   const prazo=ev=>{if(!ev.carregamento_em)return 'Carregamento n\u00e3o agendado';const fim=new Date(new Date(ev.carregamento_em).getTime()-Number(d.acervo_antecedencia_horas??24)*3600000);return Number.isNaN(fim.getTime())?'Prazo n\u00e3o definido':fim.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'});};
   const card=(titulo,valor)=>'<div class="ac-resumo-numero"><span>'+esc(titulo)+'</span><strong>'+esc(valor??'\u2014')+'</strong></div>';
   aside.innerHTML='<header class="ac-resumo-cabecalho"><h3>Resumo do item</h3><div class="ac-resumo-numeros">'+card('Total no cadastro',catalogo?.estoque_total)+card(r.exemplo?'Em tratamento (exemplo)':'Em tratamento',r.quantidade)+card('Saldo dispon\u00edvel para o evento',i?.disponivel)+'</div></header>'+bloco('Próximos eventos',eventosItem.length?'<div class="ac-eventos-scroll"><table class="ac-eventos-tabela"><colgroup><col style="width:94px"><col style="width:62px"><col><col><col style="width:40px"><col style="width:94px"></colgroup><thead><tr><th>Data</th><th>Pedido</th><th>Cliente</th><th>Local</th><th>Qtd.</th><th>Prazo final</th></tr></thead><tbody>'+eventosItem.slice(0,4).map(ev=>{const it=ev.itens.find(it=>it.item_id===r.item_id||r.codigo&&it.codigo===r.codigo);return '<tr class="ac-resumo-evento"><td>'+data(ev.inicio)+'</td><td><button type="button" class="ac-pedido-link" data-ac-evento="'+eventosItem.indexOf(ev)+'">'+esc(ev.numero_pedido)+'</button></td><td>'+esc(ev.cliente_nome)+'</td><td>'+esc(ev.local_nome||'\u2014')+'</td><td>'+esc(it.quantidade)+'</td><td class="ac-evento-prazo-final">'+esc(prazo(ev))+'</td></tr>';}).join('')+'</tbody></table></div>'+(eventosItem.length>4?'<small>+'+(eventosItem.length-4)+' evento(s) posterior(es)</small>':''):'<p class="ac-proximo-vazio">Nenhum evento reservado para este item nos próximos 90 dias.</p>')+
    bloco('Dano encontrado','<p>'+esc(r.detalhes||(r.exemplo?'Avaria de exemplo para avaliar o encaminhamento.':'Dano ainda não detalhado.'))+'</p><small>'+esc(r.exemplo?'Situação simulada':(r.evidencias?.length||0)+' evidência(s) registrada(s)')+'</small>')+
    bloco('Manutenção','<dl class="ac-evento-saldos">'+linha('Setor',r.setor)+linha('Situação',r.situacao)+linha('Responsável','Não informado')+linha('Prazo',r.prazo?data(r.prazo):'Não definido')+'</dl>');
   aside.querySelectorAll('[data-ac-evento]').forEach(botao=>botao.onclick=()=>abrirPedido?.(eventosItem[Number(botao.dataset.acEvento)],r));
   aside.querySelectorAll('.ac-eventos-tabela th,.ac-eventos-tabela td').forEach(c=>{
    c.style.setProperty('padding','10px 6px','important');
    c.style.setProperty('font-size',c.tagName==='TH'?'12px':'14px','important');
    c.style.setProperty('letter-spacing','0','important');
    c.style.setProperty('overflow-wrap','normal','important');
    c.style.setProperty('word-break','normal','important');
    c.style.setProperty('white-space',[0,1,4,5].includes(c.cellIndex)?'nowrap':'normal','important');
   });
  }
  draw();
 }};
})();
