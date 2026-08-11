// Branch Log service worker
// Enables offline caching (basic) and lets the app show real system notifications
// via swRegistration.showNotification(...), triggered locally when Firestore data
// changes — no external push server required. Works as long as the browser/app
// stays open or was recently backgrounded (not force-closed for a long period).

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Tapping a notification focuses the app if it's already open, or opens it fresh.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});
