/* ==========================================================================
   ABSTRACT HUB — service worker
   Generated at build time; APP_VERSION is substituted below.

   Scope is deliberately narrow. This caches the application shell so the app
   launches with no network, and nothing else:

     - library.enc is NOT cached here. The app stores it in IndexedDB and does
       its own conditional GET, so caching it twice would double the storage
       for no benefit and would let a stale SW cache override a fresh library.
     - Only same-origin GET requests are considered. There are no cross-origin
       requests to intercept, and refusing to handle them keeps this worker
       from ever becoming a proxy for something it should not touch.
   ========================================================================== */
'use strict';

const VERSION = '1.4';
const CACHE = `abstract-hub-shell-v${VERSION}`;

/* The shell. Everything needed to boot to the lock screen offline. */
const SHELL = ['./', './index.html', './manifest.json', './icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('abstract-hub-shell-') && k !== CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The encrypted library is the app's business, not the cache's.
  if (url.pathname.endsWith('/library.enc')) return;

  /* Stale-while-revalidate: paint instantly from cache, quietly refresh behind
     it. A shell update therefore lands on the next launch, and the in-app
     version banner tells the user when that has happened. */
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });

    const network = fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === 'basic') {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      })
      .catch(() => null);

    if (cached) return cached;

    const fresh = await network;
    if (fresh) return fresh;

    // Offline with nothing cached: fall back to the shell for navigations.
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
