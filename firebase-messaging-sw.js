// firebase-messaging-sw.js — Pause4Paws
// Upload to root of GitHub repo (same folder as index.html)
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

// Fires when push arrives and app is in background / closed
messaging.onBackgroundMessage(payload => {
  const d = payload.data || {};
  self.registration.showNotification(d.title || '🐾 Pause4Paws', {
    body:    d.body  || 'New pet alert in your community.',
    icon:    '/pause4paws/pause4paws_logo.png',
    badge:   '/pause4paws/pause4paws_logo.png',
    image:   d.image || undefined,
    data:    { url: d.url || 'https://pause4paws.github.io/pause4paws/', petId: d.petId },
    vibrate: [200, 100, 200],
    requireInteraction: true
  });
});

// Tap notification → open app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || 'https://pause4paws.github.io/pause4paws/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('pause4paws') && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
