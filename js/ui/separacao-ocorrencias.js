(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const estados={acervo:'Aguardando Gestão do Acervo',comercial:'Aguardando Comercial',triagem:'Solução disponível · confirmar na Triagem',resolvida:'Resolvida'};
 const fotosChat=new Map();
 const raizChat=document.currentScript?.src?new URL('../../',document.currentScript.src):null;
 let recursosChat;
 async function rpc(sb,n,args){const r=await sb.rpc(n,args);if(r.error)throw Error(r.error.message);return r.data;}
 function dialogo(titulo){
  const d=document.createElement('dialog');d.className='so-dialog';d.innerHTML=`<header><h2>${esc(titulo)}</h2><button type="button" data-fechar aria-label="Fechar">×</button></header><div data-corpo></div>`;
  document.body.append(d);d.querySelector('[data-fechar]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());d.showModal();return d;
 }
 function fotoItem(o,interativa=true){
  try{const u=new URL(o.item_foto);if(!['http:','https:'].includes(u.protocol))return '';const img=`<img src="${esc(u.href)}" alt="${esc(o.item_nome)}" loading="lazy">`;return interativa?`<button type="button" data-foto-item aria-label="Ampliar foto de ${esc(o.item_nome)}">${img}</button>`:img;}catch{return '';}
 }
 function respostaEstoque(o){
  const historico=o.historico||[],estoque=historico.filter(h=>h.anterior==='acervo').at(-1),comercial=historico.filter(h=>h.anterior==='comercial').at(-1);
  const mensagem=(h,titulo)=>h?`<div class="so-resposta"><small>${titulo} · ${esc(new Date(h.em).toLocaleString('pt-BR'))}</small><p>${esc(h.texto)}</p></div>`:'';
  return (mensagem(estoque,'Estoque')||'<span class="so-sem-resposta">Aguardando resposta do Estoque</span>')+mensagem(comercial,'Comercial')+'<p><button type="button" data-abrir-conversa>Abrir conversa</button></p>';
 }
 async function listar(sb,empresa,pedido=null){return await rpc(sb,'separacao_ocorrencias_listar',{p_empresa:empresa,p_pedido:pedido})||[];}
 function cardPedido(o){
  let foto=o.cliente_foto||'';try{if(!['http:','https:'].includes(new URL(foto).protocol))foto='';}catch{foto='';}
  const iniciais=String(o.cliente||'Cliente').trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('');
  const hora=/^\d{2}:\d{2}/.exec(o.pedido_hora_entrega||'')?.[0]||'—';
  return `<span class="so-pedido-card-topo"><span class="so-pedido-agenda"><strong>${esc(hora)}</strong><span>Entrega</span></span><span class="so-pedido-numero">Pedido #${esc(o.pedido_numero)}</span></span><span class="so-pedido-cliente"><span class="so-avatar so-pedido-avatar">${esc(iniciais)}${foto?`<img src="${esc(foto)}" alt="Foto de ${esc(o.cliente)}">`:''}</span><span class="so-pedido-identidade"><strong>${esc(o.cliente)}</strong><small>${esc(o.pedido_local||'Local não informado')}</small></span></span>`;
 }
 function caminhosFotos(o){return [...new Set([o.foto_path,...(o.fotos_paths||[])].filter(Boolean))];}
 function anexosChat(o,empresa){return '<div class="so-chat-anexos">'+caminhosFotos(o).map(path=>{const u=fotosChat.get(`${empresa}:${o.id}:${path}`);return u?`<figure><button type="button" data-chat-foto aria-label="Ampliar foto"><img src="${esc(u)}" alt="Foto do problema" loading="lazy"></button></figure>`:'';}).join('')+'</div>';}
 function conversa(o,sb,empresa,fotosNoChat=false){
  const historico=[...(o.conversa_ia||[]).map(m=>({texto:m.texto,em:m.em,equipe:m.papel==='ia'?'Assistente de estoque (IA)':'Triagem',por:m.papel==='pessoa'?o.criado_por:null})),...(o.historico?.length?o.historico:[{acao:'reportar',texto:o.observacao,em:o.criado_em,por:o.criado_por}])];
  return historico.map(h=>{
   const equipe=h.equipe||(h.acao==='reportar'||h.anterior==='triagem'?'Triagem':h.anterior==='comercial'?'Comercial':'Estoque');
   const nome=h.nome||equipe,iniciais=nome.split(/\s+/).slice(0,2).map(n=>n[0]).join('');
   let foto=h.foto_url||'';try{if(!foto&&h.por)foto=sb.storage.from('avatares').getPublicUrl(`${empresa}/${h.por}.jpg`).data?.publicUrl||'';}catch{}
   try{if(!['http:','https:'].includes(new URL(foto).protocol))foto='';}catch{foto='';}
   return `<article class="so-mensagem ${equipe==='Triagem'?'so-mensagem-triagem':''}"><span class="so-avatar">${esc(iniciais)}${foto?`<img src="${esc(foto)}" alt="Foto de ${esc(nome)}">`:''}</span><div class="so-balao"><div class="so-mensagem-autor"><strong>${esc(nome)}</strong><span>${esc(equipe)}</span></div>${h.acao==='reportar'?`<strong>${esc(o.motivo_nome)}</strong>`:''}${h.texto?`<p>${esc(h.texto)}</p>`:''}${fotosNoChat&&h.acao==='reportar'?anexosChat(o,empresa):''}<small>${h.em?esc(new Date(h.em).toLocaleString('pt-BR')):''}${h.acao&& !['reportar','mensagem'].includes(h.acao)?` · ${esc(estados[h.acao]||h.acao)}`:''}</small></div></article>`;
  }).join('');
 }
 function quantidades(o,compacta=false){return `<div class="so-quantidades"><div class="so-quantidade-card"><span>Qtd. do pedido</span><strong>${o.quantidade_pedido==null?'—':esc(Number(o.quantidade_pedido).toLocaleString('pt-BR'))}</strong>${compacta?'':'<small>Total solicitado</small>'}</div><div class="so-quantidade-card so-quantidade-avaria"><span>Qtd. com avaria</span><strong>${esc(Number(o.quantidade).toLocaleString('pt-BR'))}</strong>${compacta?'':'<small>Reportada nesta ocorrência</small>'}</div></div>`;}
 function cardProduto(o){
  const nome=String(o.item_nome||''),inicio=nome.search(/\s+\((?:L|A|P|D|Ø)\)\s*[\d.,]/i);
  return `<span class="so-produto-resumo"><span class="so-item-foto">${fotoItem(o,false)}<span>Sem foto</span></span><span class="so-produto-texto"><strong class="so-produto-nome">${esc(inicio<0?nome:nome.slice(0,inicio))}</strong>${inicio<0?'':`<small class="so-produto-medidas">${esc(nome.slice(inicio).trim())}</small>`}</span></span>${quantidades(o,true)}`;
 }
 async function painelConversa({host,sb,empresa,fila,pedido,item,ocorrencia,aoAtualizar},lista){
  const d=host.closest('dialog')||host.closest('.so-inline-conversa'),primeira=lista[0];
  const mesmoItem=primeira&&lista.every(o=>o.item_id===primeira.item_id);
  if(mesmoItem){
   d.querySelector('header h2').innerHTML=`<span class="so-cabecalho-produto"><span class="so-item-foto">${fotoItem(primeira)}<span>Sem foto</span></span><span class="so-cabecalho-nome" title="${esc(primeira.item_nome)}">${esc(primeira.item_nome)}</span></span>`;
   const foto=d.querySelector('[data-foto-item]');if(foto)foto.onclick=()=>{const ampliar=dialogo('Foto do item');ampliar.querySelector('[data-corpo]').innerHTML=`<img class="so-foto" src="${esc(foto.querySelector('img').src)}" alt="${esc(primeira.item_nome)}">`;};
   const img=d.querySelector('.so-item-foto img');if(img)img.onerror=()=>img.closest('button').remove();
  }
  host.innerHTML=`<div class="so-painel so-conversas">${lista.map(o=>`<section class="so-detalhe" data-ocorrencia="${esc(o.id)}"><aside class="so-detalhe-item">${!mesmoItem?`<h3>${esc(o.item_nome)}</h3>`:''}${quantidades(o)}${o.foto_path?'<h4>Foto da avaria / problema</h4><div class="so-avaria" data-avaria><span>Carregando foto…</span></div>':''}</aside><div class="so-chat"><header class="so-chat-topo"><div class="so-acoes">${acoes(o,fila)}</div><span class="so-estado" data-estado="${esc(o.estado)}">${esc(estados[o.estado])}</span></header><div class="so-chat-mensagens" role="log" aria-label="Mensagens da ocorrência">${conversa(o,sb,empresa)}</div>${o.estado!=='resolvida'?`<form class="so-chat-form"><label>Mensagem<textarea name="mensagem" required maxlength="3000" rows="2" placeholder="Escreva para a equipe…"></textarea></label><footer><button type="submit">Enviar mensagem</button></footer></form>`:'<p class="so-chat-encerrado">Ocorrência resolvida · conversa encerrada</p>'}<p class="so-erro" role="status"></p></div></section>`).join('')||'<p class="so-vazio">Nenhuma ocorrência nesta fila.</p>'}</div>`;
  host.querySelectorAll('.so-avatar img').forEach(img=>img.onerror=()=>img.remove());
  host.querySelectorAll('.so-chat-mensagens').forEach(log=>log.scrollTop=log.scrollHeight);
  host.querySelectorAll('[data-foto-item]').forEach(b=>b.onclick=()=>{const d=dialogo('Foto do item');d.querySelector('[data-corpo]').innerHTML=`<img class="so-foto" src="${esc(b.querySelector('img').src)}" alt="Foto do item">`;});
  host.querySelectorAll('.so-item-foto img').forEach(img=>img.onerror=()=>img.closest('button').remove());
  const atualizar=async()=>{if(aoAtualizar)await aoAtualizar();else await painel({host,sb,empresa,fila,pedido,item,ocorrencia});document.dispatchEvent(new CustomEvent('separacao-ocorrencias-atualizadas'));};
  host.querySelectorAll('.so-chat-form').forEach(f=>f.onsubmit=async ev=>{
   ev.preventDefault();const sec=f.closest('[data-ocorrencia]'),b=f.querySelector('button'),erro=sec.querySelector('.so-erro');b.disabled=true;erro.textContent='';
   try{await rpc(sb,'separacao_ocorrencia_mensagem',{p_empresa:empresa,p_id:sec.dataset.ocorrencia,p_texto:f.elements.mensagem.value,p_equipe:fila});await atualizar();}catch(e){erro.textContent=e.message;}finally{b.disabled=false;}
  });
  host.querySelectorAll('[data-so-acao]').forEach(b=>b.onclick=()=>{
   const sec=b.closest('[data-ocorrencia]'),d=dialogo(b.textContent);
   d.querySelector('[data-corpo]').innerHTML='<form><label>Análise ou solução<textarea required minlength="5" maxlength="3000"></textarea></label><p class="so-erro" role="status"></p><footer><button type="submit">Confirmar</button></footer></form>';
   d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();const enviar=d.querySelector('[type=submit]');enviar.disabled=true;try{await rpc(sb,'separacao_ocorrencia_acao',{p_empresa:empresa,p_id:sec.dataset.ocorrencia,p_acao:b.dataset.soAcao,p_texto:d.querySelector('textarea').value});d.close();await atualizar();}catch(e){d.querySelector('.so-erro').textContent=e.message;}finally{enviar.disabled=false;}};
  });
  await Promise.allSettled(lista.filter(o=>o.foto_path).map(async o=>{
   const sec=Array.from(host.querySelectorAll('[data-ocorrencia]')).find(s=>s.dataset.ocorrencia===o.id),alvo=sec.querySelector('[data-avaria]');
   try{await Promise.all(caminhosFotos(o).map(async path=>{const r=await sb.storage.from('separacao-ocorrencias').createSignedUrl(path,3600);if(r.error)throw r.error;fotosChat.set(`${empresa}:${o.id}:${path}`,r.data.signedUrl);}));alvo.innerHTML=anexosChat(o,empresa);alvo.querySelectorAll('button').forEach(b=>b.onclick=()=>{const d=dialogo('Foto do problema');d.querySelector('[data-corpo]').innerHTML=`<img class="so-foto" src="${esc(b.querySelector('img').src)}" alt="Foto do problema">`;});}catch{alvo.textContent='Fotos indisponíveis. Reabra para tentar novamente.';}
  }));

 }
 async function painelPedidos(opcoes,lista){
  const {host,sb,empresa,fila}=opcoes;
  host._soLayoutCleanup?.();
  if(!lista.length){host.innerHTML='<p class="so-vazio">'+(opcoes.resolvidas?'Nenhum problema de separação resolvido ainda.':'Nenhuma ocorrência nesta fila.')+'</p>';return;}
  const grupos=new Map();lista.forEach(o=>{const chave=o.pedido_id||o.pedido_numero;if(!grupos.has(chave))grupos.set(chave,[]);grupos.get(chave).push(o);});
  let chave=host.dataset.soSelecionado;if(!grupos.has(chave))chave=grupos.keys().next().value;
  host.dataset.soSelecionado=chave;
  host.innerHTML=`<div class="so-pedidos"><nav class="so-pedidos-lista" aria-label="Pedidos com ocorrências">${Array.from(grupos,([id,ocorrencias])=>`<button type="button" data-so-pedido="${esc(id)}" aria-pressed="${id===chave}">${cardPedido(ocorrencias[0])}</button>`).join('')}</nav><nav class="so-produtos-lista" aria-label="Produtos com ocorr&#234;ncias"></nav><section class="so-pedido-detalhes"></section></div>`;
  host.querySelectorAll('.so-pedido-avatar img').forEach(img=>img.onerror=()=>img.remove());
  const detalhes=host.querySelector('.so-pedido-detalhes');
  const selecionar=async id=>{
   host.dataset.soSelecionado=id;
   host.querySelectorAll('[data-so-pedido]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.soPedido===id)));
   const ocorrencias=grupos.get(id)||[],produtos=host.querySelector('.so-produtos-lista');
   produtos.innerHTML=ocorrencias.map(o=>`<button type="button" data-so-produto="${esc(o.id)}" aria-pressed="false">${cardProduto(o)}</button>`).join('');
   produtos.querySelectorAll('.so-item-foto img').forEach(img=>img.onerror=()=>img.remove());
   const selecionarProduto=async ocorrenciaId=>{
    const o=ocorrencias.find(o=>o.id===ocorrenciaId);if(!o)return;
    host.dataset.soProdutoSelecionado=o.id;
    produtos.querySelectorAll('[data-so-produto]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.soProduto===o.id)));
    detalhes.innerHTML='<section class="so-inline-conversa"><header><h2></h2></header><div data-corpo></div></section>';
    const sec=detalhes.querySelector('.so-inline-conversa');
    await painelConversa({...opcoes,host:sec.querySelector('[data-corpo]'),ocorrencia:o.id,aoAtualizar:()=>painel(opcoes)},[o]);
    sec.querySelector(':scope > header')?.remove();
    sec.querySelector('.so-quantidades')?.remove();
    const avaria=sec.querySelector('.so-avaria img');if(avaria)fotosChat.set(`${empresa}:${o.id}:${o.foto_path}`,avaria.src);
    sec.querySelector('.so-detalhe-item')?.remove();
    const log=sec.querySelector('.so-chat-mensagens');log.innerHTML=conversa(o,sb,empresa,true);
    log.querySelectorAll('.so-avatar img').forEach(img=>img.onerror=()=>img.remove());
    sec.onclick=ev=>{const b=ev.target.closest('[data-chat-foto]');if(!b)return;const img=b.querySelector('img'),d=dialogo(img.alt);d.querySelector('[data-corpo]').innerHTML=`<img class="so-foto" src="${esc(img.src)}" alt="${esc(img.alt)}">`;};
    log.scrollTop=log.scrollHeight;
   };
   produtos.querySelectorAll('[data-so-produto]').forEach(b=>b.onclick=()=>selecionarProduto(b.dataset.soProduto));
   await selecionarProduto(ocorrencias.find(o=>o.id===host.dataset.soProdutoSelecionado)?.id||ocorrencias[0]?.id);
  };
  host.querySelectorAll('[data-so-pedido]').forEach(b=>b.onclick=()=>selecionar(b.dataset.soPedido));
  await selecionar(chave);
  const raiz=host.querySelector('.so-pedidos');
  const timer=setInterval(async()=>{
   if(!raiz.isConnected){clearInterval(timer);return;}if(document.hidden)return;
   try{const novas=await listar(sb,empresa);if(!raiz.isConnected)return;
    raiz.querySelectorAll('.so-detalhe').forEach(sec=>{const o=novas.find(o=>o.id===sec.dataset.ocorrencia);if(!o)return;const log=sec.querySelector('.so-chat-mensagens'),html=conversa(o,sb,empresa,true);if(log.innerHTML!==html){const fim=log.scrollHeight-log.scrollTop-log.clientHeight<60;log.innerHTML=html;log.querySelectorAll('.so-avatar img').forEach(img=>img.onerror=()=>img.remove());if(fim)log.scrollTop=log.scrollHeight;}});
   }catch{}
  },10000);
 }
 // resolvidas=true (16/11/2026): mostra os problemas já resolvidos (histórico), do mais recente para o mais antigo
 async function painel({host,sb,empresa,fila='acervo',pedido=null,item=null,ocorrencia=null,layout=null,resolvidas=false}){
  host.innerHTML='<p role="status">Carregando ocorrências…</p>';
  try{
   const todas=await listar(sb,empresa,pedido);
   const lista=resolvidas
    ?todas.filter(o=>o.estado==='resolvida'&&(!item||o.item_id===item)&&(!ocorrencia||o.id===ocorrencia)).sort((a,b)=>String(b.atualizado_em||b.criado_em||'').localeCompare(String(a.atualizado_em||a.criado_em||'')))
    :todas.filter(o=>(!item||o.item_id===item)&&(!ocorrencia||o.id===ocorrencia)&&(fila==='triagem'||o.estado===fila||o.id===ocorrencia));
   const badge=document.querySelector(`[data-aba="ocorrencias"] .tab-badge`);if(badge)badge.textContent=todas.filter(o=>o.estado==='acervo').length||'';
   if(host.closest('.so-dialog-tabela')){await painelConversa({host,sb,empresa,fila,pedido,item,ocorrencia},lista);return;}
   if(layout==='pedidos'){await painelPedidos({host,sb,empresa,fila,pedido,item,ocorrencia,layout,resolvidas},lista);return;}
   host.innerHTML=`<div class="so-painel">${host.closest("dialog")?'':'<div class="so-painel-topo"><h3>Ocorrências da separação</h3></div>'}${fila==='comercial'?'<p class="so-ajuda">Negocie a solução com o cliente. Verifique substituição, disponibilidade em outros pedidos ou sublocação. Para alterar os itens, solicite à Triagem a liberação para o Comercial. Registre a solução para a Triagem confirmar o recebimento.</p>':''}<div class="so-table-wrap" tabindex="0" role="region" aria-label="Ocorrências da separação"><table class="so-table"><thead><tr><th scope="col">Foto</th><th scope="col">Item</th><th scope="col">Pedido / Cliente</th><th scope="col">Problema enviado pela Triagem</th><th scope="col">Resposta do Estoque</th><th scope="col">Qtd.</th><th scope="col">Situação</th></tr></thead><tbody>${lista.map(o=>`<tr data-ocorrencia="${esc(o.id)}" data-so-linha tabindex="0" aria-selected="false"><td><div class="so-item-foto">${fotoItem(o)}<span>Sem foto</span></div></td><td class="so-item-col"><strong>${esc(o.item_nome)}</strong>${o.codigo?`<small>${esc(o.codigo)}</small>`:''}</td><td><strong>Pedido ${esc(o.pedido_numero)}</strong><small>${esc(o.cliente)}</small></td><td class="so-problema-col"><strong>${esc(o.motivo_nome)}</strong>${o.observacao?`<p>${esc(o.observacao)}</p>`:''}${o.foto_path?'<button type="button" data-foto>Foto do problema</button>':''}</td><td class="so-resposta-col">${respostaEstoque(o)}</td><td class="so-qtd-col">${esc(o.quantidade)}</td><td><span class="so-estado" data-estado="${esc(o.estado)}">${estados[o.estado]}</span></td></tr>`).join('')||'<tr><td colspan="7" class="so-vazio">Nenhuma ocorrência nesta fila.</td></tr>'}</tbody></table></div>${lista.some(o=>acoes(o,fila))?`<footer class="so-painel-rodape">${lista.length>1?'<p class="so-selecao-ajuda">Selecione uma linha para agir sobre a ocorrência.</p>':''}${lista.map(o=>`<div class="so-rodape-grupo" data-ocorrencia="${esc(o.id)}" data-so-grupo hidden><div class="so-acoes">${acoes(o,fila)||'<span class="so-sem-acao">Nenhuma ação disponível nesta etapa.</span>'}</div></div>`).join('')}</footer>`:''}<p class="so-erro" role="status"></p></div>`;
   const selecionar=id=>{
    host.querySelectorAll('[data-so-linha]').forEach(l=>l.setAttribute('aria-selected',String(l.dataset.ocorrencia===id)));
    host.querySelectorAll('[data-so-grupo]').forEach(g=>g.hidden=g.dataset.ocorrencia!==id);
   };
   selecionar((lista.find(o=>acoes(o,fila))||lista[0])?.id);
   host.querySelectorAll('[data-abrir-conversa]').forEach(b=>b.onclick=()=>abrirPainel({sb,empresa,fila,pedido,item,ocorrencia:b.closest('[data-ocorrencia]').dataset.ocorrencia}));
   host.querySelectorAll('[data-so-linha]').forEach(l=>{
    l.addEventListener('click',ev=>{if(!ev.target.closest('button,details,a,input'))selecionar(l.dataset.ocorrencia);});
    l.addEventListener('keydown',ev=>{if(ev.target===l&&['Enter',' '].includes(ev.key)){ev.preventDefault();selecionar(l.dataset.ocorrencia);}});
   });
   host.querySelectorAll('.so-item-foto img').forEach(img=>img.addEventListener('error',()=>img.closest('button').remove(),{once:true}));
   host.querySelectorAll('[data-foto-item]').forEach(b=>b.onclick=()=>{const d=dialogo('Foto do item');const img=document.createElement('img');img.className='so-foto';img.src=b.querySelector('img').src;img.alt=b.querySelector('img').alt;d.querySelector('[data-corpo]').append(img);});
   host.querySelectorAll('[data-foto]').forEach(b=>b.onclick=async()=>{
    try{const o=lista.find(o=>o.id===b.closest('[data-ocorrencia]').dataset.ocorrencia);const r=await sb.storage.from('separacao-ocorrencias').createSignedUrl(o.foto_path,300);if(r.error)throw r.error;
     const d=dialogo('Foto da ocorrência');const img=document.createElement('img');img.className='so-foto';img.src=r.data.signedUrl;img.alt='Foto do problema reportado';d.querySelector('[data-corpo]').append(img);
    }catch(e){host.querySelector('.so-erro').textContent=e.message;}
   });
   host.querySelectorAll('[data-so-acao]').forEach(b=>b.onclick=()=>{
    const id=b.closest('[data-ocorrencia]').dataset.ocorrencia,d=dialogo(b.textContent);
    d.querySelector('[data-corpo]').innerHTML='<form><label>Análise ou solução<textarea name="texto" minlength="5" maxlength="3000" required placeholder="Descreva o que foi verificado, a solução combinada e os próximos passos."></textarea></label><p class="so-erro" role="status"></p><footer><button type="submit">Confirmar</button></footer></form>';
    d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();const botao=d.querySelector('[type=submit]');botao.disabled=true;
     try{await rpc(sb,'separacao_ocorrencia_acao',{p_empresa:empresa,p_id:id,p_acao:b.dataset.soAcao,p_texto:d.querySelector('textarea').value});d.close();await painel({host,sb,empresa,fila,pedido,item});document.dispatchEvent(new CustomEvent('separacao-ocorrencias-atualizadas'));}
     catch(e){d.querySelector('.so-erro').textContent=e.message;}finally{botao.disabled=false;}
    };
   });
  }catch(e){host.innerHTML=`<p class="so-erro" role="alert">${esc(e.message)}</p>`;}
 }
 function acoes(o,fila){
  const botao=(acao,texto)=>`<button type="button" data-so-acao="${acao}">${texto}</button>`;
  if(fila==='acervo'&&o.estado==='acervo')return botao('triagem','Enviar solução para a Triagem')+botao('comercial','Encaminhar ao Comercial');
  if(fila==='comercial'&&o.estado==='comercial')return botao('triagem','Enviar solução para a Triagem')+botao('acervo','Devolver para o Acervo');
  if(fila==='triagem'&&o.estado==='triagem')return botao('resolvida','Confirmar solução e recebimento')+botao('acervo','Problema continua');
  return '';
 }
 async function reportar(opcoes){return window.SeparacaoAssistente.abrir(opcoes);}
 async function sinalizar({sb,empresa,pedido,host}){
  host.dataset.soPedido=pedido;
  try{const lista=await listar(sb,empresa,pedido);if(!host.isConnected||host.dataset.soPedido!==pedido)return;
   host.querySelectorAll('[data-so-item]').forEach(el=>{const abertas=lista.filter(o=>o.item_id===el.dataset.soItem&&o.estado!=='resolvida');const l=abertas.filter(o=>o.estado!=='triagem');el.textContent=l.length?estados[l[0].estado]+(l.length>1?` · ${l.length} problemas`:''):'';/* nov/2026: o botão de acompanhar só aparece no item com problema aberto, piscando em vermelho */const bt=el.parentElement?.querySelector('[data-ver-ocorrencias]');if(bt){bt.hidden=!abertas.length;bt.classList.toggle('is-ativo',!!abertas.length);}});
  }catch(e){console.warn('Ocorrências da separação:',e.message);}
 }
 async function abrirPainel(opcoes){
  try{
   if(!window.EasyLocAssistenteSolicitacao){
    recursosChat||=new Promise((ok,erro)=>{
     const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('styles/assistente-solicitacao.css?v=20261117-chat-unico',raizChat);document.head.append(css);
     const script=document.createElement('script');script.src=new URL('js/ui/assistente-solicitacao.js?v=20261117-chat-unico',raizChat);script.onload=ok;script.onerror=()=>erro(Error('N?o foi poss?vel abrir o chat.'));document.head.append(script);
    });await recursosChat;
   }
   const {sb,empresa,pedido,item,ocorrencia}=opcoes,fila=opcoes.fila||'triagem';
   const todas=await listar(sb,empresa,pedido||null),lista=todas.filter(o=>(!item||o.item_id===item)&&(fila==='triagem'||o.estado===fila||o.id===ocorrencia));
   let atual=lista.find(o=>o.id===ocorrencia)||lista[0];
   if(!atual){window.alerta?.('Nenhuma ocorr?ncia nesta fila.','Acompanhar problema','aviso');return;}
   let ativa=true,d,timer;
   const mensagens=async o=>{
    await Promise.allSettled(caminhosFotos(o).map(async path=>{const r=await sb.storage.from('separacao-ocorrencias').createSignedUrl(path,3600);if(r.error)throw r.error;fotosChat.set(`${empresa}:${o.id}:${path}`,r.data.signedUrl);}));
    const ia=(o.conversa_ia||[]).filter(m=>m.texto||m.fotos?.length).map(m=>({papel:m.papel,texto:m.texto||'',em:m.em,autor:m.papel==='ia'?'Auxiliar de estoque ? IA':'Triagem',fotos:m.fotos}));
    const hist=(o.historico?.length?o.historico:[{acao:'reportar',texto:o.observacao,em:o.criado_em}]).map(h=>{
     const equipe=h.equipe||(h.acao==='reportar'||h.anterior==='triagem'?'Triagem':h.anterior==='comercial'?'Comercial':'Estoque');
     return {papel:equipe.toLowerCase()===fila||(fila==='acervo'&&equipe==='Estoque')?'pessoa':'ia',autor:[h.nome,equipe].filter(Boolean).join(' ? '),texto:h.texto||'',em:h.em,...(h.acao==='reportar'?{fotos:caminhosFotos(o).map(path=>fotosChat.get(`${empresa}:${o.id}:${path}`)).filter(Boolean)}:{})};
    });return [...ia,...hist];
   };
   const barra=()=>`${lista.length>1?`<select aria-label="Ocorr?ncia" data-chat-ocorrencia>${lista.map(o=>`<option value="${esc(o.id)}" ${o.id===atual.id?'selected':''}>${esc(o.item_nome)} ? ${esc(o.motivo_nome)}</option>`).join('')}</select>`:''}<span class="so-estado" data-estado="${esc(atual.estado)}">${esc(estados[atual.estado]||atual.estado)}</span><div class="so-acoes">${acoes(atual,fila)}</div>`;
   const atualizar=async()=>{const novas=await listar(sb,empresa,pedido||null);atual=novas.find(o=>o.id===atual.id)||atual;return mensagens(atual);};
   d=await window.EasyLocAssistenteSolicitacao.abrir({
    tipo:'separacao',titulo:'Reportar problema ? '+atual.item_nome,assistente:'Auxiliar de estoque ? IA',ctx:opcoes.ctx||await window.aguardarContexto(),
    dados:{pedido_id:atual.pedido_id||pedido,linha_id:atual.linha_id,item_id:atual.item_id},
    chave:'ocorrencia:'+atual.id,persistir:false,recomecar:false,anexos:false,somenteLeitura:atual.estado==='resolvida',
    mensagens:await mensagens(atual),acoesHtml:barra(),
    enviarMensagem:async texto=>{
     await rpc(sb,'separacao_ocorrencia_mensagem',{p_empresa:empresa,p_id:atual.id,p_texto:texto,p_equipe:fila});
     document.dispatchEvent(new CustomEvent('separacao-ocorrencias-atualizadas'));return atualizar();
    },
    aoFechar:()=>{ativa=false;clearInterval(timer);},
    acao:async ev=>{
     if(ev.type==='change'&&ev.target.matches('[data-chat-ocorrencia]')){await abrirPainel({...opcoes,ocorrencia:ev.target.value});return;}
     const b=ev.target.closest('[data-so-acao]');if(!b||ev.type!=='click')return;
     const acao=dialogo(b.textContent);acao.querySelector('[data-corpo]').innerHTML='<form><label>An?lise ou solu??o<textarea required minlength="5" maxlength="3000"></textarea></label><p class="so-erro" role="status"></p><footer><button type="submit">Confirmar</button></footer></form>';
     acao.querySelector('form').onsubmit=async e=>{e.preventDefault();const enviar=acao.querySelector('[type=submit]');enviar.disabled=true;try{await rpc(sb,'separacao_ocorrencia_acao',{p_empresa:empresa,p_id:atual.id,p_acao:b.dataset.soAcao,p_texto:acao.querySelector('textarea').value});acao.close();document.dispatchEvent(new CustomEvent('separacao-ocorrencias-atualizadas'));await abrirPainel({...opcoes,ocorrencia:atual.id});}catch(e){acao.querySelector('.so-erro').textContent=e.message;}finally{enviar.disabled=false;}};
    }
   });
   let carregando=false;
   timer=setInterval(async()=>{if(!ativa||!d.isConnected){clearInterval(timer);return;}if(carregando||!d.open||document.hidden)return;carregando=true;try{const msgs=await atualizar();if(!ativa)return;window.EasyLocAssistenteSolicitacao.atualizarMensagens(d,msgs,atual.estado==='resolvida');d.querySelector('.as-contexto').innerHTML=barra();}catch{}finally{carregando=false;}},10000);
   return d;
  }catch(e){window.alerta?.(e.message,'Acompanhar problema','erro');console.error(e);}
 }

 window.SeparacaoOcorrencias={reportar,painel,abrirPainel,sinalizar};
 document.addEventListener('click',async ev=>{if(!ev.target.closest('[data-ocorrencias-comercial]'))return;
  try{const ctx=await window.aguardarContexto();abrirPainel({sb:window.supabaseClient,empresa:ctx.empresa_id,fila:'comercial'});}catch(e){window.alerta?.(e.message,'Ocorrências','erro');}
 });
})();
