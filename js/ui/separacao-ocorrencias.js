(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const estados={acervo:'Aguardando Gestão do Acervo',comercial:'Aguardando Comercial',triagem:'Solução disponível · confirmar na Triagem',resolvida:'Resolvida'};
 const fotosChat=new Map();
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
 function anexosChat(o,empresa){
  if(!o.foto_path)return '';
  const avaria=fotosChat.get(`${empresa}:${o.id}:${o.foto_path}`);
  return `<div class="so-chat-anexos"><figure>${avaria?`<button type="button" data-chat-foto aria-label="Ampliar foto da avaria"><img src="${esc(avaria)}" alt="Foto da avaria ou problema" loading="lazy"></button>`:'<span class="so-ajuda">Não foi possível carregar a foto da avaria. Reabra a ocorrência para tentar novamente.</span>'}<figcaption>Foto da avaria / problema</figcaption></figure></div>`;
 }
 function conversa(o,sb,empresa,fotosNoChat=false){
  const historico=o.historico?.length?o.historico:[{acao:'reportar',texto:o.observacao,em:o.criado_em,por:o.criado_por}];
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
   try{const r=await sb.storage.from('separacao-ocorrencias').createSignedUrl(o.foto_path,3600);if(r.error)throw r.error;const u=new URL(r.data.signedUrl);if(!['https:','http:'].includes(u.protocol))throw Error('Foto inválida');alvo.innerHTML=`<button type="button"><img src="${esc(u.href)}" alt="Foto da avaria ou problema"></button>`;alvo.querySelector('img').onerror=()=>{alvo.textContent='Não foi possível carregar a foto.';};alvo.querySelector('button').onclick=()=>{const d=dialogo('Foto da avaria / problema');d.querySelector('[data-corpo]').innerHTML=`<img class="so-foto" src="${esc(u.href)}" alt="Foto da avaria ou problema">`;};}catch{alvo.textContent='Não foi possível carregar a foto. Reabra a ocorrência para tentar novamente.';}
  }));
 }
 async function painelPedidos(opcoes,lista){
  const {host,sb,empresa,fila}=opcoes;
  host._soLayoutCleanup?.();
  if(!lista.length){host.innerHTML='<p class="so-vazio">Nenhuma ocorrência nesta fila.</p>';return;}
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
 async function painel({host,sb,empresa,fila='acervo',pedido=null,item=null,ocorrencia=null,layout=null}){
  host.innerHTML='<p role="status">Carregando ocorrências…</p>';
  try{
   const todas=await listar(sb,empresa,pedido);
   const lista=todas.filter(o=>(!item||o.item_id===item)&&(!ocorrencia||o.id===ocorrencia)&&(fila==='triagem'||o.estado===fila));
   const badge=document.querySelector(`[data-aba="ocorrencias"] .tab-badge`);if(badge)badge.textContent=todas.filter(o=>o.estado==='acervo').length||'';
   if(host.closest('.so-dialog-tabela')){await painelConversa({host,sb,empresa,fila,pedido,item,ocorrencia},lista);return;}
   if(layout==='pedidos'){await painelPedidos({host,sb,empresa,fila,pedido,item,ocorrencia,layout},lista);return;}
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
 async function reportar({sb,empresa,pedido,linha,item,quantidade,nome,aoSalvar}){
  const d=dialogo('Reportar problema');d.querySelector('[data-corpo]').innerHTML='<p>Carregando tipos de problema…</p>';
  try{
   const r=await sb.from('logistica_motivos').select('id,nome').eq('empresa_id',empresa).eq('etapa','separacao').eq('ativo',true).order('nome');if(r.error)throw r.error;
   const tipos=r.data||[];
   if(!tipos.length){d.querySelector('[data-corpo]').innerHTML='<p>Cadastre ou ative os tipos de problema em Parâmetros → Motivos → Tipos de problema da separação.</p>';return;}
   d.querySelector('[data-corpo]').innerHTML=`<p>${esc(nome)}</p><form class="so-report-form"><div class="so-report-col"><fieldset class="so-tipos"><legend>Tipo de problema</legend><div>${tipos.map(m=>`<label class="so-tipo"><input type="radio" name="motivo" value="${esc(m.id)}" required><span>${esc(m.nome)}</span></label>`).join('')}</div></fieldset><label>Quantidade afetada<input name="quantidade" type="number" min="0.001" step="any" max="${Number(quantidade)}" value="${Math.min(1,Number(quantidade))}" required></label></div><div class="so-report-col"><label>Observação<textarea name="observacao" maxlength="3000"></textarea></label><div class="so-anexo"><span class="so-anexo-titulo">Foto <small>opcional</small></span><input name="foto" type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Anexar foto do problema"><button type="button" class="so-anexo-escolher" data-escolher-foto><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m4 18 5-5 4 4 3-3 5 5M12 2v5M9.5 4.5h5"/></svg><span><strong>Anexar foto</strong><small>JPG, PNG ou WebP · até 5 MB</small></span><span class="so-anexo-mais" aria-hidden="true">+</span></button><div class="so-anexo-preview" hidden><img alt="Prévia da foto do problema"><div><strong data-foto-nome></strong><small data-foto-tamanho></small></div><button type="button" data-remover-foto aria-label="Remover foto" title="Remover foto">×</button></div><p class="so-anexo-erro" role="status"></p></div></div><p class="so-erro" role="status"></p><footer><button type="submit">Enviar para Gestão do Acervo</button></footer></form>`;
   const campoFoto=d.querySelector('[name=foto]'),escolherFoto=d.querySelector('[data-escolher-foto]'),previa=d.querySelector('.so-anexo-preview');
   let previaUrl=null;
   const limparPrevia=()=>{if(previaUrl)URL.revokeObjectURL(previaUrl);previaUrl=null;previa.querySelector('img').removeAttribute('src');};
   escolherFoto.onclick=()=>campoFoto.click();
   campoFoto.onchange=()=>{
    limparPrevia();const arquivo=campoFoto.files[0],erro=d.querySelector('.so-anexo-erro');erro.textContent='';
    if(arquivo&&(!['image/jpeg','image/png','image/webp'].includes(arquivo.type)||arquivo.size>5242880)){
     erro.textContent='Escolha uma foto JPG, PNG ou WebP de até 5 MB.';campoFoto.value='';
    }
    const foto=campoFoto.files[0];previa.hidden=!foto;escolherFoto.hidden=!!foto;
    if(foto){previaUrl=URL.createObjectURL(foto);previa.querySelector('img').src=previaUrl;d.querySelector('[data-foto-nome]').textContent=foto.name;d.querySelector('[data-foto-tamanho]').textContent=foto.size<1048576?Math.max(1,Math.round(foto.size/1024))+' KB':(foto.size/1048576).toLocaleString('pt-BR',{maximumFractionDigits:1})+' MB';}
   };
   d.querySelector('[data-remover-foto]').onclick=()=>{campoFoto.value='';campoFoto.onchange();escolherFoto.focus();};
   d.addEventListener('close',limparPrevia,{once:true});
   d.querySelector('form').onsubmit=async ev=>{
    ev.preventDefault();const f=ev.currentTarget,b=f.querySelector('[type=submit]');b.disabled=true;
    try{
     const foto=f.elements.foto.files[0];let caminho=null;
     if(foto){if(!['image/jpeg','image/png','image/webp'].includes(foto.type)||foto.size>5242880)throw Error('Escolha uma foto JPG, PNG ou WebP de até 5 MB.');
      caminho=empresa+'/'+crypto.randomUUID()+'.'+({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[foto.type]);
      const up=await sb.storage.from('separacao-ocorrencias').upload(caminho,foto,{contentType:foto.type,upsert:false});if(up.error)throw up.error;
     }
     await rpc(sb,'separacao_ocorrencia_criar',{p_empresa:empresa,p_pedido:pedido,p_linha:linha,p_item:item,p_motivo:f.elements.motivo.value,p_quantidade:Number(f.elements.quantidade.value),p_observacao:f.elements.observacao.value,p_foto:caminho});
     d.close();window.alerta?.('Problema enviado à Gestão do Acervo.','Ocorrência registrada','sucesso');aoSalvar?.();document.dispatchEvent(new CustomEvent('separacao-ocorrencias-atualizadas'));
    }catch(e){d.querySelector('.so-erro').textContent=e.message;}finally{b.disabled=false;}
   };
  }catch(e){d.querySelector('[data-corpo]').innerHTML=`<p class="so-erro">${esc(e.message)}</p>`;}
 }
 async function sinalizar({sb,empresa,pedido,host}){
  host.dataset.soPedido=pedido;
  try{const lista=await listar(sb,empresa,pedido);if(!host.isConnected||host.dataset.soPedido!==pedido)return;
   host.querySelectorAll('[data-so-item]').forEach(el=>{const abertas=lista.filter(o=>o.item_id===el.dataset.soItem&&o.estado!=='resolvida');const l=abertas.filter(o=>o.estado!=='triagem');el.textContent=l.length?estados[l[0].estado]+(l.length>1?` · ${l.length} problemas`:''):'';/* nov/2026: o botão de acompanhar só aparece no item com problema aberto, piscando em vermelho */const bt=el.parentElement?.querySelector('[data-ver-ocorrencias]');if(bt){bt.hidden=!abertas.length;bt.classList.toggle('is-ativo',!!abertas.length);}});
  }catch(e){console.warn('Ocorrências da separação:',e.message);}
 }
 function abrirPainel(opcoes){
  const d=dialogo('Ocorrências da separação');d.classList.add('so-dialog-tabela');
  const rodape=document.createElement('footer');rodape.className='so-dialog-rodape';
  const fechar=d.querySelector('[data-fechar]');fechar.textContent='Fechar';rodape.append(fechar);d.append(rodape);
  const host=d.querySelector('[data-corpo]');painel({...opcoes,host});
  let carregando=false;
  const timer=setInterval(async()=>{
   if(carregando||!d.open||document.hidden)return;carregando=true;
   try{
    const lista=await listar(opcoes.sb,opcoes.empresa,opcoes.pedido||null);if(!d.open)return;
    host.querySelectorAll('.so-detalhe').forEach(sec=>{
     const o=lista.find(o=>o.id===sec.dataset.ocorrencia);if(!o)return;
     const log=sec.querySelector('.so-chat-mensagens'),html=conversa(o,opcoes.sb,opcoes.empresa);
     if(log.innerHTML!==html){const fim=log.scrollHeight-log.scrollTop-log.clientHeight<60;log.innerHTML=html;log.querySelectorAll('.so-avatar img').forEach(img=>img.onerror=()=>img.remove());if(fim)log.scrollTop=log.scrollHeight;}
     const estado=sec.querySelector('.so-estado');estado.dataset.estado=o.estado;estado.textContent=estados[o.estado];
     const form=sec.querySelector('.so-chat-form');if(form){form.querySelector('textarea').disabled=o.estado==='resolvida';form.querySelector('[type=submit]').disabled=o.estado==='resolvida';}
    });
   }catch{/* Uma falha temporária de rede não apaga a mensagem em edição. */}finally{carregando=false;}
  },10000);
  d.addEventListener('close',()=>clearInterval(timer),{once:true});return d;
 }
 window.SeparacaoOcorrencias={reportar,painel,abrirPainel,sinalizar};
 document.addEventListener('click',async ev=>{if(!ev.target.closest('[data-ocorrencias-comercial]'))return;
  try{const ctx=await window.aguardarContexto();abrirPainel({sb:window.supabaseClient,empresa:ctx.empresa_id,fila:'comercial'});}catch(e){window.alerta?.(e.message,'Ocorrências','erro');}
 });
})();
