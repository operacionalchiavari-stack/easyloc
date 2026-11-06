(function(){
 'use strict';
 const padrao=[{chave:'qtd',nome:'Qtd.',ativa:true},{chave:'revisao',nome:'Qtd. revis\u00e3o',ativa:true},{chave:'capa',nome:'Qtd. capa de prote\u00e7\u00e3o',ativa:true},{chave:'fazer_capa',nome:'Qtd. fazer capa de prote\u00e7\u00e3o',ativa:true}];
 window.AcervoInventarioQualidade={render({host,atual,esc,salvar,aprovar,catalogo=[],componentes=[],categoria=null,onCategoria,rascunhos={}}){
  const aberto=atual.status==='contagem',colunas=(atual.colunas_contagem?.length?atual.colunas_contagem:padrao).filter(c=>c.ativa);
  const completa=(c,rodada)=>colunas.every(k=>typeof c[rodada]?.[k.chave]==='number');
  const primeiraCompleta=atual.itens.every(c=>completa(c,'primeira_contagens')),segundaCompleta=primeiraCompleta&&atual.itens.every(c=>completa(c,'segunda_contagens'));
  const rodada=primeiraCompleta?2:1,resultados=segundaCompleta||!aberto,campo=rodada===1?'primeira_contagens':'segunda_contagens';
  const chave=c=>atual.id+':'+rodada+':'+c.item_id;
  const valor=(c,k)=>rascunhos[chave(c)]?.[k]??c[campo]?.[k];
  const diferenca=(c,k)=>Number(c.segunda_contagens?.[k]??0)-Number(c.primeira_contagens?.[k]??0);
  const situacao=c=>Number(c.segunda_contagens?.qtd??c.contado)-Number(c.saldo_base)<0?'falta':colunas.some(k=>diferenca(c,k.chave)!==0)||Number(c.segunda_contagens?.qtd??c.contado)>Number(c.saldo_base)||Number(c.segunda_contagens?.revisao)>0||Number(c.segunda_contagens?.fazer_capa)>0?'atencao':'bateu';
  const progresso=atual.itens.filter(c=>completa(c,campo)).length;
  const conhecidos=new Set(catalogo.map(i=>String(i.id))),metadados=[...catalogo,...atual.itens.filter(c=>!conhecidos.has(String(c.item_id))).map(c=>({id:c.item_id,produto:c.nome,categoria:'Sem categoria'}))];
  const dados=window.AcervoContagens.organizar(metadados,componentes,atual.itens.map(c=>c.item_id));
  host.innerHTML='<h3 class="ac-inv-titulo">'+esc(atual.nome)+'</h3><p class="ac-inv-progresso">'+(resultados?'Resultados das duas contagens':rodada+'\u00aa contagem cega: '+progresso+' de '+atual.itens.length+' itens contabilizados')+'</p><div class="ac-inv-duas-colunas"><nav data-inv-categorias aria-label="Categorias da contagem"></nav><section data-inv-lista><h3 data-inv-categoria-titulo></h3><table class="ac-inv-tabela ac-inv-cega"><thead><tr><th>Item / componente</th>'+colunas.map(c=>'<th>'+esc(c.nome)+'</th>').join('')+(resultados?'<th>Dif. estoque</th>':'<th></th>')+'</tr></thead><tbody>'+atual.itens.map(c=>{
   const item=dados.mapa.get(String(c.item_id))||{},fid='ac-inv-form-'+c.item_id;let foto='';try{const u=new URL(item.foto_url);if(['http:','https:'].includes(u.protocol))foto=u.href;}catch{}
   return '<tr class="ac-inventario-item '+(resultados?'ac-contagem-'+situacao(c):'')+'" data-item="'+esc(c.item_id)+'"><td><div class="ac-inv-item-identidade"><span class="ac-inv-foto-item">'+(foto?'<img src="'+esc(foto)+'" alt="'+esc(c.nome)+'" loading="lazy">':'<span>Sem foto</span>')+'</span><span><strong>'+esc(c.nome)+'</strong>'+(dados.pecas.has(String(c.item_id))?'<small>Componente</small>':'')+'</span></div></td>'+colunas.map(k=>'<td data-rotulo="'+esc(k.nome)+'">'+(resultados?'<strong>'+esc(c.segunda_contagens?.[k.chave]??c.contagens?.[k.chave]??'\u2014')+'</strong><small>1\u00aa: '+esc(c.primeira_contagens?.[k.chave]??'\u2014')+' \u00b7 Dif.: '+esc(diferenca(c,k.chave)>0?'+'+diferenca(c,k.chave):diferenca(c,k.chave))+'</small>':'<input '+(k.chave==='qtd'?'data-q ':'')+'data-quantidade="'+esc(k.chave)+'" type="number" min="0" step="1" inputmode="numeric" required aria-label="'+esc(k.nome+' de '+c.nome)+'" value="'+esc(valor(c,k.chave)??'')+'" form="'+esc(fid)+'" '+(completa(c,campo)?'disabled':'')+'>')+'</td>').join('')+'<td>'+(resultados?'<strong>'+esc(Number(c.segunda_contagens?.qtd??c.contado)-Number(c.saldo_base))+'</strong><small>'+(situacao(c)==='falta'?'Falta':situacao(c)==='bateu'?'Contagem confere':'Conferir diferen\u00e7as / revis\u00e3o')+'</small>':'<form id="'+esc(fid)+'">'+(completa(c,campo)?'<small>Registrado</small>':'<button type="submit" data-contar>Salvar</button>')+'</form>')+'</td></tr>';
  }).join('')+'</tbody></table></section></div>'+(aberto?'<div class="ac-barra"><button id="acAprovar" '+(segundaCompleta?'':'disabled')+'>Finalizar invent\u00e1rio</button></div>':'<p>Invent\u00e1rio finalizado.</p>');
  window.AcervoContagens.navegar({host,dados,esc,selecionada:categoria,onSelecionar:onCategoria});
  host.querySelectorAll('thead,thead th').forEach(el=>el.style.setProperty('background','#e9edf1','important'));
  host.querySelectorAll('.ac-inv-foto-item img').forEach(img=>img.onerror=()=>{img.parentElement.textContent='Sem foto';});
  host.querySelectorAll('[data-item]').forEach(row=>{
   const c=atual.itens.find(c=>c.item_id===row.dataset.item),form=row.querySelector('form');if(!form)return;
   row.querySelectorAll('[data-quantidade]').forEach(input=>input.oninput=()=>{rascunhos[chave(c)]??={};rascunhos[chave(c)][input.dataset.quantidade]=input.value;});
   form.onsubmit=e=>{e.preventDefault();if(!aberto||!form.reportValidity())return;const quantidades={};row.querySelectorAll('[data-quantidade]').forEach(input=>quantidades[input.dataset.quantidade]=Number(input.value));salvar(row.querySelector('[data-contar]'),{p_item:c.item_id,p_versao:c.versao,p_quantidades:quantidades,p_rodada:rodada});};
  });
  host.querySelector('#acAprovar')?.addEventListener('click',e=>aprovar(e.target));
 }};
})();
