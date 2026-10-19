/* Saks Admin Hub — service worker
   Cache-first for the app shell. Google Apps Script requests are never
   cached or intercepted; they must always go to the network so the sync
   queue gets a truthful answer. Bump CACHE after editing index.html.

   Only caches whose names start with "adminhub-" are ever deleted, so this
   app and the ATOT app can share the tshadrixccboe.github.io origin
   without wiping each other's offline copy. */
const PREFIX = "adminhub-";
const CACHE = PREFIX + "v1";
const ASSETS = [
  "./", "./index.html", "./manifest.json", "./guide.html",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-180.png", "./icons/saks-logo.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;                       // never touch the sync POSTs
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;             // never touch script.google.com
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      if (hit) {
        fetch(req).then(res => {
          if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(req).then(res => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() =>
        req.mode === "navigate" ? caches.match("./index.html") : new Response("", { status: 504 }));
    })
  );
});
