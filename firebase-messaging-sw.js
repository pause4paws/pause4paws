// firebase-messaging-sw.js
// Place this file in the ROOT of your GitHub Pages repo
// (same folder as index.html)
// ─────────────────────────────────────────────────────

importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyCjEmse8_GdpIpopS5zVAvL-s3_J_YLmts",
  authDomain:        "pause4paws-82dca.firebaseapp.com",
  projectId:         "pause4paws-82dca",
  storageBucket:     "pause4paws-82dca.firebasestorage.app",
  messagingSenderId: "30091779526",
  appId:             "1:30091779526:web:71c2a9a7776127142ea6c7"
});

const messaging = firebase.messaging();

// ── BACKGROUND NOTIFICATIONS ──────────────────────────────────────────────
// Fires when a push arrives while the app is in the background or closed.
// The data payload comes from your Firestore trigger or manual send.
messaging.onBackgroundMessage(payload => {
  console.log('[FCM SW] Background message:', payload);

  const { title, body, icon, image, petId, url } = payload.data || {};

  const notificationTitle = title || '🐾 Pause4Paws';
  const notificationOptions = {
    body:  body  || 'A new pet alert in your community.',
    icon:  icon  || '/pause4paws/pause4paws_logo.png',
    badge: '/pause4paws/pause4paws_logo.png',
    image: image || undefined,   // large banner image if provided
    data:  { url: url || 'https://pause4paws.github.io/pause4paws/', petId },
    actions: [
      { action: 'view',    title: '👉 View on map' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    vibrate: [200, 100, 200],
    requireInteraction: true   // keeps notification visible until tapped
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// ── TAP HANDLER ───────────────────────────────────────────────────────────
// Opens the app (or focuses existing tab) when user taps the notification.
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url
    || 'https://pause4paws.github.io/pause4paws/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focus existing tab if open
      for (const client of clientList) {
        if (client.url.includes('pause4paws') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new tab
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
