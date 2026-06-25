// Service worker for gamemds.org — enables offline reading after first load.

const CACHE_NAME = 'gamemds-v3';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/reader.html',
  '/404.html',
  '/marked.js',
  '/guides.json',
  '/assets/css/index.css',
  '/assets/css/reader.css',
  '/assets/js/index.js',
  '/assets/js/reader.js',
  '/assets/fonts/final_fantasy_36_font.woff',
  '/assets/fonts/final_fantasy_36_font.ttf'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(cacheFirst(request, url));
});

async function cacheFirst(request, url) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // If offline and not cached, return a simple offline message for HTML pages
    if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
      return new Response(
        '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Offline</title></head>' +
        '<body style="font-family:system-ui,sans-serif;background:#0a0a2e;color:#ecedee;text-align:center;padding:60px;">' +
        '<h1>You are offline</h1><p>This page is not available offline. Try again when connected.</p></body></html>',
        { headers: { 'Content-Type': 'text/html' } }
      );
    }
    throw err;
  }
}
