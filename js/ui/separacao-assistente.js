(function(){
 'use strict';
 async function abrir({sb,empresa,pedido,linha,item,nome,ctx,aoSalvar}){
  const r=await sb.rpc('separacao_assistente_contexto',{p_empresa:empresa,p_pedido:pedido,p_linha:linha,p_item:item});
  if(r.error)throw Error(r.error.message);
  const contexto=r.data;
  if(!contexto?.motivos?.length)throw Error('Cadastre os tipos de problema da separação em Parâmetros antes de reportar.');
  ctx=ctx||await window.aguardarContexto();
  const chave=[empresa,ctx.usuario_id,pedido,linha,item].join(':'),tokenKey='separacao_chat_envio:'+chave;
  const token=()=>{let t=sessionStorage.getItem(tokenKey);if(!t){t=crypto.randomUUID();sessionStorage.setItem(tokenKey,t);}return t;};
  const campos={problema:'O que aconteceu',quando_identificado:'Quando foi identificado',porque_agora:'Por que foi identificado agora',verificacoes:'Verificações realizadas',solucao_sugerida:'Solução sugerida pela equipe',pendencias:'Pendências para decisão'};
  return window.EasyLocAssistenteSolicitacao.abrir({
   tipo:'separacao',titulo:'Reportar problema · '+(nome||contexto.item),assistente:'Auxiliar de estoque · IA',ctx,chave,
   dados:{pedido_id:pedido,linha_id:linha,item_id:item},
   saudacao:()=>`Vamos entender o que aconteceu com ${nome||contexto.item}. Vou reunir as informações para a Gestão do Acervo, e você revisa tudo antes do envio. O que vocês encontraram e quantas unidades foram afetadas?`,
   resumoHtml:(v,esc)=>`<h3>Ocorrência para Gestão do Acervo</h3><p><strong>${esc(contexto.motivos.find(m=>m.id===v.motivo_id)?.nome||'Problema')} · ${esc(v.quantidade)} unidade(s)</strong></p>`+Object.entries(campos).map(([k,label])=>`<p><strong>${label}</strong><br>${esc(v[k])}</p>`).join('')+(v.sem_foto_motivo?`<p><strong>Foto pendente</strong><br>${esc(v.sem_foto_motivo)}</p>`:''),
   enviarFoto:async(blob,path)=>{const bucket=sb.storage.from('separacao-ocorrencias');const u=await bucket.upload(path,blob,{contentType:'image/jpeg',upsert:false});if(u.error)throw u.error;const f=await bucket.createSignedUrl(path,86400);if(f.error)throw f.error;return f.data.signedUrl;},
   aoRecomecar:()=>sessionStorage.removeItem(tokenKey),
   confirmar:async(resumo,fotos,{mensagens})=>{
    const paths=fotos.map(f=>{const u=new URL(f),prefix='/storage/v1/object/sign/separacao-ocorrencias/';if(!u.pathname.startsWith(prefix))throw Error('Foto inválida');const path=decodeURIComponent(u.pathname.slice(prefix.length));if(!path.startsWith(empresa+'/')||path.includes('..'))throw Error('Foto inválida');return path;});
    const motivo=contexto.motivos.find(m=>m.id===resumo.motivo_id);if((resumo.danificado||/danific|avaria|quebrad/i.test(motivo?.nome||''))&&(!paths.length||resumo.fotos_dano_claras!==true))throw Error('Anexe fotos que permitam entender o dano e esclare?a as d?vidas da assistente antes de enviar.');
    const salvar=await sb.rpc('separacao_ocorrencia_chat_criar',{p_empresa:empresa,p_pedido:pedido,p_linha:linha,p_item:item,p_chave:token(),p_resumo:resumo,p_mensagens:mensagens,p_fotos:[...new Set(paths)]});
    if(salvar.error)throw salvar.error;
    sessionStorage.removeItem(tokenKey);
    // 16/11/2026: peça danificada vai direto para o setor de manutenção escolhido aqui (com ajuda da IA, se precisar)
    let setorMsg='';
    if((resumo.danificado||/danific|avaria|quebrad/i.test(motivo?.nome||''))&&salvar.data&&window.EasyLocAvariaSetor){
     const setor=await window.EasyLocAvariaSetor.escolher({sb,empresa,item:resumo.item_nome||resumo.titulo||'',descricao:resumo.observacao||resumo.descricao||'',fotos,titulo:'Para qual setor de manutenção vai a peça?',cancelar:'Escolher depois'});
     if(setor){const os=await sb.rpc('acervo_avaria_separacao',{p_empresa:empresa,p_ocorrencia:salvar.data,p_setor:setor,p_descricao:resumo.observacao||resumo.descricao||null});
      if(os.error)setorMsg=' Não foi possível abrir a O.S: '+os.error.message;else setorMsg=' A peça foi enviada para '+setor+'.';}
    }
    document.dispatchEvent(new CustomEvent('separacao-ocorrencias-atualizadas'));
    try{await aoSalvar?.();}catch(e){console.warn('Ocorrência salva; atualização da tela pendente.',e);}
    return 'Ocorrência enviada para a Gestão do Acervo com o resumo, a conversa e as fotos anexadas.'+setorMsg;
   }
  });
 }
 window.SeparacaoAssistente={abrir};
})();
