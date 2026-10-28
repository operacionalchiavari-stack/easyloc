(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.carregarQualidadeAcervo=async function(host,empresa){
  const sb=window.supabaseClient,secao=document.createElement('section');secao.className='pr-motivos-logistica';
  secao.innerHTML='<h3>Inventário e controle de qualidade</h3><p>Cadastre o que conferir em cada item, como capa de proteção, QR Code, etiqueta ou acessórios. A condição geral do item sempre é conferida. Alterações valem para novas conferências; as anteriores mantêm sua lista e resultados.</p><form class="pr-motivo-novo"><label>Nova verificação<input name="nome" minlength="3" maxlength="120" required placeholder="Ex.: Capa de proteção"></label><button type="submit">Adicionar verificação</button></form><p class="pr-motivos-status" role="status"></p><div class="pr-motivos-lista"></div>';host.append(secao);
  const lista=secao.querySelector('.pr-motivos-lista'),status=secao.querySelector('[role=status]');let ocupado=false;
  async function carregar(){const {data,error}=await sb.from('acervo_qualidade_criterios').select('id,nome,ativo').eq('empresa_id',empresa).order('nome');if(error)throw error;lista.innerHTML=(data||[]).map(c=>'<form data-criterio="'+esc(c.id)+'"><input name="nome" aria-label="Nome da verificação" required minlength="3" maxlength="120" value="'+esc(c.nome)+'"><label><input name="ativo" type="checkbox" '+(c.ativo?'checked':'')+'> Ativa</label><button type="submit">Salvar</button></form>').join('')||'<p>Nenhuma verificação adicional cadastrada.</p>';}
  secao.addEventListener('submit',async e=>{e.preventDefault();if(ocupado)return;ocupado=true;const form=e.target,b=form.querySelector('button');b.disabled=true;status.textContent='Salvando…';try{const {error}=await sb.rpc('acervo_qualidade_configurar',{p_empresa:empresa,p_id:form.dataset.criterio||null,p_nome:form.elements.nome.value.trim(),p_ativo:form.dataset.criterio?form.elements.ativo.checked:true});if(error)throw error;if(!form.dataset.criterio)form.reset();await carregar();status.textContent='Verificação salva.';}catch(e){status.textContent='Não foi possível salvar: '+e.message;}finally{ocupado=false;b.disabled=false;}});
  try{await carregar();}catch(e){status.textContent='Não foi possível carregar: '+e.message;}
 };
})();
