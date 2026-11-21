(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const campos={montagem:'Como foi a montagem',acessos:'Acessos e logística',desmontagem:'Orientações para desmontagem',cuidados:'Cuidados com os itens',ocorrencias:'Ocorrências',melhorias:'Melhorias para próximos eventos',pendencias:'Pendências'};
 const resumoHtml=(r,e=esc)=>Object.entries(campos).map(([k,label])=>`<p><strong>${label}</strong><br>${e(r[k])}</p>`).join('');
 let geracao=0;
 async function montar(etapa,token){
  const g=++geracao;document.getElementById('etapaAssistenteIa')?.remove();
  if(!['montagem','desmontagem'].includes(etapa.operacao))return;
  const host=document.createElement('section');host.id='etapaAssistenteIa';host.className='mont-ia-card';document.getElementById('telaEtapa').append(host);
  const sb=window.supabaseClient;
  async function carregar(){
   const r=await sb.rpc('mont_assistente_contexto',{p_token:token,p_etapa:etapa.id});if(g!==geracao||!host.isConnected)return;
   if(r.error){host.innerHTML=`<h3>Memória da montagem</h3><p>${esc(r.error.message)}</p><button type="button" data-recarregar>Tentar novamente</button>`;host.querySelector('button').onclick=carregar;return;}
   const c=r.data,relato=c.relatos.find(r=>r.etapa_id===etapa.id),montagem=c.etapa==='montagem';
   host.innerHTML=`<header><div><h3>${montagem?'Assistente de montagem':'Orientações da montagem'}</h3><p>${montagem?'Registre o que a próxima equipe precisa saber e o que podemos melhorar.':'Informações revisadas pela equipe que montou este evento.'}</p></div>${montagem?'<button type="button" class="btn" data-chat-montagem>'+ (relato?'Complementar relato':'Conversar com a IA')+'</button>':''}</header><div data-relatos>${c.relatos.length?c.relatos.map((r,i)=>`<details ${montagem?'':'open'}><summary>Relato de ${esc(r.autor)} · ${esc(new Date(r.atualizado_em).toLocaleString('pt-BR'))}</summary><div class="mont-ia-resumo">${resumoHtml(r.resumo)}<div class="mont-ia-fotos" data-fotos-relato="${i}"></div></div></details>`).join(''):'<p class="mont-ia-vazio">A equipe ainda não registrou orientações da montagem.</p>'}</div>`;
   await Promise.all(c.relatos.map(async(r,i)=>{const alvo=host.querySelector(`[data-fotos-relato="${i}"]`);for(const path of r.fotos||[]){const f=await sb.storage.from('montagem-relatos').createSignedUrl(path,3600);if(f.error||!alvo.isConnected)continue;const b=document.createElement('button');b.type='button';b.innerHTML=`<img src="${esc(f.data.signedUrl)}" alt="Registro da montagem">`;b.onclick=()=>{const d=document.createElement('dialog');d.className='mont-ia-preview';d.innerHTML=`<button type="button" aria-label="Fechar">×</button><img src="${esc(f.data.signedUrl)}" alt="Registro da montagem">`;d.querySelector('button').onclick=()=>d.close();d.onclose=()=>d.remove();document.body.append(d);d.showModal();};alvo.append(b);}}));
   host.querySelector('[data-chat-montagem]')?.addEventListener('click',()=>abrir(c,relato).catch(e=>window.alerta?.(e.message,'Assistente de montagem','erro')));
  }
  async function abrir(c,relato){
   let versao=relato?.atualizado_em||null;
   await window.EasyLocAssistenteSolicitacao.abrir({tipo:'montagem',titulo:`Pedido ${c.pedido} · ${c.local||'Montagem'}`,assistente:'Assistente de montagem · IA',ctx:{empresa_id:c.empresa_id,usuario_id:c.usuario_id,usuario_nome:c.nome},chave:etapa.id+':'+(versao||'novo'),dados:{app_token:token,etapa_id:etapa.id},
    saudacao:()=>relato?'Vamos complementar o relato deste evento. O que mudou ou precisa ficar mais claro para a desmontagem?':'Vou ajudar a deixar as orientações para quem fará a desmontagem e reunir melhorias para os próximos eventos. O que foi mais importante ou difícil na montagem de hoje?',
    resumoHtml:(r,e)=>'<h3>Confira o relato do evento</h3>'+resumoHtml(r,e),
    enviarFoto:async(blob,path)=>{const bucket=sb.storage.from('montagem-relatos'),u=await bucket.upload(path,blob,{contentType:'image/jpeg',upsert:false});if(u.error)throw u.error;const f=await bucket.createSignedUrl(path,86400);if(f.error)throw f.error;return f.data.signedUrl;},
    confirmar:async(resumo,fotos,{mensagens})=>{
     const novas=fotos.map(f=>{const u=new URL(f),prefix='/storage/v1/object/sign/montagem-relatos/';if(!u.pathname.startsWith(prefix))throw Error('Foto inválida');return decodeURIComponent(u.pathname.slice(prefix.length));});
     const r=await sb.rpc('mont_assistente_salvar',{p_token:token,p_etapa:etapa.id,p_resumo:resumo,p_conversa:mensagens,p_fotos:[...new Set([...(relato?.fotos||[]),...novas])],p_versao:versao});if(r.error)throw r.error;versao=r.data.atualizado_em;relato=r.data;await carregar();return 'Relato salvo. A equipe de desmontagem poderá consultar as orientações e fotos neste evento.';
    }
   });
  }
  await carregar();
 }
 window.MontagemAssistente={montar,limpar(){geracao++;document.getElementById('etapaAssistenteIa')?.remove();}};
})();
