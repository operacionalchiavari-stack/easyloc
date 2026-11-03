(function(){'use strict';
 const raizOperacao=new URL('../../',document.currentScript.src);
 const enc=new TextEncoder(),dec=new TextDecoder();let banco,sb,ctx,owner,chave,ocupado=false,resultados=new Map();
 const lojasOperacao=['chaves','cache','envios'];
 function abrirVersao(versao){return new Promise((ok,falha)=>{
  const r=versao?indexedDB.open('acervo-operacao-v1',versao):indexedDB.open('acervo-operacao-v1');
  r.onupgradeneeded=()=>{for(const nome of lojasOperacao)if(!r.result.objectStoreNames.contains(nome))r.result.createObjectStore(nome,{keyPath:'id'});};
  r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();ok(r.result);};r.onerror=()=>falha(r.error);
 });}
 async function abrir(){
  // Uma limpeza antiga podia criar este banco vazio na versão 1.
  // Cria apenas as lojas ausentes, preservando chaves e envios pendentes.
  for(let tentativa=0;tentativa<3;tentativa++){
   const db=await abrirVersao();if(lojasOperacao.every(nome=>db.objectStoreNames.contains(nome)))return db;
   const versao=db.version+1;db.close();
   try{return await abrirVersao(versao);}catch(e){if(e.name!=='VersionError')throw e;}
  }
  throw Error('Não foi possível preparar o armazenamento local. Feche as outras abas do sistema e tente novamente.');
 }
 const get=(loja,id)=>new Promise((ok,falha)=>{const r=banco.transaction(loja).objectStore(loja).get(id);r.onsuccess=()=>ok(r.result);r.onerror=()=>falha(r.error);});
 const todos=loja=>new Promise((ok,falha)=>{const r=banco.transaction(loja).objectStore(loja).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>falha(r.error);});
 const gravar=(loja,dado,remover=false)=>new Promise((ok,falha)=>{const t=banco.transaction(loja,'readwrite');remover?t.objectStore(loja).delete(dado):t.objectStore(loja).put(dado);t.oncomplete=ok;t.onerror=()=>falha(t.error);t.onabort=()=>falha(t.error||Error('Não foi possível guardar o registro neste dispositivo'));});
 async function cifrar(valor){const iv=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv},chave,enc.encode(JSON.stringify(valor)));return {iv,data};}
 async function lerCifra(dado){return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:dado.iv},chave,dado.data)));}
 async function cache(id,valor){if(!owner)return;await gravar('cache',{id:owner+':'+id,owner,...await cifrar(valor),em:Date.now()});}
 async function lerCache(id){if(!owner)return null;const d=await get('cache',owner+':'+id);return d?lerCifra(d):null;}
 async function lista(){return (await todos('envios')).filter(e=>e.owner===owner).sort((a,b)=>a.em-b.em);}
 function erroRede(e){return !navigator.onLine||/fetch|network|conex|rede|timeout|load failed/i.test(e?.message||'');}
 async function leitura(id,fn){try{if(!navigator.onLine)throw Error('Sem conexão');const valor=await fn();await cache(id,valor);return valor;}catch(e){if(!erroRede(e))throw e;const salvo=await lerCache(id);if(salvo===null)throw Error('Esta lista ainda não foi guardada neste dispositivo. Abra-a com internet antes de usar sem conexão.');return salvo;}}
 async function rpc(nome,args){const {data,error}=await sb.rpc(nome,args);if(error)throw Error(error.message);return data;}
 async function sincronizar(){
  if(ocupado||!navigator.onLine||!owner)return;ocupado=true;
  try{
   const {data:{session}}=await sb.auth.getSession();if(!session||session.user.id!==ctx.usuario_id)throw Error('Entre novamente com o usuário que registrou as conferências');
   for(const registro of await lista()){
    if(registro.estado==='revisar')continue;const payload=await lerCifra(registro);
    try{
     for(const e of payload.evidencias||[]){
      const path=ctx.empresa_id+'/'+payload.args.p_pedido+'/'+e.id+'.jpg',blob=await (await fetch(e.foto)).blob();
      const up=await sb.storage.from('evidencias-operacionais').upload(path,blob,{contentType:'image/jpeg',upsert:false});
      if(up.error&&!['409','Duplicate'].includes(String(up.error.statusCode||up.error.error)))throw Error(up.error.message);
      await rpc('logistica_evidencia_registrar',{p_id:e.id,p_empresa:ctx.empresa_id,p_pedido:payload.args.p_pedido,p_etapa:payload.args.p_etapa,p_chave:e.chave,p_path:path,p_descricao:e.descricao||''});
     }
     const resposta=await rpc('logistica_confirmacao_enviar',{p_id:registro.id,...payload.args});resultados.set(registro.id,resposta);
     await gravar('envios',registro.id,true);window.dispatchEvent(new CustomEvent('operacao:sincronizado',{detail:{pedido:payload.args.p_pedido}}));
    }catch(e){registro.erro=e.message;if(!erroRede(e))registro.estado='revisar';await gravar('envios',registro);if(erroRede(e))break;}
   }
  }catch(e){const host=document.getElementById('operacaoOfflineStatus');if(host)host.textContent=e.message;}
  finally{ocupado=false;await desenhar();}
 }
 async function confirmar(args,evidencias=[]){
  const existentes=await lista();for(const e of existentes){const p=await lerCifra(e);if(p.args.p_pedido===args.p_pedido&&p.args.p_etapa===args.p_etapa)throw Error('Já existe uma conferência local deste pedido. Revise a pendência antes de enviar outra.');}
  const id=crypto.randomUUID();await gravar('envios',{id,owner,em:Date.now(),estado:'pendente',...await cifrar({args,evidencias})});await desenhar();await sincronizar();
  const resposta=resultados.get(id);resultados.delete(id);return resposta?{resposta}:{pendente:true,id};
 }
 async function desenhar(){
  let host=document.getElementById('operacaoOffline');if(!host){host=document.createElement('section');host.id='operacaoOffline';host.style.cssText='margin:12px 0;padding:12px;border:1px solid #e6cf91;border-radius:10px;background:#fff8e4;font:13px Inter,sans-serif';(document.getElementById('ecMensagem')?.parentElement||document.body).prepend(host);}
  const registros=await lista();host.hidden=navigator.onLine&&!registros.length;host.replaceChildren();
  const titulo=document.createElement('strong');titulo.textContent=(navigator.onLine?'Conectado':'Sem internet')+' · '+registros.length+' conferência(s) guardada(s) neste dispositivo';host.append(titulo);
  const info=document.createElement('p');info.id='operacaoOfflineStatus';info.textContent=navigator.onLine?'Registros com conflito ficam guardados para revisão; não são enviados novamente automaticamente.':'As conferências serão enviadas quando a conexão voltar. Aguarde a confirmação de sincronização antes de limpar os dados do navegador.';host.append(info);
  const bt=document.createElement('button');bt.type='button';bt.textContent='Sincronizar pendências';bt.disabled=ocupado||!navigator.onLine;bt.onclick=sincronizar;host.append(bt);
  for(const r of registros){const p=await lerCifra(r),linha=document.createElement('details'),sum=document.createElement('summary');sum.textContent=p.args.p_etapa+' · '+new Date(r.em).toLocaleString('pt-BR')+' · '+(r.estado==='revisar'?'Revisão necessária':'Aguardando envio');linha.append(sum);
   const texto=document.createElement('p');texto.textContent=r.erro||'Salvo localmente, ainda sem confirmação do servidor.';linha.append(texto);
   const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;font-size:11px';pre.textContent=JSON.stringify(p.args.p_itens,null,2);linha.append(pre);
   const revisar=document.createElement('button');revisar.type='button';revisar.textContent='Abrir pedido para conferir';revisar.onclick=()=>window.EntregasColetas?.revisarPendencia(p.args);linha.append(revisar);
   const excluir=document.createElement('button');excluir.type='button';excluir.textContent='Descartar registro local';excluir.onclick=async()=>{if(confirm('Descartar esta conferência guardada neste dispositivo? Ela não será enviada.')){await gravar('envios',r.id,true);await desenhar();}};linha.append(excluir);host.append(linha);
  }
 }
 async function sessao(cliente){
  if(!navigator.onLine){try{const salva=JSON.parse(localStorage.getItem(cliente.auth.storageKey||'easyloc-auth')||'null');if(salva?.user?.id)return salva;}catch{}}
  return (await cliente.auth.getSession()).data?.session;
 }
 async function init(cliente,contexto){sb=cliente;const session=await sessao(sb);if(!session?.user?.id)throw Error('É necessário entrar antes de guardar conferências');
  ctx={empresa_id:contexto.empresa_id,usuario_id:session.user.id,usuario_nome:contexto.usuario_nome||''};owner=ctx.empresa_id+':'+ctx.usuario_id;banco=await abrir();
  const salva=await get('chaves',owner);chave=salva?.chave||await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);if(!salva)await gravar('chaves',{id:owner,chave});
  localStorage.setItem('acervo-contexto-offline',JSON.stringify(ctx));
  if(navigator.onLine&&window.EasyLocPermissions){const a=await window.EasyLocPermissions.load();if(a.active)await cache('acesso',{contexto:ctx,ativo:true,admin:a.legacyAdmin,permissoes:[...a.permissions],em:Date.now()});}
  window.addEventListener('online',sincronizar);window.addEventListener('offline',desenhar);await desenhar();
  if('serviceWorker' in navigator)navigator.serviceWorker.register(new URL('sw-operacional.js',raizOperacao)).then(()=>navigator.serviceWorker.ready).then(r=>r.active?.postMessage({tipo:'preparar',urls:[location.href,...[...document.scripts].map(s=>s.src),...[...document.querySelectorAll('link[rel=stylesheet]')].map(l=>l.href)].filter(Boolean)})).catch(()=>{});await sincronizar();return ctx;
 }
 async function contextoLocal(cliente){const session=await sessao(cliente),c=JSON.parse(localStorage.getItem('acervo-contexto-offline')||'null');if(!c||c.usuario_id!==session?.user?.id)throw Error('Abra a operação com internet e entre novamente antes de trabalhar sem conexão');return c;}
 async function acessoLocal(cliente,empresa){
  const c=await contextoLocal(cliente);if(c.empresa_id!==empresa)throw Error('Empresa diferente da operacao guardada');
  owner=c.empresa_id+':'+c.usuario_id;banco=await abrir();const k=await get('chaves',owner);if(!k)throw Error('Acesso offline nao preparado');chave=k.chave;
  const a=await lerCache('acesso');if(!a?.ativo||Date.now()-a.em>7*86400000)throw Error('Valide seu acesso com internet antes de continuar');return a;
 }
 window.OperacaoOffline={init,cache,lerCache,leitura,confirmar,sincronizar,contextoLocal,acessoLocal,sessao};
})();
