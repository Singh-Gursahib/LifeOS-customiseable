/* LifeOS service worker — cache-first for static assets ONLY.
   Rendered pages are never cached: each one is built for whichever vault the
   session unlocked, so a stored copy could be replayed into the other one. */
const VERSION = "lifeos-v3";
const STATIC = ["/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never cache API calls

  // static assets: cache-first
  if (url.pathname.startsWith("/_next/static/") || STATIC.includes(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copy));
            return res;
          })
      )
    );
    return;
  }

  // pages: always straight to the network, never stored. Offline shows the
  // browser's own error rather than a stale page from a vault you may have left.
});
