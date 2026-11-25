/* A escala em tabela usa as mesmas classes do cronograma, com consulta por blocos nos dois sentidos. */
(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let ctx,root,tabela,antes,depois,posicionado=false,ajustando=false,carregando=false,direcao=null,ultimoY=scrollY,procurar=null,edicao=null;
 const solicitada=new URLSearchParams(location.search).get('dia');if(/^\d{4}-\d{2}-\d{2}$/.test(solicitada||''))procurar=solicitada;
 const data=v=>new Date(v+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
 function confirmacaoComercialHtml(e){
  const c=e.confirmacao_comercial;if(!c)return '';
  const textos={confirmado:'Confirmado pelo Comercial',pendente:'Aguardando Comercial',alterado:'Reconfirmar com Comercial',indisponivel:'Confirmação indisponível'};
  if(!textos[c.status])return '';
  const detalhes={confirmado:'As datas atuais foram confirmadas pelo Comercial.',pendente:'O Comercial ainda não confirmou as datas deste pedido.',alterado:'As datas do pedido ou desta etapa mudaram após a confirmação. É necessário confirmar novamente.',indisponivel:'Não foi possível consultar a confirmação de datas do Comercial.'};
  const quando=c.em?new Date(c.em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'';
  return '<span class="pl-crono-confirmacao" data-confirmacao-comercial="'+c.status+'" title="'+esc([detalhes[c.status],c.por?'Registrado por '+c.por:'',quando].filter(Boolean).join(' · '))+'"><span aria-hidden="true">'+(c.status==='confirmado'?'✓':c.status==='indisponivel'?'—':'◷')+'</span>'+textos[c.status]+'</span>';
 }
 const iniciais=v=>String(v||'?').split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase();
 function pessoa(nome,foto,cliente=false,acao=null){
  if(!nome)return '—';
  const avatar='<span class="crono-tabela-avatar" '+(cliente?'data-decorador-foto':'')+'><span aria-hidden="true">'+esc(iniciais(nome))+'</span>'+(/^https?:\/\//i.test(foto||'')?'<img src="'+esc(foto)+'" alt="" loading="lazy">':'')+'</span>';
  return '<span class="crono-tabela-pessoa">'+(acao?gatilho(acao.e,acao.papel,nome,avatar,true):avatar)+'<span>'+esc(nome)+'</span></span>';
 }
 const iconeVaga='<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="15" r="9"/><path d="M8 44v-7a16 16 0 0 1 32 0v7"/></svg>';
 function vaga(rotulo,acao=null){const avatar='<span class="pl-vaga-avatar">'+iconeVaga+'</span>';return '<span class="pl-inline-vaga">'+(acao?gatilho(acao.e,acao.papel,'',avatar,true):avatar)+'<span>'+esc(rotulo||'Vaga aberta')+'</span></span>';}
 const iconeEditar='<span class="pl-inline-lapis" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg></span>';
 function gatilho(e,papel,nome,conteudo,foto=false){
  const rotulo=nome?'Trocar '+nome:papel==='cam'?'Escolher caminhão':papel==='resp'?'Escolher responsável':'Preencher vaga da equipe';
  return '<button type="button" class="pl-inline-escolher'+(foto?' pl-inline-foto':'')+'" data-abrir-escolha="'+papel+'" data-substituir="'+esc(nome||'')+'" aria-haspopup="dialog" aria-expanded="'+String(edicao?.id===e.id&&edicao.papel===papel&&edicao.substituir===(nome||''))+'" aria-label="'+esc(rotulo)+'" title="'+esc(rotulo)+'">'+conteudo+(foto?iconeEditar:'')+'</button>';
 }

 function membro(e,nome,papel){
  const info=ctx.pessoa(nome),acao=ctx.podeEditar(e)?{e,papel}:null;
  const motivo=nome&&ctx.impedimento?.(e,nome);
  return (nome?pessoa(nome,info?.foto_url||info?.fotoUrl||info?.miniatura,false,acao):vaga(papel==='resp'?'Responsável em aberto':'Vaga aberta',acao))+(motivo?'<small class="pl-rh-aviso">'+esc(motivo)+' · substituir pessoa</small>':'');
 }
 function equipeHtml(e){
  const nomes=e.equipe||[],faltam=Math.max(0,(Number(e.sugerido)||1)-1-nomes.length);
  return '<div class="pl-inline-equipe">'+nomes.map(n=>membro(e,n,'equipe')).join('')+Array.from({length:faltam},()=>membro(e,'','equipe')).join('')+(ctx.podeEditar(e)&&!faltam?gatilho(e,'equipe','','<span class="pl-inline-adicionar">+ Pessoa</span>'):'')+'</div>';
 }
 function caminhoesHtml(e){
  const editavel=ctx.podeEditar(e);
  const lista=(e.caminhoes||[]).map(c=>{const cam=ctx.caminhao(c),foto=cam?.foto_url,avatar='<span class="crono-tabela-avatar"><span aria-hidden="true">'+esc(iniciais(c))+'</span>'+(/^https?:\/\//i.test(foto||'')?'<img src="'+esc(foto)+'" alt="" loading="lazy">':'')+'</span>';return '<span class="pl-crono-cam">'+(editavel?gatilho(e,'cam',c,avatar,true):avatar)+'<span>'+esc(c)+'</span></span>';}).join('');
  return lista+(editavel?gatilho(e,'cam','','<span class="pl-inline-adicionar">+ Caminhão</span>'):lista?'':'—');
 }
 const categoriasEscolha=[['responsaveis','Responsáveis'],['interna','Equipe interna'],['free','Free']];
 function filtrarEscolha(){
  const card=root.querySelector('#plEscolhaFlutuante');if(!card||!edicao)return;
  const normalizar=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const termos=normalizar(edicao.busca||'').trim().split(/\s+/).filter(Boolean);let qtd=0;
  card.querySelectorAll('[data-busca]').forEach(el=>{el.hidden=(edicao.papel==='equipe'&&el.dataset.categoria!==edicao.categoria)||!termos.every(t=>normalizar(el.dataset.busca).includes(t));if(!el.hidden)qtd++;});
  card.querySelectorAll('[data-categoria-escolha]').forEach(aba=>{const ativa=aba.dataset.categoriaEscolha===edicao.categoria;aba.setAttribute('aria-selected',String(ativa));aba.tabIndex=ativa?0:-1;});
  const grade=card.querySelector('.pl-escolha-grade');
  if(edicao.papel==='equipe')grade.setAttribute('aria-labelledby','plEscolhaAba-'+edicao.categoria);
  card.querySelector('.pl-escolha-vazia').hidden=qtd>0;
 }
 function trocarCategoria(categoria){
  if(!edicao||edicao.papel!=='equipe'||!categoriasEscolha.some(([id])=>id===categoria))return;
  edicao.categoria=categoria;filtrarEscolha();root.querySelector('.pl-escolha-grade').scrollTop=0;
 }
 function escolhaHtml(e){
  const papel=edicao.papel,sub=edicao.substituir,opcoes=ctx.opcoes(e,papel),titulo=papel==='resp'?'Escolher responsável':papel==='cam'?'Escolher caminhão':'Escolher pessoa da equipe';
  const abas=papel==='equipe'?'<nav class="pl-escolha-abas" role="tablist" aria-label="Categorias de pessoas">'+categoriasEscolha.map(([id,nome])=>'<button type="button" role="tab" id="plEscolhaAba-'+id+'" data-categoria-escolha="'+id+'" aria-controls="plEscolhaGrade" aria-selected="'+(edicao.categoria===id)+'" tabindex="'+(edicao.categoria===id?'0':'-1')+'">'+nome+'</button>').join('')+'</nav>':'';
  const cards=opcoes.map(p=>'<button type="button" class="pl-escolha-card"'+(p.impedimento?' disabled aria-disabled="true"':'')+' data-escolher-recurso data-categoria="'+esc(p.categoria)+'" data-papel="'+papel+'" data-substituir="'+esc(sub)+'" data-valor="'+esc(p.valor)+'" data-busca="'+esc([p.nome,p.detalhe,p.impedimento,...(p.alocacoes||[]).map(a=>[a.pedido,a.etapa,a.local,a.cliente,a.hora].join(' '))].join(' '))+'"><span class="pl-escolha-foto"><span aria-hidden="true">'+esc(iniciais(p.nome))+'</span>'+(/^https?:\/\//i.test(p.foto)?'<img src="'+esc(p.foto)+'" alt="" loading="lazy">':'')+'</span><strong>'+esc(p.nome)+'</strong><span class="pl-escolha-detalhe">'+esc(p.detalhe)+'</span>'+(p.vinculo?'<span class="pl-escolha-vinculo '+(p.vinculo==='Próprio'?'is-proprio':'is-terceiro')+'">'+esc(p.vinculo)+'</span>':'')+'<small class="'+(p.impedimento?'pl-rh-aviso':p.ocupado?'is-alocado':'is-livre')+'">'+esc(p.impedimento||(p.ocupado?'Alocado neste dia':'Livre no dia'))+'</small>'+((p.alocacoes||[]).length?'<span class="pl-escolha-escalas">'+p.alocacoes.map(a=>'<span class="pl-escolha-alocacao"><b>'+esc(a.pedido?'Pedido '+a.pedido:'Escala sem pedido')+' · '+esc(a.hora)+'</b><span>'+esc([a.etapa,a.local].filter(Boolean).join(' · '))+'</span>'+(a.cliente&&a.cliente!==a.local?'<span>'+esc(a.cliente)+'</span>':'')+'</span>').join('')+'</span>':'')+'</button>').join('');
  return '<dialog id="plEscolhaFlutuante" class="pl-escolha-painel pl-escolha-flutuante" data-edicao-id="'+esc(e.id)+'" aria-modal="true" aria-label="'+titulo+'"><header><input type="search" data-buscar-escolha value="'+esc(edicao.busca||'')+'" placeholder="'+(papel==='cam'?'Código ou modelo...':'Buscar pessoa...')+'" aria-label="Pesquisar opções" autocomplete="off"><button type="button" data-fechar-escolha aria-label="Fechar escolha">×</button></header>'+abas+'<div id="plEscolhaGrade" class="pl-escolha-grade"'+(papel==='equipe'?' role="tabpanel" aria-labelledby="plEscolhaAba-'+edicao.categoria+'"':'')+'>'+cards+'</div><p class="pl-escolha-vazia" role="status" '+(opcoes.length?'hidden':'')+'>Nenhuma opção encontrada.</p><footer><span>Alocações no dia aparecem sinalizadas. O horário é conferido ao salvar.</span>'+(sub?'<button type="button" data-acao="tirar" data-papel="'+papel+'" data-nome="'+esc(sub)+'">Remover '+esc(sub)+'</button>':'')+'</footer></dialog>';
 }
 function marcarEscolha(){root.querySelectorAll('[data-abrir-escolha]').forEach(b=>b.setAttribute('aria-expanded',String(b.closest('[data-etapa-id]').dataset.etapaId===edicao?.id&&b.dataset.abrirEscolha===edicao?.papel&&b.dataset.substituir===edicao?.substituir)));}
 function fecharEscolha(focar=false){
  const anterior=edicao;edicao=null;root?.querySelector('#plEscolhaFlutuante')?.remove();if(!root)return;marcarEscolha();
  if(focar&&anterior){const row=root.querySelector('[data-etapa-id="'+CSS.escape(anterior.id)+'"]'),botao=[...(row?.querySelectorAll('[data-abrir-escolha]')||[])].find(b=>b.dataset.abrirEscolha===anterior.papel&&b.dataset.substituir===anterior.substituir);(botao||row)?.focus({preventScroll:true});}
 }
 function posicionarEscolha(){
  const card=root.querySelector('#plEscolhaFlutuante');if(!edicao||!card)return;
  const row=root.querySelector('[data-etapa-id="'+CSS.escape(edicao.id)+'"]');if(!row||!ctx.podeEditar(ctx.etapas.find(e=>e.id===edicao.id))){fecharEscolha();return;}
  card.style.setProperty('--pl-escolha-max-altura',Math.max(160,Math.min(640,innerHeight-32))+'px');
 }
 function desenharEscolha(){
  root.querySelector('#plEscolhaFlutuante')?.remove();const e=edicao&&ctx.etapas.find(e=>e.id===edicao.id);if(!e||!ctx.podeEditar(e)){edicao=null;marcarEscolha();return;}
  root.querySelector('#cronogramaTabela').insertAdjacentHTML('beforeend',escolhaHtml(e));marcarEscolha();posicionarEscolha();
  const card=root.querySelector('#plEscolhaFlutuante');let iniciouFora=false;const fora=ev=>{const r=card.getBoundingClientRect();return ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom;};card.addEventListener('pointerdown',ev=>{iniciouFora=ev.target===card&&fora(ev);});card.addEventListener('click',ev=>{if(iniciouFora&&ev.target===card&&fora(ev))fecharEscolha(true);});card.addEventListener('cancel',ev=>{ev.preventDefault();fecharEscolha(true);});filtrarEscolha();card.showModal();
 }
 function resumoUber(id){const r=window.PainelUber?.resumo?.(id);return r?.quantidade?esc(r.confirmadas)+' / '+esc(r.quantidade):'—';}
 function preparar(){
  const host=document.getElementById('plDias');root=document.createElement('section');root.id='plCronogramaEquipe';root.setAttribute('aria-label','Montagens e desmontagens em cronograma');
  root.innerHTML='<button type="button" class="pl-crono-passados" data-crono-passados aria-pressed="false">Ver dias que passaram</button><button type="button" class="pl-crono-mais" data-crono-anteriores hidden>Carregar dias anteriores</button><section id="cronogramaTabela"><div class="crono-tabela-scroll"><table class="crono-tabela pl-crono-tabela"><thead><tr>'+['Data / Horário','Pedido','Cliente','Responsável','Equipe','Caminhão','Uber'].map(t=>'<th scope="col">'+t+'</th>').join('')+'</tr></thead></table></div></section><button type="button" class="pl-crono-mais" data-crono-proximos>Carregar próximas datas</button>';
  host.prepend(root);tabela=root.querySelector('table');antes=root.querySelector('[data-crono-anteriores]');depois=root.querySelector('[data-crono-proximos]');
  const topo=document.getElementById('plTopoUnificado');new ResizeObserver(()=>host.closest('.pl-page').style.setProperty('--pl-crono-top',Math.ceil(topo.getBoundingClientRect().height)+'px')).observe(topo);
  antes.onclick=()=>pedir('antes');botaoPassados=root.querySelector('[data-crono-passados]');botaoPassados.onclick=()=>mostrarPassados(!verPassados);depois.onclick=()=>pedir('depois');
  const obs=new IntersectionObserver(es=>{if(direcao&&es.some(e=>e.isIntersecting&&e.target===(direcao==='antes'?antes:depois)))conferir();},{rootMargin:'180px 0px'});obs.observe(antes);obs.observe(depois);
  new MutationObserver(()=>{if(document.getElementById('plModuloEquipe').hidden)fecharEscolha();else if(!posicionado)posicionar();}).observe(document.getElementById('plModuloEquipe'),{attributes:true,attributeFilter:['hidden']});
  root.addEventListener('click',evento=>{
   const el=evento.target;
   const aba=el.closest('[data-categoria-escolha]');if(aba){trocarCategoria(aba.dataset.categoriaEscolha);return;}
   if(el.closest('[data-escolher-recurso],[data-acao="tirar"]')){fecharEscolha();return;}
   if(el.closest('[data-fechar-escolha]')){fecharEscolha(true);return;}
   const row=el.closest('[data-etapa-id]');if(!row)return;const e=ctx.etapas.find(e=>e.id===row.dataset.etapaId);if(!e||!ctx.podeEditar(e))return;
   const botao=el.closest('[data-abrir-escolha]');if(!botao)return;
   const pessoa=ctx.pessoa(botao.dataset.substituir);
   edicao={id:e.id,papel:botao.dataset.abrirEscolha,substituir:botao.dataset.substituir||'',categoria:pessoa?.lider?'responsaveis':pessoa?.free?'free':'interna',busca:''};desenharEscolha();
  });
  root.addEventListener('input',e=>{if(!edicao||!e.target.matches('[data-buscar-escolha]'))return;edicao.busca=e.target.value;filtrarEscolha();});
  root.addEventListener('keydown',e=>{
   const aba=e.target.closest('[data-categoria-escolha]');if(!aba||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
   e.preventDefault();const abas=[...root.querySelectorAll('[data-categoria-escolha]')],i=abas.indexOf(aba);
   const proxima=abas[e.key==='Home'?0:e.key==='End'?abas.length-1:(i+(e.key==='ArrowRight'?1:-1)+abas.length)%abas.length];
   trocarCategoria(proxima.dataset.categoriaEscolha);proxima.focus();
  });
  root.addEventListener('error',e=>{if(e.target.matches('img'))e.target.remove();},true);
 }
 function visivel(){return !edicao&&root?.isConnected&&!document.getElementById('plModuloEquipe').hidden&&!document.querySelector('dialog[open]');}
 function conferir(){if(!visivel()||ajustando||carregando||!direcao)return;if(direcao==='antes'&&!verPassados)return;const r=(direcao==='antes'?antes:depois).getBoundingClientRect();if(r.bottom>=-180&&r.top<=innerHeight+180)pedir(direcao);}
 async function pedir(lado){if(!ctx||carregando||ajustando||!visivel())return;await ctx.mais(lado);}
 function ancorar(){const todos=[...root.querySelectorAll('[data-etapa-id],.crono-tabela-dia')];const el=todos.find(e=>e.getBoundingClientRect().bottom>0);return el?{chave:el.dataset.etapaId,dia:el.dataset.cronoDia,top:el.getBoundingClientRect().top}:null;}
 function posicionar(dia){
  if(!root||document.getElementById('plModuloEquipe').hidden)return;ajustando=true;posicionado=true;
  requestAnimationFrame(()=>{const grupos=[...root.querySelectorAll('.crono-tabela-dia')];const alvo=grupos.find(e=>e.dataset.cronoDia>=(dia||procurar||ctx.hoje))||grupos.at(-1);if(alvo){const topo=document.getElementById('plTopoUnificado').getBoundingClientRect().height,cabecalho=tabela.tHead.getBoundingClientRect().height;scrollBy(0,alvo.getBoundingClientRect().top-topo-cabecalho-8);}ultimoY=scrollY;requestAnimationFrame(()=>{ajustando=false;direcao=null;});});
 }
 function colunasDia(){const ths=[...(tabela.tHead?.rows[0]?.cells||[])];return ths.length?'<tr class="pl-crono-colunas" aria-hidden="true">'+ths.map(th=>'<td>'+esc(th.textContent.trim())+'</td>').join('')+'</tr>':'';}
 let verPassados=false,botaoPassados=null;
 function mostrarPassados(v){verPassados=!!v;if(!root)return;botaoPassados.setAttribute('aria-pressed',String(verPassados));botaoPassados.textContent=verPassados?'Esconder dias que passaram':'Ver dias que passaram';antes.hidden=!verPassados;pintar();if(!verPassados)posicionar(ctx.hoje);}
 function pintar(){
  const ancora=posicionado?ancorar():null,abertos=[...root.querySelectorAll("details[data-inline-key][open]")].map(el=>el.dataset.inlineKey);ajustando=true;
  const grupos=new Map();for(const e of [...ctx.etapas].sort((a,b)=>a.data.localeCompare(b.data)||String(a.hora||'99:99').localeCompare(String(b.hora||'99:99'))||String(a.pedido).localeCompare(String(b.pedido),'pt-BR',{numeric:true}))){if(!verPassados&&e.data<ctx.hoje)continue;if(!grupos.has(e.data))grupos.set(e.data,[]);grupos.get(e.data).push(e);}
  tabela.querySelectorAll('tbody').forEach(e=>e.remove());
  tabela.insertAdjacentHTML('beforeend',[...grupos].map(([dia,etapas])=>'<tbody class="'+(dia<ctx.hoje?'pl-crono-passado':dia===ctx.hoje?'pl-crono-hoje':'pl-crono-futuro')+'"><tr class="pl-crono-espaco" aria-hidden="true"><td colspan="7"></td></tr><tr class="crono-tabela-dia" data-crono-dia="'+esc(dia)+'"><th colspan="7" scope="rowgroup"><div class="crono-dia-cabecalho"><span class="pl-crono-dia-orn" aria-hidden="true"></span><span class="crono-dia-titulo">'+esc(new Date(dia+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long'}).replace(/^./,c=>c.toLocaleUpperCase('pt-BR')))+', <em>'+esc(data(dia))+'</em></span><span class="pl-crono-dia-orn" aria-hidden="true"></span></div></th></tr>'+colunasDia()+etapas.map(e=>{
   const cheio=e.planejamento_completo,avisos=[...(e.avisos||[]),...(e.conflitos||[])];
   const situacao=e.somente_consulta?'pre-reserva':e.tipo==='montagem'?'montagem':'desmontagem';
   return '<tr class="crono-tabela-linha" data-etapa-id="'+esc(e.id)+'" data-crono-situacao="'+situacao+'">'+
   '<td class="crono-tabela-data" data-col="Data">'+esc(data(dia))+'<span class="pl-crono-hora">'+esc(e.hora||'—')+'</span>'+confirmacaoComercialHtml(e)+(ctx.podeLiberar(e)?'<button type="button" class="pl-inline-adicionar" data-liberar-edicao="'+esc(e.id)+'">'+(ctx.podeEditar(e)?'Bloquear':'Liberar edição')+'</button>':'')+'</td><td data-col="Pedido"><span class="crono-tabela-pedido-tag">'+esc(String(e.pedido||'—').replace(/^#/,''))+'</span><div class="pl-crono-pedido-etapa"><span class="crono-tabela-etapa tem-progresso" style="--crono-etapa-fundo:'+(e.tipo==='montagem'?'#dbeafe':'#ede9fe')+'" title="'+esc(avisos.join(' · ')||(cheio?'Planejamento completo':'Planejamento pendente'))+'">'+esc(e.tipo==='montagem'?'Montagem':'Desmontagem')+'<span class="etapa-progresso"><span class="etapa-progresso-trilho"><span class="etapa-progresso-preenchimento" style="width:'+(cheio?'100':'0')+'%"></span></span></span></span>'+(e.somente_consulta?'<small class="pl-crono-consulta">Pré-reserva · consulta</small>':'')+'</div></td>'+
   '<td data-col="Cliente">'+pessoa(e.cliente,e.clienteFoto||e.cliente_foto,true)+'<span class="pl-crono-local" title="'+esc(e.detalhes?.endereco||e.local||'')+'">'+esc(e.detalhes?.endereco||e.local||'—')+'</span></td><td data-col="Responsável">'+membro(e,e.responsavel,'resp',0)+'</td><td data-col="Equipe">'+equipeHtml(e)+'</td><td data-col="Caminhão">'+caminhoesHtml(e)+'</td><td data-col="Uber"><details class="pl-inline-editar pl-inline-uber" data-inline-key="'+esc(e.id+'-uber')+'"><summary><span data-crono-uber="'+esc(e.id)+'">'+resumoUber(e.id)+'</span><span class="pl-inline-uber-acao">'+(ctx.podeEditar(e)?'Gerenciar':'Ver')+'</span></summary><div class="pl-etapa pl-painel'+(!ctx.podeEditar(e)?' is-passada':'')+'" data-id="'+esc(e.id)+'"></div></details></td></tr>';
  }).join('')+'</tbody>').join('')||'<tbody><tr><td colspan="7" class="crono-tabela-vazia">Nenhuma montagem ou desmontagem neste período.</td></tr></tbody>');
  desenharEscolha();
  root.querySelectorAll("details[data-inline-key]").forEach(el=>{el.open=abertos.includes(el.dataset.inlineKey);});
  if(ancora){const el=ancora.chave?[...root.querySelectorAll('[data-etapa-id]')].find(e=>e.dataset.etapaId===ancora.chave):[...root.querySelectorAll('.crono-tabela-dia')].find(e=>e.dataset.cronoDia===ancora.dia);if(el)scrollBy(0,el.getBoundingClientRect().top-ancora.top);}
  ultimoY=scrollY;requestAnimationFrame(()=>{ajustando=false;if(!posicionado)posicionar();});
 }
 document.addEventListener('pointerdown',e=>{if(edicao&&!e.target.closest('#plEscolhaFlutuante,[data-abrir-escolha]'))fecharEscolha();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&edicao){e.preventDefault();fecharEscolha(true);}});
 addEventListener('resize',()=>{if(edicao)posicionarEscolha();});
 addEventListener('wheel',e=>{if(!visivel()||ajustando||!e.deltaY)return;direcao=e.deltaY<0?'antes':'depois';conferir();},{passive:true});
 addEventListener('scroll',()=>{if(!visivel()||ajustando){ultimoY=scrollY;return;}if(scrollY!==ultimoY)direcao=scrollY<ultimoY?'antes':'depois';ultimoY=scrollY;conferir();},{passive:true});
 addEventListener('painel-uber-atualizado',()=>{root?.querySelectorAll('[data-crono-uber]').forEach(e=>e.textContent=resumoUber(e.dataset.cronoUber));});
 window.PainelCronogramaEquipe={render(novo){ctx=novo;if(!root)preparar();pintar();},carregando(valor){carregando=valor;if(!root)return;antes.disabled=depois.disabled=valor;antes.textContent=valor?'Carregando…':'Carregar dias anteriores';depois.textContent=valor?'Carregando…':'Carregar próximas datas';root.setAttribute('aria-busy',String(valor));},irPara(dia){procurar=dia;if(dia&&ctx&&dia<ctx.hoje&&!verPassados){mostrarPassados(true);}posicionar(dia);}};
})();
