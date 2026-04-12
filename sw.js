// sw.js — Pause4Paws PWA Service Worker
// Upload to root of GitHub repo (same folder as index.html)

const CACHE = 'p4p-v3';
const SHELL = [
  '/pause4paws/',
  '/pause4paws/index.html',
  '/pause4paws/manifest.json',
  '/pause4paws/pause4paws_logo.png',
  '/pause4paws/wio-qr.png'
];

self.addEventListener('install',  e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Pass through external APIs
  if (['firestore.googleapis.com','firebase','cloudinary','unpkg.com','fonts.googleapis','api.telegram.org','gstatic.com'].some(h => url.hostname.includes(h))) return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).catch(() => {
      if (event.request.mode === 'navigate') return caches.match('/pause4paws/index.html');
    }))
  );
});
