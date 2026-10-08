(async function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const status = {recebida:'Recebida',em_analise:'Em análise',selecionada:'Selecionada',implementada:'Implementada',premiada:'Premiada',nao_priorizada:'Não priorizada'};
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalizar = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const data = value => new Date(value).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
  let contexto, ideias=[], modo='minhas', selecionada=null, requisicao=0, podeAvaliar=false, podeListar=false;
  function mensagem(error){
    if(['PGRST202','42P01'].includes(error?.code)) return 'Ideia Premiada ainda não foi ativada no banco de dados. Consulte o administrador.';
    return error?.message || 'Não foi possível concluir. Tente novamente.';
  }
  function aviso(texto){ $('avisoIdeias').textContent=texto; }
  function render(){
    const termos=normalizar($('buscaIdeias').value).split(/\s+/).filter(Boolean), filtro=$('statusIdeias').value;
    const lista=ideias.filter(i=>(!filtro||i.status===filtro)&&termos.every(t=>normalizar([i.titulo,i.autor_nome,i.area,i.problema,i.proposta,i.beneficio,status[i.status]].join(' ')).includes(t)));
    $('listaIdeias').innerHTML=lista.length?lista.map(i=>`<button class="ideia-item" type="button" data-id="${escape(i.id)}"><header><div><h3>${escape(i.titulo)}</h3><div class="ideia-meta">${escape(i.autor_nome)} · ${escape(i.area)} · ${data(i.created_at)}</div></div><span class="ideia-status ${escape(i.status)}">${escape(status[i.status])}</span></header></button>`).join(''):`<div class="ideia-vazio">${ideias.length?'Nenhuma ideia corresponde à pesquisa.':modo==='todas'?'As novas ideias da equipe aparecerão aqui.':'Você ainda não enviou uma ideia. Sua próxima melhoria pode começar aqui.'}</div>`;
  }
  async function carregar(){
    const versao=++requisicao;
    $('listaIdeias').textContent='Carregando ideias…';
    try{
      const {data,error}=await window.supabaseClient.rpc('ideias_premiadas_listar',{p_empresa:contexto.empresa_id,p_todas:modo==='todas'});
      if(versao!==requisicao)return;
      if(error)throw error;
      ideias=data||[];render();
    }catch(error){if(versao===requisicao){ideias=[];$('listaIdeias').textContent=mensagem(error);}}
  }
  function aba(nome){
    if(!contexto)return;
    if(nome==='todas'&&!podeListar)return;
    aviso('');$('painelEnviar').hidden=nome!=='enviar';$('painelLista').hidden=nome==='enviar';
    [['tabEnviar','enviar'],['tabMinhas','minhas'],['tabRecebidas','todas']].forEach(([id,v])=>{$(id).classList.toggle('ativo',v===nome);$(id).setAttribute('aria-pressed',String(v===nome));});
    if(nome!=='enviar'){modo=nome;$('tituloLista').textContent=nome==='todas'?'Ideias recebidas':'Minhas ideias';carregar();}
  }
  function abrir(id){
    selecionada=ideias.find(i=>i.id===id);if(!selecionada)return;
    const i=selecionada;
    $('tituloDetalhe').textContent=i.titulo;
    $('conteudoDetalhe').innerHTML=`<div class="ideia-meta">${escape(i.autor_nome)} · ${escape(i.area)} · ${data(i.created_at)}</div><p><span class="ideia-status ${escape(i.status)}">${escape(status[i.status])}</span></p>`+[['O que pode melhorar',i.problema],['A ideia',i.proposta],['O benefício',i.beneficio],['Retorno da empresa',i.retorno],['Premiação',i.premio]].filter(([,v])=>v).map(([t,v])=>`<h3>${t}</h3><p>${escape(v)}</p>`).join('');
    const form=$('formAvaliacao');form.hidden=!podeAvaliar||modo!=='todas';form.elements.status.value=i.status;form.elements.retorno.value=i.retorno;form.elements.premio.value=i.premio;$('avisoAvaliacao').textContent='';$('detalheIdeia').showModal();
  }
  $('tabEnviar').addEventListener('click',()=>aba('enviar'));
  $('tabMinhas').addEventListener('click',()=>aba('minhas'));
  $('tabRecebidas').addEventListener('click',()=>aba('todas'));
  $('buscaIdeias').addEventListener('input',render);$('statusIdeias').addEventListener('change',render);
  $('recarregarIdeias').addEventListener('click',()=>contexto&&carregar());
  $('listaIdeias').addEventListener('click',event=>{const item=event.target.closest('[data-id]');if(item)abrir(item.dataset.id);});
  $('fecharDetalhe').addEventListener('click',()=>{if(!$('salvarAvaliacao').disabled)$('detalheIdeia').close();});
  $('detalheIdeia').addEventListener('cancel',event=>{if($('salvarAvaliacao').disabled)event.preventDefault();});
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
  $('formAvaliacao').addEventListener('submit',async event=>{
    event.preventDefault();if(!selecionada||!podeAvaliar||$('salvarAvaliacao').disabled)return;
    const valores=Object.fromEntries(new FormData(event.target));
    if(['premiada','nao_priorizada'].includes(valores.status)&&valores.retorno.trim().length<5){$('avisoAvaliacao').textContent='Registre um retorno para o autor antes de salvar.';return;}
    $('salvarAvaliacao').disabled=true;
    try{
      const {error}=await window.supabaseClient.rpc('ideias_premiadas_avaliar',{p_empresa:contexto.empresa_id,p_id:selecionada.id,p_status:valores.status,p_retorno:valores.retorno,p_premio:valores.premio,p_updated_at:selecionada.updated_at});if(error)throw error;
      $('detalheIdeia').close();aviso('Avaliação salva. O autor poderá consultar o retorno.');await carregar();
    }catch(error){$('avisoAvaliacao').textContent=mensagem(error);}finally{$('salvarAvaliacao').disabled=false;}
  });
  try{
    contexto=await window.aguardarContexto();if(!contexto?.empresa_id)throw new Error('Não foi possível validar sua sessão. Recarregue a página.');
    await window.EasyLocPermissions.load();
    if(!window.EasyLocPermissions.canNavigate(location.href))return;
    podeAvaliar=window.EasyLocPermissions.hasPermission('rh.ideias.avaliar');podeListar=podeAvaliar||window.EasyLocPermissions.hasPermission('rh.ideias.visualizar');
    $('tabRecebidas').hidden=!podeListar;$('autorIdeia').textContent=`Enviando como ${contexto.usuario_nome}.`;$('btnEnviarIdeia').disabled=false;
    if(new URLSearchParams(location.search).get('aba')==='recebidas'&&podeListar)aba('todas');
  }catch(error){aviso(mensagem(error));}
})();
