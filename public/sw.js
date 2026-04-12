const CACHE_VERSION = 'v3';
const APP_CACHE = `salat-mawaqit-app-${CACHE_VERSION}`;
const DATA_CACHE = `salat-mawaqit-data-${CACHE_VERSION}`;
const META_CACHE = `salat-mawaqit-meta-${CACHE_VERSION}`;
const CACHE_PREFIX = 'salat-mawaqit-';
const APP_SHELL_ASSETS = ['/', '/index.html', '/manifest.json'];
const SALAT_NAMES = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const SW_META_BASE = 'https://local.sw/';

function toMetaRequest(key) {
  return new Request(`${SW_META_BASE}${key}`);
}

async function writeMeta(key, value) {
  const cache = await caches.open(META_CACHE);
  await cache.put(
    toMetaRequest(key),
    new Response(JSON.stringify(value), {
      headers: { 'content-type': 'application/json' },
    })
  );
}

async function readMeta(key) {
  const cache = await caches.open(META_CACHE);
  const response = await cache.match(toMetaRequest(key));
  if (!response) return null;
  return response.json();
}

function prayerLabel(name, language) {
  const labels = {
    en: { Fajr: 'Fajr', Dhuhr: 'Dhuhr', Asr: 'Asr', Maghrib: 'Maghrib', Isha: 'Isha' },
    fr: { Fajr: 'Fajr', Dhuhr: 'Dhuhr', Asr: 'Asr', Maghrib: 'Maghrib', Isha: 'Isha' },
    ar: { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' },
  };

  const lang = language === 'ar' || language === 'en' || language === 'fr' ? language : 'en';
  return labels[lang][name] || name;
}

function parseApiTime(timeValue, baseDate) {
  const normalized = String(timeValue).split(' ')[0]?.trim() || String(timeValue);
  const [h, m] = normalized.split(':').map((v) => Number(v));
  const date = new Date(baseDate);
  date.setHours(h, m, 0, 0);
  return date;
}

async function checkPrayerNotifications() {
  const config = await readMeta('prayer-config');
  if (!config?.notificationsEnabled || !config?.location) {
    return;
  }

  const now = new Date();
  const date = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
  const url = `https://api.aladhan.com/v1/timings/${date}?latitude=${config.location.latitude}&longitude=${config.location.longitude}&method=${config.method || 21}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.code !== 200) {
      return;
    }

    const timings = data.data.timings;
    for (const name of SALAT_NAMES) {
      const offset = Number(config.prayerOffsets?.[name] || 0);
      const prayerDate = parseApiTime(timings[name], now);
      prayerDate.setMinutes(prayerDate.getMinutes() + offset);

      const diff = Math.abs(now.getTime() - prayerDate.getTime());
      if (diff > 60 * 1000) {
        continue;
      }

      const prayerKey = `${prayerDate.toISOString().slice(0, 16)}-${name}`;
      const last = await readMeta('last-prayer-notification');
      if (last?.key === prayerKey) {
        return;
      }

      await self.registration.showNotification('Salat Mawaqit', {
        body: `${prayerLabel(name, config.language)} - Time now`,
        tag: `prayer-${prayerKey}`,
        renotify: true,
      });
      await writeMeta('last-prayer-notification', { key: prayerKey });
      return;
    }
  } catch (err) {
    console.error('Background prayer notification failed', err);
  }
}

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
          .filter((name) => name !== APP_CACHE && name !== DATA_CACHE && name !== META_CACHE)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'PRAYER_CONFIG') {
    event.waitUntil(writeMeta('prayer-config', event.data.payload));
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'prayer-check') {
    event.waitUntil(checkPrayerNotifications());
  }
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Salat Mawaqit',
    body: 'Prayer time reminder',
  };

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = {
        title: 'Salat Mawaqit',
        body: event.data.text(),
      };
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Salat Mawaqit', {
      body: payload.body || 'Prayer time reminder',
      tag: payload.tag || 'salat-reminder',
      data: payload,
      renotify: true,
      icon: '/icon.png',
      badge: '/icon.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) {
        return clients[0].focus();
      }
      return self.clients.openWindow('/');
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const request = event.request;
  const url = new URL(request.url);
  const isApiRequest = url.hostname.includes('api.aladhan.com');
  const isLocalApiRequest = url.origin === self.location.origin && url.pathname.startsWith('/api/');
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

  if (isLocalApiRequest) {
    return;
  }

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
