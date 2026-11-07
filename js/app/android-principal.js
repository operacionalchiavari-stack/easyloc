/* Ativa a migração somente quando a distribuição definitiva estiver pronta. */
(async function(){
 'use strict';
 if(!/android/i.test(navigator.userAgent||'')||window.top!==window)return;
 const script=document.currentScript?.src;if(!script)return;
 const base=new URL('../../',script);
 try{
  const response=await fetch(new URL('downloads/chiavari-android.json',base),{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!response.ok)return;
  const version=await response.json();if(!version.ready||!version.notificationsReady)return;
  document.querySelectorAll('link[rel="manifest"]').forEach(el=>el.remove());
  if(!window.AcervoAndroid?.postMessage){location.replace(new URL('instalar.html',base));return;}
  window.addEventListener('acervo:app',event=>{
   if(Number(event.detail?.versionCode)>=Number(version.versionCode)||document.getElementById('chiavariAtualizar'))return;
   const link=document.createElement('a');link.id='chiavariAtualizar';link.textContent='Nova versão do Chiavari disponível · Atualizar';link.href=new URL('instalar.html',base);link.style.cssText='position:fixed;bottom:16px;left:16px;z-index:3000;padding:14px;border-radius:12px;background:#383932;color:#fff;font:14px system-ui;box-shadow:0 4px 18px #0003';document.body.append(link);
  },{once:true});
  window.AcervoAndroid.postMessage(JSON.stringify({action:'app:info'}));
 }catch(_){/* O app atual continua acessível se a consulta de versão falhar. */}
})();
