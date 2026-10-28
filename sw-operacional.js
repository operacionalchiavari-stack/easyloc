const CACHE='acervo-operacao-estatica-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll([new URL('Modulos/Logistica/PainelLogistico/painel-logistico.html',self.registration.scope).href]))));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{if(event.data?.tipo==='preparar')event.waitUntil((async()=>{const c=await caches.open(CACHE);for(const url of event.data.urls||[]){const u=new URL(url,self.location.origin);if(u.origin!==self.location.origin&&!u.href.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'))continue;try{await c.add(u.href);}catch{}}event.source?.postMessage({tipo:'operacao-offline-preparada'});})());});
self.addEventListener('fetch',event=>{
 const r=event.request,u=new URL(r.url),sdk=u.href.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');if(r.method!=='GET'||(!sdk&&(u.origin!==self.location.origin||!(/\.(html|js|mjs|css|woff2?|png|jpg|svg)$/.test(u.pathname))))||/\/api\/|\/server\/|\.env|\/\.backups\//.test(u.pathname))return;
 event.respondWith(fetch(r).then(async res=>{if(res.ok){const c=await caches.open(CACHE);await c.put(r,res.clone());}return res;}).catch(async()=>{const c=await caches.open(CACHE);return await c.match(r)||await c.match(u.pathname)||Response.error();}));
});
