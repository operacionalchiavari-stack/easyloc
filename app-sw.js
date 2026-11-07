/* Service worker do app da equipe (nov/2026): só notificações (Web Push). Recebe o aviso do servidor (Edge Function
   app-push) e mostra na barra do celular; tocar abre a tela do aviso (ex.: a etapa no App do Montador). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { corpo: event.data ? event.data.text() : "" }; }
  const titulo = d.titulo || "Acervo";
  event.waitUntil(self.registration.showNotification(titulo, {
    body: d.corpo || "",
    icon: "Modulos/Comercial/Catalogo/app-icone-192.png",
    badge: "Modulos/Comercial/Catalogo/app-icone-192.png",
    tag: d.tag || undefined,
    renotify: Boolean(d.tag),
    vibrate: [120, 60, 120],
    data: { url: new URL(d.url || "app.html", self.registration.scope).href },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const alvo = (event.notification.data && event.notification.data.url) || self.registration.scope + "app.html";
  event.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const j of janelas) {
      if (j.url.startsWith(self.registration.scope) && "navigate" in j) { await j.focus(); return j.navigate(alvo); }
    }
    return self.clients.openWindow(alvo);
  })());
});
