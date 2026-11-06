(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.carregarQualidadeAcervo=async function(host,empresa){
  const sb=window.supabaseClient,secao=document.createElement('section');secao.className='pr-motivos-logistica';
  secao.innerHTML='<h3>Colunas da contagem do invent\u00e1rio</h3><p>A contagem \u00e9 feita \u00e0s cegas. Configure o nome, a ordem e as colunas que devem ser preenchidas. Qtd. \u00e9 obrigat\u00f3ria. As altera\u00e7\u00f5es valem para o pr\u00f3ximo invent\u00e1rio.</p><p class="pr-motivos-status" role="status"></p><div class="pr-motivos-lista"></div>';host.append(secao);
  const lista=secao.querySelector('.pr-motivos-lista'),status=secao.querySelector('[role=status]');let ocupado=false;
  async function carregar(){const {data,error}=await sb.rpc('acervo_inventario_colunas_listar',{p_empresa:empresa});if(error)throw error;lista.innerHTML=(data||[]).map(c=>'<form data-coluna="'+esc(c.chave)+'"><label>Coluna<input name="nome" required minlength="3" maxlength="120" value="'+esc(c.nome)+'"></label><label>Ordem<input name="ordem" type="number" min="1" max="99" value="'+esc(c.ordem)+'" required></label><label><input name="ativo" type="checkbox" '+(c.ativa?'checked':'')+' '+(c.chave==='qtd'?'disabled':'')+'> Ativa</label><button type="submit">Salvar</button></form>').join('');}
  secao.addEventListener('submit',async e=>{e.preventDefault();if(ocupado)return;ocupado=true;const form=e.target,b=form.querySelector('button');b.disabled=true;status.textContent='Salvando...';try{const {error}=await sb.rpc('acervo_inventario_coluna_configurar',{p_empresa:empresa,p_chave:form.dataset.coluna,p_nome:form.elements.nome.value.trim(),p_ativa:form.elements.ativo.checked,p_ordem:Number(form.elements.ordem.value)});if(error)throw error;await carregar();status.textContent='Coluna salva.';}catch(err){status.textContent='N\u00e3o foi poss\u00edvel salvar: '+err.message;}finally{ocupado=false;b.disabled=false;}});
  try{await carregar();}catch(err){status.textContent='N\u00e3o foi poss\u00edvel carregar: '+err.message;}
 };
})();
