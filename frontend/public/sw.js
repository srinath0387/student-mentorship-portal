/* RGMCET service worker — shows push notifications and opens the app when one is tapped. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'RGMCET', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'RGMCET';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/rgmcet-crest.png',
    badge: '/rgmcet-crest.png',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || '/';
  const target = new URL('/#' + (path.startsWith('/') ? path : '/' + path), self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus();
        return w.navigate(target).catch(() => undefined);
      }
    }
    return self.clients.openWindow(target);
  })());
});
