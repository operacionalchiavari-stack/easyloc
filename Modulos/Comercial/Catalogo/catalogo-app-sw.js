// Service worker do app do catálogo (PWA). Rede primeiro, sempre (nunca serve versão velha quando há internet); o cache
// só existe pra o app abrir sem rede/instável. Só guarda arquivos do próprio site — nada do Supabase (dados e fotos).
const CACHE = "catalogo-app-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if(req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if(res.ok){ const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: false }).then((r) => r || caches.match(req, { ignoreSearch: true }))));
});
