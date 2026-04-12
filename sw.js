// sw.js  ── Pause4Paws PWA Service Worker
// Place this in the ROOT of your GitHub Pages repo
// ──────────────────────────────────────────────────

const CACHE_NAME = 'p4p-v3';
const PRECACHE = [
  '/pause4paws/',
  '/pause4paws/index.html',
  '/pause4paws/manifest.json',
  '/pause4paws/pause4paws_logo.png',
  '/pause4paws/wio-qr.png'
];

// ── INSTALL: cache shell assets ───────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// ── ACTIVATE: remove old caches ───────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH: network-first for API, cache-first for assets ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always fetch Firebase / Cloudinary / Leaflet from network
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('cloudinary') ||
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('api.telegram.org')
  ) {
    return; // browser handles it normally
  }

  // For our own assets: try cache first, fall back to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        // Cache successful GET responses for our domain
        if (
          response.ok &&
          event.request.method === 'GET' &&
          url.hostname.includes('github.io')
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Offline fallback for navigation requests
      if (event.request.mode === 'navigate') {
        return caches.match('/pause4paws/index.html');
      }
    })
  );
});

// ── PUSH: forwarded from FCM when app is in foreground ────
// (Background messages handled in firebase-messaging-sw.js)
self.addEventListener('push', event => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const { title, body, icon, image, url } = payload.notification || payload.data || {};
    event.waitUntil(
      self.registration.showNotification(title || '🐾 Pause4Paws', {
        body:  body  || 'New activity in your community.',
        icon:  icon  || '/pause4paws/pause4paws_logo.png',
        image: image || undefined,
        data:  { url: url || 'https://pause4paws.github.io/pause4paws/' },
        requireInteraction: true
      })
    );
  } catch(e) { console.warn('[SW] Push parse error:', e); }
});
