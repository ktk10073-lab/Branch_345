importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
// Branch Log service worker — v5 (adds OneSignal real push, merged with existing worker)
// No Firebase Cloud Messaging here — FCM push requires the Blaze plan, which this
// project isn't on. Instead this adds Periodic Background Sync: a free, best-effort
// API that occasionally wakes this service worker (commonly every few hours, browser-
// controlled, Chrome/Android installed-PWA only) to check Firestore and fire a local
// notification even if the app itself isn't open.
//
// HONEST LIMITS: this does NOT fire instantly, and it does NOT reliably fire while
// the screen is locked/asleep — only real push (Blaze + Cloud Functions + FCM) closes
// that gap completely. This is a partial mitigation, not a fix.
//
// IMPORTANT: bump the version number in the comment above every time this file OR
// index.html changes, or the browser may skip re-fetching it and updates will stall.

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAR6JDl8RBBL-MG6r-eaznQLWy8EMXQrWA",
  authDomain: "branch-log.firebaseapp.com",
  projectId: "branch-log",
  storageBucket: "branch-log.firebasestorage.app",
  messagingSenderId: "1022958210752",
  appId: "1:1022958210752:web:1ceeb353c1e1976f66a725",
  measurementId: "G-RJWVLH05RW"
};

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

// Fires occasionally (browser's discretion) even if the app isn't open in a tab.
// Reads branchId/currentUserId that index.html mirrors into IndexedDB via
// syncCreds below, does a plain REST read of Firestore (no SDK needed in the
// worker), and raises a local notification for anything new.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'branch-log-check') {
    event.waitUntil(checkForUpdates());
  }
});

function idbGet(key) {
  return new Promise((resolve) => {
    const req = indexedDB.open('branch-log-sw', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', 'readonly');
      const getReq = tx.objectStore('kv').get(key);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}

// NOTE: this plain REST fetch has no auth token, so it only works if your Firestore
// security rules allow read access to branches/{branchId}/notifications without
// sign-in. If your rules require auth, this fetch will fail silently (caught below)
// and periodic checks simply won't find anything — the rest of the app is unaffected.
async function checkForUpdates() {
  try {
    const branchId = await idbGet('branchId');
    const userId = await idbGet('currentUserId');
    const lastCheck = (await idbGet('lastPeriodicCheck')) || 0;
    if (!branchId || !userId) return;

    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/branches/${branchId}/notifications`;
    const resp = await fetch(url);
    if (!resp.ok) return;
    const json = await resp.json();
    const docs = json.documents || [];

    const fresh = docs.filter(d => {
      const fields = d.fields || {};
      const createdAtIso = fields.createdAt?.timestampValue;
      const createdAtMs = createdAtIso ? new Date(createdAtIso).getTime() : 0;
      const targets = (fields.targets?.arrayValue?.values || []).map(v => v.stringValue);
      return createdAtMs > lastCheck && targets.includes(userId);
    });

    fresh.forEach(d => {
      const fields = d.fields || {};
      const message = fields.message?.stringValue || '';
      self.registration.showNotification('📢 Branch Log', {
        body: message,
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        vibrate: [300, 100, 300, 100, 300],
        tag: 'branch-log-periodic-' + Date.now(),
        requireInteraction: true
      });
    });

    // Update lastPeriodicCheck
    const dbReq = indexedDB.open('branch-log-sw', 1);
    dbReq.onsuccess = () => {
      const tx = dbReq.result.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(Date.now(), 'lastPeriodicCheck');
    };
  } catch (e) {
    console.warn('Periodic check failed', e);
  }
}
