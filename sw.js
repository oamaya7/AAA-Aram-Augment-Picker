/* Tiny service worker for ARAM Augment Advisor
   - Caches app shell and JSON you load in Data Manager
   - Caches Data Dragon requests (versions.json, champion.json, icons)
   - Strategies:
     * navigation + same-origin: stale-while-revalidate
     * ddragon icons: cache-first (revalidate in background)
*/

const SW_VERSION = "v1.0.4";
const SHELL_CACHE = `shell-${SW_VERSION}`;
const DDRAGON_CACHE = `ddragon-${SW_VERSION}`;

const SHELL_ASSETS = [
  "./", // if hosted at domain root
  "./index.html"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== DDRAGON_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isDDragon(url) {
  return url.host === "ddragon.leagueoflegends.com";
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Data Dragon: cache-first with background refresh
  if (isDDragon(url)) {
    event.respondWith(cacheFirstWithRefresh(event.request, DDRAGON_CACHE));
    return;
  }

  // Same-origin navigations and resources: stale-while-revalidate
  if (event.request.method === "GET" && url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event.request, SHELL_CACHE));
    return;
  }

  // Fallback to network
  event.respondWith(fetch(event.request));
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((res) => {
      if (res && res.status === 200) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || networkPromise;
}

async function cacheFirstWithRefresh(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.status === 200) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || new Response("", { status: 504 });
}
