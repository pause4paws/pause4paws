/*
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Pause4Paws — Firebase Messaging Service Worker              ║
 * ║  © 2025 Pause4Paws. All rights reserved.                     ║
 * ║                                                              ║
 * ║  IMPORTANT: This file MUST stay at the root of the repo      ║
 * ║  (same level as index.html) for FCM push to work.            ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// Import Firebase compat scripts (must match version in index.html)
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js');

// ── Firebase config — must exactly match index.html ───────────────────────
firebase.initializeApp({
  apiKey:            "AIzaSyCjEmse8_GdpIpopS5zVAvL-s3_J_YLmts",
  authDomain:        "pause4paws-82dca.firebaseapp.com",
  projectId:         "pause4paws-82dca",
  storageBucket:     "pause4paws-82dca.firebasestorage.app",
  messagingSenderId: "30091779526",
  appId:             "1:30091779526:web:71c2a9a7776127142ea6c7"
});

const messaging = firebase.messaging();

// ── Background message handler ────────────────────────────────────────────
// Fires when app is in the background or tab is closed
messaging.onBackgroundMessage(payload => {
  console.log('[FCM SW] Background message received:', payload);

  const data         = payload.data         || {};
  const notification = payload.notification || {};

  const title = notification.title || data.title || '🐾 Pause4Paws Alert';
  const body  = notification.body  || data.body  || 'Activity in your community — tap to view';
  const petId = data.petId || null;

  const options = {
    body,
    icon:     '/pause4paws_logo.png',
    badge:    '/pause4paws_logo.png',
    tag:      petId ? `p4p-pet-${petId}` : 'p4p-alert',
    renotify: true,
    vibrate:  [200, 100, 200],
    data:     { petId, url: petId ? `/?pet=${petId}` : '/' },
    actions: [
      { action: 'view',    title: '🗺️ View on map' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  return self.registration.showNotification(title, options);
});

// ── Notification click (background) ──────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const petId  = event.notification.data?.petId;
  const target = petId
    ? 'https://pause4paws.github.io/pause4paws/?pet=' + petId
    : 'https://pause4paws.github.io/pause4paws/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // If app tab is already open — focus it and tell it to open the pet
      for (const client of list) {
        if (client.url.includes('pause4paws') && 'focus' in client) {
          client.focus();
          if (petId) client.postMessage({ type: 'OPEN_PET', petId });
          return;
        }
      }
      // Otherwise open a new tab
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
