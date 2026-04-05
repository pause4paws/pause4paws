// Pause4Paws Service Worker - v3 - CACHE DISABLED
// This SW intentionally does NOT cache anything.
// All requests go straight to the network so updates deploy instantly.

const SW_VERSION = 'v3-no-cache';

self.addEventListener('install', function(event) {
  // Skip waiting so this SW activates immediately
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    // Delete ALL old caches
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          console.log('[SW] Deleting cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(function() {
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  // Pass ALL requests directly to network - no caching
  event.respondWith(fetch(event.request));
});
