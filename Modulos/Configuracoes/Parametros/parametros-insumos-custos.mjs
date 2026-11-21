// Parâmetros > Almoxarifado (16/11/2026, Almoxarifado novo copiado da Tecnoweld):
//  - Categorias de insumos (warehouse_material_categories): aparecem no Cadastro de insumos.
//  - Tipos de item (warehouse_material_types): nome, sigla e unidade; o código do material sai do tipo (TEC-001-01).
// Custo por hora, margem e taxas das personalizações ficam em Parâmetros > Produção > Personalizações.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const UNIDADES=['UN','M','M²','KG','L','PAR','CX','RL','PCT'];
async function categorias(root,sb){
 const card=document.createElement('section');card.className='pr-card';root.append(card);
 const {data,error}=await sb.from('warehouse_material_categories').select('nome,ordem').order('ordem').order('nome');
 if(error){card.textContent='Não foi possível carregar as categorias: '+error.message;return;}
 let lista=(data||[]).map(c=>c.nome);
 card.innerHTML='<h3>Categorias de insumos</h3><p class="pr-ajuda">Aparecem no Cadastro de insumos do Almoxarifado. Uma categoria que já tem material não é apagada.</p><form><div class="pr-grade"><label class="pr-campo">Nova categoria<div style="display:flex;gap:8px"><input name="categoria" maxlength="80" placeholder="Nome da categoria"><button type="button" class="btn" data-adicionar>Adicionar</button></div></label><div data-lista style="display:flex;gap:8px;flex-wrap:wrap;align-items:start"></div></div><div class="pr-acoes"><span role="status"></span><button type="submit" class="btn primary">Salvar categorias</button></div></form>';
 const f=card.querySelector('form'),status=card.querySelector('[role=status]');
 const pintar=()=>{card.querySelector('[data-lista]').innerHTML=lista.map((c,i)=>'<button type="button" data-remover="'+i+'" aria-label="Remover categoria '+esc(c)+'" style="border:1px solid #ced9e6;border-radius:20px;background:#f4f7fb;padding:8px 12px">'+esc(c)+' ×</button>').join('');};pintar();
 card.addEventListener('click',e=>{const b=e.target.closest('[data-remover]');if(b){lista.splice(Number(b.dataset.remover),1);pintar();}if(e.target.closest('[data-adicionar]')){const v=f.elements.categoria.value.trim();if(v&&!lista.some(c=>c.toLocaleLowerCase()===v.toLocaleLowerCase()))lista.push(v);f.elements.categoria.value='';pintar();}});
 f.addEventListener('submit',async e=>{e.preventDefault();const b=f.querySelector('[type=submit]');b.disabled=true;status.textContent='Salvando…';try{const r=await sb.rpc('almox_categorias_salvar',{p_lista:lista});if(r.error)throw r.error;lista=r.data||lista;pintar();status.textContent='Categorias salvas.';}catch(err){status.textContent=err.message;}finally{b.disabled=false;}});
}
async function tipos(root,sb){
 const card=document.createElement('section');card.className='pr-card';root.append(card);
 const carregar=async()=>{const r=await sb.rpc('warehouse_material_types_list');if(r.error)throw r.error;return r.data||[];};
 let lista=[];
 const pintar=()=>{card.querySelector('tbody').innerHTML=lista.map(t=>'<tr data-id="'+t.id+'"><td><input data-k="nome" value="'+esc(t.nome)+'" maxlength="60"></td><td><input data-k="sigla" value="'+esc(t.sigla)+'" maxlength="6" style="width:80px;text-transform:uppercase" '+(t.itens?'disabled title="Já tem itens com este código"':'')+'></td><td><select data-k="unidade">'+UNIDADES.concat(UNIDADES.includes(t.unidade)?[]:[t.unidade]).map(u=>'<option'+(u===t.unidade?' selected':'')+'>'+esc(u)+'</option>').join('')+'</select></td><td style="text-align:center"><input type="checkbox" data-k="ativo" '+(t.ativo?'checked':'')+'></td><td style="text-align:right">'+(t.itens||0)+'</td><td><button type="button" class="btn" data-salvar>Salvar</button> '+(t.itens?'':'<button type="button" class="btn" data-apagar>Excluir</button>')+'</td></tr>').join('')+'<tr data-novo><td><input data-k="nome" placeholder="Novo tipo (ex.: Tecido)" maxlength="60"></td><td><input data-k="sigla" placeholder="TEC" maxlength="6" style="width:80px;text-transform:uppercase"></td><td><select data-k="unidade">'+UNIDADES.map(u=>'<option>'+u+'</option>').join('')+'</select></td><td style="text-align:center"><input type="checkbox" data-k="ativo" checked></td><td></td><td><button type="button" class="btn primary" data-salvar>Adicionar</button></td></tr>';};
 card.innerHTML='<h3>Tipos de item</h3><p class="pr-ajuda">O tipo dá o código do material (sigla + número, ex.: TEC-001-01) e a unidade. A sigla não muda depois que o tipo tem itens; desative em vez de excluir.</p><div class="pr-tabela-wrap"><table class="pr-tabela" style="width:100%"><thead><tr><th>Tipo</th><th>Sigla</th><th>Unidade</th><th>Ativo</th><th style="text-align:right">Itens</th><th></th></tr></thead><tbody></tbody></table></div><p role="status"></p>';
 const status=card.querySelector('[role=status]');
 try{lista=await carregar();pintar();}catch(e){status.textContent='Não foi possível carregar os tipos: '+e.message;}
 card.addEventListener('click',async e=>{
  const tr=e.target.closest('tr');if(!tr)return;
  const v=k=>{const el=tr.querySelector('[data-k="'+k+'"]');return el.type==='checkbox'?el.checked:el.value.trim();};
  try{
   if(e.target.closest('[data-salvar]')){status.textContent='Salvando…';const r=await sb.rpc('warehouse_material_type_save',{p_id:tr.dataset.id||null,p_nome:v('nome'),p_sigla:v('sigla'),p_ativo:v('ativo'),p_unidade:v('unidade')});if(r.error)throw r.error;}
   else if(e.target.closest('[data-apagar]')){if(!confirm('Excluir este tipo?'))return;const r=await sb.rpc('warehouse_material_type_delete',{p_id:tr.dataset.id});if(r.error)throw r.error;}
   else return;
   lista=await carregar();pintar();status.textContent='Tipos salvos.';
  }catch(err){status.textContent=err.message;}
 });
}
async function init(){
 const root=document.getElementById('pr-painel-almoxarifado');if(!root)return;
 await window.aguardarContexto();const sb=window.supabaseClient;
 try{await tipos(root,sb);await categorias(root,sb);}catch(e){console.warn(e);}
}
init();
