(function(){'use strict';
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const nomes={aguardando_retorno:'Aguardando retorno físico',triagem:'Triagem',limpeza:'Limpeza',reparo:'Reparo',inspecao:'Inspeção final',investigacao:'Item não encontrado',liberado:'Liberado para locação',baixado:'Baixa patrimonial'};
 const destinos={triagem:['limpeza','reparo','inspecao'],limpeza:['inspecao'],reparo:['inspecao'],inspecao:['liberado','reparo','baixado'],investigacao:['triagem','baixado']};
 const s={sb:null,empresa:null,aba:'retorno',dados:null,itens:[],busca:'',estado:'abertos',inv:null};
 const msg=(v,erro=false)=>{$('acStatus').textContent=v;$('acStatus').classList.toggle('erro',erro);for(const dlg of document.querySelectorAll('.ac-dialogo[open]')){let aviso=dlg.querySelector('[data-ac-aviso]');if(!aviso){aviso=document.createElement('p');aviso.dataset.acAviso='';aviso.setAttribute('role','status');dlg.querySelector('.ac-dialogo-topo').after(aviso);}aviso.textContent=v;aviso.style.color=erro?'#b34238':'#467f68';}};
 const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 async function rpc(nome,args){const {data,error}=await s.sb.rpc(nome,{p_empresa:s.empresa,...args});if(error)throw Error(error.message);return data;}
 let cargaPainel=0;
 async function carregar(){const seq=++cargaPainel,dados=await rpc('acervo_painel',{});
  const codigos=[...new Set((dados.ordens||[]).filter(o=>!o.concluida&&o.codigo).map(o=>o.codigo))],mapa=new Map();
  for(let de=0;de<codigos.length;de+=100){try{const {data}=await s.sb.from('itens').select('id,codigo,foto_url').eq('empresa_id',s.empresa).in('codigo',codigos.slice(de,de+100));for(const i of data||[])mapa.set(String(i.codigo),i);}catch{}}
  for(const o of dados.ordens||[]){const item=mapa.get(String(o.codigo));o.foto_url=o.foto_url||item?.foto_url||'';o.item_id=o.item_id||item?.id||null;}
  const {data:catalogo,error:erroCatalogo}=await s.sb.from('itens').select('id,codigo,produto,foto_url,estoque_total').eq('empresa_id',s.empresa).order('foto_url',{ascending:false,nullsFirst:false}).order('produto').limit(80);
  if(erroCatalogo)throw erroCatalogo;
  dados.catalogo=catalogo||[];
  dados.exemplos=[];
  if(seq!==cargaPainel)return;s.dados=dados;render();}

 async function executar(botao,fn){botao.disabled=true;try{await fn();if($('acDetalhe').open)$('acDetalhe').close();await carregar();msg('Registro salvo.');}catch(e){msg(e.message,true);}finally{botao.disabled=false;}}
 function render(){document.querySelectorAll('[data-aba]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.aba===s.aba)));if(s.aba==='retorno'||s.aba==='conferir')retornos();else if(s.aba==='divergencias'){window.AcervoDivergencias.render({host:$('acConteudo'),sb:s.sb,empresa:s.empresa,esc,msg});}else if(s.aba==='concluidas'){$('acConteudo').innerHTML='<iframe class="ac-historico-os" title="O.S. conclu&#237;das" src="../../Chiavari/CentralMetas/itens-danificados.html?concluidas=1"></iframe>';}else inventarios();}
 function retornos(){window.AcervoPainel.render({host:$('acConteudo'),s,esc,nomes,abrir:abrirCard,gerenciar:gerenciarOS,abrirPedido});}
 async function abrirPedido(evento,selecionado){
  let dlg=$('acPedido');if(!dlg){dlg=document.createElement('dialog');dlg.id='acPedido';dlg.className='ac-dialogo ac-pedido-dialogo';document.body.append(dlg);}
  const requisicao=Symbol();dlg._requisicao=requisicao;
  dlg.innerHTML='<div class="ac-dialogo-topo"><h2>Pedido #'+esc(evento.numero_pedido)+(evento.simulado?' \u00b7 Simulado':'')+'</h2><button type="button" data-fechar aria-label="Fechar">×</button></div><p>'+esc(evento.cliente_nome)+' \u00b7 '+esc(evento.local_nome||'')+'</p><div data-pedido-itens role="status">Carregando itens...</div>';
  dlg.querySelector('[data-fechar]').onclick=()=>dlg.close();if(!dlg.open)dlg.showModal();
  try{
   let linhas=[];
   if(evento.simulado){const catalogo=s.dados.catalogo||[];const exemplos=[catalogo.find(c=>c.id===selecionado.item_id),...catalogo.filter(c=>c.id!==selecionado.item_id).slice(0,5)].filter(Boolean);linhas=exemplos.map((c,n)=>({item_id:c.id,item_nome:c.produto,quantidade_solicitada:n===0?6:n+1,itens:c}));}
   else{if(!evento.id)throw Error('Pedido sem identificador para consultar os itens.');for(let de=0;;de+=1000){const {data,error}=await s.sb.from('separacoes_itens').select('item_id,item_nome,quantidade_solicitada,itens:item_id(codigo,produto,foto_url)').eq('empresa_id',s.empresa).eq('separacao_pedido_id',evento.id).order('id').range(de,de+999);if(error)throw error;linhas.push(...(data||[]));if((data||[]).length<1000)break;}}
   if(dlg._requisicao!==requisicao||!dlg.open)return;
   dlg.querySelector('[data-pedido-itens]').innerHTML=linhas.length?'<div class="ac-pedido-itens-scroll"><table class="ac-pedido-itens"><thead><tr><th>Item</th><th>C\u00f3digo</th><th>Quantidade</th></tr></thead><tbody>'+linhas.map(l=>{const item=l.itens||{};return '<tr'+(l.item_id===selecionado.item_id?' class="ac-pedido-item-atual"':'')+'><td><div class="ac-pedido-produto">'+(/^https?:/.test(item.foto_url||'')?'<img src="'+esc(item.foto_url)+'" alt="" loading="lazy">':'')+'<span>'+esc(l.item_nome||item.produto)+'</span></div></td><td>'+esc(item.codigo||'?')+'</td><td>'+esc(l.quantidade_solicitada)+'</td></tr>';}).join('')+'</tbody></table></div>':'Nenhum item encontrado neste pedido.';
  }catch(e){if(dlg._requisicao===requisicao&&dlg.open)dlg.querySelector('[data-pedido-itens]').textContent='N\u00e3o foi poss\u00edvel carregar os itens: '+e.message;}
 }
 function abrirCard(id){
  const r=s.dados.retornos.find(r=>r.id===id);if(!r)return;s.card=id;
  const dlg=$('acDetalhe');dlg.innerHTML='<div class="ac-dialogo-topo"><h2>Conferir item</h2><button type="button" data-fechar aria-label="Fechar">×</button></div><div id="acRetornos"></div><section id="acEncaminhar"></section>';
  dlg.querySelector('[data-fechar]').onclick=()=>dlg.close();listaRetornos(id);
  const pode=['triagem','limpeza','reparo'].includes(r.estado)&&r.tipo!=='falta',ordens=(s.dados.ordens||[]).filter(o=>!o.concluida&&String(r.codigo||'').trim()&&String(o.codigo||'').trim()===String(r.codigo||'').trim()&&Number(o.quantidade)-s.dados.retornos.filter(x=>x.os_id===o.id&&x.id!==r.id).reduce((n,x)=>n+x.quantidade,0)>=r.quantidade);
  $('acEncaminhar').innerHTML=(r.os_numero?'<p><b>O.S #'+esc(r.os_numero)+'</b> <button type="button" id="acAbrirOS">Gerenciar ordem</button></p>':'')+(pode&&!r.os_id?'<div class="ac-vinculo"><h3>Encaminhar para manutenção</h3><form id="acVincular"><label>Ordem de serviço<select name="os" required><option value="">Selecione uma O.S deste item</option>'+ordens.map(o=>'<option value="'+esc(o.id)+'">O.S #'+esc(o.numero)+' · '+esc(o.setor)+' · '+esc(o.quantidade)+' un.</option>').join('')+'</select></label><button '+(!ordens.length?'disabled':'')+'>Vincular O.S</button><button type="button" id="acNovaOS">Criar O.S</button></form></div>':'');
  $('acAbrirOS')?.addEventListener('click',()=>gerenciarOS(r,r.os_id));$('acNovaOS')?.addEventListener('click',()=>gerenciarOS(r));
  $('acVincular')?.addEventListener('submit',e=>{e.preventDefault();executar(e.target.querySelector('button'),async()=>{await rpc('acervo_os_vincular',{p_id:r.id,p_versao:r.versao,p_os:e.target.os.value});dlg.close();});});
  if(!dlg.open)dlg.showModal();
 }
 function gerenciarOS(r,osId=null){
  if(!r)return;const ordem=osId?(s.dados.ordens||[]).find(o=>o.id===osId):null;
  if(osId&&ordem?.fonte!=='sistema'){msg('Esta O.S pertence ao histórico anterior. Consulte o registro em O.S concluídas.',true);return;}
  window.AcervoOrdens.abrir({dlg:$('acOrdem'),r,ordem,esc,rpc,concluido:async()=>{if($('acDetalhe').open)$('acDetalhe').close();await carregar();msg('Ordem de serviço salva.');}});
 }
 function listaRetornos(id){
  const lista=s.dados.retornos.filter(r=>(!id||r.id===id)&&(id||s.estado==='todos'||s.estado==='abertos'&&!['liberado','baixado'].includes(r.estado)||s.estado===r.estado)&&(id||[r.nome,r.numero_pedido,r.cliente_nome].join(' ').toLocaleLowerCase('pt-BR').includes(s.busca.toLocaleLowerCase('pt-BR'))));
  $('acRetornos').innerHTML=lista.map(r=>'<article class="ac-card" data-id="'+r.id+'"><header>'+(r.foto_url&&/^https?:/.test(r.foto_url)?'<img src="'+esc(r.foto_url)+'" alt="">':'')+'<div><h3>'+esc(r.nome)+' · '+r.quantidade+' unidade(s)</h3><small>'+esc(r.origem==='inventario'?'Conferência de inventário':'Pedido #'+r.numero_pedido+' · '+(r.cliente_nome||''))+'</small><div><span class="ac-etiqueta">'+nomes[r.estado]+'</span> · '+({revisao:'Revisão do retorno',avaria:'Avaria',falta:'Desaparecimento'}[r.tipo])+'</div></div></header><p>'+esc(r.motivo)+' · Custo de tratamento: '+brl(r.custo)+'</p>'+(destinos[r.estado]?'<form><label>Próximo destino<select name="destino">'+destinos[r.estado].map(v=>'<option value="'+v+'">'+nomes[v]+'</option>').join('')+'</select></label><label>Motivo / resultado da inspeção<input name="motivo" required minlength="5" maxlength="500"></label><label>Custo adicional do tratamento<input name="custo" type="number" min="0" step="0.01" value="0"></label><button>Registrar</button></form>':'')+'<div class="ac-fotos" data-fotos="'+r.id+'"></div><details><summary>Histórico ('+r.historico.length+')</summary><ul>'+r.historico.map(h=>'<li>'+new Date(h.criado_em).toLocaleString('pt-BR')+' · '+esc(nomes[h.estado]||h.estado)+' · '+esc(h.motivo)+' · '+brl(h.custo)+'</li>').join('')+'</ul></details></article>').join('')||'<div class="ac-vazio">Nenhuma peça nesta situação.</div>';
  lista.forEach(r=>{const card=$('acRetornos').querySelector('[data-id="'+r.id+'"]');card.querySelector('form')?.addEventListener('submit',e=>{e.preventDefault();const f=e.target;executar(f.querySelector('button'),()=>rpc('acervo_movimentar',{p_id:r.id,p_versao:r.versao,p_destino:f.destino.value,p_motivo:f.motivo.value,p_custo:Number(f.custo.value)}));});fotos(r,card.querySelector('[data-fotos]'));});
 }
 async function fotos(r,host){for(const e of r.evidencias||[]){const {data,error}=await s.sb.storage.from('evidencias-operacionais').createSignedUrl(e.path,600);if(error||!host.isConnected)continue;const a=document.createElement('a');a.href=data.signedUrl;a.target='_blank';a.rel='noopener';const img=document.createElement('img');img.src=data.signedUrl;img.alt=e.descricao||'Evidência no evento';a.append(img);host.append(a);}}
 function inventarios(){
  const atual=s.dados.inventarios.find(i=>i.id===s.inv);
  $('acConteudo').innerHTML='<div class="ac-card"><h3>Inventário e qualidade</h3><p>Conte as peças e confira as condições de cada item. As verificações são definidas em Parâmetros → Logística.</p><button id="acNovo">Nova conferência</button><div id="acNovoForm"></div></div><div class="ac-barra"><select id="acInventarios"><option value="">Selecione uma contagem</option>'+s.dados.inventarios.map(i=>'<option value="'+i.id+'">'+esc(i.nome)+' · '+esc(i.status)+'</option>').join('')+'</select></div><div id="acInventario"></div>';
  $('acInventarios').value=s.inv||'';$('acInventarios').onchange=e=>{s.inv=e.target.value;inventarios();};$('acNovo').onclick=novoInventario;
  if(!atual)return;
  window.AcervoInventarioQualidade.render({host:$('acInventario'),atual,esc,tratamentos:s.dados.retornos,salvar:(botao,dados)=>executar(botao,()=>rpc('acervo_inventario_conferir',{p_id:atual.id,...dados})),aprovar:botao=>executar(botao,()=>rpc('acervo_inventario_aprovar',{p_id:atual.id})),cancelar:botao=>executar(botao,()=>rpc('acervo_inventario_cancelar',{p_id:atual.id}))});
 }
 async function novoInventario(){try{
  if(!s.itens.length){for(let de=0;;de+=1000){const {data,error}=await s.sb.from('itens').select('id,produto,codigo').eq('empresa_id',s.empresa).order('produto').range(de,de+999);if(error)throw error;s.itens.push(...data);if(data.length<1000)break;}}
  $('acNovoForm').innerHTML='<form id="acCriar" style="display:grid;margin-top:16px"><label>Nome da contagem<input name="nome" required minlength="3" placeholder="Ex.: Inventário de cadeiras — outubro"></label><input type="search" id="acBuscaItens" placeholder="Filtrar itens"><div class="ac-selecao">'+s.itens.map(i=>'<label data-nome="'+esc((i.produto||'').toLowerCase())+'"><input type="checkbox" name="item" value="'+i.id+'">'+esc(i.codigo||'')+' · '+esc(i.produto)+'</label>').join('')+'</div><button>Criar contagem dos itens selecionados</button></form>';
  $('acBuscaItens').oninput=e=>document.querySelectorAll('[data-nome]').forEach(l=>l.hidden=!l.dataset.nome.includes(e.target.value.toLowerCase()));$('acCriar').onsubmit=e=>{e.preventDefault();const f=e.target,ids=[...f.querySelectorAll('[name=item]:checked')].map(c=>c.value);executar(f.querySelector('button'),async()=>{s.inv=await rpc('acervo_inventario_criar',{p_nome:f.nome.value,p_itens:ids});});};
 }catch(e){msg(e.message,true);}}
 // bolinha da aba Divergências: contagens gerais pendentes
 async function contarDivergencias(){try{const {count}=await s.sb.from('acervo_contagens_gerais').select('id',{count:'exact',head:true}).eq('empresa_id',s.empresa).eq('status','pendente');const b=document.querySelector('[data-aba="divergencias"] .tab-badge');if(b)b.textContent=count||'';}catch{}}
 const atualizarPainel=()=>{if(s.empresa&&!document.hidden&&['retorno','conferir'].includes(s.aba)&&!document.querySelector('.ac-dialogo[open]')&&!document.activeElement?.matches('input,select'))carregar().catch(e=>msg(e.message,true));};setInterval(atualizarPainel,30000);document.addEventListener('visibilitychange',atualizarPainel);
 document.querySelectorAll('[data-aba]').forEach(b=>b.onclick=()=>{s.aba=b.dataset.aba;render();});
 (async()=>{const c=await window.aguardarContexto();s.sb=window.supabaseClient;s.empresa=c.empresa_id;await carregar();contarDivergencias();window.finalizarCarregamentoModulo?.();})().catch(e=>msg(e.message,true));
})();
