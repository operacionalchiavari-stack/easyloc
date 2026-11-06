(function(){
  'use strict';
  window.carregarParametrosRh=async function(host,empresa){
    if(host.dataset.pronto===empresa)return;
    const sb=window.supabaseClient;
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    // Nov/2026: além de setores e cargos, os itens dos checklists e os tipos/motivos de desligamento (com ordem).
    const TIPOS={setor:['Setores',''],cargo:['Cargos e funções',''],
      check_admissao:['Checklist de admissão','Itens que aparecem ao iniciar o checklist de uma admissão, nesta ordem.'],
      check_desligamento:['Checklist de desligamento','Itens criados ao registrar um desligamento, nesta ordem.'],
      tipo_desligamento:['Tipos de desligamento','Opções do campo Tipo ao registrar um desligamento.'],
      motivo_desligamento:['Motivos de desligamento','Opções do campo Motivo ao registrar um desligamento (obrigatório).']};
    const ORDENA=t=>t!=='setor'&&t!=='cargo';
    host.innerHTML=Object.keys(TIPOS).map(tipo=>`<section class="pr-card" data-rh-tipo="${tipo}"><h2>${TIPOS[tipo][0]}</h2>${TIPOS[tipo][1]?`<p class="pr-ajuda">${TIPOS[tipo][1]}</p>`:''}<form class="pr-rh-form"><label>Nome<input name="nome" class="el-input" required maxlength="200" autocomplete="off"></label><button class="btn primary" type="submit">Adicionar</button><button class="btn" type="button" data-cancelar hidden>Cancelar</button></form><div data-lista></div></section>`).join('');
    const pode=window.EasyLocPermissions?.hasPermission('configuracoes.empresa.editar')===true;
    let registros=[],ocupado=false;
    async function carregar(){
      const {data,error}=await sb.from('rh_cadastro_opcoes').select('*').eq('empresa_id',empresa).order('ordem').order('nome');
      if(error)throw error;registros=data||[];
      host.querySelectorAll('[data-rh-tipo]').forEach(secao=>{
        secao.querySelector('form').hidden=!pode;
        secao.querySelector('[data-lista]').innerHTML=`<table><thead><tr><th>Nome</th><th>Status</th><th></th></tr></thead><tbody>${registros.filter(r=>r.tipo===secao.dataset.rhTipo).map((r,i,l)=>`<tr><td>${esc(r.nome)}</td><td>${r.ativo?'Ativo':'Inativo'}</td><td>${pode?`${ORDENA(r.tipo)?`<button type="button" class="btn" data-mover="${r.id}" data-dir="-1" ${i?'':'disabled'} aria-label="Subir">&uarr;</button> <button type="button" class="btn" data-mover="${r.id}" data-dir="1" ${i<l.length-1?'':'disabled'} aria-label="Descer">&darr;</button> `:''}<button type="button" class="btn" data-editar="${r.id}">Editar</button> <button type="button" class="btn" data-alternar="${r.id}">${r.ativo?'Inativar':'Ativar'}</button>`:''}</td></tr>`).join('')||'<tr><td colspan="3">Nenhum cadastro.</td></tr>'}</tbody></table>`;
      });
    }
    function reset(form){form.reset();delete form.dataset.id;form.querySelector('[type=submit]').textContent='Adicionar';form.querySelector('[data-cancelar]').hidden=true;}
    host.addEventListener('click',async e=>{
      if(!pode||ocupado)return;
      const editar=e.target.closest('[data-editar]'),alternar=e.target.closest('[data-alternar]');
      if(e.target.closest('[data-cancelar]'))reset(e.target.closest('form'));
      if(editar){const r=registros.find(r=>r.id===editar.dataset.editar),form=editar.closest('section').querySelector('form');form.dataset.id=r.id;form.elements.nome.value=r.nome;form.querySelector('[type=submit]').textContent='Salvar';form.querySelector('[data-cancelar]').hidden=false;form.elements.nome.focus();}
      const mover=e.target.closest('[data-mover]');
      if(mover){ocupado=true;try{const r=registros.find(x=>x.id===mover.dataset.mover);const l=registros.filter(x=>x.tipo===r.tipo);const i=l.indexOf(r),j=i+Number(mover.dataset.dir);if(j>=0&&j<l.length){[l[i],l[j]]=[l[j],l[i]];
        for(let k=0;k<l.length;k++){if(l[k].ordem!==k+1){const {error}=await sb.from('rh_cadastro_opcoes').update({ordem:k+1}).eq('empresa_id',empresa).eq('id',l[k].id);if(error)throw error;}}await carregar();}}catch(err){window.alerta(err.message,'Erro','erro');}finally{ocupado=false;}return;}
      if(alternar){ocupado=true;try{const r=registros.find(r=>r.id===alternar.dataset.alternar);const {error}=await sb.from('rh_cadastro_opcoes').update({ativo:!r.ativo}).eq('empresa_id',empresa).eq('id',r.id);if(error)throw error;await carregar();}catch(err){window.alerta(err.message,'Erro','erro');}finally{ocupado=false;}}
    });
    host.addEventListener('submit',async e=>{
      if(e.target.matches('[data-ideia-form]'))return;e.preventDefault();if(!pode||ocupado)return;
      const form=e.target,nome=form.elements.nome.value.trim();if(!nome){form.elements.nome.focus();return;}
      ocupado=true;const botao=form.querySelector('[type=submit]');botao.disabled=true;
      try{
        const payload={nome};const query=form.dataset.id?sb.from('rh_cadastro_opcoes').update(payload).eq('empresa_id',empresa).eq('id',form.dataset.id):sb.from('rh_cadastro_opcoes').insert({...payload,empresa_id:empresa,tipo:form.closest('[data-rh-tipo]').dataset.rhTipo,ordem:registros.filter(r=>r.tipo===form.closest('[data-rh-tipo]').dataset.rhTipo).reduce((m,r)=>Math.max(m,r.ordem||0),0)+1});
        const {error}=await query;if(error)throw error;reset(form);await carregar();window.alerta('Cadastro salvo.','Sucesso','sucesso');
      }catch(err){window.alerta(err.code==='23505'?'Este nome j\u00e1 est\u00e1 cadastrado.':err.message,'Erro','erro');}finally{ocupado=false;botao.disabled=false;}
    });
    // Nov/2026: por quantos dias a Início mostra a celebração depois que uma ideia é premiada.
    const cel=document.createElement('section');cel.className='pr-card';cel.dataset.rhIdeia='';
    cel.innerHTML='<h2>Ideia Premiada na Início</h2><p class="pr-ajuda">Quando uma ideia é premiada, o banner da Ideia Premiada na Início vira uma celebração (a ideia escolhida, quem enviou e a premiação) durante estes dias. Depois volta ao convite normal. Use 0 para não mostrar.</p><form class="pr-rh-form" data-ideia-form><label>Dias de celebração<input name="dias" class="el-input" type="number" min="0" max="60" step="1" required></label><button class="btn primary" type="submit">Salvar</button></form>';
    host.appendChild(cel);
    const formCel=cel.querySelector('[data-ideia-form]');
    if(!pode){formCel.querySelectorAll('input,button').forEach(el=>el.disabled=true);}
    try{const {data,error}=await sb.rpc('ideias_premiadas_config_ler',{p_empresa:empresa});if(error)throw error;formCel.elements.dias.value=data?.dias_celebracao??4;}catch(err){formCel.elements.dias.value=4;console.warn('[Parâmetros RH] ideia premiada:',err);}
    formCel.addEventListener('submit',async e=>{
      e.preventDefault();const botao=formCel.querySelector('[type=submit]');botao.disabled=true;
      try{const {error}=await sb.rpc('ideias_premiadas_config_salvar',{p_empresa:empresa,p_dias:Number(formCel.elements.dias.value)});if(error)throw error;window.alerta('Parâmetro salvo.','Sucesso','sucesso');}
      catch(err){window.alerta(err.message,'Erro','erro');}finally{botao.disabled=!pode;}
    });
    try{await carregar();host.dataset.pronto=empresa;}catch(err){window.alerta(err.message,'Erro','erro');throw err;}
  };
})();
