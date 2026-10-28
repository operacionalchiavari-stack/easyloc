(function(){'use strict';
 if(window.__acervoMonitor)return;window.__acervoMonitor=true;
 const vistos=new Map();let quantidade=0,inicio=Date.now();
 function limpar(v){return String(v||'Erro inesperado').replace(/Bearer\s+\S+/gi,'[credencial]').replace(/eyJ[A-Za-z0-9_.-]+/g,'[credencial]').replace(/https?:\/\/\S+/g,'[endereço]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').slice(0,300);}
 async function registrar(mensagem){try{
  if(!navigator.onLine)return;if(Date.now()-inicio>60000){inicio=Date.now();quantidade=0;}if(quantidade>=5)return;
  const sb=window.supabaseClient,ctx=window.__CONTEXT;if(!sb||!ctx?.empresa_id)return;
  const texto=limpar(mensagem),agora=Date.now();if(agora-(vistos.get(texto)||0)<300000)return;vistos.set(texto,agora);quantidade++;
  await sb.rpc('sistema_erro_registrar',{p_empresa:ctx.empresa_id,p_pagina:location.pathname.slice(0,200),p_mensagem:texto});
 }catch{}}
 window.addEventListener('error',e=>{if(e.message&&e.message!=='Script error.')registrar(e.message);});
 window.addEventListener('unhandledrejection',e=>registrar(e.reason?.message||'Operação inesperadamente interrompida'));
})();
