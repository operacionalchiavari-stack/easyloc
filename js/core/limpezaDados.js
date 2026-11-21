// Reinicializacao autorizada: descarta rascunhos e filas anteriores sem apagar o login.
(function(){
 const versao='20261026-zerado',chave='easyloc:limpeza-dados';
 window.__limpezaDadosPronta=(async()=>{
  if(localStorage.getItem(chave)===versao)return;
  // o login do sistema fica em 'easyloc-auth' (js/core/supabase.js); os apps de campo guardam a sessão própria
  const manter=k=>/^sb-.*-auth-token(?:\.|$)/.test(k)||k==='easyloc-auth'||k==='triagem-app-auth'||k==='uber_motorista_token'||k==='frete_freteiro_token'||k==='montadorToken'||k==='montadorTokenConta'||k==='montadorBonusToken'||k==='montadorBonusTokenConta'||k==='acervo_ultima_empresa';
  for(const k of Object.keys(localStorage))if(!manter(k))localStorage.removeItem(k);
  for(const nome of ['acervo-studio-projects','acervo-operacao-v1'])await new Promise(resolve=>{
   const request=indexedDB.open(nome);
   // Consultar um banco inexistente não deve deixá-lo criado sem suas lojas.
   request.onupgradeneeded=()=>{request.transaction.abort();};
   request.onerror=()=>resolve();
   request.onsuccess=()=>{const db=request.result,lojas=[...db.objectStoreNames];if(!lojas.length){db.close();resolve();return;}
    const tx=db.transaction(lojas,'readwrite');for(const loja of lojas)tx.objectStore(loja).clear();
    tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();resolve();};};
  });
  if('caches'in window)for(const k of await caches.keys())await caches.delete(k);
  // 20/11/2026: o serviço do app (app-sw.js, notificações) nunca é desligado aqui.
  if(navigator.serviceWorker)for(const registration of await navigator.serviceWorker.getRegistrations()){const url=(registration.active||registration.waiting||registration.installing||{}).scriptURL||'';if(!/app-sw\.js/.test(url))await registration.unregister();}
  localStorage.setItem(chave,versao);
 })();
})();
