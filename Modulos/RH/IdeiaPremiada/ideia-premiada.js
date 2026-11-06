(async function(){
  'use strict';
  const $ = id => document.getElementById(id);
  // Nov/2026: nomes das situações pensados como decisão (Aprovada / Em espera / Reprovada). Os valores no banco não mudaram.
  const status = {recebida:'Nova',em_analise:'Em espera',selecionada:'Aprovada',implementada:'Implementada',premiada:'Premiada',nao_priorizada:'Reprovada'};
  const DECISOES = [
    {v:'premiada', rotulo:'Aprovar e premiar', classe:'aprovar'},
    {v:'em_analise', rotulo:'Colocar em espera', classe:'espera'},
    {v:'nao_priorizada', rotulo:'Reprovar', classe:'reprovar'}
  ];
  // Nov/2026: abas da coluna de ideias (a situação de cada ideia cai em uma delas).
  const GRUPOS = [
    {k:'recebidas', rotulo:'Recebidas', st:['recebida'], alerta:true},
    {k:'espera', rotulo:'Em espera', st:['em_analise']},
    // Aprovada = premiada (pedido do usuário): ideias aprovadas/implementadas de antes também ficam aqui.
    {k:'premiadas', rotulo:'Premiadas', st:['premiada','selecionada','implementada']},
    {k:'reprovadas', rotulo:'Reprovadas', st:['nao_priorizada']}
  ];
  let grupo='recebidas';
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalizar = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  const data = value => new Date(value).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
  const dataHora = value => new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  let contexto, ideias=[], modo='minhas', selecionada=null, requisicao=0, podeAvaliar=false, podeListar=false, decisao=null;
  function mensagem(error){
    if(['PGRST202','42P01'].includes(error?.code)) return 'Ideia Premiada ainda não foi ativada no banco de dados. Consulte o administrador.';
    return error?.message || 'Não foi possível concluir. Tente novamente.';
  }
  function aviso(texto){ $('avisoIdeias').textContent=texto; }
  function iniciais(nome){ return String(nome||'?').split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase(); }
  function foto(i, grande){
    let url='';
    try{ if(i.autor_id) url=window.supabaseClient.storage.from('avatares').getPublicUrl(contexto.empresa_id+'/'+i.autor_id+'.jpg').data.publicUrl; }catch(_){}
    return `<span class="ideia-foto${grande?' grande':''}">${escape(iniciais(i.autor_nome))}${url?`<img src="${escape(url)}" alt="" loading="lazy" onerror="this.remove()">`:''}</span>`;
  }
  function pesquisadas(){
    const termos=normalizar($('buscaIdeias').value).split(/\s+/).filter(Boolean), filtro=$('statusIdeias').value;
    return ideias.filter(i=>(!filtro||i.status===filtro)&&termos.every(t=>normalizar([i.titulo,i.autor_nome,i.area,i.problema,i.proposta,i.beneficio,status[i.status]].join(' ')).includes(t)));
  }
  function filtradas(){ const g=GRUPOS.find(x=>x.k===grupo)||GRUPOS[0]; return pesquisadas().filter(i=>g.st.includes(i.status)); }
  function renderGrupos(){
    const base=pesquisadas();
    $('ideiaGrupos').innerHTML=GRUPOS.map(g=>{
      const n=base.filter(i=>g.st.includes(i.status)).length;
      return `<button type="button" role="tab" data-grupo="${g.k}" aria-selected="${g.k===grupo}" class="${g.k===grupo?'active':''}">${g.rotulo}${g.alerta?` <span class="tab-badge">${n||''}</span>`:` <small class="ideia-grupo-n">${n}</small>`}</button>`;
    }).join('');
  }
  function render(){
    renderGrupos();
    const lista=filtradas();
    if(selecionada && !lista.some(i=>i.id===selecionada.id)) selecionada=null;
    if(!selecionada && lista.length) selecionada=lista[0];
    $('listaIdeias').innerHTML=lista.length?lista.map(i=>`<button class="ideia-item${selecionada&&i.id===selecionada.id?' ativo':''}" type="button" data-id="${escape(i.id)}" aria-pressed="${selecionada&&i.id===selecionada.id}">${foto(i)}<span class="ideia-item-texto"><strong>${escape(i.titulo)}</strong><small>${escape(i.autor_nome)} · ${data(i.created_at)}</small></span><span class="ideia-status ${escape(i.status)}">${escape(status[i.status])}</span></button>`).join(''):`<div class="ideia-vazio">${ideias.length?(pesquisadas().length?'Nenhuma ideia nesta aba.':'Nenhuma ideia corresponde à pesquisa.'):modo==='todas'?'As novas ideias da equipe aparecerão aqui.':'Você ainda não enviou uma ideia. Sua próxima melhoria pode começar aqui.'}</div>`;
    renderDetalhe();
  }
  function renderDetalhe(){
    const host=$('ideiaDetalhe');const i=selecionada;
    if(!i){host.innerHTML='<div class="ideia-vazio">Escolha uma ideia na lista para ver os detalhes.</div>';return;}
    const avaliar=podeAvaliar&&modo==='todas';
    decisao=null;
    const historico=Array.isArray(i.historico)?i.historico:[];
    host.innerHTML=`<header class="ideia-det-topo">${foto(i,true)}<div><h2>${escape(i.titulo)}</h2><div class="ideia-meta">Enviada por <b>${escape(i.autor_nome)}</b> · ${escape(i.area)} · ${data(i.created_at)}</div></div><span class="ideia-status ${escape(i.status)}">${escape(status[i.status])}</span></header>`+
      [['O que pode melhorar',i.problema],['A ideia',i.proposta],['O benefício',i.beneficio]].map(([t,v])=>`<section class="ideia-bloco"><h3>${t}</h3><p>${escape(v)}</p></section>`).join('')+
      (!avaliar&&(i.retorno||i.premio)?`<section class="ideia-bloco ideia-retorno"><h3>Retorno da empresa</h3>${i.retorno?`<p>${escape(i.retorno)}</p>`:''}${i.premio?`<p><b>Premiação:</b> ${escape(i.premio)}</p>`:''}</section>`:'')+
      (avaliar?`<form id="formAvaliacao" class="ideia-decisao"><h3>Decisão</h3><div class="ideia-decisao-botoes" role="group" aria-label="Decisão">${DECISOES.map(d=>`<button type="button" class="ideia-dec ${d.classe}" data-decisao="${d.v}" aria-pressed="false">${d.rotulo}</button>`).join('')}</div>
        <label>Justificativa *<textarea class="el-input" name="retorno" maxlength="3000" rows="3" placeholder="Explique o porquê da decisão. O autor verá este texto."></textarea></label>
        <label class="ideia-premio" hidden>Premiação<input class="el-input" name="premio" maxlength="300" placeholder="Descreva o reconhecimento concedido" value="${escape(i.premio)}"></label>
        <p id="avisoAvaliacao" role="status"></p><button class="btn primary" id="salvarAvaliacao" disabled>Salvar decisão</button></form>`:'')+
      (historico.length?`<section class="ideia-bloco"><h3>Histórico de decisões</h3><ol class="ideia-hist">${historico.map(h=>`<li><span class="ideia-status ${escape(h.status)}">${escape(status[h.status]||h.status)}</span><div><small>${escape(h.por||'')} · ${dataHora(h.em)}</small>${h.retorno?`<p>${escape(h.retorno)}</p>`:''}${h.premio&&h.status==='premiada'?`<p><b>Premiação:</b> ${escape(h.premio)}</p>`:''}</div></li>`).join('')}</ol></section>`:'');
  }
  async function carregar(){
    const versao=++requisicao;
    $('listaIdeias').textContent='Carregando ideias…';
    try{
      const {data,error}=await window.supabaseClient.rpc('ideias_premiadas_listar',{p_empresa:contexto.empresa_id,p_todas:modo==='todas'});
      if(versao!==requisicao)return;
      if(error)throw error;
      ideias=data||[];
      if(selecionada) selecionada=ideias.find(i=>i.id===selecionada.id)||null;
      render();
    }catch(error){if(versao===requisicao){ideias=[];$('listaIdeias').textContent=mensagem(error);$('ideiaDetalhe').innerHTML='';}}
  }
  function aba(nome){
    if(!contexto)return;
    if(nome==='todas'&&!podeListar)return;
    aviso('');$('painelEnviar').hidden=nome!=='enviar';$('painelLista').hidden=nome==='enviar';
    [['tabEnviar','enviar'],['tabMinhas','minhas'],['tabRecebidas','todas']].forEach(([id,v])=>{$(id).classList.toggle('ativo',v===nome);$(id).setAttribute('aria-pressed',String(v===nome));});
    if(nome!=='enviar'){modo=nome;selecionada=null;$('tituloLista').textContent=nome==='todas'?'Ideias recebidas':'Minhas ideias';carregar();}
  }
  function escolherDecisao(v){
    decisao=v;
    const form=$('formAvaliacao');if(!form)return;
    form.querySelectorAll('[data-decisao]').forEach(b=>{const on=b.dataset.decisao===v;b.classList.toggle('ativo',on);b.setAttribute('aria-pressed',String(on));});
    form.querySelector('.ideia-premio').hidden=v!=='premiada';
    $('salvarAvaliacao').disabled=false;$('avisoAvaliacao').textContent='';
    form.elements.retorno.focus();
  }
  $('tabEnviar').addEventListener('click',()=>aba('enviar'));
  $('tabMinhas').addEventListener('click',()=>aba('minhas'));
  $('tabRecebidas').addEventListener('click',()=>aba('todas'));
  $('buscaIdeias').addEventListener('input',render);$('statusIdeias').addEventListener('change',render);
  $('recarregarIdeias').addEventListener('click',()=>contexto&&carregar());
  $('ideiaGrupos').addEventListener('click',event=>{const b=event.target.closest('[data-grupo]');if(!b)return;grupo=b.dataset.grupo;selecionada=null;render();});
  $('listaIdeias').addEventListener('click',event=>{const item=event.target.closest('[data-id]');if(!item)return;selecionada=ideias.find(i=>i.id===item.dataset.id)||null;render();});
  $('ideiaDetalhe').addEventListener('click',event=>{const b=event.target.closest('[data-decisao]');if(b)escolherDecisao(b.dataset.decisao);});
  $('formIdeia').addEventListener('submit',async event=>{
    event.preventDefault();if(!contexto||$('btnEnviarIdeia').disabled)return;
    const dados=Object.fromEntries(new FormData(event.target));Object.keys(dados).forEach(k=>dados[k]=dados[k].trim());
    if(dados.titulo.length<5||[dados.problema,dados.proposta,dados.beneficio].some(v=>v.length<10)){aviso('Conte um pouco mais sobre a melhoria. O título precisa de 5 caracteres e cada descrição de 10.');return;}
    $('btnEnviarIdeia').disabled=true;aviso('Enviando sua ideia…');
    try{
      const {error}=await window.supabaseClient.rpc('ideias_premiadas_enviar',{p_empresa:contexto.empresa_id,p_dados:dados});if(error)throw error;
      event.target.reset();aba('minhas');aviso('Sua ideia foi recebida! Você pode acompanhar a avaliação em Minhas ideias.');
    }catch(error){aviso(mensagem(error));}finally{$('btnEnviarIdeia').disabled=false;}
  });
  $('ideiaDetalhe').addEventListener('submit',async event=>{
    if(event.target.id!=='formAvaliacao')return;
    event.preventDefault();if(!selecionada||!podeAvaliar)return;
    const form=event.target, retorno=form.elements.retorno.value.trim(), premio=form.elements.premio.value.trim();
    if(!decisao){$('avisoAvaliacao').textContent='Escolha a decisão.';return;}
    if(retorno.length<10){$('avisoAvaliacao').textContent='Escreva a justificativa da decisão (pelo menos 10 letras).';form.elements.retorno.focus();return;}
    if(decisao==='premiada'&&premio.length<3){$('avisoAvaliacao').textContent='Descreva a premiação.';form.elements.premio.focus();return;}
    $('salvarAvaliacao').disabled=true;
    try{
      const {error}=await window.supabaseClient.rpc('ideias_premiadas_avaliar',{p_empresa:contexto.empresa_id,p_id:selecionada.id,p_status:decisao,p_retorno:retorno,p_premio:decisao==='premiada'?premio:selecionada.premio||'',p_updated_at:selecionada.updated_at});if(error)throw error;
      aviso('Decisão salva. O autor verá a justificativa.');await carregar();
    }catch(error){$('avisoAvaliacao').textContent=mensagem(error);$('salvarAvaliacao').disabled=false;}
  });
  try{
    contexto=await window.aguardarContexto();if(!contexto?.empresa_id)throw new Error('Não foi possível validar sua sessão. Recarregue a página.');
    await window.EasyLocPermissions.load();
    if(!window.EasyLocPermissions.canNavigate(location.href))return;
    podeAvaliar=window.EasyLocPermissions.hasPermission('rh.ideias.avaliar');podeListar=podeAvaliar||window.EasyLocPermissions.hasPermission('rh.ideias.visualizar');
    $('autorIdeia').textContent=`Enviando como ${contexto.usuario_nome}.`;$('btnEnviarIdeia').disabled=false;
    if(new URLSearchParams(location.search).get('aba')==='recebidas'&&podeListar)aba('todas');
  }catch(error){aviso(mensagem(error));}
})();
