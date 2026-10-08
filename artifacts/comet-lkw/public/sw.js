self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "Neue Benachrichtigung" };
  }

  const title = data.title || "COMET LKW";
  const options = {
    body: data.message || data.body || "",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    tag: data.tag || "comet-notification",
    data: { url: data.linkTo || data.url || "/" },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(url);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(clients.claim()));

// Never serve the app shell or version identity from the browser HTTP cache.
// Hashed JS/CSS retain their normal caching; APIs and push handlers are untouched.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  if (event.request.mode === "navigate" || url.pathname.endsWith("/build-info.json")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
  }
});
