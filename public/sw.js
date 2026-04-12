const CACHE_VERSION = 'v3';
const APP_CACHE = `salat-mawaqit-app-${CACHE_VERSION}`;
const DATA_CACHE = `salat-mawaqit-data-${CACHE_VERSION}`;
const CACHE_PREFIX = 'salat-mawaqit-';
const APP_SHELL_ASSETS = ['/', '/index.html', '/manifest.json'];

async function putInCache(cacheName, request, response) {
  if (!response || !response.ok) {
    return response;
  }

  const cache = await caches.open(cacheName);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName, fallbackUrl) {
  try {
    const networkResponse = await fetch(request);
    return putInCache(cacheName, request, networkResponse);
  } catch {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    if (fallbackUrl) {
      const fallbackResponse = await caches.match(fallbackUrl);
      if (fallbackResponse) {
        return fallbackResponse;
      }
    }

    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cachedResponse = await caches.match(request);

  const networkPromise = fetch(request)
    .then((networkResponse) => putInCache(cacheName, request, networkResponse))
    .catch(() => null);

  return cachedResponse || networkPromise;
}

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetch(request);
  return putInCache(APP_CACHE, request, networkResponse);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name.startsWith(CACHE_PREFIX))
          .filter((name) => name !== APP_CACHE && name !== DATA_CACHE)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const request = event.request;
  const url = new URL(request.url);
  const isApiRequest = url.hostname.includes('api.aladhan.com');
  const isNavigation = request.mode === 'navigate';
  const isStaticAsset =
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/assets/') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.ico') ||
      url.pathname.endsWith('.woff2'));

  if (isNavigation) {
    event.respondWith(networkFirst(request, APP_CACHE, '/index.html'));
    return;
  }

  if (isApiRequest) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  if (isStaticAsset) {
    event.respondWith(staleWhileRevalidate(request, APP_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
  }
});
