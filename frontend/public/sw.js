/**
 * Service Worker — mise en cache des pages principales + stratégie réseau-d'abord.
 */
const CACHE_NAME = "palmeraie-v1";
const SHELL_URLS = [
  "/",
  "/index.html",
  "/dashboard",
  "/recoltes",
  "/travaux",
  "/personnel",
  "/secteurs",
  "/materiels",
];

// Installation : mise en cache du shell applicatif
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

// Activation : purge des anciens caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch : réseau d'abord, cache en repli pour les navigations
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // On ne met PAS en cache les requêtes API (elles passent toujours par le réseau)
  if (request.url.includes("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  // Pour les navigations (HTML) : réseau d'abord, sinon index.html en cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/index.html").then((r) => r || caches.match("/"))
      )
    );
    return;
  }

  // Assets statiques : cache d'abord, réseau en repli
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
