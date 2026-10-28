(function(){
 'use strict';
 window.carregarModosSeparacao=async function(host,empresa){
  const sb=window.supabaseClient,secao=document.createElement('section');secao.className='pr-card pr-separacao-modos';
  secao.innerHTML='<h3>Modos de separa\u00e7\u00e3o</h3><p>Escolha quais modos ficam dispon\u00edveis e quem pode usar cada um. A libera\u00e7\u00e3o tamb\u00e9m exige a permiss\u00e3o de executar a separa\u00e7\u00e3o.</p><form><div data-modos></div><button class="btn primary" type="submit">Salvar modos de separa\u00e7\u00e3o</button></form>';
  host.appendChild(secao);
  const form=secao.querySelector('form'),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const [{data:regras,error},{data:lista,error:erroPessoas}]=await Promise.all([sb.from('empresa_separacao_modos').select('*').eq('empresa_id',empresa),sb.rpc('separacao_modos_funcionarios',{p_empresa:empresa})]);
  if(error||erroPessoas){secao.remove();throw error||erroPessoas;}
  const pessoas=lista||[];
  const pode=window.EasyLocPermissions?.hasPermission('configuracoes.empresa.editar')===true;
  form.querySelector('[data-modos]').innerHTML=[['manual','Manualmente'],['qr','QR Code'],['um-clique','1 clique']].map(([modo,nome])=>{
   const r=(regras||[]).find(r=>r.modo===modo)||{ativo:true,todos:true,funcionarios:[]};
   return `<fieldset data-modo="${modo}"><legend>${nome}</legend><label class="pr-modo-toggle"><input type="checkbox" name="ativo" ${r.ativo?'checked':''}> Dispon\u00edvel</label><label>Liberar para<select name="publico"><option value="todos" ${r.todos?'selected':''}>Todos os funcion\u00e1rios autorizados</option><option value="selecionados" ${!r.todos?'selected':''}>Somente funcion\u00e1rios selecionados</option></select></label><div data-pessoas>${pessoas.map(p=>`<label class="pr-modo-toggle"><input type="checkbox" value="${esc(p.id)}" ${r.funcionarios.includes(p.id)?'checked':''}>${esc(p.nome)}</label>`).join('')||'<p>Nenhum funcion\u00e1rio com acesso ao sistema cadastrado.</p>'}</div></fieldset>`;
  }).join('');
  function atualizar(){form.querySelectorAll('[data-modo]').forEach(f=>{const ativo=f.querySelector('[name=ativo]').checked;f.querySelector('[name=publico]').disabled=!pode||!ativo;f.querySelector('[data-pessoas]').hidden=f.querySelector('[name=publico]').value==='todos';f.querySelectorAll('[data-pessoas] input').forEach(i=>i.disabled=!pode||!ativo);});}
  form.querySelectorAll('input,select,button').forEach(i=>i.disabled=!pode);atualizar();form.addEventListener('change',atualizar);
  form.addEventListener('submit',async e=>{e.preventDefault();if(!pode)return;const botao=form.querySelector('button');botao.disabled=true;try{
   const payload=[...form.querySelectorAll('[data-modo]')].map(f=>({empresa_id:empresa,modo:f.dataset.modo,ativo:f.querySelector('[name=ativo]').checked,todos:f.querySelector('[name=publico]').value==='todos',funcionarios:[...f.querySelectorAll('[data-pessoas] input:checked')].map(i=>i.value)}));
   if(payload.some(r=>r.ativo&&!r.todos&&!r.funcionarios.length))throw Error('Selecione pelo menos um funcion\u00e1rio para cada modo dispon\u00edvel com acesso restrito.');
   const {error}=await sb.from('empresa_separacao_modos').upsert(payload,{onConflict:'empresa_id,modo'});if(error)throw error;window.alerta('Modos de separa\u00e7\u00e3o salvos.','Sucesso','sucesso');
  }catch(err){window.alerta(err.message,'Aten\u00e7\u00e3o','aviso');}finally{botao.disabled=false;}});
 };
})();
