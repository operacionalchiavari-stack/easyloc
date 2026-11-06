(function(){
 'use strict';
 const chave=v=>String(v||'Sem categoria').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
 const kit=i=>String(i.tipo||'').toLowerCase()==='kit';
 function organizar(catalogo,componentes,ids=null){
  const mapa=new Map(catalogo.map(i=>[String(i.id),i])),permitidos=ids&&new Set(ids.map(String)),grupos=new Map(),pecas=new Set(componentes.map(c=>String(c.item_id)));
  const grupo=nome=>{const id=chave(nome);if(!grupos.has(id))grupos.set(id,{id,nome:String(nome||'Sem categoria').trim(),itens:new Set(),capas:[]});return grupos.get(id);};
  const adicionar=(g,i)=>{if(!kit(i)&&(!permitidos||permitidos.has(String(i.id))))g.itens.add(String(i.id));};
  catalogo.forEach(i=>{const g=grupo(i.categoria);g.capas.push(i);if(!kit(i))adicionar(g,i);});
  const filhos=(id,g,vistos=new Set())=>{if(vistos.has(id))return;vistos.add(id);componentes.filter(c=>String(c.kit_id)===id).forEach(c=>{const i=mapa.get(String(c.item_id));if(!i)return;if(kit(i))filhos(String(i.id),g,vistos);else adicionar(g,i);});};
  catalogo.filter(kit).forEach(i=>filhos(String(i.id),grupo(i.categoria)));
  const categorias=Array.from(grupos.values()).filter(g=>g.itens.size).map(g=>({...g,foto:(g.capas.find(i=>i.capa_categoria===true)||g.capas[0])?.foto_url||''})).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  return {categorias,mapa,pecas};
 }
 function navegar({host,dados,esc,selecionada,onSelecionar}){
  const nav=host.querySelector('[data-inv-categorias]'),lista=host.querySelector('[data-inv-lista]');
  nav.innerHTML=dados.categorias.map(c=>{let foto='';try{const u=new URL(c.foto);if(['https:','http:'].includes(u.protocol))foto=u.href;}catch{}
   return '<button type="button" data-inv-categoria="'+esc(c.id)+'" aria-pressed="false"><span class="ac-inv-categoria-foto">'+(foto?'<img src="'+esc(foto)+'" alt="'+esc(c.nome)+'" loading="lazy">':'<span>Sem foto</span>')+'</span><span><strong>'+esc(c.nome)+'</strong><small>'+c.itens.size+' itens / componentes</small></span></button>';
  }).join('');
  nav.querySelectorAll('img').forEach(img=>img.onerror=()=>img.replaceWith(document.createTextNode('Sem foto')));
  function selecionar(id){const categoria=dados.categorias.find(c=>c.id===id)||dados.categorias[0];if(!categoria){lista.innerHTML='<p class="ac-vazio">Nenhum item disponível para contagem.</p>';return;}
   nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.invCategoria===categoria.id)));
   lista.querySelectorAll('[data-item]').forEach(row=>row.hidden=!categoria.itens.has(String(row.dataset.item)));
   host.querySelector('[data-inv-categoria-titulo]').textContent=categoria.nome;onSelecionar?.(categoria.id);
  }
  nav.querySelectorAll('button').forEach(b=>b.onclick=()=>selecionar(b.dataset.invCategoria));selecionar(selecionada);
 }
 window.AcervoContagens={organizar,navegar,kit};
})();
