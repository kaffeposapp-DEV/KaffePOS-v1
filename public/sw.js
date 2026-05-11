const CACHE_VERSION = 'kaffepos-offline-shell-v1';
const APP_SHELL_CACHE = `${CACHE_VERSION}:shell`;
const STATIC_CACHE = `${CACHE_VERSION}:static`;
const OFFLINE_FALLBACK_URL = '/offline.html';

const APP_SHELL_URLS = [
  '/',
  '/index.html',
  OFFLINE_FALLBACK_URL,
  '/favicon.svg',
];

function shouldBypassRequest(request) {
  const url = new URL(request.url);
  if (request.method !== 'GET') return true;
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith('/api/')) return true;
  if (url.pathname === '/api') return true;
  if (url.pathname.startsWith('/health')) return true;
  return false;
}

function isStaticAssetRequest(request) {
  return ['script', 'style', 'image', 'font', 'manifest'].includes(request.destination);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('kaffepos-offline-shell-') && !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function handleNavigationRequest(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(APP_SHELL_CACHE);
    cache.put('/index.html', response.clone());
    return response;
  } catch {
    const cache = await caches.open(APP_SHELL_CACHE);
    return (await cache.match('/index.html'))
      || (await cache.match(OFFLINE_FALLBACK_URL))
      || Response.error();
  }
}

async function handleStaticAssetRequest(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (shouldBypassRequest(request)) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  if (isStaticAssetRequest(request)) {
    event.respondWith(handleStaticAssetRequest(request));
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'KaffePOS', message: event.data ? event.data.text() : 'Notifikasi baru' };
  }

  const title = payload.title || 'KaffePOS';
  const options = {
    body: payload.message || payload.body || 'Notifikasi baru',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: {
      url: payload.url || '/',
      notificationId: payload.id || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ('focus' in client) {
            client.postMessage({ type: 'kaffepos-open-notifications' });
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
