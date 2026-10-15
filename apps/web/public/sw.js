/* Atlas service worker: shows desktop notifications pushed by the API and opens their link on click.
   It holds no session data; the push payload is { id, title, body, link, tag }. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil((async () => {
    // While Atlas is the active window the bell already shows it; Chrome allows skipping the pop-up then.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (data.tag !== 'test' && windows.some((client) => client.focused)) return;
    await self.registration.showNotification(data.title || 'Atlas', {
      body: data.body || '', tag: data.tag || data.id, renotify: Boolean(data.tag),
      icon: '/notification-icon.png', badge: '/notification-icon.png', data: { link: data.link || '/' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.link) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const atlas = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (atlas) {
      await atlas.focus();
      if ('navigate' in atlas) return atlas.navigate(url);
      return undefined;
    }
    return self.clients.openWindow(url);
  })());
});
