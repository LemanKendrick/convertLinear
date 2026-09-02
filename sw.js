// Bump this on every deploy so old clients pick up the new cache and shed the old one.
const CACHE_VERSION = 'linear-converter-v2';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

// Cache the app shell up front so the first offline load has something to show.
// Cached individually (not cache.addAll) so one missing/renamed file - e.g. a
// filename casing mismatch, which is easy to hit deploying from Windows
// (case-insensitive) to GitHub Pages (case-sensitive) - doesn't abort the
// whole install and leave the service worker stuck failing to register.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('Service worker: could not cache', url, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// Drop any caches from older versions of this app.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Network-first with cache:'no-store' so we never get a stale copy served
// back to us from the browser's own HTTP cache while checking for updates.
// Falls back to the cached copy only when the network request fails
// (i.e. offline), which is what actually makes this work without a
// connection in the shop.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((networkResponse) => {
        const copy = networkResponse.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        return networkResponse;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          return caches.match('./index.html').then((shell) => {
            if (shell) return shell;
            // nothing cached at all (e.g. very first load, offline, cache
            // failed) - fail the request explicitly rather than resolving
            // to undefined, which the Fetch API can't handle.
            return new Response('Offline and no cached copy available.', {
              status: 503,
              statusText: 'Offline',
              headers: { 'Content-Type': 'text/plain' }
            });
          });
        })
      )
  );
});
