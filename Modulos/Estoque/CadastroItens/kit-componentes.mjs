import { buscarTodos } from '../../../js/core/buscarTodos.mjs?v=20261008';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dinheiro=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const foto=item=>'<span class="item-componentes-foto">'+(item.foto_url?'<img src="'+esc(item.foto_url)+'" alt="" loading="lazy">':'Sem foto')+'</span>';
const assinatura=lista=>JSON.stringify(lista.map(l=>[l.item_id,Number(l.quantidade)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
export function criarEditorComponentes({sb,empresaId,kitId,onAlterar}){
 let pronto=false,originais=[],catalogo=null,carregando=null;
 const linhas=new Map(),itens=new Map();
 const corpo=document.getElementById('kitDetalheComponentes'),busca=document.getElementById('kitDetalheBusca'),resultados=document.getElementById('kitDetalheResultados');
 function totais(){return [...linhas].reduce((total,[id,quantidade])=>{const item=itens.get(id)||{};for(const k of ['custo','valor_locacao','valor_reposicao'])total[k]+=Number(item[k]||0)*quantidade;return total;},{custo:0,valor_locacao:0,valor_reposicao:0});}
 function renderizar(){
  document.getElementById('kitDetalheContagem').textContent=linhas.size+' componente'+(linhas.size===1?'':'s');
  corpo.innerHTML=linhas.size?[...linhas].map(([id,qtd])=>{const item=itens.get(id)||{};return '<tr data-componente="'+esc(id)+'"><td>'+foto(item)+'</td><td><strong>'+esc(item.descricao_total||item.produto||'Componente')+'</strong><small>'+esc(item.referencia||item.codigo||'')+'</small></td><td><input class="el-input" type="number" min="1" step="1" value="'+qtd+'" data-quantidade="'+esc(id)+'" aria-label="Quantidade de '+esc(item.produto||'componente')+'"></td><td><button type="button" data-remover="'+esc(id)+'" aria-label="Remover '+esc(item.produto||'componente')+'">&times;</button></td></tr>';}).join(''):'<tr><td colspan="4">Adicione os itens que comp?em este kit.</td></tr>';
  const total=totais();document.getElementById('kitDetalheTotais').innerHTML=[['Custo','custo'],['Loca??o','valor_locacao'],['Reposi??o','valor_reposicao']].map(([nome,k])=>'<span>'+nome+' dos componentes<strong>'+dinheiro(total[k])+'</strong></span>').join('');
 }
 function alterar(){onAlterar?.(totais());renderizar();}
 async function carregar(){
  if(kitId){
   const vinculos=await sb.from('kit_itens').select('item_id,quantidade').eq('empresa_id',empresaId).eq('kit_id',kitId);if(vinculos.error)throw Error(vinculos.error.message);
   originais=vinculos.data||[];
   if(originais.length){const dados=await sb.from('itens').select('id,produto,descricao_total,referencia,codigo,foto_url,custo,valor_locacao,valor_reposicao').eq('empresa_id',empresaId).in('id',originais.map(v=>v.item_id));if(dados.error)throw Error(dados.error.message);(dados.data||[]).forEach(item=>itens.set(item.id,item));}
   originais.forEach(v=>linhas.set(v.item_id,Number(v.quantidade)));
  }
  pronto=true;renderizar();
 }
 async function pesquisar(){
  const termo=busca.value.trim().toLocaleLowerCase('pt-BR');if(!termo){resultados.hidden=true;busca.setAttribute('aria-expanded','false');return;}
  if(!catalogo){
   carregando||=buscarTodos(()=>sb.from('itens').select('id,produto,descricao_total,referencia,codigo,foto_url,custo,valor_locacao,valor_reposicao').eq('empresa_id',empresaId).neq('tipo','Kit').order('descricao_total').order('id'));
   const r=await carregando;if(r.error){carregando=null;window.alerta?.(r.error.message,'Componentes','erro');return;}catalogo=r.data||[];catalogo.forEach(item=>itens.set(item.id,item));
  }
  if(termo!==busca.value.trim().toLocaleLowerCase('pt-BR'))return;
  const encontrados=catalogo.filter(item=>item.id!==kitId&&[item.descricao_total,item.produto,item.codigo,item.referencia].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(termo)).slice(0,20);
  resultados.innerHTML=encontrados.length?encontrados.map(item=>'<button type="button" data-adicionar="'+esc(item.id)+'">'+foto(item)+'<span>'+esc(item.descricao_total||item.produto)+'<small>'+esc(item.referencia||item.codigo||'')+'</small></span><b>+</b></button>').join(''):'<p>Nenhum componente encontrado.</p>';
  resultados.hidden=false;busca.setAttribute('aria-expanded','true');
 }
 busca.addEventListener('input',()=>pesquisar().catch(e=>window.alerta?.(e.message,'Componentes','erro')));
 busca.addEventListener('keydown',e=>{if(e.key==='Escape'){resultados.hidden=true;busca.setAttribute('aria-expanded','false');}});
 resultados.onclick=e=>{const botao=e.target.closest('[data-adicionar]');if(!botao||!pronto)return;const id=botao.dataset.adicionar;linhas.set(id,(linhas.get(id)||0)+1);busca.value='';resultados.hidden=true;busca.setAttribute('aria-expanded','false');alterar();busca.focus();};
 corpo.onchange=e=>{const id=e.target.dataset.quantidade;if(!id)return;linhas.set(id,Number(e.target.value));alterar();};
 corpo.onclick=e=>{const botao=e.target.closest('[data-remover]');if(!botao)return;linhas.delete(botao.dataset.remover);alterar();};
 function validar(){if(!pronto)throw Error('Aguarde o carregamento dos componentes antes de salvar.');for(const q of linhas.values())if(!Number.isInteger(q)||q<1)throw Error('Informe uma quantidade inteira maior que zero para cada componente.');}
 async function salvar(id){
  validar();
  const atual=await sb.from('kit_itens').select('item_id,quantidade').eq('empresa_id',empresaId).eq('kit_id',id);if(atual.error)throw Error(atual.error.message);
  if(assinatura(atual.data||[])!==assinatura(originais))throw Error('Os componentes foram alterados em outra tela. Atualize o cadastro antes de salvar.');
  const novos=[...linhas].map(([item_id,quantidade])=>({empresa_id:empresaId,kit_id:id,item_id,quantidade}));
  const removidos=originais.filter(v=>!linhas.has(v.item_id)).map(v=>v.item_id);
  if(assinatura(novos)===assinatura(originais))return;
  try{
   if(novos.length){const r=await sb.from('kit_itens').upsert(novos,{onConflict:'kit_id,item_id'});if(r.error)throw Error(r.error.message);}
   if(removidos.length){const r=await sb.from('kit_itens').delete().eq('empresa_id',empresaId).eq('kit_id',id).in('item_id',removidos);if(r.error)throw Error(r.error.message);}
  }catch(error){
   let falhou=false;
   if(originais.length){const r=await sb.from('kit_itens').upsert(originais.map(v=>({...v,empresa_id:empresaId,kit_id:id})),{onConflict:'kit_id,item_id'});falhou=!!r.error;}
   const adicionados=novos.filter(v=>!originais.some(a=>a.item_id===v.item_id)).map(v=>v.item_id);
   if(adicionados.length){const r=await sb.from('kit_itens').delete().eq('empresa_id',empresaId).eq('kit_id',id).in('item_id',adicionados);falhou=!!r.error||falhou;}
   throw Error('N?o foi poss?vel salvar os componentes. '+(falhou?'Confira a lista antes de tentar novamente.':error.message));
  }
  originais=novos.map(({item_id,quantidade})=>({item_id,quantidade}));kitId=id;
 }
 return {carregar,validar,salvar};
}
