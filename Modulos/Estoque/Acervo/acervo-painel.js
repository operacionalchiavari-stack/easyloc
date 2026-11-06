(function(){'use strict';
 const data=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
 function destacarCabecalho(tabela){
  tabela.querySelectorAll('thead,thead tr,thead th').forEach(el=>{el.style.setProperty('background','#e9edf1','important');el.style.setProperty('background-image','none','important');});
 }
 window.AcervoPainel={render({host,s,esc,nomes,abrir,abrirPedido}){
  host._acLayoutCleanup?.();
  const d=s.dados,ordens=d.ordens||[],eventos=[...(d.eventos||[])].sort((a,b)=>String(a.inicio).localeCompare(String(b.inicio)));
  const foto=(url,nome)=>url&&/^https?:/.test(url)?'<img src="'+esc(url)+'" alt="'+esc(nome)+'" loading="lazy">':'<span class="ac-sem-foto" aria-hidden="true">◇</span>';
  let linhas=d.retornos.filter(r=>!['liberado','baixado'].includes(r.estado)).map(r=>{const os=ordens.find(o=>o.id===r.os_id);return {id:r.id,retorno:r.id,item_id:r.item_id,codigo:r.codigo,nome:r.nome,foto_url:r.foto_url,quantidade:r.quantidade,os_id:r.os_id,numero:r.os_numero,pedido:r.numero_pedido,setor:r.os_id?(os?.setor||'Manutenção'):'Aguardando encaminhamento',prazo:os?.prazo,detalhes:r.motivo,evidencias:r.evidencias||[],situacao:nomes[r.estado]};});
  linhas.push(...(d.exemplos||[]));
  linhas.sort((a,b)=>String(a.prazo||'9999').localeCompare(String(b.prazo||'9999'))||String(a.numero||'').localeCompare(String(b.numero||''),'pt-BR',{numeric:true}));
  const concluidas=ordens.filter(o=>o.concluida).map(o=>({id:'concluida:'+o.id,item_id:o.item_id,codigo:o.codigo,nome:o.item,foto_url:o.foto_url,quantidade:o.quantidade,os_id:o.id,numero:o.numero,pedido:o.pedido,setor:o.setor,prazo:o.data_conclusao,detalhes:o.motivo,situacao:'Concluída'})).sort((a,b)=>String(b.prazo||'').localeCompare(String(a.prazo||'')));
  const setores=[...new Set(['Aguardando encaminhamento','Todos','Marcenaria','Solda','Acabamento e Pintura','Costura','Forra\u00e7\u00e3o','Limpeza de Estofados',...linhas.map(r=>r.setor),'Concluídas'])];
  if(!setores.includes(s.setorAcervo))s.setorAcervo='Todos';
  host.innerHTML='<div class="ac-duas-colunas"><nav id="acSetores" style="max-width:100%;min-width:0;overflow:visible!important;flex-wrap:wrap!important;box-sizing:border-box" class="ac-setores" role="group" aria-label="Setores da manuten&#231;&#227;o"></nav><div class="ac-coluna-itens"><section class="ac-listagem"><div class="ac-lista-scroll"><table class="ac-danos-tabela"><thead><tr><th>O.S</th><th>Item</th><th>Qtd.</th><th>Setor / situação</th><th>Pedido</th><th>Prazo</th><th></th></tr></thead><tbody id="acLinhas"></tbody></table></div><div id="acMaisItens"></div></section></div><aside id="acProximoEvento" class="ac-proximo-evento" aria-live="polite"></aside></div>';
  host.querySelector('.ac-duas-colunas').classList.add('ac-tres-colunas');
  const campoBusca=document.createElement('input');campoBusca.id='acBusca';campoBusca.type='search';campoBusca.placeholder='Buscar';campoBusca.setAttribute('aria-label','Buscar item, pedido ou O.S');campoBusca.value=s.busca;
  campoBusca.oninput=e=>{s.busca=e.target.value;s.limiteAcervo=60;draw();};
  function draw(){
   const buscaAtiva=document.activeElement===campoBusca,posicao=campoBusca.selectionStart;
   const termo=s.busca.trim().toLocaleLowerCase('pt-BR').replace(/#/g,'');
   const buscar=r=>!termo||[r.nome,r.numero,r.pedido,r.setor,r.detalhes].join(' ').toLocaleLowerCase('pt-BR').includes(termo);
   const buscadas=linhas.filter(buscar),finalizadas=concluidas.filter(buscar),exibirConcluidas=s.setorAcervo==='Concluídas';
   const grade=host.querySelector('.ac-tres-colunas'),resumo=host.querySelector('#acProximoEvento');grade.classList.toggle('ac-sem-resumo',exibirConcluidas);resumo.hidden=exibirConcluidas;
   if(exibirConcluidas){resumo.replaceChildren();resumo.style.marginTop='';host.closest('main')?.style.removeProperty('--ac-resumo-largura');}
   document.getElementById('acSetores').innerHTML=setores.map(setor=>'<button type="button" data-setor="'+esc(setor)+'" aria-pressed="'+(s.setorAcervo===setor)+'">'+esc(setor)+' <span>'+(setor==='Concluídas'?finalizadas.length:buscadas.filter(r=>setor==='Todos'||r.setor===setor).length)+'</span></button>').join('');
   host.querySelectorAll('[data-setor]').forEach(b=>b.onclick=()=>{s.setorAcervo=b.dataset.setor;s.limiteAcervo=60;draw();});
   const lista=exibirConcluidas?finalizadas:buscadas.filter(r=>s.setorAcervo==='Todos'||r.setor===s.setorAcervo);
   if(!lista.some(r=>r.id===s.itemSelecionado))s.itemSelecionado=lista[0]?.id||null;
   const indice=lista.findIndex(r=>r.id===s.itemSelecionado),limite=lista.length;
   const mostrarOS=s.setorAcervo!=='Aguardando encaminhamento';
   const tabela=host.querySelector('.ac-danos-tabela');tabela.querySelector('colgroup')?.remove();
   tabela.insertAdjacentHTML('afterbegin','<colgroup>'+(mostrarOS?[9,39,7,22,10,13]:[44,8,25,10,13]).map(largura=>'<col style="width:'+largura+'%">').join('')+'</colgroup>');
   host.querySelector('.ac-danos-tabela thead').innerHTML='<tr>'+(mostrarOS?'<th>O.S</th>':'')+'<th><div class="ac-item-cabecalho"><span>Item</span><span data-ac-busca></span></div></th><th>Qtd.</th><th>Setor / situa&#231;&#227;o</th><th>Pedido</th><th>Prazo</th></tr>';
   tabela.querySelector('[data-ac-busca]').append(campoBusca);if(buscaAtiva){campoBusca.focus({preventScroll:true});if(posicao!==null)campoBusca.setSelectionRange(posicao,posicao);}
   if(exibirConcluidas)tabela.querySelector('thead th:last-child').textContent='Conclusão';
   destacarCabecalho(tabela);
   document.getElementById('acLinhas').innerHTML=lista.slice(0,limite).map(r=>'<tr data-ac-linha="'+esc(r.id)+'" tabindex="0" aria-selected="'+(r.id===s.itemSelecionado)+'">'+(mostrarOS?'<td><b class="ac-os-numero">'+esc(r.numero?'#'+r.numero:'—')+'</b></td>':'')+'<td><div class="ac-item-tabela">'+foto(r.foto_url,r.nome)+'<strong title="'+esc(r.nome)+'">'+esc(r.nome)+'</strong></div></td><td class="ac-qtd">'+(r.quantidade??'—')+'</td><td><b>'+esc(r.setor)+'</b><small>'+esc(r.situacao)+'</small></td><td>'+esc(r.pedido?'#'+r.pedido:'—')+'</td><td class="ac-prazo">'+data(r.prazo)+'</td></tr>').join('')||'<tr><td colspan="'+(mostrarOS?6:5)+'" class="ac-coluna-vazia">Nenhum item neste setor.</td></tr>';
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
   host.querySelectorAll('[data-ac-linha]').forEach(tr=>{
    const conferir=()=>{const r=lista.find(r=>r.id===tr.dataset.acLinha);if(!r)return;s.itemSelecionado=r.id;draw();};
    tr.onclick=e=>{if(!e.target.closest('button,a'))conferir();};
    tr.onkeydown=e=>{if(e.target!==tr||!['Enter',' '].includes(e.key))return;e.preventDefault();conferir();};
   });
   if(!exibirConcluidas)proximo(lista.find(r=>r.id===s.itemSelecionado));
  }
  function proximo(r){
   const aside=document.getElementById('acProximoEvento');
   if(!r){aside.innerHTML='<h3>Resumo do item</h3><p class="ac-proximo-vazio">Selecione um item na tabela.</p>';return;}
   const eventosItem=eventos.filter(e=>e.itens.some(i=>r.item_id&&i.item_id===r.item_id||r.codigo&&i.codigo===r.codigo));
   if(r.exemplo&&!eventosItem.length){const dia=new Date();dia.setDate(dia.getDate()+7);eventosItem.push({simulado:true,inicio:dia.toISOString().slice(0,10),carregamento_em:dia.toISOString().slice(0,10)+'T08:00:00-03:00',numero_pedido:'9001',cliente_nome:'Casamento de exemplo',local_nome:'Espaço de eventos \u2014 simulação',itens:[{item_id:r.item_id,codigo:r.codigo,quantidade:6,indisponivel:r.quantidade,disponivel:4,faltante:2}]});}
   const e=eventosItem[0],i=e?.itens.find(i=>r.item_id&&i.item_id===r.item_id||r.codigo&&i.codigo===r.codigo),catalogo=(d.catalogo||[]).find(c=>c.id===r.item_id);
   const bloco=(titulo,conteudo)=>'<section class="ac-resumo-bloco"><h4>'+titulo+'</h4>'+conteudo+'</section>';
   const prazo=ev=>{if(!ev.carregamento_em)return 'Carregamento n\u00e3o agendado';const fim=new Date(new Date(ev.carregamento_em).getTime()-Number(d.acervo_antecedencia_horas??24)*3600000);return Number.isNaN(fim.getTime())?'Prazo n\u00e3o definido':fim.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'});};
   const card=(titulo,valor)=>'<div class="ac-resumo-numero"><span>'+esc(titulo)+'</span><strong>'+esc(valor??'\u2014')+'</strong></div>';
   aside.innerHTML='<header class="ac-resumo-cabecalho"><h3>Resumo do item</h3><div class="ac-resumo-numeros">'+card('Total no cadastro',catalogo?.estoque_total)+card(r.exemplo?'Em tratamento (exemplo)':'Em tratamento',r.quantidade)+card('Saldo dispon\u00edvel para o evento',i?.disponivel)+'</div></header>'+bloco('Próximos eventos',eventosItem.length?'<div class="ac-eventos-scroll"><table class="ac-eventos-tabela"><colgroup><col style="width:12%"><col style="width:25%"><col style="width:25%"><col style="width:8%"><col style="width:30%"></colgroup><thead><tr><th>Pedido</th><th>Cliente</th><th>Local</th><th>Qtd.</th><th>Prazo final</th></tr></thead><tbody>'+eventosItem.slice(0,4).map(ev=>{const it=ev.itens.find(it=>it.item_id===r.item_id||r.codigo&&it.codigo===r.codigo);return '<tr class="ac-resumo-evento"><td><button type="button" class="ac-pedido-link" data-ac-evento="'+eventosItem.indexOf(ev)+'">'+esc(ev.numero_pedido)+'</button></td><td>'+esc(ev.cliente_nome)+'</td><td>'+esc(ev.local_nome||'\u2014')+'</td><td>'+esc(it.quantidade)+'</td><td class="ac-evento-prazo-final">'+esc(prazo(ev))+'</td></tr>';}).join('')+'</tbody></table></div>'+(eventosItem.length>4?'<small>+'+(eventosItem.length-4)+' evento(s) posterior(es)</small>':''):'<p class="ac-proximo-vazio">Nenhum evento reservado para este item nos próximos 90 dias.</p>')+
    bloco('Dano encontrado','<p>'+esc(r.detalhes||(r.exemplo?'Avaria de exemplo para avaliar o encaminhamento.':'Dano ainda não detalhado.'))+'</p><small>'+esc(r.exemplo?'Situação simulada':(r.evidencias?.length||0)+' evidência(s) registrada(s)')+'</small>');
   if(r.retorno){const controles=document.createElement('section');controles.id='acConferenciaItem';controles.className='ac-conferencia-inline';aside.append(controles);abrir(r.retorno);}
   const blocos=aside.querySelectorAll(':scope > .ac-resumo-bloco'),encaminhamento=aside.querySelector('#acConferenciaItem');
   const paineis={eventos:blocos[0],dano:blocos[1],encaminhamento};
   if(!encaminhamento){paineis.encaminhamento=document.createElement('section');paineis.encaminhamento.innerHTML='<p class="ac-proximo-vazio">Encaminhamento indisponível para este item.</p>';aside.append(paineis.encaminhamento);}
   const abas=document.createElement('nav');abas.className='ac-resumo-abas';abas.setAttribute('role','tablist');abas.setAttribute('aria-label','Detalhes do item');
   abas.innerHTML=[['eventos','Próximos eventos'],['dano','Dano'],['encaminhamento','Encaminhamento']].map(([id,nome])=>'<button type="button" role="tab" id="acResumoAba-'+id+'" data-ac-resumo-aba="'+id+'" aria-controls="acResumoPainel-'+id+'">'+nome+'</button>').join('');
   aside.querySelector('.ac-resumo-cabecalho').after(abas);
   Object.entries(paineis).forEach(([id,painel])=>{painel.id=id==='encaminhamento'&&encaminhamento?'acConferenciaItem':'acResumoPainel-'+id;painel.dataset.acResumoPainel=id;painel.setAttribute('role','tabpanel');painel.setAttribute('aria-labelledby','acResumoAba-'+id);abas.querySelector('[data-ac-resumo-aba="'+id+'"]').setAttribute('aria-controls',painel.id);});
   // As evidências acompanham o dano; os campos de ação ficam em Encaminhamento.
   const fotos=aside.querySelector('#acRetornos .ac-fotos');if(fotos)paineis.dano.append(fotos);
   const ativar=id=>{s.resumoAba=id;Object.entries(paineis).forEach(([chave,painel])=>{painel.hidden=chave!==id;const b=abas.querySelector('[data-ac-resumo-aba="'+chave+'"]');b.setAttribute('aria-selected',String(chave===id));b.tabIndex=chave===id?0:-1;});};
   const botoes=Array.from(abas.querySelectorAll('button'));botoes.forEach((b,n)=>{b.onclick=()=>ativar(b.dataset.acResumoAba);b.onkeydown=ev=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return;ev.preventDefault();const indice=ev.key==='Home'?0:ev.key==='End'?botoes.length-1:(n+(ev.key==='ArrowRight'?1:-1)+botoes.length)%botoes.length;botoes[indice].click();botoes[indice].focus();};});
   ativar(s.resumoAba||'eventos');
   aside.querySelectorAll('[data-ac-evento]').forEach(botao=>botao.onclick=()=>abrirPedido?.(eventosItem[Number(botao.dataset.acEvento)],r));
   aside.querySelectorAll('.ac-eventos-tabela th,.ac-eventos-tabela td').forEach(c=>{
    c.style.setProperty('padding','10px 6px','important');
    c.style.setProperty('font-size',c.tagName==='TH'?'12px':'14px','important');
    c.style.setProperty('letter-spacing','0','important');
    c.style.setProperty('overflow-wrap','normal','important');
    c.style.setProperty('word-break','normal','important');
    c.style.setProperty('white-space',[0,3].includes(c.cellIndex)?'nowrap':'normal','important');
   });
   const tabelaEventos=aside.querySelector('.ac-eventos-tabela');if(tabelaEventos)destacarCabecalho(tabelaEventos);
  }
  draw();

 }};
})();
