// Branch Log service worker — v3
// Enables offline caching (basic) and lets the app show real system notifications
// via swRegistration.showNotification(...), triggered locally when Firestore data
// changes — no external push server required. Works as long as the browser/app
// stays open or was recently backgrounded (not force-closed for a long period).
//
// IMPORTANT: bump the version number in the comment above (v3, v4, v5...) every time
// this file OR index.html changes. Browsers only re-check a service worker file when
// its bytes differ from what's cached — an unchanged file (even with new index.html
// elsewhere) can cause the browser to skip re-fetching it, which stalls app updates.

self.addEventListener('install', (event) => {
  self.skipWaiting(); // activate the new version immediately, don't wait for old tabs to close
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
