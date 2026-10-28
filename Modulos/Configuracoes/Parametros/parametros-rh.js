(function(){
  'use strict';
  window.carregarParametrosRh=async function(host,empresa){
    if(host.dataset.pronto===empresa)return;
    const sb=window.supabaseClient;
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    host.innerHTML=['setor','cargo'].map(tipo=>`<section class="pr-card" data-rh-tipo="${tipo}"><h2>${tipo==='setor'?'Setores':'Cargos e fun\u00e7\u00f5es'}</h2><form class="pr-rh-form"><label>Nome<input name="nome" class="el-input" required maxlength="100" autocomplete="off"></label><button class="btn primary" type="submit">Adicionar</button><button class="btn" type="button" data-cancelar hidden>Cancelar</button></form><div data-lista></div></section>`).join('');
    const pode=window.EasyLocPermissions?.hasPermission('configuracoes.empresa.editar')===true;
    let registros=[],ocupado=false;
    async function carregar(){
      const {data,error}=await sb.from('rh_cadastro_opcoes').select('*').eq('empresa_id',empresa).order('nome');
      if(error)throw error;registros=data||[];
      host.querySelectorAll('[data-rh-tipo]').forEach(secao=>{
        secao.querySelector('form').hidden=!pode;
        secao.querySelector('[data-lista]').innerHTML=`<table><thead><tr><th>Nome</th><th>Status</th><th></th></tr></thead><tbody>${registros.filter(r=>r.tipo===secao.dataset.rhTipo).map(r=>`<tr><td>${esc(r.nome)}</td><td>${r.ativo?'Ativo':'Inativo'}</td><td>${pode?`<button type="button" class="btn" data-editar="${r.id}">Editar</button> <button type="button" class="btn" data-alternar="${r.id}">${r.ativo?'Inativar':'Ativar'}</button>`:''}</td></tr>`).join('')||'<tr><td colspan="3">Nenhum cadastro.</td></tr>'}</tbody></table>`;
      });
    }
    function reset(form){form.reset();delete form.dataset.id;form.querySelector('[type=submit]').textContent='Adicionar';form.querySelector('[data-cancelar]').hidden=true;}
    host.addEventListener('click',async e=>{
      if(!pode||ocupado)return;
      const editar=e.target.closest('[data-editar]'),alternar=e.target.closest('[data-alternar]');
      if(e.target.closest('[data-cancelar]'))reset(e.target.closest('form'));
      if(editar){const r=registros.find(r=>r.id===editar.dataset.editar),form=editar.closest('section').querySelector('form');form.dataset.id=r.id;form.elements.nome.value=r.nome;form.querySelector('[type=submit]').textContent='Salvar';form.querySelector('[data-cancelar]').hidden=false;form.elements.nome.focus();}
      if(alternar){ocupado=true;try{const r=registros.find(r=>r.id===alternar.dataset.alternar);const {error}=await sb.from('rh_cadastro_opcoes').update({ativo:!r.ativo}).eq('empresa_id',empresa).eq('id',r.id);if(error)throw error;await carregar();}catch(err){window.alerta(err.message,'Erro','erro');}finally{ocupado=false;}}
    });
    host.addEventListener('submit',async e=>{
      e.preventDefault();if(!pode||ocupado)return;
      const form=e.target,nome=form.elements.nome.value.trim();if(!nome){form.elements.nome.focus();return;}
      ocupado=true;const botao=form.querySelector('[type=submit]');botao.disabled=true;
      try{
        const payload={nome};const query=form.dataset.id?sb.from('rh_cadastro_opcoes').update(payload).eq('empresa_id',empresa).eq('id',form.dataset.id):sb.from('rh_cadastro_opcoes').insert({...payload,empresa_id:empresa,tipo:form.closest('[data-rh-tipo]').dataset.rhTipo});
        const {error}=await query;if(error)throw error;reset(form);await carregar();window.alerta('Cadastro salvo.','Sucesso','sucesso');
      }catch(err){window.alerta(err.code==='23505'?'Este nome j\u00e1 est\u00e1 cadastrado.':err.message,'Erro','erro');}finally{ocupado=false;botao.disabled=false;}
    });
    try{await carregar();host.dataset.pronto=empresa;}catch(err){window.alerta(err.message,'Erro','erro');throw err;}
  };
})();
