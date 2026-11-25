(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const campos={montagem:'Entrega e relato do evento',acessos:'Acessos e dificuldades',desmontagem:'Orientações para desmontagem',cuidados:'Cuidados com os itens',ocorrencias:'Ocorrências e comentários do decorador',melhorias:'Melhorias para próximos eventos',pendencias:'Pendências'};
 const resumoHtml=(r,e=esc)=>Object.entries(campos).map(([k,label])=>`<p><strong>${label}</strong><br>${e(r[k])}</p>`).join('');
 let geracao=0;
 function limpar(){
  geracao++;
  const host=document.getElementById('etapaAssistenteIa');
  if(host)window.EasyLocAssistenteSolicitacao?.desmontar(host);
  host?.remove();
 }
 async function montar(etapa,token){
  limpar();const g=geracao;
  if(!['montagem','desmontagem'].includes(etapa.operacao))return;
  const host=document.createElement('section');host.id='etapaAssistenteIa';host.className='mont-ia-chat';host.dataset.etapa=etapa.id;
  document.getElementById('telaEtapa').append(host);
  const sb=window.supabaseClient;
  async function carregar(){
   try{
    const r=await sb.rpc('mont_assistente_contexto',{p_token:token,p_etapa:etapa.id});
    if(g!==geracao||!host.isConnected)return;
    if(r.error)throw r.error;
    const c=r.data;if(!c?.empresa_id)throw Error('Não foi possível identificar o evento.');
    const relatos=c.relatos||[];let relato=relatos.find(r=>r.etapa_id===etapa.id),versao=relato?.atualizado_em||null;
    const montagem=c.etapa==='montagem',mensagensLeitura=[];
    if(!montagem){
     mensagensLeitura.push({papel:'ia',texto:relatos.length?'Estas são as orientações registradas pela equipe que montou este evento.':'A equipe ainda não registrou orientações para este evento.'});
     for(const registro of relatos){
      mensagensLeitura.push({papel:'ia',autor:registro.autor,texto:Object.entries(campos).map(([k,label])=>label+':\n'+(registro.resumo[k]||'Não informado')).join('\n\n'),em:registro.atualizado_em});
      const fotos=[];for(const path of registro.fotos||[]){const f=await sb.storage.from('montagem-relatos').createSignedUrl(path,3600);if(!f.error)fotos.push(f.data.signedUrl);}
      if(fotos.length)mensagensLeitura.push({papel:'ia',fotos,texto:'Fotos registradas na montagem.'});
     }
    }
    if(g!==geracao||!host.isConnected)return;
    await window.EasyLocAssistenteSolicitacao.montarNaTela(host,{
     tipo:'montagem',titulo:`Auxiliar de logística · IA · Pedido ${c.pedido||etapa.pedido||''} · ${c.local||etapa.local||'Evento'}`,assistente:'Luísa',
     ctx:{empresa_id:c.empresa_id,usuario_id:c.usuario_id,usuario_nome:c.nome},chave:etapa.id,dados:{app_token:token,etapa_id:etapa.id},
     recomecar:false,somenteLeitura:!montagem,mensagens:montagem?undefined:mensagensLeitura,mensagensIniciais:relato?.conversa,
     placeholder:montagem?'Escreva sua mensagem…':'Orientações registradas na montagem',rotuloNova:'Continuar conversa',rotuloConfirmacao:'Está certo, salvar relato',
     saudacao:()=>relato?'O relato deste evento já está salvo. O que você quer acrescentar ou corrigir?':'Olá, sou a Luísa, sua auxiliar de logística. Todos os itens foram entregues completos e em perfeitas condições?',
     resumoHtml:(r,e)=>'<h3>Confira o relato do evento</h3>'+resumoHtml(r,e),
     enviarFoto:async(blob,path)=>{const bucket=sb.storage.from('montagem-relatos'),u=await bucket.upload(path,blob,{contentType:'image/jpeg',upsert:false});if(u.error)throw u.error;const f=await bucket.createSignedUrl(path,86400);if(f.error)throw f.error;return f.data.signedUrl;},
     confirmar:async(resumo,fotos,{mensagens})=>{
      const novas=fotos.map(f=>{const u=new URL(f),prefix='/storage/v1/object/sign/montagem-relatos/';if(!u.pathname.startsWith(prefix))throw Error('Foto inválida');return decodeURIComponent(u.pathname.slice(prefix.length));});
      const r=await sb.rpc('mont_assistente_salvar',{p_token:token,p_etapa:etapa.id,p_resumo:resumo,p_conversa:mensagens,p_fotos:[...new Set([...(relato?.fotos||[]),...novas])],p_versao:versao});
      if(r.error)throw r.error;versao=r.data.atualizado_em;relato=r.data;
      return 'Relato do evento salvo. As informações ficam vinculadas ao pedido para a logística e a equipe de desmontagem.';
     }
    });
   }catch(e){
    if(g!==geracao||!host.isConnected)return;
    host.innerHTML='<div class="mont-ia-erro"><h3>Luísa · Logística</h3><p>'+esc(e.message||'Não foi possível abrir a conversa.')+'</p><button type="button" class="btn btn-claro">Tentar novamente</button></div>';
    host.querySelector('button').onclick=carregar;
   }
  }
  await carregar();
 }
 window.MontagemAssistente={montar,limpar};
})();
