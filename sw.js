/*
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Pause4Paws — Service Worker                                 ║
 * ║  © 2025 Pause4Paws. All rights reserved.                     ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Strategy:
 *  - App shell (HTML, CSS, JS) → Network first, fallback to cache
 *  - Images (Cloudinary) → Cache first, fallback to network
 *  - Map tiles (CartoDB) → Cache first, 7-day expiry
 *  - Firebase / API calls → Network only (never cache)
 */

const CACHE_NAME    = 'p4p-v4';
const TILE_CACHE    = 'p4p-tiles-v2';
const IMG_CACHE     = 'p4p-images-v2';

const SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pause4paws_logo.png',
  '/wio-qr.png',
];

// ── INSTALL: pre-cache the app shell ──────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(SHELL_FILES).catch(err => {
        console.warn('[SW] Shell pre-cache partial fail:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean up old caches ─────────────────────────────────────────
self.addEventListener('activate', event => {
  const CURRENT = [CACHE_NAME, TILE_CACHE, IMG_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => !CURRENT.includes(k)).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: routing strategy ────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never intercept: Firebase, Cloudinary uploads, APIs, chrome-extension
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebase.google.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('api.cloudinary.com') ||
    url.hostname.includes('api.telegram.org') ||
    url.hostname.includes('api.clarifai.com') ||
    url.hostname.includes('api.qrserver.com') ||
    url.protocol === 'chrome-extension:' ||
    event.request.method !== 'GET'
  ) {
    return; // let browser handle normally
  }

  // Map tiles — cache first, 7 days
  if (url.hostname.includes('basemaps.cartocdn.com') ||
      url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(tileStrategy(event.request));
    return;
  }

  // Cloudinary images — cache first
  if (url.hostname.includes('res.cloudinary.com')) {
    event.respondWith(imageStrategy(event.request));
    return;
  }

  // App shell — network first, fallback to cache
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirstStrategy(event.request));
    return;
  }
});

// ── STRATEGIES ────────────────────────────────────────────────────────────

async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match('/index.html'); // offline fallback
  }
}

async function tileStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(TILE_CACHE);
      // Limit tile cache to 500 entries
      const keys = await cache.keys();
      if (keys.length > 500) cache.delete(keys[0]);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}

async function imageStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(IMG_CACHE);
      // Limit image cache to 200 entries
      const keys = await cache.keys();
      if (keys.length > 200) cache.delete(keys[0]);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}

// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: '🐾 Pause4Paws Alert', body: 'Activity in your community' };
  try {
    if (event.data) data = event.data.json();
  } catch(e) {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body:    data.body  || 'Tap to view the map',
    icon:    '/pause4paws_logo.png',
    badge:   '/pause4paws_logo.png',
    tag:     data.petId || 'p4p-alert',
    renotify: true,
    vibrate: [200, 100, 200],
    data:    { petId: data.petId || null, url: '/' },
    actions: [
      { action: 'view',    title: 'View on map' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── NOTIFICATION CLICK ────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const petId  = event.notification.data?.petId;
  const target = petId ? `/?pet=${petId}` : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Focus existing tab if open
      for (const client of list) {
        if (client.url.includes('pause4paws') && 'focus' in client) {
          client.focus();
          if (petId) client.postMessage({ type: 'OPEN_PET', petId });
          return;
        }
      }
      // Open new tab
      return clients.openWindow(target);
    })
  );
});

// ── BACKGROUND SYNC (future) ──────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'p4p-sync-reports') {
    console.log('[SW] Background sync triggered');
    // Future: sync queued offline reports
  }
});
