/* Serviços anunciados agrupados por pedido. Fretes usam o carregamento da Expedição;
   Free e Uber mantêm QR, presença e localização. */
(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const brl=v=>v==null||v===''?'—':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const NOMES={frete:'Fretes',free:'Free',uber:'Uber'};
  const QUEM={frete:'Freteiro / caminhão',free:'Freelancer',uber:'Motorista'};
  const HOST={frete:'plModuloFretes',free:'plModuloFree',uber:'plModuloUber'};
  const APP={frete:'../../Chiavari/Fretes/freteiro.html?c=',free:'../../Chiavari/Cronograma/?page=free&c=',uber:'../../Chiavari/Uber/motorista.html?c='};
  const estados={};let contexto,ativo,canal,atraso;
  const podeEditar=()=>window.EasyLocPermissions?.hasPermission?.('logistica.planejamento.editar')===true;
  const hojeISO=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
  const somar=(iso,d)=>{const x=new Date(iso+'T12:00:00');x.setDate(x.getDate()+d);return x.toISOString().slice(0,10);};
  const diaCurto=iso=>{if(!iso)return 'Sem data';const d=new Date(String(iso).slice(0,10)+'T12:00:00');return d.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'}).replace('.','');};
  const hora=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
  const soHora=v=>v?new Date(v).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}):'';
  const normalizar=v=>String(v??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  const iniciais=n=>String(n||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase()||'?';
  const foto=(url,nome,cls)=>url?'<img class="pla-foto '+(cls||'')+'" src="'+esc(url)+'" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'pla-foto pla-ini '+(cls||'')+'\',textContent:\''+esc(iniciais(nome))+'\'}))">':'<span class="pla-foto pla-ini '+(cls||'')+'">'+esc(iniciais(nome))+'</span>';

  async function ctx(){if(!contexto){contexto=await window.aguardarContexto();assinar();}return contexto;}
  async function rpc(nome,args){const {data,error}=await window.supabaseClient.rpc(nome,args);if(error)throw Error(error.message||'Não foi possível consultar.');return data;}
  function assinar(){
    if(canal||!window.supabaseClient?.channel)return;
    canal=window.supabaseClient.channel('painel-anunciados-'+contexto.empresa_id);
    for(const t of ['frete_lancamentos','logistica_frete_conferencias','separacoes_pedidos','frete_anuncios','free_vagas','free_inscricoes','uber_vagas','uber_corridas','operacao_etapa_pessoas'])
      canal.on('postgres_changes',{event:'*',schema:'public',table:t,filter:'empresa_id=eq.'+contexto.empresa_id},()=>{
        clearTimeout(atraso);atraso=setTimeout(()=>{if(ativo&&!document.hidden&&!document.querySelector('dialog[open]'))carregar(ativo);},400);
      });
    canal.subscribe();
  }

  function preparar(tipo){
    const h=document.getElementById(HOST[tipo]);if(h.dataset.anunciados)return h;
    h.dataset.anunciados='1';h.classList.add('pl-servicos','pla');h.innerHTML=
      '<div class="pla-barra"><div class="pla-abas" role="tablist">'+
      '<button type="button" role="tab" data-periodo="proximos" aria-selected="true">Próximos <b data-conta="proximos" hidden></b></button>'+
      '<button type="button" role="tab" data-periodo="realizados" aria-selected="false">Realizados</button></div>'+
      '<span class="pla-barra-dir"><input type="search" class="pla-busca" data-busca placeholder="Buscar pedido, cliente, local ou pessoa" aria-label="Buscar">'+
      (tipo==='frete'&&podeEditar()?'<button type="button" class="pla-novo" data-avulso-novo>+ Solicitação interna</button>':'')+
      (tipo==='uber'&&podeEditar()?'<button type="button" class="pla-novo" data-uber-interna>+ Solicitação interna</button>':'')+'</span></div>'+
      '<p class="pls-erro" role="alert" hidden></p><div class="pla-conteudo"><p class="pls-vazio">Carregando…</p></div>';
    estados[tipo]={periodo:'proximos',lista:[],seq:0};
    h.addEventListener('click',e=>{
      const aba=e.target.closest('[data-periodo]');
      if(aba){estados[tipo].periodo=aba.dataset.periodo;h.querySelectorAll('[data-periodo]').forEach(b=>b.setAttribute('aria-selected',String(b===aba)));carregar(tipo);return;}
      if(e.target.closest('[data-ir-realizados]')){h.querySelector('[data-periodo="realizados"]').click();return;}
      if(e.target.closest('[data-avulso-novo]')){formAvulso(null);return;}
      if(e.target.closest('[data-uber-interna]')){formUberInterna();return;}
      const cancelarUber=e.target.closest('[data-uber-interna-cancelar]');if(cancelarUber){cancelarUberInterna(cancelarUber.dataset.uberInternaCancelar);return;}
      const ed=e.target.closest('[data-avulso-editar]');if(ed){formAvulso((estados.frete.avulsos||[]).find(x=>x.id===ed.dataset.avulsoEditar));return;}
      const cn=e.target.closest('[data-avulso-cancelar]');if(cn){cancelarAvulso(cn.dataset.avulsoCancelar);return;}
      const conferir=e.target.closest('[data-frete-conferir]');if(conferir){conferirFrete(conferir.dataset.freteConferir);return;}
      const qr=e.target.closest('[data-qr]');if(qr){abrirQr(tipo,qr.dataset.qr,qr.dataset.titulo);return;}
      const mapa=e.target.closest('[data-mapa]');if(mapa){abrirMapa(mapa.dataset.mapa,mapa.dataset.titulo);return;}
      const ped=e.target.closest('[data-abrir-pedido]');if(ped){const url=new URL('../../Comercial/Pedidos/pedido.html?pedido='+encodeURIComponent(ped.dataset.abrirPedido),location.href).href;if(window.top?.shellNavigate&&window.top!==window)window.top.shellNavigate(url);else window.open(url,'_blank');}
    });
    h.addEventListener('input',e=>{if(e.target.matches('[data-busca]'))pintar(tipo);});
    return h;
  }

  async function carregar(tipo){
    const h=preparar(tipo),st=estados[tipo],seq=++st.seq,hoje=hojeISO();
    const [ini,fim]=st.periodo==='proximos'?[hoje,somar(hoje,90)]:[somar(hoje,-90),somar(hoje,-1)];
    const erro=h.querySelector('.pls-erro');erro.hidden=true;h.setAttribute('aria-busy','true');
    try{
      const c=await ctx();if(tipo==='free'&&st.periodo==='proximos'){try{await rpc('free_automacao_rodar',{p_empresa:c.empresa_id});}catch(_){}}
      let lista=tipo==='frete'?await rpc('logistica_fretes_anunciados',{p_empresa:c.empresa_id,p_inicio:ini,p_fim:fim}):await rpc('logistica_anunciados',{p_empresa:c.empresa_id,p_tipo:tipo,p_inicio:ini,p_fim:fim});

      if(tipo==='frete'){try{const av=await rpc('logistica_fretes_avulsos',{p_empresa:c.empresa_id,p_inicio:ini,p_fim:fim});st.avulsos=(av&&av.avulsos)||[];st.freteiros=(av&&av.freteiros)||[];if(st.periodo==='realizados')st.avulsos.reverse();}catch(_){st.avulsos=[];}}
      if(seq!==st.seq)return;st.lista=lista||[];st.passados=0;
      if(st.periodo==='proximos'&&!st.lista.length){try{const periodo={p_empresa:c.empresa_id,p_inicio:somar(hojeISO(),-90),p_fim:somar(hojeISO(),-1)},ant=tipo==='frete'?await rpc('logistica_fretes_anunciados',periodo):await rpc('logistica_anunciados',{...periodo,p_tipo:tipo});if(seq!==st.seq)return;st.passados=(ant||[]).length;}catch(_){}}
      pintar(tipo);
      if(st.periodo==='proximos'){const n=st.lista.reduce((s,v)=>{const pessoas=(v.linhas||[]).filter(l=>l.tipo_linha!=='extra'),q=(v.linhas||[]).some(l=>l.tipo_linha==='extra')?pessoas.length:Math.max(Number(v.quantidade||0),pessoas.length);return s+Math.max(0,q-pessoas.filter(l=>l.confirmado).length);},0);const b=h.querySelector('[data-conta="proximos"]');b.textContent=n;b.hidden=!n;b.title=n+' vaga(s) ainda sem confirmação';}
    }catch(e){if(seq===st.seq){erro.textContent=e.message;erro.hidden=false;h.querySelector('.pla-conteudo').innerHTML='';}}
    finally{if(seq===st.seq)h.removeAttribute('aria-busy');}
  }

  function agrupar(lista){
    const m=new Map();
    for(const s of lista){const k=s.pedido_id||(s.avulso_id?'avulso:'+s.avulso_id:'sem:'+s.id);if(!m.has(k))m.set(k,{pedido_id:s.pedido_id,pedido:s.pedido,cliente:s.cliente,cliente_foto:s.cliente_foto,local:s.local,solicitacao_interna:s.solicitacao_interna,solicitacao_motivo:s.solicitacao_motivo,servicos:[]});m.get(k).servicos.push(s);}
    return [...m.values()];
  }

  function pintar(tipo){
    const h=document.getElementById(HOST[tipo]),st=estados[tipo];if(!h)return;
    const termos=normalizar(h.querySelector('[data-busca]').value).split(/\s+/).filter(Boolean);
    let lista=st.lista.filter(s=>termos.every(t=>normalizar([s.pedido,s.cliente,s.local,s.etapa,s.ponto,...(s.linhas||[]).flatMap(l=>[l.nome,l.detalhe,...(l.carregamentos||[]).map(c=>[c.transportadora,c.nome,c.placa].join(' ')),l.cobranca?.fornecedor])].join(' ')).includes(t)));
    if(st.periodo==='realizados')lista=tipo==='frete'?lista.slice().sort((a,b)=>String(b.data).localeCompare(String(a.data))):lista.slice().reverse();
    const alvo=h.querySelector('.pla-conteudo');
    const avs=tipo==='frete'?(st.avulsos||[]).filter(x=>termos.every(t=>normalizar([x.freteiro,x.origem,x.destino,x.motivo].join(' ')).includes(t))):[];
    const blocoAv=avs.length&&!st.lista.some(s=>s.avulso_id)?avulsosHtml(avs):'';
    if(blocoAv&&!lista.length){alvo.innerHTML=blocoAv;return;}
    if(!lista.length&&!termos.length&&st.periodo==='proximos'&&st.passados){alvo.innerHTML='<p class="pls-vazio">Nenhum '+(tipo==='frete'?'frete':tipo==='free'?'free':'Uber')+' anunciado para os próximos dias. Há '+st.passados+' nos últimos 90 dias. <button type="button" class="pla-link" data-ir-realizados>Ver os realizados</button></p>';return;}
    if(!lista.length){alvo.innerHTML='<p class="pls-vazio">'+(termos.length?'Nada encontrado nesta busca.':st.periodo==='proximos'?'Nenhum '+(tipo==='frete'?'frete':tipo==='free'?'free':'Uber')+' anunciado para os próximos dias.':'Nenhum '+(tipo==='frete'?'frete':tipo==='free'?'free':'Uber')+' nos últimos 90 dias.')+'</p>';return;}
    alvo.innerHTML=blocoAv+agrupar(lista).map(g=>grupoHtml(tipo,g)).join('');
  }

  /* Solicitação interna (23/11): frete que não é de pedido. A Logística cadastra aqui; ele aparece no App do Freteiro como "Avulso"
     e o freteiro escolhe na lista ao lançar. RPCs logistica_fretes_avulsos / _salvar / _cancelar. */
  const SIT_AV={aguardando:['is-pend','Aguardando o freteiro lançar'],lancado:['is-pend','Lançado no app, relatório não enviado'],enviado:['is-ok','Conferido'],divergencia:['is-erro','Divergência'],financeiro:['is-ok','No financeiro'],cancelado:['is-cancel','Cancelado']};
  function avulsosHtml(avs){
    const total=avs.filter(x=>!x.cancelado).reduce((t,x)=>t+Number(x.valor||0),0);
    return '<section class="pla-grupo pla-avulsos"><header class="pla-cab"><span class="pla-pedido is-sem is-avulso">Solicitação interna</span><div class="pla-cli"><strong>Solicitações internas</strong><small>Fretes que não são de pedido, cadastrados pela Logística</small></div>'+
      '<span class="pla-total">Total <b>'+brl(total)+'</b></span></header><div class="pla-tabela-caixa"><table class="pla-tabela"><colgroup><col style="width:11%"><col style="width:17%"><col style="width:27%"><col style="width:17%"><col style="width:9%"><col style="width:11%"><col style="width:8%"></colgroup>'+
      '<thead><tr><th>Data</th><th>Freteiro</th><th>Trajeto e motivo</th><th>Situação</th><th class="pla-num">Combinado</th><th class="pla-num">Lançado</th><th></th></tr></thead><tbody>'+
      avs.map(x=>{const st=SIT_AV[x.situacao]||['',x.situacao];const pode=podeEditar()&&['aguardando','lancado'].includes(x.situacao);
        return '<tr'+(x.cancelado?' class="pla-av-cancel"':'')+'><td><b>'+esc(diaCurto(x.data))+'</b></td><td><span class="pla-av-pessoa">'+foto(null,x.freteiro)+'<span>'+esc(x.freteiro||'')+'</span></span></td>'+
          '<td><b>'+esc(x.origem)+' → '+esc(x.destino)+'</b><small>'+esc(x.motivo)+(x.observacao?' · '+esc(x.observacao):'')+'</small>'+(x.cancelado?'<small>Cancelado: '+esc(x.cancelado_motivo||'')+'</small>':'<small>Cadastrado por '+esc(x.criado_por||'')+'</small>')+'</td>'+
          '<td><span class="pla-sit '+st[0]+'">'+esc(st[1])+'</span></td><td class="pla-num">'+brl(x.valor)+'</td><td class="pla-num">'+(x.valor_lancado!=null?brl(x.valor_lancado):'—')+'</td>'+
          '<td>'+(pode?'<button type="button" class="pla-link" data-avulso-editar="'+esc(x.id)+'">Editar</button><button type="button" class="pla-link is-perigo" data-avulso-cancelar="'+esc(x.id)+'">Cancelar</button>':'')+'</td></tr>';}).join('')+
      '</tbody></table></div></section>';
  }
  function dialogo(html){
    const d=document.createElement('dialog');d.className='pla-dialogo pla-av-form';d.innerHTML=html;
    document.body.append(d);d.querySelectorAll('[data-fechar],[data-voltar]').forEach(b=>b.onclick=()=>d.close());d.onclose=()=>d.remove();d.showModal();return d;
  }
  function formAvulso(x){
    if(!podeEditar())return;
    const fr=estados.frete.freteiros||[];
    const campo=(rot,nome,val,extra)=>'<label>'+rot+'<input type="text" name="'+nome+'" maxlength="300" value="'+esc(val||'')+'"'+(extra||'')+'></label>';
    const d=dialogo('<header><h2>'+(x?'Editar solicitação interna':'Nova solicitação interna')+'</h2><button type="button" data-fechar aria-label="Fechar">×</button></header>'+
      '<p class="pla-dlg-sub">Frete que não é de pedido (buscar material, levar peça para conserto, retirada extra). Ele aparece no App do Freteiro para ele lançar.</p>'+
      '<label>Freteiro<select name="freteiro_id"><option value="">Escolha</option>'+fr.map(f=>'<option value="'+esc(f.id)+'"'+(x&&x.freteiro_id===f.id?' selected':'')+'>'+esc(f.nome)+(f.veiculo?' · '+esc(f.veiculo):'')+'</option>').join('')+'</select></label>'+
      '<label>Data<input type="date" name="data" value="'+esc(x?x.data:hojeISO())+'"></label>'+
      campo('De onde sai','origem',x?x.origem:'Galpão')+
      campo('Para onde vai','destino',x&&x.destino,' placeholder="Ex.: Tapeçaria São José, Rua…"')+
      campo('Motivo','motivo',x&&x.motivo,' placeholder="Ex.: levar sofá para reforma"')+
      campo('Valor combinado','valor',x?String(x.valor).replace('.',','):'',' inputmode="decimal" placeholder="R$ 0,00"')+
      campo('Observação (opcional)','observacao',x&&x.observacao)+
      '<p class="pls-erro" hidden></p><div class="pla-dlg-acoes"><button type="button" class="pla-sec" data-voltar>Cancelar</button><button type="button" class="pla-novo" data-salvar>Salvar</button></div>');
    d.querySelector('[data-salvar]').onclick=async()=>{
      const v=n=>d.querySelector('[name="'+n+'"]').value,er=d.querySelector('.pls-erro');er.hidden=true;
      const dados={freteiro_id:v('freteiro_id'),data:v('data'),origem:v('origem'),destino:v('destino'),motivo:v('motivo'),observacao:v('observacao'),
        valor:Number(String(v('valor')).replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.'))||0};
      try{const c=await ctx();await rpc('logistica_frete_avulso_salvar',{p_empresa:c.empresa_id,p_id:x?x.id:null,p_dados:dados});d.close();carregar('frete');}
      catch(e){er.textContent=e.message;er.hidden=false;}
    };
  }
  function cancelarAvulso(id){
    if(!podeEditar())return;
    const d=dialogo('<header><h2>Cancelar solicitação interna</h2><button type="button" data-fechar aria-label="Fechar">×</button></header><label>Motivo do cancelamento<input type="text" name="motivo" maxlength="300"></label><p class="pls-erro" hidden></p><div class="pla-dlg-acoes"><button type="button" class="pla-sec" data-voltar>Voltar</button><button type="button" class="pla-novo is-perigo" data-ok>Cancelar frete</button></div>');
    d.querySelector('[data-ok]').onclick=async()=>{const er=d.querySelector('.pls-erro');try{const c=await ctx();await rpc('logistica_frete_avulso_cancelar',{p_empresa:c.empresa_id,p_id:id,p_motivo:d.querySelector('[name=motivo]').value});d.close();carregar('frete');}catch(e){er.textContent=e.message;er.hidden=false;}};
  }

  async function formUberInterna(){
    if(!podeEditar())return;
    let motoristas;
    try{const c=await ctx();motoristas=await rpc('logistica_uber_solicitacoes_motoristas',{p_empresa:c.empresa_id});}
    catch(e){dialogo('<header><h2>Solicitação interna de Uber</h2><button type="button" data-fechar>×</button></header><p class="pls-erro">'+esc(e.message)+'</p>');return;}
    const d=dialogo('<form><header><h2>Nova solicitação interna de Uber</h2><button type="button" data-fechar aria-label="Fechar">×</button></header>'+
      '<label>Motorista<select name="motorista_id" required><option value="">Escolha o motorista</option>'+(motoristas||[]).map(m=>'<option value="'+esc(m.id)+'">'+esc(m.nome)+'</option>').join('')+'</select></label>'+
      '<label>Data<input type="date" name="data" value="'+hojeISO()+'" required></label><label>Horário<input type="time" name="hora" required></label>'+
      '<label>De onde sai<input name="origem" maxlength="300" minlength="2" required></label><label>Para onde vai<input name="destino" maxlength="300" minlength="2" required></label>'+
      '<label>Motivo<input name="motivo" maxlength="300" minlength="3" required></label><label>Distância do trecho (km)<input name="km" type="number" min="0.1" step="0.1" required></label>'+
      '<label class="pla-check"><input name="ida_volta" type="checkbox"> Ida e volta</label><label>Observação (opcional)<input name="observacao" maxlength="1000"></label>'+
      '<p class="pla-dlg-sub">O valor segue as faixas de km configuradas para o Uber. A solicitação aparece no app do motorista escolhido.</p><p class="pls-erro" hidden></p>'+
      '<div class="pla-dlg-acoes"><button type="button" class="pla-sec" data-voltar>Cancelar</button><button type="submit" class="pla-novo">Disponibilizar ao motorista</button></div></form>');
    d.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,btn=form.querySelector('[type=submit]'),erro=form.querySelector('.pls-erro');btn.disabled=true;erro.hidden=true;
      const dados=Object.fromEntries(new FormData(form));dados.ida_volta=form.elements.ida_volta.checked;
      try{const c=await ctx();await rpc('logistica_uber_solicitacao_salvar',{p_empresa:c.empresa_id,p_dados:dados});d.close();await carregar('uber');}
      catch(ex){erro.textContent=ex.message;erro.hidden=false;btn.disabled=false;}
    };
  }
  async function cancelarUberInterna(id){
    if(!podeEditar()||!confirm('Cancelar esta solicitação interna de Uber?'))return;
    try{const c=await ctx();await rpc('uber_vaga_cancelar',{p_empresa:c.empresa_id,p_vaga:id});await carregar('uber');}
    catch(e){dialogo('<header><h2>Solicitação interna de Uber</h2><button type="button" data-fechar>×</button></header><p class="pls-erro">'+esc(e.message)+'</p>');}
  }


  function grupoHtml(tipo,g){
    let vagas=0,conf=0,total=0;
    for(const s of g.servicos){const q=tipo==='frete'&&(s.linhas||[]).length?(s.linhas||[]).filter(l=>l.tipo_linha!=='extra').length:Math.max(Number(s.quantidade||0),(s.linhas||[]).length);vagas+=q;const c=(s.linhas||[]).filter(l=>l.confirmado&&l.tipo_linha!=='extra');conf+=c.length;
      total+=tipo==='frete'?(s.linhas||[]).reduce((a,l)=>a+Number(l.conferencia?.valor_final??((l.cobranca?.pagar_id||l.cobranca?.decisao_em)?l.cobranca?.valor_final:0)??0),0):c.length?c.reduce((a,l)=>a+Number(l.valor??s.valor??0),0):0;}
    const ok=vagas>0&&conf>=vagas;
    const cab='<header class="pla-cab">'+
      (g.pedido?'<button type="button" class="pla-pedido" data-abrir-pedido="'+esc(g.pedido_id)+'" title="Abrir o pedido">'+esc(g.pedido)+'</button>':'<span class="pla-pedido is-sem">'+(g.solicitacao_interna?'Solicitação interna':tipo==='uber'?'Vínculo pendente':'Sem pedido')+'</span>')+
      (g.solicitacao_interna?'':foto(g.cliente_foto,g.cliente,'is-cliente'))+
      '<div class="pla-cli"><strong>'+esc(g.cliente||(g.solicitacao_interna?g.solicitacao_motivo||'Solicitação interna':'Sem cliente'))+'</strong><small>'+esc(g.local||'')+'</small></div>'+
      '<span class="pla-chip '+(ok?'is-ok':'is-pend')+'">'+conf+' de '+vagas+' confirmado'+(vagas===1?'':'s')+'</span>'+
      '<span class="pla-total">'+(tipo==='frete'?'Total final':'Total')+' <b>'+brl(total)+'</b></span>'+(tipo==='frete'&&g.servicos[0]?.avulso_id&&podeEditar()?'<button type="button" class="pla-link" data-avulso-editar="'+esc(g.servicos[0].avulso_id)+'">Editar solicitação</button><button type="button" class="pla-link is-perigo" data-avulso-cancelar="'+esc(g.servicos[0].avulso_id)+'">Cancelar</button>':'')+(tipo==='uber'&&g.solicitacao_interna&&podeEditar()&&g.servicos[0]?.ativo?'<button type="button" class="pla-link is-perigo" data-uber-interna-cancelar="'+esc(g.servicos[0].id)+'">Cancelar solicitação</button>':'')+'</header>';
    const linhas=g.servicos.map(s=>servicoHtml(tipo,s)).join('');
    if(tipo==='frete')return '<section class="pla-grupo">'+cab+'<div class="pla-tabela-caixa"><table class="pla-tabela pla-tabela-frete"><colgroup><col style="width:11%"><col style="width:18%"><col style="width:9%"><col style="width:20%"><col style="width:15%"><col style="width:9%"><col style="width:9%"><col style="width:9%"></colgroup><thead><tr><th>Etapa e horário</th><th>Programado</th><th>Confirmou</th><th>Carregamento</th><th>Decisão do caminhão</th><th class="pla-num">Valor sistema</th><th class="pla-num">Valor fornecedor</th><th class="pla-num">Valor final</th></tr></thead><tbody>'+linhas+'</tbody></table></div></section>';
    return '<section class="pla-grupo">'+cab+'<div class="pla-tabela-caixa"><table class="pla-tabela"><colgroup><col style="width:11%"><col style="width:19%"><col style="width:12%"><col style="width:9%"><col style="width:8%"><col style="width:9%"><col style="width:7%"><col style="width:15%"><col style="width:10%"></colgroup><thead><tr><th>Etapa e horário</th><th>'+QUEM[tipo]+'</th><th>Confirmou</th><th>QR Code</th><th>Check-in</th><th>Check-out</th><th>Duração</th><th>Local do check-in</th><th class="pla-num">Valor</th></tr></thead><tbody>'+linhas+'</tbody></table></div></section>';
  }

  function servicoHtml(tipo,s){
    const pessoas=s.linhas||[],q=Math.max(Number(s.quantidade||0),pessoas.length),abertas=Math.max(0,q-pessoas.filter(l=>l.confirmado).length-pessoas.filter(l=>!l.confirmado).length);
    const rows=pessoas.map(l=>({l})).concat(Array.from({length:abertas},()=>({aberta:true})));
    if(!rows.length)rows.push({aberta:true});
    const etapa='<td class="pla-etapa" rowspan="'+rows.length+'"><strong>'+esc(s.etapa||NOMES[tipo])+'</strong><small>'+esc(diaCurto(s.data))+(s.hora?' · '+esc(String(s.hora).slice(0,5)):'')+'</small>'+(s.ponto?'<small class="pla-ponto">'+esc(s.ponto)+'</small>':'')+'</td>';
    return rows.map((r,i)=>(r.aberta?abertaHtml(s,tipo):linhaHtml(tipo,s,r.l)).replace('<tr','<tr'+(i===0?' data-primeira="1"':'')).replace('<!--etapa-->',i===0?etapa:'')).join('');
  }

  function abertaHtml(s,tipo){
    if(tipo==='frete')return '<tr class="pla-aberta"><!--etapa--><td><div class="pla-pessoa"><span class="pla-foto pla-ini is-vazia">?</span><div><strong>Vaga em aberto</strong><small>Ninguém aceitou ainda</small></div></div></td><td><span class="pla-tag is-amarelo">Aguardando</span></td><td>—</td><td>—</td><td class="pla-num">'+brl(s.valor)+'</td><td class="pla-num">—</td><td class="pla-num">—</td></tr>';
    return '<tr class="pla-aberta"><!--etapa--><td><div class="pla-pessoa"><span class="pla-foto pla-ini is-vazia">?</span><div><strong>Vaga em aberto</strong><small>Ninguém aceitou ainda</small></div></div></td><td><span class="pla-tag is-amarelo">Aguardando</span></td><td class="pla-traco">—</td><td class="pla-traco">—</td><td class="pla-traco">—</td><td class="pla-traco">—</td><td class="pla-traco">—</td><td class="pla-num pla-traco">'+brl(s.valor)+'</td></tr>';
  }

  function passou(s){const hoje=hojeISO();if(s.data<hoje)return true;if(s.data>hoje||!s.hora)return false;const [H,M]=String(s.hora).split(':').map(Number);const agora=new Date(new Date().toLocaleString('en-US',{timeZone:'America/Sao_Paulo'}));return agora.getHours()*60+agora.getMinutes()>H*60+M+60;}

  function linhaHtml(tipo,s,l){
    const pessoa='<div class="pla-pessoa">'+foto(l.foto,l.nome)+'<div><strong>'+esc(l.nome)+'</strong>'+(l.detalhe?'<small>'+esc(/^Escalado/.test(l.detalhe)?'Escalado no Painel':l.detalhe)+'</small>':'')+'</div></div>';
    if(tipo==='frete')return linhaFreteHtml(s,l,pessoa);
    if(l.situacao==='escalado'){const x='<span class="pla-traco">—</span>';return '<tr><!--etapa--><td>'+pessoa+'</td><td><span class="pla-tag is-cinza">Escalado</span><small>Transportadora</small></td><td><span class="pla-traco" title="Caminhão de transportadora não usa o app">Sem app</span></td><td>'+x+'</td><td>'+x+'</td><td>'+x+'</td><td>'+x+'</td><td class="pla-num">'+x+'</td></tr>';}
    const confirmou=l.confirmado?'<span class="pla-tag is-verde">Confirmou</span>'+(l.confirmado_em?'<small>'+esc(hora(l.confirmado_em))+'</small>':''):l.situacao==='nao_publicado'?'<span class="pla-tag is-cinza">Não publicado</span><small>Vaga ainda não enviada ao app</small>':'<span class="pla-tag is-amarelo">Aguardando</span><small>Falta aceitar no app</small>';
    const lido=!!l.checkin,podeQr=s.ativo&&!l.checkout&&s.data>=somar(hojeISO(),-1);
    const qr='<span class="pla-tag '+(lido?'is-verde':'is-cinza')+'">'+(lido?'Lido':'Não lido')+'</span>'+(podeQr?'<button type="button" class="pla-btn-qr" data-qr="'+esc(s.id)+'" data-titulo="'+esc((s.etapa||'')+' · '+(s.solicitacao_interna?'Solicitação interna':'Pedido '+(s.pedido||''))+' · '+l.nome)+'" title="Abrir o QR">▦ Abrir QR</button>':'');
    let ci,co,dur='<span class="pla-traco">—</span>';
    if(l.checkin)ci='<b>'+esc(soHora(l.checkin))+'</b><small>'+esc(hora(l.checkin).slice(0,5))+'</small>';
    else ci=l.confirmado&&passou(s)?'<span class="pla-tag is-vermelho">Sem check-in</span>':'<span class="pla-traco">—</span>';
    if(l.checkout)co='<b>'+esc(soHora(l.checkout))+'</b><small>'+esc(hora(l.checkout).slice(0,5))+'</small>';
    else if(l.checkin)co=s.data<hojeISO()?'<span class="pla-tag is-vermelho">Sem check-out</span>':'<span class="pla-tag is-amarelo">Em andamento</span>';
    else co='<span class="pla-traco">—</span>';
    if(l.checkin&&l.checkout){const min=Math.max(0,Math.round((new Date(l.checkout)-new Date(l.checkin))/60000));dur='<b>'+Math.floor(min/60)+'h'+String(min%60).padStart(2,'0')+'</b>';}
    else if(l.checkin&&!l.checkout&&s.data>=hojeISO()){const min=Math.max(0,Math.round((Date.now()-new Date(l.checkin))/60000));dur='<small>há '+Math.floor(min/60)+'h'+String(min%60).padStart(2,'0')+'</small>';}
    let local='<span class="pla-traco">—</span>';
    if(l.manual)local='<span class="pla-tag is-cinza">Lançado à mão</span><small>'+esc(l.manual)+'</small>';
    else if(l.lat!=null&&l.lng!=null){
      const d=l.distancia!=null?Number(l.distancia):null,perto=d!=null&&d<=1000;
      local=(d==null?'<span class="pla-tag is-cinza">Localização registrada</span>':'<span class="pla-tag '+(perto?'is-verde':'is-vermelho')+'">'+(perto?'No local · '+Math.round(d)+' m':'A '+(d/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+' km')+'</span>'+(perto?'':'<small>'+esc(l.referencia||'')+'</small>'))+
        '<button type="button" class="pla-link" data-mapa="'+esc(l.lat+','+l.lng)+'" data-titulo="'+esc(l.nome+' · check-in')+'">ver no mapa</button>';
    }else if(l.checkin)local='<span class="pla-tag is-cinza">Sem localização</span>';
    const valor=l.confirmado?brl(l.valor??s.valor):brl(s.valor);
    return '<tr><!--etapa--><td>'+pessoa+'</td><td>'+confirmou+'</td><td>'+qr+'</td><td>'+ci+'</td><td>'+co+'</td><td>'+dur+'</td><td>'+local+'</td><td class="pla-num"><b>'+valor+'</b></td></tr>';
  }

  function linhaFreteHtml(s,l,pessoa){
    if(l.tipo_linha==='extra')pessoa='<span class="pla-tag is-amarelo">Frete extra</span><small>Não previsto na programação</small>';
    const confirmou=l.tipo_linha==='extra'?'<span class="pla-traco">Não programado</span>':l.situacao==='cobrado'?'<span class="pla-tag is-cinza">Cobrança extra</span>':l.situacao==='escalado'?'<span class="pla-tag is-cinza">Escalado</span>':l.confirmado?'<span class="pla-tag is-verde">Confirmou</span>'+(l.confirmado_em?'<small>'+esc(hora(l.confirmado_em))+'</small>':''):'<span class="pla-tag is-amarelo">Aguardando</span><small>Falta aceitar no app</small>';
    const cargas=l.carregamentos||[],dec=l.conferencia,cob=l.cobranca;
    const carga=s.direcao==='coleta'||s.avulso_id?'<span class="pla-traco">Não se aplica</span>':cargas.length?(l.tipo_linha==='substituicao'?'<span class="pla-tag is-amarelo pla-substituicao">Substituindo o programado</span>':'')+cargas.map(c=>'<div class="pla-carga">'+caminhaoHtml(c)+'<small>'+esc(hora(c.em))+(c.expedidor?' · '+esc(c.expedidor):'')+'</small></div>').join(''):'<span class="pla-tag is-cinza">Sem registro</span>';
    const escolhido=dec?.caminhao_id?dec.caminhao||[l.programado,...cargas].find(c=>c?.id===dec.caminhao_id):null;
    const encerrado=!!cob?.pagar_id||['ok','aceito','corrigido','recusado'].includes(cob?.situacao)&&!!cob?.decisao_em&&!dec;
    const botao=podeEditar()&&l.chave&&!encerrado?'<button type="button" class="pla-link" data-frete-conferir="'+esc(l.chave)+'">'+(dec?'Revisar decisão':'Conferir frete')+'</button>':'';
    const decisao=(dec?(escolhido?caminhaoHtml(escolhido):'<span class="pla-tag is-verde">'+(dec.valor_final===0?'Recusado':'Conferido')+'</span>')+'<small>'+esc(dec.decidido_nome)+' · '+esc(hora(dec.decidido_em))+'</small><small class="pla-motivo">'+esc(dec.motivo)+'</small>':encerrado?'<span class="pla-tag is-cinza">Conferência anterior</span>':'<span class="pla-tag is-amarelo">A decidir</span>')+botao;
    const enviado=cob?.enviado?brl(cob.valor):'—';
    const final=dec?.valor_final??(encerrado?cob?.valor_final:null);
    return '<tr><!--etapa--><td>'+pessoa+'</td><td>'+confirmou+'</td><td>'+carga+'</td><td>'+decisao+'</td><td class="pla-num"><b>'+brl(l.valor_sistema??s.valor)+'</b></td><td class="pla-num"><b>'+enviado+'</b>'+(cob?'<small class="pla-valor-nota">'+esc(cob.fornecedor)+'</small><small class="pla-valor-nota">'+(cob.enviado?cob.origem_lanc==='sistema'?'Não lançado pelo fornecedor':'Enviado':'Rascunho · não enviado')+'</small>':'<small>Aguardando envio</small>')+'</td><td class="pla-num"><b>'+brl(final)+'</b>'+(cob?.pagar_id?'<small>No Financeiro</small>':'')+'</td></tr>';
  }

  function caminhaoHtml(c){
    return '<div class="pla-pessoa pla-caminhao">'+foto(c.foto,c.transportadora||c.codigo)+'<div><strong>'+esc(c.transportadora||'Transportadora não informada')+'</strong><small>'+esc(c.nome||[c.codigo,c.modelo,c.placa].filter(Boolean).join(' · '))+'</small></div></div>';
  }
  function conferirFrete(chave){
    if(!podeEditar())return;
    let s,l;for(const servico of estados.frete.lista){const linha=(servico.linhas||[]).find(x=>x.chave===chave);if(linha){s=servico;l=linha;break;}}
    if(!l)return;
    const dec=l.conferencia,caminhoes=[...new Map([l.programado,...(l.carregamentos_opcoes||l.carregamentos||[])].filter(Boolean).map(c=>[c.id,c])).values()];
    const cobrancas=(l.cobrancas||[]).filter(c=>c.enviado),selecionado=dec?.caminhao_id||l.programado?.id||(caminhoes.length===1?caminhoes[0].id:'');
    const d=dialogo('<form><header><h2>Conferir frete</h2><button type="button" data-fechar aria-label="Fechar">×</button></header><p class="pla-dlg-sub">'+esc(s.pedido?'Pedido '+s.pedido:s.solicitacao_motivo||s.etapa)+' · '+esc(diaCurto(s.data))+'</p>'+
      '<label>Qual caminhão vale?<select name="caminhao"><option value="">'+(s.avulso_id?'Solicitação interna':'Escolha o caminhão')+'</option>'+caminhoes.map(c=>'<option value="'+esc(c.id)+'"'+(c.id===selecionado?' selected':'')+'>'+esc((c.id===l.programado?.id?'Programado':'Expedição')+' · '+c.transportadora+' · '+c.nome)+'</option>').join('')+'</select></label>'+
      '<label>Cobrança enviada pelo fornecedor<select name="lancamento"><option value="">Aguardar envio · salvar só o caminhão</option>'+cobrancas.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.fornecedor+' · '+(c.caminhao||'Caminhão não informado')+' · '+(c.valor==null?'Não lançado':brl(c.valor)))+'</option>').join('')+'</select></label><p class="pla-dlg-sub">Para aprovar um valor, a cobrança deve ser do fornecedor do caminhão escolhido.</p>'+
      '<div class="pla-valores-conferencia"><span>Sistema<b>'+brl(l.valor_sistema??s.valor)+'</b></span><span>Fornecedor<b data-valor-enviado>—</b></span></div>'+
      '<label>Valor final (R$)<input type="number" name="valor" min="0" step="0.01" placeholder="Informe o valor aprovado"></label><p class="pla-dlg-sub">Use 0 para recusar a cobrança. O valor enviado pelo fornecedor fica preservado.</p>'+
      '<label>Motivo da decisão<textarea name="motivo" rows="3" minlength="3" maxlength="2000" required></textarea></label><p class="pls-erro" role="alert" hidden></p><div class="pla-dlg-acoes"><button type="button" class="pla-sec" data-voltar>Cancelar</button><button type="submit" class="pla-novo">Salvar decisão</button></div></form>');
    const form=d.querySelector('form'),cam=form.elements.caminhao,cob=form.elements.lancamento,valor=form.elements.valor;
    function atualizar(){
      const c=cobrancas.find(x=>x.id===cob.value);d.querySelector('[data-valor-enviado]').textContent=brl(c?.valor);
      valor.disabled=!c;valor.required=!!c;if(!c)valor.value='';
    }
    cob.value=dec?.lancamento_id||dec?.viagem_id||l.cobranca?.id||'';atualizar();
    if(dec?.valor_final!=null&&!valor.disabled)valor.value=dec.valor_final;
    form.elements.motivo.value=dec?.motivo||'';
    cam.onchange=atualizar;cob.onchange=()=>{valor.value='';atualizar();};
    let salvando=false;d.oncancel=e=>{if(salvando)e.preventDefault();};
    form.onsubmit=async e=>{
      e.preventDefault();if(salvando)return;salvando=true;const erro=d.querySelector('.pls-erro'),btn=form.querySelector('[type=submit]');erro.hidden=true;btn.disabled=true;
      try{const c=await ctx();await rpc('logistica_frete_conferir',{p_empresa:c.empresa_id,p_chave:chave,p_data:s.data,p_versao:l.versao,p_caminhao:cam.value||null,p_lancamento:cob.value||null,p_valor:valor.disabled?null:Number(valor.value),p_motivo:form.elements.motivo.value.trim()});d.close();await carregar('frete');}
      catch(ex){erro.textContent=ex.message;erro.hidden=false;}
      finally{salvando=false;btn.disabled=false;}
    };
  }

  /* QR na tela (mesmo código de 6 números dos apps; troca a cada minuto). */
  function carregarLibQr(){if(window.QRCode)return Promise.resolve();return new Promise((ok,falha)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';s.onload=ok;s.onerror=()=>falha(Error('Não foi possível carregar o gerador de QR.'));document.head.append(s);});}
  async function abrirQr(tipo,id,titulo){
    if(tipo==='frete')return;
    const d=document.createElement('dialog');d.className='pla-dialogo';let timer;
    d.innerHTML='<header><h2>QR Code</h2><button type="button" data-fechar aria-label="Fechar">×</button></header><p class="pla-dlg-sub">'+esc(titulo||'')+'</p><div class="pla-qr-img"></div><div class="pla-qr-cod"></div><p class="pla-dlg-sub">Ler com o celular no check-in e no check-out. O código muda a cada minuto.</p><p class="pls-erro" hidden></p>';
    document.body.append(d);d.querySelector('[data-fechar]').onclick=()=>d.close();d.onclose=()=>{clearTimeout(timer);d.remove();};d.addEventListener('click',e=>{if(e.target===d)d.close();});
    d.showModal();
    const atualizar=async()=>{
      try{
        await carregarLibQr();const c=await ctx(),r=await rpc('logistica_anunciado_qr',{p_empresa:c.empresa_id,p_tipo:tipo,p_id:id});
        if(!d.open)return;const url=new URL(APP[tipo]+encodeURIComponent(id+'.'+r.codigo),location.href).href,caixa=d.querySelector('.pla-qr-img');
        caixa.innerHTML='';new QRCode(caixa,{text:url,width:280,height:280,colorDark:'#1f2020',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
        d.querySelector('.pla-qr-cod').textContent=r.codigo;timer=setTimeout(atualizar,Math.max(2000,Number(r.trocaEm)||60000)+300);
      }catch(e){const er=d.querySelector('.pls-erro');er.textContent=e.message;er.hidden=false;}
    };
    atualizar();
  }
  function abrirMapa(coord,titulo){
    const d=document.createElement('dialog');d.className='pla-dialogo pla-mapa';
    d.innerHTML='<header><h2>'+esc(titulo||'Local do check-in')+'</h2><button type="button" data-fechar aria-label="Fechar">×</button></header><iframe title="Mapa" loading="lazy" src="https://maps.google.com/maps?q='+encodeURIComponent(coord)+'&z=17&t=k&output=embed"></iframe><a href="https://www.google.com/maps?q='+encodeURIComponent(coord)+'" target="_blank" rel="noopener">Abrir no Google Maps ↗</a>';
    document.body.append(d);d.querySelector('[data-fechar]').onclick=()=>d.close();d.onclose=()=>d.remove();d.addEventListener('click',e=>{if(e.target===d)d.close();});d.showModal();
  }

  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ativo&&!document.getElementById(HOST[ativo])?.hidden)carregar(ativo);});
  setInterval(()=>{if(ativo&&!document.hidden&&!document.querySelector('dialog[open]')&&!document.getElementById(HOST[ativo])?.hidden)carregar(ativo);},60000);
  window.PainelAnunciados={async abrir(tipo){ativo=tipo;preparar(tipo);await carregar(tipo);}};
})();
