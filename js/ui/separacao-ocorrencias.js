(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const estados={acervo:'Aguardando Gestão do Acervo',comercial:'Aguardando Comercial',triagem:'Solução disponível · confirmar na Triagem',resolvida:'Resolvida'};
 async function rpc(sb,n,args){const r=await sb.rpc(n,args);if(r.error)throw Error(r.error.message);return r.data;}
 function dialogo(titulo){
  const d=document.createElement('dialog');d.className='so-dialog';d.innerHTML=`<header><h2>${esc(titulo)}</h2><button type="button" data-fechar aria-label="Fechar">×</button></header><div data-corpo></div>`;
  document.body.append(d);d.querySelector('[data-fechar]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());d.showModal();return d;
 }
 function fotoItem(o){
  try{const u=new URL(o.item_foto);if(!['http:','https:'].includes(u.protocol))return '';return `<button type="button" data-foto-item aria-label="Ampliar foto de ${esc(o.item_nome)}"><img src="${esc(u.href)}" alt="${esc(o.item_nome)}" loading="lazy"></button>`;}catch{return '';}
 }
 function respostaEstoque(o){
  const historico=o.historico||[],estoque=historico.filter(h=>h.anterior==='acervo').at(-1),comercial=historico.filter(h=>h.anterior==='comercial').at(-1);
  const mensagem=(h,titulo)=>h?`<div class="so-resposta"><small>${titulo} · ${esc(new Date(h.em).toLocaleString('pt-BR'))}</small><p>${esc(h.texto)}</p></div>`:'';
  return (mensagem(estoque,'Estoque')||'<span class="so-sem-resposta">Aguardando resposta do Estoque</span>')+mensagem(comercial,'Comercial');
 }
 async function listar(sb,empresa,pedido=null){return await rpc(sb,'separacao_ocorrencias_listar',{p_empresa:empresa,p_pedido:pedido})||[];}
 async function painel({host,sb,empresa,fila='acervo',pedido=null,item=null}){
  host.innerHTML='<p role="status">Carregando ocorrências…</p>';
  try{
   const todas=await listar(sb,empresa,pedido);
   const lista=todas.filter(o=>(!item||o.item_id===item)&&(fila==='triagem'||o.estado===fila));
   const badge=document.querySelector(`[data-aba="ocorrencias"] .tab-badge`);if(badge)badge.textContent=todas.filter(o=>o.estado==='acervo').length||'';
   host.innerHTML=`<div class="so-painel">${host.closest("dialog")?'':'<div class="so-painel-topo"><h3>Ocorrências da separação</h3></div>'}${fila==='comercial'?'<p class="so-ajuda">Negocie a solução com o cliente. Verifique substituição, disponibilidade em outros pedidos ou sublocação. Para alterar os itens, solicite à Triagem a liberação para o Comercial. Registre a solução para a Triagem confirmar o recebimento.</p>':''}<div class="so-table-wrap" tabindex="0" role="region" aria-label="Ocorrências da separação"><table class="so-table"><thead><tr><th scope="col">Foto</th><th scope="col">Item</th><th scope="col">Pedido / Cliente</th><th scope="col">Problema enviado pela Triagem</th><th scope="col">Resposta do Estoque</th><th scope="col">Qtd.</th><th scope="col">Situação</th></tr></thead><tbody>${lista.map(o=>`<tr data-ocorrencia="${esc(o.id)}" data-so-linha tabindex="0" aria-selected="false"><td><div class="so-item-foto">${fotoItem(o)}<span>Sem foto</span></div></td><td class="so-item-col"><strong>${esc(o.item_nome)}</strong>${o.codigo?`<small>${esc(o.codigo)}</small>`:''}</td><td><strong>Pedido ${esc(o.pedido_numero)}</strong><small>${esc(o.cliente)}</small></td><td class="so-problema-col"><strong>${esc(o.motivo_nome)}</strong>${o.observacao?`<p>${esc(o.observacao)}</p>`:''}${o.foto_path?'<button type="button" data-foto>Foto do problema</button>':''}</td><td class="so-resposta-col">${respostaEstoque(o)}</td><td class="so-qtd-col">${esc(o.quantidade)}</td><td><span class="so-estado" data-estado="${esc(o.estado)}">${estados[o.estado]}</span></td></tr>`).join('')||'<tr><td colspan="7" class="so-vazio">Nenhuma ocorrência nesta fila.</td></tr>'}</tbody></table></div>${lista.some(o=>acoes(o,fila))?`<footer class="so-painel-rodape">${lista.length>1?'<p class="so-selecao-ajuda">Selecione uma linha para agir sobre a ocorrência.</p>':''}${lista.map(o=>`<div class="so-rodape-grupo" data-ocorrencia="${esc(o.id)}" data-so-grupo hidden><div class="so-acoes">${acoes(o,fila)||'<span class="so-sem-acao">Nenhuma ação disponível nesta etapa.</span>'}</div></div>`).join('')}</footer>`:''}<p class="so-erro" role="status"></p></div>`;
   const selecionar=id=>{
    host.querySelectorAll('[data-so-linha]').forEach(l=>l.setAttribute('aria-selected',String(l.dataset.ocorrencia===id)));
    host.querySelectorAll('[data-so-grupo]').forEach(g=>g.hidden=g.dataset.ocorrencia!==id);
   };
   selecionar((lista.find(o=>acoes(o,fila))||lista[0])?.id);
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
   host.querySelectorAll('[data-so-item]').forEach(el=>{const l=lista.filter(o=>o.item_id===el.dataset.soItem&&!['resolvida','triagem'].includes(o.estado));el.textContent=l.length?estados[l[0].estado]+(l.length>1?` · ${l.length} ocorrências`:''):'';});
  }catch(e){console.warn('Ocorrências da separação:',e.message);}
 }
 function abrirPainel(opcoes){const d=dialogo('Ocorrências da separação');d.classList.add('so-dialog-tabela');painel({...opcoes,host:d.querySelector('[data-corpo]')});return d;}
 window.SeparacaoOcorrencias={reportar,painel,abrirPainel,sinalizar};
 document.addEventListener('click',async ev=>{if(!ev.target.closest('[data-ocorrencias-comercial]'))return;
  try{const ctx=await window.aguardarContexto();abrirPainel({sb:window.supabaseClient,empresa:ctx.empresa_id,fila:'comercial'});}catch(e){window.alerta?.(e.message,'Ocorrências','erro');}
 });
})();
