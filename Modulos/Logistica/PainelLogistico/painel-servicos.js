(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const brl=v=>v==null?'—':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dia=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'Sem data';
  const quando=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Não registrado';
  const nomes={frete:'Frete',free:'Free',uber:'Uber'},tipos={valor:'Valores',presenca:'Presença',horario:'Horários'};
  const estados={},div={abertas:[],resolvidas:[]};let contexto,ativo,leituraDiv,carregadoDiv=false,canal,atualizacao;
  const host=nome=>document.getElementById('plModulo'+({free:'Free',uber:'Uber',divergencias:'Divergencias'}[nome]));
  async function ctx(){if(!contexto){contexto=await window.aguardarContexto();assinarConfirmacoes();}return contexto;}
  function assinarConfirmacoes(){
    if(canal||!window.supabaseClient?.channel)return;
    canal=window.supabaseClient.channel('painel-confirmacoes-apps-'+contexto.empresa_id);
    for(const tabela of ['operacao_etapa_pessoas','free_vagas','free_inscricoes','uber_vagas','uber_corridas']){
      canal.on('postgres_changes',{event:'*',schema:'public',table:tabela,filter:'empresa_id=eq.'+contexto.empresa_id},()=>{
        clearTimeout(atualizacao);atualizacao=setTimeout(()=>{if(ativo&&!document.hidden&&!host(ativo)?.hidden&&!document.querySelector('dialog[open]'))carregar(ativo);},350);
      });
    }
    canal.subscribe();
  }
  async function rpc(nome,args){const {data,error}=await window.supabaseClient.rpc(nome,args);if(error)throw Error(error.message||'Não foi possível consultar os serviços.');return data;}
  const editavel=()=>window.EasyLocPermissions?.hasPermission?.('logistica.planejamento.editar')!==false;
  function faixa(){const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()),fim=new Date(hoje+'T12:00:00');fim.setDate(fim.getDate()+60);return {inicio:hoje,fim:fim.toISOString().slice(0,10)};}
  function preparar(nome){
    const h=host(nome);if(h.dataset.pronto)return;h.dataset.pronto='true';
    const periodo=faixa();estados[nome]={lista:[],sequencia:0};
    h.innerHTML='<div class="pls-barra">'+(nome==='divergencias'?
      '<label>Serviço<select data-origem><option value="">Todos</option><option value="free">Free</option><option value="uber">Uber</option></select></label><label>Tipo<select data-tipo><option value="">Todos</option><option value="valor">Valores</option><option value="presenca">Presença</option><option value="horario">Horários</option></select></label><label>Situação<select data-situacao><option value="abertas">A resolver</option><option value="resolvidas">Tratadas nos últimos 30 dias</option></select></label>':
      '<label>De<input type="date" data-inicio value="'+periodo.inicio+'"></label><label>Até<input type="date" data-fim value="'+periodo.fim+'"></label><label>Confirmação no aplicativo<select data-vagas><option value="">Todas</option><option value="pendentes">Com confirmação pendente</option><option value="confirmadas">Todos confirmaram</option><option value="nao_enviado">Ainda não enviado ao app</option></select></label>')+
      '<label class="pls-busca">Buscar<input type="search" data-busca placeholder="Pedido, pessoa ou local"></label><button type="button" data-atualizar>Atualizar</button></div><p class="pls-erro" id="plServicosErro-'+nome+'" role="alert" hidden></p><p class="pls-resumo" aria-live="polite"></p><div class="pls-conteudo"></div>';
    h.addEventListener('input',e=>{if(e.target.matches('[data-busca]'))pintar(nome);});
    h.addEventListener('change',e=>{if(e.target.matches('[data-inicio],[data-fim]'))carregar(nome);else if(e.target.tagName==='SELECT')pintar(nome);});
    h.addEventListener('click',e=>{if(e.target.closest('[data-atualizar]'))carregar(nome);const b=e.target.closest('[data-tratar]');if(b)decidir(b.dataset.tratar,b.dataset.acao||'tratar');});
  }
  function erro(nome,texto){const el=host(nome)?.querySelector('.pls-erro');if(el){el.textContent=texto||'';el.hidden=!texto;}}
  async function carregar(nome){
    preparar(nome);erro(nome,'');const h=host(nome),estado=estados[nome],seq=++estado.sequencia;h.setAttribute('aria-busy','true');
    try{
      if(nome==='divergencias')await lerDivergencias();
      else{
        const inicio=h.querySelector('[data-inicio]').value,fim=h.querySelector('[data-fim]').value;
        if(!inicio||!fim||inicio>fim)throw Error('Informe um período válido.');
        const c=await ctx(),lista=await rpc('logistica_acompanhamento_lista',{p_empresa:c.empresa_id,p_tipo:nome,p_inicio:inicio,p_fim:fim});
        if(seq!==estado.sequencia)return;estado.lista=lista||[];
      }
      if(seq===estado.sequencia)pintar(nome);
    }catch(e){if(seq===estado.sequencia)erro(nome,e.message);}
    finally{if(seq===estado.sequencia)h.removeAttribute('aria-busy');}
  }
  function badge(){const el=document.querySelector('#plTabDivergencias .pl-alerta-aba');if(el){el.textContent=String(div.abertas.length);el.hidden=!div.abertas.length;}}
  async function lerDivergencias(){
    if(leituraDiv)return leituraDiv;
    leituraDiv=(async()=>{const c=await ctx(),data=await rpc('logistica_divergencias_lista',{p_empresa:c.empresa_id});div.abertas=(data?.abertas||[]).filter(d=>d.origem!=='frete');div.resolvidas=(data?.resolvidas||[]).filter(d=>d.origem!=='frete');carregadoDiv=true;badge();await window.DivergenciasTabela.lerFotos(c.empresa_id,[...div.abertas,...div.resolvidas]);})();
    try{await leituraDiv;}finally{leituraDiv=null;}
  }
  const normalizar=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const confirmados=v=>(v.participantes||[]).filter(p=>p.status_app==='confirmado').length;
  const semEnvio=v=>v.publicado===false||(v.participantes||[]).some(p=>p.status_app==='nao_enviado'||p.status_app==='nao_convidado');
  function pintar(nome){
    const h=host(nome);if(!h?.dataset.pronto)return;
    const termo=normalizar(h.querySelector('[data-busca]').value).trim(),termos=termo.split(/\s+/).filter(Boolean);let lista;
    if(nome==='divergencias'){
      const origem=h.querySelector('[data-origem]').value,tipo=h.querySelector('[data-tipo]').value,situacao=h.querySelector('[data-situacao]').value;
      lista=div[situacao].filter(d=>(!origem||d.origem===origem)&&(!tipo||d.tipo===tipo));
      lista=lista.filter(d=>termos.every(t=>normalizar([d.nome,pedidoDe(d),clienteDe(d),d.local,d.titulo,d.observacao].join(' ')).includes(t)));
      lista.sort((a,b)=>String(a.data||'').localeCompare(String(b.data||''))||String(a.nome).localeCompare(String(b.nome),'pt-BR'));
      h.querySelector('.pls-resumo').textContent=lista.length+' divergência(s) '+(situacao==='abertas'?'a resolver':'tratada(s)');
      h.querySelector('.pls-conteudo').innerHTML=lista.length?tabelasDiv(lista,situacao==='resolvidas'):'<p class="pls-vazio">'+(termo||origem||tipo?'Nenhuma divergência encontrada nestes filtros.':situacao==='abertas'?'Nenhuma divergência a resolver.':'Nenhuma divergência tratada nos últimos 30 dias.')+'</p>';
    }else{
      const filtro=h.querySelector('[data-vagas]').value;
      lista=estados[nome].lista.filter(v=>{
        const participantes=v.participantes||[],pendentes=Math.max(0,Number(v.quantidade)-confirmados(v));
        return (!filtro||(filtro==='pendentes'?pendentes>0:filtro==='nao_enviado'?semEnvio(v):Number(v.quantidade)>0&&pendentes===0))&&termos.every(t=>normalizar([v.pedido,v.cliente,v.local,v.ponto_encontro,...participantes.map(p=>p.nome)].join(' ')).includes(t));
      });
      const totalConfirmados=lista.reduce((s,v)=>s+confirmados(v),0),totalPendentes=lista.reduce((s,v)=>s+Math.max(0,Number(v.quantidade)-confirmados(v)),0);
      h.querySelector('.pls-resumo').textContent=lista.length+' serviço(s) · '+totalConfirmados+' confirmaram no aplicativo · '+totalPendentes+' com confirmação pendente';
      h.querySelector('.pls-conteudo').innerHTML=lista.length?'<div class="pls-anuncios">'+lista.map(v=>cartaoAnuncio(v,nome)).join('')+'</div>':'<p class="pls-vazio">Nenhuma escala ou solicitação de '+(nome==='free'?'Free':'Uber')+' encontrada neste período e filtro.</p>';
    }
  }
  function cartaoAnuncio(v,nome){
    const pessoas=v.participantes||[],conf=confirmados(v),pendentes=Math.max(0,Number(v.quantidade)-conf);
    const status=v.publicado===false?'Ainda não enviado ao app':pendentes?pendentes+' aguardando confirmação':'Todos confirmaram no app';
    const rotulos={confirmado:'Confirmou no aplicativo',aguardando:'Aguardando confirmação no app',nao_enviado:'Ainda não enviado ao aplicativo',nao_convidado:'Sem convite disponível no app',cadastro_pendente:'Cadastro aguardando aprovação',cancelou:'Cancelou no aplicativo',retirado:'Retirado da vaga',convite_encerrado:'Convite encerrado sem confirmação'};
    return '<article class="pls-anuncio" data-anuncio="'+esc(v.id)+'"><header><strong>'+dia(v.data)+(v.hora?' · '+esc(String(v.hora).slice(0,5)):'')+'</strong><span class="pls-selo '+(pendentes?'is-pendente':'is-ok')+'">'+status+'</span></header><h2>'+esc(v.local||v.etapa||nomes[nome])+'</h2><p>Pedido '+esc(v.pedido||'—')+' · '+esc(v.cliente||'')+'</p><p>'+esc(v.etapa||'')+'</p><dl><div><dt>Ponto de encontro</dt><dd>'+esc(v.ponto_encontro||'A definir')+'</dd></div><div><dt>'+(nome==='free'?'Diária':'Por carro')+'</dt><dd>'+brl(v.valor)+'</dd></div><div><dt>Confirmaram no aplicativo</dt><dd>'+conf+' / '+esc(v.quantidade)+'</dd></div></dl>'+(v.observacao?'<p class="pls-nota">'+esc(v.observacao)+'</p>':'')+'<details open><summary>Confirmações no aplicativo</summary>'+(pessoas.length?'<ul>'+pessoas.map(p=>'<li data-confirmacao-app="'+esc(p.status_app||'aguardando')+'"><strong>'+esc(p.nome)+'</strong>'+(p.escalado?'<small>Escalado em Equipes</small>':'')+'<span class="pls-confirmacao '+(p.status_app==='confirmado'?'is-confirmado':'is-pendente')+'">'+esc(rotulos[p.status_app]||rotulos.aguardando)+'</span>'+(p.status_app==='confirmado'&&p.confirmado_em?'<small>Confirmou em '+quando(p.confirmado_em)+'</small>':'')+(p.motivo?'<small>'+esc(p.motivo)+'</small>':'')+(p.checkin||p.checkout?'<small>Entrada: '+quando(p.checkin)+' · Saída: '+quando(p.checkout)+'</small>':'')+'</li>').join('')+'</ul>':'<p>Ninguém confirmou no aplicativo.</p>')+'</details></article>';
  }

  /* Divergências agrupadas por pedido (22/11), no formato das abas de anunciados: uma linha por divergência. */
  const pedidoDe=d=>window.DivergenciasTabela.pedidoDe(d),clienteDe=d=>window.DivergenciasTabela.clienteDe(d);
  function tabelasDiv(lista,resolvidas){
    const acoes=d=>resolvidas?'<span class="pla-tag is-verde">Decidida</span>':
      editavel()?(d.origem==='frete'?['aceitar','corrigir','recusar'].map(a=>'<button type="button" class="pla-btn-qr" data-tratar="'+esc(d.chave)+'" data-acao="'+a+'">'+({aceitar:'Aceitar valor',corrigir:'Corrigir valor',recusar:'Recusar'}[a])+'</button>').join(''):'<button type="button" class="pla-btn-qr" data-tratar="'+esc(d.chave)+'">Registrar decisão</button>'):'';
    return window.DivergenciasTabela.html(lista,{resolvidas,acoes});
  }
  function cartaoDiv(d,resolvida){
    const frete=d.registro||{},s=frete.sistema;
    const detalhes=s?'<p>Pedido '+esc(s.pedido||'—')+' · '+esc(s.cliente||'')+'</p><p>'+esc([s.origem,s.destino].filter(Boolean).join(' → '))+'</p>':'';
    return '<article class="pls-div" data-divergencia="'+esc(d.chave)+'"><header><span class="pls-selo pls-origem">'+esc(nomes[d.origem]||d.origem)+'</span><span>'+esc(tipos[d.tipo]||d.tipo)+'</span><strong>'+esc(d.nome||'')+'</strong><small>'+dia(d.data)+(d.hora?' · '+esc(String(d.hora).slice(0,5)):'')+'</small></header><h2>'+esc(d.titulo)+'</h2><p>'+esc([d.pedido?'Pedido '+d.pedido:'',d.cliente,d.local].filter(Boolean).join(' · '))+'</p>'+detalhes+(d.tipo==='valor'?'<div class="pls-comparacao"><div><span>'+(d.origem==='free'?'Diária anunciada':'Previsto no sistema')+'</span><b>'+brl(d.valor_previsto)+'</b></div><div><span>'+(d.origem==='free'&&d.ajuste!=null?'Diária + ajuste':'Valor registrado')+'</span><b>'+brl(d.valor_informado)+'</b></div></div>':'<p>Entrada: '+quando(d.checkin)+' · Saída: '+quando(d.checkout)+'</p>'+(d.horario_ciente?'<p>Programação no aceite: '+esc([d.data_ciente,d.horario_ciente].filter(Boolean).join(' · '))+'</p>':''))+(d.observacao?'<p class="pls-nota">'+esc(d.observacao)+'</p>':'')+(d.origem==='frete'&&frete.observacao?'<p>'+esc(frete.observacao)+'</p>':'')+(resolvida?'<footer><strong>Tratada por '+esc(d.tratado_por||'')+' · '+quando(d.tratado_em)+'</strong><p>'+esc(d.motivo||'')+'</p></footer>':editavel()?'<footer>'+(d.origem==='frete'?['aceitar','corrigir','recusar'].map(a=>'<button type="button" data-tratar="'+esc(d.chave)+'" data-acao="'+a+'">'+({aceitar:'Aceitar valor',corrigir:'Corrigir valor',recusar:'Recusar'}[a])+'</button>').join(''):'<button type="button" data-tratar="'+esc(d.chave)+'">Registrar tratamento</button>')+'</footer>':'')+'</article>';
  }
  function decidir(chave,acao){
    if(!editavel())return;const item=div.abertas.find(d=>d.chave===chave);if(!item)return;
    const dialog=document.createElement('dialog');dialog.className='pls-dialogo';let salvando=false;
    const titulo=item.origem==='frete'?{aceitar:'Aceitar valor do frete',corrigir:'Corrigir valor do frete',recusar:'Recusar frete'}[acao]:'Registrar decisão';
    dialog.innerHTML='<form><h2>'+esc(titulo)+'</h2><p>'+esc(item.nome)+' · '+esc(item.titulo)+'</p>'+(acao==='corrigir'?'<label>Valor correto (R$)<input type="number" name="valor" min="0.01" step="0.01" required></label>':'')+'<label>'+(item.origem==='frete'?'Motivo da decisão':'Solução aplicada ou justificativa')+'<textarea name="motivo" rows="4" minlength="3" maxlength="2000" required></textarea></label><p class="pls-erro" role="alert" hidden></p><footer><button type="button" data-cancelar>Cancelar</button><button type="submit">Confirmar</button></footer></form>';
    document.body.append(dialog);dialog.querySelector('[data-cancelar]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();dialog.oncancel=e=>{if(salvando)e.preventDefault();};
    dialog.querySelector('form').onsubmit=async e=>{
      e.preventDefault();if(salvando)return;const motivo=dialog.querySelector('textarea').value.trim(),error=dialog.querySelector('.pls-erro');if(motivo.length<3)return;
      salvando=true;dialog.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=true);error.hidden=true;
      try{
        const c=await ctx();
        if(item.origem==='frete')await rpc('frete_div_resolver',{p_empresa:c.empresa_id,p_id:item.referencia,p_acao:acao,p_valor:acao==='corrigir'?Number(dialog.querySelector('[name=valor]').value):null,p_motivo:motivo});
        else await rpc('logistica_divergencia_tratar',{p_empresa:c.empresa_id,p_chave:chave,p_versao:item.versao,p_motivo:motivo});
        await lerDivergencias();pintar('divergencias');dialog.close();
      }catch(e){error.textContent=e.message;error.hidden=false;}
      finally{salvando=false;dialog.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=false);}
    };
    dialog.showModal();dialog.querySelector('input,textarea').focus();
  }
  async function contarDivergencias(){try{await lerDivergencias();}catch(e){const el=document.getElementById('plTabDivergencias');if(el)el.title='Não foi possível atualizar a contagem de divergências.';}}
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ativo&&!host(ativo)?.hidden)carregar(ativo);});
  setInterval(()=>{if(!document.hidden&&!document.querySelector('dialog[open]')){if(ativo&&!host(ativo)?.hidden)carregar(ativo);else if(carregadoDiv)contarDivergencias();}},60000);
  window.PainelServicos={async abrir(nome){ativo=nome;preparar(nome);await carregar(nome);},contarDivergencias};
})();
