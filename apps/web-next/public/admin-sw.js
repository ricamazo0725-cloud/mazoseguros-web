// Service worker del admin de Mazoseguros: recibe los avisos push y abre la
// conversación al tocarlos. Solo controla /admin (scope), el sitio público no se toca.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Mazoseguros", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Mazoseguros";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/admin-icons/icon-192.png",
      badge: "/admin-icons/badge-96.png",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/admin" },
      vibrate: [120, 60, 120],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/admin", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if (client.url.includes("/admin") && "focus" in client) {
          await client.focus();
          client.postMessage({ type: "open-url", url });
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
