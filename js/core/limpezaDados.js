// Reinicializacao autorizada: descarta rascunhos e filas anteriores sem apagar o login.
(function(){
 const versao='20261026-zerado',chave='easyloc:limpeza-dados';
 window.__limpezaDadosPronta=(async()=>{
  if(localStorage.getItem(chave)===versao)return;
  for(const k of Object.keys(localStorage))if(!/^sb-.*-auth-token(?:\.|$)/.test(k))localStorage.removeItem(k);
  for(const nome of ['acervo-studio-projects','acervo-operacao-v1'])await new Promise(resolve=>{
   const request=indexedDB.open(nome);
   request.onerror=()=>resolve();
   request.onsuccess=()=>{const db=request.result,lojas=[...db.objectStoreNames];if(!lojas.length){db.close();resolve();return;}
    const tx=db.transaction(lojas,'readwrite');for(const loja of lojas)tx.objectStore(loja).clear();
    tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();resolve();};};
  });
  if('caches'in window)for(const k of await caches.keys())await caches.delete(k);
  if(navigator.serviceWorker)for(const registration of await navigator.serviceWorker.getRegistrations())await registration.unregister();
  localStorage.setItem(chave,versao);
 })();
})();
