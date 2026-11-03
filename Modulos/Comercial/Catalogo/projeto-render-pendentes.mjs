// Confirmações pendentes sobrevivem a recarregamentos e falhas de conexão.
const abrir = () => new Promise((resolve,reject) => {
  const req=indexedDB.open('acervo-renderizacoes',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('pendentes',{keyPath:'chave'});
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});
async function transacao(modo,acao){
  const db=await abrir();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('pendentes',modo),req=acao(tx.objectStore('pendentes'));
    tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
export const guardarRenderPendente = registro => transacao('readwrite',store=>store.put(structuredClone(registro)));
export const removerRenderPendente = chave => transacao('readwrite',store=>store.delete(chave));
export const listarRendersPendentes = async prefixo => (await transacao('readonly',store=>store.getAll())).filter(r=>r.chave.startsWith(prefixo));
