/* LEED 26 service worker
 *
 * - App files (/_next/static, icons): cache first. Their names change on every build.
 * - Pages: network first, falling back to the last copy seen on this phone, then /offline.
 *   That is what lets a judge keep scoring after the signal drops.
 * - /api: never cached. Scores made offline are queued by the page itself
 *   (lib/offlineQueue.ts) and sent when the connection returns.
 *
 * Bump VERSION to force every installed phone to drop its old caches.
 */
const VERSION = 'v2';
const STATIC_CACHE = `leed26-static-${VERSION}`;
const PAGES_CACHE = `leed26-pages-${VERSION}`;
const PRECACHE = ['/offline', '/icons/icon-192.png', '/brand/leed-logo-small.webp'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGES_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n.startsWith('leed26-') && n !== STATIC_CACHE && n !== PAGES_CACHE).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request, isNavigation) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const res = await fetch(request);
    // Only keep good, same-origin, non-redirected responses.
    if (res.ok && res.type === 'basic' && !res.redirected) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    if (isNavigation) {
      const offline = await cache.match('/offline');
      if (offline) return offline;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/sw.js') return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request, request.mode === 'navigate'));
});
